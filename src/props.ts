import {
  type Bone,
  Box3,
  CanvasTexture,
  CatmullRomCurve3,
  Euler,
  Group,
  type Material,
  type Matrix4,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  Plane,
  PlaneGeometry,
  Quaternion,
  type SkinnedMesh,
  Sprite,
  SpriteMaterial,
  TubeGeometry,
  Vector3,
} from 'three';
import { type Box, type Door, depthScale, floorDepth, horizon, project } from './box';
import { type Body, type Character, clamp, type Env, type Frame, shadowTexture } from './character';
import { dress, type LookName, type Outfit } from './looks';
import { Puppet, sanitize } from './puppet';
import { Spring } from './spring';

/**
 * The crew's props, on the floor of the box (blender/props.py): toys to throw and
 * chase (a ball of wound cable, a bone, a ball, a flying disc, a balloon, a top, blocks
 * to stack, a spot of light) and things to use (a cushion to sit on, a crate to hide
 * behind, a table to go under, a trampoline, a seesaw, a drum, a bubble wand). Each comes
 * up through a hole that opens in the floor, and goes back down one when it's done with.
 *
 * The toys fall, bounce, roll or slide and come to rest, and bounce off the box's walls;
 * a balloon sinks slowly and drifts, a disc glides while it's fast, a top stays up while
 * it spins, and blocks stand on each other. A ball of cable pays its cable out as it rolls
 * away and winds it back up rolling back over it. The crew carry things in a mouth or a
 * hand (a grip found on the model: its jaw's tip, a hand's palm) and throw them. Whoever
 * walks into a toy kicks it along; so does the mouse, brushing past, and a click makes it
 * jump. The furniture stays put, and the crew walk round it (Body), except whoever is
 * using it.
 *
 * Positions are as the crew's: along the front of the box (s, px), back into it (depth,
 * 0..1) and up off the floor (h, px at the front of the box), then projected.
 */

/** Gravity, in --bot per second². */
export const G = 28;

export interface Kind {
  /** Height and width in the model's metres (props.py). */
  metres: number;
  width: number;
  /** Front to back, as a share of its width (for its room on the floor). */
  deep: number;
  /** Its height on the page, in --bot. */
  size: number;
  /** Its middle, in its metres above the floor: what it rolls and tumbles about. */
  centre: number;
  /**
   * Rolls along the floor, slides to a stop, or stays put; floats (sinks slowly and
   * drifts), glides (holds itself up while it's fast), spins (stands up while it spins),
   * or is a spot of light, that goes where it's sent.
   */
  moves: 'roll' | 'slide' | 'still' | 'float' | 'glide' | 'spin' | 'spot';
  /** How much of a fall it bounces back. */
  bounce: number;
  /** The crew walk round it. */
  blocks: boolean;
  /** Its top, to stand on, as a share of its height (a cushion). */
  seat?: number;
  /** The room under it, as a share of its height (a table). */
  under?: number;
  /** Others can stand on it: a block on a block. */
  stacks?: boolean;
  /** Pays out a cable as it rolls away (a ball of it). */
  unrolls?: boolean;
  /** Held turned so (degrees about its up, front and side axes): a wand held up. */
  held?: [number, number, number];
  /** Its bones' springs, by name. */
  feels?: Record<string, { f: number; zeta: number }>;
}

const BLOCK: Kind = {
  metres: 0.112,
  width: 0.11,
  deep: 1,
  size: 0.36,
  centre: 0.056,
  moves: 'slide',
  bounce: 0.25,
  blocks: false,
  stacks: true,
};

export const KINDS: Record<string, Kind> = {
  yarn: {
    metres: 0.142,
    width: 0.2,
    deep: 1,
    size: 0.36,
    centre: 0.07,
    moves: 'roll',
    bounce: 0.3,
    blocks: false,
    unrolls: true,
  },
  bone: {
    metres: 0.09,
    width: 0.25,
    deep: 0.4,
    size: 0.23,
    centre: 0.045,
    moves: 'slide',
    bounce: 0.35,
    blocks: false,
  },
  ball: {
    metres: 0.146,
    width: 0.146,
    deep: 1,
    size: 0.34,
    centre: 0.073,
    moves: 'roll',
    bounce: 0.62,
    blocks: false,
  },
  cushion: {
    metres: 0.155,
    width: 0.5,
    deep: 0.8,
    size: 0.34,
    centre: 0.078,
    moves: 'still',
    bounce: 0,
    blocks: true,
    seat: 0.8,
  },
  crate: {
    metres: 0.41,
    width: 0.76,
    deep: 0.63,
    size: 0.78,
    centre: 0.2,
    moves: 'still',
    bounce: 0,
    blocks: true,
  },
  table: {
    metres: 0.62,
    width: 1.0,
    deep: 0.52,
    size: 1.4,
    centre: 0.31,
    moves: 'still',
    bounce: 0,
    blocks: false,
    under: 0.78,
  },
  balloon: {
    metres: 0.3,
    width: 0.26,
    deep: 1,
    size: 0.72,
    centre: 0.16,
    moves: 'float',
    bounce: 0.5,
    blocks: false,
    feels: { ribbon: { f: 1.4, zeta: 0.25 } },
  },
  frisbee: {
    metres: 0.045,
    width: 0.28,
    deep: 1,
    size: 0.12,
    centre: 0.02,
    moves: 'glide',
    bounce: 0.2,
    blocks: false,
  },
  'block-star': BLOCK,
  'block-ring': BLOCK,
  'block-heart': BLOCK,
  top: {
    metres: 0.155,
    width: 0.145,
    deep: 1,
    size: 0.42,
    centre: 0.07,
    moves: 'spin',
    bounce: 0.3,
    blocks: false,
  },
  trampoline: {
    metres: 0.155,
    width: 0.68,
    deep: 0.9,
    size: 0.5,
    centre: 0.078,
    moves: 'still',
    bounce: 0,
    blocks: true,
    seat: 0.79,
  },
  seesaw: {
    metres: 0.2,
    width: 0.86,
    deep: 0.3,
    size: 0.6,
    centre: 0.1,
    moves: 'still',
    bounce: 0,
    blocks: true,
    seat: 0.76,
    feels: { plank: { f: 1.3, zeta: 0.55 } },
  },
  drum: {
    metres: 0.115,
    width: 0.21,
    deep: 1,
    size: 0.42,
    centre: 0.057,
    moves: 'still',
    bounce: 0,
    blocks: true,
  },
  wand: {
    metres: 0.045,
    width: 0.2,
    deep: 0.3,
    size: 0.13,
    centre: 0.02,
    moves: 'slide',
    bounce: 0.3,
    blocks: false,
    held: [0, 55, 0],
  },
  spot: {
    metres: 0.006,
    width: 0.07,
    deep: 1,
    size: 0.03,
    centre: 0.003,
    moves: 'spot',
    bounce: 0,
    blocks: false,
  },
};

