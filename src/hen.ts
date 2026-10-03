import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { Bird, ease, type Reaction, span } from './birds';
import { sin } from './moves';
import { Spring } from './spring';

/**
 * Biddy, the robot hen: plump, round and comfortable. A golden egg-shaped body with a breast
 * lamp, a face plate round the screen, a short bill on its own jaw, a comb of three red
 * domes with the beacon behind it, a red wattle, folded wings with a light on each tip, an
 * upright fan of dark tail plates and short thick yellow legs. A small egg rides behind her,
 * scaled to nothing unless she has just laid it.
 *
 * She waddles, head bobbing. Stopped, she pecks the floor in runs, scratches it with one foot
 * (back, back, back, then a peck at what turned up), bursts into a startled flap-run with her
 * wings out, settles down on the floor fluffed up as if on a nest (and now and then, as a
 * joke, shuffles up and an egg is there), and clucks.
 *
 * A poke makes her squawk and flap; three make her dizzy; the mouse resting on her makes her
 * fluff and cluck happily.
 */
export const HEN_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.27, 0.5],
    [0.73, 0.5],
  ],
  rx: 0.085,
  ry: 0.21,
  line: 0.038,
  mouth: null,
};

const SIDES = [
  ['L', 1],
  ['R', -1],
] as const;
/** How far she sinks onto the floor when nesting, in metres (the model's). */
const SINK = 0.11;

export class Hen extends Bird {
  private eggS = new Spring(5, 0.5, 1.4);
  private openS = new Spring(6, 0.45, 1.2);
  private puffS = new Spring(3, 0.6);
  private sinkS = new Spring(2.5, 0.75);
  private turn = new Spring(1.6, 0.8);
  // Per-frame requests from acts, cleared in idle().
  private jaw = 0;
  private wings = 0;
  private flap = 0;
  private lift = 0;
  private puff = 0;
  private sink = 0;
  private egg = 0;
  private glow = 0;
  private dance = 0;
  private cluck = 0;
  private actSpeed = 1.0;
  private dir = 1;
  /** A rare joke: one nest in five ends with a tiny egg behind her. */
  private eggRoll = false;

  constructor(model: Object3D) {
    super(
      {
        name: 'Biddy',
        model: 'hen',
        metres: 0.48,
        width: 0.4,
        size: 0.85,
        feels: {
          default: { f: 4.5, zeta: 0.6 },
          root: { f: 4.5, zeta: 0.5 },
          body: { f: 4, zeta: 0.45 },
          head: { f: 6, zeta: 0.45, r: 0.5 },
          jaw: { f: 12, zeta: 0.45 },
          tail: { f: 4, zeta: 0.35 },
          'wing.L': { f: 5, zeta: 0.45 },
          'wing.R': { f: 5, zeta: 0.45 },
          'leg.L': { f: 9, zeta: 0.6 },
          'leg.R': { f: 9, zeta: 0.6 },
        },
        face: HEN_FACE,
        eyes: 0.9,
        gaze: [
          { bone: 'head', yaw: 0.85, pitch: 0.85 },
          { bone: 'body', yaw: 0.12, pitch: 0 },
        ],
        reach: { yaw: 60, pitch: 30 },
        lag: 1.0,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [50, 110],
        speed: 0.9,
        turn: 70,
        roam: true,
      },
      model,
    );
    this.acts = {
      ...this.moves(),
      ...this.floorTricks(),
      ...this.rests(),
      ...this.reactions(),
    };
  }

  // ---------- Getting about ----------

  private moves(): Record<string, Act> {
    return {
      idle: { weight: 3, length: [3, 6] },
      waddle: {
        weight: 2,
        length: [4, 6],
        when: this.still,
        start: () => this.amble(1.2 + Math.random() * 2),
      },
      flapRun: {
        weight: 1.1,
        length: [3.5, 4.5],
        face: 'surprised',
        when: this.still,
        start: () => {
          // Something startles her: a short dash with wings out.
          this.actSpeed = 2.6;
          this.amble(3 + Math.random() * 2);
        },
        pose: (t) => {
          const k = ease(t, 0, 0.25) * (this.walking ? 1 : 1 - ease(t, 2.4, 3.2));
          this.wings = 0.75 * k;
          this.flap = k;
          this.jaw = 14 * Math.max(0, Math.sin(t * 14)) * k;
          this.cluck = k;
          this.puppet.add('head', -10 * k);
          this.puppet.add('tail', 12 * k);
          this.expression = 'surprised';
        },
      },
    };
  }

  // ---------- Pecking and scratching ----------

