import type { Object3D } from 'three';
import { BEACON } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import type { Anatomy } from './pet';
import { HOOF_ACT_MOODS, Hoofed, hoofFeels, hoofMoods } from './hooves';
import { pulse, ramp } from './kitties';

/**
 * Barley, the robot Highland calf: rusty ginger and shaggy, a barrel hung with long rounded
 * plates and a fringe of long strands over her eyes, in two halves (fringe.L, fringe.R) so she can
 * toss them aside to see; the screen face peeks out between the strands, and her eyes show when
 * she shakes the fringe away, before it falls back. Short wide horn nubs with a lit tip (Dot2).
 * She hops for joy on her short legs, lies down like a hairy rug, sneezes the fringe up in the
 * air, shakes herself like a wet dog and gives a low moo.
 */
export const HIGHLAND_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.3, 0.5],
    [0.7, 0.5],
  ],
  rx: 0.08,
  ry: 0.3,
  line: 0.035,
  mouth: null,
};

const CALF: Anatomy = {
  tail: ['tail.1', 'tail.2'],
  tailAxis: [0, -0.7, -0.7],
  earsHang: true,
  moods: hoofMoods(4),
  actMoods: {
    ...HOOF_ACT_MOODS,
    fringeShake: 'curious',
    hop: 'happy',
    achoo: 'happy',
    wetDog: 'happy',
    moo: 'happy',
    peekaboo: 'curious',
  },
  lying: 'calm',
  hover: 'happy',
  drop: { stand: 0, sit: -0.08, lie: -0.12 },
  sit: -14,
  turn: 48,
};

