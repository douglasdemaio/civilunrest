#!/usr/bin/env python3
"""Generate Banana cards from Banana.csv + Banana.svg.

Every card is auto-fitted: the text is word-wrapped and the font size is
shrunk until the whole block is guaranteed to sit inside the printed card
at 1125x1125 px. Nothing has to be resized by hand.

Usage:
    ./generate.py                 # build every card
    ./generate.py "Gunboats"      # build only cards whose text matches
    ./generate.py --no-art        # skip the vector motifs
"""

import csv
import math
import os
import re
import sys

import cairosvg
from PIL import Image, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
CSV_FILE = os.path.join(HERE, "Banana.csv")
OUT_DIR = os.path.join(HERE, "output")
TEMPLATE = os.path.join(HERE, "Banana.svg")

CARD_U = 89.0            # viewBox is 0 0 89 89
CARD_PX = 1125           # exported PNG size
U2P = CARD_PX / CARD_U   # px per viewBox unit (~12.64)

MARGIN = 6.2             # text must stay inside this inset
TEXT_W = CARD_U - 2 * MARGIN

ART_TOP, ART_H = 8.6, 13.0          # optional motif band
TEXT_TOP_WITH_ART = ART_TOP + ART_H + 2.6
TEXT_TOP_PLAIN = 8.8
TEXT_BOTTOM = 82.0

FONT_DIR = os.path.expanduser(
    "~/.local/share/fonts/Studio Rene Bieder/TrueType/SUSE")
FONT_REG = os.path.join(FONT_DIR, "SUSE_Thin_VF_[wght].ttf")

INK = "#426e7d"      # card text colour (teal)
SEC = "#f4d03f"      # secondary colour (yellow) - effect line
PARCH = "#e9ddaf"
FRAME = "#6b4f1d"
BAD = "#8f2d1e"     # motif accent
GOOD = "#2c6b3f"    # motif accent

_fcache = {}


def font(px_size, weight="Regular"):
    key = (round(px_size, 1), weight)
    if key not in _fcache:
        f = ImageFont.truetype(FONT_REG, max(1, int(round(px_size))))
        try:
            names = [n.decode() if isinstance(n, bytes) else n
                     for n in f.get_variation_names()]
            f.set_variation_by_name(weight if weight in names else "Regular")
        except Exception:
            pass
        _fcache[key] = f
    return _fcache[key]


def text_w(s, size_u, weight="Regular"):
    """Width of s in viewBox units at font size size_u (viewBox units)."""
    px = size_u * U2P
    return font(px, weight).getlength(s) / U2P


def wrap(s, size_u, max_w, weight="Regular"):
    words, lines, cur = s.split(), [], ""
    for w in words:
        trial = w if not cur else cur + " " + w
        if text_w(trial, size_u, weight) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def parse_card(raw):
    """Split 'Story.(Effect)' into (story, effect)."""
    raw = raw.strip()
    m = re.match(r"^(.*?)\s*\(([^()]*)\)\s*$", raw)
    if m and m.group(1).strip():
        return m.group(1).strip(), m.group(2).strip()
    return raw, None


# ---------------------------------------------------------------- motifs
# Each motif is drawn in a local 0..100 box and scaled into the art band.
M = {}


def _motif(name):
    def deco(fn):
        M[name] = fn
        return fn
    return deco


@_motif("field")
def _field():
    o = []
    for i, y in enumerate((58, 74, 90)):
        o.append(f'<line x1="8" y1="{y}" x2="92" y2="{y}" stroke="{FRAME}" '
                 f'stroke-width="2.4" stroke-linecap="round" opacity="0.75"/>')
        for x in (20 + i * 6, 44, 68 - i * 4):
            o.append(
                f'<path d="M{x},{y} l0,-16 M{x},{y-8} l-7,-7 M{x},{y-8} '
                f'l7,-7" stroke="{FRAME}" stroke-width="2.2" fill="none" '
                f'stroke-linecap="round"/>')
    return "".join(o)


@_motif("newspaper")
def _newspaper():
    o = [f'<rect x="14" y="16" width="72" height="68" fill="#f6efdd" '
         f'stroke="{FRAME}" stroke-width="2.6" rx="2"/>',
         f'<rect x="20" y="22" width="60" height="12" fill="{BAD}"/>']
    for i, y in enumerate((44, 54, 64, 74)):
        w = 60 if i % 2 == 0 else 42
        o.append(f'<line x1="20" y1="{y}" x2="{20+w}" y2="{y}" '
                 f'stroke="{FRAME}" stroke-width="2.6" stroke-linecap="round"/>')
    return "".join(o)


