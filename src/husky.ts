import type { Object3D } from 'three';
import { BEACON } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import type { Anatomy } from './pet';
import { DOG_ACT_MOODS, dogMoods, Hound } from './dogs';
import { pulse, ramp } from './kitties';

/**
 * Koda, the robot husky: a grown sled dog, thick ruff, tail curled over her back, in a
 * red harness with a trace trailing behind. She talks: she sits and goes "woo-woo-woooo"
 * with her head back, and she answers to being looked at with a string of grumbles.
 * She digs holes in the floor and pops up out of them delighted, pulls across the box as
 * if there were a sled behind her (the trace pulls taut, her chest goes down, her legs
 * dig in), and goes on strike halfway across the floor, lying down and refusing to move.
 *
 * Her eyes are ice-blue goggle rings that flash with every woo; the lamp on her
 * harness lights as she pulls.
 */
export const HUSKY_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.29, 0.5],
    [0.71, 0.5],
  ],
  rx: 0.08,
  ry: 0.25,
  line: 0.035,
  mouth: null,
};

const HUSKY: Anatomy = {
  tail: ['tail.1', 'tail.2', 'tail.3'],
  tailAxis: [0, 0.75, 0.66],
  earsHang: false,
  moods: dogMoods(0),
  actMoods: {
    ...DOG_ACT_MOODS,
    woowoo: 'happy',
    chat: 'curious',
    sledPull: 'happy',
    digSnow: 'happy',
    stubborn: 'annoyed',
  },
  lying: 'calm',
  hover: 'happy',
  drop: { stand: 0, sit: -0.17, lie: -0.24 },
  sit: -22,
  turn: 55,
};

export class Husky extends Hound {
  static readonly terms =
    'doggo pooch sled arctic snow grey gray silver white fluffy ruff curled tail red harness blue eyes ice howl woo dig pull';

