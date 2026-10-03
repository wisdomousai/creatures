import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import type { Act, Env } from './character';
import type { Expression, FaceLayout } from './face';
import { sin } from './moves';
import { ease, Fluffy, pulse, span } from './fluffy';
import { Spring } from './spring';

/**
 * Nibbs, the robot guinea pig: a long round potato of a toy in ginger, brown
 * and cream panels, no tail, tiny petal ears and short legs hidden under him. A lit ring
 * at his throat (Dot0) pulses with each wheek, a rosette on his forehead has a light in
 * its middle (Dot1). He popcorns (sudden little hops with a twist in the air, for joy),
 * wheeks with his head up, zooms off in a short run and freezes, and nibbles hay (a heap
 * of straws on a bone of its own that comes out for it).
 */
export const GUINEAPIG_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.3, 0.5],
    [0.7, 0.5],
  ],
  rx: 0.085,
  ry: 0.34,
  line: 0.035,
  mouth: null,
};

export class GuineaPig extends Fluffy {
  private wheek = 0;
  private emote: Expression | null = null;
  private zoomBoost = 1;
  private stage = 0;
  private mark = 0;
  private hay = new Spring(5, 0.4, 1.3);
  private hayGoal = 0;
  private beat = 0;
  private flash = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Nibbs',
        model: 'guineapig',
        metres: 0.26,
        width: 0.36,
        size: 0.52,
        face: GUINEAPIG_FACE,
        eyes: 0.64,
        tail: ['tail.1'],
        tailAxis: [0, 0.3, -1],
        sit: -26,
        drop: { sit: -0.03, lie: -0.03 },
        speed: 0.9,
        lag: 1.1,
        feels: {
          'ear.L': { f: 6, zeta: 0.3 },
          'ear.R': { f: 6, zeta: 0.3 },
        },
        moods: { calm: { wag: [0, 0] }, happy: { wag: [0, 0] } },
        actMoods: { popcorn: 'happy', wheek: 'happy', zoom: 'happy', nibble: 'calm' },
      },
      model,
    );
    this.dotCount = 2;
    this.acts = { ...this.acts, ...this.mine() };
  }

  private mine(): Record<string, Act> {
    const p = this.puppet;
    return {
      // Popcorn: sudden little hops and twists in the air, joyful, no warning.
      popcorn: {
        weight: 1.8,
        length: [4.6, 4.6],
        when: this.standing,
        start: () => {
          this.hops = 0;
          this.stage = 0;
          this.mark = 0;
        },
        pose: (t) => {
          const beats = [0.3, 0.75, 1.1, 1.8, 2.15, 2.5, 3.2, 3.5];
          const n = beats.filter((b) => t > b).length;
          if (n > this.hops) {
            this.hops = n;
            this.hop.kick(1.5 + 0.5 * Math.sin(n * 5.3));
            p.kick('body', -120 * Math.sin(n * 2.1), 0, 260 * (n % 2 ? 1 : -1));
            p.kick('head', 0, 300 * (n % 2 ? -1 : 1));
            p.kick('ear.L', -300, 0, -400);
            p.kick('ear.R', -300, 0, 400);
            this.want.yaw = 70 * Math.sin(n * 1.7);
          }
          let air = 0;
          for (const b of beats) air = Math.max(air, pulse(t, b, 0.42));
          p.add('leg.FL', -20 * air);
          p.add('leg.FR', -20 * air);
          p.add('leg.BL', 18 * air);
          p.add('leg.BR', 18 * air);
          p.add('body', -8 * air);
          this.flash = air;
          this.emote = 'happy';
          if (t > 3.9) this.want.yaw = 0;
        },
      },
      // A wheek: head up, three quick calls, the throat lamp pulsing with each.
      wheek: {
        weight: 1.6,
        length: [3, 3],
        when: () => !this.walking && this.posture !== 'lie',
        pose: (t) => {
          const k = ease(t, 0, 0.25) * (1 - ease(t, 2.5, 3));
          const call = pulse(t, 0.3, 0.3) + pulse(t, 0.8, 0.3) + pulse(t, 1.3, 0.45);
          this.wheek = Math.min(1, call);
          p.add('head', (-22 - 8 * call) * k);
          p.add('body', (-6 - 2 * call) * k);
          p.add('ear.L', -14 * k, 0, 12 * k * call);
          p.add('ear.R', -14 * k, 0, -12 * k * call);
          p.add('leg.FL', -8 * call);
          p.add('leg.FR', -8 * call);
          this.emote = 'surprised';
          if (call > 0.9 && this.beat === 0) {
            this.beat = 1;
            this.hop.kick(0.5);
          }
          if (call < 0.1) this.beat = 0;
        },
      },
      // Zooms: a short, flat-out run, then freezes, eyes wide, as if it never happened.
      zoom: {
        weight: 1.5,
        length: [6, 6],
        when: this.standing,
        start: () => {
          this.stage = 0;
          this.mark = 0;
          const [lo, hi] = this.span(this.frame!);
          const way = this.s - lo > hi - this.s ? -1 : 1;
          this.zoomBoost = 3.2;
          this.walkTo(this.s + way * this.heightPx * 3.5, Math.random());
        },
        pose: (t) => {
          if (this.stage === 0) {
            this.zoomBoost = 3.2;
            p.add('body', -4);
            p.add('ear.L', -22);
            p.add('ear.R', -22);
            this.emote = 'happy';
            if (!this.walking && t > 0.4) {
              this.stage = 1;
              this.mark = t;
              this.zoomBoost = 1;
              this.goal = null;
              this.hop.kick(0.6);
            }
          } else {
            // Frozen: head up, eyes wide, a tiny tremble.
            const u = t - this.mark;
            this.zoomBoost = 1;
            p.add('head', -12, 0, 0);
            p.add('body', -3 + 1.5 * sin(u, 9));
            p.add('ear.L', 12);
            p.add('ear.R', 12);
            this.emote = 'surprised';
            if (u > 2.2) this.emote = 'neutral';
          }
          if (this.stage === 0 && t > 3.5) this.stage = 1;
        },
      },
      // Hay: a heap of straws comes up in front of him and he nibbles it, a straw at a time.
      nibble: {
        weight: 1.5,
        length: [7, 7],
        when: this.standing,
        pose: (t) => {
          const L = 7;
          this.hayGoal = ease(t, 0.1, 0.6) * (1 - ease(t, L - 0.9, L - 0.4));
          const k = span(t, 0.7, 1.3, L - 1.2, L - 0.7);
          const chew = Math.max(0, sin(t, 5.5));
          p.add('head', k * (30 + 6 * chew));
          p.add('body', k * 8);
          p.add('ear.L', -6 * k * chew);
          p.add('ear.R', -6 * k * chew);
          p.add('leg.FL', -6 * k);
          p.add('leg.FR', -6 * k);
          this.emote = k > 0.5 ? 'happy' : null;
        },
      },
    };
  }

  protected pose(dt: number, env: Env) {
    this.spec.speed = this.baseSpeed * (this.act === 'zoom' ? this.zoomBoost : 1);
    super.pose(dt, env);
    if (this.walking) {
      this.puppet.add('root', 0, 0, 2.5 * Math.sin(this.gait));
      this.puppet.add('body', 3 * Math.abs(Math.sin(this.gait)));
    }
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    if (this.emote) this.expression = this.emote;
    this.emote = null;
    // The hay: up in front of him, .
    const pile = Math.max(0.001, this.hay.update(dt, this.hayGoal));
    p.stretch('hay', pile, [0, 1, 0], pile);
    this.hayGoal = 0;
    super.after(dt, env);
  }

  protected lights(time: number) {
    const o = this.outfit;
    const m = this.mood;
    const base = m === 'asleep' ? 0.08 : 0.22 + 0.08 * Math.sin(time * 0.8);
    o.dot(0, Math.min(1, base + this.wheek * 0.9), this.wheek > 0.3 ? BEACON.happy : undefined);
    let rose = 0.45 + 0.1 * Math.sin(time * 0.9);
    let tone: string | undefined;
    if (m === 'asleep') rose = 0.1;
    else if (m === 'sleepy') rose = 0.3;
    else if (m === 'love') [rose, tone] = [0.8 + 0.2 * Math.sin(time * 5), BEACON.love];
    else if (m === 'happy') [rose, tone] = [0.9, BEACON.happy];
    else if (m === 'alarmed') [rose, tone] = [Math.sin(time * 30) > 0 ? 1 : 0.3, BEACON.surprised];
    if (this.flash > 0.3) tone = RAINBOW[Math.floor(time * 10) % RAINBOW.length];
    o.dot(1, Math.max(0, Math.min(1, rose)), tone);
    this.wheek = 0;
    this.flash = 0;
  }
}
