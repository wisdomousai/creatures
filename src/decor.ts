import {
  Color,
  CylinderGeometry,
  Group,
  type Material,
  Mesh,
  type Object3D,
  Plane,
  Vector3,
} from 'three';
import { type Box, type Door, depthScale, floorDepth, horizon, project } from './box';
import { type Character, clamp, type Env, type Frame, loadModel, type Top } from './character';
import { dress, type LookName, type Outfit } from './looks';
import { type Feel, Puppet } from './puppet';
import { DRAG, HOLD, holdSelection } from './press';
import { DOUBLE } from './set';

/**
 * The things that hang from the box's ceiling: a mobile, a pendant lamp, a mirror ball,
 * a swing, and so on (blender/decor.py). Each page has its own few; when the page
 * changes, the old ones are drawn up into the ceiling through a hole that opens and
 * closes, and the new ones let down.
 *
 * Each hangs on a thread from a point on the ceiling and swings on it: a pendulum, pushed
 * by the mouse brushing past and by whoever flies into it, never quite still. Its loose
 * parts (a mobile's charms, a chime's tubes, a planter's vines) hang plumb on springs, so
 * they trail its swing. And each has a little life of its own: the mobile turns, the ball
 * glints, the chime lights where it's struck. A click sets it going.
 */

const DEG = 180 / Math.PI;
/** How far a swing's ropes bow behind it (radians, per hanging). */
const bows = new WeakMap<Hanging, number>();
/** Gravity, in --bot per second²: a pendulum 2 --bot long swings once in about 1.8 s. */
const G = 24;

type Play = (h: Hanging, t: number, dt: number) => void;

interface Kind {
  /** Hook to bottom, and across, in the model's metres (decor.py's height and width). */
  metres: number;
  width: number;
  /** Its height on the page, in --bot. */
  size: number;
  /** The thread it hangs on, in --bot, picked between the two (0: it has its own). */
  thread: [number, number];
  /** Parts that hang plumb, trailing its swing, and how springy they are. */
  dangle?: Record<string, Feel>;
  /** Hangs from two rings: swung across the page its ropes turn about their own tops (the
   * kind's play moves them) instead of the whole thing turning about its middle. */
  parallel?: boolean;
  /** How quickly its swinging dies away (a damping ratio; 0.05 unless it's heavy). */
  damp?: number;
  /** Its own life, each frame: nudges to its springs' targets first (sway), then direct
   * turns and lights after the springs have moved (play). */
  sway?: Play;
  play?: Play;
}

const charm: Feel = { f: 1.1, zeta: 0.22 };
const vine: Feel = { f: 0.8, zeta: 0.3 };

