import type { Object3D } from 'three';
import type { Act, Env } from './character';
import type { FaceLayout } from './face';
import { Jobbot } from './jobbot';
import { sin } from './moves';
import { smooth } from './toybot';

/**
 * Orbit, a small spacesuit robot: a big round bubble helmet with the screen face behind a
 * gold-rimmed visor, a wide backpack with two tanks and lit gauges, a chest panel of lit
 * buttons, striped sleeves, chunky boots and a little antenna with a beacon.
 *
 * Everything he does is in low gravity, so it takes its time. Tricks: floating up and
 * drifting slowly back down with his arms out, a slow-motion moonwalk that kicks up dust, planting a little
 * flag (a lit star on it) and saluting it, waving through the visor, bouncing about in slow
 * hops, checking the gauges on his chest, listening for a signal with the antenna's beacon
 * blinking, gazing at the stars and pointing; plus the shared ones.
 */
export const ASTRONAUT_FACE: FaceLayout = {
  width: 512,
  height: 384,
  eyes: [
    [0.3, 0.46],
    [0.7, 0.46],
  ],
  rx: 0.09,
  ry: 0.2,
  line: 0.034,
  mouth: [0.5, 0.76],
};

const CYAN = '#6fe3ff';
const GOLD = '#ffd35c';
const BLUE = '#7fb0ff';
const FLAG = { x: 0.32, y: -0.04 };

