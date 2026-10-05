import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { clamp, type Env } from './character';
import type { Expression, FaceLayout } from './face';
import { sin } from './moves';
import { Fishy } from './fishy';
import { bump, cycle, ease, FixedSpring, type Point, ripple, type Spot } from './swimmer';

/**
 * Zest, the robot clownfish: a small round orange fish, plump at the front with the crew's screen
 * face, tapering to a round tail fan. Three white bands round its body, each lit and edged in
 * dark lines; a tall rounded dorsal and two round pectoral fins. It brings a little anemone
 * with it for its tricks: a round cushion with nine lit stalks.
 *
 * Tricks: wiggling nervously close to a crewmate, darting in and out of its anemone (which grows
 * beside it), a proud flare of every fin with the bands blazing, a zigzag wiggle, a shimmer that
 * runs down the bands, and the shared sea tricks. Poke it and it zips off with its fins clamped;
 * three pokes and it spins dizzy; rest the mouse on it and it bobs happily.
 */
export const CLOWNFISH_FACE: FaceLayout = {
  width: 512,
  height: 352,
  eyes: [
    [0.3, 0.5],
    [0.7, 0.5],
  ],
  rx: 0.115,
  ry: 0.3,
  line: 0.038,
  mouth: [0.5, 0.82],
};

const STALKS = Array.from({ length: 9 }, (_, i) => `anemone.${i}`);
/** The anemone act's dart in and out, 0 beside it .. 1 right in among the stalks. */
const dartIn = (t: number) =>
  ease((t - 2.4) / 0.5) -
  ease((t - 3.6) / 0.4) +
  ease((t - 4.7) / 0.5) -
  ease((t - 5.9) / 0.4) +
  0.6 * (ease((t - 6.6) / 0.4) - ease((t - 7.2) / 0.4));

export class Clownfish extends Fishy {
  static readonly terms =
    'nemo fish orange white black brown stripes bands striped fins tail anemone tiny small round swim wiggle zigzag shimmer reef shy';

  private anem = new FixedSpring(5, 0.5);
  private dart = new FixedSpring(7, 0.5);
  private flare = new FixedSpring(6, 0.35);
  private wiggle = new FixedSpring(8, 0.6);
  private near = new FixedSpring(2, 0.8);

  constructor(model: Object3D) {
    const feels: Record<string, { f: number; zeta: number; r?: number }> = {
      default: { f: 3, zeta: 0.5 },
      root: { f: 1.4, zeta: 0.6 },
      body: { f: 2, zeta: 0.45, r: 0.5 },
      face: { f: 4, zeta: 0.5 },
      dorsal: { f: 4, zeta: 0.4 },
      'fin.L': { f: 5, zeta: 0.4 },
      'fin.R': { f: 5, zeta: 0.4 },
      'tail.1': { f: 3.4, zeta: 0.35 },
      'tail.2': { f: 3.8, zeta: 0.3 },
      anemone: { f: 4, zeta: 0.5 },
    };
    for (const b of STALKS) feels[b] = { f: 3.5, zeta: 0.3 };
    super(
      {
        name: 'Zest',
        model: 'clownfish',
        metres: 0.3,
        width: 0.36,
        size: 0.95,
        feels: feels as never,
        face: CLOWNFISH_FACE,
        eyes: 0.45,
        gaze: [{ bone: 'body', yaw: 0.5, pitch: 0.35 }],
        reach: { yaw: 50, pitch: 25 },
        lag: 1.2,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 1.4,
        turn: 70,
      },
      model,
      { tail: ['tail.1', 'tail.2'], fins: ['fin.L', 'fin.R'], dorsal: 'dorsal', dots: 4 },
    );
    this.idleTurn = 35;
    this.inset = 0.72;
    const still = this.still;
    this.acts = {
      ...this.baseActs(),
      nervous: {
        weight: 1.4,
        length: [7, 7.6],
        face: 'sheepish',
        when: () => still() && !!this.mate(),
      },
      anemone: { weight: 1.5, length: [9.6, 10.2], face: 'happy', when: still },
      flare: { weight: 1.1, length: [4, 4.6], face: 'determined', when: still },
      zigzag: { weight: 1, length: [4, 4.6], face: 'happy', when: still },
      shimmer: { weight: 1, length: [4.4, 5], face: 'happy', when: still },
    };
  }

