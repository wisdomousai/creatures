import type { Object3D } from 'three';
import { BEACON } from './bolt';
import type { Act, Env } from './character';
import { clamp } from './character';
import type { Expression, FaceLayout } from './face';
import { sin } from './moves';
import { ease, Fluffy, pulse, span } from './fluffy';
import type { Feeling } from './pet';
import { Spring } from './spring';

/**
 * Beam, the robot quokka: a small upright wallaby, sitting up on long hind feet with his short
 * front paws held up in front of him, a short pale muzzle, small round ears set high, a thin
 * tail lying along the floor behind him, and a screen face whose wide smile never goes away (the happiest animal in the world: whatever
 * he feels, the smile stays, and only sleep or a fright takes it off). His signature is the
 * pair of lit cheeks either side of the screen, which flash like a camera.
 *
 * He hops on his hind feet (never walking on all fours): both feet push off together, the
 * body leans into the hop, the paws stay up and the tail lifts off the floor.
 *
 * Selfie: he turns square to you and leans right in toward the viewer, beaming, one arm held
 * out and up, and the cheeks flash at the click. He hops about upright on his hind legs, sits
 * and nibbles a leaf held in both hands (a toy on a bone of its own, put away otherwise) down
 * to nothing, and waves. The rest is the fluffy base's (fluffy.ts).
 */
export const QUOKKA_FACE: FaceLayout = {
  width: 448,
  height: 256,
  eyes: [
    [0.3, 0.38],
    [0.7, 0.38],
  ],
  rx: 0.075,
  ry: 0.26,
  line: 0.034,
  mouth: [0.5, 0.66],
};

