import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { Expression, FaceLayout } from './face';
import { sin } from './moves';
import { bump, cycle, ease, FixedSpring, type Point, type Spot, Swimmer } from './swimmer';

/**
 * Lumen, the robot jellyfish. A domed bell like a lit lampshade with a screen face on its
 * front, two lit bands round it, a ring of lamps at its margin and a beacon knob on top;
 * six long tentacles of five rounded segments, each with a lit bead (so a light can run
 * down all six at once), and three fat oral arms between them. It floats in the band just
 * inside the frame like the pufferfish, a little way back, passing behind the crew, its
 * bell pulsing now and then (it squashes, the tentacles pull in a little) and its tentacles
 * trailing behind whichever way it drifts, each a beat behind the one above.
 *
 * Tricks: pulses up and drifts slowly down (three strong pulses, a long sink), a light
 * running down the tentacles (colours racing down all six), tangles itself in its own
 * tentacles and shakes loose, a wave with one tentacle, a twirl with the tentacles flying
 * out, curling its tentacles up round the bell when shy, dozing as it sinks, peeking from
 * the back of the box, bonking the frame line, a dance (the bell tipping to a beat), three
 * hiccups, spreading its tentacles like an umbrella, a long glide with the tentacles
 * streaming, a sparkle round the lamps, and a bow. Poke it and it clenches (a hard pulse and
 * a dart up, every light flashing); three pokes and it spins dizzy; rest the mouse on it
 * and it glows pink and slow.
 */
export const JELLYFISH_FACE: FaceLayout = {
  width: 512,
  height: 288,
  eyes: [
    [0.3, 0.5],
    [0.7, 0.5],
  ],
  rx: 0.1,
  ry: 0.3,
  line: 0.036,
  mouth: [0.5, 0.82],
};

const TENTACLES = 6;
const ARMS = 3;
const SEGS = 5;
const ARM_SEGS = 3;
const turnAngle = (k: number, n: number, off = 0) => ((off + (360 * k) / n) * Math.PI) / 180;

export class Jellyfish extends Swimmer {
  /** The bell squashed (1) or relaxed (0), kicked by each pulse. */
  private sq = new FixedSpring();
  private beatT = 0;
  private lift = 0;
  /** How wide the tentacles spread, how curled up, how tangled, 0..1 (sprung). */
  private spread = new FixedSpring(2.5, 0.6);
  private curl = new FixedSpring(2.5, 0.7);
  private knot = new FixedSpring(3, 0.5);
  private flare = new FixedSpring(3, 0.5);
  private sway = 0;
  private lightT = -1;
  private tone: string | undefined;
  private spin = 0;
  private bow = new FixedSpring(2, 0.6);

  constructor(model: Object3D) {
    const tent = { f: 4, zeta: 0.32 };
    const feels: Record<string, { f: number; zeta: number; r?: number }> = {
      default: { f: 3, zeta: 0.5 },
      root: { f: 1.4, zeta: 0.6 },
      body: { f: 1.3, zeta: 0.45, r: 0.5 },
      bell: { f: 4, zeta: 0.4 },
    };
    for (let k = 0; k < TENTACLES; k++)
      for (let i = 1; i <= SEGS; i++)
        feels[`tent.${k}.${i}`] = { f: 3.6 + i * 0.1, zeta: tent.zeta };
    for (let k = 0; k < ARMS; k++)
      for (let i = 1; i <= ARM_SEGS; i++) feels[`arm.${k}.${i}`] = { f: 3.2, zeta: 0.4 };
    super(
      {
        name: 'Lumen',
        model: 'jellyfish',
        metres: 0.4,
        width: 0.27,
        size: 1.0,
        feels: feels as never,
        face: JELLYFISH_FACE,
        eyes: 0.69,
        gaze: [
          { bone: 'bell', yaw: 0.6, pitch: 0.5 },
          { bone: 'body', yaw: 0.2, pitch: 0.2 },
        ],
        reach: { yaw: 50, pitch: 28 },
        lag: 1.2,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 1.2,
        turn: 40,
      },
      model,
    );
    this.inset = 0.62;
    this.acts = this.moves();
  }

