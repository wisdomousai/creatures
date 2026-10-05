import { type Bone, Color, type Object3D, Vector3 } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { depthScale, project } from './box';
import { type Act, Character, clamp, type Env, envelope, type Frame } from './character';
import type { Expression, FaceLayout } from './face';
import { sin } from './moves';
import { Spring, wobble } from './spring';

/**
 * Blip, the robot koi. The window frame is his tank: he swims in the band just inside
 * it, a little way back in the box, and passes behind the crew rather than through
 * them. He glides in from behind the side of the frame, cruises along the bottom,
 * hangs in the water with his fins paddling, turns lazily (showing his face as he comes
 * about), and now and then swims right round a corner, up the side and along the top to
 * gulp at the surface. He uses the depth of the tank: a slow circle into the back and
 * out, a peek from the back wall, a bonk and a kiss on the glass at the front.
 *
 * His body is four segments on a chain of joints, and a wave runs down it as he swims,
 * faster and bigger the faster he goes. The scale plates down his flanks are lights,
 * ten bands from head to tail, and they show what he's up to: a sheen that runs along
 * him with each beat of his tail, a ripple, a twinkle, a warm glow, a light that runs
 * forward before each bubble he blows, a slow dim breath asleep, a rainbow when giddy.
 *
 * Tricks: bubble rings, a tail-flick splash at the surface, chasing his own bubble and
 * gulping it, a hiccup, a sneeze, a yawn, playing dead, a fin wave hello, backing up,
 * grazing the bottom, a pirouette, zoomies round the frame, a scan, a lamp glow, going
 * to pay a crewmate a visit, sulking with his side turned, a bubble spree, nibbling at a
 * crewmate's head, tail-flick bursts, hovering with both fins fanning, a slow belly-up roll,
 * a corkscrew, tagging along behind a crewmate, a surprise snap at the mouse, a sleepy
 * drift, and a waggle dance.
 *
 * He watches the mouse but never follows it. Rest it right on him and he comes up to
 * nibble at it, mouth pushed out and working. Poke him and he bolts: a flick of the
 * body and a dash along the band away from the poke. Three quick pokes and he spins.
 */
export const KOI_FACE: FaceLayout = {
  width: 512,
  height: 108,
  eyes: [
    [0.3, 0.5],
    [0.7, 0.5],
  ],
  rx: 0.08,
  ry: 0.38,
  line: 0.035,
  mouth: null,
};

type Point = { x: number; y: number };

const DEG = Math.PI / 180;
/** The swimming wave, head to tail: each bone's share of the swing (the head swings against it). */
const WAVE: [string, number][] = [
  ['head', -0.25],
  ['body', 0.2],
  ['spine.1', 0.5],
  ['spine.2', 0.75],
  ['tail', 1.15],
];
const CHAIN = ['spine.1', 'spine.2', 'tail'];
const FINS = [
  ['fin.L', 1],
  ['fin.R', -1],
] as const;
/** Bands of scale lights, head to tail (Dot0..Dot9). */
const BANDS = 10;
const BUBBLES = 5;
/** Where the middle of the band runs, as shares of his height in from the frame line. */
const BOTTOM = 0.45;
const TOP = 0.66;
const SIDE = 0.62;
/** His pivot, the middle of his body, above his "feet" (as a share of his height). */
const MIDDLE = 0.45;
/** How far back into the box he swims when nothing takes him elsewhere (0 front, 1 back wall). */
const HOME_DEPTH = 0.3;
/** How far he turns from the viewer: hanging in the water, and swimming. */
const HANG = 38;
const SWIM = 64;
const bump = (x: number, width: number) => Math.max(0, 1 - Math.abs(x) / width);
const cycle = (x: number) => x - Math.floor(x);
const v3 = new Vector3();

/**
 * The middle line of the band, round the frame: a rounded rectangle, measured in px
 * from the left end of its bottom side and counterclockwise on screen (along the
 * bottom to the right, up the right side, along the top, down the left side).
 */
class Loop {
  L = 0;
  R = 0;
  T = 0;
  B = 0;
  r = 0;
  a = 0;
  b = 0;
  total = 1;
  private pieces: number[] = [];

  set(frame: Frame, H: number) {
    this.L = frame.left + H * SIDE;
    this.R = frame.right - H * SIDE;
    this.T = frame.top + H * TOP;
    this.B = frame.bottom - H * BOTTOM;
    this.r = Math.max(1, Math.min(H * 0.9, (this.R - this.L) / 2 - 1, (this.B - this.T) / 2 - 1));
    this.a = Math.max(0, this.R - this.L - 2 * this.r);
    this.b = Math.max(0, this.B - this.T - 2 * this.r);
    const arc = (Math.PI / 2) * this.r;
    this.pieces = [this.a, arc, this.b, arc, this.a, arc, this.b, arc];
    this.total = 2 * (this.a + this.b) + 4 * arc;
  }

  wrap(u: number) {
    return ((u % this.total) + this.total) % this.total;
  }

  /** Which piece u is on (0 the bottom, 2 the right side, 4 the top, 6 the left side;
   * odd ones are corners) and how far along it. */
  locate(u: number): [number, number] {
    let s = this.wrap(u);
    for (let i = 0; i < 8; i++) {
      if (s <= this.pieces[i] || i === 7) return [i, Math.min(s, this.pieces[i])];
      s -= this.pieces[i];
    }
    return [7, 0];
  }

  /** Where each straight side starts. */
  start(piece: number) {
    return this.pieces.slice(0, piece).reduce((a, b) => a + b, 0);
  }

  length(piece: number) {
    return this.pieces[piece];
  }

  at(u: number): Point {
    const [i, s] = this.locate(u);
    const { L, R, T, B, r } = this;
    const phi = s / r;
    switch (i) {
      case 0:
        return { x: L + r + s, y: B };
      case 1:
        return { x: R - r + r * Math.sin(phi), y: B - r + r * Math.cos(phi) };
      case 2:
        return { x: R, y: B - r - s };
      case 3:
        return { x: R - r + r * Math.cos(phi), y: T + r - r * Math.sin(phi) };
      case 4:
        return { x: R - r - s, y: T };
      case 5:
        return { x: L + r - r * Math.sin(phi), y: T + r - r * Math.cos(phi) };
      case 6:
        return { x: L, y: T + r + s };
      default:
        return { x: L + r - r * Math.cos(phi), y: B - r + r * Math.sin(phi) };
    }
  }

  /** The way u runs here, a unit vector in viewport px (y down). */
  tangent(u: number): Point {
    const a = this.at(u - 0.5);
    const b = this.at(u + 0.5);
    const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
  }

  /** The shortest way from u to w (signed px). */
  toward(u: number, w: number) {
    let d = this.wrap(w) - this.wrap(u);
    if (d > this.total / 2) d -= this.total;
    if (d < -this.total / 2) d += this.total;
    return d;
  }
}

type Kind = 'plain' | 'ring' | 'splash' | 'spray' | 'big' | 'chase';

interface Bubble {
  /** When it comes out (env time), or -1 when it isn't out. */
  at: number;
  /** Where it came out, in world px (NaN until placed at his mouth or tail). */
  from: Vector3;
  life: number;
  size: number;
  drift: number;
  /** Sideways and upward speed, and how it is pulled (his heights per second). */
  vx: number;
  vy: number;
  ay: number;
  sway: number;
  origin: 'mouth' | 'tail';
  /** Pops when it reaches the surface. */
  surface: boolean;
}

export class Koi extends Character {
  static readonly terms =
    'carp goldfish fish pond tank white cream coral orange pink patches scales fins tail black mask swim glide cruise bubbles';

  /** Held by the pointer, it flies after it. */
  readonly flies = true;
  /** It comes in its own way (flying or swimming), not jumping out of its picture. */
  readonly jumpsOut = false;
  private loop = new Loop();
  /** Along the loop (px, not wrapped), speed along it, and where he's swimming to. */
  private u = 0;
  private v = 0;
  private target: number | null = null;
  private cruise = 1;
  private accel = 1;
  /** 1 facing the viewer's right, -1 the left. */
  private facing = 1;
  private turning = 0;
  /** Swimming tail first (backing up). */
  private reverse = false;
  private tilt = new Spring(0.7, 0.85);
  private reach = { x: new Spring(2, 0.7), y: new Spring(2, 0.7) };
  private mouthOut = new Spring(4, 0.5);
  private mouthOpen = 0;
  private phase = 0;
  private swim = 0;
  private exiting = false;
  private pokes: number[] = [];
  private hover = 0;
  private bubbles: Bubble[] = [];
  private blowAt: { at: number; kind: Kind }[] = [];
  private beaconColour = new Color('#f4f4f1');
  private frame!: Frame;
  private time = 0;
  private dartWay = 1;
  private rest: Vector3[];
  /** Timed moments within the act: [seconds into it, what happens]. */
  private cues: [number, () => void][] = [];
  /** How far back in the box he swims between tricks. */
  private roam = HOME_DEPTH;
  private chaseAt = 0;
  private popped = false;
  private popAt = 0;
  private mate: Character | null = null;
  private pointer: Point = { x: -1e4, y: -1e4 };
  private others: readonly Character[] = [];

