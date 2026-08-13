/* Civil Unrest Digital Edition — AI opponents.
 * Bots play through the same engine API as humans, with simple self-interested
 * heuristics: play relief cards when unrest is high, hold small cuts when low,
 * push unrest onto rivals, and always take an offered victory. */
window.CU_AI = (function () {
  "use strict";

  var E = window.CU_Engine;

  function alive(state) { return state.players.filter(function (p) { return p.alive; }); }

  function highestUnrestOpponent(state, me) {
    var best = null, bestU = -1;
    state.players.forEach(function (p) {
      if (p.alive && p.index !== me && p.unrest > bestU) { best = p.index; bestU = p.unrest; }
    });
    return best;
  }

  function lowestUnrestOpponent(state, me) {
    var best = null, bestU = Infinity;
    state.players.forEach(function (p) {
      if (p.alive && p.index !== me && p.unrest < bestU) { best = p.index; bestU = p.unrest; }
    });
    return best;
  }

  function opponentsSortedByUnrest(state, me, asc) {
    var opps = state.players.filter(function (p) { return p.alive && p.index !== me; });
    opps.sort(function (a, b) { return asc ? a.unrest - b.unrest : b.unrest - a.unrest; });
    return opps.map(function (p) { return p.index; });
  }

  /* Choose a card to play from the hand, if any is worth playing now. */
  function chooseHeldToPlay(state, pIdx) {
    var p = state.players[pIdx];
    var best = null, bestIdx = -1;
    p.heldCards.forEach(function (hc, i) {
      var reduce = hc.card.type === "election" ? hc.card.reduce : hc.card.reduce;
      if (p.unrest >= 55 && reduce >= 4) {
        if (best == null || reduce > best) { best = reduce; bestIdx = i; }
      }
    });
    return bestIdx;
  }

  function aiTurn(state, pIdx) {
    var E = window.CU_Engine;

    /* Playing held cards: only when unrest is genuinely high and the cut is big. */
    if (state.phase === "turn") {
      var heldIdx = chooseHeldToPlay(state, pIdx);
      while (heldIdx >= 0 && state.phase === "turn") {
        E.playHeld(state, heldIdx);
        if (state.phase === "gameover") return;
        if (state.phase === "choice") return; /* reform/tyrant offer */
        heldIdx = chooseHeldToPlay(state, pIdx);
      }
      if (state.phase !== "turn") return;
      E.rollDice(state);
      return;
    }

    /* Resolve hold choices made by an AI. */
    if (state.phase === "hold" && state.pending && state.players[state.pending.from] &&
        state.players[state.pending.from].isAI) {
      var p = state.players[state.pending.from];
      var reduce = state.pending.immediateReduce;
      if (p.unrest >= 60 && reduce >= 5) {
        E.holdNow(state);
      } else {
        E.holdForLater(state);
      }
      return;
    }

    /* Target choices for purple sabotage / relief cards — decider may not be current. */
    if (state.phase === "target" && state.pending &&
        (state.pending.type === "target" || state.pending.type === "transferTarget")) {
      var decider = state.pending.from;
      if (!state.players[decider] || !state.players[decider].isAI) return;
      if (state.pending.type === "transferTarget") {
        var tt = highestUnrestOpponent(state, decider);
        if (tt == null) tt = decider;
        E.resolveTransfer(state, tt);
        return;
      }
      var eff = state.pending;
      var me = decider;
      var target;
      switch (eff.kind) {
        case "swap": {
          /* swap with the rival within ±N who has the lowest unrest */
          var within = eff.within;
          var cands = state.players.filter(function (p) {
            return p.alive && p.index !== me &&
              Math.abs(p.unrest - state.players[me].unrest) <= within;
          });
          target = cands.length ? lowestUnrestOpponent(state, me) : highestUnrestOpponent(state, me);
          break;
        }
        case "chooseGain":
          /* helping card? target self; harming card? target most fragile rival */
          target = (eff.effect.target < 0) ? me : highestUnrestOpponent(state, me);
          break;
        case "selfGainTargetLose":
          /* relief to a rival loses them points — harm the most fragile */
          target = (eff.effect.target < 0) ? me : highestUnrestOpponent(state, me);
          break;
        default:
          target = highestUnrestOpponent(state, me);
      }
      if (target == null) target = me;
      E.resolveTarget(state, target);
      return;
    }

    /* Discard-all: bots drop the first held card. */
    if (state.phase === "discard" && state.pending && state.pending.type === "discards") {
      var meP = state.players[pIdx];
      E.resolveDiscard(state, meP.heldCards.length ? 0 : null);
      return;
    }
  }

  return { aiTurn: aiTurn };
})();
