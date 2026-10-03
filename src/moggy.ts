import { BEACON } from './bolt';
import { clamp, type Env } from './character';
import { KITTEN_ACT_MOODS, Kitty, kittenMoods } from './kitties';
import type { Anatomy, Mood } from './pet';

/**
 * What the grown-up breeds (Roz the Bengal, Mochi the Ragdoll, Tansy the Abyssinian, Nub the
 * Munchkin, Gus the old tabby) share, on top of the kittens' trick library (kitties.ts): a
 * calmer set of moods in tail and ears than a kitten's, the picking of a breed's tricks and
 * weights, and the lights every one of them has built the same way (catkit.py): Dot0 the tail
 * tip, Dot1 and Dot2 the tail's collars, Dot3 the ear hinges, Dot4 the whisker tips.
 */
export const CAT_ACT_MOODS = { ...KITTEN_ACT_MOODS } satisfies Record<string, Mood>;

/** Moods for a grown cat: a slow, low tail in place of a kitten's flag. `calm`, `love` and
 * the rest can be changed per breed. */
export function adultMoods(over: Partial<Anatomy['moods']> = {}): Anatomy['moods'] {
  const kit = kittenMoods();
  return {
    ...kit,
    calm: {
      face: 'neutral',
      carriage: -35,
      bob: [4, 0.2],
      hook: 10,
      flicks: 0.1,
      ears: 0,
      out: 0,
      swivel: 0.3,
    },
    curious: {
      face: 'neutral',
      carriage: -5,
      hook: 30,
      flicks: 0.8,
      ears: 12,
      out: -4,
      swivel: 0.9,
    },
    happy: { face: 'happy', carriage: 12, hook: 25, ears: 8, out: -4, swivel: 0.3 },
    love: { face: 'love', carriage: 12, hook: 20, quiver: 1, ears: 8, out: -6, swivel: 0 },
    sad: { face: 'sad', carriage: -80, ears: -12, out: 26, swivel: 0 },
    sleepy: {
      face: 'sleepy',
      carriage: -70,
      bob: [3, 0.12],
      hook: 5,
      ears: -4,
      out: 16,
      swivel: 0.1,
    },
    asleep: { face: 'asleep', carriage: -70, flicks: 0.15, ears: -4, out: 12, swivel: 0.3 },
    ...over,
  };
}

export abstract class Moggy extends Kitty {
  /** A breed's extra lights, called each frame after the shared ones (outfit, tone). */
  protected breedLights(_time: number, _tone: string | undefined): void {}

  /** Pick a breed's tricks from the library with weights; the plain pet acts come along. */
  protected adopt(mine: Record<string, number>, lie = 0.6) {
    const all = this.tricks();
    const common = this.commonActs();
    for (const k of ['idle', 'stroll', 'sit', 'nap', 'stand', 'stretch', 'startle'] as const) {
      this.acts[k] = common[k];
    }
    this.acts.lie = { ...common.lie, weight: lie };
    for (const [name, weight] of Object.entries(mine)) this.acts[name] = { ...all[name], weight };
    this.acts.dizzy = all.dizzy;
    this.acts.purr = all.purr;
  }

  protected after(dt: number, env: Env) {
    super.after(dt, env);
    const o = this.outfit;
    if (!o) return;
    const time = env.time;
    const a = this.act;
    let tip = 0.5 + 0.15 * Math.sin(time * 0.9);
    let ears = 0.3;
    let whisker = 0.25 + 0.2 * Math.max(0, Math.sin(time * 0.8));
    let tone: string | undefined;
    if (this.mood === 'asleep' || this.posture === 'lie') {
      tip = 0.12 + 0.12 * (0.5 + 0.5 * Math.sin(time * 1.1));
      ears = 0.05;
      whisker = 0.05;
    } else if (this.mood === 'sleepy') {
      tip = 0.25;
      ears = 0.1;
      whisker = 0.1;
    } else if (this.expression === 'focused' || this.expression === 'surprised') {
      tip = 0.6 + 0.4 * Math.max(0, Math.sin(time * 8));
      whisker = 1;
      ears = 0.9;
      tone = BEACON[this.expression];
    } else if (this.mood === 'happy' || this.mood === 'love') {
      tip = 0.85 + 0.15 * Math.sin(time * 3);
      whisker = 0.7;
      ears = 0.5;
      tone = this.mood === 'love' ? BEACON.love : BEACON.happy;
    }
    const walk = clamp(this.stride / 80, 0, 1);
    o.dot(0, tip, tone);
    o.dot(1, clamp(0.2 + walk + (a === 'idle' ? 0 : 0.2), 0, 1), tone);
    o.dot(2, clamp(0.15 + walk * 0.8, 0, 1), tone);
    o.dot(3, ears, tone);
    o.dot(4, whisker, tone);
    this.breedLights(time, tone);
  }
}
