# The crew in a world of your own

On a page the crew live in the window's frame. In a three.js scene of your own (a
museum, a level, a garden) they live on **lanes**: strips of floor you lay where they
may walk. Each lane is a frame of their own laid flat (`Frame.flat`), so a creature runs
exactly as it does on a page, in px, and the lane turns that into your world, in metres.

```ts
import { MODELS, Roam } from '@wisdomousai/creatures';

const roam = new Roam(scene, {
  lanes: [
    // Along a hall's south wall, 12 m long and 3 m deep, facing +z.
    { id: 'hall', at: [-6, -4], along: [1, 0], length: 12, width: 3 },
    { id: 'garden', at: [6, -4], along: [0, 1], length: 8, width: 2.5 },
  ],
  // Off the hall's end, through the door, onto the garden's start.
  links: [{ a: { lane: 'hall', end: 'end' }, b: { lane: 'garden', end: 'start' } }],
  roster: ['bolt', 'dog', 'cat', 'owl'],
  max: 3,
  look: 'colour',
  models: MODELS,
  castShadows: true, // your lights cast them real shadows
});

renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  roam.update(dt, camera);
  renderer.render(scene, camera);
});
```

They come on near the camera, on the nearest lane within `near` metres, where it isn't
looking: walkers from an end out of sight, the rest up from the floor out of sight. Each
stays a while and goes. A walker who goes off an end with a link comes on at the other
end of the link once no one is looking there (and gives up after a while if someone always is).
They watch the camera when it's before their lane and near, from where it really is.

