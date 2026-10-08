# Holding things up for real

A sign should look held: a hand round the handle, a talon over the bar, not a board hanging in the
air near a paw. This is how that works, how to give a new body a real hold, and how to check it.

## Who holds what

`crew.holdUp(who, 'sign', { label })` gives each body the kind that really suits it, or `null`.

| Body                                         | Sign          | How                                                              |
| -------------------------------------------- | ------------- | ---------------------------------------------------------------- |
| Hands, forearms or arms (a monkey, a robot)  | `signpost`    | One arm raised beside the head, a pole up out of the hand, an upright board over the head |
| Two hands that reach each other              | `placard`     | Both hands, held out in front                                    |
| Hoot, hovering                               | `hanger`      | A bar, hooked over his talons                                    |
| Only a mouth, jaw or chin (cats, dogs, ...)  | none          | `canHold(who, 'sign')` is false, `holdUp` gives `null`           |
| Hanging from the ceiling (a bat)             | none          | It would be upside down                                          |

A creature's `tools` list in `families.ts` is for the extras (a lantern, a map); signs aren't on it.

## The signpost, for any handed body

There is nothing to write for a body with an arm pair. `props.ts` finds the grip (the palm of
`hand.L`/`hand.R`, else the far end of `forearm`, `fore` or `arm`), and `arm.ts` works out the
raise from the body as it was made: where the shoulder, elbow and grip are at rest, and how wide
and tall the head is.

- The shoulder turns the arm up and out past the side of the head, the elbow stands the forearm
  straight up, and the handle goes up out of the hand.
- Arms are short and heads are big, so the arm stretches like a rubber hose to get the board clear:
  the elbow is drawn out along the upper arm, or a body with one bone to an arm gets that bone longer.
- **The board is upright and as wide as its words.** It is a landscape board on a pole (`tool-signpost`,
  `blender/signs.py`), never a disc: a round sign has to be huge to hold a word, but a rectangle grows in
  width with the label while its height stays put. The board's height is what reading needs; its width
  follows the label on one line, and only if one line would be wider than `MAX_ASPECT` (3.5) times the
  height is the label broken into two lines (or more, if that makes the letters bigger), as evenly as
  can be, and the board is as wide as the widest line (`planBoard`). It is never narrower than 1.5 times
  its height, and a single long word gets smaller letters rather than a wider board. The letters
  never leave the board.
- **A sign is for reading, so it has a minimum size.** Whoever holds it, its lettering is at least
  18 CSS px tall (capitals, `MIN_CAP_PX` in `tools.ts`) on the screen as it is now, worked out from the
  holder's size on screen and the words. The board (frame and all) is never more than 45% of the screen's
  short side, nor wider than 90% of its width, frame and all. A holder big enough already keeps the size its head calls
  for. The model's board is in two halves on bones `boardL` and `boardR` that the page slides apart to
  the width it wants, and the face between them is stretched flat, so the lettering stays even.
- **The pole and its grip stay the size a hand takes** (never under 0.8 as made, the head's size
  otherwise); only the board is made bigger, by scaling its two bones about its foot. A small holder
  gets a small hand-sized pole under a board that is big enough to read.
- **Held upright**: the board never leans toward the middle of the page or with the arm. The forearm
  leans out 2 degrees, the pole is vertical and the board's tilt is the little sway of its life, clamped
  to `MAX_TILT` (0.1 rad, under 6 degrees) whoever holds it and however big it is.
- **Over the head**: the board's foot is over the head's top (a hand's width of the pole is under it,
  and the arm stretches to reach it, `RaisedArm.fit`). The grip is beside the head; the board is slid
  along its pole to sit over the head as far as its pole allows (the pole stays under it, `POLE_MARGIN`),
  and never past the box's frame. The pole's foot is a hand's width under the grip, well above
  the holder's feet, a crate or the floor.
- The paddle (`'paddle'`, a round board on a short handle) is still there by name; it is held the
  old way (the handle leaning with the arm, grown with the board).
