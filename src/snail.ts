import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Act, Character, clamp, type Env, type Frame } from './character';
import type { FaceLayout } from './face';
import { ramp } from './kitties';
import { sin } from './moves';
import { Spring } from './spring';

/**
 * The robot snails, a family of five that all share one model: Helix (coral), Loop
 * (mint), Swirl (lavender), Gyro (butter) and Curl (sky). Each time one comes on stage
 * it is a different one, in its own shell colour in the colour look, and with its own
 * pattern of marks on the shell (spots, bands, rings, chevrons, crosses) in the ink and
 * paper looks, so they are still told apart in black and white.
 *
 * A soft rubbery foot in six ringed segments glides along very slowly, a wave rippling
 * up it from the tail, under a spiral shell built like a coiled robot housing, with a
 * stripe of lights winding along it. The head has a screen face, two eye stalks on
 * springy bones (they shoot into the head when it is startled and come out again
 * slowly) and two small feelers under the chin. Its tricks are slow ones: it draws right
 * into the shell and peeks out, looks two ways with its stalks at once, stretches up
 * tall, races (comically slowly), naps in the shell, spins the shell, polishes it,
 * waves a stalk, climbs the back wall a little way and slides down, sneezes its stalks
 * in, greets a crewmate stalk to stalk, puts on a light show, races another snail (even
 * more slowly than it sounds), hides in the shell with one stalk out to spy, spins the
 * whole snail like a top, rears up to look over the front lip, glows a fading trail,
 * bumps a crewmate with both stalks shooting in, and droops both stalks sleepily.
 *
 * The stripe lights chase along the shell as it glides and glow in the snail's own
 * colour in the colour look; the stalk tips show its mood, and a lamp at the tail tip
 * lights the way.
 */
export const SNAIL_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.31, 0.46],
    [0.69, 0.46],
  ],
  rx: 0.095,
  ry: 0.27,
  line: 0.032,
  mouth: [0.5, 0.78],
};

/** The family, in the order of their coats in palettes.json, and each one's shell light. */
const FAMILY = [
  { name: 'Helix', light: '#ffb199' },
  { name: 'Loop', light: '#8ff0c9' },
  { name: 'Swirl', light: '#cbb8ff' },
  { name: 'Gyro', light: '#ffe27a' },
  { name: 'Curl', light: '#9ad3ff' },
];
const FOOT = ['foot.1', 'foot.2', 'foot.3', 'foot.4', 'foot.5', 'foot.6'];
const SLOW = 0.3;
/** Stripe lights along the shell, hub to mouth (Dot0..Dot5); Dot6 is the hub, Dot7 the tail lamp. */
const STRIPE = 6;
const HUB = 6;
const LAMP = 7;
const cycle = (x: number) => x - Math.floor(x);
/** Distance to the nearest whole number. */
const ring = (x: number) => Math.abs(x - Math.round(x));

type Pair = [number, number];
interface Run {
  phase: number;
  at: number;
  n: number;
  side: number;
  stops: { s: number; depth: number }[];
}

export class Snail extends Character {
  static readonly terms =
    'five family coral pink mint green lavender purple butter yellow sky blue shell spiral slow glide crawl stalks spots rainbow colours colors';

  private coat = 0;
  /** 0 out and about, 1 all the way into the shell (sprung). */
  private tuck = new Spring(2.4, 0.7);
  /** How far the stalks are out (1 normal, more is stretched, 0 in the head): shot in, slow to come out. */
  private out = 1;
  private wave = 0;
  /** The foot's ripple, 0 resting .. 1 gliding hard (sprung). */
  private glide = new Spring(3, 0.8);
  /** The whole snail tipped back (degrees), for climbing the back wall. */
  private lean = new Spring(2.2, 0.55);
  /** The shell turning about its hub (degrees, not sprung). */
  private turn = 0;
  private turnRate = 0;
  private run: Run = { phase: 0, at: 0, n: 0, side: 1, stops: [] };
  private pokes: number[] = [];
  private hover = 0;
  private env: Env | null = null;
  private frame: Frame | null = null;
  private flash = -10;
  private tone: string | undefined;
  private light = 0;
  /** The direction a duel runs in, shared by the two racers. */
  private duelWay = 0;
  /** One stalk out on its own while the rest is in the shell (hide and seek), 0..1 and which side. */
  private solo = 0;
  private soloSide = 1;
  /** The whole snail spinning like a top (degrees about the vertical). */
  private topDeg = 0;