  constructor(model: Object3D) {
    super(
      {
        name: 'Blip',
        model: 'koi',
        metres: 0.33,
        width: 0.62,
        size: 0.85,
        feels: {
          default: { f: 2.5, zeta: 0.6 },
          root: { f: 1.6, zeta: 0.7 },
          body: { f: 1.3, zeta: 0.75 },
          head: { f: 1.8, zeta: 0.65 },
          'spine.1': { f: 2, zeta: 0.55 },
          'spine.2': { f: 2.2, zeta: 0.5 },
          tail: { f: 2.4, zeta: 0.45 },
          'fin.L': { f: 3.5, zeta: 0.45 },
          'fin.R': { f: 3.5, zeta: 0.45 },
          dorsal: { f: 2.5, zeta: 0.4 },
          'barbel.L': { f: 3, zeta: 0.2 },
          'barbel.R': { f: 3, zeta: 0.2 },
        },
        face: KOI_FACE,
        eyes: 0.55,
        gaze: [
          { bone: 'head', yaw: 0.35, pitch: 0.4 },
          { bone: 'body', yaw: 0.45, pitch: 0.3 },
        ],
        reach: { yaw: 50, pitch: 25 },
        lag: 1.1,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [50, 120],
        speed: 1.3,
        turn: SWIM,
      },
      model,
    );
    // He turns round lazily.
    this.heading = new Spring(0.8, 0.8);
    for (let i = 0; i < BUBBLES; i++)
      this.bubbles.push({
        at: -1,
        from: new Vector3(),
        life: 2,
        size: 1,
        drift: 0,
        vx: 0,
        vy: 0.5,
        ay: 0,
        sway: 1,
        origin: 'mouth',
        surface: true,
      });
    this.rest = this.bubbles.map((_, i) => this.puppet.bone(`bubble.${i}`)!.position.clone());
    this.acts = this.moves();
  }

  // ---------- Acts ----------

  private moves(): Record<string, Act> {
    const still = () => !!this.free && this.target === null && !this.exiting;
    const on = (piece: number) => this.loop.locate(this.u)[0] === piece;
    const level = () => on(0) || on(4);
    const H = () => this.front;
    return {
      // ---- Everyday
      idle: { weight: 3, length: [3, 6] },
      // A little way along the side he's on, at some depth or other.
      glide: {
        weight: 2.6,
        length: [2, 4],
        when: still,
        start: () => {
          this.roam = 0.12 + 0.45 * Math.random();
          this.depthGoal = this.roam;
          this.glide();
        },
      },
      // Round the frame to somewhere else, any side.
      cruise: { weight: 0.8, length: [3, 5], when: still, start: () => this.swimTo(this.spot()) },
      surface: {
        weight: 0.45,
        length: [3, 5],
        when: () => still() && !on(4),
        start: () => this.swimTo(this.spot(4)),
      },
      home: {
        weight: 1.4,
        length: [3, 5],
        when: () => still() && !on(0),
        start: () => this.swimTo(this.spot(0)),
      },
      // Up at the top, gulping at the surface.
      gulp: {
        weight: 3,
        length: [3.5, 5],
        face: 'happy',
        when: () => still() && on(4),
        start: () => this.blow([0.55, 1.8, 3.05]),
      },
      bubbles: {
        weight: 1.3,
        length: [3.5, 4.5],
        when: still,
        start: () => this.blow([0.5, 1.1, 1.9]),
      },
      about: {
        weight: 0.8,
        length: [2.5, 3.5],
        when: () => still() && level(),
        start: () => this.turnRound(-this.facing as 1 | -1),
      },
      doze: {
        weight: 0.6,
        length: [9, 15],
        face: 'asleep',
        when: () => still() && on(0),
        start: () => (this.depthGoal = Math.max(this.roam, 0.5)),
      },
      shimmy: { weight: 0.6, length: [2, 2.6], face: 'happy', when: still },

      // ---- Bubble play
      // A ring of bubbles blown from an O of a mouth, growing as it rises.
      ring: { weight: 0.6, length: [4, 4.6], when: still, start: () => this.blow([0.9], 'ring') },
      // Blows a bubble and dashes up after it to gulp it.
      chase: {
        weight: 0.6,
        length: [3.4, 3.8],
        when: () => still() && !on(4),
        start: () => {
          this.depthGoal = 0.1;
          this.chaseAt = this.time + 0.6;
          this.popped = false;
          this.blow([0.6], 'chase');
        },
      },
      // A hiccup: a jolt and a bubble, four times.
      hiccup: {
        weight: 0.45,
        length: [4.2, 4.6],
        when: still,
        start: () => this.blow([0.8, 1.55, 2.3, 3.05]),
      },
      // Rears up, winds up, and sneezes a spray of bubbles.
      sneeze: {
        weight: 0.4,
        length: [3, 3.4],
        when: still,
        start: () => this.blow([1.05], 'spray'),
      },
      // A big lazy yawn and one slow big bubble.
      yawn: { weight: 0.5, length: [3.6, 4], when: still, start: () => this.blow([2.3], 'big') },
      // Dives, and whips his tail up out of the water at the surface: a splash.
      splash: {
        weight: 0.55,
        length: [3.6, 4],
        when: () => still() && on(4),
        start: () => this.blow([1.0, 2.4], 'splash'),
      },

      // ---- The depth of the tank
      // A slow lazy circle into the back of the tank and out again.
      orbit: {
        weight: 0.7,
        length: [8.5, 9.5],
        when: () => still() && level() && this.room(1) + this.room(-1) > H() * 3,
        start: () => this.orbit(),
      },
      // Off to the back wall, peeks out at us, and then rushes forward.
      peek: {
        weight: 0.5,
        length: [7, 8],
        when: still,
        start: () => {
          this.depthGoal = 0.95;
          this.cue(3.6, () => (this.depthGoal = 0));
          this.cue(6.4, () => (this.depthGoal = this.roam));
        },
      },
      // Right up to the front, and a kiss on the glass.
      kiss: {
        weight: 0.45,
        length: [4.4, 4.8],
        when: still,
        start: () => {
          this.depthGoal = 0;
          this.turning = 0;
        },
      },
      // Bumps his nose into the glass, three times, and shakes it off.
      bonk: {
        weight: 0.4,
        length: [4.2, 4.6],
        when: still,
        start: () => {
          this.depthGoal = 0;
          this.blow([1.0, 1.9, 2.8]);
        },
      },
      // Hangs at the back like a lantern, all his scales glowing.
      lantern: {
        weight: 0.4,
        length: [5, 6],
        face: 'happy',
        when: still,
        start: () => (this.depthGoal = 0.72),
      },

      // ---- Fish things
      // Backs up a little, rowing with his fins.
      backup: { weight: 0.5, length: [3, 3.6], when: still, start: () => this.backUp() },
      // Grazes at the bottom, nose down, mouth working.
      graze: {
        weight: 0.7,
        length: [5, 6],
        face: 'happy',
        when: () => still() && on(0),
        start: () => this.graze(),
      },
      // A few happy hops in the water.
      bob: { weight: 0.5, length: [3.4, 3.8], face: 'happy', when: still },
      // A quick pirouette, blowing bubbles.
      twirl: {
        weight: 0.5,
        length: [2.6, 3],
        when: still,
        start: () => this.blow([0.5, 0.9, 1.3]),
      },
      // Zoomies: a fast lap round the whole frame.
      lap: {
        weight: 0.35,
        length: [8, 9],
        when: still,
        start: () => {
          const way = Math.random() < 0.5 ? -1 : 1;
          this.swimBy(
            way * this.loop.total * 0.85,
            Math.max(this.front * 3.6, this.loop.total / 8),
          );
          this.accel = this.front * 4;
        },
      },
      // Looks about, scanning.
      scan: { weight: 0.5, length: [4, 4.6], when: still },
      // Waves a fin at us.
      hello: { weight: 0.6, length: [3.2, 3.6], when: still },
      // Flat out belly up, then comes back to life.
      playdead: { weight: 0.3, length: [5.2, 5.6], when: still },
      // Sulks with his side turned, sinking.
      sulk: { weight: 0.3, length: [5, 6], when: still },
      // Freezes, then jumps back at nothing.
      spook: { weight: 0.4, length: [2.6, 3], when: still },

      // ---- Lights
      ripple: { weight: 0.6, length: [3.2, 3.6], when: still },
      twinkle: { weight: 0.6, length: [3.6, 4.2], when: still },

      // ---- Others
      // Swims over to a crewmate, and says hello with a bubble.
      visit: {
        weight: 0.5,
        length: [7.5, 8.5],
        when: () => still() && this.crewmate() !== null,
        start: () => this.visit(),
      },

      // ---- More tricks
      // A bubble-blowing spree: a stream of little bubbles, one after another.
      spree: {
        weight: 0.5,
        length: [5, 5.6],
        face: 'happy',
        when: still,
        start: () => this.blow([0.4, 0.8, 1.2, 1.6, 2.0, 2.4, 2.8, 3.2, 3.6, 4.0]),
      },
      // Off to a crewmate, and a gentle nibble at the top of their head.
      headnip: {
        weight: 0.4,
        length: [8.5, 9.5],
        when: () => still() && this.crewmate() !== null,
        start: () => this.visit(),
      },
      // A tail-flick burst: two quick snaps of the tail and a short dash each.
      flick: {
        weight: 0.5,
        length: [2.8, 3.2],
        when: () => still() && level(),
        start: () => {
          const H = this.front;
          const w = this.fwd() * (this.room(this.fwd()) > H * 1.4 ? 1 : -1);
          const way = w * Math.sign(this.loop.tangent(this.u).x || 1);
          this.turnRound(way as 1 | -1);
          this.dartWay = way;
          const go = () => {
            this.cruise = H * 4;
            this.accel = H * 14;
            this.target = this.u + w * H * 0.6;
          };
          this.cue(0.5, go);
          this.cue(1.3, () => {
            this.dartWay = -this.dartWay;
            go();
          });
        },
      },
      // Hovers on the spot, both fins fanning hard.
      fan: { weight: 0.5, length: [4, 5], face: 'happy', when: still },
      // A slow roll, showing his belly, and back over.
      roll: { weight: 0.45, length: [4.6, 5], when: still },
      // A corkscrew: rolls twice while he swims off along the band.
      corkscrew: {
        weight: 0.4,
        length: [3.6, 4],
        face: 'happy',
        when: () => still() && level() && this.room(this.fwd()) > this.front * 2,
        start: () => {
          this.swimBy(this.fwd() * this.front * 2, this.front * 1.1);
        },
      },
      // Tags along behind a crewmate, stopping when they stop.
      follow: {
        weight: 0.4,
        length: [10, 11],
        when: () => still() && this.crewmate() !== null,
        start: () => {
          this.visit();
          for (const at of [3, 5.5, 8]) this.cue(at, () => this.visit(true));
        },
      },
      // A surprise gulp at the mouse: a sudden lunge, a snap, and back.
      snap: {
        weight: 0.35,
        length: [2.8, 3.2],
        when: () => still() && this.pointer.x > -1000,
        start: () => (this.depthGoal = Math.min(this.roam, 0.15)),
      },
      // A sleepy drift: sinking slowly, fins hardly moving, eyes half shut.
      drift: { weight: 0.5, length: [8, 11], face: 'sleepy', when: still },
      // The waggle dance: back and forth along the band, shaking all over.
      waggle: {
        weight: 0.4,
        length: [4.6, 5.2],
        face: 'happy',
        when: () => still() && level() && this.room(1) > this.front && this.room(-1) > this.front,
        start: () => {
          const H = this.front;
          const way = this.fwd();
          [0, 1.2, 2.4, 3.6].forEach((at, i) =>
            this.cue(at, () => {
              this.cruise = H * 1.8;
              this.accel = H * 8;
              this.target = this.u + (i % 2 ? -1 : 1) * way * H * 0.55;
              if (i % 2) this.reverse = true;
              else this.reverse = false;
            }),
          );
        },
      },

      // ---- Reactions
      nibble: { weight: 0, length: [60, 60], start: () => (this.depthGoal = 0) },
      dart: { weight: 0, length: [1.8, 2.2], face: 'surprised' },
      dizzy: { weight: 0, length: [3.6, 3.6] },
    };
  }

