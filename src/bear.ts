import {
  Color,
  Euler,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Act, Character, clamp, type Env } from './character';
import type { Expression, FaceLayout } from './face';
import { sin } from './moves';
import type { Turn } from './puppet';
import { Spring } from './spring';

/**
 * Bearing, the robot teddy bear: a big round head with screen eyes and a button nose,
 * puck ears, a round belly plate with a heart light in it, stubby arms and legs on
 * ball joints. He walks in along the bottom of the frame and is the crew's entertainer:
 * he waves (with one arm or both), claps, sways happily, takes a bow, and sits down
 * with a thump, legs straight out like a teddy on a shelf, to rest or nap.
 *
 * His party piece is the squat-kick dance: down into a crouch, arms folded, kicking
 * his legs out one after the other with a hop on every switch, faster and faster,
 * until he jumps up with his arms thrown wide (and sometimes bows).
 *
 * The heart beats in his mood's colour (a slow white beat when he's just standing
 * there); his inner ears light up too, flashing with each kick and clap. Rest the
 * mouse on him and he hugs himself, heart glowing pink; he waves hello when the mouse
 * turns up after a while away. A poke makes him jump, three make him dizzy: he
 * staggers round in circles and plops down on his bottom.
 *
 * The rest of his act is a teddy's: a big squeeze of himself, a magician's bow with a
 * flourish, a belly drum (the heart flashes on every hit), a tap dance, juggling three
 * lit balls, a roar that comes out as a squeak (and a paw over his mouth), a honey sniff,
 * a stretch and a yawn, a cartwheel that ends on his bottom, a peek-a-boo, hiccups, a
 * pirouette, a march with a salute. Sitting, he tips over sideways and rights himself,
 * or lies back for a nap. He goes to the back wall to lean there whistling, to the front
 * lip to peer over it, and does a conga step with a crewmate.
 */
export const BEAR_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.3, 0.5],
    [0.7, 0.5],
  ],
  rx: 0.09,
  ry: 0.19,
  line: 0.035,
  mouth: null,
};

type Side = 1 | -1;
type Posture = 'stand' | 'sit';
type Vec = [number, number, number];

const SIDES = [1, -1] as const;
const sfx = (side: Side) => (side === 1 ? 'L' : 'R');
const DEG = 180 / Math.PI;

// His left arm, in model space (three.js: +x his left, +y up, +z his front), metres.
const SHOULDER = new Vector3(0.108, 0.325, 0.025);
const ELBOW = new Vector3(0.139, 0.257, 0.032);
const WRIST = new Vector3(0.163, 0.191, 0.039);
const UPPER_DIR = ELBOW.clone().sub(SHOULDER).normalize();
const FORE_DIR = WRIST.clone().sub(ELBOW).normalize();
const UPPER = ELBOW.distanceTo(SHOULDER);
/** Elbow to the middle of the paw, just past the wrist. */
const FORE = WRIST.distanceTo(ELBOW) + 0.012;
/** Hip to ankle, metres: how far his legs can fold for a squat. */
const LEG = 0.107;
/** How far he sinks to sit, and how deep the dance crouch goes. */
const SEAT = 0.112;
const SQUAT = 0.05;
/** The dance: seconds getting down into it, and for the jump at the end. */
const INTRO = 0.7;
const FINALE = 1.4;
const WARM = BEACON.happy!;
const LOVE = BEACON.love!;
const DIM = new Color('#55554f');
const colour = new Color();

// Scratch objects for the arm solver.
const v1 = new Vector3();
const v2 = new Vector3();
const v3 = new Vector3();
const qa = new Quaternion();
const qb = new Quaternion();
const euler = new Euler();

