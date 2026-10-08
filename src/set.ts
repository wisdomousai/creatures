import { DRAG, HOLD, holdSelection, onMenu } from './press';
import {
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  Plane,
  PlaneGeometry,
  ShapeGeometry,
  Shape,
  Vector3,
} from 'three';
import { type Box, type Door, depthScale, floorDepth, horizon, project } from './box';
import {
  type Body,
  type Character,
  clamp,
  type Env,
  type Frame,
  loadModel,
  shadowTexture,
  type Top,
} from './character';
import { Fire } from './fire';
import { dress, type LookName, type Outfit } from './looks';
import { Puppet } from './puppet';
import { KINDS, type Kind, rugStep } from './set-kinds';
import { Spring } from './spring';

/**
 * The set: plants and furniture that are alive (blender/set.py), standing in the back
 * of the box, along the back wall and in its corners: a fern, a sunflower lamp, a floor
 * lamp, an armchair, a bookshelf, a rug, a stool, a radio and a gramophone. Each page has
 * its own few; when the page changes, the old ones sink into a hole in the floor and the
 * new ones rise out of one.
 *
 * Each is quietly alive all the time (a fern's fronds sway and slowly curl and uncurl, a
 * lamp blinks and looks about) and now and then does something: a little act, chosen by
 * weight with pauses between, like the crew's. They look at the mouse (or, when it isn't
 * there, at whoever is near), shiver or lean when a creature walks past, are pleased
 * when hovered, jump when clicked (three quick clicks and they are dizzy), and in the
 * dark theme they go to sleep, or glow. What each piece does is in set-kinds.ts.
 *
 * They take up room on the floor like the props (Body), so the crew walk round them; the
 * rug is flat and they walk over it, and it ripples under their feet.
 */

export const DEG = Math.PI / 180;
/** Two clicks on a piece within this many ms swap it for another; a third as quickly puts
 * it away. */
export const DOUBLE = 350;

/** Which pieces stand on each page. The rug stays put away until something asks for it. */
export const SET_PAGES: Record<string, string[]> = {
  home: ['fern', 'lamp'],
  writing: ['bookshelf', 'armchair', 'sunflower'],
  'work-with-me': ['lamp', 'stool', 'fern'],
  work: ['sunflower', 'radio', 'stool'],
  about: ['armchair', 'fern', 'lamp'],
  contact: ['stool', 'radio'],
  creatures: ['cattree', 'kennel', 'birdbath'],
  'creatures/cats': ['cattree', 'armchair', 'fern'],
  'creatures/dogs': ['kennel', 'stool', 'sunflower'],
  'creatures/birds': ['birdbath', 'perch', 'sunflower'],
};

export const SET = Object.keys(KINDS);

const firePoint = new Vector3();
/** Kept still, its lights settle to their level over this long (s): no flicker, no blinking. */
const STEADY = 1.5;

/** How the crew's positions and the mouse look from a piece. */
interface Near {
  x: number;
  y: number;
  /** Across (px, + to the right) and how far. */
  dx: number;
  dist: number;
}

export class Piece implements Body {
  readonly name: string;
  readonly kind: Kind;
  readonly holder = new Group();
  readonly model: Object3D;
  readonly puppet: Puppet;
  private outfit: Outfit | null = null;
  private shadow: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private planes = Array.from({ length: 4 }, () => new Plane(new Vector3(0, 1, 0), 1e6));
  readonly seed = Math.random() * 100;
  rainbow = false;
  look: LookName = 'ink';

  /** Along the front of the box (px), back into it (0..1), and the sprung offsets: along
   * the wall (px), up (--bot), tipped about its foot (deg), and a squash. */
  s = 0;
  depth = 0.8;
  slide = new Spring(4, 0.8);
  hop = new Spring(5, 0.5);
  lean = new Spring(3.5, 0.35);
  squash = new Spring(5, 0.3);
  slideTo = 0;
  hopTo = 0;
  leanTo = 0;
  /** Its height as a share of its kind's usual (a spot can ask for it bigger). */
  scale = 1;
  /** Seconds here. */
  t = 0;
  rise = 0;
  want = 0;
  /** Placed, waiting for its turn to come up; or called off before it did. */
  waiting = true;
  cancelled = false;
  portal: Door | null = null;
  private frame: Frame | null = null;
  /** The crew on stage this frame. */
  peers: readonly Character[] = [];

  get frameNow() {
    return this.frame;
  }

