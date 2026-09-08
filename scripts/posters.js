/**
 * Generate a poster still for every video in the library that lacks one.
 *
 *   npm run posters
 *
 * Posters are what the grid shows before you hover; without one a tile would
 * have to pull the whole source just to paint a thumbnail. Originals are never
 * modified — output goes to media/posters/, flat, keyed by the source's stem.
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
const postersDir = path.join(mediaDir, "posters");

const WIDTH = Number(process.env.POSTER_WIDTH) || 720;
const AT = process.env.POSTER_AT || "1";

await fs.mkdir(postersDir, { recursive: true });

const videos = (await walkMedia(path.join(mediaDir, LIBRARY_SUBDIR)))
  .filter((f) => f.type === "video");

let made = 0;
let skipped = 0;

for (const file of videos) {
  const out = path.join(postersDir, `${file.stem}.jpg`);
  try {
    await fs.access(out);
    skipped++;
    continue;
  } catch {
    // Not generated yet.
  }

  try {
    // -ss before -i seeks by keyframe without decoding the run-up, which is the
    // difference between a second and several minutes on a 537 MB source.
    await run("ffmpeg", [
      "-nostdin", "-v", "error", "-y",
      "-ss", AT,
      "-i", file.full,
      "-frames:v", "1",
      "-vf", `scale=${WIDTH}:-2`,
      "-q:v", "4",
      out
    ]);
    console.log(`  made  ${file.stem}.jpg`);
    made++;
  } catch (err) {
    console.error(`  FAIL  ${file.rel}: ${err.message.split("\n")[0]}`);
  }
}

console.log(`\n${made} poster(s) generated, ${skipped} already present.`);
