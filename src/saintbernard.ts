import type { Object3D } from 'three';
import { BEACON } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import type { Anatomy } from './pet';
import { DOG_ACT_MOODS, dogMoods, Hound } from './dogs';
import { pulse, ramp } from './kitties';

/**
 * Bruno, the robot Saint Bernard: the biggest and heaviest of the dogs, on pillar legs
 * and big paws, with a huge head, heavy sad brows, droopy jowls and a little rescue barrel
 * on his collar. He is slow and calm. He sits down with a thump, lies down with a sigh,
 * ambles where the others trot and takes his time over everything, wags slowly and wide,
 * and now and then shakes himself off all at once with his whole big body.
 *
 * His joke is the drool: he hangs his head, a drop of oil gathers at his lip (it is a
 * robot, so it is oil), swells, lets go, falls and splats on the floor, and he looks down at
 * it and then up, as if it wasn't him. The bung of the barrel takes the colour of his mood.
 */
export const SAINTBERNARD_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.3, 0.5],
    [0.7, 0.5],
  ],
  rx: 0.085,
  ry: 0.3,
  line: 0.04,
  mouth: null,
};

/** How far his lip is below where it is standing, sitting with his head hung (metres). */
const SIT_LIP = -0.15;

/** A slow, wide wag: his moods are the other dogs' with the tail taken down a gear. */
function slow(): Anatomy['moods'] {
  const moods = dogMoods(-4);
  for (const f of Object.values(moods)) {
    if (f.wag) f.wag = [f.wag[0] * 0.8, f.wag[1] * 0.55];
  }
  return moods;
}

const SAINT: Anatomy = {
  tail: ['tail.1', 'tail.2', 'tail.3'],
  tailAxis: [0, 0.8, -0.6],
  earsHang: true,
  moods: slow(),
  actMoods: {
    ...DOG_ACT_MOODS,
    bigShake: 'happy',
    droolDrip: 'sad',
    thumpDown: 'sleepy',
    slowBlink: 'calm',
  },
  lying: 'calm',
  hover: 'happy',
  drop: { stand: 0, sit: -0.1, lie: -0.17 },
  sit: -22,
  turn: 55,
};

export class Saintbernard extends Hound {
  static readonly terms =
    'doggo pooch bernard big huge giant heavy large white cream brown orange red patches droopy jowls sad drool barrel rescue gentle slow';

  protected readonly anatomy = SAINT;
  protected readonly build = { middle: 0.5, spring: 0.45, speed: 0.9 };
  /** The oil drop: 0 gone, 1 swelling at the lip, 2 falling, 3 splatted. */
  private drip = { state: 0, age: 0, y: 0, vy: 0 };

