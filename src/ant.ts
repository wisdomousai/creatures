import type { Object3D } from 'three';
import { type Act, type Character, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import type { Reaction } from './birds';
import { Bug, ease, SIDES, span } from './bug';
import { sin } from './moves';
import { Spring } from './spring';

/**
 * Atlas, the robot ant: three round balls on a pinched waist, a big round screen-faced head
 * with chunky mandibles and long elbowed antennae, a gaster with two lit bands, and six
 * sturdy legs. He is strong and busy. A crumb bigger than he is turns up in front of him;
 * he picks it up in his jaws and marches it across the floor, wobbling under it, nearly
 * toppling and catching himself, and sets it down with a satisfied look. He marches in a
 * line of one, quick and straight, stops to flick his antennae at a crewmate in code (his
 * bands blinking the dots and dashes), lifts the crumb overhead like a weightlifter,
 * sniffs the floor in zigzags for a scent trail, salutes with a front leg, cleans his
 * antennae, does a little jig, and naps.
 *
 * A poke makes him jump, crumb or not; three make him spin dizzy; the mouse resting on him
 * makes him stand tall and wave.
 */
export const ANT_FACE: FaceLayout = {
  width: 256,
  height: 192,
  eyes: [
    [0.3, 0.5],
    [0.7, 0.5],
  ],
  rx: 0.11,
  ry: 0.28,
  line: 0.05,
  mouth: [0.5, 0.82],
};

export class Ant extends Bug {
  static readonly terms =
    'insect bug worker colony red orange coral brown black six legs antennae mandibles strong carries crumb marches lifts weightlifter busy tiny small';

  private crumbS = new Spring(4, 0.6);
  private carryS = new Spring(4, 0.45);
  private liftS = new Spring(5, 0.45);
  private turnS = new Spring(3, 0.8);
  private rearS = new Spring(5, 0.5);
  private wobbleS = new Spring(3, 0.25);
  // Per-frame requests from acts, cleared in idle().
  private crumb = 0;
  private carry = 0;
  private lift = 0;
  private rear = 0;
  private yaw = 0;
  private code = 0;
  private flash = 0;
  private wobble = 0;
  private lamp: ((i: number, t: number) => number) | null = null;
  private actSpeed = 1.2;
  private dir = 1;
  private stage = 0;
  private since = 0;
  private mate: Character | null = null;

  constructor(model: Object3D) {
    super(
      {
        name: 'Atlas',
        model: 'ant',
        metres: 0.42,
        width: 0.55,
        size: 0.4,
        feels: {
          default: { f: 4, zeta: 0.6 },
          root: { f: 4, zeta: 0.55 },
          body: { f: 5, zeta: 0.45 },
          abdomen: { f: 6, zeta: 0.35 },
          head: { f: 5, zeta: 0.5, r: 0.5 },
          'jaw.L': { f: 7, zeta: 0.5 },
          'jaw.R': { f: 7, zeta: 0.5 },
          'antenna.L.1': { f: 3.5, zeta: 0.35 },
          'antenna.R.1': { f: 3.5, zeta: 0.35 },
          'antenna.L.2': { f: 4.5, zeta: 0.2 },
          'antenna.R.2': { f: 4.5, zeta: 0.2 },
        },
        face: ANT_FACE,
        eyes: 0.64,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.8 },
          { bone: 'body', yaw: 0.15, pitch: 0 },
        ],
        reach: { yaw: 50, pitch: 25 },
        lag: 1.5,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 1.2,
        turn: 70,
        roam: true,
      },
      model,
    );
    this.acts = { ...this.moves(), ...this.reactions() };
  }

  private moves(): Record<string, Act> {
    const p = this.puppet;
    const still = () => this.still() && this.state === 'here';
    return {
      idle: { weight: 3, length: [2.5, 5] },
      march: {
        weight: 1.8,
        length: [4, 6],
        face: 'determined',
        when: this.still,
        start: () => {
          this.actSpeed = 2.2;
          this.amble(2.5 + Math.random() * 2);
        },
        pose: () => {
          // In a line of one: quick, straight, never looking round.
          this.actSpeed = 2.2;
          this.yaw = 82 * (this.dir || 1);
          p.add('head', -4);
        },
      },
      carry: {
        weight: 3,
        length: [12, 13],
        face: 'determined',
        when: still,
        start: () => {
          this.stage = 0;
          this.dir = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          // A crumb bigger than he is turns up in front of him. He gets his jaws round
          // it, heaves, and marches it across the floor, wobbling under the weight; it
          // sways, he catches it; at the far end he sets it down and puffs.
          const end = this.actLength;
          this.crumb = ease(t, 0.2, 1) * (1 - ease(t, end - 1.4, end - 0.6));
          const on = span(t, 1.2, 2, end - 3, end - 2);
          this.carry = on;
          this.actSpeed = 0.6;
          this.yaw = this.dir * 70 * span(t, 1.6, 2.4, end - 2.6, end - 1.8);
          if (this.stage === 0 && t > 2.4) {
            this.stage = 1;
            this.amble(3.2, undefined, this.dir);
          }
          this.wobble = on * (0.5 + 0.5 * Math.sin(t * 0.9));
          p.add('body', -5 * on + 3 * Math.sin(t * 5.5) * on * (this.walking ? 1 : 0));
          this.expression = t > end - 1.6 ? 'happy' : t > 1.6 ? 'determined' : 'surprised';
          if (t > end - 2 && t < end - 1.9) p.kick('body', 300);
          this.lamp = (i, s) => (i === 2 ? 0.5 + 0.5 * Math.sin(s * 4) : 0.4);
        },
      },
      lift: {
        weight: 1.8,
        length: [7, 8],
        face: 'determined',
        when: still,
        pose: (t) => {
          // The crumb up over his head like a weightlifter, held there, legs shaking,
          // and down again with a thump.
          const end = this.actLength;
          this.crumb = ease(t, 0.2, 0.9) * (1 - ease(t, end - 0.9, end - 0.2));
          const up = span(t, 1.4, 3, end - 2.4, end - 1.4);
          this.lift = up;
          this.carry = 1;
          p.add('body', -8 * up);
          this.legs((side, k) => [0, 0, side * 5 * up * Math.sin(env6(t) + k + side)]);
          if (t > end - 1.4 && t < end - 1.3) p.kick('root', 400);
          this.expression = up > 0.5 ? 'cross' : 'determined';
        },
      },
      talk: {
        weight: 2.2,
        length: [6, 7],
        face: 'happy',
        when: () => still() && this.mates().length > 0,
        start: () => {
          this.mate = this.mates()[0] ?? null;
          this.stage = 0;
        },
        pose: (t) => {
          // Turns to the nearest crewmate and talks with his antennae: quick flicks,
          // dots and dashes, the lamps on his gaster blinking along; waits; flicks a reply.
          const k = this.fade(t, 0.5);
          const m = this.mate;
          if (m) this.dir = this.toward(m);
          this.yaw = this.dir * 80 * k;
          this.code = k;
          const sig = (s: number) => {
            const x = s % 2.4;
            return (x < 0.18 || (x > 0.35 && x < 0.9) || (x > 1.1 && x < 1.28)) && s % 4.8 < 2.4
              ? 1
              : 0;
          };
          const on = sig(t * 1.4) * k;
          this.feelers((side, j) => [(j === 1 ? -30 : -10) * on, 0, side * 12 * (1 - on)]);
          this.lamp = (i) => (i < 2 ? 0.15 + 0.85 * on : 0.3);
          p.add('head', 4 * on);
        },
      },
      sniff: {
        weight: 1.6,
        length: [7, 8],
        face: 'neutral',
        when: still,
        start: () => (this.stage = 0),
        pose: (t) => {
          // Nose to the floor, antennae sweeping, zigzagging along a scent trail.
          const k = this.fade(t, 0.5);
          this.actSpeed = 0.9;
          if (!this.walking && t > 0.8 + this.stage * 1.4 && this.stage < 4) {
            this.stage++;
            this.amble(0.7, Math.random(), this.stage % 2 ? 1 : -1);
          }
          this.yaw = this.dir * 50;
          p.add('head', 24 * k);
          p.add('body', 6 * k);
          this.feelers((side, j) => [
            (j === 1 ? 60 : 30) * k,
            0,
            side * 16 * k * Math.sin(t * 7 + side),
          ]);
        },
      },
      salute: {
        weight: 1.2,
        length: [3.5, 4],
        face: 'happy',
        when: still,
        pose: (t) => {
          // Up on his four back legs, one front leg to his brow.
          const k = span(t, 0.4, 1, this.actLength - 1.2, this.actLength - 0.5);
          this.rear = k;
          this.leg('L', 1, 0, 0, 60 * k, -10 * k);
          this.leg('R', -1, 0, 0, 60 * k, 10 * k);
          this.leg('L', 1, 0, 24 * k, 78 * k + 6 * sin(t, 4) * k, -30 * k);
        },
      },
      clean: {
        weight: 1.1,
        length: [5, 6],
        face: 'happy',
        when: still,
        pose: (t) => {
          // Drawing each antenna through his front legs in turn.
          const k = this.fade(t, 0.5);
          p.add('head', 10 * k);
          for (const [sfx, side] of SIDES) {
            const mine = t < this.actLength / 2 === side > 0;
            const use = mine ? k : 0;
            p.add(`antenna.${sfx}.1`, 70 * use, 0, side * 20 * use);
            p.add(`antenna.${sfx}.2`, 40 * use);
            this.leg(sfx, side, 0, 30 * use, 40 * use + 6 * sin(t, 3) * use, -side * 20 * use);
          }
        },
      },
      jig: {
        weight: 1.3,
        length: [4, 5],
        face: 'love',
        when: still,
        pose: (t) => {
          // A little jig: bouncing on all six legs, the gaster swinging side to side.
          const k = this.fade(t, 0.4);
          const b = Math.abs(Math.sin(t * 7));
          this.rear = 0.3 * k;
          p.add('body', -6 * b * k);
          p.add('abdomen', 0, 0, 26 * k * Math.sin(t * 7));
          this.lamp = (i, s) => (Math.sin(s * 7 + i * Math.PI) > 0 ? 1 : 0.2);
        },
      },
      nap: {
        weight: 0.9,
        length: [9, 12],
        when: still,
        pose: (t) => {
          const k = span(t, 1, 2.2, this.actLength - 2, this.actLength - 0.6);
          p.add('head', 24 * k);
          p.add('body', 8 * k);
          this.feelers(() => [40 * k, 0, 0]);
          this.expression = k > 0.4 ? 'asleep' : 'sleepy';
          this.lamp = (_i, s) => 0.08 + 0.12 * (0.5 + 0.5 * Math.sin(s * 1.1));
        },
      },
    };
  }

  protected react(kind: Reaction, t: number) {
    const p = this.puppet;
    if (kind === 'poked') {
      const k = span(t, 0, 0.15, 0.5, 0.95);
      this.up = 0.5 * k;
      this.flash = 1;
      p.add('body', -12 * k);
      this.feelers(() => [-24 * k, 0, 0]);
    } else if (kind === 'dizzy') {
      const k = 1 - ease(t, 2.4, 3.4);
      this.wobble = k;
      p.add('head', 8 * k * Math.cos(t * 5), 14 * k * Math.sin(t * 3), 22 * k * Math.sin(t * 5));
      p.add('body', 0, 0, 10 * k * Math.sin(t * 5));
      this.flash = k;
    } else {
      const k = this.fade(t, 0.6);
      this.rear = 0.8 * k;
      this.leg('R', -1, 0, 10 * k, 60 * k + 12 * k * Math.sin(t * 8), 0);
      p.add('head', -6 * k, 0, 6 * k * sin(t, 1.2));
      this.lamp = () => 0.5 + 0.5 * Math.sin(t * 3);
    }
  }

  // ---------- Posing ----------

  protected idle(t: number) {
    const p = this.puppet;
    this.up = 0;
    this.crumb = 0;
    this.carry = 0;
    this.lift = 0;
    this.rear = 0;
    this.yaw = 0;
    this.code = 0;
    this.flash = 0;
    this.wobble = 0;
    this.lamp = null;
    this.actSpeed = 1.2;
    this.expression = this.hovered ? 'happy' : 'neutral';
    p.add('body', 1.2 * sin(t, 0.3));
    p.add('head', 2 * sin(t, 0.4), 5 * sin(t, 0.13));
    p.add('abdomen', 2 * sin(t, 0.3, 0.2));
    this.feelers((side, k) => {
      const ph = side > 0 ? 0 : 0.3;
      return k === 1
        ? [6 * sin(t, 0.5, ph), 0, side * (-4 + 6 * sin(t, 0.37, ph))]
        : [14 * sin(t, 0.5, ph - 0.15), 0, side * 6 * sin(t, 0.61, ph)];
    });
    this.legs((side, k) => [
      2 * sin(t, 0.17, k * 0.31 + side * 0.1),
      3 * Math.max(0, sin(t, 0.11, k * 0.4 + side * 0.2)) ** 4,
      0,
    ]);
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    this.env = env;
    this.spec.speed = this.actSpeed;
    this.enjoy(dt, this.still());
    const H = this.heightPx;
    this.hoverUp(dt);
    this.crumbS.update(dt, this.crumb);
    const carry = this.carryS.update(dt, this.carry);
    const lift = this.liftS.update(dt, this.lift);
    const rear = this.rearS.update(dt, this.rear);
    const wob = this.wobbleS.update(dt, this.wobble);
    // Lying along the floor, turned so his length shows (or the way an act wants).
    const [lo, hi] = this.span(env.frame);
    const aside =
      Math.sign((lo + hi) / 2 - this.s) * (this.edge === 'bottom' || this.edge === 'left' ? 1 : -1);
    const moving = this.walking ? 0.8 : 1;
    const yaw = this.turnS.update(dt, this.yaw !== 0 ? this.yaw : aside * 45 * moving);
    this.walkLegs(H * 0.9, 18, 24, 9);
    p.add('root', 0, yaw, 3 * wob * Math.sin(env.time * 2.2));
    // Jaws shut on the crumb; the head lifted to hold it.
    for (const [sfx, side] of SIDES) p.add(`jaw.${sfx}`, 0, side * -14 * carry, 0);
    p.add('head', -10 * carry - 14 * lift);
    p.add('body', -14 * rear - 6 * lift);
    this.tone(dt, env, null);
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    const t = env.time;
    // The crumb: not there until the trick, then out in front of his jaws (or overhead).
    const c = clamp(this.crumbS.y, 0.001, 1);
    const lift = clamp(this.liftS.y, 0, 1);
    p.stretch('crumb', c, [0, 0, 1], c);
    p.shift(
      'crumb',
      0,
      0.3 * lift,
      0.34 * lift + 0.02 * Math.sin(t * 5.5) * c * (this.walking ? 1 : 0),
    );
    p.turn(
      'crumb',
      6 * this.wobbleS.y * Math.sin(t * 2.2),
      0,
      8 * this.wobbleS.y * Math.sin(t * 2.2 + 1),
    );
    this.lights(t);
  }

  /** The gaster's two bands (Dot0, Dot1) and the crumb's sugar (Dot2). */
  private lights(t: number) {
    const asleep = this.expression === 'asleep';
    const colour = this.lookName === 'colour';
    for (let i = 0; i < 3; i++) {
      let level: number;
      if (this.act === 'dizzy') level = Math.random() < 0.5 ? 1 : 0.2;
      else if (this.lamp) level = this.lamp(i, t);
      else level = 0.4 + 0.3 * Math.sin(t * 1.3 - i * 1.2);
      level = Math.max(level, this.flash * (0.5 + 0.5 * Math.sin(t * 18 - i)));
      if (this.hovered && this.act === 'idle') level = 0.5 + 0.5 * Math.sin(t * 3.4 - i);
      this.outfit.dot(
        i,
        clamp(asleep ? level * 0.5 : level, 0, 1),
        colour && i === 2 ? '#fff2a8' : undefined,
      );
    }
  }
}

const env6 = (t: number) => t * 14;
