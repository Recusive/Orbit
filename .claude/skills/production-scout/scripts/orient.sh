#!/bin/bash
# Production Scout — Orientation Script
# Runs at the start of each scout session to show what's covered and what's available.
# Usage: bash .claude/skills/production-scout/scripts/orient.sh

# Find project root (nearest directory with CLAUDE.md)
PROJECT_ROOT="$(pwd)"
while [ "$PROJECT_ROOT" != "/" ] && [ ! -f "$PROJECT_ROOT/CLAUDE.md" ]; do
  PROJECT_ROOT="$(dirname "$PROJECT_ROOT")"
done
PRODUCTION_DIR="$PROJECT_ROOT/docs/production"
INDEX_FILE="$PRODUCTION_DIR/INDEX.md"
SCOUT_LOG="$PRODUCTION_DIR/.scout-log"

echo "=== Production Scout Orientation ==="
echo ""

# 1. Show existing briefs
echo "--- Existing Briefs ---"
if [ -d "$PRODUCTION_DIR" ]; then
  ls "$PRODUCTION_DIR"/*.md 2>/dev/null | while read -r f; do
    basename "$f"
  done | sort
  BRIEF_COUNT=$(ls "$PRODUCTION_DIR"/*.md 2>/dev/null | wc -l | tr -d ' ')
  echo ""
  echo "Total briefs: $BRIEF_COUNT"
else
  echo "No production directory found."
fi

echo ""

# 2. Find next available number
NEXT_NUM=1
if [ -d "$PRODUCTION_DIR" ]; then
  LAST_NUM=$(ls "$PRODUCTION_DIR"/[0-9]*.md 2>/dev/null | sed 's/.*\///' | sed 's/-.*//' | sort -n | tail -1)
  if [ -n "$LAST_NUM" ]; then
    NEXT_NUM=$((10#$LAST_NUM + 1))
  fi
fi
echo "--- Next Available Number: $NEXT_NUM ---"
echo ""

# 3. Show scout log (last 10 entries)
echo "--- Recent Scout Activity ---"
if [ -f "$SCOUT_LOG" ]; then
  tail -10 "$SCOUT_LOG"
else
  echo "(No scout log yet — this will be the first run)"
fi

echo ""
echo "=== Ready to scout ==="
