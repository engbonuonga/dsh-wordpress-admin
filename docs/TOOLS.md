# Tool reference

All five tools return JSON. List actions return compact rows plus `total` and `totalPages`; a 403/404 becomes an error message with a localized hint instead of a raw HTTP dump.

Common conventions:

- `page` starts at 1; `per_page` is clamped to 1–100 and defaults to `perPageDefault`.
- Dates are ISO 8601 (`2026-11-06T09:00:00`).
- Delete actions require `allowDestructive: true` in the plugin config.
- `data` accepts any additional REST field for the endpoint; explicit named fields override keys inside `data`.

## `wp_site`

Inspect and configure the connected site. Run `action: "info"` first on a new site.

| Parameter | Type | Notes |
| --- | --- | --- |
| `action` | string, required | `info`, `health`, `settings_get`, `settings_update` |
| `settings` | object | `settings_update`: WordPress settings object, e.g. `{ "title": "…", "description": "…" }` |

`info` returns the REST root, your user (roles, capabilities), WooCommerce and bridge availability. `health` measures round-trip latency.

## `wp_content`

Posts, pages and any registered REST-enabled post type.

| Parameter | Type | Notes |
| --- | --- | --- |
| `action` | string, required | `list`, `get`, `create`, `update`, `delete` |
| `type` | string | REST base: `posts` (default), `pages`, or a custom base |
| `id` | integer | required for `get`, `update`, `delete` |
| `title` | string | wrapped as `{raw: …}` |
| `content` | string | Gutenberg block markup or HTML, wrapped as `{raw: …}` |
| `excerpt` | string | wrapped as `{raw: …}` |
| `slug` | string | URL slug; also a `list` filter |
| `status` | string | `draft`, `publish`, `pending`, `private`, `future`, `any` (list only), `trash` |
| `date` | string | local publish date, ISO 8601 |
| `parent` | integer | for hierarchical types such as pages |
| `featured_media` | integer | attachment id |
| `template` | string | page template slug |
| `categories` / `tags` | integer[] | term ids |
| `meta` | object | registered custom fields |
| `data` | object | any other REST field (`sticky`, `author`, `comment_status`, …) |
| `search` | string | `list`: free text |
| `page` / `per_page` | integer | `list` pagination |
| `orderby` | string | `date`, `modified`, `title`, `id`, `menu_order`, `relevance`, `include` |
| `order` | string | `asc`, `desc` |
| `author` | integer | `list` filter |
| `after` / `before` | string | `list` date bounds |
| `force` | boolean | `delete`: `true` bypasses the trash |

Creating without `title` or `content` returns `created: false` and does not touch the site. Deleting with `force: false` moves to trash and reports `trashed: true`.

## `wp_media`

| Parameter | Type | Notes |
| --- | --- | --- |
| `action` | string, required | `list`, `get`, `upload`, `update`, `delete` |
| `id` | integer | required except for `list` and `upload` |
| `path` | string | upload source: file on the DSH machine (workspace-relative or absolute) |
| `url` | string | upload source: public http(s) URL |
| `base64` | string | upload source: base64 bytes, with or without a `data:` prefix |
| `filename` | string | filename sent with the upload |
| `title`, `alt_text`, `caption`, `description` | string | metadata applied after upload, or in `update` |
| `parent` | integer | post/page the attachment is attached to |
| `media_type` | string | `list` filter: `image`, `video`, `audio`, `file` |
| `mime_type` | string | `list` filter |
| `search`, `page`, `per_page`, `orderby`, `order` | | `list` filters and pagination |
| `data` | object | other fields for `update` |
| `force` | boolean | `delete`: permanent removal |

Supply exactly one of `path`, `url`, `base64`; anything else returns `uploadSource`. Uploads are capped at 25 MB.

## `wp_shop`

WooCommerce REST v3. Requires `wooKeyEnv`/`wooSecretEnv` (or inline keys); without them every call returns `wooNotConfigured`.

| Parameter | Type | Notes |
| --- | --- | --- |
| `action` | string, required | `list`, `get`, `create`, `update`, `delete`, `batch` |
| `resource` | string, required | `products`, `variations`, `orders`, `coupons`, `customers`, `reviews` |
| `id` | integer | required for `get`/`update`/`delete` (except variation/coupon ids) |
| `product_id` | integer | required for `variations` |
| `name`, `sku`, `regular_price`, `sale_price`, `description`, `short_description`, `status`, `type` | | product fields |
| `featured`, `manage_stock`, `stock_quantity`, `stock_status` | | product inventory fields |
| `categories`, `tags`, `images`, `attributes` | object[] | product relations |
| `weight`, `dimensions` | string / object | shipping |
| `customer_id`, `billing`, `shipping`, `line_items`, `set_paid` | | order fields |
| `code`, `discount_type`, `amount`, `date_expires`, `minimum_amount` | | coupon fields |
| `email`, `first_name`, `last_name` | | customer fields |
| `rating`, `review` | integer / string | review fields |
| `search`, `category`, `tag`, `product`, `customer` | | `list` filters |
| `after`, `before` | string | `list` date bounds |
| `orderby`, `order`, `page`, `per_page` | | `list` sorting and pagination |
| `data` | object | other fields for the resource |
| `batch` | object | `{ create: [], update: [], delete: [] }` for `action: "batch"` |
| `force` | boolean | `delete`: permanent removal |

`action: "batch"` posts to `/{resource}/batch`; WooCommerce caps batches at 100 objects per operation.

## `wp_admin`

| Parameter | Type | Notes |
| --- | --- | --- |
| `resource` | string, required | `plugins`, `themes`, `templates`, `menus`, `bridge` |
| `action` | string, required | `list`, `get`, `create`, `update`, `delete`, `activate`, `deactivate`, `install`, `items`, `set_items`, `locations` — the allowed subset depends on the resource |
| `plugin` | string | `vendor/plugin` for plugins already installed; a bare slug is accepted only for `install` |
| `theme` | string | stylesheet directory name |
| `template` | string | `theme//slug` for block templates and template parts |
| `slug` | string | plugin slug for `install` |
| `title` | string | template/menu title |
| `content` | string | template content |
| `description` | string | template description |
| `menu` | integer | menu id for `items` / `set_items` |
| `location` | string | menu location slug |
| `items` | object[] | menu items; `set_items` replaces every item |
| `data` | object | other REST fields |
| `force` | boolean | template delete |

Notable behaviour:

- `menus` and `locations` use the companion `dsh-bridge` plugin; without it they return `bridgeUnavailable` with installation instructions.
- `themes` can list and activate but not install — WordPress core has no theme-install endpoint.
- `templates` targets block-theme templates and template parts; ids look like `twentytwentyfour//index`.
- `activate`/`deactivate` on plugins use the plugin file path, e.g. `woocommerce/woocommerce.php`.
