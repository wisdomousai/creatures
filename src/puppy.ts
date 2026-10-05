import type { Object3D } from 'three';
import { BEACON } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import type { Anatomy } from './pet';
import { DOG_ACT_MOODS, dogMoods, Hound } from './dogs';
import { pulse, ramp } from './kitties';

/**
 * Pip, the robot puppy: a big head with big flappy ears on a small round body, on short
 * legs with paws far too large for them. He is clumsy and bouncy: he trips over his own
 * paws, chases his tail until he is dizzy, pounces on the shadow of a crewmate (and
 * never on the crewmate), races about in zoomies, flops asleep in the middle of
 * whatever he was doing, yips, and hides his eyes behind his paws.
 *
 * He owns a bone, which is shrunk to nothing until he wants it. He tosses it and fetches
 * it back, chews it lying down, or carries it across the floor and drops it at a
 * crewmate's feet, very proud.
 *
 * Three round toes across the front of each paw are lights: his footsteps light up as
 * they land, and the tag on his collar takes the colour of his mood.
 */
export const PUPPY_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.29, 0.5],
    [0.71, 0.5],
  ],
  rx: 0.1,
  ry: 0.34,
  line: 0.035,
  mouth: null,
};

const PUPPY: Anatomy = {
  tail: ['tail.1', 'tail.2'],
  tailAxis: [0, 0.77, -0.64],
  earsHang: true,
  moods: dogMoods(4),
  actMoods: {
    ...DOG_ACT_MOODS,
    trip: 'alarmed',
    pounceShadow: 'curious',
    floppedAsleep: 'happy',
    fetch: 'happy',
    bringBone: 'happy',
    chewBone: 'happy',
    earTangle: 'alarmed',
    bounce: 'happy',
    wagSit: 'love',
    coverEyes: 'sad',
    hiccup: 'curious',
    earChase: 'happy',
    followMate: 'happy',
    squeak: 'happy',
    shakePaw: 'love',
  },
  lying: 'calm',
  hover: 'love',
  drop: { stand: 0, sit: -0.1, lie: -0.12 },
  sit: -26,
  turn: 42,
};

export class Puppy extends Hound {
  static readonly terms =
    'doggo pup pooch baby young small little cream white beige tan pink coral big flappy floppy ears paws clumsy bouncy bone fetch';

