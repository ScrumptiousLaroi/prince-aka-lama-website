/* ---------------------------------------------------------------------------
   The name, assembling itself while the globe unfolds.

   Every letter runs through scrambled glyphs and then locks to its real
   character, staggered left to right so the word resolves as a wave. The
   schedule is a fraction of the opening's own duration rather than a duration
   of its own, so the last letter sets just as the tiles reach their grid
   positions — the two motions finish together instead of merely overlapping.

   The lockup is centred, so it must not move a pixel while it scrambles. Each
   letter is measured at its final width and pinned there before the first
   random glyph is drawn; substituting a W for an I then changes nothing about
   the layout.
--------------------------------------------------------------------------- */

var GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// Fractions of the opening's timeline. The first letter sets early enough to
// read as deliberate; the last lands just before the tiles do.
var FIRST_SET = 0.14;
var LAST_SET = 0.9;
var ROLE_IN = 0.62;

function randomGlyph() {
  return GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length));
}

/**
 * Start the lockup on the opening's clock.
 *
 * `duration` is the opening's total, in ms. Returns a handle whose `finish`
 * snaps everything to its resting state — used when the opening is skipped.
 */
export function runLockup(duration) {
  var name = document.querySelector(".brand__name");
  var role = document.querySelector(".brand__role");
  if (!name) return { finish: function () {} };

  document.body.classList.add("is-lockup");

  var settle = function () {
    name.textContent = name.dataset.text || name.textContent;
    if (role) role.classList.add("is-in");
  };

  // Reduced motion still gets the lockup, just without the scramble.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    settle();
    return { finish: function () {} };
  }

  var text = name.textContent;
  name.dataset.text = text;
  name.textContent = "";

  var cells = [];
  for (var i = 0; i < text.length; i++) {
    var span = document.createElement("span");
    span.className = "lockup__ch";
    span.textContent = text.charAt(i);
    name.appendChild(span);
    cells.push({ el: span, ch: text.charAt(i), set: false, nextAt: 0 });
  }

  // Pin each cell to the width of its final glyph, before anything scrambles.
  for (var j = 0; j < cells.length; j++) {
    cells[j].el.style.width =
      cells[j].el.getBoundingClientRect().width.toFixed(2) + "px";
  }

  var last = Math.max(1, cells.length - 1);
  var t0 = null;
  var frame = 0;
  var running = true;

  function lock(cell) {
    if (cell.set) return;
    cell.set = true;
    cell.el.textContent = cell.ch;
    cell.el.classList.add("is-set");
  }

  function tick(now) {
    if (!running) return;
    if (t0 === null) t0 = now;
    var p = Math.min(1, (now - t0) / duration);

    for (var k = 0; k < cells.length; k++) {
      var cell = cells[k];
      var at = FIRST_SET + (LAST_SET - FIRST_SET) * (k / last);

      if (p >= at) {
        lock(cell);
      } else if (cell.ch !== " " && now >= cell.nextAt) {
        cell.el.textContent = randomGlyph();
        cell.nextAt = now + 50 + Math.random() * 45;
      }
    }

    if (role && p >= ROLE_IN) role.classList.add("is-in");

    if (p >= 1) {
      running = false;
      return;
    }
    frame = requestAnimationFrame(tick);
  }

  frame = requestAnimationFrame(tick);

  return {
    finish: function () {
      if (!running) return;
      running = false;
      cancelAnimationFrame(frame);
      for (var m = 0; m < cells.length; m++) lock(cells[m]);
      if (role) role.classList.add("is-in");
    }
  };
}
