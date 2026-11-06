/**
 * wp_content — posts, pages and any REST-enabled custom post type.
 */

import { summarizePost } from "../summaries.js";
import {
  assertDestructive,
  ensureAllowed,
  guarded,
  jsonOutput,
  mergeData,
  objectParam,
  ok,
  requireParam,
} from "./common.js";
import { paginationQuery } from "../wp.js";

const ACTIONS = ["list", "get", "create", "update", "delete"];

const SINGULAR = { post: "posts", page: "pages", media: "media" };

/** Accept `post`, `posts`, or a full REST base such as `my-plugin/items`. */
export function restBaseOf(type) {
  const raw = String(type ?? "posts")
    .trim()
    .replace(/^\/+/, "")
    .replace(/^wp\/v2\//, "");
  const key = raw.toLowerCase();
  return SINGULAR[key] ?? raw;
}

const WRITE_FIELDS = [
  "title",
  "content",
  "excerpt",
  "slug",
  "status",
  "date",
  "date_gmt",
  "parent",
  "featured_media",
  "template",
  "password",
  "format",
  "categories",
  "tags",
  "meta",
];

function writeBody(args, i18n) {
  const data = objectParam(args.data, i18n);
  const fields = {};
  for (const field of WRITE_FIELDS) {
    if (args[field] !== undefined) fields[field] = args[field];
  }
  if (fields.title !== undefined && typeof fields.title === "string") {
    fields.title = { raw: fields.title };
  }
  if (fields.content !== undefined && typeof fields.content === "string") {
    fields.content = { raw: fields.content };
  }
  if (fields.excerpt !== undefined && typeof fields.excerpt === "string") {
    fields.excerpt = { raw: fields.excerpt };
  }
  return mergeData(data, fields);
}

export function contentTool({ client, config, i18n }) {
  return {
    name: "wp_content",
    description: i18n.t("tool.content"),
    parameters: {
      action: {
        type: "string",
        required: true,
        enum: ACTIONS,
        description: "list, get, create, update or delete one content object.",
      },
      type: {
        type: "string",
        description:
          "REST base of the post type: posts (default), pages, or a custom type's REST base such as portfolio.",
      },
      id: { type: "integer", description: "Object id for get, update and delete." },
      title: { type: "string", description: "Title for create or update." },
      content: {
        type: "string",
        description: "Body as Gutenberg block markup or HTML; saved to the raw content field.",
      },
      excerpt: { type: "string", description: "Manual excerpt." },
      slug: { type: "string", description: "URL slug (also usable as a list filter)." },
      status: {
        type: "string",
        enum: ["draft", "publish", "pending", "private", "future", "any", "trash"],
        description:
          "Publication status. `any` is a list-only filter; `future` needs a date in the future.",
      },
      date: { type: "string", description: "Local publish date, ISO 8601 without timezone (2026-11-06T09:00:00)." },
      parent: { type: "integer", description: "Parent id, for hierarchical types such as pages." },
      featured_media: { type: "integer", description: "Attachment id used as the featured image." },
      template: { type: "string", description: "Page template slug, e.g. page-templates/full-width.php." },
      categories: { type: "array", items: { type: "integer" }, description: "Category ids." },
      tags: { type: "array", items: { type: "integer" }, description: "Tag ids." },
      meta: { type: "object", additionalProperties: true, description: "Registered custom fields." },
      data: {
        type: "object",
        additionalProperties: true,
        description:
          "Any other REST field for this post type (e.g. sticky, author, comment_status). Explicit fields above win.",
      },
      search: { type: "string", description: "list: free-text search." },
      page: { type: "integer", description: "list: page number, starting at 1." },
      per_page: { type: "integer", description: "list: rows per page, 1-100 (default from config)." },
      orderby: { type: "string", description: "list: date, modified, title, id, menu_order, relevance, include." },
      order: { type: "string", enum: ["asc", "desc"], description: "list: sort direction." },
      author: { type: "integer", description: "list: filter by author id." },
      after: { type: "string", description: "list: ISO 8601 lower date bound." },
      before: { type: "string", description: "list: ISO 8601 upper date bound." },
      force: {
        type: "boolean",
        description: "delete: true permanently deletes, false or omitted moves to trash.",
      },
    },
    output: jsonOutput,
    execute: guarded(async (args, exec) => {
      const base = restBaseOf(args.type);
      const action = ensureAllowed(args.action, ACTIONS, "action", i18n, base);
      const route = `/wp/v2/${base}`;
      const signal = exec?.signal;

      if (action === "list") {
        const { page, per_page } = paginationQuery(args, config);
        const query = {
          page,
          per_page,
          search: args.search,
          status: args.status === "any" ? "any" : args.status,
          slug: args.slug,
          author: args.author,
          parent: args.parent,
          orderby: args.orderby,
          order: args.order,
          after: args.after,
          before: args.before,
          categories: args.categories,
          tags: args.tags,
        };
        const result = await client.wp(route, { query, signal, meta: true });
        const items = Array.isArray(result.data) ? result.data : [];
        return ok(items.map(summarizePost), {
          action,
          type: base,
          page,
          perPage: per_page,
          total: result.total,
          totalPages: result.totalPages,
        });
      }

      if (action === "get") {
        const id = requireParam(args, "id", i18n);
        const item = await client.wp(`${route}/${id}`, { query: { context: "edit" }, signal });
        return ok(item, { action, type: base });
      }

      if (action === "create") {
        const body = writeBody(args, i18n);
        if (body.title === undefined && body.content === undefined) {
          return ok(
            {
              created: false,
              message: "Supply `title` and/or `content` to create content.",
            },
            { action, type: base },
          );
        }
        const created = await client.wp(route, { method: "POST", body, signal });
        return ok(summarizePost(created), { action, type: base, created: true, id: created?.id });
      }

      if (action === "update") {
        const id = requireParam(args, "id", i18n);
        const body = writeBody(args, i18n);
        const updated = await client.wp(`${route}/${id}`, { method: "POST", body, signal });
        return ok(summarizePost(updated), { action, type: base, updated: true, id });
      }

      assertDestructive(config, i18n);
      const id = requireParam(args, "id", i18n);
      const force = args.force === true;
      const deleted = await client.wp(`${route}/${id}`, {
        method: "DELETE",
        query: { force },
        signal,
      });
      return ok(
        {
          deleted: true,
          trashed: !force,
          id,
          previous: deleted?.previous ? summarizePost(deleted.previous) : undefined,
        },
        { action, type: base },
      );
    }),
    presentCall: (args) => ({
      card: "generic",
      title: `WordPress ${args.type ?? "posts"}: ${args.action}${args.id ? ` #${args.id}` : ""}`,
      kind: ["create", "update", "delete"].includes(args.action) ? "execute" : "read",
    }),
  };
}
