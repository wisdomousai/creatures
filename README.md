# Creatures

Hoot the owl can turn his head right round to see who's behind him. Lag the sloth is
always low on battery, so when you poke him the poke reaches him a second later. Link the
dachshund is too long to turn round in one go and does it in three. Earl, who is a
teapot, pours tea for whoever is standing nearest and then bows.

They are 149 toy robots, and they live in a box drawn round your web page. They walk
in along the floor, come up through it, fly down from the ceiling and climb the walls. They
play fetch and hide and seek, knock down each other's towers of blocks, nap in a heap, and
keep an eye on your mouse. None of it is a recorded animation. Every joint is on a spring,
and each creature decides, frame by frame, where its joints would like to be.

**[Meet them in the playground](https://wisdomousai.github.io/creatures/)**

## Put them on your page

```sh
npm install @wisdomousai/creatures three
```

They need a canvas, a layer for their hit areas, and your page in between the box and
the crew:

```html
<main>Your page</main>
<canvas id="crew"></canvas>
<div id="hits"></div>
```

```css
#crew,
#hits {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
}
#hits {
  z-index: 2;
}
main {
  position: relative;
  z-index: 1;
}
:root {
  --bot: 96px; /* how big they are */
}
```

```ts
import { Crew, MODELS } from '@wisdomousai/creatures';

const crew = new Crew({
  canvas: document.querySelector<HTMLCanvasElement>('#crew')!,
  hits: document.querySelector<HTMLElement>('#hits')!,
  models: MODELS,
});
crew.box?.el.after(document.querySelector('main')!); // the box goes behind your page
crew.start();
```

Then wait. Before long someone turns up, potters about for a minute or so and goes home.
Poke one and it jumps; poke it three times quickly and it gets dizzy; rest the mouse on it
and it goes soppy. Hold one down and it follows the pointer, flying if it can.

`MODELS` fetches this version's models from jsDelivr. To serve them yourself, copy
`node_modules/@wisdomousai/creatures/models` into your public folder and pass
`models: '/creatures/'`, trailing slash and all.

### Only some of them

All the models are about 46 MB, and you rarely want them all. Copy just the ones you use
into your project (every card in the playground has this command to copy):

```sh
npx @wisdomousai/creatures add owl fox
```

That puts `owl.glb` and `fox.glb` in `public/creatures/`, with the textures and room
pictures they share (about 3 MB in all), and prints the `Crew` options to match. Names work
as well as keys: `add hoot` is `add owl`. `creatures list` shows who there is.

| Option          | What it does                                                          |
| --------------- | --------------------------------------------------------------------- |
| `--to <folder>` | Copies there instead (`public/creatures`, else `./creatures`).        |
| `--scenery`     | Also the hangings, props and set pieces the pages and games bring in. |
| `--bare`        | Leaves out the shared textures and pictures.                          |
| `--all`         | Every model, as the package ships them.                               |

Set `roster: ['owl', 'fox']` so nobody else is sent for.

## Some things to ask of them

```ts
crew.call('owl'); // Hoot, now
crew.members.get('owl')?.perform('roundAndBack'); // the head, right round and back
crew.call('teapot');
crew.members.get('teapot')?.perform('bow');
crew.look = 'colour'; // everyone in their own colours (or 'ink', 'paper')
crew.max = 8; // a crowd
crew.page('creatures/dogs'); // the dogs' room: a kennel, a stool, a pendant lamp
crew.dismiss(); // everyone home
```

Everyone has tricks of their own, and `crew.members.get('owl')?.repertoire` lists Hoot's.
The rest of the options and methods are in [the reference](docs/reference.md).

## Make one of your own

A creature is two files that agree on some names. A Python script builds the body in
Blender out of rounded shapes, gives it a skeleton and names every part. A TypeScript class
gives it a life: what it likes doing, how springy each joint is, and what its lights do
when it's happy. The model carries no animation at all, and the class has never heard of a
keyframe.

![Digby, a robot star-nosed mole, from four sides](docs/digby-turnaround.png)

Digby here is a star-nosed mole with a miner's lamp, made to show how it's done. He isn't
in the crew, so he's yours to copy. [How a creature is made](docs/how-they-are-made.md)
follows him from his first shape to his first dig, and his files are in
[`skills/make-a-creature/example`](skills/make-a-creature/example).

Or have your coding agent do it:

```sh
npx @wisdomousai/creatures skill
```

That copies the make-a-creature skill into `.claude/skills/` (`--global` for
`~/.claude/skills`, `--to <folder>` for another agent's folder). `npx skills add
wisdomousai/creatures` does the same from GitHub.

and ask it for a robot armadillo that rolls into a ball.

## Working on the crew

```sh
npm install
npm run dev     # the playground, on the source; `crew` is in the console
npm run check   # types
npm run build   # the package
```

The models are rebuilt from `blender/`, which has [its own notes](blender/README.md).

## Licence

MIT, for all of it: the code, the models, the portraits and the Blender scripts.
