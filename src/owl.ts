import { Color, type Material, type Mesh, type Object3D, type Vector3 } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Act, Character, clamp, envelope, type Env, type Frame } from './character';
import { type Detail, type Tile, withDetail } from './detail';
import type { FaceLayout } from './face';
import type { FlameStyle, LookName } from './looks';
import { sin } from './moves';
import { Spring } from './spring';

/**
 * Hoot, the robot owl. He flies up from behind the frame line on a flurry of wingbeats
 * and perches on it, and mostly he watches: the eyes find the mouse, then the head
 * follows, and the rest of him stays put. His head sits on a bearing, so it turns
 * further than anyone else's: right round to look behind him, and when he's dizzy,
 * round and round.
 *
 * He flies for real. He crouches, flaps up off the floor (each wing is four feather plates
 * on their own bones, fanning as it beats), banks into his turns, glides on still wings,
 * hovers on fast beats, swoops low over the floor, and lands with his wings flared and
 * his talons reaching out. Or he flies up to the ceiling and hangs there upside down by his
 * talons with his head turned the right way up, like a bat, and drops off after a while.
 *
 * On the floor: bobbing and tilting his head, a slow blink, one eye open in a nap, a
 * double take, hooting, preening, ruffling up and shaking out, stretching and waving a
 * wing, scratching his head with a foot, a yawn, stargazing, twitching his tufts, a
 * pirouette, shuffling sideways along the line, strolling to the back wall to peer out
 * or to the front lip to look over it, and looking at a crewmate.
 *
 * He keeps an owl's hours by the real clock: by day he's drowsy, lenses dim, dozing
 * with his tufts down; at night, and on a dark page, he's wide awake and his lenses glow.
 *
 * The two lens rings round his eyes are his light: amber at rest, pulsing with each
 * hoo, pink when the mouse rests on him (after a slow blink, an owl's way of saying he
 * trusts you), a blue flash when he's poked (he puffs up, wings out, tufts up). Three
 * lamps on his chest breathe and a light at each wing's quill tip runs in the air.
 */
export const OWL_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.27, 0.5],
    [0.73, 0.5],
  ],
  rx: 0.15,
  ry: 0.3,
  line: 0.042,
  mouth: null,
};

/** Soft overlapping feather scales, rows offset by half a scale (colour look only). */
const FEATHERS: Tile = {
  name: 'feathers',
  scale: 9,
  amount: 0.32,
  draw: (g, size) => {
    const w = size / 4;
    const h = size / 4;
    g.lineWidth = 1.6;
    for (let row = -1; row < 5; row++) {
      for (let col = -1; col < 5; col++) {
        const x = col * w + (row % 2 ? w / 2 : 0);
        const y = row * h;
        for (const dx of [-size, 0, size]) {
          g.beginPath();
          g.arc(x + dx, y, w * 0.52, 0.15 * Math.PI, 0.85 * Math.PI);
          g.strokeStyle = 'rgba(0,0,0,0.5)';
          g.stroke();
          g.beginPath();
          g.arc(x + dx, y - 2, w * 0.52, 0.2 * Math.PI, 0.8 * Math.PI);
          g.strokeStyle = 'rgba(255,255,255,0.35)';
          g.stroke();
        }
      }
    }
  },
};

const LENS = '#ffb347';
const DIM = new Color('#55554f');
const colour = new Color();
const WINGS = [
  ['wing.L', 1],
  ['wing.R', -1],
] as const;
const TUFTS = [
  ['tuft.L', 1],
  ['tuft.R', -1],
] as const;
/** The hoots in a hoot act: start and end, seconds (a "hoo, hoo-hoo"). */
const HOOS: [number, number][] = [
  [0.4, 1.2],
  [1.6, 1.9],
  [2.05, 2.8],
];
/** 0 to 1 and back over [a, b]. */
const hump = (t: number, a: number, b: number) =>
  t < a || t > b ? 0 : Math.sin(((t - a) / (b - a)) * Math.PI);

