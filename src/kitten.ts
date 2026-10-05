import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import type { Act, Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import type { Anatomy } from './pet';
import { KITTEN_ACT_MOODS, Kitty, kittenMoods, pulse, ramp } from './kitties';

/**
 * Bit, the robot kitten: a fluffy round tumbler, nearly all head and belly, on stubby
 * legs, with a stub of a tail that ends in a pom. She trots in along the frame line and
 * spends her stay on tricks: pouncing on nothing, stalking a crewmate (and bolting when
 * she gets close), zoomies, dozing off in mid-step, hopping sideways puffed up like a
 * bottle brush, kneading, tiny mews, chasing her pom, washing a paw until she tips over.
 * All her own: she curls up and rolls like a wheel across the floor, bats a ball about
 * and chases it, gets the hiccups and bounces stiff-legged like a spring. She trips over
 * her own feet, hops sideways at nothing, hisses a hiss that comes out as a squeak, bats
 * at her own whisker lights, gets stuck mid-stretch, yawns with her tongue curled, tries
 * to climb up a crewmate, nods off sitting up, chases a bubble of light and wiggles her
 * rump before deciding not to pounce.
 *
 * Her slit pupils swell when she is excited. The bell on her collar lights in the colour
 * of her mood and flashes when she shakes it; the pom, the ear hinges and the whisker tips
 * are lights too, and a tongue on its own bones stays tucked away until she yawns.
 */
export const KITTEN_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.29, 0.5],
    [0.71, 0.5],
  ],
  rx: 0.105,
  ry: 0.29,
  line: 0.03,
  mouth: [0.5, 0.8],
  kind: 'cat',
  pupil: 0.6,
};

const KITTEN: Anatomy = {
  tail: ['tail.1', 'tail.2'],
  tailAxis: [0, 0.4, -0.9],
  earsHang: false,
  moods: kittenMoods(),
  actMoods: {
    ...KITTEN_ACT_MOODS,
    trip: 'annoyed',
    sideHop: 'alarmed',
    hiss: 'alarmed',
    whiskerBat: 'curious',
    stuck: 'annoyed',
    yawn: 'sleepy',
    climb: 'curious',
    nodOff: 'sleepy',
    bubble: 'happy',
    wiggle: 'curious',
  },
  lying: 'sleepy',
  hover: 'happy',
  drop: { stand: 0, sit: -0.09, lie: -0.09 },
  sit: -22,
  turn: 40,
};

export class Kitten extends Kitty {
  static readonly terms =
    'kitty baby young tiny small fluffy round black charcoal dark grey gray white pink cream stubby pom tail trot pounce stalk zoomies';

  protected readonly anatomy = KITTEN;
  protected readonly build = {
    middle: 0.15,
    prop: { bone: 'ball', rest: [0.25, 0.13] as [number, number], radius: 0.045 },
    spring: 1,
    speed: 1.7,
  };

