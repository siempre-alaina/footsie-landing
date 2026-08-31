/* footsie.ai — circular maze generator + pac-man style agent navigation.
 *
 * KEY CONCEPT: drawn arcs and radials are WALLS.  Agents move in the
 * CORRIDORS between walls, exactly like Pac-Man ghosts.
 *
 * Corridors run between consecutive ring walls.  Gaps in ring arcs let
 * agents cross from one corridor to the next.  Radial walls within a
 * corridor block movement along that corridor, creating turns and
 * dead ends.
 *
 * buildMaze() produces the SVG AND the navigation graph in one pass,
 * guaranteeing the paths agents walk match the visual perfectly.
 */
(function () {
  var TAU = Math.PI * 2;

  function makePRNG(seed) {
    var s = seed * 9301 + 49297;
    return function () {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  }

  /* ================================================================ */
  /*  buildMaze                                                        */
  /* ================================================================ */
  function buildMaze(o) {
    var size    = o.size    || 800;
    var rings   = o.rings   || 7;
    var stroke  = o.stroke  || "#0D9488";
    var strokeW = o.strokeW || 6;
    var mode    = o.mode    || "open";
    var seed    = o.seed    || 7;
    var cntr    = o.center !== undefined ? o.center : true;
    var fStroke = o.fStroke || stroke;
    var opacity = o.opacity !== undefined ? o.opacity : 1;
    var SLOTS   = o.slots   || 12;
    var dotColor = o.dotColor || null;

    var cx   = size / 2;
    var cy   = size / 2;
    var rMax = size / 2 - strokeW;
    var rMin = size * 0.08;
    var dr   = (rMax - rMin) / rings;
    var rnd  = makePRNG(seed);
    var SA   = TAU / SLOTS;           // slot angle

    /* ---- graph structures ---- */
    var nodes = [], nodeMap = {}, adj = [];

    function getNode(corridor, slot) {
      var key = corridor + ":" + slot;
      if (nodeMap[key] !== undefined) return nodeMap[key];
      // Node sits at the MIDPOINT radius of the corridor, at the slot CENTER angle
      var midR  = rMin + (corridor + 0.5) * dr;
      var angle = -Math.PI / 2 + (slot + 0.5) * SA;
      var idx   = nodes.length;
      nodes.push({ corridor: corridor, slot: slot, angle: angle, rFrac: midR / (size / 2) });
      nodeMap[key] = idx;
      adj.push([]);
      return idx;
    }

    function addEdge(a, b, type) {
      for (var e = 0; e < adj[a].length; e++) if (adj[a][e].to === b) return;
      adj[a].push({ to: b, type: type });
      adj[b].push({ to: a, type: type });
    }

    var svgWalls  = "";   // wall paths (ring arcs + radials)
    var svgDecor  = "";   // pellet dots

    /* ============================================================== */
    /*  1. Radial walls FIRST — we need segments before placing gaps  */
    /* ============================================================== */
    var corridorWalls = [];
    for (var c = 0; c < rings; c++) corridorWalls.push({});

    for (var c = 1; c < rings; c++) {
      var wallTarget;
      if (mode === "broken") {
        wallTarget = 3 + Math.floor(rnd() * 3);
      } else {
        wallTarget = c <= 3 ? 1 + Math.floor(rnd() * 2)     // inner: 1-2 walls
                            : 2 + Math.floor(rnd() * 2);    // outer: 2-3 walls
      }
      var wc = 0;
      while (wc < wallTarget) {
        var w = Math.floor(rnd() * SLOTS);
        if (!corridorWalls[c][w]) { corridorWalls[c][w] = true; wc++; }
      }
    }

    /* Helper: find segments for a corridor (runs of slots between walls) */
    function getSegments(c) {
      var segs = [];
      var wallSlots = [];
      for (var k = 0; k < SLOTS; k++) {
        if (corridorWalls[c][k]) wallSlots.push(k);
      }
      if (wallSlots.length === 0) {
        // Entire ring is one segment
        segs.push([]);
        for (var k = 0; k < SLOTS; k++) segs[0].push(k);
        return segs;
      }
      // Walk from each wall to the next. A wall stored at slot index w sits
      // at angle w*SA — the boundary between slot w-1 and slot w — so the
      // segment after that wall STARTS AT slot w (inclusive) and runs up to
      // (not including) the next wall's slot. With a single wall, the whole
      // ring is one C-shaped segment containing every slot.
      for (var w = 0; w < wallSlots.length; w++) {
        var start = wallSlots[w];
        var end = wallSlots[(w + 1) % wallSlots.length];
        var seg = [];
        var k = start;
        do {
          seg.push(k);
          k = (k + 1) % SLOTS;
        } while (k !== end && seg.length <= SLOTS);
        segs.push(seg);
      }
      return segs;
    }

    /* ============================================================== */
    /*  2. Ring gaps — place initial random gaps, then guarantee       */
    /*     every corridor segment has at least one gap on each         */
    /*     bounding ring so agents can always reach adjacent corridors */
    /* ============================================================== */
    var ringGaps = [];
    ringGaps[0] = {};
    // Initial random gaps
    for (var i = 1; i <= rings; i++) {
      var gaps = {};
      var gapTarget = mode === "broken" ? 2 + Math.floor(rnd() * 3) : 4 + Math.floor(rnd() * 2);
      var gc = 0;
      while (gc < gapTarget) {
        var g = Math.floor(rnd() * SLOTS);
        if (!gaps[g]) { gaps[g] = true; gc++; }
      }
      ringGaps[i] = gaps;
    }

    // Connectivity pass: for each corridor c (1..rings-1), find its segments.
    // Each segment must have ≥1 gap on ring c (inner wall) AND ≥1 gap on
    // ring c+1 (outer wall) — unless c+1 > rings-1 (outermost corridor).
    for (var c = 1; c < rings; c++) {
      var segs = getSegments(c);
      for (var s = 0; s < segs.length; s++) {
        var seg = segs[s];
        if (seg.length === 0) continue;

        // Check inner ring (ring c) — connects to corridor c-1
        if (c >= 2) {
          var hasInner = false;
          for (var j = 0; j < seg.length; j++) {
            if (ringGaps[c][seg[j]]) { hasInner = true; break; }
          }
          if (!hasInner) {
            // Add a gap at a random slot within this segment
            var pick = seg[Math.floor(rnd() * seg.length)];
            ringGaps[c][pick] = true;
          }
        }

        // Check outer ring (ring c+1) — connects to corridor c+1
        if (c + 1 <= rings - 1) {
          var hasOuter = false;
          for (var j = 0; j < seg.length; j++) {
            if (ringGaps[c + 1][seg[j]]) { hasOuter = true; break; }
          }
          if (!hasOuter) {
            var pick = seg[Math.floor(rnd() * seg.length)];
            ringGaps[c + 1][pick] = true;
          }
        }
      }
    }

    /* ============================================================== */
    /*  3. Draw ring arcs (walls) — skip gap slots                    */
    /* ============================================================== */
    for (var i = 1; i <= rings; i++) {
      var r = rMin + i * dr;
      for (var k = 0; k < SLOTS; k++) {
        if (ringGaps[i][k]) continue;
        if (mode === "broken" && rnd() < 0.15) continue;

        var a0 = -Math.PI / 2 + k * SA + SA * 0.015;
        var a1 = -Math.PI / 2 + (k + 1) * SA - SA * 0.015;
        svgWalls += '<path d="M ' +
          (cx + r * Math.cos(a0)).toFixed(2) + " " + (cy + r * Math.sin(a0)).toFixed(2) +
          " A " + r.toFixed(2) + " " + r.toFixed(2) + " 0 0 1 " +
          (cx + r * Math.cos(a1)).toFixed(2) + " " + (cy + r * Math.sin(a1)).toFixed(2) + '" />';
      }
    }

    /* ============================================================== */
    /*  4. Draw radial walls                                           */
    /* ============================================================== */
    for (var c = 1; c < rings; c++) {
      var rInner = rMin + c * dr;
      var rOuter = rMin + (c + 1) * dr;
      for (var k = 0; k < SLOTS; k++) {
        if (!corridorWalls[c][k]) continue;
        var a = -Math.PI / 2 + k * SA;
        svgWalls += '<path d="M ' +
          (cx + rInner * Math.cos(a)).toFixed(2) + " " + (cy + rInner * Math.sin(a)).toFixed(2) +
          " L " +
          (cx + rOuter * Math.cos(a)).toFixed(2) + " " + (cy + rOuter * Math.sin(a)).toFixed(2) + '" />';
      }
    }

    /* ============================================================== */
    /*  3. Pellet dots — along corridors AND through ring gap crossings */
    /*                                                                  */
    /*  Dot positions use the SAME formulas as getNode():               */
    /*    radius = rMin + (corridor + 0.5) * dr   (corridor midpoint)   */
    /*    angle  = -PI/2 + (slot + 0.5) * SA      (slot center)         */
    /*  This guarantees agents travel directly over the dots.           */
    /* ============================================================== */
    var dc = dotColor || stroke;
    var dotSize = 5, dotHalf = dotSize / 2;
    var dotOp = 0.55;

    // Each dot carries a data-dot key so the animation layer can find it
    // (pellet-eating effect): "d:corridor:slot" for corridor dots,
    // "g:ring:slot:fraction" for the 3-dot trails through ring gaps.
    function drawDot(r, a, key) {
      svgDecor += '<rect x="' + (cx + r * Math.cos(a) - dotHalf).toFixed(1) +
                  '" y="' + (cy + r * Math.sin(a) - dotHalf).toFixed(1) +
                  '" width="' + dotSize + '" height="' + dotSize +
                  '" fill="' + dc + '" opacity="' + dotOp +
                  (key ? '" data-dot="' + key : "") + '" />';
    }

    // Arc corridor dots — at corridor midpoints, slot centers
    for (var c = 1; c < rings; c++) {
      var midR = rMin + (c + 0.5) * dr;
      for (var k = 0; k < SLOTS; k++) {
        drawDot(midR, -Math.PI / 2 + (k + 0.5) * SA, "d:" + c + ":" + k);
      }
    }

    // Radial crossing trails — 3-dot trail through each ring gap
    // bridging the corridor below to the corridor above
    for (var i = 2; i < rings; i++) {
      for (var k = 0; k < SLOTS; k++) {
        if (!ringGaps[i][k]) continue;
        var a = -Math.PI / 2 + (k + 0.5) * SA;
        var innerMidR = rMin + (i - 1 + 0.5) * dr;
        var outerMidR = rMin + (i + 0.5) * dr;
        for (var f = 0.25; f <= 0.75; f += 0.25) {
          drawDot(innerMidR + (outerMidR - innerMidR) * f, a, "g:" + i + ":" + k + ":" + f);
        }
      }
    }

    /* ============================================================== */
    /*  4. Build navigation graph                                      */
    /* ============================================================== */
    for (var c = 1; c < rings; c++) {     // corridors 1..rings-1 (skip center)
      for (var k = 0; k < SLOTS; k++) {
        getNode(c, k);                    // ensure node exists

        // Arc edge to next slot — blocked if radial wall at boundary (k+1)%SLOTS
        var nextBound = (k + 1) % SLOTS;
        if (!corridorWalls[c][nextBound]) {
          addEdge(getNode(c, k), getNode(c, nextBound), "arc");
        }

        // Crossing edge to corridor ABOVE (c+1) via gap in ring c+1
        if (c + 1 < rings && ringGaps[c + 1] && ringGaps[c + 1][k]) {
          addEdge(getNode(c, k), getNode(c + 1, k), "radial");
        }

        // Crossing edge to corridor BELOW (c-1) via gap in ring c
        if (c - 1 >= 1 && ringGaps[c] && ringGaps[c][k]) {
          addEdge(getNode(c, k), getNode(c - 1, k), "radial");
        }
      }
    }

    /* ============================================================== */
    /*  5. Central f-mark                                              */
    /* ============================================================== */
    var fGlyph = "";
    if (cntr && mode === "open") {
      var rf = rMin * 0.95;
      fGlyph =
        '<g stroke="' + fStroke + '" stroke-width="' + (strokeW * 1.05).toFixed(2) +
        '" stroke-linecap="round" fill="none">' +
        '<path d="M ' + (cx + rf * 0.05) + " " + (cy - rf * 0.6) +
        " q " + (-rf * 0.5) + " 0 " + (-rf * 0.5) + " " + (rf * 0.55) +
        " L " + (cx - rf * 0.45) + " " + (cy + rf * 0.7) + '" />' +
        '<path d="M ' + (cx - rf * 0.7) + " " + (cy - rf * 0.05) +
        " L " + (cx + rf * 0.25) + " " + (cy - rf * 0.05) + '" /></g>';
    }

    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + " " + size +
      '" style="opacity:' + opacity + '">' +
      '<g fill="none" stroke="' + stroke + '" stroke-width="' + strokeW +
      '" stroke-linecap="round">' + svgWalls + '</g>' +
      svgDecor + fGlyph + '</svg>';

    return { svg: svg, nodes: nodes, adj: adj };
  }

  /* mazeSVG — convenience wrapper returning just the SVG string */
  window.mazeSVG = function (o) { return buildMaze(o).svg; };

  /* mountMazes — render [data-maze] elements */
  window.mountMazes = function (root) {
    (root || document).querySelectorAll("[data-maze]").forEach(function (el) {
      if (el.dataset.mounted === "1") return;
      try {
        el.innerHTML = window.mazeSVG(JSON.parse(el.dataset.maze));
        el.dataset.mounted = "1";
      } catch (err) {
        // One bad data-maze attribute should not take down every other maze
        // on the page (or the boot sequence that follows).
        console.error("[maze] skipping element with invalid data-maze:", err, el);
      }
    });
  };

  /* ================================================================ */
  /*  Geometry helpers                                                 */
  /* ================================================================ */
  function nodePos(n, base) {
    var r = n.rFrac * base;
    return { x: Math.cos(n.angle) * r, y: Math.sin(n.angle) * r };
  }

  function edgePos(nA, nB, t, type, base) {
    if (type === "radial") {
      var pA = nodePos(nA, base), pB = nodePos(nB, base);
      return { x: pA.x + (pB.x - pA.x) * t, y: pA.y + (pB.y - pA.y) * t };
    }
    var r  = nA.rFrac * base;
    var a0 = nA.angle, a1 = nB.angle, da = a1 - a0;
    if (da > Math.PI) da -= TAU;
    if (da < -Math.PI) da += TAU;
    var a = a0 + da * t;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  }

  function edgeLen(nA, nB, type, base) {
    if (type === "radial") {
      var pA = nodePos(nA, base), pB = nodePos(nB, base);
      var dx = pB.x - pA.x, dy = pB.y - pA.y;
      return Math.sqrt(dx * dx + dy * dy);
    }
    var r = nA.rFrac * base, da = nB.angle - nA.angle;
    if (da > Math.PI) da -= TAU;
    if (da < -Math.PI) da += TAU;
    return Math.abs(da) * r;
  }

  /* ================================================================ */
  /*  Agent animation                                                  */
  /*                                                                   */
  /*  COORDINATES: the maze SVG's on-screen size is decided by CSS, so */
  /*  measure() reads it back from the DOM instead of assuming a scale */
  /*  factor. The SVG viewBox is 0..SVG_SIZE, so:                      */
  /*    1 SVG-unit = svgWidth / SVG_SIZE px                            */
  /*    base       = svgWidth / 2            (radius scale)            */
  /*  Agents share these formulas with the maze dots, so an agent's    */
  /*  path lands exactly on the pellets down the middle of a corridor. */
  /*                                                                   */
  /*  Do NOT reintroduce a hardcoded scale constant here. There was    */
  /*  one (CSS_SCALE = 1.3, matching `width: 130%`), but .hero-maze-bg */
  /*  is a flex container and flex-shrink pulled the SVG back to 100%. */
  /*  The 30% error put every agent on a wall instead of in a corridor.*/
  /* ================================================================ */
  function animateHeroAgents() {
    var container = document.querySelector(".hero-agents");
    if (!container) return;
    var agentEls = container.querySelectorAll(".hero-agent");
    if (!agentEls.length) return;
    var hero = container.closest(".hero");

    // The maze the agents walk MUST be the same maze that was drawn, so read
    // the config straight off the hero element rather than keeping a second
    // copy here. (These were previously duplicated: any edit to the
    // data-maze attribute silently desynced the agents from the walls.)
    var mazeEl = document.querySelector(".hero-maze-bg[data-maze]");
    if (!mazeEl) return;

    var mazeCfg;
    try {
      mazeCfg = JSON.parse(mazeEl.dataset.maze);
    } catch (err) {
      console.error("[maze] hero data-maze is not valid JSON:", err);
      return;
    }

    var SVG_SIZE = mazeCfg.size || 800;

    // The rendered size of the maze is decided by CSS, so MEASURE it rather
    // than assuming a scale factor. A hardcoded constant was wrong here:
    // .hero-maze-bg is a flex container, so the SVG's `width: 130%` is shrunk
    // straight back to 100% by the default flex-shrink, and agents were being
    // placed ~30% too far out — i.e. on top of the walls instead of in the
    // corridors between them.
    var svgEl = mazeEl.querySelector("svg");
    if (!svgEl) return;

    // Geometry for the current layout: how big one maze unit is on screen, and
    // where the maze's centre sits relative to the agent layer's centre.
    function measure() {
      var s = svgEl.getBoundingClientRect();
      var h = hero.getBoundingClientRect();
      return {
        base: s.width / 2,                 // px per (SVG_SIZE / 2) maze units
        pxPerUnit: s.width / SVG_SIZE,
        ox: s.left + s.width / 2 - (h.left + h.width / 2),
        oy: s.top + s.height / 2 - (h.top + h.height / 2),
        halfW: h.width / 2 - 30,
        halfH: h.height / 2 - 30
      };
    }

    var maze  = buildMaze(mazeCfg);
    var nodes = maze.nodes, adjList = maze.adj;

    // Which corridors agents live in. Outer corridors read best: the inner
    // ones sit behind the headline and its scrim. Clamped to the corridors
    // that actually exist for this ring count.
    var rings = mazeCfg.rings || 7;
    // Keep the band narrow. Two competing constraints:
    //  - too far in and the agents disappear behind the headline scrim;
    //  - too wide a band and ten agents spread so thin they never share an
    //    edge, so they never meet and never bounce off each other.
    // Three corridors keeps them visible AND densely enough packed to collide.
    var BAND_MIN = Math.min(3, rings - 1);
    var BAND_MAX = Math.min(rings - 1, BAND_MIN + 2);

    var outerNodes = [];
    for (var n = 0; n < nodes.length; n++) {
      if (nodes[n].corridor >= BAND_MIN && nodes[n].corridor <= BAND_MAX && adjList[n].length > 0) {
        outerNodes.push(n);
      }
    }
    if (outerNodes.length < 7) {
      for (var n = 0; n < nodes.length; n++) {
        if (adjList[n].length > 0) outerNodes.push(n);
      }
    }

    // Per-agent PRNG so each agent makes independent turn decisions
    function makeAgentRng(seed) {
      var s = seed;
      return function () { s = (s * 16807) % 2147483647; return s / 2147483647; };
    }

    // 10 agents, each with distinct speed and PRNG seed
    var speeds   = [35, 32, 42, 28, 33, 37, 40, 30, 38, 34];
    var rngSeeds = [42, 137, 271, 389, 503, 641, 797, 911, 1049, 1187];

    // Start positions spread across the band at well-separated angles, so the
    // agents fan out around the maze rather than bunching in one quadrant.
    var slotsTotal = mazeCfg.slots || 12;
    var startPositions = [];
    for (var sp = 0; sp < 10; sp++) {
      startPositions.push([
        BAND_MIN + (sp % (BAND_MAX - BAND_MIN + 1)),
        Math.round((sp * slotsTotal) / 10) % slotsTotal
      ]);
    }

    // Agents must START inside the visible hero band — the routing keeps
    // them there afterwards, so don't spawn any outside it.
    var initGeo = measure();
    function inBand(n) {
      var p = nodePos(nodes[n], initGeo.base);
      return Math.abs(p.x + initGeo.ox) <= initGeo.halfW &&
             Math.abs(p.y + initGeo.oy) <= initGeo.halfH;
    }

    var usedStartNodes = {};
    var agents = [];
    for (var i = 0; i < Math.min(agentEls.length, 10); i++) {
      var sc = startPositions[i][0], sk = startPositions[i][1];
      // Find the best-connected node on this corridor, not already used
      var startIdx = -1;
      var bestScore = 0;
      for (var n = 0; n < nodes.length; n++) {
        if (usedStartNodes[n]) continue;
        if (!inBand(n)) continue;
        if (nodes[n].corridor === sc && adjList[n].length >= 2) {
          var radCount = 0;
          for (var e = 0; e < adjList[n].length; e++) {
            if (adjList[n][e].type === "radial") radCount++;
          }
          var score = adjList[n].length + radCount * 3;
          var slotDist = Math.abs(nodes[n].slot - sk);
          var slotCount = mazeCfg.slots || 12;
          if (slotDist > slotCount / 2) slotDist = slotCount - slotDist;
          score -= slotDist * 0.1;
          if (score > bestScore) { bestScore = score; startIdx = n; }
        }
      }
      // Fallback: any unused in-band node with ≥2 edges
      if (startIdx < 0) {
        for (var n = 0; n < nodes.length; n++) {
          if (!usedStartNodes[n] && inBand(n) && adjList[n].length >= 2) { startIdx = n; break; }
        }
      }
      if (startIdx < 0) startIdx = outerNodes[i % outerNodes.length];
      usedStartNodes[startIdx] = true;

      var edge = adjList[startIdx][0];
      agents.push({
        el: agentEls[i], speed: speeds[i],
        fromNode: startIdx, toNode: edge.to, edgeType: edge.type,
        t: 0, prevNode: -1, pause: 0,
        rng: makeAgentRng(rngSeeds[i])
      });
    }

    /* All routing happens HERE, at nodes — nowhere else.
     * Priority: (1) a forward edge whose destination is on-screen,
     * (2) reverse back the way we came (the Pac-Man dead-end turn),
     * (3) if stranded off-screen (e.g. after a resize), the edge that
     *     gets closest back to the visible band — walked, never teleported. */
    function chooseNextEdge(ag, geo) {
      var base = geo.base, halfW = geo.halfW, halfH = geo.halfH;
      var edges = adjList[ag.fromNode];

      var forward = [];
      for (var e = 0; e < edges.length; e++) {
        if (edges[e].to === ag.prevNode) continue;
        var dp = nodePos(nodes[edges[e].to], base);
        if (Math.abs(dp.x + geo.ox) <= halfW && Math.abs(dp.y + geo.oy) <= halfH) forward.push(edges[e]);
      }
      if (forward.length > 0) {
        return forward[Math.floor(ag.rng() * forward.length)];
      }

      for (var e = 0; e < edges.length; e++) {
        if (edges[e].to !== ag.prevNode) continue;
        var bp = nodePos(nodes[edges[e].to], base);
        if (Math.abs(bp.x + geo.ox) <= halfW && Math.abs(bp.y + geo.oy) <= halfH) {
          return { to: edges[e].to, type: edges[e].type, deadEnd: edges.length === 1 };
        }
      }

      var best = edges[0], bestOver = Infinity;
      for (var e = 0; e < edges.length; e++) {
        var op = nodePos(nodes[edges[e].to], base);
        var over = Math.max(Math.abs(op.x + geo.ox) - halfW, 0) +
                   Math.max(Math.abs(op.y + geo.oy) - halfH, 0);
        if (over < bestOver) { bestOver = over; best = edges[e]; }
      }
      return best;
    }

    /* Pellet eating: agents dim dots as they pass; dots return ~4s later.
     * The drawn maze (mounted by mountMazes from the same config) tags
     * every dot with a data-dot key matching the graph coordinates. */
    var dotMap = {};
    document.querySelectorAll(".hero-maze-bg [data-dot]").forEach(function (el) {
      dotMap[el.dataset.dot] = el;
    });
    var eatenDots = [];

    function eatDot(key, now) {
      var el = dotMap[key];
      if (!el || el.dataset.eaten === "1") return;
      el.dataset.eaten = "1";
      el.style.opacity = "0.06";
      eatenDots.push({ el: el, until: now + 4000 });
    }

    /* ---- Debug overlay (?mazedebug=1) ----------------------------------
     * Draws the navigation graph over the maze (edges, nodes, agent
     * targets) so any graph-vs-visual mismatch is immediately obvious,
     * plus runtime invariant checks that warn in the console. */
    var debug = new URLSearchParams(location.search).get("mazedebug") === "1";
    var dbgCanvas = null, dbgCtx = null, dbgFrame = 0;
    if (debug) {
      // Startup graph audit
      var zeroEdge = [];
      for (var n = 0; n < nodes.length; n++) {
        if (adjList[n].length === 0) zeroEdge.push(n);
      }
      if (zeroEdge.length > 0) {
        console.warn("[mazedebug] " + zeroEdge.length + " isolated node(s) with no edges (sealed pockets):", zeroEdge);
      } else {
        console.info("[mazedebug] graph OK: " + nodes.length + " nodes, no isolated nodes");
      }
      for (var n = 0; n < nodes.length; n++) {
        for (var e = 0; e < adjList[n].length; e++) {
          var m = adjList[n][e].to;
          if (adjList[n][e].type === "radial" && nodes[n].slot !== nodes[m].slot) {
            console.warn("[mazedebug] radial edge changes slot:", n, m);
          }
          if (adjList[n][e].type === "arc" && nodes[n].corridor !== nodes[m].corridor) {
            console.warn("[mazedebug] arc edge changes corridor:", n, m);
          }
        }
      }
      dbgCanvas = document.createElement("canvas");
      dbgCanvas.style.cssText = "position:absolute;inset:0;z-index:3;pointer-events:none;";
      hero.appendChild(dbgCanvas);
      dbgCtx = dbgCanvas.getContext("2d");
    }

    function drawDebug(rect, base, positions) {
      var w = Math.round(rect.width), h = Math.round(rect.height);
      if (dbgCanvas.width !== w || dbgCanvas.height !== h) {
        dbgCanvas.width = w; dbgCanvas.height = h;
      }
      var ctx = dbgCtx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.translate(w / 2, h / 2);

      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(13,148,136,0.45)";
      for (var aIdx = 0; aIdx < nodes.length; aIdx++) {
        var pa = nodePos(nodes[aIdx], base);
        for (var e = 0; e < adjList[aIdx].length; e++) {
          var bIdx = adjList[aIdx][e].to;
          if (bIdx < aIdx) continue;   // each edge once
          if (adjList[aIdx][e].type === "radial") {
            var pb = nodePos(nodes[bIdx], base);
            ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
          } else {
            var r = nodes[aIdx].rFrac * base;
            var a0 = nodes[aIdx].angle, da = nodes[bIdx].angle - a0;
            if (da > Math.PI) da -= TAU;
            if (da < -Math.PI) da += TAU;
            ctx.beginPath(); ctx.arc(0, 0, r, a0, a0 + da, da < 0); ctx.stroke();
          }
        }
      }
      for (var n = 0; n < nodes.length; n++) {
        var p = nodePos(nodes[n], base);
        ctx.fillStyle = adjList[n].length === 0 ? "#ef4444" : "rgba(15,23,42,0.55)";
        ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
      }
      ctx.strokeStyle = "rgba(249,112,102,0.8)";
      for (var i = 0; i < agents.length; i++) {
        var tp = nodePos(nodes[agents[i].toNode], base);
        ctx.beginPath(); ctx.moveTo(positions[i].x, positions[i].y);
        ctx.lineTo(tp.x, tp.y); ctx.stroke();
      }
    }

    function checkInvariants(base, halfW, halfH, positions) {
      for (var i = 0; i < agents.length; i++) {
        var ag = agents[i], p = positions[i];
        if (ag.edgeType === "arc") {
          var rNow = Math.sqrt(p.x * p.x + p.y * p.y);
          var rMid = nodes[ag.fromNode].rFrac * base;
          if (Math.abs(rNow - rMid) > 1) {
            console.warn("[mazedebug] agent " + i + " off corridor midline by " + (rNow - rMid).toFixed(1) + "px");
          }
        }
        if (Math.abs(p.x) > halfW + 12 || Math.abs(p.y) > halfH + 12) {
          console.warn("[mazedebug] agent " + i + " outside visible band:", p.x.toFixed(0), p.y.toFixed(0));
        }
      }
    }

    // Sparkle system
    var sparkles = [], globalRng = makeAgentRng(999);
    var sCont = document.createElement("div");
    sCont.className = "hero-sparkles";
    sCont.setAttribute("aria-hidden", "true");
    hero.appendChild(sCont);
    var sCooldown = {};

    function spawnSparkle(px, py) {
      for (var s = 0; s < 5; s++) {
        var dot = document.createElement("span");
        dot.className = "hero-sparkle";
        dot.style.left = "calc(50% + " + (px + (globalRng() - 0.5) * 30).toFixed(0) + "px)";
        dot.style.top  = "calc(50% + " + (py + (globalRng() - 0.5) * 30).toFixed(0) + "px)";
        sCont.appendChild(dot);
        sparkles.push({ el: dot, life: 0.5 });
      }
    }

    var prev = performance.now();

    // Corridor width in SVG units (between ring walls), used for sprite sizing
    var drU = (SVG_SIZE / 2 - (mazeCfg.strokeW || 6) - SVG_SIZE * 0.08) / (mazeCfg.rings || 7);
    var spriteW = 0;

    function tick(now) {
      var dt = (now - prev) / 1000;
      if (dt > 0.1) dt = 0.1;
      prev = now;

      var geo = measure();
      var base = geo.base;

      // Sprite size follows corridor width so agents always fit between
      // walls at any viewport size. DOM write only when the value changes.
      var clearPx = (drU - (mazeCfg.strokeW || 6)) * geo.pxPerUnit;
      var newW = Math.max(22, Math.min(42, Math.round(clearPx * 0.72)));
      if (newW !== spriteW) {
        spriteW = newW;
        for (var i = 0; i < agents.length; i++) {
          agents[i].el.style.width = spriteW + "px";
        }
      }

      // Visible bounds (computed ONCE per frame, used by all agents)
      var halfW = geo.halfW;
      var halfH = geo.halfH;

      var positions = [];

      for (var i = 0; i < agents.length; i++) {
        var ag  = agents[i];
        var nA = nodes[ag.fromNode], nB = nodes[ag.toNode];
        var len = edgeLen(nA, nB, ag.edgeType, base);
        if (len < 1) len = 1;

        // Dead-end "bonk": stand still (already flipped) until pause runs out
        if (ag.pause > 0) {
          ag.pause -= dt;
        } else {
          ag.t += (ag.speed * dt) / len;
        }

        while (ag.t >= 1) {
          ag.t -= 1;
          ag.prevNode = ag.fromNode;
          ag.fromNode = ag.toNode;

          var arrived = nodes[ag.fromNode];
          eatDot("d:" + arrived.corridor + ":" + arrived.slot, now);

          var pick = chooseNextEdge(ag, geo);
          ag.toNode   = pick.to;
          ag.edgeType = pick.type;

          if (pick.type === "radial") {
            // Trail dots through a ring gap are keyed by the OUTER corridor's
            // ring index (the ring being crossed)
            var ringIdx = Math.max(arrived.corridor, nodes[pick.to].corridor);
            eatDot("g:" + ringIdx + ":" + arrived.slot + ":0.25", now);
            eatDot("g:" + ringIdx + ":" + arrived.slot + ":0.5", now);
            eatDot("g:" + ringIdx + ":" + arrived.slot + ":0.75", now);
          }

          if (pick.deadEnd) {
            ag.pause = 0.2;
            ag.t = 0;
            break;
          }

          nA  = nodes[ag.fromNode]; nB = nodes[ag.toNode];
          len = edgeLen(nA, nB, ag.edgeType, base);
          if (len < 1) len = 1;
        }

        // Interpolate position on current edge
        nA = nodes[ag.fromNode]; nB = nodes[ag.toNode];
        var pos = edgePos(nA, nB, ag.t, ag.edgeType, base);

        // Always visible — never hide
        ag.el.style.visibility = "visible";
        var pos2 = edgePos(nA, nB, Math.min(ag.t + 0.05, 1), ag.edgeType, base);
        var flip = (pos2.x - pos.x) >= 0 ? 1 : -1;
        // Gentle per-agent bob for a retro "walk cycle" feel (visual only —
        // collision positions use the true path position)
        var bob = Math.sin(now * 0.008 + i * 1.7) * 1.5;
        ag.el.style.transform =
          "translate(calc(-50% + " + (pos.x + geo.ox).toFixed(1) + "px), calc(-50% + " +
          (pos.y + geo.oy + bob).toFixed(1) + "px)) scaleX(" + flip + ")";
        positions.push(pos);
      }

      // Collision bounce: only when two agents actually SHARE TRACK —
      // head-on on the same edge, or converging on the same node.
      // (A raw distance check would trigger straight through walls,
      // since corridors are wider apart than the collision radius.)
      var collDist = spriteW * 1.05;
      for (var i = 0; i < agents.length; i++) {
        for (var j = i + 1; j < agents.length; j++) {
          var ck = i + "-" + j;  // shared key for collision + sparkle
          if (!sCooldown[ck]) sCooldown[ck] = 0;
          sCooldown[ck] = Math.max(0, sCooldown[ck] - dt);
          if (sCooldown[ck] > 0) continue;

          var a = agents[i], b = agents[j];
          if (a.pause > 0 || b.pause > 0) continue;

          var headOn     = a.fromNode === b.toNode && a.toNode === b.fromNode;
          var converging = a.toNode === b.toNode && a.t > 0.75 && b.t > 0.75;
          if (!headOn && !converging) continue;

          var dx = positions[i].x - positions[j].x;
          var dy = positions[i].y - positions[j].y;
          var dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < collDist) {
            // Both reverse from where they are — no position jump
            var tA = a.fromNode; a.fromNode = a.toNode; a.toNode = tA;
            a.t = 1 - a.t;
            var tB = b.fromNode; b.fromNode = b.toNode; b.toNode = tB;
            b.t = 1 - b.t;

            sCooldown[ck] = 3;

            // Sparkle at collision point
            if (sparkles.length < 20) {
              spawnSparkle((positions[i].x + positions[j].x) / 2,
                           (positions[i].y + positions[j].y) / 2);
            }
          }
        }
      }

      if (debug) {
        drawDebug(hero.getBoundingClientRect(), base, positions);
        if (++dbgFrame % 30 === 0) checkInvariants(base, halfW, halfH, positions);
      }

      // Fade sparkles
      for (var s = sparkles.length - 1; s >= 0; s--) {
        sparkles[s].life -= dt;
        if (sparkles[s].life <= 0) { sparkles[s].el.remove(); sparkles.splice(s, 1); }
        else sparkles[s].el.style.opacity = Math.min(1, sparkles[s].life * 4);
      }

      // Restore eaten pellet dots (inline style cleared → SVG opacity returns)
      for (var d = eatenDots.length - 1; d >= 0; d--) {
        if (now >= eatenDots[d].until) {
          eatenDots[d].el.style.opacity = "";
          eatenDots[d].el.dataset.eaten = "";
          eatenDots.splice(d, 1);
        }
      }

      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ================================================================ */
  /*  Boot                                                             */
  /* ================================================================ */
  function init() {
    window.mountMazes();

    // Respect the OS "reduce motion" setting: draw the maze, place the agents
    // where they start, but never run the animation loop.
    var reduceMotion =
      window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      placeAgentsStatically();
      return;
    }

    animateHeroAgents();
  }

  /* Static fallback for reduced motion: spread the agents evenly around one
   * mid corridor so the hero still reads as "agents in a maze", with no
   * movement at all. */
  function placeAgentsStatically() {
    var mazeEl = document.querySelector(".hero-maze-bg[data-maze]");
    var container = document.querySelector(".hero-agents");
    if (!mazeEl || !container) return;

    var cfg;
    try { cfg = JSON.parse(mazeEl.dataset.maze); } catch (err) { return; }

    var hero = container.closest(".hero");
    var svgEl = mazeEl.querySelector("svg");
    if (!svgEl) return;

    // If the hero has not been laid out yet (zero width — e.g. the page was
    // loaded in a hidden container), every node would fail the on-screen test
    // and we would hide all ten agents with no way back. Wait for a real
    // layout instead. Unlike the animated path there is no per-frame loop
    // here to recover on its own.
    if (hero.getBoundingClientRect().width < 1) {
      if (typeof ResizeObserver === "function") {
        var ro = new ResizeObserver(function () {
          if (hero.getBoundingClientRect().width >= 1) {
            ro.disconnect();
            placeAgentsStatically();
          }
        });
        ro.observe(hero);
      } else {
        window.addEventListener("resize", function retry() {
          if (hero.getBoundingClientRect().width >= 1) {
            window.removeEventListener("resize", retry);
            placeAgentsStatically();
          }
        });
      }
      return;
    }

    var maze = buildMaze(cfg);
    // Same rule as the animated path: measure the rendered maze, never assume.
    var s = svgEl.getBoundingClientRect();
    var h = hero.getBoundingClientRect();
    var base = s.width / 2;
    var ox = s.left + s.width / 2 - (h.left + h.width / 2);
    var oy = s.top + s.height / 2 - (h.top + h.height / 2);
    var halfW = h.width / 2 - 30;
    var halfH = h.height / 2 - 30;

    var candidates = [];
    for (var n = 0; n < maze.nodes.length; n++) {
      if (maze.nodes[n].corridor < 3 || maze.nodes[n].corridor > (cfg.rings || 7) - 1) continue;
      var p = nodePos(maze.nodes[n], base);
      if (Math.abs(p.x + ox) <= halfW && Math.abs(p.y + oy) <= halfH) {
        candidates.push({ x: p.x + ox, y: p.y + oy });
      }
    }

    // Fall back to any on-screen node rather than leaving the hero empty.
    if (!candidates.length) {
      for (var f = 0; f < maze.nodes.length; f++) {
        var fp = nodePos(maze.nodes[f], base);
        if (Math.abs(fp.x + ox) <= halfW && Math.abs(fp.y + oy) <= halfH) {
          candidates.push({ x: fp.x + ox, y: fp.y + oy });
        }
      }
    }

    var els = container.querySelectorAll(".hero-agent");
    for (var i = 0; i < els.length; i++) {
      if (!candidates.length) { els[i].style.display = "none"; continue; }
      var p = candidates[Math.floor((i / els.length) * candidates.length)];
      els[i].style.transform =
        "translate(calc(-50% + " + p.x.toFixed(1) + "px), calc(-50% + " + p.y.toFixed(1) + "px))";
    }
  }
  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
})();
