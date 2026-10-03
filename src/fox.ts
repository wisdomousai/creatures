import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Act, type Character, clamp, type Env, type Frame } from './character';
import type { FaceLayout } from './face';
import { Spring } from './spring';
import { sin, trot } from './moves';
import { type Anatomy, type Feeling, type Mood, Pet } from './pet';

/**
 * Vix, the robot fox: a sleek little machine of faceted panels with tall ears on
 * joints, a screen face, antenna whiskers and a big bushy tail of telescoping plates
 * whose seams and tip are lights. Tail, ears and lights say how she feels: pricked and
 * turning after the mouse when something catches her eye, laid back when she's pleased,
 * the tail carried high and swept when she's happy. Rest the mouse on her and she leans
 * into it, eyes gone to hearts, the tail glowing pink. Poke her and she jumps; poke her
 * again and she bows to play; three quick pokes and she's dizzy.
 *
 * Her party trick is mousing: she freezes and listens, head cocked, ears swivelling
 * one after the other, turns her tail lights off so nothing sees her coming, then springs
 * up in a high arc and dives nose first into the frame line as if into snow, hind legs
 * kicking and tail sticking straight up, flashing. Then she pops out and shakes herself.
 *
 * The rest of her repertoire is foxy: she sneaks along the back wall low and dim, stalks
 * a crewmate and dashes away, rears up on the back wall to peer out, leans over the front
 * lip, sniffs the floor, digs, pats at something with a paw, chases her own tail, sweeps the
 * floor with it, sits with it wrapped round her feet, grooms it, curls up under it to
 * sleep, howls with the tail lights rising, yips "ring-ding" in time with a hop, waves,
 * pronks, prances, sneezes, rolls over and races about in zoomies.
 */
export const FOX_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.31, 0.5],
    [0.69, 0.5],
  ],
  rx: 0.08,
  ry: 0.28,
  line: 0.035,
  mouth: null,
};

const TAIL = ['tail.1', 'tail.2', 'tail.3', 'tail.4'];
const LEGS = ['leg.FL', 'leg.FR', 'leg.BL', 'leg.BR'];

// Her tail at rest runs straight out behind her; moods carry it higher or lower.
const FOX: Anatomy = {
  tail: TAIL,
  tailAxis: [0, -0.1, -1],
  earsHang: false,
  moods: {
    calm: {
      face: 'neutral',
      carriage: -18,
      bob: [4, 0.2],
      wag: [6, 0.4],
      ears: 0,
      out: 4,
      swivel: 0.4,
    },
    curious: { face: 'neutral', carriage: -4, flicks: 0.8, hook: 12, ears: 14, out: -4, swivel: 1 },
    happy: { face: 'happy', carriage: 10, wag: [22, 1.3], ears: 6, out: 6, swivel: 0.3 },
    love: { face: 'love', carriage: 4, wag: [26, 1.8], ears: -22, out: 16, swivel: 0 },
    alarmed: { face: 'surprised', carriage: 28, hook: -20, puff: 1, ears: -26, out: 10, swivel: 0 },
    annoyed: {
      face: 'cross',
      carriage: -12,
      wag: [10, 2.6],
      puff: 0.3,
      ears: -30,
      out: 40,
      swivel: 0,
    },
    sad: { face: 'sad', carriage: -45, ears: -20, out: 26, swivel: 0 },
    sleepy: { face: 'sleepy', carriage: -32, bob: [3, 0.12], ears: -8, out: 18, swivel: 0.1 },
    asleep: { face: 'asleep', carriage: -30, flicks: 0.15, ears: -12, out: 22, swivel: 0.2 },
  },
  actMoods: {
    love: 'love',
    startle: 'alarmed',
    play: 'happy',
    listen: 'curious',
    pounce: 'curious',
    stretch: 'sleepy',
    yawn: 'sleepy',
    nap: 'asleep',
    sneak: 'curious',
    stalk: 'curious',
    peek: 'curious',
    lookOver: 'curious',
    pawPat: 'curious',
    earRadar: 'curious',
    tilt: 'curious',
    chatter: 'happy',
    signal: 'happy',
    beacon: 'happy',
    dig: 'happy',
    prance: 'happy',
    shakeOff: 'happy',
    wave: 'happy',
    pronk: 'happy',
    takeBow: 'happy',
    roll: 'happy',
    zoomies: 'happy',
    tailChase: 'happy',
    circle: 'happy',
    hideTail: 'curious',
    visit: 'curious',
    victory: 'happy',
    howl: 'calm',
    tailSweep: 'calm',
    scratch: 'calm',
    sniff: 'calm',
    groom: 'calm',
    sneeze: 'calm',
  } satisfies Record<string, Mood>,
  lying: 'sleepy',
  hover: 'happy',
  drop: { stand: 0, sit: -0.15, lie: -0.18 },
  sit: -24,
  turn: 50,
};

