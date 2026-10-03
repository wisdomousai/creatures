import type { Object3D } from 'three';
import type { Act, Env } from './character';
import type { FaceLayout } from './face';
import { Jobbot } from './jobbot';
import { sin } from './moves';
import { smooth } from './toybot';

/**
 * Clink, a toy knight in tin armour: a round helmet whose visor (a brow plate and a chin
 * plate with an eye slit between) flips up to show the whole screen face, a plume of red
 * pods on a crest, a breastplate with pauldrons, tin boots, a heater shield with a lit emblem
 * on the left arm and a tiny lance with a pennant in the right hand.
 *
 * Tricks: a brave charge with the lance levelled that wobbles and ends in a trip, a salute
 * with the visor up, hiding behind the shield when poked (and when something startles him),
 * a proud stance with the plume nodding, flipping the visor up to wink, a twirl of the lance
 * and a rattle of armour; and the shared ones. The lance is held upright through all the
 * shared poses (the hand turns against the arm).
 */
export const KNIGHT_FACE: FaceLayout = {
  width: 512,
  height: 350,
  eyes: [
    [0.3, 0.46],
    [0.7, 0.46],
  ],
  rx: 0.085,
  ry: 0.2,
  line: 0.034,
  mouth: [0.5, 0.78],
};

const GOLD = '#ffd35c';
const PLUME = '#ff7a5c';

export class Knight extends Jobbot {
  private fx = {
    visor: 0, // 0 closed .. 1 flipped up
    glint: 0, // the emblem and lance tip brighten
    plume: 0, // extra sway
  };

  constructor(model: Object3D) {
    super(
      {
        name: 'Clink',
        model: 'knight',
        metres: 0.76,
        width: 0.55,
        size: 1.0,
        feels: {
          default: { f: 2.4, zeta: 0.5 },
          root: { f: 2.4, zeta: 0.7 },
          body: { f: 2.2, zeta: 0.5 },
          head: { f: 2, zeta: 0.4, r: 0.4 },
          visor: { f: 4, zeta: 0.28 },
          plume: { f: 2.6, zeta: 0.18 },
          'upper_arm.L': { f: 2.8, zeta: 0.45 },
          'upper_arm.R': { f: 2.8, zeta: 0.45 },
          'forearm.L': { f: 3.2, zeta: 0.4 },
          'forearm.R': { f: 3.2, zeta: 0.4 },
          'hand.R': { f: 3.2, zeta: 0.4 },
          'hand.L': { f: 3.2, zeta: 0.4 },
          'leg.L': { f: 3, zeta: 0.5 },
          'leg.R': { f: 3, zeta: 0.5 },
        },
        face: KNIGHT_FACE,
        eyes: 0.7,
        gaze: [
          { bone: 'head', yaw: 0.7, pitch: 0.6 },
          { bone: 'body', yaw: 0.2, pitch: 0.1 },
        ],
        reach: { yaw: 50, pitch: 26 },
        lag: 1.2,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [60, 130],
        speed: 0.75,
      },
      model,
    );
    this.acts = { ...this.common(), ...this.moves() };
  }

  /** The lance arm: the hand turns against the arm so the lance ends at `net` degrees from
   * upright (positive: the point leans forward). */
  private armR(forward: number, raise = 0, bend = 0, net = 0) {
    this.arm(-1, forward, raise, bend);
    this.puppet.add('hand.R', forward + bend + net);
  }

  protected hands(forward: number, raise = 0, bend = 0) {
    this.arms(forward, raise, bend);
    this.puppet.add('hand.R', forward + bend);
    this.puppet.add('hand.L', forward + bend);
  }

  protected walkArms(a: number, amt: number) {
    this.arm(1, 10 * a * amt, 10 * amt, 0);
    this.armR(-10 * a * amt, 8 * amt, 10);
  }

  protected delight() {
    this.setAct('peek');
  }

