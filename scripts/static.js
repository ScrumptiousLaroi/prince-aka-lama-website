/**
 * Write the manifest the pages fetch as static files, for GitHub Pages.
 *
 *   npm run static
 *
 * Pages has no server, so data/media.json and data/projects.json are built
 * here — from the local library, which only this machine has — and committed.
 * The Pages workflow publishes them with the rest of public/.
 *
 * Every URL in them must point at the CDN: a /media/ path would 404 on Pages,
 * where media/ does not exist. So this refuses to write anything until every
 * file has been uploaded and is unchanged since (npm run masters, npm run cdn).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildManifest } from "../lib/manifest.js";
import { groupProjects } from "../lib/projects.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "data");

const options = {
  mediaDir: path.join(root, "media"),
  cacheFile: path.join(root, ".cache", "media.json"),
  configFile: path.join(root, "media.config.json"),
  cdnFile: path.join(root, "media.cdn.json")
};

const items = await buildManifest(options);
const projects = groupProjects(await buildManifest({ ...options, includeHidden: true }));

const local = [];
for (const item of [...items, ...projects.flatMap((p) => p.items)]) {
  for (const key of ["src", "display", "thumb", "poster", "preview"]) {
    if (item[key] && !item[key].startsWith("https://")) local.push(`${item.id}  ${key}`);
  }
}
if (local.length) {
  console.error(`${local.length} URL(s) not on the CDN — run npm run masters && npm run cdn:\n`);
  for (const line of [...new Set(local)]) console.error(`  ${line}`);
  process.exit(1);
}

const builtAt = Date.now();
await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(
  path.join(outDir, "media.json"),
  JSON.stringify({ builtAt, count: items.length, items }, null, 2) + "\n"
);
await fs.writeFile(
  path.join(outDir, "projects.json"),
  JSON.stringify({ builtAt, count: projects.length, projects }, null, 2) + "\n"
);

console.log(`public/data: ${items.length} grid items, ${projects.length} projects.`);
