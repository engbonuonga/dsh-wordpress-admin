import test from "node:test";
import assert from "node:assert/strict";

import { normalizeConfig } from "../src/config.js";
import { createMessages } from "../src/i18n.js";
import { createTools } from "../src/index.js";
import { startMockWp } from "./helpers/mock-wp.js";

const i18n = createMessages("en");

function toolOf(specs, name) {
  const found = specs.find((spec) => spec.name === name);
  assert.ok(found, `tool ${name} exists`);
  return found;
}

async function withTools(run, overrides = {}) {
  const site = await startMockWp();
  try {
    const config = normalizeConfig({
      siteUrl: site.url,
      username: "admin",
      appPassword: "secret123",
      timeoutMs: 4000,
      ...overrides,
    });
    await run({ site, config, specs: createTools(config, i18n) });
  } finally {
    await site.close();
  }
}

test("wp_site info reports the user, capabilities and feature probes", async () => {
  await withTools(async ({ specs }) => {
    const result = await toolOf(specs, "wp_site").execute({ action: "info" }, {});
    assert.equal(result.ok, true);
    assert.equal(result.data.site.name, "Example Test Site");
    assert.equal(result.data.user.roles[0], "administrator");
    assert.equal(result.data.user.capabilities.manage_options, true);
    assert.equal(result.data.features.bridge.installed, true);
    assert.equal(result.data.features.woocommerce.configured, false);
  });
});

test("wp_content creates a post with raw title and content", async () => {
  await withTools(async ({ site, specs }) => {
    const result = await toolOf(specs, "wp_content").execute(
      {
        action: "create",
        type: "post",
        title: "Cement prices in Kisumu",
        content: "<!-- wp:paragraph --><p>Hello</p><!-- /wp:paragraph -->",
        status: "draft",
      },
      {},
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.title, "Cement prices in Kisumu");

    const sent = JSON.parse(site.state.requests.at(-1).body);
    assert.deepEqual(sent.title, { raw: "Cement prices in Kisumu" });
    assert.equal(sent.status, "draft");
  });
});

test("wp_content lists compact rows with pagination totals", async () => {
  await withTools(async ({ specs }) => {
    const result = await toolOf(specs, "wp_content").execute(
      { action: "list", type: "posts", per_page: 5 },
      {},
    );
    assert.equal(result.total, 1);
    assert.equal(result.data[0].title, "Hello world");
    assert.equal(result.data[0].id, 7);
  });
});

test("wp_content refuses deletes unless allowDestructive is enabled", async () => {
  await withTools(async ({ specs }) => {
    await assert.rejects(
      () => toolOf(specs, "wp_content").execute({ action: "delete", id: 7 }, {}),
      /Refusing a destructive operation/,
    );
  });
});

test("wp_media uploads base64 bytes with a filename header", async () => {
  await withTools(async ({ site, specs }) => {
    const result = await toolOf(specs, "wp_media").execute(
      {
        action: "upload",
        base64: Buffer.from("hello media").toString("base64"),
        filename: "note.txt",
        mime_type: "text/plain",
      },
      {},
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.mime_type, "text/plain");

    const request = site.state.requests.at(-1);
    assert.equal(request.method, "POST");
    assert.equal(request.path, "/wp-json/wp/v2/media");
    assert.equal(request.body, "hello media");
    assert.match(request.headers["content-disposition"], /filename="note.txt"/);
  });
});

test("wp_shop explains that WooCommerce credentials are missing", async () => {
  await withTools(async ({ specs }) => {
    await assert.rejects(
      () => toolOf(specs, "wp_shop").execute({ action: "list", resource: "products" }, {}),
      /WooCommerce credentials are not configured/,
    );
  });
});

test("wp_shop lists products when credentials exist", async () => {
  await withTools(
    async ({ specs }) => {
      const result = await toolOf(specs, "wp_shop").execute(
        { action: "list", resource: "products", per_page: 10 },
        {},
      );
      assert.equal(result.ok, true);
      assert.equal(result.total, 1);
      assert.equal(result.data[0].name, "Cement 50kg");
      assert.equal(result.data[0].price, "650.00");
    },
    { wooConsumerKey: "ck_test", wooConsumerSecret: "cs_test" },
  );
});

test("wp_admin reports bridge status", async () => {
  await withTools(async ({ specs }) => {
    const result = await toolOf(specs, "wp_admin").execute(
      { resource: "bridge", action: "get" },
      {},
    );
    assert.equal(result.data.bridge, "dsh-bridge");
  });
});

test("unknown actions fail with a localized, specific message", async () => {
  await withTools(async ({ specs }) => {
    await assert.rejects(
      () => toolOf(specs, "wp_content").execute({ action: "publish" }, {}),
      /Unsupported action `publish` for resource `posts`/,
    );
  });
});
