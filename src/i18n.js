/**
 * Bilingual catalogs. The `locale` config selects one; `auto` follows the host
 * locale and falls back to English.
 *
 * Model-facing tool descriptions are translated, because the model reads the
 * tool catalog in the user's language. Parameter descriptions stay English for
 * maintainability; they are short and appear next to translated tool text.
 */

const EN = {
  "tool.site": "Inspect and configure the connected WordPress site: connection health, identity, reading settings and the authenticated user. Run action=info first on a new site to confirm authentication, roles and available features before writing anything. action=settings_update changes site-wide options and needs an administrator.",
  "tool.content": "Create, read, update and delete WordPress content: posts, pages and any other registered REST-enabled post type. Supports Gutenberg blocks or HTML in `content`, draft/publish/future/private/pending status, taxonomy terms, featured media, page parents, page templates and meta fields. Deleting requires allowDestructive=true in the plugin config. Use wp_admin for block-theme templates and menus.",
  "tool.media": "Upload and manage the WordPress media library (images, PDFs, video, audio). Upload from a public URL, base64 bytes or a local file path on the DSH machine, then set alt text, caption, title and parent. Uploading large files through chat is slow: prefer a public URL or a workspace path.",
  "tool.shop": "Manage a WooCommerce store through the WooCommerce REST API v3: products, variations, orders, coupons and customers. Lists return compact rows; use get before update to see the full record. Requires the WooCommerce consumer key and secret in the plugin config. Deleting requires allowDestructive=true.",
  "tool.admin": "Administer WordPress itself: plugins (list, activate, deactivate, install from WordPress.org), themes (list, activate), block-theme templates and template parts (the site's layouts), and classic menus through the optional DSH Bridge plugin. Plugin installs and theme switches are privileged operations: confirm with the user first.",

  "err.missingSite": "WordPress site is not configured. Add `siteUrl` to the dsh-wordpress-admin config in the DSH profile patch and restart the app.",
  "err.missingAuth": "WordPress credentials are missing. Set `username` plus an application password (`appPassword`, or the environment variable named by `appPasswordEnv`).",
  "err.unauthorized": "WordPress rejected the credentials (HTTP 401). Check the username and the application password; the password must belong to that user and application passwords must not be disabled by a security plugin.",
  "err.forbidden": "WordPress denied the request (HTTP 403). The authenticated user lacks the required capability for this action, or a security plugin blocks REST writes.",
  "err.notFound": "WordPress returned 404 for {path}. Check that the site URL, REST route and object id are correct, and that permalinks are not set to Plain.",
  "err.http": "WordPress returned HTTP {status}: {message}",
  "err.timeout": "WordPress did not answer within {ms} ms. Increase `timeoutMs` or check the site's responsiveness.",
  "err.network": "Could not reach the WordPress site: {message}",
  "err.restUnavailable": "The WordPress REST API did not answer with JSON. The URL may not be a WordPress site, the REST API may be disabled by a security plugin, or permalinks may be set to Plain.",
  "err.wooNotConfigured": "WooCommerce credentials are not configured. Add `wooConsumerKey` and `wooConsumerSecret` (or the environment variables named by `wooKeyEnv` / `wooSecretEnv`) and make sure WooCommerce is active on the site.",
  "err.wooUnavailable": "The WooCommerce REST API is not reachable on this site. Confirm WooCommerce is active, the keys belong to an administrator or shop manager, and the keys have read/write permission.",
  "err.destructiveBlocked": "Refusing a destructive operation: deleting content requires `allowDestructive: true` in the dsh-wordpress-admin config.",
  "err.bridgeUnavailable": "This action needs the optional DSH Bridge plugin on the WordPress site (classic menus and menu locations). Install `wordpress-plugin/dsh-bridge` from the plugin package, activate it, then retry.",
  "err.badInput": "Invalid input: {message}",
  "err.missingParam": "Missing required parameter `{name}` for this action.",
  "err.unsupportedResource": "Unsupported resource `{resource}` for this tool.",
  "err.unsupportedAction": "Unsupported action `{action}` for resource `{resource}`.",
  "err.uploadSource": "Provide exactly one upload source: `url`, `base64`, or `path`.",
  "err.fileNotFound": "Local file not found: {path}",
  "err.pluginInstall": "WordPress could not install `{slug}`. The site may lack filesystem write access, or the slug is not a WordPress.org plugin.",
  "hint.unauthorized": "Verify the username and application password in the profile patch or the environment variable, and confirm that application passwords are allowed on the site.",
  "hint.forbidden": "Use an administrator account for admin operations, or grant the user the capability the action needs.",
  "hint.restUnavailable": "Check the site URL (https://example.com), set permalinks to Post name, and allow the REST API in any security plugin.",
  "hint.setup": "Setup: docs/SETUP.md in the dsh-wordpress-admin package.",
  "hint.bridge": "Install the bundled WordPress plugin from wordpress-plugin/dsh-bridge (zip the folder or upload dsh-bridge.php), activate it, then retry. It adds menu and menu-location routes the WordPress core REST API does not expose.",
  "hint.noWoo": "WooCommerce tools stay available but return setup guidance until the keys are configured.",
  "hint.publish": "WordPress publishes asynchronously for some statuses; re-read the object to confirm the final status.",
  "text.unknownError": "Unexpected WordPress client error: {message}",
};

