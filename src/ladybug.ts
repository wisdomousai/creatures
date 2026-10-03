import { Color, type Material, type Mesh, type Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import {
  ANGLE,
  type Act,
  Character,
  clamp,
  type Edge,
  type Env,
  envelope,
  type Frame,
  type Spec,
} from './character';
import { type Detail, type Tile, withDetail } from './detail';
import type { FaceLayout } from './face';
import type { FlameStyle, LookName } from './looks';
import { sin } from './moves';
import { Spring } from './spring';

/**
 * Dot, the robot ladybug: the crew's pet, and the simplest of them. She pops up on any
 * edge of the frame, the ceiling included, and mostly just sits there: her dots blink,
 * her antennae wave, and her head turns to follow the mouse. Now and then she does
 * something small. She washes her antennae with her front legs, spins on the spot,
 * tips over onto her back and wiggles her legs until she rocks herself upright, or
 * polishes her wing cases; she strolls (upside down along the ceiling too), scuttles,
 * goes to the back wall to tap it with her antennae, or to the front lip to look over
 * it, or dips down until only her eyes show over the frame line; she hops with her
 * wings buzzing, and now and then flies off to land on a crewmate's head, sits there a
 * while, and flies home again.
 *
 * She has no tail or ears, so the dots and the antennae say how she is. Lit, each
 * winking off now and then; a wave running round her shell, a single light chasing
 * round it, or counting up from one to six; twinkling, or dim while she dozes. The
 * antennae prick up toward a moving mouse, boing when she's poked, and droop while she
 * sleeps; the tips (and the little lamp on her head) change colour with her mood.
 */
export const LADYBUG_FACE: FaceLayout = {
  width: 256,
  height: 192,
  eyes: [
    [0.31, 0.48],
    [0.69, 0.48],
  ],
  rx: 0.12,
  ry: 0.25,
  line: 0.05,
  mouth: [0.5, 0.8],
};

/** A very fine enamel speckle for the wing cases in the colour look: tiny pale and dark
 * flecks, quiet enough to read as a glossy paint job. */
const ENAMEL: Tile = {
  name: 'enamel-speckle',
  scale: 7,
  amount: 0.28,
  draw: (g, size, rand) => {
    for (let i = 0; i < 260; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const r = 0.6 + rand() * 0.9;
      g.fillStyle = rand() < 0.55 ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.25)';
      for (const dx of [-size, 0, size])
        for (const dy of [-size, 0, size]) {
          g.beginPath();
          g.arc(x + dx, y + dy, r, 0, TAU);
          g.fill();
        }
    }
  },
};

/** The dots in order round the shell: left front to back, then right back to front. */
const RING = [0, 1, 2, 5, 4, 3];
const ANTENNAE = [
  ['antenna.L.1', 'antenna.L.2', 1],
  ['antenna.R.1', 'antenna.R.2', -1],
] as const;
const SIDES = [
  ['L', 1],
  ['R', -1],
] as const;
/** Her pivot, the middle of her body, above her feet (as a share of her height). */
const MIDDLE = 0.45;
const DEG = Math.PI / 180;
const TAU = 2 * Math.PI;
/** The edge of her body from the side, (across, up) in metres from the middle of her
 * body: the dome, and the rim and belly under it. It says how far to lift her when she
 * lies on her back, so her shell rests on the line. */
const HULL: [number, number][] = [
  ...[0, 30, 60, 90, 120, 150, 180].map((d): [number, number] => [
    0.2 * Math.cos(d * DEG),
    0.17 * Math.sin(d * DEG),
  ]),
  [0.205, -0.04],
  [-0.205, -0.04],
  [0.16, -0.05],
  [-0.16, -0.05],
];
/** Acts in which she doesn't turn to show her dots to the middle of the edge. */
const FACING = new Set(['spin', 'flip', 'peek', 'lip', 'wall', 'perch', 'scan', 'dizzy']);
const ease = (x: number) => {
  const u = clamp(x, 0, 1);
  return u * u * (3 - 2 * u);
};

type Point = { x: number; y: number };

const FEELS: Spec['feels'] = {
  default: { f: 2, zeta: 0.6 },
  head: { f: 2, zeta: 0.6, r: 0.3 },
  body: { f: 3, zeta: 0.5 },
  'antenna.L.1': { f: 3, zeta: 0.35 },
  'antenna.R.1': { f: 3, zeta: 0.35 },
  'antenna.L.2': { f: 4, zeta: 0.2 },
  'antenna.R.2': { f: 4, zeta: 0.2 },
  'case.L': { f: 2.5, zeta: 0.5 },
  'case.R': { f: 2.5, zeta: 0.5 },
};
for (const [sfx] of SIDES)
  for (let k = 0; k < 3; k++) {
    FEELS[`leg.${sfx}.${k}`] = { f: 6, zeta: 0.55 };
    FEELS[`foot.${sfx}.${k}`] = { f: 7, zeta: 0.5 };
  }

/** Away from an edge, into the page, in viewport px (y down). */
const inward = (a: number): Point => ({ x: -Math.sin(a), y: -Math.cos(a) });

