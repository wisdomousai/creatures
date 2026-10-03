import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { Expression, FaceLayout } from './face';
import { sin } from './moves';
import { ease, Fluffy, span } from './fluffy';
import { Spring } from './spring';

/**
 * Crumb, the robot mouse: a tiny round grey toy with two big round dish ears that light up
 * inside (Dot0), a pink button nose, three lit whisker rods a side (Dot1) that flick when she
 * sniffs, big back feet and a long thin tail of small segments with a light on its tip (Dot2).
 *
 * Her own tricks: nibbling a wedge of cheese held up in both hands (it comes up on the floor,
 * she sits with it and bites it down, ears flicking), standing up on her hind legs to sniff
 * with her whiskers going, scurrying in two quick dashes and freezing stock still in between,
 * wiggling her big ears, and washing her face with both hands. The cheese is on a bone of its
 * own and put away otherwise.
 */
export const MOUSE_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.3, 0.5],
    [0.7, 0.5],
  ],
  rx: 0.085,
  ry: 0.3,
  line: 0.035,
  mouth: null,
};

const TAIL = ['tail.1', 'tail.2', 'tail.3', 'tail.4', 'tail.5'];

export class Mouse extends Fluffy {
  private cheese = new Spring(6, 0.45, 1.3);
  private cheeseGoal = 0;
  private cheeseLeft = 1;
  private hold = { x: 0, y: 0, z: 0 };
  private whisk = 0;
  private boost = 1;
  private burst = 0;
  private dir = 1;
  private emote: Expression | null = null;

