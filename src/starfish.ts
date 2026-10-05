import { Euler, Quaternion, type Object3D, Vector3 } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Act, Character, clamp, type Edge, type Env, type Frame } from './character';
import type { Expression, FaceLayout } from './face';
import { sin } from './moves';
import { bump, cycle, ease, FixedSpring } from './swimmer';

/**
 * Mica, the robot starfish. A round hub with a screen face in the middle and five chunky
 * arms of three rounded segments, standing upright facing us on the tips of its two lower
 * arms with one arm up. The arms are coral; down the front of every arm run three lit
 * tube-feet studs (arm i lights Dot i) and the top arm's tip carries the beacon.
 *
 * She walks the floor sideways on her two lower arms, and, like the octopus, goes up the
 * side walls (the studs are her suckers). Tricks: a cartwheel along the floor on her arm
 * tips (the face turning over and over, her roll tied to how far she has gone so nothing
 * slides), a spin on the spot, waving an arm, curling the top arm over to look at the
 * viewer, star jumps, tucking every arm over her face, a dance, a stretch that makes every
 * arm longer, a ripple of light round the five arms, dozing, hiccups, looking round and,
 * on a wall, a slow suckered climb. Poke her and she flings her arms wide and goes cross
 * then tucks; three pokes and she spins dizzy; rest the mouse on her and she glows pink and
 * sways.
 */
export const STARFISH_FACE: FaceLayout = {
  width: 512,
  height: 420,
  eyes: [
    [0.3, 0.42],
    [0.7, 0.42],
  ],
  rx: 0.1,
  ry: 0.13,
  line: 0.034,
  mouth: [0.5, 0.72],
};

const ARMS = 5;
const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;
/** Her roll: how far she travels (in her own heights' worth of model metres) per radian. */
const STEP = 0.161;
const FORWARD: Record<Edge, number> = { bottom: 1, top: -1, left: 1, right: -1 };
const SHARE = [0.4, 0.35, 0.3];
const q = new Quaternion();
const axis = new Vector3();
const euler = new Euler(0, 0, 0, 'YXZ');

/** The joint turn (pitch, yaw, roll in degrees) that curls arm i toward the viewer by deg. */
function towards(i: number, deg: number): [number, number, number] {
  const a = (90 + 72 * i) * RAD;
  axis.set(-Math.sin(a), Math.cos(a), 0);
  q.setFromAxisAngle(axis, -deg * RAD);
  euler.setFromQuaternion(q, 'YXZ');
  return [euler.x * DEG, euler.y * DEG, euler.z * DEG];
}

interface ArmPose {
  /** In the plane we see, degrees per segment (+ turns it anticlockwise). */
  swing: [number, number, number];
  /** Toward the viewer, degrees per segment. */
  curl: [number, number, number];
  /** How much longer the arm is. */
  grow: number;
}

export class Starfish extends Character {
  static readonly terms =
    'sea star five arms tube feet suckers coral pink peach cream salmon spots studs cartwheel roll climb walls spin jumps ocean';

  private arms: ArmPose[] = [];
  private spinAng = 0;
  private roll0 = 0;
  private rollFrom = 0;
  private rolling = false;
  private rollDir = 1;
  private lift = new FixedSpring(5, 0.5);
  private crouch = new FixedSpring(4, 0.5);
  private pokes: number[] = [];
  private hover = 0;
  private flash = -1;
  private tone: string | undefined;

  constructor(model: Object3D) {
    const feels: Record<string, { f: number; zeta: number; r?: number }> = {
      default: { f: 4.5, zeta: 0.45 },
      root: { f: 2.4, zeta: 0.6 },
      body: { f: 3, zeta: 0.5, r: 0.5 },
      face: { f: 3, zeta: 0.45 },
    };
    for (let i = 0; i < ARMS; i++)
      for (let k = 1; k <= 3; k++) feels[`arm.${i}.${k}`] = { f: 5 + k * 0.4, zeta: 0.4 };
    super(
      {
        name: 'Mica',
        model: 'starfish',
        metres: 0.33,
        width: 0.34,
        size: 0.85,
        feels: feels as never,
        face: STARFISH_FACE,
        eyes: 0.46,
        gaze: [{ bone: 'face', yaw: 0.7, pitch: 0.5 }],
        reach: { yaw: 35, pitch: 20 },
        lag: 1.3,
        entrance: 'walk',
        edges: ['bottom', 'bottom', 'bottom', 'left', 'right'],
        stay: [45, 100],
        speed: 1,
        turn: 0,
      },
      model,
    );
    for (let i = 0; i < ARMS; i++) this.arms.push({ swing: [0, 0, 0], curl: [0, 0, 0], grow: 1 });
    this.acts = this.moves();
  }

