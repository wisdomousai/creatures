import { Color, type Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Act, ANGLE, Character, clamp, type Env, envelope, type Frame } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import { Spring, wobble } from './spring';

/**
 * Grace, the robot swan: graceful, a little vain, and cute. A plump boat of layered
 * plates on big webbed paddles, a long S-curved neck in five hinged segments, and wings
 * of five overlapping feather plates that lie folded on her back, spread, flap, and rise
 * into the arched busking display. She glides along the floor as if it were water,
 * bobbing, her feet paddling underneath; now and then she runs along it slapping her
 * feet, takes off with slow big wingbeats and her neck stretched out, and lands in a skid.
 *
 * The tips of her primaries are lights, five from the body outward, and her chest brooch
 * is the beacon. They show her mood: a slow ripple out along the feathers while she
 * glides, a proud shimmer when she preens, a flash on a honk, a rainbow when giddy.
 *
 * Tricks: a neck ripple, a curtsey, a stomp, a startled flap, a proud promenade, a hiss
 * that breaks into a honk, the busking display, preening under a wing, dipping her S-neck to the water,
 * tucking her head to sleep, a slow graceful turn, a heart (with a swan beside her, or
 * with her own reflection in the floor), a honk, a hiss and a flustered waddle when
 * poked, shaking off water, a Swan Lake twirl, a runway take-off and a skidding landing,
 * gliding to the back wall to look out, admiring herself, bowing, and more.
 *
 * She watches the mouse but never follows it. Rest it on her and she draws herself up
 * proudly. Poke her and she hisses, wings up; three pokes and she goes round dizzy.
 */
export const SWAN_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.3, 0.5],
    [0.7, 0.5],
  ],
  rx: 0.08,
  ry: 0.22,
  line: 0.035,
  mouth: null,
};

const DEG = Math.PI / 180;
/** Each neck segment's lean from upright at rest (degrees, forward +): the S. */
const NECK = [51, 19, -16, -22, 20];
const SIDES = [
  ['L', 1],
  ['R', -1],
] as const;
/** Wing arm segments. */
const ARM = [1, 2, 3];
type Point = { x: number; y: number };

const smooth = (x: number) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};
/** 0 up to 1 between a and b, and back to 0 between c and d. */
const trapezoid = (t: number, a: number, b: number, c: number, d: number) =>
  smooth((t - a) / (b - a)) * (1 - smooth((t - c) / (d - c)));

export class Swan extends Character {
  // The pose layers: reset each frame, filled in by the acts, applied in pose().
  /** Extra lean of each neck segment from its rest, and its sideways bend (degrees). */
  private nd = [0, 0, 0, 0, 0];
  private ns = [0, 0, 0, 0, 0];
  /** Each wing arm segment: yaw out, roll up, pitch (degrees). */
  private wy = [0, 0, 0];
  private wr = [0, 0, 0];
  private wp = [0, 0, 0];
  private sink = 0;
  private spin = new Spring(0.9, 0.9);
  private spinTo = 0;
  private lift = new Spring(3, 0.4);
  private pokes: number[] = [];
  private flight: 'no' | 'run' | 'air' | 'skid' = 'no';
  private vel: Point = { x: 0, y: 0 };
  private route: Point[] = [];
  private landing: Point | null = null;
  private dir = 1;
  private tilt = new Spring(1.5, 0.8);
  private wagAt = -10;
  private nextWag = 3;
  private frame: Frame | null = null;
  private env: Env | null = null;
  private beaconColour = new Color('#f4f4f1');
  private honkAt = -10;
  private bowsLeft = 0;
  /** Lab hook: extra pose layers to try shapes out. */
  dbg: {
    nd?: number[];
    ns?: number[];
    wy?: number[];
    wr?: number[];
    wp?: number[];
    head?: number[];
    body?: number[];
  } | null = null;
  private exiting = false;

  constructor(model: Object3D) {
    super(
      {
        name: 'Grace',
        model: 'swan',
        metres: 0.66,
        width: 0.62,
        size: 1.1,
        feels: {
          default: { f: 3, zeta: 0.6 },
          body: { f: 2.5, zeta: 0.5 },
          'neck.1': { f: 2.6, zeta: 0.65, r: 0.6 },
          'neck.2': { f: 3, zeta: 0.6, r: 0.6 },
          'neck.3': { f: 3.4, zeta: 0.6, r: 0.6 },
          'neck.4': { f: 3.8, zeta: 0.55, r: 0.6 },
          'neck.5': { f: 4.2, zeta: 0.55, r: 0.6 },
          head: { f: 4.5, zeta: 0.5, r: 0.5 },
          jaw: { f: 9, zeta: 0.5 },
          tail: { f: 5, zeta: 0.35 },
          'wing.L.1': { f: 3.5, zeta: 0.55 },
          'wing.R.1': { f: 3.5, zeta: 0.55 },
          'wing.L.2': { f: 4.5, zeta: 0.5 },
          'wing.R.2': { f: 4.5, zeta: 0.5 },
          'wing.L.3': { f: 5.5, zeta: 0.45 },
          'wing.R.3': { f: 5.5, zeta: 0.45 },
          'leg.L': { f: 6, zeta: 0.6 },
          'leg.R': { f: 6, zeta: 0.6 },
          'foot.L': { f: 8, zeta: 0.5 },
          'foot.R': { f: 8, zeta: 0.5 },
        },
        face: SWAN_FACE,
        eyes: 0.91,
        gaze: [
          { bone: 'head', yaw: 0.55, pitch: 0.7 },
          { bone: 'neck.5', yaw: 0.25, pitch: 0.2 },
          { bone: 'neck.4', yaw: 0.15, pitch: 0.1 },
          { bone: 'body', yaw: 0.05, pitch: 0 },
        ],
        reach: { yaw: 60, pitch: 30 },
        lag: 0.8,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [50, 110],
        speed: 0.9,
        turn: 70,
      },
      model,
    );
    this.acts = this.moves();
  }

