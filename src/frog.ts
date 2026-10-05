import type { Object3D } from 'three';
import { BEACON } from './bolt';
import { type Act, Character, clamp, type Env } from './character';
import type { Expression, FaceLayout } from './face';
import { ramp } from './kitties';
import { sin } from './moves';

/**
 * Plink, the robot tree frog: a squat green toy on folded hind legs, a wide head with the
 * screen across its front, two eye domes on top that look about on their own, a throat sac
 * under the chin that swells and glows, sticky round toe pads that light up, and a tongue
 * with a sticky ball on the tip that lives inside the mouth until it is wanted.
 *
 * It does not walk, it hops: a crouch, a launch with the legs thrown out behind, a spring
 * through the air with the arms tucked, and a squashy landing. On the side walls of the
 * frame it climbs instead, the sticky pads (lit as they stick) taking hold hand over hand.
 *
 * The rest of its day: it croaks with the balloon, makes one big leap with the arms
 * thrown wide, snaps at a fly that is not there (tongue and ball out and back, then a
 * gulp), rolls its eyes one at a time, puffs up like a toy, hops on the spot, spins round
 * in mid-air, wipes its eye with a hand, stretches a leg, or sits and naps. A poke makes it
 * leap, three make it dizzy (the eyes go round and it falls over, legs in the air).
 */
export const FROG_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.3, 0.44],
    [0.7, 0.44],
  ],
  rx: 0.1,
  ry: 0.27,
  line: 0.036,
  mouth: [0.5, 0.8],
};

const SIDES = [1, -1] as const;
const sfx = (s: 1 | -1) => (s === 1 ? 'L' : 'R');
const DIP = 0.9;
/** The tongue and its ball: how long the tongue is at full stretch (metres). */
const TONGUE = 0.13;

/** What the body does this frame, set by acts and reset in idle. */
interface Want {
  /** 0..1: sunk on the legs, and the legs thrown out behind. */
  crouch: number;
  stretch: number;
  /** Metres off the ground. */
  lift: number;
  /** Arms: 0 neutral, 1 thrown wide, -1 tucked in. */
  arms: number;
  head: [number, number, number];
  tongue: number;
  sac: number;
  puff: number;
  eyes: [[number, number], [number, number]] | null;
  face: Expression | null;
  spin: number;
  tilt: number;
  roll: number;
}
const fresh = (): Want => ({
  crouch: 0,
  stretch: 0,
  lift: 0,
  arms: 0,
  head: [0, 0, 0],
  tongue: 0,
  sac: 0,
  puff: 0,
  eyes: null,
  face: null,
  spin: 0,
  tilt: 0,
  roll: 0,
});

export class Frog extends Character {
  static readonly terms =
    'toad amphibian green hop hops leap jump croak ribbit tongue sticky toe pads climb squat bulging eyes throat swells snaps flies';

  private want = fresh();
  private cyc = 0;
  private run = { n: 0, dir: 1, leap: 0 };
  private pokes: number[] = [];
  private flash = 0;
  private padFlash = 0;
  private pads = 0;
  private legsKick = 0;
  /** Seconds a leap is in the air, its speed multiplier. */
  private boost = 1;
  private still = false;