  private moves(): Record<string, Act> {
    const still = () => !this.walking && !this.rolling;
    const wall = () => still() && this.edge !== 'bottom';
    const stroll = (far: number, speed = 1) => {
      this.spec.speed = speed;
      const way = Math.random() < 0.5 ? -1 : 1;
      this.walkTo(this.s + way * this.heightPx * far * (0.7 + Math.random() * 0.6));
    };
    return {
      idle: { weight: 3, length: [3, 6] },
      stroll: { weight: 3, length: [5, 8], when: still, start: () => stroll(2.2) },
      cartwheel: {
        weight: 1.4,
        length: [4.4, 4.8],
        face: 'happy',
        when: still,
        start: () => this.startRoll(),
      },
      spin: { weight: 0.9, length: [3.6, 4], face: 'happy', when: still },
      wave: { weight: 1.1, length: [4, 4.6], face: 'happy', when: still },
      look: { weight: 1.1, length: [5, 6], face: 'focused', when: still },
      jump: { weight: 1.1, length: [4.6, 5], face: 'happy', when: still },
      tuck: { weight: 0.7, length: [5, 5.6], when: still },
      dance: { weight: 0.9, length: [5, 5.6], face: 'happy', when: still },
      stretch: { weight: 0.9, length: [4.6, 5.2], face: 'happy', when: still },
      lamps: { weight: 0.8, length: [4.4, 5], face: 'happy', when: still },
      doze: { weight: 0.7, length: [9, 13], face: 'asleep', when: still },
      hiccup: { weight: 0.7, length: [4, 4.4], when: still },
      glance: { weight: 1, length: [4, 5], when: still },
      cling: { weight: 2.2, length: [7, 9], face: 'focused', when: wall },
      poked: { weight: 0, length: [4.4, 5], face: 'surprised' },
      love: { weight: 0, length: [4, 5], face: 'love' },
      dizzy: { weight: 0, length: [5, 5] },
    };
  }

  /** Off along the floor on her arm tips, a whole number of turns. */
  private startRoll() {
    const f = this.lastFrame;
    this.spec.speed = 1.5;
    const unit = 2 * Math.PI * STEP * this.px;
    let dir = Math.random() < 0.5 ? -1 : 1;
    if (f) {
      const [lo, hi] = this.span(f);
      const toLo = this.s - lo;
      const toHi = hi - this.s;
      dir = toHi > toLo ? 1 : -1;
      if (Math.random() < 0.25) dir = -dir;
    }
    const turns = Math.random() < 0.5 ? 1 : 2;
    this.rollDir = dir;
    this.roll0 = this.s;
    this.rollFrom = this.spinAng;
    this.rolling = true;
    this.walkTo(this.s + dir * unit * turns, this.depth);
  }

  private lastFrame: Frame | null = null;

  poke() {
    if (this.state !== 'here') return;
    const now = performance.now() / 1000;
    this.pokes = [...this.pokes.filter((at) => now - at < 3), now];
    this.goal = null;
    this.rolling = false;
    if (this.pokes.length >= 3) {
      this.pokes = [];
      this.setAct('dizzy');
    } else if (this.act !== 'dizzy') {
      this.flash = 0;
      this.tone = BEACON.surprised;
      this.puppet.kick('body', 30);
      this.hopUp(0.25);
      this.setAct('poked');
    }
  }

  protected idle(t: number) {
    const p = this.puppet;
    p.shift('root', 0, 0.002 * sin(t, 0.4), 0);
    p.add('body', 1.5 * sin(t, 0.22), 0, 2 * sin(t, 0.17));
    p.add('face', 2 * sin(t, 0.3), 3 * sin(t, 0.19), 0);
    for (let i = 0; i < ARMS; i++) p.add(`arm.${i}.2`, 0, 0, 3 * sin(t, 0.3, i * 0.2));
  }

