/**
 * Generate display-resolution copies of every still in the library.
 *
 *   npm run derivatives
 *
 * The grid cannot render originals. A 6192x4128 photograph is about 102 MB once
 * the browser decodes it to RGBA, and the grid holds two dozen at a time — any
 * transform on the stage forces them all to rasterize at once and the renderer
 * runs out of memory. These copies are what tiles display; the full-size view
 * still loads the original, which is the only place the detail matters.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { walkMedia, LIBRARY_SUBDIR } from "../lib/media-files.js";

const run = promisify(execFile);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const mediaDir = path.join(root, "media");
const webDir = path.join(mediaDir, "web");

const MAX = Number(process.env.DERIVATIVE_MAX) || 1600;

await fs.mkdir(webDir, { recursive: true });

const files = (await walkMedia(path.join(mediaDir, LIBRARY_SUBDIR)))
  .filter((f) => f.type === "image");

let made = 0;
let skipped = 0;
let saved = 0;

for (const file of files) {
  const out = path.join(webDir, `${file.stem}.jpg`);

  try {
    await fs.access(out);
    skipped++;
    continue;
  } catch {
    // Not generated yet.
  }

  try {
    // Downscale the long edge to MAX, leaving anything already smaller alone.
    await run("ffmpeg", [
      "-nostdin", "-v", "error", "-y",
      "-i", file.full,
      "-vf",
        `scale='if(gt(iw,ih),min(${MAX},iw),-2)':'if(gt(iw,ih),-2,min(${MAX},ih))'`,
      "-q:v", "3",
      out
    ]);

    const before = (await fs.stat(file.full)).size;
    const after = (await fs.stat(out)).size;
    saved += before - after;
    console.log(
      `  made  ${file.stem}.jpg  ${(before / 1e6).toFixed(1)}MB -> ${(after / 1e6).toFixed(1)}MB`
    );
    made++;
  } catch (err) {
    console.error(`  FAIL  ${file.rel}: ${err.message.split("\n")[0]}`);
  }
}

console.log(
  `\n${made} derivative(s) generated, ${skipped} already present` +
    (made ? `, ${(saved / 1e6).toFixed(0)} MB saved per full load.` : ".")
);