  // ---------- Pose vocabulary ----------

  /** Bend the neck: extra lean per segment from base to head (degrees, forward +). */
  private curve(...d: number[]) {
    d.forEach((x, i) => (this.nd[i] += x));
  }

  /** Bend the neck sideways (roll), per segment (degrees, + toward her right). */
  private side(...d: number[]) {
    d.forEach((x, i) => (this.ns[i] += x));
  }

  /** Both wings out to the sides (0 folded, 1 spread), raised, cupped and swept. */
  private wings(spread: number, raise = 0, cup = 0, tips = 0) {
    this.wy[0] += 88 * spread;
    this.wr[0] += raise;
    this.wr[1] += cup;
    this.wr[2] += cup * 0.8;
    this.wp[2] += tips;
  }

  /** A beat of both wings: a wave travelling out along the arm. */
  private flap(t: number, hz: number, amp: number, base = 0) {
    this.wr[0] += base + amp * sin(t, hz);
    this.wr[1] += amp * 0.55 * sin(t, hz, -0.12);
    this.wr[2] += amp * 0.45 * sin(t, hz, -0.25);
  }

  /** Neck stretched out straight ahead (flight), 0..1. */
  private reach(k: number) {
    this.curve(29 * k, 66 * k, 104 * k, 110 * k, 65 * k);
  }

  /** Neck drawn up tall and proud, 0..1. */
  private tall(k: number) {
    this.curve(-30 * k, -12 * k, 10 * k, 14 * k, -12 * k);
  }

  private wag() {
    if (this.t - this.wagAt > 1) this.wagAt = this.t;
  }

  private honk() {
    this.honkAt = this.env?.time ?? 0;
  }

  /** A nearby crewmate her own size, to make a heart with. */
  private mate(): Character | null {
    if (!this.env || !this.frame) return null;
    for (const o of this.env.crew) {
      if (o === this || o.state !== 'here' || o.edge !== this.edge || o.free) continue;
      if (o.spec.metres < 0.45 || o.spec.width < 0.4) continue;
      if (this.spaceTo(o, this.frame).n < 3.2) return o;
    }
    return null;
  }

  private glideAway(min = 1.5, max = 3.5, depth?: number) {
    const way = Math.random() < 0.5 ? -1 : 1;
    this.walkTo(this.s + way * this.heightPx * (min + Math.random() * (max - min)), depth);
  }

  // ---------- The tricks ----------

