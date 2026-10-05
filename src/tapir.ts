import type { Object3D } from 'three';
import { BEACON } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { HOOF_ACT_MOODS, Hoofed, hoofFeels, hoofMoods } from './hooves';
import { pulse, ramp } from './kitties';
import { sin } from './moves';
import type { Anatomy } from './pet';

/**
 * Snoot, the robot baby tapir: a round barrel on short legs in the baby's watermelon pattern
 * (rows of lit dashes along her sides and spine, cream spots between), a wedge head with a
 * screen face, small round ears, and a short bendy snout in three segments on ball joints with a
 * lit tip. She is a hoofed animal (hooves.ts); the snout does most of the talking.
 *
 * Her own tricks: sniffing along the floor with the snout curling and wiggling, a snout curled
 * up like a question mark, a wiggle (the snout going side to side while she tilts her head), a
 * roll in a mud puddle of light (over on her back, legs kicking, the stripes shimmering), a
 * sudden happy trot with the snout bobbing, a shimmer of the stripe lights running over her back
 * and a snout-in-the-air snuffle. A poke makes her snout shoot up; three make her dizzy.
 */
export const TAPIR_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.29, 0.5],
    [0.71, 0.5],
  ],
  rx: 0.09,
  ry: 0.28,
  line: 0.04,
  mouth: null,
};

const SNOUT = ['snout.1', 'snout.2', 'snout.3'] as const;

const TAPIR: Anatomy = {
  tail: ['tail.1', 'tail.2'],
  tailAxis: [0, -0.7, -0.7],
  earsHang: false,
  moods: hoofMoods(2),
  actMoods: {
    ...HOOF_ACT_MOODS,
    sniff: 'curious',
    snoutCurl: 'curious',
    wiggle: 'happy',
    mudRoll: 'happy',
    trot: 'happy',
    shimmer: 'happy',
    snuffle: 'curious',
    poked: 'alarmed',
  },
  lying: 'calm',
  hover: 'happy',
  drop: { stand: 0, sit: -0.1, lie: -0.13 },
  sit: -12,
  turn: 50,
};

export class Tapir extends Hoofed {
  static readonly terms =
    'calf brown cream tan white spots stripes striped spotted watermelon snout trunk nose short bendy sniff mud trot jungle small round';

  protected readonly anatomy = TAPIR;
  protected readonly build = { middle: 0.28, spring: 0.7, speed: 1 };
  /** Snout turns this frame (pitch for each segment, degrees; - lifts it), and its wiggle. */
  private snout: [number, number, number] = [0, 0, 0];
  private wag = 0;
  /** The stripe lights an act wants: a function of (row 0..3, time), else a gentle glow. */
  private lights: ((row: number, t: number) => number) | null = null;

