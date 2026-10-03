import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import { wobble } from './spring';
import { smooth, Toybot } from './toybot';

/**
 * Clatter, a 1950s tin wind-up toy robot: a squat rivetted can with a chest window where
 * three gears turn and sparks jump, a big winding key in his back, stiff straight legs,
 * corrugated arms with pincers and a silver dome head with a screen face and two antennae.
 *
 * He marches: stiff legs swinging from the hip, arms swinging opposite, the can rocking
 * from side to side, the key turning in time and the gears with it. He is only ever as
 * lively as his spring is wound: the key's turning slows as he goes, and once in a while
 * he runs down mid-step and stands frozen, one foot forward and his eyes half shut, until
 * a poke winds him up again (the key spins fast, sparks fly, and he marches off). Left
 * alone he creaks himself round a quarter turn of the key after a while, so he never stays
 * stuck for good.
 *
 * Tricks: a stiff march, a little march in a circle, running down, winding up, a march in
 * place against the back wall, a stiff salute, a clockwork wave, a robot dance, a jolt of
 * sparks, a clanking hop, a stiff about-turn, clicking his head from side to side, a
 * rattle, peering over the front lip and a march at the spot.
 */
export const TIN_FACE: FaceLayout = {
  width: 512,
  height: 368,
  eyes: [
    [0.3, 0.43],
    [0.7, 0.43],
  ],
  rx: 0.095,
  ry: 0.25,
  line: 0.034,
  mouth: [0.5, 0.77],
};

const DEG = 180 / Math.PI;
const SPEED = 0.9;
const GEAR_RATIO = [1, -12 / 9, 12 / 6];
const GOLD = '#ffd23f';

export class Tin extends Toybot {
  private fx = { hop: 0, spin: 0, spark: 0, rattle: 0, still: false, march: false, lean: 0 };
  /** How far wound he is, 0..1; the key turns (and the legs go) accordingly. */
  private wound = 1;
  private frozen = false;
  private frozenGait = 0;
  private keyAngle = 0;
  private keyRate = 0;
  private fakeGait = 0;
  private way = 1;
  private lap: { s: number; d: number }[] = [];
  private lapAt = -1;

  constructor(model: Object3D) {
    super(
      {
        name: 'Clatter',
        model: 'tin',
        metres: 0.86,
        width: 0.42,
        size: 1.1,
        feels: {
          default: { f: 3, zeta: 0.7 },
          root: { f: 3, zeta: 0.8 },
          body: { f: 3.2, zeta: 0.55 },
          head: { f: 3, zeta: 0.5, r: 0.4 },
          'ant.L': { f: 2.8, zeta: 0.14 },
          'ant.R': { f: 3.1, zeta: 0.14 },
          'arm.L': { f: 3.6, zeta: 0.6 },
          'arm.R': { f: 3.6, zeta: 0.6 },
          'leg.L': { f: 4, zeta: 0.7 },
          'leg.R': { f: 4, zeta: 0.7 },
        },
        face: TIN_FACE,
        eyes: 0.72,
        gaze: [
          { bone: 'head', yaw: 0.7, pitch: 0.7 },
          { bone: 'body', yaw: 0.15, pitch: 0.1 },
        ],
        reach: { yaw: 50, pitch: 24 },
        lag: 1.3,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [60, 130],
        speed: SPEED,
      },
      model,
    );
    this.acts = this.moves();
  }

  // ---------- Acts ----------

