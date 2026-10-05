import type { Object3D } from 'three';
import { floorDepth } from './box';
import { BEACON, RAINBOW } from './bolt';
import { type Act, Character, clamp, type Env, type Frame } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import { Spring, wobble } from './spring';

/**
 * Pogo, the robot bunny: a round body on big flat hind feet, a screen face with a
 * twitching nose and whiskers, and two long ears of three hinged plates each. He gets
 * about in hops, one at a time or a whole run of them (zoomies across the floor, a
 * pounce, a somersault, pogo bounces on the spot), and his ears are what he is about.
 *
 * The ears say how he feels. Up and turning after the mouse when he's curious; one
 * folded over when he's relaxed, bent forward when he's puzzled; pressed flat back when
 * he's scared; hanging down the sides when he's sad; wiggling when he's happy; stiff and
 * sweeping like antennas when he's picking up a signal; pulled down over his face when
 * he's shy; and spinning like propellers when he's overjoyed, lifting him off the floor.
 * The panels on their fronts light in the colour of his mood.
 *
 * Little tricks, about thirty of them: sitting up tall to look around, sniffing with his
 * nose going, washing his face with his paws, pulling an ear down to groom it, scratching
 * behind it with a hind foot, thumping a foot, nibbling a carrot he keeps about him,
 * digging, stretching, shaking himself out, dozing off and jerking awake, flopping over
 * for a rest, hopping to the back wall and peeking round his shoulder, to the front lip
 * to look over it, or across to a crewmate to wave an ear at them.
 *
 * Rest the mouse on him and he's delighted: a binky (a leap with a twist and a kick),
 * then ears up and wiggling for as long as you stay. A poke makes him jump, ears flat, and
 * thump a hind foot; three pokes and he's dizzy, his ears swinging round in circles.
 */
export const BUNNY_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.3, 0.5],
    [0.7, 0.5],
  ],
  rx: 0.09,
  ry: 0.3,
  line: 0.035,
  mouth: null,
};

type Side = 'L' | 'R';
type Mood =
  | 'calm'
  | 'alert'
  | 'happy'
  | 'love'
  | 'relaxed'
  | 'puzzled'
  | 'scared'
  | 'sad'
  | 'sleepy'
  | 'lying'
  | 'dizzy';

/**
 * One ear, in degrees: tipped forward (+) or back (-) at the root, out to the side,
 * curled forward at the knuckles, folded over sideways at the middle knuckle, and
 * swivelled about its own root (yaw).
 */
interface Ear {
  lift: number;
  out: number;
  bend: number;
  fold?: number;
  swivel?: number;
}

/** How each mood holds the ears: the odd ear (the one that folds or flops) first. */
const EARS: Record<Mood, [Ear, Ear]> = {
  calm: [
    { lift: 0, out: 5, bend: 3 },
    { lift: 0, out: 5, bend: 3 },
  ],
  alert: [
    { lift: 6, out: -2, bend: -4 },
    { lift: 6, out: -2, bend: -4 },
  ],
  happy: [
    { lift: 2, out: 12, bend: -3 },
    { lift: 2, out: 12, bend: -3 },
  ],
  love: [
    { lift: -6, out: 16, bend: 2 },
    { lift: -6, out: 16, bend: 2 },
  ],
  relaxed: [
    { lift: -10, out: 28, bend: 6, fold: 80 },
    { lift: -6, out: 8, bend: 4 },
  ],
  puzzled: [
    { lift: 16, out: 8, bend: 55 },
    { lift: 4, out: 0, bend: -3 },
  ],
  scared: [
    { lift: -80, out: 3, bend: -6 },
    { lift: -80, out: 3, bend: -6 },
  ],
  sad: [
    { lift: 10, out: 98, bend: 10, fold: 32 },
    { lift: 10, out: 98, bend: 10, fold: 32 },
  ],
  sleepy: [
    { lift: -55, out: 24, bend: 12 },
    { lift: -55, out: 24, bend: 12 },
  ],
  // Flopped on his side (the odd side down): ears laid out along the ground.
  lying: [
    { lift: -12, out: -8, bend: 0 },
    { lift: -22, out: 26, bend: 12 },
  ],
  dizzy: [
    { lift: 0, out: 20, bend: 10 },
    { lift: 0, out: 20, bend: 10 },
  ],
};

/** What each act makes of his mood (ears, lights); the rest is decided by the mouse. */
const MOODS: Record<string, Mood> = {
  poked: 'scared',
  dizzy: 'dizzy',
  miss: 'sad',
  sigh: 'sad',
  love: 'love',
  binky: 'happy',
  twirl: 'happy',
  pogo: 'happy',
  flip: 'happy',
  pounce: 'alert',
  tall: 'alert',
  run: 'alert',
  sniff: 'alert',
  thump: 'alert',
  peek: 'alert',
  lipview: 'alert',
  spook: 'scared',
  flop: 'lying',
  nibble: 'relaxed',
  loaf: 'sleepy',
  doze: 'sleepy',
  wash: 'relaxed',
  wave: 'happy',
  stretch: 'happy',
  scratch: 'relaxed',
  twitch: 'alert',
  lightshow: 'happy',
  fold: 'calm',
  hopover: 'alert',
  duck: 'scared',
  bow: 'happy',
};

/** The ears this frame, one per side, for an act to bend to its own purpose. */
type EarFn = (side: Side, e: Required<Ear>) => void;

/** How far one hop goes, in heights; a hop's time in the air (s) and the pause between. */
const HOP = 0.85;
const AIR = 0.3;
const PAUSE = 0.1;
const DEG = Math.PI / 180;
const SPEED = 2.6;
/** 1 at 0, falling to 0 at ±width. */
const bump = (x: number, width: number) => Math.max(0, 1 - Math.abs(x) / width);
const cycle = (x: number) => x - Math.floor(x);
/** Ease in and out, 0..1. */
const smooth = (x: number) => {
  const u = clamp(x, 0, 1);
  return u * u * (3 - 2 * u);
};
/** 0 before `a`, 1 after `b`, easing between. */
const ramp = (t: number, a: number, b: number) => smooth((t - a) / (b - a));
const other = (side: Side): Side => (side === 'L' ? 'R' : 'L');
/** +1 for the left side (+X), -1 for the right. */
const sign = (side: Side) => (side === 'L' ? 1 : -1);
const SIDES = ['L', 'R'] as const;

interface Leap {
  from: number;
  to: number;
  fromDepth: number;
  toDepth: number;
  /** 0 at take-off, 1 on landing. */
  u: number;
  time: number;
  height: number;
  /** A twist and a kick, a full turn about the up axis, a somersault. */
  kind: 'plain' | 'binky' | 'twirl' | 'flip';
}

export class Bunny extends Character {
  static readonly terms =
    'rabbit hare hop jump zoomies binky long ears grey gray white pink whiskers twitch nose carrot thump dig pounce cute';

  /** The odd ear out (the one that folds, or gets groomed), and the side he flops onto. */
  private odd: Side = 'L';
  /** Some spells of sitting about he spends with one ear folded over. */
  private lazy = false;
  private leap: Leap | null = null;
  /** Where he is in the current hop (0..1), -1 when on the ground. */
  private hopU = -1;
  private hopTime = AIR;
  private hopPause = PAUSE;
  /** Seconds since the last landing. */
  private ground = 1;
  /** The air phase just now, for the pose (-1 on the ground). */
  private air = -1;
  /** Seconds he has been standing where he is (0 while on the move). */
  private rest = 0;
  private pokes: number[] = [];
  private hover = 0;
  private petted = 0;
  private flash = 0;
  private lastT = 0;
  private nextTwitch = 2;
  private twitchAt = -10;
  private nextFlick = 3;
  private frame: Frame | null = null;
  private crew: readonly Character[] = [];
  private mouse = { x: 0, y: 0, still: 0 };
  /** How far over he's flopped, 0..1, for lifting him onto his side. */
  private over = new Spring(1.6, 0.45, 1, 0);
  /** Turned about the up axis, right round (a twirl), and up off the floor (a copter). */
  private twirl = 0;
  private lifted = new Spring(2.2, 0.5, 1, 0);
  private lift = 0;
  /** The way he faces if not the way he is walking, and how far he has turned to it. */
  private aim: number | null = null;
  private turned = new Spring(4, 0.7, 1, 0);
  /** How much of the carrot is left, and whether he has it out. */
  private carrot = new Spring(9, 0.5, 1, 0);
  private carrotOut = 0;
  /** Propeller ears: their angle, and how fast they are going (turns per second). */
  private prop = { angle: 0, rate: 0 };
  private earFn: EarFn | null = null;
  /** The extra state an act keeps for itself. */
  private mem: Record<string, number> = {};
  private who: Character | null = null;

