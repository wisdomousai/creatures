import { BEACON } from './bolt';
import { type Act, clamp, type Env } from './character';
import { sin } from './moves';
import type { Feel } from './puppet';
import { type Anatomy, type Feeling, type Mood } from './pet';
import { Kitty, pulse, ramp } from './kitties';

/**
 * What the hoofed animals share (Cow, Unicorn, Lamb, Alpaca, Piglet, and later the goat kid,
 * the donkey, the foal, the ram and the highland calf), the way the dogs share dogs.ts:
 * a four-legged walk whose knees fold as each leg swings, a mood that shows in the tail and
 * the ears, a jaw that opens and chews, and the tricks a hoofed animal does: graze, chew
 * the cud, lie down front end first and then the back (and get up hind end first), shake
 * its head, stamp, buck, toss its head, yawn. They sit on the kittens' trick library
 * (kitties.ts: routes, spins, falling over, zoomies) like the dogs do.
 *
 * Built by hoofkit.py (rig: root, body, an optional `neck`, head, an optional `jaw`,
 * ear.L/R, tail.1..n, leg.XX and shin.XX). A creature picks its tricks and weights from
 * `hoofed()` plus its own, and sets what is particular to its build:
 *   - `fold`: how each leg folds when it lies down (thigh and shin angles),
 *   - `lieDrop`: how far the belly comes down when it lies,
 *   - `reach`: how far the head, neck and body go down to graze,
 *   - `kneeLift`: how high the knees come up when it walks (a pony prances).
 * Dot0 is the tail tip and Dot1 the ear hinges; a creature's own lights start at Dot2.
 */
/** Every hoofed animal's moods: a swishing tail and ears that say how it feels. */
export function hoofMoods(tailUp = 0): Anatomy['moods'] {
  return {
    calm: { face: 'neutral', carriage: -8 + tailUp, wag: [9, 0.7], ears: 0, out: 8, swivel: 0.3 },
    curious: {
      face: 'neutral',
      carriage: 8 + tailUp,
      wag: [6, 1.6],
      ears: 12,
      out: -6,
      swivel: 0.6,
    },
    happy: { face: 'happy', carriage: 4 + tailUp, wag: [24, 2.6], ears: 5, out: 4, swivel: 0.3 },
    love: { face: 'love', carriage: 6 + tailUp, wag: [30, 3.2], ears: 0, out: 14, swivel: 0 },
    alarmed: { face: 'surprised', carriage: 28 + tailUp, ears: 14, out: -10, swivel: 0 },
    annoyed: {
      face: 'focused',
      carriage: 10 + tailUp,
      wag: [14, 4.5],
      ears: -16,
      out: 20,
      swivel: 0,
    },
    sad: { face: 'sad', carriage: -50, wag: [3, 0.5], ears: -22, out: 24, swivel: 0 },
    sleepy: { face: 'sleepy', carriage: -30, wag: [5, 0.4], ears: -8, out: 16, swivel: 0 },
    asleep: { face: 'asleep', carriage: -40, flicks: 0.2, ears: -10, out: 18, swivel: 0.2 },
  };
}

/** The acts that come with a mood, for every hoofed animal. */
export const HOOF_ACT_MOODS = {
  startle: 'alarmed',
  dizzy: 'annoyed',
  zoomies: 'happy',
  graze: 'calm',
  chew: 'sleepy',
  shake: 'happy',
  buck: 'happy',
  stamp: 'annoyed',
  toss: 'happy',
  yawn: 'sleepy',
  stretch: 'sleepy',
  dozeOff: 'sleepy',
  lie: 'sleepy',
  nap: 'asleep',
  watch: 'curious',
  tilt: 'curious',
} satisfies Record<string, Mood>;

/** Spring settings for the rig every hoofed animal shares; `over` adds or changes bones. */
export function hoofFeels(
  tailBones: number,
  over: Record<string, Feel> = {},
): Record<string, Feel> & { default: Feel } {
  const feels: Record<string, Feel> = {
    default: { f: 1.6, zeta: 0.65 },
    root: { f: 2.3, zeta: 0.65 },
    body: { f: 1.4, zeta: 0.7 },
    neck: { f: 1.6, zeta: 0.6 },
    head: { f: 1.5, zeta: 0.6, r: 0.3 },
    jaw: { f: 5, zeta: 0.5 },
    'ear.L': { f: 2.6, zeta: 0.3 },
    'ear.R': { f: 2.6, zeta: 0.3 },
  };
  for (let i = 1; i <= tailBones; i++) feels[`tail.${i}`] = { f: 3, zeta: 0.4 - i * 0.02 };
  return { ...feels, ...over } as Record<string, Feel> & { default: Feel };
}