  protected busy() {
    return ['anemone', 'poked', 'nervous'].includes(this.act);
  }

  protected depthFor(act: string) {
    if (['anemone', 'flare', 'shimmer'].includes(act)) return 0.1;
    if (act === 'nervous') return 0.05;
    return super.depthFor(act);
  }

  protected startle() {
    this.flare.kick(-8);
    super.startle();
  }

  protected station(env: Env, s: Spot): Point {
    const base = super.station(env, s);
    const t = this.actT;
    const left = this.actLength - t;
    const H = s.H;
    let x = 0;
    let y = 0;
    switch (this.act) {
      case 'nervous': {
        // Over beside a crewmate, and fidgeting there.
        const m = this.mate();
        const k = ease(Math.min(t / 1.4, left / 1.4));
        if (m) {
          const dx = m.x - s.at.x;
          const dy = m.y - s.at.y;
          const side = Math.sign(-dx) || 1;
          x = clamp(dx + side * H * 1.15, -H * 4, H * 4) * k;
          y = clamp(dy * 0.3, -H * 1.2, H * 1.2) * k;
        }
        x += H * 0.05 * Math.sin(t * 17) * k;
        y += H * 0.04 * Math.sin(t * 13) * k;
        break;
      }
      case 'zigzag':
        x = this.toward * H * 0.5 * Math.sin(t * 5.2) * ease(Math.min(t, left));
        y = H * 0.12 * Math.sin(t * 10.4) * ease(Math.min(t, left));
        break;
      case 'flare':
        y = -H * 0.08 * bump(t - 1.6, 1.4);
        break;
      case 'anemone':
        y = -H * 0.04 * Math.sin(t * 2);
        break;
    }
    return { x: base.x + x, y: base.y + y };
  }

  protected turnFor(fade: number) {
    switch (this.act) {
      case 'anemone':
        return 8 * Math.sin(this.actT * 1.4) * fade;
      case 'flare':
        return this.toward * 12 * fade;
      case 'nervous':
        return this.toward * (30 + 14 * Math.sin(this.actT * 17)) * fade;
      case 'zigzag':
        return 38 * Math.cos(this.actT * 5.2) * this.toward * fade;
      case 'shimmer':
        return this.toward * 20 * fade;
      default:
        return super.turnFor(fade);
    }
  }

  protected leanFor() {
    const t = this.actT;
    switch (this.act) {
      case 'zigzag':
        return 0.25 * Math.cos(t * 5.2) * this.toward;
      case 'nervous':
        return 0.08 * Math.sin(t * 17);
      case 'flare':
        return -0.1 * ease(Math.min(t, this.actLength - t));
      default:
        return super.leanFor();
    }
  }

  protected idle(t: number) {
    super.idle(t);
    this.puppet.add('dorsal', 0, 0, 3 * sin(t, 0.4));
  }

  protected special(dt: number, env: Env) {
    const p = this.puppet;
    const t = this.actT;
    const left = this.actLength - t;
    const act = this.act;
    let face: Expression | null = null;
    let anem = 0;
    let dart = 0;
    let flare = 0;
    let wiggle = 0;
    switch (act) {
      case 'nervous':
        wiggle = ease(Math.min(t / 1.2, left / 1.2));
        face = t < 1.6 ? 'sheepish' : Math.sin(t * 1.7) > 0.6 ? 'surprised' : 'sheepish';
        break;
      case 'anemone': {
        anem = t > 0.3 && t < 8.6 ? 1 : 0;
        dart = dartIn(t);
        face = dart > 0.6 ? 'surprised' : t > 7.6 ? 'happy' : t > 0.9 ? 'focused' : 'neutral';
        wiggle = 0.3 * (t > 2 && t < 2.5 ? 1 : 0);
        break;
      }
      case 'flare': {
        const k = ease(Math.min(t / 0.5, left / 0.7));
        flare = t > 0.3 && left > 0.5 ? 1 : 0;
        face = k > 0.5 ? 'determined' : 'neutral';
        break;
      }
      case 'zigzag':
        wiggle = 1;
        break;
      case 'poked':
        flare = -0.8 * (t < 2.4 ? 1 : 0);
        wiggle = t < 1.4 ? 1 : 0;
        break;
      case 'love':
        wiggle = 0.25;
        flare = 0.35;
        break;
      case 'dizzy':
        wiggle = 0.6;
        break;
    }
    if (face) this.expression = face;
    this.anem.update(dt, anem);
    const dt2 = this.dart.update(dt, dart);
    this.flare.update(dt, flare);
    this.wiggle.update(dt, wiggle);
    // Into the anemone: over to it and a little behind its stalks.
    p.shift('body', 0.2 * dt2, -0.03 * dt2, -0.07 * dt2);
    p.add('body', 0, -20 * dt2, 0);
    p.add('body', 0, 14 * this.wiggle.y * Math.sin(env.time * 15), 0);
  }

