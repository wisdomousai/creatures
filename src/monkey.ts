import type { Object3D } from 'three';
import { BEACON } from './bolt';
import { type Act, Character, clamp, type Env } from './character';
import type { Expression, FaceLayout } from './face';
import { ramp } from './kitties';
import { sin } from './moves';

/**
 * Bongo, the robot monkey: a pear-shaped toy on short legs with very long arms that reach
 * past the knees, a cream face plate with the screen set in it, two big dish ears with lit
 * discs, a winding key on his back and a long curly tail like a watch spring with a lit tip.
 *
 * He walks with a rolling swing of the arms, and goes up the side walls hand over hand. On
 * the top edge he hangs from his hands and feet, and can let go with everything but the
 * tail, uncurl it to the ceiling line, and swing from it. The pair of wind-up cymbals only
 * come out for the clash (shrunk to nothing otherwise).
 *
 * His acts: clashes the cymbals (the ear lights flash on the beat), scratches his head and
 * his armpit, drums his belly, jigs with his arms in the air, covers his eyes and peeks,
 * chatters with his ears flapping, winds and unwinds his tail, sits and yawns, naps.
 * A poke makes him jump with his arms up; three make him dizzy and he spins on the spot.
 */
export const MONKEY_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.3, 0.46],
    [0.7, 0.46],
  ],
  rx: 0.1,
  ry: 0.27,
  line: 0.036,
  mouth: [0.5, 0.8],
};

const SIDES = [1, -1] as const;
const sfx = (s: 1 | -1) => (s === 1 ? 'L' : 'R');
const TAIL = ['tail.1', 'tail.2', 'tail.3', 'tail.4', 'tail.5', 'tail.6'];
const DIP = 1.0;
/** How far each tail joint turns the one before it at rest (degrees): undone to straighten it. */
const UNCOIL = [0, 31, 36, 43, 48, 59];

interface Want {
  /** Arms by side: [pitch (- forward/up), roll (+ out), elbow bend (- bends forward)]. */
  armL: [number, number, number];
  armR: [number, number, number];
  head: [number, number, number];
  body: [number, number, number];
  /** 0..1: sunk down on bent legs, legs folded up (hanging), cymbals out. */
  crouch: number;
  fold: number;
  cymbals: number;
  lift: number;
  /** Tail: 'rest' | 'wag' | 'hang' | 'wind'; amount. */
  tail: 'rest' | 'wave' | 'hang' | 'wind';
  tailAmt: number;
  ears: [number, number];
  face: Expression | null;
  spin: number;
  swing: number;
  flash: number;
}
const fresh = (): Want => ({
  armL: [0, 0, 0],
  armR: [0, 0, 0],
  head: [0, 0, 0],
  body: [0, 0, 0],
  crouch: 0,
  fold: 0,
  cymbals: 0,
  lift: 0,
  tail: 'rest',
  tailAmt: 0,
  ears: [0, 0],
  face: null,
  spin: 0,
  swing: 0,
  flash: 0,
});

export class Monkey extends Character {
  private want = fresh();
  private run = { n: 0, dir: 1 };
  private pokes: number[] = [];
  private hover = 0;
  private clap = 0;
  private cym = 0;
  private frame: Env['frame'] | null = null;

