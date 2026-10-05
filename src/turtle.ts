import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Act, Character, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import { Spring } from './spring';

/**
 * Flip, the robot sea turtle: a flat shell of little hexagonal plates with a lit seam
 * between every one, a big round head with a screen face, and four paddle flippers. On the
 * floor of the box she is endearingly clumsy: she rows along with both front flippers at
 * once and the body slides forward in lurches, then rests before the next stroke. Now and
 * then she takes to the water instead: she lifts off the floor and swims through the air of
 * the box with slow, graceful strokes and a gentle bob, over the others' heads, up to the
 * ceiling for a breath, down to the back wall and out to the front lip.
 *
 * The shell's seams are the lights, five bands from head to tail plus a lamp on her tail:
 * a pulse runs down them with each stroke as she swims, a slow ripple ticks along them
 * as she rows, they breathe dimly while she naps and flash when she sneezes.
 *
 * Tricks: rowing, swimming across, a swim loop, gliding, a slow barrel roll, surfacing for
 * a breath (a bubble on her screen), a flipper wave, a sleepy drift, riding a current, a
 * happy spin, a startled tuck, a nap on the floor, a sneeze of bubbles, digging sand, a
 * clap, following a crewmate, peering over the front lip, peeking from the back wall,
 * treading water, a yawn, shaking off the water, a hop for joy, a figure eight, a dive
 * to the floor, a stumble and a flop, a shy flipper-wiggle.
 *
 * She watches the mouse with her eyes and then her head. A poke and she tucks her head and
 * flippers in and peeks out again; three quick pokes and she spins dizzy. Rest the mouse on
 * her and she rises a little, her flippers fluttering, all hearts.
 */
export const TURTLE_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.29, 0.46],
    [0.71, 0.46],
  ],
  rx: 0.11,
  ry: 0.3,
  line: 0.036,
  mouth: [0.5, 0.82],
};

const SIDES = [
  ['L', 1],
  ['R', -1],
] as const;
const DEG = 180 / Math.PI;
const PUFFS = 6;
/** Bands of shell-seam lights, head to tail (Dot0..Dot4), and the tail lamp (Dot5). */
const BANDS = 5;

