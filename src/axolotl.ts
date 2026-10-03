import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Act, Character, clamp, type Env } from './character';
import type { Expression, FaceLayout } from './face';
import { sin } from './moves';
import { bump, cycle, ease, FixedSpring } from './swimmer';

/**
 * Gilly, the robot axolotl: a soft pink-white toy with a wide flat head and a wide screen
 * face with a big smile, three frilly gill stalks on each side of it (each two bones ending
 * in a lit bulb, Dot0 low .. Dot2 high, the same both sides), a plump little body with a lit
 * stripe down the back (Dot3), splayed hands and a tail that curls out to the side.
 *
 * The gills say how she feels: a flutter that grows with her mood, spread wide and bright
 * when she is happy, snapped up when startled, drooping when she dozes. Tricks: a slow lazy
 * walk, floating up off the floor for a moment and drifting down again with her gills
 * spread and her hands and feet trailing, a big happy smile with her gills fanned, waving a
 * hand, a gill ripple of light, a waddling shimmy, a yawn, a peek round one side, a nod,
 * little clumsy hops, dozing, hiccups, a slow turn and looking round. Poke her and the gills
 * snap up and she hops; three pokes and she spins dizzy; rest the mouse on her and she
 * smiles, the gills glowing pink.
 */
export const AXOLOTL_FACE: FaceLayout = {
  width: 512,
  height: 288,
  eyes: [
    [0.26, 0.4],
    [0.74, 0.4],
  ],
  rx: 0.07,
  ry: 0.24,
  line: 0.036,
  mouth: [0.5, 0.74],
};

const SIDES = [
  ['L', 1],
  ['R', -1],
] as const;
const DEG = 180 / Math.PI;

export class Axolotl extends Character {
  /** Gills: flutter size, flutter rate (Hz), how far spread, how far lifted, how far drooped. */
  private flutter = new FixedSpring(3, 0.7);
  private rate = new FixedSpring(2, 0.8, 1, 0.8);
  private fan = new FixedSpring(3, 0.5);
  private perk = new FixedSpring(5, 0.4);
  private droop = new FixedSpring(2, 0.8);
  private float = new FixedSpring(1.1, 0.85);
  private hopper = new FixedSpring(7, 0.35);
  private pokes: number[] = [];
  private hover = 0;
  private flash = -1;
  private tone: string | undefined;
  private phase = 0;
  private spin = 0;

  constructor(model: Object3D) {
    const feels: Record<string, { f: number; zeta: number; r?: number }> = {
      default: { f: 4, zeta: 0.5 },
      root: { f: 2.4, zeta: 0.6 },
      body: { f: 3, zeta: 0.5, r: 0.5 },
      head: { f: 3.5, zeta: 0.45 },
      face: { f: 3.5, zeta: 0.45 },
    };
    for (const [n] of SIDES) {
      feels[`arm.${n}`] = { f: 5, zeta: 0.4 };
      feels[`leg.${n}`] = { f: 5, zeta: 0.4 };
      for (let k = 0; k < 3; k++) {
        feels[`gill.${n}${k}.1`] = { f: 6, zeta: 0.5 };
        feels[`gill.${n}${k}.2`] = { f: 6.5, zeta: 0.4 };
      }
    }
    for (let k = 1; k <= 3; k++) feels[`tail.${k}`] = { f: 3 + k * 0.3, zeta: 0.35 };
    super(
      {
        name: 'Gilly',
        model: 'axolotl',
        metres: 0.24,
        width: 0.34,
        size: 0.8,
        feels: feels as never,
        face: AXOLOTL_FACE,
        eyes: 0.57,
        gaze: [
          { bone: 'head', yaw: 0.6, pitch: 0.4 },
          { bone: 'face', yaw: 0.3, pitch: 0.3 },
        ],
        reach: { yaw: 40, pitch: 22 },
        lag: 1.3,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 0.55,
        turn: 55,
      },
      model,
    );
    this.acts = this.moves();
  }

