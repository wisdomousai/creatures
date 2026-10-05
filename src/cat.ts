import type { Material, Mesh, Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Act, type Character, clamp, type Env, type Frame } from './character';
import type { Expression, FaceLayout } from './face';
import { type Detail, withDetail } from './detail';
import type { FlameStyle, LookName } from './looks';
import { sin, trot } from './moves';
import { type Anatomy, type Mood, Pet } from './pet';
import { Spring } from './spring';

/**
 * Pixel, the robot cat. A TV-headed loaf of a cat with jointed ears, whisker pods
 * whose tips glow, a studded collar with a lit tag and a segmented tail whose collars
 * and tip are lights. She strolls in along the frame line, sits, grooms, stretches and
 * curls up for a nap, and turns her head to follow the mouse after a lazy beat.
 *
 * A cat's tail says how she feels by how high she carries it, not by wagging: straight
 * up with the tip hooked when she's pleased to see you, quivering when she loves you,
 * out behind her when she's calm, low when she's sleepy, low and thumping when she's
 * cross, puffed up when startled; wrapped round her when she's curled up. Her ears
 * swivel after the mouse, prick forward when something catches her eye and go flat
 * when she's been poked once too often. The tail's lights ripple up it when she is
 * pleased, the tag takes the mood's colour, and the whisker tips flash when she sees
 * something.
 *
 * Her repertoire is a cat's: the slow blink, kneading, sitting in a loaf, grooming (and
 * nodding off halfway through), stretching, a scratch behind the ear, chattering at a
 * bird that isn't there, zoomies, a pounce on nothing, the back-arch and hiss when she's
 * poked twice, chasing her tail, rolling over, pouring herself into a tight spot ("if it
 * fits, I sits"), walking the back wall low and dim, watching the back wall or the
 * corner, leaning over the front lip, patting a cup off the edge, batting at the mouse,
 * and butting heads with a crewmate; and, less often, shifting from a loaf into a sphinx,
 * stopping mid-walk for a sudden bath, and bonking her head on the front glass.
 */
export const CAT_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.31, 0.44],
    [0.69, 0.44],
  ],
  rx: 0.085,
  ry: 0.23,
  line: 0.03,
  mouth: [0.5, 0.74],
  kind: 'cat',
};

const TAIL = ['tail.1', 'tail.2', 'tail.3'];
const LEGS = ['leg.FL', 'leg.FR', 'leg.BL', 'leg.BR'];

// Her tail at rest is already carried up in a curve, so "up" is about 0 and "down" well
// below it. No wagging: everything is in the height (carriage) and its rise and fall.
const CAT: Anatomy = {
  tail: TAIL,
  tailAxis: [0, 0.3, -1],
  earsHang: false,
  moods: {
    calm: {
      face: 'neutral',
      carriage: -50,
      bob: [5, 0.2],
      hook: 15,
      flicks: 0.1,
      ears: 0,
      out: 0,
      swivel: 0.3,
    },
    curious: {
      face: 'neutral',
      carriage: -12,
      hook: 35,
      flicks: 1,
      ears: 14,
      out: -4,
      swivel: 0.9,
    },
    happy: { face: 'happy', carriage: 8, hook: 28, ears: 12, out: -6, swivel: 0.3 },
    love: { face: 'love', carriage: 8, hook: 20, quiver: 1, ears: 10, out: -8, swivel: 0 },
    alarmed: { face: 'surprised', carriage: 4, hook: -30, puff: 1, ears: -20, out: 14, swivel: 0 },
    annoyed: {
      face: 'cross',
      carriage: -65,
      bob: [16, 1.4],
      hook: -10,
      flicks: 0.6,
      puff: 0.3,
      ears: -25,
      out: 55,
      swivel: 0,
    },
    sad: { face: 'sad', carriage: -85, ears: -15, out: 30, swivel: 0 },
    sleepy: {
      face: 'sleepy',
      carriage: -75,
      bob: [3, 0.12],
      hook: 5,
      ears: -5,
      out: 20,
      swivel: 0.1,
    },
    asleep: { face: 'asleep', carriage: -75, flicks: 0.15, ears: -5, out: 14, swivel: 0.3 },
  },
  actMoods: {
    purr: 'love',
    startle: 'alarmed',
    hiss: 'alarmed',
    annoyed: 'annoyed',
    groom: 'happy',
    groomNap: 'happy',
    stretch: 'sleepy',
    yawn: 'sleepy',
    nap: 'asleep',
    loaf: 'sleepy',
    knead: 'love',
    slowBlink: 'love',
    scratch: 'happy',
    tailFlick: 'annoyed',
    chatter: 'curious',
    pounce: 'curious',
    prowl: 'curious',
    wallWatch: 'curious',
    lookOver: 'curious',
    batPointer: 'curious',
    listen: 'curious',
    sniff: 'calm',
    knock: 'curious',
    headbutt: 'happy',
    corner: 'calm',
    fits: 'happy',
    roll: 'happy',
    zoomies: 'happy',
    tailChase: 'happy',
    prance: 'happy',
    dizzy: 'calm',
    sphinx: 'sleepy',
    suddenBath: 'happy',
    bonk: 'curious',
  } satisfies Record<string, Mood>,
  lying: 'sleepy',
  hover: 'happy',
  drop: { stand: 0, sit: -0.13, lie: -0.12 },
  sit: -22,
  turn: 45,
};