const RED = '#ff6a5f';
const HONEY = '#ffb347';
/** Eases 0 to 1 between a and b. */
const ease = (t: number, a: number, b: number) => {
  const u = clamp((t - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
};
/** Fades in over a..b, holds, and fades out over c..d. */
const span = (t: number, a: number, b: number, c: number, d: number) =>
  ease(t, a, b) * (1 - ease(t, c, d));
/** Extra leg turns for one leg (degrees): thigh, shin, foot, and out to the side. */
type LegFx = [number, number, number, number];
/** The hiccup's timing, seconds into the act. */
const HICCUPS = [0.5, 1.3, 1.9, 2.9, 3.4];
/** The tap dance's pattern of feet, one per tap. */
const TAPS: Side[] = [1, 1, -1, -1, 1, -1, 1, -1];
/** The conga: three steps and a kick. */
const CONGA: Side[] = [1, -1, 1, -1];

/** 1 at 0, falling to 0 at ±width. */
const bump = (x: number, width: number) => Math.max(0, 1 - Math.abs(x) / width);

export class Bear extends Character {
  private posture: Posture = 'stand';
  private crouch = new Spring(3, 0.7);
  private seat = new Spring(2.6, 0.8);
  private hop = new Spring(3.4, 0.35);
  private squash = new Spring(3.2, 0.3, 1, 1);
  /** How far each leg is kicked out, 0 to 1 (quick, so the kicks snap). */
  private kicks = { 1: new Spring(7, 0.55), [-1]: new Spring(7, 0.55) } as Record<Side, Spring>;
  /** This frame's crouch and seat (metres, 0..1) and walking pace, for the legs. */
  private legs = { crouch: 0, seat: 0, moving: 0 };
  private thumped = true;
  private stoodAt = 0;
  private pokes: number[] = [];
  private hover = 0;
  /** The dance: beats so far (it speeds up, so this is accumulated). */
  private beat = 0;
  private beats = -1;
  private jumped = false;
  private claps = 0;
  /** Which arm waves (both, if 0), and which the next wave will use if it's a hello. */
  private waving: Side | 0 = 1;
  private hello: Side | null = null;
  private bowAfter = false;
  private twitchAt = 4;
  /** The last time the mouse was about, and whether he owes it a hello (when he's
   * just arrived, or it has been away a while). */
  private seen = -100;
  private owed = true;
  /** Progress through a multi-part act, and the time a part began. */
  private env: Env | null = null;
  private stage = 0;
  private did = 0;
  private mate: Character | null = null;
  private home0 = 0;
  private tipSide: Side = 1;
  private tipped = false;
  private hicIdx = 0;
  /** A hit on the drum or a hiccup: the heart flashes and fades. */
  private thump = 0;
  /** Marching: 0 walks as usual, 1 knees high. */
  private high = 0;
  /** The root's own turns (degrees, direct): a pirouette's yaw, a cartwheel's roll. */
  private rootTurn: Vec = [0, 0, 0];
  private legFx: Record<Side, LegFx> = { 1: [0, 0, 0, 0], [-1]: [0, 0, 0, 0] } as Record<
    Side,
    LegFx
  >;
  /** The juggler's balls: where they are this frame, and how visible. */
  private orbs: Mesh[] = [];
  private orbAt = [new Vector3(), new Vector3(), new Vector3()];
  private orbShow = 0;
  private heart = new Color(BEACON.neutral);
  /** Seconds since the ear lights last flashed, per ear; and their colour. */
  private flash: Record<Side, number> = { 1: 10, [-1]: 10 } as Record<Side, number>;
  private flashColour: Record<Side, string> = { 1: WARM, [-1]: WARM } as Record<Side, string>;

  constructor(model: Object3D) {
    super(
      {
        name: 'Bearing',
        model: 'bear',
        metres: 0.62,
        width: 0.44,
        size: 1,
        feels: {
          default: { f: 3, zeta: 0.6 },
          body: { f: 2.6, zeta: 0.5 },
          head: { f: 2.4, zeta: 0.5, r: 0.3 },
          // Wobbly ears.
          'ear.L': { f: 4.5, zeta: 0.2 },
          'ear.R': { f: 4.5, zeta: 0.2 },
          'upper_arm.L': { f: 3.6, zeta: 0.5 },
          'upper_arm.R': { f: 3.6, zeta: 0.5 },
          'forearm.L': { f: 4.4, zeta: 0.45 },
          'forearm.R': { f: 4.4, zeta: 0.45 },
        },
        face: BEAR_FACE,
        eyes: 0.78,
        gaze: [
          { bone: 'head', yaw: 0.7, pitch: 0.8 },
          { bone: 'body', yaw: 0.25, pitch: 0.1 },
        ],
        reach: { yaw: 55, pitch: 28 },
        lag: 1.2,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 0.9,
      },
      model,
    );
    this.acts = this.moves();
    // Named like the dots, so dress() turns them into lights (Dot2..Dot4).
    RAINBOW.slice(0, 3).forEach((_, i) => {
      const material = new MeshBasicMaterial();
      material.name = `Dot${2 + i}`;
      const ball = new Mesh(new SphereGeometry(0.02, 12, 8), material);
      ball.visible = false;
      this.orbs.push(ball);
      model.add(ball);
    });
  }

  protected setAct(name: string) {
    this.beat = 0;
    this.beats = -1;
    this.stage = 0;
    this.did = 0;
    super.setAct(name);
  }

  /** Crewmates on the floor nearby, nearest first. */
  private mates() {
    return (this.env?.crew ?? [])
      .filter((o) => o !== this && o.state === 'here' && o.edge === this.edge && !o.free)
      .sort((a, b) => Math.abs(a.s - this.s) - Math.abs(b.s - this.s))
      .filter((o) => Math.abs(o.s - this.s) < this.heightPx * 12);
  }

  private toward(m: Character) {
    return Math.sign(m.s - this.s) || 1;
  }

  private moves(): Record<string, Act> {
    const still = () => !this.walking;
    const standing = () => this.posture === 'stand' && still();
    const sitting = () => this.posture === 'sit' && still();
    return {
      idle: { weight: 3, length: [3, 6] },
      stroll: {
        weight: 1.4,
        length: [3, 5],
        when: standing,
        start: () => {
          const way = Math.random() < 0.5 ? -1 : 1;
          this.walkTo(this.s + way * this.heightPx * (1 + Math.random() * 2));
        },
      },
      dance: {
        weight: 1,
        length: [7.5, 9],
        face: 'happy',
        when: standing,
        start: () => {
          this.beat = 0;
          this.beats = -1;
          this.jumped = false;
          this.bowAfter = Math.random() < 0.5;
        },
      },
      wave: {
        weight: 1,
        length: [2.4, 3.2],
        face: 'happy',
        when: still,
        start: () => {
          this.waving = this.hello ?? (Math.random() < 0.35 ? 0 : Math.random() < 0.5 ? 1 : -1);
          this.hello = null;
        },
      },
      clap: {
        weight: 0.8,
        length: [1.8, 2.6],
        face: 'happy',
        when: still,
        start: () => (this.claps = 0),
      },
      sway: { weight: 1, length: [4, 6], face: 'happy', when: still },
      bow: { weight: 0.3, length: [2.2, 2.6], face: 'happy', when: standing },
      sit: {
        weight: 0.8,
        length: [0.8, 1.2],
        when: () => standing() && this.t - this.stoodAt > 8,
        start: () => {
          this.posture = 'sit';
          this.thumped = false;
        },
      },
      nap: { weight: 0.8, length: [10, 18], face: 'asleep', when: sitting },
      stand: {
        weight: 1.6,
        length: [0.8, 1],
        when: sitting,
        start: () => {
          this.posture = 'stand';
          this.stoodAt = this.t;
          this.hop.kick(0.5);
        },
      },
      // Tricks
      squeeze: { weight: 0.5, length: [3.4, 4.2], when: still },
      magic: { weight: 0.5, length: [5.4, 5.8], when: standing },
      drum: { weight: 0.6, length: [5.2, 6.2], when: standing },
      tap: { weight: 0.6, length: [6, 8], when: standing },
      juggle: { weight: 0.6, length: [8, 10], when: standing },
      roar: { weight: 0.5, length: [4.6, 5], when: standing },
      sniff: { weight: 0.5, length: [5.4, 6.4], when: standing },
      stretch: { weight: 0.6, length: [4.6, 5.2], when: standing },
      cartwheel: {
        weight: 0.35,
        length: [4, 4.4],
        when: standing,
        start: () => (this.tipSide = Math.random() < 0.5 ? 1 : -1),
      },
      shy: { weight: 0.5, length: [4.6, 5.4], when: standing },
      hiccup: { weight: 0.5, length: [4.4, 5], when: standing, start: () => (this.hicIdx = 0) },
      spin: { weight: 0.5, length: [3.8, 4.3], when: standing },
      march: {
        weight: 0.6,
        length: [7, 10],
        when: standing,
        start: () => {
          const way = Math.random() < 0.5 ? -1 : 1;
          this.walkTo(this.s + way * this.heightPx * (2.5 + Math.random() * 2));
        },
      },
      peek: {
        weight: 0.6,
        length: [10, 12],
        when: standing,
        start: () => this.walkTo(this.s, 0),
      },
      lean: {
        weight: 0.5,
        length: [11, 13],
        when: standing,
        start: () =>
          this.walkTo(this.s + (Math.random() < 0.5 ? -1 : 1) * this.heightPx * 0.8, 0.95),
      },
      conga: {
        weight: 0.6,
        length: [10, 12],
        when: () => standing() && this.mates().length > 0,
        start: () => {
          this.mate = this.mates()[0] ?? null;
          this.home0 = this.s;
          const m = this.mate;
          if (m) this.walkTo(m.s - this.toward(m) * this.heightPx * 1.3, m.depth);
        },
      },
      tip: {
        weight: 0.5,
        length: [4.4, 5],
        when: sitting,
        start: () => {
          this.tipSide = Math.random() < 0.5 ? 1 : -1;
          this.tipped = false;
        },
      },
      napBack: { weight: 0.5, length: [10, 15], when: sitting },
      // Reactions
      hug: { weight: 0, length: [3, 4], face: 'love' },
      poked: {
        weight: 0,
        length: [1.2, 1.4],
        face: 'surprised',
        start: () => {
          this.hop.kick(this.posture === 'sit' ? 0.5 : 1.1);
          this.squash.kick(2);
          for (const side of SIDES) {
            this.puppet.kick(`ear.${sfx(side)}`, 0, 0, -side * 300);
            this.flashEar(side, BEACON.surprised!);
          }
        },
      },
      dizzy: { weight: 0, length: [4, 4], face: 'dizzy' },
    };
  }

  /** Wave hello with the arm on the mouse's side. */
  private greet(env: Env) {
    const eye = this.eyePoint(env.frame);
    // Facing the viewer, his left is the viewer's right.
    this.hello = env.pointer.x > eye.x ? 1 : -1;
    this.setAct('wave');
  }

  poke() {
    if (this.state !== 'here') return;
    const now = performance.now() / 1000;
    this.pokes = [...this.pokes.filter((at) => now - at < 3), now];
    if (this.pokes.length >= 3) {
      this.pokes = [];
      this.goal = null;
      this.posture = 'stand';
      this.setAct('dizzy');
    } else if (this.act !== 'dizzy') this.setAct('poked');
  }

  protected onEnter() {
    this.posture = 'stand';
    this.owed = true;
    this.seat.snap(0);
    this.crouch.snap(0);
  }

  protected onLeave() {
    this.posture = 'stand';
  }

  // ---------- Posing helpers ----------

  /**
   * An arm by angles (degrees): `raise` lifts it sideways from where it hangs, `forward`
   * swings it toward the viewer, `bend` lifts the forearm the same way as `raise`.
   */
  private arm(side: Side, raise: number, forward = 0, bend = 0) {
    this.puppet.add(`upper_arm.${sfx(side)}`, -forward, 0, side * raise);
    if (bend) this.puppet.add(`forearm.${sfx(side)}`, 0, 0, side * bend);
  }

  /**
   * An arm reaching for a point (his left arm's, in model space; mirrored for the right),
   * the elbow bending toward `pole`. `weight` eases it in from where it hangs.
   */
  private reach(side: Side, target: Vec, pole: Vec, weight = 1) {
    // Solve for the left arm, then mirror the turns.
    const to = v1.set(...target).sub(SHOULDER);
    const d = clamp(to.length(), Math.abs(UPPER - FORE) + 1e-3, UPPER + FORE - 1e-3);
    const n = to.normalize();
    const cos = (UPPER * UPPER + d * d - FORE * FORE) / (2 * UPPER * d);
    const m = v2.set(...pole);
    m.addScaledVector(n, -m.dot(n)).normalize();
    const elbow = v3
      .copy(n)
      .multiplyScalar(cos)
      .addScaledVector(m, Math.sqrt(Math.max(0, 1 - cos * cos)));
    // The forearm, from the elbow to the target.
    const fore = m.copy(n).multiplyScalar(d).addScaledVector(elbow, -UPPER).normalize();
    qa.setFromUnitVectors(UPPER_DIR, elbow);
    const upper = this.turnOf(qa);
    qb.setFromUnitVectors(FORE_DIR, fore);
    const lower = this.turnOf(qa.invert().multiply(qb));
    const s = sfx(side);
    this.puppet.add(
      `upper_arm.${s}`,
      upper[0] * weight,
      side * upper[1] * weight,
      side * upper[2] * weight,
    );
    this.puppet.add(
      `forearm.${s}`,
      lower[0] * weight,
      side * lower[1] * weight,
      side * lower[2] * weight,
    );
  }

  /** A rotation as the puppet's pitch, yaw and roll (yaw · pitch · roll), degrees. */
  private turnOf(q: Quaternion): Turn {
    euler.setFromQuaternion(q, 'YXZ');
    return [euler.x * DEG, euler.y * DEG, euler.z * DEG];
  }

  /** Arms folded across the chest, forearms level, the paws side by side. */
  private fold(weight: number) {
    for (const side of SIDES) this.reach(side, [0.04, 0.285, 0.145], [1, -0.1, -0.5], weight);
  }

  /** Light up an ear for a moment. */
  private flashEar(side: Side, tone = WARM) {
    this.flash[side] = 0;
    this.flashColour[side] = tone;
  }

  // ---------- Each frame ----------

  protected idle(t: number) {
    const p = this.puppet;
    const breath = sin(t, 0.25);
    p.add('body', 1.5 * breath);
    p.add('head', -1 * breath, 0, 2 * sin(t, 0.11));
    if (this.posture === 'sit') {
      // Paws resting on the line beside him.
      for (const side of SIDES) this.arm(side, 18, 12, -8);
    } else for (const side of SIDES) this.arm(side, 2 + breath, 0, 4);
    // Now and then an ear twitches.
    if (t > this.twitchAt) {
      this.twitchAt = t + 4 + Math.random() * 7;
      const side: Side = Math.random() < 0.5 ? 1 : -1;
      p.kick(`ear.${sfx(side)}`, 0, 0, -side * 220);
    }
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    const t = this.actT;
    const act = this.act;
    const L = this.actLength;
    this.env = env;
    this.high = 0;
    this.rootTurn = [0, 0, 0];
    this.legFx = { 1: [0, 0, 0, 0], [-1]: [0, 0, 0, 0] } as Record<Side, LegFx>;
    let expr: Expression | null = null;
    this.orbShow = 0;

    // A hello when the mouse turns up nearby after a while away.
    const eye = this.eyePoint(env.frame);
    const near = Math.hypot(env.pointer.x - eye.x, env.pointer.y - eye.y) < this.heightPx * 10;
    const about = env.pointer.present && env.time - env.pointer.at < 0.5 && near;
    if (about && this.state === 'here') {
      if (env.time - this.seen > 8) this.owed = true;
      this.seen = env.time;
      if (this.owed && act === 'idle' && !this.walking) {
        this.owed = false;
        this.greet(env);
      }
    }

    // Petted: he hugs himself for as long as the mouse rests on him.
    this.hover = this.hovered ? this.hover + dt : 0;
    const calm = act === 'idle' || act === 'sway' || act === 'wave' || act === 'clap';
    if (this.hover > 0.6 && calm && !this.walking) this.setAct('hug');
    if (act === 'hug' && this.hovered && t > L - 0.5) this.actLength = t + 0.5;

    // Walking stands him up; the walk is a teddy's waddle.
    const moving = Math.min(1, this.stride / (this.heightPx * 0.5));
    if (moving > 0.05) this.posture = 'stand';
    if (moving > 0) {
      const step = Math.sin(this.gait * 1.6);
      p.add('body', 3 * moving, 0, 6 * step * moving);
      p.add('head', 0, 0, -4 * step * moving);
      for (const side of SIDES) this.arm(side, 4, side * 16 * step * moving);
    }

    let squat = 0;
    /** Little hops timed to the act, metres. */
    let bounce = 0;
    const kick: Record<Side, number> = { 1: 0, [-1]: 0 } as Record<Side, number>;
    switch (act) {
      case 'dance': {
        if (t < INTRO) {
          squat = 1;
          this.fold(clamp(t / 0.35, 0, 1));
        } else if (t < L - FINALE) {
          // Kicks, left and right in turn, a hop on each switch, faster and faster.
          squat = 1;
          const k = clamp((t - INTRO) / Math.max(1, L - INTRO - FINALE - 0.8), 0, 1);
          this.beat += dt * (1.5 + 2.2 * k * k);
          const n = Math.floor(this.beat);
          const side: Side = n % 2 ? -1 : 1;
          if (n !== this.beats) {
            this.beats = n;
            p.kick('head', 60, 0, 0);
            this.flashEar(side, RAINBOW[n % RAINBOW.length]);
          }
          // Out for most of the beat, then back in with a hop onto the other foot.
          const u = this.beat - n;
          kick[side] = u < 0.6 ? 1 : 0;
          bounce = 0.016 * Math.sin(Math.PI * clamp((u - 0.6) / 0.4, 0, 1));
          this.fold(1);
          p.add('body', 0, side * 8, -side * 5);
          p.add('head', 0, side * 6, side * 8);
        } else {
          // Up he jumps, arms thrown wide: ta-da.
          if (!this.jumped) {
            this.jumped = true;
            this.hop.kick(1.3);
            this.squash.kick(-2);
            for (const side of SIDES) this.flashEar(side, WARM);
          }
          for (const side of SIDES) this.arm(side, 95, 10, 25);
          p.add('head', -8);
          if (this.bowAfter && t > L - 0.1) {
            this.bowAfter = false;
            this.setAct('bow');
          }
        }
        break;
      }
      case 'wave': {
        // One arm up high, the forearm wagging; or both, bouncing on his toes.
        const wag = 24 * sin(t, 2.4);
        const k = clamp(t / 0.3, 0, 1) * clamp((L - t) / 0.4, 0, 1);
        const sides = this.waving === 0 ? SIDES : [this.waving];
        const tick = Math.floor(t * 2.4) !== Math.floor((t - dt) * 2.4);
        for (const side of sides) {
          // One arm goes out wide so the paw clears his big head; both go up.
          const both = this.waving === 0;
          this.arm(side, (both ? 86 : 62) * k, 8 * k, ((both ? 42 : 72) + wag) * k);
          if (tick) this.flashEar(side, WARM);
        }
        if (this.waving === 0) {
          if (this.posture === 'stand') bounce = 0.008 * Math.abs(Math.sin(Math.PI * t * 2.4));
        } else {
          p.add('body', 0, 0, -this.waving * 4 * k);
          p.add('head', 0, this.waving * 8 * k, this.waving * 7 * k);
        }
        break;
      }
      case 'clap': {
        // Paws apart and together in front of his chest.
        const k = clamp(t / 0.3, 0, 1) * clamp((L - t) / 0.3, 0, 1);
        const phase = t * 2.6;
        const open = 0.5 + 0.5 * Math.cos(2 * Math.PI * phase);
        for (const side of SIDES)
          this.reach(side, [0.037 + 0.05 * open, 0.3, 0.14], [1, -1, -0.2], k);
        const n = Math.floor(phase + 0.5);
        if (n > this.claps && k > 0.9) {
          this.claps = n;
          for (const side of SIDES) this.flashEar(side, WARM);
          p.kick('head', 50, 0, 0);
        }
        if (this.posture === 'stand') bounce = 0.006 * (1 - open) * k;
        p.add('head', -5);
        break;
      }
      case 'sway': {
        const s = sin(t, 0.45);
        const k = clamp(t / 0.8, 0, 1) * clamp((L - t) / 0.8, 0, 1);
        p.add('body', 0, 0, 8 * s * k);
        p.add('head', 0, 0, 10 * sin(t, 0.45, 0.1) * k);
        for (const side of SIDES) this.arm(side, (14 + 10 * s * side) * k, 6 * k, 10 * k);
        break;
      }
      case 'bow': {
        // A deep bow from the waist, one paw on his belly, the other arm swept out.
        const k = clamp(t / 0.6, 0, 1) * clamp((L - t) / 0.7, 0, 1);
        const e = k * k * (3 - 2 * k);
        p.add('body', 36 * e);
        p.add('head', 14 * e);
        this.reach(-1, [0.035, 0.24, 0.145], [1, -1, 0], e);
        this.arm(1, 50 * e, -25 * e, 10 * e);
        break;
      }
      case 'nap': {
        const breath = sin(t, 0.2);
        p.add('head', 18 + 3 * breath, 0, 10);
        p.add('body', -4 + 1.5 * breath);
        break;
      }
      case 'hug': {
        // Arms round his belly, rocking side to side.
        const k = clamp(t / 0.4, 0, 1) * clamp((L - t) / 0.4, 0, 1);
        for (const side of SIDES) this.reach(side, [0.085, 0.215, 0.12], [1, -0.4, -0.2], k);
        p.add('body', 0, 0, 6 * sin(t, 0.6) * k);
        p.add('head', 6 * k, 0, 12 * sin(t, 0.6, 0.12) * k);
        break;
      }
      case 'squeeze': {
        // A big squeeze of himself: arms crossed tight over his chest, rocking, happy feet.
        const k = span(t, 0, 0.5, L - 0.5, L);
        const tight = k * (0.6 + 0.4 * (0.5 + 0.5 * Math.sin(t * 6.9 - 1.5)));
        for (const side of SIDES)
          this.reach(side, [-0.05, 0.26, side === 1 ? 0.13 : 0.165], [1, -0.4, -0.2], k);
        const n = Math.floor(t * 1.1);
        if (n !== this.beats && k > 0.9) {
          this.beats = n;
          this.squash.kick(-1.2);
          for (const side of SIDES) this.flashEar(side, LOVE);
        }
        p.add('body', 10 * tight, 0, 7 * sin(t, 0.55) * k);
        p.add('head', 12 * tight, 0, 12 * sin(t, 0.55, 0.12) * k);
        for (const side of SIDES) {
          const hop = Math.max(0, Math.sin(t * 2 * Math.PI * 1.1 + (side > 0 ? 0 : Math.PI)));
          this.legFx[side] = [-22 * hop * k, 26 * hop * k, 0, 0];
        }
        expr = 'love';
        break;
      }
      case 'magic': {
        // A flourish, a deep bow, then up with both arms thrown high: ta-da.
        if (t < 1.7) {
          const k = ease(t, 0, 0.4) * (1 - ease(t, 1.4, 1.7));
          const w = 2 * Math.PI * 1.7 * t;
          this.reach(
            -1,
            [0.1 + 0.06 * Math.cos(w), 0.29 + 0.07 * Math.sin(w), 0.14],
            [1, -1, -0.2],
            k,
          );
          this.reach(1, [0.035, 0.24, 0.145], [1, -1, 0], k);
          p.add('head', 0, -8 * k, -8 * k);
          const n = Math.floor(t * 1.7);
          if (n !== this.beats) {
            this.beats = n;
            this.flashEar(-1, RAINBOW[n % RAINBOW.length]);
          }
          expr = 'wink';
        } else if (t < 3.6) {
          const k = ease(t, 1.7, 2.3) * (1 - ease(t, 3.0, 3.6));
          p.add('body', 34 * k);
          p.add('head', 12 * k);
          this.reach(1, [0.035, 0.24, 0.145], [1, -1, 0], k);
          this.arm(-1, 75 * k, -40 * k, 8 * k);
          expr = 'happy';
        } else {
          if (this.stage === 0) {
            this.stage = 1;
            this.hop.kick(1.1);
            this.squash.kick(-1.6);
            for (const side of SIDES) this.flashEar(side, RAINBOW[side === 1 ? 1 : 3]);
          }
          const k = ease(t, 3.6, 3.9) * (1 - ease(t, L - 0.6, L));
          for (const side of SIDES) this.arm(side, 120 * k, 12 * k, 18 * k);
          p.add('head', -10 * k);
          expr = 'happy';
        }
        break;
      }
      case 'drum': {
        // Paws on his belly, alternately, faster: the heart flashes with each hit.
        const k = span(t, 0, 0.5, L - 0.9, L - 0.3);
        this.beat += dt * (3 + 1.8 * ease(t, 0.8, L - 1.2));
        const n = Math.floor(this.beat);
        for (const side of SIDES) {
          const out = 0.5 + 0.5 * Math.cos(Math.PI * (this.beat + (side > 0 ? 0 : 1)));
          this.reach(side, [0.055, 0.225, 0.14 + 0.07 * out], [1, -0.4, -0.2], k);
        }
        if (n !== this.beats && k > 0.6) {
          this.beats = n;
          const side: Side = n % 2 ? 1 : -1;
          this.thump = 1;
          this.squash.kick(-0.7);
          this.flashEar(side, RAINBOW[n % RAINBOW.length]);
          p.kick('head', 25, 0, 0);
        }
        p.add('body', -3 * k, 0, 3 * Math.sin(Math.PI * this.beat) * k);
        p.add('head', 0, 0, -5 * Math.sin(Math.PI * this.beat) * k);
        if (t > L - 0.9) for (const side of SIDES) this.arm(side, 100 * (1 - k), 10 * (1 - k), 25);
        expr = 'happy';
        break;
      }
      case 'tap': {
        // Toe and heel, quick doubles left and right, jazz hands, and a ta-da.
        const k = span(t, 0, 0.5, L - 0.9, L - 0.2);
        this.beat += dt * 4.2;
        const n = Math.floor(this.beat);
        const u = this.beat - n;
        const side = TAPS[n % TAPS.length];
        const lift = u < 0.6 ? Math.sin((Math.PI * u) / 0.6) : 0;
        const slam = u >= 0.6 ? Math.sin((Math.PI * (u - 0.6)) / 0.4) : 0;
        this.legFx[side] = [-26 * lift * k, 34 * lift * k, (10 * lift + 32 * slam) * k, 0];
        bounce = 0.008 * slam * k;
        if (n !== this.beats && k > 0.5) {
          this.beats = n;
          this.flashEar(side, WARM);
          p.kick('head', 18, 0, 0);
        }
        for (const s2 of SIDES)
          this.arm(s2, (55 + 20 * sin(t, 2.1, s2 > 0 ? 0 : 0.5)) * k, 8 * k, -15 * k);
        p.add('body', 0, 0, 4 * side * k);
        if (t > L - 0.9) {
          for (const s2 of SIDES) this.arm(s2, 110, 10, 15);
          if (this.stage === 0) {
            this.stage = 1;
            this.hop.kick(0.9);
            for (const s2 of SIDES) this.flashEar(s2, WARM);
          }
        }
        expr = 'happy';
        break;
      }
      case 'juggle': {
        // Three lit balls in a cascade, paws bobbing, eyes following the top of the arc.
        const k = span(t, 0, 0.6, L - 0.7, L - 0.2);
        this.orbShow = span(t, 0.5, 0.9, L - 0.7, L - 0.3);
        for (const side of SIDES) {
          const hand = 0.25 + 0.02 * Math.sin(2 * Math.PI * (0.75 * t + (side > 0 ? 0 : 0.5)));
          this.reach(side, [0.07, hand, 0.16], [1, -1, -0.2], k);
        }
        for (let i = 0; i < 3; i++) {
          const s2 = t * 1.5 + (i * 2) / 3;
          const f = s2 - Math.floor(s2);
          const from = Math.floor(s2) % 2 ? -0.07 : 0.07;
          this.orbAt[i].set(from * (1 - 2 * f), 0.26 + 0.1 * 4 * f * (1 - f), 0.17);
        }
        const n = Math.floor(t * 1.5);
        if (n !== this.beats && this.orbShow > 0.6) {
          this.beats = n;
          this.flashEar(n % 2 ? 1 : -1, RAINBOW[n % RAINBOW.length]);
        }
        p.add('head', -6 * k, 9 * k * sin(t, 0.75), 0);
        p.add('body', -2 * k);
        expr = t > L - 1 ? 'happy' : 'focused';
        break;
      }
      case 'roar': {
        // Breathes in, a great roar with claws up, and out comes a squeak: paw over mouth.
        if (t < 0.8) {
          const e = ease(t, 0, 0.8);
          p.add('body', -10 * e);
          p.add('head', -4 * e);
          for (const side of SIDES) this.arm(side, 28 * e, 10 * e, 20 * e);
          expr = 'neutral';
        } else if (t < 2.2) {
          if (this.stage === 0) {
            this.stage = 1;
            for (const side of SIDES) {
              p.kick(`ear.${sfx(side)}`, 0, 0, side * 380);
              this.flashEar(side, RED);
            }
          }
          const shake = sin(t, 13);
          p.add('body', -7 + shake * 1.2, 0, shake * 2);
          p.add('head', -24 + shake * 3);
          for (const side of SIDES) this.arm(side, 100, 20, 70 + shake * 6);
          squat = 0.4;
          expr = 'cross';
        } else {
          if (this.stage === 1) {
            this.stage = 2;
            this.hop.kick(0.7);
            this.squash.kick(-2.2);
            this.thump = 1;
            for (const side of SIDES) this.flashEar(side, BEACON.surprised!);
          }
          const e = ease(t, 2.5, 3.0) * (1 - ease(t, L - 0.6, L));
          this.reach(1, [0.03, 0.39, 0.16], [1, -0.4, -0.2], e);
          this.arm(-1, 15 * e, 10 * e, 20 * e);
          p.add('head', 8 * e, 0, 8 * e);
          expr = t < 2.5 ? 'surprised' : 'happy';
        }
        break;
      }
      case 'sniff': {
        // Nose down, three little sniffs at a time, then a long happy sigh and a belly pat.
        const k = span(t, 0, 0.6, L - 1.9, L - 1.3);
        const group = Math.max(0, Math.sin(2 * Math.PI * 3 * t)) * (t % 1.8 < 0.9 ? 1 : 0.15);
        p.add('body', 20 * k + 3 * group * k);
        p.add('head', 22 * k + 7 * group * k);
        for (const side of SIDES) this.arm(side, 10 * k, -12 * k, 6 * k);
        const end = ease(t, L - 1.9, L - 1.3) * (1 - ease(t, L - 0.4, L));
        p.add('head', -18 * end);
        this.reach(1, [0.06, 0.22, 0.14], [1, -0.4, -0.2], end);
        p.add('body', 0, 0, 6 * sin(t, 0.6) * end);
        expr = end > 0.3 ? 'love' : 'focused';
        break;
      }
      case 'stretch': {
        // Arms up, up, on tiptoe, trembling, a huge yawn, and a shake.
        const up = ease(t, 0, 1) * (1 - ease(t, L - 1.2, L - 0.6));
        const yawn = ease(t, 1.4, 2) * (1 - ease(t, 3.3, 3.8));
        const tremble = Math.sin(t * 2 * Math.PI * 8) * up;
        for (const side of SIDES) this.arm(side, 138 * up + tremble * 2, 18 * up, 8 * up);
        p.add('body', -8 * up - 4 * yawn);
        p.add('head', -6 * up - 16 * yawn);
        bounce = 0.012 * up;
        for (const side of SIDES) this.legFx[side] = [0, 0, 26 * up, 0];
        if (t > L - 0.7 && this.stage === 0) {
          this.stage = 1;
          this.squash.kick(-1);
          for (const side of SIDES) p.kick(`ear.${sfx(side)}`, 0, 0, side * 300);
        }
        expr = yawn > 0.2 ? 'sleepy' : up > 0.5 ? 'wink' : 'happy';
        break;
      }
      case 'cartwheel': {
        // A wind-up, a hop, a tumble sideways with his legs flung out... and a plop.
        const wind = ease(t, 0, 0.6);
        const roll = 70 * ease(t, 0.6, 1.3) * (1 - ease(t, 1.9, 2.7));
        if (t < 0.6) {
          squat = 0.7 * wind;
          for (const side of SIDES) this.arm(side, 150 * wind, 20 * wind, 10);
        } else {
          for (const side of SIDES) this.arm(side, 150, 20, 10);
          const air = ease(t, 0.6, 1.0) * (1 - ease(t, 2.3, 2.7));
          kick[1] = kick[-1] = air;
          bounce = 0.05 * air;
          if (this.stage === 0) {
            this.stage = 1;
            this.hop.kick(1.2);
          }
        }
        this.rootTurn = [0, 0, roll * this.tipSide];
        if (t > 2.7 && this.stage === 1) {
          this.stage = 2;
          this.posture = 'sit';
          this.thumped = false;
        }
        expr = t > 2.7 ? 'dizzy' : t > 1.3 ? 'surprised' : 'happy';
        break;
      }
      case 'shy': {
        // Paws over his face, a peek, another, and then hello! arms wide.
        const cover = ease(t, 0, 0.6) * (1 - ease(t, L - 1.5, L - 1.2));
        const peek = Math.max(0, sin(t, 0.5)) * ease(t, 1.5, 2) * (1 - ease(t, L - 2, L - 1.5));
        for (const side of SIDES) {
          const w = cover * (side === 1 ? 1 - 0.55 * peek : 1);
          this.reach(side, [0.065, 0.43, 0.15], [1, 0.5, -0.5], w);
        }
        p.add('head', 10 * cover);
        p.add('body', 6 * cover, 0, 5 * sin(t, 0.5) * cover);
        const reveal = ease(t, L - 1.2, L - 0.9) * (1 - ease(t, L - 0.3, L));
        for (const side of SIDES) this.arm(side, 100 * reveal, 12 * reveal, 20 * reveal);
        if (t > L - 1.2 && this.stage === 0) {
          this.stage = 1;
          this.hop.kick(0.9);
          for (const side of SIDES) this.flashEar(side, HONEY);
        }
        expr =
          t > L - 1.2 ? 'happy' : peek > 0.4 ? 'surprised' : cover > 0.6 ? 'asleep' : 'neutral';
        break;
      }
      case 'hiccup': {
        // Little jerks with a flash of the heart, then a paw over his mouth.
        const at = HICCUPS[this.hicIdx];
        if (at !== undefined && t > at) {
          this.hicIdx++;
          p.kick('body', -140, 0, 0);
          p.kick('head', 220, 0, 0);
          this.hop.kick(0.45);
          this.squash.kick(-0.7);
          this.thump = 1;
          this.flashEar(this.hicIdx % 2 ? 1 : -1, BEACON.surprised!);
        }
        const last = HICCUPS[this.hicIdx - 1] ?? -1;
        const e = ease(t, 2.6, 3.0) * (1 - ease(t, L - 0.4, L));
        this.reach(1, [0.03, 0.39, 0.16], [1, -0.4, -0.2], e);
        expr = t - last < 0.3 ? 'surprised' : 'neutral';
        break;
      }
      case 'spin': {
        // A pirouette, arms out, one leg tucked, two turns; then a little bow.
        const e = span(t, 0, 0.5, L - 1, L - 0.4);
        const yaw = 720 * ease(t, 0.5, 2.6);
        this.rootTurn = [0, yaw, 0];
        for (const side of SIDES) this.arm(side, 100 * e, 12 * e, 28 * e);
        this.legFx[-1] = [38 * e, 70 * e, 0, 0];
        bounce = 0.012 * e;
        const n = Math.floor(yaw / 90);
        if (n !== this.beats && e > 0.5) {
          this.beats = n;
          this.flashEar(n % 2 ? 1 : -1, RAINBOW[n % RAINBOW.length]);
        }
        const bow = ease(t, L - 1.2, L - 0.7) * (1 - ease(t, L - 0.5, L));
        p.add('body', 18 * bow);
        expr = 'happy';
        break;
      }
      case 'march': {
        // Knees high, arms swinging, head up, an ear flash on every step; a salute at the end.
        const arrived = !this.walking && t > 1;
        this.high = arrived ? 0 : 1;
        const step = Math.sin(this.gait * 1.6);
        if (moving > 0) {
          for (const side of SIDES) this.arm(side, 8, side * 34 * step * moving, 40 * moving);
          p.add('head', -6 * moving);
          p.add('body', -3 * moving);
          const n = Math.floor((this.gait * 1.6) / Math.PI);
          if (n !== this.beats) {
            this.beats = n;
            this.flashEar(n % 2 ? 1 : -1, WARM);
          }
        }
        if (arrived) {
          if (this.stage === 0) {
            this.stage = 1;
            this.did = t;
          }
          const s2 = t - this.did;
          const e = span(s2, 0, 0.3, 1.4, 1.8);
          this.reach(-1, [0.14, 0.44, 0.08], [1, 0.2, -0.5], e);
          p.add('head', -5 * e);
          expr = 'happy';
          if (s2 > 1.9 && this.stage === 1) {
            this.stage = 2;
            this.hop.kick(0.5);
          }
        }
        break;
      }
      case 'peek': {
        // To the front lip, leaning over it to look down at us, left, then right.
        const at = this.there && t > 0.5;
        if (at && this.stage === 0) {
          this.stage = 1;
          this.did = t;
        }
        if (this.stage === 1) {
          const s2 = t - this.did;
          const k = span(s2, 0, 0.8, 5.2, 6);
          p.add('body', 24 * k);
          p.add('head', 18 * k, 24 * k * sin(s2, 0.3), 0);
          for (const side of SIDES) this.arm(side, 20 * k, 62 * k, -8 * k);
          for (const side of SIDES) this.legFx[side] = [0, 0, 20 * k, 0];
          expr = k > 0.3 ? 'surprised' : 'neutral';
          if (s2 > 6.2) {
            this.stage = 2;
            this.walkTo(this.s, 0.2);
            this.hop.kick(0.4);
          }
        }
        if (this.stage === 2) expr = 'happy';
        break;
      }
      case 'lean': {
        // To the back wall, leaning on it with his arms folded and one foot over the other,
        // whistling: an ear flashes with each note.
        const at = this.there && t > 0.8;
        if (at && this.stage === 0) {
          this.stage = 1;
          this.did = t;
        }
        if (this.stage === 1) {
          const s2 = t - this.did;
          const k = span(s2, 0, 0.8, 7, 7.8);
          this.fold(k);
          p.add('body', -7 * k, 0, 0);
          p.add('head', -4 * k, 0, 8 * k);
          this.legFx[1] = [-12 * k, 8 * k, 14 * k, -22 * k];
          this.legFx[-1] = [0, 0, 12 * Math.max(0, Math.sin(2 * Math.PI * 1.5 * s2)) * k, 0];
          const n = Math.floor(s2 / 0.45);
          if (n !== this.beats && k > 0.8 && n % 5 < 3) {
            this.beats = n;
            this.flashEar(n % 2 ? 1 : -1, RAINBOW[n % RAINBOW.length]);
          }
          expr = Math.floor(s2 / 2.5) % 2 ? 'wink' : 'happy';
          if (s2 > 8) {
            this.stage = 2;
            this.walkTo(this.s, 0.2);
          }
        }
        break;
      }
      case 'conga': {
        // Over to a crewmate, then one, two, three, KICK, hands out in front, shimmying.
        const m = this.mate;
        if ((!m || m.state !== 'here') && this.stage === 0) this.stage = 3;
        if (this.stage === 0 && this.there && t > 0.6) {
          this.stage = 1;
          this.did = t;
        }
        this.high = this.walking ? 0.6 : 0;
        if (this.stage === 1) {
          const s2 = t - this.did;
          const k = span(s2, 0, 0.4, 6.4, 7);
          this.beat += dt * 2.6;
          const n = Math.floor(this.beat);
          const u = this.beat - n;
          const c = n % 4;
          const side = CONGA[c];
          const lift = Math.sin(Math.PI * u);
          this.legFx[side] =
            c === 3
              ? [-62 * lift * k, 4 * lift * k, -16 * lift * k, 8 * lift * k]
              : [-30 * lift * k, 34 * lift * k, 0, 0];
          bounce = 0.006 * lift * k;
          if (n !== this.beats && k > 0.5) {
            this.beats = n;
            this.flashEar(side, RAINBOW[n % RAINBOW.length]);
            if (c === 3) p.kick('head', 30, 0, 0);
          }
          for (const s3 of SIDES)
            this.reach(
              s3,
              [0.13, 0.25 + 0.02 * Math.sin(Math.PI * this.beat * 2), 0.15],
              [1, -0.4, 0],
              k,
            );
          p.add('body', 0, 0, 8 * Math.sin(Math.PI * this.beat) * k);
          expr = 'happy';
          if (s2 > 7.2) this.stage = 3;
        }
        if (this.stage === 3) {
          this.stage = 4;
          this.walkTo(this.home0, 0.2);
        }
        if (this.stage === 4) expr = 'happy';
        break;
      }
      case 'tip': {
        // Sitting, he wobbles, tips right over on his side, legs waving, and rights himself.
        const lean = span(t, 0.4, 1.5, 2.8, 3.3);
        const s2 = this.tipSide;
        p.add('body', 0, 0, s2 * (38 * lean + 5 * Math.sin(t * 9) * ease(t, 0, 0.5) * (1 - lean)));
        p.add('head', 0, 0, s2 * 10 * lean);
        const flail = Math.sin(t * 2 * Math.PI * 3) * lean;
        for (const side of SIDES) {
          this.arm(side, (55 + 22 * flail * side) * lean, 5 * lean, 10 * lean);
          this.legFx[side] = [-14 * lean * (side === s2 ? 0.4 : 1), 0, 0, side * 10 * flail];
        }
        if (t > 3.3 && !this.tipped) {
          this.tipped = true;
          this.squash.kick(-1.8);
          this.hop.kick(0.35);
          p.kick('head', 120, 0, 0);
          for (const side of SIDES) this.flashEar(side, WARM);
        }
        expr = t < 0.4 ? 'neutral' : t < 3.3 ? 'surprised' : 'happy';
        break;
      }
      case 'napBack': {
        // Sitting, he lets himself lie back, arms out, and dozes.
        const lie = ease(t, 0.5, 2) * (1 - ease(t, L - 1.6, L - 0.4));
        const breath = sin(t, 0.2);
        p.add('body', -52 * lie + 1.5 * breath * lie);
        p.add('head', 6 * lie);
        for (const side of SIDES) this.arm(side, 42 * lie, 8 * lie, 24 * lie);
        expr = lie > 0.85 ? 'asleep' : lie > 0.05 ? 'sleepy' : 'neutral';
        break;
      }
      case 'poked':
        for (const side of SIDES) this.arm(side, 60, 15, 40);
        p.add('head', -10);
        break;
      case 'dizzy': {
        // Staggering round in circles, arms out for balance, then down on his bottom.
        const a = 2 * Math.PI * 1.1 * t;
        const k = clamp((2.6 - t) / 0.3, 0, 1);
        p.add('body', 7 * Math.cos(a) * k, 0, 8 * Math.sin(a) * k);
        p.add('head', -6 * Math.sin(a), 0, 8 * Math.cos(a));
        for (const side of SIDES)
          this.arm(side, (40 + 15 * Math.sin(a * 1.3 + side)) * k, 0, 20 * k);
        kick[1] = 0.25 * Math.max(0, Math.sin(a)) * k;
        kick[-1] = 0.25 * Math.max(0, -Math.sin(a)) * k;
        if (t > 2.6 && this.posture === 'stand') {
          this.posture = 'sit';
          this.thumped = false;
        }
        break;
      }
    }

    // Crouch for the dance, sit, hop and squash: all through the root.
    const crouch = this.crouch.update(dt, squat * SQUAT);
    const seat = clamp(this.seat.update(dt, this.posture === 'sit' ? 1 : 0), 0, 1);
    if (!this.thumped && seat > 0.93) {
      // Down with a thump: squash, ears and head bouncing.
      this.thumped = true;
      this.squash.kick(-2.6);
      p.kick('head', 160, 0, 0);
      for (const side of SIDES) {
        p.kick(`ear.${sfx(side)}`, 0, 0, side * 260);
        this.flashEar(side, BEACON.neutral);
      }
    }
    const lift = Math.max(0, this.hop.update(dt, 0));
    p.shift('root', 0, lift + bounce - crouch - SEAT * seat, 0);
    for (const side of SIDES) this.kicks[side].update(dt, kick[side]);
    this.legs = { crouch, seat, moving };

    // How he looks when no act says.
    if (act === 'dizzy') this.expression = 'dizzy';
    else this.expression = expr ?? (this.hovered ? 'happy' : 'neutral');
  }

  /** Legs are posed directly, after the springs: folded to keep his feet on the line. */
  private poseLegs() {
    const p = this.puppet;
    const { crouch, seat, moving } = this.legs;
    const step = Math.sin(this.gait * 1.6);
    const swing = Math.cos(this.gait * 1.6);
    for (const side of SIDES) {
      const s = sfx(side);
      const k = clamp(this.kicks[side].y, -0.2, 1.2);
      // Folding to the crouch: knees forward (and out, like a frog), feet flat.
      const a = Math.acos(clamp((LEG - crouch) / LEG, -1, 1)) * DEG * (1 - k) * (1 - seat);
      const splay = (crouch / SQUAT) * 22 * (1 - seat);
      // Walking: the leg swinging forward lifts its knee.
      const walk = side * step * moving;
      const knee = Math.max(0, side * swing) * moving;
      let thigh = -a - 28 * walk - 18 * knee;
      let shin = 2 * a + 35 * knee;
      let foot = -a - 17 * knee + 28 * walk;
      // A kick: the leg straight out in front and to the side, heel first.
      thigh += -55 * k;
      foot += -40 * k;
      // Sitting: legs straight out in front, soles to the viewer.
      thigh += -86 * seat;
      shin *= 1 - seat;
      foot *= 1 - seat;
      const fx = this.legFx[side];
      // Marching lifts the knee of the leg swinging forward.
      thigh += fx[0] - 50 * knee * this.high;
      shin += fx[1] + 60 * knee * this.high;
      foot += fx[2];
      p.turn(`thigh.${s}`, thigh, side * splay * (1 - k), side * (50 * k + 10 * seat + fx[3]));
      p.turn(`shin.${s}`, shin);
      p.turn(`foot.${s}`, foot);
    }
  }

  /** The heart and the ear lights. */
  private lights(dt: number, env: Env) {
    const time = env.time;
    const act = this.act;
    const face = this.face?.expression ?? 'neutral';
    // The heart: a lub-dub, quicker and brighter when he's happy, pink in a hug.
    let rate = 0.9;
    let tone = BEACON.neutral!;
    let rest = 0.25;
    if (face === 'happy' || face === 'wink') [rate, tone, rest] = [1.6, WARM, 0.45];
    if (act === 'hug') [rate, tone, rest] = [1.8, LOVE, 0.6];
    if (act === 'poked') [rate, tone, rest] = [3, BEACON.surprised!, 0.6];
    if (act === 'dance' && this.actT > INTRO) {
      tone = RAINBOW[Math.max(0, this.beats) % RAINBOW.length];
      rate = 0;
    }
    if (act === 'roar' && this.actT > 0.7 && this.actT < 2.3) [rate, tone, rest] = [4, RED, 0.7];
    if (act === 'sniff') [rate, tone, rest] = [2.2, HONEY, 0.5];
    if (act === 'squeeze') [rate, tone, rest] = [2.2, LOVE, 0.7];
    if (['tap', 'juggle', 'spin', 'magic', 'conga'].includes(act))
      [rate, tone, rest] = [2, RAINBOW[Math.floor(time * 2) % RAINBOW.length], 0.5];
    if (face === 'dizzy') tone = RAINBOW[Math.floor(time * 6) % RAINBOW.length];
    let level: number;
    if (face === 'asleep') level = 0.12 + 0.1 * Math.sin(time * 1.2);
    else if (rate === 0) level = Math.max(0.35, 1 - (this.beat % 1) * 1.6);
    else {
      const u = (time * rate) % 1;
      level = rest + (1 - rest) * Math.max(bump(u - 0.08, 0.08), 0.7 * bump(u - 0.3, 0.08));
    }
    // A hit on the drum, a hiccup: the heart flashes and fades.
    this.thump = Math.max(0, this.thump - dt * 3);
    if (this.thump > 0) {
      level = Math.max(level, this.thump);
      if (act === 'drum') tone = RAINBOW[Math.max(0, this.beats) % RAINBOW.length];
    }
    this.heart.lerp(colour.set(tone).lerp(DIM, 0.7 * (1 - level)), Math.min(1, dt * 12));
    this.outfit.beacon(this.heart);

    // The ears: dark, but for flashes (a kick, a clap, a wave) and a glow in a hug.
    for (const side of SIDES) {
      this.flash[side] += dt;
      let glow = Math.max(0, 1 - this.flash[side] * 2.5);
      let ear = this.flashColour[side];
      if (act === 'hug') {
        glow = Math.max(glow, 0.55 + 0.35 * Math.sin(time * 3));
        ear = LOVE;
      } else if (act === 'sway') {
        glow = Math.max(
          glow,
          0.5 + 0.5 * Math.sin(time * 2 * Math.PI * 0.45 + (side > 0 ? 0 : Math.PI)),
        );
        ear = WARM;
      } else if (face === 'dizzy') {
        glow = Math.sin(time * 9 + side * 1.7) > 0.3 ? 1 : 0.1;
        ear = RAINBOW[(Math.floor(time * 4) + (side > 0 ? 0 : 2)) % RAINBOW.length];
      }
      this.outfit.dot(side === 1 ? 0 : 1, glow, ear);
    }
  }

  protected after(dt: number, env: Env) {
    this.poseLegs();
    this.lights(dt, env);
    const [rp, ry, rr] = this.rootTurn;
    if (rp || ry || rr) this.puppet.turn('root', rp, ry, rr);
    // The juggler's balls.
    this.orbs.forEach((orb, i) => {
      this.outfit.dot(2 + i, 1, RAINBOW[i]);
      orb.visible = this.orbShow > 0.02;
      orb.position.copy(this.orbAt[i]);
      orb.scale.setScalar(Math.max(0.01, this.orbShow));
    });
    const sq = clamp(this.squash.update(dt, 1), 0.75, 1.25);
    this.puppet.stretch('root', sq, [0, 1, 0], 1 / Math.sqrt(sq));
  }
}