| Option        | What it does                                                                         |
| ------------- | ------------------------------------------------------------------------------------ |
| `lanes`       | Where they may walk: `{ id, at: [x, z], along: [x, z], length, width }` in metres.   |
| `links`       | Ways through between lanes' ends: `{ a: { lane, end }, b: { lane, end } }`.          |
| `roster`      | Who may come (ROSTER names).                                                         |
| `max`         | At most this many out at once (3).                                                   |
| `look`        | `'ink'`, `'paper'` or `'colour'` (`'ink'`).                                          |
| `models`      | Where the models are, ending in a slash (`MODELS`).                                  |
| `every`       | Seconds between arrivals, picked between the two (`[6, 16]`).                        |
| `near`        | How near (m) a lane must be for anyone to come on it (18).                           |
| `perLane`     | How many may be out on one lane at once (1).                                         |
| `castShadows` | No shadow cards; their meshes cast and take your lights' shadows (`false`).          |
| `seats`       | What they may get up on and sit: benches, chairs, a cat tree (see below).            |
| `leave`       | `false`: whoever comes stays, their time up or not (a room's own residents) (`true`). |
| `play`        | `true`: they get up games with the props (fetch, yarn, a ball…) by themselves; or the games' names (`false`). |
| `px`          | Lane px a metre (100).                                                               |
| `bot`         | The crew's unit in lane px (55: Bolt stands 0.8 m).                                  |
| `ceiling`     | How high fliers may go, in metres (3.2).                                             |

A lane's front edge starts at `at` and runs `along`; its floor goes back from there to the
left as you walk along it (along +x, back is -z), so it faces +z. Lay lanes along walls,
facing into the room. A lane's `floor: [x0, z0, x1, z1]` is where one held may be taken
(its room, say); without it, only along the lane.

| Method / property      | What it does                                                         |
| ---------------------- | -------------------------------------------------------------------- |
| `update(dt, camera)`   | A step: arrivals, everyone moved, the gone let go or sent through.   |
| `pick(ray)`            | The one a ray meets first (for pointing at them), or `null`.         |
| `poke(c)`              | It notices; poked again within 3 s, it does a trick.                 |
| `hover(c)`             | The pointer's over that one (or `null`): it knows.                   |
| `grab(c, ray)`         | Take hold of it: it goes after the pointer. Says whether it could.   |
| `drag(ray)`            | The pointer holding one has moved.                                   |
| `drop()`               | Let go: it comes down, if it's up, and back to its lane.             |
| `holding`              | The one held, or `null`.                                             |
| `dress(look)`          | A new look for everyone.                                             |
| `enabled`              | `false`: no one new comes (those out stay till they go).             |
| `seats`                | What they may get up on and sit (set it when your furniture's in).   |
| `onStage`              | Who's out, and on which `Lane`.                                      |
| `play(c, name?)`       | A game (by name, or any that fits) on that one's lane (see below).   |
| `games(c)`             | The games that can be played where that one is.                      |
| `playing(c)`           | What's being played on that one's lane, or `null`.                   |
| `jumpOut(who, at, land)` | One jumps out of a picture on a wall (see below).                  |
| `lanes`                | The `Lane`s: each one's `group` is in your scene.                    |

Held, as on a page: a walker hurries after the point on the floor under the pointer, off
its lane if the lane's `floor` lets it; a flier (Hoot, Nib, Whirr, Bolt…) after the
pointer through the air, square on to the camera, so it can be lifted into the room. Let
go up there, Hoot and Nib fly on from where they are and land; the rest come down. A press
held 220 ms or dragged 8 px is how a page takes one up, and a good place to start.

```js
canvas.addEventListener('pointerdown', (e) => {
  const who = roam.pick(rayAt(e));
  if (who && roam.grab(who, rayAt(e))) canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => roam.drag(rayAt(e)));
canvas.addEventListener('pointerup', () => roam.drop());
```

## Seats

Give them furniture and they use it. Now and then one picks a seat near it that it can
hop up on (about half as high again as itself; a flier, any), walks round to the front of
it (or the back, if it's behind), hops up, and sits, lies down or naps a while; when it's
off somewhere else it hops down. Two don't take the same place: a bench takes as many as
fit along it. Let go over a seat, one lands on it.

```ts
roam.seats = [
  // A bench 1.6 m long at (0, -11), its seat 0.45 m up, running along z.
  { at: [0, -11], height: 0.45, length: 1.6, width: 0.45, along: [0, 1] },
  // A perch, for the fliers only.
  { at: [3, -6], height: 1.8, length: 0.6, width: 0.1, along: [1, 0], fliers: true },
];
```

A lane's crew use the seats on its `floor` (or within a metre of the lane, without one).
On a frame of your own, give a character `env.seats` (`Top`s, in its px) and it does the
same.

## Games

With `play` on, now and then the crew on a lane get up a game by themselves: a bone thrown
and fetched, a ball of yarn batted about, a cushion fought over. The props come up through
the floor, are played with, and sink back when the game's done; whoever a game wants that
isn't there (a dog for fetch) walks in from an end out of sight. `roam.play(c)` starts one
where `c` is, on a click or from a menu: `roam.games(c)` are the ones to offer.

```ts
const roam = new Roam(scene, { lanes, roster, play: ['fetch', 'yarn', 'ball'] });
menu.onPick = (name) => roam.play(who, name);
```

## Out of a picture

`roam.jumpOut(who, at, land)` brings one on as on the Creatures page's monitor: its feet at
`at` (world) on a picture, a beat there, then an arc down to the floor at `land` (`[x, z]`),
on the lane whose floor that's on. `who` is a ROSTER name, or one of your own already
standing somewhere (on a lane of your own inside a frame, say): that very one comes out,
in its own coat, and is one of the crew from then on. It resolves to the one that came, or
`null` (one already out stays where it is; a flier or a swimmer comes its own way).

```ts
const out = await roam.jumpOut(inFrame, inFrame.holder.getWorldPosition(new Vector3()), [x, z]);
if (out) frame.fillWithSomeoneElse();
```

## Without Roam

`Lane` is the part that does the placing, for a stage of your own: put its `group` in
your scene, `lane.group.add(c.holder)`, `c.enter(lane.frame, 'bottom', s)`, and each
frame `c.update(dt, { frame: lane.frame, pointer: lane.pointer(camera.position, time), time, crew, props: [] })`
and `lane.place(c)`. Call `setOutlineViewport(width, height)` when your canvas changes
size, so their outlines stay the same width in px.

A `Frame` of your own with `flat: true` does the same anywhere: nothing shrinks going
back, the floor is `depth` px deep, the crew stand that far back along -z, nothing is
clipped at the frame's edges and the shadow lies on the floor. `Env.pointer.z` says how far
in front of the frame the pointer is, when it's someone looking on.
