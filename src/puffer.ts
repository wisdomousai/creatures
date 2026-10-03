import { type Object3D, Quaternion, Vector3 } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Act, Character, clamp, type Env, type Frame } from './character';
import type { Expression, FaceLayout } from './face';
import { sin } from './moves';
import { Spring, wobble } from './spring';

/**
 * Bloop, the robot pufferfish. It can't stand on the frame line, so it floats in the band
 * just inside it: it swims in from behind the side of the frame, then bobs about, drifts
 * along the band (round the corners too, up the sides and along the top), turning side
 * on to swim with its tail going and its little fins buzzing. It noses at the frame line
 * now and then as if it were the glass of a tank, blows a ring of light, loops the loop,
 * and dozes where it floats.
 *
 * Its spots are studs: each a spike packed down flat into its shell, with a light in the
 * tip. Poke it, or rush the mouse past close by, and it puffs up: the pod swells into a
 * ball and every spike telescopes out and flashes, and it glares; after a moment it lets
 * the air out with a sigh (a ring out of its mouth), the spikes sinking back row by row.
 * Now and then it puffs itself up on purpose, holds its breath, and lets go, zipping off
 * like a balloon. Rest the mouse on it and it goes soft and pink. Poke it three times
 * and it spins round and comes out dizzy.
 *
 * Between times it has some thirty-five little tricks: sighs, floats up puffed and sinks with a
 * sigh, flexes its spikes like a bodybuilder, ripples them, hiccups, sneezes (and recoils),
 * yawns a bubble, spits a jet and shoots off, rolls off as a smooth ball, bounces off the
 * frame line inflated, circles, peeks from the back of the box, chases its tail, looks
 * about, holds its fins up bashfully, shivers, dances, plays dead belly up, puffs itself up
 * proudly at a crewmate, and waves a fin. Also: a slow half-puff to peek, puffing up at the
 * mouse pointer, a chain of bubbles, a nervous shrink, a kiss at the front lip, a spin with
 * every spike out, and a bump into a crewmate that ends in a startled puff.
 */
export const PUFFER_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.29, 0.48],
    [0.71, 0.48],
  ],
  rx: 0.14,
  ry: 0.33,
  line: 0.035,
  mouth: null,
};

type Point = { x: number; y: number };
type Side = 'bottom' | 'right' | 'top' | 'left';

/** Its spikes are built packed down to this share of their length. */
const CALM = 0.17;
/** How much bigger the pod gets, puffed up. */
const SWELL = 0.42;
/** Its middle keeps this far inside the frame line, in heights. */
const INSET = 0.72;
/** Its middle (where it tilts and turns) above its origin, as a share of its height. */
const MIDDLE = 0.45;
/** Rows of studs, face to tail (Dot0..Dot4). */
const BANDS = 5;
/** Seconds a blown ring floats before it pops. */
const RING = 2.6;
/** Seconds puffed up before the sigh; seconds holding its breath before letting go. */
const SIGH = 2.6;
const HOLD = 1.8;
const FINS = [
  ['fin.L', 1],
  ['fin.R', -1],
] as const;
/** Parts on the pod that ride out as it swells but keep their size. */
const KEEP = ['fin.L', 'fin.R', 'tail', 'dorsal', 'keel'];
/** Away from each side's frame line, into the page (viewport px, y down). */
const INWARD: Record<Side, Point> = {
  bottom: { x: 0, y: -1 },
  top: { x: 0, y: 1 },
  left: { x: 1, y: 0 },
  right: { x: -1, y: 0 },
};
const UP = new Vector3(0, 1, 0);
const va = new Vector3();
const qa = new Quaternion();

const ease = (x: number) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};
/** 1 at 0, falling to 0 at ±width. */
const bump = (x: number, width: number) => Math.max(0, 1 - Math.abs(x) / width);
const cycle = (x: number) => x - Math.floor(x);

export class Puffer extends Character {
  /** Held by the pointer, it flies after it. */
  readonly flies = true;
  /** It comes in its own way (flying or swimming), not jumping out of its picture. */
  readonly jumpsOut = false;
  /** Its middle, in viewport px; `free` is set from it each frame. */
  private pos: Point = { x: 0, y: 0 };
  private vel: Point = { x: 0, y: 0 };
  private acc: Point = { x: 0, y: 0 };
  private route: Point[] = [];
  /** Where it hangs about: how far round the band's loop (see loopAt). */
  private spot = 0;
  private exiting = false;
  private frame: Frame | null = null;
  private others: readonly Character[] = [];
  /** Swollen (1 puffed up, below 0 gone soft), and each row of spikes out (1) or in. */
  private puff = new Spring(2.2, 0.32);
  private rows = Array.from({ length: BANDS }, (_, i) => new Spring(3.4 - i * 0.2, 0.35));
  private pout = new Spring(4, 0.45);
  private soft = new Spring(2, 0.6);
  private buzz = new Spring(3, 0.9);
  /** How much it ignores the mouse to mind what it's doing. */
  private focus = new Spring(2, 1);
  /** Nudged away from the frame line when swollen, and over crewmates in its way. */
  private nudge = { x: new Spring(2, 0.8), y: new Spring(2, 0.8) };
  private tilt = new Spring(1.6, 0.6);
  private aside = new Spring(0.6, 0.9);
  private puffNow = 0;
  private rowsNow = [0, 0, 0, 0, 0];
  private spikes: { bone: string; dir: [number, number, number]; band: number }[] = [];
  private finPhase = 0;
  private tailPhase = 0;
  private pokes: number[] = [];
  private hover = 0;
  private mouse: { x: number; y: number; speed: number } | null = null;
  private shyUntil = 0;
  /** Seconds since a ring left its mouth, or -1. */
  private ringT = -1;
  private ringTone = BEACON.neutral!;
  /**
   * Where the ring left the mouth and which way it went, in page (world) space, so it
   * stays in the water as the fish turns and drifts on; and its own tuck in the body.
   */
  private ringFrom = new Vector3();
  private ringWay = new Vector3();
  private ringTurn = new Quaternion();
  private ringRest = new Vector3();
  /** Which way it drifts off across the page (as much as it was blown at you). */
  private ringSide = 0;
  private ringNew = false;
  private seed = Math.random() * 100;
  /** Fins over its face; fins spread wide; a fin waving; a bounce's squash. */
  private cover = new Spring(4, 0.5);
  private flex = new Spring(4, 0.4);
  private wave = new Spring(5, 0.3);
  private squash = new Spring(7, 0.25);
  /** Turns rolled (as a ball) and spun on the spot (chasing its tail), radians. */
  private roll = 0;
  private spun = 0;
  /** How big the ring it blows is. */
  private ringSize = 1;
  /** The side it turns to (+1 right, -1 left) for acts aimed at a crewmate or the page. */
  private toward = 1;
  private lastAt = { x: 0, y: 0 };
  /** Straining (holding its breath): a shiver too quick for a spring. */
  private tremble = 0;
  /** The pointer, where it last was, and whether it is on the page. */
  private ptr = { x: 0, y: 0 };
  private pointerOn = false;
  /** Seconds the ring it blows lasts (bubbles are quick). */
  private ringDur = RING;