export class HighlandCalf extends Hoofed {
  protected readonly anatomy = CALF;
  protected readonly build = { middle: 0.4, spring: 0.7, speed: 0.9 };
  /** How far the fringe is swept aside this frame (0..1), set by tricks. */
  private part = 0;
  private lamp = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Barley',
        model: 'highlandcalf',
        metres: 0.72,
        width: 0.75,
        size: 1.05,
        feels: hoofFeels(2, {
          'fringe.L': { f: 2.8, zeta: 0.3 },
          'fringe.R': { f: 2.8, zeta: 0.3 },
          'ear.L': { f: 2.4, zeta: 0.28 },
          'ear.R': { f: 2.4, zeta: 0.28 },
        }),
        face: HIGHLAND_FACE,
        eyes: 0.78,
        gaze: [
          { bone: 'head', yaw: 0.75, pitch: 0.9 },
          { bone: 'body', yaw: 0.13, pitch: 0 },
        ],
        reach: { yaw: 58, pitch: 28 },
        lag: 0.6,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 0.9,
      },
      model,
    );
    this.fold = { front: [-72, 148], back: [-66, 136] };
    this.lieDrop = -0.12;
    this.reach = { head: 62, neck: 0, body: 12 };
    this.knee = 24;
    this.pokeAct = 'fringeShake';
    this.adopt(
      {
        fringeShake: 1.8,
        hop: 1.4,
        achoo: 0.9,
        wetDog: 0.8,
        moo: 0.8,
        peekaboo: 0.8,
        graze: 1,
        chew: 0.6,
        lie: 1.4,
        stand: 2,
        shake: 0.4,
        toss: 0.6,
        yawn: 0.6,
        tilt: 0.8,
        dozeOff: 0.5,
        circle: 0.4,
        zoomies: 0.4,
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
      // Shakes her head so the fringe flies aside: the eyes peek out, and then it falls back.
      fringeShake: {
        weight: 0,
        length: [3.6, 3.6],
        when: () => !this.walking && this.posture !== 'sit',
        start: () => (this.run.dir = Math.random() < 0.5 ? -1 : 1),
        pose: (t) => {
          const d = this.run.dir;
          const a = pulse(t, 0.3, 0.5);
          const b = pulse(t, 1.9, 0.5);
          const toss = Math.max(a, b);
          this.part = toss;
          const side = a > 0 ? d : -d;
          p().add('head', (-10 + 6 * sin(t, 4)) * toss, 14 * side * toss, 12 * side * toss);
          p().add('body', -3 * toss);
          p().add('ear.L', 0, 0, -20 * toss);
          p().add('ear.R', 0, 0, 20 * toss);
          // The eyes get a good look about while the fringe is up.
          this.pupils = 1;
          this.emote = toss > 0 ? 'surprised' : 'happy';
          if (!this.run.done && t > 0.3) {
            this.run.done = true;
            this.hop.kick(0.5 * this.build.spring);
          }
          if (this.run.phase === 0 && t > 1.9) {
            this.run.phase = 1;
            this.hop.kick(0.5 * this.build.spring);
          }
        },
      },
      // A happy hop on short legs, three times, the fringe flopping and the horn lamps lit.
      hop: {
        weight: 0,
        length: [3.4, 3.4],
        when: stand,
        start: () => (this.run.n = 0),
        pose: (t) => {
          const k = ramp(t, 0, 0.2) * (1 - ramp(t, 3, 3.4));
          const beat = 0.8;
          const n = Math.floor(t / beat);
          if (t < 2.7 && n >= this.run.n) {
            this.run.n = n + 1;
            this.hop.kick(2 * this.build.spring);
          }
          const air = Math.max(0, Math.sin((t / beat) * Math.PI)) * k;
          this.frontLegs(-14 * air);
          this.backLegs(12 * air);
          p().add('head', -8 * air, 0, 4 * sin(t, 1.25));
          p().add('ear.L', 0, 0, -26 * air);
          p().add('ear.R', 0, 0, 26 * air);
          p().add('tail.1', -12 * air, 12 * sin(t, 3));
          this.lamp = k;
          this.emote = 'happy';
          this.pupils = 1;
        },
      },
      // A sneeze that sends the fringe up in the air.
      achoo: {
        weight: 0,
        length: [2.8, 2.8],
        when: () => !this.walking,
        pose: (t) => {
          const a = pulse(t, 0.3, 0.5);
          const snap = pulse(t, 0.8, 0.2);
          p().add('head', -18 * a + 34 * snap);
          p().add('body', 9 * snap - 3 * a);
          this.part = snap;
          this.pupils = 1;
          this.emote = snap > 0.2 ? 'surprised' : a > 0.2 ? 'happy' : null;
          if (t > 0.85 && !this.run.done) {
            this.run.done = true;
            this.hop.kick(1.2 * this.build.spring);
            p().kick('fringe.L', -300, 0, 400);
            p().kick('fringe.R', -300, 0, -400);
          }
        },
      },
      // Shakes herself all over like a wet dog: the whole shaggy coat swinging.
      wetDog: {
        weight: 0,
        length: [2.6, 2.6],
        when: stand,
        pose: (t) => {
          const k = ramp(t, 0, 0.15) * (1 - ramp(t, 2, 2.6));
          const w = sin(t, 5.5);
          p().add('root', 0, 14 * k * w, 3 * k * w);
          p().add('body', 0, 12 * k * sin(t, 5.5, 0.12), 6 * k * w);
          p().add('head', 0, 20 * k * sin(t, 5.5, 0.25), 8 * k * w);
          p().add('ear.L', 0, 0, -35 * k * w);
          p().add('ear.R', 0, 0, 35 * k * w);
          p().add('tail.1', 0, 30 * k * w);
          this.part = 0.5 * k * Math.max(0, sin(t, 5.5, 0.3));
          this.emote = 'dizzy';
        },
      },
      // A low moo: head forward and down a touch, mouth open, the fringe swaying.
      moo: {
        weight: 0,
        length: [3.2, 3.2],
        when: () => !this.walking && this.posture !== 'sit',
        pose: (t) => {
          const k = pulse(t, 0.3, 2.2);
          this.mouth = 0.6 * k * (0.7 + 0.3 * sin(t, 3));
          p().add('head', this.posture === 'lie' ? -4 * k : -14 * k, 0, 0);
          p().add('body', -2 * k + 1.2 * k * sin(t, 14));
          p().add('tail.1', 0, 14 * k * sin(t, 3));
          this.lamp = 0.6 * k;
          this.emote = 'happy';
        },
      },
      // Lowers her head so the fringe hangs over her eyes, then flicks it up: peekaboo.
      peekaboo: {
        weight: 0,
        length: [4, 4],
        when: stand,
        pose: (t) => {
          const down = ramp(t, 0, 0.4) * (1 - ramp(t, 2.2, 2.5));
          const up = pulse(t, 2.4, 0.55);
          p().add('head', 30 * down - 16 * up, 0, 5 * sin(t, 0.9));
          this.part = up;
          this.pupils = 1;
          this.emote = t < 2.4 ? 'sleepy' : 'surprised';
          if (t > 2.4 && !this.run.done) {
            this.run.done = true;
            this.hop.kick(0.8 * this.build.spring);
          }
        },
      },
    };
  }

  protected idle(t: number) {
    this.part = 0;
    this.lamp = 0;
    super.idle(t);
    // The fringe stirs a little with her breath.
    this.puppet.add('fringe.L', 0, 0, 2.5 * sin(t, 0.35));
    this.puppet.add('fringe.R', 0, 0, -2.5 * sin(t, 0.35, 0.3));
  }

  protected pose(dt: number, env: Env) {
    super.pose(dt, env);
    const k = clamp(this.part, 0, 1);
    this.puppet.add('fringe.L', -26 * k, 0, 46 * k);
    this.puppet.add('fringe.R', -26 * k, 0, -46 * k);
    // The fringe swings with the head's turns, a beat behind.
    const [, yaw] = this.puppet.current('head');
    this.puppet.add('fringe.L', 0, 0, clamp(-yaw * 0.25, -8, 8));
    this.puppet.add('fringe.R', 0, 0, clamp(-yaw * 0.25, -8, 8));
  }

  protected after(dt: number, env: Env) {
    super.after(dt, env);
    const o = this.outfit;
    if (!o) return;
    const asleep = this.mood === 'asleep' || this.posture === 'lie';
    const glad = this.mood === 'happy' || this.mood === 'love';
    o.dot(
      2,
      clamp(
        (asleep ? 0.1 : 0.3 + 0.1 * Math.sin(env.time * 1.3)) + (glad ? 0.3 : 0) + this.lamp,
        0,
        1,
      ),
    );
    o.beacon(BEACON[this.expression] ?? '#f4f4f1');
  }
}
