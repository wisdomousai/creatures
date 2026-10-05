import type { Object3D } from 'three';
import { BEACON } from './bolt';
import { type Act, type Character, clamp, type Env, type Frame } from './character';
import type { Expression, FaceLayout } from './face';
import type { FlameStyle, LookName } from './looks';
import { sin } from './moves';
import { type Anatomy, type Feeling, type Mood, Pet } from './pet';
import { Spring } from './spring';

/**
 * Bun, the robot British shorthair: a teddy-bear cat toy with a big round head wider than
 * tall, HUGE round eyes (the screen is nearly all eyes, copper in the colour look, the
 * pupils wide and round and swelling in the dark), chubby cheek pods with little lights,
 * small round ears, a short thick neck, a cobby body quilted over the back, thick short
 * legs and a short thick tail. She is calm, dignified and a bit aloof: she strolls
 * slowly, sits like a statue with her tail round her paws, gives slow blinks, loafs.
 * Then, out of nowhere, she is goofy: she stares at nothing and is startled by it,
 * sprints three steps and pretends she didn't, stares wide-eyed into your soul.
 *
 * Her tail says how she feels by how high she carries it. Her tag (the beacon) takes the
 * mood's colour and her cheek lights glow when she purrs. Poke her and she startles or
 * purrs; three quick pokes and she's dizzy. Rest the mouse on her and she leans into it,
 * purring, the cheek lights rising. Her repertoire: slow blink, loaf, statue sit, stroll,
 * stare-and-startle, the wide-eyed stare, head bumps on the front lip, kneading, sploot,
 * grooming, yawns, tail wrap, slow roll onto her back, a double take at a crewmate,
 * peering over the front lip, sitting at the back wall watching, nodding off, bird
 * watching, paw pats, sprint-and-pretend, ear radar, head tilts, scratching, circling,
 * a settling meatloaf, a judging stare at a crewmate ending in a slow blink, a slow-motion
 * swat at the glass, sitting and toppling over, chirp-chattering at a bird, a deep
 * dignified bow-stretch.
 */
export const SHORTHAIR_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.275, 0.46],
    [0.725, 0.46],
  ],
  rx: 0.17,
  ry: 0.27,
  line: 0.036,
  mouth: [0.5, 0.87],
  kind: 'cat',
  pupil: 0.6,
};

const TAIL = ['tail.1', 'tail.2', 'tail.3'];
const LEGS = ['leg.FL', 'leg.FR', 'leg.BL', 'leg.BR'];

const SHORTHAIR: Anatomy = {
  tail: TAIL,
  tailAxis: [0, 0.3, -1],
  earsHang: false,
  moods: {
    calm: {
      face: 'neutral',
      carriage: -40,
      bob: [4, 0.2],
      hook: 10,
      flicks: 0.08,
      ears: 0,
      out: 0,
      swivel: 0.3,
    },
    curious: {
      face: 'neutral',
      carriage: -8,
      hook: 30,
      flicks: 0.8,
      ears: 12,
      out: -4,
      swivel: 0.9,
    },
    happy: { face: 'happy', carriage: 8, hook: 25, ears: 10, out: -4, swivel: 0.3 },
    love: { face: 'love', carriage: 8, hook: 20, quiver: 1, ears: 8, out: -6, swivel: 0 },
    alarmed: { face: 'surprised', carriage: 6, hook: -30, puff: 1, ears: -18, out: 12, swivel: 0 },
    annoyed: {
      face: 'cross',
      carriage: -60,
      bob: [14, 1.3],
      hook: -10,
      flicks: 0.6,
      ears: -22,
      out: 50,
      swivel: 0,
    },
    sad: { face: 'sad', carriage: -80, ears: -12, out: 26, swivel: 0 },
    sleepy: {
      face: 'sleepy',
      carriage: -70,
      bob: [3, 0.12],
      hook: 5,
      ears: -4,
      out: 16,
      swivel: 0.1,
    },
    asleep: { face: 'asleep', carriage: -70, flicks: 0.15, ears: -4, out: 12, swivel: 0.3 },
  },
  actMoods: {
    purr: 'love',
    love: 'love',
    startle: 'alarmed',
    doubleTake: 'curious',
    peekOut: 'curious',
    birdWatch: 'curious',
    pawPat: 'curious',
    earRadar: 'curious',
    tilt: 'curious',
    headBump: 'happy',
    knead: 'love',
    slowRoll: 'happy',
    sprint: 'happy',
    stretch: 'sleepy',
    yawn: 'sleepy',
    nap: 'asleep',
    nodOff: 'sleepy',
    sploot: 'sleepy',
    groom: 'happy',
    scratch: 'calm',
    meatloaf: 'sleepy',
    judge: 'calm',
    slowSwat: 'curious',
    topple: 'calm',
    chirp: 'curious',
    bowStretch: 'sleepy',
  } satisfies Record<string, Mood>,
  lying: 'calm',
  hover: 'happy',
  drop: { stand: 0, sit: -0.07, lie: -0.08 },
  sit: -20,
  turn: 45,
};

