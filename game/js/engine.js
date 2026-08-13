/* Civil Unrest Digital Edition — pure game engine (no DOM).
 * Implements the rules from the "Civil Unrest: Rules Handbook":
 * movement on the serpentine track, card resolution, unrest tracking,
 * collapse, and the standard + optional victory conditions. */
window.CU_Engine = (function () {
  "use strict";

  var BOARD = window.CU_BOARD;
  var CARDS = window.CU_CARDS;
  var AMERICA = window.CU_AMERICA;

  var COLLAPSE = 100;

  var PLAYER_COLORS = ["#e74c3c", "#2e86c1", "#27ae60", "#f39c12", "#8e44ad", "#16a085"];
  var DECK_KEYS = ["green", "yellow", "blue", "purple", "orange", "red"];

  function shuffle(a) {
    var arr = a.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function clamp(n) { return Math.max(0, Math.min(COLLAPSE, n)); }

  function buildDecks(cfg) {
    var decks = {};
    DECK_KEYS.forEach(function (k) {
      decks[k] = { draw: shuffle(CARDS.decks[k]), discard: [] };
      if (cfg.america && AMERICA.decks[k] && AMERICA.decks[k].length) {
        decks[k].draw = shuffle(decks[k].draw.concat(AMERICA.decks[k]));
      }
    });
    if (cfg.america) {
      decks.black = { draw: shuffle(AMERICA.black), discard: [] };
    }
    return decks;
  }

  function drawFromDeck(state, key) {
    var deck = state.decks[key];
    if (!deck) return null;
    if (!deck.draw.length && deck.discard.length) {
      deck.draw = shuffle(deck.discard);
      deck.discard = [];
      pushLog(state, "Deck of " + key + " reshuffled from discards.");
    }
    if (!deck.draw.length) return null;
    var card = deck.draw.pop();
    return card;
  }

  function pushLog(state, text) {
    state.log.push({ turn: state.turn, round: state.round, text: text });
    if (state.log.length > 300) state.log.shift();
  }

  function playerByIdx(state, i) { return state.players[i]; }

  function alivePlayers(state) {
    return state.players.filter(function (p) { return p.alive; });
  }

  function addUnrest(state, pIdx, amount) {
    var p = playerByIdx(state, pIdx);
    var before = p.unrest;
    p.unrest = clamp(p.unrest + amount);
    var delta = p.unrest - before;
    if (amount !== 0) {
      pushLog(state, p.name + " unrest " + (delta >= 0 ? "+" + delta : delta) +
        " (" + p.unrest + "/" + COLLAPSE + ")");
    }
    state.lastDelta = { pIdx: pIdx, amount: delta };
    return delta;
  }

  function eliminate(state, pIdx) {
    var p = playerByIdx(state, pIdx);
    if (!p.alive) return;
    p.alive = false;
    pushLog(state, p.name + " reaches " + COLLAPSE + " unrest — government collapses. Eliminated.");
  }

  function checkStandardVictory(state) {
    var alive = alivePlayers(state);
    if (alive.length === 1) {
      state.winner = alive[0].index;
      state.phase = "gameover";
      return true;
    }
    if (alive.length === 0) {
      state.phase = "gameover";
      return true;
    }
    return false;
  }

  /* ---- card effect application ---- */

  function applyTargeted(state, from, self, effect) {
    var actions = effect.action;
    if (actions === "allOthers") {
      var val = effect.val;
      state.players.forEach(function (p) {
        if (p.index !== self && p.alive) addUnrest(state, p.index, val);
      });
      pushLog(state, "All other players gain " + (val >= 0 ? "+" : "") + val + " unrest.");
      return;
    }
    if (actions === "nextPurpleExtra") {
      state.globalExtraPurple = true;
      pushLog(state, "All players will draw an extra Purple card on their next Purple space.");
      return;
    }
    if (actions === "transferPurple") {
      var drawer = playerByIdx(state, from);
      drawer.pendingPurpleTransfer = true;
      pushLog(state, drawer.name + " may transfer their next Purple card effect to another player.");
      return;
    }
    if (actions === "discardAll") {
      var withCards = state.players.filter(function (p) {
        return p.alive && p.heldCards.length;
      }).map(function (p) { return p.index; });
      if (withCards.length) {
        state.pending = { type: "discards", players: withCards, cursor: 0 };
        state.phase = "discard";
        pushLog(state, "All players with held cards must discard one.");
      } else {
        pushLog(state, "Discard-all card drawn but nobody holds cards.");
      }
      return;
    }
    if (actions === "swap") {
      state.pending = { type: "target", from: from, self: self,
        kind: "swap", within: effect.within, card: null };
      state.phase = "target";
      return;
    }
    if (actions === "chooseGain") {
      state.pending = { type: "target", from: from, self: self,
        kind: "chooseGain", effect: effect, card: null };
      state.phase = "target";
      return;
    }
    if (actions === "selfGainTargetLose") {
      state.pending = { type: "target", from: from, self: self,
        kind: "selfGainTargetLose", effect: effect, card: null };
      state.phase = "target";
      return;
    }
    if (actions === "selfRemoveOthers") {
      var others = state.players.filter(function (p) {
        return p.index !== self && p.alive;
      }).map(function (p) { return p.index; });
      while (others.length < effect.count) others.push(self);
      var pick = others.slice(0, effect.count);
      addUnrest(state, self, effect.self);
      pick.forEach(function (o) { addUnrest(state, o, effect.others); });
      pushLog(state, "Self removes " + (-effect.self) + " unrest; assigns " + effect.others + " to two other players.");
      return;
    }
    pushLog(state, "Unrecognized card effect: " + actions);
  }

  /* Resolve a drawn (or held) card. Returns nothing; may set state.pending. */
  function applyCard(state, card, pIdx, opts) {
    opts = opts || {};
    var self = (opts.transferredFor != null) ? opts.transferredFor : pIdx;
    var spaceValue = (opts.spaceValue != null) ? opts.spaceValue : 0;
    var landed = opts.landed;
    var spv = 0;
    if (landed != null) spv = BOARD.valueOf(landed) || 0;
    var src = playerByIdx(state, self);

    if (card.tribute) {
      pushLog(state, "Tribute card: " + card.tribute + ".");
    }

    if (card.type === "targeted") {
      applyTargeted(state, pIdx, self, card.effect);
      return;
    }

    if (card.type === "mult") {
      var multDelta = Math.round(spv * card.mult);
      pushLog(state, card.text + " — space " + spv + " × " + card.mult + " = " + multDelta + " unrest.");
      addUnrest(state, self, multDelta);
      afterChange(state, self, card);
      return;
    }

    if (card.type === "add") {
      var addDelta = spv + card.add;
      pushLog(state, card.text + " — space " + spv + " " + (card.add >= 0 ? "+" : "") + card.add + " = " + addDelta + " unrest.");
      addUnrest(state, self, addDelta);
      afterChange(state, self, card);
      return;
    }

    if (card.type === "reduce") {
      if (card.hold && !opts.force) {
        state.pending = { type: "holdChoice", player: pIdx, card: card, from: pIdx,
          immediateReduce: card.reduce };
        state.phase = "hold";
        return;
      }
      pushLog(state, card.text + " — reduces unrest by " + card.reduce + ".");
      addUnrest(state, self, -card.reduce);
      afterChange(state, self, card);
      return;
    }

    if (card.type === "election") {
      if (!opts.force) {
        state.pending = { type: "holdChoice", player: pIdx, card: card, from: pIdx,
          election: true, immediateReduce: card.reduce, reduceHeld: card.reduce_held,
          turnsToHold: 3 };
        state.phase = "hold";
        return;
      }
      pushLog(state, card.text + " — reduces unrest by " + card.reduce_held + ".");
      addUnrest(state, self, -card.reduce_held);
      afterChange(state, self, card);
      return;
    }

    /* "space" / "Use Card Value" */
    if (opts.spaceValue != null && opts.landed == null) {
      spv = spaceValue;
    }
    pushLog(state, card.text + " — uses space value " + spv + " unrest.");
    addUnrest(state, self, spv);
    afterChange(state, self, card);
  }

  /* Reform-streak tracking for Reform Victory. */
  function afterChange(state, pIdx, card) {
    var p = playerByIdx(state, pIdx);
    var isReform = card.category === "red" &&
      (card.type === "reduce" || (card.type === "add" && card.add < 0));
    if (isReform) {
      p.reformStreak = (p.reformStreak || 0) + 1;
      pushLog(state, p.name + " reform streak: " + p.reformStreak + ".");
      if (state.cfg.reformVictory && p.reformStreak >= 3 && p.unrest < 20) {
        state.pending = { type: "reformVictory", player: pIdx };
        state.phase = "choice";
        return;
      }
    } else {
      p.reformStreak = 0;
    }
    afterCollapseCheck(state, pIdx);
  }

  function afterCollapseCheck(state, pIdx) {
    var p = playerByIdx(state, pIdx);
    if (p.alive && p.unrest >= COLLAPSE) {
      eliminate(state, pIdx);
      checkStandardVictory(state);
    }
  }

  /* Resolve a human/AI target selection. */
  function resolveTarget(state, targetIdx) {
    var pending = state.pending;
    if (!pending || pending.type !== "target") return;
    var self = pending.self;
    var effect = pending.effect;
    if (pending.kind === "swap") {
      var a = playerByIdx(state, self), b = playerByIdx(state, targetIdx);
      var t = a.unrest; a.unrest = b.unrest; b.unrest = t;
      pushLog(state, a.name + " swaps unrest totals with " + b.name + " (" + b.unrest + "/" + a.unrest + ").");
      afterCollapseCheck(state, self);
      afterCollapseCheck(state, targetIdx);
    } else if (pending.kind === "chooseGain") {
      pushLog(state, playerByIdx(state, self).name + " chooses " + playerByIdx(state, targetIdx).name +
        " (gains " + (effect.target >= 0 ? "+" : "") + effect.target + "); self gains " +
        (effect.self >= 0 ? "+" : "") + effect.self + ".");
      addUnrest(state, targetIdx, effect.target);
      addUnrest(state, self, effect.self);
      afterCollapseCheck(state, targetIdx);
      afterCollapseCheck(state, self);
    } else if (pending.kind === "selfGainTargetLose") {
      pushLog(state, playerByIdx(state, self).name + " gains " +
        (effect.self >= 0 ? "+" : "") + effect.self + "; " + playerByIdx(state, targetIdx).name +
        " loses " + (-effect.target) + ".");
      addUnrest(state, self, effect.self);
      addUnrest(state, targetIdx, effect.target);
      afterCollapseCheck(state, self);
      afterCollapseCheck(state, targetIdx);
    }
    state.pending = null;
    state.phase = "turn";
    finishLanding(state, state.current);
  }

  /* Discard flow for the discard-all card. */
  function resolveDiscard(state, cardIndex) {
    var pending = state.pending;
    if (!pending || pending.type !== "discards") return;
    var pIdx = pending.players[pending.cursor];
    var p = playerByIdx(state, pIdx);
    if (cardIndex == null) {
      pushLog(state, p.name + " had no held card to discard.");
    } else {
      var c = p.heldCards.splice(cardIndex, 1)[0];
      pushLog(state, p.name + " discards held card: " + c.text);
    }
    pending.cursor++;
    if (pending.cursor >= pending.players.length) {
      state.pending = null;
      state.phase = "turn";
      finishLanding(state, -1);
    }
  }

  /* Hold choice for reduce-hold / election cards. */
  function holdNow(state) {
    var pending = state.pending;
    if (!pending || (pending.type !== "holdChoice")) return;
    var card = pending.card;
    var reduce = (pending.election) ? pending.immediateReduce : pending.immediateReduce;
    pushLog(state, card.text + " — played now, reduces unrest by " + reduce + ".");
    var self = pending.from;
    addUnrest(state, self, -reduce);
    afterChange(state, self, card);
    state.pending = null;
    state.phase = "turn";
    finishLanding(state, pending.from);
  }

  function holdForLater(state) {
    var pending = state.pending;
    if (!pending || pending.type !== "holdChoice") return;
    var p = playerByIdx(state, pending.player);
    p.heldCards.push({ card: pending.card, turnsHeld: 0 });
    pushLog(state, p.name + " holds card: " + pending.card.text +
      (pending.election ? " (hold 3 turns for " + pending.reduceHeld + ")" : ""));
    state.pending = null;
    state.phase = "turn";
    finishLanding(state, state.current);
  }

  /* Resolve the landed space: draw card(s), maybe transfer flag. */
  function resolveLanding(state) {
    var pIdx = state.current;
    var p = playerByIdx(state, pIdx);
    var kind = BOARD.kindOf(state.position);
    if (kind === "black" && !state.cfg.america) kind = "logo";

    /* lastDelta is scoped to the current landing so the score pop and the
       event strip can show the true change once the turn has rotated on. */
    state.lastDelta = null;

    if (kind === "start" || kind === "logo") {
      pushLog(state, p.name + " lands on a relief space — no card drawn.");
      state.landed = { kind: kind, relief: true, cards: [] };
      state.phase = "turn";
      afterTurn(state, pIdx);
      return;
    }

    var isPurple = (kind === "purple");
    var transferred = (isPurple && p.pendingPurpleTransfer);
    var extra = (isPurple && state.globalExtraPurple);

    if (transferred) {
      state.pending = { type: "transferTarget", from: pIdx, card: null };
      state.phase = "target";
      return;
    }

    var cards = [drawFromDeck(state, kind)];
    if (extra) {
      cards.push(drawFromDeck(state, kind));
      state.globalExtraPurple = false;
    }
    state.landed = { kind: kind, relief: false, cards: cards };
    state.cardsInFlight = cards.slice();
    nextCardInFlight(state, pIdx);
  }

  function nextCardInFlight(state, pIdx) {
    if (!state.cardsInFlight.length) {
      state.cardsInFlight = [];
      state.phase = "turn";
      afterTurn(state, pIdx);
      return;
    }
    var card = state.cardsInFlight.shift();
    if (!card) {
      pushLog(state, "No cards left in that deck.");
      nextCardInFlight(state, pIdx);
      return;
    }
    applyCard(state, card, pIdx, { landed: state.position });
    if (state.phase === "gameover") return;
    if (state.pending) return; /* hold / target / choice / discards set by applyCard */
    nextCardInFlight(state, pIdx);
  }

  function finishLanding(state, pIdx) {
    if (pIdx < 0) return;
    if (state.phase === "gameover") return;
    if (state.cardsInFlight && state.cardsInFlight.length) {
      nextCardInFlight(state, pIdx);
      return;
    }
    state.phase = "turn";
    afterTurn(state, pIdx);
  }

  /* Tyrant victory tracking + end of a player's full turn. */
  function afterTurn(state, pIdx) {
    var p = playerByIdx(state, pIdx);
    if (state.phase === "gameover") return;
    if (p.alive) {
      p.tyrantHistory.push(p.unrest);
      if (p.tyrantHistory.length > 3) p.tyrantHistory.shift();
      if (state.cfg.tyrantVictory && p.tyrantHistory.length === 3) {
        var gains = 0;
        for (var i = 1; i < p.tyrantHistory.length; i++) {
          if (p.tyrantHistory[i] > p.tyrantHistory[i - 1]) {
            gains += p.tyrantHistory[i] - p.tyrantHistory[i - 1];
          }
        }
        if (gains >= 25) {
          state.pending = { type: "tyrantVictory", player: pIdx };
          state.phase = "choice";
          return;
        }
      }
    }
    advance(state);
  }

  function advance(state) {
    if (state.phase === "gameover") return;
    var startIdx = state.current;
    var idx = startIdx;
    do {
      idx = (idx + 1) % state.players.length;
    } while (!state.players[idx].alive);
    if (idx === 0) {
      state.round++;
      pushLog(state, "— Round " + state.round + " —");
      if (state.cfg.crisisMode && state.round % 5 === 0) {
        state.current = idx;
        state.crisisCursor = 0;
        state.pending = { type: "crisis", round: state.round };
        state.phase = "crisis";
        return;
      }
    }
    state.current = idx;
    state.turn++;
    beginTurn(state);
  }

  function beginTurn(state) {
    var p = playerByIdx(state, state.current);
    p.tyrantHistory = [];
    /* advance held election cards; auto-play when fully held */
    for (var i = p.heldCards.length - 1; i >= 0; i--) {
      var hc = p.heldCards[i];
      if (hc.card.type === "election") {
        hc.turnsHeld++;
        if (hc.turnsHeld >= 3) {
          pushLog(state, p.name + "'s held Election Reform Act completes — reduces unrest by " + hc.card.reduce_held + ".");
          addUnrest(state, state.current, -hc.card.reduce_held);
          p.heldCards.splice(i, 1);
          afterCollapseCheck(state, state.current);
        }
      }
    }
    state.phase = "turn";
    pushLog(state, p.name + "'s turn (" + (p.isAI ? "AI" : "human") + ").");
  }

  function runCrisis(state) {
    var p = state.players[state.crisisCursor];
    if (p && p.alive) {
      var card = drawFromDeck(state, "yellow");
      if (card) applyCard(state, card, p.index, { spaceValue: 0 });
    }
    state.crisisCursor++;
    if (state.crisisCursor >= state.players.length) {
      state.pending = null;
      state.crisisCursor = 0;
      state.phase = "turn";
      state.turn++;
      beginTurn(state);
    }
  }

  /* ---- public API ---- */

  function createGame(cfg) {
    var state = {
      cfg: cfg,
      players: [],
      decks: buildDecks(cfg),
      current: 0,
      round: 1,
      turn: 1,
      phase: "start",
      log: [],
      globalExtraPurple: false,
      cardsInFlight: [],
      pending: null,
      landed: null,
      lastDelta: null,
      dice: [],
      position: 0,
      crisisCursor: 0,
      winner: null
    };

    cfg.players.forEach(function (slot, i) {
      state.players.push({
        index: i,
        name: slot.name,
        isAI: !!slot.isAI,
        color: PLAYER_COLORS[i % PLAYER_COLORS.length],
        position: 0,
        unrest: 0,
        alive: true,
        heldCards: [],
        reformStreak: 0,
        tyrantHistory: [],
        pendingPurpleTransfer: false
      });
    });

    /* initial roll for turn order: highest first; ties keep seating order */
    state.startRolls = state.players.map(function () { return 1 + Math.floor(Math.random() * 6); });
    var order = state.players.map(function (p) { return p.index; });
    order.sort(function (a, b) { return state.startRolls[b] - state.startRolls[a]; });
    var reordered = order.map(function (i) { return state.players[i]; });
    reordered.forEach(function (p, i) { p.index = i; });
    state.players = reordered;
    state.startRolls = reordered.map(function (p, i) { return state.startRolls[order[i]]; });

    state.players.forEach(function (p, i) {
      pushLog(state, p.name + " rolled " + state.startRolls[i] + (i === 0 ? " — goes first." : "."));
    });

    state.phase = "turn";
    beginTurn(state);
    return state;
  }

  function rollDice(state) {
    if (state.phase !== "turn") return;
    var die = function () { return 1 + Math.floor(Math.random() * 6); };
    if (state.cfg.twoDice) {
      var a = die(), b = die();
      state.dice = [a, b];
      if (state.cfg.twoDiceMode === "highest") state.lastRoll = Math.max(a, b);
      else state.lastRoll = a + b;
      pushLog(state, playerByIdx(state, state.current).name + " rolls " + a + " and " + b +
        (state.cfg.twoDiceMode === "highest" ? " (highest " + state.lastRoll + ")" : " (total " + state.lastRoll + ")") + ".");
    } else {
      state.lastRoll = die();
      state.dice = [state.lastRoll];
      pushLog(state, playerByIdx(state, state.current).name + " rolls " + state.lastRoll + ".");
    }
    state.phase = "rolled";
  }

  function move(state) {
    if (state.phase !== "rolled") return;
    var p = playerByIdx(state, state.current);
    var amount = state.lastRoll;
    state.position = (p.position + amount) % BOARD.trackLength;
    p.position = state.position;
    pushLog(state, p.name + " moves " + amount + " to " + BOARD.spaces[state.position].label + ".");
    state.phase = "landed";
  }

  function playHeld(state, heldIdx) {
    if (state.phase !== "turn") return;
    var p = playerByIdx(state, state.current);
    var hc = p.heldCards[heldIdx];
    if (!hc) return;
    var reduce = hc.card.type === "election" ? hc.card.reduce : hc.card.reduce;
    p.heldCards.splice(heldIdx, 1);
    pushLog(state, p.name + " plays held card: " + hc.card.text + " (reduces " + reduce + ").");
    addUnrest(state, state.current, -reduce);
    afterChange(state, state.current, hc.card);
  }

  function pickTransferTarget(state, targetIdx) {
    var pending = state.pending;
    if (!pending || pending.type !== "transferTarget") return;
    var p = playerByIdx(state, pending.from);
    p.pendingPurpleTransfer = false;
    var card = drawFromDeck(state, "purple");
    pushLog(state, p.name + " transfers their Purple card effect to " + playerByIdx(state, targetIdx).name + ".");
    var cards = [card];
    state.landed = { kind: "purple", relief: false, cards: cards };
    state.cardsInFlight = cards.slice();
    state.pending = null;
    nextCardInFlight(state, targetIdx);
  }

  function nextPlayerForDiscard(state) {
    var pending = state.pending;
    if (!pending || pending.type !== "discards") return -1;
    if (pending.cursor >= pending.players.length) return -1;
    return pending.players[pending.cursor];
  }

  return {
    createGame: createGame,
    rollDice: rollDice,
    move: move,
    resolveLanding: resolveLanding,
    resolveTarget: resolveTarget,
    resolveDiscard: resolveDiscard,
    nextPlayerForDiscard: nextPlayerForDiscard,
    resolveTransfer: pickTransferTarget,
    holdNow: holdNow,
    holdForLater: holdForLater,
    playHeld: playHeld,
    runCrisis: runCrisis,
    continueChoice: function (state) {
      /* Player declined a Reform/Tyrant victory — keep playing. */
      if (state.pending && (state.pending.type === "reformVictory" || state.pending.type === "tyrantVictory")) {
        var pIdx = state.pending.player;
        var p = state.players[pIdx];
        if (state.pending.type === "reformVictory") p.reformStreak = 0;
        else p.tyrantHistory = [];
        state.pending = null;
        state.phase = "turn";
        afterTurn(state, pIdx);
      }
    },
    declareVictory: function (state) {
      if (state.pending && (state.pending.type === "reformVictory" || state.pending.type === "tyrantVictory")) {
        state.winner = state.pending.player;
        state.phase = "gameover";
        state.pending = null;
      }
    },
    addUnrest: addUnrest,
    stateInfo: function (state) { return state; }
  };
})();