const Y = new Vector3(0, 1, 0);
const v = new Vector3();
const w = new Vector3();
const q = new Quaternion();
const q2 = new Quaternion();
const e = new Euler();
const DEG = Math.PI / 180;
/** How fast each slows on the floor (per second). */
const FRICTION: Partial<Record<Kind['moves'], number>> = {
  roll: 0.7,
  spin: 0.6,
  float: 2.5,
  glide: 2.2,
};

/** A point on the floor: along it (px) and back into the box (0..1). */
export interface Spot {
  s: number;
  depth: number;
}

export class Prop implements Body {
  readonly name: string;
  readonly kind: Kind;
  /** At its middle, turned as it tumbles; the model hangs below so its bottom is on the floor. */
  readonly holder = new Group();
  readonly model: Object3D;
  private puppet: Puppet;
  private outfit: Outfit | null = null;
  private shadow: Mesh<PlaneGeometry, MeshBasicMaterial>;
  /** A doorway's three edges while it comes and goes, and the frame line. */
  private planes = Array.from({ length: 4 }, () => new Plane(new Vector3(0, 1, 0), 1e6));

  s = 0;
  depth = 0.5;
  h = 0;
  /** Along the floor, into the box (px/s of floor depth) and up (px/s). */
  vs = 0;
  vz = 0;
  vh = 0;
  /** How it's turned (rolled, tumbled), and how fast it tumbles in the air (rad/s). */
  private turn = new Quaternion();
  private tumble = new Vector3();
  /** Seconds on the floor. */
  t = 0;
  /** 0 below the floor, 1 up on it, and where it's going; the hole it goes through. */
  rise = 0;
  want = 0;
  portal: Door | null = null;
  /** Who's carrying it, where, and how far it has gone from the floor into their grip. */
  heldBy: Character | null = null;
  /** Held by the pointer (viewport px, and where its foot is from it). */
  taken: { x: number; y: number; dx: number; dy: number } | null = null;
  private grip: Grip | null = null;
  private taking = 0;
  private from = new Vector3();
  /** Who's using it (sitting on it, riding it): they don't walk round it. */
  readonly users = new Set<Character>();
  /** Its light, 0..1, and a squash when it's landed on or poked. */
  glow = 0;
  private lit = new Spring(3, 1);
  private squash = new Spring(5, 0.3);
  readonly seed = Math.random() * 100;
  private frame: Frame | null = null;
  /** How big it is now, of its full size: a ball of cable, smaller for what it's paid out. */
  private girth = 1;

  /** A trampoline's mat or a drum's skin, giving under a bounce or a beat (its metres). */
  private give = new Spring(3.2, 0.16);
  /** A seesaw's plank, tipped (degrees, + its right end down). */
  tilt = 0;
  /** A top: its spin (rad/s), how far over it leans (rad), toward which way, its turn. */
  spin = 0;
  private lean = 0;
  private precess = Math.random() * 6;
  private twirl = 0;
  fallen = false;
  /** Sent away, and waiting to be down on the floor to go. */
  private going: { portal: Box['portal'] } | null = null;
  /** A spot of light: where it's going. */
  aim: Spot | null = null;
  /** The block it stands on. */
  on: Prop | null = null;
  /** The cable a ball of it has paid out (where it lies), and the drawn cable. */
  private cable: Spot[] = [];
  reeling = false;
  private rope: Mesh<TubeGeometry, Material>[] = [];
  private roped = '';