  protected setAct(name: string) {
    this.cues = [];
    this.reverse = false;
    // Back to his usual depth, unless the act takes him elsewhere.
    if (this.free) this.depthGoal = this.roam;
    super.setAct(name);
  }

  private cue(at: number, fn: () => void) {
    this.cues.push([at, fn]);
  }

  poke() {
    if (this.state !== 'here' || !this.free || this.exiting) return;
    const now = performance.now() / 1000;
    this.pokes = [...this.pokes.filter((at) => now - at < 2), now];
    if (this.pokes.length >= 3) {
      this.pokes = [];
      this.target = null;
      this.setAct('dizzy');
      this.blow([0.9, 1.3, 1.7]);
    } else if (this.act !== 'dizzy') this.dart();
  }

  /** His height at the front of the box, the size the band is measured in. */
  private get front() {
    return this.spec.size * this.frame.bot;
  }

  /** Off along the band, away from the poke: a flick of the body and a dash. */
  private dart() {
    const H = this.front;
    const t = this.loop.tangent(this.u);
    const c = this.centre();
    const p = this.pointer;
    // Away from where he was poked, along the band (with no mouse near, a tap, straight ahead).
    const near = Math.hypot(p.x - c.x, p.y - c.y) < this.heightPx * 1.5;
    const along = near ? (p.x - c.x) * t.x + (p.y - c.y) * t.y : 0;
    const way = along > 0 ? -1 : along < 0 ? 1 : this.facing * Math.sign(t.x || 1);
    this.dartWay = way;
    const want = Math.sign(t.x * way);
    if (Math.abs(t.x) > 0.35 && want !== this.facing) {
      // Round in a flash, not lazily.
      this.facing = want as 1 | -1;
      this.heading.kick(want * 500);
    }
    this.turning = 0;
    this.cruise = H * 6;
    this.accel = H * 20;
    this.target = this.u + way * H * (2.5 + Math.random());
    this.setAct('dart');
  }

  /** How far he can swim along this straight side one way (px). */
  private room(way: number) {
    const [piece, s] = this.loop.locate(this.u);
    if (piece % 2) return 0;
    const left = way > 0 ? this.loop.length(piece) - s : s;
    return Math.max(0, left - this.front * 0.4);
  }

  private glide() {
    const H = this.front;
    let way = Math.random() < 0.5 ? -1 : 1;
    if (this.room(way) < H) way = -way;
    const d = way * Math.min(H * (1.2 + Math.random() * 2.5), this.room(way));
    this.swimBy(d, H * (1 + Math.random() * 0.5));
  }

  /** Which way along the band (+1 or -1 in u) he is facing. */
  private fwd() {
    return this.facing * Math.sign(this.loop.tangent(this.u).x || 1);
  }

  /** A lazy circle: out along the side and into the back of the tank, then round and home. */
  private orbit() {
    const H = this.front;
    const way = this.room(1) > this.room(-1) ? 1 : -1;
    const d = way * Math.min(H * 2.6, this.room(way));
    this.depthGoal = 0.9;
    this.swimBy(d, H * 0.9);
    this.cue(3.6, () => {
      this.depthGoal = this.roam;
      this.swimBy(-d * 0.95, H * 1);
    });
  }

  private backUp() {
    const H = this.front;
    const t = this.loop.tangent(this.u);
    // Tail first, along whichever way he isn't facing (on a side, only where there is room).
    const way = -this.facing * Math.sign(t.x || 1);
    const d = way * Math.min(H * 1.8, this.room(way) || H * 1.8);
    this.reverse = true;
    this.swimBy(d, H * 0.55);
  }

  private graze() {
    const H = this.front;
    const way = this.room(this.facing) > H ? this.facing : -this.facing;
    this.turnRound(way as 1 | -1);
    this.depthGoal = 0.05;
    this.swimBy(way * Math.min(H * 1.8, this.room(way)), H * 0.3);
  }

  /** Another of the crew on the floor to go and see. */
  private crewmate(): Character | null {
    const mates = this.others.filter((o) => o !== this && o.state === 'here' && !o.free);
    return mates.length ? mates[Math.floor(Math.random() * mates.length)] : null;
  }

  private visit(keep = false) {
    const mate = (this.mate = keep && this.mate ? this.mate : this.crewmate());
    if (!mate) return;
    const H = this.front;
    const depth = clamp(mate.depth - 0.1, 0, 1);
    this.depthGoal = depth;
    // Where on the front of the box he'd stand to be beside them on the page.
    const k = depthScale(this.frame, depth);
    const vx = (this.frame.left + this.frame.right) / 2;
    const b = mate.bounds(this.frame);
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = b.x + b.w / 2 + side * (b.w / 2 + H * 0.9 * k);
    const front = vx + (x - vx) / k;
    const loop = this.loop;
    const u = loop.start(0) + clamp(front - loop.L - loop.r, 0, loop.length(0));
    this.swimTo(u);
  }

