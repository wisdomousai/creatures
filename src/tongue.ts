import { type Object3D, Quaternion, Vector3 } from 'three';
import type { Puppet } from './puppet';

/**
 * The chameleons' tongue and the fly it catches (blender/chamkit.py): a chain of seven
 * telescoping sleeves tg.1-7, each a child of the one before, ending in a sticky pad (tg.tip),
 * and a tiny robot fly (fly, flywing.L/R) that waits hidden in the body.
 *
 * The chain is built fully out. To shorten it the whole chain is scaled along its length
 * through its first bone (so the sleeves nest like a telescope and, at nothing, the pad sits
 * inside the head and everything is hidden); to aim it, the first bone turns toward the
 * target and every joint after it bends a little, so the tongue is a circular arc that starts
 * out of the snout and ends with the pad on the target (a fly dead ahead is a straight line,
 * a turret eye round the side is a hook). Everything is direct: the tongue is a function of
 * the act's own time, not of a spring, so a shot as quick as a tenth of a second is never
 * skipped at a low frame rate.
 *
 * Space: the creature's own, in the model's metres (+X its left, +Y up, +Z ahead), with the
 * origin on the floor under it; the root's turn (it stands side-on) carries it round.
 */
export type Pt = [number, number, number];

const N = 7;
const BONES = Array.from({ length: N }, (_, i) => `tg.${i + 1}`);
const ALL = [...BONES, 'tg.tip'];
const DEG = Math.PI / 180;
const Z: Pt = [0, 0, 1];
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export interface FlyWant {
  /** Where it is in the creature's space, when it is flying about free. */
  at: Pt;
  /** How big (1 is its own size; 0 is hidden). */
  size: number;
  /** Which way it points: yaw, pitch, roll (degrees). */
  turn?: Pt;
  /** How hard its wings beat (0..1). */
  buzz?: number;
  /** Stuck to the tongue's pad (0..1), or held at a spot on the head (the nose, say). */
  onPad?: number;
  onHead?: { at: Pt; k: number };
}

export interface TongueWant {
  /** How far it is out: 0 in, 1 on its target, over 1 stretched. */
  tongue: number;
  /** With nothing to aim at: how much of its full length it goes out (0..1). */
  len: number;
  /**
   * What it aims at. `at` is in the creature's space, or, for a spot on the head (its own
   * horn, a turret), the model's own rest coordinates. `hold` pins it where it is in the
   * world (the pad is stuck there while the body leans away).
   */
  target: { at: Pt; head?: boolean; hold?: boolean } | null;
  /** Keep the aim and reach it had when this turned on, whatever the target does now. */
  lock: boolean;
  /** The pad's impact, 1 when it lands and dying away (squashes it, flares its ring). */
  hit: number;
  /** The wobble in the sleeves as it whips back: how much (0..1) and seconds since it began. */
  wob: number;
  wobT: number;
  /** Looping the tip: how much (0..1) and the act's time. */
  twirl: number;
  twirlT: number;
  /** Pulled taut (0..1): the sleeves thin. */
  taut: number;
  fly: FlyWant | null;
}

export const freshTongue = (): TongueWant => ({
  tongue: 0,
  len: 1,
  target: null,
  lock: false,
  hit: 0,
  wob: 0,
  wobT: 0,
  twirl: 0,
  twirlT: 0,
  taut: 0,
  fly: null,
});

const a = new Vector3();
const b = new Vector3();
const c = new Vector3();

export class Tongue {
  /** Where the sleeves start (inside the back of the head), at rest, in the model's space. */
  readonly origin: Vector3;
  /** How far ahead of that the snout is, and the tongue's full length beyond it. */
  readonly snout: number;
  readonly reach: number;
  /** The creature's own centre of the head (rest). */
  readonly headAt: Vector3;
  readonly eyes: { L: Vector3; R: Vector3 };
  private qHead: Quaternion;
  private qHeadInv: Quaternion;
  private qRootInv: Quaternion;
  private qTip: Quaternion;
  private rootAt: Vector3;
  private flyAt: Vector3;
  private spRest: number;
  private padLen: number;
  private held: Vector3 | null = null;
  private lockedAim: { beta: number; d: number; nx: number; ny: number; sp: number } | null = null;
  /** The last solved aim (what a lock keeps), and what it was in the end. */
  last = { beta: 0, d: 0, nx: 0, ny: 1, sp: 0.07 };

