/* ---------------------------------------------------------------------------
   The void: a true volumetric field of work.

   There is no wall and no shell. The camera sits in an unbounded black space
   and the work hangs in it — every plane at its own x, y and z, at its own
   angle on all three axes, at its own distance. Perspective does the rest:
   near work is large and swings hard when the camera shifts, far work is small
   and barely moves, and the black between them is most of the frame.

   Two conventions hold the whole file together.

   1. One world unit is one CSS pixel at FOCAL. The camera's fov is solved from
      it — `fov = 2 * atan((vh / 2) / FOCAL)` — so a plane FOCAL units away and
      sized 320x420 units covers exactly 320x420 px of screen. Anything nearer
      is bigger than its numbers, anything further is smaller, which is the
      point.

   2. Composition is authored in screen pixels, then pushed out into depth. A
      plane is placed by where it should sit in the opening frame (`ax`, `ay`,
      in pixels from the centre of the screen) and how far away it should be;
      its world position is that angle carried out to that distance. So the
      resting frame is art-directed, and everything after it is honest
      perspective.

   Two promises hold, and both are about pixels, so both are kept in pixels and
   are measurable from outside through `Grid.rects()`.

   No film is ever covered by another. The field is cut into disjoint
   rectangles and each film is confined to one (`compose`), which settles the
   opening frame; travel is then limited to a range the arrangement has been
   walked through and checked against pair by pair (`safeTravel`).

   And every film can be seen whole. Work on the margins is cropped by the edge
   of the screen at rest — the room is meant to continue past what you can see —
   so moving the mouse has to be able to uncover it. `reachLean` says how far
   the camera must travel sideways for the worst-placed film to come entirely
   inside the frame, and that, not taste, is what sets how far it may lean.
   `edgeGap` measures what that costs in bare margin at the extremes, and the
   arrangement is chosen to keep it small. `coverTravel` stops you backing out
   past the point where the field no longer reaches the edges, and
   `densityTravel` stops you going in past the point where too much of the work
   has streamed out of frame.

   So travel is along z and bounded, with a rubber band at each end rather than
   an endless corridor, and leaning is bounded the same way. Going in scales the
   arrangement up about the axis: work grows, drifts outward, and passes out
   through the edges. Fog closes the far end and a near fade opens the close
   one, so nothing pops into or out of existence at either.

   `screenRect()` projects a plane's four corners through the camera. The
   opening, the lightbox zoom and the hit testing all read it, so they agree on
   where a plane is however far out in the field it sits.
--------------------------------------------------------------------------- */

import * as THREE from "/vendor/three/three.module.min.js";

const stage = document.getElementById("stage");
const canvas = document.getElementById("wallCanvas");
const hint = document.getElementById("hint");
const readout = document.getElementById("wallReadout");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* --- tuning --------------------------------------------------------------
   Everything spatial is a multiple of FOCAL, so the room keeps its proportions
   from a phone to a 6K display. The numbers that matter most to the look are
   NEAR/FAR — the depth of the room. How far the camera may lean and travel is
   not among them: both are solved from the arrangement at layout time, and
   PARALLAX is only a ceiling on the answer. --------------------------------------------- */

const LENS = 0.80;            // FOCAL as a multiple of the long viewport edge
const NEAR_MUL = 0.14;        // closest a plane ever gets, in FOCAL
const REST_MUL = 0.62;        // closest a plane is ever *composed*, in FOCAL
const FAR_MUL = 2.10;         // furthest, in FOCAL
const FOG_MUL = 1.55;         // where the black starts eating the field
const FOG_END = 3.30;         // and where it has finished — well past the back
const FADE_MUL = 0.30;        // where the near fade has finished opening
const TRAVEL_MUL = 0.85;      // how far in and out you may travel, in FOCAL

const FACE = 0.42;            // how far a plane turns back towards the axis

const PARALLAX = 0.36;        // the most the camera may lean, as a fraction
                              // of the viewport — solved down from here to
                              // whatever the arrangement can cover
const CONVERGE = 0.18;        // how much the camera turns back into its sway
const LERP = 0.055;           // how slowly the camera trails the cursor
const DOLLY_LERP = 0.085;     // how slowly travel trails the wheel
const DOLLY_FRICTION = 0.91;  // wheel decay once the fingers come off
const BREATH = 0.035;         // slow unprompted dolly, in FOCAL
const BOB_MUL = 0.008;        // per-plane float, as a fraction of the viewport
const ROLL = 0.07;            // radians of tilt, at most, per plane
const WOBBLE = 0.024;         // and the slow wobble on top of it
const SWELL = 1.04;           // how much a hovered plane grows

/* Those four are what a film covers beyond its own width and height. Both the
   composition and the solvers have to agree about them exactly: the first sizes
   films so they fit their rectangles once covered, the second decide how far
   the camera may move before two of them meet.

   The float is a fraction of the screen rather than a fixed number of pixels.
   Seven pixels of drift is a nice slow breath on a desktop and a fifth of the
   gap between two films on a phone — held fixed, it eats the whole margin
   there and the solvers, finding no room, pin the camera in place. */
const CLICK_SLOP = 6;         // px of movement still counted as a click
const HOVER_LIFT = 0.055;     // hover pull towards the camera, in its distance

/* --- state -------------------------------------------------------------- */

let items = [];
let planes = [];
let vw = 0;
let vh = 0;

let FOCAL = 0;
let NEAR = 0;
let REST_NEAR = 0;
let FAR = 0;
let TRAVEL_IN = 0;            // how far into the room you may go
let TRAVEL_OUT = 0;           // and how far back out of it
let LEAN_X = 0;               // and how far the camera may lean, in world units
let LEAN_Y = 0;
let FOG_NEAR = 0;
let FOG_FAR = 0;
let FADE_TO = 0;
let BOB = 0;                  // the float, in px, for this viewport
let FLOATPAD = 0;             // what it can add to a footprint

let renderer = null;
let scene = null;
let camera = null;
let raycaster = null;
let unitGeom = null;
const pointerNDC = new THREE.Vector2(-2, -2);

let dolly = 0;                // how far the camera has travelled, in units
let breath = 0;               // the slow unprompted part of that
let dollyTarget = 0;
let dollyVel = 0;
let camX = 0, camY = 0;       // where the camera is
let aimX = 0, aimY = 0;       // cursor position, -1..1 from the centre
let pointerActive = false;
let touching = false;
let dragging = false;
let pointerId = null;
let lastX = 0, lastY = 0;
let moved = 0;
let interacted = false;
let frozen = true;            // held still until the opening hands over
let running = false;
let hovered = null;
let downPlane = null;
let clock = 0;
let lastFrame = 0;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t) => t * t * (3 - 2 * t);

/* --- media selection ---------------------------------------------------- */

/**
 * One film and one still per client — whatever the manifest carries.
 *
 * The stills once padded the field out to a few dozen tiles and were cut for
 * it: a room this sparse cannot afford work covering other work. The library
 * is now curated in media.config.json down to a single piece of each kind per
 * client, so the stills come back without the crowding that removed them —
 * every piece still gets its own patch of the frame. See `compose`, which is
 * what actually guarantees that.
 *
 * Anything with nothing to draw is dropped rather than left as a grey plane.
 */
function selectItems(list) {
  return (list || []).filter((i) =>
    i.type === "video"
      ? i.thumb || i.poster || i.src
      : i.thumb || i.display || i.src
  );
}

/* --- composition -------------------------------------------------------- */

/**
 * Deterministic 0..1 noise, so a reload lays the field out identically.
 *
 * An integer hash rather than the usual fract(sin(dot(...))) trick. That one
 * is fine for a shader sampling scattered coordinates and quietly terrible
 * here: fed a run of consecutive integers it comes back correlated, and a
 * scatter built on it lumps the work into a few corners of the frame no matter
 * how the placement above is tuned.
 */
