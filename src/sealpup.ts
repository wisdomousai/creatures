import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Act, Character, clamp, type Env } from './character';
import type { Expression, FaceLayout } from './face';
import { sin } from './moves';
import { bump, cycle, ease, FixedSpring } from './swimmer';

/**
 * Plop, the robot harbour seal pup: a round grey sausage of a body propped up on two paddle
 * front flippers, a big round head whose screen has huge dark eyes, a pale muzzle with a
 * dark nose and three lit whisker rods a side (Dot0, they glimmer with her mood), lit spots
 * down her back (Dot1, Dot2), two hind flippers pressed together behind and a beacon on her
 * crown. A lit ball waits on a bone of its own, put away until a trick needs it.
 *
 * She is clumsy and bouncy. Walking is galumphing: the back end arches up, the front
 * flippers haul her forward and she flops down with a thump. Tricks: balancing the lit ball
 * on her nose (and tossing it up and catching it), clapping her flippers with a bark, rolling
 * over onto her back with her flippers waving, a belly flop, a shuffle, a bark, a flop
 * round to face the other way, nodding, dozing, hiccups, a peek and looking round. Poke her
 * and she flops flat with her flippers over her eyes; three pokes and she rolls dizzy; rest
 * the mouse on her and she blinks slowly and wiggles.
 */
export const SEALPUP_FACE: FaceLayout = {
  width: 512,
  height: 288,
  eyes: [
    [0.3, 0.46],
    [0.7, 0.46],
  ],
  rx: 0.12,
  ry: 0.36,
  line: 0.036,
  mouth: null,
  pupil: 0.62,
} as FaceLayout;

const SIDES = [
  ['L', 1],
  ['R', -1],
] as const;
const DEG = 180 / Math.PI;

export class SealPup extends Character {
  private ball = new FixedSpring(5, 0.5, 1, 0.001);
  private lift = new FixedSpring(5, 0.4);
  private roll = new FixedSpring(3, 0.7);
  private pokes: number[] = [];
  private hover = 0;
  private flash = -1;
  private tone: string | undefined;
  private spin = 0;
  private lastCycle = 0;

  constructor(model: Object3D) {
    const feels: Record<string, { f: number; zeta: number; r?: number }> = {
      default: { f: 4, zeta: 0.5 },
      root: { f: 2.4, zeta: 0.6 },
      body: { f: 3, zeta: 0.45, r: 0.5 },
      head: { f: 3.5, zeta: 0.4 },
      face: { f: 3.5, zeta: 0.45 },
      ball: { f: 8, zeta: 0.5 },
    };
    for (const [n] of SIDES) {
      feels[`flipper.${n}`] = { f: 5, zeta: 0.4 };
      feels[`hind.${n}`] = { f: 4, zeta: 0.4 };
    }
    super(
      {
        name: 'Plop',
        model: 'sealpup',
        metres: 0.22,
        width: 0.3,
        size: 0.72,
        feels: feels as never,
        face: SEALPUP_FACE,
        eyes: 0.6,
        gaze: [
          { bone: 'head', yaw: 0.7, pitch: 0.5 },
          { bone: 'face', yaw: 0.3, pitch: 0.3 },
        ],
        reach: { yaw: 40, pitch: 24 },
        lag: 1.3,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 0.75,
        turn: 65,
      },
      model,
    );
    this.acts = this.moves();
  }