  constructor(
    private p: Puppet,
    private model: Object3D,
    reach: number,
    pad: number,
  ) {
    model.updateMatrixWorld(true);
    const inv = model.getWorldQuaternion(new Quaternion()).invert();
    const at = (n: string) => model.worldToLocal(p.bone(n).getWorldPosition(new Vector3()));
    const turn = (n: string) =>
      inv.clone().multiply(p.bone(n).getWorldQuaternion(new Quaternion()));
    this.qHead = turn('head');
    this.qHeadInv = this.qHead.clone().invert();
    this.qRootInv = turn('root').invert();
    this.qTip = turn('tg.tip');
    this.rootAt = at('root');
    this.headAt = at('head');
    this.origin = at('tg.1');
    this.flyAt = at('fly');
    this.eyes = { L: at('eye.L'), R: at('eye.R') };
    this.spRest = at('tg.2').distanceTo(this.origin);
    this.padLen = pad * 1.15;
    this.reach = reach;
    this.snout = N * this.spRest - reach + this.padLen;
  }

  /** A point this share of the tongue's length beyond the snout, level with the mouth, in the creature's space. */
  ahead(share: number, up = 0): Pt {
    return [this.origin.x, this.origin.y + up, this.origin.z + this.snout + share * this.reach];
  }

  /** The creature's-space point as a world position. */
  private toWorld(pt: Pt, out: Vector3) {
    out
      .set(pt[0] - this.rootAt.x, pt[1] - this.rootAt.y, pt[2] - this.rootAt.z)
      .applyQuaternion(this.qRootInv);
    return this.p.bone('root').localToWorld(out);
  }

  /**
   * How much each joint bends, 0..1: nothing inside the head (the sleeves there are hidden, and
   * an arc would only poke through the shell), all of it from a little beyond the snout.
   */
  private bendWeights(sp: number) {
    return Array.from({ length: N + 1 }, (_, i) =>
      i === 0 ? 0 : clamp((i * sp - (this.snout - 0.02)) / 0.05, 0, 1),
    );
  }

  /** The arc: tangent turn at the first bone, bend at every joint after, spacing. */
  private solve(rel: Vector3, spMin: number, spMax: number) {
    const dist = Math.max(rel.length(), 0.02);
    const alpha = Math.acos(clamp(rel.z / dist, -1, 1));
    let wx = rel.x;
    let wy = rel.y;
    const wl = Math.hypot(wx, wy);
    if (wl < 1e-5) [wx, wy] = [0, 1];
    else [wx, wy] = [wx / wl, wy / wl];
    const beta = Math.min(alpha, 0.35);
    const tz = dist * Math.cos(alpha);
    const tx = dist * Math.sin(alpha);
    const pl = this.padLen;
    let sp = this.spRest * 0.7;
    let d = 0;
    for (let pass = 0; pass < 3; pass++) {
      const wts = this.bendWeights(sp);
      // The angle of each segment is beta plus d times the bends so far.
      const cum: number[] = [];
      let run = 0;
      wts.forEach((x, i) => cum.push((run += x)));
      const ends = (dd: number) => {
        let az = 0;
        let ax = 0;
        for (let j = 0; j < N; j++) {
          az += Math.cos(beta + dd * cum[j]);
          ax += Math.sin(beta + dd * cum[j]);
        }
        const e = beta + dd * cum[N];
        return [az, ax, Math.cos(e), Math.sin(e)] as const;
      };
      const miss = (dd: number) => {
        const [az, ax, ez, ex] = ends(dd);
        return Math.atan2(tx - pl * ex, tz - pl * ez) - Math.atan2(ax, az);
      };
      d = 0;
      if (alpha > beta + 1e-4 && cum[N] > 0.01 && miss(0) > 0) {
        let lo = 0;
        let hi = 3 / Math.max(cum[N], 0.5);
        if (miss(hi) > 0) d = hi;
        else {
          for (let i = 0; i < 24; i++) {
            const mid = (lo + hi) / 2;
            if (miss(mid) > 0) lo = mid;
            else hi = mid;
          }
          d = (lo + hi) / 2;
        }
      }
      const [az, ax, ez, ex] = ends(d);
      sp = clamp(Math.hypot(tz - pl * ez, tx - pl * ex) / Math.hypot(az, ax), spMin, spMax);
    }
    return { beta, d, nx: -wy, ny: wx, sp };
  }

