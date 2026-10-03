import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { Expression, FaceLayout } from './face';
import { sin } from './moves';
import { bump, cycle, ease, FixedSpring, type Point, type Spot, Swimmer } from './swimmer';

/**
 * Pebble, the robot sea otter. It floats on its back in the band just inside the frame (the
 * swimmer kit), seen from the side: a long plump body of three chunky pods with a cream
 * belly plate, two lamps on the plate, a round head at one end with a screen face turned
 * toward us, two arms of two bones folded over its chest, two hind feet and a flat tail at the
 * other. It never turns about (an otter on its back goes head first or feet first, as it
 * likes); it paddles with its feet and sculls with its tail.
 *
 * Three things wait on bones of their own and come out for a trick: a stone (carried by the
 * near paw), a clam on the belly with a hinged lid, and a strand of kelp of eight ribbon
 * bones. Tricks: cracking the clam on its tummy with the stone (three knocks, the lid
 * pops, the pearl lights), rolling over and over, wrapping itself in the kelp to nap, waving a paw,
 * paddling with both arms, grooming its face, a stretch with the arms up, patting its belly
 * lamps, a feet-up dance, looking round, nodding, peeking from the back wall, hiccups, and
 * a toss of the stone from paw to paw. Poke it and it rolls away over and over, the lamps
 * flashing; three pokes and it spins dizzy; rest the mouse on it and it hugs its stone and
 * sways.
 */
export const OTTER_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.3, 0.46],
    [0.7, 0.46],
  ],
  rx: 0.09,
  ry: 0.25,
  line: 0.034,
  mouth: null,
};

const KELP = Array.from({ length: 8 }, (_, i) => `kelp.${i + 1}`);
const SIDES = [
  ['N', 1],
  ['F', -1],
] as const;
/** The dots in use: 0 and 1 belly lamps, 3 the pearl, 4 the stone's gem. */
const DOTS = [0, 1, 3, 4];

export class Otter extends Swimmer {
  private raise = new FixedSpring(3, 0.45);
  private wrap = new FixedSpring(1.6, 0.8);
  private stone = new FixedSpring(5, 0.8);
  private clam = new FixedSpring(5, 0.8);
  private lid = new FixedSpring(7, 0.35);
  private paddle = new FixedSpring(3, 0.6);
  private groom = new FixedSpring(4, 0.5);
  private nod = new FixedSpring(3, 0.5);
  private phase = 0;
  private roll = 0;
  private knocks = 0;
  private flash = -1;
  private tone: string | undefined;
  private pearl = 0;