  protected extra(_dt: number, env: Env) {
    const p = this.puppet;
    const time = env.time;
    const fl = this.flare.y;
    const wg = this.wiggle.y;
    // The fins flare: a taller sail, pectorals out, a fan of a tail.
    p.stretch('dorsal', 1 + 0.55 * fl, [0, 1, 0], 1 + 0.25 * Math.max(0, fl));
    p.turn('fin.L', 0, 0, 50 * fl);
    p.turn('fin.R', 0, 0, -50 * fl);
    p.stretch('tail.2', 1 + 0.2 * fl, [0, 0, 1], 1 + 0.35 * Math.max(0, fl));
    // A nervous wiggle down the tail.
    if (wg > 0.01) ripple(p, ['tail.1', 'tail.2'], time * 22, 20 * wg, 0.9, 1, 0.3);

    // The anemone: grown from nothing beside it, its stalks waving, in front of the fish.
    const a = Math.max(0.001, this.anem.y);
    p.stretch('anemone', a, [0, 1, 0], a);
    p.shift('anemone', 0, 0, 0.1);
    STALKS.forEach((b, i) => {
      p.turn(
        b,
        14 * Math.sin(time * 2.2 + i * 1.3),
        12 * Math.sin(time * 1.7 + i),
        10 * Math.cos(time * 2.6 + i * 0.7),
      );
      if (this.act === 'anemone' && this.dart.y > 0.3)
        p.turn(b, 0, 0, 18 * Math.sin(time * 14 + i * 2) * this.dart.y);
    });
  }

  protected lights(time: number) {
    const act = this.act;
    const t = this.actT;
    this.defaultLights(time);
    const plain = [
      'idle',
      'swim',
      'look',
      'peek',
      'nod',
      'wave',
      'anemone',
      'nervous',
      'zigzag',
      'bow',
    ].includes(act);
    for (let i = 0; i < 3; i++) {
      // The bands are the fish: lit white by default, a shimmer running down them.
      if (plain && !(act === 'nervous' && Math.sin(t * 17) > 0.8))
        this.outfit.dot(i, 0.8 + 0.2 * Math.sin(time * 1.2 - i * 1.4));
      else if (act === 'flare')
        this.outfit.dot(i, 1, RAINBOW[(i + Math.floor(time * 5)) % RAINBOW.length]);
      else if (act === 'shimmer')
        this.outfit.dot(
          i,
          0.35 + 0.65 * bump(cycle(time * 1.2 - i * 0.18) - 0.5, 0.3),
          RAINBOW[(i * 2 + Math.floor(time * 3)) % RAINBOW.length],
        );
    }
    // Dot3: the anemone's tips, a slow shimmer in pink.
    const grown = this.anem.y;
    this.outfit.dot(
      3,
      grown * (0.6 + 0.4 * Math.sin(time * 3.4)),
      grown > 0.1 ? '#ffb3f2' : undefined,
    );
  }

  protected beaconTone(time: number): string {
    return this.flash >= 0 && this.tone
      ? this.tone
      : act2(this.act)
        ? RAINBOW[Math.floor(time * 6) % RAINBOW.length]
        : (BEACON[this.expression] ?? BEACON.neutral!);
  }
}

const act2 = (a: string) => ['flare', 'shimmer', 'dance', 'roll'].includes(a);
