import type { Object3D } from 'three';
import { BEACON } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import type { Anatomy, Feeling } from './pet';
import { DOG_ACT_MOODS, dogMoods, Hound } from './dogs';
import { pulse, ramp } from './kitties';

/**
 * Wisp, the robot greyhound: the slenderest of the dogs, a deep narrow chest over a tucked
 * waist, long thin legs and a long thin tail, with little rose ears laid back. He is a
 * sprinter and a sleeper. He sits about calmly, then something goes off in him and he
 * runs flat out from one side of the floor to the other and back in a few seconds of
 * zoomies, bounding as he goes, and then he is spent: he lies on his back with all four
 * long legs in the air and sleeps like that ("roaching"). He also shivers when it is
 * cold, with his teeth going.
 *
 * Each leg has a lit cuff above the foot that flashes as the foot lands, and the number
 * lamps on his racing vest take the colour of his mood.
 */
export const GREYHOUND_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.3, 0.5],
    [0.7, 0.5],
  ],
  rx: 0.065,
  ry: 0.3,
  line: 0.035,
  mouth: null,
};

const GREYHOUND: Anatomy = {
  tail: ['tail.1', 'tail.2', 'tail.3', 'tail.4'],
  tailAxis: [0, 0.7, -0.7],
  earsHang: true,
  moods: dogMoods(-6),
  actMoods: {
    ...DOG_ACT_MOODS,
    zoomBurst: 'happy',
    roach: 'asleep',
    shiver: 'sad',
    windUp: 'curious',
    longStretch: 'sleepy',
    sitStatue: 'calm',
    sprintPast: 'happy',
  },
  lying: 'calm',
  hover: 'curious',
  drop: { stand: 0, sit: -0.12, lie: -0.2 },
  sit: -30,
  turn: 52,
};

export class Greyhound extends Hound {
  static readonly terms =
    'doggo pooch lurcher slender slim thin skinny tall long legs grey gray silver blue white orange vest racing sprint run fast zoomies';