export class Ladybug extends Character {
  /** Held by the pointer, it flies after it. */
  readonly flies = true;
  private winks = RING.map(() => ({ at: -1, next: 1 + Math.random() * 4 }));
  private pokes: number[] = [];
  /** Wing cases and wings: 0 shut, 1 open. */
  private open = new Spring(1.2, 0.8);
  private flight: 'no' | 'opening' | 'flying' | 'perched' = 'no';
  private tilt = new Spring(1.1, 0.8);
  /** How she is moving along her edge, sprung, for the antennae to lag behind. */
  private trail = new Spring(2, 0.5);
  private vel: Point = { x: 0, y: 0 };
  private route: Point[] = [];
  private landing: { edge: Edge; s: number } | null = null;
  /** How far back into the box she lands. */
  private landingDepth = 0;
  private exiting = false;
  private env: Env | null = null;
  /** A crewmate she is flying to or sitting on, and where she came from. */
  private visiting: Character | null = null;
  private homeSpot: { edge: Edge; s: number } | null = null;
  private perchFor = 0;
  private mood = new Color(BEACON.neutral);
  /** Set fresh every frame by the acts (see idle()). */
  private fx = {
    spin: 0,
    lift: 0,
    open: 0,
    lights: null as null | ((i: number, t: number) => number),
    beacon: null as string | null,
    look: null as Point | null,
  };
  /** Small memory for the act in hand. */
  private way = 1;
  private count = 0;
  private stage = 0;
  private since = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Dot',
        model: 'ladybug',
        metres: 0.4,
        width: 0.5,
        size: 0.55,
        feels: FEELS,
        face: LADYBUG_FACE,
        eyes: 0.27,
        gaze: [
          { bone: 'head', yaw: 0.7, pitch: 0.8 },
          { bone: 'body', yaw: 0.3, pitch: 0 },
        ],
        reach: { yaw: 50, pitch: 25 },
        lag: 1,
        entrance: 'rise',
        edges: ['bottom', 'top', 'left', 'right'],
        stay: [30, 80],
        speed: 0.5,
        // She wanders about the ceiling as well as the floor.
        roam: true,
      },
      model,
    );
    this.acts = { ...this.moves(), ...this.reactions() };
  }

  // ---------- Her tricks ----------

  private moves(): Record<string, Act> {
    const p = this.puppet;
    const still = () => this.flight === 'no' && !this.walking;
    const onBox = () => still() && this.inBox;
    const others = () => this.crewmates().length > 0;
    /** Ends a walking act shortly after she gets there. */
    const arrive = (t: number, tail = 0.4) => {
      if (this.there && t > 0.8) this.actLength = Math.min(this.actLength, t + tail);
    };
    const dir = () => (this.way = Math.random() < 0.5 ? -1 : 1);
    const stroll = (far: number, depth?: number) => () => {
      dir();
      const H = this.heightPx;
      this.walkTo(this.s + this.way * H * (far + Math.random() * far), depth);
    };

    return {
      idle: { weight: 10, length: [4, 8] },
      doze: {
        weight: 1,
        length: [6, 12],
        face: 'asleep',
        when: still,
        pose: (t) => {
          p.add('head', 14 + 5 * sin(t, 0.12));
          p.add('body', 4);
          this.fx.lift = -0.012;
          this.legs((side) => [0, -6, -side * 20]);
        },
      },
      fly: {
        weight: 1,
        // Ends when she lands.
        length: [120, 120],
        face: 'happy',
        when: () => this.flight === 'no',
        start: () => (this.flight = 'opening'),
      },
      visit: {
        weight: 0.8,
        // Ends when she sits down on a crewmate's head.
        length: [120, 120],
        face: 'happy',
        when: () => still() && others(),
        start: () => {
          const all = this.crewmates();
          this.visiting = all[Math.floor(Math.random() * all.length)] ?? null;
          this.homeSpot = { edge: this.edge, s: this.s };
          this.flight = 'opening';
        },
      },
      perch: {
        weight: 0,
        length: [999, 999],
        face: 'happy',
        pose: (t) => {
          // Sitting on a head: swaying, feet shuffling, antennae wagging, slow wave.
          p.add('body', 0, 0, 3 * sin(t, 0.4));
          p.add('head', 6 * sin(t, 0.3), 12 * sin(t, 0.17));
          for (const [base, tip, side] of ANTENNAE) {
            p.add(base, 10 * sin(t, 0.9, side * 0.2), 0, -side * (10 + 8 * sin(t, 0.7)));
            p.add(tip, 12 * sin(t, 0.9, 0.2 + side * 0.2));
          }
          this.legs((side, k) => [5 * sin(t, 0.8, k / 3), 0, side * 4 * sin(t, 0.6, k / 3)]);
          this.fx.lights = (i, s) => 0.3 + 0.7 * Math.max(0, Math.sin(s * 2 - i * (Math.PI / 3)));
        },
      },
      // Fidgets
      wash: {
        weight: 1.3,
        length: [5, 6.5],
        face: 'happy',
        when: still,
        pose: (t) => {
          // An antenna bent down to the front legs, which rub it; then the other.
          const k = envelope(t, this.actLength, 0.5);
          p.add('head', -6 * k);
          for (const [sfx, side] of SIDES) {
            const base = `antenna.${sfx}.1`;
            const mine = t < this.actLength / 2 === side > 0;
            const use = mine ? k : 0;
            p.add(base, 100 * use, 0, side * 12 * use);
            p.add(`antenna.${sfx}.2`, 35 * use);
            this.leg(sfx, side, 0, 8 + 16 * sin(t, 2.4) * use, 46 * use, -side * 20 * use);
          }
          p.add('body', 6 * k);
        },
      },
      stretch: {
        weight: 0.9,
        length: [4, 5],
        face: 'sleepy',
        when: still,
        pose: (t) => {
          // A play bow, twice: front legs reaching, back end up.
          const k = Math.max(0, sin(t, 0.42, -0.25)) ** 0.7 * envelope(t, this.actLength, 0.4);
          p.add('body', 14 * k);
          p.add('head', 14 * k);
          this.fx.lift = 0.006 * k;
          this.legs((side, k2) => [(k2 === 0 ? 24 : k2 === 2 ? -18 : 0) * k, 10 * k, 0]);
          for (const [base, , side] of ANTENNAE) p.add(base, -10 * k, 0, -side * 12 * k);
        },
      },
      scan: {
        weight: 1,
        length: [5, 7],
        face: 'focused',
        when: still,
        pose: (t) => {
          // The head sweeping slowly round like a radar, antennae turning the other way.
          const k = envelope(t, this.actLength, 0.5);
          const a = sin(t, 0.28);
          p.add('head', 0, 55 * a * k);
          p.add('root', 0, 12 * a * k);
          for (const [base, tip, side] of ANTENNAE) {
            p.add(base, -8 * k, 0, -side * 18 * k - 16 * a * k);
            p.add(tip, 6 * k);
          }
          this.fx.look = { x: a, y: 0 };
          this.fx.beacon = '#6fdc8c';
        },
      },
      tap: {
        weight: 0.8,
        length: [3.5, 5],
        face: 'focused',
        when: still,
        pose: (t) => {
          // Bowed low, drumming the floor with her antennae in turn.
          const k = envelope(t, this.actLength, 0.4);
          p.add('head', 32 * k);
          p.add('body', 8 * k);
          for (const [base, tip, side] of ANTENNAE) {
            const d = Math.max(0, sin(t, 3, side > 0 ? 0 : 0.5));
            p.add(base, (60 + 30 * d) * k, 0, -side * 6 * k);
            p.add(tip, 25 * d * k);
          }
        },
      },
      shy: {
        weight: 0.6,
        length: [3, 4.5],
        face: 'love',
        when: still,
        pose: (t) => {
          // Both antennae folded over her face, head tucked, cases pressed shut.
          const k = envelope(t, this.actLength, 0.5);
          p.add('head', 18 * k);
          p.add('body', 6 * k);
          for (const [base, tip, side] of ANTENNAE) {
            p.add(base, 120 * k, 0, side * 22 * k);
            p.add(tip, 25 * k);
          }
          this.fx.beacon = '#ff5fa2';
          this.fx.lights = () => 0.3;
        },
      },
      hiccup: {
        weight: 0.5,
        length: [3, 4],
        face: 'surprised',
        when: still,
        pose: (t) => {
          // A small jolt every second or so, and all her dots flash with it.
          const n = Math.floor(t / 0.9);
          if (n > this.count && t > 0.4) {
            this.count = n;
            p.kick('body', -260);
            p.kick('head', -160);
            for (const [, tip, side] of ANTENNAE) p.kick(tip, -300, 0, side * 200);
          }
          const u = (t % 0.9) / 0.9;
          this.fx.lights = () => (u < 0.25 ? 1 : 0.2);
          this.fx.lift = 0.012 * Math.max(0, 1 - u * 5);
        },
        start: () => (this.count = 0),
      },
      // Lights
      wave: {
        weight: 1.2,
        length: [4, 6],
        face: 'happy',
        when: still,
        pose: (t) => {
          for (const [base, tip, side] of ANTENNAE) {
            p.add(base, -8 + 10 * sin(t, 0.8, side * 0.05), 0, -side * 8);
            p.add(tip, 12 * sin(t, 0.8, 0.15));
          }
          this.fx.lights = (i, s) => 0.12 + 0.88 * Math.max(0, Math.cos(s * 5 - i * (Math.PI / 3)));
        },
      },
      chase: {
        weight: 1,
        length: [3.5, 5],
        face: 'happy',
        when: still,
        pose: (t) => {
          // One light running round the shell, faster and faster.
          const at = (t * (2 + t * 0.5)) % 6;
          this.fx.lights = (i) => {
            const d = Math.min(Math.abs(i - at), 6 - Math.abs(i - at));
            return 0.1 + 0.9 * Math.max(0, 1 - d);
          };
          p.add('head', 0, 20 * sin(t, 0.6));
        },
      },
      count: {
        weight: 0.9,
        length: [5, 6],
        face: 'focused',
        when: still,
        start: () => (this.count = 0),
        pose: (t) => {
          // One, two, three... six, lighting a dot for each, a nod on every count,
          // then all of them flash.
          const n = Math.floor(t * 1.5);
          if (n > this.count && n <= 6) {
            p.kick('head', 300);
            p.kick('body', 120);
          }
          this.count = n;
          this.fx.lights = (i, s) => (n > 6 ? (Math.floor(s * 8) % 2 ? 1 : 0.1) : i < n ? 1 : 0.1);
          this.fx.beacon = n > 6 ? '#ffb347' : null;
        },
      },
      twinkle: {
        weight: 0.9,
        length: [4, 6],
        face: 'happy',
        when: still,
        pose: () => {
          this.fx.lights = (i, s) => (Math.sin(s * (3 + i * 1.7) + i * 4) > 0.55 ? 1 : 0.1);
          for (const [base, , side] of ANTENNAE) p.add(base, 0, 0, -side * 10);
        },
      },
      dance: {
        weight: 0.9,
        length: [4, 6],
        face: 'happy',
        when: still,
        pose: (t) => {
          // Rocking from side to side on the beat, antennae flicking, dots left and right.
          const k = envelope(t, this.actLength, 0.4);
          const beat = sin(t, 1.5);
          p.add('body', 0, 0, 12 * beat * k);
          p.add('head', 4 * Math.abs(beat) * k, 0, -10 * beat * k);
          for (const [base, tip, side] of ANTENNAE) {
            p.add(base, -14 * k * Math.abs(beat), 0, -side * (8 + 10 * beat) * k);
            p.add(tip, 16 * k * sin(t, 3));
          }
          this.legs((side, k2) => [0, Math.max(0, side * beat) * 20 * k, k2 * 0]);
          this.fx.lights = (i) => {
            const left = RING.indexOf(i) < 3;
            return (left ? beat : -beat) > 0 ? 1 : 0.12;
          };
        },
      },
      polish: {
        weight: 1,
        length: [5, 6.5],
        face: 'happy',
        when: still,
        pose: (t) => {
          // A middle leg over the wing case, rubbing it, one side and then the other.
          const k = envelope(t, this.actLength, 0.5);
          for (const [sfx, side] of SIDES) {
            const mine = t < this.actLength / 2 === side > 0;
            const use = mine ? k : 0;
            this.leg(sfx, side, 1, 16 * sin(t, 2.6) * use, 62 * use, side * 10 * use);
            p.add('body', 0, 0, side * (mine ? 5 : 0) * k);
          }
          this.fx.lights = (i, s) => 0.35 + 0.65 * Math.max(0, Math.sin(s * 4 - i * 0.9));
        },
      },
      // Moves
      spin: {
        weight: 1,
        length: [2.6, 3.4],
        face: 'happy',
        when: still,
        start: () => {
          dir();
          this.stage = Math.random() < 0.4 ? 2 : 1;
        },
        pose: (t) => {
          // On the spot, once or twice round, legs going.
          const u = ease(t / (this.actLength - 0.3));
          this.fx.spin = this.way * this.stage * TAU * u;
          const k = envelope(t, this.actLength, 0.3);
          p.add('body', 0, 0, this.way * 8 * k);
          for (const [base, , side] of ANTENNAE) p.add(base, 0, 0, -side * 22 * k);
          this.legs((side, k2) => this.step(t * 22, side, k2, 16 * k, 24 * k));
          this.fx.lights = (i, s) => 0.1 + 0.9 * Math.max(0, 1 - ((s * 9 - i + 12) % 6));
        },
      },
      flip: {
        weight: 0.9,
        length: [5, 6.5],
        face: 'surprised',
        when: still,
        start: () => dir(),
        pose: (t) => {
          // Over on her back, legs pedalling, rocking harder and harder until she rolls
          // back onto her feet.
          const L = this.actLength;
          const over = ease(t / 0.55);
          const back = ease((t - (L - 1.1)) / 0.35);
          const rock = 6 + 22 * ease((t - 1) / (L - 2.2));
          const roll = this.way * 180 * over * (1 - back);
          const rocking = t > 0.8 ? rock * sin(t, 0.9) * (1 - back) * over : 0;
          p.add('body', 0, 0, roll + rocking);
          const u = over * (1 - back);
          this.legs((side, k) => [
            24 * sin(t, 4.2, k / 3 + (side > 0 ? 0 : 0.5)) * u,
            (24 + 22 * sin(t, 3.4, k / 3)) * u,
            side * 24 * sin(t, 4.2, k / 3 + 0.25) * u,
          ]);
          for (const [base, tip, side] of ANTENNAE) {
            p.add(base, 40 * u, 0, -side * (55 + 22 * sin(t, 2.6, side * 0.25)) * u);
            p.add(tip, 20 * u * sin(t, 3));
          }
          this.fx.lights = (i, s) => (Math.sin(s * 14 + i * 2.1) > 0 ? 1 : 0.1);
        },
      },
      hop: {
        weight: 1.1,
        length: [2.8, 3.6],
        face: 'happy',
        when: still,
        pose: (t) => {
          // Three or four little hops, the wing cases cracked and the wings a buzzing blur.
          const T = 0.85;
          const u = (t % T) / T;
          const n = Math.floor(t / T);
          const air = u < 0.7 && t > 0.3 ? 4 * (u / 0.7) * (1 - u / 0.7) : 0;
          const crouch =
            t < 0.3
              ? Math.sin((t / 0.3) * Math.PI)
              : u > 0.7
                ? Math.sin(((u - 0.7) / 0.3) * Math.PI)
                : 0;
          if (n !== this.count) {
            this.count = n;
            p.kick('body', -180);
          }
          this.fx.lift = 0.06 * air - 0.008 * crouch;
          this.fx.open = air > 0.02 ? 0.7 : 0;
          for (const [base, tip, side] of ANTENNAE) {
            p.add(base, -14 * air, 0, -side * 16 * air);
            p.add(tip, 10 * air);
          }
          this.legs((side) => [-8 * air, -12 * air, side * -14 * air]);
          this.fx.lights = () => (air > 0.02 ? 1 : 0.15);
        },
        start: () => (this.count = 0),
      },
      shake: {
        weight: 0.9,
        length: [3, 4],
        face: 'surprised',
        when: still,
        pose: (t) => {
          // Cases pop open a little and the wings ruffle, three times.
          const u = (t % 1) / 1;
          const on = t > 0.3 && u < 0.55;
          this.fx.open = on ? 0.75 : 0;
          if (on) p.add('root', 0, 0, 4 * sin(t, 9));
          for (const [, tip, side] of ANTENNAE) p.add(tip, 0, 0, side * 10 * (on ? 1 : 0));
        },
      },
      march: {
        weight: 0.7,
        length: [3.5, 5],
        face: 'focused',
        when: still,
        pose: (t) => {
          // Marching on the spot, knees high, antennae swinging in step.
          const k = envelope(t, this.actLength, 0.4);
          const g = t * 7;
          this.legs((side, k2) => this.step(g, side, k2, 6 * k, 36 * k));
          p.add('body', 0, 0, 3 * Math.sin(g) * k);
          p.add('head', 3 * Math.abs(Math.sin(g)) * k);
          for (const [base, , side] of ANTENNAE)
            p.add(base, 0, 0, -side * 6 * k + 6 * Math.sin(g + side) * k);
          this.fx.lights = (i, s) => (Math.sin(s * 7 + (i % 2) * Math.PI) > 0 ? 1 : 0.12);
        },
      },
      greet: {
        weight: 0.9,
        length: [3, 4],
        face: 'wink',
        when: still,
        start: () => dir(),
        pose: (t) => {
          // One antenna up in a big wave.
          const k = envelope(t, this.actLength, 0.4);
          for (const [sfx, side] of SIDES) {
            if (side !== this.way) continue;
            p.add(`antenna.${sfx}.1`, -14 * k, 0, -side * (30 + 24 * sin(t, 1.8)) * k);
            p.add(`antenna.${sfx}.2`, 0, 0, -side * 18 * sin(t, 1.8, 0.2) * k);
          }
          p.add('head', 0, 0, -this.way * 8 * k);
          this.fx.beacon = '#ffb347';
        },
      },
      // Getting about
      stroll: {
        weight: 1.6,
        length: [12, 12],
        face: 'neutral',
        when: still,
        start: stroll(1.5),
        pose: (t) => arrive(t),
      },
      scuttle: {
        weight: 0.9,
        length: [8, 8],
        face: 'happy',
        when: still,
        start: stroll(3),
        pose: (t) => {
          arrive(t, 0.2);
          if (this.walking) p.add('body', 6);
        },
      },
      crawl: {
        weight: 1.3,
        length: [16, 16],
        face: 'neutral',
        when: () => still() && this.edge === 'top',
        start: () => {
          this.stage = 0;
          stroll(2)();
        },
        pose: (t) => {
          // Along the ceiling, upside down, and back a different way.
          if (this.there && this.stage === 0 && t > 0.8) {
            this.stage = 1;
            const H = this.heightPx;
            this.walkTo(this.s - this.way * H * (1.5 + Math.random() * 2.5));
          } else if (this.stage === 1) arrive(t);
        },
      },
      wall: {
        weight: 1,
        length: [16, 16],
        face: 'focused',
        when: onBox,
        start: () => {
          this.stage = 0;
          this.since = 0;
          this.walkTo(this.s, 1);
        },
        pose: (t) => {
          // To the back wall; there she turns to it and taps it with her antennae,
          // then turns round again.
          if (this.stage === 0 && this.there && t > 0.5) {
            this.stage = 1;
            this.since = t;
          }
          if (this.stage === 0) return;
          const at = t - this.since;
          const away = ease(at / 0.8) * (1 - ease((at - 3.6) / 0.8));
          p.add('root', 0, 165 * away);
          for (const [base, tip, side] of ANTENNAE) {
            const d = Math.max(0, sin(at, 2.2, side > 0 ? 0 : 0.5));
            p.add(base, (48 + 20 * d) * away, 0, -side * 6 * away);
            p.add(tip, 20 * d * away);
          }
          if (at > 4.6) this.actLength = Math.min(this.actLength, t + 0.2);
        },
      },
      lip: {
        weight: 1,
        length: [16, 16],
        face: 'surprised',
        when: onBox,
        start: () => {
          this.stage = 0;
          this.since = 0;
          this.walkTo(this.s, 0);
        },
        pose: (t) => {
          // To the front lip, tipping forward to look down over it, teetering.
          if (this.stage === 0 && this.there && t > 0.5) {
            this.stage = 1;
            this.since = t;
          }
          if (this.stage === 0) return;
          const at = t - this.since;
          const k = ease(at / 0.7) * (1 - ease((at - 3.4) / 0.6));
          p.add('body', (22 + 5 * sin(at, 0.8)) * k);
          p.add('head', 30 * k);
          for (const [base, tip, side] of ANTENNAE) {
            p.add(base, 30 * k, 0, -side * 10 * k);
            p.add(tip, 20 * k * sin(at, 1.1));
          }
          this.legs((side, k2) => [(k2 === 0 ? 14 : 0) * k, (k2 === 0 ? -10 : 0) * k, 0]);
          this.fx.look = { x: sin(at, 0.4) * 0.8, y: 0.9 * k };
          if (at > 4.2) this.actLength = Math.min(this.actLength, t + 0.2);
        },
      },
      peek: {
        weight: 1.1,
        length: [4.5, 6.5],
        face: 'happy',
        when: still,
        pose: (t) => {
          // Sunk down behind the frame line until only her eyes and antennae show,
          // looking about, popping up now and then.
          const k = envelope(t, this.actLength, 0.6);
          const bob = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 1.3));
          this.fx.lift = -0.06 * k * bob;
          p.add('head', 0, 34 * sin(t, 0.35) * k);
          this.fx.look = { x: sin(t, 0.35) * k, y: 0.1 };
          for (const [base, tip, side] of ANTENNAE) {
            p.add(base, -6 * k, 0, -side * 10 * k);
            p.add(tip, 10 * sin(t, 0.9, side * 0.3) * k);
          }
          this.fx.lights = () => 0.15;
        },
      },
    };
  }

  /** Reactions, as acts of their own. */
  private reactions(): Record<string, Act> {
    const p = this.puppet;
    return {
      happy: {
        weight: 0,
        length: [1.8, 2.2],
        face: 'happy',
        start: () => this.boing(),
      },
      dizzy: {
        weight: 0,
        length: [2.5, 3],
        face: 'dizzy',
        pose: (t) => {
          p.add('body', 0, 0, 10 * sin(t, 1.2));
          this.legs((side) => [0, 8, side * 12]);
        },
      },
    };
  }

  /** A step of one leg in a tripod gait: forward and back by `swing`, lifted by `raise`. */
  private step(phase: number, side: number, k: number, swing: number, raise: number) {
    const ph = phase + ((k + (side > 0 ? 0 : 1)) % 2) * Math.PI;
    return [
      swing * Math.sin(ph),
      raise * Math.max(0, Math.cos(ph)),
      -side * raise * 0.6 * Math.max(0, Math.cos(ph)),
    ];
  }

  /** Pose a leg: `fwd` swings it forward, `lift` raises it, `foot` swings the lower leg out. */
  private leg(sfx: string, side: number, k: number, fwd = 0, lift = 0, foot = 0) {
    this.puppet.add(`leg.${sfx}.${k}`, 0, -side * fwd, side * lift);
    this.puppet.add(`foot.${sfx}.${k}`, 0, 0, side * foot);
  }

  /** Pose all six legs: [forward, lift, foot] for each, given its side and pair. */
  private legs(fn: (side: number, k: number) => number[]) {
    for (const [sfx, side] of SIDES)
      for (let k = 0; k < 3; k++) {
        const [fwd, lift, foot] = fn(side, k);
        this.leg(sfx, side, k, fwd, lift, foot);
      }
  }

  /** Crewmates she could visit: on an edge, in the box, not flying. */
  private crewmates(): Character[] {
    return (this.env?.crew ?? []).filter(
      (o) => o !== this && o.state === 'here' && !o.free && !o.door && !o.role,
    );
  }

  /** Colour look only: enamel speckle on the cases, grain on the dark joints, rubber on
   * the feet and pads. The ink and paper looks stay clean. */
  dress(look: LookName, flame?: FlameStyle) {
    super.dress(look, flame);
    if (look !== 'colour') return;
    const planes = this.outfit.materials[0]?.clippingPlanes ?? null;
    const own = new Map<string, Material>();
    this.model.traverse((obj) => {
      const mesh = obj as Mesh;
      const role: string | undefined = mesh.userData.role;
      if (!mesh.isMesh || !role || mesh.userData.outline) return;
      const foot = /^(Pad|Toe)\./.test(mesh.name);
      const kind: Detail | Tile | null = /^Shell$/.test(role)
        ? foot
          ? 'rubber'
          : /^(Case)/.test(mesh.name)
            ? ENAMEL
            : null
        : /^Joint$/.test(role)
          ? foot
            ? 'rubber'
            : 'grain'
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

  private boing() {
    for (const [, tip, side] of ANTENNAE) this.puppet.kick(tip, -500, 0, side * 300);
  }

  perform(name: string) {
    // Busy in the air (or on a head): nothing else until she's down.
    if (this.flight === 'no' || name === 'happy' || name === 'dizzy') super.perform(name);
  }

  poke() {
    if (this.state !== 'here') return;
    // In the air she just boings; she's busy.
    if (this.flight !== 'no') return this.boing();
    const now = performance.now() / 1000;
    this.pokes = [...this.pokes.filter((at) => now - at < 2), now];
    if (this.pokes.length >= 3) {
      this.pokes = [];
      this.setAct('dizzy');
    } else this.setAct('happy');
  }

  leave() {
    // Asked to go while she's out: land first.
    if (this.flight !== 'no' && this.state === 'here') this.exiting = true;
    else super.leave();
  }

  protected onEnter() {
    this.flight = 'no';
    this.free = null;
    this.exiting = false;
    this.visiting = null;
    this.open.snap(0);
  }

  // ---------- Flying ----------

  /** Where her feet are on an edge, standing right on the line. */
  private on(frame: Frame, edge: Edge, s: number): Point {
    return {
      bottom: { x: s, y: frame.bottom },
      top: { x: s, y: frame.top },
      left: { x: frame.left, y: s },
      right: { x: frame.right, y: s },
    }[edge];
  }

  /**
   * In flight her feet are a point below her middle, upright; on an edge her middle is
   * above her feet in the edge's own "up". So that nothing jumps as she lifts off or
   * lands, her flying position is set from her middle.
   */
  private airborne(foot: Point, a: number): Point {
    const c = MIDDLE * this.heightPx;
    const up = inward(a);
    return { x: foot.x + up.x * c, y: foot.y + up.y * c + c };
  }

  /** Where she'd sit on top of a crewmate's head, as a flying position. */
  private headPoint(o: Character, f: Frame): Point {
    const a = ANGLE[o.edge];
    const up = inward(a);
    const foot = o.foot(f);
    const h = o.heightPx * 0.95;
    return this.airborne({ x: foot.x + up.x * h, y: foot.y + up.y * h }, a);
  }

  /** Is there room on this edge to land at s? */
  private clear(env: Env, edge: Edge, s: number) {
    const f = env.frame;
    const w = this.widthPx();
    const horizontal = edge === 'bottom' || edge === 'top';
    return env.crew.every((o) => {
      if (o === this || o.state === 'gone' || o.free || o.edge !== edge) return true;
      const b = o.bounds(f);
      return Math.abs(o.s - s) > w + (horizontal ? b.w : b.h) / 2;
    });
  }

  /** A clear place on one of her edges to land. */
  private landingSpot(env: Env): { edge: Edge; s: number } {
    const f = env.frame;
    const w = this.widthPx();
    let spot = { edge: this.edge, s: this.s };
    for (let i = 0; i < 12; i++) {
      const edge = this.spec.edges[Math.floor(Math.random() * this.spec.edges.length)];
      const horizontal = edge === 'bottom' || edge === 'top';
      const [lo, hi] = horizontal ? [f.left, f.right] : [f.top, f.bottom];
      const s = lo + w * 2 + Math.random() * Math.max(0, hi - lo - w * 4);
      spot = { edge, s };
      if (this.clear(env, edge, s)) break;
    }
    return spot;
  }

  /** Plans the flight from `at`, heading `up` first, to land at this.landing (or `target`). */
  private plan(env: Env, at: Point, up: Point, target?: Point) {
    const f = env.frame;
    const H = this.heightPx;
    const W = f.right - f.left;
    const V = f.bottom - f.top;
    const la = ANGLE[this.landing!.edge];
    const lup = inward(la);
    const down = target ?? this.airborne(this.on(f, this.landing!.edge, this.landing!.s), la);
    this.route = [
      { x: at.x + up.x * H * 2.5, y: at.y + up.y * H * 2.5 },
      { x: f.left + W * (0.2 + 0.6 * Math.random()), y: f.top + V * (0.2 + 0.5 * Math.random()) },
      { x: down.x + lup.x * H * 2, y: down.y + lup.y * H * 2 },
      down,
    ];
  }

  private takeOff(env: Env) {
    const f = env.frame;
    const H = this.heightPx;
    const a = ANGLE[this.edge];
    const up = inward(a);
    const at = this.airborne(this.frontFoot(f), a);
    this.free = { ...at, tilt: a };
    this.tilt.snap(a);
    this.vel = { x: up.x * H * 2, y: up.y * H * 2 };
    this.flight = 'flying';
    // Off into the box, somewhere between the front and the back wall, and down again on
    // any wall, maybe further back; or to a crewmate's head.
    this.depthGoal = 0.3 + Math.random() * 0.7;
    const host = this.visiting;
    if (host) {
      this.landing = { edge: host.edge, s: 0 };
      this.landingDepth = host.depth;
      this.plan(env, at, up, this.headPoint(host, f));
    } else {
      this.landing = this.landingSpot(env);
      this.landingDepth = Math.random() < 0.4 ? 0 : Math.random();
      this.plan(env, at, up);
    }
  }

  /** Off a crewmate's head (or its going): back to where she came from, if there's room. */
  private leaveHead(env: Env) {
    const at = this.free!;
    const a = this.visiting ? ANGLE[this.visiting.edge] : 0;
    const up = inward(a);
    this.visiting = null;
    const h = this.homeSpot;
    this.landing = h && this.clear(env, h.edge, h.s) ? h : this.landingSpot(env);
    this.landingDepth = Math.random() < 0.4 ? 0 : Math.random();
    this.depthGoal = 0.3 + Math.random() * 0.7;
    this.vel = { x: up.x * this.heightPx * 2, y: up.y * this.heightPx * 2 };
    this.plan(env, { x: at.x, y: at.y }, up);
    this.flight = 'flying';
    this.setAct('fly');
  }

  private touchDown() {
    if (this.visiting && this.landing) {
      // On her friend's head: she stays in the air, following it.
      this.flight = 'perched';
      this.route = [];
      this.vel = { x: 0, y: 0 };
      this.perchFor = 4 + Math.random() * 4;
      this.since = 0;
      this.setAct('perch');
      return;
    }
    const spot = this.landing!;
    this.free = null;
    this.edge = spot.edge;
    this.s = spot.s;
    this.h = 0;
    this.vel = { x: 0, y: 0 };
    this.route = [];
    this.landing = null;
    this.flight = 'no';
    this.homeSpot = null;
    this.setAct('idle');
    // A soft landing: she squats on her legs and the antennae flop forward.
    this.puppet.kick('body', -180, 0, 0);
    for (const [sfx, side] of SIDES)
      for (let k = 0; k < 3; k++) this.puppet.kick(`foot.${sfx}.${k}`, 0, 0, side * 160);
    for (const [, tip, side] of ANTENNAE) this.puppet.kick(tip, 300, 0, side * 120);
    if (this.exiting) {
      this.exiting = false;
      super.leave();
    }
  }

  /** Turn to `want`, by the short way round. */
  private turnTo(pos: { tilt: number }, dt: number, want: number) {
    const turns = Math.round((pos.tilt - want) / TAU);
    pos.tilt = this.tilt.update(dt, want + turns * TAU);
  }

  protected move(dt: number, env: Env) {
    this.env = env;
    // How fast she goes when she goes: a stroll, or a scuttle.
    this.spec.speed = this.act === 'scuttle' ? 1.2 : 0.5;
    if (!this.free) return super.move(dt, env);
    const pos = this.free;
    const H = this.heightPx;
    const host = this.visiting;
    if (host && (host.state !== 'here' || host.free || host.door)) {
      // Whoever she was flying to has gone: land somewhere else.
      if (this.flight === 'perched') this.leaveHead(env);
      else {
        this.visiting = null;
        this.landing = this.landingSpot(env);
        this.landingDepth = Math.random();
        this.plan(env, pos, { x: 0, y: -1 });
      }
      return;
    }
    if (this.flight === 'perched') {
      // Sitting on the head, wherever it goes.
      const at = this.headPoint(host!, env.frame);
      pos.x = at.x;
      pos.y = at.y;
      this.depthGoal = host!.depth;
      this.turnTo(pos, dt, ANGLE[host!.edge]);
      this.heading.update(dt, 0);
      this.since += dt;
      if (this.since > this.perchFor || this.exiting) this.leaveHead(env);
      return;
    }
    if (host && this.route.length <= 2 && this.route.length > 0) {
      const at = this.headPoint(host, env.frame);
      const lup = inward(ANGLE[host.edge]);
      this.landingDepth = host.depth;
      if (this.route.length === 2)
        this.route[0] = { x: at.x + lup.x * H * 1.5, y: at.y + lup.y * H * 1.5 };
      this.route[this.route.length - 1] = at;
    }
    const maxSpeed = Math.max(H * 4, 220);
    const maxAcc = maxSpeed * 3;
    const target = this.route[0];
    const last = this.route.length === 1;
    let ax = 0;
    let ay = 0;
    if (target) {
      const dx = target.x - pos.x;
      const dy = target.y - pos.y;
      const dist = Math.hypot(dx, dy);
      if (this.route.length <= 2) this.depthGoal = this.landingDepth;
      if (dist < (last ? 1.5 : H * 0.8)) {
        this.route.shift();
        if (!this.route.length) return this.touchDown();
      } else {
        const speed = last ? Math.min(maxSpeed, dist * 2.5) : maxSpeed;
        ax = ((dx / dist) * speed - this.vel.x) * 4;
        ay = ((dy / dist) * speed - this.vel.y) * 4;
        // A ladybug bumbles.
        if (this.route.length > 2) {
          ax += maxAcc * 0.4 * Math.sin(this.t * 5.1);
          ay += maxAcc * 0.4 * Math.cos(this.t * 3.7);
        }
      }
    }
    const a = Math.hypot(ax, ay);
    if (a > maxAcc) [ax, ay] = [(ax / a) * maxAcc, (ay / a) * maxAcc];
    this.vel.x += ax * dt;
    this.vel.y += ay * dt;
    pos.x += this.vel.x * dt;
    pos.y += this.vel.y * dt;
    // Upright in the air, leaning into the way she's going; turned to her landing edge
    // for the way in.
    const lean = clamp(-this.vel.x / maxSpeed, -1, 1) * 0.35;
    const want = this.route.length <= 2 && this.landing ? ANGLE[this.landing.edge] : lean;
    this.turnTo(pos, dt, want);
    this.heading.update(dt, this.route.length <= 1 ? 0 : clamp(this.vel.x / maxSpeed, -1, 1) * 40);
  }

  // ---------- Posing ----------

  protected idle(t: number) {
    // Everything the acts set for this frame starts from nothing.
    this.fx = { spin: 0, lift: 0, open: 0, lights: null, beacon: null, look: null };
    const p = this.puppet;
    p.add('body', 1.5 * sin(t, 0.3));
    // Antennae waving, each a little out of step with the other; tips a beat behind.
    for (const [base, tip, side] of ANTENNAE) {
      const k = side > 0 ? 0 : 0.3;
      p.add(base, 8 * sin(t, 0.5, k), 0, side * (-6 + 8 * sin(t, 0.37, k)));
      p.add(tip, 14 * sin(t, 0.5, k - 0.15), 0, side * 6 * sin(t, 0.61, k));
    }
    // Feet shifting a little, now and then.
    for (const [sfx, side] of SIDES)
      for (let k = 0; k < 3; k++)
        this.leg(
          sfx,
          side,
          k,
          2.5 * sin(t, 0.17, k * 0.31 + side * 0.1),
          4 * Math.max(0, sin(t, 0.11, k * 0.4 + side * 0.2)) ** 4,
        );
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    const t = env.time;
    const wingsOut = this.flight === 'opening' || this.flight === 'flying';
    // Wing cases lift and part; once they're up, she's off. (A hop or a shake cracks
    // them a little.)
    const open = this.open.update(dt, wingsOut ? 1 : this.fx.open);
    // A beat of anticipation: the cases dip a little as they start to lift, and she
    // crouches, then they swing up.
    const dip = this.flight === 'opening' ? Math.sin(Math.PI * clamp(open / 0.35, 0, 1)) : 0;
    for (const [sfx, side] of SIDES)
      p.add(`case.${sfx}`, 30 * open - 5 * dip, 0, side * (45 * open - 8 * dip));
    p.add('body', -5 * dip);
    // Antennae lag behind a walk: she turns to face the way she goes, so however she walks
    // they tip back (-x, the opposite of a droop), the faster the further.
    const drift = this.trail.update(dt, clamp(Math.abs(this.pace) / (this.heightPx * 1.5), 0, 1));
    for (const [base, tip] of ANTENNAE) {
      p.add(base, -drift * 10);
      p.add(tip, -drift * 8);
    }
    if (this.flight === 'opening' && open > 0.85) this.takeOff(env);

    // Walking: legs in two sets of three.
    const moving = clamp(this.stride / (this.heightPx * 0.12), 0, 1);
    if (moving > 0.02 && !this.free) {
      const scale = this.act === 'scuttle' ? 1.3 : 1;
      this.legs((side, k) => this.step(this.gait * 7, side, k, 16 * moving * scale, 24 * moving));
      p.add('body', 0, 0, 2 * Math.sin(this.gait * 7) * moving);
    }

    if (this.free && this.flight !== 'perched') {
      // In the air: tipped forward so her back shows, the open cases and wings beating
      // over it, her face still up to the viewer; antennae streaming, legs trailing.
      p.add('body', 30);
      p.add('head', -30);
      for (const [base, , side] of ANTENNAE) p.add(base, 25, 0, side * 8);
      this.legs((side) => [-14, -10, -side * 12]);
    } else if (!this.free) {
      // Turned toward the middle of her edge, so her dots show.
      const [lo, hi] = this.span(env.frame);
      const aside =
        Math.sign((lo + hi) / 2 - this.s) *
        (this.edge === 'bottom' || this.edge === 'left' ? 1 : -1);
      const shown = FACING.has(this.act) || moving > 0.02 ? 0 : 1;
      p.add('root', 0, aside * 35 * shown);
      p.add('head', 0, -aside * 20 * shown);
    }

    // Spinning on the spot and lying on her back: about the middle of her body, and
    // lifted so that her shell rests on the line.
    this.pivot.rotation.y = this.fx.spin;
    let lift = this.fx.lift;
    if (!this.free) {
      const [, , roll] = p.current('body');
      const c = Math.cos(roll * DEG);
      const s = Math.sin(roll * DEG);
      const low = Math.min(...HULL.map(([x, z]) => x * s + z * c));
      lift += Math.max(0, -(0.06 + low));
    }
    this.h = lift * this.px;

    const eye = this.eyePoint(env.frame);
    const near =
      env.pointer.present &&
      env.time - env.pointer.at < 1.5 &&
      Math.hypot(env.pointer.x - eye.x, env.pointer.y - eye.y) < this.heightPx * 10;
    for (const [base, tip, side] of ANTENNAE) {
      if (this.act === 'doze') {
        p.add(base, 40, 0, -side * 10); // drooping
        p.add(tip, 30);
      } else if (this.act === 'dizzy') {
        p.add(base, 20 * Math.cos(env.time * 6), 0, 20 * Math.sin(env.time * 6));
      } else if (near && !this.free && this.act === 'idle') {
        p.add(base, -12, 0, side * 6); // pricked up at the moving mouse
        p.add(tip, 6 * sin(env.time, 3, side * 0.25));
      }
    }
    this.expression = this.hovered ? 'happy' : 'neutral';

    // The antenna tips and the lamp on her head glow in her mood's colour.
    const mood = this.role?.face ?? this.acts[this.act]?.face ?? this.expression;
    let target: string;
    if (this.fx.beacon) target = this.fx.beacon;
    else if (this.act === 'dizzy') target = RAINBOW[Math.floor(t * 6) % RAINBOW.length];
    else if (mood === 'asleep') target = Math.sin(t * 1.2) > 0 ? '#55554f' : '#8a8a84';
    else if (wingsOut) target = RAINBOW[Math.floor(t * 4) % RAINBOW.length];
    else target = BEACON[mood] ?? '#f4f4f1';
    this.mood.lerp(new Color(target), Math.min(1, dt * 6));
    this.outfit.beacon(this.mood);
  }

  /** The wings and the dots: set straight on the bones and outfit each frame. */
  protected after(_dt: number, env: Env) {
    const t = env.time;
    // Wings unfold out of nothing as the cases lift, and beat faster than any spring.
    const open = clamp(this.open.y, 0, 1);
    const spread = Math.max(0.02, open * open);
    for (const [sfx, side] of SIDES) {
      const wing = `wing.${sfx}`;
      this.puppet.stretch(wing, spread, [0, 1, 0], spread);
      if (open > 0.3)
        this.puppet.turn(
          wing,
          0,
          0,
          side *
            open *
            (18 +
              26 * Math.sin(t * TAU * 11) +
              8 * Math.sin(t * TAU * 23 + side) +
              4 * Math.sin(t * TAU * 3.1)),
        );
    }
    // Where her eyes look, when an act says (peeking, scanning).
    if (this.fx.look && this.face) {
      this.face.look.x = clamp(this.fx.look.x, -1, 1);
      this.face.look.y = clamp(this.fx.look.y, -1, 1);
    }

    const flying = this.flight === 'opening' || this.flight === 'flying';
    RING.forEach((dot, i) => {
      let level: number;
      if (this.act === 'doze') {
        level = 0.25 + 0.3 * (0.5 + 0.5 * Math.sin(t * 1.2 - i * 0.2));
      } else if (this.fx.lights) {
        level = this.fx.lights(i, t);
      } else if (this.act === 'happy' || flying) {
        level = 0.15 + 0.85 * Math.max(0, Math.cos(t * 12 - i * (Math.PI / 3)));
      } else if (this.act === 'dizzy') {
        level = Math.random() < 0.5 ? 1 : 0.15;
      } else if (this.hovered) {
        level = 0.55 + 0.45 * Math.sin(t * 4 - i * (Math.PI / 3));
      } else {
        // Lit, each winking off for a moment now and then.
        const w = this.winks[i];
        if (t > w.next) {
          w.at = t;
          w.next = t + 1.5 + Math.random() * 5;
        }
        level = t - w.at < 0.22 ? 0.15 : 1;
      }
      this.outfit.dot(dot, level);
    });
  }
}