  /** What the acts and the moment feed the piece's own ambient motion this frame. */
  private channels: Record<string, number> = {};
  /** Where it looks (-1..1 across and down), and who is near. */
  gx = 0;
  gy = 0;
  private gaze = [new Spring(1.8, 0.8), new Spring(1.8, 0.8)];
  near: Near | null = null;
  /** A creature walking past, 0..1, and the one that walks past now. */
  stir = 0;
  private stirSmooth = new Spring(3, 0.9);
  private passing = false;
  /** 1 in the dark theme, smoothed. */
  night = 0;
  private dark = false;
  private nightSmooth = new Spring(1, 1);
  hover = 0;
  hovered = false;
  private hoverSmooth = new Spring(4, 0.8);
  /** Stands on a shelf of another piece (the gramophone in the library's case): that piece,
   * once it's there, and how high up it stands (--bot). It rises and sinks with its host, and
   * the crew don't walk round it. */
  hostName: string | null = null;
  hostOf: ((name: string) => Piece | undefined) | null = null;
  lift = 0;
  /** Held by the pointer (viewport px, and where its foot is from it): it goes after it. */
  taken: { x: number; y: number; dx: number; dy: number } | null = null;
  /** Set going by a click, fading; how many clicks lately. */
  excite = 0;
  private pokes: number[] = [];
  /** An eye blink, 0..1. */
  blink = 0;
  private nextBlink = 2 + Math.random() * 3;
  /** Kept still (the library while the book's read): no acts of its own, its eyes resting
   * instead of following the mouse and whoever passes, its lights steady. */
  still = false;
  private steady = new Map<number, number>();
  private dt = 0;
  /** Where a cat may lie in it (the bookcases' nooks), if it has one: the middle of the
   * nook along the floor and how far back (px, as the crew's), its cushion's top above the
   * floor (px at the front of the box, as standOn), and the room in it (px, as those). */
  nook(f: Frame) {
    const n = this.kind.nook;
    if (!n) return null;
    const wide = this.footprint(f).x * 2;
    return {
      s: this.floorPoint(f).x + n.x * wide,
      depth: this.depth + ((n.back ?? 0) * this.heightPx(f)) / floorDepth(f),
      h: n.seat * this.heightPx(f),
      room: { w: n.w * wide, h: n.h * this.heightPx(f) },
    };
  }
  /** Which act is on, how long it has been, how long it lasts, and a pick it made. */
  act: string | null = null;
  private actT = 0;
  private actLen = 0;
  arg = 0;
  private wait = 2 + Math.random() * 4;
  /** Directions the acts don't need to write down: a step, a bounce (--bot). */
  private after: (() => void)[] = [];
  notes: Notes | null = null;
  /** The fire burning in it (the fireplace). */
  fire: Fire | null = null;
  /** Amounts fed in from outside (the library scene, the music), added to its channels
   * every frame until they're changed. */
  feed: Record<string, number> = {};
  /** Those sitting (or lying) on it: the armchair's, the cat shelf's sleepers. They may
   * walk into it. */
  readonly sitters = new globalThis.Set<Character>();

  constructor(name: string, model: Object3D) {
    this.name = name;
    this.kind = KINDS[name];
    this.model = model;
    const feels: Record<string, ReturnType<Kind['feel']>> & { default: ReturnType<Kind['feel']> } =
      {
        default: this.kind.feel(''),
      };
    model.traverse((o) => {
      if ((o as { isBone?: boolean }).isBone) feels[o.name] = this.kind.feel(o.name);
    });
    this.puppet = new Puppet(model, feels);
    this.holder.add(model);
    this.holder.visible = false;
    if (this.kind.music) this.notes = new Notes();
    if (this.kind.fire) this.fire = new Fire(this.kind.fire.candles);
    this.shadow = new Mesh(
      new PlaneGeometry(1, 1),
      new MeshBasicMaterial({
        map: shadowTexture(),
        color: 0x000000,
        transparent: true,
        depthWrite: false,
        clippingPlanes: this.planes,
      }),
    );
    this.shadow.renderOrder = -1;
  }

  /** What it puts in the scene: itself, its shadow, and its notes or its fire. */
  get parts(): Object3D[] {
    const parts: Object3D[] = [this.holder, this.shadow];
    if (this.notes) parts.push(this.notes.group);
    if (this.fire) parts.push(this.fire.group);
    return parts;
  }

  addTo(scene: Object3D) {
    scene.add(...this.parts);
  }

  dress(look: LookName) {
    this.look = look;
    this.outfit?.dispose();
    this.outfit = dress(this.model, look, { model: `set-${this.name}` });
    this.rainbow = look === 'colour';
    for (const m of this.outfit.materials) m.clippingPlanes = this.planes;
    this.kind.dressed?.(this, this.outfit.materials);
    this.notes?.dress(look);
  }

  /** A light (Dot i), 0..1, in its own colour or the one given. Kept still, it settles
   * to its level instead of flickering, unless it's `live` (a call to the reader). */
  glow(i: number, level: number, colour?: string | Color, live = false) {
    if (this.still && !live) {
      const was = this.steady.get(i) ?? level;
      level = was + (level - was) * (1 - Math.exp(-this.dt / STEADY));
      this.steady.set(i, level);
    } else this.steady.delete(i);
    this.outfit?.dot(i, clamp(level, 0, 1), colour);
  }

  /** Run after the springs have moved the bones (direct turns, shifts, stretches). */
  later(fn: () => void) {
    this.after.push(fn);
  }

  /** What an act (or the moment) is feeding the piece's motion: a named amount, 0 by default. */
  c(name: string) {
    return this.channels[name] ?? 0;
  }

  set(name: string, value: number) {
    this.channels[name] = (this.channels[name] ?? 0) + value;
  }

  // ---------- Room on the floor (Body) ----------

  floorPoint(f: Frame) {
    return { x: this.s + this.slide.y, z: this.depth * floorDepth(f) };
  }

  footprint(f: Frame) {
    const x = (this.kind.width / this.kind.metres) * this.size * f.bot * 0.5;
    return { x, z: x * this.kind.deep };
  }

  get stride() {
    return Math.abs(this.slide.v);
  }

  blocks(c: Character) {
    return this.kind.blocks && !this.hostName && this.rise > 0.3 && !this.sitters.has(c);
  }

  /** Its height in --bot. */
  get size() {
    return this.kind.size * this.scale;
  }

  heightPx(f: Frame) {
    return this.size * f.bot;
  }

  /** The top of its seat above the floor, px at the front of the box (the armchair). */
  seatPx(f: Frame) {
    return (this.kind.seat ?? 1) * this.heightPx(f);
  }

  /** Someone sits down on it (or gets up): it sighs. */
  sat(c: Character, on = true) {
    if (on) {
      this.sitters.add(c);
      this.excite = Math.max(this.excite, 0.6);
    } else this.sitters.delete(c);
  }

  // ---------- Coming and going ----------

  arrive(f: Frame, s: number, depth: number, box: { portal: Box['portal'] }) {
    this.s = s;
    this.depth = depth;
    this.rise = 0;
    this.want = 1;
    this.waiting = false;
    this.holder.visible = true;
    this.open(f, box);
  }