  /** A clear place to hang on one of the straight sides (the given one, or any). */
  private spot(piece?: number): number {
    const H = this.front;
    const loop = this.loop;
    let u = this.u;
    for (let i = 0; i < 12; i++) {
      const r = Math.random();
      const p = piece ?? (r < 0.6 ? 0 : r < 0.72 ? 2 : r < 0.84 ? 6 : 4);
      const len = loop.length(p);
      if (len < H) continue;
      u = loop.start(p) + H * 0.5 + Math.random() * (len - H);
      const at = loop.at(u);
      const clear = this.others.every((o) => {
        if (o === this || o.state === 'gone') return true;
        const b = o.bounds(this.frame);
        return (
          at.x < b.x - H * 1.2 ||
          at.x > b.x + b.w + H * 1.2 ||
          at.y < b.y - H ||
          at.y > b.y + b.h + H
        );
      });
      if (clear) break;
    }
    return u;
  }

  private swimTo(u: number, speed = this.front * 1.4) {
    // The long way round he puts on speed, to get there in a dozen seconds or so.
    const d = this.loop.toward(this.u, u);
    this.swimBy(d, Math.max(speed, Math.abs(d) / 12));
  }

  private swimBy(d: number, speed: number) {
    this.cruise = speed;
    this.accel = this.front * 1.3;
    this.target = this.u + d;
  }

  private turnRound(facing: 1 | -1) {
    if (facing === this.facing) return;
    this.facing = facing;
    this.turning = 1;
  }

  /** Bubbles (of a kind), at these many seconds from now. */
  private blow(times: number[], kind: Kind = 'plain') {
    this.blowAt.push(...times.map((t) => ({ at: this.time + t, kind })));
  }

  leave() {
    if (this.state !== 'here' || !this.free) return super.leave();
    if (this.exiting) return;
    // Swim to the nearer end of the bottom, then off behind the side of the frame.
    this.exiting = true;
    const loop = this.loop;
    const left = loop.at(this.u).x < (loop.L + loop.R) / 2;
    this.swimTo(left ? loop.start(0) : loop.start(0) + loop.length(0));
    this.setAct('idle');
  }

  protected onEnter() {
    this.free = null;
    this.exiting = false;
    this.target = null;
    this.h = 0;
    this.roam = HOME_DEPTH;
    this.reach.x.snap(0);
    this.reach.y.snap(0);
    for (const b of this.bubbles) b.at = -1;
    this.blowAt = [];
    this.cues = [];
  }

  /** In from the side: from here on he swims free in the band. */
  protected onArrive() {
    this.loop.set(this.frame, this.front);
    this.u = this.s - this.loop.L - this.loop.r;
    this.v = this.pace;
    this.pace = 0;
    this.facing = this.heading.y < 0 ? -1 : 1;
    this.free = { x: this.s, y: this.frame.bottom, tilt: 0 };
    this.depthGoal = this.roam;
    this.tilt.snap(0);
  }

  /** Back onto the frame line, to swim off behind the side of it. */
  private offstage() {
    const at = this.loop.at(this.u);
    this.free = null;
    this.edge = 'bottom';
    this.s = at.x;
    this.h = 0;
    this.pace = this.v * this.loop.tangent(this.u).x;
    this.exiting = false;
    super.leave();
  }

  // ---------- Swimming ----------

  /** The middle of his body, in viewport px. */
  private centre(frame = this.frame): Point {
    const foot = this.foot(frame);
    return { x: foot.x, y: foot.y - MIDDLE * this.heightPx };
  }

  protected move(dt: number, env: Env) {
    this.frame = env.frame;
    this.time = env.time;
    this.pointer = { x: env.pointer.x, y: env.pointer.y };
    this.others = env.crew;
    const H = this.front;
    const loop = this.loop;
    loop.set(env.frame, H);
    if (!this.free) {
      super.move(dt, env);
      this.swim = this.stride / (this.heightPx * 1.2);
      return;
    }

    let want = 0;
    if (this.target !== null) {
      const d = this.target - this.u;
      const dir = Math.sign(d);
      // A fish only swims forward (but for backing up): facing the wrong way, he slows
      // and turns round first.
      const tx = loop.tangent(this.u).x * dir;
      if (!this.reverse && Math.abs(tx) > 0.35 && Math.sign(tx) !== this.facing) {
        if (Math.abs(this.v) < H * 0.4) this.turnRound(Math.sign(tx) as 1 | -1);
      } else if (this.turning <= 0.35) {
        want = dir * Math.min(this.cruise, Math.sqrt(2 * this.accel * 0.8 * Math.abs(d)));
      }
      if (Math.abs(d) < 1.5 && Math.abs(this.v) < H * 0.3) this.arrive();
    }
    this.turning = Math.max(0, this.turning - dt * 1.1);
    this.v += clamp(want - this.v, -this.accel * dt, this.accel * dt);
    this.u += this.v * dt;
    this.swim = Math.abs(this.v) / (H * 1.2);

    // Face the way he's going; nose up or down with it round the corners.
    const t = loop.tangent(this.u);
    const k = clamp(Math.abs(this.v) / (H * 0.8), 0, 1);
    const going = (Math.sign(this.v) || 1) * (this.reverse ? -1 : 1);
    const pitch =
      Math.atan2(-t.y * going, Math.max(0.05, t.x * going * this.facing)) * k + this.nose() * DEG;
    this.free.tilt = this.tilt.update(dt, this.facing * pitch);
    this.heading.update(dt, this.facing * this.aim(HANG + (SWIM - HANG) * k));
    // Where he is: on the loop, plus a lift toward the mouse to nibble, a bob, a sink.
    const at = loop.at(this.u);
    const lift = this.lift(env);
    const rx = this.reach.x.update(dt, lift.x);
    const ry = this.reach.y.update(dt, lift.y);
    const [x, y] = this.inside(at.x + rx, at.y + ry, env.frame);
    this.free.x = x;
    this.free.y = y + MIDDLE * H;
    if (this.exiting && this.target === null) this.offstage();
  }

  /** Wherever he rises or tips to, his body stays inside the frame line. */
  private inside(x: number, y: number, frame: Frame): [number, number] {
    const H = this.front;
    const a = this.free?.tilt ?? 0;
    // How long he looks, turned as he is (a dizzy spin turns him side on too).
    const yaw = this.heading.y * DEG + this.pivot.rotation.y;
    const long =
      ((this.spec.width * this.heightPx) / this.spec.metres / 2) * Math.abs(Math.sin(yaw));
    const scale = this.front / this.heightPx;
    const [sa, ca] = [Math.abs(Math.sin(a)), Math.abs(Math.cos(a))];
    const l = long * scale;
    const up = H * 0.5 * ca + l * 0.55 * sa;
    const down = H * 0.42 * ca + l * 0.55 * sa;
    const side = l * 0.8 * ca + H * 0.5 * sa;
    const within = (v: number, lo: number, hi: number) =>
      lo < hi ? clamp(v, lo, hi) : (lo + hi) / 2;
    return [
      within(x, frame.left + side, frame.right - side),
      within(y, frame.top + up, frame.bottom - down),
    ];
  }

  private arrive() {
    this.target = null;
    this.v *= 0.5;
    if (this.exiting) return;
    if (this.act === 'visit' || this.act === 'headnip' || this.act === 'follow') {
      // Beside the crewmate: face them and say hello.
      const b = this.mate?.bounds(this.frame);
      if (b) this.turnRound((b.x + b.w / 2 > this.centre().x ? 1 : -1) as 1 | -1);
      if (this.act !== 'follow') this.blow([0.5, 1.6]);
      return;
    }
    if (this.reverse) return;
    // Hanging on a side, he faces into the page, not the frame.
    const [piece] = this.loop.locate(this.u);
    if (piece === 2) this.turnRound(-1);
    if (piece === 6) this.turnRound(1);
  }

  /** How far he is turned from us (degrees) for what he's doing; `base` when nothing special. */
  private aim(base: number) {
    const t = this.actT;
    switch (this.act) {
      case 'nibble':
        return 14;
      case 'gulp':
        return 26;
      case 'kiss':
      case 'bonk':
        return 6;
      case 'peek':
        return 4;
      case 'hello':
        return 52;
      case 'ring':
      case 'yawn':
      case 'chase':
        return 22;
      case 'lantern':
      case 'ripple':
      case 'twinkle':
        return 70;
      case 'scan':
        return 34 + 36 * Math.sin(t * 1.7);
      case 'sulk':
        return 84;
      case 'headnip':
        return this.target === null ? 26 : base;
      case 'snap':
        return 8;
      case 'fan':
        return 30;
      case 'roll':
      case 'drift':
        return 46;
      case 'waggle':
        return 52;
      case 'visit':
        return this.target === null ? 44 : base;
      default:
        return base;
    }
  }

