import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { Expression, FaceLayout } from './face';
import { sin } from './moves';
import { bump, cycle, ease, FixedSpring, type Point, ripple, type Spot, Swimmer } from './swimmer';

/**
 * Nari, the robot narwhal: a small round whale, the unicorn's sea twin. It swims in the band
 * just inside the frame (the swimmer kit), side on: a plump body with a pale belly plate, a
 * big screen face, a tusk that is a spiral of seven lit rings (the tip the beacon), two round
 * flippers, a row of lamps down its back and a tail stalk with swept flukes. A blowhole on
 * top keeps a column of five lit rings that it blows out as a spout of light.
 *
 * Tricks: an easy swim with the tail pumping, blowing a spout of light, a barrel roll, a
 * little breach (up out of the band and over in an arc), a tusk glow that chases up the
 * spiral, pointing the tusk at the page like a compass, spinning the tusk like a drill,
 * waving a flipper, a nod, peeking from the back wall, dozing, a dance, hiccups that puff the
 * spout, a bow, looking round, and a quick dart. Poke it and it flicks its flukes and darts
 * off, the tusk flashing; three pokes and it spins dizzy; rest the mouse on it and it blushes
 * and sways.
 */
export const NARWHAL_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.28, 0.5],
    [0.72, 0.5],
  ],
  rx: 0.12,
  ry: 0.3,
  line: 0.038,
  mouth: [0.5, 0.8],
};

const SPOUT = ['spout.0', 'spout.1', 'spout.2', 'spout.3', 'spout.4'];
const TUSK = ['tusk.1', 'tusk.2', 'tusk.3'];
/** The dots: 0..6 the tusk rings from the base, 7 the back lamps. */
const RINGS = 7;

export class Narwhal extends Swimmer {
  private blow = new FixedSpring(3, 0.8);
  private tusk = new FixedSpring(4, 0.35);
  private flipper = new FixedSpring(5, 0.3);
  private nod = new FixedSpring(3, 0.5);
  private bow = new FixedSpring(2, 0.6);
  private pump = 0;
  private roll = 0;
  private spin = 0;
  private drill = 0;
  private flash = -1;
  private tone: string | undefined;
  private puffs: number[] = [];