- The side is the one toward the middle of the page. A body with something already in one hand says
  which it holds with: `readonly holdWith = -1 as const` (Dibble's trowel is in her left).

When the guess is wrong, a body names its grips (`Character.holdGrips`): a bone, and optionally a
place on it as the model was made (metres: x across, y up, z toward us).

```ts
readonly holdGrips = {
  // `hand`: the left hand's grip, then the right's. Owl: his talons, left then right.
  hand: [['hand.L', [0.01, 0.02, 0.03]], ['hand.R', [-0.01, 0.02, 0.03]]],
  feet: [['leg.L', [0.062, 0.006, 0.085]], ['leg.R', [-0.062, 0.006, 0.085]]],
};
```

## Giving a family its own pose

A body that wants a different hold than the generic one lists the way it holds in `holdsUp` and
poses it in `holdPose`. This is the pattern for a new family:

1. `readonly holdsUp: readonly Hold[] = ['hand']` (`'hands'`, `'hand'`, `'grip'`, `'feet'`).
2. `holdPose(hold, k, t)` adds to the pose before the joints move (`k` eases 0 to 1): turn the
   bones that put the hand, paw or talon where the tool goes.
3. `holdGrips` says where on the body the tool's grip lands (above).
4. Run the contact check below. A body is done when `ok` is true and the close-up looks held.

Hoot's `holdPose('feet')` hangs his legs; his talons are the grips. The `hand` hold of a body with
no `holdPose` falls back to the raised arm above.

## The contact check

`Held.check()` measures, every frame, two things in the holder's metres:

- `gap`: how far the tool's grip is from the place the body says holds it (for a bar, the
  distance to the bar),
- `reach`: how far that place is from the skin of the hand, paw or talon that should be holding
  (zero if it is inside it, as a grip in a mitt is). A grip floating off the paw shows here.

`worstGap` and `worstReach` are the worst while the tool is shown, not while it comes in. A tool is
held for real while both stay under `GRIP_GAP` (0.015 m). Red dots mark the tool's grips and green
dots the places that should hold, so a miss is visible.

```ts
const r = await crew.holdCheck('monkey', 'sign', { label: 'Home' }, 4);
// { tool: 'signpost', held, gap, reach, ok }; the hold stays up for a close-up till held.release()
```

Or by hand: `const held = crew.holdUp(...); held.check(); ...; held.worstGap`. `check(false)` turns
the dots off. It is a debug helper: nothing the site ships needs it.

## Fliers, and crates

- **A flier that holds with a hand hovers on request**: `holdUp('bolt', 'sign', { hover: { x, y } })`
  keeps him in the air on his flames, feet at the spot, the board raised on its pole in one mitt. A body opts
  in by being a flier that can `hoverAt(x, y)`, `comeDown()` and say whether it is `onErrand`
  (Hoot and Bolt do). `lead()` from the air flies them off the side of the frame; `release()`
  brings them down to the floor.
- **`on: 'crate'`**, with `at: { s, depth }`: a crate comes up through the floor there (`play.bring`),
  the holder walks to its side, crouches, hops up, sits and holds the sign up. `ready` resolves once
  they are up. `release()` hops them down and the crate goes back through the floor; `lead()` hops
  them down first and then they go off, so nobody skates across the room at crate height. If the
  crate is taken away under them, they hop down and the hold ends.

## Taking big close-ups

The playground (`npm run dev`) puts `crew` in the console. To see a hand, not a figure:

1. Make the crew big: `document.documentElement.style.setProperty('--bot', '300px')` (their size
   goes with `--bot`) and dispatch a `resize` event.
2. Ask: `await crew.call('monkey', { edge: 'bottom', s: innerWidth * 0.3, from: 'below', depth: 0.15 })`,
   then `crew.holdUp('monkey', 'sign', { label: 'Home' })` and `.check()`. Putting them in the left
   half makes them raise the left hand.
3. Screenshot at 2x (a headless browser at 1400 x 900, device scale 2) and crop around the grip.
   Compare `?look=ink` and `?look=colour` (ink has no colour to hide a gap behind).
4. Look at the dots, then at the picture. A number that passes on a hand that doesn't look
   closed round the handle is a bug in the check or in the grip, and worth finding.
