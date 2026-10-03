import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Act, Character, clamp, type Env, type Frame } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import { Spring } from './spring';

/**
 * Nib, the robot raven: a clever, cheeky toy of glossy blue-black plates (shingled on
 * his breast and back) with a strong two-part beak, a screen face under a visor brow, a
 * ruff of plates at the throat, clawed toes, wings
 * that fold away into slats whose tips are lights, and a tail fan. He swaggers about
 * the floor with his chest out, hops two-footed, and flies: he crouches, flaps up off
 * the floor, glides across the box and lands again, or swoops to the back wall and back,
 * dive-bombs the front lip and pulls up at the last moment, or rolls onto his back and
 * slides down the air.
 *
 * On the ground he is up to something: he tilts his head almost upside down at nothing,
 * caws with the beak wide and every light flashing, and finds a shiny nut (it lights up
 * in the beak's colour), carries it off, looks about slyly and buries it in the floor.
 * He puzzles at a crewmate, or copies what one does head for head, bows and fluffs his
 * ruff, shuffles sideways, sunbathes with his wings spread flat, preens, knocks on the
 * floor with his beak and listens, peers out from the back wall or over the front lip,
 * stretches his wings, shakes himself out, cackles, scratches his head with a foot, twirls
 * to show off his tail, winks, puffs his chest out, sulks with his back turned, flexes
 * one wing then the other, beeps like a doorbell, taps on the front lip and naps with his
 * head tucked into his ruff.
 *
 * The three wing-tip lights run the colour of what he feels: a slow glow on the ground,
 * running lights in flight, a flash on every caw, the rainbow when he shows off. Poke him
 * and he jumps and caws; three pokes and he's dizzy. Rest the mouse on him and he fluffs
 * up and preens into it.
 */
export const RAVEN_FACE: FaceLayout = {
  width: 512,
  height: 224,
  eyes: [
    [0.31, 0.5],
    [0.69, 0.5],
  ],
  rx: 0.08,
  ry: 0.28,
  line: 0.035,
  mouth: null,
};