@_motif("mine")
def _mine():
    return (f'<path d="M6,88 L34,30 L56,62 L70,40 L94,88 Z" fill="#b79b6a" '
            f'stroke="{FRAME}" stroke-width="2.6" stroke-linejoin="round"/>'
            f'<path d="M34,30 L46,55 L22,55 Z" fill="#f6efdd" opacity="0.85"/>'
            f'<path d="M20,88 L20,64 M20,64 l10,-10 M20,70 l-9,-9" '
            f'stroke="{FRAME}" stroke-width="2.6" fill="none" '
            f'stroke-linecap="round"/>')


@_motif("storm")
def _storm():
    o = [f'<path d="M24,50 a12,12 0 0,1 6,-22 a16,16 0 0,1 30,-4 '
         f'a13,13 0 0,1 22,10 a11,11 0 0,1 -4,22 Z" fill="#9fb6c4" '
         f'stroke="{FRAME}" stroke-width="2.4"/>']
    for x in (30, 46, 62, 78):
        o.append(f'<line x1="{x}" y1="58" x2="{x-6}" y2="84" stroke="#426e7d" '
                 f'stroke-width="3" stroke-linecap="round"/>')
    return "".join(o)


@_motif("drought")
def _drought():
    o = [f'<circle cx="50" cy="32" r="15" fill="#f4d03f" stroke="{FRAME}" '
         f'stroke-width="2.4"/>']
    for a in range(0, 360, 45):
        r = math.radians(a)
        x1, y1 = 50 + 19 * math.cos(r), 32 + 19 * math.sin(r)
        x2, y2 = 50 + 27 * math.cos(r), 32 + 27 * math.sin(r)
        o.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" '
                 f'y2="{y2:.1f}" stroke="{FRAME}" stroke-width="2.6" '
                 f'stroke-linecap="round"/>')
    o.append(f'<line x1="8" y1="72" x2="92" y2="72" stroke="{FRAME}" '
             f'stroke-width="2.8" stroke-linecap="round"/>')
    o.append(f'<line x1="8" y1="86" x2="92" y2="86" stroke="{FRAME}" '
             f'stroke-width="2.8" stroke-linecap="round"/>')
    for x, y in ((28, 72), (60, 72), (44, 86), (76, 72), (16, 86)):
        o.append(f'<path d="M{x},{y} l0,12" stroke="{FRAME}" '
                 f'stroke-width="2.4" stroke-linecap="round"/>')
    return "".join(o)


@_motif("army")
def _army():
    return (f'<path d="M50,10 L86,24 V52 c0,22 -18,34 -36,42 '
            f'C32,86 14,74 14,52 V24 Z" fill="#7d8a6a" stroke="{FRAME}" '
            f'stroke-width="2.8" stroke-linejoin="round"/>'
            f'<path d="M50,30 l5.9,12 13.2,1.9 -9.6,9.3 2.3,13.1 '
            f'-11.8,-6.2 -11.8,6.2 2.3,-13.1 -9.6,-9.3 13.2,-1.9 Z" '
            f'fill="{BAD}" stroke="{FRAME}" stroke-width="1.4"/>')


@_motif("march")
def _march():
    o = []
    for i, (x, s) in enumerate(((22, 1.0), (50, 1.15), (78, 1.0))):
        o.append(f'<circle cx="{x}" cy="{24}" r="{9*s}" fill="#c9a227" '
                 f'stroke="{FRAME}" stroke-width="2.2"/>'
                 f'<path d="M{x},{34} l0,{26} M{x-10},{44} l20,0 '
                 f'M{x},{60} l-{8*s},22 M{x},{60} l{8*s},22" stroke="{FRAME}" '
                 f'stroke-width="2.6" fill="none" stroke-linecap="round"/>')
    o.append(f'<line x1="6" y1="90" x2="94" y2="90" stroke="{FRAME}" '
             f'stroke-width="3" stroke-linecap="round"/>')
    return "".join(o)