  constructor(model: Object3D) {
    super(
      {
        name: 'Bloop',
        model: 'puffer',
        metres: 0.3,
        width: 0.36,
        size: 0.9,
        feels: {
          default: { f: 3, zeta: 0.5 },
          root: { f: 1.4, zeta: 0.6 },
          // Afloat: slow to turn and slow to settle.
          body: { f: 1.3, zeta: 0.45, r: 0.5 },
          tail: { f: 3, zeta: 0.3 },
          dorsal: { f: 4, zeta: 0.3 },
          keel: { f: 4, zeta: 0.3 },
          'fin.L': { f: 6, zeta: 0.4 },
          'fin.R': { f: 6, zeta: 0.4 },
        },
        face: PUFFER_FACE,
        eyes: 0.56,
        gaze: [{ bone: 'body', yaw: 0.6, pitch: 0.5 }],
        reach: { yaw: 55, pitch: 30 },
        lag: 1.2,
        // Swims in along the bottom of the band from behind the side of the frame.
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 1.4,
        turn: 75,
      },
      model,
    );
    this.ringRest.copy(this.puppet.bone('ring').position);
    // Each spike stretches out of the pod along the line from its middle.
    model.updateMatrixWorld(true);
    const middle = this.puppet.bone('shell').getWorldPosition(new Vector3());
    for (let i = 0; this.puppet.has(`spike.${i}`); i++) {
      const bone = `spike.${i}`;
      const d = this.puppet.bone(bone).getWorldPosition(new Vector3()).sub(middle).normalize();
      // Rows by their angle from the nose (+Z): 52, 76, 100, 124, 148 degrees.
      const angle = (Math.acos(clamp(d.z, -1, 1)) * 180) / Math.PI;
      const band = clamp(Math.round((angle - 52) / 24), 0, BANDS - 1);
      this.spikes.push({ bone, dir: [d.x, d.y, d.z], band });
    }
    this.acts = this.moves();
  }

  private moves(): Record<string, Act> {
    const still = () => !!this.free && !this.route.length && !this.exiting;
    return {
      idle: { weight: 3, length: [3, 7] },
      swim: {
        weight: 2.4,
        length: [3, 6],
        when: still,
        start: () => this.swimTo(this.somewhere()),
      },
      nibble: { weight: 1, length: [4.5, 6], face: 'focused', when: still },
      ring: { weight: 1, length: [3.6, 4.2], when: still },
      balloon: { weight: 0.5, length: [4.4, 5], when: still },
      twirl: { weight: 0.8, length: [1.8, 2.1], face: 'happy', when: still },
      doze: { weight: 0.7, length: [8, 14], face: 'asleep', when: still },
      // Puffing and deflating
      sigh: { weight: 0.9, length: [4.6, 5], when: still },
      rise: { weight: 0.7, length: [6.2, 6.6], when: still },
      flex: { weight: 0.6, length: [4.4, 4.8], when: still },
      ripple: { weight: 0.8, length: [3.2, 3.6], when: still },
      hiccup: { weight: 0.7, length: [4, 4.4], when: still },
      sneeze: { weight: 0.5, length: [3, 3.4], when: still },
      yawn: { weight: 0.7, length: [3.6, 4], when: still },
      // Going places
      jet: { weight: 0.7, length: [3, 3.4], when: still },
      ball: { weight: 0.6, length: [4.2, 4.6], when: still },
      bounce: { weight: 0.7, length: [4.4, 4.8], when: still },
      circle: { weight: 0.7, length: [4.4, 4.8], when: still },
      peek: { weight: 0.7, length: [8, 8.6], when: still },
      chase: { weight: 0.6, length: [3, 3.4], face: 'focused', when: still },
      // Being itself
      lookaround: { weight: 1, length: [4, 5], when: still },
      shy: { weight: 0.6, length: [3.4, 4], when: still },
      chilly: { weight: 0.5, length: [3.4, 4], face: 'sad', when: still },
      disco: { weight: 0.6, length: [3.6, 4.2], face: 'happy', when: still },
      playdead: { weight: 0.4, length: [5.6, 6], when: still },
      // Showing off, to whoever is near
      proud: { weight: 0.8, length: [4.2, 4.6], when: () => still() && !!this.mate() },
      wave: { weight: 0.8, length: [3.2, 3.6], face: 'happy', when: still },
      // More tricks
      halfpuff: { weight: 0.6, length: [5.4, 5.8], when: still },
      mousepuff: { weight: 0.6, length: [4, 4.4], when: () => still() && this.pointerOn },
      bubbles: { weight: 0.7, length: [5, 5.4], face: 'happy', when: still },
      shrink: { weight: 0.5, length: [3.6, 4], face: 'surprised', when: still },
      kiss: { weight: 0.6, length: [3.6, 4], face: 'love', when: still },
      spinout: { weight: 0.5, length: [4.4, 4.8], when: still },
      bumpmate: { weight: 0.6, length: [5.2, 5.6], when: () => still() && !!this.mate() },
      // Reactions
      poked: { weight: 0, length: [5.4, 5.8] },
      love: { weight: 0, length: [3, 4], face: 'love' },
      dizzy: { weight: 0, length: [4.6, 4.6] },
    };
  }

  protected setAct(name: string) {
    super.setAct(name);
    this.roll = 0;
    // Its depth in the box: the front for anything aimed at us, somewhere for a swim.
    const front = [
      'ring',
      'proud',
      'wave',
      'peek',
      'poked',
      'sneeze',
      'hiccup',
      'nibble',
      'ball',
      'bounce',
      'kiss',
      'bubbles',
      'mousepuff',
      'shrink',
    ];
    if (name === 'peek') this.depthGoal = 1;
    else if (name === 'circle') this.depthGoal = 0.5;
    else if (name === 'swim') this.depthGoal = Math.random() * 0.45;
    else if (front.includes(name)) this.depthGoal = Math.min(this.depthGoal, 0.1);
    this.toward = this.turnTo();
    if (name === 'mousepuff') this.toward = Math.sign(this.ptr.x - this.pos.x) || 1;
    if (name === 'bumpmate') {
      const m = this.mate();
      if (m && this.frame) this.swimTo(this.along(this.frame, m));
    }
  }

  /** Which way is the middle of the page, or a crewmate: +1 right, -1 left. */
  private turnTo() {
    const f = this.frame;
    const m = this.mate();
    const x = m ? m.x : f ? (f.left + f.right) / 2 : this.pos.x;
    return Math.sign(x - this.pos.x) || 1;
  }

