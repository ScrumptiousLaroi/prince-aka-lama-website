/* ---------------------------------------------------------------------------
   Work — the index.

   One list of clients, built from the same manifest the grid is built from, so
   the page can never name a project that is not in the library. Hovering a name
   brings its still up on the left; nothing else on the page moves.

   The stills are the derivatives the grid already uses (web copies, posters),
   never the 500 MB sources.
--------------------------------------------------------------------------- */

(function () {
  "use strict";

  var frame = document.getElementById("workFrame");
  var list = document.getElementById("workList");
  var field = document.getElementById("workField");
  var root = document.getElementById("work");
  var meta = document.getElementById("workMeta");
  var metaLine = document.getElementById("workMetaLine");
  var metaSub = document.getElementById("workMetaSub");
  var ring = document.getElementById("workRing");
  var count = document.getElementById("workCount");
  var span = document.getElementById("workSpan");

  var active = -1;   // the project under the pointer, or -1
  var shown = -1;    // the project whose still is up on the left
  var projects = [];

  /** "GULLY LABS" is how the folder is spelled; the page should not shout. */
  function label(name) {
    return String(name)
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function pad(n) {
    return (n < 10 ? "0" : "") + n;
  }

  /* --- data --------------------------------------------------------------
     The index lists four clients in a fixed order; the manifest supplies their
     counts and stills, so the page still cannot name work that is not there.
  --------------------------------------------------------------------------*/

  /** The index names these clients, in this order; anything else stays out.
      The slug is what project.html opens — it matches lib/projects.js. */
  var KEEP = [
    { company: "MYNUUK", slug: "mynuuk" },
    { company: "SWATCH X AP", slug: "swatch-ap" },
    { company: "GULLY LABS", slug: "gully-labs" },
    { company: "MOXIE", slug: "moxie" }
  ];

  var SLUGS = Object.create(null);
  KEEP.forEach(function (k) { SLUGS[k.company] = k.slug; });

  function key(name) {
    return String(name).toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  }

  function group(items) {
    var byName = Object.create(null);

    items.forEach(function (item) {
      var name = item.company;
      if (!name) return;
      if (!SLUGS[key(name)]) return;
      if (!byName[key(name)]) {
        byName[key(name)] = {
          name: label(name),
          slug: SLUGS[key(name)],
          films: 0,
          stills: 0,
          still: null
        };
      }
      var p = byName[key(name)];
      if (item.type === "video") p.films++;
      else p.stills++;
      if (!p.still) p.still = stillFor(item);
    });

    return KEEP.map(function (k) { return byName[k.company]; })
      .filter(function (p) { return !!p; });
  }

  /** The cheapest frame that represents an item, or null when none was made. */
  function stillFor(item) {
    if (item.type === "image") return item.display || item.thumb || item.src;
    return item.poster || item.thumb || null;
  }

  function disciplineOf(p) {
    if (p.films && p.stills) return "Film / Photography";
    if (p.films) return "Film";
    return "Photography";
  }

  function tally(p) {
    var parts = [];
    if (p.films) parts.push(p.films + (p.films === 1 ? " Film" : " Films"));
    if (p.stills) parts.push(p.stills + (p.stills === 1 ? " Still" : " Stills"));
    return parts.join(" — ");
  }

  /* --- build ------------------------------------------------------------ */

  function build(list_) {
    projects = list_;

    projects.forEach(function (p, i) {
      var num = pad(i + 1);

      // Left: the still, stacked with the others and held at zero opacity.
      var fig = document.createElement("figure");
      fig.className = "work__still";

      var fill = document.createElement("div");
      fill.className = "work__still-fill";

      var big = document.createElement("span");
      big.className = "work__still-num";
      big.textContent = num;
      fill.appendChild(big);

      if (p.still) {
        var img = document.createElement("img");
        img.className = "work__still-img";
        img.loading = "lazy";
        img.decoding = "async";
        img.alt = p.name;
        img.addEventListener("load", function () {
          img.classList.add("is-loaded");
          fig.classList.add("has-image");
        });
        img.src = p.still;
        fill.appendChild(img);
      }

      var slot = document.createElement("span");
      slot.className = "work__still-slot";
      slot.textContent = p.still
        ? p.name.toUpperCase()
        : "Project Image — " + p.name.toUpperCase();
      fill.appendChild(slot);

      fig.appendChild(fill);
      frame.appendChild(fig);
      p.figure = fig;

      // Right: the name.
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.className = "work__link";
      a.href = "project.html?p=" + encodeURIComponent(p.slug);

      var n = document.createElement("span");
      n.className = "work__num";
      n.textContent = num;

      var name = document.createElement("span");
      name.className = "work__name";
      name.textContent = "LAMA × " + p.name;

      a.appendChild(n);
      a.appendChild(name);
      a.addEventListener("mouseenter", function () { focus(i); });
      a.addEventListener("focus", function () { focus(i); });
      li.appendChild(a);
      list.appendChild(li);
      p.link = a;
    });

    rest();
    count.textContent = projects.length + (projects.length === 1 ? " Project" : " Projects");
    span.textContent = "Archive — Selected Clients";
  }

  /* --- state ------------------------------------------------------------
     One project is always on the left, so the page is never half empty. At
     rest it is the first; hovering a name swaps it and dims the rest of the
     list around the name under the pointer.
  --------------------------------------------------------------------------*/

  function show(i) {
    if (i === shown) return;
    if (shown > -1) projects[shown].figure.classList.remove("is-on");
    shown = i;
    var p = projects[i];
    p.figure.classList.add("is-on");
    metaLine.textContent = disciplineOf(p);
    metaSub.textContent = tally(p);
    meta.classList.add("is-on");
  }

  function focus(i) {
    if (i === active) return;
    if (active > -1) projects[active].link.classList.remove("is-active");
    active = i;
    projects[i].link.classList.add("is-active");
    root.classList.add("is-hovering");
    show(i);
  }

  function rest() {
    if (active > -1) projects[active].link.classList.remove("is-active");
    active = -1;
    root.classList.remove("is-hovering");
    show(0);
  }

  /* --- the ring ----------------------------------------------------------
     A ring stands in for the pointer inside the list, and grows when it is over
     a name. Written straight to style so it tracks the pointer without waiting
     on a render.
  --------------------------------------------------------------------------*/

  function move(e) {
    if (!ring) return;
    ring.style.opacity = "1";
    ring.style.transform =
      "translate3d(" + e.clientX + "px," + e.clientY + "px,0) scale(" +
      (active > -1 ? 1 : 0.55) + ")";
    ring.style.borderColor =
      active > -1 ? "rgba(242,239,233,0.75)" : "rgba(242,239,233,0.32)";
  }

  function leave() {
    if (ring) ring.style.opacity = "0";
    rest();
  }

  field.addEventListener("mousemove", move);
  field.addEventListener("mouseleave", leave);
  field.addEventListener("blur", leave, true);

  /* --- load --------------------------------------------------------------
     A manifest that will not load leaves the page empty rather than inventing
     clients, and says so where the count goes.
  --------------------------------------------------------------------------*/

  fetch("/api/media", { headers: { Accept: "application/json" } })
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function (data) {
      var grouped = group((data && data.items) || []);
      if (!grouped.length) throw new Error("no media");
      build(grouped);
    })
    .catch(function (err) {
      console.error("Could not load the media manifest:", err);
      count.textContent = "Index unavailable";
    });
})();
