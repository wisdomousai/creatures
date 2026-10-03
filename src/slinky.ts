import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { Bird, ease, type Reaction, span } from './birds';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import { Spring, wobble } from './spring';
import { DEG, fixed, TAU } from './toybot';

/**
 * Tumble, the robot slinky: nine chunky flat rings (each its own bone, with a lit pip on
 * its front) between a foot cap and a head cap with a screen face and a beacon knob, and
 * two stubby arms under the chin. The site spaces the rings along a curve between the two
 * caps, so the stack stretches tall to peek over things, squashes flat and boings back,
 * sways like jelly, runs a compression pulse up and down, coils into a corkscrew, and
 * walks the way a slinky goes down stairs: the head cap arcs over and lands ahead, then
 * the foot cap lifts and flows after, the rings tumbling end over end.
 *
 * `body` is a bone without a mesh: the directed poses of the play scenes bend it, and its
 * bend leans the whole stack, so a bow or a cheer works.
 *
 * A poke squashes him flat and he boings back up with his arms flung high; three pokes make
 * him a wobbling mess; the mouse resting on him makes him stretch up happily.
 */
export const SLINKY_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.3, 0.45],
    [0.7, 0.45],
  ],
  rx: 0.09,
  ry: 0.26,
  line: 0.034,
  mouth: [0.5, 0.77],
};

const RINGS = 9;
const PITCH = 0.062;
const BASE_TOP = 0.052;
const HEAD_HALF = 0.085;
const RING_THICK = 0.036;
const STACK = RINGS * PITCH;
/** How far one tumble step carries him (metres of model). */
const STRIDE = 0.32;
/** A circular arc of length L from S to E (in the y-z plane), bowing upward; straight when taut. */
function arcCurve(S: V, E: V, L: number): (u: number) => V {
  const dy = E.y - S.y;
  const dz = E.z - S.z;
  const c = Math.hypot(dy, dz);
  if (c >= L * 0.999) return (u) => ({ x: 0, y: S.y + dy * u, z: S.z + dz * u });
  const r = c / L;
  let lo = 1e-4;
  let hi = Math.PI * 0.98;
  for (let i = 0; i < 30; i++) {
    const m = (lo + hi) / 2;
    if (Math.sin(m) / m > r) lo = m;
    else hi = m;
  }
  const phi = (lo + hi) / 2;
  const R = L / (2 * phi);
  const d = { y: dy / c, z: dz / c };
  let n = { y: d.z, z: -d.y };
  if (n.y < 0) n = { y: -n.y, z: -n.z };
  return (u) => {
    const t = (u - 0.5) * 2 * phi;
    const along = R * Math.sin(t) + c / 2;
    const off = R * (Math.cos(t) - Math.cos(phi));
    return { x: 0, y: S.y + d.y * along + n.y * off, z: S.z + d.z * along + n.z * off };
  };
}

const sm = (x: number) => {
  const u = clamp(x, 0, 1);
  return u * u * (3 - 2 * u);
};

interface V {
  x: number;
  y: number;
  z: number;
}

