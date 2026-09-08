/**
 * Generate a small texture for every library item.
 *
 *   npm run thumbs
 *
 * These feed the three.js opening, where each item becomes a GPU texture. Full
 * resolution is not an option there — a 23 MB JPEG is roughly 100 MB of VRAM
 * once decoded, and the dome holds dozens at once.
 *
 * Aspect ratio is preserved, not cropped square: these same planes flatten into
 * the grid at the end of the opening, and they have to match the shape of the
 * tile the DOM then draws in their place. Grayscale, to match the grid's
 * resting treatment. Originals are untouched.
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
const thumbsDir = path.join(mediaDir, "thumbs");

const SIZE = Number(process.env.THUMB_SIZE) || 512;  // long edge

await fs.mkdir(thumbsDir, { recursive: true });

const files = await walkMedia(path.join(mediaDir, LIBRARY_SUBDIR));

let made = 0;
let skipped = 0;

for (const file of files) {
  const out = path.join(thumbsDir, `${file.stem}.jpg`);

  try {
    await fs.access(out);
    skipped++;
    continue;
  } catch {
    // Not generated yet.
  }

  // Videos come from their poster when one exists — decoding a frame out of a
  // 537 MB source again would be pointless. Same for stills and their web copy.
  let input = file.full;
  const args = ["-nostdin", "-v", "error", "-y"];

  if (file.type === "video") {
    const poster = path.join(mediaDir, "posters", `${file.stem}.jpg`);
    try {
      await fs.access(poster);
      input = poster;
    } catch {
      args.push("-ss", "1");
    }
  } else {
    const web = path.join(mediaDir, "web", `${file.stem}.jpg`);
    try {
      await fs.access(web);
      input = web;
    } catch {
      // Fall back to the original still.
    }
  }

  args.push(
    "-i", input,
    "-frames:v", "1",
    "-vf",
      `scale='if(gt(iw,ih),${SIZE},-2)':'if(gt(iw,ih),-2,${SIZE})',format=gray`,
    "-q:v", "5",
    out
  );

  try {
    await run("ffmpeg", args);
    console.log(`  made  ${file.stem}.jpg`);
    made++;
  } catch (err) {
    console.error(`  FAIL  ${file.rel}: ${err.message.split("\n")[0]}`);
  }
}

console.log(`\n${made} thumbnail(s) generated, ${skipped} already present.`);
