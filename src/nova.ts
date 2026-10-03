import type { Object3D } from 'three';
import { BEACON, Bolt, RAINBOW } from './bolt';
import { type Act, Character, clamp, envelope, type Env } from './character';
import type { Expression, FaceLayout } from './face';
import { sin } from './moves';
import { wobble } from './spring';

/**
 * Nova, the robot girl and Bolt's special friend: a helmet head with a headband, two bun
 * ear pods and two springy pigtail antennae, a long screen with lashed eyes, a heart on
 * her chest and a pleated bell skirt, on roller skates. She never walks: she skates, in
 * long glides with a lean and a push of the legs, the wheels turning with the floor.
 *
 * She is confident, playful and a bit cheeky, and she has a lot of little tricks:
 * twirls and pirouettes, a cartwheel, a flip, a headstand on her pigtail lights,
 * skipping, hopscotch, jumping jacks, a curtsey, blowing a kiss (a heart floats off her
 * screen), a wink, juggling three glowing balls (kept inside her until she needs them),
 * drawing a star, heart or flower on her own screen, stretching, a yawn and a nap, a
 * cheer, a shy turn, a flip of the pigtails, an arabesque, and a dance of her own; a slalom,
 * a heel-toe glide, a spin on one skate, a spin-stop that throws sparkles, a wave from the
 * back wall, a pose for the photo and a hop at the front lip.
 * With Bolt standing nearby she skates up for a high five (his hand comes up to meet
 * hers), a dance side by side, or a playful poke.
 *
 * The lights are her mood: the pigtail bulbs, the heart on her chest and the hubs of
 * her wheels glow warm pink and shift with what she is doing (rainbow when she cheers).
 *
 * Arm angles are Bolt's: `raise` lifts an arm sideways from where it hangs, `forward`
 * swings it toward the viewer, `bend` lifts the forearm further.
 */
export const NOVA_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.3, 0.47],
    [0.7, 0.47],
  ],
  rx: 0.08,
  ry: 0.22,
  line: 0.03,
  mouth: [0.5, 0.75],
  kind: 'girl',
};

const ARM_REST = 26;
const DEG = 180 / Math.PI;
/** Wheel radius, metres. */
const WHEEL = 0.022;
const WHEELS = ['wheelF.L', 'wheelB.L', 'wheelF.R', 'wheelB.R'];
const PIGS = ['pig1', 'pig2', 'pig3'];
const smooth = (x: number) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};
/** Mood colours for her lights (the crew's, with her own pink for the everyday). */
const PINK = '#ff7fb0';
const TONE: Partial<Record<Expression, string>> = {
  ...BEACON,
  neutral: '#ffd9e6',
  happy: PINK,
  wink: PINK,
  love: '#ff4f93',
};

export class Nova extends Character {
  /** Direct effects, set by the acts each frame (idle clears them). */
  private fx = {
    roll: 0, // whole-body tumble in the screen plane (radians)
    spin: 0, // whole-body turn about the up axis (radians)
    hop: 0, // metres off the floor
    flare: 0, // skirt flying out
    still: false, // no skating legs
    balls: [0, 0, 0] as number[], // juggling: 0 tucked away, else the ball's height
    ballX: [0, 0, 0] as number[],
  };
  private lightsOn: string | null = null;
  private wheels = 0;
  private pokes: number[] = [];
  private env: Env | null = null;
  private mate: Bolt | null = null;
  private way = 1;
  private arrivedAt = -1;
  private picture: 'star' | 'heart' | 'flower' = 'star';
  private peerDepth = 0.95;
  private legSwap = 1;
  /** Whether this act has already set Bolt going (once per act). */
  private sent = false;
  private lastAct = 'idle';

  constructor(model: Object3D) {
    super(
      {
        name: 'Nova',
        model: 'nova',
        metres: 1.06,
        width: 0.5,
        size: 1.25,
        feels: {
          default: { f: 2.4, zeta: 0.6 },
          root: { f: 2.6, zeta: 0.7 },
          body: { f: 2.4, zeta: 0.55 },
          skirt: { f: 2.2, zeta: 0.3 },
          head: { f: 2.2, zeta: 0.55, r: 0.4 },
          pig1: { f: 2.8, zeta: 0.22 },
          pig2: { f: 3, zeta: 0.18 },
          pig3: { f: 3.2, zeta: 0.14 },
          'upper_arm.L': { f: 2.8, zeta: 0.45 },
          'upper_arm.R': { f: 2.8, zeta: 0.45 },
          'forearm.L': { f: 3.4, zeta: 0.4 },
          'forearm.R': { f: 3.4, zeta: 0.4 },
          'leg.L': { f: 2.6, zeta: 0.45 },
          'leg.R': { f: 2.6, zeta: 0.45 },
        },
        face: NOVA_FACE,
        eyes: 0.66,
        gaze: [
          { bone: 'head', yaw: 0.7, pitch: 0.8 },
          { bone: 'body', yaw: 0.25, pitch: 0.15 },
        ],
        reach: { yaw: 55, pitch: 28 },
        lag: 1.2,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [60, 130],
        speed: 1.3,
      },
      model,
    );
    this.acts = this.moves();
  }

  // ---------- Posing helpers ----------

  /** side: 1 her left, -1 her right. */
  private arm(side: 1 | -1, raise: number, forward = 0, bend = 0, wrist = 0) {
    const s = side === 1 ? 'L' : 'R';
    const out = ((ARM_REST + raise) * Math.PI) / 180;
    this.puppet.add(
      `upper_arm.${s}`,
      -forward * Math.cos(out),
      -side * forward * Math.sin(out),
      side * raise,
    );
    if (bend) this.puppet.add(`forearm.${s}`, 0, 0, side * bend);
    if (wrist) this.puppet.add(`hand.${s}`, 0, 0, side * wrist);
  }

