import type { Object3D } from 'three';
import type { Act } from './character';
import type { FaceLayout } from './face';
import { Chameleons } from './chameleons';
import { ramp } from './kitties';

/** Flare's screen: a little wider set than Hue's. */
export const PANTHER_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.3, 0.46],
    [0.7, 0.46],
  ],
  rx: 0.105,
  ry: 0.28,
  line: 0.036,
  mouth: [0.5, 0.82],
};

/**
 * Flare, the robot panther chameleon: the brightest colour shifter of all. A stockier body than
 * Hue's on thicker legs, a broad head with a low ridge casque, and six upright bands on each
 * flank (plus a white lit stripe low down) that sweep through every colour. On top of the
 * chameleon kit's tricks: a full colour show with the bands racing down the body, a puffed-up
 * display (the body flattens sideways and stands tall, the colours flare) turned toward a
 * crewmate, and a slow, low stalk.
 */
export class Panther extends Chameleons {
  static readonly terms =
    'chameleon lizard reptile blue bright coral pink stripes bands white colour color changing shifter rainbow stocky puff display stalk walk';

  constructor(model: Object3D) {
    super(model, {
      name: 'Flare',
      model: 'panther',
      metres: 0.3,
      width: 0.55,
      size: 0.8,
      face: PANTHER_FACE,
      eyes: 0.62,
      dip: 0.7,
      gait: 1.1,
      curl: 57,
      tongue: { out: 0.42, pad: 0.034, lens: 0.0478, rainbow: true },
      lights: {
        bands: [0, 1, 2, 5, 6, 7],
        crest: 3,
        tip: 4,
        extras: [{ dot: 8, colour: '#ffffff', base: 0.8 }],
        phase: 0.9,
        spread: [0.14, 0.12],
      },
      sat: 0.95,
      lum: 0.56,
    });
    this.acts = { ...this.acts, ...this.own() };
    this.acts.colourShift.weight = 1.2;
  }

  private own(): Record<string, Act> {
    const w = () => this.want;
    const rest = () => !this.walking;
    const floor = () => !this.walking && this.edge === 'bottom';
    return {
      // A fly caught, and a wave of colour runs down the tongue and the body.
      rainbowCatch: this.catchAct({ weight: 1.6, wave: true }),
      // The whole body lights up in bands that race from the head to the tail, again and again.
      colourShow: {
        weight: 3,
        length: [7, 7],
        when: rest,
        pose: (t) => {
          const k = ramp(t, 0, 0.8) * (1 - ramp(t, 6, 6.9));
          w().show = k;
          w().race = k;
          w().head = [-6 * k, 8 * Math.sin(t * 0.8) * k, 0];
          w().sway = 0.25 * k;
          w().face = 'happy';
          w().uncurl = 0.15 * k;
        },
      },
      // Turns to a crewmate and puffs up: flat from side to side, tall, every colour flaring.
      puffDisplay: {
        weight: 2,
        length: [6.2, 6.2],
        when: floor,
        start: () => {
          const side = this.mateSide();
          if (side) this.faceSide = side;
        },
        pose: (t) => {
          const k = ramp(t, 0, 0.9) * (1 - ramp(t, 4.8, 5.8));
          w().puff = k;
          w().show = k;
          w().race = 0.8 * k;
          w().lift = 0.014 * k;
          w().head = [-9 * k, 0, 0];
          w().body = [-5 * k, 0, 2 * Math.sin(t * 13) * k];
          w().uncurl = 0.35 * k;
          w().whip = 0.2 * k;
          w().glow = k;
          w().face = k > 0.4 ? 'cross' : 'neutral';
        },
      },
      // A slow, low, patient walk, eyes fixed on something ahead.
      stalk: {
        weight: 2,
        length: [9, 10],
        when: floor,
        start: () => this.go(1, 2.2),
        pose: (t) => {
          const k = ramp(t, 0, 1.2);
          w().pace = 0.3;
          w().crouch = 0.3 * k;
          w().head = [10 * k, 0, 0];
          w().body = [3 * k, 0, 0];
          w().show = 0.15;
          w().face = 'focused';
        },
      },
    };
  }
}
