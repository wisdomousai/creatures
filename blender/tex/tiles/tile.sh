#!/bin/sh
# A room's picture at 4K from the 1536x1024 one (Codex's image tool makes no bigger): cut into
# 3x3 overlapping crops (split.py), each repainted in detail by Codex with the whole picture
# beside it, four runs at a time, then stitched back together, blended over the overlaps, at
# 3840x2560 (stitch.py).
#
#   blender/tex/tiles/tile.sh WORKDIR NAME...
#
# WORKDIR holds NAME-ref.png for each NAME (e.g. office-ref.png, the picture Codex drew
# into the guide); NAME.png comes out there, and the crops and their repaints in
# WORKDIR/tiles/ (a repaint already there is kept, so a stopped run picks up where it was).
# Then ship it: python3 blender/tex/pictures.py ROOM WORKDIR/NAME.png.
here="$(cd "$(dirname "$0")" && pwd)"
cd "$1" || exit 1
shift
mkdir -p tiles
tile() { # NAME I J
  out="tiles/$1-$2-$3.png"
  [ -f "$out" ] && return 0
  codex exec --skip-git-repo-check -s workspace-write -C "$(pwd)" -i "$1-ref.png" -i "tiles/$1-$2-$3-crop.png" -- \
    "Use your image generation tool to make exactly one landscape 1536x1024 image, then copy the generated PNG into this folder as $out. Do nothing else: no code, no other files, no edits.

The first attached image is a whole picture of a room; the second is one part of it (column $2, row $3 of a 3 by 3 grid of overlapping parts), blown up and soft. Repaint that second image at full size with much more fine detail, as if it were part of a 4K version of the first. Keep everything exactly where it is in the second image: every edge, line, corner, frame, board, shelf, leaf and patch of light in the same place and the same size, and the same colours and light, so it lines up seamlessly with its neighbouring parts when they are stitched together. Add only detail: crisp clean edges and fine, believable detail in the materials and things (wood grain, book spines, leaves, metal, glass). Style: the first image's clean, modern digital illustration: smooth even surfaces, soft gradients, gentle shadows, crisp clean edges, like a polished animated-film background. Not photorealistic. Not painterly: no brushstrokes, no grain, no noise, no speckle, no pixelation, not blurry. No people, no animals, no readable text, no border, no new objects." > "tiles/log-$1-$2-$3.txt" 2>&1 < /dev/null
}
for name in "$@"; do
  python3 "$here/split.py" "$name"
  for j in 0 1 2; do for i in 0 1 2; do
    while [ "$(jobs -p | wc -l)" -ge 4 ]; do sleep 5; done
    tile "$name" "$i" "$j" &
  done; done
done
wait
for name in "$@"; do python3 "$here/stitch.py" "$name"; done
