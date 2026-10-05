import type { Object3D } from 'three';
import { BEACON } from './bolt';
import type { Act, Env } from './character';
import { clamp } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import { ease, Fluffy, pulse, span } from './fluffy';
import { Spring } from './spring';

/**
 * Mellow, the robot capybara: the calmest crewmate. A big barrel of a body, a blunt square
 * head with the screen set high up, a dark snout plate and four short legs. Everything he
 * does is slow, and the lights say the same: two round flank lamps that breathe.
 *
 * He sits utterly still, eyes half shut, while a lit orange (a toy on a bone of its own)
 * rises onto his head and a tiny robot bird comes and settles on it; he takes a warm bath,
 * sinking into a tub of light up to his nose while rings of steam drift up; and he chews a
 * reed, slowly and happily, a bite at a time, until it is gone. The rest is the fluffy
 * base's (fluffy.ts), though he hops and spins far less than the others.
 */
export const CAPYBARA_FACE: FaceLayout = {
  width: 448,
  height: 200,
  eyes: [
    [0.27, 0.36],
    [0.73, 0.36],
  ],
  rx: 0.055,
  ry: 0.21,
  line: 0.03,
  mouth: null,
};

/** How far he sinks into the bath (metres). */
const SINK = 0.035;
const STEAM = 3;

export class Capybara extends Fluffy {
  static readonly terms =
    'rodent giant largest guinea pig tan brown beige big barrel blunt square head calm chill relaxed slow sleepy bath steam';

  private orange = new Spring(5, 0.45, 1.3);
  private orangeGoal = 0;
  private bird = { on: false, x: 0, y: 0, z: 0, flap: 0, tilt: 0 };
  private birdScale = new Spring(14, 0.9);
  private pool = new Spring(3.4, 0.5, 1.1);
  private poolGoal = 0;
  private sink = new Spring(2.2, 0.8);
  private sinkGoal = 0;
  private steam = new Spring(2, 0.9);
  private steamGoal = 0;
  private steamPhase = 0;
  private reed = new Spring(6, 0.6, 1);
  private reedGoal = 0;
  private reedLength = 1;
  private chew = 0;
  private birdDir = 1;

  constructor(model: Object3D) {
    super(
      {
        name: 'Mellow',
        model: 'capybara',
        metres: 0.36,
        width: 0.42,
        size: 0.78,
        face: CAPYBARA_FACE,
        eyes: 0.8,
        tail: ['tail.1'],
        tailAxis: [0, 0.2, -1],
        sit: -26,
        drop: { sit: -0.05, lie: -0.06 },
        speed: 0.65,
        lag: 1.4,
        stay: [55, 120],
        moods: {
          calm: { carriage: -6, bob: [1.5, 0.15], wag: [2, 0.2], ears: 0, out: 2 },
          happy: { wag: [6, 0.8], carriage: 4 },
        },
        actMoods: { zen: 'sleepy', bath: 'sleepy', chew: 'happy' },
      },
      model,
    );
    this.dotCount = 0;
    this.acts = { ...this.acts, ...this.mine() };
    // The calmest one: fewer hops, spins and wiggles, more yawns and naps.
    for (const [name, k] of [
      ['hophop', 0.25],
      ['spin', 0.25],
      ['wiggle', 0.4],
      ['rearUp', 0.3],
      ['shake', 0.5],
      ['yawn', 1.4],
      ['nap', 1.3],
    ] as const)
      if (this.acts[name]) this.acts[name].weight *= k;
  }

