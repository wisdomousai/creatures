import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { Expression, FaceLayout } from './face';
import { sin } from './moves';
import { bump, cycle, ease, FixedSpring, type Point, ripple, type Spot, Swimmer } from './swimmer';

/**
 * Hum, the robot baby whale: Nari's cousin without the tusk and much rounder. A big bulbous
 * head that is nearly half of her with a big screen face, a stubby body tapering to a tail
 * stalk that curls up to a wide pair of flukes, two small pectoral fins, and a blowhole on top
 * with a column of five lit rings that she blows out as a spout of light. Under her chin is a
 * pleated throat: five lit pleats (Dot0 at the chin .. Dot4), which swell and light in waves
 * when she sings. She swims in the band just inside the frame (the swimmer kit).
 *
 * Tricks: an easy swim, blowing a spout of light, big slow turns (a lazy circle in the band,
 * turning all the way round), a tail slap (the flukes up and down with a splash of light),
 * singing (the pleats light up in waves and the throat swells), a barrel roll, a little breach,
 * waving a fin, a nod, a bow, peeking from the back wall, dozing, a dance, hiccups that puff the
 * spout, a quick dart and looking round. Poke her and she flicks her flukes and darts off with
 * her pleats flashing; three pokes and she spins dizzy; rest the mouse on her and she blushes
 * and hums softly.
 */
export const BABYWHALE_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.27, 0.5],
    [0.73, 0.5],
  ],
  rx: 0.1,
  ry: 0.3,
  line: 0.036,
  mouth: [0.5, 0.8],
};

const SPOUT = ['spout.0', 'spout.1', 'spout.2', 'spout.3', 'spout.4'];
const PLEATS = 5;

export class BabyWhale extends Swimmer {
  private blow = new FixedSpring(3, 0.8);
  private song = new FixedSpring(3, 0.7);
  private slap = new FixedSpring(9, 0.4);
  private flipper = new FixedSpring(5, 0.3);
  private nod = new FixedSpring(3, 0.5);
  private bow = new FixedSpring(2, 0.6);
  private pump = 0;
  private roll = 0;
  private spin = 0;
  private flash = -1;
  private tone: string | undefined;
  private puffs: number[] = [];

