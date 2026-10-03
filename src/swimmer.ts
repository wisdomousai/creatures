import type { Object3D } from 'three';
import { Character, clamp, type Env, type Frame, type Spec } from './character';
import type { Puppet } from './puppet';
import { Spring, wobble } from './spring';

/**
 * The sea kit, for the swimmers that float in the band just inside the frame the way the
 * pufferfish does (Lumen, Bobbin, Nari, Pebble ...): a base class and a few helpers.
 *
 * A Swimmer comes in walking along the bottom of the band from behind the side of the
 * frame (so its spec needs `entrance: 'walk'`, `edges: ['bottom']`), then floats: its
 * middle is a point in viewport px (`pos`) that drifts round a loop just inside the frame
 * line (the bottom, up the right side, along the top, down the left), a little way back in
 * the box so it passes behind the crew, over any crewmate in the way. `swimTo(p)` sets off
 * round the loop to p; `somewhere()` picks a place to be; `hold()` stops where it is.
 * The model's `free` position is set from `pos` every frame, so the character base class
 * does the rest (depth, clipping, the hit area).
 *
 * A subclass supplies:
 *  - `startle()`: what a single poke does (it must end in `setAct('poked')` or similar);
 *  - `station(env, spot)`: an offset from its spot for the act it is doing (a hop toward
 *    the page, a loop round a point), `fast()`/`surge()`/`wild()` for how it swims and
 *    `turnFor(fade)` for how side-on it turns (default: side on to the way it swims);
 *  - `depthFor(act)`: how far back in the box an act wants it (0 front, 1 the back wall);
 *  - its acts (with a 'poked', 'love' and 'dizzy' of weight 0), its pose and its lights,
 *    as for any Character. Call `super.pose()` first in `pose`, and `mind(dt, env, calm)`
 *    for startling at a mouse rushing past and love at a mouse resting on it.
 *
 * `ripple()` runs a travelling wave down a chain of bones (a tail, a tentacle, a fin): bone
 * i is `lag` radians of phase behind bone i-1.
 */
export type Point = { x: number; y: number };
export type Side = 'bottom' | 'right' | 'top' | 'left';
/** Away from each side's frame line, into the page (viewport px, y down). */
export const INWARD: Record<Side, Point> = {
  bottom: { x: 0, y: -1 },
  top: { x: 0, y: 1 },
  left: { x: 1, y: 0 },
  right: { x: -1, y: 0 },
};
/** Where it is hanging about on the band, for `station`. */
export interface Spot {
  at: Point;
  side: Side;
  inward: Point;
  /** Its height in px. */
  H: number;
}

export const ease = (x: number) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};
/** 1 at 0, falling to 0 at ±width. */
export const bump = (x: number, width: number) => Math.max(0, 1 - Math.abs(x) / width);
export const cycle = (x: number) => x - Math.floor(x);

/**
 * A wave down a chain of bones: each turns `deg` degrees about its own axis (`axis`: 0
 * pitch, 1 yaw, 2 roll) at `phase`, bone i a further `lag` radians behind. `grow` makes
 * the swing bigger toward the tip. Direct (not sprung): call it after `puppet.update`.
 */
export function ripple(
  p: Puppet,
  bones: string[],
  phase: number,
  deg: number,
  lag = 0.7,
  axis: 0 | 1 | 2 = 1,
  grow = 0,
) {
  bones.forEach((bone, i) => {
    const a = Math.sin(phase - i * lag) * deg * (1 + grow * i);
    const turn: [number, number, number] = [0, 0, 0];
    turn[axis] = a;
    p.turn(bone, ...turn);
  });
}

