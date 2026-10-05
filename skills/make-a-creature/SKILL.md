---
name: make-a-creature
description: Makes a new robot creature for @wisdomousai/creatures (the toy robots that live in a box round a web page). Builds its body in Blender from code (shapes, a skeleton, named materials, a screen face), exports the .glb, and writes its life in TypeScript (a spring per bone, weighted acts, poke/dizzy/love reactions, lights). Use when someone asks for a new creature or robot animal, or wants to change how one looks or moves or add a trick to one.
---

# Make a creature

A creature is two files that agree on names. `NAME.py` builds the body in Blender: parts
placed by numbers, each bound to a bone, each material named for what it is. `NAME.ts` is a
`Character` subclass that never animates anything directly; every frame it sets a target
angle for some bones, and a spring per bone does the moving.

Start from Digby, a complete small creature that isn't in the crew:
[`example/mole.py`](example/mole.py), [`example/mole.ts`](example/mole.ts) and the model they
make, [`example/mole.glb`](example/mole.glb). Read both files before writing anything. Exact
signatures are in [reference.md](reference.md).

## Where are you?

- **In a clone of `wisdomousai/creatures`**: the creature joins the crew. Its files go in
  `blender/` and `src/`, and it is registered in the places listed under "Join the crew".
- **In another project that uses the npm package**: the creature is the project's own. The
  body still has to be built with the repo's Blender scripts, so clone
  `https://github.com/wisdomousai/creatures` somewhere outside the project, build there, and
  copy the `.glb` into the project's public folder. The TypeScript lives in the project and
  imports everything from `@wisdomousai/creatures`.

Building a body needs Blender 5 and Node (for `npx`). Below, `$BLENDER` is the Blender
binary (`/Applications/Blender.app/Contents/MacOS/Blender` on macOS); `build.sh` finds it there
or in `BLENDER`. If Blender isn't installed, say so and stop before the body; don't
hand-write a `.glb`.

## 1. Design it

Settle these before modelling, and write them in the docstring at the top of `NAME.py`:

- **The robot take.** A toy robot's version of the animal, never the animal in a robot suit:
  show joints, collars and bolts, and give it a screen for a face.
- **The signature part, which holds the lights.** Something the animal is known for, made of
  lit dots that can be dimmed and recoloured one by one: Digby's star nose, the octopus's
  suckers, the dachshund's back. Plus one beacon whose colour shows how it feels.
- **Where it lives and how it arrives.** `edges` (floor, ceiling, walls) and `entrance`
  (`'rise'` up through the floor, `'walk'` in from the side, `'fly'`).
- **Six to ten acts with a point.** Things only this animal would do, each one readable from
  across the room. Digby digs, sniffs with a light running round his star, and stands up on
  lookout.
- **The house rules, its own way.** A poke startles it, three quick pokes make it dizzy, a
  mouse resting on it makes it soppy. The eyes follow the mouse and then the head after a
  beat, but it never walks toward the mouse.

## 2. Build the body

1. Copy `example/mole.py` to `blender/NAME.py` and change `FACE` and the docstring.
2. Model in real metres: facing −Y (towards the viewer), standing on z = 0, +X is its left.
   Most of the crew are 0.3 to 0.9 m tall; Digby is a small one at 0.19.
3. Build from `seakit.pod` / `kit.superellipsoid` (exponents near 1 are round, near 0.3 are
   flat), `seakit.bar` for limbs, `kit.tube` for bends, `kit.screen` for the face.
4. Give every part to `add(obj, material, bone)`. Materials:
   `m['shell']`, `m['joint']`, `m['bezel']`, `m['face']`, `m['beacon']`, `m['dot'](i)` with
   `i` from 0 with no gaps, and `m['role']('Name')` for a part with its own colour in the
   colour look (it becomes `Shell_Name`).
5. List the bones in `rig_bones()` as `(name, head, tail, parent)`, parents first. Four legs
   named `leg.FL`, `leg.FR`, `leg.BL`, `leg.BR` can use `trot()` for walking.
6. The screen layout goes in `faces.LAYOUTS[FACE]` and the colour-look palette in
   `looks.PALETTES[FACE]`, as the mole does with `setdefault`.
7. Build and read the output line:

   ```sh
   blender/build.sh NAME
   ```

   It must print `EXPORTED … bones N … materials [...]` with `Screen`, `Beacon` and every
   `DotN` in the list, then `NAME: <bytes>`. Keep it under 250 KB.

8. Look at it. Render a review sheet and open the pictures:

   ```sh
   "$BLENDER" -b --factory-startup -P blender/sheet.py -- NAME /tmp/NAME colour 0.1 1.2
   ```

   The last two numbers are the height to aim at and the camera distance, in metres; scale
   them to the creature. Check that the face isn't covered, nothing floats or sinks through
   the floor, and the signature part reads from the front.

