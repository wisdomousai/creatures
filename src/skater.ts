import type { Object3D } from 'three';
import type { Bolt } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { BEACON, RAINBOW } from './bolt';
import { sin } from './moves';
import { wobble } from './spring';
import { smooth, Toybot } from './toybot';

/**
 * Skip, a play-friend: a compact humanoid robot on inline roller skates, in a big rounded
 * helmet with a ridge fin and a wide visor screen, knee pads, elbow pads, wrist guards
 * and shorts. His knees really bend (thigh and shin are separate joints), so he crouches
 * into a push, tucks for speed, jumps and skids.
 *
 * He is the quickest on the floor: he never walks, he skates, in long strokes with a lean
 * and a push of the legs, the wheels turning with the floor and their hubs lighting up
 * with speed. In tag he is the one who is hard to catch, and the one who catches (the
 * director sends everyone at `hurry`, and his base speed is the highest in the crew).
 *
 * With Bolt on the floor he skates up for a pair dance: the two of them side by side, the
 * same moves a beat apart (he sets Bolt dancing).
 *
 * Tricks: a long glide, a low tuck for speed, a slalom, a spin on the glide, a jump with
 * a half turn, a skid stop that ends a dash, going backwards, a wheelie, arms out like
 * wings, knocking on his helmet, a pose with hands on hips, a lunge stretch, a pair dance
 * with Bolt.
 */
export const SKATER_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.3, 0.5],
    [0.7, 0.5],
  ],
  rx: 0.085,
  ry: 0.3,
  line: 0.04,
  mouth: null,
};

const DEG = 180 / Math.PI;
const WHEEL = 0.03;
const SPEED = 1.7;
const WHEELS = ['wheel0.L', 'wheel1.L', 'wheel2.L', 'wheel0.R', 'wheel1.R', 'wheel2.R'];

