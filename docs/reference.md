# Reference

## `new Crew(options)`

| Option   | What it does                                                                                                    |
| -------- | --------------------------------------------------------------------------------------------------------------- |
| `canvas` | The canvas they're drawn on.                                                                                    |
| `hits`   | A fixed, full-window layer for their invisible hit areas.                                                       |
| `models` | Where the models are, ending in a slash: `MODELS` (jsDelivr) or your own copy.                                  |
| `look`   | `'ink'`, `'paper'`, `'colour'`, or `'auto'` (the default: ink on a light page, paper on a dark one).            |
| `flame`  | Rocket flames: `'beacon'` (the default, the colour of its light) or `'glow'`.                                   |
| `max`    | At most this many at once (3).                                                                                  |
| `roster` | Who turns up by themselves (everyone). Anyone can still be called by name.                                      |
| `every`  | Seconds between arrivals, picked between the two (`[6, 18]`).                                                   |
| `box`    | Draw the window as the open front of a shallow box they live in (on, unless `false`).                           |
| `frame`  | The frame they keep to, in px (from the CSS variables below, unless given).                                     |
| `pages`  | Which hangings come down from the ceiling on each page (see `page()`).                                          |
| `clear`  | Your content's column, in viewport px, which the hangings keep clear of (`<main>`'s content box, unless given). |
| `behind` | Whether one is out of sight behind something of yours, so clicks go through it.                                 |
| `tick`   | Called every frame just before they're drawn.                                                                   |

## The crew

