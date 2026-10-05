import type { Object3D } from 'three';
import { BEACON } from './bolt';
import type { Act, Env } from './character';
import { clamp } from './character';
import type { FaceLayout } from './face';
import { HOOF_ACT_MOODS, Hoofed, hoofFeels, hoofMoods } from './hooves';
import { pulse, ramp } from './kitties';
import { sin } from './moves';
import type { Anatomy } from './pet';

/**
 * Plod, the robot baby pygmy hippo: a round slate-green barrel on four stubby legs with a
 * big wide head, a huge hinged mouth with a lit tooth on each side of the lower jaw (Dot2
 * the left, Dot3 the right), tiny round ears that flick, and a pink belly. He is a hoofed
 * animal (hooves.ts) with a heavy, slow plod.
 *
 * His own tricks: a huge yawn (the jaw drops far wider than anyone's, the teeth light up),
 * ear flicks one after the other, a wade (slow, knees high, head low), sinking down to rest
 * with only his eyes and ears showing, three loud chomps, and a happy bounce on the spot.
 * A poke makes him gape wide in surprise; three make him dizzy.
 */
export const PYGMYHIPPO_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.25, 0.5],
    [0.75, 0.5],
  ],
  rx: 0.085,
  ry: 0.26,
  line: 0.04,
  mouth: null,
};

const HIPPO: Anatomy = {
  tail: ['tail.1', 'tail.2'],
  tailAxis: [0, -0.5, -0.8],
  earsHang: false,
  moods: hoofMoods(0),
  actMoods: {
    ...HOOF_ACT_MOODS,
    bigYawn: 'sleepy',
    earFlicks: 'curious',
    wade: 'calm',
    sink: 'sleepy',
    chomp: 'happy',
    bounce: 'happy',
    gape: 'alarmed',
  },
  lying: 'sleepy',
  hover: 'happy',
  drop: { stand: 0, sit: -0.09, lie: -0.12 },
  sit: -10,
  turn: 50,
};

export class PygmyHippo extends Hoofed {
  static readonly terms =
    'hippopotamus calf small tiny green grey gray mint slate pink belly big mouth jaw yawn teeth chomp wade mud heavy slow ears';

