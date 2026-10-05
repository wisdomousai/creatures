import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import type { Door } from './box';
import { type Act, type Character, clamp, type Env, type Frame } from './character';
import type { Expression, FaceLayout } from './face';
import { sin } from './moves';
import { type Anatomy, type Mood, Pet } from './pet';
import { Spring } from './spring';

/**
 * Waddles, the fat robot cat: a big round pear of a body that nearly sits on the floor,
 * a small head with a double chin perched on the front of it, little stub legs on white
 * socks and a thick tail. A round belly plate with a ring of screws holds a belly-button
 * light that shows her mood. She is slow and lazy and grumpy-happy: her resting face is
 * unimpressed, then something small pleases her and she beams.
 *
 * She waddles, rocking from side to side. She loafs, sits like a human with her belly
 * out, squeezes into a space too small for her ("if I fits I sits") with her sides
 * bulging, flops onto her belly, rolls onto her back and can't get up, bursts into three
 * steps of speed and is exhausted, nods off mid-wash, begs, thumps her tail when cross,
 * takes forever over a stretch, tips over sideways in slow motion, hiccups, and leans over
 * the front lip until she nearly falls. She jumps at something too high and slides back
 * down, gets wedged in the arch in the back wall, stares at the pointer as if it were a
 * food bowl, drums her belly, and sets off after a crewmate at a determined waddle and
 * gives up. Poke her and she wobbles like a jelly; three quick
 * pokes and she is dizzy, the belly light going through the rainbow. Rest the mouse on her
 * and she rolls onto her back for a tummy rub.
 */
export const FATCAT_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.31, 0.44],
    [0.69, 0.44],
  ],
  rx: 0.09,
  ry: 0.22,
  line: 0.032,
  mouth: [0.5, 0.76],
  kind: 'cat',
};

const TAIL = ['tail.1', 'tail.2', 'tail.3'];
const LEGS = ['leg.FL', 'leg.FR', 'leg.BL', 'leg.BR'];

const FATCAT: Anatomy = {
  tail: TAIL,
  tailAxis: [0, 0.3, -1],
  earsHang: false,
  moods: {
    // Resting, she looks unimpressed: half-lidded, tail low and heavy.
    calm: {
      face: 'focused',
      carriage: -55,
      bob: [4, 0.15],
      hook: 8,
      flicks: 0.05,
      ears: -4,
      out: 8,
      swivel: 0.2,
    },
    curious: {
      face: 'neutral',
      carriage: -20,
      hook: 25,
      flicks: 0.6,
      ears: 12,
      out: -2,
      swivel: 0.8,
    },
    happy: { face: 'happy', carriage: -5, hook: 22, ears: 8, out: -2, swivel: 0.3 },
    love: { face: 'love', carriage: 0, hook: 18, quiver: 1, ears: 6, out: -4, swivel: 0 },
    alarmed: { face: 'surprised', carriage: 0, hook: -30, puff: 1, ears: -18, out: 12, swivel: 0 },
    annoyed: {
      face: 'cross',
      carriage: -50,
      bob: [16, 1.1],
      hook: -8,
      flicks: 0.5,
      ears: -25,
      out: 45,
      swivel: 0,
    },
    sad: { face: 'sad', carriage: -80, ears: -12, out: 26, swivel: 0 },
    sleepy: {
      face: 'sleepy',
      carriage: -75,
      bob: [3, 0.1],
      hook: 4,
      ears: -6,
      out: 16,
      swivel: 0.1,
    },
    asleep: { face: 'asleep', carriage: -75, flicks: 0.1, ears: -6, out: 12, swivel: 0.2 },
  },
  actMoods: {
    purr: 'happy',
    love: 'love',
    tummy: 'love',
    startle: 'alarmed',
    hiccup: 'alarmed',
    grump: 'annoyed',
    tailThump: 'annoyed',
    backWall: 'annoyed',
    beg: 'sad',
    sprint: 'happy',
    tired: 'sleepy',
    yawn: 'sleepy',
    slowStretch: 'sleepy',
    drowse: 'sleepy',
    nap: 'asleep',
    loaf: 'calm',
    sniff: 'curious',
    peekOver: 'curious',
    squeeze: 'happy',
    humanSit: 'happy',
    groomSleep: 'happy',
    foodBowl: 'sad',
    bellyDrum: 'happy',
    failJump: 'curious',
    waddleChase: 'curious',
    doorStuck: 'annoyed',
  } satisfies Record<string, Mood>,
  lying: 'sleepy',
  hover: 'happy',
  drop: { stand: 0, sit: -0.08, lie: -0.035 },
  sit: -22,
  turn: 50,
};

