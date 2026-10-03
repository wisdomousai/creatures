import type { Object3D } from 'three';
import { BEACON } from './bolt';
import { type Act, type Character, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import type { Anatomy } from './pet';
import { DOG_ACT_MOODS, dogMoods, Hound } from './dogs';
import { pulse, ramp } from './kitties';

/**
 * Scout, the robot border collie: young, quick and lean, black and white, with ears that
 * stand half up (the tips fold forward) and a long low tail with a white tip. He is
 * all attention. He watches the others as if they were sheep: he runs round to one side,
 * drops low and fixes a crewmate with "the eye" (every muscle still, only the pupils
 * wide), then circles them at a run, always outside their room, to bring them in, and
 * fixes them again. He also creeps up on a crewmate with the eye on them, and leaps for
 * a disc nobody has thrown, high, with a snap of the jaw at the top.
 *
 * Each white sock has a lit band that flashes as the foot lands.
 */
export const BORDERCOLLIE_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.3, 0.5],
    [0.7, 0.5],
  ],
  rx: 0.07,
  ry: 0.3,
  line: 0.036,
  mouth: null,
};

const COLLIE: Anatomy = {
  tail: ['tail.1', 'tail.2', 'tail.3', 'tail.4'],
  tailAxis: [0, 0.8, -0.6],
  earsHang: false,
  moods: dogMoods(-2),
  actMoods: {
    ...DOG_ACT_MOODS,
    herd: 'curious',
    theEye: 'annoyed',
    highCatch: 'happy',
    alertSit: 'curious',
  },
  lying: 'calm',
  hover: 'curious',
  drop: { stand: 0, sit: -0.09, lie: -0.15 },
  sit: -28,
  turn: 52,
};

export class Bordercollie extends Hound {
  protected readonly anatomy = COLLIE;
  protected readonly build = { middle: 0.33, spring: 1.4, speed: 1.9 };
  /** The sock lights: a flash per paw (FL FR BL BR). */
  private socks = [0, 0, 0, 0];

  constructor(model: Object3D) {
    super(
      {
        name: 'Scout',
        model: 'bordercollie',
        metres: 0.66,
        width: 0.85,
        size: 1.05,
        feels: {
          default: { f: 2.6, zeta: 0.55 },
          root: { f: 3.2, zeta: 0.55 },
          body: { f: 2.6, zeta: 0.6 },
          head: { f: 2.2, zeta: 0.5, r: 0.3 },
          jaw: { f: 6, zeta: 0.5 },
          'ear.L': { f: 4, zeta: 0.3 },
          'ear.R': { f: 4, zeta: 0.3 },
          'tail.1': { f: 3.6, zeta: 0.4 },
          'tail.2': { f: 4, zeta: 0.35 },
          'tail.3': { f: 4.5, zeta: 0.3 },
          'tail.4': { f: 5, zeta: 0.3 },
        },
        face: BORDERCOLLIE_FACE,
        eyes: 0.75,
        gaze: [
          { bone: 'head', yaw: 0.85, pitch: 0.9 },
          { bone: 'body', yaw: 0.25, pitch: 0 },
        ],
        reach: { yaw: 65, pitch: 30 },
        lag: 0.7,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 1.9,
      },
      model,
    );
    const all = { ...this.tricks(), ...this.doggy() };
    const mine: Record<string, number> = {
      scratch: 0.6,
      sniff: 0.6,
      yip: 0.8,
      playBow: 1.2,
      pant: 0.8,
      yawn: 0.6,
      howl: 0.4,
      dig: 0.5,
      greet: 1,
      chaseFly: 1,
      beg: 0.3,
      tailChase: 1.2,
      zoomies: 1.4,
      dozeOff: 0.5,
      watch: 1.8,
      tilt: 1,
      circle: 1.2,
      twirl: 1,
      rollOver: 0.5,
      shakeOff: 0.5,
      backWall: 0.6,
      frontLip: 0.6,
    };
    const common = this.commonActs();
    for (const k of ['idle', 'stroll', 'sit', 'nap', 'stand', 'stretch', 'startle'] as const) {
      this.acts[k] = common[k];
    }
    this.acts.lie = { ...common.lie, weight: 0.5 };
    this.acts.nap = { ...common.nap, weight: 0.8 };
    for (const [name, weight] of Object.entries(mine)) this.acts[name] = { ...all[name], weight };
    this.acts.love = all.love;
    this.acts.dizzy = { ...all.dizzy, weight: 0 };
    Object.assign(this.acts, this.moves());
  }

