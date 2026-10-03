import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { clamp, type Env } from './character';
import type { Expression, FaceLayout } from './face';
import { sin } from './moves';
import { Fishy } from './fishy';
import { bump, cycle, ease, type Point, type Spot } from './swimmer';

/**
 * Echo, the robot dolphin: a sleek grey torpedo with a rounded melon head, a blunt beak with a
 * smile line, a swept dorsal fin, two flippers, a pale belly and horizontal flukes that pump
 * up and down. Its screen face sits in the melon; a lit blowhole and lit stripes run down its
 * flanks. Four rings of light wait inside the melon, for the ripples of its clicks.
 *
 * Tricks: leaping out of the swim band in an arc, spinning once along its length in the air,
 * and diving back; clicking (rings of light ripple out of the melon ahead of it); a long spin
 * along its length; walking on its tail; a spy-hop (up on its tail to peek over the edge of the
 * band); a whistle (a quick run of little ripples), and the shared sea tricks. Poke it and it
 * clicks sharply and darts off; three pokes and it spins dizzy; rest the mouse on it and it
 * rolls onto its side and smiles.
 */
export const DOLPHIN_FACE: FaceLayout = {
  width: 512,
  height: 288,
  eyes: [
    [0.3, 0.45],
    [0.7, 0.45],
  ],
  rx: 0.09,
  ry: 0.27,
  line: 0.036,
  mouth: [0.5, 0.8],
};

const CLICK = ['click.0', 'click.1', 'click.2', 'click.3'];

export class Dolphin extends Fishy {
  /** Ages of the bursts of ripples sent out so far (s). */
  private bursts: number[] = [];

