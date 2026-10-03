import { BEACON } from './bolt';
import type { Expression } from './face';
import { type Act, clamp } from './character';
import type { Outfit } from './looks';
import type { Anatomy, Mood } from './pet';
import type { Feel } from './puppet';
import { KITTEN_ACT_MOODS, kittenMoods } from './kitties';

/**
 * What the cat breeds (Suki, Moose, Ember, Pearl and Pudding) share on top of the
 * kittens' library in kitties.ts: a mood table for a grown cat (tails and ears a little
 * calmer than a kitten's), the joint springs for a tail of any length (`stiff` below 1
 * makes an old cat's slower), and the lines that stock a breed's acts and light its
 * model: Dot0 the tail tip, Dot2 the paw pads, Dot3 the ear hinges, Dot4 the whisker tips.
 */

/** A grown cat's moods: the kitten table, with the tail carried a touch lower and slower. */
export function adultMoods(carriage = 0, calm = 1): Anatomy['moods'] {
  const m = kittenMoods();
  for (const f of Object.values(m)) {
    f.carriage += carriage;
    if (f.bob) f.bob = [f.bob[0] * calm, f.bob[1] * calm];
    if (f.flicks) f.flicks *= calm;
  }
  m.annoyed.face = 'cross';
  return m;
}

export const CAT_ACT_MOODS: Record<string, Mood> = KITTEN_ACT_MOODS;

/** Joint springs for a cat with `tails` tail bones. */
export function feels(
  tails: number,
  stiff = 1,
  head = 2,
): Record<string, Feel> & { default: Feel } {
  const out: Record<string, Feel> = {
    default: { f: 2.4 * stiff, zeta: 0.5 },
    root: { f: 3 * stiff, zeta: 0.55 },
    body: { f: 2 * stiff, zeta: 0.6 },
    head: { f: head * stiff, zeta: 0.5, r: 0.3 },
    'ear.L': { f: 4 * stiff, zeta: 0.25 },
    'ear.R': { f: 4 * stiff, zeta: 0.25 },
  };
  for (let i = 1; i <= tails; i++) {
    out[`tail.${i}`] = { f: (1.8 + (0.9 * i) / tails) * stiff, zeta: 0.45 - (0.15 * i) / tails };
  }
  return out as Record<string, Feel> & { default: Feel };
}

/** The acts every one of them has: the pet's own, plus the kitten tricks it picks by name. */
export function stock(
  acts: Record<string, Act>,
  common: Record<string, Act>,
  all: Record<string, Act>,
  mine: Record<string, number>,
  lie = 0.8,
) {
  for (const k of ['idle', 'stroll', 'sit', 'nap', 'stand', 'stretch', 'startle'] as const) {
    acts[k] = common[k];
  }
  acts.lie = { ...common.lie, weight: lie };
  for (const [name, weight] of Object.entries(mine)) acts[name] = { ...all[name], weight };
  acts.dizzy = all.dizzy;
  acts.purr = all.purr;
}

/** The little lights, in the colour of the mood. */
export function lights(o: Outfit | undefined, expression: string, stride: number) {
  if (!o) return;
  const tone = BEACON[expression as Expression] ?? undefined;
  const now = performance.now() / 1000;
  const alert = expression === 'surprised' || expression === 'focused';
  o.dot(0, 0.5 + 0.4 * Math.sin(now * 2.2), tone);
  o.dot(2, clamp(0.15 + stride / 80, 0, 1), tone);
  o.dot(3, alert ? 1 : 0.25, tone);
  o.dot(4, expression === 'happy' || expression === 'love' ? 1 : 0.2, tone);
}