  constructor(name: string, model: Object3D) {
    this.name = name;
    this.kind = KINDS[name];
    this.model = model;
    model.position.y = -this.kind.centre;
    this.holder.add(model);
    this.holder.visible = false;
    this.puppet = new Puppet(model, { ...this.kind.feels, default: { f: 2, zeta: 0.5 } });
    this.turn.setFromAxisAngle(Y, (Math.random() - 0.5) * 0.8);
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

  /** Into the scene (with its shadow), and out of it. */
  addTo(scene: Object3D) {
    scene.add(this.holder, this.shadow, ...this.rope);
  }

  dress(look: LookName) {
    this.outfit?.dispose();
    this.outfit = dress(this.model, look, { model: `prop-${this.name}` });
    for (const m of this.outfit.materials) m.clippingPlanes = this.planes;
    if (this.kind.unrolls) this.dressRope();
  }

  /** The cable is drawn in the ball's own colour, with its outline if the look has one. */
  private dressRope() {
    let body: Material | null = null;
    let line: Material | null = null;
    this.model.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      if (obj.userData.outline) line ??= mesh.material as Material;
      else if (/Yarn/.test(obj.userData.role ?? '')) body ??= mesh.material as Material;
    });
    const parent = this.rope[0]?.parent;
    for (const r of this.rope) {
      r.geometry.dispose();
      r.removeFromParent();
    }
    this.rope = [];
    for (const m of [line, body]) {
      if (!m) continue;
      const mesh = new Mesh(new TubeGeometry(), m);
      mesh.frustumCulled = false;
      mesh.visible = false;
      this.rope.push(mesh);
      parent?.add(mesh);
    }
    this.roped = '';
  }

  // ---------- Room on the floor (Body) ----------

  floorPoint(f: Frame) {
    return { x: this.s, z: this.depth * floorDepth(f) };
  }

  footprint(f: Frame) {
    const x = (this.kind.width / this.kind.metres) * this.heightPx(f) * 0.5;
    return { x, z: x * this.kind.deep };
  }

  get stride() {
    return Math.hypot(this.vs, this.vz);
  }

  blocks(c: Character) {
    return this.kind.blocks && this.rise > 0.3 && !this.users.has(c) && !this.heldBy;
  }

  /** Its height on the page at the front of the box, and where its top is (to stand on). */
  heightPx(f: Frame) {
    return this.kind.size * f.bot * this.girth;
  }

  seatPx(f: Frame) {
    return (this.kind.seat ?? 1) * this.heightPx(f);
  }

  /** Where it is on the page (its middle), in viewport px. */
  screen(f: Frame) {
    if (this.heldBy) return { x: this.holder.position.x, y: -this.holder.position.y };
    return project(f, this.depth, { x: this.s, y: f.bottom - this.h - this.middle(f) });
  }

  private middle(f: Frame) {
    return (this.kind.centre / this.kind.metres) * this.heightPx(f);
  }

  /** On the floor and still (or near enough). */
  get resting() {
    const f = this.frame;
    const floor = this.on && f ? this.on.h + this.on.heightPx(f) : 0;
    return !this.heldBy && this.h < 1 + floor && this.stride < (f?.bot ?? 30) * 0.4;
  }

  /** Where a wand's ring is on the page (to blow bubbles from). */
  tip() {
    this.model.updateMatrixWorld(true);
    const p = this.model.localToWorld(v.set(0.07, 0.01, 0));
    return { x: p.x, y: -p.y };
  }

  /** Where a seesaw's seats are, px along the floor from its middle and up off it. */
  seats(f: Frame): [Spot & { h: number }, Spot & { h: number }] {
    const px = this.heightPx(f) / this.kind.metres;
    const [pivot, reach] = [0.14 * px, 0.34 * px];
    const a = this.tilt * DEG;
    const up = this.heightPx(f) * 0.08;
    return [-1, 1].map((side) => ({
      s: this.s + side * reach * Math.cos(a),
      depth: this.depth,
      h: pivot - side * reach * Math.sin(a) + up,
    })) as [Spot & { h: number }, Spot & { h: number }];
  }

  // ---------- Coming and going ----------

  /** Up through a hole in the floor at (s, depth); a spot of light just comes on. */
  arrive(f: Frame, s: number, depth: number, box: { portal: Box['portal'] }) {
    this.s = s;
    this.depth = depth;
    this.h = 0;
    this.vs = this.vz = this.vh = 0;
    this.rise = 0;
    this.want = 1;
    this.holder.visible = true;
    if (this.kind.moves !== 'spot') this.open(f, box);
  }

  /** Back down a hole where it is, once it's down on the floor (a spot just goes out). */
  leave(box: { portal: Box['portal'] }) {
    if (this.heldBy) this.drop();
    this.reeling = false;
    this.users.clear();
    this.aim = null;
    this.going = box;
    if (this.h < 2 || this.kind.moves === 'spot') this.sink(box);
  }

  private sink(box: { portal: Box['portal'] }) {
    this.going = null;
    this.want = 0;
    this.vs = this.vz = 0;
    if (this.frame && this.kind.moves !== 'spot') this.open(this.frame, box);
  }

  private open(f: Frame, box: { portal: Box['portal'] }) {
    const x = project(f, this.depth, { x: this.s, y: f.bottom }).x;
    const width = this.footprint(f).x * 2 * depthScale(f, this.depth);
    this.portal ??= box.portal('floor', x, this.depth, Math.max(width * 1.25, f.bot * 0.7));
  }

  get gone() {
    return this.want === 0 && this.rise === 0 && !this.portal;
  }

  // ---------- Carrying and throwing ----------

  /** Into c's mouth (or hand): it goes there over a moment. */
  take(c: Character) {
    this.grip = gripOf(c);
    if (!this.grip) return false;
    this.from.copy(this.holder.position);
    this.heldBy = c;
    this.taking = 0;
    this.vs = this.vz = this.vh = 0;
    this.on = null;
    return true;
  }

  /** Let go, with a push (px/s along, into the box, up), and a spin if it's thrown. */
  drop(push = { s: 0, z: 0, h: 0 }, spin = 0) {
    const c = this.heldBy;
    const f = this.frame;
    if (!c || !f) return;
    this.heldBy = null;
    this.grip = null;
    this.depth = clamp(c.depth, 0.02, 0.98);
    // From where the grip is on the page, back to the front of the box.
    const p = this.holder.position;
    const front = unproject(f, this.depth, { x: p.x, y: -p.y });
    this.s = front.x;
    this.h = Math.max(0, f.bottom - front.y - this.middle(f));
    this.turn.copy(this.holder.quaternion);
    this.vs = push.s;
    this.vz = push.z;
    this.vh = push.h;
    this.tumble.set(0, (Math.random() - 0.5) * spin * 0.4, spin);
  }

  /** A click: it jumps (a toy) or wobbles (the rest); a top spins again. */
  poke() {
    const f = this.frame;
    if (!f || this.rise < 1 || this.heldBy) return;
    this.squash.kick(4);
    this.glow = 1;
    if (this.kind.moves === 'spin') return this.spinUp(30);
    if (this.kind.moves === 'spot') {
      this.aim = null;
      this.vs = (Math.random() - 0.5) * f.bot * 30;
      this.vz = (Math.random() - 0.5) * f.bot * 10;
      return;
    }
    if (this.kind.moves === 'still') return this.boing(0.5);
    const up = this.kind.moves === 'float' ? 0.9 : 1;
    this.vh = f.bot * (5 + Math.random() * 2) * up;
    this.vs += (Math.random() - 0.5) * f.bot * 6;
    this.vz += (Math.random() - 0.5) * f.bot * 2;
    if (this.kind.moves === 'float' || this.kind.moves === 'glide') return;
    this.tumble
      .set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
      .multiplyScalar(12);
  }

  /** Brushed or walked into: a shove (px/s), for the toys. */
  push(vs: number, vz: number) {
    const moves = this.kind.moves;
    if (moves === 'still' || moves === 'spot' || this.heldBy || this.taken || this.rise < 1) return;
    this.vs += vs;
    this.vz += vz;
  }

  /** A bounce on a trampoline's mat, a beat on a drum's skin (0..1 how hard). */
  boing(hard = 1) {
    this.give.kick(-hard * 0.5);
    this.glow = Math.max(this.glow, 0.5 + hard * 0.5);
    this.squash.kick(hard * 1.5);
  }

  /** A top, set spinning (rad/s), stood back up. */
  spinUp(rate = 40) {
    this.spin = rate;
    this.fallen = false;
    this.lean = 0.3;
    this.vh = Math.max(this.vh, (this.frame?.bot ?? 30) * 1.5);
  }

  /** A ball of cable winds its cable back in, rolling back along it. */
  reel() {
    if (this.cable.length) this.reeling = true;
  }

  /** How much cable is out, px. */
  paidOut(f: Frame) {
    const deep = floorDepth(f);
    let out = 0;
    const c = this.cable;
    for (let i = 1; i < c.length; i++)
      out += Math.hypot(c[i].s - c[i - 1].s, (c[i].depth - c[i - 1].depth) * deep);
    const last = c[c.length - 1];
    if (last) out += Math.hypot(this.s - last.s, (this.depth - last.depth) * deep);
    return out;
  }

  light(level: number) {
    this.outfit?.dot(0, clamp(level, 0, 1));
    if (this.name === 'seesaw') this.outfit?.dot(1, clamp(level, 0, 1));
  }

  // ---------- Each frame ----------

  update(dt: number, f: Frame, others: readonly Prop[] = []) {
    this.frame = f;
    this.t += dt;
    const moves = this.kind.moves;
    // Up or down through its hole, once the hole's open; then the hole closes.
    const ease = moves === 'spot' ? 0.3 : 0.8;
    if (!this.portal || this.portal.open > 0.85)
      this.rise = clamp(this.rise + clamp(this.want - this.rise, -dt / ease, dt / ease), 0, 1);
    if (this.portal && this.rise === this.want) {
      this.portal.want = 0;
      if (this.portal.open <= 0) this.portal = null;
    }
    if (this.going && this.h < 2 && !this.heldBy) this.sink(this.going);
    if (this.taken && (this.rise < 1 || this.heldBy || this.going)) this.taken = null;
    if (this.taken) this.carry(dt, f);
    else if (!this.heldBy && this.rise === 1) {
      if (moves === 'spot') this.shine(dt, f);
      else if (moves !== 'still') this.fall(dt, f, others);
    }
    if (this.kind.unrolls) this.unroll(f);
    this.glow = Math.max(0, this.glow - dt * 0.8);
    if (moves === 'spin') this.glow = Math.max(this.glow, clamp(this.spin / 25, 0, 1));
    this.light(this.lit.update(dt, this.glow));
    this.bones(dt);
    this.place(dt, f);
  }

  /** Falling, bouncing, rolling, sliding, floating, gliding or spinning, and off the walls. */
  /** Its fall in the air, px/s², going at `speed` px/s: a balloon barely sinks; a disc going fast holds itself up. */
  lift(f: Frame, speed: number) {
    const moves = this.kind.moves;
    if (moves === 'float') return (this.going ? 8 : 1.4) * f.bot;
    if (moves === 'glide') return G * f.bot * (1 - 0.94 * clamp(speed / (f.bot * 4.5), 0, 1));
    return G * f.bot;
  }

  /** How fast the air slows it, per second. */
  get drag() {
    const moves = this.kind.moves;
    return moves === 'float' ? 0.9 : moves === 'glide' ? 0.22 : 0.05;
  }

  /** Held by the pointer: its foot goes to where the pointer has it on the floor, a little
   * off it, inside the room; let go, it keeps the speed it was carried at. */
  private carry(dt: number, f: Frame) {
    const h = this.taken!;
    const deep = floorDepth(f);
    const vx = (f.left + f.right) / 2;
    const vy = horizon(f);
    const reach = Math.max(f.bottom - vy, f.depth * 4);
    const { x: rx, z: rz } = this.footprint(f);
    const k = clamp((h.y + h.dy - vy) / (f.bottom - vy), depthScale(f, 1), 1);
    const near = Math.min(0.3, rz / deep + 0.03);
    const far = Math.max(near, Math.min(1 - Math.min(0.3, rz / deep), (f.back ?? 1) - rz / deep));
    const depth = clamp(((1 - k) * reach) / f.depth, near, far);
    const s = clamp(vx + (h.x + h.dx - vx) / depthScale(f, depth), f.left + rx, f.right - rx);
    const a = Math.min(1, dt * 14);
    const was = { s: this.s, z: this.depth * deep };
    this.s += (s - this.s) * a;
    this.depth += (depth - this.depth) * a;
    this.h += (f.bot * 0.8 - this.h) * a;
    this.vh = 0;
    if (dt > 0) {
      const to = { vs: (this.s - was.s) / dt, vz: (this.depth * deep - was.z) / dt };
      this.vs += (clamp(to.vs, -1500, 1500) - this.vs) * 0.3;
      this.vz += (clamp(to.vz, -1000, 1000) - this.vz) * 0.3;
    }
  }

  private fall(dt: number, f: Frame, others: readonly Prop[]) {
    const deep = floorDepth(f);
    const moves = this.kind.moves;
    const g = this.h > 0 ? this.lift(f, Math.hypot(this.vs, this.vz)) : G * f.bot;
    this.vh -= g * dt;
    this.s += this.vs * dt;
    this.depth += (this.vz * dt) / deep;
    const was = this.h;
    this.h += this.vh * dt;
    // What it lands on: the floor, or a block (one it was above before this step, however far it fell in it).
    const [ground, under] = this.kind.stacks
      ? this.ground(f, others, Math.max(was, this.h))
      : [0, null];
    let floor = false;
    if (this.h <= ground) {
      this.h = ground;
      floor = true;
      if (under && !this.on) {
        // Set down on a block: it stays put there, not bouncing off the edge.
        this.vh = 0;
        this.vs = under.vs + (this.vs - under.vs) * 0.2;
        this.vz = under.vz + (this.vz - under.vz) * 0.2;
        this.squash.kick(1);
      } else if (this.vh < -f.bot * 1.5) {
        this.vh = -this.vh * this.kind.bounce;
        this.squash.kick(Math.min(6, -this.vh / f.bot));
        this.tumble.multiplyScalar(0.6);
      } else this.vh = 0;
    }
    // On a block that moves, it's dragged along a little; knocked off it, it tips as it falls.
    if (floor) this.on = under;
    if (this.on && floor) {
      const k = Math.min(1, dt * 2);
      this.vs += (this.on.vs - this.vs) * k;
      this.vz += (this.on.vz - this.vz) * k;
    } else if (this.on && under !== this.on) {
      this.tumble.set((Math.random() - 0.5) * 3, 0, -Math.sign(this.s - this.on.s || 1) * 5);
      this.on = null;
    }
    if (this.kind.stacks) this.shoulder(f, others);
    if (moves === 'float') {
      // Never through the ceiling; and it wanders a little on the air.
      const top = f.bottom - f.top - this.heightPx(f) * 1.1 - f.bot * 0.3;
      if (this.h > top) [this.h, this.vh] = [top, -Math.abs(this.vh) * 0.3];
      this.vh *= Math.exp(-1.2 * dt);
      this.vs += Math.sin(this.t * 0.7 + this.seed) * f.bot * 0.5 * dt;
    }
    const grip = floor ? (FRICTION[moves] ?? 3.5) : this.drag;
    const slow = Math.exp(-grip * dt);
    this.vs *= slow;
    this.vz *= slow;
    // The walls: the box's sides, its front lip and its back wall (or the monitor in front
    // of it: it bounces back off that, never rolling behind it).
    const { x: rx, z: rz } = this.footprint(f);
    const [lo, hi] = [f.left + rx, f.right - rx];
    if (this.s < lo) [this.s, this.vs] = [lo, Math.abs(this.vs) * 0.6];
    if (this.s > hi) [this.s, this.vs] = [hi, -Math.abs(this.vs) * 0.6];
    const near = Math.min(0.3, rz / deep + 0.03);
    const far = Math.max(near, Math.min(1 - Math.min(0.3, rz / deep), (f.back ?? 1) - rz / deep));
    if (this.depth < near) [this.depth, this.vz] = [near, Math.abs(this.vz) * 0.6];
    if (this.depth > far) [this.depth, this.vz] = [far, -Math.abs(this.vz) * 0.6];
    // Turning: a ball rolls with the floor; in the air it tumbles; a bone lies back down.
    const r = Math.max(this.middle(f), 1);
    if (moves === 'spin') this.whirl(dt, f, floor);
    else if (moves === 'float') {
      // A balloon turns slowly and leans into the way it drifts.
      q.setFromAxisAngle(Y, this.t * 0.25 + this.seed);
      const ls = clamp(-this.vs / (f.bot * 12), -0.35, 0.35);
      const lz = clamp(this.vz / (f.bot * 12), -0.25, 0.25);
      q2.setFromEuler(e.set(lz, 0, ls));
      this.turn.slerp(q2.multiply(q), Math.min(1, dt * 3));
    } else if (moves === 'glide') {
      // A disc flies flat and spinning, and spins down on the floor.
      this.tumble.set(0, 0, 0);
      this.turn.slerp(flat(this.turn), Math.min(1, dt * (floor ? 10 : 4)));
      const rate = floor ? this.stride / r : 14;
      this.turn.premultiply(q.setFromAxisAngle(Y, rate * dt));
    } else if (floor && moves === 'roll') {
      const [ds, dz] = [this.vs * dt, this.vz * dt];
      const dist = Math.hypot(ds, dz);
      if (dist > 1e-3) {
        // Rolling (ds, into the box dz): about up × the way it goes (world z comes out).
        v.set(-dz / dist, 0, -ds / dist);
        this.turn.premultiply(q.setFromAxisAngle(v, dist / r));
      }
    } else if (!floor) {
      const spin = this.tumble.length();
      if (spin > 1e-3)
        this.turn.premultiply(q.setFromAxisAngle(v.copy(this.tumble).normalize(), spin * dt));
    }
    if (floor && moves === 'slide') {
      this.tumble.set(0, 0, 0);
      this.turn.slerp(flat(this.turn), Math.min(1, dt * 10));
      // Sliding, it spins a little about its middle.
      this.turn.premultiply(q.setFromAxisAngle(Y, (this.vs * dt) / (r * 6)));
    }
  }

  /** The height of the highest block under it (0: the floor). */
  /** Never inside another block beside it, at the same level: pushed apart, sideways. */
  private shoulder(f: Frame, others: readonly Prop[]) {
    const deep = floorDepth(f);
    const mine = this.footprint(f);
    const tall = this.heightPx(f);
    for (const o of others) {
      if (o === this || !o.kind.stacks || o.heldBy || o.rise < 1) continue;
      if (Math.abs(o.h - this.h) > Math.min(tall, o.heightPx(f)) * 0.7) continue;
      const r = o.footprint(f);
      const [rx, rz] = [r.x + mine.x, r.z + mine.z];
      const dx = (this.s - o.s) / rx;
      const dz = ((this.depth - o.depth) * deep) / rz;
      const n = Math.hypot(dx, dz);
      if (n >= 1) continue;
      const [ux, uz] = n > 1e-3 ? [dx / n, dz / n] : [Math.sign(this.s - o.s) || 1, 0];
      const push = (1 - n) * 0.5;
      this.s += ux * rx * push;
      this.depth += (uz * rz * push) / deep;
    }
  }

  private ground(f: Frame, others: readonly Prop[], above = this.h): [number, Prop | null] {
    const deep = floorDepth(f);
    const mine = this.footprint(f);
    let top = 0;
    let on: Prop | null = null;
    for (const o of others) {
      if (o === this || !o.kind.stacks || o.heldBy || o.rise < 1) continue;
      const r = o.footprint(f);
      const dx = Math.abs(o.s - this.s) / ((r.x + mine.x) * 0.72);
      const dz = (Math.abs(o.depth - this.depth) * deep) / ((r.z + mine.z) * 0.72);
      const height = o.h + o.heightPx(f);
      if (dx < 1 && dz < 1 && height <= above + f.bot * 0.12 && height > top) {
        top = height;
        on = o;
      }
    }
    return [top, on];
  }

  /** A top: upright while it spins fast, leaning more and circling as it slows, then over. */
  private whirl(dt: number, f: Frame, floor: boolean) {
    this.spin = Math.max(0, this.spin - (0.4 + this.spin * 0.06) * dt);
    this.twirl += this.spin * dt;
    const up = this.spin > 7;
    if (!this.fallen) {
      // The slower it spins the more it leans, and the faster its lean goes round.
      const want = up ? 0.03 + 0.3 * (1 - clamp(this.spin / 28, 0, 1)) ** 2 : 0.85;
      this.lean += (want - this.lean) * Math.min(1, dt * (up ? 1.5 : 4 + this.lean * 6));
      if (up) this.precess += dt * (1.5 + 40 / this.spin);
      if (this.lean > 0.78) {
        this.fallen = true;
        this.squash.kick(3);
        this.glow = 1;
      }
      // It wanders about as it spins.
      if (up && floor) {
        this.vs += Math.cos(this.precess * 0.5 + this.seed) * f.bot * 1.4 * dt;
        this.vz += Math.sin(this.precess * 0.5 + this.seed) * f.bot * 0.8 * dt;
      }
    } else {
      // On its side it rolls round on its point till it stops.
      this.lean = 0.8;
      this.precess += dt * this.spin * 0.1;
    }
    const p = this.precess;
    this.turn
      .setFromAxisAngle(v.set(Math.sin(p), 0, -Math.cos(p)), this.lean)
      .multiply(q.setFromAxisAngle(Y, this.twirl));
  }

  /** A spot of light: it darts to where it's sent, with a tremble, and never leaves the floor. */
  private shine(dt: number, f: Frame) {
    const deep = floorDepth(f);
    this.glow = 0.8 + 0.2 * Math.sin(this.t * 9);
    if (this.aim) {
      const ds = this.aim.s - this.s;
      const dz = (this.aim.depth - this.depth) * deep;
      const d = Math.hypot(ds, dz);
      const speed = Math.min(f.bot * 16, d * 7);
      const k = Math.min(1, dt * 12);
      this.vs += ((d > 0.5 ? (ds / d) * speed : 0) - this.vs) * k;
      this.vz += ((d > 0.5 ? (dz / d) * speed : 0) - this.vz) * k;
    } else {
      const slow = Math.exp(-4 * dt);
      this.vs *= slow;
      this.vz *= slow;
    }
    this.s = clamp(this.s + this.vs * dt, f.left + f.bot * 0.4, f.right - f.bot * 0.4);
    const back = Math.max(0.06, Math.min(0.97, (f.back ?? 1) - this.footprint(f).z / deep));
    this.depth = clamp(this.depth + (this.vz * dt) / deep, 0.06, back);
    this.h = 0;
  }

  /** A ball of cable pays it out as it rolls away, and winds it up rolling back over it. */
  private unroll(f: Frame) {
    const deep = floorDepth(f);
    const c = this.cable;
    const here = { s: this.s, depth: this.depth };
    const gap = (a: Spot, b: Spot) => Math.hypot(a.s - b.s, (a.depth - b.depth) * deep);
    const step = f.bot * 0.2;
    if (this.want === 0) {
      // Going back down its hole: the cable whips back in.
      c.splice(0, Math.max(1, Math.ceil(c.length * 0.2)));
    } else if (!this.heldBy && this.rise === 1) {
      const last = c[c.length - 1];
      const prev = c[c.length - 2];
      if (!last) {
        if (this.stride > f.bot * 0.3 && this.h < f.bot * 0.3) c.push(here);
      } else if (
        this.reeling
          ? gap(last, here) < step * 0.6
          : prev
            ? gap(prev, here) < gap(prev, last)
            : gap(last, here) < step * 0.3 && this.stride < f.bot * 0.3
      )
        c.pop();
      else if (!this.reeling && this.h < f.bot * 0.25 && gap(last, here) > step) {
        // Laid with a little slack: a wiggle across the way it's going.
        const d = gap(last, here) || 1;
        const slack = (Math.random() - 0.5) * f.bot * 0.12;
        c.push({
          s: here.s - (((here.depth - last.depth) * deep) / d) * slack,
          depth: here.depth + ((here.s - last.s) / d) * (slack / deep),
        });
      }
    }
    // Winding in: it rolls itself back along its cable to where it began, blinking.
    if (this.reeling) {
      const to = c[c.length - 1];
      if (!to) {
        this.reeling = false;
        this.glow = 1;
        this.squash.kick(3);
        this.vh = f.bot * 2.5;
      } else {
        const ds = to.s - this.s;
        const dz = (to.depth - this.depth) * deep;
        const d = Math.hypot(ds, dz) || 1;
        const speed = f.bot * 3.4;
        this.vs = (ds / d) * speed;
        this.vz = (dz / d) * speed;
        this.glow = Math.max(this.glow, 0.5 + 0.5 * Math.sin(this.t * 14));
      }
    }
    // Smaller for what's out (a core stays), and it can't pay out more than it has.
    const out = this.paidOut(f);
    const most = f.bot * 24;
    const left = clamp(1 - out / most, 0, 1);
    this.girth = Math.cbrt(0.3 + 0.7 * left);
    const last = c[c.length - 1];
    if (out > most && last && !this.reeling) {
      const ds = this.s - last.s;
      const dz = (this.depth - last.depth) * deep;
      if (ds * this.vs + dz * this.vz > 0) {
        this.vs *= 0.8;
        this.vz *= 0.8;
      }
    }
  }

  /** Its moving parts: a balloon's ribbon, a trampoline's mat, a seesaw's plank, a drum's skin. */
  private bones(dt: number) {
    const p = this.puppet;
    p.begin();
    if (p.has('ribbon')) {
      const f = this.frame;
      const k = f ? f.bot * 4 : 100;
      p.add('ribbon', clamp(this.vz / k, -1, 1) * 30, 0, clamp(this.vs / k, -1, 1) * 40 - 10);
    }
    if (p.has('plank')) p.add('plank', 0, 0, -this.tilt);
    p.update(dt);
    const give = clamp(this.give.update(dt, 0), -0.04, 0.02);
    for (const name of ['mat', 'skin']) if (p.has(name)) p.shift(name, 0, give, 0);
  }

  private place(dt: number, f: Frame) {
    const k = depthScale(f, this.heldBy ? this.heldBy.depth : this.depth);
    const px = (this.heightPx(f) * k) / this.kind.metres;
    const sq = clamp(this.squash.update(dt, 0) * 0.05, -0.25, 0.25);
    const spot = this.kind.moves === 'spot';
    const grow = spot ? this.rise : 1;
    this.holder.scale.set(
      px * (1 + sq * 0.5) * grow,
      px * (1 - sq) * grow,
      px * (1 + sq * 0.5) * grow,
    );
    this.holder.visible = this.rise > 0 || this.want > 0;
    if (this.heldBy && this.grip) {
      // In its grip: where the grip is now, turned as its body is.
      const c = this.heldBy;
      c.holder.updateMatrixWorld(true);
      w.copy(this.grip.at).applyMatrix4(this.grip.bone.matrixWorld);
      this.taking = Math.min(1, this.taking + dt / 0.2);
      const u = this.taking * this.taking * (3 - 2 * this.taking);
      this.holder.position.copy(this.from).lerp(w, u);
      c.puppet.bone('root').getWorldQuaternion(q);
      const held = this.kind.held;
      if (held)
        q.multiply(q2.setFromEuler(e.set(held[2] * DEG, held[0] * DEG, held[1] * DEG, 'YXZ')));
      this.holder.quaternion.slerp(q, u);
      this.shadow.visible = false;
    } else {
      const up = spot ? 0 : (this.rise - 1) * this.heightPx(f) * 1.1;
      // A spot trembles, as a light in a hand does.
      const shake = spot ? Math.sin(this.t * 41) * f.bot * 0.03 : 0;
      const mid = project(f, this.depth, {
        x: this.s + shake,
        y: f.bottom - this.h - this.middle(f) - up,
      });
      this.holder.position.set(mid.x, -mid.y, -this.depth * f.depth * 3);
      this.holder.quaternion.copy(this.turn);
      if (this.kind.moves === 'spin') {
        // A top leans on its point, not about its middle.
        const m = this.middle(f) * k;
        v.set(0, m, 0).applyQuaternion(this.turn);
        this.holder.position.x += v.x;
        this.holder.position.y += v.y - m;
        this.holder.position.z += v.z * 0.2;
      }
      // Its shadow on the floor under it, fainter the higher it goes.
      const foot = project(f, this.depth, { x: this.s, y: f.bottom });
      const lift = clamp(1 - this.h / (this.heightPx(f) * 3 + f.bot), 0, 1);
      this.shadow.visible = this.rise > 0.5 && !spot;
      this.shadow.material.opacity = 0.22 * lift * clamp(this.rise * 2 - 1, 0, 1);
      const width = this.footprint(f).x * 2.3 * k * (0.7 + 0.3 * lift);
      this.shadow.scale.set(width, f.depth * 0.5 * k, 1);
      this.shadow.position.set(foot.x, -foot.y, -this.depth * f.depth * 3 - width * 0.4);
    }
    if (this.kind.unrolls) this.drawRope(f);
    // Through its hole while it comes and goes (not once it's up, as the hole closes under
    // it), and never below the frame line.
    const edges = this.portal && this.rise < 1 ? this.portal.clip() : [];
    this.planes.slice(0, 3).forEach((plane, i) => {
      const e = edges[i];
      if (e) {
        plane.normal.set(e[0], e[1], 0);
        plane.constant = e[2];
      } else plane.constant = 1e6;
    });
    this.planes[3].normal.set(0, 1, 0);
    this.planes[3].constant = this.heldBy ? 1e6 : f.bottom;
  }

  /** The cable it has paid out, along the floor where it lies and up to the ball. */
  private drawRope(f: Frame) {
    const c = this.cable;
    const shown = c.length > 0 && this.rise > 0;
    for (const r of this.rope) r.visible = shown;
    if (!shown || !this.rope.length) return;
    const r = Math.max(0.7, f.bot * 0.022);
    const at = (s: number, depth: number, h: number) => {
      const p = project(f, depth, { x: s, y: f.bottom - h - r });
      return new Vector3(p.x, -p.y, -depth * f.depth * 3);
    };
    const pts = c.map((p) => at(p.s, p.depth, 0));
    pts.push(this.heldBy ? this.holder.position.clone() : at(this.s, this.depth, this.h));
    const end = pts[pts.length - 1];
    const key = `${c.length}:${end.x.toFixed(1)}:${end.y.toFixed(1)}:${f.bot}`;
    if (key === this.roped) return;
    this.roped = key;
    // Drop points that sit on top of each other (a curve can't bend through them).
    const path = pts.filter((p, i) => i === 0 || p.distanceTo(pts[i - 1]) > 0.5);
    if (path.length < 2) {
      for (const m of this.rope) m.visible = false;
      return;
    }
    const k = depthScale(f, this.depth);
    const geometry = new TubeGeometry(
      new CatmullRomCurve3(path, false, 'centripetal'),
      Math.min(400, path.length * 4),
      r * k,
      5,
      false,
    );
    for (const m of this.rope) {
      m.geometry.dispose();
      m.geometry = geometry;
      (m.material as Material).clippingPlanes = this.planes;
    }
  }

  /** Its outline on the page, for clicks. */
  bounds(f: Frame) {
    const k = depthScale(f, this.heldBy ? this.heldBy.depth : this.depth);
    const mid = this.screen(f);
    const h = Math.max(this.heightPx(f), this.kind.moves === 'spot' ? f.bot * 0.3 : 0) * k;
    const wd = Math.max(this.footprint(f).x * 2, f.bot * 0.3) * k;
    return { x: mid.x - wd / 2, y: mid.y - h / 2, w: wd, h };
  }

  dispose() {
    this.outfit?.dispose();
    this.shadow.geometry.dispose();
    this.shadow.material.dispose();
    this.rope[0]?.geometry.dispose();
    for (const r of this.rope) r.removeFromParent();
    this.holder.removeFromParent();
    this.shadow.removeFromParent();
  }
}

