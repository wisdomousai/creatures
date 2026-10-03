import type { Object3D } from 'three';
import { BEACON } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import type { Anatomy } from './pet';
import { Spring } from './spring';
import { pulse, ramp } from './kitties';
import { adultMoods, CAT_ACT_MOODS, Moggy } from './moggy';

/**
 * Roz, the robot Bengal: an athletic young adult, long and muscular, restless. Her coat is
 * rosettes, small plates along both flanks with a lit core each (Dot5 her left side, Dot6 her
 * right) and a cluster on the crown (Dot7); the lights run along her flanks when she runs and
 * glow when she is happy. She can't sit still: she prowls up and down the floor with her tail
 * low, creeps and then makes a high pounce, leaps across the floor in great bounds, climbs the
 * side wall, rears up to look over something, and loves water: a puddle (a bone of its own,
 * hidden until she wants it) appears in front of her and she dabs her paw in it, flicks the
 * drops off, dabs again and watches the rings spread.
 */
export const BENGAL_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.3, 0.47],
    [0.7, 0.47],
  ],
  rx: 0.1,
  ry: 0.27,
  line: 0.032,
  mouth: [0.5, 0.8],
  kind: 'cat',
  pupil: 0.6,
};

const BENGAL: Anatomy = {
  tail: ['tail.1', 'tail.2', 'tail.3', 'tail.4'],
  tailAxis: [0, 0.1, -1],
  earsHang: false,
  moods: adultMoods({
    calm: {
      face: 'neutral',
      carriage: -22,
      bob: [6, 0.35],
      hook: 14,
      flicks: 0.5,
      ears: 4,
      out: -2,
      swivel: 0.6,
    },
    curious: { face: 'neutral', carriage: 6, hook: 35, flicks: 1.2, ears: 14, out: -4, swivel: 1 },
  }),
  actMoods: {
    ...CAT_ACT_MOODS,
    highPounce: 'curious',
    leap: 'happy',
    waterDab: 'curious',
    prowl: 'curious',
    climb: 'curious',
    rearLook: 'curious',
  },
  lying: 'calm',
  hover: 'happy',
  drop: { stand: 0, sit: -0.11, lie: -0.12 },
  sit: -22,
  turn: 45,
};

