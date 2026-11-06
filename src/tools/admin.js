/**
 * wp_admin — plugins, themes, block templates and (via the companion
 * dsh-bridge WordPress plugin) classic menus and theme locations.
 */

import {
  summarizeMenu,
  summarizePlugin,
  summarizeTemplate,
  summarizeTheme,
} from "../summaries.js";
import {
  assertDestructive,
  ensureAllowed,
  fail,
  guarded,
  jsonOutput,
  ok,
  objectParam,
  requireParam,
} from "./common.js";
import { WpError } from "../wp.js";

const ACTIONS = [
  "list",
  "get",
  "create",
  "update",
  "delete",
  "activate",
  "deactivate",
  "install",
  "items",
  "set_items",
  "locations",
];
const RESOURCES = ["plugins", "themes", "templates", "menus", "bridge"];

const ALLOWED = {
  plugins: ["list", "get", "install", "activate", "deactivate", "delete"],
  themes: ["list", "get", "activate"],
  templates: ["list", "get", "create", "update", "delete"],
  menus: ["list", "get", "create", "update", "delete", "items", "set_items", "locations"],
  bridge: ["get"],
};

function pluginId(args, i18n, { forInstall = false } = {}) {
  const raw = String(requireParam(args, "plugin", i18n)).trim().replace(/\.php$/, "");
  if (forInstall && !raw.includes("/")) return raw; // a slug installs from wordpress.org
  if (!raw.includes("/")) {
    fail(i18n.t("err.badInput", { message: "`plugin` must be the plugin file path, e.g. akismet/akismet" }), {
      code: "wp_bad_request",
    });
  }
  return raw;
}

async function bridgeCall(client, path, options, i18n) {
  try {
    return await client.bridge(path, options);
  } catch (error) {
    if (error instanceof WpError && (error.status === 404 || error.code === "rest_no_route")) {
      throw new WpError(i18n.t("err.bridgeUnavailable"), {
        code: "wp_bridge_unavailable",
        hint: i18n.t("hint.bridge"),
      });
    }
    throw error;
  }
}