  leave(box: { portal: Box['portal'] }) {
    this.want = 0;
    if (this.frame) this.open(this.frame, box);
  }

  private open(f: Frame, box: { portal: Box['portal'] }) {
    // (On a shelf it comes up with the piece it stands on, through its hole.)
    if (this.hostName) return;
    const x = project(f, this.depth, { x: this.s, y: f.bottom }).x;
    const width = this.footprint(f).x * 2 * depthScale(f, this.depth);
    this.portal ??= box.portal('floor', x, this.depth, Math.max(width * 1.2, f.bot * 0.8));
    // (Still closing after it came up: it opens again.)
    this.portal.want = 1;
  }

  get gone() {
    return !this.waiting && this.want === 0 && this.rise === 0 && !this.portal;
  }

  // ---------- Reactions ----------

  /** A click: it jumps and its light flares; three quick ones and it is dizzy. */
  poke() {
    if (this.rise < 1) return;
    this.pokes = this.pokes.filter((x) => this.t - x < 1.4);
    this.pokes.push(this.t);
    this.excite = 1;
    this.squash.kick(5);
    this.kind.poke?.(this);
    const dizzy = this.pokes.length >= 3 && this.kind.acts.dizzy;
    if (dizzy) {
      this.pokes = [];
      this.perform('dizzy');
    } else if (this.kind.acts.startled) this.perform('startled');
  }

  /** Start an act now (the lab's buttons), or the piece's next. */
  perform(name: string) {
    const def = this.kind.acts[name];
    if (!def) return;
    this.act = name;
    this.actT = 0;
    this.actLen = def.length[0] + Math.random() * (def.length[1] - def.length[0]);
    this.arg = Math.random();
    def.start?.(this);
    this.wait = 1.5 + Math.random() * 4;
  }

  get repertoire() {
    return Object.keys(this.kind.acts);
  }

  private pick() {
    const names = Object.keys(this.kind.acts).filter((n) => this.kind.acts[n].weight > 0);
    let r = Math.random() * names.reduce((s, n) => s + this.kind.acts[n].weight, 0);
    for (const n of names) if ((r -= this.kind.acts[n].weight) <= 0) return n;
    return names[0];
  }

  /** The dark theme: it goes to sleep, or glows. */
  theme(dark: boolean) {
    this.dark = dark;
  }

  // ---------- Each frame ----------

  update(dt: number, env: Env) {
    const f = (this.frame = env.frame);
    this.dt = dt;
    this.peers = env.crew;
    this.t += dt;
    const host = this.hostName ? this.hostOf?.(this.hostName) : undefined;
    if (this.hostName) this.rise = host ? Math.min(host.rise, 1) : 0;
    else if (!this.portal || this.portal.open > 0.85)
      this.rise = clamp(this.rise + clamp(this.want - this.rise, -dt / 0.9, dt / 0.9), 0, 1);
    if (this.portal && this.rise === this.want) {
      this.portal.want = 0;
      if (this.portal.open <= 0) this.portal = null;
    }
    this.excite = Math.max(0, this.excite - dt / 2.5);
    this.night = this.nightSmooth.update(dt, this.dark ? 1 : 0);
    this.hover = clamp(this.hoverSmooth.update(dt, this.hovered ? 1 : 0), 0, 1);
    this.watch(dt, env);
    this.blinks(dt);

    // Its act: begins after a pause, ends when its time is up.
    if (this.act) {
      this.actT += dt;
      if (this.actT >= this.actLen) this.act = null;
    } else if (this.rise === 1 && !this.hovered && !this.still) {
      this.wait -= dt;
      if (this.wait <= 0) this.perform(this.pick());
    }
    this.channels = { ...this.feed };
    this.after = [];
    // Picked up: a little off the floor (a rug lies flat), and swaying with the move.
    if (this.taken && !this.kind.flat) this.hopTo = 0.35;
    if (this.name === 'rug') rugStep(this, env);
    this.puppet.begin();
    const def = this.act ? this.kind.acts[this.act] : null;
    if (def && this.act) {
      const e = clamp(Math.min(this.actT, this.actLen - this.actT) / 0.4, 0, 1);
      def.pose(this, this.actT, e * e * (3 - 2 * e), this.actLen);
    }
    this.kind.ambient(this, this.t, dt);
    this.puppet.update(dt);
    for (const fn of this.after) fn();
    this.slide.update(dt, this.slideTo);
    this.hop.update(dt, this.hopTo);
    this.lean.update(dt, this.leanTo);
    this.hopTo = 0;
    this.leanTo = 0;
    this.place(dt, f);
    this.notes?.update(dt, f, this);
    if (this.fire) {
      this.holder.updateMatrixWorld(true);
      this.puppet.bone('fire').getWorldPosition(firePoint);
      this.fire.update(dt, firePoint, this.holder.scale.x, this.rise > 0.8 && this.want > 0);
    }
  }

