import type { Object3D } from 'three';
import { BEACON } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import type { Anatomy } from './pet';
import { HOOF_ACT_MOODS, Hoofed, hoofFeels, hoofMoods } from './hooves';
import { pulse, ramp } from './kitties';

/**
 * Bram, the robot ram: an adult, heavy and deep, in a thick coat of wool pods on short strong
 * dark legs, with a Roman nose and a screen face. His signature is the pair of big spiral
 * horns, each with four lit ridges (Dot2..Dot5) that run along them slowly and flash all at
 * once when the horns clonk. He backs off, paws the floor and charges at nothing, skidding to
 * a stop with a clonk of light and a dazed shake of the head; stamps; baas deep and loud with
 * the ridges flashing in turn; rubs his horns on an imaginary post; and glares.
 */
export const RAM_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.3, 0.5],
    [0.7, 0.5],
  ],
  rx: 0.075,
  ry: 0.22,
  line: 0.04,
  mouth: null,
};

const RAM: Anatomy = {
  tail: ['tail.1', 'tail.2'],
  tailAxis: [0, -0.7, -0.7],
  earsHang: true,
  moods: hoofMoods(2),
  actMoods: {
    ...HOOF_ACT_MOODS,
    charge: 'annoyed',
    baa: 'happy',
    rub: 'happy',
    glare: 'annoyed',
    strut: 'happy',
  },
  lying: 'calm',
  hover: 'happy',
  drop: { stand: 0, sit: -0.12, lie: -0.2 },
  sit: -12,
  turn: 52,
};

const RIDGES = 4;

