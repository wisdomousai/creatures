import type { Object3D } from 'three';
import { BEACON } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import type { Anatomy, Feeling } from './pet';
import { DOG_ACT_MOODS, dogMoods, Hound } from './dogs';
import { ramp } from './kitties';

/**
 * Toast, the robot corgi: small and long on very short legs, with ears far too big for
 * him and no tail to speak of. His signature is the butt wiggle: his rump is on its own
 * joint at the waist, so when he is pleased the whole back half swings while the front
 * half stays put, and his two rump lamps flash in turn. The other is the sploot: down
 * flat on his belly with his hind legs stretched out behind him like a frog.
 *
 * He also lies down as a loaf of bread, herds a crewmate round the floor by running
 * circles at their heels (a yip at each turn) and scurries about the box in a blur of
 * short legs.
 */
export const CORGI_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.3, 0.5],
    [0.7, 0.5],
  ],
  rx: 0.09,
  ry: 0.3,
  line: 0.035,
  mouth: null,
};

const CORGI: Anatomy = {
  tail: ['tail.1', 'tail.2'],
  tailAxis: [0, 0.75, 0.66],
  earsHang: false,
  moods: dogMoods(0),
  actMoods: {
    ...DOG_ACT_MOODS,
    buttWiggle: 'love',
    sploot: 'happy',
    loaf: 'sleepy',
    herd: 'happy',
    scurry: 'happy',
  },
  lying: 'calm',
  hover: 'love',
  drop: { stand: 0, sit: -0.04, lie: -0.08 },
  sit: -22,
  turn: 55,
};

