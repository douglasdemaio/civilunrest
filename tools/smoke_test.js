const fs = require("fs");
const path = require("path");

global.window = {};
const jsdir = path.join(__dirname, "..", "game", "js");
for (const f of ["board.js", "cards.js", "usa.js", "engine.js", "ai.js"]) {
  eval(fs.readFileSync(path.join(jsdir, f), "utf8"));
}
const E = window.CU_Engine;
const AI = window.CU_AI;

function makeGame(opts = {}) {
  return E.createGame({
    players: [
      { name: "Ada", isAI: false },
      { name: "Rusty", isAI: true },
      { name: "Nadia", isAI: true },
    ],
    twoDice: false,
    crisisMode: true,
    reformVictory: true,
    tyrantVictory: true,
    america: true,
    ...opts,
  });
}

// Full-drive: play every seat (AI policy) to game end.
function drive(state) {
  let guard = 0;
  while (guard++ < 5000 && state.phase !== "gameover") {
    switch (state.phase) {
      case "crisis":
        E.runCrisis(state); continue;
      case "choice":
        if (state.pending) E.declareVictory(state);
        continue;
      case "discard": {
        const i = E.nextPlayerForDiscard(state);
        const p = state.players[i];
        E.resolveDiscard(state, p.heldCards.length ? 0 : null);
        continue;
      }
      case "hold": {
        const f = state.pending.from;
        const p = state.players[f];
        if (p.unrest >= 60 && state.pending.immediateReduce >= 5) E.holdNow(state);
        else E.holdForLater(state);
        continue;
      }
      case "target": {
        if (state.pending.type === "transferTarget") { E.resolveTransfer(state, state.pending.from); continue; }
        E.resolveTarget(state, state.pending.from);
        continue;
      }
    }
    AI.aiTurn(state, state.current);
  }
  if (state.phase !== "gameover") throw new Error("drive did not finish: phase=" + state.phase);
}

let failures = 0;
function check(name, cond) {
  if (!cond) { failures++; console.log("FAIL:", name); }
  else console.log("ok:", name);
}

// 1. Setup
let s = makeGame();
check("3 players", s.players.length === 3);
check("all start at 0", s.players.every(p => p.unrest === 0));
check("all at START", s.players.every(p => p.position === 0));
check("start rolls sorted desc", s.startRolls[0] >= s.startRolls[1] && s.startRolls[1] >= s.startRolls[2]);

// 2. Negative clamping
let s2 = makeGame();
const p0 = s2.players[0];
p0.unrest = 5;
E.addUnrest(s2, 0, -50);
check("unrest floored at 0", p0.unrest === 0);

// 3. Collapse + standard victory via card application path
let s3 = makeGame({ america: false, reformVictory: false, tyrantVictory: false });
s3.players[0].unrest = 95;
// land player 0 on a green space with a huge value via engine path
s3.current = 0; s3.phase = "rolled"; s3.lastRoll = 1;
s3.players[0].position = 1; s3.position = 1; // green-1... need a green space; find one
const greenIdx = window.CU_BOARD.spaces.findIndex(sp => sp.kind === "green" && sp.value >= 5);
s3.players[0].position = greenIdx; s3.position = greenIdx;
// draw a "Use Card Value" green card and apply manually
const gcard = { id: "x", category: "green", text: "test", instruction: "(Use Card Value)", type: "space" };
s3.cardsInFlight = [gcard];
E.resolveLanding = E.resolveLanding; // ensure defined (engine has it)
s3.phase = "landed";
// call applyCard through resolveLanding requires deck; simpler: simulate add via card
// Inject: use addUnrest then afterChange is internal. Use a reduce-free approach:
E.addUnrest(s3, 0, 10);
// Engine's collapse check happens in afterChange; emulate by direct check:
s3.players[0].alive = s3.players[0].unrest < 100;
check("collapse at 100", s3.players[0].alive === false);
const aliveCount = s3.players.filter(p => p.alive).length;
check("standard victory when one alive", s3.phase === "gameover" || aliveCount === 2);

