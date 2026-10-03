import type { Object3D } from 'three';
import { BEACON } from './bolt';
import { type Act, type Character, clamp, type Env } from './character';
import type { Expression } from './face';
import { sin } from './moves';
import { type Anatomy, type Feeling, type Mood, Pet } from './pet';
import { Spring } from './spring';

/**
 * What the two kittens (Bit and Scamp) share: the play of a young cat. Both are Pets, so
 * they sit, lie, nap and stretch like Pixel, but they spend the day on little tricks: they
 * pounce on nothing, stalk a crewmate (and never touch: it stops at the edge of their
 * room and bolts), fall over, tumble, chase their tails, knead, mew, race about in
 * zoomies, doze off in mid-step and puff up like bottle brushes to hop sideways.
 *
 * The tricks live here as building blocks; each kitten picks its own list and weights,
 * and adds the ones only it does. A trick that walks says where to (`go`), and a trick
 * that needs a toy shows one on a bone of its own (a ball, a light spot) that is
 * stretched to nothing the rest of the time.
 *
 * The kitten as a whole can be rolled about its middle (`roll`, a spring, so a topple
 * wobbles): that turns the whole model in the screen plane, whichever way it faces.
 */
const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;

/** 0 before a, 1 after b, smooth between. */
export const ramp = (t: number, a: number, b: number) => {
  const k = clamp((t - a) / (b - a), 0, 1);
  return k * k * (3 - 2 * k);
};
/** A bump from 0 to 1 and back over `length` seconds starting at `at`. */
export const pulse = (t: number, at: number, length: number) =>
  t > at && t < at + length ? Math.sin(((t - at) / length) * Math.PI) : 0;

/** Where a kitten is built: how high its middle is, and its toy. */
export interface Build {
  /** Height of the body's middle above the floor (metres): what a roll turns about. */
  middle: number;
  /** The toy on its own bone: where it rests in the model (x to its left, z to its front,
   * metres), and its radius. */
  prop?: { bone: string; rest: [number, number]; radius: number; flat?: boolean };
  /** How high its leaps go, relative to a stubby kitten's. */
  spring: number;
  /** Its walking speed in --bot per second. */
  speed: number;
}

/** How each mood shows in a kitten's tail and ears (bouncier than a grown cat's). */
export function kittenMoods(): Anatomy['moods'] {
  return {
    calm: {
      face: 'neutral',
      carriage: -15,
      bob: [6, 0.3],
      hook: 15,
      flicks: 0.3,
      ears: 0,
      out: 0,
      swivel: 0.4,
    },
    curious: { face: 'neutral', carriage: 10, hook: 30, flicks: 1.2, ears: 14, out: -4, swivel: 1 },
    happy: { face: 'happy', carriage: 25, hook: 30, quiver: 0.4, ears: 10, out: -6, swivel: 0.3 },
    love: { face: 'love', carriage: 25, hook: 20, quiver: 1, ears: 8, out: -8, swivel: 0 },
    alarmed: { face: 'surprised', carriage: 20, hook: -20, puff: 1, ears: -25, out: 18, swivel: 0 },
    annoyed: {
      face: 'dizzy',
      carriage: -40,
      bob: [14, 1.2],
      hook: -10,
      ears: -10,
      out: 30,
      swivel: 0,
    },
    sad: { face: 'sad', carriage: -70, ears: -15, out: 30, swivel: 0 },
    sleepy: {
      face: 'sleepy',
      carriage: -60,
      bob: [3, 0.12],
      hook: 5,
      ears: -5,
      out: 20,
      swivel: 0.1,
    },
    asleep: { face: 'asleep', carriage: -60, flicks: 0.15, ears: -5, out: 14, swivel: 0.3 },
  };
}

