import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { Expression, FaceLayout } from './face';
import { sin } from './moves';
import { bump, cycle, ease, FixedSpring, type Point, type Spot, Swimmer } from './swimmer';

/**
 * Billow, the robot manta ray. She glides in the band just inside the frame (the swimmer
 * kit), banked a little toward us so that we see her back and her face at once: a wide flat
 * diamond of wing panels (three to a side, each its own bone, so the wings ripple from the
 * body out), a rounded head with a screen face and two small head fins, a lit spot on each
 * panel (Dot0 inner .. Dot2 outer, the same both sides), cheek lamps (Dot3), a beacon on her
 * back and a thin tail that sways.
 *
 * Tricks: slow gliding wing beats, a big loop-the-loop (a somersault round a circle), a
 * barrel roll that shows her white belly, skimming low along the bottom of the band with
 * the wings held flat, one big flap, waving a wing tip, clapping the wings over her head,
 * a lap of lit spots, a rippling wave dance, looking round, nodding, peeking from the back
 * wall, dozing with the wings drooped, hiccups and a bow. Poke her and she flaps hard and
 * darts off, the spots flashing; three pokes and she spins dizzy; rest the mouse on her
 * and she blushes and her wings go slow and soft.
 */
export const MANTA_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.22, 0.5],
    [0.78, 0.5],
  ],
  rx: 0.07,
  ry: 0.26,
  line: 0.036,
  mouth: null,
};

const WING = { L: ['wing.L.1', 'wing.L.2', 'wing.L.3'], R: ['wing.R.1', 'wing.R.2', 'wing.R.3'] };
const TAIL = ['tail.1', 'tail.2', 'tail.3'];
const SIDES = [
  ['L', 1],
  ['R', -1],
] as const;

export class Manta extends Swimmer {
  /** How hard the wings beat (degrees at the root), and how fast (Hz). */
  private amp = new FixedSpring(3, 0.7);
  private rate = new FixedSpring(3, 0.7);
  /** How far each wing is held up (+) or drooped (-), degrees. */
  private held = { L: new FixedSpring(5, 0.5), R: new FixedSpring(5, 0.5) };
  private nod = new FixedSpring(3, 0.5);
  private bow = new FixedSpring(2, 0.6);
  private phase = 0;
  private pitch = 0;
  private turn = 0;
  private flash = -1;
  private tone: string | undefined;

  constructor(model: Object3D) {
    const feels: Record<string, { f: number; zeta: number; r?: number }> = {
      default: { f: 3, zeta: 0.5 },
      root: { f: 1.4, zeta: 0.6 },
      body: { f: 1.8, zeta: 0.45, r: 0.5 },
      face: { f: 4, zeta: 0.5 },
    };
    for (const [n] of SIDES) {
      for (let k = 1; k <= 3; k++) feels[`wing.${n}.${k}`] = { f: 6, zeta: 0.55 };
      feels[`horn.${n}.1`] = { f: 4, zeta: 0.4 };
      feels[`horn.${n}.2`] = { f: 4, zeta: 0.3 };
    }
    for (let k = 1; k <= 3; k++) feels[`tail.${k}`] = { f: 3 + k * 0.3, zeta: 0.35 };
    super(
      {
        name: 'Billow',
        model: 'manta',
        metres: 0.3,
        width: 0.74,
        size: 0.95,
        feels: feels as never,
        face: MANTA_FACE,
        eyes: 0.5,
        gaze: [{ bone: 'face', yaw: 0.8, pitch: 0.6 }],
        reach: { yaw: 40, pitch: 22 },
        lag: 1.2,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 1.2,
        turn: 60,
      },
      model,
    );
    this.inset = 0.7;
    this.acts = this.moves();
  }