  private moves(): Record<string, Act> {
    const p = this.puppet;
    const ok = () => this.free_ && !this.frozen;
    return {
      idle: { weight: 3, length: [3, 6] },
      march: {
        weight: 3,
        length: [2, 4],
        when: ok,
        start: () =>
          this.stroll(Math.random() < 0.5 ? -1 : 1, this.heightPx * (1.5 + Math.random() * 2.5)),
      },
      circle: {
        weight: 1.4,
        length: [14, 14],
        when: ok,
        start: () => {
          // Six corners round a little ring, in the floor's own width and depth.
          const r = this.heightPx * 0.7;
          this.way = Math.random() < 0.5 ? -1 : 1;
          this.lap = Array.from({ length: 7 }, (_, i) => {
            const a = (i / 6) * Math.PI * 2;
            return {
              s: this.s + this.way * r * (Math.sin(a) * 1.0),
              d: clamp(this.depth + 0.28 * (1 - Math.cos(a)), 0.1, 0.9),
            };
          });
          this.lapAt = 0;
        },
        pose: () => {
          if (this.lapAt < 0) return;
          const f = this.env?.frame;
          if (!f) return;
          if (!this.walking && this.goal === null && this.lapAt < this.lap.length) {
            const w = this.lap[this.lapAt++];
            this.walkTo(clamp(w.s, f.left + this.widthPx(), f.right - this.widthPx()), w.d);
          } else if (this.lapAt >= this.lap.length && !this.walking && this.goal === null)
            this.setAct('idle');
        },
      },
      rundown: {
        weight: 0.9,
        length: [24, 24],
        when: ok,
        start: () => {
          this.stroll(Math.random() < 0.5 ? -1 : 1, this.heightPx * 3);
        },
        pose: (t) => {
          // Slower and slower, then stopped, mid-step, and the lights go down.
          const u = clamp(t / 3.2, 0, 1);
          if (!this.frozen) {
            this.wound = 1 - u;
            this.spec.speed = SPEED * (1 - 0.85 * u);
            if (u >= 1) {
              this.frozen = true;
              this.frozenGait =
                Math.round((this.gait - Math.PI / 2) / Math.PI) * Math.PI + Math.PI / 2;
              this.walkTo(this.s);
              this.goal = null;
              p.kick('body', 6, 0, 8);
            }
          }
          if (this.frozen) {
            this.expression = 'sleepy';
            // Not a soul winds him: a slow creak of the key gets him going again.
            if (t > 21) this.setAct('windup');
          }
        },
      },
      // Never picked at random: a poke on a run-down Clatter.
      windup: {
        weight: 0,
        length: [3.6, 3.6],
        face: 'surprised',
        pose: (t) => {
          const u = smooth(t / 0.4);
          this.fx.spark = clamp(1.4 - t * 0.4, 0, 1);
          this.keyRate = t < 2.2 ? 26 * u : 26 * (1 - smooth((t - 2.2) / 1.2));
          this.fx.rattle = t < 2.2 ? 1 : 0;
          this.arms(30 * Math.sin(t * 14), 14);
          if (t > 0.25 && this.frozen) {
            this.frozen = false;
            this.wound = 1;
          }
          this.wound = Math.min(1, t / 2);
          if (t > 2.4) {
            this.expression = 'happy';
            this.spec.speed = SPEED;
            if (t < 2.5 && this.goal === null) this.stroll(0, this.heightPx * 3);
          }
        },
      },
      sparks: {
        weight: 0.9,
        length: [3, 4],
        face: 'surprised',
        when: ok,
        pose: (t) => {
          this.fx.spark = 1;
          this.fx.rattle = 0.5;
          this.keyRate = 12;
          this.arms(20 + 12 * sin(t, 4), 10);
          p.add('head', -4, 0, 3 * sin(t, 6));
        },
      },
      salute: {
        weight: 1,
        length: [3, 3.6],
        face: 'determined',
        when: ok,
        pose: (t) => {
          const k = smooth(t / 0.3) * smooth((this.actLength - t) / 0.3);
          this.arm(-1, 128 * k, 14 * k, 0);
          p.add('head', 0, 0, 0);
          p.add('body', -2 * k);
        },
      },
      wave: {
        weight: 1.1,
        length: [3, 4],
        face: 'happy',
        when: ok,
        pose: (t) => {
          const k = smooth(t / 0.3) * smooth((this.actLength - t) / 0.3);
          this.arm(-1, 150 * k, 28 * k + 22 * Math.sin(t * 7) * k, 0);
          p.add('head', 0, 0, -6 * k);
          this.keyRate = 4;
        },
      },
      robotDance: {
        weight: 1,
        length: [6, 8],
        face: 'happy',
        when: ok,
        pose: (t) => {
          const beat = Math.floor(t * 2.4) % 4;
          const h = sin(t, 1.2);
          this.fx.still = true;
          this.arm(1, beat === 0 || beat === 1 ? 140 : 30, 8, 0);
          this.arm(-1, beat === 2 || beat === 3 ? 140 : 30, 8, 0);
          p.add('leg.L', beat % 2 ? 22 : 0);
          p.add('leg.R', beat % 2 ? 0 : 22);
          p.add('body', 0, 0, 7 * (beat % 2 ? 1 : -1));
          this.fx.hop = 0.012 * Math.abs(h);
          this.keyRate = 7;
        },
      },
      clank: {
        weight: 1,
        length: [2.2, 2.2],
        face: 'surprised',
        when: ok,
        pose: (t) => {
          this.fx.still = true;
          this.fx.hop = this.arc(t, 0.3, 0.7, 0.14);
          this.fx.spark = t > 0.9 ? 0.7 : 0;
          const up = t > 0.3 && t < 1;
          this.arms(up ? 150 : 20, 12);
          this.keyRate = up ? 18 : 3;
          if (t > 0.98 && t < 1.05) p.kick('body', 18, 0, 0);
          this.fx.rattle = t > 1 && t < 1.8 ? 0.7 : 0;
        },
      },
      aboutTurn: {
        weight: 0.8,
        length: [2.6, 2.6],
        when: ok,
        pose: (t) => {
          // A stiff half turn on the spot, three clanking steps to do it.
          const u = smooth((t - 0.3) / 1.6);
          this.fx.spin = Math.PI * u;
          this.fx.march = true;
          this.fx.still = true;
          this.arms(25 * Math.sin(t * 8), 6);
          this.keyRate = 8;
        },
      },
      clicks: {
        weight: 1,
        length: [5, 6],
        face: 'focused',
        when: ok,
        pose: (t) => {
          // The head clicks round in stops, like a ratchet.
          const stops = [0, 38, 0, -38, 0, 22, -22, 0];
          const i = Math.floor(t * 1.6) % stops.length;
          p.add('head', 0, stops[i]);
          this.keyRate = 2;
          this.fx.rattle = (t * 1.6) % 1 < 0.1 ? 0.4 : 0;
        },
      },
      rattle: {
        weight: 0.7,
        length: [2.4, 2.4],
        face: 'dizzy',
        when: ok,
        pose: () => {
          this.fx.rattle = 1.2;
          this.arms(24, 12);
          this.fx.spark = 0.5;
        },
      },
      lip: {
        weight: 0.8,
        length: [7, 8],
        when: ok,
        start: () => this.walkTo(this.s, 0),
        pose: (t) => {
          if (this.walking) return;
          // Tips forward from the hips, stiff, to look over the lip.
          const k = smooth((t - 1) / 0.8) * smooth((this.actLength - t) / 0.6);
          p.add('body', 22 * k);
          p.add('head', 10 * k, 24 * sin(t, 0.3) * k);
          this.arms(-12 * k, 18 * k);
          this.expression = 'surprised';
        },
      },
      marchOn: {
        weight: 1,
        length: [5, 6],
        face: 'determined',
        when: ok,
        start: () => this.walkTo(this.s, 0.97),
        pose: () => {
          // At the back wall he keeps on marching, getting nowhere.
          if (this.walking) return;
          this.fx.march = true;
          this.keyRate = 8;
        },
      },
      // Reactions (never picked at random).
      poked: {
        weight: 0,
        length: [1.6, 1.6],
        face: 'surprised',
        pose: (t) => {
          this.fx.hop = this.arc(t, 0, 0.45, 0.08);
          this.arms(40, 14);
          this.fx.spark = clamp(1.2 - t, 0, 1);
          this.keyRate = 14;
          if (t > 0.9) this.expression = 'happy';
        },
      },
      dizzy: {
        weight: 0,
        length: [3.2, 3.2],
        face: 'dizzy',
        pose: (t) => {
          const a = 2 * Math.PI * 1.1 * t;
          p.add('body', 6 * Math.cos(a), 0, 6 * Math.sin(a));
          p.add('head', -5 * Math.sin(a), 0, 6 * Math.cos(a));
          this.arms(20 + 14 * Math.sin(a * 1.3), 12);
          this.fx.still = true;
          this.fx.spark = 1;
          this.fx.spin = 2 * Math.PI * smooth(t / 2.8);
          this.keyRate = -16;
        },
      },
    };
  }

