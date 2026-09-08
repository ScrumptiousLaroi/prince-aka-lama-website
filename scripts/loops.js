/**
 * Generate a short, silent, web-weight loop for every video in the library.
 *
 *   npm run loops
 *
 * Tiles play these on hover, never the originals. The sources are camera and
 * delivery masters — 537 MB for the largest — and a browser asked to stream one
 * on a mouseover would spend the whole hover buffering. A 720p, 8-second,
 * faststart clip is a couple of megabytes and starts instantly.
 *
 * Audio is kept. Tiles start muted, but Audio2 unmutes the hovered one once the
 * page has had a user gesture — so the loop is what the visitor actually hears,
 * and a loop encoded without an audio track is silent no matter what the sound
 * toggle says. Sources with no audio stream simply come out video-only.
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
const loopsDir = path.join(mediaDir, "loops");

const HEIGHT = Number(process.env.LOOP_HEIGHT) || 720;
const SECONDS = Number(process.env.LOOP_SECONDS) || 8;
const START = process.env.LOOP_AT || "0";
const CRF = Number(process.env.LOOP_CRF) || 26;
const ABITRATE = process.env.LOOP_AUDIO_BITRATE || "128k";

await fs.mkdir(loopsDir, { recursive: true });

const videos = (await walkMedia(path.join(mediaDir, LIBRARY_SUBDIR)))
  .filter((f) => f.type === "video");

let made = 0;
let skipped = 0;

for (const file of videos) {
  const out = path.join(loopsDir, `${file.stem}.mp4`);

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
      "-ss", START,
      "-t", String(SECONDS),
      "-i", file.full,
      "-vf", `scale=-2:'min(${HEIGHT},ih)'`,
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", String(CRF),
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", ABITRATE,
      "-ac", "2",
      // Take the first video and, if there is one, the first audio stream. The
      // masters also carry timecode/data streams that mp4 will not accept.
      "-map", "0:v:0",
      "-map", "0:a:0?",
      // Metadata up front, so playback can begin on the first bytes received.
      "-movflags", "+faststart",
      out
    ], { maxBuffer: 1 << 24 });

    const before = (await fs.stat(file.full)).size;
    const after = (await fs.stat(out)).size;
    console.log(
      `  made  ${file.stem}.mp4  ${(before / 1e6).toFixed(0)}MB -> ${(after / 1e6).toFixed(1)}MB`
    );
    made++;
  } catch (err) {
    console.error(`  FAIL  ${file.rel}: ${err.message.split("\n")[0]}`);
  }
}

console.log(`\n${made} loop(s) generated, ${skipped} already present.`);