  private arms(raise: number, forward = 0, bend = 0) {
    this.arm(1, raise, forward, bend);
    this.arm(-1, raise, forward, bend);
  }

  /** Legs by pitch (+ swings the foot back) and roll (+ swings the left leg out, the right in). */
  private legs(l: number, r: number, spread = 0) {
    this.puppet.add('leg.L', l, 0, spread);
    this.puppet.add('leg.R', r, 0, -spread);
  }

  /** Both pigtails at once: lean forward/back and out/in. */
  private pigs(lean: number, out = 0) {
    for (const [i, n] of PIGS.entries()) {
      const k = 1 - i * 0.2;
      this.puppet.add(`${n}.L`, lean * k, 0, -out * k);
      this.puppet.add(`${n}.R`, lean * k, 0, out * k);
    }
  }

  /** Off the floor by this many metres, on a parabola over [t0, t0 + dur]. */
  private arc(t: number, t0: number, dur: number, height: number) {
    const u = (t - t0) / dur;
    return u > 0 && u < 1 ? 4 * height * u * (1 - u) : 0;
  }

  /** Bolt, if he is standing on the same floor and free to play. */
  private friend(): Bolt | null {
    const f = this.env?.frame;
    if (!f) return null;
    for (const o of this.env!.crew) {
      if (o instanceof Bolt && o.state === 'here' && !o.flying && !o.seated && o.act === 'idle') {
        return this.spaceTo(o, f).n < 5 ? o : null;
      }
    }
    return null;
  }

  /** Skate to a spot beside Bolt (on this side of him), close enough to touch hands. */
  private beside(o: Bolt, gap = 1.04) {
    this.mate = o;
    this.way = this.s < o.s ? -1 : 1;
    this.arrivedAt = -1;
    const room = this.spaceTo(o, this.env!.frame);
    this.walkTo(o.s + this.way * room.rx * gap, o.depth);
  }

  /** Has she got there (for the acts that go somewhere first)? Then, seconds since. */
  private since(t: number) {
    if (this.walking || this.goal !== null) return -1;
    if (this.arrivedAt < 0) this.arrivedAt = t;
    return t - this.arrivedAt;
  }

  // ---------- Acts ----------