  constructor(model: Object3D) {
    super(
      {
        name: 'Crumb',
        model: 'mouse',
        metres: 0.21,
        width: 0.38,
        size: 0.4,
        face: MOUSE_FACE,
        eyes: 0.6,
        tail: TAIL,
        tailAxis: [0, 0.2, -1],
        sit: -28,
        drop: { sit: -0.025, lie: -0.03 },
        speed: 1.0,
        lag: 0.8,
        turn: 55,
        feels: {
          'ear.L': { f: 6, zeta: 0.3 },
          'ear.R': { f: 6, zeta: 0.3 },
        },
        moods: {
          calm: { carriage: -4, wag: [6, 0.5] },
          happy: { wag: [14, 1.8] },
          curious: { carriage: 6 },
        },
        actMoods: {
          nibble: 'calm',
          sniffUp: 'curious',
          scurry: 'alarmed',
          earWiggle: 'happy',
          washFace: 'calm',
        },
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
      nibble: {
        // A wedge of cheese comes up on the floor; she picks it up, sits with it in both hands
        // and nibbles it down, a bite at a time, ears flicking.
        weight: 1.8,
        length: [10, 10],
        when: floor,
        start: () => {
          this.cheeseLeft = 1;
        },
        pose: (t) => {
          const L = 10;
          this.cheeseGoal = ease(t, 0.3, 0.9) * (1 - ease(t, L - 1.2, L - 0.6));
          const reach = span(t, 0.9, 1.5, 1.9, 2.5);
          const up = span(t, 2.1, 3, L - 2.2, L - 1.2);
          p.add('body', 12 * reach);
          p.add('leg.FL', -56 * reach, 0, -4 * reach);
          p.add('leg.FR', -56 * reach, 0, 4 * reach);
          p.add('head', 18 * reach);
          this.rear(up, -52);
          p.add('leg.FL', 0, 0, -8 * up);
          p.add('leg.FR', 0, 0, 8 * up);
          const bite = Math.max(0, sin(t, 3.2)) * up;
          p.add('head', -8 * up + 9 * bite);
          p.add('ear.L', 6 * bite, 0, -6 * bite);
          p.add('ear.R', 6 * bite, 0, 6 * bite);
          p.add('tail.1', 6 * up);
          this.cheeseLeft = 1 - 0.42 * ease(t, 3.4, L - 2.3);
          this.hold.y = reach * 0.012 + up * 0.135;
          this.hold.z = -0.03 * up;
          this.hold.x = 0.002 * bite;
          this.emote = up > 0.6 ? 'happy' : null;
        },
      },
      sniffUp: {
        // Stands right up on her hind legs, hands to her chest, nose and whiskers going.
        weight: 1.5,
        length: [6, 6],
        when: floor,
        pose: (t) => {
          const k = span(t, 0.3, 1, 4.8, 5.6);
          this.rear(k, -34);
          const s = Math.sin(t * 2 * Math.PI * 7) * k;
          p.add('head', -10 * k + 4 * s, 34 * sin(t, 0.3, 0.1) * k);
          p.add('ear.L', 8 * k * s, 0, 8 * k);
          p.add('ear.R', 8 * k * s, 0, -8 * k);
          p.add('tail.1', 14 * k);
          this.whisk = Math.max(this.whisk, k * (0.5 + 0.5 * Math.abs(s)));
        },
      },
      scurry: {
        // Two quick dashes along the floor, and she freezes stock still between them, ears
        // up, whiskers trembling, as if nothing happened.
        weight: 1.6,
        length: [6, 6],
        when: floor,
        start: () => {
          this.burst = 0;
          const [lo, hi] = this.span(this.frame!);
          this.dir = this.s - lo > hi - this.s ? -1 : 1;
        },
        pose: (t) => {
          const run = t < 1.1 ? 1 : t > 2.9 && t < 4 ? 2 : 0;
          if (run && this.burst !== run) {
            this.burst = run;
            if (run === 2) this.dir = -this.dir * (Math.random() < 0.6 ? 1 : -1);
            this.boost = 3.4;
            this.walkTo(this.s + this.dir * this.heightPx * 1.7, this.depth);
          }
          this.boost = run ? 3.4 : 1;
          if (!run && this.walking) this.goal = null;
          if (run) {
            p.add('body', -4);
            p.add('ear.L', -22);
            p.add('ear.R', -22);
            p.add('tail.1', -18);
            this.emote = 'surprised';
          } else {
            // Frozen: head up, ears pricked, a tiny tremble, whiskers going.
            const k = span(t, 0.9, 1.3, 2.6, 3) + span(t, 3.8, 4.2, 5.4, 5.9);
            const tremble = sin(t, 11) * k;
            p.add('head', -12 * k + tremble, 0, 0);
            p.add('body', -2 * k + 0.8 * tremble);
            p.add('ear.L', 14 * k);
            p.add('ear.R', 14 * k);
            this.whisk = Math.max(this.whisk, k * (0.6 + 0.4 * Math.abs(tremble)));
            this.emote = k > 0.4 ? 'surprised' : null;
          }
        },
      },
      earWiggle: {
        // Wiggles her big ears one after the other, the lights in them flashing.
        weight: 1.1,
        length: [3.4, 3.4],
        when: this.standing,
        pose: (t) => {
          const k = span(t, 0.2, 0.6, 2.8, 3.2);
          const a = Math.sin(t * 2 * Math.PI * 3);
          const b = Math.sin(t * 2 * Math.PI * 3 + Math.PI);
          p.add('ear.L', 6 * k, 0, 34 * a * k);
          p.add('ear.R', 6 * k, 0, 34 * b * k);
          p.add('head', 3 * k, 0, 6 * a * k);
          this.whisk = Math.max(this.whisk, k * 0.5);
          this.emote = 'happy';
        },
      },
      washFace: {
        // Sits up and washes her face with both hands, a stroke after a stroke, a lick of the
        // paw between, then the ears.
        weight: 1.2,
        length: [6.5, 6.5],
        when: floor,
        start: () => (this.posture = 'sit'),
        pose: (t) => {
          const k = span(t, 0.4, 1.1, 5.2, 6);
          const a = Math.max(0, Math.sin(t * 2 * Math.PI * 2));
          const b = Math.max(0, Math.sin(t * 2 * Math.PI * 2 + Math.PI));
          p.add('leg.FL', (-100 + 22 * a) * k, 0, -22 * k - 6 * a * k);
          p.add('leg.FR', (-100 + 22 * b) * k, 0, 22 * k + 6 * b * k);
          p.add('head', 16 * k * (0.6 + 0.4 * (a + b)), 0, 6 * k * (a - b));
          p.add('ear.L', 0, 0, -8 * k * a);
          p.add('ear.R', 0, 0, 8 * k * b);
          this.emote = 'happy';
        },
      },
    };
  }

  protected sitting() {
    super.sitting();
    this.puppet.add('head', 6);
  }

  protected lying(breath: number) {
    super.lying(breath);
    this.puppet.add('head', 10);
  }

  protected pose(dt: number, env: Env) {
    this.spec.speed = this.baseSpeed * (this.act === 'scurry' ? this.boost : 1);
    this.anatomy.turn = this.posture === 'lie' ? 60 : 55;
    super.pose(dt, env);
    if (this.walking) {
      this.puppet.add('root', 0, 0, 2.5 * Math.sin(this.gait));
      this.puppet.add('body', 3 * Math.abs(Math.sin(this.gait)));
    }
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    const s = Math.max(0.001, this.cheese.update(dt, this.cheeseGoal));
    p.stretch('toy', s * this.cheeseLeft, [0, 1, 0], s * this.cheeseLeft);
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
    this.cheeseGoal = 0;
    this.hold.x = this.hold.y = this.hold.z = 0;
    if (this.act !== 'nibble') this.cheeseLeft = 1;
    if (this.emote) this.expression = this.emote;
    this.emote = null;
    super.after(dt, env);
    this.whisk = 0;
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
    // The ears' insides follow the mood; the whiskers flicker when she sniffs or freezes.
    const flick = this.whisk * (0.5 + 0.5 * Math.sin(time * 40));
    o.dot(0, clamp(level, 0, 1), tone);
    o.dot(
      1,
      clamp(m === 'asleep' ? 0.05 : 0.25 + 0.7 * flick, 0, 1),
      flick > 0.3 ? BEACON.happy : undefined,
    );
    o.dot(
      2,
      clamp(m === 'asleep' ? 0.06 : 0.3 + 0.5 * Math.max(0, Math.sin(time * 1.6)) ** 4, 0, 1),
      tone,
    );
  }
}