const KINDS: Record<string, Kind> = {
  pendant: {
    metres: 0.292,
    width: 0.35,
    size: 1.3,
    thread: [1.2, 2.2],
    dangle: { shade: { f: 1.5, zeta: 0.4 } },
    // A slow half-turn to and fro on its cord.
    sway: (h, t) => h.puppet.add('shade', 0, 6 * Math.sin(t * 0.5 + h.seed), 0),
    play: (h, t) => h.light(0, 1 - h.excite * 0.7 * flicker(t * 23)),
  },
  mobile: {
    metres: 0.36,
    width: 0.56,
    size: 2,
    thread: [0.6, 1.4],
    dangle: { charmA1: charm, charmA2: charm, charmB1: charm, charmB2: charm },
    play: (h, t, dt) => {
      h.spin += dt * (0.3 + h.excite * 2.5);
      h.puppet.swing('armA', h.spin * DEG);
      h.puppet.swing('armB', -h.spin * 1.7 * DEG);
      h.light(0, 0.55 + 0.45 * Math.sin(t * 2.6 + h.seed));
    },
  },
  disco: {
    metres: 0.31,
    width: 0.27,
    size: 1.25,
    thread: [1.4, 2.6],
    play: (h, t, dt) => {
      h.spin += dt * (0.5 + h.excite * 4);
      h.puppet.swing('ball', h.spin * DEG);
      for (let i = 0; i < 6; i++) {
        const glint = Math.max(0, Math.sin(t * (2.1 + h.excite * 5) + i * 1.9 + h.seed)) ** 10;
        h.light(i, glint, h.rainbow ? hue((t * 0.2 + i / 6) % 1) : undefined);
      }
    },
  },
  swing: {
    metres: 0.645,
    width: 0.52,
    size: 2.6,
    thread: [0, 0],
    // Swung across the page it is a parallelogram: each rope turns about its own ring in the
    // ceiling, the seat travels along the arc and stays level (the whole of it turns only
    // front to back, about the line through the two rings).
    parallel: true,
    // A plank on two ropes: heavy, it swings a few times and settles.
    damp: 0.22,
    // The seat twists a hair on its ropes (any more and it would leave their ends).
    sway: (h, t) => h.puppet.add('seat', 0, 1.2 * Math.sin(t * 0.6 + h.seed) * (1 + h.excite), 0),
    play: (h, _t, dt) => {
      // Each rope in three lengths: the middle trails behind as it swings (and flicks over
      // when it turns back), and the seat rides where the rope ends, so it comes up a little.
      const a = h.across;
      const was = bows.get(h) ?? 0;
      const b = was + (clamp(-0.07 * h.acrossSpeed, -0.16, 0.16) - was) * Math.min(1, dt * 5);
      bows.set(h, b);
      const reach = 0.58;
      const end = (reach / 3) * (1 + 2 * Math.cos(b));
      for (const r of ['ropeL', 'ropeR']) {
        h.puppet.turn(`${r}1`, 0, 0, (a + b) * DEG);
        h.puppet.turn(`${r}2`, 0, 0, -b * DEG);
        h.puppet.turn(`${r}3`, 0, 0, -b * DEG);
      }
      h.puppet.shift('seat', end * Math.sin(a), reach - end * Math.cos(a), 0);
    },
  },
  lantern: {
    metres: 0.365,
    width: 0.24,
    size: 1.4,
    thread: [0.8, 1.8],
    dangle: { body: { f: 1.2, zeta: 0.5 }, tassel: { f: 1.3, zeta: 0.2 } },
    sway: (h, t) =>
      h.puppet.add('tassel', 0, 0, 5 * Math.sin(t * 1.3 + h.seed) * (1 + h.excite * 2)),
    play: (h, t) =>
      h.light(0, 0.8 + 0.2 * flicker(t * 3 + h.seed) - h.excite * 0.3 * flicker(t * 17)),
  },
  chime: {
    metres: 0.405,
    width: 0.2,
    size: 1.7,
    thread: [0.6, 1.4],
    dangle: {
      tube0: { f: 1.7, zeta: 0.1 },
      tube1: { f: 1.9, zeta: 0.1 },
      tube2: { f: 1.6, zeta: 0.1 },
      tube3: { f: 2.1, zeta: 0.1 },
      tube4: { f: 1.8, zeta: 0.1 },
      clapper: { f: 1.2, zeta: 0.18 },
      sail: { f: 0.9, zeta: 0.2 },
    },
    sway: (h, t) => h.puppet.add('sail', 0, 12 * Math.sin(t * 1.1 + h.seed), 4 * Math.sin(t * 0.8)),
    play: (h, _t, dt) => {
      // A tube swinging out of line with the clapper has struck it: it lights, and fades.
      const [cp, , cr] = h.puppet.current('clapper');
      for (let i = 0; i < 5; i++) {
        const [p, , r] = h.puppet.current(`tube${i}`);
        const apart = Math.hypot(p - cp, r - cr);
        h.rings[i] = Math.max(h.rings[i] - dt * 1.6, apart > 5 ? Math.min(1, (apart - 5) / 4) : 0);
        h.light(i, h.rings[i], h.rainbow ? hue(i / 5) : undefined);
      }
    },
  },
  orrery: {
    metres: 0.275,
    width: 0.5,
    size: 1.6,
    thread: [0.5, 1.2],
    play: (h, t, dt) => {
      h.spin += dt * (1 + h.excite * 4);
      h.puppet.swing('arm1', h.spin * 55);
      h.puppet.swing('arm2', h.spin * 34 + 120);
      h.puppet.swing('arm3', h.spin * 21 + 250);
      h.light(0, 0.75 + 0.25 * Math.sin(t * 1.7 + h.seed));
    },
  },
  planter: {
    metres: 0.6,
    width: 0.3,
    size: 2.2,
    thread: [0.4, 1],
    dangle: {
      vine0a: vine,
      vine0b: vine,
      vine1a: vine,
      vine1b: vine,
      vine2a: vine,
      vine2b: vine,
      vine3a: vine,
      vine3b: vine,
    },
    sway: (h, t) => {
      // A breath of air through the leaves.
      for (let i = 0; i < 4; i++)
        h.puppet.add(
          `vine${i}b`,
          0,
          0,
          3 * Math.sin(t * 0.9 + i * 1.3 + h.seed) * (1 + h.excite * 3),
        );
    },
  },
  plane: {
    metres: 0.2,
    width: 0.45,
    size: 1.1,
    thread: [1, 2],
    dangle: { plane: { f: 1.3, zeta: 0.4 } },
    // It banks into its turn and bobs on its cord.
    sway: (h, t) =>
      h.puppet.add('plane', 3 * Math.sin(t * 1.7 + h.seed), 0, -9 + 2 * Math.sin(t * 0.9)),
    play: (h, t, dt) => {
      h.spin += dt * (1.1 + h.excite * 3);
      h.puppet.swing('arm', h.spin * DEG);
      h.puppet.turn('prop', 0, 0, (t * 1400) % 360);
      h.light(0, Math.sin(t * 5) > 0.6 ? 1 : 0.15);
    },
  },
};

