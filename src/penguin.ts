import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Act, Character, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import { Spring } from './spring';

/**
 * Waddle, the robot penguin: a chubby, earnest bowling-pin of a toy with a pale belly
 * plate, a screen face with big eyes, a small wedge beak that opens to squawk, stubby
 * flippers on ball joints, a short tail wedge and big flat paddle feet.
 *
 * He waddles (small quick steps, the whole body rocking side to side over each foot,
 * flippers held out for balance) and he tobogganes: flops onto his belly, feet trailing,
 * and glides across the floor pushing with his flippers, then hops back up. Around that
 * he flaps for joy, tap-dances, bows, struts, shivers with his flippers hugging himself,
 * does the ecstatic display (head up, flippers back, a long squawk), belly-flops, trips
 * and slides, dives into the back of the box like it was water and pops up again, shakes
 * himself off, preens, tilts his head, does a double-take, waves, sneezes, hiccups,
 * spins, peers out from the back wall and over the front lip, and dozes on his feet with
 * his head tucked down. With company he offers a crewmate a glowing pebble (penguins
 * court with pebbles), huddles up beside them, or copies their look. Alone he stacks
 * three pebbles into a little pyramid and admires it. The pebbles are part of him for
 * now: each hides on its own bone, scaled to nothing, until an act needs it.
 *
 * Two cheek dots and a row of three belly lights show what he feels, and the chest lamp
 * takes the mood's colour; a poke sends him hopping with a squawk, three make him dizzy,
 * and the mouse resting on him makes him flap happily.
 */
export const PENGUIN_FACE: FaceLayout = {
  width: 512,
  height: 288,
  eyes: [
    [0.28, 0.5],
    [0.72, 0.5],
  ],
  rx: 0.11,
  ry: 0.3,
  line: 0.04,
  mouth: null,
};

