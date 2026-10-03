import type { Object3D } from 'three';
import { BEACON } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import type { Anatomy } from './pet';
import { HOOF_ACT_MOODS, Hoofed, hoofFeels, hoofMoods } from './hooves';
import { pulse, ramp } from './kitties';

/**
 * Clover, the robot cow: a big, calm barrel of a toy with raised black patch plates, short
 * horns and a collar with a bell. Her nose plate is a speaker: when she moos the grille glows
 * and the sound (silently) rolls out with her head up. She chews the cud with her jaw going
 * sideways, lies down front end first and then the back (and gets up hind end first),
 * swats at a fly that isn't there with her tail, and rings her bell by shaking her head.
 *
 * Her tail tip glints (Dot0), her ear hinges (Dot1) and the grille glows (Dot2).
 */
export const COW_FACE: FaceLayout = {
  width: 512,
  height: 300,
  eyes: [
    [0.27, 0.5],
    [0.73, 0.5],
  ],
  rx: 0.07,
  ry: 0.25,
  line: 0.035,
  mouth: null,
};

const COW: Anatomy = {
  tail: ['tail.1', 'tail.2', 'tail.3'],
  tailAxis: [0, -0.7, -0.7],
  earsHang: false,
  moods: hoofMoods(),
  actMoods: { ...HOOF_ACT_MOODS, moo: 'happy', swat: 'annoyed', ring: 'happy' },
  lying: 'calm',
  hover: 'happy',
  drop: { stand: 0, sit: -0.14, lie: -0.2 },
  sit: -12,
  turn: 50,
};

export class Cow extends Hoofed {
  protected readonly anatomy = COW;
  protected readonly build = { middle: 0.45, spring: 0.55, speed: 0.8 };
  /** How loud the moo is right now, 0..1: the grille glows. */
  private speaker = 0;
  private bellWas: [number, number] = [0, 0];