  protected pose(dt: number, env: Env) {
    this.lastFrame = env.frame;
    const p = this.puppet;
    const t = this.actT;
    const act = this.act;
    const time = env.time;
    const left = this.actLength - t;
    const crossed = (at: number) => t >= at && t - dt < at;
    for (const a of this.arms) {
      a.swing = [0, 0, 0];
      a.curl = [0, 0, 0];
      a.grow = 1;
    }
    const all = (f: (a: ArmPose, i: number) => void) => this.arms.forEach(f);
    const set = (a: ArmPose, key: 'swing' | 'curl', deg: number, bias = 0) => {
      for (let k = 0; k < 3; k++) a[key][k] += deg * (SHARE[k] + bias * (k - 1) * 0.15);
    };
    let face: Expression = this.hovered ? 'happy' : 'neutral';
    let body = 0;
    let crouch = 0;
    let lift = 0;
    let spinTo: number | null = null;

    this.hover = this.hovered ? this.hover + dt : 0;
    if (this.hover > 0.9 && ['idle', 'stroll', 'look', 'glance'].includes(act)) this.setAct('love');

    switch (act) {
      case 'poked': {
        const k = left > 1.8 ? 1 : ease(left / 1.8);
        // Arms flung wide, then every arm over the face.
        if (t < 0.7) {
          all((a, i) => set(a, 'curl', -35 * ease(t / 0.2)));
          all((a) => (a.grow = 1.15));
        } else all((a, i) => set(a, 'curl', 80 * k));
        crouch = 0.3 * k;
        face = t < 0.5 ? 'surprised' : left > 1.8 ? 'cross' : 'neutral';
        break;
      }
      case 'tuck': {
        const k = ease(t / 0.7) * (left > 1.4 ? 1 : ease(left / 1.4));
        all((a) => set(a, 'curl', 85 * k));
        crouch = 0.35 * k;
        face = k > 0.5 ? 'cross' : 'surprised';
        // A peek out over the arms.
        if (t > 2.2 && t < 3.6) {
          all((a, i) =>
            set(a, 'curl', -(i === 0 ? 70 : 0) * Math.sin(((t - 2.2) / 1.4) * Math.PI)),
          );
          face = 'surprised';
        }
        break;
      }
      case 'cartwheel': {
        // Nothing but the roll: arms held straight, a little shiver as she goes.
        face = Math.abs(Math.cos(this.spinAng / 2)) < 0.5 ? 'surprised' : 'happy';
        all((a, i) => set(a, 'swing', 4 * Math.sin(time * 9 + i)));
        break;
      }
      case 'spin': {
        const u = ease((t - 0.3) / 2.8);
        spinTo = 2 * Math.PI * u * (this.rollDir || 1);
        lift = Math.sin(Math.PI * clamp((t - 0.3) / 2.8, 0, 1)) * 0.25;
        all((a) => (a.grow = 1 + 0.12 * Math.sin(Math.PI * clamp((t - 0.3) / 2.8, 0, 1))));
        break;
      }
      case 'wave': {
        const k = ease(Math.min(t / 0.6, left / 0.6));
        const a = this.arms[4];
        set(a, 'swing', 22 * k, 0);
        for (let s = 0; s < 3; s++)
          a.swing[s] += 18 * k * Math.sin(t * 7 - s * 0.8) * (0.5 + s * 0.4);
        body = 3 * k;
        break;
      }
      case 'look': {
        // The top arm curls over toward the viewer and looks; the others hold still.
        const k = ease(Math.min(t / 0.9, left / 0.9));
        const a = this.arms[0];
        a.curl = [30 * k, 60 * k, 65 * k];
        a.swing[0] += 8 * k * Math.sin(t * 1.3);
        face = t < 2 ? 'neutral' : t < 4 ? 'focused' : 'surprised';
        p.add('face', 0, 20 * Math.sin(t * 1.2) * k, 0);
        body = -3 * k;
        break;
      }
      case 'jump': {
        // Three star jumps: crouch, then up with every arm flung out.
        const c = (t * 0.9) % 1;
        const n = Math.floor(t * 0.9);
        const on = n < 3 && t > 0.2;
        const air = on ? Math.max(0, Math.sin(Math.PI * clamp((c - 0.25) / 0.6, 0, 1))) : 0;
        crouch = on ? 0.5 * bump(c - 0.1, 0.2) : 0;
        lift = air * 0.35;
        all((a, i) => {
          a.grow = 1 + 0.12 * air;
          set(a, 'curl', -25 * air);
          if (i === 1) set(a, 'swing', -20 * air);
          if (i === 4) set(a, 'swing', 20 * air);
          if (i === 2) set(a, 'swing', -26 * air);
          if (i === 3) set(a, 'swing', 26 * air);
        });
        if (on && crossed(0.2 + n / 0.9 + 0.5)) this.hopUp(0.3);
        face = air > 0.1 ? 'happy' : 'neutral';
        break;
      }
      case 'dance': {
        const b = Math.sin(t * 2 * Math.PI * 1.1);
        all((a, i) => {
          const u = Math.sin(t * 2 * Math.PI * 1.1 + i * 1.26);
          set(a, 'swing', 22 * u);
          set(a, 'curl', 18 * Math.max(0, u));
        });
        body = 9 * b;
        lift = 0.15 * Math.abs(b);
        break;
      }
      case 'stretch': {
        const k = ease(Math.min(t / 1.2, left / 1.2));
        const pulse = 0.5 + 0.5 * Math.sin(t * 3);
        all((a) => {
          a.grow = 1 + (0.2 + 0.06 * pulse) * k;
          set(a, 'curl', 12 * k);
        });
        face = k > 0.5 ? 'sleepy' : 'neutral';
        crouch = -0.2 * k;
        break;
      }
      case 'lamps':
        body = 4 * Math.sin(t * 3);
        all((a, i) => set(a, 'swing', 6 * Math.sin(t * 5 - i * 1.26)));
        break;
      case 'doze': {
        const k = ease(t / 2.2);
        crouch = 0.4 * k;
        all((a, i) => {
          if (i === 1) set(a, 'swing', 30 * k);
          if (i === 4) set(a, 'swing', -30 * k);
          if (i === 0) set(a, 'swing', 14 * k);
          set(a, 'curl', 8 * k);
        });
        body = 4 * k;
        break;
      }
      case 'hiccup': {
        for (const at of [0.7, 1.6, 2.5]) {
          if (crossed(at)) {
            p.kick('body', -22);
            p.kick('face', -25);
            this.flash = 0;
            this.tone = BEACON.surprised;
            this.hopUp(0.12);
            all((a, i) => p.kick(`arm.${i}.1`, 0, 0, 30));
          }
        }
        face = [0.7, 1.6, 2.5].some((x) => t > x && t < x + 0.25) ? 'surprised' : 'neutral';
        break;
      }
      case 'glance':
        p.add('face', 0, 30 * Math.sin(t * 1.4), 5 * Math.sin(t * 1.4));
        p.add('body', 0, 12 * Math.sin(t * 1.4 - 0.5), 0);
        break;
      case 'cling': {
        // On a wall: a slow climbing shuffle on the spot, arms reaching up in turn.
        const k = ease(Math.min(t / 0.8, left / 0.8));
        const a = Math.sin(t * 2 * Math.PI * 0.6);
        all((arm, i) => {
          const sign = i === 1 || i === 2 ? 1 : i === 0 ? 0 : -1;
          const reach = i === 0 ? 0 : sign * a;
          set(arm, 'swing', (i <= 1 || i === 4 ? 16 : 10) * reach * k * (i < 2 || i > 3 ? 1 : -1));
          arm.grow = 1 + 0.06 * Math.max(0, reach * (i === 1 || i === 4 ? 1 : -1)) * k;
        });
        body = 5 * a * k;
        face = 'focused';
        break;
      }
      case 'love': {
        const k = ease(Math.min(t / 0.8, left / 0.8));
        all((a, i) => set(a, 'swing', 10 * k * Math.sin(t * 3 - i * 0.9)));
        body = 6 * Math.sin(t * 2.2);
        face = 'love';
        break;
      }
      case 'dizzy': {
        const u = clamp((t - 0.2) / 2.6, 0, 1);
        spinTo = 4 * Math.PI * u * u * (3 - 2 * u);
        all((a, i) => set(a, 'swing', 12 * Math.sin(time * 6 + i)));
        face = 'dizzy';
        body = 7 * Math.sin(time * 5);
        break;
      }
    }
    this.expression = face;

    // Rolling: her turn is how far she has gone; anything else turns her smoothly.
    const walkSpeed = (this.spec.speed ?? 1) * env.frame.bot;
    if (act === 'cartwheel' && this.rolling) {
      const ds = (this.s - this.roll0) * FORWARD[this.edge];
      this.spinAng = this.rollFrom - ds / (STEP * this.px);
      if (!this.walking && t > 0.6) this.rolling = false;
    } else {
      this.rolling = false;
      if (spinTo !== null) this.spinAng = spinTo;
      else
        this.spinAng +=
          (Math.round(this.spinAng / (2 * Math.PI)) * 2 * Math.PI - this.spinAng) *
          Math.min(1, dt * 6);
    }
    // Her centre is a little higher with each tip she rolls onto.
    const rolled =
      act === 'cartwheel' ? 0.19 * 0.172 * (0.5 - 0.5 * Math.cos(5 * this.spinAng)) : 0;
    const lf = this.lift.update(dt, lift);
    const cr = this.crouch.update(dt, crouch);
    this.h = rolled * this.px + lf * this.heightPx * 0.5;

    // Walking: the two lower arms are legs; a tripod-ish beat with the upper arms counter-swinging.
    const mv = this.rolling ? 0 : clamp(this.stride / walkSpeed, 0, 1.7);
    const dir = Math.sign(this.pace) || 1;
    const g = Math.sin(this.gait);
    this.arms[2].swing[0] += 22 * mv * g * dir;
    this.arms[3].swing[0] += 22 * mv * -g * dir;
    this.arms[1].swing[0] += 8 * mv * -g;
    this.arms[4].swing[0] += 8 * mv * g;
    this.arms[0].swing[0] += 6 * mv * Math.cos(this.gait);
    p.add('body', 0, 0, body + 3 * mv * Math.sin(this.gait * 2) - 4 * mv * dir);

    for (let i = 0; i < ARMS; i++) {
      const a = this.arms[i];
      const ang = (90 + 72 * i) * RAD;
      for (let k = 0; k < 3; k++) {
        const [cp, cy, cr2] = towards(i, a.curl[k] + (act === 'tuck' || act === 'poked' ? 0 : 0));
        p.add(
          `arm.${i}.${k + 1}`,
          cp,
          cy,
          a.swing[k] + cr2 - cr * (i === 0 ? 0 : i < 3 ? -12 : 12),
        );
      }
      p.stretch(`arm.${i}.1`, a.grow, [Math.cos(ang), Math.sin(ang), 0], 1);
    }
    p.shift('root', 0, -0.012 * cr, 0);
    if (this.flash >= 0) {
      this.flash += dt;
      if (this.flash > 1.2) this.flash = -1;
    }
  }

