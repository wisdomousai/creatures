import type { Object3D } from 'three';
import type { Act } from './character';
import type { FaceLayout } from './face';
import { Chameleons } from './chameleons';
import { ramp } from './kitties';

/** Sage's screen: a broad face with calm eyes. */
export const PARSON_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.3, 0.46],
    [0.7, 0.46],
  ],
  rx: 0.095,
  ry: 0.25,
  line: 0.034,
  mouth: [0.5, 0.82],
};

/**
 * Sage, the robot Parson's chameleon: the giant (about 1.4 times Hue), heavy and slow, big
 * rounded ear flaps behind the head with a lit boss on each, a low casque, deep turquoise-green
 * with big orange turret eyes. On top of the chameleon kit's tricks: very slow deliberate
 * steps, a huge slow yawn, and rolling one eye round while the other stays on you.
 */
export class Parson extends Chameleons {
  constructor(model: Object3D) {
    super(model, {
      name: 'Sage',
      model: 'parson',
      metres: 0.29,
      width: 0.62,
      size: 1.15,
      face: PARSON_FACE,
      eyes: 0.6,
      dip: 0.55,
      gait: 1.25,
      curl: 53,
      mass: 1.5,
      tongue: { out: 0.62, pad: 0.043, lens: 0.0586 },
      lights: {
        bands: [0, 1, 2],
        crest: 3,
        tip: 4,
        extras: [{ dot: 5, colour: '#ffa030', base: 0.45 }],
      },
      hues: [0.42, 0.52],
      sat: 0.8,
      lum: 0.5,
    });
    this.acts = { ...this.acts, ...this.own() };
    this.acts.stroll.weight = 1.2;
  }

  private own(): Record<string, Act> {
    const w = () => this.want;
    const rest = () => !this.walking;
    const floor = () => !this.walking && this.edge === 'bottom';
    return {
      // The fly lands on his nose; he crosses his eyes at it, waits, and only then, slowly, shoots.
      noseFly: this.catchAct({ weight: 1.6, nose: true }),
      // Very slow, deliberate steps, each foot set down with a nod.
      plod: {
        weight: 3.5,
        length: [9, 11],
        when: rest,
        start: () => this.go(0.8, 1.8),
        pose: (t) => {
          w().pace = 0.6;
          w().head = [2 * Math.sin(t * 1.9), 0, 0];
          w().face = 'neutral';
        },
      },
      // A huge, slow yawn, head going back, eyes shut, the mouth open wide.
      yawn: {
        weight: 2.2,
        length: [7.5, 7.5],
        when: floor,
        pose: (t) => {
          const k = ramp(t, 0, 2.2) * (1 - ramp(t, 4.8, 6.4));
          const open = t > 2 && t < 5 ? 1 : 0;
          w().head = [-30 * k, 0, 0];
          w().body = [-6 * k, 0, 0];
          w().lift = 0.01 * k;
          w().eyes = [
            [-30 * k, 0],
            [-30 * k, 0],
          ];
          w().face = open ? 'surprised' : 'sleepy';
          w().glow = 0.5 * k;
        },
      },
      // One eye rolls all the way round while the other stays on you.
      eyeRoll: {
        weight: 2.2,
        length: [6, 6],
        when: rest,
        pose: (t) => {
          const k = ramp(t, 0, 0.6) * (1 - ramp(t, 5.2, 5.9));
          w().eyes = [
            [18 * Math.sin(t * 2.2) * k, 75 * Math.cos(t * 2.2) * k],
            [0, 0],
          ];
          w().head = [2 * k, 0, 0];
          w().face = 'sleepy';
        },
      },
    };
  }
}