  private moves(): Record<string, Act> {
    const still = () => !this.walking && this.flight === 'no';
    return {
      idle: { weight: 3, length: [3, 6] },
      glide: {
        weight: 3,
        length: [3, 6],
        when: still,
        start: () => this.glideAway(),
      },
      float: {
        weight: 1.5,
        length: [5, 9],
        face: 'sleepy',
        when: still,
        pose: (t) => {
          // Sitting low on the water, neck relaxed, feet paddling slowly underneath.
          this.sink = 1;
          this.curve(-8, 6, 0, 8, 14);
          this.tailWag(t);
        },
      },
      busk: {
        weight: 1.2,
        length: [5, 7],
        face: 'happy',
        when: still,
        pose: (t) => {
          // The classic display: wings up in an arch over her back, neck drawn back into a
          // tight S, head tucked, and a slow rock.
          const e = smooth(t / 1.2) * smooth((this.actLength - t) / 1);
          this.wings(0.4 * e, 72 * e, 40 * e, -22 * e);
          this.wy[1] += 8 * e;
          this.curve(-24 * e, -30 * e, -12 * e, 18 * e, 52 * e);
          this.wp[0] += 6 * e;
          this.puppet.add('body', -4 * e);
          this.wr[0] += 3 * e * sin(t, 0.5);
          this.wag();
        },
      },
      preen: {
        weight: 1.6,
        length: [5, 7],
        face: 'happy',
        when: still,
        pose: (t) => {
          // Neck curls right round and down; the bill nibbles the feathers of her wing.
          const e = trapezoid(t, 0, 1, this.actLength - 1, this.actLength);
          this.wings(0, 8 * e);
          this.curve(-70 * e, -70 * e, -10 * e, 50 * e, 100 * e);
          this.side(90 * e, 60 * e, 30 * e, 20 * e, 0);
          this.puppet.add('head', 70 * e, 0, 0);
          this.puppet.add('jaw', 10 * e * Math.max(0, sin(t, 3)));
          this.puppet.add('head', 5 * e * sin(t, 3));
          if (t > this.actLength - 1) this.wag();
        },
      },
      dip: {
        weight: 1.6,
        length: [4.5, 5.5],
        when: still,
        pose: (t) => {
          // The neck's S swings down to the water for a drink, twice.
          const e = trapezoid(t, 0.2, 1.1, 1.6, 2.5) + trapezoid(t, 2.7, 3.6, 4.0, 4.9);
          this.curve(34 * e, 62 * e, 86 * e, 100 * e, 96 * e);
          this.puppet.add('head', 40 * e);
          this.puppet.add('jaw', 14 * e * Math.max(0, sin(t, 2.5)));
          this.puppet.add('body', 8 * e);
        },
      },
      nap: {
        weight: 1,
        length: [10, 16],
        face: 'asleep',
        when: still,
        pose: (t) => {
          // Head tucked under her wing, sunk low on the water, breathing.
          const e = smooth(t / 2.2) * smooth((this.actLength - t) / 1.8);
          this.sink = e;
          this.wings(0, 4 * e);
          this.curve(-70 * e, -70 * e, -10 * e, 50 * e, 100 * e);
          this.side(90 * e, 70 * e, 40 * e, 30 * e, 10 * e);
          this.puppet.add('head', 55 * e);
          this.puppet.add('body', 1.6 * sin(t, 0.22) * e);
        },
      },
      turn: {
        weight: 1.3,
        length: [5.5, 6.5],
        face: 'happy',
        when: still,
        start: () => (this.spinTo += 360 * (Math.random() < 0.5 ? 1 : -1)),
        pose: (t) => {
          // A slow, graceful turn on the spot, neck arched, head held high.
          const e = trapezoid(t, 0, 0.8, this.actLength - 1.5, this.actLength - 0.3);
          this.tall(0.6 * e);
          this.wings(0, 10 * e, 6 * e);
          this.puppet.add('foot.L', 25 * sin(t, 1.2));
          this.puppet.add('foot.R', -25 * sin(t, 1.2));
        },
      },
      heart: {
        weight: 0.9,
        length: [5, 6],
        face: 'love',
        when: still,
        pose: (t) => {
          // With a swan beside her, their necks make a heart; alone, she bends her neck
          // down to her own reflection in the floor.
          const e = trapezoid(t, 0.3, 1.5, this.actLength - 1.5, this.actLength - 0.2);
          const m = this.mate();
          if (m) {
            const side = m.s > this.s ? -1 : 1;
            this.curve(-16 * e, -10 * e, 14 * e, 30 * e, 34 * e);
            this.side(...[26, 30, 34, 36, 30].map((x) => x * e * side));
            this.puppet.add('head', 0, 0, -30 * e * side);
          } else {
            this.curve(0 * e, 30 * e, 70 * e, 120 * e, 170 * e);
            this.puppet.add('head', 80 * e);
            this.puppet.add('body', 3 * e);
          }
          this.wings(0, 16 * e, 10 * e);
          this.wr[0] += 3 * e * sin(t, 1.2);
          this.honkAt = -10;
        },
      },
      honk: {
        weight: 1.3,
        length: [2.2, 2.6],
        face: 'surprised',
        when: still,
        start: () => this.honk(),
        pose: (t) => {
          // Neck up and out, bill wide, wings flicking; twice.
          const b = trapezoid(t, 0.1, 0.25, 0.5, 0.7) + trapezoid(t, 1.0, 1.15, 1.4, 1.6);
          this.tall(0.9 * b);
          this.curve(0, 0, 0, 0, 30 * b);
          this.puppet.add('jaw', 55 * b);
          this.puppet.add('head', -14 * b);
          this.wings(0.25 * b, 30 * b, 10 * b);
          if (t > 0.9 && t < 1.0) this.honk();
        },
      },
      shake: {
        weight: 1.2,
        length: [2, 2.4],
        face: 'happy',
        when: still,
        pose: (t) => {
          // Shaking the water off: the whole boat shimmies, wings loose, neck whipping.
          const e = trapezoid(t, 0.1, 0.3, this.actLength - 0.6, this.actLength);
          const w = sin(t, 6);
          this.puppet.add('body', 0, 12 * e * w, 3 * e * w);
          this.puppet.add('tail', 0, 20 * e * w);
          this.wings(0.1 * e, 22 * e + 14 * e * w, 10 * e);
          this.side(...[3, 6, 10, 14, 18].map((x) => x * e * sin(t, 6, -0.15)));
          this.curve(0, 0, 0, 0, 8 * e * w);
        },
      },
      ballet: {
        weight: 0.8,
        length: [7, 8],
        face: 'happy',
        when: still,
        start: () => (this.spinTo += 720),
        pose: (t) => {
          // Swan Lake: wings sweeping up like arms, neck arched, tiny steps, a twirl.
          const e = trapezoid(t, 0, 1.2, this.actLength - 2.2, this.actLength - 0.4);
          const u = t / 2;
          this.wings(0.42 * e, 40 * e + 12 * e * sin(t, 0.6), 16 * e);
          this.wr[2] += 18 * e;
          this.curve(-10 * e, -18 * e, 8 * e, 24 * e, 44 * e);
          this.side(...[10, 8, 6, 4, 2].map((x) => x * e * sin(u, 0.5)));
          this.puppet.add('foot.L', 40 * e * Math.max(0, sin(t, 2)));
          this.puppet.add('foot.R', 40 * e * Math.max(0, -sin(t, 2)));
          this.puppet.add('leg.L', 10 * e * sin(t, 2));
          this.puppet.add('leg.R', -10 * e * sin(t, 2));
          this.lift.kick(0);
          this.puppet.shift('root', 0, 0.012 * e * Math.abs(sin(t, 2)), 0);
        },
      },
      bow: {
        weight: 1,
        length: [3.5, 4],
        face: 'happy',
        when: still,
        pose: (t) => {
          // A deep bow with her wings lifted behind her, held, then up again.
          const e = trapezoid(t, 0.1, 1.2, 2.4, 3.4);
          this.curve(38 * e, 60 * e, 96 * e, 110 * e, 100 * e);
          this.wings(0, 24 * e, 8 * e, 14 * e);
          this.puppet.add('body', 10 * e);
          this.puppet.add('tail', -12 * e);
        },
      },
      admire: {
        weight: 1.3,
        length: [5, 6],
        face: 'wink',
        when: still,
        pose: (t) => {
          // Vain: leans down to look at herself in the floor, tilting her head this way
          // and that, fluffing her feathers.
          const e = trapezoid(t, 0.2, 1.2, this.actLength - 1.2, this.actLength - 0.2);
          this.curve(26 * e, 46 * e, 58 * e, 58 * e, 56 * e);
          this.puppet.add('head', 0, 22 * e * sin(t, 0.5), 22 * e * sin(t, 0.5, 0.25));
          this.wings(0, 12 * e + 6 * e * sin(t, 1.2), 5 * e);
          if (t > this.actLength - 1.2) this.wag();
        },
      },
      wingstretch: {
        weight: 1,
        length: [3.5, 4],
        when: still,
        pose: (t) => {
          // One wing stretched out long behind her, the leg out with it, like a yawn.
          const e = trapezoid(t, 0.2, 1, 2.5, 3.3);
          this.wy[0] += 0;
          const sg = this.near === 'L' ? 1 : -1;
          this.puppet.add(`wing.${this.near}.1`, 0, -sg * 84 * e, sg * 8 * e);
          this.puppet.add(`wing.${this.near}.2`, 0, 0, sg * 10 * e);
          this.puppet.add(`wing.${this.near}.3`, 0, 0, sg * 8 * e);
          this.puppet.add('body', 0, 0, -6 * e * sg);
          this.puppet.add(`foot.${this.near}`, -25 * e);
          this.curve(0, 6 * e, 12 * e, 12 * e, 6 * e);
          this.side(-8 * e, -8 * e, -6 * e, -4 * e, 0);
        },
      },
      peck: {
        weight: 1,
        length: [3, 3.6],
        face: 'focused',
        when: still,
        pose: (t) => {
          // Something on the floor has caught her eye: a quick series of pecks.
          const e = trapezoid(t, 0.1, 0.5, this.actLength - 0.6, this.actLength - 0.1);
          const jab = Math.max(0, sin(t, 1.6)) ** 2;
          this.curve(20 * e, 38 * e, 56 * e, 64 * e, 50 * e);
          this.curve(4 * jab * e, 12 * jab * e, 20 * jab * e, 22 * jab * e, 18 * jab * e);
          this.puppet.add('jaw', 12 * jab * e);
        },
      },
      tail: {
        weight: 0.9,
        length: [3, 4],
        face: 'happy',
        when: still,
        pose: (t) => {
          // Fussing over her tail: a look back over her shoulder, and a wag.
          const e = trapezoid(t, 0.2, 1.2, this.actLength - 1, this.actLength);
          this.curve(-40 * e, -50 * e, -20 * e, 20 * e, 50 * e);
          this.side(-40 * e, -34 * e, -22 * e, -10 * e, 0);
          this.puppet.add('head', 10 * e);
          this.puppet.add('tail', 0, 26 * e * sin(t, 3));
        },
      },
      wave: {
        weight: 0.9,
        length: [3, 3.6],
        face: 'happy',
        when: still,
        pose: (t) => {
          // A wing lifted and waved hello.
          const e = trapezoid(t, 0.1, 0.8, this.actLength - 0.8, this.actLength - 0.1);
          const sg = this.near === 'L' ? 1 : -1;
          this.puppet.add(`wing.${this.near}.1`, 0, -sg * 84 * e * 0.4, sg * 70 * e);
          this.puppet.add(`wing.${this.near}.2`, 0, 0, sg * 20 * e * sin(t, 2));
          this.puppet.add(`wing.${this.near}.3`, 0, 0, sg * 20 * e * sin(t, 2, -0.15));
          this.puppet.add('body', 0, 0, 5 * e);
          this.curve(0, 4 * e, 6 * e, 4 * e, 0);
          this.puppet.add('head', 0, 0, 8 * e * sin(t, 1));
        },
      },
      vogue: {
        weight: 0.9,
        length: [4, 5],
        face: 'wink',
        when: still,
        pose: (t) => {
          // A pose: chin up, chest out, neck drawn tall, head turned just so.
          const e = trapezoid(t, 0.1, 1.0, this.actLength - 1, this.actLength);
          this.tall(1 * e);
          this.puppet.add('head', -20 * e, 28 * e * (t < this.actLength / 2 ? 1 : -1), 0);
          this.puppet.add('body', -8 * e);
          this.wings(0, 6 * e, 4 * e);
          this.puppet.add('leg.L', 8 * e);
          this.puppet.add('foot.L', 14 * e);
        },
      },
      yawn: {
        weight: 0.8,
        length: [3, 3.4],
        face: 'sleepy',
        when: still,
        pose: (t) => {
          const e = trapezoid(t, 0.2, 1, 1.8, 2.8);
          this.tall(0.7 * e);
          this.curve(0, 0, 0, 0, 26 * e);
          this.puppet.add('jaw', 46 * e);
          this.puppet.add('head', -22 * e);
          this.wings(0, 12 * e, 6 * e);
        },
      },
      ripple: {
        weight: 1.1,
        length: [3.5, 4.2],
        face: 'happy',
        when: still,
        pose: (t) => {
          // A wave runs up her neck from the chest to the bill, twice, feathers shivering.
          const e = trapezoid(t, 0.2, 0.8, this.actLength - 0.8, this.actLength - 0.1);
          this.tall(0.5 * e);
          this.curve(...[0, 1, 2, 3, 4].map((i) => 24 * e * sin(t, 0.9, -i * 0.13)));
          this.puppet.add('head', 10 * e * sin(t, 0.9, -0.7));
          this.wr[0] += 6 * e * sin(t, 0.9, -0.3);
          this.wr[1] += 5 * e * sin(t, 0.9, -0.45);
          this.wr[2] += 4 * e * sin(t, 0.9, -0.6);
        },
      },
      curtsey: {
        weight: 0.9,
        length: [3.4, 3.8],
        face: 'happy',
        when: still,
        pose: (t) => {
          // Sinks low on bent legs, wings held out like a skirt, head dipped, then rises.
          const e = trapezoid(t, 0.1, 1.0, 2.2, 3.2);
          this.sink = 1.4 * e;
          this.wings(0.3 * e, 18 * e, 22 * e, 6 * e);
          this.curve(20 * e, 24 * e, 20 * e, 24 * e, 30 * e);
          this.puppet.add('leg.L', 14 * e);
          this.puppet.add('leg.R', -6 * e);
          this.puppet.add('foot.L', -12 * e);
          this.puppet.add('body', 5 * e);
          if (t > 2.4 && t < 2.5) this.wag();
        },
      },
      stomp: {
        weight: 0.8,
        length: [3, 3.6],
        face: 'cross',
        when: still,
        pose: (t) => {
          // A huff: stamps her big paddles one after the other, wings tight, bill down.
          const e = trapezoid(t, 0.1, 0.4, this.actLength - 0.6, this.actLength);
          const l = Math.max(0, sin(t, 2.2)) ** 2;
          const r = Math.max(0, -sin(t, 2.2)) ** 2;
          this.puppet.add('leg.L', -26 * l * e);
          this.puppet.add('leg.R', -26 * r * e);
          this.puppet.add('foot.L', 30 * l * e);
          this.puppet.add('foot.R', 30 * r * e);
          this.puppet.add('body', 0, 0, 5 * e * sin(t, 1.1));
          this.puppet.add('body', 4 * e);
          this.curve(6 * e, 14 * e, 22 * e, 24 * e, 26 * e);
          this.wings(0, 22 * e, -6 * e);
        },
      },
      startle: {
        weight: 0.7,
        length: [2, 2.4],
        face: 'surprised',
        when: still,
        start: () => {
          this.lift.kick(1.6);
          this.honk();
        },
        pose: (t) => {
          // Something made her jump: neck shoots up, wings burst open and flap hard.
          const e = trapezoid(t, 0, 0.12, this.actLength - 0.9, this.actLength);
          this.tall(1 * e);
          this.wings(0.9 * e, 20 * e, 10 * e);
          this.flap(t, 4, 26 * e, 6 * e);
          this.puppet.add('body', -8 * e);
          this.puppet.add('tail', -14 * e);
          this.puppet.add('foot.L', 22 * e);
          this.puppet.add('foot.R', 22 * e);
        },
      },
      promenade: {
        weight: 1.1,
        length: [6, 9],
        face: 'happy',
        when: still,
        start: () => this.glideAway(2, 3.5),
        pose: (t) => {
          // A proud walk: neck drawn tall, chest out, head turning to be admired.
          const e = smooth(t / 0.8);
          this.tall(0.9 * e);
          this.wings(0, 5 * e, 4 * e);
          this.puppet.add('body', -5 * e);
          this.puppet.add('head', 0, 14 * e * sin(t, 0.4), 0);
          if (t > 0.5) this.wag();
        },
      },
      hisshonk: {
        weight: 0.8,
        length: [4, 4.6],
        face: 'cross',
        when: still,
        pose: (t) => {
          // The busk display's threat: wings arched high, neck low, a hiss that breaks
          // into a big honk.
          const e = trapezoid(t, 0.1, 0.8, this.actLength - 0.9, this.actLength);
          const honking = t > 2.0 && t < 2.9;
          this.wings(0.5 * e, 66 * e, 30 * e, -12 * e);
          if (honking) {
            this.tall(0.9);
            this.curve(0, 0, 0, 0, 30);
            this.puppet.add('jaw', 55);
            this.puppet.add('head', -14);
            if (t < 2.1) this.honk();
          } else {
            this.curve(40 * e, 74 * e, 100 * e, 100 * e, 40 * e);
            this.puppet.add('jaw', 26 * e * (1 + sin(t, 7)) * 0.5);
            this.puppet.add('body', 6 * e);
          }
        },
      },
      // Places to go on the floor
      backwall: {
        weight: 1.2,
        length: [10, 12],
        when: still,
        start: () => this.walkTo(this.s + (Math.random() - 0.5) * this.heightPx * 2, 0.92),
        pose: (t) => {
          // Glides to the back wall, turns, and looks out at us, neck raised.
          const arrived = t > 4.5 && !this.walking;
          if (arrived && this.depthGoal > 0.5 && t < this.actLength - 4) {
            this.front = true;
            this.tall(0.5);
            this.puppet.add('head', 6 * sin(t, 0.3), 12 * sin(t, 0.2));
          }
          if (t > this.actLength - 4.5 && this.depthGoal > 0.5) this.walkTo(this.s, 0.25);
        },
      },
      frontlook: {
        weight: 1,
        length: [10, 12],
        when: still,
        start: () => this.walkTo(this.s + (Math.random() - 0.5) * this.heightPx * 2, 0),
        pose: (t) => {
          // Right up to the front lip to look over it: neck bent down and forward.
          if (t > 3.5 && this.depthGoal < 0.05 && t < this.actLength - 3) {
            this.curve(16, 30, 30, 20, -10);
            this.puppet.add('head', 14 * sin(t, 0.35), 18 * sin(t, 0.2));
          }
          if (t > this.actLength - 3.5 && this.depthGoal < 0.05) this.walkTo(this.s, 0.2);
        },
      },
      fly: {
        weight: 0.7,
        // Ends when she lands.
        length: [120, 120],
        face: 'happy',
        when: still,
        start: () => this.startRun(),
      },
      skid: { weight: 0, length: [4, 4], face: 'surprised' },
      // Reactions
      hiss: {
        weight: 0,
        length: [1.6, 1.8],
        face: 'cross',
        start: () => {
          this.goal = null;
          this.lift.kick(1.2);
        },
        pose: (t) => {
          // Wings up and out, neck low and forward, bill open.
          const e = trapezoid(t, 0, 0.15, this.actLength - 0.5, this.actLength);
          this.wings(0.5 * e, 55 * e, 20 * e);
          this.curve(46 * e, 80 * e, 110 * e, 108 * e, 40 * e);
          this.puppet.add('jaw', 34 * e);
          this.puppet.add('body', 6 * e);
          this.wr[0] += 4 * e * sin(t, 8);
        },
      },
      flustered: {
        weight: 0,
        length: [2.4, 2.8],
        face: 'surprised',
        start: () => this.glideAway(1, 1.8),
        pose: (t) => {
          // A quick waddle away, wings fluttering, neck bobbing.
          const e = trapezoid(t, 0, 0.2, this.actLength - 0.5, this.actLength);
          this.wings(0.1 * e, 10 * e + 16 * e * sin(t, 4), 8 * e);
          this.curve(0, 6 * e, 10 * e * sin(t, 3), 8 * e, 0);
        },
      },
      happy: {
        weight: 0,
        length: [2.4, 2.8],
        face: 'happy',
        start: () => this.wag(),
        pose: (t) => {
          const e = trapezoid(t, 0, 0.5, this.actLength - 0.7, this.actLength);
          this.tall(0.6 * e);
          this.wings(0, 20 * e, 10 * e);
        },
      },
      dizzy: {
        weight: 0,
        length: [3.4, 3.8],
        face: 'dizzy',
        start: () => (this.spinTo += 540),
        pose: (t) => {
          const e = trapezoid(t, 0, 0.3, this.actLength - 0.8, this.actLength);
          this.curve(...[0, 1, 2, 3, 4].map((i) => 10 * e * sin(t, 1.3, -i * 0.12)));
          this.side(...[0, 1, 2, 3, 4].map((i) => 30 * e * sin(t, 1.7, -i * 0.15)));
          this.wings(0.15 * e, 15 * e, 6 * e);
        },
      },
    };
  }

