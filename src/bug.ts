import { Color } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { Bird, ease, span } from './birds';
import type { Env } from './character';
import { Spring } from './spring';

/**
 * What the robot bugs (bee, butterfly, caterpillar, firefly, beetle) share, for whoever
 * builds the next ones. A bug is a `Bird` (who is near, how to amble a little way along
 * the floor, the poke / three pokes / mouse-resting reactions, the easing helpers) plus:
 *
 *   - antennae (`antenna.L.1`, `antenna.L.2`, `.R.`): `feelers()` poses both, and the tips
 *     change colour with the mood (`tone()`), as the ladybug's do;
 *   - six legs, three a side, two bones each (`leg.L.0` and `foot.L.0` ...): `legs()`
 *     poses them all, `step()` is a tripod gait step, `walkLegs()` the walk;
 *   - a lift off the floor on a spring (`hoverUp`), for those that fly: the bug stays on
 *     its floor and is raised by `h`, like Zip, so nothing about walking changes;
 *   - the models are built by blender/bugkit.py.
 */
export { ease, span };
export const SIDES = [
  ['L', 1],
  ['R', -1],
] as const;
export const DEG = Math.PI / 180;
export const TAU = 2 * Math.PI;

export abstract class Bug extends Bird {
  /** How high the bug hovers (spring, in its own heights), and what it asks for. */
  protected air = new Spring(4, 0.55, 1.4);
  protected up = 0;
  private mood = new Color(BEACON.neutral);
  protected gaitPhase = 0;

  /** Both antennae: `fn(side, k)` for the base (k 1) and the tip (k 2) gives [pitch, yaw, roll]. */
  protected feelers(fn: (side: number, k: number) => [number, number, number]) {
    for (const [sfx, side] of SIDES)
      for (const k of [1, 2]) this.puppet.add(`antenna.${sfx}.${k}`, ...fn(side, k));
  }

  /** Pose a leg: `fwd` swings it forward, `lift` raises it, `foot` swings the lower leg out. */
  protected leg(sfx: string, side: number, k: number, fwd = 0, lift = 0, foot = 0) {
    this.puppet.add(`leg.${sfx}.${k}`, 0, -side * fwd, side * lift);
    this.puppet.add(`foot.${sfx}.${k}`, 0, 0, side * foot);
  }

  /** Pose all six legs: [forward, lift, foot] for each, given its side and pair. */
  protected legs(fn: (side: number, k: number) => number[]) {
    for (const [sfx, side] of SIDES)
      for (let k = 0; k < 3; k++) {
        const [fwd, lift, foot] = fn(side, k);
        this.leg(sfx, side, k, fwd, lift, foot);
      }
  }

  /** A step of one leg in a tripod gait: forward and back by `swing`, lifted by `raise`. */
  protected step(phase: number, side: number, k: number, swing: number, raise: number) {
    const ph = phase + ((k + (side > 0 ? 0 : 1)) % 2) * Math.PI;
    return [
      swing * Math.sin(ph),
      raise * Math.max(0, Math.cos(ph)),
      -side * raise * 0.6 * Math.max(0, Math.cos(ph)),
    ];
  }

  /** The walk, from how fast it is going (0..1 of `fast` px/s): legs and a little body sway. */
  protected walkLegs(fast: number, swing = 16, raise = 24, rate = 7) {
    const moving = Math.min(1, this.stride / fast);
    if (moving < 0.02) return 0;
    this.legs((side, k) => this.step(this.gait * rate, side, k, swing * moving, raise * moving));
    this.puppet.add('body', 0, 0, 2 * Math.sin(this.gait * rate) * moving);
    return moving;
  }

  /** Hover (0 none .. 1) lifts it off the floor by about its own height. */
  protected hoverUp(dt: number, extra = 0) {
    const lift = this.air.update(dt, this.up);
    this.h = Math.max(0, lift) * this.heightPx * 0.8 + extra;
    return Math.min(1, Math.max(0, lift));
  }

  /** The antenna tips glow in the mood's colour (or one an act gives). */
  protected tone(dt: number, env: Env, override?: string | null) {
    const mood = this.role?.face ?? this.acts[this.act]?.face ?? this.expression;
    let target: string;
    if (override) target = override;
    else if (this.act === 'dizzy') target = RAINBOW[Math.floor(env.time * 6) % RAINBOW.length];
    else if (mood === 'asleep') target = Math.sin(env.time * 1.2) > 0 ? '#55554f' : '#8a8a84';
    else target = BEACON[mood] ?? '#f4f4f1';
    this.mood.lerp(new Color(target), Math.min(1, dt * 6));
    this.outfit.beacon(this.mood);
  }
}