export class Skater extends Toybot {
  private fx = {
    hop: 0,
    spin: 0,
    still: false,
    crouch: 0, // knees bent, 0..1
    tuck: 0, // lean forward, 0..1
    skid: 0, // boots turned across the way he was going, 0..1
    flash: 0,
  };
  private crouch = 0;
  private wheels = 0;
  private mate: Bolt | null = null;
  private way = 1;
  private route: { s: number; d: number }[] = [];
  private leg = -1;
  private top = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Skip',
        model: 'skater',
        metres: 0.84,
        width: 0.4,
        size: 1.1,
        feels: {
          default: { f: 2.6, zeta: 0.6 },
          root: { f: 2.8, zeta: 0.7 },
          body: { f: 2.6, zeta: 0.55 },
          head: { f: 2.4, zeta: 0.55, r: 0.4 },
          'upper_arm.L': { f: 3, zeta: 0.45 },
          'upper_arm.R': { f: 3, zeta: 0.45 },
          'forearm.L': { f: 3.4, zeta: 0.4 },
          'forearm.R': { f: 3.4, zeta: 0.4 },
          'leg.L': { f: 3, zeta: 0.5 },
          'leg.R': { f: 3, zeta: 0.5 },
          'shin.L': { f: 3, zeta: 0.5 },
          'shin.R': { f: 3, zeta: 0.5 },
        },
        face: SKATER_FACE,
        eyes: 0.83,
        gaze: [
          { bone: 'head', yaw: 0.7, pitch: 0.8 },
          { bone: 'body', yaw: 0.25, pitch: 0.15 },
        ],
        reach: { yaw: 55, pitch: 28 },
        lag: 1,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [60, 130],
        speed: SPEED,
      },
      model,
    );
    this.acts = this.moves();
  }

  /** Skate up beside Bolt, on this side of him, close enough to dance. */
  private beside(o: Bolt, gap = 1.05) {
    this.mate = o;
    this.way = this.s < o.s ? -1 : 1;
    this.arrivedAt = -1;
    const room = this.spaceTo(o, this.env!.frame);
    this.walkTo(o.s + this.way * room.rx * gap, o.depth);
  }

  // ---------- Acts ----------

  private moves(): Record<string, Act> {
    const p = this.puppet;
    const ok = () => this.free_;
    return {
      idle: { weight: 3, length: [3, 6] },
      glide: {
        weight: 2.6,
        length: [1.5, 3],
        when: ok,
        start: () =>
          this.stroll(Math.random() < 0.5 ? -1 : 1, this.heightPx * (1.5 + Math.random() * 2.5)),
      },
      // Down low, arms back, flat out across the floor.
      tuck: {
        weight: 1.2,
        length: [3, 4],
        face: 'determined',
        when: ok,
        start: () => this.stroll(0, this.heightPx * (4 + Math.random() * 3)),
        pose: () => {
          this.spec.speed = 2.9;
          this.fx.tuck = 1;
          this.fx.crouch = 0.75;
          this.arms(-50, 8, 30);
        },
      },
      slalom: {
        weight: 1,
        length: [8, 8],
        face: 'happy',
        when: ok,
        start: () => {
          // Five gates across the floor, in and out of the depth.
          this.way = Math.random() < 0.5 ? -1 : 1;
          const step = this.heightPx * 0.9;
          this.route = Array.from({ length: 5 }, (_, i) => ({
            s: this.s + this.way * step * (i + 1),
            d: i % 2 ? 0.2 : 0.75,
          }));
          this.leg = 0;
        },
        pose: () => {
          const f = this.env?.frame;
          if (!f) return;
          this.spec.speed = 2.3;
          this.fx.crouch = 0.3;
          this.arms(10, 40, 20);
          if (
            this.leg >= 0 &&
            this.leg < this.route.length &&
            this.goal === null &&
            !this.walking
          ) {
            const w = this.route[this.leg++];
            this.walkTo(clamp(w.s, f.left + this.widthPx(), f.right - this.widthPx()), w.d);
          } else if (this.leg >= this.route.length && !this.walking && this.goal === null)
            this.setAct('idle');
        },
      },
      spin: {
        weight: 1.3,
        length: [3, 3],
        face: 'happy',
        when: ok,
        start: () => this.stroll(0, this.heightPx * 1.5),
        pose: (t) => {
          const u = smooth((t - 0.2) / 2);
          this.fx.spin = Math.PI * 6 * u;
          this.fx.crouch = 0.25 * Math.sin(Math.PI * u);
          // Arms in tight for the spin, a leg out.
          this.arms(
            50 * u * (1 - u) * 4,
            20 + 40 * (1 - Math.sin(Math.PI * u)),
            80 * Math.sin(Math.PI * u),
          );
          p.add('leg.R', -20 * Math.sin(Math.PI * u));
        },
      },
      jump: {
        weight: 1.6,
        length: [2.6, 2.6],
        face: 'surprised',
        when: ok,
        pose: (t) => {
          this.fx.still = true;
          const down = smooth(t / 0.4) * (t < 0.5 ? 1 : 0);
          const land = smooth((t - 1.2) / 0.1) * smooth((1.7 - t) / 0.3);
          this.fx.crouch = Math.max(down * 0.8, land * 0.7);
          this.fx.hop = this.arc(t, 0.5, 0.7, 0.22);
          this.fx.spin = Math.PI * smooth((t - 0.55) / 0.6) * (t > 0.55 ? 1 : 0);
          this.arms(t > 0.4 && t < 1.2 ? 150 : 25, 20);
          if (t > 1.3) this.expression = 'happy';
        },
      },
      // A dash, and a skid stop that throws the hubs' lights up.
      skid: {
        weight: 1.4,
        length: [4.5, 4.5],
        face: 'determined',
        when: ok,
        start: () => {
          this.top = 0;
          this.stroll(0, this.heightPx * (3.5 + Math.random() * 2));
        },
        pose: (t) => {
          const f = this.env?.frame;
          if (!f) return;
          if (this.walking || this.goal !== null) {
            this.spec.speed = 3;
            this.fx.tuck = 0.7;
            this.fx.crouch = 0.45;
            this.arms(-30, 20, 20);
            this.top = t;
            return;
          }
          const u = t - this.top;
          const k = smooth(u / 0.15) * smooth((1.4 - u) / 0.5);
          this.fx.skid = k;
          this.fx.crouch = 0.5 * k;
          this.fx.flash = k;
          this.arms(20 * k, 70 * k, 20 * k);
          p.add('body', -12 * k, 0, 4 * k);
          this.fx.hop = this.arc(u, 0, 0.4, 0.03);
          this.expression = u > 0.9 ? 'happy' : 'surprised';
          if (u > 2.4) this.setAct('idle');
        },
      },
      backwards: {
        weight: 0.6,
        length: [3.2, 3.2],
        face: 'happy',
        when: ok,
        pose: (t) => {
          this.spec.turn = 0;
          this.spec.speed = 1.2;
          if (t < 0.15) this.stroll(0, this.heightPx * 2);
          p.add('head', 0, 24 * sin(t, 0.4), -4);
          this.arms(0, 30, 30);
        },
      },
      wheelie: {
        weight: 0.8,
        length: [3.4, 3.4],
        face: 'determined',
        when: ok,
        start: () => this.stroll(0, this.heightPx * 3),
        pose: (t) => {
          this.spec.speed = 1.6;
          const k = smooth((t - 0.2) / 0.4) * smooth((3.2 - t) / 0.4);
          p.add('boot.L', -26 * k);
          p.add('boot.R', -26 * k);
          p.add('body', -14 * k);
          this.arms(50 * k, 40 * k, 10);
        },
      },
      airplane: {
        weight: 0.8,
        length: [3, 4],
        face: 'happy',
        when: ok,
        start: () => this.stroll(0, this.heightPx * (4 + Math.random() * 2)),
        pose: (t) => {
          this.spec.speed = 2.6;
          this.arms(0, 82 + 6 * sin(t, 0.8), 0);
          this.fx.tuck = 0.5;
          p.add('body', 0, 0, this.way * 8);
        },
      },
      knock: {
        weight: 0.9,
        length: [3, 3],
        when: ok,
        pose: (t) => {
          // Raps on his helmet, twice: "anybody home?" The ear lights answer.
          const k = smooth(t / 0.3) * smooth((2.8 - t) / 0.3);
          this.arm(-1, 130 * k, 8, 110 * k + 10 * Math.max(0, Math.sin(t * 14)) * k);
          p.add('head', 0, 8 * k, -4 * k);
          this.fx.flash = Math.max(0, Math.sin(t * 14)) * (t > 0.6 ? 1 : 0);
          this.expression = t > 1.4 ? 'sheepish' : 'wink';
        },
      },
      pose: {
        weight: 0.9,
        length: [4, 4],
        face: 'determined',
        when: ok,
        pose: (t) => {
          // Hands on hips, a hip out, chin up.
          const k = smooth(t / 0.4) * smooth((3.8 - t) / 0.4);
          this.arm(1, 10 * k, 52 * k, 100 * k);
          this.arm(-1, 10 * k, 52 * k, 100 * k);
          p.add('body', 0, 0, 6 * k);
          p.add('head', -6 * k, 8 * k, -4 * k);
          p.add('leg.R', 10 * k);
          this.expression = k > 0.5 ? 'wink' : 'neutral';
        },
      },
      lunge: {
        weight: 0.8,
        length: [4.5, 4.5],
        when: ok,
        pose: (t) => {
          // A stretch: one knee bent deep, the other leg out behind, fingertips to the floor.
          const k = smooth(t / 0.7) * smooth((4.3 - t) / 0.7);
          p.add('leg.L', -70 * k);
          p.add('shin.L', 90 * k);
          p.add('leg.R', 30 * k);
          p.add('body', 25 * k);
          this.arm(1, -30 * k, 10, 0);
          this.arm(-1, 20 * k, 25, 0);
          this.expression = 'focused';
        },
      },
      // With Bolt: side by side, the same moves a beat apart.
      pairDance: {
        weight: 1.6,
        length: [11, 11],
        face: 'happy',
        when: () => this.free_ && this.bolt() !== null,
        start: () => {
          const o = this.bolt();
          if (o) this.beside(o);
        },
        pose: (t) => {
          this.spec.steers = false;
          const o = this.mate;
          if (!o || o.state !== 'here' || o.flying) return void this.setAct('idle');
          const since = this.since(t);
          if (since < 0) {
            if (t > 6) this.setAct('idle');
            return;
          }
          if (since > 0.4 && !this.sent) {
            this.sent = true;
            o.perform('dance');
          }
          // Skates a sway left and right in time, knees pumping, arms up and down.
          const beat = sin(since, 1);
          const half = sin(since, 0.5);
          this.fx.still = true;
          this.fx.crouch = 0.25 + 0.25 * Math.abs(beat);
          p.add('root', 0, 0, 6 * beat);
          p.add('body', 0, 6 * half, -8 * beat);
          this.arm(1, 60 + 60 * sin(since + 0.5, 1), 30, 40);
          this.arm(-1, 60 - 60 * sin(since + 0.5, 1), 30, 40);
          p.add('head', 5 * Math.abs(beat), 0, 7 * beat);
          this.fx.hop = 0.02 * Math.abs(beat);
          this.fx.flash = 0.6;
          if (since > 5.5) {
            this.fx.spin = 2 * Math.PI * smooth((since - 5.5) / 1.5);
          }
          if (since > 8) this.setAct('idle');
        },
      },
      // Reactions (never picked at random).
      poked: {
        weight: 0,
        length: [1.8, 1.8],
        face: 'surprised',
        pose: (t) => {
          this.fx.hop = this.arc(t, 0, 0.5, 0.12);
          this.arms(60, 50, 20);
          p.add('body', 0, 0, -8 * Math.sin(t * 8) * Math.max(0, 1 - t));
          if (t > 1) this.expression = 'happy';
        },
      },
      dizzy: {
        weight: 0,
        length: [3.2, 3.2],
        face: 'dizzy',
        pose: (t) => {
          const a = 2 * Math.PI * 1.1 * t;
          p.add('body', 7 * Math.cos(a), 0, 7 * Math.sin(a));
          p.add('head', -6 * Math.sin(a), 0, 6 * Math.cos(a));
          this.arms(20 + 14 * Math.sin(a * 1.3), 40);
          this.fx.spin = 2 * Math.PI * smooth(t / 2.6);
          this.fx.still = true;
          this.fx.flash = 1;
          this.fx.crouch = 0.2 + 0.1 * Math.sin(a);
        },
      },
    };
  }

  protected onDirect() {
    this.mate = null;
  }

  protected onEnter() {
    this.wheels = 0;
    this.mate = null;
  }

  // ---------- Each frame ----------

  protected idle(t: number) {
    const p = this.puppet;
    Object.assign(this.fx, {
      hop: 0,
      spin: 0,
      still: false,
      crouch: 0,
      tuck: 0,
      skid: 0,
      flash: 0,
    });
    if (this.face) this.face.doodle = null;
    this.spec.speed = SPEED;
    this.spec.turn = 80;
    this.spec.steers = true;
    const b = Math.sin(2 * Math.PI * 0.3 * t);
    p.add('body', 1.2 * b);
    p.add('head', 1.5 * b, 0, 2 * wobble(t * 0.3, 1));
    // He never quite stops: a little rocking on the wheels.
    p.add('root', 0, 0, 1.2 * wobble(t * 0.5, 6));
    this.fx.crouch = 0.08 + 0.04 * b;
    this.arms(4 + 2 * b, 12, 18);
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    this.env = env;
    if (this.pleased) this.setAct(Math.random() < 0.5 ? 'pose' : 'knock');
    // Skating: lean into it, push with the legs, bend the knee of the one recovering.
    const amt = clamp(this.stride / (this.heightPx * 1.2), 0, 1.4);
    if (amt > 0.02 && !this.fx.still) {
      const a = Math.sin(this.gait * 0.5);
      p.add('leg.L', -18 * a * amt);
      p.add('leg.R', 18 * a * amt);
      p.add('shin.L', 20 * Math.max(0, a) * amt);
      p.add('shin.R', 20 * Math.max(0, -a) * amt);
      p.add('body', 9 * amt);
      p.add('head', -4 * amt);
      p.add('body', 0, 0, 3 * a * amt);
      this.arm(1, 12 * a * amt, 8 * amt, 18 * amt);
      this.arm(-1, -12 * a * amt, 8 * amt, 18 * amt);
      this.fx.crouch = Math.max(this.fx.crouch, 0.25 * amt);
    }
    // The tuck: body right over, head up.
    p.add('body', 38 * this.fx.tuck);
    p.add('head', -34 * this.fx.tuck);
    // The skid: boots swung across the way he was going.
    if (this.fx.skid > 0) {
      p.add('boot.L', 0, 60 * this.fx.skid);
      p.add('boot.R', 0, 60 * this.fx.skid);
    }
    this.crouch += (this.fx.crouch - this.crouch) * (1 - Math.exp(-14 * dt));
    this.h = this.fx.hop * this.px;
    // Wheels turn with the floor going by; locked (a skid) they don't.
    this.wheels += ((this.stride * dt) / (WHEEL * this.px)) * (1 - 0.9 * this.fx.skid);
  }

  protected after(_dt: number, env: Env) {
    const p = this.puppet;
    // Bent knees: the thigh goes forward, the shin back twice as far, and the hips drop to match.
    const k = this.crouch;
    const th = 55 * k;
    const drop = 0.3 * (1 - Math.cos((th * Math.PI) / 180));
    for (const s of ['L', 'R']) {
      p.turn(`leg.${s}`, -th);
      p.turn(`shin.${s}`, 2 * th);
      p.shift(`leg.${s}`, 0, -drop, 0);
    }
    p.shift('body', 0, -drop, 0);
    for (const w of WHEELS) p.turn(w, (this.wheels * DEG) % 360);
    this.lights(env.time);
    if (this.act === 'idle' && this.state === 'here')
      this.expression = this.hovered ? 'happy' : 'neutral';
  }

  update(dt: number, env: Env) {
    super.update(dt, env);
    this.pivot.rotation.y = this.fx.spin;
  }

  /** The badge, the ear lights, the fin and the wheel hubs: his mood, and his speed. */
  private lights(time: number) {
    const mood = this.face?.expression ?? 'neutral';
    const tone = BEACON[mood] ?? '#ff9ad0';
    const fast = clamp(this.stride / (this.heightPx * 2), 0, 1);
    const f = this.fx.flash;
    const rainbow = RAINBOW[Math.floor(time * 8) % RAINBOW.length];
    this.outfit.dot(0, 0.6 + 0.3 * Math.sin(time * 2.2), mood === 'neutral' ? '#ff9ad0' : tone);
    this.outfit.dot(
      1,
      f > 0.1 ? (Math.sin(time * 18) > 0 ? 1 : 0.2) : 0.5 + 0.2 * Math.sin(time * 2),
      f > 0.1 ? rainbow : tone,
    );
    this.outfit.dot(2, 0.4 + 0.6 * fast, tone);
    this.outfit.dot(
      3,
      this.stride > 1 ? 0.4 + 0.6 * Math.abs(Math.sin(time * 14)) : 0.15 + 0.85 * f,
      f > 0.1 ? rainbow : '#ffd23f',
    );
  }
}
