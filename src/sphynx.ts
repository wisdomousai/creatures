import type { Object3D } from 'three';
import { adultMoods, CAT_ACT_MOODS, feels, lights, stock } from './catbreeds';
import { type Act, type Env } from './character';
import type { FaceLayout } from './face';
import { Kitty, ramp } from './kitties';
import { sin } from './moves';
import type { Anatomy } from './pet';

/**
 * Ember, the robot Sphynx: slender and hairless, all smooth shells with her wrinkle seams
 * showing (rows of grooves over the brow, rings round the neck), ears too big for her wedge
 * of a head, lemon eyes and a thin whip of a tail with a lion-tip. She has no fur to keep
 * her warm, so she is always cold and always looking for somewhere warm: she shivers, she
 * burrows into a tight ball, and she finds the warm spot in the middle of the floor and
 * basks there on her side with her tail tip glowing like an ember.
 *
 * All her own: basking (walks to the middle of the box, rolls out on her side, a long
 * contented stretch, the tip glowing orange), the shiver (a quick brrr, tail tucked, legs
 * bent) and the burrow (curls up tight, head under the tail, still shivering a little).
 * She knows the kittens' play too: she stalks, pounces, knead-purrs, tilts, watches,
 * grooms, dozes off, and peers over the front lip.
 */
export const SPHYNX_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.29, 0.46],
    [0.71, 0.46],
  ],
  rx: 0.1,
  ry: 0.27,
  line: 0.032,
  mouth: [0.5, 0.82],
  kind: 'cat',
  pupil: 0.55,
};

const SPHYNX: Anatomy = {
  tail: ['tail.1', 'tail.2', 'tail.3', 'tail.4'],
  tailAxis: [0, 0.1, -1],
  earsHang: false,
  moods: adultMoods(-4, 0.8),
  actMoods: { ...CAT_ACT_MOODS, bask: 'love', shiver: 'sad', burrow: 'sleepy' },
  lying: 'sleepy',
  hover: 'happy',
  drop: { stand: 0, sit: -0.14, lie: -0.16 },
  sit: -24,
  turn: 45,
};