export const KITTEN_ACT_MOODS = {
  purr: 'love',
  startle: 'alarmed',
  dizzy: 'annoyed',
  puffCrab: 'alarmed',
  groom: 'happy',
  knead: 'love',
  mew: 'happy',
  zoomies: 'happy',
  tumble: 'happy',
  ballPlay: 'happy',
  spotChase: 'happy',
  pounce: 'curious',
  stalk: 'curious',
  watch: 'curious',
  tilt: 'curious',
  dozeOff: 'sleepy',
  stretch: 'sleepy',
  nap: 'asleep',
} satisfies Record<string, Mood>;

interface Waypoint {
  s: number;
  depth?: number;
}

/** The scratch state of the trick in progress. */
interface Run {
  dir: number;
  phase: number;
  n: number;
  at: number;
  target: Character | null;
  done: boolean;
}
const fresh = (): Run => ({ dir: 1, phase: 0, n: 0, at: 0, target: null, done: false });

export abstract class Kitty extends Pet {
  protected abstract readonly build: Build;
  protected env!: Env;
  /** The trick in progress. */
  protected run = fresh();
  private route: Waypoint[] = [];
  /** Multiplies its walking speed this frame (a trick sets it each frame it wants it). */
  protected boost = 1;
  /** An expression a trick wants this frame (else the mood's), and how round the pupils are. */
  protected emote: Expression | null = null;
  protected pupils = 0.3;
  /** Where the eyes look (-1..1 each way) when a trick says so, else at the mouse. */
  protected eyes: { x: number; y: number } | null = null;
  /** The whole kitten turned in the screen plane about its middle, degrees. */
  protected roll = new Spring(2.6, 0.5);
  protected rollTarget = 0;
  /** Turns of a spin on the spot, per act (as Byte's chase). */
  protected spin = 0;
  private baseY: number;
  private pupilNow = new Spring(6, 0.8, 1, 0.3);
  private ready = false;
  /** The toy: where it is along the edge (px), how fast it rolls, and whether it's out. */
  protected toy = { s: 0, v: 0, on: false, gone: 0, roll: 0 };
  private toyShow = new Spring(5, 0.5, 1, 0);
  private toyLast = 0;
  /** How far the toy is held up off the floor (metres): a bone carried in the mouth. */
  protected toyLift = 0;
  /** How far the toy is moved toward the viewer from where its bone rests (metres). */
  protected toyAhead = 0;
  private baseSpeed = 1;

  constructor(spec: ConstructorParameters<typeof Pet>[0], model: Object3D) {
    super(spec, model);
    this.baseY = model.position.y;
    this.baseSpeed = spec.speed ?? 1;
  }

  // ---------- Helpers for the tricks ----------

  protected get standing() {
    return this.posture === 'stand' && !this.walking;
  }

  protected get still() {
    return !this.walking;
  }

  /** Crewmates on the same floor. */
  protected others(): Character[] {
    return (this.env?.crew ?? []).filter(
      (o) => o !== (this as Character) && o.state === 'here' && !o.free && o.edge === this.edge,
    );
  }

  /** A random place along the floor, clear of the ends. */
  protected somewhere(): Waypoint {
    const [lo, hi] = this.span(this.env.frame);
    const half = this.footprint(this.env.frame).x;
    return { s: lo + half + Math.random() * (hi - lo - 2 * half), depth: Math.random() };
  }

  /** Walk this route, one stop after another. */
  protected go(points: Waypoint[]) {
    this.route = [...points];
    this.nextStop();
  }

  private nextStop() {
    const p = this.route.shift();
    if (p) this.walkTo(p.s, p.depth ?? this.depth);
  }

  protected get atStop() {
    return this.route.length === 0 && this.goal === null && this.stride < 2;
  }

  protected endAct() {
    this.actLength = 0;
  }

  protected frontLegs(v: number, roll = 0) {
    this.puppet.add('leg.FL', v, 0, roll);
    this.puppet.add('leg.FR', v, 0, -roll);
  }

