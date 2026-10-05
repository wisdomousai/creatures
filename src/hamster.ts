import type { Object3D } from 'three';
import { BEACON } from './bolt';
import type { Act, Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import { ease, Fluffy, pulse, span } from './fluffy';
import { Spring } from './spring';

/**
 * Pocket, the robot hamster: a plump round body, a wide screen face and two tiny puck ears,
 * stub legs on ball joints and big flat hind feet. His signature is the two cheek domes at
 * the sides of his head: each is a light that glows brighter as it fills, and swells with it.
 *
 * He stuffs his cheeks with sunflower seeds (a little pile that lives in the model and
 * pops up in front of him), the domes swelling and glowing one seed at a time, struts about
 * with a face like a balloon, then empties them out again, a seed at a time, into a pile.
 * He brings out a running wheel round himself (a toy on a bone of its own, put away
 * otherwise) and runs in it, the rims flashing faster as he speeds up, till he's puffing.
 * He washes his face with both paws, nibbles with his paws at his mouth, and curls into a
 * ball to sleep. Sitting up he holds his paws to his chest. Everything a little fluffy robot
 * does is in the base (fluffy.ts): yawns, sniffs, a head tilt, scratching, hops, spinning.
 */
export const HAMSTER_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.3, 0.5],
    [0.7, 0.5],
  ],
  rx: 0.09,
  ry: 0.32,
  line: 0.035,
  mouth: null,
};

const SEEDS = 4;

export class Hamster extends Fluffy {
  static readonly terms =
    'rodent pet plump round orange tan peach cream brown cheeks pouches seeds sunflower stuffs wheel running paws tiny ears fluffy nibbles';