  constructor(model: Object3D) {
    const sn = (f: number) => ({ f, zeta: 0.4 });
    super(
      {
        name: 'Snoot',
        model: 'tapir',
        metres: 0.46,
        width: 0.8,
        size: 1.0,
        feels: hoofFeels(2, {
          'snout.1': sn(3),
          'snout.2': sn(3.5),
          'snout.3': sn(4),
          'ear.L': { f: 3, zeta: 0.3 },
          'ear.R': { f: 3, zeta: 0.3 },
        }),
        face: TAPIR_FACE,
        eyes: 0.8,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.9 },
          { bone: 'body', yaw: 0.15, pitch: 0 },
        ],
        reach: { yaw: 55, pitch: 28 },
        lag: 0.9,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 0.9,
      },
      model,
    );
    this.fold = { front: [-70, 140], back: [-62, 125] };
    this.lieDrop = -0.13;
    this.reach = { head: 52, neck: 0, body: 8 };
    this.knee = 24;
    this.pokeAct = 'poked';
    this.adopt(
      {
        sniff: 2,
        snoutCurl: 1.4,
        wiggle: 1.5,
        mudRoll: 1,
        trot: 1.4,
        shimmer: 1.2,
        snuffle: 1.2,
        graze: 1.2,
        chew: 0.6,
        lie: 0.7,
        stand: 2,
        shake: 0.8,
        stamp: 0.5,
        toss: 0.6,
        yawn: 0.8,
        tilt: 1,
        sneeze: 0.8,
        dozeOff: 0.6,
        circle: 0.5,
        watch: 0.8,
        zoomies: 0.5,
        fallOver: 0.4,
      },
      this.moves(),
      ['idle', 'stroll', 'nap', 'stretch', 'startle', 'sit'],
    );
  }

  /** Snout helpers for the acts. */
  private tipUp(pitch: number[], k = 1) {
    for (let i = 0; i < 3; i++) this.snout[i] += (pitch[i] ?? 0) * k;
  }

  private moves(): Record<string, Act> {
    const p = () => this.puppet;
    const stand = () => this.standing;
    const still = () => this.still;
    return {
      // Startled: the snout shoots straight up, ears back, a hop.
      poked: {
        weight: 0,
        length: [2, 2],
        start: () => {
          this.posture = 'stand';
          this.hop.kick(1.5);
        },
        pose: (t) => {
          const k = pulse(t, 0, 1.6);
          this.tipUp([-35, -35, -30], Math.min(1, k * 1.5));
          p().add('head', -10 * k);
          p().add('ear.L', 0, 0, 24 * k);
          p().add('ear.R', 0, 0, -24 * k);
          this.lights = (_r, s) => (s % 0.3 < 0.15 ? 1 : 0.3);
          this.emote = 'surprised';
        },
      },
      // Snout down: sniffs along the floor, curling and wiggling, a few steps along it.
      sniff: {
        weight: 0,
        length: [7, 7],
        when: stand,
        start: () => {
          this.run.dir = this.roomy();
        },
        pose: (t) => {
          const k = ramp(t, 0, 0.8) * (1 - ramp(t, 6.2, 7));
          p().add('head', 22 * k);
          p().add('body', 5 * k);
          this.tipUp([14, 6, -4], k);
          const s = Math.max(0, sin(t, 3.4));
          this.tipUp([-14 * s, -20 * s, -24 * s], k);
          this.wag = 14 * k * sin(t, 1.1);
          p().add('head', 0, 14 * k * sin(t, 0.8));
          if (t > 2 && t < 4) {
            this.walkTo(this.s + this.run.dir * this.heightPx * 0.4, this.depth);
            this.boost = 0.35;
          }
          this.lights = (r, s2) => 0.3 + 0.7 * Math.max(0, Math.sin(s2 * 3.4 - r * 0.6));
          this.eyes = null;
          this.emote = 'neutral';
        },
      },
      // The snout curled up over her face like a question mark, and a look at it.
      snoutCurl: {
        weight: 0,
        length: [5, 5],
        when: still,
        pose: (t) => {
          const k = ramp(t, 0, 1.1) * (1 - ramp(t, 4.1, 5));
          this.tipUp([-30, -48, -62], k);
          p().add('head', 10 * k);
          this.wag = 6 * k * sin(t, 1.3);
          this.emote = t > 1.4 && t < 4 ? 'cross' : 'happy';
          this.pupils = 0.9;
        },
      },
      // The snout wiggles from side to side like a metronome, head tilting with it.
      wiggle: {
        weight: 0,
        length: [4, 4],
        when: still,
        pose: (t) => {
          const k = ramp(t, 0, 0.4) * (1 - ramp(t, 3.4, 4));
          this.tipUp([-12, -10, -6], k);
          this.wag = 40 * k * sin(t, 2.4);
          p().add('head', 0, 0, 8 * k * sin(t, 1.2));
          p().add('ear.L', 0, 0, -10 * k * Math.abs(sin(t, 1.2)));
          p().add('ear.R', 0, 0, 10 * k * Math.abs(sin(t, 1.2)));
          this.lights = (r, s) => (Math.sin(s * 7 - r) > 0 ? 1 : 0.2);
          this.emote = 'happy';
        },
      },
      // Over on her back in the mud puddle of light, legs kicking, stripes shimmering.
      mudRoll: {
        weight: 0,
        length: [8.5, 8.5],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.run.dir = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          const d = this.run.dir;
          if (t < 1) {
            this.rollTarget = d * 10 * ramp(t, 0, 1);
            p().add('head', 14 * ramp(t, 0, 0.8));
            this.emote = 'happy';
          } else if (t < 6.8) {
            this.rollTarget = d * 168;
            const w = ramp(t, 1.8, 2.4);
            p().add('leg.FL', -26 * w * sin(t, 1.1));
            p().add('leg.FR', -26 * w * sin(t, 1.1, 0.5));
            p().add('leg.BL', 22 * w * sin(t, 1.1, 0.25));
            p().add('leg.BR', 22 * w * sin(t, 1.1, 0.75));
            p().add('shin.FL', 28 * w);
            p().add('shin.FR', 28 * w);
            p().add('head', 0, 18 * sin(t, 0.5), 6 * sin(t, 0.8));
            this.tipUp([-20, -20, -14], w);
            this.wag = 20 * w * sin(t, 0.9);
            this.emote = 'happy';
            this.lights = (r, s) => 0.4 + 0.6 * Math.max(0, Math.sin(s * 5 - r * 1.1));
          } else {
            this.rollTarget = 0;
            if (!this.run.done) {
              this.run.done = true;
              this.hop.kick(1);
            }
            this.emote = 'surprised';
            p().add('head', 0, 20 * sin(t, 0.9) * (1 - ramp(t, 7.4, 8.4)));
          }
        },
      },
      // A sudden happy trot: a quick dash along the floor, snout bobbing, tail up.
      trot: {
        weight: 0,
        length: [5, 5],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.go([this.somewhere(), this.somewhere()]);
        },
        pose: (t) => {
          this.boost = 2.2;
          this.kneeLift = 50;
          p().add('body', -4);
          this.tipUp([-18, -14, -10], 1);
          this.wag = 14 * sin(t, 2.4);
          p().add('tail.1', -20);
          p().add('ear.L', 0, 0, -10);
          p().add('ear.R', 0, 0, 10);
          this.lights = (r, s) => 0.4 + 0.6 * Math.max(0, Math.sin(s * 9 - r));
          this.emote = 'happy';
          this.pupils = 1;
          if (this.atStop && t > 0.8) this.endAct();
        },
      },
      // Her stripes run with light, from the tail to the head and again, faster each time.
      shimmer: {
        weight: 0,
        length: [4.5, 4.5],
        when: still,
        pose: (t) => {
          const k = ramp(t, 0, 0.4) * (1 - ramp(t, 4, 4.5));
          this.lights = (r, s) =>
            0.1 + 0.9 * Math.max(0, Math.cos(s * (3 + s * 0.6) - r * 0.9)) * k;
          p().add('head', -4 * k, 10 * sin(t, 0.4) * k);
          this.tipUp([-8, -6, -4], k);
          this.emote = 'happy';
        },
      },
      // Snout held high, snuffling at the air, turning to catch the scent.
      snuffle: {
        weight: 0,
        length: [5, 5],
        when: still,
        pose: (t) => {
          const k = ramp(t, 0, 0.8) * (1 - ramp(t, 4.2, 5));
          this.tipUp([-34, -30, -22], k);
          this.tipUp([0, -10 * Math.max(0, sin(t, 4)), -14 * Math.max(0, sin(t, 4))], k);
          p().add('head', -14 * k, 26 * sin(t, 0.35) * k);
          p().add('body', -3 * k);
          this.wag = 10 * k * sin(t, 4);
          this.emote = 'neutral';
          this.pupils = 0.7;
        },
      },
    };
  }

  protected idle(t: number) {
    this.snout = [0, 0, 0];
    this.wag = 0;
    this.lights = null;
    super.idle(t);
    // The snout sways a little, and droops, as it does at rest.
    this.tipUp([3 + 2 * sin(t, 0.2), 3 + 2 * sin(t, 0.2, 0.1), 2 * sin(t, 0.2, 0.2)]);
  }

  protected pose(dt: number, env: Env) {
    super.pose(dt, env);
    const p = this.puppet;
    const moving = clamp(this.stride / (this.heightPx * 0.8), 0, 1);
    // Walking: the snout swings a little, ears bob; a happy mouse resting on her lifts it.
    const g = this.gait;
    if (this.mood === 'happy' || this.mood === 'love') {
      if (this.act === 'idle' || this.act === 'stroll') this.tipUp([-18, -14, -10]);
    }
    for (let i = 0; i < 3; i++) {
      p.add(SNOUT[i], this.snout[i] - 3 * moving * (i + 1) * Math.cos(g * 2), 0, 0);
      p.add(SNOUT[i], 0, this.wag * (0.4 + 0.3 * i) + 4 * moving * (i + 1) * Math.sin(g), 0);
    }
  }

  protected after(dt: number, env: Env) {
    super.after(dt, env);
    const o = this.outfit;
    if (!o) return;
    const t = env.time;
    const asleep = this.mood === 'asleep' || this.posture === 'lie';
    const tone = this.mood === 'calm' ? undefined : BEACON[this.expression];
    for (let r = 0; r < 4; r++) {
      const base = asleep ? 0.12 : 0.3 + 0.15 * Math.sin(t * 1.1 - r * 0.8);
      o.dot(
        2 + r,
        clamp(this.lights ? this.lights(r, t) : base, 0, 1),
        this.lights ? undefined : tone,
      );
    }
    const lift = clamp(-this.puppet.current('snout.2')[0] / 40, 0, 1);
    o.dot(6, asleep ? 0.12 : clamp(0.4 + 0.25 * Math.sin(t * 1.6) + 0.5 * lift, 0, 1), tone);
    o.beacon(BEACON[this.expression] ?? '#f4f4f1');
  }
}
