import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Act, Character, clamp, type Env, type Frame } from './character';
import type { Expression, FaceLayout } from './face';
import { sin } from './moves';
import { Spring, wobble } from './spring';

/**
 * Uno, the robot unicyclist: a slim upright body on one fat, treaded wheel, a screen face
 * under a little top hat and two thin rubber-hose arms held out for balance. He is never
 * still: a constant small sway and correction about the wheel's contact patch, the arms
 * counter-waving, a lean into whichever way he is going and a rock back and forth when he
 * stands. The wheel really turns as he rolls, so he can only go as fast as it spins, and
 * six lit pips sit on its hub: one glows as it passes the top when he is rocking, the lot
 * shimmer when he rides, and a rainbow chases round when he shows off. The hat band is the
 * mood light.
 *
 * He is a cheerful, slightly clumsy show-off with about thirty tricks: riding about, in
 * circles, in a figure eight, with one hand up, backwards (looking over his shoulder at
 * us), or flat out; juggling three balls that live in his chest; a wheelie-hop, bunny hops,
 * hopping over something; spinning like a top, a pirouette, getting dizzy after it; a
 * slow-motion near-fall with the arms windmilling, a proper dramatic fall and a bounce back
 * up, a bow, a wave, a drum roll and ta-da, a victory pump, revving the wheel, tipping the
 * hat, a nap on the wheel with a jerk awake, a shrug; riding to the front lip or the back
 * wall for a look, or over to a crewmate to say hello.
 *
 * A poke and he throws up his arms and hops; three pokes and he spins, then wobbles about
 * dizzy. Rest the mouse on him and he is delighted: hat tipped, arms up, a little hop. A little spring and ball on top of the hat keeps bobbing after him, and in a fright the hat pops up on it.
 */
export const UNICYCLE_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.3, 0.42],
    [0.7, 0.42],
  ],
  rx: 0.09,
  ry: 0.24,
  line: 0.032,
  mouth: [0.5, 0.76],
};

/** Wheel radius in metres, and the number of pips on its hub. */
const WHEEL = 0.105;
const PIPS = 6;
const DEG = 180 / Math.PI;
const SPEED = 2.2;
const smooth = (x: number) => {
  const u = clamp(x, 0, 1);
  return u * u * (3 - 2 * u);
};
/** 0 before `a`, 1 after `b`, easing between. */
const ramp = (t: number, a: number, b: number) => smooth((t - a) / (b - a));
/** 1 at 0, falling to 0 at ±width. */
const bump = (x: number, width: number) => Math.max(0, 1 - Math.abs(x) / width);
const wrap = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;
const pair = (v = 0): [number, number] => [v, v];

/** What an act asks of the body this frame (degrees unless it says); rest is all zeros. */
interface Pose {
  /** Lean of the whole bike forward (+) about the axle, and sideways (+ to his right). */
  fwd: number;
  side: number;
  /** How much of the constant balancing wobble there is: 1 as usual, 0 when he's beyond it. */
  bal: number;
  /** The body twisting on the seat, and the head: pitch, yaw, roll. */
  twist: number;
  head: [number, number, number];
  /** Per arm (left, right): raised (+ up), swung forward, elbow bent up, wrist. */
  up: [number, number];
  swing: [number, number];
  bend: [number, number];
  wrist: [number, number];
  /** Hat tipped back (+) or forward (-), and lifted off (metres). */
  hat: number;
  hatUp: number;
  /** Up off the floor, in his heights, and the body sinking on the seat (metres). */
  lift: number;
  dip: number;
  /** Turned about the vertical (degrees, on top of where he faces). */
  spin: number;
  /** The wheel turned further than the ground says (degrees), for rocking and revving. */
  wheel: number;
  /** Tipped over about his contact point, degrees (the fall). */
  fall: number;
  /** Riding backwards, and juggling. */
  back: boolean;
  balls: boolean;
  face?: Expression;
}

const blank = (): Pose => ({
  fwd: 0,
  side: 0,
  bal: 1,
  twist: 0,
  head: [0, 0, 0],
  up: pair(),
  swing: pair(),
  bend: pair(),
  wrist: pair(),
  hat: 0,
  hatUp: 0,
  lift: 0,
  dip: 0,
  spin: 0,
  wheel: 0,
  fall: 0,
  back: false,
  balls: false,
});

type Trick = (t: number, a: Pose, len: number) => void;

