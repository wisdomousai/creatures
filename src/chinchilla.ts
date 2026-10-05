import type { Object3D } from 'three';
import { BEACON } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import { ease, Fluffy, span } from './fluffy';
import { Spring } from './spring';

/**
 * Dusty, the robot chinchilla: two huge round dish ears with lit rims (they swivel one after
 * the other when he listens), big dark screen eyes, a plump grey body with a cream belly
 * plate, long hind legs, and a long tail of stacked rings whose three middle rings are
 * lights that ripple from the root out when he's pleased.
 *
 * His own tricks: a dust bath (soft pods of light puff up round him, a toy on bones of its
 * own, while he rolls from one side to the other, kicking, the pods drifting up and
 * fading), popcorn (he hops straight up like a kernel, ears out, legs tucked, and again at
 * unpredictable moments), sitting bolt upright nibbling with both paws, listening with the
 * dishes, and rippling his tail. The rest is the fluffy base's: yawns, sniffs, head tilts,
 * a scratch, a shake, spinning, rearing up.
 */
export const CHINCHILLA_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.29, 0.5],
    [0.71, 0.5],
  ],
  rx: 0.105,
  ry: 0.38,
  line: 0.035,
  mouth: null,
  pupil: 0.62,
};

const PUFFS = 5;

export class Chinchilla extends Fluffy {
  static readonly terms =
    'rodent fluffy soft grey gray silver white cream big round ears dish belly long tail rings dust bath popcorn hops listens';

