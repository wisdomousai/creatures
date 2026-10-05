import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource-variable/schibsted-grotesk';
import './playground.css';
import {
  CARDS,
  Crew,
  DECOR,
  PLAYGROUNDS,
  ROSTER,
  SECTIONS,
  SET,
  inFamily,
  installCommand,
  type Family,
  type LookName,
} from '@wisdomousai/creatures';
import { menu } from './menu';
import { words } from './words';
import { ROOM, roomPage } from './world';

/**
 * The crew's playground: everyone's picture on a sheet pinned to the back of the box, the
 * box round it. Pick a picture and that one jumps out to play. A family's playground has
 * only that family come by, with its own set pieces and games; the room's pages bring in
 * its furniture, its hangings and its games. It uses nothing but the package, so whatever
 * it does a page of yours can.
 */

/** The models (and the pictures) are served beside the page: the package's models/. */
const MODELS = import.meta.env.BASE_URL;
const q = new URLSearchParams(location.search);
const root = document.documentElement;
const sheet = document.querySelector<HTMLElement>('#sheet')!;
const content = document.querySelector<HTMLElement>('#page')!;
const everyone = Object.keys(ROSTER);
/** How many at once, on a small screen and a big one. */
const crowd = () => (innerWidth < 720 ? 3 : 5);

const crew = new Crew({
  canvas: document.querySelector<HTMLCanvasElement>('#crew')!,
  hits: document.querySelector<HTMLElement>('#hits')!,
  models: MODELS,
  max: crowd(),
  every: [2, 7],
  clear: () => column(),
});
// The box's drawing goes in just before the crew's canvas: the sheet hangs between.
crew.box?.el.after(sheet);
if (q.get('look')) crew.look = q.get('look') as LookName;
if (q.get('theme') === 'dark') root.dataset.theme = 'dark';

/** The sheet's column, which the hangings keep clear of. */
function column() {
  const r = sheet.getBoundingClientRect();
  return { left: r.left, right: r.right, top: r.top };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', ...kids: (Node | string)[]) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  e.append(...kids);
  return e;
}

// ---------- The pictures ----------

/** A picture of one of the crew (or a thing), in the look the crew are in. */
function face(name: string, cls: string) {
  const img = el('img', cls);
  img.alt = '';
  img.dataset.crew = name;
  img.width = img.height = 320;
  img.decoding = 'async';
  img.loading = 'lazy';
  img.draggable = false;
  return img;
}

function faces(within: ParentNode = sheet) {
  for (const img of within.querySelectorAll<HTMLImageElement>('img[data-crew]')) {
    const src = `${MODELS}thumbs/${img.dataset.crew}-${crew.look}.webp`;
    if (img.getAttribute('src') !== src) img.src = src;
  }
}

/** One of the crew, its picture, name and what it is: picked, it jumps out to play. */
function crewmate(name: string) {
  const c = CARDS[name];
  const b = el(
    'button',
    'crewmate',
    face(name, 'crewmate-face'),
    el('span', 'crewmate-name', c.name),
    el('span', 'crewmate-what', c.what),
  );
  b.type = 'button';
  b.dataset.crew = name;
  b.setAttribute('aria-label', `${c.name}, ${c.what.toLowerCase()}: call out to play`);
  b.addEventListener('click', () => callOut(b));
  return el('div', 'crewmate-cell', b, installKey(name, c.name));
}

/** A small key that copies `text` (the command itself shows as its title); says so for a moment. */
function copyKey(label: string, text: string, aria: string) {
  const k = el('button', 'install', el('code', '', label));
  k.type = 'button';
  k.title = text;
  k.setAttribute('aria-label', aria);
  k.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return; // no clipboard (an insecure page): the title still shows the command
    }
    k.classList.add('copied');
    k.firstElementChild!.textContent = 'copied';
    setTimeout(() => {
      k.classList.remove('copied');
      k.firstElementChild!.textContent = label;
    }, 1400);
  });
  return k;
}

/** The key under one of the crew: the command that puts just this one in a project. */
function installKey(name: string, who: string) {
  return copyKey(`add ${name}`, installCommand(name), `Copy the install command for ${who}`);
}