  constructor(model: Object3D) {
    const stalk = { f: 3.2, zeta: 0.22 };
    super(
      {
        name: 'Helix',
        model: 'snail',
        metres: 0.37,
        width: 0.5,
        size: 1.05,
        feels: {
          default: { f: 3, zeta: 0.6 },
          root: { f: 2, zeta: 0.6 },
          body: { f: 2, zeta: 0.6 },
          shell: { f: 2.4, zeta: 0.35 },
          'foot.1': { f: 5, zeta: 0.5 },
          'foot.2': { f: 5, zeta: 0.5 },
          'foot.3': { f: 5, zeta: 0.5 },
          'foot.4': { f: 5, zeta: 0.5 },
          'foot.5': { f: 5, zeta: 0.5 },
          'foot.6': { f: 5, zeta: 0.5 },
          'neck.1': { f: 2.2, zeta: 0.55 },
          'neck.2': { f: 2.6, zeta: 0.5 },
          head: { f: 2.6, zeta: 0.5, r: 0.3 },
          'stalk.L.1': stalk,
          'stalk.R.1': stalk,
          'stalk.L.2': { f: 4, zeta: 0.2 },
          'stalk.R.2': { f: 4, zeta: 0.2 },
          'feeler.L': { f: 4, zeta: 0.3 },
          'feeler.R': { f: 4, zeta: 0.3 },
        },
        face: SNAIL_FACE,
        eyes: 0.53,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.8 },
          { bone: 'neck.1', yaw: 0.2, pitch: 0.2 },
          { bone: 'stalk.L.1', yaw: 0.3, pitch: 0.3 },
          { bone: 'stalk.R.1', yaw: 0.3, pitch: 0.3 },
        ],
        reach: { yaw: 55, pitch: 28 },
        lag: 1.2,
        entrance: 'rise',
        edges: ['bottom'],
        stay: [50, 110],
        speed: SLOW,
        turn: 70,
      },
      model,
    );
    this.setCoat(Math.floor(Math.random() * FAMILY.length));
    this.acts = this.moves();
  }

  /** Put on a coat: the name, the shell colour (the outfit reads userData.coat) and the pattern. */
  private setCoat(coat: number) {
    this.coat = coat;
    this.model.userData.coat = coat;
    this.spec.name = FAMILY[coat].name;
    if (this.outfit) this.dress(this.lookName);
  }

  /** A crewmate on the same floor, the nearest. */
  private neighbour(): Character | null {
    const env = this.env;
    if (!env || !this.frame) return null;
    let best: Character | null = null;
    let bestD = Infinity;
    for (const o of env.crew) {
      if (o === this || o.state !== 'here' || o.free || o.edge !== this.edge) continue;
      const d = Math.abs(o.s - this.s);
      if (d < bestD) [best, bestD] = [o, d];
    }
    return best;
  }

  private moves(): Record<string, Act> {
    const still = () => !this.walking;
    const stroll = (far: number) => {
      const way = Math.random() < 0.5 ? -1 : 1;
      this.walkTo(this.s + way * this.heightPx * far * (0.7 + Math.random() * 0.6));
    };
    return {
      idle: { weight: 3, length: [3, 6] },
      glide: { weight: 3, length: [5, 9], when: still, start: () => stroll(1.6) },
      lookTwo: { weight: 1.2, length: [4, 6], when: still },
      tall: { weight: 1, length: [4, 5], face: 'happy', when: still },
      withdraw: { weight: 1, length: [8, 8], when: still },
      race: {
        weight: 0.8,
        length: [6, 6],
        face: 'focused',
        when: still,
        start: () => {
          stroll(4);
          this.run.phase = 0;
        },
      },
      nap: { weight: 0.7, length: [11, 16], face: 'asleep', when: still },
      spin: { weight: 0.8, length: [4.5, 4.5], face: 'happy', when: still },
      polish: { weight: 0.8, length: [6, 6], when: still },
      wave: {
        weight: 1.1,
        length: [4, 4.5],
        face: 'happy',
        when: still,
        start: () => (this.run.side = Math.random() < 0.5 ? 1 : -1),
      },
      climb: {
        weight: 0.8,
        length: [12, 12],
        when: still,
        start: () => {
          this.run.phase = 0;
          this.walkTo(this.s + (Math.random() < 0.5 ? -1 : 1) * this.heightPx * 0.4, 1);
        },
      },
      sneeze: { weight: 0.7, length: [4, 4], when: still },
      greet: {
        weight: 1,
        length: [10, 12],
        when: () => still() && !!this.neighbour(),
        start: () => {
          const o = this.neighbour();
          if (!o) return;
          this.run.side = Math.sign(o.s - this.s) || 1;
          this.run.phase = 0;
          this.walkTo(o.s, o.depth);
        },
      },
      lightShow: { weight: 0.9, length: [7, 7], face: 'happy', when: still },
      yawn: { weight: 0.9, length: [4, 4], face: 'sleepy', when: still },
      peek: {
        weight: 0.8,
        length: [9, 9],
        when: still,
        start: () => {
          this.run.phase = 0;
          this.walkTo(this.s + (Math.random() < 0.5 ? -1 : 1) * this.heightPx * 0.5, 0);
        },
      },
      circle: {
        weight: 0.6,
        length: [16, 16],
        when: still,
        start: () => {
          const d = Math.random() < 0.5 ? -1 : 1;
          const s = this.s;
          const r = this.heightPx;
          this.run.n = 0;
          this.run.stops = [
            { s: s + d * r * 0.9, depth: 0.15 },
            { s: s + d * r * 1.3, depth: 0.7 },
            { s: s + d * r * 0.5, depth: 0.85 },
            { s: s - d * r * 0.1, depth: 0.4 },
            { s, depth: 0.15 },
          ];
          this.walkTo(this.run.stops[0].s, this.run.stops[0].depth);
        },
      },
      doze: { weight: 0.7, length: [7, 7], when: still },
      sniff: { weight: 1.2, length: [4.5, 6], face: 'focused', when: still },
      hiccup: { weight: 0.6, length: [4, 4], face: 'surprised', when: still },
      tilt: { weight: 1, length: [3.5, 4.5], when: still },
      bop: { weight: 0.8, length: [5, 6], face: 'happy', when: still },
      inchworm: { weight: 0.9, length: [6, 8], when: still, start: () => stroll(1.2) },
      lamp: { weight: 0.6, length: [5, 5], face: 'wink', when: still },
      duel: {
        weight: 0.6,
        length: [9, 9],
        face: 'focused',
        when: () => still() && this.neighbour() instanceof Snail,
        start: () => {
          const o = this.neighbour();
          this.run.phase = 0;
          const way = this.duelWay || (Math.random() < 0.5 ? -1 : 1);
          this.duelWay = 0;
          if (o instanceof Snail && o.act !== 'duel') {
            o.duelWay = way;
            o.perform('duel');
          }
          this.walkTo(this.s + way * this.heightPx * 3.2, o ? o.depth : this.depth);
        },
      },
      hideSeek: {
        weight: 0.8,
        length: [10, 10],
        when: still,
        start: () => (this.soloSide = Math.random() < 0.5 ? 1 : -1),
      },
      topSpin: { weight: 0.6, length: [6, 6], face: 'happy', when: still },
      overLip: {
        weight: 0.7,
        length: [10, 10],
        when: still,
        start: () => {
          this.run.phase = 0;
          this.walkTo(this.s + (Math.random() < 0.5 ? -1 : 1) * this.heightPx * 0.4, 0);
        },
      },
      trail: { weight: 0.8, length: [8, 10], face: 'happy', when: still, start: () => stroll(1.8) },
      bumpMate: {
        weight: 0.7,
        length: [10, 11],
        when: () => still() && !!this.neighbour(),
        start: () => {
          const o = this.neighbour();
          if (!o) return;
          this.run.side = Math.sign(o.s - this.s) || 1;
          this.run.phase = 0;
          this.walkTo(o.s, o.depth);
        },
      },
      droop: { weight: 0.7, length: [7, 7], face: 'sleepy', when: still },
      // Reactions
      poked: { weight: 0, length: [4, 5], face: 'surprised' },
      love: { weight: 0, length: [4, 5], face: 'love' },
      dizzy: { weight: 0, length: [5, 5] },
    };
  }

  poke() {
    if (this.state !== 'here') return;
    const now = performance.now() / 1000;
    this.pokes = [...this.pokes.filter((at) => now - at < 3), now];
    if (this.pokes.length >= 3) {
      this.pokes = [];
      this.setAct('dizzy');
    } else if (this.act !== 'dizzy') {
      // The stalks shoot in at once; they come out slowly.
      this.goal = null;
      this.out = 0;
      this.tuck.kick(2);
      this.puppet.kick('shell', 60);
      this.setAct('poked');
    }
  }

  protected onEnter() {
    // A different one of the family each time.
    this.setCoat((this.coat + 1 + Math.floor(Math.random() * (FAMILY.length - 1))) % FAMILY.length);
    this.turn = 0;
    this.turnRate = 0;
    this.out = 1;
    this.tuck.snap(0);
    this.lean.snap(0);
    this.spec.speed = SLOW;
  }

  protected idle(t: number) {
    const p = this.puppet;
    // Breathing in the shell, the head never quite still, stalks and feelers drifting.
    p.add('shell', 1.2 * sin(t, 0.25));
    p.add('head', 2 * sin(t, 0.3), 3 * sin(t, 0.11), 2 * sin(t, 0.17));
    p.add('stalk.L.1', 6 * sin(t, 0.19), 8 * sin(t, 0.13), 3 * sin(t, 0.21));
    p.add('stalk.R.1', 6 * sin(t, 0.17, 0.3), 8 * sin(t, 0.15, 0.6), 3 * sin(t, 0.23));
    p.add('stalk.L.2', 8 * sin(t, 0.3), 0, 0);
    p.add('stalk.R.2', 8 * sin(t, 0.27, 0.4), 0, 0);
    p.add('feeler.L', 8 * sin(t, 0.4), 6 * sin(t, 0.3), 0);
    p.add('feeler.R', 8 * sin(t, 0.37, 0.5), -6 * sin(t, 0.33), 0);
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    const t = this.actT;
    const act = this.act;
    this.env = env;
    this.frame = env.frame;
    const r = this.run;
    // The frame's slowness, for scaling the foot's ripple to the speed.
    this.spec.speed = act === 'race' || act === 'duel' ? 1.3 : SLOW;
    const slow = SLOW * env.frame.bot;
    const moving = clamp(this.stride / slow, 0, 5);

    // Petted: calm and warm.
    this.hover = this.hovered ? this.hover + dt : 0;
    if (this.hover > 0.9 && (act === 'idle' || act === 'glide' || act === 'sniff'))
      this.setAct('love');

    // Per-frame targets, set by whichever act is going.
    let tuck = 0;
    let out = 1;
    let outNow = false; // the stalks change at once, both ways
    const stalks: [Pair, Pair] = [
      [0, 0],
      [0, 0],
    ];
    let stalkRoll: Pair = [0, 0];
    let head: [number, number, number] = [0, 0, 0];
    let neck: Pair = [0, 0];
    let shell = 0;
    let feelers: Pair = [0, 0];
    let amp = 1; // the foot's ripple
    let expression = this.hovered ? 'happy' : 'neutral';
    this.turnRate = 0;
    const a = this.actLength;

    switch (act) {
      case 'lookTwo': {
        // The stalks look two ways at once, then swap.
        const k = ramp(t, 0, 0.6) * (1 - ramp(t, a - 0.6, a));
        const s1 = Math.sign(sin(t, 0.28)) || 1;
        const sw = ramp(Math.abs(sin(t, 0.28)), 0, 0.1);
        stalks[0] = [-8 * k, 40 * s1 * sw * k];
        stalks[1] = [10 * k, 40 * s1 * sw * k];
        stalkRoll = [8 * k * s1, -8 * k * s1];
        head = [0, 5 * sin(t, 0.28) * k, 0];
        expression = 'focused';
        break;
      }
      case 'tall': {
        // Up on the tip of the foot, neck and stalks stretched to the ceiling.
        const k = ramp(t, 0, 1.4) * (1 - ramp(t, a - 1.4, a));
        neck = [-34 * k, 20 * k];
        head = [4 * k + 4 * sin(t, 0.5) * k, 0, 0];
        out = 1 + 0.55 * k;
        stalks[0] = [-6 * k, 0];
        stalks[1] = [-6 * k, 0];
        shell = -4 * k;
        p.add('foot.1', -8 * k);
        p.shift('neck.1', 0, 0, 0);
        this.tallness = k;
        break;
      }
      case 'withdraw': {
        // In with the stalks, all the way into the shell, a rock, and a peek.
        this.tallness = 0;
        if (t < 0.4) out = 1 - t / 0.4;
        else out = 0;
        if (t < 4) tuck = t > 0.4 ? 1 : 0.2;
        else if (t < 5.7) tuck = 0.5;
        else if (t < 6.2) tuck = 1;
        else tuck = 0;
        if (t > 4.2 && t < 5.6) {
          out = ramp(t, 4.2, 5.0) * 0.8;
          head = [0, 25 * sin(t, 0.6), 0];
        }
        if (t > 6.6) out = ramp(t, 6.6, 7.6);
        shell = tuck > 0.9 ? 5 * sin(t, 1.3) * ramp(t, 0.4, 1) : 0;
        expression = tuck > 0.9 ? 'asleep' : t > 4.2 && t < 5.6 ? 'surprised' : 'neutral';
        break;
      }
      case 'race': {
        // A comically slow sprint: leaning into it, stalks streamed back, foot rippling flat out.
        const k = ramp(t, 0, 0.5);
        amp = 1.8;
        out = 1;
        stalks[0] = [-62 * k, 0];
        stalks[1] = [-62 * k, 0];
        head = [10 * k, 0, 0];
        neck = [14 * k, 0];
        shell = -6 * k;
        expression = 'focused';
        if (!this.walking && t > 1.5) this.actLength = Math.min(a, t + 1);
        break;
      }
      case 'nap': {
        tuck = 1;
        out = 0;
        shell = 1.5 * sin(t, 0.2);
        expression = 'asleep';
        break;
      }
      case 'spin': {
        // The shell spins round its hub like a wheel, with a flourish, and settles.
        const k = ramp(t, 0.3, 3.6);
        this.turnRate = 1;
        this.turn = 720 * k * k * (3 - 2 * k);
        stalks[0] = [0, 10 * sin(t, 1.2)];
        stalks[1] = [0, -10 * sin(t, 1.2)];
        head = [-6, 0, 6 * sin(t, 0.7)];
        break;
      }
      case 'polish': {
        // The neck bends up and back over the shell and the head rubs it, sparkling.
        const k = ramp(t, 0, 1) * (1 - ramp(t, a - 1, a));
        neck = [-48 * k, -30 * k];
        head = [32 * k, 26 * k * sin(t, 0.9), 0];
        feelers = [30 * k * Math.abs(sin(t, 1.8)), 0];
        stalks[0] = [30 * k, 0];
        stalks[1] = [30 * k, 0];
        shell = 3 * sin(t, 0.9) * k;
        expression = 'happy';
        this.flash = t > 1 && t < a - 1 ? t : this.flash;
        break;
      }
      case 'wave': {
        // A slow wave with one eye stalk.
        const k = ramp(t, 0, 0.8) * (1 - ramp(t, a - 0.8, a));
        const s = r.side;
        const up = s > 0 ? 0 : 1;
        stalks[up] = [-14 * k, 0];
        stalkRoll = [
          s > 0 ? (55 + 40 * sin(t, 0.9)) * k : 0,
          s < 0 ? -(55 + 40 * sin(t, 0.9)) * k : 0,
        ];
        head = [0, 0, -s * 6 * k];
        break;
      }
      case 'climb': {
        // Off to the back wall, up it a little way, and a slide back down.
        const near = this.depth > 0.85;
        if (r.phase === 0 && ((near && !this.walking) || t > 7)) {
          r.phase = 1;
          r.at = t;
        }
        if (r.phase === 1 && t - r.at > 3.6) {
          r.phase = 2;
          r.at = t;
          this.lean.kick(120);
        }
        if (r.phase === 2 && t - r.at > 1.2) r.phase = 3;
        if (r.phase === 1) {
          // Reared up, foot rippling against the wall.
          this.climbing = ramp(t - r.at, 0, 1.4) * 28;
          amp = 1.6;
          head = [-8, 0, 0];
          stalks[0] = [-14, 0];
          stalks[1] = [-14, 0];
          this.wave += dt * 5;
          expression = 'focused';
        } else if (r.phase === 2) {
          // Slipping: stalks in, the foot flat.
          this.climbing = 0;
          out = 0.2;
          outNow = true;
          expression = 'surprised';
        } else {
          this.climbing = 0;
        }
        break;
      }
      case 'sneeze': {
        // Head back... ah... choo: the stalks pop in and the shell jumps.
        if (t < 1.4) {
          const k = ramp(t, 0.1, 1.3);
          neck = [-30 * k, -10 * k];
          head = [-16 * k, 0, 0];
          stalks[0] = [-24 * k, -10 * k];
          stalks[1] = [-24 * k, 10 * k];
          feelers = [-20 * k, 0];
          expression = 'sleepy';
        } else {
          if (t - dt <= 1.4) {
            this.out = 0;
            this.tuck.kick(2.5);
            p.kick('head', 240);
            p.kick('shell', -160);
            p.kick('body', 60);
          }
          tuck = t < 2.2 ? 0.35 : 0;
          out = 1;
          expression = 'surprised';
        }
        break;
      }
      case 'greet': {
        const o = this.neighbour();
        if (o && r.phase === 0 && !this.walking && t > 1) {
          r.phase = 1;
          r.at = t;
        }
        if (r.phase === 1 && o) {
          // Stalk to stalk: both lean toward them, tips touching and wobbling.
          const w = t - r.at;
          const k = ramp(w, 0, 0.8) * (1 - ramp(t, a - 1, a));
          const s = Math.sign(o.s - this.s) || 1;
          r.side = s;
          head = [0, 30 * s * k, 0];
          stalks[0] = [-10 * k, 20 * s * k + 6 * sin(t, 1.4) * k];
          stalks[1] = [-10 * k, 20 * s * k - 6 * sin(t, 1.4) * k];
          stalkRoll = [-s * 30 * k, -s * 30 * k];
          expression = 'love';
        } else expression = 'happy';
        break;
      }
      case 'lightShow': {
        const k = ramp(t, 0, 0.8) * (1 - ramp(t, a - 0.8, a));
        this.turnRate = 1;
        this.turn = 360 * ramp(t, 1, a - 1);
        stalks[0] = [-10 * k, 20 * sin(t, 0.5)];
        stalks[1] = [-10 * k, -20 * sin(t, 0.5)];
        head = [-10 * k, 0, 8 * sin(t, 0.5) * k];
        neck = [-14 * k, 0];
        break;
      }
      case 'yawn': {
        const k = Math.sin(clamp(t / a, 0, 1) * Math.PI);
        neck = [-22 * k, -8 * k];
        head = [-26 * k, 0, 0];
        feelers = [-25 * k, 0];
        stalks[0] = [46 * k, 0];
        stalks[1] = [46 * k, 0];
        shell = 3 * k;
        expression = 'sleepy';
        break;
      }
      case 'peek': {
        // To the front lip, and a long look over it, stalks leaning out.
        if (r.phase === 0 && !this.walking && t > 1) {
          r.phase = 1;
          r.at = t;
        }
        if (r.phase === 1) {
          const w = t - r.at;
          const k = ramp(w, 0, 1) * (1 - ramp(t, a - 1, a));
          neck = [22 * k, 8 * k];
          head = [30 * k, 12 * sin(t, 0.25) * k, 0];
          stalks[0] = [40 * k + 8 * sin(t, 0.8) * k, 0];
          stalks[1] = [40 * k - 8 * sin(t, 0.8) * k, 0];
          expression = 'focused';
        }
        break;
      }
      case 'circle': {
        // A slow loop about the floor, ending where it began.
        if (!this.walking && r.n < r.stops.length - 1 && t > 1) {
          r.n++;
          this.walkTo(r.stops[r.n].s, r.stops[r.n].depth);
        }
        stalks[0] = [0, 12 * sin(t, 0.3)];
        stalks[1] = [0, -12 * sin(t, 0.3)];
        break;
      }
      case 'doze': {
        // Drooping, nodding off... and jerking awake.
        const k = ramp(t, 0, 4.4) * (t < 4.6 ? 1 : 0);
        neck = [30 * k, 6 * k];
        head = [24 * k, 0, 12 * k];
        stalks[0] = [70 * k, 0];
        stalks[1] = [70 * k, 0];
        expression = t < 4.6 ? 'sleepy' : 'surprised';
        if (t > 4.6 && t - dt <= 4.6) {
          p.kick('head', -260);
          p.kick('stalk.L.1', -300);
          p.kick('stalk.R.1', -300);
        }
        break;
      }
      case 'sniff': {
        // Head down, feelers tapping the ground.
        const k = ramp(t, 0, 0.8) * (1 - ramp(t, a - 0.8, a));
        neck = [18 * k, 10 * k];
        head = [34 * k + 4 * sin(t, 1) * k, 8 * sin(t, 0.4) * k, 0];
        feelers = [20 * k * (0.5 + 0.5 * sin(t, 3)), 20 * k * (0.5 + 0.5 * sin(t, 3, 0.5))];
        stalks[0] = [24 * k, 0];
        stalks[1] = [24 * k, 0];
        break;
      }
      case 'hiccup': {
        // A hic every three quarters of a second: everything hops and the stalks blink in.
        const u = cycle(t / 0.85);
        const i = Math.floor(t / 0.85);
        if (u < 0.05 && this.hic !== i && t < a - 0.5) {
          this.hic = i;
          this.out = 0.25;
          p.kick('body', 90);
          p.kick('head', 160);
          p.kick('shell', -110);
          this.tuck.kick(1);
        }
        expression = u < 0.25 ? 'surprised' : 'neutral';
        break;
      }
      case 'tilt': {
        const k = ramp(t, 0, 0.6) * (1 - ramp(t, a - 0.6, a));
        head = [0, 0, 20 * k];
        stalks[0] = [0, 0];
        stalks[1] = [0, 0];
        stalkRoll = [-14 * k, -14 * k];
        neck = [0, 0];
        break;
      }
      case 'bop': {
        // Bopping to a beat: the shell rocks, the head nods, the stripe flashes on each beat.
        const k = ramp(t, 0, 0.5) * (1 - ramp(t, a - 0.5, a));
        const beat = sin(t, 1.5);
        shell = 9 * beat * k;
        head = [10 * beat * k, 0, 6 * sin(t, 0.75) * k];
        neck = [4 * beat * k, 0];
        stalks[0] = [-14 * beat * k, 0];
        stalks[1] = [-14 * beat * k, 0];
        this.beat = Math.floor(t * 1.5);
        break;
      }
      case 'inchworm': {
        // The foot humps up and stretches out, hump by hump.
        amp = 2.4;
        this.humps = 1;
        break;
      }
      case 'lamp': {
        // Looks round at its own tail lamp, and blinks it on and off.
        const k = ramp(t, 0, 1) * (1 - ramp(t, a - 1, a));
        head = [0, 44 * k, 0];
        neck = [0, 24 * k];
        stalks[0] = [0, 40 * k];
        stalks[1] = [0, 40 * k];
        r.side = 1;
        break;
      }
      case 'duel': {
        // A slow race side by side: leaning in, foot flat out, a glance at the rival, a cheer at the end.
        const k = ramp(t, 0, 0.6);
        const done = !this.walking && t > 1.5;
        amp = 1.9;
        stalks[0] = [-56 * k * (done ? 0 : 1), 0];
        stalks[1] = [-56 * k * (done ? 0 : 1), 0];
        head = [8 * k, done ? 0 : 14 * sin(t, 0.3) * k, 0];
        neck = [12 * k, 0];
        shell = -5 * k;
        expression = done ? 'happy' : 'focused';
        if (done) {
          stalkRoll = [30 * sin(t, 1.6), -30 * sin(t, 1.6)];
          this.actLength = Math.min(a, t + 1.5);
        }
        break;
      }
      case 'hideSeek': {
        // All the way in, quiet... then one stalk creeps out, looks about, and pops back.
        tuck = t < 8.3 ? 1 : 0;
        out = t < 8.6 ? 0 : ramp(t, 8.6, 9.6);
        const up = ramp(t, 2.5, 3.8) * (1 - ramp(t, 6.4, 7.0));
        this.solo = up;
        const side = this.soloSide;
        const idx = side > 0 ? 0 : 1;
        stalks[idx] = [-8 * up, 22 * sin(t, 0.35) * up];
        expression = t < 2.5 || t > 7 ? 'asleep' : 'focused';
        shell = tuck > 0.9 ? 1.5 * sin(t, 0.4) : 0;
        if (t > 8.3 && t - dt <= 8.3) this.tuck.kick(-1.5);
        break;
      }
      case 'topSpin': {
        // Tucked in tight, the whole snail spins like a top, wobbles, and stops with a dizzy blink.
        const spin = ramp(t, 0.8, 3.6);
        tuck = t < 0.5 ? 0.3 : t < 4.2 ? 0.85 : 0;
        out = t < 0.4 ? 0 : t > 4.4 ? ramp(t, 4.4, 5.4) : 0;
        this.topDeg = 1080 * spin * spin * (3 - 2 * spin);
        head = [0, 0, 6 * sin(t, 1.7) * (1 - ramp(t, 3.4, 4.2)) * ramp(t, 1, 2)];
        shell = 0;
        expression = t < 3.8 ? 'surprised' : 'dizzy';
        if (t > 4.2 && t - dt <= 4.2) p.kick('head', 120);
        break;
      }
      case 'overLip': {
        // At the front lip: rears up tall and leans out over it, stalks down toward us.
        if (r.phase === 0 && !this.walking && t > 1) {
          r.phase = 1;
          r.at = t;
        }
        if (r.phase === 1) {
          const k = ramp(t - r.at, 0, 1.5) * (1 - ramp(t, a - 1.5, a));
          neck = [-26 * k, 4 * sin(t, 0.3) * k];
          head = [24 * k + 5 * sin(t, 0.5) * k, 10 * sin(t, 0.22) * k, 0];
          out = 1 + 0.5 * k;
          stalks[0] = [46 * k + 8 * sin(t, 0.7) * k, 0];
          stalks[1] = [46 * k - 8 * sin(t, 0.7) * k, 0];
          shell = -5 * k;
          p.add('foot.1', -6 * k);
          this.tallness = 0.8 * k;
          expression = 'surprised';
        }
        break;
      }
      case 'trail': {
        // Gliding on, proud of the glowing wake it leaves: head up, stalks back.
        const k = ramp(t, 0, 0.8);
        amp = 1.3;
        head = [-4 * k, 4 * sin(t, 0.25), 0];
        stalks[0] = [-16 * k, 8 * sin(t, 0.3)];
        stalks[1] = [-16 * k, -8 * sin(t, 0.3)];
        shell = -2 * k;
        expression = 'happy';
        break;
      }
      case 'bumpMate': {
        // Ambles up to a crewmate, does not stop in time: a bonk, both stalks shoot in, then a sorry nod.
        const o = this.neighbour();
        if (r.phase === 0 && !this.walking && t > 1) {
          r.phase = 1;
          r.at = t;
          this.out = 0;
          this.tuck.kick(2);
          p.kick('body', -80 * r.side);
          p.kick('shell', 90);
          p.kick('head', -140);
          if (o instanceof Snail) o.poke();
        }
        if (r.phase === 1) {
          const w = t - r.at;
          out = w < 1.6 ? 0 : ramp(w, 1.6, 3.4);
          tuck = w < 0.9 ? 0.5 : 0;
          const nod = ramp(w, 2.2, 2.6) * (1 - ramp(w, 4.4, 4.8));
          head = [16 * nod * Math.abs(sin(w, 0.9)), 0, 0];
          expression = w < 1.8 ? 'surprised' : 'sad';
        } else expression = 'neutral';
        break;
      }
      case 'droop': {
        // Both stalks sink slowly, tips hanging, the head too; a small start back to awake.
        const k = ramp(t, 0, 3.2) * (1 - ramp(t, a - 0.9, a));
        stalks[0] = [78 * k, -12 * k];
        stalks[1] = [78 * k, 12 * k];
        stalkRoll = [-30 * k, 30 * k];
        p.add('stalk.L.2', 55 * k, 0, 0);
        p.add('stalk.R.2', 55 * k, 0, 0);
        neck = [14 * k, 0];
        head = [12 * k, 0, 5 * sin(t, 0.2) * k];
        feelers = [26 * k, 26 * k];
        shell = 1.5 * sin(t, 0.25);
        expression = t > a - 0.9 ? 'surprised' : 'sleepy';
        break;
      }
      case 'poked': {
        // Stalks shot in and it has gone shy: they come out slowly.
        tuck = t < 1.5 ? 0.75 : t < 2.2 ? 0.3 : 0;
        out = t < 1.2 ? 0 : ramp(t, 1.2, a - 0.3);
        expression = t < 2.5 ? 'surprised' : 'happy';
        break;
      }
      case 'love': {
        // Petted: stalks curl in toward each other, eyes shut with pleasure, glowing.
        const k = ramp(t, 0, 0.8) * (1 - ramp(t, a - 0.8, a));
        stalks[0] = [10 * k, 0];
        stalks[1] = [10 * k, 0];
        stalkRoll = [-24 * k, -24 * k];
        head = [0, 0, 8 * sin(t, 0.6) * k];
        shell = 2 * sin(t, 0.8);
        expression = 'love';
        break;
      }
      case 'dizzy': {
        // The shell spins and the stalks circle.
        const k = ramp(t, 0, 0.5) * (1 - ramp(t, a - 1, a));
        this.turnRate = 1;
        this.turn = 900 * ramp(t, 0.2, 3.4) ** 1.2 * (t < 3.4 ? 1 : 1);
        stalks[0] = [30 * sin(t, 1.3) * k, 30 * Math.cos(t * 8.2) * k];
        stalks[1] = [30 * Math.cos(t * 8.2) * k, 30 * sin(t, 1.3, 0.25) * k];
        head = [0, 16 * sin(t, 1.1) * k, 10 * Math.cos(t * 6.9) * k];
        expression = t > 3.4 ? 'dizzy' : 'surprised';
        break;
      }
      default:
        this.tallness = 0;
        this.climbing = 0;
    }
    if (act !== 'tall' && act !== 'overLip') this.tallness = 0;
    if (act !== 'hideSeek') this.solo = 0;
    if (act !== 'topSpin') this.topDeg = 0;
    if (act !== 'climb') this.climbing = 0;
    if (act !== 'inchworm') this.humps = 0;
    if (act === 'spin' || act === 'lightShow' || act === 'dizzy') {
      // The shell settles to a whole number of turns afterward.
    } else this.turn = 0;

    // Stalks: shot in at once, out slowly.
    const outRate = act === 'withdraw' || act === 'poked' ? 3 : 0.6;
    const tucked = 1 - clamp(this.tuck.y * 1.6, 0, 1);
    if (outNow) this.out = out;
    else if (out < this.out) this.out += Math.max(out - this.out, -8 * dt);
    else this.out += Math.min(out - this.out, outRate * dt);
    const reach = this.out * tucked;

    // Into the shell: the head and neck shrink back and slide in under it.
    const k = clamp(this.tuck.update(dt, tuck), -0.1, 1.1);
    this.tuckNow = clamp(k, 0, 1);

    // The whole snail tipped back for the climb.
    const lean = this.lean.update(dt, this.climbing);
    const leanRad = (lean * Math.PI) / 180;
    p.add('root', -lean * 0.9);
    p.shift('root', 0, 0.12 * Math.sin(leanRad), 0.05 * (1 - Math.cos(leanRad)));

    // The foot's ripple, tail to head.
    const glide = this.glide.update(dt, clamp(moving, 0, 1.2));
    if (this.humps === 0) this.wave += dt * clamp(this.stride / (this.heightPx * 0.09), 0, 22);
    const w = 6 + 9 * glide * amp;
    FOOT.forEach((bone, i) => {
      const u = (5 - i) * 1.05;
      p.add(
        bone,
        w *
          0.55 *
          sin(this.wave / (2 * Math.PI), 1, -u / (2 * Math.PI)) *
          Math.min(1, glide * 2 + 0.15),
      );
    });
    p.add('neck.1', 2.5 * glide * sin(this.wave / (2 * Math.PI), 1, 0.1));
    p.add('body', 0, 0, 0);
    if (act === 'inchworm') {
      const c = t * 0.75;
      FOOT.forEach((bone, i) => p.add(bone, 18 * sin(c, 1, -i * 0.13)));
    }

    // Applying the act's targets.
    p.add('shell', shell);
    p.add('neck.1', neck[0]);
    p.add('neck.2', neck[1]);
    p.add('head', head[0], head[1], head[2]);
    p.add('feeler.L', feelers[0], 0, 0);
    p.add('feeler.R', feelers[1], 0, 0);
    p.add('stalk.L.1', stalks[0][0], stalks[0][1], stalkRoll[0]);
    p.add('stalk.R.1', stalks[1][0], stalks[1][1], stalkRoll[1]);
    // The neck hangs up over it all: everything bends with a shy shrug when tucked.
    p.add('neck.1', 12 * this.tuckNow);
    p.add('head', 10 * this.tuckNow);

    this.expression = expression as never;
    this.reachNow = reach;
    this.turnNow = this.turn;
  }

  private tallness = 0;
  private climbing = 0;
  private humps = 0;
  private hic = -1;
  private beat = -1;
  private reachNow = 1;
  private tuckNow = 0;
  private turnNow = 0;

  /** The stripe of lights, the hub and the tail lamp. */
  private lights(time: number) {
    const act = this.act;
    const t = this.actT;
    const walking = this.walking;
    const tone = this.lookName === 'colour' ? FAMILY[this.coat].light : undefined;
    this.tone = tone;
    for (let i = 0; i < STRIPE; i++) {
      let level: number;
      let colour = tone;
      if (act === 'poked') {
        level = clamp(1.8 - t, 0, 1) * (Math.sin(time * 26) > 0 ? 1 : 0.5);
        colour = BEACON.surprised;
      } else if (act === 'love') {
        level = 0.55 + 0.45 * Math.sin(time * 2.4 - i * 0.7);
        colour = BEACON.love;
      } else if (act === 'lightShow' || act === 'dizzy') {
        // A rainbow racing round the stripe, hub to mouth and back again.
        level = 1;
        colour = RAINBOW[(i + Math.floor(time * 9)) % RAINBOW.length];
        if (act === 'lightShow') level = Math.sin(time * 14 - i * 0.9) > -0.3 ? 1 : 0.15;
      } else if (act === 'bop') {
        level = cycle(time * 1.5) < 0.35 ? 1 : 0.15;
        colour = RAINBOW[(i + this.beat) % RAINBOW.length];
      } else if (act === 'polish') {
        // Sparkles where the head rubs.
        level = Math.sin(time * 19 + i * 2.1) > 0.75 ? 1 : 0.2;
        colour = '#ffffff';
      } else if (act === 'trail') {
        // The lights stream out behind: each flares at the hub end first and fades toward the mouth.
        level = 0.1 + 0.9 * Math.pow(1 - cycle(time * 0.9 - i / STRIPE), 2.4);
        colour = tone ?? '#ffffff';
      } else if (act === 'topSpin') {
        level = 0.5 + 0.5 * Math.sin(time * 18 - i * 1.05);
        colour = RAINBOW[(i + Math.floor(time * 12)) % RAINBOW.length];
      } else if (act === 'hideSeek' && this.tuckNow > 0.8) {
        level =
          0.1 + 0.08 * Math.sin(time * 0.9 + i * 0.3) + (this.solo > 0.3 && i === 5 ? 0.5 : 0);
      } else if (act === 'droop') {
        level = 0.15 + 0.15 * Math.sin(time * 0.7 + i * 0.4);
      } else if (act === 'bumpMate' && this.run.phase === 1 && t - this.run.at < 1.8) {
        level = Math.sin(time * 24) > 0 ? 1 : 0.3;
        colour = BEACON.surprised;
      } else if (act === 'race' || act === 'duel') {
        level = Math.max(0, 1 - ring(time * 5 - i / STRIPE) / 0.22);
        colour = BEACON.focused;
      } else if (act === 'nap' || act === 'doze' || (act === 'withdraw' && this.tuckNow > 0.8)) {
        level = 0.15 + 0.12 * Math.sin(time * 0.9 + i * 0.2);
      } else if (act === 'sneeze' || act === 'hiccup') {
        level = t < 1.4 && act === 'sneeze' ? 0.2 : Math.max(0, 1 - (t % 0.85) * 2.5);
        colour = BEACON.surprised;
      } else if (walking) {
        // Gliding: the light runs along the spiral toward the mouth.
        level = Math.max(0, 1 - ring(time * 0.9 - i / STRIPE) / 0.2);
      } else if (this.hovered) {
        level = 0.75 * Math.max(0, 1 - ring(time * 0.7 - i / STRIPE) / 0.25);
        colour = BEACON.happy;
      } else {
        // Idle: a slow pulse winds along the stripe now and then.
        level = 0.3 + 0.5 * Math.max(0, 1 - ring(time / 5 - i / STRIPE) / 0.12);
      }
      this.outfit.dot(i, level, colour);
    }
    // The hub breathes; the tail lamp lights the way.
    this.outfit.dot(HUB, 0.45 + 0.35 * Math.sin(time * 1.6), tone);
    let lamp = walking ? 0.9 : 0.2;
    if (act === 'trail') lamp = 0.85 + 0.15 * Math.sin(time * 5);
    if (act === 'droop' || act === 'hideSeek') lamp = 0.1;
    if (act === 'lamp')
      lamp = Math.sin(this.actT * 9) > 0 && cycle(this.actT * 0.9) < 0.6 ? 1 : 0.05;
    if (act === 'nap' || act === 'doze') lamp = 0.08;
    this.outfit.dot(LAMP, lamp, tone);
    // The stalk tips show its mood.
    const mood = this.expression;
    this.outfit.beacon(BEACON[mood] ?? BEACON.neutral!);
  }

  protected after(_dt: number, env: Env) {
    const p = this.puppet;
    this.lights(env.time);

    // The stalks: length by how far out they are; a stretched one is thinner.
    const reach = clamp(this.reachNow, 0, 1.7);
    const along = 0.1 + 0.9 * reach;
    const girth = 0.5 + 0.5 * clamp(reach, 0, 1);
    for (const s of ['L', 'R']) {
      const mine = this.solo > 0 && (s === 'L' ? 1 : -1) === this.soloSide ? this.solo : 0;
      const shown = Math.max(reach, mine);
      const along = 0.1 + 0.9 * shown;
      const girth = 0.5 + 0.5 * clamp(shown, 0, 1);
      p.stretch(`stalk.${s}.1`, along, [0, 1, 0], girth);
      p.stretch(`stalk.${s}.2`, 1, [0, 1, 0], 1);
    }
    // The neck stretches when it reaches up tall; the head and neck shrink and slide back into the shell.
    const tall = 1 + 0.5 * this.tallness;
    const k = this.tuckNow;
    const shrink = 1 - 0.62 * k;
    p.stretch('neck.1', tall * shrink, [0, 0.8, 0.6], shrink);
    p.shift('neck.1', 0, 0.02 * k, -0.135 * k);
    p.shift('shell', 0, 0, 0.035 * k);
    p.turn('shell', this.turnNow);
    if (this.topDeg) p.swing('root', this.topDeg);
    // Only this snail's marks show; the rest shrink to nothing at the hub.
    for (let n = 1; n <= 5; n++) {
      if (n - 1 !== this.coat) p.stretch(`mark.${n}`, 0.001, [0, 1, 0], 0.001);
    }
    // Inchworm: the foot stretches and squashes along its length as the humps pass.
    if (this.humps) {
      FOOT.forEach((bone, i) => {
        const w = Math.sin(this.actT * 4.7 - i * 0.9);
        p.stretch(bone, 1 + 0.18 * w, [0, 0, 1], 1);
      });
    }
  }
}
