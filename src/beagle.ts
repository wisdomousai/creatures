import type { Object3D } from 'three';
import { BEACON } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import type { Anatomy, Feeling } from './pet';
import { DOG_ACT_MOODS, dogMoods, Hound } from './dogs';
import { pulse, ramp } from './kitties';

/**
 * Penny, the robot beagle puppy: a big head, long floppy ears that nearly reach the floor,
 * paws too big for her and a thin tail up like a flag with a white tip. Her nose is always
 * down. She walks with her muzzle an inch from the floor, following a scent only she can
 * smell, zigzagging across the floor, her nose glowing as it gets stronger, stopping dead
 * to check it and then off again, until she finds the end of it and throws her head back
 * and bays ("aroo"). She is clumsy: she trots happily along and steps on her own ear,
 * which pulls her up short and sends her nose first into the floor.
 *
 * Her toes light as they land and the tag on her collar takes the colour of her mood.
 */
export const BEAGLE_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.29, 0.5],
    [0.71, 0.5],
  ],
  rx: 0.1,
  ry: 0.33,
  line: 0.036,
  mouth: null,
};

const BEAGLE: Anatomy = {
  tail: ['tail.1', 'tail.2', 'tail.3'],
  tailAxis: [0, 0.3, 0.95],
  earsHang: true,
  moods: dogMoods(12),
  actMoods: {
    ...DOG_ACT_MOODS,
    scentTrail: 'curious',
    bay: 'happy',
    earTrip: 'alarmed',
    nosePoint: 'curious',
    earFlap: 'happy',
  },
  lying: 'calm',
  hover: 'love',
  drop: { stand: 0, sit: -0.1, lie: -0.12 },
  sit: -26,
  turn: 44,
};

