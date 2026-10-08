import { type Bone, Euler, type Object3D, Quaternion, Vector3 } from 'three';
import { BEACON, RAINBOW } from './bolt';
import {
  type Act,
  ANGLE,
  Character,
  clamp,
  type Edge,
  type Env,
  envelope,
  type Frame,
} from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import { Spring } from './spring';

/**
 * Coil, the robot octopus: a round dome on a collar of eight arms, and down every arm a
 * row of suction-cup lights. He surfaces from behind the frame line, on the bottom or
 * suckered on sideways to either side, creeps along it by rippling his arms, and keeps
 * himself busy: drumming on the line, waving three arms at once, curling his arms one
 * after another round the ring, stretching one up high, juggling a glowing ball that
 * pops out of the hatch on his head, putting on a colour show.
 *
 * The lights are how he feels, the way an octopus changes colour: at rest a dark band
 * drifts down his arms now and then; creeping, the lit arms ripple round the ring; the
 * mouse resting on him brings warm pink waves and a happy wiggle; a drum hit flashes
 * up the arm that struck. Shy, he goes dark and flattens (camouflage). Poke him and he
 * squirts a puff of ink and hides; poke him three times and he spins, arms flung out.
 * Hold him and he lets go of his wall and swims after the pointer; let go, he floats a
 * moment and swims off to an edge.
 *
 * More of what he does: a stretch with every arm up high, a startled puff of ink, a
 * headstand on his dome with his arms kicking in the air, a walk on tiptoe on two arms,
 * a hug for a crewmate (arms round, dome leaning in), tidying with all eight arms at
 * once, a jet along the line with the ink behind him, peeking over the front lip with
 * just his eyes, waving one arm to the mouse, a hat trick (the hatch pops open and the
 * ball rises out and back), typing on an invisible keyboard with every arm, a dance, a
 * pirouette, a shiver, feeling along the back wall, a bow, and sneaking about dark and
 * flat. The band round his crown shows his mood in the same colours as his cups.
 */
export const OCTOPUS_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.32, 0.44],
    [0.68, 0.44],
  ],
  rx: 0.09,
  ry: 0.25,
  line: 0.035,
  mouth: [0.5, 0.8],
};

/** The arms round the collar, as in blender/octopus.py: degrees from the front
 * toward his left. 0-3 are on his left, 4-7 on his right. */
const AZIMUTHS = [20, 58, 100, 145, 215, 260, 302, 340].map((a) => (a * Math.PI) / 180);
const ARMS = AZIMUTHS.length;
/** Bones per arm, root to tip, and suction-cup lights per arm (Dot i*STUDS + k). */
const SEGS = 5;
const STUDS = 4;
/** The lit band round the crown: Dot(ARMS * STUDS). */
const CROWN = ARMS * STUDS;
const BONES = AZIMUTHS.map((_, i) => Array.from({ length: SEGS }, (_, j) => `arm.${i}.${j + 1}`));
/** Which way along the edge (+s) is toward his left. */
const LEFTWARD: Record<Edge, number> = { bottom: 1, top: -1, left: 1, right: -1 };
/** The ink puff is built this many times smaller than it shows. */
const PUFF = 12;
/** Where an arm holds the ball: on top of its curled tip (model space, metres). */
const HOLD = { out: 0.345, up: 0.175 };
/** The ball's rest place inside the dome, and just out of the hatch (model space). */
const BALL_REST = new Vector3(0, 0.33, -0.01);
const HATCH = new Vector3(0, 0.56, -0.012);
const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;
/** Swimming: seconds per stroke, and his middle (the pivot) as a share of his height. */
const STROKE = 1.1;
const MIDDLE = 0.45;

type Point = { x: number; y: number };
/** Away from an edge, into the page, in viewport px (y down). */
const inward = (a: number): Point => ({ x: -Math.sin(a), y: -Math.cos(a) });

const bump = (x: number, width: number) => Math.max(0, 1 - Math.abs(x) / width);
const cycle = (x: number) => x - Math.floor(x);
const smooth = (x: number) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};
const UP = new Vector3(0, 1, 0);
const axis = new Vector3();
const qa = new Quaternion();
const qb = new Quaternion();
const euler = new Euler(0, 0, 0, 'YXZ');
const va = new Vector3();
const vb = new Vector3();

type Throw = {
  from: Vector3 | number;
  to: Vector3 | number;
  at: number;
  time: number;
  high: number;
};

export class Octopus extends Character {
  static readonly terms =
    'tentacles tentacle arms eight legs suckers suction cups purple lilac lavender violet round dome ripple creep crawl ink cephalopod marine ocean';

  /** It comes in its own way (flying or swimming), not jumping out of its picture. */
  readonly jumpsOut = false;
  /** Held by the pointer, he swims after it (off his wall, too: see takeUp). */
  readonly flies = true;
  /** This frame's arm pose, per arm and bone: lift (+ curls up, toward the top) and
   * sweep (+ toward his left), degrees; turned into joint targets at the end of pose(). */
  private lift = AZIMUTHS.map(() => new Array<number>(SEGS).fill(0));
  private sweep = AZIMUTHS.map(() => new Array<number>(SEGS).fill(0));
  /** 0 normal, 1 dark and flat: camouflage. */
  private hiding = new Spring(1.2, 0.9);
  private hideNow = 0;
  private bob = new Spring(3, 0.3);
  private pokes: number[] = [];
  private hover = 0;
  private mouse: { x: number; y: number; speed: number } | null = null;
  private shyUntil = 0;
  /** When the last puff of ink went off (seconds of env time). */
  private puffAt = -10;
  /** Per arm: when it last struck the drum, and in what colour. */
  private struck = AZIMUTHS.map(() => ({ at: -10, tone: RAINBOW[0] }));
  /** An arm tip twitching now and then at rest. */
  private twitch = { arm: 0, at: -10, next: 2 };
  /** The juggling: the ball's flights, and how big it is (0 put away). */
  private flights: Throw[] = [];
  private ballSize = new Spring(4, 0.5);
  private ballTone = RAINBOW[0];
  private hold: Vector3[] = [];
  private tips: Bone[] = [];
  private waving: number[] = [];
  private reaching = 0;
  private time = 0;
  /** An arm lifted toward the mouse resting nearby: which, and how far (sprung). */
  private curious = new Spring(1.2, 0.7);
  private curiousArm = 1;
  /** Swimming across the page to another edge: jetting in strokes, dome first. */
  private swim: 'no' | 'off' | 'swimming' = 'no';
  private swimT = 0;
  private stroke = 0;
  private vel: Point = { x: 0, y: 0 };
  private route: Point[] = [];
  private landing: { edge: Edge; s: number } | null = null;
  private exiting = false;
  private tilt = new Spring(1.1, 0.8);
  private env: Env | null = null;
  private did = new Set<string>();
  private arrivedAt = 0;
  private hugging = 1;
  private beat2 = -1;
  /** His whole body up (+) or sunk behind the frame line (-), metres; and the headstand. */
  private lifted = new Spring(2.4, 0.6);
  private liftTo = 0;
  private flip = new Spring(1.3, 0.55);
  /** The colour of the crown band's light, set by the act (see lights). */
  private crownTone: string | undefined;

