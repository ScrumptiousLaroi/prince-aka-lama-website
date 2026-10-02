/**
 * Upload everything the site serves to Cloudinary and record where it went.
 *
 *   npm run cdn                  everything
 *   npm run cdn -- thumbs loops  only those folders
 *
 * Reads CLOUDINARY_URL (cloudinary://<key>:<secret>@<cloud>) from the
 * environment or from .env. For every file in the library it uploads:
 *
 *   masters/  the full-size view — a web master (npm run masters), or the
 *             original still when it is small enough to need none
 *   web/      display stills for the grid tiles
 *   thumbs/   textures for the three.js opening
 *   posters/  video stills
 *   loops/    hover clips
 *
 * Results land in media.cdn.json, keyed by the file's path under media/, with
 * the size and mtime that were uploaded. lib/manifest.js serves a CDN URL only
 * while those still match the file on disk, so an edited file falls back to the
 * local copy until it is re-uploaded — never a stale CDN version. Re-running
 * uploads only what is new or changed.
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { walkMedia, LIBRARY_SUBDIR } from "../lib/media-files.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const mediaDir = path.join(root, "media");
const mapFile = path.join(root, "media.cdn.json");

const FOLDER = process.env.CDN_FOLDER || "lama";
const CONCURRENCY = 3;
/** Cloudinary wants anything over 100 MB chunked; chunking from 20 MB keeps each request small. */
const CHUNK = 20 * 1024 * 1024;

/* --- credentials ------------------------------------------------------- */

async function cloudinaryUrl() {
  if (process.env.CLOUDINARY_URL) return process.env.CLOUDINARY_URL;
  try {
    const env = await fs.readFile(path.join(root, ".env"), "utf8");
    const line = env.split("\n").find((l) => l.startsWith("CLOUDINARY_URL="));
    if (line) return line.slice("CLOUDINARY_URL=".length).trim();
  } catch {
    // No .env.
  }
  return null;
}

const raw = await cloudinaryUrl();
const match = raw && raw.match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/);
if (!match) {
  console.error("CLOUDINARY_URL is missing or malformed. Expected cloudinary://<key>:<secret>@<cloud>.");
  process.exit(1);
}
const [, API_KEY, API_SECRET, CLOUD] = match;

/* --- what to upload ---------------------------------------------------- */

const exists = (p) => fs.access(p).then(() => true, () => false);

const files = await walkMedia(path.join(mediaDir, LIBRARY_SUBDIR));
const jobs = [];

for (const file of files) {
  const video = file.type === "video";
  const candidates = [];

  // The full-size source: the web master if one exists, else (stills only) the
  // original. A film without a master is skipped rather than uploading 500 MB.
  const master = `masters/${file.stem}.${video ? "mp4" : "jpg"}`;
  if (await exists(path.join(mediaDir, master))) candidates.push(master);
  else if (!video) candidates.push([LIBRARY_SUBDIR, ...file.rel.split(path.sep)].join("/"));
  else console.warn(`  skip  ${file.rel}: no master — run npm run masters`);

  if (!video) candidates.push(`web/${file.stem}.jpg`);
  candidates.push(`thumbs/${file.stem}.jpg`);
  if (video) candidates.push(`posters/${file.stem}.jpg`, `loops/${file.stem}.mp4`);

  for (const key of candidates) {
    if (!(await exists(path.join(mediaDir, key)))) continue;
    // Originals share the masters folder: either way it is "the full-size one".
    const dir = key.startsWith(`${LIBRARY_SUBDIR}/`) ? "masters" : key.split("/")[0];
    jobs.push({
      key,
      publicId: `${FOLDER}/${dir}/${file.stem}`,
      resourceType: key.endsWith(".mp4") ? "video" : "image"
    });
  }
}

// `npm run cdn -- thumbs posters` limits a run to those folders.
const only = process.argv.slice(2);
if (only.length) {
  const keep = jobs.filter((j) => only.some((d) => j.publicId.startsWith(`${FOLDER}/${d}/`)));
  jobs.splice(0, jobs.length, ...keep);
}

let map = {};
try {
  map = JSON.parse(await fs.readFile(mapFile, "utf8"));
} catch {
  // First run.
}

/* --- upload ------------------------------------------------------------ */

function sign(params) {
  const base = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return crypto.createHash("sha1").update(base + API_SECRET).digest("hex");
}

async function upload(job, abs, size) {
  const params = {
    invalidate: "true",
    overwrite: "true",
    public_id: job.publicId,
    timestamp: String(Math.floor(Date.now() / 1000))
  };
  const signature = sign(params);
  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUD}/${job.resourceType}/upload`;
  const bytes = await fs.readFile(abs);
  const uploadId = crypto.randomUUID();
  const name = path.basename(abs);

  let result;
  for (let start = 0; start < size || start === 0; start += CHUNK) {
    const end = Math.min(start + CHUNK, size);
    const form = new FormData();
    for (const [k, v] of Object.entries(params)) form.append(k, v);
    form.append("api_key", API_KEY);
    form.append("signature", signature);
    form.append("file", new Blob([bytes.subarray(start, end)]), name);

    const headers = size > CHUNK
      ? { "X-Unique-Upload-Id": uploadId, "Content-Range": `bytes ${start}-${end - 1}/${size}` }
      : {};
    const res = await fetch(endpoint, { method: "POST", body: form, headers });
    result = await res.json().catch(() => ({}));
    if (!res.ok || result.error) {
      throw new Error(result.error?.message || `HTTP ${res.status}`);
    }
    if (end >= size) break;
  }
  return result;
}

let saving = Promise.resolve();
const save = () =>
  (saving = saving.then(() => {
    const sorted = Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));
    return fs.writeFile(mapFile, JSON.stringify(sorted, null, 2) + "\n");
  }));

let uploaded = 0;
let unchanged = 0;
let failed = 0;
let next = 0;

async function worker() {
  while (next < jobs.length) {
    const job = jobs[next++];
    const abs = path.join(mediaDir, job.key);
    const stat = await fs.stat(abs);
    const mtime = Math.round(stat.mtimeMs);
    const prior = map[job.key];
    if (prior && prior.size === stat.size && prior.mtime === mtime) {
      unchanged++;
      continue;
    }
    try {
      const r = await upload(job, abs, stat.size);
      map[job.key] = { url: r.secure_url, type: job.resourceType, size: stat.size, mtime };
      await save();
      uploaded++;
      console.log(`  up    ${job.key}  ${(stat.size / 1e6).toFixed(1)}MB`);
    } catch (err) {
      failed++;
      console.error(`  FAIL  ${job.key}: ${err.message}`);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
await saving;

console.log(`\n${uploaded} uploaded, ${unchanged} unchanged, ${failed} failed (of ${jobs.length}).`);
if (failed) process.exit(1);
