import type { Object3D } from 'three';
import { BEACON } from './bolt';
import type { Act, Env } from './character';
import { clamp } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import { ease, Fluffy, pulse, span } from './fluffy';
import { Spring } from './spring';

/**
 * Dune, the robot fennec fox kit: a small cream toy with a slim body, a short pointed muzzle,
 * big dark eyes, a bushy black-tipped tail and, the signature, two giant ears (each as big as
 * his head, a pink rim and a lit panel inside) that swivel on their own. He is nothing like
 * Vix the fox: small, jumpy and all ears.
 *
 * He listens, an ear at a time, to something far off; he pounces headfirst into the sand like
 * a fox hunting under it (a dune of sand rises in front of him, his head and shoulders go
 * in, hind legs kicking, sand flying), and pops out again shaking; and he spins for joy with
 * his ears flapping. The rest is the fluffy base's (fluffy.ts).
 */
export const FENNEC_FACE: FaceLayout = {
  width: 448,
  height: 288,
  eyes: [
    [0.29, 0.46],
    [0.71, 0.46],
  ],
  rx: 0.09,
  ry: 0.3,
  line: 0.034,
  mouth: null,
};

const SAND = 4;

export class Fennec extends Fluffy {
  private dune = new Spring(4, 0.55, 1.2);
  private duneGoal = 0;
  private spray = new Spring(6, 0.8);
  private sprayGoal = 0;
  private sprayPhase = 0;
  private listening = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Dune',
        model: 'fennec',
        metres: 0.46,
        width: 0.3,
        size: 0.7,
        face: FENNEC_FACE,
        eyes: 0.46,
        tail: ['tail.1', 'tail.2', 'tail.3'],
        tailAxis: [0, 0.4, -1],
        sit: -30,
        drop: { sit: -0.05, lie: -0.06 },
        speed: 1.5,
        lag: 0.85,
        feels: {
          'ear.L': { f: 6, zeta: 0.35 },
          'ear.R': { f: 6, zeta: 0.35 },
        },
        moods: {
          calm: { swivel: 0.8, ears: 4, out: 2, wag: [6, 0.5] },
          curious: { swivel: 1.4, ears: 14 },
          happy: { wag: [22, 2.4] },
        },
        actMoods: { listen: 'curious', pounce: 'curious', twirl: 'happy', flutter: 'happy' },
      },
      model,
    );
    this.dotCount = 0;
    this.acts = { ...this.acts, ...this.mine() };
  }

  private mine(): Record<string, Act> {
    const p = this.puppet;
    return {
      listen: {
        // Freezes, then swivels one giant ear toward a far-off sound, then the other, and
        // both, head tipped, eyes wide.
        weight: 2.2,
        length: [7, 7],
        when: this.standing,
        start: () => (this.posture = 'stand'),
        pose: (t) => {
          const k = span(t, 0.2, 0.7, 6.0, 6.7);
          this.listening = k;
          const l = span(t, 0.8, 1.2, 2.5, 2.9);
          const r = span(t, 3.1, 3.5, 4.8, 5.2);
          const both = span(t, 5.0, 5.4, 6.0, 6.5);
          p.add('ear.L', 6 * k + 10 * l, 42 * l - 6 * both, -10 * l);
          p.add('ear.R', 6 * k + 10 * r, -42 * r + 6 * both, 10 * r);
          p.add('head', -4 * k, 14 * l - 14 * r, 8 * (l - r));
          p.add('body', -2 * k);
          this.anatomy.tail.forEach((b, i) => p.add(b, 4 * k * sin(t, 1.2, i * 0.1)));
        },
      },
      pounce: {
        // Spots something under the sand, wiggles, springs and dives in headfirst, hind
        // legs kicking and sand flying, then pops out and shakes.
        weight: 2.2,
        length: [7, 7],
        when: this.standing,
        start: () => (this.posture = 'stand'),
        pose: (t) => {
          this.duneGoal = span(t, 0.3, 1.2, 5.6, 6.6);
          const watch = span(t, 0.8, 1.4, 2.2, 2.4);
          const wig = span(t, 1.4, 1.8, 2.4, 2.6);
          p.add('head', 14 * watch);
          p.add('body', 10 * watch);
          p.add('leg.FL', -26 * watch);
          p.add('leg.FR', -26 * watch);
          p.add('ear.L', 14 * watch);
          p.add('ear.R', 14 * watch);
          p.add('body', 0, 6 * sin(t, 4.5) * wig, 0);
          this.anatomy.tail.forEach((b, i) => p.add(b, 0, 16 * wig * sin(t, 4.5, i * 0.1), 0));
          // The dive: nose down into the sand, hind end up.
          const dive = ease(t, 2.5, 2.9) * (1 - ease(t, 4.7, 5.3));
          p.add('body', 56 * dive);
          p.add('head', 16 * dive);
          p.shift('body', 0, 0, 0.13 * dive);
          p.add('leg.FL', -20 * dive);
          p.add('leg.FR', -20 * dive);
          p.add('leg.BL', -34 * dive + 22 * dive * Math.max(0, sin(t, 3.2)));
          p.add('leg.BR', -34 * dive + 22 * dive * Math.max(0, sin(t, 3.2, 0.5)));
          p.add('ear.L', -30 * dive);
          p.add('ear.R', -30 * dive);
          this.anatomy.tail.forEach((b, i) =>
            p.add(b, -20 * dive, 14 * dive * sin(t, 3.2, i * 0.12)),
          );
          if (t > 2.5 && t < 2.56) this.hop.kick(1.4);
          this.sprayGoal = span(t, 2.6, 2.9, 4.2, 4.8);
          // Out again, shaking the sand off.
          const shake = Math.sin(t * 2 * Math.PI * 6) * pulse(t, 5.3, 1.2);
          p.add('root', 0, 0, 5 * shake);
          p.add('head', 0, 0, -14 * shake);
          p.add('ear.L', 0, 0, 24 * shake);
          p.add('ear.R', 0, 0, 24 * shake);
        },
      },
      twirl: {
        // A happy spin or two on the spot, ears flapping out, tail whipping round, a hop.
        weight: 1.6,
        length: [3.4, 3.4],
        when: this.standing,
        start: () => (this.posture = 'stand'),
        pose: (t) => {
          const k = span(t, 0.2, 0.6, 2.4, 3.0);
          this.want.yaw = 720 * ease(t, 0.3, 2.4);
          const flap = Math.sin(t * 2 * Math.PI * 3);
          p.add('ear.L', -10 * k, 0, -34 * k - 16 * flap * k);
          p.add('ear.R', -10 * k, 0, 34 * k + 16 * flap * k);
          this.anatomy.tail.forEach((b, i) => p.add(b, 0, 40 * k * (i + 1) * 0.5));
          p.add('head', -8 * k);
          p.add('leg.FL', 12 * flap);
          p.add('leg.BR', 12 * flap);
          p.add('leg.FR', -12 * flap);
          p.add('leg.BL', -12 * flap);
          if (t > 2.4 && t < 2.46) this.hop.kick(1.2);
        },
      },
      flutter: {
        // Both ears flick and wave like leaves, in turns, quicker and quicker.
        weight: 1.2,
        length: [3.6, 3.6],
        when: this.still,
        pose: (t) => {
          const k = span(t, 0.2, 0.6, 2.9, 3.4);
          const rate = 2 + 1.4 * t;
          p.add('ear.L', 0, 22 * k * sin(t * rate, 1), -18 * k * Math.abs(sin(t * rate, 1)));
          p.add(
            'ear.R',
            0,
            22 * k * sin(t * rate, 1, 0.5),
            18 * k * Math.abs(sin(t * rate, 1, 0.5)),
          );
          p.add('head', 0, 0, 6 * k * sin(t, 1.4));
        },
      },
    };
  }

  protected sitting() {
    super.sitting();
    this.puppet.add('leg.FL', -8);
    this.puppet.add('leg.FR', -8);
  }

  protected lying(breath: number) {
    super.lying(breath);
    this.puppet.add('head', 8);
    this.puppet.add('ear.L', -10);
    this.puppet.add('ear.R', -10);
  }

  protected pose(dt: number, env: Env) {
    super.pose(dt, env);
    if (this.walking) this.puppet.add('root', 0, 0, 2.5 * Math.sin(this.gait));
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    const dune = Math.max(0.001, this.dune.update(dt, this.duneGoal));
    p.stretch('dune', dune, [0, 1, 0], dune);
    this.duneGoal = 0;
    // Sand thrown up out of the dune.
    const spray = clamp(this.spray.update(dt, this.sprayGoal), 0, 1);
    this.sprayGoal = 0;
    this.sprayPhase += dt * 1.8;
    for (let i = 0; i < SAND; i++) {
      const ph = (this.sprayPhase + i / SAND) % 1;
      const s = Math.max(0.001, spray * Math.sin(Math.PI * ph) ** 0.35);
      const bone = `sand.${i + 1}`;
      const side = i % 2 ? 1 : -1;
      p.stretch(bone, s, [0, 1, 0], s);
      p.shift(
        bone,
        side * (0.04 + 0.08 * ph),
        0.2 * Math.sin(Math.PI * ph) + 0.03,
        -0.02 - 0.06 * ph * (i % 3),
      );
    }
    super.after(dt, env);
    this.listening = 0;
  }

  protected lights(time: number) {
    const o = this.outfit;
    const m = this.mood;
    let ears = 0.5 + 0.1 * Math.sin(time * 0.9);
    let lamp = 0.45 + 0.15 * Math.sin(time * 1.2);
    let tone: string | undefined;
    if (m === 'asleep') [ears, lamp] = [0.08, 0.06 + 0.1 * (0.5 + 0.5 * Math.sin(time * 1.1))];
    else if (m === 'sleepy') [ears, lamp] = [0.2, 0.22];
    else if (m === 'love') [ears, lamp, tone] = [0.8, 0.8 + 0.2 * Math.sin(time * 5), BEACON.love];
    else if (m === 'happy') [ears, lamp, tone] = [0.85, 0.85, BEACON.happy];
    else if (m === 'alarmed')
      [ears, lamp, tone] = [1, Math.sin(time * 30) > 0 ? 1 : 0.4, BEACON.surprised];
    else if (m === 'curious') ears = 0.85;
    o.dot(0, clamp(ears + 0.15 * this.listening, 0, 1), tone);
    o.dot(1, clamp(lamp, 0, 1), tone);
  }
}
