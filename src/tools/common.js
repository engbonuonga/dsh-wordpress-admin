/**
 * Shared helpers for the wp_* tool definitions.
 */

import { WpError } from "../wp.js";

/** Output descriptor shared by every tool: pretty JSON is the model-facing value. */
export const jsonOutput = {
  schema: { type: "json" },
  render(_args, value) {
    return [{ type: "text", text: JSON.stringify(value, null, 2) }];
  },
};

export function ok(data, extra = {}) {
  return { ok: true, ...extra, data };
}

export function fail(message, { code = "wp_tool_error", hint } = {}) {
  throw new WpError(message, { code, hint });
}

export function requireParam(args, name, i18n) {
  const value = args?.[name];
  if (value === undefined || value === null || value === "") {
    fail(i18n.t("err.missingParam", { name }), { code: "wp_missing_param" });
  }
  return value;
}

export function ensureAllowed(value, allowed, kind, i18n, scope) {
  if (!allowed.includes(value)) {
    if (kind === "action") {
      fail(i18n.t("err.unsupportedAction", { resource: scope ?? allowed[0], action: value }), {
        code: "wp_bad_request",
      });
    }
    fail(i18n.t("err.unsupportedResource", { resource: value }), { code: "wp_bad_request" });
  }
  return value;
}

/** Destructive operations are opt-in so a chat mistake cannot delete production content. */
export function assertDestructive(config, i18n) {
  if (config.allowDestructive !== true) {
    fail(i18n.t("err.destructiveBlocked"), {
      code: "wp_destructive_blocked",
      hint: i18n.t("hint.setup"),
    });
  }
}

/** Workspace root of the calling agent, used for local media uploads. */
export function workspaceOf(exec) {
  return exec?.agent?.session?.header?.cwd;
}

/**
 * Wrap an execute handler so a WpError surfaces its hint as a second line.
 * Tool errors are shown to the model verbatim; the hint is the actionable part.
 */
export function guarded(handler) {
  return async (args, exec) => {
    try {
      return await handler(args, exec);
    } catch (error) {
      if (error instanceof WpError) {
        const suffix = error.hint ? `\nHint: ${error.hint}` : "";
        const wrapped = new Error(`${error.message}${suffix}`, { cause: error });
        wrapped.name = "WordPressError";
        throw wrapped;
      }
      throw error;
    }
  };
}

/** Coerce an optional object-or-JSON-string parameter into an object. */
export function objectParam(value, i18n, name = "data") {
  if (value === undefined || value === null || value === "") return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      /* fall through to the error below */
    }
    fail(i18n.t("err.badInput", { message: `\`${name}\` must be a JSON object` }), {
      code: "wp_bad_request",
    });
  }
  if (typeof value === "object" && !Array.isArray(value)) return value;
  fail(i18n.t("err.badInput", { message: `\`${name}\` must be an object` }), {
    code: "wp_bad_request",
  });
}

/** Merge explicit convenience fields over a free-form data object. */
export function mergeData(data, fields) {
  const merged = { ...data };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}