  private moves(): Record<string, Act> {
    const still = () => !this.walking;
    const stroll = (far: number, speed = 0.75) => {
      this.spec.speed = speed;
      const way = Math.random() < 0.5 ? -1 : 1;
      this.walkTo(this.s + way * this.heightPx * far * (0.7 + Math.random() * 0.6));
    };
    return {
      idle: { weight: 3, length: [3, 6] },
      stroll: { weight: 3, length: [5, 8], when: still, start: () => stroll(2.2) },
      balance: { weight: 1.7, length: [10, 10.6], face: 'focused', when: still },
      clap: { weight: 1.3, length: [4.4, 5], face: 'happy', when: still },
      rollover: { weight: 1.2, length: [7, 7.6], face: 'happy', when: still },
      bellyflop: { weight: 1, length: [4, 4.6], face: 'happy', when: still },
      bark: { weight: 1, length: [3.6, 4], face: 'surprised', when: still },
      shuffle: { weight: 1, length: [4.4, 5], face: 'happy', when: still },
      turn: { weight: 0.8, length: [3.8, 4.2], face: 'happy', when: still },
      nod: { weight: 0.9, length: [3.4, 4], face: 'happy', when: still },
      peek: { weight: 0.9, length: [5.4, 6], when: still },
      doze: { weight: 0.7, length: [9, 13], face: 'asleep', when: still },
      hiccup: { weight: 0.7, length: [4, 4.4], when: still },
      look: { weight: 1, length: [4, 5], when: still },
      poked: { weight: 0, length: [3.6, 4] },
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
      this.lift.kick(10);
      this.setAct('poked');
    }
  }

