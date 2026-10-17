#!/bin/bash
# Build every Banana card from Banana.csv + Banana.svg.
#
# Text is auto-fitted (wrapped + font-size shrunk) so it always sits inside
# the card at 1125x1125 px -- no hand-resizing needed. Renders PNG with
# cairosvg; the SVGs are plain Inkscape-compatible files, so they can also be
# re-exported with `inkscape --export-type=png` if you prefer.
#
#   ./generate.py                 build all cards
#   ./generate.py "national"      build only matching cards
#   ./generate.py --no-art        skip the vector motifs

set -euo pipefail
cd "$(dirname "$0")"

run() {
  local py="$1"; shift
  exec "$py" generate.py "$@"
}

# Prefer a python that already has cairosvg, then common venvs.
for py in "${PYTHON:-}" python3 /tmp/opencode/svgenv/bin/python; do
  [ -n "$py" ] || continue
  command -v "$py" >/dev/null 2>&1 || continue
  if "$py" -c 'import cairosvg' >/dev/null 2>&1; then
    run "$py" "$@"
  fi
done

cat >&2 <<'EOM'
error: no python with 'cairosvg' found.

Install it with one of:
  pip install --user --break-system-packages cairosvg
  python3 -m venv /tmp/opencode/svgenv && /tmp/opencode/svgenv/bin/pip install cairosvg
EOM
exit 1
