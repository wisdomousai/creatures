import type { Object3D } from 'three';
import { adultMoods, CAT_ACT_MOODS, feels, lights, stock } from './catbreeds';
import { type Act, type Env } from './character';
import type { FaceLayout } from './face';
import { Kitty, pulse, ramp } from './kitties';
import { sin } from './moves';
import type { Anatomy } from './pet';

/**
 * Moose, the robot Maine Coon: one of the biggest cats there is, long and broad, with a
 * ruff of chunky plates on his chest, lynx tufts on his ears, snowshoe paws and a huge
 * plumed tail that he carries like a banner. A gentle giant: he moves slowly and a bit
 * heavily, never hurries, and says hello with slow blinks and a little chirp-trill.
 *
 * All his own: the slow blink (head tilted, eyes closing a long moment), the chirp and
 * trill (three quick head-bobs, the ear tufts flicking), and the plume wrap (he sits and
 * brings the whole tail round to the front, then lays his chin on it).
 * He also knows the kittens' play, only slowly: he stalks, kneads, watches a crewmate,
 * grooms, circles, dozes off and, once in a long while, zooms about like a very big kitten.
 */
export const MAINECOON_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.3, 0.46],
    [0.7, 0.46],
  ],
  rx: 0.09,
  ry: 0.25,
  line: 0.034,
  mouth: [0.5, 0.82],
  kind: 'cat',
  pupil: 0.55,
};

const MAINECOON: Anatomy = {
  tail: ['tail.1', 'tail.2', 'tail.3', 'tail.4', 'tail.5'],
  tailAxis: [0, 0.1, -1],
  earsHang: false,
  moods: adultMoods(-12, 0.6),
  actMoods: { ...CAT_ACT_MOODS, slowBlink: 'love', chirp: 'happy', plumeWrap: 'sleepy' },
  lying: 'sleepy',
  hover: 'happy',
  drop: { stand: 0, sit: -0.12, lie: -0.14 },
  sit: -18,
  turn: 45,
};

export class Mainecoon extends Kitty {
  protected readonly anatomy = MAINECOON;
  protected readonly build = { middle: 0.31, spring: 0.55, speed: 1.2 };

  constructor(model: Object3D) {
    super(
      {
        name: 'Moose',
        model: 'mainecoon',
        metres: 0.8,
        width: 0.85,
        size: 1.25,
        feels: feels(5, 0.8),
        face: MAINECOON_FACE,
        eyes: 0.66,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.9 },
          { bone: 'body', yaw: 0.2, pitch: 0 },
        ],
        reach: { yaw: 55, pitch: 25 },
        lag: 0.6,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 1.2,
      },
      model,
    );
    stock(
      this.acts,
      this.commonActs(),
      this.tricks(),
      {
        stalk: 0.6,
        pounce: 0.4,
        zoomies: 0.3,
        knead: 1.3,
        watch: 1.2,
        tilt: 0.9,
        wash: 1.2,
        dozeOff: 0.9,
        frontLip: 0.5,
        backWall: 0.5,
        circle: 0.6,
        sneeze: 0.5,
        bell: 0.5,
      },
      1,
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
      // A slow blink: the head tips, the eyes close for a long moment and open again.
      slowBlink: {
        weight: 1.8,
        length: [4.2, 4.2],
        when: () => this.still,
        start: () => (this.posture = 'sit'),
        pose: (t) => {
          const k = ramp(t, 0, 0.6) * (1 - ramp(t, 3.4, 4.1));
          p().add('head', 6 * k, 0, 9 * k);
          p().add('ear.L', 6 * k);
          p().add('ear.R', 6 * k);
          this.emote = t > 1.2 && t < 2.6 ? 'asleep' : 'neutral';
          this.pupils = 0.5;
          this.twitch(t, 5 * k, 1.2);
        },
      },
      // A chirp and a trill: three quick bobs of the head, the ear tufts flicking.
      chirp: {
        weight: 1.5,
        length: [3.4, 3.4],
        when: () => this.still,
        start: () => (this.posture = 'sit'),
        pose: (t) => {
          const a = pulse(t, 0.3, 0.3) + pulse(t, 0.75, 0.3) + pulse(t, 1.2, 0.5);
          p().add('head', -14 * a, 0, 3 * sin(t, 8) * pulse(t, 1.2, 0.5));
          p().add('body', -3 * a);
          p().add('ear.L', 8 * a, 0, -10 * a);
          p().add('ear.R', 8 * a, 0, 10 * a);
          this.emote = a > 0.2 ? 'happy' : 'neutral';
          this.pupils = 0.4 + 0.5 * a;
          this.twitch(t, 8 * a, 6);
          if (t > 2 && !this.run.done) {
            this.run.done = true;
            this.lookAround();
          }
          if (t > 2) p().add('head', 0, 24 * sin(t, 0.6));
        },
      },
      // Sits and brings the plume right round to the front, then lays his chin on it.
      plumeWrap: {
        weight: 1.2,
        length: [7, 7],
        when: () => this.still,
        start: () => (this.posture = 'sit'),
        pose: (t) => {
          const round = ramp(t, 0.3, 1.6) * (1 - ramp(t, 6, 6.8));
          p().add(bones[0], 0, -70 * round, 0);
          bones.slice(1).forEach((b) => p().add(b, 0, 0, -28 * round));
          const chin = ramp(t, 2, 3.2) * (1 - ramp(t, 5.5, 6.4));
          p().add('head', 22 * chin, -8 * chin, 6 * chin);
          this.emote = chin > 0.6 ? 'asleep' : 'sleepy';
          this.pupils = 0.3;
        },
      },
    };
  }

  private lookAround() {
    this.puppet.kick('head', 0, 120, 0);
  }
}
