import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Act, clamp, type Edge, type Env, type Frame, type Spec } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import { type Anatomy, type Feeling, type Mood, Pet } from './pet';
import type { Feel } from './puppet';
import { Spring } from './spring';

/**
 * The small round four-legged crew (hamster, chinchilla, red panda, koala, panda): a Pet
 * with the acts every little furry robot shares, so each creature file is its own build,
 * its own tricks and its own lights. For whoever builds the next fluffy creature on the
 * Pet base; the model side is blender/fluffkit.py.
 *
 * What it gives: the pet's postures (stand, sit, lie, nap, stretch), moods in the ears and
 * tail, and a dozen acts of its own: a yawn, a sniff, a look round, a head tilt, a scratch,
 * a shake, a wiggle, hops, a spin, a sneeze and rearing up on the hind legs; a startle, a
 * play bow, love under the mouse and dizziness after three pokes.
 *
 * A creature passes its numbers in `FluffyOptions`, then adds acts (`this.acts = {...this.acts,
 * ...mine}`) and overrides `lights`, `sitting` and `lying` where its body differs. Acts that
 * want the body turned about or crouched set `this.want`, which `after()` applies.
 */
export const ease = (t: number, a: number, b: number) => {
  const u = clamp((t - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
};
/** Fades in over a..b, holds, and fades out over c..d. */
export const span = (t: number, a: number, b: number, c: number, d: number) =>
  ease(t, a, b) * (1 - ease(t, c, d));
/** A bump from 0 up to 1 and back over `length` seconds, starting at `at`. */
export const pulse = (t: number, at: number, length: number) =>
  t > at && t < at + length ? Math.sin(((t - at) / length) * Math.PI) : 0;

export const LEGS = ['leg.FL', 'leg.FR', 'leg.BL', 'leg.BR'];

export interface FluffyOptions {
  name: string;
  model: string;
  /** Model height and width in metres, and the on-screen height in --bot. */
  metres: number;
  width: number;
  size: number;
  face: FaceLayout;
  /** Eye height as a fraction of the model height. */
  eyes: number;
  /** The tail bones, root first (a stub has one). */
  tail: string[];
  tailAxis?: [number, number, number];
  /** How far sitting tips the body up (degrees, - lifts the chest) and the hips' drop (m). */
  sit: number;
  drop?: Partial<Anatomy['drop']>;
  turn?: number;
  moods?: Partial<Record<Mood, Partial<Feeling>>>;
  actMoods?: Record<string, Mood>;
  speed?: number;
  stay?: [number, number];
  edges?: Edge[];
  lag?: number;
  feels?: Record<string, Feel>;
  gaze?: Spec['gaze'];
}

const MOODS: Record<Mood, Feeling> = {
  calm: {
    face: 'neutral',
    carriage: -8,
    bob: [3, 0.2],
    wag: [4, 0.3],
    ears: 0,
    out: 4,
    swivel: 0.4,
  },
  curious: { face: 'neutral', carriage: 0, flicks: 0.8, hook: 10, ears: 12, out: -3, swivel: 1 },
  happy: { face: 'happy', carriage: 14, wag: [16, 1.4], ears: 6, out: 6, swivel: 0.3 },
  love: { face: 'love', carriage: 8, wag: [20, 1.8], ears: -16, out: 14, swivel: 0 },
  alarmed: { face: 'surprised', carriage: 30, hook: -15, puff: 1, ears: -22, out: 8, swivel: 0 },
  annoyed: { face: 'cross', carriage: -8, wag: [8, 2.6], puff: 0.3, ears: -26, out: 34, swivel: 0 },
  sad: { face: 'sad', carriage: -40, ears: -18, out: 24, swivel: 0 },
  sleepy: { face: 'sleepy', carriage: -26, bob: [2, 0.12], ears: -8, out: 16, swivel: 0.1 },
  asleep: { face: 'asleep', carriage: -24, flicks: 0.12, ears: -10, out: 20, swivel: 0.2 },
};

/** The acts that come with a mood, for every fluffy creature. */
const ACT_MOODS: Record<string, Mood> = {
  love: 'love',
  startle: 'alarmed',
  play: 'happy',
  yawn: 'sleepy',
  stretch: 'sleepy',
  nap: 'asleep',
  sniff: 'curious',
  lookAround: 'curious',
  tilt: 'curious',
  rearUp: 'curious',
  wiggle: 'happy',
  hophop: 'happy',
  spin: 'happy',
  shake: 'happy',
  scratch: 'calm',
  sneeze: 'calm',
};

export abstract class Fluffy extends Pet {
  protected anatomy: Anatomy;
  protected frame: Frame | null = null;
  protected env: Env | null = null;
  protected hops = 0;
  private hoverT = 0;
  /** What acts want this frame: turned about (degrees), crouched (metres). */
  protected want = { yaw: 0, low: 0 };
  protected turning = new Spring(1.6, 0.8);
  protected crouching = new Spring(2.5, 0.6);
  /** How many dots a creature has, for the default lights. */
  protected dotCount = 1;
  protected baseSpeed: number;
  protected gazeSet: Spec['gaze'];

  constructor(o: FluffyOptions, model: Object3D) {
    const feels: Record<string, Feel> & { default: Feel } = {
      default: { f: 3, zeta: 0.55 },
      body: { f: 2.2, zeta: 0.55 },
      head: { f: 2.4, zeta: 0.55, r: 0.3 },
      'ear.L': { f: 5, zeta: 0.3 },
      'ear.R': { f: 5, zeta: 0.3 },
      ...Object.fromEntries(
        o.tail.map((b, i) => [b, { f: 2.2 + i * 0.4, zeta: 0.45 - i * 0.03 }] as [string, Feel]),
      ),
      'leg.FL': { f: 4, zeta: 0.6 },
      'leg.FR': { f: 4, zeta: 0.6 },
      'leg.BL': { f: 4, zeta: 0.6 },
      'leg.BR': { f: 4, zeta: 0.6 },
      ...o.feels,
    };
    const gaze = o.gaze ?? [
      { bone: 'head', yaw: 0.8, pitch: 0.9 },
      { bone: 'body', yaw: 0.2, pitch: 0 },
    ];
    super(
      {
        name: o.name,
        model: o.model,
        metres: o.metres,
        width: o.width,
        size: o.size,
        feels,
        face: o.face,
        eyes: o.eyes,
        gaze,
        reach: { yaw: 60, pitch: 30 },
        lag: o.lag ?? 1,
        entrance: 'walk',
        edges: o.edges ?? ['bottom'],
        stay: o.stay ?? [45, 100],
        speed: o.speed ?? 1.2,
      },
      model,
    );
    this.baseSpeed = o.speed ?? 1.2;
    this.gazeSet = gaze;
    const moods = { ...MOODS } as Record<Mood, Feeling>;
    for (const k of Object.keys(moods) as Mood[]) moods[k] = { ...moods[k], ...o.moods?.[k] };
    this.anatomy = {
      tail: o.tail,
      tailAxis: o.tailAxis ?? [0, 0.4, -1],
      earsHang: false,
      moods,
      actMoods: { ...ACT_MOODS, ...o.actMoods },
      lying: 'sleepy',
      hover: 'happy',
      drop: { stand: 0, sit: -0.05, lie: -0.06, ...o.drop },
      sit: o.sit,
      turn: o.turn ?? 45,
    };
    this.acts = { ...this.commonActs(), ...this.fluffActs() };
  }

  /** The crewmates on its floor. */
  protected mates() {
    return (this.env?.crew ?? []).filter(
      (o) => o !== this && o.state === 'here' && o.edge === this.edge && !o.free,
    );
  }

  protected still = () => !this.walking;
  protected standing = () => this.posture === 'stand' && !this.walking;
  protected hopTo(count: number, strength: number) {
    for (; this.hops < count; this.hops++) this.hop.kick(strength);
  }

  /** Sat up, or reared on its hind legs, `k` of the way: front legs raised. */
  protected rear(k: number, arms = -55) {
    const p = this.puppet;
    p.add('body', -40 * k);
    p.add('leg.BL', 40 * k);
    p.add('leg.BR', 40 * k);
    p.add('leg.FL', arms * k);
    p.add('leg.FR', arms * k);
    p.add('head', 28 * k);
  }

  private fluffActs(): Record<string, Act> {
    const p = this.puppet;
    const awake = () => this.posture !== 'lie' && !this.walking;
    return {
      yawn: {
        weight: 0.8,
        length: [2.6, 3],
        when: this.still,
        pose: (t) => {
          const open = span(t, 0.3, 0.9, 1.8, 2.3);
          p.add('head', -24 * open, 0, 5 * open);
          p.add('body', -4 * open);
          p.add('ear.L', -18 * open, 0, -12 * open);
          p.add('ear.R', -18 * open, 0, 12 * open);
        },
      },
      sniff: {
        weight: 0.9,
        length: [3, 4.5],
        when: this.standing,
        pose: (t) => {
          const k = span(t, 0.2, 0.6, this.actLength - 0.6, this.actLength - 0.2);
          p.add('head', k * (16 + 7 * sin(t, 3.6)), 14 * sin(t, 0.4) * k);
          p.add('body', 5 * k);
          p.add('ear.L', 8 * k);
          p.add('ear.R', 8 * k);
        },
      },
      lookAround: {
        weight: 1,
        length: [4, 6],
        when: awake,
        pose: (t) => {
          const k = span(t, 0.3, 0.8, this.actLength - 0.8, this.actLength - 0.3);
          p.add('head', -4 * k, 46 * sin(t, 0.33) * k);
          p.add('body', 0, 10 * sin(t, 0.33, 0.1) * k);
          p.add('ear.L', 6 * k, 20 * sin(t, 0.33, 0.2) * k);
          p.add('ear.R', 6 * k, 20 * sin(t, 0.33, 0.2) * k);
        },
      },
      tilt: {
        weight: 0.9,
        length: [2.6, 3.6],
        when: awake,
        pose: (t) => {
          const k = span(t, 0.2, 0.6, this.actLength - 0.7, this.actLength - 0.2);
          const side = Math.floor(t / 1.3) % 2 ? -1 : 1;
          p.add('head', 6 * k, 0, side * 20 * k);
          p.add('ear.L', 10 * k);
          p.add('ear.R', 10 * k);
        },
      },
      scratch: {
        weight: 0.8,
        length: [2.6, 3.4],
        when: this.standing,
        pose: (t) => {
          const k = span(t, 0.3, 0.7, this.actLength - 0.6, this.actLength - 0.2);
          p.add('body', 0, 0, 5 * k);
          p.add('head', 8 * k, 0, -10 * k);
          p.add('leg.BL', (-48 + 22 * sin(t, 7)) * k, 0, -8 * k);
          p.add('ear.L', 0, 0, 14 * k * Math.max(0, sin(t, 7)));
        },
      },
      shake: {
        weight: 0.7,
        length: [1.6, 2],
        when: this.still,
        pose: (t) => {
          const d = Math.sin(t * 2 * Math.PI * 5.5) * Math.exp(-t * 1.6) * (t > 0.2 ? 1 : 0);
          p.add('body', 0, 0, 12 * d);
          p.add('head', 0, 0, -20 * d);
          p.add('ear.L', 0, 0, 30 * d);
          p.add('ear.R', 0, 0, 30 * d);
          this.anatomy.tail.forEach((b, i) => p.add(b, 0, 16 * d * (i + 1) * 0.5));
        },
      },
      wiggle: {
        weight: 0.9,
        length: [2, 3],
        when: this.standing,
        pose: (t) => {
          const k = span(t, 0.2, 0.5, this.actLength - 0.5, this.actLength - 0.1);
          p.add('root', 0, 0, 5 * sin(t, 2.6) * k);
          p.add('body', 0, 10 * sin(t, 2.6, 0.25) * k, 0);
          p.add('head', 0, -12 * sin(t, 2.6, 0.25) * k, 0);
          p.add('ear.L', 0, 0, 14 * sin(t, 2.6, 0.5) * k);
          p.add('ear.R', 0, 0, 14 * sin(t, 2.6, 0.5) * k);
        },
      },
      hophop: {
        weight: 0.9,
        length: [2.4, 3],
        when: this.standing,
        start: () => (this.hops = 0),
        pose: (t) => {
          this.hopTo(Math.floor(t / 0.55) + 1, 1.2);
          p.add('ear.L', -14 * Math.max(0, sin(t, 1.8)));
          p.add('ear.R', -14 * Math.max(0, sin(t, 1.8)));
          p.add('leg.FL', -14 * Math.max(0, sin(t, 1.8)));
          p.add('leg.FR', -14 * Math.max(0, sin(t, 1.8)));
        },
      },
      spin: {
        weight: 0.8,
        length: [2.6, 3],
        when: this.standing,
        pose: (t) => {
          const k = ease(t, 0.3, 2.3);
          this.want.yaw = 360 * k;
          const patter = Math.sin(t * 2 * Math.PI * 4);
          p.add('leg.FL', 18 * patter);
          p.add('leg.BR', 18 * patter);
          p.add('leg.FR', -18 * patter);
          p.add('leg.BL', -18 * patter);
          p.add('head', 0, 0, -10 * k * (1 - k));
        },
      },
      sneeze: {
        weight: 0.6,
        length: [2.2, 2.6],
        when: this.still,
        pose: (t) => {
          const wind = ease(t, 0.2, 0.95) * (1 - ease(t, 0.95, 1.1));
          const snap = pulse(t, 0.95, 0.5);
          p.add('head', -22 * wind + 24 * snap);
          p.add('body', -4 * wind + 6 * snap);
          p.add('ear.L', -14 * wind + 20 * snap);
          p.add('ear.R', -14 * wind + 20 * snap);
          if (t > 0.95 && t < 1.05) this.hop.kick(0.6);
        },
      },
      rearUp: {
        weight: 0.8,
        length: [4, 5.5],
        when: this.standing,
        pose: (t) => {
          const k = span(t, 0.2, 0.9, this.actLength - 0.9, this.actLength - 0.2);
          this.rear(k, -50);
          p.add('head', 0, 36 * sin(t, 0.3) * k);
          p.add('ear.L', 12 * k);
          p.add('ear.R', 12 * k);
        },
      },
      // Reactions
      play: {
        weight: 0,
        length: [2.5, 3.5],
        when: this.standing,
        start: () => (this.hops = 0),
        pose: (t) => {
          this.bow();
          this.hopTo(Math.floor(t * 1.8 + 0.5), 0.5);
        },
      },
      love: {
        weight: 0,
        length: [2.5, 3.5],
        pose: (t) => p.add('head', -6, 0, 12 * sin(t, 0.7)),
      },
      dizzy: {
        weight: 0,
        length: [3.6, 4],
        face: 'dizzy',
        start: () => (this.posture = 'stand'),
        pose: (t) => this.dizzy(t),
      },
    };
  }

  /** Wobbling round in a circle, head the other way, ears flopping out. */
  protected dizzy(t: number) {
    const p = this.puppet;
    const k = Math.min(1, t / 0.5) * (1 - ease(t, this.actLength - 0.8, this.actLength));
    p.add('root', 8 * k * sin(t, 0.9), 0, 8 * k * sin(t, 0.9, 0.25));
    p.add('head', 14 * k * sin(t, 0.9, 0.5), 0, 14 * k * sin(t, 0.9, 0.75));
    p.add('ear.L', -10 * k, 0, -30 * k);
    p.add('ear.R', -10 * k, 0, 30 * k);
    p.add('leg.FL', 0, 0, -8 * k);
    p.add('leg.FR', 0, 0, 8 * k);
    for (const bone of this.anatomy.tail) p.add(bone, -8 * k, 12 * k * sin(t, 0.9, 0.5));
  }

  poke() {
    if (this.state !== 'here') return;
    const n = this.poked();
    if (n >= 3) this.setAct('dizzy');
    else if (n === 2 && this.posture !== 'lie' && this.acts.play.when?.()) this.setAct('play');
    else this.setAct('startle');
  }

  /** Acts whose own mood the mouse shouldn't break into (love comes only from rest). */
  protected calmActs = ['idle', 'sit', 'stand', 'lookAround'];

  protected pose(dt: number, env: Env) {
    this.frame = env.frame;
    this.env = env;
    this.hoverT = this.hovered ? this.hoverT + dt : 0;
    if (this.hoverT > 0.8 && this.calmActs.includes(this.act) && this.posture !== 'lie')
      this.setAct('love');
    super.pose(dt, env);
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    this.h = 0;
    const turned = this.turning.update(dt, this.want.yaw);
    if (turned) p.turn('root', 0, turned);
    const low = this.crouching.update(dt, this.want.low);
    if (Math.abs(low) > 1e-4) {
      p.shift('body', 0, -low, 0);
      for (const leg of LEGS) p.shift(leg, 0, low, 0);
    }
    this.want.yaw = this.want.low = 0;
    this.lights(env.time);
  }

  /** The default lights: every dot follows the mood. Creatures override this. */
  protected lights(time: number) {
    const m = this.mood;
    let level = 0.45 + 0.1 * Math.sin(time * 0.9);
    let tone: string | undefined;
    if (m === 'asleep') level = 0.1 + 0.2 * (0.5 + 0.5 * Math.sin(time * 1.1));
    else if (m === 'sleepy') level = 0.3;
    else if (m === 'love') [level, tone] = [0.75 + 0.25 * Math.sin(time * 5), BEACON.love];
    else if (m === 'happy') [level, tone] = [0.85 + 0.15 * Math.sin(time * 3), BEACON.happy];
    else if (m === 'alarmed') [level, tone] = [Math.sin(time * 30) > 0 ? 1 : 0.4, BEACON.surprised];
    else if (m === 'curious') level = 0.9;
    if (this.act === 'dizzy') tone = RAINBOW[Math.floor(time * 6) % RAINBOW.length];
    for (let i = 0; i < this.dotCount; i++) this.outfit.dot(i, clamp(level, 0, 1), tone);
  }

  protected onLeave() {
    super.onLeave();
    this.h = 0;
  }
}
