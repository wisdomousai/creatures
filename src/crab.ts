import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Act, Character, clamp, type Env } from './character';
import type { Expression, FaceLayout } from './face';
import { sin } from './moves';
import { Spring } from './spring';
import { bump, ease } from './swimmer';

/**
 * Clack, the robot crab. A wide flat shell on six jointed legs (three a side), two big claws
 * on two-part arms with lit fingertips, and a visor held up on two stalks: the screen face,
 * its eyes at the ends. It walks the floor sideways, always: it keeps its face to the viewer
 * (its spec turns it not at all) and the legs scuttle in a tripod beat, the leading side
 * reaching out and the trailing side pulling in.
 *
 * Tricks: a sideways scuttle, a dash, claw snaps, a clap over its head, a wave, digging in
 * (a heap of sand rises round the shell and it sinks till only the eyes show, then looks
 * about), hiding behind its claws (what a poke does), flexing, drumming the floor, raising
 * the visor to peek, dozing, a shuffling dance, hiccups that clack the claws, looking round
 * and a pirouette. Three pokes and it spins dizzy; rest the mouse on it and it goes soft and
 * waves a claw slowly.
 */
export const CRAB_FACE: FaceLayout = {
  width: 512,
  height: 192,
  eyes: [
    [0.18, 0.5],
    [0.82, 0.5],
  ],
  rx: 0.07,
  ry: 0.3,
  line: 0.05,
  mouth: [0.5, 0.74],
};

const SIDES = [
  ['L', 1],
  ['R', -1],
] as const;
const DEG = Math.PI / 180;

interface Claw {
  /** Arm raised (1 about 50 degrees), forearm lifted, jaw open (0 shut .. 1 wide), arm drawn in. */
  up: number;
  bend: number;
  jaw: number;
  inw: number;
}
const claw = (up = 0, bend = 0, jaw = 0.4, inw = 0): Claw => ({ up, bend, jaw, inw });

export class Crab extends Character {
  static readonly terms =
    'crustacean claws pincers shell legs coral pink salmon sideways scuttle walk dig sand visor stalks eyes snap clap wave hide';

  private arms: Record<'L' | 'R', Record<keyof Claw, Spring>> = {
    L: this.clawSprings(),
    R: this.clawSprings(),
  };
  private tuck = new Spring(3, 0.6, 1);
  private sink = new Spring(2.4, 0.7, 1);
  private mound = new Spring(2, 0.8, 1);
  private visor = new Spring(3, 0.5, 1);
  private spin = 0;
  private pokes: number[] = [];
  private hover = 0;
  private flash = -1;
  private tone: string | undefined;
  private beat = 0;

  constructor(model: Object3D) {
    const leg = { f: 6, zeta: 0.5 };
    const feels: Record<string, { f: number; zeta: number; r?: number }> = {
      default: { f: 3.5, zeta: 0.5 },
      root: { f: 2.4, zeta: 0.6 },
      body: { f: 2.4, zeta: 0.5, r: 0.5 },
      face: { f: 3, zeta: 0.4 },
    };
    for (const [n] of SIDES) {
      feels[`arm.${n}.1`] = { f: 4, zeta: 0.45 };
      feels[`arm.${n}.2`] = { f: 4.5, zeta: 0.4 };
      feels[`claw.${n}`] = { f: 4.5, zeta: 0.4 };
      feels[`jaw.${n}`] = { f: 8, zeta: 0.5 };
      for (let i = 1; i <= 3; i++) {
        feels[`hip.${n}${i}`] = leg;
        feels[`shin.${n}${i}`] = leg;
      }
    }
    super(
      {
        name: 'Clack',
        model: 'crab',
        metres: 0.24,
        width: 0.56,
        size: 0.8,
        feels: feels as never,
        face: CRAB_FACE,
        eyes: 0.85,
        gaze: [{ bone: 'face', yaw: 0.6, pitch: 0.5 }],
        reach: { yaw: 40, pitch: 22 },
        lag: 1.4,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 1.3,
        // Sideways always: never turns to the way it goes.
        turn: 0,
      },
      model,
    );
    this.acts = this.moves();
  }

  private clawSprings() {
    return {
      up: new Spring(5, 0.45, 1),
      bend: new Spring(5, 0.45, 1),
      jaw: new Spring(9, 0.5, 1, 0.4),
      inw: new Spring(5, 0.5, 1),
    };
  }