  constructor(model: Object3D) {
    super(
      {
        name: 'Bruno',
        model: 'saintbernard',
        metres: 0.95,
        width: 0.9,
        size: 1.35,
        feels: {
          default: { f: 1.6, zeta: 0.65 },
          root: { f: 2.2, zeta: 0.65 },
          body: { f: 1.5, zeta: 0.7 },
          head: { f: 1.4, zeta: 0.55, r: 0.3 },
          jaw: { f: 5, zeta: 0.55 },
          'ear.L': { f: 2.2, zeta: 0.22 },
          'ear.R': { f: 2.2, zeta: 0.22 },
          'tail.1': { f: 3, zeta: 0.45 },
          'tail.2': { f: 3.4, zeta: 0.35 },
          'tail.3': { f: 3.8, zeta: 0.3 },
        },
        face: SAINTBERNARD_FACE,
        eyes: 0.7,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.9 },
          { bone: 'body', yaw: 0.15, pitch: 0 },
        ],
        reach: { yaw: 55, pitch: 25 },
        lag: 1.4,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [50, 110],
        speed: 0.9,
      },
      model,
    );
    const all = { ...this.tricks(), ...this.doggy() };
    const mine: Record<string, number> = {
      scratch: 0.7,
      sniff: 0.8,
      yip: 0.1,
      playBow: 0.5,
      pant: 0.9,
      yawn: 1.4,
      howl: 0.6,
      dig: 0.5,
      greet: 1,
      chaseFly: 0.4,
      beg: 0.6,
      tailChase: 0.1,
      zoomies: 0.1,
      dozeOff: 1,
      watch: 1,
      tilt: 1,
      sneeze: 0.4,
      shakeOff: 0.2,
      rollOver: 0.2,
      backWall: 0.3,
      frontLip: 0.3,
    };
    const common = this.commonActs();
    for (const k of ['idle', 'stroll', 'sit', 'nap', 'stand', 'stretch', 'startle'] as const) {
      this.acts[k] = common[k];
    }
    this.acts.sit = { ...common.sit, weight: 4 };
    this.acts.lie = { ...common.lie, weight: 1.6 };
    this.acts.nap = { ...common.nap, weight: 2.4 };
    for (const [name, weight] of Object.entries(mine)) this.acts[name] = { ...all[name], weight };
    this.acts.love = all.love;
    this.acts.dizzy = { ...all.dizzy, weight: 0 };
    Object.assign(this.acts, this.moves());
  }

  private moves(): Record<string, Act> {
    const p = () => this.puppet;
    const stand = () => this.standing;
    return {
      // The big shake-off: the whole barrel of him shakes, ears and jowls flying.
      bigShake: {
        weight: 1.3,
        length: [3.4, 3.4],
        when: stand,
        pose: (t) => {
          const k = ramp(t, 0.2, 0.5) * (1 - ramp(t, 2.6, 3.3));
          const w = sin(t, 4.2);
          p().add('root', 0, 22 * k * w);
          p().add('body', 0, 0, 5 * k * sin(t, 4.2, 0.25));
          p().add('head', 0, -28 * k * w, 8 * k * sin(t, 4.2, 0.25));
          p().add('ear.L', 0, 0, -55 * k * w);
          p().add('ear.R', 0, 0, 55 * k * w);
          p().add('tail.1', 0, 25 * k * sin(t, 4.2, 0.5));
          this.mouth = 0.25 * k;
          if (this.run.n < 3 && t > 0.5 + this.run.n * 0.75) {
            this.run.n++;
            this.hop.kick(0.5);
          }
          this.emote = k > 0.2 ? 'dizzy' : 'happy';
        },
      },
      // The drool: head hangs, a drop of oil swells at the lip, falls and splats. Who, him?
      droolDrip: {
        weight: 1.4,
        length: [10, 10],
        when: () => !this.walking && this.posture !== 'lie',
        start: () => {
          this.posture = 'sit';
          this.drip = { state: 0, age: 0, y: 0, vy: 0 };
        },
        pose: (t) => {
          const d = this.drip;
          const k = ramp(t, 0, 0.8);
          p().add('head', 16 * k, 0, 0);
          this.mouth = 0.14 * k;
          this.emote = 'sad';
          this.pupils = 0.6;
          if (t > 0.9 && this.run.phase === 0) {
            this.run.phase = 1;
            this.drip = { state: 1, age: 0, y: 0, vy: 0 };
          }
          if (d.state >= 2) {
            // Eyes and head follow it down, then up at us.
            const look = 1 - ramp(t, 6.2, 6.8);
            p().add('head', 22 * look);
            this.eyes = { x: 0, y: 0.9 * look - 0.1 };
            if (t > 6.8) {
              this.emote = 'neutral';
              p().add('head', -6);
              this.pupils = 0.4;
            }
          }
          if (t > 8.2) this.emote = 'happy';
        },
      },
      // Lets his weight go: lies down with a thump and a long sigh.
      thumpDown: {
        weight: 1.2,
        length: [6, 6],
        when: () => !this.walking && this.posture !== 'lie',
        start: () => (this.posture = 'lie'),
        pose: (t) => {
          if (t > 0.45 && !this.run.done) {
            this.run.done = true;
            this.hop.kick(0.6);
            p().kick('head', 120);
            p().kick('ear.L', 0, 0, -200);
            p().kick('ear.R', 0, 0, 200);
          }
          const sigh = pulse(t, 1.2, 2.2);
          this.mouth = 0.2 * sigh;
          p().add('head', 6 * sigh);
          this.emote = sigh > 0.2 ? 'sleepy' : 'neutral';
          if (t > 5.4) this.posture = 'stand';
        },
      },
      // Heavy eyelids: a very slow blink, looking at you.
      slowBlink: {
        weight: 1,
        length: [3.6, 3.6],
        when: () => !this.walking,
        pose: (t) => {
          this.emote = t > 1 && t < 2.1 ? 'asleep' : 'neutral';
          p().add('head', -4);
          this.pupils = 0.5;
        },
      },
    };
  }

  protected setAct(name: string) {
    this.drip.state = 0;
    super.setAct(name);
  }

  protected after(dt: number, env: Env) {
    super.after(dt, env);
    this.dropFalls(dt);
    // The lights on the big paws light as each lands; the bung says how he feels.
    const moving = clamp(this.stride / (this.heightPx * 0.8), 0, 1);
    [0, 1, 2, 3].forEach((i) => {
      const diag = i === 0 || i === 3 ? 0 : Math.PI;
      const step = Math.max(0, Math.sin(this.gait + diag)) ** 3 * moving;
      const idle = 0.12 + 0.08 * Math.sin(env.time * 1.1 + i * 1.7);
      this.outfit?.dot(i, clamp(Math.max(step, idle), 0, 1));
    });
    const happy = ['happy', 'love'].includes(this.expression) ? 0.5 : 0;
    this.outfit?.dot(4, clamp(0.3 + 0.3 * Math.sin(env.time * 3) + happy, 0, 1));
    this.outfit?.dot(5, clamp(0.35 + happy * 0.8, 0, 1));
    this.outfit?.beacon(BEACON[this.expression] ?? '#f4f4f1');
  }

  /** The drop of oil: swells, falls under gravity, splats, goes. Steps by real time. */
  private dropFalls(dt: number) {
    const d = this.drip;
    const p = this.puppet;
    let along = 0;
    let across = 0;
    if (d.state === 1) {
      d.age += dt;
      const k = ramp(d.age, 0, 2.2);
      along = across = k * (1 + 0.15 * Math.sin(d.age * 6) * k);
      along *= 1 + 0.35 * ramp(d.age, 1.4, 2.2);
      if (d.age > 2.3) {
        d.state = 2;
        d.age = 0;
        d.vy = 0;
        d.y = SIT_LIP;
      }
    } else if (d.state === 2) {
      d.vy -= 2.5 * dt;
      d.y += d.vy * dt;
      along = 1.3;
      across = 0.8;
      if (d.y < -0.58) {
        d.y = -0.58;
        d.state = 3;
        d.age = 0;
      }
    } else if (d.state === 3) {
      d.age += dt;
      const k = ramp(d.age, 0.8, 1.8);
      along = 0.25 * (1 - k);
      across = 1.6 * (1 - k);
      if (d.age > 1.8) d.state = 0;
    }
    if (d.state === 0 || along <= 0.001) {
      p.stretch('drop', 0, [0, 1, 0], 0);
      return;
    }
    p.stretch('drop', along, [0, 1, 0], across);
    p.shift('drop', 0, d.state === 1 ? SIT_LIP - 0.015 * ramp(d.age, 0, 2.2) : d.y, 0);
  }
}
