import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { Expression, FaceLayout } from './face';
import { sin } from './moves';
import { ease, Fluffy, span } from './fluffy';
import type { Feeling } from './pet';
import { Spring } from './spring';

/**
 * Stump, the robot beaver: a round brown toy with a pale belly plate, two big lit front teeth
 * (Dot0), small round ears, stubby hands, big flat webbed back feet and a flat paddle tail
 * crosshatched with lit grooves (Dot1) whose light runs across it when she is pleased.
 *
 * Her own tricks: gnawing a little log (it comes up on the floor, she sits up with it in both
 * hands and chews it down, the teeth flashing with each bite, till one end is a point),
 * slapping the paddle on the floor (up it goes, down with a crack, a ring of light flashes
 * where it lands, twice or three times), combing her fur with her fingers, and chattering her
 * teeth. The log and the flash are on bones of their own and put away otherwise.
 */
export const BEAVER_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.3, 0.5],
    [0.7, 0.5],
  ],
  rx: 0.08,
  ry: 0.28,
  line: 0.035,
  mouth: null,
};

const TAIL = ['tail.1', 'tail.2'];

export class Beaver extends Fluffy {
  static readonly terms =
    'dam builder rodent buck teeth brown chestnut cream belly paddle tail flat webbed feet gnaw log chew slap chatter round wood';

  private log = new Spring(6, 0.45, 1.3);
  private logGoal = 0;
  private logLen = 1;
  private flash = new Spring(14, 0.5, 1.2);
  private flashGoal = 0;
  private hold = { x: 0, y: 0, z: 0 };
  private bite = 0;
  private slapped = 0;
  private emote: Expression | null = null;

