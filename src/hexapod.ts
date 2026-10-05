import { Euler, type Object3D, Quaternion, Vector3 } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { Bird, ease, type Reaction, span } from './birds';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import { Spring, wobble } from './spring';
import { DEG, fixed, TAU } from './toybot';

/**
 * Scuttle, the robot hexapod: a round dome with one big round eye-screen and a beacon on a
 * stalk, riding on six jointed legs (a thigh up and out to a high knee with a lit pip, a
 * shin down to a rubber ball foot). Nothing is animated in advance: each frame the feet are
 * given places on the floor and the legs are solved to reach them (two-bone IK, posed
 * directly), so the tripod gait, a tiptoe, a ripple of lifted feet round the ring, sitting
 * flat, waving with the front pair and shuffling on the spot are all the same few lines
 * moving the feet about.
 *
 * Directed poses (the play scenes) bend `body` and `head`, and the legs follow: the feet stay
 * where they are on the floor while the dome leans and nods above them.
 *
 * A poke jolts him up straight-legged; three pokes make him a stumbling mess; the mouse
 * resting on him makes him rise on tiptoe and light his knees.
 */
export const HEXAPOD_FACE: FaceLayout = {
  width: 384,
  height: 384,
  eyes: [[0.5, 0.45]],
  rx: 0.27,
  ry: 0.27,
  line: 0.045,
  mouth: [0.5, 0.82],
};

// The model's own numbers (see art/robot/hexapod.py), in three.js axes: +Z front, +Y up.
const AZ = [52, 6, -42].map((d) => (d * Math.PI) / 180);
const HIP = { r: 0.16, y: 0.235 };
const KNEE = { r: 0.27, y: 0.37 };
const FOOT = { r: 0.33, y: 0.03 };
const PIVOT = new Vector3(0, 0.2, 0);
/** Half a step (m), how high a foot lifts (m), and the body's distance per gait cycle (m). */
const STEP = (((40 * Math.PI) / 180) * FOOT.r) / 4;
const LIFT = 0.05;
const CYCLE = 4 * STEP;
/** Degrees he turns on the spot per gait cycle: 40, so nine cycles make a whole turn. */
const TURN_CYCLE = 40;

const sm = (x: number) => {
  const u = clamp(x, 0, 1);
  return u * u * (3 - 2 * u);
};

interface Leg {
  side: number;
  k: number;
  /** 0..5: left front to back, then right front to back (the knee lamps' order). */
  i: number;
  ring: number;
  group: number;
  name: [string, string];
  hip: Vector3;
  foot: Vector3;
  out: Vector3;
  l1: number;
  l2: number;
  d1: Vector3;
  d2: Vector3;
}

const LEGS: Leg[] = [];
for (const side of [1, -1]) {
  for (let k = 0; k < 3; k++) {
    const a = AZ[k];
    const at = (r: number, y: number) => new Vector3(side * Math.cos(a) * r, y, Math.sin(a) * r);
    const hip = at(HIP.r, HIP.y);
    const knee = at(KNEE.r, KNEE.y);
    const foot = at(FOOT.r, FOOT.y);
    const i = k + (side > 0 ? 0 : 3);
    const S = side > 0 ? 'L' : 'R';
    LEGS.push({
      side,
      k,
      i,
      ring: i < 3 ? i : 3 + (5 - i),
      // The tripods: left front, left rear and right middle; the other three.
      group: side > 0 ? k % 2 : (k + 1) % 2,
      name: [`leg.${S}.${k}`, `foot.${S}.${k}`],
      hip,
      foot,
      out: new Vector3(side * Math.cos(a), 0, Math.sin(a)),
      l1: knee.distanceTo(hip),
      l2: foot.distanceTo(knee),
      d1: knee.clone().sub(hip).normalize(),
      d2: foot.clone().sub(knee).normalize(),
    });
  }
}