  private moves(): Record<string, Act> {
    const still = () => !this.walking;
    const stroll = (far: number, speed = 0.55) => {
      this.spec.speed = speed;
      const way = Math.random() < 0.5 ? -1 : 1;
      this.walkTo(this.s + way * this.heightPx * far * (0.7 + Math.random() * 0.6));
    };
    return {
      idle: { weight: 3, length: [3, 6] },
      stroll: { weight: 3, length: [5, 8], when: still, start: () => stroll(2) },
      float: { weight: 1.6, length: [6, 6.6], face: 'happy', when: still },
      smile: { weight: 1.3, length: [4.4, 5], face: 'happy', when: still },
      wave: { weight: 1.1, length: [4, 4.6], face: 'happy', when: still },
      ripple: { weight: 1, length: [4.4, 5], face: 'happy', when: still },
      shimmy: { weight: 1, length: [4.6, 5.2], face: 'happy', when: still },
      yawn: { weight: 0.9, length: [4, 4.6], face: 'sleepy', when: still },
      peek: { weight: 0.9, length: [5.4, 6], when: still },
      nod: { weight: 0.9, length: [3.4, 4], face: 'happy', when: still },
      hop: { weight: 1, length: [4, 4.6], face: 'happy', when: still },
      doze: { weight: 0.7, length: [9, 13], face: 'asleep', when: still },
      hiccup: { weight: 0.7, length: [4, 4.4], when: still },
      twirl: { weight: 0.8, length: [3.8, 4.2], face: 'happy', when: still },
      look: { weight: 1, length: [4, 5], when: still },
      poked: { weight: 0, length: [3.6, 4], face: 'surprised' },
      love: { weight: 0, length: [4, 5], face: 'love' },
      dizzy: { weight: 0, length: [5, 5] },
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
      this.flash = 0;
      this.tone = BEACON.surprised;
      this.puppet.kick('body', 30);
      this.hopper.kick(14);
      this.setAct('poked');
    }
  }

