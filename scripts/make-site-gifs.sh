#!/usr/bin/env bash
# Regenerate the landing page's demo clips from a screen recording.
#
#   ./scripts/make-site-gifs.sh "/path/to/Screen Recording.mov"
#
# Why this exists: the cuts below are not arbitrary. Each one avoids a stretch of
# the recording where the app was still loading and showing a blank white page —
# 97-108s and 133-140s in the Playground, plus a Storybook skeleton around 84-90s.
# Re-deriving those ranges by hand costs an hour; losing them means shipping a
# clip of a blank page. If you re-record, re-check them before trusting these
# timestamps.
#
# Output is FULL RESOLUTION (the recording's native size). The clips are displayed
# at roughly half their pixel width on the page, which is what keeps them sharp on
# a Retina display — a GIF sized to its CSS width renders soft there. That costs
# real bytes, so every clip is lazy-loaded.
set -euo pipefail

SRC="${1:?usage: make-site-gifs.sh <recording.mov>}"
OUT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../site/media" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# name | start | duration | fps | max_colors
#
# fps is per-clip: 7 is enough for a cursor moving over static panels, 8 for the
# scrolling ones. max_colors drops to 128 for the photo-heavy Playground clip,
# which is 3x the size of the others at a full palette for no visible gain.
CLIPS=(
  "ide-editor|3|9|7|256"
  "design-system|20|8|7|256"
  "storybook|50|9|8|256"
  "playground|113|8|7|128"
  "canvas-edit|153|11|8|256"
)

for spec in "${CLIPS[@]}"; do
  IFS='|' read -r name ss dur fps colors <<< "$spec"
  pal="$TMP/$name.png"

  # Two passes: build a palette from the clip's own frames, then map onto it.
  # stats_mode=diff weights the palette toward what actually MOVES, which matters
  # when most of the frame is a static dark panel.
  ffmpeg -y -v error -ss "$ss" -t "$dur" -i "$SRC" \
    -vf "fps=$fps,palettegen=max_colors=$colors:stats_mode=diff" "$pal"

  # dither=none: the UI is flat colour, and dithering it adds noise and bytes.
  # The output label + -map is required — without it ffmpeg tries to mux the
  # palette PNG as a second video stream and the GIF muxer refuses.
  ffmpeg -y -v error -ss "$ss" -t "$dur" -i "$SRC" -i "$pal" \
    -filter_complex "[0:v]fps=$fps[x];[x][1:v]paletteuse=dither=none:diff_mode=rectangle[o]" \
    -map "[o]" "$OUT/$name.gif"

  size="$(du -h "$OUT/$name.gif" | cut -f1)"
  dim="$(ffprobe -v error -select_streams v -show_entries stream=width,height -of csv=p=0 "$OUT/$name.gif")"
  printf '%-15s %-7s %s\n' "$name" "$size" "$dim"
done

echo "---"
du -ch "$OUT"/*.gif | tail -1