export class Ram extends Hoofed {
  protected readonly anatomy = RAM;
  protected readonly build = { middle: 0.45, spring: 0.55, speed: 0.9 };
  /** The ridges' glow from tricks (0..1), and a flash (1 on a clonk) that dies away. */
  private glow = 0;
  private flash = 0;
  private flashNow = 0;
  private wave = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Bram',
        model: 'ram',
        metres: 0.9,
        width: 0.85,
        size: 1.25,
        feels: hoofFeels(2, {
          body: { f: 1.3, zeta: 0.75 },
          head: { f: 1.5, zeta: 0.65, r: 0.3 },
          'ear.L': { f: 2.3, zeta: 0.3 },
          'ear.R': { f: 2.3, zeta: 0.3 },
        }),
        face: RAM_FACE,
        eyes: 0.78,
        gaze: [
          { bone: 'head', yaw: 0.75, pitch: 0.9 },
          { bone: 'body', yaw: 0.12, pitch: 0 },
        ],
        reach: { yaw: 55, pitch: 28 },
        lag: 0.55,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 0.9,
      },
      model,
    );
    this.fold = { front: [-72, 150], back: [-66, 138] };
    this.lieDrop = -0.18;
    this.reach = { head: 58, neck: 0, body: 12 };
    this.knee = 24;
    this.pokeAct = 'baa';
    this.adopt(
      {
        charge: 1.8,
        baa: 1.2,
        rub: 1,
        glare: 0.8,
        strut: 0.8,
        stamp: 1.2,
        graze: 1,
        chew: 0.6,
        lie: 0.8,
        stand: 2,
        shake: 0.6,
        toss: 0.8,
        yawn: 0.5,
        tilt: 0.6,
        sneeze: 0.4,
        dozeOff: 0.4,
        circle: 0.3,
        frontLip: 0.3,
        backWall: 0.3,
      },
      this.moves(),
    );
  }

  private moves(): Record<string, Act> {
    const p = () => this.puppet;
    const stand = () => this.standing;
    return {
      // The head-butt run-up: rears back, paws the floor, charges a few steps at nothing and
      // skids to a stop with a clonk of light on the horns; a dazed shake of the head.
      charge: {
        weight: 0,
        length: [10, 10],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.run.dir = this.roomy();
          this.run.phase = 0;
          this.run.n = 0;
        },
        pose: (t) => {
          const run = this.run;
          const H = this.heightPx;
          if (run.phase === 0) {
            // Backing off: rocked back on the haunches, chin up, shuffling.
            const k = ramp(t, 0, 0.6);
            p().add('body', -10 * k);
            p().add('head', -14 * k);
            this.backLegs(10 * k);
            p().add('leg.FL', 8 * k * sin(t, 1.8));
            p().add('leg.FR', -8 * k * sin(t, 1.8));
            this.glow = 0.3 * k;
            this.emote = 'focused';
            if (t > 1.4) run.phase = 1;
          }
          if (run.phase === 1) {
            // Pawing the floor, one hoof then the other, head low, eyes fixed.
            const k = ramp(t, 1.2, 1.7);
            const a = Math.max(0, sin(t, 1.5)) * k;
            const b = Math.max(0, sin(t, 1.5, 0.5)) * k;
            p().add('leg.FL', -40 * a);
            p().add('shin.FL', 28 * a);
            p().add('leg.FR', -40 * b);
            p().add('shin.FR', 28 * b);
            p().add('head', 22 * k - 10 * (1 - k));
            p().add('body', 6 * k - 10 * (1 - k));
            this.glow = 0.3 + 0.5 * k;
            this.pupils = 1;
            this.emote = 'focused';
            if (a < 0.05 && b < 0.05 && run.n === 1) run.n = 0;
            if ((a > 0.95 || b > 0.95) && run.n === 0) {
              run.n = 1;
              this.hop.kick(0.45);
            }
            if (t > 3.5) {
              run.phase = 2;
              run.at = t;
              run.n = 0;
            }
          }
          if (run.phase === 2) {
            // The charge: head down, a few quick steps along the floor.
            if (run.n === 0) {
              run.n = 1;
              this.walkTo(this.s + run.dir * H * 1.5, this.depth);
            }
            this.boost = 3.4;
            p().add('head', 28);
            p().add('body', 6);
            p().add('ear.L', 0, 0, 14);
            p().add('ear.R', 0, 0, -14);
            this.glow = 0.9;
            this.pupils = 1;
            this.emote = 'focused';
            if ((this.atStop && t - run.at > 0.4) || t - run.at > 3) {
              run.phase = 3;
              run.at = t;
              this.goal = null;
              this.boost = 1;
            }
          }
          if (run.phase === 3) {
            // The skid and the clonk: legs braced, the front end dipping, light on the horns.
            const u = t - run.at;
            const brace = ramp(u, 0, 0.1) * (1 - ramp(u, 0.7, 1.1));
            this.frontLegs(-34 * brace);
            this.backLegs(18 * brace);
            p().add('body', 8 * brace);
            p().add('head', 20 * brace);
            this.boost = 0.2;
            if (u > 0.12 && run.n === 1) {
              run.n = 2;
              this.hop.kick(1.8 * this.build.spring);
              p().kick('head', -340);
              p().kick('ear.L', 0, 0, -400);
              p().kick('ear.R', 0, 0, 400);
              this.flashNow = 1;
            }
            // Dazed: the head wobbling, then a proud shake.
            const dazed = ramp(u, 0.3, 0.6) * (1 - ramp(u, 1.8, 2.6));
            p().add('head', 6 * dazed, 22 * dazed * Math.sin(u * 9), 8 * dazed * Math.sin(u * 7));
            this.emote = u < 0.5 ? 'surprised' : u < 2.4 ? 'dizzy' : 'happy';
            this.glow = 0.6 * (1 - ramp(u, 0.5, 2));
            if (u > 3) this.endAct();
          }
        },
      },
      // A deep baa: head up, neck out, mouth wide, the body trembling; the horn ridges flash in turn.
      baa: {
        weight: 0,
        length: [3.4, 3.4],
        when: () => !this.walking && this.posture !== 'sit',
        pose: (t) => {
          const k = pulse(t, 0.25, 1.1) + 0.9 * pulse(t, 1.7, 1.2);
          const on = Math.min(1, k);
          this.mouth = 0.75 * on;
          this.wave = on;
          this.glow = 0.4 * on;
          p().add('head', this.posture === 'lie' ? -8 * on : -22 * on);
          p().add('body', -3 * on + 1.4 * on * sin(t, 17));
          p().add('ear.L', 0, 0, -10 * on);
          p().add('ear.R', 0, 0, 10 * on);
          p().add('tail.1', 0, 14 * on * sin(t, 5));
          this.emote = 'happy';
          if (t > 0.3 && !this.run.done) {
            this.run.done = true;
            this.hop.kick(0.5 * this.build.spring);
          }
        },
      },
      // Scratches his horns on an imaginary post: the head turned and rubbing up and down,
      // leaning in with a contented squint.
      rub: {
        weight: 0,
        length: [5, 5],
        when: stand,
        start: () => (this.run.dir = Math.random() < 0.5 ? -1 : 1),
        pose: (t) => {
          const k = ramp(t, 0, 0.6) * (1 - ramp(t, 4.3, 5));
          const d = this.run.dir;
          p().add('head', (6 + 12 * sin(t, 1.3)) * k, 26 * d * k, 18 * d * k);
          p().add('body', 3 * k * sin(t, 1.3, 0.1));
          p().add('root', 0, 6 * d * k * sin(t, 1.3, 0.2));
          p().add('leg.FL', 4 * k * sin(t, 1.3));
          p().add('tail.1', 0, 12 * k * sin(t, 3));
          this.glow = 0.5 * k;
          this.emote = 'sleepy';
          this.pupils = 0.3;
        },
      },
      // A long stare, head low, one slow paw: the ridges brighten.
      glare: {
        weight: 0,
        length: [4, 4],
        when: stand,
        pose: (t) => {
          const k = ramp(t, 0, 0.5) * (1 - ramp(t, 3.4, 4));
          p().add('head', 24 * k, 0, 4 * k * sin(t, 0.4));
          p().add('body', 6 * k);
          const a = Math.max(0, sin(t, 0.7, 0.1)) ** 2 * k;
          p().add('leg.FL', -34 * a);
          p().add('shin.FL', 22 * a);
          this.glow = 0.7 * k;
          this.emote = 'focused';
          this.pupils = 1;
        },
      },
      // A proud turn about the floor, chin up, horns glinting.
      strut: {
        weight: 0,
        length: [6, 6],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.go([this.somewhere(), this.somewhere()]);
        },
        pose: (t) => {
          this.boost = 0.6;
          this.kneeLift = 42;
          p().add('head', -12);
          p().add('body', -4);
          this.wave = 0.6;
          this.emote = 'happy';
          if (this.atStop && t > 0.8) this.endAct();
        },
      },
    };
  }

  protected idle(t: number) {
    this.glow = 0;
    this.wave = 0;
    super.idle(t);
  }

  protected after(dt: number, env: Env) {
    super.after(dt, env);
    const o = this.outfit;
    if (!o) return;
    // A clonk's flash dies away at its own rate, however often the frames come.
    this.flash = Math.max(this.flashNow, this.flash * Math.exp(-dt * 3.2));
    this.flashNow = 0;
    const asleep = this.mood === 'asleep' || this.posture === 'lie';
    const colour = this.lookName === 'colour';
    const speed = 1 + 3 * this.wave;
    for (let i = 0; i < RIDGES; i++) {
      const w = 0.5 + 0.5 * Math.sin(env.time * speed - i * 0.9);
      const base = asleep ? 0.1 : 0.22 + 0.2 * w;
      o.dot(
        2 + i,
        clamp(base + this.glow * (0.5 + 0.5 * w) + this.flash + 0.5 * this.wave * w, 0, 1),
        this.flash > 0.4 && colour ? '#ffffff' : undefined,
      );
    }
    o.beacon(BEACON[this.expression] ?? '#f4f4f1');
  }
}
