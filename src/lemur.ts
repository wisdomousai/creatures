import type { Object3D } from 'three';
import { BEACON } from './bolt';
import { type Act, Character, clamp, type Env } from './character';
import type { Expression, FaceLayout } from './face';
import { ramp } from './kitties';
import { sin } from './moves';

/**
 * Zesty, the robot ring-tailed lemur: a slim grey toy with a white belly plate, a dark eye mask
 * round her big amber screen eyes, round ears with lit discs, little hands, long legs, and a
 * very long tail in eight segments ringed light and dark: each dark ring has a lit band (Dot2 to
 * Dot5) that can light up in turn, and the tip is lit (Dot6). The tail is held up behind her in
 * a question mark when she walks.
 *
 * She walks on the floor and goes up the side walls. Her acts: sunbathes (sits up with her
 * arms flung wide and her belly to the light, the rings glowing warm), a hop-skip sideways,
 * the rings lighting up in turn along a swaying tail, wraps her tail round herself and hugs it,
 * chatters with her ears flicking, scratches, jigs, naps with her tail over her like a blanket,
 * clings and looks round on a wall. A poke makes her leap with her tail straight up; three
 * make her dizzy.
 */
export const LEMUR_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.3, 0.5],
    [0.7, 0.5],
  ],
  rx: 0.13,
  ry: 0.36,
  line: 0.04,
  mouth: null,
};

const SIDES = [1, -1] as const;
const sfx = (s: 1 | -1) => (s === 1 ? 'L' : 'R');
const TAIL = ['tail.1', 'tail.2', 'tail.3', 'tail.4', 'tail.5', 'tail.6', 'tail.7', 'tail.8'];
/** How far each tail joint turns the one before it at rest (degrees): undone to straighten it. */
const UNCOIL = [0, 32, 16, 17, 18, 17, 21, 28];
const SPEED = 1.0;

type Arm = [pitch: number, roll: number, elbow: number];
type TailMode = 'rest' | 'straight' | 'tight' | 'wave' | 'drag';

interface Want {
  armL: Arm;
  armR: Arm;
  head: [number, number, number];
  body: [number, number, number];
  /** 0..1: sitting on her haunches. */
  sit: number;
  lift: number;
  tail: TailMode;
  tailAmt: number;
  ears: [number, number];
  face: Expression | null;
  spin: number;
  /** How lit the tail's rings are: a function of (ring 0..3, time), else a gentle glow. */
  rings: ((i: number, t: number) => number) | null;
  warm: number;
  /** Sideways steps (degrees of yaw of the whole body against her way), for the hop-skip. */
  side: number;
}
const fresh = (): Want => ({
  armL: [0, 0, 0],
  armR: [0, 0, 0],
  head: [0, 0, 0],
  body: [0, 0, 0],
  sit: 0,
  lift: 0,
  tail: 'rest',
  tailAmt: 0,
  ears: [0, 0],
  face: null,
  spin: 0,
  rings: null,
  warm: 0,
  side: 0,
});

const mir = (a: Arm): Arm => [a[0], -a[1], a[2]];

export class Lemur extends Character {
  private want = fresh();
  private run = { n: 0, dir: 1 };
  private pokes: number[] = [];
  private hover = 0;
  private frame: Env['frame'] | null = null;