  private moves(): Record<string, Act> {
    const p = this.puppet;
    const still = () => !this.walking && this.state === 'here';
    const room = () => this.state === 'here';
    const skate = (way: number, far: number, depth?: number) => {
      const f = this.env?.frame;
      if (!f) return;
      const [lo, hi] = this.span(f);
      const w = way || (this.s - lo > hi - this.s ? -1 : 1);
      const reach = Math.max(0, (w > 0 ? hi - this.s : this.s - lo) - this.widthPx());
      this.walkTo(this.s + w * Math.min(far, reach), depth);
    };
    return {
      idle: { weight: 3, length: [3, 6] },
      // ---- Skating about
      glide: {
        weight: 2.4,
        length: [1.5, 3],
        when: still,
        start: () =>
          skate(Math.random() < 0.5 ? -1 : 1, this.heightPx * (1.2 + Math.random() * 1.8)),
      },
      airplane: {
        weight: 0.8,
        length: [3, 4],
        face: 'happy',
        when: still,
        start: () => skate(0, this.heightPx * (4 + Math.random() * 3)),
        pose: (t) => {
          this.spec.speed = 2.8;
          this.arms(64 + 6 * sin(t, 0.8), 0, 0);
          p.add('body', 10, 0, 0);
          p.add('head', -5);
          this.pigs(-25, 10);
          this.fx.flare = 0.15;
        },
      },
      lap: {
        weight: 0.8,
        length: [6.5, 6.5],
        face: 'happy',
        when: still,
        start: () => (this.arrivedAt = -1),
        pose: (t) => {
          // A loop of the floor: out along it, back through the depths, home.
          this.spec.speed = 2.2;
          const k = Math.floor(t / 1.6);
          if (k !== this.arrivedAt && k < 4) {
            this.arrivedAt = k;
            const w = this.way;
            this.way = -w;
            const legs: [number, number][] = [
              [w * 1.6, 0.85],
              [w * 3.2, 0.5],
              [w * 1.6, 0.15],
              [0, 0.2],
            ];
            const [dx, d] = legs[k];
            this.walkTo(this.s + dx * this.heightPx * 0.5, d);
          }
          this.arm(1, 40, 0, 0);
          this.arm(-1, 40, 0, 0);
          p.add('body', 6);
        },
      },
      backwards: {
        weight: 0.5,
        length: [3, 3],
        face: 'happy',
        when: still,
        pose: (t) => {
          // Rolling along backwards, looking over a shoulder at us.
          this.spec.turn = 0;
          this.spec.speed = 1;
          if (t < 0.15) skate(0, this.heightPx * 2);
          p.add('head', 0, 22 * sin(t, 0.4), -4);
          this.arm(1, 30, 10, 30);
          this.arm(-1, 30, 10, 30);
        },
      },
      // ---- Turning and tumbling
      twirl: {
        weight: 1.2,
        length: [2.6, 2.6],
        face: 'happy',
        when: room,
        pose: (t) => {
          const u = smooth((t - 0.3) / 2);
          this.fx.spin = Math.PI * 4 * u;
          this.fx.flare = Math.sin(Math.PI * u) * 1.1;
          this.arms(46, 0, 10);
          this.pigs(0, 22 * Math.sin(Math.PI * u));
          this.fx.hop = this.arc(t, 0.2, 1.8, 0.05);
        },
      },
      pirouette: {
        weight: 0.8,
        length: [2.4, 2.4],
        face: 'focused',
        when: room,
        pose: (t) => {
          // A skater's spin: fast, arms overhead, one foot tucked.
          const u = smooth((t - 0.2) / 1.9);
          this.fx.spin = Math.PI * 7 * u;
          this.fx.flare = 0.9 * Math.sin(Math.PI * u);
          this.arms(112, 8, 40);
          this.legs(0, 34, 0);
          this.pigs(0, 30 * u * (1 - u) * 4);
        },
      },
      cartwheel: {
        weight: 0.8,
        length: [2.6, 2.6],
        face: 'happy',
        when: still,
        start: () => {
          this.way = Math.random() < 0.5 ? -1 : 1;
          skate(this.way, this.heightPx * 2.2, this.depth);
        },
        pose: (t) => {
          this.spec.turn = 0;
          this.spec.speed = 1.7;
          this.fx.still = true;
          const u = smooth((t - 0.35) / 1.5);
          this.fx.roll = -this.way * Math.PI * 2 * u;
          this.fx.hop = 0.09 * Math.sin(Math.PI * u);
          const open = Math.sin(Math.PI * u);
          this.arms(60 + 55 * open, 0, 0);
          this.legs(0, 0, 12 + 34 * open);
          this.fx.flare = 0.6 * open;
        },
      },
      flip: {
        weight: 0.6,
        length: [2.4, 2.4],
        face: 'surprised',
        when: room,
        start: () => (this.way = Math.random() < 0.5 ? -1 : 1),
        pose: (t) => {
          // A somersault on the spot, with a crouch to spring from and a landing.
          this.fx.still = true;
          const crouch = t < 0.5 ? smooth(t / 0.5) : 0;
          const u = clamp((t - 0.55) / 1.1, 0, 1);
          this.fx.roll = -this.way * Math.PI * 2 * smooth(u);
          this.fx.hop = this.arc(t, 0.55, 1.1, 0.38) - 0.03 * crouch * (u > 0 ? 0 : 1);
          p.add('body', 20 * crouch);
          this.arms(30 - 20 * crouch, 20 * crouch, 20);
          this.legs(-20 * crouch, -20 * crouch, 6);
          if (u >= 1 && t < 1.9) p.kick('body', 60, 0, 0);
          this.fx.flare = u > 0 && u < 1 ? 0.7 : 0;
          if (u >= 1) this.expression = 'happy';
        },
      },
      headstand: {
        weight: 0.5,
        length: [5.5, 5.5],
        face: 'happy',
        when: room,
        pose: (t) => {
          // Upside down, balanced on the lights of her pigtails, feet waving.
          this.fx.still = true;
          const up = smooth((t - 0.4) / 0.9) * smooth((this.actLength - 0.4 - t) / 0.9);
          this.fx.roll = Math.PI * up + 0.09 * Math.sin(t * 4) * up;
          this.fx.hop = 0.16 * up;
          this.arm(1, 70 + 20 * sin(t, 0.9), 0, 20);
          this.arm(-1, 70 - 20 * sin(t, 0.9), 0, 20);
          this.legs(0, 0, 10 + 16 * up * Math.abs(sin(t, 0.5)));
          this.fx.flare = 0.5 * up;
        },
      },
      // ---- Hops and steps
      skip: {
        weight: 1.1,
        length: [3.4, 4.4],
        face: 'happy',
        when: still,
        start: () => skate(0, this.heightPx * (2 + Math.random() * 2)),
        pose: (t) => {
          this.spec.speed = 0.8;
          this.fx.still = true;
          const s = sin(t, 1.5);
          this.fx.hop = 0.06 * Math.abs(s);
          this.legs(-26 * s, 26 * s);
          this.arm(1, 25 + 20 * s, 12 * s, 20);
          this.arm(-1, 25 - 20 * s, -12 * s, 20);
          p.add('head', 0, 0, 5 * s);
          p.add('body', 0, 0, -3 * s);
          this.pigs(10 * Math.abs(s), 0);
        },
      },
      hopscotch: {
        weight: 0.7,
        length: [5.5, 5.5],
        face: 'focused',
        when: still,
        start: () => {
          this.legSwap = Math.random() < 0.5 ? 1 : -1;
          skate(0, this.heightPx * 3);
        },
        pose: (t) => {
          this.spec.speed = 0.65;
          this.fx.still = true;
          const hz = 1.5;
          const h = Math.abs(sin(t, hz / 2));
          this.fx.hop = 0.075 * h;
          const swap = this.legSwap * (Math.floor(t * hz * 0.34) % 2 ? -1 : 1);
          // Every third hop lands on the other foot; the raised one bent up behind.
          this.legs(swap > 0 ? 8 : 55, swap > 0 ? 55 : 8);
          this.arm(1, 58, 0, 10);
          this.arm(-1, 58, 0, 10);
          p.add('body', 6, 0, 3 * swap);
          if (t > 4.4) this.expression = 'happy';
        },
      },
      jacks: {
        weight: 0.9,
        length: [4, 5],
        face: 'happy',
        when: room,
        pose: (t) => {
          this.fx.still = true;
          const s = (1 + sin(t, 1.6)) / 2;
          this.arms(16 + 100 * s, 6, 6 + 30 * s);
          this.legs(0, 0, 4 + 24 * s);
          this.fx.hop = 0.06 * (1 - Math.abs(2 * s - 1));
          this.fx.flare = 0.4 * s;
          this.pigs(-8 * s, 14 * s);
          p.add('head', 3 * s);
        },
      },
      arabesque: {
        weight: 0.6,
        length: [4, 4],
        face: 'happy',
        when: room,
        pose: (t) => {
          // One leg swept up behind, arms wide, up on one skate.
          const k = envelope(t, this.actLength, 0.6);
          this.fx.still = true;
          p.add('leg.R', 34 * k, 0, -64 * k);
          p.add('body', 10 * k);
          p.add('head', -14 * k, 12 * k * sin(t, 0.25), -8 * k);
          this.arm(1, 60 * k, 20 * k, 6);
          this.arm(-1, 110 * k, 0, 6);
          p.add('root', 0, 0, 3 * k * sin(t, 0.6));
          this.pigs(-18 * k, 6);
          this.fx.flare = 0.25 * k;
        },
      },
      // ---- Manners and charm
      curtsey: {
        weight: 0.9,
        length: [3, 3],
        face: 'happy',
        when: room,
        pose: (t) => {
          const k = smooth((t - 0.2) / 0.6) * smooth((this.actLength - 0.3 - t) / 0.6);
          this.fx.still = true;
          p.add('body', 12 * k);
          p.add('head', 8 * k);
          this.arm(1, 34 * k, -18 * k, 22 * k);
          this.arm(-1, 34 * k, -18 * k, 22 * k);
          this.legs(0, 30 * k, 0);
          this.fx.flare = 0.3 * k;
          p.shift('root', 0, -0.05 * k, 0);
          this.pigs(-20 * k, 0);
        },
      },
      kiss: {
        weight: 0.9,
        length: [3.2, 3.2],
        face: 'wink',
        when: room,
        pose: (t) => {
          // A hand to her mouth, sweeping out, and a heart floats off her screen.
          const toMouth = smooth(t / 0.5);
          const sweep = smooth((t - 0.8) / 0.35);
          this.arm(-1, 40 + 10 * sweep, 66 + 6 * sweep, 118 - 90 * sweep, 12 * sin(t, 4) * sweep);
          p.add('head', -6 * toMouth, 8 * sweep, 8 * toMouth);
          p.add('body', 0, 0, 3 * sweep);
          if (t > 1.05 && t < 2.8 && this.face) {
            const u = (t - 1.05) / 1.75;
            this.face.doodle = {
              shape: 'heart',
              progress: 1,
              solo: false,
              fill: true,
              at: [0.5 + 0.36 * u, 0.75 - 0.42 * u],
              size: 0.3 * (1 - u * 0.6),
            };
          }
          if (t > 2.2) this.expression = 'love';
        },
      },
      wink: {
        weight: 1,
        length: [2.2, 2.6],
        face: 'wink',
        when: room,
        pose: (t) => {
          const k = envelope(t, this.actLength, 0.3);
          p.add('head', -4 * k, 0, 9 * k);
          p.add('body', 0, 0, -3 * k);
          this.arm(1, 24 * k, 14 * k, 78 * k); // a hand on her hip
          this.arm(-1, 40 * k, 6 * k, 20 * k, 10 * Math.sin(t * 5));
          this.legs(0, 0, 8 * k);
          this.pigs(0, 8 * k * sin(t, 1.2));
        },
      },
      shy: {
        weight: 0.7,
        length: [3.6, 3.6],
        face: 'happy',
        when: room,
        pose: (t) => {
          const k = envelope(t, this.actLength, 0.5);
          p.add('head', 14 * k, 26 * k, 10 * k);
          p.add('body', 6 * k, 0, 2 * k * sin(t, 0.6));
          this.arm(1, -8 * k, 40 * k, 60 * k);
          this.arm(-1, -8 * k, 40 * k, 60 * k);
          p.add('leg.L', 0, 0, 10 * k);
          p.add('leg.R', 0, 0, 4 * k);
          this.pigs(6 * k, -8 * k);
        },
      },
      hairflip: {
        weight: 0.9,
        length: [2.6, 2.6],
        face: 'wink',
        when: room,
        start: () => {
          p.kick('head', 0, 0, 0);
        },
        pose: (t) => {
          const k = smooth(t / 0.4) * smooth((this.actLength - 0.3 - t) / 0.4);
          this.arm(1, 90 * k, 58 * k, 96 * k);
          const toss = t > 0.7 && t < 1.0 ? 1 : 0;
          p.add('head', -6 * k, -22 * toss * k, -12 * toss * k);
          if (Math.abs(t - 0.75) < 0.02) {
            for (const n of PIGS) {
              p.kick(`${n}.L`, 0, 0, 900);
              p.kick(`${n}.R`, 0, 0, 900);
            }
          }
          this.pigs(6, 0);
        },
      },
      wave: {
        weight: 1.5,
        length: [2.4, 3.2],
        face: 'happy',
        when: () => this.hovered || Math.random() < 0.5,
        pose: (t) => {
          this.arm(-1, 44, 25, 55 + 18 * sin(t, 1.7), 16 * sin(t, 1.7));
          p.add('head', 0, 0, -7);
          p.add('body', 0, 0, 2 * sin(t, 0.85));
        },
      },
      dance: {
        weight: 1.3,
        length: [5, 8],
        face: 'happy',
        when: room,
        pose: (t) => {
          // Her own move: hips one way, hands the other, a point to the sky, a step-hop.
          const beat = sin(t, 1);
          const half = sin(t, 0.5);
          this.fx.still = true;
          p.add('root', 0, 0, 5 * beat);
          p.add('body', 0, 0, -8 * beat);
          p.add('skirt', 0, 0, 16 * beat);
          this.arm(1, 100 + 40 * half, 8, 30 - 20 * half);
          this.arm(-1, 40 - 30 * half, 20, 90 - 30 * half);
          this.legs(-10 * beat, 10 * beat, 6 + 6 * Math.abs(beat));
          p.add('head', 4 * Math.abs(beat), 0, 8 * beat);
          this.fx.hop = 0.03 * Math.abs(beat);
          this.fx.flare = 0.35 + 0.25 * beat;
          this.pigs(0, 16 * beat);
        },
      },
      cheer: {
        weight: 0.9,
        length: [3, 4],
        face: 'happy',
        when: room,
        pose: (t) => {
          // Pom-poms are her lights: they flash in rainbow with each jump.
          this.fx.still = true;
          this.arm(1, 95 + 25 * sin(t, 2.2), 16, 30);
          this.arm(-1, 95 - 25 * sin(t, 2.2), 16, 30);
          this.fx.hop = 0.07 * Math.abs(sin(t, 1.1));
          this.fx.flare = 0.5 * Math.abs(sin(t, 1.1));
          p.add('head', -8 + 4 * sin(t, 2.2));
          this.pigs(0, 20 * Math.abs(sin(t, 1.1)));
          this.lightsOn = 'rainbow';
        },
      },
      draw: {
        weight: 1.1,
        length: [5.5, 5.5],
        face: 'happy',
        when: room,
        start: () => {
          this.picture = (['star', 'heart', 'flower'] as const)[Math.floor(Math.random() * 3)];
        },
        pose: (t) => {
          // Her screen turns into a sketchpad: a finger draws, the picture appears stroke by stroke.
          const u = clamp((t - 0.9) / 3, 0, 1);
          this.arm(-1, 90, 62, 100, 20 * sin(t, 2.4));
          p.add('head', 4, -8 * sin(t, 0.4), 6);
          if (this.face && t > 0.5 && t < this.actLength - 0.6) {
            this.face.doodle = {
              shape: this.picture,
              progress: u,
              solo: true,
              at: [0.5, 0.5],
              size: 0.36,
            };
          }
          if (t > 4.2 && t < this.actLength - 0.6) this.expression = 'happy';
          this.lightsOn = u >= 1 ? 'proud' : null;
        },
      },
      juggle: {
        weight: 0.8,
        length: [6, 7],
        face: 'focused',
        when: room,
        pose: (t) => {
          // Three glowing balls from inside her torso, thrown up in turn and caught.
          const k = smooth((t - 0.3) / 0.4) * smooth((this.actLength - t) / 0.5);
          const period = 1.5;
          this.fx.still = true;
          for (let i = 0; i < 3; i++) {
            const u = (((t / period + i / 3) % 1) + 1) % 1;
            // Each ball: up the middle, over the top, down the other side.
            const arc = 4 * u * (1 - u);
            this.fx.balls[i] = k * (0.34 + 0.3 * arc);
            this.fx.ballX[i] = k * 0.25 * Math.cos(Math.PI * u);
          }
          this.arm(1, 40 + 22 * sin(t, 2), 26, 60 - 14 * sin(t, 2));
          this.arm(-1, 40 - 22 * sin(t, 2), 26, 60 + 14 * sin(t, 2));
          p.add('head', -10 * k + 10 * sin(t, 0.9) * k, 0, 0);
          p.add('body', 0, 0, 2 * sin(t, 1));
          if (t > this.actLength - 1.2) this.expression = 'happy';
        },
      },
      stretch: {
        weight: 0.8,
        length: [6, 6],
        face: 'sleepy',
        when: room,
        pose: (t) => {
          // Up on tiptoe reaching, a lean each way, a fold down to the toes.
          this.fx.still = true;
          if (t < 2) {
            const k = smooth(t / 0.6);
            this.arms(120 * k, 6, 24);
            p.add('body', -6 * k);
            p.add('head', -10 * k);
            this.legs(0, 0, 0);
          } else if (t < 3.8) {
            const s = sin(t - 2, 0.55);
            this.arms(120, 6, 24);
            p.add('root', 0, 0, 12 * s);
            p.add('body', 0, 0, 10 * s);
          } else {
            const k = smooth((t - 3.8) / 0.7) * smooth((this.actLength - 0.2 - t) / 0.5);
            p.add('body', 28 * k);
            p.add('head', 10 * k);
            this.arms(6, 20 * k, 0);
            this.legs(-8 * k, -8 * k);
            this.fx.flare = 0.2 * k;
          }
          if (t > 4.6) this.expression = 'happy';
        },
      },
      nap: {
        weight: 0.6,
        length: [11, 16],
        face: 'sleepy',
        when: still,
        pose: (t) => {
          // A big yawn behind her hand, then she nods off on her skates.
          this.fx.still = true;
          const yawn = smooth(t / 0.6) * smooth((3.2 - t) / 0.6);
          const doze = smooth((t - 2.6) / 1.5);
          this.arm(-1, 90 * yawn, 34 * yawn, 100 * yawn);
          p.add('head', -18 * yawn + 26 * doze + 3 * sin(t, 0.22) * doze);
          p.add('body', 10 * doze + 1.5 * sin(t, 0.22));
          this.arms(-4 * doze, 8 * doze, 0);
          this.pigs(0, -10 * doze);
          if (t > 3.4) this.expression = 'asleep';
        },
      },
      slalom: {
        weight: 0.7,
        length: [5.4, 5.4],
        face: 'focused',
        when: still,
        start: () => (this.arrivedAt = -1),
        pose: (t) => {
          // Weaving in and out through invisible cones: across the floor and through the depths.
          this.spec.speed = 1.9;
          const k = Math.floor(t / 0.9);
          if (k !== this.arrivedAt && k < 5) {
            this.arrivedAt = k;
            this.way = this.way || 1;
            this.walkTo(this.s + this.way * this.heightPx * 0.9, k % 2 ? 0.75 : 0.05);
          }
          const lean = 12 * sin(t, 0.55);
          p.add('body', 6, 0, lean);
          p.add('head', 0, 0, -lean * 0.6);
          this.arm(1, 44 + lean, 0, 10);
          this.arm(-1, 44 - lean, 0, 10);
          this.pigs(-16, -lean);
          if (t > 4.6) this.expression = 'happy';
        },
      },
      heeltoe: {
        weight: 0.6,
        length: [3.4, 3.4],
        face: 'happy',
        when: still,
        start: () => skate(0, this.heightPx * 2.4),
        pose: (t) => {
          // A cool glide: one skate ahead, one behind, switching, arms out for balance.
          this.spec.speed = 1.1;
          this.fx.still = true;
          const s = sin(t, 0.7);
          this.legs(-30 * s, 30 * s, 8);
          this.arm(1, 52, 0, 8);
          this.arm(-1, 52, 0, 8);
          p.add('body', 4, 0, 3 * s);
          p.add('head', -4, 8 * s, 0);
          this.pigs(-12, 4);
        },
      },
      spinfoot: {
        weight: 0.6,
        length: [3.2, 3.2],
        face: 'focused',
        when: room,
        pose: (t) => {
          // Slow spin on one skate, the other leg stretched out to the side.
          const u = smooth((t - 0.3) / 2.5);
          this.fx.still = true;
          this.fx.spin = Math.PI * 4 * u;
          this.fx.flare = 0.7 * Math.sin(Math.PI * u);
          this.legs(0, 8, 0);
          p.add('leg.R', 0, 0, -58 * Math.sin(Math.PI * Math.min(1, u * 1.6)));
          this.arm(1, 96, 0, 6);
          this.arm(-1, 96, 0, 6);
          p.add('head', -6, 0, 0);
          this.pigs(0, 20 * Math.sin(Math.PI * u));
        },
      },
      spinstop: {
        weight: 0.6,
        length: [4.4, 4.4],
        face: 'happy',
        when: still,
        start: () => skate(0, this.heightPx * 2.6),
        pose: (t) => {
          // Skates up fast, spins to a stop, and a spray of sparkles bursts round her.
          this.spec.speed = 2.6;
          const go = this.walking;
          if (go) {
            p.add('body', 9);
            this.arms(50, 0, 10);
            return;
          }
          const w = this.arrivedAt < 0 ? (this.arrivedAt = t) : this.arrivedAt;
          const u = t - w;
          this.fx.still = true;
          this.fx.spin = Math.PI * 2 * smooth(u / 0.9);
          this.fx.flare = 0.9 * Math.sin(Math.PI * smooth(u / 0.9));
          this.arms(70, 0, 20);
          if (u > 0.8 && u < 2.2) {
            const q = (u - 0.8) / 1.4;
            for (let i = 0; i < 3; i++) {
              const a = (i / 3) * Math.PI * 2 + 2;
              this.fx.balls[i] = 0.3 + 0.35 * q * Math.abs(Math.sin(a)) - 0.2 * q * q;
              this.fx.ballX[i] = (0.14 + 0.25 * q) * Math.cos(a);
            }
            this.fx.hop = this.arc(u, 0.8, 0.5, 0.05);
            this.lightsOn = 'rainbow';
          }
          if (u > 1) this.expression = 'wink';
        },
      },
      backwave: {
        weight: 0.6,
        length: [7, 7],
        face: 'happy',
        when: still,
        start: () => this.walkTo(this.s, 0.95),
        pose: (t) => {
          // Off to the back wall, and a big wave from far away.
          if (t > this.actLength - 2.4 && this.goal === null && this.depthGoal === 0.95)
            this.walkTo(this.s, 0.2);
          if (this.walking) return;
          this.arm(-1, 84, 10, 30 + 30 * sin(t, 2.2), 20 * sin(t, 2.2));
          this.arm(1, 40 + 10 * sin(t, 2.2), 6, 20);
          p.add('head', 0, 0, -6);
          p.add('body', 0, 0, 3 * sin(t, 1.1));
          this.pigs(4, 10 * sin(t, 1.1));
        },
      },
      photo: {
        weight: 0.6,
        length: [4.2, 4.2],
        face: 'wink',
        when: room,
        pose: (t) => {
          // A pose for the camera: peace sign, head on one side, a flash of the lights.
          const k = smooth((t - 0.2) / 0.5) * smooth((this.actLength - 0.3 - t) / 0.5);
          this.fx.still = true;
          this.arm(-1, 78 * k, 30 * k, 110 * k, 10 * k);
          this.arm(1, 30 * k, 0, 10 * k);
          p.add('head', -4 * k, 0, 12 * k);
          p.add('body', 0, 0, -4 * k);
          this.legs(0, 14 * k, 3);
          this.pigs(-6 * k, 12 * k);
          this.fx.flare = 0.25 * k;
          if (t > 1.8 && t < 2.3) this.lightsOn = 'proud';
          if (t > 1.8 && t < 2.0) p.kick('head', -8, 0, 0);
        },
      },
      liptrick: {
        weight: 0.6,
        length: [6, 6],
        face: 'focused',
        when: still,
        start: () => this.walkTo(this.s, 0),
        pose: (t) => {
          // Rolls up to the front lip, then a little jump with a kick of the heels.
          this.spec.speed = 1.8;
          if (this.walking) return;
          if (this.arrivedAt < 0) this.arrivedAt = t;
          const u = t - this.arrivedAt;
          this.fx.still = true;
          const crouch = smooth(u / 0.4) * (u < 0.5 ? 1 : 0);
          this.fx.hop = this.arc(u, 0.5, 0.8, 0.14);
          this.fx.spin = Math.PI * 2 * smooth((u - 0.6) / 0.6) * (u > 0.6 ? 1 : 0);
          this.arms(30 + 40 * crouch, 20 * crouch, 20);
          p.add('body', 14 * crouch);
          this.legs(-14 * crouch, -14 * crouch, 4);
          if (u > 1.3 && u < 1.4) p.kick('body', 30, 0, 0);
          if (u > 1.4) this.expression = 'happy';
        },
      },
      // ---- Using the box's depth
      peer: {
        weight: 0.8,
        length: [7, 8],
        when: still,
        start: () => {
          this.peerDepth = Math.random() < 0.6 ? 0.95 : 0;
          this.walkTo(this.s, this.peerDepth);
        },
        pose: (t) => {
          // To the back wall to shade her eyes and look far off, or to the front lip to lean over it.
          if (t > this.actLength - 2.4 && this.goal === null && this.depthGoal === this.peerDepth)
            this.walkTo(this.s, 0.2);
          if (this.walking) return;
          if (this.peerDepth === 0) {
            p.add('body', 10);
            p.add('head', 10 + 3 * sin(t, 0.4));
            this.arm(1, 30, 30, 20);
            this.arm(-1, 30, 30, 20);
            this.expression = 'surprised';
          } else {
            this.arm(-1, 110, 34, 100);
            p.add('head', -4, 34 * sin(t, 0.3));
            this.expression = 'focused';
          }
        },
      },
      // ---- With Bolt
      highfive: {
        weight: 1.6,
        length: [9, 9],
        face: 'happy',
        when: () => this.state === 'here' && !this.walking && this.friend() !== null,
        start: () => {
          const o = this.friend();
          if (o) this.beside(o, 1.0);
        },
        pose: (t) => {
          this.spec.steers = false; // she means to walk up to him
          const o = this.mate;
          if (!o || o.state !== 'here' || o.flying) return void this.setAct('idle');
          const since = this.since(t);
          if (since < 0) {
            if (t > 6) this.setAct('idle');
            this.arm(1, 8, 12, 30);
            return;
          }
          if (since > 0.35 && !this.sent) {
            this.sent = true;
            o.friend = this.way as 1 | -1;
            o.perform('highfive');
          }
          // Her arm on his side comes up; hers meets his about half a second later.
          const k = smooth((since - 0.6) / 0.45) * smooth((2.6 - since) / 0.4);
          const hit = since > 1.55 && since < 1.9 ? 1 : 0;
          this.arm(-this.way as 1 | -1, (62 + 8 * hit) * k, 14 * k, 26 * k);
          this.arm(this.way as 1 | -1, 4, 6, 12);
          p.add('head', 0, -this.way * 14 * k, this.way * 4 * k);
          this.fx.hop = this.arc(since, 1.5, 0.5, 0.06);
          if (since > 1.5) this.lightsOn = 'rainbow';
          if (since > 3) this.setAct('idle');
        },
      },
      sidedance: {
        weight: 1,
        length: [11, 11],
        face: 'happy',
        when: () => this.state === 'here' && !this.walking && this.friend() !== null,
        start: () => {
          const o = this.friend();
          if (o) this.beside(o, 1.05);
        },
        pose: (t) => {
          this.spec.steers = false; // she means to walk up to him
          const o = this.mate;
          if (!o || o.state !== 'here' || o.flying) return void this.setAct('idle');
          const since = this.since(t);
          if (since < 0) {
            if (t > 6) this.setAct('idle');
            return;
          }
          if (since > 0.4 && !this.sent) {
            this.sent = true;
            o.perform('dance');
          }
          const beat = sin(since, 1);
          const half = sin(since, 0.5);
          this.fx.still = true;
          p.add('root', 0, 0, 5 * beat);
          p.add('body', 0, 0, -8 * beat);
          p.add('skirt', 0, 0, 16 * beat);
          this.arm(1, 50 + 40 * half, 10, 30 + 30 * half);
          this.arm(-1, 50 - 40 * half, 10, 30 - 30 * half);
          this.legs(-12 * beat, 12 * beat, 6);
          p.add('head', 6 * Math.abs(beat), 0, 6 * beat);
          this.fx.hop = 0.035 * Math.abs(beat);
          this.fx.flare = 0.35 + 0.25 * beat;
          this.pigs(0, 16 * beat);
          if (since > 5.5) this.setAct('idle');
        },
      },
      prod: {
        weight: 0.9,
        length: [9, 9],
        face: 'wink',
        when: () => this.state === 'here' && !this.walking && this.friend() !== null,
        start: () => {
          const o = this.friend();
          if (o) this.beside(o, 1.0);
        },
        pose: (t) => {
          this.spec.steers = false; // she means to walk up to him
          const o = this.mate;
          if (!o || o.state !== 'here' || o.flying) return void this.setAct('idle');
          const since = this.since(t);
          if (since < 0) {
            if (t > 6) this.setAct('idle');
            return;
          }
          // Sneaks a finger out, pokes him, and skates a step back giggling.
          const side = -this.way as 1 | -1;
          const reach = smooth((since - 0.5) / 0.35) * smooth((1.8 - since) / 0.3);
          this.arm(side, 62 * reach, 0, 6 * reach);
          p.add('body', 0, this.way * 6 * reach, 0);
          p.add('head', 0, -this.way * 12 * reach);
          if (since > 1.3 && !this.sent) {
            this.sent = true;
            o.poke();
          }
          if (since > 1.35) {
            this.expression = 'happy';
            this.fx.hop = this.arc(since, 1.4, 0.45, 0.05);
            p.add('body', 0, 0, this.way * 5 * sin(since, 3));
            this.lightsOn = 'giggle';
          }
          if (since > 3) this.setAct('idle');
        },
      },
      // ---- Reactions (never picked at random)
      poked: {
        weight: 0,
        length: [1.8, 1.8],
        face: 'surprised',
        pose: (t) => {
          this.fx.hop = this.arc(t, 0, 0.5, 0.1);
          this.arms(40, 8, 10);
          this.pigs(0, 26);
          this.fx.flare = t < 0.6 ? 0.7 : 0;
          if (t > 0.9) this.expression = 'happy';
        },
      },
      dizzy: {
        weight: 0,
        length: [3, 3],
        face: 'dizzy',
        pose: (t) => {
          const a = 2 * Math.PI * 1.1 * t;
          p.add('body', 7 * Math.cos(a), 0, 7 * Math.sin(a));
          p.add('head', -6 * Math.sin(a), 0, 6 * Math.cos(a));
          this.arms(20 + 10 * Math.sin(a * 1.3));
          this.fx.spin = 2 * Math.PI * smooth(t / 2.6);
          this.fx.still = true;
          this.pigs(10 * Math.cos(a), 18 * Math.sin(a));
          this.lightsOn = 'rainbow';
        },
      },
    };
  }