/** How a hoofed animal lies down: the angles each leg folds to. */
export interface Fold {
  /** [thigh, shin] of each front leg and each hind leg, degrees (thigh negative = forward). */
  front: [number, number];
  back: [number, number];
}

export abstract class Hoofed extends Kitty {
  /** How wide the jaw is open, 0..1, and how much it chews sideways, 0..1 (tricks set them). */
  protected mouth = 0;
  protected chew = 0;
  private chewPhase = 0;
  /** How it lies down, and how far its belly comes down (metres). */
  protected fold: Fold = { front: [-70, 140], back: [-65, 130] };
  protected lieDrop = -0.2;
  /** Head, neck and body angles for grazing, and how high the knees come up walking. */
  protected reach = { head: 55, neck: 0, body: 10 };
  protected kneeLift = 28;
  /** The usual knee lift; a trick may raise kneeLift for a while (a prance). */
  protected knee = 28;
  /** The lying-down stages (0..1): the front end goes down first, the hind end after; and
   * getting up, the hind end first. */
  private fF = 0;
  private fB = 0;
  private lieT = 0;
  protected rising = false;
  private headWas: [number, number] = [0, 0];
  /** What a poke makes it do (an act's name). */
  protected pokeAct = 'startle';

  // ---------- Lying down in stages ----------

  protected idle(t: number) {
    this.mouth = 0;
    this.chew = 0;
    this.toyLift = 0;
    this.kneeLift = this.knee;
    super.idle(t);
  }

  /** Lying with its legs folded under it, head up and chewing. */
  protected lying(breath: number) {
    const p = this.puppet;
    const [ft, fs] = this.fold.front;
    const [bt, bs] = this.fold.back;
    const tip = 12 * (this.fF - this.fB);
    p.add('body', tip);
    for (const s of ['L', 'R']) {
      p.add(`leg.F${s}`, ft * this.fF - tip);
      p.add(`shin.F${s}`, fs * this.fF);
      p.add(`leg.B${s}`, bt * this.fB);
      p.add(`shin.B${s}`, bs * this.fB);
    }
    p.add('head', -4 * this.fF + 2 * breath);
  }

  protected pose(dt: number, env: Env) {
    const lying = this.posture === 'lie';
    this.lieT = lying ? this.lieT + dt : 0;
    this.fF = lying ? ramp(this.lieT, 0, 0.8) : 0;
    this.fB = lying && !this.rising ? ramp(this.lieT, 1, 1.9) : 0;
    if (lying) this.anatomy.drop.lie = this.lieDrop * (0.2 + 0.8 * this.fB);
    super.pose(dt, env);
    // Knees fold up as each leg swings forward.
    const moving = Math.min(1, this.stride / (this.heightPx * 0.8));
    if (moving > 0.05) {
      const a = Math.sin(this.gait);
      const lift = this.kneeLift * moving;
      this.puppet.add('shin.FL', Math.max(0, -a) * lift);
      this.puppet.add('shin.BR', Math.max(0, -a) * lift);
      this.puppet.add('shin.FR', Math.max(0, a) * lift);
      this.puppet.add('shin.BL', Math.max(0, a) * lift);
    }
  }

  /** Turn the neck bone, if this one has one (the long-necked ones). */
  protected neckAdd(pitch = 0, yaw = 0, roll = 0) {
    if (this.puppet.has('neck')) this.puppet.add('neck', pitch, yaw, roll);
  }

  protected express(dt: number, env: Env, f: Feeling) {
    const p = this.puppet;
    if (p.has('jaw')) {
      this.chewPhase += dt * 2 * Math.PI * 1.7;
      const c = this.chew;
      p.add(
        'jaw',
        Math.min(1, this.mouth) * 34 + c * (3 + 3 * Math.max(0, Math.sin(this.chewPhase * 0.5))),
        c * 10 * Math.sin(this.chewPhase),
      );
    }
    if (this.mood === 'curious') p.add('head', 0, 0, 9);
    // Ears lag behind the head's turns, a little.
    const [pitch, yaw] = p.current('head');
    const vy = (yaw - this.headWas[1]) / Math.max(dt, 1e-3);
    this.headWas = [pitch, yaw];
    const swing = clamp(-vy * 0.05, -20, 20);
    p.add('ear.L', 0, 0, swing);
    p.add('ear.R', 0, 0, swing);
    void f;
  }

