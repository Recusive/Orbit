#!/bin/bash
# Check dev-monitor output

DEVMON_DIR=".dev-monitor"
TODAY=$(date +%Y-%m-%d)
EVENTS_FILE="$DEVMON_DIR/events-$TODAY.jsonl"

echo "═══════════════════════════════════════════════════════════"
echo "  Dev-Monitor Status Check"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Check if directory exists
if [ ! -d "$DEVMON_DIR" ]; then
    echo "❌ Directory $DEVMON_DIR does not exist"
    echo "   The app needs to run first with 'pnpm tauri dev'"
    exit 1
fi

echo "✅ Directory exists: $DEVMON_DIR"
echo ""

# List files
echo "📁 Files in $DEVMON_DIR:"
ls -lh "$DEVMON_DIR"
echo ""

# Check today's events file
if [ ! -f "$EVENTS_FILE" ]; then
    echo "⚠️  No events file for today ($TODAY)"
    echo "   Looking for other event files..."
    ls "$DEVMON_DIR"/*.jsonl 2>/dev/null || echo "   No .jsonl files found"
    exit 1
fi

echo "✅ Events file exists: $EVENTS_FILE"
echo ""

# Count total events
TOTAL=$(wc -l < "$EVENTS_FILE" | tr -d ' ')
echo "📊 Total events: $TOTAL"
echo ""

# Count by severity
echo "📊 Events by severity:"
cat "$EVENTS_FILE" | jq -r '.severity' 2>/dev/null | sort | uniq -c | sort -rn || echo "   (jq not available)"
echo ""

# Count by category (top 10)
echo "📊 Top 10 categories:"
cat "$EVENTS_FILE" | jq -r '.category' 2>/dev/null | sort | uniq -c | sort -rn | head -10 || echo "   (jq not available)"
echo ""

# Show last 5 events
echo "📋 Last 5 events:"
tail -5 "$EVENTS_FILE" | jq -c '.' 2>/dev/null || tail -5 "$EVENTS_FILE"
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "  ✅ Dev-Monitor is working!"
echo "═══════════════════════════════════════════════════════════"
