import type { Object3D } from 'three';
import { BEACON } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import { ease, Fluffy, pulse, span } from './fluffy';
import { Spring } from './spring';

/**
 * Bao, the robot panda cub: a round white body on short black legs, black ears, a black
 * visor plate round the screen face and a lamp in the belly. He is round and a bit clumsy,
 * which is the whole act.
 *
 * His tricks: a forward somersault (a head-over-heels roll, tucked, landing sat up and
 * pleased with himself), sitting up like a person with a stalk of bamboo in both paws and
 * munching it down (the stalk is a toy on a bone of its own with a light in each joint, put
 * away otherwise), and, sitting, wobbling and tipping over sideways, kicking his legs in the
 * air before he rocks himself back upright. The rest is the fluffy base's (fluffy.ts).
 */
export const PANDA_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.29, 0.5],
    [0.71, 0.5],
  ],
  rx: 0.1,
  ry: 0.3,
  line: 0.036,
  mouth: null,
};

export class Panda extends Fluffy {
  static readonly terms =
    'bear cub black white round chubby clumsy bamboo munching somersault roll tumble wobbles ears visor sits cuddly plush short legs';

  private stalk = new Spring(5, 0.5, 1.2);
  private stalkGoal = 0;
  /** How much of the stalk is left (1 whole, 0.3 a stub). */
  private left = 1;
  private chew = 0;
  /** Which way he tips over or rolls (+1 his left). */
  private side = 1;
  private somersault = 0;
  private roll = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Bao',
        model: 'panda',
        metres: 0.42,
        width: 0.34,
        size: 0.8,
        face: PANDA_FACE,
        eyes: 0.69,
        tail: ['tail.1'],
        tailAxis: [0, 0.2, -1],
        sit: -30,
        drop: { sit: -0.05, lie: -0.07 },
        speed: 0.95,
        lag: 1.15,
        moods: { calm: { bob: [2, 0.15] }, happy: { wag: [10, 1.6] } },
        actMoods: { somersault: 'happy', munch: 'calm', tipOver: 'happy' },
      },
      model,
    );
    this.dotCount = 0;
    this.acts = { ...this.acts, ...this.mine() };
  }

  private mine(): Record<string, Act> {
    const p = this.puppet;
    const floor = () => !this.walking && this.edge === 'bottom';
    return {
      somersault: {
        // A crouch, a tuck, a forward roll right round the hips, and up again sat on his bottom.
        weight: 1.3,
        length: [5, 5],
        when: floor,
        start: () => (this.posture = 'stand'),
        pose: (t) => {
          const roll = ease(t, 1.1, 2.3);
          const crouch = span(t, 0.2, 0.9, 1.0, 1.2);
          const tuck = span(t, 1.0, 1.4, 2.0, 2.5);
          this.somersault = roll;
          this.want.low = 0.04 * crouch;
          p.add('head', 14 * crouch + 50 * tuck);
          p.add('leg.FL', -30 * crouch + 100 * tuck);
          p.add('leg.FR', -30 * crouch + 100 * tuck);
          p.add('leg.BL', 20 * crouch - 110 * tuck);
          p.add('leg.BR', 20 * crouch - 110 * tuck);
          p.add('ear.L', 0, 0, -16 * tuck);
          p.add('ear.R', 0, 0, 16 * tuck);
          // Up: sat on his bottom, arms up, a little bounce.
          const sat = span(t, 2.4, 2.9, 4.2, 4.8);
          p.add('body', -26 * sat);
          p.add('leg.BL', -20 * sat);
          p.add('leg.BR', -20 * sat);
          p.add('leg.FL', -40 * sat);
          p.add('leg.FR', -40 * sat);
          p.add('head', 14 * sat);
          if (t > 2.35 && t < 2.4) this.hop.kick(0.7);
        },
      },
      munch: {
        // Sits up like a person with a stalk of bamboo, bites it down a piece at a time.
        weight: 1.6,
        length: [11, 11],
        when: floor,
        start: () => {
          this.posture = 'sit';
          this.left = 1;
        },
        pose: (t) => {
          const k = span(t, 0.3, 1.5, 9.8, 10.8);
          this.stalkGoal = k;
          const bite = Math.max(0, sin(t, 2.2, 0.05)) * k;
          this.chew = bite;
          this.left = 1 - 0.5 * ease(t, 2, 9);
          p.add('leg.FL', -68 * k + 8 * bite, 0, -12 * k);
          p.add('leg.FR', -68 * k + 8 * bite, 0, 12 * k);
          p.add('body', -10 * k);
          p.add('head', 6 * k - 8 * bite + 4 * Math.max(0, sin(t, 1.1)));
          p.add('ear.L', 4 * bite, 0, -4 * bite);
          p.add('ear.R', 4 * bite, 0, 4 * bite);
          p.add('leg.BL', -16 * k);
          p.add('leg.BR', -16 * k);
          p.shift('toy', 0, 0.006 * bite, 0);
        },
      },
      tipOver: {
        // Sits, wobbles, and slowly goes over sideways; legs wave; rocks back up.
        weight: 1.1,
        length: [7.5, 7.5],
        when: floor,
        start: () => {
          this.posture = 'sit';
          this.side = Math.random() < 0.5 ? 1 : -1;
        },
        pose: (t) => {
          const wob = ease(t, 0.3, 1.0) * (1 - ease(t, 1.9, 2.2));
          const over = ease(t, 2.0, 2.9);
          const back = ease(t, 5.2, 6.7);
          const down = over * (1 - back);
          this.roll =
            this.side * (4 * wob * sin(t, 2.6) + 78 * down + 6 * pulse(t, 2.9, 0.5) * (1 - back));
          const wave = Math.sin(t * 2 * Math.PI * 1.6) * down;
          p.add('leg.FL', -50 * down, 0, 20 * wave);
          p.add('leg.FR', -50 * down, 0, -20 * wave);
          p.add('leg.BL', -30 * down + 14 * wave);
          p.add('leg.BR', -30 * down - 14 * wave);
          p.add('head', 0, 0, this.side * -16 * down);
          p.add('ear.L', 0, 0, -12 * down);
          p.add('ear.R', 0, 0, 12 * down);
        },
      },
    };
  }

  /** Sits up like a person: back straight, legs out in front. */
  protected sitting() {
    super.sitting();
    this.puppet.add('leg.FL', -12);
    this.puppet.add('leg.FR', -12);
    this.puppet.add('leg.BL', -18);
    this.puppet.add('leg.BR', -18);
  }

  protected lying(breath: number) {
    super.lying(breath);
    this.puppet.add('head', 8);
  }

  protected pose(dt: number, env: Env) {
    this.anatomy.turn = this.posture === 'lie' ? 60 : 45;
    super.pose(dt, env);
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    const s = Math.max(0.001, this.stalk.update(dt, this.stalkGoal));
    p.stretch('toy', s * (this.stalkGoal ? this.left : 1), [0, 1, 0], s);
    this.stalkGoal = 0;
    // The somersault: a full turn about the hips, lifted so he clears the floor.
    if (this.somersault > 0 && this.somersault < 1) {
      p.turn('body', 360 * this.somersault);
      p.shift('root', 0, 0.1 * Math.sin(Math.PI * this.somersault), 0);
    }
    // Tipped over: rolled about the point he sits on, and lifted by his own width.
    if (this.roll) {
      const r = (Math.abs(this.roll) / 90) * Math.PI;
      p.turn('root', 0, 0, this.roll);
      p.shift('root', 0, 0.1 * Math.sin(Math.min(r, Math.PI / 2)) * 0.9, 0);
    }
    this.somersault = this.roll = 0;
    super.after(dt, env);
    this.chew = 0;
  }

  protected lights(time: number) {
    const o = this.outfit;
    const m = this.mood;
    let level = 0.5 + 0.1 * Math.sin(time * 0.8);
    let tone: string | undefined;
    if (m === 'asleep') level = 0.08 + 0.15 * (0.5 + 0.5 * Math.sin(time * 1.1));
    else if (m === 'sleepy') level = 0.25;
    else if (m === 'love') [level, tone] = [0.75 + 0.25 * Math.sin(time * 5), BEACON.love];
    else if (m === 'happy') [level, tone] = [0.85 + 0.15 * Math.sin(time * 3), BEACON.happy];
    else if (m === 'alarmed') [level, tone] = [Math.sin(time * 30) > 0 ? 1 : 0.4, BEACON.surprised];
    else if (m === 'curious') level = 0.9;
    // The belly lamp follows the mood; the bamboo's joints light up with each bite.
    o.dot(0, clamp(level, 0, 1), tone);
    o.dot(1, clamp(0.45 + 0.55 * this.chew, 0, 1), this.chew ? BEACON.happy : undefined);
  }
}