  /** Where it looks, who is near, who walks past. */
  private watch(dt: number, env: Env) {
    const f = env.frame;
    const mid = this.middle(f);
    const range = f.bot * 5;
    let want: { x: number; y: number } | null = null;
    if (env.pointer.present) want = env.pointer;
    let near: Near | null = null;
    let stir = 0;
    const mine = this.floorPoint(f);
    const fp = this.footprint(f);
    for (const c of env.crew) {
      if (c.state !== 'here' || c.edge !== 'bottom') continue;
      const b = c.bounds(f);
      const x = b.x + b.w / 2;
      const y = b.y + b.h / 2;
      const dx = x - mid.x;
      const dist = Math.hypot(dx, y - mid.y);
      if (!near || dist < near.dist) near = { x, y, dx, dist };
      if (c.free) continue;
      const p = c.floorPoint(f);
      const reach = fp.x + f.bot * 1.3;
      const away = Math.abs(p.x - mine.x) / reach;
      const behind = Math.abs(p.z - mine.z) / (floorDepth(f) * 0.3);
      if (away < 1 && behind < 1)
        stir = Math.max(stir, clamp(c.stride / (f.bot * 2.2), 0, 1) * (1 - away));
    }
    this.near = near && near.dist < range * 1.6 ? near : null;
    if (!want && this.near) want = this.near;
    // Kept still: resting, a little down, whatever goes by.
    if (this.still) [want, stir] = [null, 0];
    const tx = want
      ? clamp((want.x - mid.x) / range, -1, 1)
      : this.still
        ? 0
        : Math.sin(this.t * 0.2 + this.seed) * 0.4;
    const ty = want ? clamp((want.y - mid.y) / range, -1, 1) : this.still ? 0.3 : 0.1;
    this.gx = this.gaze[0].update(dt, tx);
    this.gy = this.gaze[1].update(dt, ty);
    this.stir = clamp(this.stirSmooth.update(dt, stir), 0, 1);
    if (this.stir > 0.35 && !this.passing) {
      this.passing = true;
      this.kind.pass?.(this);
    } else if (this.stir < 0.1) this.passing = false;
  }

  private blinks(dt: number) {
    this.nextBlink -= dt;
    if (this.nextBlink < -0.16) this.nextBlink = 2 + Math.random() * 4;
    this.blink = this.nextBlink < 0 ? Math.sin((-this.nextBlink / 0.16) * Math.PI) : 0;
  }

  /**
   * Its two eyes, if it has them: a blink (or more closed), a look about (within `range`
   * metres of where they rest) and eyes wider.
   */
  eyes(range: number, close = 0, wide = 0, gx = this.gx, gy = this.gy) {
    if (!this.puppet.has('eyeL')) return;
    const shut = clamp(Math.max(this.blink, close) + this.night * 0.55, 0, 1);
    this.later(() => {
      for (const n of ['eyeL', 'eyeR']) {
        this.puppet.shift(n, gx * range, -gy * range * 0.6, 0);
        this.puppet.stretch(n, (1 - shut * 0.88) * (1 + wide * 0.25), [0, 1, 0], 1 + wide * 0.1);
      }
    });
  }

  /** Where it is on the page: the middle of it. */
  middle(f: Frame) {
    return project(f, this.depth, {
      x: this.s + this.slide.y,
      y: f.bottom - (this.hop.y + this.lift) * f.bot - this.heightPx(f) * 0.5,
    });
  }

  private place(dt: number, f: Frame) {
    const k = depthScale(f, this.depth);
    const px = (this.heightPx(f) * k) / this.kind.metres;
    const sq = clamp(this.squash.update(dt, 0) * 0.05, -0.25, 0.25);
    this.holder.scale.set(px * (1 + sq * 0.5), px * (1 - sq), px * (1 + sq * 0.5));
    this.holder.visible = this.rise > 0 || this.want > 0;
    const host = this.hostName ? this.hostOf?.(this.hostName) : undefined;
    const up = (this.rise - 1) * (host ?? this).heightPx(f) * 1.15;
    const foot = project(f, this.depth, {
      x: this.s + this.slide.y,
      y: f.bottom - (Math.max(0, this.hop.y) + this.lift) * f.bot - up,
    });
    this.holder.position.set(foot.x, -foot.y, -this.depth * f.depth * 3);
    this.holder.rotation.z = this.lean.y * DEG;
    // Its shadow on the floor under it, fainter as it hops.
    const ground = project(f, this.depth, { x: this.s + this.slide.y, y: f.bottom });
    const lift = clamp(1 - Math.max(0, this.hop.y) / 1.6, 0.2, 1);
    this.shadow.visible = this.rise > 0.5 && !this.kind.flat && !this.hostName;
    this.shadow.material.opacity = 0.22 * lift * clamp(this.rise * 2 - 1, 0, 1);
    const width = this.footprint(f).x * 2.3 * k * (0.7 + 0.3 * lift);
    this.shadow.scale.set(width, f.depth * 0.5 * k, 1);
    this.shadow.position.set(ground.x, -ground.y, -this.depth * f.depth * 3 - width * 0.4);
    // Cut to the hole while it comes up through it (or goes down), not while it closes after.
    const edges = this.rise < 1 ? ((this.portal ?? host?.portal)?.clip() ?? []) : [];
    this.planes.slice(0, 3).forEach((plane, i) => {
      const e = edges[i];
      if (e) {
        plane.normal.set(e[0], e[1], 0);
        plane.constant = e[2];
      } else plane.constant = 1e6;
    });
    this.planes[3].normal.set(0, 1, 0);
    this.planes[3].constant = f.bottom;
  }

  /** Where to slide to once let go, if it was put down on another piece. */
  apart: number | null = null;

  /** Held: its foot goes to where the pointer has it on the floor, as far as the room
   * allows (inside the walls, short of the monitor's depth). */
  follow(f: Frame, dt = 0) {
    const h = this.taken;
    if (!h) {
      if (this.apart !== null && dt > 0) {
        this.s += (this.apart - this.s) * Math.min(1, dt * 5);
        if (Math.abs(this.apart - this.s) < 0.5) this.apart = null;
      }
      return;
    }
    this.apart = null;
    const vx = (f.left + f.right) / 2;
    const vy = horizon(f);
    const reach = Math.max(f.bottom - vy, f.depth * 4);
    const k = clamp((h.y + h.dy - vy) / (f.bottom - vy), depthScale(f, 1), 1);
    const mine = this.footprint(f);
    const far = (f.back ?? 1) - mine.z / floorDepth(f);
    const depth = clamp(((1 - k) * reach) / f.depth, this.kind.flat ? 0 : 0.05, Math.max(0.3, far));
    const kd = depthScale(f, depth);
    const margin = mine.x + f.bot * 0.2;
    this.depth = depth;
    this.s = clamp(vx + (h.x + h.dx - vx) / kd, f.left + margin, f.right - margin);
  }

