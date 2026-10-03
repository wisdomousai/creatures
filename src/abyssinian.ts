import type { Object3D } from 'three';
import { type Act, clamp } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import type { Anatomy } from './pet';
import { pulse, ramp } from './kitties';
import { adultMoods, CAT_ACT_MOODS, Moggy } from './moggy';

/**
 * Tansy, the robot Abyssinian: slender and lithe, on long thin legs with a long thin tail, a
 * small head under very large ears, and a ticked coat of fine dark bands all over her. She
 * is endlessly curious and never still for long: she stands up tall on her hind legs to look
 * about, tilts her head in a quick double flick, scouts across the floor in short darts
 * with a freeze and a look between each, sweeps her great ears about like radar, peers over
 * the front lip and from the back wall, and pounces on whatever she finds.
 */
export const ABYSSINIAN_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.285, 0.46],
    [0.715, 0.46],
  ],
  rx: 0.125,
  ry: 0.2,
  line: 0.03,
  mouth: [0.5, 0.82],
  kind: 'cat',
  pupil: 0.7,
};

const ABYSSINIAN: Anatomy = {
  tail: ['tail.1', 'tail.2', 'tail.3', 'tail.4'],
  tailAxis: [0, 0.1, -1],
  earsHang: false,
  moods: adultMoods({
    calm: {
      face: 'neutral',
      carriage: -18,
      bob: [6, 0.3],
      hook: 12,
      flicks: 0.4,
      ears: 8,
      out: -4,
      swivel: 0.9,
    },
    curious: { face: 'neutral', carriage: 8, hook: 35, flicks: 1.2, ears: 18, out: -6, swivel: 1 },
  }),
  actMoods: {
    ...CAT_ACT_MOODS,
    standUp: 'curious',
    quickTilt: 'curious',
    scout: 'curious',
    earRadar: 'curious',
  },
  lying: 'calm',
  hover: 'curious',
  drop: { stand: 0, sit: -0.12, lie: -0.13 },
  sit: -24,
  turn: 45,
};

export class Abyssinian extends Moggy {
  protected readonly anatomy = ABYSSINIAN;
  protected readonly build = { middle: 0.34, spring: 1.5, speed: 1.7 };

