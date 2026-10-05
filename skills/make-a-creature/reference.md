# Reference

## Blender (`blender/`)

Units are metres. A creature faces −Y, stands on z = 0, and +X is its left. Every module
imports `kit`, `looks` and usually `seakit`; `crew.module(name)` imports `NAME.py`, which
needs `FACE`, `PREVIEW = dict(lift=0.0, width=…)` and `build(look='ink', flame=None)`
returning `looks.finish(kit.armature('NameRig', rig_bones()), parts, skin, m)`.

### Shapes

| Call                                                                           | Makes                                                                                        |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `seakit.pod(name, center, radii, e=(0.7, 0.8), seg=(24, 14), rotation, taper)` | A superellipsoid. `e` near 1 is round, below 1 boxier, near 0.3 flat. `taper` > 0 is an egg. |
| `kit.superellipsoid(name, radii, e1, e2, seg, taper, location, rotation)`      | The same, with the exponents apart: `e1` squares the profile, `e2` the waist.                |
| `seakit.bar(name, a, b, r, e=(0.6, 0.95), squash=1, grow=1)`                   | A rounded capsule from `a` to `b`: legs, arms, claws, tails.                                 |
| `kit.tube(name, points, radii, ring=16)`                                       | A tube swept along a polyline, domed ends; returns `(obj, t)` for bending weights.           |
| `kit.lathe(name, profile, seg=32, location, rotation)`                         | A surface of revolution from `(radius, z)` pairs, top to bottom.                             |
| `kit.torus(name, major, minor, seg, location, rotation)`                       | A ring in the XY plane.                                                                      |
| `seakit.ring_on(name, center, axis, major, minor)`                             | A ring round `axis`: collars, bezels.                                                        |
| `seakit.flat_on(name, q, n, radii, seg=16, e=0.6)`                             | A small disc lying on a surface at `q`, facing `n`: studs, bolts, lit spots.                 |
| `seakit.fan(name, root, direction, radii, thin, taper=1)`                      | A flat rounded fan: fins, wings, ears.                                                       |
| `kit.screen(name, radii, center, bezel, e=0.3)`                                | The face: returns `(glass, rim)`; glass gets `m['face']`, rim `m['bezel']`.                  |
| `kit.stretch(obj, sx, sy, sz)`, `kit.cut(obj, normal, offset)`                 | Squash a part about its origin; slice it flat and cap it.                                    |
| `seakit.aim(a, b)`                                                             | The rotation that turns a part's own Z along `a → b`.                                        |

Family kits (`catkit`, `dogkit`, `birdkit`, `bugkit`, `hoofkit`, `fluffkit`, `seakit`…)
build whole heads, legs and tails in a family's style; read the nearest relative's script
before modelling a cat or a bird from scratch.

### Bones and skinning

- `rig_bones()` returns `(name, head, tail, parent)` tuples, parents first, starting with
  `('root', (0, 0, 0), (0, 0, 0.05), None)`.
- `add(obj, material, bone)` binds a part rigidly to one bone. To bend a tube along a chain,
  pass weights instead of a bone name:
  `obj, t = kit.tube(…)` then `add(obj, mat, kit.chain(t, ['tail.1', 'tail.2', 'tail.3']))`.
- `seakit.chain(prefix, parent, points)` makes the bone tuples for a chain;
  `seakit.chain_pods(prefix, points, radii, add, mat)` a rounded segment for each.

### Materials

`m = looks.materials(look, flame, face=FACE)` gives:

| Key                | Material name | Use                                                           |
| ------------------ | ------------- | ------------------------------------------------------------- |
| `m['shell']`       | `Shell`       | The body.                                                     |
| `m['joint']`       | `Joint`       | Knuckles, collars, claws, legs.                               |
| `m['bezel']`       | `Bezel`       | The rim round the screen; trims.                              |
| `m['face']`        | `Screen`      | The screen glass. Only on the glass.                          |
| `m['beacon']`      | `Beacon`      | The light that shows its mood. One per creature.              |
| `m['glow']`        | `Glow`        | Lights that only glow.                                        |
| `m['dot'](i)`      | `Dot{i}`      | Lights it controls one by one; `i` from 0, no gaps.           |
| `m['role']('Paw')` | `Shell_Paw`   | Shell everywhere but the colour look, where it's `roles.Paw`. |

