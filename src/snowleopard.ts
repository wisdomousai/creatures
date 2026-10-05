import type { Object3D } from 'three';
import { type Act, clamp } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import type { Anatomy } from './pet';
import { KITTEN_ACT_MOODS, kittenMoods, pulse, ramp } from './kitties';
import { Moggy } from './moggy';

/**
 * Flurry, the robot snow leopard cub, on the cats' kit like Rawr the tiger cub: a smoky grey
 * cub with an oversized head, big furry paws, small round ears and dark rosette rings along
 * her back and flanks, and, her signature, a HUGE thick tail almost as long as her body,
 * carried curled up over her back. She does the kittens' tricks (stalking a crewmate low,
 * pouncing, falling over) and three of her own with that tail: she chases it, catches it,
 * and hugs and gnaws it; she wraps it round herself like a blanket to sleep; and she does a
 * clumsy pounce that ends nose first.
 */
export const SNOWLEOPARD_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.28, 0.5],
    [0.72, 0.5],
  ],
  rx: 0.11,
  ry: 0.3,
  line: 0.03,
  mouth: [0.5, 0.82],
  kind: 'cat',
  pupil: 0.6,
};

const SNOWLEOPARD: Anatomy = {
  tail: ['tail.1', 'tail.2', 'tail.3', 'tail.4'],
  tailAxis: [0, 0.4, -0.9],
  earsHang: false,
  moods: kittenMoods(),
  actMoods: {
    ...KITTEN_ACT_MOODS,
    tailHug: 'happy',
    tailWrap: 'asleep',
    clumsyPounce: 'curious',
  },
  lying: 'sleepy',
  hover: 'happy',
  drop: { stand: 0, sit: -0.06, lie: -0.07 },
  sit: -22,
  turn: 40,
};

export class Snowleopard extends Moggy {
  static readonly terms =
    'big cat cub kitten ounce grey gray white smoky black spots spotted rosettes fluffy furry thick long tail chase pounce stalk mountain';

  protected readonly anatomy = SNOWLEOPARD;
  protected readonly build = { middle: 0.17, spring: 1.05, speed: 1.7 };

