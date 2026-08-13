#!/usr/bin/env python3
"""
Generate the digital Civil Unrest card decks (game/js/cards.js and game/js/usa.js)
from the physical deck source files:

  - CivilUnrest/Civil_Unrest_Deck_of_Cards.csv   (base game, 359 cards)
  - CivilUnrest/USA/USA.xlsx                      (master deck incl. the 36-card
    "Civil Unrest: America" expansion, ending with the black "Civil Unrest" fist deck)

The .csv/.xlsx files use Excel CSV-injection style encodings for special
characters (e.g. +AC0- = "-", +ACY- = "&", +ACU- = "%", +ACI- = '"', +AFs- = "[",
+AF0- = "]", +ALE- = "+-", +AD0- = "=", +ADs- = ";", +IBk- = "'", +AIA- = "!").
All of those are decoded here.  Every card is parsed into a structured record the
browser game can consume directly.
"""

import csv
import json
import os
import re
import sys

try:
    import openpyxl
except ImportError:
    print("openpyxl is required to read the master USA.xlsx deck. pip install openpyxl")
    sys.exit(1)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(ROOT, "CivilUnrest", "Civil_Unrest_Deck_of_Cards.csv")
XLSX_PATH = os.path.join(ROOT, "CivilUnrest", "USA", "USA.xlsx")
OUT_CARDS = os.path.join(ROOT, "game", "js", "cards.js")
OUT_USA = os.path.join(ROOT, "game", "js", "usa.js")

# --------------------------------------------------------------------------
# 1. Decode the Excel-injection artifacts
# --------------------------------------------------------------------------

ENCODE = [
    ("+AC0-", "-"),
    ("+ACU-", "%"),
    ("+ACY-", "&"),
    ("+ACI-", '"'),
    ("+AFs-", "["),
    ("+AF0-", "]"),
    ("+ALE-", "\u00b1"),
    ("+AD0-", "="),
    ("+ADs-", ";"),
    ("+IBk-", "'"),
    ("+AIA-", "!"),
    ("+AGE-", "e"),
    ("+ACo-", "*"),
]


def decode(text):
    if not text:
        return ""
    for code, char in ENCODE:
        text = text.replace(code, char)
    text = text.replace('""', '"').strip()
    # strip any stray wrapping quote characters
    while text.startswith('"') or text.startswith("'") or text.startswith("\u2019"):
        text = text[1:].strip()
    while text.endswith('"') or text.endswith("'"):
        text = text[:-1].strip()
    return text.strip()


# --------------------------------------------------------------------------
# 2. Read base deck from CSV
# --------------------------------------------------------------------------

def read_base_csv():
    """Read the base game deck.  The card column may contain commas inside
    Excel-injection-wrapped (+ACI-...) fields, so split each line on the first
    comma only instead of using csv.reader."""
    decks = {"green": [], "yellow": [], "blue": [], "purple": [], "orange": [], "red": []}
    with open(CSV_PATH, encoding="utf-8-sig", newline="") as fh:
        for lineno, line in enumerate(fh):
            line = line.rstrip("\n").rstrip("\r")
            if not line.strip():
                continue
            parts = line.split(",", 1)
            if len(parts) < 2:
                continue
            cat = decode(parts[0])
            card = decode(parts[1])
            if lineno == 0 and "Category" in cat:
                continue  # header
            key = category_key(cat)
            if key:
                decks[key].append(card)
    return decks


def category_key(cat):
    cat = cat.lower()
    if "economic" in cat:
        return "green"
    if "natural" in cat or "climate" in cat:
        return "yellow"
    if "civil discord" in cat or "identity" in cat:
        return "blue"
    if "global" in cat or "interference" in cat or "influence" in cat:
        return "purple"
    if "demographics" in cat or "immigration" in cat:
        return "orange"
    if "reform" in cat or "token" in cat:
        return "red"
    if "civil unrest" in cat:
        return "black"
    return None


# --------------------------------------------------------------------------
# 3. Read the master deck from xlsx and split base vs America expansion
# --------------------------------------------------------------------------

def read_master_xlsx():
    wb = openpyxl.load_workbook(XLSX_PATH, read_only=True, data_only=True)
    ws = wb.worksheets[0]
    rows = []
    for row in ws.iter_rows(values_only=True):
        if not row or not row[0]:
            continue
        cat = decode(row[0])
        card = decode(row[1])
        if len(row) > 2 and row[2]:
            card = decode(card + " " + row[2])
        rows.append((cat, card))
    return rows


# --------------------------------------------------------------------------
# 4. Effect / instruction parsing
# --------------------------------------------------------------------------

INSTRUCTION_RE = re.compile(r"\((.*?)\)\s*$")
SIGNED_NUM = r"(\+?-?\d+)"


def parse_instruction(text):
    """Extract the trailing parenthetical instruction from a card text."""
    m = INSTRUCTION_RE.search(text)
    if not m:
        return text, None
    return text[: m.start()].strip(), m.group(1)


def parse_signed(token):
    token = token.strip()
    if token.startswith("+-"):
        return -int(token[2:])
    return int(token)