function rand(i, salt) {
  let h = (Math.imul(i + 1, 0x27d4eb2d) ^ Math.imul(salt + 1, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth 0..1 noise: nearby points get near values. */
function fieldNoise(x, y, salt) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const at = (a, b) => rand(a * 101 + b * 7919, salt);
  const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
  const bot = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
  return top + (bot - top) * sy;
}

/**
 * Where each plane sits in the opening frame, how big it is, and how far away.
 *
 * The field is cut up into disjoint rectangles and every film is given one,
 * sized to fit inside it and free to move only within what is left over.
 * Because the rectangles do not overlap, the work in them cannot either. That
 * is the guarantee, and it is structural: there is no value of the jitter that
 * can break it.
 *
 * The cutting is recursive rather than a grid — take the largest piece left,
 * split it somewhere off-centre, repeat. A grid gives disjoint cells too, and
 * gives itself away immediately: the cells are all the same size, so the work
 * lines up in rows however much it is jittered inside them. Splitting produces
 * rectangles of every size and no shared edges to line up along, which is what
 * a scatter looks like — and the big rectangles then hold the big work, so the
 * size range comes out of the same operation.
 *
 * Films are matched to rectangles by shape, so a portrait film gets a tall
 * one. A few more rectangles are cut than there are films, and the ones left
 * empty are whichever sat worst under the type.
 *
 * Depth is smooth across the field rather than random per film. Neighbours at
 * nearly the same distance grow at nearly the same rate as you travel into the
 * room, so the arrangement holds its shape instead of shuffling through itself
 * — which is what keeps the work apart once anything starts moving.
 */
function compose(list, attempt) {
  const n = list.length;
  const salt = attempt * 17;
  const narrow = vw < 700;

  // Barely wider than the frame: with this little work, dealing it across two
  // screens would leave most of the field outside the one you are looking at.
  const spreadX = vw * (narrow ? 1.04 : 1.0);
  const spreadY = vh * (narrow ? 1.08 : 1.0);

  // Slack inside each rectangle: enough for the float, the roll and the hover
  // swell, none of which the arithmetic below can see. Scaled to the screen,
  // since a fixed 26px is generous room on a desktop and most of a film's
  // width on a phone.
  const SLACK = Math.max(9, Math.min(vw, vh) * 0.016);

  /* --- cut the field ----------------------------------------------------- */

  // Rows and columns read off the work, not chosen. Solve for the cell shape
  // that matches what is actually being shown: with cols*rows = n and a cell
  // of vw/cols by vh/rows, asking that cell to have the media's own aspect
  // gives rows = sqrt(n * ratio * vh / vw). For nine mostly-9:16 films on a
  // laptop that lands on two rows — which is the only thing that fits them at
  // a size worth showing, since three rows of vertical film is taller than the
  // screen and the arithmetic below would just shrink them all to make it fit.
  //
  // This replaced a recursive split that cut the field into rectangles of
  // every size and shape. It scattered beautifully and it could not do the one
  // thing being asked of it here: a 9:16 film dealt a short wide rectangle is
  // capped by that rectangle's height, and comes out a third of the area of a
  // film that happened to land in a tall one. Nine pieces of work at nine
  // different sizes with black between them is what that looked like.
  //
  // It is a grid underneath, so the jitter matters: row heights vary, and the
  // columns are cut separately inside each row, so no vertical edge runs the
  // height of the frame. Nothing lines up with anything, which is the whole
  // reason the split was there in the first place.
  const ratios = list.map((i) => i.w / i.h).sort((a, b) => a - b);
  const medRatio = ratios[ratios.length >> 1] || 1;

  let rows = Math.round(Math.sqrt((n * medRatio * spreadY) / spreadX));
  rows = Math.max(1, Math.min(n, rows));

  // As even as possible, remainder spread over the top rows rather than dumped
  // on one of them.
  const perRow = [];
  for (let r = 0; r < rows; r++) {
    perRow.push(Math.floor(n / rows) + (r < n % rows ? 1 : 0));
  }

  const parts = [];

  // Row heights: even, then leaned by up to a sixth either way.
  const rowWeights = perRow.map((_, r) => 0.84 + rand(r * 97, 71 + salt) * 0.32);
  const rowTotal = rowWeights.reduce((a, b) => a + b, 0);

  let y = -spreadY / 2;
  for (let r = 0; r < rows; r++) {
    const rh = (spreadY * rowWeights[r]) / rowTotal;
    const cols = perRow[r];

    // Column widths, cut inside this row only.
    const colWeights = [];
    for (let c = 0; c < cols; c++) {
      colWeights.push(0.82 + rand(r * 131 + c * 17, 73 + salt) * 0.36);
    }
    const colTotal = colWeights.reduce((a, b) => a + b, 0);

    // And the row's own horizontal drift, so the outer columns of one row do
    // not start where the row above it started.
    const slide = (rand(r * 211, 77 + salt) - 0.5) * spreadX * 0.06;

    let x = -spreadX / 2 + slide;
    for (let c = 0; c < cols; c++) {
      const cw = (spreadX * colWeights[c]) / colTotal;
      parts.push({ x0: x, y0: y, x1: x + cw, y1: y + rh });
      x += cw;
    }
    y += rh;
  }

  /* --- which pieces to use ----------------------------------------------- */

  // Half the width of the column the type occupies. Capped in real pixels,
  // because it is real pixels: the name is the same size on a laptop and on a
  // 27-inch display, and a share of the viewport turns into a third of a wide
  // screen reserved for a line of text 400px across.
  const typeHalf = Math.min(vw * 0.13, 230);

  for (const r of parts) {
    r.cx = (r.x0 + r.x1) / 2;
    r.cy = (r.y0 + r.y1) / 2;
    r.w = r.x1 - r.x0;
    r.h = r.y1 - r.y0;
  }

  // Which pieces go unused, and so become the holes: the smallest, wherever
  // they happen to be. Two earlier versions of this preferred to empty the
  // pieces under the type, and both of them hollowed out the middle of the
  // frame — the type is in the middle, so every piece in the middle is under
  // something, and emptying them all leaves a void that nothing else can
  // reach. A film that lands under the name is handled below instead, by
  // leaning it aside within its own rectangle, which costs no coverage.
  const bySize = parts.slice().sort((a, b) => a.w * a.h - b.w * b.h);
  const drop = new Set();
  for (const r of bySize) {
    if (parts.length - drop.size <= n) break;
    drop.add(r);
  }
  const used = parts.filter((r) => !drop.has(r));

  /* --- match films to pieces by shape ------------------------------------ */

  const byShape = used.slice().sort((a, b) => a.w / a.h - b.w / b.h);
  const films = list
    .map((item, i) => ({ i, ratio: item.w / item.h }))
    .sort((a, b) => a.ratio - b.ratio);

  const slots = new Array(n);

  /* --- pass one: everything that does not depend on the other films ------- */

  const fits = new Array(n);

  for (let k = 0; k < n; k++) {
    const r = byShape[k];
    const film = films[k];
    const i = film.i;

    // Depth reads across the field, not down the list: two films side by side
    // sit at close to the same distance.
    const dt = clamp01(
      0.86 * fieldNoise(r.cx / (vw * 0.62), r.cy / (vh * 0.62), 21 + salt) + 0.14 * rand(i, 22 + salt)
    );
    const dist = REST_NEAR + dt * (FAR - REST_NEAR);

    // Sized by what it covers, not by what it measures. A film is rolled a few
    // degrees, floats a little, and swells when hovered, and all three make its
    // footprint on screen larger than its own width and height — enough, for a
    // tall film, to eat the whole gap the rectangles were leaving. Fitting the
    // nominal size and hoping is what pinned the camera in place: every solver
    // downstream measured the real footprint, found no room, and refused to
    // let anything move.
    const rz = (rand(i, 35) - 0.5) * ROLL;
    const roll = Math.abs(rz) + WOBBLE;
    const cr = Math.cos(roll);
    const sr = Math.sin(roll);
    const uw = 1;
    const uh = 1 / film.ratio;
    const coverW = (uw * cr + uh * sr) * SWELL;
    const coverH = (uw * sr + uh * cr) * SWELL;

    // A phone gets smaller films for their rectangles. There is no room on a
    // 390px screen for a dozen films at full size and any daylight between
    // them, and without daylight the camera cannot move at all — every solver
    // below measures the gaps, finds none, and locks it.
    let fill = narrow
      ? 0.82 + rand(i, 23 + salt) * 0.08
      : 0.97 + rand(i, 23 + salt) * 0.03;

    // Rectangles out past the edge of the frame get smaller films. What hangs
    // over an edge has to be recoverable — leaning the camera has to be able
    // to bring it entirely into view — and how far it hangs out is its own
    // size. A large film dealt a rectangle in the margin is cropped by more
    // than the lean can ever undo, and stays half-seen for ever. A light touch:
    // this used to take a third off, which on its own made margin work read as
    // an afterthought next to whatever held the middle.
    const outX = clamp01((Math.abs(r.cx) - vw * 0.30) / (vw * 0.26));
    const outY = clamp01((Math.abs(r.cy) - vh * 0.30) / (vh * 0.26));
    fill *= 1 - 0.16 * Math.max(outX, outY);

    // The largest box this rectangle can hold, before any evening-out.
    const roomW = Math.max(24, r.w - SLACK * 2 - FLOATPAD);
    const roomH = Math.max(24, r.h - SLACK * 2 - FLOATPAD);
    const cap = Math.min(roomW / coverW, roomH / coverH) * fill;

    fits[k] = { r, i, ratio: film.ratio, dist, rz, uw, uh, cap };
  }

  /* --- pass two: one size for all of it ----------------------------------- */

  // The split deals rectangles at every size, and a film sized to fill whatever
  // it was dealt inherits that spread whole — which is how one piece of work
  // ended up a fraction of the one beside it, for no reason the viewer can see.
  // So the spread stops here: every film is drawn at the same area on screen,
  // and only a film whose rectangle genuinely cannot hold that area is allowed
  // to come in under it.
  //
  // Equal *area*, not equal width. The work is a mix of portrait and landscape,
  // and it is area that reads as weight — matching widths would make a 9:16
  // film tower over a 16:9 one sitting next to it.
  //
  // The common area is a low quantile of what the rectangles can take rather
  // than the smallest of them: pinning to the smallest would drag the entire
  // field down to whatever its tightest corner happened to be.
  const areaFor = (box, ratio) => (box * box) / ratio;
  const capAreas = fits.map((f) => areaFor(f.cap, f.ratio)).sort((a, b) => a - b);
  const target = capAreas[Math.min(capAreas.length - 1, Math.floor(capAreas.length * 0.35))];

  for (let k = 0; k < n; k++) {
    const f = fits[k];
    const r = f.r;
    const i = f.i;

    const box = Math.min(Math.sqrt(target * f.ratio), f.cap);
    const wpx = box * f.uw;
    const hpx = box * f.uh;

    // ...and free to move only within what is left of the rectangle, which is
    // what makes the no-overlap structural rather than hopeful.
    const jx = Math.max(0, (r.w - wpx) / 2 - SLACK);
    const jy = Math.max(0, (r.h - hpx) / 2 - SLACK);

    let ax = r.cx + (rand(i, 11 + salt) - 0.5) * 2 * jx;

    // Vertically, a row leans towards the middle of the frame rather than
    // wandering inside its band. Whatever a film does not use of its cell has
    // to end up somewhere, and centring each one put all of it on the seam
    // between the rows — a black stripe straight across the picture, right
    // where the eye rests. Leaning the rows together moves that slack to the
    // top and bottom edges instead, which the films already cross and where
    // nobody reads it as a hole.
    const pull = r.cy > 0 ? -1 : r.cy < 0 ? 1 : 0;
    let ay = pull
      ? r.cy + pull * jy * (0.35 + rand(i, 12 + salt) * 0.25)
      : r.cy + (rand(i, 12 + salt) - 0.5) * 2 * jy;

    // If it has landed under the type, lean it away — but only as far as its
    // own rectangle reaches, so the arrangement stays disjoint. Usually that
    // is not far enough to clear the type outright, and it does not need to
    // be: the name is drawn in difference blend and stays legible over
    // anything. It only has to stop the work sitting dead centre behind it.
    // The type is two bands, not a column: the name across the top and the menu
    // across the bottom. Leaning every film in the frame away from the vertical
    // centre — which is what this used to do — emptied the middle of the screen
    // from top to bottom and left a black channel down the picture. Only a film
    // that actually reaches into one of the two bands is leaned aside.
    const TYPE_BAND = vh * 0.24;
    const inTypeBand = ay - hpx / 2 < -TYPE_BAND || ay + hpx / 2 > TYPE_BAND;

    if (narrow) {
      const band = vh * 0.30;
      if (Math.abs(ay) > band - hpx / 2) {
        const want = ay > 0 ? band - hpx / 2 : -(band - hpx / 2);
        ay = Math.max(r.cy - jy, Math.min(r.cy + jy, want));
      }
    } else if (inTypeBand && Math.abs(ax) < typeHalf + wpx / 2) {
      const want = (ax < 0 ? -1 : 1) * (typeHalf + wpx / 2);
      ax = Math.max(r.cx - jx, Math.min(r.cx + jx, want));
    }

    // `buildPlane` draws the roll from the same index and the same salt, so
    // the two agree — and they have to, since the size above was solved from
    // it and every check downstream reasons about it.
    slots[i] = { ax, ay, dist: f.dist, wpx, hpx, rz: f.rz };
  }

  // Coverage. The room must never be seen to end, so some film has to cross
  // each edge of the frame — otherwise a band of nothing sits along that side,
  // and leaning the camera towards it only makes the band wider.
  //
  // Which film does it matters. The obvious choice is whichever already sits
  // furthest that way, and it is the wrong one: it tends to be a large film,
  // it therefore hangs a long way out, and the lean needed to pull it back
  // fully into view is more than the arrangement can afford — so it is cropped
  // for ever, which is its own kind of content left out. A small film among
  // the outermost few crosses the edge just as well and can be recovered by a
  // fraction of the lean.
  //
  // Pushing outward cannot put two films together: everything else is inward.
  const OVER = 0.44;   // it crosses by this little of its own size

  const ensure = (crosses, extreme, place) => {
    if (slots.some(crosses)) return;
    const candidates = slots.slice().sort(extreme).slice(0, 4);
    let pick = candidates[0];
    for (const c of candidates) if (c.wpx * c.hpx < pick.wpx * pick.hpx) pick = c;
    place(pick);
  };

  ensure((s) => s.ax - s.wpx / 2 < -vw / 2, (a, b) => a.ax - b.ax,
         (s) => { s.ax = -vw / 2 + s.wpx * OVER; });
  ensure((s) => s.ax + s.wpx / 2 > vw / 2, (a, b) => b.ax - a.ax,
         (s) => { s.ax = vw / 2 - s.wpx * OVER; });
  ensure((s) => s.ay + s.hpx / 2 > vh / 2, (a, b) => b.ay - a.ay,
         (s) => { s.ay = vh / 2 - s.hpx * OVER; });
  ensure((s) => s.ay - s.hpx / 2 < -vh / 2, (a, b) => a.ay - b.ay,
         (s) => { s.ay = -vh / 2 + s.hpx * OVER; });

  return slots;
}

/**
 * Where every film would be on screen for a given camera position.
 *
 * This is the renderer's own projection, done in plain arithmetic so that it
 * can be asked about camera positions the visitor has not been to yet. Every
 * limit below is decided by it, so it has to be faithful: corners projected
 * individually rather than a size scaled, because a film off to the side of
 * frame is stretched by perspective and covers up to a third more screen than
 * its nominal size — treat it as a scaled rectangle and the checks pass while
 * the pixels overlap.
 *
 * The roll is applied for the same reason. What is left out is the lean each
 * film has back into the axis, which foreshortens it: leaving that out makes
 * every rectangle here slightly too large, which is the safe direction.
 */
function placedAt(slots, travelAt, lx, ly) {
  // The camera turns partway back into its own lean, exactly as the frame loop
  // turns it.
  const yaw = (lx / FOCAL) * CONVERGE;
  const pitch = -(ly / FOCAL) * CONVERGE;
  const cyw = Math.cos(yaw), syw = Math.sin(yaw);
  const cpt = Math.cos(pitch), spt = Math.sin(pitch);

  const out = [];
  for (const s of slots) {
    const d = s.dist - travelAt;
    const k = s.dist / FOCAL;          // world units per composed pixel
    const X = s.ax * k;
    const Y = -s.ay * k;
    const Z = -d;

    const roll = Math.abs(s.rz) + WOBBLE;
    const cr = Math.cos(roll), sr = Math.sin(roll);
    const hw = (s.wpx * SWELL * k) / 2;
    const hh = (s.hpx * SWELL * k) / 2;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let q = 0; q < 4; q++) {
      const ex = q < 2 ? -hw : hw;
      const ey = q % 2 ? -hh : hh;
      const px = X + ex * cr - ey * sr;
      const py = Y + ex * sr + ey * cr;

      // Into camera space: translate, then undo the camera's own rotation.
      const rx = px - lx, ry = py - ly;
      const bx = rx * cyw - Z * syw;
      const bz = rx * syw + Z * cyw;
      const by = ry * cpt + bz * spt;
      const bz2 = Math.min(-1, -ry * spt + bz * cpt);

      const sx = vw / 2 + (FOCAL * bx) / -bz2;
      const sy = vh / 2 - (FOCAL * by) / -bz2;
      if (sx < minX) minX = sx;
      if (sx > maxX) maxX = sx;
      if (sy < minY) minY = sy;
      if (sy > maxY) maxY = sy;
    }

    out.push({
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
      hw: (maxX - minX) / 2 + FLOATPAD / 2,
      hh: (maxY - minY) / 2 + FLOATPAD / 2
    });
  }
  return out;
}

function anyTouching(rs) {
  for (let a = 0; a < rs.length; a++) {
    for (let b = a + 1; b < rs.length; b++) {
      const A = rs[a], B = rs[b];
      if (
        Math.abs(A.cx - B.cx) < A.hw + B.hw &&
        Math.abs(A.cy - B.cy) < A.hh + B.hh
      ) return true;
    }
  }
  return false;
}

/**
 * The camera positions worth testing inside a given range of movement.
 *
 * Overlap comes on with the size of the movement, not somewhere in the middle
 * of it, so the corners and the axes are where it shows up first — with the
 * halfway points included because travel and lean interact and the worst case
 * is not always at full stretch of both.
 */
function samples(travelIn, travelOut, leanX, leanY) {
  const ts = [-travelOut, 0, travelIn * 0.5, travelIn];
  const ls = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1],
              [1, 1], [-1, -1], [1, -1], [-1, 1],
              [0.5, 0.5], [-0.5, 0.5], [0.5, -0.5], [-0.5, -0.5]];
  const out = [];
  for (const t of ts) for (const [kx, ky] of ls) out.push([t, kx * leanX, ky * leanY]);
  return out;
}

