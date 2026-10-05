#!/bin/sh
# Rebuild the crew's models for the site: mesh and skeleton only (the site animates
# them live). Needs Blender; set BLENDER if it isn't in /Applications.
#
#   blender/build.sh            every character
#   blender/build.sh bolt cat   just these
set -e
cd "$(dirname "$0")"
BLENDER=${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}
names=${*:-$("$BLENDER" -b --factory-startup -P export.py -- --list 2>/dev/null | sed -n 's/^CHARACTERS //p')}
mkdir -p build ../models
for name in $names; do
  "$BLENDER" -b --factory-startup -P export.py -- "$name" "build/$name.raw.glb" 2>&1 | grep -E '^EXPORTED|Error|Traceback' || true
  npx -y @gltf-transform/cli@4.5.1 meshopt "build/$name.raw.glb" "../models/$name.glb" --level medium >/dev/null
  echo "$name: $(wc -c < "../models/$name.glb" | tr -d ' ') bytes"
done