  constructor(model: Object3D) {
    super(
      {
        name: 'Plink',
        model: 'frog',
        metres: 0.24,
        width: 0.4,
        size: 0.6,
        feels: {
          default: { f: 5, zeta: 0.6 },
          root: { f: 4, zeta: 0.55 },
          body: { f: 4, zeta: 0.5 },
          head: { f: 4.5, zeta: 0.45, r: 0.3 },
          sac: { f: 6, zeta: 0.4 },
          'eye.L': { f: 6, zeta: 0.45 },
          'eye.R': { f: 6, zeta: 0.45 },
        },
        face: FROG_FACE,
        eyes: 0.6,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.7 },
          { bone: 'body', yaw: 0.2, pitch: 0 },
          { bone: 'eye.L', yaw: 0.5, pitch: 0.4 },
          { bone: 'eye.R', yaw: 0.5, pitch: 0.4 },
        ],
        reach: { yaw: 55, pitch: 30 },
        lag: 1.8,
        entrance: 'walk',
        edges: ['bottom', 'bottom', 'bottom', 'left', 'right'],
        stay: [45, 100],
        speed: DIP,
        turn: 85,
      },
      model,
    );
    this.acts = this.moves();
  }

  private moves(): Record<string, Act> {
    const p = () => this.puppet;
    const w = () => this.want;
    const rest = () => !this.walking;
    const floor = () => !this.walking && this.edge === 'bottom';
    const wall = () => !this.walking && this.edge !== 'bottom';
    const room = (dir: number) => {
      const f = this.frame;
      if (!f) return this.heightPx * 2;
      const [lo, hi] = this.span(f);
      return Math.max(0, (dir > 0 ? hi - this.s : this.s - lo) - this.widthPx() * 0.5);
    };
    const safeDir = (): number => {
      const dir = Math.random() < 0.5 ? -1 : 1;
      return room(dir) > room(-dir) * 0.5 ? dir : -dir;
    };
    return {
      idle: { weight: 3, length: [2.5, 5] },
      // A few hops along the floor (or up the wall).
      hop: {
        weight: 3,
        length: [5, 7],
        when: rest,
        start: () => {
          const dir = safeDir();
          const far = Math.min(room(dir), this.heightPx * (1.5 + Math.random() * 2.5));
          this.walkTo(this.s + dir * far, Math.random() < 0.7 ? Math.random() : undefined);
        },
      },
      // The throat sac swells and glows, three croaks, the head back.
      croak: {
        weight: 2,
        length: [5.5, 5.5],
        when: rest,
        pose: (t) => {
          const k = ramp(t, 0, 0.5) * (1 - ramp(t, 4.8, 5.4));
          const beat = Math.max(0, Math.sin(((t - 0.8) / 1.5) * Math.PI * 2));
          const on = t > 0.8 && t < 4.6 ? 1 : 0;
          w().sac = k * (0.4 + 0.6 * beat * on);
          w().head = [-10 * k, 0, 0];
          w().puff = 0.2 * beat * on;
          w().crouch = 0.15 * k;
          w().face = beat > 0.4 ? 'surprised' : 'happy';
          this.flash = Math.max(this.flash, beat * on);
        },
      },
      // Down into a deep crouch, then one big leap with the arms thrown wide.
      bigLeap: {
        weight: 1.5,
        length: [4.2, 4.2],
        when: floor,
        start: () => {
          const dir = safeDir();
          this.run.dir = dir;
          this.run.leap = 0;
        },
        pose: (t) => {
          const down = ramp(t, 0.1, 1.2);
          const air = clamp((t - 1.3) / 1.2, 0, 1);
          const flying = t > 1.3 && t < 2.5;
          const land = ramp(t, 2.5, 2.7) * (1 - ramp(t, 2.7, 3.5));
          w().crouch = down * (1 - ramp(t, 1.2, 1.35)) + land * 0.9;
          w().stretch = ramp(t, 1.25, 1.45) * (1 - ramp(t, 2.1, 2.5));
          w().lift = flying ? 0.2 * Math.sin(air * Math.PI) : 0;
          w().arms = flying ? 1 : land ? -0.5 : 0;
          w().head = [flying ? -14 : 8 * down, 0, 0];
          w().face = flying ? 'surprised' : 'focused';
          this.padFlash = flying ? 1 : 0;
          if (t > 1.3 && this.run.leap === 0) {
            this.run.leap = 1;
            this.boost = 7;
            const far = Math.min(room(this.run.dir), this.heightPx * 3);
            this.walkTo(this.s + this.run.dir * far, undefined);
          }
          if (t > 2.5 && this.run.leap === 1) {
            this.run.leap = 2;
            this.boost = 1;
            this.goal = null;
            p().kick('body', 40);
            p().kick('head', -30);
          }
        },
      },
      // Eyes on a fly that is not there: follows it, the tongue shoots out with the ball, gulp.
      flyCatch: {
        weight: 2,
        length: [5.2, 5.2],
        when: rest,
        pose: (t) => {
          const fx = Math.sin(t * 2.1) + 0.35 * Math.sin(t * 5.3);
          const fy = 0.6 * Math.sin(t * 1.7 + 1);
          const watch = t < 3;
          if (watch) {
            w().eyes = [
              [18 * fy, 38 * fx],
              [18 * fy, 38 * fx * 0.9],
            ];
            w().head = [-4 + 4 * fy, 22 * fx, 0];
            w().crouch = 0.2;
            w().face = 'focused';
          } else {
            const u = (t - 3) / 0.9;
            w().tongue = u < 0.2 ? ramp(u, 0, 0.2) : u < 0.5 ? 1 - ramp(u, 0.2, 0.5) : 0;
            w().head = [-14 * (u < 0.4 ? 1 : 0.2), 0, 0];
            w().crouch = 0.4 * (u < 0.5 ? 1 : 0.4);
            w().face = u > 0.45 ? 'happy' : 'focused';
            if (t > 3.9) w().head = [6 * Math.sin(t * 11) * (1 - ramp(t, 4.2, 4.8)), 0, 0];
            w().sac = t > 3.8 && t < 4.5 ? 0.5 * Math.sin(((t - 3.8) / 0.7) * Math.PI) : 0;
          }
        },
      },
      // The eye domes roll one after the other, and the other way.
      eyeRoll: {
        weight: 1.4,
        length: [4.5, 4.5],
        when: rest,
        pose: (t) => {
          const k = ramp(t, 0, 0.4) * (1 - ramp(t, 4, 4.5));
          const a = t * 4.4;
          w().eyes = [
            [30 * Math.sin(a) * k, 55 * Math.cos(a) * k],
            [30 * Math.sin(a + 2.6) * k, -55 * Math.cos(a + 2.6) * k],
          ];
          w().head = [0, 0, 6 * Math.sin(t * 2.2) * k];
          w().face = 'sheepish';
        },
      },
      // Breathes in until round as a ball, holds it, lets out a puff.
      puffUp: {
        weight: 1.2,
        length: [5, 5],
        when: rest,
        pose: (t) => {
          const k = ramp(t, 0.2, 2) * (1 - ramp(t, 3.4, 3.7));
          w().puff = k;
          w().sac = k * 0.7;
          w().crouch = 0.25 * k;
          w().face = t < 3.6 ? 'cross' : 'happy';
          if (t > 3.6) w().head = [0, 0, 8 * sin(t, 4) * (1 - ramp(t, 4.2, 5))];
          this.flash = Math.max(this.flash, 0.5 * k);
        },
      },
      // Three happy hops on the spot, arms up.
      bounce: {
        weight: 1.3,
        length: [4.2, 4.2],
        when: floor,
        pose: (t) => {
          const u = t / 1.2;
          const c = u - Math.floor(u);
          const air = c > 0.35 && c < 0.85 && u < 3;
          w().lift = air ? 0.13 * Math.sin(((c - 0.35) / 0.5) * Math.PI) : 0;
          w().crouch = u < 3 ? Math.max(0, 1 - Math.abs(c - 0.15) / 0.2) * 0.8 : 0;
          w().stretch = air ? 0.6 : 0;
          w().arms = air ? 1 : 0;
          w().face = 'happy';
          this.padFlash = air ? 1 : 0;
        },
      },
      // A full turn in the air at the top of a hop.
      spinHop: {
        weight: 1.1,
        length: [3.6, 3.6],
        when: floor,
        pose: (t) => {
          const air = clamp((t - 0.7) / 1.1, 0, 1);
          const flying = t > 0.7 && t < 1.8;
          w().crouch =
            ramp(t, 0.1, 0.7) * (1 - ramp(t, 0.7, 0.8)) +
            0.7 * ramp(t, 1.8, 1.9) * (1 - ramp(t, 1.9, 2.7));
          w().stretch = flying ? 0.7 : 0;
          w().lift = flying ? 0.2 * Math.sin(air * Math.PI) : 0;
          w().spin = 2 * Math.PI * ramp(t, 0.7, 1.8);
          w().arms = flying ? -0.8 : 0;
          w().face = flying ? 'surprised' : 'happy';
        },
      },
      // Wipes one eye with a hand, and checks its reflection.
      wipe: {
        weight: 1.2,
        length: [4.2, 4.2],
        when: rest,
        start: () => (this.run.dir = Math.random() < 0.5 ? 1 : -1),
        pose: (t) => {
          const k = ramp(t, 0, 0.6) * (1 - ramp(t, 3.4, 4));
          const sd = this.run.dir;
          const rub = Math.sin(t * 9) * (t > 0.7 && t < 3.2 ? 1 : 0);
          const arm = sd === 1 ? 'arm.L' : 'arm.R';
          const fore = sd === 1 ? 'forearm.L' : 'forearm.R';
          p().add(arm, -95 * k, 0, 0);
          p().add(fore, -60 * k + 12 * rub, 0, 0);
          w().head = [4 * k, 0, -sd * 10 * k];
          w().eyes =
            sd === 1
              ? [
                  [-20 * k, 0],
                  [0, 0],
                ]
              : [
                  [0, 0],
                  [-20 * k, 0],
                ];
          w().face = 'wink';
        },
      },
      // One hind leg out behind, then the other: a long stretch.
      legStretch: {
        weight: 1,
        length: [4, 4],
        when: floor,
        start: () => (this.run.dir = Math.random() < 0.5 ? 1 : -1),
        pose: (t) => {
          const k = ramp(t, 0, 0.7) * (1 - ramp(t, 3.2, 4));
          const sd = t < 2 ? this.run.dir : -this.run.dir;
          const kk = k * (1 - ramp(Math.abs(t - 2), 0.4, 0.4) * 0) * (t > 1.7 && t < 2.3 ? 0.4 : 1);
          this.legsKick = sd * kk;
          w().head = [-8 * k, 0, 0];
          w().tilt = -6 * k * sd;
          w().face = 'sleepy';
        },
      },
      // Settles flat and nods off: eyes shut, sac slowly breathing.
      nap: {
        weight: 1.2,
        length: [8, 14],
        when: floor,
        pose: (t) => {
          const k = ramp(t, 0, 1.5);
          w().crouch = 0.6 * k;
          w().head = [10 * k, 0, 0];
          w().sac = 0.2 * k * (0.5 + 0.5 * Math.sin(t * 1.4));
          w().face = k > 0.7 ? 'asleep' : 'sleepy';
          w().eyes = [
            [-30 * k, 0],
            [-30 * k, 0],
          ];
        },
      },
      // On a wall: clings still, looks round and up, sac pulsing.
      cling: {
        weight: 3,
        length: [5, 8],
        when: wall,
        pose: (t) => {
          const k = ramp(t, 0, 0.5);
          w().head = [-8 * k, 20 * Math.sin(t * 0.9) * k, 0];
          w().sac = 0.35 * Math.max(0, Math.sin(t * 2.4)) * k;
          w().crouch = 0.2;
          w().eyes = [
            [0, 30 * Math.sin(t * 1.3)],
            [0, 30 * Math.sin(t * 1.1 + 1)],
          ];
          this.pads = 1;
        },
      },
      // On a wall: a few climbing steps up or down it.
      climb: {
        weight: 3,
        length: [6, 8],
        when: wall,
        start: () => {
          const dir = safeDir();
          const far = Math.min(room(dir), this.heightPx * (1.5 + Math.random() * 2));
          this.walkTo(this.s + dir * far, undefined);
        },
      },
      // Spins in a ring on its back with the legs kicking: the dizzy reaction.
      dizzy: {
        weight: 0,
        length: [4.4, 4.4],
        pose: (t) => {
          const k = 1 - ramp(t, 3.2, 4.3);
          w().spin = 2 * Math.PI * 2 * ramp(t, 0.2, 2.8);
          w().roll = 160 * ramp(t, 2.8, 3.2) * (1 - ramp(t, 3.6, 4.3));
          w().eyes = [
            [10 * Math.cos(t * 7) * k, 50 * Math.sin(t * 7) * k],
            [10 * Math.cos(t * 7.5) * k, -50 * Math.sin(t * 7.5) * k],
          ];
          w().head = [0, 10 * Math.sin(t * 6) * k, 8 * Math.cos(t * 5) * k];
          w().face = t > 2.8 ? 'dizzy' : 'surprised';
        },
      },
      // A poke: up in the air and down again.
      startle: {
        weight: 0,
        length: [1.6, 1.6],
        pose: (t) => {
          const flying = t < 0.7;
          w().lift = flying ? 0.16 * Math.sin((t / 0.7) * Math.PI) : 0;
          w().stretch = flying ? 0.5 : 0;
          w().crouch = t > 0.7 ? 0.7 * (1 - ramp(t, 0.7, 1.5)) : 0.1;
          w().arms = flying ? 1 : 0;
          w().puff = 0.3 * (1 - ramp(t, 0, 1.2));
          w().face = 'surprised';
        },
      },
    };
  }

  poke() {
    if (this.state !== 'here') return;
    const now = performance.now() / 1000;
    this.pokes = [...this.pokes.filter((at) => now - at < 3), now];
    this.goal = null;
    if (this.pokes.length >= 3) {
      this.pokes = [];
      this.setAct('dizzy');
    } else if (this.act !== 'dizzy') {
      this.setAct('startle');
      this.flash = 1;
    }
  }

  protected onEnter() {
    this.boost = 1;
    this.spec.speed = DIP;
  }

  protected idle(t: number) {
    const p = this.puppet;
    this.want = fresh();
    // A breath in the body and the sac, the domes drifting about on their own.
    p.add('body', 1.2 * sin(t, 0.4));
    p.add('head', 1.5 * sin(t, 0.2), 3 * sin(t, 0.09), 0);
    p.add('eye.L', 4 * sin(t, 0.23), 10 * sin(t, 0.17), 0);
    p.add('eye.R', 4 * sin(t, 0.21, 0.4), 10 * sin(t, 0.19, 0.3), 0);
    this.want.sac = 0.12 + 0.1 * sin(t, 0.4);
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    const w = this.want;
    const act = this.act;
    this.frame = env.frame;
    this.hover = this.hovered ? this.hover + dt : 0;
    if (this.hover > 0.9 && act === 'idle') this.setAct('croak');
    const onWall = this.edge !== 'bottom';
    const moving = clamp(this.stride / (DIP * env.frame.bot * 0.9), 0, 3);

    // Hopping along the floor: a crouch, the launch, the flight, the landing.
    let lift = w.lift;
    let crouch = w.crouch;
    let stretch = w.stretch;
    let arms = w.arms;
    let climb = 0;
    if (moving > 0.05 && !onWall) {
      this.cyc = (this.cyc + dt * (0.55 + 0.25 * Math.min(moving, 2))) % 1;
      const c = this.cyc;
      let fly = 0;
      if (c < 0.3) crouch = Math.max(crouch, 0.8 * (c / 0.3));
      else if (c < 0.42) {
        stretch = Math.max(stretch, ramp(c, 0.3, 0.42));
        crouch = Math.max(crouch, 0.8 * (1 - ramp(c, 0.3, 0.42)));
      } else if (c < 0.82) {
        fly = Math.sin(((c - 0.42) / 0.4) * Math.PI);
        stretch = Math.max(stretch, 0.8 * (1 - ramp(c, 0.7, 0.82)));
        arms = Math.max(arms, -0.4 * fly);
      } else crouch = Math.max(crouch, 0.7 * (1 - ramp(c, 0.82, 1)));
      lift += 0.09 * fly * Math.min(1.5, moving);
      // The speed follows the hop: still while it crouches, fast in the air.
      const air = c > 0.38 && c < 0.8 ? 1 : 0.12;
      if (act !== 'bigLeap') this.spec.speed = DIP * 2.6 * air;
      else this.spec.speed = DIP * this.boost * (this.boost > 1 ? 1 : 0.2);
      this.padFlash = Math.max(this.padFlash, c > 0.8 ? 1 : 0);
    } else {
      this.spec.speed = act === 'bigLeap' ? DIP * this.boost * (this.boost > 1 ? 1 : 0.1) : DIP;
      if (moving < 0.05) this.cyc = 0;
      if (onWall && moving > 0.05) climb = clamp(moving, 0, 1);
    }

    // The body.
    const sag = crouch;
    p.shift('root', 0, lift - 0.032 * sag, 0);
    p.add('body', 14 * sag - 10 * stretch);
    p.add('head', -8 * sag + 6 * stretch);
    const b = 1 + 0.14 * w.puff;
    p.stretch('body', b, [1, 0, 0], b);
    p.add('head', w.head[0], w.head[1], w.head[2]);
    p.add('body', w.tilt, 0, 0);
    this.legs(sag, stretch, climb, env.time);
    this.armsPose(arms, climb, sag, env.time);
    if (w.eyes) {
      p.add('eye.L', w.eyes[0][0], w.eyes[0][1], 0);
      p.add('eye.R', w.eyes[1][0], w.eyes[1][1], 0);
    }
    if (w.face) this.expression = w.face;
    else this.expression = this.hovered ? 'happy' : 'neutral';
    this.flash = Math.max(0, this.flash - dt * 2);
    this.padFlash = Math.max(0, this.padFlash - dt * 3);
    if (act !== 'cling') this.pads = 0;
  }

  private legs(sag: number, stretch: number, climb: number, time: number) {
    const p = this.puppet;
    for (const side of SIDES) {
      const s = sfx(side);
      let kick = 0;
      if (this.legsKick) kick = this.legsKick * side > 0 ? Math.abs(this.legsKick) : 0;
      const e = Math.max(stretch, kick);
      const c = sag;
      const cl = climb * Math.sin(time * 9 + (side === 1 ? 0 : Math.PI));
      p.add(`thigh.${s}`, 14 * c + 108 * e - 18 * cl, 0, side * (-6 * e));
      p.add(`shin.${s}`, -22 * c - 118 * e + 22 * cl, 0, 0);
      p.add(`foot.${s}`, 8 * c + 40 * e, 0, 0);
    }
  }

  private armsPose(arms: number, climb: number, sag: number, time: number) {
    const p = this.puppet;
    for (const side of SIDES) {
      const s = sfx(side);
      const a = arms;
      const cl = climb * Math.sin(time * 9 + (side === 1 ? Math.PI : 0));
      p.add(
        `arm.${s}`,
        a > 0 ? -70 * a : -30 * a * -1 + 10 * sag - 50 * cl,
        0,
        side * (a > 0 ? -60 * a : 0),
      );
      p.add(`forearm.${s}`, a > 0 ? -20 * a : 40 * -a - 20 * cl, 0, 0);
    }
  }

  private frame: Env['frame'] | null = null;
  private hover = 0;

  protected after(_dt: number, env: Env) {
    const p = this.puppet;
    const w = this.want;
    const o = this.outfit;
    // The tongue and its ball: out along the front, direct.
    const k = clamp(w.tongue, 0, 1);
    p.stretch('tongue', Math.max(0.001, k), [0, 0, 1], k > 0.02 ? 1 : 0.001);
    p.stretch('ball', Math.max(0.001, k > 0.3 ? 1 : 0.001), [0, 0, 1], k > 0.3 ? 1 : 0.001);
    p.shift('ball', 0, 0, TONGUE * k);
    // The sac swells under the chin.
    const sac = clamp(0.22 + w.sac * 0.95, 0.15, 1.3);
    p.stretch('sac', sac, [0, 1, 0], sac);
    this.pivot.rotation.y = w.spin;
    this.pivot.rotation.z = (w.roll * Math.PI) / 180;
    if (!o) return;
    const t = env.time;
    const asleep = this.expression === 'asleep';
    const tone = BEACON[this.expression];
    // Dot0 is the sac, Dot1 the hands, Dot2 the feet, Dot3 the spots down the back.
    o.dot(0, asleep ? 0.1 : clamp(0.2 + w.sac * 0.9 + 0.4 * this.flash, 0, 1), tone);
    o.dot(1, clamp(0.25 + 0.7 * this.padFlash + 0.5 * this.pads, 0, 1));
    o.dot(2, clamp(0.25 + 0.7 * this.padFlash + 0.5 * this.pads, 0, 1));
    o.dot(3, asleep ? 0.15 : 0.35 + 0.3 * Math.sin(t * 2 - 1) + 0.4 * w.puff);
    o.beacon(BEACON[this.expression] ?? BEACON.neutral!);
  }
}
