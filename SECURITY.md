# Security policy

## Supported versions

The latest minor release receives fixes. Pre-1.0 versions are supported on a best-effort basis.

## Reporting a vulnerability

Open a private security advisory on this repository, or email the maintainer listed in `package.json`. Do not publish an issue with exploit details before a fix is available. Expect an acknowledgement within a few days.

## Credential handling

- The plugin authenticates with a WordPress **Application Password** over HTTPS. The password is single-purpose and revocable from **Users → Profile → Application Passwords**.
- Preferred configuration is environment indirection: `appPasswordEnv`, `wooKeyEnv`, `wooSecretEnv`. Inline values are supported but `cordis.patch.yml` is plain text, so keep it out of version control.
- Credentials are only sent to the configured `siteUrl`; the plugin has no telemetry, analytics or update pings.
- Application passwords appear in request headers only. The plugin does not log request headers, never puts secrets in URLs, and redacts them from error messages.

## Safe defaults

- Every delete action is refused unless the operator sets `allowDestructive: true`.
- Plugin installs, theme activation and settings updates are privileged and clearly described so the model can confirm with the user first.
- Local file uploads resolve inside the agent workspace with a traversal guard; remote uploads are restricted to http(s) and the 25 MB cap.

## Least privilege

For day-to-day content work, prefer a WordPress account with the content capabilities you need rather than a full administrator, and keep `allowDestructive` off. Application Passwords inherit the user's capabilities, so account choice is the main control.
