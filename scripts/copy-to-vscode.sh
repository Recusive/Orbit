#!/bin/bash

# Copy built React webview assets to VS Code fork

set -e

VSCODE_PATH="/Users/no9labs/Developer/Recursive/Orbit"
DEST="$VSCODE_PATH/src/vs/workbench/contrib/orbit/browser/media"

echo "Building React app..."
npm run build

echo "Creating destination directory..."
mkdir -p "$DEST"

echo "Copying built assets..."
cp dist/webview/index.js "$DEST/orbit.js"
cp dist/webview/index.css "$DEST/orbit.css"

echo "Done! Copied webview assets to VS Code fork:"
echo "  - $DEST/orbit.js"
echo "  - $DEST/orbit.css"
