import type { Object3D } from 'three';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import type { Anatomy } from './pet';
import { ramp } from './kitties';
import { adultMoods, CAT_ACT_MOODS, Moggy } from './moggy';
import { wobble } from './spring';

/**
 * Mochi, the robot Ragdoll: the biggest and softest of the cats, in chunky rounded plates
 * like a long coat, a ruff round her neck, big white mittens and a plume of a tail, with
 * blue eyes. She is slow and sweet and she goes completely floppy when you poke her: that is
 * her whole signature. She goes limp mid-step and slumps onto her side with her legs,
 * head, ears and tail hanging loose, lies there blissful, and gets herself up again. Poke her
 * while she is up and she flops; three quick pokes and she is dizzy.
 *
 * She follows her crewmates about like a dog, a pace behind, sitting down beside them when
 * they stop and looking up at them. Otherwise she kneads, loafs, washes and naps at length.
 */
export const RAGDOLL_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.29, 0.47],
    [0.71, 0.47],
  ],
  rx: 0.115,
  ry: 0.3,
  line: 0.034,
  mouth: [0.5, 0.84],
  kind: 'cat',
  pupil: 0.55,
};

const RAGDOLL: Anatomy = {
  tail: ['tail.1', 'tail.2', 'tail.3', 'tail.4'],
  tailAxis: [0, 0.3, -1],
  earsHang: false,
  moods: adultMoods({
    calm: {
      face: 'neutral',
      carriage: -10,
      bob: [5, 0.2],
      hook: 5,
      flicks: 0.1,
      ears: -2,
      out: 3,
      swivel: 0.3,
    },
    happy: { face: 'happy', carriage: 22, hook: 15, bob: [4, 0.4], ears: 4, out: 0, swivel: 0.3 },
    love: { face: 'love', carriage: 24, hook: 10, quiver: 0.8, ears: 4, out: 0, swivel: 0 },
  }),
  actMoods: {
    ...CAT_ACT_MOODS,
    flop: 'love',
    follow: 'happy',
    loafBig: 'sleepy',
    slowBlink: 'love',
  },
  lying: 'sleepy',
  hover: 'love',
  drop: { stand: 0, sit: -0.1, lie: -0.12 },
  sit: -18,
  turn: 45,
};

export class Ragdoll extends Moggy {
  static readonly terms =
    'kitty big large soft fluffy floppy limp white cream brown mask blue eyes mittens plume tail ruff slow sweet gentle sleepy';