  private moves(): Record<string, Act> {
    const still = () => !!this.free && !this.route.length && !this.exiting;
    return {
      idle: { weight: 3, length: [3, 7] },
      swim: {
        weight: 2.4,
        length: [3, 6],
        when: still,
        start: () => this.swimTo(this.somewhere()),
      },
      glide: {
        weight: 1,
        length: [5, 7],
        when: still,
        start: () => this.swimTo(this.spot + this.loopDir(this.toward) * this.heightPx * 6),
      },
      pulse: { weight: 1.4, length: [8.5, 9], face: 'happy', when: still },
      lightrun: { weight: 1.2, length: [5.5, 6], face: 'wink', when: still },
      tangle: { weight: 0.9, length: [7.5, 8], when: still },
      wave: { weight: 0.9, length: [3.6, 4], face: 'happy', when: still },
      twirl: { weight: 0.8, length: [3.4, 3.8], face: 'happy', when: still },
      shy: { weight: 0.7, length: [4.4, 5], face: 'love', when: still },
      doze: { weight: 0.7, length: [9, 14], face: 'asleep', when: still },
      peek: { weight: 0.7, length: [8, 8.6], when: still },
      bonk: { weight: 0.7, length: [5, 5.4], face: 'surprised', when: still },
      dance: { weight: 0.8, length: [5, 5.6], face: 'happy', when: still },
      hiccup: { weight: 0.7, length: [4, 4.4], when: still },
      umbrella: { weight: 0.8, length: [4.6, 5], face: 'determined', when: still },
      sparkle: { weight: 0.8, length: [4.4, 5], face: 'starry', when: still },
      bow: { weight: 0.6, length: [3.6, 4], face: 'happy', when: () => still() && !!this.mate() },
      poked: { weight: 0, length: [3.8, 4.2] },
      love: { weight: 0, length: [3, 4], face: 'love' },
      dizzy: { weight: 0, length: [4.6, 4.6] },
    };
  }

  protected depthFor(act: string) {
    if (act === 'peek') return 1;
    if (act === 'swim') return Math.random() * 0.45;
    if (['poked', 'bonk', 'wave', 'bow', 'sparkle', 'lightrun', 'dance'].includes(act)) return 0.1;
    return undefined;
  }

  protected startle() {
    this.hold();
    this.contract(5);
    this.vel.y -= this.heightPx * 3.2;
    this.lightT = 0;
    this.tone = BEACON.surprised;
    this.setAct('poked');
  }

  private contract(strength: number) {
    this.sq.kick(strength * 2.4);
    this.beatT = 0;
    this.lift = strength;
  }

  protected station(env: Env, s: Spot): Point {
    const t = this.actT;
    const H = s.H;
    let x = 0;
    let y = -H * 0.05 * Math.max(0, this.sq.y);
    switch (this.act) {
      case 'pulse': {
        // Three strong pulses, each a step up; then a long slow sink.
        let up = 0;
        for (const at of [0.6, 1.8, 3]) up += 0.5 * ease((t - at) / 0.7);
        y -= H * up * (1 - ease((t - 4.4) / 4));
        break;
      }
      case 'bonk': {
        // Up to the frame line, bump, and back a little.
        const k = ease(t / 1.4) * (t < 3.4 ? 1 : 1 - ease((t - 3.4) / 1));
        const hit = t > 1.5 && t < 3.4 ? Math.abs(Math.sin((t - 1.5) * 4)) * 0.1 : 0;
        x += s.inward.x * -H * (0.55 * k - hit);
        y += s.inward.y * -H * (0.55 * k - hit);
        break;
      }
      case 'doze':
        y += H * 0.3 * ease(t / 3);
        break;
      case 'twirl':
        y -= H * 0.3 * bump(t - 1.7, 1.7);
        break;
      case 'dance':
        x += H * 0.25 * Math.sin(t * 2 * Math.PI * 0.8);
        break;
      case 'dizzy':
        x += Math.cos(env.time * 4) * H * 0.15;
        y += Math.sin(env.time * 4) * H * 0.1;
        break;
      case 'poked':
        y += H * 0.15 * bump(t - 2, 2);
        break;
    }
    return { x, y };
  }

  protected fast() {
    return this.act === 'glide' ? 1.6 : 1.7;
  }

  protected turnFor(fade: number) {
    const base = clamp(this.vel.x / this.heightPx, -1, 1) * 30;
    switch (this.act) {
      case 'wave':
      case 'bow':
        return this.toward * 18 * fade;
      case 'peek':
      case 'bonk':
      case 'sparkle':
        return 0;
      default:
        return base;
    }
  }