/** The pounce, in seconds from its start: notice, listen, wind up, leap, dive, pop out, shake. */
const P = { listen: 0.5, wind: 2.7, leap: 3.1, land: 3.8, out: 5.4, back: 6, end: 6.9 };
/** How far the leap carries her (metres), how high, and how deep she dives. */
const LEAP = { far: 0.85, high: 0.42, deep: 0.1 };
/** Acts that do their own thing with the tail, so the sitting wrap keeps out of it. */
const TAIL_BUSY = ['tailSweep', 'signal', 'beacon', 'howl', 'tailChase', 'hideTail', 'victory'];
/** 0 before a, 1 after b, eased between. */
const ease = (t: number, a: number, b: number) => {
  const u = clamp((t - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
};
/** Fades in over `a`..`b`, holds, and fades out over `c`..`d`. */
const span = (t: number, a: number, b: number, c: number, d: number) =>
  ease(t, a, b) * (1 - ease(t, c, d));

export class Fox extends Pet {
  protected readonly anatomy: Anatomy = { ...FOX, drop: { ...FOX.drop } };
  private gaze = this.spec.gaze;
  private frame: Frame | null = null;
  private env: Env | null = null;
  /** The pounce: which way (+1 to the right), where it took off, how far it reaches. */
  private way = 1;
  private from = 0;
  private hover = 0;
  private hops = 0;
  /** The side she curls up and wraps her tail to (+1 her left): the side facing you. */
  private side = 1;
  /** Whom she is stalking, and what she is up to in an act with steps (when it began). */
  private prey: Character | null = null;
  private mark = -1;
  private step = 0;
  private baseSpeed = 1.4;
  /** What acts want this frame: turned about to face away (degrees), crouched (metres). */
  private want = { yaw: 0, low: 0 };
  private turning = new Spring(1.6, 0.8);
  private crouching = new Spring(2.5, 0.6);

  constructor(model: Object3D) {
    super(
      {
        name: 'Vix',
        model: 'fox',
        metres: 0.8,
        width: 0.7,
        size: 1,
        feels: {
          default: { f: 2, zeta: 0.6 },
          body: { f: 1.8, zeta: 0.6 },
          head: { f: 2, zeta: 0.55, r: 0.3 },
          jaw: { f: 5, zeta: 0.6 },
          'ear.L': { f: 4.5, zeta: 0.3 },
          'ear.R': { f: 4.5, zeta: 0.3 },
          'tail.1': { f: 2, zeta: 0.5 },
          'tail.2': { f: 2.4, zeta: 0.45 },
          'tail.3': { f: 2.8, zeta: 0.4 },
          'tail.4': { f: 3.2, zeta: 0.35 },
          'leg.FL': { f: 3.5, zeta: 0.6 },
          'leg.FR': { f: 3.5, zeta: 0.6 },
          'leg.BL': { f: 3.5, zeta: 0.6 },
          'leg.BR': { f: 3.5, zeta: 0.6 },
        },
        face: FOX_FACE,
        eyes: 0.68,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.9 },
          { bone: 'body', yaw: 0.2, pitch: 0 },
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
    this.baseSpeed = this.spec.speed ?? 1.4;
    this.acts = {
      ...this.commonActs(),
      ...this.moves(),
      ...this.tricks(),
      ...this.fidgets(),
      ...this.extras(),
    };
  }

  /** The crewmates on her floor she could stalk, wave at or dodge. */
  private mates() {
    return (this.env?.crew ?? []).filter(
      (o) => o !== this && o.state === 'here' && o.edge === this.edge && !o.free,
    );
  }

  private moves(): Record<string, Act> {
    const still = () => !this.walking;
    const standing = () => this.posture === 'stand' && still();
    return {
      pounce: {
        weight: 1.2,
        length: [P.end, P.end],
        when: () => standing() && this.room() > 0,
        start: () => {
          this.way = this.room();
          this.goal = null;
        },
      },
      listen: {
        weight: 1.2,
        length: [3, 5],
        when: () => this.posture !== 'lie' && still(),
        pose: (t) => this.listening(t),
      },
      yawn: {
        weight: 0.8,
        length: [2.6, 3],
        when: still,
        pose: (t) => {
          // Head back, jaw wide, ears back; then a smack of the lips.
          const open = ease(t, 0.3, 0.9) * (1 - ease(t, 1.8, 2.3));
          this.puppet.add('head', -26 * open, 0, 6 * open);
          this.puppet.add('jaw', 55 * open + 8 * Math.max(0, sin(t, 3)) * ease(t, 2.3, 2.4));
          this.puppet.add('ear.L', -20 * open, 0, -15 * open);
          this.puppet.add('ear.R', -20 * open, 0, 15 * open);
        },
      },
      play: {
        weight: 0.7,
        length: [2.5, 3.5],
        when: standing,
        start: () => (this.hops = 0),
        pose: (t) => {
          // A play bow, bouncing on her front paws.
          this.bow();
          this.hopTo(Math.floor(t * 1.8 + 0.5), 0.5);
        },
      },
      // Reactions
      love: {
        weight: 0,
        length: [2.5, 3.5],
        // Leaning into the mouse, rubbing her head against it.
        pose: (t) => this.puppet.add('head', -6, 0, 12 * sin(t, 0.7)),
      },
      dizzy: {
        weight: 0,
        length: [3.6, 4],
        face: 'dizzy',
        start: () => (this.posture = 'stand'),
      },
    };
  }

  /** Moving about the box: the tricks that use its floor and its walls. */
  private tricks(): Record<string, Act> {
    const p = this.puppet;
    const still = () => !this.walking;
    const standing = () => this.posture === 'stand' && still();
    const middle = () => {
      const f = this.frame;
      return f ? (f.left + f.right) / 2 : this.s;
    };
    /** Along the floor toward the middle, or the other way with `back`. */
    const across = (metres: number, back = false) =>
      this.s + (this.s < middle() !== back ? 1 : -1) * metres * this.px;
    return {
      sneak: {
        // Low and dark along the back wall, one slow paw at a time.
        weight: 0.9,
        length: [6, 7],
        when: standing,
        start: () => this.walkTo(across(1.8 + Math.random()), 0.94),
        pose: (t) => {
          const k = ease(t, 0.3, 1);
          this.want.low = 0.05 * k;
          p.add('head', 20 * k);
          p.add('ear.L', -28 * k, 0, 8 * k);
          p.add('ear.R', -28 * k, 0, -8 * k);
          p.add('tail.1', -14 * k);
          this.expression = 'focused';
        },
      },
      stalk: {
        // Creeps up on a crewmate, wiggles, taps them with a pounce that never lands, and bolts.
        weight: 0.9,
        length: [9, 9],
        when: () => standing() && this.mates().length > 0,
        start: () => {
          const all = this.mates();
          this.prey = all[Math.floor(Math.random() * all.length)] ?? null;
          this.step = 0;
        },
        pose: (t) => {
          const prey = this.prey;
          const f = this.frame;
          if (!prey || !f || prey.state !== 'here') return;
          const creep = t < 4.6;
          const near = this.spaceTo(prey, f);
          const k = ease(t, 0.3, 0.9) * (1 - ease(t, 6.6, 7.2));
          this.want.low = 0.05 * k;
          p.add('head', 16 * k);
          p.add('ear.L', -22 * k);
          p.add('ear.R', -22 * k);
          if (creep) {
            // A little way off it, at the edge of its room.
            if (this.step % 20 === 0) {
              const gap = (this.footprint(f).x + prey.footprint(f).x) * 1.25 + f.bot * 0.15;
              this.walkTo(prey.s + (this.s < prey.s ? -gap : gap), prey.depth);
            }
            this.step++;
            this.expression = 'focused';
          } else if (t < 6.2) {
            // Freeze, bottom in the air, wiggling.
            this.goal = null;
            p.add('body', 10 * k);
            p.add('leg.BL', -6 * k);
            p.add('leg.BR', -6 * k);
            p.add('root', 0, 0, 5 * sin(t, 3.2));
            p.add('tail.1', 10 * k, 22 * sin(t, 3.2));
            this.expression = 'focused';
          } else if (t < 6.4) {
            if (this.step < 900) {
              this.step = 900;
              this.hop.kick(1.5);
            }
            p.add('leg.FL', -70);
            p.add('leg.FR', -70);
            this.expression = 'happy';
          } else {
            // Bolts off, delighted with herself.
            if (this.step < 901) {
              this.step = 901;
              this.spec.speed = this.baseSpeed * 2.4;
              const away = prey.s < this.s ? 1 : -1;
              this.walkTo(this.s + away * this.heightPx * 3, Math.random() < 0.5 ? 0.9 : 0.05);
            }
            this.expression = 'happy';
          }
          if (near.n > 9) this.step = Math.max(this.step, 0);
        },
      },
      peek: {
        // To the back wall, up on her hind legs with her paws on it, then a look back at us.
        weight: 0.7,
        length: [10, 10],
        when: standing,
        start: () => {
          this.mark = -1;
          this.walkTo(across(0.6, Math.random() < 0.5), 0.96);
        },
        pose: (t) => {
          if (this.mark < 0 && t > 0.6 && !this.walking) this.mark = t;
          if (this.mark < 0) return;
          const u = t - this.mark;
          const face = ease(u, 0, 0.7) * (1 - ease(u, 6.3, 7));
          const rear = ease(u, 0.6, 1.3) * (1 - ease(u, 5.6, 6.3));
          const back = ease(u, 4.2, 4.8) * (1 - ease(u, 5.6, 5.9));
          this.want.yaw = 180 * face;
          p.add('body', -38 * rear);
          p.add('leg.BL', 38 * rear);
          p.add('leg.BR', 38 * rear);
          p.add('leg.FL', -80 * rear);
          p.add('leg.FR', -80 * rear);
          p.add('head', -22 * rear + 10 * (1 - rear) * face);
          p.add('head', 0, 30 * sin(u, 0.3) * rear * (1 - back) + 110 * back);
          p.add('ear.L', 14 * rear);
          p.add('ear.R', 14 * rear);
          this.expression = back > 0.5 ? 'happy' : 'neutral';
        },
      },
      lookOver: {
        // To the front lip, to look over it and down at the frame line.
        weight: 0.7,
        length: [7, 7],
        when: standing,
        start: () => {
          this.mark = -1;
          this.walkTo(across(0.5, Math.random() < 0.5), 0);
        },
        pose: (t) => {
          if (this.mark < 0 && t > 0.6 && !this.walking) this.mark = t;
          if (this.mark < 0) return;
          const u = t - this.mark;
          const k = span(u, 0, 0.8, 5, 5.8);
          p.add('body', 12 * k);
          p.add('leg.FL', -22 * k);
          p.add('leg.FR', -22 * k);
          p.add('head', 34 * k + 6 * sin(u, 0.8) * k, 22 * sin(u, 0.35) * k);
          p.add('ear.L', 16 * k);
          p.add('ear.R', 16 * k);
          p.add('tail.1', 25 * k);
          this.expression = sin(u, 0.35) > 0.6 ? 'surprised' : 'happy';
        },
      },
      zoomies: {
        // Races about the whole floor, in and out of the box, for the joy of it.
        weight: 0.6,
        length: [6, 6],
        when: standing,
        start: () => (this.step = -1),
        pose: (t) => {
          const f = this.frame;
          const beat = Math.floor(t / 1.2);
          if (f && beat !== this.step && t < 5) {
            this.step = beat;
            const [lo, hi] = this.span(f);
            this.walkTo(lo + (hi - lo) * (0.1 + 0.8 * Math.random()), Math.random());
          }
          p.add('ear.L', -30);
          p.add('ear.R', -30);
          p.add('body', 4 * sin(t, 2));
          this.expression = 'happy';
        },
      },
      prance: {
        // High-stepping, head up, tail flying: a fox who knows she looks good.
        weight: 0.8,
        length: [4.6, 4.6],
        when: standing,
        start: () =>
          this.walkTo(
            across(2.2 + Math.random() * 1.5, Math.random() < 0.5),
            0.1 + Math.random() * 0.4,
          ),
        pose: (t) => {
          const k = ease(t, 0, 0.4);
          if (this.walking) trot(p, this.gait, 1, 22);
          p.add('head', -10 * k);
          p.add('ear.L', 14 * k);
          p.add('ear.R', 14 * k);
          p.add('tail.1', 30 * k);
          p.add('body', 2 * sin(this.gait / (2 * Math.PI), 2) * k);
          this.expression = 'happy';
        },
      },
      sniff: {
        // Nose down, zigzagging over the floor after a scent.
        weight: 1,
        length: [5.5, 5.5],
        when: standing,
        start: () => {
          this.step = 0;
          this.walkTo(across(1 + Math.random(), Math.random() < 0.5), Math.random() * 0.6);
        },
        pose: (t) => {
          const k = ease(t, 0, 0.5);
          if (t > 2.6 && this.step === 0) {
            this.step = 1;
            this.walkTo(across(1 + Math.random(), Math.random() < 0.5), Math.random() * 0.6);
          }
          p.add('body', 6 * k);
          p.add('head', 36 * k + 5 * sin(t, 5) * k);
          p.add('ear.L', -6 * k);
          p.add('ear.R', -6 * k);
          p.add('tail.1', 14 * k);
          this.expression = 'neutral';
        },
      },
    };
  }

  /** Small things: what she does with her paws, ears, tail, voice and lights on the spot. */
  private fidgets(): Record<string, Act> {
    const p = this.puppet;
    const still = () => !this.walking;
    const standing = () => this.posture === 'stand' && still();
    const sits = () => {
      this.posture = 'sit';
    };
    return {
      tailChase: {
        // Spins after her own tail, round and round, then staggers.
        weight: 0.7,
        length: [5, 5],
        when: standing,
        start: () => {
          this.goal = null;
          this.way = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          const k = span(t, 0.3, 0.9, 4.1, 4.8);
          const w = this.way;
          const run = sin(t, 3.2) * 32 * k;
          p.add('leg.FL', run);
          p.add('leg.BR', run);
          p.add('leg.FR', -run);
          p.add('leg.BL', -run);
          p.add('head', 16 * k, 55 * w * k);
          p.add('body', 0, 22 * w * k);
          p.add('tail.1', 0, -55 * w * k);
          for (const bone of TAIL.slice(1)) p.add(bone, 0, -22 * w * k);
          p.add('ear.L', -18 * k);
          p.add('ear.R', -18 * k);
          this.want.yaw = w * 1080 * ease(t, 0.5, 4.3);
          // Dizzy at the end, for a moment.
          this.expression = t > 4.3 ? 'dizzy' : 'happy';
        },
      },
      tailSweep: {
        // Sitting, sweeping the floor behind her with her tail, looking back to check.
        weight: 0.7,
        length: [4.6, 4.6],
        when: still,
        start: sits,
        pose: (t) => {
          const k = span(t, 0.3, 0.8, 3.9, 4.5);
          const swing = sin(t, 0.5) * 55 * k;
          p.add('tail.1', -38 * k, swing);
          for (const bone of TAIL.slice(1)) p.add(bone, 0, swing * 0.35);
          p.add('head', 6 * k, -swing * 0.6);
          this.expression = 'happy';
        },
      },
      signal: {
        // Tail up like a flag, swept left and right, right, up, with its lights following.
        weight: 0.7,
        length: [5.4, 5.4],
        when: still,
        pose: (t) => {
          const k = span(t, 0.2, 0.9, 4.6, 5.2);
          const flag = [-1, 1, 1, -1, 0][clamp(Math.floor((t - 0.9) / 0.85), 0, 4)];
          p.add('tail.1', 62 * k, 40 * flag * k);
          for (const bone of TAIL.slice(1)) p.add(bone, 4 * k, 12 * flag * k);
          p.add('head', -6 * k, 0, -10 * flag * k);
          this.expression = 'focused';
        },
      },
      beacon: {
        // Sitting proud, tail straight up, a wave of light climbing it; head sweeping like a lamp.
        weight: 0.7,
        length: [5.4, 5.4],
        when: still,
        start: sits,
        pose: (t) => {
          const k = span(t, 0.3, 1, 4.6, 5.2);
          p.add('tail.1', 82 * k, 12 * sin(t, 0.4) * k);
          p.add('head', -6 * k, 40 * sin(t, 0.22) * k);
          p.add('ear.L', 12 * k);
          p.add('ear.R', 12 * k);
          this.expression = 'neutral';
        },
      },
      pawPat: {
        // A paw pat-pat at something on the floor, head low, tail tip quivering.
        weight: 0.9,
        length: [3.8, 3.8],
        when: standing,
        pose: (t) => {
          const k = span(t, 0.2, 0.7, 3.2, 3.8);
          p.add('head', 26 * k);
          p.add('body', 8 * k);
          p.add('leg.FL', (-40 - 26 * sin(t, 2.4)) * k);
          p.add('ear.L', 16 * k);
          p.add('ear.R', 16 * k);
          p.add('tail.4', 0, 16 * sin(t, 3.2) * k);
          this.expression = 'focused';
        },
      },
      dig: {
        // Front paws scrabbling, rump and tail in the air, then up for a sniff.
        weight: 0.8,
        length: [4.6, 4.6],
        when: standing,
        pose: (t) => {
          const k = span(t, 0.2, 0.7, 3.4, 3.9);
          const s = sin(t, 3.4) * 48 * k;
          p.add('body', 24 * k);
          p.add('leg.FL', -8 * k + s);
          p.add('leg.FR', -8 * k - s);
          p.add('leg.BL', -24 * k);
          p.add('leg.BR', -24 * k);
          p.add('head', 30 * k - 46 * ease(t, 3.9, 4.2) * (1 - ease(t, 4.2, 4.6)));
          p.add('tail.1', 40 * k, 12 * sin(t, 3.4) * k);
          this.expression = t > 3.9 ? 'happy' : 'focused';
        },
      },
      scratch: {
        // Sitting, a hind foot scratching behind one ear.
        weight: 0.8,
        length: [3.6, 3.6],
        when: still,
        start: sits,
        pose: (t) => {
          const k = span(t, 0.3, 0.7, 3, 3.5);
          p.add('leg.BL', (-70 + 24 * sin(t, 6.5)) * k);
          p.add('head', 6 * k, 0, -16 * k);
          p.add('body', 0, 0, 5 * k);
          p.add('ear.L', 20 * sin(t, 6.5) * k, 0, 10 * k);
          this.expression = 'sleepy';
        },
      },
      earRadar: {
        // Ears turning independently like little radar dishes; whisker beads blinking.
        weight: 1,
        length: [4, 4],
        when: still,
        pose: (t) => {
          const k = span(t, 0.2, 0.6, 3.4, 4);
          p.add('ear.L', 10 * k, 60 * sin(t, 0.55) * k);
          p.add('ear.R', 10 * k, -60 * sin(t, 0.55, 0.35) * k);
          p.add('head', 4 * k, 10 * sin(t, 0.2) * k);
          this.expression = 'focused';
        },
      },
      tilt: {
        // "Huh?": the head cocks one way, then the other, ears no longer agreeing.
        weight: 1,
        length: [3.4, 3.4],
        when: () => this.posture !== 'lie' && still(),
        pose: (t) => {
          const k = span(t, 0.1, 0.4, 2.9, 3.4);
          const s = sin(t, 0.6);
          p.add('head', 4 * k, 0, 24 * s * k);
          p.add('ear.L', (s > 0 ? 18 : -22) * k, 0, 8 * k);
          p.add('ear.R', (s > 0 ? -22 : 18) * k, 0, -8 * k);
          p.add('jaw', 6 * Math.max(0, sin(t, 0.6, 0.25)) * k);
          this.expression = Math.abs(s) > 0.9 ? 'surprised' : 'neutral';
        },
      },
      wave: {
        // Sits back a little and waves a front paw.
        weight: 0.9,
        length: [3.4, 3.4],
        when: standing,
        pose: (t) => {
          const k = span(t, 0.2, 0.6, 2.8, 3.3);
          p.add('body', -8 * k);
          p.add('leg.FL', -78 * k, 30 * sin(t, 2.4) * k);
          p.add('head', -4 * k, 0, 10 * k);
          this.expression = 'happy';
        },
      },
      pronk: {
        // Stiff-legged bounds, all four feet together, ears flapping.
        weight: 0.7,
        length: [3.6, 3.6],
        when: standing,
        start: () => (this.hops = 0),
        pose: (t) => {
          const k = span(t, 0, 0.3, 3, 3.5);
          this.hopTo(Math.floor(t * 1.5) + (t > 0.1 ? 1 : 0), 1.5);
          const air = Math.max(0, Math.sin(Math.PI * (((t * 1.5) % 1) * 1.4)));
          p.add('leg.FL', -24 * air * k);
          p.add('leg.FR', -24 * air * k);
          p.add('leg.BL', 24 * air * k);
          p.add('leg.BR', 24 * air * k);
          p.add('ear.L', 16 * air * k, 0, 20 * air * k);
          p.add('ear.R', 16 * air * k, 0, -20 * air * k);
          p.add('tail.1', 30 * air * k);
          this.expression = 'happy';
        },
      },
      takeBow: {
        // Kneels on her front paws, sweeps the tail up in a flourish, winks, rises.
        weight: 0.6,
        length: [4, 4],
        when: standing,
        pose: (t) => {
          const k = span(t, 0.4, 1, 2.8, 3.5);
          p.add('leg.FL', -98 * k);
          p.add('leg.FR', -98 * k);
          p.add('body', 20 * k);
          p.add('head', -8 * k);
          p.add('tail.1', 70 * k, 40 * sin(t, 0.6) * k);
          this.expression = t > 1.2 && t < 2.6 ? 'wink' : 'happy';
        },
      },
      groom: {
        // Sitting, the tail swung round to the front, tidied with little nibbles.
        weight: 0.9,
        length: [5.4, 5.4],
        when: still,
        start: sits,
        pose: (t) => {
          const k = span(t, 0.4, 1, 4.6, 5.2);
          p.add('head', 34 * k, 56 * this.side * k);
          p.add('jaw', 10 * Math.max(0, sin(t, 4.5)) * k);
          p.add('tail.4', 24 * k);
          p.add('body', 6 * k);
          this.expression = 'sleepy';
        },
      },
      howl: {
        // Sitting up, head back, a long "ow-oo" while the tail lights climb.
        weight: 0.6,
        length: [5.6, 5.6],
        when: still,
        start: sits,
        pose: (t) => {
          const k = span(t, 0.5, 1.5, 4.6, 5.3);
          p.add('head', -58 * k, 0, 5 * sin(t, 0.4) * k);
          p.add('jaw', (32 + 8 * sin(t, 0.6)) * k);
          p.add('ear.L', -24 * k);
          p.add('ear.R', -24 * k);
          p.add('body', -8 * k);
          this.expression = 'happy';
        },
      },
      chatter: {
        // "Ring-ding-ding-ding": yips on the beat, a hop with each, then a rapid flap.
        weight: 0.8,
        length: [4.3, 4.3],
        when: standing,
        start: () => (this.hops = 0),
        pose: (t) => {
          const k = span(t, 0, 0.2, 3.6, 4.2);
          const beat = t * 3.5;
          const b = Math.floor(beat);
          const pulse = Math.exp(-(beat % 1) * 5) * k;
          const flap = b % 4 === 3 ? 1 : 0;
          if (!flap) this.hopTo(b + 1, 0.55);
          const jaw = flap ? (Math.sin(t * 50) > 0 ? 34 : 4) * k : 42 * pulse;
          p.add('jaw', jaw);
          p.add('head', flap ? -22 * k : -16 * pulse, 0, 6 * (b % 2 ? 1 : -1) * k);
          p.add(b % 2 ? 'ear.L' : 'ear.R', 22 * pulse, 0, 16 * pulse);
          this.expression = pulse > 0.3 || flap ? 'surprised' : 'happy';
        },
      },
      shakeOff: {
        // A full-body shake from nose to tail.
        weight: 0.6,
        length: [1.9, 1.9],
        when: standing,
        pose: (t) => this.shake(t, 0.1),
      },
      sneeze: {
        // Head back, back... a tiny "achoo" that jolts her, fluffs the tail and flashes the lights.
        weight: 0.5,
        length: [2.6, 2.6],
        when: still,
        start: () => (this.step = 0),
        pose: (t) => {
          const k = ease(t, 0, 0.8);
          if (t < 0.95) {
            p.add('head', -24 * k);
            p.add('ear.L', 10 * k);
            p.add('ear.R', 10 * k);
            this.expression = t > 0.5 ? 'sleepy' : 'neutral';
          } else {
            if (this.step === 0) {
              this.step = 1;
              p.kick('head', 900);
              p.kick('body', 380);
              this.hop.kick(1.1);
              for (const bone of TAIL) p.kick(bone, 0, 300);
            }
            p.add('head', 0, 12 * sin(t, 3) * (1 - ease(t, 1.2, 2.2)));
            this.expression = t < 1.6 ? 'sleepy' : 'cross';
          }
        },
      },
      roll: {
        // Rolls over on her back, all the way round, paws in the air.
        weight: 0.6,
        length: [4.6, 4.6],
        when: () => this.posture !== 'sit' && still(),
        start: () => {
          this.posture = 'lie';
          this.way = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          const k = span(t, 0.7, 1.2, 3.2, 3.6);
          p.add('leg.FL', (30 * sin(t, 2.5) - 20) * k);
          p.add('leg.FR', (-30 * sin(t, 2.5) - 20) * k);
          p.add('leg.BL', 30 * sin(t, 2.5, 0.3) * k);
          p.add('leg.BR', -30 * sin(t, 2.5, 0.3) * k);
          this.expression = 'happy';
        },
      },
    };
  }

  /** Later additions: a circle before lying down, hiding behind her tail, visiting, a victory flag. */
  private extras(): Record<string, Act> {
    const p = this.puppet;
    const still = () => !this.walking;
    const standing = () => this.posture === 'stand' && still();
    return {
      circle: {
        // Trots round in a tight circle, three times, and flops down to sleep.
        weight: 0.6,
        length: [6, 6],
        when: standing,
        start: () => {
          this.goal = null;
          this.way = Math.random() < 0.5 ? -1 : 1;
          this.step = 0;
        },
        pose: (t) => {
          const k = span(t, 0.2, 0.6, 3.6, 4.2);
          const run = sin(t, 2.6) * 30 * k;
          p.add('leg.FL', run);
          p.add('leg.BR', run);
          p.add('leg.FR', -run);
          p.add('leg.BL', -run);
          p.add('head', 10 * k, 30 * this.way * k);
          p.add('body', 0, 12 * this.way * k);
          p.add('tail.1', 0, -30 * this.way * k);
          this.want.yaw = this.way * 1080 * ease(t, 0.4, 3.9);
          if (t > 4.3 && this.step < 1) {
            this.step = 1;
            this.posture = 'lie';
          }
          this.expression = t > 4.3 ? 'sleepy' : 'happy';
        },
      },
      hideTail: {
        // Sitting, she pulls her tail up over her face to hide, then peeks out over it.
        weight: 0.6,
        length: [6, 6],
        when: still,
        start: () => (this.posture = 'sit'),
        pose: (t) => {
          const k = span(t, 0.3, 1.2, 4.6, 5.4);
          const peek = ease(t, 2.4, 3) * (1 - ease(t, 3.6, 4.2));
          const s = this.side;
          p.add('tail.1', 70 * k, -30 * s * k);
          p.add('tail.2', 35 * k, -25 * s * k);
          p.add('tail.3', 25 * k, -20 * s * k);
          p.add('tail.4', 20 * k, -10 * s * k);
          p.add('head', 8 * k - 12 * peek, -20 * s * peek);
          p.add('ear.L', -10 * k);
          p.add('ear.R', -10 * k);
          this.expression = peek > 0.5 ? 'wink' : 'sleepy';
        },
      },
      visit: {
        // Trots up to a crewmate and sniffs at them, tail wagging, then trots off.
        weight: 0.7,
        length: [7, 7],
        when: () => standing() && this.mates().length > 0,
        start: () => {
          const all = this.mates();
          this.prey = all[Math.floor(Math.random() * all.length)] ?? null;
          this.step = 0;
        },
        pose: (t) => {
          const prey = this.prey;
          const f = this.frame;
          if (!prey || !f || prey.state !== 'here') return;
          if (t < 3.6 && this.step % 20 === 0) {
            const gap = (this.footprint(f).x + prey.footprint(f).x) * 1.2 + f.bot * 0.1;
            this.walkTo(prey.s + (this.s < prey.s ? -gap : gap), prey.depth);
          }
          this.step++;
          if (this.walking) trot(p, this.gait, 1, 18);
          const k = span(t, 3.4, 4, 6, 6.6);
          p.add('head', 18 * k + 8 * sin(t, 3) * k);
          p.add('body', 6 * k);
          p.add('ear.L', 10 * k);
          p.add('ear.R', 10 * k);
          p.add('tail.1', 20 * k);
          this.expression = 'happy';
        },
      },
      victory: {
        // Springs up with her tail up like a flag, tip flashing, and bounces twice.
        weight: 0.5,
        length: [4, 4],
        when: standing,
        start: () => (this.hops = 0),
        pose: (t) => {
          const k = span(t, 0.2, 0.6, 3.2, 3.8);
          p.add('tail.1', 80 * k, 14 * sin(t, 1.2) * k);
          p.add('head', -14 * k);
          p.add('leg.FL', -35 * k);
          p.add('leg.FR', -35 * k);
          p.add('ear.L', 16 * k);
          p.add('ear.R', 16 * k);
          if (t > 0.4) this.hopTo(1 + Math.floor((t - 0.4) / 0.7), 0.8);
          this.expression = 'happy';
        },
      },
    };
  }

  /** Which way a pounce can go (toward the middle, +1 right, -1 left), or 0 if no room. */
  private room() {
    const f = this.frame;
    if (!f) return 0;
    const way = this.s < (f.left + f.right) / 2 ? 1 : -1;
    const [lo, hi] = this.span(f);
    const space = way > 0 ? hi - this.s : this.s - lo;
    if (space <= (LEAP.far * 1.2 + this.spec.width) * this.px) return 0;
    // Nobody standing in her way (she'd land in their room).
    const reach = (LEAP.far * 1.2 + this.spec.width) * this.px;
    const blocked = this.mates().some((o) => {
      const along = (o.s - this.s) * way;
      return along > -this.px * 0.3 && along < reach && Math.abs(o.depth - this.depth) < 0.4;
    });
    return blocked ? 0 : way;
  }

  /** Hop until `count` hops have been done this act. */
  private hopTo(count: number, strength: number) {
    for (; this.hops < count; this.hops++) this.hop.kick(strength);
  }

  /** Head cocked one way and the other, ears turning in turn, like a dish. */
  private listening(t: number) {
    const p = this.puppet;
    const tilts = [14, -10, 16, -6, 10];
    const tilt = tilts[Math.floor(t / 0.8) % tilts.length];
    p.add('head', 14, 0, tilt);
    p.add('ear.L', 8, 30 * sin(t, 0.6), 0);
    p.add('ear.R', 8, 30 * sin(t, 0.6, 0.35), 0);
  }

  /** A shake from nose to tail: head, ears, body and tail, dying away. */
  private shake(t: number, from: number) {
    const p = this.puppet;
    const k = Math.max(0, t - from);
    const shake = Math.sin(k * 2 * Math.PI * 5) * Math.exp(-k * 2.5) * (t > from ? 1 : 0);
    p.add('body', 0, 0, 14 * shake);
    p.add('head', 0, 0, -22 * shake);
    p.add('ear.L', 0, 0, 30 * shake);
    p.add('ear.R', 0, 0, 30 * shake);
    TAIL.forEach((bone, i) => p.add(bone, 0, 20 * shake * (i + 1) * 0.5));
    this.expression = 'happy';
  }

  poke() {
    if (this.state !== 'here') return;
    // In mid-leap or nose-down in the snow, she doesn't notice.
    if (this.act === 'pounce' && this.actT > P.wind && this.actT < P.back) return;
    const n = this.poked();
    if (n >= 3) this.setAct('dizzy');
    else if (n === 2 && this.posture !== 'lie') this.setAct('play');
    else this.setAct('startle');
  }

  protected feel(env: Env): Mood {
    // The sneeze fluffs her up just after it.
    if (this.act === 'sneeze' && this.actT > 0.95 && this.actT < 1.7) return 'alarmed';
    return super.feel(env);
  }

  protected pose(dt: number, env: Env) {
    this.frame = env.frame;
    this.env = env;
    const t = this.actT;
    const hunting = this.act === 'pounce' && t < P.back;
    // Hunting she turns side-on to the spot she's after; lying down, nearly so, to show
    // the curl. (The pet turns toward the middle by anatomy.turn.)
    const middle = (env.frame.left + env.frame.right) / 2;
    const toward = Math.sign(middle - this.s) || 1;
    const facing = ['tailChase', 'circle', 'peek', 'lookOver'].includes(this.act);
    this.anatomy.turn = hunting
      ? 88 * this.way * toward
      : facing
        ? 0
        : this.act === 'roll'
          ? 90
          : this.posture === 'lie'
            ? 65
            : FOX.turn;
    this.side = -toward;
    // She watches the spot, not the mouse.
    this.spec.gaze = hunting ? [] : this.gaze;
    // Quick or slow on her feet, by what she's up to.
    const speed: Record<string, number> = {
      sneak: 0.4,
      sniff: 0.55,
      prance: 0.9,
      zoomies: 2.4,
      stalk: 0.55,
      visit: 0.7,
    };
    if (!(this.act === 'stalk' && t > 6.4))
      this.spec.speed = this.baseSpeed * (speed[this.act] ?? 1);

    this.hover = this.hovered ? this.hover + dt : 0;
    if (
      this.hover > 0.8 &&
      ['idle', 'sit', 'listen', 'stand'].includes(this.act) &&
      this.posture !== 'lie'
    )
      this.setAct('love');

    super.pose(dt, env);
    if (this.act === 'pounce') this.pounce(t);
    if (this.act === 'dizzy') this.dizzy(t);
    if (this.act === 'yawn') {
      const open = ease(t, 0.3, 0.9) * (1 - ease(t, 1.8, 2.3));
      this.expression = open > 0.3 ? 'happy' : 'sleepy';
    }
    // Sitting, her tail lifts its tip and taps now and then.
    if (this.posture === 'sit' && this.act === 'idle')
      this.puppet.add('tail.4', 12 * Math.max(0, sin(env.time, 0.3)));
  }

  /** The pounce's joints; the leap and dive themselves are moved directly, in after(). */
  private pounce(t: number) {
    const p = this.puppet;
    if (t < P.leap) {
      // Frozen, listening; at the end, rearing a little to spring.
      this.expression = 'focused';
      if (t > P.listen) this.listening(t - P.listen);
      else p.add('head', 6);
      const rear = ease(t, P.wind, P.leap);
      p.add('body', -12 * rear);
      p.add('leg.BL', 12 * rear);
      p.add('leg.BR', 12 * rear);
      p.add('leg.FL', -30 * rear);
      p.add('leg.FR', -30 * rear);
      for (const bone of TAIL) p.add(bone, 4 * rear);
    } else if (t < P.land) {
      // In the air: front paws tucked, then reaching down; hind legs trailing.
      this.expression = 'focused';
      const u = ease(t, P.leap, P.land);
      p.add('leg.FL', -80 + 50 * u);
      p.add('leg.FR', -75 + 50 * u);
      p.add('leg.BL', 45);
      p.add('leg.BR', 40);
      p.add('head', 10 * u);
      p.add('tail.1', 14);
    } else if (t < P.out) {
      // Nose down in the snow: hind legs kicking, tail up and wiggling.
      this.expression = 'focused';
      const k = t - P.land;
      p.add('leg.BL', 20 + 22 * sin(k, 3.2));
      p.add('leg.BR', 20 - 22 * sin(k, 3.2));
      p.add('tail.1', 30);
      TAIL.forEach((bone, i) => {
        if (i) p.add(bone, 14 * sin(k, 2.6, -i * 0.12), 26 * sin(k, 5, -i * 0.15));
      });
    } else if (t > P.back) {
      // Out again, and a good shake from nose to tail.
      this.shake(t, P.back);
    } else this.expression = 'happy';
  }

  /** Wobbling round in a circle, head the other way, ears flopping out. */
  private dizzy(t: number) {
    const p = this.puppet;
    const k = Math.min(1, t / 0.5) * (1 - ease(t, this.actLength - 0.8, this.actLength));
    p.add('root', 8 * k * sin(t, 0.9), 0, 8 * k * sin(t, 0.9, 0.25));
    p.add('head', 14 * k * sin(t, 0.9, 0.5), 0, 14 * k * sin(t, 0.9, 0.75));
    p.add('ear.L', -10 * k, 0, -30 * k);
    p.add('ear.R', -10 * k, 0, 30 * k);
    p.add('leg.FL', 0, 0, -8 * k);
    p.add('leg.FR', 0, 0, 8 * k);
    for (const bone of TAIL) p.add(bone, -8 * k, 12 * k * sin(t, 0.9, 0.5));
  }

  /** Curled up: head turned back along her side, the tail wrapped round over her nose. */
  protected lying(breath: number) {
    const p = this.puppet;
    const s = this.side;
    p.add('leg.FL', 80);
    p.add('leg.FR', 80);
    p.add('leg.BL', -80);
    p.add('leg.BR', -80);
    p.add('head', 28 + 2 * breath, 55 * s, 10 * s);
  }

  protected tailLying() {
    const p = this.puppet;
    const s = this.side;
    p.add('tail.1', -22, -50 * s);
    p.add('tail.2', 0, -55 * s);
    p.add('tail.3', 0, -50 * s);
    p.add('tail.4', 6 + 3 * sin(this.t, 0.15), -40 * s);
  }

  protected express(_dt: number, env: Env, f: Feeling) {
    const p = this.puppet;
    // The pet swings a tail's upper bones with roll, a sway for an upright tail; hers
    // runs out behind, where roll only twists it, so turn that into a sideways sweep.
    if (this.posture !== 'lie') {
      const [wag] = f.wag ?? [0, 0];
      const deg = wag * (this.walking ? 0.6 : 1);
      TAIL.forEach((bone, i) => {
        if (!i) return;
        const s = Math.sin(this.wagPhase - i * 0.7) * deg * 0.8;
        p.add(bone, 0, s, -s);
      });
    }
    // Sitting, she wraps her tail round her front paws.
    if (this.posture === 'sit' && !this.walking && !TAIL_BUSY.includes(this.act)) {
      const s = this.side;
      p.add('tail.1', -30, -40 * s);
      p.add('tail.2', 10, -45 * s);
      p.add('tail.3', 0, -45 * s);
      p.add('tail.4', 0, -35 * s);
    }
    // Curious: the head tilts.
    if (this.mood === 'curious' && !['pounce', 'tilt', 'listen'].includes(this.act))
      p.add('head', 0, 0, 9 * sin(env.time, 0.1));
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    const t = this.actT;
    this.h = 0;
    if (this.act === 'pounce') {
      const px = this.px;
      if (t < P.leap) {
        this.from = this.s;
        p.turn('root', -30 * ease(t, P.wind, P.leap));
      } else if (t < P.land) {
        // The arc: up and over, tipping from nose-up to nose-down.
        const u = (t - P.leap) / (P.land - P.leap);
        this.s = this.from + this.way * LEAP.far * px * ease(t, P.leap, P.land);
        this.h = (4 * LEAP.high * u * (1 - u) - LEAP.deep * u * u * u) * px;
        p.turn('root', -30 + 98 * ease(t, P.leap, P.land));
      } else if (t < P.out) {
        // In the snow up to her shoulders, wriggling.
        const k = t - P.land;
        this.h = -LEAP.deep * px * (1 + 0.15 * Math.exp(-k * 4) * Math.sin(k * 20));
        p.turn('root', 68 + 3 * sin(k, 2.5), 0, 5 * sin(k, 3));
      } else if (t < P.back) {
        // Popping out backwards and landing on all fours.
        const u = (t - P.out) / (P.back - P.out);
        this.h = (-LEAP.deep * (1 - u) + 0.5 * LEAP.high * 4 * u * (1 - u)) * px;
        this.s = this.from + this.way * (LEAP.far - 0.1 * ease(t, P.out, P.back)) * px;
        p.turn('root', 68 * (1 - ease(t, P.out, P.back)) - 12 * Math.sin(u * Math.PI));
      }
      if (this.face && t < P.land) this.face.look.x = this.face.look.y = 0;
    }
    // Turned about to face the wall, spinning after her tail, or rolling over.
    const turned = this.turning.update(dt, this.want.yaw);
    if (turned) p.turn('root', 0, turned);
    if (this.act === 'roll') p.turn('body', 0, 0, this.way * 360 * ease(t, 1, 3.4));
    // Crouching low: the body sinks and the legs sink into it, so the feet stay put.
    const low = this.crouching.update(dt, this.want.low);
    p.shift('body', 0, -low, 0);
    for (const leg of LEGS) p.shift(leg, 0, low, 0);
    this.want.yaw = this.want.low = 0;
    this.lights(env.time);
  }

  /** The lights: the tail tip (0), the bands round its seams (1-3), the whisker beads (4). */
  private lights(time: number) {
    const t = this.actT;
    const a = this.act;
    const wave = (i: number, hz: number) =>
      0.5 + 0.5 * Math.sin(2 * Math.PI * (time * hz - i * 0.22));
    let tip = 0.55 + 0.1 * Math.sin(time * 0.8);
    // At rest a slow ripple of light runs up the tail now and then.
    const bands = [1, 2, 3].map((i) => 0.12 + 0.35 * Math.max(0, wave(i, 0.25) ** 6));
    let bead = 0.25 + 0.2 * Math.max(0, Math.sin(time * 0.9));
    let tone: string | undefined;
    const rainbow = (rate: number) => RAINBOW[Math.floor(time * rate) % RAINBOW.length];
    if (a === 'pounce' && t < P.back) {
      if (t < P.wind)
        tip = 1 - ease(t, 0.2, 1.2); // lights out, sneaking up
      else if (t < P.leap) {
        tip = ease(t, P.wind, P.leap);
        tone = BEACON.focused;
      } else if (t < P.land) tip = 1;
      else {
        tip = Math.sin(time * 24) > -0.3 ? 1 : 0.3;
        tone = rainbow(8);
      }
      for (let i = 0; i < 3; i++) bands[i] = t < P.wind ? 0 : tip;
      bead = t < P.wind ? 0 : 1;
    } else if (a === 'sneak' || a === 'stalk') {
      // Everything off but the beads' faint glint.
      tip = 0.03;
      bands.fill(0);
      bead = 0.08;
      if (a === 'stalk' && t > 6.2) {
        tip = 1;
        tone = rainbow(9);
        bands.fill(1);
      }
    } else if (a === 'dizzy' || a === 'tailChase') {
      tip = 1;
      tone = rainbow(5);
      bands.forEach((_, i) => (bands[i] = wave(i, 3)));
    } else if (a === 'beacon') {
      tip = wave(4, 1.4);
      bands.forEach((_, i) => (bands[i] = wave(3 - i, 1.4)));
      tone = BEACON.happy;
      bead = 0.7;
    } else if (a === 'signal') {
      const stage = clamp(Math.floor((t - 0.9) / 0.85), 0, 4);
      tip = stage % 2 ? 1 : 0.2;
      bands.forEach((_, i) => (bands[i] = (stage + i) % 2 ? 1 : 0.15));
      tone = BEACON.focused;
    } else if (a === 'howl') {
      // A note rising: one band after another, then the tip.
      const u = clamp((t - 0.6) / 3.6, 0, 1.2);
      bands.forEach((_, i) => (bands[i] = clamp(u * 4 - i, 0, 1)));
      tip = clamp(u * 4 - 3, 0.1, 1);
      tone = BEACON.happy;
    } else if (a === 'chatter') {
      const beat = Math.floor(t * 3.5);
      tip = Math.sin(time * 26) > 0 ? 1 : 0.2;
      bands.forEach((_, i) => (bands[i] = (beat + i) % 2 ? 1 : 0.1));
      tone = rainbow(7);
      bead = 1;
    } else if (a === 'earRadar') {
      bead = Math.sin(time * 6) > 0 ? 1 : 0.1;
      tone = BEACON.focused;
    } else if (
      a === 'zoomies' ||
      a === 'prance' ||
      a === 'takeBow' ||
      a === 'pronk' ||
      a === 'victory'
    ) {
      tip = 0.9;
      bands.forEach((_, i) => (bands[i] = wave(i, 2.5)));
      tone = a === 'zoomies' ? rainbow(6) : BEACON.happy;
      bead = 0.8;
    } else if (a === 'sneeze') {
      const flash = t > 0.95 && t < 1.4;
      tip = flash ? 1 : 0.4;
      bands.fill(flash ? 1 : 0.1);
      tone = BEACON.surprised;
    } else if (a === 'groom') {
      tip = 0.5 + 0.5 * Math.max(0, Math.sin(time * 7));
      bands.forEach((_, i) => (bands[i] = 0.3 + 0.3 * Math.sin(time * 5 + i)));
    } else if (this.mood === 'asleep') {
      tip = 0.1 + 0.25 * (0.5 + 0.5 * Math.sin(time * 1.1));
      bands.fill(tip * 0.4);
      bead = 0;
    } else if (this.mood === 'love') {
      tip = 0.7 + 0.3 * Math.sin(time * 5);
      bands.fill(tip * 0.8);
      tone = BEACON.love;
    } else if (this.mood === 'happy') {
      tip = 0.85 + 0.15 * Math.sin(time * 3);
      tone = BEACON.happy;
    } else if (this.mood === 'alarmed') {
      tip = Math.sin(time * 30) > 0 ? 1 : 0.4;
      bands.fill(tip);
      tone = BEACON.surprised;
      bead = 1;
    } else if (this.mood === 'curious') tip = 0.9;
    else if (this.mood === 'sleepy') tip = 0.3;
    else if (this.walking) tip = 0.8;
    this.outfit.dot(0, clamp(tip, 0, 1), tone);
    bands.forEach((level, i) => this.outfit.dot(i + 1, clamp(level, 0, 1), tone));
    this.outfit.dot(4, clamp(bead, 0, 1), tone);
  }

  protected onLeave() {
    super.onLeave();
    this.h = 0;
  }
}
