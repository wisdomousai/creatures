import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Env } from './character';
import type { Expression, FaceLayout } from './face';
import { sin } from './moves';
import { Fishy } from './fishy';
import { bump, cycle, ease, FixedSpring, type Point, ripple, type Spot } from './swimmer';

/**
 * Dusk, the robot anglerfish: a round dark-shelled deep-sea fish with a screen face high on its
 * front, a big toy underbite (a hinged jaw with chunky ivory teeth) and, over its head, a bendy
 * four-piece rod ending in the lure: a round bulb that is its beacon, in a lit halo. The lure
 * is its light, and it sways.
 *
 * Tricks: dangling the lure in front of its face and going cross-eyed over it, the lure blinking
 * out and the fish panicking in the dark (then relief when it relights), a gulp (the jaw
 * opens wide and snaps, a lit swallow running down it), blinking the lure in a code, whirling it
 * like a lasso, glowing in rainbow, and the shared sea tricks (a swim, a nod, a flipper wave, a
 * barrel roll, peeking from the back wall, dozing, a dance, hiccups, a dart, a bow). Poke it
 * and the lure goes out for a moment and it bolts; three pokes and it spins dizzy; rest the
 * mouse on it and the lure glows warm.
 */
export const ANGLERFISH_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.3, 0.5],
    [0.7, 0.5],
  ],
  rx: 0.11,
  ry: 0.3,
  line: 0.038,
  mouth: [0.5, 0.8],
};

const LURE = ['lure.1', 'lure.2', 'lure.3', 'lure.4'];
const OFF = '#3a3a38';
/** The code it blinks: on-times and off-times in seconds, a dot dot dash... */
const CODE = [
  0.25, 0.2, 0.25, 0.2, 0.25, 0.5, 0.7, 0.2, 0.7, 0.2, 0.7, 0.5, 0.25, 0.2, 0.25, 0.2, 0.25,
];

export class Anglerfish extends Fishy {
  static readonly terms =
    'deep sea fish blue periwinkle navy teeth toothy underbite jaw lure lamp lantern light glow glowing rod fishing bulb dark ivory cream';

  private jaw = new FixedSpring(8, 0.45);
  private curl = new FixedSpring(3, 0.55);
  private swing = new FixedSpring(2.5, 0.4);
  private whirl = 0;
  private bulge = new FixedSpring(5, 0.4);

  constructor(model: Object3D) {
    const lure = { f: 3.6, zeta: 0.3 };
    const feels: Record<string, { f: number; zeta: number; r?: number }> = {
      default: { f: 3, zeta: 0.5 },
      root: { f: 1.4, zeta: 0.6 },
      body: { f: 1.8, zeta: 0.45, r: 0.5 },
      face: { f: 4, zeta: 0.5 },
      jaw: { f: 8, zeta: 0.45 },
      dorsal: { f: 4, zeta: 0.4 },
      'fin.L': { f: 5, zeta: 0.4 },
      'fin.R': { f: 5, zeta: 0.4 },
      'tail.1': { f: 3.2, zeta: 0.35 },
      'tail.2': { f: 3.6, zeta: 0.3 },
    };
    for (const b of LURE) feels[b] = lure;
    super(
      {
        name: 'Dusk',
        model: 'anglerfish',
        metres: 0.4,
        width: 0.52,
        size: 1.25,
        feels: feels as never,
        face: ANGLERFISH_FACE,
        eyes: 0.45,
        gaze: [{ bone: 'body', yaw: 0.5, pitch: 0.35 }],
        reach: { yaw: 50, pitch: 25 },
        lag: 1.2,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 1.3,
        turn: 70,
      },
      model,
      { tail: ['tail.1', 'tail.2'], fins: ['fin.L', 'fin.R'], dorsal: 'dorsal', dots: 3 },
    );
    this.inset = 0.72;
    const still = this.still;
    this.acts = {
      ...this.baseActs(),
      dangle: { weight: 1.2, length: [5.4, 6], face: 'focused', when: still },
      blackout: { weight: 1, length: [7, 7.6], face: 'surprised', when: still },
      gulp: { weight: 1.1, length: [4.6, 5], face: 'happy', when: still },
      signal: { weight: 0.9, length: [6, 6.6], face: 'focused', when: still },
      lasso: { weight: 0.9, length: [4.6, 5.2], face: 'determined', when: still },
      glow: { weight: 1, length: [4.4, 5], face: 'happy', when: still },
    };
  }

  protected busy() {
    return ['blackout', 'gulp', 'poked'].includes(this.act);
  }

  protected depthFor(act: string) {
    if (['dangle', 'gulp', 'glow', 'signal', 'lasso'].includes(act)) return 0.1;
    return super.depthFor(act);
  }

  protected startle() {
    this.puppet.kick('lure.1', -60);
    this.puppet.kick('lure.3', 80);
    super.startle();
  }