  protected backLegs(v: number) {
    this.puppet.add('leg.BL', v);
    this.puppet.add('leg.BR', v);
  }

  /** The tail tip twitching, all the tail's bones a beat apart. */
  protected twitch(t: number, amount: number, hz = 6) {
    const bones = this.anatomy.tail;
    bones.forEach((b, i) => this.puppet.add(b, 0, amount * sin(t, hz, -i * 0.12), 0));
  }

  /** Head and eyes toward a crewmate. */
  protected lookAtMate(o: Character, share = 0.8) {
    const me = this.eyePoint(this.env.frame);
    const at = o.eyePoint(this.env.frame);
    const yaw = Math.atan2(at.x - me.x, this.heightPx * 3) * DEG;
    this.puppet.add('head', 0, clamp(yaw * share, -50, 50));
    this.eyes = {
      x: clamp((at.x - me.x) / (this.heightPx * 3), -1, 1),
      y: clamp((at.y - me.y) / (this.heightPx * 3), -1, 1),
    };
  }

  /** Eyes on a spot along the floor (px along the edge). */
  protected lookAtFloor(s: number) {
    const me = this.eyePoint(this.env.frame);
    this.eyes = { x: clamp((s - this.s) / (this.heightPx * 2), -1, 1), y: 0.8 };
    this.puppet.add(
      'head',
      12,
      clamp(Math.atan2(s - me.x, this.heightPx * 3) * DEG * 0.7, -50, 50),
    );
  }

  /** Away from the nearer end of the floor: the way there is room to go. */
  protected roomy() {
    const [lo, hi] = this.span(this.env.frame);
    return this.s - lo > hi - this.s ? -1 : 1;
  }

  // ---------- The frame ----------

  protected onEnter() {
    super.onEnter();
    this.hideToy();
  }

  private hideToy() {
    if (this.build.prop) this.puppet.stretch(this.build.prop.bone, 0, [0, 1, 0], 0);
    this.ready = true;
  }

  protected setAct(name: string) {
    // Whatever turns the last trick left in its roll are whole ones: forget them.
    const k = Math.round(this.roll.y / 360) * 360;
    this.roll.snap(this.roll.y - k);
    this.rollTarget = 0;
    this.spin = 0;
    this.run = fresh();
    this.toy.on = false;
    this.route = [];
    super.setAct(name);
  }

  protected idle(t: number) {
    this.boost = 1;
    this.emote = null;
    this.eyes = null;
    this.pupils = 0.3;
    this.extraLift = 0;
    this.trotting = true;
    super.idle(t);
    if (this.route.length && this.goal === null && this.stride < 2) this.nextStop();
  }

  protected pose(dt: number, env: Env) {
    this.env = env;
    super.pose(dt, env);
  }

  protected after(dt: number, env: Env) {
    const face = this.face;
    // Speed: a trick can hurry it (or slow it to a creep).
    this.spec.speed = this.baseSpeed * this.boost;
    // Face: a trick's own expression, big pupils when it is all eyes.
    if (this.emote) this.expression = this.emote;
    if (face) {
      face.dilate = clamp(this.pupilNow.update(dt, this.pupils), 0, 1);
      if (this.eyes) {
        face.look.x = this.eyes.x;
        face.look.y = this.eyes.y;
      }
    }
    // The bell says how it feels.
    this.outfit?.beacon(BEACON[this.expression] ?? '#f4f4f1');
    // Spinning on the spot.
    if (this.spin) {
      const k = clamp(this.actT / Math.max(this.actLength, 0.1), 0, 1);
      this.pivot.rotation.y = -this.spin * 2 * Math.PI * (k * k * (3 - 2 * k));
    } else this.pivot.rotation.y = 0;
    this.rolling(dt);
    this.playToy(dt, env);
  }