  protected readonly anatomy = HUSKY;
  protected readonly build = { middle: 0.4, spring: 1, speed: 1.5 };
  /** How hard she is pulling, 0..1: the trace goes taut, the harness lamp lights. */
  private pull = 0;
  /** A flash of the ice-blue eyes (with each woo). */
  private eyeFlash = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Koda',
        model: 'husky',
        metres: 0.86,
        width: 0.75,
        size: 1.0,
        feels: {
          default: { f: 2, zeta: 0.55 },
          root: { f: 2.8, zeta: 0.55 },
          body: { f: 1.8, zeta: 0.65 },
          head: { f: 1.8, zeta: 0.5, r: 0.3 },
          jaw: { f: 6, zeta: 0.5 },
          'ear.L': { f: 3, zeta: 0.25 },
          'ear.R': { f: 3, zeta: 0.25 },
          'tail.1': { f: 4, zeta: 0.45 },
          'tail.2': { f: 4, zeta: 0.4 },
          'tail.3': { f: 4, zeta: 0.35 },
          'trace.1': { f: 2.5, zeta: 0.35 },
          'trace.2': { f: 3, zeta: 0.3 },
        },
        face: HUSKY_FACE,
        eyes: 0.78,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.9 },
          { bone: 'body', yaw: 0.2, pitch: 0 },
        ],
        reach: { yaw: 60, pitch: 30 },
        lag: 0.9,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 1.5,
      },
      model,
    );
    this.floppy = 0.3;
    const all = { ...this.tricks(), ...this.doggy() };
    const mine: Record<string, number> = {
      scratch: 0.6,
      sniff: 0.8,
      yip: 0.3,
      playBow: 0.8,
      pant: 0.8,
      yawn: 0.6,
      tilt: 0.8,
      watch: 0.8,
      greet: 0.9,
      dig: 0.5,
      chaseFly: 0.4,
      twirl: 0.5,
      rollOver: 0.9,
      tailChase: 0.3,
      zoomies: 0.8,
      dozeOff: 0.5,
      backWall: 0.5,
      frontLip: 0.5,
      circle: 0.5,
      sneeze: 0.4,
      shakeOff: 0.8,
      beg: 0.3,
      bell: 0.4,
    };
    const common = this.commonActs();
    for (const k of ['idle', 'stroll', 'sit', 'nap', 'stand', 'stretch', 'startle'] as const) {
      this.acts[k] = common[k];
    }
    this.acts.lie = { ...common.lie, weight: 0.5 };
    for (const [name, weight] of Object.entries(mine)) this.acts[name] = { ...all[name], weight };
    this.acts.love = all.love;
    this.acts.dizzy = { ...all.dizzy, weight: 0 };
    Object.assign(this.acts, this.moves());
  }

  private moves(): Record<string, Act> {
    const p = () => this.puppet;
    const stand = () => this.standing;
    return {
      // Sits, head back, and goes "woo-woo-wooooo", the eyes flashing with each note.
      woowoo: {
        weight: 2,
        length: [6.5, 6.5],
        when: () => this.still,
        start: () => (this.posture = 'sit'),
        pose: (t) => {
          const notes = [
            [0.6, 0.7, 0.8],
            [1.6, 0.7, 0.95],
            [2.6, 2.6, 1],
          ];
          let note = 0;
          for (const [at, len, power] of notes) note = Math.max(note, pulse(t, at, len) * power);
          const raise = ramp(t, 0, 0.5) * (1 - ramp(t, 5.6, 6.3));
          p().add('head', (-24 - 24 * note) * raise + 3 * sin(t, 5) * note);
          p().add('body', -4 * note * raise);
          this.mouth = 0.55 * note * (0.85 + 0.15 * sin(t, 7));
          this.eyeFlash = Math.max(this.eyeFlash, note);
          this.emote = note > 0.3 ? 'happy' : 'neutral';
          this.eyes = { x: 0, y: -1 };
          p().add('ear.L', 8 * note, 0, 0);
          p().add('ear.R', 8 * note, 0, 0);
        },
      },
      // Answers back: little bursts of grumbling, the head going side to side.
      chat: {
        weight: 1.8,
        length: [5, 5],
        when: () => this.still,
        start: () => {
          this.run.dir = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          const bursts =
            pulse(t, 0.3, 0.9) + pulse(t, 1.5, 1.1) + 0.8 * pulse(t, 3.0, 0.7) + pulse(t, 3.9, 0.8);
          const o = this.others()[0];
          if (o) this.lookAtMate(o, 0.5);
          this.mouth = clamp(bursts, 0, 1) * (0.25 + 0.3 * Math.max(0, sin(t, 7)));
          p().add(
            'head',
            -6 * bursts,
            10 * sin(t, 1.3) * this.run.dir,
            8 * sin(t, 1.3, 0.25) * bursts,
          );
          p().add('body', 2 * bursts);
          this.eyeFlash = Math.max(this.eyeFlash, bursts * 0.5);
          this.emote = bursts > 0.2 ? 'cross' : 'neutral';
          this.pupils = 0.8;
        },
      },
      // Hauls across the floor with a sled behind her: chest low, legs digging in, trace taut.
      sledPull: {
        weight: 1.8,
        length: [7, 7],
        when: stand,
        start: () => {
          this.posture = 'stand';
          const way = this.roomy();
          this.go([
            { s: this.s + way * this.heightPx * 3.2, depth: this.depth },
            { s: this.s + way * this.heightPx * 1.2, depth: Math.min(0.9, this.depth + 0.3) },
          ]);
        },
        pose: (t) => {
          const k = ramp(t, 0, 0.8) * (1 - ramp(t, 6.2, 7));
          this.pull = k;
          this.boost = 1.1 * k + (1 - k);
          p().add('body', 13 * k);
          p().add('head', 10 * k);
          this.extraLift = -0.025 * k;
          this.mouth = 0.25 * k;
          this.emote = 'determined';
          this.pupils = 1;
          if (this.atStop && t > 1) this.endAct();
        },
      },
      // Digs a hole, nose and then head down in it, and pops up shaking snow off her ears.
      digSnow: {
        weight: 1.4,
        length: [7.5, 7.5],
        when: stand,
        start: () => (this.posture = 'stand'),
        pose: (t) => {
          const dig = ramp(t, 0, 0.4) * (1 - ramp(t, 3.6, 4));
          const a = sin(t, 3.4);
          p().add('body', 16 * dig);
          p().add('head', 30 * dig + 5 * sin(t, 3.4) * dig);
          p().add('leg.FL', (-34 + 52 * a) * dig);
          p().add('leg.FR', (-34 - 52 * a) * dig);
          p().add('tail.1', 14 * dig);
          this.extraLift = -0.02 * dig;
          this.emote = 'focused';
          if (t > 3.8 && !this.run.done) {
            this.run.done = true;
            this.hop.kick(1.5);
            p().kick('head', -420);
          }
          if (t > 3.8) {
            const s = pulse(t, 4.2, 1.2);
            p().add('head', 0, 28 * s * sin(t, 5), 8 * s * sin(t, 5, 0.25));
            p().add('ear.L', 0, 0, -30 * s * sin(t, 5));
            p().add('ear.R', 0, 0, 30 * s * sin(t, 5));
            p().add('root', 0, 12 * s * sin(t, 5));
            this.emote = t < 4.3 ? 'surprised' : 'happy';
            this.mouth = 0.3;
          }
        },
      },
      // On strike: strolls off, flops down mid-floor, looks away, and refuses to be moved.
      stubborn: {
        weight: 1.2,
        length: [9, 9],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.run.dir = this.roomy();
          this.walkTo(this.s + this.run.dir * this.heightPx * 1.8, this.depth);
        },
        pose: (t) => {
          if (t > 1.8 && this.run.phase === 0) {
            this.run.phase = 1;
            this.goal = null;
            this.posture = 'lie';
            this.hop.kick(0.4);
          }
          if (this.run.phase === 1) {
            const k = ramp(t, 2, 2.6) * (1 - ramp(t, 8.2, 9));
            p().add('head', 4 * k, -this.run.dir * 38 * k);
            this.eyes = { x: -this.run.dir, y: 0.1 };
            const grumble = pulse(t, 4, 0.8) + pulse(t, 6.3, 0.9);
            this.mouth = 0.18 * grumble * (0.5 + 0.5 * Math.max(0, sin(t, 8)));
            p().add('ear.L', -12 * k, 0, 0);
            p().add('ear.R', -12 * k, 0, 0);
            this.emote = 'cross';
            if (t > 8.4) this.posture = 'stand';
          }
        },
      },
    };
  }

  protected idle(t: number) {
    this.pull = 0;
    this.eyeFlash *= 0.9;
    super.idle(t);
  }

  protected pose(dt: number, env: Env) {
    super.pose(dt, env);
    const p = this.puppet;
    // The trace trails behind her: it sways as she walks and goes taut when she pulls.
    const moving = Math.min(1, this.stride / (this.heightPx * 0.8));
    p.add('trace.1', -8 * moving * Math.abs(Math.sin(this.gait)) - 55 * this.pull);
    p.add('trace.2', -6 * moving - 20 * this.pull);
    p.add('trace.1', 0, 6 * moving * Math.sin(this.gait));
  }

  protected after(dt: number, env: Env) {
    super.after(dt, env);
    // The ice-blue eyes glow steadily, brighter when she is pleased, and flash with a woo.
    const glad = this.mood === 'happy' || this.mood === 'love' ? 0.25 : 0;
    const sleepy = this.mood === 'asleep' || this.mood === 'sleepy' ? -0.25 : 0;
    const level = clamp(0.6 + glad + sleepy + this.eyeFlash * 0.4, 0, 1);
    this.outfit?.dot(0, level);
    this.outfit?.dot(1, level);
    this.outfit?.dot(2, clamp(0.25 + 0.2 * Math.sin(env.time * 2) + this.pull * 0.8, 0, 1));
    this.outfit?.beacon(BEACON[this.expression] ?? '#f4f4f1');
  }
}