  protected readonly anatomy = PUPPY;
  protected readonly build = {
    middle: 0.2,
    prop: { bone: 'bone', rest: [0.3, 0.1] as [number, number], radius: 0.12, flat: true },
    spring: 1.2,
    speed: 1.6,
  };
  /** Whether the bone is in his mouth, and how high his mouth is. */
  private carrying = false;
  private mouthAt = 0.25;
  /** The toe lights: a flash per paw (FL FR BL BR). */
  private toes = [0, 0, 0, 0];
  /** Where a fetch began, to bring the bone back to. */
  private origin = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Pip',
        model: 'puppy',
        metres: 0.52,
        width: 0.4,
        size: 0.95,
        feels: {
          default: { f: 2.2, zeta: 0.5 },
          root: { f: 3, zeta: 0.55 },
          body: { f: 2, zeta: 0.6 },
          head: { f: 1.9, zeta: 0.5, r: 0.3 },
          jaw: { f: 6, zeta: 0.5 },
          'ear.L': { f: 2.8, zeta: 0.18 },
          'ear.R': { f: 2.8, zeta: 0.18 },
          'tail.1': { f: 5, zeta: 0.4 },
          'tail.2': { f: 5, zeta: 0.3 },
        },
        face: PUPPY_FACE,
        eyes: 0.72,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.9 },
          { bone: 'body', yaw: 0.2, pitch: 0 },
        ],
        reach: { yaw: 60, pitch: 30 },
        lag: 1,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 1.6,
      },
      model,
    );
    const all = { ...this.tricks(), ...this.doggy() };
    const mine: Record<string, number> = {
      scratch: 0.8,
      sniff: 0.9,
      yip: 1.4,
      playBow: 1.4,
      pant: 0.6,
      yawn: 0.6,
      howl: 0.4,
      dig: 0.8,
      greet: 1,
      chaseFly: 0.8,
      twirl: 1,
      rollOver: 1,
      tilt: 1,
      watch: 0.8,
      tailChase: 1.6,
      zoomies: 1.6,
      dozeOff: 0.7,
      backWall: 0.7,
      frontLip: 0.7,
      circle: 0.6,
      sneeze: 0.5,
      shakeOff: 0.6,
      bell: 0.5,
      fallOver: 0.7,
      beg: 0.8,
    };
    const common = this.commonActs();
    for (const k of ['idle', 'stroll', 'sit', 'nap', 'stand', 'stretch', 'startle'] as const) {
      this.acts[k] = common[k];
    }
    this.acts.lie = { ...common.lie, weight: 0.5 };
    for (const [name, weight] of Object.entries(mine)) this.acts[name] = { ...all[name], weight };
    this.acts.love = all.love;
    this.acts.dizzy = { ...all.dizzy, weight: 0 };
    Object.assign(this.acts, this.moves());
  }

  /** Bone in the mouth (called every frame it is carried). */
  private carry(lift = this.mouthAt, reach = 0.3) {
    this.carrying = true;
    this.keepInMouth(reach, lift);
  }

  private drop(ahead = 0.3) {
    this.carrying = false;
    const yaw = this.puppet.current('root')[1];
    this.toy.s = this.s + Math.sin(yaw * (Math.PI / 180)) * ahead * this.px;
    this.toy.v = 0;
    this.toyAhead = Math.cos(yaw * (Math.PI / 180)) * ahead - 0.1;
  }

  private moves(): Record<string, Act> {
    const p = () => this.puppet;
    const stand = () => this.standing;
    return {
      // Trots along, catches a paw on a paw, and goes nose first.
      trip: {
        weight: 1.6,
        length: [6, 6],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.run.dir = this.roomy();
          this.walkTo(this.s + this.run.dir * this.heightPx * 3, this.depth);
        },
        pose: (t) => {
          const r = this.run;
          if (t < 1.3) {
            this.boost = 1.3;
            this.emote = 'happy';
            // Front paws getting in each other's way.
            p().add('leg.FL', 0, -10 * sin(t, 3), 0);
            p().add('leg.FR', 0, 10 * sin(t, 3), 0);
          } else if (t < 3.4) {
            if (!r.done) {
              r.done = true;
              this.goal = null;
              this.hop.kick(1.4);
              p().kick('body', 300);
              p().kick('head', 400);
            }
            const k = ramp(t, 1.3, 1.5);
            p().add('body', 36 * k);
            p().add('leg.FL', -75 * k);
            p().add('leg.FR', -75 * k);
            p().add('leg.BL', -12 * k);
            p().add('leg.BR', -12 * k);
            p().add('head', 6 * k);
            this.extraLift = -0.03 * k;
            this.emote = t < 2.2 ? 'surprised' : 'dizzy';
            this.pupils = 1;
            this.twitch(t, 14, 4);
          } else if (t < 4.6) {
            // Shakes it off.
            const k = pulse(t, 3.4, 1.2);
            p().add('head', 0, 30 * k * sin(t, 4));
            p().add('ear.L', 0, 0, -30 * k * sin(t, 4));
            p().add('ear.R', 0, 0, 30 * k * sin(t, 4));
            this.emote = 'happy';
          } else {
            // A look back at what tripped him.
            p().add('head', 4, -this.run.dir * 40 * ramp(t, 4.6, 5.1) * (t < 5.6 ? 1 : 0.3));
            this.emote = 'cross';
          }
        },
      },
      // Stalks the shadow of a crewmate along the floor and pounces on it (the shadow only).
      pounceShadow: {
        weight: 1.3,
        length: [9, 9],
        when: () => stand() && this.others().length > 0,
        start: () => {
          this.posture = 'stand';
          if (!this.pickMate()) return;
          this.run.phase = 0;
          this.run.n = 0;
        },
        pose: (t) => {
          const o = this.run.target;
          if (!o || o.state !== 'here') return this.endAct();
          const r = this.run;
          const side = Math.sign(this.s - o.s) || 1;
          const spot = o.s + side * this.gap(o) * 0.9;
          if (r.phase === 0) {
            this.walkTo(o.s + side * (this.gap(o) + this.heightPx * 0.7), this.depth);
            this.boost = 0.7;
            this.lookAtFloor(spot);
            p().add('body', 8);
            if (t > 1 && this.stride < 4) {
              r.phase = 1;
              r.at = t;
              this.goal = null;
            }
            if (t > 4) r.phase = 1;
            if (r.phase === 1) r.at = t;
          } else if (r.phase === 1) {
            // Crouched, rear wiggling.
            const w = t - r.at;
            const k = ramp(w, 0, 0.3);
            p().add('body', 20 * k);
            p().add('leg.FL', -36 * k);
            p().add('leg.FR', -36 * k);
            p().add('root', 0, 8 * sin(w, 5) * k);
            p().add('head', -8 * k, -8 * sin(w, 5) * k);
            this.lookAtFloor(spot);
            this.emote = 'focused';
            this.pupils = 1;
            this.extraLift = -0.03 * k;
            this.twitch(t, 25, 6);
            if (w > 1.1) {
              r.phase = 2;
              r.at = t;
              this.hop.kick(1.8);
              this.walkTo(spot, this.depth);
              this.boost = 3;
            }
          } else if (r.phase === 2) {
            // In the air, paws first, then down on the shadow.
            const w = t - r.at;
            this.boost = 3;
            const air = pulse(w, 0, 0.5);
            p().add('body', -12 * air);
            p().add('leg.FL', -70 * ramp(w, 0.2, 0.5));
            p().add('leg.FR', -70 * ramp(w, 0.2, 0.5));
            this.emote = 'surprised';
            this.pupils = 1;
            if (w > 0.8) {
              r.phase = 3;
              r.at = t;
            }
          } else {
            // Paws on the shadow; a sniff; nothing there; sheepish.
            const w = t - r.at;
            this.lookAtFloor(this.s + side * 0.1);
            p().add('leg.FL', -40 + 30 * sin(w, 3) * (w < 1.5 ? 1 : 0));
            p().add('head', 30 * (w < 1.8 ? 1 : 0.3) + 4 * sin(w, 4));
            this.emote = w < 1.5 ? 'focused' : 'happy';
            if (w > 2.6) {
              if (r.n < 1) {
                r.n++;
                r.phase = 0;
                r.at = t;
              } else this.endAct();
            }
          }
        },
      },
      // Bouncing around like a rubber ball, then out like a light, flat on the floor.
      floppedAsleep: {
        weight: 1.3,
        length: [9, 9],
        when: stand,
        start: () => (this.posture = 'stand'),
        pose: (t) => {
          const r = this.run;
          if (t < 2) {
            const n = Math.floor(t / 0.5);
            if (n >= r.n) {
              r.n = n + 1;
              this.hop.kick(1.5);
            }
            this.emote = 'happy';
            this.mouth = 0.3;
            p().add('head', -8 * sin(t, 2));
          } else if (t < 6.5) {
            if (r.phase === 0) {
              r.phase = 1;
              this.posture = 'lie';
              this.hop.kick(0.5);
            }
            this.emote = 'asleep';
            this.mouth = 0.12 + 0.1 * sin(t, 0.5);
          } else {
            // Wakes with a start.
            if (r.phase === 1) {
              r.phase = 2;
              this.posture = 'stand';
              this.hop.kick(1.6);
              p().kick('head', -300);
            }
            this.emote = t < 7.5 ? 'surprised' : 'happy';
            this.pupils = 1;
          }
        },
      },
      // Throws his bone, races after it, and brings it back to where he threw it from.
      fetch: {
        weight: 1.8,
        length: [16, 16],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.toy.on = true;
          this.toy.gone = 0;
          this.toy.s = this.s;
          this.run.dir = this.roomy();
          this.origin = this.s;
          this.run.phase = 0;
        },
        pose: (t) => {
          const r = this.run;
          const d = this.toy.s - this.s;
          if (r.phase === 0) {
            // Winds up, head back, and throws.
            const k = ramp(t, 0.2, 1.1);
            this.carry();
            p().add('head', -28 * k);
            p().add('body', -6 * k);
            this.emote = 'focused';
            if (t > 1.2) {
              r.phase = 1;
              this.carrying = false;
              this.toyLift = 0;
              this.toy.v = r.dir * this.heightPx * 5.5;
              this.hop.kick(1);
              p().kick('head', 500);
            }
          } else if (r.phase === 1) {
            // Chase.
            const flying = Math.abs(this.toy.v) > this.heightPx * 0.8;
            this.walkTo(this.toy.s, this.depth);
            this.boost = flying ? 3 : 2;
            this.lookAtFloor(this.toy.s);
            this.mouth = 0.4;
            this.emote = 'happy';
            this.pupils = 1;
            p().add('body', -4);
            if (!flying && Math.abs(d) < this.heightPx * 0.45) {
              r.phase = 2;
              r.at = t;
              this.goal = null;
              this.hop.kick(0.8);
            }
            if (t > 9) r.phase = 2;
          } else if (r.phase === 2) {
            // Picks it up, and carries it home, head high.
            this.carry();
            const back = t - r.at;
            this.emote = 'happy';
            p().add('head', -10 * ramp(back, 0, 0.4));
            if (back > 0.4) {
              this.walkTo(this.origin, this.depth);
              this.boost = 1.2;
            }
            if (back > 0.8 && this.atStop) {
              this.drop();
              r.phase = 3;
              r.at = t;
              this.posture = 'sit';
            }
            if (back > 7) {
              this.drop();
              r.phase = 3;
              r.at = t;
            }
          } else {
            // Drops it, sits, and waits to be told he is good.
            this.lookAtFloor(this.toy.s);
            p().add('head', 0, 0, 10 * this.run.dir);
            this.mouth = 0.3;
            this.emote = 'love';
            if (t - r.at > 2.6) this.endAct();
          }
        },
      },
      // Carries his bone over to a crewmate, stops at the edge of their room and drops it.
      bringBone: {
        weight: 1.4,
        length: [10, 10],
        when: () => stand() && this.others().length > 0,
        start: () => {
          this.posture = 'stand';
          if (!this.pickMate()) return;
          this.toy.on = true;
          this.toy.gone = 0;
          this.toy.s = this.s;
          this.run.phase = 0;
          this.run.dir = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          const o = this.run.target;
          if (!o || o.state !== 'here') return this.endAct();
          const r = this.run;
          const way = Math.sign(o.s - this.s) || 1;
          if (r.phase === 0) {
            this.carry();
            this.walkTo(o.s - way * this.gap(o), o.depth);
            this.boost = 1.1;
            p().add('head', -10);
            this.emote = 'happy';
            this.lookAtMate(o, 0.5);
            if (t > 1.5 && this.stride < 4) {
              this.drop(0.32);
              r.phase = 1;
              r.at = t;
              this.hop.kick(0.6);
            }
            if (t > 7) this.endAct();
          } else {
            // Look what I brought you: bone between them, tail going, eyes on them.
            this.lookAtMate(o);
            this.mouth = 0.3;
            this.emote = 'love';
            this.pupils = 1;
            p().add('body', 8 * ramp(t - r.at, 0, 0.3));
            p().add('leg.FL', -30 * ramp(t - r.at, 0, 0.3));
            p().add('leg.FR', -30 * ramp(t - r.at, 0, 0.3));
            p().add('body', 0, 6 * sin(t, 3));
            if (t - r.at > 3.2) this.endAct();
          }
        },
      },
      // Lies down and gnaws his bone between his paws.
      chewBone: {
        weight: 1.3,
        length: [7, 7],
        when: () => !this.walking,
        start: () => {
          this.posture = 'lie';
          this.toy.on = true;
          this.toy.gone = 0;
          this.toy.s = this.s;
        },
        pose: (t) => {
          this.carry(0.04, 0.4);
          const k = ramp(t, 0.6, 1);
          this.mouth = k * (0.25 + 0.25 * Math.max(0, sin(t, 4)));
          p().add('head', 26 * k + 3 * sin(t, 4) * k);
          p().add('leg.FL', -10 * k);
          p().add('leg.FR', -10 * k);
          this.emote = 'happy';
          if (t > 6.4) this.posture = 'stand';
        },
      },
      // An ear flops over his face; he shakes and paws at it.
      earTangle: {
        weight: 1,
        length: [5, 5],
        when: () => !this.walking,
        pose: (t) => {
          const s = pulse(t, 0.2, 1.2);
          p().add('head', 0, 34 * s * sin(t, 5), 8 * s * sin(t, 5, 0.25));
          const over = ramp(t, 1.2, 1.5) * (1 - ramp(t, 3.7, 4.2));
          p().add('ear.L', -75 * over, 0, -60 * over);
          this.emote = over > 0.3 ? 'cross' : 'surprised';
          // A paw goes up to push it off.
          const paw = pulse(t, 2.4, 1.4);
          p().add('leg.FL', -110 * paw);
          p().add('head', 4 * paw, 12 * paw);
        },
      },
      // Bounces on the spot with his paws out, ears flying.
      bounce: {
        weight: 1.3,
        length: [3.6, 3.6],
        when: stand,
        start: () => (this.run.n = 0),
        pose: (t) => {
          const n = Math.floor(t / 0.55);
          if (n >= this.run.n && t < 3.2) {
            this.run.n = n + 1;
            this.hop.kick(2);
            this.flashToes(1);
          }
          this.mouth = 0.4;
          p().add('leg.FL', -8);
          p().add('leg.FR', -8);
          p().add('head', -6 * sin(t, 1.8));
          this.emote = 'happy';
          this.pupils = 1;
        },
      },
      // Sits with his whole rear end wagging, gazing up.
      wagSit: {
        weight: 1.3,
        length: [3.5, 4.5],
        when: () => !this.walking,
        start: () => (this.posture = 'sit'),
        pose: (t) => {
          p().add('body', 0, 5 * sin(t, 3.4));
          p().add('head', -6, -4 * sin(t, 3.4));
          this.mouth = 0.3;
          this.emote = 'love';
          this.pupils = 1;
          p().add('tail.1', 0, 26 * sin(t, 3.4));
        },
      },
      // Hiccups: each one jolts him up off the floor and pops his ears; he looks surprised.
      hiccup: {
        weight: 0.8,
        length: [4.5, 4.5],
        when: () => !this.walking,
        start: () => (this.run.n = 0),
        pose: (t) => {
          const at = [0.5, 1.5, 2.6, 3.9];
          const n = at.filter((a) => t > a).length;
          for (; this.run.n < n; this.run.n++) {
            this.hop.kick(0.7);
            p().kick('head', -260);
            p().kick('ear.L', 0, 0, -200);
            p().kick('ear.R', 0, 0, 200);
            this.flashToes(1);
          }
          const near = at.some((a) => t > a - 0.1 && t < a + 0.35);
          this.emote = near ? 'surprised' : 'neutral';
          this.mouth = near ? 0.25 : 0;
          this.pupils = near ? 1 : 0.5;
        },
      },
      // Spots his own ear out of the corner of his eye and chases it round in circles.
      earChase: {
        weight: 0.9,
        length: [4.2, 4.2],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.spin = 2;
        },
        pose: (t) => {
          const k = ramp(t, 0, 0.4) * (1 - ramp(t, 3.4, 3.9));
          p().add('head', 4 * k, 0, 24 * k);
          p().add('ear.L', 0, 0, -38 * k * (0.5 + 0.5 * sin(t, 3)));
          p().add('ear.R', 0, 0, 38 * k * (0.5 - 0.5 * sin(t, 3)));
          p().add('body', 0, 10 * k);
          this.twitch(t, 22 * k, 4);
          this.mouth = 0.3 * k;
          this.emote = t > 3.4 ? 'dizzy' : 'focused';
          this.pupils = 1;
          if (t > 3.4) this.rollTarget = 4 * sin(t, 2) * (4.2 - t);
        },
      },
      // Tags along behind a crewmate wherever they walk, a step too close.
      followMate: {
        weight: 1,
        length: [10, 10],
        when: () => stand() && this.others().length > 0,
        start: () => {
          this.posture = 'stand';
          if (!this.pickMate()) return;
          this.run.at = 0;
        },
        pose: (t) => {
          const o = this.run.target;
          if (!o || o.state !== 'here') return this.endAct();
          const way = Math.sign(this.s - o.s) || 1;
          if (t - this.run.at > 0.8) {
            this.run.at = t;
            this.walkTo(o.s + way * this.gap(o), o.depth);
          }
          this.boost = 1.2;
          this.mouth = 0.2;
          this.emote = 'happy';
          this.pupils = 1;
          this.lookAtMate(o, 0.6);
          p().add('head', -6);
          p().add('tail.1', 0, 20 * sin(t, 4));
          if (t > 9) this.endAct();
        },
      },
      // A squeaky-toy noise: he is the toy. Squishes down, pops up, three squeaks.
      squeak: {
        weight: 0.8,
        length: [3.4, 3.4],
        when: () => this.posture !== 'lie' && this.still,
        start: () => (this.run.n = 0),
        pose: (t) => {
          const at = [0.4, 1.1, 1.8];
          const n = at.filter((a) => t > a).length;
          for (; this.run.n < n; this.run.n++) this.hop.kick(0.5);
          const b = at.reduce((a, x) => a + pulse(t, x, 0.25), 0);
          p().add('body', 10 * b);
          p().add('head', -14 * b);
          p().add('ear.L', 0, 0, -20 * b);
          p().add('ear.R', 0, 0, 20 * b);
          this.mouth = 0.5 * b;
          this.emote = b > 0.2 ? 'surprised' : 'happy';
          this.outfit?.beacon('#ffffff');
          this.flashToes(b);
        },
      },
      // Shakes hands: sits and holds a paw out, waiting to be taken.
      shakePaw: {
        weight: 0.8,
        length: [4.5, 4.5],
        when: () => !this.walking,
        start: () => (this.posture = 'sit'),
        pose: (t) => {
          const k = ramp(t, 0.2, 0.7) * (1 - ramp(t, 3.8, 4.3));
          p().add('leg.FR', -95 * k + 12 * sin(t, 2.4) * k, 0, 10 * k);
          p().add('head', -6 * k, 0, 10 * k);
          this.mouth = 0.25 * k;
          this.emote = 'love';
          this.pupils = 1;
        },
      },
      // Hides his eyes behind his paws, peeking out.
      coverEyes: {
        weight: 1,
        length: [4, 4],
        when: () => !this.walking,
        start: () => (this.posture = 'sit'),
        pose: (t) => {
          const k = ramp(t, 0, 0.5) * (1 - ramp(t, 3.4, 3.9));
          p().add('leg.FL', -115 * k, 0, -8 * k);
          p().add('leg.FR', -115 * k, 0, 8 * k);
          p().add('head', 14 * k);
          this.emote = t > 2 && t < 2.8 ? 'happy' : 'sad';
        },
      },
    };
  }

  private flashToes(v: number) {
    this.toes.fill(Math.max(v, 0));
  }

  protected idle(t: number) {
    this.carrying = false;
    this.toes = this.toes.map((v) => v * 0.9);
    super.idle(t);
  }

  protected after(dt: number, env: Env) {
    super.after(dt, env);
    // The carried bone is turned to match his body.
    if (this.puppet.has('bone') && this.toy.on) {
      this.puppet.turn('bone', 0, this.carrying ? this.puppet.current('root')[1] : 0, 0);
    }
    // Footsteps: each paw's toes light as it lands.
    const moving = clamp(this.stride / (this.heightPx * 0.8), 0, 1);
    const g = this.gait;
    [0, 1, 2, 3].forEach((i) => {
      const diag = i === 0 || i === 3 ? 0 : Math.PI;
      const step = Math.max(0, Math.sin(g + diag)) ** 3 * moving;
      const idle = 0.12 + 0.08 * Math.sin(env.time * 1.3 + i * 1.7);
      this.outfit?.dot(i, clamp(Math.max(step, this.toes[i], idle), 0, 1));
    });
    // The tail tip glints as it wags; the nose glows a little when he is pleased.
    const happy = ['happy', 'love'].includes(this.expression) ? 0.5 : 0;
    this.outfit?.dot(4, clamp(0.3 + 0.3 * Math.sin(env.time * 4) + happy, 0, 1));
    this.outfit?.dot(5, clamp(0.35 + happy * 0.8 + this.toes[0] * 0.3, 0, 1));
    this.outfit?.beacon(BEACON[this.expression] ?? '#f4f4f1');
  }
}
