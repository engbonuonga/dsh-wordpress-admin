# Changelog

## 0.1.1 — 2026-11-06

Documentation and test fixtures now use generic placeholders; no runtime change.

- README, README.zh-CN and docs/SETUP examples use `https://example.com` and `admin`.
- Test fixtures and assertions use `example.com` and `Example Test Site`.

## 0.1.0 — 2026-11-06

First release.

- Five DSH tools for WordPress and WooCommerce: `wp_site`, `wp_content`, `wp_media`, `wp_shop`, `wp_admin`.
- WordPress REST API with Application Password authentication; credentials from environment variables or inline config.
- Posts, pages and custom post types, with Gutenberg/HTML content, taxonomies, featured media, templates and meta.
- Media uploads from a public URL, base64 bytes or a local file, plus alt text, captions and attachment parents.
- WooCommerce products, variations, orders, coupons, customers and reviews, including batch operations.
- Plugin list/install/activate/deactivate, theme listing and activation, block-theme templates, and classic menus via the optional `dsh-bridge` companion plugin.
- English and Chinese tool descriptions and error messages, following the host locale.
- Delete actions are refused unless `allowDestructive: true`.
- Retries with `Retry-After` and exponential backoff, 30 s default timeout, traversal-guarded local uploads, 25 MB upload cap.
- Test suite with an in-process WordPress mock (`node --test`).