  private tailWag(t: number) {
    this.puppet.add('tail', 0, 8 * sin(t, 0.6));
  }

  // ---------- Reactions ----------

  poke() {
    if (this.state !== 'here' || this.flight === 'air') return;
    if (this.flight === 'run') this.flight = 'no';
    const now = performance.now() / 1000;
    this.pokes = [...this.pokes.filter((at) => now - at < 2.5), now];
    if (this.pokes.length >= 3) {
      this.pokes = [];
      this.setAct('dizzy');
    } else if (this.act === 'hiss') this.setAct('flustered');
    else this.setAct('hiss');
    if (this.act === 'hiss') this.honk();
  }

  leave() {
    if (this.flight === 'air' && this.state === 'here') this.exiting = true;
    else super.leave();
  }

  protected onEnter() {
    this.flight = 'no';
    this.free = null;
    this.exiting = false;
    this.spinTo = 0;
    this.spin.snap(0);
  }

  // ---------- Flying ----------

  /** A run along the floor, wings out, feet slapping, then up into the air. */
  private startRun() {
    if (!this.frame) return;
    const [lo, hi] = this.span(this.frame);
    this.dir = this.s - lo > hi - this.s ? -1 : 1;
    this.flight = 'run';
    this.walkTo(this.s + this.dir * this.heightPx * 2.8, Math.min(this.depth, 0.5));
  }