  protected leanFor() {
    switch (this.act) {
      case 'dance':
        return 0.22 * Math.sin(this.actT * 2 * Math.PI * 0.8);
      case 'bow':
        return this.toward * 0.35 * this.bow.y;
      default:
        return 0;
    }
  }

  protected idle(t: number) {
    const p = this.puppet;
    p.shift('root', 0, 0.012 * sin(t, 0.3), 0);
    p.add('body', 2 * sin(t, 0.21), 0, 3 * sin(t, 0.17));
    p.add('knob', 6 * sin(t, 0.4), 0, 6 * sin(t, 0.33));
  }

  protected pose(dt: number, env: Env) {
    super.pose(dt, env);
    const p = this.puppet;
    const t = this.actT;
    const act = this.act;
    const time = env.time;
    const H = this.heightPx;
    const calm = !['poked', 'dizzy', 'love', 'tangle', 'twirl'].includes(act);
    this.mind(dt, env, calm);
    const crossed = (at: number) => t >= at && t - dt < at;

    // The pulse: every so often, the bell clenches.
    this.beatT += dt;
    const period = this.swimming() > 0.3 ? 1.5 : act === 'doze' ? 6 : 2.8;
    if (this.beatT > period && act !== 'pulse' && act !== 'poked')
      this.contract(this.swimming() > 0.3 ? 1.6 : 1);

    let face: Expression = this.hovered ? 'happy' : 'neutral';
    let spread = 0;
    let curl = 0;
    let knot = 0;
    let flare = 0;
    let sway = 1;
    this.sway = 1;
    this.spin = 0;
    this.spinning = false;
    switch (act) {
      case 'poked':
        // Clenched, tentacles snapped up, then a slow let-go.
        curl = t < 1.4 ? 1 : 1 - ease((t - 1.4) / 1.6);
        face = t < 0.6 ? 'surprised' : t < 2 ? 'cross' : 'sleepy';
        break;
      case 'pulse':
        for (const at of [0.6, 1.8, 3]) if (crossed(at)) this.contract(4);
        curl = 0.25 * bump(t - 1.8, 1.8);
        flare = t > 4.4 ? ease((t - 4.4) / 2) : 0;
        face = t < 4.2 ? 'determined' : 'sleepy';
        break;
      case 'lightrun':
        if (crossed(0.5)) this.tone = RAINBOW[Math.floor(time * 3) % RAINBOW.length];
        spread = 0.5 * bump(t - 2.8, 2.8);
        face = 'wink';
        break;
      case 'tangle': {
        // Wraps itself up, looks surprised and sheepish, then a big shake and it's loose.
        knot = t < 3.4 ? ease(t / 2) : 1 - ease((t - 3.4) / 0.3);
        face = t < 2 ? 'focused' : t < 3.4 ? 'sheepish' : t < 4.8 ? 'surprised' : 'happy';
        if (crossed(3.4)) {
          this.contract(5);
          p.kick('body', 0, 0, 80);
        }
        sway = t > 3.4 && t < 5 ? 3 : 1;
        break;
      }
      case 'wave':
        face = 'happy';
        break;
      case 'twirl': {
        const u = ease((t - 0.3) / 2.6);
        this.spin = 2 * Math.PI * u * this.toward;
        this.spinning = true;
        spread = u * (1 - u) * 3;
        break;
      }
      case 'shy':
        curl =
          ease((t - 0.2) / 1) * (t < this.actLength - 1 ? 1 : 1 - ease(t - this.actLength + 1));
        face = t < 2 ? 'love' : 'wink';
        break;
      case 'doze':
        sway = 0.4;
        curl = 0.1;
        break;
      case 'peek':
        face = t < 3.2 ? 'neutral' : t < 5.2 ? 'focused' : 'surprised';
        p.add('body', 8 * Math.sin(t * 1.4), 0, 5 * Math.sin(t * 1.1));
        break;
      case 'bonk':
        if (crossed(1.5) || crossed(2.0) || crossed(2.5)) this.contract(2.5);
        face = t < 1.5 ? 'neutral' : t < 3.6 ? 'surprised' : 'sheepish';
        break;
      case 'dance':
        for (const at of [0.5, 1.75, 3, 4.25]) if (crossed(at)) this.contract(2.5);
        spread = 0.3 + 0.3 * Math.sin(t * 2 * Math.PI * 1.6);
        break;
      case 'hiccup':
        for (const at of [0.7, 1.7, 2.6])
          if (crossed(at)) {
            this.contract(3);
            this.tone = BEACON.surprised;
            this.lightT = 0;
          }
        face = [0.7, 1.7, 2.6].some((x) => t > x && t < x + 0.25) ? 'surprised' : 'neutral';
        break;
      case 'umbrella':
        spread = ease(t / 0.8) * (t < this.actLength - 1 ? 1 : 1 - ease(t - this.actLength + 1));
        flare = spread;
        break;
      case 'glide':
        sway = 1.6;
        spread = 0;
        break;
      case 'sparkle':
        break;
      case 'bow':
        this.bow.update(dt, t > 0.5 && t < this.actLength - 1 ? 1 : 0);
        face = 'love';
        break;
      case 'love':
        face = 'love';
        curl = 0.15;
        break;
      case 'dizzy':
        face = 'dizzy';
        knot = 0.3;
        break;
    }
    if (act !== 'bow') this.bow.update(dt, 0);
    this.expression = face;
    this.sway = sway;
    const sp = this.spread.update(dt, spread);
    const cu = this.curl.update(dt, curl);
    const kn = this.knot.update(dt, knot);
    this.flare.update(dt, flare);

    // The tentacles: trailing behind the way it drifts, each segment a beat behind the last.
    const trail = clamp(this.vel.x / (H * 2), -1, 1);
    const rise = clamp(-this.vel.y / (H * 2), -1, 1);
    for (let k = 0; k < TENTACLES; k++) {
      const a = turnAngle(k, TENTACLES);
      const cx = Math.cos(a);
      const cz = -Math.sin(a);
      for (let i = 1; i <= SEGS; i++) {
        const w = 2 * Math.PI * (0.45 * time - 0.16 * i + 0.17 * k);
        const amp = (3.5 + 1.2 * i) * sway;
        let roll = amp * Math.sin(w) - trail * 7 * (0.5 + i * 0.3) + 4 * sp * cx * i * 0.6;
        let pitch = amp * 0.7 * Math.sin(w + 1.3) + 4 * sp * -cz * i * 0.6;
        // Pulled up and in (shy, clenched), or knotted round the axis.
        roll += -cx * cu * 28 + (k % 2 ? 1 : -1) * kn * (16 + 3 * i) * Math.sin(0.9 * i + 1.5 * k);
        pitch += cz * cu * 28 + kn * (14 + 2 * i) * Math.cos(1.1 * i + k) + rise * 5 * i;
        // Spread out wide (umbrella) is outward: opposite of curling in.
        roll += cx * sp * 16;
        pitch += -cz * sp * 16;
        if (act === 'wave' && k === 0) {
          const e = ease(t / 0.5) * (t < this.actLength - 0.6 ? 1 : 0);
          roll += e * (40 + 14 * Math.sin(t * 9 - i * 0.5)) * (i < 3 ? 1 : 0.6);
        }
        if (act === 'twirl') roll += cx * 30 * ease(t / 1) * (1 - ease((t - 2.8) / 0.6));
        p.add(`tent.${k}.${i}`, pitch, 0, roll);
      }
    }
    for (let k = 0; k < ARMS; k++) {
      const a = turnAngle(k, ARMS, 90);
      for (let i = 1; i <= ARM_SEGS; i++) {
        const w = 2 * Math.PI * (0.6 * time - 0.2 * i + 0.3 * k);
        p.add(
          `arm.${k}.${i}`,
          5 * i * Math.sin(w + 1) * sway + cu * -Math.sin(a) * 30,
          0,
          5 * i * Math.sin(w) * sway - trail * 5 * i + cu * -Math.cos(a) * 30,
        );
      }
    }
    // The bell tips a little the way it rises or drifts.
    p.add('bell', 0, 0, -trail * 5);
    p.add('bell', -4 * rise, 0, 0);
    if (act === 'doze') p.add('bell', 6, 0, 0);
    if (act === 'peek' && this.frame) p.add('bell', 0, 0, 0);
    if (act === 'bow') p.add('bell', 18 * this.bow.y, 0, 0);
  }