  /** Its outline on the page, for clicks. */
  bounds(f: Frame) {
    const k = depthScale(f, this.depth);
    const mid = this.middle(f);
    const wd = this.footprint(f).x * 2 * k;
    let h = this.heightPx(f) * k;
    if (this.kind.flat) h = Math.max(h, this.footprint(f).z * 2 * (f.depth / floorDepth(f)) * k);
    return { x: mid.x - wd / 2, y: mid.y - h / 2 + (this.kind.flat ? 0 : 0), w: wd, h };
  }

  dispose() {
    this.outfit?.dispose();
    this.shadow.geometry.dispose();
    this.shadow.material.dispose();
    this.notes?.dispose();
    this.fire?.dispose();
    this.holder.removeFromParent();
    this.shadow.removeFromParent();
  }
}

// ---------- Music notes (the radio, the gramophone) ----------

interface Note {
  mesh: Mesh<ShapeGeometry, MeshBasicMaterial>;
  life: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hue: number;
}

/** Little notes that float up from a radio (or a gramophone's horn) and fade. */
export class Notes {
  readonly group = new Group();
  private pool: Note[] = [];
  private geometries: ShapeGeometry[];
  private look: LookName = 'ink';

  constructor() {
    const head = (x: number, y: number) => {
      const h = new Shape();
      h.absellipse(x, y, 0.32, 0.22, 0, Math.PI * 2, false, 0.4);
      return h;
    };
    const stem = (x: number) => {
      const st = new Shape();
      st.moveTo(x + 0.24, y0(x));
      st.lineTo(x + 0.34, y0(x));
      st.lineTo(x + 0.34, 1.05);
      st.lineTo(x + 0.24, 1.05);
      return st;
    };
    const y0 = (x: number) => (x > 0 ? -0.05 : 0.05);
    const flag = new Shape();
    flag.moveTo(0.34, 1.05);
    flag.lineTo(0.75, 0.7);
    flag.lineTo(0.75, 0.52);
    flag.lineTo(0.34, 0.85);
    const beam = new Shape();
    beam.moveTo(0.24, 1.05);
    beam.lineTo(1.19, 0.95);
    beam.lineTo(1.19, 0.75);
    beam.lineTo(0.24, 0.85);
    this.geometries = [
      new ShapeGeometry([head(0, 0), stem(0), flag]),
      new ShapeGeometry([head(0, 0), head(0.85, -0.1), stem(0), stem(0.85), beam]),
    ];
  }

  dress(look: LookName) {
    this.look = look;
  }

  /** A note at (x, y) px, rising. */
  spawn(x: number, y: number, bot: number, side = 0) {
    let n = this.pool.find((p) => p.life <= 0);
    if (!n) {
      if (this.pool.length >= 10) return;
      const mesh = new Mesh(
        this.geometries[0],
        new MeshBasicMaterial({ transparent: true, depthWrite: false }),
      );
      this.group.add(mesh);
      n = { mesh, life: 0, x: 0, y: 0, vx: 0, vy: 0, hue: 0 };
      this.pool.push(n);
    }
    n.life = 2.2;
    n.x = x;
    n.y = y;
    n.vx = (side + (Math.random() - 0.5)) * bot * 0.8;
    n.vy = -bot * (1.2 + Math.random() * 0.8);
    n.hue = Math.random();
    n.mesh.scale.setScalar(bot * 0.55);
    n.mesh.geometry = this.geometries[Math.floor(Math.random() * 2)];
    n.mesh.visible = true;
  }

  update(dt: number, f: Frame, piece: Piece) {
    const colour = this.look === 'paper' ? '#f4f4f1' : '#1c1c1b';
    for (const n of this.pool) {
      if (n.life <= 0) {
        n.mesh.visible = false;
        continue;
      }
      n.life -= dt;
      n.x += (n.vx + Math.sin(n.life * 4 + n.hue * 9) * f.bot * 0.4) * dt;
      n.y += n.vy * dt;
      n.vy *= 1 - dt * 0.3;
      n.mesh.position.set(n.x, -n.y, -piece.depth * f.depth * 3 + 2);
      n.mesh.material.opacity = clamp(Math.min(n.life, 2.2 - n.life + 0.4) * 1.2, 0, 1) * 0.9;
      if (piece.rainbow) n.mesh.material.color.setHSL(n.hue, 0.85, 0.55);
      else n.mesh.material.color.set(colour);
      n.mesh.rotation.z = Math.sin(n.life * 3 + n.hue * 7) * 0.25;
    }
  }

  dispose() {
    for (const n of this.pool) n.mesh.material.dispose();
    for (const g of this.geometries) g.dispose();
    this.group.removeFromParent();
  }
}

// ---------- The set ----------

/** The monitor, as the pieces keep clear of it: its x from..to in the viewport, the bottom
 * of its glass and the underside of its chin (px), how far back it stands, and its seat's x
 * from..to (nothing stands behind that). */
export interface Screen {
  x: [number, number];
  glass: number;
  under: number;
  depth: number;
  base: [number, number];
}

/** A fixed place for a piece (Set.arrange): across the box (0 its left wall, 1 its right),
 * how far back, and how tall (in --bot, else its kind's usual). */
export interface Spot {
  name: string;
  at: number;
  depth: number;
  size?: number;
  /** Stands on another piece (its name), `lift` --bot above the floor: the gramophone on a
   * case's shelf. It comes and goes with it. */
  on?: string;
  lift?: number;
}