  private moves(): Record<string, Act> {
    const still = () => !!this.free && !this.route.length && !this.exiting;
    return {
      idle: { weight: 3, length: [3, 7] },
      swim: {
        weight: 2.8,
        length: [3, 6],
        when: still,
        start: () => this.swimTo(this.somewhere()),
      },
      loop: { weight: 1.3, length: [4.6, 5], face: 'happy', when: still },
      roll: { weight: 1.3, length: [3.6, 4], face: 'happy', when: still },
      skim: { weight: 1.1, length: [6, 7], face: 'focused', when: still },
      flap: { weight: 1, length: [3.6, 4], face: 'determined', when: still },
      wave: { weight: 0.9, length: [3.6, 4], face: 'happy', when: still },
      clap: { weight: 0.9, length: [4, 4.6], face: 'happy', when: still },
      spots: { weight: 0.8, length: [4.4, 5], face: 'happy', when: still },
      dance: { weight: 0.9, length: [5, 5.6], face: 'happy', when: still },
      nod: { weight: 0.8, length: [3.4, 4], face: 'happy', when: still },
      look: { weight: 1, length: [4, 5], when: still },
      peek: { weight: 0.7, length: [8, 8.6], when: still },
      doze: { weight: 0.7, length: [9, 14], face: 'asleep', when: still },
      hiccup: { weight: 0.7, length: [4, 4.4], when: still },
      dart: {
        weight: 0.7,
        length: [3, 3.4],
        face: 'surprised',
        when: still,
        start: () => this.kickTo(this.toward),
      },
      bow: { weight: 0.6, length: [3.6, 4], face: 'love', when: () => still() && !!this.mate() },
      poked: { weight: 0, length: [3.4, 3.8] },
      love: { weight: 0, length: [3, 4], face: 'love' },
      dizzy: { weight: 0, length: [4.6, 4.6] },
    };
  }

  protected depthFor(act: string) {
    if (act === 'peek') return 1;
    if (act === 'swim') return Math.random() * 0.45;
    if (['poked', 'wave', 'bow', 'clap', 'spots', 'nod', 'dance', 'loop', 'roll'].includes(act))
      return 0.1;
    return undefined;
  }

  protected startle() {
    this.hold();
    this.kickTo(this.toward);
    this.flash = 0;
    this.tone = BEACON.surprised;
    this.setAct('poked');
  }

  protected station(env: Env, s: Spot): Point {
    const t = this.actT;
    const H = s.H;
    let x = 0;
    let y = 0;
    switch (this.act) {
      case 'loop': {
        // Up and round a circle and back to where she began.
        const u = clamp((t - 0.4) / 3.4, 0, 1);
        const a = 2 * Math.PI * u;
        const r = H * 0.75;
        x = this.toward * r * Math.sin(a);
        y = -r * (1 - Math.cos(a));
        break;
      }
      case 'skim':
        y =
          H *
          0.38 *
          ease(t / 1.4) *
          (this.actLength - t > 1.4 ? 1 : ease((this.actLength - t) / 1.4));
        x = this.toward * H * 1.2 * Math.sin((Math.PI * t) / this.actLength);
        break;
      case 'doze':
        y = H * 0.2 * ease(t / 3);
        break;
      case 'dance':
        x = H * 0.25 * Math.sin(t * 2 * Math.PI * 0.6);
        y = -H * 0.08 * Math.abs(Math.sin(t * 2 * Math.PI * 1.1));
        break;
      case 'roll':
        y = -H * 0.1 * bump(t - 1.8, 1.8);
        break;
      case 'dizzy':
        x = Math.cos(env.time * 4) * H * 0.2;
        y = Math.sin(env.time * 4) * H * 0.12;
        break;
    }
    return { x, y };
  }

  protected fast() {
    return this.act === 'dart' || this.act === 'poked' ? 5 : this.act === 'skim' ? 2 : 1.5;
  }

  /** Banked a little toward the way she goes, never side on (the wings would go edge-on). */
  protected turnFor(fade: number) {
    switch (this.act) {
      case 'wave':
      case 'bow':
      case 'clap':
        return this.toward * 20 * fade;
      case 'look':
        return 40 * Math.sin(this.actT * 1.4) * fade;
      default:
        // A slow lazy bank even at rest, so the diamond reads rather than a flat line.
        return clamp(this.vel.x / this.heightPx, -1, 1) * 38 + 16 * Math.sin(this.actT * 0.3);
    }
  }

  protected leanGain() {
    return 0.1;
  }

  protected leanFor() {
    const t = this.actT;
    switch (this.act) {
      case 'dance':
        return 0.15 * Math.sin(t * 2 * Math.PI * 0.6);
      case 'bow':
        return this.toward * 0.15 * this.bow.y;
      case 'love':
        return 0.12 * Math.sin(t * 2.4);
      case 'skim':
        return -this.toward * 0.12 * bump(t - this.actLength / 2, this.actLength / 2);
      default:
        return 0;
    }
  }

  protected idle(t: number) {
    const p = this.puppet;
    p.shift('root', 0, 0.01 * sin(t, 0.35), 0);
    p.add('body', 2 * sin(t, 0.21), 0, 2 * sin(t, 0.17));
    for (const [n, s] of SIDES) {
      p.add(`horn.${n}.2`, 4 * sin(t, 0.3, s * 0.1), 0, 0);
    }
  }

