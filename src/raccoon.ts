import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { Expression, FaceLayout } from './face';
import { sin } from './moves';
import { ease, Fluffy, pulse, span } from './fluffy';
import type { Feeling } from './pet';
import { Spring } from './spring';

/**
 * Mitts, the robot raccoon: a stocky grey toy robot with a dark bandit-mask plate across the
 * screen face, a pale muzzle, round dark-lined ears, little hands with four toes and a big
 * bushy tail of four pods ringed grey and dark. A lamp on the chest (Dot0) and one on the
 * tail's tip (Dot1) follow the mood.
 *
 * Her own tricks: washing (she leans to a puddle of light that spreads on the floor and a lit
 * pebble comes up in it; she rubs it between her hands, then sits up and holds it up to
 * look, the puddle rippling), standing up tall to peek about, a sneaky tiptoe along the floor
 * in a crouch with a glance back over her shoulder, and patting the floor with both hands to feel for
 * something. The pebble
 * and the puddle are on bones of their own and put away otherwise.
 */
export const RACCOON_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.3, 0.5],
    [0.7, 0.5],
  ],
  rx: 0.075,
  ry: 0.26,
  line: 0.035,
  mouth: null,
};

const TAIL = ['tail.1', 'tail.2', 'tail.3', 'tail.4'];

export class Raccoon extends Fluffy {
  static readonly terms =
    'coon bandit mask grey gray black dark ringed stripes bushy tail stocky muzzle wash puddle pebble sneak tiptoe peek';

  private pebble = new Spring(6, 0.45, 1.3);
  private pebbleGoal = 0;
  private puddle = new Spring(4, 0.6, 1.2);
  private puddleGoal = 0;
  /** Where the pebble is held, and the puddle's ripple (0..1). */
  private hold = { x: 0, y: 0, z: 0 };
  private ripple = 0;
  private emote: Expression | null = null;
  private stage = 0;
  private side = 1;

  constructor(model: Object3D) {
    super(
      {
        name: 'Mitts',
        model: 'raccoon',
        metres: 0.37,
        width: 0.55,
        size: 0.8,
        face: RACCOON_FACE,
        eyes: 0.67,
        tail: TAIL,
        tailAxis: [0, 0.1, -1],
        sit: -24,
        drop: { sit: -0.07, lie: -0.09 },
        speed: 1.15,
        lag: 0.9,
        turn: 50,
        moods: { calm: { carriage: -14 }, curious: { carriage: -4 } },
        actMoods: { wash: 'calm', peek: 'curious', sneak: 'curious', pat: 'curious' },
      },
      model,
    );
    this.dotCount = 0;
    this.acts = { ...this.acts, ...this.mine() };
  }

  private mine(): Record<string, Act> {
    const p = this.puppet;
    const floor = () => this.standing() && this.edge === 'bottom';
    return {
      wash: {
        // Leans down to a puddle of light that spreads on the floor, a lit pebble comes up in
        // it and she rubs it between her hands; then she sits up, holds it to the light to
        // look it over, and puts it back and away.
        weight: 1.7,
        length: [12, 12],
        when: floor,
        start: () => (this.stage = 0),
        pose: (t) => {
          const L = 12;
          const k = span(t, 0.4, 1.4, L - 1.4, L - 0.4);
          this.puddleGoal = ease(t, 0.2, 1.0) * (1 - ease(t, L - 1.0, L - 0.2));
          this.pebbleGoal = ease(t, 1.2, 1.8) * (1 - ease(t, L - 1.6, L - 1.0));
          // Rub (2..7), up to look (7.4..9.6), back down (9.8..10.6).
          const up = span(t, 7.2, 8.2, 9.2, 10.2);
          const bow = k * (1 - up);
          const rub = span(t, 1.8, 2.6, 6.6, 7.4);
          const r = Math.sin(t * 2 * Math.PI * 3.2) * rub;
          const roll = Math.sin(t * 2 * Math.PI * 1.1) * rub;
          p.add('body', 12 * bow);
          p.add('leg.FL', (-70 + 9 * r) * bow, 0, -6 * bow - 6 * r);
          p.add('leg.FR', (-70 - 9 * r) * bow, 0, 6 * bow + 6 * r);
          p.add('head', 16 * bow + 5 * rub * sin(t, 1.4));
          p.add('ear.L', 8 * bow * rub);
          p.add('ear.R', 8 * bow * rub);
          // Up on her hind legs, hands together at the chest, pebble between them.
          this.rear(up, -30);
          p.add('head', -10 * up, 18 * sin(t, 0.5) * up);
          this.hold.x = 0.012 * roll * (1 - up);
          this.hold.z = -0.05 * up;
          this.hold.y = 0.2 * up + 0.006 * Math.abs(r) * bow;
          this.ripple = Math.max(this.ripple, rub * 0.7 * (0.5 + 0.5 * Math.abs(r)));
          if (up > 0.5) this.emote = 'happy';
          if (this.stage === 0 && t > 1.8) {
            this.stage = 1;
            this.hop.kick(0.2);
          }
        },
      },
      peek: {
        // Stands up tall on her hind legs, hands held to her chest, and looks both ways.
        weight: 1.3,
        length: [6, 6],
        when: floor,
        pose: (t) => {
          const k = span(t, 0.3, 1.1, 4.8, 5.6);
          this.rear(k, -30);
          p.add('leg.FL', 0, 0, 12 * k);
          p.add('leg.FR', 0, 0, -12 * k);
          p.add('head', -6 * k, 52 * sin(t, 0.26, 0.1) * k);
          p.add('ear.L', 10 * k, 0, 10 * k * sin(t, 0.52));
          p.add('ear.R', 10 * k, 0, -10 * k * sin(t, 0.52));
          p.add('tail.1', 20 * k);
        },
      },
      sneak: {
        // A tiptoe along the floor: crouched low, head down, a step, a freeze, a glance back.
        weight: 1.2,
        length: [8, 8],
        when: floor,
        start: () => {
          this.side = Math.random() < 0.5 ? -1 : 1;
          const [lo, hi] = this.span(this.frame!);
          const to = clamp(this.s + this.side * this.heightPx * 2.4, lo, hi);
          this.walkTo(to, this.depth);
        },
        pose: (t) => {
          const k = span(t, 0.2, 0.8, 6.8, 7.8);
          this.want.low = 0.03 * k;
          p.add('head', 10 * k, 0, 0);
          p.add('body', 8 * k);
          p.add('ear.L', -14 * k, 0, -8 * k);
          p.add('ear.R', -14 * k, 0, 8 * k);
          p.add('tail.1', -22 * k);
          TAIL.forEach((b, i) => i && p.add(b, 0, 0, 6 * k));
          const glance = pulse(t, 5.2, 1.6);
          if (!this.walking) p.add('head', 0, -50 * glance * this.side * 0.6, 0);
          this.emote = glance > 0.3 ? 'wink' : 'neutral';
          const step = this.walking ? Math.sin(this.gait * 2) : 0;
          p.add('leg.FL', 6 * step * k);
          p.add('leg.BR', 6 * step * k);
        },
      },
      pat: {
        // Pats about on the floor with both hands, head tilted, feeling for something.
        weight: 1.2,
        length: [5.5, 5.5],
        when: this.standing,
        pose: (t) => {
          const k = span(t, 0.3, 0.9, 4.6, 5.3);
          const a = Math.max(0, sin(t, 1.8));
          const b = Math.max(0, sin(t, 1.8, 0.5));
          p.add('body', 12 * k);
          p.add('head', 14 * k, 6 * sin(t, 0.4) * k, 8 * sin(t, 0.4) * k);
          p.add('leg.FL', (-34 * a - 6) * k, 0, 6 * k);
          p.add('leg.FR', (-34 * b - 6) * k, 0, -6 * k);
          p.add('ear.L', 6 * k);
          p.add('ear.R', 6 * k);
          this.emote = 'neutral';
        },
      },
    };
  }

