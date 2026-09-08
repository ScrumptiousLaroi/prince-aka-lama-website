/* ---------------------------------------------------------------------------
   Sound for hover playback.

   Browsers refuse unmuted playback until the page has had a real user gesture,
   and they refuse silently — a rejected promise, no error. So this module
   tracks activation, always has a muted fallback ready, and tells the UI when
   sound is available but still waiting on a click.
--------------------------------------------------------------------------- */

window.Audio2 = (function () {
  "use strict";

  var STORAGE_KEY = "lama.sound";

  var enabled = true;      // the user's preference — on for every new visit
  var activated = false;   // has the browser seen a qualifying gesture yet
  var current = null;      // the one element allowed to be audible
  var listeners = [];

  // Sound is deliberately on by default on every load. Muting is a decision
  // about the moment — a shared room, a call — not a standing preference, so a
  // previous session's mute is not carried forward and the work always arrives
  // with its sound. The toggle still holds for the rest of the visit; the
  // stored value is kept only so a mute survives navigation within one visit.
  try {
    if (sessionStorage.getItem(STORAGE_KEY) === "0") enabled = false;
    localStorage.removeItem(STORAGE_KEY); // clear preferences saved before this
  } catch (e) {
    // Private mode or blocked storage — the default stands.
  }

  function emit() {
    for (var i = 0; i < listeners.length; i++) listeners[i](state());
  }

  function state() {
    return { enabled: enabled, activated: activated, pending: enabled && !activated };
  }

  /* --- volume ramps ----------------------------------------------------- */

  /**
   * Fade `el`'s volume from -> to over `ms`.
   *
   * The frame loop is only the nicety. A timer backstop always applies the
   * terminal value, so an interrupted or dropped ramp can never strand a video
   * at volume 0 — silent playback is the one failure worth engineering out.
   */
  function ramp(el, from, to, ms, done) {
    cancelRamp(el);

    var start = performance.now();
    var finished = false;

    function finish() {
      if (finished) return;
      finished = true;
      cancelRamp(el);
      try { el.volume = to; } catch (e) {}
      if (done) done();
    }

    el._rampEnd = finish;
    el._rampTimer = setTimeout(finish, ms + 60);

    el._rampFrame = requestAnimationFrame(function step(now) {
      if (finished) return;
      var t = Math.min(1, (now - start) / ms);
      try {
        el.volume = from + (to - from) * t;
      } catch (e) {
        finish();
        return;
      }
      if (t < 1) el._rampFrame = requestAnimationFrame(step);
      else finish();
    });
  }

  function cancelRamp(el) {
    if (el._rampFrame) { cancelAnimationFrame(el._rampFrame); el._rampFrame = 0; }
    if (el._rampTimer) { clearTimeout(el._rampTimer); el._rampTimer = 0; }
  }

  /* --- activation ------------------------------------------------------- */

  // A pointerdown that turns into a drag still counts as activation in every
  // engine that gates autoplay, so listening once at the document is enough.
  function activate() {
    if (activated) return;
    activated = true;
    emit();
    // If something is already hovered and playing muted, bring its sound up now.
    if (current && enabled && current.muted) {
      current.muted = false;
      ramp(current, 0, 1, 300);
    }
  }

  ["pointerdown", "click", "keydown", "touchend"].forEach(function (ev) {
    document.addEventListener(ev, activate, { passive: true });
  });

  /* --- public ----------------------------------------------------------- */

  return {
    state: state,

    onChange: function (fn) {
      listeners.push(fn);
      fn(state());
    },

    /**
     * Set the preference outright. The sound gate needs to say "on" or "off"
     * rather than "the other one" — a toggle would depend on what the state
     * happened to be when the visitor chose.
     */
    set: function (want) {
      want = !!want;
      if (enabled === want) {
        emit();
        return enabled;
      }
      return this.toggle();
    },

    toggle: function () {
      enabled = !enabled;
      try { sessionStorage.setItem(STORAGE_KEY, enabled ? "1" : "0"); } catch (e) {}
      if (current) {
        if (enabled && activated) {
          current.muted = false;
          ramp(current, 0, 1, 250);
        } else {
          current.muted = true;
        }
      }
      emit();
      return enabled;
    },

    /**
     * Start `el` as the one audible element. Falls back to muted playback if
     * the browser refuses sound, so the tile always shows motion either way.
     */
    claim: function (el) {
      if (current && current !== el) this.release(current);
      current = el;

      var wantSound = enabled && activated;
      el.muted = !wantSound;
      el.volume = wantSound ? 0 : 1;

      var p = el.play();
      if (p && p.catch) {
        p.catch(function () {
          // Refused with sound — retry muted so the tile still moves.
          el.muted = true;
          var retry = el.play();
          if (retry && retry.catch) retry.catch(function () {});
          activated = false;
          emit();
        });
      }

      if (wantSound) ramp(el, 0, 1, 350);
    },

    /**
     * Fade sound out, then hand the element back to the caller to tear down.
     * With no `done` handler the element is being displaced rather than
     * removed, so pause it — a silent video still burns a decoder.
     */
    release: function (el, done) {
      if (current === el) current = null;
      if (!el) { if (done) done(); return; }

      var after = done || function () { el.pause(); };

      if (el.muted || el.volume === 0) {
        after();
        return;
      }
      ramp(el, el.volume, 0, 220, after);
    }
  };
})();
