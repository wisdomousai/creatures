import type { Object3D } from 'three';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import type { Reaction } from './birds';
import { Bug, ease, SIDES, span, TAU } from './bug';
import { sin } from './moves';
import { Spring } from './spring';

/**
 * Muffet, the robot jumping spider: small, round and fuzzy, almost all face. Two huge
 * shiny eyes on a wide screen, four little lit ones on the brow, two stubby colourful
 * palps that glow at the tips, and eight short jointed legs. She hops: a crouch, a leap in
 * an arc, a precise landing on the spot she chose (and now and then a backflip on the
 * way). She waves her palps like a boxer, tips her head at you, stalks along low and
 * freezes, rears up on four legs in a threat, does a little courtship dance with both
 * front legs up and the abdomen wagging, peeks round to each side, and rubs her palps
 * clean.
 *
 * A poke makes her jump straight up with the palps flashing; three make her dizzy; the
 * mouse resting on her makes her rear up and wave.
 */
export const SPIDER_FACE: FaceLayout = {
  width: 256,
  height: 192,
  eyes: [
    [0.29, 0.5],
    [0.71, 0.5],
  ],
  rx: 0.18,
  ry: 0.32,
  line: 0.05,
  mouth: null,
};

const LEGS = 4;

export class JumpingSpider extends Bug {
  static readonly terms =
    'spider arachnid tiny small fuzzy furry hairy brown cream white lilac pink black eight legs big eyes hop jump leap boxing';