  private mine(): Record<string, Act> {
    const p = this.puppet;
    return {
      zen: {
        // Sits utterly still, eyes half shut. An orange rises onto his head, and a tiny
        // robot bird flies in, settles on it, and later flies off again.
        weight: 2.2,
        length: [12.5, 12.5],
        when: this.still,
        start: () => {
          this.posture = 'sit';
          this.birdDir = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          this.orangeGoal = span(t, 0.8, 1.6, 10.9, 11.7);
          const dir = this.birdDir;
          const b = this.bird;
          const ci = t < 8 ? 1 : -1;
          const side = ci * dir;
          if (t > 3 && t < 4.6) {
            const u = ease(t, 3, 4.6);
            b.on = true;
            b.x = side * 0.34 * (1 - u);
            b.z = 0.06 * (1 - u);
            b.y = 0.2 * (1 - u) * (1 - u) + 0.1 * Math.sin(Math.PI * u) * (1 - u);
            b.flap = 1 - ease(t, 4.2, 4.6);
          } else if (t >= 4.6 && t < 9.4) {
            b.on = true;
            b.x = b.y = b.z = 0;
            // A tiny settle, a ruffle now and then.
            b.flap = pulse(t, 6.6, 0.5) * 0.3;
            b.tilt = 8 * sin(t, 0.25);
          } else if (t >= 9.4 && t < 10.9) {
            const u = ease(t, 9.4, 10.9);
            b.on = true;
            b.x = -side * 0.4 * u;
            b.z = 0.04 * u;
            b.y = 0.04 * u + 0.22 * u * u;
            b.flap = 1;
          }
          // He does not notice: only the faintest breath.
          p.add('head', 2 * sin(t, 0.2));
        },
      },
      bath: {
        // A tub of light blooms round him; he sinks into it up to his nose, chin lifted,
        // eyes shut, steam rings drifting up, then gets out again.
        weight: 2,
        length: [14, 14],
        when: this.still,
        start: () => (this.posture = 'stand'),
        pose: (t) => {
          this.poolGoal = span(t, 0.3, 1.6, 12.2, 13.4);
          this.sinkGoal = span(t, 1.8, 3.4, 10.0, 11.4);
          this.steamGoal = span(t, 3, 4, 10.4, 11.6);
          const soak = span(t, 2.6, 3.8, 10, 11);
          p.add('head', -22 * soak, 5 * sin(t, 0.12) * soak);
          p.add('body', -4 * soak);
          p.add('ear.L', -14 * soak, 0, -10 * soak);
          p.add('ear.R', -14 * soak, 0, 10 * soak);
          p.add('root', 2 * sin(t, 0.14) * soak, 0, 0);
          // Paddling a little, now and then, under the surface.
          const paddle = soak * Math.max(0, sin(t, 0.3));
          p.add('leg.FL', 18 * sin(t, 1.2) * paddle);
          p.add('leg.FR', -18 * sin(t, 1.2) * paddle);
        },
      },
      chew: {
        // A reed pokes out of his snout; he works through it with slow contented bites,
        // eyes half closed, a deep swallow at the end.
        weight: 1.6,
        length: [10, 10],
        when: this.still,
        pose: (t) => {
          this.reedGoal = span(t, 0.3, 1, 8, 8.7);
          const on = span(t, 1.2, 1.8, 7.2, 7.6);
          const bite = Math.abs(sin(t, 0.65)) * on;
          this.chew = bite;
          this.reedLength = 1 - 0.78 * ease(t, 1.4, 7.2);
          p.add('head', 3 + 6 * bite - 3 * on, 5 * sin(t, 0.65) * on);
          p.add('ear.L', -5 * bite, 0, -4 * bite);
          p.add('ear.R', -5 * bite, 0, 4 * bite);
          p.add('body', 1.2 * bite);
          const swallow = pulse(t, 7.5, 1);
          p.add('head', -18 * swallow);
          p.add('body', -3 * swallow);
        },
      },
    };
  }

  protected sitting() {
    super.sitting();
    this.puppet.add('leg.FL', -4);
    this.puppet.add('leg.FR', -4);
  }

  protected lying(breath: number) {
    super.lying(breath);
    this.puppet.add('head', 6);
  }