  constructor(model: Object3D) {
    const feels: Record<string, { f: number; zeta: number; r?: number }> = {
      default: { f: 3, zeta: 0.5 },
      root: { f: 1.4, zeta: 0.6 },
      body: { f: 1.8, zeta: 0.45, r: 0.5 },
      face: { f: 4, zeta: 0.5 },
      throat: { f: 5, zeta: 0.5 },
      'fin.L': { f: 5, zeta: 0.4 },
      'fin.R': { f: 5, zeta: 0.4 },
      'tail.1': { f: 3.2, zeta: 0.35 },
      'tail.2': { f: 3.6, zeta: 0.3 },
    };
    super(
      {
        name: 'Hum',
        model: 'babywhale',
        metres: 0.27,
        width: 0.52,
        size: 1.05,
        feels: feels as never,
        face: BABYWHALE_FACE,
        eyes: 0.5,
        gaze: [{ bone: 'body', yaw: 0.5, pitch: 0.35 }],
        reach: { yaw: 50, pitch: 25 },
        lag: 1.2,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 1.2,
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
      circle: { weight: 1.3, length: [7, 7.6], face: 'happy', when: still },
      slap: { weight: 1.3, length: [4.6, 5], face: 'determined', when: still },
      sing: { weight: 1.7, length: [7, 7.6], face: 'happy', when: still },
      roll: { weight: 1.1, length: [3.4, 3.8], face: 'happy', when: still },
      breach: { weight: 0.9, length: [3.6, 4], face: 'surprised', when: still },
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
    if (['poked', 'wave', 'bow', 'sing', 'slap', 'nod', 'dance', 'spout', 'circle'].includes(act))
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
      case 'circle': {
        // A wide, slow oval: out, round and back, turning all the way round as she goes.
        const u = clamp((t - 0.3) / 6.6, 0, 1);
        const a = 2 * Math.PI * u;
        x = this.toward * H * 0.9 * Math.sin(a);
        y = -H * 0.35 * (1 - Math.cos(a));
        break;
      }
      case 'breach': {
        const u = clamp((t - 0.4) / 2.6, 0, 1);
        x = this.toward * H * 1.5 * (u - 0.5);
        y = -H * 1.3 * Math.sin(Math.PI * u);
        break;
      }
      case 'doze':
        y = H * 0.2 * ease(t / 3);
        break;
      case 'dance':
        x = H * 0.25 * Math.sin(t * 2 * Math.PI * 0.8);
        y = -H * 0.08 * Math.abs(Math.sin(t * 2 * Math.PI * 1.6));
        break;
      case 'sing':
        y =
          -H *
          0.1 *
          ease(t / 1.2) *
          (t < this.actLength - 1 ? 1 : 1 - ease(t - this.actLength + 1));
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
    return this.act === 'dart' || this.act === 'poked' ? 5 : this.act === 'circle' ? 1.2 : 1.5;
  }

  protected turnFor(fade: number) {
    switch (this.act) {
      case 'wave':
      case 'bow':
        return this.toward * 30 * fade;
      case 'nod':
      case 'hiccup':
      case 'spout':
      case 'sing':
      case 'slap':
      case 'peek':
        return this.toward * 22 * fade;
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
        const u = clamp((t - 0.4) / 2.6, 0, 1);
        return this.toward * 1.0 * Math.cos(Math.PI * u) * Math.sin(Math.PI * u + 0.3);
      }
      case 'dance':
        return 0.2 * Math.sin(t * 2 * Math.PI * 0.8);
      case 'bow':
        return this.toward * 0.2 * this.bow.y;
      case 'sing':
        return -this.toward * 0.1 * ease(t / 1.2);
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
    p.add('tail.1', 5 * sin(t, 0.4), 0, 0);
    p.add('tail.2', 6 * sin(t, 0.4 + 0.3), 0, 0);
  }

  protected pose(dt: number, env: Env) {
    super.pose(dt, env);
    const p = this.puppet;
    const t = this.actT;
    const act = this.act;
    const time = env.time;
    const left = this.actLength - t;
    const calm = !['poked', 'dizzy', 'love', 'dart', 'breach', 'roll', 'circle'].includes(act);
    this.mind(dt, env, calm);
    const crossed = (at: number) => t >= at && t - dt < at;

    let face: Expression = this.hovered ? 'happy' : 'neutral';
    let blow = 0;
    let song = 0;
    let flipper = 0;
    let nod = 0;
    let tail = 0;
    this.spinning = false;
    this.spin = 0;
    this.roll = 0;
    switch (act) {
      case 'poked':
        face = t < 0.5 ? 'surprised' : t < 2.4 ? 'cross' : 'sleepy';
        break;
      case 'spout': {
        blow = ease((t - 0.6) / 0.5) * (left > 1.4 ? 1 : ease((left - 0.6) / 0.8));
        face = t < 0.6 ? 'focused' : 'happy';
        nod = -8 * blow;
        break;
      }
      case 'circle': {
        const u = clamp((t - 0.3) / 6.6, 0, 1);
        this.spin = 2 * Math.PI * ease(u) * this.toward;
        this.spinning = false;
        break;
      }
      case 'slap': {
        // Flukes up, then down hard; three times, a splash of light at each.
        const c = ((t - 0.8) / 1.2) % 1;
        const on = t > 0.8 && t < 4.2;
        tail = on ? (c < 0.55 ? -ease(c / 0.55) : 1 - 2 * ease((c - 0.55) / 0.1) + 0 * c) : 0;
        if (on && c >= 0.65) tail = 1 - ease((c - 0.65) / 0.35);
        for (const at of [1.45, 2.65, 3.85]) {
          if (crossed(at)) {
            p.kick('body', 14);
            this.slap.kick(-40);
            this.flash = 0;
            this.tone = BEACON.happy;
            this.puffs.push(0);
          }
        }
        nod = on ? 6 * Math.max(0, -tail) : 0;
        face = on && c > 0.55 && c < 0.8 ? 'surprised' : 'determined';
        break;
      }
      case 'sing': {
        song = ease(Math.min((t - 0.4) / 0.8, (left - 0.2) / 0.8));
        nod = -10 * song;
        face = song > 0.3 ? 'happy' : 'focused';
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
        song = 0.4;
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
        song = 0.3;
        break;
      case 'dizzy':
        face = 'dizzy';
        break;
    }
    if (act !== 'bow') this.bow.update(dt, 0);
    this.expression = face;
    const nd = this.nod.update(dt, nod);
    this.blow.update(dt, blow);
    this.song.update(dt, song);
    this.flipper.update(dt, flipper);
    this.slap.update(dt, 0);

    // The tail pumps as she swims; a slap swings it up and over.
    const sw = Math.max(this.swimming(), act === 'dance' ? 0.6 : 0, act === 'breach' ? 1 : 0);
    this.pump += dt * 2 * Math.PI * (0.6 + 1.6 * sw);
    p.add('tail.1', (4 + 14 * sw) * Math.sin(this.pump) + tail * 22, 0, 0);
    p.add('tail.2', (6 + 20 * sw) * Math.sin(this.pump - 0.8) + tail * 34, 0, 0);
    p.add('body', nd * 0.6, 0, 0);
    if (this.free) p.add('body', clamp(this.vel.y / (this.heightPx * 2), -1, 1) * 8);
    if (act === 'dizzy' && t > 1.5)
      p.add('body', 6 * Math.cos(time * 5), 0, 6 * Math.sin(time * 5));
  }

  /** Lights: five throat pleats (0 at the chin), the back lamp (5). */
  private lights(time: number) {
    const act = this.act;
    const t = this.actT;
    const moving = this.swimming() > 0.25;
    for (let i = 0; i < 6; i++) {
      let level = 0.5 + 0.25 * Math.sin(time * 0.9 - i * 0.7);
      let tone: string | undefined;
      if (act === 'poked' && t < 0.8) {
        level = Math.sin(time * 34) > 0 ? 1 : 0.35;
        tone = BEACON.surprised;
      } else if (act === 'dizzy') {
        level = Math.sin(time * 7 + i * 2.3) > 0.2 ? 1 : 0.15;
        tone = RAINBOW[(i + Math.floor(time * 3)) % RAINBOW.length];
      } else if (act === 'love' || act === 'bow') {
        level = 0.65 + 0.35 * Math.sin(time * 2.4 - i * 0.6);
        tone = BEACON.love;
      } else if (act === 'sing') {
        // A wave of light down the throat, again and again, a little different each time.
        const k = this.song.y;
        level = 0.2 + 0.8 * k * bump(cycle(time * 0.9) * 1.6 - i * 0.2, 0.28);
        tone = RAINBOW[Math.floor(time * 0.9 + i * 0.3) % RAINBOW.length];
      } else if (act === 'dance' || act === 'roll' || act === 'breach' || act === 'circle') {
        level = Math.sin(t * 2 * Math.PI * 1.6 + i) > 0 ? 1 : 0.25;
        tone = RAINBOW[(i + Math.floor(time * 4)) % RAINBOW.length];
      } else if (act === 'spout') {
        level = 0.4 + 0.6 * bump(cycle(time * 1.2) * 1.5 - i * 0.12, 0.3);
        tone = BEACON.happy;
      } else if (act === 'slap') {
        level = this.flash >= 0 && this.flash < 0.4 ? 1 : 0.4;
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
        : ['sing', 'dance', 'roll', 'breach', 'circle'].includes(this.act)
          ? RAINBOW[Math.floor(time * 6) % RAINBOW.length]
          : (BEACON[this.expression] ?? BEACON.neutral!),
    );
    // Fins paddle; one waves.
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
    ripple(p, ['throat'], this.pump, 0, 0, 1);
    // The throat swells with the song, and with each pulse of it.
    const sg = this.song.y;
    const swell = 1 + sg * (0.08 + 0.05 * Math.sin(time * 5.6));
    p.stretch('throat', swell, [0, 1, 0], 1 + sg * 0.05);

    // The spout: five lit rings rise out of the blowhole and thin out as they go. A hiccup or
    // a slap's splash sends a small puff of a few.
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

    // Rolling about the long axis; turning right round about the vertical.
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
