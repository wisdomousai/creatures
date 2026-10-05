import type { Object3D } from 'three';
import { type Act, type Character, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import { wobble } from './spring';
import { smooth, Toybot } from './toybot';

/**
 * Earl, a teapot butler robot: a round porcelain pot with a screen face on his belly and a
 * bow tie, a lid that hops when he steams, a spout that is one arm and a loop handle that
 * is the other, ending in a white glove that carries a tray with a cup and saucer, on two
 * little legs in spats.
 *
 * Perfectly mannered: he walks in small, upright, unhurried steps with the tray carried
 * level, and everything he does ends in a bow. His own trick is pouring tea for a crewmate:
 * he walks over, stands by them, holds out the tray, tips the spout over the cup (the tea
 * is a lit stream that fills it), the steam rises from the cup, and he bows. The lid
 * rattles and hops when the tea is hot, and now and then he lets off steam and whistles.
 *
 * Tricks: pouring tea for a crewmate, a bow, a curtsy, tipping his lid, letting off steam
 * with a whistle (the lid hops and the puffs shoot up), a hiccup of steam, wobbling the
 * tray and catching it, a dignified dance, a spin that sends steam out in a ring, waving
 * the spout, standing very straight, peering over the lip and a polite cough.
 */
export const TEAPOT_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.3, 0.45],
    [0.7, 0.45],
  ],
  rx: 0.085,
  ry: 0.22,
  line: 0.032,
  mouth: [0.5, 0.74],
};

const AMBER = '#ffb347';
const STEAM = '#ffffff';
const TONE = '#ffe8a8';

export class Teapot extends Toybot {
  static readonly terms =
    'tea porcelain china white blue cream pink bow tie lid spout handle glove tray cup saucer steam whistle pours polite waiter spats';