const SIDES = [
  ['L', 1],
  ['R', -1],
] as const;
const ease = (t: number, a: number, b: number) => {
  const u = clamp((t - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
};
/** Fades in over a..b, holds, and fades out over c..d. */
const span = (t: number, a: number, b: number, c: number, d: number) =>
  ease(t, a, b) * (1 - ease(t, c, d));
/** A bump from 0 to 1 and back over `length` seconds, starting at `at`. */
const bump = (t: number, at: number, length: number) =>
  t > at && t < at + length ? Math.sin(((t - at) / length) * Math.PI) : 0;

/** How big the belly is, so a lying body rides on it (metres). */
const BELLY = 0.17;

export class Penguin extends Character {
  private env: Env | null = null;
  private lieS = new Spring(3, 0.55, 1.2);
  private pebS = [new Spring(5, 0.5, 1.4), new Spring(5, 0.5, 1.4), new Spring(5, 0.5, 1.4)];
  private pokes: number[] = [];
  private hover = 0;
  private dir = 1;
  private did = 0;
  private slid = false;
  private lit = 0;
  private bounce = 0;
  // Per-frame requests from acts, cleared in idle().
  private lieReq = 0;
  private lift = 0;
  private open = 0;
  private flap = 0;
  private hug = 0;
  private shiver = 0;
  private spin = 0;
  private shake = 0;
  private pebbles: [number, number, number] = [0, 0, 0];
  private pebbleAt: [number, number, number][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  private glow = 0;
  private chase = 0;
  private actSpeed = 0.85;
  private actTurn = 55;

  constructor(model: Object3D) {
    super(
      {
        name: 'Waddle',
        model: 'penguin',
        metres: 0.62,
        width: 0.46,
        size: 1.0,
        feels: {
          default: { f: 4, zeta: 0.6 },
          root: { f: 3.5, zeta: 0.55 },
          body: { f: 3.5, zeta: 0.5 },
          head: { f: 4, zeta: 0.5, r: 0.5 },
          jaw: { f: 8, zeta: 0.4 },
          tail: { f: 5, zeta: 0.35 },
          'wing.L': { f: 4.5, zeta: 0.4 },
          'wing.R': { f: 4.5, zeta: 0.4 },
          'leg.L': { f: 7, zeta: 0.6 },
          'leg.R': { f: 7, zeta: 0.6 },
        },
        face: PENGUIN_FACE,
        eyes: 0.84,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.9 },
          { bone: 'body', yaw: 0.15, pitch: 0 },
        ],
        reach: { yaw: 60, pitch: 30 },
        lag: 1.1,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [60, 130],
        speed: 0.85,
        turn: 55,
        roam: true,
      },
      model,
    );
    this.acts = {
      ...this.walks(),
      ...this.slides(),
      ...this.shows(),
      ...this.quirks(),
      ...this.social(),
      ...this.reactions(),
    };
  }

  // ---------- Who and where ----------

  private mates() {
    return (this.env?.crew ?? [])
      .filter((o) => o !== this && o.state === 'here' && o.edge === this.edge && !o.free)
      .sort((a, b) => Math.abs(a.s - this.s) - Math.abs(b.s - this.s))
      .filter((o) => Math.abs(o.s - this.s) < this.heightPx * 12);
  }

  private still = () => !this.walking && !this.door && !this.free && this.edge === 'bottom';

  private room(): [number, number] {
    if (!this.env) return [1, 0];
    const [lo, hi] = this.span(this.env.frame);
    const way = this.s - lo > hi - this.s ? -1 : 1;
    return [way, (way > 0 ? hi - this.s : this.s - lo) - this.widthPx() * 1.2];
  }

  private amble(heights: number, depth?: number, way?: number) {
    const [more, room] = this.room();
    const w = way ?? (Math.random() < 0.7 ? more : -more);
    const far = Math.min(Math.max(room, 0), this.heightPx * heights);
    this.walkTo(this.s + w * Math.max(far, this.heightPx * 0.6), depth);
  }

  /** 0..1 over an act: eases in and out at its ends. */
  private fade(t: number, e = 0.5) {
    return ease(t, 0, e) * (1 - ease(t, this.actLength - e, this.actLength));
  }

  // ---------- Walking about ----------

  private walks(): Record<string, Act> {
    return {
      idle: { weight: 4, length: [3, 6] },
      stroll: {
        weight: 2.4,
        length: [3, 5],
        when: this.still,
        start: () => this.amble(2 + Math.random() * 3),
      },
      strut: {
        weight: 1.2,
        length: [4, 6],
        face: 'happy',
        when: this.still,
        start: () => this.amble(3 + Math.random() * 2),
        pose: () => {
          // Slow and proud: chest out, chin up, flippers swept back, a wide roll.
          const p = this.puppet;
          this.actSpeed = 0.5;
          p.add('body', -9);
          p.add('head', -10);
          p.add('tail', 14);
          this.open = 0.25;
          for (const [w] of SIDES) p.add(`wing.${w}`, 28);
        },
      },
      peekBack: {
        weight: 0.9,
        length: [10, 12],
        when: this.still,
        start: () => {
          this.did = 0;
          this.amble(3, 0.95, Math.random() < 0.5 ? -1 : 1);
        },
        pose: (t) => {
          this.actSpeed = 1.1;
          const at = this.depth > 0.85 && !this.walking;
          if (at && !this.did) this.did = t;
          const look = at ? span(t - this.did, 0, 0.5, 4.5, 5) : 0;
          this.puppet.add('head', -8 * look, 0, 20 * look * sin(t, 0.35));
          this.puppet.add('body', -3 * look);
          if (this.did && t - this.did > 5 && this.depth > 0.5) this.walkTo(this.s, 0.2);
          this.expression = look > 0.3 ? 'focused' : 'neutral';
        },
      },
      lookOver: {
        weight: 0.9,
        length: [8, 10],
        when: this.still,
        start: () => {
          this.did = 0;
          this.amble(2, 0);
        },
        pose: (t) => {
          this.actSpeed = 1.1;
          const at = this.depth < 0.05 && !this.walking;
          if (at && !this.did) this.did = t;
          const k = at ? span(t - this.did, 0, 0.7, 3.4, 4.2) : 0;
          this.puppet.add('body', 20 * k);
          this.puppet.add('head', 14 * k, 26 * sin(t, 0.4) * k);
          this.puppet.add('tail', 22 * k);
          this.open = 0.15 * k;
          if (this.did && t - this.did > 4.3) this.walkTo(this.s, 0.25);
          this.expression = k > 0.3 ? 'surprised' : 'neutral';
        },
      },
      pirouette: {
        weight: 0.6,
        length: [2.2, 2.4],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // A little twirl on the spot, flippers out, feet pattering.
          const k = ease(t, 0.2, 1.8);
          this.spin = 2 * Math.PI * k;
          this.open = 0.6;
          this.lift = 0.04 * Math.abs(sin(t, 3));
          this.puppet.add('leg.L', 25 * sin(t, 3));
          this.puppet.add('leg.R', -25 * sin(t, 3));
        },
      },
    };
  }

  // ---------- Sliding on the belly ----------

  /**
   * The belly slide: after a windup, set off along the floor and lie flat while gliding,
   * then (when it stops) stand up again. Returns true while he is down.
   */
  private slide(t: number, windup: number, heights: number, speed: number) {
    if (!this.slid && t > windup) {
      this.slid = true;
      this.amble(heights, this.depth);
    }
    if (this.slid) this.actSpeed = speed;
    const down = this.slid && (this.walking || t < windup + 1);
    this.lieReq = down ? 1 : 0;
    return down;
  }

  private slides(): Record<string, Act> {
    return {
      toboggan: {
        weight: 1.6,
        length: [6, 8],
        face: 'happy',
        when: this.still,
        start: () => {
          this.slid = false;
          this.did = 0;
        },
        pose: (t) => {
          const p = this.puppet;
          this.actTurn = 82;
          // Windup: lean, flippers back, a few little steps.
          const wind = span(t, 0, 0.5, 0.7, 0.9);
          p.add('body', 14 * wind);
          for (const [w] of SIDES) p.add(`wing.${w}`, 40 * wind);
          const down = this.slide(t, 0.85, 5 + Math.random() * 0.01, 2.6);
          if (down) {
            // Flippers pushing like oars, head up, feet trailing.
            for (const [w, side] of SIDES) {
              p.add(`wing.${w}`, 20, 0, side * (45 + 25 * sin(t + (side > 0 ? 0 : 0.25), 1.6)));
            }
            p.add('head', -55);
            p.add('leg.L', -25 + 8 * sin(t, 1.5));
            p.add('leg.R', -25 - 8 * sin(t, 1.5));
            this.chase = 1;
          } else if (this.slid) {
            // Up again, a shake of the head.
            p.add('head', 0, 0, 8 * Math.sin(t * 14) * span(t, 0, 0.1, 2, 3));
          }
        },
      },
      trip: {
        weight: 0.8,
        length: [5, 6],
        face: 'surprised',
        when: this.still,
        start: () => {
          this.slid = false;
          this.amble(1.2);
        },
        pose: (t) => {
          const p = this.puppet;
          this.actTurn = 82;
          // Walking along, then a stumble: flippers windmill, over he goes and slides.
          if (!this.slid) this.actSpeed = 0.9;
          const flail = span(t, 1.1, 1.3, 1.7, 2.0);
          p.add('body', 22 * flail);
          for (const [w, side] of SIDES)
            p.add(`wing.${w}`, -60 * flail, 0, side * 50 * flail * Math.sin(t * 20));
          if (t > 1.6 && !this.slid) {
            this.slid = true;
            this.goal = null;
            this.amble(2.4, this.depth);
          }
          if (this.slid) this.actSpeed = 2.0;
          const down = this.slid && (this.walking || t < 2.5);
          this.lieReq = down ? 1 : 0;
          if (down) {
            p.add('head', -40);
            for (const [w, side] of SIDES) p.add(`wing.${w}`, -70, 0, side * 30);
            p.add('leg.L', -30);
            p.add('leg.R', -30);
          } else if (this.slid) {
            this.expression = 'dizzy';
            p.add('head', 0, 0, 12 * Math.sin(t * 9) * span(t, 0, 0.1, 3.4, 4.6));
          }
        },
      },
      belly: {
        weight: 1,
        length: [4.2, 4.6],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          const p = this.puppet;
          // A hop, then a flat belly-flop with a thump; lies there a moment; pushes up.
          const air = bump(t, 0.5, 0.6);
          this.lift = 0.3 * air;
          p.add('body', -12 * air);
          this.open = 0.9 * air;
          this.lieReq = t > 1.1 && t < 3.0 ? 1 : 0;
          if (this.lieReq) {
            p.add('head', -70);
            for (const [w, side] of SIDES)
              p.add(`wing.${w}`, 0, 0, side * (75 + 6 * Math.sin(t * 6)));
            this.expression = t > 1.6 ? 'sleepy' : 'surprised';
          }
          if (t > 3 && t < 3.8) {
            // Push up: flippers pressing, a wobble.
            for (const [w, side] of SIDES) p.add(`wing.${w}`, 0, 0, side * 55 * bump(t, 3, 0.6));
          }
        },
      },
      dive: {
        weight: 0.8,
        length: [8.5, 9.5],
        face: 'focused',
        when: () => this.still() && this.depth < 0.5,
        start: () => {
          this.slid = false;
          this.did = 0;
        },
        pose: (t) => {
          const p = this.puppet;
          this.actTurn = 20;
          // Crouch, spring, and into the "water" at the back of the box.
          const crouch = span(t, 0, 0.5, 0.6, 0.8);
          p.add('body', 20 * crouch);
          for (const [w] of SIDES) p.add(`wing.${w}`, 45 * crouch);
          if (t > 0.6 && !this.slid) {
            this.slid = true;
            this.walkTo(this.s + (Math.random() - 0.5) * this.heightPx, 0.85);
          }
          if (this.slid) this.actSpeed = 2.4;
          const air = bump(t, 0.6, 0.7);
          this.lift = 0.45 * air;
          const under = t > 0.8 && t < 5.4;
          this.lieReq = under ? 1 : 0;
          if (under) {
            // Swimming: flippers rowing, head up, gentle bob.
            for (const [w, side] of SIDES)
              p.add(`wing.${w}`, 25 * sin(t, 1.8, side > 0 ? 0 : 0.5), 0, side * 60);
            p.add('head', -50);
            this.chase = 1;
            this.expression = 'happy';
          }
          if (t > 5.4 && !this.did) {
            // Pop up: a hop, a shake, then back to the front.
            this.did = 1;
            this.walkTo(this.s, 0.2);
          }
          const pop = bump(t, 5.4, 0.6);
          this.lift += 0.3 * pop;
          this.open = Math.max(this.open, 0.8 * pop);
          this.shake = span(t, 6.2, 6.4, 7.4, 7.7);
          if (t > 5.4) this.actSpeed = 1.2;
        },
      },
    };
  }

  // ---------- Showing off ----------

  private shows(): Record<string, Act> {
    return {
      flap: {
        weight: 1.5,
        length: [2.2, 3],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // Happy flapping: flippers whirring, little hops, a wagging tail.
          const k = this.fade(t, 0.3);
          this.open = 0.75 * k;
          this.flap = 22 * k * Math.sin(t * 24);
          this.lift = 0.1 * k * Math.abs(Math.sin(t * 6));
          this.puppet.add('tail', 0, 0, 20 * k * Math.sin(t * 12));
          this.glow = k;
        },
      },
      ecstatic: {
        weight: 1,
        length: [3.4, 4],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // The ecstatic display: chest out, head thrown back, flippers back, a long squawk.
          const p = this.puppet;
          const k = span(t, 0, 0.6, this.actLength - 0.7, this.actLength);
          p.add('body', -14 * k);
          p.add('head', -20 * k, 0, 0);
          p.add('jaw', 26 * k * (0.7 + 0.3 * Math.sin(t * 16)) * ease(t, 0.6, 0.8));
          p.add('tail', 22 * k);
          this.open = 0.4 * k;
          for (const [w, side] of SIDES) p.add(`wing.${w}`, 60 * k, 0, side * 25 * k);
          this.glow = k;
          this.chase = k;
        },
      },
      hop: {
        weight: 1.1,
        length: [2.4, 3],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // Hop-hop-hop on the spot, both feet together, flippers bouncing.
          const k = this.fade(t, 0.3);
          const h = Math.abs(Math.sin(t * 6.5));
          this.lift = 0.12 * h * k;
          this.open = 0.35 * k * h;
          this.puppet.add('body', -6 * k * h);
          this.puppet.add('leg.L', 14 * h * k);
          this.puppet.add('leg.R', 14 * h * k);
          this.chase = 0.6 * k;
        },
      },
      flapFail: {
        weight: 0.9,
        length: [4.4, 5],
        face: 'focused',
        when: this.still,
        pose: (t) => {
          // Tries to fly: crouch, furious flapping, a jump that goes nowhere, plop, a sigh.
          const p = this.puppet;
          const crouch = span(t, 0.2, 0.7, 0.9, 1.1);
          p.add('body', 16 * crouch);
          const fl = span(t, 1.0, 1.2, 2.6, 2.9);
          this.flap = 34 * fl * Math.sin(t * 30);
          this.open = 0.9 * fl;
          this.lift = 0.22 * bump(t, 1.0, 1.7) * 0.5 + 0.06 * fl * Math.abs(Math.sin(t * 9));
          p.add('body', -10 * fl);
          p.add('tail', 0, 0, 20 * fl * Math.sin(t * 30));
          const sad = span(t, 2.9, 3.1, 4.2, 4.6);
          p.add('head', 22 * sad);
          p.add('body', 8 * sad);
          p.add('jaw', 10 * bump(t, 3.3, 0.7));
          this.expression = sad > 0.3 ? 'sad' : fl > 0.3 ? 'surprised' : 'focused';
          this.glow = fl;
        },
      },
      squawk: {
        weight: 0.9,
        length: [2.2, 2.6],
        face: 'surprised',
        when: this.still,
        pose: (t) => {
          // A surprised squawk: head back, jaw wide, flippers flung out, twice.
          const p = this.puppet;
          const s = bump(t, 0.3, 0.6) + bump(t, 1.1, 0.6);
          p.add('jaw', 42 * s);
          p.add('head', -22 * s);
          p.add('body', -8 * s);
          this.open = 0.8 * s;
          this.lift = 0.05 * s;
          this.glow = s;
          this.chase = s;
        },
      },
      waveBoth: {
        weight: 0.9,
        length: [2.8, 3.4],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // Both flippers up and waving, body swaying.
          const k = this.fade(t, 0.5);
          for (const [w, side] of SIDES)
            this.puppet.add(
              `wing.${w}`,
              0,
              0,
              side * (95 * k + 14 * k * Math.sin(t * 11 + (side > 0 ? 0 : 1.5))),
            );
          this.puppet.add('body', 0, 0, 5 * k * sin(t, 1.2));
          this.puppet.add('head', 0, 0, -6 * k * sin(t, 1.2));
          this.glow = 0.5 * k;
        },
      },
      bow: {
        weight: 1.1,
        length: [2.6, 3],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          const p = this.puppet;
          const k = span(t, 0, 0.6, 1.9, 2.5);
          p.add('body', 38 * k);
          p.add('head', 12 * k);
          p.add('tail', 22 * k);
          for (const [w] of SIDES) p.add(`wing.${w}`, 50 * k);
        },
      },
      dance: {
        weight: 1,
        length: [4.5, 6],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // Tap dance: feet drumming, the body swaying, head bobbing, flippers out.
          const p = this.puppet;
          const k = this.fade(t, 0.5);
          const beat = Math.sin(2 * Math.PI * 3 * t);
          p.add('leg.L', 26 * Math.max(0, beat) * k);
          p.add('leg.R', 26 * Math.max(0, -beat) * k);
          p.add('body', 0, 0, 8 * Math.sin(2 * Math.PI * 1.5 * t) * k);
          p.add('head', 6 * Math.abs(beat) * k, 0, -6 * Math.sin(2 * Math.PI * 1.5 * t) * k);
          this.open = 0.55 * k;
          this.flap = 8 * k * beat;
          this.lift = 0.03 * k * Math.abs(beat);
          this.chase = k;
          this.glow = 0.5 * k;
        },
      },
      shiver: {
        weight: 0.9,
        length: [4, 5.5],
        face: 'sad',
        when: this.still,
        pose: (t) => {
          // Brrr: a fine shake, flippers hugging the belly, shoulders up.
          const k = this.fade(t, 0.6);
          this.shiver = k;
          this.hug = k;
          this.puppet.add('body', 6 * k);
          this.puppet.add('head', 10 * k);
        },
      },
      shakeOff: {
        weight: 0.9,
        length: [2, 2.4],
        face: 'surprised',
        when: this.still,
        pose: (t) => {
          // Shaking off water: the body twisting back and forth, flippers flying out.
          const k = span(t, 0.1, 0.3, 1.5, 1.9);
          this.shake = k;
          this.open = 0.7 * k;
          this.puppet.add('head', 0, 0, 10 * k * Math.sin(t * 24));
        },
      },
      sleep: {
        weight: 0.6,
        length: [10, 15],
        face: 'asleep',
        when: this.still,
        pose: (t) => {
          // Dozing on his feet: head tucked down onto his chest, flippers folded, swaying.
          const k = ease(t, 0, 1.4) * (1 - ease(t, this.actLength - 1.2, this.actLength));
          this.puppet.add('head', 34 * k + 3 * sin(t, 0.22), 0, 6 * k);
          this.puppet.add('body', 6 * k + 3 * k * sin(t, 0.2), 0, 3 * k * sin(t, 0.16));
          this.hug = 0.6 * k;
          this.glow = 0;
        },
      },
    };
  }

  // ---------- Little quirks ----------

  private quirks(): Record<string, Act> {
    return {
      tilt: {
        weight: 1.5,
        length: [3, 4],
        face: 'focused',
        when: this.still,
        start: () => (this.dir = Math.random() < 0.5 ? -1 : 1),
        pose: (t) => {
          // A curious head tilt, one way and then a bit more, a flipper twitch.
          const k = this.fade(t, 0.4);
          this.puppet.add('head', 4 * k, 0, this.dir * (24 + 8 * sin(t, 0.5)) * k);
          this.puppet.add('body', 0, 0, -this.dir * 4 * k);
          this.puppet.add('wing.L', 0, 0, 10 * bump(t, 1.4, 0.4));
        },
      },
      doubleTake: {
        weight: 0.8,
        length: [2.4, 2.8],
        face: 'surprised',
        when: this.still,
        start: () => (this.dir = Math.random() < 0.5 ? -1 : 1),
        pose: (t) => {
          // Looks away, glances back, looks away and... back again, eyes wide.
          const p = this.puppet;
          const away = span(t, 0.1, 0.4, 0.7, 0.9);
          const back = span(t, 1.3, 1.5, 2.0, 2.3);
          p.add('root', 0, this.dir * 25 * away, 0);
          p.add('head', 0, this.dir * 25 * away, 0);
          p.add('head', -10 * back, 0, 0);
          p.add('body', -8 * back);
          this.open = 0.5 * back;
          this.lift = 0.06 * bump(t, 1.3, 0.3);
        },
      },
      wave: {
        weight: 1.2,
        length: [2.6, 3.2],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          const k = this.fade(t, 0.5);
          this.puppet.add('wing.L', 0, 0, 100 * k + 14 * k * Math.sin(t * 13));
          this.puppet.add('head', 0, 0, -8 * k);
          this.puppet.add('body', 0, 0, -3 * k);
        },
      },
      preen: {
        weight: 1.1,
        length: [3.4, 4.4],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // Beak down into his own flipper, nibbling, then a wiggle of the tail.
          const p = this.puppet;
          const k = this.fade(t, 0.5);
          p.add('head', 34 * k, 62 * k, 8 * k);
          p.add('jaw', 12 * Math.max(0, sin(t, 4.5)) * k);
          p.add('wing.L', -34 * k, 0, 6 * k);
          p.add('body', 5 * k, 0, -4 * k);
          if (t > this.actLength - 0.9) p.add('tail', 0, 0, 22 * Math.sin(t * 22));
        },
      },
      sneeze: {
        weight: 0.6,
        length: [2, 2.4],
        face: 'surprised',
        when: this.still,
        pose: (t) => {
          const p = this.puppet;
          const wind = span(t, 0.2, 1.0, 1.0, 1.1);
          const boom = bump(t, 1.0, 0.35);
          p.add('head', -22 * wind + 34 * boom);
          p.add('body', -8 * wind + 14 * boom);
          p.add('jaw', 30 * wind + 20 * boom);
          this.open = 0.5 * boom;
          this.lift = 0.08 * boom;
          this.glow = 1.2 * boom;
          this.expression = wind > 0.5 ? 'wink' : 'cross';
        },
      },
      hiccup: {
        weight: 0.6,
        length: [3, 3.4],
        face: 'surprised',
        when: this.still,
        pose: (t) => {
          const hic = bump(t, 0.6, 0.18) + bump(t, 1.5, 0.18) + bump(t, 2.3, 0.18);
          this.lift = 0.07 * hic;
          this.puppet.add('head', -10 * hic);
          this.puppet.add('jaw', 12 * hic);
          this.open = 0.3 * hic;
          this.chase = hic;
        },
      },
      yawn: {
        weight: 0.6,
        length: [3, 3.6],
        face: 'sleepy',
        when: this.still,
        pose: (t) => {
          const k = span(t, 0.3, 1.0, 2.0, 2.8);
          this.puppet.add('jaw', 40 * k);
          this.puppet.add('head', -20 * k);
          this.puppet.add('body', -6 * k);
          this.open = 0.4 * k;
        },
      },
    };
  }

  // ---------- With company, and pebbles ----------

  private hoard(t: number) {
    // Alone: three pebbles pop up one by one and he stacks them, pats the pile, admires
    // it, and they go again.
    const p = this.puppet;
    const pop = [ease(t, 0.5, 0.8), ease(t, 1.3, 1.6), ease(t, 2.1, 2.4)];
    const gone = ease(t, this.actLength - 0.8, this.actLength);
    this.pebbles = [pop[0] * (1 - gone), pop[1] * (1 - gone), pop[2] * (1 - gone)];
    // Stack: the two outer ones roll in, the first hops up on top.
    const build = ease(t, 2.6, 3.4);
    this.pebbleAt = [
      [0, 0.045 * build, -0.012 * build],
      [0.045 * build, 0, 0],
      [-0.045 * build, 0, 0],
    ];
    const look = span(t, 0.4, 0.8, 2.4, 3.0) + 0.3 * bump(t, 3.4, 0.6);
    p.add('body', 22 * look + 4 * span(t, 3.4, 3.8, 5.6, 6.2));
    p.add('head', 10 * look, 0, 0);
    const pat = bump(t, 3.5, 0.4) + bump(t, 4.0, 0.4);
    p.add('wing.L', -40 * pat);
    this.open = 0.15 * pat;
    this.lift = 0.05 * bump(t, 3.4, 0.3);
    this.expression = t > 3.4 ? 'love' : 'focused';
    this.glow = pop[2] * (1 - gone);
  }

  private social(): Record<string, Act> {
    const company = () => this.still() && this.mates().length > 0;
    return {
      hoard: {
        weight: 1,
        length: [7.5, 8],
        when: this.still,
        pose: (t) => this.hoard(t),
      },
      offer: {
        weight: 1.3,
        length: [10, 12],
        when: company,
        start: () => {
          this.did = 0;
          const m = this.mates()[0];
          if (!m) return;
          this.dir = Math.sign(m.s - this.s) || 1;
          this.walkTo(m.s - this.dir * this.heightPx * 1.1, m.depth);
        },
        pose: (t) => {
          // Walks over to a crewmate with a pebble, lays it in front of them, steps
          // back with his flippers behind him and looks pleased.
          const m = this.mates()[0];
          const p = this.puppet;
          this.actSpeed = 0.7;
          const at = !this.walking && this.actT > 1;
          if (at && !this.did) this.did = t;
          const s = this.did ? t - this.did : -1;
          const show = s < 0 ? (this.walking ? 1 : 0) : 1 - ease(s, 4.0, 4.6);
          this.pebbles = [Math.max(0, show), 0, 0];
          const hold = s < 0 ? 0.6 : span(s, 0, 0.5, 2.0, 2.6);
          const lay = span(s, 1.8, 2.5, 3.6, 4.2);
          this.pebbleAt = [
            [0, 0.06 * hold - 0.06 * lay * 0, 0.08 * ease(s, 1.8, 2.6)],
            [0, 0, 0],
            [0, 0, 0],
          ];
          p.add('body', 10 * hold + 20 * lay);
          p.add('head', 8 * hold + 10 * lay);
          for (const [w] of SIDES) p.add(`wing.${w}`, 40 * span(s, 0.5, 1.0, 3.5, 4));
          if (m && s > 0) p.add('head', 0, 0, 0);
          this.expression = s > 2.6 ? 'love' : 'focused';
          this.glow = s > 2.6 ? 0.8 : 0.3;
          if (m && s > 0)
            p.add('root', 0, (Math.sign(m.s - this.s) || 1) * 20 * ease(s, 0, 0.6), 0);
        },
      },
      huddle: {
        weight: 1,
        length: [7, 9],
        face: 'happy',
        when: company,
        start: () => {
          const m = this.mates()[0];
          if (!m) return;
          this.dir = Math.sign(m.s - this.s) || 1;
          this.walkTo(m.s - this.dir * this.heightPx * 0.8, m.depth);
        },
        pose: (t) => {
          // Snuggles up beside a crewmate, leaning into them, a happy little shiver.
          const p = this.puppet;
          this.actSpeed = 0.8;
          const near = this.walking ? 0 : 1;
          const k = near * ease(t, 1, 2) * (1 - ease(t, this.actLength - 1, this.actLength));
          p.add('body', 0, 0, -this.dir * 10 * k);
          p.add('head', 0, 0, -this.dir * 14 * k);
          p.add('root', 0, this.dir * 25 * k, 0);
          this.hug = 0.5 * k;
          this.shiver = 0.25 * k;
          this.glow = 0.6 * k;
          this.expression = k > 0.4 ? 'love' : 'neutral';
        },
      },
      watch: {
        weight: 1,
        length: [4.5, 6],
        face: 'focused',
        when: company,
        start: () => (this.dir = Math.random() < 0.5 ? -1 : 1),
        pose: (t) => {
          // Turns to a crewmate and watches, head tilting, a step closer.
          const m = this.mates()[0];
          if (!m) return;
          const toward = Math.sign(m.s - this.s) || 1;
          const k = this.fade(t, 0.6);
          this.puppet.add('root', 0, toward * 42 * k, 0);
          this.puppet.add('head', 4 * k, -toward * 20 * k, this.dir * 26 * k * Math.sin(t * 1.8));
          this.puppet.add('body', 4 * k);
        },
      },
    };
  }

  // ---------- Reactions ----------

  private reactions(): Record<string, Act> {
    return {
      poked: {
        weight: 0,
        length: [1.4, 1.6],
        face: 'surprised',
        pose: (t) => {
          // Straight up in the air, flippers flung out, a squawk.
          const up = bump(t, 0, 0.5);
          this.lift = 0.3 * up;
          this.open = 1 * span(t, 0, 0.1, 0.8, 1.3);
          this.flap = 16 * up * Math.sin(t * 30);
          this.puppet.add('jaw', 40 * span(t, 0.05, 0.15, 0.5, 0.8));
          this.puppet.add('head', -14 * span(t, 0.05, 0.2, 0.5, 0.9));
          this.glow = span(t, 0, 0.1, 0.8, 1.4);
          this.chase = up;
        },
      },
      dizzy: {
        weight: 0,
        length: [3.4, 3.8],
        face: 'dizzy',
        pose: (t) => {
          const k = 1 - ease(t, 2.4, 3.4);
          const p = this.puppet;
          p.add('head', 8 * k * Math.cos(t * 5), 0, 22 * k * Math.sin(t * 5));
          p.add('body', 0, 0, 12 * k * Math.sin(t * 5 + 1));
          p.add('root', 0, 0, 6 * k * Math.sin(t * 5));
          this.open = 0.6 * k;
          this.flap = 14 * k * Math.sin(t * 12);
          this.glow = 0.7 * k;
        },
      },
      pleased: {
        weight: 0,
        length: [3, 4],
        face: 'love',
        pose: (t) => {
          // The mouse resting on him: a happy flap, hopping a little.
          const k = this.fade(t, 0.5);
          this.open = 0.8 * k;
          this.flap = 20 * k * Math.sin(t * 22);
          this.lift = 0.09 * k * Math.abs(Math.sin(t * 5));
          this.puppet.add('head', 6 * k * Math.sin(t * 9), 0, 8 * k * sin(t, 1.2));
          this.puppet.add('tail', 0, 0, 20 * k * Math.sin(t * 11));
          this.glow = k;
          this.chase = k;
        },
      },
    };
  }

  poke() {
    if (this.state !== 'here') return;
    const now = performance.now() / 1000;
    this.pokes = [...this.pokes.filter((at) => now - at < 2.5), now];
    this.goal = null;
    this.slid = false;
    if (this.pokes.length >= 3) {
      this.pokes = [];
      this.setAct('dizzy');
    } else if (this.act !== 'dizzy') this.setAct('poked');
  }

  // ---------- Posing ----------

  protected idle(t: number) {
    const p = this.puppet;
    this.lieReq = 0;
    this.lift = 0;
    this.open = 0;
    this.flap = 0;
    this.hug = 0;
    this.shiver = 0;
    this.spin = 0;
    this.shake = 0;
    this.pebbles = [0, 0, 0];
    this.pebbleAt = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    this.glow = 0;
    this.chase = 0;
    this.actSpeed = 0.85;
    this.actTurn = 55;
    this.expression = this.hovered ? 'happy' : 'neutral';
    p.add('body', 1.2 * sin(t, 0.3));
    // A head that is never quite still, cocking now and then.
    const n = Math.floor(t / 3);
    const r = Math.abs(Math.sin(n * 91.7)) * 2;
    const hold = r > 1.1 && t % 3 < 1.3 ? Math.sign(Math.sin(n * 13.1)) : 0;
    p.add('head', 2 * sin(t, 0.35), 3 * sin(t, 0.13), 10 * hold * Math.min(1, (t % 3) * 6));
    p.add('tail', 0, 0, 3 * sin(t, 0.4));
    p.add('wing.L', 0, 0, 2 * sin(t, 0.21));
    p.add('wing.R', 0, 0, 2 * sin(t, 0.21, 0.4));
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    this.env = env;
    this.spec.speed = this.actSpeed;
    this.spec.turn = this.actTurn;

    this.hover = this.hovered ? this.hover + dt : 0;
    if (this.hover > 0.9 && this.act === 'idle' && this.still()) this.setAct('pleased');

    const lie = this.lieS.update(dt, this.lieReq);
    const H = this.heightPx;
    this.h = this.lift * H;

    // The waddle: a step for each foot, the body rocking over each in turn, flippers out
    // a little for balance, the tail wagging against the rock.
    const amt = clamp(this.stride / (H * 0.7), 0, 1) * (1 - lie);
    if (amt > 0.02) {
      const step = Math.sin(this.gait * 1.5);
      p.add('leg.L', 24 * step * amt);
      p.add('leg.R', -24 * step * amt);
      p.add('body', 0, 0, 11 * Math.cos(this.gait * 1.5) * amt);
      p.add('head', 0, 0, -6 * Math.cos(this.gait * 1.5) * amt);
      p.add('tail', 0, 0, -14 * Math.cos(this.gait * 1.5) * amt);
      for (const [w, side] of SIDES)
        p.add(`wing.${w}`, 0, 0, side * (14 + 10 * Math.cos(this.gait * 1.5)) * amt);
      this.bounce = 0.008 * Math.abs(step) * amt;
    } else this.bounce = 0;

    // Flippers, out (for balance, or joy) or hugged in against the belly.
    for (const [w, side] of SIDES) {
      p.add(`wing.${w}`, -10 * this.hug, 0, side * (this.open * 70 - this.hug * 14));
      if (this.hug) p.add(`wing.${w}`, -50 * this.hug);
    }

    // Lying on the belly: the whole body tipped forward on the floor, feet trailing.
    if (lie > 0.01) {
      p.add('root', 84 * lie);
      p.add('leg.L', 10 * lie);
      p.add('leg.R', 10 * lie);
      p.add('tail', -20 * lie);
    }

    // Pebbles pop in and out.
    this.pebS.forEach((s, i) => s.update(dt, this.pebbles[i]));
    this.lit = this.act === 'hoard' || this.act === 'offer' ? 1 : 0.9;
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    const t = env.time;
    const lie = this.lieS.y;

    // Lying rides on his belly, not his feet.
    p.shift('root', 0, BELLY * clamp(lie, 0, 1.1) + this.bounce, 0);

    // Direct quick motions.
    if (this.flap) for (const [w, side] of SIDES) p.turn(`wing.${w}`, 0, 0, side * this.flap);
    if (this.shiver) {
      p.turn('body', 0, 0, 2.4 * this.shiver * Math.sin(t * 80));
      p.turn('head', 0, 0, 1.6 * this.shiver * Math.sin(t * 70 + 1));
    }
    if (this.shake) {
      p.turn('body', 0, 30 * this.shake * Math.sin(t * 28), 0);
      p.turn('head', 0, -22 * this.shake * Math.sin(t * 28), 0);
      for (const [w, side] of SIDES)
        p.turn(`wing.${w}`, 0, 0, side * 20 * this.shake * Math.sin(t * 28));
    }
    this.pivot.rotation.y = this.spin;

    // Pebbles: scaled to nothing until needed.
    this.pebS.forEach((s, i) => {
      const v = Math.max(0.001, s.y);
      const name = `pebble.${i + 1}`;
      p.stretch(name, v, [0, 1, 0], v);
      const [x, y, z] = this.pebbleAt[i];
      p.shift(name, x, y, z);
    });

    this.lights(t, dt);
  }

  /** Cheek dots and belly lights show the mood; the chest lamp takes its colour. */
  private lights(t: number, _dt: number) {
    const act = this.act;
    const mood = this.acts[act]?.face ?? this.expression;
    const tone = mood === 'neutral' ? BEACON.happy : BEACON[mood];
    const g = this.glow;
    const cheek =
      act === 'dizzy'
        ? Math.random() < 0.5
          ? 1
          : 0.2
        : mood === 'asleep' || mood === 'sleepy'
          ? 0.12 + 0.08 * Math.sin(t * 0.9)
          : 0.3 + 0.7 * g + (this.hovered ? 0.4 : 0);
    const colour = act === 'dizzy' ? RAINBOW[Math.floor(Math.random() * RAINBOW.length)] : tone;
    this.outfit.dot(0, clamp(cheek, 0, 1), colour);
    this.outfit.dot(1, clamp(cheek, 0, 1), colour);
    this.outfit.dot(2, this.lit);
    // The belly row: a slow ripple at rest, a running chase when he is busy.
    for (let i = 0; i < 3; i++) {
      let level: number;
      if (mood === 'asleep') level = 0.08;
      else if (this.chase > 0.05)
        level = 0.15 + 0.85 * this.chase * Math.max(0, Math.cos(t * 9 - i * 1.4)) ** 2;
      else if (this.shiver) level = 0.2 + 0.4 * (Math.sin(t * 40 + i) > 0 ? 1 : 0);
      else level = 0.14 + 0.5 * Math.max(0, Math.cos(2 * Math.PI * (t / 5 - i * 0.07))) ** 10;
      this.outfit.dot(3 + i, clamp(level, 0, 1), colour);
    }
    this.outfit.beacon(act === 'dizzy' ? (colour ?? '#ffb347') : (tone ?? '#ffb347'));
  }
}
