# Civil Unrest — Digital Edition Design

Date: 2026-08-12

## Overview

A digital, browser-based version of the physical board game *Civil Unrest* (by Douglas
DeMaio), playable hot-seat on one device with optional AI opponents. The same static
`game/` folder runs in the browser (GitHub Pages / any static server) and as a
desktop flatpak that wraps it in a WebKitGTK window. It faithfully implements the rules
from *Civil Unrest: Rules Handbook* and uses the real card content from
`Civil_Unrest_Deck_of_Cards.csv` and the *Civil Unrest: America* expansion
(`USA.xlsx`), already serialized to `game/js/cards.js`, `game/js/usa.js` and the board
layout in `game/js/board.js`.

Purchase links to the physical game
(https://www.thegamecrafter.com/games/civil-unrest1) are surfaced on the start screen,
in-app footer, and the landing page.

## Architecture

Static, dependency-free vanilla JS single-page app. No build step. State lives in plain
JS objects so the engine is pure logic and the UI is a separate rendering layer.

```
game/
  index.html          app entry
  css/game.css        styling
  js/board.js         existing: 37-space serpentine track (START + 36 spaces)
  js/cards.js         existing: base deck (7 categories, ~360 cards)
  js/usa.js           existing: America expansion decks + black fist deck
  js/engine.js        NEW: pure game state + rules (no DOM)
  js/ui.js            NEW: DOM rendering + dialogs + board
  js/ai.js            NEW: bot opponents
  js/main.js          NEW: wiring, screens, boot
```

Flatpak: a PyGObject/WebKitGTK wrapper (`flatpak/app.py`) serves the bundled `game/`
folder over `127.0.0.1:<port>` and loads it in a native window. Browser and flatpak run
byte-identical code.

## Game Rules Implemented

- **Players:** 1–6 seats, each human or AI (at least one human). Unrest Meter 0–100,
  players start at 0, pawns on START. Highest initial roll goes first.
- **Turn:** roll 1 die (optional 2-dice economy uses total or highest die) → move
  forward on the serpentine track (wraps around) → resolve the landed space.
- **Space resolution:** draw the top card of the matching color deck. Space value is
  combined with the card instruction:
  - *Use Card Value* → apply space value only.
  - ±n → add to space value (score floored at 0).
  - x1.5 / x2 multiplier → multiply the space value.
  - Reduce cards → subtract directly from total unrest; some are holdable.
  - Election cards → play immediately (small cut) or hold 3 turns for the big cut.
  - Targeted purple cards → chooseGain, swap (within ±N), allOthers, selfRemove,
    plus global flags (nextPurpleExtra, transferPurple, discardAll).
- **Logo / relief spaces:** no deck, no points (pure relief).
- **Fist (black) spaces:** active only when the America expansion toggle is on;
  otherwise they act as logo relief spaces.
- **Collapse:** unrest ≥ 100 → eliminated. Standard victory: last nation standing.
- **Optional rules (toggles):** Reform Victory (3 red reform cards in a row reduce
  unrest under 20 → immediate win); Tyrant Victory (+25 unrest within 3 consecutive
  turns → immediate win); Crisis Mode (every 5 rounds all players draw a random
  Yellow card); Two Dice Economy; America expansion.
- **Held cards:** per-player hand of holdable reduce/election cards, playable on any
  of the holder's turns. Per-color decks reshuffle their discards when exhausted.
- **Game log:** every roll, move, card draw, and point change is recorded and shown so
  the digital play is transparently faithful to the physical rules.

## UI

- Start screen: logo, tagline, player count/name/AI setup, optional-rule toggles,
  rules summary, physical-purchase buttons.
- Board: digital re-creation of the physical 37-space serpentine board in real
  category colors, player tokens, dice, current-player highlight, drawn event card
  dialog, per-player Unrest Meters, held cards, game log, end-of-game victory screen.
- Persistent "Get the Physical Game" link to The Game Crafter.

## Flatpak

- `flatpak/com.demaio.CivilUnrest.yaml` — org.gnome.Platform runtime, python3 SDK
  extension, modules for `app.py` + bundled `game/`.
- `flatpak/app.py` — GTK window + WebKit2 4.1 loading the local server.
- `flatpak/org.demaio.CivilUnrest.desktop`, metainfo, icon (derived from `logo.png`),
  `flatpak/build.sh`.
- Same `app.py` runs natively on the dev machine (webkit2gtk 4.1 is installed) for
  local testing.

## Verification

1. Open `game/index.html` directly in a browser.
2. Serve `game/` with `python3 -m http.server` and open it.
3. Node smoke test of the engine: simulate turns, collapse, reform/tyrant victory,
   hold/election cards, reshuffles, negative clamping.
4. Launch the flatpak wrapper locally (`python3 flatpak/app.py`).

## Out of Scope

- Real-time online multiplayer (needs a backend server).
- Account/save sync; local persistence only if trivially added.
- Rule modifications beyond the documented handbook + optional rules.
