import type { Object3D } from 'three';
import { type Act, clamp } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import type { Anatomy } from './pet';
import { pulse, ramp } from './kitties';
import { adultMoods, CAT_ACT_MOODS, Moggy } from './moggy';

/**
 * Gus, the robot old tabby: a senior moggy, thin and bony, with a grey muzzle, one torn ear,
 * an M on his brow and classic tabby grooves. He is slow and stiff, and his joints creak: the
 * lights in his knees (Dot5) flare when one catches. He takes his time over everything, stretches
 * in jerky ratchet steps with a wince at the end, sleeps for a long time in a tight loaf with his
 * tail round his paws, and when anything disturbs him he gives one grumpy flick of the tail and a
 * look of great disapproval. A poke gets the flick; three quick pokes make him cross, not dizzy.
 */
export const OLDTABBY_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.3, 0.5],
    [0.7, 0.5],
  ],
  rx: 0.095,
  ry: 0.23,
  line: 0.032,
  mouth: [0.5, 0.82],
  kind: 'cat',
  pupil: 0.6,
};

/** Quantised, so a joint moves in ratchet steps instead of smoothly. */
const steps = (x: number, n = 5) => Math.round(x * n) / n;

const OLDTABBY: Anatomy = {
  tail: ['tail.1', 'tail.2', 'tail.3', 'tail.4'],
  tailAxis: [0, 0.1, -1],
  earsHang: false,
  moods: adultMoods({
    calm: {
      face: 'neutral',
      carriage: -55,
      bob: [3, 0.15],
      hook: 6,
      flicks: 0.15,
      ears: -4,
      out: 8,
      swivel: 0.3,
    },
    curious: {
      face: 'neutral',
      carriage: -30,
      hook: 20,
      flicks: 0.5,
      ears: 6,
      out: 0,
      swivel: 0.6,
    },
    happy: { face: 'happy', carriage: -15, hook: 15, ears: 2, out: 2, swivel: 0.2 },
    love: { face: 'love', carriage: -15, hook: 10, quiver: 0.6, ears: 2, out: 2, swivel: 0 },
    annoyed: {
      face: 'cross',
      carriage: -50,
      bob: [10, 1.2],
      hook: -10,
      flicks: 0.9,
      ears: -24,
      out: 46,
      swivel: 0,
    },
    sleepy: {
      face: 'sleepy',
      carriage: -80,
      bob: [2, 0.1],
      hook: 4,
      ears: -6,
      out: 18,
      swivel: 0.1,
    },
    asleep: { face: 'asleep', carriage: -80, flicks: 0.1, ears: -6, out: 14, swivel: 0.2 },
  }),
  actMoods: {
    ...CAT_ACT_MOODS,
    dizzy: 'annoyed',
    creakStretch: 'sleepy',
    loafNap: 'asleep',
    grumpyFlick: 'annoyed',
  },
  lying: 'sleepy',
  hover: 'calm',
  drop: { stand: 0, sit: -0.09, lie: -0.1 },
  sit: -20,
  turn: 45,
};

