import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { Bird, ease, type Reaction, span } from './birds';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import { Spring, wobble } from './spring';
import { DEG, fixed } from './toybot';

/**
 * Teeter, the robot ballbot: a slim robot balancing on a single striped ball, no feet at
 * all. `body` (everything above the ball) pivots at the ball's centre, so a lean tips the
 * whole robot over the ball; the ball rolls under him as he travels and catches up with his
 * lean. He is never quite still: a lean that is always being corrected (a lightly damped
 * spring that gets small random knocks), arms held out a little and swung against it.
 *
 * He steers by leaning: forward to go, sideways in a carve, and the ball follows. He nearly
 * topples and saves it, spins on the ball, bows, hops on it.
 *
 * A poke throws him back with his arms up; three pokes make him a swaying, circling mess; the
 * mouse resting on him makes him roll in a little circle with his arms out in delight.
 */
export const BALLBOT_FACE: FaceLayout = {
  width: 448,
  height: 320,
  eyes: [
    [0.3, 0.46],
    [0.7, 0.46],
  ],
  rx: 0.08,
  ry: 0.24,
  line: 0.034,
  mouth: [0.5, 0.77],
};

const BALL_R = 0.125;
const sm = (x: number) => {
  const u = clamp(x, 0, 1);
  return u * u * (3 - 2 * u);
};