  /** Pose the tongue and the fly for this frame. `time` is the clock for the wings. */
  frame(w: TongueWant, time: number) {
    const p = this.p;
    const model = this.model;
    const k = clamp(w.tongue, 0, 3);
    const fly = w.fly;

    // The free fly first: it only needs the root's turn.
    if (fly && fly.size > 0.01) {
      p.shift('fly', fly.at[0] - this.flyAt.x, fly.at[1] - this.flyAt.y, fly.at[2] - this.flyAt.z);
      p.stretch('fly', fly.size, Z, fly.size);
      const [yaw, pitch, roll] = fly.turn ?? [0, 0, 0];
      p.turn('fly', pitch, yaw, roll);
      const flap = 38 * (fly.buzz ?? 1) * Math.sin(time * 58);
      p.turn('flywing.L', 0, 0, flap);
      p.turn('flywing.R', 0, 0, -flap);
    } else p.stretch('fly', 0.001, Z, 0.001);

    const visible = k > 0.004;
    if (!visible) {
      p.stretch('tg.1', 0.001, Z, 0.001);
      this.held = null;
      this.lockedAim = null;
    }
    const attached = !!fly && fly.size > 0.01 && ((fly.onPad ?? 0) > 0 || (fly.onHead?.k ?? 0) > 0);
    if (!visible && !attached) return;

    model.updateMatrixWorld(true);
    if (visible) {
      // Where the target is, from the first sleeve's start, in the head's own (rest-aligned) axes.
      const head = p.bone('head');
      const t = w.target;
      const rel = c;
      if (!t) rel.set(0, 0, this.snout + w.len * this.reach);
      else if (t.head) rel.set(t.at[0], t.at[1], t.at[2]).sub(this.origin);
      else {
        if (t.hold) {
          if (!this.held) this.held = model.worldToLocal(this.toWorld(t.at, a)).clone();
          model.localToWorld(b.copy(this.held));
        } else {
          this.held = null;
          this.toWorld(t.at, b);
        }
        head.worldToLocal(b).applyQuaternion(this.qHead);
        rel.copy(b).add(this.headAt).sub(this.origin);
      }
      if (!w.target?.hold) this.held = null;
      const spMax = this.spRest * 1.16;
      let aim = this.solve(rel, this.spRest * 0.05, spMax);
      if (w.lock) aim = this.lockedAim ??= aim;
      else this.lockedAim = null;
      this.last = aim;
      const spC = Math.max(this.snout - 0.01 - this.padLen, 0.02) / N;
      const sp = Math.max(spC + (aim.sp - spC) * k, 0.002);
      const f = Math.max(sp / this.spRest, 0.02);
      const taper = 1 - 0.16 * w.taut;
      p.stretch('tg.1', f, Z, taper);
      p.stretch('tg.tip', Math.max(1 - 0.38 * w.hit, 0.3) / f, Z, 1 + 0.32 * w.hit);
      const grow = Math.min(k, 1);
      const wts = this.bendWeights(sp);
      ALL.forEach((bone, i) => {
        let pitch = 0;
        let yaw = 0;
        const bend = i === 0 ? aim.beta : aim.d * grow * wts[i];
        pitch += (bend * aim.nx) / DEG;
        yaw += (bend * aim.ny) / DEG;
        const u = (i + 1) / ALL.length;
        // Whipping back: a travelling bend, bigger toward the tip.
        const sway = 15 * w.wob * Math.sin(2 * Math.PI * 3.1 * w.wobT - i * 0.85) * u;
        pitch += sway;
        yaw += 0.35 * sway * Math.cos(2 * Math.PI * 3.1 * w.wobT - i * 0.85);
        // Twirling the tip: a bend that turns round and round, travelling out.
        if (w.twirl > 0 && i >= 2) {
          const ph = 2 * Math.PI * 2.1 * w.twirlT - i * 0.55;
          const m = (w.twirl * 13 * (i - 1)) / 6;
          pitch += m * Math.cos(ph);
          yaw += m * Math.sin(ph);
        }
        p.turn(bone, pitch, yaw, 0);
      });
    }

    // The fly, where it clings: the pad, or a spot on the head.
    if (attached && fly) {
      const fb = p.bone('fly');
      model.updateMatrixWorld(true);
      if ((fly.onPad ?? 0) > 0) {
        const tip = p.bone('tg.tip');
        a.set(0, 0.012, this.padLen * 1.45).applyQuaternion(this.qTip.clone().invert());
        tip.localToWorld(a);
        fb.parent!.worldToLocal(a);
        fb.position.lerp(a, clamp(fly.onPad ?? 0, 0, 1));
      }
      const oh = fly.onHead;
      if (oh && oh.k > 0) {
        const head = p.bone('head');
        a.set(oh.at[0], oh.at[1], oh.at[2]).sub(this.headAt).applyQuaternion(this.qHeadInv);
        head.localToWorld(a);
        fb.parent!.worldToLocal(a);
        fb.position.lerp(a, clamp(oh.k, 0, 1));
      }
    }
  }
}
