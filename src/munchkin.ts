import type { Object3D } from 'three';
import { type Act, clamp } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import type { Anatomy } from './pet';
import { KITTEN_ACT_MOODS, kittenMoods, pulse, ramp } from './kitties';
import { Moggy } from './moggy';

/**
 * Nub, the robot Munchkin kitten: small and young, a big round head on a normal little body
 * that lives very close to the floor on very short legs. She scampers about low and fast on
 * her stubby legs, and her signature is sitting up on her haunches like a meerkat, front
 * paws tucked up and head swivelling to look about. She also hops hopefully at things far
 * too high for her, pounces, stalks and tumbles like the other kittens (she is on their
 * trick library), and dozes off mid-scamper.
 */
export const MUNCHKIN_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.29, 0.5],
    [0.71, 0.5],
  ],
  rx: 0.108,
  ry: 0.3,
  line: 0.03,
  mouth: [0.5, 0.82],
  kind: 'cat',
  pupil: 0.6,
};

const MUNCHKIN: Anatomy = {
  tail: ['tail.1', 'tail.2', 'tail.3'],
  tailAxis: [0, 0.4, -0.9],
  earsHang: false,
  moods: kittenMoods(),
  actMoods: {
    ...KITTEN_ACT_MOODS,
    meerkat: 'curious',
    scamper: 'happy',
    tinyHops: 'curious',
  },
  lying: 'sleepy',
  hover: 'happy',
  drop: { stand: 0, sit: -0.07, lie: -0.07 },
  sit: -22,
  turn: 40,
};

export class Munchkin extends Moggy {
  static readonly terms =
    'kitty baby young small tiny short legs low stubby white cream peach orange teal mint green eyes big round head meerkat scamper';

  protected readonly anatomy = MUNCHKIN;
  protected readonly build = { middle: 0.15, spring: 1.1, speed: 2.1 };

  constructor(model: Object3D) {
    super(
      {
        name: 'Nub',
        model: 'munchkin',
        metres: 0.44,
        width: 0.56,
        size: 0.72,
        feels: {
          default: { f: 2.6, zeta: 0.5 },
          root: { f: 3, zeta: 0.55 },
          body: { f: 2.4, zeta: 0.6 },
          head: { f: 2.2, zeta: 0.5, r: 0.3 },
          'ear.L': { f: 5, zeta: 0.3 },
          'ear.R': { f: 5, zeta: 0.3 },
          'tail.1': { f: 2, zeta: 0.4 },
          'tail.2': { f: 2.4, zeta: 0.35 },
          'tail.3': { f: 2.8, zeta: 0.3 },
        },
        face: MUNCHKIN_FACE,
        eyes: 0.62,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.9 },
          { bone: 'body', yaw: 0.2, pitch: 0 },
        ],
        reach: { yaw: 60, pitch: 30 },
        lag: 0.9,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 2.1,
      },
      model,
    );
    this.adopt(
      {
        pounce: 1.2,
        stalk: 1,
        zoomies: 1,
        puffCrab: 0.6,
        mew: 1,
        dozeOff: 0.9,
        fallOver: 0.8,
        watch: 1,
        tilt: 0.8,
        wash: 0.8,
        tailChase: 0.8,
        knead: 0.7,
        sneeze: 0.6,
        circle: 0.7,
      },
      0.6,
    );
    Object.assign(this.acts, this.mine());
  }

  private mine(): Record<string, Act> {
    const p = () => this.puppet;
    const tail = this.anatomy.tail;
    return {
      // Sits bolt upright on her haunches like a meerkat: front paws tucked up against her
      // chest, tail braced, head up and turning to look all about.
      meerkat: {
        weight: 2.4,
        length: [7, 7],
        when: () => this.still,
        start: () => (this.posture = 'sit'),
        pose: (t) => {
          const k = ramp(t, 0, 0.7) * (1 - ramp(t, 6.2, 6.9));
          p().add('root', -34 * k);
          p().add('body', -10 * k);
          this.frontLegs(-88 * k);
          p().add('leg.FL', 0, 0, -14 * k);
          p().add('leg.FR', 0, 0, 14 * k);
          p().add('head', (4 + 8 * sin(t, 0.4)) * k, 55 * sin(t, 0.25) * k);
          this.eyes = { x: 0.8 * sin(t, 0.25), y: -0.5 };
          this.pupils = 1;
          this.emote = 'neutral';
          tail.forEach((b) => p().add(b, -30 * k, 0, 0));
          p().add('ear.L', 10 * k, 0, 0);
          p().add('ear.R', 10 * k, 0, 0);
          // Now and then she overbalances a hair and catches herself.
          const wob = pulse(t, 3.2, 0.5);
          p().add('root', -10 * wob);
          p().add('leg.FL', -30 * wob);
          p().add('leg.FR', -30 * wob);
        },
      },
      // Scampers low and fast across the floor on her little legs, and back, ears flat.
      scamper: {
        weight: 1.6,
        length: [6, 6],
        when: () => this.standing,
        start: () => {
          this.posture = 'stand';
          this.go([
            this.somewhere(),
            this.somewhere(),
            this.somewhere(),
            this.somewhere(),
            this.somewhere(),
          ]);
        },
        pose: (t) => {
          this.boost = 3.2;
          p().add('body', 8);
          p().add('head', -8);
          p().add('ear.L', -14, 0, 8);
          p().add('ear.R', -14, 0, -8);
          this.emote = 'happy';
          this.pupils = 1;
          this.extraLift = -0.006 + 0.008 * Math.abs(sin(t, 5));
          tail.forEach((b) => p().add(b, 8, 0, 0));
          if (this.atStop && t > 0.5) this.endAct();
        },
      },
      // Hops again and again at something far too high up, stiff little legs, looking up.
      tinyHops: {
        weight: 1.3,
        length: [5.6, 5.6],
        when: () => this.standing,
        start: () => {
          this.posture = 'stand';
          this.run.n = 0;
        },
        pose: (t) => {
          const hops = Math.floor(t / 0.8);
          if (t < 4.2) {
            if (hops >= this.run.n) {
              this.run.n = hops + 1;
              this.hop.kick(1.6 + 0.2 * this.run.n);
            }
            const air = pulse(t % 0.8, 0.05, 0.5);
            p().add('root', -10 * air);
            this.frontLegs(-70 * air);
            this.backLegs(18 * air);
            p().add('head', -34);
            this.eyes = { x: 0, y: -0.9 };
            this.emote = 'focused';
            this.pupils = 1;
          } else {
            // Gives up: sits down with a thump and looks cross.
            if (!this.run.done) {
              this.run.done = true;
              this.hop.kick(0.8);
            }
            this.posture = 'sit';
            p().add('head', 10, 0, 6 * sin(t, 1));
            this.emote = t < 5 ? 'cross' : 'neutral';
          }
          this.twitch(t, 12, 5);
        },
      },
    };
  }

  protected breedLights(time: number, tone: string | undefined) {
    const o = this.outfit;
    if (!o) return;
    o.dot(0, clamp(0.55 + 0.25 * Math.sin(time * 1.6), 0, 1), tone);
  }
}
