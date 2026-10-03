import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Act, Character, clamp, type Env } from './character';
import type { Expression, FaceLayout } from './face';
import { sin } from './moves';
import { FixedSpring, bump, ease } from './swimmer';

/**
 * Tuck, the robot hermit crab. Nothing like Clack: a small round-backed body low to the floor, the
 * crew's screen face set into its front, two lit antennae, four short legs and two unequal claws
 * (one big, one tiny); and on its back, a tall spiral shell house of its own with a lit window
 * either side. The body is its own part: it can slide out of the house, walk away from it and
 * come home again, and a poke sends it back in with only its eyes peeking out of the doorway.
 *
 * Tricks: popping out of the shell for a look round; trying on a different house (an upside-down
 * mug, a hex nut or a bottle cap: it walks out to it, wears it, has an opinion, and goes home);
 * snapping the big claw, waving the small one, flexing, drumming, twirling its antennae, rocking
 * the house, a shuffling dance, a spin, a scuttle and a dash, dozing half inside, hiccups, and
 * looking round. Poke it and it ducks into the house, peeking out after a while; three pokes
 * and it spins dizzy; rest the mouse on it and it waves its little claw slowly.
 */
export const HERMITCRAB_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.3, 0.48],
    [0.7, 0.48],
  ],
  rx: 0.1,
  ry: 0.28,
  line: 0.038,
  mouth: [0.5, 0.8],
};

const SIDES = [
  ['L', 1],
  ['R', -1],
] as const;
const PROPS = ['cup', 'nut', 'cap'] as const;
/** The body's slide out of the house, in metres: hidden, home, half out, right out, over at a prop. */
const HIDDEN = -0.075;
const OUT = 0.13;
const FAR = 0.34;
/** A prop waits this far ahead of the house, and sits this far ahead of the house when worn on the body. */
const WAIT = 0.46;
const WORN = 0.12;

interface Claw {
  up: number;
  bend: number;
  jaw: number;
  inw: number;
}
const claw = (up = 0, bend = 0, jaw = 0.4, inw = 0): Claw => ({ up, bend, jaw, inw });

export class Hermitcrab extends Character {
  private arms: Record<'L' | 'R', Record<keyof Claw, FixedSpring>> = {
    L: this.clawSprings(),
    R: this.clawSprings(),
  };
  private slide = new FixedSpring(4.5, 0.65);
  private ants = new FixedSpring(4, 0.35);
  private tuck = new FixedSpring(4, 0.6);
  private rock = new FixedSpring(3, 0.45);
  private prop = PROPS.map(() => new FixedSpring(7, 0.45));
  private worn = 0;
  private side = 1;
  private spin = 0;
  private pokes: number[] = [];
  private hover = 0;
  private flash = -1;
  private tone: string | undefined;
  private beat = 0;
  private lastSlide = 0;
  private shuffleAmt = 0;

  constructor(model: Object3D) {
    const leg = { f: 6, zeta: 0.5 };
    const feels: Record<string, { f: number; zeta: number; r?: number }> = {
      default: { f: 3.5, zeta: 0.5 },
      root: { f: 2.4, zeta: 0.6 },
      house: { f: 3, zeta: 0.45, r: 0.5 },
      body: { f: 3, zeta: 0.5, r: 0.5 },
      face: { f: 3.4, zeta: 0.4 },
      'ant.L': { f: 5, zeta: 0.3 },
      'ant.R': { f: 5, zeta: 0.3 },
    };
    for (const [n] of SIDES) {
      feels[`arm.${n}.1`] = { f: 4, zeta: 0.45 };
      feels[`arm.${n}.2`] = { f: 4.5, zeta: 0.4 };
      feels[`claw.${n}`] = { f: 4.5, zeta: 0.4 };
      feels[`jaw.${n}`] = { f: 8, zeta: 0.5 };
      for (let i = 1; i <= 2; i++) {
        feels[`hip.${n}${i}`] = leg;
        feels[`shin.${n}${i}`] = leg;
      }
    }
    super(
      {
        name: 'Tuck',
        model: 'hermitcrab',
        metres: 0.34,
        width: 0.46,
        size: 1.0,
        feels: feels as never,
        face: HERMITCRAB_FACE,
        eyes: 0.28,
        gaze: [{ bone: 'face', yaw: 0.6, pitch: 0.5 }],
        reach: { yaw: 40, pitch: 22 },
        lag: 1.4,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 0.95,
      },
      model,
    );
    this.acts = this.moves();
  }