  /** "The eye": belly low, every muscle still, only the stare moves. `k` is 0..1. */
  private eye(k: number, mate: Character) {
    const p = this.puppet;
    this.lookAtMate(mate, 0.9);
    p.add('body', 18 * k);
    p.add('leg.FL', -48 * k);
    p.add('leg.FR', -48 * k);
    p.add('leg.BL', -10 * k);
    p.add('leg.BR', -10 * k);
    p.add('head', -8 * k);
    p.add('tail.1', -14 * k);
    this.extraLift = -0.07 * k;
    this.pupils = 1;
    this.emote = 'focused';
  }

  private moves(): Record<string, Act> {
    const p = () => this.puppet;
    const stand = () => this.standing;
    const others = () => stand() && this.others().length > 0;
    return {
      // Herds a crewmate: round to one side, down with the eye, a run round them, the eye again.
      herd: {
        weight: 2,
        length: [16, 16],
        when: others,
        start: () => {
          this.posture = 'stand';
          if (!this.pickMate()) return;
          this.run.phase = 0;
          const o = this.run.target;
          if (!o) return;
          const way = Math.sign(this.s - o.s) || 1;
          this.walkTo(o.s + way * (this.gap(o) + this.heightPx * 0.8), o.depth);
        },
        pose: (t) => {
          const o = this.run.target;
          if (!o || o.state !== 'here') return this.endAct();
          const r = this.run;
          if (r.phase === 0) {
            this.boost = 1.6;
            this.lookAtMate(o);
            this.emote = 'focused';
            if (t > 1 && this.stride < 4) {
              r.phase = 1;
              r.at = t;
              this.goal = null;
            }
            if (t > 6) {
              r.phase = 1;
              r.at = t;
            }
          } else if (r.phase === 1) {
            const w = t - r.at;
            this.eye(ramp(w, 0, 0.35), o);
            if (w > 2.2) {
              r.phase = 2;
              r.at = t;
              const rad = this.gap(o) * 1.05;
              this.go([
                { s: o.s - rad, depth: o.depth },
                { s: o.s, depth: clamp(o.depth + 0.55, 0, 1) },
                { s: o.s + rad, depth: o.depth },
                { s: o.s, depth: clamp(o.depth - 0.55, 0, 1) },
                { s: o.s - rad, depth: o.depth },
              ]);
            }
          } else if (r.phase === 2) {
            this.boost = 2.4;
            this.lookAtMate(o);
            p().add('body', -3);
            this.emote = 'focused';
            this.pupils = 1;
            if ((this.atStop && t - r.at > 0.5) || t - r.at > 8) {
              r.phase = 3;
              r.at = t;
              this.goal = null;
            }
          } else {
            const w = t - r.at;
            this.eye(ramp(w, 0, 0.3) * (1 - ramp(w, 1.8, 2.3)), o);
            if (w > 2.4) this.endAct();
          }
        },
      },
      // Creeps up on a crewmate with the eye on them, low and slow, and freezes.
      theEye: {
        weight: 1.4,
        length: [9, 9],
        when: others,
        start: () => {
          this.posture = 'stand';
          if (!this.pickMate()) return;
          this.run.phase = 0;
          const o = this.run.target;
          if (!o) return;
          const way = Math.sign(this.s - o.s) || 1;
          this.walkTo(o.s + way * (this.gap(o) + this.heightPx * 0.25), o.depth);
        },
        pose: (t) => {
          const o = this.run.target;
          if (!o || o.state !== 'here') return this.endAct();
          const r = this.run;
          if (r.phase === 0) {
            this.boost = 0.4;
            this.eye(ramp(t, 0, 0.5), o);
            p().add('leg.FL', 10 * sin(this.gait, 1));
            if ((t > 1.5 && this.stride < 3) || t > 5) {
              r.phase = 1;
              r.at = t;
              this.goal = null;
            }
          } else {
            this.eye(1, o);
            // A single paw lifts, ever so slightly, and stays there.
            p().add('leg.FL', 28 * ramp(t - r.at, 0.4, 0.8));
            if (t - r.at > 3.4) this.endAct();
          }
        },
      },
      // A leap for a disc nobody threw: high, back arched, a snap at the top, twice.
      highCatch: {
        weight: 1.8,
        length: [4.6, 4.6],
        when: stand,
        start: () => (this.run.n = 0),
        pose: (t) => {
          const at = [0.5, 2.5];
          const n = at.filter((a) => t > a).length;
          for (; this.run.n < n; this.run.n++) {
            this.hop.kick(3.4);
            this.flash(1);
          }
          const air = pulse(t, 0.5, 1.2) + pulse(t, 2.5, 1.2);
          const wind =
            ramp(t, 0.1, 0.45) * (t < 0.5 ? 1 : 0) +
            ramp(t, 2.1, 2.45) * (t > 2.4 && t < 2.5 ? 1 : 0);
          p().add('body', 16 * wind - 22 * air);
          this.frontLegs(-85 * air - 30 * wind);
          p().add('leg.BL', 28 * air);
          p().add('leg.BR', 28 * air);
          p().add('head', -34 * air);
          const snap = pulse(t, 0.95, 0.2) + pulse(t, 2.95, 0.2);
          this.mouth = 0.2 * air + 0.8 * snap;
          p().add('tail.1', -20 * air);
          this.eyes = { x: 0, y: -1 };
          this.pupils = 1;
          this.emote = t > 1.5 && t < 2.4 ? 'happy' : 'focused';
          if (t > 3.3) this.emote = 'love';
        },
      },
      // Sits bolt upright, ears pricked, eyes on everything that moves.
      alertSit: {
        weight: 1.2,
        length: [5, 7],
        when: () => !this.walking,
        start: () => (this.posture = 'sit'),
        pose: (t) => {
          p().add('head', -8, 14 * sin(t, 0.35));
          p().add('ear.L', 8, 0, 0);
          p().add('ear.R', 8, 0, 0);
          this.eyes = { x: 0.8 * sin(t, 0.35), y: -0.1 };
          this.pupils = 0.8;
          this.twitch(t, 8, 2.5);
        },
      },
    };
  }

  private flash(v: number) {
    this.socks.fill(Math.max(v, 0));
  }

  protected idle(t: number) {
    this.socks = this.socks.map((v) => v * 0.9);
    super.idle(t);
  }

  protected after(dt: number, env: Env) {
    super.after(dt, env);
    const moving = clamp(this.stride / (this.heightPx * 0.8), 0, 1);
    [0, 1, 2, 3].forEach((i) => {
      const diag = i === 0 || i === 3 ? 0 : Math.PI;
      const step = Math.max(0, Math.sin(this.gait + diag)) ** 3 * moving;
      const idle = 0.12 + 0.08 * Math.sin(env.time * 1.3 + i * 1.7);
      this.outfit?.dot(i, clamp(Math.max(step, this.socks[i], idle), 0, 1));
    });
    const happy = ['happy', 'love'].includes(this.expression) ? 0.5 : 0;
    this.outfit?.dot(4, clamp(0.3 + 0.3 * Math.sin(env.time * 4) + happy, 0, 1));
    this.outfit?.dot(5, clamp(0.35 + happy * 0.8, 0, 1));
    this.outfit?.beacon(BEACON[this.expression] ?? '#f4f4f1');
  }
}