  constructor(model: Object3D) {
    const tail = (f: number) => ({ f, zeta: 0.35 });
    super(
      {
        name: 'Zesty',
        model: 'lemur',
        metres: 0.58,
        width: 0.5,
        size: 1.05,
        feels: {
          default: { f: 4.5, zeta: 0.6 },
          root: { f: 3, zeta: 0.6 },
          body: { f: 3.4, zeta: 0.55 },
          head: { f: 3.8, zeta: 0.5, r: 0.3 },
          'ear.L': { f: 5, zeta: 0.3 },
          'ear.R': { f: 5, zeta: 0.3 },
          'tail.1': tail(3),
          'tail.2': tail(3.4),
          'tail.3': tail(3.8),
          'tail.4': tail(4.2),
          'tail.5': tail(4.6),
          'tail.6': tail(5),
          'tail.7': tail(5.4),
          'tail.8': tail(5.8),
        },
        face: LEMUR_FACE,
        eyes: 0.86,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.8 },
          { bone: 'body', yaw: 0.2, pitch: 0 },
        ],
        reach: { yaw: 55, pitch: 28 },
        lag: 1.6,
        entrance: 'walk',
        edges: ['bottom', 'bottom', 'bottom', 'left', 'right'],
        stay: [45, 100],
        speed: SPEED,
        turn: 85,
      },
      model,
    );
    this.acts = this.moves();
  }

  private moves(): Record<string, Act> {
    const p = () => this.puppet;
    const w = () => this.want;
    const rest = () => !this.walking;
    const floor = () => !this.walking && this.edge === 'bottom';
    const wall = () => !this.walking && (this.edge === 'left' || this.edge === 'right');
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
      stroll: { weight: 3, length: [5, 7], when: floor, start: () => go(1.5, 3.5) },
      // Sits up with her arms wide and her belly to the light, tail curled round, eyes shut.
      sunbathe: {
        weight: 2.4,
        length: [10, 10],
        when: floor,
        pose: (t) => {
          const k = ramp(t, 0, 1.4) * (1 - ramp(t, 8.8, 10));
          w().sit = k;
          arms([-30 * k, 78 * k, -6 * k], mir([-30 * k, 78 * k, -6 * k]));
          p().add('body', -16 * k);
          w().head = [-24 * k, 6 * k * sin(t, 0.12), 0];
          w().tail = 'tight';
          w().tailAmt = 0.55 * k;
          w().warm = k;
          w().rings = (i, s) => 0.45 + 0.4 * k + 0.15 * Math.sin(s * 1.3 - i * 0.7);
          w().face = k > 0.7 ? 'sleepy' : 'happy';
        },
      },
      // A hop-skip sideways along the floor, tail bouncing.
      hopSkip: {
        weight: 1.8,
        length: [5, 5],
        when: floor,
        start: () => {
          this.run.dir = Math.random() < 0.5 ? -1 : 1;
          const far = Math.min(room(this.run.dir), this.heightPx * 1.6);
          this.walkTo(this.s + this.run.dir * far, this.depth);
        },
        pose: (t) => {
          const k = ramp(t, 0, 0.3);
          const ph = t * 8;
          w().lift = 0.045 * Math.max(0, Math.sin(ph)) * k;
          w().side = 70 * this.run.dir * k;
          arms(
            [-30 * k, 24 * k + 10 * Math.sin(ph), -20 * k],
            mir([-30 * k, 24 * k - 10 * Math.sin(ph), -20 * k]),
          );
          w().head = [0, -20 * this.run.dir * k, 0];
          w().tail = 'wave';
          w().tailAmt = 0.8 * k;
          w().face = 'happy';
          if (this.stride > 1) this.spec.speed = SPEED * 0.8;
          if (!this.walking && t > 0.8) this.actLength = Math.min(this.actLength, t + 0.4);
        },
      },
      // The tail sways and the dark rings light up one after another, along it and back.
      tailLights: {
        weight: 1.6,
        length: [5, 5],
        when: rest,
        pose: (t) => {
          const k = ramp(t, 0, 0.5) * (1 - ramp(t, 4.4, 5));
          w().tail = 'wave';
          w().tailAmt = 0.6 * k;
          w().rings = (i, s) => 0.12 + 0.88 * Math.max(0, Math.cos(s * 5 - i * 1.15));
          w().head = [0, 14 * sin(t, 0.4) * k, 0];
          w().ears = [8 * k * Math.abs(sin(t, 1.2)), 8 * k * Math.abs(sin(t, 1.2))];
          w().face = 'happy';
        },
      },
      // Wraps her tail round in front of her and hugs it.
      tailHug: {
        weight: 1.4,
        length: [6.5, 6.5],
        when: floor,
        pose: (t) => {
          const k = ramp(t, 0, 1.5) * (1 - ramp(t, 5.4, 6.5));
          w().tail = 'tight';
          w().tailAmt = k;
          arms([-60 * k, -22 * k, -75 * k], mir([-60 * k, -22 * k, -75 * k]));
          p().add('body', 6 * k);
          w().head = [10 * k, 8 * k * sin(t, 0.3), 12 * k];
          w().rings = (i, s) => 0.25 + 0.6 * k * (0.5 + 0.5 * Math.sin(s * 3 - i));
          w().face = k > 0.6 ? 'love' : 'happy';
        },
      },
      // Chatters: the ears flicking, head bobbing, hands busy.
      chatter: {
        weight: 1.2,
        length: [4, 4],
        when: rest,
        pose: (t) => {
          const k = ramp(t, 0, 0.4) * (1 - ramp(t, 3.4, 4));
          const s = Math.sin(t * 15);
          w().head = [5 * s * k, 12 * Math.sin(t * 2) * k, 0];
          w().ears = [30 * Math.max(0, s) * k, 30 * Math.max(0, -s) * k];
          arms([-30 * k, 14 * k, -70 * k], mir([-30 * k, 14 * k, -70 * k]));
          w().face = s > 0 ? 'surprised' : 'happy';
          w().tail = 'wave';
          w().tailAmt = 0.4 * k;
        },
      },
      // Scratches her head with one hand.
      scratch: {
        weight: 1.4,
        length: [5, 5],
        when: rest,
        start: () => (this.run.dir = Math.random() < 0.5 ? 1 : -1),
        pose: (t) => {
          const k = ramp(t, 0, 0.7) * (1 - ramp(t, 4.3, 5));
          const sc = Math.sin(t * 14);
          const head: Arm = [-135 * k, 14 * k, -125 * k + 18 * sc * k];
          if (this.run.dir === 1) arms(head, [0, 0, 0]);
          else arms([0, 0, 0], mir(head));
          w().head = [-6 * k, 0, 8 * k * this.run.dir];
          w().face = 'sheepish';
        },
      },
      // A jig: arms in the air, hips swinging, tail waving.
      jig: {
        weight: 1.2,
        length: [5, 5],
        when: floor,
        pose: (t) => {
          const k = ramp(t, 0, 0.6) * (1 - ramp(t, 4.4, 5));
          const s = Math.sin(t * 7);
          arms([-150 * k + 15 * s * k, 25 * k, 0], mir([-150 * k - 15 * s * k, 25 * k, 0]));
          w().body = [0, 8 * s * k, 0];
          w().head = [0, -8 * s * k, 6 * s * k];
          w().lift = 0.025 * k * Math.max(0, Math.sin(t * 7 + 1.5));
          w().ears = [14 * s * k, -14 * s * k];
          w().tail = 'wave';
          w().tailAmt = k;
          w().face = 'happy';
        },
      },
      // Curls up sitting with her tail over her like a blanket, and dozes.
      nap: {
        weight: 1.1,
        length: [9, 14],
        when: floor,
        pose: (t) => {
          const k = ramp(t, 0, 1.8);
          w().sit = k;
          p().add('body', 14 * k);
          arms([-20 * k, -10 * k, -60 * k], mir([-20 * k, -10 * k, -60 * k]));
          w().head = [24 * k, 0, 0];
          w().tail = 'tight';
          w().tailAmt = 0.9 * k;
          w().rings = () => 0.12;
          w().face = k > 0.8 ? 'asleep' : 'sleepy';
        },
      },
      // On a wall: clings, looks round, tail hooked.
      cling: {
        weight: 3,
        length: [4, 7],
        when: wall,
        pose: (t) => {
          const k = ramp(t, 0, 0.5);
          w().head = [-10 * k, 25 * Math.sin(t * 0.8) * k, 0];
          w().sit = 0.2;
          arms([-150 * k, 12 * k, -10 * k], mir([-150 * k, 12 * k, -10 * k]));
          w().tail = 'wave';
          w().tailAmt = 0.4 * k;
        },
      },
      climb: { weight: 3, length: [6, 8], when: wall, start: () => go(1.5, 3) },
      dizzy: {
        weight: 0,
        length: [4, 4],
        pose: (t) => {
          const k = 1 - ramp(t, 2.8, 4);
          w().spin = 2 * Math.PI * 2 * ramp(t, 0.2, 2.8);
          w().head = [0, 14 * Math.sin(t * 6) * k, 9 * Math.cos(t * 5) * k];
          arms([-20 * k, 30 * k, -30 * k], mir([-20 * k, 30 * k, -30 * k]));
          w().ears = [30 * k * Math.sin(t * 6), 30 * k * Math.sin(t * 6)];
          w().tail = 'wave';
          w().tailAmt = k;
          w().face = 'dizzy';
        },
      },
      startle: {
        weight: 0,
        length: [1.8, 1.8],
        pose: (t) => {
          const k = 1 - ramp(t, 0.8, 1.7);
          w().lift = t < 0.6 ? 0.1 * Math.sin((t / 0.6) * Math.PI) : 0;
          arms([-155 * k, 25 * k, 0], mir([-155 * k, 25 * k, 0]));
          w().ears = [30 * k, 30 * k];
          w().tail = 'straight';
          w().tailAmt = k;
          w().rings = (_i, s) => (s % 0.24 < 0.12 ? 1 : 0.2);
          w().face = 'surprised';
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
    } else if (this.act !== 'dizzy') this.setAct('startle');
  }

  protected onEnter() {
    this.spec.speed = SPEED;
  }

  protected idle(t: number) {
    const p = this.puppet;
    this.want = fresh();
    p.add('body', 1.2 * sin(t, 0.35));
    p.add('head', 1.5 * sin(t, 0.2), 4 * sin(t, 0.09), 0);
    p.add('ear.L', 0, 3 * sin(t, 0.3), 0);
    p.add('ear.R', 0, -3 * sin(t, 0.28, 0.2), 0);
    this.want.armL = [2 * sin(t, 0.3), 0, 0];
    this.want.armR = [2 * sin(t, 0.3, 0.3), 0, 0];
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    const w = this.want;
    this.frame = env.frame;
    this.spec.speed = SPEED;
    this.hover = this.hovered ? this.hover + dt : 0;
    if (this.hover > 0.9 && this.act === 'idle') this.setAct('chatter');
    const moving = clamp(this.stride / (SPEED * env.frame.bot * 0.9), 0, 1.5);
    const g = this.gait * 1.4;
    const wall = this.edge === 'left' || this.edge === 'right';

    const armL = [...w.armL] as Arm;
    const armR = [...w.armR] as Arm;
    let sink = 0;
    if (moving > 0.05) {
      const s = Math.sin(g);
      for (const side of SIDES) {
        const ph = side === 1 ? s : -s;
        const lift = Math.max(0, side === 1 ? Math.cos(g) : -Math.cos(g));
        if (wall) {
          p.add(`thigh.${sfx(side)}`, -25 * lift * moving, 0, 0);
          p.add(`shin.${sfx(side)}`, 30 * lift * moving, 0, 0);
        } else {
          p.add(`thigh.${sfx(side)}`, 30 * ph * moving, 0, 0);
          p.add(`shin.${sfx(side)}`, -24 * Math.max(0, -ph) * moving, 0, 0);
        }
      }
      if (wall) {
        armL[0] += (-50 + 45 * s) * moving;
        armR[0] += (-50 - 45 * s) * moving;
        armL[2] += -20 * moving;
        armR[2] += -20 * moving;
        p.add('body', 0, 0, 5 * s * moving);
      } else {
        armL[0] += -26 * s * moving;
        armR[0] += 26 * s * moving;
        p.add('body', 0, 6 * s * moving, 4 * Math.cos(g * 2) * moving);
        p.add('head', 0, -4 * s * moving, 0);
        sink += 0.008 * moving * (1 - Math.cos(g * 2));
      }
    }
    // Sitting: legs forward, the whole of her down.
    for (const side of SIDES) {
      const s = sfx(side);
      p.add(`thigh.${s}`, -80 * w.sit, 0, side * 8 * w.sit);
      p.add(`shin.${s}`, 78 * w.sit, 0, 0);
    }
    p.shift('root', 0, w.lift - 0.115 * w.sit - sink, 0);
    p.add('root', 0, w.side);
    p.add('head', w.head[0], w.head[1] - w.side * 0.3, w.head[2]);
    p.add('body', w.body[0], w.body[1], w.body[2]);
    p.add('arm.L', armL[0], 0, armL[1]);
    p.add('arm.R', armR[0], 0, armR[1]);
    p.add('forearm.L', armL[2], 0, 0);
    p.add('forearm.R', armR[2], 0, 0);
    p.add('ear.L', 0, -w.ears[0], 0);
    p.add('ear.R', 0, w.ears[1], 0);

    // The tail: held up in a question mark; or straight up, wrapped tight, waving, trailing.
    const walking = clamp(moving, 0, 1);
    TAIL.forEach((bone, i) => {
      let pitch = 0;
      let yaw = 0;
      let roll = 0;
      const a = w.tailAmt;
      switch (w.tail) {
        case 'wave':
          yaw = 24 * a * Math.sin(this.actT * 4 - i * 0.7);
          pitch = 7 * a * Math.sin(this.actT * 4 - i * 0.7 - 1);
          break;
        case 'tight':
          // Curls forward further and further: over her shoulder and round.
          pitch = (i === 0 ? 24 : 15 + 3 * i) * a;
          roll = i === 0 ? 0 : 0;
          break;
        case 'straight':
          pitch = (i === 0 ? 62 : -UNCOIL[i]) * a;
          break;
        case 'drag':
          pitch = (i === 0 ? -50 : -UNCOIL[i] * 0.7) * a;
          break;
        default:
          pitch = 1.5 * sin(env.time, 0.3, -i * 0.1);
          yaw = 3 * sin(env.time, 0.22, -i * 0.12);
      }
      // Walking: the tail bobs and sways, held high.
      yaw += 7 * walking * Math.sin(g - i * 0.8);
      pitch += 3 * walking * Math.cos(g * 2 - i * 0.6);
      p.add(bone, pitch, yaw, roll);
    });

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
    o.dot(0, asleep ? 0.1 : 0.3 + 0.2 * Math.sin(t * 1.5), tone);
    o.dot(1, asleep ? 0.1 : 0.3 + 0.2 * Math.sin(t * 1.5 + 1), tone);
    for (let i = 0; i < 4; i++) {
      const base = 0.35 + 0.25 * Math.sin(t * 1.6 - i * 0.9);
      const level = w.rings ? w.rings(i, t) : this.walking ? 0.5 + 0.4 * Math.sin(t * 6 - i) : base;
      o.dot(2 + i, clamp(asleep ? level * 0.5 : level, 0, 1));
    }
    o.dot(6, asleep ? 0.12 : clamp(0.4 + 0.4 * Math.sin(t * 2.2) + 0.3 * w.warm, 0, 1));
    o.beacon(BEACON[this.expression] ?? BEACON.neutral!);
  }
}