/** Which decorations each page has, until the site says otherwise. */
export const PAGES: Record<string, string[]> = {
  home: ['mobile', 'pendant'],
  writing: ['lantern', 'planter'],
  'work-with-me': ['pendant', 'chime'],
  work: ['orrery', 'plane'],
  about: ['swing', 'chime'],
  contact: ['disco', 'lantern'],
  creatures: ['mobile', 'swing'],
  'creatures/cats': ['mobile', 'lantern'],
  'creatures/dogs': ['plane', 'pendant'],
  'creatures/birds': ['swing', 'chime'],
};

export const DECOR = Object.keys(KINDS);

export class Hanging {
  readonly name: string;
  readonly kind: Kind;
  readonly holder = new Group();
  private swinger = new Group();
  private thread: Mesh<CylinderGeometry, Material>;
  readonly model: Object3D;
  readonly puppet: Puppet;
  private outfit: Outfit | null = null;
  /** Across the front of the box (0..1) and back into it (0..1). */
  at = 0.5;
  depth = 0.5;
  /** Its thread, in --bot. */
  length: number;
  /** 0 drawn up into the ceiling, 1 hung; and where it's going. */
  down = 0;
  want = 0;
  /** The pendulum: across the page and front to back (radians), and how fast. */
  private angle = [0, 0];
  private speed = [0, 0];
  /** Set going (a click, a bump): 1, fading. */
  excite = 0;
  spin = 0;
  rings = [0, 0, 0, 0, 0];
  readonly seed = Math.random() * 100;
  rainbow = false;
  /** The hole it goes through, while it does. */
  portal: Door | null = null;
  private planes = Array.from({ length: 3 }, () => new Plane(new Vector3(0, 1, 0), 1e6));
  private box: Box;
  /** Held by the pointer (viewport px): its hook stays where it is on the ceiling and the
   * thread swings to wherever the pointer pulls it. */
  taken: { x: number; y: number } | null = null;

