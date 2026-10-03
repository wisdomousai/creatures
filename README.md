# Creatures

Toy robots of animals for the web: 149 of them, cats, dogs, birds, farm animals,
jungle and sea creatures, bugs and a few robots who are just robots. Each is a small
three.js model with a skeleton and no animation clips. Every joint is posed live, every
frame, by springs chasing what the creature wants to do, so they walk, fly, swim and
climb about a box drawn round your page, play with each other and with toys, and watch
your mouse.

**[The playground](https://wisdomousai.github.io/creatures/)**: pick one and it jumps out
to play.

## Install

```sh
npm install @wisdomousai/creatures three
```

## Bring them on

A canvas for them and a layer for their hit areas, both over the whole window, and your
page in its own layer at the canvas's height:

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
```

```ts
import { Crew, MODELS } from '@wisdomousai/creatures';

const crew = new Crew({
  canvas: document.querySelector<HTMLCanvasElement>('#crew')!,
  hits: document.querySelector<HTMLElement>('#hits')!,
  models: MODELS,
});
// The box is drawn in an SVG just before the canvas, at its height: your page goes between
// the two, over the box and under the crew.
crew.box?.el.after(document.querySelector('main')!);
crew.start();
```

They come by themselves, a few at a time, and go again. Poke one and it startles; three
quick pokes make it dizzy; rest the mouse on one and it's happy. Hold one down and it
follows the pointer (fliers fly, walkers walk) until you let go.

`MODELS` is this version's models on jsDelivr. To serve them yourself, copy
`node_modules/@wisdomousai/creatures/models` to your public folder and pass its address,
ending in a slash: `models: '/creatures/'`.

## Options

| Option   | What it does                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------ |
| `canvas` | The canvas they're drawn on.                                                                                 |
| `hits`   | A fixed, full-window layer for their invisible hit areas.                                                    |
| `models` | Where the models are, ending in a slash.                                                                     |
| `look`   | `'ink'`, `'paper'`, `'colour'`, or `'auto'` (the default: ink on a light page, paper on a dark one).         |
| `flame`  | Rocket flames: `'beacon'` (the default, the colour of its light) or `'glow'`.                                |
| `max`    | At most this many at once (3).                                                                               |
| `roster` | Who comes by themselves (everyone). Anyone can still be called by name.                                      |
| `every`  | Seconds between arrivals, picked at random between the two (`[6, 18]`).                                      |
| `box`    | Draw the window as the open front of a shallow box they live in (on unless `false`).                         |
| `frame`  | The frame they keep to, in px (defaults to the CSS variables below).                                         |
| `pages`  | Which hangings come down from the ceiling on each page (see `page()`).                                       |
| `clear`  | Your content's column in viewport px, which the hangings keep clear of (defaults to `<main>`'s content box). |
| `behind` | Whether one is out of sight behind something of yours, so clicks go through it.                              |
| `tick`   | Called every frame just before they're drawn.                                                                |

## What you can do with them

```ts
crew.call('owl'); // bring one on by name (or the next one due: crew.call())
crew.jumpOut('cat', () => ({ x: 400, y: 300 }), 0.85); // out of a picture at that point
crew.page('creatures/cats'); // the room for a page: its hangings, set pieces and games
crew.look = 'colour';
crew.max = 5;
crew.roster = ['cat', 'kitten', 'dog'];
crew.dismiss(); // everyone off (or one: crew.dismiss('owl'))
crew.members.get('owl')?.perform('hoot'); // one of its tricks (its repertoire lists them)
crew.onMenu = (member, at) => false; // right-click or long-press on one: offer a menu?
crew.stop(); // and start(), dispose()
```

`ROSTER` has everyone by key, `CARDS` their names and what they are, `SECTIONS` and
`inFamily()` the families. `SET`, `DECOR` and `GAMES` name the set pieces, the hangings
and the games; `crew.set`, `crew.decor` and `crew.play` put them out, hang them and start
them. The pages the room knows (`PAGES`, `SET_PAGES`, `GAMES`) are `home`, `writing`,
`work-with-me`, `work`, `about`, `contact`, `creatures` and `creatures/cats`, `/dogs` and
`/birds`: the site they were made for.

## The page round them

They read a few CSS custom properties from `:root`, each with a fallback:

- `--frame-inset` (10px) and `--frame-radius` (0): the window's frame, which the box is
  drawn in.
- `--bot` (28px): their size. The playground uses 72px to 120px.
- `--paper`, `--card`, `--ink`, `--ink-soft`, `--rule`, `--rule-strong`: the box's colours.

`<html data-theme="dark">` (or a dark colour scheme, without one) turns the box to night
and, in `auto`, the crew to paper.

The hangings are big at the playground's size: on a window much under 2000px wide, only
some of them find room beside your content.

## The playground

```sh
npm install
npm run dev
```

`playground/` uses nothing but the package. In its console, `crew` is the crew.

## Making a creature

The models are built in Blender by the Python scripts in [`blender/`](blender/README.md),
which also says how to add a creature of your own.

## Licence

MIT, for everything here: the code, the models, the portraits and the Blender scripts.
