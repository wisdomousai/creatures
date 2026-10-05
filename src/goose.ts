import type { Object3D } from 'three';
import { BEACON } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { Bird, ease, type Reaction, span } from './birds';
import { sin } from './moves';
import { Spring } from './spring';

/**
 * Gertie, the robot goose: a plump pale-grey barrel on short orange legs with big webbed feet, a
 * long neck of three jointed tubes (the middle hinge is a lit collar, Dot2) and an orange beak on
 * its own jaw. She honks with her neck stretched out and the collar flashing; chases a crewmate a
 * few steps with her neck low and her wings half open, then stops and preens as if nothing had
 * happened; waddles with a wiggle of the tail; stretches her neck up; and sits down and tucks her
 * head under a wing.
 */
export const GOOSE_FACE: FaceLayout = {
  width: 512,
  height: 288,
  eyes: [
    [0.27, 0.5],
    [0.73, 0.5],
  ],
  rx: 0.08,
  ry: 0.24,
  line: 0.036,
  mouth: null,
};

const SIDES = [
  ['L', 1],
  ['R', -1],
] as const;
/** How far she sinks onto the floor when sitting, in metres (the model's). */
const SINK = 0.09;

export class Goose extends Bird {
  static readonly terms =
    'gander honk white grey gray pale orange beak feet webbed long neck waddle plump preen chase wings round collar';

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
  private glow = 0;
  private collar = 0;
  private wiggle = 0;
  private actSpeed = 0.8;
  private dir = 1;
  private target: ReturnType<Goose['mates']>[number] | null = null;

  constructor(model: Object3D) {
    super(
      {
        name: 'Gertie',
        model: 'goose',
        metres: 0.6,
        width: 0.5,
        size: 1.1,
        feels: {
          default: { f: 4.5, zeta: 0.6 },
          root: { f: 4.5, zeta: 0.5 },
          body: { f: 4, zeta: 0.45 },
          'neck.1': { f: 4.2, zeta: 0.4 },
          'neck.2': { f: 5, zeta: 0.4 },
          'neck.3': { f: 6, zeta: 0.4 },
          head: { f: 6, zeta: 0.45, r: 0.5 },
          jaw: { f: 12, zeta: 0.45 },
          tail: { f: 4, zeta: 0.3 },
          'wing.L': { f: 5, zeta: 0.45 },
          'wing.R': { f: 5, zeta: 0.45 },
          'leg.L': { f: 9, zeta: 0.6 },
          'leg.R': { f: 9, zeta: 0.6 },
        },
        face: GOOSE_FACE,
        eyes: 0.9,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.8 },
          { bone: 'neck.3', yaw: 0.2, pitch: 0 },
          { bone: 'body', yaw: 0.1, pitch: 0 },
        ],
        reach: { yaw: 62, pitch: 30 },
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
    this.acts = { ...this.moves(), ...this.tricks(), ...this.rests(), ...this.reactions() };
  }

  /** The neck as one pose: `out` stretches it forward, `up` raises it, `back` folds it in. */
  private neck(out: number, up: number, back = 0) {
    const p = this.puppet;
    p.add('neck.1', 28 * out - 14 * up - 32 * back);
    p.add('neck.2', 22 * out - 6 * up - 42 * back);
    p.add('neck.3', 12 * out + 8 * up - 30 * back);
    p.add('head', -34 * out - 6 * up + 28 * back);
  }

  // ---------- Getting about ----------

