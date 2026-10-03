import type { Object3D } from 'three';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import type { Reaction } from './birds';
import { Bug, ease, SIDES, span, TAU } from './bug';
import { sin } from './moves';
import { Spring } from './spring';

/**
 * Fiddle, the robot grasshopper: a tall long face, long thin antennae, a green body under
 * two narrow wing covers with a lit stripe on each (the fiddle), orange wings folded
 * under them, and the long folded hind legs with big drumstick thighs. He fiddles a
 * chirp: a hind leg drawn up and down across the cover like a bow, the stripes pulsing in
 * the rhythm (three chirps, a rest, three more). He makes a huge jump in an arc, covers
 * flung open and wings flashing, and lands with a thud and a bounce. He also hops about
 * in little hops, cleans his antennae, sits up on his hind legs, stretches a hind leg out
 * behind him, flutters his wings, and naps.
 *
 * A poke makes him spring up with his covers open; three make him dizzy; the mouse
 * resting on him makes him chirp a happy little tune.
 */
export const GRASSHOPPER_FACE: FaceLayout = {
  width: 192,
  height: 240,
  eyes: [
    [0.3, 0.46],
    [0.7, 0.46],
  ],
  rx: 0.12,
  ry: 0.2,
  line: 0.05,
  mouth: [0.5, 0.82],
};

const PAIRS = 2;

