import type { Object3D } from 'three';
import { BEACON } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { Bird, ease, type Reaction, span } from './birds';
import { Hen } from './hen';
import { sin } from './moves';
import { Spring } from './spring';

/**
 * Tango, the robot rooster: tall and proud on long yellow legs, chest out. A big red comb of
 * five domes with the beacon behind it, two wattles, a ring of gold hackle plates round the base
 * of the neck, a breast lamp (Dot0), a light on each folded wing (Dot1) and, his signature, a
 * fan of seven tall plates arching over him, each a light (Dot2..Dot8), that a run of light
 * sweeps across when he crows.
 *
 * He struts with his head pumping, chest out; scratches the floor and calls the hen over (if
 * Biddy is on the floor she comes, and the two of them peck at what he found); surveys the
 * floor with his head high; flaps his wings and puffs up; and crows: up on his toes, head back,
 * beak wide, the tail lights running. When the crew's look changes from paper to ink (dawn, in
 * the auto look) he crows the sun up, twice, with the whole tail lit in sunrise colours.
 */
export const ROOSTER_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.28, 0.5],
    [0.72, 0.5],
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
const FEATHERS = 7;
/** The sunrise, plate by plate, left to right (the colour look). */
const SUNRISE = ['#ff5a3d', '#ff7a3d', '#ff9a45', '#ffbd4d', '#ffd866', '#ffe98a', '#fff3b8'];
/** The legs are this fraction of his height: how far a crow lifts him per unit of stretch. */
const LEG = 0.2 / 0.86;

export class Rooster extends Bird {
  static readonly terms =
    'cockerel cock chicken red comb wattles gold golden orange tail fan feathers teal mint proud strut crow tall yellow legs dawn';

  private openS = new Spring(6, 0.45, 1.2);
  private puffS = new Spring(3, 0.6);
  private turn = new Spring(1.6, 0.8);
  private liftS = new Spring(5, 0.6);
  // Per-frame requests from acts, cleared in idle().
  private jaw = 0;
  private wings = 0;
  private flap = 0;
  private lift = 0;
  private puff = 0;
  private glow = 0;
  private cluck = 0;
  private toes = 0;
  private sweep = 0;
  private dawnLit = 0;
  private strutting = 0;
  private actSpeed = 1;
  private dir = 1;
  private sweepPhase = 0;
  private seenLook = this.lookName;
  /** The hen has been called this act. */
  private called = false;

  constructor(model: Object3D) {
    super(
      {
        name: 'Tango',
        model: 'rooster',
        metres: 0.86,
        width: 0.55,
        size: 1.35,
        feels: {
          default: { f: 4.5, zeta: 0.6 },
          root: { f: 4.5, zeta: 0.5 },
          body: { f: 4, zeta: 0.45 },
          head: { f: 6, zeta: 0.45, r: 0.5 },
          jaw: { f: 12, zeta: 0.45 },
          tail: { f: 3.6, zeta: 0.32 },
          'wing.L': { f: 5, zeta: 0.45 },
          'wing.R': { f: 5, zeta: 0.45 },
          'leg.L': { f: 9, zeta: 0.6 },
          'leg.R': { f: 9, zeta: 0.6 },
        },
        face: ROOSTER_FACE,
        eyes: 0.9,
        gaze: [
          { bone: 'head', yaw: 0.85, pitch: 0.85 },
          { bone: 'body', yaw: 0.12, pitch: 0 },
        ],
        reach: { yaw: 60, pitch: 30 },
        lag: 0.9,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [50, 110],
        speed: 0.8,
        turn: 70,
        roam: true,
      },
      model,
    );
    this.acts = {
      ...this.moves(),
      ...this.calls(),
      ...this.floorTricks(),
      ...this.reactions(),
    };
  }

  // ---------- Getting about ----------

