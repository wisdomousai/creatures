import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { Bird, ease, type Reaction, span } from './birds';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import { Spring, wobble } from './spring';
import { DEG, fixed } from './toybot';

/**
 * Wax, the robot DJ: a speaker cabinet on two stubby legs, two woofers on its front that pump
 * with the beat and are ringed by three lit rings that run outward, a turntable on the top deck
 * with a record that spins and a tone arm that swings down onto it, and a screen head with
 * big headphones.
 *
 * There is no sound, only a beat he keeps: acts set a tempo and everything that moves to it
 * (woofers, rings, head, knees) reads it from the same clock, so it all lands together.
 *
 * His tricks are spinning a record (the arm drops, the platter turns, woofers pulse, the
 * rings run out), scratching it with his right hand, nodding to the beat and a little dance on
 * his stubby legs, with a bass drop for a finish. A poke is a thump through the speakers; the
 * mouse resting on him gets a head-bob.
 */
export const DJBOT_FACE: FaceLayout = {
  width: 512,
  height: 288,
  eyes: [
    [0.3, 0.46],
    [0.7, 0.46],
  ],
  rx: 0.08,
  ry: 0.25,
  line: 0.034,
  mouth: [0.5, 0.78],
};

const L1 = 0.053;
const L2 = 0.048;
const HIP_H = 0.15;
const ANKLE_H = 0.05;
const BPS = 2;
const sm = (x: number) => {
  const u = clamp(x, 0, 1);
  return u * u * (3 - 2 * u);
};

type Pair = [number, number];