@_motif("ballot")
def _ballot():
    return (f'<rect x="16" y="44" width="68" height="44" fill="#b79b6a" '
            f'stroke="{FRAME}" stroke-width="2.8" rx="3"/>'
            f'<rect x="34" y="50" width="32" height="5" fill="{FRAME}"/>'
            f'<rect x="28" y="10" width="44" height="38" fill="#f6efdd" '
            f'stroke="{FRAME}" stroke-width="2.6" rx="2"/>'
            f'<path d="M38,30 l8,9 18,-20" stroke="{GOOD}" stroke-width="5" '
            f'fill="none" stroke-linecap="round" stroke-linejoin="round"/>')


@_motif("radio")
def _radio():
    o = [f'<line x1="70" y1="34" x2="88" y2="10" stroke="{FRAME}" '
         f'stroke-width="2.8" stroke-linecap="round"/>',
         f'<rect x="12" y="34" width="62" height="46" fill="#b79b6a" '
         f'stroke="{FRAME}" stroke-width="2.8" rx="4"/>',
         f'<circle cx="30" cy="57" r="11" fill="#f6efdd" stroke="{FRAME}" '
         f'stroke-width="2.4"/>']
    for y in (48, 57, 66):
        o.append(f'<line x1="48" y1="{y}" x2="66" y2="{y}" stroke="{FRAME}" '
                 f'stroke-width="2.6" stroke-linecap="round"/>')
    for r in (16, 24):
        o.append(f'<path d="M74,{34-r+2} a{r},{r} 0 0,1 0,{2*r}" fill="none" '
                 f'stroke="{BAD}" stroke-width="2.4" stroke-linecap="round" '
                 f'transform="translate(0,-8)"/>')
    return "".join(o)


@_motif("ship")
def _ship():
    o = [f'<path d="M10,66 h80 l-10,20 H20 Z" fill="#7d8a6a" '
         f'stroke="{FRAME}" stroke-width="2.8" stroke-linejoin="round"/>',
         f'<rect x="34" y="42" width="34" height="24" fill="#b79b6a" '
         f'stroke="{FRAME}" stroke-width="2.4"/>',
         f'<rect x="44" y="24" width="14" height="18" fill="#b79b6a" '
         f'stroke="{FRAME}" stroke-width="2.4"/>']
    for y in (26, 32, 38):
        o.append(f'<circle cx="60" cy="{y}" r="2.6" fill="{FRAME}"/>')
    for x in (12, 34, 56, 78):
        o.append(f'<path d="M{x},90 q6,-6 12,0" fill="none" stroke="#426e7d" '
                 f'stroke-width="2.6" stroke-linecap="round"/>')
    return "".join(o)


@_motif("bank")
def _bank():
    o = [f'<path d="M8,36 L50,12 L92,36 Z" fill="#c9a227" stroke="{FRAME}" '
         f'stroke-width="2.6" stroke-linejoin="round"/>']
    for x in (20, 38, 56, 74):
        o.append(f'<rect x="{x}" y="40" width="10" height="34" fill="#f6efdd" '
                 f'stroke="{FRAME}" stroke-width="2.2"/>')
    o.append(f'<rect x="10" y="76" width="80" height="10" fill="#b79b6a" '
             f'stroke="{FRAME}" stroke-width="2.4"/>')
    return "".join(o)


@_motif("forest")
def _forest():
    o = [f'<line x1="6" y1="90" x2="94" y2="90" stroke="{FRAME}" '
         f'stroke-width="3" stroke-linecap="round"/>']
    for x, base, s in ((20, 90, 0.85), (50, 90, 1.1), (80, 90, 0.9)):
        h1 = 34 * s
        h2 = 46 * s
        w1 = 20 * s
        w2 = 15 * s
        trunk = 8 * s
        o.append(f'<rect x="{x-2.5*s:.1f}" y="{base-trunk:.1f}" '
                 f'width="{5*s:.1f}" height="{trunk:.1f}" fill="{FRAME}"/>')
        o.append(f'<path d="M{x:.1f},{base-trunk-h2:.1f} L{x+w2:.1f},'
                 f'{base-trunk-h2+h2*0.55:.1f} L{x-w2:.1f},'
                 f'{base-trunk-h2+h2*0.55:.1f} Z" fill="#3f6640" '
                 f'stroke="{FRAME}" stroke-width="2.2" '
                 f'stroke-linejoin="round"/>')
        o.append(f'<path d="M{x:.1f},{base-trunk-h1:.1f} L{x+w1:.1f},'
                 f'{base-trunk:.1f} L{x-w1:.1f},{base-trunk:.1f} Z" '
                 f'fill="#4f7a4a" stroke="{FRAME}" stroke-width="2.2" '
                 f'stroke-linejoin="round"/>')
    return "".join(o)


