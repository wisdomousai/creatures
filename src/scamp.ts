import type { Object3D } from 'three';
import { BEACON } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import type { Anatomy } from './pet';
import { KITTEN_ACT_MOODS, Kitty, kittenMoods, pulse, ramp } from './kitties';

/**
 * Scamp, the lanky robot kitten: enormous ears on a small head, a long narrow body on
 * long thin legs that don't quite belong to her yet, and a tail nearly as long as she
 * is, in five bones. She lopes in along the frame line with her tail up like a flag and
 * gets into trouble: she pounces (a long way up), stalks a crewmate, races about in
 * zoomies, trips over her own paws, slides into the splits on the floor, tips over,
 * dozes off in mid-stride and puffs up like a bottle brush.
 *
 * All her own: she chases a light spot that darts about the floor and escapes just as she
 * pounces, rears up on her hind legs to bat at something dangling, waves her tail about
 * like a snake, pounces on its tip, swivels her ears about like radar and scratches
 * behind one until she loses her balance.
 *
 * And more trouble: she scrabbles up the side wall and slides back down, yawns so wide she
 * tips over, gets her head stuck in something, struts about with the light spot in triumph,
 * jumps at her own shadow, stretches until her legs go on forever, curls up for a nap with
 * her tail over her nose and pats a crewmate's tail from behind.
 *
 * The light spot glows in the colour of a laser; her bell lights in the colour of her mood,
 * and her tail tip, ear hinges, whisker tips and paw pads glow with it.
 */
export const SCAMP_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.3, 0.46],
    [0.7, 0.46],
  ],
  rx: 0.095,
  ry: 0.28,
  line: 0.03,
  mouth: [0.5, 0.78],
  kind: 'cat',
  pupil: 0.6,
};

const SCAMP: Anatomy = {
  tail: ['tail.1', 'tail.2', 'tail.3', 'tail.4', 'tail.5'],
  tailAxis: [0, 0.1, -1],
  earsHang: false,
  moods: kittenMoods(),
  actMoods: KITTEN_ACT_MOODS,
  lying: 'sleepy',
  hover: 'happy',
  drop: { stand: 0, sit: -0.13, lie: -0.13 },
  sit: -22,
  turn: 45,
};

export class Scamp extends Kitty {
  protected readonly anatomy = SCAMP;
  protected readonly build = {
    middle: 0.24,
    prop: { bone: 'spot', rest: [-0.25, 0.2] as [number, number], radius: 0.035, flat: true },
    spring: 1.4,
    speed: 2,
  };