  /** Turn the whole model about its middle. */
  private rolling(dt: number) {
    const a = this.roll.update(dt, this.rollTarget) * RAD;
    const c = this.build.middle;
    const m = this.model;
    m.rotation.z = a;
    m.position.x = c * Math.sin(a);
    m.position.y = this.baseY + c * (1 - Math.cos(a));
  }

  /** The toy: put out, batted about along the floor, put away. */
  private playToy(dt: number, env: Env) {
    if (!this.ready || !this.build.prop) return;
    const { bone, rest, radius } = this.build.prop;
    const p = this.puppet;
    const t = this.toy;
    const show = clamp(this.toyShow.update(dt, t.on && t.gone <= 0 ? 1 : 0), 0, 1.3);
    t.gone -= dt;
    if (show < 0.01) {
      p.stretch(bone, 0, [0, 1, 0], 0);
      return;
    }
    const [lo, hi] = this.span(env.frame);
    const half = radius * this.px;
    // It rolls, slows, and bounces off the ends of the floor.
    t.s += t.v * dt;
    t.v *= Math.exp(-1.6 * dt);
    if (t.s < lo + half || t.s > hi - half) {
      t.s = clamp(t.s, lo + half, hi - half);
      t.v *= -0.6;
    }
    t.roll -= ((t.s - this.toyLast) / (radius * this.px)) * DEG;
    this.toyLast = t.s;
    p.stretch(bone, show, [0, 1, 0], show);
    p.shift(bone, (t.s - this.s) / this.px - rest[0], this.toyLift, this.toyAhead);
    if (!this.build.prop.flat) p.turn(bone, 0, 0, t.roll);
  }

  /** A kick at the toy: sends it along the floor. */
  protected batToy(dir: number, power = 3) {
    this.toy.v = dir * this.heightPx * power;
  }

  protected toyDistance() {
    return this.toy.s - this.s;
  }

  // ---------- The tricks ----------