// Scratch objects, so the gait allocates nothing per frame.
const eu = new Euler();
const qBody = new Quaternion();
const qInv = new Quaternion();
const qT = new Quaternion();
const qS = new Quaternion();
const qTi = new Quaternion();
const vT = new Vector3();
const vD = new Vector3();
const vK = new Vector3();
const vF = new Vector3();
const vP = new Vector3();
const vD1 = new Vector3();
const vD2 = new Vector3();

type V3 = [number, number, number];

export class Hexapod extends Bird {
  static readonly terms =
    'insect bug walker six legs legged dome eye cyclops mint teal coral peach feet tripod gait walk scuttle tiptoe wave beacon';

  private dyS = new Spring(3.2, 0.5, 1.2, 0);
  private spreadS = new Spring(3, 0.65, 1, 1);
  private walkK = new Spring(5, 1, 1, 0);
  // Per-frame requests from the acts, cleared in idle().
  private dy = 0;
  private spread = 1;
  private hop = 0;
  private spinTo = 0;
  private spinSign = 1;
  private bodyTilt: [number, number, number] = [0, 0, 0];
  private stepK = 0;
  /** Each foot's offset from its place, in the floor's frame (m). */
  private fo: V3[] = LEGS.map(() => [0, 0, 0]);
  private headTilt: [number, number, number] = [0, 0, 0];
  private feeler = 0;
  private glow: ((i: number, t: number) => number) | null = null;
  private phi = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Scuttle',
        model: 'hexapod',
        metres: 0.55,
        width: 0.72,
        size: 1.05,
        feels: {
          default: { f: 4, zeta: 0.6 },
          root: { f: 4, zeta: 0.5 },
          body: { f: 4, zeta: 0.45 },
          head: { f: 4.5, zeta: 0.35, r: 0.7 },
          antenna: { f: 5, zeta: 0.2 },
          'antenna.2': { f: 6, zeta: 0.15 },
        },
        face: HEXAPOD_FACE,
        eyes: 0.6,
        gaze: [{ bone: 'head', yaw: 0.9, pitch: 0.8 }],
        reach: { yaw: 55, pitch: 25 },
        lag: 1.6,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 0.6,
        turn: 80,
      },
      model,
    );
    this.acts = { ...this.moves(), ...this.reactions() };
  }

  private moves(): Record<string, Act> {
    const still = () => this.still() && this.state === 'here';
    return {
      idle: { weight: 3, length: [3, 6] },
      stroll: {
        weight: 2.4,
        length: [3, 5],
        when: this.still,
        start: () => this.amble(1.2 + Math.random() * 1.8),
      },
      tiptoe: {
        weight: 1.4,
        length: [4, 6],
        when: this.still,
        face: 'focused',
        start: () => this.amble(1 + Math.random() * 1.4),
        pose: (t) => {
          // Creeping on the tips of his toes, dome low and eye wide.
          const k = ease(t, 0.2, 0.7);
          this.dy = 0.1 * k;
          this.spread = 0.85;
          this.headTilt = [10 * k, 0, 0];
          this.glow = (i, s) => (Math.sin(s * 2.4 + i) > 0.7 ? 1 : 0.1);
        },
      },
      ripple: {
        weight: 1.5,
        length: [6, 7],
        when: still,
        face: 'happy',
        pose: (t) => {
          // A wave of lifted feet runs round the ring, the dome riding it.
          const k = span(t, 0.4, 1, this.actLength - 1, this.actLength - 0.2);
          for (const l of LEGS) {
            const w = Math.max(0, sin(t, 1, -l.ring / 6));
            this.fo[l.i][1] = 0.075 * k * w * w;
            this.fo[l.i][0] = l.out.x * 0.03 * k * w;
            this.fo[l.i][2] = l.out.z * 0.03 * k * w;
          }
          this.dy = 0.02 * k * (1 + sin(t, 2));
          this.headTilt = [0, 16 * k * sin(t, 1, 0.25), 8 * k * sin(t, 1)];
          this.glow = (i, s) => Math.max(0, sin(s, 1, -LEGS[i].ring / 6)) ** 2 * 0.9 + 0.1;
        },
      },
      sit: {
        weight: 1,
        length: [7, 9],
        when: still,
        face: 'happy',
        pose: (t) => {
          // Folds down flat on his belly, legs splayed round him, and has a good look about.
          const k = span(t, 0.3, 1.4, this.actLength - 1.4, this.actLength - 0.3);
          this.dy = -0.145 * k;
          this.spread = 1 + 0.4 * k;
          this.headTilt = [-5 * k, 40 * k * sin(t, 0.18), 0];
          this.glow = (_i, s) => 0.25 + 0.2 * Math.sin(s * 1.2);
        },
      },
      wave: {
        weight: 1.3,
        length: [4, 5],
        when: still,
        face: 'happy',
        pose: (t) => {
          // Up on the back four, the front pair raised: one waves, then both.
          const k = span(t, 0.3, 0.9, this.actLength - 0.9, this.actLength - 0.2);
          const w = sin(t, 2.2);
          for (const l of LEGS.slice(0, 6)) {
            if (l.k !== 0) continue;
            const s = l.side;
            const solo = l.i === 0 || t > 2.3 ? 1 : 0.15;
            this.fo[l.i][0] = s * (0.0 + 0.04 * k) + s * 0.05 * w * k * solo;
            this.fo[l.i][1] = (0.32 + 0.04 * w * solo) * k * solo + 0.05 * k * (1 - solo);
            this.fo[l.i][2] = 0.1 * k * solo;
          }
          this.dy = 0.03 * k;
          this.headTilt = [-8 * k, 0, 6 * k * w];
          this.glow = (i, s) => (LEGS[i].k === 0 ? 0.5 + 0.5 * Math.sin(s * 9) : 0.2);
        },
      },
      shuffle: {
        weight: 1.2,
        length: [6, 6],
        when: still,
        face: 'happy',
        start: () => (this.spinSign = Math.random() < 0.5 ? 1 : -1),
        pose: (t) => {
          // A turn on the spot, feet shuffling round in their tripods.
          const u = sm((t - 0.3) / 5);
          this.spinTo = this.spinSign * 360 * u;
          this.stepK = ease(t, 0.2, 0.7) * (1 - ease(t, 5.2, 5.6));
          this.headTilt = [0, -this.spinSign * 25 * Math.sin(Math.PI * u), 0];
          this.dy = 0.015;
          this.glow = (i, s) => 0.4 + 0.6 * Math.abs(Math.sin(s * 5 - i));
        },
      },
      scan: {
        weight: 1.1,
        length: [6, 7],
        when: still,
        face: 'focused',
        pose: (t) => {
          // The dome swings slowly right round to either side, the antenna ticking.
          const k = span(t, 0.4, 1, this.actLength - 1, this.actLength - 0.3);
          this.headTilt = [-3 * k, 70 * k * sin(t, 0.2), 0];
          this.feeler = k;
          this.dy = 0.03 * k;
          this.glow = (i, s) => (Math.floor(s * 5) % 6 === i ? 1 : 0.12);
        },
      },
      pushups: {
        weight: 1.2,
        length: [5, 6],
        when: still,
        face: 'determined',
        pose: (t) => {
          // Squats up and down on all six legs, counting under his breath.
          const k = span(t, 0.4, 0.9, this.actLength - 0.9, this.actLength - 0.2);
          const w = 0.5 - 0.5 * Math.cos(TAU * 0.8 * t);
          this.dy = (-0.1 + 0.2 * w) * k;
          this.spread = 1 + 0.2 * (1 - w) * k;
          this.headTilt = [-10 * w * k, 0, 0];
          this.glow = (i, s) => (w > 0.8 && Math.floor(s * 0.8 * 6) % 6 === i ? 1 : 0.2 + 0.3 * w);
        },
      },
      hop: {
        weight: 1.3,
        length: [5, 5],
        when: still,
        face: 'happy',
        pose: (t) => {
          // Three hops with the legs tucked up under the dome.
          const u = (t - 0.3) / 1.4;
          const n = Math.floor(u);
          if (u > 0 && n < 3) {
            const f = u - n;
            this.dy =
              f < 0.25 ? -0.08 * sm(f / 0.25) : f > 0.85 ? -0.05 * sm((f - 0.85) / 0.15) : 0;
            const air = f > 0.25 && f < 0.85;
            this.hop = air ? 0.2 * Math.sin(Math.PI * ((f - 0.25) / 0.6)) : 0;
          }
          this.glow = (i, s) => (Math.sin(s * 9 - i * 0.5) > 0 ? 1 : 0.2);
        },
      },
      stretch: {
        weight: 0.8,
        length: [5, 5],
        when: still,
        face: 'sheepish',
        pose: (t) => {
          // Spreads out low to the floor, shivers, then draws all the way up and shakes it off.
          const a = span(t, 0.3, 1.2, 2.4, 3);
          const b = span(t, 2.6, 3.4, 3.9, 4.6);
          this.dy = -0.09 * a + 0.11 * b;
          this.spread = 1 + 0.45 * a - 0.2 * b;
          this.headTilt = [8 * a - 10 * b, 12 * b * sin(t, 6), 0];
          for (const l of LEGS) this.fo[l.i][1] = 0.005 * a * sin(t, 7, l.i / 6);
        },
      },
      tap: {
        weight: 1,
        length: [5, 6],
        when: still,
        face: 'neutral',
        pose: (t) => {
          // Impatient: the feet tap one after another, the dome nodding along.
          const k = span(t, 0.3, 0.8, this.actLength - 0.8, this.actLength - 0.2);
          const beat = Math.floor(t * 3.5);
          const f = (t * 3.5) % 1;
          const l = LEGS[[0, 4, 2, 3, 1, 5][beat % 6]];
          this.fo[l.i][1] = 0.045 * k * Math.sin(Math.PI * Math.min(1, f * 1.6));
          this.headTilt = [-6 * k * Math.abs(Math.sin(Math.PI * t * 3.5)), 0, 0];
          this.glow = (i) => (i === l.i ? 1 : 0.12);
        },
      },
      march: {
        weight: 1,
        length: [5, 5],
        when: still,
        face: 'determined',
        pose: (t) => {
          // Marching on the spot, knees high.
          const k = span(t, 0.4, 0.9, this.actLength - 0.9, this.actLength - 0.2);
          for (const l of LEGS) {
            const w = Math.max(0, Math.sin(TAU * (t * 1.8 + l.group * 0.5)));
            this.fo[l.i][1] = 0.09 * k * w;
            this.fo[l.i][2] = 0.03 * k * w;
          }
          this.dy = 0.015 * k * Math.abs(Math.sin(TAU * (t * 1.8)));
          this.headTilt = [0, 0, 4 * k * sin(t, 1.8)];
          this.glow = (i, s) => (Math.sin(TAU * (s * 1.8 + LEGS[i].group * 0.5)) > 0 ? 1 : 0.15);
        },
      },
      inspect: {
        weight: 1,
        length: [5.5, 6.5],
        when: still,
        face: 'focused',
        pose: (t) => {
          // Leans in over the floor in front of him and prods it with the front pair.
          const k = span(t, 0.4, 1.2, this.actLength - 1.4, this.actLength - 0.6);
          this.dy = -0.03 * k;
          this.headTilt = [16 * k, 14 * k * sin(t, 0.4), 6 * k];
          for (const l of LEGS) {
            if (l.k !== 0) continue;
            const w = Math.max(0, sin(t, 1.3, l.side > 0 ? 0 : 0.5));
            this.fo[l.i][2] = (0.1 - 0.02 * w) * k;
            this.fo[l.i][1] = 0.04 * k * w * (1 - w * 0.2);
          }
          this.bodyTilt = [10 * k, 0, 0];
          if (t > this.actLength - 0.6) this.expression = 'surprised';
        },
      },
      jive: {
        weight: 1.1,
        length: [7, 8],
        when: still,
        face: 'happy',
        pose: (t) => {
          // Rocks side to side over his feet, rising and sinking on the beat.
          const k = this.fade(t, 0.6);
          const b = sin(t, 1);
          this.dy = 0.045 * k * Math.abs(b);
          this.bodyTilt = [0, 0, -9 * k * b];
          this.headTilt = [0, 0, -8 * k * b];
          this.glow = (i, s) => 0.5 + 0.5 * Math.sin(s * 6.3 - LEGS[i].ring);
        },
      },
      nap: {
        weight: 0.8,
        length: [9, 12],
        when: still,
        pose: (t) => {
          const k = span(t, 1, 2.6, this.actLength - 2, this.actLength - 0.6);
          this.dy = -0.135 * k;
          this.spread = 1 + 0.35 * k;
          this.headTilt = [14 * k, 0, 5 * k];
          this.expression = k > 0.4 ? 'asleep' : 'sleepy';
          this.glow = (_i, s) => 0.06 + 0.08 * Math.sin(s * 0.9);
        },
      },
      whirl: {
        weight: 0.8,
        length: [3.6, 3.6],
        when: still,
        face: 'starry',
        start: () => (this.spinSign = Math.random() < 0.5 ? 1 : -1),
        pose: (t) => {
          const k = ease(t, 0, 0.4) * (1 - ease(t, 3, 3.6));
          this.spinTo = this.spinSign * 360 * sm((t - 0.1) / 3.1);
          this.stepK = ease(t, 0, 0.4) * (1 - ease(t, 3.1, 3.5));
          this.dy = 0.02 * k;
          this.headTilt = [-6 * k, 0, 0];
          this.glow = (i, s) => (Math.sin(s * 8 - LEGS[i].ring * 1.05) > 0 ? 1 : 0.2);
        },
      },
    };
  }

  protected react(kind: Reaction, t: number) {
    if (kind === 'poked') {
      // Jolted up straight-legged on tiptoe, feet flung wide, then settles.
      const up = ease(t, 0, 0.1) * (1 - ease(t, 0.5, 1.1));
      this.dy = 0.15 * up;
      this.spread = 1 + 0.25 * up;
      this.hop = 0.12 * ease(t, 0, 0.1) * (1 - ease(t, 0.12, 0.45));
      this.feeler = 1;
      this.headTilt = [-10 * up, 0, 0];
      this.glow = (i, s) => (Math.sin(s * 26) > 0 ? 1 : 0.3) * (i % 2 ? 1 : 0.7);
    } else if (kind === 'dizzy') {
      const k = 1 - ease(t, 2.6, 3.6);
      this.spinTo = 360 * sm(t / 2.6);
      this.spinSign = 1;
      this.stepK = ease(t, 0, 0.3) * (1 - ease(t, 2.5, 2.9));
      this.dy = 0.01 * k;
      this.headTilt = [10 * k * Math.cos(t * 5), 0, 18 * k * Math.sin(t * 5)];
      for (const l of LEGS)
        this.fo[l.i][1] = 0.025 * k * Math.max(0, Math.sin(t * 9 + l.ring * 2.1));
      this.glow = (i, s) => (Math.sin(s * 7 + i * 2.3) > 0.1 ? 1 : 0.1);
    } else {
      const k = this.fade(t, 0.5);
      this.dy = 0.09 * k;
      this.headTilt = [-4 * k, 0, 8 * k * sin(t, 0.7)];
      this.feeler = k;
      for (const l of LEGS) {
        if (l.k !== 0) continue;
        this.fo[l.i][1] = 0.06 * k * (0.5 + 0.5 * sin(t, 1.2, l.side * 0.25));
        this.fo[l.i][2] = 0.06 * k;
      }
      this.glow = (i, s) => 0.5 + 0.5 * Math.sin(s * 3 - LEGS[i].ring * 1.05);
    }
  }

  // ---------- Posing ----------

  protected idle(t: number) {
    this.dy = 0;
    this.spread = 1;
    this.hop = 0;
    this.spinTo = 0;
    this.bodyTilt = [0, 0, 0];
    this.stepK = 0;
    this.feeler = 0;
    for (const f of this.fo) f.fill(0);
    this.headTilt = [0, 0, 0];
    this.glow = null;
    this.expression = this.hovered ? 'happy' : 'neutral';
    this.puppet.add(
      'head',
      1.5 * wobble(t * 0.4, 5),
      3 * wobble(t * 0.25, 3),
      2 * wobble(t * 0.3, 2),
    );
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    this.env = env;
    this.enjoy(dt, this.still());
    this.spec.speed = this.act === 'tiptoe' ? 0.35 : 0.6;
    fixed(dt, (h) => {
      this.dyS.update(h, this.dy);
      this.spreadS.update(h, this.spread);
      this.walkK.update(h, this.stride > 1 ? 1 : 0);
    });
    // The gait: one cycle of both tripods per CYCLE metres of walking.
    if (this.stride > 1) this.phi = (this.phi + (this.stride * dt) / this.px / CYCLE) % 1;
    else if (this.walkK.y < 0.02) this.phi = 0;
    // Mid-gait lean: the dome rocks a little with each step; a stamp leans into the floor.
    const rock = this.walkK.y * sin(this.phi * 2, 1);
    p.add('body', this.bodyTilt[0], this.bodyTilt[1], this.bodyTilt[2] - 2 * rock);
    p.add('head', this.headTilt[0], this.headTilt[1], this.headTilt[2]);
    p.add(
      'antenna',
      14 * this.feeler * sin(this.env.time, 6),
      0,
      10 * this.feeler * sin(this.env.time, 5, 0.3),
    );
    p.add(
      'antenna.2',
      12 * this.feeler * sin(this.env.time, 6, 0.2),
      0,
      8 * this.feeler * sin(this.env.time, 5, 0.5),
    );
    p.add('antenna', 4 * wobble(this.env.time * 0.7, 9), 0, 4 * wobble(this.env.time * 0.5, 4));
    this.h = this.hop * this.px;
  }

  /** Place the six feet, solve the legs to them, and light the knees. */
  protected after(_dt: number, env: Env) {
    const p = this.puppet;
    const t = env.time;
    const walk = this.walkK.y;
    const spread = this.spreadS.y;
    const bob = walk * 0.007 * Math.abs(sin(this.phi * 2, 1, 0.25));
    const dy = this.dyS.y + bob;
    p.shift('body', 0, dy, 0);
    const [bp, by, br] = p.current('body');
    qBody.setFromEuler(eu.set(bp / DEG, by / DEG, br / DEG, 'YXZ'));
    qInv.copy(qBody).invert();
    const tuck = this.h > 0 ? clamp((this.h / this.px) * 0.6, 0, 0.1) : 0;
    const spinPh = Math.abs(this.spinTo) / TURN_CYCLE;
    const turning = this.stepK > 0.001;
    for (const l of LEGS) {
      // Where the foot stands on the floor (the floor's frame, round the model's root).
      let x = l.foot.x * spread;
      let z = l.foot.z * spread;
      let y = l.foot.y;
      if (walk > 0.001) {
        const ph = (this.phi + l.group * 0.5) % 1;
        const [pos, lift] = gait(ph);
        z += STEP * walk * pos;
        y += LIFT * walk * lift;
      }
      if (turning) {
        // In a turn the planted feet slide round the body: the same gait, sideways.
        const ph = (spinPh + l.group * 0.5) % 1;
        const [pos, lift] = gait(ph);
        const r = Math.hypot(x, z) || 1;
        const off = -pos * STEP * this.spinSign * this.stepK;
        const tx = -z / r;
        const tz = x / r;
        x += tx * off;
        z += tz * off;
        y += LIFT * lift * this.stepK;
      }
      const fo = this.fo[l.i];
      x += fo[0];
      y += fo[1] + tuck;
      z += fo[2];
      // Into the body's own frame, then the two-bone solution to it.
      vT.set(x, y - dy, z)
        .sub(PIVOT)
        .applyQuaternion(qInv)
        .add(PIVOT);
      vD.copy(vT).sub(l.hip);
      const len = clamp(vD.length(), Math.abs(l.l1 - l.l2) + 0.02, l.l1 + l.l2 - 0.004);
      vD.normalize();
      const a = (l.l1 * l.l1 - l.l2 * l.l2 + len * len) / (2 * len);
      const h = Math.sqrt(Math.max(l.l1 * l.l1 - a * a, 0));
      // The knee bends up and a little outward, in the plane of hip, foot and up.
      vP.set(l.out.x * 0.5, 1, l.out.z * 0.5);
      vP.addScaledVector(vD, -vP.dot(vD));
      if (vP.lengthSq() < 1e-6) vP.set(0, 1, 0);
      vP.normalize();
      vK.copy(l.hip).addScaledVector(vD, a).addScaledVector(vP, h);
      vF.copy(l.hip).addScaledVector(vD, len);
      vD1.copy(vK).sub(l.hip).normalize();
      vD2.copy(vF).sub(vK).normalize();
      qT.setFromUnitVectors(l.d1, vD1);
      qS.setFromUnitVectors(l.d2, vD2);
      // The shin turns relative to the thigh.
      qS.premultiply(qTi.copy(qT).invert());
      eu.setFromQuaternion(qT, 'YXZ');
      p.turn(l.name[0], eu.x * DEG, eu.y * DEG, eu.z * DEG);
      eu.setFromQuaternion(qS, 'YXZ');
      p.turn(l.name[1], eu.x * DEG, eu.y * DEG, eu.z * DEG);
    }
    this.pivot.rotation.y = this.spinTo / DEG;
    this.lights(t);
  }

  private lights(t: number) {
    const mood = this.expression;
    const asleep = mood === 'asleep';
    for (let i = 0; i < 6; i++) {
      let level: number;
      let tone: string | undefined;
      if (this.glow) {
        level = this.glow(i, t);
        if (this.act === 'dizzy' || this.act === 'whirl')
          tone = RAINBOW[(i + Math.floor(t * 5)) % RAINBOW.length];
      } else if (this.stride > 1) {
        level = 0.3 + 0.7 * ((this.phi + LEGS[i].group * 0.5) % 1 > 0.5 ? 1 : 0);
      } else {
        // At rest a slow light goes round the six knees now and then.
        const c = (t / 2.6) % 1.6;
        level = 0.15 + 0.85 * clamp(1 - Math.abs(c * 6 - LEGS[i].ring) * 0.7, 0, 1);
        if (this.hovered) level = 0.55 + 0.45 * Math.sin(t * 3 - LEGS[i].ring);
      }
      this.outfit.dot(i, clamp(asleep ? level * 0.4 : level, 0, 1), tone);
    }
    this.outfit.beacon(
      this.act === 'dizzy'
        ? RAINBOW[Math.floor(t * 6) % RAINBOW.length]
        : (BEACON[mood] ?? '#f4f4f1'),
    );
  }
}

/** One foot's gait: where it is along its sweep (+1 ahead to -1 behind) and how high it is lifted. */
function gait(ph: number): [pos: number, lift: number] {
  if (ph < 0.5) return [1 - 4 * ph, 0];
  const u = (ph - 0.5) * 2;
  return [-1 + 2 * sm(u), Math.sin(Math.PI * u)];
}
