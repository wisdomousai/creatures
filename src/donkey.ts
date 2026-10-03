import type { Object3D } from 'three';
import { BEACON } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import type { Anatomy } from './pet';
import { HOOF_ACT_MOODS, Hoofed, hoofFeels, hoofMoods } from './hooves';
import { pulse, ramp } from './kitties';

/**
 * Dobbin, the robot donkey: a sturdy grey toy whose signature is a pair of very long upright
 * ears, each with a lit tip (Dot2 left, Dot3 right). He brays, hee and haw, head up, ears
 * pinned back and the tips pulsing with each note; he flicks his ears one at a time; he
 * sits down on his haunches and will not budge, however long it takes, until he decides to
 * get up; and he rolls on his back with his legs in the air for a lazy scratch.
 */
export const DONKEY_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.27, 0.5],
    [0.73, 0.5],
  ],
  rx: 0.08,
  ry: 0.22,
  line: 0.04,
  mouth: null,
};

const DONKEY: Anatomy = {
  tail: ['tail.1', 'tail.2', 'tail.3'],
  tailAxis: [0, -0.7, -0.7],
  earsHang: false,
  moods: hoofMoods(0),
  actMoods: {
    ...HOOF_ACT_MOODS,
    heehaw: 'happy',
    stubborn: 'annoyed',
    lazyRoll: 'happy',
    earFlick: 'curious',
  },
  lying: 'calm',
  hover: 'happy',
  drop: { stand: 0, sit: -0.16, lie: -0.2 },
  sit: -12,
  turn: 50,
};

export class Donkey extends Hoofed {
  protected readonly anatomy = DONKEY;
  protected readonly build = { middle: 0.55, spring: 0.7, speed: 1 };
  /** How loud the bray is, and how lit each ear tip is (left, right), 0..1. */
  private bray = 0;
  private tips = [0, 0];