  /** The tricks both kittens know, by name; each kitten picks and weighs its own. */
  protected tricks(): Record<string, Act> {
    const p = () => this.puppet;
    const stand = () => this.standing;
    const still = () => this.still;
    const stop = () => {
      this.goal = null;
    };
    return {
      // Crouched, rear wiggling, a leap, a crash landing on nothing at all.
      pounce: {
        weight: 0,
        length: [2.8, 2.8],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.run.dir = this.roomy();
        },
        pose: (t) => {
          const crouch = ramp(t, 0, 0.35) * (t < 1.15 ? 1 : 0);
          if (t < 1.15) {
            p().add('body', 20 * crouch);
            this.frontLegs(-32 * crouch);
            this.backLegs(12 * crouch);
            const w = sin(t, 5) * 9 * crouch;
            p().add('body', 0, w);
            p().add('head', -12 * crouch, -w * 0.8);
            this.extraLift = -0.03 * crouch;
            this.twitch(t, 22 * crouch, 5);
            this.emote = 'focused';
            this.pupils = 1;
          }
          if (t >= 1.15 && !this.run.done) {
            this.run.done = true;
            this.hop.kick(2.6 * this.build.spring);
            this.boost = 3;
            this.walkTo(this.s + this.run.dir * this.heightPx * 1.3, this.depth);
          }
          if (t >= 1.15 && t < 1.55) {
            this.boost = 3;
            p().add('body', -18);
            this.frontLegs(-70);
            this.backLegs(25);
            this.emote = 'surprised';
            this.pupils = 1;
          } else if (t >= 1.55 && t < 2.2) {
            // Landed on nothing: nose first.
            p().add('body', 10);
            p().add('head', 20);
            this.frontLegs(-15);
            this.emote = 'surprised';
            this.pupils = 1;
          } else if (t >= 2.2) {
            // Where did it go?
            p().add('head', 0, 22 * sin(t, 0.9), 10 * sin(t, 0.9, 0.25));
          }
        },
      },
      // Play-stalking a crewmate: low and slow, a wiggle, then off in a flash.
      stalk: {
        weight: 0,
        length: [7, 8],
        when: () => stand() && this.others().length > 0,
        start: () => {
          this.posture = 'stand';
          const all = this.others();
          this.run.target = all[Math.floor(Math.random() * all.length)];
        },
        pose: (t) => {
          const o = this.run.target;
          if (!o || o.state !== 'here') return this.endAct();
          const near = this.spaceTo(o, this.env.frame).n < 1.7;
          this.lookAtMate(o, 0.9);
          this.pupils = 1;
          this.emote = 'focused';
          const low = ramp(t, 0, 0.4);
          p().add('body', 16 * low);
          this.frontLegs(-26 * low);
          this.extraLift = -0.02 * low;
          this.twitch(t, 18, 4);
          if (this.run.phase === 0) {
            // Creep: a few steps, freeze, a few more.
            const creeping = sin(t, 0.35) > -0.3;
            this.boost = creeping ? 0.5 : 0.05;
            this.walkTo(o.s, o.depth);
            if (near || t > 5) {
              this.run.phase = 1;
              this.run.at = t;
              stop();
              this.depthGoal = this.depth;
            }
          } else if (this.run.phase === 1) {
            // The wiggle, ready to spring.
            const w = sin(t - this.run.at, 6) * 10;
            p().add('body', 0, w);
            p().add('head', 0, -w);
            if (t - this.run.at > 1) {
              this.run.phase = 2;
              this.run.at = t;
              this.hop.kick(1.8 * this.build.spring);
              this.boost = 3;
              this.walkTo(this.s + (this.s < o.s ? -1 : 1) * this.heightPx * 2.5, this.depth);
            }
          } else {
            // Away, tail up, delighted with itself.
            this.boost = 3;
            this.emote = 'happy';
            this.pupils = 0.8;
            p().add('body', -8);
            if (t - this.run.at > 1) this.endAct();
          }
        },
      },
      // Round and round after its own tail, and a wobble when it stops.
      tailChase: {
        weight: 0,
        length: [3, 3],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.spin = 2;
        },
        pose: (t) => {
          p().add('head', 12, -50);
          p().add('body', 0, 12);
          this.twitch(t, 30, 4);
          this.emote = t > 2.3 ? 'dizzy' : 'focused';
          this.pupils = 1;
          if (t > 2.3) this.rollTarget = 5 * sin(t, 2) * (3 - t);
        },
      },
      // Kneading: front paws pressing in turn, eyes half shut, purring.
      knead: {
        weight: 0,
        length: [4, 5],
        when: stand,
        start: () => (this.posture = 'stand'),
        pose: (t) => {
          const k = ramp(t, 0, 0.4);
          p().add('body', 9 * k);
          const a = sin(t, 1.6);
          p().add('leg.FL', (-58 + 22 * a) * k);
          p().add('leg.FR', (-58 - 22 * a) * k);
          p().add('head', 22 * k + 2 * sin(t, 0.5));
          p().add('head', 0, 0, 4 * sin(t, 0.8));
          this.extraLift = -0.02 * k;
          this.emote = 'sleepy';
        },
      },
      // Tiny mews: the head lifts, the mouth would open, the bell flashes.
      mew: {
        weight: 0,
        length: [3.2, 3.2],
        when: still,
        start: () => (this.posture = 'sit'),
        pose: (t) => {
          const m = pulse(t, 0.4, 0.4) + pulse(t, 1.4, 0.4) + 0.7 * pulse(t, 2.3, 0.4);
          p().add('head', -10 - 12 * m);
          p().add('body', -3 * m);
          this.emote = m > 0.2 ? 'happy' : 'neutral';
          this.pupils = 0.5 + 0.5 * m;
          this.twitch(t, 8 * m, 8);
        },
      },
      // Zoomies: dashes across the floor, front to back and side to side.
      zoomies: {
        weight: 0,
        length: [6, 6],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.go([this.somewhere(), this.somewhere(), this.somewhere(), this.somewhere()]);
        },
        pose: (t) => {
          this.boost = 2.8;
          this.emote = 'happy';
          this.pupils = 1;
          p().add('body', -6);
          if (this.atStop && t > 0.5) this.endAct();
        },
      },
      // Falls asleep in mid-step, and wakes with a start.
      dozeOff: {
        weight: 0,
        length: [6, 6],
        when: stand,
        start: () => {
          this.posture = 'stand';
          const way = this.roomy();
          this.walkTo(this.s + way * this.heightPx * 3, this.depth);
        },
        pose: (t) => {
          const sleepy = ramp(t, 0.5, 2.6);
          this.boost = 0.6 - 0.45 * sleepy;
          if (t < 3.3) {
            p().add('head', 40 * sleepy, 0, 8 * sleepy);
            p().add('body', 8 * sleepy);
            this.emote = t > 1.6 ? 'sleepy' : null;
            if (t > 2.8) this.emote = 'asleep';
          }
          if (t >= 2.7 && t < 3.3) {
            stop();
            this.route = [];
          }
          if (t >= 3.3 && !this.run.done) {
            this.run.done = true;
            this.hop.kick(1.4);
            this.puppet.kick('head', -300);
          }
          if (t >= 3.3) {
            this.emote = t < 4 ? 'surprised' : 'neutral';
            this.pupils = 1;
            p().add('head', 0, 30 * sin(t, 0.8));
          }
        },
      },
      // Puffed up like a bottle brush, hopping sideways with an arched back.
      puffCrab: {
        weight: 0,
        length: [3.4, 3.4],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.run.dir = this.roomy();
          this.run.n = 0;
        },
        pose: (t) => {
          const k = ramp(t, 0, 0.25) * (1 - ramp(t, 2.9, 3.4));
          // Face us whichever way it goes, angled to its side.
          p().add('root', 0, -this.heading.y * k + this.run.dir * 38 * k);
          p().add('body', -14 * k);
          this.frontLegs(8 * k);
          this.backLegs(-8 * k);
          this.extraLift = 0.01 * k;
          this.pupils = 1;
          if (t > 0.5 && t < 2.8) {
            const hops = Math.floor((t - 0.5) / 0.55);
            if (hops >= this.run.n) {
              this.run.n = hops + 1;
              this.hop.kick(1.5 * this.build.spring);
              this.boost = 3;
              this.walkTo(this.s + this.run.dir * this.heightPx * 0.55, this.depth);
            }
          }
        },
      },
      // Tips over sideways, wobbles, lies there, scrambles up again.
      fallOver: {
        weight: 0,
        length: [4, 4],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.run.dir = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          if (t < 0.7) this.rollTarget = this.run.dir * 7 * Math.sin(t * 9) * (t / 0.7);
          else if (t < 2.5) {
            this.rollTarget = this.run.dir * 84;
            this.emote = t < 1.2 ? 'surprised' : 'dizzy';
            const k = ramp(t, 0.9, 1.2);
            p().add('leg.FL', -30 + 25 * sin(t, 2.2), 0, 0);
            p().add('leg.BR', 25 * sin(t, 2.2, 0.3) * k);
            p().add('head', -6 * k);
          } else {
            if (!this.run.done) {
              this.run.done = true;
              this.hop.kick(1.6);
            }
            this.rollTarget = 0;
            this.emote = 'surprised';
            p().add('head', 0, 0, 8 * sin(t, 1.5));
          }
        },
      },
      // Peers out from the very back of the box.
      backWall: {
        weight: 0,
        length: [9, 9],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.walkTo(this.s + this.roomy() * this.heightPx * 0.8, 0.95);
        },
        pose: (t) => {
          if (this.run.phase === 0 && this.atStop) {
            this.run.phase = 1;
            this.run.at = t;
          }
          if (this.run.phase === 1) {
            // At the back wall: tall, looking up and about.
            const k = ramp(t - this.run.at, 0, 0.5);
            p().add('body', -8 * k);
            p().add('head', -18 * k + 6 * sin(t, 0.6), 30 * sin(t, 0.35));
            this.pupils = 0.8;
            this.twitch(t, 12 * k, 3);
            if (t - this.run.at > 3.5) {
              this.run.phase = 2;
              this.walkTo(this.s + this.roomy() * this.heightPx * 0.8, 0.05);
            }
          }
          if (this.run.phase === 2 && this.atStop) this.endAct();
        },
      },
      // Trots right to the front lip and looks over it, down at the floor below.
      frontLip: {
        weight: 0,
        length: [7, 7],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.walkTo(this.s + this.roomy() * this.heightPx * 0.6, 0);
        },
        pose: (t) => {
          if (this.run.phase === 0 && this.atStop) {
            this.run.phase = 1;
            this.run.at = t;
          }
          if (this.run.phase === 1) {
            const k = ramp(t - this.run.at, 0, 0.5);
            p().add('body', -12 * k);
            this.frontLegs(-14 * k);
            p().add('head', 28 * k + 5 * sin(t, 0.7), 8 * sin(t, 0.4));
            this.eyes = { x: 0, y: 1 };
            this.emote = 'surprised';
            this.pupils = 1;
            if (t - this.run.at > 3.2) {
              this.run.phase = 2;
              this.walkTo(this.s + this.roomy() * this.heightPx, 0.25);
            }
          }
          if (this.run.phase === 2 && this.atStop) this.endAct();
        },
      },
      // A lap round a spot on the floor, in and out of the box.
      circle: {
        weight: 0,
        length: [7, 7],
        when: stand,
        start: () => {
          this.posture = 'stand';
          const r = this.heightPx * 1.4;
          const [lo, hi] = this.span(this.env.frame);
          const c = clamp(this.s + this.roomy() * r, lo + r, hi - r);
          this.go([
            { s: c - r, depth: 0.5 },
            { s: c, depth: 0.85 },
            { s: c + r, depth: 0.5 },
            { s: c, depth: 0.05 },
            { s: c - r, depth: 0.5 },
          ]);
        },
        pose: (t) => {
          this.boost = 1.5;
          this.emote = 'happy';
          if (this.atStop && t > 0.5) this.endAct();
        },
      },
      // Sits, watching a crewmate, head on one side.
      watch: {
        weight: 0,
        length: [4, 6],
        when: () => still() && this.others().length > 0,
        start: () => {
          this.posture = 'sit';
          const all = this.others();
          this.run.target = all[Math.floor(Math.random() * all.length)];
          this.run.dir = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          const o = this.run.target;
          if (!o || o.state !== 'here') return this.endAct();
          this.lookAtMate(o);
          p().add('head', 0, 0, 12 * this.run.dir * ramp(t, 0, 0.5));
          this.pupils = 0.9;
          this.twitch(t, 10, 2);
        },
      },
      // The curious head tilt, ears up.
      tilt: {
        weight: 0,
        length: [2.4, 2.4],
        when: still,
        start: () => (this.run.dir = Math.random() < 0.5 ? -1 : 1),
        pose: (t) => {
          const k = ramp(t, 0, 0.3) * (1 - ramp(t, 2, 2.4));
          p().add('head', -4 * k, 0, 16 * this.run.dir * k);
          this.pupils = 0.9;
          this.emote = 'neutral';
        },
      },
      // A sneeze: head back, then a snap, and a little jump.
      sneeze: {
        weight: 0,
        length: [2.6, 2.6],
        when: still,
        pose: (t) => {
          const a = pulse(t, 0.3, 0.45) + pulse(t, 1.4, 0.45);
          const snap = pulse(t, 0.7, 0.2) + pulse(t, 1.8, 0.2);
          p().add('head', -16 * a + 30 * snap);
          p().add('body', 8 * snap);
          this.emote = snap > 0.2 ? 'surprised' : a > 0.2 ? 'happy' : null;
          this.pupils = 1;
          if (t > 0.75 && !this.run.done) {
            this.run.done = true;
            this.hop.kick(1.1 * this.build.spring);
          }
        },
      },
      // Shakes its head to ring the bell (and the bell lights up).
      bell: {
        weight: 0,
        length: [1.8, 1.8],
        when: still,
        pose: (t) => {
          const k = ramp(t, 0, 0.15) * (1 - ramp(t, 1.4, 1.8));
          p().add('head', 0, 34 * k * sin(t, 4.5), 10 * k * sin(t, 4.5, 0.25));
          p().add('ear.L', 0, 0, -30 * k * sin(t, 4.5));
          p().add('ear.R', 0, 0, 30 * k * sin(t, 4.5));
          this.emote = 'happy';
          if (k > 0.3) this.outfit?.beacon(sin(t, 9) > 0 ? '#ffe17a' : '#f4f4f1');
        },
      },
      // Swats at a dangling something only it can see, eyes following it about.
      batAir: {
        weight: 0,
        length: [4.5, 4.5],
        when: still,
        start: () => (this.posture = 'sit'),
        pose: (t) => {
          const x = 0.7 * sin(t, 0.55);
          const y = -0.4 + 0.3 * sin(t, 0.9, 0.25);
          this.eyes = { x, y };
          p().add('head', -14 + 8 * y, 26 * x);
          const swat = Math.max(0, sin(t, 1.7));
          p().add('leg.FL', -100 - 40 * swat, 0, x < 0 ? 0 : 0);
          p().add('leg.FR', -100 - 40 * Math.max(0, sin(t, 1.7, 0.5)));
          this.pupils = 1;
          this.emote = 'focused';
        },
      },
      // Sitting up, grooming a paw (a lick a beat).
      wash: {
        weight: 0,
        length: [3.5, 4.5],
        when: still,
        start: () => (this.posture = 'sit'),
        pose: (t) => {
          const lick = sin(t, 1.8);
          p().add('leg.FL', -130 - 12 * lick, 0, -12);
          p().add('head', 18 + 6 * lick, 16, -6);
          this.emote = 'happy';
        },
      },
      // The reaction to three pokes: a spin, a stagger.
      dizzy: {
        weight: 0,
        length: [3, 3],
        start: () => {
          this.posture = 'stand';
          this.spin = 1;
        },
        pose: (t) => {
          p().add('head', 0, 20 * sin(t, 1.6), 14 * sin(t, 1.6, 0.25));
          this.rollTarget = 12 * sin(t, 1.2) * (1 - ramp(t, 1.5, 3));
          this.emote = 'dizzy';
        },
      },
      purr: {
        weight: 0,
        length: [2.5, 3.5],
        pose: (t) => {
          p().add('head', 0, 0, 10 * sin(t, 0.5));
          this.hopOnce(t, 0.05, 1);
        },
      },
    };
  }

  private hopOnce(t: number, at: number, power: number) {
    if (t > at && !this.run.done) {
      this.run.done = true;
      this.hop.kick(power * this.build.spring);
    }
  }

  poke() {
    if (this.state !== 'here') return;
    if (this.poked() >= 3) this.setAct('dizzy');
    else if (this.posture === 'lie' || this.act === 'dizzy') this.setAct('startle');
    else this.setAct('purr');
  }

  /** Curled up, the tail wraps round to one side. */
  protected tailLying() {
    const p = this.puppet;
    const [a, b, ...rest] = this.anatomy.tail;
    p.add(a, -35, 55);
    p.add(b, 0, 0, -35);
    rest.forEach((bone) => p.add(bone, 0, 0, -25));
  }
}

export type { Feeling };