  private takeOff(env: Env) {
    const f = env.frame;
    const H = this.heightPx;
    const at = this.frontFoot(f);
    this.free = { x: at.x, y: at.y, tilt: 0 };
    this.tilt.snap(0);
    this.vel = { x: this.dir * H * 3.2, y: -H * 1.2 };
    this.flight = 'air';
    this.goal = null;
    const W = f.right - f.left;
    const V = f.bottom - f.top;
    // Out and up, a long sweep across the page, and down to a clear place on the floor.
    const w = this.widthPx();
    const lx = f.left + w * 1.5 + Math.random() * Math.max(0, W - w * 3);
    this.landing = { x: lx, y: f.bottom };
    this.dir = lx > at.x ? 1 : -1;
    const cruise = f.top + V * (0.3 + 0.3 * Math.random());
    this.route = [
      { x: at.x + this.dir * H * 2.5, y: Math.min(at.y - H * 1.6, cruise + H) },
      { x: (at.x + lx) / 2, y: cruise },
      { x: lx - this.dir * H * 3, y: f.bottom - H * 1.8 },
      { x: lx, y: f.bottom },
    ];
    this.depthGoal = 0.3 + Math.random() * 0.5;
  }

  private touchDown() {
    const pos = this.free!;
    this.s = pos.x;
    this.h = 0;
    this.free = null;
    this.flight = 'skid';
    this.route = [];
    this.landing = null;
    this.depthGoal = this.depth;
    // Down with a skid: the speed carries her on, feet out in front.
    this.pace = this.vel.x * 0.9;
    this.walkTo(this.s + this.dir * this.heightPx * 1.6, this.depth);
    this.lift.kick(-1.5);
    this.vel = { x: 0, y: 0 };
    this.setAct('skid');
  }

