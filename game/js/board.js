/* Board layout for the digital Civil Unrest board.
 * The track is a winding ("zig-zag") path of 36 spaces around the board plus
 * the START space.  Space colors follow the physical game: the six crisis
 * categories, red Reform spaces, Civil Unrest logo relief spaces and (America
 * expansion) black "fist" spaces. */
window.CU_BOARD = (function () {
  "use strict";

  var CATEGORIES = {
    green:  { name: "Economic Pressure",            short: "ECON",   color: "#7ab490", deck: true },
    yellow: { name: "Natural Disasters & Climate",  short: "NATURE", color: "#f0e06a", deck: true },
    blue:   { name: "Civil Discord & Identity",     short: "DISCORD",color: "#5690a3", deck: true },
    purple: { name: "Global Influence & Interference", short: "GLOBAL", color: "#800080", deck: true },
    orange: { name: "Demographics & Immigration",   short: "PEOPLE", color: "#f7a541", deck: true },
    red:    { name: "Reform & Resource Tokens",     short: "REFORM", color: "#b73a28", deck: true },
    black:  { name: "Civil Unrest",                 short: "FIST",   color: "#16150f", deck: true },
    logo:   { name: "Civil Unrest",                 short: "LOGO",   color: "#2c2a20", deck: false },
    start:  { name: "START",                        short: "START",  color: "#16150f", deck: false }
  };

  /* Layout: 9 columns x 4 rows, serpentine (zig-zag). Index 0 = START at the
   * bottom-left; the path runs up the left edge and snakes left-right. */
  var cols = [60, 185, 310, 435, 560, 685, 810, 935, 1060];
  var rows = [160, 300, 440, 580];

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

  function rowDir(r) { return (r % 2 === 0) ? 1 : -1; }  // row 0 -> L->R

  var spaces = [];
  var start = { i: 0, kind: "start", x: cols[0], y: 700, value: 0, label: "START" };
  spaces.push(start);

  grid.forEach(function (cell, idx) {
    var r = Math.floor(idx / 9);
    var c = idx % 9;
    var x = (rowDir(r) === 1) ? cols[c] : cols[8 - c];
    var kind = cell[0] === "fist" ? "black" : cell[0];
    spaces.push({
      i: idx + 1,
      kind: kind,
      x: x,
      y: rows[r],
      value: cell[1],
      label: CATEGORIES[kind].name
    });
  });

  return {
    width: 1160,
    height: 780,
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
