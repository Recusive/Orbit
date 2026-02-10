#!/usr/bin/env bash
# build-icons.sh — Compile the Icon Composer .icon file into Assets.car
#
# This enables macOS appearance-aware icons (light, dark, tinted) using
# Apple's Icon Composer format. The .icon file contains layered icon data
# that actool compiles into proper IconGroup/IconImageStack entries with
# NSAppearanceNameDarkAqua and ISAppearanceTintable appearances.
#
# Run before `bunx tauri build` to update src-tauri/resources/Assets.car,
# which Tauri injects into the .app bundle via bundle.macOS.files config.
#
# Usage:
#   ./scripts/build-icons.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TAURI_DIR="$PROJECT_ROOT/src-tauri"
ICON_FILE="$TAURI_DIR/logo.icon"
RESOURCES_DIR="$TAURI_DIR/resources"

if [[ ! -d "$ICON_FILE" ]]; then
    echo "Error: Icon Composer file not found at $ICON_FILE"
    exit 1
fi

mkdir -p "$RESOURCES_DIR"

echo "Compiling Icon Composer file → Assets.car..."
xcrun actool "$ICON_FILE" \
    --compile "$RESOURCES_DIR" \
    --platform macosx \
    --minimum-deployment-target 14.0 \
    --app-icon logo \
    --include-all-app-icons \
    --output-partial-info-plist /dev/null \
    > /dev/null

echo ""
echo "Done. Assets.car updated at $RESOURCES_DIR/Assets.car"
echo "  Icon name: logo (matches CFBundleIconName in Info.plist)"
echo "  Appearances: light, dark, tinted"
echo ""
echo "Tauri will inject this into the .app bundle via bundle.macOS.files config."
echo "Run 'bunx tauri build' to create the production bundle."