  protected pose(dt: number, env: Env) {
    this.extraLift = -this.sink.update(dt, this.sinkGoal * SINK);
    // The blunt face and heavy frame: he turns the way he goes with no hurry.
    super.pose(dt, env);
    if (this.walking) this.puppet.add('root', 0, 0, 1.5 * Math.sin(this.gait));
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    // The orange rises onto his head and the bird sits on it.
    const o = Math.max(0.001, this.orange.update(dt, this.orangeGoal));
    p.stretch('toy', o, [0, 1, 0], o);
    p.shift('toy', 0, (1 - Math.min(1, o)) * 0.1, 0);
    const b = this.bird;
    const bs = Math.max(0.001, this.birdScale.update(dt, b.on ? 1 : 0));
    p.stretch('bird', bs, [0, 1, 0], bs);
    p.shift('bird', b.x, b.y + (1 - Math.min(1, o)) * 0.1, b.z);
    p.turn('bird', 0, 0, b.tilt + (b.flap > 0.4 ? 10 * Math.sin(this.t * 40) : 0));
    // Wings folded when settled, beating when flying.
    const beat = b.flap * 55 * Math.sin(this.t * 2 * Math.PI * 9);
    p.turn('bwing.L', 0, 0, -12 + beat);
    p.turn('bwing.R', 0, 0, 12 - beat);
    b.on = false;
    b.flap = 0;
    b.tilt = 0;
    // The bath: the tub blooms, steam drifts up from it. It stays put as he sinks.
    const pool = Math.max(0.001, this.pool.update(dt, this.poolGoal));
    const lift = Math.max(0, this.hop.y);
    // The tub fills as he settles: its surface rises up his sides.
    p.stretch('pool', pool * (0.55 + 0.45 * clamp(this.sink.y / SINK, 0, 1)), [0, 1, 0], pool);
    p.shift('pool', 0, -this.extraLift - lift, 0);
    this.poolGoal = 0;
    this.sinkGoal = 0;
    const steam = this.steam.update(dt, this.steamGoal);
    this.steamPhase += dt * 0.32;
    for (let i = 0; i < STEAM; i++) {
      const ph = (this.steamPhase + i / STEAM) % 1;
      const s = Math.max(0.001, clamp(steam, 0, 1) * Math.sin(Math.PI * ph) ** 0.8);
      const bone = `steam.${i + 1}`;
      p.stretch(bone, s, [0, 1, 0], s * (0.6 + 0.8 * ph));
      p.shift(bone, 0.02 * Math.sin(ph * 9 + i * 2), -this.extraLift - lift + ph * 0.14, 0);
    }
    this.steamGoal = 0;
    // The reed for chewing.
    const r = Math.max(0.001, this.reed.update(dt, this.reedGoal));
    p.stretch('reed', Math.max(0.001, r * this.reedLength), [0, 0, 1], r);
    p.shift('reed', 0, -0.006 * this.chew, 0);
    this.reedGoal = 0;
    super.after(dt, env);
    this.chew = 0;
  }

  protected lights(time: number) {
    const o = this.outfit;
    const m = this.mood;
    // The flank lamps breathe slowly; they dim in sleep and warm with love.
    let lamp = 0.4 + 0.2 * Math.sin(time * 0.7);
    let tone: string | undefined;
    if (m === 'asleep') lamp = 0.06 + 0.1 * (0.5 + 0.5 * Math.sin(time * 0.8));
    else if (m === 'sleepy') lamp = 0.25 + 0.1 * Math.sin(time * 0.6);
    else if (m === 'love') [lamp, tone] = [0.8 + 0.2 * Math.sin(time * 4), BEACON.love];
    else if (m === 'happy') [lamp, tone] = [0.75, BEACON.happy];
    else if (m === 'alarmed') [lamp, tone] = [Math.sin(time * 30) > 0 ? 1 : 0.4, BEACON.surprised];
    else if (m === 'curious') lamp = 0.8;
    if (this.act === 'dizzy') tone = undefined;
    o.dot(0, clamp(lamp + 0.3 * this.chew, 0, 1), tone);
    // The orange glows, brighter with the bird on it; the tub shimmers and steams.
    const glowing = this.orange.y > 0.2;
    o.dot(1, glowing ? 0.75 + 0.2 * Math.sin(time * 1.4) : 0, undefined);
    o.dot(2, this.pool.y > 0.2 ? 0.55 + 0.2 * Math.sin(time * 1.1) : 0, undefined);
  }
}
