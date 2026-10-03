import type { Object3D } from 'three';
import type { Act } from './character';
import { Chameleons, CHAMELEON_FACE, shot } from './chameleons';
import { ramp } from './kitties';
import { sin } from './moves';

/**
 * Trike, the robot Jackson's chameleon: a little triceratops, bright green, three chunky
 * forward horns with lit tips (one on the nose, one over each eye) and a saw-tooth crest of
 * plates down the back. On top of the chameleon kit's tricks: a horn-to-horn shove contest
 * with nothing (lowers the horns, pushes three times, backs off, shakes it off), a proud
 * head-up pose, and nodding the horns.
 */
export class Jackson extends Chameleons {
  constructor(model: Object3D) {
    super(model, {
      name: 'Trike',
      model: 'jackson',
      metres: 0.3,
      width: 0.5,
      size: 0.78,
      face: CHAMELEON_FACE,
      eyes: 0.62,
      dip: 0.7,
      curl: 59,
      tongue: { out: 0.42, pad: 0.032, lens: 0.046 },
      lights: {
        bands: [0, 1, 2],
        crest: 3,
        tip: 4,
        extras: [{ dot: 5, colour: '#f6ffb0', base: 0.35 }],
      },
      hues: [0.15, 0.38],
      lum: 0.56,
    });
    this.acts = { ...this.acts, ...this.own() };
  }

  private own(): Record<string, Act> {
    const w = () => this.want;
    const rest = () => !this.walking;
    const floor = () => !this.walking && this.edge === 'bottom';
    return {
      // The tongue shoots at his own nose horn and sticks to it; cross-eyed, he tugs his head
      // back three times, and it pops free.
      hornSnag: {
        weight: 1.6,
        length: [7, 7],
        when: floor,
        pose: (t) => {
          const o = this.tg.origin;
          const TF = 1.2;
          const s = shot(t, TF, 0.12, 2.1, 0.4);
          const tug =
            Math.max(0, Math.sin((t - TF - 0.5) * 7)) * (t > TF + 0.4 && t < s.backAt ? 1 : 0);
          w().profile = this.profileAt(t, 6);
          w().tongue = s.k;
          w().target = { at: [o.x, o.y + 0.1365, o.z + 0.225], head: true };
          w().hit = Math.max(s.hit, s.k >= 1 && t < s.backAt ? 0.4 : 0);
          w().wob = s.wob;
          w().wobT = s.wobT;
          w().jaw = 0.5 * s.jaw;
          const cross = ramp(t, 0.3, 0.9) * (1 - ramp(t, s.endAt, s.endAt + 0.5));
          w().eyes = [
            [0, -34 * cross],
            [0, 34 * cross],
          ];
          w().head = [-8 * tug + 3 * ramp(t, TF, TF + 0.3), 0, 0];
          w().body = [-4 * tug, 0, 0];
          w().face =
            t < TF
              ? 'focused'
              : t < s.backAt
                ? 'cross'
                : t < s.endAt + 0.6
                  ? 'surprised'
                  : 'sheepish';
        },
      },
      // Horns down, three hard shoves at nothing, a step back and a shake of the head.
      hornShove: {
        weight: 2.2,
        length: [7, 7],
        when: floor,
        pose: (t) => {
          const low = ramp(t, 0, 0.8) * (1 - ramp(t, 5.6, 6.5));
          const pushing = t > 1.1 && t < 4.1 ? 1 : 0;
          const push = pushing * Math.max(0, Math.sin((t - 1.1) * 4.2));
          const back = ramp(t, 4.1, 4.6) * (1 - ramp(t, 5.4, 6));
          w().head = [26 * low - 38 * back + 6 * push, 0, 0];
          w().body = [5 * low + 8 * push - 4 * back, 0, 0];
          w().crouch = 0.3 * low;
          w().lift = -0.004 * push;
          w().glow = low;
          w().uncurl = 0.2 * push;
          w().face = back > 0.5 ? 'sheepish' : low > 0.5 ? 'cross' : 'neutral';
          if (t > 5.2)
            w().head = [w().head[0], 14 * Math.sin((t - 5.2) * 16) * (1 - ramp(t, 5.2, 6.4)), 0];
        },
      },
      // Chest out, head high, turning it slowly so everyone sees the horns.
      proudPose: {
        weight: 1.8,
        length: [6, 6],
        when: floor,
        pose: (t) => {
          const k = ramp(t, 0, 1) * (1 - ramp(t, 4.8, 5.8));
          w().head = [-24 * k, 14 * sin(t, 0.18) * k, 0];
          w().body = [-7 * k, 0, 0];
          w().lift = 0.015 * k;
          w().uncurl = 0.12 * k;
          w().glow = k;
          w().face = 'happy';
          w().show = 0.2 * k;
        },
      },
      // Nods the horns, three times, the tips flashing.
      hornNod: {
        weight: 2,
        length: [4, 4],
        when: rest,
        pose: (t) => {
          const k = ramp(t, 0, 0.3) * (1 - ramp(t, 3.2, 3.8));
          const nod = 0.5 - 0.5 * Math.cos(t * 5.5);
          w().head = [20 * nod * k, 0, 0];
          w().body = [3 * nod * k, 0, 0];
          w().glow = nod * k;
          w().face = 'happy';
        },
      },
    };
  }
}