/**
 * How far the arrangement can travel before any two films touch.
 *
 * Composing them into disjoint rectangles keeps them apart in the opening
 * frame, and no further: moving the camera scales and slides each one by its
 * own distance, so two neighbours at slightly different depths drift towards
 * each other. Smooth depth makes that slow, but slow is not never.
 *
 * So the limit is not guessed at. Each direction is walked in small steps,
 * every pair is tested at every step, and travel stops short of wherever the
 * first pair would meet.
 *
 * The two directions are reported separately because they are not symmetric:
 * going in grows the arrangement, going out shrinks it, and only one of those
 * can also run out of frame — see `coverTravel`.
 */
function safeTravel(slots) {
  const walk = (dir) => {
    const limit = FOCAL * 1.4;
    const step = FOCAL * 0.015;
    let t = step;
    for (; t <= limit; t += step) {
      if (dir > 0 && REST_NEAR - t < NEAR) break;
      if (anyTouching(placedAt(slots, dir * t, 0, 0))) break;
    }
    return Math.max(0, t - step);
  };
  return { in: walk(1), out: walk(-1) };
}

/**
 * The largest fraction of a wanted lean that can actually be allowed.
 *
 * Leaning slides near work further than far work — that is the whole point of
 * it — and slid far enough, two films that were dealt neighbouring rectangles
 * pass across one another. Travel has the same problem and is bounded the same
 * way, but the two have to be bounded together: it is the combination that
 * bites, not either alone. Bisected rather than walked, because the range is
 * two-dimensional and each test costs a pass over every pair.
 */