  private floorTricks(): Record<string, Act> {
    return {
      peck: {
        weight: 3,
        length: [4, 6],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // Runs of pecks: head hammering down at the floor, body rocking with each.
          const k = this.fade(t, 0.4);
          const run = Math.max(0, Math.sin(2 * Math.PI * 0.35 * t + 0.4)) > 0.2 ? 1 : 0;
          const hit = Math.max(0, Math.sin(2 * Math.PI * 2.8 * t)) ** 2 * run;
          this.puppet.add('head', 52 * hit * k + 12 * k * run);
          this.puppet.add('body', 18 * hit * k + 6 * k * run);
          this.puppet.add('tail', -14 * hit * k);
          this.jaw = 12 * Math.max(0, Math.sin(2 * Math.PI * 2.8 * t - 1.2)) * run * k;
        },
      },
      scratch: {
        weight: 2.2,
        length: [6, 7.5],
        face: 'determined',
        when: this.still,
        start: () => (this.dir = Math.random() < 0.5 ? -1 : 1),
        pose: (t) => this.scratch(t),
      },
    };
  }

  /** Scratches the floor with one foot: back, back, back, then bends to peck at the find. */
  private scratch(t: number) {
    const p = this.puppet;
    const k = this.fade(t, 0.5);
    const leg = this.dir > 0 ? 'leg.L' : 'leg.R';
    const stand = this.dir > 0 ? 'leg.R' : 'leg.L';
    // Three rakes, each a quick lift forward then a long drag back; then the peck.
    const go = span(t, 0.5, 0.8, 3.5, 3.8);
    const rake = ((t - 0.7) / 0.9) % 1;
    const swing =
      go *
      (rake < 0.35
        ? -38 * Math.sin((Math.PI * rake) / 0.35)
        : 48 * ease(rake, 0.35, 0.9) * (1 - ease(rake, 0.9, 1)));
    const peck =
      span(t, 4, 4.4, 5.6, 6) *
      (Math.max(0, Math.sin(2 * Math.PI * 2.6 * (t - 4))) ** 2 * 0.8 + 0.2);
    this.puppet.add(leg, swing + 0);
    this.puppet.add(stand, -8 * go);
    p.add('body', 8 * go * (rake < 0.35 ? 0 : 1) + 22 * peck);
    p.add('head', -6 * go + 50 * peck);
    p.add('tail', 10 * go - 10 * peck);
    this.jaw = 14 * peck;
    this.puff = 0.2 * k;
  }

  // ---------- Resting ----------

  private rests(): Record<string, Act> {
    return {
      nest: {
        weight: 1.8,
        length: [14, 20],
        when: this.still,
        start: () => {
          this.dir = Math.random() < 0.5 ? -1 : 1;
          this.eggRoll = Math.random() < 0.2;
        },
        pose: (t) => {
          // Shuffles down onto the floor, fluffs up, and nods off as if on a nest. Sometimes,
          // near the end, she shuffles up and there's an egg.
          const down = span(t, 0.5, 2.8, this.actLength - 3.4, this.actLength - 1.6);
          this.sink = down;
          this.puff = down * (0.8 + 0.2 * Math.sin(t * 1.4));
          const shuffle = Math.max(0, sin(t, 3.2)) * span(t, 2.8, 3.4, 4.6, 5.2);
          this.puppet.add('body', 0, 0, 5 * shuffle * Math.sin(t * 22));
          this.puppet.add('tail', 0, 0, 7 * shuffle * Math.sin(t * 22 + 1));
          this.puppet.add('head', 8 * down, 0, 3 * down * sin(t, 0.25));
          this.puppet.add('wing.L', 0, 0, 4 * down);
          this.puppet.add('wing.R', 0, 0, -4 * down);
          this.expression =
            down > 0.5 ? (t > 6 && t < this.actLength - 4 ? 'asleep' : 'sleepy') : 'neutral';
          this.egg = this.eggRoll
            ? span(
                t,
                this.actLength - 4.4,
                this.actLength - 3.8,
                this.actLength - 1.2,
                this.actLength - 0.6,
              )
            : 0;
          if (this.egg > 0.5) this.expression = 'happy';
        },
      },
    };
  }

  protected react(kind: Reaction, t: number) {
    const p = this.puppet;
    if (kind === 'poked') {
      // BAWK: jumps, wings flapping, beak wide, comb-red face lights flashing.
      const k = span(t, 0, 0.1, 1, 1.6);
      this.jaw = 30 * span(t, 0.05, 0.15, 0.8, 1.1);
      this.wings = 0.8 * span(t, 0, 0.12, 0.9, 1.4);
      this.flap = k;
      this.lift = this.heightPx * 0.25 * (t < 0.5 ? Math.sin((Math.PI * t) / 0.5) : 0);
      this.glow = k;
      this.cluck = k;
      p.add('head', -14 * span(t, 0.05, 0.2, 0.5, 0.9));
      p.add('tail', 16 * k);
    } else if (kind === 'dizzy') {
      const k = 1 - ease(t, 2.4, 3.4);
      p.add('head', 10 * k * Math.cos(t * 5), 18 * k * Math.sin(t * 3), 26 * k * Math.sin(t * 5));
      p.add('body', 0, 0, 10 * k * Math.sin(t * 5));
      p.add('root', 0, 0, 7 * k * Math.sin(t * 5));
      this.wings = 0.25 * k;
      this.glow = k;
      this.dance = k;
    } else {
      const k = this.fade(t, 0.6);
      p.add('head', 10 * k * Math.sin(t * 7), 0, 6 * k * sin(t, 1.2));
      p.add('body', -3 * k);
      p.add('tail', 0, 0, 10 * k * sin(t, 2.4));
      this.puff = 0.7 * k;
      this.glow = k;
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
    this.sink = 0;
    this.egg = 0;
    this.glow = 0;
    this.dance = 0;
    this.cluck = 0;
    this.actSpeed = 0.9;
    this.expression = this.hovered ? 'happy' : 'neutral';
    // Fidgety: little head jerks and a settling of the feathers.
    const n = Math.floor(t / 2.3);
    const jerk =
      Math.abs(Math.sin(n * 61.7)) > 0.45 && t % 2.3 < 0.6 ? Math.sign(Math.sin(n * 5.1)) : 0;
    p.add('head', 2 * sin(t, 0.4), 18 * jerk * Math.min(1, (t % 2.3) * 8), 6 * jerk);
    p.add('body', 1.2 * sin(t, 0.3));
    p.add('tail', 2.5 * sin(t, 0.5));
    p.add('wing.L', 0, 0, 1.2 * sin(t, 0.21));
    p.add('wing.R', 0, 0, 1.2 * sin(t, 0.21, 0.4));
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    this.env = env;
    this.spec.speed = this.actSpeed;
    this.enjoy(dt, this.still());
    const H = this.heightPx;

    // Waddling: the feet take turns, the body rolls and the head bobs forward and back.
    const moving = clamp(this.stride / (H * 0.45), 0, 1);
    if (moving > 0.05) {
      const ph = this.gait;
      const sw = Math.sin(ph) * moving;
      p.add('leg.L', 32 * sw);
      p.add('leg.R', -32 * sw);
      p.add('body', 0, 0, 5 * sw);
      p.add('head', 7 * Math.cos(ph * 2) * moving, 0, -3 * sw);
      p.add('tail', 0, 0, -6 * sw);
      this.lift += H * 0.02 * Math.abs(Math.cos(ph)) * moving;
    }
    this.h = this.lift;

    p.add('jaw', this.jaw);
    // Wings out, flapping when asked.
    const open = this.openS.update(dt, this.wings);
    const beat = Math.sin(env.time * 30) * this.flap;
    for (const [sfx, side] of SIDES)
      p.add(`wing.${sfx}`, -6 * open, 0, side * (60 * open + 18 * beat));

    // Fluffed up: the body swells.
    const puff = this.puffS.update(dt, this.puff);
    if (puff > 0.01) p.stretch('body', 1 + 0.1 * puff, [0, 0, 1], 1 + 0.08 * puff);

    // Nesting: she sinks until the legs are hidden in her.
    const sink = this.sinkS.update(dt, this.sink);
    if (sink > 0.005) {
      p.shift('body', 0, -SINK * sink, 0);
      p.add('leg.L', 55 * sink);
      p.add('leg.R', 55 * sink);
      p.add('tail', -8 * sink);
    }

    // Standing, she turns three-quarters on toward the middle so her profile shows.
    const middle = (env.frame.left + env.frame.right) / 2;
    const turn = this.turn.update(dt, this.walking ? 0 : Math.sign(middle - this.s) * 48);
    p.add('root', 0, turn);
    p.add('head', 0, -turn * 0.6);
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    const s = Math.max(0.001, this.eggS.update(dt, this.egg));
    p.stretch('egg', s, [0, 1, 0], s);
    this.lights(env.time);
  }

  /** The breast lamp shows her mood; the wing tips flash when she is startled. */
  private lights(t: number) {
    const tone = this.expression === 'neutral' ? BEACON.happy : BEACON[this.expression];
    const asleep = this.sinkS.y;
    this.outfit.dot(
      0,
      clamp(
        0.4 + 0.6 * this.glow + 0.3 * this.cluck - 0.3 * asleep + (this.hovered ? 0.3 : 0),
        0,
        1,
      ),
      tone,
    );
    let tip = 0.25 + 0.4 * Math.max(0, Math.sin(t * 1.1)) ** 6;
    let colour: string | undefined;
    if (this.flap > 0.05 || this.dance > 0.05) {
      tip = 0.3 + 0.7 * Math.max(0, Math.sin(t * 14));
      colour = RAINBOW[Math.floor(t * 8) % RAINBOW.length];
    }
    if (this.act === 'dizzy') {
      tip = Math.random() < 0.5 ? 1 : 0.2;
      colour = RAINBOW[Math.floor(Math.random() * RAINBOW.length)];
    }
    this.outfit.dot(1, clamp(tip * (1 - 0.8 * asleep), 0, 1), colour);
    this.outfit.beacon(tone ?? '#ffcf5a');
  }
}
