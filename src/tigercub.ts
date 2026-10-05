import type { Object3D } from 'three';
import { type Act, clamp } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import type { Anatomy } from './pet';
import { KITTEN_ACT_MOODS, kittenMoods, pulse, ramp } from './kitties';
import { Moggy } from './moggy';

/**
 * Rawr, the robot tiger cub, on the cats' kit: an oversized head on a small body with big
 * paws, striped grooves, round ears with a lit white spot on the back of each. He does the
 * kittens' tricks (stalking a crewmate low, pouncing, falling over) and three of his own: a
 * "roar" that comes out a squeak, a pounce on his own tail that he finally catches, and a
 * cub tumble head over heels.
 */
export const TIGERCUB_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.28, 0.5],
    [0.72, 0.5],
  ],
  rx: 0.115,
  ry: 0.31,
  line: 0.03,
  mouth: [0.5, 0.82],
  kind: 'cat',
  pupil: 0.6,
};

const TIGERCUB: Anatomy = {
  tail: ['tail.1', 'tail.2', 'tail.3'],
  tailAxis: [0, 0.4, -0.9],
  earsHang: false,
  moods: kittenMoods(),
  actMoods: {
    ...KITTEN_ACT_MOODS,
    squeakRoar: 'happy',
    tailPounce: 'curious',
    cubTumble: 'happy',
  },
  lying: 'sleepy',
  hover: 'happy',
  drop: { stand: 0, sit: -0.06, lie: -0.07 },
  sit: -22,
  turn: 40,
};

export class Tigercub extends Moggy {
  static readonly terms =
    'big cat stripes striped orange ginger black white oversized head paws round ears pounce stalk whiskers playful roar squeak tumble feline';

  protected readonly anatomy = TIGERCUB;
  protected readonly build = { middle: 0.17, spring: 1.1, speed: 1.9 };