/** The point on the front of the box that projects to p at `depth` (project, undone). */
export function unproject(f: Frame, depth: number, p: { x: number; y: number }) {
  const a = project(f, depth, { x: 0, y: 0 });
  const b = project(f, depth, { x: 1, y: 1 });
  const k = b.x - a.x;
  return { x: (p.x - a.x) / k, y: (p.y - a.y) / k };
}

/** The spot on the floor under a point on the page (the mouse), or null if it's off the floor. */
export function floorAt(f: Frame, x: number, y: number): Spot | null {
  const vy = horizon(f);
  const k = (y - vy) / (f.bottom - vy);
  const back = depthScale(f, 1);
  if (k < back || k > 1) return null;
  const depth = (1 - k) / (1 - back);
  const vx = (f.left + f.right) / 2;
  return { s: vx + (x - vx) / k, depth };
}

/** Just its turn about the up axis: lying flat on the floor, the way it points. */
function flat(turn: Quaternion) {
  v.set(1, 0, 0).applyQuaternion(turn);
  return new Quaternion().setFromAxisAngle(Y, Math.atan2(-v.z, v.x));
}

// ---------- Bubbles ----------

interface Bubble {
  sprite: Sprite;
  s: number;
  depth: number;
  h: number;
  vs: number;
  vh: number;
  /** Its size (px at the front of the box), age and life (s), and 0..1 through popping. */
  r: number;
  age: number;
  life: number;
  pop: number;
}

