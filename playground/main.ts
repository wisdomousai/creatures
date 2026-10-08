import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource-variable/schibsted-grotesk';
import './playground.css';
import {
  CARDS,
  Crew,
  DECOR,
  GAMES,
  PLAYGROUNDS,
  ROSTER,
  SECTIONS,
  SET,
  inFamily,
  installCommand,
  type Character,
  type Family,
  type Held,
  type LookName,
} from '@wisdomousai/creatures';
import { menu } from './menu';
import { FINDABLE, find } from './search';
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
/** On a small screen the sheet is folded away to this card, and opens over the box. */
const opener = document.querySelector<HTMLButtonElement>('.opener')!;
const small = matchMedia('(max-width: 40rem), (max-height: 32rem)');
const everyone = Object.keys(ROSTER);
/** How many at once, on a small screen and a big one: a few, so each can be watched. */
const crowd = () => (small.matches ? 2 : 3);

const crew = new Crew({
  canvas: document.querySelector<HTMLCanvasElement>('#crew')!,
  hits: document.querySelector<HTMLElement>('#hits')!,
  models: MODELS,
  look: (q.get('look') as LookName | null) ?? 'colour',
  max: crowd(),
  every: [8, 20],
  clear: () => column(),
});
// The box's drawing goes in just before the crew's canvas: the sheet (or the card it folds
// to) hangs between.
crew.box?.el.after(opener, sheet);
if (q.get('theme') === 'dark') root.dataset.theme = 'dark';

/** The sheet's column (on a small screen, the card it folds to), which the hangings keep
 * clear of. */
function column() {
  const r = (small.matches ? opener : sheet).getBoundingClientRect();
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

function faces(within: ParentNode = document) {
  for (const img of within.querySelectorAll<HTMLImageElement>('img[data-crew]')) {
    const src = `${MODELS}thumbs/${img.dataset.crew}-${crew.look}.webp`;
    if (img.getAttribute('src') !== src) img.src = src;
  }
}

/** Each of the crew's place on the sheet, made once: a page or a search shows it again
 * with its picture already in. */
const cells = new Map<string, HTMLElement>();

/** One of the crew, its picture, name and what it is: picked, it jumps out to play. */
function crewmate(name: string) {
  const made = cells.get(name);
  if (made) return made;
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
  const cell = el('div', 'crewmate-cell', b, installKey(name, c.name));
  cells.set(name, cell);
  return cell;
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

/** Some of the crew, side by side. */
function crewmates(names: string[]) {
  return el('div', 'crewmates', ...names.map(crewmate));
}

/** Everyone in a family who comes by (weight 0 never does, and has no picture). */
function family(f: Family) {
  return crewmates(inFamily(f).filter((n) => ROSTER[n]?.weight !== 0));
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
  // On a small screen the sheet shuts as it's picked: it comes out of the folded card.
  const from = small.matches ? opener.querySelector('.card-faces')! : tile.querySelector('img')!;
  const feet = () => {
    const r = from.getBoundingClientRect();
    return from.isConnected && r.width
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
      family(s.family),
    ]),
  ];
}

/** The page in the address: a playground, one of the room's, or everyone (''). */
function here() {
  const key = location.hash.slice(1);
  const ground = PLAYGROUNDS.find((g) => g.key === key);
  const room = ROOM.find((r) => r.key === key);
  return { ground, room, place: ground || room ? key : '' };
}

/** The sheet: whoever matches what's typed in the search, or else the page in the address. */
function page() {
  const sought = search.value.trim();
  root.toggleAttribute('data-searching', !!sought);
  clear.hidden = !search.value;
  if (sought) {
    const keys = find(sought);
    found.value = keys.length ? `${keys.length} found` : 'none';
    content.replaceChildren(
      keys.length
        ? crewmates(keys)
        : el(
            'p',
            'line nobody',
            'Nobody like that. Try what they are (dog, fish, robot), a colour, or how they get about (hop, swim, fly).',
          ),
    );
  } else {
    found.value = '';
    const { ground, room } = here();
    if (ground)
      content.replaceChildren(
        el('h2', '', ground.label),
        el('p', 'line', `${ground.line} Pick one and it jumps out to play.`),
        family(ground.family),
      );
    else if (room)
      content.replaceChildren(
        el('h2', '', room.label),
        el('p', 'line', room.line),
        roomPage(room.key, world),
      );
    else content.replaceChildren(...everyonePage());
  }
  faces();
}

let shown: string | undefined;
/** The page in the address: the sheet shows it, and the room turns into it. */
function show() {
  const { ground, room, place } = here();
  for (const a of nav.querySelectorAll<HTMLAnchorElement>('a'))
    a.toggleAttribute('aria-current', a.dataset.place === place);
  // The folded card has three of the page's pictures on it.
  const pictures = ground
    ? inFamily(ground.family).slice(0, 3)
    : (room?.faces ?? PLAYGROUNDS.map((p) => inFamily(p.family)[0]));
  opener
    .querySelector('.card-faces')!
    .replaceChildren(...pictures.map((n) => face(n, 'card-face')));
  page();
  sheet.scrollTop = 0;
  if (place === shown) return;
  shown = place;

  // The room stays as it is on every page (bare, till something is put in it from the
  // Furniture or Hanging page). A family's playground has its own games, and only that
  // family come, more of them and more often; the others there go, one after another.
  crew.play?.favour(ground ? (GAMES[`creatures/${place}`] ?? []) : []);
  crew.roster = ground ? inFamily(ground.family).filter((n) => ROSTER[n]) : everyone;
  if (!ground) return;
  let i = 0;
  for (const [name, m] of crew.members)
    if (m.state !== 'gone' && !crew.roster.includes(name)) setTimeout(() => m.leave(), 500 * i++);
}

