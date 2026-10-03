import { floorDepth } from './box';
import type { Character, Env, Frame } from './character';
import { floorAt } from './props';
import { RUG_R, Sheet } from './rug';
import type { Feel } from './puppet';
import type { Material } from 'three';
import type { Piece } from './set';

/**
 * What each set piece is and what it does (art/robot/set.py has their models). Each
 * kind has an `ambient` that runs every frame (the quiet life it always has: sway,
 * breathing, blinks, its lights) and acts, little things it does now and then. An act
 * gets the piece, its seconds so far `u`, an ease-in-and-out `e` (0..1..0) and its length;
 * it either turns bones itself (through the piece's springs) or writes named channels
 * (`p.set('open', e)`) that the ambient turns into motion, so the moment, the mouse,
 * a passing creature and the dark theme all add up on the same joints.
 *
 * Angles are degrees. tilt() tips an upright bone toward a horizontal direction (dx to the
 * viewer's right, dz toward the viewer), whichever way the bone points.
 */
const D = Math.PI / 180;
const sin = Math.sin;
const cos = Math.cos;

export interface ActDef {
  weight: number;
  length: [number, number];
  pose: (p: Piece, u: number, e: number, len: number) => void;
  start?: (p: Piece) => void;
}

export interface Kind {
  /** Height and width in the model's metres (set.py), and front to back as a share of width. */
  metres: number;
  width: number;
  deep: number;
  /** Its height on the page in --bot. */
  size: number;
  /** How far back it stands (0 front lip, 1 back wall). */
  depth: [number, number];
  /** The crew walk round it. */
  blocks: boolean;
  /** Lies flat on the floor: no shadow, and the crew walk over it. */
  flat?: boolean;
  /** Its seat's height as a share of its own (the armchair). */
  seat?: number;
  /** A nook a cat may sleep in (the bookcases): its middle across, as a share of the piece's
   * width from its middle (- to the left), its cushion's top, a share of its height, and the
   * room in it (clear across, a share of its width; clear above the cushion, of its height). */
  nook?: { x: number; seat: number; w: number; h: number };
  /** Nothing to click or hover: no hit area (the library's rug under the book's stand). */
  inert?: boolean;
  /** It plays music (notes float up from it). */
  music?: boolean;
  /** A fire burns in it (fire.ts), at its fire bone, and lights its candles (where their
   * wicks are, in metres from that bone). */
  fire?: { candles: [number, number, number][] };
  feel: (bone: string) => Feel;
  ambient: (p: Piece, t: number, dt: number) => void;
  acts: Record<string, ActDef>;
  poke?: (p: Piece) => void;
  /** Its outfit is on (a new look): the rug hooks its materials up to its sheet. */
  dressed?: (p: Piece, materials: Material[]) => void;
  /** A creature has walked past. */
  pass?: (p: Piece) => void;
}

// ---------- Helpers ----------

/** Tip an upright bone toward (dx, dz) by `deg`. */
function tilt(p: Piece, bone: string, deg: number, dx: number, dz: number) {
  p.puppet.add(bone, deg * dz, 0, -deg * dx);
}

/** Toward the viewer's right / the viewer for a Blender azimuth (degrees) on the floor. */
const out = (az: number): [number, number] => [cos(az * D), -sin(az * D)];
const around = (az: number): [number, number] => [-sin(az * D), -cos(az * D)];

/** Fold a petal (in the head's plane, at angle phi) toward the front. */
function fold(p: Piece, bone: string, deg: number, phi: number) {
  p.puppet.add(bone, deg * sin(phi), -deg * cos(phi), 0);
}

const bell = (u: number, len: number) => sin(Math.PI * Math.min(Math.max(u / len, 0), 1));
const ramp = (u: number, a: number, b: number) => {
  const x = Math.min(Math.max((u - a) / (b - a), 0), 1);
  return x * x * (3 - 2 * x);
};
/** A hump 0..1..0 over [a, b]. */
const hump = (u: number, a: number, b: number) =>
  sin(Math.PI * Math.min(Math.max((u - a) / (b - a), 0), 1));

/** What the crew on stage look like, as a sum over them: cheerful, sleepy, startled. */
function crewMood(p: Piece) {
  let glad = 0;
  let low = 0;
  let jolt = 0;
  for (const c of p.peers) {
    if (c.free || c.state !== 'here') continue;
    const x = c.face?.expression ?? c.expression;
    if (x === 'happy' || x === 'love' || x === 'wink') glad++;
    else if (x === 'sad' || x === 'sleepy' || x === 'asleep') low++;
    else if (x === 'surprised' || x === 'dizzy' || x === 'cross') jolt++;
  }
  return { glad: Math.min(glad, 2) / 2, low: Math.min(low, 2) / 2, jolt: Math.min(jolt, 2) / 2 };
}

const feel = (f: number, zeta: number): Feel => ({ f, zeta });

// ---------- Fern ----------

const FERN_AZ = [0, 58, 118, 180, 238, 300];
const FERN_W = [0.35, 0.55, 0.85, 1.25];
const FERN_LET = 'abcd';

/** All of one frond's bones, with the same radial/tangential turn scaled along it. */
function frond(p: Piece, k: number, radial: number, tangent = 0, tipHeavy = 1) {
  const [ox, oz] = out(FERN_AZ[k]);
  const [tx, tz] = around(FERN_AZ[k]);
  for (let c = 0; c < 4; c++) {
    const w = FERN_W[c] * (c === 3 ? tipHeavy : 1);
    const name = `f${k}${FERN_LET[c]}`;
    if (radial) tilt(p, name, radial * w, ox, oz);
    if (tangent) tilt(p, name, tangent * w, tx, tz);
  }
}

const fern: Kind = {
  metres: 0.85,
  width: 0.75,
  deep: 1,
  size: 1.1,
  depth: [0.72, 0.95],
  blocks: true,
  feel: (b) => (/^f\d/.test(b) ? feel(2.4, 0.3) : feel(3, 0.5)),
  ambient(p, t) {
    const shake = p.stir * 1.2 + p.excite * 1.6 + p.c('shiver');
    for (let k = 0; k < 6; k++) {
      const ph = k * 1.3 + p.seed;
      // Slowly curling and uncurling, each in its own time; asleep, they droop.
      const open = 0.45 * sin(t * 0.13 + k * 1.9 + p.seed) + p.c('open') + p.hover * 0.5;
      const droop = p.night * 0.9 + p.c('droop');
      const buzz = shake * sin(t * 26 + k * 2.1);
      const [gx, gz] = [p.gx, 0.2 + p.gy * 0.4];
      frond(
        p,
        k,
        2.4 * sin(t * 0.6 + ph) + open * 9 + droop * 11 - p.c('lift') * 7 + buzz * 3,
        1.6 * sin(t * 0.8 + ph * 1.7) + buzz * 2,
        1.6,
      );
      // Reaching toward what it watches.
      const reach = p.c('reach') + p.hover * 0.5;
      if (reach)
        for (let c = 0; c < 4; c++) tilt(p, `f${k}${FERN_LET[c]}`, reach * 5 * FERN_W[c], gx, gz);
      const bow = p.c('bow');
      if (bow)
        for (let c = 0; c < 4; c++) tilt(p, `f${k}${FERN_LET[c]}`, bow * 8 * FERN_W[c], 0, 1);
      const swirl = p.c('swirl');
      if (swirl) {
        const a = t * 7 + k * 1.05;
        for (let c = 0; c < 4; c++)
          tilt(p, `f${k}${FERN_LET[c]}`, swirl * 9 * FERN_W[c], cos(a), sin(a));
      }
    }
    // Little lit buds at the fiddleheads.
    const chase = p.c('chase');
    for (let i = 0; i < 3; i++) {
      const base =
        (0.42 + 0.22 * sin(t * 1.1 + i * 2.1 + p.seed)) * (1 - p.night * 0.7 - p.c('dim') * 0.6);
      const extra = chase ? Math.max(0, 1 - Math.abs(((chase - i + 4.5) % 3) - 1.5) * 1.3) : 0;
      p.glow(
        i,
        base + p.c('flash') * 0.8 + extra + p.hover * 0.25 + p.excite * 0.5,
        p.rainbow ? `hsl(${(i * 110 + t * 40) % 360},85%,62%)` : undefined,
      );
    }
    p.glow(3, (0.5 + 0.35 * sin(t * 1.6)) * (1 - p.night * 0.8));
  },
  acts: {
    unfurl: {
      weight: 3,
      length: [5, 8],
      pose: (p, u, e) => p.set('open', e * 1.1 + 0.15 * sin(u * 1.5)),
    },
    shiver: { weight: 2, length: [1.4, 2.4], pose: (p, u, e) => p.set('shiver', e) },
    reach: {
      weight: 2.5,
      length: [3, 5],
      pose: (p, u, e) => (p.set('reach', e), p.set('lift', e * 0.3)),
    },
    wave: {
      weight: 2,
      length: [2.5, 4],
      start: (p) => (p.arg = Math.floor(Math.random() * 6)),
      pose: (p, u, e) => frond(p, p.arg, 5 * e, 24 * e * sin(u * 9)),
    },
    ripple: {
      weight: 2,
      length: [3, 4.5],
      pose: (p, u, e) => {
        for (let k = 0; k < 6; k++)
          frond(p, k, 5 * e * sin(u * 5 - k * 1.0), 6 * e * sin(u * 5 - k * 1.0 + 1.2));
        p.set('chase', u * 3 + 1);
      },
    },
    bloom: {
      weight: 1.5,
      length: [3, 4],
      pose: (p, u, e) => {
        p.set('open', e * 1.4);
        p.set('flash', Math.max(0, sin(u * 5)) * e);
        p.hopTo = 0.05 * e;
      },
    },
    sneeze: {
      weight: 1.2,
      length: [1.8, 2.2],
      pose: (p, u) => {
        p.set('lift', ramp(u, 0, 0.5) * (1 - ramp(u, 0.5, 0.6)));
        p.set('open', 1.6 * hump(u, 0.5, 1.4));
        p.set('flash', hump(u, 0.5, 1.3));
        if (u > 0.5 && u < 0.55) p.squash.kick(6);
      },
    },
    dance: {
      weight: 1.5,
      length: [4, 6],
      pose: (p, u, e) => {
        for (let k = 0; k < 6; k++)
          frond(p, k, 8 * e * sin(u * 5 + k * Math.PI), 4 * e * sin(u * 2.5 + k));
        p.hopTo = 0.1 * e * Math.abs(sin(u * 5));
        p.set('chase', u * 4 + 1);
      },
    },
    nap: {
      weight: 1.2,
      length: [6, 9],
      pose: (p, u, e) => (p.set('droop', e * 0.9), p.set('dim', e)),
    },
    count: { weight: 1.5, length: [3, 4], pose: (p, u, e) => p.set('chase', ((u * 3) % 3) + 1.5) },
    bow: {
      weight: 1.5,
      length: [2, 3],
      pose: (p, u, e) => (p.set('bow', bell(u, 2.4) * e), p.squash.kick(0)),
    },
    stretch: {
      weight: 1.5,
      length: [3, 5],
      pose: (p, u, e) => (p.set('lift', e * 1.2), p.set('open', -e * 0.5)),
    },
    dizzy: { weight: 0, length: [3, 4], pose: (p, u, e) => p.set('swirl', e) },
    startled: {
      weight: 0,
      length: [1.2, 1.6],
      pose: (p, u, e) => (
        p.set('shiver', e),
        p.set('lift', hump(u, 0, 0.7)),
        p.set('flash', hump(u, 0, 0.7))
      ),
    },
  },
  pass: (p) => p.puppet.kick('f0d', 200, 0, 0),
};

// ---------- Sunflower ----------

const sunflower: Kind = {
  metres: 1.52,
  width: 0.5,
  deep: 0.6,
  size: 2,
  depth: [0.78, 0.95],
  blocks: true,
  feel: (b) =>
    /^petal/.test(b) ? feel(3.2, 0.5) : /^(s\d)$/.test(b) ? feel(1.8, 0.35) : feel(2.6, 0.45),
  ambient(p, t) {
    const n = p.night;
    // Petals fold shut at night; the act may open them wide or shut them shyly.
    for (let k = 0; k < 12; k++) {
      const ph = (k * 30 * Math.PI) / 180;
      const ripple = p.c('ripple') * Math.max(0, sin(t * 6 - k * 0.9));
      const deg =
        -6 +
        4 * sin(t * 1.1 + k * 1.3 + p.seed) -
        (p.c('wide') + p.hover * 0.6) * 24 +
        (p.c('fold') + n * 1.05) * 70 -
        ripple * 28 +
        p.stir * 4 * sin(t * 20 + k);
      fold(p, `petal${k}`, deg, ph);
    }
    // The stem sways, leans to what it watches; the head looks.
    tilt(p, 's0', 1.6 * sin(t * 0.5 + p.seed) + p.c('sway') * 7, 1, 0);
    tilt(p, 's1', 1.4 * sin(t * 0.43 + p.seed * 2) + p.gx * 4 * (1 - n) + p.c('sway') * 4, 1, 0);
    tilt(p, 's2', (n * 38 + p.c('droop') * 32 - p.c('sun') * 18) * 1.0, 0, 1);
    tilt(p, 's2', p.stir * 3 * sin(t * 9), 1, 0);
    p.puppet.add(
      'head',
      p.gy * 16 * (1 - n * 0.8) + p.c('nod') * 20,
      p.gx * 40 * (1 - n * 0.8) + p.c('shake') * 30,
      0,
    );
    p.puppet.add(
      'leafL',
      0,
      0,
      5 * sin(t * 1.4 + p.seed) + p.c('flap') * 28 + p.stir * 6 * sin(t * 22),
    );
    p.puppet.add(
      'leafR',
      0,
      0,
      -5 * sin(t * 1.2 + p.seed) - p.c('flap') * 28 - p.stir * 6 * sin(t * 21),
    );
    const spin = p.c('spin');
    if (spin) p.later(() => p.puppet.swing('head', spin * 360));
    // The light in its middle: bright by day, brighter still at night; petal tips glow at night.
    p.glow(
      0,
      (0.72 + 0.1 * sin(t * 1.7)) * (1 - p.c('dim') * 0.6) +
        n * 0.28 +
        p.c('flash') * 0.3 +
        p.hover * 0.15 +
        p.excite * 0.3,
    );
    for (let k = 0; k < 12; k++) {
      // (all the tips share Dot1, so they glow as one; the chase lifts it in waves)
    }
    p.glow(
      1,
      0.22 + n * 0.7 + p.c('ripple') * (0.4 + 0.4 * sin(t * 6)) + p.excite * 0.4,
      p.rainbow ? `hsl(${(t * 60) % 360},85%,62%)` : undefined,
    );
    p.glow(2, (0.5 + 0.4 * sin(t * 1.4)) * (1 - n * 0.7));
  },
  acts: {
    open: {
      weight: 3,
      length: [4, 6],
      pose: (p, u, e) => (p.set('wide', e), p.set('flash', e * 0.4)),
    },
    shy: {
      weight: 2,
      length: [3, 5],
      pose: (p, u, e) => (p.set('fold', e * 0.9), p.set('droop', e * 0.25), p.set('dim', e * 0.5)),
    },
    sway: { weight: 3, length: [4, 6], pose: (p, u, e) => p.set('sway', e * sin(u * 1.6)) },
    nod: { weight: 2, length: [2, 3], pose: (p, u, e) => p.set('nod', e * sin(u * 5)) },
    shake: { weight: 1.5, length: [1.6, 2.4], pose: (p, u, e) => p.set('shake', e * sin(u * 8)) },
    petals: { weight: 2, length: [3, 4], pose: (p, u, e) => p.set('ripple', e) },
    flap: { weight: 1.5, length: [2, 3], pose: (p, u, e) => p.set('flap', e * sin(u * 7)) },
    sunbathe: {
      weight: 2,
      length: [5, 8],
      pose: (p, u, e) => (p.set('sun', e), p.set('wide', e), p.set('flash', e * 0.6)),
    },
    flash: {
      weight: 1.5,
      length: [2, 3],
      pose: (p, u, e) => p.set('flash', e * Math.max(0, sin(u * 7))),
    },
    bow: {
      weight: 1.5,
      length: [2.5, 3.5],
      pose: (p, u, e) => (p.set('droop', bell(u, 3) * 0.9 * e), p.set('sway', 0)),
    },
    spin: {
      weight: 1,
      length: [2.4, 3],
      pose: (p, u, e, len) => p.set('spin', ramp(u, 0.2, len - 0.2)),
    },
    nap: {
      weight: 1.2,
      length: [6, 9],
      pose: (p, u, e) => (p.set('droop', e * 0.8), p.set('fold', e * 0.35), p.set('dim', e)),
    },
    dizzy: {
      weight: 0,
      length: [3, 4],
      pose: (p, u, e) => (
        p.set('sway', e * sin(u * 6)),
        p.set('shake', e * sin(u * 9)),
        p.set('ripple', e)
      ),
    },
    startled: {
      weight: 0,
      length: [1, 1.4],
      pose: (p, u, e) => (p.set('fold', hump(u, 0, 1) * 0.8), p.set('flash', hump(u, 0, 0.5))),
    },
  },
  pass: (p) => p.puppet.kick('head', 0, 0, 200),
};

