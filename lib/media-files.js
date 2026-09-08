/**
 * Shared media-tree walk.
 *
 * The library lives in media/heroSection/<COMPANY>/... — nested, with spaces
 * and punctuation in both folder and file names. Every part of the pipeline
 * (manifest, posters, thumbs, loops, derivatives) needs the same three things
 * from that tree, so they all come from here: the file list, the company a file
 * belongs to, and the flat `stem` its derivatives are written under.
 */
import fs from "node:fs/promises";
import path from "node:path";

export const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);
export const VIDEO_EXT = new Set([".mp4", ".mov", ".webm", ".m4v"]);

/** Where the site's media actually lives, relative to media/. */
export const LIBRARY_SUBDIR = "heroSection";

/**
 * Derivative filename for a source. Derivatives live in flat directories, so a
 * nested path has to collapse to one safe segment — and it must stay unique,
 * because two companies can easily ship a `_DSC1900.jpg` apiece.
 */
export function stemFor(relPath) {
  return relPath
    .replace(/\.[^.]+$/, "")
    .replace(/[\\/]+/g, "__")
    .replace(/[^A-Za-z0-9_.-]+/g, "_")
    .replace(/_{3,}/g, "__")
    .slice(0, 120);
}

/** Company = the first path segment under the library root. */
export function companyOf(relPath) {
  return relPath.split(path.sep)[0] || "";
}

/**
 * Every image and video under `dir`, recursively, as
 * `{ rel, full, ext, type, company, stem }`. Dotfiles and the derivative
 * directories are skipped; the list is sorted so runs are reproducible.
 */
export async function walkMedia(dir) {
  const out = [];

  async function visit(current, prefix) {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const rel = prefix ? path.join(prefix, entry.name) : entry.name;
      const full = path.join(current, entry.name);

      if (entry.isDirectory()) {
        await visit(full, rel);
        continue;
      }
      if (!entry.isFile()) continue;

      const ext = path.extname(entry.name).toLowerCase();
      const isVideo = VIDEO_EXT.has(ext);
      const isImage = IMAGE_EXT.has(ext);
      if (!isVideo && !isImage) continue;

      out.push({
        rel,
        full,
        ext,
        type: isVideo ? "video" : "image",
        company: companyOf(rel),
        stem: stemFor(rel)
      });
    }
  }

  await visit(dir, "");
  out.sort((a, b) => a.rel.localeCompare(b.rel, undefined, { numeric: true }));
  return out;
}