| Call                                    | What happens                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `crew.start()`, `stop()`, `dispose()`   | Off they go; everyone freezes; everything is let go.                                                          |
| `crew.call(name?, on?)`                 | Brings one on now (or whoever's due). `on` can pick the edge, the spot and the way in.                        |
| `crew.jumpOut(name, feet, depth)`       | Brings one out of a picture on your page: `feet()` is where its feet are, in viewport px.                     |
| `crew.dismiss(name?)`                   | Sends one home, or everyone.                                                                                  |
| `crew.poke(name)`                       | A poke, as if from the mouse.                                                                                 |
| `crew.page(key)`                        | Dresses the room for a page: its hangings, its set pieces and its games.                                      |
| `crew.look`, `max`, `roster`, `every`   | The options above, changed on the fly.                                                                        |
| `crew.glow = '#ff5fa2'`                 | One colour for every light, eye and beacon at rest (`null` for the look's own).                               |
| `crew.members.get(name)`                | One of them (once they've been on): `perform(act)`, `repertoire`, `poke()`, `state`.                          |
| `crew.onMenu = (member, at) => boolean` | Right-click or long-press on one: open a menu of your own and return true, or return false for the browser's. |
| `crew.set`, `crew.decor`, `crew.play`   | The set pieces, the hangings and the games, by the names in `SET`, `DECOR` and `GAMES`.                       |

The room comes dressed for these keys: `home`, `writing`, `work-with-me`, `work`,
`about`, `contact`, `creatures`, `creatures/cats`, `creatures/dogs` and `creatures/birds`.
`PAGES`, `SET_PAGES` and `GAMES` say what each one gets; pass `pages` to hang your own.

## The page round them

They read these from `:root`, and each has a fallback:

- `--bot` (28px): their size. The playground uses 72px to 120px.
- `--frame-inset` (10px) and `--frame-radius` (0): the window's frame, which the box is
  drawn in.
- `--paper`, `--card`, `--ink`, `--ink-soft`, `--rule`, `--rule-strong`: the box's colours.

`<html data-theme="dark">`, or a dark colour scheme without one, turns the box to night
and, in `'auto'`, the crew to paper.

The hangings are big next to a large `--bot`: on a window much under 2000px wide, only
some of them find room beside your content.

## The cast

| Export                  | What it is                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| `ROSTER`                | Everyone, by key: `{ file, make, weight }`. Add your own before `new Crew`.                                    |
| `CARDS`                 | Their names and what they are: `CARDS.owl` is `{ name: 'Hoot', what: 'Owl', family: 'bird' }`.                 |
| `installCommand(name)`  | The command that copies one creature's model into a project: `installCommand('owl')` is `npx @wisdomousai/creatures add owl`. |
| `SECTIONS`, `inFamily`  | The families (cats, dogs, birds, fluffy, farm, jungle, sea, bugs, robots and everyone else), and who's in one. |
| `LOOKS`, `PALETTES`     | The three looks' base colours, and everyone's colour-look palette by model name.                               |
| `SET`, `DECOR`, `GAMES` | The set pieces, the hangings and the games, by name.                                                           |
| `MODELS`, `VERSION`     | This version's models on jsDelivr, and the version.                                                            |

## Holding things up

`crew.holdUp(who, tool, options?)` has someone hold a tool up (`who` is a key or a creature) and
returns a handle, or `null` if they can't (or aren't on the page at all). Someone still entering gets a handle that waits for them: `ready` resolves once they're on stage holding it, or false if they can't after all. `crew.canHold(who, tool)` asks first. `tool` is
a key of `TOOLS`, or `'sign'` to have the kind chosen for their body.

- Options: `label` (the lettering), `font` (a CSS font family; the size is fitted to the board), `onPick` (puts a button over the board), `host` (where the button goes),
  `point` (`'left'` or `'right'`, for an arrow), `hover` (an owl's spot: `{ x, y }`, px).
- The handle: `label` (settable), `button`, `ready` (resolves when it's up),
  `released`, `lead(toward)` (`'left'`, `'right'` or a door: they walk or fly off holding it, and the
  promise resolves once they're gone) and `release()`.
- `TOOLS` is the registry: each has a `model`, a `mount` (`hands`, `grip`, `feet`, `neck`,
  `floor`) and, for signs, a `family`. A creature class opts in with `holdsUp`, `holdOffset`
  and `holdPose(hold, k, t)`; `CARDS[key].tools` lists the extras it carries.
- `gripOf(creature)` and `gripOn(creature, bone, part)` find where a creature holds things.

## Speech bubbles

`new Bubble(host, { at })` puts a speech bubble in `host`, its tail pointing at `at()`, the
point it's asked for every frame (viewport px; null while there's nothing to point at).
`headTop(creature, crew.frame)` is the top of a creature's head, whichever way up they are.

```js
const owl = crew.members.get('owl');
const bubble = new Bubble(document.body, {
  at: () => headTop(owl, crew.frame),
  bounds: () => crew.frame,
});
const answer = await bubble.ask('Shall we play?', [['yes', 'Yes'], ['no', 'No']]);
bubble.remove();
```

It follows calmly: it keeps over where they are on average, and over the highest their head
has been in the last second and a half, so a sway or a hover's bob leaves it still and it
never sits on them. When they really move off it eases over after them.

- `say(line)` says something; `ask(line, answers)` asks, with `[value, label]` answers, and
  resolves with the value picked (null if it's hidden first). It stays up after an answer.
- `hide()` fades it out, `remove()` takes it out of the page too; `shown` says if it's up.
- Options: `bounds` (kept inside these, the window unless given), `gap` (6px, from the point
  to the tail's tip), `slack` (24px, how far they wander before it goes after them),
  `className` (`say`) and `label` (the answers' group, read out with them).
- Its styles are a default under the page's own: `.say`, `.say-text`, `.say-answers`,
  `.say.on` and `.say.asking`, in the box's colours (`--card`, `--ink`, `--rule-strong`).

## Making a creature

[How a creature is made](how-they-are-made.md) explains all of this with an example.

### `class extends Character`

`super(spec, model)`, then `this.acts = { … }`. It must have `idle(t)`, and may have
`pose(dt, env)`, `after(dt, env)` and `poke()`, and `onEnter()`, `onArrive()` and
`onLeave()` for as it starts to come on, once it's here, and as it goes.

| `Spec`     | What it says                                                                                        |
| ---------- | --------------------------------------------------------------------------------------------------- |
| `name`     | What it's called (`'Digby'`).                                                                       |
| `model`    | Its model's name, which is also its palette's key (`'mole'`).                                       |
| `metres`   | The model's height and width in metres, as built.                                                   |
| `width`    |                                                                                                     |
| `size`     | Its height on screen, in `--bot`s.                                                                  |
| `feels`    | A spring for each bone, `{ f, zeta, r? }`, and a `default` for the rest.                            |
| `face`     | Its screen's `FaceLayout`: `width`, `height` (px), `eyes`, `rx`, `ry`, `line`, `mouth` (fractions). |
| `eyes`     | Where it looks from, as a fraction of its height.                                                   |
| `gaze`     | The bones that turn toward the mouse, each with its share of the turn: `{ bone, yaw, pitch }`.      |
| `reach`    | The furthest it turns toward the mouse, in degrees: `{ yaw, pitch }`.                               |
| `lag`      | How quickly its gaze follows, in Hz (lower is lazier).                                              |
| `entrance` | `'rise'` (up through the floor), `'walk'` or `'fly'`.                                               |
| `edges`    | Where it lives: `'bottom'`, `'top'`, `'left'`, `'right'`; repeat one to make it likelier.           |
| `stay`     | Seconds on stage, picked between the two.                                                           |
| `speed`    | Walking speed, in `--bot`s a second.                                                                |
| `turn`     | How far it turns toward the way it's walking, in degrees (80).                                      |
| `roam`     | Wanders in and out of the box's depth as it walks (on the floor, unless `false`).                   |
| `steers`   | Walks round the others rather than into them (unless `false`).                                      |

| `Act`    | What it says                                                      |
| -------- | ----------------------------------------------------------------- |
| `weight` | How likely it is to come up next; 0 means only when you `setAct`. |
| `length` | Seconds, picked between the two.                                  |
| `face`   | The expression on its screen for the whole act.                   |
| `when`   | Only picked while this is true.                                   |
| `start`  | Called as it begins.                                              |
| `pose`   | Called every frame of it with the seconds since it began.         |

What a creature can read and call on itself:

| Member                              | What it is                                                               |
| ----------------------------------- | ------------------------------------------------------------------------ |
| `act`, `actT`, `actLength`          | The act it's doing, the seconds it's been at it, and how long it lasts.  |
| `setAct(name)`, `perform(name)`     | Start an act now (`perform` only if it's on stage).                      |
| `t`, `state`                        | Seconds since it arrived; `'entering'`, `'here'`, `'leaving'`, `'gone'`. |
| `hovered`, `expression`             | Is the mouse on it; the face it shows when the act doesn't say.          |
| `s`, `edge`, `walkTo(s)`, `walking` | Where it is along its edge (px), which edge, and going somewhere.        |
| `gait`, `stride`                    | Its walk cycle (radians) and how fast it's walking.                      |
| `heightPx`, `px`                    | Its height on screen, and pixels per metre.                              |
| `hopUp(height)`                     | A little jump, in its own heights.                                       |
| `puppet`, `outfit`                  | Its joints and its lights (below).                                       |

`this.puppet`, in degrees, in the creature's own axes (pitch about X, + tips an upright bone
forward; yaw about Y, + turns it to its left; roll about Z):

| Call                                      | What it does                                                       |
| ----------------------------------------- | ------------------------------------------------------------------ |
| `add(bone, pitch, yaw, roll)`             | Adds to the bone's target this frame; layers add up.               |
| `kick(bone, pitch, yaw, roll)`            | Knocks the spring (degrees a second): a bump, a landing, a flinch. |
| `turn(bone, pitch, yaw, roll)`            | Turns it further, directly, after the springs (in `after`).        |
| `swing(bone, yaw)`                        | Spins it about the up axis, directly; it can go round and round.   |
| `stretch(bone, along, [x, y, z], across)` | Scales it along a direction, directly.                             |
| `shift(bone, x, y, z)`                    | Moves it from where it rests, in metres, directly.                 |
| `current(bone)`, `has(bone)`              | Where the spring has it now; whether there's such a bone.          |

`this.outfit.dot(i, level, colour?)` lights `Dot{i}` from 0 to 1, in its palette's colour
or the one given. `this.outfit.beacon(colour)` colours the beacon.

### Helpers

| Export                                 | What it does                                                                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `sin(t, hz, phase?)`                   | A sine at `hz`, for swaying and bobbing.                                                                                    |
| `ease(x)`                              | 0 to 1, smoothly, for `x` from 0 to 1 (clamped).                                                                            |
| `bump(x, width)`                       | 1 at 0, falling to 0 at ±`width`.                                                                                           |
| `cycle(x)`                             | The fractional part: a loop from 0 to 1.                                                                                    |
| `clamp(x, lo, hi)`                     | Keeps `x` between the two.                                                                                                  |
| `wobble(t, seed?)`                     | A small smooth noise, for idle life.                                                                                        |
| `trot(puppet, gait, amount)`           | Four legs (`leg.FL`, `leg.FR`, `leg.BL`, `leg.BR`) in diagonal pairs.                                                       |
| `swish(puppet, bones, phase, degrees)` | A tail along a chain of bones, each a beat behind the last.                                                                 |
| `Spring`, `FixedSpring`                | A spring of your own; `FixedSpring` steps at 120 Hz at any frame rate.                                                      |
| `BEACON`, `RAINBOW`                    | The beacon's colour for each expression, and the party colours.                                                             |
| `EXPRESSIONS`                          | The faces: neutral, happy, surprised, love, wink, sleepy, asleep, dizzy, focused, sad, cross, starry, sheepish, determined. |