  protected move(dt: number, env: Env) {
    this.frame = env.frame;
    this.env = env;
    if (this.flight !== 'air') {
      this.spec.speed = this.flight === 'run' ? 3 : this.act === 'flustered' ? 1.8 : 0.9;
      super.move(dt, env);
      if (this.flight === 'run' && (this.goal === null || this.actT > 3.5)) this.takeOff(env);
      if (this.flight === 'skid' && (this.goal === null || this.actT > 2.5)) this.finishSkid();
      return;
    }
    const pos = this.free!;
    const H = this.heightPx;
    const maxSpeed = Math.max(H * 5, 260);
    const maxAcc = maxSpeed * 2.4;
    const target = this.route[0];
    const last = this.route.length === 1;
    let ax = 0;
    let ay = 0;
    if (target) {
      const dx = target.x - pos.x;
      const dy = target.y - pos.y;
      const dist = Math.hypot(dx, dy);
      if (dist < (last ? 2 : H * 1.0)) {
        this.route.shift();
        if (!this.route.length) return this.touchDown();
      } else {
        const speed = last ? Math.min(maxSpeed, dist * 1.6 + 30) : maxSpeed;
        ax = ((dx / dist) * speed - this.vel.x) * 2.6;
        ay = ((dy / dist) * speed - this.vel.y) * 2.6;
      }
    }
    const a = Math.hypot(ax, ay);
    if (a > maxAcc) [ax, ay] = [(ax / a) * maxAcc, (ay / a) * maxAcc];
    this.vel.x += ax * dt;
    this.vel.y += ay * dt;
    pos.x += this.vel.x * dt;
    pos.y += this.vel.y * dt;
    if (Math.abs(this.vel.x) > maxSpeed * 0.15) this.dir = Math.sign(this.vel.x);
    // Banking into the way she goes, nose up a touch when climbing.
    const bank = this.tilt.update(
      dt,
      clamp(-this.vel.x / maxSpeed, -1, 1) * 0.16 +
        clamp(this.vel.y / maxSpeed, -1, 1) * 0.05 * -this.dir,
    );
    pos.tilt = bank;
    this.heading.update(dt, this.dir * (last ? 40 : 58));
  }