  poke() {
    if (this.state !== 'here') return;
    if (this.frozen) {
      this.pokes = [];
      this.setAct('windup');
      return;
    }
    super.poke();
  }

  trick() {
    if (this.frozen) return this.poke();
    super.trick();
  }

  protected onDirect() {
    this.frozen = false;
    this.wound = 1;
    this.spec.speed = SPEED;
  }

  protected onEnter() {
    this.frozen = false;
    this.wound = 1;
  }

  // ---------- Each frame ----------

  protected idle(t: number) {
    const p = this.puppet;
    Object.assign(this.fx, {
      hop: 0,
      spin: 0,
      spark: 0,
      rattle: 0,
      still: false,
      march: false,
      lean: 0,
    });
    this.keyRate = this.frozen ? 0 : this.wound * 1.1;
    if (this.act === 'idle' && this.frozen) this.frozen = false;
    if (this.act !== 'rundown' && this.act !== 'windup') {
      this.spec.speed = SPEED;
      this.wound = Math.min(1, this.wound + 0.02);
    }
    if (this.face) this.face.doodle = null;
    this.arms(3, 5);
    // A small tick of the head, like a clock.
    p.add('head', 0.8 * Math.round(sin(t, 0.5) * 2), 0, 0);
    p.add('ant.L', 0, 0, 4 * wobble(t * 0.9, 2));
    p.add('ant.R', 0, 0, 4 * wobble(t * 0.8, 6));
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    this.env = env;
    if (this.pleased) this.setAct(Math.random() < 0.5 ? 'wave' : 'salute');
    // The march: stiff legs from the hips, arms swinging opposite, the can rocking.
    const walking = this.stride > 1 && !this.fx.still;
    const amt = this.frozen
      ? 1
      : walking
        ? clamp(this.stride / (this.heightPx * 0.7), 0, 1.2)
        : this.fx.march
          ? 1
          : 0;
    let g = this.frozen ? this.frozenGait : this.gait;
    if (!walking && this.fx.march && !this.frozen) {
      this.fakeGait += dt * 7.5;
      g = this.fakeGait;
    }
    if (amt > 0.02) {
      const a = Math.sin(g);
      p.add('leg.L', -26 * a * amt);
      p.add('leg.R', 26 * a * amt);
      this.arm(1, 34 * a * amt, 4);
      this.arm(-1, -34 * a * amt, 4);
      p.add('body', 2 * amt, 0, 5 * a * amt);
      p.add('head', 0, 0, -3 * a * amt);
      if (!this.frozen) this.fx.hop = Math.max(this.fx.hop, 0.008 * Math.abs(Math.cos(g)) * amt);
    }
    // Rattling: a small quick shake of everything loose.
    const r = this.fx.rattle;
    if (r > 0) {
      p.add('body', 0, 0, 3 * r * Math.sin(this.t * 60));
      p.add('head', 2 * r * Math.sin(this.t * 51), 0, 2 * r * Math.sin(this.t * 47));
    }
    this.h = this.fx.hop * this.px;
    // The key turns as he marches; a run-down Clatter's goes slower and slower.
    const rate = walking ? 4.5 * this.wound : this.keyRate;
    this.keyAngle += (this.frozen ? 0 : Math.max(rate, this.keyRate)) * dt;
    if (this.keyRate < 0) this.keyAngle += this.keyRate * dt * 2;
  }

