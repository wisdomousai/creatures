import type { Object3D } from 'three';
import { BEACON } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { Bird, ease, type Reaction, span } from './birds';
import { sin } from './moves';
import { Spring } from './spring';

/**
 * Cheep, the robot robin: small, round and wide awake. A plump ball of a body tipped
 * breast-up, five lit domes on a red breast plate over a pale belly, a red face plate round
 * the screen, a small bill in two halves (the lower on its own jaw so he can sing), a cocked
 * tail, folded brown wings and thin legs with grip feet. Three tiny lit notes ride in front
 * of his bill, scaled to nothing unless he is singing.
 *
 * He gets about the robin way: a burst of quick hops, a stop, head up, another burst. Stopped,
 * he cocks his head to listen to the floor (one eye turned down to it), snaps up a worm that
 * isn't there, puffs himself up and sings a little song, head up, bill opening and shutting
 * to the tune, breast lights pulsing with each note while the notes float away; and now and
 * then fluffs and shivers or preens a wing.
 *
 * A poke makes him jump with a chirp; three make him dizzy; the mouse resting on him makes
 * him bob and sing a note.
 */
export const ROBIN_FACE: FaceLayout = {
  width: 512,
  height: 384,
  eyes: [
    [0.29, 0.5],
    [0.71, 0.5],
  ],
  rx: 0.1,
  ry: 0.2,
  line: 0.04,
  mouth: null,
};

const SIDES = [
  ['L', 1],
  ['R', -1],
] as const;
/** How far a note floats up, in metres (the model's). */
const FLOAT = 0.12;

export class Robin extends Bird {
  static readonly terms =
    'redbreast red orange brown tan cream breast small round plump sing song chirp tweet worm hop tilt listen songbird puff tail';

