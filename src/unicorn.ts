import type { Object3D } from 'three';
import { BEACON } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import type { Anatomy } from './pet';
import { HOOF_ACT_MOODS, Hoofed, hoofFeels, hoofMoods } from './hooves';
import { pulse, ramp } from './kitties';

/**
 * Opal, the robot unicorn: a slim pony on long legs. Her horn is a spiral of eight lit rings
 * (Dot2..Dot9) and her mane is a row of rounded fins down her neck (Dot10..Dot17); in the colour
 * look the lights are a rainbow, in the other looks plain light, and both run up and down in
 * waves. She rears up on her hind legs, prances with her knees up to her chin, whinnies, and
 * casts a little star from the tip of her horn that floats up and fades. A sparkle on each
 * flank (Dot18) is her cutie mark.
 */
export const UNICORN_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.3, 0.5],
    [0.7, 0.5],
  ],
  rx: 0.085,
  ry: 0.27,
  line: 0.035,
  mouth: null,
};

/** The rainbow, one colour for each light on the horn and the mane, in the colour look. */
export const RAINBOW = [
  '#ff5d6c',
  '#ff9a4d',
  '#ffd84d',
  '#6fdc7a',
  '#4dc6ff',
  '#6f7bff',
  '#c06bff',
  '#ff7ad9',
];
const RINGS = 8;
const FINS = 8;

const UNICORN: Anatomy = {
  tail: ['tail.1', 'tail.2', 'tail.3', 'tail.4'],
  tailAxis: [0, -0.7, -0.7],
  earsHang: false,
  moods: hoofMoods(10),
  actMoods: {
    ...HOOF_ACT_MOODS,
    rear: 'happy',
    prance: 'happy',
    cast: 'love',
    whinny: 'happy',
    shimmer: 'love',
  },
  lying: 'calm',
  hover: 'love',
  drop: { stand: 0, sit: -0.16, lie: -0.22 },
  sit: -14,
  turn: 52,
};

export class Unicorn extends Hoofed {
  static readonly terms =
    'pony horse horn spiral rainbow magical mythical fantasy white lilac lavender pastel mane slim long legs sparkle glow prance trot star';

