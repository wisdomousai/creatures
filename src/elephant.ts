import type { Object3D } from 'three';
import { BEACON } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { Expression, FaceLayout } from './face';
import { sin } from './moves';
import { type Anatomy, type Feeling, type Mood, Pet } from './pet';

/**
 * Mist, the robot baby elephant: a round toy calf on stubby legs and big round feet, a big
 * round head with a screen for eyes, dish ear flaps on hinges (lit rims), a trunk in four
 * segments on ball joints that ends in a lit tip, tusk nubs, and a thin tail with a lit
 * tuft. She is a Pet (walks, sits, lies, naps) with the trunk doing most of the talking:
 * it sways, curls, waves and sniffs the floor; she trumpets with it raised, sprays a
 * fountain of light drops that rain back down on her, flaps her ears to cool off, stomps,
 * hides behind her ears, and sits down on her bottom with a thump.
 *
 * What she feels shows in her ears and trunk: ears wide and a trunk curled up when happy,
 * ears pinned back and the trunk tucked when sad or startled. The six drops are on bones of
 * their own (spray.1..6) and are shrunk to nothing until she sprays.
 */
export const ELEPHANT_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.3, 0.5],
    [0.7, 0.5],
  ],
  rx: 0.09,
  ry: 0.28,
  line: 0.035,
  mouth: null,
};

const TRUNK = ['trunk.1', 'trunk.2', 'trunk.3', 'trunk.4'] as const;
const LEGS = ['leg.FL', 'leg.FR', 'leg.BL', 'leg.BR'];
const DEG = Math.PI / 180;
/** The trunk's segments in character space, (up, front) metres, and the first joint. */
const SEG: [number, number][] = [
  [-0.08, 0.04],
  [-0.075, 0.035],
  [-0.075, 0.025],
  [-0.065, 0.005],
];
const JOINT: [number, number] = [0.345, 0.365];
const HEAD_JOINT: [number, number] = [0.3, 0.15];
/** Where the spray bones rest (up, front), and their count. */
const REST: [number, number] = [0.35, 0.5];
const DROPS = 6;