  constructor(model: Object3D) {
    super(
      {
        name: 'Rawr',
        model: 'tigercub',
        metres: 0.52,
        width: 0.6,
        size: 0.85,
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
        face: TIGERCUB_FACE,
        eyes: 0.64,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.9 },
          { bone: 'body', yaw: 0.2, pitch: 0 },
        ],
        reach: { yaw: 60, pitch: 30 },
        lag: 0.9,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 1.9,
      },
      model,
    );
    this.adopt(
      {
        pounce: 1.2,
        stalk: 1.6,
        zoomies: 1,
        puffCrab: 0.6,
        mew: 0.6,
        dozeOff: 0.9,
        fallOver: 0.9,
        watch: 1,
        tilt: 0.8,
        wash: 0.8,
        tailChase: 0.6,
        knead: 0.6,
        sneeze: 0.6,
        circle: 0.7,
        backWall: 0.5,
        frontLip: 0.5,
      },
      0.6,
    );
    Object.assign(this.acts, this.mine());
  }

  private mine(): Record<string, Act> {
    const p = () => this.puppet;
    const tail = this.anatomy.tail;
    const stand = () => this.standing;
    return {
      // A big breath, a rear-up, a mighty ROAR, which is a squeak; then he looks around, cross
      // that nobody was scared.
      squeakRoar: {
        weight: 2,
        length: [5.2, 5.2],
        when: stand,
        start: () => (this.posture = 'stand'),
        pose: (t) => {
          const wind = ramp(t, 0, 1.2) * (t < 2.2 ? 1 : 0);
          const roar = pulse(t, 2.2, 1.0);
          p().add('body', -10 * wind - 14 * roar);
          this.frontLegs(-30 * wind - 20 * roar);
          p().add('head', -22 * wind - 26 * roar);
          this.extraLift = 0.012 * wind;
          this.emote =
            t < 2.2 ? 'determined' : t < 3.4 ? 'surprised' : t < 4.4 ? 'cross' : 'sheepish';
          this.pupils = 0.9;
          if (roar > 0.5) {
            p().add('ear.L', -20, 0, 14);
            p().add('ear.R', -20, 0, -14);
            if (!this.run.done) {
              this.run.done = true;
              this.hop.kick(1.4);
            }
          }
          if (t > 3.4) p().add('head', 4, 18 * sin(t, 0.7), 0);
          tail.forEach((b) => p().add(b, 0, 14 * roar * sin(t, 8), 0));
        },
      },
      // Spots his own tail, crouches, wiggles, pounces on it, and it is caught: he sits on it
      // and gives it a gnaw.
      tailPounce: {
        weight: 1.8,
        length: [5.5, 5.5],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.run.dir = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          const d = this.run.dir;
          if (t < 1.8) {
            const k = ramp(t, 0, 0.5);
            p().add('head', 14 * k, d * 55 * k);
            p().add('body', 14 * k, d * 14 * k);
            this.frontLegs(-24 * k);
            this.extraLift = -0.02 * k;
            const w = sin(t, 5) * 8 * ramp(t, 0.8, 1.2);
            p().add('body', 0, w);
            tail.forEach((b, i) => p().add(b, 0, -d * (34 + 10 * i) * sin(t, 2.4, i * 0.1) * k));
            this.emote = 'focused';
            this.pupils = 1;
          } else if (t < 2.5) {
            if (!this.run.done) {
              this.run.done = true;
              this.hop.kick(2.4);
            }
            p().add('head', 22, d * 40);
            this.frontLegs(-60);
            this.emote = 'surprised';
          } else {
            // Caught it: sat down, tail in his paws, nibbling.
            this.posture = 'sit';
            p().add('head', 24, d * 30 + 6 * sin(t, 2.2), 0);
            tail.forEach((b) => p().add(b, 0, -d * 55, 0));
            this.emote = 'happy';
          }
        },
      },
      // A cub's tumble: a forward roll, head over heels, ending sprawled and dazed.
      cubTumble: {
        weight: 1.4,
        length: [4.6, 4.6],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.run.dir = this.roomy();
        },
        pose: (t) => {
          if (t < 0.6) {
            const k = ramp(t, 0, 0.6);
            p().add('body', 18 * k);
            this.frontLegs(-30 * k);
            this.emote = 'determined';
          } else if (t < 2.2) {
            const u = ramp(t, 0.6, 2.2);
            this.rollTarget = -this.run.dir * 360 * u;
            this.extraLift = 0.06 * Math.sin(u * Math.PI);
            this.frontLegs(-70);
            this.backLegs(40);
            tail.forEach((b) => p().add(b, 30, 0, 0));
            this.emote = 'surprised';
            if (!this.run.done) {
              this.run.done = true;
              this.walkTo(this.s + this.run.dir * this.heightPx * 1.2, this.depth);
            }
            this.boost = 2;
          } else {
            this.rollTarget = 0;
            const w = ramp(t, 2.2, 2.5);
            p().add('head', 0, 18 * sin(t, 0.9), 10 * sin(t, 0.9, 0.25));
            this.frontLegs(40 * w);
            this.backLegs(-30 * w);
            this.extraLift = -0.04 * w;
            this.emote = t < 3.6 ? 'dizzy' : 'sheepish';
            this.pupils = 1;
          }
        },
      },
    };
  }

  protected breedLights(time: number, tone: string | undefined) {
    const o = this.outfit;
    if (!o) return;
    const asleep = this.mood === 'asleep' || this.posture === 'lie';
    const squeak = this.act === 'squeakRoar' && this.actT > 2.2 && this.actT < 3.2;
    const glow = asleep ? 0.12 : clamp(0.55 + 0.3 * Math.sin(time * 1.4), 0, 1);
    o.dot(5, squeak ? 1 : glow, tone);
    o.dot(6, asleep ? 0.1 : 0.45 + 0.3 * Math.sin(time * 1.1 + 1), tone);
  }
}