  protected idle(t: number) {
    const p = this.puppet;
    p.shift('root', 0, 0.002 * sin(t, 0.4), 0);
    p.add('body', 1.5 * sin(t, 0.22), 0, 1.5 * sin(t, 0.17));
    p.add('head', 2 * sin(t, 0.3), 3 * sin(t, 0.19), 0);
    for (const [n, s] of SIDES) {
      p.add(`arm.${n}`, 0, 0, 3 * sin(t, 0.3, s * 0.2));
    }
    p.add('tail.1', 0, 5 * sin(t, 0.35), 0);
    p.add('tail.2', 0, 7 * sin(t, 0.35, 0.15), 0);
    p.add('tail.3', 0, 8 * sin(t, 0.35, 0.3), 0);
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    const t = this.actT;
    const act = this.act;
    const time = env.time;
    const left = this.actLength - t;
    const crossed = (at: number) => t >= at && t - dt < at;
    let face: Expression = this.hovered ? 'happy' : 'neutral';
    let flutter = 0.8;
    let rate = 0.9;
    let fan = 0.2;
    let perk = 0;
    let droop = 0;
    let float = 0;
    let hop = 0;
    let head = 0;
    let body = 0;
    let sway = 0;
    let wave = 0;
    let spinTo: number | null = null;
    const arm = { L: 0, R: 0 };

    this.hover = this.hovered ? this.hover + dt : 0;
    if (this.hover > 0.9 && ['idle', 'stroll', 'look'].includes(act)) this.setAct('love');

    switch (act) {
      case 'poked':
        flutter = 3;
        rate = 4;
        perk = left > 1.6 ? 1 : ease(left / 1.6);
        fan = 0.8 * perk;
        face = t < 0.5 ? 'surprised' : left > 1.6 ? 'cross' : 'happy';
        hop = t < 0.3 ? 1 : 0;
        break;
      case 'float': {
        // Up off the floor, gills spread and fluttering, hands and feet trailing; down again.
        float = t > 0.3 && left > 2.6 ? 1 : 0;
        const k = this.float.y;
        flutter = 1.6 + 1.2 * k;
        rate = 1.6;
        fan = 0.9 * k;
        arm.L = arm.R = 0.7 * k;
        sway = 8 * Math.sin(t * 1.1) * k;
        face = 'happy';
        break;
      }
      case 'smile': {
        const k = ease(Math.min(t / 0.6, left / 0.6));
        flutter = 1.8;
        rate = 1.8;
        fan = 0.9 * k;
        perk = 0.4 * k;
        body = 3 * Math.sin(t * 3) * k;
        head = -6 * k;
        break;
      }
      case 'wave': {
        const k = ease(Math.min(t / 0.6, left / 0.6));
        arm.L = 1.1 * k;
        wave = k * Math.sin(t * 7);
        fan = 0.5 * k;
        flutter = 1.3;
        head = 6 * k;
        break;
      }
      case 'ripple':
        flutter = 2.4;
        rate = 1.4;
        fan = 0.6;
        body = 2 * Math.sin(t * 2);
        break;
      case 'shimmy': {
        const k = ease(Math.min(t / 0.6, left / 0.6));
        const b = Math.sin(t * 2 * Math.PI * 1.3);
        body = 9 * b * k;
        sway = 5 * b * k;
        fan = 0.4;
        flutter = 1.5;
        p.add('tail.1', 0, 25 * -b * k);
        p.add('tail.2', 0, 25 * -Math.sin(t * 2 * Math.PI * 1.3 - 0.7) * k);
        break;
      }
      case 'yawn': {
        const k = ease(Math.min(t / 1.2, left / 1.2));
        head = -14 * k;
        fan = 0.9 * k;
        flutter = 0.5;
        perk = 0.3 * k;
        face = k > 0.4 ? 'surprised' : 'sleepy';
        arm.L = arm.R = 0.5 * k;
        break;
      }
      case 'peek': {
        const k = ease(Math.min(t / 0.9, left / 0.9));
        p.add('head', 6 * k, 0, 18 * k * Math.sin(t * 0.9));
        p.add('body', 0, 12 * k * Math.sin(t * 0.9));
        perk = 0.5 * k;
        face = t < 2 ? 'neutral' : t < 4 ? 'focused' : 'surprised';
        break;
      }
      case 'nod':
        head = 14 * Math.sin(t * 2 * Math.PI * 1.2) * ease(Math.min(t, left));
        fan = 0.5;
        flutter = 1.4;
        break;
      case 'hop': {
        // Little clumsy hops, one after another, gills flopping.
        if (Math.floor(t * 1.3) !== Math.floor((t - dt) * 1.3) && t > 0.2 && left > 1) hop = 1;
        flutter = 2.2;
        rate = 2.4;
        fan = 0.7;
        break;
      }
      case 'doze': {
        const k = ease(t / 2.4);
        droop = k;
        flutter = 0.35;
        rate = 0.4;
        fan = 0;
        head = 14 * k;
        body = 5 * k;
        break;
      }
      case 'hiccup':
        for (const at of [0.7, 1.6, 2.5]) {
          if (crossed(at)) {
            p.kick('body', -22);
            p.kick('head', -24);
            this.flash = 0;
            this.tone = BEACON.surprised;
            this.hopper.kick(9);
            this.flutter.kick(30);
          }
        }
        face = [0.7, 1.6, 2.5].some((x) => t > x && t < x + 0.25) ? 'surprised' : 'neutral';
        break;
      case 'twirl':
        spinTo = 2 * Math.PI * ease((t - 0.3) / 3);
        fan = 0.9;
        flutter = 1.8;
        rate = 1.8;
        break;
      case 'look':
        p.add('head', 0, 34 * Math.sin(t * 1.4), 5 * Math.sin(t * 1.4));
        p.add('body', 0, 10 * Math.sin(t * 1.4 - 0.5));
        break;
      case 'love': {
        const k = ease(Math.min(t / 0.8, left / 0.8));
        face = 'love';
        flutter = 1.6;
        rate = 1.4;
        fan = 0.9 * k;
        body = 5 * Math.sin(t * 2.2);
        head = -4 * k;
        break;
      }
      case 'dizzy': {
        const u = clamp((t - 0.2) / 2.6, 0, 1);
        spinTo = 4 * Math.PI * u * u * (3 - 2 * u);
        face = 'dizzy';
        flutter = 2.4;
        rate = 3;
        body = 7 * Math.sin(time * 5);
        break;
      }
    }
    this.expression = face;
    // Mood in the gills at rest: a petted or happy one spreads and flutters more.
    if (this.hovered && act === 'idle') [fan, flutter] = [0.6, 1.4];

    this.spin = spinTo ?? 0;
    const fl = this.flutter.update(dt, flutter);
    const r = this.rate.update(dt, rate);
    const fa = this.fan.update(dt, fan);
    const pe = this.perk.update(dt, perk);
    const dr = this.droop.update(dt, droop);
    const fo = this.float.update(dt, float);
    const hp = this.hopper.update(dt, 0);
    this.phase += dt * 2 * Math.PI * r;
    this.h = (fo * 0.85 + Math.max(0, hp) * 0.12) * this.heightPx;
    if (hop) this.hopper.kick(15);

    for (const [n, s] of SIDES) {
      for (let k = 0; k < 3; k++) {
        const wave1 = Math.sin(this.phase - k * 0.7);
        const wave2 = Math.sin(this.phase - k * 0.7 - 0.9);
        const base = fa * (k - 1) * 20 + pe * 22 - dr * 38 + fa * 8;
        p.add(`gill.${n}${k}.1`, 0, 0, s * (base + fl * 6 * wave1));
        p.add(`gill.${n}${k}.2`, 0, 0, s * (base * 0.5 + fl * 12 * wave2));
      }
      // Hands: out to the sides when floating or waving; a wave is the left one's.
      const a = arm[n];
      const w = n === 'L' ? wave : 0;
      p.add(`arm.${n}`, -10 * fo, 0, s * (a * 55 + 18 * w));
      p.add(`leg.${n}`, 18 * fo, 0, s * -16 * fo);
    }
    // The walk: lazy; hands and feet in opposite pairs, the tail swinging against the hips.
    const speed = (this.spec.speed ?? 1) * env.frame.bot;
    const mv = clamp(this.stride / speed, 0, 1.6);
    const g = Math.sin(this.gait);
    for (const [n, s] of SIDES) {
      const ph = s > 0 ? g : -g;
      p.add(`arm.${n}`, -26 * mv * ph, 0, 0);
      p.add(`leg.${n}`, 26 * mv * ph, 0, 0);
    }
    p.add('body', 0, 4 * mv * g, body + 2 * mv * Math.cos(this.gait * 2) + sway);
    p.add('head', head, -3 * mv * g, 0);
    p.add('tail.1', 0, -10 * mv * g, 0);
    p.add('tail.2', 0, -14 * mv * Math.sin(this.gait - 0.8), 0);
    p.add('tail.3', 0, -16 * mv * Math.sin(this.gait - 1.6), 0);
    if (this.spin) p.swing('root', this.spin * DEG);
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
    for (let i = 0; i < 4; i++) {
      let level = 0.5 + 0.2 * Math.sin(time * 1.1 - i * 0.8);
      let tone: string | undefined;
      const run = (speed: number) => 0.3 + 0.7 * bump(cycle(time * speed) * 1.5 - i * 0.3, 0.3);
      if (act === 'poked' && t < 0.8) {
        level = Math.sin(time * 34) > 0 ? 1 : 0.3;
        tone = BEACON.surprised;
      } else if (act === 'dizzy') {
        level = Math.sin(time * 7 + i * 2.3) > 0.2 ? 1 : 0.15;
        tone = RAINBOW[(i + Math.floor(time * 3)) % RAINBOW.length];
      } else if (act === 'love') {
        level = 0.65 + 0.35 * Math.sin(time * 2.4 - i * 0.6);
        tone = BEACON.love;
      } else if (act === 'ripple') {
        level = run(1.1);
        tone = RAINBOW[(i + Math.floor(time * 2)) % RAINBOW.length];
      } else if (act === 'float' || act === 'smile' || act === 'twirl' || act === 'shimmy') {
        level = 0.55 + 0.45 * Math.sin(time * 4 - i * 1.1);
        tone =
          act === 'smile' ? BEACON.happy : RAINBOW[(i + Math.floor(time * 3)) % RAINBOW.length];
      } else if (act === 'hiccup') {
        level = 0.5 + 0.5 * Math.sin(time * 20 + i * 1.7);
        tone = BEACON.surprised;
      } else if (act === 'doze') {
        level = 0.18 + 0.12 * Math.sin(time * 0.8);
      } else if (walk > 0.25) level = run(0.9);
      else if (this.hovered) tone = BEACON.happy;
      this.outfit.dot(i, level, tone);
    }
    this.outfit.beacon(
      this.flash >= 0 && this.tone
        ? this.tone
        : act === 'float' || act === 'ripple' || act === 'twirl'
          ? RAINBOW[Math.floor(time * 6) % RAINBOW.length]
          : (BEACON[this.expression] ?? BEACON.neutral!),
    );
  }
}
