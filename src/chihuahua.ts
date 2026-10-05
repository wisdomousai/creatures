import type { Object3D } from 'three';
import { BEACON } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import type { Anatomy } from './pet';
import { DOG_ACT_MOODS, dogMoods, Hound } from './dogs';
import { pulse, ramp } from './kitties';

/**
 * Taco, the robot chihuahua: tiny, with a head too big for him, eyes too big for the
 * head and ears like satellite dishes. He trembles all the time (a fine fast shiver that
 * stops only when he is happy or asleep, and doubles when he is scared), and he is far
 * too brave for his size: he marches up to the biggest crewmate on the floor, stands on
 * tiptoe and barks his head off, then loses his nerve and scuttles backwards. He owns a
 * cushion, which he noses and paws at and then burrows under, leaving only his rump
 * and the tips of his ears out.
 *
 * His heart lamp flickers with the shiver; his ear hinges glow.
 */
export const CHIHUAHUA_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.28, 0.5],
    [0.72, 0.5],
  ],
  rx: 0.115,
  ry: 0.4,
  line: 0.035,
  mouth: null,
};

const moods = dogMoods(15);
moods.calm = { ...moods.calm, wag: [10, 2.2] };

const CHIHUAHUA: Anatomy = {
  tail: ['tail.1', 'tail.2'],
  tailAxis: [0, 0.7, 0.7],
  earsHang: false,
  moods,
  actMoods: {
    ...DOG_ACT_MOODS,
    barkBig: 'annoyed',
    burrowCushion: 'curious',
    scurry: 'happy',
    nervousScan: 'alarmed',
    tinyStomp: 'annoyed',
  },
  lying: 'calm',
  hover: 'love',
  drop: { stand: 0, sit: -0.03, lie: -0.05 },
  sit: -24,
  turn: 50,
};

export class Chihuahua extends Hound {
  static readonly terms =
    'doggo pooch tiny small little mini tan cream beige big ears satellite dish eyes shiver tremble shake brave bark scuttle blue';

