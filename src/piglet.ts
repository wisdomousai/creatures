import type { Object3D } from 'three';
import { BEACON } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import type { Anatomy } from './pet';
import { HOOF_ACT_MOODS, Hoofed, hoofFeels, hoofMoods } from './hooves';
import { ramp } from './kitties';

/**
 * Truffle, the robot piglet: round and pink on stubby legs, a snout disc with two lit nostrils
 * (Dot2, Dot3), floppy ears and a tail that is a coil spring. She roots at the floor with her
 * snout (the nostrils glow as she sniffs), flops over and rolls on her back, and does zoomies
 * with her tail spinning like a propeller. A lamp on her tummy (Dot4) shows when she is upside
 * down.
 */
export const PIGLET_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.29, 0.5],
    [0.71, 0.5],
  ],
  rx: 0.075,
  ry: 0.22,
  line: 0.04,
  mouth: null,
};

const PIGLET: Anatomy = {
  tail: ['tail.1', 'tail.2', 'tail.3'],
  tailAxis: [0, -0.7, -0.7],
  earsHang: true,
  moods: hoofMoods(7),
  actMoods: { ...HOOF_ACT_MOODS, root: 'curious', flop: 'happy', spin: 'happy' },
  lying: 'happy',
  hover: 'happy',
  drop: { stand: 0, sit: -0.05, lie: -0.08 },
  sit: -14,
  turn: 55,
};

export class Piglet extends Hoofed {
  protected readonly anatomy = PIGLET;
  protected readonly build = { middle: 0.25, spring: 0.9, speed: 1.1 };
  /** How hard she is sniffing, 0..1 (the nostrils glow), and the tummy lamp. */
  private sniff = 0;
  private belly = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Truffle',
        model: 'piglet',
        metres: 0.45,
        width: 0.5,
        size: 0.9,
        feels: hoofFeels(3, { 'ear.L': { f: 2.6, zeta: 0.25 }, 'ear.R': { f: 2.6, zeta: 0.25 } }),
        face: PIGLET_FACE,
        eyes: 0.74,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.9 },
          { bone: 'body', yaw: 0.15, pitch: 0 },
        ],
        reach: { yaw: 60, pitch: 30 },
        lag: 0.5,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 1.1,
      },
      model,
    );
    this.fold = { front: [-70, 150], back: [-65, 135] };
    this.lieDrop = -0.08;
    this.reach = { head: 62, neck: 0, body: 12 };
    this.knee = 32;
    this.pokeAct = 'root';
    this.adopt(
      {
        root: 1.8,
        flop: 1.2,
        pigZoom: 1.2,
        stand: 2,
        graze: 0.5,
        lie: 1,
        shake: 1,
        stamp: 0.5,
        toss: 0.5,
        yawn: 0.6,
        tilt: 1,
        sneeze: 0.7,
        dozeOff: 0.6,
        fallOver: 0.4,
        circle: 0.6,
        frontLip: 0.4,
        backWall: 0.4,
      },
      this.moves(),
    );
  }

  private moves(): Record<string, Act> {
    const p = () => this.puppet;
    return {
      // Roots at the floor: head down, snout working, the whole front end bobbing, tail curling.
      root: {
        weight: 0,
        length: [4.6, 4.6],
        when: () => !this.walking && this.posture === 'stand',
        pose: (t) => {
          const k = ramp(t, 0, 0.5) * (1 - ramp(t, 4.0, 4.6));
          const w = 0.5 + 0.5 * sin(t, 5);
          this.sniff = k * (0.4 + 0.6 * w);
          p().add('head', 44 * k + 8 * k * sin(t, 5), 12 * k * sin(t, 1.3));
          p().add('body', 8 * k + 2 * k * sin(t, 5));
          p().add('leg.FL', -6 * k * w);
          p().add('leg.FR', -6 * k * (1 - w));
          p().add('tail.1', 0, 22 * k * sin(t, 4));
          p().add('ear.L', 0, 0, 16 * k * w);
          p().add('ear.R', 0, 0, -16 * k * w);
          this.emote = 'focused';
          this.pupils = 0.9;
        },
      },
      // A flop: down on her side, over onto her back, legs paddling, then back onto her feet.
      flop: {
        weight: 0,
        length: [5.4, 5.4],
        when: () => !this.walking && this.posture === 'stand',
        start: () => {
          this.run.dir = Math.random() < 0.5 ? -1 : 1;
          this.hop.kick(0.7);
        },
        pose: (t) => {
          const d = this.run.dir;
          const over = ramp(t, 0.2, 1.1) * (1 - ramp(t, 4.3, 5.1));
          this.rollTarget = d * 175 * over;
          this.belly = clamp((over - 0.7) / 0.3, 0, 1);
          const paddle = over > 0.9 ? 1 : 0;
          p().add('leg.FL', -50 * paddle * sin(t, 3.4));
          p().add('leg.FR', 50 * paddle * sin(t, 3.4, 0.25));
          p().add('leg.BL', -45 * paddle * sin(t, 3.4, 0.5));
          p().add('leg.BR', 45 * paddle * sin(t, 3.4, 0.75));
          p().add('head', -8 * over);
          p().add('tail.1', 0, 25 * sin(t, 4) * over);
          this.emote = 'happy';
          this.pupils = 1;
        },
      },
      // Zoomies: dashes about, her coil of a tail spinning like a propeller.
      pigZoom: {
        weight: 0,
        length: [4.5, 4.5],
        when: () => this.standing,
        start: () => {
          this.run.n = 0;
        },
        pose: (t) => {
          const k = ramp(t, 0, 0.3) * (1 - ramp(t, 4.0, 4.5));
          this.boost = 1.4 * k;
          if (this.atStop && t < 3.6)
            this.walkTo(this.s + this.roomy() * this.heightPx * 1.2, Math.random());
          const r = Math.sin(t * 40) * k;
          p().add('tail.1', 0, 38 * r);
          p().add('tail.2', 0, 38 * Math.cos(t * 40) * k);
          p().add('tail.3', 0, 30 * r);
          p().add('ear.L', 0, 0, -26 * k);
          p().add('ear.R', 0, 0, 26 * k);
          p().add('head', -6 * k);
          this.emote = 'happy';
          this.pupils = 1;
        },
      },
    };
  }

  protected idle(t: number) {
    this.sniff = 0;
    this.belly = 0;
    super.idle(t);
  }

  protected after(dt: number, env: Env) {
    super.after(dt, env);
    const o = this.outfit;
    if (!o) return;
    const asleep = this.mood === 'asleep' || this.posture === 'lie';
    const base = asleep ? 0.12 : 0.3 + 0.1 * Math.sin(env.time * 2.2);
    o.dot(2, clamp(base + this.sniff, 0, 1));
    o.dot(3, clamp(base + this.sniff * (0.6 + 0.4 * Math.sin(env.time * 11)), 0, 1));
    o.dot(4, clamp(0.15 + 0.85 * this.belly, 0, 1));
    o.beacon(BEACON[this.expression] ?? '#f4f4f1');
  }
}