export abstract class Swimmer extends Character {
  /** It comes in its own way (swimming), not jumping out of its picture. */
  readonly jumpsOut = false;
  /** Held by the pointer, it swims after it through the air. */
  readonly flies = true;
  /** Its middle keeps this far inside the frame line, in heights. */
  protected inset = 0.72;
  /** Its middle (where it tilts and turns) above its origin, as a share of its height. */
  protected middle = 0.45;
  /** Its middle, in viewport px; `free` is set from it each frame. */
  protected pos: Point = { x: 0, y: 0 };
  protected vel: Point = { x: 0, y: 0 };
  protected acc: Point = { x: 0, y: 0 };
  protected route: Point[] = [];
  /** Where it hangs about: how far round the band's loop (see loopAt). */
  protected spot = 0;
  protected exiting = false;
  protected frame: Frame | null = null;
  protected others: readonly Character[] = [];
  /** Nudged over crewmates in its way, and off the frame line when it needs room. */
  protected nudge = { x: new Spring(2, 0.8), y: new Spring(2, 0.8) };
  protected tilt = new Spring(1.6, 0.6);
  protected aside = new Spring(0.6, 0.9);
  protected seed = Math.random() * 100;
  /** The side it turns to (+1 right, -1 left) for acts aimed at a crewmate or the page. */
  protected toward = 1;
  /** Going round and round (so a tilt of more than a half turn is kept). */
  protected spinning = false;
  protected pokes: number[] = [];
  protected hover = 0;
  private mouse: { x: number; y: number; speed: number } | null = null;
  private shyUntil = 0;
  /** The pointer, where it last was, and whether it is on the page. */
  protected ptr = { x: 0, y: 0 };
  protected pointerOn = false;

  constructor(spec: Spec, model: Object3D) {
    super(spec, model);
  }

  // ---------- For the subclass ----------

  /** What a single poke does. */
  protected abstract startle(): void;
  /** Where the act puts it, from its spot, in px. */
  protected station(_env: Env, _s: Spot): Point {
    return { x: 0, y: 0 };
  }
  /** Speed, in heights per second, and how hard it accelerates (times that). */
  protected fast() {
    return 2.2;
  }
  protected surge() {
    return 2.5;
  }
  /** An extra shove each frame (a balloon's wild wobble), px/s². */
  protected wild(): Point | null {
    return null;
  }
  /** How far it keeps off the frame line, in heights. */
  protected clearance() {
    return 0.45;
  }
  /** How far its body turns from facing us: side on to swim, by default. `fade` is 0..1,
   * easing in at the start of the act and out at the end. */
  protected turnFor(_fade: number): number {
    return clamp(this.vel.x / this.heightPx, -1, 1) * 75;
  }
  /** How far it leans (radians, about the page), on top of leaning into its turns. */
  protected leanFor(): number {
    return 0;
  }
  /** How leaning into its turns counts (radians at full acceleration). */
  protected leanGain() {
    return 0.14;
  }
  /** How far back it wants to be for an act, 0 the front to 1 the back wall; undefined to
   * leave it. */
  protected depthFor(_act: string): number | undefined {
    return undefined;
  }

  // ---------- Reactions ----------

  poke() {
    if (this.state !== 'here') return;
    const now = performance.now() / 1000;
    this.pokes = [...this.pokes.filter((at) => now - at < 2.5), now];
    if (this.pokes.length >= 3) {
      this.pokes = [];
      this.hold();
      this.setAct('dizzy');
    } else if (this.act !== 'dizzy') this.startle();
  }

  protected setAct(name: string) {
    super.setAct(name);
    const d = this.depthFor(name);
    if (d !== undefined) this.depthGoal = d;
    this.toward = this.turnTo();
  }

  /** Which way is the middle of the page, or a crewmate: +1 right, -1 left. */
  protected turnTo() {
    const f = this.frame;
    const m = this.mate();
    const x = m ? m.x : f ? (f.left + f.right) / 2 : this.pos.x;
    return Math.sign(x - this.pos.x) || 1;
  }

  /** The nearest crewmate on stage, where their middle is. */
  protected mate(): Point | null {
    const f = this.frame;
    if (!f) return null;
    let best: Point | null = null;
    let far = Infinity;
    for (const o of this.others) {
      if (o === this || o.state !== 'here') continue;
      const b = o.bounds(f);
      const at = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
      const d = Math.hypot(at.x - this.pos.x, at.y - this.pos.y);
      if (d < far) [best, far] = [at, d];
    }
    return best;
  }