const ease = (t: number, a: number, b: number) => {
  const u = clamp((t - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
};
const pulse = (t: number, at: number, length: number) =>
  t > at && t < at + length ? Math.sin(((t - at) / length) * Math.PI) : 0;

const ELEPHANT: Anatomy = {
  tail: ['tail.1', 'tail.2'],
  tailAxis: [0, 0.6, -0.8],
  earsHang: true,
  moods: {
    calm: { face: 'neutral', carriage: -15, wag: [10, 0.8], ears: 0, out: 0, swivel: 0 },
    curious: { face: 'neutral', carriage: 5, wag: [6, 1.6], ears: 4, out: 6, swivel: 0 },
    happy: { face: 'happy', carriage: 10, wag: [26, 2.4], ears: 0, out: 0, swivel: 0 },
    love: { face: 'love', carriage: 15, wag: [30, 3], ears: 0, out: 0, swivel: 0 },
    alarmed: { face: 'surprised', carriage: 30, ears: 0, out: 0, swivel: 0 },
    annoyed: { face: 'cross', carriage: -10, wag: [20, 3.4], ears: 0, out: 0, swivel: 0 },
    sad: { face: 'sad', carriage: -55, ears: 0, out: 0, swivel: 0 },
    sleepy: { face: 'sleepy', carriage: -40, wag: [4, 0.4], ears: 0, out: 0, swivel: 0 },
    asleep: { face: 'asleep', carriage: -50, flicks: 0.1, ears: 0, out: 0, swivel: 0 },
  },
  actMoods: {
    startle: 'alarmed',
    toot: 'alarmed',
    trumpet: 'happy',
    spray: 'happy',
    flapEars: 'sleepy',
    stomp: 'annoyed',
    plop: 'happy',
    trunkWave: 'happy',
    sniff: 'curious',
    peekaboo: 'happy',
    trunkCurl: 'love',
    shower: 'happy',
    yawn: 'sleepy',
    stretch: 'sleepy',
    nap: 'asleep',
    dizzy: 'annoyed',
  } satisfies Record<string, Mood>,
  lying: 'sleepy',
  hover: 'love',
  drop: { stand: 0, sit: -0.09, lie: -0.12 },
  sit: -14,
  turn: 45,
};

/** What the trunk and ears should do this frame: set by acts, reset in idle. */
interface Want {
  /** Pitch per trunk segment (degrees; + curls back under, - lifts forward and up). */
  pitch: [number, number, number, number];
  roll: [number, number, number, number];
  /** Ear spread (+ out, - pinned back), each side, and an added flap. */
  spread: number;
  flap: [number, number];
  face: Expression | null;
  spin: number;
}
const fresh = (): Want => ({
  pitch: [0, 0, 0, 0],
  roll: [0, 0, 0, 0],
  spread: 0,
  flap: [0, 0],
  face: null,
  spin: 0,
});

export class Elephant extends Pet {
  protected readonly anatomy: Anatomy = { ...ELEPHANT, drop: { ...ELEPHANT.drop } };
  private want = fresh();
  private env!: Env;
  private run = { done: false, n: 0, dir: 1 };
  /** Spray: how hard, and the drops (age in s, launch point and speed in character space). */
  private spraying = 0;
  private lastDrop = 0;
  private nextDrop = 0;
  private drops: {
    at: number;
    y: number;
    z: number;
    x: number;
    vy: number;
    vz: number;
    vx: number;
  }[] = Array.from({ length: DROPS }, () => ({ at: -10, y: 0, z: 0, x: 0, vy: 0, vz: 0, vx: 0 }));
  private flash = 0;
  private lampColour = '#f4f4f1';

  constructor(model: Object3D) {
    const trunk = (f: number) => ({ f, zeta: 0.42 });
    super(
      {
        name: 'Mist',
        model: 'elephant',
        metres: 0.62,
        width: 0.7,
        size: 1.25,
        feels: {
          default: { f: 2.8, zeta: 0.55 },
          root: { f: 3, zeta: 0.55 },
          body: { f: 2.4, zeta: 0.6 },
          head: { f: 2.2, zeta: 0.5, r: 0.3 },
          'ear.L': { f: 3.6, zeta: 0.28 },
          'ear.R': { f: 3.6, zeta: 0.28 },
          'trunk.1': trunk(2.6),
          'trunk.2': trunk(3),
          'trunk.3': trunk(3.4),
          'trunk.4': trunk(3.8),
          'tail.1': { f: 2.2, zeta: 0.4 },
          'tail.2': { f: 2.8, zeta: 0.3 },
        },
        face: ELEPHANT_FACE,
        eyes: 0.72,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.8 },
          { bone: 'body', yaw: 0.2, pitch: 0 },
        ],
        reach: { yaw: 55, pitch: 28 },
        lag: 1,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 1.1,
      },
      model,
    );
    this.acts = { ...this.commonActs(), ...this.mine() };
    this.acts.stretch = { ...this.acts.stretch, pose: () => this.stretching() };
  }

  private get standing() {
    return this.posture === 'stand' && !this.walking;
  }

  private stretching() {
    this.bow();
    this.want.pitch = [-30, -30, -20, -10];
  }

  /** Trunk helpers for the acts. */
  private trunk(pitch: number[], roll: number[] = [0, 0, 0, 0], k = 1) {
    for (let i = 0; i < 4; i++) {
      this.want.pitch[i] += (pitch[i] ?? 0) * k;
      this.want.roll[i] += (roll[i] ?? 0) * k;
    }
  }

  private mine(): Record<string, Act> {
    const p = () => this.puppet;
    const w = () => this.want;
    const stand = () => this.standing;
    const still = () => !this.walking;
    return {
      // Trunk up, head back, ears wide: TOOT, twice, with a hop and a flash of the lamp.
      trumpet: {
        weight: 1.6,
        length: [5, 5],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.run = { done: false, n: 0, dir: 1 };
        },
        pose: (t) => {
          const up = ease(t, 0, 0.9) * (1 - ease(t, 4.1, 4.9));
          const toot = Math.max(pulse(t, 1.2, 0.7), pulse(t, 2.4, 0.9));
          this.trunk([-40, -40, -34, -26], [0, 0, 0, 0], up);
          p().add('head', -16 * up - 6 * toot);
          p().add('body', -8 * up);
          w().spread = 30 * up + 20 * toot;
          this.frontLegsUp(-14 * up);
          if (t > 1.2 && this.run.n === 0) {
            this.run.n = 1;
            this.hop.kick(1.5);
            this.flash = 1;
          }
          if (t > 2.4 && this.run.n === 1) {
            this.run.n = 2;
            this.hop.kick(1.9);
            this.flash = 1;
          }
          w().face = toot > 0.2 ? 'surprised' : 'happy';
          p().add('trunk.4', 12 * toot * sin(t, 9));
        },
      },
      // A small startled toot: what a poke gets.
      toot: {
        weight: 0,
        length: [2.6, 2.6],
        start: () => {
          this.posture = 'stand';
          this.hop.kick(2.2);
          this.flash = 1;
        },
        pose: (t) => {
          const up = ease(t, 0, 0.25) * (1 - ease(t, 1.4, 2.2));
          this.trunk([-45, -40, -30, -20], [0, 0, 0, 0], up);
          w().spread = 40 * up;
          p().add('head', -10 * up);
          w().face = 'surprised';
        },
      },
      // A fountain: trunk straight up, a spray of light drops that rain back on her head.
      spray: {
        weight: 1.7,
        length: [6, 6],
        when: stand,
        start: () => (this.posture = 'stand'),
        pose: (t) => {
          const up = ease(t, 0, 0.8) * (1 - ease(t, 4.8, 5.6));
          this.trunk([-48, -44, -40, -38], [0, 0, 0, 0], up);
          p().add('head', -8 * up);
          w().spread = 12 * up;
          this.spraying = t > 0.9 && t < 4.7 ? 1 : 0;
          w().face = this.spraying ? 'happy' : 'neutral';
          if (this.spraying) p().add('trunk.3', 5 * sin(t, 4.5));
          // Shakes her head under the shower at the end.
          if (t > 4.7) p().add('head', 0, 18 * sin(t, 2.5) * (1 - ease(t, 5.4, 6)));
        },
      },
      // Flaps her ears fast to cool off, trunk drooping, a little pant of the lamp.
      flapEars: {
        weight: 1.5,
        length: [5.5, 5.5],
        when: still,
        pose: (t) => {
          const k = ease(t, 0, 0.5) * (1 - ease(t, 4.8, 5.5));
          const f = Math.sin(t * 2 * Math.PI * 2.6);
          w().spread = 10 * k;
          w().flap = [-34 * k * f, 34 * k * f];
          p().add('head', 4 * k, 0, 3 * k * sin(t, 1.3));
          this.trunk([14, 14, 10, 6], [], k);
          w().face = 'sleepy';
          this.flash = Math.max(this.flash, 0.4 * k * Math.max(0, f));
        },
      },
      // Stomps her front feet in turn, ears pinned out, trunk swinging: a little tantrum.
      stomp: {
        weight: 1,
        length: [4.4, 4.4],
        when: stand,
        pose: (t) => {
          const k = ease(t, 0, 0.4) * (1 - ease(t, 3.8, 4.4));
          const s = Math.sin(t * 2 * Math.PI * 1.4);
          p().add('leg.FL', -30 * Math.max(0, s) * k);
          p().add('leg.FR', -30 * Math.max(0, -s) * k);
          if (Math.abs(s) > 0.97 && this.run.n !== Math.sign(s)) {
            this.run.n = Math.sign(s);
            this.hop.kick(0.7);
          }
          w().spread = 22 * k;
          this.trunk([-10, -6, 0, 0], [8 * s, 10 * s, 12 * s, 14 * s], k);
          p().add('head', 6 * k, 0, 4 * s * k);
          w().face = 'cross';
        },
      },
      // Sits down on her bottom with a thump, legs out in front, and waves her trunk.
      plop: {
        weight: 1.3,
        length: [6.5, 6.5],
        when: stand,
        start: () => {
          this.posture = 'sit';
          this.puppet.kick('body', 70);
          this.puppet.kick('head', -60);
          this.hop.kick(1.2);
        },
        pose: (t) => {
          const k = ease(t, 0.6, 1.2) * (1 - ease(t, 5.6, 6.4));
          this.trunk(
            [10, 10, 8, 6],
            [10 * sin(t, 0.9), 14 * sin(t, 0.9, 0.1), 16 * sin(t, 0.9, 0.2), 18 * sin(t, 0.9, 0.3)],
            k,
          );
          w().flap = [-12 * k * sin(t, 1.1), 12 * k * sin(t, 1.1)];
          w().face = 'happy';
          if (t > 5.8) this.posture = 'stand';
        },
      },
      // A trunk wave hello, side to side.
      trunkWave: {
        weight: 1.4,
        length: [4.5, 4.5],
        when: still,
        pose: (t) => {
          const k = ease(t, 0, 0.7) * (1 - ease(t, 3.7, 4.5));
          this.trunk([-34, -26, -16, -8], [], k);
          const s = sin(t, 1.5);
          this.trunk([0, 0, 0, 0], [6 * s, 14 * s, 22 * s, 30 * s], k);
          w().spread = 10 * k;
          p().add('head', 0, 8 * s * k, 0);
          w().face = 'happy';
        },
      },
      // Trunk to the floor: sniffs along it, head low, ears forward.
      sniff: {
        weight: 1.4,
        length: [5.5, 5.5],
        when: stand,
        pose: (t) => {
          const k = ease(t, 0, 0.8) * (1 - ease(t, 4.7, 5.5));
          const s = sin(t, 1.1);
          p().add('head', 22 * k);
          p().add('body', 8 * k);
          this.trunk([12, 8, -6, -18], [0, 0, 0, 0], k);
          p().add('trunk.4', 10 * Math.max(0, sin(t, 3.2)) * k);
          p().add('head', 0, 20 * s * k);
          w().spread = -6 * k;
          this.eyes = null;
        },
      },
      // Curls her trunk into a tight spiral in front of her and looks at the tip, cross-eyed.
      trunkCurl: {
        weight: 1,
        length: [5, 5],
        when: still,
        pose: (t) => {
          const k = ease(t, 0, 1.2) * (1 - ease(t, 4, 4.9));
          this.trunk([-30, -48, -62, -70], [0, 0, 0, 0], k);
          p().add('head', 14 * k);
          w().face = t > 1.5 && t < 3.8 ? 'cross' : 'happy';
          this.flash = Math.max(this.flash, 0.5 * k);
        },
      },
      // Hides behind her ears: both flaps swing forward over her face, then peekaboo.
      peekaboo: {
        weight: 0.9,
        length: [5, 5],
        when: still,
        pose: (t) => {
          const hide = ease(t, 0.3, 1) * (1 - ease(t, 3, 3.3));
          w().spread = -52 * hide;
          this.trunk([6, 6, 4, 2], [], hide);
          p().add('head', 10 * hide);
          w().face = t < 3.3 ? 'sheepish' : 'happy';
          if (t > 3.3) w().spread = 40 * ease(t, 3.3, 3.5) * (1 - ease(t, 3.8, 4.6));
        },
      },
      // Pats her own head with her trunk tip, pleased with herself.
      pat: {
        weight: 0.9,
        length: [5, 5],
        when: still,
        pose: (t) => {
          const k = ease(t, 0, 1) * (1 - ease(t, 4, 4.8));
          this.trunk([-50, -48, -50, -40], [], k);
          p().add('head', 10 * k);
          p().add('trunk.4', 22 * Math.max(0, sin(t, 2.2)) * k);
          w().face = 'love';
        },
      },
      // Spins on the spot, ears flying out: the dizzy reaction.
      dizzy: {
        weight: 0,
        length: [4, 4],
        start: () => (this.posture = 'stand'),
        pose: (t) => {
          const k = 1 - ease(t, 2.6, 4);
          w().spin = 2 * Math.PI * 2 * ease(t, 0.2, 3);
          w().spread = 32 * k;
          this.trunk(
            [0, 0, 0, 0],
            [24 * sin(t, 1.4), 30 * sin(t, 1.4), 34 * sin(t, 1.4), 40 * sin(t, 1.4)],
            k,
          );
          p().add('head', 0, 0, 10 * sin(t, 1.5));
          w().face = 'dizzy';
        },
      },
    };
  }

  private frontLegsUp(v: number) {
    this.puppet.add('leg.FL', v);
    this.puppet.add('leg.FR', v);
  }

  /** The eyes follow the mouse unless an act points them elsewhere; acts may null this. */
  private eyes: { x: number; y: number } | null = null;

  poke() {
    if (this.state !== 'here') return;
    if (this.poked() >= 3) this.setAct('dizzy');
    else if (this.posture === 'lie') this.setAct('startle');
    else this.setAct('toot');
  }

  protected setAct(name: string) {
    this.spraying = 0;
    this.run = { done: false, n: 0, dir: 1 };
    super.setAct(name);
  }

  protected idle(t: number) {
    this.want = fresh();
    this.eyes = null;
    this.spraying = this.act === 'spray' ? this.spraying : 0;
    super.idle(t);
    // The trunk sways, ears breathe.
    const w = this.want;
    for (let i = 0; i < 4; i++) {
      w.pitch[i] += 2 * sin(t, 0.18, -i * 0.06);
      w.roll[i] += (2 + i) * sin(t, 0.13, -i * 0.08);
    }
    w.flap = [-2 * sin(t, 0.2), 2 * sin(t, 0.2)];
  }

  protected pose(dt: number, env: Env) {
    this.env = env;
    super.pose(dt, env);
    const p = this.puppet;
    const w = this.want;
    const moving = clamp(this.stride / (this.heightPx * 0.8), 0, 1);
    // Walking: the trunk swings a little to the stride, the ears bob.
    const g = this.gait;
    w.roll = w.roll.map((r, i) => r + 5 * moving * (i + 1) * Math.sin(g)) as Want['roll'];
    w.pitch = w.pitch.map((x, i) => x - 2 * moving * (i + 1) * Math.cos(g * 2)) as Want['pitch'];
    p.add('ear.L', 3 * moving * Math.sin(g * 2), 0, 0);
    p.add('ear.R', 3 * moving * Math.sin(g * 2), 0, 0);
    // A happy mood (the mouse resting on her) curls the trunk up and out in a slow wave.
    if (this.mood === 'happy' || this.mood === 'love') {
      if (this.act === 'idle' || this.act === 'stroll') {
        const s = sin(env.time, 0.6);
        this.trunk([-26, -22, -16, -8], [4 * s, 10 * s, 16 * s, 22 * s], 1);
        w.spread += 14;
      }
    }
    for (let i = 0; i < 4; i++) p.add(TRUNK[i], w.pitch[i], 0, w.roll[i]);
    // Ears: a mood's spread, the act's, and the flap; L swings forward (negative yaw) to spread.
    const sp = w.spread * 1;
    p.add('ear.L', 0, -sp + w.flap[0], 0);
    p.add('ear.R', 0, sp + w.flap[1], 0);
    // Gaze: the face follows an act's eyes, or the mouse.
    if (w.face) this.expression = w.face;
    // The ears and trunk tip lights.
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.lampColour = BEACON[this.expression] ?? '#f4f4f1';
    this.spray(dt, env);
  }

  /** The trunk's tip in character space (up, front), from the springs' present turns. */
  private tip(): [number, number] {
    const p = this.puppet;
    const head = p.current('head')[0] * DEG;
    // Rotation about X: + tips an upright bone forward (y' = y cos - z sin, z' = y sin + z cos).
    const rot = (y: number, z: number, a: number): [number, number] => [
      y * Math.cos(a) - z * Math.sin(a),
      y * Math.sin(a) + z * Math.cos(a),
    ];
    let angle = head;
    let at: [number, number] = [JOINT[0] - HEAD_JOINT[0], JOINT[1] - HEAD_JOINT[1]];
    at = rot(at[0], at[1], head);
    let y = HEAD_JOINT[0] + at[0];
    let z = HEAD_JOINT[1] + at[1];
    for (let i = 0; i < 4; i++) {
      angle += p.current(TRUNK[i])[0] * DEG;
      const [dy, dz] = rot(SEG[i][0], SEG[i][1], angle);
      y += dy;
      z += dz;
    }
    return [y, z];
  }

  /** The fountain: drops thrown from the trunk tip, in arcs, shrinking as they fall. */
  private spray(dt: number, env: Env) {
    const p = this.puppet;
    const now = env.time;
    if (this.spraying && now >= this.nextDrop) {
      this.nextDrop = now + 0.11;
      const [y, z] = this.tip();
      const d = this.drops[this.lastDrop++ % DROPS];
      d.at = now;
      d.y = y;
      d.z = z;
      d.x = 0;
      d.vy = 0.55 + Math.random() * 0.15;
      d.vz = (Math.random() - 0.5) * 0.28 + 0.08;
      d.vx = (Math.random() - 0.5) * 0.3;
    }
    void dt;
    for (let i = 0; i < DROPS; i++) {
      const d = this.drops[i];
      const age = now - d.at;
      const life = 1.1;
      const bone = `spray.${i + 1}`;
      if (age < 0 || age > life) {
        p.stretch(bone, 0.001, [0, 1, 0], 0.001);
        continue;
      }
      const g = -1.5;
      const y = d.y + d.vy * age + 0.5 * g * age * age;
      const z = d.z + d.vz * age;
      const x = d.x + d.vx * age;
      const s = 1 - Math.pow(age / life, 3);
      p.stretch(bone, s, [0, 1, 0], s);
      p.shift(bone, x, y - REST[0], z - REST[1]);
    }
  }

  protected after(dt: number, env: Env) {
    const o = this.outfit;
    this.h = 0;
    // Spinning on the spot (dizzy).
    this.pivot.rotation.y = -this.want.spin;
    if (!o) return;
    const t = env.time;
    const asleep = this.mood === 'asleep' || this.posture === 'lie';
    const tone = this.mood === 'calm' ? undefined : BEACON[this.expression];
    const lift = clamp(-this.puppet.current('trunk.2')[0] / 40, 0, 1);
    o.dot(
      0,
      asleep ? 0.12 : clamp(0.4 + 0.25 * Math.sin(t * 1.5) + 0.5 * lift + 0.5 * this.flash, 0, 1),
      tone,
    );
    const flapping = Math.abs(this.puppet.current('ear.L')[1]) / 30;
    o.dot(1, asleep ? 0.1 : clamp(0.3 + 0.7 * flapping + 0.5 * this.flash, 0, 1), tone);
    o.dot(2, asleep ? 0.1 : 0.4 + 0.3 * Math.sin(t * 2.2), tone);
    o.dot(3, this.walking ? 0.5 + 0.4 * Math.sin(t * 8) : 0.25, tone);
    o.beacon(this.flash > 0.2 ? '#ffffff' : this.lampColour);
    void dt;
  }
}

export type { Feeling };
