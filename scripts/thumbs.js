/**
 * Generate a small texture for every grid item.
 *
 *   npm run thumbs
 *
 * These feed the three.js opening, where each item becomes a GPU texture. Full
 * resolution is not an option there — a 45 MB PNG is roughly 100 MB of VRAM
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

const run = promisify(execFile);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const mediaDir = path.join(root, "media");
const thumbsDir = path.join(mediaDir, "thumbs");

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);
const VIDEO_EXT = new Set([".mp4", ".mov", ".webm", ".m4v"]);
const SIZE = Number(process.env.THUMB_SIZE) || 512;  // long edge

await fs.mkdir(thumbsDir, { recursive: true });

const entries = (await fs.readdir(mediaDir, { withFileTypes: true }))
  .filter((e) => e.isFile() && !e.name.startsWith("."));

let made = 0;
let skipped = 0;

for (const entry of entries) {
  const ext = path.extname(entry.name).toLowerCase();
  const isVideo = VIDEO_EXT.has(ext);
  const isImage = IMAGE_EXT.has(ext);
  if (!isVideo && !isImage) continue;

  const stem = entry.name.replace(/\.[^.]+$/, "");
  const out = path.join(thumbsDir, `${stem}.jpg`);

  try {
    await fs.access(out);
    skipped++;
    continue;
  } catch {
    // Not generated yet.
  }

  // Videos come from their poster when one exists — decoding a frame out of a
  // 300 MB source again would be pointless.
  let input = path.join(mediaDir, entry.name);
  const args = ["-nostdin", "-v", "error", "-y"];
  if (isVideo) {
    const poster = path.join(mediaDir, "posters", `${stem}.jpg`);
    try {
      await fs.access(poster);
      input = poster;
    } catch {
      args.push("-ss", "1");
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
    console.log(`  made  ${stem}.jpg`);
    made++;
  } catch (err) {
    console.error(`  FAIL  ${entry.name}: ${err.message.split("\n")[0]}`);
  }
}

console.log(`\n${made} thumbnail(s) generated, ${skipped} already present.`);