  protected readonly anatomy = HIPPO;
  protected readonly build = { middle: 0.27, spring: 0.55, speed: 0.8 };
  /** How wide the jaw is opened beyond the usual (0..1), and how lit the teeth are. */
  private gap = 0;
  private teeth = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Plod',
        model: 'pygmyhippo',
        metres: 0.43,
        width: 0.8,
        size: 0.95,
        feels: hoofFeels(2, {
          'ear.L': { f: 4, zeta: 0.25 },
          'ear.R': { f: 4, zeta: 0.25 },
          jaw: { f: 4, zeta: 0.55 },
        }),
        face: PYGMYHIPPO_FACE,
        eyes: 0.8,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.9 },
          { bone: 'body', yaw: 0.15, pitch: 0 },
        ],
        reach: { yaw: 55, pitch: 28 },
        lag: 0.9,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 0.75,
      },
      model,
    );
    this.fold = { front: [-70, 140], back: [-62, 125] };
    this.lieDrop = -0.1;
    this.reach = { head: 50, neck: 0, body: 8 };
    this.knee = 20;
    this.pokeAct = 'gape';
    this.adopt(
      {
        bigYawn: 2,
        earFlicks: 2,
        wade: 1.6,
        sink: 1.2,
        chomp: 1.4,
        bounce: 1.4,
        graze: 1,
        chew: 0.6,
        lie: 0.7,
        stand: 2,
        shake: 1,
        stamp: 0.6,
        toss: 0.6,
        tilt: 1,
        sneeze: 0.8,
        dozeOff: 0.8,
        circle: 0.5,
        watch: 0.8,
        zoomies: 0.4,
      },
      this.moves(),
      ['idle', 'stroll', 'nap', 'stretch', 'startle', 'sit'],
    );
  }

  private moves(): Record<string, Act> {
    const p = () => this.puppet;
    const end = () => this.actLength;
    return {
      // The huge yawn: head back, the jaw swings far wider than anyone else's, the teeth light.
      bigYawn: {
        weight: 0,
        length: [4.2, 4.2],
        when: () => this.still && this.posture !== 'lie',
        pose: (t) => {
          const k = pulse(t, 0.3, 3.6);
          const hold = Math.min(1, k * 1.6);
          this.mouth = hold;
          this.gap = hold;
          this.teeth = hold;
          p().add('head', -24 * hold);
          p().add('body', -5 * hold);
          p().add('ear.L', 0, 0, 22 * hold);
          p().add('ear.R', 0, 0, -22 * hold);
          this.emote = hold > 0.15 ? 'sleepy' : null;
        },
      },
      // A startled gape, wide and quick.
      gape: {
        weight: 0,
        length: [2, 2],
        start: () => {
          this.posture = 'stand';
          this.hop.kick(1.2);
        },
        pose: (t) => {
          const k = pulse(t, 0.05, 1.4);
          this.mouth = Math.min(1, k * 1.5);
          this.gap = this.mouth;
          this.teeth = this.mouth;
          p().add('head', -14 * k);
          p().add('ear.L', 0, 0, 30 * k);
          p().add('ear.R', 0, 0, -30 * k);
          this.emote = 'surprised';
        },
      },
      // Tiny ears flick one after another, quick as anything on such a big head.
      earFlicks: {
        weight: 0,
        length: [4, 4],
        when: () => this.still,
        pose: (t) => {
          const steps = [0.3, 0.75, 1.05, 1.7, 2.0, 2.2, 2.9];
          for (let i = 0; i < steps.length; i++) {
            const a = pulse(t, steps[i], 0.28);
            const left = i % 2 === 0;
            p().add(left ? 'ear.L' : 'ear.R', -18 * a, 0, (left ? -1 : 1) * 46 * a);
            if (a > 0.9 && this.run.n !== i + 1) {
              this.run.n = i + 1;
              p().kick(left ? 'ear.L' : 'ear.R', -300, 0, (left ? -1 : 1) * 700);
            }
          }
          const k = ramp(t, 0, 0.3) * (1 - ramp(t, 3.6, 4));
          p().add('head', 3 * k, 8 * sin(t, 0.3) * k, 4 * sin(t, 0.5) * k);
          this.emote = 'neutral';
          this.pupils = 0.8;
        },
      },
      // A wade: slow and heavy, the knees up, the head low, swaying a little to each step.
      wade: {
        weight: 0,
        length: [7, 7],
        when: () => this.standing,
        start: () => {
          const d = this.roomy();
          this.walkTo(this.s + d * this.heightPx * (1.8 + Math.random()), Math.random());
        },
        pose: (t) => {
          this.kneeLift = 40;
          this.boost = 0.55;
          const k = ramp(t, 0, 0.8);
          p().add('head', 16 * k, 4 * Math.sin(this.gait) * k);
          p().add('body', 3 * k);
          p().add('ear.L', 0, 0, -8 * k * sin(t, 0.8));
          p().add('ear.R', 0, 0, 8 * k * sin(t, 0.8, 0.5));
          this.emote = 'neutral';
          if (this.atStop && t > 1) this.endAct();
        },
      },
      // Sinks down to rest in the mud: lies right down with his chin on the floor, so that only
      // the eyes and the little ears show over the top, an ear flicking now and then; then up.
      sink: {
        weight: 0,
        length: [11, 11],
        when: () => this.standing,
        start: () => {
          this.posture = 'lie';
          this.run.done = false;
        },
        pose: (t) => {
          const L = end();
          const k = ramp(t, 0.6, 2.2);
          p().add('head', 14 * k);
          this.extraLift = -0.02 * k;
          this.emote = t > 2.6 && t < L - 2 ? 'sleepy' : 'happy';
          this.pupils = 0.4;
          const a = pulse(t, 4.5, 0.3) + pulse(t, 6.5, 0.3) + pulse(t, 7.2, 0.3);
          p().add('ear.L', 0, 0, -30 * a);
          p().add('head', 0, 2 * sin(t, 0.3) * k);
          if (t > L - 2.4 && !this.run.done) {
            this.run.done = true;
            this.setAct('stand');
          }
        },
      },
      // Three loud chomps, mouth wide, teeth flashing.
      chomp: {
        weight: 0,
        length: [3.4, 3.4],
        when: () => this.still && this.posture !== 'lie',
        pose: (t) => {
          const k = ramp(t, 0, 0.3) * (1 - ramp(t, 3, 3.4));
          const o = Math.max(0, Math.sin(t * 2 * Math.PI * 1.5 - 0.6)) ** 0.7;
          this.mouth = o * k;
          this.gap = o * k;
          this.teeth = o * k;
          p().add('head', (-10 * o + 6 * (1 - o)) * k);
          p().add('body', -2 * o * k);
          this.emote = 'happy';
          this.pupils = 0.9;
          const n = Math.floor(t * 1.5 + 0.1);
          if (o < 0.05 && n > this.run.n && t < 3) {
            this.run.n = n;
            this.hop.kick(0.35);
          }
        },
      },
      // A happy bounce on the spot, all four feet, ears flapping.
      bounce: {
        weight: 0,
        length: [3.6, 3.6],
        when: () => this.standing,
        pose: (t) => {
          const k = ramp(t, 0, 0.2) * (1 - ramp(t, 3, 3.6));
          const n = Math.floor(t * 1.8);
          if (n > this.run.n && t < 3.2) {
            this.run.n = n;
            this.hop.kick(1.0);
          }
          p().add('ear.L', 0, 0, -18 * k * Math.abs(sin(t, 0.9)));
          p().add('ear.R', 0, 0, 18 * k * Math.abs(sin(t, 0.9)));
          p().add('head', 0, 6 * k * sin(t, 0.9), 0);
          p().add('tail.1', 0, 20 * k * sin(t, 3));
          this.emote = 'happy';
          this.pupils = 1;
        },
      },
    };
  }

  protected idle(t: number) {
    this.gap = 0;
    this.teeth = 0;
    super.idle(t);
  }

  protected pose(dt: number, env: Env) {
    super.pose(dt, env);
    // The yawn goes wider than the shared jaw: add to it.
    if (this.puppet.has('jaw')) this.puppet.add('jaw', 22 * this.gap);
  }

  protected after(dt: number, env: Env) {
    super.after(dt, env);
    const o = this.outfit;
    if (!o) return;
    const asleep = this.mood === 'asleep' || this.posture === 'lie';
    const base = asleep ? 0.1 : 0.25 + 0.1 * Math.sin(env.time * 1.3);
    const level = clamp(base + 0.75 * this.teeth, 0, 1);
    o.dot(2, level);
    o.dot(3, level);
    o.beacon(BEACON[this.expression] ?? '#f4f4f1');
  }
}