  protected readonly anatomy = CHIHUAHUA;
  protected readonly build = {
    middle: 0.15,
    prop: { bone: 'cushion', rest: [0.3, 0.1] as [number, number], radius: 0.14, flat: true },
    spring: 1.4,
    speed: 1.8,
  };
  /** The shiver on top of the usual one, 0..1 (a trick sets it each frame). */
  private shiver = 0;
  /** How far the cushion is tipped (degrees, about the depth axis) and the shiver's phase. */
  private tip = 0;
  private phase = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Taco',
        model: 'chihuahua',
        metres: 0.45,
        width: 0.45,
        size: 0.55,
        feels: {
          default: { f: 2.6, zeta: 0.5 },
          root: { f: 3.4, zeta: 0.5 },
          body: { f: 2.4, zeta: 0.55 },
          head: { f: 2.2, zeta: 0.5, r: 0.3 },
          jaw: { f: 7, zeta: 0.5 },
          'ear.L': { f: 3.2, zeta: 0.2 },
          'ear.R': { f: 3.2, zeta: 0.2 },
          'tail.1': { f: 5.5, zeta: 0.4 },
          'tail.2': { f: 5.5, zeta: 0.3 },
        },
        face: CHIHUAHUA_FACE,
        eyes: 0.7,
        gaze: [
          { bone: 'head', yaw: 0.9, pitch: 1 },
          { bone: 'body', yaw: 0.2, pitch: 0 },
        ],
        reach: { yaw: 65, pitch: 35 },
        lag: 1.2,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 1.8,
      },
      model,
    );
    this.floppy = 0.3;
    const all = { ...this.tricks(), ...this.doggy() };
    const mine: Record<string, number> = {
      scratch: 0.7,
      sniff: 0.8,
      yip: 1.4,
      playBow: 0.6,
      pant: 0.5,
      yawn: 0.5,
      tilt: 1.2,
      watch: 1,
      greet: 0.6,
      chaseFly: 0.6,
      twirl: 0.8,
      tailChase: 0.6,
      zoomies: 0.6,
      dozeOff: 0.6,
      backWall: 0.6,
      frontLip: 0.6,
      circle: 0.4,
      sneeze: 0.5,
      shakeOff: 0.5,
      beg: 0.8,
      bell: 0.4,
      fallOver: 0.4,
    };
    const common = this.commonActs();
    for (const k of ['idle', 'stroll', 'sit', 'nap', 'stand', 'stretch', 'startle'] as const) {
      this.acts[k] = common[k];
    }
    this.acts.lie = { ...common.lie, weight: 0.4 };
    for (const [name, weight] of Object.entries(mine)) this.acts[name] = { ...all[name], weight };
    this.acts.love = all.love;
    this.acts.dizzy = { ...all.dizzy, weight: 0 };
    Object.assign(this.acts, this.moves());
  }

  /** The crewmates much bigger than he is. */
  private bigOnes() {
    return this.others().filter((o) => o.heightPx > this.heightPx * 1.5);
  }

  private moves(): Record<string, Act> {
    const p = () => this.puppet;
    const stand = () => this.standing;
    return {
      // Marches up to a big crewmate, stands on tiptoe barking, then loses his nerve.
      barkBig: {
        weight: 2.2,
        length: [12, 12],
        when: () => stand() && this.bigOnes().length > 0,
        start: () => {
          this.posture = 'stand';
          const all = this.bigOnes();
          this.run.target = all[Math.floor(Math.random() * all.length)] ?? null;
          this.run.phase = 0;
          this.run.n = 0;
        },
        pose: (t) => {
          const o = this.run.target;
          if (!o || o.state !== 'here') return this.endAct();
          const r = this.run;
          const side = Math.sign(o.s - this.s) || 1;
          if (r.phase === 0) {
            // Strides up, chest out, tail high.
            this.walkTo(o.s - side * (this.gap(o) + this.heightPx * 1.3), o.depth);
            this.boost = 1.1;
            this.lookAtMate(o, 0.8);
            p().add('body', -8);
            this.emote = 'determined';
            this.pupils = 1;
            if (t > 1 && this.stride < 4) {
              r.phase = 1;
              r.at = t;
              this.goal = null;
            }
            if (t > 4.5) {
              r.phase = 1;
              r.at = t;
            }
          } else if (r.phase === 1) {
            // Tiptoe, stiff-legged, a hop and a yap at every bark.
            const u = t - r.at;
            this.lookAtMate(o, 1);
            const n = Math.floor(u / 0.35);
            const b = pulse(u % 0.35, 0, 0.22);
            if (n >= r.n && u < 4) {
              r.n = n + 1;
              this.hop.kick(1.1);
              p().kick('head', -260);
            }
            this.mouth = u < 4 ? b : 0;
            p().add('body', -12 * ramp(u, 0, 0.3));
            p().add('head', -8 * b);
            p().add('leg.FL', 6);
            p().add('leg.FR', 6);
            p().add('tail.1', 16 * ramp(u, 0, 0.3));
            this.emote = u < 4 ? 'cross' : 'surprised';
            this.pupils = 1;
            this.shiver = 0.3;
            if (u > 4.3) {
              r.phase = 2;
              r.at = t;
            }
          } else if (r.phase === 2) {
            // Loses his nerve and scuttles backwards, facing it, shaking all over.
            const u = t - r.at;
            const k = ramp(u, 0, 0.25) * (1 - ramp(u, 1.7, 2.2));
            p().add('root', 0, -this.heading.y * k + side * 46 * k);
            this.lookAtMate(o, 0.6);
            if (u < 1.8) {
              this.walkTo(this.s - side * this.heightPx * 1.6, this.depth);
              this.boost = 2.2;
            } else this.goal = null;
            p().add('body', 8 * k);
            p().add('tail.1', -40 * k);
            this.extraLift = -0.01 * k;
            this.shiver = 1;
            this.emote = 'surprised';
            this.pupils = 1;
            if (u > 2.3) {
              r.phase = 3;
              r.at = t;
            }
          } else {
            // Pretends nothing happened.
            const u = t - r.at;
            this.emote = u < 1.6 ? 'sheepish' : 'neutral';
            p().add('head', 0, -side * 20 * ramp(u, 0, 0.4));
            this.eyes = { x: -side, y: -0.3 };
            this.shiver = 0.4;
            if (u > 2.4) this.endAct();
          }
        },
      },
      // His cushion comes out: he noses it, paws at it, and burrows under it for a nap.
      burrowCushion: {
        weight: 2,
        length: [15, 15],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.toy.on = true;
          this.toy.gone = 0;
          this.toy.v = 0;
          this.run.dir = this.roomy();
          this.toy.s = this.s + this.run.dir * this.heightPx * 1.4;
          this.run.phase = 0;
        },
        pose: (t) => {
          const r = this.run;
          const side = Math.sign(this.toy.s - this.s) || 1;
          this.toy.v = 0;
          if (r.phase === 0) {
            // Trots over to it, tail up.
            this.walkTo(this.toy.s - side * this.heightPx * 0.55, this.depth);
            this.boost = 1.2;
            this.lookAtFloor(this.toy.s);
            this.emote = 'happy';
            if (t > 1 && this.stride < 3) {
              r.phase = 1;
              r.at = t;
              this.goal = null;
            }
            if (t > 6) r.phase = 1;
          } else if (r.phase === 1) {
            // Noses at the edge, pawing, turning round and round.
            const u = t - r.at;
            const k = ramp(u, 0, 0.4);
            p().add('body', 14 * k);
            p().add('head', 26 * k + 4 * sin(u, 4) * k);
            p().add('leg.FL', (-30 + 30 * sin(u, 3.4)) * k);
            p().add('leg.FR', (-30 - 30 * sin(u, 3.4)) * k);
            p().add('root', 0, 6 * sin(u, 2) * k);
            this.extraLift = -0.01 * k;
            this.tip = side * 6 * k * sin(u, 4);
            this.emote = 'focused';
            this.pupils = 1;
            if (u > 3.2) {
              r.phase = 2;
              r.at = t;
              this.posture = 'lie';
            }
          } else if (r.phase === 2) {
            // Down with his head under the edge: the cushion lifts over him, only ears and rump out.
            const u = t - r.at;
            const k = ramp(u, 0, 1.2) * (1 - ramp(u, 6.4, 7));
            this.tip = side * 22 * k;
            this.toyLift = 0.025 * k;
            p().add('head', 36 * k);
            p().add('body', 6 * k);
            this.mouth = 0;
            this.emote = u > 1.6 ? 'asleep' : 'sleepy';
            if (u > 7) {
              r.phase = 3;
              r.at = t;
              this.posture = 'stand';
              this.hop.kick(1.2);
              p().kick('head', -350);
            }
          } else {
            // Out again, startled, the cushion flopping back.
            const u = t - r.at;
            this.tip = 0;
            this.toyLift = 0;
            this.emote = u < 1.4 ? 'surprised' : 'happy';
            this.pupils = 1;
            this.shiver = 0.6;
            p().add('head', 0, 20 * sin(u, 1.2) * (1 - ramp(u, 1.4, 2)));
            if (u > 2.6) this.endAct();
          }
        },
      },
      // Tiny legs going so fast they blur: across the floor and back, shaking.
      scurry: {
        weight: 1.4,
        length: [5, 5],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.run.n = 0;
          this.go([this.somewhere(), this.somewhere(), this.somewhere()]);
        },
        pose: (t) => {
          this.boost = 3.4;
          const n = Math.floor(t / 0.3);
          if (n >= this.run.n && this.walking) {
            this.run.n = n + 1;
            this.hop.kick(0.5);
          }
          p().add('body', 0, 0, 3 * sin(t, 9));
          p().add('ear.L', -15, 0, 0);
          p().add('ear.R', -15, 0, 0);
          this.shiver = 0.5;
          this.mouth = 0.3;
          this.emote = 'happy';
          this.pupils = 1;
          if (this.atStop && t > 0.5) this.endAct();
        },
      },
      // Jumps at every little noise: head snapping about, ears swivelling, a hop.
      nervousScan: {
        weight: 1.2,
        length: [4.5, 4.5],
        when: () => this.still,
        pose: (t) => {
          const looks = [1, -1, 0.6, -0.8, 0.3];
          const i = Math.min(looks.length - 1, Math.floor(t / 0.8));
          const dir = looks[i];
          const k = ramp(t % 0.8, 0, 0.12);
          p().add(
            'head',
            -4,
            46 * dir * k + 46 * (looks[Math.max(0, i - 1)] ?? 0) * (1 - k) * (i > 0 ? 1 : 0),
          );
          p().add('ear.L', 8, 20 * dir, 0);
          p().add('ear.R', 8, 20 * dir, 0);
          this.eyes = { x: dir, y: -0.1 };
          if (t % 0.8 < 0.05 && i > 0 && Math.abs(looks[i] - looks[i - 1]) > 1.2)
            this.hop.kick(0.5);
          this.pupils = 1;
          this.shiver = 0.7;
          this.emote = 'surprised';
        },
      },
      // Stamps his front feet in a temper at nothing in particular.
      tinyStomp: {
        weight: 0.9,
        length: [3.4, 3.4],
        when: stand,
        pose: (t) => {
          const k = ramp(t, 0, 0.2) * (1 - ramp(t, 2.8, 3.4));
          const a = Math.max(0, sin(t, 2.6));
          const b = Math.max(0, sin(t, 2.6, 0.5));
          p().add('leg.FL', -40 * a * k);
          p().add('leg.FR', -40 * b * k);
          p().add('head', 6 * k, 0, 6 * sin(t, 2.6) * k);
          this.shiver = 0.4 * k;
          this.emote = 'cross';
          this.mouth = 0.15 * k;
        },
      },
    };
  }

  protected idle(t: number) {
    this.shiver = 0;
    super.idle(t);
  }

  protected pose(dt: number, env: Env) {
    super.pose(dt, env);
    // The constant shiver: a fine fast tremble, unless he is happy or asleep.
    const calm =
      this.mood === 'happy' || this.mood === 'love' || this.mood === 'asleep' ? 0.1 : 0.5;
    const amp = clamp(calm + this.shiver, 0, 1.5);
    this.phase += dt * 2 * Math.PI * 14;
    const q = Math.sin(this.phase);
    this.puppet.add('root', 0, 0, 1.4 * amp * q);
    this.puppet.add('body', 0.8 * amp * Math.sin(this.phase * 1.3 + 1));
    this.puppet.add('head', 0.9 * amp * Math.sin(this.phase * 0.9 + 2), 0, 0);
    this.shown = amp;
  }

  private shown = 0;

  protected after(dt: number, env: Env) {
    super.after(dt, env);
    if (this.puppet.has('cushion') && this.toy.on) this.puppet.turn('cushion', 0, 0, this.tip);
    if (!this.toy.on) this.tip *= 0.8;
    // His heart flickers with the shiver; his ear hinges glow.
    const flick = 0.5 + 0.4 * this.shown * Math.sin(env.time * 40) + 0.1 * Math.sin(env.time * 2.3);
    this.outfit?.dot(0, clamp(flick, 0, 1));
    const happy = ['happy', 'love'].includes(this.expression) ? 0.4 : 0;
    this.outfit?.dot(1, clamp(0.3 + 0.25 * Math.sin(env.time * 2) + happy, 0, 1));
    this.outfit?.beacon(BEACON[this.expression] ?? '#f4f4f1');
  }
}