/** The page's set pieces: which stand where, their coming and going, and their clicks. */
export class Set {
  readonly pieces: Piece[] = [];
  /** Fixed places, while a room is arranged (the library), else null: anywhere clear. */
  private spots: Map<string, Spot> | null = null;
  private loading = new globalThis.Set<string>();
  private wanted: string[] = [];
  private look: LookName = 'ink';
  private dark = false;
  private hits = new Map<Piece, HTMLElement>();
  private frame: Frame | null = null;
  private calm = false;

  /** The room kept still (the library while the book's read): each piece, and those to come
   * (Piece.still). */
  get still() {
    return this.calm;
  }

  set still(on: boolean) {
    this.calm = on;
    for (const p of this.pieces) p.still = on;
  }

  constructor(
    private scene: Object3D,
    private box: Box,
    private models: string,
    private hitLayer: HTMLElement | null,
  ) {}

  /** The pieces the crew walk round. */
  get bodies(): Body[] {
    return this.pieces;
  }

  /** The tops of the pieces standing (an armchair's seat), for a flier let go over one to
   * come down onto. */
  tops(f: Frame): Top[] {
    return this.pieces
      .filter((p) => !p.kind.flat && p.want > 0 && p.rise > 0.95)
      .map((p) => {
        const half = p.footprint(f).x * 0.6;
        return { key: p, s0: p.s - half, s1: p.s + half, depth: p.depth, h: p.seatPx(f) };
      });
  }

  get names() {
    return this.pieces.filter((p) => p.want > 0).map((p) => p.name);
  }

  piece(name: string) {
    return this.pieces.find((p) => p.name === name && p.want > 0);
  }

  /** These (by name) stand in the back; anything else standing sinks away. */
  show(names: string[], frame: Frame) {
    if (this.spots) {
      // Out of an arranged room: everything in it goes, and the page's own come up anywhere.
      this.spots = null;
      for (const p of this.pieces) if (p.want > 0) p.leave(this.box);
    }
    this.wanted = names.filter((n) => KINDS[n] && !this.away.has(n));
    for (const p of this.pieces) if (!this.wanted.includes(p.name) && p.want > 0) p.leave(this.box);
    void this.putInTurn(this.wanted, frame);
  }

  /** One after another, so the first (the page's own) has its pick of the places; those
   * that found none try again once the ones going have gone. */
  private async putInTurn(names: string[], frame: Frame) {
    const turn = ++this.turn;
    const mine = () => this.turn === turn && !this.spots;
    names.forEach((n) => void loadModel(`${this.models}set-${n}.glb`));
    const missed: string[] = [];
    for (const [i, name] of [...names].entries()) {
      if (!mine()) return;
      if (this.wanted.includes(name) && !(await this.put(name, frame, 500 + i * 450)))
        missed.push(name);
    }
    if (!missed.length) return;
    await new Promise((ok) => setTimeout(ok, 1600));
    for (const name of missed)
      if (mine() && this.wanted.includes(name)) await this.put(name, this.frame ?? frame);
  }
  /** Which room's pieces are coming up (a new room, or an arranged one, ends the last). */
  private turn = 0;

  /**
   * A room: these pieces at these places, the rest sink away. Those standing that are
   * wanted sink too and come up again in their place (at their size), all in turn, `gap`
   * ms apart after `delay`.
   */
  arrange(spots: Spot[], frame: Frame, delay = 300, gap = 380) {
    this.turn++;
    this.spots = new Map(
      spots.filter((s) => KINDS[s.name] && !this.away.has(s.name)).map((s) => [s.name, s]),
    );
    this.wanted = [...this.spots.keys()];
    for (const p of this.pieces) {
      if (p.waiting) {
        p.cancelled = true;
        p.waiting = false;
      } else if (p.want > 0) p.leave(this.box);
    }
    this.wanted.forEach((name, i) => void this.put(name, frame, delay + i * gap));
  }

  /** Is a room arranged? */
  get arranged() {
    return this.spots !== null;
  }

  /** One more piece (or its return), without sending the others away; `near` is where to
   * try first (the spot of a piece it takes over from). */
  async put(name: string, frame: Frame, delay = 0, near?: Piece) {
    if (!KINDS[name]) return null;
    if (!this.wanted.includes(name)) this.wanted.push(name);
    // Already standing, or placed and waiting for its turn to come up.
    const there = this.pieces.find((p) => p.name === name);
    if (there && (there.want > 0 || there.waiting)) return there;
    if (this.loading.has(name)) return null;
    this.loading.add(name);
    this.frame = frame;
    const model = await loadModel(`${this.models}set-${name}.glb`);
    this.loading.delete(name);
    if (!this.wanted.includes(name)) return null;
    const piece = new Piece(name, model);
    piece.still = this.calm;
    piece.dress(this.look);
    piece.theme(this.dark);
    const fixed = this.spots?.get(name);
    if (fixed?.size) piece.scale = fixed.size / piece.kind.size;
    if (fixed?.on) {
      piece.hostName = fixed.on;
      piece.hostOf = (n) => this.piece(n);
      piece.lift = fixed.lift ?? 0;
    }
    const spot = fixed
      ? { s: frame.left + (frame.right - frame.left) * fixed.at, depth: fixed.depth }
      : this.place(piece, frame, near);
    if (!spot) {
      piece.dispose();
      return null;
    }
    piece.addTo(this.scene);
    this.warm?.(piece.parts);
    this.pieces.push(piece);
    this.hitArea(piece);
    setTimeout(() => {
      if (this.wanted.includes(name) && this.frame && !piece.cancelled)
        piece.arrive(this.frame, spot.s, spot.depth, this.box);
      else piece.waiting = false;
    }, delay);
    return piece;
  }

  /** Compile a new piece's shaders while it waits out of sight to come up (else the frame
   * it first shows in stalls on them). */
  warm: ((parts: Object3D[]) => void) | null = null;

