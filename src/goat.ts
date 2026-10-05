import type { Object3D } from 'three';
import { BEACON } from './bolt';
import { type Act, type Character, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import type { Anatomy } from './pet';
import { HOOF_ACT_MOODS, Hoofed, hoofFeels, hoofMoods } from './hooves';
import { pulse, ramp } from './kitties';
import type { Prop } from './props';

/**
 * Jink, the robot goat kid: a lean, springy toy with two upright ears, little horn nubs
 * tipped with lit caps (Dot2), a beard plate and a perky tail. She springs up onto whatever
 * is in reach (a crate, a block; with nothing near, a stiff-legged leap in the air), butts a
 * crewmate (rears, bonks, and nobody is hurt: the crewmate just hops), bleats with a toss of
 * her head, and prances sideways with all four legs stiff.
 */
export const GOAT_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.28, 0.5],
    [0.72, 0.5],
  ],
  rx: 0.09,
  ry: 0.24,
  line: 0.04,
  mouth: null,
};

const GOAT: Anatomy = {
  tail: ['tail.1', 'tail.2'],
  tailAxis: [0, 0.3, 1],
  earsHang: false,
  moods: hoofMoods(14),
  actMoods: {
    ...HOOF_ACT_MOODS,
    springUp: 'happy',
    butt: 'annoyed',
    bleat: 'happy',
    prance: 'happy',
    twirl: 'happy',
  },
  lying: 'calm',
  hover: 'happy',
  drop: { stand: 0, sit: -0.08, lie: -0.1 },
  sit: -14,
  turn: 50,
};

export class Goat extends Hoofed {
  static readonly terms =
    'billy nanny baby horns beard ears upright cream white tan brown legs springy jump leap climb bleat butt prance perky tail';

  protected readonly anatomy = GOAT;
  protected readonly build = { middle: 0.3, spring: 1.1, speed: 1 };
  /** How lit the horn caps are, 0..1 (set by tricks, fades). */
  private glow = 0;
  private stage = 0;
  private mark = 0;
  private host: Prop | null = null;
  private victim: Character | null = null;

