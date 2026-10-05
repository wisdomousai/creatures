import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { Bird, ease, type Reaction, span } from './birds';
import { sin } from './moves';
import { Spring } from './spring';

/**
 * Mango, the robot toucan: bold, goofy and front-heavy. A black barrel of a body with a
 * pale bib and a chest lamp, a bright blue face plate round the screen, and the beak: huge,
 * in banded plates (yellow, orange, red-orange, a dark tip) curving down, the lower half on
 * its own jaw so it clacks. His wing tips are lights, and a glowing berry (scaled to
 * nothing unless he has one) rides at the tip of his beak.
 *
 * Everything he does to get about is a hop, both feet together, the beak bobbing. He clacks
 * his beak in quick runs, tosses a berry up and catches it (twice, the second higher), then
 * swallows it with his head thrown back, sweeps his head round like a crane, bounces to a
 * beat with his wing lights going, preens along a wing with all that beak, and goes to sleep
 * the toucan way, beak tucked into his back and his tail flipped up over it.
 *
 * A poke makes him squawk, beak wide, wings flung out and a hop; three make him dizzy; the
 * mouse resting on him makes him bob and flash his wing lights.
 */
export const TOUCAN_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.29, 0.5],
    [0.71, 0.5],
  ],
  rx: 0.1,
  ry: 0.22,
  line: 0.04,
  mouth: null,
};

const SIDES = [
  ['L', 1],
  ['R', -1],
] as const;
/** How far up the berry goes when tossed, in metres (the model's). */
const PEAK = 0.45;

export class Toucan extends Bird {
  static readonly terms =
    'black white bib blue orange yellow red huge big beak banded tropical hop clack berry fruit toss catch bounce goofy';