  constructor(model: Object3D) {
    super(
      {
        name: 'Clover',
        model: 'cow',
        metres: 0.95,
        width: 0.8,
        size: 1.3,
        feels: hoofFeels(3, { bell: { f: 3, zeta: 0.15, r: 0.5 } }),
        face: COW_FACE,
        eyes: 0.79,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.9 },
          { bone: 'body', yaw: 0.15, pitch: 0 },
        ],
        reach: { yaw: 55, pitch: 28 },
        lag: 0.75,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [50, 110],
        speed: 0.8,
      },
      model,
    );
    this.fold = { front: [-72, 150], back: [-62, 125] };
    this.lieDrop = -0.2;
    this.reach = { head: 62, neck: 0, body: 12 };
    this.knee = 22;
    this.pokeAct = 'moo';
    this.adopt(
      {
        graze: 1.6,
        chew: 1.5,
        lie: 1.2,
        stand: 2,
        moo: 1.3,
        swat: 1.1,
        ring: 0.8,
        shake: 0.5,
        buck: 0.3,
        stamp: 0.5,
        toss: 0.5,
        yawn: 0.8,
        tilt: 0.7,
        sneeze: 0.4,
        dozeOff: 0.6,
        fallOver: 0.3,
        backWall: 0.3,
        frontLip: 0.3,
        circle: 0.3,
        zoomies: 0.3,
      },
      this.moves(),
    );
  }

  private moves(): Record<string, Act> {
    const p = () => this.puppet;
    return {
      // A moo: head up, the nose plate's grille glowing, the jaw dropping with it; a long one.
      moo: {
        weight: 0,
        length: [3.4, 3.4],
        when: () => !this.walking && this.posture !== 'sit',
        pose: (t) => {
          const k = pulse(t, 0.3, 2.6);
          const swell = k * (0.75 + 0.25 * sin(t, 2.4));
          this.speaker = swell;
          this.mouth = 0.65 * swell;
          p().add('head', this.posture === 'lie' ? -10 * k : -24 * k);
          p().add('body', -3 * k);
          this.neckAdd(-4 * k);
          p().add('ear.L', 0, 0, -10 * k);
          p().add('ear.R', 0, 0, 10 * k);
          this.emote = 'happy';
          if (t > 0.35 && !this.run.done) {
            this.run.done = true;
            this.hop.kick(0.4 * this.build.spring);
          }
        },
      },
      // Swats a fly that isn't there: the head turns to it, the tail whips across, again.
      swat: {
        weight: 0,
        length: [4.6, 4.6],
        when: () => !this.walking && this.posture !== 'sit',
        start: () => {
          this.run.dir = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          const d = this.run.dir;
          // The fly buzzes round her flank; her eyes and head follow it.
          const x = d * (0.6 + 0.3 * sin(t, 0.9));
          const y = 0.3 + 0.3 * sin(t, 1.3, 0.2);
          this.eyes = { x, y };
          const k = ramp(t, 0, 0.5) * (1 - ramp(t, 4, 4.6));
          p().add('head', 4 * k, 40 * d * k, 6 * d * k);
          p().add('body', 0, 0, 3 * d * k);
          const swing = Math.max(0, sin(t, 1.2, 0.05));
          const whip = swing * (t > 1 && t < 3.6 ? 1 : 0.25);
          p().add('tail.1', -25 * whip, -d * 55 * whip, 0);
          p().add('tail.2', 0, -d * 40 * whip, 0);
          p().add('tail.3', 0, -d * 35 * whip, 0);
          p().add('ear.L', 0, 0, 25 * Math.max(0, sin(t, 3.1)) * k);
          p().add('ear.R', 0, 0, -25 * Math.max(0, sin(t, 3.1, 0.3)) * k);
          this.emote = t > 3.6 ? 'happy' : 'focused';
          this.pupils = 0.9;
          if (t > 2.9 && !this.run.done) {
            this.run.done = true;
            p().kick('head', -120);
          }
        },
      },
      // Rings her bell on purpose: a nodding shake, the bell flashing.
      ring: {
        weight: 0,
        length: [2.4, 2.4],
        when: () => !this.walking && this.posture !== 'sit',
        pose: (t) => {
          const k = ramp(t, 0, 0.15) * (1 - ramp(t, 1.9, 2.4));
          p().add('head', 14 * k * sin(t, 3.4), 24 * k * sin(t, 1.7), 8 * k * sin(t, 3.4, 0.25));
          p().add('bell', 20 * k * sin(t, 3.4, 0.4));
          this.emote = 'happy';
        },
      },
    };
  }

  protected idle(t: number) {
    this.speaker = 0;
    super.idle(t);
  }

  protected pose(dt: number, env: Env) {
    super.pose(dt, env);
    // The bell hangs from the collar: it swings the other way from the head's turns, and
    // bobs with each step.
    const p = this.puppet;
    const [pitch, yaw] = p.current('head');
    const vy = (yaw - this.bellWas[1]) / Math.max(dt, 1e-3);
    const vp = (pitch - this.bellWas[0]) / Math.max(dt, 1e-3);
    this.bellWas = [pitch, yaw];
    const bob = this.walking ? 9 * Math.sin(this.gait * 2) : 0;
    p.add(
      'bell',
      clamp(vp * 0.18, -45, 45) + bob + 3 * Math.sin(env.time * 0.9),
      0,
      clamp(-vy * 0.2, -45, 45),
    );
  }

  protected after(dt: number, env: Env) {
    super.after(dt, env);
    const o = this.outfit;
    if (!o) return;
    const hum =
      this.mood === 'asleep' || this.posture === 'lie'
        ? 0.1
        : 0.25 + 0.08 * Math.sin(env.time * 1.3);
    o.dot(2, clamp(hum + this.speaker * 0.9, 0, 1));
    if (this.act === 'ring' && Math.sin(env.time * 21) > 0) o.beacon('#ffe17a');
    else o.beacon(BEACON[this.expression] ?? '#f4f4f1');
  }
}
