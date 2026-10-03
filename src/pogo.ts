import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Act, Character, clamp, type Env, type Frame } from './character';
import type { Expression, FaceLayout } from './face';
import { sin } from './moves';
import { Spring, wobble } from './spring';

/**
 * Boing, the robot pogo-hopper: an egg of a body with a screen face, two stubby mitten
 * arms and a wobbling antenna, sitting on a big coil spring on a rubber foot pad. He never
 * walks, every step is a hop, and he can't sit still: even standing he bounces a little.
 *
 * The bouncing is real: the body is a mass on the spring, so it squashes as he lands (the
 * harder he lands, the further), rings a few times, and only leaves the ground when the
 * spring has pushed him back up; each hop is a push he chooses, so a small one is a tiny
 * jiggle and a big one a crouch and a launch. The spring is three bones that squash and
 * stretch and can bend sideways, so a bad landing sets it wobbling. Five pips round his
 * belt fill up as the spring is charged, and chase up as he lets go; the antenna bulb is
 * the mood light.
 *
 * Bouncy, excitable, about thirty tricks: one hop after another to wherever he is going, a
 * boing-boing-boing run across the floor, charging up the spring and a huge leap, a triple
 * bounce, a somersault, a spin jump, bouncing higher and higher on the spot, landing badly
 * and wobbling, sproinging off the back wall, a tiny excited jitter, a slow sad deflate and
 * a boing back to life, a figure eight, plunging into the depth of the box and back, a
 * hiccup, a sneeze, stretching tall and squashing flat, a bouncy dance, a nap balanced on
 * the spring, waving the antenna like a signal, peering over the front lip, hopping over
 * to a crewmate, a mega bounce that nearly scrapes the ceiling, a double somersault, a
 * wild landing he saves with windmilling arms, bouncing to a beat with a pip lit for each
 * bounce, a nervous hop-hop-hop while glancing about, and a big spring-stretching yawn.
 *
 * A poke and he bounces up startled, then wobbles; three pokes and he staggers about
 * dizzy. Rest the mouse on him and he can't contain himself.
 */
export const POGO_FACE: FaceLayout = {
  width: 512,
  height: 384,
  eyes: [
    [0.3, 0.42],
    [0.7, 0.42],
  ],
  rx: 0.1,
  ry: 0.26,
  line: 0.034,
  mouth: [0.5, 0.78],
};

/** The spring at rest, in metres, and in his heights (the model is 0.72 m tall). */
const SPRING = 0.26;
const THIRD = SPRING / 3;
const LS = SPRING / 0.72;
/** Gravity in his heights per second squared, the spring's stiffness (1/s²) and damping. */
const G = 6.7;
const K = 267;
const C = 8;
const DEG = 180 / Math.PI;
const PIPS = 5;
const SPEED = 1.8;
const smooth = (x: number) => {
  const u = clamp(x, 0, 1);
  return u * u * (3 - 2 * u);
};
const ramp = (t: number, a: number, b: number) => smooth((t - a) / (b - a));
const bump = (x: number, width: number) => Math.max(0, 1 - Math.abs(x) / width);
const cycle = (x: number) => x - Math.floor(x);

/** One hop: how high (in heights), and whether it turns in the air. */
interface Hop {
  h: number;
  kind?: 'plain' | 'flip' | 'flip2' | 'spin' | 'bad' | 'wall';
}

/** What an act asks for this frame. */
interface Pose {
  /** The height he keeps bouncing to (0 lets him settle). */
  want: number;
  /** The spring's natural length: 1 usual, less squashed down, more stretched up. */
  rest: number;
  /** The spring bent sideways and forward (degrees), and the body tipped on top of it. */
  lean: [number, number];
  tilt: [number, number];
  /** Arms: raised (+ up, 0 hanging), swung forward. */
  up: [number, number];
  swing: [number, number];
  /** Antenna: a droop (+ forward) and a sway sideways. */
  ant: [number, number];
  /** Shaking, 0..1. */
  shake: number;
  face?: Expression;
}

const blank = (): Pose => ({
  want: 0.05,
  rest: 1,
  lean: [0, 0],
  tilt: [0, 0],
  up: [0, 0],
  swing: [0, 0],
  ant: [0, 0],
  shake: 0,
});

type Trick = (t: number, a: Pose, len: number) => void;

