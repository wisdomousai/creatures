import type { Material, Mesh, Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Act, type Character, clamp, type Env, type Frame } from './character';
import { type Detail, withDetail } from './detail';
import type { Expression, FaceLayout } from './face';
import type { FlameStyle, LookName } from './looks';
import { sin } from './moves';
import { type Anatomy, type Feeling, type Mood, Pet, type Posture } from './pet';
import { Spring } from './spring';

/**
 * Byte, the robot dog. A TV-headed dog of rounded boxes: ear flaps on hinged joints
 * with a light in each, a snout with a lit nose and a jaw that opens, a studded collar
 * with a tag that takes the mood's colour, seams and bolts on the body, pads and toe
 * beads on his paws, and a tail in three segments with a lit collar at each joint and
 * a glowing tip. He trots in along the frame line, sits, scratches behind an ear,
 * sniffs about, and follows the mouse with his head after a beat.
 *
 * A dog's tail says how he feels by wagging: a lazy wag when he's calm, a fast one when
 * he's happy, the whole rear end wiggling along with it when he loves you; a small
 * quick wag with his head tilted and ears pricked when something has caught his eye,
 * stiff and high when he's alarmed, tucked low with his ears back when you've gone.
 * His ears are soft flaps on springy joints, so they flop about when he moves his head.
 * The tail's lights run up it as it wags, his nose lights when he sniffs, and the ear
 * hinges flash when he hears something.
 *
 * His repertoire is a dog's: a play bow, rolling over, shaking a paw, begging, turning
 * round and round before lying down, digging, following a trail along the back wall,
 * zoomies, a howl, the head tilt, a sneeze, shaking himself off, scratching, the
 * stretch, chasing his tail, a pounce on nothing, snapping at a fly, freezing to point,
 * a sigh, a yawn, prancing, sniffing, barking, dreaming while he sleeps (running paws,
 * muffled woofs), peeking over the front lip, watching from the back wall, and nudging
 * a crewmate with his nose.
 */
export const DOG_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.3, 0.52],
    [0.7, 0.52],
  ],
  rx: 0.08,
  ry: 0.27,
  line: 0.035,
  mouth: null,
};

const TAIL = ['tail.1', 'tail.2', 'tail.3'];
const LEGS = ['leg.FL', 'leg.FR', 'leg.BL', 'leg.BR'];

// His tail at rest points up and back. Everything here is in the wag.
const DOG: Anatomy = {
  tail: TAIL,
  tailAxis: [0, 0.8, -0.6],
  earsHang: true,
  moods: {
    calm: { face: 'neutral', carriage: -10, wag: [14, 1.3], ears: 0, out: 6, swivel: 0.2 },
    curious: { face: 'neutral', carriage: 12, wag: [7, 2.8], ears: 8, out: 30, swivel: 0.4 },
    happy: { face: 'happy', carriage: -8, wag: [36, 3], ears: 0, out: 5, swivel: 0.2, pant: 0.6 },
    love: {
      face: 'love',
      carriage: -10,
      wag: [42, 4],
      wiggle: 1,
      pant: 1,
      ears: -10,
      out: 8,
      swivel: 0,
    },
    alarmed: { face: 'surprised', carriage: 25, ears: 10, out: 45, swivel: 0 },
    annoyed: { face: 'focused', carriage: 20, wag: [4, 5], ears: 0, out: 30, swivel: 0 },
    sad: { face: 'sad', carriage: -55, wag: [4, 0.6], ears: -25, out: 0, swivel: 0 },
    sleepy: { face: 'sleepy', carriage: -35, wag: [6, 0.5], ears: 0, out: 0, swivel: 0 },
    asleep: { face: 'asleep', carriage: -45, flicks: 0.2, ears: 0, out: 0, swivel: 0.2 },
  },
  actMoods: {
    love: 'love',
    startle: 'alarmed',
    scratch: 'happy',
    chase: 'happy',
    play: 'love',
    bark: 'alarmed',
    sniff: 'curious',
    stretch: 'sleepy',
    nap: 'asleep',
    dreamNap: 'asleep',
    shakePaw: 'happy',
    beg: 'happy',
    rollOver: 'love',
    spinLie: 'happy',
    dig: 'happy',
    trail: 'curious',
    zoomies: 'happy',
    howl: 'calm',
    headTilt: 'curious',
    sneeze: 'calm',
    shakeOff: 'happy',
    nudge: 'love',
    peek: 'curious',
    wallWatch: 'curious',
    yawn: 'sleepy',
    prance: 'happy',
    flySnap: 'curious',
    point: 'curious',
    sigh: 'sad',
    listen: 'curious',
    lick: 'happy',
    pounce: 'curious',
  } satisfies Record<string, Mood>,
  lying: 'calm',
  hover: 'happy',
  drop: { stand: 0, sit: -0.14, lie: -0.14 },
  sit: -22,
  turn: 55,
};