  poke() {
    if (this.state !== 'here') return;
    const now = performance.now() / 1000;
    this.pokes = [...this.pokes.filter((at) => now - at < 1.6), now];
    if (this.pokes.length >= 3) {
      this.pokes = [];
      this.setAct('dizzy');
    } else if (this.act !== 'dizzy') this.setAct('poked');
  }

  protected onEnter() {
    this.wheels = 0;
    this.mate = null;
  }

  // ---------- Each frame ----------

  update(dt: number, env: Env) {
    this.env = env;
    if (this.act !== this.lastAct) {
      this.lastAct = this.act;
      this.arrivedAt = -1;
      this.sent = false;
    }
    super.update(dt, env);
    // The tumble turns about the middle of her body (the pivot), after the frame is placed.
    this.pivot.rotation.z += this.fx.roll;
    this.pivot.rotation.y = this.fx.spin;
  }

  protected idle(t: number) {
    const p = this.puppet;
    const breath = Math.sin(2 * Math.PI * 0.27 * t);
    Object.assign(this.fx, { roll: 0, spin: 0, hop: 0, flare: 0, still: false });
    this.fx.balls = [0, 0, 0];
    this.fx.ballX = [0, 0, 0];
    this.lightsOn = null;
    if (this.face) this.face.doodle = null;
    this.spec.turn = 80;
    this.spec.speed = 1.3;
    this.spec.steers = true;
    this.arms(4 + 1.5 * breath, 0, 0);
    p.add('body', 1.2 * breath);
    p.add('head', 1.5 * breath, 0, 2 * wobble(t * 0.3, 1));
    p.add('skirt', 0, 0, 1.5 * Math.sin(2 * Math.PI * 0.3 * t));
    // Pigtails: never still.
    const s = wobble(t * 0.9, 3);
    this.pigs(6 * s, 5 + 4 * wobble(t * 0.7, 5));
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    this.env = env;
    // The mouse resting on her: pleased.
    if (this.hovered && this.state === 'here' && this.act === 'idle' && this.actT > 0.8)
      this.setAct(Math.random() < 0.5 ? 'wave' : 'wink');
    // Skating: lean into it, push with the legs, skirt and pigtails trail behind.
    const amt = clamp(this.stride / (this.heightPx * 1.2), 0, 1.3);
    if (amt > 0.02 && !this.fx.still) {
      const a = Math.sin(this.gait * 0.55);
      this.legs(-16 * a * amt - 4 * amt, 16 * a * amt - 4 * amt, 3 * amt);
      p.add('body', 8 * amt);
      p.add('head', -3 * amt);
      p.add('skirt', -10 * amt, 0, 0);
      this.arm(1, 6 * amt, -14 * a * amt, 8 * amt);
      this.arm(-1, 6 * amt, 14 * a * amt, 8 * amt);
      this.pigs(-22 * amt, 6 * amt);
    }
    this.h = this.fx.hop * this.px;
    // Wheels turn with the floor going by.
    this.wheels += (this.stride * dt) / (WHEEL * this.px);
  }

