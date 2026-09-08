/* ---------------------------------------------------------------------------
   Infinite draggable grid.

   Every item gets exactly one DOM node. Its on-screen position is the world
   position wrapped modulo the world size, so panning past an edge brings the
   node back around on the opposite side — infinite in both axes with a fixed
   node count. This requires the world to be at least one cell larger than the
   viewport in both axes, which `solve()` guarantees by growing the deficient
   axis and cycling items through any surplus cells.
--------------------------------------------------------------------------- */

(function () {
  "use strict";

  var stage = document.getElementById("stage");
  var grid = document.getElementById("grid");
  var hint = document.getElementById("hint");

  var items = [];

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* --- tuning ----------------------------------------------------------- */

  var LERP = 0.075;          // how fast the view catches up to the target
  var FRICTION = 0.94;       // fling decay after release
  var DRIFT = reduceMotion ? 0 : 0.16; // idle drift, px per frame
  var WHEEL_SCALE = 1.0;
  var CLICK_SLOP = 6;        // px of movement still counted as a click
  var MIN_SCALE = 0.88;      // scale at the far edge of the depth falloff
  var MIN_OPACITY = 0.55;

  /* --- layout ----------------------------------------------------------- */

  var cellW, cellH, gapX, gapY, cols, rows, worldW, worldH;
  var vw = 0, vh = 0;
  var tiles = [];

  function metrics() {
    vw = window.innerWidth;
    vh = window.innerHeight;

    // Phones get proportionally larger cells: fewer cells are then needed to
    // cover the tall viewport, which keeps the world within one pass of the
    // item list instead of forcing duplicates.
    var base = vw < 700 ? vw * 0.72 : Math.min(vw, vh) * 0.36;
    cellW = Math.round(base);
    cellH = Math.round(base * 1.15);
    // Deliberately tight. Combined with the jitter below this lets neighbours
    // cross over each other here and there, the way the reference does, instead
    // of sitting in a clean lattice.
    gapX = Math.round(cellW * 0.04);
    gapY = Math.round(cellH * 0.03);
  }

  // Choose a grid shape that is (a) roughly square, (b) big enough to hold
  // every item, and (c) at least one cell larger than the viewport in both
  // axes — otherwise wrapping would expose a seam. Only the deficient axis
  // grows, and surplus cells cycle back through the item list.
  function solve() {
    var n = items.length;
    var stepX = cellW + gapX;
    var stepY = cellH + gapY;

    var c = Math.max(2, Math.round(Math.sqrt(n * 1.35)));
    var r = Math.ceil(n / c);

    c = Math.max(c, Math.ceil((vw + stepX * 1.5) / stepX));
    r = Math.max(r, Math.ceil((vh + stepY * 1.5) / stepY));

    cols = c;
    rows = r;
    worldW = cols * stepX;
    worldH = rows * stepY;

    // Fill every cell, cycling items. The stride keeps repeats off each
    // other's heels when the cell count exceeds the item count.
    var total = cols * rows;
    var stride = n % cols === 0 ? 1 : 0;
    var list = [];
    for (var i = 0; i < total; i++) list.push(items[(i + stride * Math.floor(i / cols)) % n]);
    return list;
  }

  // Deterministic per-cell jitter so the field reads as scattered, not ruled.
  function jitter(i, salt) {
    var n = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
    return n - Math.floor(n); // 0..1
  }

  /* --- tile construction ------------------------------------------------ */

  function buildTile(item, index) {
    var el = document.createElement("div");
    el.className = "tile";
    el.setAttribute("role", "button");
    el.setAttribute("tabindex", "0");
    // The tile shows the brand only, so the accessible name matches it. The
    // filename-derived title is still what the lightbox displays.
    el.setAttribute("aria-label", item.caption + (item.type === "video" ? " — Film" : ""));

    var img = document.createElement("img");
    img.className = "tile__media tile__poster";
    img.alt = item.caption;
    img.decoding = "async";
    img.loading = "lazy";
    img.draggable = false;
    // Tiles show the poster or the display copy — never the original.
    img.src = item.type === "video" ? item.poster : (item.display || item.src);
    img.addEventListener("load", function () { img.classList.add("is-loaded"); });
    el.appendChild(img);

    if (item.type === "video") {
      var badge = document.createElement("span");
      badge.className = "tile__badge";
      badge.textContent = "Film";
      el.appendChild(badge);
    }

    var label = document.createElement("div");
    label.className = "tile__label";
    label.innerHTML = '<span class="tile__caption"></span>';
    label.querySelector(".tile__caption").textContent = item.caption;
    el.appendChild(label);

    var tile = { el: el, img: img, item: item, video: null, x: 0, y: 0, w: 0, h: 0 };
    el.__tile = tile;

    el.addEventListener("pointerenter", function () {
      hovering++;
      el.style.zIndex = "40";
      hoverIn(tile);
    });
    el.addEventListener("pointerleave", function () {
      hovering = Math.max(0, hovering - 1);
      el.style.zIndex = tile.z;
      hoverOut(tile);
    });
    el.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openLightbox(item, tile); }
    });

    grid.appendChild(el);
    return tile;
  }

  function layout() {
    metrics();
    var list = solve();

    grid.innerHTML = "";
    tiles = [];
    hovering = 0;

    var stepX = cellW + gapX;
    var stepY = cellH + gapY;

    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      var col = i % cols;
      var row = Math.floor(i / cols);
      var tile = buildTile(item, i);

      // Fit the media's aspect ratio inside the cell.
      var ratio = item.w / item.h;
      var w, h;
      if (ratio >= 1) { w = cellW; h = Math.round(cellW / ratio); }
      else { h = cellH; w = Math.round(cellH * ratio); }

      var sizeMul = 0.86 + jitter(i, 3) * 0.28;
      w = Math.round(w * sizeMul);
      h = Math.round(h * sizeMul);

      tile.w = w;
      tile.h = h;
      tile.el.style.width = w + "px";
      tile.el.style.height = h + "px";

      // Centre in the cell, then push out by a stable per-cell jitter. The
      // amplitude is a fraction of the cell rather than of the gap, so tiles
      // wander far enough to overlap their neighbours.
      tile.x = col * stepX + (cellW - w) / 2 + (jitter(i, 1) - 0.5) * cellW * 0.34;
      tile.y = row * stepY + (cellH - h) / 2 + (jitter(i, 2) - 0.5) * cellH * 0.28;

      // Static stacking order. Recomputing depth-based z-index every frame
      // would thrash the compositor; a stable shuffle reads just as layered.
      tile.z = String(2 + Math.floor(jitter(i, 4) * 10));
      tile.el.style.zIndex = tile.z;

      tiles.push(tile);
    }
  }

  /* --- video on hover --------------------------------------------------- */

  function hoverIn(tile) {
    if (dragging || tile.item.type !== "video" || tile.video) return;

    var v = document.createElement("video");
    v.className = "tile__media tile__video";
    v.loop = true;
    v.playsInline = true;
    v.setAttribute("playsinline", "");
    v.preload = "auto";
    v.muted = true; // Audio2.claim decides whether sound is actually allowed.
    // The hover loop, never the master — see scripts/loops.js.
    v.src = tile.item.preview || tile.item.src;
    v.addEventListener("playing", function () {
      v.classList.add("is-loaded", "is-playing");
    });
    tile.el.appendChild(v);
    tile.video = v;

    Audio2.claim(v);
  }

  function hoverOut(tile) {
    if (!tile.video) return;
    var v = tile.video;
    tile.video = null;
    v.classList.remove("is-playing");

    // Fade the sound out first, then let the visual fade finish, then tear the
    // stream down so the decoder and buffer are released.
    Audio2.release(v, function () {
      setTimeout(function () {
        v.pause();
        v.removeAttribute("src");
        v.load();
        if (v.parentNode) v.parentNode.removeChild(v);
      }, 400);
    });
  }

  /* --- motion ----------------------------------------------------------- */

  var targetX = 0, targetY = 0;   // where the view wants to be
  var curX = 0, curY = 0;         // where it actually is
  var velX = 0, velY = 0;
  var dragging = false;
  var hovering = 0;               // tiles currently under the pointer
  var pointerActive = false;      // the pointer has moved at least once
  var moved = 0;
  var pointerId = null;
  var lastX = 0, lastY = 0;
  var interacted = false;
  var frozen = false;             // held still while the opening plays
  var downTile = null;            // tile the current press started on

  function wrap(v, size) {
    return ((v % size) + size) % size;
  }

  /**
   * Where tile `t` sits, and how it is scaled and faded, for a given pan
   * offset. The opening reads this to work out where its planes have to land,
   * so this must stay the only place the frame is computed.
   */
  function frameFor(t, offX, offY) {
    var cx = vw / 2;
    var cy = vh / 2;
    var maxDist = Math.sqrt(cx * cx + cy * cy);

    // Wrap into a band that starts one cell off-screen so nothing pops in.
    var x = wrap(t.x + offX + cellW, worldW) - cellW;
    var y = wrap(t.y + offY + cellH, worldH) - cellH;

    var dx = x + t.w / 2 - cx;
    var dy = y + t.h / 2 - cy;
    var dist = Math.min(1, Math.sqrt(dx * dx + dy * dy) / maxDist);

    return {
      x: x,
      y: y,
      scale: 1 - (1 - MIN_SCALE) * dist,
      opacity: 1 - (1 - MIN_OPACITY) * dist * dist
    };
  }

  function render() {
    if (frozen) {
      requestAnimationFrame(render);
      return;
    }

    if (!dragging) {
      targetX += velX;
      targetY += velY;
      velX *= FRICTION;
      velY *= FRICTION;
      if (Math.abs(velX) < 0.01) velX = 0;
      if (Math.abs(velY) < 0.01) velY = 0;

      // Drift is an attract loop for an untouched page. The moment a pointer
      // moves it stops: a tile sliding out from under the cursor is impossible
      // to hover, let alone play.
      if (!interacted && !hovering && !pointerActive && velX === 0 && velY === 0) {
        targetX -= DRIFT;
        targetY -= DRIFT * 0.45;
      }
    }

    curX += (targetX - curX) * LERP;
    curY += (targetY - curY) * LERP;

    for (var i = 0; i < tiles.length; i++) {
      var t = tiles[i];
      var f = frameFor(t, curX, curY);

      t.el.style.transform =
        "translate3d(" + f.x.toFixed(2) + "px," + f.y.toFixed(2) + "px,0) scale(" +
        f.scale.toFixed(3) + ")";
      t.el.style.opacity = f.opacity.toFixed(3);
    }

    requestAnimationFrame(render);
  }

  /* --- input ------------------------------------------------------------ */

  function markInteracted() {
    if (interacted) return;
    interacted = true;
    if (hint) hint.classList.add("is-hidden");
  }

  stage.addEventListener("pointerdown", function (e) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    dragging = true;
    pointerId = e.pointerId;
    moved = 0;
    // The stage captures the pointer below, which means the eventual `click`
    // is retargeted from the tile to the stage — a listener on the tile would
    // never hear it. So the press is recorded here and resolved on release.
    downTile = e.target && e.target.closest ? e.target.closest(".tile") : null;
    lastX = e.clientX;
    lastY = e.clientY;
    velX = velY = 0;
    stage.classList.add("is-dragging");
    stage.setPointerCapture(e.pointerId);
  });

  stage.addEventListener("pointermove", function (e) {
    pointerActive = true;
    if (!dragging || e.pointerId !== pointerId) return;
    var dx = e.clientX - lastX;
    var dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    if (moved > CLICK_SLOP) markInteracted();
    targetX += dx;
    targetY += dy;
    curX += dx * 0.5;   // immediate response, the lerp catches the rest
    curY += dy * 0.5;
    velX = dx;
    velY = dy;
  });

  function endDrag(e) {
    if (!dragging || (e && e.pointerId !== pointerId)) return;
    dragging = false;
    pointerId = null;
    stage.classList.remove("is-dragging");
  }

  stage.addEventListener("pointerup", function (e) {
    var tapped = dragging && moved <= CLICK_SLOP ? downTile : null;
    endDrag(e);
    downTile = null;
    if (tapped && tapped.__tile) openLightbox(tapped.__tile.item, tapped.__tile);
  });

  stage.addEventListener("pointercancel", function (e) {
    downTile = null;   // a cancelled press is never a tap
    endDrag(e);
  });

  stage.addEventListener("wheel", function (e) {
    e.preventDefault();
    markInteracted();
    velX = velY = 0;
    targetX -= e.deltaX * WHEEL_SCALE;
    targetY -= e.deltaY * WHEEL_SCALE;
  }, { passive: false });

  window.addEventListener("keydown", function (e) {
    var step = 160;
    var map = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    var d = map[e.key];
    if (!d) return;
    e.preventDefault();
    markInteracted();
    targetX += d[0];
    targetY += d[1];
  });

  /* --- lightbox --------------------------------------------------------- */

  var lightbox = document.getElementById("lightbox");
  var lbStage = document.getElementById("lightboxStage");
  var lbTitle = document.getElementById("lightboxTitle");
  var lbCaption = document.getElementById("lightboxCaption");

  var lbOpen = false;
  var lbOrigin = null;   // the tile element this was opened from
  var lbUpgrade = null;  // pending master-quality swap, cancelled on close

  /**
   * Zoom the stage between a tile's rectangle and its resting centred position.
   *
   * FLIP: the stage is already laid out where it belongs, so we invert it back
   * onto the tile, force a reflow, then release it. The browser animates the
   * transform on the compositor, which a width/height animation could not do.
   */
  function zoom(fromRect, reverse, done) {
    var to = lbStage.getBoundingClientRect();
    if (!to.width || !to.height || !fromRect.width) {
      if (done) done();
      return;
    }

    var scale = fromRect.width / to.width;
    var dx = fromRect.left + fromRect.width / 2 - (to.left + to.width / 2);
    var dy = fromRect.top + fromRect.height / 2 - (to.top + to.height / 2);
    var inverted = "translate(" + dx + "px," + dy + "px) scale(" + scale + ")";

    lbStage.style.transition = "none";
    lbStage.style.transform = reverse ? "none" : inverted;
    void lbStage.offsetWidth; // commit the start frame before transitioning
    lbStage.style.transition = "";
    lbStage.style.transform = reverse ? inverted : "none";

    if (!done) return;
    var settled = false;
    var finish = function () {
      if (settled) return;
      settled = true;
      lbStage.removeEventListener("transitionend", finish);
      done();
    };
    lbStage.addEventListener("transitionend", finish);
    setTimeout(finish, 700); // transitionend can be dropped; never strand the close
  }

  /**
   * Hand playback from the hovered tile to the lightbox without a break.
   *
   * The tile is already playing the buffered hover loop, so the full view opens
   * on that same file at that same timestamp — no reload, no restart. The
   * master is 4K and hundreds of megabytes, so it is faded in underneath only
   * once it can actually play, seeked to wherever the loop has reached.
   */
  function playFrom(node, item, tileVideo) {
    var at = tileVideo && isFinite(tileVideo.currentTime) ? tileVideo.currentTime : 0;

    node.src = (tileVideo && tileVideo.currentSrc) || item.preview || item.src;
    if (item.poster) node.poster = item.poster;
    node.loop = true;
    node.controls = true;
    node.playsInline = true;
    node.setAttribute("playsinline", "");
    node.muted = true;

    var seek = function () {
      try { node.currentTime = at; } catch (e) {}
    };
    if (node.readyState >= 1) seek();
    else node.addEventListener("loadedmetadata", seek, { once: true });

    Audio2.claim(node);

    if (!item.preview || item.src === node.src) return; // already the master

    // --- upgrade to the master ------------------------------------------
    var master = document.createElement("video");
    master.className = "lightbox__upgrade";
    master.src = item.src;
    master.loop = true;
    master.controls = true;
    master.playsInline = true;
    master.setAttribute("playsinline", "");
    master.muted = true;
    master.preload = "auto";
    master.style.aspectRatio = node.style.aspectRatio;

    var cancelled = false;
    lbUpgrade = function () {
      cancelled = true;
      master.pause();
      master.removeAttribute("src");
      master.load();
    };

    master.addEventListener("loadedmetadata", function () {
      // Match the loop's position in the master's own timeline. The loop is cut
      // from LOOP_AT, so its clock is offset from the master's by that much.
      try { master.currentTime = node.currentTime; } catch (e) {}
    });

    master.addEventListener("canplay", function () {
      if (cancelled || !lbOpen) return;
      var p = master.play();
      if (p && p.catch) p.catch(function () {});
      master.classList.add("is-ready");
      // Let the crossfade finish before the loop's decoder is torn down.
      setTimeout(function () {
        if (cancelled || !lbOpen) return;
        Audio2.claim(master);
        node.pause();
        node.removeAttribute("src");
        node.load();
        if (node.parentNode) node.parentNode.removeChild(node);
        // The loop was what gave the stage its size; the master is stacked over
        // it out of flow. With the loop gone the master has to become the
        // stage's ordinary child, or the stage collapses to nothing.
        master.classList.remove("lightbox__upgrade", "is-ready");
        lbUpgrade = null;
      }, 420);
    }, { once: true });

    lbStage.appendChild(master);
  }

  function openLightbox(item, tile) {
    if (lbOpen) return;
    lbOpen = true;
    lbOrigin = tile ? tile.el : null;

    var fromRect = lbOrigin
      ? lbOrigin.getBoundingClientRect()
      : { left: vw / 2, top: vh / 2, width: 0, height: 0 };

    lbStage.innerHTML = "";

    var node;
    if (item.type === "video") {
      node = document.createElement("video");
      // Reserve the final shape before any bytes arrive, so the zoom animates
      // against the rectangle the media will actually occupy.
      node.style.aspectRatio = item.w + "/" + item.h;
      lbStage.appendChild(node);
      playFrom(node, item, tile && tile.video);
    } else {
      node = document.createElement("img");
      node.style.aspectRatio = item.w + "/" + item.h;
      node.alt = item.caption;
      // The display copy is already decoded from the tile; the original then
      // replaces it once it has loaded, which is where the detail lives.
      node.src = item.display || item.src;
      lbStage.appendChild(node);

      if (item.display && item.display !== item.src) {
        var full = new Image();
        full.onload = function () {
          if (lbOpen) node.src = item.src;
        };
        full.src = item.src;
      }
    }

    lbTitle.textContent = item.title;
    lbCaption.textContent = item.caption;
    lightbox.classList.add("is-open");
    lightbox.setAttribute("aria-hidden", "false");
    document.body.classList.add("is-lightbox-open");

    requestAnimationFrame(function () { zoom(fromRect, false); });
  }

  function closeLightbox() {
    if (!lbOpen) return;
    lbOpen = false;

    if (lbUpgrade) { lbUpgrade(); lbUpgrade = null; }

    // Fade the sound out now; the picture keeps travelling back to its tile.
    var vids = lbStage.querySelectorAll("video");
    for (var i = 0; i < vids.length; i++) Audio2.release(vids[i]);

    var teardown = function () {
      var v = lbStage.querySelectorAll("video");
      for (var j = 0; j < v.length; j++) {
        v[j].pause();
        v[j].removeAttribute("src");
        v[j].load();
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

    // Travel back to the tile it came from, wherever the grid has since moved
    // it — the rect is read now, not remembered from the open.
    if (lbOrigin) zoom(lbOrigin.getBoundingClientRect(), true, teardown);
    else teardown();
  }

  document.getElementById("lightboxClose").addEventListener("click", closeLightbox);

  // Anything that is not the media itself counts as outside: the backdrop, the
  // stage's own padding beside a portrait frame, the caption block. The media
  // keeps its clicks so the video's controls still work.
  lightbox.addEventListener("click", function (e) {
    var t = e.target;
    var onMedia = t && (t.tagName === "VIDEO" || t.tagName === "IMG");
    if (!onMedia) closeLightbox();
  });

  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeLightbox();
  });

  /* --- sound toggle ----------------------------------------------------- */

  var soundBtn = document.getElementById("soundToggle");
  var soundLabel = document.getElementById("soundLabel");

  Audio2.onChange(function (st) {
    soundBtn.classList.toggle("is-on", st.enabled && st.activated);
    soundBtn.classList.toggle("is-pending", st.pending);
    soundBtn.setAttribute("aria-pressed", String(st.enabled));
    soundLabel.textContent = st.pending
      ? "Click for sound"
      : st.enabled ? "Sound on" : "Sound off";
  });

  soundBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    Audio2.toggle();
  });

  /* --- boot ------------------------------------------------------------- */

  var resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layout, 200);
  });

  function fail(message) {
    if (hint) {
      hint.textContent = message;
      hint.classList.remove("is-hidden");
    }
  }

  /**
   * Public surface. The boot module owns loading and the intro; this file only
   * knows how to build and drive the grid once it is handed the items.
   */
  window.Grid = {
    start: function (list) {
      items = list || [];
      if (!items.length) {
        fail("No media found in /media");
        return false;
      }
      layout();
      requestAnimationFrame(render);
      return true;
    },

    /**
     * The resting frame of every tile: exactly where the DOM will draw it once
     * the opening finishes. The opening flattens its planes onto these numbers,
     * so the swap from canvas to DOM lands on identical geometry.
     */
    snapshot: function () {
      return tiles.map(function (t) {
        var f = frameFor(t, 0, 0);
        return {
          x: f.x,
          y: f.y,
          w: t.w,
          h: t.h,
          scale: f.scale,
          opacity: f.opacity,
          texture: t.item.thumb || null
        };
      });
    },

    /** Hold the grid still so it cannot drift out from under the opening. */
    freeze: function () {
      frozen = true;
    },

    /** Hand control back and show the grid. */
    reveal: function () {
      frozen = false;
      document.body.classList.add("is-revealed");
    },

    fail: fail
  };
})();