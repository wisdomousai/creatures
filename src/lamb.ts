import type { Object3D } from 'three';
import { BEACON } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import type { Anatomy } from './pet';
import { HOOF_ACT_MOODS, Hoofed, hoofFeels, hoofMoods } from './hooves';
import { pulse, ramp } from './kitties';

/**
 * Bobble, the robot lamb: a heap of chunky wool pods on short dark legs, a dark face with a big
 * screen, floppy ears and a wool topknot. Young and bouncy: she pronks (all four legs stiff,
 * boing, boing, boing), baas with her tail going like a windscreen wiper, twirls for joy, and
 * falls asleep standing up, head drooping, and tips over like a plank before she wakes with a
 * start and scrambles up again. Her lamp (Dot2, in her chest) glows with each baa.
 */
export const LAMB_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.29, 0.5],
    [0.71, 0.5],
  ],
  rx: 0.09,
  ry: 0.25,
  line: 0.04,
  mouth: null,
};

const LAMB: Anatomy = {
  tail: ['tail.1', 'tail.2'],
  tailAxis: [0, -0.7, -0.7],
  earsHang: true,
  moods: hoofMoods(6),
  actMoods: { ...HOOF_ACT_MOODS, pronk: 'happy', baa: 'happy', sleepTip: 'sleepy', twirl: 'happy' },
  lying: 'calm',
  hover: 'happy',
  drop: { stand: 0, sit: -0.08, lie: -0.12 },
  sit: -14,
  turn: 50,
};