  constructor(model: Object3D) {
    super(
      {
        name: 'Tansy',
        model: 'abyssinian',
        metres: 0.81,
        width: 0.85,
        size: 1.25,
        feels: {
          default: { f: 2.8, zeta: 0.55 },
          root: { f: 3, zeta: 0.55 },
          body: { f: 2.6, zeta: 0.6 },
          head: { f: 3, zeta: 0.5, r: 0.3 },
          'ear.L': { f: 5.5, zeta: 0.28 },
          'ear.R': { f: 5.5, zeta: 0.28 },
          'tail.1': { f: 2, zeta: 0.45 },
          'tail.2': { f: 2.2, zeta: 0.4 },
          'tail.3': { f: 2.5, zeta: 0.35 },
          'tail.4': { f: 2.8, zeta: 0.3 },
          'leg.FL': { f: 3.6, zeta: 0.55 },
          'leg.FR': { f: 3.6, zeta: 0.55 },
          'leg.BL': { f: 3.6, zeta: 0.55 },
          'leg.BR': { f: 3.6, zeta: 0.55 },
        },
        face: ABYSSINIAN_FACE,
        eyes: 0.7,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.9 },
          { bone: 'body', yaw: 0.2, pitch: 0 },
        ],
        reach: { yaw: 70, pitch: 35 },
        lag: 0.7,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 1.7,
      },
      model,
    );
    this.adopt(
      {
        pounce: 1,
        stalk: 1,
        zoomies: 0.9,
        backWall: 1.2,
        frontLip: 1.2,
        watch: 1.2,
        tilt: 0.6,
        circle: 0.7,
        batAir: 0.8,
        sneeze: 0.5,
        wash: 0.7,
      },
      0.4,
    );
    Object.assign(this.acts, this.mine());
  }

  private mine(): Record<string, Act> {
    const p = () => this.puppet;
    const stand = () => this.standing;
    const tail = this.anatomy.tail;
    return {
      // Rises onto her hind legs, tall and thin, front paws tucked, and looks all about.
      standUp: {
        weight: 1.8,
        length: [7, 7],
        when: stand,
        start: () => (this.posture = 'stand'),
        pose: (t) => {
          const k = ramp(t, 0, 0.8) * (1 - ramp(t, 6, 6.8));
          p().add('root', -48 * k);
          p().add('body', -6 * k);
          this.backLegs(48 * k);
          this.frontLegs(-100 * k);
          p().add('leg.FL', 0, 0, -10 * k);
          p().add('leg.FR', 0, 0, 10 * k);
          p().add('head', (22 + 5 * sin(t, 0.5)) * k, 42 * sin(t, 0.28) * k);
          this.extraLift = 0.03 * k;
          this.eyes = { x: 0.7 * sin(t, 0.28), y: -0.4 };
          this.pupils = 0.9;
          this.emote = 'neutral';
          tail.forEach((b, i) => p().add(b, -14 * k, 0, 8 * sin(t, 0.6, -i * 0.12) * k));
          p().add('ear.L', 8 * k, 0, 0);
          p().add('ear.R', 8 * k, 0, 0);
        },
      },
      // A quick head tilt, twice over, the ears following a beat behind: "what was that?"
      quickTilt: {
        weight: 1.6,
        length: [2.6, 2.6],
        when: () => this.still,
        start: () => (this.run.dir = Math.random() < 0.5 ? -1 : 1),
        pose: (t) => {
          const d = this.run.dir;
          const a = pulse(t, 0.2, 0.7) + 0.8 * pulse(t, 1.3, 0.8) * -1;
          p().add('head', -4, 8 * d * a, 26 * d * a);
          p().add('ear.L', 0, 0, 14 * d * a);
          p().add('ear.R', 0, 0, 14 * d * a);
          this.pupils = 1;
          this.emote = 'neutral';
          this.eyes = { x: 0.3 * d * a, y: -0.2 };
        },
      },
      // Darts a few steps, freezes with her head up and her ears swivelling, and darts again.
      scout: {
        weight: 1.6,
        length: [9, 9],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.run.n = 0;
          this.run.at = 0;
        },
        pose: (t) => {
          const leg = Math.floor(t / 1.8);
          const f = (t % 1.8) / 1.8;
          if (leg >= this.run.n && leg < 5) {
            this.run.n = leg + 1;
            const [lo, hi] = this.span(this.env.frame);
            const half = this.footprint(this.env.frame).x;
            const to = clamp(
              this.s + (Math.random() < 0.5 ? -1 : 1) * this.heightPx * (0.7 + Math.random()),
              lo + half,
              hi - half,
            );
            this.walkTo(to, clamp(this.depth + (Math.random() - 0.5) * 0.4, 0, 1));
          }
          if (f < 0.4) this.boost = 2.4;
          else {
            this.boost = 0.1;
            this.goal = null;
            const k = ramp(f, 0.4, 0.5);
            p().add('head', -12 * k, 36 * sin(t, 0.9, leg * 0.3) * k);
            p().add('body', -4 * k);
            p().add('ear.L', 6 * k, 30 * sin(t, 0.8) * k, 0);
            p().add('ear.R', 6 * k, -30 * sin(t, 0.7, 0.2) * k, 0);
            this.pupils = 1;
          }
          if (leg >= 5) this.endAct();
        },
      },
      // The great ears swivel about on their own, one then the other, eyes scanning.
      earRadar: {
        weight: 1.2,
        length: [3.8, 3.8],
        when: () => this.still,
        pose: (t) => {
          const k = ramp(t, 0, 0.3) * (1 - ramp(t, 3.4, 3.8));
          p().add('ear.L', 12 * k, 55 * sin(t, 0.6) * k, 0);
          p().add('ear.R', 12 * k, 55 * sin(t, 0.45, 0.3) * k, 0);
          this.eyes = { x: 0.8 * sin(t, 0.5), y: -0.2 };
          p().add('head', -4 * k, 16 * sin(t, 0.5), 0);
          this.pupils = 1;
          if (pulse(t, 1.7, 0.2) > 0.5) p().kick('ear.R', 0, 0, -600);
        },
      },
    };
  }
}