  constructor(model: Object3D) {
    super(
      {
        name: 'Pogo',
        model: 'bunny',
        metres: 0.57,
        width: 0.34,
        size: 1.1,
        feels: {
          default: { f: 4, zeta: 0.6 },
          root: { f: 2.2, zeta: 0.5 },
          body: { f: 3, zeta: 0.5 },
          head: { f: 3.4, zeta: 0.55, r: 0.3 },
          muzzle: { f: 10, zeta: 0.5 },
          tail: { f: 6, zeta: 0.3 },
          'leg.L': { f: 6, zeta: 0.6 },
          'leg.R': { f: 6, zeta: 0.6 },
          'arm.L': { f: 5, zeta: 0.55 },
          'arm.R': { f: 5, zeta: 0.55 },
          // Springy ears, the tips looser than the roots, so they wobble and trail.
          'ear.L.1': { f: 3.2, zeta: 0.35 },
          'ear.R.1': { f: 3.2, zeta: 0.35 },
          'ear.L.2': { f: 3.6, zeta: 0.3 },
          'ear.R.2': { f: 3.6, zeta: 0.3 },
          'ear.L.3': { f: 4, zeta: 0.28 },
          'ear.R.3': { f: 4, zeta: 0.28 },
        },
        face: BUNNY_FACE,
        eyes: 0.51,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.9 },
          { bone: 'body', yaw: 0.2, pitch: 0 },
        ],
        reach: { yaw: 60, pitch: 30 },
        lag: 1.6,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: SPEED,
        turn: 80,
      },
      model,
    );
    this.acts = this.moves();
  }

  // ---------- The acts ----------

  private moves(): Record<string, Act> {
    const still = () => !this.walking && !this.leap && this.hopU < 0;
    const mates = () => this.mates().length > 0;
    // Where along the floor he might go: anywhere with room.
    const acts: Record<string, Act> = {
      idle: { weight: 3, length: [3, 6] },
      hop: {
        weight: 1.8,
        length: [1.2, 2],
        when: still,
        start: () => this.wander(0.6 + Math.random() * 1.1),
      },
      run: { weight: 0.6, length: [4, 6], when: still, start: () => this.zoom() },
      pounce: { weight: 0.4, length: [3, 3.6], when: still },
      pogo: { weight: 0.35, length: [3, 4], when: still },
      twirl: { weight: 0.3, length: [1.6, 1.6], when: still, start: () => this.twirlUp() },
      flip: { weight: 0.25, length: [1.8, 1.8], when: still, start: () => this.somersault() },
      binky: {
        weight: 0.3,
        length: [1.3, 1.3],
        face: 'happy',
        when: still,
        start: () => this.binky(),
      },
      copter: { weight: 0.3, length: [4.5, 5.5], when: still, face: 'happy' },
      spook: { weight: 0.25, length: [3.5, 4.5], when: still },
      // Sitting up and looking
      tall: { weight: 1, length: [3.5, 6], when: still },
      sniff: { weight: 1.2, length: [3, 5], when: still },
      antenna: { weight: 0.7, length: [5.5, 7], when: still },
      peek: { weight: 0.7, length: [6.5, 8], when: still, start: () => this.toWall() },
      lipview: { weight: 0.5, length: [5, 6.5], when: still, start: () => this.toLip() },
      thump: { weight: 0.5, length: [2.8, 3.4], when: still },
      twitch: { weight: 0.6, length: [3, 4], when: still, face: 'focused' },
      lightshow: { weight: 0.5, length: [5, 6.5], when: still, face: 'happy' },
      fold: { weight: 0.6, length: [5, 6], when: still },
      hopover: {
        weight: 0.4,
        length: [4, 5.5],
        when: () => still() && mates(),
        start: () => this.toMate(true),
      },
      duck: { weight: 0.4, length: [3.5, 5], when: still },
      bow: { weight: 0.4, length: [3, 3.6], when: still, face: 'happy' },
      wave: { weight: 0.4, length: [3, 4], when: still },
      visit: {
        weight: 0.5,
        length: [5, 7],
        when: () => still() && mates(),
        start: () => this.toMate(),
      },
      // Looking after himself
      groom: { weight: 0.8, length: [4, 7], face: 'happy', when: still },
      wash: { weight: 0.8, length: [4, 6], when: still },
      scratch: { weight: 0.6, length: [3.5, 5], when: still },
      shake: { weight: 0.5, length: [2.2, 2.6], when: still },
      stretch: { weight: 0.6, length: [3.5, 4.5], when: still },
      nibble: { weight: 0.9, length: [6, 8], face: 'focused', when: still },
      dig: { weight: 0.5, length: [3.5, 5], face: 'focused', when: still },
      hide: { weight: 0.5, length: [4.5, 6], when: still },
      // Resting
      loaf: { weight: 0.6, length: [6, 10], when: still },
      doze: { weight: 0.5, length: [7, 10], when: still },
      flop: { weight: 0.5, length: [7, 12], when: still },
      sigh: { weight: 0.3, length: [3.5, 4.5], when: still },
      // Reactions
      poked: { weight: 0, length: [2.8, 3.4], start: () => this.startle() },
      love: { weight: 0, length: [60, 60], face: 'love' },
      miss: { weight: 0, length: [2, 2.4], face: 'sad' },
      dizzy: { weight: 0, length: [4, 4], face: 'dizzy' },
    };
    return acts;
  }

  protected setAct(name: string) {
    this.odd = Math.random() < 0.5 ? 'L' : 'R';
    this.lazy = Math.random() < 0.4;
    this.mem = {};
    this.aim = null;
    this.spec.speed = SPEED;
    this.hopTime = AIR;
    this.hopPause = PAUSE;
    this.who = null;
    this.carrotOut = 0;
    super.setAct(name);
  }

  /** Other crew on the same floor, nearest first. */
  private mates() {
    return this.crew
      .filter((o) => o !== this && o.state === 'here' && o.edge === this.edge && !o.free)
      .sort((a, b) => Math.abs(a.s - this.s) - Math.abs(b.s - this.s));
  }

  /** Hop off along the floor (and in or out), a few heights either way. */
  private wander(heights: number) {
    const way = Math.random() < 0.5 ? -1 : 1;
    this.walkTo(this.s + way * this.heightPx * heights);
  }

  /** Off across the floor toward the side with more room, in a run of quick hops. */
  private zoom() {
    this.spec.speed = SPEED * 2.3;
    this.hopTime = 0.22;
    this.hopPause = 0.02;
    this.zoomLeg();
  }

  private zoomLeg() {
    if (!this.frame) return;
    const [lo, hi] = this.span(this.frame);
    const way = this.s - lo > hi - this.s ? -1 : 1;
    const room = (way > 0 ? hi - this.s : this.s - lo) - this.widthPx() * 1.5;
    const far = Math.min(room, this.heightPx * (3 + Math.random() * 3));
    this.walkTo(this.s + way * Math.max(0, far), Math.random());
    this.mem.legs = (this.mem.legs ?? 0) + 1;
  }

  /** To the back wall, on the far side of the floor. */
  private toWall() {
    this.walkTo(this.s + (Math.random() - 0.5) * this.heightPx * 3, 0.92);
  }

  /** To the front lip. */
  private toLip() {
    this.walkTo(this.s + (Math.random() - 0.5) * this.heightPx * 3, 0);
  }

  /** Over to the nearest crewmate. */
  private toMate(short = false) {
    const o = this.mates()[0];
    if (!o) return;
    this.who = o;
    // To hop over someone he stops short of them, on this side.
    const back = short ? Math.sign(this.s - o.s || 1) * this.heightPx * 0.9 : 0;
    this.walkTo(o.s + back, o.depth);
  }

  /** A leap for joy, a little way along, twisting and kicking at the top. */
  private binky() {
    if (this.leap) return;
    const way = Math.random() < 0.5 ? -1 : 1;
    this.jump(way * this.heightPx * 0.15, 0.62, this.heightPx * 0.5, 'binky');
  }

  private twirlUp() {
    this.jump(0, 0.9, this.heightPx * 0.55, 'twirl');
  }

  private somersault() {
    this.jump(0, 0.95, this.heightPx * 0.7, 'flip');
  }

  private jump(
    step: number,
    time: number,
    height: number,
    kind: Leap['kind'] = 'plain',
    depth = this.depth,
  ) {
    this.leap = {
      from: this.s,
      to: this.s + step,
      fromDepth: this.depth,
      toDepth: this.floorFrame ? Math.min(depth, this.backmost(this.floorFrame)) : depth,
      u: 0,
      time,
      height,
      kind,
    };
  }

  poke() {
    if (this.state !== 'here') return;
    const now = performance.now() / 1000;
    this.pokes = [...this.pokes.filter((at) => now - at < 3), now];
    if (this.pokes.length >= 3) {
      this.pokes = [];
      this.setAct('dizzy');
    } else if (this.act !== 'dizzy') this.setAct('poked');
  }

  /** A jump on the spot, ears slammed flat. */
  private startle() {
    this.goal = null;
    this.depthGoal = this.depth;
    this.flash = 1;
    this.hopU = -1;
    if (!this.leap) this.jump(0, 0.28, this.heightPx * 0.16);
    for (const side of SIDES) this.puppet.kick(`ear.${side}.1`, -500);
  }

  protected onEnter() {
    this.leap = null;
    this.hopU = -1;
    this.h = 0;
    this.ground = 1;
    this.over.snap(0);
    this.lifted.snap(0);
    this.carrot.snap(0);
  }

  // ---------- Getting about: in hops ----------

  protected move(dt: number, env: Env) {
    this.frame = env.frame;
    this.crew = env.crew;
    const [s, depth] = [this.s, this.depth];
    super.move(dt, env);
    // The base class glides toward the goal; a bunny gets there in hops: it moves only
    // while he is in the air.
    const deep = floorDepth(env.frame);
    const going = this.goal !== null || Math.abs(this.depthGoal - this.depth) * deep > 0.5;
    if (this.leap) {
      [this.s, this.depth] = [s, depth];
      this.leaping(dt);
    } else if (this.hopU >= 0 || (going && this.ground >= this.hopPause)) {
      if (this.hopU < 0) {
        this.hopU = 0;
        const d = Math.hypot(
          this.goal === null ? 0 : this.goal - s,
          (this.depthGoal - depth) * deep,
        );
        const k = Math.min(1, d / (this.heightPx * HOP));
        this.hopTime = (this.hopTime === 0.22 ? 0.22 : AIR) * (0.8 + 0.3 * k);
      }
      this.hopU = Math.min(1, this.hopU + dt / this.hopTime);
      const k = Math.sin(Math.PI * this.hopU);
      this.h = this.heightPx * (0.12 + 0.14 * Math.min(1, this.stride / (this.heightPx * 2))) * k;
      this.air = this.hopU;
      if (this.hopU >= 1) {
        this.hopU = -1;
        this.h = 0;
        this.air = -1;
        this.land(0.25);
      }
    } else {
      [this.s, this.depth] = [s, depth];
      this.h = 0;
      this.ground += dt;
      this.air = -1;
    }
    // Up off the floor, for an act that lifts him.
    this.h += this.lift;
    const still = !this.leap && this.hopU < 0 && this.goal === null && this.stride < 8;
    this.rest = still ? this.rest + dt : 0;
  }

  private leaping(dt: number) {
    const leap = this.leap;
    if (!leap) return;
    leap.u = Math.min(1, leap.u + dt / leap.time);
    const e =
      leap.kind === 'flip' || leap.kind === 'twirl' ? smooth(leap.u) * 0.4 + leap.u * 0.6 : leap.u;
    this.s = leap.from + (leap.to - leap.from) * e;
    this.depth = leap.fromDepth + (leap.toDepth - leap.fromDepth) * e;
    this.h = leap.height * 4 * leap.u * (1 - leap.u);
    this.air = leap.u;
    if (leap.u >= 1) {
      this.leap = null;
      this.h = 0;
      this.air = -1;
      this.land(leap.height / this.heightPx);
    }
  }

  /** Down: the ears flop on, the body dips. */
  private land(hard: number) {
    const p = this.puppet;
    this.ground = 0;
    p.kick('body', 500 * hard);
    for (const side of SIDES) {
      p.kick(`ear.${side}.1`, 900 * hard);
      p.kick(`ear.${side}.2`, 700 * hard);
    }
  }

  protected idle(t: number) {
    const p = this.puppet;
    // Breathing, and the head never quite still.
    p.add('body', 1.2 * sin(t, 0.3));
    p.add('head', 2.5 * wobble(t * 0.4, 5), 0, 3 * wobble(t * 0.3, 2));
  }

  // ---------- How he feels ----------

  private feel(env: Env): Mood {
    const t = this.actT;
    if (this.act === 'poked') return t < 1.7 ? 'scared' : 'alert';
    if (this.act === 'spook') return t < 1.4 ? 'scared' : 'alert';
    if (this.act === 'wave' || this.act === 'visit') return 'happy';
    const fixed = MOODS[this.act];
    if (fixed) return fixed;
    if (this.hovered) return 'happy';
    const eye = this.eyePoint(env.frame);
    const near =
      env.pointer.present &&
      Math.hypot(env.pointer.x - eye.x, env.pointer.y - eye.y) < this.heightPx * 5;
    if (near && this.mouse.still > 1.5) return 'puzzled';
    if (near && env.time - env.pointer.at < 1.5) return 'alert';
    return this.lazy && this.act === 'idle' ? 'relaxed' : 'calm';
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    const t = this.actT;
    const act = this.act;
    const k = this.rest > 0 ? Math.min(this.rest, t) : -1;

    // Where the mouse is, and how long it has sat still.
    const { x, y } = env.pointer;
    const moved = Math.hypot(x - this.mouse.x, y - this.mouse.y) > 2;
    this.mouse = { x, y, still: moved ? 0 : this.mouse.still + dt };

    // Petted: a binky for joy, then ears up for as long as the mouse stays.
    this.hover = this.hovered ? this.hover + dt : 0;
    const calm = [
      'idle',
      'hop',
      'nibble',
      'tall',
      'groom',
      'flop',
      'sniff',
      'wash',
      'scratch',
      'loaf',
      'doze',
      'stretch',
      'dig',
      'sigh',
      'hide',
      'antenna',
      'twitch',
      'lightshow',
      'fold',
      'duck',
    ].includes(act);
    if (this.hover > 0.4 && calm && !this.walking && !this.leap) this.setAct('binky');
    else if (act === 'binky' && this.hovered && t > 1 && !this.leap) this.setAct('love');
    if (this.act === 'love') {
      this.petted += dt;
      if (!this.hovered) this.setAct(this.petted > 1.5 ? 'miss' : 'idle');
    } else if (this.act !== 'binky') this.petted = 0;

    const mood = this.feel(env);
    this.expression = this.express(mood);

    // On the move: nose up as he takes off, down as he lands; hind legs pushing off
    // then swinging under, front paws reaching for the ground.
    const u = this.air;
    if (u >= 0 && this.leap?.kind !== 'flip') {
      p.add('body', -16 * Math.sin(2 * Math.PI * u));
      p.add('head', 8 * Math.sin(2 * Math.PI * u));
      const push = bump(u - 0.25, 0.4);
      for (const side of SIDES) {
        p.add(`leg.${side}`, 55 * push - 15 * bump(u - 0.9, 0.2));
        p.add(`arm.${side}`, 30 * push - 50 * bump(u - 0.8, 0.3));
      }
    }

    // What the act does with the body.
    this.earFn = null;
    let overTarget = 0;
    const [odd, s] = [this.odd, sign(this.odd)];
    const both = (f: (side: Side) => void) => SIDES.forEach(f);
    const walkingNow = k < 0 && (this.walking || this.hopU >= 0);
    switch (act) {
      case 'tall': {
        this.sitUp(1, t);
        break;
      }
      case 'groom': {
        p.add('body', -36);
        const stroke = sin(t, 1.3);
        p.add('head', 24 + 4 * stroke, 0, -s * 20);
        both((side) => {
          p.add(`leg.${side}`, 36);
          p.add(`arm.${side}`, -120 + 14 * stroke, 0, s * 34);
        });
        this.earFn = (side, e) => {
          if (side !== odd) return;
          // Pulled down across his face, sliding through his paws.
          Object.assign(e, { lift: 80, out: 24, bend: 40 + 10 * stroke, fold: 0 });
        };
        break;
      }
      case 'nibble': {
        this.nibble(t);
        break;
      }
      case 'flop': {
        // A lean, then over onto his side; up again at the end, with a shake.
        const down = t > 0.5 && t < this.actLength - 1.2;
        overTarget = down ? 1 : 0;
        if (t < 0.5) p.add('body', 0, 0, s * -6);
        // His head rests turned up a little, so his face isn't quite sideways.
        p.add('head', 0, 0, s * 24 * overTarget);
        if (t > this.actLength - 0.9) p.add('head', 0, 0, 14 * sin(t, 5));
        break;
      }
      case 'miss': {
        p.add('head', 12);
        p.add('body', 5);
        break;
      }
      case 'love': {
        p.add('root', 0, 0, 5 * sin(t, 0.8));
        p.add('head', -6, 0, 8 * sin(t, 0.8, 0.25));
        break;
      }
      case 'dizzy': {
        const w = clamp(1.2 - t / 4, 0, 1);
        p.add('root', 0, 0, 7 * w * sin(t, 0.9));
        p.add('head', 8 * w * sin(t, 1.3), 0, 14 * w * sin(t, 1.3, 0.25));
        break;
      }
      case 'poked':
        this.thumps(t, [0.65, 1.1]);
        break;
      case 'thump':
        this.sitUp(0.35, t);
        this.thumps(t, [0.5, 0.86, 1.22, 1.58, 1.94]);
        break;
      case 'sniff':
        this.sniff(t);
        break;
      case 'wash':
        this.wash(t);
        break;
      case 'scratch':
        this.scratch(t);
        break;
      case 'antenna':
        this.antenna(t);
        break;
      case 'peek':
        this.peek(t, k);
        break;
      case 'lipview':
        this.lipview(t, k);
        break;
      case 'hide':
        this.hide(t);
        break;
      case 'copter':
        this.copter(t);
        break;
      case 'stretch':
        this.stretch(t);
        break;
      case 'doze':
        this.doze(t);
        break;
      case 'loaf':
        this.loaf(t);
        break;
      case 'shake':
        this.shake(t);
        break;
      case 'wave':
        this.wave(t);
        break;
      case 'visit':
        this.visit(t, k);
        break;
      case 'twitch':
        this.twitch(t);
        break;
      case 'lightshow':
        this.lightshow(t);
        break;
      case 'fold':
        this.foldOver(t);
        break;
      case 'hopover':
        this.hopOver(k);
        break;
      case 'duck':
        this.duck(t);
        break;
      case 'bow':
        this.bow(t);
        break;
      case 'dig':
        this.dig(t);
        break;
      case 'pounce':
        this.pounce(t);
        break;
      case 'pogo':
        this.pogo(t);
        break;
      case 'spook':
        this.spook(t);
        break;
      case 'sigh':
        this.sigh(t);
        break;
      case 'run':
        this.runPose(t, k);
        break;
      case 'twirl':
      case 'flip':
        both((side) => p.add(`arm.${side}`, -30));
        break;
    }
    if (mood === 'puzzled' && act === 'idle') p.add('head', 0, 0, s * -14);
    if (walkingNow) this.trail();

    // Flopped over onto the odd side, lifted so he lies on it rather than through it.
    const over = this.over.update(dt, overTarget);
    p.add('root', 0, 0, -s * 88 * overTarget);
    p.shift('root', 0, 0.12 * clamp(over, 0, 1.1), 0);

    // Turned to face a way of his own (to the back wall), not the way he's walking.
    const extra = this.aim === null ? 0 : this.aim - this.heading.y;
    p.add('root', 0, this.turned.update(dt, extra));

    this.lifted.update(dt, this.mem.up ?? 0);
    this.lift = Math.max(0, this.lifted.y) * this.heightPx;

    this.earPose(mood, env);
    this.nose(env.time, act === 'nibble' || act === 'sniff' || act === 'dig' || act === 'twitch');
    this.tail(env.time, mood);
    this.lastT = t;
  }

  private express(mood: Mood) {
    const t = this.actT;
    switch (this.act) {
      case 'poked':
        return t < 0.5 ? 'surprised' : t < 1.7 ? 'cross' : 'neutral';
      case 'flop':
        return t < 1.5
          ? 'happy'
          : t < this.actLength - 1.2
            ? t < 3.5
              ? 'sleepy'
              : 'asleep'
            : 'neutral';
      case 'doze': {
        const nod = this.mem.jolt ?? 0;
        return nod > 0 && t < nod + 0.6 ? 'surprised' : t < 1.2 ? 'sleepy' : 'asleep';
      }
      case 'loaf':
        return t < 1 ? 'neutral' : 'sleepy';
      case 'antenna':
        return t < 4 ? 'focused' : 'happy';
      case 'thump':
        return 'cross';
      case 'spook':
        return t < 1.4 ? 'surprised' : 'neutral';
      case 'lipview':
        return this.rest > 0.4 ? 'surprised' : 'neutral';
      case 'hide':
        return 'sad';
      case 'wash':
      case 'scratch':
      case 'wave':
      case 'stretch':
      case 'shake':
      case 'copter':
      case 'run':
      case 'pogo':
      case 'pounce':
        return this.act === 'pounce' && t < 1.3 ? 'focused' : 'happy';
      case 'sniff':
        return 'focused';
      case 'bow':
        return 'happy';
      case 'duck':
        return t < 2 ? 'surprised' : 'neutral';
      case 'sigh':
        return 'sad';
    }
    if (mood === 'happy') return 'happy';
    return 'neutral';
  }

  // ---------- Poses ----------

  /** Up on his hind feet, amount 0..1: the body turns up about the hips, the feet stay flat. */
  private sitUp(amount: number, t: number) {
    const p = this.puppet;
    const tip = 48 * amount;
    p.add('body', -tip);
    p.add('head', tip * 0.8);
    for (const side of SIDES) {
      p.add(`leg.${side}`, tip);
      p.add(`arm.${side}`, -tip * 0.25 + 4 * sin(t, 0.7));
    }
    if (amount > 0.8) p.add('head', 0, 20 * sin(t, 0.25));
  }

  /** Legs and body for sitting up, without the head (the act does the head). */
  private sitBody(tip: number) {
    const p = this.puppet;
    p.add('body', -tip);
    for (const side of SIDES) p.add(`leg.${side}`, tip);
  }

  /** The act's ears: everything the mood set, then `f` on top. */
  private ears(f: EarFn) {
    this.earFn = f;
  }

  /** A jump on being poked (or a foot thumped, over and over): a slam and a flash. */
  private thumps(t: number, times: number[]) {
    const p = this.puppet;
    const side = this.odd;
    let lift = 0;
    for (const at of times) {
      if (t > at && t < at + 0.14) lift = (t - at) / 0.14;
      else if (t >= at + 0.14 && t < at + 0.19) lift = 1 - (t - at - 0.14) / 0.05;
      // The slam: a jolt through the body and a flash up the ears.
      if (this.lastT < at + 0.19 && t >= at + 0.19) {
        p.kick('body', 260);
        p.kick('head', 200);
        this.flash = 1;
      }
    }
    p.add('body', 6);
    p.add(`leg.${side}`, -24 * lift);
    p.shift(`leg.${side}`, 0, 0.045 * lift, 0);
  }

  /** Head up, nose going, sweeping the air; a bob at the end of every sweep. */
  private sniff(t: number) {
    const p = this.puppet;
    this.sitBody(14 * ramp(t, 0, 0.6));
    const sweep = sin(t, 0.32);
    p.add('head', -14 + 5 * sin(t, 2.4), 32 * sweep, 5 * sweep);
    for (const side of SIDES) p.add(`arm.${side}`, -10);
    this.ears((side, e) => {
      e.lift += 10;
      e.swivel += -16 * sweep * sign(side);
    });
  }

  /** Both paws going round over his face. */
  private wash(t: number) {
    const p = this.puppet;
    const on = ramp(t, 0, 0.5) * (1 - ramp(t, this.actLength - 0.6, this.actLength));
    this.sitBody(38 * on);
    const round = 2 * Math.PI * 2.2 * t;
    p.add('head', 34 * on + 4 * Math.sin(round), 0, 6 * Math.cos(round) * on);
    SIDES.forEach((side, i) => {
      const a = round + (i ? Math.PI : 0);
      p.add(
        `arm.${side}`,
        (-172 + 14 * Math.sin(a)) * on,
        0,
        sign(side) * (24 + 12 * Math.cos(a)) * on,
      );
    });
    this.ears((side, e) => {
      e.lift = -50 * on + e.lift * (1 - on);
      e.out = 6 * on + e.out * (1 - on);
      e.bend = 6 * on + e.bend * (1 - on);
      e.fold = e.fold * (1 - on);
    });
  }

  /** Sat back, a hind foot up to the side of his head, scratching behind an ear. */
  private scratch(t: number) {
    const p = this.puppet;
    const on = ramp(t, 0, 0.5) * (1 - ramp(t, this.actLength - 0.5, this.actLength));
    const side = this.odd;
    const s = sign(side);
    this.sitBody(42 * on);
    const rub = sin(t, 6);
    p.add('head', 10 * on, 0, s * -22 * on);
    p.add('body', 0, 0, s * -3 * on);
    p.add(`leg.${side}`, (-72 + 12 * rub) * on, 0, s * 14 * on);
    p.shift(`leg.${side}`, 0, 0.12 * on, 0.05 * on);
    this.ears((sd, e) => {
      if (sd !== side) return;
      e.lift += 6 * rub * on;
      e.out += 14 * on + 6 * rub * on;
      e.bend += 20 * on;
    });
  }

  /** Ears stiff, swinging about like a pair of antennas, until they lock on a signal. */
  private antenna(t: number) {
    const p = this.puppet;
    const lock = 3.6;
    this.sitBody(10 * ramp(t, 0, 0.5));
    p.add('head', -6, t < lock ? 8 * sin(t, 0.4) : 0);
    // Sweeping across and back; with the odd hiccup of static.
    const across = t < lock ? 34 * sin(t, 0.3) * (1 - ramp(t, lock - 1, lock)) : 0;
    const fore = t < lock ? 16 * sin(t, 0.3, 0.25) * (1 - ramp(t, lock - 1, lock)) : 0;
    const buzz = t < lock ? 4 * Math.sin(t * 40) * bump(cycle(t * 0.8) - 0.6, 0.06) : 0;
    this.ears((side, e) => {
      const s = sign(side);
      e.bend = -6;
      e.fold = 0;
      e.out = s * across + buzz + (side === 'L' ? 0 : 0);
      e.lift = fore;
      if (t > lock) {
        // Found it: the tips lean in, both ears leaning at the same spot; a ping.
        const ping = ramp(t, lock, lock + 0.25);
        e.lift = 22 * ping;
        e.out = s * 0 - 6 * ping;
        e.bend = 14 * ping - 6;
        if (t > 4.4) {
          e.lift = 4;
          e.bend = -4;
          e.out = 12 + 14 * sin(t, 3, side === 'L' ? 0 : 0.5);
        }
      }
    });
    if (t > 4.4) p.add('head', 6 * sin(t, 1.5));
  }

  /** To the back wall, turn his back, and look round his shoulder at us. */
  private peek(t: number, k: number) {
    const p = this.puppet;
    if (k < 0) {
      this.aim = null;
      return;
    }
    const s = sign(this.odd);
    // Facing the wall from the moment he gets there, till he turns to go.
    const leaving = k > 4.6;
    this.aim = leaving ? null : s * 172;
    if (k > 1.2 && !leaving) {
      // Round his shoulder: his head comes right round, one ear drooping to that side.
      const look = ramp(k, 1.2, 1.8) * (1 - ramp(k, 3.6, 4.2));
      p.add('head', 6 * look, -s * 105 * look, s * 8 * look);
      p.add('body', 0, -s * 16 * look);
      this.ears((side, e) => {
        if (side === this.odd) return;
        e.out += 26 * look;
        e.lift -= 14 * look;
        e.bend += 20 * look;
      });
    }
    if (k > 3 && !leaving)
      this.ears((side, e) => (e.swivel += 20 * sin(k, 2, side === 'L' ? 0 : 0.5)));
  }

  /** To the front lip: paws up on it, looking over and down at the drop. */
  private lipview(t: number, k: number) {
    const p = this.puppet;
    if (k < 0) return;
    const look = ramp(k, 0.3, 0.9) * (1 - ramp(k, this.actLength - 1, this.actLength - 0.4));
    p.add('body', 14 * look);
    p.add('head', 30 * look + 4 * sin(k, 0.9), 26 * sin(k, 0.28) * look);
    for (const side of SIDES) {
      p.add(`arm.${side}`, -34 * look);
      p.add(`leg.${side}`, -10 * look);
    }
    this.ears((side, e) => {
      e.lift += 22 * look;
      e.bend += 18 * look;
    });
  }

  /** Shy: both ears pulled forward and down over his face, one lifting for a look. */
  private hide(t: number) {
    const p = this.puppet;
    const on = ramp(t, 0, 0.8) * (1 - ramp(t, this.actLength - 0.8, this.actLength));
    p.add('body', 4 * on);
    p.add('head', 6 * on);
    const look = bump(t - 2.8, 0.5) + bump(t - 4.2, 0.4);
    this.ears((side, e) => {
      // Each ear falls forward over its own side of his face, hanging straight down.
      const peekaboo = side === this.odd ? look : 0;
      e.lift = (108 - 60 * peekaboo) * on + e.lift * (1 - on);
      e.out = (4 + 24 * peekaboo) * on + e.out * (1 - on);
      e.bend = (6 - 6 * peekaboo) * on + e.bend * (1 - on);
      e.fold = 0;
    });
  }

  /** Overjoyed: ears out flat and spinning like propellers, lifting him off the floor. */
  private copter(t: number) {
    const p = this.puppet;
    const end = this.actLength;
    const spin = ramp(t, 0.2, 1.4) * (1 - ramp(t, end - 1.6, end - 0.2));
    this.prop.rate = 3.6 * spin;
    this.mem.up = 0.45 * ramp(t, 0.8, 2) * (1 - ramp(t, end - 1.8, end - 0.3));
    p.add('body', -6 * spin);
    p.add('head', 0, 0, 6 * sin(t, 0.9) * spin);
    p.add('root', 0, 0, 5 * sin(t, 0.6) * spin);
    for (const side of SIDES) {
      p.add(`leg.${side}`, 26 * spin);
      p.add(`arm.${side}`, 14 * spin);
    }
    this.ears((side, e) => {
      const k = 1 - spin;
      e.lift = e.lift * k;
      e.out = 88 * spin + e.out * k;
      e.bend = 0;
      e.fold = 0;
    });
  }

  /** Paws out in front, head low, bottom in the air. */
  private stretch(t: number) {
    const p = this.puppet;
    const on = ramp(t, 0, 0.9) * (1 - ramp(t, this.actLength - 0.8, this.actLength));
    p.add('body', 40 * on);
    p.add('head', -34 * on + 3 * sin(t, 1.2) * on);
    for (const side of SIDES) {
      p.add(`arm.${side}`, -78 * on, 0, sign(side) * 6 * on);
      p.add(`leg.${side}`, -30 * on);
    }
    p.shift('tail', 0, 0.015 * on, 0.03 * on);
    this.ears((side, e) => {
      e.lift -= 24 * on;
      e.out += 8 * on;
    });
    // A trembling shiver, at the top of the stretch.
    p.add('body', 1.6 * Math.sin(t * 34) * bump(t - this.actLength / 2, 0.7));
  }

  /** Nodding off, sinking, then a jerk awake. */
  private doze(t: number) {
    const p = this.puppet;
    if (this.mem.jolt === undefined && t > this.actLength * 0.6) {
      this.mem.jolt = t;
      p.kick('body', -600);
      p.kick('head', -700);
      this.flash = 1;
      for (const side of SIDES) p.kick(`ear.${side}.1`, 500);
    }
    const jolt = this.mem.jolt;
    const awake = jolt !== undefined ? ramp(t, jolt, jolt + 0.5) : 0;
    const nod = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.22 * t);
    const sink = (1 - awake) * ramp(t, 0.3, 2.5);
    p.add('head', (10 + 28 * nod * nod) * sink);
    p.add('body', 8 * sink);
    p.add('root', 0, 0, 3 * Math.sin(2 * Math.PI * 0.12 * t) * sink);
    this.ears((side, e) => {
      e.lift = -60 * sink + e.lift * (1 - sink);
      e.out = 30 * sink + e.out * (1 - sink);
      if (awake > 0 && awake < 1) e.lift += 30 * awake;
    });
  }

  /** Tucked in: a loaf, ears pressed back, eyes half shut, breathing slowly. */
  private loaf(t: number) {
    const p = this.puppet;
    const on = ramp(t, 0, 1);
    p.add('body', 5 * on + 2.4 * sin(t, 0.22) * on);
    p.add('head', 14 * on);
    for (const side of SIDES) p.add(`arm.${side}`, 8 * on);
    this.ears((side, e) => {
      e.lift = -70 * on;
      e.out = 4 * on;
      e.bend = 8 * on;
      e.fold = 0;
    });
  }

  /** A full-body shake, ears flapping. */
  private shake(t: number) {
    const p = this.puppet;
    const on = ramp(t, 0, 0.15) * (1 - ramp(t, this.actLength - 0.5, this.actLength));
    const s = Math.sin(2 * Math.PI * 7 * t);
    p.add('root', 0, 16 * s * on, 0);
    p.add('head', 0, -10 * s * on, 6 * s * on);
    p.add('body', 0, 0, 5 * s * on);
    this.ears((side, e) => {
      const q = Math.sin(2 * Math.PI * 7 * t + (side === 'L' ? 1 : 2.4));
      e.out += 50 * q * on;
      e.lift += 20 * Math.cos(2 * Math.PI * 7 * t) * on;
      e.bend += 20 * q * on;
    });
  }

  /** Sitting up, one ear up and waving like a hand. */
  private wave(t: number) {
    const p = this.puppet;
    const on = ramp(t, 0, 0.5) * (1 - ramp(t, this.actLength - 0.5, this.actLength));
    this.sitBody(14 * on);
    p.add('head', -4 * on, 0, sign(this.odd) * 8 * on * sin(t, 1.3));
    const toward = this.mates()[0];
    this.mem.dir = toward ? Math.sign(toward.s - this.s) || 1 : 0;
    this.ears((side, e) => {
      if (side !== this.odd) return;
      e.lift = 8;
      e.out = 12 + 26 * sin(t, 2.4);
      e.bend = 0;
      e.swivel = 0;
    });
  }

  /** Over by a crewmate: a nose twitch, a wave of an ear, a little bow. */
  private visit(t: number, k: number) {
    const p = this.puppet;
    if (k < 0) return;
    const o = this.who;
    const dir = o ? Math.sign(o.s - this.s) || 1 : 1;
    const on = ramp(k, 0.2, 0.7) * (1 - ramp(k, this.actLength - t + 3.2, this.actLength - t + 4));
    p.add('head', 6 * on + 6 * bump(k - 1.6, 0.4), 0, 0);
    p.add('body', 0, 0, -dir * 5 * on);
    p.add('root', 0, dir * 20 * on);
    this.ears((side, e) => {
      const s = sign(side);
      // The ear toward them waves, the other leans over.
      if (s * dir > 0) {
        e.out = 14 + 26 * sin(k, 2.4) * on;
        e.lift = 6;
      } else e.out += 8 * on;
      e.swivel += 14 * dir * on;
    });
  }

  /** Sat up, the nose going in a fast spree, whiskers and head jittering with it. */
  private twitch(t: number) {
    const p = this.puppet;
    const on = ramp(t, 0, 0.4) * (1 - ramp(t, this.actLength - 0.5, this.actLength));
    this.sitBody(18 * on);
    const burst = Math.max(0, Math.sin(2 * Math.PI * 1.2 * t)) * on;
    const fast = Math.sin(2 * Math.PI * 16 * t);
    p.add('head', -8 * on + 2 * fast * burst, 4 * fast * burst, 0);
    p.shift('muzzle', 0, 0.004 * Math.max(0, fast) * burst, 0);
    for (const side of SIDES) p.add(`arm.${side}`, -14 * on);
    this.ears((side, e) => {
      e.swivel += 6 * fast * burst;
      e.lift += 8 * burst;
    });
  }

  /** Sitting tall and easy while the lights run up and down his ears. */
  private lightshow(t: number) {
    const p = this.puppet;
    const on = ramp(t, 0, 0.6) * (1 - ramp(t, this.actLength - 0.6, this.actLength));
    this.sitBody(22 * on);
    p.add('head', -6 * on, 10 * sin(t, 0.4) * on, 0);
    this.ears((side, e) => {
      e.lift += 8 * on;
      e.out += sign(side) * 14 * sin(t, 0.7) * on;
    });
  }

  /** One ear folded over at the middle knuckle, then unfolded; then the other. */
  private foldOver(t: number) {
    const p = this.puppet;
    p.add('head', 0, 0, sign(this.odd) * -8 * (bump(t - 1.5, 1.1) - bump(t - 3.5, 1.1)));
    this.ears((side, e) => {
      const first = side === this.odd;
      const at = first ? 0.6 : 2.6;
      const down = ramp(t, at, at + 0.7) * (1 - ramp(t, at + 1.6, at + 2.2));
      e.fold = 84 * down;
      e.lift -= 10 * down;
      e.out += 22 * down;
    });
  }

  /** Up to a crewmate, then a big leap right over them and a happy little landing. */
  private hopOver(k: number) {
    const o = this.who;
    if (k < 0 || !o) return;
    if (!this.mem.over && k > 0.3 && !this.leap) {
      this.mem.over = 1;
      const dir = Math.sign(o.s - this.s) || 1;
      this.jump(
        o.s - this.s + dir * this.heightPx * 0.9,
        1.0,
        this.heightPx * 0.85,
        'plain',
        o.depth,
      );
    }
    // Crouching to spring while he waits.
    if (!this.mem.over) this.puppet.add('body', 14 * ramp(k, 0, 0.3));
  }

  /** Flat to the floor, ears pressed back, a shivery peek from side to side. */
  private duck(t: number) {
    const p = this.puppet;
    const on = ramp(t, 0, 0.3) * (1 - ramp(t, this.actLength - 0.7, this.actLength));
    p.add('body', 18 * on);
    p.add('head', 12 * on, 30 * sin(t, 0.4) * ramp(t, 1.5, 2.2) * on, 0);
    p.add('body', 0, 0, 1.2 * Math.sin(t * 36) * on);
    for (const side of SIDES) p.add(`arm.${side}`, 10 * on);
    this.ears((side, e) => {
      e.lift = -85 * on + e.lift * (1 - on);
      e.out = 2 * on + e.out * (1 - on);
      e.fold = 0;
    });
  }

  /** A bow to the room: ears fall forward, then spring back up. */
  private bow(t: number) {
    const p = this.puppet;
    const down = ramp(t, 0.2, 0.9) * (1 - ramp(t, 1.7, 2.2));
    this.sitBody(20 * ramp(t, 0, 0.3));
    p.add('body', 36 * down);
    p.add('head', 22 * down);
    for (const side of SIDES) p.add(`arm.${side}`, -40 * down, 0, sign(side) * 20 * down);
    this.ears((side, e) => {
      e.lift += 70 * down;
      e.bend += 10 * down;
    });
    if (t > 2.2 && !this.mem.ping) {
      this.mem.ping = 1;
      this.flash = 1;
      for (const side of SIDES) p.kick(`ear.${side}.1`, -400);
    }
  }

  /** Both front paws scraping at the floor, alternately, hind feet kicking back. */
  private dig(t: number) {
    const p = this.puppet;
    const on = ramp(t, 0, 0.5) * (1 - ramp(t, this.actLength - 0.5, this.actLength));
    p.add('body', 22 * on);
    p.add('head', 22 * on);
    SIDES.forEach((side, i) => {
      const a = sin(t, 3.4, i ? 0.5 : 0);
      p.add(`arm.${side}`, (-24 + 34 * a) * on);
      p.add(`leg.${side}`, 8 * on * a);
    });
    p.add('body', 0, 4 * sin(t, 1.7) * on, 0);
    p.shift('tail', 0, 0.01 * on, 0);
    this.ears((side, e) => {
      e.lift -= 18 * on;
      e.out += 8 * on;
    });
  }

  /** Crouch, wiggle, then a long pounce across the floor. */
  private pounce(t: number) {
    const p = this.puppet;
    const crouch = ramp(t, 0.1, 0.5) * (1 - ramp(t, 1.7, 1.75));
    if (t < 1.7) {
      p.add('body', 26 * crouch);
      p.add('head', -12 * crouch);
      p.add('root', 0, 0, 0);
      // The bottom wiggle.
      p.add('body', 0, 12 * sin(t, 4.5) * crouch, 7 * sin(t, 4.5) * crouch);
      p.shift('tail', 0.02 * sin(t, 4.5) * crouch, 0, 0);
      for (const side of SIDES) {
        p.add(`arm.${side}`, -20 * crouch);
        p.add(`leg.${side}`, -14 * crouch);
      }
      this.ears((side, e) => {
        e.lift = 10 * crouch;
        e.out = 2;
        e.bend = -2;
      });
    } else if (!this.mem.went) {
      this.mem.went = 1;
      const way = Math.random() < 0.5 ? -1 : 1;
      if (this.frame) {
        const [lo, hi] = this.span(this.frame);
        const to = clamp(
          this.s + way * this.heightPx * 1.6,
          lo + this.widthPx(),
          hi - this.widthPx(),
        );
        this.jump(to - this.s, 0.7, this.heightPx * 0.42, 'plain', Math.random() * 0.8);
      }
    }
  }

  /** Straight up and down on the spot, like a pogo stick, ears flapping. */
  private pogo(t: number) {
    const p = this.puppet;
    if (!this.leap && t < this.actLength - 0.6 && this.ground > 0.02)
      this.jump(0, 0.44, this.heightPx * 0.45, 'plain');
    // Stiff: legs straight down, arms tucked.
    const u = this.air;
    if (u >= 0) for (const side of SIDES) p.add(`arm.${side}`, 20);
    this.ears((side, e) => {
      const flap = u >= 0 ? -50 * Math.sin(Math.PI * u) : 30;
      e.lift += flap;
      e.bend += 20 * Math.sin(2 * Math.PI * u);
    });
  }

  /** Frozen, ears flat, then off in a fright across the floor. */
  private spook(t: number) {
    const p = this.puppet;
    if (t < 1.4) {
      const on = ramp(t, 0, 0.1);
      p.add('body', 6 * on);
      p.add('head', -6 * on);
      p.add('body', 0, 0, 1.4 * Math.sin(t * 40) * on);
      if (!this.mem.hopped) {
        this.mem.hopped = 1;
        this.jump(0, 0.3, this.heightPx * 0.2);
        this.flash = 1;
        for (const side of SIDES) p.kick(`ear.${side}.1`, -500);
      }
    } else if (!this.mem.fled) {
      this.mem.fled = 1;
      this.spec.speed = SPEED * 2.3;
      this.hopTime = 0.22;
      this.hopPause = 0.02;
      this.zoomLeg();
    }
  }

  /** Ears sinking, head low, a slow breath out. */
  private sigh(t: number) {
    const p = this.puppet;
    const on = ramp(t, 0, 1) * (1 - ramp(t, this.actLength - 0.8, this.actLength));
    p.add('head', 16 * on);
    p.add('body', 8 * on + 3 * on * bump(t - 1.8, 0.8));
    for (const side of SIDES) p.add(`arm.${side}`, 6 * on);
  }

  /** Zoomies: ears streamed back, body low, a second and third dash if there's time. */
  private runPose(t: number, k: number) {
    const p = this.puppet;
    if (k > 0.25 && (this.mem.legs ?? 0) < 3 && t < this.actLength - 1.2) this.zoomLeg();
    p.add('body', 8);
    this.ears((side, e) => {
      if (this.air >= 0 || this.walking) {
        e.lift -= 40;
        e.bend -= 6;
      }
    });
  }

  /** Eating the carrot: it comes out, is held in both paws and gnawed down to nothing. */
  private nibble(t: number) {
    const p = this.puppet;
    const end = this.actLength;
    const on = ramp(t, 0, 0.7) * (1 - ramp(t, end - 0.7, end));
    // Each bite takes a piece off the carrot.
    const bites = clamp((t - 1.4) / 1.1, 0, 4);
    const left = t > end - 1 ? 0 : 1 - 0.19 * Math.floor(bites);
    this.carrotOut = on > 0.01 ? left : 0;
    this.sitBody(22 * on);
    const chew = sin(t, 5);
    const bite = t > 1.2 && t < end - 1 ? Math.max(0, chew) : 0;
    p.add('head', (30 + 6 * chew * (bite > 0 ? 1 : 0)) * on, 0, 0);
    for (const side of SIDES) p.add(`arm.${side}`, -70 * on, 0, sign(side) * 14 * on);
    p.shift('muzzle', 0, 0, -0.004 * bite * on);
    this.ears((side, e) => {
      e.lift -= 8 * on;
      e.out += 6 * on;
      e.bend += 3 * Math.sin(2 * Math.PI * 5 * t) * on;
    });
    // A pleased pat on the tummy at the end.
    if (t > end - 1 && t < end - 0.2) p.add('body', -3);
  }

  private earPose(mood: Mood, env: Env) {
    const p = this.puppet;
    const t = this.actT;
    const time = env.time;
    const [odd, even] = EARS[mood];
    // Turned toward the mouse when listening; otherwise drifting about, each its own way.
    const eye = this.eyePoint(env.frame);
    const toMouse = clamp(Math.atan2(env.pointer.x - eye.x, this.heightPx * 3) / DEG, -40, 40);
    const listening = mood === 'alert' && env.pointer.present && this.act === 'idle';

    for (const side of SIDES) {
      const s = sign(side);
      const src = side === this.odd ? odd : even;
      const e: Required<Ear> = {
        lift: src.lift,
        out: src.out,
        bend: src.bend,
        fold: src.fold ?? 0,
        swivel: listening ? toMouse * 0.6 : 12 * wobble(time * 0.3, s * 3),
      };
      if (this.act === 'tall') {
        // Turning this way and that, like a pair of dishes.
        e.out += s * 22 * sin(t, 0.35);
        e.lift += 12 * sin(t, 0.35, 0.25 + (side === 'L' ? 0 : 0.5));
      }
      if (mood === 'happy' || mood === 'love') {
        // Wiggling for joy, the two ears out of step.
        const hz = mood === 'love' ? 1.6 : 3;
        e.out += 10 * sin(time, hz, side === 'L' ? 0 : 0.5);
        e.bend += 6 * sin(time, hz, 0.25);
      }
      if (mood === 'dizzy') {
        // Swinging round in circles, winding down.
        const w = clamp(1.3 - t / 4, 0, 1);
        const a = 2 * Math.PI * 1.1 * time + (side === 'L' ? 0 : Math.PI / 2);
        e.lift += 35 * w * Math.cos(a);
        e.out += 30 * w * Math.sin(a);
        e.bend += 20 * w * Math.cos(a - 0.8);
      }
      if (this.air >= 0 && this.act !== 'pogo') {
        // Trailing behind in the air.
        e.lift -= 30 * Math.sin(Math.PI * this.air);
        e.bend -= 10 * Math.sin(Math.PI * this.air);
      }
      this.earFn?.(side, e);
      p.add(`ear.${side}.1`, e.lift, e.swivel, -s * e.out);
      p.add(`ear.${side}.2`, e.bend, 0, -s * e.fold);
      p.add(`ear.${side}.3`, e.bend * 0.7, 0, -s * e.fold * 0.35);
    }

    // Now and then an ear flicks.
    if (time > this.nextFlick && mood !== 'scared' && mood !== 'dizzy' && this.prop.rate < 0.1) {
      this.nextFlick = time + 1.5 + Math.random() * 4;
      const side = Math.random() < 0.5 ? 'L' : 'R';
      p.kick(`ear.${side}.2`, 0, 0, (Math.random() < 0.5 ? -1 : 1) * 400);
      p.kick(`ear.${side}.3`, 300);
    }
  }

  /** Ears streaming back while he's on the move. */
  private trail() {
    const f = this.earFn;
    this.earFn = (side, e) => {
      f?.(side, e);
      e.lift -= 14;
    };
  }

  /** The nose twitches in bursts, nonstop while he nibbles or sniffs. */
  private nose(time: number, busy: boolean) {
    const p = this.puppet;
    if (time > this.nextTwitch) {
      this.twitchAt = time;
      this.nextTwitch = time + 1.2 + Math.random() * 3;
    }
    const on = busy || time - this.twitchAt < 0.6;
    const twitch = on
      ? Math.max(0, Math.sin(2 * Math.PI * (busy ? (this.act === 'twitch' ? 14 : 7) : 9) * time))
      : 0;
    p.shift('muzzle', 0, 0.0035 * twitch, 0);
    p.add('muzzle', -6 * twitch);
  }

  /** The puck of a tail: wagging when he's happy, flicked up when he's scared. */
  private tail(time: number, mood: Mood) {
    const p = this.puppet;
    const happy = mood === 'happy' || mood === 'love';
    const x = happy ? 0.008 * Math.sin(2 * Math.PI * 5 * time) : 0;
    p.shift('tail', x, mood === 'scared' ? 0.02 : 0, 0);
  }

  // ---------- Lights ----------

  /** The ear panels: three up each ear, in the colour of his mood. */
  private lights(time: number, dt: number) {
    const act = this.act;
    const t = this.actT;
    const scared = act === 'poked' && t < 1.7;
    this.flash = Math.max(0, this.flash - dt * 2.5);
    SIDES.forEach((side, k) => {
      const odd = side === this.odd;
      for (let i = 0; i < 3; i++) {
        const up = i / 2; // 0 at the root, 1 at the tip
        let level: number;
        let tone: string | undefined;
        if (act === 'dizzy') {
          // Colours twinkling at random.
          level = Math.sin(time * 7 + (k * 3 + i) * 2.3) > 0.1 ? 1 : 0.15;
          tone = RAINBOW[(k * 3 + i + Math.floor(time * 3)) % RAINBOW.length];
        } else if (act === 'lightshow') {
          // A wave running up the ears and back down, changing colour each pass.
          const ph = Math.abs(2 * cycle(time * 0.6 + k * 0.08) - 1);
          level = 0.12 + 0.88 * bump(ph - up, 0.4);
          tone = RAINBOW[Math.floor(time * 0.6 + k * 0.08 + 0.5) % RAINBOW.length];
        } else if (act === 'fold' || act === 'duck' || act === 'bow') {
          level = 0.5 + 0.4 * Math.sin(time * 2 - up);
          tone = act === 'duck' ? BEACON.surprised : undefined;
        } else if (act === 'binky' || act === 'twirl' || act === 'flip') {
          // The rainbow racing up the ears.
          level = 1;
          tone = RAINBOW[(i + k * 2 + Math.floor(time * 10)) % RAINBOW.length];
        } else if (act === 'copter') {
          // Round and round, faster as the ears spin up.
          level = 0.35 + 0.65 * bump(cycle(time * (1 + this.prop.rate) + i / 3 + k / 2) - 0.5, 0.3);
          tone = RAINBOW[(i + k * 3 + Math.floor(time * 4)) % RAINBOW.length];
        } else if (act === 'love') {
          // A heartbeat, pink, rising up the ears.
          level = 0.45 + 0.55 * bump(cycle(time * 1.1) - up * 0.25, 0.2);
          tone = BEACON.love;
        } else if (scared || act === 'spook') {
          // Startled: flashing, then fading.
          level = clamp(1.8 - t, 0.25, 1) * (Math.sin(time * 28) > 0 ? 1 : 0.45);
          tone = BEACON.surprised;
        } else if (act === 'miss' || act === 'sigh' || act === 'hide') {
          // Sad: a blue that drains down from the tips.
          level = clamp(0.7 - t * 0.2 - up * 0.35 + 0.15 * Math.sin(time * 2 + up * 2), 0.08, 1);
          tone = BEACON.sad;
        } else if (act === 'flop' || act === 'loaf' || act === 'doze') {
          // Resting: a slow, warm breath.
          level = 0.2 + 0.18 * Math.sin(time * 1.2);
          tone = BEACON.happy;
        } else if (act === 'antenna') {
          // Searching: a green scan, faster and faster; then solid, and a blink.
          if (t < 3.6) {
            level = 0.15 + 0.85 * bump(cycle(time * (1 + t * 0.5) - up * 0.4) - 0.3, 0.2);
            tone = BEACON.focused;
          } else {
            level = t < 4.4 ? 1 : 0.6 + 0.4 * Math.sin(time * 6 - up);
            tone = t < 4.4 ? BEACON.focused : BEACON.happy;
          }
        } else if ((act === 'groom' || act === 'scratch') && odd) {
          // The ear he's grooming lights up where his paws are.
          level = 0.2 + 0.8 * bump(cycle(time * 1.3) - (1 - up) * 0.6, 0.3);
        } else if (act === 'wash') {
          level = 0.5 + 0.4 * Math.sin(time * 13.8 + up * 2);
        } else if (
          act === 'tall' ||
          act === 'run' ||
          act === 'peek' ||
          act === 'sniff' ||
          (act === 'poked' && t >= 1.7)
        ) {
          // Listening: a green scan up the ears.
          level = 0.25 + 0.75 * bump(cycle(time * 0.9 + (odd ? 0.5 : 0)) - up * 0.6, 0.25);
          tone = BEACON.focused;
        } else if (act === 'nibble' || act === 'dig') {
          level = 0.55 + 0.15 * Math.sin(time * 12 - up * 2);
        } else if (
          act === 'wave' ||
          act === 'visit' ||
          act === 'stretch' ||
          act === 'shake' ||
          act === 'pogo'
        ) {
          level = 0.6 + 0.4 * Math.sin(time * 5 - up * 2 + k * 2);
          tone = BEACON.happy;
        } else if (this.hovered) {
          level = 0.9;
          tone = BEACON.happy;
        } else {
          // At ease: a slow shimmer up the ears.
          level = 0.6 + 0.25 * Math.sin(time * 0.9 - up * 1.8 + k);
        }
        // A thump or a poke: a flash up the ears from the root.
        const flash = this.flash * bump(1 - this.flash - up * 0.4, 0.5);
        if (flash > level) {
          level = flash;
          tone = BEACON.surprised;
        }
        this.outfit.dot(k * 3 + i, clamp(level, 0, 1), tone);
      }
    });
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    this.lights(env.time, dt);
    // Propeller ears: spun round directly, outside the springs.
    this.prop.angle += this.prop.rate * 360 * dt;
    if (this.act !== 'copter') this.prop.rate = 0;
    if (this.prop.rate > 0.05)
      for (const side of SIDES) p.swing(`ear.${side}.1`, this.prop.angle * (side === 'L' ? 1 : -1));
    else this.prop.angle = 0;
    // The leaps: a twist and a kick, a full turn, a somersault.
    const leap = this.leap;
    this.twirl = 0;
    if (leap?.kind === 'binky') {
      const u = leap.u;
      this.twirl = 55 * Math.sin(2 * Math.PI * u);
      const kick = bump(u - 0.5, 0.3);
      p.turn('body', 0, 0, 25 * Math.sin(Math.PI * u) * (leap.to > leap.from ? 1 : -1));
      for (const side of SIDES) p.turn(`leg.${side}`, 70 * kick, 0, sign(side) * -25 * kick);
    } else if (leap?.kind === 'twirl') {
      this.twirl = 360 * smooth(leap.u);
    } else if (leap?.kind === 'flip') {
      const u = clamp((leap.u - 0.12) / 0.76, 0, 1);
      p.turn('body', -360 * smooth(u));
      for (const side of SIDES) {
        p.turn(`leg.${side}`, 40 * bump(u - 0.5, 0.5), 0, 0);
        p.turn(`arm.${side}`, -30 * bump(u - 0.5, 0.5));
      }
    }
    this.pivot.rotation.y = this.twirl * DEG;
    if (this.act !== 'poked' && this.act !== 'thump' && this.act !== 'scratch')
      for (const side of SIDES) p.shift(`leg.${side}`, 0, 0, 0);
    // The carrot: there when he's eating it, otherwise stowed away (scaled to nothing).
    const c = this.carrot.update(dt, this.carrotOut);
    const size = clamp(c, 0, 1.1) * 1.35;
    p.shift('carrot', 0, 0.03, 0.025);
    if (size < 0.02) p.stretch('carrot', 0, [0, 1, 0], 0);
    else p.stretch('carrot', size, [0, 1, 0], size);
  }
}