export class Slinky extends Bird {
  private extS = new Spring(3, 0.17, 1.2, 1);
  private leanF = new Spring(2.4, 0.4, 1, 0);
  private leanS = new Spring(2.4, 0.4, 1, 0);
  private swayG = new Spring(2, 0.9, 1, 1);
  private twistS = new Spring(2.2, 0.7, 1, 0);
  // Per-frame requests from the acts, cleared in idle().
  private ext = 1;
  private lean: [number, number] = [0, 0];
  private sway = 1;
  private pulse = 0;
  private twist = 0;
  private hula = 0;
  private hop = 0;
  private spinTo = 0;
  private arms: [number, number] = [0, 0];
  private armWave: [number, number] = [0, 0];
  private headTilt: [number, number, number] = [0, 0, 0];
  private glow: ((i: number, t: number) => number) | null = null;
  private phi = 0;
  private lastHop = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Tumble',
        model: 'slinky',
        metres: 0.81,
        width: 0.34,
        size: 1.1,
        feels: {
          default: { f: 4, zeta: 0.6 },
          root: { f: 4, zeta: 0.5 },
          body: { f: 3.2, zeta: 0.5 },
          head: { f: 4, zeta: 0.35, r: 0.6 },
          'upper_arm.L': { f: 5, zeta: 0.4 },
          'upper_arm.R': { f: 5, zeta: 0.4 },
          'forearm.L': { f: 6, zeta: 0.3 },
          'forearm.R': { f: 6, zeta: 0.3 },
          'hand.L': { f: 7, zeta: 0.3 },
          'hand.R': { f: 7, zeta: 0.3 },
        },
        face: SLINKY_FACE,
        eyes: 0.86,
        gaze: [{ bone: 'head', yaw: 0.9, pitch: 0.9 }],
        reach: { yaw: 55, pitch: 28 },
        lag: 1.5,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 0.7,
        turn: 70,
      },
      model,
    );
    this.acts = { ...this.moves(), ...this.reactions() };
  }

  private moves(): Record<string, Act> {
    const still = () => this.still() && this.state === 'here';
    return {
      idle: { weight: 3, length: [3, 6] },
      tumble: {
        weight: 2.4,
        length: [3, 5],
        when: this.still,
        start: () => this.amble(1.4 + Math.random() * 1.8),
      },
      peek: {
        weight: 1.6,
        length: [6, 7.5],
        when: still,
        face: 'surprised',
        pose: (t) => {
          // Stretches right up on tiptoe, looks all round over the top, shades his eyes.
          const k = span(t, 0.3, 1.6, this.actLength - 1.6, this.actLength - 0.3);
          this.ext = 1 + 0.75 * k;
          this.headTilt = [-6 * k, 48 * k * sin(t, 0.22), 6 * k * sin(t, 0.22, 0.25)];
          this.arms = [-20 * k, 70 * k];
          this.lean = [4 * k * sin(t, 0.22, 0.2), 6 * k * sin(t, 0.22)];
          this.sway = 0.5;
          this.glow = (i, s) =>
            i / 8 < k * 1.1 ? 0.3 + 0.7 * Math.max(0, sin(s, 1.5, -i / 14)) : 0.1;
        },
      },
      squash: {
        weight: 1.4,
        length: [3.6, 3.6],
        when: still,
        face: 'sheepish',
        pose: (t) => {
          // Pressed flat, he holds it, then lets go: boing.
          const down = ease(t, 0.2, 0.7) * (1 - ease(t, 1.7, 1.75));
          this.ext = 1 - 0.78 * down;
          this.hop = 0.03 * ease(t, 1.7, 1.75) * (1 - ease(t, 1.75, 2.4));
          if (t > 1.7) this.expression = 'happy';
          this.glow = (i) => (down > 0.5 ? 0.2 + 0.6 * (i % 2) : 0.5);
          const up = t > 1.7 && t < 3 ? 90 : 30 * down;
          this.arms = [up, up];
        },
      },
      jelly: {
        weight: 1.2,
        length: [5, 6],
        when: still,
        face: 'happy',
        pose: (t) => {
          const k = this.fade(t, 0.6);
          this.sway = 1 + 6 * k;
          this.lean = [4 * k * sin(t, 0.7), 8 * k * sin(t, 0.7, 0.25)];
          this.arms = [30 * k * sin(t, 0.7, 0.3), -30 * k * sin(t, 0.7, 0.3)];
          this.headTilt = [0, 0, 14 * k * sin(t, 0.7, 0.45)];
        },
      },
      pulse: {
        weight: 1.1,
        length: [6, 6],
        when: still,
        face: 'focused',
        pose: (t) => {
          // A squeeze runs up the spring and back down.
          const k = this.fade(t, 0.5);
          this.pulse = k;
          this.glow = (i, s) =>
            clamp(1 - Math.abs(0.5 + 0.5 * Math.sin(TAU * 0.5 * s - 1.4) - i / 8) * 3, 0.12, 1);
        },
      },
      hula: {
        weight: 1,
        length: [6, 7],
        when: still,
        face: 'happy',
        pose: (t) => {
          const k = this.fade(t, 0.7);
          this.hula = k;
          this.arms = [70 * k, 70 * k];
          this.glow = (i, s) => 0.5 + 0.5 * Math.sin(s * 5 - i * 0.7);
        },
      },
      cobra: {
        weight: 0.9,
        length: [6, 7],
        when: still,
        face: 'starry',
        pose: (t) => {
          const k = span(t, 0.4, 1.4, this.actLength - 1.4, this.actLength - 0.3);
          this.ext = 1 + 0.5 * k;
          this.lean = [0, 14 * k * sin(t, 0.45)];
          this.headTilt = [4 * k, 0, -12 * k * sin(t, 0.45, 0.25)];
          this.sway = 1 + 2 * k;
          this.glow = (i, s) => 0.3 + 0.7 * Math.max(0, Math.sin(s * 4 - i * 0.8));
        },
      },
      corkscrew: {
        weight: 0.9,
        length: [4.6, 4.6],
        when: still,
        face: 'happy',
        pose: (t) => {
          // The rings screw round one after another while he turns on the spot.
          const k = span(t, 0.3, 1.2, 3.2, 4.2);
          this.twist = 200 * k * sin(t, 0.45);
          this.spinTo = 720 * sm((t - 0.4) / 3.6);
          this.ext = 1 + 0.15 * k;
          this.arms = [80 * k, 80 * k];
          this.glow = (i, s) => 0.4 + 0.6 * Math.abs(Math.sin(s * 3 + i * 0.9));
        },
      },
      bounce: {
        weight: 1.5,
        length: [5.4, 5.4],
        when: still,
        face: 'happy',
        pose: (t) => {
          // Three leaps off the floor: crouch, shoot up stretched, land squashed.
          const u = (t - 0.3) / 1.4;
          const n = Math.floor(u);
          if (u > 0 && n < 3) {
            const f = u - n;
            const air = f > 0.2 && f < 0.85;
            this.ext =
              f < 0.25
                ? 1 - 0.5 * sm(f / 0.25)
                : f < 0.7
                  ? 1.4
                  : 1 - 0.4 * (1 - sm((f - 0.7) / 0.3));
            this.hop = air ? 0.32 * Math.sin(Math.PI * ((f - 0.2) / 0.65)) : 0;
            this.arms = [air ? 120 : 20, air ? 120 : 20];
          }
          this.glow = (i, s) => (Math.sin(s * 9 - i * 0.6) > 0 ? 1 : 0.2);
        },
      },
      wave: {
        weight: 1.3,
        length: [3.6, 4.4],
        when: still,
        face: 'happy',
        pose: (t) => {
          const k = ease(t, 0.2, 0.6) * (1 - ease(t, this.actLength - 0.6, this.actLength));
          this.arms = [125 * k, 5];
          this.armWave = [30 * k * sin(t, 2.2), 0];
          this.headTilt = [0, 0, 8 * k];
          this.lean = [0, -4 * k];
        },
      },
      bow: {
        weight: 0.8,
        length: [3.2, 3.2],
        when: still,
        face: 'happy',
        pose: (t) => {
          const k = ease(t, 0.3, 1) * (1 - ease(t, 2, 2.8));
          this.lean = [38 * k, 0];
          this.ext = 1 - 0.1 * k;
          this.arms = [-20 * k, -20 * k];
        },
      },
      curious: {
        weight: 1,
        length: [5, 6],
        when: still,
        face: 'focused',
        pose: (t) => {
          // Leans right over to look at the floor in front of him, then up with a start.
          const k = span(t, 0.4, 1.6, this.actLength - 1.6, this.actLength - 0.8);
          this.lean = [34 * k, 8 * k * sin(t, 0.4)];
          this.headTilt = [12 * k, 20 * k * sin(t, 0.5), 8 * k];
          this.ext = 1 + 0.2 * k;
          if (t > this.actLength - 0.8) this.expression = 'surprised';
        },
      },
      dance: {
        weight: 1,
        length: [7, 8],
        when: still,
        face: 'happy',
        pose: (t) => {
          const k = this.fade(t, 0.6);
          const beat = sin(t, 1.1);
          this.lean = [0, 14 * k * beat];
          this.ext = 1 + 0.18 * k * Math.abs(beat);
          this.hop = 0.04 * k * Math.max(0, sin(t, 2.2));
          this.arms = [(60 + 50 * beat) * k, (60 - 50 * beat) * k];
          this.headTilt = [0, 0, 10 * k * beat];
          this.glow = (i, s) => 0.5 + 0.5 * Math.sin(s * 6.9 - i * 0.9);
        },
      },
      nap: {
        weight: 0.8,
        length: [9, 12],
        when: still,
        pose: (t) => {
          const k = span(t, 1, 2.4, this.actLength - 2, this.actLength - 0.6);
          this.ext = 1 - 0.34 * k;
          this.lean = [16 * k, 0];
          this.headTilt = [22 * k, 0, 6 * k];
          this.expression = k > 0.4 ? 'asleep' : 'sleepy';
          this.sway = 0.4;
          this.glow = (_i, s) => 0.08 + 0.1 * Math.sin(s * 0.9);
        },
      },
      spin: {
        weight: 0.8,
        length: [3.2, 3.2],
        when: still,
        face: 'happy',
        pose: (t) => {
          const k = ease(t, 0, 0.5) * (1 - ease(t, 2.6, 3.2));
          this.spinTo = 1080 * sm(t / 3.0);
          this.ext = 1 + 0.3 * k;
          this.arms = [100 * k, 100 * k];
          this.twist = 120 * k * sin(t, 0.9);
        },
      },
    };
  }

  protected react(kind: Reaction, t: number) {
    if (kind === 'poked') {
      // Squashed flat, then boing: up on his full stretch with his arms flung high.
      const down = ease(t, 0, 0.12) * (1 - ease(t, 0.3, 0.32));
      this.ext = 1 - 0.8 * down;
      this.hop = 0.18 * ease(t, 0.3, 0.32) * (1 - ease(t, 0.34, 0.95));
      const up = t > 0.3 && t < 1.3 ? 130 : 20 * down;
      this.arms = [up, up];
      this.glow = (i, s) => (Math.sin(s * 26) > 0 ? 1 : 0.4) * (i % 2 ? 1 : 0.7);
    } else if (kind === 'dizzy') {
      const k = 1 - ease(t, 2.6, 3.6);
      this.sway = 1 + 8 * k;
      this.hula = 0.8 * k;
      this.twist = 160 * k * sin(t, 0.8);
      this.spinTo = 540 * sm(t / 2);
      this.arms = [50 * k * sin(t, 1.1), -50 * k * sin(t, 1.1)];
      this.headTilt = [8 * k * Math.cos(t * 5), 0, 18 * k * Math.sin(t * 5)];
      this.glow = (i, s) => (Math.sin(s * 7 + i * 2.3) > 0.1 ? 1 : 0.1);
    } else {
      const k = this.fade(t, 0.6);
      this.ext = 1 + 0.35 * k;
      this.lean = [0, 8 * k * sin(t, 0.6)];
      this.arms = [90 * k, 90 * k];
      this.headTilt = [-6 * k, 0, 8 * k * sin(t, 0.6, 0.25)];
      this.glow = (i, s) => 0.5 + 0.5 * Math.sin(s * 3 - i * 0.9);
    }
  }

  // ---------- Posing ----------

  protected idle(t: number) {
    const p = this.puppet;
    this.ext = 1;
    this.lean = [0, 0];
    this.sway = 1;
    this.pulse = 0;
    this.twist = 0;
    this.hula = 0;
    this.hop = 0;
    this.spinTo = 0;
    this.arms = [0, 0];
    this.armWave = [0, 0];
    this.headTilt = [0, 0, 0];
    this.glow = null;
    this.expression = this.hovered ? 'happy' : 'neutral';
    p.add('head', 1.5 * wobble(t * 0.4, 5), 0, 2 * wobble(t * 0.3, 2));
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    this.env = env;
    this.enjoy(dt, this.still());
    this.spec.speed = this.act === 'tumble' ? 0.85 : 0.7;
    // The directed poses bend the virtual `body` bone: that leans the stack.
    const [bp, , br] = p.current('body');
    fixed(dt, (h) => {
      this.extS.update(h, this.ext);
      this.leanF.update(h, this.lean[0] + bp);
      this.leanS.update(h, this.lean[1] + br);
      this.swayG.update(h, this.sway);
      this.twistS.update(h, this.twist);
    });
    // The step: a phase of the tumble carried by the ground going by; finished when he stops.
    if (this.stride > 1) {
      this.phi += (this.stride * dt) / this.px / STRIDE;
      if (this.phi >= 1) this.phi -= 1;
    } else if (this.phi > 0) {
      this.phi += dt * 0.9;
      if (this.phi >= 1) this.phi = 0;
    }
    // Arms: hung out and down, raised by the act, a swing as he tumbles.
    const walk = clamp(this.stride / (this.heightPx * 0.6), 0, 1);
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 'L' : 'R';
      const sg = i === 0 ? 1 : -1;
      const swing = 40 * walk * Math.sin(this.phi * TAU + i * Math.PI);
      p.add(`upper_arm.${s}`, -this.armWave[i] * 0.5, 0, sg * (this.arms[i] + 14 * walk + swing));
      p.add(`forearm.${s}`, 0, 0, sg * (this.arms[i] > 60 ? 18 + this.armWave[i] : 8));
    }
    p.add('head', this.headTilt[0], this.headTilt[1], this.headTilt[2]);
    this.h = this.hop * this.px;
    // Landing from a leap: the spring takes it.
    if (this.hop < 0.004 && this.lastHop >= 0.02) this.extS.kick(-2.5 - this.lastHop * 8);
    this.lastHop = this.hop;
  }

  /** The rings along a curve from the foot cap to the head cap, for this frame. */
  protected after(_dt: number, env: Env) {
    const p = this.puppet;
    const t = env.time;
    const ext = clamp(this.extS.y, 0.12, 1.9);
    const sway = this.swayG.y;
    let F: V = { x: 0, y: 0, z: 0 };
    let E: V = { x: 0, y: BASE_TOP + STACK * ext, z: 0 };
    const leanF = clamp(this.leanF.y, -70, 70);
    const leanS = clamp(this.leanS.y, -60, 60);
    const phi = this.phi;
    const arch = phi > 0;
    const L = STACK * ext;
    // The tumble: the head end swings over and lands ahead (the stack bowing up into an arch of
    // constant length), then the foot slides after as the head end stands the stack back up.
    let arc: ((u: number) => V) | null = null;
    if (arch) {
      const D = STRIDE;
      const shift = phi * D;
      let c: number;
      let psi: number;
      let sz: number;
      let sy = 0;
      if (phi < 0.5) {
        const a = sm(phi / 0.5);
        psi = (Math.PI / 2) * a;
        c = L + (D - L) * a;
        sz = 0;
      } else {
        const b = sm((phi - 0.5) / 0.5);
        psi = (Math.PI / 2) * (1 - b);
        c = D + (L - D) * b;
        sz = D - c * Math.sin(psi);
        sy = 0.05 * Math.sin(Math.PI * b);
      }
      F = { x: 0, y: sy, z: sz - shift };
      const S0: V = { x: 0, y: F.y + BASE_TOP, z: F.z };
      E = { x: 0, y: S0.y + c * Math.cos(psi), z: S0.z + c * Math.sin(psi) };
      arc = arcCurve(S0, E, L);
    }
    const S: V = { x: F.x, y: F.y + BASE_TOP, z: F.z };
    const hula = this.hula;
    const sx = (u: number) =>
      0.03 * sway * sin(t, 0.55, -0.55 * u) * Math.sin(Math.PI * u) +
      Math.tan((leanS / DEG) * 0.9) * 0.5 * STACK * ext * u ** 1.6 +
      0.07 * hula * u * Math.cos(t * 4.4);
    const sz = (u: number) =>
      0.012 * sway * sin(t, 0.41, -0.4 * u) * Math.sin(Math.PI * u) +
      Math.tan((leanF / DEG) * 0.9) * 0.5 * STACK * ext * u ** 1.6 +
      0.07 * hula * u * Math.sin(t * 4.4);
    const curve = (u: number): V => {
      if (arc) return arc(u);
      return {
        x: S.x + (E.x - S.x) * u + sx(u),
        y: S.y + (E.y - S.y) * u,
        z: S.z + (E.z - S.z) * u + sz(u),
      };
    };
    const place: { c: V; tilt: number; roll: number }[] = [];
    for (let k = 0; k < RINGS; k++) {
      let u = (k + 0.5) / RINGS;
      if (this.pulse) {
        // A squeeze travelling up the stack and back: rings crowd where it is.
        const c = 0.5 + 0.5 * Math.sin(TAU * 0.5 * t - 1.4);
        u += this.pulse * 0.06 * Math.sin(Math.PI * clamp((u - c) * 3.2, -1, 1));
      }
      const a = curve(clamp(u - 0.02, 0, 1));
      const b = curve(clamp(u + 0.02, 0, 1));
      place.push({
        c: curve(u),
        tilt: Math.atan2(b.z - a.z, b.y - a.y) * DEG,
        roll: -Math.atan2(b.x - a.x, b.y - a.y) * DEG,
      });
    }
    const twist = this.twistS.y;
    place.forEach((q, k) => {
      const name = `ring.${k}`;
      const rest = BASE_TOP + (k + 0.5) * PITCH;
      p.shift(name, q.c.x, q.c.y - rest, q.c.z);
      p.turn(name, q.tilt, twist * (k / RINGS), q.roll);
      // Crowded rings flatten and fatten instead of cutting into each other.
      const n = place[Math.min(k + 1, RINGS - 1)].c;
      const m = place[Math.max(k - 1, 0)].c;
      const pitch =
        Math.hypot(n.x - m.x, n.y - m.y, n.z - m.z) / (k === 0 || k === RINGS - 1 ? 1 : 2);
      const along = clamp(pitch / RING_THICK, 0.3, 1);
      p.stretch(name, along, [0, 1, 0], 1 + 0.4 * (1 - along));
    });
    // The head cap sits on the top of the spring, following its tangent; the foot cap on the floor.
    const e1 = curve(1);
    const e0 = curve(0.96);
    const tx = e1.x - e0.x;
    const ty = e1.y - e0.y;
    const tz = e1.z - e0.z;
    const tl = Math.hypot(tx, ty, tz) || 1;
    const keep = arch ? 0.5 : 1;
    const hy = Math.max(e1.y + (ty / tl) * HEAD_HALF, 0.1);
    p.shift(
      'head',
      e1.x + (tx / tl) * HEAD_HALF,
      hy - (BASE_TOP + STACK + HEAD_HALF),
      e1.z + (tz / tl) * HEAD_HALF,
    );
    p.turn('head', Math.atan2(tz, ty) * DEG * keep, 0, -Math.atan2(tx, ty) * DEG * keep);
    const s0 = curve(0.04);
    const s1 = curve(0);
    p.shift('base', F.x, F.y, F.z);
    p.turn(
      'base',
      Math.atan2(s0.z - s1.z, s0.y - s1.y) * DEG * 0.6,
      0,
      -Math.atan2(s0.x - s1.x, s0.y - s1.y) * DEG * 0.6,
    );
    // Spinning on the spot about his own axis.
    this.pivot.rotation.y = this.spinTo / DEG;
    this.lights(t);
  }

  private lights(t: number) {
    const mood = this.expression;
    const asleep = mood === 'asleep';
    for (let i = 0; i < RINGS; i++) {
      let level: number;
      let tone: string | undefined;
      if (this.glow) {
        level = this.glow(i, t);
        if (this.act === 'dizzy') tone = RAINBOW[(i + Math.floor(t * 5)) % RAINBOW.length];
        if (['bounce', 'dance', 'hula'].includes(this.act))
          tone = RAINBOW[(i + Math.floor(t * 4)) % RAINBOW.length];
      } else if (this.stride > 1) {
        level = 0.4 + 0.6 * Math.max(0, Math.sin(this.phi * TAU - i * 0.7));
      } else {
        // At rest a slow light climbs the stack now and then.
        const c = (t / 3) % 1.6;
        level = 0.15 + 0.85 * clamp(1 - Math.abs(c * 9 - i) * 0.6, 0, 1);
        if (this.hovered) level = 0.55 + 0.45 * Math.sin(t * 3 - i * 0.7);
      }
      this.outfit.dot(i, clamp(asleep ? level * 0.4 : level, 0, 1), tone);
    }
    this.outfit.beacon(
      this.act === 'dizzy'
        ? RAINBOW[Math.floor(t * 6) % RAINBOW.length]
        : (BEACON[mood] ?? '#f4f4f1'),
    );
  }
}