  private fx = {
    hop: 0, // metres
    spin: 0, // radians about the up axis
    steam: 0, // the lid's puffs, 0..1
    cup: 0, // the cup's steam, 0..1
    set: 0, // the guest's cup, set down under the spout, 0..1
    stream: 0, // the tea falling, 0..1 (its length)
    lid: 0, // how far the lid is up off the pot, metres
    still: false,
    hold: 0, // the tray held out in front, 0..1
    crouch: 0,
  };
  private mate: Character | null = null;
  private way = 1;
  private crouch = 0;
  private chase = -1;
  private steamPhase = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Earl',
        model: 'teapot',
        metres: 0.62,
        width: 0.7,
        size: 0.85,
        feels: {
          default: { f: 2.4, zeta: 0.6 },
          root: { f: 2.6, zeta: 0.7 },
          body: { f: 2.4, zeta: 0.5 },
          lid: { f: 3.4, zeta: 0.2 },
          spout: { f: 2.6, zeta: 0.4 },
          handle: { f: 2.8, zeta: 0.45 },
          'leg.L': { f: 3, zeta: 0.5 },
          'leg.R': { f: 3, zeta: 0.5 },
        },
        face: TEAPOT_FACE,
        eyes: 0.6,
        gaze: [{ bone: 'body', yaw: 0.35, pitch: 0.25 }],
        reach: { yaw: 50, pitch: 24 },
        lag: 1.2,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [60, 130],
        speed: 0.8,
      },
      model,
    );
    this.acts = this.moves();
  }

  // ---------- Posing helpers ----------

  /** The spout arm: up (+) or down (-), swung forward (+), degrees. */
  private spout(up: number, forward = 0) {
    this.puppet.add('spout', 0, -forward, up);
  }

  /** The tray arm: carried level at the side (0), or held out toward the front (1). */
  private tray(hold: number, lift = 0) {
    this.puppet.add('handle', -62 * hold - lift * 20, -30 * hold, 18 * hold - lift * 10);
  }

  /** A little polite nod or bow: the pot tips forward, the lid slides a touch. */
  private bowing(a: number) {
    const p = this.puppet;
    p.add('body', 34 * a);
    p.add('lid', 6 * a);
    this.tray(0.2 * a, 1);
    this.fx.crouch = Math.max(this.fx.crouch, 0.3 * a);
  }

  /** The crewmate nearest, on their feet on this floor: whom he serves. */
  private guest(): Character | null {
    const env = this.env;
    const f = env?.frame;
    if (!env || !f) return null;
    let best: Character | null = null;
    let bestD = Infinity;
    for (const o of env.crew) {
      if (o === this || o.state !== 'here' || o.free || o.edge !== this.edge || o.perched || o.role)
        continue;
      const d = this.spaceTo(o, f).n;
      if (d < bestD && d < 8) [best, bestD] = [o, d];
    }
    return best;
  }

  // ---------- Acts ----------

  private moves(): Record<string, Act> {
    const p = this.puppet;
    const ok = () => this.free_;
    return {
      idle: { weight: 3, length: [3, 6] },
      stroll: {
        weight: 3,
        length: [2.5, 4.5],
        when: ok,
        start: () =>
          this.stroll(Math.random() < 0.5 ? -1 : 1, this.heightPx * (1.5 + Math.random() * 2.2)),
      },
      pourTea: {
        weight: 2.4,
        length: [16, 16],
        face: 'happy',
        when: () => ok() && this.guest() !== null,
        start: () => {
          const o = this.guest();
          this.mate = o;
          this.chase = -1;
          const f = this.env?.frame;
          if (!o || !f) return;
          // On the viewer's left of the guest: his spout is on the right of the picture, so the
          // tea falls into a cup between the two of them.
          this.way = -1;
          this.walkTo(o.s - this.spaceTo(o, f).rx * 1.15, o.depth);
        },
        pose: (t) => {
          const o = this.mate;
          const f = this.env?.frame;
          if (!o || !f || o.state !== 'here' || o.free) return void this.setAct('idle');
          this.spec.steers = false;
          const since = this.since(t);
          if (since < 0) {
            // The guest moves on? Go after them, a few times, then give up.
            const beat = Math.floor(t * 1.2);
            if (beat !== this.chase && beat < 9) {
              this.chase = beat;
              this.walkTo(o.s - this.spaceTo(o, f).rx * 1.15, o.depth);
            }
            if (t > 9) this.setAct('idle');
            return;
          }
          if (this.spaceTo(o, f).n > 2.6) return void this.setAct('idle');
          // The guest's cup is set down under the spout, the pot tips (the tea falls straight
          // down into the cup), steam rises, and the tray is held out: "your tea".
          this.fx.set = smooth((since - 0.6) / 0.5) * smooth((8.4 - since) / 0.4);
          const pour = smooth((since - 1.4) / 0.9) * smooth((5.6 - since) / 0.7);
          p.add('body', 6 * pour, 0, -22 * pour);
          this.spout(-6 * pour);
          this.fx.stream = pour > 0.92 ? 1 : 0;
          this.fx.cup = smooth((since - 3) / 1.2) * smooth((8.2 - since) / 0.8);
          this.fx.hold = smooth((since - 5.8) / 0.7) * smooth((8.4 - since) / 0.7);
          this.expression = since > 5.8 ? 'love' : 'happy';
          const bow = smooth((since - 6.2) / 0.5) * smooth((7.9 - since) / 0.6);
          this.bowing(bow);
          if (since > 8.8) {
            this.mate = null;
            this.setAct('idle');
          }
        },
      },
      bow: {
        weight: 1.6,
        length: [3, 3],
        face: 'happy',
        when: ok,
        pose: (t) => this.bowing(smooth((t - 0.2) / 0.6) * smooth((2.8 - t) / 0.6)),
      },
      curtsy: {
        weight: 0.8,
        length: [3, 3],
        face: 'happy',
        when: ok,
        pose: (t) => {
          const k = smooth((t - 0.2) / 0.6) * smooth((2.8 - t) / 0.6);
          this.fx.crouch = Math.max(this.fx.crouch, k);
          p.add('body', 8 * k, 0, 6 * k);
          this.spout(-14 * k);
          this.tray(0.15 * k);
        },
      },
      tipLid: {
        weight: 1,
        length: [3, 3],
        face: 'wink',
        when: ok,
        pose: (t) => {
          // The lid lifts off a little, tips like a hat, and settles back.
          const k = smooth((t - 0.2) / 0.4) * smooth((2.6 - t) / 0.4);
          this.fx.lid = 0.05 * k;
          p.add('lid', 0, 0, 24 * k);
          p.add('body', 0, 0, -4 * k);
          p.add('body', 0, 6 * k);
        },
      },
      steamOff: {
        weight: 1.3,
        length: [4, 4],
        face: 'surprised',
        when: ok,
        pose: (t) => {
          // He lets off steam: the lid rattles and hops, the puffs shoot, and he whistles.
          const k = smooth(t / 0.4) * smooth((3.8 - t) / 0.4);
          this.fx.steam = k;
          this.fx.lid = 0.025 * Math.max(0, Math.sin(t * 22)) * k;
          p.add('lid', 0, 0, 10 * Math.sin(t * 23) * k);
          p.add('body', 0, 0, 2.5 * Math.sin(t * 31) * k);
          this.spout(14 * k + 6 * Math.sin(t * 13) * k);
          this.tray(0.3 * k, 1);
          if (this.face) this.face.talk = (0.6 + 0.4 * Math.sin(t * 16)) * k;
          this.fx.hop = 0.006 * Math.max(0, Math.sin(t * 22)) * k;
        },
      },
      hiccup: {
        weight: 0.8,
        length: [3, 3],
        when: ok,
        pose: (t) => {
          // A hiccup: the lid jumps with a puff, twice.
          const hits = [0.6, 1.5];
          let k = 0;
          for (const h of hits) k = Math.max(k, Math.max(0, 1 - Math.abs(t - h) * 5));
          this.fx.lid = 0.04 * k;
          this.fx.steam = k;
          p.add('body', -5 * k);
          this.expression = k > 0.2 ? 'surprised' : 'sheepish';
        },
      },
      wobbleTray: {
        weight: 0.9,
        length: [4, 4],
        when: ok,
        pose: (t) => {
          // The tray starts to slide: a wobble, a lunge, and he saves it. Phew.
          const k = smooth(t / 0.3) * smooth((3.8 - t) / 0.4);
          const w = Math.sin(t * 16) * Math.max(0, 1 - t / 2.2);
          this.fx.hold = 0.4 * k;
          p.add('handle', 14 * w, 0, 18 * w);
          p.add('body', 0, 0, 5 * w);
          this.expression = t < 2.3 ? 'surprised' : 'sheepish';
          if (t > 2.4) p.add('body', -5 * smooth((t - 2.4) / 0.3) * smooth((3.7 - t) / 0.4));
        },
      },
      dance: {
        weight: 1,
        length: [7, 8],
        face: 'happy',
        when: ok,
        pose: (t) => {
          const beat = sin(t, 1.1);
          const half = sin(t, 2.2);
          this.fx.still = true;
          p.add('body', 0, 0, 7 * beat);
          p.add('leg.L', 18 * Math.max(0, beat));
          p.add('leg.R', 18 * Math.max(0, -beat));
          this.spout(20 * half, 10);
          this.tray(0.2, 1);
          p.add('lid', 0, 0, 6 * -beat);
          this.fx.hop = 0.012 * Math.abs(half);
          this.fx.steam = 0.3;
        },
      },
      spin: {
        weight: 0.8,
        length: [3.2, 3.2],
        face: 'happy',
        when: ok,
        pose: (t) => {
          const u = smooth((t - 0.2) / 2.4);
          this.fx.spin = Math.PI * 4 * u;
          this.fx.steam = Math.sin(Math.PI * u);
          this.fx.still = true;
          this.spout(30 * Math.sin(Math.PI * u));
          p.add('handle', 0, 0, -20 * Math.sin(Math.PI * u));
          this.fx.hop = this.arc(t, 0.2, 2.4, 0.04);
        },
      },
      waveSpout: {
        weight: 1,
        length: [3.5, 4],
        face: 'happy',
        when: ok,
        pose: (t) => {
          const k = smooth(t / 0.4) * smooth((this.actLength - t) / 0.4);
          this.spout((26 + 16 * Math.sin(t * 6)) * k, 0);
          p.add('body', 0, 0, -4 * k);
        },
      },
      attention: {
        weight: 0.8,
        length: [4, 4],
        face: 'focused',
        when: ok,
        pose: (t) => {
          const k = smooth(t / 0.4) * smooth((this.actLength - t) / 0.5);
          p.add('body', -6 * k);
          p.add('lid', -5 * k);
          this.fx.hop = 0.004 * k;
          this.spout(10 * k);
          this.tray(0.1 * k);
          this.fx.crouch = -0.1 * k;
        },
      },
      cough: {
        weight: 0.7,
        length: [2.6, 2.6],
        when: ok,
        pose: (t) => {
          // A polite cough into the glove.
          const k = smooth((t - 0.2) / 0.3) * smooth((2.4 - t) / 0.3);
          const c = Math.max(0, Math.sin(t * 14)) * (t > 0.7 && t < 1.7 ? 1 : 0);
          this.tray(0.2 * k);
          p.add('body', 8 * c, 0, 0);
          this.fx.steam = c * 0.6;
          this.expression = 'sheepish';
        },
      },
      lip: {
        weight: 0.8,
        length: [7, 8],
        when: ok,
        start: () => this.walkTo(this.s, 0),
        pose: (t) => {
          if (this.walking) return;
          const k = smooth((t - 1) / 0.8) * smooth((this.actLength - t) / 0.6);
          p.add('body', 18 * k);
          p.add('lid', 0, 0, 10 * Math.sin(t * 1.2) * k);
          this.tray(0.3 * k, 1);
          this.expression = 'surprised';
        },
      },
      // Reactions (never picked at random).
      poked: {
        weight: 0,
        length: [1.8, 1.8],
        face: 'surprised',
        pose: (t) => {
          this.fx.hop = this.arc(t, 0, 0.45, 0.08);
          this.fx.lid = 0.04 * Math.max(0, 1 - t * 1.5);
          this.fx.steam = Math.max(0, 1 - t * 0.9);
          p.add('lid', 0, 0, 12 * Math.sin(t * 20) * Math.max(0, 1 - t));
          this.spout(18);
          if (t > 1) this.expression = 'sheepish';
        },
      },
      dizzy: {
        weight: 0,
        length: [3.2, 3.2],
        face: 'dizzy',
        pose: (t) => {
          const a = 2 * Math.PI * 1.1 * t;
          p.add('body', 6 * Math.cos(a), 0, 8 * Math.sin(a));
          p.add('lid', 0, 0, 14 * Math.sin(a + 1));
          this.spout(14 * Math.sin(a * 1.3));
          this.fx.spin = 2 * Math.PI * smooth(t / 2.6);
          this.fx.still = true;
          this.fx.steam = 1;
          this.fx.lid = 0.02 + 0.015 * Math.sin(t * 16);
        },
      },
    };
  }

  protected onDirect() {
    this.mate = null;
  }

  // ---------- Each frame ----------

  protected idle(t: number) {
    const p = this.puppet;
    Object.assign(this.fx, {
      hop: 0,
      spin: 0,
      steam: 0,
      cup: 0,
      set: 0,
      stream: 0,
      lid: 0,
      still: false,
      hold: 0,
      crouch: 0,
    });
    if (this.face) this.face.doodle = null;
    this.spec.steers = true;
    const breath = Math.sin(2 * Math.PI * 0.25 * t);
    p.add('body', 0.8 * breath);
    p.add('lid', 1.2 * breath, 0, 1.5 * wobble(t * 0.4, 3));
    this.spout(4 + 1.5 * breath);
    p.add('handle', 2 * breath, 0, 1);
    this.tray(0);
    // The pot ticks over: now and then a tiny puff from the lid.
    this.fx.steam = Math.max(0, wobble(t * 0.23, 9) - 0.55) * 0.9;
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    this.env = env;
    if (this.pleased) this.setAct(Math.random() < 0.6 ? 'bow' : 'tipLid');
    // Small upright steps, the tray carried level.
    const amt = clamp(this.stride / (this.heightPx * 0.7), 0, 1.2);
    if (amt > 0.02 && !this.fx.still) {
      const a = Math.sin(this.gait * 1.2);
      p.add('leg.L', -22 * a * amt);
      p.add('leg.R', 22 * a * amt);
      p.add('body', 0, 0, 3 * a * amt);
      p.add('lid', 0, 0, -3 * a * amt);
      p.add('handle', 4 * Math.abs(a) * amt);
      this.fx.hop = Math.max(this.fx.hop, 0.005 * Math.abs(Math.cos(this.gait * 1.2)) * amt);
      this.fx.steam = Math.max(this.fx.steam, 0.2 * amt);
    }
    // Tray held out in front (pouring, a bow).
    if (this.fx.hold > 0) this.tray(this.fx.hold);
    // Bowing and curtseying drop the legs a little.
    this.crouch += (this.fx.crouch - this.crouch) * (1 - Math.exp(-10 * dt));
    this.h = this.fx.hop * this.px;
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    p.shift('root', 0, -0.04 * this.crouch, 0);
    p.shift('lid', 0, this.fx.lid, 0);
    this.steamPhase += dt * 0.9;
    // The puffs: each rises, swells and fades in turn from the lid and the cup; the tea falls
    // from the spout in a thin stream as long as he pours.
    for (const i of [1, 2, 3]) {
      const ph = (this.steamPhase + i / 3) % 1;
      const rise = ph * 0.16;
      const size = Math.sin(Math.PI * ph) ** 0.7;
      const lid = Math.max(0.001, this.fx.steam * size);
      p.stretch(`lidsteam${i}`, lid, [0, 1, 0], lid);
      p.shift(`lidsteam${i}`, 0.012 * Math.sin(ph * 9 + i), rise, 0);
      const cup = Math.max(0.001, this.fx.cup * size * 0.8);
      p.stretch(`cupsteam${i}`, cup, [0, 1, 0], cup);
      p.shift(`cupsteam${i}`, 0.01 * Math.sin(ph * 8 + i * 2), rise * 0.8, 0);
    }
    const k = Math.max(this.fx.set, 0.001);
    p.stretch('cup2', k, [0, 1, 0], k);
    const s = Math.max(this.fx.stream, 0.001);
    p.stretch('stream', s, [0, 1, 0], this.fx.stream > 0.01 ? 1 : 0.001);
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
    // The knob glows warm; hotter (whiter) when he steams.
    this.outfit.beacon(mood === 'asleep' ? '#8a8a84' : this.fx.steam > 0.5 ? '#ff9a6a' : TONE);
    this.outfit.dot(3, 0.8, AMBER);
    this.outfit.dot(4, 0.9, STEAM);
    void time;
  }
}
