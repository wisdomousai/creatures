import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { Bird, ease, type Reaction, span } from './birds';
import { sin } from './moves';
import { Spring } from './spring';

/**
 * Yolk, the robot chick, Biddy's baby: a round fluffball of chunky pods with a big round head,
 * a screen face, a tiny orange beak on its own jaw, two stub wings with a light on each tip,
 * thin orange legs on big flat feet and a lamp on its breast. About half the hen's height.
 *
 * It scurries in little hurried steps, bobbing; cheeps in a run (beak going, head bobbing with
 * every step); follows a crewmate about (Biddy, if she is on stage); nods off standing up and
 * topples forward onto its beak, then wakes with a jump; and flaps its stubs and hops, failing
 * to fly.
 */
export const CHICK_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.3, 0.5],
    [0.7, 0.5],
  ],
  rx: 0.11,
  ry: 0.3,
  line: 0.04,
  mouth: null,
};

const SIDES = [
  ['L', 1],
  ['R', -1],
] as const;

export class Chick extends Bird {
  private openS = new Spring(7, 0.4, 1.2);
  private puffS = new Spring(3, 0.6);
  private tipS = new Spring(3.2, 0.55, 1.5);
  private turn = new Spring(1.6, 0.8);
  // Per-frame requests from acts, cleared in idle().
  private jaw = 0;
  private wings = 0;
  private flap = 0;
  private lift = 0;
  private puff = 0;
  private tip = 0;
  private glow = 0;
  private cheep = 0;
  private dance = 0;
  private actSpeed = 1.1;
  private bob = 0;
  private beat = 0;
  private hops = 0;
  private target: ReturnType<Chick['mates']>[number] | null = null;
  private retarget = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Yolk',
        model: 'chick',
        metres: 0.24,
        width: 0.3,
        size: 0.5,
        feels: {
          default: { f: 5, zeta: 0.6 },
          root: { f: 4.5, zeta: 0.5 },
          body: { f: 5, zeta: 0.45 },
          head: { f: 7, zeta: 0.4, r: 0.5 },
          jaw: { f: 14, zeta: 0.45 },
          tail: { f: 5, zeta: 0.35 },
          'wing.L': { f: 6, zeta: 0.4 },
          'wing.R': { f: 6, zeta: 0.4 },
          'leg.L': { f: 10, zeta: 0.6 },
          'leg.R': { f: 10, zeta: 0.6 },
        },
        face: CHICK_FACE,
        eyes: 0.9,
        gaze: [
          { bone: 'head', yaw: 0.85, pitch: 0.85 },
          { bone: 'body', yaw: 0.12, pitch: 0 },
        ],
        reach: { yaw: 60, pitch: 30 },
        lag: 1.0,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [50, 110],
        speed: 1.1,
        turn: 90,
        roam: true,
      },
      model,
    );
    this.acts = { ...this.moves(), ...this.tricks(), ...this.reactions() };
  }

  /** Biddy if she is about, else the nearest crewmate. */
  private pick() {
    const all = this.mates();
    return all.find((o) => o.spec.model === 'hen') ?? all[0] ?? null;
  }

  private moves(): Record<string, Act> {
    return {
      idle: { weight: 3, length: [3, 5] },
      scurry: {
        weight: 2,
        length: [4, 6],
        when: this.still,
        start: () => {
          this.actSpeed = 1.8;
          this.amble(1.5 + Math.random() * 2);
        },
      },
      // Cheeps in a run: beak going, head bobbing with every step.
      cheepRun: {
        weight: 2.4,
        length: [4.5, 5.5],
        face: 'happy',
        when: this.still,
        start: () => {
          this.actSpeed = 2.4;
          this.amble(4 + Math.random() * 2);
        },
        pose: (t) => {
          const k = ease(t, 0, 0.25);
          const call = Math.max(0, Math.sin(t * 15)) ** 2;
          this.jaw = 22 * call * k;
          this.cheep = call * k;
          this.bob = k;
          this.puppet.add('head', -8 * call * k);
          this.glow = 0.6 * k;
          this.expression = 'happy';
        },
      },
      // Follows a crewmate (Biddy, if she is out) in little hurried steps.
      follow: {
        weight: 2.6,
        length: [8, 12],
        when: () => this.still() && this.pick() !== null,
        start: () => {
          this.target = this.pick();
          this.retarget = 0;
          this.actSpeed = 1.9;
        },
        pose: (t) => {
          const m = this.target;
          this.bob = 1;
          this.expression = 'happy';
          if (!m || m.state !== 'here') {
            this.target = this.pick();
            return;
          }
          this.puppet.add('head', -4 + 3 * sin(t, 3));
          if (t - this.retarget > 0.5 && this.env) {
            this.retarget = t;
            const gap = Math.abs(m.s - this.s);
            const near = this.heightPx * 1.4 + m.footprint(this.env.frame).x;
            if (gap > near) {
              const way = this.toward(m);
              this.actSpeed = gap > near * 3 ? 2.6 : 1.7;
              this.walkTo(m.s - way * near * 0.9, m.depth);
            }
          }
          // Peeps when it has caught up.
          if (!this.walking && Math.abs(m.s - this.s) < this.heightPx * 3) {
            const c = Math.max(0, Math.sin(t * 6)) ** 4;
            this.jaw = 14 * c;
            this.cheep = c;
          }
        },
      },
    };
  }

  private tricks(): Record<string, Act> {
    return {
      // Falls asleep standing up, nodding lower each time, then topples onto its beak.
      topple: {
        weight: 1.8,
        length: [9, 9],
        when: this.still,
        start: () => {
          this.beat = 0;
        },
        pose: (t) => {
          const p = this.puppet;
          const drowse = span(t, 0.4, 2, 3.8, 4);
          const nod = Math.max(0, Math.sin(t * 2.4)) ** 2;
          p.add('head', (14 + 22 * nod) * drowse);
          p.add('body', 6 * drowse);
          this.puff = 0.3 * drowse;
          // The topple: a slow lean, then over onto the beak, and a nap there.
          this.tip = span(t, 3.8, 4.5, 6.5, 6.9);
          if (t > 4.3 && this.beat === 0) {
            this.beat = 1;
            p.kick('wing.L', 0, 0, 200);
            p.kick('wing.R', 0, 0, -200);
          }
          this.expression =
            t < 4.3 ? (t > 1.2 ? 'sleepy' : 'neutral') : t < 6.6 ? 'asleep' : 'surprised';
          if (t > 6.5 && this.beat === 1) {
            // Wakes with a start, hops, and looks around.
            this.beat = 2;
            p.kick('head', -200, 0, 0);
          }
          if (t > 6.5) {
            this.wings = 0.5 * (1 - ease(t, 7, 8));
            this.glow = 1 - ease(t, 6.5, 8);
            p.add('head', 0, 20 * sin(t, 0.8));
            this.lift =
              this.heightPx *
              0.35 *
              Math.max(0, Math.sin(((t - 6.5) / 0.6) * Math.PI)) *
              (t < 7.1 ? 1 : 0);
          }
        },
      },
      // Flaps the stubs and hops, again and again, and does not fly.
      flapHop: {
        weight: 2.2,
        length: [6, 6],
        face: 'determined',
        when: this.still,
        start: () => {
          this.hops = 0;
        },
        pose: (t) => {
          const p = this.puppet;
          const k = ease(t, 0, 0.3) * (1 - ease(t, 5.2, 6));
          const n = Math.floor((t - 0.5) / 1.1);
          const u = (t - 0.5) % 1.1;
          this.wings = 0.9 * k;
          this.flap = k;
          this.dance = k;
          // A crouch, a spring, a flat landing: nothing like flight.
          const crouch = u < 0.25 ? Math.sin((Math.PI * u) / 0.25) : 0;
          const air = u > 0.25 && u < 0.85 ? Math.sin((Math.PI * (u - 0.25)) / 0.6) : 0;
          if (t > 0.5 && t < 5.6) {
            if (n >= this.hops) this.hops = n + 1;
            this.lift = this.heightPx * 0.32 * air * (1 + 0.1 * n);
            p.add('body', -5 * crouch + 8 * air);
            p.add('leg.L', 18 * crouch - 25 * air);
            p.add('leg.R', 18 * crouch - 25 * air);
            this.jaw = 12 * air;
            p.add('head', -12 * air, 0, 6 * Math.sin(t * 14) * air);
          }
          // Out of puff: the head droops.
          if (t > 5.4) p.add('head', 14 * ease(t, 5.4, 5.9));
          this.expression = t > 5.3 ? 'sleepy' : 'determined';
        },
      },
    };
  }

  protected react(kind: Reaction, t: number) {
    const p = this.puppet;
    if (kind === 'poked') {
      // Peep! A jump, stubs out, beak wide, lights flashing.
      const k = span(t, 0, 0.1, 0.9, 1.5);
      this.jaw = 28 * span(t, 0.05, 0.15, 0.7, 1);
      this.wings = 0.9 * span(t, 0, 0.12, 0.9, 1.3);
      this.flap = k;
      this.lift = this.heightPx * 0.4 * (t < 0.5 ? Math.sin((Math.PI * t) / 0.5) : 0);
      this.glow = k;
      this.cheep = k;
      p.add('head', -14 * span(t, 0.05, 0.2, 0.5, 0.9));
      p.add('tail', 16 * k);
    } else if (kind === 'dizzy') {
      const k = 1 - ease(t, 2.4, 3.4);
      p.add('head', 10 * k * Math.cos(t * 5), 18 * k * Math.sin(t * 3), 26 * k * Math.sin(t * 5));
      p.add('body', 0, 0, 12 * k * Math.sin(t * 5));
      p.add('root', 0, 0, 9 * k * Math.sin(t * 5));
      this.wings = 0.3 * k;
      this.glow = k;
      this.dance = k;
    } else {
      const k = this.fade(t, 0.6);
      p.add('head', 8 * k * Math.sin(t * 8), 0, 6 * k * sin(t, 1.2));
      this.puff = 0.8 * k;
      this.glow = k;
      this.wings = 0.3 * k;
      this.flap = 0.5 * k;
      this.lift = this.heightPx * 0.06 * Math.max(0, Math.sin(t * 9)) * k;
      this.jaw = 14 * Math.max(0, Math.sin(t * 11)) * k;
      this.cheep = k;
    }
  }

  protected idle(t: number) {
    const p = this.puppet;
    this.jaw = 0;
    this.wings = 0;
    this.flap = 0;
    this.lift = 0;
    this.puff = 0;
    this.tip = 0;
    this.glow = 0;
    this.cheep = 0;
    this.dance = 0;
    this.bob = 0;
    this.actSpeed = 1.1;
    this.expression = this.hovered ? 'happy' : 'neutral';
    // Fidgety: quick head jerks and a fluff of the pods.
    const n = Math.floor(t / 1.7);
    const jerk =
      Math.abs(Math.sin(n * 61.7)) > 0.4 && t % 1.7 < 0.5 ? Math.sign(Math.sin(n * 5.1)) : 0;
    p.add('head', 2 * sin(t, 0.5), 20 * jerk * Math.min(1, (t % 1.7) * 8), 7 * jerk);
    p.add('body', 1.5 * sin(t, 0.4));
    p.add('tail', 3 * sin(t, 0.6));
    p.add('wing.L', 0, 0, 1.5 * sin(t, 0.25));
    p.add('wing.R', 0, 0, 1.5 * sin(t, 0.25, 0.4));
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    this.env = env;
    this.spec.speed = this.actSpeed;
    this.enjoy(dt, this.still());
    const H = this.heightPx;

    // Hurried little steps: quick feet, the whole ball bouncing and the head bobbing.
    const moving = clamp(this.stride / (H * 0.35), 0, 1);
    if (moving > 0.05) {
      const ph = this.gait * 1.6;
      const sw = Math.sin(ph) * moving;
      p.add('leg.L', 42 * sw);
      p.add('leg.R', -42 * sw);
      p.add('body', 3 + 4 * Math.cos(ph * 2) * moving, 0, 4 * sw);
      p.add('head', (4 + 9 * this.bob) * Math.cos(ph * 2) * moving);
      p.add('tail', 0, 0, -8 * sw);
      p.add('wing.L', 0, 0, 8 * Math.abs(sw));
      p.add('wing.R', 0, 0, -8 * Math.abs(sw));
      this.lift += H * (0.03 + 0.03 * this.bob) * Math.abs(Math.cos(ph)) * moving;
    }
    this.h = this.lift;

    p.add('jaw', this.jaw);
    const open = this.openS.update(dt, this.wings);
    const beat = Math.sin(env.time * 34) * this.flap;
    for (const [sfx, side] of SIDES)
      p.add(`wing.${sfx}`, -6 * open, 0, side * (62 * open + 22 * beat));

    const puff = this.puffS.update(dt, this.puff);
    if (puff > 0.01) p.stretch('body', 1 + 0.12 * puff, [0, 0, 1], 1 + 0.1 * puff);

    // Toppled forward onto its beak: the whole chick pitches over about its feet.
    const tip = this.tipS.update(dt, this.tip);
    if (Math.abs(tip) > 0.005) {
      p.add('root', 62 * tip);
      p.add('head', -18 * tip);
      p.add('leg.L', -30 * tip);
      p.add('leg.R', -30 * tip);
      p.add('wing.L', 0, 0, 30 * tip);
      p.add('wing.R', 0, 0, -30 * tip);
    }

    // Standing, it turns three-quarters on toward the middle so its profile shows.
    const middle = (env.frame.left + env.frame.right) / 2;
    const away = this.walking || this.act === 'follow';
    const turn = this.turn.update(dt, away ? 0 : Math.sign(middle - this.s) * 40);
    p.add('root', 0, turn);
    p.add('head', 0, -turn * 0.6);
  }

  protected after(_dt: number, env: Env) {
    this.lights(env.time);
  }

  /** The breast lamp shows its mood; the stub tips flash when it flaps. */
  private lights(t: number) {
    const tone = this.expression === 'neutral' ? BEACON.happy : BEACON[this.expression];
    const asleep = this.tipS.y;
    this.outfit.dot(
      0,
      clamp(
        0.4 + 0.6 * this.glow + 0.4 * this.cheep - 0.3 * asleep + (this.hovered ? 0.3 : 0),
        0,
        1,
      ),
      tone,
    );
    let tip = 0.25 + 0.4 * Math.max(0, Math.sin(t * 1.3)) ** 6;
    let colour: string | undefined;
    if (this.flap > 0.05 || this.dance > 0.05) {
      tip = 0.3 + 0.7 * Math.max(0, Math.sin(t * 14));
      colour = RAINBOW[Math.floor(t * 8) % RAINBOW.length];
    }
    if (this.act === 'dizzy') {
      tip = Math.random() < 0.5 ? 1 : 0.2;
      colour = RAINBOW[Math.floor(Math.random() * RAINBOW.length)];
    }
    this.outfit.dot(1, clamp(tip * (1 - 0.8 * asleep), 0, 1), colour);
    this.outfit.beacon(tone ?? '#ffcf5a');
  }
}