/** 0 before a, 1 after b, eased between. */
const ease = (t: number, a: number, b: number) => {
  const u = clamp((t - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
};
/** Fades in over a..b, holds, fades out over c..d. */
const span = (t: number, a: number, b: number, c: number, d: number) =>
  ease(t, a, b) * (1 - ease(t, c, d));

export class Fatcat extends Pet {
  static readonly terms =
    'kitty chubby plump chonky round pear belly big heavy lazy waddle black charcoal dark grey gray white socks double chin thick tail';

  protected readonly anatomy: Anatomy = { ...FATCAT, drop: { ...FATCAT.drop } };
  private gaze = this.spec.gaze;
  private frame: Frame | null = null;
  private env: Env | null = null;
  private baseSpeed = 0.75;
  private side = 1;
  private mark = -1;
  private step = 0;
  private hover = 0;
  /** The face an act wants (the mood's own is used when it wants none). */
  private show: Expression | undefined;
  private prey: Character | null = null;
  /** The back-wall door she is wedged in, and a flash of the belly light (seconds left). */
  private held: Door | null = null;
  private flash = 0;
  private flashColour = '#f4f4f1';
  /** What acts want this frame: turned about (degrees), crouched (metres), rolled (degrees), girth. */
  private want = { yaw: 0, low: 0, roll: 0, girth: 1 };
  private turning = new Spring(1.2, 0.8);
  private crouching = new Spring(2, 0.5);
  private rolling = new Spring(1.2, 0.7);
  private girth = new Spring(3, 0.35, 1, 1);

  constructor(model: Object3D) {
    super(
      {
        name: 'Waddles',
        model: 'fatcat',
        metres: 0.69,
        width: 0.7,
        size: 1,
        feels: {
          default: { f: 1.8, zeta: 0.6 },
          body: { f: 1.3, zeta: 0.6 },
          head: { f: 1.5, zeta: 0.6, r: 0.3 },
          'ear.L': { f: 4, zeta: 0.3 },
          'ear.R': { f: 4, zeta: 0.3 },
          'tail.1': { f: 1.1, zeta: 0.5 },
          'tail.2': { f: 1.4, zeta: 0.4 },
          'tail.3': { f: 1.8, zeta: 0.3 },
          'leg.FL': { f: 2.6, zeta: 0.6 },
          'leg.FR': { f: 2.6, zeta: 0.6 },
          'leg.BL': { f: 2.6, zeta: 0.6 },
          'leg.BR': { f: 2.6, zeta: 0.6 },
        },
        face: FATCAT_FACE,
        eyes: 0.8,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.9 },
          { bone: 'body', yaw: 0.2, pitch: 0 },
        ],
        reach: { yaw: 55, pitch: 30 },
        lag: 0.6,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 0.75,
      },
      model,
    );
    this.baseSpeed = this.spec.speed ?? 0.75;
    this.acts = {
      ...this.commonActs(),
      ...this.lazy(),
      ...this.silly(),
      ...this.boxed(),
      ...this.reactions(),
    };
  }

  private mates() {
    return (this.env?.crew ?? []).filter(
      (o) => o !== this && o.state === 'here' && o.edge === this.edge && !o.free,
    );
  }

  private middle() {
    const f = this.frame;
    return f ? (f.left + f.right) / 2 : this.s;
  }

  private across(metres: number, back = false) {
    return this.s + (this.s < this.middle() !== back ? 1 : -1) * metres * this.px;
  }

  /** Lazy things: lying about, sitting, stretching, washing, falling asleep. */
  private lazy(): Record<string, Act> {
    const p = this.puppet;
    const still = () => !this.walking;
    const standing = () => this.posture === 'stand' && still();
    const sits = () => {
      this.posture = 'sit';
    };
    return {
      stroll: {
        // The waddle: side to side, slow, in no hurry at all.
        weight: 2,
        length: [5, 5],
        when: standing,
        start: () =>
          this.walkTo(
            this.across(1.4 + Math.random() * 1.4, Math.random() < 0.4),
            Math.random() * 0.7,
          ),
        pose: () => p.add('head', -4),
      },
      loaf: {
        weight: 1.8,
        length: [9, 15],
        when: still,
        start: () => (this.posture = 'lie'),
        pose: (t) => {
          p.add('head', -10);
          p.add('ear.L', 0, 0, -12);
          p.add('ear.R', 0, 0, 12);
          this.want.girth = 1 + 0.025 * sin(t, 0.25);
          this.show = sin(t, 0.1) > 0.85 ? 'happy' : 'focused';
        },
      },
      squeeze: {
        // "If I fits, I sits": wriggles down into a spot far too small, sides bulging over the edges.
        weight: 1.2,
        length: [7, 7],
        when: still,
        start: sits,
        pose: (t) => {
          const wiggle = span(t, 0, 0.4, 1.9, 2.4);
          p.add('root', 0, 0, 5 * sin(t, 3.2) * wiggle);
          p.add('body', 0, 4 * sin(t, 3.2, 0.25) * wiggle, 0);
          p.add('tail.1', 0, 25 * sin(t, 3.2) * wiggle);
          const tight = span(t, 1.6, 2.6, 5.4, 5.9);
          this.want.girth = 1 + 0.12 * tight;
          this.want.low = 0.03 * tight;
          if (t > 5.4 && this.step < 1) {
            this.step = 1;
            this.hop.kick(1.1);
          }
          this.show = tight > 0.6 ? 'happy' : 'focused';
        },
      },
      humanSit: {
        // Sits back like a person, hind legs stuck out in front, front paws resting on her belly.
        weight: 1.3,
        length: [9, 9],
        when: still,
        start: sits,
        pose: (t) => {
          const k = ease(t, 0.4, 1.6) * (1 - ease(t, 8, 8.8));
          p.add('body', -14 * k);
          p.add('leg.FL', -75 * k, 0, 10 * k);
          p.add('leg.FR', -75 * k, 0, -10 * k);
          p.add('leg.FL', -14 * Math.max(0, sin(t, 0.4)) * k);
          p.add('leg.BL', -45 * k, 22 * k);
          p.add('leg.BR', -45 * k, -22 * k);
          p.add('head', -10 * k);
          this.want.low = 0.05 * k;
          this.want.girth = 1 + 0.03 * sin(t, 0.3) * k;
          this.show = 'happy';
        },
      },
      drowse: {
        // Sitting up, the head sinks to her chest, jerks up, and sinks again.
        weight: 1.2,
        length: [7, 7],
        when: still,
        start: sits,
        pose: (t) => {
          const cycle = (t % 3.4) / 3.4;
          const sink = ease(cycle, 0.1, 0.85) * (1 - ease(cycle, 0.86, 0.9));
          p.add('head', 30 * sink, 0, 6 * sink);
          p.add('body', 5 * sink);
          if (cycle > 0.86 && cycle < 0.87) this.hop.kick(0.5);
          this.show = sink > 0.5 ? 'asleep' : cycle > 0.86 ? 'surprised' : 'sleepy';
        },
      },
      yawn: {
        weight: 1,
        length: [3.6, 3.6],
        when: still,
        pose: (t) => {
          const open = ease(t, 0.3, 1.5) * (1 - ease(t, 2.3, 3));
          p.add('head', -28 * open, 0, 5 * open);
          p.add('ear.L', -14 * open);
          p.add('ear.R', -14 * open);
          this.want.girth = 1 + 0.06 * open;
          this.show = open > 0.3 ? 'happy' : 'focused';
        },
      },
      stretch: {
        // The stretch that takes forever: paws out an inch at a time, rump up, quivering, and a long sigh.
        weight: 1.2,
        length: [8.5, 8.5],
        when: standing,
        pose: (t) => {
          const k = span(t, 0.4, 4.2, 6.2, 8);
          const shake = ease(t, 4.2, 5) * (1 - ease(t, 5.6, 6.2));
          this.slowBow(k, shake, t);
          this.show = 'sleepy';
        },
      },
      groomSleep: {
        // Washes a paw, slower and slower, the paw stays up, her head sinks... and she is out.
        weight: 1.1,
        length: [10, 10],
        when: () => this.posture !== 'lie' && still(),
        start: sits,
        pose: (t) => {
          const k = span(t, 0.3, 0.9, 8.6, 9.4);
          const slow = 1 - ease(t, 0, 5);
          const lick = sin(t * (0.4 + 0.8 * slow), 1.8);
          const drooping = ease(t, 4.5, 6.5) * (1 - ease(t, 6.9, 7.1));
          p.add('leg.FL', (-130 + 40 * drooping - 12 * lick * slow) * k, 0, -12 * k);
          p.add(
            'head',
            (18 + 10 * drooping + 6 * lick * slow) * k,
            16 * k * (1 - drooping * 0.5),
            -6 * k,
          );
          if (t > 6.9 && this.step < 1) {
            this.step = 1;
            this.hop.kick(0.9);
          }
          this.show = drooping > 0.5 ? 'asleep' : t > 6.9 && t < 7.8 ? 'surprised' : 'sleepy';
        },
      },
      tailThump: {
        // Cross: the tail thumps the floor, thump, thump, thump.
        weight: 1,
        length: [5, 5],
        when: still,
        start: sits,
        pose: (t) => {
          const k = span(t, 0.2, 0.6, 4.4, 5);
          const beat = Math.floor(t / 0.75);
          if (t > 0.5 && beat !== this.step) {
            this.step = beat;
            p.kick('tail.1', 500);
            this.hop.kick(0.18);
          }
          p.add('ear.L', -20 * k);
          p.add('ear.R', -20 * k);
          p.add('head', 6 * k, 0, 0);
          this.show = 'cross';
        },
      },
      grump: {
        // Glares, unblinking; the corners of her eyes go soft; she beams for a moment and pretends not to.
        weight: 1,
        length: [7, 7],
        when: () => this.posture !== 'lie' && still(),
        pose: (t) => {
          const k = span(t, 0.3, 1, 6, 6.8);
          p.add('body', 5 * k);
          p.add('head', 4 * k);
          this.show = t > 3.6 && t < 5.2 ? 'happy' : 'cross';
        },
      },
      plop: {
        // Just sits down all at once, and everything jiggles.
        weight: 1,
        length: [3, 3],
        when: () => this.posture !== 'sit' && still(),
        start: () => {
          this.posture = 'sit';
          this.puppet.kick('body', -260);
          this.puppet.kick('head', 220);
        },
        pose: (t) => {
          this.want.low = 0.03 * Math.exp(-t * 3) * Math.cos(t * 9);
          this.show = 'sleepy';
        },
      },
      foodBowl: {
        // Sits square to the pointer and stares as if it were a food bowl; her belly rumbles.
        weight: 1,
        length: [8, 8],
        when: () => this.posture !== 'lie' && still(),
        start: () => {
          this.posture = 'sit';
          this.step = -1;
        },
        pose: (t) => {
          const k = span(t, 0.4, 1.2, 7, 7.8);
          const beat = Math.floor((t - 1.5) / 1.7);
          if (t > 1.5 && t < 6.6 && beat !== this.step) {
            this.step = beat;
            this.girth.kick(-4);
            this.flash = 0.25;
            this.flashColour = '#ffe9b0';
          }
          const lick = span(t, 4.6, 4.9, 5.6, 5.9) * Math.max(0, sin(t, 3.5));
          p.add('body', -5 * k);
          p.add('head', (-6 + 4 * sin(t, 1.1)) * k + 8 * lick, 0, 0);
          p.add('leg.FL', -30 * k);
          p.add('leg.FR', -30 * k);
          p.add('ear.L', 8 * k);
          p.add('ear.R', 8 * k);
          this.show = t > 5 && t < 6.2 ? 'love' : 'sad';
        },
      },
      beg: {
        // Sits up tall, paws held up, the biggest eyes she has: please.
        weight: 1,
        length: [5.5, 5.5],
        when: () => this.posture !== 'lie' && still(),
        start: sits,
        pose: (t) => {
          const k = span(t, 0.4, 1.2, 4.6, 5.3);
          p.add('body', -8 * k);
          p.add('leg.FL', (-95 - 6 * sin(t, 2.2)) * k, 0, 10 * k);
          p.add('leg.FR', (-95 + 6 * sin(t, 2.2)) * k, 0, -10 * k);
          p.add('head', -10 * k, 0, 10 * sin(t, 0.5) * k);
          this.show = 'sad';
        },
      },
    };
  }

  /** A stretch: chest down, paws out, rump up, and a tremble at full stretch. */
  private slowBow(k: number, shake: number, t: number) {
    const p = this.puppet;
    p.add('body', 16 * k + 1.5 * sin(t, 7) * shake);
    p.add('leg.FL', -62 * k);
    p.add('leg.FR', -62 * k);
    p.add('leg.BL', -14 * k);
    p.add('leg.BR', -14 * k);
    p.add('head', -24 * k);
    p.add('tail.1', 25 * k, 0, 0);
    this.want.low = 0.01 * k;
  }

  /** What she gets up to when something wakes her up. */
  private silly(): Record<string, Act> {
    const p = this.puppet;
    const still = () => !this.walking;
    const standing = () => this.posture === 'stand' && still();
    return {
      startle: {
        weight: 0,
        length: [1.6, 2],
        start: () => {
          this.posture = 'stand';
          this.hop.kick(1.6);
          p.kick('body', -400);
          this.girth.kick(-8);
        },
        pose: () => p.add('body', -6),
      },
      bellyFlop: {
        // Drops onto her belly like a dropped sack, legs splayed; lies there a while; then heaves up.
        weight: 1,
        length: [7.5, 7.5],
        when: standing,
        start: () => (this.step = 0),
        pose: (t) => {
          if (t > 0.8 && this.step < 1) {
            this.step = 1;
            this.hop.kick(1.6);
            this.girth.kick(-8);
          }
          const down = ease(t, 0.85, 1.1) * (1 - ease(t, 5.6, 6.4));
          this.want.low = 0.04 * down;
          p.add('leg.FL', -55 * down, 0, 50 * down);
          p.add('leg.FR', -55 * down, 0, -50 * down);
          p.add('leg.BL', 50 * down, 0, 45 * down);
          p.add('leg.BR', 50 * down, 0, -45 * down);
          p.add('head', -6 * down, 0, 6 * sin(t, 0.2) * down);
          this.want.girth = 1 + 0.06 * down;
          if (t > 5.6 && t < 6.4) p.add('body', 10 * ease(t, 5.6, 6));
          this.show = down > 0.5 ? 'sleepy' : 'focused';
        },
      },
      rollOver: {
        // Rolls onto her back, and cannot get up: paws paddling, rocking, giving up, flopping back.
        weight: 0.9,
        length: [12, 12],
        when: () => this.posture !== 'lie' && still(),
        start: () => {
          this.posture = 'stand';
          this.side = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          const over = ease(t, 0.5, 2.2) * (1 - ease(t, 9.8, 11.4));
          const rock = span(t, 3.6, 4.2, 6.6, 7.2) * sin(t, 0.7);
          this.want.roll = (172 + 20 * rock) * this.side * over;
          this.want.low = 0.05 * over;
          p.add('head', 0, 0, -0.8 * 172 * this.side * over);
          p.shift('head', 0, 0.09 * over, 0);
          const paddle = span(t, 3.6, 4.2, 6.6, 7.2);
          p.add('leg.FL', (-40 + 30 * sin(t, 1.6)) * over * (0.3 + paddle), 0, 12 * over);
          p.add('leg.FR', (-40 - 30 * sin(t, 1.6)) * over * (0.3 + paddle), 0, -12 * over);
          p.add('leg.BL', (-20 - 25 * sin(t, 1.6)) * over * (0.3 + paddle), 0, 14 * over);
          p.add('leg.BR', (-20 + 25 * sin(t, 1.6)) * over * (0.3 + paddle), 0, -14 * over);
          this.show = t > 3.6 && t < 7.4 ? 'sad' : over > 0.9 ? 'happy' : 'neutral';
        },
      },
      sprint: {
        // Three steps of sudden, terrifying speed. Then she's done, and sits, panting.
        weight: 0.9,
        length: [8, 8],
        when: standing,
        start: () => {
          this.step = 0;
          this.walkTo(this.across(1.2 + Math.random() * 0.6, Math.random() < 0.4), this.depth);
        },
        pose: (t) => {
          if (t > 1.3 && this.step === 0) {
            this.step = 1;
            this.goal = null;
            this.posture = 'sit';
          }
          if (t < 1.3) {
            p.add('ear.L', -30);
            p.add('ear.R', -30);
            p.add('body', 8);
          } else {
            // Panting: the belly heaves.
            const k = span(t, 1.3, 1.8, 6.4, 7.6);
            this.want.girth = 1 + 0.05 * Math.sin(t * 11) * k;
            p.add('head', 14 * k);
            this.show = 'dizzy';
            if (t > 3.6) this.show = 'sleepy';
          }
        },
      },
      hiccup: {
        weight: 0.8,
        length: [4.4, 4.4],
        when: still,
        pose: (t) => {
          const beat = Math.floor(t / 1.1);
          if (t > 0.4 && beat !== this.step) {
            this.step = beat;
            this.hop.kick(0.7);
            this.girth.kick(-5);
            p.kick('head', -180);
          }
        },
        start: () => (this.step = -1),
      },
      tipOver: {
        // Sitting, she leans further and further to one side, and goes over like a skittle.
        weight: 0.8,
        length: [8, 8],
        when: () => this.posture !== 'lie' && still(),
        start: () => {
          this.posture = 'sit';
          this.side = Math.random() < 0.5 ? -1 : 1;
          this.step = 0;
        },
        pose: (t) => {
          const lean = ease(t, 0.4, 3);
          const fall = ease(t, 3.1, 3.4);
          const up = ease(t, 6, 7.2);
          const roll = (12 * lean + 62 * fall) * (1 - up);
          this.want.roll = roll * this.side;
          p.add('head', 0, 0, -0.6 * roll * this.side);
          if (t > 3.3 && this.step < 1) {
            this.step = 1;
            this.hop.kick(0.9);
            this.girth.kick(-6);
          }
          this.show = t < 3.1 ? (lean > 0.6 ? 'surprised' : 'focused') : t < 6 ? 'sad' : 'happy';
        },
      },
      tailChase: {
        // Turns slowly after her own tail, gets about halfway, and gives up and lies down.
        weight: 0.8,
        length: [7.5, 7.5],
        when: standing,
        start: () => {
          this.goal = null;
          this.side = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          const k = span(t, 0.3, 1, 5, 5.8);
          p.add('head', 18 * k, 50 * this.side * k);
          p.add('body', 0, 18 * this.side * k);
          p.add('tail.1', 0, -50 * this.side * k);
          p.add('leg.FL', 22 * sin(t, 1.6) * k);
          p.add('leg.BR', 22 * sin(t, 1.6) * k);
          p.add('leg.FR', -22 * sin(t, 1.6) * k);
          p.add('leg.BL', -22 * sin(t, 1.6) * k);
          this.want.yaw = this.side * 300 * ease(t, 0.5, 4.6);
          if (t > 5.4 && this.posture !== 'lie') this.posture = 'lie';
          this.show = t > 4.6 ? 'sad' : 'focused';
        },
      },
      failJump: {
        // Wiggles her rump, leaps at something far too high, scrabbles at its edge, and slides back down.
        weight: 0.9,
        length: [8, 8],
        when: standing,
        start: () => (this.step = 0),
        pose: (t) => {
          const wind = span(t, 0.2, 1, 1.5, 1.7);
          p.add('body', 10 * wind);
          p.add('root', 0, 0, 3 * sin(t, 4.5) * wind);
          p.add('tail.1', 0, 22 * sin(t, 4.5) * wind);
          this.want.low = 0.03 * wind;
          if (t > 1.6 && this.step === 0) {
            this.step = 1;
            this.hop.kick(2.4);
            p.kick('body', -320);
          }
          if (t > 2.6 && this.step === 1) {
            this.step = 2;
            this.posture = 'sit';
            this.hop.kick(0.7);
          }
          const air = span(t, 1.6, 1.9, 2.5, 2.8);
          const hang = span(t, 2.4, 2.7, 3.4, 3.6);
          p.add('leg.FL', -70 * air + 25 * sin(t, 5) * hang);
          p.add('leg.FR', -70 * air - 25 * sin(t, 5) * hang);
          p.add('body', -14 * air);
          const slide = span(t, 3.4, 3.9, 6.2, 7);
          p.add('leg.FL', -55 * slide);
          p.add('leg.FR', -55 * slide);
          p.add('body', -16 * slide);
          p.add('head', 12 * slide);
          this.want.low = Math.max(this.want.low, 0.03 * slide);
          this.show = t < 1.6 ? 'focused' : t < 3.4 ? 'surprised' : 'sad';
        },
      },
      bellyDrum: {
        // Sits back and drums her belly with both paws, the belly light flashing on every beat.
        weight: 0.9,
        length: [8, 8],
        when: () => this.posture !== 'lie' && still(),
        start: () => {
          this.posture = 'sit';
          this.step = -1;
        },
        pose: (t) => {
          const k = span(t, 0.4, 1.4, 6.4, 7.2);
          const beat = Math.floor((t - 1.6) / 0.4);
          if (t > 1.6 && t < 6.2 && beat !== this.step) {
            this.step = beat;
            p.kick(beat % 2 ? 'leg.FL' : 'leg.FR', -420);
            this.girth.kick(-5);
            this.hop.kick(0.15);
            this.flash = 0.2;
            this.flashColour = RAINBOW[beat % RAINBOW.length];
          }
          p.add('body', -10 * k);
          p.add('leg.FL', -70 * k, 0, 10 * k);
          p.add('leg.FR', -70 * k, 0, -10 * k);
          p.add('head', -8 * k, 0, 6 * sin(t, 1.25) * k);
          p.add('ear.L', 6 * sin(t, 2.5) * k);
          p.add('ear.R', -6 * sin(t, 2.5) * k);
          this.want.low = 0.03 * k;
          this.show = 'happy';
        },
      },
      sniff: {
        // Nose down, snuffling after a crumb; finds it; happy chewing.
        weight: 1.2,
        length: [8, 8],
        when: standing,
        start: () => {
          this.step = 0;
          this.walkTo(
            this.across(0.8 + Math.random() * 0.8, Math.random() < 0.5),
            Math.random() * 0.5,
          );
        },
        pose: (t) => {
          const k = span(t, 0.2, 0.8, 6.8, 7.6);
          const chew = span(t, 4.4, 4.8, 6.4, 6.8);
          p.add('head', 38 * k + 5 * sin(t, 5) * (1 - chew) * k);
          p.add('body', 8 * k);
          p.add('head', 6 * Math.max(0, sin(t, 3)) * chew);
          this.show = chew > 0.5 ? 'happy' : 'neutral';
        },
      },
    };
  }

  private boxed(): Record<string, Act> {
    const p = this.puppet;
    const standing = () => this.posture === 'stand' && !this.walking;
    return {
      peekOver: {
        // To the front lip; leans right over it to see the ground, further, further... whoops, back.
        weight: 0.9,
        length: [9, 9],
        when: standing,
        start: () => {
          this.mark = -1;
          this.step = 0;
          this.walkTo(this.across(0.5, Math.random() < 0.5), 0);
        },
        pose: (t) => {
          if (this.mark < 0 && t > 0.8 && !this.walking) this.mark = t;
          if (this.mark < 0) return;
          const u = t - this.mark;
          const lean = ease(u, 0.2, 3.6) * (1 - ease(u, 4.6, 4.9));
          const wobble = span(u, 3.4, 3.6, 4.4, 4.9);
          p.add('body', 22 * lean);
          p.add('leg.FL', -35 * lean);
          p.add('leg.FR', -35 * lean);
          p.add('leg.BL', 12 * lean);
          p.add('leg.BR', 12 * lean);
          p.add('head', 26 * lean, 0, 5 * sin(u, 2.4) * wobble);
          p.add('tail.1', 22 * lean + 20 * sin(u, 2.4) * wobble);
          if (u > 4.6 && this.step < 1) {
            this.step = 1;
            this.hop.kick(1.2);
          }
          this.show = wobble > 0.3 ? 'surprised' : u > 5 ? 'sleepy' : 'neutral';
        },
      },
      backWall: {
        // Waddles off to the back wall, sits facing it with her back to us, sulking; tail thumping.
        weight: 1,
        length: [11, 11],
        when: standing,
        start: () => {
          this.mark = -1;
          this.walkTo(this.across(0.6, Math.random() < 0.5), 0.95);
        },
        pose: (t) => {
          if (this.mark < 0 && t > 1 && !this.walking) {
            this.mark = t;
            this.posture = 'sit';
            this.step = 0;
          }
          if (this.mark < 0) return;
          const u = t - this.mark;
          const back = ease(u, 0.2, 1) * (1 - ease(u, 8.6, 9.6));
          this.want.yaw = 180 * back;
          const beat = Math.floor(u / 1.4);
          if (u > 2 && beat !== this.step && u < 8) {
            this.step = beat;
            p.kick('tail.1', 420);
          }
          this.show = 'cross';
        },
      },
      doorStuck: {
        // Waddles to the arch in the back wall, pushes in, and gets stuck halfway: sides bulging,
        // legs paddling; sags; then wriggles back out with a pop.
        weight: 0.8,
        length: [12, 12],
        when: standing,
        start: () => {
          this.mark = -1;
          this.step = 0;
          const d = this.doors.find((o) => o.kind === 'back' && !o.user) ?? null;
          this.held = d;
          if (d) {
            d.user = this;
            d.want = 1;
          }
          this.walkTo(d ? d.x : this.across(0.6, Math.random() < 0.5), 0.93);
        },
        pose: (t) => {
          if (this.mark < 0 && t > 1 && !this.walking) {
            this.mark = t;
            this.posture = 'stand';
          }
          if (this.mark < 0) return;
          const u = t - this.mark;
          this.want.yaw = 180 * ease(u, 0.2, 1) * (1 - ease(u, 8.2, 9.2));
          const push = span(u, 1, 1.5, 4.4, 4.8);
          const sag = span(u, 4.4, 5, 5.8, 6.4);
          const wig = push * sin(u, 3.2);
          p.add('body', 8 * push, 4 * wig, 0);
          p.add('root', 0, 0, 4 * wig);
          p.add('leg.FL', 30 * sin(u, 3.2) * push);
          p.add('leg.BR', 30 * sin(u, 3.2) * push);
          p.add('leg.FR', -30 * sin(u, 3.2) * push);
          p.add('leg.BL', -30 * sin(u, 3.2) * push);
          p.add('tail.1', 0, 25 * sin(u, 3.2, 0.25) * push);
          p.add('head', 10 * sag);
          p.add('ear.L', -12 * sag);
          p.add('ear.R', -12 * sag);
          this.want.girth = 1 + 0.14 * ease(u, 1, 2.2) * (1 - ease(u, 4.6, 5));
          if (u > 6.4 && this.step < 1) {
            this.step = 1;
            this.hop.kick(1.4);
            this.girth.kick(-8);
            p.kick('body', -300);
          }
          if (u > 7.6 && this.held) this.letGo();
          this.show = u > 6.4 ? 'happy' : sag > 0.3 ? 'sad' : 'cross';
        },
      },
      waddleChase: {
        // Sets off after a crewmate at a determined waddle, nowhere near fast enough, and gives up, panting.
        weight: 0.8,
        length: [11, 11],
        when: () => standing() && this.mates().length > 0,
        start: () => {
          const all = this.mates();
          this.prey = all[Math.floor(Math.random() * all.length)] ?? null;
          this.step = 0;
          this.mark = -9;
        },
        pose: (t) => {
          const prey = this.prey;
          const f = this.frame;
          if (!prey || !f || prey.state !== 'here') return;
          const chasing = t < 6;
          if (chasing && t - this.mark > 0.8) {
            this.mark = t;
            const gap = (this.footprint(f).x + prey.footprint(f).x) * 1.1;
            this.walkTo(prey.s + (this.s < prey.s ? -gap : gap), prey.depth);
          }
          if (!chasing && this.step === 0) {
            this.step = 1;
            this.goal = null;
            this.posture = 'sit';
            this.hop.kick(0.6);
          }
          if (chasing) {
            p.add('body', 6);
            p.add('ear.L', -22);
            p.add('ear.R', -22);
          } else {
            const pant = span(t, 6.2, 6.8, 9.6, 10.6);
            this.want.girth = 1 + 0.05 * Math.sin(t * 11) * pant;
            p.add('head', 14 * pant);
          }
          this.show = chasing ? 'focused' : t < 8.4 ? 'dizzy' : 'sad';
        },
      },
      begMate: {
        // Waddles up to a crewmate and sits, gazing at them, hoping.
        weight: 0.9,
        length: [11, 11],
        when: () => standing() && this.mates().length > 0,
        start: () => {
          const all = this.mates();
          this.prey = all[Math.floor(Math.random() * all.length)] ?? null;
          this.step = 0;
          this.mark = -1;
        },
        pose: (t) => {
          const prey = this.prey;
          const f = this.frame;
          if (!prey || !f || prey.state !== 'here') return;
          if (this.step === 0 && t < 0.2) {
            const gap = (this.footprint(f).x + prey.footprint(f).x) * 1.25 + f.bot * 0.2;
            this.walkTo(prey.s + (this.s < prey.s ? -gap : gap), prey.depth);
            this.step = 1;
          }
          if (this.mark < 0 && t > 1 && !this.walking) {
            this.mark = t;
            this.posture = 'sit';
          }
          if (this.mark < 0) return;
          const u = t - this.mark;
          const way = Math.sign(prey.s - this.s) || 1;
          const k = span(u, 0.3, 1, 7.6, 8.6);
          p.add('head', -8 * k, 40 * way * k, 8 * sin(u, 0.4) * k);
          p.add('leg.FL', (-80 - 6 * sin(u, 2)) * k * ease(u, 2, 3));
          p.add('leg.FR', (-80 + 6 * sin(u, 2)) * k * ease(u, 2, 3));
          this.show = 'sad';
        },
      },
    };
  }

  private reactions(): Record<string, Act> {
    const p = this.puppet;
    return {
      purr: {
        weight: 0,
        length: [3, 4],
        pose: (t) => {
          p.add('head', 4, 0, 8 * sin(t, 0.5));
          this.want.girth = 1 + 0.02 * sin(t, 4);
        },
      },
      love: {
        weight: 0,
        length: [3, 4],
        pose: (t) => p.add('head', -4, 0, 10 * sin(t, 0.6)),
      },
      tummy: {
        // On her back, paws limp in the air, for a tummy rub; the belly light purrs.
        weight: 0,
        length: [6, 6],
        start: () => {
          this.posture = 'stand';
          this.side = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          const k = span(t, 0.2, 1.8, 4.6, 5.8);
          this.want.roll = 172 * this.side * k;
          this.want.low = 0.05 * k;
          p.add('head', 0, 0, -0.8 * 172 * this.side * k);
          p.shift('head', 0, 0.09 * k, 0);
          p.add('leg.FL', -55 * k, 0, 15 * k);
          p.add('leg.FR', -55 * k, 0, -15 * k);
          p.add('leg.BL', -30 * k, 0, 18 * k);
          p.add('leg.BR', -30 * k, 0, -18 * k);
          this.want.girth = 1 + 0.03 * sin(t, 3.5) * k;
        },
      },
      dizzy: {
        weight: 0,
        length: [3.6, 4],
        face: 'dizzy',
        start: () => (this.posture = 'stand'),
        pose: (t) => {
          const k = Math.min(1, t / 0.5) * (1 - ease(t, this.actLength - 0.8, this.actLength));
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
    else if (n === 2 || this.posture === 'lie') this.setAct('startle');
    else this.setAct('purr');
    this.girth.kick(-6);
  }

  protected feel(env: Env): Mood {
    if (this.act === 'sprint' && this.actT > 1.3 && this.actT < 3.6) return 'sleepy';
    return super.feel(env);
  }

  protected pose(dt: number, env: Env) {
    this.frame = env.frame;
    this.env = env;
    const middle = (env.frame.left + env.frame.right) / 2;
    const toward = Math.sign(middle - this.s) || 1;
    if (!['tipOver', 'rollOver', 'tummy', 'tailChase'].includes(this.act)) this.side = -toward;
    const facing = ['peekOver', 'backWall', 'begMate', 'tailChase', 'grump', 'doorStuck'];
    this.anatomy.turn = ['rollOver', 'tummy', 'tipOver'].includes(this.act)
      ? 90
      : facing.includes(this.act)
        ? 0
        : this.posture === 'lie'
          ? 60
          : FATCAT.turn;
    this.spec.gaze = ['grump', 'begMate'].includes(this.act) ? [] : this.gaze;
    const speed: Record<string, number> = {
      stroll: 0.9,
      sprint: 4.5,
      sniff: 0.6,
      backWall: 0.8,
      begMate: 0.8,
      waddleChase: 1.9,
      doorStuck: 0.8,
    };
    this.spec.speed = this.baseSpeed * (speed[this.act] ?? 1);

    this.hover = this.hovered ? this.hover + dt : 0;
    if (
      this.hover > 0.8 &&
      ['idle', 'sit', 'stand', 'loaf', 'lie'].includes(this.act) &&
      this.posture !== 'sit'
    )
      this.setAct('tummy');

    super.pose(dt, env);
    if (this.show) this.expression = this.show;
    this.show = undefined;
    // The waddle: she rocks from foot to foot, the whole heavy body swinging.
    if (this.stride > 1) {
      const rock = Math.min(1, this.stride / (this.heightPx * 0.5));
      this.puppet.add('root', 0, 0, 7 * Math.sin(this.gait) * rock);
      this.puppet.add('body', 0, 6 * Math.sin(this.gait) * rock, 0);
      this.puppet.add('tail.1', 0, -14 * Math.sin(this.gait) * rock);
    }
    // Sitting, she keeps her tail down behind her.
    if (this.posture === 'sit' && !this.walking && this.act === 'idle')
      this.puppet.add('tail.3', 8 * Math.max(0, sin(env.time, 0.25)));
  }

  /** Sitting like a loaf: hind legs out to the sides and the belly on the floor. */
  protected lying(breath: number) {
    const p = this.puppet;
    p.add('leg.FL', 78);
    p.add('leg.FR', 78);
    p.add('leg.BL', -78);
    p.add('leg.BR', -78);
    p.add('head', 10 + 2 * breath);
  }

  protected tailLying() {
    const p = this.puppet;
    const s = this.side;
    p.add('tail.1', -45, 55 * s);
    p.add('tail.2', 0, 0, -35 * s);
    p.add('tail.3', 0, 0, -25 * s + 6 * sin(this.t, 0.15));
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    this.h = 0;
    const turned = this.turning.update(dt, this.want.yaw);
    if (turned) p.turn('root', 0, turned);
    const roll = this.rolling.update(dt, this.want.roll);
    if (roll) p.turn('body', 0, 0, roll);
    const low = this.crouching.update(dt, this.want.low);
    p.shift('body', 0, -low, 0);
    if (Math.abs(this.want.roll) < 90) for (const leg of LEGS) p.shift(leg, 0, low, 0);
    // Her girth: the whole body swells and shrinks a little; the head keeps its size.
    const breath = 1 + 0.012 * sin(env.time, 0.32);
    const g = clamp(this.girth.update(dt, this.want.girth), 0.85, 1.25) * breath;
    p.stretch('body', g, [0, 1, 0], g);
    p.stretch('head', 1 / g, [0, 1, 0], 1 / g);
    this.want.yaw = this.want.low = this.want.roll = 0;
    this.want.girth = 1;
    if (this.held && this.act !== 'doorStuck') this.letGo();
    this.flash = Math.max(0, this.flash - dt);
    this.lights(env);
  }

  /** Lets go of the back-wall door she was stuck in, and it slides shut. */
  private letGo() {
    const d = this.held;
    this.held = null;
    if (d?.user === this) {
      d.want = 0;
      d.user = null;
    }
  }

  /** The belly button shows the mood in colour, and goes through the rainbow when she's dizzy. */
  private lights(env: Env) {
    const rainbow = (rate: number) => RAINBOW[Math.floor(env.time * rate) % RAINBOW.length];
    if (this.act === 'dizzy') this.outfit.beacon(rainbow(6));
    else if (this.act === 'sprint' && this.actT < 1.4) this.outfit.beacon(rainbow(10));
    else if (this.flash > 0) this.outfit.beacon(this.flashColour);
    else this.outfit.beacon(BEACON[this.expression] ?? '#f4f4f1');
  }

  protected onLeave() {
    super.onLeave();
    this.letGo();
    this.h = 0;
  }
}
