import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { Expression, FaceLayout } from './face';
import { sin } from './moves';
import { ease, Fluffy, pulse, span } from './fluffy';

/**
 * Floe, the robot polar bear cub: an all-white round toy with a longer snout and a short neck
 * (an ice-blue collar) than Bao the panda, small round ears, a black nose button, big paws
 * whose pads are lit pale blue (Dot1) and a hexagonal lamp on her chest (Dot0).
 *
 * Her own tricks: sliding along the floor on her tummy, arms out in front and legs trailing,
 * rolling onto her back to play with her feet (the pads glow as she catches them), and a
 * clumsy stand-up, sat down, pushing up onto her hind legs, wobbling, arms windmilling, and
 * plopping straight back down before she gets it right on all fours.
 */
export const POLARCUB_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.29, 0.5],
    [0.71, 0.5],
  ],
  rx: 0.07,
  ry: 0.24,
  line: 0.036,
  mouth: null,
};

export class PolarCub extends Fluffy {
  private emote: Expression | null = null;
  private slideK = 0;
  private roll = 0;
  private play = 0;
  private side = 1;
  private stage = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Floe',
        model: 'polarcub',
        metres: 0.4,
        width: 0.34,
        size: 0.78,
        face: POLARCUB_FACE,
        eyes: 0.74,
        tail: ['tail.1'],
        tailAxis: [0, 0.2, -1],
        sit: -30,
        drop: { sit: -0.05, lie: -0.07 },
        speed: 0.95,
        lag: 1.15,
        moods: { calm: { bob: [2, 0.15] }, happy: { wag: [10, 1.6] } },
        actMoods: { slide: 'happy', backPlay: 'happy', standUp: 'curious' },
      },
      model,
    );
    this.dotCount = 0;
    this.acts = { ...this.acts, ...this.mine() };
  }

  private mine(): Record<string, Act> {
    const p = this.puppet;
    const floor = () => this.standing() && this.edge === 'bottom';
    return {
      slide: {
        // Belly down and off she goes, arms out in front, legs trailing, ears back; she
        // coasts to a stop with a little wobble of the head.
        weight: 1.6,
        length: [7, 7],
        when: floor,
        start: () => {
          this.posture = 'stand';
          const [lo, hi] = this.span(this.frame!);
          const way = this.s - lo > hi - this.s ? -1 : 1;
          this.walkTo(this.s + way * this.heightPx * 3.2, this.depth);
        },
        pose: (t) => {
          const L = 7;
          const k = span(t, 0.15, 0.7, L - 1.6, L - 0.7);
          this.slideK = k;
          this.want.low = 0.07 * k;
          if (t > L - 1.8) this.goal = null;
          p.add('leg.FL', -86 * k, 0, -10 * k);
          p.add('leg.FR', -86 * k, 0, 10 * k);
          p.add('leg.BL', 62 * k, 0, -10 * k);
          p.add('leg.BR', 62 * k, 0, 10 * k);
          p.add('head', -16 * k + 6 * pulse(t, L - 1.6, 1.2));
          p.add('body', -6 * k);
          p.add('ear.L', -14 * k, 0, 10 * k);
          p.add('ear.R', -14 * k, 0, -10 * k);
          const fwd = this.walking ? 1 : 0.2;
          p.add('root', 0, 0, 2.5 * sin(t, 2.2) * k * fwd);
          this.emote = 'happy';
          if (t > 0.15 && t < 0.25) this.hop.kick(0.6);
        },
      },
      backPlay: {
        // Rocks, rolls onto her back, and plays with her feet: a hand on each foot, the
        // pads lighting where she catches them, kicking, and rolls back up.
        weight: 1.5,
        length: [10, 10],
        when: floor,
        start: () => {
          this.posture = 'stand';
          this.side = Math.random() < 0.5 ? 1 : -1;
          this.stage = 0;
        },
        pose: (t) => {
          const L = 10;
          const rock = span(t, 0.2, 0.6, 1.2, 1.6) * Math.sin(t * 2 * Math.PI * 1.4);
          const over = ease(t, 1.3, 2.5) * (1 - ease(t, 7.6, 8.9));
          this.roll = this.side * (180 * over + 12 * rock);
          const down = over > 0.9 ? 1 : over * over;
          const wag = Math.sin(t * 2 * Math.PI * 1.3) * down;
          const wag2 = Math.sin(t * 2 * Math.PI * 1.3 + 2) * down;
          // Legs in the air: hands reaching for feet, feet kicking.
          p.add('leg.FL', (-30 + 22 * wag) * down, 0, 8 * down);
          p.add('leg.FR', (-30 + 22 * wag2) * down, 0, -8 * down);
          p.add('leg.BL', (-40 + 26 * wag2) * down);
          p.add('leg.BR', (-40 + 26 * wag) * down);
          // The head stays upright, looking down the length of her.
          p.add('head', 14 * down, 0, -this.roll * Math.min(1, over * 1.2));
          p.add('ear.L', 0, 0, -10 * down);
          p.add('ear.R', 0, 0, 10 * down);
          this.play = down * (0.5 + 0.5 * Math.abs(wag));
          this.emote = down > 0.5 ? 'happy' : 'neutral';
          if (this.stage === 0 && t > 2.6) {
            this.stage = 1;
            this.hop.kick(0.3);
          }
          void L;
        },
      },
      standUp: {
        // Sat down, she pushes up onto her hind legs, wobbles with her arms windmilling,
        // goes over backwards onto her bottom with a plop, sits dazed, then gets up on four.
        weight: 1.5,
        length: [9, 9],
        when: floor,
        start: () => {
          this.posture = 'sit';
          this.stage = 0;
        },
        pose: (t) => {
          const up = span(t, 0.8, 1.8, 4.4, 4.9);
          const wob = span(t, 2.0, 2.6, 4.2, 4.7);
          const sway = Math.sin(t * 2 * Math.PI * 1.1) * wob;
          this.rear(up * 0.9, -40);
          p.add('root', 0, 0, 9 * sway);
          p.add('leg.FL', -60 * wob * Math.sin(t * 2 * Math.PI * 1.8), 0, -14 * wob);
          p.add('leg.FR', -60 * wob * Math.sin(t * 2 * Math.PI * 1.8 + 2), 0, 14 * wob);
          p.add('head', 0, 0, -12 * sway);
          p.add('ear.L', 10 * wob, 0, 10 * wob * sway);
          p.add('ear.R', 10 * wob, 0, -10 * wob * sway);
          this.emote = wob > 0.3 ? 'surprised' : null;
          // The plop: down on her bottom with a bounce, ears flopping.
          const plop = pulse(t, 4.8, 0.7);
          p.add('head', -12 * plop);
          p.add('ear.L', 0, 0, 24 * plop);
          p.add('ear.R', 0, 0, -24 * plop);
          if (this.stage === 0 && t > 4.85) {
            this.stage = 1;
            this.hop.kick(1.1);
          }
          // Dazed, then up on all fours with a little shake.
          const daze = span(t, 5.1, 5.5, 6.4, 6.9);
          p.add('head', 6 * daze, 20 * sin(t, 0.45) * daze, 8 * daze);
          if (t > 7 && this.posture === 'sit') {
            this.posture = 'stand';
            this.hop.kick(0.5);
          }
          const shake = pulse(t, 7.2, 1.2);
          p.add('body', 0, 0, 7 * shake * sin(t, 5));
          p.add('head', 0, 0, -10 * shake * sin(t, 5));
        },
      },
    };
  }

  /** Sits up like a person: back straight, legs out in front. */
  protected sitting() {
    super.sitting();
    this.puppet.add('leg.FL', -8);
    this.puppet.add('leg.FR', -8);
    this.puppet.add('leg.BL', -20);
    this.puppet.add('leg.BR', -20);
  }

  protected lying(breath: number) {
    super.lying(breath);
    this.puppet.add('head', 8);
  }

  protected pose(dt: number, env: Env) {
    this.anatomy.turn = this.posture === 'lie' ? 60 : 45;
    this.trotting = this.act !== 'slide';
    this.spec.speed = this.baseSpeed * (this.act === 'slide' ? 2.4 : 1);
    super.pose(dt, env);
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    if (this.roll) p.turn('body', 0, 0, this.roll);
    this.roll = 0;
    if (this.emote) this.expression = this.emote;
    this.emote = null;
    super.after(dt, env);
    this.slideK = 0;
  }

  protected lights(time: number) {
    const o = this.outfit;
    const m = this.mood;
    let level = 0.5 + 0.1 * Math.sin(time * 0.8);
    let tone: string | undefined;
    if (m === 'asleep') level = 0.08 + 0.15 * (0.5 + 0.5 * Math.sin(time * 1.1));
    else if (m === 'sleepy') level = 0.25;
    else if (m === 'love') [level, tone] = [0.75 + 0.25 * Math.sin(time * 5), BEACON.love];
    else if (m === 'happy') [level, tone] = [0.85 + 0.15 * Math.sin(time * 3), BEACON.happy];
    else if (m === 'alarmed') [level, tone] = [Math.sin(time * 30) > 0 ? 1 : 0.4, BEACON.surprised];
    else if (m === 'curious') level = 0.9;
    if (this.act === 'dizzy') tone = RAINBOW[Math.floor(time * 6) % RAINBOW.length];
    o.dot(0, clamp(level, 0, 1), tone);
    // The pads: a soft glow, brighter as she plays with her feet or slides.
    const pads = m === 'asleep' ? 0.06 : 0.3 + 0.55 * Math.max(this.play, this.slideK);
    o.dot(1, clamp(pads, 0, 1), this.play > 0.2 ? BEACON.happy : undefined);
    this.play = 0;
  }
}
