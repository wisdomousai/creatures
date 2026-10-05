import { CARDS, ROSTER, SECTIONS } from '@wisdomousai/creatures';

/**
 * Finding one of the crew by what you'd call it: its name, what it is, its key, its family,
 * or any of its search words (colours, looks, what it does). All on the page, nothing sent
 * anywhere: each word typed has to match something of theirs, whole, as the start of a
 * word, inside one, or near enough (a letter or two out, for the longer words). A match on
 * what it is counts most, then its name, its key and family, and its search words least.
 */

/** Lower case, no accents, in words. */
function words(text: string) {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Words that don't help find anyone ("a black and white cat"). */
const FILLER = new Set(['a', 'an', 'the', 'and', 'or', 'with', 'of', 'in', 'on', 'that', 'who']);

interface Field {
  words: string[];
  /** The words run together, for "maine coon" typed as "mainecoon" and the like. */
  joined: string;
  weight: number;
}

/** Each family by its heading and by itself ("Birds bird"); "Everyone else" isn't one. */
const FAMILY = new Map(
  SECTIONS.filter((s) => s.family !== 'other').map((s) => [s.family, `${s.label} ${s.family}`]),
);

function field(text: string, weight: number): Field {
  const w = words(text);
  return { words: w, joined: w.join(''), weight };
}

/** Everyone who can be found (weight 0 never comes by, and has no picture), in order. */
const INDEX = Object.keys(CARDS)
  .filter((key) => ROSTER[key]?.weight !== 0)
  .map((key) => {
    const c = CARDS[key];
    return {
      key,
      fields: [
        field(c.name, 2.5),
        field(c.what, 3),
        field(key, 2),
        field(FAMILY.get(c.family) ?? '', 2.5),
        field(ROSTER[key]?.terms ?? '', 1.5),
      ],
    };
  });

/** How many can be found. */
export const FINDABLE = INDEX.length;

/** Edits (a letter in, out, changed, or two swapped) from a to b, or more than `most`. */
function edits(a: string, b: string, most: number) {
  if (Math.abs(a.length - b.length) > most) return most + 1;
  let back2: number[] = [];
  let back = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let least = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(back[j] + 1, row[j - 1] + 1, back[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d = Math.min(d, back2[j - 2] + 1);
      row.push(d);
      least = Math.min(least, d);
    }
    if (least > most) return most + 1;
    back2 = back;
    back = row;
  }
  return back[b.length];
}

/** How well one typed word matches one of their words, 0 to 1. */
function match(t: string, w: string) {
  if (w === t) return 1;
  // The start of a word, better the more of it there is.
  if (w.startsWith(t)) return 0.6 + 0.3 * (t.length / w.length);
  if (t.length >= 3 && w.includes(t)) return 0.55;
  // Near enough: a letter out in five ("tortise"), two in seven ("elefant"). Shorter than
  // that, a letter out is another word ("fish", "dish").
  if (t.length < 5) return 0;
  const most = t.length >= 7 ? 2 : 1;
  const d = edits(t, w, most);
  if (d <= most) return 0.5 - 0.1 * (d - 1);
  // Still typing a long word, a letter out: "hamstr", "elephnt".
  if (w.length > t.length && edits(t, w.slice(0, t.length), most) <= most) return 0.4;
  return 0;
}

/** How well one typed word matches one of the crew: its best field, weighted. */
function score(t: string, fields: Field[]) {
  let best = 0;
  for (const f of fields) {
    let m = 0;
    for (const w of f.words) m = Math.max(m, match(t, w));
    if (m < 0.55 && t.length >= 4 && f.joined.includes(t)) m = 0.55;
    best = Math.max(best, m * f.weight);
  }
  return best;
}

/** The typed word, or it without a plural's s or es ("cats", "foxes"): the better. */
function scoreWord(t: string, fields: Field[]) {
  let s = score(t, fields);
  if (t.length > 3 && t.endsWith('s')) s = Math.max(s, 0.95 * score(t.slice(0, -1), fields));
  if (t.length > 4 && t.endsWith('es')) s = Math.max(s, 0.95 * score(t.slice(0, -2), fields));
  return s;
}

/** The keys of those who match all the words typed, best first. */
export function find(query: string) {
  const typed = words(query);
  // Filler only among other words: a lone "a" is the start of "alpaca".
  const meant = typed.filter((t) => !FILLER.has(t));
  const ts = meant.length ? meant : typed;
  if (!ts.length) return [];
  // Two or more words might be one run apart ("guinea pig" for guineapig).
  const run = ts.length > 1 ? ts.join('') : '';
  const found: { key: string; score: number; at: number }[] = [];
  INDEX.forEach((d, at) => {
    let total = 0;
    for (const t of ts) {
      const s = scoreWord(t, d.fields);
      if (!s) {
        total = 0;
        break;
      }
      total += s;
    }
    if (run) total = Math.max(total, scoreWord(run, d.fields) * ts.length);
    if (total) found.push({ key: d.key, score: total, at });
  });
  return found.sort((a, b) => b.score - a.score || a.at - b.at).map((f) => f.key);
}