  private clawSprings() {
    return {
      up: new FixedSpring(5, 0.45, 1),
      bend: new FixedSpring(5, 0.45, 1),
      jaw: new FixedSpring(9, 0.5, 1, 0.4),
      inw: new FixedSpring(5, 0.5, 1),
    };
  }

  private moves(): Record<string, Act> {
    const still = () => !this.walking;
    const stroll = (far: number, speed = 0.95) => {
      this.spec.speed = speed;
      const way = Math.random() < 0.5 ? -1 : 1;
      this.walkTo(this.s + way * this.heightPx * far * (0.7 + Math.random() * 0.6));
    };
    return {
      idle: { weight: 3, length: [3, 6] },
      scuttle: { weight: 3, length: [5, 8], when: still, start: () => stroll(2.2) },
      dash: {
        weight: 0.9,
        length: [4, 6],
        face: 'focused',
        when: still,
        start: () => stroll(4.2, 2.1),
      },
      popout: { weight: 1.6, length: [7, 7.6], when: still },
      tryon: {
        weight: 1.8,
        length: [11.6, 12],
        when: still,
        start: () => {
          this.worn = Math.floor(Math.random() * PROPS.length);
          this.side = Math.random() < 0.5 ? 1 : -1;
        },
      },
      snap: { weight: 1.3, length: [4, 4.6], face: 'determined', when: still },
      wave: { weight: 1, length: [4, 4.6], face: 'happy', when: still },
      flex: { weight: 0.9, length: [4, 4.6], face: 'determined', when: still },
      drum: { weight: 0.9, length: [4, 4.6], face: 'focused', when: still },
      antennae: { weight: 1, length: [4, 4.6], face: 'happy', when: still },
      rock: { weight: 0.9, length: [5, 5.6], face: 'happy', when: still },
      hide: { weight: 0.7, length: [5, 5.6], when: still },
      doze: { weight: 0.7, length: [9, 13], face: 'asleep', when: still },
      dance: { weight: 0.9, length: [5, 6], face: 'happy', when: still },
      hiccup: { weight: 0.7, length: [4, 4.4], when: still },
      look: { weight: 1, length: [4, 5], when: still },
      pirouette: { weight: 0.8, length: [3.4, 3.8], face: 'happy', when: still },
      poked: { weight: 0, length: [4.6, 5], face: 'surprised' },
      love: { weight: 0, length: [4, 5], face: 'love' },
      dizzy: { weight: 0, length: [5, 5] },
    };
  }

  poke() {
    if (this.state !== 'here') return;
    const now = performance.now() / 1000;
    this.pokes = [...this.pokes.filter((at) => now - at < 3), now];
    if (this.pokes.length >= 3) {
      this.pokes = [];
      this.goal = null;
      this.setAct('dizzy');
    } else if (this.act !== 'dizzy') {
      this.goal = null;
      this.flash = 0;
      this.tone = BEACON.surprised;
      this.slide.kick(-1.4);
      this.puppet.kick('house', -30);
      this.setAct('poked');
    }
  }

  protected idle(t: number) {
    const p = this.puppet;
    p.shift('root', 0, 0.002 * sin(t, 0.4), 0);
    p.add('body', 1.5 * sin(t, 0.22), 0, 1.2 * sin(t, 0.17));
    p.add('face', 2 * sin(t, 0.3), 3 * sin(t, 0.19), 0);
    p.add('house', 0.8 * sin(t, 0.19), 0, 0.8 * sin(t, 0.23));
    p.add('ant.L', 6 * sin(t, 0.7), 0, 5 * sin(t, 0.5));
    p.add('ant.R', 6 * sin(t, 0.7, 1), 0, -5 * sin(t, 0.5, 1));
    for (const [n, s] of SIDES) p.add(`jaw.${n}`, 3 * sin(t, 0.4, s * 0.3), 0, 0);
  }

