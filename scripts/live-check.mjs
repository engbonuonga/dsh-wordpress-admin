/**
 * Manual connectivity check against a live site.
 *
 * Credentials are read from the environment so they never land in the repo:
 *   DSH_WP_SITE, DSH_WP_USER, DSH_WP_APP_PASSWORD
 *
 * Usage: node scripts/live-check.mjs [tool] [key=value ...]
 *   node scripts/live-check.mjs wp_site action=health
 *   node scripts/live-check.mjs wp_content action=list type=posts per_page=3
 *
 * Set DSH_WP_ALLOW_DESTRUCTIVE=true to exercise delete actions.
 */

import { normalizeConfig, resolveLocale } from "../src/config.js";
import { createMessages } from "../src/i18n.js";
import { createTools } from "../src/index.js";

const config = normalizeConfig({
  siteUrl: process.env.DSH_WP_SITE,
  username: process.env.DSH_WP_USER,
  appPassword: process.env.DSH_WP_APP_PASSWORD,
  wooConsumerKey: process.env.DSH_WOO_CONSUMER_KEY,
  wooConsumerSecret: process.env.DSH_WOO_CONSUMER_SECRET,
  allowDestructive: process.env.DSH_WP_ALLOW_DESTRUCTIVE === "true",
  locale: process.env.DSH_WP_LOCALE ?? "en",
  timeoutMs: Number(process.env.DSH_WP_TIMEOUT_MS ?? 30_000),
  maxRetries: 1,
});

if (!config.siteUrl || !config.username) {
  console.error("Set DSH_WP_SITE and DSH_WP_USER (and DSH_WP_APP_PASSWORD).");
  process.exit(2);
}

const i18n = createMessages(resolveLocale(config.locale));
const tools = createTools(config, i18n);
const toolName = process.argv[2] ?? "wp_site";

function parseValue(raw) {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^-?\d+$/.test(raw)) return Number.parseInt(raw, 10);
  if (/^[[{]/.test(raw)) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

const args = {};
for (const pair of process.argv.slice(3)) {
  const index = pair.indexOf("=");
  if (index === -1) continue;
  args[pair.slice(0, index)] = parseValue(pair.slice(index + 1));
}
if (Object.keys(args).length === 0) args.action = "info";
const site = tools.find((tool) => tool.name === toolName);

if (!site) {
  console.error(`Unknown tool ${toolName}. Available: ${tools.map((tool) => tool.name).join(", ")}`);
  process.exit(2);
}

try {
  const result = await site.execute(args, {});
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(`FAILED: ${error.message}`);
  process.exitCode = 1;
}
