import type { Object3D } from 'three';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import type { Reaction } from './birds';
import { Bug, ease, SIDES, span, TAU } from './bug';
import { sin } from './moves';
import { Spring } from './spring';

/**
 * Inch, the robot caterpillar: a big screen-faced head and six round segments in a chain,
 * each with a lamp on its back (the lights run down the chain like something being swallowed
 * down it), stub legs, and a lamp on the tail. Every segment is a bone of its own, so the
 * whole chain can ripple, arch, rear up and curl. He crawls in ripples, a hump running from
 * the tail to the head; inches along in loops (the tail pulled right up to the head, the
 * head stretched out far, again); rears up and sways like a charmer's snake; munches a leaf
 * that isn't there; wiggles in a conga line of segments; curls up for a nap; and, once in a
 * while, wraps himself in a cocoon, wobbles inside it, and pops out with two tiny useless
 * wings that flap hard, and fall off.
 *
 * A poke humps him up in a startled arch; three make the chain conga wildly; the mouse
 * resting on him makes him rear up and wave.
 */
export const CATERPILLAR_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.3, 0.46],
    [0.7, 0.46],
  ],
  rx: 0.095,
  ry: 0.28,
  line: 0.034,
  mouth: [0.5, 0.8],
};

/** The head (0) and the six segments: how far forward each stands from the middle (m). */
const AT = [0.285, 0.19, 0.095, 0, -0.088, -0.172, -0.248];
const N = AT.length;
const BONES = ['head', 'seg.1', 'seg.2', 'seg.3', 'seg.4', 'seg.5', 'seg.6'];
/** How far up the chain each segment is, 0 at the head, 1 at the tail. */
const POS = AT.map((_, k) => k / (N - 1));
const REAR_UP = [1, 0.8, 0.5, 0.2, 0.05, 0, 0];
const REAR_BACK = [1, 0.9, 0.65, 0.3, 0.08, 0, 0];

export class Caterpillar extends Bug {
  /** Each segment's offset from where it rests: [sideways, up, forward] (m), sprung. */
  private off = AT.map(() => [new Spring(5, 0.7), new Spring(5, 0.7), new Spring(5, 0.7)]);
  private lean = new Spring(2, 0.8);
  // Per-frame requests from acts, cleared in idle().
  private ripple = 0;
  private rear = 0;
  private arch = 0;
  private curl = 0;
  private conga = 0;
  private sway = 0;
  private chew = 0;
  private cocoon = 0;
  private cocoonLong = 0;
  private wings = 0;
  private flapW = 0;
  private lights: ((i: number, t: number) => number) | null = null;
  private crack = 0;
  private actSpeed = 0.35;
  private stage = 0;
  private since = 0;
  /** The tiny wings coming off: how far each has fallen (m), how fast, and how much is left. */
  private fall = { y: 0, v: 0, gone: 0 };
  private bumps = 0;