export class Unicycle extends Character {
  private frame: Frame | null = null;
  private crew: readonly Character[] = [];
  private pokes: number[] = [];
  private hover = 0;
  private lastStride = 0;
  private lastLift = 0;
  /** How far the wheel has turned (degrees), and the extra turn an act asks for. */
  private roll = 0;
  private dir = 1;
  /** The balancing wobble's own gain, so it fades in and out. */
  private bal = new Spring(3, 0.8, 1, 1);
  private reverse = new Spring(3.2, 0.7, 1, 0);
  private balls = [new Spring(8, 0.8), new Spring(8, 0.8), new Spring(8, 0.8)];
  private pop = [new Spring(10, 0.7), new Spring(10, 0.7), new Spring(10, 0.7)];
  /** Where a circling act is centred, and the extra state a trick keeps. */
  private centre = { s: 0, d: 0 };
  private way = 1;
  private who: Character | null = null;
  private pose0: Pose = blank();
  private tricks: Record<string, Trick> = {};

  constructor(model: Object3D) {
    super(
      {
        name: 'Uno',
        model: 'unicycle',
        metres: 0.72,
        width: 0.34,
        size: 1.05,
        feels: {
          default: { f: 4, zeta: 0.6 },
          root: { f: 3, zeta: 0.42 },
          frame: { f: 3.5, zeta: 0.5 },
          body: { f: 4, zeta: 0.5 },
          head: { f: 3.2, zeta: 0.55, r: 0.3 },
          hat: { f: 5, zeta: 0.2 },
          topper: { f: 7, zeta: 0.12, r: 1.4 },
          'upper_arm.L': { f: 5, zeta: 0.42 },
          'upper_arm.R': { f: 5, zeta: 0.42 },
          'forearm.L': { f: 6, zeta: 0.35 },
          'forearm.R': { f: 6, zeta: 0.35 },
          'hand.L': { f: 7, zeta: 0.3 },
          'hand.R': { f: 7, zeta: 0.3 },
        },
        face: UNICYCLE_FACE,
        eyes: 0.78,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.9 },
          { bone: 'body', yaw: 0.2, pitch: 0 },
        ],
        reach: { yaw: 60, pitch: 30 },
        lag: 1.6,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [50, 110],
        speed: SPEED,
        turn: 80,
      },
      model,
    );
    this.tricks = this.makeTricks();
    this.acts = this.moves();
  }

  // ---------- The acts ----------

  private moves(): Record<string, Act> {
    const still = () => !this.walking;
    const mates = () => this.mates().length > 0;
    const ride = (heights: number) => () => {
      this.way = Math.random() < 0.5 ? -1 : 1;
      this.walkTo(this.s + this.way * this.heightPx * heights);
    };
    return {
      idle: { weight: 3, length: [3, 6] },
      rock: { weight: 1.6, length: [3.5, 6], when: still },
      look: { weight: 1.2, length: [3, 5], when: still },
      ride: { weight: 2, length: [1.6, 3], when: still, start: ride(1.4 + Math.random() * 1.6) },
      sprint: {
        weight: 0.7,
        length: [3, 4.5],
        face: 'happy',
        when: still,
        start: () => this.sprint(),
      },
      circles: {
        weight: 0.7,
        length: [6, 8],
        face: 'happy',
        when: still,
        start: () => this.orbit(),
      },
      eight: {
        weight: 0.6,
        length: [8, 9.5],
        face: 'happy',
        when: still,
        start: () => this.orbit(),
      },
      onehand: {
        weight: 0.5,
        length: [6, 8],
        face: 'happy',
        when: still,
        start: () => this.orbit(),
      },
      backwards: { weight: 0.5, length: [3.5, 5], when: still, start: ride(1.2 + Math.random()) },
      hopover: {
        weight: 0.4,
        length: [2.8, 3.2],
        face: 'happy',
        when: still,
        start: () => this.hopOver(),
      },
      lipview: { weight: 0.4, length: [5.5, 7], when: still, start: () => this.toDepth(0) },
      peek: { weight: 0.4, length: [6, 8], when: still, start: () => this.toDepth(0.92) },
      visit: {
        weight: 0.5,
        length: [6, 8],
        when: () => still() && mates(),
        start: () => this.toMate(),
      },
      juggle: { weight: 0.9, length: [8, 11], face: 'happy', when: still },
      wheeliehop: { weight: 0.6, length: [2.6, 2.6], face: 'happy', when: still },
      bunny: { weight: 0.6, length: [3, 3], face: 'happy', when: still },
      spin: { weight: 0.5, length: [3.2, 3.2], face: 'happy', when: still },
      pirouette: { weight: 0.5, length: [2.6, 2.6], face: 'happy', when: still },
      giddy: { weight: 0.4, length: [6.5, 6.5], when: still },
      wobble: { weight: 0.7, length: [5, 5], face: 'surprised', when: still },
      fall: { weight: 0.35, length: [6.2, 6.2], when: still },
      wave: { weight: 1, length: [3, 4.5], face: 'happy', when: still },
      bow: { weight: 0.6, length: [3.6, 3.6], face: 'happy', when: still },
      tiphat: { weight: 0.6, length: [3.6, 3.6], face: 'happy', when: still },
      pump: { weight: 0.5, length: [3.4, 3.4], face: 'happy', when: still },
      tada: { weight: 0.5, length: [4.4, 4.4], when: still },
      revs: { weight: 0.4, length: [3.6, 3.6], face: 'focused', when: still },
      shrug: { weight: 0.5, length: [3, 3], when: still },
      doze: { weight: 0.4, length: [8, 11], face: 'asleep', when: still },
      hatpop: { weight: 0.4, length: [3.4, 3.4], face: 'surprised', when: still },
      // Reactions
      poked: { weight: 0, length: [2.4, 3], face: 'surprised' },
      love: { weight: 0, length: [60, 60], face: 'love' },
      dizzy: { weight: 0, length: [5.5, 5.5], face: 'dizzy' },
    };
  }

  protected setAct(name: string) {
    this.way = Math.random() < 0.5 ? -1 : 1;
    this.who = null;
    this.spec.speed = SPEED;
    this.centre = { s: this.s, d: this.depth };
    super.setAct(name);
    if (name === 'backwards') this.spec.speed = SPEED * 0.8;
    if (name === 'hopover') this.spec.speed = SPEED * 0.65;
  }

  private mates() {
    return this.crew
      .filter((o) => o !== this && o.state === 'here' && o.edge === this.edge && !o.free)
      .sort((a, b) => Math.abs(a.s - this.s) - Math.abs(b.s - this.s));
  }

  private toDepth(depth: number) {
    this.walkTo(this.s + (Math.random() - 0.5) * this.heightPx * 3, depth);
  }

  private toMate() {
    const o = this.mates()[0];
    if (!o) return;
    this.who = o;
    this.walkTo(o.s + (o.s > this.s ? -1 : 1) * this.heightPx * 0.9, o.depth);
  }

  private sprint() {
    if (!this.frame) return;
    this.spec.speed = SPEED * 2;
    const [lo, hi] = this.span(this.frame);
    const way = this.s - lo > hi - this.s ? -1 : 1;
    const room = (way > 0 ? hi - this.s : this.s - lo) - this.widthPx() * 1.5;
    this.walkTo(
      this.s + way * Math.max(0, Math.min(room, this.heightPx * (3 + Math.random() * 3))),
    );
  }

  /** Round and round about where he is: the act's own path drives the goal each frame. */
  private orbit() {
    this.centre = { s: this.s, d: Math.min(this.depth, 0.6) };
    this.way = Math.random() < 0.5 ? -1 : 1;
  }

  private hopOver() {
    this.walkTo(this.s + this.way * this.heightPx * 2);
  }

  poke() {
    if (this.state !== 'here') return;
    const now = performance.now() / 1000;
    this.pokes = [...this.pokes.filter((at) => now - at < 3), now];
    if (this.pokes.length >= 3) {
      this.pokes = [];
      this.setAct('dizzy');
    } else if (this.act !== 'dizzy') {
      this.goal = null;
      this.depthGoal = this.depth;
      this.setAct('poked');
      this.puppet.kick('hat', 700);
      this.puppet.kick('topper', 900);
      this.puppet.kick('frame', -260);
    }
  }

  protected onEnter() {
    this.h = 0;
    this.roll = 0;
    this.pose0 = blank();
  }

  protected idle(t: number) {
    // The head never quite still.
    this.puppet.add('head', 1.5 * wobble(t * 0.4, 5), 0, 2 * wobble(t * 0.3, 2));
  }

  // ---------- The tricks ----------

  private makeTricks(): Record<string, Trick> {
    return {
      idle: () => {},
      look: (t, a) => {
        a.head = [4 * sin(t, 0.3), 32 * sin(t, 0.22), 6 * sin(t, 0.22, 0.25)];
      },
      rock: (t, a) => {
        // Leaning forward and back, the wheel rolling under him to catch it.
        a.fwd = 8 * sin(t, 0.6);
        a.wheel = 34 * sin(t, 0.6, -0.12);
        a.up = [12 * sin(t, 0.6, 0.5), -12 * sin(t, 0.6, 0.5)];
      },
      ride: () => {},
      sprint: (_t, a) => {
        a.fwd = 6;
        a.swing = [40, 40];
        a.up = [-25, -25];
        a.bend = [-30, -30];
      },
      circles: (t, a) => this.circle(t, a),
      eight: (t, a) => this.circle(t, a, true),
      onehand: (t, a) => {
        this.circle(t, a);
        a.up[0] = 118;
        a.bend[0] = 12 * sin(t, 1.6);
        a.wrist[0] = 20 * sin(t, 1.6);
      },
      backwards: (_t, a) => {
        a.back = true;
        a.up = [15, 15];
      },
      hopover: (t, a) => {
        const u = clamp((t - 0.45) / 1.1, 0, 1);
        a.lift = 0.36 * 4 * u * (1 - u);
        a.up = pair(70 * bump(u - 0.5, 0.6));
        a.fwd = -6 * bump(u - 0.5, 0.5);
        a.dip = -0.02 * bump(u - 0.5, 0.5);
      },
      lipview: (t, a) => {
        a.head = [30 * ramp(t, 2, 2.8) * (1 - ramp(t, 5, 5.8)), 10 * sin(t, 0.4), 0];
        a.fwd = 6 * ramp(t, 2, 2.8) * (1 - ramp(t, 5, 5.8));
        a.up = [-20, -20];
      },
      peek: (t, a) => {
        const k = ramp(t, 2, 2.8) * (1 - ramp(t, 5.4, 6.2));
        a.head = [-18 * k, 45 * sin(t, 0.35) * k, 8 * k];
        a.swing = pair(20 * k);
      },
      visit: (t, a) => {
        const k = ramp(t, 2.2, 2.8) * (1 - ramp(t, 5, 5.6));
        a.up[0] = 118 * k;
        a.bend[0] = 20 * sin(t, 2.2) * k;
        a.wrist[0] = 30 * sin(t, 2.2) * k;
        a.head = [0, 0, 8 * k];
        if (this.who && this.frame) {
          const o = this.who.eyePoint(this.frame);
          const me = this.eyePoint(this.frame);
          a.head[1] = clamp(Math.atan2(o.x - me.x, this.heightPx * 2) * DEG, -50, 50) * k;
        }
      },
      juggle: (t, a, len) => {
        const on = ramp(t, 0.5, 1.2) * (1 - ramp(t, len - 1.4, len - 0.6));
        a.balls = t > 0.5 && t < len - 0.6;
        a.swing = pair(62 * on);
        a.up = pair(-18 * on);
        a.bend = pair(28 * on);
        // A hand bobs as each ball drops into it.
        const beat = (t * 2 * Math.PI) / 0.62;
        a.bend[0] += 14 * on * Math.sin(beat);
        a.bend[1] += 14 * on * Math.sin(beat + Math.PI);
        a.head = [-4, 26 * sin(t, 1.6) * 0.3, 0];
        a.fwd = 3 * on;
        // A flourish at the end: one over the shoulder.
        if (t > len - 1.6 && t < len - 0.6) a.dip = -0.01;
      },
      wheeliehop: (t, a) => {
        for (let k = 0; k < 2; k++) {
          const u = clamp((t - 0.35 - k * 1.05) / 0.85, 0, 1);
          a.lift = Math.max(a.lift, 0.3 * 4 * u * (1 - u));
        }
        a.up = pair(60 * bump(t - 0.85, 0.8) + 60 * bump(t - 1.9, 0.8));
        a.fwd = -8 * bump(t - 0.85, 0.7) - 8 * bump(t - 1.9, 0.7);
      },
      bunny: (t, a) => {
        const u = ((t - 0.3) / 0.46) % 1;
        if (t > 0.3 && t < 2.6) a.lift = 0.14 * 4 * u * (1 - u);
        a.up = pair(25 * Math.abs(Math.sin(Math.PI * u)));
      },
      spin: (t, a) => {
        // Faster and faster, then slowing, arms pulled in over his head.
        const k = ramp(t, 0, 0.6) * (1 - ramp(t, 2.5, 3.2));
        a.spin = 1440 * (smooth(t / 3.2) * 0.6 + (t / 3.2) * 0.4);
        a.up = pair(125 * k);
        a.bend = pair(-20 * k);
        a.fwd = 4 * k;
      },
      pirouette: (t, a) => {
        const k = ramp(t, 0, 0.5) * (1 - ramp(t, 2, 2.6));
        a.spin = 360 * smooth((t - 0.2) / 2);
        a.up = [125 * k, 30 * k];
        a.hat = 8 * k;
        a.head = [-6 * k, 0, 0];
        a.lift = 0.03 * bump(t - 1.2, 0.6);
      },
      giddy: (t, a) => {
        // A quick spin, then he staggers about with his head going round.
        a.spin = 1080 * smooth(t / 1.8);
        a.up = pair(110 * bump(t - 0.8, 1.2));
        const w = t > 1.8 ? clamp(1 - (t - 1.8) / 4.4, 0, 1) : 0;
        a.face = t > 1.8 ? 'dizzy' : 'happy';
        a.bal = 1 + 3 * w;
        a.side = 12 * w * sin(t, 0.8);
        a.fwd = 9 * w * sin(t, 0.8, 0.25);
        a.head = [10 * w * sin(t, 1.2), 30 * w * sin(t, 1.2, 0.25), 20 * w * sin(t, 1.2)];
        a.up = [a.up[0] + 30 * w * sin(t, 0.8), a.up[1] - 30 * w * sin(t, 0.8)];
      },
      wobble: (t, a) => {
        // Slow motion: leaning further and further, arms windmilling, then he catches it.
        const k = ramp(t, 0.3, 1.8) * (1 - ramp(t, 3.4, 4.6));
        const ph = 2 * Math.PI * 0.85 * t;
        a.side = 24 * k * Math.sin(2 * Math.PI * 0.32 * t);
        a.fwd = 10 * k * Math.sin(2 * Math.PI * 0.32 * t + 1.5);
        a.up = [70 * k * Math.sin(ph) + 30 * k, 70 * k * Math.sin(ph + Math.PI) + 30 * k];
        a.swing = [55 * k * Math.cos(ph), 55 * k * Math.cos(ph + Math.PI)];
        a.wheel = 40 * k * Math.sin(2 * Math.PI * 0.32 * t + 1.5);
        a.head = [0, 0, -10 * a.side * 0.1];
        if (t > 4.6) a.face = 'happy';
      },
      fall: (t, a) => {
        // Teeters, flails, topples sideways, lies there, then bounces back up.
        const teeter = ramp(t, 0.2, 1.4) * (1 - ramp(t, 1.4, 1.5));
        const ph = 2 * Math.PI * 1.4 * t;
        a.side = 10 * teeter * Math.sin(2 * Math.PI * 0.9 * t);
        a.up = [60 * teeter * Math.sin(ph) + 30, 60 * teeter * Math.sin(ph + Math.PI) + 30];
        a.swing = [40 * teeter * Math.cos(ph), 40 * teeter * Math.cos(ph + Math.PI)];
        a.face = t < 1.5 ? 'surprised' : t < 4.2 ? 'dizzy' : 'happy';
        a.bal = t < 1.5 ? 1 : 0;
        if (t > 1.5 && t < 3.5) {
          a.fall = 86;
          a.up = pair(-30);
          a.wheel = 500 * ramp(t, 2.4, 3.4);
          a.head = [0, 0, 18 * sin(t, 1.5)];
        } else if (t >= 3.5) {
          // Up with a spring in the step.
          a.lift = 0.22 * 4 * clamp((t - 3.6) / 0.9, 0, 1) * (1 - clamp((t - 3.6) / 0.9, 0, 1));
          a.up = pair(90 * bump(t - 4.3, 0.9));
        }
      },
      wave: (t, a) => {
        const k = ramp(t, 0.2, 0.6);
        a.up[0] = 120 * k;
        a.bend[0] = 25 * sin(t, 2.4) * k;
        a.wrist[0] = 25 * sin(t, 2.4) * k;
        a.head = [0, 0, 8 * k];
        a.fwd = 3 * sin(t, 0.6);
      },
      bow: (t, a) => {
        const k = ramp(t, 0.3, 1.1) * (1 - ramp(t, 2.1, 2.9));
        a.fwd = 34 * k;
        a.wheel = 34 * k;
        a.up = [-25 * k, 60 * k];
        a.swing = [-20 * k, 60 * k];
        a.bend = [0, -40 * k];
        a.head = [20 * k, 0, 0];
        a.hat = -18 * k;
        a.dip = 0;
      },
      tiphat: (t, a) => {
        const k = ramp(t, 0.3, 0.8) * (1 - ramp(t, 2.4, 3));
        a.up[1] = 135 * k;
        a.bend[1] = 60 * k;
        a.swing[1] = 10 * k;
        a.hat = -22 * k;
        a.hatUp = 0.045 * k;
        a.head = [14 * k, 12 * k, -8 * k];
        a.fwd = 4 * k;
      },
      // Something startles him: the hat jumps up on its spring and drops back on his head.
      hatpop: (t, a) => {
        const k = ramp(t, 0.15, 0.4) * (1 - ramp(t, 2.2, 2.8));
        const pop = Math.max(0, Math.sin(Math.min(1, Math.max(0, (t - 0.5) / 1.1)) * Math.PI));
        a.up = [70 * k, 70 * k];
        a.bend = [-25 * k, -25 * k];
        a.head = [-10 * k, 0, 0];
        a.hatUp = 0.07 * pop;
        a.fwd = -5 * k;
        a.dip = -0.006 * k;
      },
      pump: (t, a) => {
        const s = sin(t, 2.2);
        a.up = [110 + 45 * s, 110 - 45 * s];
        a.bend = [-20, -20];
        a.lift = 0.05 * Math.abs(s) * (t > 0.3 && t < 3 ? 1 : 0);
        a.head = [-8, 0, 6 * s];
        a.twist = 8 * s;
      },
      tada: (t, a) => {
        // A drum roll: rocking back and shivering, then up with both arms.
        const roll = ramp(t, 0.2, 0.6) * (1 - ramp(t, 2, 2.2));
        const pose = ramp(t, 2.2, 2.6) * (1 - ramp(t, 3.7, 4.3));
        a.fwd = -9 * roll + 3 * pose;
        a.wheel = -20 * roll;
        a.side = 2.5 * roll * Math.sin(2 * Math.PI * 9 * t);
        a.up = pair(20 * roll + 130 * pose);
        a.swing = pair(-15 * roll);
        a.bend = pair(-15 * roll - 25 * pose);
        a.head = [-10 * pose, 0, 0];
        a.hat = 10 * pose;
        a.face = pose > 0.5 ? 'happy' : 'focused';
        a.bal = 1 - 0.7 * pose;
      },
      revs: (t, a) => {
        // Leans back and floors it: the wheel screams round on the spot.
        const k = ramp(t, 0.3, 0.7) * (1 - ramp(t, 2.6, 3.2));
        a.fwd = -7 * k;
        a.wheel = 5400 * (smooth(t / 3) * 0.7 + (t / 3) * 0.3) * k;
        a.side = 1.6 * k * Math.sin(2 * Math.PI * 12 * t);
        a.up = pair(-15 * k);
        a.swing = pair(-25 * k);
        a.hat = 20 * k;
      },
      shrug: (t, a) => {
        const k = ramp(t, 0.2, 0.6) * (1 - ramp(t, 1.9, 2.5));
        a.up = pair(40 * k);
        a.bend = pair(65 * k);
        a.wrist = pair(20 * k);
        a.head = [0, 0, 12 * k * sin(t, 0.9)];
        a.dip = 0.012 * k;
      },
      doze: (t, a, len) => {
        // Nodding off on the wheel, rocking slowly; a jerk awake near the end.
        const sleep = 1 - ramp(t, len - 1.6, len - 1.3);
        a.fwd = 6 * sleep * sin(t, 0.22);
        a.wheel = 20 * sleep * sin(t, 0.22, -0.12);
        a.head = [30 * sleep * (0.5 + 0.5 * sin(t, 0.18)) + 6, 0, 0];
        a.up = pair(-20 * sleep);
        a.hat = -12 * sleep;
        a.face = t > len - 1.6 ? 'surprised' : 'asleep';
        if (t > len - 1.6 && t < len - 0.6) {
          a.side = 14 * bump(t - (len - 1.2), 0.5) * Math.sin(2 * Math.PI * 3 * t);
          a.up = [80 * bump(t - (len - 1.2), 0.6), 80 * bump(t - (len - 1.2), 0.6)];
          a.lift = 0.06 * bump(t - (len - 1.5), 0.2);
        }
      },
      poked: (t, a) => {
        const k = bump(t - 0.45, 0.9);
        a.up = pair(105 * k);
        a.lift = 0.2 * 4 * clamp(t / 0.55, 0, 1) * (1 - clamp(t / 0.55, 0, 1));
        a.bal = 1 + 2 * bump(t - 1.2, 1.2);
        a.side = 8 * bump(t - 1.2, 1.1) * sin(t, 1.6);
        a.face = t < 1.6 ? 'surprised' : 'happy';
      },
      love: (t, a) => {
        const k = ramp(t, 0.1, 0.6);
        a.up = [25 * k * sin(t, 0.8), -25 * k * sin(t, 0.8)];
        a.hat = -14 * k;
        a.hatUp = 0.02 * k * (0.5 + 0.5 * sin(t, 1.2));
        a.head = [-6 * k, 0, 10 * k * sin(t, 0.7)];
        a.fwd = 8 * k * sin(t, 0.7);
        a.wheel = 34 * k * sin(t, 0.7, -0.12);
        a.lift = 0.05 * Math.max(0, sin(t, 1.4)) * ramp(t, 0.6, 1);
      },
      dizzy: (t, a) => {
        // Spins with the poke, then staggers about, the head going round.
        a.spin = 1440 * smooth(t / 2);
        a.up = pair(110 * bump(t - 0.9, 1.2));
        const w = t > 2 ? clamp(1 - (t - 2) / 3.5, 0, 1) : 0;
        a.bal = 1 + 3 * w;
        a.side = 13 * w * sin(t, 0.8);
        a.fwd = 9 * w * sin(t, 0.8, 0.25);
        a.head = [10 * w * sin(t, 1.2), 30 * w * sin(t, 1.2, 0.25), 20 * w * sin(t, 1.2)];
        a.up = [a.up[0] + 30 * w * sin(t, 0.8), a.up[1] - 30 * w * sin(t, 0.8)];
        a.face = t > 2 ? 'dizzy' : 'surprised';
      },
    };
  }

  /** Riding round a loop about where the act began; the goal chases a point on it. */
  private circle(t: number, a: Pose, eight = false) {
    const f = this.frame;
    if (!f) return;
    a.face = a.face ?? 'happy';
    const r = this.heightPx * (eight ? 1.3 : 1.05);
    const speed = SPEED * f.bot * 0.85;
    const w = (speed / r) * (eight ? 0.85 : 1);
    const th = w * t * this.way;
    const c = this.centre;
    const s = eight ? c.s + r * Math.sin(th) : c.s + r * Math.cos(th) - r;
    const d = eight ? c.d + 0.24 * Math.sin(2 * th) : c.d + 0.2 * Math.sin(th);
    this.spec.speed = SPEED * 1.15;
    this.walkTo(s, clamp(d, 0.05, 0.95));
    // Leaning into the turn.
    const turn = eight ? Math.cos(th) * this.way : this.way;
    a.side = -9 * turn * clamp(this.stride / (this.heightPx * 1.5), 0, 1);
  }

  // ---------- Each frame ----------

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    const t = this.actT;
    const act = this.act;
    this.frame = env.frame;
    this.crew = env.crew;

    // Petted: delighted, for as long as the mouse rests on him.
    this.hover = this.hovered ? this.hover + dt : 0;
    const calm = ['idle', 'rock', 'look', 'ride', 'wave', 'shrug', 'bow', 'tiphat', 'doze'];
    if (this.hover > 0.6 && calm.includes(act) && !this.walking) this.setAct('love');
    else if (act === 'love' && !this.hovered && t > 1.5) this.setAct('idle');

    const a = blank();
    this.tricks[act]?.(t, a, this.actLength);
    this.pose0 = a;
    this.expression = a.face ?? (this.hovered ? 'happy' : 'neutral');

    // Riding: leaning into the way he's going, more as he speeds up.
    const moving = this.stride > 1;
    const accel = (this.stride - this.lastStride) / Math.max(dt, 1e-3) / this.heightPx;
    this.lastStride = this.stride;
    const speed = clamp(this.stride / (this.heightPx * 2.4), 0, 1.4);
    this.dir = a.back ? -1 : 1;
    const back = this.reverse.update(dt, a.back && moving ? 180 : 0);
    const fwd = a.fwd + (moving ? this.dir * (5 * speed + clamp(accel * 1.6, -8, 8)) : 0);
    const arms = a.up.map((u) => u + (moving ? -22 * speed : 0)) as [number, number];

    // Never still: a small sway about the contact patch, the arms counter-waving.
    const bal = this.bal.update(dt, a.bal);
    const time = env.time;
    const sway = (2.4 * sin(time, 0.37) + 1.4 * sin(time, 0.83, 0.3)) * bal;
    const nod = (1.6 * sin(time, 0.52, 0.1) + 1 * sin(time, 1.1)) * bal;
    p.add('root', 0, 0, a.side + sway);
    p.add('frame', fwd + nod, 0, 0);
    p.add('body', -0.5 * nod, a.twist, -0.7 * (a.side + sway));
    p.add('head', a.head[0] - 0.4 * nod, a.head[1], a.head[2] + 0.5 * (a.side + sway));
    p.add('hat', a.hat + 3 * sin(time, 0.9), 0, 3 * sin(time, 0.7, 0.2));
    p.add('topper', 5 * sin(time, 1.3), 0, 6 * sin(time, 0.9, 0.4));
    p.shift('hat', 0, a.hatUp, 0);
    p.shift('body', 0, a.dip, 0);
    if (back > 1) {
      // Facing away from where he is going, looking over his shoulder at us.
      p.add('root', 0, back, 0);
      const total = wrap(this.heading.y + back);
      p.add('head', 0, clamp(-total * 0.92, -130, 130), 0);
    }
    const balance = 16 * sway * (1 + 0.3 * Math.abs(a.side));
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 'L' : 'R';
      const sg = i === 0 ? 1 : -1;
      // Never further up than straight over the shoulder, or the arm is inside his head.
      const up = Math.min(
        104,
        arms[i] + sg * balance * 0.5 + (moving ? 6 * Math.sin(this.gait * 2 + i * Math.PI) : 0),
      );
      p.add(`upper_arm.${s}`, 0, -sg * a.swing[i], sg * up);
      p.add(`forearm.${s}`, 0, 0, sg * a.bend[i]);
      p.add(`hand.${s}`, 0, 0, sg * a.wrist[i]);
    }

    // Tipped right over (the fall): about the contact point, the wheel lifted clear of
    // the floor line.
    p.add('root', 0, 0, a.fall);
    const flat = clamp(this.puppet.current('root')[2] / 86, 0, 1);
    p.shift('root', 0, 0.036 * flat, 0);

    // Up off the floor; the landing jolts everything.
    const lift = a.lift;
    this.h = lift * this.heightPx;
    if (lift < 0.004 && this.lastLift >= 0.004) {
      p.kick('frame', 220 + 500 * this.lastLift);
      p.kick('body', -180);
      p.kick('hat', -500 * this.lastLift - 100);
      p.kick('upper_arm.L', 0, 0, 500 * this.lastLift);
      p.kick('upper_arm.R', 0, 0, -500 * this.lastLift);
    }
    this.lastLift = lift;
    this.wheelExtra = a.wheel;
  }

  private wheelExtra = 0;

  /** The juggled balls' places, each a beat behind the last; back in the chest if not. */
  private juggling(dt: number) {
    const p = this.puppet;
    const on = this.pose0.balls;
    const B = 0.31;
    for (let k = 0; k < 3; k++) {
      const size = this.pop[k].update(dt, on ? 1 : 0);
      const s = this.actT / B + k;
      const n = Math.floor(s / 3);
      const f = s / 3 - n;
      const from = (((3 * n - k) % 2) + 2) % 2 === 0 ? 1 : -1;
      const x = from * 0.115 * (1 - 2 * f);
      const arc = 4 * f * (1 - f);
      const y = 0.35 + 0.17 * arc;
      const bob = 0.02 * Math.sin(f * Math.PI * 2);
      const q = clamp(size, 0, 1.15);
      if (q < 0.03) {
        p.shift(`ball.${k}`, 0, 0, 0);
        p.stretch(`ball.${k}`, 0, [0, 1, 0], 0);
        continue;
      }
      p.shift(`ball.${k}`, x, y - 0.38 + bob, 0.15 - 0.01);
      p.stretch(`ball.${k}`, q, [0, 1, 0], q);
    }
  }

  /** Pip lights round the hub and the hat band's mood. */
  private lights(time: number) {
    const act = this.act;
    const t = this.actT;
    const moving = this.stride > 1;
    const angle = (i: number) => wrap((i * 360) / PIPS + this.roll + this.wheelExtra);
    for (let i = 0; i < PIPS; i++) {
      let level: number;
      let tone: string | undefined;
      if (act === 'poked') {
        level = clamp(1.6 - t, 0, 1) * (Math.sin(time * 30) > 0 ? 1 : 0.5);
        tone = BEACON.surprised;
      } else if (act === 'dizzy' || act === 'giddy' || (act === 'fall' && t > 1.5 && t < 4)) {
        level = Math.sin(time * 7 + i * 2.3) > 0.1 ? 1 : 0.1;
        tone = RAINBOW[(i * 3 + Math.floor(time * 4)) % RAINBOW.length];
      } else if (
        ['pump', 'tada', 'spin', 'pirouette', 'sprint', 'bow', 'juggle', 'revs'].includes(act)
      ) {
        level = 1;
        tone = RAINBOW[(i + Math.floor(time * 9)) % RAINBOW.length];
      } else if (act === 'love') {
        level = 0.6 + 0.4 * Math.sin(time * 2.5 - i * 0.9);
        tone = BEACON.love;
      } else if (act === 'doze') {
        level = 0.1 + 0.1 * Math.sin(time * 0.8);
      } else if (moving) {
        level = 0.45 + 0.55 * Math.abs(Math.sin(time * 9 + i * 1.7));
        tone = BEACON.happy;
      } else {
        // Standing: whichever pip is nearest the top glows.
        level = bump(angle(i), 40);
        tone = this.hovered ? BEACON.happy : undefined;
      }
      this.outfit.dot(i, level, tone);
    }
    this.outfit.beacon(BEACON[this.expression] ?? '#f4f4f1');
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    const a = this.pose0;
    // The wheel turns with the ground going by (backwards if he rides backwards).
    this.roll += (this.dir * this.stride * dt * DEG) / (WHEEL * this.px);
    p.turn('wheel', this.roll + this.wheelExtra);
    this.lights(env.time);
    this.juggling(dt);
    // Spinning on the spot, about his own axis.
    this.pivot.rotation.y = (a.spin / DEG) * 1;
  }
}
