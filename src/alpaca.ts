import type { Object3D } from 'three';
import { BEACON } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import type { Anatomy } from './pet';
import { HOOF_ACT_MOODS, Hoofed, hoofFeels, hoofMoods } from './hooves';
import { pulse, ramp } from './kitties';

/**
 * Quito, the robot alpaca: tall on slim legs, a long neck that bends twice and wears three lit
 * rings (Dot2..Dot4), banana ears, a fluffy topknot pom and a face of permanent mild disdain.
 * She hums (the rings pulse up the neck), spits a small ball of light (Dot5) off to the side,
 * never at the mouse, folds down onto her legs in a kush, and stares, unimpressed, at nothing
 * in particular, until you look away.
 */
export const ALPACA_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.29, 0.5],
    [0.71, 0.5],
  ],
  rx: 0.065,
  ry: 0.27,
  line: 0.04,
  mouth: null,
};

const ALPACA: Anatomy = {
  tail: ['tail.1', 'tail.2'],
  tailAxis: [0, -0.7, -0.7],
  earsHang: false,
  moods: hoofMoods(5),
  actMoods: { ...HOOF_ACT_MOODS, hum: 'calm', spit: 'annoyed', stare: 'calm' },
  lying: 'calm',
  hover: 'calm',
  drop: { stand: 0, sit: -0.2, lie: -0.3 },
  sit: -14,
  turn: 46,
};

export class Alpaca extends Hoofed {
  static readonly terms =
    'llama camelid tall long neck slim legs cream white beige fluffy topknot pom banana ears aloof snooty haughty hums spits rings';

  protected readonly anatomy = ALPACA;
  protected readonly build = { middle: 0.55, spring: 0.6, speed: 0.95 };
  /** The neck rings' pulse level, 0..1, and the spit's start time within the act. */
  private hummed = 0;
  private spitAt = -1;
  private spitDir = 1;

