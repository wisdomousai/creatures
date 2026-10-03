import type { Object3D } from 'three';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import type { Reaction } from './birds';
import { Bug, ease, SIDES, span, TAU } from './bug';
import { sin } from './moves';
import { Spring } from './spring';

/**
 * Reed, the robot dragonfly: a long slim body with a tail of six drums, a lit ring at every
 * joint, two huge green eye domes round a little screen face, and four long clear wings
 * held out flat. He lies along the floor like Clunk and hovers above it. He hovers dead
 * still, wings a blur, and darts: stops, then zips a long way sideways and stops dead
 * again; skims low and dips his tail; glides on still wings; loops; lands on a reed that
 * turns up and lowers his tail, or throws it straight up into the air ("obelisk") to keep
 * cool; wipes his eye domes with his front legs; sends a pulse of light down his tail;
 * lies flat in the sun and naps.
 *
 * A poke makes him shoot up with the whole tail flashing; three make him spin dizzy; the
 * mouse resting on him makes him hover close and glow.
 */
export const DRAGONFLY_FACE: FaceLayout = {
  width: 256,
  height: 192,
  eyes: [
    [0.29, 0.5],
    [0.71, 0.5],
  ],
  rx: 0.15,
  ry: 0.3,
  line: 0.05,
  mouth: null,
};

const TAIL = [1, 2, 3, 4, 5, 6].map((i) => `tail.${i}`);
const RINGS = 6;
const CELL = 6;