  private moves(): Record<string, Act> {
    return {
      idle: { weight: 3, length: [3, 6] },
      waddle: {
        weight: 2.4,
        length: [4, 6],
        when: this.still,
        start: () => this.amble(1.2 + Math.random() * 2),
        pose: () => {
          this.wiggle = 1;
        },
      },
      // Stretches her neck right up and looks about.
      lookUp: {
        weight: 1.6,
        length: [4, 5],
        when: this.still,
        pose: (t) => {
          const k = this.fade(t, 0.6);
          this.neck(0, 1.2 * k);
          this.puppet.add('head', 0, 28 * k * sin(t, 0.3), 5 * k * sin(t, 0.3, 0.25));
          this.puppet.add('body', -4 * k);
        },
      },
      // Flaps her wings and puffs up.
      flapPuff: {
        weight: 1.1,
        length: [3.4, 4],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          const k = this.fade(t, 0.35);
          const beat = Math.max(0, Math.sin(2 * Math.PI * 3 * t - 0.6)) ** 1.2;
          this.wings = (0.55 + 0.45 * beat) * k;
          this.flap = k * (beat > 0.2 ? 1 : 0.2);
          this.puff = k;
          this.neck(0, 0.8 * k);
          this.puppet.add('body', -8 * k);
          this.glow = k;
          this.collar = 0.6 * k;
        },
      },
    };
  }

  // ---------- Honking, chasing, preening ----------

  private tricks(): Record<string, Act> {
    return {
      // A honk: the neck stretches out low and forward, the beak wide, the collar flashing, twice.
      honk: {
        weight: 2.2,
        length: [3.6, 3.6],
        face: 'surprised',
        when: this.still,
        pose: (t) => {
          const k = span(t, 0.1, 0.5, 2.9, 3.4);
          const call = Math.max(0, Math.sin(2 * Math.PI * 1.1 * (t - 0.5))) ** 0.6 * k;
          this.neck(0.7 * k + 0.3 * call, 0);
          this.jaw = 30 * call;
          this.collar = call;
          this.glow = k;
          this.wings = 0.25 * k;
          this.puppet.add('body', 6 * call);
          this.puppet.add('tail', -6 * call);
        },
      },
      // Chases a crewmate a few steps with neck low and wings half open, then stops and preens.
      chase: {
        weight: 2,
        length: [9, 9],
        face: 'determined',
        when: () => this.still() && this.mates().length > 0,
        start: () => {
          this.target = this.mates()[0] ?? null;
          this.dir = this.target ? this.toward(this.target) : 1;
          if (this.target) {
            const stop = this.target.s - this.dir * this.heightPx * 1.0;
            this.walkTo(stop, this.depth);
          }
        },
        pose: (t) => {
          const run = this.walking && t < 6 ? 1 : 0;
          this.actSpeed = run ? 2.6 : 0.8;
          const k = ease(t, 0, 0.3) * (1 - ease(t, 3.4, 4));
          this.neck(1.2 * k, 0);
          this.wings = 0.5 * k;
          this.flap = 0.25 * k * run;
          this.jaw = 14 * Math.max(0, Math.sin(t * 12)) * k * run;
          this.collar = 0.6 * k;
          this.glow = k;
          this.wiggle = run;
          // Then, as if nothing happened: a calm preen.
          const preen = span(t, 4.4, 5.2, 8.0, 8.8);
          this.expression = preen > 0.3 ? 'happy' : 'determined';
          this.preen(t - 4.4, preen);
        },
      },
      preen: {
        weight: 1.8,
        length: [5, 6],
        face: 'happy',
        when: this.still,
        pose: (t) => this.preen(t, this.fade(t, 0.6)),
      },
    };
  }

  /** Nibbles along a wing, the neck curved back round it, now one side, now the other. */
  private preen(t: number, k: number) {
    if (k < 0.01) return;
    const p = this.puppet;
    const side = Math.sin(t * 0.7) > 0 ? 1 : -1;
    const nib = 0.5 + 0.5 * Math.sin(t * 7);
    this.neck(0, 0, 0.9 * k);
    p.add('neck.1', 0, 14 * side * k, 6 * side * k);
    p.add('neck.2', 0, 26 * side * k);
    p.add('head', 10 * k * nib, 28 * side * k, 14 * side * k);
    p.add(side > 0 ? 'wing.L' : 'wing.R', -4 * k, 0, side * 14 * k);
    this.jaw = 8 * nib * k;
  }

  // ---------- Resting ----------

  private rests(): Record<string, Act> {
    return {
      // Sits down and tucks her head under a wing.
      tuck: {
        weight: 1.6,
        length: [14, 18],
        when: this.still,
        start: () => (this.dir = Math.random() < 0.5 ? -1 : 1),
        pose: (t) => {
          const down = span(t, 0.5, 2.8, this.actLength - 3.2, this.actLength - 1.4);
          this.sink = down;
          this.puff = 0.6 * down;
          const tuck = span(t, 3, 4.6, this.actLength - 3.6, this.actLength - 2);
          const side = this.dir;
          this.neck(0, 0, 1.4 * tuck);
          this.puppet.add('neck.1', 0, 12 * side * tuck, 8 * side * tuck);
          this.puppet.add('neck.2', 0, 30 * side * tuck);
          this.puppet.add('neck.3', 0, 20 * side * tuck);
          this.puppet.add('head', 18 * tuck, 40 * side * tuck, 20 * side * tuck);
          this.puppet.add(side > 0 ? 'wing.L' : 'wing.R', -6 * tuck, 0, side * 22 * tuck);
          this.puppet.add('body', 0, 0, -3 * side * tuck);
          this.expression = tuck > 0.6 ? 'asleep' : down > 0.5 ? 'sleepy' : 'neutral';
        },
      },
    };
  }

  protected react(kind: Reaction, t: number) {
    const p = this.puppet;
    if (kind === 'poked') {
      // HONK: neck shoots up and out, wings flare, beak wide.
      const k = span(t, 0, 0.1, 1, 1.6);
      this.jaw = 32 * span(t, 0.05, 0.15, 0.8, 1.1);
      this.wings = 0.8 * span(t, 0, 0.12, 0.9, 1.4);
      this.flap = k;
      this.lift = this.heightPx * 0.18 * (t < 0.5 ? Math.sin((Math.PI * t) / 0.5) : 0);
      this.glow = k;
      this.collar = k;
      this.neck(0.8 * k, 0.4 * k);
      p.add('tail', 14 * k);
    } else if (kind === 'dizzy') {
      const k = 1 - ease(t, 2.4, 3.4);
      p.add('neck.1', 0, 10 * k * Math.sin(t * 3), 14 * k * Math.sin(t * 5));
      p.add('neck.2', 0, 16 * k * Math.sin(t * 3 + 1), 18 * k * Math.sin(t * 5 + 1));
      p.add('head', 10 * k * Math.cos(t * 5), 20 * k * Math.sin(t * 3), 26 * k * Math.sin(t * 5));
      p.add('body', 0, 0, 8 * k * Math.sin(t * 5));
      p.add('root', 0, 0, 6 * k * Math.sin(t * 5));
      this.wings = 0.25 * k;
      this.glow = k;
      this.collar = k * (Math.random() < 0.5 ? 1 : 0.2);
    } else {
      // Pleased: neck up, a gentle sway, a soft honk.
      const k = this.fade(t, 0.6);
      this.neck(0, 0.7 * k);
      p.add('head', 0, 0, 8 * k * sin(t, 1.2));
      p.add('neck.2', 0, 10 * k * sin(t, 0.8));
      p.add('tail', 0, 0, 10 * k * sin(t, 2.4));
      this.puff = 0.5 * k;
      this.glow = k;
      this.collar = 0.5 * k;
      this.jaw = 8 * Math.max(0, Math.sin(t * 8)) * k;
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
    this.glow = 0;
    this.collar = 0;
    this.wiggle = 0;
    this.actSpeed = 0.8;
    this.target = null;
    this.expression = this.hovered ? 'happy' : 'neutral';
    // Upright and watchful: the neck swaying a little, the head turning now and then.
    const n = Math.floor(t / 3.1);
    const jerk =
      Math.abs(Math.sin(n * 61.7)) > 0.45 && t % 3.1 < 0.8 ? Math.sign(Math.sin(n * 5.1)) : 0;
    p.add('neck.1', 1.5 * sin(t, 0.3), 0, 0);
    p.add('neck.2', 2 * sin(t, 0.3, 0.2), 8 * jerk * Math.min(1, (t % 3.1) * 4), 0);
    p.add('head', 2 * sin(t, 0.4), 16 * jerk * Math.min(1, (t % 3.1) * 6), 4 * jerk);
    p.add('body', 1.2 * sin(t, 0.3));
    p.add('tail', 2 * sin(t, 0.5));
    p.add('wing.L', 0, 0, 1.2 * sin(t, 0.21));
    p.add('wing.R', 0, 0, 1.2 * sin(t, 0.21, 0.4));
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    this.env = env;
    this.spec.speed = this.actSpeed;
    this.enjoy(dt, this.still());
    const H = this.heightPx;

    // Waddling: the feet take turns, the body rocks side to side, the neck pumps and the tail wiggles.
    const moving = clamp(this.stride / (H * 0.45), 0, 1);
    if (moving > 0.05) {
      const ph = this.gait;
      const sw = Math.sin(ph) * moving;
      p.add('leg.L', 30 * sw);
      p.add('leg.R', -30 * sw);
      p.add('body', 0, 0, 7 * sw);
      p.add('neck.2', 5 * Math.cos(ph * 2) * moving, 0, -4 * sw);
      p.add('tail', 0, 0, (-8 - 10 * this.wiggle) * sw);
      this.lift += H * 0.02 * Math.abs(Math.cos(ph)) * moving;
    }
    this.h = this.lift;

    p.add('jaw', this.jaw);
    const open = this.openS.update(dt, this.wings);
    const beat = Math.sin(env.time * 30) * this.flap;
    for (const [sfx, side] of SIDES)
      p.add(`wing.${sfx}`, -6 * open, 0, side * (60 * open + 18 * beat));

    const puff = this.puffS.update(dt, this.puff);
    if (puff > 0.01) p.stretch('body', 1 + 0.1 * puff, [0, 0, 1], 1 + 0.08 * puff);

    // Sitting: she sinks until the legs are hidden in her.
    const sink = this.sinkS.update(dt, this.sink);
    if (sink > 0.005) {
      p.shift('body', 0, -SINK * sink, 0);
      p.add('leg.L', 55 * sink);
      p.add('leg.R', 55 * sink);
      p.add('tail', -8 * sink);
    }

    const middle = (env.frame.left + env.frame.right) / 2;
    const turn = this.turn.update(dt, this.walking ? 0 : Math.sign(middle - this.s) * 48);
    p.add('root', 0, turn);
    p.add('head', 0, -turn * 0.6);
  }

  protected after(_dt: number, env: Env) {
    const o = this.outfit;
    if (!o) return;
    const t = env.time;
    const tone = this.expression === 'neutral' ? BEACON.happy : BEACON[this.expression];
    const asleep = this.sinkS.y;
    o.dot(
      0,
      clamp(
        0.4 + 0.6 * this.glow + 0.3 * this.collar - 0.3 * asleep + (this.hovered ? 0.3 : 0),
        0,
        1,
      ),
      tone,
    );
    let tip = 0.25 + 0.4 * Math.max(0, Math.sin(t * 1.1)) ** 6;
    if (this.flap > 0.05) tip = 0.3 + 0.7 * Math.max(0, Math.sin(t * 14));
    o.dot(1, clamp(tip * (1 - 0.8 * asleep), 0, 1));
    // The collar glows softly, and flares with each honk.
    o.dot(2, clamp(0.25 + 0.15 * Math.sin(t * 0.9) + 0.75 * this.collar - 0.2 * asleep, 0, 1));
    o.beacon(tone ?? '#ffcf5a');
  }
}