  /**
   * Call each frame from `pose`: startles at a mouse rushing past close by (`calm`: it is
   * not in the middle of something that shouldn't be interrupted) and goes to 'love' under
   * a mouse resting on it.
   */
  protected mind(dt: number, env: Env, calm: boolean) {
    const H = this.heightPx;
    const { x, y } = env.pointer;
    this.ptr = { x, y };
    this.pointerOn = env.pointer.present;
    const was = this.mouse ?? { x, y, speed: 0 };
    const speed = Math.hypot(x - was.x, y - was.y) / Math.max(dt, 1e-3);
    this.mouse = { x, y, speed: was.speed + (speed - was.speed) * Math.min(1, dt * 10) };
    const eye = this.eyePoint(env.frame);
    const near = Math.hypot(x - eye.x, y - eye.y) < H * 2.5;
    if (
      env.pointer.present &&
      near &&
      this.mouse.speed > H * 40 &&
      calm &&
      env.time > this.shyUntil
    ) {
      this.shyUntil = env.time + 8;
      this.startle();
    }
    this.hover = this.hovered ? this.hover + dt : 0;
    if (this.hover > 0.6 && calm && this.free && !this.exiting) {
      this.hold();
      this.setAct('love');
    }
  }

  protected pose(_dt: number, _env: Env) {
    // Turned a little toward the middle of the page when it faces us.
    this.puppet.add('root', 0, this.aside.y);
  }

  /** A burst of speed along the band toward one side (+1 right). */
  protected kickTo(dir: number) {
    if (this.frame) this.swimTo(this.spot + this.loopDir(dir) * this.heightPx * 5);
  }

  /** +1 or -1 round the loop for going right (+1) or left along the bottom or the top;
   * up or down a side is anyone's guess. */
  protected loopDir(dir: number) {
    const f = this.frame;
    if (!f) return dir;
    const side = this.sideOf(f, this.spot);
    return side === 'bottom' ? dir : side === 'top' ? -dir : Math.random() < 0.5 ? 1 : -1;
  }

  /** Let go in the air it floats on from there, as it is. */
  protected flightBack() {
    const at = this.free;
    if (!at || !this.frame) return false;
    this.pos = { x: at.x, y: at.y - this.middle * this.heightPx };
    this.vel = { x: 0, y: 0 };
    this.hold();
    return true;
  }

  /** Stops where it is and stays there. */
  protected hold() {
    if (!this.free || this.exiting || !this.frame) return;
    this.route = [];
    this.spot = this.along(this.frame, this.pos);
  }

  // ---------- The band ----------

  /** The loop its middle keeps to: a rectangle in the open air of the room (up off the floor,
   * in from the side walls and down from the ceiling), the way a flier moves through it,
   * not hugging the frame line. */
  protected loop(f: Frame) {
    const c = this.heightPx * this.inset;
    const W = f.right - f.left;
    const V = f.bottom - f.top;
    const L = f.left + c + W * this.airSide;
    const R = Math.max(L + 1, f.right - c - W * this.airSide);
    const T = f.top + c + V * this.airTop;
    const B = Math.max(T + 1, f.bottom - c - V * this.airFloor);
    const w = R - L;
    const h = B - T;
    return { L, R, T, B, w, h, P: 2 * (w + h) };
  }

  /** How much of the room (of its width and height) the loop keeps clear at the sides, the
   * ceiling and the floor: the open air in the middle is where it floats. */
  protected airSide = 0.07;
  protected airTop = 0.1;
  protected airFloor = 0.24;

  /** The point p round the loop: from the bottom left corner, right along the bottom,
   * up the right side, back along the top and down the left. */
  protected loopAt(f: Frame, p: number): Point {
    const { L, R, T, B, w, h, P } = this.loop(f);
    const q = ((p % P) + P) % P;
    if (q < w) return { x: L + q, y: B };
    if (q < w + h) return { x: R, y: B - (q - w) };
    if (q < 2 * w + h) return { x: R - (q - w - h), y: T };
    return { x: L, y: T + (q - 2 * w - h) };
  }

  /** How far round the loop the nearest point to pt is. */
  protected along(f: Frame, pt: Point): number {
    const { L, R, T, B, w, h } = this.loop(f);
    const x = clamp(pt.x, L, R);
    const y = clamp(pt.y, T, B);
    const d = [Math.abs(pt.y - B), Math.abs(pt.x - R), Math.abs(pt.y - T), Math.abs(pt.x - L)];
    const k = d.indexOf(Math.min(...d));
    return [x - L, w + (B - y), w + h + (R - x), 2 * w + h + (y - T)][k];
  }

  protected sideOf(f: Frame, p: number): Side {
    const { w, h, P } = this.loop(f);
    const q = ((p % P) + P) % P;
    return q < w ? 'bottom' : q < w + h ? 'right' : q < 2 * w + h ? 'top' : 'left';
  }