  /** Nose up (degrees) for what he's doing. */
  private nose() {
    const t = this.actT;
    switch (this.act) {
      case 'gulp':
        return 28 + 6 * sin(t, 0.8);
      case 'nibble':
        return 8;
      case 'doze':
        return -4;
      case 'dizzy':
        return 14 * Math.sin(t * 5) * clamp(1.6 - Math.abs(t - 2.2), 0, 1);
      case 'graze':
        return -34 + 6 * sin(t, 2.4);
      case 'chase':
        return this.time > this.chaseAt ? 30 : 5;
      case 'yawn':
        return 16 * envelope(t, this.actLength, 0.6);
      case 'splash':
        return t < 0.9
          ? -38 * clamp(t / 0.5, 0, 1)
          : t < 1.4
            ? 30
            : t < 2.3
              ? -34 * clamp((t - 1.5) / 0.4, 0, 1)
              : 24 * bump(t - 2.55, 0.5);
      case 'sneeze':
        return t < 1.0 ? 22 * clamp(t / 0.9, 0, 1) : -26 * bump(t - 1.15, 0.35);
      case 'hiccup':
        return 10 * this.hic(t);
      case 'sulk':
        return -10;
      case 'headnip':
        return this.target === null ? 16 + 6 * sin(t, 1.8) : 0;
      case 'snap':
        return 22 * bump(t - 1.05, 0.3) - 8 * bump(t - 0.6, 0.3);
      case 'drift':
        return -6 - 3 * sin(t, 0.2);
      case 'fan':
        return 6;
      case 'lantern':
        return 5 * sin(t, 0.3);
      case 'playdead':
        return t > 0.5 && t < 3.6 ? 8 : 0;
      case 'ring':
        return 12 * bump(t - 1.0, 0.7);
      case 'twirl':
        return 10 * bump(t - 0.8, 0.5);
      default:
        return 3 * sin(this.time, 0.13) * (1 - this.swim);
    }
  }

  /** Hiccups, four of them: how much of a jolt he is in (0..1). */
  private hic(t: number) {
    let k = 0;
    for (let i = 0; i < 4; i++) k = Math.max(k, bump(t - (0.85 + 0.75 * i), 0.2));
    return k;
  }

  /** How far he rises out of his place (px): up to the mouse to nibble, up to the surface. */
  private lift(env: Env): Point {
    const H = this.front;
    const t = this.actT;
    const bob = { x: 0, y: H * 0.035 * sin(env.time, 0.27) };
    const f = this.facing;
    switch (this.act) {
      case 'nibble': {
        // Toward the mouse from where his eyes would be, but only so far: he never follows it.
        const c = project(this.frame, this.depth, this.loop.at(this.u));
        const k = this.heightPx / H;
        const eyes = (this.spec.eyes - MIDDLE) * this.heightPx;
        const dx = clamp((env.pointer.x - c.x) / k, -H * 0.4, H * 0.4);
        const dy = clamp((env.pointer.y - (c.y - eyes)) / k, -H * 0.4, H * 0.4);
        return { x: dx * 0.7, y: dy * 0.7 + bob.y * 0.5 };
      }
      case 'gulp':
        return { x: 0, y: -H * 0.18 - H * 0.04 * Math.max(0, sin(t, 0.8)) };
      case 'doze':
        return { x: 0, y: H * 0.06 + bob.y };
      case 'chase': {
        const a = env.time - this.chaseAt;
        return { x: 0, y: a < 0 ? 0 : -H * 1.2 * Math.min(a, 1) * (a < 2 ? 1 : 0) };
      }
      case 'splash': {
        const sink = clamp(t / 0.6, 0, 1) * (t < 0.9 ? 1 : 0);
        return { x: 0, y: H * 0.3 * sink - H * 0.4 * (bump(t - 1.05, 0.3) + bump(t - 2.45, 0.3)) };
      }
      case 'playdead':
        return {
          x: 0,
          y: t < 0.5 ? 0 : -H * 0.16 * clamp((t - 0.5) / 2, 0, 1) * (t < 3.6 ? 1 : 0),
        };
      case 'bob':
        return { x: 0, y: -H * 0.3 * Math.abs(Math.sin(t * 2.1)) + H * 0.05 };
      case 'hiccup':
        return { x: 0, y: -H * 0.12 * this.hic(t) };
      case 'sneeze':
        return { x: -f * H * 0.16 * bump(t - 1.15, 0.35), y: 0 };
      case 'sulk':
        return { x: 0, y: H * 0.12 * clamp(t / 1.5, 0, 1) };
      case 'twirl':
        return { x: 0, y: -H * 0.14 * bump(t - 0.85, 0.6) };
      case 'headnip':
        return { x: 0, y: this.target === null ? -H * 0.34 + bob.y : 0 };
      case 'snap': {
        const c = project(this.frame, this.depth, this.loop.at(this.u));
        const k = this.heightPx / H;
        const dx = clamp((env.pointer.x - c.x) / k, -H * 0.6, H * 0.6);
        const dy = clamp((env.pointer.y - c.y) / k, -H * 0.6, H * 0.6);
        const s = bump(t - 1.05, 0.3);
        return { x: dx * s, y: dy * s };
      }
      case 'drift':
        return { x: 0, y: H * 0.28 * envelope(t, this.actLength, 3) + bob.y };
      case 'fan':
        return { x: 0, y: -H * 0.05 + 0.03 * H * sin(t, 2.4) };
      case 'roll':
        return { x: 0, y: -H * 0.08 * Math.sin(clamp((t - 0.5) / 3.6, 0, 1) * Math.PI) };
      case 'spook':
        return { x: -f * H * 0.3 * bump(t - 0.5, 0.4), y: -H * 0.1 * bump(t - 0.5, 0.25) };
      case 'lantern':
        return { x: 0, y: bob.y * 1.5 };
      case 'yawn':
        return { x: 0, y: -H * 0.05 * envelope(t, this.actLength, 0.8) };
      default:
        return bob;
    }
  }

  // ---------- Posing ----------

  protected idle(t: number) {
    const p = this.puppet;
    // The barbels sway; the dorsal fin rises and falls a little.
    for (const [sfx, side] of [
      ['L', 1],
      ['R', -1],
    ] as const)
      p.add(`barbel.${sfx}`, 8 * sin(t, 0.7, side * 0.2), 0, side * 6 * sin(t, 0.5));
    p.add('head', 2 * wobble(t * 0.3, 2));
  }

