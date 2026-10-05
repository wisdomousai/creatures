import type { Object3D } from 'three';
import { BEACON } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import type { Anatomy } from './pet';
import { DOG_ACT_MOODS, dogMoods, Hound } from './dogs';
import { pulse, ramp } from './kitties';

/**
 * Chrome, the robot poodle: prim and proud, all long legs and pom-poms, a small head
 * carried high on a long neck. She prances in with a high step, poses like a show dog,
 * bows, turns a pirouette, rears up and balances on her hind legs, tosses her head at
 * anything common, skips, polishes her pom-poms and flicks a paw that has stepped in
 * something. She also strikes the show-ring stack, trots a lap of the ring, strikes a
 * disco pose, sits proud, admires her own tail, and sniffs a crewmate before turning her
 * nose up at them; her sneeze sparkles every pom-pom. Her legs bend at a ball-joint knee, so the high step is real.
 *
 * Every pom-pom is a light: one on her head and ears, one round each ankle, a pair of
 * hip rosettes and the big one on her tail. They twinkle softly while she is happy, run
 * round in a ripple when she shows off, and all flash at once when she strikes a pose.
 */
export const POODLE_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.3, 0.5],
    [0.7, 0.5],
  ],
  rx: 0.075,
  ry: 0.26,
  line: 0.035,
  mouth: null,
};

// The pom-pom lights: head and ears, four ankles (FL FR BL BR), tail, hips.
const POMS = 7;

const POODLE: Anatomy = {
  tail: ['tail.1', 'tail.2'],
  tailAxis: [0, 0.93, -0.37],
  earsHang: true,
  moods: dogMoods(10),
  actMoods: {
    ...DOG_ACT_MOODS,
    prance: 'happy',
    pirouette: 'happy',
    hindStand: 'happy',
    bow: 'love',
    bowTo: 'love',
    headToss: 'annoyed',
    hopSkip: 'happy',
    groomPoms: 'happy',
    posePoint: 'curious',
    shakePaw: 'annoyed',
    twinkle: 'happy',
    runway: 'happy',
    stack: 'calm',
    trotRing: 'happy',
    discoPose: 'happy',
    proudSit: 'calm',
    admireTail: 'happy',
    sniffSnub: 'curious',
  },
  lying: 'calm',
  hover: 'happy',
  drop: { stand: 0, sit: -0.2, lie: -0.24 },
  sit: -24,
  turn: 50,
};

export class Poodle extends Hound {
  static readonly terms =
    'doggo pooch fancy posh prim proud show elegant white pink silver pompoms pom curly fluffy long legs neck prance bow pirouette sparkle';

