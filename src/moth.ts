import { Color, type Object3D } from 'three';
import { type Act, type Character, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import type { Reaction } from './birds';
import { Bug, ease, SIDES, span, TAU } from './bug';
import { sin } from './moves';
import { Spring } from './spring';

/**
 * Tuft, the robot moth: a plump fuzzy body in a ruff of chunky fur pods, big feathery
 * antennae and two pairs of broad soft wings with a lit eye-spot on each. Resting, the
 * wings fold flat and swept back over her body like a low tent, the forewings over the hindwings. She is drawn to light: a glowing orb turns
 * up beside her and she flutters at it, helpless, and bumps it, again and again, until
 * it swings and she reels off dazed. She also flutters about, drifts, twirls, shakes the
 * dust out of her wings, snaps them open to flash her eye-spots at nothing (boo), opens
 * them in the sun, combs her antennae, naps in her tent, and flutters up to sit on a
 * crewmate's head.
 *
 * A poke makes her burst up with the eye-spots flashing; three make her dizzy; the mouse
 * resting on her makes her open her wings and glow.
 */
export const MOTH_FACE: FaceLayout = {
  width: 256,
  height: 192,
  eyes: [
    [0.3, 0.48],
    [0.7, 0.48],
  ],
  rx: 0.105,
  ry: 0.28,
  line: 0.05,
  mouth: [0.5, 0.82],
};

/**
 * How her wings fold at rest, so she doesn't sit with them up like Prism: each is laid flat
 * and swept back over her body in a low tent, the forewings (40 degrees of slope) covering
 * the hindwings (48), the inner edges on her midline. [pitch, yaw, roll] in degrees then the
 * move [x, y, z] in metres, for the left wing (the right is its mirror); art/robot/moth.py
 * has the same numbers and draws her portrait this way.
 */
const REST_FORE = [-50.272, 94.458, -44.075, 0.079, -0.064, 0.057] as const;
const REST_HIND = [-42.109, 95.385, 16.559, 0.03, -0.031, 0.03] as const;
const SPOTS = 0; // Dot0 fore eye-spots, Dot1 edge cells, Dot2 hind eye-spots, Dot3 the orb
const ORB_X = 0.42;

export class Moth extends Bug {
  static readonly terms =
    'insect bug wings antennae feathery fuzzy fluffy cream white tan brown eyespots spots flutter fly light glow orb night dust nap';

  /** Held by the pointer, it flies after it. */
  readonly flies = true;
  private openS = new Spring(3, 0.7);
  private flapS = new Spring(5, 0.8);
  private leanS = new Spring(4, 0.4);
  private orbS = new Spring(2.5, 0.8);
  private nudgeS = new Spring(7, 0.5);
  private swingS = new Spring(4, 0.3);
  // Per-frame requests from acts, cleared in idle().
  private open = 0;
  private flap = 0;
  private lean = 0;
  private spin = 0;
  private glow = 0;
  private orb = 0;
  private near = 0;
  private shake = 0;
  private spots: ((i: number, t: number) => number) | null = null;
  private actSpeed = 1;
  private dir = 1;
  private stage = 0;
  private since = 0;
  private host: Character | null = null;

  constructor(model: Object3D) {
    super(
      {
        name: 'Tuft',
        model: 'moth',
        metres: 0.52,
        width: 0.74,
        size: 0.5,
        feels: {
          default: { f: 4, zeta: 0.6 },
          root: { f: 4, zeta: 0.5 },
          body: { f: 4, zeta: 0.5 },
          abdomen: { f: 5, zeta: 0.35 },
          head: { f: 5, zeta: 0.5, r: 0.5 },
          'wing.L': { f: 5, zeta: 0.55 },
          'wing.R': { f: 5, zeta: 0.55 },
          'hind.L': { f: 5, zeta: 0.5 },
          'hind.R': { f: 5, zeta: 0.5 },
          'antenna.L.1': { f: 3.5, zeta: 0.3 },
          'antenna.R.1': { f: 3.5, zeta: 0.3 },
          'antenna.L.2': { f: 4.5, zeta: 0.2 },
          'antenna.R.2': { f: 4.5, zeta: 0.2 },
        },
        face: MOTH_FACE,
        eyes: 0.67,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.8 },
          { bone: 'body', yaw: 0.2, pitch: 0 },
        ],
        reach: { yaw: 55, pitch: 28 },
        lag: 1.4,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 0.9,
        turn: 40,
        roam: true,
      },
      model,
    );
    this.acts = { ...this.moves(), ...this.reactions() };
  }

  private flying = () => this.air.y > 0.3;

  private moves(): Record<string, Act> {
    const p = this.puppet;
    const aloft = () => this.still() && this.state === 'here';
    const flit = (t: number, every: number, far: number) => {
      if (t > this.stage * every && !this.walking) {
        this.stage++;
        this.actSpeed = 1.2 + Math.random() * 2.4;
        this.amble(far * (0.4 + Math.random()), Math.random() * 0.7, Math.random() < 0.5 ? -1 : 1);
      }
    };
    return {
      idle: { weight: 3, length: [2.5, 5] },
      lamp: {
        weight: 3,
        length: [12, 13],
        face: 'love',
        when: aloft,
        start: () => {
          this.dir = Math.random() < 0.5 ? -1 : 1;
          this.stage = 0;
        },
        pose: (t) => {
          // A glowing orb fades in at her side. She cannot help herself: wings going, she
          // drifts toward it, bumps into it, backs off dizzy, and does it again; it swings
          // each time. Then the light fades and she is left puzzled.
          const k = this.fade(t, 0.6);
          this.orb = ease(t, 0.5, 1.6) * (1 - ease(t, 11, 12));
          this.up = (0.7 + 0.1 * sin(t, 0.6)) * k;
          this.flap = k;
          // Three approaches: at 3.2, 6.2 and 9.2 s each takes 1.5 s in and 0.8 out.
          let reach = 0;
          let bump = 0;
          for (const at of [2.4, 5.4, 8.4]) {
            reach += ease(t, at, at + 1.3) * (1 - ease(t, at + 1.5, at + 2.3));
            bump += ease(t, at + 1.25, at + 1.35) * (1 - ease(t, at + 1.35, at + 1.55));
            if (Math.abs(t - (at + 1.3)) < 0.02) this.swingS.kick(14 * this.dir);
          }
          this.near = reach;
          this.lean = this.dir * (26 * reach + 40 * bump) * k;
          p.add('body', -8 * reach + 10 * bump);
          p.add('head', -6 * reach + 16 * bump, 0, this.dir * 5 * sin(t, 2));
          this.spots = (i, s) =>
            i === 3 ? 0.55 + 0.45 * reach : 0.4 + 0.6 * Math.max(0, Math.sin(s * 6 + i));
          this.feelers((side, k2) => [
            -20 * reach,
            0,
            side * (10 + 12 * reach) * (k2 === 1 ? 1 : 0.6),
          ]);
          this.glow = 0.6 * reach;
        },
      },
      tent: {
        weight: 2.2,
        length: [6, 9],
        face: 'neutral',
        when: this.still,
        pose: (t) => {
          // Sitting quite still in her tent of wings, a slow breath, an antenna twitching.
          const k = this.fade(t, 0.8);
          p.add('body', 1.5 * sin(t, 0.25) * k);
          p.add('head', 3 * sin(t, 0.2), 6 * sin(t, 0.1) * k);
          this.feelers((side, k2) => [
            (k2 === 1 ? 6 : 14) * Math.max(0, sin(t, 0.35, side * 0.2)) ** 3 * k,
            0,
            side * 5 * sin(t, 0.3) * k,
          ]);
          this.spots = (i, s) => 0.12 + 0.1 * Math.sin(s * 0.8 + i);
        },
      },
      sun: {
        weight: 2,
        length: [9, 11],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // Landed, slowly opening the wings wide, the eye-spots warming, and tenting again.
          const k = this.fade(t, 0.8);
          const o = (0.5 - 0.5 * Math.cos(t * 0.95)) * k;
          this.open = o;
          this.spots = (i, s) =>
            0.15 + 0.85 * clamp(o * 1.2, 0, 1) * (0.8 + 0.2 * sin(s, 0.6, i / 4));
          p.add('body', -2 * o);
          p.add('head', 0, 8 * sin(t, 0.2) * k);
        },
      },
      flutter: {
        weight: 2.4,
        length: [6, 8],
        face: 'happy',
        when: aloft,
        start: () => (this.stage = 0),
        pose: (t) => {
          // Fluttering about on no plan, the soft wings going all the time.
          const k = this.fade(t, 0.5);
          this.up = (0.8 + 0.3 * Math.sin(t * 2.6) * Math.cos(t * 1.7)) * k;
          this.flap = k;
          flit(t, 1.1, 1.3);
          this.lean = 26 * Math.sin(t * 2.1) * k;
          p.add('body', -6 * k + 5 * Math.sin(t * 3.8) * k);
          this.spots = (i, s) => 0.35 + 0.65 * Math.max(0, Math.sin(s * 5 + i));
        },
      },
      drift: {
        weight: 1.4,
        length: [7, 9],
        face: 'neutral',
        when: aloft,
        start: () => (this.stage = 0),
        pose: (t) => {
          // High and slow, wings in long soft beats, gliding a long way.
          const k = this.fade(t, 0.8);
          this.up = (1.4 + 0.2 * sin(t, 0.3)) * k;
          this.flap = 0.5 * k;
          this.actSpeed = 0.8;
          if (this.stage === 0 && t > 0.8) {
            this.stage = 1;
            this.amble(4);
          }
          this.lean = 10 * sin(t, 0.3) * k;
        },
      },
      twirl: {
        weight: 1,
        length: [3.4, 4],
        face: 'happy',
        when: aloft,
        pose: (t) => {
          const k = this.fade(t, 0.5);
          this.up = 1.0 * k;
          this.flap = k;
          this.spin = TAU * ease(t, 0.5, 3.1);
          this.spots = (i, s) => 0.2 + 0.8 * Math.max(0, Math.sin(s * 12 - i));
        },
      },
      dust: {
        weight: 1.6,
        length: [4, 5],
        face: 'sheepish',
        when: this.still,
        pose: (t) => {
          // Landed, a hard shiver through the wings to shake the dust out: quick open and
          // shut, the body juddering, the fur pods going, the cells flashing like motes.
          const k = span(t, 0.3, 0.6, this.actLength - 1, this.actLength - 0.4);
          this.shake = k;
          p.add('head', 0, 0, 6 * k * Math.sin(t * 40));
          p.add('body', 0, 0, 3 * k * Math.sin(t * 38));
          this.spots = (i, s) => (Math.sin(s * 16 + i * 2.3) > 0.2 ? 0.9 : 0.15);
          this.expression = k > 0.4 ? 'cross' : 'neutral';
        },
      },
      boo: {
        weight: 1.3,
        length: [3, 3.6],
        face: 'surprised',
        when: this.still,
        pose: (t) => {
          // Tented and still; then the wings snap open, all four eye-spots flaring, the
          // head ducked and the antennae flat, hold, and she folds up again.
          const on = span(t, 1.0, 1.15, 2.1, 2.5);
          this.open = on;
          this.glow = on;
          this.spots = () => 0.1 + 0.9 * on;
          p.add('head', 14 * on);
          p.add('body', -4 * on);
          this.feelers(() => [-24 * on, 0, 0]);
        },
      },
      comb: {
        weight: 1.1,
        length: [5, 6],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // Front legs up to draw each feathery antenna through them.
          const k = this.fade(t, 0.5);
          for (const [sfx, side] of SIDES) {
            const mine = t < this.actLength / 2 === side > 0;
            const use = mine ? k : 0;
            p.add(`antenna.${sfx}.1`, 80 * use, 0, side * 14 * use);
            p.add(`antenna.${sfx}.2`, 40 * use);
            this.leg(sfx, side, 0, 24 * use, 36 * use + 6 * sin(t, 3) * use, -side * 16 * use);
          }
          p.add('head', 8 * k);
        },
      },
      flick: {
        weight: 1.1,
        length: [2.5, 3.2],
        face: 'wink',
        when: this.still,
        pose: (t) => {
          // The wings pop open and shut a few times, the eye-spots blinking with each.
          const n = Math.sin(t * 6);
          const k = this.fade(t, 0.3);
          this.open = clamp(n * 1.4, 0, 1) * k;
          this.spots = () => (n > 0 ? 1 : 0.15);
        },
      },
      nap: {
        weight: 0.9,
        length: [9, 12],
        when: this.still,
        pose: (t) => {
          const k = span(t, 1, 2, this.actLength - 2, this.actLength - 0.6);
          p.add('head', 24 * k);
          p.add('body', 6 * k);
          this.feelers(() => [40 * k, 0, 0]);
          this.expression = k > 0.4 ? 'asleep' : 'sleepy';
          this.spots = (i, s) => 0.05 + 0.08 * (0.5 + 0.5 * Math.sin(s * 1.1 - i * 0.5));
        },
      },
      saunter: {
        weight: 1.2,
        length: [6, 8],
        when: this.still,
        start: () => {
          this.actSpeed = 0.8;
          this.amble(1.5 + Math.random() * 1.5);
        },
        pose: () => (this.actSpeed = 0.8),
      },
      visit: {
        weight: 1.4,
        length: [90, 90],
        face: 'happy',
        when: () => aloft() && this.mates().length > 0,
        start: () => {
          this.stage = 0;
          this.host = this.mates()[0] ?? null;
        },
        pose: (t) => this.visit(t),
      },
    };
  }

  /** Flutters up to a crewmate's head, sits there a while, and flutters down again. */
  private visit(t: number) {
    const p = this.puppet;
    const m = this.host;
    const f = this.env?.frame;
    if (!m || !f || m.state !== 'here') {
      if (this.stage < 3) this.dismount();
      this.stage = 4;
    }
    if (this.stage === 0 && m && f) {
      const top = m.spec.size * f.bot * 0.93 + m.standOn;
      const depth = Math.max(0, m.depth - 0.02);
      this.hopOnto(m.s, depth, top, 1.3, 0.7);
      this.stage = 1;
    } else if (this.stage === 1) {
      this.flap = 1;
      this.lean = 24 * Math.sin(t * 7);
      if (!this.hopping && m) {
        this.host = m;
        this.perched = true;
        this.stage = 2;
        this.since = t;
        p.kick('body', -120);
      }
    } else if (this.stage === 2) {
      const s = t - this.since;
      this.open = 0.5 - 0.5 * Math.cos(s * 0.8);
      p.add('head', 0, 14 * sin(s, 0.2));
      this.feelers((side, k) => [
        5 * sin(s, 0.6, k * 0.2),
        0,
        side * (4 + 8 * sin(s, 0.5, side * 0.2)),
      ]);
      this.spots = (i, st) => 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(st * 1.4 - i * 0.6));
      if (s > 7) {
        this.dismount();
        this.stage = 3;
      }
    } else if (this.stage === 3) {
      this.flap = 1;
      if (!this.hopping) {
        this.stage = 4;
        this.actLength = Math.min(this.actLength, t + 0.2);
      }
    } else if (this.stage === 4) {
      this.actLength = Math.min(this.actLength, t + 0.2);
    }
  }

  private dismount() {
    if (!this.perched) return;
    this.perched = false;
    const f = this.env?.frame;
    const way = Math.random() < 0.5 ? -1 : 1;
    const h = this.heightPx;
    const s = this.s + way * h * 0.9;
    this.hopOnto(s, clamp(this.depth + 0.05 * way, 0, 1), 0, 1.0, 0.5);
    this.host = null;
    if (f) this.goal = null;
  }

  poke() {
    if (this.perched) this.dismount();
    super.poke();
  }

  leave(by?: 'rise') {
    if (this.perched) this.dismount();
    super.leave(by);
  }

  protected react(kind: Reaction, t: number) {
    const p = this.puppet;
    if (kind === 'poked') {
      const k = span(t, 0, 0.15, 1.2, 1.8);
      this.up = 1.8 * k;
      this.flap = 1;
      this.glow = 1;
      this.open = ease(t, 0, 0.1) * (1 - ease(t, 0.3, 0.5));
      this.spots = (i, s) => (Math.sin(s * 22 + i * 2) > 0 ? 1 : 0.15);
      p.add('body', -12 * k);
      this.feelers(() => [-16 * k, 0, 0]);
    } else if (kind === 'dizzy') {
      const k = 1 - ease(t, 2.4, 3.4);
      this.up = 0.6 * k;
      this.flap = 0.7 * k;
      p.add('head', 8 * k * Math.cos(t * 5), 12 * k * Math.sin(t * 3), 24 * k * Math.sin(t * 5));
      p.add('body', 0, 0, 10 * k * Math.sin(t * 5));
      this.lean = 24 * k * Math.sin(t * 4);
      this.spots = () => (Math.random() < 0.5 ? 1 : 0.15);
    } else {
      const k = this.fade(t, 0.6);
      this.open = k;
      this.glow = k;
      this.spots = (i, s) => 0.5 + 0.5 * Math.sin(s * 2.5 - i * 0.8);
      p.add('head', 6 * k, 0, 8 * k * sin(t, 1));
      p.add('body', 0, 0, 5 * k * sin(t, 0.8));
    }
  }

  // ---------- Posing ----------

  protected idle(t: number) {
    const p = this.puppet;
    this.up = 0;
    this.open = 0;
    this.flap = 0;
    this.lean = 0;
    this.spin = 0;
    this.glow = 0;
    this.orb = 0;
    this.near = 0;
    this.shake = 0;
    this.spots = null;
    this.actSpeed = 1;
    this.expression = this.hovered ? 'happy' : 'neutral';
    p.add('body', 1.2 * sin(t, 0.28));
    p.add('head', 2 * sin(t, 0.4), 4 * sin(t, 0.13));
    p.add('abdomen', 3 * sin(t, 0.3, 0.2));
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
    // Every so often she lets the tent open a little, as if warming her wings.
    this.open = 0.2 * Math.max(0, sin(t, 0.06)) ** 6;
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    this.env = env;
    this.spec.speed = this.actSpeed;
    this.enjoy(dt, this.still());
    if (this.state === 'entering' || this.state === 'leaving') {
      this.up = Math.max(this.up, 0.9);
      this.flap = 1;
    }
    const host = this.host;
    if (this.perched && host && !this.hopping) {
      this.s = host.s;
      this.depth = this.depthGoal = Math.max(0, host.depth - 0.02);
      this.goal = null;
      this.standOn = host.spec.size * env.frame.bot * 0.93 + host.standOn;
    }
    const air = this.hoverUp(dt);
    const flap = this.flapS.update(dt, this.flap || (this.flying() ? 1 : 0));
    const lean = this.leanS.update(dt, this.lean);
    this.orbS.update(dt, this.orb);
    this.legs((side, k) => [-8 * air, 22 * air, -side * 10 * air]);
    if (!this.flying() && !this.perched) this.walkLegs(this.heightPx * 0.9, 10, 14, 6);
    p.add('root', 0, 0, -lean);
    this.openS.update(dt, clamp(this.open + (this.hovered && this.act === 'idle' ? 0.8 : 0), 0, 1));
    this.tone(dt, env);
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    const t = env.time;
    const flap = clamp(this.flapS.y, 0, 1);
    const open = clamp(this.openS.y, 0, 1);
    const shake = this.shake;
    // Wings: a tent over her back when she is still, level when open, beating when she flies.
    const rest = (1 - open) * (1 - flap);
    if (flap > 0.02 || shake > 0.02) {
      const f = Math.max(flap, shake);
      const rate = TAU * (shake > flap ? 9 : 3.4 + 0.7 * Math.sin(t * 0.9)) * t;
      const beat = 0.5 - 0.5 * Math.cos(rate);
      const beat2 = 0.5 - 0.5 * Math.cos(rate - 0.5);
      const span = shake > flap ? 40 : 62;
      for (const [sfx, side] of SIDES) {
        p.turn(`wing.${sfx}`, 0, side * ((-14 + span * beat) * f), 0);
        p.turn(`hind.${sfx}`, 0, side * (-10 + span * 0.85 * beat2) * f, 0);
      }
      p.turn('body', 0, 0, 1.5 * f * Math.sin(rate));
      p.turn('abdomen', 3 * f * Math.sin(rate * 2), 0, 0);
    }
    for (const [sfx, side] of SIDES) {
      for (const [bone, r] of [
        [`wing.${sfx}`, REST_FORE],
        [`hind.${sfx}`, REST_HIND],
      ] as const) {
        p.turn(bone, r[0] * rest, side * r[1] * rest, side * r[2] * rest);
        p.shift(bone, side * r[3] * rest, r[4] * rest, r[5] * rest);
      }
    }
    // The orb: out of nothing beside her, bobbing, swinging when she bumps it. It is on
    // her root, so it is moved back by however far she has moved toward it.
    const o = clamp(this.orbS.y, 0.001, 1);
    p.stretch('bulb', o, [0, 0, 1], o);
    const reach = this.near;
    const push = this.nudgeS.update(dt, reach);
    const swing = this.swingS.update(dt, 0);
    const toward = 0.19 * push * this.dir;
    p.shift('root', toward, 0, 0);
    p.shift(
      'bulb',
      (this.dir < 0 ? -2 * ORB_X : 0) - toward + 0.05 * swing,
      0.0,
      0.01 * Math.sin(t * 2) + 0.01 * Math.abs(swing),
    );
    this.pivot.rotation.y = this.spin;
    this.lights(t);
  }

  /** Eye-spots (0, 2), edge cells (1) and the orb (3), each in its own colour. */
  private lights(t: number) {
    const colour = this.lookName === 'colour';
    const open = clamp(this.openS.y + this.flapS.y * 0.8, 0, 1);
    for (const i of [0, 1, 2]) {
      let level: number;
      if (this.act === 'dizzy') level = Math.random() < 0.5 ? 1 : 0.15;
      else if (this.spots) level = this.spots(i, t);
      else level = 0.3 + 0.3 * (0.5 + 0.5 * Math.sin(t * 0.9 - i * 0.8));
      level = clamp(level + this.glow * 0.3, 0, 1) * (0.5 + 0.5 * open);
      this.outfit.dot(i, level, colour ? new Color(i === 1 ? '#ff9a5a' : '#ffd24a') : undefined);
    }
    const o = this.orbS.y;
    const orbLevel = this.spots ? this.spots(3, t) : 0.6;
    this.outfit.dot(3, clamp(o > 0.02 ? orbLevel * o : 0, 0, 1), colour ? '#fff2a8' : undefined);
    void SPOTS;
  }
}
