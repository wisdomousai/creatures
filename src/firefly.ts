import type { Object3D } from 'three';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import type { Reaction } from './birds';
import { Bug, ease, SIDES, span, TAU } from './bug';
import { sin } from './moves';
import { Spring } from './spring';

/**
 * Glim, the robot firefly: a small upright beetle whose abdomen is a big glass lamp in a
 * cage of ribs, two dark shell cases over his back that lift to show thin wings, a golden
 * collar, a screen-faced head and antennae with lit tips. The lamp is the whole act: he
 * blinks slow pulses, a short-short-long call, a quick flicker, drifts up and draws a
 * glowing line of beads in the air as he goes (the lamp pulsing in time with the beads
 * running down the cage), sways with his lamp swinging, hangs a lazy hover, warms his
 * wings, and finally dims to a faint glow and dozes. He glows brighter in the paper
 * (night) look, where the lamp is the brightest thing on the floor.
 *
 * A poke flashes the whole lamp white and sends him up; three make the lamp flicker wild;
 * the mouse resting on him makes it pulse warm and slow.
 */
export const FIREFLY_FACE: FaceLayout = {
  width: 256,
  height: 192,
  eyes: [
    [0.3, 0.47],
    [0.7, 0.47],
  ],
  rx: 0.1,
  ry: 0.26,
  line: 0.05,
  mouth: [0.5, 0.8],
};

export class Firefly extends Bug {
  static readonly terms =
    'lightning bug insect black dark peach orange yellow lamp glow lantern flash blink flicker pulse hover fly night wings antennae golden glass';