  protected readonly anatomy = RAGDOLL;
  protected readonly build = { middle: 0.3, spring: 0.7, speed: 0.95 };
  /** How limp she is, 0..1: set by the flop, shown in every joint and the roll. */
  private limp = 0;
  private slump = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Mochi',
        model: 'ragdoll',
        metres: 0.74,
        width: 0.8,
        size: 1.38,
        feels: {
          default: { f: 1.7, zeta: 0.55 },
          root: { f: 2.4, zeta: 0.6 },
          body: { f: 1.5, zeta: 0.65 },
          head: { f: 1.4, zeta: 0.55, r: 0.3 },
          'ear.L': { f: 3.5, zeta: 0.3 },
          'ear.R': { f: 3.5, zeta: 0.3 },
          'tail.1': { f: 1.1, zeta: 0.5 },
          'tail.2': { f: 1.3, zeta: 0.45 },
          'tail.3': { f: 1.5, zeta: 0.4 },
          'tail.4': { f: 1.7, zeta: 0.35 },
          'leg.FL': { f: 2.2, zeta: 0.5 },
          'leg.FR': { f: 2.2, zeta: 0.5 },
          'leg.BL': { f: 2.2, zeta: 0.5 },
          'leg.BR': { f: 2.2, zeta: 0.5 },
        },
        face: RAGDOLL_FACE,
        eyes: 0.72,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.9 },
          { bone: 'body', yaw: 0.2, pitch: 0 },
        ],
        reach: { yaw: 60, pitch: 30 },
        lag: 0.6,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 0.95,
      },
      model,
    );
    this.adopt(
      {
        watch: 1.4,
        knead: 1.4,
        mew: 0.7,
        wash: 1.2,
        tilt: 0.8,
        dozeOff: 0.9,
        zoomies: 0.3,
        circle: 0.5,
        backWall: 0.5,
        frontLip: 0.5,
        stalk: 0.4,
      },
      0.9,
    );
    Object.assign(this.acts, this.mine());
  }

  protected idle(t: number) {
    this.limp = 0;
    super.idle(t);
  }

  poke() {
    if (this.state !== 'here') return;
    if (this.poked() >= 3) this.setAct('dizzy');
    else if (this.act !== 'flop') this.setAct('flop');
  }

  protected after(dt: number, env: Env) {
    super.after(dt, env);
    // Lying on her side the round of her body is what is on the floor: sink her to it.
    const a = (this.roll.y * Math.PI) / 180;
    this.model.position.y -= 0.09 * Math.abs(Math.sin(a));
  }

  private mine(): Record<string, Act> {
    const p = () => this.puppet;
    const bones = this.anatomy.tail;
    return {
      // Goes limp where she stands, topples onto her side and lies there, boneless.
      flop: {
        weight: 1.3,
        length: [6.5, 6.5],
        start: () => {
          this.posture = 'stand';
          this.goal = null;
          this.run.dir = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          const d = this.run.dir;
          const down = ramp(t, 0.15, 0.9) * (1 - ramp(t, 4.6, 5.5));
          const t0 = t * 0.9;
          this.limp = down;
          // The first instant: the head drops, then everything follows.
          p().add('head', 30 * ramp(t, 0, 0.35) * (1 - down), 0, 12 * d * ramp(t, 0, 0.35));
          this.rollTarget = d * 84 * down;
          this.emote = t < 0.5 ? 'surprised' : t < 4.6 ? 'sleepy' : 'happy';
          this.pupils = 0.5;
          if (t > 0.9 && !this.run.done) {
            this.run.done = true;
            this.hop.kick(1.4);
            p().kick('head', 220, 0, 240 * d);
            p().kick('ear.L', 0, 0, 500);
            p().kick('ear.R', 0, 0, -500);
          }
          // Limp: every leg hangs at its own angle, swaying a little with her breath.
          const sway = (seed: number, amp: number) => amp * wobble(t0 * 0.8, seed);
          p().add('leg.FL', (-35 + sway(1, 28)) * down);
          p().add('leg.FR', (-20 + sway(2, 28)) * down);
          p().add('leg.BL', (25 + sway(3, 24)) * down);
          p().add('leg.BR', (40 + sway(4, 24)) * down);
          p().add('leg.FL', 0, 0, (20 + sway(5, 15)) * down * d);
          p().add('leg.FR', 0, 0, (-10 + sway(6, 15)) * down * d);
          p().add('head', (18 + sway(7, 8)) * down, 12 * d * down, 22 * d * down);
          p().add('body', 0, 0, 0);
          p().add('ear.L', 0, 0, -45 * down);
          p().add('ear.R', 0, 0, 45 * down);
          bones.forEach((b, i) =>
            p().add(b, 0, 0, (30 + 12 * sway(i + 9, 1)) * down * (i === 0 ? 0.4 : 1) * d),
          );
          // Easing back up: a wobbly shake of the head and a start.
          if (t > 5.2) {
            this.emote = 'happy';
            p().add('head', 0, 18 * sin(t, 1.2), 8 * sin(t, 1.2, 0.25));
          }
        },
      },
      // Trails a crewmate a pace behind, wherever it goes, and sits by it when it stops.
      follow: {
        weight: 1.8,
        length: [10, 14],
        when: () => this.standing && this.others().length > 0,
        start: () => {
          this.posture = 'stand';
          const all = this.others();
          this.run.target = all[Math.floor(Math.random() * all.length)];
        },
        pose: (t) => {
          const o = this.run.target;
          if (!o || o.state !== 'here') return this.endAct();
          this.lookAtMate(o, 0.8);
          this.pupils = 0.9;
          this.emote = 'happy';
          const gap = this.heightPx * 0.95;
          const behind = Math.sign(this.s - o.s) || 1;
          const want = o.s + behind * gap;
          const near =
            Math.abs(this.s - want) < this.heightPx * 0.25 && Math.abs(this.depth - o.depth) < 0.1;
          this.boost = o.stride > 2 ? 1.5 : 1;
          if (!near) {
            this.walkTo(want, o.depth);
            this.posture = 'stand';
            p().add('body', -3);
          } else if (o.stride < 2) {
            // It has stopped, so she sits by it and gazes up.
            this.posture = 'sit';
            p().add('head', -10 + 3 * sin(t, 0.4));
            p().add('head', 0, 0, 6 * sin(t, 0.3));
            this.pupils = 1;
          }
          bones.forEach((b, i) => p().add(b, 0, 0, 10 * sin(t, 0.8, -i * 0.1)));
          if (t > 12 && near) this.endAct();
        },
      },
      // Settles into a great soft loaf, paws and tail tucked, blinking slowly.
      loafBig: {
        weight: 1.1,
        length: [10, 16],
        when: () => this.still,
        start: () => (this.posture = 'lie'),
        pose: (t) => {
          const k = ramp(t, 0.3, 2.5);
          p().add('leg.FL', 28 * k);
          p().add('leg.FR', 28 * k);
          p().add('leg.BL', -26 * k);
          p().add('leg.BR', -26 * k);
          p().add('head', -6 * k + 2 * sin(t, 0.2));
          p().add('tail.1', 0, 60 * k);
          bones.slice(1).forEach((b) => p().add(b, 0, 0, 24 * k));
          this.emote = sin(t, 0.13) > 0.6 ? 'happy' : k > 0.6 ? 'sleepy' : 'neutral';
        },
      },
      // A slow, loving blink at whoever is nearest: a long happy-eyed squeeze.
      slowBlink: {
        weight: 1.2,
        length: [3.4, 3.4],
        when: () => this.posture !== 'lie' && this.still,
        pose: (t) => {
          const k = ramp(t, 0.4, 1.2) * (1 - ramp(t, 2, 2.8));
          p().add('head', 3 * k, 0, 6 * k);
          this.emote = k > 0.8 ? 'happy' : k > 0.15 ? 'sleepy' : 'neutral';
          this.pupils = 0.6;
        },
      },
    };
  }

  /** The beacon and lights stay soft: no change from the shared ones. */
  protected breedLights(_time: number, _tone: string | undefined) {
    const o = this.outfit;
    if (!o) return;
    o.dot(1, clamp(0.25 + 0.5 * this.limp, 0, 1));
  }
}
