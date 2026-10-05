import type { Object3D } from 'three';
import { BEACON } from './bolt';
import { adultMoods, CAT_ACT_MOODS, feels, lights, stock } from './catbreeds';
import { type Act, type Env } from './character';
import type { FaceLayout } from './face';
import { Kitty, pulse, ramp } from './kitties';
import { sin } from './moves';
import type { Anatomy } from './pet';

/**
 * Pearl, the robot Persian, a senior: round and low, a broad flat face under heavy lids with
 * a grey muzzle panel, small ears, a fluffy collar of rounded plates and a bushy tail on
 * short legs. She is old and she is in no hurry: she walks slowly and stiffly, sits down in
 * stages, sleeps through half the day (the nap and the doze are the acts she picks most),
 * and her joints creak.
 *
 * All her own: the creaky stretch (down in stages with a groan in each, the tag flickering,
 * and up again with a grumble), washing her face (a paw over the ear and down across her
 * face, again and again, slowly) and the grumble (a long huffy look, a head shake and a
 * flick of the tail). Of the kittens' play she keeps only what an old cat does: knead, watch
 * a crewmate, tilt her head, peer over the front lip, and every so often a short, stiff dash
 * that she regrets.
 */
export const PERSIAN_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.29, 0.44],
    [0.71, 0.44],
  ],
  rx: 0.1,
  ry: 0.25,
  line: 0.034,
  mouth: [0.5, 0.84],
  kind: 'cat',
  pupil: 0.6,
};

const PERSIAN: Anatomy = {
  tail: ['tail.1', 'tail.2', 'tail.3'],
  tailAxis: [0, 0.3, -1],
  earsHang: false,
  moods: adultMoods(-18, 0.5),
  actMoods: { ...CAT_ACT_MOODS, creakStretch: 'sleepy', faceWash: 'happy', grumble: 'annoyed' },
  lying: 'sleepy',
  hover: 'happy',
  drop: { stand: 0, sit: -0.1, lie: -0.11 },
  sit: -14,
  turn: 45,
};

export class Persian extends Kitty {
  static readonly terms =
    'kitty old senior elderly aged grey gray silver white fluffy fuzzy flat face orange eyes round low bushy tail slow stiff creaky';

  protected readonly anatomy = PERSIAN;
  protected readonly build = { middle: 0.21, spring: 0.3, speed: 0.8 };

  constructor(model: Object3D) {
    super(
      {
        name: 'Pearl',
        model: 'persian',
        metres: 0.6,
        width: 0.52,
        size: 0.84,
        feels: feels(3, 0.55, 2.2),
        face: PERSIAN_FACE,
        eyes: 0.62,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.9 },
          { bone: 'body', yaw: 0.15, pitch: 0 },
        ],
        reach: { yaw: 50, pitch: 25 },
        lag: 0.45,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 0.8,
      },
      model,
    );
    const common = this.commonActs();
    stock(
      this.acts,
      common,
      this.tricks(),
      {
        stalk: 0.2,
        pounce: 0.15,
        zoomies: 0.12,
        knead: 1.3,
        watch: 1.2,
        tilt: 0.9,
        dozeOff: 1.6,
        frontLip: 0.4,
        sneeze: 0.6,
      },
      1.6,
    );
    // She sleeps a lot: naps come round twice as often, and stroll less.
    this.acts.nap = { ...common.nap, weight: 3.4, length: [12, 24] };
    this.acts.stroll = { ...common.stroll, weight: 1.2 };
    this.acts.sit = { ...common.sit, weight: 3.5 };
    Object.assign(this.acts, this.mine());
  }

  protected after(dt: number, env: Env) {
    super.after(dt, env);
    lights(this.outfit, this.expression, this.stride);
  }

  private mine(): Record<string, Act> {
    const p = () => this.puppet;
    return {
      // Down in stages, a creak in each, and up again with a grumble.
      creakStretch: {
        weight: 1.8,
        length: [7, 7],
        when: () => this.standing,
        start: () => (this.posture = 'stand'),
        pose: (t) => {
          const chest = ramp(t, 0.2, 1.5) * (1 - ramp(t, 5.2, 6.4));
          const rump = ramp(t, 2.2, 3.4) * (1 - ramp(t, 5, 6));
          // Stiff: it comes in steps, a little catch at each.
          const catch1 = pulse(t, 1.4, 0.4);
          const catch2 = pulse(t, 3.2, 0.4);
          p().add('body', 12 * chest + 6 * rump);
          this.frontLegs(-34 * chest - 4 * catch1);
          this.backLegs(-8 * rump - 4 * catch2);
          p().add('head', -10 * chest + 3 * catch2);
          this.extraLift = 0.02 * rump - 0.015 * chest;
          // The creak: a tremble in the legs as each joint takes the weight.
          const c = (catch1 + catch2) * sin(t, 12);
          p().add('leg.FL', 3 * c);
          p().add('leg.FR', -3 * c);
          p().add('leg.BL', 3 * c);
          if (catch1 + catch2 > 0.5)
            this.outfit?.beacon(sin(t, 10) > 0 ? '#ffe17a' : BEACON.neutral!);
          this.emote = t > 5.3 ? 'cross' : 'sleepy';
          this.pupils = 0.25;
          if (t > 5.6 && !this.run.done) {
            this.run.done = true;
            this.hop.kick(0.5);
            p().kick('head', 0, 90, 0);
          }
        },
      },
      // Washes her face: a paw over the ear and down across her face, again and again.
      faceWash: {
        weight: 1.6,
        length: [6, 6],
        when: () => this.still,
        start: () => (this.posture = 'sit'),
        pose: (t) => {
          const k = ramp(t, 0, 0.8) * (1 - ramp(t, 5, 5.8));
          const s = 0.5 + 0.5 * sin(t, 0.7);
          p().add('leg.FL', (-120 - 25 * s) * k, 0, -8 * k);
          p().add('head', (20 + 8 * s) * k, 5 * k, -6 * k * s);
          p().add('ear.L', 0, 0, -10 * k * s);
          this.emote = s > 0.5 ? 'sleepy' : 'happy';
          this.pupils = 0.3;
        },
      },
      // A long huffy look, a head shake, a flick of the tail.
      grumble: {
        weight: 1.2,
        length: [4.6, 4.6],
        when: () => this.still,
        start: () => (this.posture = 'sit'),
        pose: (t) => {
          const k = ramp(t, 0, 0.5) * (1 - ramp(t, 4, 4.6));
          p().add('head', 4 * k, 0, 0);
          const shake = pulse(t, 1.8, 1.2);
          p().add('head', 0, 22 * shake * sin(t, 2.4), 6 * shake * sin(t, 2.4, 0.25));
          p().add('ear.L', -12 * k, 0, 14 * k);
          p().add('ear.R', -12 * k, 0, -14 * k);
          this.twitch(t, 22 * k, 3.5);
          this.emote = t < 1.8 ? 'cross' : 'sleepy';
          this.pupils = 0.35;
        },
      },
    };
  }
}