// The foot of the sheet: the skill, for a coding agent that makes new ones.
document
  .querySelector('.agents')!
  .append(copyKey('skill', 'npx @wisdomousai/creatures skill', 'Copy the command that installs the make-a-creature skill'));

/** Everyone in a family who comes by (weight 0 never does, and has no picture). */
function crewmates(family: Family) {
  const g = el('div', 'crewmates');
  for (const n of inFamily(family)) if (ROSTER[n]?.weight !== 0) g.append(crewmate(n));
  return g;
}

/** A card pinned to the sheet, three pictures on it: it goes to a playground or the room's
 * page. */
function card(key: string, label: string, line: string, pictures: string[], turn: number) {
  const a = el(
    'a',
    'card',
    el('i', 'pin'),
    el('span', 'card-faces', ...pictures.map((n) => face(n, 'card-face'))),
    el('span', 'card-name', label),
    el('span', 'card-line', line),
  );
  a.href = `#${key}`;
  a.style.setProperty('--turn', `${turn}deg`);
  return a;
}

/** A picture picked: out it jumps, from where its feet are in the picture. One out already
 * does a trick. */
function callOut(tile: HTMLElement) {
  const name = tile.dataset.crew!;
  const m = crew.members.get(name);
  if (m?.state === 'here') return m.trick();
  if ((m && m.state !== 'gone') || crew.coming(name)) return;
  const img = tile.querySelector('img')!;
  const feet = () => {
    const r = img.getBoundingClientRect();
    return img.isConnected && r.width
      ? { x: r.left + r.width / 2, y: r.top + r.height * 0.86 }
      : null;
  };
  tile.classList.add('out');
  crew.watch(feet, 1.8);
  // The sheet is pinned to the back wall: it comes out a little in front of that.
  void crew.jumpOut(name, feet, 0.85);
}

/** Which of them are out of their pictures. */
function markOut() {
  for (const tile of sheet.querySelectorAll<HTMLElement>('button.crewmate')) {
    const name = tile.dataset.crew!;
    const m = crew.members.get(name);
    tile.classList.toggle('out', crew.coming(name) || (!!m && m.state !== 'gone'));
  }
}
setInterval(markOut, 200);

// ---------- The pages ----------

const PLACES = [
  { key: '', label: 'Everyone' },
  ...PLAYGROUNDS.map((p) => ({ key: p.key, label: p.label })),
  ...ROOM.map((r) => ({ key: r.key, label: r.label })),
];

const nav = sheet.querySelector<HTMLElement>('.places')!;
for (const p of PLACES) {
  const a = el('a', '', p.label);
  a.href = p.key ? `#${p.key}` : '#';
  a.dataset.place = p.key;
  nav.append(a);
}

/** The room as a world: its pieces, hangings and games, for the room's pages. */
const world = {
  pieces: SET,
  piecesOut: () => crew.set?.names ?? [],
  setPiece: (n: string, on: boolean) => {
    if (on) void crew.set?.putOut(n, crew.frame);
    else crew.set?.putAway(n);
  },
  hangings: DECOR,
  hangingsOut: () => crew.decor?.names ?? [],
  setHanging: (n: string, on: boolean) => {
    const names = crew.decor?.names ?? [];
    crew.decor?.show(on ? [...names, n] : names.filter((x) => x !== n), crew.frame);
  },
  scenes: () => crew.play?.scenes ?? [],
  play: (name: string) => void crew.play?.start(name),
};

function everyonePage() {
  const grounds = el('div', 'cards');
  PLAYGROUNDS.forEach((p, i) =>
    grounds.append(
      card(p.key, p.label, p.line, inFamily(p.family).slice(0, 3), [-1, 0.8, -0.5][i]),
    ),
  );
  const room = el('div', 'cards');
  ROOM.forEach((r, i) => room.append(card(r.key, r.label, r.line, r.faces, [0.7, -0.9, 0.4][i])));
  return [
    el('h2', '', 'Playgrounds'),
    grounds,
    el('h2', '', 'Room'),
    room,
    ...SECTIONS.filter((s) => inFamily(s.family).length).flatMap((s) => [
      el('h2', '', s.label),
      crewmates(s.family),
    ]),
  ];
}