// ---------- Floor lamp ----------

const lamp: Kind = {
  metres: 1.4,
  width: 0.42,
  deep: 0.6,
  size: 1.9,
  depth: [0.8, 0.96],
  blocks: true,
  feel: (b) => (b === 'shade' ? feel(2.2, 0.32) : b === 'neck' ? feel(2, 0.4) : feel(2.6, 0.5)),
  ambient(p, t) {
    const n = p.night;
    const toward = p.near ? Math.sign(p.near.dx) : Math.sign(p.gx);
    // Leans to look at whoever is near.
    tilt(p, 'pole', (p.c('lean') + p.stir * 3) * toward + 1.2 * sin(t * 0.5 + p.seed), 1, 0);
    tilt(
      p,
      'neck',
      p.c('lean') * 0.8 * toward + 2 * sin(t * 0.7 + p.seed) + p.c('wobble') * 8 * sin(t * 12),
      1,
      0,
    );
    tilt(p, 'neck', p.c('bow') * 20, 0, 1);
    const look = 1 - n * 0.5;
    p.puppet.add(
      'shade',
      p.gy * 14 * look + p.c('pitch') + n * 22,
      p.gx * 32 * look + p.c('yaw') + p.c('spin') * 40,
      0,
    );
    const up = p.c('up') + p.hover * 0.3;
    p.eyes(0.012, p.c('squint'), p.c('wide') + p.hover * 0.6 + p.excite * 0.5);
    p.later(() => p.puppet.shift('mast', 0, p.c('stretch') * 0.15 + up * 0.03, 0));
    // The bulb: a warm breath by day, all the way up at night, a flicker on request.
    const flick = p.c('flicker') ? (sin(t * 40) * sin(t * 23) > 0.2 ? 0.2 : 1) : 1;
    p.glow(
      1,
      ((0.6 + 0.12 * sin(t * 1.3)) * flick +
        n * 0.4 +
        p.c('bright') +
        p.excite * 0.6 +
        p.hover * 0.2) *
        (1 - p.c('dim') * 0.7),
    );
    p.glow(0, (0.9 - n * 0.2 - p.c('dim') * 0.4) * (1 - p.blink * 0.0));
    p.glow(2, 0.4 + 0.35 * sin(t * 1.9));
  },
  acts: {
    peer: {
      weight: 3,
      length: [4, 6],
      pose: (p, u, e) => {
        p.puppet.add('shade', 6 * e * sin(u * 0.9), 30 * e * sin(u * 1.4), 0);
        tilt(p, 'neck', 8 * e * sin(u * 1.4 + 1), 1, 0);
        p.eyes(0.014, 0, 0, sin(u * 1.4) * e, 0);
      },
    },
    lean: {
      weight: 3,
      length: [3, 5],
      pose: (p, u, e) => (p.set('lean', e * 12), p.set('wide', e * 0.6), p.set('pitch', e * 8)),
    },
    stretch: {
      weight: 2,
      length: [3, 4],
      pose: (p, u, e) => (
        p.set('stretch', e),
        p.set('pitch', -e * 12),
        p.set('wide', e),
        p.set('up', e)
      ),
    },
    nodOff: {
      weight: 1.5,
      length: [6, 9],
      pose: (p, u, e) => (
        p.set('pitch', e * (30 + 6 * sin(u * 0.9))),
        p.set('squint', e * 0.9),
        p.set('dim', e),
        p.set('bow', e * 0.3)
      ),
    },
    doze: {
      weight: 1.5,
      length: [7, 10],
      pose: (p, u, e) => {
        // Nods forward, jerks upright, blinks awake, and drops off again.
        const cycle = (u % 2.6) / 2.6;
        const sag = cycle < 0.8 ? ramp(cycle, 0, 0.8) : 1 - ramp(cycle, 0.8, 0.9);
        p.set('pitch', e * (10 + 22 * sag));
        p.set('squint', e * (cycle < 0.85 ? 0.7 + 0.3 * sag : 0));
        p.set('dim', e * (0.3 + 0.5 * sag));
        p.set('bow', e * 0.3 * sag);
        if (cycle > 0.85 && cycle < 0.93) p.set('wide', e);
      },
    },
    bob: {
      weight: 2,
      length: [4, 6],
      pose: (p, u, e) => {
        p.set('lean', e * 5 * sin(u * 5));
        p.set('pitch', e * 7 * sin(u * 10));
        p.hopTo = 0.05 * e * Math.abs(sin(u * 5));
        p.set('bright', e * 0.25 * (sin(u * 10) > 0 ? 1 : 0));
      },
    },
    blinkBlink: {
      weight: 2,
      length: [1.6, 2.4],
      pose: (p, u, e) => p.set('squint', e * (sin(u * 16) > 0.2 ? 1 : 0)),
    },
    brighten: {
      weight: 1.5,
      length: [2, 3],
      pose: (p, u, e) => (p.set('bright', e * 0.6), p.set('wide', e), p.set('up', e)),
    },
    shy: {
      weight: 1.5,
      length: [3, 4],
      pose: (p, u, e) => (
        p.set('pitch', e * 26),
        p.set('bow', e * 0.6),
        p.set('squint', e * 0.5),
        p.set('dim', e * 0.4)
      ),
    },
    lookUp: {
      weight: 2,
      length: [3, 5],
      pose: (p, u, e) => (p.set('pitch', -e * 24), p.set('up', e), p.puppet.add('shade', 0, 0, 0)),
    },
    flicker: {
      weight: 1.5,
      length: [1.5, 2.5],
      pose: (p, u, e) => (e > 0.3 ? p.set('flicker', 1) : 0, p.set('wobble', e * 0.3)),
    },
    tipHat: {
      weight: 1.5,
      length: [2, 3],
      pose: (p, u, e) => {
        p.set('pitch', -hump(u, 0.3, 1.6) * 34);
        p.later(() => p.puppet.shift('shade', 0, hump(u, 0.3, 1.6) * 0.05, 0));
        p.set('wide', hump(u, 0.5, 1.5));
      },
    },
    wobble: { weight: 1, length: [1.5, 2.4], pose: (p, u, e) => p.set('wobble', e) },
    dizzy: {
      weight: 0,
      length: [3, 4],
      pose: (p, u, e) => {
        p.set('wobble', e);
        p.set('spin', e * sin(u * 6));
        p.eyes(0.014, 0, 0, cos(u * 9) * e, sin(u * 9) * e);
      },
    },
    startled: {
      weight: 0,
      length: [1, 1.4],
      pose: (p, u, e) => (
        p.set('bright', hump(u, 0, 0.9)),
        p.set('wide', hump(u, 0, 0.9)),
        p.set('up', hump(u, 0, 0.5))
      ),
    },
  },
  poke: (p) => p.puppet.kick('shade', -200, 0, 0),
  pass: (p) => p.set('wide', 0),
};

// ---------- Armchair ----------

const LEGS = ['legFL', 'legFR', 'legBL', 'legBR'];

const armchair: Kind = {
  metres: 0.85,
  width: 0.72,
  deep: 0.85,
  size: 1.15,
  depth: [0.74, 0.92],
  blocks: true,
  seat: 0.44,
  feel: (b) => (b === 'back' ? feel(2.2, 0.4) : /^arm/.test(b) ? feel(3, 0.4) : feel(3, 0.5)),
  ambient(p, t) {
    const n = p.night;
    const sat = p.sitters.size ? 1 : 0;
    // The seat cushion breathes (slower asleep), sinks under whoever sits.
    const breath = 0.03 * sin(t * (1.6 - n * 0.8)) + 0.02 * p.c('breathe');
    const sink = sat * 0.18 + p.c('sink') * 0.2 + p.excite * sat * 0.08;
    p.later(() => {
      p.puppet.stretch(
        'seat',
        1 + breath - sink + p.c('puff') * 0.08,
        [0, 1, 0],
        1 + sink * 0.25 - breath * 0.3,
      );
      p.puppet.stretch('back', 1 + p.c('puff') * 0.06, [0, 1, 0], 1);
    });
    // The back leans back to yawn, forward a little under a sitter.
    tilt(p, 'back', -(p.c('lean') * 16 + n * 6 + p.hover * 2) + sat * 3 + 1 * sin(t * 0.6), 0, 1);
    p.puppet.add(
      'back',
      0,
      p.c('turn') * 12,
      1.2 * sin(t * 0.5 + p.seed) + p.c('wig') * 3 * sin(t * 17),
    );
    // Arms: stretch out and up, or hug in.
    const open = p.c('arms') + p.hover * 0.25;
    p.puppet.add('armL', 0, 0, -open * 26 + p.c('hug') * 20 + 1.5 * sin(t * 0.9));
    p.puppet.add('armR', 0, 0, open * 26 - p.c('hug') * 20 - 1.5 * sin(t * 0.9 + 1));
    // Legs: shuffle in steps.
    const step = p.c('step');
    if (step) {
      LEGS.forEach((leg, i) => {
        const lift = Math.max(0, sin(t * 9 + (i === 0 || i === 3 ? 0 : Math.PI))) * step;
        p.later(() => p.puppet.shift(leg, 0, lift * 0.035, 0));
      });
    }
    const kick = p.c('kick');
    if (kick)
      LEGS.forEach((leg, i) =>
        p.later(() => p.puppet.shift(leg, 0, Math.max(0, sin(t * 12 + i * 1.6)) * kick * 0.03, 0)),
      );
    p.eyes(0.014, p.c('shut'), p.c('wide') + p.excite * 0.4, p.gx, p.gy);
    p.glow(0, 0.85 - n * 0.3 - p.c('dim') * 0.4);
    p.glow(1, 0.35 + 0.3 * sin(t * 1.5) + p.c('flash') * 0.5, undefined);
    p.squash.kick(0);
    if (p.c('scoot')) p.later(() => 0);
  },
  acts: {
    stretchArms: {
      weight: 3,
      length: [3, 5],
      pose: (p, u, e) => (p.set('arms', e), p.set('lean', e * 0.3), p.set('breathe', e)),
    },
    yawn: {
      weight: 2,
      length: [4, 6],
      pose: (p, u, e) => (
        p.set('lean', e),
        p.set('puff', e * 0.8),
        p.set('arms', e * 0.5),
        p.set('shut', e * 0.9),
        p.set('breathe', e * 2)
      ),
    },
    wriggle: {
      weight: 2.5,
      length: [2, 3],
      pose: (p, u, e) => {
        p.set('wig', e);
        p.set('kick', e * 0.6);
        p.leanTo = 2.5 * e * sin(u * 11);
      },
    },
    scoot: {
      weight: 1.8,
      length: [2.5, 3.5],
      start: (p) => (p.arg = p.arg < 0.5 ? -1 : 1),
      pose: (p, u, e) => {
        p.set('step', e);
        p.slideTo = (p.arg < 0.5 ? -1 : 1) * 24 * ramp(u, 0.3, 2.2);
        p.leanTo = 2.5 * e * sin(u * 9);
        p.hopTo = 0.02 * e * Math.abs(sin(u * 9));
      },
    },
    breatheDeep: {
      weight: 2.5,
      length: [5, 7],
      pose: (p, u, e) => {
        const b = Math.max(0, sin(u * 1.5)) ** 1.4;
        p.set('puff', e * b * 1.2);
        p.set('breathe', e * b * 2);
        p.set('arms', e * b * 0.2);
      },
    },
    sigh: {
      weight: 1.8,
      length: [3, 4],
      pose: (p, u, e) => {
        p.set('puff', hump(u, 0, 1.2) * 1.2);
        p.set('sink', ramp(u, 1.1, 2) * 0.6 * (1 - ramp(u, 2.6, 3.4)));
        p.set('hug', e * 0.2);
        p.set('shut', e * 0.5);
      },
    },
    settle: {
      weight: 2,
      length: [1.6, 2.2],
      pose: (p, u) => (p.set('sink', hump(u, 0, 1.2)), p.set('puff', ramp(u, 0.9, 1.4))),
    },
    lookAround: {
      weight: 3,
      length: [4, 6],
      pose: (p, u, e) => {
        p.set('turn', e * sin(u * 1.5));
        p.set('wide', e * 0.6);
        p.eyes(0.016, 0, 0, sin(u * 1.5 + 0.7) * e, 0);
      },
    },
    doze: {
      weight: 1.5,
      length: [6, 9],
      pose: (p, u, e) => (
        p.set('shut', e),
        p.set('lean', e * 0.4),
        p.set('breathe', e * 2),
        p.set('dim', e)
      ),
    },
    hug: {
      weight: 1.5,
      length: [2.5, 3.5],
      pose: (p, u, e) => (
        p.set('hug', e * (1 + 0.2 * sin(u * 6))),
        p.set('puff', e * 0.5),
        p.set('flash', e)
      ),
    },
    fluff: {
      weight: 2,
      length: [1.8, 2.4],
      pose: (p, u, e) => (p.set('puff', hump(u, 0, 1.6)), (p.hopTo = 0.04 * hump(u, 0.2, 0.8))),
    },
    kickLegs: {
      weight: 1.5,
      length: [2, 3],
      pose: (p, u, e) => (p.set('kick', e), (p.leanTo = 2 * e * sin(u * 6))),
    },
    bounce: {
      weight: 1.5,
      length: [2, 3],
      pose: (p, u, e) => {
        p.hopTo = 0.14 * e * Math.abs(sin(u * 4.5));
        p.set('puff', e * 0.5 * Math.abs(sin(u * 4.5)));
        p.set('arms', e * 0.3);
      },
    },
    tilt: {
      weight: 1.5,
      length: [2.5, 3.5],
      pose: (p, u, e) => ((p.leanTo = 5 * e * sin(u * 1.8)), p.set('wide', e * 0.5)),
    },
    dizzy: {
      weight: 0,
      length: [3, 4],
      pose: (p, u, e) => {
        p.set('wig', e);
        p.set('kick', e);
        p.set('turn', e * sin(u * 8));
        p.leanTo = 4 * e * sin(u * 8);
        p.eyes(0.016, 0, 0, cos(u * 9) * e, sin(u * 9) * e);
      },
    },
    startled: {
      weight: 0,
      length: [1, 1.4],
      pose: (p, u) => (
        p.set('puff', hump(u, 0, 0.8)),
        p.set('arms', hump(u, 0, 0.8)),
        p.set('wide', hump(u, 0, 0.8))
      ),
    },
  },
  poke: (p) => (p.hopTo = 0),
};