/** 0 before a, 1 after b, eased between. */
const ease = (t: number, a: number, b: number) => {
  const u = clamp((t - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
};
/** Fades in over `a`..`b`, holds, and fades out over `c`..`d`. */
const span = (t: number, a: number, b: number, c: number, d: number) =>
  ease(t, a, b) * (1 - ease(t, c, d));
/** A bump: up over `a`..`b`, down over `b`..`c`. */
const pulse = (t: number, a: number, b: number, c: number) => ease(t, a, b) * (1 - ease(t, b, c));

/** The pounce, in seconds from its start: wiggle, leap, land. How far, how high (metres). */
const P = { wind: 1.5, leap: 1.95, land: 2.5, end: 3.4 };
const LEAP = { far: 0.5, high: 0.22 };
/** The cup: where it rests, and where it goes (metres, in her floor's axes). */
const CUP_FALL = 0.5;
/** Acts that do their own thing with the tail, so the calm idle tip-tap keeps out. */
const TAIL_BUSY = ['tailFlick', 'tailChase', 'chatter', 'pounce', 'zoomies', 'hiss'];

export class Cat extends Pet {
  static readonly terms =
    'kitty kitties moggy feline peach orange apricot ginger tan cream tv screen whiskers collar tag tail stroll sit groom stretch nap';

  protected readonly anatomy: Anatomy = { ...CAT, drop: { ...CAT.drop } };
  private gaze = this.spec.gaze;
  private frame: Frame | null = null;
  private env: Env | null = null;
  private way = 1;
  private from = 0;
  private hops = 0;
  private hover = 0;
  private mark = -1;
  private step = 0;
  private mate: Character | null = null;
  /** The side she curls up and wraps her tail to (+1 her left): the side facing you. */
  private side = 1;
  private baseSpeed = 1.3;
  /** What acts want this frame: turned about (degrees), crouched (metres), a face, wide pupils. */
  private want: {
    yaw: number;
    low: number;
    face: Expression | null;
    wide: number;
    aside: number | null;
  } = {
    yaw: 0,
    low: 0,
    face: null,
    wide: 0,
    aside: null,
  };
  private turning = new Spring(1.6, 0.8);
  private crouching = new Spring(2.5, 0.6);
  private pupils = new Spring(5, 0.7);
  private squash = new Spring(2.5, 0.5);
  private squashTo = 0;
  private tag = '#f4f4f1';
  private lastTurn = 0;
  private swing = 0;
  /** The cup: how far it has been pushed (0..1) and whether it is out. */
  private cup = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Pixel',
        model: 'cat',
        metres: 0.72,
        width: 0.5,
        size: 0.95,
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
        face: CAT_FACE,
        eyes: 0.61,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.9 },
          { bone: 'body', yaw: 0.2, pitch: 0 },
        ],
        reach: { yaw: 60, pitch: 30 },
        lag: 0.7,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 1.3,
      },
      model,
    );
    this.baseSpeed = this.spec.speed ?? 1.3;
    this.acts = { ...this.commonActs(), ...this.moves(), ...this.tricks(), ...this.fidgets() };
    // The toy ball and cup are put away until a trick needs them.
    for (const prop of ['ball', 'cup']) this.puppet.stretch(prop, 0, [0, 1, 0], 0);
  }

  /**
   * In the colour look, her parts get fine detail (detail.ts): fur on the coat, a grille
   * on the ear backs, rubber on the pads and paws, grain on the joints. The ink and paper
   * looks stay clean.
   */
  dress(look: LookName, flame?: FlameStyle) {
    super.dress(look, flame);
    if (look !== 'colour') return;
    const planes = this.outfit.materials[0]?.clippingPlanes ?? null;
    const own = new Map<string, Material>();
    this.model.traverse((obj) => {
      const mesh = obj as Mesh;
      const role: string | undefined = mesh.userData.role;
      if (!mesh.isMesh || !role || mesh.userData.outline) return;
      const kind: Detail | null = /^Shell_Ear/.test(role)
        ? 'grille'
        : /^(Joint_Paw|Bezel_Pad)/.test(role)
          ? 'rubber'
          : /^(Shell|Joint_Inner)/.test(role)
            ? 'fur'
            : /^Joint(_Stripe)?$/.test(role)
              ? 'grain'
              : null;
      if (!kind) return;
      const key = `${role}/${kind}`;
      let material = own.get(key);
      if (!material) {
        material = withDetail(mesh.material as Material, kind);
        material.clippingPlanes = planes;
        own.set(key, material);
        this.outfit.materials.push(material);
      }
      mesh.material = material;
    });
  }

  /** The crewmates on her floor she could visit. */
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

  private get standing() {
    return this.posture === 'stand' && !this.walking;
  }

  /** Her ears laid back (k 0..1); flat and out to the sides. */
  private earsBack(k: number, out = 30) {
    const p = this.puppet;
    p.add('ear.L', -25 * k, 0, -out * k);
    p.add('ear.R', -25 * k, 0, out * k);
  }

  /** Her ears pricked forward. */
  private earsUp(k: number) {
    this.puppet.add('ear.L', 16 * k, 0, 6 * k);
    this.puppet.add('ear.R', 16 * k, 0, -6 * k);
  }

  /** Hop until `count` hops have been done this act. */
  private hopTo(count: number, strength: number) {
    for (; this.hops < count; this.hops++) this.hop.kick(strength);
  }

  private moves(): Record<string, Act> {
    const p = this.puppet;
    const still = () => !this.walking;
    return {
      groom: {
        weight: 1.5,
        length: [4, 6],
        when: () => this.posture !== 'lie' && still(),
        start: () => (this.posture = 'sit'),
        pose: (t) => {
          // A paw up to her mouth, head down and round to meet it, a lick a beat; then the
          // paw goes over her face, a wash from ear to chin.
          const k = span(t, 0.3, 0.8, this.actLength - 0.8, this.actLength - 0.2);
          const lick = sin(t, 1.8);
          const wash =
            ease(t, 2.4, 2.8) * (1 - ease(t, this.actLength - 1.2, this.actLength - 0.8));
          p.add('leg.FL', (-130 - 12 * lick) * k + 10 * wash * sin(t, 2.4), 0, -12 * k);
          p.add(
            'head',
            (18 + 6 * lick) * k - 24 * wash,
            (16 - 12 * wash) * k,
            -6 * k + 8 * wash * sin(t, 2.4),
          );
          this.earsBack(0.3 * wash);
        },
      },
      slowBlink: {
        // Looks at you, and closes her eyes slowly, the way a cat says she likes you.
        weight: 1.3,
        length: [3.4, 3.4],
        when: still,
        pose: (t) => {
          const k = span(t, 0.2, 0.7, 2.6, 3.2);
          p.add('head', -4 * k, 0, 8 * k);
          p.add('body', -2 * k);
          p.add('head', 5 * pulse(t, 1.9, 2.4, 3.1));
          this.want.face = t > 1 && t < 2.1 ? 'sleepy' : t >= 2.1 && t < 2.8 ? 'happy' : 'neutral';
          this.want.wide = 0.2 * k;
        },
      },
      tailFlick: {
        // Standing very still, ears turned, only the tail tip whipping: a cat making up her mind.
        weight: 1,
        length: [3.4, 3.4],
        when: () => this.posture !== 'lie' && still(),
        pose: (t) => {
          const k = span(t, 0.3, 0.8, 2.8, 3.3);
          this.earsBack(0.5 * k, 10);
          p.add('head', 4 * k, 20 * k * Math.sin(t * 0.9));
          p.add('tail.2', 0, 30 * k * sin(t, 2.2));
          p.add('tail.3', 0, 60 * k * sin(t, 2.2, 0.15), 30 * k * sin(t, 2.2, 0.2));
        },
      },
      knead: {
        // Making biscuits: her front paws pushing in turn, eyes half shut, purring.
        weight: 0.9,
        length: [5.5, 6],
        when: still,
        start: () => (this.posture = 'lie'),
        pose: (t) => {
          const k = ease(t, 0.5, 1.2) * (1 - ease(t, this.actLength - 0.8, this.actLength));
          const a = Math.max(0, sin(t, 1.3));
          const b = Math.max(0, sin(t, 1.3, 0.5));
          p.add('leg.FL', -38 * a * k);
          p.add('leg.FR', -38 * b * k);
          p.add('head', 8 * k, 0, 3 * sin(t, 1.3) * k);
          p.add('body', 2 * (a + b) * k);
          p.add('ear.L', -10 * k);
          p.add('ear.R', -10 * k);
          this.want.face = 'love';
        },
      },
      loaf: {
        // Paws tucked, tail round, a slab of cat, the eyes slowly shutting and opening.
        weight: 1.1,
        length: [7, 11],
        when: still,
        start: () => (this.posture = 'lie'),
        pose: (t) => {
          const k = ease(t, 0.4, 1.2);
          p.add('head', 6 * k, 0, 4 * sin(t, 0.06) * k);
          this.earsBack(0.5 * k, 25);
          this.squashTo = 0.5 * k;
          this.want.face = sin(t, 0.15) > 0.3 ? 'sleepy' : 'neutral';
        },
      },
      chatter: {
        // A bird she can see and can't reach: head up, the jaw-less chatter, tail tip twitching.
        weight: 0.9,
        length: [4.4, 4.4],
        when: () => this.posture !== 'lie' && still(),
        start: () => (this.posture = 'stand'),
        pose: (t) => {
          const k = span(t, 0.3, 0.8, 3.7, 4.2);
          const bird = sin(t, 0.35);
          this.want.low = 0.03 * k;
          p.add('body', 8 * k);
          p.add('leg.FL', -14 * k);
          p.add('leg.FR', -14 * k);
          p.add('head', -36 * k + 5 * Math.sin(t * 60) * k, 40 * bird * k);
          this.earsUp(k);
          p.add('tail.2', 0, 25 * k * sin(t, 4));
          p.add('tail.3', 0, 40 * k * sin(t, 4, 0.1));
          this.want.face = 'surprised';
          this.want.wide = k;
        },
      },
      zoomies: {
        // Off round the whole floor at full speed, ears flat, for no reason at all.
        weight: 0.6,
        length: [6, 6],
        when: () => this.standing,
        start: () => (this.step = -1),
        pose: (t) => {
          const f = this.frame;
          const beat = Math.floor(t / 1.1);
          if (f && beat !== this.step && t < 5) {
            this.step = beat;
            const [lo, hi] = this.span(f);
            this.walkTo(lo + (hi - lo) * (0.1 + 0.8 * Math.random()), Math.random());
          }
          this.earsBack(0.8, 15);
          p.add('body', 4 * sin(t, 2));
          this.want.wide = 1;
          this.want.face = 'happy';
        },
      },
      hiss: {
        // The back-arch: side-on, up on her toes, the tail a bottle brush, a hiss.
        weight: 0.35,
        length: [2.6, 2.6],
        start: () => {
          this.posture = 'stand';
          this.hop.kick(2.4);
          this.goal = null;
        },
        pose: (t) => {
          const k = span(t, 0.05, 0.3, 2, 2.5);
          this.want.aside = 90 * k;
          p.add('body', -22 * k);
          for (const leg of LEGS) p.add(leg, 8 * k);
          p.add('head', 18 * k, 25 * k);
          this.earsBack(k, 40);
          p.add('root', 0, 0, 3 * Math.sin(t * 40) * ease(t, 0.3, 0.5) * (1 - ease(t, 1, 1.2)));
          this.want.face = t > 0.6 && t < 1.9 ? 'cross' : 'surprised';
          this.want.wide = 1;
        },
      },
      // Reactions
      purr: {
        weight: 0,
        length: [2.5, 3.5],
        pose: (t) => {
          p.add('head', 0, 0, 12 * sin(t, 0.5));
          p.add('root', 0.4 * Math.sin(t * 60));
        },
      },
      annoyed: {
        weight: 0,
        length: [3, 4],
        start: () => (this.posture = 'stand'),
        // Low and glaring, weight back on her hind legs.
        pose: () => {
          p.add('body', 6);
          p.add('head', 12);
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
          this.earsBack(0.6 * k, 45);
          for (const bone of TAIL) p.add(bone, -8 * k, 12 * k * sin(t, 0.9, 0.5));
        },
      },
    };
  }

  /** Moving about the box: the tricks that use its floor, walls and crew. */
  private tricks(): Record<string, Act> {
    const p = this.puppet;
    const still = () => !this.walking;
    return {
      prowl: {
        // Low and dark along the back wall, one slow paw at a time.
        weight: 0.9,
        length: [7, 7],
        when: () => this.standing,
        start: () => this.walkTo(this.across(1.8 + Math.random()), 0.94),
        pose: (t) => {
          const k = ease(t, 0.3, 1);
          this.want.low = 0.05 * k;
          p.add('head', 18 * k);
          this.earsBack(0.6 * k, 10);
          p.add('tail.1', -14 * k);
          this.want.face = 'focused';
          this.want.wide = 0.6 * k;
        },
      },
      wallWatch: {
        // To the back wall to sit with her back to us, watching something we can't see.
        weight: 0.8,
        length: [10, 10],
        when: () => this.standing,
        start: () => {
          this.mark = -1;
          this.walkTo(this.across(0.6, Math.random() < 0.5), 0.96);
        },
        pose: (t) => {
          if (this.mark < 0 && t > 0.6 && !this.walking) this.mark = t;
          if (this.mark < 0) return;
          const u = t - this.mark;
          this.posture = u > 0.5 ? 'sit' : 'stand';
          const face = ease(u, 0, 0.8) * (1 - ease(u, 7, 7.8));
          this.want.yaw = 180 * face;
          const look = span(u, 1.5, 2, 5.6, 6.2);
          p.add('head', -10 * face, 45 * sin(u, 0.2) * look);
          p.add('tail.3', 0, 0, 24 * sin(u, 0.9) * look);
          // A look back at us, over her shoulder.
          const back = span(u, 5.6, 6.2, 6.8, 7.4);
          p.add('head', 0, 100 * back);
          this.want.face = back > 0.5 ? 'happy' : 'neutral';
        },
      },
      lookOver: {
        // To the front lip, to look over it and down at the frame line, one paw patting the edge.
        weight: 0.7,
        length: [7, 7],
        when: () => this.standing,
        start: () => {
          this.mark = -1;
          this.walkTo(this.across(0.5, Math.random() < 0.5), 0);
        },
        pose: (t) => {
          if (this.mark < 0 && t > 0.6 && !this.walking) this.mark = t;
          if (this.mark < 0) return;
          const u = t - this.mark;
          const k = span(u, 0, 0.8, 5, 5.8);
          p.add('body', 12 * k);
          p.add('leg.FL', -22 * k - 30 * k * Math.max(0, sin(u, 0.7)));
          p.add('leg.FR', -22 * k);
          p.add('head', 34 * k + 6 * sin(u, 0.8) * k, 22 * sin(u, 0.35) * k);
          this.earsUp(k);
          this.want.face = sin(u, 0.35) > 0.6 ? 'surprised' : 'neutral';
        },
      },
      corner: {
        // Backs into the far corner of the box, sits facing it, and looks round when called.
        weight: 0.7,
        length: [10, 10],
        when: () => this.standing,
        start: () => {
          this.mark = -1;
          const f = this.frame;
          const [lo, hi] = f ? this.span(f) : [this.s, this.s];
          const left = this.s - lo < hi - this.s;
          this.way = left ? -1 : 1;
          this.walkTo(left ? lo : hi, 0.97);
        },
        pose: (t) => {
          if (this.mark < 0 && t > 0.8 && !this.walking && this.depth > 0.9) this.mark = t;
          if (this.mark < 0) return;
          const u = t - this.mark;
          // Faces the corner: the back wall, turned a little toward the side wall.
          const face = ease(u, 0, 0.8) * (1 - ease(u, 6.6, 7.4));
          this.want.yaw = (180 - 55 * this.way) * face;
          this.posture = u > 0.6 && u < 7 ? 'sit' : 'stand';
          const round = span(u, 3, 3.6, 4.6, 5.2) + span(u, 5.6, 6, 6.4, 6.8);
          p.add('head', 0, (this.way > 0 ? -1 : 1) * 110 * round);
          this.want.face = round > 0.5 ? 'happy' : 'neutral';
          p.add('tail.3', 0, 0, 12 * sin(u, 0.25));
        },
      },
      batPointer: {
        // Watches the mouse, wiggles her rump, and swats at it.
        weight: 1,
        length: [6, 6],
        when: () => this.standing && !!this.env?.pointer.present,
        start: () => (this.step = 0),
        pose: (t) => {
          const env = this.env;
          if (!env) return;
          const eye = this.eyePoint(env.frame);
          const dir = Math.sign(env.pointer.x - eye.x) || 1;
          const k = span(t, 0.3, 0.9, 5, 5.7);
          this.want.aside = dir * 70;
          this.want.low = 0.02 * k;
          const wig = span(t, 0.9, 1.3, 3, 3.3);
          p.add('body', (10 + 4 * Math.sin(t * 16) * wig) * k);
          p.add('root', 0, 0, 4 * wig * Math.sin(t * 16));
          p.add('head', 6 * k);
          const swat = pulse(t % 0.9, 0.05, 0.25, 0.5) * ease(t, 3, 3.1) * (1 - ease(t, 5, 5.1));
          // Left paw when the mouse is to the left of her, the right when it is to the right.
          const paw = dir * (this.env && this.middle() < this.s ? -1 : 1) > 0 ? 'leg.FL' : 'leg.FR';
          p.add(paw, -85 * swat);
          p.add('body', 6 * swat);
          this.earsUp(k);
          this.want.face = 'focused';
          this.want.wide = k;
          const beat = Math.floor((t - 3) / 0.9);
          if (t > 3 && beat > this.step) {
            this.step = beat;
            this.hop.kick(0.6);
          }
        },
      },
      headbutt: {
        // Walks up to a crewmate, bumps her head against theirs, and rubs along them.
        weight: 0.9,
        length: [9, 9],
        when: () => this.standing && this.mates().length > 0,
        start: () => {
          const all = this.mates();
          this.mate = all[Math.floor(Math.random() * all.length)] ?? null;
          this.step = 0;
          this.mark = -1;
        },
        pose: (t) => {
          const mate = this.mate;
          const f = this.frame;
          if (!mate || !f || mate.state !== 'here') return;
          const dir = Math.sign(mate.s - this.s) || 1;
          if (this.mark < 0) {
            if (this.step % 20 === 0) {
              const gap = (this.footprint(f).x + mate.footprint(f).x) * 1.15 + f.bot * 0.1;
              this.walkTo(mate.s - dir * gap, mate.depth);
            }
            this.step++;
            if (t > 1 && !this.walking) this.mark = t;
            this.earsUp(0.5);
            p.add('tail.1', 20);
            return;
          }
          const u = t - this.mark;
          this.want.aside = dir * 88;
          // Two bumps, then a long rub, tail up.
          const bump = pulse(u, 0.3, 0.6, 0.9) + pulse(u, 1.1, 1.4, 1.7);
          const rub = span(u, 2, 2.4, 4.2, 4.8);
          p.add('head', 10 * bump - 6 * rub, -dir * 6 * bump, dir * 14 * rub * sin(u, 1.2));
          p.add('body', 5 * bump);
          p.add('tail.1', 25 * ease(u, 0.2, 0.7));
          this.earsBack(0.3 * bump, 8);
          this.want.face = 'love';
          this.hops = 0;
        },
      },
      pounce: {
        // Wiggles her rump, and leaps on nothing at all.
        weight: 0.9,
        length: [P.end, P.end],
        when: () => this.standing && this.room() > 0,
        start: () => {
          this.way = this.room();
          this.goal = null;
        },
        pose: (t) => {
          const k = ease(t, 0.2, 0.6);
          if (t < P.leap) {
            const rear = ease(t, 0.6, P.leap);
            this.want.aside = this.way * 88;
            this.want.low = 0.04 * k;
            p.add('body', 12 * k);
            p.add('leg.FL', -35 * k);
            p.add('leg.FR', -35 * k);
            p.add('head', -14 * k);
            p.add('root', 0, 0, 6 * Math.sin(t * 20) * rear * (1 - ease(t, P.wind, P.leap)));
            p.add('tail.1', 8 * rear, 25 * Math.sin(t * 12) * rear);
            // Coiled just before the spring: hips sunk, weight on the back legs.
            const coil = ease(t, P.leap - 0.4, P.leap - 0.05);
            p.add('body', 8 * coil);
            p.add('leg.BL', -14 * coil);
            p.add('leg.BR', -14 * coil);
            this.want.low = 0.06 * k + 0.02 * coil;
            this.step = 0;
            this.want.face = 'focused';
            this.want.wide = k;
          } else if (t < P.land) {
            const u = ease(t, P.leap, P.land);
            this.want.aside = this.way * 88;
            p.add('leg.FL', -85 + 40 * u);
            p.add('leg.FR', -80 + 40 * u);
            p.add('leg.BL', 40);
            p.add('leg.BR', 40);
            p.add('body', -8 * Math.sin(u * Math.PI));
            p.add('tail.1', 14);
            this.want.face = 'focused';
            this.want.wide = 1;
          } else {
            const u = ease(t, P.land, P.land + 0.4);
            // Lands soft: a small dip, the front legs taking it, then she straightens.
            if (this.step === 0) {
              this.step = 1;
              this.hop.kick(0.7);
            }
            const dip = pulse(t, P.land, P.land + 0.15, P.land + 0.6);
            this.want.low = 0.05 * dip;
            p.add('body', 6 * dip);
            p.add('head', 6 * dip);
            this.want.aside = this.way * 88;
            p.add('leg.FL', -30 * (1 - u));
            this.want.face = 'happy';
          }
        },
      },
      knock: {
        // Pats a cup toward the edge, looks at us, pats it again, and over it goes.
        weight: 0.8,
        length: [9, 9],
        when: () => this.standing,
        start: () => {
          this.mark = -1;
          this.walkTo(this.across(0.5, Math.random() < 0.5), 0.05);
        },
        pose: (t) => {
          if (this.mark < 0 && t > 0.8 && !this.walking) this.mark = t;
          if (this.mark < 0) return;
          const u = t - this.mark;
          const k = span(u, 0, 0.6, 6.6, 7.4);
          this.want.aside = 0;
          this.cup = ease(u, 0.3, 0.6) * (1 - ease(u, 6, 6.1));
          p.add('body', 8 * k);
          p.add('head', 14 * k);
          const pat = pulse(u, 1.2, 1.5, 1.9) + pulse(u, 4.6, 4.9, 5.3);
          p.add('leg.FL', -60 * pat * k);
          const glance = span(u, 2.3, 2.8, 3.8, 4.3);
          p.add('head', -22 * glance, 50 * glance * this.way);
          this.want.face = glance > 0.5 ? 'wink' : 'focused';
          this.want.wide = 0.7 * k;
          this.earsUp(0.4 * k);
        },
      },
      fits: {
        // If it fits, she sits: pours herself into the smallest possible loaf.
        weight: 0.8,
        length: [7, 7],
        when: still,
        start: () => (this.posture = 'sit'),
        pose: (t) => {
          const k = span(t, 0.5, 1.6, 5.4, 6.3);
          this.squashTo = k;
          this.want.low = 0.04 * k;
          p.add('head', 10 * k, 0, 6 * k);
          p.add('root', 0, 0, 1.5 * Math.sin(t * 2 * Math.PI * 0.5) * k);
          this.want.face = 'happy';
        },
      },
      sniff: {
        // Nose down, zigzagging over the floor after a scent.
        weight: 0.9,
        length: [5.5, 5.5],
        when: () => this.standing,
        start: () => {
          this.step = 0;
          this.walkTo(this.across(1 + Math.random(), Math.random() < 0.5), Math.random() * 0.6);
        },
        pose: (t) => {
          const k = ease(t, 0, 0.5);
          if (t > 2.6 && this.step === 0) {
            this.step = 1;
            this.walkTo(this.across(1 + Math.random(), Math.random() < 0.5), Math.random() * 0.6);
          }
          p.add('body', 6 * k);
          p.add('head', 34 * k + 5 * sin(t, 5) * k);
          p.add('tail.1', 10 * k);
        },
      },
      prance: {
        // Head up, tail up: a cat who knows she looks good.
        weight: 0.8,
        length: [4.6, 4.6],
        when: () => this.standing,
        start: () =>
          this.walkTo(
            this.across(2.2 + Math.random() * 1.5, Math.random() < 0.5),
            0.1 + Math.random() * 0.4,
          ),
        pose: (t) => {
          const k = ease(t, 0, 0.4);
          if (this.walking) trot(p, this.gait, 1, 22);
          p.add('head', -10 * k);
          this.earsUp(k);
          p.add('tail.1', 30 * k);
          this.want.face = 'happy';
        },
      },
      sphinx: {
        // Lies down as a loaf, then shifts into a sphinx: front paws slid out, chest and
        // head up, watching; and sinks back into the loaf.
        weight: 0.6,
        length: [10, 10],
        when: still,
        start: () => (this.posture = 'lie'),
        pose: (t) => {
          const k = span(t, 1, 2.4, 6.6, 8);
          p.add('leg.FL', -160 * k);
          p.add('leg.FR', -160 * k);
          p.add('body', -6 * k);
          p.add('head', -18 * k, 0, 0);
          p.add('head', 0, 22 * pulse(t, 3, 3.8, 4.6) - 22 * pulse(t, 4.8, 5.6, 6.4));
          this.earsUp(0.6 * k);
          this.want.wide = 0.5 * k;
          this.want.face = t > 7 ? 'sleepy' : k > 0.5 ? 'neutral' : 'sleepy';
        },
      },
      suddenBath: {
        // Strolling along, she stops dead, sticks a hind leg up and washes it, then walks
        // on as if nothing happened.
        weight: 0.5,
        length: [7.5, 7.5],
        when: () => this.standing,
        start: () => {
          this.step = 0;
          this.walkTo(this.across(1.5 + Math.random(), Math.random() < 0.5), Math.random() * 0.4);
        },
        pose: (t) => {
          if (this.step === 0 && t > 1.6) {
            this.step = 1;
            this.goal = null;
          }
          if (this.step === 1 && t > 5.6) {
            this.step = 2;
            this.walkTo(this.across(1, Math.random() < 0.5), 0.2);
          }
          const k = span(t, 1.9, 2.3, 4.9, 5.4);
          const lick = sin(t, 2.4);
          p.add('leg.BL', (-105 + 8 * lick) * k);
          p.add('body', -10 * k);
          p.add('head', (44 + 6 * lick) * k, 10 * k);
          p.add('leg.FL', 6 * k);
          p.add('leg.FR', 6 * k);
          // Then a dignified glance, as if it never happened.
          const glance = span(t, 5.2, 5.7, 6.2, 6.8);
          p.add('head', -6 * glance, 25 * glance);
          this.want.face = k > 0.5 ? 'sleepy' : glance > 0.5 ? 'neutral' : null;
        },
      },
      bonk: {
        // Trots up to the front lip and walks headfirst into the glass; sits stunned,
        // rubs her head with a paw, and pretends it was on purpose.
        weight: 0.4,
        length: [8, 8],
        when: () => this.standing,
        start: () => {
          this.mark = -1;
          this.step = 0;
          this.walkTo(this.across(0.4, Math.random() < 0.5), 0);
        },
        pose: (t) => {
          if (this.mark < 0 && t > 0.6 && !this.walking) this.mark = t;
          if (this.mark < 0) return;
          const u = t - this.mark;
          const face = ease(u, 0, 0.6);
          this.want.aside = 45 * (1 - face);
          // Leans back, then the bonk, and a recoil that settles.
          const lean = pulse(u, 0.6, 1.1, 1.3);
          const hit = pulse(u, 1.1, 1.3, 1.9);
          if (this.step === 0 && u > 1.3) {
            this.step = 1;
            this.hop.kick(0.9);
          }
          p.add('body', (-8 * lean + 10 * hit) * face);
          p.add('head', (-8 * lean + 22 * hit) * face);
          const stun = span(u, 1.5, 1.9, 4.6, 5.2);
          this.earsBack(0.7 * stun, 30);
          p.add('root', 0, 0, 3 * Math.sin(u * 30) * pulse(u, 1.3, 1.4, 1.9));
          // A paw to the sore spot.
          const rub = span(u, 2.4, 3, 4.6, 5.2);
          p.add('leg.FL', (-130 + 8 * sin(u, 2.4)) * rub, 0, -10 * rub);
          p.add('head', 18 * rub);
          this.want.face =
            u > 1.3 && u < 2.2 ? 'dizzy' : rub > 0.5 ? 'sad' : u > 5.2 ? 'cross' : null;
        },
      },
    };
  }

  /** Small things on the spot: paws, ears, back, and the odd tumble. */
  private fidgets(): Record<string, Act> {
    const p = this.puppet;
    const still = () => !this.walking;
    return {
      stretch: {
        // A little settle, then front paws out and chest down, rump up and quivering; then
        // she rises onto her toes and pushes one hind leg out behind her.
        weight: 1,
        length: [4.6, 4.6],
        when: () => this.standing,
        pose: (t) => {
          const settle = pulse(t, 0, 0.35, 0.6);
          const front = span(t, 0.5, 1.3, 2.0, 2.7);
          const back = span(t, 2.4, 3.1, 3.9, 4.5);
          p.add('body', 4 * settle + 15 * front);
          p.add('leg.FL', -60 * front);
          p.add('leg.FR', -60 * front);
          p.add('leg.BL', -15 * front);
          p.add('leg.BR', -15 * front);
          p.add('head', -28 * front + 3 * settle);
          p.add('root', 0, 0, 1.5 * Math.sin(t * 30) * front * ease(t, 1.3, 1.5));
          p.add('tail.1', 20 * front);
          p.add('leg.BL', 30 * back);
          p.add('body', -8 * back);
          p.add('head', -12 * back);
          p.add('leg.FL', 6 * back);
          p.add('leg.FR', 6 * back);
          p.add('tail.2', 0, 0, 10 * back * sin(t, 3));
          this.earsBack(0.4 * front, 10);
          this.want.face = back > 0.4 ? 'happy' : front > 0.4 ? 'sleepy' : null;
        },
      },
      yawn: {
        // Head back, a big cat yawn, eyes screwed shut; a shake of the ears.
        weight: 0.8,
        length: [3, 3],
        when: () => this.posture !== 'lie' && still(),
        pose: (t) => {
          const open = span(t, 0.3, 0.9, 1.9, 2.4);
          p.add('head', -24 * open, 0, 4 * open);
          this.earsBack(0.5 * open, 20);
          p.add('ear.L', 0, 0, 30 * pulse(t, 2.4, 2.5, 2.7));
          this.want.face = open > 0.3 ? 'surprised' : 'sleepy';
          this.want.wide = 0;
        },
      },
      scratch: {
        // Sits, and scratches behind her ear with a hind foot, eyes shut in bliss.
        weight: 0.9,
        length: [4.4, 4.4],
        when: still,
        start: () => (this.posture = 'sit'),
        pose: (t) => {
          const k = span(t, 0.3, 0.8, 3.6, 4.2);
          p.add('leg.BL', -55 * k + 22 * k * Math.sin(t * 2 * Math.PI * 6));
          p.add('head', 6 * k, -14 * k, 14 * k + 3 * Math.sin(t * 2 * Math.PI * 6) * k);
          p.add('body', 6 * k);
          this.earsBack(0.4 * k, 20);
          this.want.face = 'sleepy';
        },
      },
      groomNap: {
        // Grooming a paw, slower and slower, nods off mid-lick, and jerks awake.
        weight: 0.8,
        length: [8, 8],
        when: () => this.posture !== 'lie' && still(),
        start: () => (this.posture = 'sit'),
        pose: (t) => {
          const k = ease(t, 0.3, 0.8);
          const sleep = ease(t, 2.5, 5) * (1 - ease(t, 6.2, 6.3));
          const lick = sin(t * (1 - 0.7 * sleep), 1.8);
          const jerk = pulse(t, 6.2, 6.4, 6.8);
          const gone = k * (1 - ease(t, 5, 5.6) * (1 - ease(t, 6.2, 6.3))) + 0.4 * ease(t, 5, 5.6);
          p.add('leg.FL', (-130 - 10 * lick) * gone, 0, -12 * gone);
          p.add(
            'head',
            (18 + 5 * lick + 22 * sleep) * k - 30 * jerk,
            16 * gone,
            -6 * gone + 14 * sleep,
          );
          this.earsBack(0.6 * sleep, 20);
          p.add('body', 8 * sleep - 6 * jerk);
          this.want.face = sleep > 0.7 ? 'asleep' : jerk > 0.2 ? 'surprised' : 'happy';
          if (t > 6.2 && t < 6.25) this.hop.kick(1);
        },
      },
      roll: {
        // Flops over onto her back, paws in the air, and wiggles.
        weight: 0.6,
        length: [5, 5],
        when: still,
        start: () => {
          this.posture = 'lie';
          this.way = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          const k = span(t, 0.8, 1.6, 3.8, 4.6);
          p.add('leg.FL', -110 * k + 20 * k * sin(t, 1.5));
          p.add('leg.FR', -110 * k - 20 * k * sin(t, 1.5));
          p.add('leg.BL', 100 * k + 15 * k * sin(t, 1.2));
          p.add('leg.BR', 100 * k - 15 * k * sin(t, 1.2));
          p.add('head', 25 * k, 0, 15 * k * sin(t, 0.8));
          this.want.face = 'love';
        },
      },
      tailChase: {
        // Spins after her own tail, round and round, then staggers.
        weight: 0.6,
        length: [5, 5],
        when: () => this.standing,
        start: () => {
          this.goal = null;
          this.way = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          const k = span(t, 0.3, 0.9, 4.1, 4.8);
          const run = sin(t, 3.2) * 32 * k;
          p.add('leg.FL', run);
          p.add('leg.BR', run);
          p.add('leg.FR', -run);
          p.add('leg.BL', -run);
          p.add('head', 16 * k, 55 * this.way * k);
          p.add('tail.1', 0, 30 * this.way * k);
          this.want.yaw = this.way * 1080 * ease(t, 0.5, 4.3);
          this.want.face = 'happy';
        },
      },
      listen: {
        // Ears swivelling one after the other, head cocked.
        weight: 1,
        length: [3.5, 5],
        when: () => this.posture !== 'lie' && still(),
        pose: (t) => {
          const tilt = [12, -8, 14, -6, 8][Math.floor(t / 0.8) % 5];
          p.add('head', 6, 0, tilt);
          p.add('ear.L', 8, 30 * sin(t, 0.6), 0);
          p.add('ear.R', 8, 30 * sin(t, 0.6, 0.35), 0);
        },
      },
    };
  }

  /** Where a pounce can go (toward the middle, +1 right, -1 left), or 0 if no room. */
  private room() {
    const f = this.frame;
    if (!f) return 0;
    const way = this.s < (f.left + f.right) / 2 ? 1 : -1;
    const [lo, hi] = this.span(f);
    const reach = (LEAP.far * 1.2 + this.spec.width) * this.px;
    if ((way > 0 ? hi - this.s : this.s - lo) <= reach) return 0;
    const blocked = this.mates().some((o) => {
      const along = (o.s - this.s) * way;
      return along > -this.px * 0.3 && along < reach && Math.abs(o.depth - this.depth) < 0.4;
    });
    return blocked ? 0 : way;
  }

  poke() {
    if (this.state !== 'here') return;
    const n = this.poked();
    if (n >= 3) this.setAct('dizzy');
    else if (n === 2) this.setAct('hiss');
    // Poked awake, or poked while cross: she jumps.
    else if (this.posture === 'lie' || this.act === 'annoyed') this.setAct('startle');
    else this.setAct('purr');
  }

  protected pose(dt: number, env: Env) {
    this.frame = env.frame;
    this.env = env;
    const toward = Math.sign(this.middle() - this.s) || 1;
    this.side = -toward;
    // Facing: toward the middle, or side-on to what she is after.
    const aside = this.want.aside ?? (this.posture === 'lie' ? 65 * toward : CAT.turn * toward);
    this.anatomy.turn = aside * toward;
    const speed: Record<string, number> = { prowl: 0.4, sniff: 0.55, prance: 0.9, zoomies: 2.4 };
    this.spec.speed = this.baseSpeed * (speed[this.act] ?? 1);
    this.spec.gaze = ['pounce', 'chatter', 'wallWatch', 'corner', 'knock'].includes(this.act)
      ? []
      : this.gaze;

    this.hover = this.hovered ? this.hover + dt : 0;
    if (
      this.hover > 0.8 &&
      ['idle', 'sit', 'listen', 'stand'].includes(this.act) &&
      this.posture !== 'lie'
    )
      this.setAct('slowBlink');

    super.pose(dt, env);
    if (this.want.face) this.expression = this.want.face;
    // Sitting, her tail lifts its tip and taps now and then.
    if (this.posture === 'sit' && !TAIL_BUSY.includes(this.act))
      this.puppet.add('tail.3', 14 * Math.max(0, sin(env.time, 0.3)));
    // Wide-eyed: the pupils open (a cat in the dark, or hunting).
    const wide = this.mood === 'alarmed' ? 1 : this.want.wide;
    if (this.face) this.face.dilate = clamp(this.pupils.update(dt, wide), 0, 1);
  }

  /** Curled up, her tail wraps round to one side. */
  protected tailLying() {
    const p = this.puppet;
    const s = this.side;
    p.add('tail.1', -35, 55 * s);
    p.add('tail.2', 0, 0, -35 * s);
    p.add('tail.3', 0, 0, (-25 + 8 * sin(this.t, 0.15)) * s);
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    const t = this.actT;
    this.h = 0;
    if (this.act === 'pounce') {
      const px = this.px;
      if (t < P.leap) this.from = this.s;
      else if (t < P.land) {
        const u = (t - P.leap) / (P.land - P.leap);
        this.s = this.from + this.way * LEAP.far * px * ease(t, P.leap, P.land);
        this.h = 4 * LEAP.high * u * (1 - u) * px;
        p.turn('root', -12 * Math.sin(u * Math.PI));
      } else this.s = this.from + this.way * LEAP.far * px;
      if (this.face && t < P.land) this.face.look.x = this.face.look.y = 0;
    }
    if (this.act === 'chatter' && this.face) {
      this.face.look.y = -0.9;
      this.face.look.x = 0.7 * sin(t, 0.35);
    }
    // Turned about to face the wall, or spinning after her tail.
    const turned = this.turning.update(dt, this.want.yaw);
    if (turned) p.turn('root', 0, turned);
    // The tail trails behind a turn and swings back after it.
    const swing = (turned - this.lastTurn) / Math.max(dt, 1e-3);
    this.lastTurn = turned;
    this.swing += (clamp(swing, -400, 400) - this.swing) * Math.min(1, dt * 6);
    p.add('tail.1', 0, -this.swing * 0.06);
    p.add('tail.2', 0, -this.swing * 0.05);
    // Crouching low: the body sinks and the legs sink into it, so the feet stay put.
    const low = this.crouching.update(dt, this.want.low);
    p.shift('body', 0, -low, 0);
    for (const leg of LEGS) p.shift(leg, 0, low, 0);
    // Poured into a loaf: wide and flat.
    const flat = this.squash.update(dt, this.squashTo);
    if (flat > 0.01) p.stretch('body', 1 - 0.1 * flat, [0, 0, 1], 1 + 0.18 * flat);
    else p.stretch('body', 1, [0, 0, 1], 1);
    this.cupOut();
    this.want.yaw = this.want.low = this.want.wide = 0;
    this.want.face = null;
    this.want.aside = null;
    this.squashTo = 0;
    this.lights(dt, env.time);
  }

  /** The cup she knocks off the edge: pushed toward the front lip, tipping, and gone. */
  private cupOut() {
    const p = this.puppet;
    const t = this.actT;
    if (this.act !== 'knock' || this.mark < 0) {
      p.stretch('cup', 0, [0, 1, 0], 0);
      this.cup = 0;
      return;
    }
    const u = t - this.mark;
    // Two pats push it; the last sends it over.
    const push = ease(u, 1.2, 1.5) * 0.25 + ease(u, 4.6, 4.9) * 0.25;
    const fall = ease(u, 5, 5.7);
    p.stretch('cup', this.cup, [0, 1, 0], this.cup);
    p.shift('cup', 0.12 + push * 0.4, -0.5 * fall * fall, push * CUP_FALL + 0.14 * fall);
    p.turn('cup', 0, 0, 90 * ease(u, 4.7, 5.2) * (this.way || 1));
  }

  /** The lights: the tail tip (0), the tail's collars (1-2), the ear hinges (3), the whisker tips (4), and the tag. */
  private lights(dt: number, time: number) {
    const t = this.actT;
    const a = this.act;
    const wave = (i: number, hz: number) =>
      0.5 + 0.5 * Math.sin(2 * Math.PI * (time * hz - i * 0.22));
    let tip = 0.5 + 0.1 * Math.sin(time * 0.8);
    const bands = [1, 2].map((i) => 0.1 + 0.35 * Math.max(0, wave(i, 0.25) ** 6));
    let ears = 0.3;
    let whisker = 0.25 + 0.2 * Math.max(0, Math.sin(time * 0.9));
    let tone: string | undefined;
    let tag = BEACON[this.expression] ?? '#f4f4f1';
    const rainbow = (rate: number) => RAINBOW[Math.floor(time * rate) % RAINBOW.length];
    if (a === 'prowl') {
      tip = 0.03;
      bands.fill(0);
      ears = 0;
      whisker = 0.1;
    } else if (a === 'chatter') {
      tip = Math.sin(time * 26) > 0 ? 1 : 0.2;
      bands.forEach((_, i) => (bands[i] = (Math.floor(t * 3.5) + i) % 2 ? 1 : 0.1));
      whisker = Math.sin(time * 18) > 0 ? 1 : 0.1;
      tone = rainbow(7);
      ears = 1;
    } else if (a === 'hiss') {
      const on = Math.sin(time * 30) > 0 ? 1 : 0.3;
      tip = on;
      bands.fill(on);
      whisker = 1;
      ears = 1;
      tone = BEACON.surprised;
    } else if (a === 'dizzy' || a === 'tailChase') {
      tip = 1;
      tone = rainbow(5);
      bands.forEach((_, i) => (bands[i] = wave(i, 3)));
    } else if (a === 'zoomies' || a === 'prance') {
      tip = 0.9;
      bands.forEach((_, i) => (bands[i] = wave(i, 2.5)));
      tone = a === 'zoomies' ? rainbow(6) : BEACON.happy;
      whisker = 0.8;
    } else if (a === 'pounce' || a === 'batPointer' || a === 'knock') {
      tip = 0.6 + 0.4 * Math.max(0, Math.sin(time * 8));
      whisker = 1;
      ears = 0.9;
      tone = BEACON.focused;
    } else if (a === 'slowBlink' || a === 'knead' || a === 'headbutt' || this.mood === 'love') {
      // A slow ripple up the tail, a purr.
      tip = 0.6 + 0.4 * wave(0, 0.8);
      bands.forEach((_, i) => (bands[i] = wave(2 - i, 0.8)));
      tone = BEACON.love;
    } else if (this.mood === 'asleep' || a === 'loaf') {
      tip = 0.1 + 0.25 * (0.5 + 0.5 * Math.sin(time * 1.1));
      bands.fill(tip * 0.4);
      whisker = 0;
      ears = 0.05;
    } else if (this.mood === 'happy') {
      tip = 0.85 + 0.15 * Math.sin(time * 3);
      tone = BEACON.happy;
    } else if (this.mood === 'alarmed') {
      tip = Math.sin(time * 30) > 0 ? 1 : 0.4;
      bands.fill(tip);
      tone = BEACON.surprised;
    } else if (this.mood === 'curious') {
      tip = 0.9;
      ears = 0.7;
      whisker = 0.6;
    } else if (this.mood === 'sleepy') tip = 0.3;
    else if (this.walking) tip = 0.8;
    if (a === 'tailFlick') tip = Math.sin(t * 2 * Math.PI * 2.2) > 0 ? 1 : 0.25;
    this.outfit.dot(0, clamp(tip, 0, 1), tone);
    bands.forEach((level, i) => this.outfit.dot(i + 1, clamp(level, 0, 1), tone));
    this.outfit.dot(3, clamp(ears, 0, 1), tone);
    this.outfit.dot(4, clamp(whisker, 0, 1), tone);
    // The tag takes the mood's colour, easing over.
    if (tone && this.mood !== 'calm') tag = tone;
    this.tag = tag;
    this.outfit.beacon(tag);
    void dt;
  }

  protected onLeave() {
    super.onLeave();
    this.h = 0;
  }
}