  constructor(model: Object3D) {
    super(
      {
        name: 'Scamp',
        model: 'scamp',
        metres: 0.72,
        width: 0.42,
        size: 0.92,
        feels: {
          default: { f: 2.4, zeta: 0.5 },
          root: { f: 3, zeta: 0.55 },
          body: { f: 2, zeta: 0.6 },
          head: { f: 2, zeta: 0.5, r: 0.3 },
          'ear.L': { f: 4, zeta: 0.25 },
          'ear.R': { f: 4, zeta: 0.25 },
          'tail.1': { f: 1.8, zeta: 0.45 },
          'tail.2': { f: 2, zeta: 0.4 },
          'tail.3': { f: 2.3, zeta: 0.35 },
          'tail.4': { f: 2.6, zeta: 0.3 },
          'tail.5': { f: 3, zeta: 0.3 },
        },
        face: SCAMP_FACE,
        eyes: 0.72,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.9 },
          { bone: 'body', yaw: 0.2, pitch: 0 },
        ],
        reach: { yaw: 60, pitch: 30 },
        lag: 0.8,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 2,
      },
      model,
    );
    const all = this.tricks();
    const mine: Record<string, number> = {
      pounce: 1.6,
      stalk: 1.2,
      zoomies: 1.2,
      puffCrab: 0.7,
      mew: 1,
      dozeOff: 0.8,
      fallOver: 0.9,
      frontLip: 0.8,
      backWall: 0.8,
      circle: 0.8,
      watch: 1,
      tilt: 0.8,
      bell: 0.7,
      wash: 1,
      tailChase: 0.8,
      knead: 0.7,
      sneeze: 0.6,
      batAir: 0.7,
    };
    const common = this.commonActs();
    for (const k of ['idle', 'stroll', 'sit', 'nap', 'stand', 'stretch', 'startle'] as const) {
      this.acts[k] = common[k];
    }
    this.acts.lie = { ...common.lie, weight: 0.6 };
    for (const [name, weight] of Object.entries(mine)) this.acts[name] = { ...all[name], weight };
    this.acts.dizzy = all.dizzy;
    this.acts.purr = all.purr;
    Object.assign(this.acts, this.moves(), this.more());
  }

  protected after(dt: number, env: Env) {
    super.after(dt, env);
    const o = this.outfit;
    if (!o) return;
    const tone = BEACON[this.expression] ?? undefined;
    const now = performance.now() / 1000;
    const alert = this.expression === 'surprised' || this.expression === 'focused';
    o.dot(0, 0.5 + 0.4 * Math.sin(now * 2.2), tone);
    o.dot(2, clamp(0.15 + this.stride / 80, 0, 1), tone);
    o.dot(3, alert ? 1 : 0.25, tone);
    o.dot(4, this.expression === 'happy' || this.expression === 'love' ? 1 : 0.2, tone);
  }

  private moves(): Record<string, Act> {
    const p = () => this.puppet;
    const bones = this.anatomy.tail;
    return {
      // Trips over her own paws mid-stride and catches herself.
      trip: {
        weight: 1,
        length: [3.4, 3.4],
        when: () => this.standing,
        start: () => {
          this.posture = 'stand';
          this.walkTo(this.s + this.roomy() * this.heightPx * 2.5, this.depth);
        },
        pose: (t) => {
          if (t < 1.1) this.boost = 1.1;
          if (t >= 1.1 && t < 1.4) {
            this.boost = 0.3;
            p().add('body', 30);
            this.frontLegs(-50);
            p().add('leg.FL', 0, 0, 25);
            p().add('leg.FR', 0, 0, 25);
            this.emote = 'surprised';
            this.pupils = 1;
          }
          if (t >= 1.4 && !this.run.done) {
            this.run.done = true;
            this.goal = null;
            this.hop.kick(1.6);
            p().kick('head', 320);
            p().kick('tail.1', 0, 0, 500);
          }
          if (t >= 1.4 && t < 2.2) {
            p().add('body', 18);
            this.emote = 'surprised';
            this.pupils = 1;
          } else if (t >= 2.2) {
            // Sheepish, then it is all meant.
            p().add('head', 10, 0, 8 * sin(t, 1.2));
            this.emote = t < 2.8 ? 'sad' : 'happy';
          }
        },
      },
      // Legs slide out from under her on the floor: the splits, then a scramble.
      splay: {
        weight: 0.9,
        length: [3.6, 3.6],
        when: () => this.standing,
        start: () => (this.posture = 'stand'),
        pose: (t) => {
          const k = ramp(t, 0.2, 0.5) * (1 - ramp(t, 2.4, 2.9));
          this.frontLegs(0, 55 * k);
          p().add('leg.BL', 0, 0, -50 * k);
          p().add('leg.BR', 0, 0, 50 * k);
          this.extraLift = -0.085 * k;
          p().add('head', 0, 0, 10 * sin(t, 1.5) * k);
          this.emote = t < 2.4 ? 'surprised' : 'happy';
          this.pupils = 1;
          if (t > 2.4 && !this.run.done) {
            this.run.done = true;
            this.hop.kick(1.8);
          }
        },
      },
      // A light spot darts about the floor; she chases it, pounces, and it escapes.
      spotChase: {
        weight: 1.2,
        length: [11, 11],
        when: () => this.standing,
        start: () => {
          this.posture = 'stand';
          const [lo, hi] = this.span(this.env.frame);
          this.toy.s = Math.min(
            hi - 30,
            Math.max(lo + 30, this.s + this.roomy() * this.heightPx * 1.5),
          );
          this.toy.on = true;
        },
        pose: (t) => {
          const r = this.run;
          const h = this.heightPx;
          // The spot dashes to a new place every second or so (its own easing: no rolling).
          this.toy.v = 0;
          if (t > 9 || r.n >= 3) {
            this.toy.on = false;
            this.emote = r.n >= 3 ? 'surprised' : 'neutral';
            p().add('head', 0, 20 * sin(t, 0.8), 10);
            return;
          }
          if (t > r.at) {
            const [lo, hi] = this.span(this.env.frame);
            const s = this.toy.s + (Math.random() < 0.5 ? -1 : 1) * h * (0.8 + Math.random() * 1.6);
            r.target = null;
            this.toy.s = Math.min(hi - 30, Math.max(lo + 30, s));
            r.at = t + 1 + Math.random() * 0.8;
          }
          this.lookAtFloor(this.toy.s);
          this.pupils = 1;
          this.emote = 'focused';
          const d = this.toy.s - this.s;
          if (Math.abs(d) > h * 0.7) {
            this.walkTo(this.toy.s - Math.sign(d) * h * 0.4, this.depth);
            this.boost = 2;
            r.phase = 0;
          } else if (r.phase === 0) {
            r.phase = 1;
            r.done = false;
            r.target = null;
            this.run.dir = t;
          } else {
            // In range: crouch, wiggle, pounce, and it has gone.
            const w = t - this.run.dir;
            const k = ramp(w, 0, 0.3);
            p().add('body', 18 * k);
            p().add('body', 0, 8 * sin(w, 5) * k);
            this.frontLegs(-30 * k);
            this.extraLift = -0.03 * k;
            if (w > 0.9 && !r.done) {
              r.done = true;
              r.n += 1;
              this.hop.kick(2.4);
              this.toy.gone = 0.8;
              r.at = t + 0.5;
            }
            if (w > 0.9) {
              p().add('body', -14);
              this.frontLegs(-60);
            }
          }
        },
      },
      // Rears up on her hind legs to bat at something dangling far too high.
      reachBat: {
        weight: 1,
        length: [4.4, 4.4],
        when: () => this.standing,
        start: () => (this.posture = 'stand'),
        pose: (t) => {
          const k = ramp(t, 0, 0.6) * (1 - ramp(t, 3.6, 4.3));
          p().add('root', -34 * k);
          p().add('body', -10 * k);
          this.backLegs(34 * k);
          const a = sin(t, 1.8);
          p().add('leg.FL', (-105 - 30 * a) * k);
          p().add('leg.FR', (-105 + 30 * a) * k);
          p().add('head', 22 * k);
          this.eyes = { x: 0.3 * sin(t, 0.7), y: -0.9 };
          this.pupils = 1;
          this.emote = 'focused';
          this.extraLift = 0.012 * k;
          this.twitch(t, 14 * k, 5);
          if (t > 3.8 && !this.run.done) {
            this.run.done = true;
            this.hop.kick(1.2);
          }
        },
      },
      // The tail waves about on its own, like a snake.
      tailWave: {
        weight: 0.9,
        length: [3.6, 3.6],
        when: () => this.still,
        pose: (t) => {
          const k = ramp(t, 0, 0.4) * (1 - ramp(t, 3.1, 3.6));
          bones.forEach((b, i) => {
            p().add(b, -18 * k * sin(t, 0.7, -i * 0.1), 0, 38 * k * sin(t, 1.1, -i * 0.13));
          });
          p().add('head', 0, 0, 6 * sin(t, 1.1, -0.3) * k);
          this.emote = 'happy';
        },
      },
      // Sits, and the tail curls round to the front: she pounces on the tip, twice.
      tailAttack: {
        weight: 1,
        length: [5, 5],
        when: () => this.still,
        start: () => (this.posture = 'sit'),
        pose: (t) => {
          const round = ramp(t, 0.2, 1) * (1 - ramp(t, 4, 4.6));
          p().add(bones[0], 0, -75 * round, 0);
          bones.slice(1).forEach((b) => p().add(b, 0, 0, -32 * round));
          this.lookAtFloor(this.s + 20);
          this.pupils = 1;
          this.emote = 'focused';
          const hit = pulse(t, 1.4, 0.3) + pulse(t, 2.8, 0.3);
          p().add('head', 20 * hit);
          this.frontLegs(-40 * hit);
          const n = t > 1.5 ? (t > 2.9 ? 2 : 1) : 0;
          if (n > this.run.n) {
            this.run.n = n;
            this.hop.kick(1.2);
            p().kick('tail.3', 0, 500, 0);
          }
          if (t > 3.2) p().add('tail.5', 0, 0, 30 * sin(t, 3));
        },
      },
      // Ears like radar: each swivels on its own, eyes scanning.
      radar: {
        weight: 1,
        length: [3.6, 3.6],
        when: () => this.still,
        pose: (t) => {
          const k = ramp(t, 0, 0.3) * (1 - ramp(t, 3.2, 3.6));
          p().add('ear.L', 10 * k, 45 * sin(t, 0.6) * k, 0);
          p().add('ear.R', 10 * k, 45 * sin(t, 0.45, 0.3) * k, 0);
          this.eyes = { x: 0.8 * sin(t, 0.5), y: -0.1 };
          p().add('head', -4 * k, 14 * sin(t, 0.5), 0);
          this.pupils = 1;
          this.emote = 'neutral';
          if (pulse(t, 1.6, 0.2) > 0.5) p().kick('ear.L', 0, 0, 500);
        },
      },
      // Scratches behind an ear with a hind leg, and overbalances.
      scratch: {
        weight: 1,
        length: [4, 4],
        when: () => this.still,
        start: () => {
          this.posture = 'sit';
          this.run.dir = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          if (t < 2.6) {
            p().add('leg.BL', -62 + 14 * sin(t, 6), 0, 35);
            p().add('head', 0, 15, -15);
            this.emote = 'sleepy';
            this.rollTarget = this.run.dir * 3 * ramp(t, 1.2, 2.6);
          } else if (t < 3.5) {
            this.rollTarget = this.run.dir * 70;
            this.emote = 'surprised';
            this.pupils = 1;
          } else this.rollTarget = 0;
        },
      },
    };
  }

  /** More trouble: the wall, the yawn, the stuck head, the shadow, the long stretch. */
  private more(): Record<string, Act> {
    const p = () => this.puppet;
    const bones = this.anatomy.tail;
    return {
      // Scrabbles up the side wall of the box, gets nowhere, and slides down.
      wallClimb: {
        weight: 0.8,
        length: [6, 6],
        when: () => this.standing,
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
          const up = ramp(w, 0, 0.5) * (1 - ramp(w, 2.2, 3));
          const a = sin(w, 3);
          p().add('root', -38 * up);
          this.backLegs(28 * up);
          p().add('leg.FL', (-110 - 35 * a) * up);
          p().add('leg.FR', (-110 + 35 * a) * up);
          p().add('head', 20 * up);
          this.extraLift = 0.03 * ramp(w, 0.3, 1.4) * (1 - ramp(w, 1.8, 3));
          this.emote = w > 1.6 ? 'surprised' : 'focused';
          this.pupils = 1;
          this.twitch(t, 14 * up, 6);
          if (w > 2.9 && !this.run.done) {
            this.run.done = true;
            this.hop.kick(1.3);
            p().kick('tail.1', 0, 0, 400);
          }
          if (w > 3) this.emote = 'sad';
        },
      },
      // A yawn so big it tips her over.
      yawnTip: {
        weight: 0.7,
        length: [4.4, 4.4],
        when: () => this.still,
        start: () => {
          this.posture = 'sit';
          this.run.dir = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          const k = ramp(t, 0.2, 1.3) * (1 - ramp(t, 2.4, 2.8));
          p().add('head', -42 * k);
          p().add('body', -8 * k);
          p().add('ear.L', 0, 0, -25 * k);
          p().add('ear.R', 0, 0, 25 * k);
          this.emote = 'sleepy';
          this.pupils = 0.2;
          this.rollTarget = this.run.dir * 62 * ramp(t, 1.5, 2.1) * (1 - ramp(t, 3.3, 3.9));
          if (t > 3.3) {
            this.emote = 'surprised';
            this.pupils = 1;
            if (!this.run.done) {
              this.run.done = true;
              this.hop.kick(1.1);
            }
          }
        },
      },
      // Pokes her head into something, and it will not come out; a big pop.
      headStuck: {
        weight: 0.6,
        length: [5, 5],
        when: () => this.standing,
        start: () => (this.posture = 'stand'),
        pose: (t) => {
          const dive = ramp(t, 0.2, 0.7) * (1 - ramp(t, 3.7, 3.8));
          p().add('head', 40 * dive);
          p().add('body', 22 * dive);
          this.frontLegs(-18 * dive);
          this.extraLift = -0.02 * dive;
          const tug = t > 1.2 && t < 3.6 ? 1 : 0;
          p().add('body', 0, 7 * sin(t, 3.5) * tug);
          p().add('leg.BL', 18 * sin(t, 4) * tug);
          p().add('leg.BR', 18 * sin(t, 4, 0.5) * tug);
          this.twitch(t, 30 * dive, 5);
          this.emote = t < 3.7 ? 'dizzy' : 'surprised';
          this.pupils = 1;
          if (t >= 3.7 && !this.run.done) {
            this.run.done = true;
            this.hop.kick(2);
            p().kick('head', -420);
            p().kick('ear.L', 0, 0, 600);
            p().kick('ear.R', 0, 0, -600);
          }
        },
      },
      // Struts about with the light spot she finally caught, ears and tail high.
      victory: {
        weight: 0.7,
        length: [6, 6],
        when: () => this.standing,
        start: () => {
          this.posture = 'stand';
          this.toy.on = true;
          this.toy.s = this.s;
          const r = this.heightPx * 1.2;
          const [lo, hi] = this.span(this.env.frame);
          const c = clamp(this.s + this.roomy() * r, lo + r, hi - r);
          this.go([
            { s: c - r, depth: 0.4 },
            { s: c + r, depth: 0.6 },
            { s: c, depth: 0.2 },
          ]);
        },
        pose: (t) => {
          this.boost = 1.3;
          this.toy.v = 0;
          this.toy.s = this.s + this.heightPx * 0.7 * sin(t, 0.8);
          if (t > 5.4) this.toy.on = false;
          p().add('head', -12 + 6 * sin(t, 3));
          p().add('body', -8);
          p().add('ear.L', 0, 0, 12 * sin(t, 3));
          p().add('ear.R', 0, 0, -12 * sin(t, 3));
          bones.forEach((b, i) => p().add(b, 0, 0, 12 * sin(t, 2, -i * 0.1)));
          this.emote = 'happy';
          this.pupils = 0.7;
          this.extraLift = 0.012 * Math.abs(sin(t, 2.5));
          if (t > 5.4 && this.atStop) this.endAct();
        },
      },
      // Sees her own shadow behind her and leaps straight up.
      shadowJump: {
        weight: 0.8,
        length: [4, 4],
        when: () => this.standing,
        start: () => {
          this.posture = 'stand';
          this.run.dir = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          if (t < 1.4) {
            const k = ramp(t, 0, 0.4);
            p().add('head', 0, 55 * this.run.dir * k, 0);
            this.eyes = { x: -0.8 * this.run.dir, y: 0.3 };
            this.pupils = 1;
            this.emote = 'focused';
            this.twitch(t, 10 * k, 4);
          } else {
            if (!this.run.done) {
              this.run.done = true;
              this.hop.kick(2.8 * this.build.spring);
              p().kick('tail.1', -300, 0, 0);
            }
            p().add('body', -16);
            this.frontLegs(-45);
            this.backLegs(25);
            p().add('ear.L', 0, 0, -35);
            p().add('ear.R', 0, 0, 35);
            this.emote = 'surprised';
            this.pupils = 1;
            if (t > 2.4) {
              this.emote = 'happy';
              p().add('head', 0, 18 * sin(t, 1.2));
            }
          }
        },
      },
      // A stretch that keeps going: up on tiptoe, front paws out, back arched.
      longStretch: {
        weight: 0.8,
        length: [4, 4],
        when: () => this.standing,
        start: () => (this.posture = 'stand'),
        pose: (t) => {
          const k = ramp(t, 0.2, 1) * (1 - ramp(t, 3, 3.8));
          this.extraLift = 0.05 * k;
          p().add('body', -12 * k);
          this.backLegs(-14 * k);
          this.frontLegs(14 * k);
          p().add('head', -26 * k);
          p().add('ear.L', 0, 0, 12 * k);
          p().add('ear.R', 0, 0, -12 * k);
          bones.forEach((b) => p().add(b, -10 * k, 0, 0));
          p().add('body', 0, 0, 2 * sin(t, 4) * k);
          this.emote = 'sleepy';
        },
      },
      // Curls up in a ball, tail over her nose, and sleeps.
      curlNap: {
        weight: 0.6,
        length: [6, 7],
        when: () => this.still,
        start: () => (this.posture = 'lie'),
        pose: (t) => {
          const k = ramp(t, 0.3, 1.2);
          p().add('head', 35 * k, 25 * k, -12 * k);
          p().add('body', 0, 10 * k);
          p().add(bones[0], 0, 95 * k, 0);
          bones.slice(1).forEach((b) => p().add(b, 0, 0, -38 * k));
          p().add('ear.L', 0, 0, -20 * k);
          p().add('ear.R', 0, 0, 20 * k);
          this.emote = t > 1.6 ? 'asleep' : 'sleepy';
        },
      },
      // Creeps up behind a crewmate and pats their tail, then bolts.
      tailPat: {
        weight: 0.8,
        length: [8, 8],
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
          this.pupils = 1;
          if (this.run.phase === 0) {
            this.emote = 'focused';
            this.boost = 0.8;
            p().add('body', 10);
            this.walkTo(o.s, Math.min(1, o.depth + 0.15));
            if (this.spaceTo(o, this.env.frame).n < 1.7 || t > 5) {
              this.run.phase = 1;
              this.run.at = t;
              this.goal = null;
            }
          } else if (this.run.phase === 1) {
            const w = t - this.run.at;
            p().add('leg.FL', -95 - 40 * Math.max(0, sin(w, 1.6)));
            p().add('body', -8);
            p().add('head', -8);
            this.emote = 'happy';
            this.twitch(t, 14, 6);
            if (w > 2.6) {
              this.run.phase = 2;
              this.run.at = t;
              this.hop.kick(1.6);
              this.walkTo(this.s + this.roomy() * this.heightPx * 2.5, this.depth);
            }
          } else {
            this.boost = 3;
            this.emote = 'happy';
            if (t - this.run.at > 1.2) this.endAct();
          }
        },
      },
    };
  }
}