  /** A piece was clicked (after it has jumped): the room may want to know (the gramophone is
   * the library's sound switch). */
  onPoke: ((p: Piece) => void) | null = null;

  /** A right-click (or a long press) on a piece: the page may offer it a menu (its acts),
   * and says whether it did. */
  onMenu: ((p: Piece, at: { x: number; y: number }) => boolean) | null = null;

  /** What the pieces keep from hiding or being hidden by, in the viewport (the monitor). */
  clear: ((f: Frame) => Screen | null) | null = null;

  /** A clear place along the back: clear of the others, of the doors and of the monitor
   * (clear), unless it is short enough to show under it or, in front, below its glass. */
  private place(piece: Piece, f: Frame, near?: Piece) {
    const mine = piece.footprint(f);
    // Along the back, but all of it in front of the monitor (the frame's `back`): the ones
    // that stand furthest back still do, only that much further forward.
    const shift = Math.max(0, piece.kind.depth[1] - ((f.back ?? 1) - mine.z / floorDepth(f)));
    const [lo, hi] = piece.kind.depth.map((d) => Math.max(0.3, d - shift));
    const doors = this.box.doors.filter((d) => d.kind === 'back');
    const sides = this.box.doors.filter((d) => d.kind === 'left' || d.kind === 'right');
    const hatches = this.box.doors.filter((d) => d.kind === 'floor');
    const vx = (f.left + f.right) / 2;
    const back = depthScale(f, 1);
    // The side of the room with fewer standing on it first (or they can all end up on one).
    const standing = this.pieces.filter((o) => o !== near && o.want > 0 && !o.kind.flat);
    const lefts = standing.filter((o) => o.s < vx).length;
    const side = piece.kind.flat ? 0 : Math.sign(lefts * 2 - standing.length);
    for (let attempt = 0; attempt < 60; attempt++) {
      const margin = mine.x + f.bot * 0.4;
      if (f.right - f.left < margin * 2) return null;
      // First where the one it replaces stood (as near as fits), then anywhere (on the
      // emptier side, for a while).
      const depth =
        near && attempt < 3 ? clamp(near.depth, lo, hi) : lo + Math.random() * (hi - lo);
      const [a, b] =
        side && attempt < 40
          ? side > 0
            ? [vx, f.right - margin]
            : [f.left + margin, vx]
          : [f.left + margin, f.right - margin];
      const s =
        near && attempt < 3
          ? clamp(near.s + (attempt - 1) * mine.x, f.left + margin, f.right - margin)
          : a + Math.random() * Math.max(0, b - a);
      const k = depthScale(f, depth);
      const x = vx + (s - vx) * k;
      const clearOfDoor =
        doors.every(
          (d) =>
            depth < 0.72 || Math.abs(x - (vx + (d.x - vx) * back)) > (mine.x + d.size.w * 0.6) * k,
        ) &&
        // By a side wall, out of the way in or out of its door.
        sides.every(
          (d) =>
            Math.abs(d.x - s) > mine.x + f.bot * 1.6 ||
            Math.abs(depth - d.depth) > d.size.span / 2 + 0.1,
        ) &&
        // Not on a hatch in the floor.
        hatches.every(
          (d) =>
            Math.abs(d.x - s) > mine.x + d.size.w * 0.6 ||
            Math.abs(depth - d.depth) > d.size.span / 2 + 0.1,
        );
      const hid = this.clear?.(f);
      if (hid && !piece.kind.flat && x + mine.x * k > hid.x[0] && x - mine.x * k < hid.x[1]) {
        // In front of it (never behind), a piece shows only if it hides no more than its chin
        // and seat; close in front, beside its seat, not in it.
        const top = project(f, depth, { x: s, y: f.bottom }).y - piece.heightPx(f) * k;
        const fits =
          top > hid.glass + f.bot * 0.08 &&
          (depth < hid.depth - 0.2 || x + mine.x * k < hid.base[0] || x - mine.x * k > hid.base[1]);
        if (!fits) continue;
      }
      const clear = this.pieces.every((o) => {
        if (o === near || (o.want === 0 && o.rise === 0)) return true;
        if (o.kind.flat || piece.kind.flat)
          return o.kind.flat && piece.kind.flat ? Math.abs(o.s - s) > mine.x * 1.5 : true;
        // Clear as seen (not just in depth): one standing behind another still hides it.
        const r = o.footprint(f);
        const ox = vx + (o.s - vx) * depthScale(f, o.depth);
        return Math.abs(ox - x) > mine.x * k + r.x * depthScale(f, o.depth) + f.bot * 0.3;
      });
      if (clearOfDoor && clear) return { s, depth };
    }
    return null;
  }

  /** Where a piece just put down should slide to so it doesn't stand on another (as seen):
   * the nearest clear place along the floor at its depth, or null if it's clear already. */
  private room(p: Piece, f: Frame): number | null {
    if (p.kind.flat) return null;
    const vx = (f.left + f.right) / 2;
    const k = depthScale(f, p.depth);
    const mine = p.footprint(f);
    const others = this.pieces.filter((o) => o !== p && !o.kind.flat && o.want > 0 && o.rise > 0.5);
    const screen = (s: number) => vx + (s - vx) * k;
    const hits = (s: number) =>
      others.some((o) => {
        const ko = depthScale(f, o.depth);
        const ox = vx + (o.s - vx) * ko;
        return Math.abs(ox - screen(s)) < mine.x * k + o.footprint(f).x * ko + f.bot * 0.2;
      });
    if (!hits(p.s)) return null;
    const margin = mine.x + f.bot * 0.2;
    const [lo, hi] = [f.left + margin, f.right - margin];
    let best: number | null = null;
    for (let d = f.bot * 0.2; d < f.right - f.left; d += f.bot * 0.2)
      for (const s of [p.s - d, p.s + d])
        if (s >= lo && s <= hi && !hits(s) && best === null) best = s;
    return best;
  }

