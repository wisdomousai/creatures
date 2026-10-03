import type { Object3D } from 'three';
import type { Act } from './character';
import type { FaceLayout } from './face';
import { Chameleons } from './chameleons';
import { ramp } from './kitties';

/** Twig's screen: bigger eyes for a small face. */
export const PYGMY_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.3, 0.46],
    [0.7, 0.46],
  ],
  rx: 0.115,
  ry: 0.3,
  line: 0.04,
  mouth: [0.5, 0.82],
};

/**
 * Twig, the robot pygmy leaf chameleon: tiny (about half Hue's height), brown and leaf-shaped,
 * a flat pointed body with a midrib and vein grooves, a stubby tail, small turrets. On top of
 * the chameleon kit's tricks: swaying back and forth like a dead leaf in a breeze, playing
 * dead (drops flat, legs tucked, rolls onto her side, then peeks with one turret and rights
 * herself), and a quick little scurry.
 */
export class Pygmy extends Chameleons {
  constructor(model: Object3D) {
    super(model, {
      name: 'Twig',
      model: 'pygmy',
      metres: 0.235,
      width: 0.46,
      size: 0.42,
      face: PYGMY_FACE,
      eyes: 0.58,
      dip: 0.9,
      gait: 1.2,
      curl: 34,
      mass: 0.85,
      lay: 0.07,
      tongue: { out: 0.3, pad: 0.018, lens: 0.0388 },
      lights: { bands: [0, 1, 2], crest: 3, tip: 4 },
      hues: [0.05, 0.11],
      sat: 0.8,
      lum: 0.55,
    });
    this.acts = { ...this.acts, ...this.own() };
    this.acts.leaf.weight = 0.8;
  }

  private own(): Record<string, Act> {
    const w = () => this.want;
    const rest = () => !this.walking;
    const floor = () => !this.walking && this.edge === 'bottom';
    return {
      // A gnat too small to see: the tongue goes out short and comes back with nothing to show.
      gnat: this.catchAct({ weight: 1.8, size: 0.22, share: 0.4 }),
      // Sways like a dead leaf in a breeze: tipping, rocking, never the same twice.
      breeze: {
        weight: 2.6,
        length: [7, 7],
        when: floor,
        pose: (t) => {
          const k = ramp(t, 0, 1.2) * (1 - ramp(t, 5.6, 6.8));
          w().flutter = k;
          w().face = 'sleepy';
          w().eyes = [
            [3 * Math.sin(t * 1.1) * k, 12 * Math.sin(t * 0.9) * k],
            [3 * Math.sin(t * 1.3) * k, 12 * Math.sin(t * 0.7 + 1) * k],
          ];
        },
      },
      // Drops flat, tucks her legs, rolls onto her side and lies there; peeks with one
      // turret, then rolls back onto her feet.
      playDead: {
        weight: 1.8,
        length: [8, 8],
        when: floor,
        pose: (t) => {
          const down = ramp(t, 0, 0.7) * (1 - ramp(t, 7, 7.7));
          const roll = ramp(t, 0.7, 1.7) * (1 - ramp(t, 6.4, 7.4));
          const peek = ramp(t, 4.8, 5.2) * (1 - ramp(t, 6.1, 6.5));
          w().crouch = down;
          w().roll = 85 * roll;
          w().drop = roll;
          w().dark = 0.6 * roll;
          w().head = [8 * roll, 0, 0];
          w().uncurl = 0;
          w().eyes = [
            [-35 * roll * (1 - peek), 0],
            [-35 * roll, 0],
          ];
          w().face = roll > 0.5 && peek < 0.5 ? 'dizzy' : peek > 0.5 ? 'neutral' : 'sleepy';
        },
      },
      // A quick little scurry, then a pause.
      scurry: {
        weight: 2.6,
        length: [3.5, 4.5],
        when: rest,
        start: () => this.go(2, 4),
        pose: () => {
          w().pace = 2.6;
          w().face = 'happy';
        },
      },
    };
  }
}