const SIDES = [
  ['L', 1],
  ['R', -1],
] as const;
const DEG = 180 / Math.PI;
/** 0 before a, 1 after b, eased between. */
const ease = (t: number, a: number, b: number) => {
  const u = clamp((t - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
};
/** Fades in over a..b, holds, and fades out over c..d. */
const span = (t: number, a: number, b: number, c: number, d: number) =>
  ease(t, a, b) * (1 - ease(t, c, d));
/** A pulse train: 1 for the first `on` of every `every` seconds. */
const pulse = (t: number, every: number, on: number) => (t % every < on ? 1 : 0);

type Mode = 'climb' | 'glide' | 'plunge' | 'flare' | 'roll';
interface Waypoint {
  x: number;
  y: number;
  /** How far back into the box to be by the time it's reached (0 front, 1 back wall). */
  d?: number;
  mode: Mode;
  /** Speed, in body heights per second. */
  v: number;
}
type Kind = 'flyover' | 'swoop' | 'dive' | 'barrel';

export class Raven extends Character {
  /** Held by the pointer, it flies after it. */
  readonly flies = true;
  private env: Env | null = null;
  /** Hop height, px: set each frame by whatever hops. */
  private lift = 0;
  /** Legs are tucked (a hop, the air) rather than walking. */
  private tucked = 0;
  private fluff = new Spring(3, 0.45);
  private nutS = new Spring(4, 0.5, 1.4);
  private wings = new Spring(2.4, 0.55, 1.1);
  private tail = new Spring(3, 0.5);
  private tilt = new Spring(1.6, 0.8);
  private flight: 'no' | 'crouch' | 'air' = 'no';
  private kind: Kind = 'flyover';
  private vel = { x: 0, y: 0 };
  private route: Waypoint[] = [];
  private exiting = false;
  private pokes: number[] = [];
  private hover = 0;
  private dir = 1;
  private did = 0;
  private flap = 0;
  private spin = 0;
  private glow = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Nib',
        model: 'raven',
        metres: 0.5,
        width: 0.3,
        size: 0.95,
        feels: {
          default: { f: 4, zeta: 0.6 },
          body: { f: 3, zeta: 0.5 },
          head: { f: 4, zeta: 0.5, r: 0.5 },
          jaw: { f: 7, zeta: 0.4 },
          tail: { f: 3, zeta: 0.4 },
          'tail.L': { f: 3.5, zeta: 0.4 },
          'tail.R': { f: 3.5, zeta: 0.4 },
          'wing.L': { f: 3, zeta: 0.5 },
          'wing.R': { f: 3, zeta: 0.5 },
          'leg.L': { f: 6, zeta: 0.6 },
          'leg.R': { f: 6, zeta: 0.6 },
        },
        face: RAVEN_FACE,
        eyes: 0.78,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.9 },
          { bone: 'body', yaw: 0.15, pitch: 0 },
        ],
        reach: { yaw: 60, pitch: 30 },
        lag: 1.2,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [50, 110],
        speed: 1.3,
      },
      model,
    );
    this.acts = {
      ...this.walks(),
      ...this.tricks(),
      ...this.extras(),
      ...this.flights(),
      ...this.reactions(),
    };
  }

  // ---------- Who is about ----------

  /** The crewmates on this floor he could puzzle at or copy, the nearest first. */
  private mates() {
    const f = this.env?.frame;
    return (this.env?.crew ?? [])
      .filter((o) => o !== this && o.state === 'here' && o.edge === this.edge && !o.free)
      .sort((a, b) => Math.abs(a.s - this.s) - Math.abs(b.s - this.s))
      .filter((o) => !f || Math.abs(o.s - this.s) < this.heightPx * 12);
  }

  /** Off the ground, or busy getting off it. */
  private get grounded() {
    return this.flight === 'no' && !this.door;
  }

  private still = () => !this.walking && this.grounded;

  /** Which way there's more room to walk, and how much (px). */
  private room(): [number, number] {
    if (!this.env) return [1, 0];
    const [lo, hi] = this.span(this.env.frame);
    const way = this.s - lo > hi - this.s ? -1 : 1;
    return [way, (way > 0 ? hi - this.s : this.s - lo) - this.widthPx() * 1.2];
  }

  /** A short walk along the floor, toward the roomier side unless `way` says otherwise. */
  private amble(heights: number, depth?: number, way?: number) {
    const [more, room] = this.room();
    const w = way ?? (Math.random() < 0.7 ? more : -more);
    const far = Math.min(Math.max(room, 0), this.heightPx * heights);
    this.walkTo(this.s + w * Math.max(far, this.heightPx * 0.6), depth);
  }

  // ---------- Acts on the ground ----------

  private walks(): Record<string, Act> {
    const H = () => this.heightPx;
    return {
      idle: { weight: 4, length: [3, 6] },
      strut: {
        weight: 1.8,
        length: [3.5, 5.5],
        face: 'happy',
        when: this.still,
        start: () => {
          this.spec.speed = 1.1;
          this.amble(3 + Math.random() * 3);
        },
        pose: (t) => {
          // Chest out, head pumping forward and back with every step, tail carried high.
          const p = this.puppet;
          const step = Math.sin(this.gait);
          p.add('body', -8);
          p.add('head', 10 + 9 * step);
          p.add('tail', 10 + 4 * sin(t, 1.2));
        },
      },
      hopTravel: {
        weight: 1.2,
        length: [2.6, 3.6],
        face: 'happy',
        when: this.still,
        start: () => {
          this.spec.speed = 1.5;
          this.amble(2.5 + Math.random() * 2);
        },
        pose: (t) => {
          // Two feet together, hop, hop, hop, wings a-flutter.
          const air = Math.abs(Math.sin(Math.PI * 2.1 * t));
          this.lift = H() * 0.2 * air * (this.walking ? 1 : 0);
          this.tucked = air;
          this.puppet.add('body', 5 - 10 * air);
          this.puppet.add('head', -6 * air + 8 * (1 - air));
          this.wingsOut(0.15 + 0.2 * air);
        },
      },
      hopHop: {
        weight: 1.4,
        length: [2.2, 2.8],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // Hop-hop, pause; hop-hop.
          const beat = t % 1.1;
          const air = beat < 0.7 ? Math.abs(Math.sin((Math.PI * beat) / 0.35)) : 0;
          this.lift = H() * 0.26 * air;
          this.tucked = air;
          this.puppet.add('body', -6 * air + 6 * (1 - air) * pulse(beat, 1.1, 0.8));
          this.puppet.add('head', 10 * (1 - air), 0, 8 * sin(t, 0.9));
          this.wingsOut(0.35 * air);
          this.puppet.add('tail', 14 * air);
        },
      },
      shuffle: {
        weight: 1.2,
        length: [2.6, 3.4],
        face: 'focused',
        when: this.still,
        start: () => {
          // Sideways, still facing us, eyeing the crowd.
          this.spec.speed = 0.75;
          this.spec.turn = 4;
          this.amble(1.6, this.depth, Math.random() < 0.5 ? -1 : 1);
        },
        pose: (t) => {
          const p = this.puppet;
          const w = Math.sin(this.gait * 1.2);
          p.add('body', 0, 0, 5 * w);
          p.add('head', 4, 0, -7 * w + 5 * sin(t, 0.6));
          p.add('root', 0, 0, 3 * w);
        },
      },
      scratch: {
        weight: 0.9,
        length: [2.6, 3.2],
        when: this.still,
        pose: (t) => {
          // One foot up to the side of the head, scritch-scritch.
          const p = this.puppet;
          const up = span(t, 0.2, 0.6, 2.2, 2.6);
          p.add('leg.L', -68 * up + 10 * up * sin(t, 7));
          p.add('body', 0, 0, -8 * up);
          p.add('head', 6 * up, 0, 14 * up);
          p.add('root', 0, 0, -5 * up);
          this.expression = up > 0.5 ? 'sleepy' : 'neutral';
        },
      },
      peekBack: {
        weight: 1,
        length: [10, 12],
        when: this.still,
        start: () => {
          this.spec.speed = 1.4;
          this.did = 0;
          this.amble(3, 0.95, Math.random() < 0.5 ? -1 : 1);
        },
        pose: (t) => {
          // At the back wall he peers out at us, one side and the other, then strolls home.
          const at = this.depth > 0.85 && !this.walking;
          const look = at ? span(this.actT - this.did, 0, 0.5, 4.5, 5) : 0;
          if (at && !this.did) this.did = this.actT;
          this.puppet.add('head', -8 * look, 0, 22 * look * sin(t, 0.35));
          this.puppet.add('body', -4 * look);
          if (this.did && t - this.did > 5 && this.depth > 0.5) this.walkTo(this.s, 0.2);
          this.expression = look > 0.3 ? 'focused' : 'neutral';
        },
      },
      lookOver: {
        weight: 1,
        length: [8, 10],
        when: this.still,
        start: () => {
          this.spec.speed = 1.4;
          this.did = 0;
          this.amble(2, 0);
        },
        pose: (t) => {
          // At the front lip he leans right out and looks down at the page below.
          const at = this.depth < 0.05 && !this.walking;
          if (at && !this.did) this.did = t;
          const k = at ? span(t - this.did, 0, 0.7, 3.4, 4.2) : 0;
          this.puppet.add('body', 16 * k);
          this.puppet.add('head', 12 * k, 24 * sin(t, 0.4) * k);
          this.puppet.add('tail', 22 * k);
          this.wingsOut(0.1 * k);
          if (this.did && t - this.did > 4.3) this.walkTo(this.s, 0.25);
          this.expression = k > 0.3 ? 'surprised' : 'neutral';
        },
      },
    };
  }

  private tricks(): Record<string, Act> {
    const H = () => this.heightPx;
    return {
      tilt: {
        weight: 1.6,
        length: [4, 5],
        face: 'focused',
        when: this.still,
        start: () => (this.dir = Math.random() < 0.5 ? -1 : 1),
        pose: (t) => {
          // Head over sideways until it's nearly upside down, then round the other way.
          const flip = t < 2.3 ? 1 : -1;
          const k = span(t % 2.3, 0, 0.55, 1.75, 2.3) * (t > 4.5 ? 0 : 1);
          this.puppet.add('head', -4 * k, 0, this.dir * flip * 105 * k);
          this.puppet.add('body', 0, 0, this.dir * flip * -3 * k);
          this.puppet.add('jaw', 6 * k);
        },
      },
      caw: {
        weight: 1.3,
        length: [3.2, 3.6],
        face: 'surprised',
        when: this.still,
        pose: (t) => {
          // Head back, then three caws with the beak wide: each pumps him forward.
          const p = this.puppet;
          const ready = ease(t, 0, 0.4) * (1 - ease(t, 2.6, 3));
          const caw = [0.6, 1.3, 2.0].reduce(
            (sum, at) => sum + span(t, at, at + 0.1, at + 0.35, at + 0.5),
            0,
          );
          p.add(
            'head',
            -10 * ready + 14 * caw,
            30 * ready * Math.sign(sin(t, 0.25)) || 30 * ready,
            0,
          );
          p.add('jaw', 46 * clamp(caw, 0, 1) + 6 * ready);
          p.add('body', -7 * ready + 9 * caw);
          p.add('tail', 12 * caw);
          this.wingsOut(0.3 * caw);
          this.glow = clamp(caw, 0, 1);
        },
      },
      cackle: {
        weight: 0.9,
        length: [2.8, 3.4],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // Shoulders bobbing, beak clacking in bursts.
          const on = span(t, 0.2, 0.5, 2.4, 2.8);
          const clack = Math.max(0, sin(t, 9)) * pulse(t, 0.7, 0.45);
          this.puppet.add('jaw', 26 * clack * on);
          this.puppet.add('body', 6 * on * sin(t, 4.5));
          this.puppet.add('head', -10 * on + 5 * on * sin(t, 4.5, 0.25));
          this.puppet.add('tail', 10 * on * sin(t, 4.5));
          this.wingsOut(0.1 * on);
        },
      },
      wink: {
        weight: 1,
        length: [2.2, 2.6],
        when: this.still,
        pose: (t) => {
          // A sly glance sideways, the head cocked, a wink, and the beak crooked.
          const k = span(t, 0.2, 0.6, 1.8, 2.2);
          this.puppet.add('head', -3 * k, 0, -16 * k);
          this.puppet.add('jaw', 5 * k);
          this.puppet.add('body', 0, 0, 3 * k);
          this.expression = t > 0.6 && t < 1.8 ? 'wink' : 'neutral';
          this.glow = 0.6 * k;
        },
      },
      bow: {
        weight: 1.1,
        length: [3.4, 4],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // A deep bow with the ruff fluffed and the tail high, and up again.
          const k = span(t, 0.2, 0.9, 2.1, 2.9);
          this.puppet.add('body', 38 * k);
          this.puppet.add('head', 22 * k);
          this.puppet.add('tail', 25 * k);
          this.wingsOut(0.35 * k);
          this.glow = k;
        },
      },
      preen: {
        weight: 1.3,
        length: [4.5, 6],
        when: this.still,
        start: () => (this.dir = Math.random() < 0.5 ? -1 : 1),
        pose: (t) => {
          // His beak runs over one wing, which lifts to meet it, nibbling.
          const p = this.puppet;
          const k = span(t, 0.3, 0.9, 3.8, 4.4);
          const nib = Math.max(0, sin(t, 4)) * k;
          const side = this.dir;
          p.add('head', 26 * k + 5 * nib, side * 105 * k + side * 12 * sin(t, 0.9) * k, 0);
          p.add('jaw', 9 * nib);
          p.add('body', 0, 0, -side * 6 * k);
          p.add(`wing.${side > 0 ? 'L' : 'R'}`, 0, -side * 26 * k, 0);
          this.expression = k > 0.5 ? 'sleepy' : 'neutral';
        },
      },
      stretch: {
        weight: 0.9,
        length: [3.4, 3.8],
        when: this.still,
        pose: (t) => {
          // Both wings out wide, the chest up, a big yawn.
          const k = span(t, 0.3, 1.0, 2.4, 3.1);
          this.wingsOut(1 * k, 0, 1);
          this.puppet.add('body', -12 * k);
          this.puppet.add('head', -28 * k);
          this.puppet.add('jaw', 40 * k * (0.7 + 0.3 * sin(t, 1.5)));
          this.puppet.add('tail', 20 * k);
          this.expression = k > 0.4 ? 'sleepy' : 'neutral';
        },
      },
      shake: {
        weight: 0.9,
        length: [2.2, 2.6],
        face: 'surprised',
        when: this.still,
        pose: (t) => {
          // Rattling himself out: ruff exploded, wings and tail a blur.
          const k = span(t, 0, 0.1, 1.2, 2);
          this.puppet.add('root', 0, 0, 7 * k * sin(t, 8));
          this.puppet.add('head', 4 * k * sin(t, 10), 12 * k * sin(t, 8, 0.25), 0);
          this.puppet.add('tail', 0, 0, 20 * k * sin(t, 9));
          this.wingsOut(0.25 * k, 12 * k * sin(t, 9));
          this.glow = k * (0.5 + 0.5 * Math.sin(t * 40));
        },
      },
      nap: {
        weight: 0.7,
        length: [10, 16],
        face: 'asleep',
        when: this.still,
        pose: (t) => {
          // The head tucked into the ruff, wings snug, settled low on his feet.
          const k = ease(t, 0, 1.2) * (1 - ease(t, this.actLength - 1.2, this.actLength));
          this.puppet.add('body', 16 * k + 1.5 * sin(t, 0.22));
          this.puppet.add('head', 30 * k, 0, 8 * k);
          this.puppet.add('tail', -8 * k);
          this.tucked = 0.5 * k;
        },
      },
      twirl: {
        weight: 0.9,
        length: [4.2, 4.6],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // A pirouette with the tail fanned wide and the wing lights running the rainbow.
          const u = ease(t, 0.5, 3.3);
          this.spin = 2 * Math.PI * u;
          this.glow = 1;
          const k = span(t, 0.3, 0.7, 3.6, 4);
          this.wingsOut(0.3 * k, 0, 1);
          this.puppet.add('body', -8 * k);
          this.puppet.add('head', 8 * k);
        },
      },
      knock: {
        weight: 1,
        length: [5.4, 6],
        face: 'focused',
        when: this.still,
        pose: (t) => {
          // Knock-knock-knock on the floor with the beak, then an ear to the boards.
          const p = this.puppet;
          const down = ease(t, 0.2, 0.7) * (1 - ease(t, 4.2, 4.8));
          const knock = [0.9, 1.3, 1.7, 2.6, 3.0].reduce(
            (sum, at) => sum + span(t, at, at + 0.06, at + 0.1, at + 0.2),
            0,
          );
          p.add('body', 20 * down);
          p.add('head', 34 * down + 10 * clamp(knock, 0, 1));
          p.add('tail', 22 * down);
          const listen = span(t, 3.4, 3.8, 4.2, 4.6);
          p.add('head', 0, 0, 55 * listen);
          this.glow = clamp(knock, 0, 1) * 0.6;
        },
      },
      hoard: {
        weight: 1.3,
        length: [14, 14],
        when: this.still,
        start: () => {
          this.spec.speed = 1.1;
          this.did = 0;
          this.amble(2.5 + Math.random() * 1.5);
        },
        pose: (t) => this.hoard(t),
      },
      puzzle: {
        weight: 1.4,
        length: [5, 6.5],
        face: 'focused',
        when: () => this.still() && this.mates().length > 0,
        start: () => (this.dir = Math.random() < 0.5 ? -1 : 1),
        pose: (t) => {
          // Turned to a crewmate, head tilting one way and then the other, as if it were
          // a puzzle box, with a hop closer.
          const m = this.mates()[0];
          if (!m) return;
          const toward = Math.sign(m.s - this.s) || 1;
          const k = ease(t, 0, 0.6) * (1 - ease(t, this.actLength - 0.6, this.actLength));
          const p = this.puppet;
          p.add('root', 0, toward * 40 * k, 0);
          p.add('head', 6 * k, -toward * 20 * k, 32 * k * Math.sin(t * 2.1));
          p.add('body', 6 * k);
          const hop = Math.max(0, sin(t, 0.45)) ** 6;
          this.lift = H() * 0.16 * hop * k;
          this.tucked = hop;
          this.glow = 0.4 * k;
        },
      },
      mimic: {
        weight: 1.2,
        length: [5, 7],
        when: () => this.still() && this.mates().some((o) => o.puppet.has('head')),
        pose: () => {
          // Copies a crewmate: whatever their head, body and feet do, he does too.
          const m = this.mates().find((o) => o.puppet.has('head'));
          if (!m) return;
          const p = this.puppet;
          for (const [bone, mine, share] of [
            ['head', 'head', 1],
            ['body', 'body', 1],
          ] as const) {
            if (!m.puppet.has(bone)) continue;
            const [a, b, c] = m.puppet.current(bone);
            p.add(mine, a * share, b * share, c * share);
          }
          this.lift = (m.h / m.heightPx) * this.heightPx;
          this.tucked = clamp(this.lift / (this.heightPx * 0.2), 0, 1);
          this.expression = m.face?.expression ?? 'neutral';
          this.glow = 0.5;
        },
      },
      sunbathe: {
        weight: 0.8,
        length: [8, 12],
        face: 'sleepy',
        when: this.still,
        pose: (t) => {
          // Wings spread flat to the sun, head back, eyes half shut, warm.
          const k = ease(t, 0, 1.4) * (1 - ease(t, this.actLength - 1.4, this.actLength));
          this.wingsOut(1 * k, 0, 1, -0.35);
          this.puppet.add('head', -22 * k, 6 * sin(t, 0.11) * k, 0);
          this.puppet.add('body', -6 * k);
          this.puppet.add('tail', 8 * k);
          this.glow = 0.5 * k;
        },
      },
    };
  }

  /** The hoard: he finds a shiny nut, carries it off, looks about and buries it. */
  private hoard(t: number) {
    const p = this.puppet;
    const found = 2.4;
    const lift = found + 2.2;
    const bury = 9.4;
    const done = bury + 2.4;
    if (t < found - 0.3 && !this.walking && t > 1) this.did = 1;
    const nose = (k: number) => {
      p.add('body', 40 * k);
      p.add('head', 32 * k);
      p.add('tail', 18 * k);
    };
    // Prowling, head down, looking for something.
    const prowl = span(t, 0.2, 0.8, found - 0.6, found);
    p.add('head', 14 * prowl, 18 * prowl * sin(t, 0.8), 0);
    // Down at the floor, and there it is.
    const stoop = span(t, found - 0.2, found + 0.5, lift - 0.5, lift + 0.5);
    nose(stoop);
    // A moment of admiring it, held up, turning it in the light.
    const proud = span(t, lift, lift + 0.5, bury - 3, bury - 2.4);
    p.add('body', -8 * proud);
    p.add('head', -10 * proud, 22 * proud * sin(t, 0.7), 10 * proud * sin(t, 0.7, 0.25));
    // Sly: eyes right, eyes left.
    const sly = span(t, lift + 2, lift + 2.5, bury - 1, bury - 0.5);
    p.add('head', 0, 45 * sly * Math.sign(sin(t, 0.4)), 0);
    // Down again to bury it.
    const dig = span(t, bury - 0.2, bury + 0.5, done - 1, done - 0.4);
    nose(dig);
    p.add('leg.L', 22 * dig * Math.max(0, sin(t, 3)));
    // Where the nut is: nowhere, then at the beak, then in the floor.
    const have = t >= found && t < bury + 1 ? 1 : 0;
    this.wantNut = have;
    this.nutDown = stoop * (t < lift ? 1 : 0) + dig * (t > bury ? 1 : 0);
    // Walk off to hide it once it's been admired.
    if (t > lift + 1.2 && t < lift + 1.4 && !this.walking && this.did < 2) {
      this.did = 2;
      this.amble(3.5, undefined, this.did ? (Math.random() < 0.5 ? -1 : 1) : 1);
    }
    this.expression =
      sly > 0.4 ? 'wink' : t > found && t < lift + 2 ? 'happy' : t > done - 1 ? 'wink' : 'focused';
    this.glow = have * (0.5 + 0.5 * Math.sin(t * 6));
  }

  private wantNut = 0;
  private nutDown = 0;

  // ---------- Flights ----------

  /** More little tricks: a chest puff, a sulk, a wing flex, a mimic beep and a knock on the front lip. */
  private extras(): Record<string, Act> {
    return {
      puff: {
        weight: 1,
        length: [3.4, 4],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // Chest puffed right out, ruff fluffed, up on his toes, holding it, then letting it go.
          const k = span(t, 0.2, 0.9, 2.6, 3.2);
          const p = this.puppet;
          p.add('body', -16 * k);
          p.add('head', -14 * k, 0, 4 * k * sin(t, 0.8));
          p.add('tail', 14 * k);
          this.wingsOut(0.22 * k);
          this.lift = this.heightPx * 0.04 * k;
          this.glow = 0.7 * k;
        },
      },
      sulk: {
        weight: 0.8,
        length: [5, 6.5],
        face: 'sad',
        when: this.still,
        start: () => (this.dir = Math.random() < 0.5 ? -1 : 1),
        pose: (t) => {
          // Turns his shoulder on the world, hunched, feathers fluffed, glancing back now and then.
          const k = ease(t, 0, 0.8) * (1 - ease(t, this.actLength - 0.8, this.actLength));
          const p = this.puppet;
          const peek = Math.max(0, sin(t, 0.45)) ** 3;
          p.add('body', 14 * k, this.dir * -35 * k, 0);
          p.add('head', 22 * k - 12 * peek * k, this.dir * -25 * k + this.dir * 45 * peek * k, 0);
          p.add('tail', -10 * k);
          this.wingsOut(0.06 * k);
        },
      },
      flex: {
        weight: 0.9,
        length: [4.4, 5],
        face: 'focused',
        when: this.still,
        pose: (t) => {
          // Stretches one wing out and fans it, then the other, checking each with a sideways look.
          const p = this.puppet;
          const one = span(t, 0.3, 0.9, 1.7, 2.2);
          const two = span(t, 2.3, 2.9, 3.7, 4.2);
          for (const [sfx, side] of SIDES) {
            const k = side > 0 ? one : two;
            p.add(`wing.${sfx}`, 40 * k, -side * 78 * k, 0);
            for (let n = 1; n <= 3; n++)
              p.add(`wing.${sfx}.${n}`, -(n - 1) * 9 * k, side * (n - 1) * 12 * k, 0);
          }
          p.add('head', 0, 0, 18 * (one - two));
          p.add('body', 0, 0, -4 * (one - two));
          this.glow = 0.7 * Math.max(one, two);
        },
      },
      beep: {
        weight: 0.9,
        length: [3.6, 4.4],
        face: 'surprised',
        when: this.still,
        pose: (t) => {
          // Copies a doorbell: sharp little head jerks, a click of the beak, the lights answering each beep.
          const beeps = [0.6, 1.2, 1.8, 2.7].reduce(
            (sum, at) => sum + span(t, at, at + 0.04, at + 0.16, at + 0.26),
            0,
          );
          const b = clamp(beeps, 0, 1);
          this.puppet.add('head', -12 * b, 0, 7 * b * (Math.floor(t * 3) % 2 ? 1 : -1));
          this.puppet.add('jaw', 22 * b);
          this.puppet.add('body', -3 * b);
          this.glow = b;
        },
      },
      lipTap: {
        weight: 0.9,
        length: [8, 10],
        when: this.still,
        start: () => {
          this.spec.speed = 1.4;
          this.did = 0;
          this.amble(2, 0);
        },
        pose: (t) => {
          // Right at the front lip he taps on it with his beak, tap-tap, tap, and cocks an ear to the page.
          const at = this.depth < 0.05 && !this.walking;
          if (at && !this.did) this.did = t;
          const u = at ? t - this.did : 0;
          const k = at ? ease(u, 0, 0.5) * (1 - ease(u, 3.6, 4.2)) : 0;
          const tap = [0.8, 1.15, 1.9, 2.5].reduce(
            (sum, a) => sum + span(u, a, a + 0.05, a + 0.09, a + 0.18),
            0,
          );
          const p = this.puppet;
          p.add('body', 22 * k);
          p.add('head', 26 * k + 12 * clamp(tap, 0, 1), 0, 20 * span(u, 2.9, 3.2, 3.5, 3.9));
          p.add('tail', 18 * k);
          this.expression = k > 0.3 ? 'focused' : 'neutral';
          this.glow = 0.5 * clamp(tap, 0, 1);
          if (this.did && t - this.did > 4.4) this.walkTo(this.s, 0.25);
        },
      },
    };
  }

  private flights(): Record<string, Act> {
    const go = (kind: Kind) => () => {
      this.kind = kind;
      this.flight = 'crouch';
      this.goal = null;
      this.depthGoal = this.depth;
      this.dir = Math.random() < 0.5 ? -1 : 1;
      this.did = 0;
    };
    const ready = () => this.still() && this.state === 'here';
    return {
      flyover: {
        weight: 1.3,
        length: [120, 120],
        face: 'happy',
        when: ready,
        start: go('flyover'),
      },
      swoop: {
        weight: 1.1,
        length: [120, 120],
        face: 'happy',
        when: ready,
        start: go('swoop'),
      },
      dive: {
        weight: 0.9,
        length: [120, 120],
        face: 'focused',
        when: ready,
        start: go('dive'),
      },
      barrel: {
        weight: 0.9,
        length: [120, 120],
        face: 'happy',
        when: ready,
        start: go('barrel'),
      },
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
    // Toward the roomier side, as far as three to ten of his heights.
    const room = (this.dir > 0 ? hi - at.x : at.x - lo) - margin;
    const hopHome = () => {
      // Which way to turn if there's no room.
      if (room < H * 3) this.dir = -this.dir;
    };
    hopHome();
    const far = (a: number, b: number) =>
      at.x +
      this.dir *
        Math.min(
          H * (a + Math.random() * (b - a)),
          Math.max(0, (this.dir > 0 ? hi - at.x : at.x - lo) - margin),
        );
    const land = (x: number, d: number): Waypoint => ({
      x: this.clearSpot(x, frame),
      y: floor,
      d,
      mode: 'glide',
      v: 5,
    });
    const up = (dy: number) => at.y - H * dy;
    const route: Waypoint[] = [];
    switch (this.kind) {
      case 'flyover': {
        const x1 = far(6, 12);
        route.push({ x: at.x + this.dir * H * 0.6, y: up(2.2), d: 0.3, mode: 'climb', v: 5 });
        route.push({
          x: (at.x + x1) / 2,
          y: up(3.6),
          d: 0.4 + Math.random() * 0.3,
          mode: 'glide',
          v: 5.5,
        });
        route.push({ x: x1 - this.dir * H * 1.5, y: up(1.6), d: 0.25, mode: 'glide', v: 5 });
        route.push(land(x1, 0.15 + Math.random() * 0.4));
        break;
      }
      case 'swoop': {
        const x1 = far(5, 9);
        route.push({ x: at.x + this.dir * H * 0.5, y: up(2.6), d: 0.5, mode: 'climb', v: 5 });
        // Out to the back wall, and along it.
        route.push({ x: at.x + this.dir * H * 2.6, y: up(3.2), d: 0.95, mode: 'glide', v: 5 });
        route.push({ x: (at.x + x1) / 2, y: up(3), d: 0.95, mode: 'glide', v: 5 });
        // And back out toward us.
        route.push({ x: x1 - this.dir * H * 1.5, y: up(1.8), d: 0.3, mode: 'glide', v: 5.5 });
        route.push(land(x1, 0.1));
        break;
      }
      case 'dive': {
        const x1 = far(3, 6);
        route.push({ x: at.x - this.dir * H * 0.7, y: up(4.4), d: 0.5, mode: 'climb', v: 5.5 });
        route.push({ x: at.x - this.dir * H * 0.9, y: up(6.2), d: 0.8, mode: 'climb', v: 3 });
        // The plunge: straight down at the front lip; pull up at the last moment.
        route.push({ x: x1 - this.dir * H * 1.6, y: floor - H * 1.1, d: 0, mode: 'plunge', v: 11 });
        route.push({
          x: x1 + this.dir * H * 1.1,
          y: floor - H * 1.7,
          d: 0.05,
          mode: 'flare',
          v: 6,
        });
        route.push(land(x1 + this.dir * H * 2.6, 0.12));
        break;
      }
      case 'barrel': {
        const x1 = far(7, 13);
        route.push({ x: at.x + this.dir * H * 0.7, y: up(2.6), d: 0.35, mode: 'climb', v: 5 });
        route.push({ x: at.x + this.dir * H * 2.3, y: up(4.4), d: 0.45, mode: 'climb', v: 4 });
        // Over onto his back and sliding down the air.
        route.push({ x: (at.x + x1) / 2, y: up(3.2), d: 0.5, mode: 'roll', v: 3.6 });
        route.push({ x: x1 - this.dir * H * 1.3, y: up(1.7), d: 0.3, mode: 'roll', v: 3.6 });
        route.push({ ...land(x1, 0.2), v: 4.5 });
        break;
      }
    }
    this.route = route;
    this.depthGoal = route[0].d ?? this.depth;
  }

  private takeOff(env: Env) {
    this.h = 0;
    this.lift = 0;
    const at = this.frontFoot(env.frame);
    this.free = { x: at.x, y: at.y, tilt: 0 };
    this.tilt.snap(0);
    this.vel = { x: 0, y: -this.heightPx * 3 };
    this.flight = 'air';
    this.plan(env.frame, at);
    this.puppet.kick('body', -240);
    this.puppet.kick('head', 160);
  }

  private touchDown() {
    const at = this.free!;
    this.free = null;
    this.s = at.x;
    this.h = 0;
    this.goal = null;
    this.vel = { x: 0, y: 0 };
    this.route = [];
    this.flight = 'no';
    this.depthGoal = this.depth;
    this.tilt.snap(0);
    this.spin = 0;
    this.puppet.kick('body', 260);
    this.puppet.kick('head', -180);
    this.puppet.kick('tail', 200);
    this.setAct('idle');
    if (this.exiting) {
      this.exiting = false;
      super.leave();
    }
  }

  leave() {
    // Asked to go while airborne: land first.
    if (this.state !== 'here' || this.flight === 'no') return super.leave();
    this.exiting = true;
    if (this.free && this.env) {
      const H = this.heightPx;
      this.route = [
        { x: this.free.x, y: this.env.frame.bottom - H * 1.5, d: 0.2, mode: 'glide', v: 4 },
        {
          x: this.clearSpot(this.free.x, this.env.frame),
          y: this.env.frame.bottom,
          d: 0.2,
          mode: 'glide',
          v: 4,
        },
      ];
    }
  }

  protected onEnter() {
    this.flight = 'no';
    this.free = null;
    this.exiting = false;
    this.route = [];
    this.wings.snap(0);
    this.spec.turn = 80;
    this.did = 0;
  }

  protected move(dt: number, env: Env) {
    this.env = env;
    if (!this.free) {
      if (this.flight === 'crouch' && this.actT > 0.55) this.takeOff(env);
      return super.move(dt, env);
    }
    const pos = this.free;
    const H = this.heightPx;
    const wp = this.route[0];
    const last = this.route.length === 1;
    const maxSpeed = H * (wp?.v ?? 4);
    let ax = 0;
    let ay = 0;
    if (wp) {
      this.depthGoal = wp.d ?? this.depthGoal;
      const dx = wp.x - pos.x;
      const dy = wp.y - pos.y;
      const dist = Math.hypot(dx, dy);
      if (dist < (last ? 1.5 : H * 0.9)) {
        this.route.shift();
        if (!this.route.length) return this.touchDown();
      } else {
        const speed = last ? Math.min(maxSpeed, dist * 2.2) : maxSpeed;
        ax = ((dx / dist) * speed - this.vel.x) * 3.5;
        ay = ((dy / dist) * speed - this.vel.y) * 3.5;
      }
    }
    const a = Math.hypot(ax, ay);
    const maxAcc = H * 30;
    if (a > maxAcc) [ax, ay] = [(ax / a) * maxAcc, (ay / a) * maxAcc];
    this.vel.x += ax * dt;
    this.vel.y += ay * dt;
    pos.x += this.vel.x * dt;
    pos.y += this.vel.y * dt;
    // Never through the floor.
    pos.y = Math.min(pos.y, env.frame.bottom);
    const mode = this.route[0]?.mode ?? 'glide';
    let lean = clamp(-this.vel.x / (H * 6), -1, 1) * 0.3;
    // The barrel roll: right over onto his back, and round again to land.
    let turn = 0;
    if (this.kind === 'barrel') {
      const rolling = this.route.length <= 3 && this.route.length >= 2;
      const righting = this.route.length === 1;
      turn = rolling ? Math.PI * this.dir : righting ? 2 * Math.PI * this.dir : 0;
    }
    lean += turn;
    pos.tilt = this.tilt.update(dt, lean);
    void mode;
    this.heading.update(dt, mode === 'roll' ? 0 : clamp(this.vel.x / (H * 6), -1, 1) * 55);
  }

  // ---------- Reactions ----------

  private reactions(): Record<string, Act> {
    return {
      poked: {
        weight: 0,
        length: [1.6, 1.8],
        face: 'surprised',
        pose: (t) => {
          // Straight up in the air, wings flung out, a startled caw.
          const up = t < 0.55 ? Math.sin((Math.PI * t) / 0.55) : 0;
          this.lift = this.heightPx * 0.4 * up;
          this.tucked = up;
          this.wingsOut(0.8 * span(t, 0, 0.1, 0.9, 1.4), 10 * up * sin(t, 8));
          this.puppet.add('jaw', 40 * span(t, 0.05, 0.15, 0.5, 0.7));
          this.puppet.add('head', -14 * span(t, 0.05, 0.2, 0.5, 0.9));
          this.glow = span(t, 0, 0.1, 0.8, 1.5);
        },
      },
      dizzy: {
        weight: 0,
        length: [3.4, 3.8],
        face: 'dizzy',
        pose: (t) => {
          const k = 1 - ease(t, 2.4, 3.4);
          this.puppet.add(
            'head',
            10 * k * Math.cos(t * 5),
            10 * k * Math.sin(t * 3),
            24 * k * Math.sin(t * 5),
          );
          this.puppet.add('body', 0, 0, 10 * k * Math.sin(t * 5));
          this.puppet.add('root', 0, 0, 8 * k * Math.sin(t * 5));
          this.wingsOut(0.35 * k, 12 * k * Math.sin(t * 10));
          this.glow = 0.6 * k;
        },
      },
      pleased: {
        weight: 0,
        length: [3, 4],
        face: 'love',
        pose: (t) => {
          // Fluffed right up and leaning into the mouse, feathers a-quiver.
          const k = ease(t, 0, 0.6) * (1 - ease(t, this.actLength - 0.6, this.actLength));
          this.puppet.add('head', 6 * k, 0, 14 * k + 3 * sin(t, 4) * k);
          this.puppet.add('body', 0, 0, 3 * k * sin(t, 5));
          this.puppet.add('tail', 0, 0, 10 * k * sin(t, 2.4));
          this.glow = k;
        },
      },
    };
  }

  poke() {
    if (this.state !== 'here') return;
    // In the air he just flares his wings; he's busy.
    if (this.flight !== 'no') return this.puppet.kick('jaw', 900);
    const now = performance.now() / 1000;
    this.pokes = [...this.pokes.filter((at) => now - at < 2.5), now];
    this.goal = null;
    this.spec.turn = 80;
    if (this.pokes.length >= 3) {
      this.pokes = [];
      this.setAct('dizzy');
    } else if (this.act !== 'dizzy') this.setAct('poked');
  }

  // ---------- Posing ----------

  /**
   * Wings: `open` 0 folded to 1 out to the sides, `flap` extra degrees up and down,
   * `fan` how far the slats spread, `lift` (per open) raising or drooping them.
   */
  private wingsOut(open: number, flap = 0, fan = -1, lift = 0) {
    this.wingOpen += open;
    this.wingFlap += flap;
    this.wingFan = Math.max(this.wingFan, fan < 0 ? open * 0.8 : fan);
    this.wingLift += lift * open;
  }

  private wingOpen = 0;
  private wingFlap = 0;
  private wingFan = 0;
  private wingLift = 0;

  protected idle(t: number) {
    const p = this.puppet;
    this.lift = 0;
    this.tucked = 0;
    this.spin = 0;
    this.glow = 0;
    this.expression = this.hovered ? 'happy' : 'neutral';
    this.wingOpen = this.wingFlap = this.wingFan = this.wingLift = 0;
    this.wantNut = 0;
    this.nutDown = 0;
    if (this.act !== 'shuffle') this.spec.turn = 80;
    if (
      this.act !== 'hopTravel' &&
      this.act !== 'peekBack' &&
      this.act !== 'lookOver' &&
      this.act !== 'hoard'
    )
      this.spec.speed = this.act === 'strut' ? 1.1 : 1.3;
    // Breathing, and a head that is never quite still: every so often it cocks and holds.
    p.add('body', 1.5 * sin(t, 0.3));
    const n = Math.floor(t / 2.4);
    const r = Math.abs(Math.sin(n * 91.7)) * 2;
    const hold = r > 1.0 && t % 2.4 < 1.1 ? Math.sign(Math.sin(n * 13.1)) : 0;
    p.add('head', 2 * sin(t, 0.35), 3 * sin(t, 0.13), 14 * hold * Math.min(1, (t % 2.4) * 6));
    p.add('tail', 2 * sin(t, 0.45));
    p.add('tail', 0, 0, 3 * sin(t, 0.31));
    // Wings shifting on his back now and then.
    p.add('wing.L', 0, 0, 1.5 * sin(t, 0.21));
    p.add('wing.R', 0, 0, 1.5 * sin(t, 0.21, 0.4));
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    this.env = env;
    const act = this.act;

    // Rest the mouse on him and he's pleased.
    this.hover = this.hovered ? this.hover + dt : 0;
    if (this.hover > 0.9 && act === 'idle' && this.grounded) this.setAct('pleased');

    const flying = !!this.free;
    const mode: Mode = this.route[0]?.mode ?? 'glide';
    const pace = this.stride;
    const H = this.heightPx;

    if (this.flight === 'crouch') {
      // Down low, wings coming up, then off.
      const k = ease(this.actT, 0, 0.5);
      p.add('body', 22 * k);
      p.add('head', -12 * k);
      p.add('leg.L', -30 * k);
      p.add('leg.R', -30 * k);
      this.wingsOut(0.5 * k, 0, 1);
      this.puppet.add('tail', 12 * k);
    } else if (flying) {
      this.flapping(mode, env);
    } else if (this.tucked > 0.02) {
      // In the air of a hop: feet drawn up.
      p.add('leg.L', 34 * this.tucked);
      p.add('leg.R', 34 * this.tucked);
    } else if (pace > 1) {
      // The swagger: a step for each foot, hips rolling, the head bobbing along.
      const amt = clamp(pace / (H * 1.3), 0, 1);
      const step = Math.sin(this.gait);
      p.add('leg.L', 30 * step * amt);
      p.add('leg.R', -30 * step * amt);
      p.add('body', 0, 0, 6 * Math.cos(this.gait) * amt);
      p.add('body', -3 * amt + 2 * Math.cos(this.gait * 2) * amt);
      p.add('head', 5 * Math.cos(this.gait * 2) * amt, 0, -4 * Math.cos(this.gait) * amt);
      p.add('tail', 0, 0, 8 * Math.sin(this.gait) * amt);
      p.add('root', 0, 3 * step * amt, 0);
    }
    this.h = flying ? 0 : this.lift;

    // Ruff: puffed up when he shows off, pleased or asleep; flat and quick in flight.
    const target =
      act === 'puff'
        ? 1.6
        : act === 'pleased' ||
            act === 'nap' ||
            act === 'bow' ||
            act === 'shake' ||
            act === 'caw' ||
            act === 'sulk'
          ? 1
          : act === 'poked'
            ? 1.2
            : flying
              ? -0.4
              : 0;
    this.fluff.update(dt, target);

    // The tail: fanned for show, closed to plunge.
    const fan = flying
      ? mode === 'plunge'
        ? -0.3
        : mode === 'flare' || mode === 'glide' || mode === 'roll'
          ? 1
          : 0.4
      : act === 'twirl' ||
          act === 'bow' ||
          act === 'stretch' ||
          act === 'sunbathe' ||
          act === 'poked'
        ? 1
        : 0;
    const spread = this.tail.update(dt, fan);
    for (const [sfx, side] of SIDES) p.add(`tail.${sfx}`, 0, -side * 24 * spread, 0);

    // The wing case lifts a little as the slats fan; the wings themselves swing out.
    const open = this.wings.update(dt, clamp(this.wingOpen, 0, 1.2));
    for (const [sfx, side] of SIDES) {
      const w = `wing.${sfx}`;
      p.add(w, 40 * open + this.wingLift * 40, -side * 78 * open, 0);
      for (let k = 1; k <= 3; k++) {
        const fan = clamp(this.wingFan, 0, 1);
        p.add(`${w}.${k}`, -(k - 1) * 9 * fan, side * (k - 1) * 12 * fan, 0);
      }
    }
  }

  /** Flying poses: wings beating, body tipped, feet drawn up, by what he is doing. */
  private flapping(mode: Mode, env: Env) {
    const p = this.puppet;
    const t = env.time;
    p.add('leg.L', 55);
    p.add('leg.R', 55);
    switch (mode) {
      case 'climb':
        p.add('body', 26);
        p.add('head', -12);
        this.wingsOut(1, 0, 1);
        break;
      case 'glide':
        p.add('body', 16);
        p.add('head', -6);
        this.wingsOut(1, 0, 1);
        break;
      case 'plunge':
        // Head down, wings swept back along the body: a stone.
        p.add('body', 70);
        p.add('head', -10);
        p.add('leg.L', 10);
        p.add('leg.R', 10);
        this.wingsOut(0.12, 0, 0);
        break;
      case 'flare':
        // Wings wide and hard, chest forward, feet out in front: brakes on.
        p.add('body', -30);
        p.add('head', 20);
        p.add('leg.L', -95);
        p.add('leg.R', -95);
        this.wingsOut(1.1, 0, 1, 0.1);
        break;
      case 'roll':
        p.add('body', 10);
        p.add('head', -6 + 5 * Math.sin(t * 2));
        p.add('leg.L', -25);
        p.add('leg.R', -25);
        this.wingsOut(1, 0, 1);
        break;
    }
    if (this.kind === 'barrel') this.glow = 0.6;
  }

  // ---------- Direct effects ----------

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    const t = env.time;
    const mode: Mode = this.route[0]?.mode ?? 'glide';

    // Wing beats, quicker than any spring.
    const open = clamp(this.wings.y, 0, 1.2);
    if (this.free) {
      const [rate, amp] = {
        climb: [4.2, 42],
        glide: [1.3, 10],
        plunge: [0, 0],
        flare: [5.5, 46],
        roll: [0.8, 8],
      }[mode];
      const beat = amp * Math.sin(2 * Math.PI * rate * t);
      for (const [sfx, side] of SIDES)
        p.turn(`wing.${sfx}`, beat + (mode === 'climb' ? 8 : 0), 0, side * 0);
    } else if (this.wingFlap) {
      for (const [sfx] of SIDES) p.turn(`wing.${sfx}`, this.wingFlap);
    }
    void open;

    // The ruff puffs up, or lies flat.
    const f = this.fluff.y;
    p.stretch('ruff', 1 + 0.16 * f, [0, 1, 0], 1 + 0.3 * f);

    // The nut: where he is looking at it.
    const want = this.wantNut;
    const s = this.nutS.update(dt, want);
    const ns = Math.max(0.001, s);
    p.stretch('nut', ns, [0, 1, 0], ns);
    p.stretch(
      'glint',
      Math.max(0.001, 0.7 + 0.3 * Math.sin(t * 9)),
      [0, 1, 0],
      Math.max(0.001, 0.7 + 0.3 * Math.sin(t * 9)),
    );
    p.shift('nut', 0, -0.03 * this.nutDown, 0);
    if (want && s < 0.05) this.nutS.kick(6);

    // A pirouette.
    this.pivot.rotation.y = this.spin;

    this.lights(t);
  }

  /** The three wing-tip lights. */
  private lights(t: number) {
    const act = this.act;
    const mode: Mode = this.route[0]?.mode ?? 'glide';
    const tone = this.expression === 'neutral' ? BEACON.happy : BEACON[this.expression];
    for (let i = 0; i < 3; i++) {
      let level: number;
      let colour: string | undefined;
      if (this.glow > 0 && (act === 'caw' || act === 'shake' || act === 'poked')) {
        // Every light flashing.
        level = this.glow * (Math.sin(t * 30 + i * 2) > -0.2 ? 1 : 0.2);
        colour = RAINBOW[(i + Math.floor(t * 9)) % RAINBOW.length];
      } else if (act === 'twirl') {
        level = 1;
        colour = RAINBOW[(i + Math.floor(t * 8)) % RAINBOW.length];
      } else if (this.free) {
        // Running lights along the wing while he flies.
        level = 0.2 + 0.8 * Math.max(0, Math.cos(t * 9 - i * 1.4));
        colour = mode === 'plunge' ? BEACON.surprised : BEACON.happy;
      } else if (act === 'dizzy') {
        level = Math.random() < 0.5 ? 1 : 0.2;
        colour = RAINBOW[Math.floor(Math.random() * RAINBOW.length)];
      } else if (act === 'nap') {
        level = 0.1 + 0.08 * Math.sin(t * 0.9 - i * 0.3);
      } else if (act === 'sunbathe') {
        level = 0.5 + 0.2 * Math.sin(t * 0.8 - i * 0.5);
        colour = BEACON.happy;
      } else if (this.glow > 0) {
        level = this.glow * (0.6 + 0.4 * Math.sin(t * 6 - i));
        colour = tone;
      } else {
        // At rest: a slow ripple down the wing every so often.
        level = 0.12 + 0.55 * Math.max(0, Math.cos(2 * Math.PI * (t / 5 - i * 0.05)) ** 12);
      }
      this.outfit.dot(i, level, colour);
    }
    this.outfit.beacon(this.wantNut ? (BEACON.happy ?? '#ffb347') : '#f4f4f1');
  }
}