@_motif("river")
def _river():
    o = [f'<path d="M6,30 q14,-12 28,0 t28,0 t28,0" fill="none" '
         f'stroke="#426e7d" stroke-width="4" stroke-linecap="round"/>']
    for x, y in ((34, 56), (62, 56), (48, 74)):
        o.append(f'<path d="M{x},{y} c-8,10 -8,18 0,18 c8,0 8,-8 0,-18 z" '
                 f'fill="#7d8a6a" stroke="{FRAME}" stroke-width="2"/>')
    o.append(f'<line x1="6" y1="90" x2="94" y2="90" stroke="{FRAME}" '
             f'stroke-width="3" stroke-linecap="round"/>')
    return "".join(o)


@_motif("flag")
def _flag():
    return (f'<line x1="24" y1="8" x2="24" y2="92" stroke="{FRAME}" '
            f'stroke-width="4" stroke-linecap="round"/>'
            f'<path d="M24,14 h56 l-12,15 12,15 H24 Z" fill="{BAD}" '
            f'stroke="{FRAME}" stroke-width="2.6" stroke-linejoin="round"/>')


@_motif("banana")
def _banana():
    return (f'<path d="m 20,72 c 24,-14 48,-14 62,-46 c 2,-6 -4,-10 -8,-6 '
            f'c -20,20 -40,26 -56,50 c -3,5 0,8 2,2 z" fill="#f4d03f" '
            f'stroke="{FRAME}" stroke-width="2.6" stroke-linejoin="round"/>'
            f'<path d="M74,24 l8,-6 3,6 -8,5 z" fill="{FRAME}"/>')


MOTIF_KEYWORDS = [
    (("newspaper", "press shut", "censor"), "newspaper"),
    (("radio",), "radio"),
    (("hurricane", "mudslide", "storm", "flood"), "storm"),
    (("drought",), "drought"),
    (("mine", "mining", "copper", "mines"), "mine"),
    (("plantation", "harvest", "crop", "acreage", "pickers"), "field"),
    (("army", "military", "junta", "death squad", "mercenar", "regime",
      "general", "gunboat", "arms embargo", "spy agency", "coup"), "army"),
    (("students", "march", "strike", "union", "workers", "peasant",
      "land seizure", "organizers"), "march"),
    (("election", "referendum", "cabinet"), "ballot"),
    (("bank", "swiss", "bribe", "tax", "concession", "customs",
      "lobbyist", "sanction"), "bank"),
    (("rainforest", "cleared", "evicted", "communities"), "forest"),
    (("river", "poison", "water"), "river"),
    (("palace", "president", "president's", "flag", "embassy", "nation"),
     "flag"),
    (("fruit", "banana", "export crate", "scrip"), "banana"),
]


def pick_motif(text):
    t = text.lower()
    for keys, name in MOTIF_KEYWORDS:
        for k in keys:
            if k in t:
                return name
    return None


# ---------------------------------------------------------------- layout
def _wrap_all(story, effect, size):
    pad_x = size * 0.6
    sl = wrap(story, size, TEXT_W)
    el = (wrap(effect, size, TEXT_W - 2 * pad_x, "Bold")
          if effect else [])
    return sl, el, pad_x


def _metrics(sl, el, size):
    lead = size * 1.24
    gap = size * 0.42 if el else 0.0
    pad_y = size * 0.34
    block_h = (len(sl) + len(el)) * lead + gap + (2 * pad_y if el else 0.0)
    pill_w = (max(text_w(l, size, "Bold") for l in el) + 2 * size * 0.6
              if el else 0.0)
    return lead, gap, pad_y, block_h, pill_w