  private finishSkid() {
    this.flight = 'no';
    this.goal = null;
    this.setAct('idle');
    if (this.exiting) {
      this.exiting = false;
      super.leave();
    }
  }

  // ---------- Posing ----------

  protected idle(t: number) {
    this.nd.fill(0);
    this.ns.fill(0);
    this.wy.fill(0);
    this.wr.fill(0);
    this.wp.fill(0);
    this.sink = 0;
    this.front = false;
    const p = this.puppet;
    p.add('body', 1.2 * sin(t, 0.28));
    // The neck swaying a little, each segment a beat behind the last.
    for (let i = 0; i < 5; i++) {
      this.nd[i] += 1.6 * sin(t, 0.24, -i * 0.08);
      this.ns[i] += 1.3 * sin(t, 0.17, -i * 0.1);
    }
    p.add('head', 2 * sin(t, 0.31), 0, 2 * sin(t, 0.21));
    // A feather ripple now and then; the tail's little wag.
    this.wr[0] += 0.8 * sin(t, 0.3);
    if (t > this.nextWag) {
      this.nextWag = t + 6 + Math.random() * 8;
      if (!this.walking) this.wag();
    }
  }

  protected pose(dt: number, env: Env) {
    this.frame = env.frame;
    this.env = env;
    const p = this.puppet;
    const act = this.act;
    const flying = this.flight === 'air';
    const running = this.flight === 'run';
    const skidding = this.flight === 'skid';

    // Gliding: a smooth bobbing paddle-walk, feet paddling, neck a little forward.
    const moving = clamp(this.stride / (this.heightPx * 0.9), 0, 1.4);
    if (moving > 0.05 && !flying) {
      const step = Math.sin(this.gait * 0.8);
      const fast = running ? 2.2 : 1;
      p.add('leg.L', 12 * step * moving);
      p.add('leg.R', -12 * step * moving);
      p.add('foot.L', 34 * step * moving * fast);
      p.add('foot.R', -34 * step * moving * fast);
      p.add('body', 0, 0, 2.5 * step * moving);
      p.add('body', -3 * moving * Math.cos(this.gait * 1.6));
      this.curve(4 * moving, 8 * moving, 8 * moving, 4 * moving, -6 * moving);
      this.side(...[1, 2, 3, 3, 2].map((x) => x * moving * step * 0.8));
      p.shift('root', 0, 0.006 * moving * Math.sin(this.gait * 1.6), 0);
      if (!running && !skidding) this.wings(0, 1.5 * moving);
    }

    if (running) {
      // Running for take-off: neck out, wings beating, feet slapping.
      const k = smooth(this.actT / 1.2);
      this.reach(0.6 * k);
      this.wings(0.85 * k, 0);
      this.flap(this.actT, 1.8, 30 * k, 12 * k);
      p.add('body', -10 * k);
      this.honk();
    }

    if (flying) {
      // Slow, big wingbeats, neck stretched out, feet trailing.
      this.reach(1);
      this.wings(1, 0);
      this.flap(this.env!.time, 0.95, 42, 6);
      p.add('leg.L', -30 + 6 * sin(this.t, 0.95));
      p.add('leg.R', -30 + 6 * sin(this.t, 0.95, 0.1));
      p.add('foot.L', -40);
      p.add('foot.R', -40);
      p.add('body', 6 * sin(this.t, 0.95, -0.2) - 4);
      p.add('tail', -10);
      // Nose up as she climbs.
      p.add('head', -18);
      const up = clamp(-this.vel.y / (this.heightPx * 5), -1, 1);
      p.add('body', -12 * up);
    }

    if (skidding) {
      // Landing: wings flared back and up, feet out in front, neck up and back.
      const k = clamp(1 - this.actT / 2.2, 0, 1);
      this.wings(0.9 * k, 30 * k);
      this.flap(this.actT, 2, 14 * k, 0);
      this.tall(0.8 * k);
      p.add('foot.L', 40 * k);
      p.add('foot.R', 40 * k);
      p.add('leg.L', 20 * k);
      p.add('leg.R', 20 * k);
      p.add('body', -10 * k);
    }

    // Mood.
    const near =
      env.pointer.present &&
      env.time - env.pointer.at < 1.5 &&
      Math.hypot(
        env.pointer.x - this.eyePoint(env.frame).x,
        env.pointer.y - this.eyePoint(env.frame).y,
      ) <
        this.heightPx * 6;
    if (this.hovered && act === 'idle') this.setAct('happy');
    if (this.hovered && !this.acts[act]?.face) {
      this.tall(0.35);
      this.wings(0, 8, 5);
    } else if (near && act === 'idle') this.curve(0, 2, 4, 3, -4);
    this.expression = this.hovered ? 'happy' : 'neutral';

    // The head keeps the bill level whatever the neck does.
    p.add('head', -0.8 * this.nd[4]);
    const d = this.dbg;
    if (d) {
      d.nd?.forEach((x, i) => (this.nd[i] += x));
      d.ns?.forEach((x, i) => (this.ns[i] += x));
      d.wy?.forEach((x, i) => (this.wy[i] += x));
      d.wr?.forEach((x, i) => (this.wr[i] += x));
      d.wp?.forEach((x, i) => (this.wp[i] += x));
      if (d.head) p.add('head', ...(d.head as [number, number, number]));
      if (d.body) p.add('body', ...(d.body as [number, number, number]));
    }
    // Wings and neck applied.
    for (const [sfx, sg] of SIDES) {
      ARM.forEach((k, i) => {
        p.add(
          `wing.${sfx}.${k}`,
          this.wp[i],
          -sg * (i ? this.wy[i] * 0.4 : this.wy[0]),
          sg * this.wr[i],
        );
      });
    }
    for (let i = 0; i < 5; i++)
      p.add(
        `neck.${i + 1}`,
        this.nd[i] - (this.nd[i - 1] ?? 0),
        0,
        this.ns[i] - (this.ns[i - 1] ?? 0),
      );
    // The neck's lift and settle on the water; tail wag.
    p.shift('body', 0, -0.03 * this.sinkNow(dt), 0);
    p.shift('root', 0, Math.max(0, this.lift.update(dt, 0)) * 0.02, 0);
    const w = this.t - this.wagAt;
    if (w < 1) p.add('tail', 0, 22 * sin(w, 5) * (1 - w));
    // Standing side-on toward the middle of the frame, so her S-neck shows in profile.
    const middle = (env.frame.left + env.frame.right) / 2;
    const face = this.walking || flying || this.front ? 0 : Math.sign(middle - this.s || 1) * 62;
    const yaw = this.aside.update(dt, face);
    if (face) this.near = face > 0 ? 'R' : 'L';
    p.add('root', 0, yaw);
    p.add('head', 0, -yaw * 0.55);
    // A slow turn, or a spin.
    this.spinNow = this.spin.update(dt, this.spinTo);
  }

