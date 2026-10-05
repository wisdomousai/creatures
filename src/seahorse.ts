import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { Expression, FaceLayout } from './face';
import { sin } from './moves';
import { bump, cycle, ease, FixedSpring, type Point, ripple, type Spot, Swimmer } from './swimmer';

/**
 * Bobbin, the robot seahorse. It swims upright, side on, in the band just inside the frame
 * (the swimmer kit): a round head with a screen face, a snout and a crown of three prongs
 * (the middle one the beacon), a plump chest with four lit belly bands, a dorsal fin that
 * flutters very fast, and a tail of eight rounded segments built curled into a spiral that
 * it winds up tighter or lets out long. It bobs as it goes, the tail swaying a beat behind.
 *
 * Tricks: an upright bobbing swim, curling its tail round the frame line and holding on,
 * swaying (a colour flush: the belly bands run through colours and the crown flashes), a
 * hover with every fin fluttering, a stretch (the tail let out long, the snout up), nodding,
 * sniffing at the page with the snout, a pirouette, peeking from the back wall, dozing with
 * the tail curled tight and the head drooping, waving a fin, a dance, hiccups that snap the
 * tail, puffing out its chest proudly, looking round, a quick dart, and a bow. Poke it and
 * it darts off with its tail wound tight, the fins buzzing and every light flashing; three
 * pokes and it spins dizzy; rest the mouse on it and it flushes pink and sways.
 */
export const SEAHORSE_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.3, 0.46],
    [0.7, 0.46],
  ],
  rx: 0.1,
  ry: 0.27,
  line: 0.036,
  mouth: null,
};

const TAIL = ['tail.1', 'tail.2', 'tail.3', 'tail.4', 'tail.5', 'tail.6', 'tail.7', 'tail.8'];
/** How much each tail bone is turned in the rest pose (degrees): letting it out undoes this. */
const CURLED = 37;
/** The dots: 0 crown gems, 1..4 the belly bands from the top, 5 the tail lamp. */
const DOTS = 6;

export class Seahorse extends Swimmer {
  static readonly terms =
    'sea horse hippocampus mint teal green aqua cream bands curled tail spiral snout crown fin swim upright bob hover flutter';

  /** The tail let out (1 straight .. 0 as built) and wound tighter (1), the fins' buzz. */
  private out = new FixedSpring(2.4, 0.6);
  private tight = new FixedSpring(2.8, 0.55);
  private buzz = new FixedSpring(3, 0.9);
  private chest = new FixedSpring(3, 0.4);
  private nod = new FixedSpring(3, 0.5);
  private snout = new FixedSpring(4, 0.4);
  private wave = new FixedSpring(5, 0.3);
  private bow = new FixedSpring(2, 0.6);
  private finPhase = 0;
  private tailPhase = 0;
  private spin = 0;
  private flush = -1;
  private tone: string | undefined;

  constructor(model: Object3D) {
    const tail = { f: 3.4, zeta: 0.3 };
    const feels: Record<string, { f: number; zeta: number; r?: number }> = {
      default: { f: 3, zeta: 0.5 },
      root: { f: 1.4, zeta: 0.6 },
      body: { f: 1.5, zeta: 0.45, r: 0.5 },
      neck: { f: 2.6, zeta: 0.5 },
      head: { f: 2.8, zeta: 0.45 },
      snout: { f: 4, zeta: 0.4 },
      crown: { f: 3.5, zeta: 0.3 },
      'fin.L': { f: 6, zeta: 0.4 },
      'fin.R': { f: 6, zeta: 0.4 },
    };
    for (const b of TAIL) feels[b] = tail;
    super(
      {
        name: 'Bobbin',
        model: 'seahorse',
        metres: 0.37,
        width: 0.22,
        size: 1.0,
        feels: feels as never,
        face: SEAHORSE_FACE,
        eyes: 0.8,
        gaze: [
          { bone: 'head', yaw: 0.7, pitch: 0.55 },
          { bone: 'neck', yaw: 0.25, pitch: 0.2 },
        ],
        reach: { yaw: 55, pitch: 28 },
        lag: 1.2,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 1.3,
        turn: 75,
      },
      model,
    );
    this.inset = 0.7;
    this.acts = this.moves();
  }

