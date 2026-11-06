/**
 * dsh-wordpress-admin — a DeepSeek Harness host plugin that gives the agent
 * full WordPress and WooCommerce administration over the core REST API.
 *
 * The plugin registers five tools (wp_site, wp_content, wp_media, wp_shop,
 * wp_admin) on the harness `tools` service. Registration is deliberately
 * defensive: `@deepseek-ai/dsh-tools` resolves from the harness installation,
 * and a plain tool descriptor is used when the helper module is unavailable.
 */

import { normalizeConfig, resolveLocale } from "./config.js";
import { createMessages } from "./i18n.js";
import { WpClient } from "./wp.js";
import { siteTool } from "./tools/site.js";
import { contentTool } from "./tools/content.js";
import { mediaTool } from "./tools/media.js";
import { shopTool } from "./tools/shop.js";
import { adminTool } from "./tools/admin.js";

export const name = "dsh-wordpress-admin";

/** Host services used through `ctx.get()`; resolved lazily so a missing one is survivable. */
export const inject = [];

/** Build the tool descriptors for a configuration; exported for tests and embedding. */
export function createTools(config, i18n, client = new WpClient(config, i18n)) {
  const context = { client, config, i18n };
  return [
    siteTool(context),
    contentTool(context),
    mediaTool(context),
    shopTool(context),
    adminTool(context),
  ];
}

export function apply(ctx, rawConfig = {}) {
  const config = normalizeConfig(rawConfig);
  const i18n = createMessages(resolveLocale(config.locale));
  const specs = createTools(config, i18n);
  const disposers = [];

  const logger = (() => {
    try {
      return ctx?.logger?.("dsh-wordpress-admin") ?? ctx?.logger;
    } catch {
      return undefined;
    }
  })();

  const register = async (service) => {
    if (!service || typeof service.register !== "function") {
      logger?.warn?.("tools service is unavailable; wp_* tools were not registered");
      return;
    }

    let defineTool;
    try {
      ({ defineTool } = await import("@deepseek-ai/dsh-tools"));
    } catch {
      defineTool = (spec) => spec;
    }

    for (const spec of specs) {
      try {
        const handle = service.register(defineTool(spec));
        if (typeof handle === "function") disposers.push(handle);
        else if (typeof handle?.dispose === "function") disposers.push(() => handle.dispose());
      } catch (error) {
        logger?.warn?.(`failed to register ${spec.name}: ${error?.message ?? error}`);
      }
    }
  };

  const existing = ctx.get?.("tools");
  if (existing) {
    void register(existing);
  } else if (typeof ctx.inject === "function") {
    ctx.inject(["tools"], (sub) => {
      void register(sub.get?.("tools") ?? sub.tools);
    });
  } else {
    logger?.warn?.("no tools service and no inject support; wp_* tools were not registered");
  }

  return () => {
    for (const dispose of disposers.splice(0)) {
      try {
        dispose();
      } catch {
        /* a disposed service may already have dropped the registration */
      }
    }
  };
}