  private moves(): Record<string, Act> {
    return {
      idle: { weight: 3, length: [3, 6] },
      stroll: {
        weight: 1.4,
        length: [4, 6],
        when: this.still,
        start: () => this.amble(1.2 + Math.random() * 2),
      },
      // A strut: slow, proud steps, chest out, the head pumping with each, the tail high.
      strut: {
        weight: 2.2,
        length: [5, 7],
        face: 'happy',
        when: this.still,
        start: () => this.amble(2 + Math.random() * 2),
        pose: (t) => {
          this.strutting = this.fade(t, 0.5);
          this.actSpeed = 0.55;
          this.glow = 0.4 * this.strutting;
          this.sweep = 0.25 * this.strutting;
        },
      },
      // Looks the floor over with his head high, turning it slowly one way, then the other.
      survey: {
        weight: 1.4,
        length: [4, 5.5],
        when: this.still,
        pose: (t) => {
          const k = this.fade(t, 0.5);
          this.puppet.add('head', -9 * k, 34 * k * sin(t, 0.28), 6 * k * sin(t, 0.28, 0.25));
          this.puppet.add('body', -6 * k);
          this.puppet.add('tail', -4 * k);
          this.sweep = 0.2 * k;
          this.expression = 'determined';
        },
      },
      // Flaps his wings and puffs up: a big show of himself.
      flapPuff: {
        weight: 1.5,
        length: [3.6, 4.4],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          const k = this.fade(t, 0.35);
          const beat = Math.max(0, Math.sin(2 * Math.PI * 3 * t - 0.6)) ** 1.2;
          this.wings = (0.55 + 0.45 * beat) * k;
          this.flap = k * (beat > 0.2 ? 1 : 0.2);
          this.puff = k;
          this.toes = 0.5 * k;
          this.puppet.add('head', -14 * k);
          this.puppet.add('body', -10 * k);
          this.puppet.add('tail', -10 * k);
          this.jaw = 10 * ease(t, 1.4, 1.6) * (1 - ease(t, 2.4, 2.6)) * Math.max(0, sin(t, 6));
          this.glow = k;
          this.sweep = 0.7 * k;
          this.cluck = 0.6 * k;
        },
      },
    };
  }

  // ---------- Crowing ----------

  /** One crow, `t` seconds in over `len`: up on his toes, head back, beak wide, three calls. */
  private crow(t: number, len: number, power = 1) {
    const k = span(t, 0.1, 0.75, len - 0.9, len - 0.15);
    const calls = span(t, 0.8, 1.0, len - 1.1, len - 0.9);
    const call = Math.max(0, Math.sin(2 * Math.PI * 1.7 * (t - 0.8))) ** 0.7 * calls;
    this.toes = k;
    this.jaw = 32 * call;
    this.wings = 0.3 * k * power;
    this.flap = 0.12 * k * call;
    this.puff = 0.35 * k;
    this.glow = k;
    this.cluck = k * (0.4 + 0.6 * call);
    this.sweep = k * power;
    this.puppet.add('head', -(50 + 6 * call) * k, 0, 0);
    this.puppet.add('body', -14 * k);
    this.puppet.add('tail', -8 * k + 3 * call);
    this.expression = 'happy';
  }

  private calls(): Record<string, Act> {
    return {
      crow: {
        weight: 2.2,
        length: [4.6, 4.6],
        when: this.still,
        pose: (t) => this.crow(t, 4.6),
      },
      // Crows the sun up: two long crows, the second louder, the whole tail lit.
      dawn: {
        weight: 0,
        length: [9.4, 9.4],
        when: this.still,
        pose: (t) => {
          const first = t < 4.3;
          this.crow(first ? t : t - 4.4, first ? 4.3 : 5, first ? 1 : 1.3);
          this.dawnLit = this.fade(t, 0.8);
          if (!first) this.puppet.add('body', -4 * Math.min(1, t - 4.4));
        },
      },
    };
  }

  // ---------- Pecking and scratching ----------

  private floorTricks(): Record<string, Act> {
    return {
      peck: {
        weight: 2,
        length: [4, 6],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          const k = this.fade(t, 0.4);
          const run = Math.max(0, Math.sin(2 * Math.PI * 0.35 * t + 0.4)) > 0.2 ? 1 : 0;
          const hit = Math.max(0, Math.sin(2 * Math.PI * 2.8 * t)) ** 2 * run;
          this.puppet.add('head', 56 * hit * k + 12 * k * run);
          this.puppet.add('body', 20 * hit * k + 6 * k * run);
          this.puppet.add('tail', -12 * hit * k);
          this.jaw = 12 * Math.max(0, Math.sin(2 * Math.PI * 2.8 * t - 1.2)) * run * k;
        },
      },
      // Scratches the floor, back, back, back, and calls the hen over to what he found.
      scratchCall: {
        weight: 2,
        length: [10, 10],
        face: 'determined',
        when: this.still,
        start: () => {
          this.dir = Math.random() < 0.5 ? -1 : 1;
          this.called = false;
        },
        pose: (t) => this.scratchCall(t),
      },
    };
  }

  private scratchCall(t: number) {
    const p = this.puppet;
    const k = this.fade(t, 0.5);
    const leg = this.dir > 0 ? 'leg.L' : 'leg.R';
    const stand = this.dir > 0 ? 'leg.R' : 'leg.L';
    // Three rakes: a quick lift forward and a long drag back.
    const go = span(t, 0.5, 0.8, 3.3, 3.6);
    const rake = ((t - 0.7) / 0.9) % 1;
    const swing =
      go *
      (rake < 0.35
        ? -36 * Math.sin((Math.PI * rake) / 0.35)
        : 48 * ease(rake, 0.35, 0.9) * (1 - ease(rake, 0.9, 1)));
    p.add(leg, swing);
    p.add(stand, -8 * go);
    p.add('body', 8 * go * (rake < 0.35 ? 0 : 1));
    p.add('head', -4 * go + 4);
    // Then the call: head up, beak open and shut, quick little clucks, again and again.
    const call = span(t, 3.9, 4.2, 6.2, 6.5);
    const cluck = Math.max(0, Math.sin(2 * Math.PI * 4 * (t - 3.9))) * call;
    p.add('head', -22 * call + 4 * cluck, 0, 0);
    p.add('body', -8 * call);
    p.add('tail', -6 * call);
    this.jaw = 18 * cluck;
    this.cluck = call;
    this.glow = Math.max(this.glow, call * 0.7);
    this.sweep = Math.max(this.sweep, 0.45 * call);
    if (t > 4 && !this.called) {
      this.called = true;
      this.callHen();
    }
    // He shows her what he found: a bend to the floor as she arrives, a peck or two.
    const show =
      span(t, 6.6, 7, 9.2, 9.6) *
      (Math.max(0, Math.sin(2 * Math.PI * 2.4 * (t - 6.6))) ** 2 * 0.8 + 0.2);
    p.add('head', 54 * show);
    p.add('body', 22 * show);
    p.add('tail', -10 * show);
    this.jaw = Math.max(this.jaw, 12 * show);
    if (show > 0.5 && t > 7.2 && this.called) this.henPecks();
    void k;
  }

  /** Biddy, if she is on the floor: she comes over, wherever she was. */
  private hen() {
    return this.mates().find((o): o is Hen => o instanceof Hen && o.state === 'here' && !o.role);
  }

  private callHen() {
    const hen = this.hen();
    if (!hen) return;
    hen.perform('waddle');
    hen.walkTo(this.s + this.dir * this.heightPx * 0.62, this.depth);
  }

  private henPecks() {
    const hen = this.hen();
    if (!hen || hen.act === 'peck') return;
    if (Math.abs(hen.s - this.s) < this.heightPx * 1.1) hen.perform('peck');
  }

  protected react(kind: Reaction, t: number) {
    const p = this.puppet;
    if (kind === 'poked') {
      // A startled squawk: up with the wings, a short sharp crow.
      const k = span(t, 0, 0.1, 1, 1.6);
      this.jaw = 30 * span(t, 0.05, 0.15, 0.8, 1.1);
      this.wings = 0.8 * span(t, 0, 0.12, 0.9, 1.4);
      this.flap = k;
      this.lift = this.heightPx * 0.2 * (t < 0.5 ? Math.sin((Math.PI * t) / 0.5) : 0);
      this.glow = k;
      this.cluck = k;
      this.sweep = k;
      p.add('head', -22 * span(t, 0.05, 0.2, 0.5, 0.9));
      p.add('tail', 14 * k);
    } else if (kind === 'dizzy') {
      const k = 1 - ease(t, 2.4, 3.4);
      p.add('head', 10 * k * Math.cos(t * 5), 18 * k * Math.sin(t * 3), 26 * k * Math.sin(t * 5));
      p.add('body', 0, 0, 10 * k * Math.sin(t * 5));
      p.add('root', 0, 0, 7 * k * Math.sin(t * 5));
      this.wings = 0.25 * k;
      this.glow = k;
      this.sweep = k;
    } else {
      // Pleased: chest out, head high, a little cluck.
      const k = this.fade(t, 0.6);
      p.add('head', -12 * k + 6 * k * Math.sin(t * 6), 0, 6 * k * sin(t, 1.2));
      p.add('body', -9 * k);
      p.add('tail', 0, 0, 8 * k * sin(t, 2));
      this.puff = 0.6 * k;
      this.glow = k;
      this.sweep = 0.4 * k;
      this.jaw = 12 * Math.max(0, Math.sin(t * 9)) * k;
    }
  }

  // ---------- Posing ----------

  protected idle(t: number) {
    const p = this.puppet;
    this.jaw = 0;
    this.wings = 0;
    this.flap = 0;
    this.lift = 0;
    this.puff = 0;
    this.glow = 0;
    this.cluck = 0;
    this.toes = 0;
    this.sweep = 0;
    this.dawnLit = 0;
    this.strutting = 0;
    this.actSpeed = 0.8;
    this.expression = this.hovered ? 'happy' : 'neutral';
    // Proud and a little stiff: the head held high, with a jerk now and then.
    const n = Math.floor(t / 2.7);
    const jerk =
      Math.abs(Math.sin(n * 61.7)) > 0.45 && t % 2.7 < 0.6 ? Math.sign(Math.sin(n * 5.1)) : 0;
    p.add('head', -4 + 2 * sin(t, 0.4), 22 * jerk * Math.min(1, (t % 2.7) * 8), 5 * jerk);
    p.add('body', -3 + 1.2 * sin(t, 0.3));
    p.add('tail', -2 + 2.5 * sin(t, 0.5));
    p.add('wing.L', 0, 0, 1.2 * sin(t, 0.21));
    p.add('wing.R', 0, 0, 1.2 * sin(t, 0.21, 0.4));
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    this.env = env;
    this.spec.speed = this.actSpeed;
    this.enjoy(dt, this.still());
    const H = this.heightPx;

    // Dawn: the look turns from paper to ink and he crows.
    const look = this.lookName;
    if (look !== this.seenLook) {
      if (this.seenLook === 'paper' && look === 'ink' && this.state === 'here' && !this.role)
        this.setAct('dawn');
      this.seenLook = look;
    }

    // Walking: the feet take turns, the body rolls and the head pumps forward and back.
    const moving = clamp(this.stride / (H * 0.45), 0, 1);
    if (moving > 0.05) {
      const ph = this.gait;
      const sw = Math.sin(ph) * moving;
      p.add('leg.L', 30 * sw);
      p.add('leg.R', -30 * sw);
      p.add('body', -2 * this.strutting, 0, 4 * sw);
      p.add('head', (7 + 14 * this.strutting) * Math.cos(ph * 2) * moving, 0, -3 * sw);
      p.add('tail', 0, 0, -5 * sw);
      this.lift += H * 0.02 * Math.abs(Math.cos(ph)) * moving;
    }

    // Up on his toes: the legs lengthen and lift him, so his feet stay on the floor.
    const toes = this.liftS.update(dt, this.toes);
    if (Math.abs(toes) > 0.005) {
      const grow = 0.16 * toes;
      p.stretch('leg.L', 1 + grow, [0, 1, 0], 1);
      p.stretch('leg.R', 1 + grow, [0, 1, 0], 1);
      this.lift += H * LEG * grow;
    }
    this.h = this.lift;

    p.add('jaw', this.jaw);
    const open = this.openS.update(dt, this.wings);
    const beat = Math.sin(env.time * 30) * this.flap;
    for (const [sfx, side] of SIDES)
      p.add(`wing.${sfx}`, -6 * open, 0, side * (60 * open + 18 * beat));

    // Puffed up: the body swells, chest first.
    const puff = this.puffS.update(dt, this.puff);
    if (puff > 0.01) p.stretch('body', 1 + 0.1 * puff, [0, 0, 1], 1 + 0.08 * puff);

    // Standing, he turns three-quarters on toward the middle so his profile shows.
    const middle = (env.frame.left + env.frame.right) / 2;
    const turn = this.turn.update(dt, this.walking ? 0 : Math.sign(middle - this.s) * 48);
    p.add('root', 0, turn);
    p.add('head', 0, -turn * 0.6);

    // The tail's run of light: its phase only moves with time, so frames don't change it.
    this.sweepPhase += dt * (0.5 + 2.2 * Math.min(1, this.sweep));
  }

  protected after(_dt: number, env: Env) {
    this.lights(env.time);
  }

  /** The breast lamp shows his mood, the wing tips flash, and the tail's plates glow in a run. */
  private lights(t: number) {
    const o = this.outfit;
    if (!o) return;
    const tone = this.expression === 'neutral' ? BEACON.happy : BEACON[this.expression];
    o.dot(
      0,
      clamp(0.4 + 0.6 * this.glow + 0.3 * this.cluck + (this.hovered ? 0.3 : 0), 0, 1),
      tone,
    );
    let tip = 0.25 + 0.4 * Math.max(0, Math.sin(t * 1.1)) ** 6;
    if (this.flap > 0.05) tip = 0.3 + 0.7 * Math.max(0, Math.sin(t * 14));
    if (this.act === 'dizzy') tip = Math.random() < 0.5 ? 1 : 0.2;
    o.dot(1, clamp(tip, 0, 1));
    const colour = this.lookName === 'colour';
    const run = Math.min(1, this.sweep);
    for (let i = 0; i < FEATHERS; i++) {
      // A bump of light travelling along the plates, left to right, again and again.
      const w = Math.max(0, Math.cos((this.sweepPhase * 2 - i / FEATHERS) * Math.PI * 1.1)) ** 2;
      const idle = 0.2 + 0.18 * Math.max(0, Math.sin(t * 0.9 - i * 0.55)) ** 2;
      const level = idle + (0.95 - idle) * run * w + 0.45 * this.dawnLit;
      o.dot(2 + i, clamp(level, 0, 1), colour && this.dawnLit > 0.05 ? SUNRISE[i] : undefined);
    }
    o.beacon(tone ?? '#ffcf5a');
  }
}
