/**
 * Minimal WordPress / WooCommerce REST client.
 *
 * Design notes:
 * - Zero runtime dependencies; uses the global fetch available in Node 22+.
 * - Authentication uses WordPress application passwords (HTTP Basic). Secrets
 *   are read from config or environment at call time and never placed in URLs
 *   or error messages.
 * - 429/5xx responses are retried with backoff and Retry-After support, which
 *   matters on shared hosting where WooCommerce pages are slow to warm up.
 */

import { resolveCredentials, resolveWoo } from "./config.js";

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const RETRYABLE_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENOTFOUND",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
]);

export class WpError extends Error {
  constructor(message, { code = "wp_error", status, hint, path, cause } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "WpError";
    this.code = code;
    this.status = status;
    this.hint = hint;
    this.path = path;
  }
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function retryDelayMs(attempt, retryAfterHeader) {
  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds, 30) * 1000;
    const date = Date.parse(retryAfterHeader);
    if (Number.isFinite(date)) return Math.max(0, Math.min(date - Date.now(), 30_000));
  }
  return 400 * 2 ** attempt + Math.floor(Math.random() * 250);
}

function basicAuth(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}

function encodeQuery(query = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) params.set(key, value.join(","));
    else params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded === "" ? "" : `?${encoded}`;
}

function statusHint(i18n, status) {
  if (status === 401) return i18n.t("hint.unauthorized");
  if (status === 403) return i18n.t("hint.forbidden");
  return undefined;
}

export class WpClient {
  constructor(config, i18n) {
    this.config = config;
    this.i18n = i18n;
  }

  get siteUrl() {
    return this.config.siteUrl;
  }

  requireSite() {
    if (!this.siteUrl) {
      throw new WpError(this.i18n.t("err.missingSite"), {
        code: "wp_not_configured",
        hint: this.i18n.t("hint.setup"),
      });
    }
  }

  auth() {
    const credentials = resolveCredentials(this.config);
    if (!credentials.username || !credentials.hasAppPassword) {
      throw new WpError(this.i18n.t("err.missingAuth"), {
        code: "wp_auth_missing",
        hint: this.i18n.t("hint.setup"),
      });
    }
    return {
      username: credentials.username,
      header: basicAuth(credentials.username, credentials.appPassword),
    };
  }

  wooAuth() {
    const woo = resolveWoo(this.config);
    if (!woo.configured) {
      throw new WpError(this.i18n.t("err.wooNotConfigured"), {
        code: "woo_not_configured",
        hint: this.i18n.t("hint.setup"),
      });
    }
    return { header: basicAuth(woo.key, woo.secret) };
  }

