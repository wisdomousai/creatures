import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { Bird, ease, type Reaction, span } from './birds';
import { type Act, type Character, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import { Spring, wobble } from './spring';
import { DEG, fixed } from './toybot';

/**
 * Shutter, the robot camera: a boxy folding-camera body on two stubby legs, a bellows of five
 * pleats (bones of their own) running out to a big round lens barrel whose glass is his face,
 * a flash on top, and a slot below the bellows that a printed photo comes out of.
 *
 * The bellows is the whole personality: pushed out to zoom, pulled in to focus, squashed right
 * up to the body when he is shy. The lens follows the mouse like any eye, and a zoom stretches
 * the neck toward it without a step in its direction.
 *
 * His own trick is a portrait of a crewmate: he walks over, turns to face them, frames them with
 * his hands, pulls the bellows in to focus, the flash goes, a photo slides out of the slot and
 * flutters down to the floor, and he tidies it away. Otherwise the photo stays inside the body.
 */
export const CAMERABOT_FACE: FaceLayout = {
  width: 384,
  height: 384,
  eyes: [
    [0.3, 0.44],
    [0.7, 0.44],
  ],
  rx: 0.085,
  ry: 0.17,
  line: 0.04,
  mouth: [0.5, 0.76],
};

const PLEATS = 5;
/** Forward distance (m) of the body's face, each pleat and the lens barrel, at rest. */
const FACE_Y = 0.095;
const PLEAT_F = Array.from({ length: PLEATS }, (_, k) => 0.105 + 0.016 * k);
const HEAD_F = 0.226;
/** Thigh and shin length (m), and the height of the hips above the floor. */
const L1 = 0.083;
const L2 = 0.06;
const HIP_H = 0.19;
const ANKLE_H = 0.048;
const CARD_DROP = 0.2;

const TAUBEAT = Math.PI * 2 * 1.1;
const sm = (x: number) => {
  const u = clamp(x, 0, 1);
  return u * u * (3 - 2 * u);
};

type Pair = [number, number];

export class Camerabot extends Bird {
  private extS = new Spring(4, 0.55, 1.1, 1);
  private dropS = new Spring(5, 0.6, 1, 0);
  private hopS = new Spring(6, 0.5, 1, 0);
  private walkK = new Spring(5, 1, 1, 0);
  // Per-frame requests from the acts, cleared in idle().
  private ext = 1;
  private drop = 0;
  private hop = 0;
  private spinTo = 0;
  private facing = 0;
  private armP: Pair = [0, 0];
  private armY: Pair = [0, 0];
  private armR: Pair = [0, 0];
  private foreP: Pair = [0, 0];
  private foreY: Pair = [0, 0];
  private foreR: Pair = [0, 0];
  private headTilt: [number, number, number] = [0, 0, 0];
  private flash = 0;
  private pop = 0;
  /** The photo: how far out of the slot (0..1), how far fallen (0..1), and its size. */
  private card = { out: 0, fall: 0, size: 1, flutter: 0 };
  private shuffle = 0;
  private subject: Character | null = null;
  private shotAt = -1;

  constructor(model: Object3D) {
    super(
      {
        name: 'Shutter',
        model: 'camerabot',
        metres: 0.5,
        width: 0.46,
        size: 1.0,
        feels: {
          default: { f: 4, zeta: 0.6 },
          root: { f: 4, zeta: 0.5 },
          body: { f: 6, zeta: 0.55 },
          head: { f: 5, zeta: 0.4, r: 0.7 },
          strobe: { f: 8, zeta: 0.5 },
          'leg.L': { f: 9, zeta: 0.7 },
          'leg.R': { f: 9, zeta: 0.7 },
          'foot.L': { f: 10, zeta: 0.7 },
          'foot.R': { f: 10, zeta: 0.7 },
          'upper_arm.L': { f: 6, zeta: 0.4 },
          'upper_arm.R': { f: 6, zeta: 0.4 },
          'forearm.L': { f: 7, zeta: 0.3 },
          'forearm.R': { f: 7, zeta: 0.3 },
          'hand.L': { f: 8, zeta: 0.3 },
          'hand.R': { f: 8, zeta: 0.3 },
        },
        face: CAMERABOT_FACE,
        eyes: 0.6,
        gaze: [{ bone: 'head', yaw: 0.9, pitch: 0.8 }],
        reach: { yaw: 55, pitch: 28 },
        lag: 1.6,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 0.65,
        turn: 70,
      },
      model,
    );
    this.acts = { ...this.moves(), ...this.reactions() };
  }

  /** Where a crewmate is along the floor: a flier in free flight has its own place in the air. */
  private at(o: Character) {
    return o.free?.x ?? o.s;
  }

  /** Everyone else on his floor, near to far, whether on it or flying over it. */
  private subjects() {
    return (this.env?.crew ?? [])
      .filter((o) => o !== this && o.state === 'here' && o.edge === this.edge)
      .sort((a, b) => Math.abs(this.at(a) - this.s) - Math.abs(this.at(b) - this.s))
      .filter((o) => Math.abs(this.at(o) - this.s) < this.heightPx * 14);
  }

  /** Raise both hands in a frame in front of the lens, as for a portrait. */
  private frame(k: number) {
    this.armP = [-84 * k, -78 * k];
    this.armY = [-34 * k, 32 * k];
    this.armR = [4 * k, -4 * k];
    this.foreP = [-52 * k, -60 * k];
    this.foreY = [-20 * k, 24 * k];
  }

  private moves(): Record<string, Act> {
    const still = () => this.still() && this.state === 'here';
    return {
      idle: { weight: 3, length: [3, 6] },
      stroll: {
        weight: 2.4,
        length: [3, 5],
        when: this.still,
        start: () => this.amble(1.2 + Math.random() * 1.6),
      },
      photograph: {
        weight: 2.2,
        length: [13, 13],
        when: still,
        start: () => {
          // Anyone on his floor will do, a flier like Bolt included (they are `free` and the
          // floor-bound mates() leaves them out), and when nobody is about he shoots the reader.
          const m = this.subjects().find((o) => !o.role) ?? this.subjects()[0] ?? null;
          this.subject = m;
          this.shotAt = -1;
          if (m) {
            const dir = Math.sign(this.at(m) - this.s) || 1;
            this.walkTo(this.at(m) - dir * this.heightPx * 1.5, m.depth);
          }
        },
        pose: (t) => {
          // (If the subject has gone by now, he finishes the shot at the reader.)
          const m = this.subject && this.subjects().includes(this.subject) ? this.subject : null;
          if (this.shotAt < 0) {
            if (!this.walking && t > 0.4) {
              this.shotAt = t;
              this.actLength = t + 8.2;
            } else if (t > 10) this.actLength = t + 0.1;
            else return;
          }
          const u = t - this.shotAt;
          const dir = m ? Math.sign(this.at(m) - this.s) || 1 : 0;
          this.facing = dir * 80 * ease(u, 0, 0.7) * (1 - ease(u, 7.2, 8));
          // 0-1: hands up in a frame.  1-2.2: neck out to find them.  2.2-3: in to focus.
          // 3.2: flash.  3.6-4.8: the photo slides out.  5-6.2: it flutters down.  7: tidied away.
          this.frame(ease(u, 0.2, 1) * (1 - ease(u, 5, 5.8)));
          this.ext = 1 + 0.9 * ease(u, 1, 2.2) - 1.35 * ease(u, 2.2, 3) + 0.45 * ease(u, 3.5, 4);
          this.headTilt = [0, 0, 5 * ease(u, 0.6, 1.2) * (1 - ease(u, 5, 5.8))];
          this.drop = 0.012 * ease(u, 0.4, 1) * (1 - ease(u, 5, 5.8));
          const f = u - 3.2;
          this.flash = f > 0 && f < 0.45 ? 1 - f / 0.45 : 0;
          this.pop = ease(u, 2.4, 3) * (1 - ease(u, 4.6, 5.4));
          this.card.out = ease(u, 3.6, 4.8) * (1 - ease(u, 5, 5.01));
          this.card.fall = ease(u, 5, 6.3);
          this.card.flutter = ease(u, 5, 5.2) * (1 - ease(u, 6.2, 6.4));
          this.card.size = u > 6.6 ? 1 - ease(u, 6.6, 7.2) : 1;
          if (u < 3.2) this.expression = 'focused';
          else if (u < 3.8) this.expression = 'surprised';
          else this.expression = 'happy';
          // After the shot, he looks down at the photo on the floor.
          const look = ease(u, 5.2, 5.9) * (1 - ease(u, 6.9, 7.4));
          this.headTilt[0] += 24 * look;
          if (u > 3.2 && u < 3.3) this.extS.kick(-6);
        },
      },
      zoom: {
        weight: 1.5,
        length: [5, 6],
        when: still,
        face: 'focused',
        pose: (t) => {
          // Pushes the lens out toward the mouse, in and out, hunting for focus. No step.
          const k = span(t, 0.3, 1, this.actLength - 1.2, this.actLength - 0.3);
          this.ext = 1 + (0.9 + 0.35 * sin(t, 0.9)) * k;
          this.armP = [-20 * k, -20 * k];
          this.drop = 0.01 * k;
          this.headTilt = [0, 0, 0];
        },
      },
      selfie: {
        weight: 1.3,
        length: [8, 8],
        when: still,
        face: 'wink',
        pose: (t) => {
          // A pose for the reader: one arm out holding the shot, a peace sign, a tilted lens.
          const k = span(t, 0.4, 1.2, 6.4, 7.4);
          this.armP = [-100 * k, -118 * k];
          this.armY = [-40 * k, 14 * k];
          this.armR = [0, 0];
          this.foreP = [-70 * k, -26 * k];
          this.foreY = [-34 * k, 0];
          this.headTilt = [-4 * k, 0, 14 * k + 3 * k * sin(t, 1)];
          this.ext = 1 - 0.35 * k;
          this.drop = 0.012 * k * sin(t, 0.7);
          const f = t - 3.6;
          this.flash = f > 0 && f < 0.45 ? 1 - f / 0.45 : 0;
          this.pop = ease(t, 2.6, 3.2) * (1 - ease(t, 5, 5.6));
          if (t > 3.6 && t < 3.7) this.extS.kick(-5);
          this.card.out = 0.6 * ease(t, 4.2, 5) * (1 - ease(t, 6.2, 6.9));
          this.card.size = 1;
          if (t > 3.6) this.expression = 'happy';
        },
      },
      ready: {
        weight: 0.9,
        length: [4, 4],
        when: still,
        face: 'happy',
        pose: (t) => {
          // Tests the flash, twice: up it pops, off it goes, down it goes.
          this.pop = ease(t, 0.2, 0.6) * (1 - ease(t, 2.6, 3.1));
          const f = (t - 1) % 1;
          this.flash = t > 1 && t < 3 ? Math.max(0, 1 - f / 0.4) : 0;
          this.headTilt = [0, 0, 5 * Math.sin(t * 1.5) * this.pop];
          this.ext = 1 + 0.12 * this.flash;
        },
      },
      focus: {
        weight: 1.1,
        length: [6, 7],
        when: still,
        face: 'focused',
        pose: (t) => {
          // Racking the lens in and out, the neck breathing, head cocked at nothing in particular.
          const k = span(t, 0.3, 0.8, this.actLength - 0.8, this.actLength - 0.2);
          this.ext = 1 + 0.7 * k * sin(t, 0.6);
          this.headTilt = [-4 * k, 28 * k * sin(t, 0.18), 6 * k * sin(t, 0.18, 0.25)];
        },
      },
      wave: {
        weight: 1.3,
        length: [3.8, 4.6],
        when: still,
        face: 'happy',
        pose: (t) => {
          const k = span(t, 0.2, 0.7, this.actLength - 0.7, this.actLength - 0.1);
          this.armP = [-140 * k, 0];
          this.foreR = [28 * k * sin(t, 2.4), 0];
          this.armR = [10 * k, 0];
          this.headTilt = [0, 0, 8 * k];
        },
      },
      bow: {
        weight: 0.9,
        length: [3.6, 3.6],
        when: still,
        face: 'happy',
        pose: (t) => {
          const k = ease(t, 0.3, 1) * (1 - ease(t, 2, 2.9));
          this.headTilt = [14 * k, 0, 0];
          this.ext = 1 - 0.3 * k;
          this.armP = [-18 * k, -18 * k];
          this.drop = 0.022 * k;
        },
      },
      boogie: {
        weight: 1.2,
        length: [7, 8],
        when: still,
        face: 'happy',
        pose: (t) => {
          // Bounces on the beat, bellows pumping in time, the flash popping on every fourth.
          const k = this.fade(t, 0.6);
          const beat = (t * 2.2) % 1;
          const bar = Math.floor(t * 2.2);
          this.drop = 0.03 * k * (beat < 0.35 ? sm(beat / 0.35) : 1 - sm((beat - 0.35) / 0.3));
          this.hop =
            beat > 0.4 && beat < 0.9 ? 0.05 * k * Math.sin(Math.PI * ((beat - 0.4) / 0.5)) : 0;
          this.ext = 1 + 0.35 * k * Math.cos(TAUBEAT * t);
          this.armP = [
            (-70 + 40 * Math.sin(TAUBEAT * t)) * k,
            (-70 - 40 * Math.sin(TAUBEAT * t)) * k,
          ];
          this.headTilt = [0, 0, 8 * k * Math.sin(TAUBEAT * t * 0.5)];
          this.flash = bar % 4 === 3 && beat < 0.3 ? 1 - beat / 0.3 : 0;
        },
      },
      shy: {
        weight: 0.9,
        length: [5, 5],
        when: still,
        face: 'sheepish',
        pose: (t) => {
          // Pulls the lens right in against his body, hands over where his eyes were.
          const k = span(t, 0.2, 0.8, 3.8, 4.5);
          this.ext = 1 - 0.88 * k;
          this.armP = [-72 * k, -72 * k];
          this.armY = [-48 * k, 48 * k];
          this.foreP = [-60 * k, -60 * k];
          this.foreY = [-40 * k, 40 * k];
          this.headTilt = [6 * k, 0, 0];
          this.drop = 0.015 * k;
        },
      },
      pano: {
        weight: 1,
        length: [6.4, 6.4],
        when: still,
        face: 'focused',
        pose: (t) => {
          // A panorama: a slow turn right round on the spot, neck out, shuffling his feet.
          const k = span(t, 0.2, 0.9, 5.2, 6);
          this.spinTo = 360 * sm((t - 0.3) / 5.6);
          this.ext = 1 + 0.45 * k;
          this.shuffle = k;
          this.armP = [-30 * k, -30 * k];
        },
      },
      macro: {
        weight: 1,
        length: [6, 6],
        when: still,
        face: 'focused',
        pose: (t) => {
          // Crouches and pushes the lens right down close to the floor to see something small.
          const k = span(t, 0.4, 1.3, 4.6, 5.5);
          this.drop = 0.032 * k;
          this.ext = 1 + 1.1 * k;
          this.headTilt = [30 * k, 12 * k * sin(t, 0.4), 0];
          this.armP = [-28 * k, -28 * k];
          if (t > 4.9) this.expression = 'happy';
        },
      },
      nap: {
        weight: 0.8,
        length: [9, 12],
        when: still,
        pose: (t) => {
          const k = span(t, 1, 2.4, this.actLength - 2, this.actLength - 0.6);
          this.ext = 1 - 0.7 * k;
          this.drop = 0.02 * k;
          this.headTilt = [16 * k, 0, 4 * k];
          this.expression = k > 0.4 ? 'asleep' : 'sleepy';
        },
      },
    };
  }

  protected react(kind: Reaction, t: number) {
    if (kind === 'poked') {
      // Startled: the neck shoots out, the flash goes off, up on tiptoe.
      const k = ease(t, 0, 0.08) * (1 - ease(t, 0.3, 1));
      this.ext = 1 + 0.9 * k;
      this.flash = t < 0.35 ? 1 - t / 0.35 : 0;
      this.hop = 0.1 * ease(t, 0, 0.1) * (1 - ease(t, 0.12, 0.45));
      this.armP = [-120 * k, -120 * k];
      this.pop = ease(t, 0, 0.1) * (1 - ease(t, 0.5, 1.1));
    } else if (kind === 'dizzy') {
      const k = 1 - ease(t, 2.6, 3.6);
      this.spinTo = 360 * sm(t / 2.6);
      this.shuffle = k * ease(t, 0, 0.3);
      this.ext = 1 + 0.6 * k * Math.sin(t * 6);
      this.headTilt = [8 * k * Math.cos(t * 5), 0, 18 * k * Math.sin(t * 5)];
      this.armP = [-40 * k * Math.sin(t * 5), 40 * k * Math.sin(t * 5)];
      this.flash = Math.sin(t * 9) > 0.92 ? 1 : 0;
    } else {
      const k = this.fade(t, 0.5);
      this.ext = 1 + 0.3 * k * Math.sin(t * 2.4);
      this.armP = [-60 * k, -60 * k];
      this.headTilt = [-4 * k, 0, 8 * k * sin(t, 0.7)];
      this.pop = k;
      this.flash = k > 0.8 && Math.sin(t * 5) > 0.95 ? 1 : 0;
    }
  }

  // ---------- Posing ----------

  protected idle(t: number) {
    this.ext = 1;
    this.drop = 0;
    this.hop = 0;
    this.spinTo = 0;
    this.facing = 0;
    this.armP = [0, 0];
    this.armY = [0, 0];
    this.armR = [0, 0];
    this.foreP = [0, 0];
    this.foreY = [0, 0];
    this.foreR = [0, 0];
    this.headTilt = [0, 0, 0];
    this.flash = 0;
    this.pop = 0;
    this.shuffle = 0;
    this.card.out = 0;
    this.card.fall = 0;
    this.card.size = 1;
    this.card.flutter = 0;
    this.expression = this.hovered ? 'happy' : 'neutral';
    this.puppet.add(
      'head',
      1.5 * wobble(t * 0.4, 5),
      3 * wobble(t * 0.25, 3),
      2 * wobble(t * 0.3, 2),
    );
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    this.env = env;
    this.enjoy(dt, this.still());
    fixed(dt, (h) => {
      this.extS.update(h, this.ext);
      this.dropS.update(h, this.drop);
      this.hopS.update(h, this.hop);
      this.walkK.update(h, this.stride > 1 ? 1 : 0);
    });
    p.add('root', 0, this.facing, 0);
    // Arms.
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 'L' : 'R';
      const sg = i === 0 ? 1 : -1;
      const swing = 22 * this.walkK.y * Math.sin(this.gait * Math.PI + i * Math.PI);
      p.add(
        `upper_arm.${s}`,
        this.armP[i] + swing,
        this.armY[i],
        sg * (this.armR[i] + 6 + 6 * this.walkK.y),
      );
      p.add(`forearm.${s}`, this.foreP[i], this.foreY[i], sg * 6 + this.foreR[i]);
    }
    p.add('head', this.headTilt[0], this.headTilt[1], this.headTilt[2]);
    p.add('strobe', -8 * this.flash, 0, 0);
    // Legs: a crouch from the body dropping, a step from the gait.
    const dy = clamp(this.dropS.y, -0.02, 0.05);
    const d = Math.min(HIP_H - ANKLE_H - dy, L1 + L2 - 0.0005);
    const a = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1)) * DEG;
    const b = Math.asin(clamp((L1 * Math.sin(a / DEG)) / L2, -1, 1)) * DEG;
    const crouch = a > 0.5 ? a : 0;
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 'L' : 'R';
      const ang = this.gait * Math.PI + i * Math.PI;
      const step = this.walkK.y * -24 * Math.sin(ang);
      const shin = this.walkK.y * 24 * Math.max(0, Math.cos(ang));
      const shuf = this.shuffle * Math.max(0, Math.sin(this.spinTo / 22 + i * Math.PI));
      p.add(`leg.${s}`, -crouch + step - 14 * shuf, 0, 0);
      p.add(`foot.${s}`, (crouch ? a + b : 0) + shin + 24 * shuf, 0, 0);
    }
    this.h = this.hopS.y * this.px;
  }

  protected after(_dt: number, env: Env) {
    const p = this.puppet;
    const t = env.time;
    const ext = clamp(this.extS.y, 0.08, 2.4);
    // The bellows: the pleats spaced out between the body's face and the lens.
    for (let k = 0; k < PLEATS; k++) {
      const f = FACE_Y + (PLEAT_F[k] - FACE_Y) * ext;
      p.shift(`bell.${k}`, 0, 0, f - PLEAT_F[k]);
      p.stretch(`bell.${k}`, clamp(ext * 1.2, 0.35, 1), [0, 0, 1], 1);
    }
    p.shift('head', 0, 0, FACE_Y + (HEAD_F - FACE_Y) * ext - HEAD_F);
    // Crouching and walking: the body sinks, bobs.
    const bob = 0.006 * this.walkK.y * Math.abs(Math.sin(this.gait * Math.PI));
    p.shift('body', 0, -this.dropS.y + bob, 0);
    p.shift('strobe', 0, 0.02 * this.pop, 0);
    // The photo: out of the slot, then down.
    const c = this.card;
    const outZ = 0.094 * c.out;
    const fallY = -CARD_DROP * sm(c.fall) + 0.006 * Math.sin(t * 17) * c.flutter;
    const sway = 0.03 * c.flutter * Math.sin(t * 7) * (1 - c.fall * 0.5);
    p.shift('photo', sway, fallY, outZ + 0.03 * sm(c.fall));
    p.turn('photo', 25 * c.flutter * Math.sin(t * 8), 0, 40 * c.flutter * Math.sin(t * 6 + 1));
    const small = clamp(c.size, 0.001, 1);
    p.stretch('photo', small, [0, 1, 0], small);
    this.pivot.rotation.y = this.spinTo / DEG;
    // Flash and lamp.
    this.outfit.beacon(
      this.flash > 0.05
        ? '#ffffff'
        : this.act === 'dizzy' || this.act === 'boogie'
          ? RAINBOW[Math.floor(t * 6) % RAINBOW.length]
          : (BEACON[this.expression] ?? '#f4f4f1'),
    );
  }
}
