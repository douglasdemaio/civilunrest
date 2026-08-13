/* Civil Unrest Digital Edition — wiring + game driver. */
(function () {
  "use strict";

  var E = window.CU_Engine;
  var AI = window.CU_AI;
  var UI = window.CU_UI;

  var state = null;
  var cfg = null;

  var boardSvg = document.getElementById("board");
  var playersPanel = document.getElementById("players-panel");
  var cardArea = document.getElementById("card-area");
  var turnPanel = document.getElementById("turn-panel");
  var logBox = document.getElementById("log");

  /* Pacing for the solo/hot-seat experience: each player's turn rotation is
     held on screen for TURN_HOLD so you can follow along, and an AI's
     roll / move / card draw happen as distinct steps AI_STEP apart. */
  var TURN_HOLD = 1500;
  var AI_STEP = 900;

  var PLAYER_COLORS = ["#e74c3c", "#2e86c1", "#27ae60", "#f39c12", "#8e44ad", "#16a085"];

  /* ---------------- setup screen ---------------- */

  var slotCount = 2;

  function renderSlots() {
    var wrap = document.getElementById("player-slots");
    wrap.textContent = "";
    for (var i = 0; i < slotCount; i++) {
      var row = document.createElement("div");
      row.className = "player-slot";
      var dot = document.createElement("span");
      dot.className = "pcolor";
      dot.style.background = PLAYER_COLORS[i % PLAYER_COLORS.length];
      var name = document.createElement("input");
      name.type = "text";
      name.placeholder = "Nation " + (i + 1) + " leader";
      name.value = "Player " + (i + 1);
      name.maxLength = 16;
      var type = document.createElement("select");
      type.innerHTML = '<option value="human">Human</option><option value="ai">AI</option>';
      type.dataset.slot = i;
      row.appendChild(dot);
      row.appendChild(name);
      row.appendChild(type);
      wrap.appendChild(row);
    }
    document.getElementById("add-player-btn").style.visibility = slotCount >= 6 ? "hidden" : "visible";
    document.getElementById("remove-player-btn").style.visibility = slotCount <= 1 ? "hidden" : "visible";
  }

  document.getElementById("add-player-btn").onclick = function () {
    if (slotCount < 6) { slotCount++; renderSlots(); }
  };
  document.getElementById("remove-player-btn").onclick = function () {
    if (slotCount > 1) { slotCount--; renderSlots(); }
  };

  document.getElementById("opt-twodice").addEventListener("change", function (e) {
    document.getElementById("twodice-mode").disabled = !e.target.checked;
  });

  document.getElementById("setup-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var slots = document.querySelectorAll("#player-slots .player-slot");
    var players = [];
    slots.forEach(function (slot) {
      var name = slot.querySelector('input[type="text"]').value.trim() || "Leader";
      var isAI = slot.querySelector("select").value === "ai";
      players.push({ name: name, isAI: isAI });
    });
    if (!players.some(function (p) { return !p.isAI; })) {
      UI.openModal('<h2>At least one human</h2><p>Add at least one Human player.</p><div class="modal-actions"><button class="btn" id="m-ok">OK</button></div>');
      document.getElementById("m-ok").onclick = UI.closeModal;
      return;
    }
    cfg = {
      players: players,
      twoDice: document.getElementById("opt-twodice").checked,
      twoDiceMode: document.getElementById("twodice-mode").value,
      crisisMode: document.getElementById("opt-crisis").checked,
      reformVictory: document.getElementById("opt-reform").checked,
      tyrantVictory: document.getElementById("opt-tyrant").checked,
      america: document.getElementById("opt-america").checked
    };
    startGame();
  });

  document.getElementById("newgame-btn").onclick = function () {
    UI.closeModal();
    showSetup();
  };

  document.getElementById("rules-btn").onclick = showRules;

  function showSetup() {
    state = null;
    document.getElementById("screen-setup").classList.add("active");
    document.getElementById("screen-game").classList.remove("active");
  }

  function startGame() {
    state = E.createGame(cfg);
    document.getElementById("screen-setup").classList.remove("active");
    document.getElementById("screen-game").classList.add("active");

    var rolls = state.players.map(function (p, i) {
      return p.name + " rolled " + state.startRolls[i] + (i === 0 ? " — goes first" : "");
    }).join("<br/>");
    UI.openModal(
      '<h2>Opening Gambit</h2><p>Each leader rolls for turn order:</p>' +
      '<p style="margin-top:8px">' + rolls + "</p>" +
      '<div class="modal-actions"><button class="btn btn-primary" id="m-begin">Begin</button></div>'
    );
    document.getElementById("m-begin").onclick = function () {
      UI.closeModal();
      pump();
    };
  }

  /* ---------------- driver ---------------- */

  function render() {
    UI.renderBoard(boardSvg, state);
    var controls = UI.renderTurnControls(state, {
      onRoll: function () { E.rollDice(state); pump(); },
      onMove: function () { E.move(state); pump(); },
      onResolve: function () { E.resolveLanding(state); pump(); },
      onPlayHeld: function (i) { E.playHeld(state, i); pump(); }
    });
    UI.attachTurnPanel(turnPanel, controls);
    UI.renderPlayers(playersPanel, state);
    UI.renderCardArea(cardArea, state);
    UI.renderLog(logBox, state);
  }

  function pump() {
    render();
    if (state.phase === "gameover") { showGameOver(); return; }

    if (state.phase === "choice" && state.pending) {
      if (state.players[state.pending.player].isAI) { E.declareVictory(state); pump(); return; }
      showVictoryChoice(state.pending);
      return;
    }
    if (state.phase === "crisis") { showCrisis(); return; }
    if (state.phase === "discard") {
      var di = E.nextPlayerForDiscard(state);
      var dp = state.players[di];
      if (dp.isAI) { E.resolveDiscard(state, dp.heldCards.length ? 0 : null); pump(); return; }
      showDiscardChoice(di);
      return;
    }
    if (state.phase === "hold") {
      var hf = state.pending.from;
      if (state.players[hf].isAI) { AI.aiTurn(state, hf); pump(); return; }
      showHoldChoice(state.pending);
      return;
    }
    if (state.phase === "target") {
      var df = state.pending.from;
      if (state.players[df].isAI) { AI.aiTurn(state, df); pump(); return; }
      showTargetChoice(state.pending);
      return;
    }

    var cur = state.players[state.current];
    if (!cur.isAI) return;

    if (state.phase === "turn") {
      /* rotation pause: show whose turn it is before the AI rolls */
      setTimeout(function () { AI.aiTurn(state, cur.index); pump(); }, TURN_HOLD);
    } else if (state.phase === "rolled") {
      setTimeout(function () { E.move(state); pump(); }, AI_STEP);
    } else if (state.phase === "landed") {
      setTimeout(function () { E.resolveLanding(state); pump(); }, AI_STEP);
    }
  }

  /* ---------------- modals ---------------- */

  function cardBlock(card) {
    var cat = window.CU_CARDS.categories[card.category] || { color: "#888", name: card.category };
    return '<div class="event-card modal-card"><div class="head" style="background:' + cat.color + '">' +
      cat.name + "</div><div class=\"body\"><div class=\"text\">" + escapeHtml(card.text) +
      "</div>" + (card.instruction ? '<div class="inst">' + escapeHtml(card.instruction) + "</div>" : "") +
      (card.tribute ? '<div class="tribute">† ' + escapeHtml(card.tribute) + "</div>" : "") +
      "</div></div>";
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function showHoldChoice(pending) {
    var card = pending.card;
    var reduce = pending.immediateReduce;
    var html = "<h2>Event Card</h2>" + cardBlock(card) + "<p>" +
      (pending.election
        ? "Play now to reduce unrest by " + pending.immediateReduce + ", or hold for " + pending.turnsToHold + " turns to reduce by " + pending.reduceHeld + "."
        : "Play now to reduce unrest by " + reduce + ", or hold it for a future turn.") +
      "</p><div class=\"modal-actions\">" +
      '<button class="btn btn-primary" id="m-now">Play Now (−' + reduce + ")</button>" +
      '<button class="btn" id="m-hold">Hold</button></div>';
    UI.openModal(html);
    document.getElementById("m-now").onclick = function () { UI.closeModal(); E.holdNow(state); pump(); };
    document.getElementById("m-hold").onclick = function () { UI.closeModal(); E.holdForLater(state); pump(); };
  }

  function showTargetChoice(pending) {
    var self = pending.self;
    var title = "";
    var intro = "";
    var legal = [];

    if (pending.type === "transferTarget") {
      title = "Transfer Card Effect";
      intro = "Transfer your next Purple card effect to another player:";
      state.players.forEach(function (p) {
        if (p.alive && p.index !== pending.from) legal.push(p.index);
      });
    } else {
      switch (pending.kind) {
        case "swap":
          title = "Swap Unrest Totals";
          intro = "Swap unrest totals with a player within ±" + pending.within + " points:";
          state.players.forEach(function (p) {
            if (p.alive && Math.abs(p.unrest - state.players[self].unrest) <= pending.within) legal.push(p.index);
          });
          break;
        case "chooseGain":
          title = "Direct Unrest";
          intro = "Choose a player to gain " + fmt(pending.effect.target) + " unrest (you gain " + fmt(pending.effect.self) + "):";
          state.players.forEach(function (p) { if (p.alive) legal.push(p.index); });
          break;
        case "selfGainTargetLose":
          title = "Assign Unrest";
          intro = "You gain " + fmt(pending.effect.self) + "; choose one player to lose " + (-pending.effect.target) + ":";
          state.players.forEach(function (p) { if (p.alive) legal.push(p.index); });
          break;
      }
    }

    var list = legal.map(function (i) {
      var p = state.players[i];
      return '<li class="target-item" data-i="' + i + '"><span class="dot" style="background:' + p.color + '"></span>' +
        escapeHtml(p.name) + " — " + p.unrest + " unrest</li>";
    }).join("");

    UI.openModal("<h2>" + title + "</h2><p>" + intro + "</p><ul class=\"target-list\">" + list + "</ul>");
    var items = document.querySelectorAll(".target-item");
    items.forEach(function (li) {
      li.onclick = function () {
        var i = parseInt(li.dataset.i, 10);
        UI.closeModal();
        if (pending.type === "transferTarget") E.resolveTransfer(state, i);
        else E.resolveTarget(state, i);
        pump();
      };
    });
  }

  function fmt(n) { return (n >= 0 ? "+" : "") + n; }

  function showDiscardChoice(pIdx) {
    var p = state.players[pIdx];
    var list = p.heldCards.map(function (hc, i) {
      return '<li class="discard-item" data-i="' + i + '">' + escapeHtml(hc.card.text) + "</li>";
    }).join("");
    UI.openModal("<h2>Discard a Held Card</h2><p>" + escapeHtml(p.name) + " must discard one held card:</p><ul class=\"target-list\">" + list + "</ul>");
    var items = document.querySelectorAll(".discard-item");
    items.forEach(function (li) {
      li.onclick = function () {
        UI.closeModal();
        E.resolveDiscard(state, parseInt(li.dataset.i, 10));
        pump();
      };
    });
  }

  function showCrisis() {
    var cursor = state.crisisCursor;
    var p = state.players[cursor];
    var name = p ? escapeHtml(p.name) : "?";
    UI.openModal(
      "<h2>Crisis Mode — Round " + state.pending.round + "</h2>" +
      "<p>Every 5 rounds, all nations face a climate disaster. Drawing a random Yellow card for <b>" + name + "</b>.</p>" +
      '<div class="modal-actions"><button class="btn btn-primary" id="m-crisis">Draw Yellow Card</button></div>'
    );
    document.getElementById("m-crisis").onclick = function () {
      E.runCrisis(state);
      if (state.phase === "crisis") { showCrisis(); } else { UI.closeModal(); pump(); }
    };
  }

  function showVictoryChoice(pending) {
    var p = state.players[pending.player];
    var kind = pending.type === "reformVictory" ? "Reform Victory" : "Tyrant Victory";
    var desc = pending.type === "reformVictory"
      ? "drew 3 reform cards in a row and reduced unrest below 20"
      : "added 25 unrest within 3 consecutive turns";
    UI.openModal(
      "<h2>" + kind + "</h2><p><b>" + escapeHtml(p.name) + "</b> " + desc + ".</p>" +
      "<p>Declare " + kind + " and win immediately, or continue playing.</p>" +
      '<div class="modal-actions">' +
      '<button class="btn btn-primary" id="m-declare">Declare Victory</button>' +
      '<button class="btn" id="m-continue">Continue Playing</button></div>'
    );
    document.getElementById("m-declare").onclick = function () { UI.closeModal(); E.declareVictory(state); pump(); };
    document.getElementById("m-continue").onclick = function () { UI.closeModal(); E.continueChoice(state); pump(); };
  }

  function showGameOver() {
    var html;
    if (state.winner != null) {
      var w = state.players[state.winner];
      html =
        "<h2>🎉 " + escapeHtml(w.name) + " Wins</h2>" +
        "<p>They outlasted every rival and kept their nation standing while the world burned. " +
        "The last stable nation endures.</p>";
    } else {
      html = "<h2>Total Collapse</h2><p>Every nation reached 100 unrest. The world fell into total chaos — no government survives.</p>";
    }
    var rows = state.players.map(function (p) {
      return '<div class="player-row"><span class="dot" style="background:' + p.color + '"></span>' +
        '<span class="pname">' + escapeHtml(p.name) + "</span><div class=\"meter\">" +
        '<div class="fill" style="width:' + p.unrest + '%;background:' + UI.meterColor(p.unrest) + '"></div>' +
        '<span class="val">' + p.unrest + '</span><span class="scale">100</span></div>' +
        (p.alive ? "" : '<span class="pai">COLLAPSED</span>') + "</div>";
    }).join("");
    html += "<div style=\"margin-top:12px\">" + rows + "</div>";
    html +=
      '<div class="modal-actions">' +
      '<button class="btn btn-primary" id="m-again">Play Again</button>' +
      '<button class="btn" id="m-setup">New Game Setup</button></div>' +
      '<p style="text-align:center;margin-top:14px">Prefer the tabletop? <a href="https://www.thegamecrafter.com/games/civil-unrest1" target="_blank" rel="noopener">Order the physical game</a>.</p>';
    UI.openModal(html);
    document.getElementById("m-again").onclick = function () { UI.closeModal(); startGame(); };
    document.getElementById("m-setup").onclick = function () { UI.closeModal(); showSetup(); };
  }

  function showRules() {
    UI.openModal(
      "<h2>Rules Summary</h2>" +
      "<ul class=\"rules-list\">" +
      "<li><b>Goal:</b> survive with your Unrest Meter below 100. Last stable nation wins.</li>" +
      "<li><b>Setup:</b> everyone starts at 0 unrest on START; highest opening roll goes first.</li>" +
      "<li><b>Turn:</b> roll the die, move forward on the board, land on a colored space and draw its event card.</li>" +
      "<li><b>Points:</b> apply the space value and the card instruction (add, subtract, multiply, or use card value). Unrest can't go below 0.</li>" +
      "<li><b>Green</b> Economic · <b>Yellow</b> Natural Disasters · <b>Blue</b> Civil Discord · <b>Purple</b> Global Interference · <b>Orange</b> Demographics · <b>Red</b> Reform.</li>" +
      "<li><b>Red reform cards</b> reduce unrest; some may be held and played on later turns.</li>" +
      "<li><b>Logo relief spaces</b> cause no events. Fist spaces activate the America expansion deck.</li>" +
      "<li><b>Collapse:</b> reach 100 unrest and you're eliminated.</li>" +
      "<li><b>Optional:</b> Reform Victory, Tyrant Victory, Crisis Mode, Two Dice Economy, America expansion.</li>" +
      "</ul>" +
      '<div class="modal-actions"><button class="btn" id="m-rules-ok">Got it</button></div>'
    );
    document.getElementById("m-rules-ok").onclick = UI.closeModal;
  }

  /* ---------------- init ---------------- */

  renderSlots();
  showSetup();
})();
