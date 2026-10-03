/**
 * Second-order motion, after t3ssel8r's "Giving personality to procedural animations".
 * A value chases its target like a mass on a spring, so every pose change on the
 * robots is animated for free, with follow-through.
 *
 * f is the natural frequency in Hz (how fast it responds), zeta the damping (0 wobbles
 * forever, 1 settles without overshoot), r the initial response (0 eases in, 1 moves
 * at once, above 1 overshoots, below 0 winds up first).
 */
export class Spring {
  y: number;
  v = 0;
  private x: number;
  private k1: number;
  private k2: number;
  private k3: number;

  constructor(f: number, zeta: number, r = 1, start = 0) {
    this.k1 = zeta / (Math.PI * f);
    this.k2 = 1 / (2 * Math.PI * f) ** 2;
    this.k3 = (r * zeta) / (2 * Math.PI * f);
    this.x = this.y = start;
  }

  update(dt: number, target: number): number {
    if (dt <= 0) return this.y;
    const xv = (target - this.x) / dt;
    this.x = target;
    // Clamp k2 so a long frame can't make the spring explode.
    const k2 = Math.max(this.k2, (dt * dt) / 2 + (dt * this.k1) / 2, dt * this.k1);
    this.y += dt * this.v;
    this.v += (dt * (target + this.k3 * xv - this.y - this.k1 * this.v)) / k2;
    return this.y;
  }

  /** Jump straight to a value, at rest. */
  snap(value: number) {
    this.x = this.y = value;
    this.v = 0;
  }

  /** Knock it: adds velocity, as from a bump or a landing. */
  kick(velocity: number) {
    this.v += velocity;
  }
}

/** A tiny smooth noise for idle life (sum of incommensurate sines). */
export function wobble(t: number, seed = 0): number {
  return (
    Math.sin(t * 1.3 + seed * 12.9) * 0.5 +
    Math.sin(t * 2.1 + seed * 4.1) * 0.3 +
    Math.sin(t * 3.7 + seed * 7.7) * 0.2
  );
}