// ---------- Bookshelf ----------

const shelfBook = (s: number, b: number) => `book${s}${b}`;
const BOOK_BONES = [0, 1, 2].flatMap((s) => [0, 1, 2, 3, 4].map((b) => shelfBook(s, b)));

const bookshelf: Kind = {
  metres: 1.46,
  width: 0.85,
  deep: 0.35,
  size: 1.75,
  depth: [0.88, 0.97],
  blocks: true,
  feel: (b) =>
    /^book/.test(b)
      ? feel(4.2, 0.45)
      : /^end/.test(b)
        ? feel(4, 0.3)
        : b === 'beacon'
          ? feel(2, 0.3)
          : feel(3, 0.5),
  ambient(p, t) {
    const n = p.night;
    BOOK_BONES.forEach((name, i) => {
      // Each book leans a little on its own, and rattles when the shelf does.
      tilt(
        p,
        name,
        1.4 * sin(t * (0.4 + (i % 5) * 0.07) + i * 1.9) +
          p.stir * 2 * sin(t * 20 + i) +
          p.c('rattle') * 4 * sin(t * 26 + i * 1.7),
        1,
        0,
      );
    });
    const lean = p.c('lean');
    if (lean)
      for (let s = 0; s < 3; s++)
        for (let b = 0; b < 5; b++) {
          const wave = Math.max(0, sin((p.c('lt') - (s * 5 + b) * 0.16) * 3));
          tilt(p, shelfBook(s, b), lean * 20 * wave * (p.c('dir') || 1), 1, 0);
        }
    // One book pops out, and slides back.
    const pop = p.c('pop');
    if (pop) {
      const which = Math.floor(p.arg * 15);
      p.later(() => p.puppet.shift(BOOK_BONES[which], 0, pop * 0.02, pop * 0.09));
    }
    const pop2 = p.c('pop2');
    if (pop2) {
      const which = (Math.floor(p.arg * 15) + 1) % 15;
      p.later(() => p.puppet.shift(BOOK_BONES[which], 0, pop2 * 0.015, pop2 * 0.06));
      tilt(p, BOOK_BONES[which], -6 * pop2 * p.c('lookT'), 1, 0);
    }
    const shuffle = p.c('shuffle');
    if (shuffle)
      [3, 7, 11].forEach((i, j) => {
        const v = Math.max(0, sin(shuffle * 5 + j * 2.2)) ** 2;
        p.later(() => p.puppet.shift(BOOK_BONES[i], 0, 0.012 * v, 0.07 * v));
      });
    // Bookends tap.
    for (const s of [0, 2]) {
      const tap = p.c('tap') * Math.max(0, sin(p.c('tapT') * 12));
      p.puppet.add(`end${s}L`, 0, 0, -tap * 12 - p.c('bend') * 3);
      p.puppet.add(`end${s}R`, 0, 0, tap * 12 + p.c('bend') * 3);
    }
    tilt(p, 'beacon', p.c('bea') * 20 * sin(t * 9), 1, 0);
    const read = p.c('read');
    p.eyes(
      0.02,
      p.c('shut') + read * 0.5,
      p.c('wide') + p.hover * 0.5 + p.excite * 0.4,
      p.gx * (1 - read * 0.6),
      read ? 0.9 : p.gy,
    );
    p.glow(0, 0.9 - n * 0.35 - p.c('dim') * 0.4);
    p.glow(1, (0.4 + 0.5 * Math.max(0, sin(t * 1.3))) * (1 - n * 0.6) + p.c('bea') * 0.5);
    const twinkle = (i: number) => 0.3 + 0.3 * sin(t * (0.9 + i * 0.3)) + read * 0.7;
    p.glow(2, twinkle(1) * (1 - n * 0.5));
    shelfCopy(p, t);
    p.squash.kick(0);
  },
  acts: {
    dominoes: {
      weight: 3,
      length: [3, 4],
      start: (p) => (p.arg = p.arg < 0.5 ? -1 : 1),
      pose: (p, u, e) => (p.set('lean', e), p.set('lt', u), p.set('dir', p.arg < 0.5 ? -1 : 1)),
    },
    pop: {
      weight: 3,
      length: [2, 2.8],
      pose: (p, u, e) => p.set('pop', hump(u, 0.2, 2)),
    },
    shuffle: { weight: 2, length: [3, 4], pose: (p, u, e) => p.set('shuffle', u * e) },
    sneakOut: {
      weight: 2,
      length: [4, 5.5],
      pose: (p, u, e) => {
        // One book slips out, a neighbour follows a beat later, both slide back together.
        p.set('pop', hump(u, 0.3, 3.6) * 0.7);
        p.set('pop2', hump(u, 1.1, 4.2) * 0.7);
        p.set('lookT', Math.sign(p.gx || 1));
        p.set('bea', hump(u, 1.4, 2.2) * 0.6);
        p.set('read', e * 0.3);
      },
    },
    titles: {
      weight: 1.5,
      length: [3, 4.5],
      pose: (p, u, e) => (p.set('read', e), p.set('bea', 0), p.set('wide', e * 0.4)),
    },
    bookends: {
      weight: 2.5,
      length: [2.5, 3.5],
      pose: (p, u, e) => (p.set('tap', e), p.set('tapT', u), p.set('bend', e)),
    },
    hop: {
      weight: 1.5,
      length: [2, 3],
      pose: (p, u, e) => (
        (p.hopTo = 0.12 * e * Math.abs(sin(u * 4.5))),
        p.set('rattle', e * Math.abs(sin(u * 4.5)) + 0.1)
      ),
    },
    read: { weight: 2, length: [5, 8], pose: (p, u, e) => (p.set('read', e), p.set('bea', 0)) },
    peekaboo: {
      weight: 2.5,
      length: [3, 4],
      pose: (p, u, e) => {
        const i = Math.floor(p.arg * 15);
        p.set('pop', e * hump(u, 0, 3.4) * 0.8);
        p.set('wide', e);
        tilt(p, BOOK_BONES[i], 8 * e * p.gx, 1, 0);
      },
    },
    yawn: {
      weight: 1.5,
      length: [3.5, 5],
      pose: (p, u, e) => ((p.leanTo = -3 * e), p.set('shut', e * 0.9), p.set('lean', 0)),
    },
    rock: {
      weight: 1.8,
      length: [3, 4],
      pose: (p, u, e) => ((p.leanTo = 3 * e * sin(u * 3)), p.set('rattle', e * 0.6)),
    },
    beacon: {
      weight: 1.5,
      length: [2, 3],
      pose: (p, u, e) => p.set('bea', e * Math.max(0, sin(u * 8)) + e * 0.4),
    },
    nap: { weight: 1.2, length: [6, 9], pose: (p, u, e) => (p.set('shut', e), p.set('dim', e)) },
    shelve: {
      weight: 1.5,
      length: [3, 4],
      pose: (p, u, e) => (
        p.set('lean', e),
        p.set('lt', u * 1.6),
        p.set('dir', 1),
        p.set('tap', e * 0.4),
        p.set('tapT', u)
      ),
    },
    dizzy: {
      weight: 0,
      length: [3, 4],
      pose: (p, u, e) => {
        p.set('rattle', e * 2);
        p.set('shuffle', u * e);
        p.leanTo = 2 * e * sin(u * 9);
        p.eyes(0.02, 0, 0, cos(u * 9) * e, sin(u * 9) * e);
      },
    },
    startled: {
      weight: 0,
      length: [1, 1.4],
      pose: (p, u, e) => (
        p.set('rattle', hump(u, 0, 1)),
        p.set('wide', hump(u, 0, 1)),
        (p.hopTo = 0.06 * hump(u, 0, 0.5))
      ),
    },
  },
  poke: (p) => {
    p.squash.kick(4);
  },
};

// ---------- Rug ----------

/** Each rug's sheet (rug.ts): the surface it moves as, water with a little paper in it. */
const sheets = new WeakMap<Piece, Sheet>();
function sheetOf(p: Piece) {
  let sheet = sheets.get(p);
  if (!sheet) {
    sheets.set(p, (sheet = new Sheet()));
    p.model.userData.sheet = sheet;
  }
  return sheet;
}
const seenStep = new WeakMap<Piece, Map<object, number>>();
const lastPointer = new WeakMap<Piece, { x: number; z: number }>();

const rug: Kind = {
  metres: 0.03,
  width: 1.4,
  deep: 1,
  size: 0.07,
  depth: [0.55, 0.78],
  blocks: false,
  flat: true,
  feel: () => feel(4, 0.6),
  dressed: (p, materials) => sheetOf(p).wear(p.model, materials),
  ambient(p, t, dt) {
    // The acts lay their shapes over the sheet (m, from its middle); what walks on it, the
    // mouse and the clicks move the sheet itself (rugStep, and the drops below).
    const sheet = sheetOf(p);
    const { x: X, z: Z, lift, pull } = sheet;
    const c = p.c('curl');
    const cd = p.arg * 6.283;
    const cx = Math.cos(cd);
    const cz = Math.sin(cd);
    sheet.uniforms.rugCurl.value = [cx, cz];
    const wave = p.c('wave');
    const hump_ = p.c('hump');
    const hx = p.c('hx') * RUG_R;
    const hz = p.c('hz') * RUG_R;
    const wt = p.c('wt');
    const flap = p.c('flap');
    const cup = p.c('cup');
    const breathe = p.c('breathe');
    const bump = p.c('bump');
    const swirl = p.c('swirl');
    for (let i = 0; i < sheet.count; i++) {
      const x = X[i];
      const z = Z[i];
      // Patterns are laid out by where a point is on the rug (u, v: 0 to 4 across it).
      const u = (x + RUG_R) / 0.31;
      const v = (RUG_R - z) / 0.31;
      const rr = Math.min(Math.hypot(x, z) / RUG_R, 1);
      // A slow swell that never quite stops, like a pond on a still day.
      let h =
        (0.004 * sin(t * 0.9 + u * 0.9 + v * 1.3 + p.seed) +
          0.003 * sin(t * 0.6 - u * 1.4 + v * 0.5 + p.seed * 2)) *
        (1 + p.hover);
      if (flap) h += flap * 0.03 * sin(t * 15 + u * 2.4 + v * 3.1);
      if (wave) h += wave * 0.07 * sin(((x * cx + z * cz) / RUG_R) * 3.5 - wt * 5);
      if (hump_) h += hump_ * 0.08 * Math.exp(-((x - hx) ** 2 + (z - hz) ** 2) / 0.02);
      if (cup) h += cup * 0.14 * rr * rr;
      if (breathe) h += breathe * 0.04 * (1 - rr * rr * 0.5);
      if (bump) h += bump * 0.03 * -Math.cos((u + v) * Math.PI) * sin(t * 9);
      if (swirl) h += swirl * 0.06 * sin(Math.atan2(z, x) * 2 - t * 8) * rr;
      // One edge curls up and over.
      if (c) {
        const s = Math.max(0, (x * cx + z * cz) / RUG_R - 0.25);
        h += c * 0.45 * s * s;
        pull[i] = -c * 0.25 * s * s;
      }
      lift[i] = h;
    }
    // Whatever is running about under it lifts the sheet as it goes, and leaves a wake.
    if (hump_) sheet.press(hx, hz, -hump_ * 5, 0.09);
    sheet.update(dt);
    // Its lights chase round it, its medallion beats.
    const chase = p.c('chase');
    p.glow(0, 0.4 + 0.25 * sin(t * 1.4) + (chase ? 0.4 + 0.4 * sin(t * 10) : 0) + p.excite * 0.5);
    p.glow(
      1,
      0.55 + 0.3 * sin(t * 1.1 + 1) + p.c('flash') * 0.5,
      p.rainbow && chase ? `hsl(${(t * 90) % 360},85%,62%)` : undefined,
    );
  },
  acts: {
    wave: {
      weight: 3,
      length: [3, 4.5],
      start: (p) => (p.arg = Math.random()),
      pose: (p, u, e) => (p.set('wave', e), p.set('wt', u)),
    },
    curl: {
      weight: 2.5,
      length: [5, 7],
      start: (p) => (p.arg = Math.random()),
      pose: (p, u, e) => p.set('curl', e * (0.85 + 0.1 * sin(u * 2))),
    },
    breathe: {
      weight: 2.5,
      length: [4, 6],
      pose: (p, u, e) => p.set('breathe', e * (0.6 + 0.4 * sin(u * 2.2))),
    },
    flap: {
      weight: 1.5,
      length: [1.6, 2.6],
      pose: (p, u, e) => (p.set('flap', e), p.set('flash', e)),
    },
    pulse: {
      weight: 2.5,
      length: [3, 4.5],
      pose: (p, u) => {
        // A heartbeat in the middle: a ring runs out with each beat.
        if (Math.floor(u * 1.4) !== Math.floor((u - 0.05) * 1.4)) sheetOf(p).drop(0, 0, -0.6, 0.09);
        p.set('chase', 1);
        p.set('flash', Math.max(0, sin(u * 8.8)) * 0.6);
      },
    },
    checker: { weight: 1.5, length: [2.5, 3.5], pose: (p, u, e) => p.set('bump', e) },
    scurry: {
      weight: 2.5,
      length: [3.5, 5],
      pose: (p, u, e, len) => {
        // Something small is running about under it.
        const a = u * 1.6;
        p.set('hump', ramp(u, 0, 0.5) * (1 - ramp(u, len - 0.6, len)));
        p.set('hx', 0.6 * sin(a * 1.3));
        p.set('hz', 0.5 * cos(a * 0.9 + 1));
      },
    },
    cup: {
      weight: 1.5,
      length: [3, 4],
      pose: (p, u, e) => p.set('cup', e * (0.8 + 0.2 * sin(u * 3))),
    },
    spin: {
      weight: 1.5,
      length: [3, 4],
      pose: (p, u, e) => (p.set('swirl', e), p.set('chase', 1)),
    },
    flutter: {
      weight: 1.5,
      length: [2.5, 3.5],
      start: (p) => (p.arg = Math.random()),
      pose: (p, u, e) => (
        p.set('curl', e * 0.35 * (1 + sin(u * 11) * 0.3)),
        p.set('flash', e * 0.3)
      ),
    },
    rain: {
      weight: 1.5,
      length: [3, 5],
      // Drops falling on it here and there, like the first of a shower on a pond.
      pose: (p, u, e) => {
        if (Math.random() < e * 0.12) {
          const a = Math.random() * 6.283;
          const r = Math.sqrt(Math.random()) * RUG_R * 0.9;
          sheetOf(p).drop(r * Math.cos(a), r * Math.sin(a), 0.25 + Math.random() * 0.25, 0.04);
        }
        p.set('flash', e * 0.2);
      },
    },
    dizzy: {
      weight: 0,
      length: [3, 4],
      pose: (p, u, e) => (p.set('swirl', e * 1.5), p.set('flap', e * 0.4), p.set('chase', 1)),
    },
    startled: {
      weight: 0,
      length: [1, 1.2],
      pose: (p, u) => (
        u < 0.02 ? sheetOf(p).drop(0, 0, -1.2, 0.1) : 0,
        p.set('flash', hump(u, 0, 1))
      ),
    },
  },
  // A click and it jumps up in the middle, and a ring runs out to the edge and back.
  poke: (p) => sheetOf(p).drop(0, 0, -1.3, 0.12),
};