  /** The face he pulls in each act (over the act's own, where it has one). */
  private mood(t: number): Expression | undefined {
    switch (this.act) {
      case 'dizzy':
        return t < 1.8 ? 'surprised' : 'dizzy';
      case 'nibble':
        return t > 2.5 ? 'love' : 'happy';
      case 'kiss':
        return t < 0.8 ? 'neutral' : 'love';
      case 'bonk':
        return t < 1.0 ? 'focused' : t < 3.1 ? 'surprised' : 'dizzy';
      case 'yawn':
        return t < 2.6 ? 'sleepy' : 'happy';
      case 'hiccup':
        return this.hic(t) > 0.25 ? 'surprised' : 'neutral';
      case 'sneeze':
        return t < 1.0 ? 'sleepy' : t < 2 ? 'surprised' : 'happy';
      case 'playdead':
        return t < 0.5 ? 'surprised' : t < 3.6 ? 'cross' : t < 4.3 ? 'surprised' : 'happy';
      case 'peek':
        return t < 1.5 ? 'neutral' : t < 3.6 ? 'wink' : 'surprised';
      case 'scan':
      case 'backup':
        return 'focused';
      case 'chase':
        return this.popped ? 'happy' : 'focused';
      case 'sulk':
        return 'sad';
      case 'spook':
        return t < 0.45 ? 'neutral' : t < 1.7 ? 'surprised' : 'neutral';
      case 'hello':
      case 'twirl':
      case 'ring':
      case 'ripple':
      case 'lap':
      case 'splash':
        return 'happy';
      case 'twinkle':
        return 'wink';
      case 'headnip':
        return this.target === null ? 'love' : 'neutral';
      case 'snap':
        return t < 0.9 ? 'focused' : t < 1.5 ? 'surprised' : 'happy';
      case 'flick':
        return 'focused';
      case 'roll':
        return t < 0.5 || t > 4 ? 'neutral' : 'happy';
      case 'follow':
        return this.target === null ? 'neutral' : 'happy';
      case 'spree':
      case 'fan':
      case 'corkscrew':
      case 'waggle':
        return 'happy';
      case 'drift':
        return 'sleepy';
      case 'visit':
        return this.target === null ? 'happy' : 'neutral';
    }
    return undefined;
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    const t = this.actT;
    const act = this.act;
    this.frame = env.frame;
    const swim = clamp(this.swim, 0, 1);
    this.cues = this.cues.filter(([at, fn]) => at > t || (fn(), false));

    // The mouse resting right on him: up he comes to nibble at it. Moved or gone, he stops.
    const resting = env.pointer.present && env.time - env.pointer.at > 0.35;
    this.hover = this.hovered && resting ? this.hover + dt : 0;
    const calm = [
      'idle',
      'glide',
      'bubbles',
      'about',
      'shimmy',
      'gulp',
      'doze',
      'nibble',
      'ripple',
      'twinkle',
      'drift',
      'fan',
      'spree',
    ];
    if (this.hover > 0.6 && this.free && !this.exiting && this.target === null && act !== 'nibble')
      if (calm.includes(act)) this.setAct('nibble');
    if (act === 'nibble' && (!this.hovered || !resting)) this.setAct('idle');

    // Looking about follows the mouse with his whole body when he hangs, much less on the move.
    this.spec.gaze[1].yaw = 0.45 - 0.35 * swim;
    this.spec.gaze[0].yaw = 0.35 - 0.2 * swim;

    this.expression = this.mood(t) ?? (this.hovered ? 'happy' : 'neutral');

    // Catching his bubble: the moment he gets to it, it pops.
    if (act === 'chase' && !this.popped && env.time - this.chaseAt > 0.8) {
      this.popped = true;
      this.popAt = env.time;
      for (const b of this.bubbles) if (b.at >= 0 && b.ay === -0.5) b.life = env.time - b.at;
    }

    // Pectoral fins: paddling to hold him in place, tucked back at speed, a flutter when
    // he's pleased; a quick scull when he nibbles.
    const quick =
      act === 'nibble' || act === 'gulp' || act === 'bob' || act === 'backup' || this.hovered;
    for (const [fin, side] of FINS) {
      let hz = act === 'doze' ? 0.3 : quick ? 2.2 : 0.9;
      let beat = act === 'doze' ? 6 : quick ? 16 : 12;
      let spread = 10 + 30 * swim;
      if (act === 'backup') [hz, beat, spread] = [3, 24, 30];
      else if (act === 'yawn') [hz, beat, spread] = [0.5, 8, 60];
      else if (act === 'sulk') [hz, beat, spread] = [0.3, 3, -6];
      else if (act === 'lantern') [hz, beat] = [0.6, 8];
      else if (act === 'fan') [hz, beat, spread] = [3.2, 34, 42];
      else if (act === 'drift') [hz, beat, spread] = [0.2, 4, 6];
      else if (act === 'waggle' || act === 'flick') [hz, beat, spread] = [3, 22, 34];
      else if (act === 'corkscrew') [hz, beat, spread] = [0, 0, 50];
      else if (act === 'roll') [hz, beat, spread] = [1.2, 14, 26];
      else if (act === 'headnip' && this.target === null) [hz, beat] = [2.4, 16];
      else if (act === 'snap' && t > 0.9 && t < 1.4) [hz, beat, spread] = [0, 0, 55];
      else if (act === 'spook' && t < 0.45) [hz, beat, spread] = [0, 0, 45];
      if (act === 'playdead' && t > 0.5 && t < 3.6) {
        p.add(fin, 25, side * 55, side * 35);
        continue;
      }
      const k = sin(env.time, hz, side > 0 ? 0 : 0.5) * (1 - swim * 0.7);
      p.add(fin, beat * 0.6 * k, side * (spread + beat * 0.5 * k), side * beat * k);
      if (act === 'hello') {
        const up = envelope(t, this.actLength, 0.4);
        p.add(fin, -30 * up, 40 * up, (55 + 30 * sin(t, 3.6)) * up);
      }
    }

    // The dorsal fin: raised when he's alert or pleased, folded when he dozes or dashes.
    const alert = [
      'nibble',
      'shimmy',
      'gulp',
      'hello',
      'ring',
      'kiss',
      'bonk',
      'yawn',
      'twirl',
      'chase',
      'fan',
      'waggle',
      'snap',
      'spree',
    ];
    const folded = ['doze', 'dart', 'playdead', 'sulk', 'drift', 'corkscrew'];
    const raise = folded.includes(act)
      ? -25
      : act === 'spook' && t > 0.4
        ? 30
        : this.hovered || alert.includes(act)
          ? 14
          : -4 - 10 * swim;
    p.add('dorsal', raise + 3 * sin(env.time, 0.4));

    // The mouth: pushed out and working to nibble or gulp, puffing out each bubble.
    let out = 0;
    this.mouthOpen = 0;
    if (act === 'nibble') {
      out = 1;
      this.mouthOpen = Math.max(0, sin(t, 2.6));
    } else if (act === 'gulp') {
      out = 0.8;
      this.mouthOpen = Math.max(0, sin(t, 0.8, -0.1)) ** 0.7;
    } else if (act === 'doze') this.mouthOpen = 0.3 + 0.2 * sin(t, 0.25);
    else if (act === 'graze') {
      out = 0.9;
      this.mouthOpen = Math.max(0, sin(t, 2.4)) ** 0.6;
    } else if (act === 'kiss') {
      out = t > 0.6 ? 0.5 : 0;
      for (const s of [1.0, 1.9, 2.8]) out = Math.max(out, 1.4 * bump(t - s, 0.22));
    } else if (act === 'bonk') {
      for (const s of [1.0, 1.9, 2.8]) out = Math.max(out, 0.9 * bump(t - s, 0.15));
    } else if (act === 'yawn') this.mouthOpen = 2.4 * clamp(Math.min(t - 0.3, 2.9 - t) / 0.6, 0, 1);
    else if (act === 'sneeze')
      this.mouthOpen = 0.5 * bump(t - 0.85, 0.3) + 1.2 * bump(t - 1.1, 0.2);
    else if (act === 'hiccup') this.mouthOpen = this.hic(t);
    else if (act === 'ring') {
      out = 0.9 * bump(t - 0.9, 0.5);
      this.mouthOpen = 0.9 * bump(t - 0.9, 0.5);
    } else if (act === 'chase' && this.popped)
      this.mouthOpen = 1.6 * bump(env.time - this.popAt - 0.1, 0.3);
    else if (act === 'headnip' && this.target === null) {
      out = 1;
      this.mouthOpen = Math.max(0, sin(t, 2.2)) * 0.8;
    } else if (act === 'snap') {
      out = 1.3 * bump(t - 1.05, 0.25);
      this.mouthOpen = 2 * bump(t - 1.0, 0.25);
    } else if (act === 'drift') this.mouthOpen = 0.3 + 0.2 * sin(t, 0.22);
    else if (act === 'fan') this.mouthOpen = 0.15 * (0.5 + 0.5 * sin(t, 1.2));
    else if (act === 'hello') this.mouthOpen = 0.25 * (0.5 + 0.5 * sin(t, 3.6));
    for (const b of this.blowAt) {
      const k = bump(env.time - b.at + 0.15, 0.35);
      out = Math.max(out, k);
      this.mouthOpen = Math.max(this.mouthOpen, k);
    }
    this.mouthOut.update(dt, out);

    // Bending into turns: the tail lags as he comes about or rounds a corner.
    const yawRate = clamp(this.heading.v, -300, 300);
    const tiltRate = clamp(this.tilt.v, -4, 4) / DEG;
    CHAIN.forEach((bone, i) => {
      p.add(
        bone,
        clamp(this.facing * tiltRate * 0.03 * (i + 1), -12, 12),
        -yawRate * 0.02 * (i + 1),
      );
    });
    p.add('head', 0, yawRate * 0.02);

    if (act === 'shimmy') p.add('root', 0, 0, 6 * sin(t, 2));
    if (act === 'doze') p.add('root', 0, 0, 4 + 2 * sin(t, 0.2));
    // Playing dead: belly up, and a little shake to wake.
    if (act === 'playdead') {
      const dead = t > 0.5 && t < 3.6;
      p.add('root', 0, 0, dead ? 172 : 0);
      if (t > 3.5 && t < 4.2) p.add('root', 0, 0, 8 * Math.sin(t * 30));
    }
    if (act === 'bonk') p.add('head', 0, 0, 14 * Math.sin(t * 24) * bump(t - 3.2, 0.5));
    if (act === 'sneeze') p.add('head', -14 * bump(t - 1.15, 0.3), 0, 0);
    if (act === 'hiccup') p.add('head', -12 * this.hic(t), 0, 0);
    if (act === 'scan') p.add('head', 0, 20 * Math.cos(t * 1.7), 0);
    if (act === 'sulk') p.add('head', 6, 0, 0);
    if (act === 'drift') p.add('head', 5, 0, 0);
    if (act === 'waggle') p.add('head', 0, 0, 10 * sin(t, 2.5));
    if (act === 'headnip' && this.target === null) p.add('head', 6 * sin(t, 2.2), 0, 0);
  }

