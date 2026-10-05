import type { Object3D } from 'three';
import { BEACON } from './bolt';
import { Bird, ease, type Reaction, span } from './birds';
import { type Act, type Character, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import { Spring } from './spring';

/**
 * Slink, the robot python: a wedge head with a screen face and a forked lit tongue, then a
 * chain of thirteen rounded ring segments tapering to the tail, each with a lit diamond on
 * its back (six lamps in turn, so a light can run down the chain) and a cream oval on each
 * flank. There are no legs: every segment is a bone of its own, all children of the root,
 * and each frame the chain is laid out again from the tail to the head as a run of links,
 * each link turned by a spring-driven yaw and pitch. So whatever shape an act asks for (a
 * slither, a coil, an S, a ring) the chain stays joined and every segment follows the one
 * ahead of it.
 *
 * She slithers in waves; coils into a neat stack with her head on top; rears up into an S and
 * sways with her tongue flicking; flicks her tongue at nothing; looks round like a periscope;
 * lies in a loose C and rattles her tail; chases her own tail round in a ring; sends a
 * light down her chain; naps in a tight coil; and, when someone is near, goes and lays herself
 * loosely round them in a gentle hug (a ring with room to spare, never a squeeze).
 *
 * A poke rears her up with a hiss; three make her wobble dizzily; the mouse resting on her
 * makes her rise and sway.
 */
export const PYTHON_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.3, 0.5],
    [0.7, 0.5],
  ],
  rx: 0.1,
  ry: 0.3,
  line: 0.04,
  mouth: null,
};

const N = 13;
const STEP = 0.072;
const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
/** Where each node (0 the head, 1..N the segments) rests: forward of the middle, and up. */
const AT = Array.from({ length: N + 1 }, (_, k) => (k === 0 ? 0.472 : 0.47 - STEP * k - 0.01));
const UP = Array.from({ length: N + 1 }, (_, k) =>
  k === 0 ? 0.056 : 0.054 * (1 - 0.52 * (k / N) ** 2.4) * 0.9,
);
const BONES = ['head', ...Array.from({ length: N }, (_, k) => `seg.${k + 1}`)];
/** How far a bone's pivot sits from the middle of its part, along the part (m; + is forward). */
const PIVOT = BONES.map((_, k) => (k === 0 ? -0.042 : 0.036));
/** The neck of an S: the pitch (degrees) each link takes to stand the front of her up. */
const RISE = [-12, -4, 18, 46, 72, 86, 84, 66, 36, 12, 0, 0, 0];

export class Python extends Bird {
  static readonly terms =
    'snake serpent reptile slither slithering coil coiled long green cream spots tongue forked hiss rings segments diamonds hug wrap sways legless';

  private yaw = Array.from({ length: N }, (_, k) => new Spring(7 - 3 * (k / N), 0.75));
  private pit = Array.from({ length: N }, (_, k) => new Spring(7 - 3 * (k / N), 0.75));
  private lean = new Spring(2, 0.8);
  // Per-frame requests from acts, cleared in idle().
  private slither = 0;
  private rear = 0;
  private sway = 0;
  private coil = 0;
  private hug = 0;
  private ring = 0;
  private rattle = 0;
  private spin = 0;
  private tongue = 0;
  private flat = 0;
  private lights: ((i: number, t: number) => number) | null = null;
  private way = 1;
  private actSpeed = 0.4;
  private stage = 0;
  private since = 0;
  private mate: Character | null = null;
  private tipCue = 0;
  private spinAng = 0;
  /** How far the crewmate she's hugging is to her right (m), for the middle of her ring. */
  private toMate = 0;

  constructor(model: Object3D) {
    const link = { f: 6, zeta: 0.6 };
    const feels: Record<string, { f: number; zeta: number; r?: number }> & {
      default: { f: number; zeta: number };
    } = {
      default: { f: 5, zeta: 0.6 },
      root: { f: 3, zeta: 0.6 },
      head: { f: 4, zeta: 0.5, r: 0.5 },
    };
    for (let k = 1; k <= N; k++) feels[`seg.${k}`] = link;
    super(
      {
        name: 'Slink',
        model: 'python',
        metres: 0.3,
        width: 1,
        size: 0.55,
        feels,
        face: PYTHON_FACE,
        eyes: 0.45,
        gaze: [{ bone: 'head', yaw: 0.9, pitch: 0.9 }],
        reach: { yaw: 55, pitch: 28 },
        lag: 1.1,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [50, 110],
        speed: 0.4,
        turn: 78,
        roam: true,
      },
      model,
    );
    this.acts = { ...this.moves(), ...this.reactions() };
  }

