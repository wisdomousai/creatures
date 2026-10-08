import type { Object3D } from 'three';
import { type Box, floorDepth, project } from './box';
import { DRAG, HOLD, holdSelection } from './press';
import {
  type Character,
  clamp,
  type Env,
  type Frame,
  loadModel,
  rand,
  type Role,
} from './character';
import type { Expression } from './face';
import type { LookName } from './looks';
import { Bubbles, floorAt, G, gripOf, handy, KINDS, Prop, type Spot } from './props';
import { inFamily } from './families';

/**
 * The crew at play: little scenes a director runs now and then with whoever is on the
 * floor, with toys and without.
 *
 * With toys: a dog fetches the bone someone throws for it, or leaps for a flying disc; a
 * cat bats a ball of cable across the floor (it unwinds behind the ball, and winds itself
 * back up after) or chases a spot of light (the mouse's, if it's on the floor); two kick
 * a ball back and forth; a few keep a balloon up; one builds a tower of blocks and another
 * knocks it down; one spins a top and they all watch it wobble and fall; they take turns
 * on a trampoline, ride a seesaw, drum while the others dance, and blow bubbles for the
 * others (and the mouse) to pop; one sits (or naps) on a cushion; one hides behind a crate
 * and another comes looking; one creeps under a table. Without: tag, a high five (or a
 * nose boop), a dance, a parade round the box, a nap in a heap.
 *
 * The props come up through holes in the floor for the scene and go back down after.
 *
 * A scene is a short script (async, a step at a time, each step waiting for something to
 * happen: someone to get where they were sent, a ball to stop). Its cast take direction
 * for the while (Character.direct): they stay, drop their own acts, and walk, look, pose
 * and feel as the scene says. If one of them goes, or a step takes too long, the scene
 * is cut short; either way everyone gets back to their own life and the props go.
 */

const DOGS = inFamily('dog');
const CATS = inFamily('cat');
/** Acts that are some kind of rest, for one on a cushion or under a table. */
const RESTS = ['nap', 'sleep', 'doze', 'dozeOff', 'snooze', 'rest', 'sit', 'loaf', 'float'];

/** The games each page's room is for (the Creatures page's playgrounds); the rest have
 * any of them, now and then. */
export const GAMES: Record<string, string[]> = {
  creatures: ['trampoline', 'seesaw', 'tag', 'parade', 'dance', 'highfive'],
  'creatures/cats': ['yarn', 'spot', 'crate', 'table', 'nap', 'cushion'],
  'creatures/dogs': ['frisbee', 'ball', 'tag', 'seesaw', 'cushion', 'fetch'],
  'creatures/birds': ['parade', 'bubbles', 'balloon', 'drum', 'dance'],
};

/** A scene ends early (someone left, or a step took too long). */
class Cut extends Error {}

interface Wait {
  test: () => boolean;
  resolve: () => void;
  reject: (e: Error) => void;
  until: number;
  /** Resolves (rather than cuts the scene) when time runs out. */
  soft: boolean;
}

interface Scene {
  /** Who plays: found among those on the floor, or null if nobody fits. */
  cast: (p: Play) => Character[] | null;
  /** Who to call in for it, if they aren't here (the lab's buttons). */
  wants: string[];
  run: (p: Play, cast: Character[]) => Promise<void>;
  weight: number;
}

export class Play {
  readonly props: Prop[] = [];
  private scene: { name: string; cast: Character[] } | null = null;
  private waits: Wait[] = [];
  time = 0;
  private next = 12 + Math.random() * 16;
  private look: LookName = 'ink';
  private env: Env | null = null;
  private hits = new Map<Prop, HTMLElement>();
  private last = { x: 0, y: 0 };
  private froth: Bubbles | null = null;
  /** The games the room is for (a playground's): they come up more, and sooner. */
  private games: string[] = [];
  private hushed = false;

  constructor(
    private stage: Object3D,
    private box: Box,
    private models: string,
    private hitLayer: HTMLElement | null,
    /** Bring someone on (by name), for a scene that needs them. */
    private call: (name: string) => Promise<Character | null>,
  ) {}

  get frame(): Frame {
    return this.env!.frame;
  }

  get pointer() {
    return this.env!.pointer;
  }

  get playing() {
    return this.scene?.name ?? null;
  }

  get scenes() {
    return Object.keys(SCENES);
  }

  /** Soap bubbles, for the wand. */
  get bubbles() {
    return (this.froth ??= new Bubbles(this.stage, this.look));
  }

  dress(look: LookName) {
    this.look = look;
    this.props.forEach((p) => p.dress(look));
    this.froth?.dress(look);
  }

  /** Start a scene now (by name, or any that fits), calling in its cast if need be. */
  /** The games this room is for (none: any, now and then). */
  favour(games: string[]) {
    this.games = games.filter((n) => SCENES[n]);
    if (this.games.length) this.next = Math.min(this.next, this.gap(6, 10));
  }

  /** Seconds till the next game, from..from+more, sooner in a playground. */
  private gap(from: number, more: number) {
    return (from + Math.random() * more) * (this.games.length ? 0.4 : 1);
  }

  async start(name?: string) {
    if (this.scene || !this.env) return false;
    const names = name ? [name] : Object.keys(SCENES).filter((n) => SCENES[n].cast(this));
    name = pick(names, (n) => SCENES[n].weight * (this.games.includes(n) ? 6 : 1));
    if (!name) return false;
    const scene = SCENES[name];
    let cast = scene.cast(this);
    for (let tries = 0; !cast && tries < scene.wants.length; tries++) {
      const member = await this.call(scene.wants[tries]);
      if (member) await this.settle(() => member.state === 'here', 12);
      cast = scene.cast(this);
    }
    if (!cast || this.scene) return false;
    this.scene = { name, cast };
    try {
      await scene.run(this, cast);
    } catch (e) {
      if (!(e instanceof Cut)) console.error(e);
    } finally {
      for (const c of cast) c.release();
      for (const p of this.props) if (p.want > 0) p.leave(this.box);
      this.froth?.clear();
      if (this.froth) this.froth.onPop = null;
      this.scene = null;
      this.next = this.gap(25, 35);
    }
    return true;
  }

  /** No games start by themselves (the library, where the crew keep still), and one on
   * now is cut short; one asked for by name still can. */
  set quiet(on: boolean) {
    this.hushed = on;
    if (on) this.cut();
  }

  /** Stop the scene where it is. */
  cut() {
    for (const w of this.waits) w.reject(new Cut());
    this.waits = [];
  }

  // ---------- Each frame ----------

  update(dt: number, env: Env) {
    this.env = env;
    this.time += dt;
    const f = env.frame;
    for (const p of this.props) p.update(dt, f, this.props);
    this.froth?.update(dt, env);
    this.bump(dt, env);
    // The scene's steps: on to the next when what it waits for has happened.
    const lost = this.scene?.cast.some((c) => c.state !== 'here');
    const waits = this.waits;
    this.waits = [];
    for (const w of waits) {
      if (lost) w.reject(new Cut());
      else if (w.test()) w.resolve();
      else if (this.time > w.until) w.soft ? w.resolve() : w.reject(new Cut());
      else this.waits.push(w);
    }
    // Props that have gone back down are done with.
    for (let i = this.props.length - 1; i >= 0; i--) {
      const p = this.props[i];
      if (!p.gone) continue;
      this.hits.get(p)?.remove();
      this.hits.delete(p);
      p.dispose();
      this.props.splice(i, 1);
    }
    for (const [p, el] of this.hits) {
      const b = p.bounds(f);
      el.style.display = p.rise > 0.9 ? 'block' : 'none';
      el.style.transform = `translate(${b.x}px, ${b.y}px)`;
      el.style.width = `${b.w}px`;
      el.style.height = `${b.h}px`;
    }
    if (!this.scene && !this.hushed) {
      this.next -= dt;
      if (this.next <= 0) {
        this.next = this.gap(20, 25);
        void this.start();
      }
    }
  }

  /** Toys are kicked along by whoever walks into them, and by the mouse brushing past. */
  private bump(dt: number, env: Env) {
    const f = env.frame;
    const deep = floorDepth(f);
    const { x, y } = env.pointer;
    const moving = env.pointer.present && env.time - env.pointer.at < 0.1 && dt > 0;
    const [mvx, mvy] = moving ? [(x - this.last.x) / dt, (y - this.last.y) / dt] : [0, 0];
    this.last = { x, y };
    for (const p of this.props) {
      const moves = p.kind.moves;
      if (moves === 'still' || moves === 'spot' || p.heldBy || p.taken || p.rise < 1) continue;
      if (moving) {
        const b = p.bounds(f);
        if (x > b.x && x < b.x + b.w && y > b.y - b.h && y < b.y + b.h) {
          p.push(clamp(mvx, -1500, 1500) * dt * 4, clamp(-mvy, -800, 800) * dt * 2);
          // A balloon, brushed, goes up.
          if (moves === 'float') {
            p.vh = Math.max(p.vh, f.bot * 3);
            p.glow = 1;
          }
        }
      }
      if (p.h > 2) continue;
      for (const c of env.crew) {
        if (c.role || c.free || c.edge !== 'bottom' || c.stride < 1) continue;
        const a = c.footprint(f);
        const r = p.footprint(f);
        const dx = (p.s - c.s) / (a.x + r.x);
        const dz = ((p.depth - c.depth) * deep) / (a.z + r.z);
        if (Math.hypot(dx, dz) > 1) continue;
        const v = c.velocity;
        p.push((v.x * 1.3 - p.vs) * 0.5, (v.z * 1.3 - p.vz) * 0.5);
      }
    }
  }

  // ---------- For the scenes ----------

  /** Those on the floor with nothing else to do. */
  floor(): Character[] {
    return (this.env?.crew ?? []).filter(
      (c) => c.state === 'here' && !c.free && c.edge === 'bottom' && !c.role && !c.door,
    );
  }

  /** Wait until test() holds; the scene is cut if it takes more than `seconds`. */
  until(test: () => boolean, seconds = 12) {
    return new Promise<void>((resolve, reject) =>
      this.waits.push({ test, resolve, reject, until: this.time + seconds, soft: false }),
    );
  }

  /** Wait until test() holds, or `seconds` have gone by, whichever is first. */
  settle(test: () => boolean, seconds: number) {
    return new Promise<void>((resolve, reject) =>
      this.waits.push({ test, resolve, reject, until: this.time + seconds, soft: true }),
    );
  }

  wait(seconds: number) {
    return this.settle(() => false, seconds);
  }