let shown = '';
/** The page in the address: the sheet shows it, and the room turns into it. */
function show() {
  const key = location.hash.slice(1);
  const ground = PLAYGROUNDS.find((g) => g.key === key);
  const room = ROOM.find((r) => r.key === key);
  const place = ground || room ? key : '';
  if (place === shown && content.childElementCount) return;
  shown = place;
  for (const a of nav.querySelectorAll<HTMLAnchorElement>('a'))
    a.toggleAttribute('aria-current', a.dataset.place === place);
  if (ground)
    content.replaceChildren(
      el('h2', '', ground.label),
      el('p', 'line', `${ground.line} Pick one and it jumps out to play.`),
      crewmates(ground.family),
    );
  else if (room)
    content.replaceChildren(
      el('h2', '', room.label),
      el('p', 'line', room.line),
      roomPage(room.key, world),
    );
  else content.replaceChildren(...everyonePage());
  faces(content);
  sheet.scrollTop = 0;

  // The room follows: a family's playground has only that family come, more of them and
  // more often; the others there go, one after another.
  crew.page(place ? `creatures/${place}` : 'creatures');
  crew.roster = ground ? inFamily(ground.family).filter((n) => ROSTER[n]) : everyone;
  if (!ground) return;
  let i = 0;
  for (const [name, m] of crew.members)
    if (m.state !== 'gone' && !crew.roster.includes(name)) setTimeout(() => m.leave(), 500 * i++);
}
addEventListener('hashchange', show);
show();

// ---------- Look, lights, send out ----------

function choice<T extends string>(
  name: string,
  options: { value: T; label: string }[],
  current: () => T,
  pick: (value: T) => void,
) {
  const g = sheet.querySelector<HTMLElement>(`[data-choice="${name}"]`)!;
  const buttons = options.map((o) => {
    const b = el('button', '', o.label);
    b.type = 'button';
    b.addEventListener('click', () => {
      pick(o.value);
      sync();
    });
    return b;
  });
  const sync = () =>
    buttons.forEach((b, i) =>
      b.setAttribute('aria-pressed', String(options[i].value === current())),
    );
  g.append(el('span', 'choice-name', name[0].toUpperCase() + name.slice(1)), ...buttons);
  sync();
  return sync;
}

const syncLook = choice<LookName | 'auto'>(
  'look',
  [
    { value: 'auto', label: 'Auto' },
    { value: 'ink', label: 'Ink' },
    { value: 'paper', label: 'Paper' },
    { value: 'colour', label: 'Colour' },
  ],
  () => crew.lookChosen,
  (look) => {
    crew.look = look;
    faces();
  },
);

const dark = matchMedia('(prefers-color-scheme: dark)');
const isDark = () => (root.dataset.theme ? root.dataset.theme === 'dark' : dark.matches);
choice<'day' | 'night'>(
  'lights',
  [
    { value: 'day', label: 'Day' },
    { value: 'night', label: 'Night' },
  ],
  () => (isDark() ? 'night' : 'day'),
  (v) => {
    root.dataset.theme = v === 'night' ? 'dark' : 'light';
    // In auto the crew turn ink or paper with the page: their pictures do too.
    queueMicrotask(() => {
      faces();
      syncLook();
    });
  },
);
dark.addEventListener('change', () => faces());

sheet.querySelector('.send')!.addEventListener('click', () => crew.dismiss());

// ---------- Tricks ----------

// A right-click (or a long press) on one of the crew or a set piece: its tricks, to pick
// one, and at the foot a way to send it off or put it away.
crew.onMenu = (m, at) =>
  menu(at, m.spec.name, m.repertoire, (act) => m.perform(act), {
    label: 'Send out',
    run: () => m.leave(),
  });
if (crew.set)
  crew.set.onMenu = (p, at) => {
    const name = words(p.name);
    return menu(at, name[0].toUpperCase() + name.slice(1), p.repertoire, (act) => p.perform(act), {
      label: 'Put away',
      run: () => crew.set?.putAway(p.name),
    });
  };

addEventListener('resize', () => (crew.max = crowd()));
crew.start();
// For the console: crew.members.get('owl').perform('hoot'), crew.call('cat').
Object.assign(window, { crew });