  constructor(model: Object3D) {
    super(
      {
        name: 'Bongo',
        model: 'monkey',
        metres: 0.56,
        width: 0.55,
        size: 1.0,
        feels: {
          default: { f: 4.5, zeta: 0.6 },
          root: { f: 3, zeta: 0.6 },
          body: { f: 3.2, zeta: 0.55 },
          head: { f: 3.6, zeta: 0.5, r: 0.3 },
          'ear.L': { f: 5, zeta: 0.3 },
          'ear.R': { f: 5, zeta: 0.3 },
          'tail.1': { f: 3, zeta: 0.35 },
          'tail.2': { f: 3.4, zeta: 0.35 },
          'tail.3': { f: 3.8, zeta: 0.35 },
          'tail.4': { f: 4.2, zeta: 0.35 },
          'tail.5': { f: 4.6, zeta: 0.35 },
          'tail.6': { f: 5, zeta: 0.35 },
        },
        face: MONKEY_FACE,
        eyes: 0.8,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.8 },
          { bone: 'body', yaw: 0.2, pitch: 0 },
        ],
        reach: { yaw: 55, pitch: 28 },
        lag: 1.8,
        entrance: 'walk',
        edges: ['bottom', 'bottom', 'bottom', 'left', 'right', 'top'],
        stay: [45, 100],
        speed: DIP,
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
    const top = () => !this.walking && this.edge === 'top';
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
    const arms = (l: Want['armL'], r: Want['armR']) => {
      w().armL = l;
      w().armR = r;
    };
    return {
      idle: { weight: 3, length: [2.5, 5] },
      stroll: { weight: 3, length: [5, 7], when: rest, start: () => go(1.5, 3.5) },
      // The cymbals come out; a clash in front of the chest on every beat, ears flashing.
      clash: {
        weight: 2,
        length: [6.5, 6.5],
        when: rest,
        start: () => (this.clap = 0),
        pose: (t) => {
          const k = ramp(t, 0, 0.6) * (1 - ramp(t, 5.8, 6.4));
          w().cymbals = ramp(t, 0.1, 0.5) * (1 - ramp(t, 6, 6.4));
          const beat = t > 0.9 && t < 5.6 ? (t - 0.9) / 0.62 : 0;
          const c = beat - Math.floor(beat);
          // Apart on the up beat, together on the clash.
          const clash = beat > 0 ? Math.exp(-c * 7) : 0;
          const reach = 1 - (beat > 0 ? Math.min(1, clash * 1.4) : 0);
          arms(
            [-75 * k, -12 * k + 35 * k * reach, -40 * k],
            [-75 * k, -12 * k + 35 * k * reach, -40 * k],
          );
          // `roll` is out (+) for the left, so the right is the mirror.
          w().armR = [w().armR[0], -w().armR[1], w().armR[2]];
          w().head = [-4 * k, 6 * Math.sin(t * 5) * k, 5 * Math.sin(t * 5) * k];
          w().body = [0, 0, 3 * Math.sin(t * 5) * k];
          w().ears = [20 * clash, 20 * clash];
          w().flash = clash;
          w().face = 'happy';
          w().crouch = 0.1 * clash;
          if (beat > 0 && Math.floor(beat) !== this.clap) {
            this.clap = Math.floor(beat);
            p().kick('head', -60);
            p().kick('ear.L', 0, 200);
            p().kick('ear.R', 0, -200);
          }
        },
      },
      // Scratches his head with one hand and his armpit with the other.
      scratch: {
        weight: 2,
        length: [5, 5],
        when: rest,
        start: () => (this.run.dir = Math.random() < 0.5 ? 1 : -1),
        pose: (t) => {
          const k = ramp(t, 0, 0.7) * (1 - ramp(t, 4.3, 5));
          const sc = Math.sin(t * 14);
          const head: Want['armL'] = [-130 * k, 14 * k, -125 * k + 18 * sc * k];
          const pit: Want['armL'] = [-30 * k, 24 * k - 24 * Math.abs(sc) * k, -110 * k];
          const mir = (v: Want['armL']): Want['armR'] => [v[0], -v[1], v[2]];
          if (this.run.dir === 1) arms(head, mir(pit));
          else arms(pit, mir(head));
          w().head = [-6 * k, 0, 8 * k * this.run.dir];
          w().body = [0, 0, -3 * sc * k];
          w().face = 'sheepish';
        },
      },
      // Drums on his belly with both fists, the beacon flashing on every hit.
      drum: {
        weight: 1.4,
        length: [5, 5],
        when: floor,
        pose: (t) => {
          const k = ramp(t, 0, 0.6) * (1 - ramp(t, 4.3, 5));
          const u = (t * 3.2) % 1;
          const hit = Math.exp(-u * 8);
          const l = Math.floor(t * 3.2) % 2 === 0 ? 1 : 0;
          const a = (on: number): Want['armL'] => [-55 * k - 20 * hit * k * on, -34 * k, -85 * k];
          arms(a(l), a(1 - l));
          w().armR = [w().armR[0], -w().armR[1], w().armR[2]];
          w().head = [-8 * k, 0, 0];
          w().ears = [8 * hit, 8 * hit];
          w().flash = hit * k;
          w().crouch = 0.1 * k;
          w().face = 'happy';
          w().tail = 'wave';
          w().tailAmt = k;
        },
      },
      // A jig: arms in the air, hips swinging, ears bouncing.
      jig: {
        weight: 1.4,
        length: [5.5, 5.5],
        when: floor,
        pose: (t) => {
          const k = ramp(t, 0, 0.6) * (1 - ramp(t, 4.8, 5.5));
          const s = Math.sin(t * 7);
          arms([-150 * k + 15 * s * k, 25 * k, 0], [-150 * k - 15 * s * k, -25 * k, 0]);
          w().body = [0, 8 * s * k, 0];
          w().head = [0, -8 * s * k, 6 * s * k];
          w().crouch = 0.25 * k * Math.abs(s);
          w().lift = 0.02 * k * Math.max(0, Math.sin(t * 7 + 1.5));
          w().ears = [14 * s * k, -14 * s * k];
          w().tail = 'wave';
          w().tailAmt = k;
          w().face = 'happy';
        },
      },
      // Hands over his eyes; a long wait; then spreads them. Peekaboo.
      peek: {
        weight: 1.2,
        length: [5, 5],
        when: rest,
        pose: (t) => {
          const cover = ramp(t, 0.2, 0.9) * (1 - ramp(t, 3.2, 3.5));
          const open = ramp(t, 3.5, 3.7) * (1 - ramp(t, 4.4, 4.8));
          arms(
            [-122 * cover + 20 * open, -4 * cover - 40 * open, -118 * cover],
            [-122 * cover + 20 * open, -4 * cover - 40 * open, -118 * cover],
          );
          w().armR = [w().armR[0], -w().armR[1], w().armR[2]];
          w().head = [4 * cover, 0, 0];
          w().ears = [-14 * cover, -14 * cover];
          w().face = cover > 0.5 ? 'sheepish' : 'happy';
          w().tail = 'wave';
          w().tailAmt = open;
        },
      },
      // Chatters: the head bobbing, ears flapping, the lights all going.
      chatter: {
        weight: 1.2,
        length: [4, 4],
        when: rest,
        pose: (t) => {
          const k = ramp(t, 0, 0.4) * (1 - ramp(t, 3.4, 4));
          const s = Math.sin(t * 16);
          w().head = [6 * s * k, 10 * Math.sin(t * 2.2) * k, 0];
          w().ears = [34 * Math.max(0, s) * k, 34 * Math.max(0, -s) * k];
          w().face = Math.sin(t * 16) > 0 ? 'surprised' : 'happy';
          w().flash = 0.6 * k * Math.max(0, s);
          arms([-30 * k, 12 * k, -60 * k], [-30 * k, -12 * k, -60 * k]);
        },
      },
      // Winds the tail round into a tight spring, then lets it spring open.
      tailWind: {
        weight: 1.2,
        length: [5, 5],
        when: rest,
        pose: (t) => {
          const k = ramp(t, 0, 2) * (1 - ramp(t, 3.2, 3.4));
          w().tail = 'wind';
          w().tailAmt = k + 0.4 * ramp(t, 3.4, 3.6) * (1 - ramp(t, 3.6, 5));
          w().head = [0, 20 * k, 0];
          w().face = t < 3.4 ? 'focused' : 'happy';
          w().body = [0, 0, 4 * Math.sin(t * 22) * ramp(t, 3.4, 3.6) * (1 - ramp(t, 3.6, 4.4))];
        },
      },
      // Sits down, yawns behind a hand, and nods off.
      nap: {
        weight: 1.2,
        length: [8, 14],
        when: floor,
        pose: (t) => {
          const k = ramp(t, 0, 1.5);
          w().crouch = 0.9 * k;
          w().head = [14 * k, 0, 0];
          arms([-20 * k, 10 * k, -50 * k], [-20 * k, -10 * k, -50 * k]);
          w().face = k > 0.8 ? 'asleep' : 'sleepy';
          w().tailAmt = 0;
        },
      },
      // On a wall: clings, looks round, scratches.
      cling: {
        weight: 3,
        length: [4, 7],
        when: wall,
        pose: (t) => {
          const k = ramp(t, 0, 0.5);
          w().head = [-10 * k, 25 * Math.sin(t * 0.8) * k, 0];
          w().crouch = 0.2;
          arms([-150 * k, 12 * k, -10 * k], [-150 * k, -12 * k, -10 * k]);
          w().tail = 'wave';
          w().tailAmt = 0.4 * k;
        },
      },
      // On a wall: climbs hand over hand.
      climb: { weight: 3, length: [6, 8], when: wall, start: () => go(1.5, 3) },
      // On the ceiling: lets go of everything but the tail and hangs from it, then swings.
      hangTail: {
        weight: 3,
        length: [9, 9],
        when: top,
        pose: (t) => {
          const k = ramp(t, 0, 1.2) * (1 - ramp(t, 8, 8.8));
          w().fold = k;
          w().tail = 'hang';
          w().tailAmt = k;
          const swing = Math.sin(t * 2.1) * ramp(t, 1.4, 3) * (1 - ramp(t, 7, 8.4));
          w().swing = swing;
          // Lets go with both hands: the arms float up over his head (down on the screen).
          arms(
            [-165 * k + 10 * swing * k, 12 * k, -25 * k],
            [-165 * k - 10 * swing * k, -12 * k, -25 * k],
          );
          w().head = [0, 0, 6 * swing];
          w().face = 'happy';
          w().ears = [10 * k * Math.abs(swing), 10 * k * Math.abs(swing)];
        },
      },
      // On the ceiling: swings along it hand over hand.
      brachiate: { weight: 2, length: [6, 8], when: top, start: () => go(1.5, 3.5) },
      topLook: {
        weight: 2,
        length: [4, 6],
        when: top,
        pose: (t) => {
          w().head = [0, 28 * Math.sin(t * 0.9), 0];
          w().tail = 'wave';
          w().tailAmt = 0.4;
        },
      },
      dizzy: {
        weight: 0,
        length: [4, 4],
        pose: (t) => {
          const k = 1 - ramp(t, 2.8, 4);
          w().spin = 2 * Math.PI * 2 * ramp(t, 0.2, 2.8);
          w().head = [0, 14 * Math.sin(t * 6) * k, 9 * Math.cos(t * 5) * k];
          arms([-20 * k, 30 * k, -30 * k], [-20 * k, -30 * k, -30 * k]);
          w().ears = [30 * k * Math.sin(t * 6), 30 * k * Math.sin(t * 6)];
          w().face = 'dizzy';
        },
      },
      startle: {
        weight: 0,
        length: [1.8, 1.8],
        pose: (t) => {
          const k = 1 - ramp(t, 0.8, 1.7);
          w().lift = t < 0.6 ? 0.1 * Math.sin((t / 0.6) * Math.PI) : 0;
          arms([-155 * k, 25 * k, 0], [-155 * k, -25 * k, 0]);
          w().ears = [30 * k, 30 * k];
          w().tail = 'wave';
          w().tailAmt = k;
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
    } else if (this.act !== 'dizzy') {
      this.setAct('startle');
      this.want.flash = 1;
    }
  }

  protected onEnter() {
    this.spec.speed = DIP;
  }

  protected idle(t: number) {
    const p = this.puppet;
    this.want = fresh();
    p.add('body', 1.2 * sin(t, 0.35));
    p.add('head', 1.5 * sin(t, 0.2), 4 * sin(t, 0.09), 0);
    p.add('ear.L', 0, 3 * sin(t, 0.3), 0);
    p.add('ear.R', 0, -3 * sin(t, 0.28, 0.2), 0);
    // The arms hang and sway a little.
    this.want.armL = [2 * sin(t, 0.3), 0, 0];
    this.want.armR = [2 * sin(t, 0.3, 0.3), 0, 0];
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    const w = this.want;
    const act = this.act;
    this.frame = env.frame;
    this.hover = this.hovered ? this.hover + dt : 0;
    if (this.hover > 0.9 && act === 'idle') this.setAct('chatter');
    const edge = this.edge;
    const moving = clamp(this.stride / (DIP * env.frame.bot * 0.9), 0, 1.5);
    const g = this.gait * 1.4;
    const wall = edge === 'left' || edge === 'right';
    const ceiling = edge === 'top';

    // The walk: legs swing opposite, arms swing against them, body rolls.
    let crouch = w.crouch;
    const armL = [...w.armL] as Want['armL'];
    const armR = [...w.armR] as Want['armR'];
    let swing = 0;
    if (moving > 0.05) {
      const s = Math.sin(g);
      for (const side of SIDES) {
        const ph = side === 1 ? s : -s;
        const lift = Math.max(0, side === 1 ? Math.cos(g) : -Math.cos(g));
        if (wall || ceiling) {
          // Hand over hand: arms reach up and pull, feet follow.
          p.add(`thigh.${sfx(side)}`, -25 * lift * moving, 0, 0);
          p.add(`shin.${sfx(side)}`, 30 * lift * moving, 0, 0);
        } else {
          p.add(`thigh.${sfx(side)}`, 28 * ph * moving, 0, 0);
          p.add(`shin.${sfx(side)}`, -22 * Math.max(0, -ph) * moving, 0, 0);
        }
      }
      if (wall || ceiling) {
        armL[0] += (-50 + 45 * Math.sin(g)) * moving;
        armR[0] += (-50 - 45 * Math.sin(g)) * moving;
        armL[2] += -20 * moving;
        armR[2] += -20 * moving;
        p.add('body', 0, 0, 5 * s * moving);
      } else {
        armL[0] += -30 * s * moving;
        armR[0] += 30 * s * moving;
        p.add('body', 0, 6 * s * moving, 4 * Math.cos(g * 2) * moving);
        p.add('head', 0, -4 * s * moving, 0);
        crouch += 0.1 * moving * (1 - Math.cos(g * 2));
      }
      swing = 0;
    }
    // On the ceiling at rest the hands and feet grip; the arms reach to the line.
    this.spec.speed = DIP;

    // Folded legs when hanging by the tail.
    for (const side of SIDES) {
      const s = sfx(side);
      p.add(`thigh.${s}`, -50 * crouch - 70 * w.fold, 0, side * 6 * w.fold);
      p.add(`shin.${s}`, 80 * crouch + 100 * w.fold, 0, 0);
    }
    // Hanging by the tail he drops away from the ceiling line, the tail taking his weight.
    p.shift('root', 0, w.lift - 0.04 * crouch + 0.14 * w.fold, 0);
    p.add('body', 10 * crouch + 0 * swing);
    p.add('head', w.head[0] - 6 * crouch, w.head[1], w.head[2]);
    p.add('body', w.body[0], w.body[1], w.body[2]);
    // Arms: pitch (negative forward/up), roll (+ out for the left), the elbow.
    p.add('arm.L', armL[0], 0, armL[1]);
    p.add('arm.R', armR[0], 0, armR[1]);
    p.add('forearm.L', armL[2], 0, 0);
    p.add('forearm.R', armR[2], 0, 0);
    // Ears.
    p.add('ear.L', 0, -w.ears[0], 0);
    p.add('ear.R', 0, w.ears[1], 0);

    // The tail.
    const walking = clamp(moving, 0, 1);
    TAIL.forEach((bone, i) => {
      let pitch = 0;
      let yaw = 0;
      switch (w.tail) {
        case 'wave':
          yaw = 22 * w.tailAmt * Math.sin(this.actT * 4 - i * 0.7);
          pitch = 8 * w.tailAmt * Math.sin(this.actT * 4 - i * 0.7 - 1);
          break;
        case 'wind':
          // A tighter spring: every joint curls further forward.
          pitch = 24 * w.tailAmt + 6 * w.tailAmt * i;
          yaw = 0;
          break;
        case 'hang':
          // Straightens down to the ceiling line and hooks over it at the tip.
          pitch = ((i === 0 ? -95 : -UNCOIL[i]) + (i >= 4 ? 50 : 0)) * w.tailAmt;
          break;
        default:
          pitch = 1.5 * sin(env.time, 0.3, -i * 0.1);
          yaw = 3 * sin(env.time, 0.22, -i * 0.12);
      }
      yaw += 6 * walking * Math.sin(g - i * 0.8);
      p.add(bone, pitch, yaw, 0);
    });

    if (w.face) this.expression = w.face;
    else this.expression = this.hovered ? 'happy' : 'neutral';
    this.cym += ((w.cymbals > 0.05 ? 1 : 0) - this.cym) * Math.min(1, dt * 14);
    w.flash = Math.max(0, w.flash - 0.0);
    this.swinging = w.swing;
  }

  private swinging = 0;

  protected after(_dt: number, env: Env) {
    const p = this.puppet;
    const w = this.want;
    const o = this.outfit;
    // The cymbals: out only for the clash.
    const c = Math.max(0.001, this.cym * w.cymbals);
    for (const s of ['cymbal.L', 'cymbal.R']) p.stretch(s, c, [1, 0, 0], c);
    this.pivot.rotation.y = w.spin;
    // Swinging from the tail: the whole body swings about the ceiling line.
    if (this.edge === 'top') this.pivot.rotation.z = (this.swinging * 18 * Math.PI) / 180;
    else this.pivot.rotation.z = 0;
    if (!o) return;
    const t = env.time;
    const asleep = this.expression === 'asleep';
    const tone = BEACON[this.expression];
    o.dot(0, asleep ? 0.1 : clamp(0.3 + 0.7 * w.flash, 0, 1), tone);
    o.dot(1, asleep ? 0.1 : clamp(0.3 + 0.7 * w.flash, 0, 1), tone);
    o.dot(
      2,
      asleep
        ? 0.15
        : clamp(0.3 + 0.4 * Math.sin(t * 2) + (this.act === 'tailWind' ? 0.4 : 0), 0, 1),
    );
    o.dot(3, clamp(0.4 + 0.6 * w.flash, 0, 1), '#ffe08a');
    o.beacon(BEACON[this.expression] ?? BEACON.neutral!);
  }
}