The palette, `looks.PALETTES[FACE]`: `base` (`shell`, `joint`, `bezel`, `visor`, `glow`),
`roles` by name, `dots` as `[off, on]`. The face layout, `faces.LAYOUTS[FACE]`:
`dict(size=(w, h), eyes=((x, y), (x, y)), rx, ry, line, mouth=(x, y) or None)`, fractions of
the screen, the creature's right eye first.

### Commands

```sh
blender/build.sh NAME                       # → models/NAME.glb (export + meshopt)
"$BLENDER" -b --factory-startup -P blender/sheet.py -- NAME OUT_DIR [ink|paper|colour] [target_z] [distance]
"$BLENDER" -b --factory-startup -P blender/thumbs.py -- models/thumbs NAME
```

## TypeScript

```ts
class Name extends Character {
  constructor(model: Object3D) {
    super(spec, model);
    this.acts = { idle: { weight: 3, length: [3, 6] }, … };
  }
  protected idle(t: number) {}               // required
  protected pose(dt: number, env: Env) {}    // targets, by act
  protected after(dt: number, env: Env) {}   // lights; direct turns
  poke() {}                                  // a click
}
```

### `Spec`

`name`, `model` (the palette key), `metres` and `width` (as built), `size` (on-screen height
in `--bot`s), `feels` (`{ [bone]: { f, zeta, r? }, default }`), `face` (`FaceLayout`:
`width`, `height`, `eyes`, `rx`, `ry`, `line`, `mouth`, the same numbers as the Blender
layout), `eyes` (fraction of height it looks from), `gaze` (`[{ bone, yaw, pitch }]`, shares
of the turn), `reach` (`{ yaw, pitch }`, degrees), `lag` (Hz), `entrance`
(`'rise' | 'walk' | 'fly'`), `edges` (`'bottom' | 'top' | 'left' | 'right'`, repeats weight
it), `stay` (`[min, max]` seconds), `speed` (`--bot`s a second), `turn` (degrees, 80),
`roam`, `steers`.

### `Act`

`weight` (0: only by `setAct`), `length` (`[min, max]` s), `face` (wins over
`this.expression` on the screen), `when` (`() => boolean`), `start` (`() => void`), `pose`
(`(t) => void`, every frame).

### On `this`

- State: `act`, `actT`, `actLength`, `t`, `state`, `hovered`, `expression`, `s`, `edge`,
  `h` (px off the floor), `heightPx`, `px`, `gait`, `stride`, `walking`, `spec`.
- Doing: `setAct(name)`, `perform(name)`, `walkTo(s, depth?)`, `hopUp(height)`,
  `goal = null` (stop walking).
- `this.puppet`: `add`, `kick` (degrees/s), `turn`, `swing`, `stretch`, `shift` (metres),
  `current`, `has`. Pitch is about X (+ tips an upright bone forward), yaw about Y (+ to
  its left), roll about Z; degrees, relative to rest, riding on the parent.
- `this.outfit`: `dot(i, level 0..1, colour?)`, `beacon(colour)`.

### Helpers from `@wisdomousai/creatures`

`sin(t, hz, phase?)`, `ease(x)`, `bump(x, width)`, `cycle(x)`, `clamp(x, lo, hi)`,
`wobble(t, seed?)`, `trot(puppet, gait, amount, swing = 28)` (bones `leg.FL/FR/BL/BR`,
`body`, `head`), `swish(puppet, bones, phase, degrees, delay = 0.7)`, `Spring`,
`FixedSpring` (120 Hz steps), `BEACON` (expression → colour), `RAINBOW`, `EXPRESSIONS`,
`ROSTER`, `PALETTES`, and the types `Act`, `Env`, `Spec`, `Expression`, `FaceLayout`,
`Palette`, `Feel`, `Turn`.

Expressions: neutral, happy, surprised, love, wink, sleepy, asleep, dizzy, focused, sad,
cross, starry, sheepish, determined.