  private moves(): Record<string, Act> {
    const still = () => !this.walking;
    const stroll = (far: number, speed = 1.3) => {
      this.spec.speed = speed;
      const way = Math.random() < 0.5 ? -1 : 1;
      this.walkTo(this.s + way * this.heightPx * far * (0.7 + Math.random() * 0.6));
    };
    return {
      idle: { weight: 3, length: [3, 6] },
      scuttle: { weight: 3, length: [5, 8], when: still, start: () => stroll(2.2) },
      dash: {
        weight: 1,
        length: [4, 6],
        face: 'focused',
        when: still,
        start: () => stroll(4.5, 2.6),
      },
      snap: { weight: 1.4, length: [4, 4.6], face: 'determined', when: still },
      clap: { weight: 1, length: [4.4, 5], face: 'happy', when: still },
      wave: { weight: 1, length: [4, 4.6], face: 'happy', when: still },
      dig: { weight: 1, length: [8, 9], when: still },
      hide: { weight: 0.7, length: [5, 5.6], when: still },
      flex: { weight: 0.9, length: [4, 4.6], face: 'determined', when: still },
      drum: { weight: 0.9, length: [4, 4.6], face: 'focused', when: still },
      peek: { weight: 0.9, length: [5, 6], when: still },
      doze: { weight: 0.7, length: [9, 13], face: 'asleep', when: still },
      dance: { weight: 0.9, length: [5, 6], face: 'happy', when: still },
      hiccup: { weight: 0.7, length: [4, 4.4], when: still },
      look: { weight: 1, length: [4, 5], when: still },
      pirouette: { weight: 0.8, length: [3.4, 3.8], face: 'happy', when: still },
      poked: { weight: 0, length: [4.4, 5], face: 'surprised' },
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
      // The claws come up over the face at once.
      this.goal = null;
      this.flash = 0;
      this.tone = BEACON.surprised;
      for (const [n] of SIDES) {
        this.arms[n].up.kick(6);
        this.arms[n].inw.kick(6);
      }
      this.puppet.kick('body', 30);
      this.setAct('poked');
    }
  }