  /** Lights: the tentacle beads (Dot0..4), the lamps (5) and the two bands (6, 7). */
  private lights(time: number) {
    const act = this.act;
    const t = this.actT;
    const moving = this.swimming() > 0.25;
    const sq = clamp(this.sq.y, 0, 1);
    let tone: string | undefined;
    for (let i = 0; i < 8; i++) {
      let level = 0.55 + 0.25 * Math.sin(time * 1.1 - i * 0.7);
      tone = undefined;
      // A glow that follows each pulse of the bell, running up from the lamps.
      if (i >= 5) level = 0.5 + 0.5 * clamp(sq * 1.6 - (i - 5) * 0.2, 0, 1);
      const run = i < 5 ? i / 5 : 0;
      if (act === 'poked' && t < 0.8) {
        level = Math.sin(time * 34) > 0 ? 1 : 0.35;
        tone = BEACON.surprised;
      } else if (act === 'lightrun') {
        // Colour racing down all six tentacles, then round the bell.
        const phase = cycle(t * 0.8) * 1.4;
        level =
          i < 5 ? 0.25 + 0.75 * bump(phase - 0.15 - run, 0.28) : 0.5 + 0.5 * bump(phase - 1.1, 0.4);
        tone = RAINBOW[(Math.floor(t * 0.8) + i) % RAINBOW.length];
      } else if (act === 'pulse') {
        level = i < 5 ? 0.4 + 0.5 * bump(cycle(t / 1.2) - run, 0.3) : 0.6 + 0.4 * sq;
        tone = BEACON.happy;
      } else if (act === 'dizzy') {
        level = Math.sin(time * 7 + i * 2.3) > 0.2 ? 1 : 0.15;
        tone = RAINBOW[(i + Math.floor(time * 3)) % RAINBOW.length];
      } else if (act === 'love' || act === 'shy' || act === 'bow') {
        level = 0.65 + 0.35 * Math.sin(time * 2.4 - i * 0.6);
        tone = BEACON.love;
      } else if (act === 'dance') {
        level = Math.sin(t * 2 * Math.PI * 1.6 + i) > 0 ? 1 : 0.25;
        tone = RAINBOW[(i + Math.floor(time * 4)) % RAINBOW.length];
      } else if (act === 'sparkle') {
        level = Math.sin(time * 18 + i * 5.1) > 0.4 ? 1 : 0.2;
        tone = BEACON.starry;
      } else if (act === 'hiccup' || act === 'bonk' || act === 'tangle') {
        level = 0.4 + 0.5 * Math.abs(Math.sin(time * 9 + i * 1.3)) * (act === 'tangle' ? 0.6 : 1);
        tone = act === 'tangle' ? BEACON.sheepish : BEACON.surprised;
      } else if (act === 'umbrella') {
        level = 0.8;
        tone = BEACON.determined;
      } else if (act === 'doze') {
        level = 0.2 + 0.15 * Math.sin(time * 0.8);
      } else if (moving && i < 5) {
        // Swimming: light streaming down the tentacles.
        level = 0.45 + 0.55 * bump(cycle(time * 1.4) - run, 0.25);
      } else if (this.hovered) tone = BEACON.happy;
      this.outfit.dot(i, level, tone);
    }
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    const time = env.time;
    this.lights(time);
    this.sq.update(dt, 0);
    // The bell squashes and widens as it clenches; the tentacles' roots pull in.
    const sq = clamp(this.sq.y, -0.35, 1.1);
    const fl = this.flare.y;
    p.stretch('bell', 1 - 0.2 * sq + 0.05 * fl, [0, 1, 0], 1 + 0.12 * sq + 0.06 * fl);
    for (let k = 0; k < TENTACLES; k++) {
      const a = turnAngle(k, TENTACLES);
      p.shift(`tent.${k}.1`, -Math.cos(a) * 0.014 * sq, 0, Math.sin(a) * 0.014 * sq);
    }
    // The beacon knob follows its mood.
    this.outfit.beacon(
      this.tone && this.lightT >= 0 ? this.tone : (BEACON[this.expression] ?? BEACON.neutral!),
    );
    if (this.lightT >= 0) {
      this.lightT += dt;
      if (this.lightT > 1.4) this.lightT = -1;
    }
    if (this.act === 'lightrun' || this.act === 'dance' || this.act === 'sparkle')
      this.outfit.beacon(RAINBOW[Math.floor(time * 6) % RAINBOW.length]);
    // Spinning (twirl, dizzy), about the vertical.
    if (this.act === 'dizzy') {
      const u = clamp((this.actT - 0.2) / 2.4, 0, 1);
      this.pivot.rotation.y = 4 * Math.PI * u * u * (3 - 2 * u);
    } else this.pivot.rotation.y = this.spin;
  }
}
