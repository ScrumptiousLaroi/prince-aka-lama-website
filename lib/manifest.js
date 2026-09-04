import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";

const run = promisify(execFile);

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);
const VIDEO_EXT = new Set([".mp4", ".mov", ".webm", ".m4v"]);

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
    const [w, h] = stdout.trim().split("x").map(Number);
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

/**
 * Interleave films and stills so the grid never lands a run of one kind in a
 * single row. Both lists are consumed proportionally.
 */
function interleave(videos, images) {
  const out = [];
  const total = videos.length + images.length;
  let vi = 0;
  let ii = 0;
  for (let i = 0; i < total; i++) {
    const wantVideo = videos.length && vi / videos.length <= ii / (images.length || 1);
    if (wantVideo && vi < videos.length) out.push(videos[vi++]);
    else if (ii < images.length) out.push(images[ii++]);
    else if (vi < videos.length) out.push(videos[vi++]);
  }
  return out;
}

/**
 * Build the media manifest by scanning `mediaDir`.
 *
 * ffprobe is slow on 300 MB sources, so results are cached in `cacheFile` and
 * keyed by size+mtime — a file only gets re-probed when it actually changes.
 * Per-item titles and captions come from `configFile`, so real project names
 * survive a rescan.
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

  const entries = await fs.readdir(mediaDir, { withFileTypes: true });
  const videos = [];
  const images = [];
  const nextCache = {};

  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith(".")) continue;

    const ext = path.extname(entry.name).toLowerCase();
    const isVideo = VIDEO_EXT.has(ext);
    const isImage = IMAGE_EXT.has(ext);
    if (!isVideo && !isImage) continue;

    const full = path.join(mediaDir, entry.name);
    const stat = await fs.stat(full);
    const key = `${entry.name}:${stat.size}:${Math.round(stat.mtimeMs)}`;

    let dims = cache[key];
    if (!dims) {
      dims = await probe(full);
      if (!dims) continue; // audio-only or unreadable — not grid material
    }
    nextCache[key] = dims;

    const override = overrides[entry.name] || {};
    if (override.hidden) continue;

    const encoded = encodeURIComponent(entry.name);
    const item = {
      id: entry.name,
      type: isVideo ? "video" : "image",
      src: `/media/${encoded}`,
      title: override.title || titleFrom(entry.name),
      caption: override.caption || (isVideo ? "Film" : "Photograph"),
      w: dims.w,
      h: dims.h
    };

    const stem = entry.name.replace(/\.[^.]+$/, "");

    // Display-resolution copy for the grid. The original stays on `src` for
    // the full-size view — see scripts/derivatives.js for why tiles cannot
    // use it directly.
    if (isImage) {
      try {
        await fs.access(path.join(mediaDir, "web", `${stem}.jpg`));
        item.display = `/media/web/${encodeURIComponent(`${stem}.jpg`)}`;
      } catch {
        item.display = item.src;
      }
    }

    // Small square texture for the three.js intro, when one has been made.
    try {
      await fs.access(path.join(mediaDir, "thumbs", `${stem}.jpg`));
      item.thumb = `/media/thumbs/${encodeURIComponent(`${stem}.jpg`)}`;
    } catch {
      // No thumbnail — the intro simply skips this item.
    }

    if (isVideo) {
      const poster = `${stem}.jpg`;
      try {
        await fs.access(path.join(mediaDir, "posters", poster));
        item.poster = `/media/posters/${encodeURIComponent(poster)}`;
      } catch {
        // No poster yet — the client falls back to the video's own first frame.
      }
      videos.push(item);
    } else {
      images.push(item);
    }
  }

  await fs.mkdir(path.dirname(cacheFile), { recursive: true });
  await fs.writeFile(cacheFile, JSON.stringify(nextCache, null, 2));

  const byName = (a, b) => a.id.localeCompare(b.id, undefined, { numeric: true });
  videos.sort(byName);
  images.sort(byName);

  // An explicit `order` array in the config wins over the automatic interleave.
  if (Array.isArray(overrides.order) && overrides.order.length) {
    const all = [...videos, ...images];
    const rank = new Map(overrides.order.map((n, i) => [n, i]));
    all.sort((a, b) => (rank.get(a.id) ?? 1e6) - (rank.get(b.id) ?? 1e6) || byName(a, b));
    return all;
  }

  return interleave(videos, images);
}