export class Pogo extends Character {
  private frame: Frame | null = null;
  private crew: readonly Character[] = [];
  private pokes: number[] = [];
  private hover = 0;
  /** Body height above the floor while the spring is on it (his heights), and its speed. */
  private y = LS * 0.93;
  private vy = 0;
  private air = false;
  /** Height of the feet in the air, its speed, and how far through the hop he is. */
  private hf = 0;
  private vf = 0;
  private airT = 0;
  private airLen = 1;
  private groundT = 0;
  private hop: Hop = { h: 0 };
  /** Hops lined up for the next take-offs, ahead of the act's steady bounce. */
  private seq: Hop[] = [];
  private lastLand = 0;
  private rest = new Spring(6, 0.7, 1, 1);
  private shown = new Spring(16, 0.5, 1, 0.93);
  private lean = [new Spring(2.4, 0.1), new Spring(2.4, 0.1)] as const;
  private pose0: Pose = blank();
  private mem: Record<string, number> = {};
  private who: Character | null = null;
  private centre = { s: 0, d: 0 };
  private way = 1;
  private tricks: Record<string, Trick> = {};
  private compress = 0;
  private flash = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Boing',
        model: 'pogo',
        metres: 0.72,
        width: 0.32,
        size: 1.05,
        feels: {
          default: { f: 4, zeta: 0.6 },
          root: { f: 4, zeta: 0.7 },
          'spring.lo': { f: 14, zeta: 0.7 },
          'spring.mid': { f: 14, zeta: 0.7 },
          'spring.hi': { f: 14, zeta: 0.7 },
          body: { f: 5, zeta: 0.4 },
          'antenna.1': { f: 4.5, zeta: 0.18 },
          'antenna.2': { f: 6, zeta: 0.14 },
          'arm.L': { f: 6, zeta: 0.32 },
          'arm.R': { f: 6, zeta: 0.32 },
        },
        face: POGO_FACE,
        eyes: 0.7,
        gaze: [{ bone: 'body', yaw: 0.7, pitch: 0.7 }],
        reach: { yaw: 45, pitch: 25 },
        lag: 1.8,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [50, 110],
        speed: SPEED,
        turn: 70,
      },
      model,
    );
    this.tricks = this.makeTricks();
    this.acts = this.moves();
  }

  // ---------- The acts ----------

  private moves(): Record<string, Act> {
    const still = () => !this.going;
    const mates = () => this.mates().length > 0;
    return {
      idle: { weight: 3, length: [3, 6] },
      look: { weight: 1.2, length: [3, 5], when: still },
      hop: {
        weight: 2.2,
        length: [1.6, 3],
        when: still,
        start: () => this.wander(0.8 + Math.random() * 1.6),
      },
      boing3: {
        weight: 0.9,
        length: [3.4, 4.5],
        face: 'happy',
        when: still,
        start: () => this.run(),
      },
      charge: { weight: 0.6, length: [5, 5], when: still },
      triple: { weight: 0.6, length: [3.4, 3.4], face: 'happy', when: still },
      flip: { weight: 0.5, length: [3, 3], face: 'happy', when: still },
      spinjump: { weight: 0.5, length: [2.8, 2.8], face: 'happy', when: still },
      higher: { weight: 0.5, length: [6.5, 6.5], face: 'happy', when: still },
      badland: { weight: 0.4, length: [5.5, 5.5], when: still },
      wall: { weight: 0.4, length: [7, 8], when: still, start: () => this.toWall() },
      jitter: { weight: 0.8, length: [2.4, 3.6], face: 'happy', when: still },
      deflate: { weight: 0.4, length: [8, 8], when: still },
      eight: {
        weight: 0.5,
        length: [9, 10],
        face: 'happy',
        when: still,
        start: () => this.orbit(),
      },
      plunge: { weight: 0.5, length: [7, 8], when: still, start: () => this.plunge() },
      hiccup: { weight: 0.4, length: [4.5, 4.5], when: still },
      achoo: { weight: 0.3, length: [3.8, 3.8], when: still },
      tall: { weight: 0.5, length: [3.6, 3.6], when: still },
      squash: { weight: 0.4, length: [5, 5], when: still },
      dance: { weight: 0.6, length: [5, 6.5], face: 'happy', when: still },
      nap: { weight: 0.4, length: [9, 12], face: 'asleep', when: still },
      mega: { weight: 0.4, length: [7, 7], face: 'focused', when: still },
      double: { weight: 0.4, length: [3.6, 3.6], face: 'happy', when: still },
      save: { weight: 0.4, length: [5.5, 5.5], when: still },
      beat: { weight: 0.5, length: [6, 8], face: 'happy', when: still },
      nervous: { weight: 0.5, length: [3.5, 5], face: 'surprised', when: still },
      yawn: { weight: 0.5, length: [6, 6], when: still },
      wave: { weight: 1, length: [3, 4.5], face: 'happy', when: still },
      signal: { weight: 0.5, length: [4.5, 5.5], face: 'focused', when: still },
      lipview: { weight: 0.4, length: [6, 7.5], when: still, start: () => this.toLip() },
      visit: {
        weight: 0.5,
        length: [6, 8],
        when: () => still() && mates(),
        start: () => this.toMate(),
      },
      // Reactions
      poked: { weight: 0, length: [3, 3.4], face: 'surprised', start: () => this.startle() },
      love: { weight: 0, length: [60, 60], face: 'love' },
      dizzy: { weight: 0, length: [5, 5], face: 'dizzy' },
    };
  }

  protected setAct(name: string) {
    this.mem = {};
    this.who = null;
    this.seq = [];
    this.way = Math.random() < 0.5 ? -1 : 1;
    this.spec.speed = SPEED;
    this.centre = { s: this.s, d: Math.min(this.depth, 0.6) };
    super.setAct(name);
    if (name === 'charge') this.seq = [{ h: 1.05 }, { h: 0.3 }, { h: 0.14 }, { h: 0 }];
    else if (name === 'triple') this.seq = [{ h: 0.22 }, { h: 0.45 }, { h: 0.85 }, { h: 0 }];
    else if (name === 'flip') this.seq = [{ h: 0.85, kind: 'flip' }, { h: 0.12 }, { h: 0 }];
    else if (name === 'spinjump') this.seq = [{ h: 0.75, kind: 'spin' }, { h: 0.12 }, { h: 0 }];
    else if (name === 'double') this.seq = [{ h: 1.3, kind: 'flip2' }, { h: 0.14 }, { h: 0 }];
    else if (name === 'save') this.seq = [{ h: 0.55, kind: 'bad' }, { h: 0.15 }, { h: 0 }];
    else if (name === 'badland') this.seq = [{ h: 0.5, kind: 'bad' }, { h: 0 }];
    else if (name === 'achoo') this.seq = [];
  }

  /** Is he on his way somewhere: a goal along the floor or into the box? */
  private get going() {
    return (
      this.goal !== null ||
      (this.frame !== null && Math.abs(this.depthGoal - this.depth) * this.frame.depth > 1)
    );
  }

  private mates() {
    return this.crew
      .filter((o) => o !== this && o.state === 'here' && o.edge === this.edge && !o.free)
      .sort((a, b) => Math.abs(a.s - this.s) - Math.abs(b.s - this.s));
  }

  private wander(heights: number) {
    this.walkTo(this.s + this.way * this.heightPx * heights);
  }

  private run() {
    if (!this.frame) return;
    this.spec.speed = SPEED * 1.9;
    const [lo, hi] = this.span(this.frame);
    const way = this.s - lo > hi - this.s ? -1 : 1;
    const room = (way > 0 ? hi - this.s : this.s - lo) - this.widthPx() * 1.5;
    this.walkTo(
      this.s + way * Math.max(0, Math.min(room, this.heightPx * (3.5 + Math.random() * 3))),
    );
  }

  private toWall() {
    this.walkTo(this.s + (Math.random() - 0.5) * this.heightPx * 2, 0.9);
  }

  private toLip() {
    this.walkTo(this.s + (Math.random() - 0.5) * this.heightPx * 2, 0);
  }

  private plunge() {
    this.spec.speed = SPEED * 1.4;
    this.walkTo(this.s + this.way * this.heightPx * 0.6, 0.95);
  }

  private orbit() {
    this.centre = { s: this.s, d: Math.min(this.depth, 0.6) };
  }

  private toMate() {
    const o = this.mates()[0];
    if (!o) return;
    this.who = o;
    this.walkTo(o.s + (o.s > this.s ? -1 : 1) * this.heightPx * 0.9, o.depth);
  }

  poke() {
    if (this.state !== 'here') return;
    const now = performance.now() / 1000;
    this.pokes = [...this.pokes.filter((at) => now - at < 3), now];
    if (this.pokes.length >= 3) {
      this.pokes = [];
      this.setAct('dizzy');
    } else if (this.act !== 'dizzy') this.setAct('poked');
  }

  /** Up with a start, arms flung up, antenna whipping. */
  private startle() {
    this.goal = null;
    this.depthGoal = this.depth;
    this.seq = [{ h: 0.55, kind: 'bad' }, { h: 0.18 }, { h: 0 }];
    this.flash = 1;
    this.puppet.kick('antenna.1', 0, 0, 900);
    this.puppet.kick('antenna.2', 0, 0, -900);
  }

  protected onEnter() {
    this.h = 0;
    this.air = false;
    this.hf = 0;
    this.y = LS * 0.93;
    this.vy = 0;
    this.seq = [];
  }

  protected idle(t: number) {
    // Never quite still: the antenna and the arms fidgeting.
    const p = this.puppet;
    p.add('antenna.1', 3 * wobble(t * 0.9, 1), 0, 4 * wobble(t * 0.7, 3));
    p.add('arm.L', 0, 0, 2 * wobble(t * 0.8, 4));
    p.add('arm.R', 0, 0, -2 * wobble(t * 0.8, 5));
  }

  // ---------- The hopping ----------

  /** The base class glides him along; here he only gets anywhere while he is in the air. */
  protected move(dt: number, env: Env) {
    this.frame = env.frame;
    this.crew = env.crew;
    const [s, depth] = [this.s, this.depth];
    super.move(dt, env);
    if (!this.air) [this.s, this.depth] = [s, depth];
  }

  /** The mass on the spring, a step of it: contact (spring), or in the air (parabola). */
  private step(dt: number, a: Pose) {
    const ls = LS * this.rest.y;
    if (!this.air) {
      this.groundT += dt;
      this.vy += (K * (ls - this.y) - G - C * this.vy) * dt;
      this.y += this.vy * dt;
      // Off the ground once the spring has pushed him back to its natural length.
      if (this.y >= ls && this.vy > 0.3) this.takeOff(a);
      // Hop from rest: crouch (kick down) for the next hop; the spring does the rest.
      else if (
        this.groundT > 0.12 &&
        Math.abs(this.vy) < 0.4 &&
        Math.abs(this.y - (ls - G / K)) < 0.012
      ) {
        const next = this.seq[0] ?? { h: a.want };
        if (next.h > 0.01) this.vy = -(1.1 + 2.1 * Math.sqrt(next.h));
      }
      this.y = Math.max(this.y, LS * 0.3);
    } else {
      this.airT += dt;
      this.hf += this.vf * dt;
      this.vf -= G * dt;
      if (this.hf <= 0 && this.vf < 0) this.land();
    }
  }

  private takeOff(a: Pose) {
    const next = this.seq.length ? this.seq.shift()! : { h: a.want };
    let v = this.vy;
    if (next.h > 0.01) v = Math.max(v, Math.sqrt(2 * G * next.h));
    this.hop = next;
    this.air = true;
    this.hf = 0.001;
    this.vf = v;
    this.airT = 0;
    this.airLen = (2 * v) / G;
    this.groundT = 0;
    if (next.kind === 'bad') this.mem.bad = 1;
  }

  private land() {
    const p = this.puppet;
    const v = -this.vf;
    this.air = false;
    this.h = 0;
    this.hf = 0;
    this.y = LS * this.rest.y;
    this.vy = -v;
    this.groundT = 0;
    this.lastLand = v;
    if (this.act === 'beat') this.mem.beats = (this.mem.beats ?? 0) + 1;
    // The landing rattles everything.
    const hard = clamp(v / 3, 0, 1.4);
    p.kick('antenna.1', 700 * hard, 0, (Math.random() - 0.5) * 400 * hard);
    p.kick('antenna.2', 500 * hard);
    p.kick('arm.L', 0, 0, 500 * hard);
    p.kick('arm.R', 0, 0, -500 * hard);
    const side = Math.random() < 0.5 ? -1 : 1;
    this.lean[0].kick(side * 90 * hard * (this.hop.kind === 'bad' ? 4 : 0.5));
    this.lean[1].kick((Math.random() - 0.5) * 60 * hard);
    if (this.hop.kind === 'bad') this.lean[0].kick(side * 900);
  }

  // ---------- The tricks ----------

  private makeTricks(): Record<string, Trick> {
    return {
      idle: (t, a) => {
        // Bounces a little every so often, restless.
        a.want = 0.05 + 0.03 * Math.max(0, sin(t, 0.4));
        a.up = [6 * sin(t, 0.9), 6 * sin(t, 0.9, 0.3)];
      },
      look: (t, a) => {
        a.want = 0.04;
        a.tilt = [4 * sin(t, 0.3), 10 * sin(t, 0.25)];
      },
      hop: () => {},
      boing3: (t, a) => {
        a.want = 0.42;
        a.up = [50 + 20 * sin(t, 2.6), 50 - 20 * sin(t, 2.6)];
      },
      charge: (t, a) => {
        // Squatting down and down as the spring winds up, shaking; then the leap.
        const k = ramp(t, 0.2, 2.6);
        const gone = t > 2.6;
        a.rest = gone ? 1 : 1 - 0.55 * k;
        a.want = 0;
        a.shake = gone ? 0 : k;
        a.up = [-15 * k, -15 * k];
        a.ant = [-10 * k, 0];
        a.face = gone ? 'surprised' : 'focused';
        // Hold the take-off until the spring is wound.
        if (!gone) {
          this.seq = [{ h: 1.05 }, { h: 0.3 }, { h: 0.14 }, { h: 0 }];
          this.hold = true;
        } else this.hold = false;
        if (t > 2.6 && t < 4) a.up = [110, 110];
      },
      triple: (t, a) => {
        a.up = [35 * bump(t - 0.7, 0.5) + 60 * bump(t - 1.3, 0.5) + 100 * bump(t - 2, 0.6), 0];
        a.up[1] = a.up[0];
      },
      flip: (t, a) => {
        const k = this.hop.kind === 'flip' && this.air ? 1 : 0;
        a.up = [70 * k, 70 * k];
        a.face = k ? 'surprised' : 'happy';
      },
      spinjump: (t, a) => {
        const k = this.hop.kind === 'spin' && this.air ? 1 : 0;
        a.up = [95 * k, 95 * k];
      },
      higher: (t, a, len) => {
        // Bouncing on the spot, higher and higher; then he settles.
        a.want = 0.06 + 0.8 * ramp(t, 0, len - 1.8) * (t < len - 0.6 ? 1 : 0);
        const s = Math.sin(2 * Math.PI * t * 1.7);
        a.up = [30 + 60 * ramp(t, 0, 5) * Math.max(0, s), 30 + 60 * ramp(t, 0, 5) * Math.max(0, s)];
      },
      badland: (t, a) => {
        // A wobbly landing, and the spring goes on wobbling; he pats himself back into shape.
        const after = this.mem.bad ? 1 : 0;
        a.want = 0;
        a.face = after && !this.air ? 'dizzy' : 'surprised';
        a.up = this.air
          ? [60, 60]
          : [20 * Math.sin(2 * Math.PI * 1.9 * t), -20 * Math.sin(2 * Math.PI * 1.9 * t)];
        a.tilt = [0, 0];
        a.ant = [0, 12 * after * Math.sin(2 * Math.PI * 2.2 * t)];
        if (t > 4.4) a.face = 'happy';
      },
      wall: (t, a, len) => {
        // Bounces up to the back wall, squashes flat on it and sproings back.
        const near = this.depth > 0.75;
        if (!this.mem.hit) {
          a.want = this.going ? 0.28 : near ? 0.5 : 0.05;
          if (near && !this.going && t > 2 && !this.air && !this.mem.jump) {
            this.mem.jump = 1;
            this.seq = [{ h: 0.55, kind: 'wall' }, { h: 0 }];
          }
        }
        if (this.hop.kind === 'wall' && this.air) {
          const u = this.airT / this.airLen;
          a.tilt = [-26 * bump(u - 0.5, 0.4), 0];
          a.up = [80, 80];
          if (u > 0.45 && !this.mem.hit) {
            // Splat, and a sproing back toward us.
            this.mem.hit = 1;
            this.flash = 1;
            this.vf = Math.max(this.vf, 1.2);
            this.walkTo(this.s + this.way * this.heightPx * 1.4, 0.3);
            this.puppet.kick('antenna.1', -800);
            this.puppet.kick('body', -400);
          }
          a.face = u > 0.4 ? 'surprised' : 'happy';
        }
        if (this.mem.hit) {
          a.want = this.going ? 0.3 : 0.05;
          a.face = 'happy';
        }
        if (t > len - 0.5) a.want = 0.05;
      },
      jitter: (t, a) => {
        a.want = 0.02;
        a.shake = 1;
        a.up = [12 * sin(t, 11), -12 * sin(t, 11)];
      },
      deflate: (t, a) => {
        // A slow sigh, sinking down on the spring, then a boing back to life.
        const down = ramp(t, 0.6, 3.2);
        const boing = t > 5.4;
        a.rest = boing ? 1 : 1 - 0.58 * down;
        a.want = 0;
        a.tilt = [10 * down * (boing ? 0 : 1), 0];
        a.up = [-25 * down, -25 * down];
        a.ant = [50 * down * (boing ? 0 : 1), 0];
        a.face = t < 5.4 ? 'sad' : 'happy';
        if (boing && !this.mem.boing) {
          this.mem.boing = 1;
          this.seq = [{ h: 0.6 }, { h: 0.2 }, { h: 0 }];
        }
        if (boing) a.up = [70, 70];
      },
      eight: (t, a) => this.eight(t, a),
      plunge: (t, a, len) => {
        a.want = this.going ? 0.3 : 0.06;
        if (t > len * 0.45 && !this.mem.back) {
          this.mem.back = 1;
          this.spec.speed = SPEED * 1.4;
          this.walkTo(this.s - this.way * this.heightPx * 0.4, 0.1);
        }
        a.up = [30, 30];
      },
      hiccup: (t, a) => {
        a.want = 0;
        for (const [k, at] of [0.7, 1.9, 3].entries()) {
          if (t > at && !this.mem[`h${k}`]) {
            this.mem[`h${k}`] = 1;
            this.seq = [{ h: 0.13 + 0.05 * k }, { h: 0 }];
            this.puppet.kick('antenna.1', 500);
          }
        }
        a.face = this.air ? 'surprised' : 'neutral';
        a.tilt = [-5 * bump(t - 0.7, 0.3) - 5 * bump(t - 1.9, 0.3), 0];
      },
      achoo: (t, a) => {
        // Winds back, squatting, ah... ah... and a sneeze that pops him off the floor.
        const k = ramp(t, 0.2, 1.7) * (t < 1.9 ? 1 : 0);
        a.rest = 1 - 0.3 * k;
        a.want = 0;
        a.tilt = [-14 * k, 0];
        a.up = [-20 * k, -20 * k];
        a.face = t < 1.9 ? 'sleepy' : 'surprised';
        if (t > 1.9 && !this.mem.pop) {
          this.mem.pop = 1;
          this.seq = [{ h: 0.5 }, { h: 0 }];
          this.puppet.kick('antenna.1', 1200);
          this.flash = 1;
        }
        if (t > 1.9 && t < 2.6) a.tilt = [22 * bump(t - 2.1, 0.4), 0];
        if (t > 2.8) a.face = 'happy';
      },
      tall: (t, a) => {
        const k = ramp(t, 0.2, 0.8) * (1 - ramp(t, 2.4, 3.2));
        a.rest = 1 + 0.3 * k;
        a.want = 0;
        a.up = [140 * k, 140 * k];
        a.tilt = [-6 * k, 0];
        a.ant = [-15 * k, 0];
        a.face = k > 0.5 ? 'happy' : 'neutral';
      },
      squash: (t, a) => {
        // Pressing himself flat, peeking out, then popping up.
        const k = ramp(t, 0.2, 0.8) * (1 - ramp(t, 3.6, 3.9));
        a.rest = 1 - 0.6 * k;
        a.want = 0;
        a.up = [-25 * k, -25 * k];
        a.ant = [40 * k, 0];
        a.face = t < 3.9 ? 'focused' : 'happy';
        a.tilt = [0, 25 * k * sin(t, 0.35)];
        if (t > 3.9 && !this.mem.pop) {
          this.mem.pop = 1;
          this.seq = [{ h: 0.4 }, { h: 0 }];
        }
      },
      dance: (t, a) => {
        a.want = 0.16;
        a.lean = [12 * sin(t, 0.8), 0];
        a.tilt = [0, 0];
        const s = sin(t, 1.6);
        a.up = [70 + 40 * s, 70 - 40 * s];
      },
      nap: (t, a, len) => {
        // Asleep on his feet, swaying slowly on the spring; a start awake at the end.
        const sleep = 1 - ramp(t, len - 1.4, len - 1.1);
        a.rest = 0.9;
        a.want = 0;
        a.lean = [7 * sleep * sin(t, 0.16), 3 * sleep * sin(t, 0.11)];
        a.tilt = [12 * sleep * (0.5 + 0.5 * sin(t, 0.12)), 0];
        a.up = [-18 * sleep, -18 * sleep];
        a.ant = [40 * sleep, 0];
        a.face = t > len - 1.4 ? 'surprised' : 'asleep';
        if (t > len - 1.3 && !this.mem.jump) {
          this.mem.jump = 1;
          this.seq = [{ h: 0.3 }, { h: 0 }];
        }
      },
      mega: (t, a) => {
        // Winds down low, then a leap that nearly scrapes the ceiling and a soft ring-out.
        const k = ramp(t, 0.2, 2.4);
        const gone = t > 2.4;
        a.rest = gone ? 1 : 1 - 0.6 * k;
        a.want = 0;
        a.shake = gone ? 0 : k * 0.8;
        a.up = [-20 * k, -20 * k];
        a.ant = [-15 * k, 0];
        a.face = gone ? 'surprised' : 'focused';
        if (!gone) {
          this.seq = [{ h: 1.55 }, { h: 0.35 }, { h: 0.12 }, { h: 0 }];
          this.hold = true;
        } else a.up = [150, 150];
        if (t > 5) a.face = 'happy';
      },
      double: (t, a) => {
        const k = this.hop.kind === 'flip2' && this.air ? 1 : 0;
        a.up = [80 * k, 80 * k];
        a.face = k ? 'surprised' : 'happy';
      },
      save: (t, a) => {
        // A wild landing: the spring lurches and he windmills his arms to right himself.
        const after = this.mem.bad ? 1 : 0;
        const w = after * clamp(1 - (t - 1.2) / 2.6, 0, 1);
        a.want = 0;
        a.face = this.air ? 'surprised' : t < 3.6 && after ? 'focused' : 'happy';
        const ph = 2 * Math.PI * 2.4 * t;
        a.up = this.air ? [70, 70] : [70 + 70 * w * Math.sin(ph), 70 - 70 * w * Math.sin(ph)];
        a.swing = [40 * w * Math.cos(ph), -40 * w * Math.cos(ph)];
        a.lean = [-16 * w * Math.sin(ph * 0.5), 0];
        a.ant = [0, 20 * w * Math.sin(ph)];
        if (t > 3.8 && t < 4.6) a.up = [110 * bump(t - 4.2, 0.4), 110 * bump(t - 4.2, 0.4)];
      },
      beat: (t, a) => {
        // Bouncing in place to a steady rhythm, arms pumping; a pip lights for each bounce.
        a.want = 0.16;
        a.lean = [5 * sin(t, 0.9), 0];
        a.tilt = [0, 8 * sin(t, 0.9)];
        const s = sin(t, 1.8);
        a.up = [60 + 45 * s, 60 - 45 * s];
      },
      nervous: (t, a) => {
        // Tiny quick hops, shivering, glancing left and right.
        a.want = 0.07;
        a.shake = 0.7;
        a.tilt = [0, 30 * Math.sign(sin(t, 0.7)) * Math.min(1, Math.abs(sin(t, 0.7)) * 4)];
        a.up = [25 + 10 * sin(t, 9), 25 - 10 * sin(t, 9)];
        a.ant = [-10, 14 * sin(t, 7)];
      },
      yawn: (t, a) => {
        // Stretching the spring up with arms high and a big yawn, then sagging happily.
        const up = ramp(t, 0.3, 2.4) * (1 - ramp(t, 2.9, 3.5));
        const sag = ramp(t, 3.5, 4.2) * (1 - ramp(t, 5, 5.7));
        a.rest = 1 + 0.32 * up - 0.16 * sag;
        a.want = 0;
        a.up = [150 * up - 15 * sag, 150 * up - 15 * sag];
        a.tilt = [-14 * up + 8 * sag, 0];
        a.ant = [-25 * up + 30 * sag, 0];
        a.face = up > 0.3 ? 'sleepy' : sag > 0.3 ? 'sleepy' : 'neutral';
        if (t > 5.4) a.face = 'happy';
      },
      wave: (t, a) => {
        a.want = 0.09;
        const k = ramp(t, 0.2, 0.6);
        a.up = [150 * k + 15 * sin(t, 2.4) * k, 0];
        a.tilt = [0, 0];
        a.ant = [0, 10 * sin(t, 1.2)];
      },
      signal: (t, a) => {
        // Antenna going round like a transmitter, the light flashing.
        a.want = 0.03;
        const ph = 2 * Math.PI * 1.1 * t;
        a.ant = [22 * Math.cos(ph), 22 * Math.sin(ph)];
        a.up = [40, 40];
      },
      lipview: (t, a) => {
        const k = ramp(t, 2, 2.8) * (1 - ramp(t, 5, 5.8));
        a.want = this.going ? 0.25 : 0.04;
        a.lean = [0, 14 * k];
        a.tilt = [22 * k, 0];
        a.up = [-10 * k, -10 * k];
      },
      visit: (t, a) => {
        const k = ramp(t, 2.2, 2.8) * (1 - ramp(t, 5, 5.6));
        a.want = this.going ? 0.25 : 0.14 * k + 0.04;
        a.up = [140 * k * (0.7 + 0.3 * sin(t, 2.2)), 0];
        if (this.who && this.frame) {
          const o = this.who.eyePoint(this.frame);
          const me = this.eyePoint(this.frame);
          a.tilt = [0, clamp(Math.atan2(o.x - me.x, this.heightPx * 2) * DEG, -45, 45) * k];
        }
      },
      poked: (t, a) => {
        const k = bump(t - 0.5, 0.9);
        a.want = 0;
        a.up = [140 * k, 140 * k];
        a.ant = [-30 * bump(t - 0.6, 0.6), 0];
        a.face = t < 1.8 ? 'surprised' : 'happy';
      },
      love: (t, a) => {
        a.want = 0.24;
        a.up = [110 + 40 * sin(t, 2), 110 - 40 * sin(t, 2)];
        a.lean = [8 * sin(t, 0.8), 0];
        a.ant = [0, 15 * sin(t, 1.4)];
      },
      dizzy: (t, a) => {
        // Bouncing about all over the place, the spring flopping.
        const w = clamp(1 - t / 5, 0, 1);
        a.want = 0.14 * w + 0.03;
        a.lean = [22 * w * sin(t, 0.8), 14 * w * sin(t, 0.8, 0.25)];
        a.tilt = [8 * w * sin(t, 1.1), 0];
        a.up = [50 + 40 * sin(t, 1.3), 50 - 40 * sin(t, 1.3)];
        a.ant = [0, 30 * w * sin(t, 1.2)];
      },
    };
  }

  /** Hopping round a figure eight about where the act began. */
  private eight(t: number, a: Pose) {
    const f = this.frame;
    if (!f) return;
    const r = this.heightPx * 1.4;
    const w = 0.5;
    const th = w * t * this.way;
    const c = this.centre;
    this.spec.speed = SPEED * 1.5;
    this.walkTo(c.s + r * Math.sin(th), clamp(c.d + 0.26 * Math.sin(2 * th), 0.05, 0.95));
    a.want = 0.28;
    a.up = [50, 50];
  }

  private hold = false;

  // ---------- Each frame ----------

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    const t = this.actT;
    const act = this.act;
    this.frame = env.frame;
    this.crew = env.crew;
    const time = env.time;

    // Petted: he can't contain himself.
    this.hover = this.hovered ? this.hover + dt : 0;
    const calm = ['idle', 'look', 'hop', 'wave', 'nap', 'signal', 'tall', 'jitter', 'hiccup'];
    if (this.hover > 0.5 && calm.includes(act) && !this.air) this.setAct('love');
    else if (act === 'love' && !this.hovered && t > 1.5) this.setAct('idle');

    const a = blank();
    this.hold = false;
    this.tricks[act]?.(t, a, this.actLength);
    // On his way somewhere (or a hop or two behind): a steady hop each time round.
    if (this.going && a.want < 0.2 && act !== 'wall') a.want = Math.max(a.want, 0.2);
    // Winding up (the charge): don't let him go yet.
    const seq = this.seq;
    if (this.hold) this.seq = [];
    this.rest.update(dt, a.rest);
    const n = Math.ceil(dt / (1 / 120));
    for (let i = 0; i < n; i++) this.step(dt / n, a);
    if (this.hold) this.seq = seq;
    this.pose0 = a;
    this.expression = a.face ?? (this.hovered ? 'happy' : 'neutral');

    // The spring's length as we see it (squashed on the ground, stretched going up).
    let L: number;
    if (!this.air) L = this.y / LS;
    else L = this.rest.y * (1 + 0.16 * clamp(this.vf / 3, -1, 1));
    L = this.shown.update(dt, clamp(L, 0.42, 1.42));
    this.h = this.hf * this.heightPx;
    this.compress = clamp((1 - L) / 0.5, 0, 1);

    // Squash and stretch: the body fattens as the spring squashes, thins as it stretches.
    const sy = clamp(1 + 0.32 * (L - 1), 0.88, 1.1);
    const sx = 1 / Math.sqrt(sy);
    p.stretch('body', sy, [0, 1, 0], sx);
    let shake = 0;
    if (a.shake > 0) shake = a.shake * Math.sin(time * 90) * 0.5;

    // The spring bends sideways and forward with its own slow wobble.
    const lz = this.lean[0].update(
      dt,
      a.lean[0] + 2 * a.shake * Math.sin(time * 40) + 2 * wobble(time * 0.5, 2),
    );
    const lx = this.lean[1].update(dt, a.lean[1]);
    const w = [0.5, 0.3, 0.2];
    let px = 0;
    let pz = 0;
    let cz = 0;
    let cx = 0;
    const parts = ['lo', 'mid', 'hi'];
    parts.forEach((part, i) => {
      p.add(`spring.${part}`, w[i] * lx, 0, w[i] * lz);
      // The parts sit on each other, so they move up as the ones below stretch.
      cz += w[i] * lz;
      cx += w[i] * lx;
      const len = THIRD * L;
      px += -len * Math.sin(cz / DEG);
      pz += len * Math.sin(cx / DEG);
    });
    const across = clamp(1 + 0.3 * (1 - L), 0.9, 1.25);
    parts.forEach((part, i) => {
      const name = `spring.${part}`;
      p.stretch(name, L, [0, 1, 0], across);
      p.shift(name, 0, i * THIRD * (L - 1), 0);
    });
    // The body sits on the top of the spring, wherever that has got to.
    const dy = SPRING * (L - 1) + 0.16 * (sy - 1);
    p.shift('body', px + 0.004 * shake, dy, pz);
    p.add('body', cx + a.tilt[0], a.tilt[1], cz);

    // Arms: hanging out and down, flung up when he's excited, swinging as he hops.
    const air = this.air ? 1 : 0;
    const bob = clamp(this.vf / 3, -1, 1) * air;
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 'L' : 'R';
      const sg = i === 0 ? 1 : -1;
      const up = a.up[i] + (this.air ? 35 + 25 * bob : 8 * this.compress) + 4 * shake * 20;
      p.add(`arm.${s}`, -a.swing[i], 0, sg * clamp(up, -25, 160));
    }
    // Antenna: droops or sways with the act, whips with the hop.
    p.add('antenna.1', a.ant[0] - 6 * bob, 0, a.ant[1]);
    p.add('antenna.2', a.ant[0] * 0.4, 0, a.ant[1] * 0.4);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.5);
  }

  /** The belt's pips fill as the spring is charged and chase up as he lets go. */
  private lights(time: number) {
    const act = this.act;
    const t = this.actT;
    for (let i = 0; i < PIPS; i++) {
      let level: number;
      let tone: string | undefined;
      if (act === 'poked') {
        level = clamp(1.6 - t, 0, 1) * (Math.sin(time * 30) > 0 ? 1 : 0.5);
        tone = BEACON.surprised;
      } else if (act === 'dizzy') {
        level = Math.sin(time * 7 + i * 2.3) > 0.1 ? 1 : 0.1;
        tone = RAINBOW[(i * 3 + Math.floor(time * 4)) % RAINBOW.length];
      } else if (act === 'deflate') {
        level = t > 5.4 ? 1 : clamp(0.5 - t / 8, 0, 0.5) * (i < 2 ? 1 : 0.3);
        tone = t > 5.4 ? BEACON.happy : BEACON.sad;
      } else if (act === 'beat') {
        // One more pip lit for every bounce, then all out and start again.
        const n = (this.mem.beats ?? 0) % (PIPS + 1);
        level = i < n ? 1 : 0.06;
        tone = RAINBOW[i % RAINBOW.length];
      } else if (act === 'nap') {
        level = 0.12 + 0.1 * Math.sin(time * 0.8 + i);
      } else if (this.air) {
        // Off the ground: a rush of light up the belt.
        const u = this.airT / this.airLen;
        level = bump(u * 1.6 - 0.3 - i * 0.18, 0.3);
        tone = RAINBOW[i % RAINBOW.length];
      } else if (act === 'love') {
        level = 0.6 + 0.4 * Math.sin(time * 3 - i * 0.9);
        tone = BEACON.love;
      } else if (act === 'jitter') {
        level = Math.sin(time * 40 + i * 5) > 0 ? 1 : 0.15;
        tone = BEACON.happy;
      } else {
        // Charging: the pips fill as the spring is squashed.
        level = clamp(this.compress * 5.2 - i, 0, 1);
        tone = level > 0 ? RAINBOW[i % RAINBOW.length] : undefined;
        if (!this.compress && act === 'idle') level = 0.4 * bump(cycle(time / 3) - i * 0.07, 0.1);
      }
      this.outfit.dot(i, level, tone);
    }
    let mood = BEACON[this.expression] ?? '#f4f4f1';
    if (act === 'signal') mood = RAINBOW[Math.floor(time * 6) % RAINBOW.length];
    this.outfit.beacon(this.flash > 0.3 ? BEACON.surprised! : mood);
  }

  protected after(_dt: number, env: Env) {
    this.lights(env.time);
    // Somersaults and spin jumps turn the whole robot about its middle, in the air only.
    const hop = this.hop;
    let rx = 0;
    let ry = 0;
    if (this.air) {
      const u = clamp(this.airT / this.airLen, 0, 1);
      if (hop.kind === 'flip') rx = 2 * Math.PI * smooth((u - 0.08) / 0.84);
      else if (hop.kind === 'flip2') rx = 4 * Math.PI * smooth((u - 0.06) / 0.88);
      else if (hop.kind === 'spin') ry = 2 * Math.PI * smooth((u - 0.08) / 0.84);
    }
    this.pivot.rotation.x = rx;
    this.pivot.rotation.y = ry;
  }
}
