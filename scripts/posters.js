/**
 * Generate a poster still for every video in media/ that lacks one.
 *
 *   npm run posters
 *
 * Posters are what the grid shows before you hover; without one a tile would
 * have to pull the whole source just to paint a thumbnail. Originals are never
 * modified — output goes to media/posters/.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const mediaDir = path.join(root, "media");
const postersDir = path.join(mediaDir, "posters");

const VIDEO_EXT = new Set([".mp4", ".mov", ".webm", ".m4v"]);
const WIDTH = Number(process.env.POSTER_WIDTH) || 720;
const AT = process.env.POSTER_AT || "1";

await fs.mkdir(postersDir, { recursive: true });

const files = (await fs.readdir(mediaDir, { withFileTypes: true }))
  .filter((e) => e.isFile() && !e.name.startsWith("."))
  .filter((e) => VIDEO_EXT.has(path.extname(e.name).toLowerCase()))
  .map((e) => e.name);

let made = 0;
let skipped = 0;

for (const name of files) {
  const out = path.join(postersDir, `${name.replace(/\.[^.]+$/, "")}.jpg`);
  try {
    await fs.access(out);
    skipped++;
    continue;
  } catch {
    // Not generated yet.
  }

  try {
    await run("ffmpeg", [
      "-nostdin", "-v", "error", "-y",
      "-ss", AT,
      "-i", path.join(mediaDir, name),
      "-frames:v", "1",
      "-vf", `scale=${WIDTH}:-2`,
      "-q:v", "4",
      out
    ]);
    console.log(`  made  ${path.basename(out)}`);
    made++;
  } catch (err) {
    console.error(`  FAIL  ${name}: ${err.message.split("\n")[0]}`);
  }
}

console.log(`\n${made} poster(s) generated, ${skipped} already present.`);
