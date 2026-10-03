import type { Object3D } from 'three';
import { BEACON } from './bolt';
import { type Act, Character, clamp, type Env } from './character';
import type { Expression, FaceLayout } from './face';
import { pulse, ramp } from './kitties';
import { sin } from './moves';

/**
 * Boulder, the robot young gorilla: a broad barrel of a body, long strong arms that end in big
 * knuckle fists, short legs, a dark chest plate with a lit pad (it flashes with every beat of
 * the chest drum), a silver saddle panel on his back in a trim of lights and a heavy brow bar
 * with a lit strip over a thoughtful screen face.
 *
 * He knuckle-walks (leaning forward on his fists, the arms swinging against the legs) and
 * stays on the floor. His acts: a chest drum (three rounds of fists on the plate, the pad
 * lighting each hit), sits down and scratches his head, a gentle wave, sits with his chin in
 * his hand and thinks (the brow light slowly pulsing), rocks from side to side on his
 * knuckles, turns a fist over and studies it, covers his eyes and peeks, hops with his arms
 * up, and naps sitting. A poke makes him rear up and beat his chest once; three make him dizzy.
 */
export const GORILLA_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.31, 0.5],
    [0.69, 0.5],
  ],
  rx: 0.085,
  ry: 0.22,
  line: 0.045,
  mouth: [0.5, 0.82],
};

const SIDES = [1, -1] as const;
const sfx = (s: 1 | -1) => (s === 1 ? 'L' : 'R');
const SPEED = 0.8;
/** How far he leans forward on his knuckles at rest (degrees of body pitch). */
const LEAN = 12;

type Arm = [pitch: number, roll: number, elbow: number];

interface Want {
  /** Arms by side: [pitch (- forward/up), roll (+ out), elbow bend (- bends forward)]. */
  armL: Arm;
  armR: Arm;
  head: [number, number, number];
  body: [number, number, number];
  /** 0..1: sitting down on his haunches. */
  sit: number;
  /** Extra body lean (degrees, + forward) on top of the resting one. */
  lean: number;
  lift: number;
  face: Expression | null;
  spin: number;
  /** The chest pad's flash, the brow light and the saddle trim, 0..1. */
  flash: number;
  brow: number;
  trim: number;
  /** Rocking side to side, degrees of roll. */
  rock: number;
}
const fresh = (): Want => ({
  armL: [0, 0, 0],
  armR: [0, 0, 0],
  head: [0, 0, 0],
  body: [0, 0, 0],
  sit: 0,
  lean: 0,
  lift: 0,
  face: null,
  spin: 0,
  flash: 0,
  brow: 0,
  trim: 0,
  rock: 0,
});

const mir = (a: Arm): Arm => [a[0], -a[1], a[2]];