export class Astronaut extends Jobbot {
  private fx = {
    flag: 0, // 0..1 (size)
    drop: 0, // metres the flag is held above the ground
    dust: 0, // 0..1
    blink: 0, // buttons flashing, 0..1
    ping: 0, // antenna beacon blinking, 0..1
  };
  private dustT = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Orbit',
        model: 'astronaut',
        metres: 0.74,
        width: 0.5,
        size: 0.98,
        feels: {
          default: { f: 2.2, zeta: 0.5 },
          root: { f: 2.2, zeta: 0.7 },
          body: { f: 1.9, zeta: 0.45 },
          head: { f: 1.8, zeta: 0.4, r: 0.4 },
          antenna: { f: 2.8, zeta: 0.15 },
          flag: { f: 3, zeta: 0.2 },
          'upper_arm.L': { f: 2.4, zeta: 0.45 },
          'upper_arm.R': { f: 2.4, zeta: 0.45 },
          'forearm.L': { f: 2.8, zeta: 0.4 },
          'forearm.R': { f: 2.8, zeta: 0.4 },
          'leg.L': { f: 2.6, zeta: 0.5 },
          'leg.R': { f: 2.6, zeta: 0.5 },
        },
        face: ASTRONAUT_FACE,
        eyes: 0.72,
        gaze: [
          { bone: 'head', yaw: 0.7, pitch: 0.6 },
          { bone: 'body', yaw: 0.2, pitch: 0.1 },
        ],
        reach: { yaw: 50, pitch: 26 },
        lag: 1.1,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [60, 130],
        speed: 0.6,
      },
      model,
    );
    this.acts = { ...this.common(), ...this.moves() };
  }

  private moves(): Record<string, Act> {
    const p = this.puppet;
    const ok = () => this.free_;
    return {
      // Up in the low gravity, arms out, legs trailing, and a slow drift back down.
      float: {
        weight: 2.4,
        length: [10, 10],
        face: 'surprised',
        when: ok,
        pose: (t) => {
          const up = smooth((t - 0.3) / 1.6);
          const down = smooth((t - 5.2) / 3.6);
          const k = up * (1 - down);
          this.jb.hop = 0.32 * (up - down) + 0.01 * Math.sin(t * 1.8) * k;
          this.jb.still = true;
          const air = smooth((t - 0.3) / 0.6) * smooth((9.2 - t) / 0.5);
          this.arms(60 * air + 15 * Math.sin(t * 1.6) * air, 60 * air, 20 * air);
          p.add('leg.L', 24 * air + 8 * Math.sin(t * 1.3 + 1) * air, 0, 6 * air);
          p.add('leg.R', 16 * air + 8 * Math.sin(t * 1.3) * air, 0, -6 * air);
          p.add('body', -10 * air, 0, 8 * Math.sin(t * 0.9) * air);
          p.add('head', -6 * air, 0, 6 * Math.sin(t * 0.9 + 1) * air);
          this.expression = t < 5.2 ? (t > 2 ? 'happy' : 'surprised') : 'happy';
          if (t > 9.2) p.kick('body', 0, 0, 0);
        },
      },
      // A slow-motion moonwalk: wide slow steps, high slow arcs, dust at the heels.
      moonwalk: {
        weight: 1.6,
        length: [5, 6],
        face: 'happy',
        when: ok,
        start: () =>
          this.stroll(Math.random() < 0.5 ? -1 : 1, this.heightPx * (1.4 + Math.random() * 1.2)),
        pose: (t) => {
          const walking = this.stride > this.heightPx * 0.05;
          const a = Math.sin(this.gait * 0.7);
          const k = walking ? 1 : 0;
          if (k) {
            this.jb.hop = Math.max(this.jb.hop, 0.06 * Math.abs(Math.cos(this.gait * 0.7)));
            p.add('leg.L', -34 * a, 0, 4);
            p.add('leg.R', 34 * a, 0, -4);
            this.arm(1, 40 * a, 24, 20);
            this.arm(-1, -40 * a, 24, 20);
            p.add('body', -5, 0, 3 * a);
          }
          this.fx.dust = k ? 1 : Math.max(0, this.fx.dust - 0.02);
          if (!k && t > 1) {
            this.hands(10, 20, 10);
          }
        },
      },
      // Sets a flag by his side, pushes it in with two bounces, steps back and salutes.
      plantFlag: {
        weight: 2.2,
        length: [12, 12],
        face: 'focused',
        when: ok,
        pose: (t) => {
          this.fx.flag = smooth((t - 0.3) / 0.7) * smooth((11.6 - t) / 0.7);
          const reach = smooth((t - 0.8) / 0.6) * smooth((6.6 - t) / 0.7);
          // Held up over the spot, then pushed down in two strokes.
          const stroke =
            t < 3 ? 0 : t < 4.2 ? smooth((t - 3) / 0.4) * 0.5 : smooth((t - 4.2) / 0.3) * 0.5 + 0.5;
          this.fx.drop = 0.14 * (1 - stroke) * smooth((t - 0.3) / 0.7);
          p.add('body', 10 * reach, -14 * reach, 0);
          this.arm(1, 12 * reach, 78 * reach, 14 * reach);
          this.arm(-1, 20 * reach, 20, 20);
          // Steps back and salutes.
          const sal = smooth((t - 6.6) / 0.6) * smooth((10.8 - t) / 0.6);
          if (sal > 0) {
            this.arm(-1, 138 * sal, 25 * sal, 110 * sal);
            p.add('head', -6 * sal);
            p.add('body', -3 * sal);
            this.expression = 'happy';
          }
          if (t > 10.8) this.expression = 'love';
          this.fx.blink = t > 5.4 && t < 7 ? 1 : 0;
          p.add('flag', 0, 0, 2.5 * Math.sin(t * 3) * sal);
        },
      },
      // Waves hello through the visor with both gloves, in turn.
      waveVisor: {
        weight: 1.5,
        length: [5, 5],
        face: 'happy',
        when: ok,
        pose: (t) => {
          const k = smooth((t - 0.2) / 0.4) * smooth((4.8 - t) / 0.4);
          const w = Math.sin(t * 7);
          this.arm(1, 145 * k, 22 * k, 25 * k + 30 * k * w);
          this.arm(
            -1,
            35 * k * (t > 2.4 ? 0 : 1) + 140 * k * (t > 2.4 ? 1 : 0),
            22 * k,
            25 * k + 30 * k * -w,
          );
          p.add('head', 6 * k, 0, 10 * k * Math.sin(t * 2));
          if (this.face) this.face.talk = (0.4 + 0.4 * Math.abs(Math.sin(t * 9))) * k;
        },
      },
      // Slow, high hops in place.
      bounce: {
        weight: 1.4,
        length: [6, 6],
        face: 'happy',
        when: ok,
        pose: (t) => {
          const k = smooth(t / 0.4) * smooth((5.6 - t) / 0.4);
          const ph = (t * 0.45) % 1;
          this.jb.hop = 0.2 * 4 * ph * (1 - ph) * k;
          this.jb.still = true;
          const air = 4 * ph * (1 - ph);
          this.arms(60 * air * k + 10, 50 * k, 20);
          p.add('leg.L', 18 * air * k);
          p.add('leg.R', -10 * air * k);
          p.add('body', -4 * air * k);
        },
      },
      // Taps the buttons on his chest; they flash in turn.
      gauges: {
        weight: 1.2,
        length: [5, 5],
        face: 'focused',
        when: ok,
        pose: (t) => {
          const k = smooth((t - 0.2) / 0.4) * smooth((4.8 - t) / 0.4);
          this.fx.blink = k;
          p.add('head', 18 * k, 0, 0);
          this.arm(-1, 60 * k, 10, 90 * k + 8 * Math.max(0, Math.sin(t * 6)) * k);
          this.arm(1, 5, 14, 12);
          this.expression = t > 3.6 ? 'happy' : 'focused';
        },
      },
      // A hand to the ear pod: listening to a faraway signal, the beacon blinking.
      listen: {
        weight: 1.1,
        length: [6, 6],
        face: 'focused',
        when: ok,
        pose: (t) => {
          const k = smooth((t - 0.2) / 0.5) * smooth((5.6 - t) / 0.5);
          this.fx.ping = k;
          this.arm(1, 118 * k, 38 * k, 120 * k);
          p.add('head', 0, 0, -14 * k);
          p.add('antenna', 0, 0, 12 * Math.sin(t * 5) * k);
          this.expression = t > 4 ? 'surprised' : 'focused';
          if (t > 4.2) this.arm(-1, 120 * k, 40, 15);
        },
      },
      // Looks up at the stars and points.
      stars: {
        weight: 1.2,
        length: [6, 6],
        when: ok,
        pose: (t) => {
          const k = smooth((t - 0.3) / 0.7) * smooth((5.6 - t) / 0.6);
          p.add('head', -38 * k, 10 * Math.sin(t * 0.8) * k);
          p.add('body', -8 * k);
          this.arm(1, 150 * k, 30 * k, 4 * k);
          this.expression = 'love';
          this.fx.ping = 0.5 * k;
        },
      },
    };
  }

  protected walkArms(a: number, amt: number) {
    this.arm(1, 12 * a * amt, 14 * amt, 10);
    this.arm(-1, -12 * a * amt, 14 * amt, 10);
  }

  protected stance(t: number) {
    Object.assign(this.fx, { flag: 0, drop: 0, dust: 0, blink: 0, ping: 0 });
    const w = Math.sin(2 * Math.PI * 0.2 * t);
    this.arm(1, 4 + 2 * w, 16, 10);
    this.arm(-1, 4 - 2 * w, 16, 10);
    this.puppet.add('antenna', 0, 0, 5 * Math.sin(2 * Math.PI * 0.35 * t));
  }

  protected extras(dt: number, env: Env) {
    const p = this.puppet;
    const f = this.fx;
    const tiny = (k: number) => Math.max(0.001, k);
    p.stretch('flag', tiny(f.flag), [0, 1, 0], tiny(f.flag));
    p.shift('flag', 0, f.drop, 0);
    // Dust puffs rise and fade behind the heels while he moonwalks.
    this.dustT += dt * (f.dust > 0.05 ? 1 : 0);
    for (const i of [1, 2, 3]) {
      const ph = (this.dustT * 0.8 + i / 3) % 1;
      const s = f.dust * Math.sin(Math.PI * ph) * 1.1;
      p.stretch(`dust.${i}`, tiny(s), [0, 1, 0], tiny(s));
      p.shift(`dust.${i}`, (i - 2) * 0.06, 0.06 * ph, 0.08 + 0.1 * ph);
    }
    const mood = this.face?.expression ?? 'neutral';
    const asleep = mood === 'asleep';
    const blink = (n: number) =>
      f.blink > 0.05 ? (Math.sin(env.time * 9 + n * 2.1) > 0 ? 1 : 0.15) : 0.6;
    this.outfit.dot(0, asleep ? 0.2 : blink(0), CYAN);
    this.outfit.dot(1, asleep ? 0.2 : blink(1), GOLD);
    this.outfit.dot(2, asleep ? 0.2 : blink(2), BLUE);
    this.outfit.beacon(
      asleep ? '#8a8a84' : f.ping > 0.05 && Math.sin(env.time * 8) > 0 ? '#ffffff' : CYAN,
    );
  }
}