  constructor(name: string, model: Object3D, box: Box) {
    this.name = name;
    this.kind = KINDS[name];
    this.model = model;
    this.box = box;
    this.puppet = new Puppet(model, { ...this.kind.dangle, default: { f: 2, zeta: 0.7 } });
    const [lo, hi] = this.kind.thread;
    this.length = lo + Math.random() * (hi - lo);
    this.thread = new Mesh(new CylinderGeometry(1, 1, 1, 6, 1, true));
    this.thread.visible = this.kind.thread[1] > 0;
    this.swinger.add(this.thread, model);
    this.holder.add(this.swinger);
    this.holder.visible = false;
  }

  dress(look: LookName) {
    this.outfit?.dispose();
    this.outfit = dress(this.model, look, { model: `decor-${this.name}` });
    this.rainbow = look === 'colour';
    for (const m of this.outfit.materials) m.clippingPlanes = this.planes;
    // The thread in the joints' colour.
    this.model.traverse((obj) => {
      const mesh = obj as Mesh;
      if (mesh.isMesh && /^Joint/.test(mesh.userData.role ?? ''))
        this.thread.material = mesh.material as Material;
    });
  }

  light(i: number, level: number, colour?: string | Color) {
    this.outfit?.dot(i, clamp(level, 0, 1), colour);
  }

  /** Swing it: a shove across the page and toward the back, in px/s. */
  push(vx: number, vz = 0) {
    const f = this.frame;
    if (!f) return;
    // (A heavy one, that settles fast, takes as much more to set going.)
    const len = (this.reach(f) + this.heightPx(f) * 0.5) * ((this.kind.damp ?? 0.05) / 0.05);
    this.speed[0] = clamp(this.speed[0] + vx / Math.max(len, f.bot) / 2, -4, 4);
    this.speed[1] = clamp(this.speed[1] + vz / Math.max(len, f.bot) / 2, -3, 3);
  }

  /** A click: set it going. */
  poke() {
    this.excite = 1;
    this.push((Math.random() < 0.5 ? -1 : 1) * (this.frame?.bot ?? 30) * 6);
    for (const bone of Object.keys(this.kind.dangle ?? {}))
      this.puppet.kick(bone, (Math.random() - 0.5) * 300, 0, (Math.random() - 0.5) * 300);
  }

  private frame: Frame | null = null;

  /** How far it is swung across the page (radians). */
  get across() {
    return this.angle[0];
  }

  /** How fast it is swinging across (radians a second). */
  get acrossSpeed() {
    return this.speed[0];
  }

  /** Px per --bot where it hangs (things further back are smaller). */
  private bot(f: Frame) {
    return f.bot * depthScale(f, this.depth);
  }

  heightPx(f: Frame) {
    return this.kind.size * this.bot(f);
  }

  widthPx(f: Frame) {
    return (this.kind.width / this.kind.metres) * this.heightPx(f);
  }

  /** Where its thread meets the ceiling, in viewport px. */
  hook(f: Frame) {
    return project(f, this.depth, { x: f.left + (f.right - f.left) * this.at, y: f.top });
  }

  /** How far below the ceiling its hook is, in px: less than 0 while up in the ceiling. */
  private reach(f: Frame) {
    const u = this.down * this.down * (3 - 2 * this.down);
    const up = -this.heightPx(f) - 2;
    return up + (this.length * this.bot(f) - up) * u;
  }

