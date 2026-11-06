# dsh-wordpress-admin

Full WordPress and WooCommerce administration for [DeepSeek Harness](https://github.com/deepseek-ai) — create and edit posts, pages, products, media, themes, plugins, block templates and menus from the chat, using the WordPress REST API and an Application Password.

- **Five focused tools** instead of dozens of endpoints: `wp_site`, `wp_content`, `wp_media`, `wp_shop`, `wp_admin`.
- **English and Chinese** tool descriptions and error messages, following the host locale.
- **Safe by default**: deletes are refused unless `allowDestructive: true`; credentials can stay in environment variables.
- **No dependencies at runtime**: Node's built-in `fetch`, no MCP server to run, no WordPress plugin required for core features.
- **Optional companion plugin** (`wordpress-plugin/dsh-bridge`) for classic menus and theme menu locations, which the WordPress core REST API does not expose.

## Requirements

| Item | Requirement |
| --- | --- |
| DeepSeek Harness | 0.2.x |
| Node.js | 22.19 or newer (the harness runtime is fine) |
| WordPress | 6.0 or newer, REST API reachable, Application Passwords enabled |
| WooCommerce | optional, for `wp_shop` |
| Site user | an Administrator (or a role with the capabilities you want to use) |

## Install

### From the plugin marketplace

Search for **dsh-wordpress-admin** on the DSH **Plugins → Discover** page and install the bundle. The marketplace reads the package from this repository's latest GitHub release (`dsh-wordpress-admin.tgz`); no npm account is needed.

### From a local checkout

Install the bundle from the absolute path of this folder with the DSH plugin installer (Plugins page → install from a package folder, or the equivalent `plugin_manager` install action). The bundle patch is applied automatically; restart the app afterwards.

## Configure

Edit the profile patch (`~/.dsh/profiles/<profile>/cordis.patch.yml`) and add configuration to the inserted row:

```yaml
- insert:
    - id: dsh-wordpress-admin
      name: dsh-wordpress-admin
      config:
        siteUrl: https://example.com
        username: admin
        appPasswordEnv: DSH_WP_APP_PASSWORD
        # WooCommerce (optional)
        wooKeyEnv: DSH_WOO_CONSUMER_KEY
        wooSecretEnv: DSH_WOO_CONSUMER_SECRET
        locale: auto            # auto | en | zh
        allowDestructive: false # true enables delete actions
        timeoutMs: 30000
        maxRetries: 2
        perPageDefault: 20
```

Set the secrets in the environment that launches DSH (do not commit them):

```powershell
# Windows
setx DSH_WP_APP_PASSWORD "xxxx xxxx xxxx xxxx xxxx xxxx"
```

```bash
# macOS / Linux
export DSH_WP_APP_PASSWORD="xxxx xxxx xxxx xxxx xxxx xxxx"
```

Secrets may also be written inline as `appPassword`, `wooConsumerKey` and `wooConsumerSecret`, but the profile patch is plain text — prefer the environment variables.

Full setup steps, including creating an Application Password and WooCommerce keys: [docs/SETUP.md](docs/SETUP.md).

## Tools

| Tool | What it does |
| --- | --- |
| `wp_site` | connection info, capability report, health/latency, read and update site settings |
| `wp_content` | posts, pages and any REST-enabled post type: list, get, create, update, delete |
| `wp_media` | media library: list, get, upload (URL, base64 or workspace file), update alt text/title/caption, delete |
| `wp_shop` | WooCommerce products, variations, orders, coupons, customers and reviews, plus batch operations |
| `wp_admin` | plugins (list/install/activate/deactivate/delete), themes (list/activate), block templates, menus (bridge plugin) |

Detailed parameter reference: [docs/TOOLS.md](docs/TOOLS.md).

### Examples

```
Use wp_site to check that your site is reachable, then list my five newest draft posts with wp_content.
```

```
Create a 900-word blog post titled "Cabro paving maintenance in Kisumu" as a draft, add the featured image from https://…/cabro.jpg, and put it in the "Guides" category.
```

```
Upload build/site-plan.pdf to the media library as "Kisumu yard site plan" and set its alt text, then attach it to page 42.
```

## Safety

- Application Passwords can be revoked at any time from **Users → Profile → Application Passwords**; the plugin only ever uses that one password.
- `allowDestructive: false` (default) blocks every delete tool action, including media and plugins.
- Plugin installation, theme switching and settings updates are privileged. Confirm with the model before asking it to run them, and consider a second WordPress user with narrower capabilities for day-to-day content work.
- The plugin never sends credentials to any host except the configured `siteUrl`.

## Limitations

- WordPress core has no REST endpoint for installing themes; `wp_admin` can list and activate installed themes but not install new ones. Use the WordPress admin or WP-CLI for theme installation.
- Classic menus and menu locations require the companion `dsh-bridge` plugin in `wordpress-plugin/dsh-bridge`.
- Uploads are capped at 25 MB and are best done from a public URL or a workspace path; base64 is for small files.
- The plugin talks to one site per configuration row. Install a second row with a different `id` to manage another site.

## Development

```bash
npm test          # node:test, includes a mock WordPress server
npm run pack:check
```

The test suite starts an in-process WordPress mock, so no network or real site is needed.

## License

MIT © Brian Onuonga. See [LICENSE](LICENSE).

## 中文简介

通过 WordPress REST API 与应用密码，在 DeepSeek Harness 中管理 WordPress 与 WooCommerce：文章、页面、产品、媒体、主题、插件、区块模板与菜单。工具说明和错误提示支持中文，删除操作默认关闭，需要显式开启 `allowDestructive`。安装与配置见 [docs/SETUP.md](docs/SETUP.md)，工具参数见 [docs/TOOLS.md](docs/TOOLS.md)。