/**
 * Soap bubbles from a wand: they drift up and away, wobbling, and pop at the end of their
 * life, against the ceiling, when someone's head (or paw) gets to one, or when the mouse
 * touches one.
 */
export class Bubbles {
  private list: Bubble[] = [];
  private material: SpriteMaterial;
  /** Popped by someone (or the mouse: null). */
  onPop: ((by: Character | null) => void) | null = null;

  constructor(
    private stage: Object3D,
    look: LookName,
  ) {
    this.material = new SpriteMaterial({
      map: bubbleTexture(look),
      transparent: true,
      depthWrite: false,
    });
  }

  dress(look: LookName) {
    this.material.map?.dispose();
    this.material.map = bubbleTexture(look);
    this.material.needsUpdate = true;
  }

  get count() {
    return this.list.filter((b) => b.pop === 0).length;
  }

  /** Blow one, from a point on the page `depth` into the box, drifting `dir` (±1). */
  blow(f: Frame, at: { x: number; y: number }, depth: number, dir: number) {
    const front = unproject(f, depth, at);
    const sprite = new Sprite(this.material);
    sprite.renderOrder = 2;
    this.stage.add(sprite);
    this.list.push({
      sprite,
      s: front.x,
      depth,
      h: f.bottom - front.y,
      vs: dir * f.bot * (0.6 + Math.random() * 1.4),
      vh: f.bot * (0.3 + Math.random() * 0.7),
      r: f.bot * (0.12 + Math.random() * 0.14),
      age: 0,
      life: 4 + Math.random() * 5,
      pop: 0,
    });
  }