export class Bengal extends Moggy {
  protected readonly anatomy = BENGAL;
  protected readonly build = { middle: 0.3, spring: 1.9, speed: 1.9 };
  /** The puddle, how far out it is (0 tucked away). */
  private puddle = new Spring(5, 0.55);
  private wet = 0;
  private ripple = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Roz',
        model: 'bengal',
        metres: 0.7,
        width: 0.78,
        size: 1.2,
        feels: {
          default: { f: 2.6, zeta: 0.55 },
          root: { f: 3, zeta: 0.55 },
          body: { f: 2.4, zeta: 0.6 },
          head: { f: 2.4, zeta: 0.55, r: 0.3 },
          'ear.L': { f: 5, zeta: 0.3 },
          'ear.R': { f: 5, zeta: 0.3 },
          'tail.1': { f: 1.8, zeta: 0.45 },
          'tail.2': { f: 2, zeta: 0.4 },
          'tail.3': { f: 2.3, zeta: 0.35 },
          'tail.4': { f: 2.6, zeta: 0.3 },
          'leg.FL': { f: 3.4, zeta: 0.55 },
          'leg.FR': { f: 3.4, zeta: 0.55 },
          'leg.BL': { f: 3.4, zeta: 0.55 },
          'leg.BR': { f: 3.4, zeta: 0.55 },
        },
        face: BENGAL_FACE,
        eyes: 0.74,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.9 },
          { bone: 'body', yaw: 0.2, pitch: 0 },
        ],
        reach: { yaw: 60, pitch: 30 },
        lag: 0.7,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 1.9,
      },
      model,
    );
    this.adopt(
      {
        pounce: 0.8,
        stalk: 1.2,
        zoomies: 1.4,
        circle: 1,
        backWall: 0.8,
        frontLip: 0.7,
        watch: 0.8,
        tilt: 0.6,
        wash: 0.8,
        batAir: 0.8,
        knead: 0.4,
      },
      0.4,
    );
    Object.assign(this.acts, this.mine());
  }

  protected idle(t: number) {
    this.wet = 0;
    this.ripple = 0;
    super.idle(t);
  }

  protected after(dt: number, env: Env) {
    super.after(dt, env);
    const p = this.puppet;
    const k = clamp(this.puddle.update(dt, this.wet), 0, 1.2);
    const s = Math.max(k, 0) * (1 + 0.1 * this.ripple);
    p.stretch('ripple', Math.max(s, 1e-4), [0, 1, 0], Math.max(s, 0));
  }

  protected breedLights(time: number, tone: string | undefined) {
    const o = this.outfit;
    if (!o) return;
    const asleep = this.mood === 'asleep' || this.posture === 'lie';
    const run = clamp(this.stride / 60, 0, 1);
    // A pulse that runs along the rosettes from shoulder to hip; faster when she runs.
    const wave = (phase: number) =>
      asleep ? 0.1 : clamp(0.3 + 0.35 * Math.sin(time * (2 + run * 8) - phase) + run * 0.4, 0, 1);
    o.dot(5, wave(0), tone);
    o.dot(6, wave(1.2), tone);
    o.dot(7, asleep ? 0.1 : 0.5 + 0.4 * Math.sin(time * 1.3), tone);
    o.dot(8, clamp(this.wet * 0.9, 0, 1), BEACON.happy);
  }

  private mine(): Record<string, Act> {
    const p = () => this.puppet;
    const stand = () => this.standing;
    return {
      // Stalks low, wiggles, and then a really high pounce: up off the floor, front paws
      // reaching, a soft landing on all fours, and a look round as if nothing happened.
      highPounce: {
        weight: 1.8,
        length: [4.2, 4.2],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.run.dir = this.roomy();
        },
        pose: (t) => {
          if (t < 1.4) {
            const k = ramp(t, 0, 0.4);
            p().add('body', 22 * k);
            this.frontLegs(-36 * k);
            this.backLegs(16 * k);
            const w = sin(t, 5.5) * 8 * ramp(t, 0.5, 0.9);
            p().add('body', 0, w);
            p().add('head', -10 * k, -w);
            this.extraLift = -0.045 * k;
            this.twitch(t, 24 * k, 5);
            this.emote = 'focused';
            this.pupils = 1;
          } else if (t < 2.1) {
            if (!this.run.done) {
              this.run.done = true;
              this.hop.kick(5.4);
              this.boost = 3;
              this.walkTo(this.s + this.run.dir * this.heightPx * 1.6, this.depth);
            }
            // Stretched out in the air, front paws reaching up and forward, hind legs trailing.
            const air = ramp(t, 1.4, 1.55);
            p().add('body', -24 * air);
            this.frontLegs(-110 * air);
            this.backLegs(34 * air);
            p().add('head', -16 * air);
            this.bones().forEach((b) => p().add(b, -12 * air, 0, 0));
            this.emote = 'surprised';
            this.pupils = 1;
          } else if (t < 2.8) {
            p().add('body', 12);
            this.frontLegs(-20);
            this.emote = 'neutral';
          } else {
            p().add('head', 0, 26 * sin(t, 0.7), 8 * sin(t, 0.7, 0.25));
            this.emote = 'neutral';
            this.pupils = 0.6;
          }
        },
      },
      // Great bounds across the floor, hind legs pushing, front legs reaching, tail streaming.
      leap: {
        weight: 1.4,
        length: [5.5, 5.5],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.run.dir = this.roomy();
          this.run.n = 0;
        },
        pose: (t) => {
          const hops = Math.floor(t / 1.0);
          this.emote = 'happy';
          this.pupils = 0.8;
          if (t < 4.0) {
            const f = (t % 1.0) / 1.0;
            if (hops >= this.run.n) {
              this.run.n = hops + 1;
              this.hop.kick(3.4);
              this.boost = 3;
              this.walkTo(this.s + this.run.dir * this.heightPx * 0.9, this.depth);
            }
            const air = pulse(f, 0.0, 0.7);
            p().add('body', -16 * air);
            this.frontLegs(-60 * air);
            this.backLegs(30 * air);
            this.bones().forEach((b) => p().add(b, -8 * air, 0, 0));
          } else p().add('head', 0, 20 * sin(t, 0.9));
        },
      },
      // Sits to a puddle that only she can see: dabs a paw in it, flicks the drops off, dabs
      // again, watches the rings go out.
      waterDab: {
        weight: 1.6,
        length: [7, 7],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.run.n = 0;
        },
        pose: (t) => {
          const k = ramp(t, 0, 0.7) * (1 - ramp(t, 6.2, 6.9));
          this.wet = k > 0.02 ? 1 : 0;
          if (t > 6.2) this.wet = 0;
          p().add('body', 12 * k);
          p().add('head', 28 * k, 14 * k);
          this.eyes = { x: -0.5, y: 0.9 };
          this.pupils = 1;
          this.emote = 'focused';
          this.extraLift = -0.02 * k;
          // Dabs: the paw reaches out and taps, three times, then shakes the drops off.
          const dab = (a: number) => pulse(t, a, 0.5);
          const d = dab(1.0) + dab(1.9) + dab(3.4);
          p().add('leg.FL', (-52 - 22 * d) * k);
          p().add('leg.FL', -30 * ramp(t, 0.8, 1.2) * (1 - ramp(t, 4.2, 4.5)));
          if (d > 0.6) this.ripple = 1;
          if (t > 2.8 && t < 3.3) {
            // The flick: paw up and shaken, a face pulled.
            p().add('leg.FL', -50 + 30 * sin(t, 8));
            p().add('head', -10, -20);
            this.emote = 'cross';
          }
          if (t > 4.4) {
            this.emote = 'happy';
            p().add('head', -8 * k, 0, 6 * sin(t, 0.8));
          }
          const n = (t > 1.0 ? 1 : 0) + (t > 1.9 ? 1 : 0) + (t > 3.4 ? 1 : 0);
          if (n > this.run.n) {
            this.run.n = n;
            p().kick('tail.2', 0, 0, 300);
          }
        },
      },
      // Can't keep still: up and down the floor with her tail low and her head swinging.
      prowl: {
        weight: 1.6,
        length: [7, 7],
        when: stand,
        start: () => {
          this.posture = 'stand';
          const r = this.heightPx * 2.2;
          const [lo, hi] = this.span(this.env.frame);
          const c = clamp(this.s + this.roomy() * r * 0.6, lo + r, hi - r);
          this.go([
            { s: c - r, depth: Math.random() },
            { s: c + r, depth: Math.random() },
            { s: c - r * 0.5, depth: Math.random() },
            { s: c + r * 0.5, depth: Math.random() },
          ]);
        },
        pose: (t) => {
          this.boost = 1.5;
          p().add('head', 0, 22 * sin(t, 0.8));
          p().add('body', 4);
          this.emote = 'neutral';
          this.pupils = 0.7;
          if (this.atStop && t > 0.5) this.endAct();
        },
      },
      // Scrabbles up the side wall of the box and gets halfway before she drops back.
      climb: {
        weight: 1,
        length: [6, 6],
        when: stand,
        start: () => {
          this.posture = 'stand';
          const [lo, hi] = this.span(this.env.frame);
          this.run.dir = this.s - lo < hi - this.s ? -1 : 1;
          this.walkTo(this.run.dir < 0 ? lo + 30 : hi - 30, this.depth);
        },
        pose: (t) => {
          if (this.run.phase === 0) {
            if (!this.atStop && t < 2.5) return;
            this.run.phase = 1;
            this.run.at = t;
          }
          const w = t - this.run.at;
          const up = ramp(w, 0, 0.5) * (1 - ramp(w, 2.6, 3.3));
          const a = sin(w, 3);
          p().add('root', -42 * up);
          this.backLegs(26 * up);
          p().add('leg.FL', (-112 - 35 * a) * up);
          p().add('leg.FR', (-112 + 35 * a) * up);
          p().add('head', 18 * up);
          this.extraLift = 0.05 * ramp(w, 0.3, 1.6) * (1 - ramp(w, 2.2, 3.2));
          this.emote = w > 2.4 ? 'surprised' : 'focused';
          this.pupils = 1;
          if (w > 3.2 && !this.run.done) {
            this.run.done = true;
            this.hop.kick(1.6);
            p().kick('tail.1', 0, 0, 400);
          }
        },
      },
      // Up on her hind legs, front paws on an imaginary ledge, looking right over it.
      rearLook: {
        weight: 1,
        length: [5, 5],
        when: stand,
        start: () => (this.posture = 'stand'),
        pose: (t) => {
          const k = ramp(t, 0, 0.7) * (1 - ramp(t, 4.2, 4.9));
          p().add('root', -30 * k);
          p().add('body', -8 * k);
          this.backLegs(30 * k);
          this.frontLegs(-85 * k);
          p().add('head', (14 + 6 * sin(t, 0.5)) * k, 28 * sin(t, 0.35) * k);
          this.extraLift = 0.012 * k;
          this.pupils = 0.9;
          this.twitch(t, 10 * k, 3);
        },
      },
    };
  }

  private bones() {
    return this.anatomy.tail;
  }
}