  /** Held by the pointer, it flies after it. */
  readonly flies = true;
  private openS = new Spring(5, 0.5);
  private buzzS = new Spring(6, 0.8);
  private swayS = new Spring(4, 0.6);
  private turnS = new Spring(3, 0.8);
  // Per-frame requests from acts, cleared in idle().
  private open = 0;
  private buzz = 0;
  private sway = 0;
  private glow: ((i: number, t: number) => number) | null = null;
  private flash = 0;
  private actSpeed = 1;
  private dir = 1;
  private stage = 0;
  private since = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Glim',
        model: 'firefly',
        metres: 0.45,
        width: 0.6,
        size: 0.5,
        feels: {
          default: { f: 4, zeta: 0.6 },
          root: { f: 4, zeta: 0.5 },
          body: { f: 5, zeta: 0.45 },
          head: { f: 5, zeta: 0.5, r: 0.5 },
          'case.L': { f: 6, zeta: 0.45 },
          'case.R': { f: 6, zeta: 0.45 },
          lamp: { f: 4, zeta: 0.35 },
          'wing.L': { f: 5, zeta: 0.5 },
          'wing.R': { f: 5, zeta: 0.5 },
          'antenna.L.1': { f: 3.5, zeta: 0.35 },
          'antenna.R.1': { f: 3.5, zeta: 0.35 },
          'antenna.L.2': { f: 4.5, zeta: 0.2 },
          'antenna.R.2': { f: 4.5, zeta: 0.2 },
        },
        face: FIREFLY_FACE,
        eyes: 0.68,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.8 },
          { bone: 'body', yaw: 0.2, pitch: 0 },
        ],
        reach: { yaw: 55, pitch: 28 },
        lag: 1.4,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 1,
        turn: 60,
        roam: true,
      },
      model,
    );
    this.acts = { ...this.hovers(), ...this.ground(), ...this.reactions() };
  }

  private flying = () => this.air.y > 0.3;
  private night = () => this.lookName === 'paper';

  // ---------- In the air ----------

  private hovers(): Record<string, Act> {
    const aloft = () => this.still() && this.state === 'here';
    const p = this.puppet;
    return {
      idle: { weight: 3, length: [2.5, 5] },
      hover: {
        weight: 2,
        length: [5, 8],
        face: 'happy',
        when: aloft,
        pose: (t) => {
          // A lazy hover, bobbing, the lamp breathing slow.
          const k = this.fade(t, 0.7);
          this.up = k * (0.75 + 0.1 * sin(t, 0.3));
          this.buzz = k * 0.8;
          this.open = 0.5 * k;
          p.add('body', -6 * k + 3 * sin(t, 0.8) * k);
          p.add('head', 6 * k, 10 * sin(t, 0.4) * k);
          this.glow = (_i, s) => 0.15 + 0.85 * (0.5 + 0.5 * Math.sin(s * 1.6 - 1.5)) ** 2;
        },
      },
      blink: {
        weight: 2,
        length: [6, 8],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // Slow pulses: the lamp swells and fades, swells again, the beads following.
          const k = this.fade(t, 0.5);
          p.add('body', -4 * k * (0.5 + 0.5 * sin(t, 0.7)));
          this.glow = (i, s) => Math.max(0.05, Math.sin((s - i * 0.18) * 2.2) ** 3);
        },
      },
      call: {
        weight: 1.8,
        length: [7, 9],
        face: 'focused',
        when: this.still,
        pose: (t) => {
          // The firefly's call: short, short, long, a pause, over and over, the head
          // nodding with every flash.
          const k = this.fade(t, 0.4);
          const c = t % 2.2;
          const on = (c > 0.1 && c < 0.3) || (c > 0.5 && c < 0.7) || (c > 1.0 && c < 1.8);
          this.glow = () => (on ? 1 : 0.05);
          p.add('head', (on ? 7 : 0) * k);
          p.add('body', (on ? -3 : 0) * k);
        },
      },
      flicker: {
        weight: 1,
        length: [3, 4],
        face: 'surprised',
        when: this.still,
        pose: (t) => {
          // A quick nervous flicker, the cases rattling.
          const k = this.fade(t, 0.3);
          this.glow = (i, s) => (Math.sin(s * 22 + i * 2.3) > 0.1 ? 1 : 0.08);
          this.open = 0.25 * k * (0.5 + 0.5 * Math.sin(t * 20));
          p.add('body', 0, 0, 3 * Math.sin(t * 30) * k);
        },
      },
      trail: {
        weight: 1.8,
        length: [8, 10],
        face: 'happy',
        when: aloft,
        start: () => {
          this.stage = 0;
          this.dir = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          // Up and away on a long loop, drawing a dotted line in the air: each pulse of
          // the lamp is a bead, and the beads run down the cage as the next is made.
          const k = this.fade(t, 0.6);
          this.up = (0.85 + 0.2 * sin(t, 0.6)) * k;
          this.buzz = k;
          this.open = 0.8 * k;
          this.actSpeed = 2.2;
          if (t > 0.8 + this.stage * 1.6 && this.stage < 4 && !this.walking) {
            this.amble(1.8, 0.1 + Math.random() * 0.5, this.dir * (this.stage % 2 ? -1 : 1));
            this.stage++;
          }
          this.sway = 0.5 * k;
          p.add('body', -12 * k);
          this.glow = (i, s) => {
            const beat = (s * 3 - i * 0.35) % 1;
            return 0.1 + 0.9 * Math.max(0, 1 - beat * 2.2) ** 2;
          };
        },
      },
      drift: {
        weight: 1.2,
        length: [6, 8],
        face: 'happy',
        when: aloft,
        start: () => (this.dir = Math.random() < 0.5 ? -1 : 1),
        pose: (t) => {
          // Floating off, slowly turning from one side to the other, the lamp dim and
          // wandering, and back.
          const k = this.fade(t, 0.8);
          this.up = (0.7 + 0.2 * sin(t, 0.25)) * k;
          this.buzz = 0.7 * k;
          this.open = 0.6 * k;
          this.actSpeed = 1.4;
          if (t > 0.6 && this.stage === 0 && !this.walking) {
            this.amble(2.5, undefined, this.dir);
            this.stage = 1;
          }
          this.sway = 0.3 * k;
          p.add('body', -8 * k, 0, 4 * sin(t, 0.5) * k);
          this.glow = (_i, s) => 0.3 + 0.2 * Math.sin(s * 1.9);
        },
      },
      spin: {
        weight: 1,
        length: [3.4, 4],
        face: 'happy',
        when: aloft,
        pose: (t) => {
          // A slow pirouette on the spot, the lamp lit like a lighthouse sweeping round.
          const k = this.fade(t, 0.5);
          this.up = 0.8 * k;
          this.buzz = k;
          this.open = 0.8 * k;
          p.add('body', -8 * k);
          this.glow = (_i, s) => 0.2 + 0.8 * Math.max(0, Math.cos(s * 3)) ** 2;
        },
      },
    };
  }

  // ---------- On the floor ----------

  private ground(): Record<string, Act> {
    const p = this.puppet;
    return {
      scurry: {
        weight: 1.2,
        length: [2.5, 4],
        when: this.still,
        start: () => {
          this.actSpeed = 1.4;
          this.amble(1.4 + Math.random() * 1.4);
        },
        pose: () => (this.actSpeed = 1.4),
      },
      sway: {
        weight: 1.3,
        length: [5, 6],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // Standing swinging his lamp side to side to a tune only he can hear.
          const k = this.fade(t, 0.5);
          this.sway = k;
          p.add('body', 0, 0, 5 * sin(t, 0.8) * k);
          p.add('head', 4 * k, 0, -6 * sin(t, 0.8, 0.1) * k);
          this.glow = (i, s) => 0.35 + 0.65 * Math.max(0, Math.sin(s * 3.2 - i * 0.7));
        },
      },
      warm: {
        weight: 1,
        length: [3, 4],
        face: 'focused',
        when: this.still,
        pose: (t) => {
          // Cases up, wings out for a test, a trembling buzz, then folded away.
          const k = span(t, 0.2, 0.7, this.actLength - 0.8, this.actLength - 0.2);
          this.open = k;
          this.buzz = k;
          this.up = 0.03 * k;
          p.add('body', -4 * k);
          this.glow = (_i, s) => 0.3 + 0.7 * k * (0.5 + 0.5 * Math.sin(s * 14));
        },
      },
      preen: {
        weight: 1.1,
        length: [5, 6.5],
        face: 'happy',
        when: this.still,
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
      peek: {
        weight: 1,
        length: [4, 5],
        face: 'surprised',
        when: this.still,
        pose: (t) => {
          // Looks over his own shoulder at his lamp, which flashes at him; jumps, glad.
          const k = span(t, 0.3, 0.9, this.actLength - 1, this.actLength - 0.3);
          p.add('head', 6 * k, 55 * k, 6 * k);
          p.add('body', 0, 25 * k);
          this.glow = (_i, s) => (k > 0.8 && Math.sin(s * 7) > 0 ? 1 : 0.15);
        },
      },
      doze: {
        weight: 1,
        length: [10, 14],
        when: this.still,
        pose: (t) => {
          // Dims to a faint glow, head down, cases lowered, breathing slowly; the lamp
          // brightening a very little with each breath.
          const k = span(t, 1.2, 2.6, this.actLength - 2, this.actLength - 0.6);
          p.add('head', 30 * k);
          p.add('body', 8 * k);
          this.feelers(() => [40 * k, 0, 0]);
          this.expression = k > 0.4 ? 'asleep' : 'sleepy';
          this.glow = (_i, s) =>
            (0.06 + 0.1 * (0.5 + 0.5 * Math.sin(s * 1.1))) * (1 - 0.4 * k) + 0.03;
        },
      },
    };
  }

  protected react(kind: Reaction, t: number) {
    const p = this.puppet;
    if (kind === 'poked') {
      // The whole lamp flashes white and he shoots up, cases flung open.
      const k = span(t, 0, 0.15, 1.2, 1.8);
      this.up = 1.8 * k;
      this.buzz = 1;
      this.open = 1;
      this.flash = 1;
      p.add('body', -16 * k);
      this.feelers(() => [-20 * k, 0, 0]);
    } else if (kind === 'dizzy') {
      const k = 1 - ease(t, 2.4, 3.4);
      this.up = 0.6 * k;
      this.buzz = 0.7 * k;
      this.open = 0.4 * k;
      p.add('head', 8 * k * Math.cos(t * 5), 12 * k * Math.sin(t * 3), 24 * k * Math.sin(t * 5));
      p.add('body', 0, 0, 10 * k * Math.sin(t * 5));
      this.flash = k;
    } else {
      // Close and pleased, the lamp pulsing warm and slow.
      const k = this.fade(t, 0.6);
      this.up = 0.6 * k;
      this.buzz = k;
      this.open = 0.5 * k;
      p.add('head', 6 * k, 0, 8 * k * sin(t, 1.2));
      p.add('body', -8 * k);
      this.glow = (_i, s) => 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(s * 2.4));
    }
  }

  // ---------- Posing ----------

  protected idle(t: number) {
    const p = this.puppet;
    this.up = 0;
    this.buzz = 0;
    this.open = 0;
    this.sway = 0;
    this.flash = 0;
    this.glow = null;
    this.actSpeed = 1;
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
    if (this.state === 'entering' || this.state === 'leaving') {
      this.up = Math.max(this.up, 0.7);
      this.buzz = 1;
      this.open = Math.max(this.open, 0.8);
    }
    const H = this.heightPx;
    const air = this.hoverUp(dt);
    const open = this.openS.update(dt, this.open);
    const buzz = this.buzzS.update(dt, this.buzz || (this.flying() ? 1 : 0));
    const sway = this.swayS.update(dt, this.sway);
    // Lying along the floor, turned toward the middle of her edge so her length shows.
    const [lo, hi] = this.span(env.frame);
    const aside =
      Math.sign((lo + hi) / 2 - this.s) * (this.edge === 'bottom' || this.edge === 'left' ? 1 : -1);
    const shown = this.walking || this.flying() || this.act === 'peek' ? 0.3 : 1;
    p.add('root', 0, this.turnS.update(dt, aside * 40 * shown));
    this.legs((side, k) => [-8 * air * (k + 1) * 0.5, 30 * air, -side * 10 * air]);
    if (!this.flying()) this.walkLegs(H * 0.9);
    p.add('body', -6 * air * buzz);
    // Cases lift up and out, the wings fan under them.
    const o = clamp(Math.max(open, buzz * 0.5), 0, 1);
    for (const [sfx, side] of SIDES) {
      p.add(`case.${sfx}`, 30 * o, 0, side * 45 * o);
    }
    p.add(
      'lamp',
      8 * sway * Math.sin(this.env.time * 2.1),
      14 * sway * Math.cos(this.env.time * 2.1),
    );
    this.tone(dt, env, null);
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    const t = env.time;
    const buzz = clamp(this.buzzS.y, 0, 1);
    // The wingbeat, direct: far too quick for a spring.
    const out = clamp(Math.max(this.openS.y, buzz * 0.5), 0, 1);
    const spread = Math.max(0.02, out * out);
    for (const [sfx, side] of SIDES) {
      const wing = `wing.${sfx}`;
      p.stretch(wing, spread, [0, 1, 0], spread);
      if (buzz > 0.02) {
        const rate = TAU * 12 * t;
        p.turn(
          wing,
          0,
          0,
          side * buzz * (18 + 26 * Math.sin(rate) + 6 * Math.sin(rate * 2.1 + side)),
        );
      }
    }
    this.lights(dt, t);
  }

  /** The lamp (Dot0) and the two beads in its cage (Dot1, Dot2). */
  private lights(_dt: number, t: number) {
    const asleep = this.expression === 'asleep';
    const colour = this.lookName === 'colour';
    const floor = this.night() ? 0.35 : 0.25;
    for (let i = 0; i < 2; i++) {
      let level: number;
      if (this.act === 'dizzy') level = Math.random() < 0.5 ? 1 : 0.15;
      else if (this.glow) level = this.glow(i, t);
      else level = floor + 0.3 + 0.35 * (0.5 + 0.5 * Math.sin(t * 1.1 - i * 0.8));
      level = Math.max(level, this.flash * (0.6 + 0.4 * Math.sin(t * 20 - i)));
      if (this.hovered && this.act === 'idle') level = 0.5 + 0.5 * Math.sin(t * 2.4 - i * 0.6);
      level = clamp(asleep ? level * 0.5 : level, 0, 1);
      // On the ink and paper looks the lamp is bright white or dark: no half measures.
      if (!colour && !asleep) level = clamp(level * 1.5 - 0.1, 0, 1);
      // A little brighter at night: the lit end of the range is pushed up, the dim end down.
      if (this.night()) level = clamp(level * 1.1 - (1 - level) * 0.05, 0, 1);
      if (colour && this.flash > 0.5) this.outfit.dot(i, level, '#ffffff');
      else this.outfit.dot(i, level);
    }
  }
}