  private aside = new Spring(0.8, 0.8);
  /** Turned to face us (at the back wall, looking out). */
  private front = false;
  /** Which wing is toward us while she stands side-on. */
  private near: 'L' | 'R' = 'L';
  private sinkSpring = new Spring(2, 0.7);
  private spinNow = 0;
  private sinkNow(dt: number) {
    return this.sinkSpring.update(dt, this.sink);
  }

  /** Lights, the brooch and the turning. */
  protected after(dt: number, env: Env) {
    const t = env.time;
    const act = this.act;
    const at = this.actT;
    // Whole-body turns from the spin spring (kept within a full turn once settled).
    this.pivot.rotation.y = this.spinNow * DEG;
    if (Math.abs(this.spinNow - this.spinTo) < 0.5 && Math.abs(this.spinTo) >= 360) {
      this.spinTo %= 360;
      this.spin.snap(this.spinTo);
    }
    if (this.free) this.pivot.rotation.y = 0;

    for (let i = 0; i < 5; i++) {
      let level: number;
      let tone: string | undefined;
      const wave = (period: number, spread = 0.12) => {
        const x = (((t / period - i * spread) % 1) + 1) % 1;
        return Math.max(0, 1 - Math.abs(x) / 0.2);
      };
      if (act === 'hiss' || act === 'hisshonk' || act === 'stomp') {
        level = Math.sin(t * 24) > 0 ? 1 : 0.3;
        tone = BEACON.sad;
      } else if (this.flight === 'air' || this.flight === 'run') {
        level = Math.max(0, Math.cos(t * 6 - i * 0.9)) * 0.9 + 0.1;
        tone = RAINBOW[(i + Math.floor(t * 4)) % RAINBOW.length];
      } else if (act === 'dizzy' || act === 'flustered') {
        level = Math.sin(t * 8 + i * 2.3) > 0 ? 1 : 0.15;
        tone = RAINBOW[(i * 3 + Math.floor(t * 4)) % RAINBOW.length];
      } else if (act === 'nap' || act === 'float') {
        level = 0.16 + 0.14 * Math.sin(t * 0.9);
      } else if (act === 'busk' || act === 'ballet' || act === 'ripple' || act === 'promenade') {
        level = 0.4 + 0.6 * Math.max(0, Math.sin(t * 4 - i * 0.8));
        tone = BEACON.happy;
      } else if (act === 'heart') {
        level = 0.55 + 0.45 * Math.sin(t * 2.4 - i * 0.6);
        tone = BEACON.love;
      } else if (t - this.honkAt < 0.6) {
        level = 1 - (t - this.honkAt) / 0.8;
        tone = BEACON.happy;
      } else if (act === 'preen' || act === 'admire' || act === 'vogue' || this.hovered) {
        level = 0.5 + 0.5 * wave(1.2, 0.16);
        tone = BEACON.happy;
      } else if (this.walking) {
        level = 0.75 * wave(1.6);
      } else {
        level = 0.7 * wave(4);
      }
      this.outfit.dot(i, level, tone);
    }
    // The brooch shows her mood.
    const mood = this.face?.expression ?? 'neutral';
    let target: string;
    if (mood === 'dizzy') target = RAINBOW[Math.floor(t * 6) % RAINBOW.length];
    else if (mood === 'asleep') target = Math.sin(t * 1.4) > 0 ? '#55554f' : '#8a8a84';
    else if (mood === 'cross') target = '#ff5f5f';
    else target = BEACON[mood] ?? '#f4f4f1';
    if (t - this.honkAt < 0.5) target = '#ffb347';
    this.beaconColour.lerp(new Color(target), Math.min(1, dt * 5));
    this.outfit.beacon(this.beaconColour);
    void wobble;
    void ANGLE;
    void envelope;
  }
}