  constructor(model: Object3D) {
    super(
      {
        name: 'Flurry',
        model: 'snowleopard',
        metres: 0.5,
        width: 0.66,
        size: 0.85,
        feels: {
          default: { f: 2.6, zeta: 0.5 },
          root: { f: 3, zeta: 0.55 },
          body: { f: 2.4, zeta: 0.6 },
          head: { f: 2.2, zeta: 0.5, r: 0.3 },
          'ear.L': { f: 5, zeta: 0.3 },
          'ear.R': { f: 5, zeta: 0.3 },
          'tail.1': { f: 1.7, zeta: 0.45 },
          'tail.2': { f: 2, zeta: 0.4 },
          'tail.3': { f: 2.3, zeta: 0.35 },
          'tail.4': { f: 2.6, zeta: 0.3 },
        },
        face: SNOWLEOPARD_FACE,
        eyes: 0.64,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.9 },
          { bone: 'body', yaw: 0.2, pitch: 0 },
        ],
        reach: { yaw: 60, pitch: 30 },
        lag: 0.95,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 1.7,
      },
      model,
    );
    this.adopt(
      {
        pounce: 1,
        stalk: 1.5,
        zoomies: 0.9,
        puffCrab: 0.6,
        mew: 0.5,
        dozeOff: 0.9,
        fallOver: 0.9,
        watch: 1,
        tilt: 0.8,
        wash: 0.9,
        tailChase: 1.2,
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
    const still = () => this.still;
    /** The tail swung round to one side and forward, `k` of the way (d is the side). */
    const curl = (d: number, k: number, bend = 1) => {
      const yaw = [62, 58, 46, 38];
      tail.forEach((b, i) => p().add(b, i === 0 ? -10 * k : 0, d * yaw[i] * k * bend, 0));
    };
    return {
      // She sits, spots her own tail swinging round, grabs it in both paws, gives it a gnaw
      // and then hugs it, cheek against it.
      tailHug: {
        weight: 2,
        length: [8, 8],
        when: stand,
        start: () => {
          this.posture = 'sit';
          this.run.dir = Math.random() < 0.5 ? -1 : 1;
          this.run.done = false;
        },
        pose: (t) => {
          const d = this.run.dir;
          const swing = ramp(t, 0.5, 2.2);
          const caught = ramp(t, 2.2, 2.7) * (1 - ramp(t, 7.0, 7.7));
          curl(d, swing * (1 - ramp(t, 7.0, 7.7)));
          // She looks at it, then pounces on it.
          const look = ramp(t, 0.3, 1.2) * (1 - ramp(t, 7, 7.7));
          p().add('head', 14 * look, d * 52 * look);
          p().add('body', 4 * look, d * 10 * look);
          this.frontLegs(-30 * caught, d * -8 * caught);
          this.emote = t < 2.2 ? 'focused' : t < 3.4 ? 'surprised' : 'happy';
          this.pupils = t < 3.4 ? 1 : 0.4;
          // The gnaw: little bites, head bobbing.
          const gnaw = ramp(t, 2.8, 3.1) * (1 - ramp(t, 4.6, 4.9));
          p().add('head', 8 * gnaw * Math.max(0, sin(t, 3.4)));
          if (t > 2.2 && !this.run.done) {
            this.run.done = true;
            this.hop.kick(1.2);
          }
          // The hug: front legs round, head rests on it, eyes shut.
          const hug = ramp(t, 4.9, 5.6) * (1 - ramp(t, 6.9, 7.6));
          this.frontLegs(-48 * hug, d * -16 * hug);
          p().add('head', 10 * hug, d * 8 * hug, d * 10 * hug);
          if (hug > 0.5) this.emote = 'sleepy';
          p().add('body', 3 * sin(t, 0.4) * hug);
        },
      },
      // Lies down and wraps the huge tail round herself like a blanket, nose tucked under it,
      // and sleeps, a breath at a time.
      tailWrap: {
        weight: 1.6,
        length: [13, 16],
        when: still,
        start: () => {
          this.posture = 'lie';
          this.run.dir = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          const k = ramp(t, 0.6, 2.6);
          const d = this.run.dir;
          curl(d, k, 1.35);
          const breath = sin(t, 0.28);
          p().add('head', (14 + 5 * k + 1.5 * breath) * 1, d * 38 * k, d * 8 * k);
          p().add('body', 0, d * 6 * k, 0);
          p().add('ear.L', -14 * k);
          p().add('ear.R', -14 * k);
          this.emote = t < 3.5 ? 'sleepy' : 'asleep';
        },
      },
      // A crouch, a wiggle, a mighty leap at nothing, and a landing flat on her nose with her
      // rump in the air; she sits up as if she meant it.
      clumsyPounce: {
        weight: 1.8,
        length: [5.6, 5.6],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.run.dir = Math.random() < 0.5 ? -1 : 1;
          this.run.done = false;
        },
        pose: (t) => {
          const d = this.run.dir;
          if (t < 1.7) {
            const k = ramp(t, 0, 0.5);
            p().add('head', 12 * k, d * 6 * k);
            p().add('body', 12 * k);
            this.frontLegs(-22 * k);
            this.extraLift = -0.02 * k;
            p().add('body', 0, 7 * sin(t, 5) * ramp(t, 0.8, 1.2));
            tail.forEach((b, i) => p().add(b, 0, 22 * sin(t, 3.2, i * 0.1) * k));
            this.emote = 'focused';
            this.pupils = 1;
          } else if (t < 2.4) {
            if (!this.run.done) {
              this.run.done = true;
              this.hop.kick(2.4);
            }
            p().add('body', -16);
            this.frontLegs(-62);
            this.backLegs(24);
            tail.forEach((b) => p().add(b, 18, 0, 0));
            this.emote = 'surprised';
          } else if (t < 4.2) {
            // Nose first: chest and head down, rump up, front legs splayed.
            const u = ramp(t, 2.4, 2.8);
            p().add('body', 26 * u);
            p().add('head', 14 * u);
            this.frontLegs(-76 * u, d * 14 * u);
            this.backLegs(-14 * u);
            this.extraLift = -0.03 * u;
            tail.forEach((b, i) => p().add(b, -20 * u, d * 14 * u * (i + 1) * 0.5));
            this.emote = 'dizzy';
            this.rollTarget = d * 8 * u;
          } else {
            const w = ramp(t, 4.2, 4.8);
            this.rollTarget = 0;
            this.posture = 'sit';
            p().add('head', 0, 14 * sin(t, 0.9) * w, 8 * sin(t, 0.9, 0.25) * w);
            this.emote = 'sheepish';
            this.pupils = 0.5;
          }
        },
      },
    };
  }

  protected breedLights(time: number, tone: string | undefined) {
    const o = this.outfit;
    if (!o) return;
    const asleep = this.mood === 'asleep' || this.posture === 'lie';
    const glow = asleep ? 0.1 : clamp(0.5 + 0.3 * Math.sin(time * 1.2), 0, 1);
    o.dot(5, glow, tone);
  }
}
