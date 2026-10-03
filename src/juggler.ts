import type { Object3D } from 'three';
import type { Act, Env } from './character';
import type { FaceLayout } from './face';
import { Jobbot } from './jobbot';
import { sin } from './moves';
import { smooth } from './toybot';

/**
 * Caper, a juggling robot with four arms: a striped body, a ruffled collar of plates round
 * her neck, a round head with a pom-pom on a curl of wire, a pair of arms at the shoulders
 * and another at the waist, and round yellow shoes. Her balls are lit, one colour each, and
 * live in a bone of their own until she juggles.
 *
 * Tricks: juggling three balls (they pop into her hands one by one, and are pocketed one by one
 * after), juggling five with all four hands (three over the top, two below), dropping one
 * that bonks her on the head and bounces away, spinning a ball on a finger and then balancing
 * it on her head, tossing one ball high from hand to hand, a ta-da with all four arms
 * thrown out in a bow; and the shared ones.
 */
export const JUGGLER_FACE: FaceLayout = {
  width: 512,
  height: 362,
  eyes: [
    [0.3, 0.46],
    [0.7, 0.46],
  ],
  rx: 0.085,
  ry: 0.22,
  line: 0.034,
  mouth: [0.5, 0.77],
};

const COLOURS = ['#ff6a6a', '#ffd35c', '#7ad98a', '#5ab8ff', '#ff8ab8'];
/** Where the balls rest (bone heads), so a shift from here puts one at (x, z). */
const REST = { y: -0.15, z: 0.3 };
const HAND = 0.2; // how far out a hand catches, metres

interface Ball {
  x: number;
  z: number;
  k: number; // 0..1, its size
}

/**
 * Ball `idx` of an `n`-ball cascade between hands at +-xr, thrown every `beat` seconds: where
 * it is at `time`. Each ball is thrown once every n beats, alternating sides, and rests in
 * a hand for a fraction `dwell` of its turn.
 */
function cascade(
  time: number,
  idx: number,
  n: number,
  beat: number,
  xr: number,
  z0: number,
  height: number,
) {
  const dwell = n >= 5 ? 0.12 : n === 1 ? 0.12 : 0.25;
  const s = time / (beat * n) + idx / n;
  const turn = Math.floor(s);
  const u = s - turn;
  const dir = (turn + idx) % 2 === 0 ? 1 : -1;
  const v = Math.max(0, (u - dwell) / (1 - dwell));
  return { x: xr * dir * (1 - 2 * v), z: z0 + height * 4 * v * (1 - v), v, dir };
}

