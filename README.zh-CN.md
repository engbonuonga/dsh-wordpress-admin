# dsh-wordpress-admin

在 [DeepSeek Harness](https://github.com/deepseek-ai) 中完整管理 WordPress 与 WooCommerce：通过 WordPress REST API 与应用密码，在对话中创建和编辑文章、页面、产品、媒体、主题、插件、区块模板与菜单。

- **五个聚焦工具**，而不是几十个接口：`wp_site`、`wp_content`、`wp_media`、`wp_shop`、`wp_admin`。
- **中英双语**：工具说明与错误提示跟随宿主语言，中文环境自动使用中文。
- **默认安全**：删除操作默认被拒绝，只有配置 `allowDestructive: true` 才会执行；凭据可放在环境变量中。
- **运行时零依赖**：使用 Node 内置 `fetch`，无需额外 MCP 服务；核心功能不依赖 WordPress 插件。
- **可选配套插件**（`wordpress-plugin/dsh-bridge`）：提供经典菜单与菜单位置接口，WordPress 核心 REST API 不提供这些能力。

## 环境要求

| 项目 | 要求 |
| --- | --- |
| DeepSeek Harness | 0.2.x |
| Node.js | 22.19 或更高（Harness 自带运行时即可） |
| WordPress | 6.0 或更高，REST API 可访问，已启用应用密码 |
| WooCommerce | 可选，用于 `wp_shop` |
| 站点账号 | 管理员，或具备所需权限的角色 |

## 安装

### 从插件市场安装

在 DSH 的 **插件 → 发现（Discover）** 中搜索 **dsh-wordpress-admin** 并安装。市场会从本仓库最新的 GitHub Release 读取 `dsh-wordpress-admin.tgz`，无需 npm 账号。

### 从本地目录安装

在 DSH 插件页面选择“从包目录安装”，或使用等效的 `plugin_manager` 安装操作，指向本目录的绝对路径。补丁会自动应用，之后重启应用。

## 配置

编辑配置补丁（`~/.dsh/profiles/<profile>/cordis.patch.yml`），为插入的行添加配置：

```yaml
- insert:
    - id: dsh-wordpress-admin
      name: dsh-wordpress-admin
      config:
        siteUrl: https://example.com
        username: admin
        appPasswordEnv: DSH_WP_APP_PASSWORD
        # WooCommerce（可选）
        wooKeyEnv: DSH_WOO_CONSUMER_KEY
        wooSecretEnv: DSH_WOO_CONSUMER_SECRET
        locale: auto            # auto | en | zh
        allowDestructive: false # 设为 true 才允许删除
        timeoutMs: 30000
        maxRetries: 2
        perPageDefault: 20
```

在启动 DSH 的环境中设置密钥（不要提交到仓库）：

```powershell
# Windows
setx DSH_WP_APP_PASSWORD "xxxx xxxx xxxx xxxx xxxx xxxx"
```

```bash
# macOS / Linux
export DSH_WP_APP_PASSWORD="xxxx xxxx xxxx xxxx xxxx xxxx"
```

也可以直接填写 `appPassword`、`wooConsumerKey`、`wooConsumerSecret`，但配置补丁是明文文件，建议优先使用环境变量。

完整步骤（创建应用密码、WooCommerce 密钥）：[docs/SETUP.md](docs/SETUP.md)。

## 工具

| 工具 | 作用 |
| --- | --- |
| `wp_site` | 连接信息、权限报告、健康检查/延迟、读取与更新站点设置 |
| `wp_content` | 文章、页面及任何启用 REST 的内容类型：列表、读取、创建、更新、删除 |
| `wp_media` | 媒体库：列表、读取、上传（URL、base64 或工作区文件）、更新替代文本/标题/说明、删除 |
| `wp_shop` | WooCommerce 产品、变体、订单、优惠券、客户、评价，支持批量操作 |
| `wp_admin` | 插件（列表/安装/启用/停用/删除）、主题（列表/启用）、区块模板、菜单（需配套插件） |

参数详解：[docs/TOOLS.md](docs/TOOLS.md)。

### 示例

```
先用 wp_site 检查 example 站点是否可访问，再用 wp_content 列出我最近的五篇草稿。
```

```
创建一篇 900 字的草稿，标题为“基苏木 Cabro 铺装维护指南”，使用 https://…/cabro.jpg 作为特色图片，并归入“指南”分类。
```

```
把 build/site-plan.pdf 上传到媒体库，标题设为“基苏木场地平面图”，设置替代文本，然后附加到 42 号页面。
```

## 安全

- 应用密码可随时在 **用户 → 个人资料 → 应用密码** 中撤销；插件只使用这一个密码。
- `allowDestructive: false`（默认）会拦截所有删除类操作，包括媒体和插件。
- 安装插件、切换主题、修改站点设置属于高权限操作。执行前请与模型确认；日常内容工作可以另建权限更小的 WordPress 账号。
- 插件只会把凭据发送到配置的 `siteUrl`。

## 限制

- WordPress 核心没有安装主题的 REST 接口；`wp_admin` 可以列出和启用已安装主题，但不能安装新主题，请使用 WordPress 后台或 WP-CLI。
- 经典菜单与菜单位置需要启用 `wordpress-plugin/dsh-bridge` 配套插件。
- 单次上传上限 25 MB，优先使用公网 URL 或工作区路径；base64 适合小文件。
- 一行配置对应一个站点。管理多个站点时，用不同的 `id` 再插入一行。

## 开发

```bash
npm test          # node:test，内置 WordPress 模拟服务器
npm run pack:check
```

测试会启动进程内 WordPress 模拟服务，不需要网络或真实站点。

## 许可证

MIT © Brian Onuonga。见 [LICENSE](LICENSE)。