const ease = (t: number, a: number, b: number) => {
  const u = clamp((t - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
};
/** Fades in over a..b, holds, fades out over c..d. */
const span = (t: number, a: number, b: number, c: number, d: number) =>
  ease(t, a, b) * (1 - ease(t, c, d));
const bump = (x: number, width: number) => Math.max(0, 1 - Math.abs(x) / width);
const cycle = (x: number) => x - Math.floor(x);

export class Turtle extends Character {
  static readonly terms =
    'terrapin reptile marine ocean flippers flipper shell hexagon hexagonal plates teal mint green swim paddle row clumsy flat glowing seams bubbles';

  private env: Env | null = null;
  /** Height above the floor, in body heights: where she wants to be, and where she is. */
  private up = 0;
  private alt = new Spring(1.7, 0.6, 1, 0);
  private beatS = new Spring(2, 1, 1, 0);
  private ampS = new Spring(2.4, 0.8, 1, 0);
  private tuckS = new Spring(2.6, 0.7, 1, 0);
  private phase = 0;
  private rowT = 0;
  private did = 0;
  private dir = 1;
  private pokes: number[] = [];
  private hover = 0;
  private mate: Character | null = null;
  // Set each frame by whatever act is running (idle() clears them).
  private beat = 0;
  private amp = 0;
  private spread = 0;
  private lift = 0;
  private limp = 0;
  private pitch = 0;
  private roll = 0;
  private loop = 0;
  private tuckNow = 0;
  private yaw = 0;
  private sx = 0;
  private sy = 0;
  private tuck = 0;
  private wave = 0;
  private clap = 0;
  private dig = 0;
  private cruise = 0;
  private bubble = 0;
  private glow = 0;
  private mood: string | null = null;
  private puffs = Array.from({ length: PUFFS }, () => ({ x: 0, y: 0, z: 0, s: 0 }));
  private swimming = false;

  constructor(model: Object3D) {
    super(
      {
        name: 'Flip',
        model: 'turtle',
        metres: 0.14,
        width: 0.5,
        size: 0.8,
        feels: {
          default: { f: 3.5, zeta: 0.55 },
          body: { f: 2.4, zeta: 0.5 },
          neck: { f: 3, zeta: 0.55 },
          head: { f: 3, zeta: 0.5, r: 0.4 },
          'shoulder.L': { f: 4, zeta: 0.5 },
          'shoulder.R': { f: 4, zeta: 0.5 },
          'flipper.L': { f: 4.5, zeta: 0.4 },
          'flipper.R': { f: 4.5, zeta: 0.4 },
          'tip.L': { f: 5, zeta: 0.3 },
          'tip.R': { f: 5, zeta: 0.3 },
          tail: { f: 3, zeta: 0.3 },
        },
        face: TURTLE_FACE,
        eyes: 0.58,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.9 },
          { bone: 'neck', yaw: 0.2, pitch: 0.2 },
        ],
        reach: { yaw: 60, pitch: 28 },
        lag: 1.3,
        entrance: 'rise',
        edges: ['bottom'],
        stay: [70, 140],
        speed: 0.7,
        turn: 55,
      },
      model,
    );
    this.acts = {
      ...this.getting(),
      ...this.swims(),
      ...this.tricks(),
      ...this.rests(),
      ...this.reactions(),
    };
  }

  // ---------- Who is about ----------

  private mates() {
    const f = this.env?.frame;
    return (this.env?.crew ?? [])
      .filter((o) => o !== this && o.state === 'here' && o.edge === this.edge && !o.free)
      .sort((a, b) => Math.abs(a.s - this.s) - Math.abs(b.s - this.s))
      .filter((o) => !f || Math.abs(o.s - this.s) < this.heightPx * 16);
  }

  private still = () => !this.walking && !this.door;

  /** A short trip along the floor, toward the roomier side unless `way` says. */
  private amble(heights: number, depth?: number, way?: number) {
    if (!this.env) return;
    const [lo, hi] = this.span(this.env.frame);
    const more = this.s - lo > hi - this.s ? -1 : 1;
    const room = (more > 0 ? hi - this.s : this.s - lo) - this.widthPx() * 1.2;
    const w = way ?? (Math.random() < 0.7 ? more : -more);
    const far = Math.min(Math.max(room, 0), this.heightPx * heights);
    this.walkTo(this.s + w * Math.max(far, this.heightPx * 0.8), depth);
  }

  // ---------- Acts: getting about ----------

  private getting(): Record<string, Act> {
    return {
      idle: { weight: 4, length: [3, 6] },
      row: {
        weight: 2.6,
        length: [5, 7],
        when: this.still,
        start: () => this.amble(2.5 + Math.random() * 2.5),
      },
      swim: {
        weight: 2.2,
        length: [6, 8],
        face: 'happy',
        when: this.still,
        start: () => {
          this.cruise = 1.2;
          this.amble(5 + Math.random() * 4);
        },
        pose: (t) => {
          // Off the floor, out into the water, a stroke every second or so; then down.
          const k = span(t, 0.2, 1.4, this.actLength - 1.6, this.actLength - 0.2);
          this.up = (1.6 + 0.4 * sin(t, 0.25)) * k;
          this.beat = 0.9 * k;
          this.amp = 26 * k;
          this.cruise = 1.3;
        },
      },
      glide: {
        weight: 1.3,
        length: [6, 7],
        face: 'sleepy',
        when: this.still,
        start: () => this.amble(3.5),
        pose: (t) => {
          // Flippers held out like wings, a long slow drift; one stroke to get going.
          const k = span(t, 0.2, 1.4, this.actLength - 1.8, this.actLength - 0.2);
          this.up = 2 * k;
          this.beat = t < 1.6 ? 0.9 : 0.12;
          this.amp = t < 1.6 ? 24 : 5;
          this.lift = 10 * k;
          this.pitch = -6 * k;
          this.cruise = 0.9;
          this.expression = k > 0.5 ? 'happy' : 'neutral';
        },
      },
      current: {
        weight: 0.9,
        length: [5, 5.6],
        face: 'happy',
        when: this.still,
        start: () => {
          this.cruise = 3.4;
          this.spec.turn = 75;
          this.amble(9, undefined, Math.random() < 0.5 ? -1 : 1);
        },
        pose: (t) => {
          // Caught in a current: swept along fast and high, flippers streamed back,
          // one waving at whoever is watching.
          const k = span(t, 0.2, 1, this.actLength - 1.3, this.actLength - 0.2);
          this.up = 2.4 * k;
          this.cruise = 3.4;
          this.spread = 55 * k;
          this.lift = -6 * k;
          this.wave = k * Math.sign(this.dir);
          this.pitch = 8 * k;
          this.beat = 0.5;
          this.amp = 6 * k;
        },
      },
      lookOver: {
        weight: 1,
        length: [8, 10],
        when: this.still,
        start: () => {
          this.did = 0;
          this.amble(2, 0);
        },
        pose: (t) => {
          // At the front lip she pushes up on her flippers and peers over it.
          const at = this.depth < 0.05 && !this.walking;
          if (at && !this.did) this.did = t;
          const k = at ? span(t - this.did, 0, 0.8, 3.6, 4.4) : 0;
          this.up = 0.45 * k;
          this.pitch = -10 * k;
          this.puppet.add('head', 20 * k, 20 * k * sin(t, 0.4), 0);
          this.beat = 0.7 * k;
          this.amp = 12 * k;
          if (this.did && t - this.did > 4.4) this.walkTo(this.s, 0.25);
          this.expression = k > 0.3 ? 'surprised' : 'neutral';
        },
      },
      peekBack: {
        weight: 1,
        length: [11, 13],
        when: this.still,
        start: () => {
          this.did = 0;
          this.cruise = 1.1;
          this.amble(2.5, 0.95, Math.random() < 0.5 ? -1 : 1);
        },
        pose: (t) => {
          // Swims to the back wall, hangs there and looks about, and comes home.
          const far = this.depth > 0.5;
          const at = this.depth > 0.85 && !this.walking;
          if (at && !this.did) this.did = t;
          const k = at ? span(t - this.did, 0, 0.5, 4.5, 5) : 0;
          this.up = far ? 1.2 : 0.4 * clamp(t / 1.2, 0, 1);
          this.beat = far ? 0.8 : 0.4;
          this.amp = far ? 16 : 6;
          this.cruise = 1.1;
          this.puppet.add('head', -4 * k, 34 * k * sin(t, 0.33), 0);
          if (this.did && t - this.did > 5 && this.depth > 0.5) {
            this.walkTo(this.s, 0.2);
            this.up = 0.8;
          }
          this.expression = k > 0.3 ? 'focused' : 'neutral';
        },
      },
      follow: {
        weight: 1.1,
        length: [9, 12],
        face: 'happy',
        when: () => this.still() && this.mates().length > 0,
        start: () => {
          this.mate = this.mates()[0] ?? null;
          this.did = 0;
          this.dir = Math.random() < 0.5 ? -1 : 1;
          this.cruise = 1.5;
        },
        pose: (t) => {
          // Swims after a crewmate, a body or two behind and above, in step.
          const o = this.mate;
          const k = span(t, 0.2, 1.2, this.actLength - 1.4, this.actLength - 0.2);
          this.up = 1.4 * k;
          this.beat = 0.9 * k;
          this.amp = 24 * k;
          this.cruise = 1.6;
          if (!o || o.state === 'gone') return;
          if (t - this.did > 0.6) {
            this.did = t;
            this.walkTo(
              o.s + this.dir * (this.widthPx() * 0.8 + o.spec.width * o.px * 0.5),
              o.depth,
            );
          }
        },
      },
      dive: {
        weight: 0.9,
        length: [6.4, 6.4],
        face: 'surprised',
        when: this.still,
        start: () => {
          this.cruise = 1.6;
          this.amble(3.5);
        },
        pose: (t) => {
          // Up and away, then a long dive nose first down to the floor, a scoop and a
          // bank back up.
          this.up =
            t < 1.6
              ? 2.6 * ease(t, 0, 1.4)
              : t < 4.4
                ? 2.6 * (1 - ease(t, 1.6, 4.2))
                : 0.6 * span(t, 4.4, 5.2, 5.4, 6.2);
          this.pitch =
            t < 1.6
              ? -14
              : t < 4.4
                ? 26 * span(t, 1.6, 2.4, 3.6, 4.4)
                : -10 * span(t, 4.4, 5, 5.4, 6.2);
          this.beat = t < 1.6 || t > 4.4 ? 1 : 0;
          this.amp = t < 1.6 || t > 4.4 ? 26 : 0;
          this.lift = t > 1.8 && t < 4.2 ? 10 : 0;
          this.spread = t > 1.8 && t < 4.2 ? 30 : 0;
          this.cruise = 1.4;
        },
      },
    };
  }

  // ---------- Acts: swimming shows ----------

  private swims(): Record<string, Act> {
    return {
      loop: {
        weight: 1.1,
        length: [5.2, 5.2],
        face: 'happy',
        when: this.still,
        start: () => (this.dir = Math.random() < 0.5 ? -1 : 1),
        pose: (t) => {
          // Turned side-on, she swims a loop-the-loop in the air, flippers beating.
          const side = span(t, 0.1, 0.8, 4.4, 5.1);
          const a = 2 * Math.PI * ease(t, 1.2, 4.2);
          const R = 0.28;
          this.up = 2.2 * ease(t, 0, 1) * (1 - ease(t, 4.6, 5.2));
          this.sx = this.dir * R * Math.sin(a) * 0.9;
          this.sy = R * (1 - Math.cos(a)) * 0.9;
          this.loop = -this.dir * a * DEG;
          this.yaw = this.dir * 75 * side;
          this.beat = 1.2 * side;
          this.amp = 28 * side;
        },
      },
      barrel: {
        weight: 1.1,
        length: [5, 5],
        face: 'happy',
        when: this.still,
        start: () => (this.dir = Math.random() < 0.5 ? -1 : 1),
        pose: (t) => {
          // Hangs in the water and rolls over, slow and graceful, right round.
          const k = span(t, 0, 0.8, 4.2, 5);
          this.up = 1.5 * k;
          this.roll = this.dir * 360 * ease(t, 0.8, 4.2);
          this.beat = 0.5 * k;
          this.amp = 20 * k;
          this.spread = 25 * k;
        },
      },
      eight: {
        weight: 0.8,
        length: [6.4, 6.4],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // A figure eight through the water, leaning into each turn.
          const k = span(t, 0, 0.8, 5.6, 6.4);
          const a = 2 * Math.PI * ease(t, 0.4, 6);
          this.up = 1.9 * k;
          this.sx = 0.34 * Math.sin(a) * k;
          this.sy = 0.11 * Math.sin(2 * a) * k;
          this.roll = -16 * Math.cos(a) * k;
          this.beat = 0.9 * k;
          this.amp = 24 * k;
        },
      },
      spin: {
        weight: 1,
        length: [3.6, 3.6],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // A happy spin on the spot, all four flippers going.
          const k = span(t, 0, 0.5, 3.1, 3.6);
          this.up = 1.1 * k;
          this.yaw = 360 * 2 * ease(t, 0.3, 3.2);
          this.beat = 1.6 * k;
          this.amp = 30 * k;
          this.glow = k;
        },
      },
      breath: {
        weight: 1.1,
        length: [9, 9],
        when: this.still,
        pose: (t) => {
          // Up she goes to the surface, nose to the sky; a breath in and a bubble on her
          // screen that swells and pops; then slowly back down.
          const k = span(t, 0, 2.6, 6.2, 8.8);
          this.up = 5 * k;
          this.beat = t < 2.8 ? 0.9 : 0.35;
          this.amp = t < 2.8 ? 26 : 10;
          this.pitch = -12 * ease(t, 2, 3);
          this.puppet.add('head', -22 * span(t, 2.4, 3.2, 5.4, 6.2), 0, 0);
          this.bubble = span(t, 3.4, 5, 5, 5.15) * (t < 5.1 ? 1 : 0);
          if (t > 5.05 && t < 5.4) this.puff(0, t - 5.05, 0.35, 0.03, 0.06, 0.02, 1.2);
          this.expression = t < 3.4 ? 'neutral' : t < 5.1 ? 'surprised' : 'happy';
        },
      },
      tread: {
        weight: 1.2,
        length: [4, 5],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // Treads water: bobbing up and down on the spot with quick little strokes.
          const k = span(t, 0.2, 1, this.actLength - 1, this.actLength - 0.2);
          this.up = (1.2 + 0.25 * sin(t, 0.7)) * k;
          this.beat = 1.8 * k;
          this.amp = 16 * k;
          this.roll = 4 * sin(t, 0.7, 0.2) * k;
        },
      },
      drift: {
        weight: 1,
        length: [8, 10],
        face: 'sleepy',
        when: this.still,
        pose: (t) => {
          // Hangs in the water and dozes: flippers limp, a slow bob, drifting a little
          // round, eyes at half mast, now and then a lazy stroke.
          const k = span(t, 0.4, 1.8, this.actLength - 1.6, this.actLength - 0.2);
          this.up = (1.1 + 0.15 * sin(t, 0.22)) * k;
          this.limp = k;
          this.beat = 0.15 * k * (Math.sin(t * 0.9) > 0.85 ? 4 : 0.4);
          this.amp = 6 * k;
          this.yaw = 22 * sin(t, 0.06) * k;
          this.roll = 5 * sin(t, 0.18) * k;
          this.puppet.add('head', 14 * k, 0, 0);
          this.expression = k > 0.4 ? 'sleepy' : 'neutral';
        },
      },
    };
  }

  // ---------- Acts: tricks ----------

  private tricks(): Record<string, Act> {
    return {
      wave: {
        weight: 1.4,
        length: [3.4, 4],
        face: 'happy',
        when: this.still,
        start: () => (this.dir = Math.random() < 0.5 ? -1 : 1),
        pose: (t) => {
          // Lifts one front flipper and waves it at us, the shell leaning away.
          const k = span(t, 0.2, 0.8, this.actLength - 0.8, this.actLength - 0.2);
          this.wave = this.dir * k;
          this.roll = -this.dir * 6 * k;
          this.puppet.add('head', 0, this.dir * 10 * k, this.dir * 6 * k * sin(t, 1.2));
        },
      },
      clap: {
        weight: 1,
        length: [3.4, 3.8],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // Both flippers forward and together, clap clap clap, delighted.
          const k = span(t, 0.2, 0.7, this.actLength - 0.7, this.actLength - 0.2);
          this.clap = k * (0.5 + 0.5 * sin(t, 2.3, -0.25));
          this.puppet.add('head', -6 * k * Math.abs(sin(t, 1.15)), 0, 0);
          this.pitch = -3 * k * Math.abs(sin(t, 1.15));
          this.mood = BEACON.happy ?? null;
        },
      },
      hop: {
        weight: 1,
        length: [3, 3.4],
        face: 'surprised',
        when: this.still,
        pose: (t) => {
          // Flap flap: a hop for joy, a flutter of flippers and up she goes.
          const k = span(t, 0, 0.2, this.actLength - 0.6, this.actLength - 0.2);
          const b = Math.abs(Math.sin(Math.PI * 1.2 * t));
          this.up = 0.9 * b * k;
          this.beat = 2.4 * k;
          this.amp = 34 * k;
          this.glow = k;
          this.expression = b > 0.5 ? 'happy' : 'surprised';
        },
      },
      sneeze: {
        weight: 0.9,
        length: [4.4, 4.4],
        when: this.still,
        pose: (t) => {
          // A breath in (head back, eyes screwed up) and a sneeze of bubbles.
          const inhale = ease(t, 0.4, 1.7);
          const achoo = t > 1.9 && t < 2.15;
          this.puppet.add(
            'head',
            -22 * inhale * (t < 1.9 ? 1 : 0) + (t >= 1.9 ? 22 * span(t, 1.9, 2.0, 2.3, 3.2) : 0),
            0,
            0,
          );
          this.pitch =
            -5 * inhale * (t < 1.9 ? 1 : 0) + (t >= 1.9 ? 7 * span(t, 1.9, 2, 2.3, 3) : 0);
          this.glow = t > 1.9 ? span(t, 1.9, 2, 2.2, 2.9) : 0;
          for (let i = 0; i < PUFFS; i++)
            this.puff(
              i,
              t - 1.95 - i * 0.05,
              1.5 + 0.15 * i,
              ((i % 3) - 1) * 0.06,
              0.05 + 0.03 * i,
              0.16,
              1.1,
            );
          this.expression = t < 1.9 ? 'wink' : achoo ? 'surprised' : t < 3.2 ? 'dizzy' : 'happy';
          if (t > 1.88 && t < 1.92) this.puppet.kick('body', -260, 0, 0);
        },
      },
      dig: {
        weight: 1,
        length: [5, 5.6],
        face: 'focused',
        when: this.still,
        pose: (t) => {
          // Digs in the sand, front flippers flicking it back over her shell, alternately;
          // grains fly out behind.
          const k = span(t, 0.3, 0.9, this.actLength - 0.9, this.actLength - 0.2);
          this.dig = k;
          this.puppet.add('head', 22 * k, 0, 0);
          this.pitch = 8 * k;
          for (let i = 0; i < PUFFS; i++) {
            const a = t * 3.4 - i * 0.5;
            const s = k * (0.5 + 0.5 * Math.max(0, Math.sin(a)));
            const side = i % 2 ? 1 : -1;
            const u = cycle(a / (2 * Math.PI));
            this.puffs[i] = {
              x: side * (0.03 + 0.1 * u),
              y: -0.03 + 0.11 * Math.sin(Math.PI * u),
              z: -0.26 - 0.1 * u,
              s: s * 0.7,
            };
          }
        },
      },
      shake: {
        weight: 0.8,
        length: [2.6, 2.6],
        face: 'surprised',
        when: this.still,
        pose: (t) => {
          // Shakes the water off: a quick shudder with droplets flying outward.
          const k = span(t, 0, 0.15, 1.7, 2.2);
          this.yaw = 14 * Math.sin(t * 34) * k;
          this.roll = 5 * Math.sin(t * 27) * k;
          for (let i = 0; i < PUFFS; i++) {
            const a = (i / PUFFS) * 2 * Math.PI;
            const u = clamp((t - 0.2 - i * 0.05) / 1.1, 0, 1);
            this.puffs[i] = {
              x: Math.cos(a) * 0.16 * u,
              y: 0.05 + Math.abs(Math.sin(a)) * 0.1 * u - 0.1 * u * u,
              z: -0.12 + Math.sin(a) * 0.09 * u,
              s: 0.6 * Math.sin(Math.PI * u) * (t > 0.2 ? 1 : 0),
            };
          }
        },
      },
      tuckShy: {
        weight: 0.8,
        length: [4.6, 5],
        when: this.still,
        pose: (t) => {
          // Shy for no reason: head and flippers in, then a flipper-tip wiggle, then out.
          this.tuck = span(t, 0, 0.6, this.actLength - 1.6, this.actLength - 0.6);
          this.expression = this.tuck > 0.5 ? 'sad' : 'neutral';
          if (t > 2 && t < 3.4) this.wave = 0.5 * (this.dir || 1);
          this.tuck *= t > 2 && t < 3.4 ? 0.7 : 1;
        },
      },
      stumble: {
        weight: 1,
        length: [5.4, 5.4],
        when: this.still,
        pose: (t) => {
          // A big lurch, too big: over goes the nose in the sand, flippers scrabbling, then
          // a sheepish shake and up again.
          const down = span(t, 0.9, 1.3, 3.4, 4.2);
          this.pitch = 16 * down;
          this.puppet.add('head', 20 * down, 0, 0);
          this.beat = 2.6 * span(t, 1.6, 2, 3.2, 3.6);
          this.amp = 26 * span(t, 1.6, 2, 3.2, 3.6);
          this.roll = 6 * Math.sin(t * 9) * span(t, 1.6, 1.8, 3, 3.4);
          this.up = 0.15 * span(t, 4, 4.4, 4.6, 5);
          this.expression = t < 0.9 ? 'neutral' : t < 4.2 ? 'dizzy' : 'sad';
          if (t > 0.85 && t < 0.9) this.puppet.kick('body', 300, 0, 0);
        },
      },
      yawn: {
        weight: 1,
        length: [4.4, 4.4],
        when: this.still,
        pose: (t) => {
          // A big yawn: flippers stretched out wide and shaking, head back, mouth open.
          const k = span(t, 0.2, 1.4, 3, 4.2);
          this.spread = -30 * k;
          this.lift = 18 * k;
          this.puppet.add('head', -20 * k, 0, 0);
          this.pitch = -6 * k;
          this.roll = 3 * sin(t, 4) * k;
          this.expression = k > 0.3 ? 'surprised' : 'sleepy';
        },
      },
    };
  }

  // ---------- Acts: resting ----------

  private rests(): Record<string, Act> {
    return {
      nap: {
        weight: 1.1,
        length: [10, 14],
        face: 'asleep',
        when: this.still,
        pose: (t) => {
          // A nap on the floor, chin down on her flippers, breathing slowly.
          const k = span(t, 0.2, 1.6, this.actLength - 1.6, this.actLength - 0.2);
          this.limp = k;
          this.puppet.add('head', 26 * k, 0, 0);
          this.pitch = 5 * k;
          this.puppet.add('body', 1.5 * sin(t, 0.25) * k);
          this.expression = k > 0.4 ? 'asleep' : 'sleepy';
        },
      },
    };
  }

  // ---------- Reactions ----------

  private reactions(): Record<string, Act> {
    return {
      poked: {
        weight: 0,
        length: [3.4, 3.8],
        face: 'surprised',
        pose: (t) => {
          // Head and flippers in, a bubble or two of fright; a peek, and out again.
          this.tuck = t < 1.8 ? 1 : t < 2.4 ? 0.35 : t < 2.7 ? 0.35 : 0;
          this.glow = span(t, 0, 0.1, 0.6, 1.4);
          if (t > 0.05)
            for (let i = 0; i < 2; i++)
              this.puff(i, t - 0.1 - i * 0.15, 1, (i ? 1 : -1) * 0.05, 0.08, 0.05, 0.8);
          this.expression = t < 2 ? 'surprised' : 'neutral';
        },
      },
      dizzy: {
        weight: 0,
        length: [4.2, 4.2],
        face: 'dizzy',
        pose: (t) => {
          // Spins round and round on the spot, wobbling, then rights herself.
          const k = 1 - ease(t, 2.8, 4);
          this.yaw = 360 * 3 * (1 - Math.exp(-t * 1.1)) * k;
          this.roll = 12 * k * Math.sin(t * 5);
          this.up = 0.5 * k;
          this.beat = 1.4 * k;
          this.amp = 22 * k;
          this.glow = 0.5 * k;
        },
      },
      pleased: {
        weight: 0,
        length: [3, 4],
        face: 'love',
        pose: (t) => {
          // Rises a little toward the mouse, flippers fluttering, all hearts.
          const k = ease(t, 0, 0.5) * (1 - ease(t, this.actLength - 0.6, this.actLength));
          this.up = 0.7 * k;
          this.beat = 2 * k;
          this.amp = 22 * k;
          this.roll = 6 * k * sin(t, 1.2);
          this.glow = k;
        },
      },
    };
  }

  /**
   * Bubble `i` (or a grain, a droplet) at `age` seconds into its life: rising from the
   * mouth by (dx, dy, dz) a second, growing then popping at the end. Metres, character space.
   */
  private puff(
    i: number,
    age: number,
    life: number,
    dx: number,
    dy: number,
    dz: number,
    size: number,
  ) {
    if (age < 0 || age > life) return;
    const u = age / life;
    this.puffs[i] = {
      x: dx * age + 0.008 * Math.sin(age * 9 + i * 2),
      y: dy * age * 2.4 - 0.02,
      z: dz * age * 2,
      s: size * Math.min(1, age * 6) * (u > 0.85 ? 1 - (u - 0.85) / 0.15 : 1),
    };
  }

  poke() {
    if (this.state !== 'here') return;
    const now = performance.now() / 1000;
    this.pokes = [...this.pokes.filter((at) => now - at < 2.5), now];
    this.goal = null;
    if (this.pokes.length >= 3) {
      this.pokes = [];
      this.setAct('dizzy');
    } else if (this.act !== 'dizzy') {
      this.setAct('poked');
      this.alt.kick(1.2);
    }
  }

  // ---------- Posing ----------

  protected idle(t: number) {
    const p = this.puppet;
    this.up = 0;
    this.beat = this.amp = this.spread = this.lift = this.limp = 0;
    this.pitch = this.roll = this.loop = this.yaw = this.sx = this.sy = 0;
    this.tuck = this.wave = this.clap = this.dig = this.bubble = this.glow = 0;
    this.mood = null;
    this.cruise = 0;
    for (const q of this.puffs) Object.assign(q, { x: 0, y: 0, z: 0, s: 0 });
    this.expression = this.hovered ? 'happy' : 'neutral';
    if (this.act !== 'current') this.spec.turn = 55;
    // Breathing, the head never quite still, the tail's little sway.
    p.add('body', 1.2 * sin(t, 0.3));
    p.add('head', 2 * sin(t, 0.27, 0.3), 3 * sin(t, 0.13), 0);
    p.add('tail', 0, 8 * sin(t, 0.4), 0);
    for (const [sfx, sd] of SIDES) {
      p.add(`shoulder.${sfx}`, 0, sd * 2 * sin(t, 0.22, 0.3), sd * 2 * sin(t, 0.31, sd * 0.2));
      p.add(`hind.${sfx}`, 0, 0, sd * 4 * sin(t, 0.37, sd * 0.3));
    }
  }

  /** A row on the floor: the speed of the lurch this instant. */
  private lurch() {
    const r = cycle(this.rowT);
    return 0.12 + 2.1 * Math.sin(Math.PI * clamp(r / 0.4, 0, 1)) ** 1.5 * (r < 0.4 ? 1 : 0);
  }

  protected move(dt: number, env: Env) {
    this.env = env;
    super.move(dt, env);
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    this.env = env;
    const H = this.heightPx;
    const act = this.act;

    // Rest the mouse on her and she is delighted.
    this.hover = this.hovered ? this.hover + dt : 0;
    if (this.hover > 0.9 && act === 'idle' && this.still()) this.setAct('pleased');

    // Height: chases where she wants to be, with a soft bob; not above the top of the box.
    const room = Math.max(1, (env.frame.bottom - env.frame.top) * 0.6);
    const bob = 0.05 * Math.sin(this.t * 1.6) * clamp(this.alt.y, 0, 1);
    const alt = this.alt.update(dt, Math.min(this.up, room / H) + bob);
    this.h = Math.max(0, alt * H);
    this.swimming = this.h > H * 0.4;
    // On the floor she rows, in lurches; in the water she goes at her own pace.
    this.spec.speed = this.cruise > 0 && this.h > H * 0.15 ? this.cruise : this.lurch();

    // Strokes: the beat and the size of them ease in and out.
    const beat = clamp(this.beatS.update(dt, this.beat), 0, 3);
    const amp = clamp(this.ampS.update(dt, this.amp), 0, 40);
    this.phase += dt * 2 * Math.PI * beat;
    const tuck = clamp(this.tuckS.update(dt, this.tuck), -0.1, 1.1);
    // Rowing on the floor: a stroke a lurch, finished before she stops.
    const rowing = !this.swimming && this.walking;
    if (rowing || cycle(this.rowT) > 0.03) this.rowT += dt * 1.25;

    const A = amp;
    const ph = this.phase;
    for (const [sfx, sd] of SIDES) {
      // The long front flippers: shoulder up and down, the paddle and tip a beat behind.
      p.add(
        `shoulder.${sfx}`,
        0,
        sd * (-0.9 * A * Math.sin(ph + 0.6) + this.spread),
        sd * (A * Math.sin(ph) + this.lift),
      );
      p.add(
        `flipper.${sfx}`,
        0,
        sd * -0.25 * A * Math.sin(ph - 0.2),
        sd * 0.45 * A * Math.sin(ph - 0.7),
      );
      p.add(`tip.${sfx}`, 0, 0, sd * 0.5 * A * Math.sin(ph - 1.4));
      // Hind flippers: a gentler, opposite beat, steering.
      p.add(`hind.${sfx}`, 0, sd * 0.3 * A * Math.sin(ph + 1), sd * 0.4 * A * Math.sin(ph - 1));
      p.add(`hindtip.${sfx}`, 0, 0, sd * 0.4 * A * Math.sin(ph - 1.6));
      // Limp: drooping, heavy.
      p.add(`shoulder.${sfx}`, 0, sd * 12 * this.limp, sd * -14 * this.limp);
      p.add(`flipper.${sfx}`, 0, 0, sd * -10 * this.limp);
      p.add(`tip.${sfx}`, 0, 0, sd * -12 * this.limp);
      p.add(`hind.${sfx}`, 0, 0, sd * -12 * this.limp);
    }

    // The row: both front flippers push back together, then swing forward.
    if (!this.swimming) {
      const r = cycle(this.rowT);
      const active = rowing || r > 0.03;
      if (active) {
        const push = r < 0.4;
        const yaw = push ? -32 + 82 * ease(r, 0, 0.4) : 50 - 82 * ease(r, 0.4, 1);
        const roll = push ? -5 : 24 * Math.sin(Math.PI * clamp((r - 0.4) / 0.6, 0, 1));
        for (const [sfx, sd] of SIDES) {
          p.add(`shoulder.${sfx}`, 0, sd * yaw, sd * roll);
          p.add(`tip.${sfx}`, 0, 0, sd * (push ? -8 : 10));
          p.add(`hind.${sfx}`, 0, sd * (push ? 8 : -6) * (sd > 0 ? 1 : 0.6), 0);
        }
        // The body lurches with each push, the head nodding.
        p.add('body', push ? -3 : 2, 0, 0);
        p.add('head', push ? 7 : -3, 0, 0);
      }
    }

    // A waving flipper (whichever side wave says), a clap, digging.
    if (this.wave) {
      const sfx = this.wave > 0 ? 'L' : 'R';
      const sd = this.wave > 0 ? 1 : -1;
      const k = Math.abs(this.wave);
      p.add(`shoulder.${sfx}`, 0, sd * -20 * k, sd * (68 * k + 6 * sin(this.t, 0.8) * k));
      p.add(
        `flipper.${sfx}`,
        0,
        sd * 22 * k * sin(this.t, 2.2),
        sd * 12 * k * sin(this.t, 2.2, 0.1),
      );
      p.add(`tip.${sfx}`, 0, sd * 12 * k * sin(this.t, 2.2, -0.15), sd * 10 * k);
    }
    if (this.clap) {
      for (const [sfx, sd] of SIDES) {
        p.add(`shoulder.${sfx}`, 0, sd * -(56 + 34 * this.clap), sd * 26);
        p.add(`flipper.${sfx}`, 0, sd * -6 * this.clap, 0);
      }
    }
    if (this.dig) {
      for (const [sfx, sd] of SIDES) {
        const s = Math.sin(this.t * 3.4 + (sd > 0 ? 0 : Math.PI));
        p.add(
          `shoulder.${sfx}`,
          0,
          sd * (60 + 26 * s) * this.dig,
          sd * (8 + 22 * Math.max(0, s)) * this.dig,
        );
        p.add(`tip.${sfx}`, 0, 0, sd * 18 * Math.max(0, s) * this.dig);
      }
      p.add('body', 0, 0, 3 * Math.sin(this.t * 3.4) * this.dig);
    }

    // Tucked in: head pulled back into the shell, flippers folded under (and shrunk in
    // after()).
    p.add('head', 14 * tuck, 0, 0);
    for (const [sfx, sd] of SIDES) {
      p.add(`shoulder.${sfx}`, 0, sd * 72 * tuck, sd * -14 * tuck);
      p.add(`hind.${sfx}`, 0, sd * -35 * tuck, 0);
    }
    p.shift('neck', 0, -0.006 * tuck, -0.05 * tuck);

    // Body attitude: pitch for dives and dips, and leaning into a sideways swim.
    p.add('body', this.pitch);
    if (this.swimming) {
      const lean = clamp(this.pace / Math.max(H * 3, 1), -1, 1);
      p.add('body', 0, 0, -10 * lean);
      p.add('tail', 0, 0, 0);
    }
    this.tuckNow = tuck;

    // The face: a bubble at her lips.
    if (this.face) {
      this.face.overlay = this.bubble > 0.02 ? 'bubble' : '';
      this.face.overlayK = this.bubble;
    }
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    const t = env.time;
    void dt;

    // Whole-body turns beyond what a spring does: rolls, loops, spins.
    if (this.roll || this.loop) p.turn('body', this.loop, 0, this.roll);
    p.shift('root', this.sx, this.sy, 0);
    // Side-on for a loop, spinning for a spin; the pivot is ours.
    this.pivot.rotation.y = this.yaw / DEG;

    // Tucked: head and flippers shrink into the shell.
    const k = clamp(this.tuckNow, 0, 1);
    const pull = 1 - 0.45 * k;
    p.stretch('head', pull, [0, 0, 1], pull);
    for (const [sfx, sd] of SIDES) {
      const along = 1 - 0.5 * k;
      p.stretch(`shoulder.${sfx}`, along, [sd, 0, -0.36], 1 - 0.3 * k);
      p.stretch(`hind.${sfx}`, 1 - 0.4 * k, [sd, 0, -1.4], 1 - 0.3 * k);
    }

    // Bubbles, grains and droplets: each on its bone, folded away unless an act calls it.
    this.puffs.forEach((q, i) => {
      const s = Math.max(0.001, q.s);
      p.stretch(`puff.${i + 1}`, s, [0, 1, 0], s);
      p.shift(`puff.${i + 1}`, q.x, q.y, q.z + 0.08 * (q.s > 0 ? 1 : 0));
    });

    this.lights(t);
  }

  /** The shell's seams: a pulse down the bands with each stroke, a ripple as she rows. */
  private lights(t: number) {
    const act = this.act;
    const beat = this.beatS.y;
    const swim = this.swimming || beat > 0.3;
    for (let i = 0; i <= BANDS; i++) {
      // Band 5 is the tail lamp, the last of the run.
      const j = i;
      let level: number;
      let tone: string | undefined = this.mood ?? undefined;
      if (act === 'dizzy') {
        level = Math.random() < 0.5 ? 1 : 0.15;
        tone = RAINBOW[Math.floor(t * 9 + i) % RAINBOW.length];
      } else if (act === 'poked') {
        level = this.glow > 0.05 ? this.glow * (Math.sin(t * 30) > 0 ? 1 : 0.5) : 0.25;
        tone = BEACON.surprised;
      } else if (act === 'sneeze' && this.glow > 0.02) {
        level = this.glow;
        tone = BEACON.surprised;
      } else if (act === 'nap' || act === 'drift') {
        level = 0.16 + 0.14 * Math.sin(t * 0.8 - j * 0.4);
      } else if (act === 'pleased' || act === 'spin' || act === 'hop') {
        level = 0.55 + 0.45 * Math.sin(t * 6 - j * 0.9);
        tone = act === 'pleased' ? BEACON.love : RAINBOW[(j + Math.floor(t * 7)) % RAINBOW.length];
      } else if (swim) {
        // A pulse from head to tail with each stroke.
        level = 0.2 + 0.8 * bump(cycle(this.phase / (2 * Math.PI)) - (j / (BANDS + 1)) * 0.7, 0.2);
      } else if (this.walking || cycle(this.rowT) > 0.03) {
        level = 0.25 + 0.75 * bump(cycle(this.rowT) * 1.4 - (j / (BANDS + 1)) * 0.55, 0.22);
      } else if (act === 'breath' || act === 'yawn' || this.hovered) {
        level = 0.55 + 0.3 * Math.sin(t * 2 - j * 0.6);
        tone = BEACON.happy;
      } else {
        // Idle: now and then a slow ripple down the shell.
        level = 0.3 + 0.6 * bump(cycle(t / 5) * 1.5 - j * 0.09, 0.08);
      }
      this.outfit.dot(i, level, tone);
    }
  }
}
