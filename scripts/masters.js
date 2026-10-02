/**
 * Generate web-weight masters — what the full-size view plays and shows.
 *
 *   npm run masters
 *
 * The library originals are camera and delivery files: 4K films up to 537 MB
 * and stills up to 16 MB. They are fine to serve off a local disk, but they are
 * over the CDN's per-file limits (100 MB video, 10 MB image on the free plan)
 * and would burn its bandwidth on every full-size view. These copies are what
 * `npm run cdn` uploads in their place:
 *
 *   - every film: short edge capped at 1080, H.264 at a bitrate ceiling that
 *     keeps a 60s film around 60 MB, faststart so playback begins at once
 *   - stills over 10 MB: long edge capped at 3840. Smaller stills need no
 *     master; the original uploads as it is.
 *
 * Only what is missing gets generated, so it is cheap to re-run.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { walkMedia, LIBRARY_SUBDIR, IMAGE_MASTER_LIMIT } from "../lib/media-files.js";

const run = promisify(execFile);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const mediaDir = path.join(root, "media");
const mastersDir = path.join(mediaDir, "masters");

const SHORT_EDGE = Number(process.env.MASTER_SHORT_EDGE) || 1080;
const MAXRATE = process.env.MASTER_MAXRATE || "7M";
const IMAGE_MAX = Number(process.env.MASTER_IMAGE_MAX) || 3840;

await fs.mkdir(mastersDir, { recursive: true });

const files = await walkMedia(path.join(mediaDir, LIBRARY_SUBDIR));

let made = 0;
let skipped = 0;

for (const file of files) {
  const isVideo = file.type === "video";
  const size = (await fs.stat(file.full)).size;
  if (!isVideo && size <= IMAGE_MASTER_LIMIT) continue;

  const out = path.join(mastersDir, `${file.stem}.${isVideo ? "mp4" : "jpg"}`);
  try {
    await fs.access(out);
    skipped++;
    continue;
  } catch {
    // Not generated yet.
  }

  const args = isVideo
    ? [
        "-nostdin", "-v", "error", "-y",
        "-i", file.full,
        // Cap the short edge, so portrait and landscape films land at the same
        // weight; anything already smaller is left alone.
        "-vf",
          `scale='if(gt(iw,ih),-2,min(${SHORT_EDGE},iw))':'if(gt(iw,ih),min(${SHORT_EDGE},ih),-2)'`,
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "21",
        "-maxrate", MAXRATE,
        "-bufsize", "14M",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "160k",
        "-ac", "2",
        // Timecode and data streams in the masters are not welcome in mp4.
        "-map", "0:v:0",
        "-map", "0:a:0?",
        "-movflags", "+faststart",
        out
      ]
    : [
        "-nostdin", "-v", "error", "-y",
        "-i", file.full,
        "-vf",
          `scale='if(gt(iw,ih),min(${IMAGE_MAX},iw),-2)':'if(gt(iw,ih),-2,min(${IMAGE_MAX},ih))'`,
        "-q:v", "2",
        out
      ];

  try {
    await run("ffmpeg", args, { maxBuffer: 1 << 24 });
    const after = (await fs.stat(out)).size;
    console.log(
      `  made  ${path.basename(out)}  ${(size / 1e6).toFixed(0)}MB -> ${(after / 1e6).toFixed(1)}MB`
    );
    made++;
  } catch (err) {
    console.error(`  FAIL  ${file.rel}: ${err.message.split("\n")[0]}`);
  }
}

console.log(`\n${made} master(s) generated, ${skipped} already present.`);
