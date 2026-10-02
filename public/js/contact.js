/* ---------------------------------------------------------------------------
   Contact.

   Three small machines, none of them decoration:

     · the reel — the films already in the library, played one after another
       behind the type, with the client named beside "Now Showing", so the page
       is a frame from the work rather than a backdrop;
     · the timecode — running from the moment the page opened, in the format a
       monitor on set prints;
     · the hour in New Delhi, because that is who the sender is writing to.

   The loop derivatives are what play here, never the masters: the sources run
   to hundreds of megabytes. A manifest that will not load leaves the film out
   and the page intact.
--------------------------------------------------------------------------- */

(function () {
  "use strict";

  var film = document.getElementById("ctFilm");
  var showing = document.getElementById("ctShowing");
  var timecode = document.getElementById("ctTimecode");
  var clock = document.getElementById("ctClock");
  var copy = document.getElementById("ctCopy");
  var said = document.getElementById("ctSaid");
  var mail = document.getElementById("ctMail");

  var calm =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* --- the reel ----------------------------------------------------------
     One clip at a time, in project order, each held for a turn and then faded
     into the next. The video element is reused, so only one clip is ever being
     decoded.
  --------------------------------------------------------------------------*/

  var TURN = 9000; // ms a clip holds before the next one is cut to
  var reel = [];
  var at = -1;
  var timer = 0;

  function cut(next) {
    if (!reel.length) return;
    at = next % reel.length;
    var shot = reel[at];

    showing.textContent = shot.client;

    film.classList.remove("is-on");
    window.setTimeout(function () {
      if (shot.poster) film.poster = shot.poster;
      film.src = shot.src;
      var started = film.play();
      if (started && started.catch) started.catch(function () {});
      film.classList.add("is-on");
    }, calm ? 0 : 520);
  }

  function roll() {
    cut(at + 1);
    if (reel.length < 2) return;
    timer = window.setTimeout(roll, TURN);
  }

  /* The page is still a page when it is not being looked at; a film playing to
     a hidden tab is only heat. */
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      window.clearTimeout(timer);
      film.pause();
    } else if (reel.length) {
      var started = film.play();
      if (started && started.catch) started.catch(function () {});
      timer = window.setTimeout(roll, TURN);
    }
  });

  fetch("data/projects.json", { headers: { Accept: "application/json" } })
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function (data) {
      (data && data.projects ? data.projects : []).forEach(function (project) {
        // One film per project, so the reel reads as a showreel rather than as
        // one client's rushes.
        var shot = project.items.find(function (i) {
          return i.type === "video" && (i.preview || i.src);
        });
        if (!shot) return;
        reel.push({
          src: shot.preview || shot.src,
          poster: shot.poster || null,
          client: project.name.replace(/^LAMA\s*×\s*/i, "")
        });
      });

      if (!reel.length) return;
      roll();
    })
    .catch(function (err) {
      // No reel is a quiet page, not a broken one.
      console.error("Could not load the reel:", err);
    });

  /* --- the timecode ------------------------------------------------------
     Hours, minutes, seconds and frames at 24, counted from arrival. Frames are
     what make it read as a camera rather than as a stopwatch.
  --------------------------------------------------------------------------*/

  var FPS = 24;
  var opened = Date.now();

  function pad(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function tick() {
    var ms = Date.now() - opened;
    var total = Math.floor(ms / 1000);
    timecode.textContent =
      pad(Math.floor(total / 3600)) + ":" +
      pad(Math.floor(total / 60) % 60) + ":" +
      pad(total % 60) + ":" +
      pad(Math.floor((ms % 1000) / (1000 / FPS)));
  }

  tick();
  window.setInterval(tick, calm ? 1000 : 1000 / FPS);

  /* --- the hour in New Delhi --------------------------------------------- */

  function setClock() {
    var now;
    try {
      now = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }).format(new Date());
    } catch (err) {
      // An engine without the time zone data says less rather than the wrong hour.
      clock.textContent = "New Delhi";
      return;
    }
    clock.textContent = "New Delhi " + now + " IST";
  }

  setClock();
  window.setInterval(setClock, 15000);

  /* --- the address -------------------------------------------------------
     The address is a link first; copying is the convenience next to it, and it
     says so when it worked.
  --------------------------------------------------------------------------*/

  var address = (mail.getAttribute("href") || "").replace(/^mailto:/, "");
  var clearing = 0;

  function say(words) {
    said.textContent = words;
    said.classList.add("is-on");
    window.clearTimeout(clearing);
    clearing = window.setTimeout(function () {
      said.classList.remove("is-on");
    }, 2600);
  }

  copy.addEventListener("click", function () {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(address).then(
        function () { say("Copied"); },
        function () { say(address); }
      );
      return;
    }
    // Without the clipboard API the address is simply shown, ready to be taken.
    say(address);
  });
})();