const SIDES = [
  ['L', 1],
  ['R', -1],
] as const;
/** 0 before a, 1 after b, eased between. */
const ease = (t: number, a: number, b: number) => {
  const u = clamp((t - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
};
/** Fades in over a..b, holds, and fades out over c..d. */
const span = (t: number, a: number, b: number, c: number, d: number) =>
  ease(t, a, b) * (1 - ease(t, c, d));

type Mode = 'climb' | 'glide' | 'hover' | 'swoop' | 'roost' | 'drop' | 'land' | 'perch';
interface Waypoint {
  x: number;
  y: number;
  /** How far back into the box to be by the time it's reached (0 front, 1 back wall). */
  d?: number;
  mode: Mode;
  /** Speed, in body heights per second. */
  v: number;
  /** Stays here this many seconds before going on (hovering, hanging). */
  hold?: number;
  /** Out of the box toward the reader by now (world px; 0, back in the box, if not said). */
  n?: number;
}
type Kind = 'flyover' | 'swoop' | 'hover' | 'glide' | 'roost';
/** Wing beats in the air: rate (Hz), amplitude (degrees), how far open, body pitch, legs. */
const AIR: Record<Mode, { rate: number; amp: number; open: number; body: number; legs: number }> = {
  climb: { rate: 4.4, amp: 50, open: 1, body: 22, legs: 50 },
  glide: { rate: 0.7, amp: 7, open: 1, body: 30, legs: 60 },
  hover: { rate: 6.8, amp: 36, open: 1, body: -4, legs: 25 },
  swoop: { rate: 1.6, amp: 14, open: 1, body: 40, legs: 65 },
  roost: { rate: 0, amp: 0, open: 0.05, body: 0, legs: -170 },
  drop: { rate: 0, amp: 0, open: 0.2, body: 30, legs: 40 },
  land: { rate: 6, amp: 56, open: 1.05, body: -22, legs: -75 },
  // Sitting on something out of the box (the book's stand): wings folded, on his feet.
  perch: { rate: 0, amp: 0, open: 0.05, body: 0, legs: 0 },
};

export class Owl extends Character {
  /** Held by the pointer, it flies after it. */
  readonly flies = true;
  private env: Env | null = null;
  private pokes: number[] = [];
  private hover = 0;
  private light = new Color(LENS);
  /** Awake at night, drowsy by day (the visitor's own clock). */
  private night = false;
  /** Fluffed up (+) or sleeked down (-). */
  private fluff = new Spring(2.5, 0.45);
  private fluffNow = 0;
  /** Wings: 0 folded, 1 spread, one spring a side; and how hard they beat. */
  private spread = [new Spring(3, 0.6), new Spring(3, 0.6)];
  private beatPhase = 0;
  private beatAmp = new Spring(4, 0.8);
  private way = 1;
  private did = 0;
  private lift = 0;
  /** Set each frame by whatever is going on (see idle()). */
  private open = [0, 0];
  private flapAmp = 0;
  private flapRate = 3.2;
  private fan = 0;
  private glow = 0;
  private spin = 0;
  private waveAmp = 0;
  private waveSide = 0;
  // Flight
  private flight: 'no' | 'crouch' | 'air' = 'no';
  private kind: Kind = 'flyover';
  private vel = { x: 0, y: 0 };
  private route: Waypoint[] = [];
  private holdT = 0;
  private exiting = false;
  /** Fetching something for the reader (a page, by its corner): where it is (world px), and
   * what to do once he has hold of it; on his way (over it first), or holding it. */
  private job: {
    at: () => Vector3 | null;
    onHold: () => void;
    /** How far out toward the reader whatever it's on comes (the open book's pages, world
     * z): he stays in front of that going across it. */
    front?: () => number | null;
    over: boolean;
    holding: boolean;
    mode: Mode;
  } | null = null;
  private forthV = 0;
  private tilt = new Spring(1.6, 0.8);
  private flip = new Spring(1.6, 0.6);
  private legsT = new Spring(4, 0.6);
  private bank = new Spring(2, 0.7);
  /** Seconds since touching down (the wings fold in stages), or -1. */
  private settle = -1;
  /** A quick wing flick to catch his balance, fading. */
  private flick = 0;
  private wobbleIn = 8 + Math.random() * 6;

  constructor(model: Object3D) {
    super(
      {
        name: 'Hoot',
        model: 'owl',
        metres: 0.73,
        width: 0.5,
        size: 1.05,
        feels: {
          default: { f: 2.5, zeta: 0.6 },
          body: { f: 1.8, zeta: 0.5 },
          // Quick to turn and dead still after: no wobble on the bearing.
          head: { f: 2.6, zeta: 0.85, r: 0.2 },
          'tuft.L': { f: 4.5, zeta: 0.22 },
          'tuft.R': { f: 4.5, zeta: 0.22 },
          'wing.L': { f: 3, zeta: 0.5 },
          'wing.R': { f: 3, zeta: 0.5 },
          'leg.L': { f: 5, zeta: 0.6 },
          'leg.R': { f: 5, zeta: 0.6 },
        },
        face: OWL_FACE,
        eyes: 0.75,
        // The head does all the looking.
        gaze: [{ bone: 'head', yaw: 1, pitch: 0.9 }],
        reach: { yaw: 85, pitch: 35 },
        lag: 1.6,
        entrance: 'rise',
        edges: ['bottom'],
        stay: [50, 110],
        speed: 0.6,
        // He sidesteps along the line, still facing you.
        turn: 0,
      },
      model,
    );
    this.acts = { ...this.floor(), ...this.more(), ...this.flights(), ...this.reactions() };
    // The tufts trail a head that turns: a flick the other way as each big turn starts.
    for (const name of ['swivel', 'lookback', 'roundAndBack', 'doubleTake', 'preen']) {
      const start = this.acts[name].start;
      this.acts[name].start = () => {
        start?.();
        for (const [tuft, side] of TUFTS) this.puppet.kick(tuft, 0, 0, side * -this.way * 260);
      };
    }
  }

  /**
   * Colour look only: a soft feather-scale print on the body, chest and head shells, grain
   * on the dark joints. The ink and paper looks stay clean.
   */
  dress(look: LookName, flame?: FlameStyle) {
    super.dress(look, flame);
    if (look !== 'colour') return;
    const planes = this.outfit.materials[0]?.clippingPlanes ?? null;
    const own = new Map<string, Material>();
    this.model.traverse((obj) => {
      const mesh = obj as Mesh;
      const role: string | undefined = mesh.userData.role;
      if (!mesh.isMesh || !role || mesh.userData.outline) return;
      const kind: Detail | Tile | null = /^(Shell|Bezel)/.test(role)
        ? FEATHERS
        : /^Joint(_Quill)?$/.test(role)
          ? 'grain'
          : null;
      if (!kind) return;
      const key = `${role}/${typeof kind === 'string' ? kind : kind.name}`;
      let material = own.get(key);
      if (!material) {
        material = withDetail(mesh.material as Material, kind);
        material.clippingPlanes = planes;
        own.set(key, material);
        this.outfit.materials.push(material);
      }
      mesh.material = material;
    });
  }

  // ---------- Who is about ----------

  /** The crewmates on this floor he could look at, the nearest first. */
  private mates() {
    return (this.env?.crew ?? [])
      .filter((o) => o !== this && o.state === 'here' && o.edge === this.edge && !o.free)
      .sort((a, b) => Math.abs(a.s - this.s) - Math.abs(b.s - this.s));
  }

  private get grounded() {
    return this.flight === 'no' && !this.door;
  }

  private still = () => !this.walking && this.grounded;

  private random() {
    this.way = Math.random() < 0.5 ? -1 : 1;
  }

  private wingsOut(open: number, flap = 0, fan = 0, rate = 3.2) {
    this.open[0] += open;
    this.open[1] += open;
    if (flap) [this.flapAmp, this.flapRate] = [flap, rate];
    this.fan = Math.max(this.fan, fan);
  }

  // ---------- Acts on the floor ----------

  private floor(): Record<string, Act> {
    const p = this.puppet;
    const still = this.still;
    return {
      idle: { weight: 3, length: [3, 6] },
      shuffle: {
        weight: 1,
        length: [2, 3.5],
        when: still,
        start: () => {
          this.random();
          this.walkTo(this.s + this.way * this.heightPx * (0.5 + Math.random()));
        },
      },
      swivel: {
        weight: 1.4,
        length: [3, 5],
        when: still,
        start: () => this.random(),
        // Round to one side, much further than a neck should go; a hold; back.
        pose: (t) => {
          const k = t > 0.3 && t < this.actLength - 1 ? 1 : 0;
          p.add('head', 0, this.way * (105 + 15 * Math.sin(this.way * 7)) * k, 0);
        },
      },
      lookback: {
        weight: 0.6,
        length: [3.5, 4.5],
        when: still,
        start: () => this.random(),
        // Right round to look behind him, and a glance to be sure.
        pose: (t) => {
          const k = t > 0.2 && t < this.actLength - 1.1 ? 1 : 0;
          const glance = t > 1.6 && t < 2.2 ? 20 : 0;
          p.add('head', 0, this.way * (180 + glance) * k, 0);
        },
      },
      roundAndBack: {
        weight: 0.6,
        length: [5.6, 6],
        when: still,
        start: () => this.random(),
        // The whole way round one way, all the way round the other, without a pause.
        pose: (t) => {
          const u = ease(t, 0.3, 2.6);
          const v = ease(t, 2.9, 5.2);
          p.add('head', 0, this.way * 355 * (u - v), 0);
        },
      },
      bob: {
        weight: 1.2,
        length: [2.5, 4],
        when: still,
        // Sizing you up: the head bobbing and circling, the eyes staying on you.
        pose: (t) => {
          const k = envelope(t, this.actLength, 0.4);
          p.add('head', 6 * sin(t, 1.4) * k, 0, 18 * sin(t, 0.7) * k);
          p.add('body', 3 * sin(t, 1.4, 0.25) * k, 0, -4 * sin(t, 0.7) * k);
          this.expression = 'focused';
        },
      },
      tilt: {
        weight: 0.8,
        length: [3, 5],
        when: still,
        start: () => this.random(),
        // A long, curious tilt one way, then the other.
        pose: (t) => {
          const side = t < this.actLength / 2 ? this.way : -this.way;
          const k = envelope(t, this.actLength, 0.3);
          p.add('head', -4 * k, 0, side * 38 * k);
        },
      },
      hoot: { weight: 0.8, length: [3.4, 3.8], when: still },
      blink: {
        weight: 1,
        length: [2.6, 3],
        when: still,
        // One slow, deliberate blink, and a second one that lingers.
        pose: (t) => {
          const shut = hump(t, 0.6, 1.5) + hump(t, 1.7, 2.6);
          this.expression = shut > 0.5 ? 'asleep' : 'neutral';
          p.add('head', 3 * shut);
        },
      },
      oneEye: {
        weight: 0.6,
        length: [9, 12],
        when: still,
        // Dozing with one eye open.
        pose: (t) => {
          const k = envelope(t, this.actLength, 0.8);
          p.add('head', 9 * k + sin(t, 0.15) * 2, 0, 5 * k);
          p.add('body', 3 * k);
          p.shift('head', 0, -0.012 * k, 0);
          this.expression = k > 0.6 ? 'wink' : 'neutral';
        },
      },
      doubleTake: {
        weight: 0.8,
        length: [3.2, 3.6],
        when: still,
        start: () => this.random(),
        // Looks off to one side, back at you, then does a double take.
        pose: (t) => {
          const aside = hump(t, 0.2, 1.0) * 0.9;
          const snap = t > 1.7 && t < 2.9 ? 1 : 0;
          p.add('head', 0, this.way * 70 * aside, 0);
          p.add('head', -10 * snap, this.way * -8 * snap, 0);
          p.add('body', -8 * snap);
          this.expression = snap ? 'surprised' : 'neutral';
          this.glow = snap;
        },
      },
      preen: {
        weight: 0.7,
        length: [4, 6],
        when: still,
        start: () => this.random(),
        // Head round and down into a wing, nibbling at it; the wing lifted out a little.
        pose: (t) => {
          const k = envelope(t, this.actLength, 0.6);
          p.add('head', (22 + 5 * Math.abs(sin(t, 2.4))) * k, this.way * 75 * k, 0);
          p.add(this.way > 0 ? 'wing.L' : 'wing.R', -10 * k, 0, this.way * 22 * k);
          p.add('body', 4 * k, 0, -this.way * 5 * k);
          this.expression = 'asleep';
        },
      },
      ruffle: {
        weight: 0.8,
        length: [2.6, 3],
        when: still,
        // Puffs right up, shakes himself out from the head down, and settles sleek.
        pose: (t) => {
          const shake = span(t, 0.5, 0.7, 1.6, 1.9);
          p.add('root', 0, 6 * shake * sin(t, 9), 0);
          p.add('head', 0, 10 * shake * sin(t, 9, 0.2), 4 * shake * sin(t, 9));
          p.add('body', 0, 4 * shake * sin(t, 9, 0.1), 0);
          for (const [tuft, side] of TUFTS)
            p.add(tuft, 20 * shake * sin(t, 9), 0, side * 10 * shake);
          this.wingsOut(0.25 * shake, 6 * shake, 0.5, 9);
          this.expression = shake > 0.3 ? 'cross' : 'neutral';
        },
      },
      flap: {
        weight: 0.6,
        length: [2.2, 2.8],
        when: still,
        pose: (t) => {
          const spread = t < this.actLength - 0.5 ? 1 : 0;
          const beat = t > 0.4 && t < this.actLength - 0.7 ? 0.8 : 0;
          this.wingsOut(spread, 40 * beat, 1);
          this.lift = beat > 0 ? this.heightPx * 0.05 * beat : 0;
          this.expression = 'happy';
        },
      },
      wave: {
        weight: 0.7,
        length: [3, 3.6],
        when: still,
        start: () => this.random(),
        // One wing held out and wagged hello.
        pose: (t) => {
          const k = span(t, 0.2, 0.6, 2.5, 3);
          const i = this.way > 0 ? 0 : 1;
          this.open[i] += 0.7 * k;
          this.waveAmp = 22 * k * sin(t, 2.4);
          this.waveSide = i;
          p.add('body', 0, 0, -this.way * 5 * k);
          p.add('head', 0, 0, this.way * 10 * k);
          this.expression = 'happy';
        },
      },
      scratch: {
        weight: 0.8,
        length: [2.8, 3.4],
        when: still,
        start: () => this.random(),
        // One foot up to the side of the head, scritch-scritch.
        pose: (t) => {
          const up = span(t, 0.2, 0.6, 2.4, 2.8);
          const leg = this.way > 0 ? 'leg.L' : 'leg.R';
          p.add(leg, -75 * up + 10 * up * sin(t, 7));
          p.add('body', 0, 0, -this.way * 8 * up);
          p.add('head', 6 * up, 0, this.way * 14 * up);
          p.add('root', 0, 0, -this.way * 5 * up);
          this.expression = up > 0.5 ? 'sleepy' : 'neutral';
        },
      },
      yawn: {
        weight: 0.7,
        length: [3.6, 4.2],
        when: still,
        pose: (t) => {
          const k = span(t, 0.3, 1.4, 2.4, 3.5);
          p.add('head', -22 * k, 0, 0);
          p.add('body', -6 * k);
          this.wingsOut(0.45 * k, 0, 0.6);
          this.expression = k > 0.4 ? 'sleepy' : 'neutral';
        },
      },
      stargaze: {
        weight: 0.7,
        length: [5, 7],
        when: still,
        pose: (t) => {
          const k = envelope(t, this.actLength, 0.9);
          p.add('head', -34 * k, 12 * sin(t, 0.12) * k, 0);
          p.add('body', -8 * k);
          for (const [tuft] of TUFTS) p.add(tuft, 10 * k);
          this.expression = k > 0.5 ? 'starry' : 'happy';
        },
      },
      tufts: {
        weight: 0.6,
        length: [2.6, 3.2],
        when: still,
        // The two tufts wiggle by turns, like eyebrows.
        pose: (t) => {
          const k = envelope(t, this.actLength, 0.3);
          p.add('tuft.L', 30 * k * Math.max(0, sin(t, 2.2)), 0, 12 * k);
          p.add('tuft.R', 30 * k * Math.max(0, sin(t, 2.2, 0.5)), 0, -12 * k);
          p.add('head', 0, 0, 5 * k * sin(t, 1.1));
          this.expression = 'wink';
        },
      },
      twirl: {
        weight: 0.5,
        length: [3.4, 3.8],
        when: still,
        start: () => this.random(),
        // A pirouette on his talons, wings out, lenses flashing.
        pose: (t) => {
          this.spin = 2 * Math.PI * ease(t, 0.4, 2.8) * this.way;
          this.wingsOut(0.7 * span(t, 0.3, 0.7, 2.6, 3.2), 0);
          this.lift = this.heightPx * 0.1 * hump(t, 0.5, 2.8);
          this.expression = 'happy';
        },
      },
      balance: {
        weight: 0.5,
        length: [2.6, 3.2],
        when: still,
        start: () => this.random(),
        // The perch wobbles: the wings fling out to catch himself, a sway, and a sheepish settle.
        pose: (t) => {
          const k = span(t, 0.1, 0.35, 1.6, 2.3);
          this.wingsOut(0.8 * k, 14 * k, 0.6, 5);
          p.add('root', 0, 0, this.way * 16 * k * sin(t, 1.6));
          p.add('body', -4 * k);
          p.add('leg.L', -8 * k * sin(t, 1.6));
          p.add('leg.R', 8 * k * sin(t, 1.6));
          for (const [tuft, side] of TUFTS) p.add(tuft, 14 * k, 0, side * 10 * k);
          this.expression = t > 1.9 ? 'sheepish' : k > 0.3 ? 'surprised' : 'neutral';
        },
      },
      doze: {
        weight: 0.6,
        length: [10, 18],
        when: still,
        pose: (t) => {
          // Sunk into himself, the head drooping and jerking up now and then.
          const nod = t % 6 > 5.4 ? 1 : 0;
          p.add('head', 10 - 14 * nod + 2 * sin(t, 0.2), 0, 6 * sin(t, 0.07));
          p.add('body', 3);
          p.shift('head', 0, -0.025, 0.005);
        },
      },
    };
  }

  // ---------- Using the depth of the box, and company ----------

  private more(): Record<string, Act> {
    const p = this.puppet;
    const still = this.still;
    return {
      peekOver: {
        weight: 0.9,
        length: [9, 11],
        when: still,
        start: () => {
          this.did = 0;
          this.spec.speed = 0.9;
          this.walkTo(this.s + (Math.random() - 0.5) * this.heightPx * 2, 0);
        },
        pose: (t) => {
          // At the front lip he leans right out and looks down at the page below.
          const at = this.depth < 0.05 && !this.walking;
          if (at && !this.did) this.did = t;
          const k = at ? span(t - this.did, 0, 0.8, 3.6, 4.4) : 0;
          p.add('body', 16 * k);
          p.add('head', 14 * k, 26 * sin(t, 0.4) * k, 0);
          this.wingsOut(0.12 * k);
          if (this.did && t - this.did > 4.5) this.walkTo(this.s, 0.25);
          this.expression = k > 0.3 ? 'surprised' : 'neutral';
        },
      },
      peekBack: {
        weight: 0.9,
        length: [10, 12],
        when: still,
        start: () => {
          this.did = 0;
          this.spec.speed = 0.9;
          this.walkTo(this.s + (Math.random() - 0.5) * this.heightPx * 3, 0.95);
        },
        pose: (t) => {
          // At the back wall he peers out at us, one side and the other, then strolls home.
          const at = this.depth > 0.85 && !this.walking;
          if (at && !this.did) this.did = t;
          const k = at ? span(t - this.did, 0, 0.6, 4.6, 5.2) : 0;
          p.add('head', -6 * k, 0, 22 * k * sin(t, 0.35));
          if (this.did && t - this.did > 5.2) this.walkTo(this.s, 0.25);
          this.expression = k > 0.3 ? 'focused' : 'neutral';
        },
      },
      lookMate: {
        weight: 1.1,
        length: [4, 5],
        when: () => this.still() && this.mates().length > 0,
        // Turns his whole head to a crewmate and watches them, tilting it at what they do.
        pose: (t) => {
          const o = this.mates()[0];
          const f = this.env?.frame;
          if (!o || !f) return;
          const dx = o.eyePoint(f).x - this.eyePoint(f).x;
          const yaw = clamp((Math.atan2(dx, this.heightPx * 2) * 180) / Math.PI, -110, 110);
          const k = envelope(t, this.actLength, 0.6);
          p.add('head', 0, yaw * k, 12 * k * Math.sin(t * 0.9) * Math.sign(dx || 1));
          p.add('body', 0, yaw * 0.12 * k, 0);
          this.expression = 'focused';
        },
      },
      glowUp: {
        weight: 0.3,
        length: [4, 5],
        when: still,
        // The lenses swell bright and sweep the room, a night owl on watch.
        pose: (t) => {
          const k = envelope(t, this.actLength, 0.7);
          p.add('head', 0, 70 * k * Math.sin(t * 1.4), 0);
          this.glow = k;
          this.expression = 'surprised';
          for (const [tuft] of TUFTS) p.add(tuft, 12 * k);
        },
      },
      flutter: {
        weight: 0.8,
        length: [2, 2.8],
        when: still,
        start: () => {
          this.random();
          this.spec.speed = 1.6;
          this.walkTo(this.s + this.way * this.heightPx * (1.5 + Math.random() * 2));
        },
        // A hop-and-flutter across the floor, wings beating him a little way up.
        pose: () => {
          const air = this.walking ? 1 : 0;
          this.lift = this.heightPx * 0.16 * air * Math.abs(Math.sin(this.gait * 2.4)) ** 0.7;
          this.wingsOut(0.9 * air, 42 * air, 1, 7);
          p.add('body', 8 * air);
          this.expression = 'happy';
        },
      },
    };
  }

  // ---------- Flights ----------

  private flights(): Record<string, Act> {
    const go = (kind: Kind) => () => {
      this.kind = kind;
      this.flight = 'crouch';
      this.goal = null;
      this.depthGoal = this.depth;
      this.random();
    };
    const ready = () => this.still() && this.state === 'here';
    const fly = (weight: number): Act => ({ weight, length: [120, 120], when: ready });
    return {
      flyover: { ...fly(1.1), start: go('flyover') },
      swoop: { ...fly(1), start: go('swoop') },
      hoverFly: { ...fly(0.9), start: go('hover') },
      glideFly: { ...fly(0.9), start: go('glide') },
      roost: { ...fly(0.7), start: go('roost') },
    };
  }

  /** A clear place on the floor to land, near x, and not on a crewmate. */
  private clearSpot(want: number, frame: Frame): number {
    const [lo, hi] = this.span(frame);
    const half = this.footprint(frame).x;
    let x = clamp(want, lo + half * 2, hi - half * 2);
    for (let i = 0; i < 14; i++) {
      const ok = (this.env?.crew ?? []).every(
        (o) =>
          o === this ||
          o.state === 'gone' ||
          o.free ||
          o.edge !== 'bottom' ||
          Math.abs(o.s - x) > (o.footprint(frame).x + half) * 1.5,
      );
      if (ok) break;
      x = clamp(want + (Math.random() - 0.5) * this.heightPx * 8, lo + half * 2, hi - half * 2);
    }
    return x;
  }

  private plan(frame: Frame, at: { x: number; y: number }) {
    const H = this.heightPx;
    const floor = frame.bottom;
    const [lo, hi] = this.span(frame);
    const margin = H * 1.5;
    if ((this.way > 0 ? hi - at.x : at.x - lo) - margin < H * 3) this.way = -this.way;
    const d = this.way;
    const far = (a: number, b: number) =>
      at.x +
      d *
        Math.min(
          H * (a + Math.random() * (b - a)),
          Math.max(0, (d > 0 ? hi - at.x : at.x - lo) - margin),
        );
    const land = (x: number, dp: number): Waypoint[] => {
      const lx = this.clearSpot(x, frame);
      // Above the spot first, so the last part is a flare straight down onto it.
      return [
        { x: lx, y: floor - H * 1.5, d: dp, mode: 'glide', v: 4.5 },
        { x: lx, y: floor, d: dp, mode: 'land', v: 3.2 },
      ];
    };
    const up = (dy: number) => Math.max(at.y - H * dy, frame.top + H * 1.2);
    const route: Waypoint[] = [];
    switch (this.kind) {
      case 'flyover': {
        const x1 = far(6, 12);
        route.push({ x: at.x + d * H * 0.6, y: up(2.2), d: 0.3, mode: 'climb', v: 5 });
        route.push({
          x: (at.x + x1) / 2,
          y: up(3.6),
          d: 0.4 + Math.random() * 0.3,
          mode: 'glide',
          v: 5,
        });
        route.push({ x: x1 - d * H * 1.5, y: up(2), d: 0.25, mode: 'glide', v: 4.5 });
        route.push(...land(x1, 0.15 + Math.random() * 0.4));
        break;
      }
      case 'swoop': {
        // Up to the back, then down low over the floor and up again to land.
        const x1 = far(6, 10);
        route.push({ x: at.x + d * H * 0.5, y: up(2.8), d: 0.6, mode: 'climb', v: 5 });
        route.push({ x: at.x + d * H * 2.4, y: up(4), d: 0.9, mode: 'glide', v: 4.5 });
        route.push({ x: (at.x + x1) / 2, y: floor - H * 0.9, d: 0.1, mode: 'swoop', v: 8 });
        route.push({ x: x1 - d * H * 1.2, y: floor - H * 1.2, d: 0.08, mode: 'swoop', v: 6 });
        route.push(...land(x1 + d * H, 0.1));
        break;
      }
      case 'hover': {
        const x1 = far(2, 5);
        route.push({ x: at.x + d * H * 0.6, y: up(2.6), d: 0.4, mode: 'climb', v: 5 });
        route.push({
          x: x1,
          y: up(3.6),
          d: 0.3 + Math.random() * 0.4,
          mode: 'hover',
          v: 4,
          hold: 3 + Math.random() * 3,
        });
        route.push(...land(x1 + d * H * 1.5, 0.2));
        break;
      }
      case 'glide': {
        // A long slow lap of the box on still wings, banking round the far end.
        const x1 = far(8, 14);
        route.push({ x: at.x + d * H * 0.5, y: up(2.4), d: 0.4, mode: 'climb', v: 5 });
        route.push({ x: x1, y: up(3.8), d: 0.95, mode: 'glide', v: 3.6 });
        route.push({ x: (at.x + x1) / 2, y: up(3), d: 0.1, mode: 'glide', v: 3.6 });
        route.push({ x: at.x - d * H * 1.5, y: up(4), d: 0.7, mode: 'glide', v: 3.6 });
        route.push(...land(at.x + d * H * 3, 0.15));
        break;
      }
      case 'roost': {
        // Up to the ceiling, over onto his back, hang there a while, then let go.
        const x1 = far(3, 7);
        route.push({ x: at.x + d * H * 0.5, y: up(2.6), d: 0.2, mode: 'climb', v: 5 });
        route.push({ x: x1, y: frame.top + H * 2, d: 0.03, mode: 'glide', v: 4 });
        route.push({
          x: x1,
          y: frame.top + H * 0.9,
          d: 0,
          mode: 'roost',
          v: 2.4,
          hold: 7 + Math.random() * 3,
        });
        route.push({ x: x1 + d * H * 0.6, y: floor - H * 2.6, d: 0.2, mode: 'drop', v: 9 });
        route.push(...land(x1 + d * H * 2, 0.15));
        break;
      }
    }
    this.route = route;
    this.holdT = 0;
    this.depthGoal = route[0].d ?? this.depth;
  }

  private takeOff(env: Env) {
    this.h = 0;
    this.lift = 0;
    const at = this.frontFoot(env.frame);
    this.free = { x: at.x, y: at.y, tilt: 0 };
    this.tilt.snap(0);
    this.flip.snap(0);
    this.vel = { x: 0, y: -this.heightPx * 3 };
    this.flight = 'air';
    this.plan(env.frame, at);
    if (this.job) this.route = [];
    this.puppet.kick('body', -240);
    this.puppet.kick('head', 160);
    this.beatPhase = 0;
  }

  private touchDown() {
    const at = this.free!;
    this.free = null;
    this.forth = this.forthV = 0;
    this.s = at.x;
    this.h = 0;
    this.goal = null;
    this.vel = { x: 0, y: 0 };
    this.route = [];
    this.flight = 'no';
    this.depthGoal = this.depth;
    this.tilt.snap(0);
    this.flip.snap(0);
    this.puppet.kick('body', 280);
    this.puppet.kick('head', -200);
    this.puppet.kick('leg.L', 300);
    this.puppet.kick('leg.R', 300);
    this.fluff.kick(-5);
    this.settle = 0;
    this.setAct('idle');
    if (this.exiting) {
      this.exiting = false;
      super.leave();
    }
  }

  leave() {
    // Fetching a page: that first (letGo() sees him down, and off).
    if (this.job) {
      this.exiting = true;
      return;
    }
    // Asked to go while airborne: land first.
    if (this.state !== 'here' || this.flight === 'no') return super.leave();
    this.exiting = true;
    if (this.free && this.env) {
      const H = this.heightPx;
      const x = this.clearSpot(this.free.x, this.env.frame);
      this.route = [
        { x, y: this.env.frame.bottom - H * 1.5, d: 0.2, mode: 'glide', v: 4 },
        { x, y: this.env.frame.bottom, d: 0.2, mode: 'land', v: 3.2 },
      ];
      this.holdT = 0;
    }
  }

  protected onEnter() {
    const hour = new Date().getHours();
    this.night = hour >= 20 || hour < 7 || this.darkPage();
    // Night owl: more hooting and looking about; by day, more dozing.
    this.acts.doze.weight = this.night ? 0.3 : 2.2;
    this.acts.hoot.weight = this.night ? 1.4 : 0.3;
    this.acts.swivel.weight = this.night ? 1.8 : 1;
    this.acts.glowUp.weight = this.night ? 1.6 : 0.2;
    this.acts.oneEye.weight = this.night ? 0.3 : 1;
    this.flight = 'no';
    this.free = null;
    this.exiting = false;
    this.route = [];
    this.beatPhase = 0;
    this.job = null;
    this.forth = this.forthV = 0;
  }

  /**
   * Fetch something for the reader: fly to `at()` (a point in the room, world px; out in
   * front of the box if that's where it is), come down onto it, and keep hold of it wherever
   * it's taken until letGo(). `onHold` once he has it. False if he can't just now.
   */
  carry(at: () => Vector3 | null, onHold: () => void, front?: () => number | null) {
    if (this.state !== 'here' || this.exiting) return false;
    this.job = { at, onHold, front, over: false, holding: false, mode: 'climb' };
    this.depthGoal = 0;
    // On the floor: up first (a crouch, then off); in the air: straight there.
    if (this.flight === 'no') this.setAct('hoverFly');
    else {
      this.route = [];
      this.holdT = 0;
    }
    return true;
  }

  /** He has hold of it. */
  get holding() {
    return !!this.job?.holding;
  }

  /**
   * Let go of what he's fetched. He waits by `rest` a while (world px: there may be another
   * page to turn), then flies back into the box and lands; or, to `sit`, he goes and sits
   * on `rest` (the top of the book's stand) till he's fetching again or unperch()ed.
   */
  letGo(rest?: Vector3 | null, sit = false) {
    if (!this.job) return;
    const front = this.job.front?.() ?? null;
    this.job = null;
    const env = this.env;
    if (!this.free || !env) return;
    const H = this.heightPx;
    if (rest && sit && !this.exiting) {
      // Up over it, still out in front of the book (never back behind its pages), then in
      // over it, and down onto it.
      const out = Math.max(this.forth, front === null ? rest.z : front + H * 0.5);
      this.route = [
        { x: rest.x, y: -rest.y - H * 0.7, d: 0, n: out, mode: 'hover', v: 4 },
        { x: rest.x, y: -rest.y - H * 0.7, d: 0, n: rest.z, mode: 'hover', v: 4, hold: 0.5 },
        { x: rest.x, y: -rest.y, d: 0, n: rest.z, mode: 'perch', v: 2, hold: Infinity },
      ];
      this.holdT = 0;
      return;
    }
    const floor = env.frame.bottom;
    const x = this.clearSpot(rest?.x ?? this.free.x, env.frame);
    this.route = [
      ...(rest && !this.exiting
        ? [{ x: rest.x, y: -rest.y, n: rest.z, mode: 'hover' as const, v: 4, hold: 3.5 }]
        : []),
      { x, y: floor - H * 1.5, d: 0.2, n: 0, mode: 'glide', v: 4 },
      { x, y: floor, d: 0.2, n: 0, mode: 'land', v: 3.2 },
    ];
    this.holdT = 0;
  }

  /** Sitting on something out of the box: off it, back into the box, and down. */
  unperch() {
    const env = this.env;
    if (this.job || !this.free || !env || this.route[0]?.mode !== 'perch') return;
    const H = this.heightPx;
    const floor = env.frame.bottom;
    const x = this.clearSpot(this.free.x, env.frame);
    this.route = [
      { x, y: floor - H * 1.5, d: 0.2, n: 0, mode: 'glide', v: 4 },
      { x, y: floor, d: 0.2, n: 0, mode: 'land', v: 3.2 },
    ];
    this.holdT = 0;
  }

  /** On a job: out to the point, down onto it, and with it wherever it's taken. */
  private work(dt: number) {
    const pos = this.free!;
    const job = this.job!;
    const H = this.heightPx;
    const w = job.at();
    // (His feet are his free point: across and down the viewport, and out by `forth`.)
    if (w && job.holding) {
      // Holding on: where it goes, he goes.
      const k = 1 / Math.max(dt, 1e-3);
      this.vel.x += ((w.x - pos.x) * k - this.vel.x) * 0.3;
      this.vel.y += ((-w.y - pos.y) * k - this.vel.y) * 0.3;
      pos.x = w.x;
      pos.y = -w.y;
      this.forth = w.z;
      this.depth = this.depthGoal = 0;
      job.mode = 'land';
    } else if (w) {
      // Over it first, a little above, then down onto it with his talons out. He comes out
      // in front of the book before he goes across it (and of what he's fetching), so as
      // never to pass behind its pages: across only as fast as he's out in front.
      const front = job.front?.() ?? null;
      const clear = Math.max(w.z, front === null ? w.z : front + H * 0.5);
      const out = job.over ? w.z : clear;
      this.forth += (out - this.forth) * Math.min(1, dt * 5);
      const ahead = job.over ? 1 : clamp(1 - (clear - this.forth) / H, 0.1, 1);
      const dx = w.x - pos.x;
      const dy = -w.y - (job.over ? 0 : H * 0.8) - pos.y;
      const dist = Math.hypot(dx, dy) || 1;
      const speed = Math.min(H * 7, dist * 2.4 + H * 0.4) * ahead;
      const k = Math.min(1, dt * 4);
      this.vel.x += ((dx / dist) * speed - this.vel.x) * k;
      this.vel.y += ((dy / dist) * speed - this.vel.y) * k;
      pos.x += this.vel.x * dt;
      pos.y += this.vel.y * dt;
      const off = Math.hypot(dist, out - this.forth);
      if (!job.over && off < H * 0.4) job.over = true;
      job.mode = off > H * 2.5 ? 'climb' : 'hover';
      if (job.over && Math.hypot(dist, w.z - this.forth) < H * 0.15) {
        job.holding = true;
        job.onHold();
      }
    }
    const lean = clamp(-this.vel.x / (H * 6), -1, 1) * (job.holding ? 0.2 : 0.35);
    pos.tilt = this.tilt.update(dt, lean);
    this.bank.update(dt, clamp(this.vel.x / (H * 6), -1, 1));
    this.heading.update(dt, 0);
  }

  private darkPage() {
    const theme = document.documentElement.dataset.theme;
    return theme ? theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  }

  protected move(dt: number, env: Env) {
    this.env = env;
    if (!this.free) {
      if (this.flight === 'crouch' && this.actT > 0.85) this.takeOff(env);
      return super.move(dt, env);
    }
    if (this.job) return this.work(dt);
    const pos = this.free;
    const H = this.heightPx;
    const wp = this.route[0];
    const last = this.route.length === 1;
    // Out toward the reader, or back into the box, as the waypoint has it.
    this.forthV += (((wp?.n ?? 0) - this.forth) * 2.5 - this.forthV) * Math.min(1, dt * 4);
    this.forth += this.forthV * dt;
    const maxSpeed = H * (wp?.v ?? 4);
    let ax = 0;
    let ay = 0;
    if (wp) {
      this.depthGoal = wp.d ?? this.depthGoal;
      const dx = wp.x - pos.x;
      const dy = wp.y - pos.y;
      const dist = Math.hypot(dx, dy);
      const near = wp.hold ? H * 0.25 : last ? 1.5 : H * 0.9;
      let go = true;
      if (dist < near) {
        if (wp.hold && this.holdT < wp.hold) {
          this.holdT += dt;
          go = dist > near * 0.5;
        } else {
          this.route.shift();
          this.holdT = 0;
          if (!this.route.length) return this.touchDown();
        }
      }
      if (go) {
        const speed = last || wp.hold ? Math.min(maxSpeed, dist * 2.2) : maxSpeed;
        ax = ((dx / (dist || 1)) * speed - this.vel.x) * 3.5;
        ay = ((dy / (dist || 1)) * speed - this.vel.y) * 3.5;
      } else {
        ax = -this.vel.x * 4;
        ay = -this.vel.y * 4;
      }
    }
    const a = Math.hypot(ax, ay);
    const maxAcc = H * 30;
    if (a > maxAcc) [ax, ay] = [(ax / a) * maxAcc, (ay / a) * maxAcc];
    this.vel.x += ax * dt;
    this.vel.y += ay * dt;
    const mode = wp?.mode ?? 'glide';
    if (mode === 'hover') {
      // Hovering isn't still: a slow figure of eight in the air.
      this.vel.x += Math.sin(env.time * 1.7) * H * 2 * dt;
      this.vel.y += Math.cos(env.time * 3.1) * H * 2 * dt;
    }
    pos.x += this.vel.x * dt;
    pos.y += this.vel.y * dt;
    // Never through the floor.
    pos.y = Math.min(pos.y, env.frame.bottom);
    // Banking: leaning into the turn, over more the harder he swings round.
    const lean = clamp(-this.vel.x / (H * 6), -1, 1) * (mode === 'hover' ? 0.15 : 0.42);
    const hanging = mode === 'roost' && wp !== undefined && wp.y < env.frame.top + H * 1.2;
    pos.tilt = this.tilt.update(dt, hanging ? Math.PI * this.way : lean);
    this.bank.update(dt, clamp(this.vel.x / (H * 6), -1, 1));
    this.heading.update(dt, 0);
  }

  // ---------- Reactions ----------

  private reactions(): Record<string, Act> {
    return {
      poked: { weight: 0, length: [2.6, 3.2] },
      love: { weight: 0, length: [3.5, 4.5] },
      dizzy: { weight: 0, length: [4.5, 4.5] },
    };
  }

  poke() {
    if (this.state !== 'here') return;
    // In the air he just flares his wings; he's busy.
    if (this.flight !== 'no') {
      this.puppet.kick('body', -200);
      this.puppet.kick('head', 200);
      this.fluff.kick(4);
      return;
    }
    const now = performance.now() / 1000;
    this.pokes = [...this.pokes.filter((at) => now - at < 3), now];
    if (this.pokes.length >= 3) {
      this.pokes = [];
      this.setAct('dizzy');
    } else if (this.act !== 'dizzy') {
      this.goal = null;
      this.fluff.kick(6);
      this.puppet.kick('body', -60);
      this.setAct('poked');
    }
  }

  protected idle(t: number) {
    const p = this.puppet;
    this.lift = 0;
    this.glow = 0;
    this.spin = 0;
    this.open[0] = this.open[1] = 0;
    this.flapAmp = 0;
    this.fan = 0;
    this.waveAmp = 0;
    if (!['peekOver', 'peekBack', 'flutter'].includes(this.act)) this.spec.speed = 0.6;
    // Breathing, and the tufts never quite still.
    p.add('body', 1.2 * sin(t, 0.25));
    // Weight shifting from foot to foot.
    p.add('root', 0, 0.8 * sin(t, 0.11), 1.6 * sin(t, 0.17));
    for (const [tuft, side] of TUFTS) p.add(tuft, 3 * sin(t, 0.4, side * 0.2), 0, 0);
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    this.env = env;
    const t = this.actT;
    const act = this.act;

    // The mouse resting on him: a slow blink, then love.
    this.hover = this.hovered ? this.hover + dt : 0;
    if (this.hover > 1 && ['idle', 'bob', 'tilt', 'swivel'].includes(act) && this.grounded)
      this.setAct('love');
    // A mouse that has come to rest near him gets a curious tilt.
    const resting = env.time - env.pointer.at;
    if (
      env.pointer.present &&
      resting > 1.5 &&
      resting < 1.6 &&
      act === 'idle' &&
      this.grounded &&
      Math.random() < 0.5
    )
      this.setAct('tilt');

    // Hoos: each one a bow, the chest swelling and the lenses brightening.
    const hoo = act === 'hoot' ? HOOS.reduce((sum, [a, b]) => sum + hump(t, a, b), 0) : 0;
    p.add('body', 7 * hoo);
    p.add('head', 9 * hoo);

    const air = !!this.free;
    const mode: Mode = this.job?.mode ?? this.route[0]?.mode ?? 'glide';
    const cfg = AIR[mode];
    const enterExit = this.state === 'entering' || this.state === 'leaving';
    let rate = this.flapRate;
    let amp = this.flapAmp;
    let legs = 0;
    if (enterExit) {
      this.open[0] = this.open[1] = 1;
      [rate, amp] = [5, 46];
    } else if (this.flight === 'crouch') {
      // Down low, wings coming up, then off.
      // Anticipation: sinks down and back, wings drawn up high, then a shudder of loading.
      const k = ease(this.actT, 0, 0.6);
      const load = ease(this.actT, 0.5, 0.85);
      p.add('body', 20 * k + 8 * load);
      p.add('head', -12 * k - 6 * load);
      legs = 32 * k + 14 * load;
      this.wingsOut(0.55 * k + 0.35 * load, 0, 1);
      if (this.actT > 0.3) this.wingsOut(0.2, 18 * k + 30 * load, 1, 3 + 3 * load);
      this.expression = 'determined';
    } else if (air) {
      this.open[0] = this.open[1] = cfg.open;
      [rate, amp] = [cfg.rate, cfg.amp];
      p.add('body', cfg.body);
      p.add('head', -cfg.body * 0.4);
      legs = cfg.legs;
      // Banking: the body rolls into the turn, the head stays level.
      p.add('body', 0, 0, -this.bank.y * 10);
      p.add('head', 0, 0, this.bank.y * 8);
      p.add('root', 0, this.bank.y * 20, 0);
      if (mode !== 'perch') {
        for (const [tuft] of TUFTS) p.add(tuft, -30);
        this.fan = 1;
      }
    } else if (this.walking) {
      // Shuffling sideways in little hops, rocking from foot to foot.
      const hop = Math.abs(Math.sin(this.gait * 3.6));
      this.lift = Math.max(this.lift, hop * this.heightPx * 0.08);
      p.add('root', 0, 0, 6 * Math.sin(this.gait * 3.6));
      legs = -20 * hop;
      this.open[0] = this.open[1] = Math.max(this.open[0], 0.15);
    }
    this.legsT.update(dt, legs);
    if (air) {
      p.add('leg.L', this.legsT.y);
      p.add('leg.R', this.legsT.y);
    } else if (legs) {
      p.add('leg.L', legs);
      p.add('leg.R', legs);
    }
    this.h = air ? 0 : this.lift;

    // Landed: the wings stay flared a beat, drop half-folded, and tuck in last.
    if (this.settle >= 0 && this.grounded && !this.walking) {
      this.settle += dt;
      const s = this.settle;
      const hold = 1 - 0.6 * ease(s, 0.3, 0.7) - 0.4 * ease(s, 1.1, 1.7);
      this.open[0] = this.open[1] = Math.max(this.open[0], 0.95 * hold);
      p.add('body', 6 * hump(s, 0, 1.3));
      for (const [tuft, side] of TUFTS)
        p.add(tuft, 20 * hump(s, 0, 0.8), 0, side * 8 * hump(s, 0, 0.8));
      if (s > 1.8) this.settle = -1;
    } else if (!this.grounded || this.act !== 'idle') this.settle = -1;
    // A wobble on the perch now and then: a little sway and the wings flick out.
    if (this.grounded && !this.walking && act === 'idle') {
      this.wobbleIn -= dt;
      if (this.wobbleIn < 0) {
        this.wobbleIn = 9 + Math.random() * 9;
        this.flick = 1;
        p.kick('root', 0, 0, (Math.random() < 0.5 ? -1 : 1) * 60);
      }
    }
    this.flick = Math.max(0, this.flick - dt * 2.2);
    if (this.flick > 0) this.wingsOut(0.35 * this.flick);
    // Wings: how far out, and how they beat.
    if (act === 'poked') this.open[0] = this.open[1] = Math.max(this.open[0], t < 1.2 ? 0.45 : 0);
    else if (act === 'dizzy' && t > 2.6) this.open[0] = this.open[1] = Math.max(this.open[0], 0.25);
    for (let i = 0; i < 2; i++) this.spread[i].update(dt, this.open[i]);
    this.beatAmp.update(dt, amp);
    this.beatPhase += dt * 2 * Math.PI * rate;

    // Fluffed up when startled, sleek when petted, a little round asleep.
    let fluff = 0;
    if (act === 'poked') fluff = t < 1.4 ? 1 : 0;
    else if (act === 'love') fluff = -0.4;
    else if (act === 'doze' || act === 'oneEye') fluff = 0.35;
    else if (act === 'hoot') fluff = 0.4 * hoo;
    else if (act === 'ruffle') fluff = span(t, 0.2, 0.5, 1.6, 2.2) * 1.2;
    else if (air) fluff = -0.5;
    this.fluffNow = this.fluff.update(dt, fluff);

    // The tufts show his mood: up and forward alert, flat back startled or asleep.
    let perk = 0.2;
    if (act === 'poked') perk = t < 0.8 ? -1 : 1;
    else if (act === 'doze' || act === 'preen' || act === 'oneEye') perk = -0.7;
    else if (act === 'love') perk = -0.3;
    else if (['bob', 'tilt', 'hoot', 'lookMate', 'doubleTake'].includes(act)) perk = 1;
    else if (act === 'dizzy') perk = -0.4 + 0.6 * sin(t, 1.3);
    else if (air) perk = -0.8;
    for (const [tuft, side] of TUFTS)
      p.add(
        tuft,
        perk > 0 ? 12 * perk : 45 * perk,
        0,
        perk > 0 ? side * 8 * perk : side * -30 * perk,
      );

    // Startled: bolt upright, and a clack of the beak after (a head shaking with it).
    if (act === 'poked') {
      p.shift('head', 0, 0.015 * clamp(1.4 - t, 0, 1), 0);
      if (t > 1.5 && t < 2.3) p.add('head', 3 * sin(t, 7), 4 * sin(t, 3.5));
    }
    if (act === 'love') p.add('head', 0, 0, 16 * envelope(t, this.actLength, 0.8));
    if (act === 'dizzy' && t > 2.6) {
      p.add('body', 0, 0, 7 * sin(t, 0.9));
      p.add('head', 0, 0, 14 * sin(t, 1.3));
    }

    // Faces.
    if (act === 'poked') this.expression = t < 1.4 ? 'surprised' : 'cross';
    else if (act === 'love') this.expression = t < 0.9 ? 'asleep' : 'love';
    else if (act === 'dizzy') this.expression = t > 2.6 ? 'dizzy' : 'surprised';
    else if (act === 'doze') this.expression = t % 6 > 5.4 ? 'sleepy' : 'asleep';
    else if (act === 'hoot') this.expression = hoo > 0.15 ? 'sleepy' : 'neutral';
    else if (air || this.flight === 'crouch')
      this.expression =
        mode === 'roost'
          ? 'sleepy'
          : mode === 'perch'
            ? 'neutral'
            : mode === 'drop'
              ? 'surprised'
              : mode === 'hover'
                ? 'focused'
                : 'happy';
    else if (['idle', 'shuffle', 'swivel', 'lookback', 'roundAndBack'].includes(act))
      this.expression = this.hovered ? 'happy' : this.night ? 'neutral' : 'sleepy';

    this.lights(dt, env.time, hoo, mode);
  }

  /** The lens rings round his eyes, the chest lamps and the wing-tip lights. */
  private lights(dt: number, time: number, hoo: number, mode: Mode) {
    const act = this.act;
    const t = this.actT;
    // (Perched, his lights are as they are at rest.)
    const air = !!this.free && mode !== 'perch';
    let tone = LENS;
    let level = this.night ? 0.85 : 0.55;
    let rate = 4;
    if (act === 'poked' && t < 1.2) {
      tone = BEACON.surprised!;
      level = Math.sin(time * 30) > 0 ? 1 : 0.5;
      rate = 30;
    } else if (act === 'love' && t > 0.9) {
      tone = BEACON.love!;
      level = 0.75 + 0.25 * Math.sin(time * 3);
    } else if (act === 'dizzy') {
      tone = RAINBOW[Math.floor(time * (t < 2.6 ? 10 : 3)) % RAINBOW.length];
      level = 1;
      rate = 30;
    } else if (act === 'hoot') {
      level = 0.45 + 0.55 * hoo;
      rate = 12;
    } else if (act === 'doze' || act === 'preen' || (act === 'love' && t < 0.9)) {
      level = 0.2 + 0.1 * Math.sin(time * 0.9);
    } else if (act === 'blink' || act === 'oneEye') {
      level = this.expression === 'asleep' ? 0.3 : act === 'oneEye' ? 0.4 : 0.85;
    } else if (act === 'twirl') {
      tone = RAINBOW[Math.floor(time * 8) % RAINBOW.length];
      level = 1;
      rate = 30;
    } else if (act === 'glowUp' || this.glow > 0.05) {
      tone = act === 'glowUp' ? '#ffd27a' : (BEACON.surprised ?? LENS);
      level = 0.6 + 0.4 * this.glow * (0.7 + 0.3 * Math.sin(time * 6));
      rate = 10;
    } else if (air) {
      level = mode === 'roost' ? 0.4 : mode === 'hover' ? 1 : 0.9;
    } else if (act === 'bob' || act === 'tilt' || act === 'lookMate') level = 1;
    colour.set(tone).lerp(DIM, 1 - level);
    this.light.lerp(colour, Math.min(1, dt * rate));
    this.outfit.beacon(this.light);

    // Chest lamps breathe in a slow ripple; running lights along the wings in the air.
    for (let i = 0; i < 3; i++) {
      let l = 0.15 + 0.5 * Math.max(0, Math.sin(time * 1.1 - i * 0.6)) ** 2;
      let c: string | undefined;
      if (act === 'hoot') l = 0.2 + 0.8 * hoo;
      else if (act === 'dizzy')
        [l, c] = [Math.random() < 0.5 ? 1 : 0.2, RAINBOW[i % RAINBOW.length]];
      else if (act === 'doze' || act === 'oneEye') l = 0.08 + 0.06 * Math.sin(time * 0.9 - i * 0.3);
      else if (act === 'glowUp') l = 0.5 + 0.5 * Math.sin(time * 5 - i);
      else if (air) l = 0.2 + 0.8 * Math.max(0, Math.cos(time * 8 - i * 1.2));
      this.outfit.dot(i, l, c);
    }
    let wl = 0.15 + 0.3 * Math.max(0, Math.sin(time * 0.8)) ** 4;
    if (air) wl = mode === 'roost' ? 0.3 : 0.4 + 0.6 * Math.max(0, Math.sin(time * 12));
    else if (act === 'dizzy') wl = Math.random() < 0.5 ? 1 : 0.2;
    else if (act === 'flap' || act === 'flutter' || act === 'twirl') wl = 0.7;
    this.outfit.dot(3, wl, air ? BEACON.happy : undefined);
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    // Puffed or sleek: the body (and the head riding on it) a little rounder or slimmer.
    const f = this.fluffNow;
    const breath = this.free ? 0 : 0.012 * Math.sin(env.time * 1.7);
    p.stretch(
      'body',
      1 + 0.04 * f + breath,
      [0, 1, 0],
      1 + 0.1 * Math.max(f, 0) + 0.04 * Math.min(f, 0) + breath,
    );

    // Wings: out from the sides and twisted to show their faces, beating quicker than any
    // spring; the trailing feather plates lag a little behind the leading one and fan.
    const beat = this.beatAmp.y;
    const phase = this.beatPhase;
    const fan = this.free ? 1 : this.fan;
    for (const [sfx, side] of SIDES) {
      const i = side > 0 ? 0 : 1;
      const open = this.spread[i].y;
      const live = Math.min(1, open * 1.5);
      // Downstroke quick and deep, upstroke slower and shallower, the plates closing.
      const stroke = Math.sin(phase) + 0.3 * Math.sin(2 * phase - 0.5);
      const spreadK = 0.72 + 0.28 * Math.cos(phase);
      let roll = 78 * open + beat * stroke * live;
      if (this.waveSide === i) roll += this.waveAmp;
      p.turn(`wing.${sfx}`, 80 * open, 0, side * roll);
      for (let k = 1; k <= 3; k++) {
        const lag = beat * 0.25 * k * Math.sin(phase - k * 0.55) * live;
        const f = beat > 4 ? fan * (1 - live + live * spreadK) : fan;
        p.turn(`fea${k}.${sfx}`, 0, side * -f * k * 4 * open, side * (f * k * 9 * open + lag));
      }
    }

    // Dizzy: the head spinning round on its bearing, twice, easing in and out.
    if (this.act === 'dizzy') {
      const u = clamp((this.actT - 0.2) / 2.4, 0, 1);
      p.turn('head', 0, 720 * u * u * (3 - 2 * u), 0);
    }
    // Hanging from the ceiling, the head turns over so his face is the right way up.
    const hanging = this.free && (this.route[0]?.mode ?? '') === 'roost' && this.tilt.y > 1.2;
    const flip = this.flip.update(dt, hanging ? 1 : 0);
    if (flip > 0.001) {
      p.turn('head', 0, 0, 180 * flip * this.way);
      const c = Math.cos(Math.PI * flip);
      if (this.face) {
        this.face.look.x *= c;
        this.face.look.y *= c;
      }
    }
    // A pirouette.
    this.pivot.rotation.y = this.spin;
  }
}
