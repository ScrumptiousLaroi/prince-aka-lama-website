/* ---------------------------------------------------------------------------
   A project page.

   One article per project, built from /api/projects — the same library the
   index and the grid are built from, so a page can only ever show work that is
   actually in media/heroSection. Nothing is invented here: every frame, every
   film and every runtime comes from the manifest.

   The rhythm of the page is a pattern of slots (a full-bleed still, a pair, a
   note, a film, a small frame off one edge, a full-screen moment) that the
   project's own media is dealt into. A client with three films and nine stills
   therefore reads differently from one with two films and nothing else, without
   either page needing its own layout.

   Copy is the one thing the library cannot supply. STATEMENTS and NOTES below
   are written to be replaced; a blank entry simply drops its section.
--------------------------------------------------------------------------- */

(function () {
  "use strict";

  var root = document.getElementById("project");
  var curtain = document.getElementById("pjCurtain");

  /* --- copy --------------------------------------------------------------
     Per project, keyed by slug. Replace the bracketed text with the real
     words; an empty string removes the section from the page.
  --------------------------------------------------------------------------*/

  var STATEMENTS = {
    "mynuuk":
      "[PROJECT STATEMENT — two to four sentences on the campaign, the world it was shot in and the intent behind the camera language.]",
    "swatch-ap":
      "[PROJECT STATEMENT — the object, the macro language and the relationship between product and light.]",
    "gully-labs":
      "[PROJECT STATEMENT — the shoot, the city it was made in and how the stills were lit and cast.]",
    "moxie":
      "[PROJECT STATEMENT — the film brief, the movement language and how the sequences were paced.]"
  };

  var NOTES = {
    "mynuuk": [
      { label: "Note", text: "[SHORT PRODUCTION NOTE — one or two lines on a scene, a lighting decision or a moment on location.]" },
      { label: "Direction", text: "[NOTE ON THE CAMPAIGN DIRECTION — one or two lines.]" }
    ],
    "swatch-ap": [
      { label: "Object", text: "[NOTE ON THE OBJECT, ITS SURFACE AND THE LIGHT BUILT FOR IT.]" }
    ],
    "gully-labs": [
      { label: "Note", text: "[SHORT PRODUCTION NOTE — one or two lines on a frame or a decision on the day.]" },
      { label: "Materials", text: "[NOTE ON MATERIALS, SURFACE AND LIGHT.]" }
    ],
    "moxie": [
      { label: "Sequence", text: "[NOTE ON THE SEQUENCE — camera movement, rig, pacing.]" }
    ]
  };

  /* --- the pattern -------------------------------------------------------
     Read top to bottom and repeated until the media runs out. A slot whose
     material is gone is skipped, so the pattern never leaves a hole.
  --------------------------------------------------------------------------*/

  var PATTERN = [
    { kind: "image", size: "full", par: 26 },
    { kind: "pair" },
    { kind: "note" },
    { kind: "video", size: "wide" },
    { kind: "image", size: "small-left", par: 14 },
    { kind: "image", size: "screen", par: 30 },
    { kind: "pair" },
    { kind: "image", size: "wide", par: 20 },
    { kind: "note" },
    { kind: "video", size: "small-right" },
    { kind: "image", size: "small-right", par: 15 },
    { kind: "image", size: "full", par: 22 }
  ];

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
  function sizeFor(item, size, index) {
    if (!isPortrait(item)) return size;
    if (size === "full" || size === "screen") return "portrait-center";
    if (size === "wide") return index % 2 ? "small-right" : "small-left";
    return size;
  }

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
    fig.appendChild(el("figcaption", "pj__cap", caption));
    wrap.appendChild(fig);
    return wrap;
  }

  function pairSection(items, startN) {
    var wrap = section("pair");
    var row = el("div", "pj__pair");
    items.forEach(function (item, j) {
      var fig = el("figure", "pj__figure");
      // The wider of a pair is given the room it needs.
      fig.style.flex = (item.w > item.h ? "1.3 1 330px" : "1 1 270px");
      var box = frame(ratioOf(item), false);
      box.appendChild(plate(stillFor(item), 14 + j * 5));
      fig.appendChild(box);
      fig.appendChild(el("figcaption", "pj__cap", captionFor(item, "image", startN + j)));
      row.appendChild(fig);
    });
    wrap.appendChild(row);
    return wrap;
  }

  /**
   * A film. The loop derivative is what plays — the sources run to hundreds of
   * megabytes — and it starts muted, because a page that makes noise on arrival
   * is a page people close.
   */
  function videoSection(item, size, caption) {
    var wrap = section(size === "wide" && isPortrait(item) ? "portrait-center" : size);
    var fig = el("figure", "pj__figure");
    var box = frame(ratioOf(item), size === "screen");

    var video = el("video", "pj__video");
    video.src = item.preview || item.src;
    if (item.poster) video.poster = item.poster;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "metadata";
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

    sound.addEventListener("click", function () {
      video.muted = !video.muted;
      sound.textContent = video.muted ? "Sound Off" : "Sound On";
      if (!video.muted) video.play().catch(function () {});
    });

    // Films play while they are on screen and stop when they are not, so a long
    // page is not decoding six clips at once.
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(
        function (entries) {
          entries.forEach(function (e) {
            if (e.isIntersecting) video.play().catch(function () {});
            else video.pause();
          });
        },
        { threshold: 0.25 }
      ).observe(video);
    } else {
      video.autoplay = true;
    }

    fig.appendChild(box);
    fig.appendChild(el("figcaption", "pj__cap", caption));
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

    var out = [];
    var stillNo = 1;
    var filmNo = 1;
    var step = 0;

    while (videos.length || images.length) {
      var slot = PATTERN[step % PATTERN.length];
      var before = videos.length + images.length;
      step++;

      if (slot.kind === "video" && videos.length) {
        var film = videos.shift();
        out.push(videoSection(film, slot.size, captionFor(film, "video", filmNo++)));
      } else if (slot.kind === "pair" && images.length >= 2) {
        out.push(pairSection([images.shift(), images.shift()], stillNo));
        stillNo += 2;
      } else if (slot.kind === "image" && images.length) {
        var still = images.shift();
        out.push(
          imageSection(
            still,
            sizeFor(still, slot.size, out.length),
            slot.par,
            captionFor(still, "image", stillNo++)
          )
        );
      } else if (slot.kind === "note" && notes.length) {
        out.push(noteSection(notes.shift(), out.length % 2 ? "right" : "left"));
      }

      // A full pass of the pattern that moved nothing means what is left does
      // not fit any slot (a single leftover image against pair-only slots, say).
      if (before === videos.length + images.length && step % PATTERN.length === 0) {
        if (images.length) {
          var last = images.shift();
          out.push(
            imageSection(last, sizeFor(last, "wide", out.length), 20, captionFor(last, "image", stillNo++))
          );
        } else if (videos.length) {
          var lastFilm = videos.shift();
          out.push(videoSection(lastFilm, "wide", captionFor(lastFilm, "video", filmNo++)));
        }
      }
    }

    // Any note the pattern never reached still belongs on the page.
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

  fetch("/api/projects", { headers: { Accept: "application/json" } })
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