// ---------- The search ----------

// At the top of the sheet, staying there as it scrolls: what's typed picks out everyone it
// matches, in place of the page (the ways to the other pages step aside till it's empty).
// Enter calls out the first, Escape empties it, and / anywhere goes to it.
const search = sheet.querySelector<HTMLInputElement>('#find')!;
const found = sheet.querySelector<HTMLOutputElement>('.found')!;
const clear = sheet.querySelector<HTMLButtonElement>('.clear')!;
const head = sheet.querySelector<HTMLElement>('.head')!;
search.placeholder = `Search ${FINDABLE} creatures`;

search.addEventListener('input', () => {
  page();
  // Scrolled down, the search is stuck at the top: what it found starts just under it.
  const top = head.offsetTop + head.offsetHeight;
  if (sheet.scrollTop > top) sheet.scrollTop = top;
});
search.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    content.querySelector<HTMLButtonElement>('button.crewmate')?.click();
  } else if (e.key === 'Escape' && search.value) {
    e.preventDefault();
    search.value = '';
    page();
  }
});
clear.addEventListener('click', () => {
  search.value = '';
  page();
  search.focus();
});
addEventListener('keydown', (e) => {
  const at = e.target as HTMLElement;
  if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
  if (at.closest('input, textarea, select, [contenteditable]')) return;
  e.preventDefault();
  unfold(true);
  search.focus();
  search.select();
});

// Another page empties the search.
addEventListener('hashchange', () => {
  search.value = '';
  show();
});
show();

// ---------- The settings (look and lights), and send out ----------

// The look and the lights are on a card of their own, which the key in the box's top
// corner opens; the key again, a click anywhere else, or Escape shuts it.
const settingsKey = document.querySelector<HTMLButtonElement>('.settings-key')!;
const settings = document.querySelector<HTMLElement>('#settings')!;

function showSettings(open: boolean) {
  settings.hidden = !open;
  settingsKey.setAttribute('aria-expanded', String(open));
}
settingsKey.addEventListener('click', () => showSettings(!!settings.hidden));
addEventListener(
  'pointerdown',
  (e) => {
    const at = e.target as Node;
    if (!settings.hidden && !settings.contains(at) && !settingsKey.contains(at))
      showSettings(false);
  },
  true,
);
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || settings.hidden || e.defaultPrevented) return;
  e.preventDefault();
  showSettings(false);
  settingsKey.focus({ preventScroll: true });
});

function choice<T extends string>(
  name: string,
  options: { value: T; label: string }[],
  current: () => T,
  pick: (value: T) => void,
) {
  const g = document.querySelector<HTMLElement>(`[data-choice="${name}"]`)!;
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

sheet.querySelector('.send')!.addEventListener('click', () => {
  crew.dismiss();
  unfold(false);
});

// ---------- On a small screen ----------

// There the sheet would fill the box and leave the crew no room to play: it's folded away
// to a card pinned in the middle of the back wall. Picked, the card opens the sheet over
// the box; a picture picked shuts it again, and out that one jumps, from the card.
const shut = document.querySelector<HTMLButtonElement>('.shut')!;

/** Open the sheet over the box, or fold it away again. */
function unfold(open: boolean) {
  const was = root.hasAttribute('data-unfolded');
  if (open === was || (open && !small.matches)) return;
  root.toggleAttribute('data-unfolded', open);
  opener.setAttribute('aria-expanded', String(open));
  if (open) shut.focus({ preventScroll: true });
  else if (sheet.contains(document.activeElement) || document.activeElement === shut)
    opener.focus({ preventScroll: true });
}
opener.addEventListener('click', () => unfold(true));
shut.addEventListener('click', () => unfold(false));
document.querySelector('.scrim')!.addEventListener('click', () => unfold(false));
document.querySelector('.skip')!.addEventListener('click', () => unfold(true));
content.addEventListener('click', (e) => {
  if ((e.target as Element).closest('.crewmate, .tile')) unfold(false);
});
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !e.defaultPrevented) unfold(false);
});
small.addEventListener('change', () => unfold(false));

// ---------- Tricks ----------

// A right-click (or a long press) on one of the crew or a set piece: its tricks, to pick
// one, and at the foot a way to send it off or put it away.
const signs = new Map<Character, Held>();
crew.onMenu = (m, at) => {
  // Those who can hold a sign are asked to, with their own name on it; picked, it leads them
  // off toward the nearer side.
  const sign = crew.canHold(m, 'sign') ? [signs.has(m) ? 'putDownSign' : 'holdUpSign'] : [];
  return menu(
    at,
    m.spec.name,
    [...m.repertoire, ...sign],
    (act) => {
      if (act === 'putDownSign') return signs.get(m)?.release();
      if (act !== 'holdUpSign') return m.perform(act);
      const held = crew.holdUp(m, 'sign', {
        label: m.spec.name,
        onPick: () => void held?.lead(m.s < innerWidth / 2 ? 'left' : 'right'),
      });
      if (!held) return;
      signs.set(m, held);
      const gone = setInterval(() => {
        if (!held.released) return;
        clearInterval(gone);
        signs.delete(m);
      }, 500);
    },
    { label: 'Send out', run: () => m.leave() },
    sign,
  );
};
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
