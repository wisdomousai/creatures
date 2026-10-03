# Building the creatures

Each creature is modelled by a Python script here, in Blender, and animated live by the
package (`src/`): the models carry a mesh and a skeleton and nothing else, no clips and
no textures. Every joint is posed each frame by springs chasing targets the creature's
code sets.

## Rebuild the models

Needs Blender 5 (set `BLENDER` if it isn't in `/Applications`) and Node (for
`npx @gltf-transform/cli`).

```sh
blender/build.sh            # everyone
blender/build.sh owl cat    # just these
```

That runs `export.py` headless for each name in `crew.py`, compresses the result with
meshopt, and writes `models/NAME.glb`.

## Look at them

- **Review sheets** (four views, and a thumbnail at site size):
  `Blender -b --factory-startup -P blender/sheet.py -- NAME OUT_DIR [ink|paper|colour] [target_z] [distance]`
- **Portraits** (three quarters, on a clear background, one per look):
  `Blender -b --factory-startup -P blender/thumbs.py -- models/thumbs [NAME ...]`
- **In the playground**: `npm run dev`, then `crew.call('NAME')` in the console.
- **Live in Blender** (with an MCP add-on): `live.rebuild(('owl',))` from `live.py`.

## The files

| File       | What it is                                                                             |
| ---------- | -------------------------------------------------------------------------------------- |
| `kit.py`   | Building blocks: superellipsoids, tubes, tori, screens, armatures, materials, renders. |
| `looks.py` | The ink, paper and colour looks, from `src/palettes.json`.                             |
| `faces.py` | The screen faces for previews; must match `src/face.ts`.                               |
| `crew.py`  | The roster: every name here gets built and exported.                                   |
| `*kit.py`  | What a family shares (cats, dogs, birds, bugs, hooves, the sea…).                      |
| `NAME.py`  | One creature: a `D` table of dimensions, `rig_bones()`, `build(look)`.                 |

## Adding a creature

1. `blender/NAME.py` with `FACE`, `PREVIEW`, `build(look='ink', flame=None)`. Name
   materials by part (`Shell`, `Joint`, `Bezel`, `Beacon`, `Screen`, `DotN`), and give
   parts that need their own colour a role (`m['role']('Wing')` → `Shell_Wing`).
2. Its screen layout in `faces.py` `LAYOUTS`, and the same numbers as a `FaceLayout` in
   its TS file.
3. Its colours in `src/palettes.json` (base, roles, dot colours).
4. Its name in `crew.py` `NAMES`; `blender/build.sh NAME`.
5. `src/NAME.ts`: a `Character` subclass with its spec (size, gaze, edges, entrance), its
   acts, and `idle`, `pose` and `after` for the joints. Then a line in `ROSTER` in
   `src/crew.ts`.
6. Its card in `src/families.ts` (name, what it is, family) and its portraits
   (`thumbs.py`, above).

The rules the crew keep to: every one is a robot (a toy robot's take on the animal, not
the animal in a robot suit); the colour is in its lights, in a part that is its
signature; the eyes follow the mouse, then the head and body after a beat, but nobody
moves toward it; a poke startles, three quick pokes make them dizzy, and a mouse resting
on them makes them happy.