  protected station(env: Env, s: Spot): Point {
    const base = super.station(env, s);
    const t = this.actT;
    const H = s.H;
    let x = 0;
    let y = 0;
    switch (this.act) {
      case 'blackout':
        if (t > 0.5 && t < 4.6) {
          // Scared in the dark: darting about on the spot.
          x = H * 0.16 * Math.sin(t * 7.3) * Math.sin(t * 2.1);
          y = H * 0.1 * Math.sin(t * 5.1 + 1);
        }
        break;
      case 'gulp':
        x = this.toward * H * 0.18 * (bump(t - 0.9, 0.5) + bump(t - 2.4, 0.5));
        break;
      case 'dangle':
        y = H * 0.05 * Math.sin(t * 1.3);
        break;
      case 'poked':
        x = Math.sin(t * 9) * H * 0.04 * (t < 1.5 ? 1 : 0);
        break;
    }
    return { x: base.x + x, y: base.y + y };
  }

  protected turnFor(fade: number) {
    switch (this.act) {
      case 'dangle':
      case 'glow':
      case 'signal':
        return this.toward * 22 * fade;
      case 'gulp':
        return this.toward * 55 * fade;
      case 'blackout':
        return 30 * Math.sin(this.actT * 5) * fade;
      default:
        return super.turnFor(fade);
    }
  }

  protected leanFor() {
    const t = this.actT;
    switch (this.act) {
      case 'gulp':
        return this.toward * -0.25 * (bump(t - 0.9, 0.6) + bump(t - 2.4, 0.6));
      case 'dangle':
        return this.toward * 0.12 * ease(Math.min(t, this.actLength - t));
      case 'blackout':
        return 0.12 * Math.sin(t * 9) * (t > 0.5 && t < 4.6 ? 1 : 0.2);
      default:
        return super.leanFor();
    }
  }

  protected idle(t: number) {
    super.idle(t);
    const p = this.puppet;
    p.add('jaw', 2 * sin(t, 0.3), 0, 0);
    LURE.forEach((b, i) => p.add(b, 4 * sin(t, 0.3, i * 0.25), 3 * sin(t, 0.22, i * 0.3), 0));
  }

  /** Is the lure lit: 0..1 (dark, then a flicker, then on). */
  private lureOn(): number {
    const t = this.actT;
    switch (this.act) {
      case 'poked':
        return t < 0.25 ? 1 : t < 2.2 ? 0 : t < 2.6 ? (Math.sin(t * 40) > 0 ? 1 : 0) : 1;
      case 'blackout':
        if (t < 0.5) return Math.sin(t * 38) > 0 ? 1 : 0.1;
        if (t < 4.6) return 0;
        if (t < 5.2) return Math.sin(t * 30) > 0 ? 1 : 0;
        return 1;
      case 'signal': {
        let at = 0.6;
        for (let i = 0; i < CODE.length; i++) {
          if (this.actT < at) return 0;
          if (this.actT < at + CODE[i]) return i % 2 === 0 ? 1 : 0;
          at += CODE[i];
        }
        return this.actLength - this.actT > 0.3 ? 0 : 1;
      }
      case 'doze':
        return 0.3 + 0.2 * Math.sin(this.actT * 0.8);
      default:
        return 1;
    }
  }