export class Oldtabby extends Moggy {
  protected readonly anatomy = OLDTABBY;
  protected readonly build = { middle: 0.3, spring: 0.5, speed: 0.7 };
  /** How much a joint is catching just now, 0..1 (lights the knees). */
  private creak = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Gus',
        model: 'oldtabby',
        metres: 0.65,
        width: 0.72,
        size: 1.02,
        feels: {
          default: { f: 1.8, zeta: 0.8 },
          root: { f: 2.4, zeta: 0.8 },
          body: { f: 1.5, zeta: 0.85 },
          head: { f: 1.5, zeta: 0.75, r: 0.2 },
          'ear.L': { f: 3.5, zeta: 0.4 },
          'ear.R': { f: 3.5, zeta: 0.4 },
          'tail.1': { f: 1.2, zeta: 0.6 },
          'tail.2': { f: 1.4, zeta: 0.55 },
          'tail.3': { f: 1.7, zeta: 0.45 },
          'tail.4': { f: 2, zeta: 0.4 },
          'leg.FL': { f: 2.2, zeta: 0.75 },
          'leg.FR': { f: 2.2, zeta: 0.75 },
          'leg.BL': { f: 2.2, zeta: 0.75 },
          'leg.BR': { f: 2.2, zeta: 0.75 },
        },
        face: OLDTABBY_FACE,
        eyes: 0.71,
        gaze: [
          { bone: 'head', yaw: 0.7, pitch: 0.7 },
          { bone: 'body', yaw: 0.15, pitch: 0 },
        ],
        reach: { yaw: 50, pitch: 22 },
        lag: 0.5,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 0.7,
      },
      model,
    );
    this.adopt(
      {
        watch: 1.2,
        wash: 1,
        sneeze: 0.7,
        tilt: 0.5,
        knead: 0.8,
        dozeOff: 1.1,
        backWall: 0.4,
        frontLip: 0.3,
      },
      1.2,
    );
    // He doesn't hurry for anyone: the sit and stroll are slow anyway, the nap is long.
    this.acts.nap = { ...this.acts.nap, weight: 2, length: [14, 26] };
    Object.assign(this.acts, this.mine());
  }

  protected idle(t: number) {
    this.creak = 0;
    super.idle(t);
  }

  poke() {
    if (this.state !== 'here') return;
    if (this.poked() >= 3) this.setAct('dizzy');
    else this.setAct('grumpyFlick');
  }

  protected breedLights(time: number, _tone: string | undefined) {
    const o = this.outfit;
    if (!o) return;
    const walking = clamp(this.stride / 60, 0, 1);
    // Every so often a step catches: a knee flares for a moment.
    const catching = walking * Math.max(0, Math.sin(time * 5.1)) ** 6;
    o.dot(5, clamp(0.12 + this.creak + catching * 0.8, 0, 1), '#ffb347');
  }

  private mine(): Record<string, Act> {
    const p = () => this.puppet;
    const tail = this.anatomy.tail;
    return {
      // A long stretch in ratchet steps, each with a creak; he catches at the top, winces,
      // and lets it down again with a sigh.
      creakStretch: {
        weight: 1.8,
        length: [7.5, 7.5],
        when: () => this.standing,
        start: () => (this.posture = 'stand'),
        pose: (t) => {
          const up = steps(ramp(t, 0.6, 3.8), 5);
          const down = steps(ramp(t, 5.4, 7), 4);
          const s = up * (1 - down);
          p().add('body', 14 * s);
          this.frontLegs(-58 * s);
          this.backLegs(-8 * s);
          p().add('head', -24 * s);
          tail.forEach((b) => p().add(b, -8 * s, 0, 0));
          // A step lands: the knee lights flare for an instant.
          const frac = (ramp(t, 0.6, 3.8) * 5) % 1;
          this.creak = t > 0.6 && t < 3.9 ? (frac < 0.25 ? 1 : 0.15) : 0;
          if (t > 3.8 && t < 5.2) {
            // Stuck at the top: a tremble, a wince.
            p().add('leg.FL', 2 * sin(t, 14));
            p().add('leg.FR', 2 * sin(t, 13));
            this.emote = 'cross';
            this.creak = 0.8;
          } else this.emote = t > 5.2 ? 'sleepy' : 'neutral';
          this.pupils = 0.2;
          if (t > 6 && !this.run.done) {
            this.run.done = true;
            this.hop.kick(0.6);
          }
        },
      },
      // Curls into a tight loaf, tail round his paws, and sleeps for a long, long time.
      loafNap: {
        weight: 2,
        length: [16, 26],
        when: () => this.still,
        start: () => (this.posture = 'lie'),
        pose: (t) => {
          const k = steps(ramp(t, 0.4, 3.2), 6);
          p().add('leg.FL', 30 * k);
          p().add('leg.FR', 30 * k);
          p().add('leg.BL', -30 * k);
          p().add('leg.BR', -30 * k);
          p().add('head', -4 * k + 2 * sin(t, 0.12));
          p().add('tail.1', 0, 70 * k);
          tail.slice(1).forEach((b) => p().add(b, 0, 0, 26 * k));
          p().add('ear.L', -6 * k, 0, -10 * k);
          p().add('ear.R', -6 * k, 0, 10 * k);
          this.creak = t < 3.4 ? 0.5 : 0;
          this.emote = t > 4 ? 'asleep' : t > 1.6 ? 'sleepy' : 'neutral';
        },
      },
      // One hard flick of the tail, ears back, and a look of deep disapproval.
      grumpyFlick: {
        weight: 1.4,
        length: [3.4, 3.4],
        when: () => this.still,
        start: () => {
          this.run.dir = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          const k = ramp(t, 0, 0.4) * (1 - ramp(t, 2.6, 3.4));
          p().add('head', 4 * k, 24 * this.run.dir * k, -6 * this.run.dir * k);
          p().add('ear.L', -14 * k, 0, -26 * k);
          p().add('ear.R', -14 * k, 0, 26 * k);
          this.emote = 'cross';
          this.pupils = 0.1;
          if (t > 0.5 && !this.run.done) {
            this.run.done = true;
            p().kick('tail.2', 0, 0, 520);
            p().kick('tail.3', 0, 0, -620);
            p().kick('tail.4', 0, 0, 700);
          }
          const again = pulse(t, 1.6, 0.4);
          p().add('tail.1', 0, 22 * again * this.run.dir);
          tail.slice(1).forEach((b) => p().add(b, 0, 0, 30 * again));
        },
      },
    };
  }
}