  private moves(): Record<string, Act> {
    const p = this.puppet;
    const ok = () => this.free_;
    const shield = (k: number) => {
      // The shield up across the face, the head tucked behind it.
      this.arm(1, 42 * k, -40 * k, 28 * k);
      p.add('hand.L', 70 * k);
      p.add('head', 24 * k);
      p.add('body', 22 * k);
    };
    return {
      // Lance levelled, a brave run, a wobble, and over he goes.
      charge: {
        weight: 2.4,
        length: [9, 9],
        face: 'focused',
        when: ok,
        start: () =>
          this.stroll(Math.random() < 0.5 ? -1 : 1, this.heightPx * (3 + Math.random() * 1.5)),
        pose: (t) => {
          const since = this.since(t);
          const run = smooth(t / 0.5);
          if (since < 0.1) {
            // Charging: lance level, leaning in, bobbing.
            const a = Math.sin(this.gait * 1.3);
            this.armR(78 * run, 6, 8, 90 * run);
            this.arm(1, 40 * run, 20, 80 * run);
            p.add('body', 14 * run, 0, 3 * a * run);
            p.add('head', -6 * run);
            p.add('plume', -10 * run);
            this.jb.hop = Math.max(this.jb.hop, 0.012 * Math.abs(Math.cos(this.gait * 1.3)) * run);
            this.fx.glint = run;
            this.expression = 'focused';
            if (since >= 0) p.kick('body', 120, 0, 0);
            return;
          }
          // The trip: he pitches forward, the lance flies up, then he sits up, dizzy.
          const s = since;
          const fall = smooth(s / 0.35) * smooth((2.4 - s) / 0.7);
          p.add('body', 62 * fall);
          p.add('head', 20 * fall);
          this.armR(150 * fall, 30 * fall, 10, 60 * fall);
          this.arm(1, 140 * fall, 40 * fall, 20);
          p.add('leg.L', -40 * fall);
          p.add('leg.R', 30 * fall);
          p.add('plume', 25 * fall + 15 * Math.sin(s * 11) * Math.max(0, 1 - s / 2));
          this.jb.hop = this.arc(s, 0, 0.35, 0.03);
          this.fx.visor = s > 0.4 && s < 2.2 ? 1 : 0;
          this.expression = s < 0.5 ? 'surprised' : s < 2.2 ? 'dizzy' : 'sheepish';
          if (s > 2.4) {
            this.hands(10, 25, 20);
            if (s > 3 && s < 4.2) p.add('head', 0, 0, 8 * Math.sin(s * 9));
          }
        },
      },
      // Visor up, a crisp salute.
      salute: {
        weight: 1.8,
        length: [5, 5],
        face: 'happy',
        when: ok,
        pose: (t) => {
          const k = smooth((t - 0.2) / 0.45) * smooth((4.5 - t) / 0.5);
          this.fx.visor = smooth((t - 0.2) / 0.3) * smooth((4.7 - t) / 0.3);
          this.armR(142 * k, 30 * k, 112 * k, 0);
          p.add('head', -8 * k);
          p.add('body', -4 * k);
          p.add('plume', 6 * k);
          this.fx.glint = k;
          if (t > 2.4 && t < 3) p.kick('visor', -60, 0, 0);
        },
      },
      // Ducks behind the shield and peeks over the top.
      hide: {
        weight: 1.5,
        length: [5, 5],
        when: ok,
        pose: (t) => {
          const k = smooth((t - 0.15) / 0.25) * smooth((4.8 - t) / 0.4);
          shield(k);
          p.add('leg.L', 8 * k);
          p.add('leg.R', 8 * k);
          this.expression = t < 2.4 ? 'surprised' : 'sheepish';
          // Peeks: the shield comes down a hair, the visor lifts.
          const peek = smooth((t - 2.4) / 0.4) * smooth((4 - t) / 0.4);
          this.arm(1, -14 * peek, 0, -18 * peek);
          this.fx.visor = peek;
          p.add('plume', 6 * Math.sin(t * 20) * (t < 2 ? 1 : 0.2));
        },
      },
      // Stands tall, chest out, visor up, the plume nodding.
      proud: {
        weight: 1.6,
        length: [6, 6],
        face: 'happy',
        when: ok,
        pose: (t) => {
          const k = smooth((t - 0.2) / 0.6) * smooth((5.6 - t) / 0.6);
          this.fx.visor = k;
          p.add('body', -8 * k);
          p.add('head', -10 * k, 8 * Math.sin(t * 0.9) * k);
          this.arm(1, 82 * k, -22 * k, 100 * k);
          this.armR(8 * k, 14 * k, 8 * k, 0);
          p.add('plume', 10 * Math.sin(t * 2.2) * k);
          this.fx.glint = 0.6 + 0.4 * Math.sin(t * 4);
          this.expression = 'love';
        },
      },
      // Flips the visor up, winks, and drops it again with a clang.
      peek: {
        weight: 1,
        length: [4, 4],
        when: ok,
        pose: (t) => {
          this.fx.visor = smooth((t - 0.3) / 0.25) * (t < 2.8 ? 1 : 0);
          this.expression = t > 0.5 && t < 2.8 ? (t < 1.7 ? 'happy' : 'wink') : 'neutral';
          this.hands(8, 20, 10);
          p.add('head', 0, 0, 6 * smooth((t - 0.5) / 0.4) * (t < 2.8 ? 1 : 0));
          if (t > 2.8 && t < 2.9) p.kick('head', 60, 0, 0);
        },
      },
      // The lance twirled like a baton.
      twirl: {
        weight: 1.2,
        length: [5, 5],
        face: 'happy',
        when: ok,
        pose: (t) => {
          const k = smooth((t - 0.2) / 0.4) * smooth((4.8 - t) / 0.5);
          this.arm(-1, 52 * k, 14 * k, 70 * k);
          p.add('hand.R', 52 * k + 70 * k + 360 * 2 * smooth((t - 0.8) / 2.6));
          this.arm(1, 20 * k, 30 * k, 30 * k);
          this.fx.glint = k;
          p.add('body', 0, 0, 3 * Math.sin(t * 6) * k);
        },
      },
      // Armour rattling: a shiver of clanks.
      rattle: {
        weight: 0.9,
        length: [3.5, 3.5],
        face: 'surprised',
        when: ok,
        pose: (t) => {
          const k = smooth(t / 0.2) * smooth((3.3 - t) / 0.4);
          p.add('body', 0, 0, 4 * Math.sin(t * 38) * k);
          p.add('head', 0, 0, -5 * Math.sin(t * 41) * k);
          this.fx.visor = 0.12 * (0.5 + 0.5 * Math.sin(t * 36)) * k;
          p.add('plume', 12 * Math.sin(t * 30) * k);
          this.jb.hop = 0.004 * Math.abs(Math.sin(t * 36)) * k;
        },
      },
      poked: {
        weight: 0,
        length: [2.6, 2.6],
        face: 'surprised',
        pose: (t) => {
          const k = smooth(t / 0.12) * smooth((2.4 - t) / 0.4);
          shield(k);
          this.jb.hop = this.arc(t, 0, 0.3, 0.05);
          this.fx.visor = 0;
          p.add('plume', 20 * Math.sin(t * 22) * Math.max(0, 1 - t / 1.4));
          p.add('body', 0, 0, 4 * Math.sin(t * 30) * Math.max(0, 1 - t / 1));
          if (t > 1.5) this.expression = 'sheepish';
        },
      },
    };
  }

  protected stance(t: number) {
    Object.assign(this.fx, { visor: 0, glint: 0, plume: 0 });
    const w = Math.sin(2 * Math.PI * 0.2 * t);
    this.arm(1, 8 + 2 * w, 12, 20);
    this.armR(6 - 2 * w, 10, 12, 0);
    this.puppet.add('plume', 4 * Math.sin(2 * Math.PI * 0.3 * t));
  }

  protected pose(dt: number, env: Env) {
    super.pose(dt, env);
    this.puppet.add('visor', -108 * this.fx.visor);
  }

  protected extras(_dt: number, env: Env) {
    const p = this.puppet;
    const asleep = this.face?.expression === 'asleep';
    this.outfit.dot(0, asleep ? 0.2 : 0.6 + 0.4 * this.fx.glint, GOLD);
    this.outfit.dot(1, asleep ? 0.2 : 0.55 + 0.45 * this.fx.glint, GOLD);
    this.outfit.beacon(
      asleep ? '#8a8a84' : this.fx.glint > 0.5 && Math.sin(env.time * 7) > 0 ? '#ffffff' : PLUME,
    );
  }
}