  /** Put a prop out: up through the floor near someone (or wherever there's room), or at `at`
   * if it's asked for there. */
  async bring(name: string, near: Character | null, cast: Character[] = [], at?: { s: number; depth?: number }) {
    const f = this.frame;
    const model = await loadModel(`${this.models}prop-${name}.glb`);
    const prop = new Prop(name, model);
    prop.dress(this.look);
    const spot = at ? { s: at.s, depth: at.depth ?? 0.4 } : this.spot(prop, near, cast);
    if (!spot) {
      prop.dispose();
      throw new Cut();
    }
    prop.addTo(this.stage);
    prop.arrive(f, spot.s, spot.depth, this.box);
    this.props.push(prop);
    this.hitArea(prop);
    await this.until(() => prop.rise === 1, 6);
    return prop;
  }

  /** A clear place on the floor for a prop: beside `near` if there's room. */
  private spot(prop: Prop, near: Character | null, cast: Character[]) {
    const f = this.frame;
    const deep = floorDepth(f);
    const mine = prop.footprint(f);
    const clear = (s: number, depth: number) => {
      if (s - mine.x < f.left + f.bot * 0.6 || s + mine.x > f.right - f.bot * 0.6) return false;
      // The crew on the floor, the other props, and the set pieces at the back.
      const others = [
        ...(this.env?.crew ?? []).filter((c) => !c.free && c.edge === 'bottom'),
        ...new Set([...this.props, ...(this.env?.props ?? [])]),
      ];
      return others.every((o) => {
        const r = o.footprint(f);
        const p = o.floorPoint(f);
        const room = cast.includes(o as Character) ? 0.1 : 0.3;
        const dx = (p.x - s) / (r.x + mine.x + f.bot * room);
        const dz = (p.z - depth * deep) / (r.z + mine.z + f.bot * room * 0.6);
        return Math.hypot(dx, dz) > 1;
      });
    };
    const lo = Math.min(0.9, mine.z / deep + 0.12);
    // Beside `near`, or else in the middle of the cast, so no one has far to go.
    const mid = cast.length
      ? {
          s: cast.reduce((t, c) => t + c.s, 0) / cast.length,
          depth: cast.reduce((t, c) => t + c.depth, 0) / cast.length,
          x: 0,
        }
      : null;
    const by = near ? { s: near.s, depth: near.depth, x: near.footprint(f).x } : mid;
    for (let attempt = 0; attempt < 60; attempt++) {
      let s: number;
      let depth: number;
      if (by && attempt < 40) {
        const side = Math.random() < 0.5 ? -1 : 1;
        const gap = by.x + mine.x + f.bot * (0.4 + (attempt / 40) * 2);
        s = by.s + side * gap;
        depth = by.depth + (Math.random() - 0.5) * 0.3;
      } else {
        s = f.left + (f.right - f.left) * (0.1 + Math.random() * 0.8);
        depth = lo + Math.random() * (0.6 - lo);
      }
      // Out on the open floor, in front of the set pieces along the back wall.
      depth = clamp(depth, lo, Math.max(lo, 0.6));
      if (clear(s, depth)) return { s, depth };
    }
    return null;
  }

  /** Send a prop away (back down through the floor). */
  send(prop: Prop) {
    prop.leave(this.box);
  }

  /** Walk to (s, depth) and wait till there. */
  async walk(c: Character, s: number, depth: number, seconds = 12) {
    c.walkTo(s, depth);
    await this.until(() => c.there, this.allow(c, s, depth, seconds));
  }

  /** Seconds enough for c to get to (s, depth) however far it is, at its own pace (slow ones take a while). */
  allow(c: Character, s: number, depth: number, seconds = 12) {
    const pace = (c.spec.speed ?? 1) * this.frame.bot * (c.role?.hurry ?? 1);
    return Math.max(seconds, 3 + (this.apart(c, s, depth) / pace) * 1.5);
  }

  /** Pose by a function of the seconds since this pose began. */
  pose(role: Role, fn: ((t: number) => void) | null) {
    let t = 0;
    role.pose = fn ? (_, dt) => fn((t += dt)) : undefined;
  }

  /** A face for a moment, then back to what it was. */
  async flash(role: Role, face: Expression, seconds = 0.8) {
    const was = role.face;
    role.face = face;
    await this.wait(seconds);
    if (role.face === face) role.face = was;
  }

  /** How far apart two are on the floor, px. */
  apart(c: Character, s: number, depth: number) {
    return Math.hypot(s - c.s, (depth - c.depth) * floorDepth(this.frame));
  }

  /** Run after a toy until it can be picked up (or batted), mouth (or paw) first. */
  async chase(c: Character, prop: Prop, role: Role, seconds = 12) {
    const f = this.frame;
    const reach = c.footprint(f).x * 0.85;
    await this.until(() => {
      const side = Math.sign(c.s - prop.s) || 1;
      const s = prop.s + side * reach;
      c.walkTo(s, prop.depth);
      role.facing = -side * 60;
      return (
        prop.h < f.bot * 0.2 &&
        prop.stride < f.bot * 1.5 &&
        this.apart(c, s, prop.depth) < f.bot * 0.3
      );
    }, seconds);
  }

  /** Stoop, take it (in the mouth, or a hand), straighten up. */
  async pickUp(c: Character, role: Role, prop: Prop) {
    this.pose(role, (t) => stoop(c, Math.min(1, t / 0.3)));
    await this.wait(0.32);
    prop.take(c);
    this.pose(role, (t) => stoop(c, Math.max(0, 1 - t / 0.35)));
    await this.wait(0.35);
    this.pose(role, null);
  }

  /** Stoop and put it down in front, with a little push `toward` (±1 along the floor). */
  async putDown(c: Character, role: Role, prop: Prop, toward: number) {
    const f = this.frame;
    this.pose(role, (t) => stoop(c, Math.min(1, t / 0.3)));
    await this.wait(0.3);
    prop.drop({ s: toward * f.bot * 1.5, z: 0, h: f.bot * 0.6 });
    this.pose(role, (t) => stoop(c, Math.max(0, 1 - t / 0.3)));
    await this.wait(0.3);
    this.pose(role, null);
  }

  /** Walk up beside a prop on the floor, facing it (and wait there a moment). */
  async reach(c: Character, role: Role, prop: Prop, seconds = 10) {
    const f = this.frame;
    const side = Math.sign(c.s - prop.s) || 1;
    await this.walk(
      c,
      prop.s + side * (c.footprint(f).x * 0.85 + prop.footprint(f).x * 0.4),
      prop.depth,
      seconds,
    );
    role.facing = -side * 55;
    await this.wait(0.35);
    return side;
  }

  /** Walk up to a prop on the floor and pick it up. */
  async fetch(c: Character, role: Role, prop: Prop) {
    await this.reach(c, role, prop);
    await this.pickUp(c, role, prop);
  }

  /** Wind up and throw what it holds to (s, depth), in an arc. */
  async throw(c: Character, role: Role, prop: Prop, s: number, depth: number) {
    const f = this.frame;
    this.pose(role, (t) => windUp(c, Math.min(1, t / 0.5), 0));
    await this.wait(0.55);
    prop.drop(undefined, prop.kind.moves === 'slide' ? 14 : 5);
    const T = 0.55 + Math.min(0.35, Math.abs(s - prop.s) / (f.bot * 20));
    prop.vs = (s - prop.s) / T;
    prop.vz = ((depth - prop.depth) * floorDepth(f)) / T;
    prop.vh = (G * f.bot * T) / 2 - prop.h / T;
    prop.glow = 1;
    this.pose(role, (t) => windUp(c, Math.max(0, 1 - t / 0.5), Math.min(1, t / 0.12)));
    await this.wait(0.5);
    this.pose(role, null);
  }

  /** Let go of what it holds so it lands at (s, depth), `h` up (on a tower), in `T` s. */
  toss(prop: Prop, s: number, depth: number, h = 0, T = 0.45) {
    const f = this.frame;
    prop.drop();
    // Thrown a little harder than the distance, for the air slowing it on the way.
    const k = prop.drag * T;
    const hard = k / (1 - Math.exp(-k));
    prop.vs = ((s - prop.s) / T) * hard;
    prop.vz = (((depth - prop.depth) * floorDepth(f)) / T) * hard;
    const g = prop.lift(f, Math.hypot(prop.vs, prop.vz) / Math.sqrt(hard));
    prop.vh = (h - prop.h) / T + (g * T) / 2;
  }

  /** Which way along the floor there's more room from c: ±1. */
  roomward(c: Character) {
    const f = this.frame;
    return c.s < (f.left + f.right) / 2 ? 1 : -1;
  }

  /** Somewhere along the floor `dir` of c, `lo` to `hi` --bot away, inside the frame. */
  away(c: Character, dir: number, lo: number, hi: number) {
    const f = this.frame;
    const margin = f.bot * 1.2;
    return clamp(c.s + dir * rand([lo, hi]) * f.bot, f.left + margin, f.right - margin);
  }

  /** Somewhere on the floor inside the frame, clear of its edges. */
  anywhere(margin = 1.5): Spot {
    const f = this.frame;
    const m = f.bot * margin;
    return {
      s: f.left + m + Math.random() * (f.right - f.left - 2 * m),
      depth: 0.2 + Math.random() * 0.6,
    };
  }

  /** Places for n in a row across the floor about s, `gap` --bot apart, inside the frame. */
  row(n: number, s: number, depth: number, gap: number) {
    const f = this.frame;
    const width = (n - 1) * gap * f.bot;
    const lo = f.left + f.bot * 1.2;
    const hi = f.right - f.bot * 1.2;
    const start = clamp(s - width / 2, lo, Math.max(lo, hi - width));
    return Array.from({ length: n }, (_, i) => ({ s: start + i * gap * f.bot, depth }));
  }

  private hitArea(p: Prop) {
    if (!this.hitLayer) return;
    const el = document.createElement('div');
    el.className = 'robot-hit robot-prop';
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText =
      'position:absolute;left:0;top:0;pointer-events:auto;cursor:pointer;display:none;';
    // Pressed on and held (or dragged): picked up and carried about, thrown when let go.
    let press: { id: number; x: number; y: number; timer: number } | null = null;
    let took = false;
    const takeUp = (id: number, at: { x: number; y: number }) => {
      if (press) clearTimeout(press.timer);
      press = null;
      const f = this.env?.frame;
      const moves = p.kind.moves;
      if (!f || p.taken || p.heldBy || p.users.size || p.rise < 1) return;
      if (moves === 'still' || moves === 'spot') return;
      const foot = project(f, p.depth, { x: p.s, y: f.bottom - p.h });
      p.taken = { x: at.x, y: at.y, dx: foot.x - at.x, dy: foot.y - at.y };
      took = true;
      try {
        el.setPointerCapture(id);
      } catch {
        // (Already let go.)
      }
      el.style.cursor = 'grabbing';
    };
    const putDown = () => {
      if (press) clearTimeout(press.timer);
      press = null;
      if (!p.taken) return;
      p.taken = null;
      el.style.cursor = 'pointer';
    };
    el.addEventListener('pointerdown', (e) => {
      took = false;
      if (e.button !== 0) return;
      holdSelection();
      const at = { x: e.clientX, y: e.clientY };
      const timer =
        e.pointerType === 'touch' ? 0 : window.setTimeout(() => takeUp(e.pointerId, at), HOLD);
      press = { id: e.pointerId, ...at, timer };
    });
    el.addEventListener('pointermove', (e) => {
      const at = { x: e.clientX, y: e.clientY };
      if (press?.id === e.pointerId && Math.hypot(at.x - press.x, at.y - press.y) > DRAG)
        takeUp(e.pointerId, { x: press.x, y: press.y });
      if (p.taken) {
        p.taken.x = at.x;
        p.taken.y = at.y;
      }
    });
    el.addEventListener('pointerup', putDown);
    el.addEventListener('pointercancel', putDown);
    el.addEventListener('lostpointercapture', putDown);
    el.addEventListener('click', () => {
      if (took) {
        took = false;
        return;
      }
      p.poke();
    });
    this.hitLayer.appendChild(el);
    this.hits.set(p, el);
  }

