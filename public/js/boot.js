/* ---------------------------------------------------------------------------
   Boot: load the manifest, play the intro, hand off to the grid.

   Every failure path still ends with a usable grid — a browser without WebGL,
   a three.js module that will not load, or a user who would rather skip.
--------------------------------------------------------------------------- */

// The wall owns window.Grid, so it must be evaluated before main() runs.
import "./wall.js";

const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ?nointro=1 goes straight to the grid — handy for QA, and for anyone who has
// seen the opening enough times.
const NO_INTRO = new URLSearchParams(location.search).has("nointro");

function supportsWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch (e) {
    return false;
  }
}

function revealNow() {
  const intro = document.getElementById("intro");
  if (intro) intro.classList.add("is-gone");
  window.Grid.reveal();
}

async function main() {
  let items = [];
  try {
    const res = await fetch("/api/media", { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    items = (data && data.items) || [];
  } catch (err) {
    console.error("Could not load the media manifest:", err);
    window.Grid.fail("Could not load media");
    return;
  }

  if (!window.Grid.start(items)) return;

  // Nothing past this point runs until the visitor has answered the gate. The
  // grid is already laid out behind it, so the wait is spent decoding posters
  // rather than idling. ?nointro= skips the ceremony entirely, for QA.
  if (!NO_INTRO) {
    try {
      const gateMod = await import("./gate.js");
      await gateMod.runGate();
    } catch (err) {
      // A gate that will not load must never be a locked door.
      console.error("Sound gate unavailable:", err);
      const el = document.getElementById("gate");
      if (el) el.classList.add("is-gone");
    }
  } else {
    const el = document.getElementById("gate");
    if (el) el.classList.add("is-gone");
  }

  const skippable =
    !NO_INTRO && !REDUCED && supportsWebGL() && items.some((i) => i.thumb);
  if (!skippable) {
    revealNow();
    return;
  }

  // The grid must be laid out before the opening runs — the opening's whole
  // job is to deliver its planes onto the grid's resting geometry — and it must
  // not drift while that happens.
  window.Grid.freeze();
  const layout = window.Grid.snapshot();

  let intro = null;
  let lockup = null;

  try {
    const [introMod, lockupMod] = await Promise.all([
      import("./intro.js"),
      import("./lockup.js")
    ]);
    // Both run on the opening's clock, started in the same frame, so the name
    // finishes assembling exactly as the tiles reach the grid.
    lockup = lockupMod.runLockup(introMod.DURATION);
    intro = introMod.runIntro(layout, () => window.Grid.reveal());
  } catch (err) {
    console.error("Intro unavailable, going straight to the grid:", err);
    revealNow();
    return;
  }

  if (new URLSearchParams(location.search).has("introAt")) return; // frozen for QA

  // Any deliberate input cuts the intro short rather than making people wait.
  const skip = () => {
    if (intro) intro.skip();
    if (lockup) lockup.finish();
    document.removeEventListener("pointerdown", skip);
    document.removeEventListener("keydown", skip);
    document.removeEventListener("wheel", skip);
  };

  // The gate has already consumed the click that let us in; these listeners go
  // on afterwards, so that same gesture cannot also cut the opening short.
  document.addEventListener("pointerdown", skip, { passive: true });
  document.addEventListener("keydown", skip);
  document.addEventListener("wheel", skip, { passive: true });
}

main();