  /** The body's slide out of the house through a trying-on (metres), as a function of the act's clock. */
  private tryonSlide(t: number) {
    return (
      OUT * ease((t - 0.6) / 1.2) +
      (FAR - OUT) * ease((t - 1.8) / 1.8) -
      FAR * ease((t - 8.4) / 2.2)
    );
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    const t = this.actT;
    const act = this.act;
    const time = env.time;
    const left = this.actLength - t;
    const crossed = (at: number) => t >= at && t - dt < at;
    const L = claw();
    const R = claw();
    let face: Expression = this.hovered ? 'happy' : 'neutral';
    let slide = 0;
    let ants = 0;
    let tuck = 0;
    let rock = 0;
    let shuffle = 0;
    let spinning = false;
    let body = 0;
    let turned = 0;
    const props = [0, 0, 0];

    this.hover = this.hovered ? this.hover + dt : 0;
    if (this.hover > 0.9 && (act === 'idle' || act === 'scuttle' || act === 'look'))
      this.setAct('love');
    const both = (f: (c: Claw, s: number, i: number) => void) =>
      [L, R].forEach((c, i) => f(c, i === 0 ? 1 : -1, i));

    switch (act) {
      case 'poked':
      case 'hide': {
        // Ducked into the house, claws up over the face; eyes peek out at the end.
        const k =
          act === 'hide'
            ? ease(t / 0.6) * (left > 1.2 ? 1 : ease(left / 1.2))
            : left > 1.8
              ? 1
              : ease(left / 1.8);
        slide = HIDDEN * k;
        tuck = k;
        ants = -0.8 * k;
        both((c) => Object.assign(c, claw(0.7 * k, 0.8 * k, 0.05, 0.9 * k)));
        face = k > 0.5 ? (t < 0.4 && act === 'poked' ? 'surprised' : 'cross') : 'neutral';
        if (act === 'poked' && t < 0.4) face = 'surprised';
        // A peek from the doorway.
        if (t > 2.2 && t < 3.4) {
          slide = HIDDEN * 0.5;
          face = 'surprised';
        }
        break;
      }
      case 'popout': {
        // Out of the shell for a look round, and back.
        const out = ease((t - 0.4) / 1) * (left > 1.2 ? 1 : ease((left - 0.1) / 1.1));
        slide = OUT * out;
        shuffle = Math.abs(out - this.lastSlide / OUT) > 0.002 ? 1 : 0;
        ants = out * (0.5 + 0.5 * Math.sin(t * 5));
        face = out > 0.8 ? (Math.sin(t * 1.3) > 0.4 ? 'surprised' : 'happy') : 'neutral';
        p.add('face', 0, 26 * Math.sin(t * 1.5) * out, 0);
        both((c, s, i) =>
          Object.assign(c, claw(0.2 * out, 0.1, 0.4 + 0.3 * Math.sin(t * 3 + i), 0)),
        );
        break;
      }
      case 'tryon': {
        const k = ease(Math.min(t / 0.6, left / 0.8));
        turned = this.side * 70 * k;
        slide = this.tryonSlide(t);
        const w = this.worn;
        // The prop pops up ahead, hops onto the body, is worn a while, hops off, and goes.
        const appear = ease((t - 1.4) / 0.5) * (1 - ease((t - 8.7) / 0.5));
        const onU = ease((t - 3.7) / 0.5);
        const offU = ease((t - 7.4) / 0.5);
        const wearing = t > 3.9 && t < 7.4;
        props[w] = appear;
        const wornAt = WORN + slide;
        const z = WAIT + (wornAt - WAIT) * onU + 0.2 * offU;
        const hop = 0.07 * Math.sin(Math.PI * onU) + 0.06 * Math.sin(Math.PI * offU);
        this.propPose = {
          z,
          y: hop,
          roll: wearing ? 5 * Math.sin(t * 6) * (w === 1 ? 0.3 : 1) : 0,
        };
        shuffle = Math.abs(slide - this.lastSlide) > 0.0004 ? 1 : 0;
        if (wearing) {
          const strut = Math.sin((t - 3.9) * 2.4);
          body = 6 * strut;
          shuffle = 0.4;
          // Its opinion of the new house.
          face =
            w === 0
              ? 'happy'
              : w === 1
                ? t < 5.6
                  ? 'cross'
                  : 'sad'
                : t < 5.6
                  ? 'sheepish'
                  : 'happy';
          tuck = w === 1 ? 0.6 : 0;
          both((c) => Object.assign(c, claw(w === 2 ? 0.7 : 0.35, 0.3, 0.7, 0)));
        } else if (t < 3.9) face = t < 1.5 ? 'neutral' : 'focused';
        else if (t < 8) face = 'neutral';
        else face = left < 1.5 ? 'happy' : 'neutral';
        ants = 0.4 * (Math.sin(t * 4) > 0 ? 1 : 0);
        break;
      }
      case 'snap': {
        const k = ease(Math.min(t / 0.5, left / 0.5));
        const o = 0.5 + 0.5 * Math.sin(t * 14);
        Object.assign(L, claw(0.35 * k, 0.2 * k, o > 0.35 ? 1 : 0.02, 0.1 * k));
        R.up = 0.1 * k;
        if (crossed(0.2) || Math.sin(t * 14) > 0.97) this.flash = 0;
        this.tone = BEACON.focused;
        break;
      }
      case 'wave': {
        const k = ease(Math.min(t / 0.6, left / 0.6));
        Object.assign(R, claw(1 * k, 0.8 * k, 0.5 + 0.5 * Math.sin(t * 7), 0));
        R.inw = 0.25 * k * Math.sin(t * 8);
        L.up = 0.1 * k;
        body = -4 * k;
        break;
      }
      case 'flex': {
        const k = ease(Math.min(t / 0.6, left / 0.6));
        const pump = 0.5 + 0.5 * Math.sin(t * 5);
        Object.assign(L, claw(0.9 * k, 0.3 * k + 0.5 * pump * k, 0.9, -0.5 * k));
        Object.assign(R, claw(0.6 * k, 0.4 * k, 0.9, -0.3 * k));
        break;
      }
      case 'drum': {
        both((c, s) => {
          const d = Math.sin(t * 9 + (s > 0 ? 0 : Math.PI));
          Object.assign(c, claw(-0.1 + 0.55 * Math.max(0, d), 0.1, 0.4, 0.1));
        });
        body = 3 * Math.sin(t * 9);
        break;
      }
      case 'antennae': {
        const k = ease(Math.min(t / 0.5, left / 0.5));
        ants = k * (1 + Math.sin(t * 6));
        p.add('face', -6 * k, 0, 0);
        both((c) => Object.assign(c, claw(0.15, 0, 0.4, 0)));
        break;
      }
      case 'rock': {
        rock = 1;
        const b = Math.sin(t * 2 * Math.PI * 0.7);
        body = 6 * b;
        shuffle = 0.4;
        break;
      }
      case 'doze': {
        const k = ease(t / 2.4);
        slide = -0.045 * k;
        tuck = 0.8 * k;
        ants = -0.8 * k;
        both((c) => Object.assign(c, claw(-0.1 * k, 0, 0.1, 0.2)));
        break;
      }
      case 'dance': {
        const b = Math.sin(t * 2 * Math.PI * 1.1);
        shuffle = 1;
        rock = 0.7;
        both((c, s) => {
          const u = 0.5 + 0.5 * Math.sin(t * 2 * Math.PI * 1.1 + (s > 0 ? 0 : Math.PI));
          Object.assign(c, claw(0.9 * u, 0.4 * u, 0.2 + 0.7 * u, 0));
        });
        body = 8 * b;
        ants = 0.5 + 0.5 * b;
        break;
      }
      case 'hiccup': {
        for (const at of [0.7, 1.6, 2.5]) {
          if (crossed(at)) {
            p.kick('body', -22);
            p.kick('house', -14);
            this.flash = 0;
            this.tone = BEACON.surprised;
            for (const [n] of SIDES) this.arms[n].jaw.kick(-14);
          }
        }
        face = [0.7, 1.6, 2.5].some((x) => t > x && t < x + 0.25) ? 'surprised' : 'neutral';
        break;
      }
      case 'look': {
        p.add('face', 0, 30 * Math.sin(t * 1.4), 5 * Math.sin(t * 1.4));
        p.add('body', 0, 12 * Math.sin(t * 1.4 - 0.5), 0);
        ants = 0.3;
        break;
      }
      case 'pirouette': {
        this.spin = 2 * Math.PI * ease((t - 0.2) / 2.8);
        spinning = true;
        both((c) => Object.assign(c, claw(0.6, 0.2, 0.9, -0.8)));
        shuffle = 1;
        break;
      }
      case 'love': {
        const k = ease(Math.min(t / 0.8, left / 0.8));
        Object.assign(R, claw(0.9 * k, 0.5 * k, 0.4 + 0.3 * Math.sin(t * 3), 0));
        L.up = 0.1;
        face = 'love';
        body = 5 * Math.sin(t * 2.2);
        ants = 0.6;
        break;
      }
      case 'dizzy': {
        const u = clamp((t - 0.2) / 2.6, 0, 1);
        this.spin = 4 * Math.PI * u * u * (3 - 2 * u);
        spinning = true;
        both((c, s) => Object.assign(c, claw(0.5, 0.3, 0.5 + 0.5 * Math.sin(time * 6 * s), 0.3)));
        face = 'dizzy';
        body = 8 * Math.sin(time * 5);
        ants = Math.sin(time * 9);
        break;
      }
    }
    if (act !== 'tryon') this.propPose = null;
    if (!spinning) this.spin = 0;
    this.expression = face;
    for (const [n, s] of SIDES) {
      const c = n === 'L' ? L : R;
      const a = this.arms[n];
      // The big claw is the left one: it hangs a little lower and moves a little slower.
      const up = a.up.update(dt, c.up);
      const bend = a.bend.update(dt, c.bend);
      const jaw = a.jaw.update(dt, c.jaw);
      const inw = a.inw.update(dt, c.inw);
      p.add(`arm.${n}.1`, -up * 15, -s * inw * 40, s * up * 40);
      p.add(`arm.${n}.2`, -bend * 50, -s * inw * 80, 0);
      p.add(`claw.${n}`, bend * 8, 0, 0);
      p.add(`jaw.${n}`, 16 - 26 * jaw, 0, 0);
    }
    const sl = this.slide.update(dt, slide);
    const an = this.ants.update(dt, ants);
    const tk = this.tuck.update(dt, tuck);
    const rk = this.rock.update(dt, rock);
    this.props = props.map((v, i) => this.prop[i].update(dt, v));
    // How much the legs are working: the body is sliding, or it walks.
    const sv = Math.abs(sl - this.lastSlide) / Math.max(dt, 1e-3);
    this.lastSlide = sl;
    const walk = clamp(this.stride / ((this.spec.speed ?? 1) * env.frame.bot), 0, 1.7);
    this.shuffleAmt +=
      (clamp(sv / 0.12, 0, 1) * (act === 'tryon' || act === 'popout' ? 1 : 0.6) - this.shuffleAmt) *
      Math.min(1, dt * 12);
    this.beat += dt * 2 * Math.PI * 3.4 * Math.max(shuffle, this.shuffleAmt);

    // The legs: a tripod beat. Out and in with a step, and a lift as each swings.
    const mv = Math.max(walk, 0.55 * this.shuffleAmt);
    const dir = Math.sign(this.pace) || 1;
    for (const [n, s] of SIDES) {
      for (let i = 1; i <= 2; i++) {
        const odd = (i + (s > 0 ? 0 : 1)) % 2;
        const ph = this.gait + odd * Math.PI;
        const lift = Math.max(0, Math.sin(ph));
        const sh = Math.max(0, Math.sin(this.beat + odd * Math.PI));
        p.add(
          `hip.${n}${i}`,
          10 * Math.sin(this.beat + odd * Math.PI) * Math.min(1, shuffle + this.shuffleAmt),
          0,
          s * (lift * 14 * walk + sh * 12 + tk * 24 + 2 * sin(time, 0.3, i * 0.2)),
        );
        p.add(
          `shin.${n}${i}`,
          dir * 14 * walk * Math.cos(ph),
          0,
          s * (tk * 26 * (0.5 + 0.5 * (i % 2)) + 6 * sh),
        );
      }
    }
    // The body slides along its length; the antennae; the house rocks.
    p.shift('body', 0, 0, sl);
    p.add('body', 0, 0, body + 2 * walk * Math.sin(this.gait * 2));
    p.add('house', 0, 0, rk * 9 * Math.sin(time * 4.4) - body * 0.4);
    p.add(
      'ant.L',
      -22 * an,
      0,
      24 * Math.sin(time * 10 + 1) * Math.max(0, an) + 30 * Math.min(0, an),
    );
    p.add('ant.R', -22 * an, 0, -24 * Math.sin(time * 10) * Math.max(0, an) - 30 * Math.min(0, an));
    if (turned) p.add('root', 0, turned, 0);
    this.lastTurn = turned;
    if (this.flash >= 0) {
      this.flash += dt;
      if (this.flash > 1.2) this.flash = -1;
    }
    void ease;
  }

