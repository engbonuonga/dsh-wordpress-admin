import test from "node:test";
import assert from "node:assert/strict";

import { normalizeConfig, normalizeSiteUrl } from "../src/config.js";
import { createMessages } from "../src/i18n.js";
import { WpClient, WpError, paginationQuery } from "../src/wp.js";
import { startMockWp } from "./helpers/mock-wp.js";

const i18n = createMessages("en");

async function withSite(run, overrides = {}) {
  const site = await startMockWp();
  try {
    const config = normalizeConfig({
      siteUrl: site.url,
      username: "admin",
      appPassword: "secret123",
      timeoutMs: 4000,
      ...overrides,
    });
    await run({ site, config, client: new WpClient(config, i18n) });
  } finally {
    await site.close();
  }
}

test("root returns the site identity without authentication", async () => {
  await withSite(async ({ site, client }) => {
    const root = await client.root();
    assert.equal(root.name, "Example Test Site");
    assert.deepEqual(root.namespaces, ["wp/v2", "wc/v3", "dsh-bridge/v1"]);
    assert.ok(site.state.requests[0].path === "/wp-json/");
  });
});

test("requests send the application password as HTTP Basic", async () => {
  await withSite(async ({ site, client }) => {
    const me = await client.wp("/wp/v2/users/me", { query: { context: "edit" } });
    assert.equal(me.roles[0], "administrator");
    const request = site.state.requests.at(-1);
    const expected = `Basic ${Buffer.from("admin:secret123").toString("base64")}`;
    assert.equal(request.headers.authorization, expected);
    assert.match(request.query, /context=edit/);
  });
});

test("application passwords with display spaces are compacted", async () => {
  await withSite(
    async ({ site, client }) => {
      await client.wp("/wp/v2/users/me");
      const expected = `Basic ${Buffer.from("admin:secret123").toString("base64")}`;
      assert.equal(site.state.requests.at(-1).headers.authorization, expected);
    },
    { appPassword: " sec ret 123 " },
  );
});

test("meta mode returns WordPress pagination totals", async () => {
  await withSite(async ({ client }) => {
    const result = await client.wp("/wp/v2/posts", { meta: true, query: { per_page: 1 } });
    assert.equal(result.total, 1);
    assert.equal(result.totalPages, 1);
    assert.ok(Array.isArray(result.data));
  });
});

test("403 responses become a forbidden WpError with a hint", async () => {
  await withSite(async ({ client }) => {
    await assert.rejects(
      () => client.wp("/wp/v2/denied"),
      (error) => {
        assert.ok(error instanceof WpError);
        assert.equal(error.status, 403);
        assert.match(error.message, /denied the request/);
        assert.ok(error.hint);
        return true;
      },
    );
  });
});

test("404 responses become a not-found WpError naming the route", async () => {
  await withSite(async ({ client }) => {
    await assert.rejects(
      () => client.wp("/wp/v2/nothing-here"),
      (error) => {
        assert.equal(error.status, 404);
        assert.match(error.message, /nothing-here/);
        return true;
      },
    );
  });
});

test("a missing site URL is rejected before any request", async () => {
  const config = normalizeConfig({ username: "admin", appPassword: "secret123" });
  const client = new WpClient(config, i18n);
  await assert.rejects(() => client.wp("/wp/v2/posts"), /site is not configured/i);
});

test("paginationQuery clamps per_page to the WordPress maximum", () => {
  const config = normalizeConfig({ perPageDefault: 20 });
  assert.deepEqual(paginationQuery({ per_page: 500, page: 3 }, config), { page: 3, per_page: 100 });
  assert.deepEqual(paginationQuery({}, config), { page: 1, per_page: 20 });
});

test("normalizeSiteUrl accepts bare domains and wp-json suffixes", () => {
  assert.equal(normalizeSiteUrl("example.com"), "https://example.com");
  assert.equal(normalizeSiteUrl("https://example.com/wp-json/"), "https://example.com");
  assert.equal(normalizeSiteUrl("http://127.0.0.1:8080/"), "http://127.0.0.1:8080");
  assert.equal(normalizeSiteUrl(""), "");
});

test("the Chinese catalog resolves error text", () => {
  const zh = createMessages("zh");
  assert.equal(zh.locale, "zh");
  assert.match(zh.t("err.missingSite"), /尚未配置|WordPress/);
  assert.match(zh.t("tool.content"), /文章/);
});