export class Dragonfly extends Bug {
  /** Held by the pointer, it flies after it. */
  readonly flies = true;
  private buzzS = new Spring(6, 0.8);
  private flatS = new Spring(3, 0.7);
  private tailS = new Spring(4, 0.55);
  private turnS = new Spring(3, 0.8);
  private pitchS = new Spring(5, 0.5);
  private reedS = new Spring(3, 0.8);
  private leanS = new Spring(5, 0.45);
  // Per-frame requests from acts, cleared in idle().
  private buzz = 0;
  /** Wings down and flat (1), or level and out (0). */
  private flat = 0;
  /** The tail: -1 hanging down, 0 trailing level, 1 held up. */
  private tail = 0;
  private dip = 0;
  private pitch = 0;
  private yaw = 0;
  private lean = 0;
  private spin = 0;
  private reed = 0;
  private flash = 0;
  private rings: ((i: number, t: number) => number) | null = null;
  private wipe = 0;
  private actSpeed = 1.1;
  private dir = 1;
  private stage = 0;
  private since = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Reed',
        model: 'dragonfly',
        metres: 0.4,
        width: 0.9,
        size: 0.45,
        feels: {
          default: { f: 4, zeta: 0.6 },
          root: { f: 4, zeta: 0.55 },
          body: { f: 5, zeta: 0.45 },
          head: { f: 5, zeta: 0.5, r: 0.5 },
          'tail.1': { f: 5, zeta: 0.4 },
          'tail.2': { f: 5.5, zeta: 0.35 },
          'tail.3': { f: 6, zeta: 0.35 },
          'tail.4': { f: 6.5, zeta: 0.3 },
          'tail.5': { f: 7, zeta: 0.3 },
          'tail.6': { f: 7.5, zeta: 0.3 },
          'wing.L': { f: 5, zeta: 0.5 },
          'wing.R': { f: 5, zeta: 0.5 },
          'hind.L': { f: 5, zeta: 0.5 },
          'hind.R': { f: 5, zeta: 0.5 },
          'antenna.L.1': { f: 3.5, zeta: 0.35 },
          'antenna.R.1': { f: 3.5, zeta: 0.35 },
          'antenna.L.2': { f: 4.5, zeta: 0.2 },
          'antenna.R.2': { f: 4.5, zeta: 0.2 },
        },
        face: DRAGONFLY_FACE,
        eyes: 0.5,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.8 },
          { bone: 'body', yaw: 0.15, pitch: 0 },
        ],
        reach: { yaw: 50, pitch: 25 },
        lag: 1.5,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 1.1,
        turn: 70,
        roam: true,
      },
      model,
    );
    this.acts = { ...this.moves(), ...this.reactions() };
  }

  private flying = () => this.air.y > 0.3;

  private moves(): Record<string, Act> {
    const p = this.puppet;
    const still = () => this.still() && this.state === 'here';
    return {
      idle: { weight: 3, length: [2.5, 5] },
      stroll: {
        weight: 1.2,
        length: [2.5, 4],
        when: this.still,
        start: () => {
          this.actSpeed = 1;
          this.amble(1.2 + Math.random() * 1.2);
        },
        pose: () => (this.actSpeed = 1),
      },
      hover: {
        weight: 2.2,
        length: [5, 7],
        face: 'happy',
        when: still,
        pose: (t) => {
          // Up off the floor and hanging dead still, wings a blur, the tail holding level
          // and just correcting itself, the head turning to look.
          const k = this.fade(t, 0.7);
          this.up = (0.85 + 0.04 * sin(t, 0.7)) * k;
          this.buzz = k;
          this.tail = 0.1 * sin(t, 0.4) * k;
          p.add('head', 3 * sin(t, 0.3), 14 * sin(t, 0.17) * k);
          this.rings = (i, s) => 0.35 + 0.35 * Math.sin(s * 2 - i * 0.7);
        },
      },
      dart: {
        weight: 2.6,
        length: [7, 8],
        face: 'determined',
        when: still,
        start: () => {
          this.stage = 0;
          this.since = 0;
          this.dir = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          // Hangs dead still, then zips a long way in a blink, stops dead, hangs again;
          // the tail streams out behind each zip and the rings flash with it.
          const k = this.fade(t, 0.5);
          this.up = 0.9 * k;
          this.buzz = k;
          const at = 1.2 + this.stage * 1.8;
          if (t > at && this.stage < 3 && !this.walking && t < this.actLength - 1.8) {
            this.actSpeed = 5;
            this.amble(
              2 + Math.random(),
              0.1 + Math.random() * 0.6,
              this.dir * (this.stage % 2 ? -1 : 1),
            );
            this.stage++;
            this.since = t;
          }
          const zip = this.walking ? 1 : 0;
          this.pitch = 0.5 * zip;
          this.tail = -0.15 * zip;
          this.flash = zip;
          p.add('head', -8 * zip);
          this.rings = (i, s) => (zip ? 1 : 0.3 + 0.3 * Math.sin(s * 3 - i));
        },
      },
      skim: {
        weight: 1.6,
        length: [6, 7],
        face: 'happy',
        when: still,
        start: () => {
          this.stage = 0;
          this.dir = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          // Low and steady along the floor as if over a pond, touching the tail tip down
          // now and then: a little bob, and the rings ripple out where it lands.
          const k = this.fade(t, 0.7);
          this.up = 0.35 * k;
          this.buzz = k;
          this.actSpeed = 1.6;
          if (t > 1 && this.stage === 0 && !this.walking) {
            this.stage = 1;
            this.amble(3.5, undefined, this.dir);
          }
          const dips = [1.8, 3.2, 4.6];
          let d = 0;
          for (const a of dips) d += ease(t, a, a + 0.18) * (1 - ease(t, a + 0.18, a + 0.5));
          this.dip = d;
          p.add('body', -3 * d);
          this.rings = (i, s) => {
            let l = 0.3;
            for (const a of dips) l = Math.max(l, 1 - Math.abs(s - a - 0.15 - (5 - i) * 0.12) * 5);
            return clamp(l, 0, 1);
          };
        },
      },
      glide: {
        weight: 1.3,
        length: [6, 8],
        face: 'neutral',
        when: still,
        start: () => (this.stage = 0),
        pose: (t) => {
          // Wings held out dead flat and still, gliding a long way on one beat, the tail
          // streaming straight behind.
          const k = this.fade(t, 0.8);
          this.up = (1.3 + 0.1 * sin(t, 0.3)) * k;
          this.buzz = t < 1.2 ? k : 0;
          this.actSpeed = 1.5;
          if (this.stage === 0 && t > 1.2) {
            this.stage = 1;
            this.amble(4.5);
          }
          this.lean = 6 * sin(t, 0.25) * k;
          this.tail = 0.1 * k;
          this.rings = (i, s) => 0.4 + 0.4 * Math.sin(s * 1.2 - i * 0.5);
        },
      },
      loop: {
        weight: 1,
        length: [3.4, 4],
        face: 'happy',
        when: still,
        pose: (t) => {
          // Turns right round on the spot in the air, wings a blur, the tail whipping.
          const k = this.fade(t, 0.5);
          this.up = 1.0 * k;
          this.buzz = k;
          this.spin = TAU * ease(t, 0.5, 3.0);
          this.tail = 0.3 * Math.sin(t * 6) * k;
          this.rings = (i, s) => 0.2 + 0.8 * Math.max(0, Math.sin(s * 10 - i * 1.2));
        },
      },
      perch: {
        weight: 2.4,
        length: [13, 14],
        face: 'happy',
        when: still,
        start: () => (this.stage = 0),
        pose: (t) => {
          // A reed turns up under him. He settles on its tip, wings down and flat, the
          // tail lowering a little at a time, a wing twitching, the head turning; then
          // flicks the tail up, wings humming, and lets go.
          const end = this.actLength;
          const on = span(t, 1.2, 2.4, end - 2.4, end - 1.2);
          this.reed = ease(t, 0.3, 1.5) * (1 - ease(t, end - 1.2, end - 0.3));
          this.up = (0.55 + 0.25 * (1 - on)) * span(t, 0, 0.9, end - 0.9, end);
          this.buzz = 1 - on;
          this.flat = on;
          this.tail = -0.8 * span(t, 3, 5.5, end - 2.5, end - 1.5);
          p.add('head', 4 * sin(t, 0.2) * on, 18 * sin(t, 0.13) * on);
          if (t > 6 && Math.sin(t * 1.3) > 0.97) this.since = t;
          this.rings = (i, s) => 0.15 + 0.15 * Math.sin(s * 0.9 - i);
        },
      },
      obelisk: {
        weight: 1.4,
        length: [6, 7],
        face: 'sheepish',
        when: still,
        pose: (t) => {
          // Down on his feet, nose down and the whole long tail stuck straight up in the
          // air to keep out of the sun, held there while the rings glow.
          const k = span(t, 0.5, 1.4, this.actLength - 1.4, this.actLength - 0.5);
          this.tail = 1 * k;
          this.pitch = 0.4 * k;
          this.flat = 0.5 * k;
          this.rings = (i, s) => 0.2 + 0.8 * k * (0.5 + 0.5 * Math.sin(s * 3 - i * 0.8));
          this.expression = k > 0.4 ? 'sheepish' : 'neutral';
        },
      },
      eyes: {
        weight: 1.2,
        length: [5, 6],
        face: 'happy',
        when: still,
        pose: (t) => {
          // Both front legs up to wipe the great eye domes, one after the other.
          const k = this.fade(t, 0.5);
          this.wipe = k;
          p.add('head', 6 * k);
          for (const [sfx, side] of SIDES) {
            const mine = t < this.actLength / 2 === side > 0;
            const use = mine ? k : 0;
            this.leg(sfx, side, 0, 34 * use, 46 * use + 8 * sin(t, 2.5) * use, -side * 20 * use);
          }
        },
      },
      pulse: {
        weight: 1.2,
        length: [4, 5],
        face: 'love',
        when: still,
        pose: (t) => {
          // A pulse of light runs down the tail from the thorax and back, the segments
          // lifting one after another as it passes.
          const k = this.fade(t, 0.4);
          this.tail = 0.15 * k;
          this.rings = (i, s) => {
            const x = (s * 2.2) % 2;
            const at = x < 1 ? x * 5 : (2 - x) * 5;
            return clamp(1 - Math.abs(i - at) * 0.55, 0.12, 1);
          };
          this.flat = 0.3 * k;
        },
      },
      sun: {
        weight: 1.6,
        length: [8, 10],
        face: 'happy',
        when: still,
        pose: (t) => {
          // Wings down flat to the floor either side, tail trailing, the rings warming.
          const k = span(t, 0.6, 1.6, this.actLength - 1.6, this.actLength - 0.6);
          this.flat = k;
          this.rings = (i, s) => 0.25 + 0.5 * k * (0.5 + 0.5 * Math.sin(s * 0.8 - i * 0.6));
          p.add('head', 3 * sin(t, 0.2) * k, 8 * sin(t, 0.1) * k);
        },
      },
      curious: {
        weight: 1.1,
        length: [3.5, 4.5],
        face: 'surprised',
        when: still,
        pose: (t) => {
          // Head tipped right over to one side, then the other, the antennae up.
          const k = this.fade(t, 0.4);
          p.add('head', 6 * k, 18 * k * Math.sin(t * 2), 20 * k * Math.sin(t * 2));
          this.feelers(() => [-20 * k, 0, 0]);
        },
      },
      nap: {
        weight: 0.9,
        length: [9, 13],
        when: still,
        pose: (t) => {
          const k = span(t, 1, 2.2, this.actLength - 2, this.actLength - 0.6);
          this.flat = k;
          this.tail = -0.5 * k;
          p.add('head', 18 * k);
          this.expression = k > 0.4 ? 'asleep' : 'sleepy';
          this.rings = (i, s) => 0.06 + 0.1 * (0.5 + 0.5 * Math.sin(s * 1.1 - i * 0.4));
        },
      },
    };
  }

  protected react(kind: Reaction, t: number) {
    const p = this.puppet;
    if (kind === 'poked') {
      const k = span(t, 0, 0.12, 0.6, 1.3);
      this.up = 1.4 * k;
      this.buzz = 1;
      this.flash = 1;
      this.tail = 0.6 * k;
      p.add('head', -10 * k);
      this.feelers(() => [-20 * k, 0, 0]);
    } else if (kind === 'dizzy') {
      const k = 1 - ease(t, 2.4, 3.4);
      this.up = 0.5 * k;
      this.buzz = 0.6 * k;
      this.spin = TAU * 2 * ease(t, 0, 3) * 0.5;
      this.tail = 0.4 * Math.sin(t * 6) * k;
      p.add('head', 8 * k * Math.cos(t * 5), 14 * k * Math.sin(t * 3), 22 * k * Math.sin(t * 5));
      this.flash = k;
    } else {
      const k = this.fade(t, 0.6);
      this.up = 0.7 * k;
      this.buzz = k;
      this.flash = 0.5 * k;
      p.add('head', 4 * k, 0, 8 * k * sin(t, 1.1));
      this.tail = 0.2 * sin(t, 1.2) * k;
    }
  }

  // ---------- Posing ----------

  protected idle(t: number) {
    const p = this.puppet;
    this.up = 0;
    this.buzz = 0;
    this.flat = 0;
    this.tail = 0;
    this.dip = 0;
    this.pitch = 0;
    this.yaw = 0;
    this.lean = 0;
    this.spin = 0;
    this.reed = 0;
    this.flash = 0;
    this.wipe = 0;
    this.rings = null;
    this.actSpeed = 1.1;
    this.expression = this.hovered ? 'happy' : 'neutral';
    p.add('body', 1 * sin(t, 0.3));
    p.add('head', 2 * sin(t, 0.4), 4 * sin(t, 0.13));
    this.feelers((side, k) => {
      const ph = side > 0 ? 0 : 0.3;
      return k === 1
        ? [5 * sin(t, 0.5, ph), 0, side * (-3 + 5 * sin(t, 0.37, ph))]
        : [10 * sin(t, 0.5, ph - 0.15), 0, side * 4 * sin(t, 0.61, ph)];
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
    if (this.state === 'entering' || this.state === 'leaving') {
      this.up = Math.max(this.up, 0.9);
      this.buzz = 1;
    }
    const H = this.heightPx;
    const air = this.hoverUp(dt);
    this.buzzS.update(dt, this.buzz || (this.flying() ? 1 : 0));
    const flat = this.flatS.update(dt, this.flat);
    const tail = this.tailS.update(dt, this.tail);
    const lean = this.leanS.update(dt, this.lean);
    const pitch = this.pitchS.update(dt, this.pitch);
    this.reedS.update(dt, this.reed);
    // Lying along the floor, turned toward the middle of his edge so his length shows.
    const [lo, hi] = this.span(env.frame);
    const aside =
      Math.sign((lo + hi) / 2 - this.s) * (this.edge === 'bottom' || this.edge === 'left' ? 1 : -1);
    const turned = this.walking ? 0.8 : 1;
    const yaw = this.turnS.update(dt, this.yaw !== 0 ? this.yaw : aside * 52 * turned);
    if (this.wipe < 0.02) {
      if (this.flying()) this.legs((side, k) => [-8 * air, 28 * air, -side * 10 * air]);
      else this.walkLegs(H * 0.9);
    }
    p.add('root', 0, yaw, -lean);
    p.add('body', 22 * pitch);
    // The tail: its own bend along the chain; the dip bobs the tip toward the floor.
    for (let i = 0; i < 6; i++) {
      const w = (i + 1) / 6;
      p.add(TAIL[i], tail * (14 + 6 * w) - 8 * this.dip * w * (i > 2 ? 1 : 0.3));
    }
    p.add('head', 0, -yaw * 0.5);
    void flat;
    this.tone(dt, env, null);
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    const t = env.time;
    const buzz = clamp(this.buzzS.y, 0, 1);
    const flat = clamp(this.flatS.y, 0, 1);
    // Wings: out and level; down flat when landed. The beat is direct, far too quick for
    // a spring, and the two pairs beat in turn so they smear into a fan.
    for (const [sfx, side] of SIDES) {
      const rest = -side * 26 * flat;
      let fore = rest;
      let hind = rest;
      if (buzz > 0.02) {
        const rate = TAU * 15 * t;
        fore += side * buzz * (4 + 26 * Math.sin(rate));
        hind += side * buzz * (4 + 26 * Math.sin(rate + 2.2));
        p.turn(`wing.${sfx}`, 0, 0, side * 2 * buzz * Math.sin(rate * 0.5));
      }
      p.turn(`wing.${sfx}`, 0, fore, 0);
      p.turn(`hind.${sfx}`, 0, hind, 0);
    }
    // The reed: grows up under his feet (its top is where they are, however high he hovers).
    const r = clamp(this.reedS.y, 0.001, 1);
    const lift = Math.max(0.01, this.h / this.px);
    p.stretch('reed', r * ((lift + 0.12) / 0.62), [0, 0, 1], r);
    this.pivot.rotation.y = this.spin;
    this.lights(t);
  }

  /** The six rings (Dot0..5) and the wing cells (Dot6). */
  private lights(t: number) {
    const asleep = this.expression === 'asleep';
    for (let i = 0; i < RINGS; i++) {
      let level: number;
      if (this.act === 'dizzy') level = Math.random() < 0.5 ? 1 : 0.2;
      else if (this.rings) level = this.rings(i, t);
      else level = 0.3 + 0.3 * Math.sin(t * 1.3 - i * 0.8);
      level = Math.max(level, this.flash * (0.5 + 0.5 * Math.sin(t * 18 - i * 0.9)));
      if (this.hovered && this.act === 'idle') level = 0.5 + 0.5 * Math.sin(t * 3 - i * 0.9);
      this.outfit.dot(i, clamp(asleep ? level * 0.5 : level, 0, 1));
    }
    this.outfit.dot(CELL, clamp(0.3 + 0.5 * this.buzzS.y + 0.2 * Math.sin(t * 2), 0, 1));
  }
}