  protected readonly anatomy = GREYHOUND;
  protected readonly build = { middle: 0.35, spring: 1.1, speed: 2 };
  /** The cuff lights: a flash per leg (FL FR BL BR). */
  private cuffs = [0, 0, 0, 0];
  /** How much he arches into a gallop, 0..1 (set by a trick every frame). */
  private gallop = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Wisp',
        model: 'greyhound',
        metres: 0.78,
        width: 1.2,
        size: 1.2,
        feels: {
          default: { f: 2.4, zeta: 0.55 },
          root: { f: 3, zeta: 0.55 },
          body: { f: 2.4, zeta: 0.6 },
          head: { f: 2, zeta: 0.5, r: 0.3 },
          jaw: { f: 6, zeta: 0.5 },
          'ear.L': { f: 3.2, zeta: 0.25 },
          'ear.R': { f: 3.2, zeta: 0.25 },
          'tail.1': { f: 3.5, zeta: 0.4 },
          'tail.2': { f: 4, zeta: 0.35 },
          'tail.3': { f: 4.5, zeta: 0.3 },
          'tail.4': { f: 5, zeta: 0.3 },
        },
        face: GREYHOUND_FACE,
        eyes: 0.7,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.9 },
          { bone: 'body', yaw: 0.2, pitch: 0 },
        ],
        reach: { yaw: 60, pitch: 30 },
        lag: 1,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 2,
      },
      model,
    );
    const all = { ...this.tricks(), ...this.doggy() };
    const mine: Record<string, number> = {
      scratch: 0.6,
      sniff: 0.7,
      yip: 0.4,
      playBow: 1,
      pant: 0.6,
      yawn: 0.8,
      howl: 0.3,
      greet: 0.8,
      chaseFly: 0.5,
      beg: 0.3,
      tailChase: 0.5,
      zoomies: 0.8,
      dozeOff: 0.7,
      watch: 0.9,
      tilt: 0.8,
      circle: 0.6,
      sneeze: 0.4,
      shakeOff: 0.5,
      rollOver: 0.5,
      twirl: 0.5,
    };
    const common = this.commonActs();
    for (const k of ['idle', 'stroll', 'sit', 'nap', 'stand', 'stretch', 'startle'] as const) {
      this.acts[k] = common[k];
    }
    this.acts.lie = { ...common.lie, weight: 1.2 };
    this.acts.nap = { ...common.nap, weight: 2 };
    for (const [name, weight] of Object.entries(mine)) this.acts[name] = { ...all[name], weight };
    this.acts.love = all.love;
    this.acts.dizzy = { ...all.dizzy, weight: 0 };
    Object.assign(this.acts, this.moves());
  }

  private moves(): Record<string, Act> {
    const p = () => this.puppet;
    const stand = () => this.standing;
    return {
      // Crouches, quivering, every muscle ready, then goes. Over in a blink.
      windUp: {
        weight: 1,
        length: [5, 5],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.run.dir = this.roomy();
          this.run.phase = 0;
        },
        pose: (t) => {
          const r = this.run;
          if (t < 2.2) {
            const k = ramp(t, 0, 0.5);
            p().add('body', 14 * k);
            this.frontLegs(-45 * k);
            p().add('head', -12 * k);
            p().add('root', 0, 3 * k * sin(t, 14));
            this.extraLift = -0.05 * k;
            this.emote = 'focused';
            this.pupils = 1;
            this.lookAtFloor(this.s + r.dir * this.heightPx * 3);
          } else {
            if (r.phase === 0) {
              r.phase = 1;
              this.hop.kick(1.2);
              this.walkTo(this.s + r.dir * this.heightPx * 4, this.depth);
            }
            this.boost = 3;
            this.gallopPose(t);
            if (this.atStop && t > 2.8) this.endAct();
          }
        },
      },
      // Bursts of zoomies: flat out back and forth, bounding, with a rest between.
      zoomBurst: {
        weight: 1.8,
        length: [9, 9],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.run.phase = 0;
          this.go([this.somewhere(), this.somewhere(), this.somewhere()]);
        },
        pose: (t) => {
          const r = this.run;
          if (r.phase === 0) {
            this.boost = 3.6;
            this.gallopPose(t);
            if (this.atStop && t > 0.5) {
              r.phase = 1;
              r.at = t;
            }
          } else if (r.phase === 1) {
            // Panting, flanks heaving, a beat before the next burst.
            const w = t - r.at;
            this.mouth = 0.4 + 0.15 * sin(t, 4);
            p().add('body', 3 * sin(t, 4));
            this.emote = 'happy';
            if (w > 1.2) {
              r.phase = 2;
              this.go([this.somewhere(), this.somewhere(), this.somewhere()]);
            }
          } else {
            this.boost = 4;
            this.gallopPose(t);
            if (this.atStop && t > r.at + 2.2) this.endAct();
          }
        },
      },
      // One flat-out run along the floor and a skid to a stop.
      sprintPast: {
        weight: 1,
        length: [6, 6],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.run.dir = this.roomy();
          this.walkTo(this.s + this.run.dir * this.heightPx * 5, this.depth);
        },
        pose: (t) => {
          this.boost = 4;
          this.gallopPose(t);
          if (this.atStop && t > 0.8) {
            const k = ramp(t, 0, 0.1);
            p().add('body', -8 * k);
            this.endAct();
          }
        },
      },
      // Spent: flat on the back with all four long legs in the air, fast asleep ("roaching").
      roach: {
        weight: 1.6,
        length: [13, 13],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.run.phase = 0;
        },
        pose: (t) => {
          if (t < 1.2) {
            this.rollTarget = 5 * Math.sin(t * 10) * (t / 1.2);
            this.emote = 'sleepy';
          } else if (t < 11) {
            if (!this.run.done) {
              this.run.done = true;
              this.mouth = 0;
            }
            this.rollTarget = 180;
            this.trotting = false;
            this.emote = 'asleep';
            p().add('leg.FL', -55 + 4 * sin(t, 0.35), 0, 12);
            p().add('leg.FR', -55 - 4 * sin(t, 0.35), 0, -12);
            p().add('leg.BL', -45 - 5 * sin(t, 0.3), 0, 16);
            p().add('leg.BR', -45 + 5 * sin(t, 0.3), 0, -16);
            p().add('head', 14, 0, 8);
            p().add('ear.L', 0, 0, 20);
            p().add('ear.R', 0, 0, -20);
            this.mouth = 0.08 + 0.06 * sin(t, 0.5);
            // A dream: a leg twitches now and then.
            const twitches = Math.floor(t * 1.1);
            if (twitches > this.run.n) {
              this.run.n = twitches;
              p().kick('leg.BL', 300);
            }
          } else {
            this.rollTarget = 360;
            this.emote = 'surprised';
            this.pupils = 1;
          }
        },
      },
      // Shivers, teeth chattering: no meat on him to keep the cold out.
      shiver: {
        weight: 1,
        length: [4, 4],
        when: () => !this.walking,
        pose: (t) => {
          const k = ramp(t, 0, 0.3) * (1 - ramp(t, 3.4, 4));
          p().add('root', 0, 2.5 * k * sin(t, 16));
          p().add('body', 3 * k * sin(t, 13));
          p().add('head', 8 * k, 0, 2 * k * sin(t, 15));
          this.mouth = 0.12 * k * (0.5 + 0.5 * sin(t, 18));
          this.twitch(t, 8 * k, 14);
          this.emote = 'sad';
        },
      },
      // Reaches forward with the front legs and back with the hind, as long as he goes.
      longStretch: {
        weight: 0.9,
        length: [3.4, 3.4],
        when: stand,
        pose: (t) => {
          const k = pulse(t, 0.2, 3);
          p().add('body', 18 * k);
          this.frontLegs(-55 * k);
          p().add('leg.BL', 18 * k);
          p().add('leg.BR', 18 * k);
          p().add('head', -22 * k);
          this.mouth = 0.3 * k;
          this.emote = 'sleepy';
        },
      },
      // Sits tall and still like a statue, only the eyes moving.
      sitStatue: {
        weight: 1,
        length: [5, 7],
        when: () => !this.walking,
        start: () => (this.posture = 'sit'),
        pose: (t) => {
          p().add('head', -10, 0, 0);
          this.eyes = { x: 0.7 * sin(t, 0.25), y: -0.1 };
          this.pupils = 0.5;
        },
      },
    };
  }

  /** The body of a flat-out gallop: back arched and stretched, bounding, ears pinned. */
  private gallopPose(t: number) {
    const p = this.puppet;
    this.gallop = 1;
    const b = sin(t, 4.2);
    p.add('body', -4 + 6 * b);
    p.add('head', 10 - 6 * b);
    this.extraLift = 0.04 * Math.max(0, b);
    this.emote = 'happy';
    this.pupils = 1;
    this.mouth = 0.3;
  }

  protected idle(t: number) {
    this.gallop = 0;
    this.cuffs = this.cuffs.map((v) => v * 0.9);
    super.idle(t);
  }

  protected express(dt: number, env: Env, f: Feeling) {
    super.express(dt, env, f);
    // Rose ears lie back on the head; at a gallop they are pinned.
    const back = 28 + 20 * this.gallop;
    this.puppet.add('ear.L', back, 0, -10);
    this.puppet.add('ear.R', back, 0, 10);
  }

  protected after(dt: number, env: Env) {
    super.after(dt, env);
    const moving = clamp(this.stride / (this.heightPx * 0.8), 0, 1);
    const g = this.gait;
    [0, 1, 2, 3].forEach((i) => {
      const diag = i === 0 || i === 3 ? 0 : Math.PI;
      const step = Math.max(0, Math.sin(g + diag)) ** 3 * moving;
      const idle = 0.12 + 0.08 * Math.sin(env.time * 1.3 + i * 1.7);
      this.outfit?.dot(i, clamp(Math.max(step, this.cuffs[i], idle), 0, 1));
    });
    const happy = ['happy', 'love'].includes(this.expression) ? 0.5 : 0;
    this.outfit?.dot(4, clamp(0.3 + 0.3 * Math.sin(env.time * 4) + happy, 0, 1));
    this.outfit?.dot(5, clamp(0.35 + happy * 0.8, 0, 1));
    this.outfit?.beacon(BEACON[this.expression] ?? '#f4f4f1');
  }
}