  constructor(model: Object3D) {
    const arm = { f: 2.2, zeta: 0.35 };
    const tip = { f: 3, zeta: 0.25 };
    super(
      {
        name: 'Coil',
        model: 'octopus',
        metres: 0.5,
        width: 0.72,
        size: 1,
        feels: {
          default: { f: 3, zeta: 0.5 },
          root: { f: 2, zeta: 0.5 },
          body: { f: 2.2, zeta: 0.4 },
          head: { f: 2.5, zeta: 0.45, r: 0.3 },
          lid: { f: 4, zeta: 0.3 },
          ...Object.fromEntries(
            BONES.flatMap((bones) => bones.map((b, j) => [b, j < 3 ? arm : tip])),
          ),
        },
        face: OCTOPUS_FACE,
        eyes: 0.56,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.7 },
          { bone: 'body', yaw: 0.15, pitch: 0 },
        ],
        reach: { yaw: 55, pitch: 25 },
        lag: 1.4,
        entrance: 'rise',
        edges: ['bottom', 'left', 'right'],
        stay: [45, 100],
        speed: 0.9,
        turn: 20,
      },
      model,
    );
    // Where each arm holds the ball, in its tip bone's own frame.
    model.updateMatrixWorld(true);
    AZIMUTHS.forEach((a, i) => {
      const tip = this.puppet.bone(BONES[i][SEGS - 1]);
      this.tips.push(tip);
      const p = new Vector3(Math.sin(a) * HOLD.out, HOLD.up, Math.cos(a) * HOLD.out);
      this.hold.push(tip.worldToLocal(model.localToWorld(p)));
    });
    this.acts = this.moves();
  }

  protected setAct(name: string) {
    this.did.clear();
    this.arrivedAt = 0;
    super.setAct(name);
  }

  // ---------- Helpers ----------

  private mates() {
    return (this.env?.crew ?? [])
      .filter(
        (o) => o !== (this as Character) && o.state === 'here' && o.edge === this.edge && !o.free,
      )
      .sort((a, b) => Math.abs(a.s - this.s) - Math.abs(b.s - this.s))
      .filter((o) => Math.abs(o.s - this.s) < this.heightPx * 12);
  }

  /** Fades in over `a` seconds and out over the last `b` of the act. */
  private fade(t: number, a = 0.5, b = 0.6) {
    return clamp(t / a, 0, 1) * clamp((this.actLength - t) / b, 0, 1);
  }

  /** True the first time it is asked in an act. */
  private once(key: string) {
    if (this.did.has(key)) return false;
    this.did.add(key);
    return true;
  }

  /** Seconds since he got where he was walking to, or -1 while he's still going. */
  private since(t: number, after = 0.8) {
    if (!this.walking && t > after && !this.arrivedAt) this.arrivedAt = t;
    return this.arrivedAt ? t - this.arrivedAt : -1;
  }

  /** Which of his sides the mouse is on: 1 his left, -1 his right. */
  private mouseSide() {
    const env = this.env;
    if (!env?.pointer.present) return Math.random() < 0.5 ? 1 : -1;
    const eye = this.eyePoint(env.frame);
    const a = ANGLE[this.edge];
    const lx = (env.pointer.x - eye.x) * Math.cos(a) + (eye.y - env.pointer.y) * Math.sin(a);
    return lx > 0 ? 1 : -1;
  }

  /** Walk a few of his heights along the line, either way, inside the frame. */
  private amble(heights: number, depth?: number) {
    const way = Math.random() < 0.5 ? -1 : 1;
    let to = this.s + way * this.heightPx * heights * (0.6 + Math.random() * 0.8);
    if (this.env) {
      const [lo, hi] = this.span(this.env.frame);
      to = clamp(to, lo + this.widthPx(), hi - this.widthPx());
    }
    this.walkTo(to, depth);
  }

  private moves(): Record<string, Act> {
    const still = () => !this.walking;
    return {
      idle: { weight: 3, length: [4, 8] },
      creep: {
        weight: 1.5,
        length: [3, 6],
        when: still,
        start: () => {
          const way = Math.random() < 0.5 ? -1 : 1;
          this.walkTo(this.s + way * this.heightPx * (1 + Math.random() * 1.5));
        },
      },
      wave: {
        weight: 0.9,
        length: [3, 4],
        face: 'happy',
        when: still,
        start: () => (this.waving = Math.random() < 0.5 ? [1, 2, 3] : [6, 5, 4]),
        pose: (t) => this.wave(t),
      },
      drum: { weight: 0.9, length: [3.5, 5], when: still, pose: (t) => this.drum(t) },
      curl: { weight: 0.8, length: [3.2, 3.2], when: still, pose: (t) => this.curlRound(t) },
      juggle: {
        weight: 0.7,
        length: [6, 8],
        face: 'happy',
        when: still,
        start: () => this.juggle(),
        pose: (t) => this.juggling(t),
      },
      show: {
        weight: 0.6,
        length: [3.5, 5],
        face: 'happy',
        when: still,
        pose: (t) => this.show(t),
      },
      reach: {
        weight: 0.6,
        length: [3, 4.5],
        when: still,
        start: () => (this.reaching = Math.random() < 0.5 ? 2 : 5),
        pose: (t) => this.reach(t),
      },
      nap: { weight: 0.5, length: [8, 14], face: 'asleep', when: still, pose: (t) => this.nap(t) },
      hide: { weight: 0.4, length: [4, 6], when: still },
      swim: {
        weight: 0.6,
        // Ends when he lands.
        length: [120, 120],
        face: 'happy',
        when: () => still() && this.swim === 'no',
        start: () => (this.swim = 'off'),
      },
      ...this.more(),
      // Reactions
      poked: { weight: 0, length: [3.2, 4], start: () => this.squirt() },
      shy: { weight: 0, length: [2.5, 3.5] },
      love: { weight: 0, length: [3, 4], face: 'love' },
      dizzy: { weight: 0, length: [4, 4] },
    };
  }

  private more(): Record<string, Act> {
    const p = this.puppet;
    const still = () => !this.walking && !this.door;
    const floor = () => still() && this.edge === 'bottom';
    const company = () => still() && this.mates().length > 0;
    return {
      // Every arm straight up, tips wiggling, the whole of him taller.
      stretch: {
        weight: 0.7,
        length: [3.4, 4.4],
        face: 'happy',
        when: still,
        pose: (t) => {
          const k = this.fade(t, 0.9, 0.9);
          for (let i = 0; i < ARMS; i++) {
            this.raise(i, k, 78);
            this.arm(i, 3, 14 * k * sin(t, 1.6, -i * 0.11));
            this.arm(i, 4, 26 * k * sin(t, 1.6, -i * 0.11 - 0.12));
          }
          this.liftTo = 0.03 * k;
          p.add('head', -10 * k);
        },
      },
      // Startled by nothing much: a puff of ink and a jump.
      inkpuff: {
        weight: 0.3,
        length: [2.6, 3.2],
        when: still,
        start: () => {
          this.puffAt = this.env?.time ?? this.time;
          this.bob.kick(4);
          this.puppet.kick('head', -110, 0, 50);
        },
        pose: (t) => {
          const k = t < 0.7 ? 1 - t / 0.7 : 0;
          for (let i = 0; i < ARMS; i++) {
            this.arm(i, 0, 22 * k);
            this.arm(i, 3, -30 * k);
            this.arm(i, 4, -40 * k);
          }
          this.expression = t < 1.4 ? 'surprised' : 'neutral';
        },
      },
      // Upside down on his dome, all eight arms kicking in the air.
      headstand: {
        weight: 0.4,
        length: [6.5, 8],
        when: floor,
        pose: (t) => {
          const up = this.flipped(t) ? 1 : 0;
          for (let i = 0; i < ARMS; i++) {
            this.arm(i, 0, -10 * up, 16 * up * sin(t, 0.7, i * 0.11));
            this.arm(i, 2, 14 * up * sin(t, 0.9, i * 0.17));
            this.arm(i, 3, 18 * up * sin(t, 1.1, i * 0.21 + 0.1));
            this.arm(i, 4, 30 * up * sin(t, 1.1, i * 0.21));
          }
          this.expression = up > 0.5 ? 'happy' : 'surprised';
        },
      },
      // Up on two arms like stilts, the other six tucked, strolling.
      tiptoe: {
        weight: 0.6,
        length: [6, 8],
        face: 'happy',
        when: still,
        start: () => this.amble(1.6),
        pose: (t) => {
          const k = this.fade(t, 0.7, 1.0);
          for (let i = 0; i < ARMS; i++) {
            if (i === 2 || i === 5) {
              const step = Math.max(0, Math.sin(this.gait * 1.4 + (i === 2 ? 0 : Math.PI)));
              this.arm(i, 0, (-16 + 10 * step) * k);
              this.arm(i, 1, -8 * k);
              this.arm(i, 3, -18 * k);
              this.arm(i, 4, -24 * k);
            } else {
              this.arm(i, 0, 26 * k);
              this.arm(i, 1, 20 * k);
              this.arm(i, 2, 30 * k);
              this.arm(i, 3, 35 * k);
              this.arm(i, 4, 30 * k + 6 * sin(t, 0.5, i * 0.13));
            }
          }
          this.liftTo = 0.075 * k;
          p.add('head', -6 * k);
        },
      },
      // Walks up to a crewmate and hugs it with the arms on that side, leaning in.
      hug: {
        weight: 0.6,
        length: [8, 10],
        face: 'love',
        when: company,
        start: () => {
          const m = this.mates()[0];
          if (!m) return;
          this.hugging = Math.sign(m.s - this.s) || 1;
          this.walkTo(m.s - this.hugging * this.heightPx * 0.95, m.depth);
        },
        pose: (t) => {
          const m = this.mates()[0];
          const s = this.since(t, 1);
          if (s < 0 || !m) return;
          const k = smooth(s / 0.8) * (1 - smooth((s - 4) / 0.8));
          const side = this.hugging;
          const mine = side > 0 ? [0, 1, 2, 3] : [4, 5, 6, 7];
          mine.forEach((i, n) => {
            this.raise(i, k, 62 + n * 6, 0);
            this.arm(i, 3, 34 * k + 8 * k * sin(s, 1.6, n * 0.1));
            this.arm(i, 4, 50 * k);
          });
          p.add('body', 0, 0, side * 9 * k);
          p.add('head', 0, side * 14 * k, side * 8 * k);
          if (s > 1.6 && this.once('squeeze')) this.bob.kick(-2);
        },
      },
      // Tidying: all eight arms sweeping, picking and setting down, out of step.
      tidy: {
        weight: 0.6,
        length: [5, 7],
        face: 'focused',
        when: still,
        pose: (t) => {
          const k = this.fade(t, 0.6, 0.7);
          for (let i = 0; i < ARMS; i++) {
            const ph = t * 1.5 + i * 0.37;
            const reach = Math.max(0, Math.sin(2 * Math.PI * ph));
            this.arm(i, 0, 16 * reach * k);
            this.arm(i, 1, 18 * reach * k, 22 * k * Math.cos(2 * Math.PI * ph) * (i % 2 ? 1 : -1));
            this.arm(i, 2, 22 * reach * k);
            this.arm(i, 4, (30 * Math.sin(4 * Math.PI * ph) - 10) * k);
          }
          p.add('head', 6 * k, 10 * k * sin(t, 0.4));
        },
      },
      // A squirt of ink and a shoot off along the line, arms trailing.
      jet: {
        weight: 0.5,
        length: [3, 3.6],
        face: 'surprised',
        when: still,
        start: () => {
          this.puffAt = this.env?.time ?? this.time;
          this.bob.kick(3);
          this.amble(2.4);
        },
        pose: (t) => {
          const k = this.fade(t, 0.2, 0.8);
          const fast = clamp(this.stride / (this.heightPx * 1.2), 0, 1);
          for (let i = 0; i < ARMS; i++) {
            this.arm(i, 0, -22 * fast * k);
            this.arm(i, 2, -10 * fast * k);
            this.arm(i, 3, -30 * fast * k + 5 * sin(t, 4, i * 0.1));
            this.arm(i, 4, -40 * fast * k);
          }
          p.add('head', -10 * fast * k);
        },
      },
      // To the front lip, sinks until only his eyes show, looks about, ducks and looks again.
      peek: {
        weight: 0.6,
        length: [9, 11],
        when: () => floor() && this.depth > 0.05,
        start: () => this.walkTo(this.s, 0),
        pose: (t) => {
          const there = this.depth < 0.06 && !this.walking;
          if (there && !this.arrivedAt) this.arrivedAt = t;
          const s = this.arrivedAt ? t - this.arrivedAt : -1;
          if (s < 0) return;
          const down = smooth(s / 0.7) * (1 - smooth((s - 6.2) / 0.8));
          // A quick duck in the middle, then up again.
          const duck = smooth((s - 3.1) / 0.25) * (1 - smooth((s - 3.7) / 0.35));
          this.liftTo = -0.268 * down * (1 - 0.7 * duck) + 0.01 * sin(t, 0.7);
          this.expression = duck > 0.4 ? 'surprised' : 'neutral';
          if (s > 7 && this.once('back')) this.walkTo(this.s, 0.15 + Math.random() * 0.3);
        },
      },
      // Waves one arm high at the mouse.
      hello: {
        weight: 0.6,
        length: [3.4, 4.2],
        face: 'happy',
        when: () => still() && !!this.env?.pointer.present,
        start: () => (this.waving = [this.mouseSide() > 0 ? 1 : 6]),
        pose: (t) => {
          const k = this.fade(t, 0.5, 0.5);
          const i = this.waving[0];
          const side = i < 4 ? 1 : -1;
          this.raise(i, k, 82, side * 10);
          this.arm(i, 3, 20 * k * sin(t, 2.2));
          this.arm(i, 4, 38 * k * sin(t, 2.2, -0.14));
          p.add('head', -6 * k, 0, -side * 8 * k);
        },
      },
      // Pops the hatch, sends the ball up out of it three times, catches it in, bows.
      hattrick: {
        weight: 0.5,
        length: [6.6, 6.6],
        face: 'happy',
        when: still,
        start: () => {
          const now = this.env?.time ?? this.time;
          this.flights = [0, 1, 2].map((n) => ({
            from: BALL_REST,
            to: BALL_REST,
            at: now + 0.9 + n * 1.5,
            time: 1.15,
            high: 0.16 + 0.05 * n,
          }));
          this.ballTone = RAINBOW[Math.floor(Math.random() * RAINBOW.length)];
        },
        pose: (t) => {
          const k = this.fade(t, 0.5, 0.8);
          for (const f of this.flights) {
            if (this.time > f.at - 0.05 && this.time < f.at + 0.1 && this.once(`pop${f.at}`))
              p.kick('lid', -170);
          }
          const open = this.flights.some(
            (f) => this.time > f.at - 0.3 && this.time < f.at + f.time + 0.15,
          );
          if (open) p.add('lid', -60);
          // Both front arms present the hatch, tips flourishing.
          for (const i of [1, 6]) {
            this.raise(i, k, 55, i < 4 ? -14 : 14);
            this.arm(i, 4, 22 * k * sin(t, 1.4, i * 0.1));
          }
          // Then a bow.
          const bow = smooth((t - 5.2) / 0.4) * (1 - smooth((t - 6) / 0.5));
          p.add('head', 26 * bow);
        },
      },
      // Types on a keyboard that isn't there, every arm tapping.
      type: {
        weight: 0.6,
        length: [5, 7],
        face: 'focused',
        when: still,
        pose: (t) => {
          const k = this.fade(t, 0.6, 0.6);
          for (let i = 0; i < ARMS; i++) {
            const tap = Math.max(0, Math.sin(2 * Math.PI * (5.5 * t + i * 0.37))) ** 2;
            this.arm(i, 0, 28 * k);
            this.arm(i, 1, 14 * k);
            this.arm(i, 3, (-22 + 14 * tap) * k);
            this.arm(i, 4, (-6 + 26 * tap) * k);
          }
          p.add('head', 10 * k + 3 * k * sin(t, 0.5));
          if (t > 4 && this.once('ding')) this.bob.kick(-1.5);
        },
      },
      // A beat: arms swaying about the ring, the dome bobbing and rolling.
      dance: {
        weight: 0.6,
        length: [5, 7],
        face: 'happy',
        when: still,
        pose: (t) => {
          const k = this.fade(t, 0.6, 0.6);
          const beat = Math.floor(t * 2.4);
          if (beat !== this.beat2 && k > 0.5) {
            this.beat2 = beat;
            this.bob.kick(-1.2);
          }
          for (let i = 0; i < ARMS; i++) {
            this.arm(i, 0, 18 * k * sin(t, 1.2, i * 0.125));
            this.arm(i, 2, 14 * k * sin(t, 2.4, i * 0.125));
            this.arm(i, 3, 20 * k * sin(t, 1.2, i * 0.125 - 0.1), 22 * k * sin(t, 1.2, i * 0.125));
          }
          p.add('head', 3 * k * sin(t, 2.4), 0, 10 * k * sin(t, 1.2));
          p.add('body', 0, 0, 5 * k * sin(t, 1.2, 0.25));
        },
      },
      // A pirouette on the spot, arms flying out.
      spin: {
        weight: 0.4,
        length: [3.2, 3.2],
        face: 'happy',
        when: still,
        pose: (t) => {
          const k = t < 2.8 ? Math.sin((t / 2.8) * Math.PI) : 0;
          for (let i = 0; i < ARMS; i++) {
            this.arm(i, 0, 22 * k);
            this.arm(i, 3, -30 * k);
            this.arm(i, 4, -34 * k);
          }
        },
      },
      // Leans over to look at a crewmate, one arm curious.
      lookmate: {
        weight: 0.7,
        length: [4.5, 6],
        face: 'focused',
        when: company,
        pose: (t) => {
          const m = this.mates()[0];
          if (!m) return;
          const to = Math.sign(m.s - this.s) || 1;
          const k = this.fade(t, 0.7, 0.6);
          const i = to > 0 ? 1 : 6;
          this.raise(i, k * 0.5, 50);
          this.arm(i, 4, 20 * k * sin(t, 0.9));
          p.add('body', 0, 0, to * 8 * k);
          p.add('head', 4 * k, to * 10 * k, to * 10 * k * sin(t, 0.5));
        },
      },
      // A shiver, arms trembling.
      shiver: {
        weight: 0.3,
        length: [2.6, 3.4],
        face: 'sad',
        when: still,
        pose: (t) => {
          const k = this.fade(t, 0.3, 0.5);
          for (let i = 0; i < ARMS; i++) {
            this.arm(i, 1, 10 * k);
            this.arm(i, 2, 16 * k + 6 * k * sin(t, 9, i * 0.3));
            this.arm(i, 4, 20 * k + 12 * k * sin(t, 11, i * 0.2));
          }
        },
      },
      // Walks to the back wall and feels along it with a couple of arms, then comes back.
      backwall: {
        weight: 0.5,
        length: [12, 14],
        when: () => floor() && this.depth < 0.6,
        start: () => this.walkTo(this.s + (Math.random() - 0.5) * this.heightPx, 0.95),
        pose: (t) => {
          const there = this.depth > 0.85 && !this.walking;
          if (there && !this.arrivedAt) this.arrivedAt = t;
          const s = this.arrivedAt ? t - this.arrivedAt : -1;
          if (s < 0) return;
          const k = smooth(s / 0.8) * (1 - smooth((s - 5) / 0.6));
          for (const i of [0, 7]) {
            this.raise(i, k, 68, i === 0 ? 8 : -8);
            this.arm(i, 3, 10 * k * sin(s, 0.8, i * 0.2));
          }
          p.add('head', 0, 22 * k * sin(s, 0.35));
          this.expression = 'focused';
          if (s > 5.6 && this.once('back')) this.walkTo(this.s, 0.15 + Math.random() * 0.3);
        },
      },
      // A bow to the viewer, arms out wide.
      bow: {
        weight: 0.4,
        length: [3.2, 3.6],
        face: 'happy',
        when: still,
        pose: (t) => {
          const k = this.fade(t, 0.7, 0.8);
          const down = smooth((t - 0.7) / 0.5) * (1 - smooth((t - 2) / 0.6));
          for (let i = 0; i < ARMS; i++) {
            this.arm(i, 0, 12 * k, (i < 4 ? 1 : -1) * 14 * k);
            this.arm(i, 3, -14 * k);
          }
          this.raise(1, k * 0.6, 60, 20);
          this.raise(6, k * 0.6, 60, -20);
          p.add('head', 32 * down);
          this.liftTo = -0.015 * down;
        },
      },
      // Creeping along dark and flat, arms low and rippling.
      sneak: {
        weight: 0.4,
        length: [5, 7],
        face: 'focused',
        when: still,
        start: () => this.amble(2),
      },
    };
  }

  /** The headstand's flip: up after a moment, back the right way up before the end. */
  private flipped(t: number) {
    return t > 0.6 && t < this.actLength - 1.6;
  }

  // ---------- Arms ----------

  /** Add to one arm bone's lift and sweep this frame. */
  private arm(i: number, j: number, lift: number, sweep = 0) {
    this.lift[i][j] += lift;
    this.sweep[i][j] += sweep;
  }

  /** The arm pose into joint targets: lift turns an arm about the level axis across it,
   * so the same number curls every arm the same way whichever way it points. */
  private flushArms() {
    AZIMUTHS.forEach((a, i) => {
      axis.set(-Math.cos(a), 0, Math.sin(a));
      for (let j = 0; j < SEGS; j++) {
        qa.setFromAxisAngle(axis, this.lift[i][j] * RAD);
        qb.setFromAxisAngle(UP, this.sweep[i][j] * RAD).multiply(qa);
        euler.setFromQuaternion(qb, 'YXZ');
        this.puppet.add(BONES[i][j], euler.x * DEG, euler.y * DEG, euler.z * DEG);
        this.lift[i][j] = this.sweep[i][j] = 0;
      }
    });
  }

  /** An arm raised up off the line, `k` of the way (0..1), its tip straightened out. */
  private raise(i: number, k: number, high = 60, sweep = 0) {
    this.arm(i, 0, high * k, sweep * k);
    this.arm(i, 1, 18 * k);
    this.arm(i, 2, -8 * k);
    this.arm(i, 3, -25 * k);
    this.arm(i, 4, -15 * k);
  }

  // ---------- Acts ----------

  private wave(t: number) {
    const k = envelope(t, this.actLength, 0.5);
    const side = this.waving[0] < 4 ? 1 : -1;
    // Three arms fanned out to the side, one above the other, tips waving each a beat
    // behind the one before.
    this.waving.forEach((i, n) => {
      this.raise(i, k, 40 + n * 25, side * [22, 0, -32][n]);
      this.arm(i, 2, -10 * k);
      this.arm(i, 3, -15 * k + 30 * k * sin(t, 1.8, -n * 0.15));
      this.arm(i, 4, 40 * k * sin(t, 1.8, -n * 0.15 - 0.12));
    });
    this.puppet.add('head', 0, 8 * side * k, -side * 6 * k);
  }

  /** The drum pattern: two arms in turn, the next pair joining in at the end of each
   * bar. Returns the arms that strike on beat n. */
  private beat(n: number): number[] {
    const bar = n % 8;
    if (bar === 6) return [2, 5];
    if (bar === 7) return [1, 6, 2, 5];
    return [bar % 2 ? 6 : 1];
  }

  private drum(t: number) {
    const rate = 4.5;
    const n = Math.floor(t * rate);
    const u = cycle(t * rate);
    const k = envelope(t, this.actLength, 0.3);
    // Each arm lifts before its beat and comes down hard on it.
    for (const i of [1, 6, 2, 5]) {
      const next = this.beat(n + 1).includes(i);
      const up = next ? smooth(u * 1.4) : 0;
      this.arm(i, 0, 12 * up * k);
      this.arm(i, 1, 26 * up * k);
      this.arm(i, 2, 22 * up * k);
      this.arm(i, 3, -15 * up * k);
    }
    // On the beat: the flash and a bounce.
    const at = this.time - u / rate;
    if (this.struck[this.beat(n)[0]].at < at - 1e-3) {
      const tone = RAINBOW[n % RAINBOW.length];
      for (const i of this.beat(n)) this.struck[i] = { at, tone };
      this.bob.kick(-1.5);
      this.puppet.kick('head', 30);
    }
    this.puppet.add('head', -4 * k);
    this.expression = t > 1.2 ? 'happy' : 'focused';
  }

  /** A wave of curls running round the ring: each arm curls up tight and lets go. */
  private curlRound(t: number) {
    for (let i = 0; i < ARMS; i++) {
      const u = (t - i * 0.28) / 1;
      const c = u > 0 && u < 1 ? Math.sin(u * Math.PI) : 0;
      this.arm(i, 1, 10 * c);
      this.arm(i, 2, 35 * c);
      this.arm(i, 3, 40 * c);
      this.arm(i, 4, 40 * c);
    }
  }

  private show(t: number) {
    const k = envelope(t, this.actLength, 0.6);
    // Arms spread wide and rippling, the dome swelling.
    for (let i = 0; i < ARMS; i++) {
      this.arm(i, 0, 22 * k);
      this.arm(i, 2, -8 * k + 10 * k * sin(t, 1.2, -i * 0.12));
      this.arm(i, 3, -30 * k + 14 * k * sin(t, 1.2, -i * 0.12 - 0.1));
      this.arm(i, 4, -25 * k + 20 * k * sin(t, 1.2, -i * 0.12 - 0.2));
    }
    this.puppet.add('head', -6 * k);
  }

  private reach(t: number) {
    const i = this.reaching;
    const side = i < 4 ? 1 : -1;
    const k = envelope(t, this.actLength, 0.8);
    this.arm(i, 0, 80 * k);
    this.arm(i, 1, 15 * k);
    this.arm(i, 2, -15 * k);
    this.arm(i, 3, -30 * k + 25 * k * sin(t, 2.5));
    this.arm(i, 4, -20 * k + 35 * k * sin(t, 2.5, -0.15));
    this.puppet.add('head', -14 * k, 18 * side * k);
    this.puppet.add('body', 0, 0, -side * 5 * k);
  }

  private nap(t: number) {
    const k = Math.min(1, t / 1.5);
    for (let i = 0; i < ARMS; i++) {
      this.arm(i, 1, 8 * k);
      this.arm(i, 2, 18 * k);
      this.arm(i, 3, 30 * k);
      this.arm(i, 4, 35 * k + 4 * sin(t, 0.2, i * 0.1));
    }
    this.puppet.add('head', 8 * k, 0, 6 * k);
  }

  // ---------- Juggling ----------

  /** The ball out of the hatch to one arm, then back and forth, then home. */
  private juggle() {
    const a = Math.random() < 0.5 ? 1 : 6;
    const b = 7 - a;
    const start = this.time + 0.7;
    const t = 0.65;
    const pause = 0.2;
    this.flights = [{ from: BALL_REST, to: a, at: start, time: 0.7, high: 0.12 }];
    let at = start + 0.7 + pause;
    let from = a;
    while (at + t + pause + 0.9 < this.time + this.actLength - 0.4) {
      const to = from === a ? b : a;
      this.flights.push({ from, to, at, time: t, high: 0.3 });
      at += t + pause;
      from = to;
    }
    this.flights.push({ from, to: BALL_REST, at, time: 0.9, high: 0.2 });
    this.ballTone = RAINBOW[Math.floor(Math.random() * RAINBOW.length)];
  }

  private juggling(t: number) {
    const k = envelope(t, this.actLength, 0.6);
    const [first] = this.flights;
    const a = typeof first?.to === 'number' ? first.to : 1;
    for (const i of [a, 7 - a]) this.raise(i, k, 48);
    // The hatch lid pops open while the ball goes in or out of it.
    const lid = this.flights.some(
      (f) =>
        (f.from === BALL_REST || f.to === BALL_REST) &&
        Math.abs(this.time - f.at - f.time / 2) < f.time / 2 + 0.3,
    );
    if (lid) this.puppet.add('lid', -50);
    this.puppet.add('head', -5 * k);
  }

  /** Where the ball is now, in model space, or null when it's put away. */
  private ballAt(): Vector3 | null {
    const now = this.time;
    const where = (p: Vector3 | number, out: Vector3) =>
      typeof p === 'number'
        ? this.model.worldToLocal(this.tips[p].localToWorld(out.copy(this.hold[p])))
        : out.copy(p);
    let held: number | null = null;
    for (const f of this.flights) {
      if (now < f.at) break;
      if (now < f.at + f.time) {
        const u = (now - f.at) / f.time;
        const from = where(f.from, va);
        const to = where(f.to, vb);
        // Up out of the hatch and straight back in: the hat trick.
        if (f.from === BALL_REST && f.to === BALL_REST) {
          const q = va.copy(HATCH);
          q.y += f.high * 4 * u * (1 - u);
          if (u < 0.12) return q.lerp(BALL_REST, 1 - u / 0.12);
          if (u > 0.88) return q.lerp(BALL_REST, (u - 0.88) / 0.12);
          return q;
        }
        // Out of the hatch it goes straight up first.
        if (f.from === BALL_REST) from.copy(HATCH);
        const p = from.lerp(to, u);
        p.y += f.high * 4 * u * (1 - u);
        if (f.from === BALL_REST && u < 0.3) return p.lerp(BALL_REST, 1 - u / 0.3);
        if (f.to === BALL_REST && u > 0.7) return p.copy(HATCH).lerp(BALL_REST, (u - 0.7) / 0.3);
        return p;
      }
      held = typeof f.to === 'number' ? f.to : null;
    }
    return held === null ? null : where(held, va);
  }

  // ---------- Reactions ----------

  poke() {
    if (this.state !== 'here') return;
    // Out swimming he just squirts ink; he's busy.
    if (this.swim !== 'no') return void (this.puffAt = this.time);
    const now = performance.now() / 1000;
    this.pokes = [...this.pokes.filter((at) => now - at < 3), now];
    if (this.pokes.length >= 3) {
      this.pokes = [];
      this.setAct('dizzy');
    } else if (this.act !== 'dizzy') this.setAct('poked');
  }

  /** A puff of ink out of the nozzle, and a jump back. */
  private squirt() {
    this.goal = null;
    this.puffAt = this.time;
    this.bob.kick(4);
    this.puppet.kick('head', -120, 0, 60);
    this.flights = [];
  }

  /** Taken hold of, he lets go of his wall (or the floor, or gives up his own swim) and
   * swims after the pointer, out at the front; let go, he floats a moment and then swims
   * back to an edge (flightBack). */
  takeUp(p: { x: number; y: number }, frame: Frame) {
    if (!super.takeUp(p, frame)) return false;
    // (Off the floor he's in the air already.)
    const a = this.free?.tilt ?? ANGLE[this.edge];
    if (!this.free) this.free = { ...this.airborne(this.frontFoot(frame), a), tilt: a };
    this.tilt.snap(a);
    // Up in the air his edge is the floor, as a flier's is, till he lands somewhere.
    this.edge = 'bottom';
    this.s = this.free.x;
    this.depthGoal = 0;
    this.swim = 'no';
    this.route = [];
    this.landing = null;
    this.vel = { x: 0, y: 0 };
    return true;
  }

  /** Let go in the air, after floating a moment: off to an edge, swimming. */
  protected flightBack() {
    const env = this.env;
    if (!this.free || !env) return false;
    this.tilt.snap(this.free.tilt);
    this.setAct('swim');
    this.head(env, []);
    return true;
  }

  leave() {
    // Asked to go while he's out swimming: land first.
    if (this.swim !== 'no' && this.state === 'here') this.exiting = true;
    else super.leave();
  }

  protected onEnter() {
    this.mouse = null;
    this.flights = [];
    this.hiding.snap(0);
    this.swim = 'no';
    this.free = null;
    this.exiting = false;
  }

  // ---------- Swimming ----------

  /** Where his feet are on an edge, standing right on the line. */
  private on(frame: Frame, edge: Edge, s: number): Point {
    return {
      bottom: { x: s, y: frame.bottom },
      top: { x: s, y: frame.top },
      left: { x: frame.left, y: s },
      right: { x: frame.right, y: s },
    }[edge];
  }

  /** Free, his feet are a point below his middle; on an edge his middle is above his
   * feet in the edge's own up. So nothing jumps as he lets go or lands, his free
   * position is set from his middle (as the ladybug's is). */
  private airborne(foot: Point, a: number): Point {
    const c = MIDDLE * this.heightPx;
    const up = inward(a);
    return { x: foot.x + up.x * c, y: foot.y + up.y * c + c };
  }

  /** A clear place on one of his edges to land, most likely another one. */
  private landingSpot(env: Env): { edge: Edge; s: number } {
    const f = env.frame;
    const w = this.widthPx();
    let spot = { edge: this.edge, s: this.s };
    for (let i = 0; i < 12; i++) {
      const others = this.spec.edges.filter((e) => e !== this.edge);
      const pool = Math.random() < 0.75 ? others : this.spec.edges;
      const edge = pool[Math.floor(Math.random() * pool.length)];
      const horizontal = edge === 'bottom' || edge === 'top';
      const [lo, hi] = horizontal ? [f.left, f.right] : [f.top, f.bottom];
      if (hi - lo < w * 4) continue;
      const s = lo + w * 2 + Math.random() * (hi - lo - w * 4);
      spot = { edge, s };
      const clear = env.crew.every((o) => {
        if (o === this || o.state === 'gone' || o.free || o.edge !== edge) return true;
        const b = o.bounds(f);
        return Math.abs(o.s - s) > w + (horizontal ? b.w : b.h) / 2;
      });
      if (clear) break;
    }
    return spot;
  }

  /** Let go of the edge: out into the page, a turn about it, and in to the landing. */
  private pushOff(env: Env) {
    const f = env.frame;
    const H = this.heightPx;
    const a = ANGLE[this.edge];
    const up = inward(a);
    const at = this.airborne(this.foot(f), a);
    this.free = { ...at, tilt: a };
    this.tilt.snap(a);
    this.vel = { x: up.x * H * 3, y: up.y * H * 3 };
    const W = f.right - f.left;
    const V = f.bottom - f.top;
    this.head(env, [
      { x: at.x + up.x * H * 2.5, y: at.y + up.y * H * 2.5 },
      { x: f.left + W * (0.25 + 0.5 * Math.random()), y: f.top + V * (0.3 + 0.4 * Math.random()) },
    ]);
  }

  /** Swimming from where he is, by way of `via`, to a landing on one of his edges, the
   * last stretch in arms first. */
  private head(env: Env, via: Point[]) {
    const f = env.frame;
    const H = this.heightPx;
    this.swim = 'swimming';
    this.swimT = 0;
    this.landing = this.landingSpot(env);
    const la = ANGLE[this.landing.edge];
    const lup = inward(la);
    const down = this.airborne(this.on(f, this.landing.edge, this.landing.s), la);
    this.route = [...via, { x: down.x + lup.x * H * 2, y: down.y + lup.y * H * 2 }, down];
  }

  private touchDown() {
    const spot = this.landing!;
    this.free = null;
    this.edge = spot.edge;
    this.s = spot.s;
    this.h = 0;
    this.vel = { x: 0, y: 0 };
    this.route = [];
    this.landing = null;
    this.swim = 'no';
    this.bob.kick(-2.5);
    this.setAct('idle');
    if (this.exiting) {
      this.exiting = false;
      super.leave();
    }
  }

  protected move(dt: number, env: Env) {
    if (!this.free) return super.move(dt, env);
    const pos = this.free;
    const H = this.heightPx;
    this.paddle(dt);
    const target = this.route[0];
    const last = this.route.length === 1;
    if (target) {
      const dx = target.x - pos.x;
      const dy = target.y - pos.y;
      const dist = Math.hypot(dx, dy);
      if (dist < (last ? 1.5 : H * 0.9)) {
        this.route.shift();
        if (!this.route.length) return this.touchDown();
      } else {
        const cruise = Math.max(H * 1.6, 130);
        const speed = last ? Math.min(cruise, dist * 3) : cruise * (0.45 + 1.4 * this.stroke);
        const k = Math.min(1, dt * (last ? 6 : 1.5 + 5 * this.stroke));
        this.vel.x += ((dx / dist) * speed - this.vel.x) * k;
        this.vel.y += ((dy / dist) * speed - this.vel.y) * k;
      }
    }
    pos.x += this.vel.x * dt;
    pos.y += this.vel.y * dt;
    // Dome first the way he's going; for the way in, turned arms first to his edge.
    const v = Math.hypot(this.vel.x, this.vel.y);
    const along = v > H * 0.3 ? Math.atan2(-this.vel.x, -this.vel.y) : pos.tilt;
    const want = this.landing && this.nearing() ? ANGLE[this.landing.edge] : along;
    const turns = Math.round((pos.tilt - want) / (2 * Math.PI));
    pos.tilt = this.tilt.update(dt, want + turns * 2 * Math.PI);
    this.heading.update(dt, 0);
  }

  /** Each stroke a squeeze of the dome and a jet, then a glide. */
  private paddle(dt: number) {
    this.swimT += dt;
    const phase = cycle(this.swimT / STROKE);
    this.stroke = phase < 0.3 ? Math.sin((phase / 0.3) * Math.PI) : 0;
  }

  /** On the last stretch in: the final leg, or close to the point it starts from. */
  private nearing(): boolean {
    const n = this.route.length;
    if (n !== 1 && n !== 2) return false;
    if (n === 1 || !this.free) return true;
    const to = this.route[0];
    return Math.hypot(to.x - this.free.x, to.y - this.free.y) < this.heightPx * 2.5;
  }

  /** Arms and dome while swimming: bunched and trailing on the jet, flared on the glide,
   * and spread wide to grab the edge on the way in. */
  private swimming(t: number) {
    if (this.swim === 'off') {
      // A crouch before he lets go.
      const k = Math.min(1, t / 0.4);
      for (let i = 0; i < ARMS; i++) {
        this.arm(i, 1, 14 * k);
        this.arm(i, 2, 16 * k);
      }
      this.puppet.add('head', 8 * k);
      return;
    }
    const c = this.stroke;
    const g = 1 - c;
    const grab = this.nearing() ? 1 : 0;
    for (let i = 0; i < ARMS; i++) {
      const trail = 6 * Math.sin(this.swimT * 7 - i * 0.8);
      this.arm(i, 0, (1 - grab) * (-45 * c + 12 * g) + 18 * grab);
      this.arm(i, 1, (1 - grab) * -10 * c);
      this.arm(i, 2, (1 - grab) * -15 * c + trail);
      this.arm(i, 3, -35 * c - 10 * grab + trail);
      this.arm(i, 4, -40 * c - 20 * grab + trail);
    }
  }

  // ---------- Each frame ----------

  protected idle(t: number) {
    // Arms writhing gently, each out of step; the dome breathing.
    for (let i = 0; i < ARMS; i++) {
      this.arm(i, 2, 4 * sin(t, 0.3, i * 0.37));
      this.arm(i, 3, 6 * sin(t, 0.35, i * 0.29 + 0.1), 5 * sin(t, 0.22, i * 0.41));
      this.arm(i, 4, 10 * sin(t, 0.4, i * 0.23 + 0.2));
    }
    this.puppet.add('head', 1.5 * sin(t, 0.3));
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    const t = this.actT;
    const act = this.act;
    this.time = env.time;
    this.env = env;
    this.spec.speed = act === 'jet' ? 2.4 : act === 'sneak' ? 0.5 : 0.9;
    if (act === 'swim') {
      if (this.swim === 'off' && t > 0.45) this.pushOff(env);
      this.swimming(t);
    } else if (this.free) {
      // Held up (or floating a moment, let go): stroking on the spot, and turned upright,
      // leaning after the pointer, a turn at a time (off a wall he was on his side).
      this.paddle(dt);
      this.swimming(t);
      if (this.isHeld) {
        const want = this.free.tilt;
        const turns = Math.round((this.tilt.y - want) / (2 * Math.PI));
        this.free.tilt = this.tilt.update(dt, want + turns * 2 * Math.PI);
      }
    }

    // Shy of a mouse rushing past close by.
    const { x, y } = env.pointer;
    const was = this.mouse ?? { x, y, speed: 0 };
    const speed = Math.hypot(x - was.x, y - was.y) / Math.max(dt, 1e-3);
    this.mouse = { x, y, speed: was.speed + (speed - was.speed) * Math.min(1, dt * 10) };
    const eye = this.eyePoint(env.frame);
    const near = Math.hypot(x - eye.x, y - eye.y) < this.heightPx * 2.5;
    const calm = act === 'idle' || act === 'creep' || act === 'show';
    if (
      env.pointer.present &&
      near &&
      this.mouse.speed > this.heightPx * 40 &&
      calm &&
      env.time > this.shyUntil
    ) {
      this.shyUntil = env.time + 8;
      this.goal = null;
      this.setAct('shy');
    }

    // The mouse resting on him: a happy wiggle, then love.
    this.hover = this.hovered ? this.hover + dt : 0;
    if (this.hover > 0.8 && (act === 'idle' || act === 'creep') && !this.walking)
      this.setAct('love');
    if (this.hovered || act === 'love') {
      const k = act === 'love' ? envelope(t, this.actLength, 0.3) : 0.5;
      for (let i = 0; i < ARMS; i++) {
        this.arm(i, 3, 14 * k * sin(env.time, 2.6, i * 0.25));
        this.arm(
          i,
          4,
          20 * k * sin(env.time, 2.6, i * 0.25 - 0.15),
          12 * k * sin(env.time, 1.3, i * 0.3),
        );
      }
      p.add('head', 0, 0, 6 * k * sin(env.time, 1.3));
    }

    // Creeping: a ripple round the ring, each arm lifting and reaching the way he's going.
    const moving = clamp(this.stride / (this.heightPx * 0.4), 0, 1);
    if (moving > 0.01) {
      const way = Math.sign(this.pace) * LEFTWARD[this.edge];
      for (let i = 0; i < ARMS; i++) {
        const ph = this.gait * 1.6 - (i * Math.PI) / 2;
        const up = Math.max(0, Math.sin(ph));
        this.arm(i, 0, 14 * up * moving);
        this.arm(i, 2, 16 * up * moving);
        this.arm(i, 4, -15 * up * moving);
        this.arm(i, 0, 0, way * 12 * Math.cos(ph) * moving * Math.sign(Math.cos(AZIMUTHS[i])));
      }
      p.add('body', 0, 0, -way * 4 * moving);
      p.add('head', 3 * Math.sin(this.gait * 3.2) * moving);
    }

    // Camouflage: dark and flat while hiding, shy or poked (after the ink).
    let hide = 0;
    if (act === 'hide') hide = t < this.actLength - 1.2 ? 1 : 0;
    else if (act === 'shy') hide = t < this.actLength - 0.8 ? 1 : 0;
    else if (act === 'poked') hide = t > 0.5 && t < this.actLength - 1 ? 1 : 0;
    else if (act === 'nap') hide = 0.4;
    else if (act === 'sneak') hide = t < this.actLength - 0.8 ? 1 : 0;
    this.hideNow = clamp(this.hiding.update(dt, hide), 0, 1);
    const h = this.hideNow;
    for (let i = 0; i < ARMS; i++) {
      this.arm(i, 1, 10 * h);
      this.arm(i, 2, 14 * h);
      this.arm(i, 3, 18 * h);
    }
    p.add('head', 10 * h);

    // Poked: arms flung out as he jets off the line, then tucked.
    if (act === 'poked' && t < 0.6) {
      for (let i = 0; i < ARMS; i++) {
        this.arm(i, 3, -30);
        this.arm(i, 4, -40);
      }
    }

    // Dizzy: arms flung out as he spins.
    if (act === 'dizzy') {
      const spin = t < 2.6 ? Math.sin((t / 2.6) * Math.PI) : 0;
      for (let i = 0; i < ARMS; i++) {
        this.arm(i, 0, 25 * spin);
        this.arm(i, 3, -35 * spin);
        this.arm(i, 4, -40 * spin);
      }
      if (t > 2.6) p.add('head', 0, 10 * sin(t, 1.4), 9 * sin(t, 1.1));
    }

    // Now and then at rest an arm tip curls up and lets go.
    if (act === 'idle' && !this.walking && env.time > this.twitch.next) {
      this.twitch = {
        arm: Math.floor(Math.random() * ARMS),
        at: env.time,
        next: env.time + 1.5 + Math.random() * 3,
      };
    }
    const tw = env.time - this.twitch.at;
    if (tw < 1.2) {
      const c = Math.sin((tw / 1.2) * Math.PI);
      this.arm(this.twitch.arm, 3, 30 * c);
      this.arm(this.twitch.arm, 4, 40 * c);
    }

    // The mouse resting close by: the arm on its side lifts toward it, the tip beckoning.
    const a = ANGLE[this.edge];
    const lx = (x - eye.x) * Math.cos(a) + (eye.y - y) * Math.sin(a);
    const close = Math.hypot(x - eye.x, y - eye.y);
    const curious =
      env.pointer.present &&
      act === 'idle' &&
      !this.walking &&
      !this.free &&
      !this.hovered &&
      close < this.heightPx * 4 &&
      env.time - env.pointer.at < 4;
    if (curious && this.curious.y < 0.05) this.curiousArm = lx > 0 ? 1 : 6;
    const c = clamp(this.curious.update(dt, curious ? 1 : 0), 0, 1.2);
    const ca = this.curiousArm;
    this.arm(ca, 0, 30 * c);
    this.arm(ca, 1, 12 * c);
    this.arm(ca, 3, -25 * c + 15 * c * sin(env.time, 1.1));
    this.arm(ca, 4, -10 * c + 25 * c * sin(env.time, 1.1, -0.15));

    // Faces, unless the act has its own.
    if (act === 'dizzy') this.expression = t > 2.6 ? 'dizzy' : 'surprised';
    else if (act === 'poked')
      this.expression = t < 1 ? 'surprised' : h > 0.5 ? 'sleepy' : 'neutral';
    else if (act === 'shy' || act === 'hide') this.expression = h > 0.5 ? 'sleepy' : 'neutral';
    else if (act === 'reach') this.expression = 'focused';
    else if (!['drum', 'inkpuff', 'peek', 'backwall', 'headstand'].includes(act))
      this.expression = this.hovered ? 'happy' : 'neutral';

    this.flushArms();
  }

  /** The suction cups: eight arms of four lights, Dot(arm * 4 + cup), root to tip. */
  private lights(time: number) {
    const act = this.act;
    const t = this.actT;
    const dark = 1 - this.hideNow * 0.92;
    this.crownTone = undefined;
    let crown = 0.9;
    const mood =
      ['love', 'hug', 'lookmate'].includes(act) || this.hovered ? BEACON.love : undefined;
    if (mood) [crown, this.crownTone] = [0.7 + 0.3 * Math.sin(time * 5), mood];
    else if (['show', 'dance', 'headstand', 'spin', 'dizzy'].includes(act)) {
      [crown, this.crownTone] = [1, RAINBOW[Math.floor(time * 4) % RAINBOW.length]];
    } else if (['juggle', 'hattrick'].includes(act)) [crown, this.crownTone] = [1, this.ballTone];
    else if (['type', 'tidy', 'curl', 'backwall'].includes(act))
      [crown, this.crownTone] = [1, BEACON.focused];
    else if (['wave', 'hello', 'stretch', 'bow', 'tiptoe'].includes(act))
      [crown, this.crownTone] = [1, BEACON.happy];
    else if (['poked', 'inkpuff', 'jet', 'shiver'].includes(act) || this.free)
      [crown, this.crownTone] = [Math.sin(time * 30) > 0 ? 1 : 0.4, BEACON.surprised];
    else if (act === 'drum') {
      const last = this.struck.reduce((a, b) => (b.at > a.at ? b : a));
      [crown, this.crownTone] = [0.3 + 0.7 * Math.max(0, 1 - (time - last.at) / 0.35), last.tone];
    } else if (act === 'nap') crown = 0.4 + 0.3 * Math.sin(time * 0.9);
    this.outfit.dot(CROWN, crown * dark, this.crownTone);
    for (let i = 0; i < ARMS; i++) {
      for (let k = 0; k < STUDS; k++) {
        const along = k / (STUDS - 1);
        let level: number;
        let tone: string | undefined;
        if (act === 'poked' && t < 0.6) {
          // Startled: every cup flashes.
          level = Math.sin(time * 40) > 0 ? 1 : 0.4;
          tone = BEACON.surprised;
        } else if (act === 'dizzy') {
          // Colours chasing round and round the ring.
          level = 0.25 + 0.75 * bump(cycle(time * 1.6 - i / ARMS), 0.3);
          tone = RAINBOW[(i + Math.floor(time * 8)) % RAINBOW.length];
        } else if (act === 'love' || this.hovered) {
          // Warm waves rolling down the arms.
          level = 0.45 + 0.55 * Math.max(0, Math.sin(time * 5 - along * 2.5 - i * 0.4));
          tone = BEACON.love;
        } else if (act === 'show') {
          // Showing off: bands of colour pouring down every arm.
          level = 1;
          tone =
            RAINBOW[
              Math.floor(cycle(time * 1.5 - along * 0.5) * RAINBOW.length + i) % RAINBOW.length
            ];
        } else if (act === 'drum') {
          // Each strike flashes up the arm that struck, tip to root.
          const s = this.struck[i];
          const since = time - s.at - (1 - along) * 0.05;
          level = since >= 0 ? 0.3 + 0.7 * Math.max(0, 1 - since / 0.35) : 0.3;
          tone = since >= 0 && since < 0.35 ? s.tone : undefined;
        } else if (act === 'wave' && this.waving.includes(i)) {
          // The waving arms light up in turn.
          level = 0.4 + 0.6 * Math.max(0, Math.sin(time * 11 - along * 3));
          tone = BEACON.happy;
        } else if (act === 'juggle' || act === 'hattrick') {
          level = 0.6;
          tone = this.ballTone;
        } else if (act === 'type') {
          // Each key a cup lights as its arm taps.
          const tap = Math.max(0, Math.sin(2 * Math.PI * (5.5 * t + i * 0.37 - along * 0.05))) ** 2;
          level = 0.2 + 0.8 * tap;
          tone = BEACON.focused;
        } else if (act === 'tidy') {
          level =
            0.4 + 0.6 * Math.max(0, Math.sin(2 * Math.PI * (t * 1.5 + i * 0.37 - along * 0.1)));
          tone = BEACON.focused;
        } else if (act === 'dance' || act === 'spin' || act === 'headstand') {
          level = 1;
          tone =
            RAINBOW[Math.floor(cycle(time * 1.2 - i / ARMS) * RAINBOW.length + k) % RAINBOW.length];
        } else if (act === 'hug' || act === 'lookmate') {
          level = 0.45 + 0.55 * Math.max(0, Math.sin(time * 4 - along * 2.5 - i * 0.4));
          tone = BEACON.love;
        } else if (act === 'inkpuff' || act === 'jet' || act === 'shiver') {
          level = Math.sin(time * 30 + i) > 0 ? 1 : 0.35;
          tone = BEACON.surprised;
        } else if (act === 'hello' && this.waving.includes(i)) {
          level = 0.4 + 0.6 * Math.max(0, Math.sin(time * 11 - along * 3));
          tone = BEACON.happy;
        } else if (act === 'stretch' || act === 'bow') {
          level = 0.6 + 0.4 * Math.sin(time * 4 - along * 2 - i * 0.3);
          tone = BEACON.happy;
        } else if (act === 'curl') {
          // The light goes round with the curl.
          level = 0.25 + 0.75 * bump(t - i * 0.28 - 0.5 - along * 0.15, 0.45);
          tone = BEACON.focused;
        } else if (act === 'nap') {
          // A slow breath, down the arms.
          level = 0.35 + 0.3 * Math.sin(time * 0.9 - along * 0.8);
        } else if (this.free || act === 'swim') {
          // Swimming: each stroke sends a pulse of light down the arms.
          level = 0.3 + 0.7 * bump(cycle(this.swimT / STROKE) * 1.4 - along * 0.6, 0.3);
          tone = BEACON.surprised;
        } else if (this.walking) {
          // Creeping: the arm that lifts lights up.
          level = 0.35 + 0.65 * Math.max(0, Math.sin(this.gait * 1.6 - (i * Math.PI) / 2));
        } else {
          // At rest: lit, with a dark band drifting down every arm now and then.
          level = 1 - 0.8 * bump(cycle(time / 5 - i * 0.015) * 5 - along * 0.9, 0.35);
        }
        this.outfit.dot(i * STUDS + k, level * dark, tone);
      }
    }
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    this.lights(env.time);

    // Squashed down while hiding, bobbing on the drum and the jump back.
    const bob = this.bob.update(dt, 0);
    const h = this.hideNow;
    // Swimming, the dome squeezes thin on each jet.
    const jet = this.free ? this.stroke : 0;
    p.stretch(
      'head',
      1 - 0.12 * h + 0.015 * Math.sin(env.time * 1.9) + 0.02 * bob + 0.12 * jet,
      [0, 1, 0],
      1 + 0.05 * h - 0.1 * jet,
    );
    p.shift('body', 0, -0.03 * h + 0.012 * bob, 0);
    // The whole of him up or sunk behind the frame line, and the headstand's flip.
    const lift = this.lifted.update(dt, this.liftTo);
    const flip = this.flip.update(dt, this.act === 'headstand' && this.flipped(this.actT) ? 1 : 0);
    p.turn('root', 0, 0, 180 * flip);
    p.shift('root', 0, lift + 0.5 * flip, 0);
    this.liftTo = 0;

    // The ink: blown up out of the nozzle, drifting off and shrinking away.
    const since = env.time - this.puffAt;
    if (since < 1.6) {
      const grow = smooth(since / 0.15) * (1 - smooth((since - 0.5) / 1.1));
      const s = Math.max(0.02, PUFF * grow);
      p.stretch('puff', s, [0, 1, 0], s);
      p.shift('puff', -0.12 * since, 0.1 * since, 0);
    } else {
      p.stretch('puff', 1, [0, 1, 0], 1);
      p.shift('puff', 0, 0, 0);
    }

    // The ball: juggled, held, or away inside the dome.
    const at = this.act === 'juggle' || this.act === 'hattrick' ? this.ballAt() : null;
    const size = this.ballSize.update(dt, at ? 1 : 0);
    const ball = p.bone('ball');
    if (at) {
      this.model.updateMatrixWorld(true);
      const root = p.bone('root');
      ball.position.copy(root.worldToLocal(this.model.localToWorld(at)));
      this.outfit.beacon(this.ballTone);
    } else p.shift('ball', 0, 0, 0);
    const s = clamp(size, 0.01, 1.3);
    p.stretch('ball', s, [0, 1, 0], s);

    // Dizzy: round and round on the spot, easing in and out.
    if (this.act === 'dizzy') {
      const u = clamp((this.actT - 0.2) / 2.4, 0, 1);
      this.pivot.rotation.y = 4 * Math.PI * u * u * (3 - 2 * u);
    } else if (this.act === 'spin') {
      const u = clamp((this.actT - 0.2) / 2.6, 0, 1);
      this.pivot.rotation.y = 4 * Math.PI * u * u * (3 - 2 * u);
    } else this.pivot.rotation.y = 0;
  }
}