  private crouchS = new Spring(7, 0.5);
  private rearS = new Spring(5, 0.5);
  private tiltS = new Spring(5, 0.5);
  private wagS = new Spring(7, 0.6);
  // Per-frame requests from acts, cleared in idle().
  private crouch = 0;
  private rear = 0;
  private tilt = 0;
  private wag = 0;
  private palps = 0;
  private dance = 0;
  private flip = 0;
  private flash = 0;
  private eyesOn = 1;
  private curl = 0;
  private lights: ((i: number, t: number) => number) | null = null;
  private actSpeed = 0.9;
  private dir = 1;
  private stage = 0;
  private since = 0;
  private hopT = -1;
  private hopFlip = false;
  private freeze = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Muffet',
        model: 'jumpingspider',
        metres: 0.3,
        width: 0.52,
        size: 0.42,
        feels: {
          default: { f: 4, zeta: 0.6 },
          root: { f: 4, zeta: 0.55 },
          body: { f: 5, zeta: 0.45 },
          abdomen: { f: 6, zeta: 0.3 },
          'palp.L.1': { f: 6, zeta: 0.4 },
          'palp.R.1': { f: 6, zeta: 0.4 },
          'palp.L.2': { f: 7, zeta: 0.35 },
          'palp.R.2': { f: 7, zeta: 0.35 },
        },
        face: SPIDER_FACE,
        eyes: 0.67,
        gaze: [{ bone: 'body', yaw: 0.8, pitch: 0.8 }],
        reach: { yaw: 55, pitch: 28 },
        lag: 1.3,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 0.9,
        turn: 90,
        roam: true,
      },
      model,
    );
    this.acts = { ...this.moves(), ...this.reactions() };
  }

  /** Eight legs: [forward, lift, foot] for each, by side and pair. */
  private legs8(fn: (side: number, k: number) => number[]) {
    for (const [sfx, side] of SIDES)
      for (let k = 0; k < LEGS; k++) {
        const [fwd, lift, foot] = fn(side, k);
        this.leg(sfx, side, k, fwd, lift, foot);
      }
  }

  /** The two palps: [pitch, yaw, roll] for the base and the tip, by side. */
  private palp(fn: (side: number, k: number) => [number, number, number]) {
    for (const [sfx, side] of SIDES)
      for (const k of [1, 2]) this.puppet.add(`palp.${sfx}.${k}`, ...fn(side, k));
  }

  private leap(heights: number, arc: number, time: number, flip = false) {
    const f = this.env?.frame;
    if (!f) return;
    const [lo, hi] = this.span(f);
    const [more] = this.room();
    const way = this.dir || more;
    const to = clamp(
      this.s + way * heights * this.heightPx,
      lo + this.widthPx() * 0.6,
      hi - this.widthPx() * 0.6,
    );
    const depth = clamp(this.depth + (Math.random() - 0.5) * 0.3, 0, 1);
    this.hopOnto(to, depth, 0, time, arc);
    this.hopT = 0;
    this.hopFlip = flip;
  }

  private moves(): Record<string, Act> {
    const p = this.puppet;
    const still = () => this.still() && this.state === 'here' && !this.hopping;
    return {
      idle: { weight: 3, length: [2.5, 5] },
      scuttle: {
        weight: 1.3,
        length: [2.5, 4],
        when: this.still,
        start: () => {
          this.actSpeed = 1.5;
          this.amble(1.3 + Math.random() * 1.3);
        },
        pose: () => (this.actSpeed = 1.5),
      },
      hop: {
        weight: 3,
        length: [6, 7],
        face: 'happy',
        when: still,
        start: () => {
          this.stage = 0;
          this.dir = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          // Three hops: she sinks on her legs, stares at the spot, and springs; each lands
          // exactly and settles with a little bounce, then looks round for the next.
          const at = 0.8 + this.stage * 1.9;
          if (!this.hopping && t > at && this.stage < 3 && t < this.actLength - 2) {
            this.crouch = 1;
            if (t > at + 0.45) {
              this.leap(1.4 + Math.random() * 0.8, 0.9, 0.55);
              this.dir = this.dir * (Math.random() < 0.7 ? 1 : -1);
              this.stage++;
            }
          }
          this.palps = 0.2;
        },
      },
      flip: {
        weight: 1.2,
        length: [4, 4.6],
        face: 'surprised',
        when: still,
        start: () => {
          this.stage = 0;
          this.dir = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          // A deep crouch, then one big leap with a backflip in the air and a landing
          // on all eight, pleased with herself.
          if (!this.hopping && this.stage === 0) {
            this.crouch = ease(t, 0.2, 0.9);
            if (t > 1) {
              this.leap(2.2, 1.5, 0.9, true);
              this.stage = 1;
            }
          }
          if (this.stage === 1 && !this.hopping && t > 2) {
            this.stage = 2;
            p.kick('body', 300);
          }
          this.expression = this.stage === 2 ? 'happy' : this.expression;
        },
      },
      box: {
        weight: 1.8,
        length: [4, 5],
        face: 'determined',
        when: still,
        pose: (t) => {
          // Palps up and punching, one then the other, the tips flashing.
          const k = this.fade(t, 0.4);
          this.palps = 1.4 * k;
          this.rear = 0.3 * k;
          this.lights = (i, s) => (i < 2 ? (Math.sin(s * 11 + i * Math.PI) > 0 ? 1 : 0.2) : 0.5);
        },
      },
      tilt: {
        weight: 2,
        length: [3.5, 4.5],
        face: 'surprised',
        when: still,
        pose: (t) => {
          // Her whole body tipped over to one side to look at you, then the other, the
          // brow eyes blinking in turn.
          const k = this.fade(t, 0.4);
          this.tilt = k * Math.sign(Math.sin(t * 1.6));
          this.lights = (i, s) => (i === 3 ? (Math.sin(s * 5) > 0 ? 1 : 0.3) : 0.5);
        },
      },
      dance: {
        weight: 1.8,
        length: [8, 9],
        face: 'love',
        when: still,
        pose: (t) => {
          // The courtship dance: both front legs up and waving in turn, the abdomen
          // wagging, little side steps, the palps and the lights going.
          const k = span(t, 0.5, 1.2, this.actLength - 1.2, this.actLength - 0.5);
          this.dance = k;
          this.wag = k;
          this.palps = 0.6 * k;
          this.rear = 0.5 * k;
          p.add('body', 0, 0, 5 * k * Math.sin(t * 6));
          this.lights = (i, s) => 0.4 + 0.6 * Math.max(0, Math.sin(s * 6 - i * 0.9));
          if (!this.walking && Math.sin(t * 1.4) > 0.99) this.amble(0.5);
        },
      },
      threat: {
        weight: 1.1,
        length: [3, 3.6],
        face: 'cross',
        when: still,
        pose: (t) => {
          // Rears up on four legs, front pair flung wide, palps spread, the lights
          // flashing, holds it, then settles as if nothing happened.
          const on = span(t, 0.4, 0.8, 2.3, 2.9);
          this.rear = 1.1 * on;
          this.palps = 0.8 * on;
          this.flash = on;
          this.dance = 0.6 * on;
        },
      },
      stalk: {
        weight: 1.5,
        length: [8, 9],
        face: 'determined',
        when: still,
        start: () => {
          this.stage = 0;
          this.dir = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          // Creeping up on something, low, a few steps at a time, then freezing dead
          // still with the palps held forward; then a pounce.
          const at = 0.8 + this.stage * 2.4;
          this.crouch = 0.6;
          this.actSpeed = 0.6;
          if (this.stage < 2 && !this.walking && t > at && !this.hopping) {
            this.amble(0.9, undefined, this.dir);
            this.stage++;
          }
          this.freeze = this.walking ? 0 : 1;
          this.palps = 0.5 * this.freeze;
          if (this.stage === 2 && !this.walking && !this.hopping && t > 6) {
            this.crouch = 1;
            if (t > 6.5 && this.stage === 2) {
              this.leap(1.6, 0.8, 0.5);
              this.stage = 3;
            }
          }
        },
      },
      peek: {
        weight: 1.3,
        length: [5, 6],
        face: 'sheepish',
        when: still,
        pose: (t) => {
          // Leans out to peek round the left, ducks back, peeks round the right.
          const k = this.fade(t, 0.4);
          const a = span(t, 0.5, 1.1, 1.9, 2.5) - span(t, 3, 3.6, 4.4, 5);
          this.tilt = 0.6 * a * k;
          p.add('root', 0, 0, -14 * a * k);
          p.add('body', -6 * Math.abs(a) * k);
        },
      },
      clean: {
        weight: 1.1,
        length: [5, 6],
        face: 'happy',
        when: still,
        pose: (t) => {
          // Palps drawn up and rubbed together under the screen, again and again.
          const k = this.fade(t, 0.4);
          this.palps = 0;
          this.palp((side, j) => [
            (j === 1 ? 50 : 40) * k,
            side * -22 * k * (0.6 + 0.4 * sin(t, 3)),
            0,
          ]);
          p.add('body', 5 * k);
        },
      },
      nap: {
        weight: 0.9,
        length: [9, 12],
        when: still,
        pose: (t) => {
          // Legs tucked right in, the eyes shut, the lights dim.
          const k = span(t, 1, 2.2, this.actLength - 2, this.actLength - 0.6);
          this.curl = k;
          this.expression = k > 0.4 ? 'asleep' : 'sleepy';
          this.eyesOn = 0;
          this.lights = (_i, s) => 0.08 + 0.1 * (0.5 + 0.5 * Math.sin(s * 1.1));
        },
      },
    };
  }

  protected react(kind: Reaction, t: number) {
    const p = this.puppet;
    if (kind === 'poked') {
      const k = span(t, 0, 0.12, 0.5, 1.0);
      this.up = 0.9 * k;
      this.flash = 1;
      this.palps = 1 * k;
      this.rear = 0.8 * k;
      p.add('body', -8 * k);
    } else if (kind === 'dizzy') {
      const k = 1 - ease(t, 2.4, 3.4);
      this.tilt = 0.6 * Math.sin(t * 4) * k;
      this.wag = k;
      this.flash = k;
      this.palp((side, j) => [8 * k * Math.cos(t * 5), 20 * k * Math.sin(t * 3 + side), 0 * j]);
      p.add('body', 0, 12 * k * Math.sin(t * 3), 14 * k * Math.sin(t * 5));
    } else {
      const k = this.fade(t, 0.6);
      this.rear = 0.7 * k;
      this.palps = 0.8 * k;
      this.dance = 0.5 * k;
      this.lights = (i, s) => 0.5 + 0.5 * Math.sin(s * 3 - i);
    }
  }

  // ---------- Posing ----------

  protected idle(t: number) {
    const p = this.puppet;
    this.up = 0;
    this.crouch = 0;
    this.rear = 0;
    this.tilt = 0;
    this.wag = 0;
    this.palps = 0;
    this.dance = 0;
    this.flip = 0;
    this.flash = 0;
    this.eyesOn = 1;
    this.curl = 0;
    this.freeze = 0;
    this.lights = null;
    this.actSpeed = 0.9;
    this.expression = this.hovered ? 'happy' : 'neutral';
    p.add('body', 1.2 * sin(t, 0.3));
    p.add('abdomen', 3 * sin(t, 0.28, 0.2));
    // Palps twiddling, now and then a front leg lifted and put down.
    this.palp((side, k) => [
      (k === 1 ? 6 : 10) * sin(t, 0.6, side * 0.2),
      side * 6 * sin(t, 0.4, side * 0.3),
      0,
    ]);
    this.legs8((side, k) => [
      2 * sin(t, 0.17, k * 0.21 + side * 0.1),
      k === 0 ? 14 * Math.max(0, sin(t, 0.09, side * 0.4)) ** 6 : 0,
      0,
    ]);
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    this.env = env;
    this.spec.speed = this.actSpeed;
    this.enjoy(dt, this.still() && !this.hopping);
    if (this.hopping) this.hopT += dt;
    else if (this.hopT >= 0) {
      // Landed: a settle.
      this.hopT = -1;
      p.kick('body', -200);
      this.crouchS.kick(-3);
    }
    const air = this.hoverUp(dt);
    const crouch = this.crouchS.update(
      dt,
      this.hopping ? Math.max(0, 0.5 - this.hopT * 2) : this.crouch,
    );
    const rear = this.rearS.update(dt, this.rear);
    const tilt = this.tiltS.update(dt, this.tilt);
    this.wagS.update(dt, this.wag);
    const H = this.heightPx;
    const dance = this.dance;
    const curl = this.curl;
    const aloft = this.hopping || air > 0.2;
    // Walking: a tetrapod scuttle; in the air the legs fold up under her.
    const moving = Math.min(1, this.stride / (H * 1.2));
    if (aloft) {
      this.legs8((side, k) => [(k - 1.5) * 6, 38, -side * 20]);
    } else if (moving > 0.02) {
      this.legs8((side, k) => {
        const ph = this.gait * 8 + ((k + (side > 0 ? 0 : 1)) % 2) * Math.PI;
        return [
          14 * moving * Math.sin(ph),
          22 * moving * Math.max(0, Math.cos(ph)),
          -side * 10 * moving * Math.max(0, Math.cos(ph)),
        ];
      });
      p.add('body', 0, 0, 2 * Math.sin(this.gait * 8) * moving);
    } else {
      // Standing: crouched, reared up, in the dance, or curled up.
      this.legs8((side, k) => {
        const front = k === 0 ? 1 : 0;
        const second = k === 1 ? 1 : 0;
        const wave = Math.sin(env.time * 7 + (side > 0 ? 0 : Math.PI));
        return [
          front * (30 * rear + 24 * dance * (0.5 + 0.5 * wave)) - 8 * curl * (k - 1.5),
          front * (46 * rear + 30 * dance * Math.max(0, wave)) +
            second * (10 * rear) +
            24 * crouch * (k === 0 ? 0.4 : 1) +
            40 * curl,
          -side * (22 * crouch + 20 * curl),
        ];
      });
    }
    // Palps: held out front; punching or waving when asked.
    const pal = this.palps;
    if (pal > 0.01) {
      const t = env.time;
      this.palp((side, k) => [
        (k === 1 ? -30 : -40) * pal + 14 * pal * Math.sin(t * 11 + (side > 0 ? 0 : Math.PI)),
        side * 14 * pal,
        0,
      ]);
    }
    // Body: sunk in a crouch, tipped back when reared up, tilted over to look.
    p.shift('body', 0, 0, -0.045 * clamp(crouch, -0.3, 1) - 0.01 * curl);
    p.add('body', -22 * rear - 8 * dance - 10 * crouch);
    p.add('root', 0, 0, -26 * tilt);
    this.tone(dt, env, null);
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    const t = env.time;
    const wag = this.wagS.y;
    if (Math.abs(wag) > 0.01) p.turn('abdomen', 0, 0, 24 * wag * Math.sin(t * TAU * 3.5));
    // The backflip: right round about the middle on the way across.
    if (this.hopping && this.hopFlip) {
      const u = clamp(this.hopT / 0.9, 0, 1);
      this.pivot.rotation.x = TAU * ease(u, 0.1, 0.92);
    } else this.pivot.rotation.x = 0;
    this.light(t);
  }

  /** The palp tips (Dot0, Dot1), the abdomen spots (Dot2) and the brow eyes (Dot3). */
  private light(t: number) {
    const asleep = this.expression === 'asleep';
    const colour = this.lookName === 'colour';
    const tint = ['#7dff9a', '#ff6ad5', '#ffd24a', '#8ad8ff'];
    for (let i = 0; i < 4; i++) {
      let level: number;
      if (this.act === 'dizzy') level = Math.random() < 0.5 ? 1 : 0.2;
      else if (this.lights) level = this.lights(i, t);
      else if (i === 3) level = this.eyesOn * (0.55 + 0.45 * Math.sin(t * 1.6));
      else level = 0.45 + 0.35 * Math.sin(t * 1.3 - i * 1.1);
      level = Math.max(level, this.flash * (0.5 + 0.5 * Math.sin(t * 18 - i)));
      if (this.hovered && this.act === 'idle') level = 0.5 + 0.5 * Math.sin(t * 3.4 - i);
      if (i === 3 && this.eyesOn === 0) level = 0.05;
      this.outfit.dot(i, clamp(asleep ? level * 0.5 : level, 0, 1), colour ? tint[i] : undefined);
    }
  }
}