/** 0 before a, 1 after b, eased between. */
const ease = (t: number, a: number, b: number) => {
  const u = clamp((t - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
};
/** Fades in over a..b, holds, fades out over c..d. */
const span = (t: number, a: number, b: number, c: number, d: number) =>
  ease(t, a, b) * (1 - ease(t, c, d));

export class Shorthair extends Pet {
  static readonly terms =
    'kitty british blue grey gray slate silver copper orange teddy plush round chubby cheeks big eyes calm chunky stroll loaf';

  protected readonly anatomy: Anatomy = { ...SHORTHAIR, drop: { ...SHORTHAIR.drop } };
  private gaze = this.spec.gaze;
  private frame: Frame | null = null;
  private env: Env | null = null;
  private baseSpeed = 1;
  /** Which side she curls to (+1 her left: the side facing you), and steps within an act. */
  private side = 1;
  private mark = -1;
  private step = 0;
  private hover = 0;
  /** The face an act wants (the mood's own is used when it wants none). */
  private show: Expression | undefined;
  private prey: Character | null = null;
  /** What acts want this frame: turned about (degrees), crouched (metres), rolled (degrees). */
  private want = { yaw: 0, low: 0, roll: 0 };
  private turning = new Spring(1.6, 0.8);
  private crouching = new Spring(2.5, 0.6);
  private rolling = new Spring(1.4, 0.75);
  private glow = new Spring(2, 0.9);

  constructor(model: Object3D) {
    super(
      {
        name: 'Bun',
        model: 'shorthair',
        metres: 0.66,
        width: 0.6,
        size: 1,
        feels: {
          default: { f: 2, zeta: 0.6 },
          body: { f: 1.6, zeta: 0.7 },
          head: { f: 1.6, zeta: 0.6, r: 0.3 },
          'ear.L': { f: 4.5, zeta: 0.3 },
          'ear.R': { f: 4.5, zeta: 0.3 },
          'tail.1': { f: 1.3, zeta: 0.5 },
          'tail.2': { f: 1.6, zeta: 0.4 },
          'tail.3': { f: 2.2, zeta: 0.3 },
          'leg.FL': { f: 3, zeta: 0.6 },
          'leg.FR': { f: 3, zeta: 0.6 },
          'leg.BL': { f: 3, zeta: 0.6 },
          'leg.BR': { f: 3, zeta: 0.6 },
        },
        face: SHORTHAIR_FACE,
        eyes: 0.63,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.9 },
          { bone: 'body', yaw: 0.2, pitch: 0 },
        ],
        reach: { yaw: 60, pitch: 30 },
        lag: 0.8,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 1,
      },
      model,
    );
    this.baseSpeed = this.spec.speed ?? 1;
    this.acts = {
      ...this.commonActs(),
      ...this.calm(),
      ...this.goofy(),
      ...this.boxed(),
      ...this.reactions(),
    };
  }

  /** Birds anywhere in the box (flying or not): she has opinions about them. */
  private birds() {
    const kinds = ['owl', 'macaw', 'raven', 'swan', 'duck', 'penguin'];
    return (this.env?.crew ?? []).filter(
      (o) => o !== this && o.state === 'here' && kinds.includes(o.spec.model),
    );
  }

  /** The crewmates on her floor she could look at. */
  private mates() {
    return (this.env?.crew ?? []).filter(
      (o) => o !== this && o.state === 'here' && o.edge === this.edge && !o.free,
    );
  }

  private middle() {
    const f = this.frame;
    return f ? (f.left + f.right) / 2 : this.s;
  }

  /** Along the floor toward the middle, or the other way with `back`. */
  private across(metres: number, back = false) {
    return this.s + (this.s < this.middle() !== back ? 1 : -1) * metres * this.px;
  }

  /** Slow, dignified things: how she sits, blinks, loafs and washes. */
  private calm(): Record<string, Act> {
    const p = this.puppet;
    const still = () => !this.walking;
    const standing = () => this.posture === 'stand' && still();
    const sits = () => {
      this.posture = 'sit';
    };
    return {
      slowBlink: {
        // The slow blink: the eyes narrow to happy arcs, hold, and open again. A cat's "I like you".
        weight: 1.6,
        length: [3.4, 3.4],
        when: () => this.posture !== 'lie' && still(),
        pose: (t) => {
          const k = span(t, 0.4, 1.2, 2, 2.8);
          p.add('head', 4 * k, 0, 0);
          this.show = k > 0.8 ? 'happy' : k > 0.15 ? 'sleepy' : 'neutral';
        },
      },
      loaf: {
        // Tucked in like a loaf of bread, head up, paws and tail hidden, blinking slowly.
        weight: 1.6,
        length: [9, 15],
        when: still,
        start: () => (this.posture = 'lie'),
        pose: (t) => {
          p.add('head', -14);
          p.add('tail.1', 0, 25 * this.side);
          this.show = sin(t, 0.12) > 0.85 ? 'happy' : 'neutral';
        },
      },
      statue: {
        // Sits bolt upright, chin up, tail wrapped round her paws; looks at nothing in particular.
        weight: 1.8,
        length: [7, 11],
        when: still,
        start: sits,
        pose: (t) => {
          const k = ease(t, 0.3, 1.2);
          p.add('body', -8 * k);
          p.add('leg.FL', 8 * k);
          p.add('leg.FR', 8 * k);
          p.add('head', -8 * k);
          p.add('ear.L', 6 * k);
          p.add('ear.R', 6 * k);
          this.show = 'neutral';
        },
      },
      meatloaf: {
        // The proper meatloaf: she settles slowly onto her belly until her paws vanish under her
        // chest, tail tucked beneath, eyes going to slits, ears flattening like wings.
        weight: 1.2,
        length: [11, 16],
        when: still,
        start: () => (this.posture = 'lie'),
        pose: (t) => {
          const k = ease(t, 0.4, 3.4);
          this.want.low = 0.03 * k;
          p.add('leg.FL', 30 * k);
          p.add('leg.FR', 30 * k);
          p.add('leg.BL', -30 * k);
          p.add('leg.BR', -30 * k);
          p.add('head', -8 * k + 3 * sin(t, 0.2));
          p.add('body', 3 * k);
          p.add('ear.L', -6 * k, 0, -14 * k);
          p.add('ear.R', -6 * k, 0, 14 * k);
          p.add('tail.1', 0, 40 * this.side * k);
          p.add('tail.3', 0, 0, 24 * this.side * k);
          this.show = sin(t, 0.14) > 0.8 ? 'happy' : k > 0.6 ? 'sleepy' : 'neutral';
        },
      },
      judge: {
        // A long, half-lidded, judging stare at a crewmate, ended by a slow blink that says
        // "you are tolerated", and she looks away as if it never happened.
        weight: 1.2,
        length: [8, 8],
        when: () => this.posture !== 'lie' && still() && this.mates().length > 0,
        start: () => {
          const all = this.mates();
          this.prey = all[Math.floor(Math.random() * all.length)] ?? null;
        },
        pose: (t) => {
          const prey = this.prey;
          if (!prey || prey.state !== 'here') return;
          const way = Math.sign(prey.s - this.s) || 1;
          const at = span(t, 0.3, 1.2, 6, 6.9);
          p.add('head', -5 * at, 42 * way * at);
          p.add('body', 0, 6 * way * at);
          p.add('ear.L', -6 * at, 0, -8 * at);
          p.add('ear.R', -6 * at, 0, 8 * at);
          p.add('tail.3', 0, 0, 12 * Math.max(0, sin(t, 0.4)) * at);
          if (this.face) this.face.dilate = 0.35;
          // half-lidded stare, then the slow blink (arcs), then eyes open and look away
          this.show = t > 4.2 && t < 5.6 ? 'happy' : t > 1.8 && t < 4.2 ? 'sleepy' : 'neutral';
        },
      },
      topple: {
        // Sits very straight and dignified, sways a little, and falls over sideways. Lies there
        // astonished. Then gets up and washes a paw as if that were the plan.
        weight: 0.8,
        length: [9.5, 9.5],
        when: () => this.posture !== 'lie' && still(),
        start: () => {
          this.posture = 'sit';
          this.step = 0;
        },
        pose: (t) => {
          const sway = ease(t, 2, 3.4) * (1 - ease(t, 3.4, 3.6));
          const fall = ease(t, 3.6, 4.4) * (1 - ease(t, 6.2, 7.2));
          this.want.roll = (10 * sway * sin(t, 0.9) + 84 * fall) * this.side;
          this.want.low = 0.03 * fall;
          p.add('head', 0, 0, -0.6 * 84 * fall * this.side);
          p.add('leg.FL', 12 * fall);
          p.add('leg.BL', -18 * fall);
          p.add('tail.1', 0, 10 * this.side * fall);
          if (t > 4.4 && this.step < 1) {
            this.step = 1;
            this.hop.kick(0.5);
          }
          if (t > 7.2 && this.step < 2) {
            this.step = 2;
            this.hop.kick(1);
          }
          const wash = span(t, 7.6, 8.1, 8.9, 9.4);
          p.add('leg.FL', (-128 - 10 * sin(t, 1.8)) * wash);
          p.add('head', 18 * wash);
          this.show = fall > 0.7 ? 'surprised' : wash > 0.3 ? 'sleepy' : 'neutral';
        },
      },
      bowStretch: {
        // The deep, dignified stretch: chest to the floor, arms out, rump high, held, and released
        // with a small shiver.
        weight: 1.3,
        length: [6.5, 6.5],
        when: standing,
        pose: (t) => {
          const k = span(t, 0.4, 2.2, 4.4, 5.4);
          p.add('body', 26 * k);
          p.add('leg.FL', -85 * k);
          p.add('leg.FR', -85 * k);
          p.add('leg.BL', -22 * k);
          p.add('leg.BR', -22 * k);
          p.add('head', -34 * k + 4 * sin(t, 0.4) * k);
          p.add('tail.1', 34 * k);
          p.add('ear.L', -6 * k);
          p.add('ear.R', -6 * k);
          const shiver = ease(t, 5, 5.2) * (1 - ease(t, 5.9, 6.3));
          p.add('root', 0, 0, 3 * shiver * sin(t, 9));
          this.show = k > 0.4 ? 'happy' : 'neutral';
        },
      },
      stroll: {
        // A dignified stroll: unhurried, head high, tail carried like a question mark.
        weight: 2,
        length: [5, 5],
        when: standing,
        start: () =>
          this.walkTo(
            this.across(1.6 + Math.random() * 1.6, Math.random() < 0.4),
            Math.random() * 0.7,
          ),
        pose: () => {
          p.add('head', -6);
          p.add('tail.1', 10);
        },
      },
      tuck: {
        // Sitting with her tail curled neatly round her paws, its tip tapping.
        weight: 1.4,
        length: [5, 7],
        when: still,
        start: sits,
        pose: (t) => {
          p.add('tail.3', 0, 0, 14 * Math.max(0, sin(t, 0.6)));
          this.show = 'neutral';
        },
      },
      groom: {
        weight: 1.4,
        length: [5.4, 5.4],
        when: () => this.posture !== 'lie' && still(),
        start: sits,
        pose: (t) => {
          // A paw to the mouth, a lick a beat; then the paw wipes over the ear.
          const k = span(t, 0.3, 0.9, 4.5, 5.2);
          if (t < 3) {
            const lick = sin(t, 1.8);
            p.add('leg.FL', (-130 - 12 * lick) * k, 0, -12 * k);
            p.add('head', (18 + 6 * lick) * k, 16 * k, -6 * k);
          } else {
            const swipe = sin(t - 3, 1.2);
            p.add('leg.FL', (-150 + 20 * swipe) * k, 0, -18 * k);
            p.add('head', 6 * k, 0, (-14 - 6 * swipe) * k);
            p.add('ear.L', 0, 0, 14 * swipe * k);
          }
          this.show = 'sleepy';
        },
      },
      scratch: {
        weight: 0.9,
        length: [3.6, 3.6],
        when: still,
        start: sits,
        pose: (t) => {
          // A hind foot scratching at her neck, head tipped into it.
          const k = span(t, 0.3, 0.7, 3, 3.5);
          p.add('leg.BL', (-70 + 24 * sin(t, 6.5)) * k);
          p.add('head', 6 * k, 0, -14 * k);
          p.add('body', 0, 0, 5 * k);
          this.show = 'sleepy';
        },
      },
      yawn: {
        weight: 1,
        length: [3, 3],
        when: still,
        pose: (t) => {
          // Head back, eyes squeezed shut, ears back; a shiver, and a blink of surprise at herself.
          const open = ease(t, 0.3, 1.1) * (1 - ease(t, 1.9, 2.4));
          p.add('head', -24 * open, 0, 5 * open);
          p.add('body', -4 * open);
          p.add('ear.L', -14 * open, 0, -10 * open);
          p.add('ear.R', -14 * open, 0, 10 * open);
          this.show = open > 0.3 ? 'happy' : t > 2.4 ? 'surprised' : 'neutral';
        },
      },
      sploot: {
        // Flat on her belly, hind legs stretched out behind her like a frog.
        weight: 0.9,
        length: [8, 12],
        when: still,
        start: () => (this.posture = 'lie'),
        pose: (t) => {
          const k = ease(t, 0.4, 1.4);
          p.add('leg.BL', 150 * k, 0, 10 * k);
          p.add('leg.BR', 150 * k, 0, -10 * k);
          p.add('leg.FL', -150 * k, 0, -8 * k);
          p.add('leg.FR', -150 * k, 0, 8 * k);
          p.add('head', -18 * k);
          this.want.low = 0.02 * k;
          this.show = sin(t, 0.15) > 0.8 ? 'happy' : 'sleepy';
        },
      },
      nodOff: {
        // Dozing upright: the head sinks, sways, and snaps up again, twice.
        weight: 0.9,
        length: [7, 7],
        when: still,
        start: sits,
        pose: (t) => {
          const cycle = (t % 3.2) / 3.2;
          const sink = ease(cycle, 0.1, 0.85) * (1 - ease(cycle, 0.86, 0.9));
          p.add('head', 26 * sink, 0, 8 * sink);
          p.add('body', 6 * sink);
          if (cycle > 0.86 && cycle < 0.87) this.hop.kick(0.6);
          this.show = sink > 0.5 ? 'asleep' : cycle > 0.86 ? 'surprised' : 'sleepy';
        },
      },
      slowRoll: {
        // Rolls slowly onto her back, all four paws in the air, and gazes at you upside down.
        weight: 0.8,
        length: [9, 9],
        when: () => this.posture !== 'lie' && still(),
        start: () => {
          this.posture = 'stand';
          this.side = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          const k = span(t, 0.4, 2.6, 6.4, 8.4);
          this.want.roll = 172 * this.side * k;
          this.want.low = 0.05 * k;
          p.add('head', 0, 0, -0.8 * 172 * this.side * k);
          p.add('leg.FL', -70 * k, 0, 10 * k);
          p.add('leg.FR', -70 * k, 0, -10 * k);
          p.add('leg.BL', -30 * k, 0, 12 * k);
          p.add('leg.BR', -30 * k, 0, -12 * k);
          p.add('tail.1', 0, 20 * this.side * k);
          this.show = k > 0.9 ? 'happy' : 'neutral';
        },
      },
    };
  }

  /** The goofy side: what she does when she thinks nobody is looking. */
  private goofy(): Record<string, Act> {
    const p = this.puppet;
    const still = () => !this.walking;
    const standing = () => this.posture === 'stand' && still();
    return {
      startle: {
        weight: 0,
        length: [1.4, 1.8],
        start: () => {
          this.posture = 'stand';
          this.hop.kick(2.4);
        },
        pose: () => p.add('body', -8),
      },
      stareStart: {
        // Stares at nothing, pupils widening... and is startled by it. Then licks a paw, as if not.
        weight: 1.2,
        length: [7.5, 7.5],
        when: () => this.posture !== 'lie' && still(),
        start: () => {
          this.step = 0;
          this.want.yaw = 0;
        },
        pose: (t) => {
          const f = this.face;
          if (t < 3.6) {
            const k = ease(t, 0.3, 1);
            p.add('head', -10 * k, 24 * this.side * k);
            p.add('ear.L', 10 * k);
            p.add('ear.R', 10 * k);
            if (f) f.dilate = 0.6 + 0.4 * ease(t, 0.8, 3.4);
            this.show = 'neutral';
          } else if (t < 4.6) {
            if (this.step < 1) {
              this.step = 1;
              this.hop.kick(2.6);
              p.kick('tail.1', -300);
            }
            p.add('head', -14, 0, 0);
            this.show = 'surprised';
          } else {
            const k = span(t, 4.6, 5.2, 6.8, 7.4);
            p.add('leg.FL', -125 * k, 0, -12 * k);
            p.add('head', 20 * k, 14 * k, 0);
            this.show = 'sleepy';
          }
        },
      },
      cheshire: {
        // The wide-eyed stare: leans in toward you, eyes wide, pupils full, not blinking.
        weight: 1.1,
        length: [5.4, 5.4],
        when: () => this.posture !== 'lie' && still(),
        pose: (t) => {
          const k = span(t, 0.4, 1.6, 4.4, 5.2);
          p.add('body', 6 * k);
          p.add('head', 8 * k, 0, 0);
          p.add('ear.L', 8 * k);
          p.add('ear.R', 8 * k);
          this.want.low = 0.02 * k;
          this.show = k > 0.3 ? 'surprised' : 'neutral';
        },
      },
      sprint: {
        // Three mad steps at top speed... then she stops, sits and washes as if she meant it.
        weight: 0.9,
        length: [7, 7],
        when: standing,
        start: () => {
          this.step = 0;
          this.walkTo(
            this.across(1.3 + Math.random() * 0.8, Math.random() < 0.4),
            Math.random() * 0.6,
          );
        },
        pose: (t) => {
          if (t > 1.6 && this.step === 0) {
            this.step = 1;
            this.goal = null;
            this.posture = 'sit';
          }
          if (t < 1.6) p.add('ear.L', -30);
          if (t < 1.6) p.add('ear.R', -30);
          if (t > 2.4) {
            const k = span(t, 2.4, 3, 5.6, 6.6);
            p.add('leg.FL', -125 * k, 0, -12 * k);
            p.add('head', 20 * k, 14 * k, 0);
            this.show = 'sleepy';
          }
        },
      },
      knead: {
        // Treading on the spot, paw after paw, eyes shut in bliss; the cheek lights purr.
        weight: 1.2,
        length: [6.5, 6.5],
        when: () => this.posture !== 'lie' && still(),
        start: () => (this.posture = 'stand'),
        pose: (t) => {
          const k = span(t, 0.3, 0.9, 5.6, 6.3);
          const a = sin(t, 1.4);
          p.add('leg.FL', (-24 - 30 * a) * k);
          p.add('leg.FR', (-24 + 30 * a) * k);
          p.add('body', 8 * k);
          p.add('head', 10 * k + 3 * a * k);
          p.add('tail.1', 0, 12 * a * k);
          this.want.low = 0.02 * k;
          this.show = 'happy';
        },
      },
      birdWatch: {
        // Something goes by up in the air: the head follows it, jaw... no jaw, the tail tip chatters.
        weight: 0.9,
        length: [5.5, 5.5],
        when: () => this.posture !== 'lie' && still(),
        pose: (t) => {
          const k = span(t, 0.3, 0.8, 4.8, 5.4);
          const sweep = sin(t, 0.3);
          p.add('head', -22 * k, 50 * sweep * k);
          p.add('body', -4 * k);
          p.add('tail.3', 0, 0, 30 * sin(t, 7) * k);
          if (this.face) this.face.dilate = 0.6 + 0.4 * k;
          this.show = 'neutral';
        },
      },
      pawPat: {
        // A careful paw pat at something on the floor, head low, one, two, three.
        weight: 1,
        length: [4, 4],
        when: standing,
        pose: (t) => {
          const k = span(t, 0.2, 0.7, 3.4, 4);
          p.add('head', 24 * k);
          p.add('body', 6 * k);
          p.add('leg.FL', (-40 - 26 * Math.max(0, sin(t, 1.6))) * k);
          p.add('tail.3', 0, 0, 14 * sin(t, 3) * k);
          if (this.face) this.face.dilate = 0.9;
          this.show = 'neutral';
        },
      },
      earRadar: {
        weight: 1,
        length: [4, 4],
        when: still,
        pose: (t) => {
          const k = span(t, 0.2, 0.6, 3.4, 4);
          p.add('ear.L', 8 * k, 55 * sin(t, 0.55) * k);
          p.add('ear.R', 8 * k, -55 * sin(t, 0.55, 0.35) * k);
          p.add('head', 3 * k, 8 * sin(t, 0.2) * k);
          this.show = 'neutral';
        },
      },
      tilt: {
        // "Huh?": the head tips one way, then the other.
        weight: 1,
        length: [3.4, 3.4],
        when: () => this.posture !== 'lie' && still(),
        pose: (t) => {
          const k = span(t, 0.1, 0.4, 2.9, 3.4);
          p.add('head', 4 * k, 0, 24 * sin(t, 0.6) * k);
          this.show = Math.abs(sin(t, 0.6)) > 0.9 ? 'surprised' : 'neutral';
        },
      },
      circle: {
        // Pads round in a circle on the floor, looking pleased with the route.
        weight: 0.8,
        length: [8, 8],
        when: standing,
        start: () => (this.step = -1),
        pose: (t) => {
          const f = this.frame;
          const beat = Math.floor(t / 1.7);
          if (f && beat !== this.step && t < 6.8) {
            this.step = beat;
            const [lo, hi] = this.span(f);
            const corner = [
              [0.25, 0.15],
              [0.5, 0.75],
              [0.75, 0.15],
              [0.5, 0.05],
            ][beat % 4];
            const mid = (lo + hi) / 2;
            const w = Math.min(hi - lo, this.px * 3) / 2;
            this.walkTo(mid + (corner[0] - 0.5) * 2 * w, corner[1]);
          }
          p.add('head', -6);
          p.add('tail.1', 10);
        },
      },
    };
  }

  /** Using the box: its front lip, its back wall, and the others in it. */
  private boxed(): Record<string, Act> {
    const p = this.puppet;
    const still = () => !this.walking;
    const standing = () => this.posture === 'stand' && still();
    return {
      headBump: {
        // To the front lip, to bump her head against the glass, again and again: I love you, let me out.
        weight: 0.9,
        length: [8, 8],
        when: standing,
        start: () => {
          this.mark = -1;
          this.walkTo(this.across(0.5, Math.random() < 0.5), 0);
        },
        pose: (t) => {
          if (this.mark < 0 && t > 0.6 && !this.walking) this.mark = t;
          if (this.mark < 0) return;
          const u = t - this.mark;
          const k = span(u, 0, 0.6, 5.4, 6);
          const bump = Math.max(0, sin(u, 0.8, 0.5)) ** 2;
          p.add('head', (10 + 12 * bump) * k, 0, -6 * k);
          p.add('body', 8 * k);
          p.add('leg.FL', -14 * k);
          p.add('leg.FR', -14 * k);
          if (bump > 0.97) this.hop.kick(0.3);
          this.show = 'happy';
        },
      },
      peekOut: {
        // To the front lip to look over it and down at the frame line, left and right.
        weight: 0.9,
        length: [7, 7],
        when: standing,
        start: () => {
          this.mark = -1;
          this.walkTo(this.across(0.5, Math.random() < 0.5), 0);
        },
        pose: (t) => {
          if (this.mark < 0 && t > 0.6 && !this.walking) this.mark = t;
          if (this.mark < 0) return;
          const u = t - this.mark;
          const k = span(u, 0, 0.8, 5, 5.8);
          p.add('body', 10 * k);
          p.add('leg.FL', -18 * k);
          p.add('leg.FR', -18 * k);
          p.add('head', 30 * k + 5 * sin(u, 0.8) * k, 24 * sin(u, 0.35) * k);
          p.add('ear.L', 12 * k);
          p.add('ear.R', 12 * k);
          if (this.face) this.face.dilate = 0.9;
          this.show = 'neutral';
        },
      },
      slowSwat: {
        // To the front lip, where something small sits on the glass. She looks at it, at us, at
        // it, lifts a paw in slow motion and swats it. Slowly. Then looks at us: it was not her.
        weight: 0.9,
        length: [9, 9],
        when: standing,
        start: () => {
          this.mark = -1;
          this.walkTo(this.across(0.5, Math.random() < 0.5), 0);
        },
        pose: (t) => {
          if (this.mark < 0 && t > 0.6 && !this.walking) this.mark = t;
          if (this.mark < 0) return;
          const u = t - this.mark;
          const k = span(u, 0, 0.7, 6.4, 7.2);
          const lift = ease(u, 2, 3.6);
          const push = ease(u, 3.6, 4.8) * (1 - ease(u, 4.8, 5.8));
          p.add('body', 8 * k);
          p.add('leg.FL', (-30 - 62 * lift + 40 * push) * k);
          p.add('head', (16 - 6 * push) * k, 10 * sin(u, 0.35) * (1 - lift) * k);
          p.add('tail.3', 0, 0, 16 * sin(u, 0.8) * k);
          if (this.face) this.face.dilate = 1;
          this.show = u > 5.8 ? 'happy' : 'neutral';
        },
      },
      chirp: {
        // A bird in the box: her jaw... she has none, so the whole head chatters, ears pricked,
        // tail thrashing, pupils full.
        weight: 1.2,
        length: [6, 6],
        when: () => this.posture !== 'lie' && still() && this.birds().length > 0,
        start: () => {
          const all = this.birds();
          this.prey = all[Math.floor(Math.random() * all.length)] ?? null;
        },
        pose: (t) => {
          const prey = this.prey;
          if (!prey || prey.state !== 'here') return;
          const way = Math.sign(prey.s - this.s) || 1;
          const k = span(t, 0.3, 0.9, 5, 5.7);
          const chat = Math.max(0, sin(t, 9)) * ease(t, 1, 1.4) * (1 - ease(t, 4.4, 4.8));
          p.add('head', (-24 + 5 * chat) * k, 46 * way * k, 3 * chat);
          p.add('body', -5 * k);
          p.add('ear.L', 12 * k);
          p.add('ear.R', 12 * k);
          p.add('tail.2', 0, 0, 24 * sin(t, 5) * k);
          p.add('tail.3', 0, 0, 34 * sin(t, 7) * k);
          if (this.face) this.face.dilate = 1;
          this.show = chat > 0.5 ? 'happy' : 'surprised';
        },
      },
      backWall: {
        // To the back wall, to sit with her back to us and watch what is out there.
        weight: 1.1,
        length: [13, 13],
        when: standing,
        start: () => {
          this.mark = -1;
          this.walkTo(this.across(0.6, Math.random() < 0.5), 0.95);
        },
        pose: (t) => {
          if (this.mark < 0 && t > 1 && !this.walking) {
            this.mark = t;
            this.posture = 'sit';
          }
          if (this.mark < 0) return;
          const u = t - this.mark;
          const back = ease(u, 0.2, 1);
          // At the end she looks back at us over her shoulder.
          const look = span(u, 8.4, 9.2, 10.6, 11.4);
          this.want.yaw = 180 * back * (1 - ease(u, 10.8, 11.6));
          p.add('body', -6 * back);
          p.add('head', 0, -50 * look * this.side, 0);
          p.add('tail.3', 0, 0, 10 * Math.max(0, sin(u, 0.5)));
          this.show = look > 0.5 ? 'happy' : 'neutral';
        },
      },
      doubleTake: {
        // Glances at a crewmate, away, then back with a start: was that...?
        weight: 1.3,
        length: [5.4, 5.4],
        when: () => this.posture !== 'lie' && still() && this.mates().length > 0,
        start: () => {
          const all = this.mates();
          this.prey = all[Math.floor(Math.random() * all.length)] ?? null;
          this.step = 0;
        },
        pose: (t) => {
          const prey = this.prey;
          if (!prey || prey.state !== 'here') return;
          const way = Math.sign(prey.s - this.s) || 1;
          const at = span(t, 0.2, 0.6, 1.4, 1.8) + span(t, 2.6, 2.9, 4.4, 4.9);
          const wide = span(t, 2.6, 2.9, 3.9, 4.6);
          p.add('head', -4 * wide, 40 * way * at);
          p.add('ear.L', 14 * wide);
          p.add('ear.R', 14 * wide);
          if (t > 2.6 && this.step < 1) {
            this.step = 1;
            this.hop.kick(1.2);
          }
          if (this.face) this.face.dilate = 0.6 + 0.4 * wide;
          this.show = wide > 0.2 ? 'surprised' : 'neutral';
        },
      },
    };
  }

  private reactions(): Record<string, Act> {
    return {
      purr: {
        weight: 0,
        length: [3, 4],
        pose: (t) => {
          this.puppet.add('head', 6, 0, 10 * sin(t, 0.5));
          this.puppet.add('body', 0, 0, 3 * sin(t, 0.5));
        },
      },
      love: {
        weight: 0,
        length: [3, 4],
        // Leaning into the mouse, eyes gone to hearts.
        pose: (t) => this.puppet.add('head', -4, 0, 10 * sin(t, 0.6)),
      },
      dizzy: {
        weight: 0,
        length: [3.6, 4],
        face: 'dizzy',
        start: () => (this.posture = 'stand'),
        pose: (t) => {
          const k = Math.min(1, t / 0.5) * (1 - ease(t, this.actLength - 0.8, this.actLength));
          const p = this.puppet;
          p.add('root', 8 * k * sin(t, 0.9), 0, 8 * k * sin(t, 0.9, 0.25));
          p.add('head', 14 * k * sin(t, 0.9, 0.5), 0, 14 * k * sin(t, 0.9, 0.75));
          p.add('ear.L', -10 * k, 0, -30 * k);
          p.add('ear.R', -10 * k, 0, 30 * k);
        },
      },
    };
  }

  poke() {
    if (this.state !== 'here') return;
    const n = this.poked();
    if (n >= 3) this.setAct('dizzy');
    else if (this.posture === 'lie' || this.act === 'nodOff') this.setAct('startle');
    else if (n === 2) this.setAct('startle');
    else this.setAct('purr');
  }

  protected feel(env: Env): Mood {
    // The startle at the end of her stare.
    if (this.act === 'stareStart' && this.actT > 3.6 && this.actT < 5) return 'alarmed';
    if (this.act === 'doubleTake' && this.actT > 2.6 && this.actT < 4.2) return 'alarmed';
    return super.feel(env);
  }

  protected pose(dt: number, env: Env) {
    this.frame = env.frame;
    this.env = env;
    const middle = (env.frame.left + env.frame.right) / 2;
    const toward = Math.sign(middle - this.s) || 1;
    this.side = -toward;
    // Turned side-on by her anatomy, but square to us for the acts that face the viewer or the box.
    const facing = [
      'cheshire',
      'headBump',
      'peekOut',
      'backWall',
      'slowRoll',
      'stareStart',
      'slowSwat',
    ];
    this.anatomy.turn = facing.includes(this.act)
      ? this.act === 'slowRoll' || this.act === 'stareStart'
        ? 90
        : 0
      : this.posture === 'lie'
        ? 60
        : SHORTHAIR.turn;
    // Watching something, not the mouse.
    const watching = [
      'stareStart',
      'birdWatch',
      'cheshire',
      'doubleTake',
      'judge',
      'chirp',
    ].includes(this.act);
    this.spec.gaze = watching ? [] : this.gaze;
    const speed: Record<string, number> = { stroll: 0.7, circle: 0.6, sprint: 3.4, backWall: 0.9 };
    this.spec.speed = this.baseSpeed * (speed[this.act] ?? 1);

    this.hover = this.hovered ? this.hover + dt : 0;
    if (
      this.hover > 0.8 &&
      ['idle', 'sit', 'statue', 'tuck', 'stand'].includes(this.act) &&
      this.posture !== 'lie'
    )
      this.setAct('love');

    // Eyes wide open and round: how wide depends on the mood (and the dark).
    if (this.face) {
      const dark = this.lookName === 'paper' ? 0.2 : 0;
      const mood: Partial<Record<Mood, number>> = {
        curious: 0.85,
        alarmed: 1,
        sleepy: 0.2,
        asleep: 0,
        love: 0.9,
      };
      const target = clamp((mood[this.mood] ?? 0.65) + dark, 0, 1);
      if (
        ![
          'stareStart',
          'birdWatch',
          'pawPat',
          'cheshire',
          'doubleTake',
          'peekOut',
          'judge',
          'chirp',
          'slowSwat',
        ].includes(this.act)
      )
        this.face.dilate += (target - this.face.dilate) * Math.min(1, dt * 4);
      else if (this.act === 'cheshire') this.face.dilate = 1;
    }

    super.pose(dt, env);
    if (this.show) this.expression = this.show;
    this.show = undefined;
    if (this.act === 'startle' && this.actT < 0.1) this.puppet.kick('tail.1', -300);
    // Sitting, the tail curls round her front paws.
    if (this.posture === 'sit' && !this.walking && this.act !== 'backWall') this.wrap();
  }

  /** The tail laid round her paws, tip twitching now and then. */
  private wrap() {
    const p = this.puppet;
    const s = this.side;
    p.add('tail.1', -50, 70 * s);
    p.add('tail.2', 0, 40 * s, 0);
    p.add('tail.3', 0, 40 * s, 0);
  }

  /** Loafing: legs tucked, head low. (Overridden: her head stays high.) */
  protected lying(breath: number) {
    const p = this.puppet;
    p.add('leg.FL', 80);
    p.add('leg.FR', 80);
    p.add('leg.BL', -80);
    p.add('leg.BR', -80);
    p.add('head', 6 + 2 * breath);
  }

  /** Curled up, the tail wraps round to one side. */
  protected tailLying() {
    const p = this.puppet;
    const s = this.side;
    p.add('tail.1', -40, 60 * s);
    p.add('tail.2', 0, 0, -38 * s);
    p.add('tail.3', 0, 0, -28 * s + 6 * sin(this.t, 0.15));
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    this.h = 0;
    const turned = this.turning.update(dt, this.want.yaw);
    if (turned) p.turn('root', 0, turned);
    const roll = this.rolling.update(dt, this.want.roll);
    if (roll) p.turn('body', 0, 0, roll);
    // Low: the body sinks, and the legs with it or not (on her back they point at the sky).
    const low = this.crouching.update(dt, this.want.low);
    p.shift('body', 0, -low, 0);
    if (Math.abs(this.want.roll) < 90) for (const leg of LEGS) p.shift(leg, 0, low, 0);
    this.want.yaw = this.want.low = this.want.roll = 0;
    this.lights(dt, env);
  }

  /** The tag shows the mood in colour; the cheek lights come up when she purrs. */
  private lights(dt: number, env: Env) {
    const a = this.act;
    let level = 0.15 + 0.1 * Math.sin(env.time * 0.8);
    if (a === 'purr' || a === 'love' || a === 'knead' || a === 'slowRoll')
      level = 0.6 + 0.4 * Math.sin(env.time * 4);
    else if (this.mood === 'happy') level = 0.6;
    else if (this.mood === 'alarmed') level = Math.sin(env.time * 28) > 0 ? 1 : 0.3;
    else if (this.mood === 'asleep' || this.mood === 'sleepy') level = 0.05;
    const glow = this.glow.update(dt, clamp(level, 0, 1));
    this.outfit.dot(0, clamp(glow, 0, 1));
    this.outfit.dot(1, clamp(glow, 0, 1));
    const key = this.expression;
    this.outfit.beacon(BEACON[key] ?? '#f4f4f1');
  }

  /** Copper eyes in the colour look. */
  dress(look: LookName, flame?: FlameStyle) {
    super.dress(look, flame);
    this.face?.setGlow(look === 'colour' ? '#f2a63c' : '#f4f4f1');
  }

  protected onLeave() {
    super.onLeave();
    this.h = 0;
  }
}