  private moves(): Record<string, Act> {
    const p = this.puppet;
    const still = () => this.still() && this.state === 'here';
    const fadeK = (t: number) => this.fade(t, 0.9);
    const pick = () => {
      this.way = Math.random() < 0.5 ? 1 : -1;
    };
    return {
      idle: { weight: 3, length: [3, 6] },
      slither: {
        weight: 2.6,
        length: [14, 14],
        when: still,
        start: () => {
          this.actSpeed = 0.4;
          this.amble(1.6 + Math.random() * 1.6);
        },
        pose: (t) => {
          this.actSpeed = 0.4;
          this.slither = 1;
          if (this.there && t > 0.8) this.actLength = Math.min(this.actLength, t + 0.4);
        },
      },
      coil: {
        weight: 1.7,
        length: [11, 13],
        face: 'happy',
        when: still,
        start: pick,
        pose: (t) => {
          // Winds herself into a neat stack, her head up on top, and looks about, tongue out now
          // and then; then unwinds.
          const k = span(t, 0.2, 2.4, this.actLength - 2.4, this.actLength - 0.2);
          this.coil = k;
          this.flat = 0.5 * k;
          p.add('head', 6 * k, 30 * sin(t, 0.18) * k);
          this.tongue = k * (Math.sin(t * 2.3) > 0.9 ? 1 : 0) * (t > 3.5 ? 1 : 0);
          this.lights = (i, s) => 0.4 + 0.5 * Math.max(0, Math.sin(s * 1.6 - i * 1.047));
        },
      },
      sway: {
        weight: 1.8,
        length: [8, 9],
        face: 'happy',
        when: still,
        pose: (t) => {
          // Up in an S like a charmed snake, swaying from side to side, tongue flicking.
          const k = fadeK(t);
          this.rear = 0.85 * k;
          this.sway = 1;
          this.tongue =
            k * Math.max(0, Math.sin(t * 5.5) - 0.2) * (Math.sin(t * 0.9) > 0 ? 1 : 0.3);
          this.lights = (i, s) => 0.15 + 0.85 * Math.max(0, Math.cos(s * 3 - i * 1.047));
        },
      },
      hug: {
        weight: 1.6,
        length: [50, 50],
        face: 'love',
        when: () => still() && this.mates().some((o) => o.stride < 1),
        start: () => {
          pick();
          this.stage = 0;
          this.mate = this.mates().find((o) => o.stride < 1) ?? null;
        },
        pose: (t) => {
          // Goes and lays herself in a loose ring round a crewmate, with room to spare, her
          // head resting up on her own coils; then gently lets go again.
          this.actSpeed = 0.8;
          const m = this.mate;
          const end = () => (this.actLength = Math.min(this.actLength, t + 0.1));
          if (!m) return end();
          if (this.stage === 0) {
            this.slither = 1;
            this.walkTo(m.s, m.depth);
            if (t > 1.5 && this.stride < 1 && Math.abs(m.s - this.s) < this.heightPx * 3.5) {
              this.stage = 1;
              this.since = t;
              this.actLength = t + 8.4;
            } else if (t > 40) end();
            return;
          }
          if (m.stride > 1 || Math.abs(m.s - this.s) > this.heightPx * 3.8) return end();
          const s = t - this.since;
          const k = span(s, 0, 2.4, 5.6, 7.8);
          this.hug = k;
          this.flat = k;
          p.add('head', 4 * k, 14 * sin(s, 0.3) * k);
          this.lights = (i, st) => 0.3 + 0.35 * (0.5 + 0.5 * Math.sin(st * 1.2 - i * 1.047));
        },
      },
      tongue: {
        weight: 1.3,
        length: [4.5, 5],
        face: 'focused',
        when: still,
        pose: (t) => {
          // Flicks her tongue at nothing, head up a little and tilting this way and that.
          const k = fadeK(t);
          this.rear = 0.2 * k;
          this.tongue = k * (Math.sin(t * 7) > 0.3 ? 1 : 0) * (Math.sin(t * 1.3) > -0.4 ? 1 : 0);
          p.add('head', 4 * k, 24 * sin(t, 0.45) * k, 12 * sin(t, 0.6, 0.2) * k);
        },
      },
      peek: {
        weight: 1.2,
        length: [6, 7],
        face: 'surprised',
        when: still,
        pose: (t) => {
          // Straight up like a periscope, turning slowly to look all round.
          const k = fadeK(t);
          this.rear = 1 * k;
          this.tongue = k * (Math.sin(t * 1.9) > 0.8 ? 1 : 0);
          p.add('head', 0, 65 * sin(t, 0.2) * k);
        },
      },
      wave: {
        weight: 1.2,
        length: [4.5, 5],
        face: 'happy',
        when: still,
        pose: (t) => {
          // A light runs down her whole chain, head to tail, again and again, faster each time.
          const k = fadeK(t);
          this.slither = 0.25 * k;
          this.lights = (i, s) => 0.1 + 0.9 * Math.max(0, Math.cos(s * (3 + s * 0.3) - i * 1.047));
          p.add('head', 0, 14 * sin(t, 0.5) * k);
        },
      },
      rattle: {
        weight: 1.1,
        length: [4.5, 5],
        face: 'determined',
        when: still,
        start: pick,
        pose: (t) => {
          // Lies in a loose C and shakes the tip of her tail like a rattlesnake, the end lamps
          // flashing, her head up and watching.
          const k = fadeK(t);
          this.ring = 0.45 * k;
          this.rattle = k;
          this.rear = 0.12 * k;
          this.lights = (i) => (Math.sin(t * 24 - i * 0.6) > 0 ? 1 : 0.15);
          p.add('head', -6 * k, 8 * sin(t, 0.4) * k);
        },
      },
      chase: {
        weight: 0.9,
        length: [8, 9],
        face: 'happy',
        when: still,
        start: pick,
        pose: (t) => {
          // Chases her own tail: a ring that turns round and round, head after tail.
          const k = span(t, 0.2, 1.8, this.actLength - 1.8, this.actLength - 0.2);
          this.ring = k;
          this.flat = k;
          this.spin = k * (t < 3 ? ease(t, 0, 3) : 1) * 1.4;
          this.lights = (i, s) => 0.15 + 0.85 * Math.max(0, Math.cos(s * 5 - i * 1.047));
        },
      },
      nap: {
        weight: 0.9,
        length: [10, 14],
        when: still,
        start: pick,
        pose: (t) => {
          // Curled in a tight coil, head tucked down on top, the lamps nearly out.
          const k = span(t, 1.2, 3, this.actLength - 2.4, this.actLength - 0.6);
          this.coil = k;
          this.flat = k;
          p.add('head', 34 * k);
          this.expression = k > 0.4 ? 'asleep' : 'sleepy';
          this.lights = (i, s) => 0.08 + 0.1 * (0.5 + 0.5 * Math.sin(s * 1.1 - i * 0.5));
        },
      },
      stretch: {
        weight: 0.9,
        length: [5, 6],
        face: 'sleepy',
        when: still,
        pose: (t) => {
          // A long lazy stretch out straight, a ripple running down her, and a yawn of the tongue.
          const k = span(t, 0.4, 1.4, 3.8, 5);
          this.slither = 0.3 * k;
          this.rear = 0.15 * k;
          this.tongue = k * (Math.sin(t * 6) > 0.5 && t > 2 ? 1 : 0);
          p.add('head', -8 * k);
        },
      },
    };
  }

