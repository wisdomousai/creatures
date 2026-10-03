import { type Act, Character, clamp, type Env } from './character';

/**
 * What the newer birds (hummingbird, flamingo, toucan, robin, hen) share: who is near, how
 * to amble a little way along the floor, the same three reactions (a poke, three pokes,
 * the mouse resting on them), and a few easing helpers. Each bird says in `react` what
 * those look like on its own body; everything else is its own file.
 */
export const ease = (t: number, a: number, b: number) => {
  const u = clamp((t - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
};
/** Fades in over a..b, holds, and fades out over c..d. */
export const span = (t: number, a: number, b: number, c: number, d: number) =>
  ease(t, a, b) * (1 - ease(t, c, d));
export const pulse = (t: number, every: number, on: number) => (t % every < on ? 1 : 0);

export type Reaction = 'poked' | 'dizzy' | 'pleased';

export abstract class Bird extends Character {
  protected env: Env | null = null;
  protected pokes: number[] = [];
  private hoverFor = 0;

  protected mates() {
    return (this.env?.crew ?? [])
      .filter((o) => o !== this && o.state === 'here' && o.edge === this.edge && !o.free)
      .sort((a, b) => Math.abs(a.s - this.s) - Math.abs(b.s - this.s))
      .filter((o) => Math.abs(o.s - this.s) < this.heightPx * 12);
  }

  /** On the floor, not walking, free to do something. */
  protected still = () => !this.walking && !this.door && !this.free && this.edge === 'bottom';

  protected room(): [number, number] {
    if (!this.env) return [1, 0];
    const [lo, hi] = this.span(this.env.frame);
    const way = this.s - lo > hi - this.s ? -1 : 1;
    return [way, (way > 0 ? hi - this.s : this.s - lo) - this.widthPx() * 1.2];
  }

  /** Walk `heights` of its own height along the floor, mostly the way with more room. */
  protected amble(heights: number, depth?: number, way?: number) {
    const [more, room] = this.room();
    const w = way ?? (Math.random() < 0.7 ? more : -more);
    const far = Math.min(Math.max(room, 0), this.heightPx * heights);
    this.walkTo(this.s + w * Math.max(far, this.heightPx * 0.6), depth);
  }

  /** 0..1 over an act: eases in and out at its ends. */
  protected fade(t: number, e = 0.5) {
    return ease(t, 0, e) * (1 - ease(t, this.actLength - e, this.actLength));
  }

  /** Which way (+1 along +s) a crewmate is from here. */
  protected toward(m: Character) {
    return Math.sign(m.s - this.s) || 1;
  }

  /** How this bird shows a reaction, `t` seconds in. */
  protected abstract react(kind: Reaction, t: number): void;

  protected reactions(): Record<string, Act> {
    return {
      poked: {
        weight: 0,
        length: [1.8, 2],
        face: 'surprised',
        pose: (t) => this.react('poked', t),
      },
      dizzy: {
        weight: 0,
        length: [3.4, 3.8],
        face: 'dizzy',
        pose: (t) => this.react('dizzy', t),
      },
      pleased: {
        weight: 0,
        length: [3, 4],
        face: 'love',
        pose: (t) => this.react('pleased', t),
      },
    };
  }

  poke() {
    if (this.state !== 'here') return;
    const now = performance.now() / 1000;
    this.pokes = [...this.pokes.filter((at) => now - at < 2.5), now];
    this.goal = null;
    if (this.pokes.length >= 3) {
      this.pokes = [];
      this.setAct('dizzy');
    } else if (this.act !== 'dizzy') this.setAct('poked');
  }

  /** Call from pose(): the mouse resting on it for a while makes it pleased. */
  protected enjoy(dt: number, ok = true) {
    this.hoverFor = this.hovered ? this.hoverFor + dt : 0;
    if (this.hoverFor > 0.9 && this.act === 'idle' && ok && !this.role) this.setAct('pleased');
  }
}