/**
 * Called by the set each frame for the rug: whoever stands on it presses it down, their
 * steps knock rings out of it, and the mouse drawn across it leaves a wake.
 */
export function rugStep(p: Piece, env: Env) {
  const f = env.frame;
  const sheet = sheetOf(p);
  const mine = p.floorPoint(f);
  const perM = (rug.size * f.bot) / rug.metres; // px per metre on the floor, at the front
  let seen = seenStep.get(p);
  if (!seen) seenStep.set(p, (seen = new Map()));
  for (const c of env.crew) {
    if (c.state !== 'here' || c.edge !== 'bottom' || c.free) continue;
    const q = c.floorPoint(f);
    const x = (q.x - mine.x) / perM;
    const z = (mine.z - q.z) / perM;
    if (Math.hypot(x, z) > RUG_R * 1.05) continue;
    const weight = Math.min(Math.max(c.heightPx / (f.bot * 1.2), 0.5), 1.6);
    sheet.press(x, z, 5 * weight);
    const last = seen.get(c) ?? -9;
    if (c.stride > f.bot * 0.4 && p.t - last > 0.3) {
      seen.set(c, p.t);
      sheet.drop(x, z, 0.5 * weight * (0.8 + c.stride / (f.bot * 3)), 0.05);
    }
  }
  const at = env.pointer;
  const spot = p.hovered && at.present ? floorAt(f, at.x, at.y) : null;
  if (!spot) return void lastPointer.delete(p);
  const x = (spot.s - mine.x) / perM;
  const z = (mine.z - spot.depth * floorDepth(f)) / perM;
  const was = lastPointer.get(p);
  lastPointer.set(p, { x, z });
  const moved = was ? Math.hypot(x - was.x, z - was.z) : 0;
  if (moved > 0.003 && Math.hypot(x, z) < RUG_R) sheet.drop(x, z, Math.min(moved * 8, 0.35), 0.045);
}

// ---------- Stool ----------

const stool: Kind = {
  metres: 0.55,
  width: 0.62,
  deep: 1,
  size: 0.75,
  depth: [0.7, 0.9],
  blocks: true,
  feel: (b) => (b === 'seat' ? feel(3, 0.4) : /^eye/.test(b) ? feel(4, 0.6) : feel(3.2, 0.4)),
  ambient(p, t) {
    const n = p.night;
    const crouch = p.c('crouch') + n * 0.6 + p.stir * 0.15;
    const tall = p.c('tall');
    const walk = p.c('walk');
    const dir = p.c('dir') || 1;
    for (let k = 0; k < 3; k++) {
      const az = -90 + 120 * k;
      const [ox, oz] = out(az);
      const [tx, tz] = around(az);
      const ph = t * 9 + k * 2.09;
      const lift = Math.max(0, sin(ph));
      // A stride: the hip swings toward the way it goes, and the foot lifts.
      tilt(p, `leg${k}a`, crouch * 16 - tall * 8 + walk * 9 * cos(ph) * dir * 0.7, ox, oz);
      tilt(p, `leg${k}b`, -crouch * 22 + tall * 8, ox, oz);
      tilt(p, `leg${k}a`, walk * 12 * cos(ph) * dir, 1, 0);
      tilt(p, `leg${k}a`, p.c('wob') * 8 * sin(t * 10 + k * 2), tx, tz);
      const one = p.c('one') * (k === Math.floor(p.arg * 3) ? 1 : 0);
      const kicking = p.c('kick') * (k === Math.floor(p.arg * 3) ? Math.max(0, sin(t * 9)) : 0);
      const up = walk * lift * 0.06 + one * 0.08 + kicking * 0.05;
      p.later(() => p.puppet.shift(`leg${k}a`, 0, up, 0));
      if (one || kicking) tilt(p, `leg${k}b`, (one * 30 + kicking * 40) * -1, ox, oz);
    }
    // The seat spins to look, and lowers as it crouches.
    p.puppet.add('seat', 0, p.gx * 40 * (1 - n * 0.8) + p.c('turn') * 40, 0);
    p.later(() => {
      p.puppet.shift('seat', 0, -crouch * 0.07 + tall * 0.04, 0);
      const spin = p.c('spin');
      if (spin) p.puppet.swing('seat', spin * 720);
    });
    p.eyes(0.008, p.c('shut'), p.c('wide') + p.excite * 0.4, p.gx * 0.5, p.gy);
    tilt(p, 'seat', p.c('tip') * 10, 0, 1);
    p.glow(0, 0.85 - p.c('dim') * 0.4);
    p.glow(
      1,
      0.35 + 0.25 * sin(t * 1.5) + n * 0.4 + p.c('flash') * 0.5 + p.excite * 0.4,
      p.rainbow ? `hsl(${(t * 50) % 360},85%,62%)` : undefined,
    );
  },
  acts: {
    trot: {
      weight: 3,
      length: [2.5, 4],
      start: (p) => (p.arg = p.arg < 0.5 ? -1 : 1),
      pose: (p, u, e, len) => {
        const dir = p.arg < 0.5 ? -1 : 1;
        p.set('walk', e);
        p.set('dir', dir * (1 - 1) + 0);
        p.set('turn', dir * 0.5 * e);
        p.slideTo = dir * 40 * ramp(u, 0.2, len - 0.2);
        p.hopTo = 0.015 * e * Math.abs(sin(u * 9));
      },
    },
    spin: {
      weight: 2.5,
      length: [2, 3],
      pose: (p, u, e, len) => (p.set('spin', ramp(u, 0.2, len - 0.2)), p.set('flash', e * 0.4)),
    },
    crouch: {
      weight: 2,
      length: [2, 3],
      pose: (p, u, e) => p.set('crouch', hump(u, 0, 2.6) * 1.2),
    },
    hop: {
      weight: 2.5,
      length: [2.2, 3],
      pose: (p, u) => {
        const c = Math.floor(u / 0.9);
        const ph = (u % 0.9) / 0.9;
        p.set('crouch', ph < 0.3 && c < 2 ? sin((ph / 0.3) * Math.PI) : 0);
        p.set('tall', ph > 0.3 && ph < 0.7 && c < 2 ? 1 : 0);
        p.hopTo = c < 2 && ph > 0.3 ? 0.35 * sin(((ph - 0.3) / 0.7) * Math.PI) : 0;
      },
    },
    stretch: {
      weight: 2,
      length: [2.5, 3.5],
      pose: (p, u, e) => (p.set('tall', e * 1.4), p.set('wide', e * 0.6)),
    },
    balance: {
      weight: 1.8,
      length: [3, 4],
      start: (p) => (p.arg = Math.random()),
      pose: (p, u, e) => (p.set('one', e), p.set('wob', e), (p.leanTo = 7 * e * sin(u * 3.2))),
    },
    look: {
      weight: 3,
      length: [4, 6],
      pose: (p, u, e) => (p.set('turn', e * sin(u * 1.5) * 1.2), p.set('wide', e * 0.5)),
    },
    rest: {
      weight: 1.5,
      length: [6, 9],
      pose: (p, u, e) => (p.set('crouch', e * 1.1), p.set('shut', e), p.set('dim', e)),
    },
    kick: {
      weight: 2,
      length: [2.5, 3.5],
      start: (p) => (p.arg = Math.random()),
      pose: (p, u, e) => p.set('kick', e),
    },
    tap: {
      weight: 2,
      length: [2, 3],
      start: (p) => (p.arg = Math.random()),
      pose: (p, u, e) => (p.set('kick', e * 0.6), p.set('flash', e * Math.max(0, sin(u * 9)))),
    },
    twirl: {
      weight: 1.5,
      length: [1.8, 2.4],
      pose: (p, u, e, len) => {
        p.set('spin', ramp(u, 0.3, len - 0.3));
        p.hopTo = 0.25 * hump(u, 0.3, len - 0.4);
        p.set('tall', hump(u, 0.3, len - 0.4));
      },
    },
    sneak: {
      weight: 1.5,
      length: [3, 4.5],
      start: (p) => (p.arg = p.arg < 0.5 ? -1 : 1),
      pose: (p, u, e, len) => {
        p.set('walk', e * 0.7);
        p.set('crouch', e * 0.9);
        p.set('dir', 1);
        p.slideTo = (p.arg < 0.5 ? -1 : 1) * 22 * ramp(u, 0.3, len - 0.3);
        p.set('wide', e * 0.5);
      },
    },
    wobble: {
      weight: 1.2,
      length: [1.6, 2.4],
      pose: (p, u, e) => (p.set('wob', e), (p.leanTo = 4 * e * sin(u * 9))),
    },
    dizzy: {
      weight: 0,
      length: [3, 4],
      pose: (p, u, e) => {
        p.set('spin', ramp(u, 0, 2.5) * 2);
        p.set('wob', e);
        p.leanTo = 6 * e * sin(u * 6);
        p.set('flash', e);
      },
    },
    startled: {
      weight: 0,
      length: [1, 1.4],
      pose: (p, u) => (
        p.set('tall', hump(u, 0, 0.8)),
        (p.hopTo = 0.2 * hump(u, 0, 0.7)),
        p.set('wide', hump(u, 0, 0.9))
      ),
    },
  },
  pass: (p) => p.puppet.kick('seat', 0, 300, 0),
};

// ---------- Radio ----------