const ZH = {
  "tool.site": "查看并配置已连接的 WordPress 站点：连接健康、站点身份、阅读设置和当前登录用户。在新站点上先运行 action=info，确认认证、角色与可用功能后再写入。action=settings_update 会修改全站选项，需要管理员权限。",
  "tool.content": "创建、读取、更新和删除 WordPress 内容：文章、页面以及任何注册了 REST 支持的文章类型。`content` 支持 Gutenberg 区块或 HTML；支持草稿/发布/定时/私密/待审核状态、分类法术语、特色图片、父级页面、页面模板和自定义字段。删除操作需要在插件配置中开启 allowDestructive=true。区块主题模板和菜单请使用 wp_admin。",
  "tool.media": "上传并管理 WordPress 媒体库（图片、PDF、视频、音频）。可以从公网 URL、base64 字节或 DSH 机器上的本地路径上传，然后设置替代文本、说明、标题和父级。通过对话上传大文件较慢，优先使用公网 URL 或工作区路径。",
  "tool.shop": "通过 WooCommerce REST API v3 管理店铺：产品、变体、订单、优惠券和客户。列表返回精简行；更新前先用 get 查看完整记录。需要在插件配置中提供 WooCommerce 消费者密钥与密钥。删除操作需要开启 allowDestructive=true。",
  "tool.admin": "管理 WordPress 本体：插件（列出、启用、停用、从 WordPress.org 安装）、主题（列出、启用）、区块主题模板与模板部件（站点布局），以及通过可选的 DSH Bridge 插件管理经典菜单。安装插件和切换主题属于高权限操作，请先与用户确认。",

  "err.missingSite": "尚未配置 WordPress 站点。请在 DSH 配置补丁的 dsh-wordpress-admin 配置中添加 `siteUrl`，然后重启应用。",
  "err.missingAuth": "缺少 WordPress 凭据。请设置 `username` 和应用密码（`appPassword`，或由 `appPasswordEnv` 指定的环境变量）。",
  "err.unauthorized": "WordPress 拒绝了凭据（HTTP 401）。请检查用户名与应用密码；密码必须属于该用户，且安全插件不能禁用应用密码。",
  "err.forbidden": "WordPress 拒绝了请求（HTTP 403）。当前用户缺少执行此操作所需的权限，或安全插件阻止了 REST 写入。",
  "err.notFound": "WordPress 对 {path} 返回 404。请检查站点地址、REST 路由和对象 id，并确认固定链接不是“朴素”模式。",
  "err.http": "WordPress 返回 HTTP {status}：{message}",
  "err.timeout": "WordPress 在 {ms} 毫秒内未响应。请增大 `timeoutMs` 或检查站点响应速度。",
  "err.network": "无法连接 WordPress 站点：{message}",
  "err.restUnavailable": "WordPress REST API 未返回 JSON。该地址可能不是 WordPress 站点，REST API 可能被安全插件禁用，或固定链接设置为“朴素”模式。",
  "err.wooNotConfigured": "尚未配置 WooCommerce 凭据。请添加 `wooConsumerKey` 和 `wooConsumerSecret`（或由 `wooKeyEnv` / `wooSecretEnv` 指定的环境变量），并确认站点已启用 WooCommerce。",
  "err.wooUnavailable": "此站点无法访问 WooCommerce REST API。请确认 WooCommerce 已启用、密钥属于管理员或店铺经理，且密钥具有读写权限。",
  "err.destructiveBlocked": "已拒绝破坏性操作：删除内容需要在 dsh-wordpress-admin 配置中开启 `allowDestructive: true`。",
  "err.bridgeUnavailable": "此操作需要站点安装可选的 DSH Bridge 插件（经典菜单与菜单位置）。请安装插件包中的 `wordpress-plugin/dsh-bridge`，启用后重试。",
  "err.badInput": "输入无效：{message}",
  "err.missingParam": "此操作缺少必填参数 `{name}`。",
  "err.unsupportedResource": "此工具不支持资源 `{resource}`。",
  "err.unsupportedAction": "资源 `{resource}` 不支持操作 `{action}`。",
  "err.uploadSource": "请只提供一种上传来源：`url`、`base64` 或 `path`。",
  "err.fileNotFound": "找不到本地文件：{path}",
  "err.pluginInstall": "WordPress 无法安装 `{slug}`。站点可能没有文件系统写入权限，或该 slug 不是 WordPress.org 插件。",
  "hint.unauthorized": "请检查配置补丁或环境变量中的用户名与应用密码，并确认站点允许使用应用密码。",
  "hint.forbidden": "管理操作请使用管理员账号，或为该用户授予所需权限。",
  "hint.restUnavailable": "请检查站点地址（https://example.com），将固定链接设为“文章名”，并在安全插件中放行 REST API。",
  "hint.setup": "安装说明：dsh-wordpress-admin 包内的 docs/SETUP.md。",
  "hint.bridge": "请安装插件包内的 WordPress 插件 wordpress-plugin/dsh-bridge（打包文件夹或上传 dsh-bridge.php），启用后重试。WordPress 核心 REST API 不提供菜单与菜单位置接口。",
  "hint.noWoo": "WooCommerce 工具仍然可用，但在配置密钥前只返回安装指引。",
  "hint.publish": "某些状态在 WordPress 中是异步生效的；请重新读取对象确认最终状态。",
  "text.unknownError": "意外的 WordPress 客户端错误：{message}",
};

const CATALOGS = { en: EN, zh: ZH };

function interpolate(template, params) {
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    Object.hasOwn(params, key) ? String(params[key]) : match,
  );
}

export function createMessages(locale) {
  const catalog = CATALOGS[locale] ?? EN;
  const fallback = EN;
  return {
    locale: locale === "zh" ? "zh" : "en",
    t(key, params = {}) {
      const template = catalog[key] ?? fallback[key] ?? key;
      return interpolate(template, params);
    },
    has(key) {
      return Object.hasOwn(catalog, key) || Object.hasOwn(fallback, key);
    },
  };
}

export function toolDescription(i18n, name) {
  return i18n.t(`tool.${name}`);
}