  /** The ones still whole, where they are on the page. */
  where(f: Frame) {
    return this.list
      .filter((b) => b.pop === 0)
      .map((b) => ({ b, ...project(f, b.depth, { x: b.s, y: f.bottom - b.h }) }));
  }

  update(dt: number, env: Env) {
    const f = env.frame;
    const { x: mx, y: my } = env.pointer;
    for (const b of this.list) {
      b.age += dt;
      if (b.pop > 0) {
        b.pop += dt / 0.14;
      } else {
        // Up a little from the wand, then drifting slowly down, bobbing on the air.
        const drift = f.bot * (-0.14 + Math.sin(b.age * 1.1 + b.r * 3) * 0.18);
        b.vh += (drift - b.vh) * dt * 0.7;
        b.s += (b.vs + Math.sin(b.age * 2.3 + b.r) * f.bot * 0.5) * dt;
        b.h += b.vh * dt;
        b.vs *= Math.exp(-0.3 * dt);
        const p = project(f, b.depth, { x: b.s, y: f.bottom - b.h });
        const r = b.r * depthScale(f, b.depth);
        let by: Character | null | undefined;
        if (env.pointer.present && Math.hypot(mx - p.x, my - p.y) < r * 1.2) by = null;
        for (const c of env.crew) {
          // Fresh off the wand it floats clear of whoever blew it.
          if (by !== undefined || c.state !== 'here' || b.age < 0.6) continue;
          const box = c.bounds(f);
          if (p.x > box.x && p.x < box.x + box.w && p.y > box.y && p.y < box.y + box.h * 0.35)
            if (Math.abs(c.depth - b.depth) < 0.25) by = c;
        }
        const high = b.h > f.bottom - f.top - b.r * 2;
        const low = b.h < b.r;
        if (by !== undefined || b.age > b.life || high || low || b.s < f.left || b.s > f.right) {
          b.pop = 0.01;
          if (by !== undefined) this.onPop?.(by);
        }
      }
      const p = project(f, b.depth, { x: b.s, y: f.bottom - b.h });
      const k = depthScale(f, b.depth);
      const wobble = 1 + Math.sin(b.age * 7 + b.r) * 0.04;
      const size = b.r * 2 * k * (1 + b.pop * 0.5);
      b.sprite.scale.set(size * wobble, size / wobble, 1);
      b.sprite.position.set(p.x, -p.y, -b.depth * f.depth * 3 + 1);
      b.sprite.visible = b.pop < 1;
    }
    for (let i = this.list.length - 1; i >= 0; i--)
      if (this.list[i].pop >= 1) {
        this.list[i].sprite.removeFromParent();
        this.list.splice(i, 1);
      }
  }