  /** Held: swung out to the pointer (the pendulum's angle follows it, within reason), and
   * let go with the speed it was going, so it swings on from there. */
  private follow(dt: number, f: Frame) {
    const h = this.taken;
    if (!h) return;
    const hook = this.hook(f);
    const pull = Math.hypot(h.x - hook.x, h.y - hook.y);
    // Straight down while the pointer is up by the hook, where the angle means nothing.
    const to = pull < f.bot * 0.5 ? 0 : clamp(Math.atan2(h.x - hook.x, h.y - hook.y), -1.2, 1.2);
    const was = this.angle[0];
    this.angle[0] += (to - was) * Math.min(1, dt * 12);
    this.speed[0] = dt > 0 ? clamp((this.angle[0] - was) / dt, -4, 4) : 0;
    this.angle[1] *= Math.exp(-6 * dt);
    this.speed[1] = 0;
  }

  update(dt: number, t: number, frame: Frame) {
    this.frame = frame;
    if (this.taken && this.down < 1) this.taken = null;
    this.follow(dt, frame);
    this.down = clamp(this.down + clamp(this.want - this.down, -dt / 1.4, dt / 1.4), 0, 1);
    this.excite = Math.max(0, this.excite - dt / 3);
    // The pendulum, with a breath of air so it's never quite still.
    const len =
      Math.max(this.reach(frame) + this.heightPx(frame) * 0.5, frame.bot * 0.5) / frame.bot;
    const w = Math.sqrt(G / len);
    for (const i of this.taken ? [] : [0, 1]) {
      const air = 0.05 * Math.sin(t * (0.37 + i * 0.21) + this.seed * (i + 1));
      const accel =
        -w * w * Math.sin(this.angle[i]) - 2 * (this.kind.damp ?? 0.05) * w * this.speed[i] + air;
      this.speed[i] += accel * dt;
      this.angle[i] += this.speed[i] * dt;
    }
    this.place(frame);
    // Loose parts hang plumb and trail the swing; then each its own life.
    this.puppet.begin();
    for (const bone of Object.keys(this.kind.dangle ?? {}))
      this.puppet.add(bone, -this.angle[1] * DEG, 0, -this.angle[0] * DEG);
    this.kind.sway?.(this, t, dt);
    this.puppet.update(dt);
    this.kind.play?.(this, t, dt);
  }

  private place(f: Frame) {
    const hook = this.hook(f);
    const px = this.heightPx(f) / this.kind.metres;
    const reach = this.reach(f);
    this.holder.visible = this.down > 0 || this.want > 0;
    this.holder.position.set(hook.x, -hook.y, -this.depth * f.depth * 3);
    this.holder.scale.setScalar(px);
    this.swinger.rotation.set(this.angle[1], 0, this.kind.parallel ? 0 : this.angle[0]);
    this.model.position.y = -reach / px;
    const thick = 0.6 / px;
    this.thread.visible = this.kind.thread[1] > 0 && reach > 0;
    this.thread.scale.set(thick, Math.max(reach, 0.01) / px, thick);
    this.thread.position.y = -Math.max(reach, 0) / px / 2;
    // Through its hole while any of it's still up in the ceiling; then nothing in the way
    // (not the hole closing over its thread, nor opening while it's still all down here).
    const edges = this.portal && reach < 0 ? this.portal.clip() : [];
    this.planes.forEach((plane, i) => {
      const e = edges[i];
      if (e) {
        plane.normal.set(e[0], e[1], 0);
        plane.constant = e[2];
      } else plane.constant = 1e6;
    });
    if (!this.portal && this.down < 1) {
      // Still (or already) up in the ceiling: hidden above it.
      this.planes[0].normal.set(0, -1, 0);
      this.planes[0].constant = -hook.y;
    }
  }

  /** Its outline on the page now, for clicks and bumps. */
  bounds(f: Frame) {
    const hook = this.hook(f);
    const h = this.heightPx(f);
    const w = this.widthPx(f);
    const d = this.reach(f) + h / 2;
    const cx = hook.x + Math.sin(this.angle[0]) * d;
    const cy = hook.y + Math.cos(this.angle[0]) * d;
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }

  /** Where a bird can sit on it (a share of its body down from the top, at its middle), for
   * those that have somewhere to: a swing's seat, a planter's rim, a mobile's arm, else its
   * top. */
  perch(f: Frame): Top | null {
    if (this.down < 1 || this.want === 0) return null;
    const b = this.bounds(f);
    const share =
      ({ swing: 0.9, planter: 0.2, mobile: 0.12, plane: 0.4 } as Record<string, number>)[
        this.name
      ] ?? 0;
    const k = depthScale(f, this.depth);
    const vx = (f.left + f.right) / 2;
    const vy = horizon(f);
    const x = b.x + b.w / 2;
    const floorY = vy + (b.y + b.h * share - vy) / k;
    const half = (b.w * 0.3) / k;
    const s = vx + (x - vx) / k;
    return {
      key: this,
      s0: s - half,
      s1: s + half,
      depth: this.depth,
      h: f.bottom - floorY,
      at: s,
    };
  }

  /** Let it down into the room through a hole that opens for it. */
  lower() {
    this.want = 1;
    this.leaving = false;
    this.open();
  }

  /** Draw it up into the ceiling; gone when it's there. */
  raise() {
    this.want = 0;
    this.leaving = true;
    this.open();
  }

  /** Asked to go (and not asked back since). */
  private leaving = false;

  private open() {
    if (!this.frame) return;
    this.portal ??= this.box.portal(
      'ceiling',
      this.hook(this.frame).x,
      this.depth,
      this.widthPx(this.frame) * 1.15,
    );
  }

  /** Close the hole once it's through. */
  settle() {
    if (this.portal && this.down === this.want) {
      this.portal.want = 0;
      if (this.portal.open <= 0) this.portal = null;
    }
  }

  get gone() {
    return this.leaving && this.down === 0 && !this.portal;
  }

  dispose() {
    this.outfit?.dispose();
    this.thread.geometry.dispose();
    this.holder.removeFromParent();
  }
}

/** The page's decorations: which hang where, their coming and going, and their pushes. */
export class Decor {
  private hung: Hanging[] = [];
  private loading = new Set<string>();
  private wanted: string[] = [];
  private look: LookName = 'ink';
  private last = new Map<object, { x: number; y: number }>();
  private hits = new Map<Hanging, HTMLElement>();
  private frame: Frame | null = null;

  constructor(
    private scene: Object3D,
    private box: Box,
    private models: string,
    private hitLayer: HTMLElement | null,
    /** The page's content in viewport px (its column, and where it starts), to keep clear
     * of: a decoration hangs beside it, or above it if it ends before the content starts. */
    private clear: () => Column | null = () => null,
  ) {}

  get names() {
    return this.hung.filter((h) => h.want > 0).map((h) => h.name);
  }

  /** Hang these (by name); anything else hanging goes back up. */
  show(names: string[], frame: Frame) {
    this.frame = frame;
    this.wanted = names.filter((n) => KINDS[n]);
    for (const h of this.hung) if (!this.wanted.includes(h.name)) h.raise();
    // Let the new ones down a moment after the old ones start up.
    this.wanted.forEach((name, i) => {
      const there = this.hung.find((h) => h.name === name);
      if (there) {
        if (there.want === 0) there.lower();
        return;
      }
      this.hang(name, frame, 500 + i * 450);
    });
  }

  /** Let one down, after `delay` ms; `near` is where to try first (one it takes over from). */
  private hang(name: string, frame: Frame, delay: number, near?: Hanging) {
    if (this.loading.has(name)) return;
    this.loading.add(name);
    void loadModel(`${this.models}decor-${name}.glb`).then((model) => {
      this.loading.delete(name);
      if (!this.wanted.includes(name)) return;
      const h = new Hanging(name, model, this.box);
      h.dress(this.look);
      if (!this.place(h, frame, near)) return h.dispose();
      this.scene.add(h.holder);
      this.hung.push(h);
      this.hitArea(h);
      setTimeout(() => h.lower(), delay);
    });
  }

