import type { Object3D } from 'three';
import { feels, lights, stock } from './catbreeds';
import { type Act, type Env } from './character';
import type { FaceLayout } from './face';
import { KITTEN_ACT_MOODS, Kitty, kittenMoods, pulse, ramp } from './kitties';
import { sin } from './moves';
import type { Anatomy } from './pet';

/**
 * Pudding, the robot Scottish Fold kitten: a small round ball of a cat with a head as round
 * as an owl's, ears folded flat forward over the top of it like a little cap, owl-round eyes
 * filling the screen, chubby muzzle puffs and short stubby legs on fat paws. She is clumsy
 * and bouncy: she bounces about on all fours, trips over her own paws, topples over.
 *
 * Her signature is the Buddha sit: she plonks down on her bottom with her hind legs stuck
 * straight out in front, her chest up and her paws resting on her round tummy, and just sits
 * there like a little person, looking about, blinking, very pleased with herself, until she
 * tips slowly over backwards and has to be a kitten again.
 *
 * All her own: the Buddha sit, the topple (the Buddha sit that ends on her back, legs
 * kicking) and the bounce (stiff-legged hops on the spot, ears flapping). She also knows
 * the kittens' play: pounces (not very well), stalks, tail chases, zoomies, mews, kneads,
 * puffs up and hops sideways, dozes off mid-step, falls over, washes a paw.
 */
export const SCOTTISHFOLD_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.29, 0.47],
    [0.71, 0.47],
  ],
  rx: 0.15,
  ry: 0.24,
  line: 0.034,
  mouth: [0.5, 0.86],
  kind: 'cat',
  pupil: 0.6,
};

const FOLD: Anatomy = {
  tail: ['tail.1', 'tail.2', 'tail.3'],
  tailAxis: [0, 0.1, -1],
  earsHang: false,
  moods: kittenMoods(),
  actMoods: { ...KITTEN_ACT_MOODS, buddhaSit: 'happy', topple: 'happy', bounce: 'happy' },
  lying: 'sleepy',
  hover: 'happy',
  drop: { stand: 0, sit: -0.1, lie: -0.1 },
  sit: -22,
  turn: 45,
};

export class Scottishfold extends Kitty {
  static readonly terms =
    'kitty baby small tiny round ball folded ears flat fold grey gray silver white fluffy orange eyes chubby stubby bounce sit topple';

  protected readonly anatomy = FOLD;
  protected readonly build = { middle: 0.17, spring: 1.2, speed: 1.8 };

  constructor(model: Object3D) {
    super(
      {
        name: 'Pudding',
        model: 'scottishfold',
        metres: 0.5,
        width: 0.36,
        size: 0.68,
        feels: feels(3, 1, 1.9),
        face: SCOTTISHFOLD_FACE,
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
        speed: 1.8,
      },
      model,
    );
    stock(
      this.acts,
      this.commonActs(),
      this.tricks(),
      {
        pounce: 1.3,
        stalk: 1,
        zoomies: 1.1,
        puffCrab: 0.8,
        mew: 1.2,
        dozeOff: 0.8,
        fallOver: 1.2,
        tailChase: 1,
        knead: 0.8,
        watch: 0.9,
        tilt: 1,
        wash: 1,
        sneeze: 0.6,
        frontLip: 0.7,
        circle: 0.7,
      },
      0.6,
    );
    Object.assign(this.acts, this.mine());
  }

  protected after(dt: number, env: Env) {
    super.after(dt, env);
    lights(this.outfit, this.expression, this.stride);
  }

  /** The Buddha sit: bottom down, hind legs out in front, chest up, paws on the tummy. */
  private buddha(k: number, t: number) {
    const p = this.puppet;
    p.add('body', -50 * k);
    p.add('leg.BL', -38 * k, 0, -12 * k);
    p.add('leg.BR', -38 * k, 0, 12 * k);
    p.add('leg.FL', 50 * k - 62 * k, 0, 16 * k);
    p.add('leg.FR', 50 * k - 62 * k, 0, -16 * k);
    p.add('head', 40 * k + 2 * sin(t, 0.4) * k);
    this.extraLift = -0.035 * k;
    p.add('tail.1', -30 * k);
  }

  private mine(): Record<string, Act> {
    const p = () => this.puppet;
    return {
      // Sits like a person: legs out, paws on her tummy, looking about, very pleased.
      buddhaSit: {
        weight: 3,
        length: [8, 8],
        when: () => this.still,
        start: () => (this.posture = 'stand'),
        pose: (t) => {
          const k = ramp(t, 0, 0.9) * (1 - ramp(t, 7, 7.8));
          this.buddha(k, t);
          p().add('head', 0, 22 * sin(t, 0.22) * k, 5 * sin(t, 0.33) * k);
          const blink = pulse(t, 3.4, 0.4);
          this.emote = blink > 0.5 ? 'asleep' : t < 6 ? 'happy' : 'neutral';
          this.pupils = 0.7;
          p().add('ear.L', 0, 0, -6 * sin(t, 0.5) * k);
          p().add('ear.R', 0, 0, 6 * sin(t, 0.5, 0.3) * k);
          if (t > 0.9 && !this.run.done) {
            this.run.done = true;
            this.hop.kick(0.8);
          }
        },
      },
      // The Buddha sit that tips over backwards: legs kicking, then back on her feet.
      topple: {
        weight: 1.6,
        length: [7, 7],
        when: () => this.still,
        start: () => {
          this.posture = 'stand';
          this.run.dir = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          const sit = ramp(t, 0, 0.8) * (1 - ramp(t, 2.6, 3.2));
          this.buddha(sit, t);
          if (t < 2.4) {
            // Wobbling: more and more.
            this.rollTarget = this.run.dir * 6 * sin(t, 1.3) * ramp(t, 1, 2.4);
            this.emote = t > 1.6 ? 'surprised' : 'happy';
          } else if (t < 5) {
            this.rollTarget = this.run.dir * 80;
            const kick = sin(t, 2.4);
            p().add('leg.BL', -30 + 25 * kick);
            p().add('leg.BR', -30 - 25 * kick);
            p().add('leg.FL', -40 + 20 * sin(t, 2.1, 0.3));
            p().add('head', 0, 0, 8 * sin(t, 1.6));
            this.emote = t < 3.2 ? 'surprised' : 'dizzy';
          } else {
            if (!this.run.done) {
              this.run.done = true;
              this.hop.kick(1.5);
            }
            this.rollTarget = 0;
            this.emote = 'happy';
            p().add('head', 0, 0, 8 * sin(t, 1.5));
          }
        },
      },
      // Stiff-legged hops on the spot, ears flapping, for no reason at all.
      bounce: {
        weight: 1.6,
        length: [4.2, 4.2],
        when: () => this.standing,
        start: () => (this.posture = 'stand'),
        pose: (t) => {
          const hops = Math.floor(t / 0.55);
          if (t < 3.6 && hops >= this.run.n) {
            this.run.n = hops + 1;
            this.hop.kick(1.5 * this.build.spring);
          }
          const air = Math.max(0, sin(t, 1 / 0.55));
          p().add('body', -8 * air);
          this.frontLegs(-12 * air);
          this.backLegs(8 * air);
          p().add('ear.L', -22 * air, 0, 20 * air);
          p().add('ear.R', -22 * air, 0, -20 * air);
          p().add('head', 0, 0, 5 * sin(t, 1 / 0.55, 0.25));
          this.emote = 'happy';
          this.pupils = 1;
          this.twitch(t, 18, 3.6);
        },
      },
    };
  }
}