export class Lamb extends Hoofed {
  protected readonly anatomy = LAMB;
  protected readonly build = { middle: 0.3, spring: 0.8, speed: 1 };
  /** How loud the baa is right now, 0..1: the lamp in her chest glows. */
  private lamp = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Bobble',
        model: 'lamb',
        metres: 0.58,
        width: 0.55,
        size: 0.95,
        feels: hoofFeels(2, { 'ear.L': { f: 2.4, zeta: 0.25 }, 'ear.R': { f: 2.4, zeta: 0.25 } }),
        face: LAMB_FACE,
        eyes: 0.76,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.9 },
          { bone: 'body', yaw: 0.15, pitch: 0 },
        ],
        reach: { yaw: 60, pitch: 30 },
        lag: 0.6,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 1,
      },
      model,
    );
    this.fold = { front: [-70, 150], back: [-65, 135] };
    this.lieDrop = -0.12;
    this.reach = { head: 62, neck: 0, body: 12 };
    this.knee = 30;
    this.pokeAct = 'baa';
    this.adopt(
      {
        pronk: 1.6,
        baa: 1.4,
        sleepTip: 1,
        twirl: 0.8,
        graze: 1,
        chew: 0.4,
        lie: 0.8,
        stand: 2,
        shake: 1,
        buck: 0.5,
        stamp: 0.4,
        toss: 0.5,
        yawn: 0.6,
        tilt: 1,
        sneeze: 0.5,
        dozeOff: 0.5,
        fallOver: 0.4,
        circle: 0.6,
        zoomies: 0.7,
        frontLip: 0.4,
        backWall: 0.4,
      },
      this.moves(),
    );
  }

  private moves(): Record<string, Act> {
    const p = () => this.puppet;
    const stand = () => this.standing;
    return {
      // Pronking: all four legs stiff and straight, bouncing on the spot (and a little way on).
      pronk: {
        weight: 0,
        length: [4.4, 4.4],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.run.n = 0;
          this.run.dir = this.roomy();
        },
        pose: (t) => {
          const k = ramp(t, 0, 0.2) * (1 - ramp(t, 3.8, 4.4));
          const beat = 0.62;
          const n = Math.floor(t / beat);
          if (t < 3.9 && n >= this.run.n) {
            this.run.n = n + 1;
            this.hop.kick(2.3 * this.build.spring);
            if (n % 2 === 1 && n < 7)
              this.walkTo(this.s + this.run.dir * this.heightPx * 0.4, this.depth);
          }
          this.boost = 0.5;
          // Stiff legs: splayed a little in the air, the front pair forward, the back pair back.
          const air = Math.max(0, Math.sin((t / beat) * Math.PI)) * k;
          p().add('leg.FL', -16 * air);
          p().add('leg.FR', -16 * air);
          p().add('leg.BL', 16 * air);
          p().add('leg.BR', 16 * air);
          p().add('head', -10 * air, 0, 4 * sin(t, 1.6));
          p().add('ear.L', 0, 0, -28 * air);
          p().add('ear.R', 0, 0, 28 * air);
          p().add('tail.1', -12 * air, 12 * sin(t, 3.2));
          this.mouth = 0.2 * air;
          this.emote = 'happy';
          this.pupils = 1;
        },
      },
      // A baa, or two: head up, mouth open, lamp lit, and the whole tail wagging.
      baa: {
        weight: 0,
        length: [3, 3],
        when: () => !this.walking && this.posture !== 'sit',
        pose: (t) => {
          const k = pulse(t, 0.2, 0.9) + 0.8 * pulse(t, 1.35, 1);
          this.lamp = Math.min(1, k);
          this.mouth = 0.6 * Math.min(1, k);
          p().add('head', this.posture === 'lie' ? -8 * k : -20 * k);
          p().add('body', -3 * k);
          p().add('tail.1', 0, 34 * Math.min(1, k) * sin(t, 7));
          p().add('tail.2', 0, 30 * Math.min(1, k) * sin(t, 7, -0.15));
          p().add('ear.L', 0, 0, -16 * k);
          p().add('ear.R', 0, 0, 16 * k);
          this.emote = 'happy';
          if (t > 0.25 && !this.run.done) {
            this.run.done = true;
            this.hop.kick(0.7 * this.build.spring);
          }
        },
      },
      // Falls asleep on her feet, nods, tips over like a plank, sleeps, wakes with a start.
      sleepTip: {
        weight: 0,
        length: [9, 9],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.run.dir = Math.random() < 0.5 ? -1 : 1;
          this.run.phase = 0;
        },
        pose: (t) => {
          const d = this.run.dir;
          const drowsy = ramp(t, 0.3, 2.8);
          if (t < 3.2) {
            p().add('head', 38 * drowsy + 5 * sin(t, 0.8) * drowsy);
            p().add('body', 7 * drowsy);
            this.emote = t > 1.8 ? 'asleep' : 'sleepy';
            // A nod: she catches herself, twice.
            if ((t > 1.2 && this.run.phase === 0) || (t > 2 && this.run.phase === 1)) {
              this.run.phase++;
              p().kick('head', -260);
              this.hop.kick(0.4);
            }
            for (const s of ['FL', 'FR', 'BL', 'BR'])
              p().add(`shin.${s}`, 6 * drowsy * Math.sin(t * 3 + s.length));
          } else if (t < 6.6) {
            // Over she goes, stiff as a plank, and lies there breathing.
            this.rollTarget = d * 86;
            this.emote = 'asleep';
            p().add('head', 8 + 2 * sin(t, 0.3));
            for (const s of ['FL', 'FR', 'BL', 'BR']) p().add(`leg.${s}`, -10);
            this.trotting = false;
          } else {
            if (this.run.phase < 3) {
              this.run.phase = 3;
              this.hop.kick(1.4);
              p().kick('head', -300);
            }
            this.rollTarget = 0;
            this.emote = t < 7.4 ? 'surprised' : 'neutral';
            this.pupils = 1;
            p().add('head', 0, 24 * sin(t, 0.9) * (1 - ramp(t, 7.4, 8.8)));
            if (t < 7.4) p().add('leg.FL', -30 * sin(t, 4));
          }
        },
      },
      // A twirl for joy: a hop and a spin on the spot.
      twirl: {
        weight: 0,
        length: [1.5, 1.5],
        when: stand,
        start: () => {
          this.spin = 1;
          this.hop.kick(1.4 * this.build.spring);
        },
        pose: () => {
          this.emote = 'happy';
          p().add('head', 6, -16);
          p().add('tail.1', 0, 25 * sin(this.actT, 6));
        },
      },
    };
  }

  protected idle(t: number) {
    this.lamp = 0;
    super.idle(t);
  }

  protected after(dt: number, env: Env) {
    super.after(dt, env);
    const o = this.outfit;
    if (!o) return;
    const quiet =
      this.mood === 'asleep' || this.posture === 'lie'
        ? 0.1
        : 0.25 + 0.1 * Math.sin(env.time * 1.5);
    o.dot(2, clamp(quiet + this.lamp, 0, 1));
    o.beacon(BEACON[this.expression] ?? '#f4f4f1');
  }
}
