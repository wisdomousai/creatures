#!/usr/bin/env node
// Copies some of the crew into your project, so you serve a few models instead of all
// of them:  npx @wisdomousai/creatures add owl fox
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const models = fileURLToPath(new URL('../models/', import.meta.url));
const skills = fileURLToPath(new URL('../skills/', import.meta.url));

// Scenery is named by prefix; everything else in models/ is a creature (ROSTER's keys are
// the file names), so there is no list to keep in step.
const SCENERY = ['decor-', 'prop-', 'set-'];
const files = readdirSync(models).filter((f) => f.endsWith('.glb'));
const scenery = files.filter((f) => SCENERY.some((p) => f.startsWith(p)));
const crew = files.filter((f) => !scenery.includes(f)).map((f) => f.slice(0, -4));

// Their names ('Hoot' for owl) come from the built package, if it's there: `add hoot` works too.
const cards = await import('../dist/families.js').then((m) => m.CARDS, () => ({}));
const byName = new Map();
for (const key of crew) {
  const name = cards[key]?.name.toLowerCase();
  if (name) byName.set(name, [...(byName.get(name) ?? []), key]);
}
/** The key for what was typed: a key itself, else a name only one of them has. */
const resolve_ = (word) => {
  const w = word.toLowerCase();
  if (crew.includes(w)) return w;
  const keys = byName.get(w);
  return keys?.length === 1 ? keys[0] : null;
};

const HELP = `creatures add <name…> [--to <folder>] [--scenery] [--bare]
creatures add --all [--to <folder>]
creatures list
creatures skill [--global] [--to <folder>]

  --to <folder>  where to copy to (default: public/creatures, else ./creatures)
  --scenery      also the decorations, props and set pieces (${scenery.length} files)
  --bare         skip the shared textures and room pictures (tex/, pic/)
  --all          every model, as the package ships them

skill copies the package's agent skills (how to make a creature) to .claude/skills,
or ~/.claude/skills with --global.`;

function fail(message) {
  console.error(message);
  process.exit(1);
}

/** The few names that look most like a mistyped one. */
function near(name) {
  const w = name.toLowerCase();
  const close = crew.filter((c) => c.startsWith(w.slice(0, 2)) || c.includes(w) || cards[c]?.name.toLowerCase().includes(w));
  return close.slice(0, 5);
}

const [command, ...rest] = process.argv.slice(2);
const names = [];
const flags = new Set();
let to = null;
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === '--to') to = rest[++i] ?? fail('--to wants a folder');
  else if (rest[i].startsWith('--')) flags.add(rest[i]);
  else names.push(rest[i]);
}

if (command === 'list') {
  const width = Math.max(...crew.map((k) => k.length));
  for (const key of crew) {
    const c = cards[key];
    console.log(c ? `${key.padEnd(width)}  ${c.name} · ${c.what}` : key);
  }
  process.exit(0);
}
if (command === 'skill') {
  const base = to ?? (flags.has('--global') ? join(homedir(), '.claude', 'skills') : join('.claude', 'skills'));
  const found = existsSync(skills) ? readdirSync(skills).filter((d) => existsSync(join(skills, d, 'SKILL.md'))) : [];
  if (!found.length) fail('This copy of the package has no skills in it.');
  for (const name of found) cpSync(join(skills, name), join(resolve(base), name), { recursive: true });
  console.log(`Copied ${found.join(', ')} to ${relative(process.cwd(), resolve(base)) || '.'}/. Ask your coding agent for a new creature.`);
  process.exit(0);
}
if (command !== 'add') {
  console.log(HELP);
  process.exit(command ? 1 : 0);
}

const known = new Set(['--scenery', '--bare', '--all', '--global']);
for (const f of flags) if (!known.has(f)) fail(`Unknown option ${f}\n\n${HELP}`);
if (!flags.has('--all') && names.length === 0) fail(`Which creature? Try: creatures list\n\n${HELP}`);

const unknown = names.filter((n) => !resolve_(n));
if (unknown.length) {
  fail(
    unknown
      .map((n) => `No creature called "${n}".` + (near(n).length ? ` Did you mean ${near(n).join(', ')}?` : ''))
      .join('\n'),
  );
}
const resolved = names.map(resolve_);
for (const [i, n] of names.entries()) if (n.toLowerCase() !== resolved[i]) console.log(`${n} is ${resolved[i]}.`);
const keys = [...new Set(resolved)];

const dest = resolve(to ?? (existsSync('public') ? 'public/creatures' : 'creatures'));
mkdirSync(dest, { recursive: true });

const wanted = flags.has('--all')
  ? files
  : [...keys.map((k) => `${k}.glb`), ...(flags.has('--scenery') ? scenery : [])];
for (const file of wanted) copyFileSync(join(models, file), join(dest, file));

// The textures and room pictures are shared by all of them, so they come once, with the first.
const shared = flags.has('--bare') ? [] : ['tex', 'pic'];
for (const dir of shared) cpSync(join(models, dir), join(dest, dir), { recursive: true });

const size = (path) => (statSync(path).isDirectory()
  ? readdirSync(path).reduce((sum, f) => sum + size(join(path, f)), 0)
  : statSync(path).size);
const bytes = size(dest);
const where = relative(process.cwd(), dest) || '.';
console.log(`Copied ${wanted.length} model${wanted.length === 1 ? '' : 's'}${shared.length ? ' and the shared textures' : ''} to ${where}/ (${(bytes / 1e6).toFixed(1)} MB in all).`);

// public/creatures is served at /creatures/; anywhere else, only you know where it goes.
const url = relative(resolve('public'), dest).startsWith('..') ? '/creatures/' : `/${relative(resolve('public'), dest)}/`;
console.log(`
Serve that folder, then:

  new Crew({
    canvas, hits,
    models: '${url}',${flags.has('--all') ? '' : `\n    roster: ${JSON.stringify(keys)},`}
  });`);