  private moves(): Record<string, Act> {
    const still = () => !!this.free && !this.route.length && !this.exiting;
    return {
      idle: { weight: 3, length: [3, 7] },
      swim: {
        weight: 2.4,
        length: [3, 6],
        when: still,
        start: () => this.swimTo(this.somewhere()),
      },
      bob: { weight: 1.4, length: [5, 7], face: 'happy', when: still },
      hold: { weight: 1.3, length: [9, 11], face: 'happy', when: still },
      flush: { weight: 1, length: [5, 5.6], when: still },
      flutter: { weight: 0.9, length: [4, 4.6], face: 'focused', when: still },
      stretch: { weight: 0.9, length: [5, 5.6], face: 'sleepy', when: still },
      nod: { weight: 0.9, length: [3.4, 4], face: 'happy', when: still },
      sniff: { weight: 0.9, length: [4.6, 5.2], face: 'focused', when: still },
      pirouette: { weight: 0.8, length: [3.6, 4], face: 'happy', when: still },
      peek: { weight: 0.7, length: [8, 8.6], when: still },
      doze: { weight: 0.7, length: [9, 14], face: 'asleep', when: still },
      wave: { weight: 0.8, length: [3.4, 3.8], face: 'happy', when: still },
      dance: { weight: 0.8, length: [5, 5.6], face: 'happy', when: still },
      hiccup: { weight: 0.7, length: [4, 4.4], when: still },
      proud: { weight: 0.8, length: [4.4, 5], face: 'determined', when: still },
      look: { weight: 1, length: [4, 5], when: still },
      dart: {
        weight: 0.7,
        length: [3, 3.4],
        face: 'surprised',
        when: still,
        start: () => this.kickTo(this.toward),
      },
      bow: { weight: 0.6, length: [3.6, 4], face: 'love', when: () => still() && !!this.mate() },
      poked: { weight: 0, length: [3.6, 4] },
      love: { weight: 0, length: [3, 4], face: 'love' },
      dizzy: { weight: 0, length: [4.6, 4.6] },
    };
  }

  protected depthFor(act: string) {
    if (act === 'peek') return 1;
    if (act === 'swim') return Math.random() * 0.45;
    if (['poked', 'wave', 'bow', 'sniff', 'flush', 'nod', 'proud', 'dance'].includes(act))
      return 0.1;
    return undefined;
  }

  protected startle() {
    this.hold();
    this.kickTo(this.toward);
    this.tight.kick(4);
    this.flush = 0;
    this.tone = BEACON.surprised;
    this.setAct('poked');
  }

