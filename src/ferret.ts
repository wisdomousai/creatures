import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import type { Act, Character, Env } from './character';
import type { Expression, FaceLayout } from './face';
import { sin } from './moves';
import { ease, Fluffy, pulse, span } from './fluffy';

/**
 * Wick, the robot ferret: a long noodle of a toy in three round segments joined by lit seam
 * rings (Dot1), short dark legs, a dark mask plate round his screen face, small round ears
 * and a long dark tail with a lit tip (Dot0). His body bends in the middle (`body` and
 * `chest` bones), so he can arch his back, flow like water and stand up like a periscope.
 *
 * Tricks: the war dance (sideways hops, back arched, mouth open, bumping into whatever is
 * near, the seam rings flashing), slinking low and flowing round a crewmate, flopping flat
 * for the dead ferret sleep with his legs out, and popping up periscope-style to look round.
 */
export const FERRET_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.29, 0.5],
    [0.71, 0.5],
  ],
  rx: 0.07,
  ry: 0.28,
  line: 0.035,
  mouth: null,
};

export class Ferret extends Fluffy {
  static readonly terms =
    'polecat weasel long noodle sausage cream tan brown dark mask segments rings tail slink flow war dance hop periscope flop sleep';

  private emote: Expression | null = null;
  private stage = 0;
  private mark = 0;
  private beat = 0;
  private dir = 1;
  private target: Character | null = null;
  private lit = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Wick',
        model: 'ferret',
        metres: 0.2,
        width: 0.62,
        size: 0.45,
        face: FERRET_FACE,
        eyes: 0.62,
        tail: ['tail.1', 'tail.2', 'tail.3'],
        tailAxis: [0, 1, 0.3],
        sit: -34,
        drop: { sit: -0.03, lie: -0.045 },
        speed: 1.1,
        lag: 1.0,
        turn: 55,
        feels: {
          chest: { f: 2.6, zeta: 0.5 },
          'ear.L': { f: 6, zeta: 0.3 },
          'ear.R': { f: 6, zeta: 0.3 },
        },
        moods: { calm: { wag: [8, 0.5] }, happy: { wag: [20, 2.2] } },
        actMoods: {
          warDance: 'happy',
          slink: 'curious',
          flop: 'asleep',
          periscope: 'curious',
        },
      },
      model,
    );
    this.dotCount = 2;
    this.acts = { ...this.acts, ...this.mine() };
  }

  /** The nearest crewmate along the floor, if any. */
  private closestMate(): Character | null {
    let best: Character | null = null;
    let d = Infinity;
    for (const o of this.mates()) {
      const k = Math.abs(o.s - this.s);
      if (k < d) [best, d] = [o, k];
    }
    return best;
  }

  private mine(): Record<string, Act> {
    const p = this.puppet;
    return {
      // The war dance: sideways hops, back arched, mouth open, bumping into things.
      warDance: {
        weight: 1.8,
        length: [5, 5],
        when: this.standing,
        start: () => {
          this.target = this.closestMate();
          const [lo, hi] = this.span(this.frame!);
          this.dir = this.target
            ? Math.sign(this.target.s - this.s) || 1
            : this.s - lo > hi - this.s
              ? -1
              : 1;
          this.beat = 0;
        },
        pose: (t) => {
          const k = ease(t, 0, 0.3) * (1 - ease(t, 4.4, 5));
          this.want.yaw = this.dir * 80 * k;
          // Arched back: the front tips down at the middle, the rear up.
          p.add('body', -10 * k);
          p.add('chest', 26 * k);
          p.add('head', -14 * k);
          p.add('tail.1', 20 * k);
          p.add('tail.2', 10 * k);
          this.emote = 'surprised';
          this.lit = k;
          const n = Math.floor((t - 0.4) / 0.42);
          if (t > 0.4 && t < 4.2 && n >= this.beat) {
            this.beat = n + 1;
            this.hop.kick(1.1);
            p.kick('body', 0, 0, this.dir * 160);
            p.kick('ear.L', -200, 0, -300);
            p.kick('ear.R', -200, 0, 300);
            const m = this.target;
            const near = m && Math.abs(m.s - this.s) < this.px * 0.5 + m.footprint(this.frame!).x;
            if (near && m) {
              // Bumps into them: a jolt, and they hop a little.
              m.hopUp(0.12);
              this.dir = -this.dir;
            }
            this.spec.speed = this.baseSpeed * 3;
            this.walkTo(this.s + this.dir * this.px * 0.14, this.depth);
          }
          const air = pulse(t, 0.4, 0.4);
          p.add('leg.FL', -14 * air);
          p.add('leg.FR', -14 * air);
        },
      },
      // Slinks low and flows round a crewmate: in front, behind, and round again.
      slink: {
        weight: 1.4,
        length: [11, 11],
        when: this.standing,
        start: () => {
          this.target = this.closestMate();
          this.stage = 0;
          this.dir = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          const m = this.target;
          const f = this.frame!;
          const k = ease(t, 0, 0.6) * (1 - ease(t, 10.2, 11));
          this.want.low = 0.03 * k;
          const w = sin(t, 0.9);
          p.add('body', 0, 14 * w * k);
          p.add('chest', 0, -22 * w * k);
          p.add('head', 6 * k, -14 * w * k);
          p.add('tail.1', 0, 18 * w * k);
          p.add('tail.2', 0, 0, 16 * w * k);
          this.emote = 'neutral';
          this.spec.speed = this.baseSpeed * 0.7;
          if (!m || m.state !== 'here') {
            // Nobody to flow round: an S along the floor.
            if (this.stage === 0) {
              this.stage = 1;
              const [lo, hi] = this.span(f);
              const way = this.s - lo > hi - this.s ? -1 : 1;
              this.walkTo(this.s + way * this.px * 0.6, Math.random());
            }
            return;
          }
          const r = m.footprint(f).x + this.px * 0.12;
          const pts: [number, number][] = [
            [m.s - this.dir * r, m.depth],
            [m.s, Math.min(1, m.depth + 0.28)],
            [m.s + this.dir * r, m.depth],
            [m.s, Math.max(0, m.depth - 0.28)],
            [m.s - this.dir * r, m.depth],
          ];
          if (this.stage < pts.length && this.there) {
            const [s, d] = pts[this.stage];
            this.stage++;
            this.walkTo(s, d);
          }
        },
      },
      // The dead ferret sleep: flat on the floor, legs out, head flopped, then a jolt awake.
      flop: {
        weight: 1.4,
        length: [11, 14],
        when: this.still,
        start: () => {
          this.posture = 'lie';
          this.beat = 0;
        },
        pose: (t) => {
          const L = this.actLength;
          p.add('head', 6, 0, 36 * ease(t, 0.8, 1.6));
          p.add('body', 0, 0, 5 * ease(t, 0.8, 1.6));
          // Dead asleep: a twitch of a paw now and then.
          const tw = pulse(t, 5, 0.3) + pulse(t, 8.4, 0.3);
          p.add('leg.FR', 0, 0, -20 * tw * Math.sin(t * 30));
          p.add('tail.2', 0, 0, 6 * sin(t, 0.2));
          if (t > L - 1.2 && this.beat === 0) {
            this.beat = 1;
            this.posture = 'stand';
            this.hop.kick(1.2);
            p.kick('head', -240, 0, -300);
          }
          this.emote = t > L - 1.2 ? 'surprised' : null;
        },
      },
      // Pops up periscope-style: front end straight up, head turning to look all round.
      periscope: {
        weight: 1.6,
        length: [6, 6],
        when: this.standing,
        pose: (t) => {
          const k = ease(t, 0.1, 0.7) * (1 - ease(t, 5.2, 6));
          p.add('body', -48 * k);
          p.add('leg.BL', 48 * k);
          p.add('leg.BR', 48 * k);
          p.add('chest', -32 * k);
          p.add('leg.FL', -40 * k);
          p.add('leg.FR', -40 * k);
          p.add('head', 26 * k + 4 * sin(t, 2) * k, 52 * sin(t, 0.28) * k);
          p.add('ear.L', 12 * k);
          p.add('ear.R', 12 * k);
          p.add('tail.1', -10 * k);
          this.emote = Math.sin(t * 1.76) > 0.8 ? 'surprised' : 'neutral';
          if (t > 0.5 && this.beat !== 7) {
            this.beat = 7;
            this.hop.kick(0.5);
          }
        },
      },
    };
  }

  /** Flat on his tummy with his legs splayed out, the body spread low. */
  protected lying(breath: number) {
    const p = this.puppet;
    p.add('leg.FL', 0, 0, 62);
    p.add('leg.FR', 0, 0, -62);
    p.add('leg.BL', 0, 0, 62);
    p.add('leg.BR', 0, 0, -62);
    p.add('head', 14 + 2 * breath);
    p.add('chest', 4 + breath);
    p.add('tail.1', -20);
  }

  protected pose(dt: number, env: Env) {
    if (this.act !== 'slink' && this.act !== 'warDance') this.spec.speed = this.baseSpeed;
    if (this.act !== 'warDance') this.lit = 0;
    super.pose(dt, env);
    if (this.walking) {
      const g = Math.sin(this.gait);
      this.puppet.add('body', 0, 6 * g);
      this.puppet.add('chest', 0, -9 * g);
      this.puppet.add('tail.1', 0, 8 * g);
    }
  }

  protected after(dt: number, env: Env) {
    if (this.emote) this.expression = this.emote;
    this.emote = null;
    super.after(dt, env);
  }

  protected lights(time: number) {
    const o = this.outfit;
    const m = this.mood;
    const asleep = m === 'asleep';
    let tip = asleep ? 0.1 : 0.35 + 0.15 * Math.sin(time * 0.9);
    let seam = asleep ? 0.08 : 0.3 + 0.1 * Math.sin(time * 1.1);
    let tone: string | undefined;
    if (m === 'happy') [seam, tip, tone] = [0.85, 0.8, BEACON.happy];
    else if (m === 'love') [seam, tip, tone] = [0.7 + 0.3 * Math.sin(time * 5), 0.8, BEACON.love];
    else if (m === 'alarmed') [seam, tone] = [Math.sin(time * 30) > 0 ? 1 : 0.3, BEACON.surprised];
    if (this.lit > 0.3) {
      // The seam rings chase along him during the war dance.
      tone = RAINBOW[Math.floor(time * 9) % RAINBOW.length];
      seam = 0.5 + 0.5 * Math.sin(time * 18);
    }
    if (this.act === 'dizzy') tone = RAINBOW[Math.floor(time * 6) % RAINBOW.length];
    o.dot(0, Math.max(0, Math.min(1, tip)), tone);
    o.dot(1, Math.max(0, Math.min(1, seam)), tone);
  }
}
