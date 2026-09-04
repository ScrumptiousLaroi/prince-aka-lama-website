import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildManifest } from "./lib/manifest.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "127.0.0.1";

const MEDIA_DIR = path.join(__dirname, "media");
const PUBLIC_DIR = path.join(__dirname, "public");
const CACHE_FILE = path.join(__dirname, ".cache", "media.json");
const CONFIG_FILE = path.join(__dirname, "media.config.json");

const app = express();
app.disable("x-powered-by");

/* --- manifest ------------------------------------------------------------
   Built once at boot and held in memory. `POST /api/media/refresh` rebuilds it
   after you drop new files into media/, so adding work does not need a restart.
------------------------------------------------------------------------- */

let manifest = [];
let manifestBuiltAt = 0;

async function refreshManifest() {
  manifest = await buildManifest({
    mediaDir: MEDIA_DIR,
    cacheFile: CACHE_FILE,
    configFile: CONFIG_FILE
  });
  manifestBuiltAt = Date.now();
  return manifest;
}

app.get("/api/media", (req, res) => {
  res.set("Cache-Control", "no-cache");
  res.json({ builtAt: manifestBuiltAt, count: manifest.length, items: manifest });
});

app.post("/api/media/refresh", async (req, res, next) => {
  try {
    await refreshManifest();
    res.json({ ok: true, count: manifest.length });
  } catch (err) {
    next(err);
  }
});

app.get("/healthz", (req, res) => res.json({ ok: true, media: manifest.length }));

/* --- media ---------------------------------------------------------------
   express.static answers Range requests, which is what lets a browser seek
   inside a 300 MB source instead of pulling the whole file before playing.
------------------------------------------------------------------------- */

app.use(
  "/media",
  express.static(MEDIA_DIR, {
    acceptRanges: true,
    maxAge: "7d",
    immutable: false,
    index: false,
    dotfiles: "ignore",
    setHeaders(res, filePath) {
      if (/\.(mp4|mov|m4v|webm)$/i.test(filePath)) {
        // Long-lived connections: let the client decide how much to pull.
        res.set("Accept-Ranges", "bytes");
      }
    }
  })
);

// three.js is a dependency rather than a CDN script, so the version the site
// runs is the version in package-lock.json.
app.use(
  "/vendor/three",
  express.static(path.join(__dirname, "node_modules", "three", "build"), {
    maxAge: "30d",
    index: false
  })
);

app.use(
  express.static(PUBLIC_DIR, {
    index: "index.html",
    maxAge: process.env.NODE_ENV === "production" ? "1h" : 0,
    dotfiles: "ignore"
  })
);

app.use((req, res) => {
  res.status(404).type("text/plain").send("Not found");
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).type("text/plain").send("Server error");
});

const started = Date.now();
await refreshManifest();

app.listen(PORT, HOST, () => {
  console.log(
    `lama-website  http://${HOST}:${PORT}  ` +
      `(${manifest.length} media items, ${Date.now() - started}ms)`
  );
});