/** Beats per minute while it plays. */
const radio: Kind = {
  metres: 0.62,
  width: 0.62,
  deep: 0.45,
  size: 0.7,
  depth: [0.75, 0.92],
  blocks: true,
  music: true,
  feel: (b) =>
    /^ant/.test(b)
      ? feel(2.4, 0.22)
      : /^dial/.test(b)
        ? feel(4, 0.5)
        : b === 'needle'
          ? feel(3, 0.5)
          : feel(4, 0.5),
  ambient(p, t, dt) {
    const n = p.night;
    // Music: on while an act plays; its lights chase and its cone pumps to the beat.
    const music = p.c('music');
    const bpm = p.c('bpm') || 112;
    const state = musicState.get(p) ?? { phase: 0, level: 0, beat: -1 };
    musicState.set(p, state);
    state.level += (music - state.level) * Math.min(1, dt * 5);
    state.phase += (dt * bpm) / 60;
    const beat = Math.floor(state.phase);
    if (beat !== state.beat) {
      state.beat = beat;
      if (state.level > 0.5) {
        p.squash.kick(2.5 * state.level);
        musicBeat(p, beat);
      }
    }
    const frac = state.phase % 1;
    const pulse = state.level * Math.exp(-frac * 4.5);
    p.later(() =>
      p.puppet.stretch('cone', 1 + 0.4 * pulse + p.c('loud') * 0.1, [0, 0, 1], 1 - 0.07 * pulse),
    );
    // Antenna: droops asleep, waggles hunting a station, shivers as someone passes.
    const hunt = p.c('hunt');
    tilt(
      p,
      'ant0',
      3 * sin(t * 0.7 + p.seed) +
        hunt * 14 * sin(t * 4) +
        p.stir * 4 * sin(t * 18) +
        n * 10 +
        p.c('ear') * 12 * p.gx,
      1,
      0,
    );
    tilt(
      p,
      'ant1',
      4 * sin(t * 1.1 + p.seed) +
        hunt * 20 * sin(t * 5.5 + 1) +
        state.level * 6 * sin(t * 14) -
        p.c('ear') * 8 * p.gx,
      1,
      0,
    );
    tilt(p, 'ant0', p.c('ear') * 6 * (p.gy > 0 ? 1 : -1), 0, 1);
    // ...and it reads the crew's mood: perks up and twitches at the cheerful, droops at the
    // sleepy, springs stiff and jitters at the startled.
    const mood = crewMood(p);
    const twitch = p.c('twitch') * Math.max(0, sin(t * 21)) ** 4;
    tilt(
      p,
      'ant0',
      mood.glad * -3 + mood.low * 9 + mood.jolt * 3 * sin(t * 30) + twitch * 10,
      1,
      0,
    );
    tilt(
      p,
      'ant1',
      mood.glad * 6 * sin(t * 3.3) +
        mood.low * 14 -
        mood.jolt * 5 -
        twitch * 16 +
        p.c('sweep') * 24 * sin(t * 2.6),
      1,
      0,
    );
    tilt(p, 'ant1', p.c('sweep') * 20 * sin(t * 2.6 + 1.6), 0, 1);
    // Dials turn.
    const dial = p.c('dial');
    p.puppet.add(
      'dialA',
      0,
      0,
      dial * 220 * sin(t * 1.8) +
        state.level * 12 * sin(t * 2) +
        p.c('spinDial') * ((t * 300) % 360),
    );
    p.puppet.add('dialB', 0, 0, -dial * 160 * sin(t * 1.3 + 1) + p.c('vol') * 90);
    p.later(() =>
      p.puppet.shift(
        'needle',
        (0.05 * sin(t * 0.7 + p.seed) +
          dial * 0.05 * sin(t * 1.8) +
          state.level * 0.02 * sin(t * 3)) *
          (1 - n),
        0,
        0,
      ),
    );
    // Lights: a row that runs to the beat, else a slow breath; static flickers at random.
    const stat = p.c('static');
    for (let i = 0; i < 5; i++) {
      const run = Math.max(0, sin(state.phase * Math.PI * 2 - i * 1.15)) ** 2;
      const idle = 0.12 + 0.08 * sin(t * 1.2 + i * 1.1);
      const flick = stat ? (sin(t * (31 + i * 7) + i * 3) > 0.3 ? 1 : 0.1) : 0;
      p.glow(
        i,
        (idle + state.level * run * 0.95 + flick * stat) * (1 - n * 0.6) + p.excite * 0.3,
        p.rainbow && state.level > 0.3 ? `hsl(${(i * 65 + t * 60) % 360},85%,62%)` : undefined,
      );
    }
    p.glow(5, 0.35 + 0.65 * pulse + 0.1 * sin(t * 1.5));
    p.glow(6, 0.7 - n * 0.4);
    p.glow(
      7,
      0.3 +
        (state.level > 0.3 ? (frac < 0.3 ? 0.7 : 0.1) : 0.25 * sin(t * 1.8)) +
        hunt * 0.4 * (sin(t * 8) > 0 ? 1 : 0),
    );
    if (state.level > 0.3) p.leanTo = 1.5 * state.level * sin(state.phase * Math.PI);
    p.set('x', 0);
  },
  acts: {
    play: { weight: 3.5, length: [8, 13], pose: (p, u, e) => p.set('music', e) },
    tune: {
      weight: 2.5,
      length: [3, 4.5],
      pose: (p, u, e) => (
        p.set('dial', e),
        p.set('static', e * (u < 2 ? 0.6 : 0)),
        p.set('hunt', e * 0.4)
      ),
    },
    hunt: {
      weight: 2,
      length: [3, 4],
      pose: (p, u, e) => (p.set('hunt', e), p.set('ear', e * 0.5)),
    },
    boogie: {
      weight: 2.5,
      length: [6, 9],
      pose: (p, u, e) => {
        p.set('music', e);
        p.set('bpm', 132 - 112 * 0 + 0);
        p.hopTo = 0.09 * e * Math.abs(sin((u * Math.PI * 132) / 60));
        p.leanTo = 4 * e * sin((u * Math.PI * 66) / 60);
        p.set('loud', e);
      },
    },
    lullaby: {
      weight: 1.5,
      length: [8, 12],
      pose: (p, u, e) => (
        p.set('music', e),
        p.set('bpm', 62 - 112 * 0),
        (p.leanTo = 3 * e * sin(u * 1.1))
      ),
    },
    static: {
      weight: 1.5,
      length: [1.6, 2.4],
      pose: (p, u, e) => (p.set('static', e), p.set('hunt', e * 0.3)),
    },
    listen: {
      weight: 2.5,
      length: [4, 6],
      pose: (p, u, e) => (p.set('ear', e), p.set('dim', e * 0.3)),
    },
    volume: {
      weight: 1.5,
      length: [3, 4],
      pose: (p, u, e) => (
        p.set('vol', e * sin(u * 2)),
        p.set('music', e * 0.9),
        p.set('loud', e * 2)
      ),
    },
    hop: {
      weight: 1.5,
      length: [1.6, 2.4],
      pose: (p, u, e) => ((p.hopTo = 0.12 * e * Math.abs(sin(u * 4.5))), p.set('static', e * 0.2)),
    },
    twitch: {
      weight: 2,
      length: [1.6, 2.4],
      pose: (p, u, e) => (p.set('twitch', e), p.set('static', e * 0.15)),
    },
    sweep: {
      weight: 1.8,
      length: [3, 4.5],
      pose: (p, u, e) => (p.set('sweep', e), p.set('dial', e * 0.3), p.set('hunt', e * 0.2)),
    },
    perkUp: {
      weight: 1.2,
      length: [2, 3],
      pose: (p, u, e) => (
        p.set('ear', e * 1.5),
        p.set('loud', e),
        (p.hopTo = 0.02 * e * hump(u, 0.3, 0.8))
      ),
    },
    spinDials: {
      weight: 1.2,
      length: [2, 3],
      pose: (p, u, e) => (p.set('spinDial', e), p.set('dial', e * 0.5)),
    },
    nap: { weight: 1.2, length: [6, 9], pose: (p, u, e) => p.set('dim', e) },
    dizzy: {
      weight: 0,
      length: [3, 4],
      pose: (p, u, e) => (
        p.set('static', e),
        p.set('spinDial', e),
        p.set('hunt', e),
        (p.leanTo = 5 * e * sin(u * 9))
      ),
    },
    startled: {
      weight: 0,
      length: [3, 4],
      pose: (p, u, e) => (p.set('music', hump(u, 0, 3.4)), p.set('loud', e), p.set('bpm', 128)),
    },
  },
  poke: (p) => p.squash.kick(3),
};

const musicState = new WeakMap<Piece, { phase: number; level: number; beat: number }>();

/** On each beat (the radio's, the gramophone's): a note floats up (on every `every`th),
 * and the crew close by bob (unless it's quieter than that: `bob` false). */
function musicBeat(p: Piece, beat: number, every = 2, bob = true) {
  const f = p.frameNow;
  if (!f) return;
  const b = p.bounds(f);
  if (beat % every === 0)
    p.notes?.spawn(b.x + b.w * (0.3 + Math.random() * 0.5), b.y, f.bot * 0.6, Math.random() - 0.5);
  if (!bob) return;
  for (const c of p.peers) {
    if (c.free || c.state !== 'here') continue;
    const cb = c.bounds(f);
    if (Math.abs(cb.x + cb.w / 2 - (b.x + b.w / 2)) > f.bot * 5) continue;
    const bone = c.puppet.has('head') ? 'head' : c.puppet.has('body') ? 'body' : 'root';
    c.puppet.kick(bone, 70, 0, (beat % 2 ? 1 : -1) * 60);
  }
}

// ---------- Gramophone ----------

/** The record at full speed (degrees a second: a slow 23 rpm, for low-key music), the
 * tonearm swung out off it while it isn't playing (degrees), and the horn's axis in the
 * piece's own space (set.py). */
const RPM = 140;
const PARKED = 28;
const HORN: [number, number, number] = [0, 0.57, 0.82];
const gramState = new WeakMap<Piece, { spin: number; crank: number }>();

const gramophone: Kind = {
  metres: 0.9,
  width: 0.6,
  deep: 0.7,
  size: 1.8,
  depth: [0.7, 0.9],
  blocks: true,
  music: true,
  feel: (b) =>
    /^neck/.test(b)
      ? feel(1.8, 0.3)
      : b === 'horn'
        ? feel(2.4, 0.3)
        : b === 'tonearm'
          ? feel(1.4, 0.75)
          : feel(4, 0.5),
  ambient(p, t, dt) {
    const n = p.night;
    // Music: the record comes up to speed under the arm, the horn nods slowly with it (in
    // half time: the music is low-key) and the lights drift along the front. A track's own
    // tempo (fed in) wins over an act's.
    const music = Math.min(1, p.c('music'));
    const bpm = p.feed.bpm || p.c('bpm') || 84;
    const state = musicState.get(p) ?? { phase: 0, level: 0, beat: -1 };
    musicState.set(p, state);
    const own = gramState.get(p) ?? { spin: 0, crank: 0 };
    gramState.set(p, own);
    state.level += (music - state.level) * Math.min(1, dt * 3);
    state.phase += (dt * bpm) / 60;
    const beat = Math.floor(state.phase);
    // Kept still (a room being read in), it only plays: no notes, no bounce, no lean, a
    // breath of a nod, its lights steady.
    const still = p.still;
    if (beat !== state.beat) {
      state.beat = beat;
      if (state.level > 0.5 && !still) {
        if (beat % 4 === 0) p.squash.kick(0.5 * state.level);
        musicBeat(p, beat, 4, false);
      }
    }
    // One slow swell every two beats, rising and falling smoothly.
    const half = state.phase / 2;
    const pulse = state.level * (0.5 - 0.5 * Math.cos(half * Math.PI * 2)) * (still ? 0.15 : 1);
    const loud = p.c('loud');
    // The record turns (faster on request), rocks under a scratch; the crank winds while it
    // waits to be let play (a click), and when it's wound up by hand.
    own.spin += dt * RPM * (state.level + p.c('fast') * 2.5);
    own.crank += dt * 300 * (p.c('wind') + p.c('hunt'));
    const scratch = p.c('scratch') * 40 * sin(t * 13);
    const blast = p.c('blast');
    p.later(() => {
      p.puppet.swing('disc', own.spin + scratch);
      p.puppet.turn('crank', own.crank, 0, 0);
      p.puppet.stretch(
        'horn',
        1 + 0.04 * pulse + 0.02 * loud + 0.25 * blast,
        HORN,
        1 + 0.03 * pulse + 0.1 * p.c('yawn') + 0.12 * blast,
      );
    });
    // The tonearm: down on the record while it plays (riding its wobble), swung out and
    // lifted off it when it doesn't.
    const off = 1 - state.level;
    p.puppet.add(
      'tonearm',
      -8 * off - 6 * p.c('lift'),
      PARKED * off + state.level * 0.8 * sin((own.spin * D) / 2),
      0,
    );
    // The horn: sways a little, nods on the beat, turns to listen toward the mouse (or
    // whoever's near), droops asleep, bows, and reads the crew's mood like the radio.
    const mood = crewMood(p);
    const nod = 3.5 * pulse + loud;
    const droop = n * 14 + p.c('droop') * 20 + mood.low * 8;
    tilt(p, 'neck0', 2 * sin(t * 0.6 + p.seed) + p.c('bow') * 18 + droop * 0.4, 0, 1);
    tilt(
      p,
      'neck1',
      3 * sin(t * 0.9 + p.seed) + nod + p.c('bow') * 22 + droop * 0.6 - mood.glad * 4 - blast * 10,
      0,
      1,
    );
    if (!still) tilt(p, 'neck1', p.stir * 5 * sin(t * 17) + mood.jolt * 3 * sin(t * 28), 1, 0);
    p.puppet.add(
      'neck1',
      0,
      p.gx * (8 + p.c('listen') * 22) +
        p.c('look') * 40 * sin(t * 1.3) +
        mood.glad * 6 * sin(t * 2.4),
      0,
    );
    p.puppet.add('horn', p.c('listen') * -8 - p.c('yawn') * 10, 0, p.c('shake') * 14 * sin(t * 24));
    p.eyes(
      0.01,
      Math.max(p.c('squint'), p.c('dim') * 0.8, p.c('yawn') * 0.7),
      p.c('wide') + p.c('listen') * 0.5 + p.hover * 0.6 + p.excite * 0.5,
    );
    // Lights: a row that drifts along with the music, else a slow breath; the spindle and
    // the head's lamp warm with it; the rim glows up with each swell.
    for (let i = 0; i < 4; i++) {
      const run = still ? 0.3 : Math.max(0, sin(half * Math.PI * 2 - i * 1.3)) ** 2;
      const idle = 0.12 + 0.08 * sin(t * 1.1 + i * 1.2);
      p.glow(
        i + 1,
        (idle + state.level * run * 0.6) * (1 - n * 0.6) + p.excite * 0.3,
        p.rainbow && state.level > 0.3 ? `hsl(${(i * 80 + t * 50) % 360},85%,62%)` : undefined,
      );
    }
    p.glow(0, (0.9 - n * 0.2 - p.c('dim') * 0.4) * (1 - p.c('yawn') * 0.5));
    p.glow(5, 0.3 + 0.5 * state.level + 0.2 * p.c('fast'));
    p.glow(6, 0.2 + 0.4 * pulse + blast * 0.8 + 0.08 * sin(t * 1.4) - n * 0.1);
    if (state.level > 0.3 && !still) p.leanTo = 0.6 * state.level * sin(half * Math.PI);
  },
  // Mostly it plays, listens and dozes; the lively ones (a boogie, a toot) are rare.
  acts: {
    play: { weight: 4, length: [8, 13], pose: (p, u, e) => p.set('music', e) },
    wind: {
      weight: 1,
      length: [2.5, 4],
      pose: (p, u, e) => (p.set('wind', e), (p.leanTo = 2 * e * sin(u * 10))),
    },
    scratch: {
      weight: 0.3,
      length: [2.5, 3.5],
      pose: (p, u, e) => (p.set('music', e * 0.6), p.set('scratch', e), p.set('loud', e * 0.5)),
    },
    toot: {
      weight: 0.3,
      length: [1.6, 2.2],
      pose: (p, u) => (
        p.set('blast', hump(u, 0.2, 1.2)),
        (p.hopTo = 0.06 * hump(u, 0.25, 0.9)),
        p.set('wide', hump(u, 0, 1.6))
      ),
    },
    listen: {
      weight: 3,
      length: [4, 6],
      pose: (p, u, e) => p.set('listen', e),
    },
    lookAbout: {
      weight: 2,
      length: [4, 6],
      pose: (p, u, e) => p.set('look', e),
    },
    bow: {
      weight: 1,
      length: [2.4, 3.2],
      pose: (p, u) => p.set('bow', hump(u, 0.2, 2.2)),
    },
    boogie: {
      weight: 0.2,
      length: [6, 9],
      pose: (p, u, e) => {
        p.set('music', e);
        p.set('bpm', 128);
        p.hopTo = 0.07 * e * Math.abs(sin((u * Math.PI * 128) / 60));
        p.leanTo = 4 * e * sin((u * Math.PI * 64) / 60);
        p.set('loud', e);
      },
    },
    waltz: {
      weight: 1.5,
      length: [7, 10],
      pose: (p, u, e) => {
        p.set('music', e);
        p.set('bpm', 90);
        // One, two, three: a lean on the one.
        const bar = ((u * 90) / 60 / 3) % 1;
        p.leanTo = 5 * e * sin(Math.PI * 2 * bar) * (bar < 0.34 ? 1 : 0.4);
      },
    },
    lullaby: {
      weight: 3,
      length: [8, 12],
      pose: (p, u, e) => (
        p.set('music', e),
        p.set('bpm', 60),
        p.set('droop', e * 0.5),
        (p.leanTo = 3 * e * sin(u * 1.1))
      ),
    },
    spinUp: {
      weight: 0.2,
      length: [2.5, 3.5],
      pose: (p, u, e) => (p.set('fast', e), p.set('lift', e), p.set('wide', e * 0.5)),
    },
    yawn: {
      weight: 1.5,
      length: [2.5, 3.5],
      pose: (p, u) => (p.set('yawn', hump(u, 0.2, 2.6)), p.set('droop', hump(u, 0.6, 3))),
    },
    sneeze: {
      weight: 0.3,
      length: [1.6, 2.2],
      pose: (p, u) => {
        p.set('bow', -0.5 * hump(u, 0, 0.9) + hump(u, 0.9, 1.4));
        p.set('blast', hump(u, 0.9, 1.3));
        if (u > 0.9 && u < 1.0) p.puppet.kick('horn', 220, 0, 0);
      },
    },
    shake: {
      weight: 0.2,
      length: [1.2, 1.8],
      pose: (p, u, e) => p.set('shake', e),
    },
    hop: {
      weight: 0.3,
      length: [1.6, 2.4],
      pose: (p, u, e) => (p.hopTo = 0.1 * e * Math.abs(sin(u * 4.5))),
    },
    nap: {
      weight: 2.5,
      length: [6, 9],
      pose: (p, u, e) => (p.set('dim', e), p.set('droop', e)),
    },
    dizzy: {
      weight: 0,
      length: [3, 4],
      pose: (p, u, e) => (
        p.set('fast', e),
        p.set('scratch', e),
        p.set('shake', e * 0.4),
        (p.leanTo = 5 * e * sin(u * 9))
      ),
    },
    startled: {
      weight: 0,
      length: [1.6, 2.2],
      pose: (p, u) => (p.set('blast', hump(u, 0, 0.8)), p.set('wide', hump(u, 0, 1.6))),
    },
  },
  poke: (p) => (p.squash.kick(3), p.puppet.kick('horn', 160, 0, 0)),
  pass: (p) => p.puppet.kick('neck1', 0, 0, 120),
};

