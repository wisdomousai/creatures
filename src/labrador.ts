import type { Object3D } from 'three';
import { BEACON } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import type { Anatomy } from './pet';
import { DOG_ACT_MOODS, dogMoods, Hound } from './dogs';
import { pulse, ramp } from './kitties';

/**
 * Maple, the robot Labrador, a senior: broad, solid, slow and stiff, with a grey muzzle.
 * She gets up in stages (the front end first, a pause, then the back end, with a creak and
 * a wobble), stretches slowly, and flops down with a sigh. She still loves a ball: she
 * throws her tennis ball, goes after it at her own pace, and brings it back, or carries it
 * across to a crewmate. Her favourite thing is a long nap, in which she dreams (her legs
 * twitch) and thumps the floor with her tail, happy, without waking.
 *
 * Her heart lamp beats slowly; her tail tip glints at every thump.
 */
export const LABRADOR_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.3, 0.5],
    [0.7, 0.5],
  ],
  rx: 0.085,
  ry: 0.26,
  line: 0.035,
  mouth: null,
};

const moods = dogMoods(-8);
moods.calm = { ...moods.calm, wag: [10, 1] };

const LABRADOR: Anatomy = {
  tail: ['tail.1', 'tail.2', 'tail.3'],
  tailAxis: [0, 0.95, -0.3],
  earsHang: true,
  moods,
  actMoods: {
    ...DOG_ACT_MOODS,
    stand: 'sleepy',
    fetch: 'happy',
    bringBall: 'happy',
    napThump: 'asleep',
    stiffStretch: 'sleepy',
    sighFlop: 'sleepy',
  },
  lying: 'calm',
  hover: 'happy',
  drop: { stand: 0, sit: -0.12, lie: -0.18 },
  sit: -18,
  turn: 55,
};