  protected readonly anatomy = POODLE;
  protected readonly build = { middle: 0.43, spring: 0.8, speed: 1.4 };
  /** How high she lifts her feet: 0 a plain trot, 1 the show-ring step. */
  private step = 0;
  /** The pom-pom lights: a brightness pulse per light, and a flash over all of them. */
  private glints = new Array<number>(POMS).fill(0);
  private flash = 0;
  private shown = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Chrome',
        model: 'poodle',
        metres: 0.95,
        width: 0.5,
        size: 1.25,
        feels: {
          default: { f: 2, zeta: 0.6 },
          body: { f: 1.7, zeta: 0.7 },
          head: { f: 1.8, zeta: 0.55, r: 0.3 },
          'ear.L': { f: 2.8, zeta: 0.2 },
          'ear.R': { f: 2.8, zeta: 0.2 },
          'tail.1': { f: 4.5, zeta: 0.45 },
          'tail.2': { f: 4.5, zeta: 0.3 },
        },
        face: POODLE_FACE,
        eyes: 0.8,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.9 },
          { bone: 'body', yaw: 0.15, pitch: 0 },
        ],
        reach: { yaw: 60, pitch: 30 },
        lag: 0.9,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 1.4,
      },
      model,
    );
    const all = { ...this.tricks(), ...this.doggy() };
    const mine: Record<string, number> = {
      // The everyday
      scratch: 0.6,
      sniff: 0.5,
      yip: 0.4,
      pant: 0.4,
      yawn: 0.6,
      tilt: 0.9,
      watch: 1,
      greet: 0.8,
      twirl: 0.7,
      chaseFly: 0.4,
      beg: 0.4,
      dig: 0.2,
      // The box
      frontLip: 0.7,
      backWall: 0.6,
      circle: 0.5,
      dozeOff: 0.5,
      bell: 0.5,
      tailChase: 0.3,
      zoomies: 0.3,
      sneeze: 0.4,
      shakeOff: 0.4,
      fallOver: 0.2,
    };
    const common = this.commonActs();
    for (const k of ['idle', 'stroll', 'sit', 'nap', 'stand', 'stretch', 'startle'] as const) {
      this.acts[k] = common[k];
    }
    this.acts.lie = { ...common.lie, weight: 0.6 };
    for (const [name, weight] of Object.entries(mine)) this.acts[name] = { ...all[name], weight };
    this.acts.love = all.love;
    this.acts.dizzy = { ...all.dizzy, weight: 0 };
    Object.assign(this.acts, this.moves(), this.showOff());
    // Her sneeze sets every pom-pom sparkling.
    const sneeze = this.acts.sneeze;
    this.acts.sneeze = {
      ...sneeze,
      pose: (t, ...rest) => {
        sneeze.pose?.(t, ...rest);
        this.flash = Math.max(this.flash, pulse(t, 0.8, 0.5));
        this.ripple(t, 5, 0.9);
      },
    };
  }

  private moves(): Record<string, Act> {
    const p = () => this.puppet;
    const stand = () => this.standing;
    return {
      // Across the floor with a high step, head and tail up, pom-poms rippling.
      prance: {
        weight: 1.8,
        length: [5, 7],
        when: stand,
        start: () => {
          this.posture = 'stand';
          const s = this.somewhere();
          this.go([s, this.somewhere()]);
        },
        pose: (t) => {
          this.step = 1;
          this.boost = 0.85;
          p().add('head', -8);
          this.ripple(t, 1.6);
          this.emote = 'happy';
          if (this.atStop && t > 1) this.endAct();
        },
      },
      // Down to the front lip and back to the wall: the catwalk, with a pose at each end.
      runway: {
        weight: 0.9,
        length: [12, 12],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.walkTo(this.s + this.roomy() * this.heightPx * 0.7, 0);
          this.run.phase = 0;
        },
        pose: (t) => {
          this.step = 1;
          this.boost = 0.8;
          const r = this.run;
          if (r.phase % 2 === 0 && this.atStop && t > 0.5) {
            r.phase++;
            r.at = t;
          }
          if (r.phase % 2 === 1) {
            // A pose: chin up, one paw forward, a flash.
            const k = ramp(t - r.at, 0, 0.4);
            p().add('head', -14 * k, 20 * k);
            p().add('leg.FL', -38 * k);
            p().add('shin.FL', 40 * k);
            this.flash = Math.max(this.flash, pulse(t - r.at, 1.2, 0.3));
            this.emote = 'sleepy';
            if (t - r.at > 2) {
              r.phase++;
              this.walkTo(this.s - this.roomy() * this.heightPx * 0.7, r.phase > 2 ? 0.7 : 0);
            }
          }
          if (r.phase >= 4 && this.atStop) this.endAct();
        },
      },
      // Up on the hind legs, a full turn, and down again with a bow.
      pirouette: {
        weight: 1,
        length: [4.2, 4.2],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.spin = 1;
        },
        pose: (t) => {
          const k = ramp(t, 0, 0.5) * (1 - ramp(t, 3.3, 3.9));
          this.rearUp(k);
          this.ripple(t, 3);
          this.emote = 'happy';
          if (t > 3.9 && !this.run.done) {
            this.run.done = true;
            this.hop.kick(1);
          }
        },
      },
      // Balances on the hind legs, forepaws out for the wobble, then drops down.
      hindStand: {
        weight: 0.9,
        length: [5.5, 5.5],
        when: stand,
        start: () => (this.posture = 'stand'),
        pose: (t) => {
          const k = ramp(t, 0, 0.7) * (1 - ramp(t, 4.4, 5));
          this.rearUp(k, -20);
          const w = sin(t, 0.9) * (1 - ramp(t, 4.2, 4.6));
          p().add('leg.FL', 0, 0, 40 * k);
          p().add('leg.FR', 0, 0, -40 * k);
          this.rollTarget = 9 * w * k;
          p().add('body', 4 * sin(t, 1.7) * k);
          this.emote = t > 3.4 && t < 4.4 ? 'surprised' : 'happy';
          if (t > 4.7 && !this.run.done) {
            this.run.done = true;
            this.hop.kick(1.3);
            p().kick('ear.L', -300);
          }
        },
      },
      // A bow: chest down, front knees bent, rump up, held; then up with a flourish.
      bow: {
        weight: 1.2,
        length: [3.4, 3.4],
        when: stand,
        pose: (t) => {
          const k = ramp(t, 0, 0.5) * (1 - ramp(t, 2.5, 3.1));
          this.curtsy(k);
          this.flash = Math.max(this.flash, pulse(t, 2.6, 0.3));
          this.emote = 'happy';
        },
      },
      // The same, to a crewmate: she looks at them, bows, and holds it a beat.
      bowTo: {
        weight: 0.8,
        length: [4.5, 4.5],
        when: () => stand() && this.others().length > 0,
        start: () => {
          this.posture = 'stand';
          if (!this.pickMate()) return;
        },
        pose: (t) => {
          const o = this.run.target;
          if (!o || o.state !== 'here') return this.endAct();
          const k = ramp(t, 0.6, 1.1) * (1 - ramp(t, 3.4, 4.1));
          this.lookAtMate(o, 1);
          this.curtsy(k);
          this.emote = 'love';
        },
      },
      // Tosses her head at something common, looks away, ears swinging, nose up.
      headToss: {
        weight: 1.2,
        length: [3, 3],
        when: () => !this.walking,
        start: () => (this.run.dir = Math.random() < 0.5 ? -1 : 1),
        pose: (t) => {
          const toss = pulse(t, 0.3, 0.5);
          const away = ramp(t, 0.3, 0.8) * (1 - ramp(t, 2.3, 3));
          p().add(
            'head',
            -22 * away - 10 * toss,
            42 * this.run.dir * away,
            8 * this.run.dir * away,
          );
          p().add('body', -4 * away);
          p().add('ear.L', 0, 0, -30 * toss * this.run.dir);
          p().add('ear.R', 0, 0, -30 * toss * this.run.dir);
          this.eyes = { x: -this.run.dir * 0.6, y: -0.2 };
          this.emote = 'sleepy';
          this.flash = Math.max(this.flash, pulse(t, 0.45, 0.2));
        },
      },
      // A skip: a hop with every other step, the ears bouncing.
      hopSkip: {
        weight: 1,
        length: [4, 5],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.run.n = 0;
          this.go([this.somewhere(), this.somewhere()]);
        },
        pose: (t) => {
          this.step = 0.6;
          this.boost = 0.8;
          const n = Math.floor(t / 0.5);
          if (n >= this.run.n && this.walking) {
            this.run.n = n + 1;
            this.hop.kick(1.1);
          }
          this.emote = 'happy';
          this.ripple(t, 2.5);
          if (this.atStop && t > 1) this.endAct();
        },
      },
      // Sitting up to fluff her pom-poms: a paw to the head, then the ankles, in turn.
      groomPoms: {
        weight: 1.2,
        length: [5, 6],
        when: () => !this.walking,
        start: () => (this.posture = 'sit'),
        pose: (t) => {
          const lick = sin(t, 1.6);
          p().add('leg.FL', -125 - 10 * lick, 0, -10);
          p().add('shin.FL', 30);
          p().add('head', 22 + 5 * lick, 16, -6);
          this.glints[0] = Math.max(this.glints[0], 0.5 + 0.5 * lick);
          this.emote = 'happy';
        },
      },
      // The show-ring stance: one forepaw up, chin high, tail high, and a camera flash.
      posePoint: {
        weight: 1.1,
        length: [4.5, 4.5],
        when: stand,
        start: () => (this.posture = 'stand'),
        pose: (t) => {
          const k = ramp(t, 0, 0.5) * (1 - ramp(t, 3.8, 4.4));
          p().add('leg.FR', -35 * k);
          p().add('shin.FR', 65 * k);
          p().add('head', -14 * k, -18 * k);
          p().add('body', -3 * k);
          this.flash = Math.max(this.flash, pulse(t, 2.2, 0.35));
          this.emote = 'sleepy';
          this.pupils = 0.6;
        },
      },
      // Something on a paw: lifted, shaken off in disgust.
      shakePaw: {
        weight: 0.7,
        length: [2.6, 2.6],
        when: stand,
        start: () => (this.run.dir = Math.random() < 0.5 ? 1 : -1),
        pose: (t) => {
          const k = ramp(t, 0, 0.25) * (1 - ramp(t, 2.1, 2.6));
          const leg = this.run.dir > 0 ? 'FL' : 'FR';
          p().add(`leg.${leg}`, -35 * k);
          p().add(`shin.${leg}`, (60 + 45 * sin(t, 5)) * k);
          p().add('head', 14 * k, 0, 6 * this.run.dir * k);
          this.emote = 'cross';
        },
      },
      // A light show: the pom-poms run round in a ripple, ears and tail swaying.
      twinkle: {
        weight: 0.9,
        length: [4, 4],
        when: () => !this.walking,
        pose: (t) => {
          this.ripple(t, 3, 1);
          p().add('head', -6 + 3 * sin(t, 1), 10 * sin(t, 0.5));
          this.emote = 'happy';
        },
      },
    };
  }

  /** More of the ring: the show pose, a lap of the ring, disco, and a snub. */
  private showOff(): Record<string, Act> {
    const p = () => this.puppet;
    const stand = () => this.standing;
    return {
      // The stack: stock still, one foot set forward, chin up, tail high, a single flash.
      stack: {
        weight: 0.9,
        length: [5, 5],
        when: stand,
        start: () => (this.posture = 'stand'),
        pose: (t) => {
          const k = ramp(t, 0, 0.6) * (1 - ramp(t, 4.3, 4.9));
          p().add('head', -16 * k, 8 * k);
          p().add('body', -3 * k);
          p().add('leg.FL', -12 * k);
          p().add('leg.BR', 10 * k);
          p().add('shin.BR', -8 * k);
          p().add('tail.1', 12 * k);
          this.eyes = { x: 0.2, y: -0.3 };
          this.flash = Math.max(this.flash, pulse(t, 2.4, 0.3));
          this.emote = 'sleepy';
          this.pupils = 0.6;
        },
      },
      // A lap of the show ring at a high step, head up, pom-poms rippling round.
      trotRing: {
        weight: 0.8,
        length: [8, 8],
        when: stand,
        start: () => {
          this.posture = 'stand';
          const r = this.heightPx * 1.2;
          const [lo, hi] = this.span(this.env.frame);
          const c = clamp(this.s + this.roomy() * r, lo + r, hi - r);
          this.go([
            { s: c - r, depth: 0.45 },
            { s: c, depth: 0.85 },
            { s: c + r, depth: 0.45 },
            { s: c, depth: 0.05 },
            { s: c - r, depth: 0.45 },
          ]);
        },
        pose: (t) => {
          this.step = 1;
          this.boost = 1.1;
          this.puppet.add('head', -10);
          this.ripple(t, 1.4, 0.9);
          this.emote = 'happy';
          if (this.atStop && t > 0.5) this.endAct();
        },
      },
      // Saturday night: one paw pointed to the sky then the other, hips swaying, every
      // pom-pom flashing in turn.
      discoPose: {
        weight: 0.6,
        length: [5.6, 5.6],
        when: stand,
        start: () => (this.posture = 'stand'),
        pose: (t) => {
          const k = ramp(t, 0, 0.4) * (1 - ramp(t, 4.9, 5.5));
          const side = Math.floor(t / 0.7) % 2 ? 1 : -1;
          const up = side > 0 ? 'FL' : 'FR';
          p().add(`leg.${up}`, -95 * k, 0, -side * 25 * k);
          p().add(`shin.${up}`, 10 * k);
          p().add('head', -6 * k, 0, 10 * side * k);
          p().add('body', 0, 0, -6 * side * k);
          this.rollTarget = 4 * side * k;
          this.ripple(t, 2.2, 1);
          this.emote = 'happy';
          this.mouth = 0.2;
        },
      },
      // Sits tall, chin up, and surveys the room like it belongs to her.
      proudSit: {
        weight: 0.8,
        length: [5, 6],
        when: () => this.still,
        start: () => (this.posture = 'sit'),
        pose: (t) => {
          const k = ramp(t, 0, 0.6);
          p().add('head', -18 * k, 22 * k * sin(t, 0.25));
          p().add('leg.FL', -6 * k);
          p().add('leg.FR', -6 * k);
          this.glints[0] = Math.max(this.glints[0], 0.4 + 0.3 * sin(t, 0.7));
          this.eyes = { x: 0.6 * sin(t, 0.25), y: -0.2 };
          this.emote = 'sleepy';
        },
      },
      // Turns to look at her own tail pom-pom, and finds it lovely.
      admireTail: {
        weight: 0.6,
        length: [4.4, 4.4],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.run.dir = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          const k = ramp(t, 0, 0.7) * (1 - ramp(t, 3.6, 4.3));
          p().add('head', 4 * k, 80 * this.run.dir * k, 6 * this.run.dir * k);
          p().add('body', 0, 22 * this.run.dir * k);
          p().add('tail.1', 0, -20 * this.run.dir * k);
          this.twitch(t, 8 * k, 4);
          this.glints[5] = Math.max(this.glints[5], k * (0.6 + 0.4 * sin(t, 2)));
          this.eyes = { x: this.run.dir, y: 0 };
          this.emote = 'love';
        },
      },
      // Sniffs a crewmate politely, then turns her nose up at them.
      sniffSnub: {
        weight: 0.7,
        length: [8, 10],
        when: () => stand() && this.others().length > 0,
        start: () => {
          this.posture = 'stand';
          if (!this.pickMate()) return;
          this.run.phase = 0;
        },
        pose: (t) => {
          const o = this.run.target;
          if (!o || o.state !== 'here') return this.endAct();
          const away = Math.sign(this.s - o.s) || 1;
          if (this.run.phase === 0) {
            this.walkTo(o.s - Math.sign(o.s - this.s) * this.gap(o), o.depth);
            this.lookAtMate(o);
            if (t > 1 && this.stride < 4) {
              this.run.phase = 1;
              this.run.at = t;
            }
          } else if (this.run.phase === 1) {
            const u = t - this.run.at;
            this.lookAtMate(o);
            p().add('head', 22 + 3 * sin(u, 5));
            this.pupils = 0.9;
            if (u > 1.6) {
              this.run.phase = 2;
              this.run.at = t;
            }
          } else {
            const u = t - this.run.at;
            const k = ramp(u, 0, 0.4) * (1 - ramp(u, 2.2, 2.8));
            p().add('head', -26 * k, 55 * away * k, 8 * away * k);
            p().add('body', -3 * k, 12 * away * k);
            p().add('ear.L', 0, 0, -30 * pulse(u, 0.3, 0.4) * away);
            p().add('ear.R', 0, 0, -30 * pulse(u, 0.3, 0.4) * away);
            this.eyes = { x: -away * 0.6, y: -0.3 };
            this.emote = 'cross';
            if (u > 2.8) this.endAct();
          }
        },
      },
    };
  }

  /** A curtsy: chest down, front knees folded, rump up, head still high. */
  private curtsy(k: number) {
    const p = this.puppet;
    p.add('body', 22 * k);
    p.add('leg.FL', -30 * k);
    p.add('leg.FR', -30 * k);
    p.add('shin.FL', 95 * k);
    p.add('shin.FR', 95 * k);
    p.add('leg.BL', -10 * k);
    p.add('leg.BR', -10 * k);
    p.add('shin.BL', 10 * k);
    p.add('shin.BR', 10 * k);
    p.add('head', -34 * k);
    this.extraLift = -0.02 * k;
  }

  /** Light the pom-poms in a ripple that runs round them, `level` bright. */
  private ripple(t: number, hz: number, level = 0.8) {
    for (let i = 0; i < POMS; i++) {
      this.glints[i] = Math.max(this.glints[i], level * Math.max(0, sin(t, hz, -i / POMS)) ** 2);
    }
  }

  protected idle(t: number) {
    this.step = 0;
    this.glints.fill(0);
    this.flash = 0;
    super.idle(t);
  }

  /** On her haunches: the hind legs fold at the knee too. */
  protected sitting() {
    super.sitting();
    const p = this.puppet;
    p.add('shin.BL', 150);
    p.add('shin.BR', 150);
  }

  protected lying(breath: number) {
    super.lying(breath);
    const p = this.puppet;
    p.add('shin.FL', 100);
    p.add('shin.FR', 100);
    p.add('shin.BL', 110);
    p.add('shin.BR', 110);
  }

  protected pose(dt: number, env: Env) {
    super.pose(dt, env);
    const p = this.puppet;
    // The show-ring step: every knee folds up as its leg swings forward.
    const moving = Math.min(1, this.stride / (this.heightPx * 0.8));
    const lift = Math.max(this.step, 0.35) * moving;
    if (moving > 0.05) {
      const a = Math.sin(this.gait);
      p.add('shin.FL', Math.max(0, -a) * 85 * lift);
      p.add('shin.BR', Math.max(0, -a) * 85 * lift);
      p.add('shin.FR', Math.max(0, a) * 85 * lift);
      p.add('shin.BL', Math.max(0, a) * 85 * lift);
      // A little sway, the head held level and proud.
      p.add('head', -4 * this.step * moving);
    }
    // Ears and tail feel the walk more.
    if (this.step > 0.5) p.add('tail.1', 8 * sin(env.time, 2));
  }

  protected after(dt: number, env: Env) {
    super.after(dt, env);
    // Twinkles: each light drifts up and down on its own, brighter when she's pleased.
    const glad = this.mood === 'happy' || this.mood === 'love' ? 0.5 : 0.18;
    this.shown += (glad - this.shown) * Math.min(1, dt * 3);
    for (let i = 0; i < POMS; i++) {
      const own = this.shown * (0.5 + 0.5 * Math.sin(env.time * (1.1 + 0.37 * i) + i * 2.1));
      const level = Math.min(1, Math.max(this.glints[i], own) + this.flash);
      this.outfit?.dot(i, level);
    }
    this.outfit?.beacon(BEACON[this.expression] ?? '#f4f4f1');
  }
}