// ---------- Fireplace ----------

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

const DOGS = ['L', 'R'] as const;
/** Which way each firedog looks to face the fire (yaw, degrees: + toward the viewer's right). */
const INWARD = { L: -38, R: 38 };

const fireplace: Kind = {
  metres: 1.07,
  width: 1.25,
  deep: 0.3,
  size: 2.1,
  depth: [0.9, 0.97],
  blocks: true,
  // (set.py: the candles at each end of the mantel, the fire bone low in the grate.)
  fire: {
    candles: [
      [-0.52, 0.905, 0.06],
      [0.52, 0.905, 0.06],
    ],
  },
  feel: (b) =>
    /^tail/.test(b)
      ? feel(3.6, 0.22)
      : /^dog/.test(b)
        ? feel(3, 0.45)
        : b === 'gauge'
          ? feel(2.2, 0.3)
          : feel(3, 0.5),
  ambient(p, t) {
    const n = p.night;
    const fire = p.fire;
    // How it burns: steady, roaring, or low; flares from the acts.
    if (fire) {
      fire.heat = 1 + p.c('roar') * 0.9 - p.c('low') * 0.55;
      fire.flare = Math.max(fire.flare, p.c('flare'));
    }
    const level = fire?.level ?? 0;
    // The logs shift as they burn, and settle.
    const settle = p.c('settle');
    tilt(p, 'logs', 0.6 * sin(t * 0.3 + p.seed) + p.c('jolt') * 3 * sin(t * 31), 1, 0);
    p.later(() => p.puppet.shift('logs', settle * 0.004, -settle * 0.012, 0));
    // The gauge reads the fire, with a tremble; roaring, it swings round into the red.
    p.puppet.add(
      'gauge',
      0,
      0,
      55 -
        level * 55 +
        3 * sin(t * 3.3) * level -
        p.c('roar') * 30 +
        p.c('jolt') * 12 * sin(t * 23),
    );
    p.glow(1, 0.25 + 0.75 * clamp01(p.c('roar') + (level > 1.5 ? 1 : 0)) * Math.max(0, sin(t * 9)));
    // The candles on the mantel, each its own flicker; they gutter in a draught.
    const gutter = p.c('gutter');
    p.glow(
      2,
      0.75 + 0.15 * sin(t * 11 + p.seed) * sin(t * 7.3) - gutter * 0.5 * Math.max(0, sin(t * 19)),
      '#ffc070',
    );
    // The firedogs: they look round at the mouse (or whoever's near), blink, wag, doze; and
    // they like it when the fire roars.
    const mood = crewMood(p);
    const face = p.c('face');
    const doze = Math.max(p.c('doze'), n * 0.4);
    for (const side of DOGS) {
      const k = side === 'L' ? 0 : 1;
      const own = p.c(`only${side}`) || (p.c('onlyL') || p.c('onlyR') ? 0 : 1);
      const bark = p.c('bark') * own;
      p.puppet.add(
        `dog${side}`,
        p.gy * 10 + doze * 24 + 3 * sin(t * 0.8 + k * 2) - bark * 18 * Math.abs(sin(t * 16)),
        (p.gx * 34 * (1 - face) + INWARD[side] * face) * (1 - doze * 0.6) +
          p.c('tilt') * 14 * (k ? -1 : 1),
        p.c('tilt') * 16 * (k ? -1 : 1) + p.stir * 4 * sin(t * 12 + k),
      );
      const wag =
        0.25 + p.hover * 0.6 + p.excite * 0.8 + mood.glad * 0.6 + p.c('wag') + p.c('roar') * 0.5;
      tilt(
        p,
        `tail${side}`,
        clamp01(wag - doze) * 26 * sin(t * (9 + 4 * p.c('wag')) + k * 1.3) - doze * 12,
        1,
        0,
      );
    }
    const blink = Math.max(p.blink, doze * 0.8, p.c('shut'));
    p.glow(0, (0.95 - blink * 0.85) * (1 - n * 0.3) + p.c('bark') * 0.3, '#ffd28a');
  },
  acts: {
    crackle: {
      weight: 3,
      length: [1.2, 2],
      start: (p) => p.fire?.burst(5 + Math.floor(Math.random() * 5)),
      pose: (p, u, e) => (p.set('jolt', hump(u, 0, 0.5)), p.set('flare', hump(u, 0, 0.8) * 0.3)),
    },
    settle: {
      weight: 2,
      length: [2.5, 3.5],
      start: (p) => p.fire?.burst(12),
      pose: (p, u, e) => (
        p.set('settle', ramp(u, 0.2, 0.5) * e),
        p.set('flare', hump(u, 0.3, 2) * 0.7),
        p.set('jolt', hump(u, 0.2, 0.6)),
        p.set('face', e * 0.7)
      ),
    },
    roar: {
      weight: 1.2,
      length: [4, 6],
      start: (p) => p.fire?.burst(10),
      pose: (p, u, e) => (p.set('roar', e), p.set('wag', e), p.set('face', e)),
    },
    low: {
      weight: 1.5,
      length: [6, 9],
      pose: (p, u, e) => (p.set('low', e), p.set('doze', e * 0.5)),
    },
    wag: {
      weight: 2.5,
      length: [3, 5],
      pose: (p, u, e) => (p.set('wag', e * 1.2), p.set('tilt', e * sin(u * 2))),
    },
    warmUp: {
      weight: 2,
      length: [4, 6],
      pose: (p, u, e) => (p.set('face', e), p.set('shut', e * 0.5), p.set('wag', e * 0.4)),
    },
    doze: {
      weight: 1.5,
      length: [7, 10],
      pose: (p, u, e) => (p.set('doze', e), p.set('low', e * 0.3)),
    },
    bark: {
      weight: 1.5,
      length: [1.4, 2],
      start: (p) => (p.arg = p.arg < 0.5 ? 0 : 1),
      pose: (p, u, e) => {
        p.set(p.arg ? 'onlyR' : 'onlyL', 1);
        p.set('bark', hump(u, 0.1, 1.1));
        p.set('wag', e * 1.5);
      },
    },
    draught: {
      weight: 1.2,
      length: [2.5, 3.5],
      pose: (p, u, e) => (p.set('gutter', e), p.set('low', e * 0.3), p.set('tilt', e * 0.5)),
    },
    dizzy: {
      weight: 0,
      length: [3, 4],
      start: (p) => p.fire?.burst(20),
      pose: (p, u, e) => (
        p.set('roar', e),
        p.set('jolt', e),
        (p.leanTo = 2 * e * sin(u * 9)),
        p.set('tilt', e * sin(u * 7))
      ),
    },
    startled: {
      weight: 0,
      length: [1.4, 2],
      pose: (p, u, e) => (
        p.set('flare', hump(u, 0, 1.2)),
        p.set('jolt', hump(u, 0, 0.6)),
        p.set('bark', hump(u, 0, 0.8))
      ),
    },
  },
  poke: (p) => {
    p.squash.kick(3);
    p.fire?.burst(16);
  },
};

// ---------- The library's copy ----------

/**
 * The library's copy of the book, on whichever shelf has it (the copy bone): offered (it
 * stands out a little, breathing, its label lit, even in a still room: it's the call to
 * take it), pulled at (it comes out after the reader's hand), taken (gone: the book is off
 * the shelf).
 */
function shelfCopy(p: Piece, t: number) {
  if (!p.puppet.has('copy')) return;
  const offer = p.c('offer');
  const pull = p.c('pull');
  const taken = p.c('taken');
  const breath = 0.5 + 0.5 * sin(t * 2.4);
  p.later(() => {
    p.puppet.shift(
      'copy',
      0,
      offer * (0.03 + 0.006 * breath) + pull * 0.03,
      offer * 0.05 + pull * 0.12,
    );
    if (taken) p.puppet.stretch('copy', 1 - taken * 0.999, [0, 1, 0], 1 - taken * 0.999);
  });
  tilt(p, 'copy', offer * (5 + 1.5 * sin(t * 1.7)) + pull * 8, 1, 0);
  p.glow(3, offer * (0.35 + 0.65 * breath) * (1 - taken), offer ? '#ffcf7a' : undefined, true);
}

// ---------- Bookcase ----------

const libBook = (s: number, k: number) => `lib${s}${k}`;
const LIB_BONES = [0, 1, 2, 3, 4].flatMap((s) => [1, 5, 9].map((k) => libBook(s, k)));
/** Where the ladder rolls (metres from where it was built, along the rail). */
const LADDER = [-0.55, 0.12] as const;
const ladders = new WeakMap<Piece, { x: number; from: number; to: number }>();
/** The books on bones it has (the nook's shelf has fewer), and its cushion's give. */
const libBones = new WeakMap<Piece, string[]>();
const nookGive = new WeakMap<Piece, number>();
const booksOf = (p: Piece) => {
  let b = libBones.get(p);
  if (!b) libBones.set(p, (b = LIB_BONES.filter((n) => p.puppet.has(n))));
  return b;
};
/** The middle shelf's left half is a cat's nook (set.py LIB_NOOK): the cushion's top, and the
 * room from the side to the bookend and up to the next shelf's underside. */
const NOOK = { x: -0.25 / 1.06, seat: (0.84 + 0.048) / 2.04, w: 0.46 / 1.06, h: 0.3 / 2.04 };

