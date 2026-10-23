import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const buildConfig = path.join(root, "dist/server/wrangler.json");
if (!existsSync(buildConfig)) {
  console.error("Build first with npm run build, or use npm run setup.");
  process.exit(1);
}
const built = JSON.parse(readFileSync(buildConfig, "utf8"));
const runtime = path.join(root, ".sites-runtime");
mkdirSync(runtime, { recursive: true });
const configPath = path.join(runtime, "local-database.json");
writeFileSync(configPath, JSON.stringify({
  name: "life-os-local",
  compatibility_date: built.compatibility_date,
  d1_databases: built.d1_databases.map(database => ({
    ...database,
    migrations_dir: path.join(root, "drizzle"),
  })),
}, null, 2) + "\n");
const result = spawnSync(process.execPath, [
  "--import", path.join(root, "scripts/sites-env.mjs"),
  path.join(root, "node_modules/wrangler/bin/wrangler.js"),
  "d1", "migrations", "apply", "DB", "--local", "--config", configPath,
  "--persist-to", path.join(root, ".wrangler/state"),
], { cwd: root, stdio: ["ignore", "inherit", "inherit"], env: { ...process.env, CI: "true" } });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
