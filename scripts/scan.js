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
const mark = (ok) => (ok ? "yes" : "MISSING");

console.log(`${items.length} items\n`);
console.log(
  pad("TYPE", 6) + pad("COMPANY", 15) + pad("TITLE", 26) +
  pad("SIZE", 12) + pad("THUMB", 9) + pad("POSTER", 9) + "LOOP/WEB"
);

for (const i of items) {
  console.log(
    pad(i.type, 6) +
      pad(i.company, 15) +
      pad(i.title, 26) +
      pad(`${i.w}x${i.h}`, 12) +
      pad(mark(i.thumb), 9) +
      pad(i.type === "video" ? mark(i.poster) : "-", 9) +
      (i.type === "video" ? mark(i.preview) : mark(i.display && i.display !== i.src))
  );
}

const by = new Map();
for (const i of items) by.set(i.company, (by.get(i.company) || 0) + 1);
console.log("\nper company:");
for (const [name, n] of [...by].sort()) console.log(`  ${pad(name, 16)}${n}`);
