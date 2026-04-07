#!/bin/bash
# Convert wallpaper.png to optimized jpg + tiny blur version.
# Usage: bun run wallpaper (or bash scripts/convert-wallpaper.sh)

set -euo pipefail

DIR="$(dirname "$0")/../src/assets/wallpapers"
SRC="$DIR/wallpaper.png"
OUT="$DIR/wallpaper.jpg"
TINY="$DIR/wallpaper-tiny.jpg"

if [ ! -f "$SRC" ]; then
  echo "❌ $SRC not found"
  exit 1
fi

echo "📸 Converting wallpaper.png → wallpaper.jpg (quality 85)..."
sips -s format jpeg -s formatOptions 85 "$SRC" --out "$OUT" >/dev/null 2>&1

echo "🔍 Creating tiny blur version (192x108, quality 50)..."
sips -s format jpeg -s formatOptions 85 "$SRC" --out "$TINY" >/dev/null 2>&1
sips -z 108 192 "$TINY" --out "$TINY" >/dev/null 2>&1
sips -s formatOptions 50 "$TINY" --out "$TINY" >/dev/null 2>&1

echo ""
echo "✅ Done:"
ls -lh "$SRC" "$OUT" "$TINY" | awk '{print "   " $5 "\t" $NF}'