  constructor(model: Object3D) {
    super(
      {
        name: 'Stump',
        model: 'beaver',
        metres: 0.33,
        width: 0.52,
        size: 0.75,
        face: BEAVER_FACE,
        eyes: 0.7,
        tail: TAIL,
        tailAxis: [0, 0.05, -1],
        sit: -26,
        drop: { sit: -0.06, lie: -0.08 },
        speed: 0.95,
        lag: 1.05,
        turn: 50,
        moods: {
          calm: { carriage: -6, wag: [3, 0.3] },
          happy: { wag: [8, 1.6] },
          curious: { carriage: 4 },
        },
        actMoods: { gnaw: 'calm', slap: 'alarmed', comb: 'calm', chatter: 'happy' },
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
      gnaw: {
        // A little log comes up on the floor; she picks it up, sits up with it in both hands
        // and gnaws it to a point, the teeth flashing with each bite.
        weight: 1.7,
        length: [11, 11],
        when: floor,
        start: () => (this.logLen = 1),
        pose: (t) => {
          const L = 11;
          this.logGoal = ease(t, 0.3, 0.9) * (1 - ease(t, L - 1.3, L - 0.7));
          const reach = span(t, 1, 1.8, 2.2, 2.9);
          const up = span(t, 2.4, 3.4, L - 2.2, L - 1.2);
          p.add('body', 10 * reach);
          p.add('leg.FL', -62 * reach, 0, -6 * reach);
          p.add('leg.FR', -62 * reach, 0, 6 * reach);
          p.add('head', 14 * reach);
          this.rear(up, -34);
          p.add('leg.FL', 0, 0, -10 * up);
          p.add('leg.FR', 0, 0, 10 * up);
          const chew = Math.max(0, sin(t, 3.4)) * up;
          this.bite = chew;
          p.add('head', -14 * up + 7 * chew, 4 * sin(t, 1.7) * up);
          p.add('ear.L', 6 * chew);
          p.add('ear.R', 6 * chew);
          p.add('tail.1', 8 * up);
          this.logLen = 1 - 0.28 * ease(t, 3.6, L - 2.4);
          this.hold.y = (reach * 0.02 + up * 0.14) * 1;
          this.hold.z = -0.05 * up;
          this.hold.x = 0.004 * chew;
          this.emote = up > 0.6 ? 'happy' : null;
        },
      },
      slap: {
        // The paddle goes up and comes down flat on the floor with a crack and a flash of
        // light, two or three times, her head up, ears back, quite cross.
        weight: 1.4,
        length: [6.5, 6.5],
        when: floor,
        start: () => (this.slapped = 0),
        pose: (t) => {
          const k = span(t, 0.2, 0.8, 5.6, 6.3);
          const n = Math.floor((t - 0.9) / 1.5);
          const u = t - 0.9 - n * 1.5;
          // Up (0..0.8), down fast (0.8..0.95), rest.
          let up = ease(u, 0, 0.8) * (1 - ease(u, 0.8, 0.93));
          if (t < 0.9 || n > 2) up = 0;
          const raised = Math.max(up, k * 0.3);
          p.add('tail.1', 52 * raised * k);
          p.add('tail.2', 34 * raised * k);
          p.add('body', -6 * raised * k);
          p.add('head', -8 * k);
          p.add('leg.FL', -10 * k);
          p.add('leg.FR', -10 * k);
          p.add('ear.L', -20 * k, 0, 8 * k);
          p.add('ear.R', -20 * k, 0, -8 * k);
          if (t > 0.9 && n <= 2 && u > 0.93 && u < 1.2 && this.slapped <= n) {
            this.slapped = n + 1;
            this.hop.kick(0.9);
            this.flashGoal = 1;
          }
          if (u > 0.93 && u < 1.15 && n <= 2 && t > 0.9) this.flashGoal = 1;
          this.emote = 'cross';
        },
      },
      comb: {
        // Sits up and combs her fur with her fingers: a hand down the cheek, then the other
        // down her chest, her head tilting into it.
        weight: 1.2,
        length: [7, 7],
        when: floor,
        start: () => (this.posture = 'sit'),
        pose: (t) => {
          const k = span(t, 0.4, 1.2, 5.8, 6.6);
          const a = Math.sin(t * 2 * Math.PI * 1.2);
          const b = Math.sin(t * 2 * Math.PI * 1.2 + Math.PI);
          const sa = Math.max(0, a);
          const sb = Math.max(0, b);
          p.add('leg.FL', (-90 + 52 * sa) * k, 0, -12 * sa * k);
          p.add('leg.FR', (-90 + 52 * sb) * k, 0, 12 * sb * k);
          p.add('head', 4 * k, 0, (a > 0 ? 12 : -12) * k * Math.abs(a));
          p.add('ear.L', 8 * k * sa);
          p.add('ear.R', 8 * k * sb);
          this.emote = 'happy';
        },
      },
      chatter: {
        // Chatters her big teeth: a rattle of the head, the teeth lights stuttering.
        weight: 1,
        length: [3.4, 3.4],
        when: this.standing,
        pose: (t) => {
          const k = span(t, 0.2, 0.5, 2.8, 3.2);
          const r = Math.sin(t * 2 * Math.PI * 9) * k;
          p.add('head', 4 * r + 4 * k, 0, 2.5 * r);
          p.add('body', 1.5 * r);
          p.add('ear.L', 8 * r);
          p.add('ear.R', 8 * r);
          this.bite = Math.max(0, Math.sin(t * 2 * Math.PI * 9)) * k;
          p.add('tail.2', 0, 0, 12 * k * sin(t, 2.5));
          this.emote = 'happy';
        },
      },
    };
  }

  protected sitting() {
    super.sitting();
    this.puppet.add('head', 4);
  }

  protected lying(breath: number) {
    super.lying(breath);
    this.puppet.add('head', 8);
  }

  protected express(_dt: number, env: Env, f: Feeling) {
    const p = this.puppet;
    if (this.posture !== 'lie') {
      // The flat tail sways with the mood, the paddle trailing the stub.
      const [wag] = f.wag ?? [0, 0];
      p.add('tail.2', 0, Math.sin(this.wagPhase - 0.8) * wag * 0.5, 0);
    }
    if (this.mood === 'curious' && !['gnaw', 'comb'].includes(this.act))
      p.add('head', 0, 0, 7 * sin(env.time, 0.1));
  }

  protected pose(dt: number, env: Env) {
    this.anatomy.turn = this.posture === 'lie' ? 60 : 50;
    super.pose(dt, env);
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    const s = Math.max(0.001, this.log.update(dt, this.logGoal));
    p.stretch('toy', s * this.logLen, [1, 0, 0], s);
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
    const f = Math.max(0.001, this.flash.update(dt, this.flashGoal));
    p.stretch('flash', f, [0, 1, 0], f);
    this.logGoal = this.flashGoal = 0;
    this.hold.x = this.hold.y = this.hold.z = 0;
    if (this.emote) this.expression = this.emote;
    this.emote = null;
    super.after(dt, env);
    this.bite = 0;
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
    // The teeth: a steady glow, a flash with each bite.
    o.dot(0, clamp(Math.max(level * 0.8, this.bite), 0, 1), this.bite > 0.5 ? BEACON.happy : tone);
    // The paddle's grooves: a slow shimmer, brighter when she is pleased or has just slapped.
    const glad = m === 'happy' || m === 'love';
    const shimmer = 0.3 + 0.3 * Math.max(0, Math.sin(time * 1.4)) ** 3;
    o.dot(
      1,
      clamp(m === 'asleep' ? 0.06 : shimmer + (glad ? 0.4 : 0) + (m === 'alarmed' ? 0.5 : 0), 0, 1),
      tone,
    );
    o.dot(2, 1, BEACON.surprised);
  }
}
