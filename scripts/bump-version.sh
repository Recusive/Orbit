#!/usr/bin/env bash
# ──────────────────────────────────────────────
# bump-version.sh — Update version across all manifests and tag the release.
#
# Usage:
#   ./scripts/bump-version.sh 0.0.2
#
# What it does:
#   1. Updates version in package.json, Cargo.toml (workspace), and tauri.conf.json
#   2. Stages the changed files
#   3. Creates a git commit and tag
# ──────────────────────────────────────────────

set -euo pipefail

NEW_VERSION="${1:-}"

if [ -z "$NEW_VERSION" ]; then
  echo "Usage: $0 <version>"
  echo "  Example: $0 0.0.2"
  exit 1
fi

# Validate semver-ish format (x.y.z)
if ! echo "$NEW_VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "Error: Version must be in x.y.z format (e.g. 0.0.2)"
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Bumping version to $NEW_VERSION..."

# 1. package.json (root)
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$NEW_VERSION\"/" "$REPO_ROOT/package.json"
echo "  ✓ package.json"

# 2. Cargo.toml (workspace)
sed -i '' "s/^version = \"[^\"]*\"/version = \"$NEW_VERSION\"/" "$REPO_ROOT/Cargo.toml"
echo "  ✓ Cargo.toml"

# 3. tauri.conf.json
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$NEW_VERSION\"/" "$REPO_ROOT/src-tauri/tauri.conf.json"
echo "  ✓ src-tauri/tauri.conf.json"

# 4. Stage + commit + tag
git -C "$REPO_ROOT" add package.json Cargo.toml src-tauri/tauri.conf.json
git -C "$REPO_ROOT" commit -m "chore: bump version to v$NEW_VERSION"
git -C "$REPO_ROOT" tag "v$NEW_VERSION"

echo ""
echo "Done! Version bumped to v$NEW_VERSION"
echo "  Run 'git push && git push --tags' to trigger the release workflow."
