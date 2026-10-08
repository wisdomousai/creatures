"""The rooms' pictures (Codex image generation): each room (library, office, lab, jungle) as one
picture of the whole room from its open front, in one-point perspective, 3840 by 2560 (4K, so a
retina screen never stretches it up), laid surface by surface on the box by
src/box-texture.ts (its GEOMETRY says where the back wall and the corners are
in each).

    python3 blender/tex/pictures.py [ROOM [PNG]]

With PNG the original is kept as blender/pic/ROOM.webp at quality 95 (made 4K if it isn't
yet: blender/tex/tiles/tile.sh does that properly); then the shipping picture is made from it,
models/pic/ROOM.webp at quality 85 (for ROOM, or every room kept when none is given).

The shipping pictures recede a little (RECEDE): lower in contrast and colour, so the room behind
rests and the furniture and the crew in front read first. They aren't blurred: they stay clean.
"""
import sys
from pathlib import Path

from PIL import Image, ImageEnhance

RECEDE = (0.85, 0.85)  # contrast, colour
SIZE = (3840, 2560)

root = Path(__file__).resolve().parents[2]
keep = root / 'blender' / 'pic'
ship = root / 'models' / 'pic'

ship.mkdir(parents=True, exist_ok=True)
rooms = [sys.argv[1]] if len(sys.argv) > 1 else sorted(p.stem for p in keep.glob('*.webp'))
if len(sys.argv) > 2:
    image = Image.open(sys.argv[2]).convert('RGB')
    if image.size != SIZE:
        image = image.resize(SIZE, Image.LANCZOS)
    image.save(keep / f'{rooms[0]}.webp', quality=95, method=6)
for room in rooms:
    image = Image.open(keep / f'{room}.webp').convert('RGB')
    contrast, colour = RECEDE
    image = ImageEnhance.Contrast(image).enhance(contrast)
    image = ImageEnhance.Color(image).enhance(colour)
    out = ship / f'{room}.webp'
    image.save(out, quality=85, method=6)
    print(f'{out.name} {image.size} {out.stat().st_size // 1024} KB')
