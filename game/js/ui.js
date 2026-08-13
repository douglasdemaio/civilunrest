/* Civil Unrest Digital Edition — UI rendering (DOM + SVG). */
window.CU_UI = (function () {
  "use strict";

  var BOARD = window.CU_BOARD;
  var CARDS = window.CU_CARDS;
  var CATS = CARDS.categories;

  var NS = "http://www.w3.org/2000/svg";

  var SPACE_W = 112, SPACE_H = 92;

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

  /* ---------- board ---------- */

  function renderBoard(svg, state) {
    svg.textContent = "";

    var g = svgEl("g", {});
    svg.appendChild(g);

    /* background */
    g.appendChild(svgEl("rect", { x: 0, y: 0, width: 1160, height: 800, rx: 14, fill: "#23211a", stroke: "#000" }));

    /* serpentine track path */
    var d = [];
    BOARD.spaces.forEach(function (sp, i) {
      var px = sp.x, py = sp.y;
      if (i === 0) d.push("M" + px + "," + py);
      else d.push("L" + px + "," + py);
    });
    g.appendChild(svgEl("path", {
      d: d.join(" "), fill: "none", stroke: "#14130e", "stroke-width": 52,
      "stroke-linecap": "round", "stroke-linejoin": "round", opacity: 0.9
    }));
    g.appendChild(svgEl("path", {
      d: d.join(" "), fill: "none", stroke: "rgba(247,231,117,0.14)", "stroke-width": 1,
      "stroke-dasharray": "4 6"
    }));

    var landedIdx = state.landed ? state.position : -1;

    BOARD.spaces.forEach(function (sp, i) {
      var kind = sp.kind;
      var cat = CATS[kind] || { name: sp.label, color: "#444" };
      var isStart = (kind === "start");
      var isBlack = (kind === "black");
      var isLogo = (kind === "logo");
      var fill = isStart ? "#16150f" : cat.color;

      var c = svgEl("g", { class: "board-space" });
      var rect = svgEl("rect", {
        x: sp.x - SPACE_W / 2, y: sp.y - SPACE_H / 2,
        width: SPACE_W, height: SPACE_H, rx: 10,
        fill: fill, stroke: "rgba(255,255,255,0.4)", "stroke-width": 1.5
      });
      if (landedIdx === i) {
        rect.setAttribute("stroke", "#fff");
        rect.setAttribute("stroke-width", 4);
      }
      c.appendChild(rect);

      /* space center icon */
      var icon = null;
      if (isStart) icon = "START";
      else if (isBlack) icon = "✊";
      else if (isLogo) icon = "CU";
      if (icon) {
        c.appendChild(svgEl("text", {
          x: sp.x, y: sp.y - 6, "text-anchor": "middle",
          fill: "#fff", "font-size": isStart ? 20 : 22, "font-weight": 700,
          "font-family": "Oswald, sans-serif", "letter-spacing": 1
        })).textContent = icon;
      } else {
        /* value + short name */
        c.appendChild(svgEl("text", {
          x: sp.x, y: sp.y + 6, "text-anchor": "middle",
          fill: "#fff", "font-size": 34, "font-weight": 700
        })).textContent = "+" + sp.value;
      }
      c.appendChild(svgEl("text", {
        x: sp.x, y: sp.y + 28, "text-anchor": "middle",
        fill: "rgba(255,255,255,0.92)", "font-size": 11, "font-weight": 600
      })).textContent = (cat.short || kind).toUpperCase();

      g.appendChild(c);
    });

    /* player tokens */
    var counts = {};
    state.players.forEach(function (p) { counts[p.position] = (counts[p.position] || 0) + 1; });
    var placed = {};
    state.players.forEach(function (p) {
      var n = counts[p.position] || 1;
      var k = p.position;
      placed[k] = (placed[k] || 0);
      var slot = (placed[k] - (n - 1) / 2) * 16;
      placed[k]++;
      var sp = BOARD.spaces[p.position];
      if (!sp) return;
      var tx = sp.x + slot;
      var ty = sp.y + 34 + 8;
      var t = svgEl("g", { class: "board-token", "data-pidx": p.index });
      var ring = svgEl("circle", {
        cx: tx, cy: ty, r: 11,
        fill: p.color, stroke: p.alive ? "#fff" : "#555",
        "stroke-width": 2.5
      });
      t.appendChild(ring);
      var letter = svgEl("text", {
        x: tx, y: ty + 4, "text-anchor": "middle",
        fill: "#fff", "font-size": 12, "font-weight": 700
      });
      letter.textContent = p.name.charAt(0).toUpperCase();
      t.appendChild(letter);
      if (!p.alive) t.setAttribute("opacity", "0.35");
      g.appendChild(t);
    });

    /* score pop: when a card is freshly drawn, the landed space's color box
       and score lift off the board for ~1s, then settle back. */
    var landed = state.landed;
    if (landed && !landed.relief && landed.cards && landed.cards.length &&
        landed !== _lastLanded) {
      _lastLanded = landed;
      var sp = BOARD.spaces[state.position];
      if (sp) {
        var pcat = CATS[landed.kind] || { color: "#444", name: "" };
        var d = state.lastDelta ? state.lastDelta.amount : sp.value;
        var pop = svgEl("g", { class: "score-pop" });
        pop.appendChild(svgEl("rect", {
          class: "pop-rect",
          x: sp.x - SPACE_W / 2, y: sp.y - SPACE_H / 2,
          width: SPACE_W, height: SPACE_H, rx: 10,
          fill: pcat.color, stroke: "#fff", "stroke-width": 3
        }));
        var pt = svgEl("text", {
          x: sp.x, y: sp.y + 8, "text-anchor": "middle",
          fill: "#fff", "font-size": 42, "font-weight": 800
        });
        pt.textContent = (d > 0 ? "+" : "") + d;
        pop.appendChild(pt);
        g.appendChild(pop);
      }
    }
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