  /** How full each cheek is (0..1) and the wheel's state. */
  private cheeks = [new Spring(6, 0.45, 1.3), new Spring(6, 0.45, 1.3)];
  private full = [0, 0];
  private pile = new Spring(5, 0.4, 1.4);
  private pileGoal = 0;
  private seeds = Array.from({ length: SEEDS }, () => new Spring(7, 0.6, 1));
  private seedGoal = Array.from({ length: SEEDS }, () => 1);
  private toy = new Spring(4.5, 0.4, 1.4);
  private toyGoal = 0;
  private wheelSpeed = new Spring(1.2, 0.9);
  private wheelRate = 0;
  private wheelA = 0;
  private runPhase = 0;
  private flash = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Pocket',
        model: 'hamster',
        metres: 0.31,
        width: 0.3,
        size: 0.55,
        face: HAMSTER_FACE,
        eyes: 0.7,
        tail: ['tail.1'],
        tailAxis: [0, 0.3, -1],
        sit: -38,
        drop: { sit: -0.045, lie: -0.05 },
        speed: 1,
        lag: 1.1,
        feels: {
          'cheek.L': { f: 6, zeta: 0.5 },
          'cheek.R': { f: 6, zeta: 0.5 },
          'ear.L': { f: 6, zeta: 0.3 },
          'ear.R': { f: 6, zeta: 0.3 },
        },
        moods: { calm: { wag: [6, 0.4] }, happy: { wag: [24, 2.2] } },
        actMoods: {
          hoard: 'happy',
          wheel: 'happy',
          wash: 'happy',
          nibble: 'calm',
          curl: 'asleep',
        },
      },
      model,
    );
    this.dotCount = 3;
    this.acts = { ...this.acts, ...this.mine() };
  }

  private mine(): Record<string, Act> {
    const p = this.puppet;
    return {
      hoard: {
        // Seeds pop up in front of him; he stuffs his cheeks full one at a time, waddles about
        // with a face like a balloon, then spits them all out into a pile again.
        weight: 1.3,
        length: [10.5, 10.5],
        when: this.standing,
        pose: (t) => this.hoard(t),
      },
      wheel: {
        weight: 1.2,
        length: [10, 10],
        when: this.standing,
        pose: (t) => this.wheel(t),
      },
      wash: {
        // Sits up and scrubs his face with both paws, then a quick shake.
        weight: 1.2,
        length: [4.5, 5],
        when: this.still,
        start: () => (this.posture = 'sit'),
        pose: (t) => {
          const k = span(t, 0.3, 0.8, 3.7, 4.2);
          const rub = Math.sin(t * 2 * Math.PI * 4.2);
          p.add('leg.FL', -40 * k + 14 * rub * k, 0, -18 * k);
          p.add('leg.FR', -40 * k - 14 * rub * k, 0, 18 * k);
          p.add('head', 10 * k + 5 * rub * k, 0, 4 * rub * k);
          p.add('ear.L', 0, 0, -10 * k);
          p.add('ear.R', 0, 0, 10 * k);
          const shake = pulse(t, 4.1, 0.8) * Math.sin(t * 2 * Math.PI * 8);
          p.add('head', 0, 0, 16 * shake);
        },
      },
      nibble: {
        // Sits and nibbles at nothing, paws at his mouth, a seed's worth of chewing.
        weight: 1,
        length: [4, 6],
        when: this.still,
        start: () => (this.posture = 'sit'),
        pose: (t) => {
          const k = span(t, 0.3, 0.7, this.actLength - 0.7, this.actLength - 0.3);
          const chew = Math.max(0, sin(t, 5.5));
          p.add('head', k * (10 + 5 * chew));
          p.add('leg.FL', -14 * k, 0, -8 * k);
          p.add('leg.FR', -14 * k, 0, 8 * k);
          p.add('ear.L', 0, 0, -8 * chew * k);
          p.add('ear.R', 0, 0, 8 * chew * k);
          this.full[0] = this.full[1] = 0.18 * chew * k;
        },
      },
      curl: {
        // Rolls up into a ball with his nose in his tummy and sleeps, rocking a little.
        weight: 1.1,
        length: [10, 16],
        when: this.still,
        start: () => (this.posture = 'lie'),
        pose: (t) => {
          const k = ease(t, 0.2, 1.4);
          const breath = sin(t, 0.28);
          p.add('body', (34 + 2 * breath) * k);
          p.add('head', (52 + 3 * breath) * k, 0, 8 * k);
          p.add('root', 0, 0, 3 * sin(t, 0.15) * k);
          p.add('ear.L', -30 * k, 0, -30 * k);
          p.add('ear.R', -30 * k, 0, 30 * k);
          p.add('leg.FL', 60 * k);
          p.add('leg.FR', 60 * k);
        },
      },
    };
  }

  /** The hoard: seeds up, stuff, strut, empty, put away. Times in seconds from the start. */
  private hoard(t: number) {
    const p = this.puppet;
    const L = 10.5;
    this.pileGoal = ease(t, 0.1, 0.6) * (1 - ease(t, L - 1.2, L - 0.8));
    const crouch = span(t, 0.3, 0.9, 7.6, 8.2);
    p.add('head', 18 * crouch);
    p.add('body', 6 * crouch);
    // Stuffing: one seed in each beat, a paw to the mouth, the cheek filling.
    let filled = 0;
    for (let i = 0; i < SEEDS; i++) {
      const at = 1.2 + i * 0.75;
      if (t > at) {
        this.seedGoal[i] = 0;
        filled = i + 1;
      }
      // the paw
      const reach = pulse(t, at - 0.3, 0.7);
      if (reach) {
        p.add(i % 2 ? 'leg.FR' : 'leg.FL', -55 * reach);
        p.add('head', 8 * reach);
      }
    }
    // Strutting about with full cheeks, a face like a balloon.
    const strut = span(t, 4.4, 5, 6.6, 7.2);
    // Emptying: a seed out at every beat from 7.4, the cheeks going down with it.
    for (let i = 0; i < SEEDS; i++) {
      const at = 7.4 + i * 0.6;
      if (t > at) this.seedGoal[i] = 1;
      const spit = pulse(t, at - 0.05, 0.45);
      if (spit) {
        p.add('head', 14 * spit);
        p.add('body', 4 * spit);
      }
    }
    const inside = this.seedGoal.filter((g) => g === 0).length;
    const level = (inside / SEEDS) * 0.9 + (inside === SEEDS ? 0.1 : 0);
    const chew = t < 4.4 ? 0.06 * Math.max(0, sin(t, 5)) : 0;
    this.full[0] = level + chew;
    this.full[1] = level + (t < 4.4 ? 0.06 * Math.max(0, sin(t, 5, 0.5)) : 0);
    filled = inside;
    p.add('root', 0, 0, 5 * sin(t, 1.2) * strut);
    p.add('head', 0, 8 * sin(t, 1.2, 0.25) * strut, -6 * sin(t, 1.2) * strut);
    p.add('ear.L', -6 * strut);
    p.add('ear.R', -6 * strut);
    const p2 = Math.sin(t * 2 * Math.PI * 1.2);
    if (strut > 0.5) {
      p.add('leg.FL', 12 * p2);
      p.add('leg.BR', 12 * p2);
      p.add('leg.FR', -12 * p2);
      p.add('leg.BL', -12 * p2);
    }
    this.flash = filled === SEEDS && t < 7.4 ? 1 : 0;
  }

  /** The wheel: it pops up round him, he runs, faster and faster, then puffs. */
  private wheel(t: number) {
    const p = this.puppet;
    const L = 10;
    this.toyGoal = ease(t, 0.2, 0.7) * (1 - ease(t, L - 0.9, L - 0.4));
    const go = span(t, 1.2, 4, 7, 9);
    const rate = 0.4 + 2.4 * go; // revolutions per second
    this.wheelRate = rate;
    const run = Math.min(1, go * 1.5);
    const a = Math.sin(this.runPhase);
    p.add('leg.FL', 38 * a * run);
    p.add('leg.BR', 38 * a * run);
    p.add('leg.FR', -38 * a * run);
    p.add('leg.BL', -38 * a * run);
    p.add('body', 10 * run, 0, 0);
    p.add('head', -4 * run);
    p.add('ear.L', -22 * run);
    p.add('ear.R', -22 * run);
    p.add('tail.1', 28 * run);
    const puff = span(t, 8.4, 8.9, L - 0.6, L - 0.2);
    p.add('body', 3 * puff * Math.sin(t * 2 * Math.PI * 2.5));
    p.add('head', 6 * puff);
  }

  protected pose(dt: number, env: Env) {
    // Side on to us in the wheel, so the circle shows.
    const t = this.actT;
    this.anatomy.turn = this.act === 'wheel' && t > 0.2 && t < 9.6 ? 88 : 45;
    if (this.act === 'wheel') {
      this.runPhase += this.wheelRate * 2 * Math.PI * dt * 1.5;
    }
    super.pose(dt, env);
    if (this.walking) this.puppet.add('root', 0, 0, 3.5 * Math.sin(this.gait));
  }

  /** Sitting up on his haunches with his paws held to his chest. */
  protected sitting() {
    super.sitting();
    this.puppet.add('leg.FL', -100, 0, -10);
    this.puppet.add('leg.FR', -100, 0, 10);
  }

  /** Lying on his tummy with his paws tucked, nose down. */
  protected lying(breath: number) {
    super.lying(breath);
    this.puppet.add('head', 10);
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    // The cheeks swell and glow with how full they are.
    this.cheeks.forEach((c, i) => {
      const f = c.update(dt, Math.min(1.1, this.full[i]));
      const s = 1 + 0.5 * Math.max(-0.2, f);
      p.stretch(i ? 'cheek.R' : 'cheek.L', s, [1, 0, 0], s);
    });
    this.full[0] = this.full[1] = this.mood === 'asleep' ? 0.04 : 0.1;
    // The seeds: on the floor in a pile, or in the cheeks.
    const pile = Math.max(0.001, this.pile.update(dt, this.pileGoal));
    this.seeds.forEach((sp, i) => {
      const u = sp.update(dt, this.seedGoal[i]);
      const s = Math.max(0.001, pile * Math.min(1, 0.25 + 0.9 * Math.abs(u)));
      const bone = `pile.${i + 1}`;
      const arc = Math.sin(Math.PI * Math.min(1, Math.max(0, u))) * 0.05;
      p.shift(bone, 0, (1 - u) * 0.17 + arc, -(1 - u) * 0.1);
      p.stretch(bone, s, [0, 1, 0], s);
    });
    this.pileGoal = 0;
    this.seedGoal.fill(1);
    // The wheel, spinning with his feet.
    const toy = Math.max(0.001, this.toy.update(dt, this.toyGoal));
    p.stretch('toy', toy, [0, 1, 0], toy);
    this.wheelA += this.wheelSpeed.update(dt, this.toyGoal ? this.wheelRate : 0) * 360 * dt;
    p.turn('toy', this.wheelA);
    this.toyGoal = 0;
    super.after(dt, env);
  }

  protected lights(time: number) {
    const o = this.outfit;
    const full = Math.min(1, this.cheeks[0].y);
    let tone: string | undefined;
    const m = this.mood;
    if (this.flash) tone = BEACON.happy;
    const base = m === 'asleep' ? 0.06 : 0.14 + 0.06 * Math.sin(time * 0.8);
    o.dot(0, Math.min(1, base + full * 0.9), tone ?? (full > 0.5 ? BEACON.happy : undefined));
    o.dot(
      1,
      Math.min(1, base + this.cheeks[1].y * 0.9),
      tone ?? (full > 0.5 ? BEACON.happy : undefined),
    );
    // Brow lamps follow the mood.
    let brow = 0.4 + 0.1 * Math.sin(time * 0.9);
    let browTone: string | undefined;
    if (m === 'asleep') brow = 0.05;
    else if (m === 'sleepy') brow = 0.25;
    else if (m === 'love') [brow, browTone] = [0.8 + 0.2 * Math.sin(time * 5), BEACON.love];
    else if (m === 'happy') [brow, browTone] = [0.9, BEACON.happy];
    else if (m === 'alarmed')
      [brow, browTone] = [Math.sin(time * 30) > 0 ? 1 : 0.3, BEACON.surprised];
    o.dot(2, Math.max(0, Math.min(1, brow)), browTone);
    // The wheel's rims chase round faster as he speeds up.
    const w =
      this.toy.y > 0.2 ? 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(time * (3 + this.wheelRate * 6))) : 0;
    o.dot(3, w, BEACON.focused);
  }
}