  dispose() {
    this.cut();
    for (const p of this.props) p.dispose();
    for (const el of this.hits.values()) el.remove();
    this.froth?.dispose();
  }
}

// ---------- Poses (whatever bones it has) ----------

/** Its arm, shoulder first, if it has one. */
function arm(c: Character, side: 'R' | 'L' = 'R'): string[] | null {
  const p = c.puppet;
  const chains = [['upper_arm.R', 'forearm.R'], ['arm.R', 'fore.R'], ['arm.R'], ['wing.R']];
  for (const chain of chains.map((ch) => ch.map((b) => b.replace('.R', `.${side}`))))
    if (chain.every((b) => p.has(b))) return chain;
  return null;
}

/** On four legs? */
const fours = (c: Character) => c.puppet.has('leg.FL');

/** Bends down to the floor, a: 0..1 (nose down on four legs, a reach down on two). */
function stoop(c: Character, a: number) {
  const p = c.puppet;
  const e = a * a * (3 - 2 * a);
  if (p.has('jaw')) p.add('jaw', 22 * Math.sin(Math.PI * e));
  if (fours(c)) {
    p.add('body', 12 * e);
    p.add('head', 40 * e);
    return;
  }
  if (p.has('body')) p.add('body', 20 * e);
  if (p.has('head')) p.add('head', 22 * e);
  const chain = arm(c);
  if (chain && !p.has('jaw')) {
    p.add(chain[0], -60 * e);
    if (chain[1]) p.add(chain[1], -25 * e);
  }
}

/** A throw: wound up (a), then flung (b), by an arm or with a toss of the head. */
function windUp(c: Character, a: number, b: number) {
  const p = c.puppet;
  const chain = arm(c);
  if (chain && !p.has('jaw')) {
    p.add(chain[0], 70 * a - 130 * b * (1 - a));
    if (chain[1]) p.add(chain[1], -30 * a);
    if (p.has('body')) p.add('body', -8 * a + 12 * b);
  } else {
    if (p.has('head')) p.add('head', 30 * a - 45 * b * (1 - a));
    if (p.has('body')) p.add('body', 10 * a - 10 * b);
  }
}

/** A kick (or a nudge of the nose, or a bump), k: 0..1 through it. */
function kick(c: Character, k: number) {
  const p = c.puppet;
  const swing = Math.sin(Math.PI * k);
  for (const leg of ['thigh.R', 'leg.R', 'leg.FR', 'foot.R'])
    if (p.has(leg)) {
      p.add(leg, -55 * swing);
      if (p.has('body')) p.add('body', -6 * swing);
      return;
    }
  if (p.has('head')) p.add('head', 25 * swing);
  if (p.has('body')) p.add('body', 12 * swing);
}

/** A cat's paw swipe, k: 0..1 through it. */
function swipe(c: Character, k: number) {
  const p = c.puppet;
  const swing = Math.sin(Math.PI * Math.min(1, k));
  if (p.has('leg.FL')) p.add('leg.FL', -75 * swing, 0, 20 * swing);
  if (p.has('body')) p.add('body', 6 * swing);
  if (p.has('head')) p.add('head', 15 * swing);
}

/** A cat about to pounce: front down, rump up and wiggling. */
function wiggle(c: Character, t: number) {
  const p = c.puppet;
  const a = Math.min(1, t / 0.4);
  if (p.has('body')) p.add('body', 14 * a, 0, 6 * a * Math.sin(t * 18));
  for (const leg of ['leg.FL', 'leg.FR']) if (p.has(leg)) p.add(leg, -45 * a);
  if (p.has('head')) p.add('head', -24 * a);
}

/** Arms up (or a wag of the whole body): hooray. */
function cheer(c: Character, t: number) {
  const p = c.puppet;
  const chain = arm(c);
  const a = Math.min(1, t / 0.25);
  if (chain && !fours(c)) {
    p.add(chain[0], -150 * a, 0, 0);
    const left = arm(c, 'L');
    if (left) p.add(left[0], -150 * a);
  } else if (p.has('body')) p.add('body', 0, 12 * Math.sin(t * 12) * a, 0);
}

/** One arm up (a bop, a high five), a: 0..1; without arms, the head goes up. */
function reachUp(c: Character, a: number, side: 'R' | 'L' = 'R') {
  const p = c.puppet;
  const chain = arm(c, side);
  if (chain && !fours(c)) {
    p.add(chain[0], -155 * a, 0, (side === 'R' ? -1 : 1) * 10 * a);
    if (chain[1]) p.add(chain[1], -15 * a);
  } else if (p.has('head')) p.add('head', -35 * a);
  if (fours(c) && p.has('body')) p.add('body', -14 * a);
}

/** A beat on a drum, k: 0..1 from one beat to the next: the hand (or the head) comes down on it. */
function tap(c: Character, k: number) {
  const p = c.puppet;
  const up = Math.sin(Math.PI * k);
  const chain = arm(c);
  if (chain && !fours(c)) {
    p.add(chain[0], -55 - 45 * up);
    if (chain[1]) p.add(chain[1], -25 * up);
    const left = arm(c, 'L');
    const other = Math.sin(Math.PI * ((k + 0.5) % 1));
    if (left) p.add(left[0], -55 - 45 * other);
  } else {
    if (p.has('head')) p.add('head', 22 * (1 - up) - 8);
    if (fours(c)) p.add('leg.FR', -40 * up);
  }
}

/** Dancing to the beat, k: 0..1 from one beat to the next (a sway, a bob, a nod). */
function bob(c: Character, k: number, beats: number, seed: number) {
  const p = c.puppet;
  const sway = Math.sin(Math.PI * (beats % 2 === 0 ? k : 1 + k));
  const dip = Math.sin(Math.PI * k);
  if (p.has('body')) p.add('body', -6 * dip, 10 * sway * (seed > 0.5 ? 1 : -1), 12 * sway);
  if (p.has('head')) p.add('head', 10 * dip, 0, -8 * sway);
  const chain = arm(c);
  const left = arm(c, 'L');
  if (chain && !fours(c)) {
    p.add(chain[0], -60 - 50 * dip * (beats % 2), 0, -20 * sway);
    if (left) p.add(left[0], -60 - 50 * dip * ((beats + 1) % 2), 0, -20 * sway);
  }
}

/** Waving a bubble wand about, t seconds in. */
function wave(c: Character, t: number) {
  const p = c.puppet;
  const chain = arm(c);
  if (!chain) return;
  p.add(chain[0], -105 + 25 * Math.sin(t * 5), 30 * Math.sin(t * 2.2), 0);
  if (chain[1]) p.add(chain[1], -15 + 15 * Math.sin(t * 5 + 1));
}

/** Setting a top going: a quick twist of the arm (or a swipe of the paw), k: 0..1. */
function twist(c: Character, k: number) {
  const p = c.puppet;
  const chain = arm(c);
  if (chain && !fours(c)) {
    p.add(chain[0], -70, 80 * (1 - 2 * Math.min(1, k)), 0);
    if (p.has('body')) p.add('body', 10, -15 * (1 - 2 * Math.min(1, k)), 0);
  } else swipe(c, k);
}

/** A bow to finish: a: 0..1. */
function bow(c: Character, a: number) {
  const p = c.puppet;
  if (p.has('body')) p.add('body', 25 * a);
  if (p.has('head')) p.add('head', 20 * a);
}

// ---------- The scenes ----------

const kindOf = (c: Character) => c.spec.model;
const isDog = (c: Character) => DOGS.includes(kindOf(c));
const isCat = (c: Character) => CATS.includes(kindOf(c));
/** A pet (moods, postures: pet.ts). */
const isPet = (c: Character) => 'mood' in c;
/** Quick enough on its feet for chasing games. */
const quick = (c: Character) => (c.spec.speed ?? 1) > 0.45;

/** A creature that could fit behind (or under) something `px` high. */
function fits(c: Character, px: number) {
  return c.heightPx <= px;
}

/** Up to n of them, at random. */
function some<T>(list: T[], n: number) {
  return [...list].sort(() => Math.random() - 0.5).slice(0, n);
}

/** Dance: its own dance if it has one, else a bob to the beat (0.5 s). */
function dance(p: Play, c: Character, role: Role) {
  const seed = Math.random();
  if (c.repertoire.includes('dance') && Math.random() < 0.7) c.perform('dance');
  else
    p.pose(role, () => {
      const beats = p.time / 0.5;
      bob(c, beats % 1, Math.floor(beats), seed);
    });
}