  /** Pop them all. */
  clear() {
    for (const b of this.list) if (b.pop === 0) b.pop = 0.01;
  }

  get done() {
    return this.list.length === 0;
  }

  dispose() {
    for (const b of this.list) b.sprite.removeFromParent();
    this.list = [];
    this.material.map?.dispose();
    this.material.dispose();
  }
}

/** A bubble: a thin ring with a shine; rainbow-edged in the colour look, grey otherwise. */
function bubbleTexture(look: LookName) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  const c = size / 2;
  const fill = g.createRadialGradient(c * 0.8, c * 0.8, c * 0.1, c, c, c * 0.95);
  fill.addColorStop(0, 'rgba(255,255,255,0.02)');
  fill.addColorStop(0.8, 'rgba(255,255,255,0.06)');
  fill.addColorStop(1, 'rgba(255,255,255,0.18)');
  g.fillStyle = fill;
  g.beginPath();
  g.arc(c, c, c * 0.94, 0, Math.PI * 2);
  g.fill();
  if (look === 'colour') {
    const rim = g.createLinearGradient(0, 0, size, size);
    for (const [at, col] of [
      [0, '#ff8fc8'],
      [0.35, '#8fd8ff'],
      [0.65, '#b8ff9a'],
      [1, '#ffd36e'],
    ] as const)
      rim.addColorStop(at, col);
    g.strokeStyle = rim;
  } else g.strokeStyle = 'rgba(128,134,144,0.9)';
  g.lineWidth = size * 0.035;
  g.beginPath();
  g.arc(c, c, c * 0.9, 0, Math.PI * 2);
  g.stroke();
  // The shine.
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineWidth = size * 0.05;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(c, c, c * 0.66, Math.PI * 1.1, Math.PI * 1.4);
  g.stroke();
  return new CanvasTexture(canvas);
}