  protected react(kind: Reaction, t: number) {
    const p = this.puppet;
    if (kind === 'poked') {
      // Rears straight up with a hiss, tongue out, lamps flaring; then slides back down.
      const k = span(t, 0, 0.18, 0.8, 1.7);
      this.rear = 0.9 * k;
      this.tongue = k * (Math.sin(t * 16) > -0.2 ? 1 : 0);
      this.lights = () => (t < 0.5 ? 1 : 0.2);
      p.add('head', -10 * k);
    } else if (kind === 'dizzy') {
      const k = 1 - ease(t, 2.4, 3.4);
      this.rear = 0.5 * k;
      this.slither = 0.6 * k;
      this.tipCue = k;
      p.add('head', 10 * k * Math.cos(t * 5), 28 * k * Math.sin(t * 3), 24 * k * Math.sin(t * 5));
      this.lights = () => (Math.random() < 0.5 ? 1 : 0.15);
    } else {
      // Rises up and sways gently, the lamps glowing.
      const k = this.fade(t, 0.9);
      this.rear = 0.7 * k;
      this.sway = 0.7;
      this.tongue = k * (Math.sin(t * 4) > 0.5 ? 1 : 0);
      this.lights = (i, s) => 0.55 + 0.4 * Math.sin(s * 3 - i * 1.047);
    }
  }