  constructor(model: Object3D) {
    super(
      {
        name: 'Jink',
        model: 'goat',
        metres: 0.58,
        width: 0.5,
        size: 0.95,
        feels: hoofFeels(2, { 'ear.L': { f: 3, zeta: 0.3 }, 'ear.R': { f: 3, zeta: 0.3 } }),
        face: GOAT_FACE,
        eyes: 0.78,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.9 },
          { bone: 'body', yaw: 0.15, pitch: 0 },
        ],
        reach: { yaw: 60, pitch: 30 },
        lag: 0.6,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 1.1,
      },
      model,
    );
    this.fold = { front: [-70, 150], back: [-65, 135] };
    this.lieDrop = -0.1;
    this.reach = { head: 60, neck: 0, body: 12 };
    this.knee = 32;
    this.pokeAct = 'bleat';
    this.adopt(
      {
        springUp: 1.6,
        butt: 1.2,
        bleat: 1.4,
        prance: 1.3,
        twirl: 0.7,
        graze: 1,
        chew: 0.5,
        lie: 0.7,
        stand: 2,
        shake: 0.8,
        buck: 0.8,
        stamp: 0.5,
        toss: 0.5,
        yawn: 0.6,
        tilt: 1,
        sneeze: 0.5,
        dozeOff: 0.4,
        fallOver: 0.4,
        circle: 0.6,
        zoomies: 0.8,
        frontLip: 0.4,
        backWall: 0.4,
        watch: 0.6,
      },
      this.moves(),
    );
  }

  /** The nearest thing on the floor she could stand on: a prop with a top, not too tall. */
  private findPerch(env: Env): Prop | null {
    let best: Prop | null = null;
    let near = this.heightPx * 7;
    for (const b of env.props ?? []) {
      const p = b as Prop;
      if (typeof p.seatPx !== 'function' || p.rise < 0.9 || p.heldBy || p.on) continue;
      if (
        p.heightPx(env.frame) > this.heightPx * 1.2 ||
        p.heightPx(env.frame) < this.heightPx * 0.2
      )
        continue;
      if (p.kind.moves !== 'still' && !p.kind.stacks) continue;
      const d = Math.abs(p.s - this.s);
      if (d < near) [best, near] = [p, d];
    }
    return best;
  }

  private dismount() {
    if (this.standOn > 0 && !this.hopping) {
      this.hopOnto(this.s + this.roomy() * this.heightPx * 0.5, this.depth, 0, 0.5, 0.2);
    }
    this.perched = false;
  }

  private moves(): Record<string, Act> {
    const p = () => this.puppet;
    const stand = () => this.standing;
    return {
      // Springs up onto a crate or block in reach, stands proud, bleats, hops down. With
      // nothing near: a stiff-legged leap straight up.
      springUp: {
        weight: 0,
        length: [9, 9],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.stage = 0;
          this.mark = 0;
          this.host = this.findPerch(this.env);
          this.run.dir = this.host ? Math.sign(this.host.s - this.s) || 1 : this.roomy();
          if (!this.host) this.actLength = 2.6;
        },
        pose: (t) => {
          const f = this.env.frame;
          const h = this.host;
          if (!h) {
            // The leap in the air: crouch, spring, legs stiff and splayed, land.
            const crouch = ramp(t, 0, 0.4) * (t < 0.7 ? 1 : 0);
            p().add('body', 8 * crouch);
            this.extraLift = -0.03 * crouch;
            if (t > 0.7 && !this.run.done) {
              this.run.done = true;
              this.hop.kick(3.4 * this.build.spring);
            }
            const air = pulse(t, 0.7, 0.9);
            p().add('leg.FL', -30 * air);
            p().add('leg.FR', -30 * air);
            p().add('leg.BL', 28 * air);
            p().add('leg.BR', 28 * air);
            p().add('head', -16 * air, 20 * air * sin(t, 1.2));
            p().add('ear.L', 0, 0, -25 * air);
            p().add('ear.R', 0, 0, 25 * air);
            this.glow = air;
            this.emote = 'happy';
            this.pupils = 1;
            return;
          }
          if (h.rise < 0.5 || h.heldBy) {
            if (this.stage < 3) this.dismount();
            this.stage = 4;
          }
          const stop = this.heightPx * 0.55 + h.footprint(f).x;
          if (this.stage === 0) {
            // Trots up to its side.
            this.boost = 1.6;
            this.walkTo(h.s - this.run.dir * stop, h.depth);
            this.lookAtFloor(h.s);
            if (this.atStop || t > 4) {
              this.stage = 1;
              this.mark = t;
              this.goal = null;
            }
          } else if (this.stage === 1) {
            // Crouch, then spring.
            const k = ramp(t - this.mark, 0, 0.35);
            p().add('body', 10 * k);
            this.extraLift = -0.03 * k;
            this.lookAtFloor(h.s);
            p().add('head', -16 * k);
            if (t - this.mark > 0.45) {
              this.stage = 2;
              this.hopOnto(h.s, h.depth, h.seatPx(f) + h.h, 0.65, 0.55);
              this.mark = t;
            }
          } else if (this.stage === 2) {
            const a = pulse(t - this.mark, 0, 0.65);
            p().add('leg.FL', -35 * a);
            p().add('leg.FR', -35 * a);
            p().add('leg.BL', 25 * a);
            p().add('leg.BR', 25 * a);
            p().add('body', -10 * a);
            if (!this.hopping) {
              this.stage = 3;
              this.mark = t;
              this.perched = true;
              this.hop.kick(0.6);
            }
          } else if (this.stage === 3) {
            // King of the crate: head high, a bleat or two, the horns lit.
            const u = t - this.mark;
            const k = pulse(u, 0.2, 0.9) + 0.8 * pulse(u, 1.4, 0.9);
            this.glow = Math.min(1, k);
            this.mouth = 0.6 * Math.min(1, k);
            p().add('head', -14 - 8 * k, 14 * sin(u, 0.5));
            p().add('body', -4);
            p().add('tail.1', 0, 20 * sin(u, 4));
            this.emote = 'happy';
            if (u > 2.8) {
              this.stage = 4;
              this.dismount();
              this.mark = t;
            }
          } else {
            this.emote = 'happy';
            if (!this.hopping && t - this.mark > 0.8) this.endAct();
          }
        },
      },
      // A playful head-butt at a crewmate: rears, bonks (they only hop), trots off pleased.
      butt: {
        weight: 0,
        length: [9, 9],
        when: () => stand() && this.others().length > 0,
        start: () => {
          this.posture = 'stand';
          this.stage = 0;
          const all = this.others();
          this.victim = all[Math.floor(Math.random() * all.length)];
        },
        pose: (t) => {
          const o = this.victim;
          if (!o || o.state !== 'here') return this.endAct();
          this.lookAtMate(o, 0.9);
          this.pupils = 1;
          const dir = Math.sign(o.s - this.s) || 1;
          if (this.stage === 0) {
            this.boost = 1.7;
            this.emote = 'focused';
            p().add('head', 10);
            this.walkTo(o.s, o.depth);
            if (this.spaceTo(o, this.env.frame).n < 1.6 || t > 5) {
              this.stage = 1;
              this.mark = t;
              this.goal = null;
              this.depthGoal = this.depth;
            }
          } else if (this.stage === 1) {
            // Rears up on her hind legs, front hooves tucked, head down and aimed.
            const u = t - this.mark;
            const k = ramp(u, 0, 0.5);
            p().add('body', -28 * k);
            p().add('leg.BL', 28 * k);
            p().add('leg.BR', 28 * k);
            p().add('leg.FL', -50 * k);
            p().add('leg.FR', -50 * k);
            p().add('head', 40 * k);
            this.extraLift = 0.01 * k;
            this.glow = k;
            this.emote = 'focused';
            if (u > 0.7) {
              this.stage = 2;
              this.mark = t;
              this.hop.kick(1.6);
              o.hopUp(0.25);
            }
          } else if (this.stage === 2) {
            // Bonk: down on all fours, head thrust forward.
            const u = t - this.mark;
            const k = pulse(u, 0, 0.5);
            p().add('body', 18 * k);
            p().add('head', 28 * k);
            p().add('leg.FL', -20 * k);
            p().add('leg.FR', -20 * k);
            this.glow = 1;
            this.mouth = 0.2;
            this.emote = 'happy';
            if (u > 0.6) {
              this.stage = 3;
              this.mark = t;
              this.walkTo(this.s - dir * this.heightPx * 1.5, this.depth);
            }
          } else {
            // Away, tail up, delighted.
            this.boost = 1.6;
            this.emote = 'happy';
            p().add('body', -6);
            p().add('tail.1', 0, 25 * sin(t, 5));
            if (t - this.mark > 1.2 || this.atStop) this.endAct();
          }
        },
      },
      // A bleat: head back, mouth open, a toss from side to side, ears and horns lit.
      bleat: {
        weight: 0,
        length: [3, 3],
        when: () => !this.walking && this.posture !== 'sit',
        pose: (t) => {
          const k = pulse(t, 0.2, 0.9) + 0.8 * pulse(t, 1.4, 1);
          const m = Math.min(1, k);
          this.glow = m;
          this.mouth = 0.65 * m;
          p().add(
            'head',
            (this.posture === 'lie' ? -8 : -24) * m,
            22 * m * sin(t, 1.8),
            10 * m * sin(t, 1.8, 0.25),
          );
          p().add('body', -3 * m);
          p().add('tail.1', 0, 26 * m * sin(t, 6));
          p().add('ear.L', 0, 0, -18 * m);
          p().add('ear.R', 0, 0, 18 * m);
          this.emote = 'happy';
          if (t > 0.25 && !this.run.done) {
            this.run.done = true;
            this.hop.kick(0.8 * this.build.spring);
          }
        },
      },
      // Prances sideways: legs stiff, head high, hopping along at an angle.
      prance: {
        weight: 0,
        length: [4, 4],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.run.dir = this.roomy();
          this.run.n = 0;
        },
        pose: (t) => {
          const k = ramp(t, 0, 0.25) * (1 - ramp(t, 3.5, 4));
          p().add('root', 0, -this.heading.y * k + this.run.dir * 60 * k);
          const air = Math.max(0, sin(t, 1.8)) * k;
          p().add('leg.FL', -22 * air);
          p().add('leg.BR', 22 * air);
          p().add('leg.FR', 10 * air);
          p().add('leg.BL', -10 * air);
          p().add('head', -12 * k, 14 * sin(t, 0.9), 8 * sin(t, 0.9, 0.25));
          p().add('body', -6 * k);
          p().add('tail.1', 8 * k);
          this.pupils = 1;
          this.emote = 'happy';
          if (t > 0.4 && t < 3.4) {
            const n = Math.floor((t - 0.4) / 0.55);
            if (n >= this.run.n) {
              this.run.n = n + 1;
              this.hop.kick(1.5 * this.build.spring);
              this.boost = 3;
              this.walkTo(this.s + this.run.dir * this.heightPx * 0.5, this.depth);
            }
          }
        },
      },
      // A twirl for joy: a hop and a spin on the spot.
      twirl: {
        weight: 0,
        length: [1.5, 1.5],
        when: stand,
        start: () => {
          this.spin = 1;
          this.hop.kick(1.5 * this.build.spring);
        },
        pose: () => {
          this.emote = 'happy';
          p().add('head', 6, -16);
          p().add('tail.1', 0, 25 * sin(this.actT, 6));
        },
      },
    };
  }

  protected idle(t: number) {
    this.glow = 0;
    super.idle(t);
    // Never left standing on something when the act that put her there has gone.
    if (this.act !== 'springUp' && (this.perched || this.standOn > 0)) this.dismount();
  }

  protected after(dt: number, env: Env) {
    super.after(dt, env);
    const o = this.outfit;
    if (!o) return;
    const quiet = this.mood === 'asleep' || this.posture === 'lie' ? 0.1 : 0.3;
    o.dot(2, clamp(quiet + this.glow, 0, 1));
    o.beacon(BEACON[this.expression] ?? '#f4f4f1');
  }
}
