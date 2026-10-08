# The workshop

Every creature's body is a Python script in this folder. Nothing here is sculpted: each
part is placed by numbers, bound to a bone and given a material whose name tells the
browser what it is. So when a shared detail changes (a bezel's thickness, a joint's colour),
the whole crew can be rebuilt over a coffee.

The browser does all the moving, so the models carry a mesh and a skeleton and nothing
else: no animation clips and no textures. [How a creature is made](../docs/how-they-are-made.md)
explains both halves.

## Rebuild

You need Blender 5 (set `BLENDER` if it isn't in `/Applications`) and Node.

```sh
blender/build.sh            # everyone: the crew, the set pieces, the hangings, the toys
blender/build.sh owl cat    # just these two
```

Each one is exported headless, squeezed with meshopt and written to `models/NAME.glb`. The
crew try to stay under 250 KB each.

## Look at them

- **A review sheet**, four views and a thumbnail at the size it's shown:
  `"$BLENDER" -b --factory-startup -P blender/sheet.py -- NAME OUT_DIR [ink|paper|colour] [target_z] [distance]`
- **Portraits**, three quarters on a clear background, one per look:
  `"$BLENDER" -b --factory-startup -P blender/thumbs.py -- models/thumbs [NAME ...]`
- **On the page**: `npm run dev`, then `crew.call('NAME')` in the console.
- **Live in Blender**, with an MCP add-on connected: `live.rebuild(('owl',))` from `live.py`.

## What's here

| File       | What it is                                                                      |
| ---------- | ------------------------------------------------------------------------------- |
| `kit.py`   | The toolbox: superellipsoids, tubes, lathes, tori, screens, armatures, renders. |
| `looks.py` | The ink, paper and colour looks, from `src/palettes.json`.                      |
| `faces.py` | Every screen's layout, for the previews; the same numbers are in `src/`.        |
| `crew.py`  | The roster: every name here is built.                                           |
| `*kit.py`  | What a family shares: cats, dogs, birds, bugs, hooves, fluff, the sea…          |
| `NAME.py`  | One creature: its bones, its parts and their materials.                         |
| `tex/`     | The material maps as generated; `tex/process.py` makes `models/tex/` from them. |
| `pic/`     | The rooms' pictures as generated; `tex/pictures.py` makes `models/pic/`.        |

## Make one

Start from Digby the mole in
[`skills/make-a-creature/example`](../skills/make-a-creature/example): copy `mole.py` here
as `NAME.py`, change it into something else, and `blender/build.sh NAME`. The
[make-a-creature skill](../skills/make-a-creature/SKILL.md) has the whole recipe, from the
first shape to its card in the crew.