  constructor(model: Object3D) {
    const feels: Record<string, { f: number; zeta: number; r?: number }> = {
      default: { f: 3, zeta: 0.5 },
      root: { f: 1.4, zeta: 0.6 },
      body: { f: 1.8, zeta: 0.45, r: 0.5 },
      face: { f: 4, zeta: 0.5 },
      dorsal: { f: 4, zeta: 0.4 },
      'fin.L': { f: 5, zeta: 0.4 },
      'fin.R': { f: 5, zeta: 0.4 },
      'tail.1': { f: 3.2, zeta: 0.35 },
      'tail.2': { f: 3.6, zeta: 0.3 },
    };
    super(
      {
        name: 'Echo',
        model: 'dolphin',
        metres: 0.34,
        width: 0.74,
        size: 1.25,
        feels: feels as never,
        face: DOLPHIN_FACE,
        eyes: 0.5,
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
      {
        tail: ['tail.1', 'tail.2'],
        tailAxis: 0,
        tailDeg: [4, 16],
        fins: ['fin.L', 'fin.R'],
        dorsal: 'dorsal',
        dots: 3,
      },
    );
    this.idleTurn = 40;
    this.inset = 0.8;
    const still = this.still;
    this.acts = {
      ...this.baseActs(),
      leap: { weight: 1.6, length: [4.6, 5], face: 'surprised', when: still },
      click: { weight: 1.5, length: [5.2, 5.8], face: 'focused', when: still },
      spin: { weight: 1.2, length: [3.6, 4], face: 'happy', when: still },
      tailwalk: { weight: 1.2, length: [6.4, 7], face: 'happy', when: still },
      spyhop: { weight: 0.9, length: [5.4, 6], face: 'surprised', when: still },
      whistle: { weight: 0.9, length: [4.4, 5], face: 'happy', when: still },
    };
  }

  protected busy() {
    return ['leap', 'poked', 'tailwalk', 'spyhop'].includes(this.act);
  }

  protected depthFor(act: string) {
    if (['leap', 'click', 'whistle', 'tailwalk', 'spyhop', 'spin'].includes(act)) return 0.1;
    return super.depthFor(act);
  }

  protected startle() {
    this.bursts.push(0, -0.12);
    super.startle();
  }

  /** Where it is in its leap, 0..1 (0 and 1 in the band). */
  private leapU() {
    return clamp((this.actT - 0.4) / 3, 0, 1);
  }

  protected station(env: Env, s: Spot): Point {
    const base = super.station(env, s);
    const t = this.actT;
    const left = this.actLength - t;
    const H = s.H;
    let x = 0;
    let y = 0;
    switch (this.act) {
      case 'leap': {
        const u = this.leapU();
        x = this.toward * H * 2.4 * (u - 0.5);
        y = -H * 2.1 * Math.sin(Math.PI * u);
        break;
      }
      case 'spin':
        y = -H * 0.1 * bump(t - 1.8, 1.8);
        break;
      case 'tailwalk': {
        const k = ease(Math.min(t / 0.9, left / 0.9));
        x = this.toward * H * 1.1 * Math.sin(t * 0.8) * k;
        y = -H * (0.55 * k + 0.1 * Math.abs(Math.sin(t * 4.2)) * k);
        break;
      }
      case 'spyhop': {
        const k = ease(Math.min(t / 1.2, left / 1.2));
        y = -H * 0.75 * k;
        break;
      }
      case 'whistle':
        y = -H * 0.08 * ease(Math.min(t, left));
        break;
    }
    return { x: base.x + x, y: base.y + y };
  }

  protected fast() {
    return this.act === 'leap' ? 3.4 : super.fast();
  }

  protected turnFor(fade: number) {
    switch (this.act) {
      case 'leap':
      case 'tailwalk':
      case 'spyhop':
        return this.toward * 82 * fade;
      case 'click':
      case 'whistle':
        return this.toward * 62 * fade;
      case 'spin':
        return this.toward * 78 * fade;
      default:
        return super.turnFor(fade);
    }
  }

  protected leanFor() {
    const t = this.actT;
    const left = this.actLength - t;
    switch (this.act) {
      case 'leap': {
        // Nose up on the way up, level at the top, nose down on the way over.
        const u = this.leapU();
        return this.toward * 1.15 * Math.cos(Math.PI * u) * Math.sin(Math.PI * u + 0.3);
      }
      case 'tailwalk':
        return (
          this.toward * (1.38 * ease(Math.min(t / 0.9, left / 0.9)) + 0.08 * Math.sin(t * 4.2))
        );
      case 'spyhop':
        return this.toward * 1.1 * ease(Math.min(t / 1.2, left / 1.2));
      case 'whistle':
        return this.toward * 0.22 * ease(Math.min(t, left));
      case 'love':
        return 0.5 * ease(Math.min(t / 0.6, 1)) * Math.sin(t * 1.6 + 1.5);
      default:
        return super.leanFor();
    }
  }

  protected idle(t: number) {
    super.idle(t);
    this.puppet.add('dorsal', 0, 0, 2 * sin(t, 0.3));
  }

  protected special(dt: number, env: Env) {
    const p = this.puppet;
    const t = this.actT;
    const left = this.actLength - t;
    const act = this.act;
    const crossed = (at: number) => t >= at && t - dt < at;
    let face: Expression | null = null;
    this.spinning = this.spinning || ['leap', 'tailwalk', 'spyhop'].includes(act);
    const burst = (extra = 0) => this.bursts.push(extra);
    switch (act) {
      case 'leap': {
        const u = this.leapU();
        face = u > 0.15 && u < 0.85 ? 'happy' : 'surprised';
        // A turn along its length at the top.
        const s = ease((u - 0.3) / 0.4);
        this.roll = 2 * Math.PI * s * this.toward;
        this.spinning = true;
        if (crossed(0.4)) {
          p.kick('tail.1', 120);
          this.flash = 0;
          this.tone = BEACON.surprised;
        }
        if (crossed(3.4)) burst(-0.3);
        break;
      }
      case 'click': {
        // A slow pair, then faster, then a rush.
        for (const at of [0.8, 1.6, 2.2, 2.7, 3.1, 3.4, 3.7, 3.95, 4.2]) if (crossed(at)) burst();
        face = t % 1.3 < 0.2 ? 'surprised' : 'focused';
        p.add('face', -6, 0, 0);
        break;
      }
      case 'spin': {
        const u = ease((t - 0.2) / 3);
        this.roll = 4 * Math.PI * u * this.toward;
        this.spinning = true;
        break;
      }
      case 'tailwalk': {
        const k = ease(Math.min(t / 0.9, left / 0.9));
        face = k > 0.5 ? 'happy' : 'surprised';
        this.wave.update(dt, 0.8 * k);
        break;
      }
      case 'spyhop':
        face = t < 1.6 ? 'surprised' : t < 3.8 ? 'focused' : 'happy';
        p.add('body', 5 * Math.sin(t * 1.5), 14 * Math.sin(t * 1.1), 0);
        break;
      case 'whistle': {
        for (let at = 0.5; at < left + t - 0.8; at += 0.32) if (crossed(at)) burst(-0.1);
        face = 'happy';
        p.add('body', -8 * ease(Math.min(t, left)), 0, 0);
        break;
      }
      case 'poked':
        face = t < 0.5 ? 'surprised' : t < 2.4 ? 'cross' : 'sleepy';
        break;
      case 'love':
        // On its side, smiling.
        this.roll = 0.5 * ease(t / 0.8) * Math.sin(t * 1.6);
        break;
    }
    if (face) this.expression = face;
  }

  protected extra(dt: number, env: Env) {
    const p = this.puppet;
    this.bursts = this.bursts.map((a) => a + dt).filter((a) => a < 2);
    // Each ring of a burst grows and runs out ahead of the melon, thinning as it goes.
    CLICK.forEach((b, i) => {
      let k = 0;
      let rise = 0;
      for (const a of this.bursts) {
        const u = (a - i * 0.2) / 1.0;
        if (u > 0 && u < 1) {
          const kk = bump(u - 0.35, 0.65);
          if (kk > k) [k, rise] = [kk, u];
        }
      }
      const across = k > 0.01 ? 0.3 + 1.3 * rise : 0.001;
      p.stretch(b, Math.max(0.001, k), [0, 0, 1], across);
      p.shift(b, 0, 0, k > 0.01 ? 0.12 + 0.75 * rise : 0);
    });
    void env;
  }

  protected lights(time: number) {
    const act = this.act;
    const t = this.actT;
    this.defaultLights(time);
    // Dot1 is the blowhole; it flashes with each click.
    const fresh = this.bursts.length ? Math.max(...this.bursts.map((a) => bump(a - 0.1, 0.25))) : 0;
    this.outfit.dot(
      1,
      0.4 + 0.6 * fresh,
      act === 'click' || act === 'whistle' ? BEACON.focused : undefined,
    );
    if (act === 'click' || act === 'whistle') {
      // The stripes run back from the melon with each burst.
      for (const [i, dot] of [0, 2].entries()) {
        const run = this.bursts.length
          ? Math.max(...this.bursts.map((a) => bump(a * 3 - 0.5 - i * 0.25, 0.4)))
          : 0;
        this.outfit.dot(dot, 0.25 + 0.75 * run, BEACON.focused);
      }
    } else if (act === 'leap' || act === 'spin' || act === 'tailwalk') {
      for (const dot of [0, 2])
        this.outfit.dot(
          dot,
          Math.sin(time * 12 + dot * 2) > 0 ? 1 : 0.25,
          RAINBOW[(dot + Math.floor(time * 5)) % RAINBOW.length],
        );
      void t;
      void cycle;
    }
  }

  protected beaconTone(time: number): string {
    return this.flash >= 0 && this.tone
      ? this.tone
      : ['click', 'whistle'].includes(this.act)
        ? BEACON.focused!
        : ['leap', 'spin', 'tailwalk', 'dance', 'roll'].includes(this.act)
          ? RAINBOW[Math.floor(time * 6) % RAINBOW.length]
          : (BEACON[this.expression] ?? BEACON.neutral!);
  }
}