## 3. Give it a life

Copy `example/mole.ts` to `NAME.ts` and work through it:

- **`Spec`.** `metres` is the built height and `width` the width. `size` is its height on
  screen in `--bot`s (0.5 to 1.25 for most). `eyes` is the screen's height as a fraction of
  `metres`. Every bone named in `gaze` and `feels` must exist.
- **`feels`.** A spring per bone, and this is most of its personality. `f` is how quick (Hz):
  2 to 3 for a heavy body, 6 to 8 for a twitchy nose. `zeta` is how much it wobbles: 0.25 is
  floppy, 0.6 is firm.
- **`acts`.** Weights for the ones it picks by itself; `when: still` for anything that
  shouldn't start mid-walk; weight 0 for reactions (`poked`, `love`, `dizzy`). An act's
  `face` is what its screen shows. Set `this.expression` from the act's face in `pose()`
  (as Digby does), so the beacon agrees with the screen.
- **`idle(t)`.** Small and always on: breathing, a twitch now and then.
- **`pose(dt, env)`.** A `switch` on `this.act`. Ease in and out with
  `k = ease(Math.min(t / 0.5, left / 0.5))` and multiply every angle by `k`. Use
  `this.puppet.add(bone, pitch, yaw, roll)` in degrees. Walking goes at the end, driven by
  `this.gait` and `this.stride`.
- **`poke()`.** Count pokes in the last 3 s: on the third, `setAct('dizzy')`; otherwise
  `puppet.kick` something, `hopUp`, and `setAct('poked')`. The mouse resting on it is
  `this.hovered`: after about a second, `setAct('love')`.
- **`after(dt, env)`.** Lights only: `this.outfit.dot(i, level, colour?)` for each dot and
  `this.outfit.beacon(BEACON[this.expression] ?? BEACON.neutral!)`.

Keep motion frame-rate independent. Use `sin(env.time …)` and the act's clock, never
`Math.random()` once a frame, and `FixedSpring` for anything that gets kicked and should
ring the same at 20 and 60 fps.

## 4. Bring it on

**In another project:**

```ts
import { PALETTES, ROSTER } from '@wisdomousai/creatures';
import { NAME_PALETTE, Name } from './NAME';

ROSTER.NAME = { file: '/models/NAME.glb', make: (model) => new Name(model), weight: 3 };
PALETTES.NAME = NAME_PALETTE; // the key is the Spec's `model`
```

Register before `new Crew(…)`. `file` may be a whole address; the crew's own models still
come from the `models` option.

**Join the crew** (in the repo):

1. Move the layout from `setdefault` into `blender/faces.py` `LAYOUTS`, and the palette into
   `src/palettes.json`, keyed by the model name.
2. Add the name to `NAMES` in `blender/crew.py`.
3. Put `NAME.ts` in `src/`, import from `./character`, `./face`, `./moves`, `./swimmer`,
   `./bolt` instead of the package, and add a line to `ROSTER` in `src/crew.ts`.
4. Give it a card in `src/families.ts` (`{ name, what, family }`), with a name no one else
   has.
5. Make its portraits:
   `"$BLENDER" -b --factory-startup -P blender/thumbs.py -- models/thumbs NAME`.

## 5. Check it

Run `npm run check`, then the playground (`npm run dev` in the repo, or your project's dev
server). In the browser console:

```js
crew.call('NAME');
const it = crew.members.get('NAME');
it.repertoire; // every act is there
it.perform('dig'); // each of its acts in turn, watching each one
crew.poke('NAME'); // startled
crew.poke('NAME');
crew.poke('NAME'); // dizzy
crew.look = 'colour'; // its palette
```

Rest the mouse on it to see `love`, hold it down to drag it about, and watch it walk. The
console must stay free of errors. `no bone X` means a name in the TypeScript isn't in the
model.

## Mistakes that are easy to make

- **Bone names.** A typo between the files fails as `no bone …` on the first frame.
- **Act names are strings.** `setAct('dizy')` doesn't fail: it stands there doing nothing
  for a few seconds. Compare `repertoire` with the acts you wrote.
- **An act's `face` and `pose()`.** The screen always shows the act's `face` if it has one,
  so a reaction that changes face partway (surprised, then cross) must not set one.
- **Gaps in the dots.** `Dot0` to `Dot7` is eight lights; skipping `Dot3` leaves a dark one.
- **Parts sinking.** Pitching the body pitches everything bound under it, feet included.
  Keep body tilts small, or lift the creature with `this.h` while it tilts.
- **Walking toward the mouse.** It never does. It looks.
