import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { walkMedia, LIBRARY_SUBDIR } from "./media-files.js";

const run = promisify(execFile);

/**
 * Probe one file's pixel dimensions. Returns null for anything ffprobe cannot
 * read as video — an audio-only .mp4, for instance, which has no place in a
 * visual grid.
 */
async function probe(file) {
  try {
    const { stdout } = await run("ffprobe", [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height",
      "-of", "csv=p=0:s=x",
      file
    ]);
    // One line per matching stream — and files carrying a stream group (the
    // Dolby Vision masters here do) report the same stream twice, so splitting
    // the whole output on "x" yields a NaN height. Take the first line only.
    const line = stdout.split("\n").map((l) => l.trim()).find(Boolean);
    if (!line) return null;
    const [w, h] = line.split("x").map(Number);
    if (!w || !h) return null;
    return { w, h };
  } catch {
    return null;
  }
}

/** Title Case from a filename, minus camera-roll noise like "_DSC0266". */
function titleFrom(name) {
  const base = name.replace(/\.[^.]+$/, "");
  if (/^_?DSC\d+/i.test(base) || /^C\d+_\d+$/i.test(base) || /^\d+$/.test(base)) {
    return base.replace(/[_-]+/g, " ").trim();
  }
  return base
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** "URBAN COMPANy" is how the folder is spelled; the grid should not shout. */
function companyLabel(name) {
  return name
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Deal one item from each company in turn, so neither the grid nor the opening
 * ever lands a run of one client in a single row. Companies with more work
 * simply keep dealing after the smaller ones run out.
 */
function interleaveByCompany(items) {
  const buckets = new Map();
  for (const item of items) {
    if (!buckets.has(item.company)) buckets.set(item.company, []);
    buckets.get(item.company).push(item);
  }

  // Within a company, alternate film and still for the same reason.
  for (const [name, list] of buckets) {
    const videos = list.filter((i) => i.type === "video");
    const images = list.filter((i) => i.type === "image");
    const mixed = [];
    const total = videos.length + images.length;
    let vi = 0;
    let ii = 0;
    for (let i = 0; i < total; i++) {
      const wantVideo =
        videos.length && vi / videos.length <= ii / (images.length || 1);
      if (wantVideo && vi < videos.length) mixed.push(videos[vi++]);
      else if (ii < images.length) mixed.push(images[ii++]);
      else if (vi < videos.length) mixed.push(videos[vi++]);
    }
    buckets.set(name, mixed);
  }

  const out = [];
  const lists = [...buckets.values()];
  for (let round = 0; out.length < items.length; round++) {
    for (const list of lists) if (list[round]) out.push(list[round]);
  }
  return out;
}

/**
 * Build the media manifest by scanning `mediaDir/heroSection`.
 *
 * ffprobe is slow on 500 MB sources, so results are cached in `cacheFile` and
 * keyed by size+mtime — a file only gets re-probed when it actually changes.
 * Per-item titles and captions come from `configFile`, keyed by the file's path
 * relative to the library root, so real project names survive a rescan.
 */
export async function buildManifest({ mediaDir, cacheFile, configFile }) {
  let overrides = {};
  try {
    overrides = JSON.parse(await fs.readFile(configFile, "utf8"));
  } catch {
    // No overrides file is fine — everything falls back to derived defaults.
  }

  let cache = {};
  try {
    cache = JSON.parse(await fs.readFile(cacheFile, "utf8"));
  } catch {
    // Cold cache.
  }

  const libraryDir = path.join(mediaDir, LIBRARY_SUBDIR);
  const files = await walkMedia(libraryDir);
  const nextCache = {};
  const items = [];

  // URLs are built from the path under media/, so the browser asks for the
  // original where it sits rather than needing a flattened copy of 3.5 GB.
  const urlFor = (rel) =>
    "/media/" +
    [LIBRARY_SUBDIR, ...rel.split(path.sep)].map(encodeURIComponent).join("/");

  /**
   * A derivative's URL, carrying a token derived from its size and mtime, or
   * null when it has not been generated.
   *
   * The token is what makes regenerating a derivative safe. Derivative paths
   * are stable — re-running `npm run loops` rewrites the same filename — and
   * /media is served with a 7-day max-age, so without it a browser that cached
   * the old bytes keeps playing them for a week. That is not a hypothetical:
   * it is exactly what happens after any `npm run media`.
   */
  const derivative = async (dirName, fileName) => {
    const abs = path.join(mediaDir, dirName, fileName);
    let stat;
    try {
      stat = await fs.stat(abs);
    } catch {
      return null; // Not generated.
    }
    const token = (
      Math.round(stat.mtimeMs).toString(36) + stat.size.toString(36)
    ).slice(-10);
    return `/media/${dirName}/${encodeURIComponent(fileName)}?v=${token}`;
  };

  for (const file of files) {
    const stat = await fs.stat(file.full);
    const key = `${file.rel}:${stat.size}:${Math.round(stat.mtimeMs)}`;

    let dims = cache[key];
    if (!dims) {
      dims = await probe(file.full);
      if (!dims) continue; // audio-only or unreadable — not grid material
    }
    nextCache[key] = dims;

    const override = overrides[file.rel] || {};
    if (override.hidden) continue;

    const base = path.basename(file.rel);
    const item = {
      id: file.rel,
      type: file.type,
      company: file.company,
      src: urlFor(file.rel),
      title: override.title || titleFrom(base),
      caption: override.caption || companyLabel(file.company),
      w: dims.w,
      h: dims.h
    };

    // Display-resolution copy for the grid. The original stays on `src` for
    // the full-size view — see scripts/derivatives.js for why tiles cannot
    // use it directly.
    if (file.type === "image") {
      item.display = (await derivative("web", `${file.stem}.jpg`)) || item.src;
    }

    // Small texture for the three.js opening, when one has been made.
    const thumb = await derivative("thumbs", `${file.stem}.jpg`);
    if (thumb) item.thumb = thumb;

    if (file.type === "video") {
      const poster = await derivative("posters", `${file.stem}.jpg`);
      if (poster) item.poster = poster;

      // Hover playback pulls this, never `src`. The sources run to 537 MB;
      // see scripts/loops.js.
      const preview = await derivative("loops", `${file.stem}.mp4`);
      if (preview) item.preview = preview;
    }

    items.push(item);
  }

  await fs.mkdir(path.dirname(cacheFile), { recursive: true });
  await fs.writeFile(cacheFile, JSON.stringify(nextCache, null, 2));

  // An explicit `order` array in the config wins over the automatic interleave.
  if (Array.isArray(overrides.order) && overrides.order.length) {
    const rank = new Map(overrides.order.map((n, i) => [n, i]));
    return items.sort(
      (a, b) =>
        (rank.get(a.id) ?? 1e6) - (rank.get(b.id) ?? 1e6) ||
        a.id.localeCompare(b.id, undefined, { numeric: true })
    );
  }

  return interleaveByCompany(items);
}