  async request(option) {
    const {
      base,
      path,
      method = "GET",
      query,
      body,
      signal,
      headers = {},
      auth = "wp",
      meta = false,
      raw = false,
    } = option;

    this.requireSite();
    const authorization = auth === "woo" ? this.wooAuth().header : this.auth().header;

    const url = `${this.siteUrl}/wp-json${base}${path}${encodeQuery(query)}`;
    const requestHeaders = {
      accept: "application/json",
      authorization,
      "user-agent": "dsh-wordpress-admin/0.1.0",
      ...headers,
    };
    let payload;
    if (body !== undefined) {
      if (raw) {
        payload = body;
      } else {
        requestHeaders["content-type"] = "application/json";
        payload = JSON.stringify(body);
      }
    }

    const retries = this.config.maxRetries;
    for (let attempt = 0; ; attempt += 1) {
      const timeout = AbortSignal.timeout(this.config.timeoutMs);
      const combined = signal === undefined ? timeout : AbortSignal.any([timeout, signal]);

      let response;
      try {
        response = await fetch(url, {
          method,
          headers: requestHeaders,
          body: payload,
          signal: combined,
          redirect: "follow",
        });
      } catch (error) {
        if (signal?.aborted) throw error;
        const code = error?.cause?.code ?? error?.code ?? "";
        const timedOut = error?.name === "TimeoutError";
        if (attempt < retries && (timedOut || RETRYABLE_CODES.has(code))) {
          await sleep(retryDelayMs(attempt), signal);
          continue;
        }
        if (timedOut) {
          throw new WpError(this.i18n.t("err.timeout", { ms: this.config.timeoutMs }), {
            code: "wp_timeout",
            hint: this.i18n.t("hint.setup"),
            cause: error,
          });
        }
        throw new WpError(this.i18n.t("err.network", { message: error?.message ?? String(error) }), {
          code: "wp_network",
          hint: this.i18n.t("hint.setup"),
          cause: error,
        });
      }

      if (RETRYABLE_STATUS.has(response.status) && attempt < retries) {
        await response.body?.cancel?.().catch(() => {});
        await sleep(
          retryDelayMs(attempt, response.headers.get("retry-after")),
          signal,
        );
        continue;
      }

      const text = await response.text();
      const contentType = response.headers.get("content-type") ?? "";
      let parsed;
      if (text !== "" && contentType.includes("json")) {
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = undefined;
        }
      }

      if (response.ok) {
        const data = text === "" || response.status === 204 ? null : (parsed ?? text);
        if (!meta) return data;
        const total = Number.parseInt(response.headers.get("x-wp-total") ?? "", 10);
        const totalPages = Number.parseInt(response.headers.get("x-wp-totalpages") ?? "", 10);
        return {
          data,
          total: Number.isFinite(total) ? total : undefined,
          totalPages: Number.isFinite(totalPages) ? totalPages : undefined,
        };
      }

      const wpError = parsed && typeof parsed === "object" ? parsed : undefined;
      const status = response.status;
      const wpMessage = wpError?.message ? String(wpError.message) : "";
      const hint = statusHint(this.i18n, status);

      if (!contentType.includes("json")) {
        throw new WpError(this.i18n.t("err.restUnavailable"), {
          code: "wp_rest_unavailable",
          status,
          hint: this.i18n.t("hint.restUnavailable"),
          path,
        });
      }
      if (status === 401) {
        throw new WpError(this.i18n.t("err.unauthorized"), {
          code: wpError?.code ?? "wp_unauthorized",
          status,
          hint,
          path,
        });
      }
      if (status === 403) {
        throw new WpError(this.i18n.t("err.forbidden"), {
          code: wpError?.code ?? "wp_forbidden",
          status,
          hint,
          path,
        });
      }
      if (status === 404) {
        throw new WpError(this.i18n.t("err.notFound", { path }), {
          code: wpError?.code ?? "wp_not_found",
          status,
          hint,
          path,
        });
      }
      throw new WpError(
        this.i18n.t("err.http", { status, message: wpMessage || response.statusText }),
        { code: wpError?.code ?? "wp_http_error", status, hint, path },
      );
    }
  }

  /** Core REST route, e.g. wp("/wp/v2/posts"). */
  wp(path, options = {}) {
    return this.request({ ...options, base: "", path, auth: "wp" });
  }

  /** WooCommerce REST route, e.g. woo("/products"). */
  woo(path, options = {}) {
    return this.request({ ...options, base: "/wc/v3", path, auth: "woo" });
  }

  /** Bridge plugin route, e.g. bridge("/status"). */
  bridge(path, options = {}) {
    return this.request({ ...options, base: "/dsh-bridge/v1", path, auth: "wp" });
  }

  /** WordPress REST root: site identity and available namespaces, unauthenticated. */
  async root() {
    this.requireSite();
    const response = await fetch(`${this.siteUrl}/wp-json/`, {
      headers: { accept: "application/json", "user-agent": "dsh-wordpress-admin/0.1.0" },
      signal: AbortSignal.timeout(this.config.timeoutMs),
      redirect: "follow",
    });
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new WpError(this.i18n.t("err.restUnavailable"), {
        code: "wp_rest_unavailable",
        status: response.status,
        hint: this.i18n.t("hint.restUnavailable"),
      });
    }
  }
}

/** Pagination helper shared by list actions. */
export function paginationQuery(args, config) {
  const perPage = Math.min(
    Math.max(Number.parseInt(String(args.per_page ?? config.perPageDefault), 10) || config.perPageDefault, 1),
    100,
  );
  const page = Math.max(Number.parseInt(String(args.page ?? 1), 10) || 1, 1);
  return { page, per_page: perPage };
}
