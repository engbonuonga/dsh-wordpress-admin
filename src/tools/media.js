/**
 * wp_media — the WordPress media library.
 *
 * Uploads use the core binary endpoint (POST /wp/v2/media with a
 * Content-Disposition filename), which needs no multipart parser on either
 * side. Local files are read from the agent workspace; remote files are
 * fetched by the host and then uploaded.
 */

import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { summarizeMedia } from "../summaries.js";
import { paginationQuery } from "../wp.js";
import {
  assertDestructive,
  ensureAllowed,
  fail,
  guarded,
  jsonOutput,
  ok,
  requireParam,
  workspaceOf,
} from "./common.js";

const ACTIONS = ["list", "get", "upload", "update", "delete"];
const MAX_BYTES = 25 * 1024 * 1024;

const MIME_BY_EXT = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  pdf: "application/pdf",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  ogg: "audio/ogg",
  zip: "application/zip",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  csv: "text/csv",
  json: "application/json",
};

export function mimeOf(filename, fallback = "application/octet-stream") {
  const ext = path.extname(String(filename)).slice(1).toLowerCase();
  return MIME_BY_EXT[ext] ?? fallback;
}

function safeFilename(name) {
  return path.basename(String(name)).replace(/["\\\r\n]/g, "").slice(0, 200) || "upload";
}

async function readLocalFile(filePath, exec, i18n) {
  const base = workspaceOf(exec) ?? process.cwd();
  const absolute = path.isAbsolute(filePath) ? path.normalize(filePath) : path.resolve(base, filePath);
  const insideWorkspace = path.isAbsolute(filePath) || absolute === base || absolute.startsWith(base + path.sep);
  if (!insideWorkspace) {
    fail(i18n.t("err.badInput", { message: "`path` must stay inside the current workspace" }), {
      code: "wp_bad_request",
    });
  }
  let info;
  try {
    info = await stat(absolute);
  } catch {
    fail(i18n.t("err.fileNotFound", { path: filePath }), { code: "wp_file_not_found" });
  }
  if (!info.isFile()) {
    fail(i18n.t("err.fileNotFound", { path: filePath }), { code: "wp_file_not_found" });
  }
  if (info.size > MAX_BYTES) {
    fail(i18n.t("err.badInput", { message: `file is larger than ${MAX_BYTES / 1024 / 1024} MB` }), {
      code: "wp_file_too_large",
    });
  }
  return { buffer: await readFile(absolute), filename: path.basename(absolute) };
}

async function readRemoteFile(url, config, i18n, signal) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    fail(i18n.t("err.badInput", { message: "`url` must be an absolute http(s) URL" }), {
      code: "wp_bad_request",
    });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    fail(i18n.t("err.badInput", { message: "`url` must use http or https" }), {
      code: "wp_bad_request",
    });
  }
  const response = await fetch(parsed, {
    signal: signal ?? AbortSignal.timeout(config.timeoutMs),
    redirect: "follow",
  });
  if (!response.ok) {
    fail(i18n.t("err.uploadSource", { status: response.status }), { code: "wp_upload_failed" });
  }
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) {
    fail(i18n.t("err.badInput", { message: `remote file is larger than ${MAX_BYTES / 1024 / 1024} MB` }), {
      code: "wp_file_too_large",
    });
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_BYTES) {
    fail(i18n.t("err.badInput", { message: `remote file is larger than ${MAX_BYTES / 1024 / 1024} MB` }), {
      code: "wp_file_too_large",
    });
  }
  const filename = safeFilename(parsed.pathname.split("/").pop() ?? "upload");
  return { buffer, filename, mime: response.headers.get("content-type")?.split(";")[0] };
}

async function uploadBytes(client, { buffer, filename, mime }, args, signal) {
  const headers = {
    "content-type": mime,
    "content-disposition": `attachment; filename="${safeFilename(filename)}"`,
  };
  const created = await client.wp("/wp/v2/media", {
    method: "POST",
    raw: true,
    body: buffer,
    headers,
    signal,
  });
  const extra = {};
  if (args.title !== undefined) extra.title = args.title;
  if (args.alt_text !== undefined) extra.alt_text = args.alt_text;
  if (args.caption !== undefined) extra.caption = args.caption;
  if (args.description !== undefined) extra.description = args.description;
  if (Object.keys(extra).length === 0 || !created?.id) return created;
  return client
    .wp(`/wp/v2/media/${created.id}`, { method: "POST", body: extra, signal })
    .catch(() => created);
}

