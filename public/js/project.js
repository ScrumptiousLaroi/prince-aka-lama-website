/* ---------------------------------------------------------------------------
   A project page.

   One article per project, built from data/projects.json — the same library the
   index and the grid are built from, so a page can only ever show work that is
   actually in media/heroSection. Nothing is invented here: every frame, every
   film and every runtime comes from the manifest.

   The rhythm of the page is a pattern of slots (a full-bleed still, a pair, a
   note, a film, a small frame off one edge, a full-screen moment) that the
   project's own media is dealt into. A client with three films and nine stills
   therefore reads differently from one with two films and nothing else, without
   either page needing its own layout.

   Copy is the one thing the library cannot supply. STATEMENTS and NOTES below
   hold it; a missing or blank entry simply drops its section.
--------------------------------------------------------------------------- */

(function () {
  "use strict";

  var root = document.getElementById("project");
  var curtain = document.getElementById("pjCurtain");

  /* --- copy --------------------------------------------------------------
     Per project, keyed by slug. An empty or missing entry removes the
     section from the page.
  --------------------------------------------------------------------------*/

  var STATEMENTS = {};

  var NOTES = {
    "mynuuk": [
      { label: "Production Note", text: "MyNuuk was a 2 Day Event Shoot, the brief was pretty clear, capture the vibe of the event and not just the brand to create a visual identity around it as fun and cool brand. So I didnt what it wanted, I capture the whole event as a person enjoying it, from the concerts to other people coming around, and incorporating MyNuuk init. I made people try Mynuuk’s Products and have fun with it while capturing it." }
    ],
    "swatch-ap": [
      { label: "Production Note", text: "Swatch x AP was a project which got done with a whiff. We were there for covering the launch event but it didnt happen because of how violent the crowd actually became. So we thought if the launch is simply not happening, let’s not limit ourselves there and we shot some really good product videos which got stitched to make complete sense in the post production. The other video makes the launch event clear covering delhi Mumbai and Bangalore stitched together for a beautiful limited edition pocket watch." }
    ],
    "dastoor": [
      { label: "Production Note", text: "Dastoor is a project close to my heart as it was my first time actually shooting a complete short film. It was indeed a first time experience and the whole team put every ounce of their blood, sweat and tears in it. The film was shot in a 5 day duration and everyday was a new challenge coming up from lighting an empty road with no power and permissions to get a genset, shooting in different weather conditions, getting a day wasted because of unfortunate rain etc. It’s a film done beautifully with the direction of Arjun Uday Verma who was there in every shot for the direction." }
    ],
    "raga": [
      { label: "Production Note", text: "Probably a shoot which was so fast, I didnt know how to pull it off in the first place. The shoot was planned in 2 days, means I had little to almost no time to get my pre production completed. When I started working on the project, I knew I will have to be quick about everything, hence put all my time into making everything in direction sorted, the recce, the styling, everything I could figure out in 2 days and we pulled it off." }
    ],
    "gully-labs": [
      { label: "Production Note", text: "Gully Labs was a very fun event, it was a private store launch of gully labs a day before the official opening. The event was very smooth with people coming in, getting shoes and the pieces lined up." }
    ]
  };

  /** Projects whose film is the headline: it follows the opening still and
      plays in full, with sound, rather than as the short hover loop. */
  var FILM_SECOND = { "saanjhco": true };

  /** Projects laid out a fixed number to a row, in place of the varied rows. */
  var PER_ROW = { "swatch-ap": 2 };

  /** Projects whose rows are set by hand: each row lists file names, and a row
      holding one portrait is centred. Anything unlisted follows in the usual way. */
  var ROWS = {
    "dastoor": [
      ["poster"],
      ["Dastoor/2.mp4"],
      ["bts video"],
      ["01.27.04", "01.27.06"]
    ],
    "saanjhco": [
      ["DSC00855", "DSC00892"],
      ["DSC01027", "DSC01085"]
    ],
    "raga": [
      ["Raga X Rawal", "Nakshe Pe"],
      ["DSC00561", "DSC00679", "DSC00700"],
      ["DSC00728"]
    ]
  };

  /* --- helpers ---------------------------------------------------------- */

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function slugFromUrl() {
    var q = new URLSearchParams(window.location.search).get("p");
    if (q) return q.trim().toLowerCase();
    return (window.location.hash || "").replace(/^#/, "").trim().toLowerCase();
  }

  /** The cheapest frame that stands in for an item. */
  function stillFor(item) {
    if (!item) return null;
    if (item.type === "image") return item.display || item.thumb || item.src;
    return item.poster || item.thumb || null;
  }

  /** A ratio the source actually is, so a frame crops rather than squashes. */
  function ratioOf(item) {
    var r = item.w && item.h ? item.w / item.h : 16 / 9;
    if (r >= 1.9) return "21/9";
    if (r >= 1.45) return "16/9";
    if (r >= 1.15) return "3/2";
    if (r >= 0.92) return "1/1";
    if (r >= 0.74) return "4/5";
    return "3/4";
  }

  function isPortrait(item) {
    return item.w && item.h ? item.h > item.w * 1.05 : false;
  }

  /**
   * A portrait source cannot hold a full-bleed or full-screen slot without
   * losing most of the frame, so it is given a smaller one instead.
   */
  function captionFor(item, kind, n) {
    var where = item.title && !/^_?DSC\s?\d+$/i.test(item.title) ? item.title : "";
    var lead = kind === "video" ? "Film" : item.type === "video" ? "Film" : "Still";
    var num = String(n).padStart(2, "0");
    return where ? lead + " " + num + " / " + where : lead + " " + num;
  }

  function mmss(seconds) {
    if (!isFinite(seconds) || seconds <= 0) return "";
    var s = Math.round(seconds);
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  /* --- plates ----------------------------------------------------------- */

  function plate(url, par) {
    var node = el("div", "pj__plate");
    if (url) node.style.backgroundImage = "url(" + JSON.stringify(url) + ")";
    if (par) node.dataset.par = String(par);
    return node;
  }

  function frame(ratio, screen) {
    var node = el("div", "pj__frame" + (screen ? " is-screen" : ""));
    if (!screen) node.style.aspectRatio = ratio;
    return node;
  }

  /* --- sections --------------------------------------------------------- */

  function section(size, extraClass) {
    var node = el("section", "pj__section is-" + size + (extraClass ? " " + extraClass : ""));
    node.dataset.reveal = "1";
    return node;
  }

  function imageSection(item, size, par, caption) {
    var wrap = section(size);
    var fig = el("figure", "pj__figure");
    var box = frame(ratioOf(item), size === "screen");
    box.appendChild(plate(stillFor(item), par));
    fig.appendChild(box);
    wrap.appendChild(fig);
    return wrap;
  }

  /**
   * A film. The loop derivative is what plays — the sources run to hundreds of
   * megabytes — and it starts muted, because a page that makes noise on arrival
   * is a page people close.
   */
  function videoSection(item, size, caption, full) {
    var wrap = section(size === "wide" && isPortrait(item) ? "portrait-center" : size);
    var fig = el("figure", "pj__figure");
    var box = frame(ratioOf(item), size === "screen");

    var video = el("video", "pj__video");
    video.src = full ? item.src : item.preview || item.src;
    if (item.poster) video.poster = item.poster;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = full ? "auto" : "metadata";
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    box.appendChild(video);
    box.appendChild(el("div", "pj__video-scrim"));

    var bar = el("div", "pj__video-bar");
    var runtime = el("span", "pj__runtime", "");
    var sound = el("button", "pj__sound", "Sound Off");
    sound.type = "button";
    bar.appendChild(runtime);
    bar.appendChild(sound);
    box.appendChild(bar);

    video.addEventListener("loadedmetadata", function () {
      runtime.textContent = mmss(video.duration);
    });

    // Sound follows the site-wide choice made at the gate (js/audio.js): on
    // unless the visitor muted it. Browsers may still refuse unmuted playback
    // until a gesture, so a refusal plays muted and the first click lifts it.
    var visible = false;
    var userMuted = false;

    function wantsSound() {
      var st = window.Audio2 ? window.Audio2.state() : { enabled: true };
      return st.enabled && !userMuted;
    }

    function paintSound() {
      sound.textContent = video.muted ? "Sound Off" : "Sound On";
    }

    function start() {
      video.muted = !wantsSound();
      var p = video.play();
      if (p && p.catch) {
        p.catch(function (err) {
          if (!visible || !err || err.name !== "NotAllowedError") return;
          video.muted = true;
          video.play().catch(function () {});
          paintSound();
        });
      }
      paintSound();
    }

    sound.addEventListener("click", function () {
      userMuted = !video.muted;
      video.muted = userMuted;
      if (!userMuted) video.play().catch(function () {});
      paintSound();
    });

    // Once the browser has seen a gesture, bring up the sound of whatever is playing.
    function onGesture() {
      if (visible && !video.paused && video.muted && wantsSound()) {
        video.muted = false;
        paintSound();
      }
    }
    ["pointerdown", "keydown", "touchend"].forEach(function (ev) {
      document.addEventListener(ev, onGesture, { passive: true });
    });

    // Films play while they are on screen and stop when they are not, so a long
    // page is not decoding six clips at once.
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(
        function (entries) {
          entries.forEach(function (e) {
            visible = e.isIntersecting;
            if (visible) start();
            else video.pause();
          });
        },
        { threshold: 0.25 }
      ).observe(video);
    } else {
      visible = true;
      video.autoplay = true;
    }

    fig.appendChild(box);
    wrap.appendChild(fig);
    return wrap;
  }

  function noteSection(note, align) {
    var wrap = section("note", align === "right" ? "is-right" : "");
    var body = el("div", "pj__note");
    body.appendChild(el("span", "pj__label", note.label));
    body.appendChild(el("p", null, note.text));
    wrap.appendChild(body);
    return wrap;
  }

  /* --- the build -------------------------------------------------------- */

  /* A row is items side by side at one shared height: each takes width in
     proportion to its own shape, so the row has no ragged edge and no black
     beside a frame that is shorter than its neighbour. */
  function rowSection(items, build) {
    var wrap = section("row");
    var row = el("div", "pj__row");
    items.forEach(function (item) {
      var fig = build(item).firstChild;
      var ratio = rowRatio(item);
      fig.style.flex = ratio + " 1 0";
      var box = fig.querySelector(".pj__frame");
      if (box) box.style.aspectRatio = String(ratio);
      row.appendChild(fig);
    });
    // One item on its own is centred at a sensible size, never left in a corner.
    if (items.length === 1) {
      row.style.maxWidth = rowRatio(items[0]) < 1.3 ? Math.round(rowRatio(items[0]) * 100) + "vh" : "72%";
      row.style.width = "100%";
      row.style.marginInline = "auto";
    }
    wrap.appendChild(row);
    return wrap;
  }

  function rowRatio(item) {
    var r = item.w && item.h ? item.w / item.h : 16 / 9;
    return Math.max(0.5, Math.min(2.4, r));
  }

  function buildSections(project, lead) {
    // The opening frame is spent; showing the same still again two screens later
    // reads as a mistake. A film is different: the hero only borrows its poster,
    // so the film itself still belongs in the page.
    var rest = project.items.filter(function (i) {
      return i !== lead || lead.type === "video";
    });
    if (!rest.length) rest = project.items.slice();

    var videos = rest.filter(function (i) { return i.type === "video"; });
    var images = rest.filter(function (i) { return i.type === "image"; });
    var notes = (NOTES[project.slug] || []).filter(function (n) { return n && n.text; });

    var headline = FILM_SECOND[project.slug] && videos.length ? videos.shift() : null;

    // Films spread evenly through the stills rather than bunched at one end.
    var seq = images.slice();
    var total = videos.length + images.length;
    videos.forEach(function (film, k) {
      seq.splice(Math.min(seq.length, Math.round(((k + 1) * total) / (videos.length + 1)) - 1), 0, film);
    });

    // Rows differ on purpose: each draws its own target for how much shape it
    // holds, so a row is tall (few items) or shallow (many), and some films or
    // landscapes take the whole width alone. The draw is seeded by the slug, so
    // a page reads the same on every visit. Nothing is ever left to sit alone
    // in a row unless it is wide enough to carry one.
    var narrow = window.innerWidth < 700;
    var seed = 0;
    for (var c = 0; c < project.slug.length; c++) seed = (seed * 31 + project.slug.charCodeAt(c)) >>> 0;
    function draw(n) {
      var h = Math.imul((seed ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0, 0x85ebca6b) >>> 0;
      h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    }

    var TARGETS = narrow ? [1.3, 1.6] : [1.9, 2.3, 2.8, 3.4];
    var MAX_ACROSS = narrow ? 2 : 4;
    var rows = [];

    // Hand-set rows first; whatever they do not name falls through below.
    if (ROWS[project.slug] && !narrow) {
      ROWS[project.slug].forEach(function (names) {
        var row = [];
        names.forEach(function (name) {
          var at = seq.findIndex(function (i) { return i.id.indexOf(name) !== -1; });
          if (at !== -1) row.push(seq.splice(at, 1)[0]);
        });
        if (row.length) rows.push(row);
      });
    }

    var cur = [];
    var sum = 0;
    var target = 0;
    var lastWide = false;

    function nextTarget() {
      target = TARGETS[Math.floor(draw(rows.length * 7 + 3) * TARGETS.length)];
    }
    nextTarget();

    if (PER_ROW[project.slug] && !narrow) {
      for (var q = 0; q < seq.length; q += PER_ROW[project.slug]) {
        rows.push(seq.slice(q, q + PER_ROW[project.slug]));
      }
      seq = [];
      // An odd one out joins the last row rather than standing alone.
      if (rows.length > 1 && rows[rows.length - 1].length === 1) {
        rows[rows.length - 2] = rows[rows.length - 2].concat(rows.pop());
      }
    }

    seq.forEach(function (item, idx) {
      // A landscape that can carry a row alone, now and then, and never twice running.
      if (!cur.length && !narrow && !lastWide && rowRatio(item) >= 1.4 && draw(idx + 101) < 0.14) {
        rows.push([item]);
        lastWide = true;
        nextTarget();
        return;
      }
      cur.push(item);
      sum += rowRatio(item);
      if (sum >= target && cur.length >= 2 || cur.length >= MAX_ACROSS) {
        rows.push(cur);
        lastWide = false;
        cur = [];
        sum = 0;
        nextTarget();
      }
    });
    if (cur.length) {
      // A lone leftover joins the row before it instead of standing by itself.
      if (cur.length === 1 && rows.length && rows[rows.length - 1].length < MAX_ACROSS + 1) {
        rows[rows.length - 1] = rows[rows.length - 1].concat(cur);
      } else {
        rows.push(cur);
      }
    }

    var stillNo = 1;
    var filmNo = 1;
    var buildItem = function (item) {
      return item.type === "video"
        ? videoSection(item, "wide", captionFor(item, "video", filmNo++))
        : imageSection(item, "wide", 14, captionFor(item, "image", stillNo++));
    };

    var out = [];
    var noteAt = [1, Math.max(3, Math.floor(rows.length / 2) + 1)];
    rows.forEach(function (row, i) {
      out.push(rowSection(row, buildItem));
      if (i === 0 && headline) {
        out.push(videoSection(headline, "screen", captionFor(headline, "video", filmNo++), true));
        headline = null;
      }
      if (notes.length && noteAt.indexOf(i + 1) !== -1) {
        out.push(noteSection(notes.shift(), out.length % 2 ? "right" : "left"));
      }
    });

    if (headline) out.push(videoSection(headline, "screen", captionFor(headline, "video", filmNo++), true));

    // Any note the rows never reached still belongs on the page.
    notes.forEach(function (note, i) {
      out.push(noteSection(note, i % 2 ? "right" : "left"));
    });

    return out;
  }

  /** The frame the page opens on: a landscape still if the project has one. */
  function leadOf(project) {
    return (
      project.items.find(function (i) { return i.type === "image" && !isPortrait(i); }) ||
      project.items.find(function (i) { return i.type === "image"; }) ||
      project.items[0]
    );
  }

  function hero(project, lead) {
    var head = el("header", "pj__hero");
    head.appendChild(plate(stillFor(lead), 22));
    head.appendChild(el("div", "pj__hero-scrim"));

    var foot = el("div", "pj__hero-foot");
    var block = el("div", "pj__title-block");
    block.appendChild(el("span", "pj__num", project.num));
    block.appendChild(el("h1", "pj__title", project.name));
    block.appendChild(el("span", "pj__category", project.category));
    foot.appendChild(block);
    foot.appendChild(el("span", "pj__scroll", "Scroll"));
    head.appendChild(foot);
    return head;
  }

  function statementSection(project) {
    var text = STATEMENTS[project.slug];
    if (!text) return null;
    var wrap = el("section", "pj__statement");
    wrap.dataset.reveal = "1";
    wrap.appendChild(el("span", "pj__label", "The Project"));
    wrap.appendChild(el("p", null, text));
    return wrap;
  }

  function nextBlock(next) {
    var link = el("a", "pj__next");
    link.href = "project.html?p=" + encodeURIComponent(next.slug);
    link.appendChild(plate(stillFor(leadOf(next)), 34));
    link.appendChild(el("div", "pj__next-scrim"));
    link.appendChild(el("span", "pj__next-trailer", next.category));

    var body = el("div", "pj__next-body");
    body.appendChild(el("span", "pj__next-line", "Next Project"));
    body.appendChild(el("span", "pj__next-num", next.num));
    body.appendChild(el("span", "pj__next-name", next.name));
    link.appendChild(body);

    link.addEventListener("click", function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      cross(link.href);
    });
    return link;
  }

  function footer() {
    var foot = el("footer", "pj__foot");
    var index = el("a", null, "Index");
    index.href = "work.html";
    foot.appendChild(index);
    foot.appendChild(el("span", null, "Prince aka Lama"));
    return foot;
  }

  /** The curtain, so leaving a project is a cut rather than a flash of white. */
  function cross(href) {
    if (!curtain) {
      window.location.href = href;
      return;
    }
    curtain.classList.add("is-on");
    setTimeout(function () { window.location.href = href; }, 460);
  }

  /* --- motion ----------------------------------------------------------- */

  function bindReveal() {
    var sections = root.querySelectorAll("[data-reveal]");
    if (!("IntersectionObserver" in window)) return;

    sections.forEach(function (node) { node.classList.add("is-hidden"); });

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          e.target.classList.remove("is-hidden");
          io.unobserve(e.target);
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -8% 0px" }
    );
    sections.forEach(function (node) { io.observe(node); });
  }

  /** Plates drift against the scroll; written straight to style, once a frame. */
  function bindParallax() {
    var plates = [].slice.call(root.querySelectorAll("[data-par]"));
    if (!plates.length) return;
    var queued = false;

    function run() {
      queued = false;
      var vh = window.innerHeight;
      plates.forEach(function (node) {
        var amt = parseFloat(node.dataset.par) || 0;
        var r = node.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) return;
        var p = (r.top + r.height / 2 - vh / 2) / vh;
        node.style.transform = "translate3d(0," + (-p * amt).toFixed(2) + "px,0)";
      });
    }

    function onScroll() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(run);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    run();
  }

  /* --- render ----------------------------------------------------------- */

  function render(project, next) {
    document.title = project.name.replace(/\s*×\s*/g, " × ") + " — Prince aka Lama";

    var lead = leadOf(project);
    root.appendChild(hero(project, lead));
    var statement = statementSection(project);
    if (statement) root.appendChild(statement);
    buildSections(project, lead).forEach(function (node) { root.appendChild(node); });
    if (next) root.appendChild(nextBlock(next));
    root.appendChild(footer());
    root.removeAttribute("aria-busy");

    bindReveal();
    bindParallax();
  }

  function missing(message) {
    root.removeAttribute("aria-busy");
    var box = el("div", "pj__missing");
    box.appendChild(el("span", "pj__label", message));
    var back = el("a", "pj__label", "← Work");
    back.href = "work.html";
    box.appendChild(back);
    root.appendChild(box);
  }

  /* --- load ------------------------------------------------------------- */

  fetch("data/projects.json", { headers: { Accept: "application/json" } })
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function (data) {
      var list = (data && data.projects) || [];
      var wanted = slugFromUrl();
      var i = list.findIndex(function (p) { return p.slug === wanted; });
      if (i < 0) i = 0;
      var project = list[i];
      if (!project || !project.items.length) {
        missing("This project has no media yet");
        return;
      }
      render(project, list.length > 1 ? list[(i + 1) % list.length] : null);
    })
    .catch(function (err) {
      console.error("Could not load the project:", err);
      missing("Project unavailable");
    });
})();