  /** The body wave, the mouth and bubbles, the lights: set straight on the bones. */
  protected after(dt: number, env: Env) {
    const p = this.puppet;
    const act = this.act;
    const t = this.actT;
    const swim = clamp(this.swim, 0, 3);

    // The swimming wave: a slow sway hanging in the water, quicker and bigger on the move.
    let hz = 0.5 + 0.8 * swim;
    let amp = 4 + 8 * Math.min(swim, 1.4);
    if (act === 'doze') [hz, amp] = [0.25, 2.5];
    if (act === 'shimmy')
      [hz, amp] = [3.2, 7 * clamp(Math.min(t / 0.3, (this.actLength - t) / 0.3), 0, 1) + 3];
    if (act === 'nibble') [hz, amp] = [1.4, 4];
    if (act === 'backup') [hz, amp] = [1.6, 4];
    if (act === 'graze') [hz, amp] = [1.2, 5];
    if (act === 'bob') [hz, amp] = [2.1, 9];
    if (act === 'twirl' && t < 1.6) [hz, amp] = [3.4, 10];
    if (act === 'chase' && t > 0.6 && t < 2) [hz, amp] = [2.6, 9];
    if (act === 'playdead' && t > 0.5 && t < 3.6) [hz, amp] = [0.3, 0.8];
    if (act === 'spook' && t < 0.45) amp = 0;
    if (act === 'lantern' || act === 'yawn' || act === 'sulk') [hz, amp] = [0.3, 3];
    if (act === 'ripple') [hz, amp] = [1.2, 6];
    if (act === 'fan') [hz, amp] = [0.7, 3];
    if (act === 'drift') [hz, amp] = [0.22, 2];
    if (act === 'waggle') [hz, amp] = [2.6, 13];
    if (act === 'corkscrew') [hz, amp] = [2.4, 9];
    if (act === 'roll') [hz, amp] = [0.5, 3];
    if (act === 'flick') [hz, amp] = [3, 12];
    if (act === 'spree') [hz, amp] = [0.9, 5];
    if (act === 'headnip' && this.target === null) [hz, amp] = [1.2, 3];
    this.phase += dt * 2 * Math.PI * hz;
    // A dart starts with the body curled into a C, then snaps straight; so does a tail flick.
    let c = act === 'dart' ? clamp(t / 0.12, 0, 1) * clamp(1 - (t - 0.14) / 0.1, 0, 1) : 0;
    let flick = act === 'dart' && t < 0.9 ? 1.6 : 1;
    if (act === 'splash') {
      c = 1.2 * (bump(t - 0.95, 0.12) + bump(t - 2.35, 0.12)) - 0.6 * bump(t - 0.7, 0.2);
      flick = 1.4;
    }
    if (act === 'sneeze') c = -0.8 * bump(t - 1.15, 0.2);
    if (act === 'flick')
      c =
        0.9 * (bump(t - 0.45, 0.12) + bump(t - 1.25, 0.12)) -
        0.3 * (bump(t - 0.2, 0.15) + bump(t - 1.0, 0.15));
    if (act === 'snap') c = -0.5 * bump(t - 1.05, 0.2) + 0.4 * bump(t - 0.6, 0.25);
    if (act === 'spook') c = 0.9 * bump(t - 0.5, 0.15);
    WAVE.forEach(([bone, share], i) => {
      const wave = Math.sin(this.phase - i * 0.9) * amp * share * flick;
      p.turn(bone, 0, wave + c * 30 * share * this.dartWay * this.facing, 0);
    });

    // The mouth pushes out of the nose and opens.
    const out = Math.max(0, this.mouthOut.y);
    p.shift('mouth', 0, 0, 0.018 * out);
    const open = 1 + 0.35 * this.mouthOpen;
    p.stretch('mouth', 1, [0, 0, 1], open);

    // A slow roll shows his belly; a corkscrew rolls twice as he swims.
    let roll = 0;
    if (act === 'roll') {
      const u = clamp((t - 0.5) / 3.4, 0, 1);
      roll = 360 * u * u * (3 - 2 * u);
    } else if (act === 'corkscrew') {
      const u = clamp((t - 0.2) / 2.6, 0, 1);
      roll = 720 * u * u * (3 - 2 * u);
    }
    if (roll) p.turn('root', 0, 0, roll * this.facing);
    // Belly up he turns about his middle, not the floor under it.
    p.shift('root', 0, act === 'playdead' ? 0.32 * clamp(p.current('root')[2] / 172, 0, 1) : 0, 0);

    // Spinning: dizzy goes round twice, a pirouette once.
    let spin = 0;
    if (act === 'dizzy') {
      const u = clamp((t - 0.1) / 1.7, 0, 1);
      spin = 4 * Math.PI * u * u * (3 - 2 * u);
    } else if (act === 'twirl') {
      const u = clamp((t - 0.2) / 1.2, 0, 1);
      spin = 2 * Math.PI * u * u * (3 - 2 * u);
    }
    this.pivot.rotation.y = spin;
    // Coming at the glass: a little bigger with each smack or bump.
    let grow = 1;
    if (act === 'kiss') for (const s of [1.0, 1.9, 2.8]) grow += 0.07 * bump(t - s, 0.25);
    if (act === 'bonk') for (const s of [1.0, 1.9, 2.8]) grow += 0.14 * bump(t - s, 0.12);
    this.pivot.scale.setScalar(grow);

    this.lights(env.time);
    this.bubbleSizes(env.time);

    // The bubbles take his mood's colour.
    const mood = this.face?.expression ?? 'neutral';
    const tone =
      mood === 'dizzy'
        ? RAINBOW[Math.floor(env.time * 6) % RAINBOW.length]
        : mood === 'love' || mood === 'happy'
          ? BEACON[mood]!
          : '#f4f4f1';
    this.beaconColour.lerp(new Color(tone), Math.min(1, dt * 6));
    this.outfit.beacon(this.beaconColour);
  }

