# Setup

## 1. Create an Application Password

1. Sign in to WordPress as an administrator.
2. Open **Users → Profile** (or **Users → All Users → your user**).
3. Scroll to **Application Passwords**.
4. Enter a name such as `DeepSeek Harness`, click **Add New Application Password**.
5. Copy the password exactly — WordPress shows it only once. It looks like `abcd EFGH 1234 ijkl MNOP 6789`; the plugin accepts it with or without spaces.

Application Passwords require HTTPS (or a local environment). If the section is missing, the site may have disabled them through a security plugin or the `wp_is_application_passwords_available` filter — see [WordPress documentation](https://developer.wordpress.org/rest-api/using-the-rest-api/authentication/).

> The user must have the capabilities for the actions you plan to run. `manage_options`, `install_plugins`, `switch_themes` and `edit_theme_options` are administrator-level; a narrower role limits what the tools can do.

## 2. Expose the secrets to the harness

Prefer environment variables over the profile patch, because `cordis.patch.yml` is plain text.

Windows (PowerShell):

```powershell
setx DSH_WP_APP_PASSWORD "abcd EFGH 1234 ijkl MNOP 6789"
```

macOS / Linux:

```bash
echo 'export DSH_WP_APP_PASSWORD="abcd EFGH 1234 ijkl MNOP 6789"' >> ~/.zshrc
```

Restart DeepSeek Harness after `setx` so the process inherits the variable.

## 3. Configure the plugin row

In the profile patch (`~/.dsh/profiles/<profile>/cordis.patch.yml`) add to the inserted row:

```yaml
- insert:
    - id: dsh-wordpress-admin
      name: dsh-wordpress-admin
      config:
        siteUrl: https://example.com
        username: admin
        appPasswordEnv: DSH_WP_APP_PASSWORD
        locale: auto
        allowDestructive: false
        timeoutMs: 30000
        maxRetries: 2
        perPageDefault: 20
```

Restart the app. Then ask the model to run `wp_site` with `action: "info"` — a working setup reports the site name, your user and a capability list.

## 4. WooCommerce (optional)

`wp_shop` needs WooCommerce REST credentials:

1. **WooCommerce → Settings → Advanced → REST API → Add key**.
2. Permissions: **Read/Write** for editing, **Read** for reporting only.
3. Copy the consumer key (`ck_…`) and consumer secret (`cs_…`).
4. Expose them as `DSH_WOO_CONSUMER_KEY` / `DSH_WOO_CONSUMER_SECRET`, or set `wooConsumerKey` / `wooConsumerSecret` in the config.

If WooCommerce is not installed the `wp_shop` tool stays registered but every call returns a localized "not configured" error.

## 5. Companion plugin for menus (optional)

WordPress core exposes no REST route for classic menus. Install `wordpress-plugin/dsh-bridge` when you need menu CRUD or menu location assignment:

1. Zip the `wordpress-plugin/dsh-bridge` folder.
2. **Plugins → Add New → Upload Plugin**, choose the zip, install and activate.
3. `wp_admin` with `resource: "bridge", action: "status"` should now report `installed: true`.
4. `wp_site` info will show `bridge.installed: true`.

The bridge only adds routes under `dsh-bridge/v1`, requires `edit_theme_options`, and does not modify content otherwise.

## 6. Multiple sites

Add one inserted row per site with a distinct `id` and `siteUrl`. Each row has its own credentials and configuration; tools address them independently.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `unauthorized` error | wrong password, missing user, or Application Passwords disabled | recreate the password, confirm HTTPS |
| `restUnavailable` | REST API blocked by a security plugin, or wrong `siteUrl` | open `https://site/wp-json/` in a browser |
| `forbidden` | the user lacks the capability for that action | use an administrator or adjust the role |
| timeouts on shared hosting | slow TTFB (a shared-host site measured ~6 s) | raise `timeoutMs` to 45000–60000 |
| `bridgeUnavailable` | companion plugin missing or inactive | install/activate `dsh-bridge`, retry |
| `wooNotConfigured` | no consumer key/secret | add WooCommerce keys |