  dress(look: LookName) {
    this.look = look;
    this.pieces.forEach((p) => p.dress(look));
  }

  /** The page's theme: in the dark they sleep or glow. */
  theme(dark: boolean) {
    this.dark = dark;
    this.pieces.forEach((p) => p.theme(dark));
  }

  poke(name: string) {
    this.piece(name)?.poke();
  }

  /** A double click: that piece sinks away and one the box hasn't got comes up in its place
   * (the first, in a random order, that fits). */
  /** Pieces put away for good (three quick clicks, or the switchboard): no page or room
   * puts them out again till one is put out by name. */
  away = new globalThis.Set<string>();
  /** Which are put away changed (the site remembers it). */
  onAway: (() => void) | null = null;

  /** Put this one away for good: it sinks, and stays away. */
  putAway(name: string) {
    this.away.add(name);
    this.wanted = this.wanted.filter((n) => n !== name);
    this.spots?.delete(name);
    for (const p of this.pieces) {
      if (p.name !== name) continue;
      if (p.waiting) {
        p.cancelled = true;
        p.waiting = false;
      } else if (p.want > 0) p.leave(this.box);
    }
    this.onAway?.();
  }

  /** Put this one out (back from away, if it was). */
  putOut(name: string, frame: Frame) {
    if (this.away.delete(name)) this.onAway?.();
    return this.put(name, frame);
  }

  async swap(p: Piece) {
    const frame = this.frame;
    // (An arranged room stays as it is.)
    if (!frame || p.want === 0 || this.spots) return;
    const out = SET.filter(
      (n) =>
        !this.wanted.includes(n) &&
        !this.away.has(n) &&
        !this.loading.has(n) &&
        !this.pieces.some((o) => o.name === n),
    ).sort(() => Math.random() - 0.5);
    this.wanted = this.wanted.filter((n) => n !== p.name);
    p.leave(this.box);
    for (const next of out) {
      if (await this.put(next, frame, 1100, p)) return;
      this.wanted = this.wanted.filter((n) => n !== next);
    }
  }

  update(dt: number, env: Env) {
    this.frame = env.frame;
    const f = env.frame;
    // An arranged room keeps its places as the window changes.
    if (this.spots)
      for (const p of this.pieces) {
        const spot = this.spots.get(p.name);
        if (spot && p.want > 0) p.s = f.left + (f.right - f.left) * spot.at;
      }
    for (const p of this.pieces) {
      if (p.taken && (p.want === 0 || p.rise < 1)) p.taken = null;
      p.follow(f, dt);
      p.update(dt, env);
      if (p.want === 0 && p.rise === 0 && p.portal && p.portal.open <= 0) p.portal = null;
    }
    this.pieces.splice(
      0,
      this.pieces.length,
      ...this.pieces.filter((p) => {
        if (!p.gone) return true;
        this.hits.get(p)?.remove();
        this.hits.delete(p);
        p.dispose();
        return false;
      }),
    );
    for (const [p, el] of this.hits) {
      if (p.rise < 0.5) {
        el.style.display = 'none';
        continue;
      }
      const b = p.bounds(env.frame);
      el.style.display = 'block';
      el.style.transform = `translate(${b.x}px, ${b.y}px)`;
      el.style.width = `${b.w}px`;
      el.style.height = `${b.h}px`;
    }
  }

  private hitArea(p: Piece) {
    if (!this.hitLayer || p.kind.inert) return;
    const el = document.createElement('div');
    el.className = 'robot-hit robot-set';
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText =
      'position:absolute;left:0;top:0;pointer-events:auto;cursor:pointer;display:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;';
    el.addEventListener('pointerenter', () => (p.hovered = true));
    el.addEventListener('pointerleave', () => (p.hovered = false));
    onMenu(el, (at) => !!this.onMenu?.(p, at));
    // Pressed on and held (or dragged): picked up and carried about the floor till it's
    // let go; the click that ends it does nothing else. (An arranged room keeps its places.)
    let press: { id: number; x: number; y: number; timer: number } | null = null;
    let took = false;
    const takeUp = (id: number, at: { x: number; y: number }) => {
      if (press) clearTimeout(press.timer);
      press = null;
      const f = this.frame;
      if (!f || this.spots || p.taken || p.rise < 1 || p.want === 0) return;
      const foot = project(f, p.depth, { x: p.s, y: f.bottom });
      p.taken = { x: at.x, y: at.y, dx: foot.x - at.x, dy: foot.y - at.y };
      took = true;
      p.poke();
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
      p.slideTo = 0;
      if (this.frame) p.apart = this.room(p, this.frame);
      el.style.cursor = 'pointer';
    };
    el.addEventListener('pointerdown', (e) => {
      took = false;
      if (e.button !== 0 || this.spots) return;
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
    // A click pokes it; a second one straight after swaps it for another, unless a third
    // comes as quickly, which puts it away for good.
    let clicks: number[] = [];
    let swapping = 0;
    el.addEventListener('click', (e) => {
      if (took) {
        took = false;
        return;
      }
      clicks = [...clicks.filter((t) => e.timeStamp - t < DOUBLE * 2), e.timeStamp];
      clearTimeout(swapping);
      if (clicks.length >= 3) {
        clicks = [];
        return this.putAway(p.name);
      }
      if (clicks.length === 2) {
        swapping = window.setTimeout(() => {
          clicks = [];
          void this.swap(p);
        }, DOUBLE);
        return;
      }
      p.poke();
      this.onPoke?.(p);
    });
    this.hitLayer.appendChild(el);
    this.hits.set(p, el);
  }

  dispose() {
    this.pieces.forEach((p) => p.dispose());
    this.hits.forEach((el) => el.remove());
  }
}