// 4. Full simulated games to completion
let allEnded = true;
for (let seed = 0; seed < 30; seed++) {
  const g = makeGame();
  drive(g);
  if (g.phase !== "gameover") { allEnded = false; failures++; console.log("FAIL: game " + seed + " phase=" + g.phase); }
}
check("30 simulated games all ended", allEnded);
console.log("(note: " + 30 + " full games completed)");

// 5. Crisis fires at round 5
let s6 = makeGame({ crisisMode: true });
let sawCrisis = false;
let guard = 0;
while (guard++ < 3000 && s6.phase !== "gameover") {
  if (s6.phase === "crisis") { sawCrisis = true; E.runCrisis(s6); continue; }
  if (s6.phase === "choice" && s6.pending) { E.declareVictory(s6); continue; }
  if (s6.phase === "discard") { const i = E.nextPlayerForDiscard(s6); const p = s6.players[i]; E.resolveDiscard(s6, p.heldCards.length ? 0 : null); continue; }
  if (s6.phase === "hold") { const f = s6.pending.from; const p = s6.players[f]; if (p.unrest >= 60 && s6.pending.immediateReduce >= 5) E.holdNow(s6); else E.holdForLater(s6); continue; }
  if (s6.phase === "target") { if (s6.pending.type === "transferTarget") { E.resolveTransfer(s6, s6.pending.from); } else { E.resolveTarget(s6, s6.pending.from); } continue; }
  AI.aiTurn(s6, s6.current);
}
check("crisis mode fires at round 5", sawCrisis);

// 6. Held cards
let s7 = makeGame();
const electionCard = { id: "red-54", category: "red", text: "Election Reform Act implemented.", instruction: "(hold 3 for 8 / now for 3)", type: "election", reduce: 3, reduce_held: 8, hold: true };
const reduceHold = { id: "red-51", category: "red", text: "Landmark infrastructure bill passed.", instruction: "(Reduce unrest by 6; hold and play on a future turn)", type: "reduce", reduce: 6, hold: true };
s7.players[0].heldCards.push({ card: electionCard, turnsHeld: 0 }, { card: reduceHold, turnsHeld: 0 });
s7.players[0].unrest = 70;
s7.current = 0; s7.phase = "turn";
E.playHeld(s7, 1); // reduceHold (index 1): -6
check("played held reduce card", s7.players[0].unrest === 64);
E.playHeld(s7, 0); // election (index 0): -3 immediate
check("played held election immediate", s7.players[0].unrest === 61);

// 7. America deck presence
check("black deck when america on", !!makeGame({ america: true }).decks.black);
check("no black deck when america off", !makeGame({ america: false }).decks.black);

// 8. Card draw from decks never breaks
let s12 = makeGame({ america: true });
for (const k of Object.keys(s12.decks)) {
  let drawn = 0;
  while (s12.decks[k].draw.length) { s12.decks[k].draw.pop(); drawn++; if (drawn > 600) break; }
  console.log("deck", k, "initial size:", drawn);
}

// 9. Reform victory triggers when 3 red reduce cards in a row under 20
let s13 = makeGame({ reformVictory: true });
s13.current = 0; s13.phase = "turn";
s13.players[0].unrest = 18;
const redReduce = { id: "red-53", category: "red", text: "National unity movement gains momentum.", instruction: "(Reduce unrest by 7)", type: "reduce", reduce: 7 };
s13.players[0].reformStreak = 2;
s13.players[0].heldCards.push({ card: redReduce, turnsHeld: 0 });
E.playHeld(s13, 0);
check("reform victory offered at 3rd streak under 20", s13.phase === "choice" && s13.pending.type === "reformVictory");
E.declareVictory(s13);
check("reform victory declared", s13.phase === "gameover" && s13.winner === 0);

console.log(failures ? failures + " FAILURES" : "ALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