  protected pose(dt: number, env: Env) {
    super.pose(dt, env);
    const p = this.puppet;
    const t = this.actT;
    const act = this.act;
    const time = env.time;
    const left = this.actLength - t;
    const calm = !['poked', 'dizzy', 'love', 'dart', 'loop', 'roll'].includes(act);
    this.mind(dt, env, calm);
    const crossed = (at: number) => t >= at && t - dt < at;

    let face: Expression = this.hovered ? 'happy' : 'neutral';
    let amp = 8;
    let rate = 0.45;
    const hold = { L: 0, R: 0 };
    let nod = 0;
    this.pitch = 0;
    this.turn = 0;
    this.spinning = false;
    switch (act) {
      case 'poked':
        amp = 28;
        rate = 3.2;
        face = t < 0.5 ? 'surprised' : t < 2.4 ? 'cross' : 'sleepy';
        if (t > 2.4) [amp, rate] = [8, 0.6];
        break;
      case 'loop': {
        const u = clamp((t - 0.4) / 3.4, 0, 1);
        this.pitch = -2 * Math.PI * ease(u) * this.toward;
        this.spinning = u > 0 && u < 1;
        [amp, rate] = [18, 1.4];
        face = 'happy';
        break;
      }
      case 'roll': {
        const u = ease((t - 0.3) / 3);
        this.turn = 2 * Math.PI * u * this.toward;
        [amp, rate] = [16, 1.6];
        break;
      }
      case 'skim':
        // Low and level: the wings held flat, long slow beats.
        [amp, rate] = [7, 0.4];
        nod = -6;
        face = 'focused';
        break;
      case 'flap': {
        // One big down-beat and up, then a hold.
        const u = clamp(t / 3.2, 0, 1);
        amp = 34 * bump(u - 0.45, 0.45);
        rate = 0.7;
        hold.L = hold.R = 18 * bump(u - 0.3, 0.3);
        break;
      }
      case 'wave': {
        hold.L =
          (t > 0.4 && left > 0.6 ? 1 : 0.1) * 50 +
          14 * Math.sin(t * 8) * (t > 0.4 && left > 0.6 ? 1 : 0);
        amp = 4;
        break;
      }
      case 'clap': {
        // Both wings up over her head, together, a few times.
        const k = ease(Math.min(t / 0.6, left / 0.6));
        const c = Math.sin(t * 7) > 0 ? 1 : 0;
        hold.L = hold.R = k * (70 - 30 * c);
        amp = 2;
        nod = -4 * k;
        face = 'happy';
        break;
      }
      case 'spots':
        [amp, rate] = [10, 0.8];
        break;
      case 'dance':
        [amp, rate] = [16, 1.1];
        break;
      case 'nod':
        nod = 14 * Math.sin(t * 2 * Math.PI * 1.2) * ease(Math.min(t, left));
        break;
      case 'look':
        p.add('face', 0, 24 * Math.sin(t * 1.4), 0);
        break;
      case 'peek':
        face = t < 3.2 ? 'neutral' : t < 5.2 ? 'focused' : 'surprised';
        p.add('face', 0, 22 * Math.sin(t * 1.5), 0);
        break;
      case 'doze': {
        const k = ease(t / 2.5);
        hold.L = hold.R = -28 * k;
        [amp, rate] = [3, 0.25];
        nod = 12 * k;
        break;
      }
      case 'hiccup':
        for (const at of [0.7, 1.6, 2.5]) {
          if (crossed(at)) {
            p.kick('body', -14);
            this.flash = 0;
            this.tone = BEACON.surprised;
            this.amp.kick(60);
          }
        }
        face = [0.7, 1.6, 2.5].some((x) => t > x && t < x + 0.25) ? 'surprised' : 'neutral';
        break;
      case 'bow':
        this.bow.update(dt, t > 0.5 && left > 1 ? 1 : 0);
        nod = 22 * this.bow.y;
        hold.L = hold.R = -14 * this.bow.y;
        break;
      case 'dart':
        [amp, rate] = [24, 2.4];
        break;
      case 'love':
        face = 'love';
        [amp, rate] = [5, 0.35];
        break;
      case 'dizzy': {
        const u = clamp((t - 0.2) / 2.4, 0, 1);
        this.turn = 4 * Math.PI * u * u * (3 - 2 * u);
        face = 'dizzy';
        [amp, rate] = [20, 1.8];
        break;
      }
    }
    if (act !== 'bow') this.bow.update(dt, 0);
    if (act === 'swim' || this.swimming() > 0.3) {
      const sw = this.swimming();
      if (act === 'swim' || act === 'idle') [amp, rate] = [10 + 10 * sw, 0.5 + 0.5 * sw];
    }
    this.expression = face;
    const a = this.amp.update(dt, amp);
    const r = this.rate.update(dt, rate);
    this.phase += dt * 2 * Math.PI * r;
    const nd = this.nod.update(dt, nod);
    p.add('body', nd * 0.5, 0, 0);
    // Wings: a wave outward from the body, each panel a beat behind and bigger.
    for (const [n, s] of SIDES) {
      const h = this.held[n].update(dt, hold[n]);
      WING[n].forEach((b, k) => {
        const beat = Math.sin(this.phase - k * 0.7) * a * (0.55 + 0.3 * k);
        p.add(b, 0, 0, s * (beat + h * (k === 0 ? 0.5 : 0.3)));
      });
    }
    // The tail sways a beat behind the wings; a little lift as she is held.
    TAIL.forEach((b, i) =>
      p.add(b, 0, 14 * Math.sin(this.phase * 0.5 - i * 0.9) * (1 + 0.3 * i), 0),
    );
    p.add('body', 0, 0, 0);
    if (this.free) p.add('body', clamp(this.vel.y / (this.heightPx * 2), -1, 1) * 8);
    if (act === 'peek') p.add('body', 4 * Math.sin(t * 1.8), 8 * Math.sin(t * 1.3), 0);
  }