def parse_effect_instruction(inst):
    """Parse a parenthetical instruction into a structured effect.

    Returns a dict with 'type' and any relevant fields, plus a human-readable
    'summary' used by the UI.
    """
    if not inst:
        return {"type": "space", "summary": "Use Card Value"}

    inst = inst.strip()

    mult = re.match(r"^[xX](\d+(?:\.\d+)?)\s*multiplier\s*$", inst)
    if mult:
        return {"type": "mult", "mult": float(mult.group(1)),
                "summary": "x{} multiplier".format(mult.group(1))}

    add = re.match(r"^(\+-?)(\d+)$", inst)
    if not add:
        add = re.match(r"^([+-])(\d+)$", inst)
    if add:
        if add.group(1) in ("+-", "-"):
            value = -int(add.group(2))
        else:
            value = int(add.group(2))
        return {"type": "add", "add": value,
                "summary": "{:+d} points".format(value)}

    red = re.match(r"^Reduce unrest by (\d+)\s*$", inst, re.IGNORECASE)
    if red:
        return {"type": "reduce", "reduce": int(red.group(1)),
                "summary": "Reduce unrest by {}".format(red.group(1))}

    red_hold = re.match(
        r"^Reduce unrest by (\d+)\s*;\s*hold and play on a future turn\s*$", inst, re.IGNORECASE
    )
    if red_hold:
        return {"type": "reduce", "reduce": int(red_hold.group(1)), "hold": True,
                "summary": "Reduce unrest by {}; may be held and played later".format(red_hold.group(1))}

    election = re.match(
        r"^Hold for (\d+) turns to reduce unrest by (\d+)\s*[;,]\s*or play immediately for (\d+)\s*$",
        inst, re.IGNORECASE)
    if election:
        return {"type": "election", "reduce": int(election.group(3)), "hold": True,
                "reduce_held": int(election.group(2)),
                "summary": "Play now to reduce by {} — or hold to reduce by {}".format(
                    election.group(3), election.group(2))}

    low = inst.lower()

    # Player-targeting effects (sabotage / diplomacy cards)
    if "choose a player to gain" in low:
        m = re.search(r"Choose a player to gain {}\s*unrest\s*\.\s*You gain {}\s*unrest".format(
            SIGNED_NUM, SIGNED_NUM), inst, re.I)
        if m:
            return {"type": "targeted", "effect": {"action": "chooseGain",
                    "target": parse_signed(m.group(1)), "self": parse_signed(m.group(2))},
                    "summary": "Choose a player: they gain {}, you gain {}".format(m.group(1), m.group(2))}
    if "one player of your choice loses" in low:
        m = re.search(r"You gain {}\s*unrest\s*\.\s*One player of your choice loses (\d+) unrest".format(
            SIGNED_NUM), inst, re.I)
        if m:
            return {"type": "targeted", "effect": {"action": "selfGainTargetLose",
                    "self": parse_signed(m.group(1)), "target": -int(m.group(2))},
                    "summary": "You gain {}, one player loses {}".format(m.group(1), m.group(2))}
    if "remove" in low and "unrest from yourself" in low:
        m = re.search(r"Remove (\d+) unrest from yourself\s*,\s*assign {}\s*unrest to two other players".format(
            SIGNED_NUM), inst, re.I)
        if m:
            return {"type": "targeted", "effect": {"action": "selfRemoveOthers",
                    "self": -int(m.group(1)), "others": parse_signed(m.group(2)), "count": 2},
                    "summary": "Remove {} unrest from yourself; assign {} to two other players".format(m.group(1), m.group(2))}
    if "all other players gain" in low:
        m = re.search(r"All other players gain {}\s*unrest".format(SIGNED_NUM), inst, re.I)
        if m:
            return {"type": "targeted", "effect": {"action": "allOthers",
                    "val": parse_signed(m.group(1))},
                    "summary": "All other players gain {} unrest".format(m.group(1))}
    if "swap unrest totals" in low:
        m = re.search(r"Swap unrest totals with a player within \u00b1(\d+) unrest points", inst)
        if not m:
            m = re.search(r"Swap unrest totals with a player within [+-](\d+) unrest points", inst)
        if m:
            return {"type": "targeted", "effect": {"action": "swap", "within": int(m.group(1))},
                    "summary": "Swap unrest totals with a player within {} points".format(m.group(1))}
    if "draw an extra purple card" in low:
        return {"type": "targeted", "effect": {"action": "nextPurpleExtra"},
                "summary": "All players draw an extra Purple card on their next Purple space"}
    if "transfer your next purple card" in low:
        return {"type": "targeted", "effect": {"action": "transferPurple"},
                "summary": "Transfer your next Purple card effect to another player"}
    if "must discard one held card" in low:
        return {"type": "targeted", "effect": {"action": "discardAll"},
                "summary": "All players must discard one held card (if any)"}

    if re.match(r"^[Uu]se (?:Card Value|Value of Circle)", inst):
        return {"type": "space", "summary": "Use Card Value"}

    # Unknown instruction: fall back to "use space value"
    return {"type": "space", "summary": inst}