  protected sitting() {
    super.sitting();
    this.puppet.add('head', 4);
  }

  protected lying(breath: number) {
    const p = this.puppet;
    p.add('leg.FL', 80);
    p.add('leg.FR', 80);
    p.add('leg.BL', -80);
    p.add('leg.BR', -80);
    p.add('head', 26 + 2 * breath, 50 * this.side, 10 * this.side);
  }

  protected tailLying() {
    const p = this.puppet;
    p.add('tail.1', -20, -52 * this.side);
    p.add('tail.2', 0, -58 * this.side);
    p.add('tail.3', 0, -52 * this.side);
    p.add('tail.4', 6 + 3 * sin(this.t, 0.15), -42 * this.side);
  }

  protected express(_dt: number, env: Env, f: Feeling) {
    const p = this.puppet;
    if (this.posture !== 'lie') {
      const [wag] = f.wag ?? [0, 0];
      const deg = wag * (this.walking ? 0.6 : 1);
      TAIL.forEach((bone, i) => {
        if (!i) return;
        const s = Math.sin(this.wagPhase - i * 0.7) * deg * 0.8;
        p.add(bone, 0, s, -s);
      });
    }
    if (this.mood === 'curious' && !['peek', 'wash', 'sneak', 'pat'].includes(this.act))
      p.add('head', 0, 0, 8 * sin(env.time, 0.1));
  }

  protected pose(dt: number, env: Env) {
    const middle = (env.frame.left + env.frame.right) / 2;
    this.side = this.posture === 'lie' ? -(Math.sign(middle - this.s) || 1) : this.side;
    this.anatomy.turn = this.posture === 'lie' ? 65 : this.act === 'peek' ? 25 : 50;
    this.spec.speed = this.baseSpeed * (this.act === 'sneak' ? 0.4 : 1);
    super.pose(dt, env);
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    const s = Math.max(0.001, this.pebble.update(dt, this.pebbleGoal));
    p.stretch('toy', s, [0, 1, 0], s);
    // shift() takes x right, y up, z toward the viewer, and the turned root rotates it: undo that.
    const yaw = (p.current('root')[1] * Math.PI) / 180;
    const c = Math.cos(yaw);
    const sn = Math.sin(yaw);
    p.shift(
      'toy',
      this.hold.x * c + this.hold.z * sn,
      this.hold.y,
      -this.hold.x * sn + this.hold.z * c,
    );
    const w = Math.max(0.001, this.puddle.update(dt, this.puddleGoal));
    p.stretch('puddle', w, [0, 1, 0], w);
    this.pebbleGoal = this.puddleGoal = 0;
    this.hold.x = this.hold.y = this.hold.z = 0;
    if (this.emote) this.expression = this.emote;
    this.emote = null;
    super.after(dt, env);
    this.ripple *= 0.9;
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
    if (this.act === 'dizzy') tone = RAINBOW[Math.floor(time * 6) % RAINBOW.length];
    o.dot(0, clamp(level, 0, 1), tone);
    o.dot(
      1,
      clamp(m === 'asleep' ? 0.06 : 0.3 + 0.5 * Math.max(0, Math.sin(time * 1.3)) ** 4, 0, 1),
      tone,
    );
    o.dot(2, clamp(0.7 + 0.3 * Math.sin(time * 4) + 0.3 * this.ripple, 0, 1));
    o.dot(3, clamp(0.45 + 0.5 * this.ripple + 0.1 * Math.sin(time * 3), 0, 1));
  }
}
