/* ---------------------------------------------------------------------------
   Boot: load the manifest, play the intro, hand off to the grid.

   Every failure path still ends with a usable grid — a browser without WebGL,
   a three.js module that will not load, or a user who would rather skip.
--------------------------------------------------------------------------- */

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
  try {
    const mod = await import("./intro.js");
    intro = mod.runIntro(layout, () => window.Grid.reveal());
  } catch (err) {
    console.error("Intro unavailable, going straight to the grid:", err);
    revealNow();
    return;
  }

  if (new URLSearchParams(location.search).has("introAt")) return; // frozen for QA

  // Any deliberate input cuts the intro short rather than making people wait.
  const skip = () => {
    if (intro) intro.skip();
    document.removeEventListener("pointerdown", skip);
    document.removeEventListener("keydown", skip);
    document.removeEventListener("wheel", skip);
  };
  document.addEventListener("pointerdown", skip, { passive: true });
  document.addEventListener("keydown", skip);
  document.addEventListener("wheel", skip, { passive: true });
}

main();
