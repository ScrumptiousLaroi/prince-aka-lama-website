/* ---------------------------------------------------------------------------
   About — one scroll, eight chapters.

   The page is a single fixed stage. Every chapter is a layer on it, every
   moving part of a layer carries a role (`data-m`), and each role has a list of
   tweens in js/about-motion.js: which property, from where to where, between
   which two points of the scroll, on which ease. This file builds the stage
   from COPY, then on every frame turns the scroll position into those values.

   The scroll is measured in timeline units: 900 per screen of scrolling,
   whatever the window's real height, so the story always takes the same
   number of screens. The page scrolls natively — scrollbar, keys, trackpad all
   work — and the stage follows a smoothed copy of that position, which is what
   gives the motion its weight.

   Phones, small windows and reduced motion get the same words as a plain
   column (.ab-read) instead, and so does every screen reader.
--------------------------------------------------------------------------- */

(function () {
  "use strict";

  /* --- copy --------------------------------------------------------------
     The order of the words matters as well as the words: each line, word and
     letter takes the motion of the matching part of the timeline. Lines are
     broken by hand because the breaks are part of the design.
  --------------------------------------------------------------------------*/

  var COPY = {
    opening: {
      line1: [["Prince", "big"], ["is a", "after"]],
      line2: [["Cinematographer", "big"], ["and", "small"], ["Creative Director", "big"]],
      wellAs: "As well as",
      line3: [["DP", "big"], ["and", "small"], ["Editor", "big"]],
      line4: [["and", "small"], ["Event Director", "big"]]
    },

    // A staircase: each word a step down, the last word in pieces.
    firstCamera: {
      words: ["Prince", "picked up", "his first", "camera", "at"],
      last: "16"
    },

    // The first line flies in letter by letter; the last line breaks apart
    // into the chapter title.
    growingUp: {
      first: "Growing up in",
      lines: ["New Delhi, he was", "hooked on films", "and music videos."],
      lines2: ["And by 2020", "he was already", "out shooting,"],
      last: "behind the lens"
    },

    // Drifts across the screen word by word, then settles as a paragraph.
    years: {
      sentence: "Years of parties, sneaker drops and street shoots taught him to catch the moment before it’s gone.",
      first: "Years of parties,",
      lines: ["sneaker drops and", "street shoots taught", "him to catch the", "moment before", "it’s gone."],
      lines2: ["With no film", "school and no", "crew, he", "set out with"],
      last: "nothing but a"
    },

    cameraCity: {
      top: "Camera",
      and: "and",
      a: "a",
      bottom: "City",
      caption: "Based in New Delhi — a city that never sits still, and neither does his camera."
    },

    clients: {
      intro: ["From the street", "to the showroom,", "he has shot for", "brands like"],
      list: ["Mynuuk", "Snkrhood", "Swatch", "Audemars Piguet", "Gully Labs", "Moxie", "Renault", "Urban Company", "Dr Pepper"],
      after: ["Today", "Prince spends", "his days", "directing,", "shooting and", "cutting for", "brands", "and"],
      afterLast: "campaigns"
    },

    campaigns: {
      lines: ["Directing", "shooting and", "cutting", "for", "Brands", "and", "Campaigns"],
      second: [["From the first idea", "to the final cut,", "on set and in the edit"], ["Event films, creative", "direction, cinematography", "and editing."]]
    },

    journey: {
      words: ["All", "of", "which", "has", "become", "the", "ground", "for", "an", "ongoing"],
      last: "journey in film"
    },

    work: { left: "Film + Stills", right: "Brands + Events" },

    follow: {
      lead: "For",
      title: ["More", "frames"],
      follow: ["Follow", "Prince"],
      on: "On",
      links: [
        { label: "Instagram", href: "https://www.instagram.com/prince.aka.lama/" },
        { label: "LinkedIn", href: "https://www.linkedin.com/in/prince-a-3b0899265/" }
      ],
      or: "or",
      email: "princegmrllama@gmail.com"
    },

    rail: ["", "Behind the lens", "A camera and a city", "Brands + campaigns", "Journey in film"]
  };

  /* --- media -------------------------------------------------------------
     By library id, so the page always shows what the manifest serves (the CDN
     copy where there is one). Anything missing simply leaves its frame empty.
  --------------------------------------------------------------------------*/

  var MEDIA = {
    heroFull: "URBAN COMPANy/UC_Vid4_S1.mp4",
    heroHalf: "GULLY LABS/Video_/C0089_2_3.mp4",
    growBig: "MYNUUK/PHOTOS/DSC00421.jpg",
    growSmall: "MYNUUK/PHOTOS/DSC01689.jpg",
    city: "MYNUUK/PHOTOS/DSC00314.jpg",
    cityCaption: "Mynuuk × Snkrhood — New Delhi",
    slides: [
      { id: "MYNUUK/PHOTOS/DSC00620.jpg", label: "Mynuuk", company: "MYNUUK" },
      { id: "MYNUUK/VIDEOS/The coolest moments from Snkrhood. [NUUK x Snkrhood].mp4", label: "NUUK × Snkrhood", company: "MYNUUK" },
      { id: "SWATCH X AP/Photos/_DSC3751.jpg", label: "Swatch × AP", company: "SWATCH X AP" },
      { id: "GULLY LABS/Photos/_DSC1949.jpg", label: "Gully Labs", company: "GULLY LABS" },
      { id: "MOXIE/Moxie 28 June_final.mp4", label: "Moxie", company: "MOXIE" },
      { id: "RENAULT/_DSC0712.jpg", label: "Renault", company: "" },
      { id: "URBAN COMPANy/UC_Vid4_S1.mp4", label: "Urban Company", company: "" }
    ],
    // Films whose opening seconds are clean picture; the loops are cut from
    // the first eight seconds, and some films open on a caption card.
    ring: [
      "GULLY LABS/Video_/C0089_2_3.mp4",
      "SWATCH X AP/track 5_8.mp4",
      "URBAN COMPANy/UC_Vid4_S1.mp4",
      "MYNUUK/VIDEOS/The coolest moments from Snkrhood. [NUUK x Snkrhood].mp4",
      "SWATCH X AP/C0089_2.mp4",
      "MYNUUK/VIDEOS/Not all heroes wear capes. Some give breeze for free.[NUUK x Snkrhood, NUUK BFF Personal Hand Fa.mp4"
    ],
    // Kept off the contact sheet: their stills are caption cards, not pictures.
    sheetSkip: ["MYNUUK/Drpepper.mp4", "MOXIE/IMG_1192.mp4"],
    workCentre: "GULLY LABS/Photos/_DSC1863.jpg"
  };

  /* --- roles -------------------------------------------------------------
     Role ids index js/about-motion.js. Where COPY has a different number of
     words or letters than a group has roles, parts are spread evenly across
     the group, so a shorter word still fans out across the whole gesture.
  --------------------------------------------------------------------------*/

  function range(a, b, step) {
    var out = [];
    for (var i = a; i <= b; i += step || 1) out.push(i);
    return out;
  }

  var R = {
    heroLayer: 41, heroFull: 46, text1: 51, text2: 61,
    camMask: 74, camWords: range(75, 79), camHollow: 81, camFill: range(90, 97),
    growBig: 101, growSmall: 106,
    growFirstLine: 112, growFirstInner: 113, growFirstLetters: range(115, 139, 2),
    growLines: [155, 157, 159, 161, 163, 165, 167], growSpans: [156, 158, 160, 162, 164, 166],
    growLast: range(170, 185), growGhost: 186,
    swirlBright: range(195, 233, 2), swirlDim: range(234, 252),
    paraFirstLine: 256, paraFirstLetters: range(259, 293, 2),
    paraLines: [314, 316, 318, 320, 322, 324, 326, 328, 330, 332], paraRoll: range(335, 347),
    cityBg: 350, cityTitle: 355, cityTop: range(358, 363), cityAnd: 371, cityA: 375, cityBottom: range(378, 385), cityCap: 395,
    coCam: 479, coWrap: 480, coIntro: range(481, 484), coList: range(486, 537),
    coAfterBox: 538, coAfter: range(539, 546), coAfterLast: 547, coAfterFill: range(556, 562), coSlider: 564,
    ringWrap: 604, ringText1: 630, ringSpans: range(631, 637), ringText2: 639,
    jMask: 647, jWords: range(648, 658), jHollow: 660, jFill: range(676, 690),
    workImg: 810, workH: 816, workLeftDim: 819, workLeft: range(821, 829), workRightDim: 831, workRight: range(833, 846),
    grid: 692,
    soFor: 852, soForLetters: [855, 856, 857], soTitle: 858, soFollow: 860, soOn: 863, soLinks: [865, 867, 869]
  };

  function spread(refs, n) {
    if (n === refs.length) return refs.slice();
    var out = [];
    for (var i = 0; i < n; i++) {
      out.push(refs[n === 1 ? 0 : Math.round((i * (refs.length - 1)) / (n - 1))]);
    }
    return out;
  }

  // Ring tiles and contact-sheet positions, as laid out on the timeline.
  var RING_TILES = [
    [-7.810889, 75, -60], [52.810889, 75, -120], [83.121778, 22.5, -180],
    [52.810889, -30, -240], [-7.810889, -30, -300], [-38.121778, 22.5, -360]
  ];

  // left (vw), top (vh), width (vw), height/width, lean direction
  var GRID = [
    [59.31, 32.67, 10.4, 0.707, -1], [31.81, 32.67, 9.2, 0.568, 1], [45.49, 44, 8.8, 0.661, -1],
    [52.08, 60.56, 10.1, 0.745, -1], [44.03, 16.78, 12.3, 0.661, -1], [10.97, 10, 10, 0.639, 1],
    [70.07, 69.89, 15, 0.667, -1], [83.47, 31.56, 16.7, 0.679, -1], [94.03, 12.56, 3.6, 1.269, -1],
    [7.99, 32, 16.5, 0.752, 1], [4.17, 70.67, 10.41, 0.56, 1], [4.58, 5, 6.6, 0.568, 1],
    [28.82, 2, 6.7, 0.813, 1], [55, 9.56, 8.8, 0.669, -1], [81.81, 1, 12, 0.746, -1],
    [68.47, 25, 9, 0.562, -1], [74.03, 47, 4.3, 1.468, -1], [1.39, 53.33, 8.1, 0.632, 1],
    [30.07, 56.56, 11.4, 0.689, 1], [84.38, 67.44, 7, 0.574, -1], [23.47, 68.56, 8.2, 0.559, 1],
    [17.57, 87.78, 12.4, 0.542, 1], [87.78, 88.56, 11, 0.475, -1]
  ];

  // Where the chapter rail steps, in timeline units.
  var RAIL_STEPS = [1350, 7450, 10800, 14200];

  // Ranges in which each set of films should be playing.
  var PLAY = { hero: [0, 1600], ring: [10750, 13150] };

  /* --- dom helpers ------------------------------------------------------- */

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function add(parent) {
    for (var i = 1; i < arguments.length; i++) {
      if (arguments[i]) parent.appendChild(arguments[i]);
    }
    return parent;
  }

  function role(node, ref) {
    if (ref != null) node.setAttribute("data-m", ref);
    return node;
  }

  /** One span per character, spaces kept as fixed-width spans. */
  function letters(text, cls, refs) {
    var chars = Array.from(text);
    var map = refs ? spread(refs, chars.length) : null;
    return chars.map(function (c, i) {
      var s = el("span", (c === " " ? "ab-sp" : "ab-ch") + (cls ? " " + cls : ""), c === " " ? " " : c);
      if (map) role(s, map[i]);
      return s;
    });
  }

  function addAll(parent, nodes) {
    nodes.forEach(function (n) { parent.appendChild(n); });
    return parent;
  }

  /* --- media lookup ------------------------------------------------------ */

  var library = new Map();
  var projects = new Map();

  function media(id) { return library.get(id) || null; }

  /** A still for `id`: the display copy of a photograph, the poster of a film. */
  function still(id, full) {
    var m = media(id);
    if (!m) return "";
    if (m.type === "image") return (full ? m.src : m.display) || m.src || "";
    return m.poster || m.thumb || "";
  }

  function img(src, alt) {
    var i = el("img");
    i.alt = alt || "";
    i.decoding = "async";
    i.loading = "lazy";
    if (src) i.src = src;
    return i;
  }

  function film(id) {
    var m = media(id);
    var v = el("video");
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = "none";
    v.setAttribute("muted", "");
    v.setAttribute("playsinline", "");
    if (m) {
      v.dataset.src = m.preview || m.src;
      if (m.poster) v.poster = m.poster;
    }
    return v;
  }

  /* --- build: the stage -------------------------------------------------- */

  var stage = document.getElementById("abStage");
  var rail = document.getElementById("abRail");
  var read = document.getElementById("abRead");

  var staircases = []; // [{ words: [nodes], fill: node, stepEm }]
  var films = { hero: [], ring: [] };
  var leaners = [];    // momentum images: [{ node, dir, rot }]
  var slider = null;

  function phrase(parts) {
    var line = el("span", "ab-t__line");
    parts.forEach(function (p) {
      var cls = p[1] === "big" ? "ab-big" : p[1] === "after" ? "ab-small ab-small--after" : "ab-small";
      line.appendChild(el("span", cls, p[0]));
    });
    return line;
  }

  function buildOpening() {
    var c = COPY.opening;

    var hero = role(el("div", "ab-fixed ab-hero"), R.heroLayer);
    var half = add(el("div", "ab-hero__half"), film(MEDIA.heroHalf));
    var full = role(el("div", "ab-hero__full"), R.heroFull);
    add(full, add(el("div", "ab-hero__inner"), film(MEDIA.heroFull)));
    add(hero, half, full);
    films.hero = Array.from(hero.querySelectorAll("video"));

    var t1 = role(el("div", "ab-center ab-full"), R.text1);
    var h1 = add(el("h1", "ab-t__h"), phrase(c.line1), phrase(c.line2));
    t1.appendChild(h1);

    var t2 = role(el("div", "ab-center ab-full"), R.text2);
    var wl = add(el("span", "ab-t__line"), el("span", "ab-wellas", c.wellAs));
    t2.appendChild(add(el("h2", "ab-t__h"), wl, phrase(c.line3), phrase(c.line4)));

    add(stage, hero, t1, t2);
  }

  /**
   * A staircase of words with a broken last word. `small` picks the second,
   * finer setting; `stepEm` is how far each word drops below the last.
   */
  function staircase(words, last, refs, small, stepEm, lean) {
    var wrap = el("div", "ab-center");
    var h = role(el("h3", "ab-magic" + (small ? " ab-magic--small" : "")), refs.mask);
    var map = spread(refs.words, words.length);
    var nodes = words.map(function (w, i) {
      var s = role(el("span", "ab-magic__w", w), map[i]);
      s.style.marginTop = i * stepEm + "em";
      return s;
    });
    addAll(h, nodes);

    var fill = el("span", "ab-fillword");
    fill.style.marginTop = words.length * stepEm + "em";
    var hollow = role(el("div", "ab-hollow"), refs.hollow);
    addAll(hollow, letters(last));
    fill.appendChild(hollow);
    addAll(fill, letters(last, "ab-fl", refs.fill));
    h.appendChild(fill);

    wrap.appendChild(h);
    staircases.push({ words: nodes, fill: fill, lean: lean });
    return wrap;
  }

  function buildFirstCamera() {
    var c = COPY.firstCamera;
    stage.appendChild(staircase(c.words, c.last, { mask: R.camMask, words: R.camWords, hollow: R.camHollow, fill: R.camFill }, false, 1, 0.3));
  }

  function buildGrowingUp() {
    var c = COPY.growingUp;
    var wrap = el("div", "ab-center");
    var m2 = el("div", "ab-m2");

    var pics = el("div", "ab-m2__pics");
    var big = role(add(el("div", "ab-m2__big"), img(still(MEDIA.growBig))), R.growBig);
    var small = role(add(el("div", "ab-m2__small"), img(still(MEDIA.growSmall))), R.growSmall);
    // Siblings, not nested: each carries the same motion, and nesting would
    // apply it twice to the small one.
    add(pics, big, small);

    var col = el("div", "ab-m2__col");

    var first = role(el("div", "ab-m2__line"), R.growFirstLine);
    var inner = role(el("span", "ab-m2__rel"), R.growFirstInner);
    addAll(inner, letters(c.first, null, R.growFirstLetters));
    var ghost = el("span", "ab-m2__ghost");
    addAll(ghost, letters(c.first));
    inner.appendChild(ghost);
    first.appendChild(inner);
    col.appendChild(first);

    var middle = c.lines.concat(c.lines2);
    middle.forEach(function (text, i) {
      var line = role(el("div", "ab-m2__line" + (i === c.lines.length - 1 ? " ab-m2__line--gap" : "")), R.growLines[i]);
      line.appendChild(role(el("span", "ab-m2__span", text), R.growSpans[i]));
      col.appendChild(line);
    });

    var last = role(el("div", "ab-m2__line"), R.growLines[6]);
    var rel = el("span", "ab-m2__rel");
    var lettersWrap = el("span");
    addAll(lettersWrap, lastLetters(c.last, R.growLast));
    rel.appendChild(lettersWrap);
    var lastGhost = role(el("span", "ab-m2__ghost"), R.growGhost);
    lastGhost.textContent = c.last;
    rel.appendChild(lastGhost);
    last.appendChild(rel);
    col.appendChild(last);

    add(m2, pics, col);
    wrap.appendChild(m2);
    stage.appendChild(wrap);
  }

  /**
   * The last line of chapter three turns into its title. Spaces take the
   * spaces' motion and letters take the letters', so the gaps between words
   * survive the flight.
   */
  function lastLetters(text, refs) {
    var spaces = refs.filter(function (r) { return r === 177 || r === 180; });
    var glyphs = refs.filter(function (r) { return r !== 177 && r !== 180; });
    var chars = Array.from(text);
    var nGlyph = chars.filter(function (ch) { return ch !== " "; }).length;
    var gMap = spread(glyphs, nGlyph);
    var gi = 0;
    var si = 0;
    return chars.map(function (ch) {
      if (ch === " ") {
        var sp = el("span", "ab-sp", " ");
        return role(sp, spaces[Math.min(si++, spaces.length - 1)]);
      }
      return role(el("span", "ab-ch", ch), gMap[gi++]);
    });
  }

  function buildYears() {
    var c = COPY.years;

    // The drifting sentence: a bright copy and a faint one, word by word.
    var swirl = el("div", "ab-swirl");
    var words = c.sentence.split(/\s+/);
    var bright = spread(R.swirlBright, words.length);
    var dim = spread(R.swirlDim, words.length);
    words.forEach(function (w, i) {
      var slot = R.swirlBright.indexOf(bright[i]);
      var b = role(el("div", "ab-swirl__b", w), bright[i]);
      b.style.top = slot * 1.111 + "rem";
      swirl.appendChild(b);
    });
    words.forEach(function (w, i) {
      var slot = R.swirlDim.indexOf(dim[i]);
      var d = role(el("span", "ab-swirl__d", w), dim[i]);
      d.style.top = 22.15 + slot * 1.4375 + "rem";
      swirl.appendChild(d);
    });
    stage.appendChild(swirl);

    // The same sentence, settled.
    var wrap = el("div", "ab-center");
    var m2 = el("div", "ab-m2");
    var col = el("div", "ab-m2__col");

    var first = role(el("div", "ab-m2__line"), R.paraFirstLine);
    var inner = el("span", "ab-m2__rel");
    addAll(inner, letters(c.first, null, R.paraFirstLetters));
    var ghost = el("span", "ab-m2__ghost");
    addAll(ghost, letters(c.first));
    inner.appendChild(ghost);
    first.appendChild(inner);
    col.appendChild(first);

    var rest = c.lines.concat(c.lines2);
    rest.forEach(function (text, i) {
      var gap = i === c.lines.length - 1;
      var line = role(el("div", "ab-m2__line" + (gap ? " ab-m2__line--gap" : "")), R.paraLines[i]);
      line.appendChild(el("span", "ab-m2__span", text));
      col.appendChild(line);
    });

    var last = role(el("div", "ab-m2__line"), R.paraLines[9]);
    var rel = el("span", "ab-m2__rel");
    addAll(rel, letters(c.last, null, R.paraRoll));
    last.appendChild(rel);
    col.appendChild(last);

    m2.appendChild(col);
    wrap.appendChild(m2);
    stage.appendChild(wrap);
  }

  function bigWord(text, refs) {
    var w = el("span", "ab-vt__big");
    addAll(w, letters(text, null, refs));
    var hollow = el("span", "ab-hollow");
    addAll(hollow, letters(text));
    w.appendChild(hollow);
    return w;
  }

  function buildCameraCity() {
    var c = COPY.cameraCity;
    var layer = el("div", "ab-fixed");

    var bg = role(el("div", "ab-vt__bg"), R.cityBg);
    bg.appendChild(img(still(MEDIA.city, true)));
    layer.appendChild(bg);

    var pos = el("div", "ab-vt__pos");
    var title = role(el("div"), R.cityTitle);
    var h = el("h2", "ab-vt__h");
    var and = role(el("span", "ab-vt__and"), R.cityAnd);
    letters(c.and).forEach(function (s, i) {
      if (i === 1) s.classList.add("ab-ch--drop");
      and.appendChild(s);
    });
    var a = role(el("span", "ab-vt__and"), R.cityA);
    addAll(a, letters(c.a));
    add(h, bigWord(c.top, R.cityTop), and, a, bigWord(c.bottom, R.cityBottom));
    title.appendChild(h);
    title.appendChild(role(el("p", "ab-vt__cap", c.caption), R.cityCap));
    pos.appendChild(title);
    layer.appendChild(pos);

    stage.appendChild(layer);
  }

  function buildClients() {
    var c = COPY.clients;
    var layer = el("div", "ab-co");
    var cam = role(el("div", "ab-co__cam"), R.coCam);
    var wrap = role(el("div", "ab-co__wrap"), R.coWrap);

    var sizes = [0.3, 0.425, 0.55, 0.675];
    c.intro.forEach(function (text, i) {
      var p = role(el("p", "ab-co__intro", text), R.coIntro[i]);
      p.style.fontSize = sizes[i] + "rem";
      p.style.marginLeft = 4 - i + "vw";
      wrap.appendChild(p);
    });

    var list = el("div", "ab-co__list");
    var map = spread(R.coList, c.list.length);
    c.list.forEach(function (name, i) {
      var item = role(el("div", "ab-co__item", name), map[i]);
      // The names run down a shallow arc, furthest out at either end.
      item.style.marginLeft = 10 * (1 - Math.sin((Math.PI * (i + 0.5)) / c.list.length)) + "vw";
      list.appendChild(item);
    });
    wrap.appendChild(list);

    var cap = role(el("h3", "ab-co__cap"), R.coAfterBox);
    var aMap = spread(R.coAfter, c.after.length);
    var words = c.after.map(function (w, i) {
      var s = role(el("span", "ab-magic__w", w), aMap[i]);
      s.style.marginTop = i * 1.5 + "em";
      return s;
    });
    addAll(cap, words);
    var fill = role(el("span", "ab-fillword"), R.coAfterLast);
    fill.style.marginTop = c.after.length * 1.5 + "em";
    var hollow = el("div", "ab-hollow");
    hollow.style.color = "rgba(255,255,255,0.2)";
    addAll(hollow, letters(c.afterLast));
    fill.appendChild(hollow);
    addAll(fill, letters(c.afterLast, "ab-fl", R.coAfterFill));
    cap.appendChild(fill);
    staircases.push({ words: words, fill: fill, lean: 0.37 });
    wrap.appendChild(cap);

    cam.appendChild(wrap);
    layer.appendChild(cam);
    stage.appendChild(layer);

    // The slideshow beside the list: one frame per client, on a timer.
    var sl = el("div", "ab-sl");
    var box = role(el("div", "ab-sl__box"), R.coSlider);
    var frame = el("div", "ab-sl__frame");
    var slides = MEDIA.slides.filter(function (s) { return media(s.id); });
    var nodes = slides.map(function (s, i) {
      var n = el("div", "ab-sl__slide" + (i === 0 ? " is-on" : ""));
      n.appendChild(img(still(s.id), s.label));
      frame.appendChild(n);
      return n;
    });
    var meta = el("div", "ab-sl__meta");
    var label = el("p", null, slides[0] ? slides[0].label : "");
    var caption = el("p", null, slides[0] ? captionFor(slides[0]) : "");
    add(meta, label, caption);
    add(box, frame, meta);
    sl.appendChild(box);
    stage.appendChild(sl);
    slider = { slides: slides, nodes: nodes, meta: meta, label: label, caption: caption, at: 0, timer: 0 };
  }

  function captionFor(slide) {
    var p = projects.get(slide.company);
    if (!p) return "";
    return [p.category, [p.place, p.year].filter(Boolean).join(", ")].filter(Boolean).join(" — ");
  }

  function buildCampaigns() {
    var c = COPY.campaigns;
    var layer = el("div", "ab-fixed");

    var outer = el("div", "ab-ring__outer");
    var wrap = role(el("div", "ab-ring__wrap"), R.ringWrap);
    RING_TILES.forEach(function (t, i) {
      var tile = el("div", "ab-ring__tile");
      tile.style.top = t[0] + "vw";
      tile.style.left = t[1] + "vw";
      tile.style.transform = "rotateX(-90deg) rotateY(" + t[2] + "deg)";
      tile.appendChild(film(MEDIA.ring[i % MEDIA.ring.length]));
      wrap.appendChild(tile);
    });
    films.ring = Array.from(wrap.querySelectorAll("video"));
    outer.appendChild(wrap);
    layer.appendChild(outer);

    var t1 = el("div", "ab-ring__t");
    var h1 = role(el("h3", "ab-ring__h"), R.ringText1);
    c.lines.forEach(function (text, i) {
      var cls = i === 4 ? "ab-ring__big" : i === 6 ? "ab-ring__big ab-ring__big--last" : i === 3 ? "ab-ring__gap" : "";
      h1.appendChild(role(el("span", cls, text), R.ringSpans[i]));
    });
    t1.appendChild(h1);

    var t2 = el("div", "ab-ring__t");
    var h2 = role(el("h3", "ab-ring__h"), R.ringText2);
    c.second.forEach(function (group, gi) {
      group.forEach(function (text, i) {
        var gap = gi === 0 && i === group.length - 1;
        h2.appendChild(el("span", gap ? "ab-ring__gap3" : "", text));
      });
    });
    t2.appendChild(h2);

    add(layer, t1, t2);
    stage.appendChild(layer);
  }

  function buildJourney() {
    var c = COPY.journey;
    stage.appendChild(staircase(c.words, c.last, { mask: R.jMask, words: R.jWords, hollow: R.jHollow, fill: R.jFill }, true, 1.5, 0.2));
  }

  function workWord(text, dimRef, refs, side) {
    var w = el("span", "ab-w__word ab-w__word--" + side);
    w.appendChild(role(el("span", null, text), dimRef));
    var over = el("span", "ab-w__over");
    addAll(over, letters(text, null, refs));
    w.appendChild(over);
    return w;
  }

  function buildWork() {
    var c = COPY.work;
    var layer = el("div", "ab-fixed");

    var centre = el("div", "ab-w__c");
    var pic = el("div", "ab-w__img");
    var scale = role(el("div", "ab-persp"), R.workImg);
    var lean = add(el("div", "ab-w__pic"), img(still(MEDIA.workCentre)));
    leaners.push({ node: lean, dir: -1, rot: 0 });
    scale.appendChild(lean);
    pic.appendChild(scale);

    var h = role(el("h3", "ab-w__h"), R.workH);
    add(h, workWord(c.left, R.workLeftDim, R.workLeft, "l"), workWord(c.right, R.workRightDim, R.workRight, "r"));
    add(centre, pic, h);
    layer.appendChild(centre);
    stage.appendChild(layer);

    // The contact sheet the words dissolve into.
    var grid = el("div", "ab-fixed");
    var gw = role(el("div", "ab-g__wrap"), R.grid);
    var pool = [];
    library.forEach(function (m) {
      if (MEDIA.sheetSkip.indexOf(m.id) !== -1) return;
      var src = m.thumb || (m.type === "image" ? m.display : m.poster);
      if (src) pool.push(src);
    });
    GRID.forEach(function (g, i) {
      var tile = el("div", "ab-g__tile");
      tile.style.left = g[0] + "vw";
      tile.style.top = g[1] + "vh";
      tile.style.width = g[2] + "vw";
      tile.style.height = g[2] * g[3] + "vw";
      if (pool.length) tile.appendChild(img(pool[i % pool.length]));
      leaners.push({ node: tile, dir: g[4], rot: 0 });
      gw.appendChild(tile);
    });
    grid.appendChild(gw);
    stage.appendChild(grid);
  }

  function buildFollow() {
    var c = COPY.follow;
    var layer = el("div", "ab-fixed ab-so");

    var lead = role(el("p", "ab-so__for", c.lead), R.soFor);
    var over = el("span", "ab-over");
    addAll(over, letters(c.lead, null, R.soForLetters));
    lead.appendChild(over);

    var title = role(el("h4", "ab-so__title"), R.soTitle);
    title.appendChild(document.createTextNode(c.title[0]));
    title.appendChild(el("br"));
    title.appendChild(document.createTextNode(c.title[1]));

    var follow = role(el("p", "ab-so__small"), R.soFollow);
    add(follow, el("span", null, c.follow[0]), el("span", null, c.follow[1]));

    var on = role(add(el("div", "ab-so__row ab-so__row--on"), el("p", "ab-so__small", c.on)), R.soOn);

    function link(l) {
      var a = el("a", "ab-so__link", l.label);
      a.href = l.href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.tabIndex = -1; // the article below carries the focusable copies
      return a;
    }

    var first = role(add(el("div", "ab-so__row"), link(c.links[0])), R.soLinks[0]);
    var or = role(add(el("div", "ab-so__row"), el("p", "ab-so__small", c.or)), R.soLinks[1]);
    var second = role(add(el("div", "ab-so__row"), link(c.links[1])), R.soLinks[2]);
    var mail = el("a", "ab-so__mail", c.email);
    mail.href = "mailto:" + c.email;
    mail.tabIndex = -1;
    var mailRow = role(add(el("div", "ab-so__row"), mail), R.soLinks[2]);

    add(layer, lead, title, follow, on, first, or, second, mailRow);
    stage.appendChild(layer);
  }

  function buildRail() {
    COPY.rail.forEach(function (label) {
      var item = el("div", "ab-rail__item");
      if (label) item.appendChild(el("span", "ab-rail__label", label));
      rail.appendChild(item);
    });
    rail.appendChild(el("div", "ab-rail__box"));
  }

  /* --- build: the reading version ---------------------------------------- */

  function section(nodes) {
    var s = el("section", "ab-read__sec");
    addAll(s, nodes.filter(Boolean));
    read.appendChild(s);
    return s;
  }

  function line(parts) {
    var p = el("p", "ab-read__p");
    p.textContent = parts.join(" ");
    return p;
  }

  function figure(src, alt) {
    if (!src) return null;
    return add(el("figure", "ab-read__fig"), img(src, alt));
  }

  function buildRead() {
    var o = COPY.opening;
    var h1 = el("h1");
    h1.style.margin = "0";
    h1.style.fontWeight = "400";
    add(h1,
      el("span", "ab-read__big", o.line1[0][0]),
      el("span", "ab-read__small", o.line1[1][0]),
      el("span", "ab-read__big", o.line2[0][0]),
      el("span", "ab-read__small", o.line2[1][0]),
      el("span", "ab-read__big", o.line2[2][0]));
    section([h1, el("span", "ab-read__small", o.wellAs + " DP, editor and event director")]);

    var f = COPY.firstCamera;
    section([line(f.words.concat([f.last]))]);

    var g = COPY.growingUp;
    section([
      line([g.first].concat(g.lines)),
      line(g.lines2.concat([g.last])),
      figure(still(MEDIA.growBig), "")
    ]);

    var y = COPY.years;
    section([line([y.sentence]), line(y.lines2.concat([y.last]))]);

    var cc = COPY.cameraCity;
    var h2 = el("h2");
    h2.style.margin = "0";
    h2.style.fontWeight = "400";
    add(h2, el("span", "ab-read__big", cc.top), el("span", "ab-read__small", cc.and + " " + cc.a), el("span", "ab-read__big", cc.bottom));
    section([h2, figure(still(MEDIA.city), ""), line([cc.caption])]);

    var cl = COPY.clients;
    var ul = el("ul", "ab-read__list");
    cl.list.forEach(function (name) { ul.appendChild(el("li", null, name)); });
    section([line(cl.intro), ul, line(cl.after.concat([cl.afterLast]))]);

    var ca = COPY.campaigns;
    section([line(ca.lines), line(ca.second[0]), line(ca.second[1])]);

    var j = COPY.journey;
    var w = COPY.work;
    section([line(j.words.concat([j.last])), el("span", "ab-read__big", w.left), el("span", "ab-read__big", w.right)]);

    var fo = COPY.follow;
    var links = el("div", "ab-read__links");
    fo.links.forEach(function (l) {
      var a = el("a", null, l.label);
      a.href = l.href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      links.appendChild(a);
    });
    var mail = el("a", "ab-read__mail", fo.email);
    mail.href = "mailto:" + fo.email;
    links.appendChild(mail);
    section([line([fo.lead, fo.title.join(" "), fo.follow.join(" "), fo.on]), links]);

    // Sections rise in as they arrive.
    var secs = Array.from(read.querySelectorAll(".ab-read__sec"));
    if (!("IntersectionObserver" in window)) {
      secs.forEach(function (s) { s.classList.add("is-in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      });
    }, { rootMargin: "0px 0px -12% 0px" });
    secs.forEach(function (s) { io.observe(s); });
  }

  /* --- motion ------------------------------------------------------------ */

  var MOTION = window.ABOUT_MOTION || {};
  var STEP = 50;          // timeline units between samples of a recorded track
  var PER_SCREEN = 900;   // timeline units per screen of scrolling
  var REF_WIDTH = 1440;   // the width the px values in MOTION were laid out at

  function powIn(p) { return function (t) { return Math.pow(t, p); }; }
  function powOut(p) { return function (t) { return 1 - Math.pow(1 - t, p); }; }
  function powInOut(p) {
    return function (t) {
      return t < 0.5 ? Math.pow(2, p - 1) * Math.pow(t, p) : 1 - Math.pow(-2 * t + 2, p) / 2;
    };
  }

  var EASE = {
    linear: function (t) { return t; },
    "power1.in": powIn(2), "power1.out": powOut(2), "power1.inOut": powInOut(2),
    "power2.in": powIn(3), "power2.out": powOut(3), "power2.inOut": powInOut(3),
    "power3.in": powIn(4), "power3.out": powOut(4), "power3.inOut": powInOut(4),
    "power4.in": powIn(5), "power4.out": powOut(5), "power4.inOut": powInOut(5),
    "sine.in": function (t) { return 1 - Math.cos((t * Math.PI) / 2); },
    "sine.out": function (t) { return Math.sin((t * Math.PI) / 2); },
    "sine.inOut": function (t) { return -(Math.cos(Math.PI * t) - 1) / 2; },
    "expo.in": function (t) { return t === 0 ? 0 : Math.pow(2, 10 * t - 10); },
    "expo.out": function (t) { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); },
    "expo.inOut": function (t) {
      if (t === 0 || t === 1) return t;
      return t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;
    },
    "circ.in": function (t) { return 1 - Math.sqrt(1 - t * t); },
    "circ.out": function (t) { return Math.sqrt(1 - Math.pow(t - 1, 2)); },
    "circ.inOut": function (t) {
      return t < 0.5 ? (1 - Math.sqrt(1 - Math.pow(2 * t, 2))) / 2 : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2;
    }
  };

  var VW = 0;
  var VH = 0;
  var REM = 0;
  var actors = [];

  // The client list's camera pans down the list until its foot sits at this
  // share of the screen. The recorded pan was sized for a list of 52 names;
  // it is rescaled to however long this one is.
  var PAN_ROLE = 479;
  var PAN_RECORDED = 655.84; // px at 1440 wide
  var PAN_FOOT = 0.8187;

  function measure() {
    VW = window.innerWidth;
    VH = window.innerHeight;
    REM = VW * 0.009375;
    actors.forEach(function (a) {
      a.w = a.node.offsetWidth;
      a.h = a.node.offsetHeight;
      if (+a.node.getAttribute("data-m") === PAN_ROLE) {
        var need = Math.max(0, a.node.firstElementChild.offsetHeight - PAN_FOOT * VH);
        a.mul = { y: need / ((PAN_RECORDED * VW) / REF_WIDTH) };
      }
    });
  }

  /** A length in the units it was recorded in, to pixels on this screen. */
  function length(v, unit, axis, a) {
    switch (unit) {
      case "rem": return v * REM;
      case "vw": return (v * VW) / 100;
      case "vh": return (v * VH) / 100;
      case "%": return (v * (axis === "y" ? a.h : a.w)) / 100;
      case "px": return (v * VW) / REF_WIDTH;
      default: return v;
    }
  }

  function convert(v, unit, ch, a) {
    if (ch === "x" || ch === "y") return length(v, unit, ch, a);
    return v;
  }

  function startOf(tw) { return tw[1] === "T" ? tw[2] : tw[5]; }

  /** One tween's value at timeline position p, held at its ends. */
  function sample(tw, p, a) {
    var ch = tw[0];
    if (tw[1] === "T") {
      var vals = tw[3];
      var f = (p - tw[2]) / STEP;
      if (f <= 0) return convert(vals[0], tw[4], ch, a);
      if (f >= vals.length - 1) return convert(vals[vals.length - 1], tw[4], ch, a);
      var i = Math.floor(f);
      var v = vals[i] + (vals[i + 1] - vals[i]) * (f - i);
      return convert(v, tw[4], ch, a);
    }
    var from = convert(tw[1], tw[2], ch, a);
    var to = convert(tw[3], tw[4], ch, a);
    var t = (p - tw[5]) / (tw[6] - tw[5]);
    if (t <= 0) return from;
    if (t >= 1) return to;
    return from + (to - from) * (EASE[tw[7]] || EASE.linear)(t);
  }

  /** A property's value: the latest tween to have started, else the first's start. */
  function channel(list, p, a) {
    var cur = -1;
    for (var i = 0; i < list.length; i++) {
      if (p >= startOf(list[i])) cur = i;
      else break;
    }
    return sample(list[cur < 0 ? 0 : cur], cur < 0 ? -Infinity : p, a);
  }

  function collectActors() {
    actors = [];
    Array.from(stage.querySelectorAll("[data-m]")).forEach(function (node) {
      var list = MOTION[node.getAttribute("data-m")];
      if (!list) return;
      var chans = {};
      list.forEach(function (tw) { (chans[tw[0]] = chans[tw[0]] || []).push(tw); });
      Object.keys(chans).forEach(function (k) {
        chans[k].sort(function (x, y) { return startOf(x) - startOf(y); });
      });
      actors.push({ node: node, chans: chans, w: 0, h: 0, last: {} });
    });
  }

  function setStyle(a, prop, value) {
    if (a.last[prop] === value) return;
    a.last[prop] = value;
    a.node.style[prop] = value;
  }

  function render(p) {
    for (var i = 0; i < actors.length; i++) {
      var a = actors[i];
      var c = a.chans;
      var v = {};
      for (var k in c) v[k] = channel(c[k], p, a);
      if (a.mul && "y" in v) v.y *= a.mul.y;

      if ("x" in v || "y" in v || "rotate" in v || "scale" in v || "scaleY" in v) {
        var tf = "translate3d(" + (v.x || 0).toFixed(2) + "px," + (v.y || 0).toFixed(2) + "px,0)";
        if ("rotate" in v) tf += " rotate(" + v.rotate.toFixed(2) + "deg)";
        if ("scale" in v || "scaleY" in v) {
          var sx = "scale" in v ? v.scale : 1;
          var sy = "scaleY" in v ? v.scaleY : sx;
          tf += " scale(" + sx.toFixed(4) + "," + sy.toFixed(4) + ")";
        }
        setStyle(a, "transform", tf);
      }
      if ("opacity" in v) {
        var o = Math.max(0, Math.min(1, v.opacity));
        setStyle(a, "opacity", o.toFixed(3));
        setStyle(a, "visibility", o < 0.002 ? "hidden" : "visible");
      }
      if ("blur" in v) setStyle(a, "filter", v.blur > 0.01 ? "blur(" + v.blur.toFixed(2) + "px)" : "none");
      if ("mask" in v) {
        var m = "linear-gradient(to left, rgba(0,0,0,0) " + v.mask.toFixed(2) + "%, #000 100%)";
        setStyle(a, "maskImage", m);
        setStyle(a, "webkitMaskImage", m);
      }
      if ("clip" in v) {
        var l = v.clip.toFixed(3) + "%";
        setStyle(a, "clipPath", "polygon(" + l + " 0, 100% 0, 100% 100%, " + l + " 100%)");
      }
    }
  }

  /* --- the parts that are not on the timeline ---------------------------- */

  var railBox = null;
  var railItems = [];
  var railAt = -1;

  function renderRail(p) {
    var idx = 0;
    for (var i = 0; i < RAIL_STEPS.length; i++) if (p >= RAIL_STEPS[i]) idx = i + 1;
    if (idx === railAt) return;
    railAt = idx;
    railBox.style.transform = "translateY(" + idx * 100 + "%)";
    railItems.forEach(function (item, i) { item.classList.toggle("is-current", i === idx); });
  }

  /** Films play only while their chapter is on screen. */
  function renderFilms(p) {
    playIf(films.hero, p >= PLAY.hero[0] && p <= PLAY.hero[1]);
    playIf(films.ring, p >= PLAY.ring[0] && p <= PLAY.ring[1]);
  }

  function playIf(list, on) {
    list.forEach(function (v) {
      if (on) {
        if (!v.src && v.dataset.src) v.src = v.dataset.src;
        if (v.paused) {
          var pr = v.play();
          if (pr && pr.catch) pr.catch(function () {});
        }
      } else if (!v.paused) {
        v.pause();
      }
    });
  }

  /**
   * Stills lean away from the direction of travel and settle when the scroll
   * stops: their tilt follows the scroll's speed, not its position.
   */
  function renderLean(velocity, dt) {
    var k = 1 - Math.pow(1 - 0.06, dt / 16.667);
    var target = Math.max(-14, Math.min(14, velocity * 1.15));
    for (var i = 0; i < leaners.length; i++) {
      var l = leaners[i];
      l.rot += (target * l.dir - l.rot) * k;
      var r = Math.abs(l.rot) < 0.01 ? 0 : l.rot;
      if (l.shown !== r.toFixed(2)) {
        l.shown = r.toFixed(2);
        l.node.style.transform = "rotateY(" + l.shown + "deg)";
      }
    }
  }

  var SLIDER_ON = [9150, 10500];

  function renderSlider(p) {
    if (!slider || slider.slides.length < 2) return;
    var live = p >= SLIDER_ON[0] && p <= SLIDER_ON[1];
    if (live && !slider.timer) {
      slider.timer = window.setInterval(nextSlide, 2800);
    } else if (!live && slider.timer) {
      window.clearInterval(slider.timer);
      slider.timer = 0;
    }
  }

  function nextSlide() {
    var s = slider;
    s.nodes[s.at].classList.remove("is-on");
    s.at = (s.at + 1) % s.nodes.length;
    s.nodes[s.at].classList.add("is-on");
    s.meta.classList.add("is-swapping");
    window.setTimeout(function () {
      s.label.textContent = s.slides[s.at].label;
      s.caption.textContent = captionFor(s.slides[s.at]);
      s.meta.classList.remove("is-swapping");
    }, 400);
  }

  /**
   * Each staircase word starts a little before the previous one ended — by a
   * share of its width measured off the timeline's own staircases.
   */
  function layStaircases() {
    staircases.forEach(function (s) {
      var nodes = s.words.concat([s.fill]);
      for (var i = 1; i < nodes.length; i++) {
        nodes[i].style.marginLeft = "";
      }
      for (var j = 1; j < nodes.length; j++) {
        nodes[j].style.marginLeft = -s.lean * nodes[j - 1].offsetWidth + "px";
      }
    });
  }

  /* --- loop -------------------------------------------------------------- */

  var desktop = window.matchMedia("(min-width: 900px) and (min-height: 520px)");
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  var running = false;
  var smooth = 0;
  var lastTime = 0;
  var lastP = 0;
  var frame = 0;

  function position() {
    return (smooth * PER_SCREEN) / VH;
  }

  function tick(now) {
    if (!running) return;
    var dt = lastTime ? Math.min(64, now - lastTime) : 16.667;
    lastTime = now;

    var target = window.scrollY;
    var k = 1 - Math.pow(1 - 0.1, dt / 16.667);
    smooth += (target - smooth) * k;
    if (Math.abs(target - smooth) < 0.05) smooth = target;

    var p = position();
    var velocity = ((p - lastP) / dt) * 16.667;
    lastP = p;

    render(p);
    renderRail(p);
    renderFilms(p);
    renderSlider(p);
    renderLean(velocity, dt);

    frame = requestAnimationFrame(tick);
  }

  function start() {
    if (running) return;
    running = true;
    document.documentElement.classList.add("ab-scroll");
    measure();
    layStaircases();
    smooth = window.scrollY;
    lastP = position();
    render(lastP);
    lastTime = 0;
    frame = requestAnimationFrame(tick);
  }

  function stop() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(frame);
    document.documentElement.classList.remove("ab-scroll");
    playIf(films.hero, false);
    playIf(films.ring, false);
    if (slider && slider.timer) {
      window.clearInterval(slider.timer);
      slider.timer = 0;
    }
  }

  function decide() {
    if (desktop.matches && !reduced.matches) start();
    else stop();
  }

  // For inspecting one moment of the story: `__about.at(4200)` jumps there
  // without the smoothing, the way ?introAt= freezes the home page's opening.
  window.__about = {
    at: function (p) {
      var y = (p * VH) / PER_SCREEN;
      window.scrollTo(0, y);
      smooth = y;
      lastP = p;
      render(p);
      renderRail(p);
    }
  };

  window.addEventListener("resize", function () {
    if (!running) return;
    measure();
    layStaircases();
  });

  /* --- go ---------------------------------------------------------------- */

  function load(url) {
    return fetch(url, { headers: { Accept: "application/json" } }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    });
  }

  Promise.all([
    load("data/media.json").catch(function () { return { items: [] }; }),
    load("data/projects.json").catch(function () { return { projects: [] }; })
  ]).then(function (data) {
    (data[0].items || []).forEach(function (m) { library.set(m.id, m); });
    (data[1].projects || []).forEach(function (p) {
      projects.set(p.company, p);
      (p.items || []).forEach(function (m) { if (!library.has(m.id)) library.set(m.id, m); });
    });

    buildOpening();
    buildFirstCamera();
    buildGrowingUp();
    buildYears();
    buildCameraCity();
    buildClients();
    buildCampaigns();
    buildJourney();
    buildWork();
    buildFollow();
    buildRail();
    buildRead();

    railBox = rail.querySelector(".ab-rail__box");
    railItems = Array.from(rail.querySelectorAll(".ab-rail__item"));

    collectActors();

    // The staircases are laid out from measured word widths, so they wait for
    // the face that will actually draw them.
    var fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    fontsReady.then(function () {
      if (running) {
        measure();
        layStaircases();
      }
    });

    decide();
    if (desktop.addEventListener) {
      desktop.addEventListener("change", decide);
      reduced.addEventListener("change", decide);
    }
  });
})();