export class Grasshopper extends Bug {
  private coverS = new Spring(6, 0.45);
  private wingS = new Spring(5, 0.5);
  private foldS = new Spring(6, 0.45);
  private turnS = new Spring(3, 0.8);
  private sitS = new Spring(4, 0.5);
  // Per-frame requests from acts, cleared in idle().
  private cover = 0;
  private wings = 0;
  /** The hind legs folded for a jump (1) or stretched out behind (-1). */
  private fold = 0;
  private bow = 0;
  private sit = 0;
  private flash = 0;
  private yaw = 0;
  private lamp: ((i: number, t: number) => number) | null = null;
  private actSpeed = 1;
  private dir = 1;
  private stage = 0;
  private hopT = -1;
  private beat = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Fiddle',
        model: 'grasshopper',
        metres: 0.42,
        width: 0.8,
        size: 0.5,
        feels: {
          default: { f: 4, zeta: 0.6 },
          root: { f: 4, zeta: 0.55 },
          body: { f: 5, zeta: 0.45 },
          abdomen: { f: 6, zeta: 0.35 },
          head: { f: 5, zeta: 0.5, r: 0.5 },
          'cover.L': { f: 7, zeta: 0.4 },
          'cover.R': { f: 7, zeta: 0.4 },
          'under.L': { f: 5, zeta: 0.5 },
          'under.R': { f: 5, zeta: 0.5 },
          'hleg.L': { f: 6, zeta: 0.4 },
          'hleg.R': { f: 6, zeta: 0.4 },
          'hfoot.L': { f: 6, zeta: 0.4 },
          'hfoot.R': { f: 6, zeta: 0.4 },
          'antenna.L.1': { f: 3.5, zeta: 0.35 },
          'antenna.R.1': { f: 3.5, zeta: 0.35 },
          'antenna.L.2': { f: 4.5, zeta: 0.2 },
          'antenna.R.2': { f: 4.5, zeta: 0.2 },
        },
        face: GRASSHOPPER_FACE,
        eyes: 0.6,
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
        turn: 70,
        roam: true,
      },
      model,
    );
    this.acts = { ...this.moves(), ...this.reactions() };
  }

  /** The four front legs: [forward, lift, foot] for each, by side and pair. */
  private legs4(fn: (side: number, k: number) => number[]) {
    for (const [sfx, side] of SIDES)
      for (let k = 0; k < PAIRS; k++) {
        const [fwd, lift, foot] = fn(side, k);
        this.leg(sfx, side, k, fwd, lift, foot);
      }
  }

  private leap(heights: number, arc: number, time: number) {
    const f = this.env?.frame;
    if (!f) return;
    const [lo, hi] = this.span(f);
    const to = clamp(
      this.s + this.dir * heights * this.heightPx,
      lo + this.widthPx() * 0.6,
      hi - this.widthPx() * 0.6,
    );
    this.hopOnto(to, clamp(this.depth + (Math.random() - 0.5) * 0.3, 0, 1), 0, time, arc);
    this.hopT = 0;
  }

  private moves(): Record<string, Act> {
    const p = this.puppet;
    const still = () => this.still() && this.state === 'here' && !this.hopping;
    return {
      idle: { weight: 3, length: [2.5, 5] },
      stroll: {
        weight: 1.2,
        length: [2.5, 4],
        when: this.still,
        start: () => {
          this.actSpeed = 1;
          this.amble(1.2 + Math.random() * 1.2);
        },
        pose: () => (this.actSpeed = 1),
      },
      fiddle: {
        weight: 3,
        length: [8, 9],
        face: 'happy',
        when: still,
        pose: (t) => {
          // Covers lifted a little, one hind leg drawn up and down across it like a bow,
          // in chirps: three quick, a rest, three quick, a rest; the stripes pulsing with
          // each stroke and his head tipped back, singing.
          const k = span(t, 0.6, 1.2, this.actLength - 1.2, this.actLength - 0.5);
          const x = t % 2.6;
          const on = x < 1.5 ? 1 : 0;
          this.bow = k * on;
          this.cover = 0.35 * k;
          this.beat = Math.sin(t * TAU * 2) * on * k;
          p.add('head', -10 * k, 0, 4 * k * Math.sin(t * 2.4));
          p.add('body', -3 * k);
          this.lamp = (i, s) => {
            const xx = s % 2.6;
            const stroke = xx < 1.5 ? Math.max(0, Math.sin(xx * TAU * 2 - 1.2)) : 0;
            return i === 3 || i === 4 ? 0.15 + 0.85 * stroke : 0.3 + 0.4 * stroke;
          };
          this.feelers((side, j) => [
            (j === 1 ? 6 : 14) * k * Math.sin(t * 9 + side),
            0,
            side * 6 * k,
          ]);
        },
      },
      jump: {
        weight: 2.6,
        length: [6, 6.5],
        face: 'surprised',
        when: still,
        start: () => {
          this.stage = 0;
          this.dir = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          // A great jump: down on the hind legs folded tight, a pause, then the whole
          // length of him flung up and across in a high arc, covers open and the wings
          // flashing orange, a heavy landing with a bounce, and a pleased shake.
          if (this.stage === 0) {
            this.fold = ease(t, 0.2, 1.2);
            if (t > 1.5) {
              this.leap(3.2, 2.2, 1.1);
              this.stage = 1;
            }
          }
          if (this.stage === 1 && !this.hopping && t > 2) this.stage = 2;
          const air = this.hopping ? 1 : 0;
          this.cover = air;
          this.wings = air;
          this.fold = this.stage === 0 ? this.fold : this.hopping ? -0.6 : 0;
          if (this.stage === 2) this.expression = 'happy';
          this.lamp = () => (air ? 1 : 0.4);
        },
      },
      hops: {
        weight: 2.2,
        length: [6, 7],
        face: 'happy',
        when: still,
        start: () => {
          this.stage = 0;
          this.dir = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          // A run of little hops, a body length each, hind legs snapping straight.
          const at = 0.7 + this.stage * 1.3;
          if (!this.hopping && this.stage < 4 && t > at && t < this.actLength - 1.2) {
            this.leap(0.9, 0.55, 0.42);
            this.stage++;
          }
          this.fold = this.hopping ? -0.4 : 0.35 * (1 - ease(t, at, at + 0.3));
        },
      },
      clean: {
        weight: 1.2,
        length: [5, 6],
        face: 'happy',
        when: still,
        pose: (t) => {
          // Front legs up to draw each long antenna through them in turn.
          const k = this.fade(t, 0.5);
          p.add('head', 14 * k);
          for (const [sfx, side] of SIDES) {
            const mine = t < this.actLength / 2 === side > 0;
            const use = mine ? k : 0;
            p.add(`antenna.${sfx}.1`, 80 * use, 0, side * 18 * use);
            p.add(`antenna.${sfx}.2`, 50 * use);
            this.leg(sfx, side, 0, 32 * use, 46 * use + 6 * sin(t, 3) * use, -side * 18 * use);
          }
        },
      },
      situp: {
        weight: 1.2,
        length: [4.5, 5.5],
        face: 'surprised',
        when: still,
        pose: (t) => {
          // Rears up on the hind legs and looks round like a meerkat, front legs folded.
          const k = span(t, 0.5, 1.3, this.actLength - 1.3, this.actLength - 0.5);
          this.sit = k;
          p.add('head', 6 * k, 22 * k * Math.sin(t * 1.4), 0);
          this.feelers((side) => [-10 * k, 0, side * 14 * k]);
        },
      },
      stretch: {
        weight: 1.1,
        length: [4, 5],
        face: 'sleepy',
        when: still,
        pose: (t) => {
          // One hind leg stretched right out behind him, then the other, with a yawn.
          const k = this.fade(t, 0.5);
          const a = span(t, 0.6, 1.3, 1.9, 2.4) - span(t, 2.6, 3.3, 3.9, 4.4);
          this.fold = -1 * Math.abs(a) * k;
          p.add('head', -6 * k);
          p.add('body', -4 * k * Math.abs(a));
        },
      },
      flutter: {
        weight: 1.1,
        length: [3.5, 4],
        face: 'happy',
        when: still,
        pose: (t) => {
          // Covers open and the orange wings fanned and trembling, then folded away.
          const k = span(t, 0.4, 1, this.actLength - 1, this.actLength - 0.4);
          this.cover = k;
          this.wings = k * (0.8 + 0.2 * Math.sin(t * 24));
          p.add('body', -4 * k);
          this.lamp = (i, s) => 0.3 + 0.6 * Math.max(0, Math.sin(s * 8 + i));
        },
      },
      nap: {
        weight: 0.9,
        length: [9, 12],
        when: still,
        pose: (t) => {
          const k = span(t, 1, 2.2, this.actLength - 2, this.actLength - 0.6);
          p.add('head', 22 * k);
          p.add('body', 6 * k);
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
      const k = span(t, 0, 0.12, 0.5, 0.95);
      this.up = 0.6 * k;
      this.cover = 1;
      this.wings = k;
      this.flash = 1;
      this.fold = -0.5 * k;
      p.add('body', -10 * k);
      this.feelers(() => [-20 * k, 0, 0]);
    } else if (kind === 'dizzy') {
      const k = 1 - ease(t, 2.4, 3.4);
      this.flash = k;
      this.cover = 0.4 * k;
      p.add('head', 8 * k * Math.cos(t * 5), 14 * k * Math.sin(t * 3), 22 * k * Math.sin(t * 5));
      p.add('body', 0, 0, 10 * k * Math.sin(t * 5));
    } else {
      // A happy little chirp.
      const k = this.fade(t, 0.6);
      const on = Math.sin(t * 7) > -0.2 ? 1 : 0;
      this.bow = k * on;
      this.cover = 0.3 * k;
      this.beat = Math.sin(t * TAU * 2.5) * k;
      p.add('head', -8 * k);
      this.lamp = (i, s) => 0.3 + 0.7 * Math.max(0, Math.sin(s * 15)) * k;
    }
  }

  // ---------- Posing ----------

  protected idle(t: number) {
    const p = this.puppet;
    this.up = 0;
    this.cover = 0;
    this.wings = 0;
    this.fold = 0;
    this.bow = 0;
    this.sit = 0;
    this.flash = 0;
    this.yaw = 0;
    this.beat = 0;
    this.lamp = null;
    this.actSpeed = 1;
    this.expression = this.hovered ? 'happy' : 'neutral';
    p.add('body', 1 * sin(t, 0.28));
    p.add('head', 2 * sin(t, 0.4), 4 * sin(t, 0.13));
    p.add('abdomen', 2 * sin(t, 0.3, 0.2));
    this.feelers((side, k) => {
      const ph = side > 0 ? 0 : 0.3;
      return k === 1
        ? [6 * sin(t, 0.5, ph), 0, side * (-4 + 6 * sin(t, 0.37, ph))]
        : [14 * sin(t, 0.5, ph - 0.15), 0, side * 6 * sin(t, 0.61, ph)];
    });
    this.legs4((side, k) => [
      2 * sin(t, 0.17, k * 0.31 + side * 0.1),
      3 * Math.max(0, sin(t, 0.11, k * 0.4 + side * 0.2)) ** 4,
      0,
    ]);
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    this.env = env;
    this.spec.speed = this.actSpeed;
    this.enjoy(dt, this.still() && !this.hopping);
    if (this.hopping) this.hopT += dt;
    else if (this.hopT >= 0) {
      this.hopT = -1;
      p.kick('body', -250);
      p.kick('head', 200);
    }
    this.hoverUp(dt);
    const cover = this.coverS.update(dt, this.cover);
    this.wingS.update(dt, this.wings);
    const fold = this.foldS.update(dt, this.fold);
    const sit = this.sitS.update(dt, this.sit);
    const H = this.heightPx;
    const [lo, hi] = this.span(env.frame);
    const aside =
      Math.sign((lo + hi) / 2 - this.s) * (this.edge === 'bottom' || this.edge === 'left' ? 1 : -1);
    const yaw = this.turnS.update(
      dt,
      this.yaw !== 0 ? this.yaw : aside * 52 * (this.walking ? 0.85 : 1),
    );
    // Front legs walk; in the air they trail.
    const moving = Math.min(1, this.stride / (H * 0.9));
    if (this.hopping) {
      this.legs4((side, k) => [-10 + k * 8, 30, -side * 12]);
    } else if (moving > 0.02) {
      this.legs4((side, k) =>
        this.step(this.gait * 7 + k * 1.5, side, k, 16 * moving, 24 * moving),
      );
      p.add('body', 0, 0, 2 * Math.sin(this.gait * 7) * moving);
    }
    p.add('root', 0, yaw);
    // Hind legs: folded tight to jump (+), stretched out behind (-); the bow strokes.
    for (const [sfx, side] of SIDES) {
      const bowing = sfx === 'L' ? this.bow : 0;
      p.add(`hleg.${sfx}`, 28 * fold + 34 * this.beat * bowing, 0, side * 0);
      p.add(`hfoot.${sfx}`, -32 * fold, 0, 0);
    }
    // Covers lifted outward when asked; the wings are scaled out in after().
    for (const [sfx, side] of SIDES) p.add(`cover.${sfx}`, 14 * cover, 0, side * 38 * cover);
    // Sitting up: the front of him lifted, hind legs straightening under him.
    p.add('body', -26 * sit);
    p.add('hleg.L', 18 * sit);
    p.add('hleg.R', 18 * sit);
    this.legs4((side, k) => (sit > 0.02 ? [0, 30 * sit + k * 0, -side * 14 * sit] : [0, 0, 0]));
    this.tone(dt, env, null);
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    const t = env.time;
    // The orange wings: not there until the covers lift and the wings open.
    const w = clamp(this.wingS.y, 0.001, 1);
    const spread = Math.max(0.02, w * w);
    for (const [sfx, side] of SIDES) {
      const wing = `under.${sfx}`;
      p.stretch(wing, spread, [0, 1, 0], spread);
      if (w > 0.1) p.turn(wing, 0, 0, side * (30 * w + 10 * w * Math.sin(t * 24)));
    }
    this.light(t);
  }

  /** The abdomen bands (Dot0-2), the cover stripes (Dot3) and the thigh stripes (Dot4). */
  private light(t: number) {
    const asleep = this.expression === 'asleep';
    const colour = this.lookName === 'colour';
    for (let i = 0; i < 5; i++) {
      let level: number;
      if (this.act === 'dizzy') level = Math.random() < 0.5 ? 1 : 0.2;
      else if (this.lamp) level = this.lamp(i, t);
      else level = 0.35 + 0.3 * Math.sin(t * 1.3 - i * 1.0);
      level = Math.max(level, this.flash * (0.5 + 0.5 * Math.sin(t * 18 - i)));
      if (this.hovered && this.act === 'idle') level = 0.5 + 0.5 * Math.sin(t * 3.4 - i);
      this.outfit.dot(
        i,
        clamp(asleep ? level * 0.5 : level, 0, 1),
        colour && i >= 3 ? '#ffe45a' : undefined,
      );
    }
  }
}