  protected idle(t: number) {
    const p = this.puppet;
    this.slither = 0;
    this.rear = 0;
    this.sway = 0;
    this.coil = 0;
    this.hug = 0;
    this.ring = 0;
    this.rattle = 0;
    this.spin = 0;
    this.tongue = 0;
    this.flat = 0;
    this.tipCue = 0;
    this.lights = null;
    this.actSpeed = 0.4;
    this.expression = this.hovered ? 'happy' : 'neutral';
    p.add('head', 3 * sin(t, 0.35), 8 * sin(t, 0.12));
    this.tongue = Math.sin(t * 0.7) > 0.985 ? 1 : 0;
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    this.env = env;
    this.spec.speed = this.actSpeed;
    this.enjoy(dt, this.still());
    const t = env.time;
    const moving = clamp(this.stride / (this.heightPx * 0.2), 0, 1);
    const glide = Math.max(this.slither, moving);
    const rear = this.rear || (this.hovered && this.act === 'idle' ? 0.4 : 0);
    const loose = 1 - Math.min(1, this.coil + this.hug + this.ring);
    const phase = this.gait * 0.9 + (moving > 0.02 ? 0 : t * 0.7);
    const sgn = this.way;
    const near = this.mate && this.act === 'hug' ? this.mate : null;
    this.toMate = near
      ? clamp(((near.s - this.s) * this.spec.metres) / this.heightPx, -0.5, 0.5)
      : 0;
    // Aim every link: the yaw and pitch it should take, then let its spring have it.
    const yawA: number[] = [];
    const pitA: number[] = [];
    const turnA: number[] = [];
    for (let k = 0; k < N; k++) {
      const u = k / (N - 1);
      let yaw = 0;
      let pit = 0;
      // A resting wave, always a little, and a slither on top.
      yaw += loose * 0.1 * Math.sin(0.55 * k - t * 0.6);
      yaw += loose * glide * 0.95 * (0.6 + 0.4 * u) * Math.sin(0.62 * k - phase);
      // The S: the neck stands up; she sways her top half from side to side.
      pit += rear * RISE[k];
      yaw += rear * this.sway * 0.3 * Math.sin(t * 0.8 - k * 0.35) * (1 - u);
      yaw += rear * 0.08 * Math.sin(t * 0.5 - k * 0.5);
      // A tight coil: a helix, a bead's width of rise a turn, the last links straightening.
      const head = k === 0 ? 0.1 : k === 1 ? 0.45 : 1;
      let bend = sgn * this.coil * 0.62 * head;
      pit += this.coil * (k < 2 ? 8 + 14 * (1 - k) : 9);
      // A loose ring round someone: a wide, flat arc, her head resting up a little.
      bend += sgn * this.hug * 0.36 * (k === 0 ? 0.5 : 1);
      pit += this.hug * (k < 2 ? 12 : 0);
      // A full ring, for chasing her tail.
      bend += sgn * this.ring * (TAU / N) * (k === 0 ? 0.4 : 1);
      turnA.push(bend);
      yawA.push(yaw);
      pitA.push(pit);
    }
    // The bends add up from the tail: a link's heading is every turn behind it, plus its own.
    let sum = 0;
    for (let k = N - 1; k >= 0; k--) {
      sum += turnA[k];
      yawA[k] += sum;
    }
    const yaws = yawA.map((a, k) => this.yaw[k].update(dt, a));
    const pits = pitA.map((a, k) => this.pit[k].update(dt, a));
    // Lay the chain out from the tail up to the head, link by link.
    this.spinAng += dt * this.spin * 1.6 * sgn;
    const spin = this.spinAng;
    const pos: [number, number, number][] = Array.from({ length: N + 1 }, () => [0, 0, 0]);
    const dir: [number, number, number][] = Array.from({ length: N + 1 }, () => [0, 0, 1]);
    const heading = (k: number): [number, number, number, number] => {
      const shake =
        this.rattle * 0.9 * Math.sin(t * 38) * clamp((k - (N - 6)) / 5, 0, 1) +
        this.tipCue * 0.3 * Math.sin(t * 9 - k);
      const yw = yaws[k] + shake + spin;
      const pt = pits[k] * DEG;
      return [Math.sin(yw) * Math.cos(pt), Math.sin(pt), Math.cos(yw) * Math.cos(pt), yw];
    };
    pos[N] = [0, UP[N], 0];
    for (let k = N - 1; k >= 0; k--) {
      const h = heading(k);
      const d = AT[k] - AT[k + 1];
      pos[k] = [
        pos[k + 1][0] + d * h[0],
        Math.max(UP[k], pos[k + 1][1] + d * h[1]),
        pos[k + 1][2] + d * h[2],
      ];
      dir[k] = [h[0], h[1], h[2]];
    }
    // The middle of the chain stays on her spot (her own, or, in a hug, the ring's middle).
    let mx = 0;
    let mz = 0;
    for (const q of pos) {
      mx += q[0] / (N + 1);
      mz += q[2] / (N + 1);
    }
    if (this.hug > 0.01) {
      const j = 6;
      const yw = heading(j)[3];
      const R = STEP / (0.36 + 1e-6);
      const cx = pos[j][0] + sgn * R * Math.cos(yw);
      const cz = pos[j][2] - sgn * R * Math.sin(yw);
      mx += (cx - this.toMate - mx) * this.hug;
      mz += (cz - mz) * this.hug;
    }
    for (let k = 0; k <= N; k++) {
      // The node's direction: between the links either side of it.
      const a = dir[Math.max(0, k - 1)];
      const b = dir[Math.min(N - 1, k)];
      const dx = a[0] + b[0];
      const dy = a[1] + b[1];
      const dz = a[2] + b[2];
      const len = Math.hypot(dx, dy, dz) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const uz = dz / len;
      const c = PIVOT[k];
      const q = pos[k];
      p.shift(
        BONES[k],
        q[0] - mx + c * ux,
        q[1] - UP[k] + c * uy,
        q[2] - mz + c * uz - (AT[k] + c),
      );
      this.turnTo[k] = [-Math.asin(clamp(uy, -1, 1)) / DEG, Math.atan2(ux, uz) / DEG];
    }
    // Turned toward the middle of her edge so her length shows; head-on for the ring shapes.
    const [lo, hi] = this.span(env.frame);
    const aside =
      Math.sign((lo + hi) / 2 - this.s) * (this.edge === 'bottom' || this.edge === 'left' ? 1 : -1);
    const round = clamp(this.coil + this.hug + this.ring, 0, 1);
    const shown = (moving > 0.02 ? 0.4 : 1) * (1 - 0.85 * round);
    const turn = this.lean.update(dt, aside * 52 * shown);
    p.add('root', 0, turn);
    p.add('head', 0, -turn * 0.55);
  }