export function adminTool({ client, config, i18n }) {
  return {
    name: "wp_admin",
    description: i18n.t("tool.admin"),
    parameters: {
      resource: {
        type: "string",
        required: true,
        enum: RESOURCES,
        description:
          "plugins, themes, templates (block-theme templates), menus (needs the dsh-bridge plugin) or bridge (bridge status).",
      },
      action: {
        type: "string",
        required: true,
        enum: ACTIONS,
        description:
          "Operation. plugins: list/get/install/activate/deactivate/delete. themes: list/get/activate. templates: list/get/create/update/delete. menus: list/get/create/update/delete/items/set_items/locations.",
      },
      plugin: {
        type: "string",
        description: "plugins: plugin file path such as akismet/akismet, or a wordpress.org slug for install.",
      },
      theme: { type: "string", description: "themes: stylesheet, e.g. twentytwentyfour." },
      template: {
        type: "string",
        description: "templates: template id such as twentytwentyfour//home, or a slug for create.",
      },
      slug: { type: "string", description: "templates: template slug for create." },
      title: { type: "string", description: "templates: human-readable title." },
      content: { type: "string", description: "templates: block markup content." },
      description: { type: "string", description: "templates: description." },
      menu: { type: "integer", description: "menus: menu term id." },
      location: { type: "string", description: "menus: theme location slug." },
      items: {
        type: "array",
        items: { type: "object", additionalProperties: true },
        description: "menus: menu item array for set_items.",
      },
      data: {
        type: "object",
        additionalProperties: true,
        description: "Extra fields for the underlying REST request (e.g. auto_update, status, meta).",
      },
      force: { type: "boolean", description: "delete: skip trash where the endpoint supports it." },
    },
    output: jsonOutput,
    execute: guarded(async (args, exec) => {
      const resource = ensureAllowed(args.resource, RESOURCES, "resource", i18n, "wp_admin");
      const action = ensureAllowed(args.action, ALLOWED[resource] ?? [], "action", i18n, resource);
      const signal = exec?.signal;
      const data = objectParam(args.data, i18n);

      if (resource === "bridge") {
        const status = await bridgeCall(client, "/status", { signal }, i18n);
        return ok(status, { resource, action });
      }

      if (resource === "plugins") {
        if (action === "list") {
          const plugins = await client.wp("/wp/v2/plugins", { signal });
          return ok((Array.isArray(plugins) ? plugins : []).map(summarizePlugin), { resource, action });
        }
        if (action === "get") {
          const id = pluginId(args, i18n);
          const plugin = await client.wp(`/wp/v2/plugins/${id}`, { signal });
          return ok(summarizePlugin(plugin), { resource, action, plugin: id });
        }
        if (action === "install") {
          const slug = pluginId(args, i18n, { forInstall: true });
          const created = await client.wp("/wp/v2/plugins", {
            method: "POST",
            body: { slug, status: args.activate === false ? "inactive" : "active", ...data },
            signal,
          });
          return ok(summarizePlugin(created), { resource, action, installed: true, plugin: slug });
        }
        const id = pluginId(args, i18n);
        if (action === "activate" || action === "deactivate") {
          const updated = await client.wp(`/wp/v2/plugins/${id}`, {
            method: "POST",
            body: { status: action === "activate" ? "active" : "inactive", ...data },
            signal,
          });
          return ok(summarizePlugin(updated), { resource, action, plugin: id });
        }
        assertDestructive(config, i18n);
        const deleted = await client.wp(`/wp/v2/plugins/${id}`, { method: "DELETE", signal });
        return ok(
          { deleted: true, plugin: id, previous: deleted?.previous ? summarizePlugin(deleted.previous) : undefined },
          { resource, action },
        );
      }

      if (resource === "themes") {
        if (action === "list") {
          const themes = await client.wp("/wp/v2/themes", { signal });
          return ok((Array.isArray(themes) ? themes : []).map(summarizeTheme), { resource, action });
        }
        const stylesheet = String(args.theme ?? "").trim();
        if (!stylesheet) {
          fail(i18n.t("err.missingParam", { name: "theme" }), { code: "wp_missing_param" });
        }
        if (action === "get") {
          const theme = await client.wp(`/wp/v2/themes/${stylesheet}`, { signal });
          return ok(summarizeTheme(theme), { resource, action, theme: stylesheet });
        }
        const activated = await client.wp(`/wp/v2/themes/${stylesheet}`, {
          method: "POST",
          body: { status: "active", ...data },
          signal,
        });
        return ok(summarizeTheme(activated), { resource, action, theme: stylesheet });
      }

      if (resource === "templates") {
        if (action === "list") {
          const templates = await client.wp("/wp/v2/templates", { query: { per_page: 100 }, signal });
          return ok((Array.isArray(templates) ? templates : []).map(summarizeTemplate), {
            resource,
            action,
          });
        }
        if (action === "get") {
          const id = requireParam(args, "template", i18n);
          const template = await client.wp(`/wp/v2/templates/${encodeURIComponent(id)}`, { signal });
          return ok(template, { resource, action, template: id });
        }
        if (action === "create") {
          const slug = requireParam(args, "slug", i18n);
          const created = await client.wp("/wp/v2/templates", {
            method: "POST",
            body: {
              slug,
              theme: args.theme,
              title: args.title,
              content: args.content ?? "",
              description: args.description,
              ...data,
            },
            signal,
          });
          return ok(created, { resource, action, created: true, id: created?.id });
        }
        if (action === "update") {
          const id = requireParam(args, "template", i18n);
          const updated = await client.wp(`/wp/v2/templates/${encodeURIComponent(id)}`, {
            method: "POST",
            body: { title: args.title, content: args.content, description: args.description, ...data },
            signal,
          });
          return ok(updated, { resource, action, updated: true, template: id });
        }
        assertDestructive(config, i18n);
        const id = requireParam(args, "template", i18n);
        const deleted = await client.wp(`/wp/v2/templates/${encodeURIComponent(id)}`, {
          method: "DELETE",
          query: { force: true },
          signal,
        });
        return ok({ deleted: true, template: id, previous: deleted?.previous }, { resource, action });
      }

      // resource === "menus" — supplied by the companion dsh-bridge plugin.
      if (action === "list") {
        const menus = await bridgeCall(client, "/menus", { signal }, i18n);
        return ok((Array.isArray(menus) ? menus : []).map(summarizeMenu), { resource, action });
      }
      if (action === "locations") {
        const locations = await bridgeCall(client, "/locations", { signal }, i18n);
        return ok(locations, { resource, action });
      }
      if (action === "create") {
        const created = await bridgeCall(
          client,
          "/menus",
          { method: "POST", body: { name: args.title ?? args.slug, locations: args.location ? [args.location] : [], ...data }, signal },
          i18n,
        );
        return ok(summarizeMenu(created), { resource, action, created: true, id: created?.id });
      }
      const menuId = requireParam(args, "menu", i18n);
      if (action === "get") {
        const menu = await bridgeCall(client, `/menus/${menuId}`, { signal }, i18n);
        return ok(menu, { resource, action, menu: menuId });
      }
      if (action === "items") {
        const items = await bridgeCall(client, `/menus/${menuId}/items`, { signal }, i18n);
        return ok(Array.isArray(items) ? items : [], { resource, action, menu: menuId });
      }
      if (action === "set_items") {
        const items = Array.isArray(args.items) ? args.items : [];
        const updated = await bridgeCall(
          client,
          `/menus/${menuId}/items`,
          { method: "POST", body: { items }, signal },
          i18n,
        );
        return ok(updated, { resource, action, menu: menuId, items: items.length });
      }
      if (action === "update") {
        const updated = await bridgeCall(
          client,
          `/menus/${menuId}`,
          {
            method: "POST",
            body: {
              name: args.title,
              locations: args.location ? [args.location] : undefined,
              ...data,
            },
            signal,
          },
          i18n,
        );
        return ok(summarizeMenu(updated), { resource, action, menu: menuId });
      }
      assertDestructive(config, i18n);
      const deleted = await bridgeCall(
        client,
        `/menus/${menuId}`,
        { method: "DELETE", signal },
        i18n,
      );
      return ok({ deleted: true, menu: menuId, previous: deleted?.previous }, { resource, action });
    }),
    presentCall: (args) => ({
      card: "generic",
      title: `WordPress admin: ${args.resource} ${args.action}`,
      kind: ["create", "update", "delete", "activate", "deactivate", "install", "set_items"].includes(
        args.action,
      )
        ? "execute"
        : "read",
    }),
  };
}
