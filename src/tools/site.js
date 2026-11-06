/**
 * wp_site — connection, identity, health and site-wide settings.
 */

import { resolveWoo } from "../config.js";
import { summarizeUser } from "../summaries.js";
import {
  ensureAllowed,
  guarded,
  jsonOutput,
  mergeData,
  objectParam,
  ok,
} from "./common.js";

const ACTIONS = ["info", "health", "settings_get", "settings_update"];

const CAPABILITY_KEYS = [
  "manage_options",
  "edit_posts",
  "publish_posts",
  "upload_files",
  "edit_theme_options",
  "activate_plugins",
  "install_plugins",
  "switch_themes",
  "manage_woocommerce",
  "edit_others_posts",
];

function capabilitiesOf(user) {
  const capabilities = user?.capabilities ?? {};
  const selected = {};
  for (const key of CAPABILITY_KEYS) {
    if (Object.hasOwn(capabilities, key)) selected[key] = capabilities[key];
  }
  return selected;
}

async function probeBridge(client) {
  try {
    const status = await client.bridge("/status");
    return { installed: true, version: status?.version, wordpress: status?.wordpress };
  } catch {
    return { installed: false };
  }
}

async function probeWoo(client, config) {
  const woo = resolveWoo(config);
  if (!woo.configured) return { configured: false, reachable: false };
  try {
    await client.woo("/products", { query: { per_page: 1, _fields: "id" } });
    return { configured: true, reachable: true };
  } catch (error) {
    return { configured: true, reachable: false, error: error?.message };
  }
}

export function siteTool({ client, config, i18n }) {
  return {
    name: "wp_site",
    description: i18n.t("tool.site"),
    parameters: {
      action: {
        type: "string",
        required: true,
        enum: ACTIONS,
        description:
          "info: connection + user + feature report. health: latency probe. settings_get: read site settings. settings_update: change site settings (administrator).",
      },
      settings: {
        type: "object",
        additionalProperties: true,
        description:
          "settings_update only. Any writable field accepted by /wp/v2/settings, e.g. title, description, show_on_front, page_on_front, page_for_posts, posts_per_page, timezone, date_format, default_category.",
      },
    },
    output: jsonOutput,
    execute: guarded(async (args, exec) => {
      const action = ensureAllowed(args.action, ACTIONS, "action", i18n, "site");

      if (action === "info") {
        const root = await client.root();
        const me = await client.wp("/wp/v2/users/me", {
          query: { context: "edit" },
          signal: exec?.signal,
        });
        const [woocommerce, bridge] = await Promise.all([
          probeWoo(client, config),
          probeBridge(client),
        ]);
        return ok(
          {
            site: {
              name: root?.name,
              description: root?.description,
              url: root?.url,
              home: root?.home,
              gmt_offset: root?.gmt_offset,
            },
            user: { ...summarizeUser(me), capabilities: capabilitiesOf(me) },
            features: {
              woocommerce,
              bridge,
              namespaces: root?.namespaces ?? [],
              authentication: root?.authentication ?? [],
            },
          },
          { action },
        );
      }

      if (action === "health") {
        const started = Date.now();
        const root = await client.root();
        const authenticated = await client
          .wp("/wp/v2/posts", { query: { per_page: 1, _fields: "id" }, signal: exec?.signal })
          .then(() => true)
          .catch((error) => {
            if (error?.status === 401 || error?.status === 403) return false;
            throw error;
          });
        return ok(
          {
            reachable: true,
            authenticated,
            latencyMs: Date.now() - started,
            site: root?.name,
            restNamespaces: (root?.namespaces ?? []).length,
          },
          { action },
        );
      }

      if (action === "settings_get") {
        const settings = await client.wp("/wp/v2/settings", { signal: exec?.signal });
        return ok(settings, { action });
      }

      const data = objectParam(args.settings, i18n, "settings");
      if (Object.keys(data).length === 0) {
        return ok(
          {
            changed: false,
            message: "No settings supplied. Pass at least one field in `settings`.",
          },
          { action },
        );
      }
      const updated = await client.wp("/wp/v2/settings", {
        method: "POST",
        body: mergeData({}, data),
        signal: exec?.signal,
      });
      return ok(updated, { action, changed: true });
    }),
    presentCall: (args) => ({
      card: "generic",
      title: `WordPress site: ${args.action}`,
      kind: args.action === "settings_update" ? "execute" : "read",
    }),
  };
}
