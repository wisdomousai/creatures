import type { Object3D } from 'three';
import { BEACON } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { adultMoods, CAT_ACT_MOODS, feels, lights, stock } from './catbreeds';
import { Kitty, pulse, ramp } from './kitties';
import { sin } from './moves';
import type { Anatomy } from './pet';

/**
 * Suki, the robot Siamese: a slender grown cat on long legs, a wedge of a head under ears
 * too big for it, a long neck and a long whip of a tail in five bones. Her points (the mask
 * round the screen, ears, socks and tail) are dark and her eyes are blue. She is elegant,
 * a little imperious and very vocal: she walks like she is on a catwalk (long steps, chin
 * up, the tail drawn in an S), and when she has something to say she says it at length.
 *
 * All her own: the long yowl (head back, throat shaking, the tag flashing), the catwalk,
 * and the long stretch with her rump high. She also knows the kittens' play, but she does
 * it once in a while and with dignity: she stalks, pounces, kneads, watches, tilts her
 * head, grooms a paw, dozes off and zooms about now and then.
 */
export const SIAMESE_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.3, 0.46],
    [0.7, 0.46],
  ],
  rx: 0.078,
  ry: 0.23,
  line: 0.03,
  mouth: [0.5, 0.8],
  kind: 'cat',
  pupil: 0.5,
};

const SIAMESE: Anatomy = {
  tail: ['tail.1', 'tail.2', 'tail.3', 'tail.4', 'tail.5'],
  tailAxis: [0, 0.1, -1],
  earsHang: false,
  moods: adultMoods(-6, 0.7),
  actMoods: { ...CAT_ACT_MOODS, yowl: 'annoyed', catwalk: 'happy', longStretch: 'sleepy' },
  lying: 'sleepy',
  hover: 'happy',
  drop: { stand: 0, sit: -0.15, lie: -0.17 },
  sit: -24,
  turn: 45,
};

export class Siamese extends Kitty {
  protected readonly anatomy = SIAMESE;
  protected readonly build = { middle: 0.4, spring: 1.1, speed: 1.6 };

  constructor(model: Object3D) {
    super(
      {
        name: 'Suki',
        model: 'siamese',
        metres: 0.9,
        width: 0.66,
        size: 1.08,
        feels: feels(5),
        face: SIAMESE_FACE,
        eyes: 0.74,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.9 },
          { bone: 'body', yaw: 0.2, pitch: 0 },
        ],
        reach: { yaw: 60, pitch: 30 },
        lag: 0.8,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 1.6,
      },
      model,
    );
    const all = this.tricks();
    stock(
      this.acts,
      this.commonActs(),
      all,
      {
        stalk: 1,
        pounce: 0.8,
        zoomies: 0.7,
        knead: 0.8,
        watch: 1.2,
        tilt: 1,
        wash: 1,
        dozeOff: 0.6,
        frontLip: 0.7,
        backWall: 0.7,
        circle: 0.6,
        bell: 0.6,
        sneeze: 0.5,
        batAir: 0.7,
      },
      0.7,
    );
    Object.assign(this.acts, this.mine());
  }

  protected after(dt: number, env: Env) {
    super.after(dt, env);
    lights(this.outfit, this.expression, this.stride);
  }

  private mine(): Record<string, Act> {
    const p = () => this.puppet;
    const bones = this.anatomy.tail;
    return {
      // A long, carrying yowl: head back, throat shaking, ears flat, the tag flashing.
      yowl: {
        weight: 1.6,
        length: [5.6, 5.6],
        when: () => this.still,
        start: () => (this.posture = 'sit'),
        pose: (t) => {
          const k = ramp(t, 0.2, 1) * (1 - ramp(t, 4.4, 5.4));
          const held = ramp(t, 1, 1.3) * (1 - ramp(t, 4.2, 4.5));
          p().add('head', -42 * k + 3 * sin(t, 7) * held);
          p().add('body', -6 * k);
          p().add('ear.L', -14 * k, 0, 20 * k);
          p().add('ear.R', -14 * k, 0, -20 * k);
          this.pupils = 0.4;
          this.emote = held > 0.5 ? (sin(t, 1.4) > 0 ? 'cross' : 'surprised') : 'neutral';
          this.twitch(t, 12 * held, 3);
          if (held > 0.5) this.outfit?.beacon(sin(t, 5) > 0 ? '#ffe17a' : BEACON.neutral!);
          if (t > 4.6) this.emote = 'happy';
        },
      },
      // The catwalk: long steps, chin up, the tail in an S, one slow look back.
      catwalk: {
        weight: 1.4,
        length: [8, 8],
        when: () => this.standing,
        start: () => {
          this.posture = 'stand';
          const [lo, hi] = this.span(this.env.frame);
          const w = (hi - lo) * 0.28;
          const a = clamp(this.s + this.roomy() * w, lo + 30, hi - 30);
          this.go([
            { s: a, depth: 0.2 },
            { s: clamp(a - this.roomy() * w * 1.6, lo + 30, hi - 30), depth: 0.35 },
          ]);
        },
        pose: (t) => {
          const k = ramp(t, 0, 0.6) * (1 - ramp(t, 7, 8));
          this.boost = 0.85;
          p().add('head', -14 * k, 5 * sin(t, 0.9) * k);
          p().add('body', -5 * k);
          this.extraLift = 0.014 * k;
          bones.forEach((b, i) => p().add(b, 0, 0, 18 * k * sin(t, 0.6, -i * 0.09)));
          p().add('tail.1', 14 * k);
          this.emote = 'happy';
          this.pupils = 0.35;
          if (this.atStop && t > 6) {
            p().add('head', 0, 38 * ramp(t, 6, 6.5) * (1 - ramp(t, 7, 7.6)));
            this.emote = 'sleepy';
          }
          if (t > 7.6) this.endAct();
        },
      },
      // A stretch that goes on for ever: rump high, chest low, a slow shiver at the end.
      longStretch: {
        weight: 1,
        length: [4.4, 4.4],
        when: () => this.standing,
        start: () => (this.posture = 'stand'),
        pose: (t) => {
          const k = ramp(t, 0.2, 1.1) * (1 - ramp(t, 3.4, 4.2));
          p().add('body', 22 * k);
          this.frontLegs(-52 * k);
          this.backLegs(10 * k);
          p().add('head', -22 * k);
          bones.forEach((b) => p().add(b, -8 * k));
          p().add('body', 0, 0, 2 * sin(t, 5) * pulse(t, 2.2, 1.2));
          this.emote = 'sleepy';
        },
      },
    };
  }
}