  /** Swim round the band to p on its loop, the short way, by the corners. */
  protected swimTo(p: number) {
    const f = this.frame;
    if (!f) return;
    const { w, h, P } = this.loop(f);
    const from = this.along(f, this.pos);
    let d = p - from;
    d -= P * Math.round(d / P);
    const way = Math.sign(d);
    this.route = [0, w, w + h, 2 * w + h]
      .map((c) => ({ c, k: ((((c - from) * way) % P) + P) % P }))
      .filter(({ k }) => k > 1e-6 && k < Math.abs(d))
      .sort((a, b) => a.k - b.k)
      .map(({ c }) => this.loopAt(f, c));
    this.route.push(this.loopAt(f, from + d));
    this.spot = (((from + d) % P) + P) % P;
  }

  /** Somewhere else to be: mostly a little way along, now and then anywhere; clear of
   * the others if it can. */
  protected somewhere(): number {
    const f = this.frame;
    if (!f) return this.spot;
    const { P } = this.loop(f);
    const H = this.heightPx;
    let p = this.spot;
    for (let i = 0; i < 10; i++) {
      p =
        Math.random() < 0.75
          ? this.spot + (Math.random() < 0.5 ? -1 : 1) * H * (1.5 + Math.random() * 4)
          : Math.random() * P;
      if (!this.blocked(this.loopAt(f, p))) break;
    }
    return p;
  }

  /** How far it must move inward from its side to clear a crewmate, at pt (px). */
  protected blocked(pt: Point, side?: Side): number {
    const f = this.frame!;
    const w = this.widthPx() / 2 + this.heightPx * 0.15;
    const h = this.heightPx * 0.55;
    const s = side ?? this.sideOf(f, this.along(f, pt));
    let need = 0;
    for (const o of this.others) {
      if (o === this || o.state === 'gone') continue;
      const b = o.bounds(f);
      if (pt.x + w < b.x || pt.x - w > b.x + b.w || pt.y + h < b.y || pt.y - h > b.y + b.h)
        continue;
      // Over them, by the way out from its own side.
      need = Math.max(
        need,
        {
          bottom: pt.y + h - b.y,
          top: b.y + b.h - (pt.y - h),
          left: b.x + b.w - (pt.x - w),
          right: pt.x + w - b.x,
        }[s],
      );
    }
    return need;
  }

  // ---------- Coming and going ----------

  protected onEnter() {
    this.free = null;
    this.exiting = false;
    this.route = [];
    this.vel = { x: 0, y: 0 };
    // Afloat, its middle at the loop's height as it swims in.
    this.h = this.heightPx * (this.inset - this.middle);
  }

  protected onArrive() {
    const f = this.frame!;
    this.pos = { x: this.s, y: f.bottom - this.h - this.middle * this.heightPx };
    this.vel = { x: this.pace, y: 0 };
    this.free = { x: this.pos.x, y: this.pos.y + this.middle * this.heightPx, tilt: 0 };
    this.spot = this.along(f, this.pos);
  }

  leave() {
    if (this.state !== 'here' || !this.free || !this.frame) return super.leave();
    if (this.exiting) return;
    // Down to the floor by the nearer side, and out past it.
    const f = this.frame;
    const { w } = this.loop(f);
    const left = this.pos.x < (f.left + f.right) / 2;
    this.swimTo(left ? 0 : w);
    const corner = this.route[this.route.length - 1] ?? this.pos;
    this.route.push({ x: corner.x, y: f.bottom - this.heightPx * this.inset });
    this.exiting = true;
  }

  /** From afloat back to the edge's own swimming, to leave past the side of the frame. */
  private offStage() {
    const f = this.frame!;
    this.s = this.pos.x;
    this.h = f.bottom - this.pos.y - this.middle * this.heightPx;
    this.pace = this.vel.x;
    this.free = null;
    this.exiting = false;
    super.leave();
  }

  // ---------- Moving ----------

