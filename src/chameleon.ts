import type { Act } from './character';
import { Chameleons, CHAMELEON_FACE, shot } from './chameleons';

export { CHAMELEON_FACE };

/**
 * Hue, the robot veiled chameleon: a tall narrow toy on four gripping legs with a very tall
 * helmet casque (her signature), two big cone-lidded turret eyes that turn about on their
 * own, a tail wound up like a watch spring, and a very long tongue with a sticky pad on the tip.
 * Everything she does is the chameleon kit's (chameleons.ts): the rocking walk, tongue snap,
 * colour shift, tail curl and spin, freeze, leaf sway, camouflage, look round, nap, cling and
 * climb. The colour is in three round panels on each flank that shift hue, with four lit gold
 * bands between them, the crest and the tail tip.
 */
export class Chameleon extends Chameleons {
  constructor(model: import('three').Object3D) {
    super(model, {
      name: 'Hue',
      model: 'chameleon',
      metres: 0.385,
      width: 0.58,
      size: 0.99,
      face: CHAMELEON_FACE,
      eyes: 0.6,
      dip: 0.7,
      curl: 66,
      tongue: { out: 0.46, pad: 0.031, lens: 0.046 },
      lights: {
        bands: [0, 1, 2],
        crest: 3,
        tip: 4,
        extras: [{ dot: 5, colour: '#ffd23a', base: 0.5 }],
      },
    });
    this.acts = { ...this.acts, ...this.own() };
  }

  private own(): Record<string, Act> {
    const w = () => this.want;
    return {
      // Tasting the air: three quick half-length flicks of the tongue, side-on, and a nod.
      flicks: {
        weight: 1.4,
        length: [5.2, 5.2],
        when: () => !this.walking && this.edge === 'bottom',
        pose: (t) => {
          w().profile = this.profileAt(t, 4.2);
          let k = 0;
          let hit = 0;
          let jaw = 0;
          for (let i = 0; i < 3; i++) {
            const s = shot(t, 1 + i * 0.9, 0.1, 0.1, 0.34);
            k = Math.max(k, s.k);
            hit = Math.max(hit, s.hit);
            jaw = Math.max(jaw, s.jaw);
          }
          w().tongue = k;
          w().len = 0.55;
          w().hit = 0.3 * hit;
          w().jaw = 0.5 * jaw;
          w().head = [-3 * k, 0, 0];
          w().face = t > 3.9 ? 'happy' : 'focused';
        },
      },
    };
  }
}