export class Corgi extends Hound {
  protected readonly anatomy = CORGI;
  protected readonly build = { middle: 0.2, spring: 0.8, speed: 1.4 };
  /** How hard the rump lamps flash with the wiggle, 0..1. */
  private lamps = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Toast',
        model: 'corgi',
        metres: 0.58,
        width: 0.7,
        size: 0.85,
        feels: {
          default: { f: 2.2, zeta: 0.55 },
          root: { f: 3, zeta: 0.55 },
          body: { f: 2, zeta: 0.6 },
          rump: { f: 3.2, zeta: 0.35 },
          head: { f: 1.9, zeta: 0.5, r: 0.3 },
          jaw: { f: 6, zeta: 0.5 },
          'ear.L': { f: 3, zeta: 0.22 },
          'ear.R': { f: 3, zeta: 0.22 },
          'tail.1': { f: 5, zeta: 0.4 },
          'tail.2': { f: 5, zeta: 0.3 },
        },
        face: CORGI_FACE,
        eyes: 0.6,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.9 },
          { bone: 'body', yaw: 0.2, pitch: 0 },
        ],
        reach: { yaw: 60, pitch: 30 },
        lag: 1,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 1.4,
      },
      model,
    );
    this.floppy = 0.3;
    const all = { ...this.tricks(), ...this.doggy() };
    const mine: Record<string, number> = {
      scratch: 0.6,
      sniff: 0.8,
      yip: 1.2,
      playBow: 0.9,
      pant: 0.5,
      yawn: 0.6,
      tilt: 1,
      watch: 0.9,
      greet: 0.9,
      dig: 0.5,
      chaseFly: 0.5,
      twirl: 1,
      rollOver: 0.8,
      tailChase: 0.9,
      dozeOff: 0.6,
      backWall: 0.5,
      frontLip: 0.5,
      circle: 0.4,
      sneeze: 0.4,
      shakeOff: 0.5,
      beg: 0.6,
      bell: 0.4,
      fallOver: 0.3,
    };
    const common = this.commonActs();
    for (const k of ['idle', 'stroll', 'sit', 'nap', 'stand', 'stretch', 'startle'] as const) {
      this.acts[k] = common[k];
    }
    this.acts.lie = { ...common.lie, weight: 0.5 };
    for (const [name, weight] of Object.entries(mine)) this.acts[name] = { ...all[name], weight };
    this.acts.love = all.love;
    this.acts.dizzy = { ...all.dizzy, weight: 0 };
    Object.assign(this.acts, this.moves());
  }

  private moves(): Record<string, Act> {
    const p = () => this.puppet;
    const stand = () => this.standing;
    return {
      // The signature: the back half swings from the waist, the front half stays put.
      buttWiggle: {
        weight: 2.2,
        length: [4.4, 4.4],
        when: stand,
        start: () => (this.posture = 'stand'),
        pose: (t) => {
          const k = ramp(t, 0, 0.3) * (1 - ramp(t, 3.6, 4.4));
          const w = sin(t, 3.6);
          p().add('rump', 0, 34 * k * w);
          p().add('body', 0, -6 * k * w);
          p().add('head', 0, 4 * k * w);
          p().add('tail.1', 0, 28 * k * w);
          p().add('tail.2', 0, 0, 20 * k * sin(t, 3.6, -0.12));
          this.extraLift = 0.004 * k * Math.abs(w);
          this.lamps = k;
          this.mouth = 0.3 * k;
          this.emote = 'love';
          this.pupils = 1;
        },
      },
      // Flat on his belly, hind legs stretched out behind him like a frog.
      sploot: {
        weight: 1.6,
        length: [9, 9],
        when: () => this.still,
        start: () => (this.posture = 'stand'),
        pose: (t) => {
          if (t > 0.5 && t < 8.2) this.posture = 'lie';
          if (t > 8.2) this.posture = 'stand';
          const k = ramp(t, 0.6, 1.5) * (1 - ramp(t, 8.2, 8.6));
          // The lying pose folds the hind legs forward; undo it, and send them back.
          p().add('leg.BL', 160 * k, 0, 24 * k);
          p().add('leg.BR', 160 * k, 0, -24 * k);
          p().add('head', 4 * k);
          p().add('rump', 0, 3 * sin(t, 0.4) * k);
          this.emote = t > 3 && t < 8 ? 'sleepy' : 'happy';
          if (t > 5 && t < 5.6) this.emote = 'happy';
          this.lamps = 0.3 * k;
        },
      },
      // Down as a loaf: paws tucked right under, eyes half shut.
      loaf: {
        weight: 1.2,
        length: [8, 8],
        when: () => this.still,
        start: () => (this.posture = 'lie'),
        pose: (t) => {
          const k = ramp(t, 0.5, 1.2) * (1 - ramp(t, 7.2, 7.8));
          p().add('leg.FL', 70 * k);
          p().add('leg.FR', 70 * k);
          p().add('leg.BL', 40 * k);
          p().add('leg.BR', 40 * k);
          p().add('head', -4 * k);
          this.emote = t > 3 ? 'sleepy' : 'neutral';
          if (t > 7.4) this.posture = 'stand';
        },
      },
      // Runs circles round a crewmate at their heels, low, a yip at every turn.
      herd: {
        weight: 1.4,
        length: [10, 10],
        when: () => stand() && this.others().length > 0,
        start: () => {
          this.posture = 'stand';
          if (!this.pickMate()) return;
          this.run.phase = 0;
          this.run.at = -9;
          this.run.dir = 1;
        },
        pose: (t) => {
          const o = this.run.target;
          if (!o || o.state !== 'here') return this.endAct();
          const r = this.run;
          if (t - r.at > 1.5) {
            r.at = t;
            r.dir = -r.dir;
            r.phase++;
            this.walkTo(
              o.s + r.dir * this.gap(o) * 1.15,
              clamp(o.depth + (r.phase % 2 ? 0.35 : -0.25), 0, 1),
            );
            this.hop.kick(0.7);
            this.mouth = 1;
          }
          this.boost = 1.9;
          this.lookAtMate(o, 0.9);
          p().add('body', 9);
          p().add('rump', 0, 10 * sin(t, 4));
          this.extraLift = -0.01;
          this.mouth = Math.max(this.mouth * 0.9, 0.2);
          this.emote = 'focused';
          this.pupils = 1;
          this.lamps = 0.6;
          if (t > 9) this.endAct();
        },
      },
      // A blur of short legs: dashing about the box, rump swinging, ears flat.
      scurry: {
        weight: 1.3,
        length: [6, 6],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.run.n = 0;
          this.go([this.somewhere(), this.somewhere(), this.somewhere()]);
        },
        pose: (t) => {
          this.boost = 2.9;
          const n = Math.floor(t / 0.4);
          if (n >= this.run.n && this.walking) {
            this.run.n = n + 1;
            this.hop.kick(0.5);
          }
          p().add('rump', 0, 14 * sin(t, 5));
          p().add('body', -3);
          p().add('ear.L', -25, 0, -10);
          p().add('ear.R', -25, 0, 10);
          this.mouth = 0.35;
          this.emote = 'happy';
          this.pupils = 1;
          this.lamps = 0.8;
          if (this.atStop && t > 0.5) this.endAct();
        },
      },
    };
  }

  protected idle(t: number) {
    this.lamps = 0;
    super.idle(t);
  }

  protected express(dt: number, env: Env, f: Feeling) {
    super.express(dt, env, f);
    // Whatever pleases him swings the back half: the rump follows the wag.
    const [wag] = f.wag ?? [0, 0];
    this.puppet.add('rump', 0, wag * 0.4 * Math.sin(this.wagPhase) * (this.walking ? 0.5 : 1));
    this.puppet.add('body', 0, -wag * 0.07 * Math.sin(this.wagPhase));
  }

  protected after(dt: number, env: Env) {
    super.after(dt, env);
    const [wag] = this.anatomy.moods[this.mood].wag ?? [0, 0];
    const s = Math.sin(this.wagPhase);
    const level = clamp(this.lamps + wag / 40, 0, 1);
    const idle = 0.18 + 0.1 * Math.sin(env.time * 1.3);
    this.outfit?.dot(0, clamp(Math.max(idle, level * Math.max(0, s)), 0, 1));
    this.outfit?.dot(1, clamp(Math.max(idle, level * Math.max(0, -s)), 0, 1));
    const pleased = ['happy', 'love'].includes(this.expression) ? 0.5 : 0;
    this.outfit?.dot(2, clamp(0.3 + 0.3 * Math.sin(env.time * 4) + pleased, 0, 1));
    this.outfit?.beacon(BEACON[this.expression] ?? '#f4f4f1');
  }
}
