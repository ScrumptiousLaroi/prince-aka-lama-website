# Prince aka Lama — portfolio

Hero after [michaelgatt.com](https://michaelgatt.com): the site opens on a half
globe of the work, the camera dollies into it, and it hands off to an infinite
draggable grid where films play with sound on hover.

Node + Express, three.js for the opening, no client framework, no build step.

## Run

```bash
npm install
npm start          # http://127.0.0.1:3000
npm run dev        # same, with --watch restart
```

`PORT` and `HOST` are read from the environment.

## Layout

```
server.js             Express app — static, media, API
lib/manifest.js       scans media/, probes dimensions, applies overrides
scripts/posters.js    npm run posters — video stills for grid tiles
scripts/thumbs.js     npm run thumbs — grayscale textures for the opening
scripts/derivatives.js npm run derivatives — display-size copies of stills
scripts/scan.js       npm run scan — print the manifest without booting
media.config.json     titles, captions, grid order, hidden files
media/                originals, untouched
media/posters/        generated video stills (grid tiles)
media/web/            display-size stills (grid tiles)
media/thumbs/         512px grayscale textures (three.js opening)
public/               index.html, css/style.css, js/{boot,intro,grid,audio}.js
.cache/media.json     ffprobe results, keyed by size+mtime (gitignored)
```

## Endpoints

| Route | Purpose |
|---|---|
| `GET /` | the site |
| `GET /api/media` | the manifest the grid renders |
| `POST /api/media/refresh` | rescan `media/` without restarting |
| `GET /healthz` | liveness + item count |
| `GET /media/*` | originals, with `Range` support so video seeks |

## Adding work

Drop the file in `media/`, then:

```bash
npm run media                                     # posters + thumbs + derivatives
curl -X POST http://127.0.0.1:3000/api/media/refresh
```

`npm run media` only generates what is missing, so it is cheap to re-run.

Dimensions are probed automatically. To give it a real name, add an entry to
`media.config.json` — those survive every rescan:

```json
"my-film.mp4": { "title": "Real Project Name", "caption": "Film" }
```

`"hidden": true` keeps a file out of the grid. The `order` array sets grid
order; anything missing from it falls to the end. With no `order`, films and
stills are interleaved automatically.

## Sound

Films play **with sound on hover**. Browsers refuse unmuted playback until the
page has had a real user gesture, and they refuse silently, so `public/js/audio.js`:

- starts muted and unmutes the moment the page gets its first click, drag, or keypress
- shows **Click for sound** in the corner until that happens, then **Sound on**
- keeps exactly one element audible — hovering a second film fades the first out
- falls back to muted playback if a browser refuses sound, so a tile always moves
- fades in over 350ms, with a timer backstop that guarantees the terminal volume
  even if the frame loop is interrupted

The corner control toggles sound and remembers the choice in `localStorage`.
The full-size view is audible too, with normal controls.

## The opening

The globe is not a separate shot that cross-fades into the grid — it *is* the
grid. Every plane in `public/js/intro.js` corresponds to one DOM tile, and over
4.2s it travels from its position on the sphere to the exact pixel rectangle the
DOM will draw it in. At the final frame the canvas and the DOM are
geometrically identical, so handing over is invisible: no fade, no scale, no
second version of the layout.

That identity rests on three things, each of which is easy to get wrong:

- **One world unit must equal one CSS pixel at z=0.** That is what
  `fov = 2 * atan((viewportHeight / 2) / distance)` buys, and it is why a plane
  scaled to 320x420 units lands on exactly 320x420 px of screen.
- **`Grid.snapshot()` is the single source of the landing geometry.** It returns
  each tile's resting position, size, scale and opacity from the same
  `frameFor()` the grid itself draws with, so the two cannot drift apart. The
  grid is frozen while the opening plays, or it would pan out from underneath.
- **The camera must never cross the shell.** The final camera distance sits
  outside the globe's radius. From inside a hemisphere you see the backs of the
  planes, every image mirrored, with half the frame empty.

The globe's radius is solved from total plane area rather than the viewport.
Tile sizes barely change between a phone and a desktop, so a viewport-derived
radius leaves the globe sparse on one and piled up on the other.

Around 130 extra planes with no tile behind them pad the shell out — two dozen
alone read as scattered cards, not a globe — and dissolve during the approach.
The landing tiles unfold on a stagger, so the sphere peels apart rather than
snapping flat.

Everything degrades to the plain grid: no WebGL, `prefers-reduced-motion`, a
three.js module that fails to load, or `?nointro=1`. Any click, key, or scroll
skips it.

`?introAt=0.4` freezes the opening at that fraction of its travel — the only
practical way to inspect one moment of a moving shot, and how the landing frame
was checked against the live grid (they align to zero pixels).

## How the infinite grid works

Every item gets exactly one DOM node. Its screen position is its world position
wrapped modulo the world size, so panning past an edge brings the node back
around on the opposite side. Infinite in both axes at a fixed node count.

`solve()` in `public/js/grid.js` sizes the world to be at least one cell larger
than the viewport in both axes, otherwise wrapping would expose a seam. It grows
only the axis that falls short and cycles items through any surplus cells.

Tiles scale and fade with distance from the viewport centre, which is what gives
the field its depth. Gaps are tight and the per-cell jitter is wide, so
neighbours cross over each other here and there rather than sitting in a clean
lattice; each tile carries a stable z-index and a dark seam so the overlaps read
as layering instead of merging into one silhouette.

The idle drift is an attract loop — it stops on the first pointer movement,
because a tile that slides out from under the cursor cannot be hovered, let
alone played.

## Controls

Drag, scroll, or arrow keys to pan. Hover a film to play it. Click any tile for
the full-size view; Escape or Close to dismiss.

## Type

Zapf Humanist 601 (the reference's face) is Bitstream's cut of Hermann Zapf's
Optima, so the stack asks for Optima first — present on macOS, an exact match —
and falls back to Marcellus from Google Fonts elsewhere.

## Known gaps

- The bottom menu links (`#work`, `#about`, `#contact`) are placeholders. Only
  the hero was in scope; those pages do not exist yet.
- Still titles are derived placeholders (`Untitled I`, `Frame 03`). Real names
  go in `media.config.json`.
- Grid tiles now use generated display copies rather than the originals. They
  had to: a 6192x4128 photograph is about 102 MB once decoded to RGBA, and any
  transform on the stage forces the whole grid to rasterize at once, which
  crashed the renderer outright. Originals are untouched and still load at full
  resolution in the full-size view, which is the only place the detail is
  visible.
- Films still stream from their 50-300 MB originals on hover. `Range` support
  means playback starts without pulling the whole file, but before this goes
  live they should get 720p web copies too.
# prince-aka-lama-website