export class Gorilla extends Character {
  private want = fresh();
  private run = { n: 0, dir: 1 };
  private pokes: number[] = [];
  private hover = 0;
  private frame: Env['frame'] | null = null;
  private beat = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Boulder',
        model: 'gorilla',
        metres: 0.62,
        width: 0.6,
        size: 1.15,
        feels: {
          default: { f: 4, zeta: 0.6 },
          root: { f: 3, zeta: 0.6 },
          body: { f: 3, zeta: 0.55 },
          head: { f: 3.4, zeta: 0.5, r: 0.3 },
          'arm.L': { f: 4.5, zeta: 0.5 },
          'arm.R': { f: 4.5, zeta: 0.5 },
          'forearm.L': { f: 5, zeta: 0.45 },
          'forearm.R': { f: 5, zeta: 0.45 },
        },
        face: GORILLA_FACE,
        eyes: 0.88,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.8 },
          { bone: 'body', yaw: 0.2, pitch: 0 },
        ],
        reach: { yaw: 55, pitch: 28 },
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

  private moves(): Record<string, Act> {
    const p = () => this.puppet;
    const w = () => this.want;
    const rest = () => !this.walking;
    const room = (dir: number) => {
      const f = this.frame;
      if (!f) return this.heightPx * 2;
      const [lo, hi] = this.span(f);
      return Math.max(0, (dir > 0 ? hi - this.s : this.s - lo) - this.widthPx() * 0.5);
    };
    const go = (lo: number, hi: number) => {
      const dir = Math.random() < 0.5 ? -1 : 1;
      const d = room(dir) > room(-dir) * 0.5 ? dir : -dir;
      const far = Math.min(room(d), this.heightPx * (lo + Math.random() * (hi - lo)));
      this.walkTo(this.s + d * far, Math.random() < 0.7 ? Math.random() : undefined);
    };
    const arms = (l: Arm, r: Arm) => {
      w().armL = l;
      w().armR = r;
    };
    return {
      idle: { weight: 3, length: [2.5, 5] },
      stroll: { weight: 3, length: [5, 7], when: rest, start: () => go(1.5, 3.5) },
      // Rears up and beats his chest: fists in turn on the plate, the pad lighting each hit.
      drum: {
        weight: 2.4,
        length: [6, 6],
        when: rest,
        start: () => (this.beat = 0),
        pose: (t) => {
          const k = ramp(t, 0, 0.7) * (1 - ramp(t, 5.2, 6));
          const rate = 3.6;
          const u = t > 0.8 && t < 5.2 ? (t - 0.8) * rate : 0;
          const hit = u > 0 ? Math.exp(-(u % 1) * 9) : 0;
          const left = Math.floor(u) % 2 === 0;
          const up: Arm = [-60, -26, -92];
          const swing = (on: boolean): Arm => [
            up[0] - (on ? 22 * hit : 0) + (on ? 0 : 10),
            up[1],
            up[2] + (on ? 24 * hit : 0),
          ];
          arms(
            [
              up[0] * k + (swing(left)[0] - up[0]) * k,
              up[1] * k,
              up[2] * k + (swing(left)[2] - up[2]) * k,
            ],
            mir([
              up[0] * k + (swing(!left)[0] - up[0]) * k,
              up[1] * k,
              up[2] * k + (swing(!left)[2] - up[2]) * k,
            ]),
          );
          w().lean = -LEAN - 12 * k;
          w().head = [-10 * k, 0, 0];
          w().body = [-4 * hit * k, 0, 0];
          w().flash = hit * k;
          w().trim = hit * k;
          w().lift = 0.012 * hit * k;
          w().face = hit > 0.3 ? 'surprised' : 'happy';
          if (u > 0 && Math.floor(u) !== this.beat) {
            this.beat = Math.floor(u);
            p().kick('body', -60);
            p().kick('head', 50);
          }
        },
      },
      // Sits down on his bottom and scratches his head with one hand, then the other.
      scratch: {
        weight: 1.8,
        length: [7, 7],
        when: rest,
        start: () => (this.run.dir = Math.random() < 0.5 ? 1 : -1),
        pose: (t) => {
          const k = ramp(t, 0, 1) * (1 - ramp(t, 6, 7));
          w().sit = k;
          w().lean = -LEAN - 6 * k;
          const sc = Math.sin(t * 13);
          const head: Arm = [-135 * k, 14 * k, -125 * k + 20 * sc * k];
          const knee: Arm = [-40 * k, 10 * k, -30 * k];
          const second = ramp(t, 3.4, 3.9);
          const a = this.run.dir === 1 ? head : knee;
          const b = this.run.dir === 1 ? knee : head;
          // The first hand scratches, then the other.
          if (second > 0.5) arms([...b] as Arm, mir([...a] as Arm));
          else arms([...a] as Arm, mir([...b] as Arm));
          w().head = [-4 * k, 0, 10 * k * this.run.dir];
          w().face = 'sheepish';
        },
      },
      // A gentle wave with one big hand, head tipped.
      wave: {
        weight: 1.6,
        length: [4.5, 4.5],
        when: rest,
        pose: (t) => {
          const k = ramp(t, 0, 0.7) * (1 - ramp(t, 3.8, 4.5));
          const s = Math.sin(t * 5);
          arms([-14 * k, 4 * k, 0], mir([-150 * k, 30 * k + 12 * s * k, -25 * k + 12 * s * k]));
          w().lean = -LEAN * 0.6 * k;
          w().head = [-4 * k, 0, 8 * k];
          w().face = 'happy';
        },
      },
      // Sits with his chin in his hand and thinks, the brow light slowly pulsing.
      ponder: {
        weight: 1.4,
        length: [8, 8],
        when: rest,
        pose: (t) => {
          const k = ramp(t, 0, 1.2) * (1 - ramp(t, 7, 8));
          w().sit = k;
          w().lean = -LEAN - 4 * k;
          arms([-30 * k, 8 * k, -20 * k], mir([-55 * k, -14 * k, -130 * k]));
          w().head = [6 * k, 8 * k * sin(t, 0.15), 6 * k];
          w().brow = k * (0.5 + 0.5 * Math.sin(t * 2.2));
          w().face = Math.sin(t * 0.7) > 0.8 ? 'wink' : 'neutral';
        },
      },
      // Rocks his weight from one knuckle to the other, humming.
      rock: {
        weight: 1.4,
        length: [5, 5],
        when: rest,
        pose: (t) => {
          const k = ramp(t, 0, 0.6) * (1 - ramp(t, 4.4, 5));
          const s = Math.sin(t * 3);
          w().rock = 8 * s * k;
          w().lift = 0.008 * Math.abs(s) * k;
          w().head = [0, 0, -6 * s * k];
          arms([6 * s * k, 0, 0], mir([-6 * s * k, 0, 0]));
          w().trim = k * (0.5 + 0.5 * s);
          w().face = 'happy';
        },
      },
      // Turns a fist over in front of his face and studies it, tipping his head.
      study: {
        weight: 1.2,
        length: [6, 6],
        when: rest,
        pose: (t) => {
          const k = ramp(t, 0, 1) * (1 - ramp(t, 5, 6));
          arms([-6 * k, 0, 0], mir([-80 * k, -8 * k, -105 * k + 15 * Math.sin(t * 1.6) * k]));
          w().lean = -LEAN * 0.7 * k;
          w().head = [8 * k, 0, 10 * k * Math.sin(t * 0.8)];
          w().brow = k * 0.6;
          w().face = 'focused';
        },
      },
      // Hands over his eyes, a long wait, then he spreads them. Peekaboo.
      peek: {
        weight: 1.1,
        length: [5, 5],
        when: rest,
        pose: (t) => {
          const cover = ramp(t, 0.2, 0.9) * (1 - ramp(t, 3.2, 3.5));
          const open = ramp(t, 3.5, 3.7) * (1 - ramp(t, 4.4, 4.8));
          const a: Arm = [-110 * cover + 20 * open, -6 * cover - 36 * open, -125 * cover];
          arms(a, mir(a));
          w().lean = -LEAN * 0.8 * cover;
          w().head = [4 * cover, 0, 0];
          w().face = cover > 0.5 ? 'sheepish' : 'happy';
        },
      },
      // A hop with both arms up, a chest-puff, and a grin.
      jig: {
        weight: 1.2,
        length: [4.5, 4.5],
        when: rest,
        pose: (t) => {
          const k = ramp(t, 0, 0.5) * (1 - ramp(t, 3.9, 4.5));
          const s = Math.sin(t * 6);
          arms([-150 * k + 14 * s * k, 24 * k, 0], mir([-150 * k - 14 * s * k, 24 * k, 0]));
          w().lean = -LEAN * k;
          w().body = [0, 6 * s * k, 0];
          w().lift = 0.03 * k * Math.max(0, Math.sin(t * 6 + 1.5));
          w().flash = 0.5 * k * Math.max(0, s);
          w().face = 'happy';
        },
      },
      // Sits down, rubs an eye, and nods off sitting.
      nap: {
        weight: 1.2,
        length: [9, 14],
        when: rest,
        pose: (t) => {
          const k = ramp(t, 0, 1.6);
          w().sit = k;
          w().lean = -LEAN + 8 * k;
          arms([-14 * k, 6 * k, -40 * k], mir([-14 * k, 6 * k, -40 * k]));
          w().head = [22 * k, 0, 4 * k * sin(t, 0.1)];
          w().face = k > 0.8 ? 'asleep' : 'sleepy';
        },
      },
      dizzy: {
        weight: 0,
        length: [4, 4],
        pose: (t) => {
          const k = 1 - ramp(t, 2.8, 4);
          w().spin = 2 * Math.PI * 2 * ramp(t, 0.2, 2.8);
          w().head = [0, 14 * Math.sin(t * 6) * k, 9 * Math.cos(t * 5) * k];
          arms([-20 * k, 30 * k, -30 * k], mir([-20 * k, 30 * k, -30 * k]));
          w().face = 'dizzy';
        },
      },
      // Rears up and beats his chest once, the pad flashing.
      startle: {
        weight: 0,
        length: [2, 2],
        pose: (t) => {
          const k = pulse(t, 0, 1.8);
          const hit = pulse(t, 0.45, 0.4);
          const a: Arm = [-70 * k - 20 * hit, -26 * k, -95 * k];
          arms(a, mir(a));
          w().lean = -LEAN - 12 * k;
          w().head = [-8 * k, 0, 0];
          w().flash = hit + 0.3 * k;
          w().face = 'surprised';
          if (t > 0.45 && this.beat === 0) {
            this.beat = 1;
            p().kick('body', -80);
          }
        },
      },
    };
  }

  poke() {
    if (this.state !== 'here') return;
    const now = performance.now() / 1000;
    this.pokes = [...this.pokes.filter((at) => now - at < 3), now];
    this.goal = null;
    if (this.pokes.length >= 3) {
      this.pokes = [];
      this.setAct('dizzy');
    } else if (this.act !== 'dizzy') {
      this.beat = 0;
      this.setAct('startle');
    }
  }

  protected onEnter() {
    this.spec.speed = SPEED;
  }

  protected idle(t: number) {
    const p = this.puppet;
    this.want = fresh();
    p.add('body', 1.2 * sin(t, 0.3));
    p.add('head', 1.5 * sin(t, 0.2), 5 * sin(t, 0.09), 0);
    this.want.armL = [2 * sin(t, 0.3), 0, 0];
    this.want.armR = [2 * sin(t, 0.3, 0.3), 0, 0];
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    const w = this.want;
    this.frame = env.frame;
    this.hover = this.hovered ? this.hover + dt : 0;
    if (this.hover > 0.9 && this.act === 'idle') this.setAct('wave');
    const moving = clamp(this.stride / (SPEED * env.frame.bot * 0.9), 0, 1.5);
    const g = this.gait * 1.3;

    const armL = [...w.armL] as Arm;
    const armR = [...w.armR] as Arm;
    let sink = 0.03 * w.sit;
    // Knuckle-walking: legs swing against each other, the arms against the legs, the body rolls.
    let lean = LEAN + w.lean;
    if (moving > 0.05) {
      const s = Math.sin(g);
      for (const side of SIDES) {
        const ph = side === 1 ? s : -s;
        p.add(`thigh.${sfx(side)}`, 26 * ph * moving, 0, 0);
        p.add(`shin.${sfx(side)}`, -24 * Math.max(0, -ph) * moving, 0, 0);
      }
      armL[0] += -26 * s * moving;
      armR[0] += 26 * s * moving;
      p.add('body', 0, 5 * s * moving, 5 * Math.cos(g) * moving);
      p.add('head', 0, -4 * s * moving, 0);
      sink += 0.012 * moving * (1 - Math.cos(g * 2));
      lean += 6 * moving;
    }
    // Sitting: the legs fold forward, the whole of him comes down.
    for (const side of SIDES) {
      const s = sfx(side);
      p.add(`thigh.${s}`, -86 * w.sit, 0, side * 6 * w.sit);
      p.add(`shin.${s}`, 80 * w.sit, 0, 0);
    }
    p.shift('root', 0, w.lift - 0.13 * w.sit - sink, -0.03 * w.sit);
    // The body leans on its fists; the arms and head keep upright against it.
    const lean2 = lean * (1 - 0.5 * w.sit);
    p.add('body', lean2 + w.body[0], w.body[1], w.body[2] + w.rock);
    p.add('head', w.head[0] - lean2 * 0.8, w.head[1], w.head[2] - w.rock * 0.5);
    p.add('arm.L', armL[0] - lean2, 0, armL[1]);
    p.add('arm.R', armR[0] - lean2, 0, armR[1]);
    p.add('forearm.L', armL[2], 0, 0);
    p.add('forearm.R', armR[2], 0, 0);

    this.expression = w.face ?? (this.hovered ? 'happy' : 'neutral');
  }

  protected after(_dt: number, env: Env) {
    const w = this.want;
    this.pivot.rotation.y = w.spin;
    const o = this.outfit;
    if (!o) return;
    const t = env.time;
    const asleep = this.expression === 'asleep';
    const tone = BEACON[this.expression];
    o.dot(0, asleep ? 0.1 : clamp(0.28 + 0.1 * Math.sin(t * 1.4) + 0.72 * w.flash, 0, 1), tone);
    o.dot(1, asleep ? 0.1 : clamp(0.3 + 0.7 * w.brow, 0, 1), '#ffe08a');
    o.dot(2, asleep ? 0.12 : clamp(0.35 + 0.3 * Math.sin(t * 1.9) + 0.6 * w.trim, 0, 1));
    o.beacon(BEACON[this.expression] ?? BEACON.neutral!);
  }
}