  protected special(dt: number, env: Env) {
    const p = this.puppet;
    const t = this.actT;
    const left = this.actLength - t;
    const act = this.act;
    const crossed = (at: number) => t >= at && t - dt < at;
    let face: Expression | null = null;
    let jaw = 0;
    let curl = 0;
    let swing = 0;
    let bulge = 0;
    this.whirl = 0;
    switch (act) {
      case 'dangle': {
        const k = ease(Math.min(t / 1, left / 1));
        curl = k * (1 + 0.15 * Math.sin(t * 3));
        swing = k * 0.5 * Math.sin(t * 1.8);
        face = t < 1 ? 'focused' : Math.sin(t * 1.8) > 0.2 ? 'sheepish' : 'focused';
        jaw = k * 0.15 * (0.5 + 0.5 * Math.sin(t * 2));
        break;
      }
      case 'blackout': {
        const dark = t > 0.5 && t < 4.6;
        face = dark
          ? t > 2.4 && t < 3.2
            ? 'dizzy'
            : 'surprised'
          : t < 0.5
            ? 'surprised'
            : 'happy';
        if (dark) {
          // Trembling, the lure drooping and shaking.
          curl = -0.4;
          jaw = 0.25 + 0.2 * Math.sin(t * 25);
          p.add('body', 4 * Math.sin(t * 31), 5 * Math.sin(t * 27), 0);
          swing = 0.6 * Math.sin(t * 17);
        } else if (t > 4.6) {
          curl = 0.4;
          jaw = 0;
        }
        if (crossed(0.5) || crossed(4.6)) p.kick('body', -18);
        break;
      }
      case 'gulp': {
        // Open wide, lunge, snap, swallow; twice.
        for (const at of [0.5, 2.0]) {
          const u = t - at;
          if (u > 0 && u < 1.9) jaw = u < 0.55 ? ease(u / 0.35) : u < 0.7 ? 0 : 0;
          if (crossed(at + 0.55)) {
            p.kick('body', 30);
            p.kick('jaw', 80);
            this.flash = 0;
            this.tone = BEACON.happy;
          }
          bulge += bump(u - 0.9, 0.5);
        }
        face = t % 1.5 < 0.5 ? 'surprised' : 'happy';
        curl = -0.2 * jaw;
        break;
      }
      case 'signal': {
        face = this.lureOn() ? 'focused' : 'neutral';
        curl = 0.3;
        swing = 0.2 * Math.sin(t * 1.2);
        break;
      }
      case 'lasso': {
        const k = ease(Math.min(t / 0.8, left / 0.8));
        this.whirl = k;
        face = 'determined';
        curl = 0.2 * k;
        break;
      }
      case 'glow':
        curl = 0.3 + 0.2 * Math.sin(t * 2);
        swing = 0.3 * Math.sin(t * 1.4);
        break;
      case 'love':
        curl = 0.3;
        swing = 0.3 * Math.sin(t * 2.4);
        break;
      case 'doze':
        curl = -0.6 * ease(t / 2.5);
        break;
      case 'poked':
        curl = t < 2.2 ? -0.5 : 0.2;
        jaw = t < 1.5 ? 0.3 : 0;
        break;
      case 'hiccup':
        for (const at of [0.7, 1.6, 2.5]) if (crossed(at)) p.kick('lure.2', -90);
        jaw = [0.7, 1.6, 2.5].some((x) => t > x && t < x + 0.2) ? 0.4 : 0;
        break;
      case 'dizzy':
        swing = Math.sin(env.time * 9);
        break;
    }
    if (face) this.expression = face;
    this.jaw.update(dt, jaw);
    const cu = this.curl.update(dt, curl);
    const sw = this.swing.update(dt, swing);
    const bu = this.bulge.update(dt, bulge);
    // Each rod segment bends a share of the curl and swings a share.
    LURE.forEach((b, i) => p.add(b, cu * (14 + 6 * i), sw * 14, sw * 4));
    p.add('jaw', this.jaw.y * 34, 0, 0);
    p.stretch('body', 1 + 0.05 * bu, [0, 0, 1], 1 + 0.05 * bu);
  }

  protected extra(_dt: number, env: Env) {
    const p = this.puppet;
    // The lure whirls: pitch and yaw a quarter turn apart, travelling out along the rod.
    if (this.whirl > 0.01) {
      const ph = env.time * 9;
      ripple(p, LURE, ph, 26 * this.whirl, 0.5, 0, 0.2);
      ripple(p, LURE, ph + Math.PI / 2, 26 * this.whirl, 0.5, 1, 0.2);
    }
  }

  protected lights(time: number) {
    const act = this.act;
    const t = this.actT;
    this.defaultLights(time);
    const on = this.lureOn();
    // Dot1 is the halo round the lure.
    let halo = 0.25 + 0.75 * on;
    let tone: string | undefined;
    if (act === 'glow' || act === 'lasso') {
      halo = 0.6 + 0.4 * Math.sin(time * 8);
      tone = RAINBOW[Math.floor(time * 6) % RAINBOW.length];
    } else if (act === 'dangle' || act === 'signal') tone = BEACON.focused;
    else if (act === 'love' || this.hovered) tone = BEACON.love;
    this.outfit.dot(1, halo, tone);
    if (act === 'blackout' && t > 0.5 && t < 4.6) {
      this.outfit.dot(0, 0);
      this.outfit.dot(2, 0);
    } else if (act === 'gulp') {
      for (const at of [1.1, 2.6]) {
        const run = bump(cycle((t - at) * 1.6) * 1.2 - 0.3, 0.3) * (t > at && t < at + 1.2 ? 1 : 0);
        this.outfit.dot(0, 0.4 + 0.6 * run, BEACON.happy);
        this.outfit.dot(2, 0.4 + 0.6 * run, BEACON.happy);
      }
    } else if (act === 'glow') {
      this.outfit.dot(
        0,
        Math.sin(time * 6) > 0 ? 1 : 0.3,
        RAINBOW[Math.floor(time * 5) % RAINBOW.length],
      );
      this.outfit.dot(
        2,
        Math.sin(time * 6 + 2) > 0 ? 1 : 0.3,
        RAINBOW[Math.floor(time * 5 + 3) % RAINBOW.length],
      );
    }
  }

  protected beaconTone(time: number): string {
    const act = this.act;
    if (act === 'glow' || act === 'lasso') return RAINBOW[Math.floor(time * 6) % RAINBOW.length];
    const on = this.lureOn();
    if (on < 0.5) return OFF;
    if (this.flash >= 0 && this.tone) return this.tone;
    if (act === 'dangle' || act === 'signal') return BEACON.focused!;
    if (act === 'doze') return OFF;
    return BEACON[this.expression] ?? BEACON.neutral!;
  }
}