  /** Lights: the three spots (the same each side), the cheeks (3). */
  private lights(time: number) {
    const act = this.act;
    const t = this.actT;
    const moving = this.swimming() > 0.25;
    for (let i = 0; i < 4; i++) {
      let level = 0.55 + 0.25 * Math.sin(time * 0.9 - i * 0.7);
      let tone: string | undefined;
      const run = (speed: number) => 0.3 + 0.7 * bump(cycle(time * speed) * 1.6 - i * 0.3, 0.3);
      if (act === 'poked' && t < 0.8) {
        level = Math.sin(time * 34) > 0 ? 1 : 0.35;
        tone = BEACON.surprised;
      } else if (act === 'dizzy') {
        level = Math.sin(time * 7 + i * 2.3) > 0.2 ? 1 : 0.15;
        tone = RAINBOW[(i + Math.floor(time * 3)) % RAINBOW.length];
      } else if (act === 'love' || act === 'bow') {
        level = 0.65 + 0.35 * Math.sin(time * 2.4 - i * 0.6);
        tone = BEACON.love;
      } else if (act === 'spots') {
        level = run(1.1);
        tone = RAINBOW[(i + Math.floor(time * 2)) % RAINBOW.length];
      } else if (act === 'dance' || act === 'roll' || act === 'loop' || act === 'clap') {
        level = Math.sin(t * 2 * Math.PI * 1.4 + i) > 0 ? 1 : 0.25;
        tone = RAINBOW[(i + Math.floor(time * 4)) % RAINBOW.length];
      } else if (act === 'hiccup') {
        level = 0.5 + 0.5 * Math.sin(time * 20 + i * 1.7);
        tone = BEACON.surprised;
      } else if (act === 'doze') {
        level = 0.2 + 0.15 * Math.sin(time * 0.8);
      } else if (moving || act === 'skim' || act === 'flap') {
        level = run(1.3);
      } else if (this.hovered) tone = BEACON.happy;
      this.outfit.dot(i, level, tone);
    }
  }

  protected after(dt: number, env: Env) {
    const time = env.time;
    this.lights(time);
    if (this.flash >= 0) {
      this.flash += dt;
      if (this.flash > 1.4) this.flash = -1;
    }
    this.outfit.beacon(
      this.flash >= 0 && this.tone
        ? this.tone
        : ['spots', 'dance', 'roll', 'loop', 'clap'].includes(this.act)
          ? RAINBOW[Math.floor(time * 6) % RAINBOW.length]
          : (BEACON[this.expression] ?? BEACON.neutral!),
    );
    // Somersaulting about the width (the loop) and turning about the up axis (the roll).
    this.pivot.rotation.x = this.pitch;
    this.pivot.rotation.y = this.turn;
  }
}