export class Labrador extends Hound {
  protected readonly anatomy = LABRADOR;
  protected readonly build = {
    middle: 0.3,
    prop: { bone: 'ball', rest: [0.3, 0.1] as [number, number], radius: 0.05 },
    spring: 0.5,
    speed: 0.95,
  };
  private carrying = false;
  private origin = 0;
  private beat = 0;
  private glint = 0;
  private creak = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Maple',
        model: 'labrador',
        metres: 0.65,
        width: 0.72,
        size: 1.1,
        feels: {
          default: { f: 1.5, zeta: 0.65 },
          root: { f: 2.2, zeta: 0.65 },
          body: { f: 1.3, zeta: 0.75 },
          head: { f: 1.4, zeta: 0.6, r: 0.3 },
          jaw: { f: 5, zeta: 0.55 },
          'ear.L': { f: 2.4, zeta: 0.25 },
          'ear.R': { f: 2.4, zeta: 0.25 },
          'tail.1': { f: 3, zeta: 0.45 },
          'tail.2': { f: 3, zeta: 0.4 },
          'tail.3': { f: 3, zeta: 0.35 },
        },
        face: LABRADOR_FACE,
        eyes: 0.84,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.9 },
          { bone: 'body', yaw: 0.15, pitch: 0 },
        ],
        reach: { yaw: 55, pitch: 25 },
        lag: 0.7,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [50, 110],
        speed: 0.95,
      },
      model,
    );
    const all = { ...this.tricks(), ...this.doggy() };
    const mine: Record<string, number> = {
      scratch: 0.6,
      sniff: 0.9,
      pant: 1,
      yawn: 1,
      tilt: 1,
      watch: 1,
      greet: 0.8,
      beg: 0.5,
      howl: 0.3,
      dig: 0.3,
      chaseFly: 0.5,
      dozeOff: 1,
      backWall: 0.3,
      frontLip: 0.3,
      circle: 0.3,
      sneeze: 0.5,
      shakeOff: 0.4,
      bell: 0.4,
      fallOver: 0.3,
      playBow: 0.3,
      rollOver: 0.3,
    };
    const common = this.commonActs();
    for (const k of ['idle', 'stroll', 'sit', 'stretch', 'startle'] as const) {
      this.acts[k] = common[k];
    }
    this.acts.nap = { ...common.nap, weight: 1.2 };
    this.acts.lie = { ...common.lie, weight: 1.5 };
    for (const [name, weight] of Object.entries(mine)) this.acts[name] = { ...all[name], weight };
    this.acts.love = all.love;
    this.acts.dizzy = { ...all.dizzy, weight: 0 };
    Object.assign(this.acts, this.moves());
  }

  private carry(lift = 0.4, reach = 0.38) {
    this.carrying = true;
    this.keepInMouth(reach, lift);
  }

  private drop(ahead = 0.38) {
    this.carrying = false;
    const yaw = this.puppet.current('root')[1];
    this.toy.s = this.s + Math.sin(yaw * (Math.PI / 180)) * ahead * this.px;
    this.toy.v = 0;
    this.toyAhead = Math.cos(yaw * (Math.PI / 180)) * ahead - 0.1;
  }

  private moves(): Record<string, Act> {
    const p = () => this.puppet;
    const stand = () => this.standing;
    return {
      // Gets up in stages: front end first, a pause, the back end, a creak and a wobble.
      stand: {
        weight: 2,
        length: [4.4, 4.4],
        when: () => this.posture !== 'stand' && this.still,
        start: () => {
          this.run.phase = this.posture === 'lie' ? 0 : 1;
        },
        pose: (t) => {
          const r = this.run;
          this.creak = 1;
          if (r.phase === 0) {
            // Head up, a heave, front legs pushing.
            p().add('head', -10 * ramp(t, 0.2, 0.9));
            p().add('body', 0, 0, 1.5 * sin(t, 8));
            this.emote = 'sleepy';
            if (t > 1.1) {
              r.phase = 1;
              this.posture = 'sit';
              this.hop.kick(0.25);
              p().kick('head', -120);
            }
          } else if (r.phase === 1) {
            // Sitting up, the back end not quite ready.
            p().add('leg.BL', 0, 0, 3 * sin(t, 9));
            p().add('leg.BR', 0, 0, -3 * sin(t, 9));
            this.emote = 'sleepy';
            if (t > (r.n ? 0.5 : 2.3)) {
              r.phase = 2;
              this.posture = 'stand';
              this.hop.kick(0.35);
              p().kick('body', -90);
            }
          } else {
            // Up, and a little unsteady for a moment.
            const k = 1 - ramp(t, 2.6, 4);
            p().add('leg.BL', 0, 0, 3 * sin(t, 7) * k);
            p().add('leg.BR', 0, 0, -3 * sin(t, 7) * k);
            p().add('body', 0, 0, 1.5 * sin(t, 5) * k);
            this.emote = t > 3 ? 'neutral' : 'sleepy';
          }
        },
      },
      // A tennis ball: she throws it, goes after it at her own pace, brings it back.
      fetch: {
        weight: 1.6,
        length: [19, 19],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.toy.on = true;
          this.toy.gone = 0;
          this.toy.s = this.s;
          this.run.dir = this.roomy();
          this.origin = this.s;
          this.run.phase = 0;
        },
        pose: (t) => {
          const r = this.run;
          const d = this.toy.s - this.s;
          if (r.phase === 0) {
            const k = ramp(t, 0.3, 1.4);
            this.carry();
            p().add('head', -22 * k);
            p().add('body', -5 * k);
            this.emote = 'focused';
            if (t > 1.6) {
              r.phase = 1;
              this.carrying = false;
              this.toyLift = 0;
              this.toy.v = r.dir * this.heightPx * 4.2;
              this.hop.kick(0.5);
              p().kick('head', 400);
            }
          } else if (r.phase === 1) {
            const flying = Math.abs(this.toy.v) > this.heightPx * 0.8;
            this.walkTo(this.toy.s, this.depth);
            this.boost = flying ? 1.9 : 1.5;
            this.lookAtFloor(this.toy.s);
            this.mouth = 0.3;
            this.emote = 'happy';
            this.pupils = 1;
            if (!flying && Math.abs(d) < this.heightPx * 0.4) {
              r.phase = 2;
              r.at = t;
              this.goal = null;
              this.hop.kick(0.4);
            }
            if (t > 11) r.phase = 2;
          } else if (r.phase === 2) {
            this.carry();
            const back = t - r.at;
            this.emote = 'happy';
            p().add('head', -8 * ramp(back, 0, 0.5));
            if (back > 0.6) {
              this.walkTo(this.origin, this.depth);
              this.boost = 1.1;
            }
            if (back > 1.2 && this.atStop) {
              this.drop();
              r.phase = 3;
              r.at = t;
              this.posture = 'sit';
            }
            if (back > 8) {
              this.drop();
              r.phase = 3;
              r.at = t;
            }
          } else {
            // Drops it, sits, and waits for praise; the tail thumps.
            this.lookAtFloor(this.toy.s);
            p().add('head', 0, 0, 8 * this.run.dir);
            this.mouth = 0.25;
            this.emote = 'love';
            if (t - r.at > 2.8) this.endAct();
          }
        },
      },
      // Carries the ball to a crewmate and lays it at their feet.
      bringBall: {
        weight: 1.1,
        length: [11, 11],
        when: () => stand() && this.others().length > 0,
        start: () => {
          this.posture = 'stand';
          if (!this.pickMate()) return;
          this.toy.on = true;
          this.toy.gone = 0;
          this.toy.s = this.s;
          this.run.phase = 0;
        },
        pose: (t) => {
          const o = this.run.target;
          if (!o || o.state !== 'here') return this.endAct();
          const r = this.run;
          const way = Math.sign(o.s - this.s) || 1;
          if (r.phase === 0) {
            this.carry();
            this.walkTo(o.s - way * this.gap(o), o.depth);
            this.boost = 1;
            p().add('head', -8);
            this.emote = 'happy';
            this.lookAtMate(o, 0.5);
            if (t > 2 && this.stride < 4) {
              this.drop(0.4);
              r.phase = 1;
              r.at = t;
              this.hop.kick(0.4);
            }
            if (t > 8) this.endAct();
          } else {
            this.lookAtMate(o);
            this.mouth = 0.25;
            this.emote = 'love';
            this.pupils = 1;
            p().add('tail.1', 0, 14 * sin(t, 2.4));
            if (t - r.at > 3.4) this.endAct();
          }
        },
      },
      // A long nap: breathing slowly, legs twitching in a dream, now and then a happy thump of the tail.
      napThump: {
        weight: 2.4,
        length: [18, 18],
        when: () => this.still,
        start: () => {
          this.posture = 'lie';
          this.run.n = 0;
        },
        pose: (t) => {
          const k = ramp(t, 0.5, 1.5);
          p().add('head', 14 * k + 3 * sin(t, 0.25));
          const thumps = [4.2, 4.9, 10.5, 11.2, 11.9];
          const n = thumps.filter((a) => t > a).length;
          for (; this.run.n < n; this.run.n++) {
            p().kick('tail.1', 520);
            p().kick('tail.2', 300);
            this.hop.kick(0.2);
            this.glint = 1;
          }
          const dreaming = pulse(t, 3.8, 2.4) + pulse(t, 10, 3);
          p().add('leg.FL', 12 * dreaming * sin(t, 6));
          p().add('leg.BR', 10 * dreaming * sin(t, 5.5, 0.3));
          p().add('ear.L', 0, 0, 8 * dreaming * sin(t, 6.5));
          this.mouth = 0.08 * dreaming * Math.max(0, sin(t, 4));
          const near = thumps.some((a) => t > a && t < a + 0.5);
          this.emote = near ? 'happy' : 'asleep';
        },
      },
      // A slow, creaky stretch: chest down, a long yawn, a shake of the hindquarters.
      stiffStretch: {
        weight: 1.3,
        length: [5, 5],
        when: stand,
        pose: (t) => {
          const k = ramp(t, 0, 1.6) * (1 - ramp(t, 3.4, 4.6));
          this.creak = k;
          p().add('body', 12 * k);
          p().add('leg.FL', -42 * k);
          p().add('leg.FR', -42 * k);
          p().add('leg.BL', 0, 0, 3 * sin(t, 9) * k);
          p().add('head', -16 * k);
          this.mouth = 0.4 * pulse(t, 1.2, 2.2);
          this.emote = 'sleepy';
          this.extraLift = -0.01 * k;
        },
      },
      // Lets herself down with a heavy sigh: a thump, the head drops, the ears settle.
      sighFlop: {
        weight: 1.4,
        length: [6.5, 6.5],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.run.phase = 0;
        },
        pose: (t) => {
          if (t > 0.9 && this.run.phase === 0) {
            this.run.phase = 1;
            this.posture = 'lie';
            this.hop.kick(0.5);
            p().kick('head', 300);
          }
          const s = pulse(t, 1.5, 1.8);
          this.mouth = 0.2 * s;
          p().add('head', 6 * s);
          p().add('ear.L', 0, 0, 14 * s);
          p().add('ear.R', 0, 0, -14 * s);
          this.emote = t > 1.2 ? 'sleepy' : 'neutral';
        },
      },
    };
  }

  protected idle(t: number) {
    this.carrying = false;
    this.creak = 0;
    this.glint *= 0.92;
    super.idle(t);
  }

  protected after(dt: number, env: Env) {
    super.after(dt, env);
    // The carried ball is turned with her body.
    if (this.puppet.has('ball') && this.toy.on && this.carrying)
      this.puppet.turn('ball', 0, this.puppet.current('root')[1], 0);
    // Her heart beats slowly; the tail tip glints with every thump and wag.
    this.beat += dt * 2 * Math.PI * 0.55;
    this.outfit?.dot(0, clamp(0.35 + 0.35 * Math.max(0, Math.sin(this.beat)) ** 3, 0, 1));
    const happy = ['happy', 'love'].includes(this.expression) ? 0.35 : 0;
    this.outfit?.dot(1, clamp(0.2 + 0.2 * Math.sin(env.time * 3) + happy + this.glint, 0, 1));
    // A creak is a flicker of the beacon.
    if (this.creak > 0.3 && Math.sin(env.time * 9) > 0.6) this.outfit?.beacon('#ffd97a');
    else this.outfit?.beacon(BEACON[this.expression] ?? '#f4f4f1');
  }
}