export class Beagle extends Hound {
  protected readonly anatomy = BEAGLE;
  protected readonly build = { middle: 0.2, spring: 1.3, speed: 1.5 };
  /** The toe lights: a flash per paw (FL FR BL BR). */
  private toes = [0, 0, 0, 0];
  /** How strong the scent is, 0..1 (the nose glows with it), and how far her head is held up. */
  private scent = 0;
  private lift = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Penny',
        model: 'beagle',
        metres: 0.46,
        width: 0.5,
        size: 0.8,
        feels: {
          default: { f: 2.3, zeta: 0.5 },
          root: { f: 3, zeta: 0.55 },
          body: { f: 2, zeta: 0.6 },
          head: { f: 1.9, zeta: 0.5, r: 0.3 },
          jaw: { f: 6, zeta: 0.5 },
          'ear.L': { f: 2.4, zeta: 0.16 },
          'ear.R': { f: 2.4, zeta: 0.16 },
          'tail.1': { f: 5, zeta: 0.4 },
          'tail.2': { f: 5.5, zeta: 0.35 },
          'tail.3': { f: 6, zeta: 0.3 },
        },
        face: BEAGLE_FACE,
        eyes: 0.72,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.6 },
          { bone: 'body', yaw: 0.2, pitch: 0 },
        ],
        reach: { yaw: 60, pitch: 30 },
        lag: 1,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 1.5,
      },
      model,
    );
    const all = { ...this.tricks(), ...this.doggy() };
    const mine: Record<string, number> = {
      scratch: 0.8,
      sniff: 1.4,
      yip: 0.8,
      playBow: 1.2,
      pant: 0.8,
      yawn: 0.6,
      dig: 1,
      greet: 1,
      chaseFly: 0.5,
      beg: 0.8,
      tailChase: 1.2,
      zoomies: 1.2,
      dozeOff: 1,
      watch: 0.6,
      tilt: 0.8,
      sneeze: 0.5,
      shakeOff: 0.8,
      rollOver: 1,
      twirl: 0.8,
      fallOver: 0.5,
      circle: 0.5,
    };
    const common = this.commonActs();
    for (const k of ['idle', 'stroll', 'sit', 'nap', 'stand', 'stretch', 'startle'] as const) {
      this.acts[k] = common[k];
    }
    this.acts.lie = { ...common.lie, weight: 0.6 };
    for (const [name, weight] of Object.entries(mine)) this.acts[name] = { ...all[name], weight };
    this.acts.love = all.love;
    this.acts.dizzy = { ...all.dizzy, weight: 0 };
    Object.assign(this.acts, this.moves());
  }

  private moves(): Record<string, Act> {
    const p = () => this.puppet;
    const stand = () => this.standing;
    return {
      // Follows a scent trail only she can smell: nose to the floor, zigzagging, stopping
      // dead to check it, off again, until she finds the end of it and bays.
      scentTrail: {
        weight: 2.2,
        length: [14, 14],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.run.phase = 0;
          this.run.n = 0;
          this.go([this.somewhere(), this.somewhere(), this.somewhere()]);
        },
        pose: (t) => {
          const r = this.run;
          if (r.phase === 0) {
            // Following it: slow, nose down, weaving from side to side.
            this.boost = 0.55;
            this.scent = 0.5 + 0.4 * ramp(t % 4, 0, 4);
            p().add('head', 20 + 5 * sin(t, 6), 14 * sin(t, 1.3));
            p().add('body', 5);
            p().add('root', 0, 6 * sin(t, 1.3));
            this.twitch(t, 10, 5);
            this.emote = 'focused';
            this.pupils = 0.9;
            // A stop to check it (once or twice): freeze, nose working.
            if (r.n < 2 && t > 3 + r.n * 3.5 && t < 4.4 + r.n * 3.5) {
              this.boost = 0;
              this.scent = 1;
              p().add('head', 6 * sin(t, 10));
              this.mouth = 0.04 + 0.04 * sin(t, 9);
              if (t > 4.3 + r.n * 3.5) r.n++;
            }
            if (this.atStop && t > 2) {
              r.phase = 1;
              r.at = t;
            }
            if (t > 11) {
              r.phase = 1;
              r.at = t;
            }
          } else {
            // Found it: freezes, head up, and bays.
            const w = t - r.at;
            this.goal = null;
            this.scent = 1;
            const up = ramp(w, 0.3, 1.1) * (1 - ramp(w, 2.3, 2.7));
            this.lift = up;
            p().add('head', -50 * up);
            this.mouth = 0.5 * up * (0.8 + 0.2 * sin(w, 5));
            this.emote = 'happy';
            this.eyes = { x: 0, y: -1 };
            this.pupils = 1;
            if (w > 3) this.endAct();
          }
        },
      },
      // "Aroo": sits, head back and up, a long baying howl that climbs, twice.
      bay: {
        weight: 1.4,
        length: [7, 7],
        when: () => !this.walking,
        start: () => (this.posture = 'sit'),
        pose: (t) => {
          const one = (a: number) => ramp(t, a, a + 0.5) * (1 - ramp(t, a + 2.2, a + 2.7));
          const k = Math.max(one(0.4), one(3.9));
          const climb = t < 3.4 ? ramp(t, 0.4, 2.6) : ramp(t, 3.9, 6.1);
          p().add('head', -30 * k - 22 * k * climb);
          this.mouth = 0.3 * k + 0.35 * k * climb * (0.85 + 0.15 * sin(t, 6));
          p().add('body', -4 * k);
          p().add('tail.1', 0, 6 * sin(t, 2));
          this.scent = 0.5 * k;
          this.emote = 'happy';
          this.eyes = { x: 0, y: -1 * k };
          if (t > 6.5) this.emote = 'neutral';
        },
      },
      // Trots along, treads on her own ear, is pulled up short and goes nose first.
      earTrip: {
        weight: 1.8,
        length: [7, 7],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.run.dir = this.roomy();
          this.walkTo(this.s + this.run.dir * this.heightPx * 3, this.depth);
        },
        pose: (t) => {
          const r = this.run;
          if (t < 1.3) {
            this.boost = 1.4;
            this.emote = 'happy';
            this.mouth = 0.25;
            // Ears swinging out ahead of her feet.
            const e = ramp(t, 0.6, 1.3);
            p().add('ear.L', -50 * e);
            p().add('ear.R', -50 * e);
          } else if (t < 3.6) {
            if (!r.done) {
              r.done = true;
              this.goal = null;
              this.hop.kick(1.5);
              p().kick('body', 300);
              p().kick('head', 380);
            }
            const k = ramp(t, 1.3, 1.5);
            // Both ears under the front paws; nose in the floor.
            p().add('ear.L', -80 * k);
            p().add('ear.R', -80 * k);
            p().add('body', 32 * k);
            this.frontLegs(-70 * k);
            p().add('leg.BL', -10 * k);
            p().add('leg.BR', -10 * k);
            p().add('head', 14 * k);
            this.extraLift = -0.03 * k;
            this.emote = t < 2.2 ? 'surprised' : 'dizzy';
            this.pupils = 1;
            this.flash(1);
          } else if (t < 5) {
            // Shakes it off, ears flapping like flags.
            const k = pulse(t, 3.6, 1.4);
            p().add('head', 0, 34 * k * sin(t, 4.5));
            p().add('ear.L', 0, 0, -50 * k * sin(t, 4.5));
            p().add('ear.R', 0, 0, 50 * k * sin(t, 4.5));
            this.emote = 'happy';
          } else {
            // A look at the ear that did it.
            p().add('head', 6, this.run.dir * 36 * ramp(t, 5, 5.5) * (t < 6.2 ? 1 : 0.3));
            p().add('ear.L', -20, 0, 10);
            this.emote = 'cross';
          }
        },
      },
      // Freezes with one forepaw up and her whole body pointing along her nose.
      nosePoint: {
        weight: 1,
        length: [4.2, 4.2],
        when: stand,
        start: () => (this.run.dir = Math.random() < 0.5 ? -1 : 1),
        pose: (t) => {
          const k = ramp(t, 0, 0.4) * (1 - ramp(t, 3.6, 4.2));
          p().add('body', 8 * k);
          p().add('leg.FL', -60 * k);
          p().add('head', 14 * k, 30 * this.run.dir * k);
          p().add('tail.1', 14 * k);
          this.scent = k;
          this.emote = 'focused';
          this.pupils = 1;
        },
      },
      // Shakes her head so the long ears slap her cheeks.
      earFlap: {
        weight: 1.2,
        length: [2.6, 2.6],
        when: () => !this.walking,
        pose: (t) => {
          const k = pulse(t, 0.2, 2);
          p().add('head', 0, 38 * k * sin(t, 6));
          p().add('ear.L', 0, 0, -60 * k * sin(t, 6));
          p().add('ear.R', 0, 0, 60 * k * sin(t, 6));
          this.mouth = 0.2 * k;
          this.emote = k > 0.2 ? 'dizzy' : 'happy';
        },
      },
    };
  }

  private flash(v: number) {
    this.toes.fill(Math.max(v, 0));
  }

  protected idle(t: number) {
    this.scent = 0;
    this.lift = 0;
    this.toes = this.toes.map((v) => v * 0.9);
    super.idle(t);
  }

  protected express(dt: number, env: Env, f: Feeling) {
    super.express(dt, env, f);
    // Her nose is always down: a little when standing, more on the move, none when it is up.
    const down = (this.walking ? 20 : 11) * (1 - this.lift);
    this.puppet.add('head', down + 2 * Math.sin(env.time * 2.1));
    // The nose twitches as the scent gets stronger.
    if (this.scent > 0.2) this.puppet.add('head', 1.5 * this.scent * Math.sin(env.time * 22));
  }

  protected after(dt: number, env: Env) {
    super.after(dt, env);
    const moving = clamp(this.stride / (this.heightPx * 0.8), 0, 1);
    [0, 1, 2, 3].forEach((i) => {
      const diag = i === 0 || i === 3 ? 0 : Math.PI;
      const step = Math.max(0, Math.sin(this.gait + diag)) ** 3 * moving;
      const idle = 0.12 + 0.08 * Math.sin(env.time * 1.3 + i * 1.7);
      this.outfit?.dot(i, clamp(Math.max(step, this.toes[i], idle), 0, 1));
    });
    const happy = ['happy', 'love'].includes(this.expression) ? 0.5 : 0;
    this.outfit?.dot(4, clamp(0.3 + 0.3 * Math.sin(env.time * 4) + happy, 0, 1));
    this.outfit?.dot(
      5,
      clamp(0.3 + happy * 0.4 + this.scent * (0.7 + 0.3 * Math.sin(env.time * 9)), 0, 1),
    );
    this.outfit?.beacon(BEACON[this.expression] ?? '#f4f4f1');
  }
}