export class Juggler extends Jobbot {
  private balls: Ball[] = Array.from({ length: 5 }, () => ({ x: 0, z: REST.z, k: 0 }));
  private glow = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Caper',
        model: 'juggler',
        metres: 0.72,
        width: 0.55,
        size: 0.95,
        feels: {
          default: { f: 2.4, zeta: 0.5 },
          root: { f: 2.4, zeta: 0.7 },
          body: { f: 2.2, zeta: 0.5 },
          head: { f: 2, zeta: 0.4, r: 0.4 },
          pom: { f: 2.8, zeta: 0.15 },
          'upper_arm.L': { f: 3.2, zeta: 0.5 },
          'upper_arm.R': { f: 3.2, zeta: 0.5 },
          'forearm.L': { f: 3.6, zeta: 0.45 },
          'forearm.R': { f: 3.6, zeta: 0.45 },
          'upper_arm2.L': { f: 3.2, zeta: 0.5 },
          'upper_arm2.R': { f: 3.2, zeta: 0.5 },
          'forearm2.L': { f: 3.6, zeta: 0.45 },
          'forearm2.R': { f: 3.6, zeta: 0.45 },
          'leg.L': { f: 3, zeta: 0.5 },
          'leg.R': { f: 3, zeta: 0.5 },
        },
        face: JUGGLER_FACE,
        eyes: 0.76,
        gaze: [
          { bone: 'head', yaw: 0.7, pitch: 0.6 },
          { bone: 'body', yaw: 0.2, pitch: 0.1 },
        ],
        reach: { yaw: 50, pitch: 26 },
        lag: 1.2,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [60, 130],
        speed: 0.8,
      },
      model,
    );
    this.acts = { ...this.common(), ...this.moves() };
  }

  /** The lower pair: side 1 is the left. */
  private arm2(side: 1 | -1, forward: number, raise = 0, bend = 0) {
    const s = side === 1 ? 'L' : 'R';
    const p = this.puppet;
    p.add(`upper_arm2.${s}`, -forward, 0, side * raise);
    p.add(`forearm2.${s}`, -bend, 0, 0);
  }

  protected hands(forward: number, raise = 0, bend = 0) {
    this.arms(forward, raise, bend);
    this.arm2(1, forward * 0.6, raise * 1.1 + 12, bend * 0.8);
    this.arm2(-1, forward * 0.6, raise * 1.1 + 12, bend * 0.8);
  }

  private put(i: number, x: number, z: number, k = 1) {
    const b = this.balls[i];
    b.x = x;
    b.z = z;
    b.k = k;
  }

  /** Upper hands working a cascade: catching at the sides, rocking with the throws. */
  private working(t: number, beat: number, k: number, lower = false) {
    const ph = (2 * Math.PI * t) / (2 * beat);
    this.arm(1, (62 + 16 * Math.sin(ph)) * k, 12 * k, 60 * k);
    this.arm(-1, (62 - 16 * Math.sin(ph)) * k, 12 * k, 60 * k);
    if (lower) {
      const q = (2 * Math.PI * t) / (2 * 0.5);
      this.arm2(1, (58 + 14 * Math.sin(q)) * k, 20 * k, 50 * k);
      this.arm2(-1, (58 - 14 * Math.sin(q)) * k, 20 * k, 50 * k);
    } else {
      this.arm2(1, 25 * k, 52 * k, 95 * k);
      this.arm2(-1, 25 * k, 52 * k, 95 * k);
    }
  }

  private moves(): Record<string, Act> {
    const p = this.puppet;
    const ok = () => this.free_;
    const pop = (t: number, at: number) => smooth((t - at) / 0.3);
    const pocket = (t: number, at: number) => 1 - smooth((t - at) / 0.3);
    return {
      juggle3: {
        weight: 2.6,
        length: [12, 12],
        face: 'focused',
        when: ok,
        pose: (t) => {
          const a = smooth((t - 0.2) / 0.5) * smooth((11.2 - t) / 0.5);
          const beat = 0.42;
          for (let i = 0; i < 3; i++) {
            const c = cascade(t, i, 3, beat, HAND, 0.3, 0.17);
            this.put(i, c.x, c.z, pop(t, 0.6 + 0.5 * i) * pocket(t, 9.6 + 0.6 * i));
          }
          this.working(t, beat, a);
          p.add('head', 0, 0, 3 * Math.sin(t * 2.6) * a);
          this.jb.hop = t > 4 && t < 9.4 ? 0.006 * Math.abs(Math.sin(t * 7.5)) : 0;
          if (t > 10.2) this.expression = 'happy';
          if (t > 11) this.arms(150, 40, 10);
        },
      },
      // All four hands: three balls over the top and two below.
      juggle5: {
        weight: 2.2,
        length: [15, 15],
        face: 'focused',
        when: ok,
        pose: (t) => {
          const a = smooth((t - 0.2) / 0.5) * smooth((14.2 - t) / 0.5);
          const beat = 0.4;
          for (let i = 0; i < 3; i++) {
            const c = cascade(t, i, 3, beat, HAND, 0.3, 0.17);
            this.put(i, c.x, c.z, pop(t, 0.6 + 0.5 * i) * pocket(t, 12 + 0.5 * i));
          }
          for (let i = 0; i < 2; i++) {
            const c = cascade(t, i, 2, 0.45, HAND, 0.16, 0.12);
            this.put(3 + i, c.x, c.z, pop(t, 3.5 + 0.6 * i) * pocket(t, 12.4 + 0.5 * i));
          }
          this.working(t, beat, a, t > 3.2 && t < 12.6);
          p.add('head', 0, 0, 3 * Math.sin(t * 2.6) * a);
          p.add('body', 0, 0, 2 * Math.sin(t * 3.1) * a);
          this.jb.hop = t > 5 && t < 12 ? 0.01 * Math.abs(Math.sin(t * 7.5)) : 0;
          if (t > 4.6 && t < 12) this.expression = 'happy';
          if (t > 13.6) this.hands(160, 60, 0);
        },
      },
      // Juggles, loses one: it goes up crooked, lands on her head, and bounces off.
      drop: {
        weight: 2.2,
        length: [11, 11],
        face: 'focused',
        when: ok,
        pose: (t) => {
          const beat = 0.42;
          const td = 4.6;
          const live = smooth((t - 0.2) / 0.5) * smooth((td + 1 - t) / 0.3);
          const run = t < td + 1 ? 1 : pocket(t, td + 1);
          for (let i = 0; i < 2; i++) {
            const c = cascade(Math.min(t, td + 0.2), i, 3, beat, HAND, 0.3, 0.17);
            const rest = t > td + 0.4 ? smooth((t - td - 0.4) / 0.6) : 0;
            this.put(
              i,
              c.x * (1 - rest) + (i ? 0.2 : -0.2) * rest,
              c.z * (1 - rest) + 0.3 * rest,
              pop(t, 0.6 + 0.5 * i) * run,
            );
          }
          // The third.
          const c2 = cascade(Math.min(t, td), 2, 3, beat, HAND, 0.3, 0.17);
          if (t < td) this.put(2, c2.x, c2.z, pop(t, 1.6));
          else {
            const v = (t - td) / 0.9;
            if (v < 1)
              this.put(2, c2.x * (1 - v), c2.z + (0.66 - c2.z) * v + 0.12 * 4 * v * (1 - v));
            else {
              // Bonk, then three bounces away.
              const u = t - td - 0.9;
              const hops = [0.7, 0.4, 0.25];
              let at = 0;
              let z = 0.03;
              for (const d of hops) {
                if (u >= at && u < at + d) {
                  const w = (u - at) / d;
                  const hgt = (d / 0.7) ** 2 * 0.3;
                  z = 0.03 + hgt * 4 * w * (1 - w);
                  if (at === 0) z = Math.max(z, 0.03) + 0.63 * (1 - w) ** 2;
                }
                at += d;
              }
              if (u >= at) z = 0.03;
              const x = Math.min(0.32, 0.3 * (u / 1.8));
              this.put(2, x, z, pocket(t, 9.4));
            }
          }
          const bonk = t - (td + 0.9);
          this.working(Math.min(t, td + 0.6), beat, live);
          if (bonk > 0) {
            if (bonk < 0.1) p.kick('head', 220, 0, 0);
            const hurt = smooth(bonk / 0.2) * smooth((3.2 - bonk) / 0.6);
            p.add(
              'head',
              14 * hurt,
              0,
              10 * Math.sin(bonk * 12) * hurt * Math.max(0, 1 - bonk * 0.5),
            );
            p.add('body', 6 * hurt);
            this.arm(1, 120 * hurt, 20 * hurt, 90 * hurt);
            this.arm2(-1, 20 * hurt, 60 * hurt, 60 * hurt);
            this.expression = bonk < 1.4 ? 'dizzy' : bonk < 3 ? 'sheepish' : 'happy';
          }
          if (bonk > 3.6 && bonk < 5.4) {
            const b = smooth((bonk - 3.6) / 0.5) * smooth((5.4 - bonk) / 0.5);
            p.add('body', 36 * b);
            this.hands(-10, 10, 0);
          }
        },
      },
      // A ball spun on a finger held high, then rolled up and balanced on her head.
      twirl: {
        weight: 1.8,
        length: [9, 9],
        face: 'focused',
        when: ok,
        pose: (t) => {
          const up = smooth((t - 0.3) / 0.6) * smooth((8.6 - t) / 0.6);
          const onFinger = smooth((t - 0.8) / 0.4) * (t < 4.6 ? 1 : 0);
          const onHead = smooth((t - 5.4) / 0.3) * (t < 8.2 ? 1 : 0) * smooth((8.4 - t) / 0.2);
          const wob = Math.sin(t * 9);
          if (t < 4.6) {
            // The right hand up high: the ball turns on its fingertip.
            this.arm(-1, 168 * up, 8 * up + 3 * wob, 0);
            this.put(0, -0.16 + 0.012 * wob, 0.69 + 0.006 * Math.cos(t * 9), onFinger);
            p.add('head', -22 * up);
          } else if (t < 5.4) {
            // Tossed to the other finger, an arc over her head.
            const v = (t - 4.6) / 0.8;
            this.arm(-1, 168 * (1 - v), 8, 0);
            this.arm(1, 168 * v, 8, 0);
            this.put(0, -0.16 + 0.32 * v, 0.69 + 0.2 * 4 * v * (1 - v), 1);
            p.add('head', -22 * (1 - v) * 0 - 18);
          } else {
            // Rolled onto her head and balanced there, arms out.
            const w = smooth((t - 5.4) / 0.5);
            this.put(0, 0.0 + 0.004 * wob, 0.7 + 0.002 * wob, 1);
            this.hands(60 * w, 60 * w, 20 * w);
            p.add('head', 0, 0, 3 * Math.sin(t * 2.4) * w);
            p.add('body', 0, 0, 4 * Math.sin(t * 2.4 + 1) * w);
            this.expression = t < 8.2 ? 'sleepy' : 'happy';
          }
          void onHead;
          this.glow = onFinger > 0.5 ? 0.6 + 0.4 * wob : 0.8;
          this.expression = t < 5.4 ? 'focused' : this.expression;
          if (t < 4.6) this.arm2(1, 20, 55, 90);
          if (t < 4.6) this.arm2(-1, 20, 55, 90);
        },
      },
      // One ball, thrown high from hand to hand.
      toss: {
        weight: 1.5,
        length: [7, 7],
        face: 'happy',
        when: ok,
        pose: (t) => {
          const a = smooth((t - 0.2) / 0.4) * smooth((6.6 - t) / 0.4);
          const c = cascade(t, 0, 1, 1.15, HAND, 0.3, 0.42);
          this.put(0, c.x, c.z, pop(t, 0.4) * pocket(t, 6.2));
          const ph = (2 * Math.PI * t) / 2.3;
          this.arm(1, 70 * a + 20 * Math.sin(ph) * a, 12 * a, 60 * a);
          this.arm(-1, 70 * a - 20 * Math.sin(ph) * a, 12 * a, 60 * a);
          this.arm2(1, 20 * a, 45 * a, 95 * a);
          this.arm2(-1, 20 * a, 45 * a, 95 * a);
          p.add('head', -14 * a * (0.5 + 0.5 * Math.sin(ph + 1.2)), 6 * Math.sin(ph) * a, 0);
        },
      },
      // Ta-da: all four arms flung out, a deep bow.
      taDa: {
        weight: 1.6,
        length: [4.5, 4.5],
        face: 'happy',
        when: ok,
        pose: (t) => {
          const k = smooth((t - 0.2) / 0.4) * smooth((4.2 - t) / 0.5);
          const bow = smooth((t - 1.6) / 0.6) * smooth((3.6 - t) / 0.6);
          this.arm(1, 20 * k, 135 * k, 10 * k);
          this.arm(-1, 20 * k, 135 * k, 10 * k);
          this.arm2(1, 25 * k, 100 * k, 5 * k);
          this.arm2(-1, 25 * k, 100 * k, 5 * k);
          p.add('body', 40 * bow);
          p.add('head', -8 * bow);
          p.add('pom', 0, 0, 14 * Math.sin(t * 8) * k);
          this.jb.hop = t < 1.4 ? 0.04 * Math.abs(sin(t, 1.4)) * k : 0;
        },
      },
    };
  }

  protected walkArms(a: number, amt: number) {
    this.arm(1, 10 * a * amt, 28 + 8 * amt, 20);
    this.arm(-1, -10 * a * amt, 28 + 8 * amt, 20);
  }

  protected stance(t: number) {
    for (const b of this.balls) {
      b.k = 0;
      b.z = REST.z;
      b.x = 0;
    }
    this.glow = 0.85;
    const w = Math.sin(2 * Math.PI * 0.2 * t);
    this.arm(1, 6 + 2 * w, 28, 22);
    this.arm(-1, 6 - 2 * w, 28, 22);
    this.arm2(1, 4 - 2 * w, 8, 14);
    this.arm2(-1, 4 + 2 * w, 8, 14);
    this.puppet.add('pom', 0, 0, 8 * Math.sin(2 * Math.PI * 0.45 * t));
  }

  protected extras(_dt: number, env: Env) {
    const p = this.puppet;
    const asleep = this.face?.expression === 'asleep';
    for (const [i, b] of this.balls.entries()) {
      const k = Math.max(0.001, b.k);
      p.stretch(`jball.${i + 1}`, k, [0, 1, 0], k);
      p.shift(`jball.${i + 1}`, b.x, b.z - REST.z, -0.03);
      this.outfit.dot(i, asleep ? 0.2 : this.glow, COLOURS[i]);
    }
    this.outfit.beacon(asleep ? '#8a8a84' : COLOURS[Math.floor(env.time * 0.7) % 5]);
  }
}
