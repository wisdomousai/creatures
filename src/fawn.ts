import type { Object3D } from 'three';
import { BEACON } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import type { Anatomy } from './pet';
import { HOOF_ACT_MOODS, Hoofed, hoofFeels, hoofMoods } from './hooves';
import { ramp } from './kitties';

/**
 * Dapple, the robot white-tailed fawn: a small tan barrel of a body on four long thin legs
 * with cloven hooves, two rows of lit white spots down each side of the back (Dot2), a smaller
 * head than Totter the foal's on a thin neck with a long pale muzzle and a dark nose, big wide
 * pink-lined ears and a short white flag of a tail that lights on its tip (Dot0).
 *
 * Her own tricks: her first wobbly steps (legs splayed and shaking, knees buckling, a few
 * steps and then she finds her feet with a start), a stiff-legged bound on all four legs at
 * once, curling up to lie with her legs folded and her head turned back on her flank, and the
 * flag: startled, she freezes, ears wide, and flicks her white tail straight up, spots
 * flashing, before bounding off. Her ears also flick about one by one.
 */
export const FAWN_FACE: FaceLayout = {
  width: 512,
  height: 340,
  eyes: [
    [0.29, 0.5],
    [0.71, 0.5],
  ],
  rx: 0.1,
  ry: 0.34,
  line: 0.035,
  mouth: null,
  pupil: 0.62,
};

const FAWN: Anatomy = {
  tail: ['tail.1', 'tail.2'],
  tailAxis: [0, -0.7, -0.7],
  earsHang: false,
  moods: hoofMoods(10),
  actMoods: {
    ...HOOF_ACT_MOODS,
    firstSteps: 'curious',
    bound: 'happy',
    curl: 'sleepy',
    flag: 'alarmed',
    earFlick: 'curious',
  },
  lying: 'calm',
  hover: 'happy',
  drop: { stand: 0, sit: -0.13, lie: -0.21 },
  sit: -14,
  turn: 50,
};

const LEGS = ['FL', 'FR', 'BL', 'BR'] as const;

export class Fawn extends Hoofed {
  static readonly terms =
    'bambi deer baby spots spotted tan brown cream white pink long legs thin hooves wobbly steps tail flag bound ears whitetail';

  protected readonly anatomy = FAWN;
  protected readonly build = { middle: 0.5, spring: 0.8, speed: 1 };
  /** The spots' brightness boost (0..1) from tricks. */
  private shine = 0;
  private side = 1;

