import type { Object3D } from 'three';
import { BEACON } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import type { Anatomy, Feeling } from './pet';
import { DOG_ACT_MOODS, dogMoods, Hound } from './dogs';
import { pulse, ramp } from './kitties';

/**
 * Nugget, the robot pug: small and square, a big round head with a flat face and
 * wrinkle seams, goggle rings round big bulging eyes, a tail curled in a loop. He waddles
 * on his short legs, pants a lot and is never quite able to breathe through that nose: he
 * snorts, snuffles and sneezes (his eyes pop when he does), and wheezes a little when he
 * runs.
 *
 * Three of his tricks are his own: the snort fit (three snorts that shake his whole head),
 * the frap (a frenzy of spinning on the spot, from nowhere, that is over as fast as it
 * came), and sitting down to tilt his head to one side and then the other, as if the
 * world made no sense.
 */
export const PUG_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.3, 0.5],
    [0.7, 0.5],
  ],
  rx: 0.1,
  ry: 0.34,
  line: 0.04,
  mouth: null,
};

/** His tail is a tight curl: it wags in small shakes, not wide sweeps. */
function curled(): Anatomy['moods'] {
  const moods = dogMoods(-4);
  for (const f of Object.values(moods)) {
    if (f.wag) f.wag = [f.wag[0] * 0.45, f.wag[1]];
  }
  return moods;
}

const PUG: Anatomy = {
  tail: ['tail.1', 'tail.2', 'tail.3'],
  tailAxis: [0, 0.6, 0.8],
  earsHang: true,
  moods: curled(),
  actMoods: {
    ...DOG_ACT_MOODS,
    snortFit: 'alarmed',
    frap: 'happy',
    sitTilt: 'curious',
    wheeze: 'sleepy',
    snuffle: 'curious',
  },
  lying: 'calm',
  hover: 'happy',
  drop: { stand: 0, sit: -0.055, lie: -0.1 },
  sit: -24,
  turn: 46,
};