// ---------- Where each carries things ----------

/** A bone to carry by, and the point on it (in its own space) that holds the prop. */
export interface Grip {
  bone: Bone;
  at: Vector3;
}

/** Which part of a bone holds: the tip of a jaw, the palm of a hand, the far end of a limb,
 * or the chin of a head. */
export type GripPart = 'tip' | 'palm' | 'end' | 'chin';

/** Which bone carries, in order of preference, and which part of it holds. */
const GRIPS: [bone: string, part: GripPart][] = [
  ['jaw', 'tip'],
  ['mouth', 'tip'],
  ['hand.R', 'palm'],
  ['hand.L', 'palm'],
  ['fore.R', 'end'],
  ['forearm.R', 'end'],
  ['arm.R', 'end'],
  ['arm.0.5', 'palm'],
  ['head', 'chin'],
];

const grips = new WeakMap<Character, Grip | null>();
const spots = new WeakMap<Character, Map<string, Grip | null>>();

/** Where c carries things: found once from its model's skin. */
export function gripOf(c: Character): Grip | null {
  if (!grips.has(c)) {
    let found: Grip | null = null;
    for (const [name, part] of GRIPS) if ((found = gripOn(c, name, part))) break;
    grips.set(c, found);
  }
  return grips.get(c) ?? null;
}

/** Does it carry things in a hand (not a mouth)? */
export function handy(c: Character) {
  const g = gripOf(c);
  return !!g && /hand|fore|arm/.test(g.bone.name);
}

/** The hold on one named bone (the owl's feet; the other hand), found once from the skin
 * and kept; null if there's no such bone, or no skin on it. */
export function gripOn(c: Character, name: string, part: GripPart): Grip | null {
  let found = spots.get(c);
  if (!found) spots.set(c, (found = new Map()));
  const key = `${name}/${part}`;
  if (!found.has(key)) found.set(key, c.puppet.has(name) ? findGrip(c, name, part) : null);
  return found.get(key) ?? null;
}

/**
 * The skin that moves with a bone, as a box on the model as it was made (metres, as for
 * gripAt). Null if there's no such bone, or nothing is skinned to it.
 */
export function skinBox(c: Character, name: string): Box3 | null {
  if (!c.puppet.has(name)) return null;
  const rest = c.puppet.restMatrix(name);
  const box = new Box3();
  const p = new Vector3();
  c.model.traverse((obj) => {
    const mesh = obj as SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    const j = mesh.skeleton.bones.findIndex((b) => b.name === sanitize(name));
    if (j < 0) return;
    const to = rest.clone().multiply(mesh.skeleton.boneInverses[j]).multiply(mesh.bindMatrix);
    const pos = mesh.geometry.attributes.position;
    const idx = mesh.geometry.attributes.skinIndex;
    const wt = mesh.geometry.attributes.skinWeight;
    for (let i = 0; i < pos.count; i++) {
      let weight = 0;
      for (let k = 0; k < 4; k++) if (idx.getComponent(i, k) === j) weight += wt.getComponent(i, k);
      if (weight > 0.5) box.expandByPoint(p.fromBufferAttribute(pos, i).applyMatrix4(to));
    }
  });
  return box.isEmpty() ? null : box;
}

/**
 * A hold at a place you choose, for a body whose skin gives no good guess: the point is
 * where it goes on the model as it was made (metres, from its feet: x across, y up, z toward
 * us), and it is kept on this bone from then on, so it goes where the bone goes. Null if
 * there's no such bone.
 */
export function gripAt(c: Character, name: string, rest: [number, number, number]): Grip | null {
  if (!c.puppet.has(name)) return null;
  const at = new Vector3(...rest).applyMatrix4(c.puppet.restMatrix(name).invert());
  return { bone: c.puppet.bone(name), at };
}

function findGrip(c: Character, name: string, part: GripPart): Grip | null {
  const bone = c.puppet.bone(name);
  // The skin that moves with the bone, at rest (model space: +Z its front, +Y up).
  const pts: Vector3[] = [];
  let inverse: Matrix4 | null = null;
  c.model.traverse((obj) => {
    const mesh = obj as SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    const j = mesh.skeleton.bones.findIndex((b) => b.name === sanitize(name));
    if (j < 0) return;
    inverse ??= mesh.skeleton.boneInverses[j];
    const pos = mesh.geometry.attributes.position;
    const idx = mesh.geometry.attributes.skinIndex;
    const wt = mesh.geometry.attributes.skinWeight;
    for (let i = 0; i < pos.count; i++) {
      let weight = 0;
      for (let k = 0; k < 4; k++)
        if (idx.getComponent(i, k) === j) weight += wt.getComponent(i, k);
      if (weight > 0.5)
        pts.push(new Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.bindMatrix));
    }
  });
  if (!inverse || pts.length < 4) return null;
  const inv = inverse as Matrix4;
  let region = pts;
  const range = (key: 'x' | 'y' | 'z', list: Vector3[]) => {
    const vals = list.map((p) => p[key]);
    return [Math.min(...vals), Math.max(...vals)];
  };
  if (part === 'tip' || part === 'chin') {
    // The front of it (a jaw's tip); for a head, the front of its lower half.
    if (part === 'chin') {
      const [lo, hi] = range('y', region);
      region = region.filter((p) => p.y < lo + (hi - lo) * 0.45);
    }
    const [lo, hi] = range('z', region);
    region = region.filter((p) => p.z > hi - (hi - lo) * 0.2);
  } else if (part === 'end') {
    // The far end of the bone (a hand at the end of an arm).
    const local = region.map((p) => p.clone().applyMatrix4(inv));
    const [lo, hi] = range('y', local);
    region = region.filter((_, i) => local[i].y > hi - (hi - lo) * 0.25);
  }
  const mid = region.reduce((a, p) => a.add(p), new Vector3()).divideScalar(region.length);
  return { bone, at: mid.applyMatrix4(inv) };
}