def fit(story, effect, max_size=5.5, min_size=2.2, with_art=False):
    """Pick font size + line breaks that fit the text zone (with pill pad)."""
    top = TEXT_TOP_WITH_ART if with_art else TEXT_TOP_PLAIN
    zone_h = TEXT_BOTTOM - top
    size = max_size
    while size >= min_size:
        sl, el, _ = _wrap_all(story, effect, size)
        lead, gap, pad_y, block, pill_w = _metrics(sl, el, size)
        widest = max([text_w(l, size) for l in sl] + [pill_w, 0])
        if block <= zone_h and widest <= TEXT_W * 0.98:
            return size, sl, el, lead, gap, top, zone_h
        size -= 0.06
    size = min_size
    sl, el, _ = _wrap_all(story, effect, size)
    lead, gap, pad_y, block, pill_w = _metrics(sl, el, size)
    return size, sl, el, lead, gap, top, zone_h


def build_svg(story, effect, size, story_lines, eff_lines, lead, gap, top,
              zone_h, motif_name=None, bare=False):
    parts = [
        '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
        f'<svg xmlns="http://www.w3.org/2000/svg" version="1.1" '
        f'width="{CARD_U}mm" height="{CARD_U}mm" viewBox="0 0 {CARD_U} {CARD_U}">',
    ]
    if bare:
        parts.append(f'<rect x="0" y="0" width="{CARD_U}" height="{CARD_U}" '
                     f'fill="#ffffff"/>')
    else:
        parts += [
            f'<rect x="-1" y="-1" width="{CARD_U+2}" height="{CARD_U+2}" '
            f'fill="{PARCH}"/>',
            f'<rect x="{MARGIN-1.6}" y="{MARGIN-1.6}" '
            f'width="{CARD_U-2*(MARGIN-1.6)}" '
            f'height="{CARD_U-2*(MARGIN-1.6)}" '
            f'fill="none" stroke="{FRAME}" stroke-width="0.7" rx="2.4" '
            f'opacity="0.85"/>',
        ]
        if motif_name and motif_name in M:
            scale = ART_H / 100.0
            tx = CARD_U / 2 - (100 * scale) / 2
            parts.append(
                f'<g transform="translate({tx:.3f},{ART_TOP:.3f}) '
                f'scale({scale:.4f})">{M[motif_name]()}</g>')

    pad_y = size * 0.34 if eff_lines else 0.0
    block_h = ((len(story_lines) + len(eff_lines)) * lead + gap
               + (2 * pad_y if eff_lines else 0.0))
    y0 = top + max(0.0, (zone_h - block_h) / 2) + size * 0.82
    cx = CARD_U / 2

    tspans = []
    y = y0
    for i, line in enumerate(story_lines):
        tspans.append(
            f'<tspan x="{cx:.3f}" y="{y:.3f}" fill="{INK}" '
            f'font-weight="normal">{esc(line)}</tspan>')
        y += lead

    if eff_lines:
        y += gap
        yf0 = y
        if not bare:
            eff_w = max(text_w(l, size, "Bold") for l in eff_lines)
            pad_x, pad_y = size * 0.6, size * 0.34
            x = cx - eff_w / 2 - pad_x
            w = eff_w + 2 * pad_x
            top_p = yf0 - size * 0.82 - pad_y
            h = (len(eff_lines) - 1) * lead + size * 1.16 + 2 * pad_y
            parts.append(
                f'<rect x="{x:.3f}" y="{top_p:.3f}" width="{w:.3f}" '
                f'height="{h:.3f}" rx="{h/2:.3f}" fill="{INK}"/>')
        fill = "#333333" if bare else SEC
        for line in eff_lines:
            tspans.append(
                f'<tspan x="{cx:.3f}" y="{y:.3f}" fill="{fill}" '
                f'font-weight="bold">{esc(line)}</tspan>')
            y += lead

    parts.append(
        f'<text font-family="SUSE" font-size="{size:.3f}" '
        f'text-anchor="middle" xml:space="preserve">'
        + "".join(tspans) + "</text>")
    parts.append("</svg>")
    return "\n".join(parts)


def esc(s):
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


class Parallel:
    """Parallel map over a worker pool (uses fork where available)."""

    def __init__(self, workers):
        self.workers = workers
        self.pool = None

    def __enter__(self):
        try:
            import multiprocessing
            ctx = multiprocessing.get_context("fork")
            self.pool = ctx.Pool(self.workers)
        except Exception:
            self.pool = None
        return self

    def map(self, fn, items):
        if self.pool is None:
            return [fn(i) for i in items]
        return self.pool.map(fn, items, chunksize=1)

    def __exit__(self, *exc):
        if self.pool is not None:
            self.pool.close()
            self.pool.join()
        return False


