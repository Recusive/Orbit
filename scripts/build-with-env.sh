#!/bin/bash
# Load .env file and run tauri build with signing/notarization credentials
# This script ensures environment variables are properly exported to tauri build
#
# Tauri reads these env vars for macOS code signing:
# - APPLE_SIGNING_IDENTITY: Certificate name for codesign
# - APPLE_ID: Apple ID for notarization
# - APPLE_PASSWORD: App-specific password for notarization
# - APPLE_TEAM_ID: Team ID for notarization

set -e

# Load .env if it exists (for notarization credentials)
if [ -f .env ]; then
  echo "Loading .env for code signing and notarization..."
  set -a  # Auto-export all variables
  source .env
  set +a
  echo "  APPLE_SIGNING_IDENTITY: ${APPLE_SIGNING_IDENTITY:-(not set)}"
  echo "  APPLE_ID: ${APPLE_ID:-(not set)}"
  echo "  APPLE_TEAM_ID: ${APPLE_TEAM_ID:-(not set)}"
  echo "  APPLE_PASSWORD: ${APPLE_PASSWORD:+****}"
else
  echo "Warning: No .env file found - build will be unsigned"
  echo "  To enable signing/notarization, copy .env.example to .env and fill in credentials"
fi

echo ""
echo "Running tauri build..."
exec tauri build "$@"
