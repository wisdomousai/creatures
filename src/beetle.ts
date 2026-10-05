import type { Object3D } from 'three';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import type { Reaction } from './birds';
import { Bug, ease, SIDES, span, TAU } from './bug';
import { sin } from './moves';
import { Spring } from './spring';

/**
 * Clunk, the robot rhino beetle: a heavy domed body on six sturdy legs, two big shell
 * halves over his back that lift open to show thin wings, a screen-faced head and a thick
 * horn with a lamp on the tip. He is strong and not at all elegant. He pushes a striped
 * ball along the floor with his horn, nose down, and gives it a last great shove; flips
 * onto his back by accident and kicks all six legs until he rocks himself the right way up
 * (the third try works); flies with the shells open, badly, low and wobbling, and lands
 * with a thump; flexes his horn up and down like a weightlifter, the lamp glowing; and
 * charges the back wall, bashing it with his horn.
 *
 * A poke makes him jump, the shells flung open; three make him spin dizzy; the mouse
 * resting on him makes him lift his horn proudly.
 */
export const BEETLE_FACE: FaceLayout = {
  width: 256,
  height: 192,
  eyes: [
    [0.3, 0.47],
    [0.7, 0.47],
  ],
  rx: 0.105,
  ry: 0.27,
  line: 0.05,
  mouth: [0.5, 0.8],
};

export class Beetle extends Bug {
  static readonly terms =
    'rhino rhinoceros insect brown blue black horn shell wings six legs strong heavy domed pushes ball charges bashes clumsy weightlifter flips';