export class Ballbot extends Bird {
  // The lean about the ball (degrees): lightly damped, knocked now and then, so the balancing
  // is always correcting something.
  private leanP = new Spring(2.1, 0.22, 1, 0);
  private leanR = new Spring(1.9, 0.22, 1, 0);
  private ballZ = new Spring(2.6, 0.6, 1, 0);
  private ballX = new Spring(2.6, 0.6, 1, 0);
  private hopS = new Spring(5, 0.5, 1, 0);
  // Per-frame requests from the acts, cleared in idle().
  private lean: [number, number] = [0, 0];
  private knock = 1;
  private spinTo = 0;
  private hop = 0;
  /** Arms: out sideways (roll, deg), swung forward (pitch, deg), per arm L, R. */
  private out: [number, number] = [0, 0];
  private fwd: [number, number] = [0, 0];
  private elbow: [number, number] = [0, 0];
  private headTilt: [number, number, number] = [0, 0, 0];
  private feeler = 0;
  private glow: ((i: number, t: number) => number) | null = null;
  private rollA = 0;
  private nextKnock = 0.5;
  private kickT = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Teeter',
        model: 'ballbot',
        metres: 0.84,
        width: 0.34,
        size: 1.15,
        feels: {
          default: { f: 4, zeta: 0.6 },
          root: { f: 4, zeta: 0.5 },
          body: { f: 8, zeta: 0.7 },
          head: { f: 4.5, zeta: 0.35, r: 0.7 },
          antenna: { f: 5, zeta: 0.2 },
          'antenna.2': { f: 6, zeta: 0.15 },
          'upper_arm.L': { f: 6, zeta: 0.4 },
          'upper_arm.R': { f: 6, zeta: 0.4 },
          'forearm.L': { f: 7, zeta: 0.3 },
          'forearm.R': { f: 7, zeta: 0.3 },
          'hand.L': { f: 8, zeta: 0.3 },
          'hand.R': { f: 8, zeta: 0.3 },
        },
        face: BALLBOT_FACE,
        eyes: 0.77,
        gaze: [{ bone: 'head', yaw: 0.9, pitch: 0.8 }],
        reach: { yaw: 55, pitch: 25 },
        lag: 1.6,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 0.75,
        turn: 60,
      },
      model,
    );
    this.acts = { ...this.moves(), ...this.reactions() };
  }

  private moves(): Record<string, Act> {
    const still = () => this.still() && this.state === 'here';
    return {
      idle: { weight: 3, length: [3, 6] },
      cruise: {
        weight: 2.4,
        length: [3, 5],
        when: this.still,
        start: () => this.amble(1.4 + Math.random() * 1.8),
      },
      balance: {
        weight: 1.6,
        length: [6, 7],
        when: still,
        face: 'focused',
        pose: (t) => {
          // Concentrating: arms out wide, swung against every correction.
          const k = span(t, 0.4, 1, this.actLength - 1, this.actLength - 0.3);
          this.out = [62 * k, 62 * k];
          this.knock = 1 + 4 * k;
          this.headTilt = [0, 0, 0];
          this.glow = (i, s) => 0.3 + 0.7 * Math.abs(Math.sin(s * 3 + i));
        },
      },
      carve: {
        weight: 1.4,
        length: [3.4, 4.4],
        when: this.still,
        face: 'happy',
        start: () => this.amble(2.4, Math.random() * 0.4 - 0.2),
        pose: (t) => {
          // Quick through the room in a long S: leaning hard into each turn, arms out.
          const k = ease(t, 0.2, 0.8);
          this.lean[1] = 13 * k * sin(t, 0.35);
          this.out = [55 * k, 55 * k];
          this.headTilt = [0, 0, 0];
          this.glow = (i, s) => 0.5 + 0.5 * Math.sin(s * 8 - i * 0.9);
        },
      },
      topple: {
        weight: 1.2,
        length: [4.2, 4.2],
        when: still,
        face: 'surprised',
        start: () => (this.kickT = Math.random() < 0.5 ? 1 : -1),
        pose: (t) => {
          // Leans too far, windmills his arms, the ball shoots under him; saved, with a sigh.
          const s = this.kickT;
          const a = ease(t, 0.3, 1.3);
          const b = ease(t, 1.3, 1.7);
          const c = ease(t, 1.7, 2.6);
          this.lean = [s * (32 * a + 12 * b - 46 * c * (1 - ease(t, 3, 3.6))), 12 * s * (a - c)];
          const wm = (a - c) * 1;
          this.out = [70 * wm, 70 * wm];
          this.fwd = [-150 * (b - c) * Math.sin(t * 14), -150 * (b - c) * Math.cos(t * 14)];
          this.knock = 1;
          this.headTilt = [0, 0, 0];
          if (t > 2.8) this.expression = 'sheepish';
          this.glow = (i, s2) => (Math.sin(s2 * 20) > 0 ? 1 : 0.2) * (i % 2 ? 1 : 0.7);
        },
      },
      spin: {
        weight: 1.1,
        length: [4, 4],
        when: still,
        face: 'happy',
        pose: (t) => {
          const k = ease(t, 0, 0.5) * (1 - ease(t, 3.2, 4));
          this.spinTo = 720 * sm((t - 0.2) / 3.5);
          this.out = [75 * k, 75 * k];
          this.lean[1] = -6 * k;
          this.glow = (i, s) => (Math.sin(s * 9 - i * 0.9) > 0 ? 1 : 0.2);
        },
      },
      wave: {
        weight: 1.3,
        length: [3.8, 4.6],
        when: still,
        face: 'happy',
        pose: (t) => {
          // One arm waves while the other keeps him up.
          const k = span(t, 0.2, 0.7, this.actLength - 0.7, this.actLength - 0.1);
          this.fwd = [-135 * k, 0];
          this.elbow = [28 * k * sin(t, 2.4), 0];
          this.out = [8 * k, 55 * k];
          this.lean[1] = -4 * k;
          this.headTilt = [0, 0, 8 * k];
        },
      },
      bow: {
        weight: 0.9,
        length: [3.6, 3.6],
        when: still,
        face: 'happy',
        pose: (t) => {
          const k = ease(t, 0.3, 1) * (1 - ease(t, 2, 2.9));
          this.lean[0] = 34 * k;
          this.fwd = [-30 * k, -30 * k];
          this.headTilt = [10 * k, 0, 0];
        },
      },
      dance: {
        weight: 1.2,
        length: [7, 8],
        when: still,
        face: 'happy',
        pose: (t) => {
          // Swaying over the ball to a beat, the ball rolling out and back under him.
          const k = this.fade(t, 0.6);
          const b = sin(t, 0.9);
          this.lean = [9 * k * sin(t, 1.8, 0.1), 14 * k * b];
          this.out = [(60 + 28 * b) * k, (60 - 28 * b) * k];
          this.headTilt = [0, 0, 10 * k * b];
          this.glow = (i, s) => 0.5 + 0.5 * Math.sin(s * 5.7 - i * 0.9);
        },
      },
      peek: {
        weight: 1,
        length: [5, 6],
        when: still,
        face: 'focused',
        pose: (t) => {
          // Leans right out over the ball to peer at something, then back with a start.
          const k = span(t, 0.4, 1.5, this.actLength - 1.4, this.actLength - 0.6);
          this.lean = [24 * k, 5 * k * sin(t, 0.4)];
          this.out = [30 * k, 30 * k];
          this.headTilt = [-14 * k, 20 * k * sin(t, 0.5), 5 * k];
          if (t > this.actLength - 0.6) this.expression = 'surprised';
        },
      },
      hop: {
        weight: 1.2,
        length: [4.8, 4.8],
        when: still,
        face: 'happy',
        pose: (t) => {
          // Three hops, straight up and back down on the ball, arms flung up.
          const u = (t - 0.3) / 1.4;
          const n = Math.floor(u);
          if (u > 0 && n < 3) {
            const f = u - n;
            const air = f > 0.2 && f < 0.85;
            this.hop = air ? 0.2 * Math.sin(Math.PI * ((f - 0.2) / 0.65)) : 0;
            this.fwd = air ? [-150, -150] : [0, 0];
            this.out = air ? [20, 20] : [0, 0];
          }
          this.glow = (i, s) => (Math.sin(s * 9 - i * 0.6) > 0 ? 1 : 0.2);
        },
      },
      look: {
        weight: 1,
        length: [6, 7],
        when: still,
        face: 'neutral',
        pose: (t) => {
          // Looks all round with his arms out, a tightrope walker taking stock.
          const k = span(t, 0.4, 1, this.actLength - 1, this.actLength - 0.3);
          this.out = [50 * k, 50 * k];
          this.headTilt = [-2 * k, 60 * k * sin(t, 0.22), 5 * k * sin(t, 0.22, 0.25)];
          this.feeler = k;
          this.knock = 1 + 2 * k;
        },
      },
      reach: {
        weight: 0.8,
        length: [5, 5],
        when: still,
        face: 'sheepish',
        pose: (t) => {
          // Arms stretched right up, then a shake of the shoulders.
          const a = span(t, 0.3, 1.3, 2.4, 3);
          const b = span(t, 2.7, 3.2, 4.1, 4.6);
          this.fwd = [-165 * a, -165 * a];
          this.out = [10 * a, 10 * a];
          this.lean[0] = -6 * a + 4 * b * sin(t, 7);
          this.headTilt = [-14 * a, 0, 6 * b * sin(t, 7)];
        },
      },
      metronome: {
        weight: 1,
        length: [6, 6],
        when: still,
        face: 'focused',
        pose: (t) => {
          // Swings side to side over the ball like a metronome, arms still, eyes following.
          const k = span(t, 0.4, 1.2, 4.8, 5.6);
          this.lean[1] = 17 * k * sin(t, 0.7);
          this.headTilt = [0, 0, -8 * k * sin(t, 0.7)];
          this.glow = (i, s) =>
            Math.floor(s * 1.4 * 2) % 2 === 0 ? (i === 4 ? 1 : 0.2) : i === 6 ? 1 : 0.2;
        },
      },
      doze: {
        weight: 0.8,
        length: [9, 12],
        when: still,
        pose: (t) => {
          // Powers down on the ball: slow drift, head dropping, a little lurch awake and back.
          const k = span(t, 1, 2.6, this.actLength - 2, this.actLength - 0.6);
          this.lean = [-6 * k * sin(t, 0.12), 5 * k * sin(t, 0.09, 0.3)];
          this.headTilt = [22 * k, 0, 6 * k];
          this.knock = 0.4;
          this.expression = k > 0.4 ? 'asleep' : 'sleepy';
          this.glow = (_i, s) => 0.06 + 0.08 * Math.sin(s * 0.9);
        },
      },
    };
  }

  protected react(kind: Reaction, t: number) {
    if (kind === 'poked') {
      // Thrown backward off balance, arms up, the ball shooting forward under him to save it.
      const a = ease(t, 0, 0.1) * (1 - ease(t, 0.35, 1.2));
      this.lean = [-22 * a, 0];
      this.fwd = [-150 * a, -150 * a];
      this.hop = 0.08 * ease(t, 0, 0.1) * (1 - ease(t, 0.12, 0.4));
      this.feeler = 1;
      this.headTilt = [-12 * a, 0, 0];
      this.glow = (i, s) => (Math.sin(s * 26) > 0 ? 1 : 0.3) * (i % 2 ? 1 : 0.7);
    } else if (kind === 'dizzy') {
      const k = 1 - ease(t, 2.6, 3.6);
      this.spinTo = 360 * sm(t / 2.6);
      this.lean = [14 * k * Math.cos(t * 4.5), 14 * k * Math.sin(t * 4.5)];
      this.out = [(55 + 35 * Math.sin(t * 6)) * k, (55 - 35 * Math.sin(t * 6)) * k];
      this.knock = 1 + 4 * k;
      this.headTilt = [8 * k * Math.cos(t * 5), 0, 18 * k * Math.sin(t * 5)];
      this.glow = (i, s) => (Math.sin(s * 7 + i * 2.3) > 0.1 ? 1 : 0.1);
    } else {
      const k = this.fade(t, 0.5);
      this.out = [70 * k, 70 * k];
      this.lean = [0, 6 * k * sin(t, 0.9)];
      this.headTilt = [-4 * k, 0, 8 * k * sin(t, 0.7)];
      this.feeler = k;
      this.hop = 0.03 * k * Math.max(0, sin(t, 1.8));
      this.glow = (i, s) => 0.5 + 0.5 * Math.sin(s * 3 - i * 0.9);
    }
  }

  // ---------- Posing ----------

  protected idle(t: number) {
    this.lean = [0, 0];
    this.knock = 1;
    this.spinTo = 0;
    this.hop = 0;
    this.out = [0, 0];
    this.fwd = [0, 0];
    this.elbow = [0, 0];
    this.headTilt = [0, 0, 0];
    this.feeler = 0;
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
    this.spec.speed = this.act === 'carve' ? 1.3 : 0.75;
    // Walking: lean into it and roll the ball under him.
    const speed = this.stride / this.px; // m/s along the floor
    const go = clamp(speed / 0.45, 0, 1);
    const leaning: [number, number] = [this.lean[0] + 9 * go, this.lean[1]];
    // Small random knocks, the corrections that never stop.
    this.nextKnock -= dt;
    if (this.nextKnock <= 0) {
      this.nextKnock = (0.5 + Math.random() * 0.9) / Math.max(this.knock, 0.5);
      const m = 14 * this.knock;
      this.leanP.kick((Math.random() - 0.5) * m);
      this.leanR.kick((Math.random() - 0.5) * m);
    }
    fixed(dt, (h) => {
      this.leanP.update(h, leaning[0]);
      this.leanR.update(h, leaning[1]);
      const bz = BALL_R * 0.5 * Math.sin(this.leanP.y / DEG);
      const bx = -BALL_R * 0.5 * Math.sin(this.leanR.y / DEG);
      this.ballZ.update(h, bz);
      this.ballX.update(h, bx);
      this.hopS.update(h, this.hop);
    });
    p.add('body', this.leanP.y, 0, this.leanR.y);
    // The ball rolls as far as he travels.
    this.rollA += ((speed * dt) / BALL_R) * DEG;
    // Arms: hung, held out for balance and swung against the lean.
    const swing = -0.9 * this.leanR.y;
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 'L' : 'R';
      const sg = i === 0 ? 1 : -1;
      const counter = this.out[i] > 20 ? swing * sg * 0.5 + this.leanP.y * 0.2 : 0;
      p.add(`upper_arm.${s}`, this.fwd[i], 0, sg * (this.out[i] + counter + 8 * go));
      p.add(`forearm.${s}`, 0, 0, sg * (this.out[i] > 20 ? 14 : 6) + this.elbow[i]);
    }
    p.add(
      'head',
      this.headTilt[0] - 0.5 * this.leanP.y,
      this.headTilt[1],
      this.headTilt[2] + 0.5 * this.leanR.y,
    );
    p.add(
      'antenna',
      8 * wobble(this.env.time * 0.7, 9) - 0.6 * this.leanP.y,
      0,
      -0.6 * this.leanR.y,
    );
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
    this.h = this.hopS.y * this.px;
  }

  /** The ball: shifted under the lean, and turned as far as it has rolled. */
  protected after(_dt: number, env: Env) {
    const p = this.puppet;
    p.shift('orb', this.ballX.y, 0, this.ballZ.y);
    p.turn('orb', this.rollA + (this.ballZ.y / BALL_R) * DEG, 0, (-this.ballX.y / BALL_R) * DEG);
    this.pivot.rotation.y = this.spinTo / DEG;
    this.lights(env.time);
  }

  private lights(t: number) {
    const mood = this.expression;
    const asleep = mood === 'asleep';
    for (let i = 0; i < 7; i++) {
      let level: number;
      let tone: string | undefined;
      if (this.glow) {
        level = this.glow(i, t);
        if (this.act === 'dizzy' || this.act === 'spin')
          tone = RAINBOW[(i + Math.floor(t * 5)) % RAINBOW.length];
      } else if (this.stride > 1) {
        level = i < 4 ? 0.4 + 0.6 * Math.max(0, Math.sin(this.rollA / 30 + i * 1.6)) : 0.5;
      } else {
        // At rest the chest lamps count slowly down, the ball pips breathe.
        const c = Math.floor(t / 1.1) % 3;
        level = i >= 4 ? (i - 4 === c ? 1 : 0.15) : 0.25 + 0.25 * Math.sin(t * 1.4 + i);
        if (this.hovered) level = 0.55 + 0.45 * Math.sin(t * 3 - i * 0.9);
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