  constructor(model: Object3D) {
    const feels: Record<string, { f: number; zeta: number; r?: number }> = {
      default: { f: 3, zeta: 0.5 },
      root: { f: 1.4, zeta: 0.6 },
      body: { f: 1.8, zeta: 0.45, r: 0.5 },
      face: { f: 4, zeta: 0.5 },
      'tusk.1': { f: 4, zeta: 0.4 },
      'tusk.2': { f: 4, zeta: 0.35 },
      'tusk.3': { f: 4, zeta: 0.3 },
      'fin.L': { f: 5, zeta: 0.4 },
      'fin.R': { f: 5, zeta: 0.4 },
      dorsal: { f: 4, zeta: 0.4 },
      'tail.1': { f: 3.2, zeta: 0.35 },
      'tail.2': { f: 3.6, zeta: 0.3 },
    };
    super(
      {
        name: 'Nari',
        model: 'narwhal',
        metres: 0.26,
        width: 0.5,
        size: 1.0,
        feels: feels as never,
        face: NARWHAL_FACE,
        eyes: 0.8,
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
    );
    this.inset = 0.72;
    this.acts = this.moves();
  }

  private moves(): Record<string, Act> {
    const still = () => !!this.free && !this.route.length && !this.exiting;
    return {
      idle: { weight: 3, length: [3, 7] },
      swim: {
        weight: 2.6,
        length: [3, 6],
        when: still,
        start: () => this.swimTo(this.somewhere()),
      },
      spout: { weight: 1.5, length: [5, 5.6], face: 'happy', when: still },
      roll: { weight: 1.3, length: [3.4, 3.8], face: 'happy', when: still },
      breach: { weight: 1.1, length: [3.6, 4], face: 'surprised', when: still },
      glow: { weight: 1, length: [4, 4.6], face: 'focused', when: still },
      point: { weight: 0.9, length: [4.6, 5.2], face: 'determined', when: still },
      drill: { weight: 0.8, length: [3.6, 4], face: 'determined', when: still },
      wave: { weight: 0.8, length: [3.4, 3.8], face: 'happy', when: still },
      nod: { weight: 0.9, length: [3.4, 4], face: 'happy', when: still },
      peek: { weight: 0.7, length: [8, 8.6], when: still },
      doze: { weight: 0.7, length: [9, 14], face: 'asleep', when: still },
      dance: { weight: 0.8, length: [5, 5.6], face: 'happy', when: still },
      hiccup: { weight: 0.7, length: [4, 4.4], when: still },
      look: { weight: 1, length: [4, 5], when: still },
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
    if (['poked', 'wave', 'bow', 'point', 'glow', 'nod', 'dance', 'spout'].includes(act))
      return 0.1;
    return undefined;
  }

  protected startle() {
    this.hold();
    this.kickTo(this.toward);
    this.flash = 0;
    this.tone = BEACON.surprised;
    this.puppet.kick('tail.1', 40);
    this.setAct('poked');
  }

  protected station(env: Env, s: Spot): Point {
    const t = this.actT;
    const H = s.H;
    let x = 0;
    let y = 0;
    switch (this.act) {
      case 'spout':
        y =
          H *
          0.12 *
          ease(t / 1.2) *
          (t < this.actLength - 1 ? 1 : 1 - ease(t - this.actLength + 1));
        break;
      case 'breach': {
        // Up and over: an arc across the band, nose first up and tail first down.
        const u = clamp((t - 0.4) / 2.6, 0, 1);
        x = this.toward * H * 1.7 * (u - 0.5);
        y = -H * 1.5 * Math.sin(Math.PI * u);
        break;
      }
      case 'doze':
        y = H * 0.2 * ease(t / 3);
        break;
      case 'dance':
        x = H * 0.25 * Math.sin(t * 2 * Math.PI * 0.8);
        y = -H * 0.08 * Math.abs(Math.sin(t * 2 * Math.PI * 1.6));
        break;
      case 'dizzy':
        x = Math.cos(env.time * 4) * H * 0.2;
        y = Math.sin(env.time * 4) * H * 0.12;
        break;
      case 'roll':
        y = -H * 0.1 * bump(t - 1.7, 1.7);
        break;
    }
    return { x, y };
  }

  protected fast() {
    return this.act === 'dart' || this.act === 'poked' ? 5 : 1.6;
  }

  protected turnFor(fade: number) {
    switch (this.act) {
      case 'wave':
      case 'bow':
      case 'point':
        return this.toward * 30 * fade;
      case 'nod':
      case 'hiccup':
      case 'spout':
      case 'glow':
      case 'peek':
        return this.toward * 18 * fade;
      case 'look':
        return 55 * Math.sin(this.actT * 1.4) * fade;
      default:
        return super.turnFor(fade);
    }
  }

  protected leanGain() {
    return 0.1;
  }

  protected leanFor() {
    const t = this.actT;
    switch (this.act) {
      case 'breach': {
        // Nose up on the way up, level at the top, nose down on the way over.
        const u = clamp((t - 0.4) / 2.6, 0, 1);
        return this.toward * 1.1 * Math.cos(Math.PI * u) * Math.sin(Math.PI * u + 0.3);
      }
      case 'dance':
        return 0.2 * Math.sin(t * 2 * Math.PI * 0.8);
      case 'bow':
        return this.toward * 0.2 * this.bow.y;
      case 'doze':
        return 0.15 * ease(t / 3);
      case 'love':
        return 0.15 * Math.sin(t * 2.4);
      default:
        return 0;
    }
  }

  protected idle(t: number) {
    const p = this.puppet;
    p.shift('root', 0, 0.012 * sin(t, 0.35), 0);
    p.add('body', 2 * sin(t, 0.21), 0, 2 * sin(t, 0.17));
    p.add('tusk.2', 3 * sin(t, 0.3), 3 * sin(t, 0.22), 0);
    p.add('tail.1', 0, 5 * sin(t, 0.4), 0);
    p.add('tail.2', 0, 6 * sin(t, 0.4 + 0.3), 0);
  }

  protected pose(dt: number, env: Env) {
    super.pose(dt, env);
    const p = this.puppet;
    const t = this.actT;
    const act = this.act;
    const time = env.time;
    const left = this.actLength - t;
    const calm = !['poked', 'dizzy', 'love', 'dart', 'breach', 'roll'].includes(act);
    this.mind(dt, env, calm);
    const crossed = (at: number) => t >= at && t - dt < at;

    let face: Expression = this.hovered ? 'happy' : 'neutral';
    let blow = 0;
    let tusk = 0;
    let flipper = 0;
    let nod = 0;
    this.spinning = false;
    this.spin = 0;
    this.roll = 0;
    this.drill = 0;
    switch (act) {
      case 'poked':
        face = t < 0.5 ? 'surprised' : t < 2.4 ? 'cross' : 'sleepy';
        tusk = 1;
        break;
      case 'spout': {
        blow = ease((t - 0.6) / 0.5) * (left > 1.4 ? 1 : ease((left - 0.6) / 0.8));
        face = t < 0.6 ? 'focused' : 'happy';
        nod = -8 * blow;
        break;
      }
      case 'roll': {
        const u = ease((t - 0.2) / 2.8);
        this.roll = 2 * Math.PI * u * this.toward;
        this.spinning = true;
        break;
      }
      case 'breach': {
        const u = clamp((t - 0.4) / 2.6, 0, 1);
        this.spinning = u > 0 && u < 1;
        blow = bump(t - 3, 0.7) * 0.8;
        flipper = 1;
        face = u > 0.2 && u < 0.8 ? 'happy' : 'surprised';
        break;
      }
      case 'glow':
        face = 'focused';
        tusk = 0.3;
        break;
      case 'point': {
        const k = ease(Math.min(t, left));
        tusk = k;
        nod = -6 * k;
        face = 'determined';
        break;
      }
      case 'drill':
        this.drill = ease(Math.min(t / 0.6, left / 0.6)) * (t * 14);
        tusk = 0.5;
        break;
      case 'wave':
        flipper = t > 0.4 && left > 0.6 ? 1 : 0;
        break;
      case 'nod':
        nod = 14 * Math.sin(t * 2 * Math.PI * 1.2) * ease(Math.min(t, left));
        break;
      case 'peek':
        face = t < 3.2 ? 'neutral' : t < 5.2 ? 'focused' : 'surprised';
        p.add('body', 5 * Math.sin(t * 1.8), 8 * Math.sin(t * 1.3), 0);
        break;
      case 'doze':
        nod = 14 * ease(t / 2);
        break;
      case 'dance':
        flipper = 0.7;
        break;
      case 'hiccup': {
        for (const at of [0.7, 1.6, 2.5]) {
          if (crossed(at)) {
            this.puffs.push(0);
            p.kick('body', -14);
            this.flash = 0;
            this.tone = BEACON.surprised;
          }
        }
        face = [0.7, 1.6, 2.5].some((x) => t > x && t < x + 0.25) ? 'surprised' : 'neutral';
        break;
      }
      case 'bow':
        this.bow.update(dt, t > 0.5 && left > 1 ? 1 : 0);
        nod = 20 * this.bow.y;
        break;
      case 'love':
        face = 'love';
        break;
      case 'dizzy':
        face = 'dizzy';
        break;
    }
    if (act !== 'bow') this.bow.update(dt, 0);
    this.expression = face;
    const nd = this.nod.update(dt, nod);
    this.blow.update(dt, blow);
    this.tusk.update(dt, tusk);
    this.flipper.update(dt, flipper);

    // The tail pumps as it swims; the flukes a beat behind.
    const sw = Math.max(this.swimming(), act === 'dance' ? 0.6 : 0, act === 'breach' ? 1 : 0);
    this.pump += dt * 2 * Math.PI * (0.6 + 1.6 * sw);
    p.add('tail.1', 0, (4 + 14 * sw) * Math.sin(this.pump), 0);
    p.add('tail.2', 0, (6 + 20 * sw) * Math.sin(this.pump - 0.8), 0);
    p.add('body', nd * 0.6, 0, 0);
    p.add('tusk.1', nd * -0.3 + this.tusk.y * -10, 0, 0);
    // A drill: each tusk section turned a little more round its own axis.
    if (this.drill) for (const b of TUSK) p.turn(b, 0, 0, this.drill * 30);
    if (this.free) p.add('body', clamp(this.vel.y / (this.heightPx * 2), -1, 1) * 8);
    if (act === 'dizzy' && t > 1.5)
      p.add('body', 6 * Math.cos(time * 5), 0, 6 * Math.sin(time * 5));
    void RINGS;
  }

  /** Lights: seven tusk rings (0 at the base), the back lamps (7). */
  private lights(time: number) {
    const act = this.act;
    const t = this.actT;
    const moving = this.swimming() > 0.25;
    for (let i = 0; i < 8; i++) {
      let level = 0.55 + 0.25 * Math.sin(time * 0.9 - i * 0.7);
      let tone: string | undefined;
      const run = (speed: number) => 0.35 + 0.65 * bump(cycle(time * speed) * 1.5 - i * 0.14, 0.2);
      if (act === 'poked' && t < 0.8) {
        level = Math.sin(time * 34) > 0 ? 1 : 0.35;
        tone = BEACON.surprised;
      } else if (act === 'dizzy') {
        level = Math.sin(time * 7 + i * 2.3) > 0.2 ? 1 : 0.15;
        tone = RAINBOW[(i + Math.floor(time * 3)) % RAINBOW.length];
      } else if (act === 'love' || act === 'bow') {
        level = 0.65 + 0.35 * Math.sin(time * 2.4 - i * 0.6);
        tone = BEACON.love;
      } else if (act === 'glow' || act === 'point') {
        level = run(1.4);
        tone = BEACON.focused;
      } else if (act === 'drill') {
        level = Math.sin(time * 18 - i * 1.1) > 0 ? 1 : 0.25;
        tone = RAINBOW[(i + Math.floor(time * 5)) % RAINBOW.length];
      } else if (act === 'dance' || act === 'roll' || act === 'breach') {
        level = Math.sin(t * 2 * Math.PI * 1.6 + i) > 0 ? 1 : 0.25;
        tone = RAINBOW[(i + Math.floor(time * 4)) % RAINBOW.length];
      } else if (act === 'spout') {
        level = 0.4 + 0.6 * bump(cycle(time * 1.2) * 1.5 - i * 0.12, 0.3);
        tone = BEACON.happy;
      } else if (act === 'hiccup') {
        level = 0.5 + 0.5 * Math.sin(time * 20 + i * 1.7);
        tone = BEACON.surprised;
      } else if (act === 'doze') {
        level = 0.2 + 0.15 * Math.sin(time * 0.8);
      } else if (moving) {
        level = 0.45 + 0.55 * bump(cycle(time * 1.5) * 1.4 - i * 0.16, 0.25);
      } else if (this.hovered) tone = BEACON.happy;
      this.outfit.dot(i, level, tone);
    }
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    const time = env.time;
    this.lights(time);
    if (this.flash >= 0) {
      this.flash += dt;
      if (this.flash > 1.4) this.flash = -1;
    }
    this.outfit.beacon(
      this.flash >= 0 && this.tone
        ? this.tone
        : ['glow', 'point', 'drill', 'dance', 'roll', 'breach'].includes(this.act)
          ? RAINBOW[Math.floor(time * 6) % RAINBOW.length]
          : (BEACON[this.expression] ?? BEACON.neutral!),
    );
    // Flippers paddle; one waves.
    const fl = this.flipper.y;
    for (const [fin, s] of [
      ['fin.L', 1],
      ['fin.R', -1],
    ] as const) {
      const a = Math.sin(this.pump * 0.7 + (s > 0 ? 0 : 1.1));
      p.turn(fin, 0, 0, s * (8 + 18 * this.swimming()) * a);
      if (s > 0 && this.act === 'wave') p.turn(fin, 0, 0, 60 * fl + 30 * fl * Math.sin(time * 14));
      if (this.act === 'breach' || this.act === 'dance') p.turn(fin, 0, 0, s * 30 * fl);
    }
    ripple(p, ['dorsal'], this.pump, 6, 0, 1);

    // The spout: five lit rings rise out of the blowhole, grow, and thin out as they go. A
    // hiccup sends a small puff of a few.
    const bl = this.blow.y;
    this.puffs = this.puffs.map((a) => a + dt).filter((a) => a < 1.2);
    SPOUT.forEach((b, i) => {
      let k = 0;
      let rise = 0;
      if (bl > 0.01) {
        const ph = cycle(time * 0.9 - i * 0.16);
        k = bl * bump(ph - 0.5, 0.5);
        rise = ph;
      }
      for (const a of this.puffs) {
        const u = a / 1.2 - i * 0.1;
        if (u > 0 && u < 1) {
          k = Math.max(k, 0.7 * bump(u - 0.5, 0.5));
          rise = Math.max(rise, u);
        }
      }
      p.stretch(b, Math.max(0.001, k * 1.6), [0, 1, 0], Math.max(0.001, k * 1.6));
      p.shift(b, 0, 0.012 + 0.11 * rise * (1 + i * 0.15) * (k > 0 ? 1 : 0), 0);
    });

    // Rolling about the long axis; spinning about the vertical when dizzy.
    if (this.act === 'dizzy') {
      const u = clamp((this.actT - 0.2) / 2.4, 0, 1);
      this.pivot.rotation.y = 4 * Math.PI * u * u * (3 - 2 * u);
      this.pivot.rotation.z = 0;
    } else {
      this.pivot.rotation.y = this.spin;
      this.pivot.rotation.z = this.roll;
    }
  }
}
