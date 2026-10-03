import type { Object3D } from 'three';
import { BEACON } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import { ease, Fluffy, pulse, span } from './fluffy';
import type { Feeling } from './pet';
import { Spring } from './spring';

/**
 * Nod, the robot koala: a stocky grey toy with a big round head, two huge pom ears with a
 * leaf-green light in each, a big dark oval nose plate, a small sleepy screen face and long
 * strong arms and legs. He is the sleepy one: every so often, mid-whatever, his head sinks,
 * his eyes close, his ears droop, and he jerks awake again a few seconds later as if nothing
 * happened (or doesn't, and goes on to a proper sleep).
 *
 * He uses the side walls like the squirrel and the lizard do, and there he clings to them
 * with all four paws and shuffles up and down; on a wall he hugs it and dozes. Down on the floor
 * he sits up and chews on a eucalyptus leaf (a toy on a bone of its own, put away otherwise),
 * dozes off over it and starts awake. The rest is the fluffy base's (fluffy.ts).
 */
export const KOALA_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.27, 0.5],
    [0.73, 0.5],
  ],
  rx: 0.07,
  ry: 0.2,
  line: 0.035,
  mouth: null,
};

export class Koala extends Fluffy {
  /** 0..1 how deep in a doze he is, and the leaf's size. */
  private drowse = new Spring(2, 0.85);
  private drowseGoal = 0;
  private leaf = new Spring(5, 0.5, 1.2);
  private leafGoal = 0;
  private chew = 0;
  private glow = 0;
  private startled = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Nod',
        model: 'koala',
        metres: 0.42,
        width: 0.34,
        size: 0.8,
        face: KOALA_FACE,
        eyes: 0.69,
        tail: ['tail.1'],
        tailAxis: [0, 0.2, -1],
        sit: -34,
        drop: { sit: -0.05, lie: -0.07 },
        speed: 0.8,
        lag: 1.2,
        edges: ['bottom', 'bottom', 'bottom', 'left', 'right'],
        moods: {
          calm: { ears: -3, out: 2, bob: [2, 0.15], wag: [2, 0.2] },
          happy: { wag: [8, 1.4] },
        },
        actMoods: { chew: 'calm', doze: 'sleepy', cling: 'calm', hug: 'sleepy' },
      },
      model,
    );
    this.dotCount = 0;
    this.acts = { ...this.acts, ...this.mine() };
    // He is the sleepy one: the naps and yawns come up more often.
    for (const [name, k] of [
      ['nap', 1.5],
      ['yawn', 1.8],
    ] as const)
      if (this.acts[name]) this.acts[name].weight *= k;
  }

  /** Dozing off, in whatever he is doing, for `from..to` of an act. */
  private nod(t: number, from: number, to: number, back = 0.4) {
    if (t > from && t < to) this.drowseGoal = 1;
    if (t >= to && t < to + back) this.startled = 1 - (t - to) / back;
  }

  private mine(): Record<string, Act> {
    const p = this.puppet;
    const wall = () => !this.walking && this.edge !== 'bottom';
    const floor = () => !this.walking && this.edge === 'bottom';
    return {
      chew: {
        // Sits and chews a eucalyptus leaf held in both paws, dozing off partway through.
        weight: 1.5,
        length: [12, 12],
        when: floor,
        start: () => (this.posture = 'sit'),
        pose: (t) => {
          const k = span(t, 0.3, 1.4, 10.4, 11.4);
          this.leafGoal = k;
          const dozing = ease(t, 4.8, 5.8) * (1 - ease(t, 8.1, 8.3));
          const bite = Math.max(0, sin(t, 2.4)) * (1 - 0.8 * dozing);
          this.chew = bite * k;
          p.add('leg.FL', -62 * k + 6 * bite, 0, -10 * k);
          p.add('leg.FR', -62 * k + 6 * bite, 0, 10 * k);
          p.add('head', 8 * k + 6 * bite - 14 * dozing);
          p.add('ear.L', -4 * bite, 0, -6 * bite * k);
          p.add('ear.R', -4 * bite, 0, 6 * bite * k);
          p.shift('toy', 0, -0.004 * bite, 0);
          this.nod(t, 5.2, 8.1, 0.35);
          // The jolt: the leaf nearly drops.
          const jolt = pulse(t, 8.1, 0.5);
          p.add('leg.FL', 14 * jolt);
          p.add('leg.FR', 14 * jolt);
          p.add('head', -14 * jolt);
          if (t > 8.1 && t < 8.15) this.hop.kick(0.5);
        },
      },
      doze: {
        // Sits and nods off, head sinking, then jerks upright and looks about as if nothing happened.
        weight: 2.2,
        length: [7.5, 7.5],
        when: () => this.posture !== 'lie' && !this.walking,
        face: 'asleep',
        start: () => {
          if (this.posture === 'stand') this.posture = 'sit';
        },
        pose: (t) => {
          this.nod(t, 0.4, 5.2, 0.5);
          const look = span(t, 5.7, 6.2, 6.9, 7.3);
          p.add('head', -4 * look, 24 * sin(t - 5.7, 0.5) * look);
          const bob = Math.sin(t * 2 * Math.PI * 0.35) * 0.4 * (t > 0.4 && t < 5.2 ? 1 : 0);
          p.add('head', 4 * bob);
        },
      },
      hug: {
        // Hugs the wall with all four paws, cheek against it, and dozes.
        weight: 2.5,
        length: [9, 12],
        when: wall,
        start: () => (this.posture = 'stand'),
        pose: (t) => {
          const k = span(t, 0.3, 1.2, this.actLength - 1.2, this.actLength - 0.3);
          p.add('body', 10 * k);
          p.add('leg.FL', -70 * k, 0, 6 * k);
          p.add('leg.FR', -70 * k, 0, -6 * k);
          p.add('leg.BL', 38 * k, 0, 10 * k);
          p.add('leg.BR', 38 * k, 0, -10 * k);
          p.add('head', 0, 0, 22 * k);
          p.add('ear.L', 0, 0, -12 * k);
          p.add('ear.R', 0, 0, 12 * k);
          this.drowseGoal = k * 0.9;
          p.shift('root', 0, 0, -0.01 * k);
        },
      },
      cling: {
        // On the wall: a slow climbing shuffle on the spot, paws reaching up in turn, looking round.
        weight: 2,
        length: [7, 9],
        when: wall,
        pose: (t) => {
          const k = span(t, 0.3, 1, this.actLength - 1, this.actLength - 0.3);
          const a = Math.sin(t * 2 * Math.PI * 0.5);
          p.add('leg.FL', (-50 - 28 * a) * k);
          p.add('leg.BR', (30 + 22 * a) * k);
          p.add('leg.FR', (-50 + 28 * a) * k);
          p.add('leg.BL', (30 - 22 * a) * k);
          p.add('body', 4 * a * k, 6 * a * k);
          p.add('head', -4 * k, 34 * sin(t, 0.22) * k);
          this.glow = k;
        },
      },
    };
  }

  /** Sat up, he holds his paws to his chest. */
  protected sitting() {
    super.sitting();
    this.puppet.add('leg.FL', -10);
    this.puppet.add('leg.FR', -10);
  }

  protected lying(breath: number) {
    super.lying(breath);
    this.puppet.add('head', 10);
  }

  protected express(_dt: number, _env: Env, _f: Feeling) {
    const d = this.drowse.y;
    const p = this.puppet;
    // Wherever he is, every so often he nods off for a few seconds and starts awake.
    if (d > 0.05) {
      p.add('head', 34 * d, 0, 8 * d);
      p.add('ear.L', -14 * d, 0, -10 * d);
      p.add('ear.R', -14 * d, 0, 10 * d);
      p.add('body', 5 * d);
      this.expression = d > 0.5 ? 'asleep' : 'sleepy';
    }
    if (this.startled > 0) {
      p.add('head', -16 * this.startled);
      p.add('ear.L', 22 * this.startled);
      p.add('ear.R', 22 * this.startled);
      this.expression = 'surprised';
    }
  }

  protected pose(dt: number, env: Env) {
    // Idle drowsiness: out of a 38 s cycle, about 6 s are spent nodding off, whatever he does.
    const free = ['idle', 'sit', 'stand', 'lookAround', 'sniff', 'tilt', 'scratch'].includes(
      this.act,
    );
    const cycle = this.t % 38;
    if (free && !this.walking && cycle > 25 && cycle < 31)
      this.drowseGoal = Math.max(this.drowseGoal, 1);
    if (free && !this.walking && cycle >= 31 && cycle < 31.5)
      this.startled = Math.max(this.startled, 1 - (cycle - 31) / 0.5);
    this.drowse.update(dt, this.drowseGoal);
    this.anatomy.turn = this.posture === 'lie' ? 60 : 45;
    super.pose(dt, env);
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    const s = Math.max(0.001, this.leaf.update(dt, this.leafGoal));
    p.stretch('toy', s, [0, 1, 0], s);
    this.leafGoal = 0;
    // Back to awake unless something asks again next frame.
    this.drowseGoal = 0;
    this.startled = 0;
    super.after(dt, env);
    this.chew = 0;
    this.glow = 0;
  }

  protected lights(time: number) {
    const o = this.outfit;
    const m = this.mood;
    let level = 0.5 + 0.1 * Math.sin(time * 0.8);
    let tone: string | undefined;
    if (m === 'asleep') level = 0.06 + 0.12 * (0.5 + 0.5 * Math.sin(time * 0.9));
    else if (m === 'sleepy') level = 0.22;
    else if (m === 'love') [level, tone] = [0.75 + 0.25 * Math.sin(time * 5), BEACON.love];
    else if (m === 'happy') [level, tone] = [0.85, BEACON.happy];
    else if (m === 'alarmed') [level, tone] = [Math.sin(time * 30) > 0 ? 1 : 0.4, BEACON.surprised];
    else if (m === 'curious') level = 0.85;
    level = Math.min(level, 1 - 0.8 * this.drowse.y);
    // The ear lights pulse with the chewing; the belly lamp breathes slowly.
    o.dot(0, clamp(level + 0.35 * this.chew + 0.2 * this.glow, 0, 1), tone);
    o.dot(1, clamp(level * (0.75 + 0.25 * Math.sin(time * 1.3)), 0, 1), tone);
  }
}
