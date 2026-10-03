import type { Object3D } from 'three';
import { BEACON } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import type { Anatomy } from './pet';
import { HOOF_ACT_MOODS, Hoofed, hoofFeels, hoofMoods } from './hooves';
import { ramp } from './kitties';

/**
 * Totter, the robot foal: a newborn on stilts. A small barrel of a body on four very long thin
 * legs, a big head with huge eyes on a short neck, big ears, a short fuzzy mane of small plates
 * and a brush of a tail. A little star on her forehead (Dot2) twinkles and flares when she is
 * happy. Everything about her is a bit too much leg: she takes her first wobbly steps (knees
 * buckling, legs splaying, and then finding her feet with a start), gallops a small circle for
 * pure joy, folds her long legs up in stages to lie down, and skips sideways at nothing.
 */
export const FOAL_FACE: FaceLayout = {
  width: 512,
  height: 340,
  eyes: [
    [0.29, 0.5],
    [0.71, 0.5],
  ],
  rx: 0.105,
  ry: 0.36,
  line: 0.035,
  mouth: null,
  pupil: 0.62,
};

const FOAL: Anatomy = {
  tail: ['tail.1', 'tail.2', 'tail.3'],
  tailAxis: [0, -0.7, -0.7],
  earsHang: false,
  moods: hoofMoods(8),
  actMoods: {
    ...HOOF_ACT_MOODS,
    wobble: 'curious',
    gallop: 'happy',
    skip: 'alarmed',
    nuzzle: 'love',
    kick: 'happy',
  },
  lying: 'calm',
  hover: 'happy',
  drop: { stand: 0, sit: -0.18, lie: -0.3 },
  sit: -14,
  turn: 50,
};

const LEGS = ['FL', 'FR', 'BL', 'BR'] as const;

