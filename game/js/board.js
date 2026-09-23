/* Board layout for the digital Civil Unrest board.
 * Matches the physical "Civil Unrest.png" / Civil_Unrest_Board_Final.svg:
 * a perimeter loop of overlapping circles around a parchment center with
 * the CIVIL UNREST fist emblem + six category legend boxes, wrapped by a
 * 0-100 unrest meter on the outer edge.
 * Logical order is preserved: START (0) then 36 spaces clockwise:
 * bottom row L->R, right column B->T, top row R->L, left column T->B. */
window.CU_BOARD = (function () {
  "use strict";

  var CATEGORIES = {
    green:  { name: "Economic Pressure",            short: "ECON",   color: "#7ab490", deck: true },
    yellow: { name: "Natural Disasters & Climate",  short: "NATURE", color: "#efe16e", deck: true },
    blue:   { name: "Civil Discord & Identity",     short: "DISCORD",color: "#5b93a5", deck: true },
    purple: { name: "Global Influence & Interference", short: "GLOBAL", color: "#7f1f7f", deck: true },
    orange: { name: "Demographics & Immigration",   short: "PEOPLE", color: "#f5a742", deck: true },
    red:    { name: "Reform & Resource Tokens",     short: "REFORM", color: "#b23727", deck: true },
    black:  { name: "Civil Unrest",                 short: "FIST",   color: "#16150f", deck: true },
    logo:   { name: "Civil Unrest",                 short: "LOGO",   color: "#e9ddaf", deck: false },
    start:  { name: "START",                        short: "START",  color: "#b23727", deck: false }
  };

  /* Same logical deck order as before — only the geometry changed. */
  var grid = [
    ["green", 2], ["blue", 1], ["logo", 0], ["orange", 3], ["purple", 2],
    ["yellow", 4], ["green", 3], ["blue", 2], ["fist", 0],
    ["orange", 1], ["red", 0], ["purple", 3], ["green", 4], ["yellow", 2],
    ["blue", 3], ["orange", 5], ["logo", 0], ["yellow", 1],
    ["green", 2], ["purple", 4], ["red", 0], ["blue", 5], ["orange", 3],
    ["fist", 0], ["yellow", 3], ["green", 5], ["purple", 1],
    ["red", 0], ["orange", 4], ["blue", 4], ["logo", 0], ["yellow", 2],
    ["green", 1], ["purple", 5], ["red", 0], ["yellow", 5]
  ];

  var W = 1200, H = 900;

  /* Track rectangle (centers) inside the outer unrest meter. */
  var LEFT = 165, RIGHT = 1035, TOP = 150, BOTTOM = 740;

  function radiusFor(kind, value) {
    if (kind === "start") return 74;
    if (kind === "black") return 60;
    if (kind === "logo") return 56;
    /* Physical board: bigger numbers = bigger circles. */
    return 34 + Math.max(0, value) * 3.2;
  }

  /* Perimeter position for track slot t = 1..36. */
  function perimeterPos(t) {
    var f, x, y;
    if (t >= 1 && t <= 9) {           /* bottom row, L -> R */
      f = (t - 1) / 8;
      x = 280 + f * (920 - 280);
      y = BOTTOM + ((t % 2) ? -9 : 9);
    } else if (t >= 10 && t <= 18) {  /* right column, B -> T */
      f = (t - 10) / 8;
      y = 650 - f * (650 - 230);
      x = RIGHT + ((t % 2) ? 8 : -8);
    } else if (t >= 19 && t <= 27) {  /* top row, R -> L */
      f = (t - 19) / 8;
      x = 920 - f * (920 - 280);
      y = TOP + ((t % 2) ? 9 : -9);
    } else {                          /* left column, T -> B */
      f = (t - 28) / 8;
      y = 240 + f * (640 - 240);
      x = LEFT + ((t % 2) ? -8 : 8);
    }
    return { x: Math.round(x), y: Math.round(y) };
  }

  var spaces = [];
  spaces.push({ i: 0, kind: "start", x: 165, y: 740, r: radiusFor("start", 0), value: 0, label: "START" });

  grid.forEach(function (cell, idx) {
    var t = idx + 1;
    var pos = perimeterPos(t);
    var kind = cell[0] === "fist" ? "black" : cell[0];
    spaces.push({
      i: t,
      kind: kind,
      x: pos.x,
      y: pos.y,
      r: radiusFor(kind, cell[1]),
      value: cell[1],
      label: CATEGORIES[kind].name
    });
  });

  return {
    width: W,
    height: H,
    startIndex: 0,
    trackLength: spaces.length,     // 37 (START + 36 spaces)
    spaces: spaces,
    categories: CATEGORIES,
    kindOf: function (i) { return spaces[i].kind; },
    valueOf: function (i) { return spaces[i].value; },
    isDeckSpace: function (i) {
      var k = spaces[i].kind;
      return !!CATEGORIES[k].deck;
    }
  };
})();
