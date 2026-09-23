/* Civil Unrest Digital Edition — UI rendering (DOM + SVG).
 * Board art mirrors the physical Civil_Unrest_Board_Final.svg /
 * "Civil Unrest.png": parchment base, overlapping category circles on a
 * perimeter loop, central CIVIL UNREST fist emblem + six legend boxes,
 * and a 0-100 unrest meter around the outer edge. */
window.CU_UI = (function () {
  "use strict";

  var BOARD = window.CU_BOARD;
  var CARDS = window.CU_CARDS;
  var CATS = CARDS.categories;

  var NS = "http://www.w3.org/2000/svg";

  /* Identity token of the last landing we showed a score-pop for, so the
     animation plays once per drawn card instead of replaying on every render. */
  var _lastLanded = null;

  /* ---------- helpers ---------- */

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function svgEl(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function svgText(parent, x, y, str, attrs) {
    var t = svgEl("text", attrs || {});
    t.setAttribute("x", x);
    t.setAttribute("y", y);
    t.textContent = str;
    parent.appendChild(t);
    return t;
  }

  function meterColor(u) {
    if (u < 30) return "#27ae60";
    if (u < 60) return "#f1c40f";
    if (u < 85) return "#e67e22";
    return "#c0392b";
  }

  function dicePips(n) {
    var map = {
      1: [5], 2: [3, 7], 3: [3, 5, 7], 4: [1, 3, 7, 9],
      5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9]
    };
    return map[n] || [];
  }

  function diceHTML(values, small) {
    return values.map(function (v) {
      var pips = dicePips(v);
      var cells = [];
      for (var i = 1; i <= 9; i++) {
        cells.push('<div class="pip' + (pips.indexOf(i) >= 0 ? ' on' : '') + '"><span></span></div>');
      }
      return '<div class="die' + (small ? ' small' : '') + '">' + cells.join("") + "</div>";
    }).join("");
  }

  /* ---------- physical-board pieces ---------- */

  var LEGEND = [
    { key: "orange", title: ["Demographics", "& Immigration"],
      items: ["Aging Population", "Brain Drain", "Refugee Wave", "Birth Rate Crash", "Skilled Migration"],
      x: 245, y: 318 },
    { key: "purple", title: ["Global Influence", "& Foreign Meddling"],
      items: ["Proxy War", "Sanctions", "Cyberattack", "Trade War", "Populist Wave"],
      x: 755, y: 318 },
    { key: "yellow", title: ["Natural Disasters", "& Climate Events"],
      items: ["Hurricane", "Wildfires", "Drought", "Floodplain Crisis", "Food Shortage"],
      x: 245, y: 448 },
    { key: "blue", title: ["Civil Discord", "& Identity Politics"],
      items: ["Election Misinformation", "Mass Protest", "Ethnic Tension", "Censorship Backlash"],
      x: 755, y: 448 },
    { key: "green", title: ["Economic Pressure"],
      items: ["Inflation Surge", "Debt Crisis", "Housing Bubble", "Default Risk", "Tax Revolt"],
      x: 245, y: 578 },
    { key: "red", title: ["Resource Tokens", "Reform"],
      items: ["Currency", "Labor", "Public Trust", "Infrastructure"],
      x: 755, y: 578 }
  ];

  function drawLegendBox(g, box) {
    var cat = CATS[box.key] || { color: "#888", name: box.key };
    var w = 200, h = 108;
    var bg = svgEl("rect", {
      x: box.x, y: box.y, width: w, height: h,
      fill: cat.color, stroke: "#1a1a1a", "stroke-width": 2
    });
    g.appendChild(bg);
    var cx = box.x + w / 2;
    box.title.forEach(function (line, i) {
      svgText(g, cx, box.y + 20 + i * 16, line, {
        "text-anchor": "middle", fill: "#fff",
        "font-size": 13, "font-weight": 700, "font-family": "Oswald, sans-serif"
      });
    });
    var top = box.y + 20 + box.title.length * 16 + 2;
    box.items.forEach(function (line, i) {
      svgText(g, cx, top + i * 13, line, {
        "text-anchor": "middle", fill: "#1a1a1a", "font-size": 10.5
      });
    });
  }

  function drawCenter(g) {
    svgText(g, 600, 285, "CIVIL UNREST", {
      "text-anchor": "middle", fill: "#1a1a1a",
      "font-size": 62, "font-weight": 700,
      "font-family": "Oswald, sans-serif", "letter-spacing": 4
    });
    /* Black fist emblem with dice, like the physical center. */
    g.appendChild(svgEl("circle", {
      cx: 600, cy: 452, r: 118, fill: "#111111",
      stroke: "#000000", "stroke-width": 5
    }));
    svgText(g, 585, 510, "✊", {
      "text-anchor": "middle", fill: "#e9ddaf", "font-size": 118
    });
    /* Two small dice beside the fist. */
    [[648, 492, -12], [672, 508, 10]].forEach(function (cfg) {
      var dg = svgEl("g", { transform: "translate(" + cfg[0] + "," + cfg[1] + ") rotate(" + cfg[2] + ")" });
      dg.appendChild(svgEl("rect", { x: -13, y: -13, width: 26, height: 26, rx: 5, fill: "#fff", stroke: "#000", "stroke-width": 1.5 }));
      [[-5, -5], [5, 5], [5, -5]].forEach(function (pt) {
        dg.appendChild(svgEl("circle", { cx: pt[0], cy: pt[1], r: 2.6, fill: "#111" }));
      });
      g.appendChild(dg);
    });
    LEGEND.forEach(function (b) { drawLegendBox(g, b); });
  }

  /* Outer 0-100 unrest meter: segmented green->yellow->orange->red bars
     with ticks every 10 and red-fist corners, like the physical rim. */
  function unrestSegColor(v) {
    if (v < 50) return "#57b32e";
    if (v < 65) return "#efe16e";
    if (v < 80) return "#f5a742";
    return "#c62f26";
  }

  function drawMeterBars(g) {
    var x0 = 92, x1 = 1108, yB = 848, yT = 52, xl = 52, xr = 1148, yt0 = 92, yt1 = 808;

    function hBar(y, flip) {
      for (var v = 0; v < 100; v++) {
        var a = x0 + (v / 100) * (x1 - x0);
        var b = x0 + ((v + 1) / 100) * (x1 - x0);
        var seg = svgEl("line", {
          x1: flip ? x1 - (a - x0) : a, x2: flip ? x1 - (b - x0) : b,
          y1: y, y2: y, stroke: unrestSegColor(v), "stroke-width": 15
        });
        g.appendChild(seg);
      }
      g.appendChild(svgEl("line", { x1: x0, x2: x1, y1: y - 8, y2: y - 8, stroke: "#1a1a1a", "stroke-width": 2 }));
      g.appendChild(svgEl("line", { x1: x0, x2: x1, y1: y + 8, y2: y + 8, stroke: "#1a1a1a", "stroke-width": 2 }));
      for (var t = 0; t <= 100; t += 10) {
        var px = flip ? x1 - (t / 100) * (x1 - x0) : x0 + (t / 100) * (x1 - x0);
        g.appendChild(svgEl("line", { x1: px, x2: px, y1: y - 8, y2: y + 8, stroke: "#1a1a1a", "stroke-width": 2 }));
        if (t % 20 === 0 && t !== 0 && t !== 100) {
          svgText(g, px, y + (y > 400 ? 30 : -16), String(t), {
            "text-anchor": "middle", fill: "#1a1a1a", "font-size": 13, "font-weight": 700
          });
        }
      }
    }

    function vBar(x, flip) {
      for (var v = 0; v < 100; v++) {
        var a = yt0 + (v / 100) * (yt1 - yt0);
        var b = yt0 + ((v + 1) / 100) * (yt1 - yt0);
        var y1 = flip ? yt1 - (a - yt0) : a;
        var y2 = flip ? yt1 - (b - yt0) : b;
        g.appendChild(svgEl("line", {
          x1: x, x2: x, y1: y1, y2: y2,
          stroke: unrestSegColor(v), "stroke-width": 15
        }));
      }
      g.appendChild(svgEl("line", { x1: x - 8, x2: x - 8, y1: yt0, y2: yt1, stroke: "#1a1a1a", "stroke-width": 2 }));
      g.appendChild(svgEl("line", { x1: x + 8, x2: x + 8, y1: yt0, y2: yt1, stroke: "#1a1a1a", "stroke-width": 2 }));
      for (var t = 0; t <= 100; t += 10) {
        var py = flip ? yt1 - (t / 100) * (yt1 - yt0) : yt0 + (t / 100) * (yt1 - yt0);
        g.appendChild(svgEl("line", { x1: x - 8, x2: x + 8, y1: py, y2: py, stroke: "#1a1a1a", "stroke-width": 2 }));
        if (t % 20 === 0 && t !== 0 && t !== 100) {
          svgText(g, x + (x < 600 ? -20 : 20), py + 4, String(t), {
            "text-anchor": "middle", fill: "#1a1a1a", "font-size": 13, "font-weight": 700
          });
        }
      }
    }

    hBar(yB, false);
    hBar(yT, true);
    vBar(xl, false);
    vBar(xr, true);

    /* Red fist corners (collapse) + small green zero dots. */
    [[52, 52], [1148, 52], [52, 848], [1148, 848]].forEach(function (pt) {
      g.appendChild(svgEl("circle", {
        cx: pt[0], cy: pt[1], r: 30, fill: "#b23727",
        stroke: "#1a1a1a", "stroke-width": 3
      }));
      svgText(g, pt[0], pt[1] + 9, "✊", {
        "text-anchor": "middle", fill: "#fff", "font-size": 26
      });
    });
    [[100, 52], [1100, 848], [52, 800], [1148, 100]].forEach(function (pt) {
      g.appendChild(svgEl("circle", {
        cx: pt[0], cy: pt[1], r: 13, fill: "#57b32e",
        stroke: "#1a1a1a", "stroke-width": 2
      }));
      svgText(g, pt[0], pt[1] + 5, "✊", {
        "text-anchor": "middle", fill: "#fff", "font-size": 12
      });
    });
  }

  function drawPlayerUnrestMarkers(g, state) {
    var x0 = 92, x1 = 1108, yB = 848;
    state.players.forEach(function (p, idx) {
      var px = x0 + Math.max(0, Math.min(100, p.unrest)) / 100 * (x1 - x0);
      var py = yB + 20 + (idx % 2) * 12;
      var mk = svgEl("g", { class: "unrest-marker" });
      mk.appendChild(svgEl("circle", {
        cx: px, cy: py, r: 9, fill: p.color,
        stroke: "#fff", "stroke-width": 2
      }));
      mk.appendChild(svgEl("circle", {
        cx: px, cy: py, r: 11.5, fill: "none",
        stroke: "#1a1a1a", "stroke-width": 1.5
      }));
      var label = svgEl("title", {});
      label.textContent = p.name + ": " + p.unrest;
      mk.appendChild(label);
      g.appendChild(mk);
    });
  }

  /* ---------- board ---------- */

  function renderBoard(svg, state) {
    svg.setAttribute("viewBox", "0 0 " + BOARD.width + " " + BOARD.height);
    svg.textContent = "";

    var g = svgEl("g", {});
    svg.appendChild(g);

    /* parchment base */
    g.appendChild(svgEl("rect", {
      x: 0, y: 0, width: BOARD.width, height: BOARD.height,
      rx: 14, fill: "#e9ddaf", stroke: "#1a1a1a", "stroke-width": 3
    }));

    drawMeterBars(g);
    drawCenter(g);

    /* faint connector under the circles so the travel path reads */
    var d = [];
    BOARD.spaces.forEach(function (sp, i) {
      if (i === 0) d.push("M" + sp.x + "," + sp.y);
      else d.push("L" + sp.x + "," + sp.y);
    });
    d.push("Z");
    g.appendChild(svgEl("path", {
      d: d.join(" "), fill: "none", stroke: "#8a7f5a",
      "stroke-width": 5, "stroke-dasharray": "2 10",
      "stroke-linecap": "round", opacity: 0.55
    }));

    var landedIdx = state.landed ? state.position : -1;

    BOARD.spaces.forEach(function (sp, i) {
      var kind = sp.kind;
      var cat = CATS[kind] || { name: sp.label, color: "#444" };
      var isStart = (kind === "start");
      var isBlack = (kind === "black");
      var isLogo = (kind === "logo");
      var r = sp.r || 40;
      var fill = isStart ? "#b23727" : (isLogo ? "#e9ddaf" : cat.color);

      var c = svgEl("g", { class: "board-space" });
      /* soft shadow for the overlapping-circle print look */
      c.appendChild(svgEl("circle", {
        cx: sp.x + 2, cy: sp.y + 3, r: r, fill: "#000", opacity: 0.18
      }));
      var circ = svgEl("circle", {
        cx: sp.x, cy: sp.y, r: r, fill: fill,
        stroke: "#1a1a1a", "stroke-width": 3
      });
      if (landedIdx === i) {
        circ.setAttribute("stroke", "#ffffff");
        circ.setAttribute("stroke-width", 5);
      }
      c.appendChild(circ);
      var title = svgEl("title", {});
      title.textContent = (isStart ? "START (relief)" : cat.name + (sp.value ? " " + (sp.value > 0 ? "+" : "") + sp.value : ""));
      c.appendChild(title);

      if (isStart) {
        svgText(c, sp.x, sp.y - 12, "START", {
          "text-anchor": "middle", fill: "#fff",
          "font-size": 22, "font-weight": 700, "font-family": "Oswald, sans-serif", "letter-spacing": 2
        });
        svgText(c, sp.x, sp.y + 26, "✊", {
          "text-anchor": "middle", fill: "#e9ddaf", "font-size": 40
        });
        svgText(c, sp.x, sp.y + 46, "relief", {
          "text-anchor": "middle", fill: "rgba(255,255,255,0.9)",
          "font-size": 12, "font-style": "italic"
        });
      } else if (isBlack) {
        svgText(c, sp.x, sp.y + 14, "✊", {
          "text-anchor": "middle", fill: "#e9ddaf", "font-size": 42
        });
      } else if (isLogo) {
        svgText(c, sp.x, sp.y + 14, "✊", {
          "text-anchor": "middle", fill: "#1a1a1a", "font-size": 40
        });
        svgText(c, sp.x, sp.y + 30, "relief", {
          "text-anchor": "middle", fill: "#1a1a1a", "font-size": 10, "font-style": "italic"
        });
      } else if (sp.value === 0) {
        svgText(c, sp.x, sp.y + 10, "★", {
          "text-anchor": "middle", fill: "#fff", "font-size": Math.round(r * 0.9)
        });
      } else {
        var fs = Math.round(r * (Math.abs(sp.value) >= 5 ? 0.85 : 0.95));
        svgText(c, sp.x, sp.y + Math.round(fs * 0.36), (sp.value > 0 ? "+" : "") + sp.value, {
          "text-anchor": "middle", fill: "#fff",
          "font-size": fs, "font-weight": 800,
          "font-family": "Oswald, Open Sans, sans-serif",
          "stroke": "rgba(0,0,0,0.25)", "stroke-width": 0.5
        });
      }
      g.appendChild(c);
    });

    /* player tokens clustered on their space, like tabletop pawns */
    var counts = {};
    state.players.forEach(function (p) { counts[p.position] = (counts[p.position] || 0) + 1; });
    var placed = {};
    state.players.forEach(function (p) {
      var sp = BOARD.spaces[p.position];
      if (!sp) return;
      var n = counts[p.position] || 1;
      placed[p.position] = placed[p.position] || 0;
      var slot = placed[p.position]++;
      var ang = n === 1 ? -Math.PI / 2 : (slot / n) * Math.PI * 2 - Math.PI / 2;
      var rad = n === 1 ? 0 : Math.min(20, 8 + n * 2);
      var tx = sp.x + Math.cos(ang) * rad;
      var ty = sp.y + Math.sin(ang) * rad;
      var t = svgEl("g", { class: "board-token" + (p.index === state.current ? " current" : ""), "data-pidx": p.index });
      t.appendChild(svgEl("circle", {
        cx: tx + 1.5, cy: ty + 2, r: 13, fill: "#000", opacity: 0.3
      }));
      t.appendChild(svgEl("circle", {
        cx: tx, cy: ty, r: 13, fill: p.color,
        stroke: "#1a1a1a", "stroke-width": 2.5
      }));
      t.appendChild(svgEl("circle", {
        cx: tx, cy: ty, r: 10.5, fill: "none",
        stroke: p.alive ? "#fff" : "#555", "stroke-width": 1.5
      }));
      var letter = svgEl("text", {
        x: tx, y: ty + 4.5, "text-anchor": "middle",
        fill: "#fff", "font-size": 12, "font-weight": 800,
        "font-family": "Oswald, sans-serif"
      });
      letter.textContent = p.name.charAt(0).toUpperCase();
      t.appendChild(letter);
      var tip = svgEl("title", {});
      tip.textContent = p.name + " (" + p.unrest + ")";
      t.appendChild(tip);
      if (!p.alive) t.setAttribute("opacity", "0.35");
      g.appendChild(t);
    });

    drawPlayerUnrestMarkers(g, state);

    /* score pop: when a card is freshly drawn, the landed circle lifts
       off the board for ~1.5s, then settles back. */
    var landed = state.landed;
    if (landed && !landed.relief && landed.cards && landed.cards.length &&
        landed !== _lastLanded) {
      _lastLanded = landed;
      var lsp = BOARD.spaces[state.position];
      if (lsp) {
        var pcat = CATS[landed.kind] || { color: "#444", name: "" };
        var delta = state.lastDelta ? state.lastDelta.amount : lsp.value;
        var pop = svgEl("g", { class: "score-pop" });
        pop.appendChild(svgEl("circle", {
          class: "pop-rect",
          cx: lsp.x, cy: lsp.y, r: (lsp.r || 40) + 4,
          fill: pcat.color, stroke: "#fff", "stroke-width": 4
        }));
        var pt = svgEl("text", {
          x: lsp.x, y: lsp.y + 15, "text-anchor": "middle",
          fill: "#fff", "font-size": 44, "font-weight": 800
        });
        pt.textContent = (delta > 0 ? "+" : "") + delta;
        pop.appendChild(pt);
        g.appendChild(pop);
      }
    }
  }

  /* Hop a pawn space-by-space from `fromIdx` to `toIdx` without mutating
     game state, so movement reads like a tabletop piece travelling the rim.
     Calls done() when the hop finishes. */
  function animateHop(svg, state, pIdx, fromIdx, toIdx, done) {
    var len = BOARD.trackLength;
    var steps = (toIdx - fromIdx + len) % len;
    if (!steps) { if (done) done(); return; }
    var player = state.players[pIdx];
    var i = 0;
    function hop() {
      renderBoard(svg, state);
      var root = svg.querySelector("g");
      var idx = (fromIdx + i) % len;
      var sp = BOARD.spaces[idx];
      if (root && sp) {
        var ghost = svgEl("g", { class: "board-token hopping" });
        ghost.appendChild(svgEl("circle", {
          cx: sp.x, cy: sp.y - sp.r - 16, r: 14, fill: player.color,
          stroke: "#fff", "stroke-width": 3
        }));
        var txt = svgEl("text", {
          x: sp.x, y: sp.y - sp.r - 11, "text-anchor": "middle",
          fill: "#fff", "font-size": 13, "font-weight": 800
        });
        txt.textContent = player.name.charAt(0).toUpperCase();
        ghost.appendChild(txt);
        root.appendChild(ghost);
      }
      i++;
      if (i <= steps) {
        setTimeout(hop, 175);
      } else {
        setTimeout(function () { if (done) done(); }, 240);
      }
    }
    hop();
  }

  /* ---------- panels ---------- */

  function renderTurnControls(state, handlers) {
    var ctl = el("div", "board-controls");
    var cur = state.players[state.current];
    ctl.appendChild(el("div", "turn-title", cur.name + "'s turn"));

    if (state.phase === "rolled" || state.dice.length) {
      var diceWrap = el("div", "turn-dice");
      diceWrap.innerHTML = diceHTML(state.dice, true);
      ctl.appendChild(diceWrap);
    }

    var actions = el("div", "turn-actions");

    if (state.phase === "turn" && !cur.isAI) {
      var roll = el("button", "btn btn-primary", "Roll Dice");
      roll.onclick = handlers.onRoll;
      actions.appendChild(roll);
      if (cur.heldCards.length) {
        var hd = el("div", "p-held", "Held:");
        cur.heldCards.forEach(function (hc, i) {
          var chip = el("span", "chip", hc.card.text);
          var play = el("button", "", "Play (" + (hc.card.type === "election" ? hc.card.reduce + "/" + hc.card.reduce_held : hc.card.reduce) + ")");
          play.onclick = (function (idx) { return function () { handlers.onPlayHeld(idx); }; })(i);
          var wrap = el("span");
          wrap.appendChild(chip); wrap.appendChild(play);
          hd.appendChild(wrap);
        });
        actions.appendChild(hd);
      }
    } else if (state.phase === "rolled" && !cur.isAI) {
      var move = el("button", "btn btn-primary", "Move");
      move.onclick = handlers.onMove;
      actions.appendChild(move);
    } else if (state.phase === "landed" && !cur.isAI) {
      var res = el("button", "btn btn-primary", "Draw Card");
      res.onclick = handlers.onResolve;
      actions.appendChild(res);
    } else if (cur.isAI) {
      var aiLabel = el("div", "pai", "… " + cur.name + " is acting");
      actions.appendChild(aiLabel);
    }
    ctl.appendChild(actions);

    ctl.appendChild(el("div", "pai", "Round " + state.round + " · Turn " + state.turn));
    return ctl;
  }

  /* Drop the turn controls into the bottom-right panel next to the event card. */
  function attachTurnPanel(panel, node) {
    panel.textContent = "";
    panel.appendChild(node);
  }

  function renderPlayers(panel, state) {
    panel.textContent = "";
    panel.appendChild(el("h3", "", "Players"));
    state.players.forEach(function (p) {
      var row = el("div", "player-row" +
        (p.index === state.current ? " current" : "") +
        (p.alive ? "" : " eliminated"));
      row.appendChild(el("span", "dot")).style.background = p.color;
      var name = el("span", "pname", p.name);
      if (p.isAI) name.appendChild(el("span", "pai", " · AI"));
      row.appendChild(name);

      var meter = el("div", "meter");
      var fill = el("div", "fill");
      fill.style.width = p.unrest + "%";
      fill.style.background = meterColor(p.unrest);
      meter.appendChild(fill);
      meter.appendChild(el("span", "val", String(p.unrest)));
      meter.appendChild(el("span", "scale", "100"));
      row.appendChild(meter);

      if (p.heldCards.length) {
        var hd = el("div", "p-held", "");
        p.heldCards.forEach(function (hc) {
          var chip = el("span", "chip", hc.card.text);
          if (hc.card.type === "election" && hc.turnsHeld < 3) {
            chip.textContent += " (" + (3 - hc.turnsHeld) + " turns)";
          }
          hd.appendChild(chip);
        });
        row.appendChild(hd);
      }

      if (!p.alive) row.appendChild(el("span", "pai", "COLLAPSED"));
      panel.appendChild(row);
    });
  }

  function renderCardArea(area, state) {
    area.textContent = "";
    var headRow = el("div", "event-head");
    headRow.appendChild(el("h3", "", "Event"));
    var landed = state.landed;
    if (!landed || !landed.cards || !landed.cards.length) {
      headRow.appendChild(el("p", "card-none", "Land on a space to draw an event card."));
      area.appendChild(headRow);
      return;
    }
    var who = state.players[state.current];
    var label = el("p", "", (who ? who.name + " landed" : "Drawn") + " — " +
      ((landed.kind && CATS[landed.kind]) ? CATS[landed.kind].name : "relief") + ".");
    var d = state.lastDelta;
    if (d && d.amount !== 0) {
      label.textContent += "  Unrest " + (d.amount > 0 ? "+" : "") + d.amount + ".";
    }
    headRow.appendChild(label);
    area.appendChild(headRow);
    landed.cards.forEach(function (card) {
      if (!card) return;
      var cat = CATS[card.category] || { color: "#888", name: card.category };
      var cardEl = el("div", "event-card");
      var head = el("div", "head", cat.name);
      head.style.background = cat.color;
      cardEl.appendChild(head);
      var body = el("div", "body");
      body.appendChild(el("div", "text", card.text));
      if (card.instruction) body.appendChild(el("div", "inst", card.instruction));
      if (card.tribute) body.appendChild(el("div", "tribute", "† " + card.tribute));
      cardEl.appendChild(body);
      area.appendChild(cardEl);
    });
  }

  function renderLog(logBox, state) {
    var added = state.log.length - (logBox._count || 0);
    if (added < 0) { logBox.textContent = ""; logBox._count = 0; }
    for (var i = logBox._count; i < state.log.length; i++) {
      var line = state.log[i];
      var div = el("div", "log-line");
      var cls = "";
      if (/^—/.test(line.text)) cls = "turn";
      else if (/collaps|Eliminated/i.test(line.text)) cls = "collapse";
      else if (/relief/i.test(line.text)) cls = "relief";
      if (cls) div.className = "log-line " + cls;
      div.textContent = line.text;
      logBox.appendChild(div);
    }
    logBox._count = state.log.length;
    logBox.scrollTop = logBox.scrollHeight;
  }

  /* ---------- modal ---------- */

  function openModal(html) {
    var backdrop = document.getElementById("modal-backdrop");
    document.getElementById("modal").innerHTML = html;
    backdrop.classList.remove("hidden");
    return backdrop;
  }

  function closeModal() {
    document.getElementById("modal-backdrop").classList.add("hidden");
  }

  return {
    renderBoard: renderBoard,
    animateHop: animateHop,
    renderTurnControls: renderTurnControls,
    attachTurnPanel: attachTurnPanel,
    renderPlayers: renderPlayers,
    renderCardArea: renderCardArea,
    renderLog: renderLog,
    openModal: openModal,
    closeModal: closeModal,
    diceHTML: diceHTML,
    meterColor: meterColor
  };
})();
