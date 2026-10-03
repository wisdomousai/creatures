import type { Object3D } from 'three';
import { Bolt } from './bolt';
import { Character, clamp, type Env, type Spec } from './character';

/**
 * The shared bits of the toy robots (Clatter the tin wind-up, Dimple the toddler, Earl the
 * teapot butler, Lofty and Skip the play-friends): the env kept for the acts, the way a poke
 * becomes a start and three pokes dizzy, a way to find Bolt on the same floor, and the arm
 * poses of the humanoids.
 *
 * Arms hang straight down (unlike Bolt's, which hang at an angle): `forward` swings an arm
 * forward and up (180 is straight up), `raise` swings it out sideways, `bend` folds the
 * forearm forward. Bones are named as Bolt's and Nova's are (`upper_arm`, `forearm`, `hand`,
 * `body`, `head`), so the director's shared poses (play.ts) work on them.
 */
export const smooth = (x: number) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

export abstract class Toybot extends Character {
  protected env: Env | null = null;
  protected pokes: number[] = [];
  /** For acts that go somewhere first: when it got there (s of the act), or -1. */
  protected arrivedAt = -1;
  /** Whether this act has already set a friend going (once per act). */
  protected sent = false;
  private lastAct = 'idle';

  constructor(spec: Spec, model: Object3D) {
    super(spec, model);
  }

  update(dt: number, env: Env) {
    this.env = env;
    if (this.act !== this.lastAct) {
      this.lastAct = this.act;
      this.arrivedAt = -1;
      this.sent = false;
    }
    super.update(dt, env);
  }

  /** A poke: startled; three quick ones, dizzy. */
  poke() {
    if (this.state !== 'here') return;
    const now = performance.now() / 1000;
    this.pokes = [...this.pokes.filter((at) => now - at < 1.6), now];
    if (this.pokes.length >= 3) {
      this.pokes = [];
      this.setAct('dizzy');
    } else if (this.act !== 'dizzy') this.setAct('poked');
  }

  /** Standing about and free to start something. */
  protected get free_() {
    return this.state === 'here' && !this.walking && this.goal === null;
  }

  /** Is the mouse resting on it, and has it had a moment to notice? */
  protected get pleased() {
    return this.hovered && this.state === 'here' && this.act === 'idle' && this.actT > 0.8;
  }

  /** Bolt, standing on the same floor (not flying or sitting) and near enough to go to. */
  protected bolt(range = 5): Bolt | null {
    const f = this.env?.frame;
    if (!f) return null;
    for (const o of this.env!.crew) {
      if (o instanceof Bolt && o.state === 'here' && !o.flying && !o.seated && o.act === 'idle') {
        return this.spaceTo(o, f).n < range ? o : null;
      }
    }
    return null;
  }

  /** Seconds since it got where it was going (-1 while it's still on its way). */
  protected since(t: number) {
    if (this.walking || this.goal !== null) return -1;
    if (this.arrivedAt < 0) this.arrivedAt = t;
    return t - this.arrivedAt;
  }

  /** Off the floor by this many metres, on a parabola over [t0, t0 + dur]. */
  protected arc(t: number, t0: number, dur: number, height: number) {
    const u = (t - t0) / dur;
    return u > 0 && u < 1 ? 4 * height * u * (1 - u) : 0;
  }

  /** Walk along the floor by `far` px (either way if `way` is 0), staying in the frame. */
  protected stroll(way: number, far: number, depth?: number) {
    const f = this.env?.frame;
    if (!f) return;
    const [lo, hi] = this.span(f);
    const w = way || (this.s - lo > hi - this.s ? -1 : 1);
    const reach = Math.max(0, (w > 0 ? hi - this.s : this.s - lo) - this.widthPx());
    this.walkTo(this.s + w * Math.min(far, reach), depth);
  }

  /** side: 1 its left, -1 its right. */
  protected arm(side: 1 | -1, forward: number, raise = 0, bend = 0) {
    const s = side === 1 ? 'L' : 'R';
    const p = this.puppet;
    const name = p.has(`upper_arm.${s}`) ? `upper_arm.${s}` : `arm.${s}`;
    p.add(name, -forward, 0, side * raise);
    if (bend && p.has(`forearm.${s}`)) p.add(`forearm.${s}`, -bend, 0, 0);
  }

  protected arms(forward: number, raise = 0, bend = 0) {
    this.arm(1, forward, raise, bend);
    this.arm(-1, forward, raise, bend);
  }
}

/**
 * Fixed-step helpers for the second batch of toy robots (Tumble the slinky, Scuttle the
 * hexapod, Teeter the ballbot, Shutter the camera, Wax the DJ), so their own springs come
 * out the same at 20, 30 or 60 frames a second. DEG here turns radians into degrees.
 */
export const STEP = 1 / 120;

/** Run `fn` in steps of at most 1/120 s that add up to `dt`. */
export function fixed(dt: number, fn: (h: number) => void) {
  const d = Math.min(dt, 0.1);
  const n = Math.max(1, Math.ceil(d / STEP));
  for (let i = 0; i < n; i++) fn(d / n);
}

export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const DEG = 180 / Math.PI;
export const TAU = Math.PI * 2;