  protected readonly anatomy = UNICORN;
  protected readonly build = { middle: 0.5, spring: 0.7, speed: 1 };
  /** The horn's glow (0..1) when she is casting or shimmering, and the star's progress. */
  private glow = 0;
  private shine = 0;
  private starAt = -1;
  private starT = 0;
  private wave = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Opal',
        model: 'unicorn',
        metres: 1.22,
        width: 0.7,
        size: 1.4,
        feels: hoofFeels(4, { neck: { f: 1.8, zeta: 0.55 } }),
        face: UNICORN_FACE,
        eyes: 0.77,
        gaze: [
          { bone: 'head', yaw: 0.6, pitch: 0.8 },
          { bone: 'neck', yaw: 0.25, pitch: 0.2 },
          { bone: 'body', yaw: 0.12, pitch: 0 },
        ],
        reach: { yaw: 60, pitch: 30 },
        lag: 0.7,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [50, 110],
        speed: 1,
      },
      model,
    );
    this.fold = { front: [-70, 150], back: [-60, 130] };
    this.lieDrop = -0.24;
    this.reach = { head: 40, neck: 22, body: 8 };
    this.knee = 36;
    this.pokeAct = 'cast';
    this.adopt(
      {
        graze: 0.8,
        lie: 1,
        stand: 2,
        rear: 1,
        prance: 1.5,
        cast: 1.5,
        whinny: 1,
        shimmer: 1,
        shake: 0.6,
        buck: 0.5,
        stamp: 0.5,
        toss: 1,
        yawn: 0.7,
        tilt: 0.8,
        sneeze: 0.3,
        dozeOff: 0.4,
        fallOver: 0.2,
        circle: 0.4,
        zoomies: 0.5,
        frontLip: 0.3,
        backWall: 0.3,
      },
      this.moves(),
    );
  }

  protected onEnter() {
    super.onEnter();
    this.puppet.stretch('star', 0, [0, 1, 0], 0);
    this.starAt = -1;
  }

  private moves(): Record<string, Act> {
    const p = () => this.puppet;
    const stand = () => this.standing;
    return {
      // Rears up on her hind legs, front hooves tucked, a whinny, and comes down with a bounce.
      rear: {
        weight: 0,
        length: [3.6, 3.6],
        when: stand,
        pose: (t) => {
          const k = ramp(t, 0, 0.7) * (1 - ramp(t, 2.3, 3.2));
          p().add('body', -48 * k);
          p().add('leg.BL', 48 * k);
          p().add('leg.BR', 48 * k);
          for (const s of ['FL', 'FR']) {
            p().add(`leg.${s}`, -(52 + 6 * sin(t, 2.2, s === 'FL' ? 0 : 0.5)) * k + 48 * k);
            p().add(`shin.${s}`, 80 * k);
          }
          p().add('head', 30 * k);
          this.neckAdd(10 * k);
          this.mouth = 0.5 * pulse(t, 0.9, 1.2);
          this.shine = Math.max(this.shine, k);
          this.emote = 'surprised';
          this.pupils = 1;
          if (t > 3.1 && !this.run.done) {
            this.run.done = true;
            this.hop.kick(1.2 * this.build.spring);
          }
        },
      },
      // High-stepping about the floor, head up, tail up, knees to her chin.
      prance: {
        weight: 0,
        length: [6, 6],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.go([this.somewhere(), this.somewhere()]);
        },
        pose: (t) => {
          this.kneeLift = 78;
          this.boost = 0.75;
          p().add('head', -8);
          p().add('body', -3);
          this.neckAdd(-6);
          p().add('tail.1', -10);
          this.emote = 'happy';
          this.shine = 0.5;
          if (this.walking) this.extraLift = 0.012 * Math.max(0, Math.sin(this.gait * 2));
          if (this.atStop && t > 0.8) this.endAct();
        },
      },
      // Lowers her horn, it blazes, and a little star floats up from the tip and fades.
      cast: {
        weight: 0,
        length: [4.4, 4.4],
        when: () => !this.walking && this.posture !== 'sit',
        start: () => (this.starAt = -1),
        pose: (t) => {
          const k = ramp(t, 0, 0.5) * (1 - ramp(t, 3.8, 4.4));
          // Chin tucked so the horn points at the sky ahead of her, then a toss.
          p().add('head', 14 * k - 24 * pulse(t, 1.1, 0.6));
          this.neckAdd(-6 * k);
          this.glow = k;
          this.shine = k;
          this.emote = 'love';
          this.pupils = 0.9;
          if (t > 1.3 && this.starAt < 0) this.starAt = t;
        },
      },
      // A whinny: head thrown up, mouth open, the mane lighting from the withers to the ears.
      whinny: {
        weight: 0,
        length: [3.2, 3.2],
        when: () => !this.walking && this.posture === 'stand',
        pose: (t) => {
          const k = pulse(t, 0.2, 2.6);
          this.mouth = 0.7 * k * (0.7 + 0.3 * sin(t, 4));
          p().add('head', -28 * k);
          this.neckAdd(-12 * k);
          p().add('body', -4 * k);
          p().add('ear.L', 0, 0, -15 * k);
          p().add('ear.R', 0, 0, 15 * k);
          this.wave = k;
          this.emote = 'happy';
        },
      },
      // The horn and mane shimmer in a slow wave, her head turning to watch it.
      shimmer: {
        weight: 0,
        length: [4, 4],
        when: () => !this.walking,
        pose: (t) => {
          const k = ramp(t, 0, 0.5) * (1 - ramp(t, 3.4, 4));
          this.shine = k;
          this.wave = k;
          p().add('head', 4 * k, 18 * sin(t, 0.4) * k);
          this.emote = 'love';
        },
      },
    };
  }

  protected idle(t: number) {
    this.glow = 0;
    this.shine = 0;
    this.wave = 0;
    super.idle(t);
  }

  protected setAct(name: string) {
    super.setAct(name);
    if (name !== 'cast') this.starAt = -1;
  }

  protected after(dt: number, env: Env) {
    super.after(dt, env);
    const o = this.outfit;
    if (!o) return;
    const time = env.time;
    const asleep = this.mood === 'asleep' || this.posture === 'lie';
    const colour = this.lookName === 'colour';
    // The horn: a slow wave up the rings; brighter and faster when she casts or shimmers.
    const speed = 1.2 + 2.5 * this.shine;
    for (let i = 0; i < RINGS; i++) {
      const w = 0.5 + 0.5 * Math.sin(time * speed - i * 0.75);
      const base = asleep ? 0.12 : 0.3 + 0.3 * w;
      o.dot(
        2 + i,
        clamp(base + 0.7 * this.glow + 0.3 * this.shine * w, 0, 1),
        colour ? RAINBOW[i] : undefined,
      );
    }
    // The mane, a wave the other way.
    for (let i = 0; i < FINS; i++) {
      const w = 0.5 + 0.5 * Math.sin(time * (1 + 3 * this.wave) + i * 0.7);
      const base = asleep ? 0.1 : 0.25 + 0.35 * w;
      o.dot(
        10 + i,
        clamp(base + 0.5 * this.wave * w, 0, 1),
        colour ? RAINBOW[(i + 3) % RAINBOW.length] : undefined,
      );
    }
    o.dot(18, clamp(asleep ? 0.1 : 0.4 + 0.4 * Math.max(0, Math.sin(time * 1.7)) ** 3, 0, 1));
    this.star(dt, env);
    o.beacon(BEACON[this.expression] ?? '#f4f4f1');
  }

  /** The star: from the horn's tip it grows, floats up and drifts, spins and shrinks away. */
  private star(_dt: number, env: Env) {
    const p = this.puppet;
    const o = this.outfit;
    const u = this.starAt < 0 ? -1 : (this.actT - this.starAt) / 2.4;
    if (u < 0 || u > 1) {
      p.stretch('star', 0, [0, 1, 0], 0);
      o?.dot(19, 0);
      return;
    }
    const grow = Math.min(1, u * 5) * (1 - ramp(u, 0.6, 1));
    p.stretch('star', grow, [0, 1, 0], grow);
    p.shift('star', 0.06 * Math.sin(u * 5), 0, 0.02 + 0.5 * u * (2 - u) * 0.7);
    p.turn('star', 0, 360 * u * 1.5, 0);
    o?.dot(19, clamp(1 - 0.5 * u + 0.3 * Math.sin(env.time * 14), 0, 1));
  }
}