  protected move(dt: number, env: Env) {
    this.frame = env.frame;
    this.others = env.crew;
    if (!this.free) return super.move(dt, env);
    const f = env.frame;
    const H = this.heightPx;
    const pos = this.pos;
    const maxSpeed = H * this.fast();
    const maxAcc = maxSpeed * this.surge();
    const spot = this.loopAt(f, this.spot);
    const side0 = this.sideOf(f, this.spot);
    const off = this.station(env, { at: spot, side: side0, inward: INWARD[side0], H });
    const rest = {
      x: spot.x + wobble(env.time * 0.13, this.seed) * H * 0.25 + off.x,
      y: spot.y + wobble(env.time * 0.11, this.seed + 3) * H * 0.1 + off.y,
    };
    const target = this.route[0] ?? rest;
    const last = this.route.length <= 1;
    const dx = target.x - pos.x;
    const dy = target.y - pos.y;
    const dist = Math.hypot(dx, dy);
    if (this.route.length && dist < (last ? H * 0.12 : H * 0.6)) {
      this.route.shift();
      if (!this.route.length && this.exiting) return this.offStage();
    }
    // Swim toward it, easing in at the end.
    const speed = last ? Math.min(maxSpeed, dist * 2.2) : maxSpeed;
    let ax = dist > 1e-3 ? ((dx / dist) * speed - this.vel.x) * 3 : -this.vel.x * 3;
    let ay = dist > 1e-3 ? ((dy / dist) * speed - this.vel.y) * 3 : -this.vel.y * 3;
    const w = this.wild();
    if (w) {
      ax += w.x;
      ay += w.y;
    }
    const a = Math.hypot(ax, ay);
    if (a > maxAcc) [ax, ay] = [(ax / a) * maxAcc, (ay / a) * maxAcc];
    this.acc = { x: ax, y: ay };
    this.vel.x += ax * dt;
    this.vel.y += ay * dt;
    pos.x += this.vel.x * dt;
    pos.y += this.vel.y * dt;

    // Nudged clear of the frame line, and over crewmates in its way.
    const side = this.sideOf(f, this.along(f, pos));
    const reach = H * this.clearance();
    let nx = Math.max(0, reach - (pos.x - f.left)) - Math.max(0, reach - (f.right - pos.x));
    let ny = Math.max(0, reach - (pos.y - f.top)) - Math.max(0, reach - (f.bottom - pos.y));
    const over = Math.min(H * 1.6, this.blocked(pos, side));
    nx += INWARD[side].x * over;
    ny += INWARD[side].y * over;
    const drawn = {
      x: pos.x + this.nudge.x.update(dt, nx),
      y: pos.y + this.nudge.y.update(dt, ny),
    };

    const t = this.actT;
    const fade = clamp(Math.min(t / 0.6, (this.actLength - t) / 0.6), 0, 1);
    const turn = this.turnFor(fade);
    this.heading.update(dt, turn);
    const middle = (f.left + f.right) / 2;
    this.aside.update(dt, Math.abs(turn) > 20 ? 0 : Math.sign(middle - pos.x) * 22);
    const lean = clamp(-this.acc.x / maxAcc, -1, 1) * this.leanGain() + this.leanFor();
    this.free = {
      x: drawn.x,
      y: drawn.y + this.middle * H,
      tilt: this.tilt.update(dt, lean),
    };
    // Once round, it's upright again: drop the whole turn.
    if (!this.spinning && Math.abs(this.free.tilt) > Math.PI)
      this.tilt.snap(this.free.tilt - 2 * Math.PI * Math.round(this.free.tilt / (2 * Math.PI)));
  }

  /** 0 still, 1 swimming hard. */
  protected swimming() {
    const speed = this.free ? Math.hypot(this.vel.x, this.vel.y) : Math.abs(this.pace);
    return clamp(speed / (this.heightPx * 1.5), 0, 1);
  }
}

/**
 * A Spring that steps at a fixed 120 Hz whatever the frame rate (the user's machine is
 * often loaded), so a kicked bell or a flapping fin behaves the same at 20, 30 or 60 fps.
 * `update` returns the value after the last whole step.
 */
export class FixedSpring extends Spring {
  private owed = 0;
  constructor(f = 5, zeta = 0.35, r = 1, start = 0) {
    super(f, zeta, r, start);
  }
  update(dt: number, target: number): number {
    this.owed += Math.min(dt, 0.1);
    while (this.owed >= STEP) {
      super.update(STEP, target);
      this.owed -= STEP;
    }
    return this.y;
  }
}
const STEP = 1 / 120;