  private props: number[] = [0, 0, 0];
  private propPose: { z: number; y: number; roll: number } | null = null;
  private lastTurn = 0;

  protected after(dt: number, env: Env) {
    const time = env.time;
    const act = this.act;
    const t = this.actT;
    const p = this.puppet;
    // The spare houses: out of sight but for the one on stage.
    PROPS.forEach((name, i) => {
      const b = `tryon.${name}`;
      const s = Math.max(0.001, this.props[i]);
      p.stretch(b, s, [0, 1, 0], s);
      const pp = this.propPose && i === this.worn ? this.propPose : { z: WAIT, y: 0, roll: 0 };
      p.shift(b, 0, pp.y, pp.z);
      p.turn(b, 0, 0, pp.roll);
    });
    if (this.spin) p.swing('root', (this.spin * 180) / Math.PI);
    // Dot0: the claw tips, Dot1: the antennae, Dot2: the windows (lit when someone is home).
    const home = clamp(1 - (this.lastSlide - 0.08) / 0.1, 0, 1);
    for (let i = 0; i < 3; i++) {
      let level = 0.5 + 0.25 * Math.sin(time * 0.9 - i * 0.8);
      let tone: string | undefined;
      if (i === 2) level = 0.25 + 0.65 * home;
      if (act === 'poked' && t < 0.8) {
        level = Math.sin(time * 34) > 0 ? 1 : 0.3;
        tone = BEACON.surprised;
      } else if (act === 'snap') {
        level = Math.sin(time * 16 + i * 1.5) > 0 ? 1 : 0.2;
        tone = BEACON.focused;
      } else if (act === 'dance' || act === 'flex' || act === 'pirouette' || act === 'antennae') {
        level = Math.sin(time * 9 + i * 1.3) > 0 ? 1 : 0.25;
        tone = RAINBOW[(i + Math.floor(time * 5)) % RAINBOW.length];
      } else if (act === 'dizzy') {
        level = Math.sin(time * 7 + i * 2.3) > 0.2 ? 1 : 0.15;
        tone = RAINBOW[(i + Math.floor(time * 3)) % RAINBOW.length];
      } else if (act === 'love') {
        level = 0.65 + 0.35 * Math.sin(time * 2.4 - i * 0.6);
        tone = BEACON.love;
      } else if (act === 'hiccup') {
        level = 0.5 + 0.5 * Math.sin(time * 20 + i * 1.7);
        tone = BEACON.surprised;
      } else if (act === 'doze' || act === 'hide') {
        level = (i === 2 ? 0.4 : 0.2) + 0.15 * Math.sin(time * 0.8);
      } else if (this.hovered) tone = BEACON.happy;
      this.outfit.dot(i, level, tone);
    }
    this.outfit.beacon(
      this.flash >= 0 && this.tone
        ? this.tone
        : act === 'dance' || act === 'flex'
          ? RAINBOW[Math.floor(time * 6) % RAINBOW.length]
          : (BEACON[this.expression] ?? BEACON.neutral!),
    );
    void dt;
    void bump;
  }
}
