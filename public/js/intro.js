/* ---------------------------------------------------------------------------
   Opening sequence.

   The globe is not a separate shot that cross-fades into the grid — it IS the
   grid. Every plane here corresponds to one DOM tile, and over the course of
   the animation it travels from its position on the sphere to the exact pixel
   rectangle the DOM will draw it in. At the final frame the canvas and the DOM
   are geometrically identical, so handing over is invisible.

   That identity is the whole trick, and it rests on one piece of setup: the
   camera ends at a distance where one world unit equals one CSS pixel at z=0.
   `fov = 2 * atan((viewportHeight / 2) / distance)` is what makes that true, so
   a plane sized 320x420 units at z=0 covers 320x420 px of screen.

   Extra planes with no tile behind them pad the sphere out — two dozen alone
   read as scattered cards rather than a globe — and dissolve on the way in.
--------------------------------------------------------------------------- */

import * as THREE from "/vendor/three/three.module.min.js";

const DURATION = 4200;
const FILLER_COUNT = 130;     // decorative planes that never land
const SPHERE_SCALE = 0.85;    // tile size on the sphere, relative to its landed size

// ?introAt=0.4 freezes the opening at that fraction of its travel — the only
// practical way to inspect one moment of a moving shot.
const FREEZE_AT = (() => {
  const raw = new URLSearchParams(location.search).get("introAt");
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : null;
})();

const canvas = document.getElementById("introCanvas");
const root = document.getElementById("intro");