  protected idle(t: number) {
    const p = this.puppet;
    p.shift('root', 0, 0.002 * sin(t, 0.4), 0);
    p.add('body', 1.5 * sin(t, 0.22), 0, 1.2 * sin(t, 0.17));
    p.add('face', 2 * sin(t, 0.3), 3 * sin(t, 0.19), 0);
    for (const [n, s] of SIDES) {
      p.add(`arm.${n}.1`, 2 * sin(t, 0.3, s * 0.2), 0, 0);
      p.add(`jaw.${n}`, 3 * sin(t, 0.4, s * 0.3), 0, 0);
    }
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
    let tuck = 0;
    let sink = 0;
    let mound = 0;
    let visor = 0;
    let shuffle = 0;
    let spinning = false;
    let body = 0;

    // Petted: calm and warm.
    this.hover = this.hovered ? this.hover + dt : 0;
    if (this.hover > 0.9 && (act === 'idle' || act === 'scuttle' || act === 'look'))
      this.setAct('love');
    const both = (f: (c: Claw, s: number, i: number) => void) =>
      [L, R].forEach((c, i) => f(c, i === 0 ? 1 : -1, i));

    switch (act) {
      case 'poked': {
        // Up behind the claws, jaws shut, the visor down a little; it peeks out at the end.
        const k = left > 1.6 ? 1 : ease(left / 1.6);
        both((c) => Object.assign(c, claw(0.85 * k, 0.8 * k, 0.05, 0.9 * k)));
        sink = 0.5 * k;
        visor = -0.6 * k;
        face = t < 0.4 ? 'surprised' : left > 1.6 ? 'cross' : 'neutral';
        break;
      }
      case 'hide': {
        const k = ease(t / 0.6) * (left > 1.2 ? 1 : ease(left / 1.2));
        both((c) => Object.assign(c, claw(0.85 * k, 0.8 * k, 0.05, 0.9 * k)));
        sink = 0.5 * k;
        visor = -0.6 * k;
        face = k > 0.5 ? 'cross' : 'surprised';
        // A peek over the claws from time to time.
        if (t > 2 && t < 3.2) {
          visor = 0.2;
          face = 'surprised';
        }
        break;
      }
      case 'snap': {
        const k = ease(Math.min(t / 0.5, left / 0.5));
        both((c, s) => {
          const o = 0.5 + 0.5 * Math.sin(t * 15 + (s > 0 ? 0 : Math.PI));
          Object.assign(c, claw(0.25 * k, 0.15 * k, o > 0.35 ? 1 : 0.02, 0.1 * k));
        });
        if (crossed(0.2) || Math.sin(t * 15) > 0.97) this.flash = 0;
        this.tone = BEACON.focused;
        break;
      }
      case 'clap': {
        const k = ease(Math.min(t / 0.7, left / 0.7));
        const hit = Math.sin(t * 7) > 0;
        both((c) =>
          Object.assign(c, claw(0.9 * k, 0.5 * k, hit ? 0.02 : 1, (hit ? 0.55 : 0.2) * k)),
        );
        body = -4 * k;
        break;
      }
      case 'wave': {
        const k = ease(Math.min(t / 0.6, left / 0.6));
        Object.assign(L, claw(1 * k, 0.8 * k, 0.5 + 0.5 * Math.sin(t * 6), 0));
        L.inw = 0.2 * k * Math.sin(t * 7);
        R.up = 0.1 * k;
        body = 4 * k;
        break;
      }
      case 'dig': {
        // Down into the sand, wriggling; only the eyes show; a look round; back up.
        const down = ease((t - 0.3) / 1.4);
        const up = ease((left - 0.2) / 1.2);
        const inSand = Math.min(down, up);
        sink = 1.4 * inSand;
        mound = inSand;
        tuck = 1 * inSand;
        shuffle = (t < 1.8 || left < 1.4 ? 1 : 0) * 0.5;
        both((c, s, i) =>
          Object.assign(
            c,
            claw(
              0.5 * inSand * (t < 1.8 ? 0.5 + 0.5 * Math.sin(t * 12 + i * 3) : 1),
              0.4 * inSand,
              0.5,
              0.2,
            ),
          ),
        );
        visor = 0.2 * inSand * (t > 2 && left > 2 ? 1 : 0);
        face = inSand > 0.8 ? (t > 3 && left > 3 ? 'focused' : 'neutral') : 'determined';
        break;
      }
      case 'flex': {
        const k = ease(Math.min(t / 0.6, left / 0.6));
        const pump = 0.5 + 0.5 * Math.sin(t * 5);
        both((c) => Object.assign(c, claw(0.9 * k, 0.3 * k + 0.5 * pump * k, 0.9, -0.5 * k)));
        sink = -0.3 * k * pump;
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
      case 'peek': {
        // The visor rises tall on its stalks and turns about, the claws folded in.
        const k = ease(Math.min(t / 0.8, left / 0.8));
        visor = 1 * k;
        both((c) => Object.assign(c, claw(0.1, 0.1, 0.3, 0.3)));
        face = t < 1.5 ? 'neutral' : t < 4 ? 'focused' : 'surprised';
        p.add('face', 0, 28 * Math.sin(t * 1.4) * k, 4 * Math.sin(t * 1.4));
        break;
      }
      case 'doze': {
        const k = ease(t / 2);
        sink = 0.9 * k;
        tuck = 0.7 * k;
        visor = -0.5 * k;
        both((c) => Object.assign(c, claw(-0.1 * k, 0, 0.1, 0.1)));
        break;
      }
      case 'dance': {
        const b = Math.sin(t * 2 * Math.PI * 1.1);
        shuffle = 1;
        sink = -0.2 * Math.abs(b);
        both((c, s) => {
          const u = 0.5 + 0.5 * Math.sin(t * 2 * Math.PI * 1.1 + (s > 0 ? 0 : Math.PI));
          Object.assign(c, claw(0.9 * u, 0.4 * u, 0.2 + 0.7 * u, 0));
        });
        body = 8 * b;
        break;
      }
      case 'hiccup': {
        for (const at of [0.7, 1.6, 2.5]) {
          if (crossed(at)) {
            p.kick('body', -22);
            p.kick('face', -25);
            this.flash = 0;
            this.tone = BEACON.surprised;
            for (const [n] of SIDES) {
              this.arms[n].jaw.kick(-14);
              this.arms[n].up.kick(2.5);
            }
          }
        }
        face = [0.7, 1.6, 2.5].some((x) => t > x && t < x + 0.25) ? 'surprised' : 'neutral';
        break;
      }
      case 'look': {
        p.add('face', 0, 30 * Math.sin(t * 1.4), 5 * Math.sin(t * 1.4));
        p.add('body', 0, 12 * Math.sin(t * 1.4 - 0.5), 0);
        both((c) => Object.assign(c, claw(0.1 + 0.1 * Math.sin(t * 2), 0, 0.5, 0)));
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
        Object.assign(L, claw(0.8 * k, 0.5 * k, 0.4 + 0.3 * Math.sin(t * 3), 0));
        R.up = 0.1;
        face = 'love';
        body = 5 * Math.sin(t * 2.2);
        break;
      }
      case 'dizzy': {
        const u = clamp((t - 0.2) / 2.6, 0, 1);
        this.spin = 4 * Math.PI * u * u * (3 - 2 * u);
        spinning = true;
        both((c, s) => Object.assign(c, claw(0.5, 0.3, 0.5 + 0.5 * Math.sin(time * 6 * s), 0.3)));
        face = 'dizzy';
        body = 8 * Math.sin(time * 5);
        break;
      }
    }
    if (!spinning) this.spin = 0;
    this.expression = face;
    const k = (n: 'L' | 'R') => (n === 'L' ? L : R);
    for (const [n, s] of SIDES) {
      const c = k(n);
      const a = this.arms[n];
      const up = a.up.update(dt, c.up);
      const bend = a.bend.update(dt, c.bend);
      const jaw = a.jaw.update(dt, c.jaw);
      const inw = a.inw.update(dt, c.inw);
      p.add(`arm.${n}.1`, -up * 15, -s * inw * 40, s * up * 40);
      p.add(`arm.${n}.2`, -bend * 50, -s * inw * 80, 0);
      p.add(`claw.${n}`, bend * 8, 0, 0);
      p.add(`jaw.${n}`, 16 - 26 * jaw, 0, 0);
    }
    const tk = this.tuck.update(dt, tuck);
    const sk = this.sink.update(dt, sink);
    const mo = this.mound.update(dt, mound);
    const vs = this.visor.update(dt, visor);

    // The legs: a tripod beat sideways. The leading side reaches out and the trailing side
    // pulls in; a leg lifts as it swings forward.
    const speed = (this.spec.speed ?? 1) * env.frame.bot;
    const mv = clamp(this.stride / speed, 0, 1.7);
    const dir = Math.sign(this.pace) || 1;
    this.beat += dt * 2 * Math.PI * 3.2 * shuffle;
    for (const [n, s] of SIDES) {
      for (let i = 1; i <= 3; i++) {
        const odd = (i + (s > 0 ? 0 : 1)) % 2;
        const ph = this.gait + odd * Math.PI;
        const lift = Math.max(0, Math.sin(ph));
        const sh = Math.max(0, Math.sin(this.beat + odd * Math.PI));
        p.add(
          `hip.${n}${i}`,
          0,
          0,
          s * (lift * 16 * mv + sh * 12 + tk * 26 + 2 * sin(time, 0.3, i * 0.2)),
        );
        p.add(
          `shin.${n}${i}`,
          0,
          0,
          s * (dir * 22 * mv * Math.cos(ph) + tk * 28 * (0.5 + 0.5 * (i % 2))),
        );
      }
    }
    // The body rocks over the legs, sinks in the sand, and tips.
    p.add('body', 0, 0, body + 2.2 * mv * Math.sin(this.gait * 2));
    p.shift('root', 0, -0.06 * sk, 0);
    p.shift('face', 0, 0.03 * vs, 0);
    p.add('face', -10 * Math.min(vs, 0), 0, 0);
    this.puppet.stretch('mound', Math.max(0.001, mo), [0, 1, 0], Math.max(0.001, mo));
    if (spinning) p.swing('root', (this.spin * 180) / Math.PI);
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
    // Dot0: the claw tips; Dot1..3: the back lamps.
    for (let i = 0; i < 4; i++) {
      let level = 0.5 + 0.25 * Math.sin(time * 0.9 - i * 0.8);
      let tone: string | undefined;
      if (act === 'poked' && t < 0.8) {
        level = Math.sin(time * 34) > 0 ? 1 : 0.3;
        tone = BEACON.surprised;
      } else if (act === 'snap' || act === 'clap') {
        level = Math.sin(time * 16 + i * 1.5) > 0 ? 1 : 0.2;
        tone = BEACON.focused;
      } else if (act === 'dance' || act === 'flex' || act === 'pirouette') {
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
        level = 0.2 + 0.15 * Math.sin(time * 0.8);
      } else if (act === 'dig' || act === 'drum' || walk > 0.25) {
        // The lamps chase along the back, the way it goes.
        level =
          0.4 + 0.6 * bump(((time * 1.8 * (Math.sign(this.pace) || 1) + i * 0.25) % 1) - 0.4, 0.3);
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
  }
}