const SCENES: Record<string, Scene> = {
  // Someone throws the bone; the dog runs after it and brings it back. Again!
  fetch: {
    weight: 3,
    wants: ['dog', 'bolt'],
    cast: (p) => {
      const floor = p.floor();
      const dog = floor.find(isDog);
      const thrower = floor.find((c) => c !== dog && !isDog(c) && gripOf(c));
      return dog && thrower ? [dog, thrower] : null;
    },
    run: async (p, [dog, thrower]) => {
      const f = p.frame;
      const bone = await p.bring('bone', thrower, [dog, thrower]);
      const watch = () => bone.screen(f);
      const tr: Role = { face: 'happy', look: watch };
      const dr: Role = { mood: 'curious', look: watch };
      thrower.direct(tr);
      dog.direct(dr);
      await p.fetch(thrower, tr, bone);
      const dir = p.roomward(thrower);
      dr.mood = 'happy';
      await p.walk(
        dog,
        thrower.s - dir * (thrower.footprint(f).x + dog.footprint(f).x + f.bot * 0.5),
        thrower.depth,
      );
      const rounds = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < rounds; i++) {
        tr.facing = dir * 55;
        dr.facing = dir * 55;
        await p.wait(0.4);
        await p.throw(thrower, tr, bone, p.away(thrower, dir, 3, 6), 0.2 + Math.random() * 0.6);
        dr.hurry = 2;
        await p.chase(dog, bone, dr, 14);
        await p.pickUp(dog, dr, bone);
        dr.hurry = 1.4;
        dr.face = 'happy';
        await p.walk(
          dog,
          thrower.s + dir * (thrower.footprint(f).x + dog.footprint(f).x * 1.2),
          thrower.depth,
          14,
        );
        dr.hurry = 1;
        dr.facing = -dir * 55;
        await p.wait(0.2);
        await p.putDown(dog, dr, bone, -dir);
        dr.face = undefined;
        dr.posture = 'sit';
        dr.mood = 'love';
        tr.face = 'love';
        thrower.hopUp(0.15);
        await p.wait(1.2);
        dr.posture = undefined;
        dr.mood = 'happy';
        tr.face = 'happy';
        if (i < rounds - 1) await p.fetch(thrower, tr, bone);
      }
      dr.posture = 'lie';
      await p.wait(2);
    },
  },

  // A flying disc: thrown flat and far; the dog runs under it and leaps to catch it.
  frisbee: {
    weight: 2.5,
    wants: ['dog', 'nova'],
    cast: (p) => {
      const floor = p.floor();
      const dog = floor.find(isDog) ?? floor.find((c) => isPet(c) && quick(c));
      const thrower = floor.find((c) => c !== dog && handy(c));
      return dog && thrower ? [dog, thrower] : null;
    },
    run: async (p, [dog, thrower]) => {
      const f = p.frame;
      const disc = await p.bring('frisbee', thrower, [dog, thrower]);
      const watch = () => disc.screen(f);
      const tr: Role = { face: 'happy', look: watch };
      const dr: Role = { mood: 'curious', look: watch };
      thrower.direct(tr);
      dog.direct(dr);
      await p.fetch(thrower, tr, disc);
      const rounds = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < rounds; i++) {
        // Go long! The dog runs out and turns, waiting for it.
        const dir = p.roomward(thrower);
        const out = p.away(thrower, dir, 8, 13);
        const depth = clamp(thrower.depth + (Math.random() - 0.5) * 0.3, 0.2, 0.8);
        dr.hurry = 2;
        dr.mood = 'happy';
        await p.walk(dog, out, depth, 12);
        dr.hurry = 1;
        dr.facing = -dir * 55;
        tr.facing = dir * 55;
        await p.wait(0.4);
        // A flat throw, spinning, to the dog: it glides and comes down to meet it.
        p.pose(tr, (t) => windUp(thrower, Math.min(1, t / 0.45), 0));
        await p.wait(0.5);
        const to = dog.s - dir * dog.footprint(f).x * 0.5;
        const T = clamp(Math.abs(to - disc.s) / (f.bot * 8), 0.8, 1.6);
        p.toss(disc, to, dog.depth, dog.heightPx * 0.8, T);
        disc.glow = 1;
        p.pose(tr, (t) => windUp(thrower, Math.max(0, 1 - t / 0.4), Math.min(1, t / 0.1)));
        // To meet it, and a leap as it comes in reach.
        dr.hurry = 2.2;
        let leapt = -1;
        let caught = false;
        await p.until(() => {
          const lead = disc.s + disc.vs * 0.25;
          const side = Math.sign(dog.s - lead) || -dir;
          if (leapt < 0 || caught) dog.walkTo(lead + side * dog.footprint(f).x * 0.6, disc.depth);
          dr.facing = -side * 60;
          const near = p.apart(dog, disc.s, disc.depth) < dog.footprint(f).x * 1.7;
          const low = disc.h < dog.heightPx * 1.6 && disc.h > dog.heightPx * 0.15;
          if (leapt < 0 && near && low) {
            leapt = p.time;
            dog.hopUp(0.55);
            dr.face = 'focused';
          }
          if (leapt > 0 && !caught && p.time - leapt > 0.12 && disc.h > f.bot * 0.1) {
            caught = disc.take(dog);
          }
          return caught || disc.resting;
        }, 14);
        p.pose(tr, null);
        dr.hurry = 1.8;
        dr.face = undefined;
        if (caught) {
          dr.mood = 'love';
          tr.face = 'surprised';
          await p.wait(0.6);
          tr.face = 'happy';
          thrower.hopUp(0.2);
        } else {
          await p.chase(dog, disc, dr, 12);
          await p.pickUp(dog, dr, disc);
        }
        // Back with it, and down at the thrower's feet.
        const back = Math.sign(dog.s - thrower.s) || 1;
        await p.walk(
          dog,
          thrower.s + back * (thrower.footprint(f).x + dog.footprint(f).x * 1.2),
          thrower.depth,
          14,
        );
        dr.hurry = 1;
        dr.facing = -back * 55;
        await p.putDown(dog, dr, disc, -back);
        dr.mood = 'happy';
        if (i < rounds - 1) await p.fetch(thrower, tr, disc);
      }
      dr.posture = 'sit';
      dr.mood = 'love';
      tr.face = 'love';
      await p.wait(1.5);
    },
  },

  // A cat and a ball of cable: the wiggle, the pounce, the bat, the chase, again. The
  // cable unwinds across the floor behind the ball, and winds back up in the end.
  yarn: {
    weight: 3,
    wants: ['cat'],
    cast: (p) => {
      const cat = p.floor().find(isCat);
      return cat ? [cat] : null;
    },
    run: async (p, [cat]) => {
      const f = p.frame;
      const yarn = await p.bring('yarn', cat, [cat]);
      const role: Role = { mood: 'curious', look: () => yarn.screen(f) };
      cat.direct(role);
      role.facing = Math.sign(yarn.s - cat.s) * 60;
      await p.wait(0.8);
      p.pose(role, (t) => wiggle(cat, t));
      await p.wait(1.3);
      p.pose(role, null);
      const bats = 4 + Math.floor(Math.random() * 3);
      for (let i = 0; i < bats; i++) {
        role.hurry = 2.3;
        role.mood = 'happy';
        await p.chase(cat, yarn, role, 12);
        role.hurry = 1;
        p.pose(role, (t) => swipe(cat, t / 0.3));
        await p.wait(0.14);
        // Off it goes, mostly away from her (now and then back the way it came, winding
        // up), and she watches it go.
        const back = i > 1 && Math.random() < 0.3;
        const way = (Math.sign(yarn.s - cat.s) || p.roomward(cat)) * (back ? -1 : 1);
        yarn.vs = way * f.bot * (3.5 + Math.random() * 3);
        yarn.vz = (Math.random() - 0.5) * f.bot * 4;
        yarn.vh = f.bot * (1 + Math.random() * 2);
        yarn.glow = 1;
        await p.wait(0.3);
        p.pose(role, null);
        role.mood = 'curious';
        await p.settle(() => yarn.resting, 1 + Math.random());
      }
      role.hurry = 1.5;
      await p.chase(cat, yarn, role, 12);
      role.hurry = 1;
      role.posture = 'lie';
      role.mood = 'love';
      await p.wait(2.5);
      // The ball winds its cable back in, rolling home along it; she watches it go.
      yarn.reel();
      role.mood = 'curious';
      await p.settle(() => !yarn.reeling, 12);
      role.posture = undefined;
      role.mood = 'happy';
      cat.hopUp(0.15);
      await p.wait(1);
    },
  },

  // A spot of light darts about the floor; the cats chase it and pounce. If the mouse is
  // on the floor, the spot is where the mouse is.
  spot: {
    weight: 2.5,
    wants: ['cat', 'kitten'],
    cast: (p) => {
      const floor = p.floor();
      const cats = floor.filter(isCat);
      const more = floor.filter((c) => !isCat(c) && isPet(c) && quick(c));
      const cast = some(cats, 2);
      if (!cast.length) return null;
      if (cast.length < 2 && more.length) cast.push(more[0]);
      return cast;
    },
    run: async (p, cast) => {
      const f = p.frame;
      const dot = await p.bring('spot', cast[0], cast);
      const roles = cast.map((c) => {
        const r: Role = { mood: 'curious', look: () => dot.screen(f) };
        c.direct(r);
        return r;
      });
      await p.wait(0.8);
      let move = 0;
      let still = false;
      const pounces = new Map<Character, number>();
      let caught = 0;
      const end = p.time + rand([14, 20]);
      await p.settle(() => {
        // The mouse, on the floor, is the light; else it darts about by itself.
        const ptr = p.pointer;
        const at = ptr.present && p.time - ptr.at < 3 ? floorAt(f, ptr.x, ptr.y) : null;
        if (at) dot.aim = at;
        else if (p.time > move) {
          still = Math.random() < 0.3;
          const s = clamp(
            dot.s + (Math.random() - 0.5) * f.bot * 9,
            f.left + f.bot,
            f.right - f.bot,
          );
          dot.aim = still
            ? { s: dot.s, depth: dot.depth }
            : { s, depth: 0.15 + Math.random() * 0.75 };
          move = p.time + (still ? rand([0.8, 1.6]) : rand([0.4, 1.1]));
        }
        cast.forEach((c, i) => {
          const r = roles[i];
          const since = p.time - (pounces.get(c) ?? -9);
          if (since < 0.9) return;
          r.hurry = 2.2;
          r.mood = 'happy';
          const side = Math.sign(c.s - dot.s) || 1;
          c.walkTo(dot.s + side * c.footprint(f).x * 0.9, dot.depth);
          r.facing = -side * 60;
          // Close enough: the wiggle, and the pounce.
          if (p.apart(c, dot.s, dot.depth) < c.footprint(f).x * 1.6 && dot.stride < f.bot * 3) {
            pounces.set(c, p.time);
            p.pose(r, (t) => {
              if (t < 0.45) wiggle(c, t);
              else stoop(c, Math.max(0, 1 - (t - 0.45) / 0.4));
            });
            setTimeout(() => {
              if (!c.role) return;
              c.hopUp(0.3);
              // Under the paws? Now and then (or when it sat still) it's caught, for a moment.
              if (
                p.apart(c, dot.s, dot.depth) < c.footprint(f).x * 1.4 &&
                (still || Math.random() < 0.3)
              ) {
                caught++;
                r.mood = 'love';
                dot.glow = 0;
                dot.aim = null;
                move = p.time + 1.2;
              } else if (!at) {
                // Gone! Off to one side.
                dot.aim = {
                  s: clamp(dot.s - side * f.bot * rand([3, 6]), f.left + f.bot, f.right - f.bot),
                  depth: 0.15 + Math.random() * 0.75,
                };
                move = p.time + 0.9;
              }
            }, 450);
          }
        });
        return p.time > end;
      }, 30);
      // The light goes out; where did it go?
      p.send(dot);
      for (const [i, r] of roles.entries()) {
        p.pose(r, null);
        r.hurry = 1;
        r.face = 'surprised';
        r.look = undefined;
        cast[i].walkTo(cast[i].s);
      }
      await p.wait(1.2);
      for (const r of roles) {
        r.face = undefined;
        r.mood = caught ? 'love' : 'happy';
        r.posture = 'sit';
      }
      await p.wait(1.5);
    },
  },

  // Two of them kick a ball back and forth.
  ball: {
    weight: 2,
    wants: ['bolt', 'dog'],
    cast: (p) => {
      const floor = p.floor().filter(quick);
      return floor.length >= 2 ? floor.slice(0, 2) : null;
    },
    run: async (p, [a, b]) => {
      const f = p.frame;
      const deep = floorDepth(f);
      const dir = Math.sign(b.s - a.s) || 1;
      const mid = (a.s + b.s) / 2;
      const gap = f.bot * 2.2 + a.footprint(f).x + b.footprint(f).x;
      const depth = clamp((a.depth + b.depth) / 2, 0.3, 0.6);
      const ra: Role = { face: 'happy' };
      const rb: Role = { face: 'happy' };
      a.direct(ra);
      b.direct(rb);
      const sa = clamp(mid - (dir * gap) / 2, f.left + f.bot * 1.5, f.right - f.bot * 1.5);
      const sb = clamp(mid + (dir * gap) / 2, f.left + f.bot * 1.5, f.right - f.bot * 1.5);
      await Promise.all([p.walk(a, sa, depth), p.walk(b, sb, depth)]);
      const ball = await p.bring('ball', null, [a, b]);
      ra.look = rb.look = () => ball.screen(f);
      const roles = new Map([
        [a, ra],
        [b, rb],
      ]);
      let [kicker, catcher] = ball.s - a.s < b.s - ball.s ? [a, b] : [b, a];
      const passes = 4 + Math.floor(Math.random() * 3);
      for (let i = 0; i < passes; i++) {
        const kr = roles.get(kicker)!;
        const cr = roles.get(catcher)!;
        const to = Math.sign(catcher.s - kicker.s) || 1;
        cr.facing = -to * 60;
        // Round behind the ball, and kick it to the other.
        await p.walk(
          kicker,
          ball.s - to * (kicker.footprint(f).x + ball.footprint(f).x),
          ball.depth,
          10,
        );
        kr.facing = to * 60;
        await p.wait(0.2);
        p.pose(kr, (t) => kick(kicker, Math.min(1, t / 0.35)));
        await p.wait(0.15);
        const dist = Math.abs(catcher.s - ball.s) - catcher.footprint(f).x;
        ball.vs = to * (dist * 0.7 + f.bot * 1.2);
        ball.vz = (catcher.depth - ball.depth) * deep * 0.7;
        ball.vh = f.bot * 1.5;
        ball.glow = 1;
        await p.wait(0.25);
        p.pose(kr, null);
        await p.settle(
          () => p.apart(catcher, ball.s, ball.depth) < catcher.footprint(f).x * 1.8 || ball.resting,
          5,
        );
        // Trapped.
        ball.vs *= 0.15;
        ball.vz *= 0.15;
        [kicker, catcher] = [catcher, kicker];
      }
      ra.look = rb.look = undefined;
      ra.facing = rb.facing = 0;
      p.pose(ra, (t) => cheer(a, t));
      p.pose(rb, (t) => cheer(b, t));
      a.hopUp(0.2);
      b.hopUp(0.2);
      await p.wait(1.5);
    },
  },

  // Keep the balloon up: whoever's nearest goes under it and bops it back up.
  balloon: {
    weight: 3,
    wants: ['bolt', 'puppy', 'nova'],
    cast: (p) => {
      const floor = p.floor().filter(quick);
      return floor.length >= 2 ? some(floor, 3) : null;
    },
    run: async (p, cast) => {
      const f = p.frame;
      const balloon = await p.bring('balloon', cast[0], cast);
      const roles = cast.map((c) => {
        const r: Role = { face: 'happy', look: () => balloon.screen(f) };
        c.direct(r);
        return r;
      });
      // Each has a place to stand, spread out, and goes back to it between bops.
      const order = [...cast].sort((a, b) => a.s - b.s);
      const posts = new Map(
        p.row(cast.length, balloon.s, 0.35, 2.8).map((spot, i) => [order[i], spot]),
      );
      // Everyone to their places first; the balloon waits on the floor.
      await Promise.all(
        cast.map((c) => {
          const post = posts.get(c)!;
          return p.walk(c, post.s, post.depth, 8);
        }),
      );
      // The first bop, to get it going: whoever's nearest steps in and sends it up.
      const by = (c: Character) => p.apart(c, balloon.s, balloon.depth);
      const server = [...cast].sort((a, b) => by(a) - by(b))[0];
      const sr = roles[cast.indexOf(server)];
      sr.hurry = 1.4;
      await p.walk(
        server,
        balloon.s + (server.s < balloon.s ? -1 : 1) * server.footprint(f).x,
        balloon.depth,
        5,
      );
      p.pose(sr, (t) => reachUp(server, Math.sin(Math.PI * Math.min(1, t / 0.45))));
      server.hopUp(0.25);
      await p.wait(0.2);
      balloon.vh = f.bot * 3.4;
      balloon.glow = 1;
      const goal = 7 + Math.floor(Math.random() * 6);
      let bops = 0;
      let last: Character | null = server;
      let at = p.time;
      await p.settle(() => {
        const fair = cast.filter((c) => c !== last || cast.length === 1);
        const go = fair.sort((a, b) => by(a) - by(b))[0] ?? cast[0];
        cast.forEach((c, i) => {
          roles[i].hurry = c === go ? 1.8 : 1.2;
          const post = posts.get(c)!;
          if (c === go)
            c.walkTo(balloon.s + (c.s < balloon.s ? -1 : 1) * f.bot * 0.1, balloon.depth);
          else c.walkTo(post.s, post.depth);
        });
        // Down to head height, and near enough: bop it up, toward someone else.
        const r = roles[cast.indexOf(go)];
        const head = go.heightPx * (fours(go) ? 0.9 : 1.05);
        if (
          p.time - at > 0.5 &&
          balloon.vh < 0 &&
          balloon.h < head &&
          p.apart(go, balloon.s, balloon.depth) < go.footprint(f).x + balloon.footprint(f).x
        ) {
          at = p.time;
          go.hopUp(0.3);
          p.pose(r, (t) => reachUp(go, Math.sin(Math.PI * Math.min(1, t / 0.45))));
          // To one of the others' places.
          const others = order.filter((c) => c !== go);
          const to = posts.get(others[Math.floor(Math.random() * others.length)] ?? go)!;
          balloon.vh = f.bot * rand([2.8, 3.6]);
          balloon.vs = clamp((to.s - balloon.s) * 0.4, -f.bot * 3.5, f.bot * 3.5);
          balloon.vz = (to.depth - balloon.depth) * floorDepth(f) * 0.4;
          balloon.glow = 1;
          bops++;
          last = go;
        }
        return bops >= goal || (balloon.h < 1 && p.time - at > 1);
      }, 45);
      const down = balloon.h < 1;
      for (const [i, c] of cast.entries()) {
        roles[i].hurry = 1;
        c.walkTo(c.s);
        roles[i].face = down ? 'surprised' : 'love';
      }
      await p.wait(0.9);
      for (const [i, c] of cast.entries()) {
        roles[i].face = 'happy';
        p.pose(roles[i], (t) => cheer(c, t));
        c.hopUp(0.2);
      }
      await p.wait(1.4);
    },
  },

  // A tower of blocks, one on another; then someone knocks it down (and it's funny).
  blocks: {
    weight: 2.5,
    wants: ['nova', 'puppy'],
    cast: (p) => {
      const floor = p.floor();
      const builder = floor.find(handy) ?? floor.find((c) => gripOf(c));
      if (!builder) return null;
      const knocker = floor.find((c) => c !== builder && quick(c));
      return knocker ? [builder, knocker] : [builder];
    },
    run: async (p, [builder, knocker]) => {
      const f = p.frame;
      const deep = floorDepth(f);
      const role: Role = { face: 'happy', mood: 'happy' };
      builder.direct(role);
      const kr: Role = { mood: 'curious' };
      knocker?.direct(kr);
      const dir = p.roomward(builder);
      const tower = {
        s: p.away(builder, dir, 2, 2.5),
        depth: clamp(builder.depth, 0.3, 0.6),
      };
      const names = some(['block-star', 'block-ring', 'block-heart'], 3);
      const blocks: Prop[] = [];
      for (const name of names)
        blocks.push(await p.bring(name, builder, [builder, knocker].filter(Boolean)));
      role.look = () => (blocks[0] ? blocks[0].screen(f) : null);
      let height = 0;
      for (const [i, block] of blocks.entries()) {
        role.look = () => block.screen(f);
        await p.fetch(builder, role, block);
        // Beside the tower, and up on top it goes.
        const side = Math.sign(builder.s - tower.s) || -dir;
        await p.walk(
          builder,
          tower.s + side * (builder.footprint(f).x * 0.9 + block.footprint(f).x),
          tower.depth,
          12,
        );
        role.facing = -side * 55;
        role.look = () => ({ x: blocks[0].screen(f).x, y: blocks[0].screen(f).y - height });
        p.pose(role, (t) => reachUp(builder, Math.min(1, t / 0.35) * 0.5));
        await p.wait(0.35);
        // Onto the one on top, wherever it ended up.
        const onto = blocks[i - 1] ?? tower;
        p.toss(block, onto.s, onto.depth, height + f.bot * 0.05, 0.4);
        p.pose(role, (t) => reachUp(builder, Math.max(0, 1 - t / 0.3) * 0.5));
        await p.settle(() => block.resting, 2);
        height += block.heightPx(f);
        block.glow = 1;
        if (knocker) kr.look = () => block.screen(f);
        if (i < blocks.length - 1) await p.flash(role, 'focused', 0.5);
      }
      // Done: a step back to look at it.
      const side = Math.sign(builder.s - tower.s) || -dir;
      await p.walk(builder, tower.s + side * f.bot * 1.6, tower.depth, 8);
      role.facing = -side * 40;
      role.look = () => blocks[blocks.length - 1].screen(f);
      role.face = 'love';
      builder.hopUp(0.2);
      p.pose(role, (t) => cheer(builder, t));
      await p.wait(1.5);
      p.pose(role, null);
      // And down it comes.
      const who = knocker ?? builder;
      const wr = knocker ? kr : role;
      wr.mood = 'happy';
      wr.face = 'happy';
      wr.hurry = knocker ? 2 : 1.4;
      const from = Math.sign(who.s - tower.s) || -side;
      await p.walk(
        who,
        tower.s + from * (who.footprint(f).x + blocks[0].footprint(f).x * 0.8),
        tower.depth,
        12,
      );
      wr.facing = -from * 60;
      p.pose(wr, (t) => kick(who, Math.min(1, t / 0.35)));
      await p.wait(0.15);
      for (const [i, block] of blocks.entries()) {
        block.vs += -from * f.bot * (5 - i * 1.6) * rand([0.8, 1.3]);
        block.vz += (Math.random() - 0.5) * deep * 0.8;
        block.vh += f.bot * (1.5 + i * 1.2);
        block.glow = 1;
      }
      await p.wait(0.4);
      p.pose(wr, null);
      if (knocker) {
        role.face = 'surprised';
        await p.wait(0.7);
        role.face = 'cross';
        builder.hopUp(0.1);
        await p.wait(0.8);
        kr.face = 'wink';
        await p.wait(0.6);
      }
      role.face = kr.face = 'happy';
      p.pose(role, (t) => cheer(builder, t));
      if (knocker) p.pose(kr, (t) => cheer(knocker, t));
      builder.hopUp(0.25);
      knocker?.hopUp(0.25);
      await p.wait(1.5);
    },
  },

  // A top, set spinning: they watch it wander and wobble, and fall over.
  top: {
    weight: 2,
    wants: ['bolt', 'kitten'],
    cast: (p) => {
      const floor = p.floor();
      return floor.length ? some(floor, 3) : null;
    },
    run: async (p, [spinner, ...watchers]) => {
      const f = p.frame;
      const top = await p.bring('top', spinner, [spinner, ...watchers]);
      const watch = () => top.screen(f);
      const role: Role = { face: 'happy', look: watch };
      spinner.direct(role);
      const roles = watchers.map((c) => {
        const r: Role = { mood: 'curious', face: 'focused', look: watch };
        c.direct(r);
        return r;
      });
      for (let round = 0; round < 2; round++) {
        await p.reach(spinner, role, top);
        p.pose(role, (t) => twist(spinner, t / 0.35));
        await p.wait(0.2);
        top.spinUp(rand([36, 46]));
        top.glow = 1;
        await p.wait(0.3);
        p.pose(role, null);
        // Back a step, and round to watch it.
        const side = Math.sign(spinner.s - top.s) || 1;
        spinner.walkTo(top.s + side * f.bot * 1.5, top.depth);
        watchers.forEach((c, i) => {
          const s = top.s + (i % 2 ? 1 : -1) * f.bot * (1.4 + i * 0.6) * -side;
          c.walkTo(s, clamp(top.depth + (i ? 0.15 : -0.15), 0.15, 0.9));
        });
        await p.settle(() => top.fallen, 16);
        // It's over! Somebody's gone dizzy watching it.
        role.face = 'surprised';
        roles.forEach((r) => (r.face = 'surprised'));
        await p.wait(0.8);
        const dizzy = roles.length ? roles[Math.floor(Math.random() * roles.length)] : role;
        dizzy.face = 'dizzy';
        role.face = 'happy';
        roles.forEach((r) => r !== dizzy && (r.face = 'happy'));
        await p.wait(1.4);
        dizzy.face = 'happy';
        await p.settle(() => top.spin < 0.5, 3);
      }
      p.pose(role, (t) => cheer(spinner, t));
      await p.wait(1.2);
    },
  },

  // A trampoline: they take turns bouncing, higher and higher.
  trampoline: {
    weight: 2,
    wants: ['pogo', 'bolt', 'puppy'],
    cast: (p) => {
      const floor = p.floor();
      return floor.length ? some(floor, 3) : null;
    },
    run: async (p, cast) => {
      const f = p.frame;
      const tramp = await p.bring('trampoline', null, cast);
      const roles = cast.map((c) => {
        const r: Role = { mood: 'happy', face: 'happy' };
        c.direct(r);
        return r;
      });
      // The others wait at the side and watch.
      const watch = () => ({ x: tramp.screen(f).x, y: tramp.screen(f).y - f.bot });
      for (const [i, c] of cast.entries()) {
        const r = roles[i];
        tramp.users.add(c);
        r.look = undefined;
        // On it...
        await p.until(
          () => {
            if (p.apart(c, tramp.s, tramp.depth) < tramp.footprint(f).x * 0.9)
              c.standOn = tramp.seatPx(f);
            c.walkTo(tramp.s, tramp.depth);
            return c.there;
          },
          p.allow(c, tramp.s, tramp.depth, 14),
        );
        c.standOn = tramp.seatPx(f);
        r.facing = 0;
        cast.forEach((o, j) => {
          if (o === c) return;
          roles[j].look = watch;
          roles[j].face = 'happy';
        });
        await p.wait(0.4);
        // ...and up: each bounce higher.
        const hops = 5 + Math.floor(Math.random() * 3);
        for (let k = 0; k < hops; k++) {
          const high = 0.3 + (k / hops) * 0.6;
          tramp.boing(0.5 + high * 0.5);
          c.hopUp(high);
          r.face = k > hops / 2 ? 'love' : 'happy';
          if (k === hops - 1) p.pose(r, (t) => cheer(c, t));
          await p.wait(0.5 + high * 0.35);
        }
        tramp.boing(0.4);
        p.pose(r, null);
        // Off, to the side, for the next one.
        const side = i % 2 ? 1 : -1;
        const off = tramp.s + side * (tramp.footprint(f).x + c.footprint(f).x + f.bot * 0.4);
        c.walkTo(off, tramp.depth);
        await p.settle(
          () => {
            const on = p.apart(c, tramp.s, tramp.depth) < tramp.footprint(f).x * 0.9;
            c.standOn = on ? tramp.seatPx(f) : 0;
            return c.there;
          },
          p.allow(c, off, tramp.depth, 5),
        );
        c.standOn = 0;
        tramp.users.delete(c);
        r.look = watch;
        r.facing = -side * 40;
        cast.forEach((o, j) => {
          if (o !== c) p.pose(roles[j], (t) => (t < 1 ? cheer(o, t) : undefined));
        });
      }
      await p.wait(1);
    },
  },

  // A seesaw: one at each end, up and down, up and down.
  seesaw: {
    weight: 2,
    wants: ['kitten', 'puppy'],
    cast: (p) => {
      const floor = p.floor().sort((a, b) => a.heightPx - b.heightPx);
      for (let i = 0; i + 1 < floor.length; i++)
        if (floor[i + 1].heightPx < floor[i].heightPx * 1.6) return [floor[i], floor[i + 1]];
      return null;
    },
    run: async (p, cast) => {
      const f = p.frame;
      const saw = await p.bring('seesaw', null, cast);
      const [a, b] = cast[0].s < cast[1].s ? cast : [cast[1], cast[0]];
      const riders = [a, b];
      const roles = riders.map((c) => {
        const r: Role = { face: 'happy', mood: 'happy' };
        c.direct(r);
        saw.users.add(c);
        return r;
      });
      // Each to an end, and up onto it.
      await Promise.all(
        riders.map((c, i) =>
          p.until(
            () => {
              const seat = saw.seats(f)[i];
              c.walkTo(seat.s, seat.depth);
              if (p.apart(c, seat.s, seat.depth) < c.footprint(f).x * 1.2) c.standOn = seat.h;
              return c.there;
            },
            p.allow(c, saw.s, saw.depth, 14),
          ),
        ),
      );
      // Facing each other, riding on the plank as it tips.
      roles[0].facing = 40;
      roles[1].facing = -40;
      riders.forEach((c, i) => {
        roles[i].pose = () => {
          c.standOn = saw.seats(f)[i].h;
        };
      });
      const start = p.time;
      const period = 2.4;
      let last = 0;
      await p.settle(() => {
        const t = p.time - start;
        const phase = Math.sin((t / period) * Math.PI * 2);
        saw.tilt = 15 * Math.sign(phase) * Math.min(1, Math.abs(phase) * 1.8);
        // The one at the bottom pushes off; the one up top loves it.
        const down = saw.tilt > 0 ? 1 : 0;
        if (Math.floor(t / (period / 2)) !== last) {
          last = Math.floor(t / (period / 2));
          riders[down].hopUp(0.12);
          saw.glow = 1;
        }
        roles[down].face = 'happy';
        roles[1 - down].face = Math.abs(saw.tilt) > 12 ? 'love' : 'happy';
        return t > rand([8, 11]);
      }, 12);
      saw.tilt = 0;
      await p.wait(1);
      for (const [i, c] of riders.entries()) {
        roles[i].pose = undefined;
        c.standOn = 0;
        saw.users.delete(c);
        const seat = saw.seats(f)[i];
        c.walkTo(seat.s + (i ? 1 : -1) * (c.footprint(f).x + f.bot * 0.3), saw.depth);
      }
      await p.wait(1);
      for (const [i, c] of riders.entries()) p.pose(roles[i], (t) => cheer(c, t));
      await p.wait(1.2);
    },
  },

  // A drum: one keeps the beat, and the rest dance.
  drum: {
    weight: 2,
    wants: ['bear', 'bolt', 'penguin'],
    cast: (p) => {
      const floor = p.floor();
      return floor.length >= 2 ? some(floor, 5) : null;
    },
    run: async (p, [drummer, ...dancers]) => {
      const f = p.frame;
      const drum = await p.bring('drum', drummer, [drummer, ...dancers]);
      const role: Role = { face: 'focused', look: () => drum.screen(f) };
      drummer.direct(role);
      const roles = dancers.map((c) => {
        const r: Role = { face: 'happy', mood: 'happy' };
        c.direct(r);
        return r;
      });
      await p.reach(drummer, role, drum);
      // The others gather round, in a row, facing us.
      const spots = p.row(
        dancers.length,
        drum.s + (drum.s < (f.left + f.right) / 2 ? 1 : -1) * f.bot * 3,
        0.35,
        1.7,
      );
      dancers.forEach((c, i) => c.walkTo(spots[i].s, spots[i].depth));
      // The beat: 0.5 s, and the drum on each.
      const beat = 0.5;
      const t0 = Math.ceil(p.time / beat) * beat;
      let n = -1;
      p.pose(role, () => tap(drummer, ((((p.time - t0) / beat) % 1) + 1) % 1));
      const bars = 16 + 4 * Math.floor(Math.random() * 3);
      const started = new Set<Character>();
      await p.settle(
        () => {
          const k = Math.floor((p.time - t0) / beat);
          const on = k !== n && k >= 0;
          if (on) {
            n = k;
            drum.boing(k % 4 === 0 ? 1 : 0.6);
            if (k === 4) role.face = 'happy';
          }
          // Dancers who've got there start dancing; on every fourth beat, a hop.
          dancers.forEach((c, i) => {
            if (!started.has(c) && c.there) {
              started.add(c);
              roles[i].facing = 0;
              dance(p, c, roles[i]);
            }
            if (on && started.has(c) && k % 4 === 0) c.hopUp(0.12);
          });
          return n >= bars;
        },
        bars * beat + 12,
      );
      // The big finish.
      drum.boing(1);
      p.pose(role, (t) => cheer(drummer, t));
      drummer.hopUp(0.25);
      dancers.forEach((c, i) => {
        c.perform('idle');
        p.pose(roles[i], (t) => cheer(c, t));
        c.hopUp(0.25);
        roles[i].face = 'love';
      });
      await p.wait(1.6);
    },
  },

  // Bubbles: one blows them, the others (and the mouse) pop them.
  bubbles: {
    weight: 2,
    wants: ['nova', 'bolt', 'cat'],
    cast: (p) => {
      const floor = p.floor();
      const blower = floor.find(handy);
      if (!blower) return null;
      return [
        blower,
        ...some(
          floor.filter((c) => c !== blower && quick(c)),
          3,
        ),
      ];
    },
    run: async (p, [blower, ...poppers]) => {
      const f = p.frame;
      const wand = await p.bring('wand', blower, [blower, ...poppers]);
      const role: Role = { face: 'happy' };
      blower.direct(role);
      const roles = poppers.map((c) => {
        const r: Role = { face: 'happy', mood: 'curious' };
        c.direct(r);
        return r;
      });
      await p.fetch(blower, role, wand);
      const dir = p.roomward(blower);
      role.facing = dir * 40;
      const bubbles = p.bubbles;
      let popped = 0;
      bubbles.onPop = (by) => {
        popped++;
        const i = by ? poppers.indexOf(by) : -1;
        if (i >= 0) {
          roles[i].face = 'love';
          setTimeout(() => (roles[i].face = 'happy'), 500);
        } else if (!by) blower.hopUp(0.1);
      };
      p.pose(role, (t) => wave(blower, t));
      let blow = 0;
      const end = p.time + rand([10, 14]);
      const jumped = new Map<Character, number>();
      await p.settle(() => {
        if (p.time < end && p.time > blow && wand.heldBy) {
          blow = p.time + rand([0.18, 0.4]);
          bubbles.blow(f, wand.tip(), blower.depth, dir);
        }
        // The poppers go for the nearest, and jump for it.
        const all = bubbles.where(f);
        poppers.forEach((c, i) => {
          const r = roles[i];
          // The nearest within reach of a jump, rather than one floating off high.
          const cost = (x: (typeof all)[number]) =>
            Math.abs(x.b.s - c.s) + Math.max(0, x.b.h - c.heightPx * 2) * 2;
          const b = all.sort((x, y) => cost(x) - cost(y))[0];
          r.look = b ? () => ({ x: b.x, y: b.y }) : undefined;
          if (!b) return;
          r.hurry = 1.6;
          c.walkTo(b.b.s, b.b.depth);
          const over = Math.abs(b.b.s - c.s) < c.footprint(f).x && b.b.h < c.heightPx * 2.2;
          if (over && p.time - (jumped.get(c) ?? 0) > 0.8) {
            jumped.set(c, p.time);
            c.hopUp(0.45);
            p.pose(r, (t) => reachUp(c, Math.sin(Math.PI * Math.min(1, t / 0.5))));
          }
        });
        return p.time > end && bubbles.count === 0;
      }, 24);
      p.pose(role, null);
      await p.putDown(blower, role, wand, dir);
      role.face = popped > 8 ? 'love' : 'happy';
      poppers.forEach((c, i) => {
        c.walkTo(c.s);
        p.pose(roles[i], (t) => cheer(c, t));
      });
      await p.wait(1.4);
    },
  },

  // A cushion comes up; someone climbs on it and has a sit, or a nap.
  cushion: {
    weight: 2,
    wants: ['dog'],
    cast: (p) => {
      const floor = p.floor();
      const c = floor[Math.floor(Math.random() * floor.length)];
      return c ? [c] : null;
    },
    run: async (p, [c]) => {
      const f = p.frame;
      const cushion = await p.bring('cushion', c, [c]);
      cushion.users.add(c);
      const role: Role = { look: () => cushion.screen(f) };
      c.direct(role);
      c.walkTo(cushion.s, cushion.depth);
      await p.until(() => {
        if (p.apart(c, cushion.s, cushion.depth) < cushion.footprint(f).x)
          c.standOn = cushion.seatPx(f);
        return c.there;
      }, 12);
      c.standOn = cushion.seatPx(f);
      role.look = undefined;
      role.facing = 0;
      const lit = () => (cushion.glow = Math.max(cushion.glow, 0.7));
      p.pose(role, lit);
      if (isPet(c)) {
        role.posture = Math.random() < 0.5 ? 'sit' : 'lie';
        role.mood = role.posture === 'lie' ? 'sleepy' : 'happy';
      } else {
        const rest = c.repertoire.find((n) => RESTS.includes(n));
        if (rest) c.perform(rest);
      }
      await p.wait(4 + Math.random() * 4);
      if (role.posture === 'lie') role.mood = 'asleep';
      await p.wait(3 + Math.random() * 5);
      role.posture = undefined;
      role.mood = undefined;
      c.perform('idle');
      const side = p.roomward(c);
      c.standOn = 0;
      cushion.users.delete(c);
      await p.walk(
        c,
        cushion.s + side * (cushion.footprint(f).x + c.footprint(f).x + f.bot * 0.3),
        cushion.depth,
        10,
      );
    },
  },

  // Hide and seek: one hides behind a crate and peeks out; another comes looking.
  crate: {
    weight: 2,
    wants: ['kitten', 'bolt'],
    cast: (p) => {
      const f = p.frame;
      const floor = p.floor();
      const tall = KINDS.crate.size * f.bot * 1.35;
      const hider = floor.find((c) => fits(c, tall));
      if (!hider) return null;
      const seeker = floor.find((c) => c !== hider);
      return seeker ? [hider, seeker] : [hider];
    },
    run: async (p, [hider, seeker]) => {
      const f = p.frame;
      const deep = floorDepth(f);
      const crate = await p.bring('crate', null, [hider, seeker].filter(Boolean));
      const role: Role = { face: 'happy', mood: 'happy' };
      hider.direct(role);
      const seek: Role = { mood: 'calm' };
      seeker?.direct(seek);
      const box = crate.footprint(f);
      const behind = clamp(
        crate.depth + (box.z + hider.footprint(f).z + f.bot * 0.15) / deep,
        0,
        0.97,
      );
      await p.walk(hider, crate.s, behind, 14);
      role.facing = 0;
      role.face = undefined;
      role.mood = 'curious';
      const light = () => (crate.glow = Math.max(crate.glow, 0.6));
      p.pose(role, light);
      for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
        await p.wait(1.2 + Math.random() * 1.8);
        const side = Math.random() < 0.5 ? -1 : 1;
        await p.walk(hider, crate.s + side * box.x * 0.95, behind, 6);
        role.face = 'happy';
        await p.wait(1);
        role.face = undefined;
        await p.walk(hider, crate.s, behind, 6);
      }
      if (seeker) {
        // Looking about, here and there...
        seek.face = 'focused';
        for (let i = 0; i < 2; i++) {
          const s = p.away(seeker, Math.random() < 0.5 ? -1 : 1, 1.5, 3);
          await p.walk(seeker, s, 0.2 + Math.random() * 0.5, 10);
          await p.wait(0.8);
        }
        // ...then round the crate: found!
        const side = Math.sign(seeker.s - crate.s) || 1;
        await p.walk(
          seeker,
          crate.s + side * (box.x + seeker.footprint(f).x + f.bot * 0.2),
          crate.depth,
          12,
        );
        seek.facing = -side * 50;
        seek.face = 'surprised';
        role.face = 'surprised';
        await p.walk(hider, crate.s - side * (box.x + hider.footprint(f).x * 0.6), behind, 6);
        await p.wait(0.5);
        seek.face = role.face = 'happy';
        seek.mood = role.mood = 'happy';
        hider.hopUp(0.25);
        seeker.hopUp(0.25);
        p.pose(seek, (t) => cheer(seeker, t));
        await p.wait(1.6);
      } else {
        await p.walk(
          hider,
          crate.s + (Math.random() < 0.5 ? -1 : 1) * (box.x + hider.footprint(f).x + f.bot * 0.3),
          crate.depth,
          10,
        );
        role.face = 'happy';
        hider.hopUp(0.2);
        await p.wait(1);
      }
    },
  },

  // A table comes up; someone small creeps under it, sits a while, and comes out.
  table: {
    weight: 1.5,
    wants: ['kitten'],
    cast: (p) => {
      const f = p.frame;
      const room = KINDS.table.size * (KINDS.table.under ?? 0.7) * f.bot;
      const c = p.floor().find((m) => fits(m, room));
      return c ? [c] : null;
    },
    run: async (p, [c]) => {
      const f = p.frame;
      const table = await p.bring('table', null, [c]);
      const role: Role = { mood: 'curious', face: 'happy' };
      c.direct(role);
      await p.walk(c, table.s, table.depth, 14);
      role.facing = 0;
      role.face = undefined;
      p.pose(role, () => (table.glow = Math.max(table.glow, 0.8)));
      if (isPet(c)) role.posture = 'sit';
      else {
        const rest = c.repertoire.find((n) => RESTS.includes(n));
        if (rest) c.perform(rest);
      }
      await p.wait(5 + Math.random() * 5);
      role.posture = undefined;
      c.perform('idle');
      const side = Math.random() < 0.5 ? -1 : 1;
      await p.walk(
        c,
        table.s + side * (table.footprint(f).x + c.footprint(f).x + f.bot * 0.2),
        table.depth,
        12,
      );
      role.face = 'happy';
      await p.wait(0.8);
    },
  },

  // ---------- Games without toys ----------

  // Tag: whoever's "it" chases the nearest; a touch, and they're it.
  tag: {
    weight: 1.5,
    wants: ['puppy', 'kitten', 'nova'],
    cast: (p) => {
      const floor = p.floor().filter(quick);
      return floor.length >= 3 ? some(floor, 4) : null;
    },
    run: async (p, cast) => {
      const f = p.frame;
      const roles = cast.map((c) => {
        const r: Role = { face: 'happy', mood: 'happy', hurry: 1.7 };
        c.direct(r);
        return r;
      });
      let it = cast[Math.floor(Math.random() * cast.length)];
      let since = p.time;
      let tags = 0;
      const goal = 4 + Math.floor(Math.random() * 3);
      const fled = new Map<Character, number>();
      roles[cast.indexOf(it)].face = 'focused';
      await p.settle(() => {
        const ir = roles[cast.indexOf(it)];
        // It counts a moment, then goes after the nearest.
        const others = cast.filter((c) => c !== it);
        const by = (c: Character) => p.apart(it, c.s, c.depth);
        const prey = others.sort((a, b) => by(a) - by(b))[0];
        if (p.time - since > 1) {
          it.walkTo(prey.s, prey.depth);
          ir.look = () => prey.eyePoint(f);
        }
        // The rest keep away from it.
        for (const c of others) {
          const r = roles[cast.indexOf(c)];
          r.look = () => it.eyePoint(f);
          if (by(c) < f.bot * 3.5 && p.time - (fled.get(c) ?? 0) > 0.8) {
            fled.set(c, p.time);
            const away = Math.sign(c.s - it.s) || 1;
            c.walkTo(p.away(c, away, 2, 5), 0.15 + Math.random() * 0.7);
            r.face = 'surprised';
            setTimeout(() => (r.face = 'happy'), 400);
          }
        }
        // Touched!
        const reach = it.footprint(f).x + prey.footprint(f).x + f.bot * 0.25;
        if (p.time - since > 1 && by(prey) < reach) {
          prey.hopUp(0.3);
          it.hopUp(0.15);
          ir.face = 'happy';
          ir.look = undefined;
          roles[cast.indexOf(prey)].face = 'focused';
          it.walkTo(p.away(it, Math.sign(it.s - prey.s) || 1, 1.5, 3));
          it = prey;
          prey.walkTo(prey.s);
          since = p.time;
          tags++;
        }
        return tags >= goal;
      }, 40);
      for (const [i, c] of cast.entries()) {
        roles[i].hurry = 1;
        roles[i].face = 'happy';
        c.walkTo(c.s);
        roles[i].look = undefined;
      }
      await p.wait(0.8);
      for (const [i, c] of cast.entries()) {
        roles[i].facing = 0;
        p.pose(roles[i], (t) => cheer(c, t));
        c.hopUp(0.2);
      }
      await p.wait(1.3);
    },
  },

  // Two meet: a high five (or, for two pets, a nose boop; for one of each, a hop to a hand).
  highfive: {
    weight: 2,
    wants: ['nova', 'dog'],
    cast: (p) => {
      const floor = p.floor();
      return floor.length >= 2 ? some(floor, 2) : null;
    },
    run: async (p, [a, b]) => {
      const f = p.frame;
      const ra: Role = { face: 'happy', look: () => b.eyePoint(f) };
      const rb: Role = { face: 'happy', look: () => a.eyePoint(f) };
      a.direct(ra);
      b.direct(rb);
      const mid = (a.s + b.s) / 2;
      const depth = clamp((a.depth + b.depth) / 2, 0.25, 0.7);
      const side = Math.sign(a.s - b.s) || 1;
      const petPair = fours(a) && fours(b);
      const gap = (a.footprint(f).x + b.footprint(f).x) * (petPair ? 0.55 : 0.6);
      await Promise.all([
        p.walk(a, mid + (side * gap) / 2, depth, 14),
        p.walk(b, mid - (side * gap) / 2, depth, 14),
      ]);
      ra.facing = -side * 70;
      rb.facing = side * 70;
      await p.wait(0.4);
      if (petPair) {
        // Noses together.
        p.pose(ra, (t) => stoop(a, Math.sin(Math.PI * Math.min(1, t / 1.2)) * 0.45));
        p.pose(rb, (t) => stoop(b, Math.sin(Math.PI * Math.min(1, t / 1.2)) * 0.45));
        await p.wait(0.6);
        ra.face = rb.face = 'love';
        ra.mood = rb.mood = 'love';
        await p.wait(1.4);
      } else {
        // The near hands up, a hop, and a clap.
        // The hand nearer the other: facing left (toward -s), that's its right.
        const near = (s: number) => (s > 0 ? 'R' : 'L') as 'L' | 'R';
        p.pose(ra, (t) => reachUp(a, Math.min(1, t / 0.4), near(side)));
        p.pose(rb, (t) => reachUp(b, Math.min(1, t / 0.4), near(-side)));
        await p.wait(0.45);
        a.hopUp(0.3);
        b.hopUp(0.3);
        await p.wait(0.25);
        ra.face = rb.face = 'love';
        await p.wait(0.8);
        p.pose(ra, (t) => cheer(a, t));
        p.pose(rb, (t) => cheer(b, t));
        await p.wait(1.2);
      }
    },
  },

  // A dance: everyone in a row, facing us, dancing (their own dance, or a bob to the beat).
  dance: {
    weight: 1.5,
    wants: ['bolt', 'bear', 'nova'],
    cast: (p) => {
      const floor = p.floor();
      return floor.length >= 3 ? some(floor, 5) : null;
    },
    run: async (p, cast) => {
      const f = p.frame;
      const roles = cast.map((c) => {
        const r: Role = { face: 'happy', mood: 'happy' };
        c.direct(r);
        return r;
      });
      const spots = p.row(cast.length, (f.left + f.right) / 2, 0.3, 1.8);
      const order = [...cast].sort((a, b) => a.s - b.s);
      await Promise.all(
        order.map((c, i) => p.walk(c, spots[i].s, spots[i].depth, 14).catch(() => undefined)),
      );
      for (const [i, c] of cast.entries()) {
        roles[i].facing = 0;
        dance(p, c, roles[i]);
      }
      const t0 = p.time;
      let n = -1;
      await p.settle(
        () => {
          const k = Math.floor((p.time - t0) / 0.5);
          if (k !== n) {
            n = k;
            if (k % 8 === 7) cast.forEach((c) => c.hopUp(0.18));
          }
          return false;
        },
        rand([8, 12]),
      );
      cast.forEach((c, i) => {
        c.perform('idle');
        p.pose(roles[i], (t) =>
          t < 0.9 ? bow(c, Math.sin(Math.PI * (t / 0.9))) : cheer(c, t - 0.9),
        );
        roles[i].face = 'love';
      });
      await p.wait(2);
    },
  },

  // Follow the leader, round the box: each walks where the one ahead just was.
  parade: {
    weight: 1.5,
    wants: ['duck', 'penguin', 'puppy'],
    cast: (p) => {
      const floor = p.floor();
      return floor.length >= 3 ? some(floor, 5) : null;
    },
    run: async (p, cast) => {
      const f = p.frame;
      const [leader, ...line] = cast;
      const roles = cast.map((c) => {
        const r: Role = { face: 'happy', mood: 'happy' };
        c.direct(r);
        return r;
      });
      const m = f.bot * 2;
      const loop: Spot[] = [
        { s: f.left + m, depth: 0.25 },
        { s: f.left + m * 1.3, depth: 0.8 },
        { s: (f.left + f.right) / 2, depth: 0.9 },
        { s: f.right - m * 1.3, depth: 0.8 },
        { s: f.right - m, depth: 0.25 },
        { s: (f.left + f.right) / 2, depth: 0.15 },
      ];
      // Start from the nearest corner, and go round once (or a bit more).
      const first = loop
        .map((w, i) => [i, p.apart(leader, w.s, w.depth)])
        .sort((a, b) => a[1] - b[1])[0][0];
      const route = Array.from(
        { length: loop.length + 2 },
        (_, i) => loop[(first + i) % loop.length],
      );
      // Where each has been, to follow.
      const trail = new Map(cast.map((c) => [c, [] as (Spot & { t: number })[]]));
      let leg = 0;
      roles[0].hurry = 0.8;
      await p.settle(() => {
        for (const c of cast) {
          const list = trail.get(c)!;
          list.push({ s: c.s, depth: c.depth, t: p.time });
          while (list.length && list[0].t < p.time - 4) list.shift();
        }
        const w = route[leg];
        leader.walkTo(w.s, w.depth);
        if (p.apart(leader, w.s, w.depth) < f.bot * 0.4) leg++;
        // Each behind the one before, where it was a moment ago.
        line.forEach((c, i) => {
          const ahead = cast[i];
          const list = trail.get(ahead)!;
          const then = list.find((x) => x.t >= p.time - 1.1) ?? list[0];
          if (
            then &&
            p.apart(c, ahead.s, ahead.depth) > ahead.footprint(f).x + c.footprint(f).x + f.bot * 0.3
          )
            c.walkTo(then.s, then.depth);
          roles[i + 1].look = () => ahead.eyePoint(f);
        });
        return leg >= route.length;
      }, 60);
      // Stop, turn to us, and a bow.
      for (const [i, c] of cast.entries()) {
        c.walkTo(c.s);
        roles[i].facing = 0;
        roles[i].look = undefined;
      }
      await p.wait(0.8);
      cast.forEach((c, i) =>
        p.pose(roles[i], (t) => bow(c, Math.sin(Math.PI * Math.min(1, t / 1)))),
      );
      await p.wait(1.2);
      cast.forEach((c, i) => {
        p.pose(roles[i], (t) => cheer(c, t));
        c.hopUp(0.2);
      });
      await p.wait(1.2);
    },
  },

  // A nap in a heap: the pets curl up together and doze off.
  nap: {
    weight: 1,
    wants: ['cat', 'dog', 'kitten'],
    cast: (p) => {
      const pets = p.floor().filter(isPet);
      return pets.length >= 2 ? some(pets, 3) : null;
    },
    run: async (p, cast) => {
      const f = p.frame;
      const roles = cast.map((c) => {
        const r: Role = { mood: 'sleepy' };
        c.direct(r);
        return r;
      });
      const mid = cast.reduce((s, c) => s + c.s, 0) / cast.length;
      const depth = clamp(cast.reduce((s, c) => s + c.depth, 0) / cast.length, 0.3, 0.7);
      // Snug: as close as they go (they won't overlap).
      const width = cast.reduce((s, c) => s + c.footprint(f).x * 2, 0);
      let at = clamp(mid - width / 2, f.left + f.bot, f.right - f.bot - width);
      await Promise.all(
        cast.map((c, i) => {
          const s = at + c.footprint(f).x;
          at += c.footprint(f).x * 2;
          return p.walk(c, s, depth + (i % 2 ? 0.05 : -0.05), 14).catch(() => undefined);
        }),
      );
      for (const [i, r] of roles.entries()) {
        r.facing = (i % 2 ? -1 : 1) * 30;
        r.posture = 'lie';
      }
      await p.wait(2);
      for (const r of roles) r.mood = 'asleep';
      await p.wait(rand([8, 12]));
      // One wakes, then all.
      for (const [i, r] of roles.entries()) {
        await p.wait(i ? 0.5 : 0);
        r.mood = 'sleepy';
      }
      await p.wait(1);
      for (const r of roles) {
        r.posture = undefined;
        r.mood = 'happy';
      }
      await p.wait(1);
    },
  },
};

function pick<T>(items: T[], weight: (t: T) => number): T | undefined {
  let r = Math.random() * items.reduce((s, i) => s + weight(i), 0);
  for (const i of items) if ((r -= weight(i)) <= 0) return i;
  return items[items.length - 1];
}