  constructor(model: Object3D) {
    super(
      {
        name: 'Bit',
        model: 'kitten',
        metres: 0.47,
        width: 0.36,
        size: 0.8,
        feels: {
          default: { f: 2.4, zeta: 0.5 },
          root: { f: 3, zeta: 0.55 },
          body: { f: 2.2, zeta: 0.6 },
          head: { f: 2, zeta: 0.5, r: 0.3 },
          'ear.L': { f: 5, zeta: 0.3 },
          'ear.R': { f: 5, zeta: 0.3 },
          'tail.1': { f: 2, zeta: 0.4 },
          'tail.2': { f: 2.6, zeta: 0.3 },
        },
        face: KITTEN_FACE,
        eyes: 0.66,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.9 },
          { bone: 'body', yaw: 0.2, pitch: 0 },
        ],
        reach: { yaw: 60, pitch: 30 },
        lag: 0.9,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 1.7,
      },
      model,
    );
    const all = this.tricks();
    const mine: Record<string, number> = {
      pounce: 1.6,
      stalk: 1.2,
      tailChase: 1,
      knead: 1,
      mew: 1.2,
      zoomies: 1,
      dozeOff: 0.8,
      puffCrab: 0.7,
      sneeze: 0.6,
      bell: 0.8,
      watch: 1,
      frontLip: 0.8,
      backWall: 0.8,
      circle: 0.8,
      tilt: 1,
      batAir: 0.8,
      dizzy: 0,
      purr: 0,
    };
    const common = this.commonActs();
    for (const k of ['idle', 'stroll', 'sit', 'nap', 'stand', 'stretch', 'startle'] as const) {
      this.acts[k] = common[k];
    }
    this.acts.lie = { ...common.lie, weight: 0.6 };
    for (const [name, weight] of Object.entries(mine)) this.acts[name] = { ...all[name], weight };
    Object.assign(this.acts, this.moves(), this.newTricks());
  }

  /** How far her tongue is out (0 tucked away, 1 out), how far its tip curls, and a flash
   * of the whisker lights: tricks set them each frame (idle resets them). */
  private tongue = 0;
  private curl = 0;
  private whisk = -1;

  protected idle(t: number) {
    this.tongue = 0;
    this.curl = 0;
    this.whisk = -1;
    super.idle(t);
  }

  protected after(dt: number, env: Env) {
    super.after(dt, env);
    const p = this.puppet;
    // The tongue: a plate and a tip on their own bones, scaled to nothing when tucked away.
    const k = Math.max(0, Math.min(1, this.tongue));
    p.stretch('tongue', k, [0, 1, 0], k);
    if (k > 0.01) p.turn('tongue.tip', -95 * this.curl, 0, 0);
    this.lights(env.time);
  }

  /** The lights: the pom (0), the tail's collar (1), the ear hinges (3), the whisker tips (4). */
  private lights(time: number) {
    const a = this.act;
    const o = this.outfit;
    if (!o) return;
    let tip = 0.55 + 0.15 * Math.sin(time * 0.9);
    let ears = 0.3;
    let whisker = 0.25 + 0.2 * Math.max(0, Math.sin(time * 0.8));
    let tone: string | undefined;
    const rainbow = (rate: number) => RAINBOW[Math.floor(time * rate) % RAINBOW.length];
    if (this.mood === 'asleep' || this.posture === 'lie') {
      tip = 0.12 + 0.15 * (0.5 + 0.5 * Math.sin(time * 1.1));
      ears = 0.05;
      whisker = 0.05;
    } else if (this.mood === 'sleepy') {
      tip = 0.25;
      ears = 0.1;
      whisker = 0.1;
    } else if (a === 'zoomies' || a === 'tumble' || a === 'bubble' || a === 'sideHop') {
      tip = 0.9;
      whisker = 0.8;
      ears = 0.8;
      tone = rainbow(6);
    } else if (a === 'pounce' || a === 'wiggle' || a === 'stalk' || a === 'climb') {
      tip = 0.6 + 0.4 * Math.max(0, Math.sin(time * 8));
      whisker = 1;
      ears = 0.9;
      tone = BEACON.focused;
    } else if (a === 'hiss') {
      const on = Math.sin(time * 26) > 0 ? 1 : 0.3;
      tip = on;
      whisker = on;
      ears = on;
      tone = BEACON.surprised;
    } else if (a === 'dizzy' || a === 'trip' || a === 'stuck') {
      tip = Math.sin(time * 9) > 0 ? 1 : 0.3;
      tone = rainbow(5);
    } else if (this.mood === 'happy' || this.mood === 'love') {
      tip = 0.85 + 0.15 * Math.sin(time * 3);
      tone = this.mood === 'love' ? BEACON.love : BEACON.happy;
    } else if (this.mood === 'curious') {
      ears = 0.7;
      whisker = 0.6;
    }
    if (this.whisk >= 0) whisker = this.whisk;
    o.dot(0, Math.max(0, Math.min(1, tip)), tone);
    o.dot(1, Math.max(0, Math.min(1, tip * 0.8)), tone);
    o.dot(3, Math.max(0, Math.min(1, ears)), tone);
    o.dot(4, Math.max(0, Math.min(1, whisker)), tone);
  }

  /** The tricks added in the refinement pass. */
  private newTricks(): Record<string, Act> {
    const p = () => this.puppet;
    const stop = () => {
      this.goal = null;
    };
    return {
      // Trots along, crosses her own front paws, and goes nose first into the floor.
      trip: {
        weight: 0.9,
        length: [5.4, 5.4],
        when: () => this.standing,
        start: () => {
          this.posture = 'stand';
          this.run.dir = this.roomy();
          this.walkTo(this.s + this.run.dir * this.heightPx * 2.4, this.depth);
        },
        pose: (t) => {
          if (t < 1.3) {
            this.boost = 1.7;
            this.emote = 'happy';
            const x = sin(t, 3.4);
            p().add('leg.FL', -22 * x - 10 * ramp(t, 0.6, 1.2));
            p().add('leg.FR', 22 * x - 10 * ramp(t, 0.6, 1.2));
          } else if (t < 2.7) {
            if (!this.run.done) {
              this.run.done = true;
              stop();
              this.hop.kick(1.5);
              p().kick('head', 320);
              p().kick('body', 240);
            }
            const k = ramp(t, 1.3, 1.6);
            p().add('body', 30 * k);
            p().add('head', 22 * k);
            this.frontLegs(-55 * k);
            this.backLegs(22 * k);
            this.extraLift = -0.035 * k;
            this.rollTarget = this.run.dir * 10 * k;
            this.emote = 'dizzy';
            this.pupils = 1;
            p().add('leg.BL', 0, 0, 10 * sin(t, 2.4));
            p().add('leg.BR', 0, 0, -10 * sin(t, 2.4, 0.3));
          } else {
            // Up again, looks round to check nobody saw, licks a shoulder.
            this.rollTarget = 0;
            const k = ramp(t, 2.7, 3.1);
            p().add('head', 10 * k * sin(t, 0.7), 26 * sin(t, 0.9));
            this.emote = t < 3.9 ? 'surprised' : 'happy';
            this.pupils = 0.8;
            if (t > 4.2) p().add('head', 14, 30, -8);
          }
        },
      },
      // Something (nothing) makes her leap sideways, stiff-legged and round-eyed.
      sideHop: {
        weight: 0.8,
        length: [3.2, 3.2],
        when: () => this.standing,
        start: () => {
          this.posture = 'stand';
          this.run.dir = this.roomy();
        },
        pose: (t) => {
          const k = ramp(t, 0.55, 0.7) * (1 - ramp(t, 2.3, 2.9));
          if (t < 0.55) {
            // A beat of stillness, then she sees it.
            p().add('head', -6, 8 * sin(t, 1.5));
          } else if (!this.run.done) {
            this.run.done = true;
            this.hop.kick(2.4 * this.build.spring);
            this.walkTo(this.s + this.run.dir * this.heightPx * 0.9, this.depth);
            p().kick('head', -260);
            p().kick('ear.L', -300, 0, -500);
            p().kick('ear.R', -300, 0, 500);
          }
          if (t >= 0.55) this.boost = t < 1.1 ? 3 : 1;
          p().add('root', 0, -this.heading.y * k + this.run.dir * 30 * k);
          p().add('body', -12 * k);
          this.frontLegs(6 * k);
          this.backLegs(-6 * k);
          this.pupils = 1;
          this.emote = t > 0.5 ? 'surprised' : null;
          if (t > 1.6) p().add('head', 0, -this.run.dir * 20 * sin(t, 0.8));
        },
      },
      // A hiss with all the fluff up, that comes out as a squeak.
      hiss: {
        weight: 0.8,
        length: [4, 4],
        when: () => this.standing,
        start: () => {
          this.posture = 'stand';
          this.run.dir = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          const k = ramp(t, 0, 0.3) * (1 - ramp(t, 3.3, 4));
          p().add('root', 0, this.run.dir * 25 * k);
          p().add('body', -12 * k);
          this.frontLegs(-6 * k);
          this.backLegs(6 * k);
          this.extraLift = 0.01 * k;
          if (t < 1.8) {
            // Hisssss: the head jabs forward, three times, the mouth wide.
            const h = pulse(t, 0.5, 0.3) + pulse(t, 0.95, 0.3) + pulse(t, 1.4, 0.3);
            p().add('head', 12 * h, 0, 0);
            this.emote = 'cross';
            this.pupils = 0;
            p().add('ear.L', -25 * k, 0, 10 * k);
            p().add('ear.R', -25 * k, 0, -10 * k);
          } else {
            // ...and then the squeak: up on her toes, ears up, very small.
            const q = pulse(t, 2, 0.5);
            p().add('head', -14 * q);
            p().add('body', -8 * q);
            if (t > 2 && !this.run.done) {
              this.run.done = true;
              this.hop.kick(1.2 * this.build.spring);
            }
            this.emote = t < 2.9 ? 'surprised' : 'happy';
            this.pupils = 1;
            if (q > 0.3) this.outfit?.beacon(BEACON.surprised ?? '#f4f4f1');
          }
        },
      },
      // Cross-eyed at her own whisker lights, swatting at them.
      whiskerBat: {
        weight: 0.8,
        length: [5, 5],
        when: () => this.still,
        start: () => {
          this.posture = 'sit';
          this.run.dir = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          const d = this.run.dir;
          const flick = Math.max(0, sin(t, 1.3));
          this.whisk = 0.3 + 0.7 * Math.max(0, sin(t, 2.6));
          this.eyes = { x: d * (0.25 + 0.4 * flick), y: 0.6 };
          p().add('head', 22 - 6 * flick, 0, -d * 6);
          p().add(d > 0 ? 'leg.FL' : 'leg.FR', -95 - 50 * flick, 0, d * -8);
          this.emote = 'focused';
          this.pupils = 1;
          // A lit whisker wobbles, and she goes cross-eyed after it.
          if (t > 3.8) p().add('head', 0, -d * 14 * sin(t, 1.5), d * 10);
        },
      },
      // Stuck in the middle of a stretch: front down, rump up, and cannot get out.
      stuck: {
        weight: 0.7,
        length: [5, 5],
        when: () => this.standing,
        start: () => (this.posture = 'stand'),
        pose: (t) => {
          const k = ramp(t, 0, 0.6) * (1 - ramp(t, 4.3, 4.7));
          this.bow();
          p().add('body', 8 * k);
          if (t < 4.2) {
            const w = sin(t, 2.2);
            p().add('body', 0, 6 * w * ramp(t, 1.4, 2));
            p().add('leg.BL', 10 * w * ramp(t, 1.4, 2), 0, 8 * w);
            p().add('leg.BR', -10 * w * ramp(t, 1.4, 2), 0, -8 * w);
            p().add('head', 4 * sin(t, 1.6), 20 * sin(t, 1.1) * ramp(t, 1, 1.8));
            this.emote = t < 1.2 ? 'sleepy' : t < 2.6 ? 'surprised' : 'sad';
            this.pupils = 0.9;
            this.twitch(t, 14 * ramp(t, 1, 2), 5);
          } else if (!this.run.done) {
            // Pop: she is free.
            this.run.done = true;
            this.hop.kick(2 * this.build.spring);
            p().kick('head', -300);
          }
          if (t >= 4.2) this.emote = 'happy';
        },
      },
      // A big yawn: head back, tongue out and curled, eyes shut, and a shake.
      yawn: {
        weight: 0.9,
        length: [4.4, 4.4],
        when: () => this.still,
        start: () => (this.posture = Math.random() < 0.5 ? 'sit' : 'stand'),
        pose: (t) => {
          const open = ramp(t, 0.5, 1.3) * (1 - ramp(t, 2.6, 3.2));
          p().add('head', -28 * open);
          p().add('body', -5 * open);
          p().add('ear.L', 0, 0, -18 * open);
          p().add('ear.R', 0, 0, 18 * open);
          this.tongue = open;
          this.curl = ramp(t, 1.2, 1.9) * (1 - ramp(t, 2.4, 3));
          this.emote = open > 0.4 ? 'asleep' : 'sleepy';
          this.pupils = 0.4;
          if (t > 3.3) p().add('head', 0, 22 * sin(t, 3.5) * (1 - ramp(t, 3.3, 4.4)));
        },
      },
      // Walks up to a crewmate and tries to climb on: paws up, scrabbling, slides back.
      climb: {
        weight: 0.7,
        length: [9, 9],
        when: () => this.standing && this.others().length > 0,
        start: () => {
          this.posture = 'stand';
          const all = this.others();
          this.run.target = all[Math.floor(Math.random() * all.length)];
        },
        pose: (t) => {
          const o = this.run.target;
          if (!o || o.state !== 'here') return this.endAct();
          this.lookAtMate(o, 0.9);
          this.pupils = 0.9;
          if (this.run.phase === 0) {
            this.emote = 'neutral';
            this.boost = 1.2;
            this.walkTo(o.s, o.depth);
            if (this.spaceTo(o, this.env.frame).n < 1.5 || t > 6) {
              this.run.phase = 1;
              this.run.at = t;
              stop();
              this.depthGoal = this.depth;
            }
          } else if (this.run.phase === 1) {
            // Up on her hind legs, paws scrabbling, three tries.
            const w = t - this.run.at;
            const up = ramp(w, 0, 0.4) * (1 - ramp(w, 3.4, 3.9));
            p().add('body', -30 * up);
            this.frontLegs(-125 * up + 20 * sin(w, 2.6) * up);
            p().add('leg.FL', 0, 0, 10 * sin(w, 2.6) * up);
            p().add('head', -18 * up);
            this.backLegs(10 * up);
            this.extraLift = 0.02 * up;
            const n = Math.floor(w / 1.1);
            if (n >= this.run.n && w > 0.5 && w < 3.2) {
              this.run.n = n + 1;
              this.hop.kick(1.3 * this.build.spring);
            }
            this.emote = w < 2.2 ? 'focused' : 'surprised';
            this.pupils = 1;
            this.twitch(t, 16 * up, 6);
            if (w > 3.9) {
              this.run.phase = 2;
              this.run.at = t;
            }
          } else {
            // Gives up with great dignity.
            const w = t - this.run.at;
            this.emote = 'neutral';
            p().add('head', 10, 0, 0);
            if (w > 1.2) this.endAct();
          }
        },
      },
      // Sitting up and nodding off: the head sinks, jerks up, sinks further.
      nodOff: {
        weight: 0.9,
        length: [7, 7],
        when: () => this.still,
        start: () => (this.posture = 'sit'),
        pose: (t) => {
          const dip = (a: number, b: number, depth: number) =>
            ramp(t, a, b) * (1 - ramp(t, b, b + 0.12)) * depth;
          const sink = dip(0.3, 1.6, 22) + dip(2.2, 3.6, 30) + dip(4.2, 5.8, 38);
          p().add('head', sink + (t > 5.8 ? 30 * (1 - ramp(t, 5.8, 6.4)) : 0));
          p().add('body', sink * 0.15);
          if ([1.72, 3.72].some((at) => t > at && t < at + 0.05 && !this.run.done)) {
            this.run.done = true;
            p().kick('head', -260);
            p().kick('ear.L', -200);
            p().kick('ear.R', -200);
          }
          if (t > 1.9 && t < 2) this.run.done = false;
          this.emote = t < 5.8 ? 'sleepy' : 'asleep';
          this.pupils = 0.2;
          if (t > 6.4) this.emote = 'surprised';
        },
      },
      // Chases a bubble of light: eyes on it, quick steps, and it pops.
      bubble: {
        weight: 0.8,
        length: [8, 8],
        when: () => this.standing,
        start: () => {
          this.posture = 'stand';
          this.go([this.somewhere(), this.somewhere()]);
        },
        pose: (t) => {
          const k = t < 5.6 ? 1 : 0;
          if (k) {
            const bob = sin(t, 0.7);
            this.eyes = { x: 0.6 * sin(t, 0.4), y: -0.5 + 0.2 * bob };
            p().add('head', -14 + 8 * bob, 22 * sin(t, 0.4));
            this.boost = 1.6;
            this.emote = 'happy';
            this.pupils = 1;
            this.whisk = 0.6 + 0.4 * Math.max(0, sin(t, 3));
            this.twitch(t, 12, 5);
            if (this.atStop && t > 1) {
              // Caught up with it: a swat, a pop.
              this.run.phase = 1;
            }
          }
          if ((t >= 5.6 || this.run.phase === 1) && !this.run.done) {
            this.run.done = true;
            this.run.at = t;
            stop();
            this.hop.kick(1.8 * this.build.spring);
            p().kick('leg.FL', -500);
            p().kick('leg.FR', -500);
          }
          if (this.run.done) {
            const w = t - this.run.at;
            this.emote = w < 1 ? 'surprised' : 'neutral';
            this.pupils = 1;
            this.eyes = { x: 0, y: 0.3 };
            p().add('head', 10 * ramp(w, 0.3, 0.7), 12 * sin(w, 1.2));
            if (w > 2) this.endAct();
          }
        },
      },
      // Crouched, rump wiggling madly... and then she thinks better of it.
      wiggle: {
        weight: 0.9,
        length: [5, 5],
        when: () => this.standing,
        start: () => {
          this.posture = 'stand';
          this.run.dir = this.roomy();
        },
        pose: (t) => {
          const crouch = ramp(t, 0, 0.4) * (1 - ramp(t, 3, 3.4));
          const w = sin(t, 7.5) * ramp(t, 0.4, 1) * (1 - ramp(t, 2.6, 3));
          p().add('body', 22 * crouch);
          this.frontLegs(-34 * crouch);
          this.backLegs(14 * crouch);
          p().add('body', 0, 11 * w);
          p().add('leg.BL', 0, 0, 6 * w);
          p().add('leg.BR', 0, 0, 6 * w);
          p().add('head', -10 * crouch, -6 * w);
          this.extraLift = -0.03 * crouch;
          this.twitch(t, 26 * crouch, 5);
          this.emote = t < 3 ? 'focused' : 'neutral';
          this.pupils = t < 3 ? 1 : 0.3;
          if (t > 3.2) {
            // Never meant to: gazes off into the distance, then trots away.
            p().add('head', -8, 30 * this.run.dir);
            if (!this.run.done) {
              this.run.done = true;
              this.walkTo(this.s + this.run.dir * this.heightPx * 1.2, this.depth);
            }
          }
        },
      },
    };
  }

  private moves(): Record<string, Act> {
    const p = () => this.puppet;
    return {
      // Curls up and rolls across the floor like a wheel.
      tumble: {
        weight: 1,
        length: [3.4, 3.4],
        when: () => this.standing,
        start: () => {
          this.posture = 'stand';
          this.run.dir = this.roomy();
          this.walkTo(this.s + this.run.dir * this.heightPx * 4, this.depth);
        },
        pose: (t) => {
          const dt = t - this.run.at;
          this.run.at = t;
          const winding = this.actLength - t > 0.9;
          const k = ramp(t, 0, 0.3);
          this.trotting = false;
          this.boost = winding ? 1.4 : 0.4;
          this.frontLegs(-45 * k);
          this.backLegs(45 * k);
          p().add('head', 20 * k);
          this.emote = 'happy';
          this.pupils = 1;
          if (winding) this.rollTarget -= ((this.pace * dt) / (0.15 * this.px)) * (180 / Math.PI);
          else {
            this.goal = null;
            this.rollTarget = 360 * Math.round(this.rollTarget / 360);
          }
        },
      },
      // A ball: batted along the floor, chased down, batted again.
      ballPlay: {
        weight: 1,
        length: [11, 11],
        when: () => this.standing,
        start: () => {
          this.posture = 'stand';
          const [lo, hi] = this.span(this.env.frame);
          const dir = this.roomy();
          this.toy.s = Math.min(hi - 30, Math.max(lo + 30, this.s + dir * this.heightPx * 1.2));
          this.toy.v = 0;
          this.toy.on = true;
        },
        pose: (t) => {
          const d = this.toyDistance();
          const rolling = Math.abs(this.toy.v) > this.heightPx * 0.6;
          this.lookAtFloor(this.toy.s);
          this.pupils = 1;
          this.emote = 'focused';
          const r = this.run;
          if (t > 8.6) {
            // Enough: the ball is put away, and she is pleased.
            this.toy.on = false;
            this.emote = 'happy';
            return;
          }
          if (r.phase === 0 || rolling) {
            // After it.
            this.walkTo(this.toy.s - Math.sign(d || 1) * this.heightPx * 0.55, this.depth);
            this.boost = rolling ? 2.2 : 1.2;
            if (!rolling && Math.abs(d) < this.heightPx * 0.85 && this.stride < 6) {
              r.phase = 1;
              r.at = t;
            }
          } else {
            // Crouch, wiggle, bat.
            const w = t - r.at;
            p().add('body', 14 * ramp(w, 0, 0.3));
            p().add('body', 0, 7 * sin(w, 5));
            p().add('leg.FL', -70 * pulse(w, 0.5, 0.35));
            if (w > 0.6 && !r.done) {
              r.done = true;
              this.hop.kick(1.2);
              this.batToy(Math.sign(d || 1) * (0.8 + Math.random()) * 1, 3.5 + Math.random() * 2);
            }
            if (w > 0.75) {
              r.phase = 0;
              r.done = false;
              this.toy.v = this.toy.v || Math.sign(d || 1) * this.heightPx * 3;
            }
          }
        },
      },
      // Sits up to wash a paw, leans too far and topples.
      washTopple: {
        weight: 1,
        length: [5, 5],
        when: () => this.still,
        start: () => {
          this.posture = 'sit';
          this.run.dir = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          if (t < 2.7) {
            const lick = sin(t, 1.8);
            p().add('leg.FL', -130 - 12 * lick, 0, -12);
            p().add('head', 18 + 6 * lick, 16, -6);
            this.rollTarget = this.run.dir * 3 * ramp(t, 1.5, 2.7);
            this.emote = 'happy';
          } else if (t < 3.9) {
            this.rollTarget = this.run.dir * 78;
            this.emote = 'surprised';
            this.pupils = 1;
            p().add('leg.FL', -40 + 20 * sin(t, 2.5));
          } else {
            this.rollTarget = 0;
            this.emote = 'neutral';
            p().add('head', 0, 0, 8 * sin(t, 1.2));
          }
        },
      },
      // Hiccups: a jump and a jerk every second or so, and a look of surprise.
      hiccups: {
        weight: 0.7,
        length: [5, 5],
        when: () => this.standing,
        pose: (t) => {
          const n = Math.floor(t / 1.1);
          if (n >= this.run.n && t > 0.3) {
            this.run.n = n + 1;
            this.hop.kick(1.3);
            p().kick('head', -260);
            p().kick('body', -120);
          }
          this.emote = sin(t, 0.9) > 0.5 ? 'surprised' : 'neutral';
          this.pupils = 0.8;
        },
      },
      // Bounces on the spot, stiff-legged, like a spring.
      pogo: {
        weight: 0.7,
        length: [3.4, 3.4],
        when: () => this.standing,
        pose: (t) => {
          const n = Math.floor(t / 0.5);
          if (n >= this.run.n && t < 2.9) {
            this.run.n = n + 1;
            this.hop.kick(1.9);
          }
          this.frontLegs(-8);
          this.backLegs(8);
          p().add('head', -6 * sin(t, 2));
          this.emote = 'happy';
          this.pupils = 1;
        },
      },
    };
  }
}