  protected after(_dt: number, env: Env) {
    const p = this.puppet;
    for (const w of WHEELS) p.turn(w, (this.wheels * DEG) % 360);
    // Skirt flare: shorter and wider, as if caught by the wind.
    const f = this.fx.flare;
    p.stretch('skirt', 1 - 0.14 * f, [0, 1, 0], 1 + 0.3 * f);
    // Juggling balls: home (tucked away) or flying about in front of her.
    this.fx.balls.forEach((h, i) => {
      const name = `ball${i + 1}`;
      const on = h > 0;
      p.stretch(name, on ? 1 : 0.001, [0, 1, 0], on ? 1 : 0.001);
      if (on) p.shift(name, this.fx.ballX[i], h - 0.5, 0.17);
    });
    this.lights(env.time);
    if (this.act === 'idle' && this.state === 'here')
      this.expression = this.hovered ? 'happy' : 'neutral';
  }

  /** Bulbs, heart, hubs and juggling balls: her mood in light. */
  private lights(time: number) {
    const mood = this.face?.expression ?? 'neutral';
    const t = this.actT;
    let tone = TONE[mood] ?? PINK;
    let a = 0.55 + 0.25 * Math.sin(time * 2);
    let b = 0.55 + 0.25 * Math.sin(time * 2 + 1.6);
    let heart = 0.7 + 0.3 * Math.sin(time * 2.4);
    let hubs = this.stride > 1 ? 0.5 + 0.5 * Math.sin(time * 14) : 0.15;
    if (this.lightsOn === 'rainbow') {
      tone = RAINBOW[Math.floor(time * 8) % RAINBOW.length];
      a = b = heart = hubs = 1;
    } else if (this.lightsOn === 'giggle') {
      a = Math.sin(time * 18) > 0 ? 1 : 0.2;
      b = 1.2 - a;
      heart = 1;
    } else if (this.lightsOn === 'proud') {
      a = b = heart = 1;
    } else if (mood === 'asleep') {
      tone = '#8a8a84';
      a = b = 0.2 + 0.15 * Math.sin(time * 1.2);
      heart = a;
      hubs = 0.05;
    } else if (mood === 'dizzy') {
      tone = RAINBOW[Math.floor(time * 6) % RAINBOW.length];
      a = b = heart = 1;
    } else if (this.act === 'wink' || this.act === 'kiss') {
      // A quick flutter on the wink.
      a = Math.sin(time * 9) > 0 ? 1 : 0.4;
      b = 1;
    } else if (this.act === 'hairflip') {
      a = b = t > 0.7 && t < 1.6 ? 1 : 0.5;
    }
    this.outfit.dot(0, clamp(a, 0, 1), tone);
    this.outfit.dot(1, clamp(b, 0, 1), tone);
    this.outfit.dot(2, clamp(heart, 0, 1), tone);
    this.outfit.dot(3, clamp(hubs, 0, 1), tone);
    for (let i = 0; i < 3; i++) this.outfit.dot(4 + i, 1, RAINBOW[(i + 1) % RAINBOW.length]);
  }
}
