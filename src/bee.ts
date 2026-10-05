import type { Object3D } from 'three';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import type { Reaction } from './birds';
import { Bug, ease, SIDES, span, TAU } from './bug';
import { sin } from './moves';
import { Spring } from './spring';

/**
 * Dandy, the robot bee: a round striped barrel of an abdomen (three lit bands, brighter
 * when he's busy) under a golden thorax and a big screen-faced head, little leaf wings that
 * blur when he hovers, antennae with glowing tips, and a pollen basket on each back leg that
 * lights up as it fills. He hovers and bobs, darts, buzzes figures of eight, spins; waggles
 * out the dance of where the flowers are (running along the floor with his abdomen
 * swinging, looping back, running again); gathers pollen at a flower that isn't there, the
 * baskets glowing fuller each time; flies into the back wall, tumbles, shakes his head and
 * carries on; rubs his antennae clean, warms his wings up, curls up for a nap.
 *
 * A poke sends him straight up with the bands flashing; three make him dizzy; the mouse
 * resting on him makes him hover close and glow.
 */
export const BEE_FACE: FaceLayout = {
  width: 256,
  height: 192,
  eyes: [
    [0.3, 0.47],
    [0.7, 0.47],
  ],
  rx: 0.11,
  ry: 0.27,
  line: 0.05,
  mouth: [0.5, 0.8],
};

const BANDS = [0, 1, 2];
const BASKETS = [3, 4];

export class Bee extends Bug {
  static readonly terms =
    'bumblebee honeybee insect yellow gold black brown stripes striped wings buzz hover fly antennae pollen basket honey waggle dance flowers';

  /** Held by the pointer, it flies after it. */
  readonly flies = true;
  private buzzS = new Spring(6, 0.8);
  private wagS = new Spring(7, 0.7);
  private pollenS = new Spring(1.6, 0.9);
  private leanS = new Spring(5, 0.45);
  private curlS = new Spring(2.2, 0.8);
  // Per-frame requests from acts, cleared in idle().
  private buzz = 0;
  private wag = 0;
  private pollen = 0;
  private lean = 0;
  private curl = 0;
  private spin = 0;
  private flash = 0;
  private bands: ((i: number, t: number) => number) | null = null;
  private beacon: string | null = null;
  private actSpeed = 1.2;
  private dir = 1;
  private stage = 0;
  private since = 0;
  private base = { s: 0, depth: 0 };