  protected idle(t: number) {
    const p = this.puppet;
    p.shift('root', 0, 0.002 * sin(t, 0.4), 0);
    p.add('body', 1.5 * sin(t, 0.22), 0, 1.5 * sin(t, 0.17));
    p.add('head', 2 * sin(t, 0.3), 4 * sin(t, 0.19), 0);
    for (const [n, s] of SIDES) {
      p.add(`flipper.${n}`, 0, 0, s * 3 * sin(t, 0.3, s * 0.2));
      p.add(`hind.${n}`, 0, 0, s * 3 * sin(t, 0.25, s * 0.2));
    }
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    const t = this.actT;
    const act = this.act;
    const time = env.time;
    const left = this.actLength - t;
    const crossed = (at: number) => t >= at && t - dt < at;
    let face: Expression = this.hovered ? 'happy' : 'neutral';
    let ball = 0;
    let head = 0;
    let body = 0;
    let lift = 0;
    let rollTo = 0;
    let spinTo: number | null = null;
    const fl = { L: [0, 0], R: [0, 0] } as Record<'L' | 'R', [number, number]>;
    let toss = 0;

    this.hover = this.hovered ? this.hover + dt : 0;
    if (this.hover > 0.9 && ['idle', 'stroll', 'look'].includes(act)) this.setAct('love');

    switch (act) {
      case 'poked': {
        // Flat on her belly, flippers over her eyes; a peek out at the end.
        const k = left > 1.6 ? 1 : ease(left / 1.6);
        fl.L = [0.9 * k, 0.8 * k];
        fl.R = [0.9 * k, 0.8 * k];
        head = 14 * k;
        body = 6 * k;
        face = t < 0.5 ? 'surprised' : left > 1.6 ? 'cross' : 'neutral';
        break;
      }
      case 'balance': {
        // The ball comes out onto her nose; she steadies it, wobbles, tosses it up three
        // times and catches it each time, then puts it away.
        ball = ease(Math.min(t / 0.6, left / 0.6));
        const up = ease((t - 0.3) / 0.8) * (left > 1 ? 1 : ease(left));
        head = -34 * up;
        body = 5 * up;
        const wob = Math.sin(t * 3.3) * 0.6 + Math.sin(t * 5.1) * 0.4;
        const tossing = t > 3 && t < 8.4;
        if (tossing) {
          const c = ((t - 3) / 1.8) % 1;
          toss = Math.sin(Math.PI * clamp(c / 0.9, 0, 1));
          head += -8 * toss;
          lift = 0.15 * toss;
        }
        p.add('head', 0, 6 * wob * (tossing ? 0 : 1), 5 * wob * (tossing ? 0 : 1));
        fl.L = [0.2 + 0.2 * Math.sin(t * 2.2), 0.1];
        fl.R = [0.2 - 0.2 * Math.sin(t * 2.2), 0.1];
        face = tossing && toss > 0.5 ? 'surprised' : t < 2 ? 'focused' : 'happy';
        break;
      }
      case 'clap': {
        // Sits up proud and claps the flippers in front of her chest, barking.
        const k = ease(Math.min(t / 0.7, left / 0.7));
        const c = Math.sin(t * 9) > 0 ? 1 : 0;
        fl.L = fl.R = [0.5 * k, 0];
        const inn = k * (0.4 + 0.6 * c);
        p.add('flipper.L', 0, -40 * inn, 0);
        p.add('flipper.R', 0, 40 * inn, 0);
        head = -16 * k;
        body = 10 * k;
        lift = 0.1 * k * c;
        face = 'happy';
        break;
      }
      case 'rollover': {
        // Over onto her back (a half turn about the way she lies), flippers waving and the hind
        // ones kicking, a moment, and back.
        const down = ease((t - 0.4) / 1.3);
        const up = ease((left - 0.3) / 1.3);
        const k = Math.min(down, up);
        rollTo = Math.PI * k;
        const wave = Math.sin(t * 6) * 0.5 + 0.5;
        const on = k > 0.9 ? 1 : 0;
        fl.L = [0.6 * on * wave, 0.2];
        fl.R = [0.6 * on * (1 - wave), 0.2];
        face = k > 0.5 ? 'happy' : 'neutral';
        break;
      }
      case 'bellyflop': {
        // Chest up, then down with a thump, twice.
        for (const at of [1.3, 2.9]) {
          if (crossed(at)) {
            p.kick('body', 40);
            p.kick('head', -30);
            this.lift.kick(9);
            this.flash = 0;
            this.tone = BEACON.happy;
          }
        }
        const c = ((t - 0.2) / 1.6) % 1;
        const up = t > 0.2 && t < 3.2 ? Math.sin(Math.PI * clamp(c / 0.8, 0, 1)) : 0;
        head = -28 * up;
        body = -12 * up;
        fl.L = fl.R = [0.4 * up, 0];
        lift = 0.2 * up;
        break;
      }
      case 'bark': {
        const k = bump(t - 0.7, 0.5) + bump(t - 1.6, 0.4) + bump(t - 2.4, 0.4);
        head = -20 * Math.min(1, k);
        body = 8 * Math.min(1, k);
        face = k > 0.1 ? 'surprised' : 'neutral';
        if (crossed(0.55) || crossed(1.5) || crossed(2.3)) {
          this.flash = 0;
          this.tone = BEACON.surprised;
        }
        break;
      }
      case 'shuffle': {
        const b = Math.sin(t * 2 * Math.PI * 1.5);
        body = 6 * b;
        fl.L = [0.2 * Math.max(0, b), 0.1];
        fl.R = [0.2 * Math.max(0, -b), 0.1];
        p.add('hind.L', 0, 0, 14 * b);
        p.add('hind.R', 0, 0, 14 * b);
        lift = 0.06 * Math.abs(b);
        break;
      }
      case 'turn':
        spinTo = 2 * Math.PI * ease((t - 0.3) / 3);
        lift = 0.12 * Math.abs(Math.sin(t * 4));
        break;
      case 'nod':
        head = 14 * Math.sin(t * 2 * Math.PI * 1.2) * ease(Math.min(t, left));
        break;
      case 'peek': {
        const k = ease(Math.min(t / 0.9, left / 0.9));
        p.add('head', -6 * k, 0, 20 * k * Math.sin(t * 0.9));
        p.add('body', 0, 12 * k * Math.sin(t * 0.9));
        face = t < 2 ? 'neutral' : t < 4 ? 'focused' : 'surprised';
        break;
      }
      case 'doze': {
        const k = ease(t / 2.4);
        head = 22 * k;
        body = 6 * k;
        fl.L = fl.R = [0.15 * k, 0];
        break;
      }
      case 'hiccup':
        for (const at of [0.7, 1.6, 2.5]) {
          if (crossed(at)) {
            p.kick('body', -22);
            p.kick('head', -26);
            this.flash = 0;
            this.tone = BEACON.surprised;
            this.lift.kick(8);
          }
        }
        face = [0.7, 1.6, 2.5].some((x) => t > x && t < x + 0.25) ? 'surprised' : 'neutral';
        break;
      case 'look':
        p.add('head', -4, 34 * Math.sin(t * 1.4), 4 * Math.sin(t * 1.4));
        p.add('body', 0, 10 * Math.sin(t * 1.4 - 0.5));
        break;
      case 'love': {
        const k = ease(Math.min(t / 0.8, left / 0.8));
        face = t % 2.4 < 1.7 ? 'love' : 'happy';
        body = 6 * Math.sin(t * 2.2);
        head = -6 * k;
        p.add('hind.L', 0, 0, 8 * Math.sin(t * 5));
        p.add('hind.R', 0, 0, -8 * Math.sin(t * 5));
        break;
      }
      case 'dizzy': {
        const u = clamp((t - 0.2) / 2.6, 0, 1);
        rollTo = 4 * Math.PI * u * u * (3 - 2 * u);
        face = 'dizzy';
        break;
      }
    }
    this.expression = face;
    this.spin = spinTo ?? 0;
    const bl = this.ball.update(dt, ball || 0.001);
    const lf = this.lift.update(dt, lift);
    const rl = this.roll.update(dt, rollTo);

    // Galumphing: the back end arches up, the front flippers haul her forward, and she flops
    // down with a thump; the cycle is her stride.
    const speed = (this.spec.speed ?? 1) * env.frame.bot;
    const mv = clamp(this.stride / speed, 0, 1.6);
    const cyc = this.gait / (2 * Math.PI);
    const ph = cyc - Math.floor(cyc);
    const arch = mv * Math.sin(Math.PI * clamp(ph / 0.55, 0, 1));
    if (mv > 0.2 && Math.floor(cyc) !== this.lastCycle) {
      p.kick('body', 22 * mv);
      p.kick('head', -18 * mv);
    }
    this.lastCycle = Math.floor(cyc);
    p.add('body', -14 * arch, 0, 3 * mv * Math.sin(this.gait));
    p.add('head', 10 * arch + head, 0, 0);
    p.add('body', body);
    this.h = (Math.max(0, lf) + 0.12 * arch) * this.heightPx * 0.6;
    for (const [n, s] of SIDES) {
      const [a, b] = fl[n];
      const haul = mv * Math.sin(this.gait * 1 + (s > 0 ? 0 : 0.6));
      p.add(`flipper.${n}`, -a * 40 + 10 * arch, s * -b * 30, s * (-a * 30 + 18 * haul));
      p.add(`hind.${n}`, 0, 0, s * -10 * arch);
    }
    // The ball: out onto her nose, riding her head; a toss sends it up and back.
    p.stretch('ball', Math.max(0.001, bl), [0, 1, 0], Math.max(0.001, bl));
    if (act === 'balance') p.shift('ball', 0, 0, 0.16 * toss);
    // Turning about (a flop round), and rolling about the way she lies.
    if (this.spin) p.swing('root', this.spin * DEG);
    if (rl) p.turn('body', 0, 0, rl * DEG);
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
    // Dot0 the whiskers, 1 and 2 the back spots, 4 the ball.
    for (const i of [0, 1, 2, 4]) {
      let level = 0.5 + 0.2 * Math.sin(time * 1 - i * 0.8);
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
      } else if (act === 'clap' || act === 'bellyflop' || act === 'rollover' || act === 'turn') {
        level = Math.sin(time * 9 + i * 1.6) > 0 ? 1 : 0.25;
        tone = RAINBOW[(i + Math.floor(time * 4)) % RAINBOW.length];
      } else if (act === 'balance') {
        level = i === 4 ? 0.8 + 0.2 * Math.sin(time * 6) : run(1.2);
        tone = i === 4 ? RAINBOW[Math.floor(time * 3) % RAINBOW.length] : BEACON.focused;
      } else if (act === 'hiccup' || act === 'bark') {
        level = 0.5 + 0.5 * Math.sin(time * 20 + i * 1.7);
        tone = BEACON.surprised;
      } else if (act === 'doze') {
        level = 0.18 + 0.12 * Math.sin(time * 0.8);
      } else if (walk > 0.25) level = run(1.4);
      else if (this.hovered) tone = BEACON.happy;
      this.outfit.dot(i, level, tone);
    }
    this.outfit.beacon(
      this.flash >= 0 && this.tone
        ? this.tone
        : act === 'clap' || act === 'balance' || act === 'rollover'
          ? RAINBOW[Math.floor(time * 6) % RAINBOW.length]
          : (BEACON[this.expression] ?? BEACON.neutral!),
    );
  }
}