  /** A double click: that one goes back up and one the ceiling hasn't got comes down. */
  swap(h: Hanging) {
    const frame = this.frame;
    if (!frame || h.want === 0) return;
    const out = DECOR.filter(
      (n) =>
        !this.wanted.includes(n) && !this.loading.has(n) && !this.hung.some((o) => o.name === n),
    );
    if (!out.length) return;
    const next = out[Math.floor(Math.random() * out.length)];
    this.wanted = [...this.wanted.filter((n) => n !== h.name), next];
    h.raise();
    this.hang(next, frame, 900, h);
  }

  /** A clear spot on the ceiling: beside the content, clear of the lamps and the others. */
  private place(h: Hanging, f: Frame, near?: Hanging) {
    const column = this.clear();
    const [lo, hi] = h.kind.thread;
    const vx = (f.left + f.right) / 2;
    for (let attempt = 0; attempt < 40; attempt++) {
      // First where the one it replaces hung, then anywhere.
      // All of it (as it turns, its arms reach back as far as across) in front of the
      // monitor, never behind it, and well clear of the back wall.
      const back = Math.min(0.8, (f.back ?? 1) - h.widthPx(f) / 2 / floorDepth(f));
      h.depth = near && attempt < 2 ? near.depth : 0.3 + Math.random() * Math.max(0, back - 0.3);
      if (h.depth > Math.max(back, 0.3)) continue;
      h.at = near && attempt < 2 ? near.at : 0.04 + Math.random() * 0.92;
      // Shorter threads as it gets harder.
      h.length = lo + Math.random() * (hi - lo) * (1 - attempt / 40);
      const x = h.hook(f).x;
      const w = h.widthPx(f);
      // Clear of the side walls where it hangs (they come in toward the back), and room to
      // swing.
      const at = depthScale(f, h.depth);
      const margin = f.bot * 0.4 * at;
      const [left, right] = [vx + (f.left - vx) * at, vx + (f.right - vx) * at];
      if (x - w / 2 < left + margin || x + w / 2 > right - margin) continue;
      if (
        column &&
        x + w / 2 > column.left - f.bot * 0.5 &&
        x - w / 2 < column.right + f.bot * 0.5
      ) {
        const bottom = h.hook(f).y + h.length * depthScale(f, h.depth) * f.bot + h.heightPx(f);
        if (bottom > column.top - f.bot * 0.3) continue;
      }
      if (
        column?.also?.some(([a, b]) => x + w / 2 > a - f.bot * 0.3 && x - w / 2 < b + f.bot * 0.3)
      )
        continue;
      // The flush lamps are half way back, spread evenly across.
      const n = Math.max(2, Math.min(4, Math.round((f.right - f.left) / 480)));
      const k = depthScale(f, 0.5);
      const nearLamp = Array.from({ length: n }, (_, i) => {
        const lx = vx + (f.left + ((f.right - f.left) * (i + 0.5)) / n - vx) * k;
        return Math.abs(lx - x) < w / 2 + f.bot * 0.3 && Math.abs(h.depth - 0.5) < 0.12;
      }).some(Boolean);
      if (nearLamp) continue;
      const crowded = this.hung.some((o) => {
        if (o.gone || o === h || o === near) return false;
        const ox = o.hook(f).x;
        return Math.abs(ox - x) < (w + o.widthPx(f)) / 2 + f.bot * 0.5;
      });
      if (!crowded) return true;
    }
    return false;
  }

  /** Where the birds can sit on what hangs here. */
  tops(f: Frame): Top[] {
    return this.hung.flatMap((h) => h.perch(f) ?? []);
  }

  dress(look: LookName) {
    this.look = look;
    this.hung.forEach((h) => h.dress(look));
  }