  /** Cheerful reaction to a poke; three pokes make it dizzy. */
  poke() {
    if (this.state !== 'here') return;
    if (this.poked() >= 3) this.setAct('dizzy');
    else if (this.act === 'nap' || this.act === 'dizzy' || this.posture === 'lie')
      this.setAct('startle');
    else this.setAct(this.pokeAct in this.acts ? this.pokeAct : 'startle');
  }

  protected after(dt: number, env: Env) {
    super.after(dt, env);
    this.hoofLights(env);
  }

  /** Dot0 the tail tip, Dot1 the ear hinges: brighter when it's happy or alert. */
  protected hoofLights(env: Env) {
    const o = this.outfit;
    if (!o) return;
    const glad = this.mood === 'happy' || this.mood === 'love';
    const alert = this.expression === 'surprised' || this.expression === 'focused';
    const asleep = this.mood === 'asleep' || this.posture === 'lie';
    const tone = alert
      ? BEACON[this.expression]
      : glad
        ? BEACON[this.mood === 'love' ? 'love' : 'happy']
        : undefined;
    const tip = asleep
      ? 0.12
      : 0.35 + 0.15 * Math.sin(env.time * 0.9) + (glad ? 0.4 : 0) + (alert ? 0.3 : 0);
    o.dot(0, clamp(tip, 0, 1), tone);
    o.dot(1, clamp(asleep ? 0.08 : alert ? 0.9 : 0.3, 0, 1), tone);
  }

  // ---------- The tricks every hoofed animal knows ----------