  constructor(model: Object3D) {
    super(
      {
        name: 'Dandy',
        model: 'bee',
        metres: 0.6,
        width: 0.5,
        size: 0.5,
        feels: {
          default: { f: 4, zeta: 0.6 },
          root: { f: 4, zeta: 0.5 },
          body: { f: 5, zeta: 0.45 },
          abdomen: { f: 6, zeta: 0.35 },
          head: { f: 5, zeta: 0.5, r: 0.5 },
          'wing.L': { f: 5, zeta: 0.5 },
          'wing.R': { f: 5, zeta: 0.5 },
          'wing.L.2': { f: 5, zeta: 0.5 },
          'wing.R.2': { f: 5, zeta: 0.5 },
          'antenna.L.1': { f: 3.5, zeta: 0.35 },
          'antenna.R.1': { f: 3.5, zeta: 0.35 },
          'antenna.L.2': { f: 4.5, zeta: 0.2 },
          'antenna.R.2': { f: 4.5, zeta: 0.2 },
        },
        face: BEE_FACE,
        eyes: 0.68,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.8 },
          { bone: 'body', yaw: 0.2, pitch: 0 },
        ],
        reach: { yaw: 55, pitch: 28 },
        lag: 1.4,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 1.2,
        turn: 60,
        roam: true,
      },
      model,
    );
    this.acts = { ...this.hovers(), ...this.ground(), ...this.reactions() };
  }

  private flying = () => this.air.y > 0.3;

  // ---------- In the air ----------

  private hovers(): Record<string, Act> {
    const aloft = () => this.still() && this.state === 'here';
    const p = this.puppet;
    return {
      idle: { weight: 3, length: [2.5, 5] },
      hover: {
        weight: 2.2,
        length: [4, 7],
        face: 'happy',
        when: aloft,
        pose: (t) => {
          // Hanging in the air, bobbing, drifting a little, the bands pulsing.
          const k = this.fade(t, 0.6);
          this.up = k;
          this.buzz = k;
          p.add('body', -8 * k + 3 * sin(t, 0.9) * k);
          p.add('head', 8 * k, 12 * sin(t, 0.4) * k);
          this.bands = (i, s) => 0.5 + 0.5 * Math.sin(s * 3 - i * 1.2);
        },
      },
      dart: {
        weight: 2,
        length: [5, 7],
        face: 'determined',
        when: aloft,
        start: () => {
          this.stage = 0;
          this.dir = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          // Up, a dart to one side, a dead stop, a dart to the other, each one a lean into
          // it and a skid.
          const k = this.fade(t, 0.5);
          this.up = (0.9 + 0.15 * sin(t, 1.3)) * k;
          this.buzz = k;
          this.actSpeed = 5;
          if (t > 0.8 + this.stage * 1.5 && this.stage < 3 && !this.walking) {
            this.amble(1.6 + Math.random(), undefined, this.dir * (this.stage % 2 ? -1 : 1));
            this.stage++;
          }
          const speed = clamp(this.pace / (this.heightPx * 3), -1, 1);
          this.lean = 24 * speed * k;
          p.add('body', -12 * k - 6 * Math.abs(speed));
          this.flash = Math.abs(speed);
        },
      },
      figureEight: {
        weight: 1.3,
        length: [7, 9],
        face: 'happy',
        when: aloft,
        start: () => (this.stage = 0),
        pose: (t) => {
          // Loops of a figure of eight, rising and dipping, rolling into each turn, with a
          // light chasing round the bands.
          const k = this.fade(t, 0.6);
          this.up = (0.95 + 0.3 * sin(t, 0.5)) * k;
          this.buzz = k;
          this.actSpeed = 2.6;
          if (t > this.stage * 1.4 && this.stage < 5 && !this.walking) {
            this.amble(1.4, 0.15 + Math.random() * 0.5, this.stage % 2 ? -1 : 1);
            this.stage++;
          }
          this.lean = 22 * Math.cos(t * 2.2) * k;
          p.add('body', -12 * k);
          this.bands = (i, s) => Math.max(0, Math.cos(s * 6 - i * 2.1)) * 0.9 + 0.1;
        },
      },
      spinHover: {
        weight: 1,
        length: [3.2, 3.8],
        face: 'happy',
        when: aloft,
        pose: (t) => {
          // Turning round on the spot as he hangs there, the bands flashing.
          const k = this.fade(t, 0.5);
          this.up = k;
          this.buzz = k;
          this.spin = TAU * ease(t, 0.6, 2.8);
          p.add('body', -10 * k);
          this.flash = 1;
        },
      },
      buzzMate: {
        weight: 1.2,
        length: [7, 9],
        face: 'surprised',
        when: () => aloft() && this.mates().length > 0,
        start: () => (this.stage = 0),
        pose: (t) => {
          // Over to a crewmate, hangs in front of its face for a look, buzzes off again.
          const m = this.mates()[0];
          const k = this.fade(t, 0.5);
          this.up = k;
          this.buzz = k;
          this.actSpeed = 4;
          if (m && t < 4.5 && !this.walking && this.stage < 1) {
            const side = this.s < m.s ? -1 : 1;
            this.walkTo(
              m.s + side * (this.heightPx * 0.9 + m.footprint(this.env!.frame).x),
              m.depth,
            );
            this.stage = 1;
          }
          if (t > 5.5 && this.stage === 1 && !this.walking) {
            this.stage = 2;
            this.amble(3);
          }
          p.add('body', -10 * k);
          p.add('head', 6 * k, 18 * sin(t, 1.2) * k);
        },
      },
      pollen: {
        weight: 1.6,
        length: [9, 10],
        face: 'happy',
        when: aloft,
        pose: (t) => {
          // At a flower that isn't there: in, head down in it, the back legs pumping, the
          // baskets filling with light; backs off, pleased, and in again.
          const k = this.fade(t, 0.7);
          const dip = span(t, 1, 1.6, 3.4, 4.0) + span(t, 4.8, 5.4, 7.2, 7.8);
          this.up = (0.9 - 0.12 * dip) * k;
          this.buzz = k;
          this.pollen = ease(t, 1.5, 4.5) * 0.55 + ease(t, 5.2, 7.5) * 0.45;
          p.add('body', 14 * dip - 6 * k);
          p.add('head', 18 * dip, 10 * sin(t, 1.1) * dip);
          p.add('abdomen', -8 * dip);
          this.legs((side, k2) =>
            k2 === 2 ? [10 * sin(t, 4, side * 0.25) * dip, 8 * dip, 0] : [-8 * k, 20 * k, 0],
          );
          this.bands = (i, s) => 0.6 + 0.4 * Math.sin(s * 4 - i);
        },
      },
      bonk: {
        weight: 1,
        length: [10, 11],
        face: 'determined',
        when: aloft,
        start: () => {
          this.stage = 0;
          this.since = 0;
          this.base = { s: this.s, depth: this.depth };
        },
        pose: (t) => {
          // Off toward the back wall, full tilt, straight into it: a bonk, a drop, a dizzy
          // shake of the head, and up again as if nothing happened.
          const speed = 4.5;
          this.actSpeed = speed;
          if (this.stage === 0) {
            this.up = this.fade(t, 0.5);
            this.buzz = 1;
            p.add('body', -16);
            if (t > 0.5) {
              this.walkTo(this.s, 1);
              this.stage = 1;
            }
          } else if (this.stage === 1) {
            this.up = 1;
            this.buzz = 1;
            p.add('body', -20);
            if (this.depth > 0.96 || t > 5) {
              this.stage = 2;
              this.since = t;
              this.goal = null;
              this.depthGoal = this.depth;
              p.kick('root', -700);
              p.kick('head', -500);
              this.feelers((side, k2) => {
                p.kick(`antenna.${side > 0 ? 'L' : 'R'}.${k2}`, 600, 0, side * 300);
                return [0, 0, 0];
              });
              this.air.kick(-9);
            }
          } else {
            const b = t - this.since;
            const down = ease(b, 0, 0.2) * (1 - ease(b, 1.6, 2.6));
            this.up = 1 - 0.95 * down;
            this.buzz =
              b < 0.3 ? 0.3 : b < 1.6 ? 0.25 * (Math.sin(b * 9) > 0 ? 1 : 0) : ease(b, 1.6, 2.2);
            const dizzy = span(b, 0.3, 0.6, 1.8, 2.4);
            p.add('body', 8 * sin(b, 1.2) * dizzy, 0, 14 * sin(b, 2.2) * dizzy);
            p.add('head', 12 * dizzy, 20 * sin(b, 1.7) * dizzy);
            this.expression = b < 2.2 ? 'dizzy' : 'happy';
            if (this.stage === 2 && b > 2.8) {
              this.stage = 3;
              this.actSpeed = 2;
              this.walkTo(this.base.s, Math.min(this.base.depth, 0.5));
            }
            if (this.stage === 3 && this.there && b > 3.4)
              this.actLength = Math.min(this.actLength, t + 0.4);
          }
        },
      },
    };
  }

  // ---------- On the floor ----------

  private ground(): Record<string, Act> {
    const p = this.puppet;
    return {
      scurry: {
        weight: 1.3,
        length: [2.5, 4],
        when: this.still,
        start: () => {
          this.actSpeed = 1.6;
          this.amble(1.5 + Math.random() * 1.5);
        },
        pose: () => (this.actSpeed = 1.6),
      },
      waggle: {
        weight: 1.8,
        length: [10, 12],
        face: 'happy',
        when: this.still,
        start: () => {
          this.stage = 0;
          this.since = 0;
          this.dir = Math.random() < 0.5 ? -1 : 1;
          this.base = { s: this.s, depth: this.depth };
        },
        pose: (t) => {
          // The waggle dance: a run along the floor with the abdomen swinging hard and the
          // bands flashing, a loop back round to the start, the run again, the other loop.
          const [more, room] = this.room();
          const H = this.heightPx;
          const run = Math.min(Math.max(room, 0), H * 1.6);
          const way = run > H * 0.8 ? more : -more;
          const far = this.base.s + way * Math.max(H * 0.6, run);
          const d = this.base.depth;
          const legs: [number, number][] = [
            [far, d],
            [this.base.s, clamp(d + 0.25, 0, 1)],
            [far, d],
            [this.base.s, clamp(d - 0.2, 0, 1)],
          ];
          this.actSpeed = this.stage % 2 === 1 ? 0.8 : 1.5;
          if (t > 0.6 && t > this.since + 0.4 && this.stage < 4 && !this.walking) {
            this.walkTo(...legs[this.stage]);
            this.stage++;
            this.since = t;
          }
          const running = this.stage % 2 === 1 && this.walking; // stages 1 and 3 are the runs
          this.wag = running ? 1 : 0.1;
          this.flash = running ? 1 : 0;
          this.buzz = running ? 0.3 : 0;
          p.add('body', -4 * (running ? 1 : 0));
          this.walkLegs(H * 0.9, 12, 16, 5);
          if (t > 10 && !this.walking) this.actLength = Math.min(this.actLength, t + 0.3);
        },
      },
      preen: {
        weight: 1.2,
        length: [5, 6.5],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // Both front legs up over the head, drawing each antenna through them in turn.
          const k = envelopeOf(t, this.actLength);
          p.add('head', 10 * k);
          for (const [sfx, side] of SIDES) {
            const mine = t < this.actLength / 2 === side > 0;
            const use = mine ? k : 0;
            p.add(`antenna.${sfx}.1`, 70 * use, 0, side * 20 * use);
            p.add(`antenna.${sfx}.2`, 40 * use);
            this.leg(sfx, side, 0, 30 * use, 40 * use + 6 * sin(t, 3) * use, -side * 20 * use);
          }
          p.add('body', 4 * k);
        },
      },
      shiver: {
        weight: 1,
        length: [2.6, 3.4],
        face: 'focused',
        when: this.still,
        pose: (t) => {
          // Warming the wings up on the spot: they buzz out, he trembles, the bands glow.
          const k = span(t, 0.2, 0.5, this.actLength - 0.6, this.actLength - 0.2);
          this.buzz = k;
          this.up = 0.04 * k;
          p.add('body', -4 * k);
          this.flash = k;
        },
      },
      wiggle: {
        weight: 1.1,
        length: [3, 4],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // A happy bottom-wiggle, the whole barrel swinging, bands flickering.
          const k = envelopeOf(t, this.actLength);
          this.wag = 0.8 * k;
          p.add('body', 0, 0, 6 * sin(t, 2.4) * k);
          this.bands = (i, s) => (Math.sin(s * 9 + i * 2) > 0 ? 1 : 0.15);
        },
      },
      nap: {
        weight: 0.9,
        length: [9, 13],
        when: this.still,
        pose: (t) => {
          // Curled up: wings folded flat back, head tucked, antennae drooping, the bands
          // nearly out and breathing slowly.
          const k = span(t, 1, 2.2, this.actLength - 2, this.actLength - 0.6);
          this.curl = k;
          p.add('head', 28 * k);
          p.add('body', 8 * k);
          this.feelers(() => [40 * k, 0, 0]);
          this.expression = k > 0.4 ? 'asleep' : 'sleepy';
          this.bands = (i, s) =>
            (0.08 + 0.12 * (0.5 + 0.5 * Math.sin(s * 1.1 - i * 0.4))) * (1 - 0.5 * k) + 0.05;
        },
      },
    };
  }

  protected react(kind: Reaction, t: number) {
    const p = this.puppet;
    if (kind === 'poked') {
      // Straight up with the wings screaming and every band flashing, then back to hover.
      const k = span(t, 0, 0.15, 1.2, 1.8);
      this.up = 2.2 * k;
      this.buzz = 1;
      this.flash = 1;
      p.add('body', -20 * k);
      this.feelers(() => [-20 * k, 0, 0]);
    } else if (kind === 'dizzy') {
      const k = 1 - ease(t, 2.4, 3.4);
      this.up = 0.7 * k;
      this.buzz = 0.7 * k;
      p.add('head', 8 * k * Math.cos(t * 5), 12 * k * Math.sin(t * 3), 24 * k * Math.sin(t * 5));
      p.add('body', 0, 0, 10 * k * Math.sin(t * 5));
      this.flash = k;
    } else {
      // Hanging close, wings blurring, the bands glowing, a happy wag.
      const k = this.fade(t, 0.6);
      this.up = 0.75 * k;
      this.buzz = k;
      this.wag = 0.5 * k;
      p.add('head', 6 * k, 0, 8 * k * sin(t, 1.2));
      p.add('body', -10 * k);
      this.flash = 0.6 * k;
    }
  }

  // ---------- Posing ----------

  protected idle(t: number) {
    const p = this.puppet;
    this.up = 0;
    this.buzz = 0;
    this.wag = 0;
    this.pollen = 0;
    this.lean = 0;
    this.curl = 0;
    this.spin = 0;
    this.flash = 0;
    this.bands = null;
    this.beacon = null;
    this.actSpeed = 1.2;
    this.expression = this.hovered ? 'happy' : 'neutral';
    p.add('body', 1.2 * sin(t, 0.3));
    p.add('head', 2 * sin(t, 0.4), 4 * sin(t, 0.13));
    p.add('abdomen', 2 * sin(t, 0.3, 0.2));
    // Antennae waving, each a little out of step with the other.
    this.feelers((side, k) => {
      const ph = side > 0 ? 0 : 0.3;
      return k === 1
        ? [6 * sin(t, 0.5, ph), 0, side * (-4 + 6 * sin(t, 0.37, ph))]
        : [12 * sin(t, 0.5, ph - 0.15), 0, side * 5 * sin(t, 0.61, ph)];
    });
    // Feet shifting a little, now and then.
    this.legs((side, k) => [
      2 * sin(t, 0.17, k * 0.31 + side * 0.1),
      3 * Math.max(0, sin(t, 0.11, k * 0.4 + side * 0.2)) ** 4,
      0,
    ]);
    // The wings flex slowly, like a held breath.
    for (const [sfx, side] of SIDES) {
      p.add(`wing.${sfx}`, 0, 0, side * (4 + 5 * sin(t, 0.22, side * 0.1)));
      p.add(`wing.${sfx}.2`, 0, 0, side * 3 * sin(t, 0.22, 0.1));
    }
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    this.env = env;
    this.spec.speed = this.actSpeed;
    this.enjoy(dt, this.still());
    // Coming and going he flies.
    if (this.state === 'entering' || this.state === 'leaving') {
      this.up = Math.max(this.up, 0.9);
      this.buzz = 1;
    }
    const H = this.heightPx;
    const air = this.hoverUp(dt);
    const buzz = this.buzzS.update(dt, this.buzz || (this.flying() ? 1 : 0));
    const lean = this.leanS.update(dt, this.lean);
    const curl = this.curlS.update(dt, this.curl);
    // Legs: tucked up under him in the air; a quick scurry on the ground.
    this.legs((side, k) => [-10 * air * (k + 1) * 0.5, 34 * air, -side * 12 * air]);
    if (!this.flying()) this.walkLegs(H * 0.9);
    // Leaning into a dart.
    p.add('root', 0, 0, -lean);
    p.add('body', -8 * air * buzz);
    // Wings: out and beating, or folded back flat on a nap.
    const out = clamp(buzz, 0, 1);
    for (const [sfx, side] of SIDES) {
      p.add(`wing.${sfx}`, 0, side * (75 * curl), side * -8 * out);
      p.add(`wing.${sfx}.2`, 0, side * 10 * curl, 0);
    }
    this.tone(dt, env, this.beacon);
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    const t = env.time;
    const buzz = clamp(this.buzzS.y, 0, 1);
    // The wingbeat, direct: far too quick for a spring. The second blade beats a little
    // out of step so the two smear into a fan.
    if (buzz > 0.02) {
      const rate = TAU * 11 * t;
      for (const [sfx, side] of SIDES) {
        p.turn(
          `wing.${sfx}`,
          0,
          side * 6 * buzz * Math.cos(rate),
          side * 32 * buzz * Math.sin(rate),
        );
        p.turn(
          `wing.${sfx}.2`,
          0,
          -side * 8 * buzz * Math.cos(rate + 0.9),
          side * 36 * buzz * Math.sin(rate + 1.2),
        );
      }
      p.turn('body', 0, 0, 1 * buzz * Math.sin(t * 90));
    }
    // The abdomen swings from side to side in the dance, or just wags.
    const wag = this.wagS.update(dt, this.wag);
    if (wag > 0.01) p.turn('abdomen', 0, 0, 26 * wag * Math.sin(t * TAU * 7.5));
    this.pivot.rotation.y = this.spin;
    this.lights(dt, t);
  }

  /** Three lit bands round the barrel and the pollen baskets on the back legs. */
  private lights(dt: number, t: number) {
    const pollen = this.pollenS.update(dt, this.pollen);
    const asleep = this.expression === 'asleep';
    BANDS.forEach((dot, i) => {
      let level: number;
      if (this.act === 'dizzy') level = Math.random() < 0.5 ? 1 : 0.2;
      else if (this.bands) level = this.bands(i, t);
      else level = 0.65 + 0.35 * Math.sin(t * 1.4 - i * 0.9);
      level = Math.max(level, this.flash * (0.5 + 0.5 * Math.sin(t * 18 - i * 1.4)));
      if (this.hovered && this.act === 'idle') level = 0.55 + 0.45 * Math.sin(t * 4 - i * 1.1);
      this.outfit.dot(dot, clamp(asleep ? level * 0.5 : level, 0, 1));
    });
    BASKETS.forEach((dot, i) => {
      const glow = 0.1 + 0.9 * clamp(pollen, 0, 1) * (0.8 + 0.2 * Math.sin(t * 5 + i * 2));
      this.outfit.dot(dot, clamp(glow, 0, 1));
    });
  }
}

/** Eases in over the first half second and out over the last of an act of `length`. */
function envelopeOf(t: number, length: number) {
  return ease(t, 0, 0.5) * (1 - ease(t, length - 0.5, length));
}
