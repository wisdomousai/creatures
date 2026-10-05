import { Color, type Object3D } from 'three';
import { type Act, type Character, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import type { Reaction } from './birds';
import { Bug, ease, SIDES, span, TAU } from './bug';
import { sin } from './moves';
import { Spring } from './spring';

/**
 * Prism, the robot butterfly: a tiny upright body carrying two huge pairs of stained glass
 * wings, each a dark leading plate with lit cells (every cell its own light, and in the
 * colour look its own colour, drifting through the spectrum). The wings stand in the plane
 * facing you and hinge at the thorax: closed they stand together behind her like a
 * resting butterfly's, open they show all the glass. She lands and slowly opens and closes
 * them in the sun; flutters about erratically, a different way every moment; drifts high and
 * slow; spins; sets the whole glass shimmering; naps with the wings shut; and flutters up
 * to land on a crewmate's head, sits there a while opening and closing her wings, and
 * flutters off again.
 *
 * A poke makes her burst up in a flurry with every cell flashing; three make her dizzy; the
 * mouse resting on her makes her open her wings wide and glow.
 */
export const BUTTERFLY_FACE: FaceLayout = {
  width: 256,
  height: 192,
  eyes: [
    [0.29, 0.48],
    [0.71, 0.48],
  ],
  rx: 0.115,
  ry: 0.27,
  line: 0.05,
  mouth: [0.5, 0.82],
};

/** The glass's colours, in the colour look. */
const GLASS = ['#ff6fa8', '#ffb347', '#ffe066', '#6fdc8c', '#5ec8ff', '#c78bff', '#ff8a5c'];
const CELLS = 7;
const BAND = 7;
const FOLD = 64;

export class Butterfly extends Bug {
  static readonly terms =
    'insect purple lilac lavender pink wings stained glass cells flutter fly drift glow shimmer colourful colorful rainbow tiny delicate land';

  /** Held by the pointer, it flies after it. */
  readonly flies = true;
  private openS = new Spring(3, 0.7);
  private flapS = new Spring(5, 0.8);
  private leanS = new Spring(4, 0.4);
  private bobS = new Spring(6, 0.5);
  // Per-frame requests from acts, cleared in idle().
  private open = 0;
  private flap = 0;
  private lean = 0;
  private spin = 0;
  private glow = 0;
  private cells: ((i: number, t: number) => number) | null = null;
  private actSpeed = 1;
  private dir = 1;
  private stage = 0;
  private since = 0;
  private seed = 0;
  /** The crewmate she is sitting on. */
  private host: Character | null = null;

  constructor(model: Object3D) {
    super(
      {
        name: 'Prism',
        model: 'butterfly',
        metres: 0.56,
        width: 0.66,
        size: 0.55,
        feels: {
          default: { f: 4, zeta: 0.6 },
          root: { f: 4, zeta: 0.5 },
          body: { f: 4, zeta: 0.5 },
          abdomen: { f: 5, zeta: 0.35 },
          head: { f: 5, zeta: 0.5, r: 0.5 },
          'wing.L': { f: 5, zeta: 0.55 },
          'wing.R': { f: 5, zeta: 0.55 },
          'hind.L': { f: 5, zeta: 0.5 },
          'hind.R': { f: 5, zeta: 0.5 },
          'antenna.L.1': { f: 3.5, zeta: 0.3 },
          'antenna.R.1': { f: 3.5, zeta: 0.3 },
          'antenna.L.2': { f: 4.5, zeta: 0.2 },
          'antenna.R.2': { f: 4.5, zeta: 0.2 },
        },
        face: BUTTERFLY_FACE,
        eyes: 0.64,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.8 },
          { bone: 'body', yaw: 0.2, pitch: 0 },
        ],
        reach: { yaw: 55, pitch: 28 },
        lag: 1.4,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 0.9,
        turn: 40,
        roam: true,
      },
      model,
    );
    this.acts = { ...this.moves(), ...this.reactions() };
  }

  private flying = () => this.air.y > 0.3;

  private moves(): Record<string, Act> {
    const p = this.puppet;
    const aloft = () => this.still() && this.state === 'here';
    /** Erratic: a new little goal every moment, any way at all. */
    const flit = (t: number, every: number, far: number) => {
      if (t > this.stage * every && !this.walking) {
        this.stage++;
        const way = Math.random() < 0.5 ? -1 : 1;
        this.actSpeed = 1.5 + Math.random() * 3;
        this.amble(far * (0.4 + Math.random()), Math.random() * 0.7, way);
        this.seed = Math.random() * 10;
      }
    };
    return {
      idle: { weight: 3, length: [2.5, 5] },
      sun: {
        weight: 2.4,
        length: [9, 11],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // Landed, slowly opening the wings wide, holding, slowly closing, and again; the
          // glass warming through the colours as it opens.
          const k = this.fade(t, 0.8);
          const o = (0.5 - 0.5 * Math.cos(t * 0.95)) * k;
          this.open = o;
          this.cells = (i, s) =>
            0.15 + 0.85 * clamp(o * 1.2 - i * 0.05, 0, 1) * (0.8 + 0.2 * sin(s, 0.6, i / 7));
          p.add('body', -2 * o);
          p.add('head', 0, 8 * sin(t, 0.2) * k);
        },
      },
      flutter: {
        weight: 2.4,
        length: [6, 8],
        face: 'happy',
        when: aloft,
        start: () => (this.stage = 0),
        pose: (t) => {
          // Fluttering about with no plan: up, down, a flick this way and then that, the
          // wings going all the time.
          const k = this.fade(t, 0.5);
          this.up = (0.85 + 0.35 * Math.sin(t * 3.1) * Math.cos(t * 1.7)) * k;
          this.flap = k;
          flit(t, 0.9, 1.4);
          this.lean = 30 * Math.sin(t * 2.3 + this.seed) * k;
          p.add('body', -6 * k + 6 * Math.sin(t * 4.1 + this.seed) * k);
          this.cells = (i, s) => 0.4 + 0.6 * Math.max(0, Math.sin(s * 5 + i));
        },
      },
      drift: {
        weight: 1.5,
        length: [7, 9],
        face: 'neutral',
        when: aloft,
        start: () => (this.stage = 0),
        pose: (t) => {
          // High and slow: wings opening and closing in long beats, gliding a long way.
          const k = this.fade(t, 0.8);
          this.up = (1.5 + 0.2 * sin(t, 0.3)) * k;
          this.flap = 0.55 * k;
          this.actSpeed = 0.9;
          if (this.stage === 0 && t > 0.8) {
            this.stage = 1;
            this.amble(4);
          }
          this.lean = 12 * sin(t, 0.3) * k;
          this.cells = (i, s) => 0.5 + 0.5 * Math.sin(s * 1.5 - i * 0.7);
        },
      },
      twirl: {
        weight: 1,
        length: [3.4, 4],
        face: 'happy',
        when: aloft,
        pose: (t) => {
          // Turning round and round in the air on the spot, the glass flashing by.
          const k = this.fade(t, 0.5);
          this.up = 1.1 * k;
          this.flap = k;
          this.spin = TAU * ease(t, 0.5, 3.1);
          this.cells = (i, s) => 0.2 + 0.8 * Math.max(0, Math.sin(s * 12 - i));
        },
      },
      swoop: {
        weight: 1.1,
        length: [6, 7],
        face: 'surprised',
        when: aloft,
        start: () => (this.stage = 0),
        pose: (t) => {
          // Up high, then down in a long swoop to the other end of the floor, wings
          // swept back, and a flare at the bottom.
          const k = this.fade(t, 0.5);
          const dive = span(t, 2.2, 3.0, 3.6, 4.4);
          this.up = (1.6 - 1.2 * dive) * k;
          this.flap = (1 - 0.8 * dive) * k;
          this.open = 0.3 * dive;
          if (this.stage === 0 && t > 2) {
            this.stage = 1;
            this.actSpeed = 3;
            this.amble(4, Math.random() * 0.4);
          }
          p.add('body', 20 * dive - 6 * k);
          this.lean = 10 * dive;
        },
      },
      shimmer: {
        weight: 1.3,
        length: [4, 5],
        face: 'love',
        when: this.still,
        pose: (t) => {
          // Wings wide, the whole glass running through the spectrum, cell by cell.
          const k = this.fade(t, 0.6);
          this.open = k;
          this.glow = k;
          this.cells = (i, s) => 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(s * 4 - i * 1.1));
          this.feelers((side, k2) => [0, 0, side * (k2 === 1 ? -12 : 10) * k]);
        },
      },
      preen: {
        weight: 1.1,
        length: [5, 6],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // Wings snapped shut, then the front legs up to draw each antenna through them.
          const k = this.fade(t, 0.5);
          for (const [sfx, side] of SIDES) {
            const mine = t < this.actLength / 2 === side > 0;
            const use = mine ? k : 0;
            p.add(`antenna.${sfx}.1`, 80 * use, 0, side * 14 * use);
            p.add(`antenna.${sfx}.2`, 40 * use);
            this.leg(sfx, side, 0, 24 * use, 36 * use + 6 * sin(t, 3) * use, -side * 16 * use);
          }
          p.add('head', 8 * k);
          this.open = 0.12 * Math.max(0, sin(t, 0.9)) * k;
        },
      },
      flick: {
        weight: 1.2,
        length: [2.5, 3.2],
        face: 'wink',
        when: this.still,
        pose: (t) => {
          // Wings pop open and shut a few times, quick, the cells flashing with each.
          const n = Math.sin(t * 7);
          const k = this.fade(t, 0.3);
          this.open = clamp(n * 1.4, 0, 1) * k;
          this.cells = (i) => (n > 0 ? 1 : 0.15);
        },
      },
      nap: {
        weight: 0.9,
        length: [9, 12],
        when: this.still,
        pose: (t) => {
          // Wings shut, antennae drooped, head down, the glass dark.
          const k = span(t, 1, 2, this.actLength - 2, this.actLength - 0.6);
          p.add('head', 24 * k);
          p.add('body', 6 * k);
          this.feelers(() => [40 * k, 0, 0]);
          this.expression = k > 0.4 ? 'asleep' : 'sleepy';
          this.cells = (i, s) => 0.08 + 0.1 * (0.5 + 0.5 * Math.sin(s * 1.1 - i * 0.5));
        },
      },
      saunter: {
        weight: 1.3,
        length: [6, 8],
        when: this.still,
        start: () => {
          this.actSpeed = 0.9;
          this.amble(1.5 + Math.random() * 1.5);
        },
        pose: () => (this.actSpeed = 0.9),
      },
      visit: {
        weight: 1.5,
        // Ends when she has been and gone from a crewmate's head.
        length: [90, 90],
        face: 'happy',
        when: () => aloft() && this.mates().length > 0,
        start: () => {
          this.stage = 0;
          this.host = this.mates()[0] ?? null;
        },
        pose: (t) => this.visit(t),
      },
    };
  }

  /** Flutters up to a crewmate's head, sits there a while, and flutters down again. */
  private visit(t: number) {
    const p = this.puppet;
    const m = this.host;
    const f = this.env?.frame;
    if (!m || !f || m.state !== 'here') {
      if (this.stage < 3) this.dismount();
      this.stage = 4;
    }
    if (this.stage === 0 && m && f) {
      // Up and over onto the head: a flutter of an arc about the height of her own.
      const top = m.spec.size * f.bot * 0.93 + m.standOn;
      const depth = Math.max(0, m.depth - 0.02);
      this.hopOnto(m.s, depth, top, 1.3, 0.7);
      this.stage = 1;
    } else if (this.stage === 1) {
      this.flap = 1;
      this.lean = 24 * Math.sin(t * 7);
      if (!this.hopping && m) {
        this.host = m;
        this.perched = true;
        this.stage = 2;
        this.since = t;
        p.kick('body', -120);
      }
    } else if (this.stage === 2) {
      // On the head: wings slowly opening and closing, antennae feeling about.
      const s = t - this.since;
      this.open = 0.5 - 0.5 * Math.cos(s * 0.9);
      p.add('head', 0, 14 * sin(s, 0.2));
      this.feelers((side, k) => [
        5 * sin(s, 0.6, k * 0.2),
        0,
        side * (4 + 8 * sin(s, 0.5, side * 0.2)),
      ]);
      this.cells = (i, st) => 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(st * 1.4 - i * 0.6));
      if (s > 7) {
        this.dismount();
        this.stage = 3;
      }
    } else if (this.stage === 3) {
      this.flap = 1;
      if (!this.hopping) {
        this.stage = 4;
        this.actLength = Math.min(this.actLength, t + 0.2);
      }
    } else if (this.stage === 4) {
      this.actLength = Math.min(this.actLength, t + 0.2);
    }
  }

  /** Off the head: a flutter down to the floor beside it. */
  private dismount() {
    if (!this.perched) return;
    this.perched = false;
    const f = this.env?.frame;
    const way = Math.random() < 0.5 ? -1 : 1;
    const h = this.heightPx;
    const s = this.s + way * h * 0.9;
    this.hopOnto(s, clamp(this.depth + 0.05 * way, 0, 1), 0, 1.0, 0.5);
    this.host = null;
    if (f) this.goal = null;
  }

  poke() {
    if (this.perched) this.dismount();
    super.poke();
  }

  leave(by?: 'rise') {
    if (this.perched) this.dismount();
    super.leave(by);
  }

  protected react(kind: Reaction, t: number) {
    const p = this.puppet;
    if (kind === 'poked') {
      // Bursts up in a flurry, every cell flashing.
      const k = span(t, 0, 0.15, 1.2, 1.8);
      this.up = 2 * k;
      this.flap = 1;
      this.glow = 1;
      this.cells = (i, s) => (Math.sin(s * 22 + i * 2) > 0 ? 1 : 0.15);
      p.add('body', -12 * k);
      this.feelers(() => [-16 * k, 0, 0]);
    } else if (kind === 'dizzy') {
      const k = 1 - ease(t, 2.4, 3.4);
      this.up = 0.7 * k;
      this.flap = 0.7 * k;
      p.add('head', 8 * k * Math.cos(t * 5), 12 * k * Math.sin(t * 3), 24 * k * Math.sin(t * 5));
      p.add('body', 0, 0, 10 * k * Math.sin(t * 5));
      this.lean = 24 * k * Math.sin(t * 4);
      this.cells = (i) => (Math.random() < 0.5 ? 1 : 0.15);
    } else {
      // Wings wide open, glowing, a slow happy sway.
      const k = this.fade(t, 0.6);
      this.open = k;
      this.glow = k;
      this.cells = (i, s) => 0.5 + 0.5 * Math.sin(s * 2.5 - i * 0.8);
      p.add('head', 6 * k, 0, 8 * k * sin(t, 1));
      p.add('body', 0, 0, 5 * k * sin(t, 0.8));
    }
  }

  // ---------- Posing ----------

  protected idle(t: number) {
    const p = this.puppet;
    this.up = 0;
    this.open = 0;
    this.flap = 0;
    this.lean = 0;
    this.spin = 0;
    this.glow = 0;
    this.cells = null;
    this.actSpeed = 1;
    this.expression = this.hovered ? 'happy' : 'neutral';
    p.add('body', 1.2 * sin(t, 0.28));
    p.add('head', 2 * sin(t, 0.4), 4 * sin(t, 0.13));
    p.add('abdomen', 3 * sin(t, 0.3, 0.2));
    this.feelers((side, k) => {
      const ph = side > 0 ? 0 : 0.3;
      return k === 1
        ? [6 * sin(t, 0.5, ph), 0, side * (-4 + 6 * sin(t, 0.37, ph))]
        : [14 * sin(t, 0.5, ph - 0.15), 0, side * 6 * sin(t, 0.61, ph)];
    });
    this.legs((side, k) => [
      2 * sin(t, 0.17, k * 0.31 + side * 0.1),
      3 * Math.max(0, sin(t, 0.11, k * 0.4 + side * 0.2)) ** 4,
      0,
    ]);
    // Every so often she cracks the wings open a little, as if warming them.
    const slow = Math.max(0, sin(t, 0.06)) ** 6;
    this.open = 0.25 * slow;
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    this.env = env;
    this.spec.speed = this.actSpeed;
    this.enjoy(dt, this.still());
    if (this.state === 'entering' || this.state === 'leaving') {
      this.up = Math.max(this.up, 0.9);
      this.flap = 1;
    }
    // On a head she goes where it goes (and on a hop she goes where the hop does).
    const host = this.host;
    if (this.perched && host && !this.hopping) {
      this.s = host.s;
      this.depth = this.depthGoal = Math.max(0, host.depth - 0.02);
      this.goal = null;
      this.standOn = host.spec.size * env.frame.bot * 0.93 + host.standOn;
    }
    const air = this.hoverUp(dt);
    const flap = this.flapS.update(dt, this.flap || (this.flying() ? 1 : 0));
    const lean = this.leanS.update(dt, this.lean);
    // Legs trail under her in the air; walk on the floor.
    this.legs((side, k) => [-8 * air, 22 * air, -side * 10 * air]);
    if (!this.flying() && !this.perched) this.walkLegs(this.heightPx * 0.9, 10, 14, 6);
    p.add('root', 0, 0, -lean);
    // Wings: the glass faces you open, and stands closed behind her when she is still.
    const open = this.openS.update(
      dt,
      clamp(this.open + (this.hovered && this.act === 'idle' ? 0.8 : 0), 0, 1),
    );
    const fold = FOLD * (1 - open) * (1 - clamp(flap, 0, 1));
    for (const [sfx, side] of SIDES) {
      p.add(`wing.${sfx}`, 0, side * fold, 0);
      p.add(`hind.${sfx}`, 0, side * fold * 0.92, 0);
    }
    this.tone(dt, env);
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    const t = env.time;
    const flap = clamp(this.flapS.y, 0, 1);
    // The wingbeat, direct: from open (0) toward closed, each pair a beat apart; erratic
    // in its rate so it never settles.
    if (flap > 0.02) {
      const rate = TAU * (3.6 + 0.8 * Math.sin(t * 0.9)) * t;
      const beat = 0.5 - 0.5 * Math.cos(rate);
      for (const [sfx, side] of SIDES) {
        p.turn(`wing.${sfx}`, 0, side * FOLD * 0.7 * beat * flap, 0);
        const beat2 = 0.5 - 0.5 * Math.cos(rate - 0.5);
        p.turn(`hind.${sfx}`, 0, side * FOLD * 0.62 * beat2 * flap, 0);
      }
      p.turn('body', 0, 0, 1.5 * flap * Math.sin(rate));
      p.turn('abdomen', 3 * flap * Math.sin(rate * 2), 0, 0);
    }
    this.pivot.rotation.y = this.spin;
    this.lights(dt, t);
  }

  /** Each cell its own light, and its own colour in the colour look, drifting. */
  private lights(dt: number, t: number) {
    const colour = this.lookName === 'colour';
    const open = clamp(this.openS.y + this.flapS.y * 0.8, 0, 1);
    const tint = new Color();
    for (let i = 0; i < CELLS; i++) {
      let level: number;
      if (this.act === 'dizzy') level = Math.random() < 0.5 ? 1 : 0.15;
      else if (this.cells) level = this.cells(i, t);
      else level = 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(t * 0.9 - i * 0.8));
      level = clamp(level + this.glow * 0.3, 0, 1) * (0.55 + 0.45 * open);
      // A colour that drifts round the spectrum, each cell a step on from the last.
      const x = (i + t * (0.25 + 0.6 * this.glow)) % GLASS.length;
      const a = Math.floor(x);
      tint.set(GLASS[a]).lerp(new Color(GLASS[(a + 1) % GLASS.length]), x - a);
      this.outfit.dot(i, level, colour ? tint : undefined);
    }
    this.outfit.dot(BAND, 0.5 + 0.5 * Math.sin(t * 1.3), colour ? '#ffd0ef' : undefined);
  }
}