def build_card(category, text, index, expansion=None):
    """Turn a raw card text string into a structured card record."""
    tribute = None
    tmatch = re.search(r"\s*\[([^\]]+)\]$", text)
    if tmatch:
        tribute = tmatch.group(1)
        text = text[: tmatch.start()].strip()

    if text.endswith(")"):
        flavor, inst = parse_instruction(text)
    else:
        flavor, inst = text, None
    flavor = flavor.strip()

    effect = parse_effect_instruction(inst)

    card = {
        "id": "{}-{}".format(category, index),
        "category": category,
        "text": flavor,
        "instruction": "({})".format(inst) if inst else "",
        "type": effect["type"],
    }
    if expansion:
        card["expansion"] = expansion

    for key in ("mult", "add", "reduce", "reduce_held", "hold"):
        if key in effect:
            card[key] = effect[key]
    if effect["type"] == "targeted":
        card["effect"] = effect["effect"]
    if tribute:
        card["tribute"] = tribute
    return card


# --------------------------------------------------------------------------
# 5. Main
# --------------------------------------------------------------------------

AMERICA_FIRST_CARD = "Attempt to invalidate certified results triggers constitutional crisis. (Use Card Value)"


def main():
    base = read_base_csv()

    # The master USA.xlsx contains the base game followed by the contiguous
    # "Civil Unrest: America" expansion block (6 cards each in the red, blue,
    # green, purple, orange and black categories = 36 cards).  Locate that
    # block by its known first card and take everything from there on.
    master = read_master_xlsx()
    america = {"decks": {"green": [], "yellow": [], "blue": [], "purple": [], "orange": [], "red": []},
               "black": []}

    america_rows = None
    for i, (cat, text) in enumerate(master):
        if text.startswith("Attempt to invalidate certified results"):
            america_rows = master[i:]
            break
    if not america_rows:
        print("ERROR: could not locate the America expansion block in", XLSX_PATH)
        sys.exit(1)

    for cat, text in america_rows:
        key = category_key(cat)
        if not key:
            continue
        if key == "black":
            america["black"].append(text)
        else:
            america["decks"][key].append(text)

    # Build structured output
    categories = {
        "green":  {"name": "Economic Pressure", "sub": "Debt Crisis \u00b7 Inflation \u00b7 Labor Strikes",
                   "color": "#7ab490"},
        "yellow": {"name": "Natural Disasters & Climate", "sub": "Hurricane \u00b7 Wildfire \u00b7 Drought",
                   "color": "#f0e06a"},
        "blue":   {"name": "Civil Discord & Identity", "sub": "Mass Protest \u00b7 Censorship \u00b7 Ethnic Tension",
                   "color": "#5690a3"},
        "purple": {"name": "Global Influence & Interference", "sub": "Proxy War \u00b7 Sanctions \u00b7 Cyberattack",
                   "color": "#800080"},
        "orange": {"name": "Demographics & Immigration", "sub": "Refugee Wave \u00b7 Aging Population \u00b7 Brain Drain",
                   "color": "#f7a541"},
        "red":    {"name": "Reform & Resource Tokens", "sub": "Used to reduce unrest or reform",
                   "color": "#b73a28"},
        "black":  {"name": "Civil Unrest", "sub": "America expansion \u00b7 drawn on fist spaces",
                   "color": "#1b1a15"},
    }

    decks = {}
    for key, texts in base.items():
        decks[key] = [build_card(key, t, i) for i, t in enumerate(texts)]

    america_out = {"decks": {}, "black": []}
    for key, texts in america["decks"].items():
        america_out["decks"][key] = [build_card(key, t, i, expansion="america")
                                     for i, t in enumerate(texts)]
    america_out["black"] = [build_card("black", t, i, expansion="america")
                            for i, t in enumerate(america["black"])]

    def jsdump(obj):
        return json.dumps(obj, indent=1, ensure_ascii=False)

    os.makedirs(os.path.join(ROOT, "game", "js"), exist_ok=True)

    with open(OUT_CARDS, "w", encoding="utf-8") as fh:
        fh.write("/* AUTO-GENERATED by tools/generate_deck.py from the physical Civil Unrest deck. */\n")
        fh.write("window.CU_CARDS = ")
        fh.write(jsdump({"categories": categories, "decks": decks}))
        fh.write(";\n")

    with open(OUT_USA, "w", encoding="utf-8") as fh:
        fh.write("/* AUTO-GENERATED by tools/generate_deck.py from the Civil Unrest: America expansion (USA.xlsx). */\n")
        fh.write("window.CU_AMERICA = ")
        fh.write(jsdump(america_out))
        fh.write(";\n")

    total = sum(len(d) for d in decks.values())
    amer = sum(len(d) for d in america_out["decks"].values()) + len(america_out["black"])
    print("Base cards:", total)
    for k, v in decks.items():
        print("   {:7} {}".format(k, len(v)))
    print("America cards:", amer)
    for k, v in america_out["decks"].items():
        print("   {:7} {}".format(k, len(v)))
    print("   black  ", len(america_out["black"]))
    print("Wrote", OUT_CARDS)
    print("Wrote", OUT_USA)


if __name__ == "__main__":
    main()