function leanScale(slots, travelIn, travelOut, leanX, leanY) {
  const clear = (k) => {
    for (const [t, lx, ly] of samples(travelIn, travelOut, leanX * k, leanY * k)) {
      if (anyTouching(placedAt(slots, t, lx, ly))) return false;
    }
    return true;
  };
  if (clear(1)) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (clear(mid)) lo = mid; else hi = mid;
  }
  return lo;
}

/**
 * The lean needed before every film can be brought entirely into frame.
 *
 * Work at the margins of the field is cropped by the edge of the screen at
 * rest, which is the point of it — the room continues past what you can see.
 * But cropped is only worth doing if moving the mouse uncovers it. This is how
 * far the camera has to be able to travel sideways for the worst-placed film
 * to come fully inside the frame, and it is what the lean is measured against:
 * if the arrangement cannot afford this much, there is work no amount of mouse
 * movement will ever show you whole.
 *
 * How far a film moves per unit of lean falls off with distance, and CONVERGE
 * — the camera turning partway back into its own lean — subtracts from it
 * directly. A large CONVERGE holds the composition still very effectively, by
 * making the lean do almost nothing.
 */
function reachLean(slots, travelAt) {
  // How far one film moves on screen per unit of lean, measured rather than
  // derived — the same projection everything else uses, sampled twice.
  const PROBE = 100;
  let needX = 0;
  let needY = 0;

  for (const s of slots) {
    const [at0] = placedAt([s], travelAt, 0, 0);
    // A film too large to sit inside the frame only has to reach an edge, and
    // asking for the impossible would put the bar at infinity.
    const fitsX = at0.hw * 2 <= vw;
    const fitsY = at0.hh * 2 <= vh;

    if (fitsX) {
      const [atX] = placedAt([s], travelAt, PROBE, 0);
      const slide = (at0.cx - atX.cx) / PROBE;
      const over = Math.max(at0.hw - at0.cx, at0.cx + at0.hw - vw, 0);
      if (over > 0) {
        if (Math.abs(slide) < 0.02) return { x: Infinity, y: Infinity };
        needX = Math.max(needX, over / Math.abs(slide));
      }
    }

    if (fitsY) {
      const [atY] = placedAt([s], travelAt, 0, PROBE);
      const slide = (atY.cy - at0.cy) / PROBE;
      const over = Math.max(at0.hh - at0.cy, at0.cy + at0.hh - vh, 0);
      if (over > 0) {
        if (Math.abs(slide) < 0.02) return { x: Infinity, y: Infinity };
        needY = Math.max(needY, over / Math.abs(slide));
      }
    }
  }

  // The measurement above is a linear reading of a projection that is not
  // quite linear, so it comes out a little short on the films furthest off
  // axis. Confirm it, and give it more if it needs it.
  const short = (lx, ly) => {
    let worst = 0;
    for (const s of slots) {
      let best = Infinity;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1],
                              [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const [r] = placedAt([s], travelAt, dx * lx, dy * ly);
        if (r.hw * 2 > vw || r.hh * 2 > vh) { best = 0; break; }
        const out = Math.max(0, -(r.cx - r.hw), -(r.cy - r.hh),
                             r.cx + r.hw - vw, r.cy + r.hh - vh);
        if (out < best) best = out;
      }
      if (best > worst) worst = best;
    }
    return worst;
  };

  for (let i = 0; i < 6 && short(needX, needY) > 1; i++) {
    needX *= 1.12;
    needY *= 1.12;
  }

  return { x: needX, y: needY };
}

/** The arrangement's bounding box on screen, for a given camera position. */
function spanAt(slots, travelAt, lx, ly) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const r of placedAt(slots, travelAt, lx, ly)) {
    if (r.cx - r.hw < minX) minX = r.cx - r.hw;
    if (r.cx + r.hw > maxX) maxX = r.cx + r.hw;
    if (r.cy - r.hh < minY) minY = r.cy - r.hh;
    if (r.cy + r.hh > maxY) maxY = r.cy + r.hh;
  }
  return { minX, maxX, minY, maxY };
}

function coversFrame(slots, travelAt, lx, ly) {
  const b = spanAt(slots, travelAt, lx, ly);
  return b.minX <= 0 && b.maxX >= vw && b.minY <= 0 && b.maxY >= vh;
}

/**
 * The widest bare band along any edge of the frame, as a fraction of it.
 *
 * Whether the arrangement covers the frame outright turns out to be the wrong
 * question to bound the lean with. The lean at which a film on the margin
 * finally comes fully into view is exactly the lean at which it stops
 * overhanging the edge it was covering: "entirely inside the frame" and
 * "crossing the frame's edge" are one film's two mutually exclusive states.
 * Insisting on coverage therefore forbids ever seeing the edge work whole,
 * which is the opposite of what moving the mouse is for.
 *
 * So the lean is set by reach instead, and this measures what that costs.
 */
function edgeGap(slots, travelAt, lx, ly) {
  const b = spanAt(slots, travelAt, lx, ly);
  return Math.max(
    Math.max(0, b.minX) / vw,
    Math.max(0, vw - b.maxX) / vw,
    Math.max(0, b.minY) / vh,
    Math.max(0, vh - b.maxY) / vh
  );
}

/** The worst bare band anywhere in the range the camera is allowed to move. */
function worstGap(slots, leanX, leanY, travelIn, travelOut) {
  let worst = 0;
  for (const [t, lx, ly] of samples(travelIn, travelOut, leanX, leanY)) {
    const g = edgeGap(slots, t, lx, ly);
    if (g > worst) worst = g;
  }
  return worst;
}

function inFrame(slots, travelAt) {
  let count = 0;
  for (const s of slots) {
    const d = s.dist - travelAt;
    const grow = s.dist / d;
    const cx = vw / 2 + s.ax * grow;
    const cy = vh / 2 - s.ay * grow;
    const hw = (s.wpx * grow) / 2;
    const hh = (s.hpx * grow) / 2;
    if (cx + hw > 0 && cx - hw < vw && cy + hh > 0 && cy - hh < vh) count++;
  }
  return count;
}

/**
 * How far in the camera may go before too much of the work has passed out of
 * frame.
 *
 * Travelling in is honest perspective — work grows and leaves through the
 * edges — but with a dozen films there is not much to lose before the room
 * looks abandoned rather than deep. This is the third limit on travel, beside
 * the two below, and the one that usually binds.
 */
function densityTravel(slots) {
  const keep = Math.max(3, Math.ceil(slots.length * 0.5));
  const limit = FOCAL * 1.4;
  const step = FOCAL * 0.015;
  let t = 0;
  for (; t <= limit; t += step) if (inFrame(slots, t) < keep) break;
  return Math.max(0, t - step);
}

function coverTravel(slots) {
  const limit = FOCAL * 1.4;
  const step = FOCAL * 0.015;
  let t = 0;
  for (; t <= limit; t += step) if (!coversFrame(slots, -t, 0, 0)) break;
  return Math.max(0, t - step);
}

/* --- textures ------------------------------------------------------------
   Loaded on demand, best composition first. Everything that is in the opening
   frame is fetched before anything that is not, so the handover from the
   opening lands on a full field and the rest fills in behind it while nobody
   is looking. ------------------------------------------- */

const textureLoader = new THREE.TextureLoader();
const textures = new Map();
const waiting = new Map();    // url -> planes queued behind one in-flight load
let queue = [];
let inflight = 0;
const MAX_INFLIGHT = 6;

function attach(p, tex) {
  if (!p.mat) return;
  p.mat.map = tex;
  p.mat.needsUpdate = true;
  p.ready = true;
  // Nothing is drawn before its texture arrives: an unmapped basic material is
  // a white rectangle, which in a black room is the worst thing on screen.
  p.mesh.visible = true;
}

function pump() {
  while (inflight < MAX_INFLIGHT && queue.length) {
    const p = queue.shift();
    const url = p.src;
    if (!url) continue;

    const have = textures.get(url);
    if (have) { attach(p, have); continue; }

    const queued = waiting.get(url);
    if (queued) { queued.push(p); continue; }

    waiting.set(url, [p]);
    inflight++;
    textureLoader.load(
      url,
      (tex) => {
        inflight--;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        textures.set(url, tex);
        for (const q of waiting.get(url) || []) attach(q, tex);
        waiting.delete(url);
        pump();
      },
      undefined,
      () => {
        // A missing thumbnail leaves a hole in the field, which is correct:
        // the alternative is a white rectangle where a photograph should be.
        inflight--;
        waiting.delete(url);
        pump();
      }
    );
  }
}

/* --- build -------------------------------------------------------------- */

/**
 * Drain the colour out of a plane's material, under the control of one uniform.
 *
 * The field rests in black and white and only what the cursor is on comes back
 * to colour. Done on the GPU rather than by desaturating the textures, because
 * the same texture is a still, a poster and a live video frame depending on the
 * moment, and because the return has to be a ramp rather than a switch — the
 * uniform is driven from the plane's existing eased hover weight, so colour
 * arrives and leaves on exactly the clock the swell and the lift already use.
 *
 * Injected after `map_fragment`, where `diffuseColor` is the texture times the
 * material colour, in linear space — which is where the luma weights belong.
 */
