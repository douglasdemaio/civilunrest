# Civil Unrest

Where Risk Meets Monopoly. A tabletop board game for 1–6 players, ages 14+, built
for everyone — and designed with everyone.

- **Website:** https://douglasdemaio.github.io/civilunrest
- **Play online (free):** https://douglasdemaio.github.io/civilunrest/game
- **Physical game:** https://www.thegamecrafter.com/games/civil-unrest1
- **America expansion:** https://www.thegamecrafter.com/games/civil-unrest:-america

## What's in this repo

| Path | What it is |
|---|---|
| `game/` | The digital edition — a single-page web app (browser + flatpak run the same code) |
| `flatpak/` | Desktop packaging for Linux (see `flatpak/README.md`) |
| `CivilUnrest/` | Design assets: the board, box art, card artwork, and the master card deck sources |
| `tools/` | `generate_deck.py` (builds the digital decks from the card sources) and `smoke_test.js` |
| `docs/` | Design notes |
| `index.html` | The public landing page |

## Play the digital edition

Open `game/index.html` in any modern browser, or run it as a flatpak:

```bash
cd flatpak && ./build.sh --install && flatpak run com.demaio.CivilUnrest
```

## Join the design

Civil Unrest is a game for everyone, and we want people to feel a part of this
design. Contributions are welcome — especially **expanding the card deck for the
physical game**.

The cards live in plain, human-readable sources:

- `CivilUnrest/Civil_Unrest_Deck_of_Cards.csv` — the base game deck (359 cards)
- `CivilUnrest/USA/USA.xlsx` — the master deck including the 36-card America expansion

Every card sits in one of six crisis categories — Blue, Green, Orange, Purple,
Red, Yellow — plus the black fist deck. Want to add a card? Open the CSV, follow
the existing rows, and submit a pull request. `tools/generate_deck.py` turns the
sources into the digital decks (`game/js/cards.js`, `game/js/usa.js`) so new
cards show up in the browser edition too.

Beyond cards, we'd love help with playtesting, rules writing, balance feedback,
bug reports, and ideas for new expansions. Open an issue or pull request — the
design is yours to shape.
