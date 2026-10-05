import type { Object3D } from 'three';
import { BEACON } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import type { Anatomy } from './pet';
import { DOG_ACT_MOODS, dogMoods, Hound } from './dogs';
import { pulse, ramp } from './kitties';

/**
 * Duke, the robot Great Dane: huge and slender, all legs, a gentle giant. He lumbers rather
 * than trots, folds down in stages like a deckchair, and leans his whole weight against
 * whoever he likes. He is scared of small things: put a tiny crewmate near him and he
 * backs away, tail tucked, knees knocking, never taking his eyes off it. He is gentle with
 * the big ones, nosing at them from a great height.
 *
 * His heart is a lit plate on his chest (it beats slowly, faster when he is scared) and
 * the tip of his long tail glints as it wags.
 */
export const GREATDANE_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.3, 0.5],
    [0.7, 0.5],
  ],
  rx: 0.075,
  ry: 0.26,
  line: 0.035,
  mouth: null,
};

const moods = dogMoods(-6);
moods.alarmed = { face: 'surprised', carriage: -50, ears: -12, out: 20, swivel: 0 };

const GREATDANE: Anatomy = {
  tail: ['tail.1', 'tail.2', 'tail.3'],
  tailAxis: [0, 0.93, -0.37],
  earsHang: false,
  moods,
  actMoods: {
    ...DOG_ACT_MOODS,
    leanOn: 'happy',
    backAway: 'sad',
    galumph: 'happy',
    deckchair: 'sleepy',
    nuzzle: 'love',
    giantSigh: 'sleepy',
  },
  lying: 'calm',
  hover: 'happy',
  drop: { stand: 0, sit: -0.28, lie: -0.36 },
  sit: -20,
  turn: 52,
};

export class Greatdane extends Hound {
  static readonly terms =
    'doggo pooch dane giant huge big tall large long legs slender grey gray silver white blue gentle clumsy lumber lean shy';