  /** Held by the pointer, it flies after it. */
  readonly flies = true;
  private noteS = [new Spring(8, 0.6, 1), new Spring(8, 0.6, 1), new Spring(8, 0.6, 1)];
  private openS = new Spring(5, 0.5, 1.2);
  private puffS = new Spring(3, 0.6);
  private turn = new Spring(1.6, 0.8);
  // Per-frame requests from acts, cleared in idle().
  private jaw = 0;
  private wings = 0;
  private hop = 0;
  private lift = 0;
  private puff = 0;
  private glow = 0;
  private notes = [0, 0, 0];
  private floatT = [0, 0, 0];
  private beat = 0;
  private dir = 1;
  private burst = false;
  private actSpeed = 1.0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Cheep',
        model: 'robin',
        metres: 0.46,
        width: 0.3,
        size: 0.6,
        feels: {
          default: { f: 5, zeta: 0.6 },
          root: { f: 5, zeta: 0.5 },
          body: { f: 5, zeta: 0.45 },
          head: { f: 6, zeta: 0.45, r: 0.5 },
          jaw: { f: 12, zeta: 0.45 },
          tail: { f: 5, zeta: 0.35 },
          'wing.L': { f: 5, zeta: 0.45 },
          'wing.R': { f: 5, zeta: 0.45 },
          'leg.L': { f: 9, zeta: 0.6 },
          'leg.R': { f: 9, zeta: 0.6 },
        },
        face: ROBIN_FACE,
        eyes: 0.9,
        gaze: [
          { bone: 'head', yaw: 0.85, pitch: 0.85 },
          { bone: 'body', yaw: 0.15, pitch: 0 },
        ],
        reach: { yaw: 70, pitch: 35 },
        lag: 0.8,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [40, 100],
        speed: 1.0,
        turn: 90,
        roam: true,
      },
      model,
    );
    this.acts = {
      ...this.moves(),
      ...this.songs(),
      ...this.reactions(),
    };
  }

  // ---------- Getting about ----------

  private moves(): Record<string, Act> {
    return {
      idle: { weight: 3, length: [2.5, 5] },
      hopAlong: {
        weight: 2.5,
        length: [4, 6],
        when: this.still,
        start: () => this.amble(1.5 + Math.random() * 3),
      },
      listen: {
        weight: 2.5,
        length: [5, 7],
        face: 'surprised',
        when: this.still,
        start: () => (this.dir = Math.random() < 0.5 ? -1 : 1),
        pose: (t) => {
          // Head right down and cocked on one side, one eye to the floor, dead still; then
          // the other side; then a snap at whatever it was.
          const k = this.fade(t, 0.35);
          const flip = ease(t, 2.2, 2.6);
          const side = this.dir * (1 - 2 * flip);
          const snap = span(
            t,
            this.actLength - 1.5,
            this.actLength - 1.3,
            this.actLength - 1.25,
            this.actLength - 0.9,
          );
          const cock = k * (1 - snap);
          this.puppet.add('head', 26 * cock + 36 * snap, 0, side * 28 * cock);
          this.puppet.add('body', 8 * cock + 8 * snap);
          this.puppet.add('tail', -8 * cock);
          this.jaw =
            14 *
            span(
              t,
              this.actLength - 1.3,
              this.actLength - 1.25,
              this.actLength - 1.1,
              this.actLength - 0.9,
            );
          this.hop = 0;
          this.expression = snap > 0.3 ? 'determined' : 'surprised';
        },
      },
      scratch: {
        weight: 1,
        length: [4, 5.5],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // Fluffs up, a quick shiver, and settles.
          const k = this.fade(t, 0.5);
          this.puff = k;
          this.puppet.add('body', 0, 0, 3 * k * Math.sin(t * 40));
          this.puppet.add('head', 0, 0, 3 * k * Math.sin(t * 40 + 1));
          this.puppet.add('tail', 0, 0, 6 * k * Math.sin(t * 30));
          this.wings = 0.08 * k;
        },
      },
      preen: {
        weight: 1.2,
        length: [5, 7],
        when: this.still,
        start: () => (this.dir = Math.random() < 0.5 ? -1 : 1),
        pose: (t) => {
          const k = span(t, 0.4, 1.1, this.actLength - 1.1, this.actLength - 0.3);
          const nib = Math.max(0, sin(t, 2.8)) * k;
          this.puppet.add('body', 4 * k, this.dir * 14 * k, 0);
          this.puppet.add('head', 26 * k + 6 * nib, this.dir * 100 * k, this.dir * 8 * k);
          this.jaw = 8 * nib;
          this.expression = k > 0.5 ? 'sleepy' : 'neutral';
        },
      },
    };
  }

  // ---------- Singing ----------

  private songs(): Record<string, Act> {
    return {
      sing: {
        weight: 2.5,
        length: [7, 8.5],
        face: 'happy',
        when: this.still,
        pose: (t) => this.sing(t),
      },
    };
  }

  /** A little song: three phrases, each a few notes, the bill opening to every one. */
  private sing(t: number) {
    const p = this.puppet;
    const k = this.fade(t, 0.6);
    // Phrases of [start, notes]; every note 0.28 s, the pitch showing in how far the head goes up.
    const phrases = [
      [1.2, 4],
      [3.6, 3],
      [5.6, 5],
    ];
    let open = 0;
    let note = 0;
    let pitch = 0;
    this.notes = [0, 0, 0];
    for (const [at, n] of phrases) {
      const u = (t - at) / 0.28;
      if (u >= 0 && u < n) {
        const i = Math.floor(u);
        const f = u - i;
        open = Math.max(open, Math.sin(Math.PI * Math.min(1, f * 1.15)));
        note = 1;
        pitch = Math.sin(i * 2.1 + at) * 0.5 + 0.5;
        const slot = i % 3;
        this.notes[slot] = 1;
        this.floatT[slot] = f;
      }
    }
    this.beat = note;
    this.jaw = 22 * open;
    this.glow = Math.max(note * (0.5 + 0.5 * open), 0.1);
    this.puff = k * 0.7;
    p.add('head', -24 * k - 8 * pitch * note, 0, 5 * Math.sin(t * 2.2) * k);
    p.add('body', -9 * k - 3 * open);
    p.add('tail', 10 * k - 6 * open);
    this.wings = 0.05 * k * open;
    this.lift = 0;
  }

  protected react(kind: Reaction, t: number) {
    const p = this.puppet;
    if (kind === 'poked') {
      // A chirp and a little jump, wings flicked out.
      const k = span(t, 0, 0.1, 0.9, 1.5);
      this.jaw = 24 * span(t, 0.05, 0.12, 0.35, 0.5);
      this.lift = this.heightPx * 0.2 * (t < 0.45 ? Math.sin((Math.PI * t) / 0.45) : 0);
      this.hop = t < 0.45 ? 1 : 0;
      this.wings = 0.6 * span(t, 0, 0.1, 0.4, 0.8);
      this.puff = k;
      this.glow = k;
      this.notes = [t > 0.1 && t < 0.9 ? 1 : 0, 0, 0];
      this.floatT[0] = clamp((t - 0.1) / 0.8, 0, 1);
      p.add('head', -14 * span(t, 0.05, 0.2, 0.5, 0.9));
      p.add('tail', 14 * k);
    } else if (kind === 'dizzy') {
      const k = 1 - ease(t, 2.4, 3.4);
      p.add('head', 8 * k * Math.cos(t * 5), 18 * k * Math.sin(t * 3), 26 * k * Math.sin(t * 5));
      p.add('body', 0, 0, 10 * k * Math.sin(t * 5));
      p.add('root', 0, 0, 7 * k * Math.sin(t * 5));
      this.wings = 0.2 * k;
      this.glow = k * (Math.random() < 0.5 ? 1 : 0.2);
    } else {
      const k = this.fade(t, 0.5);
      p.add('head', 12 * k * Math.sin(t * 7), 0, 6 * k * sin(t, 1.2));
      p.add('body', -4 * k);
      p.add('tail', 0, 0, 10 * k * sin(t, 2.4));
      this.glow = k;
      this.puff = 0.4 * k;
      const one = (t * 1.5) % 1 < 0.6 ? k : 0;
      this.notes = [one, 0, 0];
      this.floatT[0] = (t * 1.5) % 1;
      this.jaw = 12 * Math.max(0, Math.sin(t * 9)) * k;
    }
  }

  // ---------- Posing ----------

  protected idle(t: number) {
    const p = this.puppet;
    this.jaw = 0;
    this.wings = 0;
    this.hop = 0;
    this.lift = 0;
    this.puff = 0;
    this.glow = 0;
    this.beat = 0;
    this.notes = [0, 0, 0];
    this.actSpeed = 1.0;
    this.expression = this.hovered ? 'happy' : 'neutral';
    // Always on the lookout: the head flicks to one side now and then.
    const n = Math.floor(t / 1.9);
    const flick =
      Math.abs(Math.sin(n * 53.1)) > 0.4 && t % 1.9 < 0.5 ? Math.sign(Math.sin(n * 9.3)) : 0;
    p.add('head', 2 * sin(t, 0.4), 22 * flick * Math.min(1, (t % 1.9) * 8), 8 * flick);
    p.add('body', 1.2 * sin(t, 0.35));
    p.add('tail', 3 * sin(t, 0.6));
    p.add('wing.L', 0, 0, 1 * sin(t, 0.23));
    p.add('wing.R', 0, 0, 1 * sin(t, 0.23, 0.4));
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    this.env = env;
    this.enjoy(dt, this.still());
    const H = this.heightPx;

    // Hops in bursts: a few quick hops, a stop with the head up, then off again.
    const cycle = 1.7;
    this.burst = env.time % cycle < 0.9;
    this.spec.speed = this.actSpeed * (this.burst ? 1.5 : 0.04);
    const moving = clamp(this.stride / (H * 0.5), 0, 1) * (this.burst ? 1 : 0.2);
    let air = this.hop;
    if (moving > 0.05 && this.walking) {
      const ph = this.gait * 2;
      air = Math.abs(Math.sin(ph)) * moving;
      const land = Math.cos(ph) * moving;
      this.lift = H * 0.09 * air;
      p.add('body', 6 * land);
      p.add('head', -7 * land + 3 * air);
      p.add('tail', 8 * land);
      this.wings += 0.1 * air;
    }
    if (this.walking && !this.burst) {
      // The pause: standing tall, head up, looking about.
      p.add('head', -10, 28 * Math.sin(env.time * 4));
      p.add('body', -4);
    }
    this.h = this.lift;
    p.add('leg.L', 28 * air);
    p.add('leg.R', 28 * air);

    p.add('jaw', this.jaw);
    const open = this.openS.update(dt, this.wings);
    for (const [sfx, side] of SIDES) p.add(`wing.${sfx}`, -6 * open, 0, side * 58 * open);

    // Fluffed up: the whole body swells a touch.
    const puff = this.puffS.update(dt, this.puff);
    if (puff > 0.01) {
      p.stretch('body', 1 + 0.1 * puff, [0, 0, 1], 1 + 0.07 * puff);
    }

    // Standing, he turns three-quarters on toward the middle so the profile shows.
    const middle = (env.frame.left + env.frame.right) / 2;
    const turn = this.turn.update(dt, this.walking ? 0 : Math.sign(middle - this.s) * 45);
    p.add('root', 0, turn);
    p.add('head', 0, -turn * 0.6);
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    // The notes: each appears in front of the bill, floats up and away.
    for (let i = 0; i < 3; i++) {
      const s = Math.max(
        0.001,
        this.noteS[i].update(dt, this.notes[i] * (1 - 0.6 * this.floatT[i])),
      );
      p.stretch(`note.${i + 1}`, s, [0, 1, 0], s);
      p.shift(`note.${i + 1}`, 0, this.notes[i] ? FLOAT * this.floatT[i] : 0, 0);
    }
    this.lights(env.time);
  }

  /** The breast lights glow with his mood and pulse with each note he sings. */
  private lights(t: number) {
    const tone = this.expression === 'neutral' ? BEACON.happy : BEACON[this.expression];
    const base = 0.4 + 0.6 * this.glow + (this.hovered ? 0.25 : 0);
    for (let i = 0; i < 5; i++) {
      const wave = 0.6 + 0.4 * Math.sin(t * 2 + i * 0.9);
      let level = base * wave;
      if (this.beat > 0.5) level = 0.5 + 0.5 * Math.sin(t * 24 + i * 1.3) ** 2;
      if (this.act === 'dizzy') level = Math.random() < 0.5 ? 1 : 0.15;
      this.outfit.dot(i, clamp(level, 0, 1));
    }
    for (let i = 5; i < 8; i++) this.outfit.dot(i, 1, '#ffd0a0');
    this.outfit.beacon(tone ?? '#ff8a4a');
  }
}