export class Djbot extends Bird {
  private dropS = new Spring(6, 0.5, 1.1, 0);
  private hopS = new Spring(6, 0.5, 1, 0);
  private walkK = new Spring(5, 1, 1, 0);
  private rpsS = new Spring(1.6, 1, 1, 0);
  private armS = new Spring(3, 0.7, 1, 0);
  // Per-frame requests from the acts, cleared in idle().
  private drop = 0;
  private hop = 0;
  private spinTo = 0;
  private shuffle = 0;
  private rps = 0;
  private scratch = 0;
  private needle = 0;
  private armP: Pair = [0, 0];
  private armY: Pair = [0, 0];
  private armR: Pair = [0, 0];
  private foreP: Pair = [0, 0];
  private foreR: Pair = [0, 0];
  private headTilt: [number, number, number] = [0, 0, 0];
  private feet: Pair = [0, 0];
  private bounce = 0;
  /** The beat: where we are in it (0..1), and how many have gone; woofers' push; all-rings flash. */
  private beat = 0;
  private bar = 0;
  private pump = 0;
  private live = 0;
  private flashAll = 0;
  private record = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Wax',
        model: 'djbot',
        metres: 0.69,
        width: 0.46,
        size: 1.1,
        feels: {
          default: { f: 4, zeta: 0.6 },
          root: { f: 4, zeta: 0.5 },
          body: { f: 6, zeta: 0.5 },
          neck: { f: 6, zeta: 0.5 },
          head: { f: 5, zeta: 0.35, r: 0.8 },
          'leg.L': { f: 9, zeta: 0.7 },
          'leg.R': { f: 9, zeta: 0.7 },
          'foot.L': { f: 10, zeta: 0.7 },
          'foot.R': { f: 10, zeta: 0.7 },
          'upper_arm.L': { f: 6, zeta: 0.4 },
          'upper_arm.R': { f: 6, zeta: 0.4 },
          'forearm.L': { f: 7, zeta: 0.3 },
          'forearm.R': { f: 7, zeta: 0.3 },
          'hand.L': { f: 8, zeta: 0.3 },
          'hand.R': { f: 8, zeta: 0.3 },
        },
        face: DJBOT_FACE,
        eyes: 0.8,
        gaze: [{ bone: 'head', yaw: 0.9, pitch: 0.8 }],
        reach: { yaw: 55, pitch: 25 },
        lag: 1.6,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 0.6,
        turn: 70,
      },
      model,
    );
    this.acts = { ...this.moves(), ...this.reactions() };
  }

  /** Keep time: the beat's phase and bar from the act's clock; the woofers push on each beat. */
  private tempo(t: number, k = 1, bps = BPS) {
    const c = t * bps;
    this.bar = Math.floor(c);
    this.beat = c % 1;
    this.pump = k * Math.exp(-this.beat * 5.5);
    this.live = k;
  }

  private moves(): Record<string, Act> {
    const still = () => this.still() && this.state === 'here';
    return {
      idle: { weight: 3, length: [3, 6] },
      stroll: {
        weight: 2.2,
        length: [3, 5],
        when: this.still,
        start: () => this.amble(1.2 + Math.random() * 1.6),
      },
      spin: {
        weight: 2.2,
        length: [8, 9],
        when: still,
        face: 'happy',
        pose: (t) => {
          // Drops the needle, the platter turns, the woofers pump and the rings run out.
          const k = span(t, 0.6, 1.4, this.actLength - 1.6, this.actLength - 0.4);
          this.needle = ease(t, 0.2, 1) * (1 - ease(t, this.actLength - 1.5, this.actLength - 0.6));
          this.rps = 0.9 * k;
          this.tempo(t, k);
          this.drop = 0.006 * k * Math.exp(-this.beat * 4);
          this.headTilt = [-6 * k * Math.exp(-this.beat * 4) + 3 * k, 5 * k * sin(t, 0.25), 0];
          this.armP = [-10 * k, 0];
          this.armR = [20 * k * (0.5 + 0.5 * Math.sin(t * 3)), 0];
          this.feet = [0, 0];
        },
      },
      scratch: {
        weight: 1.8,
        length: [7, 8],
        when: still,
        face: 'determined',
        pose: (t) => {
          // The right hand goes down onto the record and works it back and forth.
          const k = span(t, 0.5, 1.3, this.actLength - 1.2, this.actLength - 0.3);
          this.needle = 0;
          this.rps = 0;
          const w = Math.sin(t * 8.5) * Math.sin(t * 2.1);
          this.scratch = 130 * k * w;
          this.armR = [0, -70 * k];
          this.armP = [-18 * k, -90 * k];
          this.foreP = [0, -100 * k + 22 * k * w];
          this.armY = [0, 16 * k * w];
          this.armP[0] = -10 * k;
          this.tempo(t, k, 4.2);
          this.pump = k * Math.max(0, Math.abs(w) - 0.4);
          this.headTilt = [-4 * k, 0, 10 * k * Math.sin(t * 2.1)];
          this.drop = 0.008 * k * Math.abs(w);
          this.expression = 'determined';
        },
      },
      nod: {
        weight: 1.5,
        length: [6, 7],
        when: still,
        face: 'happy',
        pose: (t) => {
          // Nods to the beat, shoulders going, one foot tapping.
          const k = span(t, 0.4, 1, this.actLength - 1, this.actLength - 0.2);
          this.tempo(t, k * 0.6);
          const d = Math.exp(-this.beat * 4);
          this.headTilt = [14 * k * d - 2, 0, 4 * k * Math.sin(Math.PI * t * BPS)];
          this.armP = [-30 * Math.sin(Math.PI * t * BPS) * k, 30 * Math.sin(Math.PI * t * BPS) * k];
          this.armR = [10 * k, 10 * k];
          this.drop = 0.008 * k * d;
          this.feet = [
            0,
            0.7 * k * (this.bar % 2 === 1 ? Math.sin(Math.PI * Math.min(1, this.beat * 1.4)) : 0),
          ];
        },
      },
      dance: {
        weight: 1.6,
        length: [7, 8],
        when: still,
        face: 'happy',
        pose: (t) => {
          // A little dance: knees up in turn, arms pumping, hopping on the off-beat.
          const k = this.fade(t, 0.6);
          this.tempo(t, k);
          const s = Math.sin(Math.PI * t * BPS);
          this.feet = [k * Math.max(0, s), k * Math.max(0, -s)];
          this.hop = this.beat > 0.5 ? 0.02 * k * Math.sin(Math.PI * ((this.beat - 0.5) / 0.5)) : 0;
          this.bounce = 0.008 * k * Math.abs(s);
          this.armP = [(-75 + 40 * s) * k, (-75 - 40 * s) * k];
          this.armR = [(30 + 10 * s) * k, (30 - 10 * s) * k];
          this.headTilt = [-4 * k * Math.abs(s), 8 * k * s, 7 * k * s];
          this.rps = 0.4 * k;
          this.needle = k;
        },
      },
      drop: {
        weight: 1.2,
        length: [7, 7],
        when: still,
        face: 'determined',
        pose: (t) => {
          // Builds: crouching lower, the woofers shaking. Then the drop: up with a blast.
          const build = ease(t, 0.3, 3.4) * (1 - ease(t, 3.4, 3.5));
          const boom = t > 3.5 ? Math.exp(-(t - 3.5) * 2.2) : 0;
          this.drop = 0.022 * build;
          this.hop =
            t > 3.5 ? 0.15 * Math.max(0, Math.sin(Math.PI * Math.min(1, (t - 3.5) / 0.7))) : 0;
          this.armP = [-15 * build - 150 * boom, -15 * build - 150 * boom];
          this.armR = [-5 * build + 25 * boom, -5 * build + 25 * boom];
          this.headTilt = [14 * build - 20 * boom, 0, 0];
          this.pump = clamp(0.5 * build * (0.6 + 0.4 * Math.sin(t * 40)) + boom, 0, 1);
          this.live = 1;
          this.flashAll = boom;
          this.rps = 0.8 * ease(t, 3.4, 4);
          this.needle = ease(t, 3.5, 3.9);
          this.expression = t > 3.5 ? 'starry' : 'determined';
          if (t > 3.5) this.tempo(t - 3.5, boom * 0.9 + 0.1);
        },
      },
      adjust: {
        weight: 1,
        length: [5, 5],
        when: still,
        face: 'focused',
        pose: (t) => {
          // One hand to his headphones, listening hard, head cocked to the cup.
          const k = span(t, 0.4, 1.2, 3.8, 4.6);
          this.armR = [168 * k, 0];
          this.foreR = [-26 * k, 0];
          this.headTilt = [0, 0, 12 * k + 3 * k * sin(t, 1.5)];
          this.rps = 0.5 * k;
          this.needle = k;
          this.armP = [8 * k, 0];
        },
      },
      groove: {
        weight: 1.2,
        length: [7, 8],
        when: still,
        face: 'wink',
        pose: (t) => {
          // Swaying side to side with a roll of the shoulders and a slow bob.
          const k = this.fade(t, 0.7);
          this.tempo(t, k * 0.5, 1);
          const s = sin(t, 0.5);
          this.armR = [(40 + 20 * s) * k, (40 - 20 * s) * k];
          this.armP = [-12 * k * s, 12 * k * s];
          this.headTilt = [4 * k * Math.abs(s), 12 * k * s, 10 * k * s];
          this.bounce = 0.006 * k * Math.abs(s);
          this.feet = [k * Math.max(0, s) * 0.5, k * Math.max(0, -s) * 0.5];
        },
      },
      wave: {
        weight: 1.3,
        length: [3.8, 4.6],
        when: still,
        face: 'happy',
        pose: (t) => {
          const k = span(t, 0.2, 0.7, this.actLength - 0.7, this.actLength - 0.1);
          this.armP = [-140 * k, 0];
          this.foreR = [28 * k * sin(t, 2.4), 0];
          this.armR = [10 * k, 0];
          this.headTilt = [0, 0, 8 * k];
        },
      },
      bow: {
        weight: 0.8,
        length: [3.6, 3.6],
        when: still,
        face: 'happy',
        pose: (t) => {
          const k = ease(t, 0.3, 1) * (1 - ease(t, 2, 2.9));
          this.headTilt = [22 * k, 0, 0];
          this.armP = [-20 * k, -20 * k];
          this.drop = 0.018 * k;
        },
      },
      shuffle: {
        weight: 0.9,
        length: [5.4, 5.4],
        when: still,
        face: 'happy',
        pose: (t) => {
          // A shuffling turn on the spot, hands out, everything in time.
          const k = span(t, 0.3, 0.8, 4.6, 5.2);
          this.spinTo = 360 * sm((t - 0.3) / 4.6);
          this.shuffle = k;
          this.tempo(t, k * 0.7);
          this.armR = [45 * k, 45 * k];
          this.headTilt = [0, 0, 6 * k * Math.sin(t * 8)];
          this.bounce = 0.006 * k * Math.abs(Math.sin(t * 6));
        },
      },
      nap: {
        weight: 0.8,
        length: [9, 12],
        when: still,
        pose: (t) => {
          const k = span(t, 1, 2.4, this.actLength - 2, this.actLength - 0.6);
          this.drop = 0.012 * k;
          this.headTilt = [20 * k, 0, 5 * k];
          this.rps = 0.05 * k;
          this.expression = k > 0.4 ? 'asleep' : 'sleepy';
        },
      },
    };
  }

  protected react(kind: Reaction, t: number) {
    if (kind === 'poked') {
      // A thump through the speakers: the woofers jump, every ring lights, he jolts upright.
      const k = ease(t, 0, 0.06) * (1 - ease(t, 0.25, 1));
      this.pump = k;
      this.live = 1;
      this.flashAll = k;
      this.hop = 0.07 * ease(t, 0, 0.08) * (1 - ease(t, 0.1, 0.42));
      this.armP = [-60 * k, -60 * k];
      this.armR = [50 * k, 50 * k];
      this.headTilt = [-14 * k, 0, 0];
    } else if (kind === 'dizzy') {
      const k = 1 - ease(t, 2.6, 3.6);
      this.spinTo = 360 * sm(t / 2.6);
      this.shuffle = k * ease(t, 0, 0.3);
      this.rps = 2.4 * k;
      this.needle = 1;
      this.tempo(t, k, 3.4);
      this.headTilt = [8 * k * Math.cos(t * 5), 0, 18 * k * Math.sin(t * 5)];
      this.armP = [-40 * k * Math.sin(t * 5), 40 * k * Math.sin(t * 5)];
    } else {
      const k = this.fade(t, 0.5);
      this.tempo(t, k * 0.7);
      this.headTilt = [10 * k * Math.exp(-this.beat * 4), 0, 6 * k * Math.sin(Math.PI * t * BPS)];
      this.armR = [35 * k, 35 * k];
      this.rps = 0.7 * k;
      this.needle = k;
    }
  }

  // ---------- Posing ----------

  protected idle(t: number) {
    this.drop = 0;
    this.hop = 0;
    this.spinTo = 0;
    this.shuffle = 0;
    this.rps = 0;
    this.scratch = 0;
    this.needle = 0;
    this.armP = [0, 0];
    this.armY = [0, 0];
    this.armR = [0, 0];
    this.foreP = [0, 0];
    this.foreR = [0, 0];
    this.headTilt = [0, 0, 0];
    this.feet = [0, 0];
    this.bounce = 0;
    this.beat = 0;
    this.bar = 0;
    this.pump = 0;
    this.live = 0;
    this.flashAll = 0;
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
    fixed(dt, (h) => {
      this.dropS.update(h, this.drop);
      this.hopS.update(h, this.hop);
      this.walkK.update(h, this.stride > 1 ? 1 : 0);
      this.rpsS.update(h, this.rps);
      this.armS.update(h, this.needle);
    });
    // The platter, free-running; the hand's scratch is added on top, direct.
    this.record = (this.record + this.rpsS.y * 360 * dt) % 360;
    // Arms.
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 'L' : 'R';
      const sg = i === 0 ? 1 : -1;
      const swing = 20 * this.walkK.y * Math.sin(this.gait * Math.PI + i * Math.PI);
      p.add(
        `upper_arm.${s}`,
        this.armP[i] + swing,
        this.armY[i],
        sg * (this.armR[i] + 6 + 6 * this.walkK.y),
      );
      p.add(`forearm.${s}`, this.foreP[i], 0, sg * 6 + this.foreR[i]);
    }
    p.add('head', this.headTilt[0], this.headTilt[1], this.headTilt[2]);
    this.h = this.hopS.y * this.px;
  }

  protected after(_dt: number, env: Env) {
    const p = this.puppet;
    const t = env.time;
    // The body: crouching a little, bobbing in step.
    const bob = this.bounce + 0.005 * this.walkK.y * Math.abs(Math.sin(this.gait * Math.PI));
    const dy = clamp(this.dropS.y, -0.01, 0.03);
    p.shift('body', 0, -dy + bob, 0);
    // Legs: a crouch from the body dropping, a step from the gait, a knee lifted for the dance.
    const d = Math.min(HIP_H - ANKLE_H - Math.min(dy, 0.02), L1 + L2 - 0.0005);
    const a = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1)) * DEG;
    const b = Math.asin(clamp((L1 * Math.sin(a / DEG)) / L2, -1, 1)) * DEG;
    const crouch = a > 0.5 ? a : 0;
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 'L' : 'R';
      const ang = this.gait * Math.PI + i * Math.PI;
      const step = this.walkK.y * -26 * Math.sin(ang);
      const shin = this.walkK.y * 26 * Math.max(0, Math.cos(ang));
      const shuf = this.shuffle * Math.max(0, Math.sin(this.spinTo / 22 + i * Math.PI));
      const up = this.feet[i];
      p.turn(`leg.${s}`, -crouch + step - 14 * shuf - 42 * up, 0, 0);
      p.turn(`foot.${s}`, (crouch ? a + b : 0) + shin + 24 * shuf + 70 * up, 0, 0);
    }
    // The turntable: the record spins, the tone arm swings over onto it.
    // (The deck is tipped toward the viewer, so both turn about their own bone's axis, the deck's normal.)
    p.bone('record').rotateY((this.record + this.scratch) / DEG);
    const on = clamp(this.armS.y, -0.1, 1.1);
    p.bone('tonearm').rotateY((-46 * on) / DEG);
    // The woofers pump with the beat.
    const push = this.pump;
    for (const s of ['L', 'R']) {
      p.shift(`woofer.${s}`, 0, 0, -0.012 * push);
      p.stretch(`woofer.${s}`, 1 - 0.25 * push, [0, 0, 1], 1 + 0.04 * push);
    }
    this.pivot.rotation.y = this.spinTo / DEG;
    this.lights(t);
  }

  private lights(t: number) {
    const mood = this.expression;
    const asleep = mood === 'asleep';
    for (let i = 0; i < 6; i++) {
      const ring = i % 3;
      let level: number;
      let tone: string | undefined;
      if (this.live > 0.05) {
        // A ring lights as the beat's pulse passes it, outermost last.
        const front = this.beat * 3.4;
        level =
          clamp(1 - Math.abs(front - ring - 0.3) * 0.8, 0.12, 1) * clamp(this.live + 0.2, 0, 1);
        tone = RAINBOW[(ring + this.bar) % RAINBOW.length];
      } else if (this.stride > 1) {
        level = 0.25 + 0.75 * Math.max(0, Math.sin(this.gait * 3 - ring * 1.2));
      } else {
        // At rest the rings glow low and a ring runs out now and then.
        const c = (t / 2.4) % 1.8;
        level = 0.12 + 0.6 * clamp(1 - Math.abs(c * 2.2 - ring) * 0.9, 0, 1);
        if (this.hovered) level = 0.4 + 0.6 * Math.max(0, Math.sin(t * 6 - ring * 1.1));
      }
      if (this.flashAll > 0.05) level = Math.max(level, this.flashAll);
      this.outfit.dot(i, clamp(asleep ? level * 0.35 : level, 0, 1), tone);
    }
    // The record's lit rim, label ring and mark: bright while it turns or is scratched.
    const spin = clamp(this.rpsS.y + Math.abs(this.scratch) / 60, 0, 1);
    this.outfit.dot(
      6,
      clamp(asleep ? 0.1 : 0.4 + 0.45 * spin + 0.3 * this.live * Math.exp(-this.beat * 4), 0, 1),
      this.live > 0.05 ? RAINBOW[this.bar % RAINBOW.length] : undefined,
    );
    this.outfit.beacon(
      this.live > 0.3 || this.act === 'dizzy'
        ? RAINBOW[(this.bar + 3) % RAINBOW.length]
        : (BEACON[mood] ?? '#f4f4f1'),
    );
  }
}