  protected readonly anatomy = GREATDANE;
  protected readonly build = { middle: 0.55, spring: 0.7, speed: 1.2 };
  /** How scared he is right now, 0..1: the heart beats faster. */
  private fear = 0;
  private beat = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Duke',
        model: 'greatdane',
        metres: 1.2,
        width: 0.7,
        size: 1.4,
        feels: {
          default: { f: 1.6, zeta: 0.6 },
          root: { f: 2.4, zeta: 0.6 },
          body: { f: 1.4, zeta: 0.7 },
          head: { f: 1.5, zeta: 0.55, r: 0.3 },
          jaw: { f: 5, zeta: 0.5 },
          'ear.L': { f: 2.4, zeta: 0.3 },
          'ear.R': { f: 2.4, zeta: 0.3 },
          'tail.1': { f: 3.2, zeta: 0.45 },
          'tail.2': { f: 3.2, zeta: 0.35 },
          'tail.3': { f: 3.2, zeta: 0.3 },
        },
        face: GREATDANE_FACE,
        eyes: 0.83,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.9 },
          { bone: 'body', yaw: 0.15, pitch: 0 },
        ],
        reach: { yaw: 60, pitch: 30 },
        lag: 0.8,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 1.2,
      },
      model,
    );
    this.floppy = 0.3;
    const all = { ...this.tricks(), ...this.doggy() };
    const mine: Record<string, number> = {
      scratch: 0.5,
      sniff: 0.6,
      pant: 0.4,
      yawn: 0.9,
      tilt: 1,
      watch: 1,
      greet: 0.9,
      beg: 0.4,
      howl: 0.3,
      shakeOff: 0.4,
      frontLip: 0.6,
      backWall: 0.5,
      circle: 0.4,
      dozeOff: 0.7,
      sneeze: 0.4,
      bell: 0.4,
      fallOver: 0.3,
      playBow: 0.6,
    };
    const common = this.commonActs();
    for (const k of ['idle', 'stroll', 'sit', 'nap', 'stand', 'stretch', 'startle'] as const) {
      this.acts[k] = common[k];
    }
    this.acts.lie = { ...common.lie, weight: 0.8 };
    for (const [name, weight] of Object.entries(mine)) this.acts[name] = { ...all[name], weight };
    this.acts.love = all.love;
    this.acts.dizzy = { ...all.dizzy, weight: 0 };
    Object.assign(this.acts, this.moves());
  }

  /** A crewmate much smaller than he is. */
  private smallMate() {
    return this.others().filter((o) => o.heightPx < this.heightPx * 0.62);
  }

  private moves(): Record<string, Act> {
    const p = () => this.puppet;
    const stand = () => this.standing;
    return {
      // Leans his whole weight against you: tips over to one side, head heavy, eyes shut.
      leanOn: {
        weight: 1.6,
        length: [5.5, 5.5],
        when: stand,
        start: () => {
          this.posture = 'stand';
          const pointer = this.env.pointer;
          this.run.dir = pointer.present ? Math.sign(pointer.x - this.s) || 1 : this.roomy();
        },
        pose: (t) => {
          const k = ramp(t, 0, 1.2) * (1 - ramp(t, 4.4, 5.5));
          const d = this.run.dir;
          this.rollTarget = d * 7 * k;
          p().add('root', 0, d * 24 * k);
          p().add('head', 10 * k, d * 20 * k, -d * 12 * k);
          p().add('leg.FL', 0, 0, d * 5 * k);
          p().add('leg.FR', 0, 0, d * 5 * k);
          p().add('body', 0, -d * 6 * k);
          this.mouth = 0.08 * k;
          this.emote = ramp(t, 1.2, 1.8) > 0.5 ? 'sleepy' : 'happy';
          if (t > 4.6 && !this.run.done) {
            this.run.done = true;
            p().kick('head', -250);
          }
        },
      },
      // A tiny crewmate: he backs away from it, facing it, knees knocking, tail tucked.
      backAway: {
        weight: 2,
        length: [7.5, 7.5],
        when: () => stand() && this.smallMate().length > 0,
        start: () => {
          this.posture = 'stand';
          const all = this.smallMate();
          this.run.target = all[Math.floor(Math.random() * all.length)] ?? null;
          this.run.phase = 0;
        },
        pose: (t) => {
          const o = this.run.target;
          if (!o || o.state !== 'here') return this.endAct();
          const side = Math.sign(o.s - this.s) || 1;
          const k = ramp(t, 0, 0.4) * (1 - ramp(t, 6.6, 7.5));
          this.lookAtMate(o, 0.6);
          // Facing it all the while, whichever way he walks.
          p().add('root', 0, -this.heading.y * k + side * 48 * k);
          p().add('head', -6 * k);
          if (t > 0.6 && t < 5) {
            this.walkTo(this.s - side * this.heightPx * 1.6, this.depth);
            this.boost = 0.8;
          } else if (t >= 5) this.goal = null;
          p().add('body', 0, 0, 2.5 * sin(t, 9) * k);
          for (const l of ['FL', 'FR', 'BL', 'BR'])
            p().add(`shin.${l}`, 14 * k + 6 * sin(t, 11, l.length) * k);
          this.extraLift = -0.04 * k;
          this.fear = k;
          this.emote = 'surprised';
          this.pupils = 1;
          if (t < 0.4) p().kick('head', -200);
        },
      },
      // Awkward long legs at speed: a gallop that goes everywhere at once.
      galumph: {
        weight: 1,
        length: [5, 5],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.run.n = 0;
          this.go([this.somewhere(), this.somewhere()]);
        },
        pose: (t) => {
          this.boost = 2.1;
          const n = Math.floor(t / 0.45);
          if (n >= this.run.n && this.walking) {
            this.run.n = n + 1;
            this.hop.kick(1.2 * this.build.spring);
          }
          for (const l of ['FL', 'FR', 'BL', 'BR'])
            p().add(`shin.${l}`, 25 * Math.max(0, sin(t, 4.4, l.length * 0.6)));
          p().add('head', -4 * sin(t, 2.2), 0, 8 * sin(t, 2.2));
          this.mouth = 0.35;
          this.emote = 'happy';
          this.pupils = 1;
          if (this.atStop && t > 0.8) this.endAct();
        },
      },
      // Folds down in stages like a deckchair: front end, then the back, then the head.
      deckchair: {
        weight: 1.2,
        length: [9, 9],
        when: () => this.posture === 'stand' && !this.walking,
        start: () => {
          this.posture = 'stand';
          this.run.phase = 0;
        },
        pose: (t) => {
          if (t > 1.4 && this.run.phase === 0) {
            this.run.phase = 1;
            this.posture = 'sit';
            this.hop.kick(0.3);
          }
          if (t > 3 && this.run.phase === 1) {
            this.run.phase = 2;
            this.posture = 'lie';
          }
          const k = ramp(t, 3.4, 4.6);
          p().add('head', 12 * k);
          this.emote = t > 4.6 ? 'asleep' : 'sleepy';
          if (t > 8) this.posture = 'stand';
        },
      },
      // Walks up to a big crewmate and lowers his great head to nose at them gently.
      nuzzle: {
        weight: 1,
        length: [9, 9],
        when: () => stand() && this.others().some((o) => o.heightPx >= this.heightPx * 0.62),
        start: () => {
          this.posture = 'stand';
          const all = this.others().filter((o) => o.heightPx >= this.heightPx * 0.62);
          this.run.target = all[Math.floor(Math.random() * all.length)] ?? null;
          this.run.phase = 0;
        },
        pose: (t) => {
          const o = this.run.target;
          if (!o || o.state !== 'here') return this.endAct();
          const r = this.run;
          this.lookAtMate(o);
          if (r.phase === 0) {
            this.walkTo(o.s - Math.sign(o.s - this.s) * this.gap(o), o.depth);
            if (t > 1 && this.stride < 4) {
              r.phase = 1;
              r.at = t;
            }
            if (t > 6) this.endAct();
          } else {
            const u = t - r.at;
            const k = ramp(u, 0, 0.8) * (1 - ramp(u, 3.4, 4.2));
            p().add('head', 32 * k + 4 * sin(u, 1.2) * k);
            p().add('body', 5 * k);
            this.mouth = 0.05;
            this.emote = 'love';
            if (u > 4.2) this.endAct();
          }
        },
      },
      // A great sigh: chest swells, head lifts and drops, ears flatten.
      giantSigh: {
        weight: 0.9,
        length: [3.4, 3.4],
        when: () => !this.walking,
        pose: (t) => {
          const k = pulse(t, 0.2, 1.4);
          const o = pulse(t, 1.4, 1.4);
          p().add('head', -14 * k + 24 * o);
          p().add('body', -4 * k + 3 * o);
          this.mouth = 0.2 * o;
          p().add('ear.L', 0, 0, 25 * o);
          p().add('ear.R', 0, 0, -25 * o);
          this.emote = o > 0.2 ? 'sleepy' : 'neutral';
          this.extraLift = -0.01 * o;
        },
      },
    };
  }

  protected idle(t: number) {
    this.fear = 0;
    super.idle(t);
  }

  protected sitting() {
    super.sitting();
    const p = this.puppet;
    p.add('shin.BL', 150);
    p.add('shin.BR', 150);
  }

  protected lying(breath: number) {
    super.lying(breath);
    const p = this.puppet;
    p.add('shin.FL', 100);
    p.add('shin.FR', 100);
    p.add('shin.BL', 110);
    p.add('shin.BR', 110);
  }

  protected pose(dt: number, env: Env) {
    super.pose(dt, env);
    // Long legs fold up at the knee as each swings forward.
    const moving = Math.min(1, this.stride / (this.heightPx * 0.8));
    if (moving > 0.05) {
      const a = Math.sin(this.gait);
      const lift = 45 * moving;
      this.puppet.add('shin.FL', Math.max(0, -a) * lift);
      this.puppet.add('shin.BR', Math.max(0, -a) * lift);
      this.puppet.add('shin.FR', Math.max(0, a) * lift);
      this.puppet.add('shin.BL', Math.max(0, a) * lift);
    }
  }

  protected after(dt: number, env: Env) {
    super.after(dt, env);
    // His heart beats slowly (quicker when he is frightened); his tail tip glints as it wags.
    this.beat += dt * (1 + 3 * this.fear) * 2 * Math.PI * 0.6;
    const pulseHeart = 0.45 + 0.4 * Math.max(0, Math.sin(this.beat)) ** 3;
    this.outfit?.dot(0, clamp(pulseHeart + 0.2 * this.fear, 0, 1));
    const happy = this.mood === 'happy' || this.mood === 'love' ? 0.4 : 0;
    this.outfit?.dot(1, clamp(0.25 + 0.25 * Math.sin(env.time * 3) + happy, 0, 1));
    this.outfit?.beacon(BEACON[this.expression] ?? '#f4f4f1');
  }
}
