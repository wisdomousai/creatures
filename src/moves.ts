import type { Puppet } from './puppet';

/** Shared bits of motion for the crew's animals. */

export const sin = (t: number, hz: number, phase = 0) => Math.sin(2 * Math.PI * (hz * t + phase));

/**
 * A four-legged walk: diagonal pairs swing together (front left with back right), so
 * the body stays balanced. gait is the walk cycle in radians, amount 0..1 how hard.
 */
export function trot(p: Puppet, gait: number, amount: number, swing = 28) {
  const a = Math.sin(gait) * swing * amount;
  p.add('leg.FL', a);
  p.add('leg.BR', a);
  p.add('leg.FR', -a);
  p.add('leg.BL', -a);
  p.add('body', 0, 0, Math.cos(gait * 2) * 2 * amount);
  p.add('head', Math.cos(gait * 2) * 3 * amount);
}

/**
 * A tail in several bones swinging side to side, each bone a beat behind the one
 * before. phase is in radians and should be accumulated (not time × rate), so the
 * swing can speed up or slow down without jumping.
 */
export function swish(p: Puppet, bones: string[], phase: number, degrees: number, delay = 0.7) {
  bones.forEach((bone, i) => {
    const s = Math.sin(phase - i * delay) * degrees;
    // The base turns about the up axis; the bones above it sway sideways.
    if (i === 0) p.add(bone, 0, s, 0);
    else p.add(bone, 0, 0, s * 0.8);
  });
}