/** 0 before a, 1 after b, eased between. */
const ease = (t: number, a: number, b: number) => {
  const u = clamp((t - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
};
/** Fades in over `a`..`b`, holds, and fades out over `c`..`d`. */
const span = (t: number, a: number, b: number, c: number, d: number) =>
  ease(t, a, b) * (1 - ease(t, c, d));
/** A bump from 0 up to 1 and back over `length` seconds, starting at `at`. */
const pulse = (t: number, at: number, length: number) =>
  t > at && t < at + length ? Math.sin(((t - at) / length) * Math.PI) : 0;

/** The pounce, in seconds from its start: wiggle, leap, land, done. How far (metres). */
const P = { wind: 1.4, leap: 1.8, land: 2.3, end: 3.1 };
const LEAP = 0.45;

export class Dog extends Pet {
  static readonly terms =
    'doggo doggy pup pooch hound tan beige cream brown tv screen floppy ears snout nose collar red tag tail wag trot sniff';

  protected readonly anatomy: Anatomy = { ...DOG, drop: { ...DOG.drop } };
  private gaze = this.spec.gaze;
  private frame: Frame | null = null;
  private env: Env | null = null;
  private tilt = 1;
  private awayAt = -100;
  private wasHere = false;
  private headWas: [number, number] = [0, 0];
  /** Hops done so far in the current act (barks, play bounces). */
  private hops = 0;
  private way = 1;
  private from = 0;
  private mark = -1;
  private step = 0;
  private mate: Character | null = null;
  private baseSpeed = 1.5;
  /** What acts want this frame: turned about (degrees), crouched (metres), a face. */
  private want: { yaw: number; low: number; face: Expression | null; aside: number | null } = {
    yaw: 0,
    low: 0,
    face: null,
    aside: null,
  };
  private turning = new Spring(1.6, 0.8);
  private crouching = new Spring(2.5, 0.6);
  /** Spinning on the spot (radians, direct), and rolled over (degrees). */
  private spin = 0;
  private rolled = 0;
  /** How lit the nose is, 0..1 (he sniffs with it lit). */
  private nose = 0.3;
  /** Last frame's posture, hop height and gait, to notice settling, landings and stride. */
  private wasPosture: Posture = 'stand';
  private hopWas = 0;
  private earLag = 0;
  /** How far each paw is lifted this frame (metres): FL, FR, BL, BR. */
  private lifts = [0, 0, 0, 0];

  constructor(model: Object3D) {
    super(
      {
        name: 'Byte',
        model: 'dog',
        metres: 0.68,
        width: 0.55,
        size: 1.05,
        feels: {
          default: { f: 2, zeta: 0.6 },
          body: { f: 1.6, zeta: 0.7 },
          head: { f: 1.8, zeta: 0.55, r: 0.3 },
          jaw: { f: 6, zeta: 0.5 },
          'ear.L': { f: 2.6, zeta: 0.2 },
          'ear.R': { f: 2.6, zeta: 0.2 },
          'tail.1': { f: 5, zeta: 0.45 },
          'tail.2': { f: 5, zeta: 0.3 },
          'tail.3': { f: 5, zeta: 0.3 },
        },
        face: DOG_FACE,
        eyes: 0.85,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.9 },
          { bone: 'body', yaw: 0.2, pitch: 0 },
        ],
        reach: { yaw: 60, pitch: 30 },
        lag: 0.8,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 1.5,
      },
      model,
    );
    this.baseSpeed = this.spec.speed ?? 1.5;
    // His own trot (see feet()): the shared one slides his feet.
    this.trotting = false;
    this.acts = { ...this.commonActs(), ...this.moves(), ...this.tricks(), ...this.fidgets() };
  }

  /**
   * In the colour look his parts get fine detail (detail.ts): a short fur on the coat, patches
   * and ears, rubber on the pads and paws, grain on the dark joints. Ink and paper stay clean.
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
      const kind: Detail | null = /^(Shell|Joint_Ear)/.test(role)
        ? 'fur'
        : /^(Joint_Paw|Bezel_Pad|Joint_Tongue)/.test(role)
          ? 'rubber'
          : /^Joint(_Collar)?$/.test(role)
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

  /** The crewmates on his floor he could visit. */
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

  /** His ears laid back (k 0..1). */
  private earsBack(k: number) {
    this.puppet.add('ear.L', 25 * k, 0, -8 * k);
    this.puppet.add('ear.R', 25 * k, 0, 8 * k);
  }

  /** His ears pricked. */
  private earsUp(k: number) {
    this.puppet.add('ear.L', -14 * k, 0, 18 * k);
    this.puppet.add('ear.R', -14 * k, 0, -18 * k);
  }

  /** The play bow eased in by k (0..1), so it never snaps. */
  private bowBy(k: number) {
    const p = this.puppet;
    p.add('body', 15 * k);
    p.add('leg.FL', -60 * k);
    p.add('leg.FR', -60 * k);
    p.add('leg.BL', -15 * k);
    p.add('leg.BR', -15 * k);
    p.add('head', -28 * k);
  }

  /**
   * His trot: legs swing wide enough that a planted paw keeps up with the floor moving
   * under it, and each paw lifts as it swings forward, so it doesn't drag.
   */
  private feet(amount: number, swing = 40) {
    const p = this.puppet;
    const g = this.gait;
    const a = Math.sin(g) * swing * amount;
    p.add('leg.FL', a);
    p.add('leg.BR', a);
    p.add('leg.FR', -a);
    p.add('leg.BL', -a);
    p.add('body', 0, 0, Math.cos(g * 2) * 2 * amount);
    p.add('head', Math.cos(g * 2) * 3 * amount);
    // Forward swing is a falling angle: lift the paw then, and put it down softly (after()).
    const lift = (phase: number) => 0.016 * amount * Math.max(0, phase) ** 1.5;
    this.lifts = [lift(-Math.cos(g)), lift(Math.cos(g)), lift(Math.cos(g)), lift(-Math.cos(g))];
  }

  /** Hop until `count` hops have been done this act. */
  private hopTo(count: number, strength: number) {
    for (; this.hops < count; this.hops++) this.hop.kick(strength);
  }

  private moves(): Record<string, Act> {
    const p = this.puppet;
    const still = () => !this.walking;
    return {
      scratch: {
        weight: 1.2,
        length: [2, 3],
        when: () => this.posture !== 'lie' && still(),
        start: () => (this.posture = 'sit'),
        pose: (t) => {
          // A hind leg up behind the ear, going like the clappers; head leaning into it.
          p.add('leg.BL', -60 + 14 * sin(t, 6), 0, 35);
          p.add('head', 0, 15, -15);
        },
      },
      sniff: {
        weight: 1.2,
        length: [3, 5],
        when: () => this.posture === 'stand' && still(),
        start: () => {
          const way = Math.random() < 0.5 ? -1 : 1;
          this.walkTo(this.s + way * this.heightPx * (1 + Math.random()));
        },
        // Nose down along the frame line, twitching.
        pose: (t) => p.add('head', 34 + 3 * sin(t, 5)),
      },
      bark: {
        weight: 0.6,
        length: [1.2, 1.2],
        when: () => this.posture !== 'lie' && still(),
        start: () => (this.hops = 0),
        pose: (t) => {
          // Two barks (silent ones): jaw snaps open, head jerks up, a little hop.
          const b = pulse(t, 0.1, 0.22) + pulse(t, 0.5, 0.22);
          p.add('jaw', 40 * b);
          p.add('head', -12 * b);
          this.hopTo(t > 0.5 ? 2 : t > 0.1 ? 1 : 0, 0.5);
        },
      },
      play: {
        weight: 0.8,
        length: [2.5, 3.5],
        when: () => this.posture === 'stand' && still(),
        start: () => (this.hops = 0),
        pose: (t) => {
          // A play bow: a small rock back (anticipation), then chest down and bouncing on the
          // front paws, and a lift back up at the end.
          const wind = pulse(t, 0, 0.5);
          const k = span(t, 0.35, 0.85, 2.3, 3);
          p.add('body', -5 * wind);
          p.add('head', 6 * wind);
          p.add('leg.FL', 12 * wind);
          p.add('leg.FR', 12 * wind);
          this.bowBy(k);
          p.add('tail.1', 14 * k);
          this.hopTo(Math.min(3, Math.floor((t - 0.5) * 1.6 + 0.5)), 0.6);
        },
      },
      stretch: {
        // Front paws out and chest down, rump up and quivering; then a hind leg reaching back.
        weight: 1,
        length: [3.4, 3.4],
        when: () => this.standing,
        pose: (t) => {
          const front = span(t, 0.2, 0.9, 1.9, 2.5);
          const back = span(t, 2, 2.4, 3, 3.3);
          this.bowBy(front);
          p.add('root', 0, 0, 1.5 * Math.sin(t * 30) * front);
          p.add('leg.BL', 30 * back);
          p.add('body', -6 * back);
          p.add('jaw', 20 * span(t, 0.9, 1.2, 1.7, 2));
          this.want.face = 'sleepy';
        },
      },
      // Reactions
      love: { weight: 0, length: [2.5, 3.5] },
      chase: {
        weight: 0.35,
        length: [4.4, 4.4],
        when: () => this.standing,
        start: () => {
          this.posture = 'stand';
          this.way = Math.random() < 0.5 ? -1 : 1;
          this.goal = null;
        },
        pose: (t) => {
          // Round and round after his tail: head turned back toward it (the spin is in
          // after()), then a dizzy stagger.
          const k = span(t, 0.2, 0.6, 3, 3.4);
          const run = sin(t, 3.4) * 30 * k;
          p.add('leg.FL', run);
          p.add('leg.BR', run);
          p.add('leg.FR', -run);
          p.add('leg.BL', -run);
          p.add('head', 10 * k, -50 * this.way * k);
          const dizzy = ease(t, 3.2, 3.6) * (1 - ease(t, 4, 4.4));
          p.add('head', 0, 20 * dizzy * sin(t, 1.1), 14 * dizzy * sin(t, 1.1, 0.25));
          p.add('root', 6 * dizzy * sin(t, 1.1), 0, 6 * dizzy * sin(t, 1.1, 0.25));
          this.want.face = dizzy > 0.4 ? 'dizzy' : 'happy';
        },
      },
    };
  }

  /** Moving about the box: the tricks that use its floor, walls and crew. */
  private tricks(): Record<string, Act> {
    const p = this.puppet;
    return {
      trail: {
        // Nose down along the back wall, following a scent: out one way, and back.
        weight: 0.9,
        length: [9, 9],
        when: () => this.standing,
        start: () => {
          this.step = 0;
          this.walkTo(this.across(1.5 + Math.random(), Math.random() < 0.5), 0.94);
        },
        pose: (t) => {
          if (t > 4.2 && this.step === 0) {
            this.step = 1;
            this.walkTo(this.across(1.5 + Math.random(), Math.random() < 0.5), 0.94);
          }
          const k = ease(t, 0, 0.5);
          p.add('body', 6 * k);
          p.add('head', (32 + 4 * sin(t, 6)) * k, 8 * sin(t, 0.9) * k);
          this.earsBack(0.2 * k);
          this.nose = 1;
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
          this.earsBack(0.8);
          p.add('body', 4 * sin(t, 2));
          p.add('jaw', 14);
        },
      },
      prance: {
        // Head up, tail up: a dog who knows he looks good.
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
          if (this.walking) this.feet(1, 30);
          p.add('head', -12 * k);
          this.earsUp(k);
          p.add('tail.1', 22 * k);
        },
      },
      peek: {
        // To the front lip, paws up on it, to look over and down at the frame line.
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
          p.add('leg.FL', -26 * k - 22 * k * Math.max(0, sin(u, 0.7)));
          p.add('leg.FR', -26 * k);
          p.add('head', 34 * k + 6 * sin(u, 0.8) * k, 22 * sin(u, 0.35) * k);
          p.add('jaw', 12 * k);
          this.earsUp(k);
          this.want.face = sin(u, 0.35) > 0.6 ? 'surprised' : 'neutral';
        },
      },
      wallWatch: {
        // To the back wall to sit with his back to us, tail swishing, watching something
        // we can't see; then a look back over his shoulder.
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
          p.add('head', -8 * face, 40 * sin(u, 0.2) * look);
          this.earsUp(0.6 * look);
          const back = span(u, 5.6, 6.2, 6.8, 7.4);
          p.add('head', 0, 100 * back);
          this.want.face = back > 0.5 ? 'happy' : 'neutral';
        },
      },
      nudge: {
        // Trots up to a crewmate and nudges them with his nose, twice, then looks up
        // at them, tail going.
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
            if (t > this.step * 0.8) {
              this.step++;
              const gap = (this.footprint(f).x + mate.footprint(f).x) * 1.15 + f.bot * 0.1;
              this.walkTo(mate.s - dir * gap, mate.depth);
            }
            if (t > 1 && !this.walking) this.mark = t;
            this.earsUp(0.5);
            return;
          }
          const u = t - this.mark;
          this.want.aside = dir * 88;
          // Two nose-bumps, then a look up at them.
          const bump = pulse(u, 0.3, 0.35) + pulse(u, 1.2, 0.35);
          const up = span(u, 2.2, 2.7, 5, 5.5);
          p.add('head', -6 * bump - 22 * up, 0, dir * 8 * up);
          p.add('body', -4 * bump);
          p.add('jaw', 10 * up);
          this.want.face = up > 0.4 ? 'love' : 'focused';
          this.nose = 1;
        },
      },
      pounce: {
        // Wiggles his rump, and leaps on nothing at all.
        weight: 0.7,
        length: [P.end, P.end],
        when: () => this.standing && this.room() > 0,
        start: () => {
          this.way = this.room();
          this.goal = null;
        },
        pose: (t) => {
          const k = ease(t, 0.2, 0.6);
          this.want.aside = this.way * 88;
          if (t < P.leap) {
            const rear = ease(t, 0.6, P.leap);
            this.want.low = 0.03 * k;
            this.bowBy(k);
            p.add('body', -4 * k);
            p.add('root', 0, 0, 5 * Math.sin(t * 20) * rear * (1 - ease(t, P.wind, P.leap)));
            this.want.face = 'focused';
          } else if (t < P.land) {
            const u = ease(t, P.leap, P.land);
            p.add('leg.FL', -85 + 40 * u);
            p.add('leg.FR', -80 + 40 * u);
            p.add('leg.BL', 40);
            p.add('leg.BR', 40);
            p.add('jaw', 20);
            this.want.face = 'focused';
          } else this.want.face = 'happy';
        },
      },
    };
  }

  /** Small things on the spot: paws, ears, back, and the odd tumble. */
  private fidgets(): Record<string, Act> {
    const p = this.puppet;
    const still = () => !this.walking;
    return {
      shakePaw: {
        // Sits, and holds out a paw to be shaken, with a hopeful look.
        weight: 1,
        length: [5, 5],
        when: () => this.posture !== 'lie' && still(),
        start: () => (this.posture = 'sit'),
        pose: (t) => {
          const k = span(t, 0.4, 1, 4, 4.6);
          p.add('leg.FL', -70 * k + 10 * k * sin(t, 1.6));
          p.add('head', -6 * k, 0, 8 * k);
          this.earsUp(0.5 * k);
          this.want.face = 'happy';
        },
      },
      beg: {
        // Sits up on his haunches, both paws folded up, tongue out, head tilting.
        weight: 0.9,
        length: [5, 5],
        when: () => this.posture !== 'lie' && still(),
        start: () => (this.posture = 'sit'),
        pose: (t) => {
          const k = span(t, 0.4, 1.1, 4, 4.7);
          p.add('body', -14 * k);
          p.add('leg.FL', -100 * k);
          p.add('leg.FR', -100 * k);
          p.add('head', 10 * k, 0, 10 * k * sin(t, 0.5));
          p.add('jaw', 10 * k);
          this.want.face = 'happy';
        },
      },
      spinLie: {
        // Turns round and round on the spot, three times, and flops down.
        weight: 0.8,
        length: [5, 5],
        when: () => this.posture !== 'lie' && still(),
        start: () => {
          this.posture = 'stand';
          this.way = Math.random() < 0.5 ? -1 : 1;
          this.goal = null;
        },
        pose: (t) => {
          const k = span(t, 0.1, 0.4, 2.2, 2.8);
          const run = sin(t, 3) * 25 * k;
          p.add('leg.FL', run);
          p.add('leg.BR', run);
          p.add('leg.FR', -run);
          p.add('leg.BL', -run);
          p.add('head', 6 * k, 30 * this.way * k);
          if (t > 2.8) this.posture = 'lie';
        },
      },
      rollOver: {
        // Flops onto his side, rolls onto his back, paws in the air, and wiggles.
        weight: 0.6,
        length: [6, 6],
        when: still,
        start: () => {
          this.posture = 'lie';
          this.way = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          const k = span(t, 0.6, 1.5, 4.6, 5.6);
          const back = ease(t, 0.8, 2.4) * (1 - ease(t, 3.6, 5.2));
          // Legs loosen out of their tuck, and paw at the air while he's on his back.
          for (const leg of LEGS) p.add(leg, 75 * k);
          p.add('leg.FL', 25 * back * sin(t, 1.5));
          p.add('leg.FR', -25 * back * sin(t, 1.5));
          p.add('head', 0, 0, 10 * back * sin(t, 0.8));
          this.rolled = 180 * this.way * back;
          this.extraLift = 0.06 * Math.abs(Math.sin((this.rolled * Math.PI) / 90));
          this.want.face = 'love';
        },
      },
      dig: {
        // Front paws scrabbling at the floor, rump up and tail going, then a proud look.
        weight: 0.8,
        length: [5, 5],
        when: () => this.standing,
        start: () => (this.hops = 0),
        pose: (t) => {
          const k = span(t, 0.3, 0.8, 3.6, 4.2);
          p.add('body', 12 * k);
          p.add('leg.FL', -10 * k + 42 * k * Math.max(0, sin(t, 3.6)));
          p.add('leg.FR', -10 * k + 42 * k * Math.max(0, sin(t, 3.6, 0.5)));
          p.add('head', 30 * k - 40 * span(t, 3.9, 4.2, 4.6, 4.9));
          p.add('root', 0, 0, 2 * Math.sin(t * 22) * k);
          p.add('jaw', 8 * k);
          this.want.face = t > 3.9 ? 'happy' : 'focused';
        },
      },
      howl: {
        // Sits, throws his head back, and howls at the moon (a silent one).
        weight: 0.5,
        length: [5.6, 5.6],
        when: () => this.posture !== 'lie' && still(),
        start: () => (this.posture = 'sit'),
        pose: (t) => {
          const k = span(t, 0.4, 1.2, 4.4, 5.2);
          p.add('head', -55 * k);
          p.add('body', -6 * k);
          p.add('jaw', (22 + 4 * sin(t, 5)) * k);
          this.earsBack(0.5 * k);
          this.want.face = 'sleepy';
        },
      },
      headTilt: {
        // Hears something. Cocks his head one way, then the other, ears pricked.
        weight: 1.1,
        length: [4.5, 4.5],
        when: () => this.posture !== 'lie' && still(),
        pose: (t) => {
          const tilt = [14, -14, 18][Math.floor(t / 1.4) % 3];
          p.add('head', -4, 0, tilt);
          p.add('ear.L', tilt > 0 ? -22 : 6, 0, tilt > 0 ? 20 : 0);
          p.add('ear.R', tilt > 0 ? 6 : -22, 0, tilt > 0 ? 0 : -20);
          this.want.face = 'surprised';
        },
      },
      sneeze: {
        // Head back, back, back... and a sneeze: he shakes his head and blinks.
        weight: 0.6,
        length: [2.8, 2.8],
        when: () => this.posture !== 'lie' && still(),
        start: () => (this.hops = 0),
        pose: (t) => {
          const wind = span(t, 0.2, 0.9, 1, 1.05);
          const snap = pulse(t, 1, 0.25);
          const shake = ease(t, 1.2, 1.3) * (1 - ease(t, 2, 2.4));
          p.add('head', -26 * wind + 34 * snap, 0, 12 * shake * sin(t, 6));
          p.add('jaw', 20 * snap + 14 * wind);
          this.earsBack(0.4 * wind);
          p.add('ear.L', 20 * shake * sin(t, 6));
          p.add('ear.R', 20 * shake * sin(t, 6, 0.3));
          if (t > 1 && this.hops === 0) {
            this.hops = 1;
            this.hop.kick(1.2);
          }
          this.want.face = wind > 0.3 ? 'sleepy' : snap > 0.1 ? 'surprised' : 'neutral';
        },
      },
      shakeOff: {
        // Shakes himself off from nose to tail, ears flapping like flags.
        weight: 0.8,
        length: [2.8, 2.8],
        when: () => this.standing,
        pose: (t) => {
          const k = span(t, 0.2, 0.4, 2.1, 2.6);
          const w = 16 * k * Math.sin(t * 2 * Math.PI * 6);
          p.add('root', 0, w);
          p.add('head', 0, -w * 1.4);
          p.add('ear.L', 25 * k * Math.sin(t * 40), 0, 20 * k * Math.sin(t * 36));
          p.add('ear.R', 25 * k * Math.sin(t * 40 + 1), 0, -20 * k * Math.sin(t * 36 + 1));
          p.add('tail.1', 0, 25 * k * Math.sin(t * 2 * Math.PI * 6));
          this.want.face = 'cross';
        },
      },
      dreamNap: {
        // Asleep, and dreaming: paws running, muffled woofs, ears and tail twitching.
        weight: 1,
        length: [11, 14],
        when: still,
        start: () => (this.posture = 'lie'),
        pose: (t) => {
          const dream = sin(t, 0.18) > 0.15 ? 1 : 0;
          const run = Math.sin(t * 2 * Math.PI * 4.5) * dream;
          p.add('leg.FL', 22 * run);
          p.add('leg.BR', 22 * run);
          p.add('leg.FR', -22 * run);
          p.add('leg.BL', -22 * run);
          p.add('jaw', 8 * dream * Math.max(0, Math.sin(t * 2 * Math.PI * 4.5)));
          p.add('head', 0, 4 * dream * run);
          p.add('ear.L', 8 * dream * run);
          p.add('tail.3', 0, 10 * dream * run);
          p.add('body', 0.8 * dream * run);
          this.nose = 0.1 + 0.4 * dream * (0.5 + 0.5 * run);
        },
      },
      yawn: {
        // Jaw wide, head back, eyes screwed shut; a lick of the lips.
        weight: 0.8,
        length: [3.4, 3.4],
        when: () => this.posture !== 'lie' && still(),
        pose: (t) => {
          const open = span(t, 0.3, 1, 2, 2.6);
          p.add('head', -22 * open, 0, 4 * open);
          p.add('jaw', 38 * open);
          this.earsBack(0.5 * open);
          this.want.face = open > 0.2 ? 'sleepy' : 'neutral';
        },
      },
      flySnap: {
        // Follows a fly with his eyes and head, snaps at it, and swallows. Got it!
        weight: 0.6,
        length: [5, 5],
        when: () => this.posture !== 'lie' && still(),
        start: () => (this.hops = 0),
        pose: (t) => {
          const k = span(t, 0.2, 0.7, 4.2, 4.8);
          const pos = sin(t, 0.6);
          p.add('head', -18 * k - 6 * sin(t, 1.3) * k, 45 * pos * k);
          const snap = pulse(t, 3, 0.25);
          p.add('jaw', 38 * snap);
          p.add('head', -10 * snap);
          this.earsUp(0.6 * k);
          if (t > 3 && this.hops === 0) {
            this.hops = 1;
            this.hop.kick(0.9);
          }
          const f = this.face;
          if (f && t < 3 && k > 0.1) {
            f.look.x = 0.9 * pos;
            f.look.y = -0.6 - 0.3 * sin(t, 1.3);
          }
          this.want.face = t > 3.4 ? 'happy' : 'focused';
        },
      },
      point: {
        // Freezes, nose out, tail straight, one paw raised: a pointer, quivering.
        weight: 0.6,
        length: [5, 5],
        when: () => this.standing,
        pose: (t) => {
          const k = span(t, 0.3, 0.7, 4.3, 4.8);
          const dir = Math.sign(this.middle() - this.s) || 1;
          this.want.aside = dir * 90 * k + this.anatomy.turn * dir * (1 - k);
          this.want.low = 0.02 * k;
          p.add('leg.FL', -75 * k);
          p.add('head', 6 * k);
          p.add('body', 4 * k);
          p.add('tail.1', -30 * k);
          this.earsUp(k);
          p.add('root', 0.4 * Math.sin(t * 40) * k);
          this.want.face = 'focused';
          this.nose = 1;
        },
      },
      sigh: {
        // Lies with his chin on his paws and lets out a big, slow sigh.
        weight: 0.7,
        length: [6.5, 6.5],
        when: still,
        start: () => (this.posture = 'lie'),
        pose: (t) => {
          const k = ease(t, 0.4, 1.4);
          const breath = pulse(t, 2.2, 2.4) + pulse(t, 4.6, 2.2);
          p.add('body', -2.5 * breath);
          p.add('head', 6 * k - 4 * breath);
          p.add('jaw', 6 * breath);
          this.earsBack(0.7 * k);
        },
      },
      listen: {
        // Ears swivelling one after the other, head cocked.
        weight: 1,
        length: [3.5, 5],
        when: () => this.posture !== 'lie' && still(),
        pose: (t) => {
          const tilt = [12, -8, 14, -6, 8][Math.floor(t / 0.8) % 5];
          p.add('head', 4, 0, tilt);
          p.add('ear.L', -8, 30 * sin(t, 0.6), 0);
          p.add('ear.R', -8, 30 * sin(t, 0.6, 0.35), 0);
        },
      },
      lick: {
        // A lick of the chops: tongue out and back, twice.
        weight: 0.9,
        length: [2.6, 2.6],
        when: () => this.posture !== 'lie' && still(),
        pose: (t) => {
          const k = span(t, 0.2, 0.5, 2, 2.4);
          p.add('jaw', 16 * k * (0.5 + 0.5 * Math.sin(t * 2 * Math.PI * 2.2)));
          p.add('head', -6 * k, 0, 4 * k * sin(t, 2.2));
          this.want.face = 'happy';
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
    const reach = (LEAP * 1.2 + this.spec.width) * this.px;
    if ((way > 0 ? hi - this.s : this.s - lo) <= reach) return 0;
    const blocked = this.mates().some((o) => {
      const along = (o.s - this.s) * way;
      return along > -this.px * 0.3 && along < reach && Math.abs(o.depth - this.depth) < 0.4;
    });
    return blocked ? 0 : way;
  }

  poke() {
    if (this.state !== 'here') return;
    if (this.poked() >= 3) this.setAct('chase');
    else if (this.posture === 'lie' && (this.act === 'nap' || this.act === 'dreamNap'))
      this.setAct('startle');
    else this.setAct('love');
  }

  protected feel(env: Env): Mood {
    // Sad for a while after the mouse leaves the window.
    const here = env.pointer.present;
    if (this.wasHere && !here) this.awayAt = env.time;
    this.wasHere = here;
    if (!here && env.time - this.awayAt < 8 && !(this.act in DOG.actMoods)) return 'sad';
    const mood = super.feel(env);
    if (mood === 'curious' && this.mood !== 'curious') this.tilt = Math.random() < 0.5 ? -1 : 1;
    return mood;
  }

  /** Lying like a sphinx: front paws out in front, hind legs tucked, chin low. */
  protected lying(breath: number) {
    const p = this.puppet;
    p.add('leg.FL', -80);
    p.add('leg.FR', -80);
    p.add('leg.BL', -80);
    p.add('leg.BR', -80);
    p.add('head', 12 + 2 * breath);
  }

  protected pose(dt: number, env: Env) {
    this.frame = env.frame;
    this.env = env;
    this.extraLift = this.act === 'rollOver' ? this.extraLift : 0;
    if (this.act !== 'rollOver') this.rolled = 0;
    const toward = Math.sign(this.middle() - this.s) || 1;
    // Facing: toward the middle, or side-on to what he is after.
    const aside = this.want.aside ?? (this.posture === 'lie' ? 65 * toward : DOG.turn * toward);
    this.anatomy.turn = aside * toward;
    const speed: Record<string, number> = { trail: 0.45, prance: 0.9, zoomies: 2.4 };
    this.spec.speed = this.baseSpeed * (speed[this.act] ?? 1);
    this.spec.gaze = ['pounce', 'wallWatch', 'flySnap', 'point', 'trail'].includes(this.act)
      ? []
      : this.gaze;
    super.pose(dt, env);
    // His own trot, with the pace of the walk.
    const moving = Math.min(1, this.stride / (this.heightPx * 0.8));
    if (moving > 0.05) this.feet(moving);
    // Sitting or lying down settles: a little overshoot and a nod, instead of a snap.
    if (this.posture !== this.wasPosture) {
      if (this.posture === 'sit') {
        this.puppet.kick('body', 60);
        this.puppet.kick('head', -50);
        this.puppet.kick('tail.1', 0, 0, 120);
      } else if (this.posture === 'lie') {
        this.puppet.kick('body', 45);
        this.puppet.kick('head', 70);
        this.puppet.kick('ear.L', 60);
        this.puppet.kick('ear.R', 60);
      } else if (this.wasPosture !== 'stand') this.puppet.kick('head', -40);
      this.wasPosture = this.posture;
    }
    if (this.want.face) this.expression = this.want.face;
  }

  protected express(dt: number, env: Env, f: Feeling) {
    const p = this.puppet;
    // Panting: mouth hanging open, tongue showing, a quick breath.
    if (f.pant) p.add('jaw', f.pant * (14 + 5 * sin(env.time, 3)));
    // The whole rear end wags along with the tail; the head stays on you.
    if (f.wiggle) {
      const w = f.wiggle * 9 * Math.sin(this.wagPhase);
      p.add('root', 0, w);
      p.add('head', 0, -w);
    }
    // Any hearty wag moves the hips too: the body sways a beat behind the tail, so the rear
    // end leads and the shoulders follow, the head steady.
    const [wagDeg] = f.wag ?? [0, 0];
    if (wagDeg > 10 && this.posture !== 'lie') {
      const sway = Math.min(1, wagDeg / 40) * 4 * (f.wiggle ? 0.4 : 1);
      p.add('body', 0, sway * Math.sin(this.wagPhase - 0.9), 0);
      p.add('head', 0, -sway * 0.8 * Math.sin(this.wagPhase - 0.9), 0);
      p.add('tail.1', 0, sway * 1.5 * Math.sin(this.wagPhase - 0.3));
    }
    // Ears take the bounce of every hop and landing: a knock up as he leaves the floor, a flap on the way down.
    const hopNow = this.hop.y;
    const hopV = (hopNow - this.hopWas) / Math.max(dt, 1e-3);
    this.hopWas = hopNow;
    this.earLag += (hopV * 6 - this.earLag) * Math.min(1, dt * 12);
    const bounceFlap = Math.max(-30, Math.min(30, this.earLag));
    p.add('ear.L', bounceFlap, 0, bounceFlap * 0.3);
    p.add('ear.R', bounceFlap, 0, -bounceFlap * 0.3);
    // The curious head tilt.
    if (this.mood === 'curious' && this.act !== 'headTilt') p.add('head', 0, 0, 11 * this.tilt);
    // Floppy ears: they lag behind the head's turns, and bounce when he trots.
    const [pitch, yaw] = this.puppet.current('head');
    const vy = (yaw - this.headWas[1]) / Math.max(dt, 1e-3);
    const vp = (pitch - this.headWas[0]) / Math.max(dt, 1e-3);
    this.headWas = [pitch, yaw];
    const swing = Math.max(-30, Math.min(30, -vy * 0.08));
    const bounce = this.walking ? 10 * Math.sin(this.gait * 2) : 0;
    const flap = Math.max(-25, Math.min(25, vp * 0.06)) + bounce;
    p.add('ear.L', flap, 0, swing);
    p.add('ear.R', flap, 0, swing);
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    const t = this.actT;
    this.h = 0;
    // Chasing his tail, or turning before he lies down: round and round, easing in and out.
    const turns =
      this.act === 'chase' ? [2, 0.2, 3] : this.act === 'spinLie' ? [3, 0.2, 2.6] : null;
    if (turns) {
      const [n, a, b] = turns;
      this.spin = -this.way * 2 * Math.PI * n * ease(t, a, b);
    } else this.spin = 0;
    this.pivot.rotation.y = this.spin;
    if (this.act === 'pounce') {
      const px = this.px;
      if (t < P.leap) this.from = this.s;
      else if (t < P.land) {
        const u = (t - P.leap) / (P.land - P.leap);
        this.s = this.from + this.way * LEAP * px * ease(t, P.leap, P.land);
        this.h = 4 * 0.2 * u * (1 - u) * px;
      } else this.s = this.from + this.way * LEAP * px;
      if (this.face && t < P.land) this.face.look.x = this.face.look.y = 0;
    }
    // Rolled over: the body turns about its own length, the head stays roughly the right way up.
    if (this.rolled) {
      p.turn('body', 0, 0, this.rolled);
      p.turn('head', 0, 0, -this.rolled * 0.85);
    }
    // Turned about to face the wall.
    const turned = this.turning.update(dt, this.want.yaw);
    if (turned) p.turn('root', 0, turned);
    // Crouching low: the body sinks and the legs sink into it, so the feet stay put.
    const low = this.crouching.update(dt, this.want.low);
    p.shift('body', 0, -low, 0);
    LEGS.forEach((leg, i) => p.shift(leg, 0, low + this.lifts[i], 0));
    this.lifts = [0, 0, 0, 0];
    this.nose = 0.3;
    this.want.yaw = this.want.low = 0;
    this.want.face = null;
    this.want.aside = null;
    this.lights(env.time);
  }

  /** The lights: the tail tip (0), the tail's collars (1-2), the ear hinges (3), the nose (4), the tag. */
  private lights(time: number) {
    const t = this.actT;
    const a = this.act;
    const wave = (i: number, hz: number) =>
      0.5 + 0.5 * Math.sin(2 * Math.PI * (time * hz - i * 0.22));
    let tip = 0.5 + 0.1 * Math.sin(time * 0.8);
    const bands = [1, 2].map((i) => 0.1 + 0.3 * Math.max(0, wave(i, 0.25) ** 6));
    let ears = 0.25;
    let nose = this.nose;
    let tone: string | undefined;
    const rainbow = (rate: number) => RAINBOW[Math.floor(time * rate) % RAINBOW.length];
    const wag = this.anatomy.moods[this.mood].wag;
    if (a === 'howl') {
      tip = 0.5 + 0.5 * Math.sin(time * 3);
      bands.forEach((_, i) => (bands[i] = wave(i, 1.2)));
      ears = 1;
      nose = 1;
      tone = rainbow(1.5);
    } else if (a === 'zoomies' || a === 'prance' || a === 'shakeOff') {
      tip = 0.9;
      bands.forEach((_, i) => (bands[i] = wave(i, 3)));
      tone = a === 'prance' ? BEACON.happy : rainbow(6);
    } else if (a === 'chase') {
      tip = 1;
      tone = rainbow(5);
      bands.forEach((_, i) => (bands[i] = wave(i, 3)));
    } else if (a === 'sneeze') {
      tip = pulse(t, 1, 0.5);
      ears = tip;
      nose = 1 - 0.7 * ease(t, 1.5, 2.5);
      tone = BEACON.surprised;
    } else if (a === 'headTilt' || a === 'listen' || a === 'wallWatch' || a === 'flySnap') {
      ears = 0.5 + 0.5 * Math.sin(time * 9);
      tip = 0.8;
    } else if (a === 'point' || a === 'pounce') {
      tip = 0.4 + 0.6 * Math.max(0, Math.sin(time * 9));
      ears = 1;
      tone = BEACON.focused;
    } else if (a === 'dreamNap' || this.mood === 'asleep') {
      tip = 0.1 + 0.25 * (0.5 + 0.5 * Math.sin(time * 1.1));
      bands.fill(tip * 0.4);
      ears = 0.05;
      nose = Math.max(nose, 0.1);
    } else if (this.mood === 'love') {
      tip = 0.6 + 0.4 * wave(0, 0.8);
      bands.forEach((_, i) => (bands[i] = wave(2 - i, 0.8)));
      tone = BEACON.love;
    } else if (wag && (this.mood === 'happy' || this.mood === 'curious')) {
      // A ripple up the tail with each wag.
      const ripple = (i: number) => 0.5 + 0.5 * Math.sin(this.wagPhase - i * 0.7 - 1);
      tip = 0.4 + 0.6 * ripple(2);
      bands.forEach((_, i) => (bands[i] = 0.15 + 0.6 * ripple(i)));
      tone = this.mood === 'happy' ? BEACON.happy : undefined;
    } else if (this.mood === 'alarmed') {
      tip = Math.sin(time * 30) > 0 ? 1 : 0.4;
      bands.fill(tip);
      tone = BEACON.surprised;
    } else if (this.mood === 'sad') tip = 0.15;
    else if (this.mood === 'sleepy') tip = 0.3;
    else if (this.walking) tip = 0.8;
    this.outfit.dot(0, clamp(tip, 0, 1), tone);
    bands.forEach((level, i) => this.outfit.dot(i + 1, clamp(level, 0, 1), tone));
    this.outfit.dot(3, clamp(ears, 0, 1), tone);
    this.outfit.dot(4, clamp(nose, 0, 1), tone);
    // The tag takes the mood's colour.
    const tag = tone && this.mood !== 'calm' ? tone : (BEACON[this.expression] ?? '#f4f4f1');
    this.outfit.beacon(tag);
  }

  protected onLeave() {
    super.onLeave();
    this.h = 0;
  }
}
