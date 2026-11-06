/**
 * In-process WordPress/WooCommerce stand-in for tests.
 *
 * It answers the handful of REST routes the plugin uses and records every
 * request so tests can assert on headers, query strings and bodies.
 */

import http from "node:http";

const USERNAME = "admin";
const PASSWORD = "secret123";

function expectedAuthorization() {
  return `Basic ${Buffer.from(`${USERNAME}:${PASSWORD}`, "utf8").toString("base64")}`;
}

export async function startMockWp(options = {}) {
  const state = {
    requests: [],
    posts: [
      {
        id: 7,
        type: "post",
        slug: "hello",
        status: "publish",
        title: { rendered: "Hello world" },
        link: "https://example.test/hello/",
        date: "2026-11-01T10:00:00",
        modified: "2026-11-01T10:00:00",
        author: 1,
        featured_media: 0,
        parent: 0,
        template: "",
      },
    ],
    media: [],
    products: [
      {
        id: 21,
        name: "Cement 50kg",
        slug: "cement-50kg",
        type: "simple",
        status: "publish",
        sku: "CEM-50",
        price: "650.00",
        regular_price: "650.00",
        sale_price: "",
        stock_status: "instock",
        stock_quantity: 120,
        categories: [{ id: 3, name: "Cement" }],
        permalink: "https://example.test/product/cement-50kg/",
        date_modified: "2026-11-01T09:00:00",
      },
    ],
    nextId: 100,
  };

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    let body = "";
    for await (const chunk of request) body += chunk;

    state.requests.push({
      method: request.method,
      path: url.pathname,
      query: url.search,
      headers: request.headers,
      body,
    });

    const send = (status, payload, headers = {}) => {
      response.writeHead(status, {
        "content-type": "application/json; charset=UTF-8",
        ...headers,
      });
      response.end(payload === undefined ? "" : JSON.stringify(payload));
    };

    const authorization = String(request.headers.authorization ?? "");
    const authorized = url.pathname.startsWith("/wp-json/wc/v3")
      ? authorization.startsWith("Basic ")
      : authorization === expectedAuthorization();

    if (url.pathname === "/wp-json/" || url.pathname === "/wp-json") {
      return send(200, {
        name: "Example Test Site",
        description: "Mock site",
        url: server.url,
        home: server.url,
        gmt_offset: 3,
        namespaces: ["wp/v2", "wc/v3", "dsh-bridge/v1"],
        authentication: [],
      });
    }

    if (url.pathname === "/wp-json/dsh-bridge/v1/status") {
      return send(200, { bridge: "dsh-bridge", version: "0.1.0", wordpress: "6.7" });
    }

    if (!authorized) {
      return send(401, {
        code: "rest_not_logged_in",
        message: "You are not currently logged in.",
        data: { status: 401 },
      });
    }

    if (url.pathname === "/wp-json/wp/v2/users/me") {
      return send(200, {
        id: 1,
        name: "Site Admin",
        slug: "admin",
        roles: ["administrator"],
        email: "admin@example.test",
        registered_date: "2024-01-01T00:00:00",
        capabilities: {
          manage_options: true,
          edit_posts: true,
          publish_posts: true,
          upload_files: true,
          edit_theme_options: true,
          activate_plugins: true,
          install_plugins: true,
          switch_themes: true,
          edit_others_posts: true,
          read: true,
        },
      });
    }

    if (url.pathname === "/wp-json/wp/v2/posts" && request.method === "GET") {
      return send(200, state.posts, { "x-wp-total": "1", "x-wp-totalpages": "1" });
    }

    if (url.pathname === "/wp-json/wp/v2/posts" && request.method === "POST") {
      const payload = JSON.parse(body || "{}");
      const created = {
        ...state.posts[0],
        id: state.nextId++,
        title: { rendered: payload.title?.raw ?? payload.title ?? "" },
        content: { rendered: payload.content?.raw ?? "" },
      };
      return send(201, created);
    }

    if (url.pathname === "/wp-json/wp/v2/media" && request.method === "POST") {
      const created = {
        id: state.nextId++,
        title: { rendered: "upload" },
        media_type: "image",
        mime_type: request.headers["content-type"],
        source_url: `${server.url}/upload.jpg`,
        alt_text: "",
        media_details: { width: 800, height: 600, filesize: Buffer.byteLength(body) },
        date: "2026-11-06T10:00:00",
      };
      state.media.push(created);
      return send(201, created);
    }

    if (url.pathname === "/wp-json/wc/v3/products" && request.method === "GET") {
      return send(200, state.products, { "x-wp-total": "1", "x-wp-totalpages": "1" });
    }

    if (url.pathname === "/wp-json/wp/v2/settings" && request.method === "GET") {
      return send(200, { title: "Example", description: "Quarry" });
    }

    if (url.pathname === "/wp-json/wp/v2/settings" && request.method === "POST") {
      return send(200, JSON.parse(body || "{}"));
    }

    if (url.pathname.startsWith("/wp-json/wp/v2/denied")) {
      return send(403, { code: "rest_forbidden", message: "Sorry, you cannot do that." });
    }

    return send(404, { code: "rest_no_route", message: "No route was found matching the URL." });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  server.url = `http://127.0.0.1:${port}`;

  return {
    url: server.url,
    state,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

export const credentials = { username: USERNAME, password: PASSWORD };