function greyable(mat) {
  const sat = { value: 0 };
  mat.userData.sat = sat;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSat = sat;
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", "uniform float uSat;\nvoid main() {")
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        {
          float l = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
          diffuseColor.rgb = mix( vec3( l ), diffuseColor.rgb, uSat );
        }`
      );
  };
  // Materials are cached by their compiled program; two planes differing only
  // in a uniform must not be handed the same one.
  mat.customProgramCacheKey = () => "greyable";
  return mat;
}

function buildPlane(item, i, slot) {
  const mat = greyable(new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 1,
    depthWrite: false,
    toneMapped: false,
    // The colour multiplies the texture, so it stays neutral — a tint would
    // colour every frame of the field. It is not quite white, though: a stop
    // or so of exposure varies per plane, which reads as work lit at different
    // distances from the same lamp and keeps a bright still from jumping out
    // of a dark room.
    color: new THREE.Color().setScalar(0.84 + rand(i, 51) * 0.16),
    fog: true
  }));

  const mesh = new THREE.Mesh(unitGeom, mat);
  mesh.visible = false;   // until its texture lands — see attach()
  mesh.rotation.order = "YXZ";
  mesh.matrixAutoUpdate = true;

  // Its size in the opening frame, decided by the composition — which had to
  // know it to guarantee the piece fits inside its own cell.
  const wpx = slot.wpx;
  const hpx = slot.hpx;

  // The angle carried out to the distance: one world unit is one pixel at
  // FOCAL, so everything scales by dist / FOCAL and the plane lands exactly
  // where it was composed.
  const k = slot.dist / FOCAL;

  const plane = {
    mesh,
    mat,
    item,
    i,
    src:
      item.type === "video"
        ? item.thumb || item.poster
        : item.thumb || item.display,
    ready: false,
    ax: slot.ax,
    ay: slot.ay,
    dist0: slot.dist,
    dist: slot.dist,
    x: slot.ax * k,
    y: -slot.ay * k,     // screen y runs down, world y runs up
    w: wpx * k,
    h: hpx * k,
    // The same rectangle in pixels, which is what it covers at rest. The
    // opening lands on these rather than on a projected bounding box: a turned
    // plane's bounding box is wider than the plane, and handing the opening
    // that number would deliver every tile a size too large.
    wpx,
    hpx,
    hover: 0,            // 0..1 hover weight, eased every frame
    alpha: 1,            // what is actually visible: near fade times fog
    phase: rand(i, 7) * Math.PI * 2,
    video: null,
    videoTex: null,
    posterTex: null
  };

  // Orientation: most of the way square to the camera, the rest leaning back
  // into the axis of the room, plus a few degrees of jitter on every axis so
  // no two planes are parallel. The lean is what stops the field reading as a
  // stack of billboards — work out at the edges is genuinely turned. The
  // jitter is kept, because the lean is re-solved every time the plane is
  // dealt somewhere new and the jitter must survive that.
  plane.jx = (rand(i, 33) - 0.5) * 0.18;
  plane.jy = (rand(i, 31) - 0.5) * 0.26;
  plane.rz = (rand(i, 35) - 0.5) * ROLL;
  plane.ry = FACE * Math.atan2(-plane.x, plane.dist0) + plane.jy;
  plane.rx = FACE * Math.atan2(plane.y, plane.dist0) + plane.jx;

  plane.rect = () => screenRect(plane);
  mesh.userData.plane = plane;
  scene.add(mesh);
  return plane;
}

function layout() {
  vw = window.innerWidth;
  vh = window.innerHeight;

  FOCAL = Math.max(vw, vh) * LENS;
  NEAR = FOCAL * NEAR_MUL;
  // Nothing is composed as close as a plane may travel. The near fade lives in
  // the gap between the two, so it never touches the resting frame — it only
  // dissolves work that has come past you — and the opening therefore hands
  // over to a field at full strength.
  REST_NEAR = FOCAL * REST_MUL;
  FAR = FOCAL * FAR_MUL;
  FOG_NEAR = FOCAL * FOG_MUL;
  FOG_FAR = FOCAL * FOG_END;
  FADE_TO = FOCAL * FADE_MUL;
  BOB = Math.max(2.5, Math.min(vw, vh) * BOB_MUL);
  // The float is a slow bob of BOB px; twice its amplitude is the whole travel
  // and the rest was margin. Four times it cost every tile real size for a gap
  // nothing ever moved into.
  FLOATPAD = BOB * 2.0;

  const fov = 2 * Math.atan(vh / 2 / FOCAL) * (180 / Math.PI);
  if (!camera) {
    camera = new THREE.PerspectiveCamera(fov, vw / vh, NEAR * 0.4, FAR * 1.2);
    camera.rotation.order = "YXZ";
  } else {
    camera.fov = fov;
    camera.aspect = vw / vh;
    camera.near = NEAR * 0.4;
    camera.far = FAR * 1.2;
    camera.updateProjectionMatrix();
  }
  camera.position.set(0, 0, 0);
  camera.rotation.set(0, 0, 0);

  // Linear fog, ending well past the back of the room, so that pulling away
  // from the arrangement dims it rather than deleting it.
  scene.fog = new THREE.Fog(0x000000, FOG_NEAR, FOG_FAR);

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(vw, vh, false);

  for (const p of planes) {
    releaseVideo(p);
    scene.remove(p.mesh);
    p.mat.dispose();
    p.mat = null;
  }
  planes = [];
  queue = [];
  hovered = null;
  dolly = dollyTarget = dollyVel = 0;
  camX = camY = 0;

  if (!unitGeom) unitGeom = new THREE.PlaneGeometry(1, 1);

  // Cut the field a few different ways and keep whichever one can be
  // travelled furthest. How much room an arrangement leaves depends on where
  // the splits happened to fall — one unlucky pair of neighbours at slightly
  // different depths sets the limit for the whole room — and composing is a
  // fraction of a millisecond, so there is no reason to accept the first
  // answer. Stop early once an arrangement is roomy enough to be worth having.
  // Cut the field a few different ways and keep the best. An arrangement is
  // judged on two things: whether the camera can lean far enough to bring
  // every film entirely into frame, and how much bare edge that costs when it
  // does. Both come from the geometry, so both can simply be measured, and
  // composing is a fraction of a millisecond — there is no reason to accept
  // the first cut.
  let slots = null;
  let room = null;
  let lean = null;
  let score = Infinity;

  for (let attempt = 0; attempt < 16; attempt++) {
    const cand = compose(items, attempt);
    const t = safeTravel(cand);
    const inTravel = Math.max(
      FOCAL * 0.08,
      Math.min(t.in * 0.9, densityTravel(cand)) - FOCAL * BREATH
    );
    const outTravel = Math.max(0, Math.min(t.out * 0.9, coverTravel(cand)) - FOCAL * BREATH);

    // Far enough to reach every film, at whichever end of the travel binds.
    const rIn = reachLean(cand, inTravel);
    const rOut = reachLean(cand, -outTravel);
    // As far as reach asks, and a quarter again so the last film does not have
    // to be pinned to the very corner of the screen to be seen whole — but no
    // further. Lean past what is needed buys nothing and costs bare margin at
    // the extremes, since the arrangement slides off one side without anything
    // arriving on the other.
    const wantX = Math.min(Math.max(rIn.x, rOut.x) * 1.25, vw * PARALLAX);
    const wantY = Math.min(Math.max(rIn.y, rOut.y) * 1.25, vh * PARALLAX);

    // ...but only as far as the films can be slid past one another without
    // meeting. Travel and lean are bounded together, since it is the
    // combination that bites.
    const k = leanScale(cand, inTravel, outTravel, wantX, wantY);
    const lx = wantX * k;
    const ly = wantY * k;

    // What that costs: bare edge at the extremes, and any film it still cannot
    // bring entirely into frame. Failing to reach is weighted the heavier of
    // the two — a film you can never see whole is worse than a thin margin.
    const missX = Math.max(0, Math.max(rIn.x, rOut.x) - lx) / vw;
    const missY = Math.max(0, Math.max(rIn.y, rOut.y) - ly) / vh;
    const cost = worstGap(cand, lx, ly, inTravel, outTravel) + (missX + missY) * 3;

    if (cost < score) {
      score = cost;
      slots = cand;
      room = { in: inTravel, out: outTravel };
      lean = { x: lx, y: ly };
    }
    if (score < 0.02) break;
  }

  TRAVEL_IN = room.in;
  TRAVEL_OUT = room.out;
  LEAN_X = lean.x;
  LEAN_Y = lean.y;

  for (let i = 0; i < items.length; i++) {
    const p = buildPlane(items[i], i, slots[i]);
    placePlane(p);
    planes.push(p);
  }

  // Fetch order: whatever is in the opening frame, brightest first, then
  // everything else by how soon travelling forward would reach it.
  queue = planes.slice().sort((a, b) => restPriority(b) - restPriority(a));
  pump();

  // The camera is not in the scene graph, so scene.updateMatrixWorld() will not
  // touch it — and an unupdated camera projects everything from the origin.
  camera.updateMatrixWorld(true);
  scene.updateMatrixWorld(true);
}

/**
 * How much a plane matters in the opening frame: its visible brightness if it
 * is on screen at rest, and a small negative otherwise, ordered so that the
 * nearest of the off-screen work still loads first.
 */
function restPriority(p) {
  const half = Math.max(p.w, p.h) * 0.5 * (FOCAL / p.dist0);
  const sx = vw / 2 + p.ax;
  const sy = vh / 2 - p.ay;
  const onScreen =
    sx + half > 0 && sx - half < vw && sy + half > 0 && sy - half < vh;
  const alpha = fogAlpha(p.dist0) * nearAlpha(p.dist0);
  return onScreen ? 1 + alpha : -p.dist0 / FAR;
}

/* --- placement and projection ------------------------------------------- */

/**
 * Put a plane where it belongs this frame. Its world x and y never change —
 * they are what makes travelling forward stream the field outward past the
 * camera rather than sliding a flat layer — only its distance does.
 */
function placePlane(p) {
  const d = p.dist;
  // A float that is the same few pixels however far away the plane is, so the
  // whole field breathes at one rate instead of the near work thrashing.
  const amp = BOB * (d / FOCAL);
  const bx = reduceMotion ? 0 : (Math.sin(clock * 0.31 + p.phase) - Math.sin(p.phase)) * amp;
  const by = reduceMotion ? 0 : (Math.sin(clock * 0.24 + p.phase * 1.7) - Math.sin(p.phase * 1.7)) * amp;
  const wob = reduceMotion ? 0 : (Math.sin(clock * 0.19 + p.phase) - Math.sin(p.phase)) * 0.012;

  p.mesh.position.set(p.x + bx, p.y + by, -d);
  p.mesh.rotation.set(p.rx + wob, p.ry - wob * 0.7, p.rz + wob * 0.5);
  const s = 1 + p.hover * 0.03;
  p.mesh.scale.set(p.w * s, p.h * s, 1);
}

const corner = new THREE.Vector3();

/**
 * Where a plane lands on screen right now, in CSS pixels: its four corners
 * projected through the camera, bounded. A plane turned in the field is a
 * trapezoid rather than a rectangle, and this is its bounding box — which is
 * what the lightbox zoom and the opening both want.
 */
function screenRect(p) {
  p.mesh.updateWorldMatrix(true, false);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (let i = 0; i < 4; i++) {
    corner.set(i < 2 ? -0.5 : 0.5, i % 2 ? -0.5 : 0.5, 0);
    corner.applyMatrix4(p.mesh.matrixWorld).project(camera);
    const sx = (corner.x * 0.5 + 0.5) * vw;
    const sy = (-corner.y * 0.5 + 0.5) * vh;
    if (sx < minX) minX = sx;
    if (sx > maxX) maxX = sx;
    if (sy < minY) minY = sy;
    if (sy > maxY) maxY = sy;
  }

  return {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2
  };
}

/** Just the middle of a plane, in CSS pixels. */
function screenCenter(p) {
  p.mesh.updateWorldMatrix(true, false);
  corner.set(0, 0, 0).applyMatrix4(p.mesh.matrixWorld).project(camera);
  return {
    x: (corner.x * 0.5 + 0.5) * vw,
    y: (-corner.y * 0.5 + 0.5) * vh
  };
}

/**
 * The atmosphere, mirrored in JS. The GPU applies this to the pixels; the
 * opening needs the same number to land its planes on the field's own values,
 * so the two must agree. Three's linear fog is a smoothstep, not a ramp.
 */
function fogAlpha(dist) {
  return 1 - smooth(clamp01((dist - FOG_NEAR) / (FOG_FAR - FOG_NEAR)));
}

/**
 * The near end. Work that has come close enough to fill the frame dissolves
 * rather than clipping through the lens — the same trick as the fog, at the
 * other end of the room, and what lets you travel right past a film rather
 * than into it.
 */
function nearAlpha(dist) {
  return smooth(clamp01((dist - NEAR) / (FADE_TO - NEAR)));
}

/* --- hover video -------------------------------------------------------- */

// Hover videos live here rather than nowhere: a media element outside the
// document is throttled or refused outright by some browsers, and a texture
// can only be as alive as the video feeding it. One pixel, invisible, inert.
const sink = document.createElement("div");
sink.className = "wall-sink";
sink.setAttribute("aria-hidden", "true");
document.body.appendChild(sink);

function hoverIn(p) {
  if (dragging || p.item.type !== "video" || p.video) return;

  const v = document.createElement("video");
  v.loop = true;
  v.muted = true; // Audio2.claim decides whether sound is actually allowed.
  v.playsInline = true;
  v.setAttribute("playsinline", "");
  v.preload = "auto";
  v.crossOrigin = "anonymous";
  // The hover loop, never the master — see scripts/loops.js.
  v.src = p.item.preview || p.item.src;

  const tex = new THREE.VideoTexture(v);
  tex.colorSpace = THREE.SRGBColorSpace;

  sink.appendChild(v);
  p.video = v;
  p.videoTex = tex;
  p.posterTex = p.mat.map;

  v.addEventListener("playing", () => {
    // Swap only once there are real frames, or the plane flashes black.
    if (p.video !== v) return;
    p.mat.map = tex;
    p.mat.needsUpdate = true;
  }, { once: true });

  Audio2.claim(v);
}

function releaseVideo(p) {
  if (!p.video) return;
  const v = p.video;
  const tex = p.videoTex;
  p.video = null;
  p.videoTex = null;
  if (p.posterTex && p.mat) {
    p.mat.map = p.posterTex;
    p.mat.needsUpdate = true;
  }
  p.posterTex = null;

  Audio2.release(v, () => {
    v.pause();
    v.removeAttribute("src");
    v.load();
    if (v.parentNode) v.parentNode.removeChild(v);
    if (tex) tex.dispose();
  });
}

function setHovered(p) {
  if (hovered === p) return;
  if (hovered) releaseVideo(hovered);
  hovered = p;
  if (readout) {
    readout.textContent = p ? p.item.title + " — " + p.item.caption : "";
    readout.classList.toggle("is-on", !!p);
  }
  if (p) hoverIn(p);
  document.body.classList.toggle("is-pointing", !!p);
}

/* --- frame -------------------------------------------------------------- */

function pick() {
  if (!raycaster || pointerNDC.x < -1.5) return null;
  raycaster.setFromCamera(pointerNDC, camera);
  const hits = raycaster.intersectObjects(scene.children, false);
  for (const h of hits) {
    const p = h.object.userData.plane;
    // Something dissolved into the fog or the near fade is not there to be
    // clicked, whatever the raycaster thinks. The fog lives on the GPU, so the
    // material's own opacity does not know about it — `alpha` is the number
    // that matches what is actually on screen.
    if (p && p.ready && p.alpha > 0.15) return p;
  }
  return null;
}

function frame(now) {
  requestAnimationFrame(frame);
  if (!running) return;

  if (frozen) {
    renderer.render(scene, camera);
    lastFrame = now;
    return;
  }

  // Real elapsed time, capped: a backgrounded tab returns with a huge delta,
  // and travel measured in seconds would jump the camera across the room.
  const dt = lastFrame ? Math.min(0.05, (now - lastFrame) / 1000) : 1 / 60;
  lastFrame = now;
  clock += dt;

  /* travel ---------------------------------------------------------------- */

  dollyTarget += dollyVel * dt * 60;
  dollyVel *= DOLLY_FRICTION;
  if (Math.abs(dollyVel) < 0.02) dollyVel = 0;
  // Travel has ends. Past one, a rubber band pulls back — the same treatment
  // the field used to give its edges, and for the same reason: you can always
  // find your way back to the arrangement you started in.
  if (dollyTarget > TRAVEL_IN || dollyTarget < -TRAVEL_OUT) {
    const edge = dollyTarget > 0 ? TRAVEL_IN : -TRAVEL_OUT;
    dollyTarget += (edge - dollyTarget) * 0.14;
    dollyVel *= 0.6;
    // And then a hard stop. The band is there to make the end feel like an
    // end, not to lend out the margin the solvers set aside.
    dollyTarget = Math.max(-TRAVEL_OUT, Math.min(TRAVEL_IN, dollyTarget));
  }
  dolly += (dollyTarget - dolly) * DOLLY_LERP;
  // A slow breath in and out on top of wherever you have travelled to, so the
  // room is never a still image waiting to be poked. It rides on top of the
  // travel rather than being added into it, so it cannot walk the field into
  // its own end stop.
  breath = reduceMotion ? 0 : Math.sin(clock * 0.055) * FOCAL * BREATH;

  /* the camera ------------------------------------------------------------ */

  let wantX, wantY;
  if (pointerActive || touching) {
    wantX = aimX * LEAN_X;
    wantY = aimY * LEAN_Y;
  } else if (!reduceMotion) {
    // Before the cursor has moved, the room drifts on its own.
    // A small fraction of the lean, not most of it: the arrangement was
    // composed for the camera sitting still, and that is what should be on
    // screen when nobody has touched anything yet.
    wantX = Math.sin(clock * 0.09) * LEAN_X * 0.14;
    wantY = Math.cos(clock * 0.07) * LEAN_Y * 0.12;
  } else {
    wantX = wantY = 0;
  }

  camX += (wantX - camX) * LERP;
  camY += (wantY - camY) * LERP;
  camera.position.set(camX, camY, 0);
  // Leaning the camera turns it partway back into the room, so the centre of
  // the composition holds while the near work swings across it. Turning it
  // the whole way would cancel the parallax; not turning it at all would slide
  // the field off the edge of the screen.
  camera.rotation.y = (camX / FOCAL) * CONVERGE;
  camera.rotation.x = -(camY / FOCAL) * CONVERGE;
  // A breath of roll into the lean. Small enough to read as weight rather than
  // as a horizon tipping over.
  camera.rotation.z = -(camX / (LEAN_X || 1)) * 0.008;
  camera.updateMatrixWorld();

  /* the field ------------------------------------------------------------- */

  for (const p of planes) {
    const want = p === hovered ? 1 : 0;
    p.hover += (want - p.hover) * 0.14;

    const next = Math.max(
      NEAR * 0.5,
      p.dist0 - dolly - breath - p.hover * HOVER_LIFT * p.dist0
    );
    p.dist = next;

    placePlane(p);
    // The near fade is ours to apply; the far one is the fog's, on the GPU.
    // `alpha` is the two of them together — what the visitor can actually see,
    // and therefore what may be hovered or clicked.
    const fade = nearAlpha(next);
    p.mat.opacity = Math.min(1, fade + p.hover * 0.25);
    // Colour rides the same eased weight, a touch ahead of it so the picture
    // is already warming as the plane starts to swell.
    if (p.mat.userData.sat) {
      p.mat.userData.sat.value = Math.min(1, p.hover * 1.15);
    }
    p.alpha = fade * fogAlpha(next);
  }

  const hit = dragging ? null : pick();
  setHovered(hit);

  renderer.render(scene, camera);
}

/* --- input ---------------------------------------------------------------
   The room is driven by where the cursor is, not by dragging it: moving the
   mouse leans the camera, the wheel travels, a click opens the work under the
   pointer. Touch has no cursor, so a finger drags — sideways to lean, up and
   down to travel. ------------------------------------------------------- */

function markInteracted() {
  if (interacted) return;
  interacted = true;
  if (hint) hint.classList.add("is-hidden");
}

function trackPointer(e) {
  pointerNDC.x = (e.clientX / vw) * 2 - 1;
  pointerNDC.y = -(e.clientY / vh) * 2 + 1;
  // Squared falloff about the centre: small movements near the middle barely
  // move the camera, and the full lean only arrives as the cursor reaches the
  // edge of the window. A linear map makes the whole room twitch.
  const nx = Math.max(-1, Math.min(1, pointerNDC.x));
  const ny = Math.max(-1, Math.min(1, pointerNDC.y));
  aimX = Math.sign(nx) * nx * nx;
  aimY = Math.sign(ny) * ny * ny;
}

stage.addEventListener("pointermove", (e) => {
  trackPointer(e);
  if (e.pointerType !== "touch") {
    pointerActive = true;
    touching = false;
    markInteracted();
  }

  if (!dragging || e.pointerId !== pointerId) return;

  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  moved += Math.abs(dx) + Math.abs(dy);
  if (moved > CLICK_SLOP) markInteracted();

  // Sideways leans and the room follows the finger. Up and down travels:
  // pushing up carries you further into the room, which is the direction that
  // gesture moves a page and the direction a wheel scrolled down goes.
  aimX = Math.max(-1, Math.min(1, aimX - dx / (vw * 0.5)));
  dollyVel -= dy * 0.16;
});

// The wheel is depth, not scroll. The page itself never scrolls — see the
// overflow rules in style.css — so there is nothing to preventDefault against.
stage.addEventListener(
  "wheel",
  (e) => {
    markInteracted();
    // deltaMode 1 is lines, 2 is pages. Firefox reports lines.
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? vh : 1;
    dollyVel += e.deltaY * unit * 0.075;
    // Clamped, so a flung trackpad cannot cross the whole range in one gesture.
    // Holding the wheel down keeps that pace rather than compounding it.
    dollyVel = Math.max(-FOCAL * 0.028, Math.min(FOCAL * 0.028, dollyVel));
  },
  { passive: true }
);

stage.addEventListener("pointerdown", (e) => {
  if (e.button !== 0 && e.pointerType === "mouse") return;
  trackPointer(e);
  moved = 0;
  pointerId = e.pointerId;
  // A tap has to pick before the frame loop has had a chance to: on touch
  // there was never a hover to remember.
  downPlane = hovered || pick();

  if (e.pointerType === "touch") {
    touching = true;
    pointerActive = false;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    stage.classList.add("is-dragging");
    // Capture can be refused if the pointer is already gone by the time this
    // runs, and a throw here would kill the rest of the handler.
    try { stage.setPointerCapture(e.pointerId); } catch (err) {}
  }
});

function endDrag(e) {
  if (!dragging || (e && e.pointerId !== pointerId)) return;
  dragging = false;
  stage.classList.remove("is-dragging");
}

stage.addEventListener("pointerup", (e) => {
  const tapped = moved <= CLICK_SLOP ? downPlane : null;
  endDrag(e);
  pointerId = null;
  downPlane = null;
  if (tapped) openLightbox(tapped);
});

stage.addEventListener("pointercancel", (e) => {
  downPlane = null;
  endDrag(e);
});

// The cursor leaving the window releases the camera back to its idle drift
// rather than freezing it wherever the mouse happened to exit.
stage.addEventListener("pointerleave", () => {
  pointerNDC.set(-2, -2);
  pointerActive = false;
  setHovered(null);
});

window.addEventListener("keydown", (e) => {
  const lean = 0.22;
  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    e.preventDefault();
    markInteracted();
    // Keys move the aim, not the camera, or the next mouse movement would snap
    // the room straight back.
    pointerActive = true;
    aimX = Math.max(-1, Math.min(1, aimX + (e.key === "ArrowLeft" ? -lean : lean)));
    return;
  }
  const travel = { ArrowUp: 1, ArrowDown: -1, PageUp: 3, PageDown: -3 }[e.key];
  if (!travel) return;
  e.preventDefault();
  markInteracted();
  dollyVel += travel * FOCAL * 0.006;
});

/* --- lightbox ----------------------------------------------------------- */

const lightbox = document.getElementById("lightbox");
const lbStage = document.getElementById("lightboxStage");
const lbTitle = document.getElementById("lightboxTitle");
const lbCaption = document.getElementById("lightboxCaption");

let lbOpen = false;
let lbOrigin = null;    // the plane this was opened from
let lbUpgrade = null;   // pending master-quality swap, cancelled on close

/**
 * Zoom the stage between a rectangle in the field and its resting centred
 * position. FLIP: the stage is already laid out where it belongs, so invert it
 * onto the source rect, force a reflow, then release it — the browser animates
 * a transform on the compositor.
 */
function zoom(fromRect, reverse, done) {
  const to = lbStage.getBoundingClientRect();
  if (!to.width || !to.height || !fromRect.w) {
    if (done) done();
    return;
  }

  const scale = fromRect.w / to.width;
  const dx = fromRect.x + fromRect.w / 2 - (to.left + to.width / 2);
  const dy = fromRect.y + fromRect.h / 2 - (to.top + to.height / 2);
  const inverted = `translate(${dx}px,${dy}px) scale(${scale})`;

  lbStage.style.transition = "none";
  lbStage.style.transform = reverse ? "none" : inverted;
  void lbStage.offsetWidth;
  lbStage.style.transition = "";
  lbStage.style.transform = reverse ? inverted : "none";

  if (!done) return;
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    lbStage.removeEventListener("transitionend", finish);
    done();
  };
  lbStage.addEventListener("transitionend", finish);
  setTimeout(finish, 700); // transitionend can be dropped; never strand a close
}

/**
 * Hand playback from the hovered plane to the lightbox without a break.
 *
 * The plane is already playing the buffered hover loop, so the full view opens
 * on that same file at that same timestamp. The master is 4K and hundreds of
 * megabytes, so it is faded in underneath only once it can play, seeked to
 * wherever the loop has reached.
 */
function playFrom(node, item, hoverVideo) {
  const at = hoverVideo && isFinite(hoverVideo.currentTime) ? hoverVideo.currentTime : 0;

  node.src = (hoverVideo && hoverVideo.currentSrc) || item.preview || item.src;
  if (item.poster) node.poster = item.poster;
  node.loop = true;
  node.controls = true;
  node.playsInline = true;
  node.setAttribute("playsinline", "");
  node.muted = true;

  const seek = () => { try { node.currentTime = at; } catch (e) {} };
  if (node.readyState >= 1) seek();
  else node.addEventListener("loadedmetadata", seek, { once: true });

  Audio2.claim(node);

  if (!item.preview || item.src === node.src) return; // already the master

  const master = document.createElement("video");
  master.className = "lightbox__upgrade";
  master.src = item.src;
  master.loop = true;
  master.controls = true;
  master.playsInline = true;
  master.setAttribute("playsinline", "");
  master.muted = true;
  master.preload = "auto";
  master.style.aspectRatio = node.style.aspectRatio;

  let cancelled = false;
  lbUpgrade = () => {
    cancelled = true;
    master.pause();
    master.removeAttribute("src");
    master.load();
  };

  master.addEventListener("loadedmetadata", () => {
    try { master.currentTime = node.currentTime; } catch (e) {}
  });

  master.addEventListener("canplay", () => {
    if (cancelled || !lbOpen) return;
    const p = master.play();
    if (p && p.catch) p.catch(() => {});
    master.classList.add("is-ready");
    setTimeout(() => {
      if (cancelled || !lbOpen) return;
      Audio2.claim(master);
      node.pause();
      node.removeAttribute("src");
      node.load();
      if (node.parentNode) node.parentNode.removeChild(node);
      // The loop was what gave the stage its size; with it gone the master has
      // to become the stage's ordinary child or the stage collapses.
      master.classList.remove("lightbox__upgrade", "is-ready");
      lbUpgrade = null;
    }, 420);
  }, { once: true });

  lbStage.appendChild(master);
}

/**
 * `source` is anything that can say what it is and where it is on screen: a
 * plane in the field, or a tile in the no-WebGL fallback. That is the whole
 * contract, and it is why the zoom works identically in both.
 */
function openLightbox(source) {
  if (lbOpen) return;
  lbOpen = true;
  lbOrigin = source;

  const item = source.item;
  const fromRect = source.rect();
  const hoverVideo = source.video;

  lbStage.innerHTML = "";

  let node;
  if (item.type === "video") {
    node = document.createElement("video");
    // Reserve the final shape before any bytes arrive, so the zoom animates
    // against the rectangle the media will actually occupy.
    node.style.aspectRatio = item.w + "/" + item.h;
    lbStage.appendChild(node);
    playFrom(node, item, hoverVideo);
  } else {
    node = document.createElement("img");
    node.style.aspectRatio = item.w + "/" + item.h;
    node.alt = item.caption;
    node.src = item.display || item.src;
    lbStage.appendChild(node);

    if (item.display && item.display !== item.src) {
      const full = new Image();
      full.onload = () => { if (lbOpen) node.src = item.src; };
      full.src = item.src;
    }
  }

  lbTitle.textContent = item.title;
  lbCaption.textContent = item.caption;
  lightbox.classList.add("is-open");
  lightbox.setAttribute("aria-hidden", "false");
  document.body.classList.add("is-lightbox-open");

  requestAnimationFrame(() => zoom(fromRect, false));
}

function closeLightbox() {
  if (!lbOpen) return;
  lbOpen = false;

  if (lbUpgrade) { lbUpgrade(); lbUpgrade = null; }

  const vids = lbStage.querySelectorAll("video");
  for (const v of vids) Audio2.release(v);

  const teardown = () => {
    for (const v of lbStage.querySelectorAll("video")) {
      v.pause();
      v.removeAttribute("src");
      v.load();
    }
    lbStage.innerHTML = "";
    lbStage.style.transition = "none";
    lbStage.style.transform = "none";
    void lbStage.offsetWidth;
    lbStage.style.transition = "";
    lbOrigin = null;
  };

  lightbox.classList.remove("is-open");
  lightbox.setAttribute("aria-hidden", "true");
  document.body.classList.remove("is-lightbox-open");

  // Travel back to wherever that plane has since moved to — the rect is read
  // now, not remembered from the open.
  if (lbOrigin) zoom(lbOrigin.rect(), true, teardown);
  else teardown();
}

document.getElementById("lightboxClose").addEventListener("click", closeLightbox);

lightbox.addEventListener("click", (e) => {
  const t = e.target;
  const onMedia = t && (t.tagName === "VIDEO" || t.tagName === "IMG");
  if (!onMedia) closeLightbox();
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeLightbox();
});

/* --- sound toggle ------------------------------------------------------- */

const soundBtn = document.getElementById("soundToggle");
const soundLabel = document.getElementById("soundLabel");

Audio2.onChange((st) => {
  soundBtn.classList.toggle("is-on", st.enabled && st.activated);
  soundBtn.classList.toggle("is-pending", st.pending);
  soundBtn.setAttribute("aria-pressed", String(st.enabled));
  soundLabel.textContent = st.pending
    ? "Click for sound"
    : st.enabled ? "Sound on" : "Sound off";
});

soundBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  Audio2.toggle();
});

/* --- fallback ----------------------------------------------------------- */

/**
 * A browser with no WebGL gets a plain scrolling grid of the same items. It is
 * deliberately dumb — no depth, no travel, no hover loops — but every piece is
 * reachable and the lightbox behaves exactly as it does in the field, because
 * both hand `openLightbox` the same {item, video, rect} shape.
 */
function startFallback() {
  document.body.classList.add("is-fallback");
  if (canvas) canvas.remove();

  const list = document.createElement("div");
  list.className = "wall-fallback";
  stage.appendChild(list);

  for (const item of items) {
    const cell = document.createElement("button");
    cell.className = "wall-fallback__cell";
    cell.type = "button";
    cell.setAttribute("aria-label", item.title + " — " + item.caption);

    const img = document.createElement("img");
    img.loading = "lazy";
    img.decoding = "async";
    img.alt = "";
    img.src =
      (item.type === "video" ? item.poster || item.thumb : item.display || item.thumb) ||
      item.thumb;
    cell.appendChild(img);

    const label = document.createElement("span");
    label.className = "wall-fallback__label";
    label.textContent = item.caption;
    cell.appendChild(label);

    cell.addEventListener("click", () => {
      openLightbox({
        item,
        video: null,
        rect() {
          const r = cell.getBoundingClientRect();
          return { x: r.left, y: r.top, w: r.width, h: r.height };
        }
      });
    });

    list.appendChild(cell);
  }

  running = false;   // nothing to drive: there is no frame loop here
  frozen = false;
  if (hint) hint.classList.add("is-hidden");
}

/* --- boot --------------------------------------------------------------- */

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (running) layout(); }, 200);
});

function fail(message) {
  if (hint) {
    hint.textContent = message;
    hint.classList.remove("is-hidden");
  }
}

/**
 * Public surface, unchanged: boot.js owns loading and the opening, this file
 * only knows how to build and drive the field once it is handed the items.
 */
window.Grid = {
  start(list) {
    items = selectItems(list || []);
    if (!items.length) {
      fail("No media found in /media");
      return false;
    }

    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: "high-performance"
      });
    } catch (err) {
      // No WebGL is not a locked door: the work still has to be viewable.
      console.error("WebGL unavailable, falling back to a plain grid:", err);
      startFallback();
      return true;
    }

    scene = new THREE.Scene();
    raycaster = new THREE.Raycaster();
    layout();
    running = true;
    requestAnimationFrame(frame);
    return true;
  },

  /**
   * The resting frame of every plane: exactly where the field draws it with
   * the camera at rest. The opening flattens its planes onto these numbers, so
   * the swap from the intro canvas to the field lands on identical geometry —
   * position, size, angle and brightness.
   */
  snapshot() {
    return planes.map((p) => {
      const c = screenCenter(p);
      return {
        x: c.x - p.wpx / 2,
        y: c.y - p.hpx / 2,
        w: p.wpx,
        h: p.hpx,
        scale: 1,
        opacity: fogAlpha(p.dist0) * nearAlpha(p.dist0),
        rot: { x: p.rx, y: p.ry, z: p.rz },
        texture: p.src || null
      };
    });
  },

  /**
   * What the field is showing right now. Only QA reads this — density and
   * depth spread are the two things about a scattered field that cannot be
   * judged from the source, so they have to be measurable from outside.
   */
  debug() {
    const inFrame = planes.filter((p) => {
      if (!p.mesh.visible || !(p.alpha > 0.05)) return false;
      const r = screenRect(p);
      return r.x + r.w > 0 && r.x < vw && r.y + r.h > 0 && r.y < vh;
    });
    const depths = planes.map((p) => Math.round(p.dist));
    return {
      planes: planes.length,
      loaded: planes.filter((p) => p.ready).length,
      visible: inFrame.length,
      dolly: Math.round(dolly + breath),
      cam: { x: Math.round(camX), y: Math.round(camY) },
      focal: Math.round(FOCAL),
      travel: { in: Math.round(TRAVEL_IN), out: Math.round(TRAVEL_OUT) },
      lean: { x: Math.round(LEAN_X), y: Math.round(LEAN_Y) },
      reach: (() => {
        const shape = planes.map((p) => ({
          ax: p.ax, ay: p.ay, dist: p.dist0, wpx: p.wpx, hpx: p.hpx, rz: p.rz
        }));
        const r = reachLean(shape, 0);
        return {
          x: Math.round(r.x),
          y: Math.round(r.y),
          gap: +worstGap(shape, LEAN_X, LEAN_Y, TRAVEL_IN, TRAVEL_OUT).toFixed(3),
          ok: r.x <= LEAN_X && r.y <= LEAN_Y
        };
      })(),
      depth: { near: Math.min(...depths), far: Math.max(...depths) }
    };
  },

  /**
   * Every plane's rectangle on screen right now, with what is visible of it.
   * QA only, and the reason it exists: the no-overlap promise is a claim about
   * pixels, so it has to be checkable in pixels from outside.
   */
  rects() {
    return planes
      .filter((p) => p.mesh.visible && p.alpha > 0.06)
      .map((p) => {
        const r = screenRect(p);
        return { title: p.item.title, x: r.x, y: r.y, w: r.w, h: r.h };
      });
  },

  /** Point the camera somewhere, -1..1 on each axis. QA again. */
  lookAt(x, y) {
    aimX = Math.max(-1, Math.min(1, x));
    aimY = Math.max(-1, Math.min(1, y));
    pointerActive = true;
  },

  /** Travel, in units. QA — nothing calls this. */
  travel(units) {
    dollyTarget += units;
  },

  /** Park travel at an exact distance, past the rubber band. QA only. */
  __setDolly(units) {
    dolly = dollyTarget = units;
    dollyVel = 0;
  },

  /** Hold the field still so it cannot drift out from under the opening. */
  freeze() {
    frozen = true;
  },

  /** Hand control back and show the field. */
  reveal() {
    frozen = false;
    lastFrame = 0;
    document.body.classList.add("is-revealed");
  },

  fail
};
