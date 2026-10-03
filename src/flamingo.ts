import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { Bird, ease, type Reaction, span } from './birds';
import { sin } from './moves';
import { Spring } from './spring';

/**
 * Flo, the robot flamingo: tall, slender and a little haughty. A pear of a body on two
 * long legs of rounded segments (hip, a knee that bends backward, an ankle, a flat webbed
 * foot), a long S-curved neck in five segments with a lit ring at every joint (the
 * signature: the colour is in the rings, which run a light up the neck), a small head with
 * a screen face and a bent bill with a dark tip, and folded rose wings with dark flight
 * plates.
 *
 * She stands on one leg, the other tucked up (and swaps), tucks her head under a wing and
 * naps, preens along a wing, filters the floor with her head upside down, marches high-
 * stepping on the spot with her head flagging side to side and her wings flicked (the
 * group display), stretches one leg out behind her with a wing, wobbles on her one leg and
 * saves it, and strides about on those legs with her neck pumping.
 *
 * A poke snaps her head straight up with the wings flared and a honk; three make her neck
 * swirl; the mouse resting on her makes the neck rings pulse and the head bob.
 */
export const FLAMINGO_FACE: FaceLayout = {
  width: 512,
  height: 288,
  eyes: [
    [0.31, 0.5],
    [0.69, 0.5],
  ],
  rx: 0.075,
  ry: 0.2,
  line: 0.036,
  mouth: null,
};

const SIDES = [
  ['L', 1],
  ['R', -1],
] as const;
/** The neck's joints (the model's), and from them how far each segment leans forward at rest. */
const NECK: [number, number][] = [
  [-0.12, 0.67],
  [-0.215, 0.77],
  [-0.235, 0.88],
  [-0.15, 0.975],
  [-0.115, 1.08],
  [-0.185, 1.155],
];
const REST = NECK.slice(0, 5).map(([y, z], i) => {
  const [y1, z1] = NECK[i + 1];
  return (Math.atan2(-(y1 - y), z1 - z) * 180) / Math.PI;
});
/** Neck shapes, as how far each segment leans forward from straight up (degrees). */
const SHAPE = {
  straight: [-5, 0, 0, 0, 0],
  flag: [-12, -4, 0, -4, -20],
  // Looped back over the shoulder, the head down on the back.
  tuck: [-10, -55, -120, -180, -228],
  // Down to the floor in front, the head upside down.
  feed: [65, 100, 135, 165, 205],
  // Round to a wing.
  preen: [10, -30, -40, 20, 110],
  stretch: [-20, -10, -5, -5, -25],
};