  protected station(env: Env, s: Spot): Point {
    const t = this.actT;
    const H = s.H;
    let x = 0;
    let y = 0;
    switch (this.act) {
      case 'bob':
      case 'flutter':
        y = -H * 0.18 * Math.sin(t * 2 * Math.PI * (this.act === 'bob' ? 0.9 : 0.5));
        break;
      case 'hold': {
        // In to the frame line, close enough for the tail to reach it.
        const k =
          ease(t / 1.4) * (t < this.actLength - 1.2 ? 1 : 1 - ease((t - this.actLength + 1.2) / 1));
        x = -s.inward.x * H * 0.32 * k;
        y = -s.inward.y * H * 0.32 * k;
        break;
      }
      case 'stretch':
        y = -H * 0.2 * bump(t - 2.5, 2.5);
        break;
      case 'doze':
        y = H * 0.2 * ease(t / 3);
        break;
      case 'dance':
        x = H * 0.2 * Math.sin(t * 2 * Math.PI * 0.8);
        y = -H * 0.08 * Math.abs(Math.sin(t * 2 * Math.PI * 1.6));
        break;
      case 'dizzy':
        x = Math.cos(env.time * 4) * H * 0.15;
        y = Math.sin(env.time * 4) * H * 0.1;
        break;
      case 'pirouette':
        y = -H * 0.2 * bump(t - 1.8, 1.8);
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
      case 'proud':
        return this.toward * 35 * fade;
      case 'sniff':
      case 'hiccup':
      case 'nod':
      case 'flush':
      case 'peek':
      case 'bob':
        return this.toward * 20 * fade;
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
      case 'hold':
        return 0.2 * Math.sin(t * 2 * Math.PI * 0.35) * ease(t / 2);
      case 'dance':
        return 0.2 * Math.sin(t * 2 * Math.PI * 0.8);
      case 'bow':
        return this.toward * 0.2 * this.bow.y;
      case 'doze':
        return 0.18 * ease(t / 3);
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
    p.add('head', 3 * sin(t, 0.27), 4 * sin(t, 0.13), 0);
    p.add('crown', 5 * sin(t, 0.5), 0, 5 * sin(t, 0.4));
    p.add('snout', 3 * sin(t, 0.3), 0, 0);
  }

  protected pose(dt: number, env: Env) {
    super.pose(dt, env);
    const p = this.puppet;
    const t = this.actT;
    const act = this.act;
    const time = env.time;
    const left = this.actLength - t;
    const calm = !['poked', 'dizzy', 'love', 'dart', 'pirouette'].includes(act);
    this.mind(dt, env, calm);
    const crossed = (at: number) => t >= at && t - dt < at;

    let face: Expression = this.hovered ? 'happy' : 'neutral';
    let out = 0;
    let tight = 0;
    let buzz = Math.max(0.15, this.swimming());
    let chest = 0;
    let nod = 0;
    let snout = 0;
    let wave = 0;
    this.spinning = false;
    this.spin = 0;
    switch (act) {
      case 'poked':
        tight = 1;
        buzz = 1;
        face = t < 0.5 ? 'surprised' : t < 2.6 ? 'cross' : 'sleepy';
        break;
      case 'hold': {
        // The tail winds round the frame line: tight, and a sway of the whole body.
        tight = ease((t - 0.6) / 1.2) * (left > 1.2 ? 1 : 0);
        out = left < 1.2 ? 0 : 0.2 * bump(t - 0.4, 0.6);
        face = t < 1.4 ? 'focused' : left > 1.4 ? 'happy' : 'neutral';
        buzz = 0.2;
        break;
      }
      case 'flush':
        if (crossed(0.3)) this.flush = 0;
        face = t < 1 ? 'surprised' : 'love';
        chest = 0.4 * bump(t - 2.2, 2);
        break;
      case 'flutter':
        buzz = 1;
        out = 0.3;
        face = 'focused';
        break;
      case 'stretch': {
        const k = ease(t / 1.4) * (left > 1.4 ? 1 : ease(left / 1.4));
        out = 1.0 * k;
        nod = -10 * k;
        chest = 0.3 * k;
        face = k > 0.5 ? 'sleepy' : 'neutral';
        break;
      }
      case 'nod': {
        const n = Math.sin(t * 2 * Math.PI * 1.2) * ease(Math.min(t, left));
        nod = 14 * n;
        break;
      }
      case 'sniff': {
        // Snout up at the page, a few sniffs, the crown flashing a little.
        const k = ease(Math.min(t, left));
        nod = -14 * k;
        snout = k * (0.5 + 0.5 * Math.sin(t * 20));
        p.add('head', 0, 6 * Math.sin(t * 1.5) * k, 0);
        break;
      }
      case 'pirouette': {
        const u = ease((t - 0.2) / 2.8);
        this.spin = 2 * Math.PI * u * this.toward;
        this.spinning = true;
        buzz = 1;
        out = 0.4 * bump(t - 1.8, 1.6);
        break;
      }
      case 'peek':
        face = t < 3.2 ? 'neutral' : t < 5.2 ? 'focused' : 'surprised';
        p.add('head', 6 * Math.sin(t * 1.8), 10 * Math.sin(t * 1.3), 0);
        break;
      case 'doze':
        tight = 1;
        nod = 18 * ease(t / 2);
        buzz = 0;
        break;
      case 'wave':
        this.wave.update(dt, t > 0.4 && left > 0.6 ? 1 : 0);
        wave = 1;
        break;
      case 'dance':
        chest = 0.3 * Math.abs(Math.sin(t * 2 * Math.PI * 0.8));
        buzz = 0.8;
        break;
      case 'hiccup': {
        for (const at of [0.7, 1.6, 2.5]) {
          if (crossed(at)) {
            this.tight.kick(5);
            p.kick('head', -30);
            p.kick('body', -12);
            this.tone = BEACON.surprised;
            this.flush = 0;
          }
        }
        face = [0.7, 1.6, 2.5].some((x) => t > x && t < x + 0.25) ? 'surprised' : 'neutral';
        break;
      }
      case 'proud':
        chest = 1 * ease(t / 1) * (left > 1 ? 1 : ease(left));
        nod = -12 * chest;
        out = 0.4 * chest;
        face = 'determined';
        break;
      case 'look':
        face = 'neutral';
        break;
      case 'dart':
        buzz = 1;
        tight = 0.3;
        break;
      case 'bow':
        this.bow.update(dt, t > 0.5 && left > 1 ? 1 : 0);
        nod = 22 * this.bow.y;
        break;
      case 'love':
        face = 'love';
        nod = 6;
        break;
      case 'dizzy':
        face = 'dizzy';
        break;
    }
    if (act !== 'wave') this.wave.update(dt, 0);
    if (act !== 'bow') this.bow.update(dt, 0);
    this.expression = face;
    const o = this.out.update(dt, out);
    const tg = this.tight.update(dt, tight);
    this.buzz.update(dt, buzz);
    const ch = this.chest.update(dt, chest);
    const nd = this.nod.update(dt, nod);
    this.snout.update(dt, snout);
    void wave;

    // Swimming: the tail sways a beat behind each bone, more when it swims; its curl lets out
    // or winds up with the act.
    const sw = Math.max(this.swimming(), act === 'bob' || act === 'dance' ? 0.6 : 0);
    this.tailPhase += dt * 2 * Math.PI * (0.5 + 1.4 * sw);
    TAIL.forEach((b, i) => {
      const k = i / (TAIL.length - 1);
      const sway = Math.sin(this.tailPhase - i * 0.55) * (2.5 + 5 * sw);
      p.add(
        b,
        (CURLED - 3) * o - 18 * tg - 12 * tg * k + sway,
        0,
        3 * Math.sin(this.tailPhase * 0.7 - i * 0.4),
      );
    });
    p.add('neck', nd * 0.5 - 10 * ch, 0, 0);
    p.add('head', nd * 0.6, 0, 0);
    p.add('body', -6 * ch, 0, 0);
    p.add('snout', -12 * this.snout.y, 0, 0);
    // Nose up as it rises, down as it sinks.
    if (this.free) p.add('body', clamp(this.vel.y / (this.heightPx * 2), -1, 1) * 10);
    if (act === 'dizzy' && t > 1.5)
      p.add('body', 8 * Math.cos(time * 5), 0, 8 * Math.sin(time * 5));
  }

  /** Lights: crown gems (0), belly bands (1..4), tail lamp (5). */
  private lights(time: number) {
    const act = this.act;
    const t = this.actT;
    const moving = this.swimming() > 0.25;
    for (let i = 0; i < DOTS; i++) {
      const band = i - 1;
      let level = 0.6 + 0.25 * Math.sin(time * 0.9 - i * 0.8);
      let tone: string | undefined;
      if (act === 'poked' && t < 0.8) {
        level = Math.sin(time * 34) > 0 ? 1 : 0.35;
        tone = BEACON.surprised;
      } else if (act === 'flush') {
        // A colour runs down the belly bands and settles, blushing.
        level = 0.4 + 0.6 * bump(cycle(t * 0.7) * 1.8 - 0.1 - band * 0.28, 0.4);
        tone = t > 3.4 ? BEACON.love : RAINBOW[(Math.floor(t * 2) + i) % RAINBOW.length];
        if (i === 0 || i === 5) level = 0.8 + 0.2 * Math.sin(time * 14);
      } else if (act === 'dizzy') {
        level = Math.sin(time * 7 + i * 2.3) > 0.2 ? 1 : 0.15;
        tone = RAINBOW[(i + Math.floor(time * 3)) % RAINBOW.length];
      } else if (act === 'love' || act === 'bow') {
        level = 0.65 + 0.35 * Math.sin(time * 2.4 - i * 0.6);
        tone = BEACON.love;
      } else if (act === 'dance' || act === 'flutter') {
        level = Math.sin(t * 2 * Math.PI * 1.6 + i) > 0 ? 1 : 0.25;
        tone = RAINBOW[(i + Math.floor(time * 4)) % RAINBOW.length];
      } else if (act === 'proud' || act === 'stretch') {
        level = clamp((t / 1.2) * DOTS - i, 0.3, 1);
        tone = BEACON.happy;
      } else if (act === 'hiccup') {
        level = 0.5 + 0.5 * Math.sin(time * 20 + i * 1.7);
        tone = BEACON.surprised;
      } else if (act === 'doze') {
        level = 0.2 + 0.15 * Math.sin(time * 0.8);
      } else if (act === 'sniff' || act === 'hold') {
        level = 0.5 + 0.5 * bump(cycle(time * 1.1) * 1.6 - band * 0.3, 0.3);
        tone = BEACON.focused;
      } else if (moving) {
        level = 0.45 + 0.55 * bump(cycle(time * 1.5) * 1.4 - (DOTS - i) * 0.2, 0.25);
      } else if (this.hovered) tone = BEACON.happy;
      this.outfit.dot(i, level, tone);
    }
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    const time = env.time;
    this.lights(time);
    if (this.flush >= 0) {
      this.flush += dt;
      if (this.flush > 1.4) this.flush = -1;
    }
    this.outfit.beacon(
      this.flush >= 0 && this.tone
        ? this.tone
        : this.act === 'flush' || this.act === 'dance'
          ? RAINBOW[Math.floor(time * 6) % RAINBOW.length]
          : (BEACON[this.expression] ?? BEACON.neutral!),
    );
    // Fins: a dorsal fin fluttering fast, the pectorals a little slower.
    const buzz = this.buzz.y;
    this.finPhase += dt * 2 * Math.PI * (4 + 14 * buzz);
    ripple(p, ['dorsal.1', 'dorsal.2'], this.finPhase, 10 + 14 * buzz, 0.9, 1);
    for (const [fin, s] of [
      ['fin.L', 1],
      ['fin.R', -1],
    ] as const) {
      const a = Math.sin(this.finPhase * 0.8 + (s > 0 ? 0 : 1.2));
      p.turn(fin, 0, s * (6 + 14 * buzz) * a, s * (4 + 10 * buzz) * a);
      if (s > 0) p.turn(fin, 0, 0, 55 * this.wave.y + 30 * this.wave.y * Math.sin(time * 14));
    }
    // The chest puffs out; the crown tips with the head.
    const ch = this.chest.y;
    p.stretch('body', 1 + 0.08 * ch, [0, 1, 0], 1 + 0.12 * ch);
    // Spinning, about the vertical.
    if (this.act === 'dizzy') {
      const u = clamp((this.actT - 0.2) / 2.4, 0, 1);
      this.pivot.rotation.y = 4 * Math.PI * u * u * (3 - 2 * u);
    } else this.pivot.rotation.y = this.spin;
  }
}