  constructor(model: Object3D) {
    super(
      {
        name: 'Dobbin',
        model: 'donkey',
        metres: 1.1,
        width: 0.7,
        size: 1.35,
        feels: hoofFeels(3, { 'ear.L': { f: 2.2, zeta: 0.3 }, 'ear.R': { f: 2.2, zeta: 0.3 } }),
        face: DONKEY_FACE,
        eyes: 0.74,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.9 },
          { bone: 'body', yaw: 0.15, pitch: 0 },
        ],
        reach: { yaw: 55, pitch: 28 },
        lag: 0.8,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 0.8,
      },
      model,
    );
    this.fold = { front: [-72, 150], back: [-62, 125] };
    this.lieDrop = -0.2;
    this.reach = { head: 60, neck: 0, body: 12 };
    this.knee = 22;
    this.pokeAct = 'heehaw';
    this.adopt(
      {
        heehaw: 1.6,
        stubborn: 1.3,
        lazyRoll: 1,
        earFlick: 1.6,
        graze: 1.3,
        chew: 0.6,
        lie: 0.7,
        stand: 2,
        shake: 0.8,
        buck: 0.5,
        stamp: 0.7,
        toss: 0.6,
        yawn: 0.8,
        tilt: 1,
        sneeze: 0.6,
        dozeOff: 0.5,
        circle: 0.4,
        frontLip: 0.3,
        backWall: 0.4,
        watch: 0.6,
      },
      this.moves(),
      ['idle', 'stroll', 'nap', 'stretch', 'startle', 'sit'],
    );
  }

  private moves(): Record<string, Act> {
    const p = () => this.puppet;
    const stand = () => this.standing;
    return {
      // Hee-haw: head up, ears back, mouth wide, the tips lighting with each note.
      heehaw: {
        weight: 0,
        length: [4.4, 4.4],
        when: () => !this.walking && this.posture !== 'lie',
        pose: (t) => {
          const up = ramp(t, 0.1, 0.5) * (1 - ramp(t, 3.7, 4.2));
          // Four notes, in and out: hee (high), haw (low), hee, haw.
          const hee = pulse(t, 0.5, 0.5) + pulse(t, 1.9, 0.5);
          const haw = pulse(t, 1.05, 0.7) + pulse(t, 2.45, 0.7);
          const note = Math.min(1, hee + haw);
          this.bray = note;
          this.mouth = (0.35 + 0.45 * note) * up;
          this.tips[0] = Math.min(1, hee * 1.2 + 0.3 * haw);
          this.tips[1] = Math.min(1, haw * 1.2 + 0.3 * hee);
          p().add('head', (-30 - 6 * hee + 4 * haw) * up, 0, 5 * sin(t, 0.4) * up);
          this.neckAdd(-6 * up);
          p().add('body', (-5 - 2 * note) * up);
          p().add('ear.L', -12 * up, 0, 30 * up);
          p().add('ear.R', -12 * up, 0, -30 * up);
          p().add('tail.1', 0, 14 * note * sin(t, 7));
          this.emote = 'happy';
          this.pupils = 0.8;
          if ((hee > 0.9 || haw > 0.9) && this.run.phase === 0) {
            this.run.phase = 1;
            this.hop.kick(0.45);
          }
          if (hee < 0.1 && haw < 0.1) this.run.phase = 0;
        },
      },
      // The stubborn sit: down on his haunches, front legs braced, nose in the air. He will
      // not budge; then a glance, an ear flick, and he gets up as if it were his own idea.
      stubborn: {
        weight: 0,
        length: [11, 13],
        when: () => this.still && this.posture !== 'lie',
        start: () => {
          this.posture = 'sit';
          this.run.dir = Math.random() < 0.5 ? -1 : 1;
          this.run.done = false;
        },
        pose: (t) => {
          const L = this.actLength;
          const k = ramp(t, 0.3, 1) * (1 - ramp(t, L - 0.6, L));
          // Front legs braced straight out, chin up, head turned away.
          p().add('leg.FL', -14 * k);
          p().add('leg.FR', -14 * k);
          p().add('head', -14 * k, 34 * this.run.dir * k, 4 * this.run.dir * k);
          this.emote = t < L - 2.2 ? 'cross' : 'neutral';
          this.pupils = 0.5;
          // A snort or two while he refuses.
          const s = pulse(t, 3.5, 0.5) + pulse(t, 7, 0.5);
          p().add('head', -8 * s);
          this.mouth = 0.15 * s;
          // Ears pinned a little, one flicking.
          p().add('ear.L', 0, 0, 12 * k);
          p().add('ear.R', 0, 0, -12 * k);
          // The glance back, then he decides.
          if (t > L - 2.2 && t < L - 1.2) {
            p().add('head', 0, -34 * this.run.dir * ramp(t, L - 2.2, L - 1.8) * k, 0);
            this.tips[0] = this.tips[1] = 0.8;
          }
          if (t > L - 1.2 && !this.run.done) {
            this.run.done = true;
            this.posture = 'stand';
            this.hop.kick(0.8);
            p().kick('head', -200);
          }
        },
      },
      // A lazy roll: over on his back, hooves in the air, wiggling, then up again.
      lazyRoll: {
        weight: 0,
        length: [8, 8],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.run.dir = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          const d = this.run.dir;
          if (t < 1) {
            this.rollTarget = d * 10 * sin(t, 1) * ramp(t, 0, 1);
            p().add('head', 14 * ramp(t, 0, 0.8));
            this.emote = 'sleepy';
          } else if (t < 6.2) {
            this.rollTarget = d * 168;
            const w = ramp(t, 1.8, 2.4);
            p().add('leg.FL', -30 * w * sin(t, 0.9));
            p().add('leg.FR', -30 * w * sin(t, 0.9, 0.5));
            p().add('leg.BL', 24 * w * sin(t, 0.9, 0.25));
            p().add('leg.BR', 24 * w * sin(t, 0.9, 0.75));
            p().add('shin.FL', 30 * w);
            p().add('shin.FR', 30 * w);
            p().add('head', 0, 20 * sin(t, 0.4), 8 * sin(t, 0.7));
            p().add('tail.1', 0, 20 * sin(t, 1.2));
            this.emote = 'happy';
          } else {
            this.rollTarget = 0;
            if (!this.run.done) {
              this.run.done = true;
              this.hop.kick(1);
            }
            this.emote = 'surprised';
            p().add('head', 0, 22 * sin(t, 0.9) * (1 - ramp(t, 6.8, 7.8)));
          }
        },
      },
      // Flicks his ears one at a time, as if each had a mind of its own.
      earFlick: {
        weight: 0,
        length: [4.4, 4.4],
        when: () => this.still,
        pose: (t) => {
          const k = ramp(t, 0, 0.3) * (1 - ramp(t, 3.9, 4.4));
          const steps = [0.4, 1.1, 1.8, 2.3, 3.1];
          for (let i = 0; i < steps.length; i++) {
            const a = pulse(t, steps[i], 0.4);
            const left = i % 2 === 0;
            p().add(left ? 'ear.L' : 'ear.R', -14 * a, 0, (left ? -1 : 1) * 38 * a);
            this.tips[left ? 0 : 1] = Math.max(this.tips[left ? 0 : 1], a);
            if (a > 0.9 && this.run.n !== i + 1) {
              this.run.n = i + 1;
              p().kick(left ? 'ear.L' : 'ear.R', -260, 0, (left ? -1 : 1) * 600);
            }
          }
          p().add('head', 4 * k, 6 * sin(t, 0.3) * k, 5 * sin(t, 0.5) * k);
          this.emote = 'neutral';
          this.pupils = 0.7;
        },
      },
    };
  }

  protected idle(t: number) {
    this.bray = 0;
    this.tips = [0, 0];
    super.idle(t);
  }

  protected after(dt: number, env: Env) {
    super.after(dt, env);
    const o = this.outfit;
    if (!o) return;
    const asleep = this.mood === 'asleep' || this.posture === 'lie';
    const base = asleep ? 0.1 : 0.3 + 0.1 * Math.sin(env.time * 1.2);
    o.dot(2, clamp(base + this.tips[0], 0, 1));
    o.dot(3, clamp(base + this.tips[1], 0, 1));
    o.beacon(BEACON[this.expression] ?? '#f4f4f1');
  }
}