  private openS = new Spring(5, 0.5);
  private buzzS = new Spring(6, 0.8);
  private rollS = new Spring(3.2, 0.5);
  private hornS = new Spring(5, 0.5);
  private turnS = new Spring(3, 0.8);
  // Per-frame requests from acts, cleared in idle().
  private open = 0;
  private buzz = 0;
  private roll = 0;
  private horn = 0;
  private yaw = 0;
  private ballShown = 0;
  private ballAhead = 0;
  private ballSpin = 0;
  private kicking = 0;
  private lamp: ((i: number, t: number) => number) | null = null;
  private flash = 0;
  private actSpeed = 0.9;
  private dir = 1;
  private stage = 0;
  private since = 0;
  private rolled = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Clunk',
        model: 'beetle',
        metres: 0.42,
        width: 0.62,
        size: 0.5,
        feels: {
          default: { f: 4, zeta: 0.6 },
          root: { f: 4, zeta: 0.55 },
          body: { f: 5, zeta: 0.4 },
          head: { f: 5, zeta: 0.5, r: 0.5 },
          'horn.1': { f: 5, zeta: 0.4 },
          'horn.2': { f: 6, zeta: 0.3 },
          'case.L': { f: 6, zeta: 0.4 },
          'case.R': { f: 6, zeta: 0.4 },
          'wing.L': { f: 5, zeta: 0.5 },
          'wing.R': { f: 5, zeta: 0.5 },
          'antenna.L.1': { f: 3.5, zeta: 0.35 },
          'antenna.R.1': { f: 3.5, zeta: 0.35 },
          'antenna.L.2': { f: 4.5, zeta: 0.2 },
          'antenna.R.2': { f: 4.5, zeta: 0.2 },
        },
        face: BEETLE_FACE,
        eyes: 0.68,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.8 },
          { bone: 'body', yaw: 0.15, pitch: 0 },
        ],
        reach: { yaw: 50, pitch: 25 },
        lag: 1.5,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 0.9,
        turn: 60,
        roam: true,
      },
      model,
    );
    this.acts = { ...this.moves(), ...this.reactions() };
  }

  private flying = () => this.air.y > 0.3;

  private moves(): Record<string, Act> {
    const p = this.puppet;
    const still = () => this.still() && this.state === 'here';
    return {
      idle: { weight: 3, length: [2.5, 5] },
      stroll: {
        weight: 1.4,
        length: [2.5, 4],
        when: this.still,
        start: () => {
          this.actSpeed = 1.1;
          this.amble(1.4 + Math.random() * 1.4);
        },
        pose: () => (this.actSpeed = 1.1),
      },
      ball: {
        weight: 2,
        length: [10, 12],
        face: 'determined',
        when: still,
        start: () => {
          this.stage = 0;
          this.since = 0;
          this.dir = Math.random() < 0.5 ? -1 : 1;
          this.rolled = 0;
        },
        pose: (t) => {
          // A striped ball turns up in front of him. Nose down, he walks it along with
          // his horn, turned toward where it goes, then gives it a last great shove,
          // watches it roll off and shrink away, and is pleased.
          const k = this.fade(t, 0.4);
          this.ballShown = ease(t, 0.3, 1) * (1 - ease(t, 8.6, 9.6));
          this.yaw = this.dir * 62 * span(t, 1, 1.8, 8.2, 9.2);
          this.horn = -0.9 * span(t, 1.2, 2, 8, 8.6);
          this.actSpeed = 1.1;
          p.add('body', 8 * span(t, 1.2, 2, 8, 8.6));
          p.add('head', 14 * span(t, 1.2, 2, 8, 8.6));
          const pushing = t > 2.2 && t < 7.6;
          if (pushing && this.stage === 0 && !this.walking) {
            this.amble(2.4, undefined, this.dir);
            this.stage = 1;
          }
          if (this.stage === 1 && !this.walking) this.stage = 2;
          if (t > 7.6 && this.stage < 3) this.stage = 3;
          // The ball stays out in front of the horn while pushed, and goes off at the end.
          const shove = ease(t, 7.6, 8.1);
          this.ballAhead = -0.06 + 0.02 * Math.sin(t * 7) * (pushing ? 1 : 0) + 0.9 * shove;
          this.expression = t > 8.8 ? 'happy' : 'neutral';
          p.add('root', -4 * ease(t, 7.6, 7.9) * (1 - ease(t, 7.9, 8.4)));
          this.lamp = (_i, s) => 0.4 + 0.6 * Math.max(0, Math.sin(s * 5));
          void k;
        },
      },
      stuck: {
        weight: 1.8,
        length: [11, 13],
        face: 'surprised',
        when: still,
        start: () => (this.stage = 0),
        pose: (t) => {
          // Tips over backwards onto his shell. Six legs kick; he rocks; nothing. He rocks
          // harder, the horn digs in; nearly. And a third time he rolls over with a thump
          // and sits there pleased with himself.
          const over = ease(t, 0.3, 0.9);
          const back = ease(t, 10, 10.9);
          const rock = (a: number, b: number) => span(t, a, a + 0.5, b - 0.5, b);
          const tries = rock(3.4, 4.6) * 0.3 + rock(6, 7.4) * 0.45 + rock(8.4, 9.9) * 0.9;
          this.roll = 1.0 * over * (1 - back) - tries * (over * (1 - back)) * 0.35;
          const kick = span(t, 1, 1.5, 9.8, 10.2);
          this.kicking = kick;
          this.expression = t < 1 ? 'surprised' : t < 10 ? 'cross' : 'happy';
          p.add('horn.1', -30 * rock(3.4, 4.6) - 20 * rock(6, 7.4) - 28 * rock(8.4, 9.9));
          p.add('head', 10 * kick * sin(t, 1.6));
          this.lamp = (_i, s) => (kick > 0.5 && Math.sin(s * 9) > 0 ? 1 : 0.15);
          if (t > 10.1 && this.stage === 0) {
            this.stage = 1;
            p.kick('root', 500);
            p.kick('body', -400);
            this.feelers((side, k2) => {
              p.kick(`antenna.${side > 0 ? 'L' : 'R'}.${k2}`, 500, 0, side * 200);
              return [0, 0, 0];
            });
          }
        },
      },
      flight: {
        weight: 1.6,
        length: [8, 10],
        face: 'sheepish',
        when: still,
        start: () => {
          this.stage = 0;
          this.dir = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          // Shells open, wings a blur, he heaves himself off the floor: low, wobbling,
          // sinking and lurching, a few feet along, and lands with a thud and a bounce.
          const aloft = span(t, 0.4, 1.6, this.actLength - 2.2, this.actLength - 0.9);
          this.up = (0.4 + 0.1 * sin(t, 1.4) - 0.12 * Math.max(0, sin(t, 2.3))) * aloft;
          this.buzz = aloft;
          this.open = Math.max(aloft, span(t, 0, 0.5, this.actLength - 0.5, this.actLength));
          this.actSpeed = 1.6;
          if (t > 1.6 && this.stage < 3 && !this.walking && t < this.actLength - 2) {
            this.amble(1.2, 0.1 + Math.random() * 0.5, this.dir * (this.stage % 2 ? -1 : 1));
            this.stage++;
          }
          p.add('body', -14 * aloft + 6 * sin(t, 1.1) * aloft, 0, 10 * sin(t, 1.7) * aloft);
          p.add('head', 8 * aloft, 12 * sin(t, 0.9) * aloft);
          this.horn = 0.5 * aloft;
          this.lamp = () => 0.5;
          if (t > this.actLength - 0.9 && this.stage === 3) {
            this.stage = 4;
            p.kick('root', 400);
            p.kick('body', 500);
            this.air.kick(-4);
          }
        },
      },
      flex: {
        weight: 1.6,
        length: [6, 7],
        face: 'determined',
        when: still,
        pose: (t) => {
          // Planted, legs braced, the horn up and down like a weightlifter's lift; the
          // lamp swelling on every lift, the cases flexing, a satisfied grunt after.
          const k = span(t, 0.5, 1, this.actLength - 1.2, this.actLength - 0.5);
          const lift = 0.5 + 0.5 * Math.sin(t * 2.6 - 1.57);
          this.horn = k * (-0.6 + 1.5 * lift);
          this.open = 0.25 * k * lift;
          p.add('body', -10 * k * lift, 0, 0);
          p.add('head', -8 * k * lift);
          this.legs(() => [0, 0, 6 * k]);
          this.lamp = () => 0.15 + 0.85 * k * lift;
          this.expression = k > 0.3 && lift > 0.6 ? 'happy' : 'determined';
        },
      },
      bash: {
        weight: 1.2,
        length: [5, 6],
        face: 'determined',
        when: still,
        pose: (t) => {
          // Rears back, charges, and butts an imaginary tree with his horn: head and
          // body jolt, the lamp flashes, and he shakes it off.
          const hits = [1.6, 2.8, 4.0];
          let jolt = 0;
          for (const h of hits) jolt += ease(t, h - 0.25, h) * (1 - ease(t, h, h + 0.35));
          const k = span(t, 0.3, 0.9, this.actLength - 1, this.actLength - 0.4);
          p.add('body', -12 * jolt + 6 * k, 0, 0);
          p.add('head', 18 * jolt - 8 * k);
          p.add('root', 5 * jolt);
          this.horn = -0.5 * k;
          this.flash = jolt > 0.6 ? 1 : 0;
          this.lamp = () => 0.3;
          if (hits.some((h) => Math.abs(t - h) < 0.02)) {
            p.kick('body', 300);
            p.kick('head', 400);
          }
        },
      },
      shells: {
        weight: 1,
        length: [4, 5],
        when: still,
        face: 'happy',
        pose: (t) => {
          // Opens his shells wide, airs his wings with a slow flap, shuts them with a click.
          const k = span(t, 0.4, 1.1, this.actLength - 1.4, this.actLength - 0.6);
          this.open = k;
          this.buzz = 0.35 * k;
          p.add('body', -4 * k);
        },
      },
      preen: {
        weight: 1.1,
        length: [5, 6.5],
        face: 'happy',
        when: still,
        pose: (t) => {
          // Drawing each antenna through his front legs in turn.
          const k = this.fade(t, 0.5);
          p.add('head', 10 * k);
          for (const [sfx, side] of SIDES) {
            const mine = t < this.actLength / 2 === side > 0;
            const use = mine ? k : 0;
            p.add(`antenna.${sfx}.1`, 70 * use, 0, side * 20 * use);
            p.add(`antenna.${sfx}.2`, 40 * use);
            this.leg(sfx, side, 0, 30 * use, 40 * use + 6 * sin(t, 3) * use, -side * 20 * use);
          }
          p.add('body', 4 * k);
        },
      },
      nap: {
        weight: 0.9,
        length: [9, 13],
        when: still,
        pose: (t) => {
          // Head and horn down on the floor, antennae drooping, the lamp breathing slowly.
          const k = span(t, 1, 2.2, this.actLength - 2, this.actLength - 0.6);
          p.add('head', 26 * k);
          p.add('body', 10 * k);
          this.horn = -1 * k;
          this.feelers(() => [40 * k, 0, 0]);
          this.expression = k > 0.4 ? 'asleep' : 'sleepy';
          this.lamp = (_i, s) => 0.08 + 0.12 * (0.5 + 0.5 * Math.sin(s * 1.1));
        },
      },
    };
  }

  protected react(kind: Reaction, t: number) {
    const p = this.puppet;
    if (kind === 'poked') {
      // Jumps with shells flung wide, the lamp flashing, lands with a thump.
      const k = span(t, 0, 0.15, 0.5, 0.95);
      this.up = 0.7 * k;
      this.open = 1;
      this.buzz = 1;
      this.flash = 1;
      p.add('body', -14 * k);
      this.feelers(() => [-20 * k, 0, 0]);
    } else if (kind === 'dizzy') {
      const k = 1 - ease(t, 2.4, 3.4);
      this.open = 0.3 * k;
      this.horn = 0.5 * Math.sin(t * 6) * k;
      p.add('head', 8 * k * Math.cos(t * 5), 14 * k * Math.sin(t * 3), 22 * k * Math.sin(t * 5));
      p.add('body', 0, 0, 12 * k * Math.sin(t * 5));
      this.flash = k;
    } else {
      // Horn up proud, the lamp glowing.
      const k = this.fade(t, 0.6);
      this.horn = 0.9 * k;
      p.add('head', -8 * k, 0, 4 * k * sin(t, 1.2));
      p.add('body', -6 * k);
      this.lamp = () => 0.5 + 0.5 * Math.sin(t * 3) * k;
    }
  }

  // ---------- Posing ----------

  protected idle(t: number) {
    const p = this.puppet;
    this.up = 0;
    this.buzz = 0;
    this.open = 0;
    this.roll = 0;
    this.horn = 0;
    this.yaw = 0;
    this.ballShown = 0;
    this.ballAhead = 0;
    this.kicking = 0;
    this.flash = 0;
    this.lamp = null;
    this.actSpeed = 0.9;
    this.expression = this.hovered ? 'happy' : 'neutral';
    p.add('body', 1.2 * sin(t, 0.3));
    p.add('head', 2 * sin(t, 0.4), 4 * sin(t, 0.13));
    this.feelers((side, k) => {
      const ph = side > 0 ? 0 : 0.3;
      return k === 1
        ? [6 * sin(t, 0.5, ph), 0, side * (-4 + 6 * sin(t, 0.37, ph))]
        : [12 * sin(t, 0.5, ph - 0.15), 0, side * 5 * sin(t, 0.61, ph)];
    });
    this.legs((side, k) => [
      2 * sin(t, 0.17, k * 0.31 + side * 0.1),
      3 * Math.max(0, sin(t, 0.11, k * 0.4 + side * 0.2)) ** 4,
      0,
    ]);
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    this.env = env;
    this.spec.speed = this.actSpeed;
    this.enjoy(dt, this.still());
    const H = this.heightPx;
    const rollNow = this.rollS.y;
    const air = this.hoverUp(dt, 0.22 * this.heightPx * Math.min(1, Math.abs(rollNow)));
    const open = this.openS.update(dt, this.open);
    const buzz = this.buzzS.update(dt, this.buzz);
    const roll = this.rollS.update(dt, this.roll);
    const horn = this.hornS.update(dt, this.horn);
    // Lying along the floor, turned toward the middle of his edge so his length shows;
    // an act (pushing the ball) can turn him its own way.
    const [lo, hi] = this.span(env.frame);
    const aside =
      Math.sign((lo + hi) / 2 - this.s) * (this.edge === 'bottom' || this.edge === 'left' ? 1 : -1);
    const moving = this.walking || Math.abs(roll) > 0.05 || this.flying() ? 0.3 : 1;
    const yaw = this.turnS.update(dt, this.yaw !== 0 ? this.yaw : aside * 40 * moving);
    // On the ground the legs walk; in the air they hang; on his back they kick.
    if (this.kicking > 0.02) {
      const k = this.kicking;
      const t = env.time;
      this.legs((side, i) => [
        26 * k * Math.sin(t * 13 + i * 1.4 + (side > 0 ? 0 : 1.5)),
        30 * k + 14 * k * Math.sin(t * 11 + i),
        0,
      ]);
    } else if (this.flying()) {
      this.legs((side, k) => [-8 * air * (k + 1) * 0.5, 30 * air, -side * 10 * air]);
    } else {
      this.walkLegs(H * 0.9);
    }
    // Turned onto his back: rolled about the viewer axis, and lifted so the shell sits on
    // the floor.
    p.add('root', 0, yaw);
    p.add('body', 0, 0, 180 * roll);
    p.add('head', 0, -yaw * 0.6);
    p.add('horn.1', -26 * horn);
    p.add('horn.2', -14 * horn);
    // Cases up and out, wings fanning under them.
    const o = clamp(Math.max(open, buzz * 0.6), 0, 1);
    for (const [sfx, side] of SIDES) {
      p.add(`case.${sfx}`, 30 * o, 0, side * 45 * o);
    }
    this.tone(dt, env, null);
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    const t = env.time;
    const buzz = clamp(this.buzzS.y, 0, 1);
    // The wings unfold out of nothing as the shell lifts, and beat faster than a spring.
    const out = clamp(Math.max(this.openS.y, buzz * 0.6), 0, 1);
    const spread = Math.max(0.02, out * out);
    for (const [sfx, side] of SIDES) {
      const wing = `wing.${sfx}`;
      p.stretch(wing, spread, [0, 1, 0], spread);
      if (buzz > 0.02) {
        const rate = TAU * 13 * t;
        p.turn(
          wing,
          0,
          0,
          side * buzz * (18 + 26 * Math.sin(rate) + 6 * Math.sin(rate * 2.1 + side)),
        );
      }
    }
    // The ball: not there until the trick, then out ahead of the horn, rolling as it goes.
    const s = Math.max(
      0.001,
      clamp(this.ballShown, 0, 1) * (1 - 0.6 * ease(this.ballAhead, 0.4, 1)),
    );
    p.stretch('ball', s, [0, 0, 1], s);
    p.shift('ball', 0, 0, this.ballAhead);
    this.ballSpin +=
      Math.max(0, this.ballAhead - (this.lastAhead ?? 0)) * 60 +
      (this.walking ? dt * 160 : 0) * this.ballShown;
    this.lastAhead = this.ballAhead;
    p.turn('ball', this.ballSpin, 0, 0);
    this.lights(t);
  }

  private lastAhead = 0;

  /** The horn's lamp (Dot0) and the chest lamp (Dot1). */
  private lights(t: number) {
    const asleep = this.expression === 'asleep';
    for (let i = 0; i < 2; i++) {
      let level: number;
      if (this.act === 'dizzy') level = Math.random() < 0.5 ? 1 : 0.2;
      else if (this.lamp) level = this.lamp(i, t);
      else level = 0.3 + 0.25 * Math.sin(t * 1.2 - i * 1.1);
      level = Math.max(level, this.flash * (0.5 + 0.5 * Math.sin(t * 18 - i)));
      if (this.hovered && this.act === 'idle') level = 0.5 + 0.5 * Math.sin(t * 3.4 - i);
      this.outfit.dot(i, clamp(asleep ? level * 0.5 : level, 0, 1));
    }
  }
}