  /** The nearest crewmate on stage, where their middle is. */
  private mate(): Point | null {
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

  /** Puffs up. Poked again while puffed, it stays puffed a while longer. */
  private startle() {
    this.hold();
    this.puff.kick(5);
    if (this.act === 'poked' && this.actT < SIGH) this.actT = Math.min(this.actT, 0.7);
    else this.setAct('poked');
  }

  /** A burst of speed along the band toward one side (+1 right). */
  private kickTo(dir: number) {
    if (this.frame) this.swimTo(this.spot + this.loopDir(dir) * this.heightPx * 5);
  }

  /** +1 or -1 round the loop for going right (+1) or left along the bottom or the top;
   * up or down a side is anyone's guess. */
  private loopDir(dir: number) {
    const f = this.frame;
    if (!f) return dir;
    const side = this.sideOf(f, this.spot);
    return side === 'bottom' ? dir : side === 'top' ? -dir : Math.random() < 0.5 ? 1 : -1;
  }

  /** Stops where it is and stays there. */
  private hold() {
    if (!this.free || this.exiting || !this.frame) return;
    this.route = [];
    this.spot = this.along(this.frame, this.pos);
  }

  /** A ring of light out of its mouth. */
  private blow(tone: string, size = 1, dur = RING) {
    this.ringT = 0;
    this.ringDur = dur;
    this.ringSize = size;
    this.ringTone = tone;
    this.ringNew = true;
    this.pout.kick(6);
    this.puppet.kick('body', -40);
  }

  // ---------- The band ----------

  /** The loop its middle keeps to: a rectangle just inside the frame line. */
  private loop(f: Frame) {
    const c = this.heightPx * INSET;
    const L = f.left + c;
    const R = Math.max(L + 1, f.right - c);
    const T = f.top + c;
    const B = Math.max(T + 1, f.bottom - c);
    const w = R - L;
    const h = B - T;
    return { L, R, T, B, w, h, P: 2 * (w + h) };
  }

  /** The point p round the loop: from the bottom left corner, right along the bottom,
   * up the right side, back along the top and down the left. */
  private loopAt(f: Frame, p: number): Point {
    const { L, R, T, B, w, h, P } = this.loop(f);
    const q = ((p % P) + P) % P;
    if (q < w) return { x: L + q, y: B };
    if (q < w + h) return { x: R, y: B - (q - w) };
    if (q < 2 * w + h) return { x: R - (q - w - h), y: T };
    return { x: L, y: T + (q - 2 * w - h) };
  }

  /** How far round the loop the nearest point to pt is. */
  private along(f: Frame, pt: Point): number {
    const { L, R, T, B, w, h } = this.loop(f);
    const x = clamp(pt.x, L, R);
    const y = clamp(pt.y, T, B);
    const d = [Math.abs(pt.y - B), Math.abs(pt.x - R), Math.abs(pt.y - T), Math.abs(pt.x - L)];
    const k = d.indexOf(Math.min(...d));
    return [x - L, w + (B - y), w + h + (R - x), 2 * w + h + (y - T)][k];
  }

  private sideOf(f: Frame, p: number): Side {
    const { w, h, P } = this.loop(f);
    const q = ((p % P) + P) % P;
    return q < w ? 'bottom' : q < w + h ? 'right' : q < 2 * w + h ? 'top' : 'left';
  }

  /** Swim round the band to p on its loop, the short way, by the corners. */
  private swimTo(p: number) {
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
  private somewhere(): number {
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
  private blocked(pt: Point, side?: Side): number {
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
    this.ringT = -1;
    this.vel = { x: 0, y: 0 };
    this.puff.snap(0);
    this.rows.forEach((r) => r.snap(0));
    // Afloat, its middle at the loop's height as it swims in.
    this.h = this.heightPx * (INSET - MIDDLE);
  }

  protected onArrive() {
    const f = this.frame!;
    this.pos = { x: this.s, y: f.bottom - this.h - MIDDLE * this.heightPx };
    this.vel = { x: this.pace, y: 0 };
    this.free = { x: this.pos.x, y: this.pos.y + MIDDLE * this.heightPx, tilt: 0 };
    this.spot = this.along(f, this.pos);
  }

  leave() {
    if (this.state !== 'here' || !this.free || !this.frame) return super.leave();
    if (this.exiting) return;
    // Back to the bottom of the band by the nearer corner, and out past the side.
    const { w } = this.loop(this.frame);
    const left = this.pos.x < (this.frame.left + this.frame.right) / 2;
    this.swimTo(left ? this.heightPx * 0.4 : w - this.heightPx * 0.4);
    this.exiting = true;
  }

  /** From afloat back to the edge's own swimming, to leave past the side of the frame. */
  private offStage() {
    const f = this.frame!;
    this.s = this.pos.x;
    this.h = f.bottom - this.pos.y - MIDDLE * this.heightPx;
    this.pace = this.vel.x;
    this.free = null;
    this.exiting = false;
    super.leave();
  }

  // ---------- Moving ----------

  /** Where it floats when it isn't going anywhere: its spot, drifting a little, and wherever
   * the act puts it. */
  private station(env: Env): Point {
    const f = env.frame;
    const H = this.heightPx;
    const t = this.actT;
    const at = this.loopAt(f, this.spot);
    const side = this.sideOf(f, this.spot);
    const inward = INWARD[side];
    const time = env.time;
    let x = at.x + wobble(time * 0.13, this.seed) * H * 0.25;
    let y = at.y + wobble(time * 0.11, this.seed + 3) * H * 0.1;
    switch (this.act) {
      case 'nibble': {
        // Up to the frame line, nose first, and a few quick pecks at it.
        const reach = side === 'left' || side === 'right' ? 0.16 : 0.08;
        const pecking = t > 1.2 && t < this.actLength - 1.2;
        const peck = pecking ? Math.max(0, Math.sin(2 * Math.PI * 2.2 * (t - 1.2))) ** 2 : 0;
        const k = t < this.actLength - 1.2 ? 1 : 0;
        x = at.x - inward.x * H * (reach + 0.05 * peck) * k;
        y = at.y - inward.y * H * (reach + 0.05 * peck) * k;
        break;
      }
      case 'doze':
        y += H * 0.08;
        break;
      case 'rise': {
        // Puffed up it floats, up the page; the sigh lets it sink again.
        const up = ease((t - 0.5) / 1.9) - ease((t - 3.9) / 2);
        y += (side === 'top' ? 1 : -1) * H * 1.5 * up;
        break;
      }
      case 'bounce': {
        // Inflated, it drops at the frame line and bounces off it, lower each time.
        const k = Math.max(0, 1 - t / (this.actLength - 0.3));
        const b = Math.abs(Math.sin((Math.PI * t) / 0.85));
        x += inward.x * H * (1.2 * b * k - 0.3);
        y += inward.y * H * (1.2 * b * k - 0.3);
        break;
      }
      case 'circle': {
        // Once round in a ring about a point a little way in.
        const a = 2 * Math.PI * clamp(t / 3.8, 0, 1);
        const [vx, vy] = [-inward.x * H * 0.8, -inward.y * H * 0.8];
        x += inward.x * H * 0.8 + vx * Math.cos(a) - vy * Math.sin(a);
        y += inward.y * H * 0.8 + vx * Math.sin(a) + vy * Math.cos(a);
        break;
      }
      case 'peek':
        // It goes back into the box (its depth), so hold a little to one side.
        break;
      case 'playdead':
        y += H * 0.3 * ease((t - 0.4) / 2) * (t < 4.1 ? 1 : Math.max(0, 1 - (t - 4.1) * 4));
        break;
      case 'disco':
        y += H * 0.06 * Math.sin(t * 2 * Math.PI * 2);
        break;
      case 'poked':
        // The sigh lets it sink a little.
        if (t > SIGH) y += H * 0.1 * Math.sin(Math.min(1, (t - SIGH) / 2.4) * Math.PI);
        break;
      case 'dizzy':
        x += Math.cos(time * 4) * H * 0.18;
        y += Math.sin(time * 4) * H * 0.1;
        break;
      case 'twirl': {
        const hop = Math.sin(clamp(t / 1.4, 0, 1) * Math.PI) * H * 0.3;
        x += inward.x * hop;
        y += inward.y * hop;
        break;
      }
    }
    return { x, y };
  }

  protected move(dt: number, env: Env) {
    this.frame = env.frame;
    this.others = env.crew;
    if (!this.free) return super.move(dt, env);
    const f = env.frame;
    const H = this.heightPx;
    const pos = this.pos;
    const zipping = this.act === 'balloon' && this.actT > HOLD && this.route.length > 0;
    const fast = this.act === 'jet' ? 7 : this.act === 'ball' ? 3.4 : zipping ? 8 : 2.2;
    const maxSpeed = H * fast;
    const maxAcc = maxSpeed * (zipping ? 5 : 2.5);
    const target = this.route[0] ?? this.station(env);
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
    if (zipping) {
      // Let go like a balloon: all over the place.
      ax += maxAcc * 0.8 * Math.sin(this.actT * 13);
      ay += maxAcc * 0.8 * Math.cos(this.actT * 9.3);
    }
    const a = Math.hypot(ax, ay);
    if (a > maxAcc) [ax, ay] = [(ax / a) * maxAcc, (ay / a) * maxAcc];
    this.acc = { x: ax, y: ay };
    this.vel.x += ax * dt;
    this.vel.y += ay * dt;
    pos.x += this.vel.x * dt;
    pos.y += this.vel.y * dt;

    // Nudged clear of the frame line as it swells, and over crewmates in its way.
    const side = this.sideOf(f, this.along(f, pos));
    const reach = H * (0.45 + 0.42 * Math.max(0, this.puffNow));
    let nx = Math.max(0, reach - (pos.x - f.left)) - Math.max(0, reach - (f.right - pos.x));
    let ny = Math.max(0, reach - (pos.y - f.top)) - Math.max(0, reach - (f.bottom - pos.y));
    const over = Math.min(H * 1.6, this.blocked(pos, side));
    nx += INWARD[side].x * over;
    ny += INWARD[side].y * over;
    const drawn = {
      x: pos.x + this.nudge.x.update(dt, nx),
      y: pos.y + this.nudge.y.update(dt, ny),
    };

    // Side on to swim, or turned a little toward the middle of the page when still.
    let turn = clamp(this.vel.x / H, -1, 1) * 75;
    if (this.act === 'nibble' && (side === 'left' || side === 'right'))
      turn =
        (side === 'left' ? -1 : 1) *
        100 *
        clamp(Math.min(this.actT, this.actLength - this.actT), 0, 1);
    const middle = (f.left + f.right) / 2;
    // Side on to blow a ring, so it leaves the mouth for the page, not your face.
    if (this.act === 'ring')
      turn =
        Math.sign(middle - pos.x || 1) *
        65 *
        clamp(Math.min(this.actT / 0.6, (this.actLength - this.actT) / 0.8), 0, 1);
    const t = this.actT;
    const left = this.actLength - t;
    const to = this.toward;
    switch (this.act) {
      case 'wave':
        turn = to * 18 * clamp(Math.min(t / 0.6, left / 0.6), 0, 1);
        break;
      case 'proud':
      case 'sneeze':
        // Side on to a crewmate, or the page.
        turn = to * (this.act === 'sneeze' ? 40 : 55) * clamp(Math.min(t / 0.6, left / 0.6), 0, 1);
        break;
      case 'lookaround':
        // Left, right, up and down; its whole body looking.
        turn = 50 * Math.sin(t * 1.6) * clamp(Math.min(t, left), 0, 1);
        break;
      case 'shy':
        // Faces us, hiding.
        turn = to * 12;
        break;
      case 'yawn':
        turn = to * 25 * clamp(Math.min(t, left), 0, 1);
        break;
      case 'mousepuff':
        turn = to * 45 * clamp(Math.min(t / 0.6, left / 0.6), 0, 1);
        break;
      case 'bubbles':
        turn = to * 60 * clamp(Math.min(t / 0.6, left / 0.6), 0, 1);
        break;
      case 'halfpuff':
        turn = to * 20 * clamp(Math.min(t / 0.8, left / 0.8), 0, 1);
        break;
      case 'kiss':
      case 'spinout':
      case 'peek':
        turn = 0;
        break;
      case 'chase':
        turn = 0;
        break;
    }
    this.heading.update(dt, turn);
    this.aside.update(dt, Math.abs(turn) > 20 ? 0 : Math.sign(middle - pos.x) * 22);

    // Leaning into its turns; a loop the loop; a balloon's wild wobble.
    let lean = clamp(-this.acc.x / maxAcc, -1, 1) * 0.14;
    if (zipping) lean += 0.5 * Math.sin(this.actT * 11);
    if (this.act === 'twirl')
      lean += -2 * Math.PI * ease((this.actT - 0.2) / 1.3) * Math.sign(middle - pos.x || 1);
    if (this.act === 'ball') {
      // Rolling along, the way it goes: a turn for every ball's-worth of the way.
      if (this.actT > 0.9) this.roll += (this.vel.x / (H * 0.55)) * dt;
      else this.roll += Math.sin(this.actT * 12) * 0.02;
      lean += this.roll;
    }
    if (this.act === 'playdead')
      lean +=
        -3 *
        this.toward *
        ease((this.actT - 0.4) / 1.2) *
        (this.actT < 4 ? 1 : Math.max(0, 1 - (this.actT - 4) * 6));
    this.free = {
      x: drawn.x,
      y: drawn.y + MIDDLE * H,
      tilt: this.tilt.update(dt, lean),
    };
    // Once round, it's upright again: drop the whole turn.
    if (this.act !== 'twirl' && this.act !== 'ball' && Math.abs(this.free.tilt) > Math.PI)
      this.tilt.snap(this.free.tilt - 2 * Math.PI * Math.round(this.free.tilt / (2 * Math.PI)));
  }

  // ---------- Posing ----------

  protected idle(t: number) {
    const p = this.puppet;
    // Bobbing, and never quite level.
    p.shift('root', 0, 0.012 * sin(t, 0.35), 0);
    p.add('body', 2 * sin(t, 0.21), 0, 3 * sin(t, 0.17));
    p.add('dorsal', 0, 4 * sin(t, 0.5));
    p.add('keel', 0, -4 * sin(t, 0.5, 0.2));
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    const t = this.actT;
    const act = this.act;
    const H = this.heightPx;
    const time = env.time;

    // Startled by a mouse rushing past close by.
    const { x, y } = env.pointer;
    this.ptr = { x, y };
    this.pointerOn = env.pointer.present;
    const was = this.mouse ?? { x, y, speed: 0 };
    const speed = Math.hypot(x - was.x, y - was.y) / Math.max(dt, 1e-3);
    this.mouse = { x, y, speed: was.speed + (speed - was.speed) * Math.min(1, dt * 10) };
    const eye = this.eyePoint(env.frame);
    const near = Math.hypot(x - eye.x, y - eye.y) < H * 2.5;
    const calm = ![
      'poked',
      'dizzy',
      'love',
      'balloon',
      'ring',
      'sneeze',
      'jet',
      'playdead',
      'mousepuff',
      'bumpmate',
      'spinout',
    ].includes(act);
    if (env.pointer.present && near && this.mouse.speed > H * 40 && calm && time > this.shyUntil) {
      this.shyUntil = time + 8;
      this.startle();
    }

    // The mouse resting on it: it goes soft.
    this.hover = this.hovered ? this.hover + dt : 0;
    if (this.hover > 0.6 && calm && this.free && !this.exiting) {
      this.hold();
      this.setAct('love');
    }

    // How swollen, which rows of spikes are out, the mouth, and the face, by act.
    let puff = 0;
    let out = 0;
    const rows = [0, 0, 0, 0, 0];
    let pout = 0;
    let focus = 0;
    let face: Expression = this.hovered ? 'happy' : 'neutral';
    this.tremble = 0;
    const crossed = (at: number) => t >= at && t - dt < at;
    switch (act) {
      case 'poked': {
        // Puffed up and glaring; then the sigh, spikes going in from the tail.
        puff = t < SIGH ? 1 : 1 - ease((t - SIGH) / 2.2);
        for (let i = 0; i < BANDS; i++) rows[i] = t < SIGH + 0.3 + (BANDS - 1 - i) * 0.3 ? 1 : 0;
        pout = t > SIGH - 0.1 && t < SIGH + 1.2 ? 1 : 0;
        if (crossed(SIGH + 0.2)) this.blow(BEACON.sad!);
        face = t < 0.5 ? 'surprised' : t < SIGH ? 'cross' : t < SIGH + 2.2 ? 'sleepy' : 'neutral';
        break;
      }
      case 'dizzy':
        puff = t < 2.6 ? 0.6 : 0.6 * (1 - ease((t - 2.6) / 1.4));
        out = puff > 0.3 ? 1 : 0;
        face = t < 2.6 ? 'surprised' : 'dizzy';
        break;
      case 'balloon':
        if (t < HOLD) {
          // Holding its breath, puffing up on purpose, trembling with it.
          puff = 0.85 * ease(t / HOLD);
          out = t > HOLD * 0.5 ? 1 : 0;
          face = 'focused';
          focus = 1;
          this.tremble = t > 1 ? 1 : 0;
        } else {
          // Let go: the air rushing out sends it zipping off.
          puff = 0.85 * (1 - ease((t - HOLD) / 1.2));
          out = puff > 0.35 ? 1 : 0;
          pout = t < HOLD + 1.2 ? 1 : 0;
          face = t < HOLD + 1.4 ? 'surprised' : 'happy';
        }
        if (crossed(HOLD))
          this.swimTo(this.spot + (Math.random() < 0.5 ? -1 : 1) * H * (4 + Math.random() * 3));
        break;
      case 'ring':
        // A breath in, a pout, and out it goes.
        puff = t < 0.9 ? 0.15 * ease(t / 0.9) : 0;
        pout = t > 0.2 && t < 1.3 ? 1 : 0;
        // Its eyes on the ring, not you, till it's well away.
        focus = t < 2.6 ? 1 : 0;
        face = t < 0.9 ? 'focused' : 'happy';
        if (crossed(0.9)) this.blow(BEACON.happy!);
        break;
      case 'nibble': {
        focus = 1;
        const peck =
          t > 1.2 && t < this.actLength - 1.2 ? Math.sin(2 * Math.PI * 2.2 * (t - 1.2)) : -1;
        pout = peck > 0.6 ? 1 : 0;
        if (this.frame) {
          // Nose down (or up) to the bottom (or top) of the frame.
          const side = this.sideOf(this.frame, this.spot);
          const k = clamp(Math.min(t, this.actLength - t), 0, 1);
          if (side === 'bottom') p.add('body', 65 * k);
          if (side === 'top') p.add('body', -65 * k);
        }
        break;
      }
      case 'sigh': {
        // A breath in, held a moment, and out in a long sigh: spikes sink from the tail.
        puff = t < 1.4 ? 0.6 * ease(t / 1.2) : 0.6 * (1 - ease((t - 2) / 2.2));
        for (let i = 0; i < BANDS; i++)
          rows[i] = t > 0.9 && t < 2.2 + (BANDS - 1 - i) * 0.35 ? 1 : 0;
        pout = t > 2 && t < 3.4 ? 1 : 0;
        face = t < 1.4 ? 'surprised' : t < 4.2 ? 'sleepy' : 'neutral';
        if (crossed(2.1)) this.blow(BEACON.sad!, 0.55);
        if (t > 2) p.add('body', 9 * Math.sin(clamp((t - 2) / 2.4, 0, 1) * Math.PI));
        break;
      }
      case 'rise': {
        // Puffs itself up to float, hangs there, and sinks with a sigh.
        puff = t < 3.9 ? 0.7 * ease(t / 1.4) : 0.7 * (1 - ease((t - 3.9) / 1.8));
        out = t > 1 && t < 4.4 ? 1 : 0;
        pout = t > 3.9 && t < 5 ? 1 : 0;
        face = t < 3.9 ? 'happy' : 'sleepy';
        p.add('body', t > 0.6 && t < 3.9 ? -10 : 0);
        if (crossed(4.1)) this.blow(BEACON.sad!, 0.5);
        break;
      }
      case 'flex': {
        // A little bodybuilder: spikes out row by row, fins spread, then a wink.
        puff = 0.55 * ease(t / 0.8) * (t < 3.8 ? 1 : 1 - ease((t - 3.8) / 0.7));
        for (let i = 0; i < BANDS; i++) rows[i] = t > 0.6 + i * 0.28 && t < 3.9 + i * 0.1 ? 1 : 0;
        this.flex.update(dt, t > 0.5 && t < 3.6 ? 1 : 0);
        face = t < 2.6 ? 'focused' : 'wink';
        focus = 1;
        p.add('body', -12 * bump(t - 2, 2));
        break;
      }
      case 'ripple': {
        // Spikes rise and fall in a wave from face to tail.
        puff = 0.15;
        for (let i = 0; i < BANDS; i++)
          rows[i] =
            clamp(1.3 * Math.sin(2 * Math.PI * (t * 0.9 - i * 0.16)) + 0.2, 0, 1) *
            (t < this.actLength - 0.4 ? 1 : 0);
        face = 'happy';
        break;
      }
      case 'hiccup': {
        // Three hiccups: a little puff, spikes flicking out, a startled face.
        const at = [0.7, 1.7, 2.6].findIndex((x) => crossed(x));
        if (at >= 0) {
          this.puff.kick(3.5);
          p.kick('body', -14);
        }
        const near = [0.7, 1.7, 2.6].some((x) => t > x && t < x + 0.25);
        for (let i = 0; i < BANDS; i++) rows[i] = near ? 1 : 0;
        face = near ? 'surprised' : 'neutral';
        if (crossed(3.1)) this.blow(BEACON.happy!, 0.4);
        pout = t > 2.9 && t < 3.5 ? 1 : 0;
        break;
      }
      case 'sneeze': {
        // In goes the breath, the face scrunches, and out it comes; a recoil.
        if (t < 1) {
          puff = 0.5 * ease(t / 1);
          out = t > 0.6 ? 1 : 0;
          face = t < 0.7 ? 'sleepy' : 'cross';
          p.add('body', -14 * ease(t));
        } else {
          puff = 0.5 * (1 - ease((t - 1) / 0.35));
          face = 'surprised';
          pout = t < 1.8 ? 1 : 0;
        }
        if (crossed(1)) {
          this.puff.kick(-9);
          this.blow(BEACON.surprised!, 1.2);
          this.vel.x -= this.toward * H * 4;
          p.kick('body', 35);
        }
        break;
      }
      case 'yawn': {
        // A big round mouth, eyes sliding shut, and a little bubble.
        pout = t > 0.4 && t < 2.6 ? 1.9 : 0;
        puff = 0.1 * bump(t - 1.5, 1.5);
        face = t < 0.5 ? 'neutral' : t < 2.8 ? 'asleep' : 'sleepy';
        p.add('body', -12 * bump(t - 1.5, 1.4));
        if (crossed(2.4)) this.blow(BEACON.happy!, 0.5);
        break;
      }
      case 'jet': {
        // Sucks water in, then spits it out behind: off it shoots.
        puff = t < 0.8 ? 0.3 * ease(t / 0.8) : 0.3 * (1 - ease((t - 0.8) / 0.4));
        pout = t > 0.3 && t < 1.6 ? 1.4 : 0;
        face = t < 0.8 ? 'focused' : 'happy';
        p.add('body', t < 0.8 ? 14 * ease(t / 0.8) : 0);
        if (crossed(0.8)) {
          this.kickTo(this.toward);
          this.puppet.kick('body', -30);
        }
        break;
      }
      case 'ball': {
        // Puffs up into a ball, smooth and round with its spikes in, and rolls off.
        puff = t < 0.8 ? 1.05 * ease(t / 0.8) : 1.05 * (1 - ease((t - this.actLength + 1.2) / 1));
        out = 0;
        face = t < this.actLength - 0.8 ? 'happy' : 'neutral';
        if (crossed(0.9)) this.swimTo(this.spot + this.loopDir(this.toward) * H * 4);
        if (crossed(2.9)) this.swimTo(this.spot - this.loopDir(this.toward) * H * 1.5);
        break;
      }
      case 'bounce': {
        // Blown up tight and spiky, it drops on the frame line and bounces off it.
        puff = 1;
        out = 1;
        face = 'cross';
        for (const k of [0, 0.85, 1.7, 2.55, 3.4]) if (crossed(k) && k > 0) this.squash.kick(-2.4);
        break;
      }
      case 'circle':
        face = 'happy';
        break;
      case 'peek': {
        // Off into the back of the box; there it looks about, then swims out to the front.
        if (crossed(4.6)) this.depthGoal = 0;
        if (crossed(0.2)) this.depthGoal = 1;
        face = t < 3.2 ? 'neutral' : t < 5.2 ? 'focused' : 'surprised';
        p.add('body', 12 * Math.sin(t * 1.8), 0, 5 * Math.sin(t * 1.3));
        puff = t > 5.6 && t < 7.4 ? 0.2 : 0;
        break;
      }
      case 'chase': {
        // Spins after its own tail, quick, and gives up dizzy.
        face = t < 2.4 ? 'focused' : 'dizzy';
        p.add('body', 0, 0, 15);
        break;
      }
      case 'lookaround':
        face = 'neutral';
        p.add('body', 10 * Math.sin(t * 1.1 + 1), 0, 0);
        break;
      case 'shy': {
        // Holds its fins up in front of it like a bashful child, and winks.
        const on = t > 0.2 && t < this.actLength - 0.8 ? 1 : 0;
        this.cover.update(dt, on);
        face = t > 1.6 && t < 2.2 ? 'wink' : 'love';
        break;
      }
      case 'chilly':
        // A shiver, spikes flicking, fins tucked in.
        this.tremble = 1;
        for (let i = 0; i < BANDS; i++) rows[i] = Math.sin(time * 26 + i * 2) > 0.3 ? 0.35 : 0;
        break;
      case 'disco':
        // Bobbing to a beat, lights flashing on it.
        p.add('body', 6 * Math.sin(t * 2 * Math.PI * 2), 0, 12 * Math.sin(t * 2 * Math.PI));
        break;
      case 'playdead': {
        // Floats up belly first, eyes crossed out... and pops back.
        face = t < 0.6 ? 'surprised' : t < 4 ? 'dizzy' : 'surprised';
        if (crossed(4.1)) {
          this.puff.kick(6);
          this.hold();
        }
        out = t > 4 && t < 4.7 ? 1 : 0;
        puff = t > 4 && t < 4.7 ? 0.7 : 0;
        break;
      }
      case 'proud': {
        // Puffs itself up bigger and bigger at a crewmate, spikes out along the row, chin up.
        const m = this.mate();
        if (m) this.toward = Math.sign(m.x - this.pos.x) || 1;
        puff = t < 3.5 ? 0.9 * ease(t / 1.2) : 0.9 * (1 - ease((t - 3.5) / 0.9));
        for (let i = 0; i < BANDS; i++) rows[i] = t > 0.6 + i * 0.15 && t < 3.6 + i * 0.1 ? 1 : 0;
        this.flex.update(dt, t > 1 && t < 3.4 ? 0.6 : 0);
        face = t < 3.5 ? 'happy' : 'wink';
        p.add('body', -10 * bump(t - 2, 2));
        break;
      }
      case 'wave':
        // A fin waved at whoever is there.
        this.wave.update(dt, t > 0.4 && t < this.actLength - 0.6 ? 1 : 0);
        break;
      case 'halfpuff': {
        // A slow half-breath in, to peek at something, held, then let out gently.
        puff = 0.5 * ease(t / 2.8) * (t < 3.8 ? 1 : 1 - ease((t - 3.8) / 1.4));
        for (let i = 0; i < BANDS; i++)
          rows[i] = t > 2.2 + (BANDS - 1 - i) * 0.12 && t < 3.9 ? 0.4 : 0;
        face = t < 2.8 ? 'sleepy' : t < 3.9 ? 'surprised' : 'neutral';
        focus = t < 3.9 ? 0.5 : 0;
        pout = t > 3.8 && t < 4.8 ? 1 : 0;
        p.add('body', -8 * bump(t - 3, 2));
        if (crossed(4)) this.blow(BEACON.neutral!, 0.5);
        break;
      }
      case 'mousepuff': {
        // Puffs itself up bigger and bigger at the mouse pointer, glaring at it.
        puff =
          t < this.actLength - 1.2
            ? 0.95 * ease(t / 0.9)
            : 0.95 * (1 - ease((t - this.actLength + 1.2) / 1));
        out = t > 0.5 && t < this.actLength - 1.2 ? 1 : 0;
        face = t < this.actLength - 1 ? 'cross' : 'neutral';
        p.add('body', -6);
        break;
      }
      case 'bubbles': {
        // Little quick bubbles, one after another, out of a pouting mouth.
        const at = [0.8, 1.5, 2.2, 2.9, 3.6];
        pout = at.some((x) => t > x - 0.3 && t < x + 0.1) ? 1 : 0;
        if (at.some((x) => crossed(x))) this.blow(BEACON.happy!, 0.45, 1.1);
        p.add('body', 6 * Math.sin(t * 8) * (t > 0.5 && t < 4 ? 1 : 0));
        break;
      }
      case 'shrink': {
        // Something scary: it shrinks in on itself, trembling, and peeks out again.
        const k = ease(t / 0.5) * (t < this.actLength - 1 ? 1 : 1 - ease(t - this.actLength + 1));
        puff = -0.2 * k;
        this.tremble = k > 0.5 ? 1 : 0;
        this.cover.update(dt, k > 0.5 && t < this.actLength - 1.3 ? 0.6 : 0);
        face = t < this.actLength - 1 ? 'surprised' : 'sad';
        p.add('body', 0, 0, 10 * k);
        break;
      }
      case 'kiss': {
        // Right up at the front lip: a pout, a kiss, a little bubble heart, a wink.
        pout = t > 0.5 && t < 2.4 ? 1.3 : 0;
        face = t < 0.5 ? 'happy' : t < 2.4 ? 'love' : 'wink';
        p.add('body', 10 * bump(t - 1.5, 1.2));
        if (crossed(1.6)) this.blow(BEACON.love!, 0.5, 2);
        break;
      }
      case 'spinout': {
        // Every spike out, turning like a mace ball on the spot.
        puff = 0.9 * (t < 3.6 ? ease(t / 0.7) : 1 - ease((t - 3.6) / 0.8));
        out = t > 0.4 && t < 3.9 ? 1 : 0;
        face = t < 3.6 ? 'happy' : 'dizzy';
        break;
      }
      case 'bumpmate': {
        // Swims straight at a crewmate, bonks it, puffs up in a fright and backs off.
        if (crossed(1.8)) {
          this.puff.kick(5);
          this.hold();
        }
        const fr = t > 1.8 && t < 4;
        puff = fr ? 0.85 : 0.85 * (1 - ease((t - 4) / 1)) * (t > 4 ? 1 : 0);
        out = fr ? 1 : 0;
        face = t < 1.8 ? 'focused' : t < 2.4 ? 'surprised' : t < 4 ? 'cross' : 'sleepy';
        if (crossed(4)) this.blow(BEACON.sad!, 0.5);
        break;
      }
      case 'love':
        face = 'love';
        p.add('body', 0, 0, 7 * sin(t, 0.9));
        break;
      case 'doze':
        p.add('body', 8 + 2 * sin(time, 0.2));
        // A bubble now and then as it snores.
        if (this.ringT < 0 && Math.sin(t * 1.3) > 0.995) this.blow(BEACON.neutral!, 0.4);
        break;
    }
    if (act !== 'shy' && act !== 'shrink') this.cover.update(dt, 0);
    if (act !== 'flex' && act !== 'proud') this.flex.update(dt, 0);
    if (act !== 'wave') this.wave.update(dt, 0);
    for (let i = 0; i < BANDS; i++) rows[i] = Math.max(rows[i], out);
    this.expression = face;
    this.puffNow = this.puff.update(dt, puff);
    this.rowsNow = this.rows.map((r, i) => r.update(dt, rows[i]));
    this.pout.update(dt, pout);
    this.soft.update(dt, act === 'love' ? 1 : 0);
    // Minding its business: the mouse only gets its eyes.
    const k = this.focus.update(dt, focus);
    this.spec.gaze[0].yaw = 0.6 * (1 - 0.8 * k);
    this.spec.gaze[0].pitch = 0.5 * (1 - 0.8 * k);

    // Swimming: nose up or down as it rises or sinks, a wiggle as its tail goes.
    const swim = this.swimming();
    if (this.free) p.add('body', clamp(this.vel.y / (H * 2), -1, 1) * 15);
    p.add('body', 0, -4 * swim * Math.sin(this.tailPhase));
    p.add('root', 0, this.aside.y);
    if (act === 'dizzy' && t > 2.6)
      p.add('body', 10 * Math.cos(time * 5), 0, 10 * Math.sin(time * 5));
    // The sigh: fins and body sag, then pick up again.
    if (act === 'poked' && t > SIGH)
      p.add('body', 10 * Math.sin(Math.min(1, (t - SIGH) / 2.2) * Math.PI));
  }

  /** 0 still, 1 swimming hard. */
  private swimming() {
    const speed = this.free ? Math.hypot(this.vel.x, this.vel.y) : Math.abs(this.pace);
    return clamp(speed / (this.heightPx * 1.5), 0, 1);
  }

  /** The studs' lights, five rows from face to tail. */
  private lights(time: number) {
    const act = this.act;
    const t = this.actT;
    const moving = this.swimming() > 0.25;
    for (let i = 0; i < BANDS; i++) {
      const out = clamp(this.rowsNow[i], 0, 1);
      let level: number;
      let tone: string | undefined;
      if (act === 'poked' && t < 0.7) {
        // Startled: every spike flashing.
        level = Math.sin(time * 34) > 0 ? 1 : 0.4;
        tone = BEACON.surprised;
      } else if (act === 'poked') {
        // Puffed up, a warning glow; each row settles back to a spot as it sinks.
        level = out > 0.5 ? 0.75 + 0.25 * Math.sin(time * 6 + i) : 0.6;
        tone = out > 0.5 ? BEACON.happy : undefined;
      } else if (act === 'dizzy') {
        level = Math.sin(time * 7 + i * 2.3) > 0.2 ? 1 : 0.15;
        tone = RAINBOW[(i * 3 + Math.floor(time * 3)) % RAINBOW.length];
      } else if (act === 'love') {
        // Blushing: a warm pink breathing down its sides.
        level = 0.65 + 0.35 * Math.sin(time * 2.4 - i * 0.6);
        tone = BEACON.love;
      } else if (act === 'balloon' && t < HOLD) {
        // Holding its breath: the rows fill up from the tail, like a gauge.
        level = clamp((t / HOLD) * (BANDS + 1) - (BANDS - 1 - i), 0.2, 1);
        tone = BEACON.happy;
      } else if (act === 'balloon' || act === 'twirl') {
        // Off like a balloon, or looping: colours racing along the rows.
        level = 1;
        tone = RAINBOW[(i + Math.floor(time * 10)) % RAINBOW.length];
      } else if (act === 'ring' && t < 0.9) {
        // Charging up: a wave running forward to its mouth.
        level = 0.35 + 0.65 * bump(i - (BANDS - 1) * (1 - t / 0.9), 1.3);
        tone = BEACON.happy;
      } else if (act === 'sigh' || act === 'yawn' || act === 'chilly') {
        // Low and slow, or shivering blue.
        level =
          act === 'chilly'
            ? 0.4 + 0.3 * Math.sin(time * 26 + i)
            : 0.35 + 0.25 * Math.sin(time * 1.4 - i * 0.5);
        tone = act === 'chilly' ? BEACON.sad : undefined;
      } else if (act === 'rise' || act === 'flex' || act === 'proud') {
        // Rows lighting up in turn, face to tail, as it fills.
        level = clamp(((t % 5) / 1.4) * BANDS - i, 0.25, 1);
        tone = BEACON.happy;
      } else if (act === 'ripple') {
        level = 0.45 + 0.55 * bump(cycle(t * 0.9) - i * 0.16, 0.3);
        tone = RAINBOW[(i * 2) % RAINBOW.length];
      } else if (
        act === 'jet' ||
        act === 'ball' ||
        act === 'chase' ||
        act === 'disco' ||
        act === 'wave'
      ) {
        level =
          act === 'disco'
            ? Math.sin(t * 2 * Math.PI * 2 + i) > 0
              ? 1
              : 0.25
            : act === 'wave'
              ? 0.6 + 0.4 * Math.sin(time * 6 - i)
              : 1;
        tone =
          act === 'wave'
            ? BEACON.happy
            : RAINBOW[(i + Math.floor(time * (act === 'disco' ? 4 : 10))) % RAINBOW.length];
      } else if (act === 'hiccup' || act === 'sneeze' || act === 'bounce') {
        level = 0.5 + 0.5 * Math.sin(time * 20 + i * 1.7);
        tone = act === 'bounce' ? BEACON.wink : BEACON.surprised;
      } else if (act === 'spinout' || act === 'mousepuff' || act === 'bumpmate') {
        level = act === 'spinout' ? 1 : 0.6 + 0.4 * Math.sin(time * 18 + i * 1.7);
        tone =
          act === 'spinout'
            ? RAINBOW[(i * 2 + Math.floor(time * 8)) % RAINBOW.length]
            : BEACON.surprised;
      } else if (act === 'halfpuff' || act === 'bubbles' || act === 'kiss') {
        level = 0.45 + 0.4 * Math.sin(time * 2.2 - i * 0.7) ** 2;
        tone = act === 'kiss' ? BEACON.love : BEACON.happy;
      } else if (act === 'shrink') {
        level = 0.2 + 0.25 * Math.sin(time * 30 + i * 2);
        tone = BEACON.sad;
      } else if (act === 'playdead') {
        level = t < 4 ? 0.06 : 1;
        tone = BEACON.surprised;
      } else if (act === 'shy') {
        level = 0.6 + 0.4 * Math.sin(time * 3 - i * 0.5);
        tone = BEACON.love;
      } else if (act === 'nibble') {
        // Each peck lights the front row.
        const peck = t > 1.2 ? Math.max(0, Math.sin(2 * Math.PI * 2.2 * (t - 1.2))) : 0;
        level = i === 0 ? 0.4 + 0.6 * peck : 0.55;
        tone = i === 0 ? BEACON.focused : undefined;
      } else if (act === 'doze') {
        // A slow, dim breath.
        level = 0.2 + 0.15 * Math.sin(time * 0.8);
      } else if (moving) {
        // Swimming: lights streaming back from face to tail.
        level = 0.5 + 0.5 * bump(cycle(time * 1.6) - i / BANDS, 0.22);
      } else {
        // Its spots, shimmering now and then.
        level = 0.72 + 0.18 * Math.sin(time * 0.9 - i * 0.8);
        tone = this.hovered ? BEACON.happy : undefined;
      }
      this.outfit.dot(i, level, tone);
    }
  }

  /**
   * Put the ring where it has got to (u, 0 to 1): out of the mouth, then up, in page
   * space. Half turned to the page, so it reads as a ring even blown side on.
   */
  private flyRing(u: number) {
    const body = this.puppet.bone('body');
    const ring = this.puppet.bone('ring');
    // Where the fish is this frame (the base class places it after this).
    if (this.free) {
      this.holder.position.set(this.free.x, -this.free.y, 0);
      this.pivot.rotation.z = this.free.tilt;
    }
    ring.updateWorldMatrix(true, false);
    if (this.ringNew) {
      this.ringNew = false;
      body.localToWorld(this.ringFrom.copy(this.ringRest));
      // The ring bone points out of the mouth.
      this.ringWay.set(0, 1, 0).transformDirection(ring.matrixWorld);
      const yaw = Math.atan2(this.ringWay.x, this.ringWay.z);
      ring.getWorldQuaternion(this.ringTurn);
      this.ringTurn.premultiply(qa.setFromAxisAngle(UP, -0.6 * yaw));
      const f = this.frame;
      const middle = f ? (f.left + f.right) / 2 : 0;
      const toward = Math.sign(middle - (this.free?.x ?? middle)) || 1;
      this.ringSide =
        (Math.abs(this.ringWay.x) > 0.3 ? Math.sign(this.ringWay.x) : toward) *
        (1 - Math.abs(this.ringWay.x));
    }
    const metre = body.getWorldScale(va).x;
    va.copy(this.ringFrom)
      .addScaledVector(this.ringWay, metre * (0.04 + 0.09 * ease(u * 2.5)))
      .addScaledVector(UP, metre * 0.3 * u ** 1.7);
    va.x += metre * (0.02 * Math.sin(u * 6) + 0.12 * this.ringSide * ease(u * 1.6));
    ring.position.copy(body.worldToLocal(va));
    ring.quaternion.copy(body.getWorldQuaternion(qa).invert().multiply(this.ringTurn));
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    const time = env.time;
    this.lights(time);

    // The pod swells on its own bone; soft, it sags and wobbles like jelly.
    const soft = this.soft.y;
    const s = 1 + SWELL * clamp(this.puffNow, -0.2, 1.35) - 0.05 * soft;
    const jelly = soft * 0.035 * Math.sin(time * 7) + 0.12 * this.squash.update(dt, 0);
    p.stretch('shell', s * (1 + jelly), [0, 1, 0], s * (1 - jelly / 2));
    // Spikes telescope out of it, row by row, and thicken a little with it.
    for (const { bone, dir, band } of this.spikes) {
      const along = 1 + (1 / CALM - 1) * clamp(this.rowsNow[band], 0, 1.15);
      p.stretch(bone, along / s, dir, 1 / Math.sqrt(s));
    }
    // Fins, tail and mouth ride out with the pod but keep their size; the face grows a
    // little.
    const big = 1 + 1.6 * this.cover.y + 0.6 * this.flex.y;
    for (const b of KEEP)
      p.stretch(
        b,
        (b.startsWith('fin') ? big : 1) / s,
        [0, 1, 0],
        (b.startsWith('fin') ? big : 1) / s,
      );
    p.stretch('face', 1 / Math.sqrt(s), [0, 1, 0], 1 / Math.sqrt(s));
    const pout = clamp(this.pout.y, 0, 1.3);
    p.stretch('mouth', (1 + 0.3 * pout) / s, [0, 0, 1], (1 + 0.3 * pout) / s);
    p.shift('mouth', 0, 0, 0.012 * pout);

    // Fins: a slow scull, out of step, at rest; a buzz when it swims, turns or puffs.
    const turning = Math.abs(this.heading.v) / 60;
    const startled = this.act === 'poked' && this.actT < 0.8 ? 1 : 0;
    const busy = Math.max(
      this.swimming(),
      clamp(turning, 0, 1),
      startled,
      this.act === 'love' ? 0.5 : 0,
    );
    const buzz = this.buzz.update(dt, this.act === 'doze' ? 0 : Math.max(0.12, busy));
    this.finPhase += dt * 2 * Math.PI * (1.2 + 10 * buzz);
    for (const [fin, side] of FINS) {
      const a = Math.sin(this.finPhase + (side > 0 ? 0 : (1 - buzz) * Math.PI * 0.6));
      p.turn(fin, 0, side * (12 + 16 * buzz) * a, side * (6 + 12 * buzz) * a);
      // Over its face; spread wide to show off; one waving hello.
      const hide = this.cover.y;
      p.turn(
        fin,
        0,
        -side * 118 * hide + side * 30 * this.flex.y,
        side * (-30 * hide + 40 * this.flex.y),
      );
      if (side > 0) p.turn(fin, 0, 0, 55 * this.wave.y + 35 * this.wave.y * Math.sin(time * 15));
    }
    // Tail: a lazy sway, a real wag swimming (and a happy one when soft).
    const swim = Math.max(this.swimming(), 0.6 * soft);
    this.tailPhase += dt * 2 * Math.PI * (0.6 + 2.6 * swim);
    p.turn('tail', 0, (8 + 22 * swim) * Math.sin(this.tailPhase));

    // The ring: out of the mouth first, then up and away, growing, then pop.
    if (this.ringT >= 0) {
      this.ringT += dt;
      const u = this.ringT / this.ringDur;
      if (u >= 1) this.ringT = -1;
      else {
        const size = this.ringSize * (u < 0.9 ? 0.3 + 1.1 * ease(u / 0.5) : 1.4 + 4 * (u - 0.9));
        p.stretch('ring', size, [0, 1, 0], size);
        this.flyRing(u);
        this.outfit.beacon(this.ringTone);
      }
    }
    if (this.ringT < 0) {
      p.stretch('ring', 0.001, [0, 1, 0], 0.001);
      p.shift('ring', 0, 0, 0);
    }

    if (this.tremble) p.turn('body', 0, 0, 2.5 * Math.sin(time * 70));

    // Dizzy: round and round, easing in and out.
    if (this.act === 'dizzy') {
      const u = clamp((this.actT - 0.2) / 2.4, 0, 1);
      this.pivot.rotation.y = 4 * Math.PI * u * u * (3 - 2 * u);
    } else if (this.act === 'spinout') {
      const u = clamp((this.actT - 0.6) / 2.8, 0, 1);
      this.pivot.rotation.y = 4 * Math.PI * u * u * (3 - 2 * u);
    } else if (this.act === 'chase') {
      const u = clamp((this.actT - 0.2) / 2.2, 0, 1);
      this.pivot.rotation.y = 6 * Math.PI * u * (2 - u) * this.toward;
    } else this.pivot.rotation.y = 0;
  }
}