export class Pug extends Hound {
  protected readonly anatomy = PUG;
  protected readonly build = { middle: 0.2, spring: 1, speed: 1.2 };
  /** The paw lights: a flash per paw (FL FR BL BR). */
  private paws = [0, 0, 0, 0];
  /** How hard he is snorting this frame, 0..1: the nose lights and the eyes pop. */
  private snort = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Nugget',
        model: 'pug',
        metres: 0.46,
        width: 0.5,
        size: 0.7,
        feels: {
          default: { f: 2.4, zeta: 0.55 },
          root: { f: 3.2, zeta: 0.55 },
          body: { f: 2.2, zeta: 0.6 },
          head: { f: 2, zeta: 0.5, r: 0.3 },
          jaw: { f: 6, zeta: 0.5 },
          'ear.L': { f: 3.2, zeta: 0.25 },
          'ear.R': { f: 3.2, zeta: 0.25 },
          'tail.1': { f: 5, zeta: 0.45 },
          'tail.2': { f: 5.5, zeta: 0.4 },
          'tail.3': { f: 6, zeta: 0.35 },
        },
        face: PUG_FACE,
        eyes: 0.8,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.9 },
          { bone: 'body', yaw: 0.2, pitch: 0 },
        ],
        reach: { yaw: 55, pitch: 28 },
        lag: 0.9,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 1.2,
      },
      model,
    );
    const all = { ...this.tricks(), ...this.doggy() };
    const mine: Record<string, number> = {
      scratch: 0.8,
      sniff: 0.7,
      yip: 0.8,
      playBow: 0.8,
      pant: 1.6,
      yawn: 0.8,
      howl: 0.2,
      dig: 0.5,
      greet: 1,
      chaseFly: 0.8,
      beg: 0.8,
      tailChase: 1.2,
      zoomies: 0.7,
      dozeOff: 1,
      watch: 0.8,
      tilt: 1.4,
      sneeze: 1.8,
      shakeOff: 0.4,
      rollOver: 0.8,
      twirl: 0.8,
      fallOver: 0.4,
    };
    const common = this.commonActs();
    for (const k of ['idle', 'stroll', 'sit', 'nap', 'stand', 'stretch', 'startle'] as const) {
      this.acts[k] = common[k];
    }
    this.acts.lie = { ...common.lie, weight: 1 };
    for (const [name, weight] of Object.entries(mine)) this.acts[name] = { ...all[name], weight };
    this.acts.love = all.love;
    this.acts.dizzy = { ...all.dizzy, weight: 0 };
    Object.assign(this.acts, this.moves());
  }

  private moves(): Record<string, Act> {
    const p = () => this.puppet;
    const stand = () => this.standing;
    return {
      // A fit of snorts: three, each shaking his whole head, eyes popping.
      snortFit: {
        weight: 1.6,
        length: [3.6, 3.6],
        when: () => !this.walking && this.posture !== 'lie',
        start: () => (this.run.n = 0),
        pose: (t) => {
          const at = [0.5, 1.3, 2.4];
          const n = at.filter((a) => t > a).length;
          for (; this.run.n < n; this.run.n++) {
            this.hop.kick(0.5);
            p().kick('head', -260);
            p().kick('ear.L', 0, 0, -220);
            p().kick('ear.R', 0, 0, 220);
          }
          const b = at.reduce((a, x) => a + pulse(t, x, 0.3), 0);
          this.snort = Math.min(1, b);
          p().add('head', 14 * b, 6 * b * sin(t, 20));
          p().add('body', -3 * b);
          this.mouth = 0.08 * b;
          this.pupils = 0.4 + 0.6 * b;
          this.emote = b > 0.2 ? 'surprised' : 'cross';
        },
      },
      // The frap: a frenzy of spinning from nowhere, ears flying, over as fast as it came.
      frap: {
        weight: 1.5,
        length: [2.6, 2.6],
        when: stand,
        start: () => {
          this.spin = 3;
          this.run.n = 0;
        },
        pose: (t) => {
          const k = ramp(t, 0, 0.2) * (1 - ramp(t, 2.2, 2.6));
          const n = Math.floor(t / 0.42);
          if (n >= this.run.n && t < 2.3) {
            this.run.n = n + 1;
            this.hop.kick(1);
          }
          p().add('body', 0, 14 * k * sin(t, 5));
          p().add('head', 4 * k, -10 * k * sin(t, 5), 8 * k);
          p().add('ear.L', 0, 0, -45 * k);
          p().add('ear.R', 0, 0, 45 * k);
          this.twitch(t, 30 * k, 8);
          this.mouth = 0.4 * k;
          this.emote = t > 2.3 ? 'dizzy' : 'happy';
          this.pupils = 1;
          if (t > 2.3) this.rollTarget = 4 * sin(t, 2) * (2.6 - t);
        },
      },
      // Sits and tilts his head one way, then the other, as if it made no sense.
      sitTilt: {
        weight: 1.6,
        length: [6, 6],
        when: () => !this.walking,
        start: () => {
          this.posture = 'sit';
          this.run.dir = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          const side = t < 3 ? this.run.dir : -this.run.dir;
          const k = ramp(t % 3, 0, 0.5) * (1 - ramp(t % 3, 2.5, 3));
          p().add('head', -6 * k, 0, 22 * side * k);
          p().add('ear.L', 0, 0, -10 * k * side);
          p().add('ear.R', 0, 0, -10 * k * side);
          this.pupils = 0.9;
          this.emote = 'neutral';
          if (t > 5.5) this.emote = 'happy';
        },
      },
      // Snuffling along the floor, snorting at things, the flat nose doing its best.
      snuffle: {
        weight: 1,
        length: [5, 5],
        when: stand,
        start: () => {
          this.walkTo(this.s + this.roomy() * this.heightPx * (0.8 + Math.random()));
        },
        pose: (t) => {
          p().add('head', 30 + 4 * sin(t, 7));
          this.boost = 0.6;
          const s = Math.max(0, sin(t, 1.8));
          this.snort = s * s;
          this.mouth = 0.06 * this.snort;
          this.emote = 'focused';
        },
      },
      // Asleep or nearly: a wheezy breath that rattles his flat face.
      wheeze: {
        weight: 0.8,
        length: [6, 6],
        when: () => !this.walking,
        start: () => (this.posture = 'lie'),
        pose: (t) => {
          const b = sin(t, 0.6);
          p().add('head', 3 * b + 1.2 * sin(t, 9));
          p().add('body', 1.5 * b);
          this.mouth = 0.05 + 0.04 * Math.max(0, b);
          this.snort = 0.3 * Math.max(0, b);
          this.emote = 'asleep';
          if (t > 5.4) this.posture = 'stand';
        },
      },
    };
  }

  protected idle(t: number) {
    this.snort = 0;
    this.paws = this.paws.map((v) => v * 0.9);
    super.idle(t);
  }

  protected express(dt: number, env: Env, f: Feeling) {
    super.express(dt, env, f);
    // A waddle: the short legs make the whole body rock from side to side as he goes.
    if (this.walking) {
      const rock = Math.sin(this.gait);
      this.puppet.add('body', 0, 0, 5 * rock);
      this.puppet.add('head', 0, 0, -3 * rock);
    }
  }

  protected after(dt: number, env: Env) {
    super.after(dt, env);
    const moving = clamp(this.stride / (this.heightPx * 0.8), 0, 1);
    [0, 1, 2, 3].forEach((i) => {
      const diag = i === 0 || i === 3 ? 0 : Math.PI;
      const step = Math.max(0, Math.sin(this.gait + diag)) ** 3 * moving;
      const idle = 0.1 + 0.08 * Math.sin(env.time * 1.3 + i * 1.7);
      this.outfit?.dot(i, clamp(Math.max(step, this.paws[i], idle), 0, 1));
    });
    const happy = ['happy', 'love'].includes(this.expression) ? 0.5 : 0;
    this.outfit?.dot(4, clamp(0.3 + 0.3 * Math.sin(env.time * 4) + happy, 0, 1));
    this.outfit?.dot(5, clamp(0.3 + happy * 0.6 + this.snort, 0, 1));
    this.outfit?.beacon(BEACON[this.expression] ?? '#f4f4f1');
  }
}