/** Cubic ease-in-out: slow depart, committed middle, soft arrival. */
function ease(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Smoothstep between two thresholds, for staggering per-tile timing. */
function span(v, a, b) {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Fibonacci distribution over a hemisphere. Even spacing with none of the
 * clustering at the pole that a naive lat/long loop produces.
 */
function domePoint(i, count, radius) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const y = 0.06 + (i / count) * 0.94;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = golden * i;
  return new THREE.Vector3(
    Math.cos(theta) * r,
    y,
    Math.sin(theta) * r
  ).multiplyScalar(radius);
}

/** Deterministic 0..1 noise, so a reload plays the identical shot. */
function rand(i, salt) {
  const n = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

export function runIntro(layout, onDone) {
  const landing = layout.filter((t) => t.texture);
  if (!landing.length || !canvas) {
    onDone();
    return { skip() {} };
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance"
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(vw, vh);

  const scene = new THREE.Scene();

  // One world unit == one CSS pixel at z=0, given this camera distance. The
  // distance is chosen to sit outside the globe's radius, so the camera can
  // dolly the whole way in without ever crossing the shell — from inside a
  // hemisphere you see plane backs and an empty lower half of frame.
  const DIST = Math.max(vw, vh) * 1.5;
  const fov = 2 * Math.atan(vh / 2 / DIST) * (180 / Math.PI);
  const camera = new THREE.PerspectiveCamera(fov, vw / vh, 1, Math.max(vw, vh) * 12);

  // Radius follows the tiles, not the viewport. Tile sizes are set by the grid
  // and barely change between a phone and a desktop, so a viewport-derived
  // radius leaves the globe sparse on one and a pile-up on the other. Solving
  // it from total plane area keeps the covering consistent everywhere: the
  // constant is how much the planes overlap, and 0.4 is the dense, shingled
  // look rather than a neat mosaic.
  const COVERAGE = 0.4;
  const totalPlanes = landing.length + FILLER_COUNT;
  const avgArea =
    landing.reduce((sum, t) => sum + t.w * t.h, 0) / landing.length;
  const planeArea = avgArea * SPHERE_SCALE * SPHERE_SCALE * totalPlanes;
  const RADIUS = Math.sqrt((COVERAGE * planeArea) / (2 * Math.PI));

  // A hemisphere's mass sits above its origin, so drop it to centre the cap in
  // frame instead of leaving the bottom third of the shot empty.
  const DOME_DROP = RADIUS * 0.46;

  const loader = new THREE.TextureLoader();
  const cache = new Map();
  const textureOf = (url) => {
    if (!cache.has(url)) {
      const tex = loader.load(url);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      cache.set(url, tex);
    }
    return cache.get(url);
  };

  /* --- planes ----------------------------------------------------------- */

  // A unit plane, scaled per tile. One geometry for everything.
  const unit = new THREE.PlaneGeometry(1, 1);
  const planes = [];

  const total = totalPlanes;

  landing.forEach((tile, i) => {
    // Spread the landing tiles evenly across the dome rather than bunching
    // them, so the globe does not visibly thin out as the fillers dissolve.
    const slot = Math.floor((i * total) / landing.length);
    const start = domePoint(slot, total, RADIUS);
    start.y -= DOME_DROP;

    const mat = new THREE.MeshBasicMaterial({
      map: textureOf(tile.texture),
      transparent: true,
      opacity: 0,
      depthWrite: false
    });

    const mesh = new THREE.Mesh(unit, mat);
    scene.add(mesh);

    // Landed: the exact rectangle the DOM tile will occupy. DOM y runs down
    // from the top, world y runs up from the centre.
    const endPos = new THREE.Vector3(
      tile.x + tile.w / 2 - vw / 2,
      -(tile.y + tile.h / 2 - vh / 2),
      0
    );
    const endScale = new THREE.Vector3(tile.w * tile.scale, tile.h * tile.scale, 1);

    // On the sphere: facing outward, sized down, with a little roll.
    const startQuat = new THREE.Quaternion();
    const look = new THREE.Matrix4().lookAt(
      start,
      start.clone().multiplyScalar(2),
      new THREE.Vector3(0, 1, 0)
    );
    startQuat.setFromRotationMatrix(look);
    startQuat.multiply(
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 0, 1),
        (rand(i, 3) - 0.5) * 0.55
      )
    );

    planes.push({
      mesh,
      mat,
      startPos: start,
      endPos,
      startQuat,
      endQuat: new THREE.Quaternion(),
      startScale: new THREE.Vector3(
        tile.w * SPHERE_SCALE,
        tile.h * SPHERE_SCALE,
        1
      ),
      endScale,
      endOpacity: tile.opacity,
      // Tiles unfold on a stagger so the sphere peels apart rather than
      // snapping flat all at once.
      from: 0.34 + rand(i, 7) * 0.16,
      to: 0.82 + rand(i, 11) * 0.14,
      filler: false
    });
  });

  for (let i = 0; i < FILLER_COUNT; i++) {
    const slot = Math.floor(((i + 0.5) * total) / FILLER_COUNT);
    const start = domePoint(slot % total, total, RADIUS);
    start.y -= DOME_DROP;
    const source = landing[i % landing.length];

    const mat = new THREE.MeshBasicMaterial({
      map: textureOf(source.texture),
      transparent: true,
      opacity: 0,
      depthWrite: false
    });

    const mesh = new THREE.Mesh(unit, mat);
    scene.add(mesh);

    const quat = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().lookAt(
        start,
        start.clone().multiplyScalar(2),
        new THREE.Vector3(0, 1, 0)
      )
    );
    quat.multiply(
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 0, 1),
        (rand(i, 5) - 0.5) * 0.6
      )
    );

    mesh.position.copy(start);
    mesh.quaternion.copy(quat);
    mesh.scale.set(source.w * SPHERE_SCALE, source.h * SPHERE_SCALE, 1);

    planes.push({
      mesh,
      mat,
      filler: true,
      fadeFrom: 0.3 + rand(i, 13) * 0.12,
      fadeTo: 0.52 + rand(i, 17) * 0.14,
      peak: 0.5 + rand(i, 19) * 0.35
    });
  }

  /* --- camera path ------------------------------------------------------ */

  // Starts outside and above the globe; ends at the distance where world units
  // are CSS pixels, looking straight down the axis at the flattened grid.
  // Pull back far enough that the whole globe is in frame, measured against
  // whichever axis is tighter — on a portrait phone that is the width, and
  // framing to height alone crops the globe off both sides.
  const tanH = vh / 2 / DIST;
  const aspect = vw / vh;
  const fitDist = (RADIUS * 1.06) / Math.min(tanH, tanH * aspect);

  const camFrom = new THREE.Vector3(
    0,
    RADIUS * 0.42,
    Math.max(DIST * 1.55, fitDist)
  );
  const camTo = new THREE.Vector3(0, 0, DIST);
  const lookFrom = new THREE.Vector3(0, RADIUS * 0.06, 0);
  const lookTo = new THREE.Vector3(0, 0, 0);
  const lookAt = new THREE.Vector3();

  camera.position.copy(camFrom);
  camera.lookAt(lookFrom);

  /* --- loop ------------------------------------------------------------- */

  let start = null;
  let frame = 0;
  let finished = false;
  let running = true;

  function cleanup() {
    running = false;
    cancelAnimationFrame(frame);
    window.removeEventListener("resize", onResize);
    setTimeout(() => {
      unit.dispose();
      planes.forEach((p) => p.mat.dispose());
      cache.forEach((t) => t.dispose());
      renderer.dispose();
    }, 700);
  }

  function finish() {
    if (finished) return;
    finished = true;
    // Reveal the DOM on identical geometry first, then drop the canvas over it.
    onDone();
    requestAnimationFrame(() => root.classList.add("is-gone"));
    cleanup();
  }

  // Re-deriving the landing rectangles mid-flight is not worth it, so a real
  // resize ends the opening. Browsers also fire resize events that change
  // nothing — headless Chrome does it on load — and those must be ignored, or
  // the shot is over before it starts.
  function onResize() {
    if (FREEZE_AT !== null) return;
    if (window.innerWidth === vw && window.innerHeight === vh) return;
    finish();
  }
  window.addEventListener("resize", onResize);

  function tick(now) {
    if (!running) return;
    if (start === null) start = now;

    const elapsed = FREEZE_AT === null ? now - start : FREEZE_AT * DURATION;
    const t = Math.min(1, elapsed / DURATION);
    const e = ease(t);

    camera.position.lerpVectors(camFrom, camTo, e);
    lookAt.lerpVectors(lookFrom, lookTo, e);
    camera.lookAt(lookAt);

    // The globe turns while it is still a globe, easing to a stop as its tiles
    // start unfolding — a grid that arrives mid-rotation would be crooked.
    scene.rotation.y = (1 - span(t, 0.0, 0.55)) * 0.55 * (1 - e) + e * 0;

    const appear = Math.min(1, t / 0.14);

    for (const p of planes) {
      if (p.filler) {
        p.mat.opacity =
          appear * (0.45 + p.peak * 0.55) * (1 - span(t, p.fadeFrom, p.fadeTo));
        continue;
      }

      const k = span(t, p.from, p.to);
      p.mesh.position.lerpVectors(p.startPos, p.endPos, k);
      p.mesh.scale.lerpVectors(p.startScale, p.endScale, k);
      p.mesh.quaternion.slerpQuaternions(p.startQuat, p.endQuat, k);
      // Land on the tile's own resting opacity, so the DOM takes over at the
      // same value rather than stepping.
      p.mat.opacity = appear * (0.92 + (p.endOpacity - 0.92) * k);
    }

    renderer.render(scene, camera);

    if (FREEZE_AT !== null) {
      frame = requestAnimationFrame(tick);
      return;
    }

    if (t >= 1) {
      finish();
      return;
    }
    frame = requestAnimationFrame(tick);
  }

  frame = requestAnimationFrame(tick);

  return { skip: finish };
}