  constructor(model: Object3D) {
    const feels: Record<string, { f: number; zeta: number; r?: number }> = {
      default: { f: 3, zeta: 0.5 },
      root: { f: 1.4, zeta: 0.6 },
      body: { f: 1.8, zeta: 0.45, r: 0.5 },
      head: { f: 3, zeta: 0.4 },
      face: { f: 4, zeta: 0.5 },
      'arm.N.1': { f: 5, zeta: 0.45 },
      'arm.N.2': { f: 5.5, zeta: 0.4 },
      'arm.F.1': { f: 5, zeta: 0.45 },
      'arm.F.2': { f: 5.5, zeta: 0.4 },
      'foot.N': { f: 5, zeta: 0.4 },
      'foot.F': { f: 5, zeta: 0.4 },
      'tail.1': { f: 3.2, zeta: 0.35 },
      'tail.2': { f: 3.6, zeta: 0.3 },
      'shell.lid': { f: 9, zeta: 0.35 },
    };
    for (const b of KELP) feels[b] = { f: 4, zeta: 0.5 };
    super(
      {
        name: 'Pebble',
        model: 'otter',
        metres: 0.22,
        width: 0.64,
        size: 0.62,
        feels: feels as never,
        face: OTTER_FACE,
        eyes: 0.6,
        gaze: [{ bone: 'head', yaw: 0.8, pitch: 0.6 }],
        reach: { yaw: 45, pitch: 25 },
        lag: 1.2,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 1.1,
        turn: 0,
      },
      model,
    );
    this.inset = 0.74;
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
      crack: { weight: 1.6, length: [8, 8.6], face: 'determined', when: still },
      roll: { weight: 1.3, length: [4.4, 4.8], face: 'happy', when: still },
      kelp: { weight: 1.2, length: [12, 15], face: 'happy', when: still },
      wave: { weight: 0.9, length: [3.4, 3.8], face: 'happy', when: still },
      paddle: { weight: 1, length: [4, 5], face: 'focused', when: still },
      groom: { weight: 1, length: [4.4, 5], face: 'happy', when: still },
      stretch: { weight: 0.9, length: [4.6, 5.2], face: 'sleepy', when: still },
      lamps: { weight: 0.8, length: [4, 4.6], face: 'happy', when: still },
      dance: { weight: 0.8, length: [5, 5.6], face: 'happy', when: still },
      toss: { weight: 0.9, length: [5, 5.6], face: 'focused', when: still },
      look: { weight: 1, length: [4, 5], when: still },
      nod: { weight: 0.8, length: [3.4, 4], face: 'happy', when: still },
      peek: { weight: 0.7, length: [8, 8.6], when: still },
      hiccup: { weight: 0.7, length: [4, 4.4], when: still },
      poked: { weight: 0, length: [3.6, 4], face: 'surprised' },
      love: { weight: 0, length: [3.4, 4.4], face: 'love' },
      dizzy: { weight: 0, length: [4.6, 4.6] },
    };
  }

  protected depthFor(act: string) {
    if (act === 'peek') return 1;
    if (act === 'swim') return Math.random() * 0.45;
    if (['poked', 'crack', 'wave', 'lamps', 'kelp', 'groom', 'toss', 'nod'].includes(act))
      return 0.1;
    return undefined;
  }

  protected startle() {
    this.hold();
    this.kickTo(this.toward);
    this.flash = 0;
    this.tone = BEACON.surprised;
    this.setAct('poked');
  }

  protected station(env: Env, s: Spot): Point {
    const t = this.actT;
    const H = s.H;
    let x = 0;
    let y = 0;
    switch (this.act) {
      case 'roll':
        x = this.toward * H * 0.5 * Math.sin((Math.PI * t) / 4.4);
        y = -H * 0.1 * bump(t - 2.2, 2.2);
        break;
      case 'kelp':
        y =
          H *
          0.12 *
          ease(t / 3) *
          (this.actLength - t > 2 ? 1 : 1 - ease((2 - this.actLength + t) / 2));
        break;
      case 'dance':
        x = H * 0.4 * Math.sin(t * 2 * Math.PI * 0.6);
        y = -H * 0.05 * Math.abs(Math.sin(t * 2 * Math.PI * 1.2));
        break;
      case 'dizzy':
        x = Math.cos(env.time * 4) * H * 0.3;
        y = Math.sin(env.time * 4) * H * 0.15;
        break;
      case 'crack':
        y = H * 0.06 * Math.sin(t * 1.3);
        break;
    }
    return { x, y };
  }

  protected fast() {
    return this.act === 'poked' ? 5 : 1.5;
  }

  /** It never turns about: on its back, head first or feet first. */
  protected turnFor(_fade: number) {
    return 0;
  }

  protected leanGain() {
    return 0.06;
  }

  protected leanFor() {
    const t = this.actT;
    switch (this.act) {
      case 'dance':
        return 0.12 * Math.sin(t * 2 * Math.PI * 0.6);
      case 'love':
        return 0.1 * Math.sin(t * 2.2);
      default:
        return 0;
    }
  }

  protected idle(t: number) {
    const p = this.puppet;
    p.shift('root', 0, 0.012 * sin(t, 0.35), 0);
    p.add('body', 0, 0, 2.5 * sin(t, 0.21));
    p.add('head', 0, 4 * sin(t, 0.13), 3 * sin(t, 0.27));
    p.add('tail.1', 0, 0, 6 * sin(t, 0.4));
    p.add('tail.2', 0, 0, 8 * sin(t, 0.4, 0.15));
    for (const [n, s] of SIDES) {
      p.add(`foot.${n}`, 0, 0, 5 * sin(t, 0.3, s * 0.2));
      p.add(`arm.${n}.2`, 0, 0, 3 * sin(t, 0.35, s * 0.15));
    }
  }

  protected pose(dt: number, env: Env) {
    super.pose(dt, env);
    const p = this.puppet;
    const t = this.actT;
    const act = this.act;
    const time = env.time;
    const left = this.actLength - t;
    const calm = !['poked', 'dizzy', 'love', 'roll'].includes(act);
    this.mind(dt, env, calm);
    const crossed = (at: number) => t >= at && t - dt < at;

    let face: Expression = this.hovered ? 'happy' : 'neutral';
    // The arms (near, far): how far each is raised, and how bent.
    const arm = { N: [0, 0], F: [0, 0] } as Record<'N' | 'F', [number, number]>;
    let wrap = 0;
    let stone = 0;
    let clam = 0;
    let paddle = 0;
    let groom = 0;
    let nod = 0;
    this.spinning = false;
    this.roll = 0;

    switch (act) {
      case 'poked': {
        const u = ease(t / 1.4);
        this.roll = 2 * Math.PI * u * this.toward;
        this.spinning = true;
        paddle = 1;
        face = t < 0.5 ? 'surprised' : t < 2.4 ? 'cross' : 'sleepy';
        break;
      }
      case 'crack': {
        // The clam comes up on the belly; the stone is lifted overhead and brought down
        // three times; the third cracks the lid, the pearl lights, and a little cheer.
        const k = ease(Math.min(t / 0.8, left / 0.8));
        clam = k;
        stone = ease((t - 0.5) / 0.5) * (left > 1 ? 1 : ease(left));
        const hit = (u: number) => Math.max(0, Math.sin(Math.PI * clamp(u, 0, 1)));
        let up = 0;
        if (t > 1.4 && t < 4.4)
          up = 1 - 0.9 * hit(((t - 1.4) % 1) * 1.15 - 0.15) * (t < 4.4 ? 1 : 0);
        else if (t >= 4.4) up = 0.35 * ease(1 - (t - 4.4) / 1);
        else up = ease((t - 0.7) / 0.7);
        arm.N = [up, 0.7 * up];
        arm.F = [0.6 * up, 0.5 * up];
        for (const at of [2.3, 3.3, 4.3]) {
          if (crossed(at)) {
            p.kick('body', 8);
            this.flash = 0;
            this.tone = BEACON.focused;
            this.knocks++;
          }
        }
        if (crossed(4.3)) this.pearl = 1;
        if (crossed(0.3)) this.knocks = 0;
        face = t < 1.4 ? 'focused' : t < 4.3 ? 'determined' : 'happy';
        if (t > 4.5) arm.F = [0.9, 0.2];
        break;
      }
      case 'roll': {
        const u = ease((t - 0.3) / 3.8);
        this.roll = 4 * Math.PI * u * this.toward;
        this.spinning = true;
        paddle = 0.8;
        break;
      }
      case 'kelp': {
        // Wraps itself in the strand, folds its paws and dozes; unwraps at the end.
        wrap = ease((t - 0.3) / 2.6) * (left > 3 ? 1 : ease((left - 0.2) / 2.6));
        arm.N = [0.15 * wrap, 0];
        arm.F = [0.15 * wrap, 0];
        face = wrap < 0.5 ? 'happy' : t < 6 ? 'sleepy' : left > 3 ? 'asleep' : 'neutral';
        break;
      }
      case 'wave':
        arm.N = [t > 0.4 && left > 0.6 ? 1 : 0.2, 0.4 + 0.5 * Math.sin(t * 8)];
        break;
      case 'paddle':
        paddle = 1;
        arm.N = [0.3 + 0.3 * Math.sin(this.phase * 1.2), 0.3];
        arm.F = [0.3 + 0.3 * Math.sin(this.phase * 1.2 + Math.PI), 0.3];
        break;
      case 'groom':
        groom = ease(Math.min(t / 0.6, left / 0.6));
        arm.N = [0.9 * groom, 0.6 * groom + 0.2 * Math.sin(t * 9) * groom];
        arm.F = [0.9 * groom, 0.6 * groom + 0.2 * Math.sin(t * 9 + 1.5) * groom];
        face = 'happy';
        nod = -4 * groom;
        break;
      case 'stretch': {
        const k = ease(Math.min(t / 1.2, left / 1.2));
        arm.N = [1.3 * k, 0.1];
        arm.F = [1.3 * k, 0.1];
        nod = -10 * k;
        face = k > 0.5 ? 'sleepy' : 'neutral';
        break;
      }
      case 'lamps': {
        // Pats its belly, the lamps lighting in turn.
        const pat = Math.sin(t * 7) > 0 ? 1 : 0;
        arm.N = [0.2, 0.4 + 0.6 * pat];
        arm.F = [0.2, 0.4 + 0.6 * (1 - pat)];
        break;
      }
      case 'dance':
        paddle = 1;
        arm.N = [0.6 + 0.4 * Math.sin(t * 2 * Math.PI * 1.2), 0.3];
        arm.F = [0.6 - 0.4 * Math.sin(t * 2 * Math.PI * 1.2), 0.3];
        break;
      case 'toss': {
        // The stone goes up from the one paw, over and into the other, a few times.
        stone = ease(Math.min(t / 0.5, left / 0.5));
        const c = (t * 1.1) % 1;
        const hand = Math.floor(t * 1.1) % 2 === 0;
        const high = Math.sin(Math.PI * c);
        arm.N = [hand ? 0.5 + 0.5 * high : 0.4, 0.3];
        arm.F = [hand ? 0.4 : 0.5 + 0.5 * high, 0.3];
        break;
      }
      case 'look':
        p.add('head', 0, 38 * Math.sin(t * 1.4), 5 * Math.sin(t * 1.4));
        break;
      case 'nod':
        nod = 14 * Math.sin(t * 2 * Math.PI * 1.2) * ease(Math.min(t, left));
        break;
      case 'peek':
        face = t < 3.2 ? 'neutral' : t < 5.2 ? 'focused' : 'surprised';
        p.add('head', 0, 22 * Math.sin(t * 1.5), 8 * Math.sin(t * 1.1));
        break;
      case 'hiccup':
        for (const at of [0.7, 1.6, 2.5]) {
          if (crossed(at)) {
            p.kick('body', -22);
            p.kick('head', -30);
            this.flash = 0;
            this.tone = BEACON.surprised;
            for (const [n] of SIDES) p.kick(`arm.${n}.1`, 40);
          }
        }
        face = [0.7, 1.6, 2.5].some((x) => t > x && t < x + 0.25) ? 'surprised' : 'neutral';
        break;
      case 'love':
        stone = ease(Math.min(t / 0.6, left / 0.6));
        arm.N = [0.3 * stone, 0.9 * stone];
        arm.F = [0.3 * stone, 0.9 * stone];
        face = 'love';
        break;
      case 'dizzy': {
        const u = clamp((t - 0.2) / 2.4, 0, 1);
        this.roll = 3 * Math.PI * u * u * (3 - 2 * u);
        this.spinning = true;
        face = 'dizzy';
        break;
      }
    }
    this.expression = face;
    const sw = Math.max(this.swimming(), paddle, act === 'swim' ? 0.4 : 0);
    this.phase += dt * 2 * Math.PI * (0.45 + 1.6 * sw);
    const up = this.raise.update(dt, 1);
    void up;
    const w = this.wrap.update(dt, wrap);
    const st = this.stone.update(dt, stone);
    const cl = this.clam.update(dt, clam);
    this.paddle.update(dt, paddle);
    const gr = this.groom.update(dt, groom);
    const nd = this.nod.update(dt, nod);

    // Arms: raised in the plane we see (the roll about the way we look), the forearm after.
    for (const [n, s] of SIDES) {
      const [a, b] = arm[n];
      const rest = 0.2 * Math.sin(this.phase * 0.5 + s);
      p.add(`arm.${n}.1`, 0, 0, -(a * 55 + rest * 4 * (1 - a)));
      p.add(`arm.${n}.2`, 0, 0, -(b * 40 + a * 20));
    }
    // Feet kick on the beat; the tail sculls a beat behind.
    for (const [n, s] of SIDES)
      p.add(`foot.${n}`, 0, 0, (6 + 22 * sw) * Math.sin(this.phase + (s > 0 ? 0 : Math.PI)));
    p.add('tail.1', 0, 0, (5 + 12 * sw) * Math.sin(this.phase - 0.8));
    p.add('tail.2', 0, 0, (7 + 16 * sw) * Math.sin(this.phase - 1.6));
    p.add('head', 0, 0, nd * 0.8 - 6 * gr);
    p.add('body', 0, 0, nd * 0.4);
    if (this.free) p.add('body', 0, 0, -clamp(this.vel.y / (this.heightPx * 2), -1, 1) * 6);

    // The things that wait: scaled away, or out.
    const away = (b: string, k: number) =>
      p.stretch(b, Math.max(0.001, k), [0, 1, 0], Math.max(0.001, k));
    away('stone', st);
    away('shell', cl);
    away('kelp.1', w > 0.01 ? 1 : 0.001);
    // The lid pops with each knock and stays open once it cracks.
    const open =
      this.knocks >= 3 ? 1 : this.knocks > 0 ? 0.12 * Math.sin(t * 40) * Math.exp(-(t % 1) * 4) : 0;
    const lid = this.lid.update(dt, cl > 0.5 ? open : 0);
    p.turn('shell.lid', 55 * lid, 0, 0);
    // The kelp: each bone turns a further 45 degrees toward us and under, round the body.
    KELP.forEach((b, i) => {
      const on = clamp(w * (KELP.length + 1) - i * 0.9, 0, 1);
      p.add(b, (i < 6 ? 40 : 20) * on + 4 * Math.sin(time * 1.6 - i * 0.7) * (1 - w), 1.5 * on, 0);
    });
    if (this.pearl > 0 && act !== 'crack') this.pearl = 0;
  }

  /** Lights: the belly lamps (0, 1), the pearl (3), the stone's gem (4). */
  private lights(time: number) {
    const act = this.act;
    const t = this.actT;
    const moving = this.swimming() > 0.25;
    DOTS.forEach((d, j) => {
      let level = 0.55 + 0.25 * Math.sin(time * 0.9 - j * 0.8);
      let tone: string | undefined;
      if (act === 'poked' && t < 0.8) {
        level = Math.sin(time * 34) > 0 ? 1 : 0.35;
        tone = BEACON.surprised;
      } else if (act === 'dizzy') {
        level = Math.sin(time * 7 + j * 2.3) > 0.2 ? 1 : 0.15;
        tone = RAINBOW[(j + Math.floor(time * 3)) % RAINBOW.length];
      } else if (act === 'love') {
        level = 0.65 + 0.35 * Math.sin(time * 2.4 - j * 0.6);
        tone = BEACON.love;
      } else if (act === 'crack') {
        const hit = this.flash >= 0 && this.flash < 0.35;
        level = hit ? 1 : 0.4;
        if (d === 3) level = this.pearl > 0 ? 0.6 + 0.4 * Math.sin(time * 9) : 0.1;
        tone = d === 3 ? BEACON.love : BEACON.focused;
      } else if (act === 'lamps') {
        level = Math.sin(time * 7 + j * Math.PI) > 0 ? 1 : 0.15;
        tone = BEACON.happy;
      } else if (act === 'dance' || act === 'roll') {
        level = Math.sin(time * 9 + j * 1.6) > 0 ? 1 : 0.25;
        tone = RAINBOW[(j + Math.floor(time * 4)) % RAINBOW.length];
      } else if (act === 'kelp') {
        level = 0.25 + 0.2 * Math.sin(time * 0.8 + j) * (t > 3 ? 1 : 2);
      } else if (act === 'hiccup') {
        level = 0.5 + 0.5 * Math.sin(time * 20 + j * 1.7);
        tone = BEACON.surprised;
      } else if (moving) {
        level = 0.45 + 0.55 * bump(cycle(time * 1.4) * 1.4 - j * 0.3, 0.25);
      } else if (this.hovered) tone = BEACON.happy;
      this.outfit.dot(d, level, tone);
    });
  }

  protected after(dt: number, env: Env) {
    const time = env.time;
    this.lights(time);
    if (this.flash >= 0) {
      this.flash += dt;
      if (this.flash > 1.4) this.flash = -1;
    }
    this.outfit.beacon(
      this.flash >= 0 && this.tone
        ? this.tone
        : this.act === 'dance' || this.act === 'roll'
          ? RAINBOW[Math.floor(time * 6) % RAINBOW.length]
          : (BEACON[this.expression] ?? BEACON.neutral!),
    );
    // Rolling over, about the way it lies (head to feet).
    this.pivot.rotation.x = this.roll;
  }
}
