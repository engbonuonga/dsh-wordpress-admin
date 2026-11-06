/**
 * Configuration normalization for dsh-wordpress-admin.
 *
 * The Cordis row's `config` object is user-authored YAML, so every value is
 * validated and coerced here instead of being trusted at call sites. Secrets
 * may be written inline, but environment indirection is preferred because the
 * profile patch is stored in plain text.
 */

const DEFAULTS = Object.freeze({
  siteUrl: "",
  username: "",
  appPassword: "",
  appPasswordEnv: "DSH_WP_APP_PASSWORD",
  wooConsumerKey: "",
  wooConsumerSecret: "",
  wooKeyEnv: "DSH_WOO_CONSUMER_KEY",
  wooSecretEnv: "DSH_WOO_CONSUMER_SECRET",
  locale: "auto",
  timeoutMs: 30_000,
  maxRetries: 2,
  allowDestructive: false,
  perPageDefault: 20,
});

function text(value, fallback) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed === "" ? fallback : trimmed;
}

function positiveInt(value, fallback, max) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(Math.floor(parsed), max);
}

/**
 * Normalize an origin-like URL: add a scheme when omitted, drop trailing
 * slashes and a trailing `/wp-json` segment so callers can append REST paths.
 */
export function normalizeSiteUrl(value) {
  const raw = text(value, "");
  if (raw === "") return "";
  let url = raw;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    const parsed = new URL(url);
    let pathname = parsed.pathname.replace(/\/+$/, "");
    pathname = pathname.replace(/\/wp-json$/i, "");
    parsed.pathname = pathname;
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

export function normalizeConfig(raw) {
  const config = raw && typeof raw === "object" ? raw : {};
  return {
    siteUrl: normalizeSiteUrl(config.siteUrl),
    username: text(config.username, ""),
    appPassword: text(config.appPassword, ""),
    appPasswordEnv: text(config.appPasswordEnv, DEFAULTS.appPasswordEnv),
    wooConsumerKey: text(config.wooConsumerKey, ""),
    wooConsumerSecret: text(config.wooConsumerSecret, ""),
    wooKeyEnv: text(config.wooKeyEnv, DEFAULTS.wooKeyEnv),
    wooSecretEnv: text(config.wooSecretEnv, DEFAULTS.wooSecretEnv),
    locale: resolveLocale(text(config.locale, DEFAULTS.locale)),
    timeoutMs: positiveInt(config.timeoutMs, DEFAULTS.timeoutMs, 120_000),
    maxRetries: positiveInt(config.maxRetries, DEFAULTS.maxRetries, 5),
    allowDestructive: config.allowDestructive === true,
    perPageDefault: positiveInt(config.perPageDefault, DEFAULTS.perPageDefault, 100),
  };
}

function systemLocale() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || "en";
  } catch {
    return "en";
  }
}

/** Resolve `auto` to the host locale, then collapse to one of the shipped catalogs. */
export function resolveLocale(value) {
  const requested = String(value || "auto").toLowerCase();
  const effective = requested === "auto" ? systemLocale() : requested;
  return effective.toLowerCase().startsWith("zh") ? "zh" : "en";
}

/** WordPress application passwords are displayed with spaces; both forms are valid. */
function compactSecret(value) {
  return String(value || "").replace(/\s+/g, "");
}

export function resolveCredentials(config) {
  const appPassword = config.appPassword || process.env[config.appPasswordEnv] || "";
  return {
    username: config.username,
    appPassword: compactSecret(appPassword),
    hasAppPassword: compactSecret(appPassword) !== "",
    passwordSource: config.appPassword ? "config" : config.appPasswordEnv,
  };
}

export function resolveWoo(config) {
  const key = config.wooConsumerKey || process.env[config.wooKeyEnv] || "";
  const secret = config.wooConsumerSecret || process.env[config.wooSecretEnv] || "";
  return {
    key: key.trim(),
    secret: secret.trim(),
    configured: key.trim() !== "" && secret.trim() !== "",
  };
}