export class Flamingo extends Bird {
  private raise = { L: new Spring(3.5, 0.55, 1.1), R: new Spring(3.5, 0.55, 1.1) };
  private weight = new Spring(3, 0.6);
  private open = new Spring(4, 0.5, 1.2);
  private ringsS = new Spring(4, 0.8);
  // Per-frame requests from acts, cleared in idle().
  private want: number[] = [...REST];
  private headYaw = 0;
  private headLean = 0;
  private up: 'L' | 'R' | null = null;
  private back = 0;
  private wings = 0;
  private beak = 0;
  private march = 0;
  private glow = 0;
  private sleepy = 0;
  private actSpeed = 0.8;
  private dir = 1;
  private side: 'L' | 'R' = 'L';
  private stage = 0;
  private did = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Flo',
        model: 'flamingo',
        metres: 1.25,
        width: 0.42,
        size: 1.4,
        feels: {
          default: { f: 3, zeta: 0.6 },
          root: { f: 3, zeta: 0.5 },
          body: { f: 3.5, zeta: 0.5 },
          'neck.1': { f: 4, zeta: 0.55 },
          'neck.2': { f: 4, zeta: 0.55 },
          'neck.3': { f: 4, zeta: 0.55 },
          'neck.4': { f: 4.5, zeta: 0.5 },
          'neck.5': { f: 5, zeta: 0.5 },
          head: { f: 5, zeta: 0.5, r: 0.4 },
          jaw: { f: 8, zeta: 0.5 },
          tail: { f: 4, zeta: 0.4 },
          'wing.L': { f: 4, zeta: 0.45 },
          'wing.R': { f: 4, zeta: 0.45 },
          'leg.L': { f: 5, zeta: 0.55 },
          'leg.R': { f: 5, zeta: 0.55 },
          'shin.L': { f: 5, zeta: 0.55 },
          'shin.R': { f: 5, zeta: 0.55 },
          'foot.L': { f: 6, zeta: 0.55 },
          'foot.R': { f: 6, zeta: 0.55 },
        },
        face: FLAMINGO_FACE,
        eyes: 0.96,
        gaze: [
          { bone: 'head', yaw: 0.6, pitch: 0.7 },
          { bone: 'neck.5', yaw: 0.3, pitch: 0.2 },
          { bone: 'neck.3', yaw: 0.15, pitch: 0 },
          { bone: 'body', yaw: 0.1, pitch: 0 },
        ],
        reach: { yaw: 60, pitch: 30 },
        lag: 0.8,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [60, 130],
        speed: 0.8,
        turn: 50,
        roam: true,
      },
      model,
    );
    this.acts = {
      ...this.walks(),
      ...this.stands(),
      ...this.displays(),
      ...this.reactions(),
    };
  }

  /** Mix the neck toward a shape by k (0 rest .. 1 the shape). */
  private shape(to: number[], k: number) {
    for (let i = 0; i < 5; i++) this.want[i] += (to[i] - this.want[i]) * k;
  }

  private oneLegOn = (side: 'L' | 'R') => {
    this.up = side;
  };

  // ---------- Walking ----------

  private walks(): Record<string, Act> {
    return {
      idle: { weight: 3, length: [3, 6] },
      stride: {
        weight: 2,
        length: [4, 6],
        when: this.still,
        start: () => this.amble(2 + Math.random() * 3),
      },
      march: {
        weight: 1.1,
        length: [5, 7],
        face: 'determined',
        when: this.still,
        start: () => {
          this.actSpeed = 0.7;
          this.amble(2.5);
        },
        pose: (t) => {
          // Knees high, head up and flagging, the group's march.
          this.actSpeed = 0.7;
          const k = this.fade(t, 0.5);
          this.march = k;
          this.shape(SHAPE.flag, k);
          this.headYaw = 40 * Math.sin(this.gait * 1.1) * k;
        },
      },
    };
  }

  // ---------- Standing about ----------

  private stands(): Record<string, Act> {
    return {
      oneLeg: {
        weight: 2.4,
        length: [9, 15],
        when: this.still,
        start: () => (this.side = Math.random() < 0.5 ? 'L' : 'R'),
        pose: (t) => {
          // The other leg folds up under her, and she stays there, swaying a little,
          // swapping legs now and then.
          const k = span(t, 0.2, 1.2, this.actLength - 1.5, this.actLength - 0.2);
          const swap = t > this.actLength * 0.55 ? 1 : 0;
          this.oneLegOn(swap ? (this.side === 'L' ? 'R' : 'L') : this.side);
          if (swap && t < this.actLength * 0.55 + 1.2) this.up = null;
          this.shape(SHAPE.straight, 0.18 * k);
          this.headYaw = 12 * sin(t, 0.12) * k;
          this.back = k;
        },
      },
      headTuck: {
        weight: 1.5,
        length: [10, 16],
        face: 'sleepy',
        when: this.still,
        start: () => (this.side = Math.random() < 0.5 ? 'L' : 'R'),
        pose: (t) => {
          // On one leg, the neck loops back and the head goes under a wing.
          const k = span(t, 0.5, 2.2, this.actLength - 2, this.actLength - 0.4);
          this.oneLegOn(this.side);
          this.shape(SHAPE.tuck, k);
          this.headLean = 25 * k;
          this.headYaw = (this.side === 'L' ? -1 : 1) * 45 * k;
          this.back = k;
          this.sleepy = k;
          this.wings = 0.1 * k;
          this.expression = k > 0.6 ? 'asleep' : 'sleepy';
        },
      },
      feed: {
        weight: 1.3,
        length: [8, 11],
        when: this.still,
        pose: (t) => {
          // Head right down, upside down, sweeping the floor side to side for food.
          const k = span(t, 0.4, 1.6, this.actLength - 1.6, this.actLength - 0.3);
          this.shape(SHAPE.feed, k);
          this.headYaw = 40 * sin(t, 0.7) * k;
          this.beak = Math.max(0, sin(t, 2.4)) * 14 * k;
          this.puppet.add('body', 6 * k);
          this.puppet.add('tail', -8 * k);
          this.expression = 'focused';
        },
      },
      preen: {
        weight: 1.2,
        length: [6, 8],
        when: this.still,
        start: () => (this.dir = Math.random() < 0.5 ? -1 : 1),
        pose: (t) => {
          // Neck round to a wing, nibbling along it.
          const k = span(t, 0.4, 1.4, this.actLength - 1.4, this.actLength - 0.3);
          const nib = Math.max(0, sin(t, 3.2)) * k;
          this.shape(SHAPE.preen, k);
          this.headYaw = this.dir * 70 * k;
          this.headLean = 8 * nib;
          this.beak = 10 * nib;
          this.puppet.add('body', 0, this.dir * 8 * k, 0);
          this.expression = k > 0.5 ? 'sleepy' : 'neutral';
        },
      },
      wobble: {
        weight: 0.9,
        length: [5, 6],
        face: 'surprised',
        when: this.still,
        start: () => (this.side = Math.random() < 0.5 ? 'L' : 'R'),
        pose: (t) => {
          // Up on one leg, the balance goes: wings out, neck waving, a hop, saved.
          const k = span(t, 0.2, 0.8, this.actLength - 1, this.actLength - 0.2);
          this.oneLegOn(this.side);
          const w = Math.sin(t * 7) * (1 - ease(t, 2, 3.6)) * k;
          this.back = k;
          this.wings = (0.5 + 0.5 * Math.abs(w)) * k;
          this.puppet.add('root', 0, 0, 14 * w);
          this.shape(SHAPE.straight, 0.5 * k);
          this.headYaw = 30 * Math.sin(t * 5) * (1 - ease(t, 2, 3.6)) * k;
          this.lift = 0;
        },
      },
      stretch: {
        weight: 1.1,
        length: [5, 6.5],
        face: 'happy',
        when: this.still,
        start: () => (this.side = Math.random() < 0.5 ? 'L' : 'R'),
        pose: (t) => {
          // One leg stretched out behind her and its wing opened with it, neck reaching up.
          const k = span(t, 0.4, 1.4, this.actLength - 1.5, this.actLength - 0.3);
          this.oneLegOn(this.side);
          this.back = -1;
          this.wings = 0.9 * k;
          this.shape(SHAPE.stretch, k);
          this.puppet.add('body', 14 * k);
          this.puppet.add('tail', -10 * k);
        },
      },
      nap: {
        weight: 1.2,
        length: [12, 18],
        when: this.still,
        start: () => (this.side = Math.random() < 0.5 ? 'L' : 'R'),
        pose: (t) => {
          const k = span(t, 1, 3, this.actLength - 2.5, this.actLength - 0.5);
          this.oneLegOn(this.side);
          this.shape(SHAPE.tuck, k);
          this.headLean = 25 * k;
          this.headYaw = (this.side === 'L' ? -1 : 1) * 45 * k;
          this.back = k;
          this.sleepy = k;
          this.puppet.add('body', 3 * k * sin(t, 0.2));
          this.expression = k > 0.4 ? 'asleep' : 'sleepy';
        },
      },
    };
  }

  // ---------- Showing off ----------

  private displays(): Record<string, Act> {
    return {
      headFlag: {
        weight: 1.5,
        length: [6, 8],
        face: 'determined',
        when: this.still,
        pose: (t) => {
          // The group display on the spot: neck straight up, the head flagged side to side,
          // knees lifted in time, the wings flicked open on the beat.
          const k = span(t, 0.4, 1, this.actLength - 1, this.actLength - 0.3);
          const beat = Math.sin(2 * Math.PI * 1.1 * t);
          this.march = k;
          this.shape(SHAPE.flag, k);
          this.headYaw = 70 * Math.sin(2 * Math.PI * 0.55 * t) * k;
          this.beak = Math.max(0, Math.sin(t * 3)) * 6 * k;
          this.wings = 0.3 * k * (beat > 0.7 ? 1 : 0);
          this.glow = k;
          this.puppet.add('body', -4 * k);
        },
      },
      show: {
        weight: 1,
        length: [4, 5],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // Both wings out wide to show the rose and the black, neck up.
          const k = span(t, 0.4, 1.2, this.actLength - 1.2, this.actLength - 0.3);
          this.wings = 1.1 * k;
          this.shape(SHAPE.straight, k);
          this.headYaw = 25 * sin(t, 0.4) * k;
          this.puppet.add('body', -8 * k);
          this.puppet.add('tail', 14 * k);
          this.glow = k;
        },
      },
    };
  }

  protected react(kind: Reaction, t: number) {
    const p = this.puppet;
    if (kind === 'poked') {
      // Head snapped straight up, wings flared, a honk, a little hop.
      const k = span(t, 0, 0.12, 1, 1.6);
      this.shape(SHAPE.straight, k);
      this.wings = 1.1 * k;
      this.beak = 30 * span(t, 0.05, 0.15, 0.5, 0.7);
      this.glow = k;
      this.lift = this.heightPx * 0.12 * (t < 0.5 ? Math.sin((Math.PI * t) / 0.5) : 0);
      p.add('body', -8 * k);
    } else if (kind === 'dizzy') {
      const k = 1 - ease(t, 2.4, 3.4);
      this.headYaw = 40 * k * Math.sin(t * 5);
      p.add('neck.2', 0, 25 * k * Math.sin(t * 4), 12 * k * Math.cos(t * 4));
      p.add('neck.4', 0, -25 * k * Math.sin(t * 4), -12 * k * Math.cos(t * 4));
      p.add('root', 0, 0, 6 * k * Math.sin(t * 4));
      this.glow = k;
    } else {
      const k = this.fade(t, 0.6);
      this.shape(SHAPE.straight, 0.4 * k);
      this.headYaw = 25 * k * Math.sin(t * 3);
      p.add('head', 10 * k * Math.sin(t * 6));
      this.glow = k;
    }
  }

  private lift = 0;

  // ---------- Posing ----------

  protected idle(t: number) {
    const p = this.puppet;
    this.lift = 0;
    this.want = [...REST];
    this.headYaw = 0;
    this.headLean = 0;
    this.up = null;
    this.back = 0;
    this.wings = 0;
    this.beak = 0;
    this.march = 0;
    this.glow = 0;
    this.sleepy = 0;
    this.actSpeed = 0.8;
    this.expression = this.hovered ? 'happy' : 'neutral';
    // Haughty: the head carried slightly high, turning slowly, never quite still.
    p.add('neck.5', 2 * sin(t, 0.23));
    p.add('neck.3', 0, 3 * sin(t, 0.11), 0);
    p.add('neck.1', 1.5 * sin(t, 0.17));
    p.add('head', 0, 4 * sin(t, 0.09), 0);
    p.add('body', 0.8 * sin(t, 0.3));
    p.add('tail', 2 * sin(t, 0.4));
    p.add('wing.L', 0, 0, 1 * sin(t, 0.21));
    p.add('wing.R', 0, 0, 1 * sin(t, 0.21, 0.4));
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    this.env = env;
    this.spec.speed = this.actSpeed;
    this.enjoy(dt, this.still());
    const H = this.heightPx;
    this.h = this.lift;

    // The neck: each segment's lean from where it rests to where the shape wants it.
    let prev = 0;
    for (let i = 0; i < 5; i++) {
      const delta = this.want[i] - REST[i];
      p.add(`neck.${i + 1}`, delta - prev, 0, 0);
      prev = delta;
    }
    // The head carries on from the neck, and turns (yaw spread down the neck).
    p.add('head', this.headLean - prev * 0.15, this.headYaw * 0.6, 0);
    p.add('neck.5', 0, this.headYaw * 0.25, 0);
    p.add('neck.4', 0, this.headYaw * 0.15, 0);
    p.add('jaw', this.beak);

    // Legs: one raised (folded up under her) while the other bears her weight.
    const l = this.raise.L.update(dt, this.up === 'L' ? 1 : 0);
    const r = this.raise.R.update(dt, this.up === 'R' ? 1 : 0);
    const moving = clamp(this.stride / (H * 0.5), 0, 1) * (1 - Math.max(l, r));
    const ph = this.gait * 0.9;
    const legs: [string, number, number][] = [
      ['L', l, 0],
      ['R', r, Math.PI],
    ];
    for (const [sfx, up, off] of legs) {
      const step = Math.sin(ph + off);
      // Planted foot sweeps back, the swinging one lifts: knee bends back as it comes through.
      const swing = Math.max(0, Math.cos(ph + off));
      const high = this.march * (0.5 + 0.5 * Math.sin(ph * 2 + off));
      p.add(
        `leg.${sfx}`,
        (24 * step - 38 * high) * moving -
          40 * up * (this.back >= 0 ? 1 : 0) +
          55 * up * (this.back < 0 ? 1 : 0),
        0,
        0,
      );
      p.add(
        `shin.${sfx}`,
        (46 * swing + 70 * high) * moving + (this.back >= 0 ? 140 : 8) * up,
        0,
        0,
      );
      p.add(
        `foot.${sfx}`,
        (-20 * swing - 20 * high) * moving - 60 * up * (this.back >= 0 ? 1 : 0),
        0,
        0,
      );
    }
    // Over the standing leg: the body shifts to it, the standing hip staying where its foot is.
    const standing = this.up === 'L' ? -1 : this.up === 'R' ? 1 : 0;
    const w = this.weight.update(dt, standing);
    const dx = 0.03 * w;
    p.shift('body', dx, 0, 0);
    p.shift('leg.L', -dx, 0, 0);
    p.shift('leg.R', -dx, 0, 0);
    p.add('root', 0, 0, -4 * w);
    // Walking: the body rocks over each step, the neck pumping forward and back.
    if (moving > 0.05) {
      p.add('body', 0, 0, 4 * Math.cos(ph) * moving);
      p.add('neck.2', 6 * Math.cos(ph * 2) * moving);
      p.add('neck.5', -8 * Math.cos(ph * 2 + 0.6) * moving);
      p.add('tail', 0, 0, -6 * Math.cos(ph) * moving);
    }
    // Wings: flicked open for display and balance.
    const open = this.open.update(dt, this.wings);
    for (const [sfx, side] of SIDES) {
      p.add(`wing.${sfx}`, -10 * open, 0, side * 58 * open);
      p.add(`wing.${sfx}`, 0, 0, side * 6 * this.sleepy);
    }
    this.ringsS.update(dt, this.glow);
    this.sleepyShow = this.sleepy;
    // Standing, she turns side-on toward the middle of the room so her S of a neck, her
    // bent bill and her backward knees show; while she walks the base class turns her.
    const middle = (env.frame.left + env.frame.right) / 2;
    const turn = this.turn.update(dt, this.walking ? 0 : Math.sign(middle - this.s) * 62);
    p.add('root', 0, turn);
    p.add('head', 0, -turn * 0.55);
    p.add('neck.5', 0, -turn * 0.2);
  }

  private sleepyShow = 0;
  private turn = new Spring(1.6, 0.8);

  protected after(dt: number, env: Env) {
    this.lights(env.time);
    void dt;
  }

  /** The neck rings: a light running up them, faster and brighter the more she shows off. */
  private lights(t: number) {
    const tone = this.expression === 'neutral' ? BEACON.happy : BEACON[this.expression];
    const g = this.ringsS.y;
    const dim = this.sleepyShow;
    for (let i = 0; i < 5; i++) {
      const rest = 0.22 + 0.5 * Math.max(0, Math.cos(2 * Math.PI * (t / 4.5 - i * 0.07))) ** 8;
      const show = 0.2 + 0.8 * Math.max(0, Math.sin(t * 7 - i * 1.2));
      let level = (rest * (1 - g) + show * g) * (1 - 0.85 * dim);
      let colour: string | undefined;
      if (this.act === 'dizzy') {
        level = Math.random() < 0.5 ? 1 : 0.2;
        colour = RAINBOW[Math.floor(Math.random() * RAINBOW.length)];
      }
      this.outfit.dot(i, clamp(level, 0, 1), colour);
    }
    this.outfit.dot(5, clamp(0.3 + 0.7 * g - 0.25 * dim, 0, 1), tone);
    this.outfit.beacon(tone ?? '#ffb347');
  }
}