  constructor(model: Object3D) {
    const seg = { f: 5, zeta: 0.6 };
    super(
      {
        name: 'Inch',
        model: 'caterpillar',
        metres: 0.32,
        width: 0.5,
        size: 0.45,
        feels: {
          default: { f: 5, zeta: 0.6 },
          root: { f: 3, zeta: 0.6 },
          head: { f: 4, zeta: 0.5, r: 0.5 },
          'seg.1': seg,
          'seg.2': seg,
          'seg.3': seg,
          'seg.4': seg,
          'seg.5': seg,
          'seg.6': seg,
          'tinywing.L': { f: 6, zeta: 0.4 },
          'tinywing.R': { f: 6, zeta: 0.4 },
          'antenna.L.1': { f: 3.5, zeta: 0.3 },
          'antenna.R.1': { f: 3.5, zeta: 0.3 },
          'antenna.L.2': { f: 4.5, zeta: 0.2 },
          'antenna.R.2': { f: 4.5, zeta: 0.2 },
        },
        face: CATERPILLAR_FACE,
        eyes: 0.45,
        gaze: [{ bone: 'head', yaw: 0.9, pitch: 0.9 }],
        reach: { yaw: 55, pitch: 28 },
        lag: 1.1,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [50, 110],
        speed: 0.35,
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
    const fadeK = (t: number) => this.fade(t, 0.6);
    return {
      idle: { weight: 3, length: [3, 6] },
      crawl: {
        weight: 2.4,
        length: [14, 14],
        when: still,
        start: () => {
          this.actSpeed = 0.35;
          this.amble(1.2 + Math.random() * 1.3);
        },
        pose: (t) => {
          this.actSpeed = 0.35;
          if (this.there && t > 0.8) this.actLength = Math.min(this.actLength, t + 0.3);
        },
      },
      inch: {
        weight: 2.2,
        length: [14, 14],
        face: 'focused',
        when: still,
        start: () => {
          this.stage = 0;
          this.amble(2.4 + Math.random() * 1.2);
        },
        pose: (t) => {
          // An inchworm: the back end hauls itself up to the head in an arch, the head
          // reaches out far, and again. The arch comes up slowly and drops fast, and he
          // only moves forward as it drops.
          const u = (t * 0.5) % 1;
          const a = u < 0.55 ? ease(u, 0, 0.55) : 1 - ease(u, 0.55, 0.72);
          this.arch = a * clamp(t / 0.8, 0, 1);
          this.actSpeed = u > 0.55 && u < 0.8 ? 1.8 : 0.04;
          if (this.there && t > 1.5 && this.stage === 0) {
            this.stage = 1;
            this.actLength = Math.min(this.actLength, t + 1.6);
          }
        },
      },
      rear: {
        weight: 1.6,
        length: [6, 7],
        face: 'happy',
        when: still,
        pose: (t) => {
          // Up on his tail end, the front half of him standing up and swaying from side
          // to side, looking about.
          const k = fadeK(t);
          this.rear = k;
          this.sway = 1;
          this.feelers((side, k2) => [
            -8 * k,
            0,
            side * (6 + 12 * sin(t, 0.6, side * 0.2)) * (k2 === 1 ? 1 : 0.6) * k,
          ]);
        },
      },
      munch: {
        weight: 1.5,
        length: [6, 7],
        face: 'happy',
        when: still,
        pose: (t) => {
          // A leaf that isn't there, held in front: small quick bites, the whole of him
          // working, a lamp running down the chain with every swallow.
          const k = fadeK(t);
          this.chew = k;
          this.rear = 0.25 * k;
          const swallow = (t * 1.1) % 1;
          this.lights = (i) => 0.12 + 0.88 * Math.max(0, 1 - Math.abs(swallow * 7 - i - 0.5));
        },
      },
      conga: {
        weight: 1.3,
        length: [5, 6],
        face: 'happy',
        when: still,
        pose: (t) => {
          // The segments wiggle sideways in a line, each a beat behind the one before.
          const k = fadeK(t);
          this.conga = k;
          this.lights = (i, s) => (Math.sin(s * 6 - i * 0.9) > 0 ? 1 : 0.15);
        },
      },
      peek: {
        weight: 1.2,
        length: [5, 6],
        face: 'surprised',
        when: still,
        pose: (t) => {
          // Up like a periscope, straight, turning slowly to look all round, antennae up.
          const k = fadeK(t);
          this.rear = 0.9 * k;
          p.add('head', 0, 70 * sin(t, 0.22) * k);
          this.feelers((side) => [-24 * k, 0, side * 10 * k]);
        },
      },
      wave: {
        weight: 1.2,
        length: [4, 5],
        face: 'happy',
        when: still,
        pose: (t) => {
          // A light runs down the chain, head to tail, again and again, faster each time.
          const k = fadeK(t);
          this.lights = (i, s) => Math.max(0, Math.cos(s * (3 + s * 0.2) - i * 0.9)) * 0.9 + 0.1;
          p.add('head', 0, 18 * sin(t, 0.5) * k);
        },
      },
      nap: {
        weight: 0.9,
        length: [9, 13],
        when: still,
        pose: (t) => {
          // Curled up into a loose coil, head tucked, the lamps nearly out.
          const k = span(t, 1.2, 2.6, this.actLength - 2, this.actLength - 0.6);
          this.curl = 0.4 * k;
          p.add('head', 24 * k);
          this.expression = k > 0.4 ? 'asleep' : 'sleepy';
          this.lights = (i, s) => 0.08 + 0.1 * (0.5 + 0.5 * Math.sin(s * 1.1 - i * 0.5));
        },
      },
      cocoon: {
        weight: 0.9,
        length: [16, 16],
        when: still,
        start: () => {
          this.stage = 0;
          this.since = 0;
          this.fall = { y: 0, v: 0, gone: 0 };
        },
        pose: (t) => this.cocoonJoke(t),
      },
    };
  }

  /** The joke: wraps himself in silk, wobbles, pops out with tiny wings, which fall off. */
  private cocoonJoke(t: number) {
    const p = this.puppet;
    const POP = 6.4;
    const FALL = 10.2;
    if (t < POP) {
      // Curling in, spinning the silk round himself, then wobbling inside it.
      this.curl = 0.5 * ease(t, 0.3, 2.2);
      this.cocoon = ease(t, 1.2, 4.2);
      this.cocoonLong = ease(t, 1.2, 3.0);
      this.expression = t < 4.4 ? 'focused' : 'sleepy';
      this.sway = 0;
      this.crack = ease(t, 4.8, POP);
      const wob = ease(t, 4.2, 4.8);
      p.add('root', 0, 0, 6 * sin(t, 1.3) * wob + 4 * sin(t, 3.4) * ease(t, 5.4, POP));
      this.lights = () => 0.1;
    } else if (t < FALL) {
      // Out with a pop, the chain springing straight, the wings out and flapping.
      const s = t - POP;
      if (this.stage === 0) {
        this.stage = 1;
        p.kick('root', -500);
        for (const bone of BONES) p.kick(bone, -300);
        for (const sp of this.off) sp[1].kick(1.6);
      }
      this.cocoon = 0;
      this.wings = ease(s, 0.05, 0.4);
      this.flapW = ease(s, 0.3, 0.7) * (1 - ease(s, 3.3, 3.8));
      this.expression = s < 0.8 ? 'surprised' : 'happy';
      this.rear = 0.3 * this.flapW;
      this.lights = (i, st) => (Math.sin(st * 14 - i) > 0 ? 1 : 0.2);
    } else {
      // The wings come off, tumble to the floor and fade; he looks at them, a bit sheepish.
      const s = t - FALL;
      if (this.stage === 1) {
        this.stage = 2;
        this.fall = { y: 0, v: 0, gone: 0 };
        p.kick('head', 140);
      }
      this.cocoon = 0;
      this.wings = 1;
      this.flapW = 0;
      this.rear = 0.15 * ease(s, 0, 0.6) * (1 - ease(s, 1.6, 2.4));
      this.expression = 'sheepish';
      p.add('head', 18 * ease(s, 0.6, 1.4), 20 * ease(s, 0.4, 1) * (1 - ease(s, 2.2, 3)));
    }
  }

  protected react(kind: Reaction, t: number) {
    const p = this.puppet;
    if (kind === 'poked') {
      // A startled hump: the whole chain arches up and boings back, the lamps flashing.
      const k = span(t, 0, 0.12, 0.7, 1.5);
      this.arch = 1.1 * k;
      this.lights = () => (t < 0.4 ? 1 : 0.2);
      p.add('head', -14 * k);
      this.feelers(() => [-24 * k, 0, 0]);
    } else if (kind === 'dizzy') {
      const k = 1 - ease(t, 2.4, 3.4);
      this.conga = 1.3 * k;
      p.add('head', 10 * k * Math.cos(t * 5), 18 * k * Math.sin(t * 3), 20 * k * Math.sin(t * 5));
      this.lights = (i) => (Math.random() < 0.5 ? 1 : 0.15);
    } else {
      // Up on his tail end, waving his antennae, the lamps glowing.
      const k = this.fade(t, 0.7);
      this.rear = 0.8 * k;
      this.sway = 0.6;
      this.lights = (i, s) => 0.6 + 0.4 * Math.sin(s * 3 - i);
      this.feelers((side) => [-10 * k, 0, side * (8 + 14 * sin(t, 1.2, side * 0.25)) * k]);
    }
  }

  protected idle(t: number) {
    const p = this.puppet;
    this.ripple = 0;
    this.rear = 0;
    this.arch = 0;
    this.curl = 0;
    this.conga = 0;
    this.sway = 0;
    this.chew = 0;
    this.cocoon = 0;
    this.cocoonLong = 0;
    this.wings = 0;
    this.flapW = 0;
    this.crack = 0;
    this.lights = null;
    this.actSpeed = 0.35;
    this.expression = this.hovered ? 'happy' : 'neutral';
    p.add('head', 2 * sin(t, 0.4), 5 * sin(t, 0.13));
    this.feelers((side, k) => {
      const ph = side > 0 ? 0 : 0.3;
      return k === 1
        ? [5 * sin(t, 0.5, ph), 0, side * (-2 + 5 * sin(t, 0.37, ph))]
        : [10 * sin(t, 0.5, ph - 0.15), 0, side * 5 * sin(t, 0.61, ph)];
    });
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    this.env = env;
    this.spec.speed = this.actSpeed;
    this.enjoy(dt, this.still());
    const t = env.time;
    // A resting breath: a slow ripple down the chain even when he isn't going anywhere.
    const moving = clamp(this.stride / (this.heightPx * 0.25), 0, 1);
    const hum = 0.12 + 0.88 * moving;
    const phase = this.gait * 3.2 + (moving > 0.02 ? 0 : t * 0.9);
    // The mouse resting on him: he rears up.
    const rear = this.rear || (this.hovered && this.act === 'idle' ? 0.5 : 0);
    const shape = AT.map((_, k) => {
      const n = POS[k];
      let up = hum * 0.03 * Math.max(0, Math.sin(phase - k * 0.8)) * (moving > 0.02 ? 1 : 0.35);
      let fwd = moving > 0.02 ? 0.012 * Math.cos(phase - k * 0.8) * hum : 0;
      let side = 0;
      // Rearing up: the front half stands, the head highest, leaning back over the rest.
      up += rear * 0.3 * REAR_UP[k];
      fwd -= rear * 0.1 * REAR_BACK[k];
      side += this.sway * rear * 0.06 * REAR_UP[k] * sin(t, 0.45);
      // An arch: the tail hauled up toward the head, the middle standing up.
      fwd += this.arch * 0.22 * n * (k === 0 ? 0 : 1);
      up += this.arch * 0.2 * Math.sin(Math.PI * n);
      // Curled: everyone pulled in toward the middle.
      fwd -= this.curl * AT[k] * 0.8;
      up += this.curl * 0.02 * (k % 2);
      // Conga: each a beat behind.
      side += this.conga * 0.06 * Math.sin(t * TAU * 1.6 - k * 0.9);
      up += this.conga * 0.012 * Math.abs(Math.sin(t * TAU * 1.6 - k * 0.9));
      // Chewing: the head bobbing in little bites.
      if (k === 0) {
        up += this.chew * 0.012 * (0.5 + 0.5 * Math.sin(t * TAU * 3.2));
        fwd += this.chew * 0.02 * Math.max(0, Math.sin(t * TAU * 3.2));
      }
      // Wings flapping: he bounces with each beat.
      up += this.flapW * 0.01 * Math.sin(t * TAU * 9 - k * 0.3);
      return [side, up, fwd];
    });
    BONES.forEach((bone, k) => {
      const [s, u, f] = shape[k];
      const sp = this.off[k];
      p.shift(bone, sp[0].update(dt, s), sp[1].update(dt, u), sp[2].update(dt, f));
    });
    // The stub legs in step with the ripple, tucked a little when he rears or curls.
    for (const [sfx, side] of SIDES)
      for (let k = 1; k < N; k++) {
        const swing = 22 * moving * Math.sin(phase - k * 0.8 + (side > 0 ? 0 : 0.2));
        p.add(
          `leg.${sfx}.${k}`,
          swing - 40 * rear * REAR_UP[k] - 30 * this.curl,
          0,
          side * 6 * moving,
        );
      }
    // Turned toward the middle of his edge, so his length shows.
    const [lo, hi] = this.span(env.frame);
    const aside =
      Math.sign((lo + hi) / 2 - this.s) * (this.edge === 'bottom' || this.edge === 'left' ? 1 : -1);
    const shown = this.act === 'cocoon' || moving > 0.02 ? 0.4 : 1;
    const turn = this.lean.update(dt, aside * 52 * shown);
    p.add('root', 0, turn);
    p.add('head', 0, -turn * 0.55);
    this.tone(dt, env, this.cocoon > 0.8 ? '#8a8a84' : null);
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    const t = env.time;
    // The cocoon grows round him from nothing, long first, then fat; gone when it pops.
    const c = clamp(this.cocoon, 0, 1);
    const along = Math.max(0.001, c * (0.2 + 0.8 * clamp(this.cocoonLong, 0, 1)));
    p.stretch('cocoon', along, [0, 0, 1], Math.max(0.001, c * c));
    // The tiny wings: out from nothing, flapping hard, and once they're off, falling.
    const w = clamp(this.wings, 0, 1);
    const f = this.fall;
    if (this.stage === 2 && this.act === 'cocoon') {
      f.v += 2.4 * dt;
      f.y = Math.min(0.2, f.y + f.v * dt);
      if (f.y >= 0.2) f.gone += dt;
    }
    const left = this.act === 'cocoon' ? 1 - clamp((f.gone - 0.5) / 0.5, 0, 1) : 0;
    const s = Math.max(0.001, w * left);
    for (const [sfx, side] of SIDES) {
      const name = `tinywing.${sfx}`;
      p.stretch(name, s, [0, 0, 1], s);
      const beat = this.flapW * 40 * Math.sin(t * TAU * 9 + (side > 0 ? 0 : 0.4));
      const tumble = f.y > 0 ? Math.min(1, f.y / 0.2) * side * 80 : 0;
      p.turn(name, 0, 0, side * beat + tumble);
      p.shift(name, side * f.y * 0.4, -f.y, 0);
    }
    this.light(t);
    void dt;
  }

  /** The lamps down his back, and the tail lamp, and the crack in the cocoon. */
  private light(t: number) {
    const asleep = this.expression === 'asleep';
    for (let i = 0; i < 6; i++) {
      let level: number;
      if (this.act === 'dizzy') level = Math.random() < 0.5 ? 1 : 0.2;
      else if (this.lights) level = this.lights(i, t);
      else level = 0.5 + 0.5 * Math.sin(t * 1.2 - i * 0.8);
      if (this.hovered && this.act === 'idle') level = 0.5 + 0.5 * Math.sin(t * 4 - i);
      this.outfit.dot(i, clamp(asleep ? level * 0.5 : level, 0, 1));
    }
    this.outfit.dot(6, 0.5 + 0.5 * Math.sin(t * 2.4));
    this.outfit.dot(
      7,
      this.crack > 0 ? 0.2 + 0.8 * this.crack * (0.6 + 0.4 * Math.sin(t * 12)) : 0,
    );
  }
}
