import type { Object3D } from 'three';
import { type Act, type Character, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import { wobble } from './spring';
import { smooth, Toybot } from './toybot';

/**
 * Lofty, a play-friend: a beanpole of a robot on long telescoping legs, with a slim body,
 * very long arms, a small round head with a screen face and a periscope antenna. A gauge of
 * four lights up his chest shows how far he is stretched.
 *
 * His height is his trick: each leg is three nested tubes that slide in and out of each
 * other, and his body is two sections, so he can stretch up tall (to peek over things, to
 * reach), or fold down short (to Dimple's height, to look a small friend in the eye). The
 * stretch is one number (`ext`, -1 folded to +1 stretched) that moves the hips up or down
 * and slides the sections so the feet stay on the floor.
 *
 * In the games he is the high catcher: the tallest on the floor, he reaches the balloon
 * that the rest have to jump for (the director reads each one's height), and his own game of
 * catch is a glowing ball he tosses far above his head and stretches up to catch.
 *
 * Tricks: a long-legged stride, a lanky wave, tossing and catching a glowing ball, stretching
 * up tall and peering around, folding down to a small friend's height, towering and looking
 * down at the viewer, swaying like a tree when he's too tall, a floppy dance, tying a
 * shoelace, bending to look over the front lip, an accordion bounce and a yawn.
 */
export const LANKY_FACE: FaceLayout = {
  width: 512,
  height: 384,
  eyes: [
    [0.3, 0.45],
    [0.7, 0.45],
  ],
  rx: 0.095,
  ry: 0.26,
  line: 0.036,
  mouth: [0.5, 0.77],
};

const GAUGE = '#7dffc8';
const BALL = ['#ffb347', '#5ec8ff', '#ff5fa2'];
/** How far the hips move at full stretch and at full fold, metres. */
const UP = 0.24;
const DOWN = 0.36;

export class Lanky extends Toybot {
  private fx = {
    hop: 0,
    spin: 0,
    ext: 0, // -1 folded .. +1 stretched
    still: false,
    ball: 0, // 0 tucked away; else metres above its home
    ballOn: false,
    lean: 0,
  };
  private ext = 0;
  private buddy: Character | null = null;
  private way = 1;

  constructor(model: Object3D) {
    super(
      {
        name: 'Lofty',
        model: 'lanky',
        metres: 1.45,
        width: 0.45,
        size: 1.85,
        feels: {
          default: { f: 2.2, zeta: 0.55 },
          root: { f: 2.4, zeta: 0.7 },
          body: { f: 2, zeta: 0.4 },
          chest: { f: 2.2, zeta: 0.4 },
          head: { f: 1.9, zeta: 0.45, r: 0.4 },
          ant: { f: 2.6, zeta: 0.15 },
          'upper_arm.L': { f: 2.2, zeta: 0.4 },
          'upper_arm.R': { f: 2.2, zeta: 0.4 },
          'forearm.L': { f: 2.8, zeta: 0.35 },
          'forearm.R': { f: 2.8, zeta: 0.35 },
          'leg.L': { f: 2.4, zeta: 0.5 },
          'leg.R': { f: 2.4, zeta: 0.5 },
        },
        face: LANKY_FACE,
        eyes: 0.8,
        gaze: [
          { bone: 'head', yaw: 0.7, pitch: 0.8 },
          { bone: 'chest', yaw: 0.25, pitch: 0.15 },
        ],
        reach: { yaw: 55, pitch: 30 },
        lag: 1.5,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [60, 130],
        speed: 1.1,
      },
      model,
    );
    this.acts = this.moves();
  }

  /** A short crewmate nearby, whom he can stoop to. */
  private small(): Character | null {
    const env = this.env;
    const f = env?.frame;
    if (!env || !f) return null;
    let best: Character | null = null;
    let bestD = Infinity;
    for (const o of env.crew) {
      if (o === this || o.state !== 'here' || o.free || o.edge !== this.edge || o.perched || o.role)
        continue;
      if (o.heightPx > this.heightPx * 0.7) continue;
      const d = this.spaceTo(o, f).n;
      if (d < bestD && d < 8) [best, bestD] = [o, d];
    }
    return best;
  }

  // ---------- Acts ----------

  private moves(): Record<string, Act> {
    const p = this.puppet;
    const ok = () => this.free_;
    return {
      idle: { weight: 3, length: [3, 6] },
      stride: {
        weight: 3,
        length: [2.5, 4.5],
        when: ok,
        start: () =>
          this.stroll(Math.random() < 0.5 ? -1 : 1, this.heightPx * (1 + Math.random() * 1.6)),
      },
      wave: {
        weight: 1.8,
        length: [3.5, 4.5],
        face: 'happy',
        when: ok,
        pose: (t) => {
          // A long arm up high, and the whole forearm flaps like a flag.
          const k = smooth(t / 0.5) * smooth((this.actLength - t) / 0.5);
          this.arm(-1, 165 * k, 12 * k, 0);
          p.add('forearm.R', 0, 0, 28 * Math.sin(t * 7) * k);
          p.add('head', 0, 0, -8 * k);
          p.add('body', 0, 0, 3 * k);
          this.fx.ext = 0.2 * k;
        },
      },
      // Tosses a glowing ball high above his head and stretches up to catch it.
      catch: {
        weight: 2,
        length: [8, 8],
        face: 'happy',
        when: ok,
        pose: (t) => {
          const period = 2.2;
          const n = Math.floor(t / period);
          const u = (t % period) / period;
          const on = t > 0.5 && t < this.actLength - 1;
          this.fx.ballOn = on;
          const loops = Math.min(n, 2);
          const peak = 0.7 + 0.2 * loops;
          // Throw (u 0..0.15), air (0.15..0.7), catch (0.7..1).
          const air = clamp((u - 0.15) / 0.55, 0, 1);
          const h = 4 * peak * air * (1 - air);
          this.fx.ball = on ? h : 0;
          const reach = smooth((u - 0.35) / 0.3) * smooth((1 - u) / 0.2);
          const throwK = Math.sin(Math.PI * clamp(u / 0.2, 0, 1));
          this.arms(60 * (1 - reach) + 150 * reach, 14 * reach, 30 * (1 - reach) - 20 * throwK);
          this.fx.ext = 0.9 * reach * (on ? 1 : 0) + 0.25 * throwK;
          p.add('head', -22 * reach, 0, 0);
          this.expression = reach > 0.5 ? 'surprised' : 'happy';
          if (t > this.actLength - 1) this.arms(30, 14);
        },
      },
      // Up on his legs, stretched tall, craning round to see what's about.
      peek: {
        weight: 1.6,
        length: [6.5, 6.5],
        when: ok,
        pose: (t) => {
          const k = smooth((t - 0.2) / 1) * smooth((6.3 - t) / 1);
          this.fx.ext = k;
          this.expression = k > 0.6 ? 'surprised' : 'neutral';
          // One hand shades his eyes while the head sweeps from side to side.
          this.arm(-1, 120 * k, 4 * k, 110 * k);
          this.arm(1, 10, 8, 0);
          p.add('head', -8 * k, 40 * sin(t, 0.3) * k, 0);
          p.add('chest', 0, 14 * sin(t, 0.3) * k, 0);
        },
      },
      // Folds down to a small friend's height and says hello.
      stoop: {
        weight: 1.8,
        length: [9, 9],
        when: () => ok() && this.small() !== null,
        start: () => {
          this.buddy = this.small();
          const f = this.env?.frame;
          const o = this.buddy;
          if (!o || !f) return;
          this.way = this.s < o.s ? -1 : 1;
          this.walkTo(o.s + this.way * this.spaceTo(o, f).rx * 1.0, o.depth);
        },
        pose: (t) => {
          const o = this.buddy;
          if (!o || o.state !== 'here') return void this.setAct('idle');
          const since = this.since(t);
          if (since < 0) {
            if (t > 6) this.setAct('idle');
            return;
          }
          this.spec.steers = false;
          const k = smooth(since / 1) * smooth((6.4 - since) / 0.9);
          this.fx.ext = -k;
          p.add('body', 22 * k, 0, 0);
          p.add('head', 6 * k, -this.way * 24 * k);
          // A little wave at their level, then a nod.
          this.arm(this.way === 1 ? -1 : 1, 80 * k * smooth((since - 1.2) / 0.4), 10, 40);
          p.add(`forearm.${this.way === 1 ? 'R' : 'L'}`, 0, 0, 16 * Math.sin(since * 7) * k);
          this.expression = 'happy';
          if (since > 6.8) this.setAct('idle');
        },
      },
      tower: {
        weight: 1,
        length: [5, 5],
        when: ok,
        pose: (t) => {
          // Slowly up to full height, looks down at us, and slowly folds back.
          const k = smooth((t - 0.2) / 1.6) * smooth((4.8 - t) / 1.2);
          this.fx.ext = k;
          p.add('head', 28 * k);
          this.arm(1, 6, 10 * k, 0);
          this.arm(-1, 6, 10 * k, 0);
          this.expression = k > 0.6 ? 'sheepish' : 'neutral';
        },
      },
      // Too tall: sways like a tree and flaps for balance.
      sway: {
        weight: 0.9,
        length: [5, 5],
        when: ok,
        pose: (t) => {
          const k = smooth(t / 0.8) * smooth((4.8 - t) / 0.8);
          this.fx.ext = k;
          const w = Math.sin(t * 2.4);
          p.add('body', 0, 0, 10 * w * k);
          p.add('chest', 0, 0, 12 * Math.sin(t * 2.4 - 0.7) * k);
          p.add('head', 0, 0, 10 * Math.sin(t * 2.4 - 1.4) * k);
          this.arm(1, 20 * k, 50 * k + 20 * w * k, 10);
          this.arm(-1, 20 * k, 50 * k - 20 * w * k, 10);
          this.expression = 'surprised';
        },
      },
      dance: {
        weight: 1.2,
        length: [8, 9],
        face: 'happy',
        when: ok,
        pose: (t) => {
          const beat = sin(t, 1);
          const half = sin(t, 2);
          this.fx.still = true;
          this.fx.ext = 0.5 * half;
          p.add('body', 0, 0, 10 * beat);
          p.add('chest', 0, 0, -14 * beat);
          p.add('head', 6 * Math.abs(half), 0, 8 * beat);
          this.arm(1, 90 + 70 * half, 40, 30);
          this.arm(-1, 90 - 70 * half, 40, 30);
          p.add('leg.L', 12 * beat);
          p.add('leg.R', -12 * beat);
        },
      },
      tieShoe: {
        weight: 0.9,
        length: [6.5, 6.5],
        when: ok,
        pose: (t) => {
          const k = smooth((t - 0.2) / 0.9) * smooth((6.2 - t) / 0.9);
          this.fx.ext = -k;
          p.add('body', 62 * k);
          p.add('head', -30 * k);
          this.arms(-10 * k, 4, 0);
          p.add('forearm.L', 0, 0, 20 * Math.sin(t * 9) * k);
          p.add('forearm.R', 0, 0, -20 * Math.sin(t * 9 + 1) * k);
          this.expression = t < 5.6 ? 'focused' : 'happy';
        },
      },
      lip: {
        weight: 0.8,
        length: [7, 8],
        when: ok,
        start: () => this.walkTo(this.s, 0),
        pose: (t) => {
          if (this.walking) return;
          // Folds forward at the hips, a long way, to look over the lip.
          const k = smooth((t - 1) / 1) * smooth((this.actLength - t) / 0.8);
          p.add('body', 55 * k);
          p.add('head', -20 * k, 20 * sin(t, 0.3) * k);
          this.arms(30 * k, 10, 20);
          this.fx.ext = -0.4 * k;
          this.expression = 'surprised';
        },
      },
      accordion: {
        weight: 1,
        length: [4.5, 4.5],
        face: 'happy',
        when: ok,
        pose: (t) => {
          // Up, down, up, down: legs and body slide in and out like a toy.
          const k = smooth(t / 0.4) * smooth((4.3 - t) / 0.4);
          this.fx.ext = Math.sin(t * 2 * Math.PI * 1.1) * k;
          this.arms(30 + 40 * Math.sin(t * 7), 20, 20);
        },
      },
      yawn: {
        weight: 0.8,
        length: [4, 4],
        when: ok,
        pose: (t) => {
          // A long stretch, arms right up, and a yawn that goes on.
          const k = smooth(t / 0.9) * smooth((3.8 - t) / 0.9);
          this.fx.ext = 0.9 * k;
          this.arms(170 * k, 8 * k, 0);
          p.add('head', -18 * k);
          this.expression = 'sleepy';
          if (this.face) this.face.talk = 0.8 * k;
        },
      },
      // Reactions (never picked at random).
      poked: {
        weight: 0,
        length: [1.8, 1.8],
        face: 'surprised',
        pose: (t) => {
          // Shoots up a head taller, and comes down again.
          const k = Math.sin(Math.PI * clamp(t / 0.9, 0, 1));
          this.fx.ext = 0.8 * k;
          this.fx.hop = this.arc(t, 0, 0.5, 0.06);
          this.arms(80 * k, 30, 30);
          if (t > 1.1) this.expression = 'sheepish';
        },
      },
      dizzy: {
        weight: 0,
        length: [3.4, 3.4],
        face: 'dizzy',
        pose: (t) => {
          const a = 2 * Math.PI * 1.1 * t;
          this.fx.ext = 0.7 * Math.sin(a);
          p.add('body', 0, 0, 12 * Math.sin(a * 0.5));
          p.add('chest', 6 * Math.cos(a), 0, 10 * Math.sin(a - 1));
          p.add('head', -8 * Math.sin(a), 0, 8 * Math.cos(a));
          this.arms(20 + 20 * Math.sin(a * 1.3), 30, 10);
          this.fx.spin = 2 * Math.PI * smooth(t / 2.6);
          this.fx.still = true;
        },
      },
    };
  }

  protected onDirect() {
    this.buddy = null;
  }

  // ---------- Each frame ----------

  protected idle(t: number) {
    const p = this.puppet;
    Object.assign(this.fx, {
      hop: 0,
      spin: 0,
      ext: 0,
      still: false,
      ball: 0,
      ballOn: false,
      lean: 0,
    });
    if (this.face) this.face.doodle = null;
    this.spec.steers = true;
    const w = wobble(t * 0.35, 5);
    const b = Math.sin(2 * Math.PI * 0.22 * t);
    // A tall thing never quite stands still: a slow sway from the hips.
    p.add('body', 0.8 * b, 0, 2 * w);
    p.add('chest', 0, 0, -2.5 * w);
    p.add('head', 1.2 * b, 0, 2 * wobble(t * 0.3, 8));
    p.add('ant', 0, 0, 6 * wobble(t * 0.8, 2));
    this.arm(1, 3 + 2 * b, 6 + 3 * w, 4);
    this.arm(-1, 3 - 2 * b, 6 - 3 * w, 4);
    this.fx.ext = 0.05 * b;
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    this.env = env;
    if (this.pleased) this.setAct(Math.random() < 0.6 ? 'wave' : 'accordion');
    // The long stride: legs swing from the hips, arms the opposite way, the head nods.
    const amt = clamp(this.stride / (this.heightPx * 0.9), 0, 1.2);
    if (amt > 0.02 && !this.fx.still) {
      const a = Math.sin(this.gait * 0.6);
      p.add('leg.L', -26 * a * amt);
      p.add('leg.R', 26 * a * amt);
      p.add('body', 3 * amt, 0, 3 * a * amt);
      p.add('chest', 0, 0, -3 * a * amt);
      p.add('head', -2 * amt, 0, -2 * a * amt);
      this.arm(1, 22 * a * amt + 4, 4, 12 * amt);
      this.arm(-1, -22 * a * amt + 4, 4, 12 * amt);
      this.fx.ext += 0.06 * Math.abs(Math.cos(this.gait * 0.6)) * amt;
    }
    this.ext += (this.fx.ext - this.ext) * (1 - Math.exp(-14 * dt));
    this.h = this.fx.hop * this.px;
  }

  protected after(_dt: number, env: Env) {
    const p = this.puppet;
    const e = clamp(this.ext, -1.2, 1.1);
    // Slide the sections: the hips rise or fall by u, and each tube takes up half of it.
    const u = e >= 0 ? UP * e : DOWN * e;
    p.shift('body', 0, u, 0);
    p.shift('chest', 0, e >= 0 ? 0.06 * e : 0.08 * e, 0);
    for (const s of ['L', 'R']) {
      p.shift(`leg.${s}`, 0, u, 0);
      p.shift(`leg2.${s}`, 0, -u / 2, 0);
      p.shift(`leg3.${s}`, 0, -u / 2, 0);
    }
    // The ball: tucked in his chest, or up in the air in front of him.
    const on = this.fx.ballOn;
    const s = on ? 1 : 0.001;
    p.stretch('ball', s, [0, 1, 0], s);
    if (on)
      p.shift('ball', 0, -0.32 + this.fx.ball * 1.0, 0.12 * (1 - Math.min(1, this.fx.ball * 2)));
    this.lights(env.time, e);
    if (this.act === 'idle' && this.state === 'here')
      this.expression = this.hovered ? 'happy' : 'neutral';
  }

  update(dt: number, env: Env) {
    super.update(dt, env);
    this.pivot.rotation.y = this.fx.spin;
  }

  /** The chest gauge: lights for how far he is stretched, the ball in its own colour. */
  private lights(time: number, e: number) {
    const g = (e + 1.2) / 2.3;
    for (let i = 0; i < 4; i++) {
      const lit = smooth((g * 4.4 - i - 0.2) / 0.6);
      this.outfit.dot(i, 0.12 + 0.88 * lit, GAUGE);
    }
    this.outfit.dot(4, 1, BALL[Math.floor(time * 2) % BALL.length]);
  }
}
