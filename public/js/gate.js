/* ---------------------------------------------------------------------------
   The way in.

   Browsers refuse unmuted playback until the page has had a real user gesture,
   and they refuse silently. So the site asks before it begins: nothing loads
   past this point until the visitor answers, which means the opening is never
   spent playing mute behind a prompt nobody read.

   Either answer opens the door. The click that chooses sound is itself the
   gesture the browser was waiting for.
--------------------------------------------------------------------------- */

/**
 * Raise the gate and wait.
 *
 * Resolves with "sound" or "silent" once the visitor chooses, at which point
 * the veil is already fading and the caller can start the opening behind it.
 */
export function runGate() {
  var gate = document.getElementById("gate");
  var silent = document.getElementById("gateSilent");

  if (!gate) return Promise.resolve("sound");

  return new Promise(function (resolve) {
    var done = false;

    function choose(mode) {
      if (done) return;
      done = true;

      if (window.Audio2) window.Audio2.set(mode === "sound");

      gate.classList.add("is-gone");
      gate.setAttribute("aria-hidden", "true");
      gate.style.pointerEvents = "none";

      document.removeEventListener("keydown", onKey);
      gate.removeEventListener("click", onClick);

      // Resolve now rather than after the fade: the opening starts underneath
      // and the black lifts off a picture already in motion.
      resolve(mode);
    }

    function onClick() { choose("sound"); }

    function onKey(e) {
      if (e.key === "Tab") return; // the opt-out stays reachable by keyboard
      choose("sound");
    }

    silent.addEventListener("click", function (e) {
      e.stopPropagation();
      choose("silent");
    });

    gate.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
  });
}