export class Sphynx extends Kitty {
  protected readonly anatomy = SPHYNX;
  protected readonly build = { middle: 0.35, spring: 1.0, speed: 1.7 };
  private nextBrr = 6 + Math.random() * 10;
  private brr = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Ember',
        model: 'sphynx',
        metres: 0.92,
        width: 0.62,
        size: 0.98,
        feels: feels(4, 1, 2.2),
        face: SPHYNX_FACE,
        eyes: 0.72,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.9 },
          { bone: 'body', yaw: 0.2, pitch: 0 },
        ],
        reach: { yaw: 60, pitch: 30 },
        lag: 0.8,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 1.7,
      },
      model,
    );
    stock(
      this.acts,
      this.commonActs(),
      this.tricks(),
      {
        stalk: 0.8,
        pounce: 0.8,
        zoomies: 0.8,
        knead: 1.2,
        watch: 1,
        tilt: 1,
        wash: 0.9,
        dozeOff: 0.8,
        frontLip: 0.8,
        circle: 0.6,
        sneeze: 0.6,
        batAir: 0.6,
      },
      0.7,
    );
    Object.assign(this.acts, this.mine());
  }

  protected after(dt: number, env: Env) {
    super.after(dt, env);
    lights(this.outfit, this.expression, this.stride);
    // The odd little shiver between tricks, a quick brrr of the whole body.
    if (this.act === 'idle' || this.act === 'sit') {
      this.nextBrr -= dt;
      if (this.nextBrr < 0) {
        this.nextBrr = 8 + Math.random() * 14;
        this.brr = 0.9;
      }
    }
    if (this.brr > 0) {
      this.brr -= dt;
      const k = Math.min(1, this.brr / 0.3);
      this.puppet.add('body', 0, 2.2 * k * sin(env.time, 15), 1.4 * k * sin(env.time, 15, 0.25));
      this.puppet.add('head', 0, 2 * k * sin(env.time, 15, 0.5));
    }
    if (this.act === 'bask' && this.warm > 0.5) {
      this.outfit?.beacon('#ff9b3a');
      this.outfit?.dot(0, 1, '#ff8a2a');
    }
  }

  private warm = 0;

  private mine(): Record<string, Act> {
    const p = () => this.puppet;
    const bones = this.anatomy.tail;
    return {
      // Finds the warm spot in the middle of the box and rolls out on her side in it.
      bask: {
        weight: 1.6,
        length: [13, 13],
        when: () => this.standing,
        start: () => {
          this.posture = 'stand';
          const f = this.env.frame;
          const mid = (f.left + f.right) / 2;
          const [lo, hi] = this.span(f);
          this.run.dir = this.s < mid ? 1 : -1;
          this.walkTo(Math.min(hi - 30, Math.max(lo + 30, mid)), 0.5);
        },
        pose: (t) => {
          if (this.run.phase === 0) {
            this.warm = 0;
            this.boost = 1.1;
            if (!this.atStop && t < 6) return;
            this.run.phase = 1;
            this.run.at = t;
          }
          const w = t - this.run.at;
          const down = ramp(w, 0, 1.4) * (1 - ramp(w, 7, 8.2));
          this.warm = down;
          this.rollTarget = this.run.dir * 84 * down;
          // Legs stretched out in the warmth, the belly to the heat, a long slow stretch.
          const s = 0.5 + 0.5 * sin(w, 0.2);
          this.frontLegs(-30 * down - 18 * down * s);
          this.backLegs(24 * down + 10 * down * s);
          p().add('head', -10 * down);
          bones.forEach((b, i) => p().add(b, 0, 0, 12 * down * sin(w, 0.35, -i * 0.1)));
          this.extraLift = -0.05 * down;
          this.emote = down > 0.5 ? (w > 3 ? 'asleep' : 'love') : 'happy';
          this.pupils = 0.2;
          if (w > 8.2 && !this.run.done) {
            this.run.done = true;
            this.hop.kick(1.1);
          }
          if (w > 8.2) this.emote = 'sleepy';
          if (w > 9.6) this.endAct();
        },
      },
      // A quick brrr: legs bent, tail tucked, ears back, the whole body trembling.
      shiver: {
        weight: 1.6,
        length: [3.6, 3.6],
        when: () => this.standing,
        start: () => (this.posture = 'stand'),
        pose: (t) => {
          const k = ramp(t, 0, 0.3) * (1 - ramp(t, 3, 3.6));
          const q = sin(t, 16);
          p().add('body', 8 * k, 3 * k * q, 2 * k * sin(t, 16, 0.25));
          this.frontLegs(-8 * k);
          this.backLegs(8 * k);
          p().add('head', 12 * k, 2 * k * q);
          p().add('ear.L', -14 * k, 0, 15 * k);
          p().add('ear.R', -14 * k, 0, -15 * k);
          p().add('tail.1', -55 * k);
          bones.slice(1).forEach((b) => p().add(b, -10 * k));
          this.extraLift = -0.02 * k;
          this.emote = 'sad';
          this.pupils = 0.8;
        },
      },
      // Curls up tight with her head under her tail, still shivering a little, until it is warm.
      burrow: {
        weight: 1.3,
        length: [8, 8],
        when: () => this.still,
        start: () => (this.posture = 'lie'),
        pose: (t) => {
          const k = ramp(t, 0.3, 1.5) * (1 - ramp(t, 7, 8));
          const q = sin(t, 14) * (1 - ramp(t, 1, 4));
          p().add('head', 45 * k, 30 * k, -14 * k);
          p().add('body', 0, 12 * k + 2 * k * q, 2 * k * q);
          p().add(bones[0], 0, 100 * k, 0);
          bones.slice(1).forEach((b) => p().add(b, 0, 0, -42 * k));
          p().add('ear.L', 0, 0, -22 * k);
          p().add('ear.R', 0, 0, 22 * k);
          this.emote = t < 2.5 ? 'sad' : t < 4 ? 'sleepy' : 'asleep';
          this.pupils = 0.4;
        },
      },
    };
  }
}