# ---------------------------------------------------------------- verify
def render(svg, path):
    cairosvg.svg2png(bytestring=svg.encode("utf-8"), write_to=path,
                     output_width=CARD_PX, output_height=CARD_PX)


def ink_bbox(path, y_from=0, y_to=CARD_PX, thr=110):
    import numpy as np
    im = Image.open(path).convert("L")
    a = np.asarray(im)
    band = a[max(0, y_from):min(a.shape[0], y_to)]
    mask = band < thr
    if not mask.any():
        return None
    ys, xs = np.nonzero(mask)
    return (int(xs.min()), int(ys.min()) + max(0, y_from),
            int(xs.max()), int(ys.max()) + max(0, y_from))


def build_card(idx, raw, want_art=True, filt=None):
    story, effect = parse_card(raw)
    label = f"Banana Card {idx}"
    if filt and filt.lower() not in raw.lower():
        return None

    motif = pick_motif(story) if want_art else None
    with_art = motif is not None

    size, story_lines, eff_lines, lead, gap, top, zone_h = fit(
        story, effect, with_art=with_art)

    safe = int(round((MARGIN - 0.5) * U2P))
    proof_png = os.path.join(OUT_DIR, f".proof-{os.getpid()}.png")
    bb = None
    for _ in range(20):
        proof = build_svg(story, effect, size, story_lines, eff_lines, lead,
                          gap, top, zone_h, bare=True)
        render(proof, proof_png)
        bb = ink_bbox(proof_png)
        if (bb and bb[0] >= safe and bb[2] <= CARD_PX - safe
                and bb[1] >= int(round(top * U2P))
                and bb[3] <= CARD_PX - safe):
            break
        size = max(size * 0.94, 1.6)
        story_lines, eff_lines, _ = _wrap_all(story, effect, size)
        lead, gap, _, _, _ = _metrics(story_lines, eff_lines, size)
    else:
        print(f"  ! {label}: text may overflow (bbox={bb})")

    svg = build_svg(story, effect, size, story_lines, eff_lines, lead, gap,
                    top, zone_h, motif)
    png = os.path.join(OUT_DIR, label + ".png")
    render(svg, png)
    with open(os.path.join(OUT_DIR, label + ".svg"), "w") as f:
        f.write(svg)

    return label, motif, size, len(story_lines) + len(eff_lines), bb


def _job(task):
    idx, raw, want_art = task
    return build_card(idx, raw, want_art)


def main():
    args = [a for a in sys.argv[1:]]
    want_art = "--no-art" not in args
    workers = 1
    filt = None
    it = iter(args)
    for a in it:
        if a in ("-j", "--jobs", "--parallel"):
            workers = int(next(it, "0"))
        elif a.startswith("-j"):
            workers = int(a[2:] or "0")
        elif a.startswith("--parallel="):
            workers = int(a.split("=", 1)[1])
        elif not a.startswith("--"):
            filt = a
    if workers <= 0:
        workers = min(8, os.cpu_count() or 1)

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(CSV_FILE, newline="", encoding="utf-8-sig") as f:
        rows = [r[0].strip() for r in csv.reader(f) if r and r[0].strip()]
    start = 0
    while start < len(rows) and rows[start].strip().lower() == "name":
        start += 1          # skip header row(s)
    cards = rows[start:]

    print(f"{len(cards)} cards -> {OUT_DIR}  (workers={workers})")

    jobs = []
    for i, raw in enumerate(cards, 1):
        if filt and filt.lower() not in raw.lower():
            continue
        jobs.append((i, raw))

    if workers > 1 and len(jobs) > 1:
        tasks = [(i, raw, want_art) for i, raw in jobs]
        with Parallel(workers) as pool:
            results = pool.map(_job, tasks)
    else:
        results = [build_card(i, raw, want_art) for i, raw in jobs]

    built = 0
    for res in results:
        if not res:
            continue
        label, motif, size, nlines, bb = res
        built += 1
        print(f"  {label}: size={size:.2f} lines={nlines} "
              f"motif={motif or '-'} bbox={bb}")
    print(f"done: {built} cards")

    for name in os.listdir(OUT_DIR):
        if name.startswith(".proof"):
            os.remove(os.path.join(OUT_DIR, name))


if __name__ == "__main__":
    main()