const bookcase: Kind = {
  metres: 2.04,
  width: 1.06,
  deep: 0.3,
  size: 2.7,
  depth: [0.9, 0.97],
  blocks: true,
  nook: NOOK,
  feel: (b) => (/^lib/.test(b) ? feel(4, 0.45) : b === 'ladder' ? feel(1.3, 0.12) : feel(3, 0.5)),
  ambient(p, t, dt) {
    const n = p.night;
    const books = booksOf(p);
    // Kept still, the books barely sway and nothing rattles them.
    const k = p.still ? 0.3 : 1;
    const live = p.still ? 0 : 1;
    books.forEach((name, i) => {
      tilt(
        p,
        name,
        1.1 * k * sin(t * (0.35 + (i % 3) * 0.08) + i * 2.3) +
          live * p.stir * 1.5 * sin(t * 18 + i) +
          p.c('rattle') * 4 * sin(t * 24 + i * 1.3),
        1,
        0,
      );
    });
    // A book slides out and back (which one, the act picks).
    const pop = p.c('pop');
    if (pop) {
      const name = books[Math.floor(p.arg * books.length)];
      p.later(() => p.puppet.shift(name, 0, pop * 0.015, pop * 0.08));
    }
    const sort = p.c('sort');
    if (sort)
      [0, 4, 8, 12].forEach((i, j) => {
        const v = Math.max(0, sin(sort * 4 - j * 1.1)) ** 2;
        const name = books[(i + Math.floor(p.arg * 3)) % books.length];
        p.later(() => p.puppet.shift(name, 0, 0.01 * v, 0.07 * v));
      });
    const lean = p.c('lean');
    if (lean)
      books.forEach((name, i) => {
        const wave = Math.max(0, sin((p.c('lt') - (i % 3) * 0.3 - Math.floor(i / 3) * 0.2) * 3));
        tilt(p, name, lean * 14 * wave, 1, 0);
      });
    // The nook's cushion breathes, and gives under whoever sleeps on it.
    if (p.puppet.has('nook')) {
      const was = nookGive.get(p) ?? 0;
      const give = was + ((p.sitters.size ? 1 : 0) - was) * Math.min(1, dt * 3);
      nookGive.set(p, give);
      const breath = sin(t * 0.8 + p.seed);
      p.later(() => p.puppet.shift('nook', 0, 0.0015 * breath - 0.008 * give, 0));
    }
    // The ladder, hooked on the rail: it rolls along it, swings on its hooks, and sways when
    // someone brushes past. (The other case has none.)
    const lad = ladders.get(p) ?? { x: 0, from: 0, to: 0 };
    ladders.set(p, lad);
    const roll = p.c('roll');
    if (roll) lad.x = lad.from + (lad.to - lad.from) * roll;
    if (p.puppet.has('ladder')) {
      p.later(() => p.puppet.shift('ladder', lad.x, 0, 0));
      p.puppet.add(
        'ladder',
        live * (-p.c('swing') * 9 * sin(t * 3.2) + p.stir * 2.5 * sin(t * 6)) +
          0.4 * k * sin(t * 0.5 + p.seed),
        0,
        p.c('rock') * 3 * sin(t * 5) + p.c('rollV') * 4,
      );
    }
    const read = p.c('read');
    // Kept still, its eyes are half shut and low, and it doesn't light up when hovered.
    p.eyes(
      0.022,
      p.c('shut') + read * 0.45 + (p.still ? 0.55 : 0),
      live * (p.c('wide') + p.hover * 0.5 + p.excite * 0.4),
      read ? (lad.x - 0.2) / 0.5 : p.gx,
      read ? 0.8 : p.gy,
    );
    p.glow(0, (0.9 - n * 0.35 - p.c('dim') * 0.5) * (p.still ? 0.45 : 1));
    // The clamp lamp on the ladder (the other's banker's lamp): a reading light, warm. Kept
    // still, it and the lit spines hold steady instead of breathing.
    const breathe = p.still ? 0 : 1;
    p.glow(1, 0.55 + read * 0.45 + 0.05 * breathe * sin(t * 1.7) - p.c('dim') * 0.3, '#ffd99a');
    p.glow(2, (0.35 + 0.3 * breathe * sin(t * 0.8 + p.seed) + read * 0.5) * (1 - n * 0.4));
  },
  acts: {
    roll: {
      weight: 3,
      length: [3.5, 5],
      start: (p) => {
        const lad = ladders.get(p) ?? { x: 0, from: 0, to: 0 };
        lad.from = lad.x;
        // Somewhere else along the rail, a good way off.
        let to = LADDER[0] + Math.random() * (LADDER[1] - LADDER[0]);
        if (Math.abs(to - lad.x) < 0.2)
          to = lad.x > (LADDER[0] + LADDER[1]) / 2 ? LADDER[0] : LADDER[1];
        lad.to = to;
        ladders.set(p, lad);
      },
      pose: (p, u, e, len) => {
        const r = ramp(u, 0.3, len - 0.8);
        p.set('roll', r);
        // It leans into the roll and swings when it stops.
        const lad = ladders.get(p);
        p.set('rollV', (lad ? Math.sign(lad.to - lad.from) : 0) * hump(u, 0.3, len - 0.8));
        p.set('swing', hump(u, len - 1.2, len) * 0.6);
        p.set('read', e * 0.3);
      },
    },
    swing: {
      weight: 2,
      length: [2.5, 3.5],
      pose: (p, u, e) => (p.set('swing', e), p.set('wide', e * 0.5)),
    },
    pop: {
      weight: 3,
      length: [2, 3],
      pose: (p, u) => (p.set('pop', hump(u, 0.2, 2)), p.set('read', hump(u, 0.3, 1.8) * 0.4)),
    },
    sort: { weight: 2, length: [3, 4], pose: (p, u, e) => p.set('sort', u * e) },
    dominoes: {
      weight: 1.5,
      length: [3, 4],
      pose: (p, u, e) => (p.set('lean', e), p.set('lt', u)),
    },
    read: {
      weight: 2.5,
      length: [5, 8],
      pose: (p, u, e) => (p.set('read', e), p.set('rock', e * 0.2)),
    },
    yawn: {
      weight: 1.5,
      length: [3.5, 5],
      pose: (p, u, e) => ((p.leanTo = -2 * e), p.set('shut', e * 0.9)),
    },
    nap: { weight: 1.2, length: [6, 9], pose: (p, u, e) => (p.set('shut', e), p.set('dim', e)) },
    dizzy: {
      weight: 0,
      length: [3, 4],
      pose: (p, u, e) => {
        p.set('rattle', e * 1.5);
        p.set('swing', e * 1.4);
        p.set('rock', e);
        p.eyes(0.022, 0, 0, cos(u * 9) * e, sin(u * 9) * e);
      },
    },
    startled: {
      weight: 0,
      length: [1, 1.4],
      pose: (p, u, e) => (
        p.set('rattle', hump(u, 0, 1)),
        p.set('wide', hump(u, 0, 1)),
        p.set('swing', hump(u, 0, 1.2) * 0.7)
      ),
    },
  },
  poke: (p) => {
    p.squash.kick(2);
  },
};

/**
 * The library's other bookcase, not the bookcase's match (set.py, twin): wider and lower,
 * four shelves, its nook on the right, a shelf lower and roomier, a banker's lamp on top instead of a
 * ladder, and the library's copy of the book on the shelf above the nook: the book comes off
 * it to be read and goes back on it after.
 */
const { roll: _roll, swing: _swing, ...unladdered } = bookcase.acts;
const libcase: Kind = {
  ...bookcase,
  metres: 1.68,
  width: 1.26,
  nook: { x: 0.3 / 1.26, seat: (0.47 + 0.048) / 1.68, w: 0.53 / 1.26, h: 0.3 / 1.68 },
  ambient(p, t, dt) {
    bookcase.ambient(p, t, dt);
    shelfCopy(p, t);
  },
  acts: unladdered,
};

// ---------- Cat tree ----------

const TREE_POST = ['post0', 'post1', 'post2', 'post3'];
const treeState = new WeakMap<Piece, { hover: number; gx: number }>();

/** Swing the dangling toy: its cord hangs down, so it tips the other way from an upright bone. */
function toySwing(p: Piece, deg: number, dx: number, dz: number, lag = 1) {
  tilt(p, 'toy0', -deg, dx, dz);
  tilt(p, 'toy1', -deg * 0.6 * lag, dx, dz);
}

const cattree: Kind = {
  metres: 1.36,
  width: 0.92,
  deep: 0.8,
  size: 1.9,
  // A playground's own: it may come forward, in front of the monitor's legs.
  depth: [0.55, 0.9],
  blocks: true,
  feel: (b) =>
    b === 'toy0'
      ? feel(1.5, 0.1)
      : b === 'toy1'
        ? feel(2.1, 0.12)
        : b === 'toy'
          ? feel(3, 0.5)
          : /^plat/.test(b)
            ? feel(3.5, 0.3)
            : /^post/.test(b)
              ? feel(5, 0.3)
              : /^eye/.test(b)
                ? feel(6, 0.7)
                : feel(3, 0.5),
  ambient(p, t) {
    const n = p.night;
    const st = treeState.get(p) ?? { hover: 0, gx: 0 };
    treeState.set(p, st);
    // The mouse brushes the toy: it swings when it comes over the tree and as it moves on it.
    if (p.hover > 0.5 && st.hover <= 0.5) p.puppet.kick('toy0', 120, 0, -260 * (p.gx > 0 ? 1 : -1));
    if (p.hovered) p.puppet.kick('toy0', 0, 0, (p.gx - st.gx) * -900);
    st.hover = p.hover;
    st.gx = p.gx;
    // The toy sways on its spring, more as it is played with.
    const play = p.c('bat');
    toySwing(
      p,
      3 * sin(t * 1.3 + p.seed) + play * 26 * sin(t * 3.4) + p.excite * 5 * sin(t * 8),
      1,
      0,
    );
    toySwing(p, 2 * sin(t * 1.05 + p.seed * 2) + play * 14 * sin(t * 2.8 + 1), 0, 1, 0.8);
    const spin = p.c('spin');
    p.later(() => {
      if (spin) p.puppet.swing('toy', spin * 1440);
    });
    // Breathing: the platforms bob a hair, each in its own time.
    const b = (k: number) => sin(t * 0.9 + k * 2.1 + p.seed) * (1 - n * 0.5);
    p.later(() => {
      p.puppet.shift('plat1', 0, 0, 0.004 * b(0) + p.c('bob') * 0.012 * sin(t * 6));
      p.puppet.shift('plat2', 0, 0, 0.004 * b(1) + p.c('bob') * 0.012 * sin(t * 6 + 2));
      p.puppet.shift('plat3', 0, 0, 0.004 * b(2) + p.c('bob') * 0.012 * sin(t * 6 + 4));
    });
    // The post shivers from the bottom up: a bump of shake travelling up its segments.
    const at = p.c('shivAt');
    const amp = p.c('shiv');
    TREE_POST.forEach((bone, k) => {
      const bump = amp * Math.max(0, 1 - Math.abs(at - k) / 1.3);
      tilt(p, bone, bump * 2.4 * sin(t * 24 + k * 1.3), 1, 0);
      tilt(p, bone, bump * 1.6 * sin(t * 19 + k), 0, 1);
      tilt(p, bone, 0.5 * sin(t * 0.6 + k + p.seed), 1, 0);
    });
    // The cubby: two eyes blink out of the dark, look about, and are gone.
    const peek = p.c('peek');
    const look = p.c('peekLook');
    const shut = Math.min(1, p.blink * 0.9 + p.night * 0.4);
    const v = Math.max(0.001, peek);
    p.later(() => {
      for (const e of ['eyeL', 'eyeR']) {
        p.puppet.shift(e, look * 0.02 + p.gx * 0.006 * peek, 0, 0);
        p.puppet.stretch(e, Math.max(0.001, peek * (1 - shut * 0.85)), [0, 0, 1], v);
      }
    });
    // Lights: slots on the cubby's rim glow low and flare when someone looks out; the top lamp breathes.
    p.glow(0, 0.2 + 0.08 * sin(t * 1.4) + peek * 0.7 + p.excite * 0.4 - n * 0.1);
    p.glow(
      1,
      0.55 + 0.2 * sin(t * 1.1 + p.seed) + n * 0.4 + p.c('flash') * 0.4 + p.excite * 0.3,
      p.rainbow ? `hsl(${(t * 50) % 360},85%,62%)` : undefined,
    );
  },
  acts: {
    spin: {
      weight: 3,
      length: [2.4, 3.4],
      pose: (p, u, e, len) => (p.set('spin', ramp(u, 0.2, len - 0.3)), p.set('bat', e * 0.5)),
    },
    peek: {
      weight: 3,
      length: [4, 6],
      pose: (p, u) => {
        p.set('peek', ramp(u, 0.3, 1) * (1 - ramp(u, 3.6, 4.2)));
        p.set('peekLook', sin(u * 1.6) * 1.2);
      },
    },
    shiver: {
      weight: 2.5,
      length: [2, 3],
      pose: (p, u, e, len) => {
        p.set('shivAt', -0.5 + (u / len) * 4.8);
        p.set('shiv', 1);
        p.set('bob', e * 0.6);
      },
    },
    bat: {
      weight: 2.5,
      length: [3, 4.5],
      pose: (p, u, e) => (p.set('bat', e), p.set('flash', Math.max(0, sin(u * 5)) * e * 0.4)),
    },
    dizzy: {
      weight: 0,
      length: [3, 4],
      pose: (p, u, e) => (
        p.set('spin', ramp(u, 0, 2.5) * 2),
        p.set('bat', e),
        p.set('shivAt', (u * 3) % 4),
        p.set('shiv', e * 0.7),
        p.set('flash', e)
      ),
    },
    startled: {
      weight: 0,
      length: [1, 1.4],
      pose: (p, u) => (
        p.set('shivAt', u * 6),
        p.set('shiv', hump(u, 0, 0.9)),
        p.set('bob', hump(u, 0, 0.8))
      ),
    },
  },
  poke: (p) => p.puppet.kick('toy0', 160, 0, 420),
  pass: (p) => p.puppet.kick('toy0', 130, 0, 380),
};

// ---------- Kennel ----------

const kennelState = new WeakMap<Piece, { vane: number; fill: number }>();

/** Swing the door's flap out (+) or in (-), pivoting at the top: it hangs down, so it
 * tips the other way from an upright bone. */
function flapOut(p: Piece, deg: number, side = 0) {
  tilt(p, 'flap', -deg, 0, 1);
  tilt(p, 'flap', side, 1, 0);
}

