#!/usr/bin/env bash
# Encode each .webm under src/assets/ to a high-quality animated .gif sibling
# for iOS/macOS Safari compatibility. VP8/VP9 WebM alpha is decoded as opaque
# on iOS Safari and Telegram Mini Apps on iOS; animated GIF is universally
# supported and preserves transparency (1-bit) on every browser.
#
# High-quality palette workflow (two-pass):
#   palettegen=stats_mode=full:reserve_transparent=1  — build optimal 256-color
#     palette across all frames, reserving one slot for transparent.
#   paletteuse=dither=bayer:bayer_scale=3:alpha_threshold=128  — map video to
#     palette with ordered Bayer dither (smooth gradients, small file size)
#     and binary-cut alpha at 50% threshold (sharp transparent edges, no
#     opaque halo).
#
# Sources are huge (2160p) but rendered tiny on screen — downscale to keep
# .gif files small. Framerate set to 30 fps for smooth motion.
#
# Usage:  npm run encode-alpha
#         bash scripts/encode-alpha-gif.sh [--force]
#
# --force  Re-encode even if the .gif is newer than the .webm.
#
# Uses `nix-shell -p ffmpeg` so contributors don't need a local install.

set -euo pipefail

FORCE=0
if [[ "${1:-}" == "--force" ]]; then FORCE=1; fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ASSETS="$ROOT/src/assets"

if ! command -v nix-shell >/dev/null 2>&1; then
  echo "nix-shell not found. Install Nix: https://nixos.org/download" >&2
  exit 1
fi

mapfile -t WEBMS < <(find "$ASSETS" -type f -name "*.webm" | sort)

if [[ ${#WEBMS[@]} -eq 0 ]]; then
  echo "no .webm files under $ASSETS"
  exit 0
fi

# Per-asset target height. -2 width keeps aspect ratio (even-aligned).
# Retina-heavy sizes — GIFs are rendered smaller than their native size so
# sampling looks crisp, and the GIF dither is less visible at smaller zoom.
height_for() {
  case "$1" in
    circle-appear.webm) echo 480 ;;
    loader.webm)        echo 420 ;;
    wink.webm)          echo 480 ;;
    eyes.webm)          echo 420 ;;
    tour-chat.webm)     echo 640 ;;
    tour-browser.webm)  echo 640 ;;
    tour-email.webm)    echo 640 ;;
    *)                  echo 480 ;;
  esac
}

# Per-asset fps. Higher fps = smoother motion, bigger file.
fps_for() {
  case "$1" in
    tour-*.webm) echo 30 ;;
    *)           echo 30 ;;
  esac
}

BATCH=""
for WEBM in "${WEBMS[@]}"; do
  GIF="${WEBM%.webm}.gif"
  BASE="$(basename "$WEBM")"
  if [[ $FORCE -eq 0 && -f "$GIF" && "$GIF" -nt "$WEBM" ]]; then
    echo "skip  $(basename "$GIF") (up to date)"
    continue
  fi
  H=$(height_for "$BASE")
  F=$(fps_for "$BASE")
  BATCH+="  echo '>>  '$BASE' → '$(basename "$GIF")' (h=$H, fps=$F)';"
  # Single-pass palette chain: split the video, generate a palette from the
  # full stream, then apply it. reserve_transparent=1 keeps one palette slot
  # for fully-transparent pixels; alpha_threshold=128 makes edges binary at
  # 50% (clean silhouette, no black halo). Bayer dithering is smaller than
  # floyd-steinberg and looks great on cartoon art.
  # -c:v libvpx-vp9 is REQUIRED to decode the WebM's alpha channel. The
  # default `vp9` decoder silently drops alpha (reports pix_fmt=yuv420p even
  # when alpha_mode=1 is set in the stream), which would produce an opaque
  # GIF. libvpx-vp9 decodes to yuva420p so alpha flows through palettegen.
  #
  # Quality-tuned filter chain:
  #   stats_mode=single + new=1  Per-frame optimized palette (256 colors per
  #     frame rather than 256 total across all frames). Much better color
  #     fidelity at the cost of larger files.
  #   dither=sierra2_4a  Error-diffusion dither with minimal inter-frame
  #     trail (unlike floyd_steinberg which leaks errors across frames and
  #     causes visible shimmer on animations). Smoother gradients than bayer.
  #   alpha_threshold=128  Binary cutout at 50% — sharp silhouette, no halo.
  # Global palette (stats_mode=full, no new=1) — enables gifsicle's inter-
  # frame diffing to find pixels that didn't change and skip them. Per-frame
  # palettes look marginally better on frames with unique hues but blow up
  # file size and defeat frame diffing.
  BATCH+="  ffmpeg -y -hide_banner -loglevel error"
  BATCH+="    -c:v libvpx-vp9"
  BATCH+="    -i '$WEBM'"
  BATCH+="    -vf \"fps=$F,scale=-2:$H:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=full:reserve_transparent=1[p];[s1][p]paletteuse=dither=sierra2_4a:alpha_threshold=128\""
  BATCH+="    '$GIF' || exit 1;"
  # gifsicle post-process:
  #   -O3                maximum optimization incl. inter-frame diffing.
  #   --lossy=30         imperceptibly nudges pixel colors so that LZW
  #                      compresses tighter; ~30% smaller, no visible change.
  #   --careful          keep output compatible with legacy decoders.
  BATCH+="  gifsicle -O3 --lossy=30 --careful -b '$GIF' || exit 1;"
done

if [[ -z "$BATCH" ]]; then
  echo "nothing to encode."
  exit 0
fi

echo "entering nix-shell with ffmpeg + gifsicle..."
nix-shell -p ffmpeg gifsicle --run "set -e; $BATCH"

echo ""
echo "Done. Encoded files:"
for WEBM in "${WEBMS[@]}"; do
  GIF="${WEBM%.webm}.gif"
  if [[ -f "$GIF" ]]; then
    printf '   %-8s  %s\n' "$(du -h "$GIF" | cut -f1)" "${GIF#$ROOT/}"
  fi
done
