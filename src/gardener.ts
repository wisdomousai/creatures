import type { Object3D } from 'three';
import type { Act, Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import { smooth } from './toybot';
import { Jobbot } from './jobbot';

/**
 * Dibble, a little gardening robot: the head is a watering can (a round tin can with the
 * screen face on its front, a spout going up and out to one side and ending in a lit rose,
 * a handle arching over the top), on a dungaree body with a seed packet in the pocket, a
 * trowel in one hand, a glove on the other and tall wellington boots.
 *
 * Tricks: she tips her head to water a seedling (lit drops fall from the rose, and it
 * grows a glowing bud), digs a hole with the trowel and plants it, pats the soil down, wipes
 * her brow, sniffs a flower (spout and all), a shower of drops from the rose, stretching
 * her back; and the shared ones (stroll, wave, cheer, shrug, look about, pirouette, jig,
 * bow).
 */
export const GARDENER_FACE: FaceLayout = {
  width: 512,
  height: 334,
  eyes: [
    [0.3, 0.45],
    [0.7, 0.45],
  ],
  rx: 0.085,
  ry: 0.22,
  line: 0.034,
  mouth: [0.5, 0.76],
};

const WATER = '#9fe3ff';
const BUD = '#ffd35c';
const WARM = '#fff4d6';
/** Rose tip, relative to the head's pivot (metres): x out, z up. */
const TIP = { x: 0.298, z: 0.235, pivot: 0.42 };
const SPOT = { x: 0.3, drop: 0.19 };

export class Gardener extends Jobbot {
  private fx = {
    sprout: 0, // growth 0..1
    bud: 0, // how brightly the bud glows
    flower: 0,
    hole: 0,
    soil: 0,
    rain: 0, // drops falling, 0..1
    shower: 0, // 0..1: drops thrown outward instead of straight down
  };
  private rainT = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Dibble',
        model: 'gardener',
        metres: 0.68,
        width: 0.5,
        size: 0.9,
        feels: {
          default: { f: 2.4, zeta: 0.5 },
          root: { f: 2.4, zeta: 0.7 },
          body: { f: 2.2, zeta: 0.5 },
          head: { f: 2, zeta: 0.4, r: 0.4 },
          'upper_arm.L': { f: 2.8, zeta: 0.45 },
          'upper_arm.R': { f: 2.8, zeta: 0.45 },
          'forearm.L': { f: 3.2, zeta: 0.4 },
          'forearm.R': { f: 3.2, zeta: 0.4 },
          'leg.L': { f: 3, zeta: 0.5 },
          'leg.R': { f: 3, zeta: 0.5 },
        },
        face: GARDENER_FACE,
        eyes: 0.78,
        gaze: [
          { bone: 'head', yaw: 0.7, pitch: 0.6 },
          { bone: 'body', yaw: 0.2, pitch: 0.1 },
        ],
        reach: { yaw: 50, pitch: 26 },
        lag: 1.2,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [60, 130],
        speed: 0.75,
      },
      model,
    );
    this.acts = { ...this.common(), ...this.moves() };
  }

  private moves(): Record<string, Act> {
    const p = this.puppet;
    const ok = () => this.free_;
    const tilt = (k: number) => {
      p.add('head', 0, 0, -72 * k);
      p.add('body', 6 * k, 0, 0);
    };
    return {
      // Tips her head over the seedling; it grows a lit bud.
      water: {
        weight: 2.2,
        length: [13, 13],
        face: 'happy',
        when: ok,
        pose: (t) => {
          const k = smooth((t - 0.3) / 1.1) * smooth((7.3 - t) / 1.0);
          tilt(k);
          this.hands(25 * k, 25 * k, 40 * k);
          this.fx.rain = smooth((t - 1.2) / 0.3) * smooth((6.6 - t) / 0.3);
          this.fx.shower = 0;
          this.fx.sprout = smooth((t - 1.6) / 4.2) * smooth((12.9 - t) / 0.5) * (t > 12.2 ? 1 : 1);
          this.fx.bud = smooth((t - 5.2) / 1.0) * smooth((12.9 - t) / 0.4);
          if (t > 7.6 && t < 12) {
            const b = Math.abs(sin(t, 1.4));
            this.hands(90 * (t < 9.5 ? 0.5 : 1), 25, 60);
            this.jb.hop = 0.012 * b;
            p.add('head', -6, 0, 6 * sin(t, 0.9));
            this.expression = 'love';
          }
          if (t > 11.6) this.hands(0, 20, 0);
        },
      },
      // Digs a hole with the trowel, sets the seedling in, pats the soil round it.
      plant: {
        weight: 2.2,
        length: [15, 15],
        face: 'focused',
        when: ok,
        pose: (t) => {
          const lean = smooth((t - 0.3) / 0.7) * smooth((12 - t) / 0.7);
          p.add('body', 48 * lean, 14 * lean, 0);
          p.add('head', 10 * lean);
          const dig = t > 1 && t < 5.2 ? 1 : 0;
          const scoop = Math.sin(t * 6);
          if (dig) this.arm(1, 85 + 26 * scoop, 28, 16 - 12 * scoop);
          else this.arm(1, 70, 24, 30);
          this.arm(-1, 20 * lean, 20, 20);
          this.fx.hole = smooth((t - 1) / 1.2) * smooth((9.6 - t) / 0.6);
          this.fx.soil = smooth((t - 1.4) / 3.4) * smooth((8.6 - t) / 1.0);
          const plantedAt = 5.8;
          this.fx.sprout = smooth((t - plantedAt) / 1.0) * 0.35 + smooth((t - 9.6) / 2.4) * 0.65;
          if (t > 13.9) this.fx.sprout = 0;
          else if (t > 13) this.fx.sprout *= smooth((13.9 - t) / 0.9);
          this.fx.bud = smooth((t - 10.6) / 1.2) * smooth((13.9 - t) / 0.5);
          // Pats the soil: the trowel taps down.
          if (t > 7.6 && t < 9.6) this.arm(1, 88 + 12 * Math.max(0, Math.sin(t * 8)), 28, 12);
          if (t > 9.6) {
            this.expression = 'happy';
            this.jb.hop = t > 11.6 && t < 13 ? 0.02 * Math.abs(sin(t, 1.6)) : 0;
            if (t > 11) this.hands(0, 20, 0);
          }
        },
      },
      brow: {
        weight: 1.2,
        length: [4.5, 4.5],
        when: ok,
        pose: (t) => {
          const k = smooth((t - 0.2) / 0.5) * smooth((4.2 - t) / 0.5);
          const w = Math.sin(t * 7);
          this.arm(-1, 128 * k, 30 * k + 10 * w * k, 105 * k);
          p.add('head', 0, 0, 7 * k);
          p.add('body', -4 * k);
          this.expression = t > 0.5 && t < 3.6 ? 'sleepy' : 'sheepish';
          if (t > 3.6) this.expression = 'happy';
        },
      },
      sniff: {
        weight: 1.6,
        length: [8, 8],
        when: ok,
        pose: (t) => {
          this.fx.flower = smooth((t - 0.2) / 1.0) * smooth((7.8 - t) / 0.5);
          const lean = smooth((t - 1.2) / 0.8) * smooth((6.8 - t) / 0.8);
          p.add('body', 44 * lean, -14 * lean, 0);
          p.add('head', 14 * lean + 6 * lean * Math.max(0, Math.sin(t * 7)), 0, 0);
          this.hands(40 * lean, 20, 40 * lean);
          this.expression = lean > 0.5 ? 'love' : t < 1.2 ? 'surprised' : 'happy';
          if (this.face) this.face.talk = 0;
        },
      },
      // A shower from the rose, thrown out in arcs as she rocks her head about.
      shower: {
        weight: 1.3,
        length: [6, 6],
        face: 'happy',
        when: ok,
        pose: (t) => {
          const k = smooth((t - 0.2) / 0.5) * smooth((5.8 - t) / 0.5);
          p.add('head', 0, 0, -26 * k + 14 * k * Math.sin(t * 3));
          this.fx.shower = 1;
          this.fx.rain = k > 0.4 ? k : 0;
          this.hands(30 * k, 70 * k + 20 * k * Math.sin(t * 3), 20);
          this.jb.hop = 0.01 * Math.abs(sin(t, 1.5)) * k;
        },
      },
      stretchBack: {
        weight: 0.9,
        length: [5, 5],
        when: ok,
        pose: (t) => {
          const k = smooth((t - 0.3) / 0.6) * smooth((4.6 - t) / 0.6);
          p.add('body', -16 * k);
          p.add('head', -14 * k);
          this.arm(1, -30 * k, 30 * k, 80 * k);
          this.arm(-1, -30 * k, 30 * k, 80 * k);
          this.expression = k > 0.5 ? 'sleepy' : 'neutral';
          if (t > 4.3) this.expression = 'happy';
        },
      },
    };
  }

  protected onDirect() {
    this.fx.rain = 0;
  }

  protected stance(t: number) {
    Object.assign(this.fx, {
      sprout: 0,
      bud: 0,
      flower: 0,
      hole: 0,
      soil: 0,
      rain: 0,
      shower: 0,
    });
    const w = Math.sin(2 * Math.PI * 0.22 * t);
    this.arm(1, 4 + 2 * w, 12, 10);
    this.arm(-1, 3 - 2 * w, 12, 8);
    this.puppet.add('head', 0, 0, 1.5 * Math.sin(2 * Math.PI * 0.11 * t));
  }

  protected extras(dt: number, env: Env) {
    const p = this.puppet;
    const f = this.fx;
    const tiny = (k: number) => Math.max(0.001, k);
    // The seedling grows up faster than it grows out; the bud shines.
    p.stretch('sprout', tiny(f.sprout), [0, 1, 0], tiny(Math.pow(f.sprout, 0.7)));
    p.stretch('flower', tiny(f.flower), [0, 1, 0], tiny(f.flower));
    p.stretch('hole', tiny(f.hole), [0, 1, 0], tiny(f.hole));
    p.stretch('soil', tiny(f.soil), [0, 1, 0], tiny(f.soil));
    // The drops: three, falling one after another from wherever the rose is now.
    this.rainT += dt * (f.rain > 0.01 ? 1 : 0);
    const roll = (p.current('head')[2] * Math.PI) / 180;
    const tx = TIP.x * Math.cos(roll) - TIP.z * Math.sin(roll);
    const tz = TIP.pivot + TIP.x * Math.sin(roll) + TIP.z * Math.cos(roll);
    for (const i of [1, 2, 3]) {
      const ph = (this.rainT * 1.7 + i / 3) % 1;
      const size = f.rain > 0.01 ? f.rain * Math.sin(Math.PI * Math.min(1, ph * 1.2)) : 0;
      p.stretch(`rain.${i}`, tiny(size), [0, 1, 0], tiny(size));
      let dx = tx - SPOT.x;
      let dz = tz - SPOT.drop;
      if (f.shower > 0.5) {
        const v = 0.18 + 0.09 * i;
        dx += v * ph * (1 + (i === 2 ? 0.4 : 0));
        dz += 0.14 * ph - 0.55 * ph * ph;
      } else dz -= Math.min(tz - 0.02, 0.17) * ph * ph;
      p.shift(`rain.${i}`, dx, dz, 0);
    }
    const mood = this.face?.expression ?? 'neutral';
    this.outfit.beacon(mood === 'asleep' ? '#8a8a84' : f.rain > 0.3 ? WATER : WARM);
    this.outfit.dot(2, 0.15 + 0.85 * Math.max(f.bud, f.flower * 0.8), BUD);
    this.outfit.dot(3, 0.9, WATER);
    void env;
  }
}
