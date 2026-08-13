#!/usr/bin/env bash
# Build and locally install the Civil Unrest flatpak.
#
# Requires: flatpak, a flatpak-builder (org.flatpak.Builder or flatpak-builder),
# and the GNOME runtime + SDK (org.gnome.Platform//50 and org.gnome.Sdk//50).
# If you have never built anything before, install them once with:
#
#   flatpak remote-add --if-not-exists --user flathub \
#     https://dl.flathub.org/repo/flathub.flatpakrepo
#   flatpak install --user flathub org.gnome.Platform//50 org.gnome.Sdk//50 \
#     org.flatpak.Builder
#
# Usage: ./build.sh [--install] [--run]
set -euo pipefail

cd "$(dirname "$0")"

APP_ID="com.demaio.CivilUnrest"
REPO_DIR="repo"
INSTALL=0
RUN=0
for arg in "$@"; do
  [ "$arg" = "--install" ] && INSTALL=1
  [ "$arg" = "--run" ] && RUN=1
done

if flatpak info org.flatpak.Builder >/dev/null 2>&1; then
  BUILDER="flatpak run org.flatpak.Builder"
elif command -v flatpak-builder >/dev/null 2>&1; then
  BUILDER="flatpak-builder"
else
  echo "ERROR: install org.flatpak.Builder or flatpak-builder first." >&2
  exit 1
fi

rm -rf "$REPO_DIR"
if [ "$INSTALL" = "1" ]; then
  $BUILDER --user --install --force-clean --ccache \
    --repo="$REPO_DIR" build "$APP_ID.yaml"
else
  $BUILDER --force-clean --ccache --repo="$REPO_DIR" build "$APP_ID.yaml"
fi

if [ "$RUN" = "1" ]; then
  flatpak run "$APP_ID"
fi

echo "Built $APP_ID in $REPO_DIR"