  constructor(model: Object3D) {
    super(
      {
        name: 'Dapple',
        model: 'fawn',
        metres: 0.72,
        width: 0.5,
        size: 0.9,
        feels: hoofFeels(2, {
          head: { f: 1.8, zeta: 0.55, r: 0.3 },
          'ear.L': { f: 3.2, zeta: 0.26 },
          'ear.R': { f: 3.2, zeta: 0.26 },
        }),
        face: FAWN_FACE,
        eyes: 0.77,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.9 },
          { bone: 'body', yaw: 0.15, pitch: 0 },
        ],
        reach: { yaw: 60, pitch: 30 },
        lag: 0.6,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 1,
      },
      model,
    );
    this.fold = { front: [-100, 168], back: [-86, 156] };
    this.lieDrop = -0.21;
    this.reach = { head: 52, neck: 0, body: 20 };
    this.knee = 30;
    this.pokeAct = 'flag';
    this.adopt(
      {
        firstSteps: 1.5,
        bound: 1.4,
        curl: 1.3,
        flag: 0.9,
        earFlick: 1,
        graze: 1,
        lie: 1,
        stand: 2,
        shake: 0.6,
        toss: 0.5,
        yawn: 0.6,
        tilt: 1,
        sneeze: 0.4,
        dozeOff: 0.4,
        fallOver: 0.5,
        circle: 0.4,
        zoomies: 0.5,
        frontLip: 0.4,
        backWall: 0.4,
      },
      this.moves(),
    );
  }

  private moves(): Record<string, Act> {
    const p = () => this.puppet;
    const stand = () => this.standing;
    return {
      // First steps: legs splayed wide and trembling, knees buckling one after another, a few
      // wobbling steps, then she finds her feet with a start.
      firstSteps: {
        weight: 0,
        length: [9.5, 9.5],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.run.dir = this.roomy();
          this.run.n = 0;
          this.run.done = false;
        },
        pose: (t) => {
          const k = ramp(t, 0, 0.5) * (1 - ramp(t, 8.2, 9.4));
          const stage = ramp(t, 0.6, 3);
          const steps = ramp(t, 3, 3.6) * (1 - ramp(t, 7, 7.6));
          let drop = 0;
          LEGS.forEach((s, i) => {
            const side = s.endsWith('L') ? 1 : -1;
            const buckle = Math.max(0, Math.sin(t * (5.8 + i * 0.8) + i * 2.3)) ** 2;
            const give = (0.4 + 0.6 * steps) * buckle * k;
            p().add(`shin.${s}`, (50 * give + 7 * Math.sin(t * 19 + i * 2) * stage) * k);
            p().add(`leg.${s}`, (s.startsWith('F') ? -12 : 14) * stage * k - 10 * give);
            p().add(`leg.${s}`, 0, 0, side * 22 * stage * k * (1 - 0.6 * ramp(t, 6.8, 7.8)));
            drop += give;
          });
          this.extraLift = -0.03 * (drop / 4) * 2;
          this.rollTarget = 7 * Math.sin(t * 2.8) * stage * k * (1 - ramp(t, 7, 8));
          p().add('head', (8 + 6 * sin(t, 0.9)) * k, 14 * sin(t, 0.55) * k);
          p().add('body', 5 * stage * k);
          p().add('ear.L', 0, 0, -14 * k * sin(t, 3));
          p().add('ear.R', 0, 0, 14 * k * sin(t, 3, 0.3));
          if (t > 3.2 && t < 6.9) {
            this.boost = 0.28;
            const n = Math.floor((t - 3.2) / 1.1);
            if (n >= this.run.n && n < 4) {
              this.run.n = n + 1;
              this.walkTo(this.s + this.run.dir * this.heightPx * 0.2, this.depth);
            }
          }
          this.pupils = 0.9;
          this.emote = t < 7.2 ? 'surprised' : 'happy';
          if (t > 7.4 && !this.run.done) {
            this.run.done = true;
            this.hop.kick(1.5 * this.build.spring);
            p().kick('head', -240);
          }
          if (t > 7.4) this.shine = Math.max(this.shine, 1 - ramp(t, 7.4, 9));
        },
      },
      // A stiff-legged bound: all four legs straight and stiff, a spring off all of them at once,
      // four times, the white tail up and the ears wide.
      bound: {
        weight: 0,
        length: [5, 5],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.run.dir = this.roomy();
          this.run.n = 0;
        },
        pose: (t) => {
          const k = ramp(t, 0, 0.2) * (1 - ramp(t, 4.2, 5));
          this.kneeLift = 0;
          const phase = (t * 1.6) % 1;
          const air = Math.sin(Math.PI * Math.min(1, phase / 0.7)) * (phase < 0.7 ? 1 : 0);
          p().add('body', (-10 + 14 * air) * k);
          p().add('head', (-6 - 8 * air) * k);
          this.frontLegs(-16 * air * k, 0);
          this.backLegs(18 * air * k);
          p().add('tail.1', 55 * k);
          p().add('tail.2', 12 * k);
          p().add('ear.L', 0, 0, -18 * k);
          p().add('ear.R', 0, 0, 18 * k);
          const n = Math.floor(t * 1.6);
          if (t < 4.2 && n >= this.run.n) {
            this.run.n = n + 1;
            this.hop.kick(1.5 * this.build.spring);
            this.boost = 3;
            this.walkTo(this.s + this.run.dir * this.heightPx * 0.55, this.depth);
          }
          this.shine = 0.7 * k;
          this.emote = 'happy';
          this.pupils = 1;
        },
      },
      // Curls up to lie: legs folded under her, head turned back along her flank, ears down,
      // the white tail tucked round; then gets up.
      curl: {
        weight: 0,
        length: [9, 9],
        when: () => this.posture !== 'lie' && this.still,
        start: () => {
          this.posture = 'lie';
          this.side = Math.random() < 0.5 ? 1 : -1;
        },
        pose: (t) => {
          const k = ramp(t, 1.4, 3) * (1 - ramp(t, 7.6, 8.4));
          p().add('head', 30 * k, 62 * this.side * k, 10 * this.side * k);
          p().add('ear.L', 0, 0, 26 * k);
          p().add('ear.R', 0, 0, -26 * k);
          p().add('tail.1', -50 * k, -50 * this.side * k);
          p().add('tail.2', 0, -50 * this.side * k);
          this.emote = t > 3.4 && t < 7.4 ? 'sleepy' : null;
          this.shine = 0;
          if (t > 8.5 && this.posture === 'lie') {
            this.posture = 'stand';
            this.hop.kick(0.5 * this.build.spring);
          }
        },
      },
      // The flag: she freezes stiff-legged, ears wide, flicks the white tail straight up and
      // the spots flare, and then bounds off a few steps.
      flag: {
        weight: 0,
        length: [3.4, 3.4],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.run.dir = this.roomy();
          this.run.n = 0;
          this.run.done = false;
        },
        pose: (t) => {
          const k = ramp(t, 0, 0.08) * (1 - ramp(t, 2.9, 3.4));
          this.kneeLift = 0;
          p().add('head', -14 * k);
          p().add('body', -5 * k);
          this.frontLegs(8 * k);
          this.backLegs(-6 * k);
          p().add('ear.L', 0, 0, -22 * k);
          p().add('ear.R', 0, 0, 22 * k);
          const flick = ramp(t, 0.05, 0.18);
          p().add('tail.1', (74 * flick + 6 * Math.sin(t * 22)) * k);
          p().add('tail.2', 24 * flick * k);
          if (t > 0.05 && !this.run.done) {
            this.run.done = true;
            this.hop.kick(1.1 * this.build.spring);
          }
          this.shine = k * (0.7 + 0.3 * Math.sin(t * 24));
          this.pupils = 1;
          this.emote = 'surprised';
          // Off in two stiff bounds.
          if (t > 1.1 && t < 2.2) {
            const n = Math.floor((t - 1.1) / 0.5);
            if (n >= this.run.n) {
              this.run.n = n + 1;
              this.hop.kick(1.4 * this.build.spring);
              this.boost = 3;
              this.walkTo(this.s + this.run.dir * this.heightPx * 0.5, this.depth);
            }
          }
        },
      },
      // Her big ears flick about on their own, one then the other, listening.
      earFlick: {
        weight: 0,
        length: [4, 4],
        when: stand,
        pose: (t) => {
          const k = ramp(t, 0, 0.3) * (1 - ramp(t, 3.4, 4));
          const a = Math.max(0, sin(t, 1.1)) ** 2;
          const b = Math.max(0, sin(t, 0.8, 0.4)) ** 2;
          p().add('ear.L', 10 * k * a, 22 * k * a, -26 * k * a);
          p().add('ear.R', 10 * k * b, -22 * k * b, 26 * k * b);
          p().add('head', 3 * k, 12 * sin(t, 0.25) * k, 6 * k * (a - b));
          this.shine = 0.3 * k;
        },
      },
    };
  }

  protected idle(t: number) {
    this.shine = 0;
    super.idle(t);
  }

  protected after(dt: number, env: Env) {
    super.after(dt, env);
    const o = this.outfit;
    if (!o) return;
    const asleep = this.mood === 'asleep' || this.posture === 'lie';
    // The spots glow slowly, a ripple running down the back; flared by her tricks.
    const wave = 0.42 + 0.18 * Math.sin(env.time * 1.3);
    const glad = this.mood === 'happy' || this.mood === 'love' ? 0.2 : 0;
    o.dot(
      2,
      clamp((asleep ? 0.1 : wave) + 0.6 * this.shine + glad + (this.hovered ? 0.15 : 0), 0, 1),
    );
    o.beacon(BEACON[this.expression] ?? '#f4f4f1');
  }
}