  private puffs = Array.from({ length: PUFFS }, () => new Spring(5, 0.45, 1.3));
  private puffGoal = 0;
  private rollA = new Spring(2.2, 0.6, 1.2);
  private rollGoal = 0;
  private wave = 0;
  private radar = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Dusty',
        model: 'chinchilla',
        metres: 0.41,
        width: 0.3,
        size: 0.75,
        face: CHINCHILLA_FACE,
        eyes: 0.6,
        tail: ['tail.1', 'tail.2', 'tail.3', 'tail.4'],
        tailAxis: [0, 0.3, -1],
        sit: -52,
        drop: { sit: -0.06, lie: -0.07 },
        speed: 1.3,
        lag: 0.9,
        feels: { 'ear.L': { f: 4.5, zeta: 0.3 }, 'ear.R': { f: 4.5, zeta: 0.3 } },
        moods: { calm: { wag: [5, 0.3], carriage: -4 }, happy: { carriage: 20 } },
        actMoods: {
          dustBath: 'happy',
          popcorn: 'happy',
          nibble: 'calm',
          listen: 'curious',
          ripple: 'happy',
        },
      },
      model,
    );
    this.dotCount = 1;
    this.acts = { ...this.acts, ...this.mine() };
  }

  private mine(): Record<string, Act> {
    const p = this.puppet;
    return {
      dustBath: {
        // Dust pods puff up round him; he rolls onto one side, rubs, over to the other, kicking.
        weight: 1.3,
        length: [8, 8],
        when: this.standing,
        pose: (t) => {
          this.puffGoal = ease(t, 0.3, 1.2) * (1 - ease(t, 6.2, 7.6));
          const down = ease(t, 0.6, 1.4) * (1 - ease(t, 6.4, 7.2));
          this.want.low = 0.07 * down;
          const side = Math.sin(((t - 1.2) / 2.2) * Math.PI);
          this.rollGoal = (t > 1.2 && t < 6.6 ? 62 * side : 0) * down;
          const kick = Math.sin(t * 2 * Math.PI * 4) * down;
          p.add('leg.BL', 30 * kick);
          p.add('leg.BR', -30 * kick);
          p.add('leg.FL', 22 * -kick);
          p.add('leg.FR', 22 * kick);
          p.add('head', 6 * down, 22 * Math.sin(t * 2 * Math.PI * 1.2) * down);
          p.add('ear.L', 10 * kick * down, 0, -14 * down);
          p.add('ear.R', 10 * kick * down, 0, 14 * down);
          this.anatomy.tail.forEach((b, i) =>
            p.add(b, 0, 18 * Math.sin(t * 2 * Math.PI * 2.2 - i) * down),
          );
        },
      },
      popcorn: {
        // Pops straight up like a kernel, again and again, never twice the same.
        weight: 1.3,
        length: [5.5, 5.5],
        when: this.standing,
        start: () => (this.hops = 0),
        pose: (t) => {
          const times = [0.5, 1.2, 1.7, 2.6, 3.0, 3.9, 4.6];
          while (this.hops < times.length && t > times[this.hops])
            (this.hop.kick(this.hops % 3 === 2 ? 4.2 : 3.2 + (this.hops % 2) * 0.5), this.hops++);
          const air = clamp(this.hop.y / 0.05, 0, 1);
          p.add('leg.FL', -45 * air);
          p.add('leg.FR', -45 * air);
          p.add('leg.BL', 35 * air);
          p.add('leg.BR', 35 * air);
          p.add('ear.L', -25 * air, 0, -20 * air);
          p.add('ear.R', -25 * air, 0, 20 * air);
          p.add('body', -10 * air, 0, 8 * Math.sin(this.hops * 2.3) * air);
          this.anatomy.tail.forEach((b) => p.add(b, 20 * air));
        },
      },
      nibble: {
        // Sits bolt upright and nibbles, both paws to his mouth, dishes twitching.
        weight: 1.2,
        length: [5, 7],
        when: this.still,
        start: () => (this.posture = 'sit'),
        pose: (t) => {
          const k = span(t, 0.3, 0.8, this.actLength - 0.8, this.actLength - 0.3);
          const chew = Math.max(0, sin(t, 6));
          p.add('head', k * (8 + 5 * chew));
          p.add('leg.FL', -25 * k, 0, -8 * k);
          p.add('leg.FR', -25 * k, 0, 8 * k);
          p.add('ear.L', 0, 0, -8 * chew * k);
          p.add('ear.R', 0, 0, 8 * chew * k);
          if (Math.floor(t / 1.7) % 2) p.add('head', 0, 0, 5 * k);
        },
      },
      listen: {
        // The dishes swivel, one then the other, the rims flashing.
        weight: 1,
        length: [4, 5],
        when: this.still,
        pose: (t) => {
          const k = span(t, 0.3, 0.7, this.actLength - 0.7, this.actLength - 0.3);
          p.add('ear.L', 10 * k, 38 * sin(t, 0.6) * k, 6 * k);
          p.add('ear.R', 10 * k, -38 * sin(t, 0.6, 0.35) * k, -6 * k);
          p.add('head', 4 * k, 18 * sin(t, 0.3) * k);
          this.radar = k * (Math.sin(t * 14) > 0 ? 1 : 0.2);
        },
      },
      ripple: {
        // A wave of light runs out his tail, which curls and uncurls.
        weight: 0.8,
        length: [3.5, 4],
        when: this.still,
        pose: (t) => {
          const k = span(t, 0.2, 0.6, this.actLength - 0.6, this.actLength - 0.2);
          this.wave = k;
          p.add('tail.1', 22 * k * Math.sin(t * 2 * Math.PI * 1.1));
          p.add('tail.2', 28 * k * Math.sin(t * 2 * Math.PI * 1.1 - 0.7));
          p.add('tail.3', 32 * k * Math.sin(t * 2 * Math.PI * 1.1 - 1.4));
          p.add('tail.4', 36 * k * Math.sin(t * 2 * Math.PI * 1.1 - 2.1));
          p.add('head', 0, -16 * k, 6 * k);
        },
      },
    };
  }

  /** Bolt upright on his haunches, paws held up. */
  protected sitting() {
    super.sitting();
    this.puppet.add('leg.FL', -88, 0, -8);
    this.puppet.add('leg.FR', -88, 0, 8);
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    // The dust pods: up, drifting, fading.
    this.puffs.forEach((sp, i) => {
      const u = sp.update(
        dt,
        this.puffGoal * (0.55 + 0.45 * Math.sin(i * 1.7 + env.time * 3) ** 2),
      );
      const s = Math.max(0.001, u * 1.5);
      const bone = `puff.${i + 1}`;
      p.shift(bone, 0, 0.05 * u + 0.02 * Math.sin(env.time * 2 + i), 0);
      p.stretch(bone, s, [0, 1, 0], s);
    });
    this.puffGoal = 0;
    const r = this.rollA.update(dt, this.rollGoal);
    this.rollGoal = 0;
    if (Math.abs(r) > 0.1) p.turn('body', 0, 0, r);
    super.after(dt, env);
  }

  protected lights(time: number) {
    const o = this.outfit;
    const m = this.mood;
    let ear = 0.45 + 0.1 * Math.sin(time * 0.9);
    let tone: string | undefined;
    if (m === 'asleep') ear = 0.1 + 0.15 * (0.5 + 0.5 * Math.sin(time * 1.1));
    else if (m === 'sleepy') ear = 0.3;
    else if (m === 'love') [ear, tone] = [0.8 + 0.2 * Math.sin(time * 5), BEACON.love];
    else if (m === 'happy') [ear, tone] = [0.9, BEACON.happy];
    else if (m === 'alarmed') [ear, tone] = [Math.sin(time * 30) > 0 ? 1 : 0.3, BEACON.surprised];
    else if (m === 'curious') ear = 0.9;
    if (this.radar) [ear, tone] = [this.radar, BEACON.focused];
    this.radar = 0;
    o.dot(0, clamp(ear, 0, 1), tone);
    // The tail rings: a slow ripple at rest, a quick run of light in the ripple.
    const run = (i: number) =>
      this.wave > 0
        ? Math.max(0, Math.sin(time * 9 - i * 1.3)) ** 2 * this.wave
        : 0.12 + 0.3 * Math.max(0, Math.sin(time * 1.2 - i * 0.9)) ** 8;
    for (let i = 1; i <= 3; i++)
      o.dot(i, clamp(m === 'asleep' ? 0.03 : run(i), 0, 1), this.wave ? BEACON.happy : tone);
    this.wave = 0;
    const dust = clamp(this.puffs[0].y * 0.9, 0, 1);
    o.dot(4, dust, '#bfe6ff');
  }
}