  constructor(model: Object3D) {
    super(
      {
        name: 'Quito',
        model: 'alpaca',
        metres: 1.3,
        width: 0.7,
        size: 1.45,
        feels: hoofFeels(2, { 'ear.L': { f: 2.2, zeta: 0.25 }, 'ear.R': { f: 2.2, zeta: 0.25 } }),
        face: ALPACA_FACE,
        eyes: 0.78,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.9 },
          { bone: 'body', yaw: 0.12, pitch: 0 },
        ],
        reach: { yaw: 60, pitch: 30 },
        lag: 0.7,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 1,
      },
      model,
    );
    this.fold = { front: [-72, 150], back: [-62, 130] };
    this.lieDrop = -0.3;
    this.reach = { head: 50, neck: 14, body: 8 };
    this.knee = 24;
    this.pokeAct = 'hum';
    this.adopt(
      {
        hum: 1.5,
        spit: 1.1,
        stare: 1.3,
        lie: 1.2,
        stand: 2,
        graze: 0.8,
        chew: 0.7,
        shake: 0.8,
        stamp: 0.5,
        toss: 0.5,
        yawn: 0.6,
        tilt: 1,
        sneeze: 0.5,
        dozeOff: 0.5,
        fallOver: 0.3,
        circle: 0.5,
        zoomies: 0.4,
        frontLip: 0.4,
        backWall: 0.4,
      },
      this.moves(),
    );
  }

  protected onEnter() {
    super.onEnter();
    this.puppet.stretch('spit', 0, [0, 1, 0], 0);
    this.spitAt = -1;
  }

  private moves(): Record<string, Act> {
    const p = () => this.puppet;
    return {
      // A hum: eyes half shut, the neck rings pulsing up from the chest, a slow sway.
      hum: {
        weight: 0,
        length: [4.2, 4.2],
        when: () => !this.walking && this.posture !== 'sit',
        pose: (t) => {
          const k = ramp(t, 0, 0.5) * (1 - ramp(t, 3.6, 4.2));
          this.hummed = k;
          this.neckAdd(-4 * k);
          p().add('head', -4 * k + 2 * k * sin(t, 1.4));
          p().add('body', 0, 2.5 * k * sin(t, 0.7));
          p().add('ear.L', 0, 0, -10 * k * (1 + sin(t, 1.4)));
          p().add('ear.R', 0, 0, 10 * k * (1 + sin(t, 1.4)));
          this.mouth = 0.12 * k * (1 + sin(t, 2.8));
          this.emote = 'sleepy';
          this.pupils = 0.8;
        },
      },
      // Turns her head right away from us, draws back, and spits a ball of light to the side.
      spit: {
        weight: 0,
        length: [3.6, 3.6],
        when: () => !this.walking && this.posture === 'stand',
        start: () => {
          this.spitAt = -1;
          this.spitDir = this.roomy() >= 0 ? 1 : -1;
        },
        pose: (t) => {
          const k = ramp(t, 0, 0.7) * (1 - ramp(t, 3, 3.6));
          const d = this.spitDir;
          const draw = pulse(t, 0.9, 0.4);
          this.neckAdd(8 * k - 18 * pulse(t, 1.5, 0.35));
          p().add('head', 8 * k + 14 * draw - 22 * pulse(t, 1.5, 0.35), 40 * d * k);
          p().add('body', 0, 6 * d * k);
          p().add('ear.L', 0, 0, 24 * k);
          p().add('ear.R', 0, 0, -24 * k);
          this.mouth = pulse(t, 1.45, 0.35);
          this.emote = t < 1.5 ? 'focused' : 'wink';
          this.pupils = 0.9;
          if (t > 1.5 && this.spitAt < 0) this.spitAt = t;
        },
      },
      // Stares, unimpressed: still, chin up, ears back, one long slow blink.
      stare: {
        weight: 0,
        length: [4.5, 4.5],
        when: () => !this.walking,
        pose: (t) => {
          const k = ramp(t, 0, 0.6) * (1 - ramp(t, 3.9, 4.5));
          this.neckAdd(4 * k);
          p().add('head', -6 * k);
          p().add('ear.L', 0, 0, 30 * k);
          p().add('ear.R', 0, 0, -30 * k);
          this.emote = 'neutral';
          this.pupils = 0.7;
          if (t > 2.2 && t < 2.7) this.emote = 'sleepy';
        },
      },
    };
  }

  protected idle(t: number) {
    this.hummed = 0;
    super.idle(t);
  }

  protected setAct(name: string) {
    super.setAct(name);
    if (name !== 'spit') this.spitAt = -1;
  }

  protected after(dt: number, env: Env) {
    super.after(dt, env);
    const o = this.outfit;
    if (!o) return;
    const asleep = this.mood === 'asleep' || this.posture === 'lie';
    // The neck rings: a slow wave up the neck; deeper when she hums.
    for (let i = 0; i < 3; i++) {
      const w = 0.5 + 0.5 * Math.sin(env.time * (1.2 + 2 * this.hummed) - i * 1.1);
      o.dot(2 + i, clamp((asleep ? 0.1 : 0.25 + 0.25 * w) + this.hummed * 0.7 * w, 0, 1));
    }
    this.spit(env);
    o.beacon(BEACON[this.expression] ?? '#f4f4f1');
  }

  /** The spit: a bead of light that leaves her mouth sideways in an arc and shrinks to nothing. */
  private spit(env: Env) {
    const p = this.puppet;
    const u = this.spitAt < 0 ? -1 : (this.actT - this.spitAt) / 1.3;
    if (u < 0 || u > 1) {
      p.stretch('spit', 0, [0, 1, 0], 0);
      this.outfit?.dot(5, 0);
      return;
    }
    const grow = Math.min(1, u * 8) * (1 - ramp(u, 0.7, 1));
    p.stretch('spit', grow, [0, 1, 0], grow);
    p.shift('spit', this.spitDir * 0.9 * u, 0, 0.12 * Math.sin(u * Math.PI) - 0.1 * u * u);
    this.outfit?.dot(5, clamp(1 - 0.3 * u + 0.2 * Math.sin(env.time * 18), 0, 1));
  }
}