const kennel: Kind = {
  metres: 0.97,
  width: 1.3,
  deep: 0.55,
  size: 1.75,
  // A playground's own: it may come forward, in front of the monitor's legs.
  depth: [0.55, 0.9],
  blocks: true,
  feel: (b) =>
    b === 'flap'
      ? feel(2.6, 0.15)
      : b === 'lid'
        ? feel(5, 0.3)
        : b === 'roof'
          ? feel(4, 0.45)
          : b === 'vane'
            ? feel(3, 0.5)
            : feel(4, 0.5),
  ambient(p, t, dt) {
    const n = p.night;
    const st = kennelState.get(p) ?? { vane: Math.random() * 360, fill: 0 };
    kennelState.set(p, st);
    // The flap hangs and stirs; it swings out when someone passes and waves when something inside wags.
    const wag = p.c('wag');
    const wave = 0.5 + 0.5 * sin(t * 12);
    flapOut(
      p,
      1.5 * sin(t * 0.9 + p.seed) + p.stir * 4 * sin(t * 7) + wag * 26 * wave + p.excite * 6,
      wag * 12 * sin(t * 12 + 1) + 1 * sin(t * 0.7 + p.seed),
    );
    if (wag) p.leanTo = 1.6 * wag * sin(t * 12);
    // The weathervane turns lazily, quickly in a whirl.
    st.vane += dt * (22 + p.c('whirl') * 520 + p.stir * 60);
    const vane = st.vane;
    // The roof lifts for a sigh and settles, and breathes a hair.
    const sigh = p.c('sigh');
    p.later(() => {
      p.puppet.swing('vane', vane);
      p.puppet.shift('roof', 0, 0, 0.003 * sin(t * 0.8 + p.seed) + 0.055 * sigh + 0.01 * p.excite);
    });
    tilt(p, 'roof', sigh * 2.2 * sin(t * 2), 1, 0);
    tilt(p, 'roof', wag * 0.8 * sin(t * 12), 0, 1);
    // The feeder's lid pops up and a light fills the bowl.
    const open = p.c('open');
    tilt(p, 'lid', -open * 72 + 1.5 * sin(t * 1.3) * open, 0, 1);
    st.fill += (p.c('fill') - st.fill) * Math.min(1, dt * 4);
    p.glow(
      1,
      0.12 + 0.9 * st.fill - n * 0.05,
      p.rainbow ? `hsl(${(t * 60) % 360},85%,62%)` : undefined,
    );
    p.glow(
      0,
      (0.72 + 0.1 * sin(t * 1.2 + p.seed)) * (1 - n * 0.55 - sigh * 0.4) +
        p.c('flash') * 0.3 +
        p.excite * 0.3,
    );
  },
  acts: {
    dinner: {
      weight: 3,
      length: [5, 7],
      pose: (p, u, e, len) => {
        const open = ramp(u, 0.2, 0.7) * (1 - ramp(u, len - 1.1, len - 0.4));
        p.set('open', open);
        p.set('fill', ramp(u, 0.6, 1.4) * (1 - ramp(u, len - 1.6, len - 0.8)));
        p.set('wag', open * 0.18 * (u > 1.2 ? 1 : 0));
        if (u > 0.2 && u < 0.26) p.squash.kick(3);
      },
    },
    wag: {
      weight: 3,
      length: [2.5, 4],
      pose: (p, u, e) => (p.set('wag', e), p.set('flash', e * 0.3 * Math.max(0, sin(u * 12)))),
    },
    sigh: {
      weight: 2.5,
      length: [3.2, 4],
      pose: (p, u, e, len) => {
        p.set('sigh', hump(u, 0.1, len - 0.2) ** 0.7);
        if (u > len - 0.9 && u < len - 0.84) p.squash.kick(4);
      },
    },
    whirl: {
      weight: 1.5,
      length: [2.5, 3.5],
      pose: (p, u, e) => (p.set('whirl', e), p.set('flash', e * 0.3)),
    },
    dizzy: {
      weight: 0,
      length: [3, 4],
      pose: (p, u, e) => (p.set('whirl', e), p.set('wag', e * 0.7), p.set('flash', e)),
    },
    startled: {
      weight: 0,
      length: [1, 1.4],
      pose: (p, u) => (p.set('sigh', hump(u, 0, 0.7) * 0.8), p.set('wag', hump(u, 0, 1) * 0.6)),
    },
  },
  poke: (p) => p.puppet.kick('flap', -330, 0, 200),
  pass: (p) => p.puppet.kick('flap', -250, 0, 90),
};

// ---------- Bird bath ----------

const WATER_RINGS = ['ring0', 'ring1', 'ring2'];
const MARQUEE = 8;
const DRIP_EVERY = 3.4;

const birdbath: Kind = {
  metres: 0.9,
  width: 0.62,
  deep: 1,
  size: 1.9,
  // A playground's own: it may come forward, in front of the monitor's legs.
  depth: [0.55, 0.9],
  blocks: true,
  feel: (b) => (b === 'water' ? feel(4, 0.25) : /^ring/.test(b) ? feel(5, 0.3) : feel(4, 0.5)),
  ambient(p, t) {
    const n = p.night;
    // The water ripples: three rings breathing outward, and a drip every few seconds that
    // falls from the nozzle and sends a ring out.
    const rip = p.c('rip');
    const spurt = p.c('spurt');
    const u = (t + p.seed) % DRIP_EVERY;
    const falling = u < 0.45 && spurt < 0.1;
    const fall = Math.min(Math.max(u / 0.45, 0), 1);
    WATER_RINGS.forEach((ring, i) => {
      const lag = 0.45 + i * 0.22;
      const drop = u > lag ? Math.exp(-(u - lag) * 2.6) * sin((u - lag) * 13) : 0;
      const wave =
        0.0022 * sin(t * 2.6 - i * 1.5 + p.seed) +
        0.0035 * drop +
        0.012 * rip * sin(t * 12 - i * 2) +
        0.004 * p.stir * sin(t * 15 - i);
      const grow =
        0.012 * sin(t * 1.7 - i * 1.5 + p.seed) +
        0.05 * drop +
        0.05 * rip * sin(t * 12 - i * 2 + 1) +
        spurt * 0.02 * sin(t * 9 - i);
      p.later(() => {
        p.puppet.shift(ring, 0, 0, wave);
        p.puppet.stretch(ring, 1, [0, 0, 1], 1 + grow);
      });
    });
    // The water sloshes as if a bird splashed.
    const slosh = p.c('slosh');
    tilt(p, 'water', slosh * 5 * sin(t * 7) + 0.4 * sin(t * 1.1 + p.seed), 1, 0);
    tilt(p, 'water', slosh * 3 * sin(t * 5.3 + 1), 0, 1);
    p.later(() => p.puppet.shift('water', 0, 0, 0.004 * slosh * sin(t * 7) + 0.001 * sin(t * 2)));
    // The fountain: a small bubble at rest, a column when it spurts, falling back.
    p.later(() => {
      const up = 0.14 + 0.035 * sin(t * 6 + p.seed) + 0.9 * spurt;
      p.puppet.stretch('jet', up, [0, 0, 1], 1 + spurt * 0.25 * sin(t * 31) + 0.1 * p.excite);
      // The drip: a small bead forming and falling into the water.
      const s = falling ? 0.25 + 0.75 * Math.min(1, u / 0.15) : 0.001;
      p.puppet.shift('drip', 0.022, 0, -0.085 * fall * fall);
      p.puppet.stretch('drip', s * (1 + fall * 0.6), [0, 0, 1], s);
    });
    // The rim's lights: a slow breath, or a marquee running round.
    const run = p.c('run');
    const pos = p.c('runAt');
    for (let i = 0; i < MARQUEE; i++) {
      const behind = (((pos - i) % MARQUEE) + MARQUEE) % MARQUEE;
      const trail = run ? Math.max(0, 1 - behind / 3.2) ** 1.5 : 0;
      const idle = (0.26 + 0.12 * sin(t * 1.3 + i * 0.8)) * (1 - n * 0.4);
      p.glow(
        i,
        idle * (1 - run * 0.7) + trail * run + p.c('flash') * 0.5 + p.excite * 0.35,
        p.rainbow && (run || p.excite > 0.1)
          ? `hsl(${(i * 45 + t * 80) % 360},85%,62%)`
          : undefined,
      );
    }
  },
  acts: {
    spurt: {
      weight: 3,
      length: [3, 4],
      pose: (p, u, e, len) => {
        p.set('spurt', ramp(u, 0.1, 0.5) * (1 - ramp(u, len - 1.4, len - 0.5)));
        p.set('rip', ramp(u, 0.4, 0.8) * (1 - ramp(u, len - 0.9, len)) * 0.5);
        p.set('flash', hump(u, 0.2, 1.2) * 0.2);
      },
    },
    marquee: {
      weight: 3,
      length: [3.5, 5],
      pose: (p, u, e) => (p.set('run', e), p.set('runAt', u * 10)),
    },
    splash: {
      weight: 3,
      length: [2.4, 3.2],
      pose: (p, u, e, len) => {
        const decay = Math.exp(-u * 0.9) * (1 - ramp(u, len - 0.5, len));
        p.set('slosh', decay * ramp(u, 0, 0.1) * 1.3);
        p.set('rip', decay * 1.1);
        if (u < 0.05) p.puppet.kick('water', 120, 0, 140);
      },
    },
    dizzy: {
      weight: 0,
      length: [3, 4],
      pose: (p, u, e) => (
        p.set('run', e),
        p.set('runAt', u * 16),
        p.set('slosh', e * 0.8),
        p.set('rip', e * 0.7),
        p.set('spurt', e * 0.5)
      ),
    },
    startled: {
      weight: 0,
      length: [1, 1.4],
      pose: (p, u) => (
        p.set('slosh', hump(u, 0, 1) * 0.8),
        p.set('rip', hump(u, 0, 1) * 0.7),
        p.set('spurt', hump(u, 0, 0.7) * 0.7)
      ),
    },
  },
  poke: (p) => p.puppet.kick('water', 160, 0, 200),
  pass: (p) => p.puppet.kick('water', 90, 0, 110),
};

// ---------- Perch stand ----------

/** An arm's tip dips (+) or lifts (-): the right half tips down on a negative roll, the left on a positive. */
function armDip(p: Piece, bone: string, deg: number, side: 1 | -1) {
  p.puppet.add(bone, 0, 0, -side * deg);
}

const perch: Kind = {
  metres: 1.3,
  width: 0.85,
  deep: 0.8,
  size: 2,
  // A playground's own: it may come forward, in front of the monitor's legs.
  depth: [0.55, 0.9],
  blocks: true,
  feel: (b) =>
    b === 'swing'
      ? feel(1.7, 0.1)
      : b === 'cup'
        ? feel(4, 0.3)
        : b === 'bell'
          ? feel(2.6, 0.1)
          : b === 'clapper'
            ? feel(4, 0.12)
            : /^arm/.test(b)
              ? feel(6, 0.35)
              : feel(4, 0.4),
  ambient(p, t) {
    const n = p.night;
    const sw = p.c('swing');
    const ring = p.c('ring');
    const tip = p.c('tip');
    // The pole sways a hair and shivers as someone passes.
    tilt(
      p,
      'pole',
      0.5 * sin(t * 0.7 + p.seed) + p.stir * 1.2 * sin(t * 14) + sw * 0.8 * sin(t * 9),
      1,
      0,
    );
    tilt(p, 'pole', 0.3 * sin(t * 0.55 + 1 + p.seed), 0, 1);
    // The arms flex very slightly; the right one dips under the swinging ring, the lower left under the cup.
    armDip(p, 'armTR', 0.7 * sin(t * 1.3 + p.seed) + sw * 1.6 * Math.abs(sin(t * 4.5)), 1);
    armDip(p, 'armTL', 0.7 * sin(t * 1.1 + 2 + p.seed) + ring * 1.2 * sin(t * 20), -1);
    armDip(p, 'armLL', 0.8 * sin(t * 1.2 + 4 + p.seed) + tip * 2.2, -1);
    armDip(p, 'armLR', 0.5 * sin(t * 1.5 + 1 + p.seed), 1);
    // The swing sways on its cord, by itself when it's the act.
    tilt(
      p,
      'swing',
      -(4 * sin(t * 1.25 + p.seed) + sw * 22 * sin(t * 9) + p.excite * 5 * sin(t * 8)),
      1,
      0,
    );
    tilt(p, 'swing', -(1.5 * sin(t * 0.9 + 1 + p.seed) + sw * 3 * sin(t * 6)), 0, 1);
    // The seed cup tips out to the left and rights itself.
    tilt(p, 'cup', -tip * 80 + 0.8 * sin(t * 1.6 + p.seed), 1, 0);
    // The bell wobbles and its clapper swings the other way, flashing.
    tilt(p, 'bell', -(1.2 * sin(t * 1.15 + p.seed) + ring * 20 * sin(t * 22)), 1, 0);
    tilt(p, 'bell', -ring * 7 * sin(t * 17 + 1), 0, 1);
    tilt(p, 'clapper', ring * 42 * sin(t * 22 + 2.6) - 1.5 * sin(t * 1.3 + p.seed), 1, 0);
    p.glow(
      0,
      0.18 +
        0.08 * sin(t * 1.5) +
        Math.min(1, ring) * (0.45 + 0.55 * Math.max(0, sin(t * 22))) +
        p.excite * 0.3,
      p.rainbow && ring > 0.1 ? `hsl(${(t * 140) % 360},85%,62%)` : undefined,
    );
    p.glow(1, 0.55 + 0.2 * sin(t * 1.1 + p.seed) + n * 0.4 + p.c('flash') * 0.4 + p.excite * 0.3);
  },
  acts: {
    swing: {
      weight: 3,
      length: [4, 6],
      pose: (p, u, e) => p.set('swing', e * Math.min(1, 0.4 + u * 0.4)),
    },
    tip: {
      weight: 3,
      length: [3, 4],
      pose: (p, u, e, len) => {
        p.set('tip', hump(u, 0.3, len - 0.5) ** 0.8);
        p.set('flash', hump(u, 0.3, len - 0.5) * 0.2);
      },
    },
    ring: {
      weight: 3,
      length: [2.6, 3.4],
      pose: (p, u) => {
        let r = 0;
        for (const s of [0.15, 1.1, 1.9]) if (u > s) r += Math.exp(-(u - s) * 3.2);
        p.set('ring', Math.min(1.3, r));
      },
    },
    dizzy: {
      weight: 0,
      length: [3, 4],
      pose: (p, u, e) => (
        p.set('swing', e),
        p.set('ring', e * Math.abs(sin(u * 5))),
        p.set('tip', e * 0.5 * Math.abs(sin(u * 3))),
        p.set('flash', e)
      ),
    },
    startled: {
      weight: 0,
      length: [1, 1.4],
      pose: (p, u) => (p.set('ring', hump(u, 0, 1) * 1), p.set('swing', hump(u, 0, 1) * 0.6)),
    },
  },
  poke: (p) => {
    p.puppet.kick('swing', 0, 0, 420);
    p.puppet.kick('bell', 0, 0, 250);
  },
  pass: (p) => {
    p.puppet.kick('swing', 0, 0, 300);
    p.puppet.kick('bell', 0, 0, 160);
  },
};

// ---------- The library's rug ----------

/**
 * A big rug under the book's stand: flat, 3:2, still. Nothing of its own: it doesn't move or
 * answer, and can't be clicked, so the reader's room stays calm (the round rug on the home
 * page is the one that ripples). Its metres are the model's (set.py).
 */
const librug: Kind = {
  metres: 0.03,
  width: 1.6,
  deep: 1.5,
  size: 0.03 / 2.04,
  depth: [0.3, 0.6],
  blocks: false,
  flat: true,
  inert: true,
  feel: () => feel(4, 0.6),
  ambient() {},
  acts: {},
};

export const KINDS: Record<string, Kind> = {
  fern,
  sunflower,
  lamp,
  armchair,
  bookshelf,
  rug,
  stool,
  radio,
  fireplace,
  bookcase,
  libcase,
  cattree,
  kennel,
  birdbath,
  perch,
  gramophone,
  librug,
};
