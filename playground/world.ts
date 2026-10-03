/**
 * The room's own things, on the Creatures page in place of the switchboard: three cards
 * pinned up like the playgrounds' (Furniture, Hanging, Games), each its own page of pictures
 * like the crew's. A piece or a hanging picked comes into the room (its picture fades, as a
 * crewmate's does when it's out), picked again it goes; a game picked starts. Crowd and
 * arrivals are the pads on the wall, light and look the knobs.
 */

export interface World {
  /** The pieces and hangings: every name, and the ones that are out now. */
  pieces: readonly string[];
  piecesOut: () => string[];
  setPiece: (name: string, on: boolean) => void;
  hangings: readonly string[];
  hangingsOut: () => string[];
  setHanging: (name: string, on: boolean) => void;
  scenes: () => string[];
  play: (scene: string) => void;
}

/** The room's pages under /creatures, as the playgrounds are: the three on each card. */
export const ROOM: { key: string; label: string; line: string; faces: string[] }[] = [
  {
    key: 'furniture',
    label: 'Furniture',
    line: 'Lamps, chairs and shelves. Pick one and it’s carried in.',
    faces: ['set-armchair', 'set-lamp', 'set-fern'],
  },
  {
    key: 'hanging',
    label: 'Hanging',
    line: 'Things on a string from the ceiling. Pick one and it’s let down.',
    faces: ['decor-pendant', 'decor-swing', 'decor-mobile'],
  },
  {
    key: 'games',
    label: 'Games',
    line: 'A ball, a yarn, a trampoline. Pick one and they play.',
    faces: ['prop-ball', 'prop-yarn', 'prop-trampoline'],
  },
];

/** The picture each game gets: a prop of it, or one of the crew who plays it. */
const GAME_PICTURE: Record<string, string> = {
  fetch: 'prop-bone',
  frisbee: 'prop-frisbee',
  yarn: 'prop-yarn',
  spot: 'prop-spot',
  ball: 'prop-ball',
  balloon: 'prop-balloon',
  blocks: 'prop-block-star',
  top: 'prop-top',
  trampoline: 'prop-trampoline',
  seesaw: 'prop-seesaw',
  drum: 'prop-drum',
  bubbles: 'prop-wand',
  cushion: 'prop-cushion',
  crate: 'prop-crate',
  table: 'prop-table',
  nap: 'prop-cushion',
  tag: 'pogo',
  highfive: 'bolt',
  dance: 'djbot',
  parade: 'drone',
};

const title = (s: string) => s[0].toUpperCase() + s.slice(1).replace(/[-_]/g, ' ');

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

/** One picture, name and what it is, like a crewmate (the site puts the picture in the
 * crew's look, as it does theirs). */
function tile(name: string, key: string, what: string) {
  const b = el('button', 'tile');
  b.type = 'button';
  const img = el('img', 'crewmate-face');
  img.alt = '';
  img.dataset.crew = key;
  img.width = img.height = 320;
  img.decoding = 'async';
  img.loading = 'lazy';
  img.draggable = false;
  b.append(img, el('span', 'crewmate-name', title(name)), el('span', 'crewmate-what', what));
  return b;
}

/** Pictures that come and go: each follows the room, which changes by itself too (a game
 * puts a piece away, a piece comes out with the light). */
function toggles(
  prefix: string,
  what: string,
  names: readonly string[],
  out: () => string[],
  set: (name: string, on: boolean) => void,
) {
  const g = el('div', 'crewmates');
  const tiles = names.map((n) => {
    const t = tile(n, `${prefix}-${n}`, what);
    t.addEventListener('click', () => {
      const on = !t.classList.contains('out');
      t.classList.toggle('out', on);
      set(n, on);
    });
    return t;
  });
  g.append(...tiles);
  const sync = () => {
    const on = new Set(out());
    tiles.forEach((t, i) => t.classList.toggle('out', on.has(names[i])));
  };
  sync();
  setInterval(() => g.isConnected && sync(), 800);
  return g;
}

/** The pictures on one of the room's pages. */
export function roomPage(key: string, w: World): HTMLElement {
  if (key === 'furniture') return toggles('set', 'stands', w.pieces, w.piecesOut, w.setPiece);
  if (key === 'hanging') return toggles('decor', 'hangs', w.hangings, w.hangingsOut, w.setHanging);
  const g = el('div', 'crewmates');
  for (const s of w.scenes()) {
    const t = tile(s, GAME_PICTURE[s] ?? 'bolt', 'game');
    t.addEventListener('click', () => w.play(s));
    g.append(t);
  }
  return g;
}