  private turnTo: [number, number][] = Array.from({ length: N + 1 }, () => [0, 0]);

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    const t = env.time;
    // Each bead lies along the chain; the tongue flicks out of nothing.
    for (let k = 0; k <= N; k++) p.turn(BONES[k], this.turnTo[k][0], this.turnTo[k][1]);
    const tg = Math.max(0.001, clamp(this.tongue, 0, 1));
    p.stretch('tongue', tg, [0, 0, 1], Math.max(0.001, tg));
    this.light(t);
    this.outfit.beacon(BEACON[this.expression] ?? '#f4f4f1');
    void dt;
  }

  /** The diamonds down her back, and the tongue. */
  private light(t: number) {
    const asleep = this.expression === 'asleep';
    for (let i = 0; i < 6; i++) {
      let level: number;
      if (this.act === 'dizzy') level = Math.random() < 0.5 ? 1 : 0.2;
      else if (this.lights) level = this.lights(i, t);
      else level = 0.35 + 0.35 * Math.sin(t * 1.2 - i * 1.047);
      if (this.hovered && this.act === 'idle') level = 0.5 + 0.5 * Math.sin(t * 4 - i * 1.047);
      this.outfit.dot(i, clamp(asleep ? level * 0.5 : level, 0, 1));
    }
    this.outfit.dot(6, 0.6 + 0.4 * Math.sin(t * 9));
  }
}