  protected after(_dt: number, env: Env) {
    const p = this.puppet;
    p.turn('key', 0, 0, (this.keyAngle * DEG) % 360);
    GEAR_RATIO.forEach((r, i) =>
      p.turn(`gear${i + 1}`, 0, 0, (this.keyAngle * r * DEG * 1.5) % 360),
    );
    this.lights(env.time);
    if (this.act === 'idle' && this.state === 'here')
      this.expression = this.hovered ? 'happy' : 'neutral';
  }

  update(dt: number, env: Env) {
    super.update(dt, env);
    this.pivot.rotation.y = this.fx.spin;
  }

  private lights(time: number) {
    const mood = this.face?.expression ?? 'neutral';
    const lit = this.frozen ? 0.05 : 1;
    const s = this.fx.spark;
    // Sparks jump between the gears: quick random flickers, brighter when he's wound.
    for (let i = 0; i < 3; i++) {
      const flick = Math.sin(time * (9 + i * 5) + i * 2) > 0.3 - 0.9 * s ? 1 : 0.15;
      const base = (this.wound * 0.35 + s * 0.65) * flick * lit;
      this.outfit.dot(
        i,
        clamp(base, 0, 1),
        s > 0.3 ? RAINBOW[(i + Math.floor(time * 10)) % 4] : GOLD,
      );
    }
    const tone = BEACON[mood] ?? '#f4f4f1';
    this.outfit.dot(3, this.frozen ? 0.1 : 0.55 + 0.35 * Math.sin(time * 3), tone);
  }
}
