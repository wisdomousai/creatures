import type { Object3D } from 'three';
import { Bolt } from './bolt';
import { type Act, type Character, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import type { Turn } from './puppet';
import { wobble } from './spring';
import { smooth, Toybot } from './toybot';

/**
 * Dimple, a toddler robot: a huge round head with a big screen face on a tiny wobbly body,
 * stubby legs in booties, a puffy nappy, short arms held up for balance, a topknot with a
 * lit bulb and a pacifier on a clip whose teat glows.
 *
 * Everything about her is a bit too much for her legs: she toddles in short steps with the
 * big head rolling the other way to the body; stands wobbling; and now and then the wobble
 * wins and she sits down hard on her bottom. Tears are two lit drops that slide down her
 * cheeks when she cries (which she does for a while, rubbing her eyes) and then, all at
 * once, giggles. She claps, plays peekaboo behind her hands, holds up her arms to be
 * picked up, spins till she is dizzy and sits down, dozes off and wakes with a start.
 *
 * She copies. With Bolt on the floor she goes to stand by him and does what he does a
 * beat late: his arms, head and body, recorded and played back 0.7 s later, so a wave
 * comes back as a wave and a hop as a hop; with Bolt away she copies whoever is nearest
 * (their head and body, and arms if they have them).
 */
export const TOT_FACE: FaceLayout = {
  width: 512,
  height: 384,
  eyes: [
    [0.29, 0.45],
    [0.71, 0.45],
  ],
  rx: 0.125,
  ry: 0.3,
  line: 0.04,
  mouth: [0.5, 0.82],
};

const DELAY = 0.7;
const COPIED = ['upper_arm.L', 'upper_arm.R', 'forearm.L', 'forearm.R', 'head', 'body'];
const BLUE = '#5ec8ff';
const PINK = '#ff9ccf';

interface Sample {
  t: number;
  hop: number;
  turns: [string, Turn][];
}

export class Tot extends Toybot {
  private fx = { hop: 0, spin: 0, sit: 0, tears: 0, giggle: 0, still: false };
  private sit = 0;
  private tearAt = 0;
  private trail: Sample[] = [];
  private model_: Character | null = null;
  private side = 1;

  constructor(model: Object3D) {
    super(
      {
        name: 'Dimple',
        model: 'tot',
        metres: 0.62,
        width: 0.4,
        size: 0.82,
        feels: {
          default: { f: 2.4, zeta: 0.5 },
          root: { f: 2.2, zeta: 0.6 },
          body: { f: 1.7, zeta: 0.3 },
          head: { f: 1.5, zeta: 0.3, r: 0.4 },
          knot: { f: 2.8, zeta: 0.15 },
          'upper_arm.L': { f: 2.8, zeta: 0.4 },
          'upper_arm.R': { f: 2.8, zeta: 0.4 },
          'forearm.L': { f: 3.2, zeta: 0.4 },
          'forearm.R': { f: 3.2, zeta: 0.4 },
          'leg.L': { f: 3, zeta: 0.45 },
          'leg.R': { f: 3, zeta: 0.45 },
        },
        face: TOT_FACE,
        eyes: 0.57,
        gaze: [
          { bone: 'head', yaw: 0.7, pitch: 0.8 },
          { bone: 'body', yaw: 0.2, pitch: 0.1 },
        ],
        reach: { yaw: 55, pitch: 30 },
        lag: 1.1,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [60, 130],
        speed: 0.7,
        turn: 70,
      },
      model,
    );
    this.acts = this.moves();
  }

  // ---------- Copying ----------

  /** Whom she copies: Bolt if he is about, else whoever is nearest and on their feet. */
  private mimicry(): Character | null {
    const env = this.env;
    const f = env?.frame;
    if (!env || !f) return null;
    let best: Character | null = null;
    let bestD = Infinity;
    for (const o of env.crew) {
      if (o === this || o.state !== 'here' || o.edge !== this.edge || o.perched) continue;
      if (o instanceof Bolt) return o;
      const d = this.spaceTo(o, f).n;
      if (d < bestD && d < 7) [best, bestD] = [o, d];
    }
    return best;
  }

  /** Note what they're doing now; and what they were doing DELAY seconds ago. */
  private record(o: Character) {
    const turns: [string, Turn][] = [];
    for (const b of COPIED) if (o.puppet.has(b)) turns.push([b, o.puppet.current(b)]);
    this.trail.push({ t: this.t, hop: o.h / Math.max(o.px, 1e-6), turns });
    while (this.trail.length > 2 && this.trail[1].t < this.t - DELAY) this.trail.shift();
    return this.trail[0].t <= this.t - DELAY * 0.8 ? this.trail[0] : null;
  }

  // ---------- Acts ----------

  private tearsOn(k: number) {
    this.fx.tears = k;
  }

  private moves(): Record<string, Act> {
    const p = this.puppet;
    const ok = () => this.free_;
    const sitting = (k: number) => {
      this.fx.sit = k;
      this.fx.still = k > 0.3;
    };
    return {
      idle: { weight: 3, length: [3, 6] },
      toddle: {
        weight: 3,
        length: [2.5, 4.5],
        when: ok,
        start: () =>
          this.stroll(Math.random() < 0.5 ? -1 : 1, this.heightPx * (1.5 + Math.random() * 2.2)),
      },
      // The wobble builds, wins, and down she goes.
      wobbleFall: {
        weight: 1.6,
        length: [7.5, 7.5],
        when: ok,
        pose: (t) => {
          const grow = smooth(t / 2.4);
          const w = 2 * Math.PI * (1.3 + grow * 0.7) * t;
          if (t < 2.5) {
            p.add('body', 0, 0, 14 * grow * Math.sin(w));
            p.add('head', 0, 0, -22 * grow * Math.sin(w - 0.6));
            this.arms(40 + 60 * grow * Math.abs(Math.sin(w)), 20 + 30 * grow, 20);
            p.add('leg.L', 8 * grow * Math.sin(w + 1));
            p.add('leg.R', -8 * grow * Math.sin(w + 1));
            this.expression = 'surprised';
          }
          if (t > 2.4 && t < 2.5) p.kick('body', -90, 0, 0);
          // Plop.
          const down = smooth((t - 2.5) / 0.25) * smooth((6.2 - t) / 0.7);
          sitting(down);
          if (t > 2.7 && t < 5.8) {
            this.expression = t > 3.6 ? 'sheepish' : 'surprised';
            this.arms(60, 30, 40);
            p.add('head', 0, 20 * sin(t, 0.4));
          }
          if (t > 6.2) this.arms(120 * sin(t - 6.2, 2), 30);
          this.fx.hop = this.arc(t, 6.1, 0.4, 0.04);
        },
      },
      // Tears, rubbed eyes, a sniff, and then a giggle.
      cry: {
        weight: 1.2,
        length: [9, 9],
        when: ok,
        pose: (t) => {
          const crying = t > 0.4 && t < 5.4;
          const k = smooth((t - 0.4) / 0.5) * smooth((5.6 - t) / 0.4);
          sitting(smooth(t / 0.5) * smooth((8.4 - t) / 0.6) * 0.8);
          if (t < 5.6) {
            this.expression = 'sad';
            this.tearsOn(k);
            // Sobbing: the whole body hitches.
            const sob = Math.max(0, Math.sin(t * 9)) * k;
            p.add('body', 6 * sob, 0, 2 * Math.sin(t * 4.5) * k);
            p.add('head', 5 * sob - 8 * k, 0, 4 * Math.sin(t * 3) * k);
            // Both fists to the eyes, rubbing.
            const rub = Math.sin(t * 6);
            this.arm(1, 95 * k, -10 * k + 6 * rub * k, 100 * k);
            this.arm(-1, 95 * k, -10 * k - 6 * rub * k, 100 * k);
          } else {
            // A sniff, then she cheers up all at once.
            this.tearsOn(0);
            const g = t - 5.6;
            this.expression = g < 0.7 ? 'sheepish' : 'happy';
            this.fx.giggle = g > 0.7 ? 1 : 0;
            if (g > 0.7) {
              this.arms(60 + 40 * Math.abs(sin(g, 3)), 30, 30);
              p.add('body', 0, 0, 6 * sin(g, 3));
              this.fx.hop = 0.012 * Math.abs(sin(g, 3));
            }
          }
        },
      },
      clap: {
        weight: 1.6,
        length: [4, 5],
        face: 'happy',
        when: ok,
        pose: (t) => {
          const k = smooth(t / 0.3) * smooth((this.actLength - t) / 0.3);
          const c = 0.5 + 0.5 * Math.sin(t * 2 * Math.PI * 3);
          this.arm(1, 60 * k, (30 - 40 * c) * k, 70 * k);
          this.arm(-1, 60 * k, (30 - 40 * c) * k, 70 * k);
          p.add('body', 0, 0, 3 * Math.sin(t * 2 * Math.PI * 1.5));
          p.add('head', -4 * c * k, 0, 4 * Math.sin(t * 2 * Math.PI * 1.5));
          this.fx.hop = 0.012 * c * k;
          this.fx.giggle = 0.5;
        },
      },
      giggle: {
        weight: 1.2,
        length: [3, 3.5],
        face: 'happy',
        when: ok,
        pose: (t) => {
          const k = smooth(t / 0.3) * smooth((this.actLength - t) / 0.3);
          const b = Math.abs(sin(t, 3.2));
          this.fx.giggle = 1;
          this.fx.hop = 0.014 * b * k;
          this.arms(70 + 30 * b, 40, 30);
          p.add('body', -3 * b * k, 0, 6 * sin(t, 1.6) * k);
          p.add('head', 0, 0, 8 * sin(t, 1.6 + 0.2) * k);
        },
      },
      peekaboo: {
        weight: 1.2,
        length: [5, 5],
        when: ok,
        pose: (t) => {
          // Hands over the screen; then they fly apart: "boo!"
          const hide = smooth((t - 0.2) / 0.4) * (t < 2.6 ? 1 : 0);
          this.arm(1, 100 * hide, -14 * hide, 100 * hide);
          this.arm(-1, 100 * hide, -14 * hide, 100 * hide);
          this.expression = t < 2.6 ? 'asleep' : 'surprised';
          if (t >= 2.6 && t < 4.4) {
            this.arms(80, 60, 20);
            this.fx.giggle = 1;
            this.fx.hop = this.arc(t, 2.6, 0.45, 0.07);
            if (t < 2.7) p.kick('head', -40, 0, 0);
          }
        },
      },
      uppy: {
        weight: 1,
        length: [4, 4.5],
        when: ok,
        pose: (t) => {
          // Arms straight up, "carry me!", with a little hop of impatience.
          const k = smooth(t / 0.4) * smooth((this.actLength - t) / 0.4);
          this.arms(165 * k, 10 * k, 0);
          this.expression = t < 2.2 ? 'sad' : 'happy';
          p.add('head', -14 * k, 0, 3 * sin(t, 1.3));
          this.fx.hop = 0.01 * Math.max(0, Math.sin(t * 8)) * k;
        },
      },
      spin: {
        weight: 0.9,
        length: [5.4, 5.4],
        when: ok,
        pose: (t) => {
          // Round and round with her arms out, and then the world spins and she sits.
          const u = smooth(t / 2.6);
          this.fx.spin = Math.PI * 6 * u;
          if (t < 2.6) {
            this.arms(20, 90, 0);
            this.expression = 'happy';
            p.add('body', 0, 0, -8 * u);
          } else {
            this.expression = 'dizzy';
            const a = (t - 2.6) * 7;
            p.add('body', 5 * Math.cos(a), 0, 9 * Math.sin(a));
            p.add('head', 0, 0, -12 * Math.sin(a + 1));
            this.arms(30, 40, 10);
            sitting(smooth((t - 3.2) / 0.3) * smooth((5.1 - t) / 0.4));
          }
        },
      },
      lookUp: {
        weight: 1,
        length: [4, 4],
        face: 'surprised',
        when: ok,
        pose: (t) => {
          const k = smooth(t / 0.5) * smooth((this.actLength - t) / 0.5);
          p.add('head', -34 * k, 14 * sin(t, 0.35) * k);
          p.add('body', -5 * k);
          this.arms(30 * k, 55, 20);
        },
      },
      nap: {
        weight: 0.7,
        length: [9, 10],
        when: ok,
        pose: (t) => {
          const k = smooth(t / 0.9) * smooth((this.actLength - 1.2 - t) / 0.6);
          sitting(k * 0.9);
          this.expression = t < this.actLength - 1 ? (t < 1.4 ? 'sleepy' : 'asleep') : 'surprised';
          // Head droops and jerks back up, droops again.
          const nod = Math.max(0, Math.sin(t * 1.1));
          p.add('head', 28 * k * nod, 0, 3 * k);
          this.arms(30, 40, 30);
          if (t > this.actLength - 1.1) {
            this.arm(1, 100, 10, 90);
            this.arm(-1, 100, 10, 90);
          }
        },
      },
      // Does what Bolt does, a beat late (or the nearest crewmate).
      follow: {
        weight: 2.6,
        length: [14, 20],
        face: 'happy',
        when: () => this.state === 'here' && this.mimicry() !== null,
        start: () => {
          this.trail = [];
          this.model_ = this.mimicry();
          this.side = this.model_ && this.model_.s > this.s ? -1 : 1;
        },
        pose: (t) => {
          const o = this.model_;
          const f = this.env?.frame;
          if (!o || o.state !== 'here' || !f) return void this.setAct('idle');
          this.spec.steers = true;
          // Stands by him, on this side, and comes along if he goes.
          const room = this.spaceTo(o, f);
          const goal = o.s + this.side * room.rx * 1.05;
          const d = o.free ? o.depth : o.depth;
          if (
            Math.abs(goal - this.s) > this.footprint(f).x * 0.4 ||
            Math.abs(d - this.depth) > 0.04
          )
            this.walkTo(goal, d);
          // What he did a beat ago, as best she can.
          const sample = this.record(o);
          if (!sample) {
            this.arms(8, 30, 20);
            return;
          }
          for (const [bone, turn] of sample.turns) {
            if (!p.has(bone)) continue;
            const arm = bone.includes('arm');
            p.add(bone, turn[0] * (arm ? 1 : 0.9), turn[1], turn[2]);
          }
          if (!sample.turns.some(([b]) => b.includes('arm'))) this.arms(8, 30, 20);
          this.fx.hop = Math.max(0, sample.hop);
          if (o.act !== 'idle') this.fx.giggle = 0.4;
          if (t > this.actLength - 0.2) this.model_ = null;
        },
      },
      // Reactions (never picked at random).
      poked: {
        weight: 0,
        length: [2, 2],
        face: 'surprised',
        pose: (t) => {
          this.fx.hop = this.arc(t, 0, 0.45, 0.1);
          this.arms(120, 30, 20);
          p.add('body', 0, 0, 14 * Math.sin(t * 10) * Math.max(0, 1 - t));
          p.add('head', 0, 0, -18 * Math.sin(t * 10 - 0.6) * Math.max(0, 1 - t));
          if (t > 1.2) this.expression = 'happy';
        },
      },
      dizzy: {
        weight: 0,
        length: [3.6, 3.6],
        face: 'dizzy',
        pose: (t) => {
          const a = 2 * Math.PI * 1.1 * t;
          p.add('body', 8 * Math.cos(a), 0, 10 * Math.sin(a));
          p.add('head', -8 * Math.sin(a), 0, 12 * Math.cos(a));
          this.arms(60 + 30 * Math.sin(a * 1.3), 40, 20);
          this.fx.spin = 2 * Math.PI * smooth(t / 2.6);
          sitting(smooth((t - 2.8) / 0.3));
        },
      },
    };
  }

  protected onDirect() {
    this.model_ = null;
  }

  // ---------- Each frame ----------

  protected idle(t: number) {
    const p = this.puppet;
    Object.assign(this.fx, { hop: 0, spin: 0, sit: 0, tears: 0, giggle: 0, still: false });
    if (this.face) this.face.doodle = null;
    this.spec.steers = true;
    // Standing is a small wobble: the big head sways one way, the body the other.
    const w = Math.sin(2 * Math.PI * 0.37 * t);
    const w2 = wobble(t * 0.5, 4);
    p.add('body', 1.5 * Math.sin(2 * Math.PI * 0.2 * t), 0, 3.2 * w + 2 * w2);
    p.add('head', 1.2 * w2, 0, -4.5 * w - 2 * w2);
    p.add('knot', 0, 0, 10 * wobble(t * 1.1, 8));
    p.add('leg.L', 2 * w2);
    p.add('leg.R', -2 * w2);
    // Arms up for balance.
    this.arm(1, 22 + 6 * w, 48 + 6 * w2, 30);
    this.arm(-1, 22 - 6 * w, 48 - 6 * w2, 30);
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    this.env = env;
    if (this.pleased) this.setAct(Math.random() < 0.5 ? 'clap' : 'giggle');
    // Toddling: short quick steps, the body rolling one way and the head the other.
    const amt = clamp(this.stride / (this.heightPx * 0.6), 0, 1.3);
    if (amt > 0.02 && !this.fx.still) {
      const a = Math.sin(this.gait * 1.4);
      p.add('leg.L', -30 * a * amt);
      p.add('leg.R', 30 * a * amt);
      p.add('body', 3 * amt, 0, 11 * a * amt);
      p.add('head', 0, 0, -14 * a * amt);
      this.arm(1, 10 * a * amt, 12 * amt, 0);
      this.arm(-1, -10 * a * amt, 12 * amt, 0);
      this.fx.hop = Math.max(this.fx.hop, 0.006 * Math.abs(Math.cos(this.gait * 1.4)) * amt);
    }
    // Sitting down hard: the legs go out in front, the whole of her sinks to the floor.
    this.sit += (this.fx.sit - this.sit) * (1 - Math.exp(-9 * dt));
    const s = this.sit;
    if (s > 0.005) {
      p.add('leg.L', -82 * s, 0, 8 * s);
      p.add('leg.R', -82 * s, 0, -8 * s);
      p.add('body', -6 * s);
    }
    this.h = this.fx.hop * this.px;
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    // Sat on the floor: the whole of her sinks by the nappy's depth.
    p.shift('root', 0, -0.048 * this.sit, 0);
    // Tears: lit drops that slide down the cheek and fade, a beat apart.
    const k = this.fx.tears;
    this.tearAt += dt * (k > 0 ? 1 : 0);
    for (const [i, s] of (['L', 'R'] as const).entries()) {
      const ph = (this.tearAt * 0.7 + i * 0.45) % 1;
      const size = k > 0.01 ? k * Math.min(1, ph * 6) * (1 - ph * 0.6) : 0.001;
      p.stretch(`tear.${s}`, Math.max(size, 0.001), [0, 1, 0], Math.max(size, 0.001));
      p.shift(`tear.${s}`, 0, -0.1 * ph * k, 0);
    }
    // Giggles open the mouth a little, in time.
    if (this.face)
      this.face.talk = this.fx.giggle > 0 ? 0.4 + 0.4 * Math.abs(Math.sin(env.time * 14)) : 0;
    this.lights(env.time);
    if (this.act === 'idle' && this.state === 'here')
      this.expression = this.hovered ? 'happy' : 'neutral';
  }

  update(dt: number, env: Env) {
    super.update(dt, env);
    this.pivot.rotation.y = this.fx.spin;
  }

  private lights(time: number) {
    const mood = this.face?.expression ?? 'neutral';
    // The pacifier's teat glows softly, brighter when she's happy, blue when she's sad.
    const tone = mood === 'sad' ? BLUE : PINK;
    this.outfit.dot(2, 0.5 + 0.3 * Math.sin(time * 2) + (mood === 'happy' ? 0.2 : 0), tone);
    this.outfit.dot(3, this.fx.tears > 0.05 ? 1 : 0.001, BLUE);
    this.outfit.beacon(mood === 'sad' ? BLUE : mood === 'asleep' ? '#8a8a84' : PINK);
  }
}