  /** The scale lights: ten bands, head to tail. */
  private lights(time: number) {
    const act = this.act;
    const t = this.actT;
    const next = this.blowAt.length ? Math.min(...this.blowAt.map((b) => b.at)) - time : Infinity;
    for (let i = 0; i < BANDS; i++) {
      const x = i / (BANDS - 1);
      let level: number;
      let tone: string | undefined;
      if (act === 'dart') {
        // Startled: every scale flashes, then fades.
        level = clamp(1.5 - t, 0.1, 1) * (Math.sin(time * 28) > 0 ? 1 : 0.6);
        tone = BEACON.surprised;
      } else if (act === 'corkscrew' || (act === 'roll' && t > 0.5 && t < 3.9)) {
        // Lit ripples spiral along him as he rolls.
        level = 0.25 + 0.75 * Math.max(0, Math.sin(time * 9 - x * 6)) ** 2;
        tone = RAINBOW[(i + Math.floor(time * 5)) % RAINBOW.length];
      } else if (act === 'flick') {
        level = clamp(1.4 - (t % 0.8) * 2, 0.15, 1);
        tone = BEACON.focused;
      } else if (act === 'snap') {
        level = t < 0.9 ? 0.3 : clamp(1.9 - t, 0.12, 1) * (Math.sin(time * 26) > 0 ? 1 : 0.5);
        tone = t < 0.9 ? BEACON.focused : BEACON.surprised;
      } else if (act === 'fan') {
        level = 0.3 + 0.7 * bump(cycle(time * 1.6) * 1.4 - 0.2 - (1 - x), 0.2);
        tone = BEACON.happy;
      } else if (act === 'waggle') {
        level = Math.sin(time * 14 + i * 1.2) > 0 ? 1 : 0.2;
        tone = BEACON.happy;
      } else if (act === 'drift') {
        level = 0.08 + 0.1 * (0.5 + 0.5 * Math.sin(time * 0.7 - x * 1.5));
      } else if (act === 'headnip' && this.target === null) {
        level = 0.35 + 0.65 * bump(cycle(time * 1.2) - x * 0.7, 0.2);
        tone = BEACON.love;
      } else if (act === 'spree') {
        level = 0.15 + 0.85 * bump(cycle(time * 2) - (1 - x), 0.2);
        tone = BEACON.happy;
      } else if (act === 'dizzy' || act === 'shimmy' || act === 'twirl' || act === 'lap') {
        // A rainbow racing down him.
        level = 1;
        tone = RAINBOW[(i + Math.floor(time * 9)) % RAINBOW.length];
      } else if (next < 0.9) {
        // About to blow a bubble: a light runs up him to his mouth.
        level = 0.1 + 0.9 * bump(1 - next / 0.9 - (1 - x), 0.18);
      } else if (act === 'ripple') {
        // Three slow ripples of warm light, head to tail.
        level = 0.1 + 0.9 * bump(cycle(t / 1.1) * 1.5 - 0.25 - x, 0.22);
        tone = BEACON.happy;
      } else if (act === 'twinkle') {
        // Scales sparkling here and there.
        const n = Math.sin(time * 5.3 + i * 7.13) * Math.sin(time * 3.1 + i * 3.7);
        level = n > 0.45 ? 1 : 0.1 + 0.3 * Math.max(0, n);
      } else if (act === 'lantern') {
        level = 0.85 + 0.15 * Math.sin(time * 1.6 - x * 2);
        tone = BEACON.happy;
      } else if (act === 'scan') {
        level = 0.12 + 0.88 * bump(cycle(time * 0.6) * 1.4 - 0.2 - x, 0.16);
        tone = BEACON.focused;
      } else if (act === 'kiss') {
        level = 0.2 + 0.8 * Math.max(bump(t - 1.0, 0.4), bump(t - 1.9, 0.4), bump(t - 2.8, 0.4));
        tone = BEACON.love;
      } else if (act === 'playdead') {
        level = t > 0.5 && t < 3.6 ? 0.04 : t > 3.6 && t < 4.4 ? 1 : 0.15;
      } else if (act === 'sulk') {
        level = 0.1 + 0.05 * Math.sin(time * 0.7 - x);
        tone = BEACON.sad;
      } else if (act === 'spook') {
        level = t < 0.45 ? 0.6 : clamp(1.8 - t, 0.1, 1) * (Math.sin(time * 26) > 0 ? 1 : 0.5);
        tone = BEACON.surprised;
      } else if (act === 'hello') {
        level = 0.3 + 0.7 * bump(cycle(time * 1.4) - x * 0.6, 0.2);
        tone = BEACON.happy;
      } else if (act === 'peek') {
        level =
          t > 3.6
            ? clamp(1.4 - (t - 3.6), 0.15, 1)
            : 0.12 + 0.5 * bump(cycle(time / 2) - x * 0.35, 0.1);
        tone = t > 3.6 ? BEACON.surprised : undefined;
      } else if (act === 'doze') {
        level = 0.12 + 0.14 * (0.5 + 0.5 * Math.sin(time * 0.9 - x * 1.5));
      } else if (act === 'nibble') {
        level = 0.35 + 0.65 * bump(cycle(time * 1.2) - x * 0.7, 0.2);
        tone = t > 2.5 ? BEACON.love : BEACON.happy;
      } else if (this.hovered) {
        level = 0.3 + 0.7 * bump(cycle(time / 1.2) - x * 0.6, 0.18);
        tone = BEACON.happy;
      } else if (act === 'gulp' || act === 'yawn') {
        // Each gulp sends a ripple from tail to head.
        level = 0.12 + 0.88 * bump(cycle(t * 0.8) - (1 - x) * 0.5, 0.15);
      } else if (act === 'graze') {
        // Flickering as he finds crumbs.
        level = Math.sin(time * 9 + i * 2.1) > 0.6 ? 0.9 : 0.15;
      } else if (this.swim > 0.2) {
        // Swimming: a sheen that runs down him with each beat of his tail.
        const k = clamp(this.swim, 0, 1);
        level = 0.12 + 0.88 * k * Math.max(0, Math.sin(this.phase - x * 3.5)) ** 3;
      } else {
        // Hanging in the water: now and then a slow glint runs along him.
        level = 0.12 + 0.7 * bump(cycle(time / 4.5) - x * 0.35, 0.08);
      }
      this.outfit.dot(i, level, tone);
    }
  }

  /** Bubbles come out of his mouth (or tail), grow as they leave and pop at the end of their life. */
  private bubbleSizes(time: number) {
    // Due ones come out now.
    const due = this.blowAt.filter((b) => b.at <= time);
    this.blowAt = this.blowAt.filter((b) => b.at > time);
    due.forEach((b) => this.spawn(b.kind, time));
    this.bubbles.forEach((b, i) => {
      const age = time - b.at;
      let s = 0.001;
      if (b.at >= 0) {
        if (age < b.life)
          s = b.size * (0.35 + 0.65 * clamp(age / 0.3, 0, 1) + 0.15 * (age / b.life));
        else if (age < b.life + 0.08)
          s = b.size * 1.6; // pop
        else b.at = -1;
      }
      this.puppet.stretch(`bubble.${i}`, s, [0, 1, 0], s);
    });
  }

  private spawn(kind: Kind, time: number) {
    const r = Math.random;
    let n = 0;
    const put = (o: Partial<Bubble>) => {
      const b = this.bubbles.find((x) => x.at < 0) ?? this.bubbles[n % this.bubbles.length];
      n++;
      Object.assign(
        b,
        {
          at: time,
          life: 1.4 + r() * 0.8,
          size: 0.7 + r() * 0.5,
          drift: r() * 10,
          vx: 0,
          vy: 0.5,
          ay: 0,
          sway: 1,
          origin: 'mouth',
          surface: true,
        } satisfies Partial<Bubble>,
        o,
      );
      b.from.set(NaN, 0, 0); // set from his mouth once he's in place (see placeBubbles)
    };
    const f = this.facing;
    if (kind === 'plain') put({});
    else if (kind === 'big') put({ life: 3, size: 1.9, vy: 0.28, sway: 0.6 });
    else if (kind === 'chase')
      put({ life: 3, size: 1, vy: 1.4, ay: -0.5, sway: 0.3, surface: false });
    else
      for (let i = 0; i < 5; i++) {
        if (kind === 'ring') {
          const a = (i / 5) * 2 * Math.PI + Math.PI / 2;
          put({
            life: 1.9,
            size: 0.55,
            vx: Math.cos(a) * 0.24,
            vy: 0.22 + Math.sin(a) * 0.24,
            sway: 0,
            surface: false,
          });
        } else if (kind === 'spray')
          put({
            life: 1.1 + r() * 0.3,
            size: 0.45 + r() * 0.4,
            vx: f * (0.2 + r() * 0.5),
            vy: (r() - 0.3) * 0.5,
            sway: 0,
            surface: false,
          });
        else
          put({
            origin: 'tail',
            life: 1.05,
            size: 0.4 + r() * 0.15,
            vx: (i - 2) * 0.28 + (r() - 0.5) * 0.15,
            vy: 0.9 + r() * 0.6,
            ay: -2.4,
            sway: 0,
            surface: false,
          });
      }
  }

  update(dt: number, env: Env) {
    super.update(dt, env);
    if (this.state === 'gone') return;
    this.placeBubbles(env);
  }

  /** Bubbles leave from where they came out, whatever he does, straight up the page. */
  private placeBubbles(env: Env) {
    // Popped ones go back inside his head (their outline would show as a dot otherwise).
    this.bubbles.forEach((b, i) => {
      if (b.at < 0) this.puppet.bone(`bubble.${i}`)!.position.copy(this.rest[i]);
    });
    const live = this.bubbles.filter((b) => b.at >= 0);
    if (!live.length) return;
    this.holder.updateMatrixWorld(true);
    // Back in the box the page is smaller: so are his heights.
    const H = this.heightPx;
    const top = -project(env.frame, this.depth, { x: 0, y: env.frame.top + this.front * 0.04 }).y;
    live.forEach((b) => {
      const i = this.bubbles.indexOf(b);
      const bone = this.puppet.bone(`bubble.${i}`) as Bone;
      if (Number.isNaN(b.from.x)) {
        this.puppet.bone(b.origin).getWorldPosition(b.from);
        // Up at the frame line, the surface, it pops.
        if (b.surface) b.life = clamp((top - b.from.y) / (b.vy * H), 0.25, b.life);
      }
      const age = env.time - b.at;
      v3.set(
        b.from.x + Math.sin(age * 5 + b.drift) * H * 0.05 * b.sway + b.vx * H * age,
        b.from.y + (b.vy * age + 0.5 * b.ay * age * age) * H,
        b.from.z,
      );
      bone.parent!.worldToLocal(v3);
      bone.position.copy(v3);
    });
  }

  /** His box on the page, for the mouse: turned with him round the corners. */
  bounds(frame: Frame) {
    const c = this.centre(frame);
    const H = this.heightPx;
    const long = (this.widthPx() / 2) * Math.max(0.5, Math.abs(Math.sin(this.heading.y * DEG)));
    const high = H * 0.5;
    const a = this.free?.tilt ?? 0;
    const w = Math.abs(long * Math.cos(a)) + Math.abs(high * Math.sin(a));
    const h = Math.abs(long * Math.sin(a)) + Math.abs(high * Math.cos(a));
    return { x: c.x - w, y: c.y - h, w: 2 * w, h: 2 * h };
  }
}