  protected after(dt: number, env: Env) {
    const time = env.time;
    const act = this.act;
    const t = this.actT;
    const walk = clamp(this.stride / ((this.spec.speed ?? 1) * env.frame.bot), 0, 1.5);
    // The roll about the middle of the hub, direct so it may go round and round.
    if (this.spinAng) this.puppet.turn('body', 0, 0, this.spinAng * DEG);
    for (let i = 0; i < ARMS; i++) {
      let level = 0.5 + 0.2 * Math.sin(time * 0.9 - i * 0.8);
      let tone: string | undefined;
      const ring = (speed: number) =>
        0.3 + 0.7 * bump(cycle(time * speed - i / ARMS) * ARMS - 0.5, 0.9);
      if (act === 'poked' && t < 0.8) {
        level = Math.sin(time * 34) > 0 ? 1 : 0.3;
        tone = BEACON.surprised;
      } else if (act === 'dizzy') {
        level = Math.sin(time * 7 + i * 2.3) > 0.2 ? 1 : 0.15;
        tone = RAINBOW[(i + Math.floor(time * 3)) % RAINBOW.length];
      } else if (act === 'love') {
        level = 0.65 + 0.35 * Math.sin(time * 2.4 - i * 0.6);
        tone = BEACON.love;
      } else if (act === 'lamps') {
        level = ring(0.9);
        tone = RAINBOW[(i + Math.floor(time * 2)) % RAINBOW.length];
      } else if (act === 'cartwheel' || act === 'spin' || act === 'dance' || act === 'jump') {
        level = Math.sin(time * 9 + i * 1.26) > 0 ? 1 : 0.25;
        tone = RAINBOW[(i + Math.floor(time * 4)) % RAINBOW.length];
      } else if (act === 'stretch') {
        level = ring(0.7);
        tone = BEACON.happy;
      } else if (act === 'hiccup') {
        level = 0.5 + 0.5 * Math.sin(time * 20 + i * 1.7);
        tone = BEACON.surprised;
      } else if (act === 'doze' || act === 'tuck') {
        level = 0.2 + 0.15 * Math.sin(time * 0.8);
      } else if (act === 'cling' || walk > 0.25) level = ring(1.4);
      else if (this.hovered) tone = BEACON.happy;
      this.outfit.dot(i, level, tone);
    }
    this.outfit.beacon(
      this.flash >= 0 && this.tone
        ? this.tone
        : act === 'dance' || act === 'cartwheel' || act === 'spin' || act === 'lamps'
          ? RAINBOW[Math.floor(time * 6) % RAINBOW.length]
          : (BEACON[this.expression] ?? BEACON.neutral!),
    );
  }
}