  /** The kittens' library plus these: graze, chew, lie, stand, shake, buck, stamp, toss, yawn. */
  protected hoofed(): Record<string, Act> {
    const p = () => this.puppet;
    const stand = () => this.standing;
    const still = () => this.still;
    const end = () => this.actLength;
    const own: Record<string, Act> = {
      // Down to the floor for the grass, a nibble, the tail swishing, a step along now and then.
      graze: {
        weight: 0,
        length: [5, 8],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.run.dir = this.roomy();
        },
        pose: (t) => {
          const k = ramp(t, 0, 0.9) * (1 - ramp(t, end() - 0.9, end()));
          const r = this.reach;
          p().add('body', r.body * k);
          this.neckAdd(r.neck * k + 3 * sin(t, 0.7) * k);
          p().add('head', (r.head + 4 * sin(t, 1.1)) * k);
          p().add('leg.FL', -6 * k);
          p().add('leg.FR', 4 * k);
          this.chew = 0.7 * k;
          this.extraLift = -0.01 * k;
          this.emote = 'sleepy';
          // A step or two along the grass.
          if (t > 2.2 && t < 3.4) {
            this.walkTo(this.s + this.run.dir * this.heightPx * 0.35, this.depth);
            this.boost = 0.4;
          }
        },
      },
      // Chewing the cud, standing, eyes half shut, the jaw going round sideways.
      chew: {
        weight: 0,
        length: [5, 8],
        when: still,
        pose: (t) => {
          const k = ramp(t, 0, 0.6) * (1 - ramp(t, end() - 0.6, end()));
          this.chew = k;
          p().add('head', 3 * k, 6 * k * sin(t, 0.18), 3 * k * sin(t, 0.3));
          this.emote = 'sleepy';
          this.pupils = 0.2;
        },
      },
      // Lies down, front end first, then the back (see lying()); stays down a while.
      lie: {
        weight: 0,
        length: [7, 12],
        when: () => this.posture !== 'lie' && still(),
        start: () => (this.posture = 'lie'),
        pose: (t) => {
          this.emote = t > 2 ? 'sleepy' : null;
          this.chew = t > 2.5 ? 0.6 : 0;
        },
      },
      // Gets up hind end first, the way hoofed animals do, and stretches.
      stand: {
        weight: 0,
        length: [2.4, 2.4],
        when: () => this.posture !== 'stand',
        start: () => {
          this.rising = this.posture === 'lie';
          if (!this.rising) this.posture = 'stand';
        },
        pose: (t) => {
          if (t > 1.3 && this.posture === 'lie') {
            this.posture = 'stand';
            this.rising = false;
            this.hop.kick(0.5 * this.build.spring);
          }
          if (this.posture === 'lie') p().add('head', -10 * ramp(t, 0.4, 1.1));
          if (t > 1.5) p().add('body', -4 * pulse(t, 1.5, 0.9));
        },
      },
      // Shakes its head and its whole self, ears flapping, to get rid of a fly.
      shake: {
        weight: 0,
        length: [1.8, 1.8],
        when: stand,
        pose: (t) => {
          const k = ramp(t, 0, 0.12) * (1 - ramp(t, 1.4, 1.8));
          const w = sin(t, 6);
          p().add('head', 0, 22 * k * w, 8 * k * sin(t, 6, 0.25));
          p().add('root', 0, 7 * k * w);
          p().add('ear.L', 0, 0, -35 * k * w);
          p().add('ear.R', 0, 0, 35 * k * w);
          this.emote = 'dizzy';
        },
      },
      // Kicks up its heels: front end down, both hind legs out behind, a hop; twice.
      buck: {
        weight: 0,
        length: [3.2, 3.2],
        when: stand,
        start: () => (this.run.n = 0),
        pose: (t) => {
          const k = ramp(t, 0, 0.3) * (1 - ramp(t, 2.6, 3.2));
          const kick = Math.max(0, sin(t, 1.1, -0.1)) ** 0.8;
          p().add('body', (14 + 8 * kick) * k);
          p().add('head', (6 - 12 * kick) * k);
          for (const s of ['BL', 'BR']) {
            p().add(`leg.${s}`, 62 * kick * k);
            p().add(`shin.${s}`, 30 * kick * k);
          }
          p().add('leg.FL', -14 * k);
          p().add('leg.FR', -14 * k);
          const n = Math.floor(t * 1.1 + 0.1);
          if (t < 2.4 && n >= this.run.n + 1) {
            this.run.n = n;
            this.hop.kick(1.3 * this.build.spring);
          }
          this.emote = 'happy';
          this.pupils = 0.9;
        },
      },
      // Stamps a front hoof, three times, head low, cross.
      stamp: {
        weight: 0,
        length: [2.8, 2.8],
        when: stand,
        pose: (t) => {
          const k = ramp(t, 0, 0.25) * (1 - ramp(t, 2.4, 2.8));
          const a = Math.max(0, sin(t, 1.5, 0.1));
          p().add('leg.FL', -48 * a * k);
          p().add('shin.FL', 30 * a * k);
          p().add('head', 14 * k, 0, 0);
          p().add('body', 3 * a * k);
          this.emote = 'focused';
          this.pupils = 1;
          if (a < 0.05 && this.run.phase === 1) this.run.phase = 0;
          if (a > 0.95 && this.run.phase === 0) {
            this.run.phase = 1;
            this.hop.kick(0.5 * this.build.spring);
          }
        },
      },
      // Tosses its head up and back, a snort, ears and tail up.
      toss: {
        weight: 0,
        length: [2.2, 2.2],
        when: still,
        pose: (t) => {
          const k = pulse(t, 0.2, 1.2);
          p().add('head', -26 * k, 8 * sin(t, 1.6) * k);
          this.neckAdd(-8 * k);
          p().add('body', -4 * k);
          this.mouth = 0.25 * k;
          this.emote = 'happy';
          if (t > 0.5 && !this.run.done) {
            this.run.done = true;
            this.hop.kick(0.7 * this.build.spring);
          }
        },
      },
      // A big yawn: head back, jaw wide, ears flat.
      yawn: {
        weight: 0,
        length: [2.8, 2.8],
        when: still,
        pose: (t) => {
          const k = pulse(t, 0.2, 2.4);
          this.mouth = k;
          p().add('head', -22 * k);
          p().add('body', -4 * k);
          p().add('ear.L', 0, 0, 22 * k);
          p().add('ear.R', 0, 0, -22 * k);
          this.emote = k > 0.1 ? 'sleepy' : null;
        },
      },
    };
    return own;
  }

  /** Pick tricks for a creature: the plain pet acts, then each trick by name with a weight,
   * from the kittens' library and `hoofed()` and anything of its own passed in `extra`. */
  protected adopt(
    mine: Record<string, number>,
    extra: Record<string, Act> = {},
    common: ('idle' | 'stroll' | 'sit' | 'nap' | 'stand' | 'stretch' | 'startle')[] = [
      'idle',
      'stroll',
      'nap',
      'stretch',
      'startle',
    ],
  ) {
    const all = { ...this.tricks(), ...this.hoofed(), ...extra };
    const plain = this.commonActs();
    for (const k of common) this.acts[k] = plain[k];
    for (const [name, weight] of Object.entries(mine)) {
      if (!all[name]) throw new Error(`no trick ${name}`);
      this.acts[name] = { ...all[name], weight };
    }
    this.acts.dizzy = { ...all.dizzy, weight: 0 };
    if (extra.startle) this.acts.startle = { ...extra.startle, weight: 0 };
  }

  /** Sitting is a hind end tucked down, the front end up. */
  protected sitting() {
    super.sitting();
    this.puppet.add('shin.BL', 100);
    this.puppet.add('shin.BR', 100);
  }
}
