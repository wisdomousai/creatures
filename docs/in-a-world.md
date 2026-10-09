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
| `castShadows` | No shadow cards; their meshes cast and take your lights' shadows (`false`).          |
| `px`          | Lane px a metre (100).                                                               |
| `bot`         | The crew's unit in lane px (55: Bolt stands 0.8 m).                                  |
| `ceiling`     | How high fliers may go, in metres (3.2).                                             |

A lane's front edge starts at `at` and runs `along`; its floor goes back from there to the
left as you walk along it (along +x, back is -z), so it faces +z. Lay lanes along walls,
facing into the room.

| Method / property      | What it does                                                         |
| ---------------------- | -------------------------------------------------------------------- |
| `update(dt, camera)`   | A step: arrivals, everyone moved, the gone let go or sent through.   |
| `pick(ray)`            | The one a ray meets first (for pointing at them), or `null`.         |
| `poke(c)`              | It notices; poked again within 3 s, it does a trick.                 |
| `hover(c)`             | The pointer's over that one (or `null`): it knows.                   |
| `dress(look)`          | A new look for everyone.                                             |
| `enabled`              | `false`: no one new comes (those out stay till they go).             |
| `onStage`              | Who's out, and on which `Lane`.                                      |
| `lanes`                | The `Lane`s: each one's `group` is in your scene.                    |

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
