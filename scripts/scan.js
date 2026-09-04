/**
 * Print the manifest the server would build, without starting it.
 *
 *   npm run scan
 *
 * Useful for checking that a newly added file is picked up, that its
 * dimensions probed correctly, and that media.config.json overrides applied.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildManifest } from "../lib/manifest.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const items = await buildManifest({
  mediaDir: path.join(root, "media"),
  cacheFile: path.join(root, ".cache", "media.json"),
  configFile: path.join(root, "media.config.json")
});

const pad = (s, n) => String(s).padEnd(n);
console.log(`${items.length} items\n`);
console.log(`${pad("TYPE", 6)}${pad("TITLE", 24)}${pad("CAPTION", 13)}${pad("SIZE", 12)}POSTER`);

for (const i of items) {
  console.log(
    pad(i.type, 6) +
      pad(i.title, 24) +
      pad(i.caption, 13) +
      pad(`${i.w}x${i.h}`, 12) +
      (i.type === "video" ? (i.poster ? "yes" : "MISSING") : "-")
  );
}
