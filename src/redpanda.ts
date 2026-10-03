import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import { Fluffy, span } from './fluffy';
import type { Feeling } from './pet';

/**
 * Russet, the robot red panda: rust and cream panels, a cream mask plate round the screen
 * face with two dark tear marks, white-tipped ears, dark socks, and a big tail of four pods
 * with a light band at each seam. The tail says everything: carried high and swept when she's
 * pleased, fluffed up when startled, and wrapped round her like a scarf to sleep.
 *
 * Her own tricks: rearing up on her hind legs with her arms raised to look big (tail
 * out and flashing, ears out), sleeping curled up with her tail round her, a curious peer
 * with the head cocked and the tail's tip hooked like a question mark, and a slow grand
 * sweep of the tail with the lights running down it. She sits with her tail wrapped round
 * her front paws. The rest is the fluffy base's: yawns, sniffs, scratching, shaking, hops.
 */
export const REDPANDA_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.3, 0.5],
    [0.7, 0.5],
  ],
  rx: 0.08,
  ry: 0.27,
  line: 0.035,
  mouth: null,
};

const TAIL = ['tail.1', 'tail.2', 'tail.3', 'tail.4'];

export class RedPanda extends Fluffy {
  /** The side she curls up on (+1 her left): the side facing us. */
  private side = 1;
  private run = 0;
  private flashing = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Russet',
        model: 'redpanda',
        metres: 0.4,
        width: 0.6,
        size: 0.85,
        face: REDPANDA_FACE,
        eyes: 0.66,
        tail: TAIL,
        tailAxis: [0, 0.1, -1],
        sit: -22,
        drop: { sit: -0.07, lie: -0.1 },
        speed: 1.2,
        lag: 0.9,
        turn: 50,
        moods: { calm: { carriage: -16 }, curious: { carriage: -6 } },
        actMoods: {
          loom: 'alarmed',
          peer: 'curious',
          tailSweep: 'calm',
        },
      },
      model,
    );
    this.dotCount = 0;
    this.acts = { ...this.acts, ...this.mine() };
  }

  private mine(): Record<string, Act> {
    const p = this.puppet;
    return {
      loom: {
        // Up on her hind legs, arms high, tail fluffed out: look how big she is. Then down.
        weight: 1.4,
        length: [5.5, 5.5],
        when: this.standing,
        pose: (t) => {
          const k = span(t, 0.2, 1, 4.2, 5);
          this.rear(k, -150);
          p.add('leg.FL', 0, 0, 40 * k);
          p.add('leg.FR', 0, 0, -40 * k);
          p.add('head', -14 * k, 6 * Math.sin(t * 5) * k);
          p.add('ear.L', 10 * k, 0, 24 * k);
          p.add('ear.R', 10 * k, 0, -24 * k);
          p.add('tail.1', 38 * k);
          TAIL.forEach((b, i) => i && p.add(b, 10 * k, 12 * Math.sin(t * 7 - i) * k));
          this.flashing = k;
        },
      },
      peer: {
        // A long curious look: head cocked one way, then the other, the tail's tip a question mark.
        weight: 1.2,
        length: [4.5, 5.5],
        when: () => this.posture !== 'lie' && this.still(),
        pose: (t) => {
          const k = span(t, 0.3, 0.9, this.actLength - 0.9, this.actLength - 0.3);
          const s = Math.sin(((t - 0.3) / 2.2) * Math.PI);
          p.add('head', 12 * k, 0, 26 * s * k);
          p.add('body', 6 * k);
          p.add('leg.FL', -10 * k);
          p.add('ear.L', 12 * k, 14 * s * k);
          p.add('ear.R', 12 * k, 14 * s * k);
          p.add('tail.1', 22 * k);
          p.add('tail.3', 20 * k);
          p.add('tail.4', 40 * k);
        },
      },
      tailSweep: {
        // The big tail swept slowly from side to side, the light riding along it.
        weight: 1,
        length: [4, 5],
        when: this.standing,
        pose: (t) => {
          const k = span(t, 0.3, 0.8, this.actLength - 0.8, this.actLength - 0.3);
          TAIL.forEach((b, i) =>
            p.add(b, 0, 40 * k * Math.sin(t * 2 * Math.PI * 0.5 - i * 0.5) * (i ? 0.7 : 1), 0),
          );
          p.add('tail.1', 20 * k);
          p.add('head', 0, 0, 5 * k);
          this.run = k;
        },
      },
    };
  }

  /** Sits on her haunches with her tail round her front paws. */
  protected sitting() {
    super.sitting();
    this.puppet.add('head', 4);
  }

  /** Curled up: head turned back along her side, the tail wrapped round like a scarf. */
  protected lying(breath: number) {
    const p = this.puppet;
    const s = this.side;
    p.add('leg.FL', 80);
    p.add('leg.FR', 80);
    p.add('leg.BL', -80);
    p.add('leg.BR', -80);
    p.add('head', 26 + 2 * breath, 58 * s, 10 * s);
  }

  protected tailLying() {
    const p = this.puppet;
    const s = this.side;
    p.add('tail.1', -20, -52 * s);
    p.add('tail.2', 0, -58 * s);
    p.add('tail.3', 0, -52 * s);
    p.add('tail.4', 6 + 3 * sin(this.t, 0.15), -42 * s);
  }

  protected express(_dt: number, env: Env, f: Feeling) {
    const p = this.puppet;
    if (this.posture !== 'lie') {
      // The tail's upper pods sweep sideways (a roll would only twist a tail that runs out behind).
      const [wag] = f.wag ?? [0, 0];
      const deg = wag * (this.walking ? 0.6 : 1);
      TAIL.forEach((bone, i) => {
        if (!i) return;
        const s = Math.sin(this.wagPhase - i * 0.7) * deg * 0.8;
        p.add(bone, 0, s, -s);
      });
    }
    // Sitting, the tail wraps round her front paws.
    if (
      this.posture === 'sit' &&
      !this.walking &&
      !['tailSweep', 'loom', 'peer'].includes(this.act)
    ) {
      const s = this.side;
      p.add('tail.1', -30, -42 * s);
      p.add('tail.2', 10, -46 * s);
      p.add('tail.3', 0, -46 * s);
      p.add('tail.4', 0, -36 * s);
    }
    if (this.mood === 'curious' && !['peer', 'loom'].includes(this.act))
      p.add('head', 0, 0, 8 * sin(env.time, 0.1));
  }

  protected pose(dt: number, env: Env) {
    const middle = (env.frame.left + env.frame.right) / 2;
    const toward = Math.sign(middle - this.s) || 1;
    this.side = -toward;
    this.anatomy.turn = this.posture === 'lie' ? 65 : this.act === 'loom' ? 15 : 50;
    super.pose(dt, env);
  }

  protected lights(time: number) {
    const o = this.outfit;
    const m = this.mood;
    const wave = (i: number, hz: number) =>
      0.5 + 0.5 * Math.sin(2 * Math.PI * (time * hz - i * 0.22));
    let tone: string | undefined;
    const bands = [0, 1, 2, 3].map((i) => 0.15 + 0.4 * Math.max(0, wave(i, 0.25)) ** 6);
    if (this.flashing) {
      const on = Math.sin(time * 14) > -0.2;
      bands.fill(on ? 1 : 0.25);
      tone = BEACON.surprised;
    } else if (this.run) {
      bands.forEach((_, i) => (bands[i] = wave(3 - i, 1.4)));
      tone = BEACON.happy;
    } else if (m === 'asleep') bands.fill(0.08 + 0.15 * (0.5 + 0.5 * Math.sin(time * 1.1)));
    else if (m === 'sleepy') bands.fill(0.25);
    else if (m === 'love') {
      bands.fill(0.7 + 0.3 * Math.sin(time * 5));
      tone = BEACON.love;
    } else if (m === 'happy') {
      bands.forEach((_, i) => (bands[i] = 0.4 + 0.6 * wave(i, 1.2)));
      tone = BEACON.happy;
    } else if (m === 'alarmed') {
      bands.fill(Math.sin(time * 30) > 0 ? 1 : 0.4);
      tone = BEACON.surprised;
    } else if (m === 'curious') bands.fill(0.8);
    if (this.act === 'dizzy') {
      tone = RAINBOW[Math.floor(time * 6) % RAINBOW.length];
      bands.forEach((_, i) => (bands[i] = wave(i, 3)));
    }
    this.flashing = this.run = 0;
    bands.forEach((level, i) => o.dot(i, clamp(level, 0, 1), tone));
    o.dot(
      4,
      clamp(m === 'asleep' ? 0.05 : 0.4 + (m === 'curious' ? 0.5 : 0) + 0.1 * Math.sin(time), 0, 1),
      tone,
    );
  }
}