export function mediaTool({ client, config, i18n }) {
  return {
    name: "wp_media",
    description: i18n.t("tool.media"),
    parameters: {
      action: {
        type: "string",
        required: true,
        enum: ACTIONS,
        description:
          "list: browse. get: one item. upload: add a file. update: title/alt text/caption. delete: remove permanently.",
      },
      id: { type: "integer", description: "Media id for get, update and delete." },
      path: {
        type: "string",
        description: "upload: local file path inside the current workspace.",
      },
      url: { type: "string", description: "upload: fetch the file from an http(s) URL first." },
      base64: {
        type: "string",
        description: "upload: base64 bytes, optionally as a data: URI. Small files only.",
      },
      filename: { type: "string", description: "upload: override the stored filename." },
      title: { type: "string", description: "upload/update: media title." },
      alt_text: { type: "string", description: "upload/update: alternative text (SEO and accessibility)." },
      caption: { type: "string", description: "upload/update: caption." },
      description: { type: "string", description: "upload/update: description." },
      parent: { type: "integer", description: "list: only media attached to this post/page id." },
      media_type: {
        type: "string",
        enum: ["image", "video", "audio", "file"],
        description: "list: filter by media family.",
      },
      mime_type: {
        type: "string",
        description: "list: exact MIME type filter; upload: override the detected MIME type.",
      },
      search: { type: "string", description: "list: free-text search." },
      page: { type: "integer", description: "list: page number." },
      per_page: { type: "integer", description: "list: rows per page, 1-100." },
      orderby: { type: "string", description: "list: date, id, title, name, modified, menu_order." },
      order: { type: "string", enum: ["asc", "desc"], description: "list: direction." },
      data: { type: "object", additionalProperties: true, description: "update: any other media field." },
      force: { type: "boolean", description: "delete: attachments are always permanently deleted." },
    },
    output: jsonOutput,
    execute: guarded(async (args, exec) => {
      const action = ensureAllowed(args.action, ACTIONS, "action", i18n, "media");
      const signal = exec?.signal;

      if (action === "list") {
        const { page, per_page } = paginationQuery(args, config);
        const result = await client.wp("/wp/v2/media", {
          query: {
            page,
            per_page,
            parent: args.parent,
            media_type: args.media_type,
            mime_type: args.mime_type,
            search: args.search,
            orderby: args.orderby,
            order: args.order,
          },
          signal,
          meta: true,
        });
        const items = Array.isArray(result.data) ? result.data : [];
        return ok(items.map(summarizeMedia), {
          action,
          page,
          perPage: per_page,
          total: result.total,
          totalPages: result.totalPages,
        });
      }

      if (action === "get") {
        const id = requireParam(args, "id", i18n);
        const item = await client.wp(`/wp/v2/media/${id}`, { query: { context: "edit" }, signal });
        return ok(item, { action, id });
      }

      if (action === "upload") {
        const sources = [args.path, args.url, args.base64].filter(Boolean).length;
        if (sources !== 1) {
          fail(i18n.t("err.uploadSource"), { code: "wp_bad_request" });
        }
        let source;
        if (args.path) {
          source = await readLocalFile(requireParam(args, "path", i18n), exec, i18n);
        } else if (args.url) {
          source = await readRemoteFile(requireParam(args, "url", i18n), config, i18n, signal);
        } else {
          const buffer = Buffer.from(String(args.base64).replace(/^data:[^;]+;base64,/, ""), "base64");
          if (buffer.byteLength === 0) {
            fail(i18n.t("err.badInput", { message: "`base64` decoded to zero bytes" }), {
              code: "wp_bad_request",
            });
          }
          if (buffer.byteLength > MAX_BYTES) {
            fail(i18n.t("err.badInput", { message: `file is larger than ${MAX_BYTES / 1024 / 1024} MB` }), {
              code: "wp_file_too_large",
            });
          }
          source = {
            buffer,
            filename: args.filename ?? "upload",
            mime: args.mime_type,
          };
        }
        const mime = source.mime ?? args.mime_type ?? mimeOf(args.filename ?? source.filename);
        const created = await uploadBytes(
          client,
          { buffer: source.buffer, filename: args.filename ?? source.filename, mime },
          args,
          signal,
        );
        return ok(summarizeMedia(created), { action, uploaded: true, id: created?.id });
      }

      if (action === "update") {
        const id = requireParam(args, "id", i18n);
        const body = { ...(args.data ?? {}) };
        for (const field of ["title", "alt_text", "caption", "description", "parent"]) {
          if (args[field] !== undefined) body[field] = args[field];
        }
        const updated = await client.wp(`/wp/v2/media/${id}`, { method: "POST", body, signal });
        return ok(summarizeMedia(updated), { action, id, updated: true });
      }

      assertDestructive(config, i18n);
      const id = requireParam(args, "id", i18n);
      const deleted = await client.wp(`/wp/v2/media/${id}`, {
        method: "DELETE",
        query: { force: true },
        signal,
      });
      return ok(
        {
          deleted: true,
          id,
          previous: deleted?.previous ? summarizeMedia(deleted.previous) : undefined,
        },
        { action },
      );
    }),
    presentCall: (args) => ({
      card: "generic",
      title: `WordPress media: ${args.action}${args.id ? ` #${args.id}` : ""}`,
      kind: ["upload", "update", "delete"].includes(args.action) ? "execute" : "read",
    }),
  };
}