  /** Held by the pointer, it flies after it. */
  readonly flies = true;
  private berryS = new Spring(7, 0.5, 1.4);
  private openS = new Spring(5, 0.5, 1.2);
  private tuckS = new Spring(2.2, 0.8);
  private turn = new Spring(1.6, 0.8);
  // Per-frame requests from acts, cleared in idle().
  private berry = 0;
  private berryUp = 0;
  private jaw = 0;
  private wings = 0;
  private hop = 0;
  private tuck = 0;
  private glow = 0;
  private dance = 0;
  private actSpeed = 1.0;
  private dir = 1;
  private did = 0;
  private lift = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Mango',
        model: 'toucan',
        metres: 0.54,
        width: 0.42,
        size: 0.95,
        feels: {
          default: { f: 4, zeta: 0.6 },
          root: { f: 4, zeta: 0.5 },
          body: { f: 4, zeta: 0.45 },
          head: { f: 4.5, zeta: 0.45, r: 0.5 },
          jaw: { f: 9, zeta: 0.4 },
          tail: { f: 4, zeta: 0.4 },
          'wing.L': { f: 4, zeta: 0.45 },
          'wing.R': { f: 4, zeta: 0.45 },
          'leg.L': { f: 7, zeta: 0.6 },
          'leg.R': { f: 7, zeta: 0.6 },
        },
        face: TOUCAN_FACE,
        eyes: 0.9,
        gaze: [
          { bone: 'head', yaw: 0.85, pitch: 0.85 },
          { bone: 'body', yaw: 0.15, pitch: 0 },
        ],
        reach: { yaw: 60, pitch: 30 },
        lag: 1.0,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [50, 110],
        speed: 1.0,
        turn: 70,
        roam: true,
      },
      model,
    );
    this.acts = {
      ...this.moves(),
      ...this.beakTricks(),
      ...this.rests(),
      ...this.reactions(),
    };
  }

  // ---------- Getting about ----------

  private moves(): Record<string, Act> {
    return {
      idle: { weight: 3, length: [3, 6] },
      hopAlong: {
        weight: 2,
        length: [4, 6],
        when: this.still,
        start: () => this.amble(1.5 + Math.random() * 2.5),
      },
      sweep: {
        weight: 1.2,
        length: [6, 8],
        face: 'surprised',
        when: this.still,
        pose: (t) => {
          // The head sweeping slowly round, the beak like a crane's arm, looking for
          // someone.
          const k = span(t, 0.4, 1.2, this.actLength - 1.2, this.actLength - 0.3);
          this.puppet.add('head', -6 * k, 75 * sin(t, 0.28) * k, 0);
          this.puppet.add('body', -4 * k, 25 * sin(t, 0.28, -0.1) * k, 0);
          this.puppet.add('tail', 0, -14 * sin(t, 0.28) * k, 0);
        },
      },
      bounce: {
        weight: 1.3,
        length: [5, 7],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // Bouncing to a beat on both feet, beak nodding, wing lights going.
          const k = this.fade(t, 0.5);
          const beat = Math.sin(2 * Math.PI * 2.2 * t);
          this.lift = this.heightPx * 0.07 * Math.abs(beat) * k;
          this.hop = Math.abs(beat) * k;
          this.puppet.add('head', 14 * beat * k, 10 * sin(t, 0.5) * k, 0);
          this.puppet.add('body', -5 * Math.abs(beat) * k);
          this.puppet.add('tail', 10 * beat * k);
          this.wings = 0.1 * k;
          this.dance = k;
          this.glow = k;
        },
      },
      preen: {
        weight: 1.1,
        length: [6, 8],
        when: this.still,
        start: () => (this.dir = Math.random() < 0.5 ? -1 : 1),
        pose: (t) => {
          // Twists right round and runs the great beak along a wing.
          const k = span(t, 0.4, 1.2, this.actLength - 1.2, this.actLength - 0.3);
          const nib = Math.max(0, sin(t, 2.6)) * k;
          this.puppet.add('body', 6 * k, this.dir * 20 * k, 0);
          this.puppet.add('head', 30 * k + 6 * nib, this.dir * 105 * k, this.dir * 8 * k);
          this.jaw = 10 * nib;
          this.expression = k > 0.5 ? 'sleepy' : 'neutral';
        },
      },
    };
  }

  // ---------- The beak ----------

  private beakTricks(): Record<string, Act> {
    return {
      clack: {
        weight: 2,
        length: [3, 4.4],
        face: 'determined',
        when: this.still,
        pose: (t) => {
          // Clack-clack-clack: bursts of the beak snapping shut, head jerking with each.
          const k = this.fade(t, 0.3);
          const run = Math.max(0, Math.sin(2 * Math.PI * 0.8 * t)) > 0.25 ? 1 : 0;
          const c = Math.sin(2 * Math.PI * 5.5 * t) > 0 ? 1 : 0;
          this.jaw = 26 * c * run * k;
          this.puppet.add('head', 6 * (1 - c) * run * k - 4 * k);
          this.puppet.add('body', -3 * (1 - c) * run * k);
        },
      },
      toss: {
        weight: 2,
        length: [10.5, 11],
        face: 'happy',
        when: this.still,
        start: () => (this.did = 0),
        pose: (t) => this.toss(t),
      },
    };
  }

  /** Tosses a berry up and catches it, twice (the second higher), then swallows it. */
  private toss(t: number) {
    const p = this.puppet;
    // [start of toss, flight time, peak share]
    const tosses = [
      [1.3, 1.0, 0.7],
      [4.1, 1.3, 1],
    ];
    this.berry = ease(t, 0.1, 0.6) * (1 - ease(t, 8.6, 8.8));
    let air = 0;
    let look = 0;
    let wind = 0;
    let catching = 0;
    for (const [at, fly, peak] of tosses) {
      const u = (t - at) / fly;
      // Crouch and dip before the throw, flick up at it.
      wind += span(t, at - 0.6, at - 0.05, at, at + 0.2) * 1;
      if (u >= 0 && u <= 1) {
        air = 4 * u * (1 - u) * peak;
        look = span(u, 0, 0.15, 0.7, 1);
        catching = ease(u, 0.6, 0.95);
      } else if (u > 1) catching = Math.max(catching, 1 - ease(u, 1, 1.25));
      // The beak opens as the berry comes down and snaps shut on it.
      if (u > 0.55 && u < 1.0) this.jaw = Math.max(this.jaw, 34 * ease(u, 0.55, 0.85));
      if (u >= 1 && u < 1.12) this.jaw = Math.max(this.jaw, 34 * (1 - ease(u, 1, 1.1)));
    }
    this.berryUp = air * PEAK;
    p.add('head', -10 * look + 22 * wind - 8 * catching);
    p.add('body', 8 * wind - 6 * look);
    p.add('leg.L', -14 * wind);
    p.add('leg.R', -14 * wind);
    p.add('tail', 10 * look);
    // Caught the second time: a happy hop. Then swallowed: head flung back, beak wide.
    const gulp = span(t, 8.3, 8.8, 9.6, 10.2);
    p.add('head', -34 * gulp);
    p.add('body', -8 * gulp);
    this.jaw = Math.max(this.jaw, 30 * span(t, 8.3, 8.6, 9.0, 9.4));
    this.glow = Math.max(0.6 * this.berry, gulp);
    this.wings = 0.15 * gulp;
    this.expression = gulp > 0.4 ? 'starry' : 'happy';
  }

  // ---------- Resting ----------

  private rests(): Record<string, Act> {
    return {
      nap: {
        weight: 1.2,
        length: [12, 18],
        when: this.still,
        start: () => (this.dir = Math.random() < 0.5 ? -1 : 1),
        pose: (t) => {
          // The toucan way: the beak laid back along his body, the tail flipped up over it.
          const k = span(t, 1, 3, this.actLength - 2.5, this.actLength - 0.5);
          this.tuck = k;
          this.expression = k > 0.4 ? 'asleep' : 'sleepy';
          this.puppet.add('body', 4 * k * sin(t, 0.2));
        },
      },
    };
  }

  protected react(kind: Reaction, t: number) {
    const p = this.puppet;
    if (kind === 'poked') {
      // A squawk: beak wide, wings flung out, a hop, the wing lights flashing.
      const k = span(t, 0, 0.1, 1, 1.6);
      this.jaw = 38 * span(t, 0.05, 0.15, 0.6, 0.9);
      this.wings = 0.9 * k;
      this.lift = this.heightPx * 0.25 * (t < 0.5 ? Math.sin((Math.PI * t) / 0.5) : 0);
      this.hop = t < 0.5 ? 1 : 0;
      this.glow = k;
      this.dance = k;
      p.add('head', -16 * span(t, 0.05, 0.2, 0.5, 0.9));
      p.add('tail', 14 * k);
    } else if (kind === 'dizzy') {
      const k = 1 - ease(t, 2.4, 3.4);
      p.add('head', 10 * k * Math.cos(t * 5), 18 * k * Math.sin(t * 3), 26 * k * Math.sin(t * 5));
      p.add('body', 0, 0, 10 * k * Math.sin(t * 5));
      p.add('root', 0, 0, 7 * k * Math.sin(t * 5));
      this.wings = 0.25 * k;
      this.glow = k;
    } else {
      const k = this.fade(t, 0.6);
      p.add('head', 14 * k * Math.sin(t * 7), 0, 6 * k * sin(t, 1.2));
      p.add('body', -4 * k);
      p.add('tail', 0, 0, 10 * k * sin(t, 2.4));
      this.dance = k;
      this.glow = k;
    }
  }

  // ---------- Posing ----------

  protected idle(t: number) {
    const p = this.puppet;
    this.berry = 0;
    this.berryUp = 0;
    this.jaw = 0;
    this.wings = 0;
    this.hop = 0;
    this.tuck = 0;
    this.glow = 0;
    this.dance = 0;
    this.lift = 0;
    this.actSpeed = 1.0;
    this.expression = this.hovered ? 'happy' : 'neutral';
    // Front-heavy: the beak makes the head nod and cock now and then.
    const n = Math.floor(t / 3.1);
    const hold =
      Math.abs(Math.sin(n * 71.3)) > 0.5 && t % 3.1 < 1.3 ? Math.sign(Math.sin(n * 7.7)) : 0;
    p.add('head', 2 * sin(t, 0.33), 3 * sin(t, 0.13), 10 * hold * Math.min(1, (t % 3.1) * 5));
    p.add('body', 1.2 * sin(t, 0.3));
    p.add('tail', 2 * sin(t, 0.45));
    p.add('wing.L', 0, 0, 1.2 * sin(t, 0.21));
    p.add('wing.R', 0, 0, 1.2 * sin(t, 0.21, 0.4));
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    this.env = env;
    this.spec.speed = this.actSpeed;
    this.enjoy(dt, this.still());
    const H = this.heightPx;

    // Hopping along: both feet together, the beak bobbing with each hop.
    const moving = clamp(this.stride / (H * 0.7), 0, 1);
    let air = this.hop;
    if (moving > 0.05) {
      const ph = this.gait * 2;
      air = Math.abs(Math.sin(ph)) * moving;
      const land = Math.cos(ph) * moving;
      this.lift = H * 0.11 * air;
      p.add('body', 6 * land, 0, 0);
      p.add('head', -8 * land + 4 * air);
      p.add('tail', 8 * land);
      this.wings += 0.12 * air;
    }
    this.h = this.lift;
    // Legs tuck in the air and push down on the ground.
    p.add('leg.L', 30 * air);
    p.add('leg.R', 30 * air);

    // The beak: the lower half opens (and snaps shut a touch quicker than it opens).
    p.add('jaw', this.jaw);
    // Wings out for balance or a squawk.
    const open = this.openS.update(dt, this.wings);
    for (const [sfx, side] of SIDES) p.add(`wing.${sfx}`, -6 * open, 0, side * 62 * open);

    // Asleep: the head laid back along the body, the tail up over it.
    // Standing, he turns three-quarters on toward the middle so the beak shows its length.
    const middle = (env.frame.left + env.frame.right) / 2;
    const turn = this.turn.update(dt, this.walking ? 0 : Math.sign(middle - this.s) * 50);
    p.add('root', 0, turn);
    p.add('head', 0, -turn * 0.6);
    const tuck = this.tuckS.update(dt, this.tuck);
    if (tuck > 0.01) {
      p.add('head', 36 * tuck, this.dir * 150 * tuck, this.dir * 20 * tuck);
      p.add('body', 6 * tuck);
      p.add('tail', -78 * tuck);
      p.add('root', 0, 0, 0);
      for (const [sfx, side] of SIDES) p.add(`wing.${sfx}`, 0, 0, side * -3 * tuck);
    }
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    // The berry: it appears at the beak's tip, and goes where it is thrown.
    const s = Math.max(0.001, this.berryS.update(dt, this.berry));
    p.stretch('berry', s, [0, 1, 0], s);
    p.shift('berry', 0, this.berryUp, 0);
    this.lights(env.time);
  }

  /** The wing tips run through the colours when he's happy; the chest lamp shows the mood. */
  private lights(t: number) {
    const tone = this.expression === 'neutral' ? BEACON.happy : BEACON[this.expression];
    const asleep = this.tuckS.y;
    const lamp = clamp(0.35 + 0.65 * this.glow - 0.28 * asleep + (this.hovered ? 0.3 : 0), 0, 1);
    this.outfit.dot(2, lamp, tone);
    let tip = 0.2 + 0.5 * Math.max(0, Math.sin(t * 1.3)) ** 6;
    let colour: string | undefined;
    if (this.dance > 0.05) {
      tip = 0.2 + 0.8 * Math.max(0, Math.sin(t * 9)) * this.dance;
      colour = RAINBOW[Math.floor(t * 6) % RAINBOW.length];
    }
    if (this.act === 'dizzy') {
      tip = Math.random() < 0.5 ? 1 : 0.2;
      colour = RAINBOW[Math.floor(Math.random() * RAINBOW.length)];
    }
    this.outfit.dot(1, clamp(tip * (1 - 0.8 * asleep), 0, 1), colour);
    this.outfit.dot(0, 1, '#ffb23a');
    this.outfit.beacon(tone ?? '#ffb347');
  }
}