  update(dt: number, env: Env) {
    const f = (this.frame = env.frame);
    // The mouse brushing past sets them swinging; so does anyone flying into them.
    const movers: { key: object; x: number; y: number; depth: number }[] = [];
    if (env.pointer.present && env.time - env.pointer.at < 0.2)
      movers.push({ key: this, x: env.pointer.x, y: env.pointer.y, depth: -1 });
    for (const c of env.crew) {
      if (!c.free) continue;
      const b = c.bounds(f);
      movers.push({ key: c, x: b.x + b.w / 2, y: b.y + b.h / 2, depth: (c as Character).depth });
    }
    for (const m of movers) {
      const was = this.last.get(m.key);
      this.last.set(m.key, { x: m.x, y: m.y });
      if (!was || dt <= 0) continue;
      const vx = (m.x - was.x) / dt;
      for (const h of this.hung) {
        if (h.down < 0.9 || h.taken) continue;
        if (m.depth >= 0 && Math.abs(m.depth - h.depth) > 0.3) continue;
        const b = h.bounds(f);
        if (m.x > b.x && m.x < b.x + b.w && m.y > b.y && m.y < b.y + b.h)
          h.push(clamp(vx, -2000, 2000) * dt * 6);
      }
    }
    for (const h of this.hung) {
      h.update(dt, env.time, f);
      h.settle();
    }
    // Those back up in the ceiling are done with.
    this.hung = this.hung.filter((h) => {
      if (!h.gone) return true;
      this.hits.get(h)?.remove();
      this.hits.delete(h);
      h.dispose();
      return false;
    });
    for (const [h, el] of this.hits) {
      if (h.down < 0.5) {
        el.style.display = 'none';
        continue;
      }
      const b = h.bounds(f);
      el.style.display = 'block';
      el.style.transform = `translate(${b.x}px, ${b.y}px)`;
      el.style.width = `${b.w}px`;
      el.style.height = `${b.h}px`;
    }
  }

  private hitArea(h: Hanging) {
    if (!this.hitLayer) return;
    const el = document.createElement('div');
    el.className = 'robot-hit';
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText =
      'position:absolute;left:0;top:0;pointer-events:auto;cursor:pointer;display:none;user-select:none;';
    // Pressed on and held (or dragged): taken along the ceiling till it's let go.
    let press: { id: number; x: number; y: number; timer: number } | null = null;
    let took = false;
    const takeUp = (id: number, at: { x: number; y: number }) => {
      if (press) clearTimeout(press.timer);
      press = null;
      const f = this.frame;
      if (!f || h.taken || h.down < 1 || h.want === 0) return;
      h.taken = { x: at.x, y: at.y };
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
      if (!h.taken) return;
      h.taken = null;
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
      if (h.taken) [h.taken.x, h.taken.y] = [at.x, at.y];
    });
    el.addEventListener('pointerup', putDown);
    el.addEventListener('pointercancel', putDown);
    el.addEventListener('lostpointercapture', putDown);
    // A click sets it swinging; a second one straight after swaps it for another.
    let last = -Infinity;
    el.addEventListener('click', (e) => {
      if (took) {
        took = false;
        return;
      }
      if (e.timeStamp - last < DOUBLE) {
        last = -Infinity;
        return this.swap(h);
      }
      last = e.timeStamp;
      h.poke();
    });
    this.hitLayer.appendChild(el);
    this.hits.set(h, el);
  }

  dispose() {
    this.hung.forEach((h) => h.dispose());
    this.hits.forEach((el) => el.remove());
  }
}

/** The page's content, in viewport px. */
export interface Column {
  left: number;
  right: number;
  top: number;
  /** Anything else hung from the ceiling to keep clear of, as spans across (a pull cord). */
  also?: [number, number][];
}

/** Colour at a point round the colour wheel, for the colour look's lights. */
function hue(u: number) {
  return new Color().setHSL(u, 0.85, 0.62);
}

/** Smooth noise-ish flicker, 0..1. */
function flicker(t: number) {
  return 0.5 + 0.25 * Math.sin(t) + 0.25 * Math.sin(t * 2.3 + 1.7);
}