export class Foal extends Hoofed {
  protected readonly anatomy = FOAL;
  protected readonly build = { middle: 0.5, spring: 0.8, speed: 1 };
  /** The star's brightness boost (0..1) from tricks. */
  private shine = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Totter',
        model: 'foal',
        metres: 0.98,
        width: 0.6,
        size: 1.15,
        feels: hoofFeels(3, {
          head: { f: 1.7, zeta: 0.55, r: 0.3 },
          'ear.L': { f: 2.8, zeta: 0.28 },
          'ear.R': { f: 2.8, zeta: 0.28 },
        }),
        face: FOAL_FACE,
        eyes: 0.78,
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
    this.lieDrop = -0.3;
    this.reach = { head: 52, neck: 0, body: 20 };
    this.knee = 34;
    this.pokeAct = 'skip';
    this.adopt(
      {
        wobble: 1.6,
        gallop: 1.4,
        skip: 0.9,
        kick: 0.8,
        nuzzle: 0.7,
        graze: 1,
        lie: 1.4,
        stand: 2,
        shake: 0.6,
        toss: 0.6,
        yawn: 0.6,
        tilt: 1,
        sneeze: 0.4,
        dozeOff: 0.4,
        fallOver: 0.6,
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
      // First steps: legs splayed and trembling, knees buckling one after another, a few
      // wobbling steps, then she finds her feet with a start.
      wobble: {
        weight: 0,
        length: [9.5, 9.5],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.run.dir = this.roomy();
          this.run.n = 0;
        },
        pose: (t) => {
          const k = ramp(t, 0, 0.5) * (1 - ramp(t, 8.2, 9.4));
          const stage = ramp(t, 0.6, 3);
          const steps = ramp(t, 3, 3.6) * (1 - ramp(t, 7, 7.6));
          // The legs shake and splay; each knee goes at its own time.
          let drop = 0;
          LEGS.forEach((s, i) => {
            const side = s.endsWith('L') ? 1 : -1;
            const buckle = Math.max(0, Math.sin(t * (5.2 + i * 0.9) + i * 1.9)) ** 2;
            const give = (0.4 + 0.6 * steps) * buckle * k;
            p().add(`shin.${s}`, (46 * give + 6 * Math.sin(t * 17 + i * 2) * stage) * k);
            p().add(`leg.${s}`, (s.startsWith('F') ? -14 : 12) * stage * k - 9 * give);
            p().add(`leg.${s}`, 0, 0, side * 16 * stage * k * (1 - 0.6 * ramp(t, 6.8, 7.8)));
            drop += give;
          });
          this.extraLift = -0.045 * (drop / 4) * 2;
          // A wobbling body: tipping side to side, the head bobbing for balance.
          this.rollTarget = 6 * Math.sin(t * 2.6) * stage * k * (1 - ramp(t, 7, 8));
          p().add('head', (8 + 6 * sin(t, 0.9)) * k, 12 * sin(t, 0.55) * k);
          p().add('body', 5 * stage * k);
          p().add('ear.L', 0, 0, -12 * k * sin(t, 3));
          p().add('ear.R', 0, 0, 12 * k * sin(t, 3, 0.3));
          // The first few steps: a short walk, very slowly.
          if (t > 3.2 && t < 6.9) {
            this.boost = 0.28;
            const n = Math.floor((t - 3.2) / 1.1);
            if (n >= this.run.n && n < 4) {
              this.run.n = n + 1;
              this.walkTo(this.s + this.run.dir * this.heightPx * 0.22, this.depth);
            }
          }
          this.pupils = 0.9;
          this.emote = t < 7.2 ? 'surprised' : 'happy';
          // Finds her feet: a start, a hop, legs straight.
          if (t > 7.4 && !this.run.done) {
            this.run.done = true;
            this.hop.kick(1.6 * this.build.spring);
            p().kick('head', -260);
          }
          if (t > 7.4) this.shine = Math.max(this.shine, 1 - ramp(t, 7.4, 9));
        },
      },
      // A sudden happy gallop round a small circle: bounding, all four legs together.
      gallop: {
        weight: 0,
        length: [6, 6],
        when: stand,
        start: () => {
          this.posture = 'stand';
          const r = this.heightPx * 0.9;
          const [lo, hi] = this.span(this.env.frame);
          const c = clamp(this.s + this.roomy() * r, lo + r, hi - r);
          this.run.n = 0;
          this.go([
            { s: c - r, depth: 0.5 },
            { s: c, depth: 0.85 },
            { s: c + r, depth: 0.5 },
            { s: c, depth: 0.1 },
            { s: c - r, depth: 0.5 },
          ]);
        },
        pose: (t) => {
          this.boost = 2.3;
          this.emote = 'happy';
          this.pupils = 1;
          this.kneeLift = 60;
          this.shine = 0.8;
          const stride = this.walking ? Math.sin(this.gait * 2) : 0;
          // Bounding: the front legs reach out, the back legs push, the body rocks.
          p().add('body', -8 * stride);
          p().add('head', -10 * stride + 4);
          this.frontLegs(-20 * stride);
          this.backLegs(20 * stride);
          p().add('tail.1', -22);
          p().add('ear.L', 0, 0, -10);
          p().add('ear.R', 0, 0, 10);
          if (this.walking) {
            const n = Math.floor(this.gait / Math.PI);
            if (n !== this.run.n) {
              this.run.n = n;
              this.hop.kick(0.7 * this.build.spring);
            }
          }
          if (this.atStop && t > 0.5) this.endAct();
        },
      },
      // Startled by nothing: a stiff-legged skip sideways, ears out, tail up.
      skip: {
        weight: 0,
        length: [2.6, 2.6],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.run.dir = Math.random() < 0.5 ? -1 : 1;
          this.run.n = 0;
        },
        pose: (t) => {
          const k = ramp(t, 0, 0.1) * (1 - ramp(t, 2.0, 2.6));
          p().add('root', 0, -this.heading.y * k + this.run.dir * 40 * k);
          p().add('body', -12 * k);
          p().add('head', -10 * k);
          this.frontLegs(10 * k);
          this.backLegs(-8 * k);
          p().add('ear.L', 0, 0, -20 * k);
          p().add('ear.R', 0, 0, 20 * k);
          p().add('tail.1', -30 * k);
          this.pupils = 1;
          this.shine = k;
          if (t > 0.05 && t < 1.2) {
            const n = Math.floor(t / 0.4);
            if (n >= this.run.n) {
              this.run.n = n + 1;
              this.hop.kick(1.5 * this.build.spring);
              this.boost = 3;
              this.walkTo(this.s + this.run.dir * this.heightPx * 0.4, this.depth);
            }
          }
        },
      },
      // Kicks up her heels: a wobbly little buck, front end low.
      kick: {
        weight: 0,
        length: [3, 3],
        when: stand,
        start: () => (this.run.n = 0),
        pose: (t) => {
          const k = ramp(t, 0, 0.3) * (1 - ramp(t, 2.4, 3));
          const up = Math.max(0, sin(t, 1.3, -0.1)) ** 0.8;
          p().add('body', (18 + 6 * up) * k);
          p().add('head', (4 - 10 * up) * k);
          for (const s of ['BL', 'BR']) {
            p().add(`leg.${s}`, 66 * up * k);
            p().add(`shin.${s}`, 24 * up * k);
          }
          this.frontLegs(-18 * k);
          p().add('tail.1', -24 * up * k);
          const n = Math.floor(t * 1.3 + 0.1);
          if (t < 2.4 && n >= this.run.n + 1) {
            this.run.n = n;
            this.hop.kick(1.2 * this.build.spring);
          }
          this.emote = 'happy';
          this.shine = k;
        },
      },
      // Pushes her big head into something, ears forward, a little tail wag.
      nuzzle: {
        weight: 0,
        length: [3.4, 3.4],
        when: stand,
        pose: (t) => {
          const k = ramp(t, 0, 0.5) * (1 - ramp(t, 2.9, 3.4));
          p().add('head', (10 + 6 * sin(t, 1.4)) * k, 18 * sin(t, 0.7) * k, 6 * k * sin(t, 0.7));
          p().add('body', 6 * k);
          p().add('tail.1', 0, 25 * k * sin(t, 4));
          p().add('ear.L', -10 * k, 0, 0);
          p().add('ear.R', -10 * k, 0, 0);
          this.shine = 0.6 * k;
          this.emote = 'love';
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
    const twinkle = 0.4 + 0.3 * Math.max(0, Math.sin(env.time * 1.9)) ** 4;
    o.dot(2, clamp((asleep ? 0.1 : twinkle) + 0.6 * this.shine + (this.hovered ? 0.2 : 0), 0, 1));
    o.beacon(BEACON[this.expression] ?? '#f4f4f1');
  }
}