export class Quokka extends Fluffy {
  private leaf = new Spring(6, 0.5, 1.3);
  private leafGoal = 0;
  private leafLeft = 1;
  private flash = 0;
  private mug: Expression | null = null;
  private lean = new Spring(2.4, 0.6, 1.1);
  private leanGoal = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Beam',
        model: 'quokka',
        metres: 0.36,
        width: 0.26,
        size: 0.56,
        face: QUOKKA_FACE,
        eyes: 0.72,
        tail: ['tail.1', 'tail.2'],
        tailAxis: [0, 0.3, -1],
        sit: -10,
        drop: { sit: -0.045, lie: -0.055 },
        speed: 1.4,
        lag: 0.9,
        moods: {
          calm: { face: 'happy', wag: [6, 0.5], carriage: -2 },
          curious: { face: 'happy' },
          sad: { face: 'happy' },
          happy: { wag: [18, 1.8] },
        },
        actMoods: { selfie: 'happy', bounce: 'happy', nibble: 'happy', wave: 'happy' },
      },
      model,
    );
    this.dotCount = 0;
    this.trotting = false;
    this.acts = { ...this.acts, ...this.mine() };
  }

  private toMiddle() {
    const f = this.env?.frame;
    if (!f) return 1;
    return Math.sign((f.left + f.right) / 2 - this.s) || 1;
  }

  private mine(): Record<string, Act> {
    const p = this.puppet;
    return {
      selfie: {
        // Turns square to you, leans in toward the viewer, beaming, one arm up and out; the
        // cheeks flash at the click, a wink, and he settles back.
        weight: 2.4,
        length: [6.5, 6.5],
        when: this.standing,
        start: () => (this.posture = 'stand'),
        pose: (t) => {
          const k = span(t, 0.2, 1.2, 5.3, 6.2);
          this.want.yaw = -this.toMiddle() * 45 * k;
          this.leanGoal = span(t, 1.4, 2.4, 5, 5.9);
          const side = this.toMiddle();
          p.add('head', -8 * k, 0, side * 12 * k);
          p.add(side > 0 ? 'leg.FR' : 'leg.FL', -100 * k, 0, 0);
          p.add(side > 0 ? 'leg.FL' : 'leg.FR', -24 * k, 0, 0);
          p.add('ear.L', 8 * k);
          p.add('ear.R', 8 * k);
          // Three clicks: a flash and a wink on each.
          for (const at of [3.0, 3.9, 4.8]) {
            const c = pulse(t, at, 0.3);
            if (c > 0) {
              this.flash = Math.max(this.flash, c);
              this.mug = at > 4.5 ? 'wink' : 'starry';
            }
          }
        },
      },
      bounce: {
        // Up on his hind legs and hopping along on the spot, arms swinging, tail bouncing.
        weight: 1.6,
        length: [4.4, 4.4],
        when: this.standing,
        start: () => {
          this.posture = 'stand';
          this.hops = 0;
        },
        pose: (t) => {
          const k = span(t, 0.2, 0.7, 3.6, 4.2);
          this.rear(0.75 * k, -35);
          this.hopTo(Math.floor(Math.max(0, t - 0.3) / 0.55) + 1, 1.5);
          const swing = Math.sin(t * 2 * Math.PI * 1.8);
          p.add('leg.FL', 22 * swing * k);
          p.add('leg.FR', -22 * swing * k);
          p.add('head', -10 * k);
          p.add('ear.L', -12 * Math.max(0, sin(t, 1.8)) * k);
          p.add('ear.R', -12 * Math.max(0, sin(t, 1.8)) * k);
          this.anatomy.tail.forEach((b, i) => p.add(b, 18 * k * sin(t, 1.8, i * 0.1)));
        },
      },
      nibble: {
        // Sits up with a leaf in both hands and nibbles it away, bite by bite, humming.
        weight: 1.6,
        length: [8.5, 8.5],
        when: this.still,
        start: () => {
          this.posture = 'sit';
          this.leafLeft = 1;
        },
        pose: (t) => {
          const k = span(t, 0.3, 1.1, 7.2, 7.9);
          this.leafGoal = k;
          const eating = span(t, 1.3, 1.7, 6.4, 6.8);
          const bite = Math.max(0, sin(t, 2.4)) * eating;
          this.leafLeft = 1 - 0.8 * ease(t, 1.5, 6.4);
          p.add('leg.FL', (-72 + 8 * bite) * k, 0, -14 * k);
          p.add('leg.FR', (-72 + 8 * bite) * k, 0, 14 * k);
          p.add('head', (10 + 8 * bite) * k);
          p.add('ear.L', -6 * bite);
          p.add('ear.R', -6 * bite);
          this.flash = 0.35 * bite;
        },
      },
      wave: {
        // Stands tall and waves one hand, then the other, with a beaming nod.
        weight: 1.6,
        length: [5, 5],
        when: this.standing,
        start: () => (this.posture = 'stand'),
        pose: (t) => {
          const k = span(t, 0.2, 0.8, 4.2, 4.8);
          this.rear(0.45 * k, -20);
          const left = t < 2.5;
          const flap = Math.sin(t * 2 * Math.PI * 2.4);
          p.add(left ? 'leg.FL' : 'leg.FR', -130 * k, 0, (left ? 1 : -1) * (-6 + 20 * flap) * k);
          p.add('head', -4 * k, 0, 8 * sin(t, 0.8) * k);
          p.add('ear.L', 10 * k);
          p.add('ear.R', 10 * k);
          this.anatomy.tail.forEach((b, i) => p.add(b, 20 * k * sin(t, 1.4, i * 0.1)));
        },
      },
    };
  }

  /** Already upright: reared up is a little taller, the paws higher, not tipped over backward. */
  protected rear(k: number, arms = -55) {
    const p = this.puppet;
    p.add('body', -4 * k);
    p.add('head', 6 * k);
    p.add('leg.FL', arms * 0.6 * k);
    p.add('leg.FR', arms * 0.6 * k);
  }

  /** Hops along, both hind feet together: a crouch, a push, the body leaning into the air. */
  private hopAlong() {
    const p = this.puppet;
    const m = Math.min(1, this.stride / (this.heightPx * 0.8));
    const s = Math.abs(Math.sin(this.gait));
    this.extraLift = m * (0.05 * s - 0.012);
    if (m < 0.05) return;
    const push = Math.cos(this.gait * 2 + 0.4);
    p.add('leg.BL', 24 * m * push);
    p.add('leg.BR', 24 * m * push);
    p.add('body', 9 * m + 5 * m * push);
    p.add('head', -5 * m - 3 * m * push);
    p.add('leg.FL', -14 * m * s);
    p.add('leg.FR', -14 * m * s);
    p.add('ear.L', -14 * m * s);
    p.add('ear.R', -14 * m * s);
    this.anatomy.tail.forEach((b, i) => p.add(b, (i === 0 ? -16 : -8) * m * s));
  }

  protected sitting() {
    super.sitting();
    this.puppet.add('leg.FL', -12);
    this.puppet.add('leg.FR', -12);
  }

  protected lying(breath: number) {
    super.lying(breath);
    this.puppet.add('head', 8);
  }

  protected express(_dt: number, _env: Env, _f: Feeling) {
    if (this.mug) this.expression = this.mug;
  }

  protected pose(dt: number, env: Env) {
    const l = this.lean.update(dt, this.leanGoal);
    this.leanGoal = 0;
    this.hopAlong();
    super.pose(dt, env);
    // The lean: the whole body comes toward the viewer, the head tipped up to the lens.
    if (l > 0.01) {
      this.puppet.shift('body', 0, 0, 0.06 * l);
      this.puppet.add('body', 10 * l);
      this.puppet.add('head', -14 * l);
    }
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    const s = Math.max(0.001, this.leaf.update(dt, this.leafGoal));
    p.stretch('toy', s * Math.max(0.2, this.leafLeft), [1, 0, 0], s);
    p.shift('toy', 0, 0, 0);
    this.leafGoal = 0;
    super.after(dt, env);
    this.mug = null;
    this.flash = 0;
  }

  protected lights(time: number) {
    const o = this.outfit;
    const m = this.mood;
    let level = 0.45 + 0.12 * Math.sin(time * 1.3);
    let tone: string | undefined;
    if (m === 'asleep') level = 0.08 + 0.12 * (0.5 + 0.5 * Math.sin(time * 1.1));
    else if (m === 'sleepy') level = 0.25;
    else if (m === 'love') [level, tone] = [0.8 + 0.2 * Math.sin(time * 5), BEACON.love];
    else if (m === 'happy') [level, tone] = [0.8 + 0.15 * Math.sin(time * 3), BEACON.happy];
    else if (m === 'alarmed') [level, tone] = [Math.sin(time * 30) > 0 ? 1 : 0.4, BEACON.surprised];
    if (this.flash > 0) [level, tone] = [Math.max(level, this.flash), '#ffffff'];
    o.dot(0, clamp(level, 0, 1), tone);
  }
}
