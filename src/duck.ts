import { type Material, type Mesh, type Object3D, Quaternion, Vector3 } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Act, Character, clamp, type Env } from './character';
import type { Expression, FaceLayout } from './face';
import { type Tile, withDetail } from './detail';
import type { FlameStyle, LookName } from './looks';
import { sin } from './moves';
import { Spring } from './spring';

/**
 * Rivet, the wind-up robot duck: a tin toy with rivets along his seams, a bill on
 * hinge pins, wings of layered feather plates, a fan of tail plates, webbed feet and a
 * key on his back that turns while he goes. What drives him is the spring: a chest lamp
 * shows his mood and three little lights under it show how wound he is. Walking uses it
 * up, and now and then he winds down for real: slowing, key turning slower and slower,
 * head sinking, until he stops with a last clunk; he waits (a poke winds him at once),
 * then reaches round and winds himself up again, the lights filling one by one, and
 * comes back to life with a hop and a quack.
 *
 * A duck says how he feels with his wings and his tail tuft: a waggle of the tail when
 * he's pleased, wings out and flapping when he's excited or startled, a bobbing head
 * when something has caught his eye, wings folded and head sunk when he's sleepy.
 * Around that he waddles and marches, follows a crewmate in a line or goes to say hello
 * to one, dabbles at the front lip, peers over the back wall, hunts crumbs, stamps in an
 * imaginary puddle, belly-slides, tips over and wobbles back up, preens, flaps, quacks,
 * sneezes, hiccups, shakes his tail or himself dry, spins, stretches his wings, looks
 * about, bobs his head, sends sparks (lights) from his key, sits with his feet tucked
 * and naps. The wing feathers and tail plates ride on their own bones; nothing else is
 * hidden inside him.
 */
export const DUCK_FACE: FaceLayout = {
  width: 512,
  height: 224,
  eyes: [
    [0.3, 0.5],
    [0.7, 0.5],
  ],
  rx: 0.07,
  ry: 0.3,
  line: 0.035,
  mouth: null,
};

type Mood = 'calm' | 'curious' | 'happy' | 'alarmed' | 'sleepy';
type Posture = 'stand' | 'sit' | 'lie';

const WINGS = [
  ['wing.L', 1],
  ['wing.R', -1],
] as const;
const UP = new Vector3(0, 1, 0);
const q = new Quaternion();

const ease = (t: number, a: number, b: number) => {
  const u = clamp((t - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
};
/** Fades in over a..b, holds, and fades out over c..d. */
const span = (t: number, a: number, b: number, c: number, d: number) =>
  ease(t, a, b) * (1 - ease(t, c, d));
/** A bump from 0 up to 1 and back over `length` seconds, starting at `at`. */
const pulse = (t: number, at: number, length: number) =>
  t > at && t < at + length ? Math.sin(((t - at) / length) * Math.PI) : 0;

/** A fine printed-tin halftone: a diagonal grid of tiny soft dots with a faint brushed sheen. */
const TIN: Tile = {
  name: 'tin',
  scale: 14,
  amount: 0.5,
  draw: (g, size, rand) => {
    for (let y = 0; y < size; y += 8)
      for (let x = 0; x < size; x += 8) {
        const o = (y / 8) % 2 ? 4 : 0;
        g.fillStyle = 'rgba(255,255,255,0.22)';
        g.beginPath();
        g.arc(x + o, y, 1.6, 0, Math.PI * 2);
        g.fill();
      }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';
      g.fillRect(0, rand() * size, size, 1 + rand() * 2);
    }
  },
};

export class Duck extends Character {
  mood: Mood = 'calm';
  private env: Env | null = null;
  private posture: Posture = 'stand';
  private crouch = new Spring(2.2, 0.7);
  private lieS = new Spring(3, 0.6, 1.1);
  private hop = new Spring(2.8, 0.3);
  private key = 0;
  private keySpeed = 0;
  private waggleAt = -10;
  private nextWaggle = 4;
  private pokes: number[] = [];
  private hops = 0;
  private turn = new Spring(0.8, 0.8);
  private hadRole = false;
  private dir = 1;
  private did = 0;
  private slid = false;
  private stage = 0;
  private lastStep = -1;
  private jerks = 0;
  /** How wound the spring is, 0..1; the gauge lights show it. */
  private wound = 0.85;
  private windBase = 0;
  private actSpeed = 1.1;
  private actTurn = 80;
  private actExpr: Expression | null = null;
  // Per-frame requests from acts, cleared in idle().
  private lieReq = 0;
  private lift = 0;
  private open = 0;
  private flap = 0;
  private spin = 0;
  private shake = 0;
  private shiver = 0;
  private march = 0;
  private keyReq = -1;
  private glow = 0;
  private sparks = 0;
  private bounce = 0;
  private sway = 0;
  private keyShown = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Rivet',
        model: 'duck',
        metres: 0.56,
        width: 0.55,
        size: 0.95,
        feels: {
          default: { f: 2, zeta: 0.6 },
          body: { f: 3.2, zeta: 0.32 },
          head: { f: 2.4, zeta: 0.5, r: 0.3 },
          jaw: { f: 8, zeta: 0.5 },
          tail: { f: 6, zeta: 0.35 },
          'wing.L': { f: 5, zeta: 0.4 },
          'wing.R': { f: 5, zeta: 0.4 },
          'leg.L': { f: 5, zeta: 0.6 },
          'leg.R': { f: 5, zeta: 0.6 },
        },
        face: DUCK_FACE,
        eyes: 0.8,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.8 },
          { bone: 'body', yaw: 0.2, pitch: 0 },
        ],
        reach: { yaw: 60, pitch: 30 },
        lag: 0.9,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [50, 110],
        speed: 1.1,
        roam: true,
      },
      model,
    );
    this.acts = {
      ...this.walks(),
      ...this.floorTricks(),
      ...this.fidgets(),
      ...this.springs(),
      ...this.social(),
      ...this.rests(),
      ...this.reactions(),
    };
  }

  /** Colour look only: printed tin on the shell, rubber feet, grain on the dark joints. */
  dress(look: LookName, flame?: FlameStyle) {
    super.dress(look, flame);
    if (look !== 'colour') return;
    const planes = this.outfit.materials[0]?.clippingPlanes ?? null;
    const own = new Map<string, Material>();
    this.model.traverse((obj) => {
      const mesh = obj as Mesh;
      const role: string | undefined = mesh.userData.role;
      if (!mesh.isMesh || !role || mesh.userData.outline) return;
      const kind = /^Joint_Foot/.test(role)
        ? 'rubber'
        : /^Shell(_Print)?$/.test(role)
          ? TIN
          : /^Joint(_Bill)?$/.test(role)
            ? 'grain'
            : null;
      if (!kind) return;
      const key = `${role}/${typeof kind === 'string' ? kind : kind.name}`;
      let material = own.get(key);
      if (!material) {
        material = withDetail(mesh.material as Material, kind);
        material.clippingPlanes = planes;
        own.set(key, material);
        this.outfit.materials.push(material);
      }
      mesh.material = material;
    });
  }

  // ---------- Who and where ----------

  private mates() {
    return (this.env?.crew ?? [])
      .filter((o) => o !== this && o.state === 'here' && o.edge === this.edge && !o.free)
      .sort((a, b) => Math.abs(a.s - this.s) - Math.abs(b.s - this.s))
      .filter((o) => Math.abs(o.s - this.s) < this.heightPx * 12);
  }

  private still = () =>
    !this.walking && !this.door && !this.free && this.edge === 'bottom' && this.posture === 'stand';

  private room(): [number, number] {
    if (!this.env) return [1, 0];
    const [lo, hi] = this.span(this.env.frame);
    const way = this.s - lo > hi - this.s ? -1 : 1;
    return [way, (way > 0 ? hi - this.s : this.s - lo) - this.widthPx() * 1.2];
  }

  /** Walk `heights` of his own height along the floor, mostly the way with more room. */
  private amble(heights: number, depth?: number, way?: number) {
    const [more, room] = this.room();
    const w = way ?? (Math.random() < 0.7 ? more : -more);
    const far = Math.min(Math.max(room, 0), this.heightPx * heights);
    this.walkTo(this.s + w * Math.max(far, this.heightPx * 0.6), depth);
  }

  /** 0..1 over an act: eases in and out at its ends. */
  private fade(t: number, e = 0.5) {
    return ease(t, 0, e) * (1 - ease(t, this.actLength - e, this.actLength));
  }

  private toward(m: Character) {
    return Math.sign(m.s - this.s) || 1;
  }

  // ---------- Walking about ----------

  private walks(): Record<string, Act> {
    return {
      idle: { weight: 3, length: [3, 6] },
      stroll: {
        weight: 2,
        length: [3, 5],
        when: this.still,
        start: () => this.amble(1.5 + Math.random() * 2),
      },
      march: {
        weight: 1,
        length: [4, 6],
        face: 'focused',
        when: this.still,
        start: () => this.amble(3 + Math.random() * 2),
        pose: () => {
          // Chin up, knees high, wings tucked back: a tiny tin soldier.
          this.march = 1;
          this.actSpeed = 1.0;
          this.puppet.add('head', -8);
          for (const [w] of WINGS) this.puppet.add(w, 25);
        },
      },
      circle: {
        weight: 0.9,
        length: [11, 13],
        face: 'happy',
        when: this.still,
        start: () => {
          this.stage = 0;
          this.dir = Math.random() < 0.5 ? -1 : 1;
          this.did = this.s;
        },
        pose: (t) => {
          // A lap round the box: along the front, back into it, along the back, out again.
          const H = this.heightPx;
          const at = [
            [this.did + this.dir * 2.2 * H, 0.2],
            [this.did + this.dir * 2.2 * H, 0.85],
            [this.did, 0.85],
            [this.did, 0.2],
          ];
          if (this.stage < 4 && !this.walking && t > 0.3 + this.stage * 0.2) {
            const [x, d] = at[this.stage++];
            this.walkTo(x, d);
          }
          this.march = 0.6;
          this.actSpeed = 1.2;
        },
      },
      peekBack: {
        weight: 0.9,
        length: [10, 12],
        when: this.still,
        start: () => {
          this.did = 0;
          this.amble(2, 0.95, Math.random() < 0.5 ? -1 : 1);
        },
        pose: (t) => {
          // To the back wall, up on his toes, looking round for a way out.
          const at = this.depth > 0.85 && !this.walking;
          if (at && !this.did) this.did = t;
          const look = at ? span(t - this.did, 0, 0.5, 4.5, 5) : 0;
          this.puppet.add('head', -8 * look, 0, 20 * look * sin(t, 0.35));
          this.puppet.add('body', -4 * look);
          if (this.did && t - this.did > 5 && this.depth > 0.5) this.walkTo(this.s, 0.2);
          this.actExpr = look > 0.3 ? 'focused' : null;
        },
      },
      dabble: {
        weight: 1.2,
        length: [9, 11],
        when: this.still,
        start: () => {
          this.did = 0;
          this.amble(1.5, 0);
        },
        pose: (t) => {
          // Down at the front lip, tail in the air, bill dipping and nibbling as if it
          // were the edge of a pond.
          const at = this.depth < 0.05 && !this.walking;
          if (at && !this.did) this.did = t;
          const s = at ? t - this.did : -1;
          const k = s < 0 ? 0 : span(s, 0, 0.6, 5.6, 6.2);
          const dip = Math.max(0, sin(s, 0.9)) ** 2;
          this.puppet.add('body', 22 * k);
          this.puppet.add('head', (8 + 14 * dip) * k);
          this.puppet.add('jaw', 14 * Math.max(0, sin(s, 4)) * dip * k);
          this.puppet.add('tail', 0, 0, 10 * Math.sin(s * 9) * k * dip);
          this.puppet.add('leg.L', -6 * k);
          this.puppet.add('leg.R', -6 * k);
          if (this.did && t - this.did > 6.2) this.walkTo(this.s, 0.25);
          this.actExpr = k > 0.3 ? 'happy' : null;
        },
      },
      crumbs: {
        weight: 1.2,
        length: [7, 9],
        when: this.still,
        start: () => {
          this.stage = 0;
          this.amble(1.8);
        },
        pose: (t) => {
          // Head down, pecking along: a step, a peck, a step, a peck; then a pleased hop.
          const p = this.puppet;
          this.actSpeed = 0.5;
          const k = this.fade(t, 0.4);
          const peck = Math.max(0, sin(t, 1.5)) ** 3;
          p.add('body', 18 * k);
          p.add('head', 40 * peck * k, 0, 0);
          p.add('jaw', 10 * peck);
          p.add('tail', 0, 0, 8 * Math.sin(t * 7) * k);
          if (t > this.actLength - 1.6 && this.stage === 0) {
            this.stage = 1;
            this.hop.kick(1.2);
          }
          this.actExpr = t > this.actLength - 1.6 ? 'love' : 'focused';
        },
      },
    };
  }

  // ---------- On the floor ----------

  private floorTricks(): Record<string, Act> {
    return {
      stamp: {
        weight: 1.1,
        length: [4, 5],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // Stamping in a puddle: feet coming up and slapping down, wings out for
          // balance, a splash of light at each slap.
          const p = this.puppet;
          const k = this.fade(t, 0.4);
          const s = Math.sin(2 * Math.PI * 2.2 * t);
          p.add('leg.L', -48 * Math.max(0, s) * k);
          p.add('leg.R', -48 * Math.max(0, -s) * k);
          p.add('body', 0, 0, 6 * s * k);
          p.add('head', 0, 0, -5 * s * k);
          this.open = 0.4 * k;
          this.lift = 0.02 * k * Math.abs(s);
          this.glow = k * Math.max(0, Math.cos(2 * Math.PI * 2.2 * t)) ** 4;
          p.add('jaw', 12 * pulse(t % 0.9, 0, 0.2) * k);
        },
      },
      slide: {
        weight: 1.1,
        length: [6, 8],
        face: 'happy',
        when: this.still,
        start: () => (this.slid = false),
        pose: (t) => {
          // Belly slide: a run-up, then flat out on his belly, wings back, gliding.
          const p = this.puppet;
          this.actTurn = 82;
          const wind = span(t, 0, 0.5, 0.7, 0.9);
          p.add('body', 12 * wind);
          for (const [w] of WINGS) p.add(w, 30 * wind);
          if (!this.slid && t > 0.85) {
            this.slid = true;
            this.amble(4, this.depth);
          }
          if (this.slid) this.actSpeed = 2.4;
          const down = this.slid && (this.walking || t < 1.9);
          this.lieReq = down ? 1 : 0;
          if (down) {
            for (const [w, side] of WINGS) p.add(w, 40, 0, side * (30 + 12 * sin(t, 1.6)));
            p.add('head', -25);
            this.sparks = 0;
            this.glow = 0.6;
          } else if (this.slid) {
            p.add('head', 0, 0, 9 * Math.sin(t * 14) * span(t, 0, 0.1, 1.8, 2.8));
          }
        },
      },
      tipOver: {
        weight: 0.8,
        length: [4.6, 5],
        when: this.still,
        start: () => (this.dir = Math.random() < 0.5 ? -1 : 1),
        pose: (t) => {
          // Leans too far, over he goes onto his side, legs paddling, and rocks back up
          // (the body's spring is loose, so he wobbles as he rights himself).
          const p = this.puppet;
          const over = ease(t, 0.3, 0.7) * (1 - ease(t, 2.7, 2.8));
          p.add('body', 0, 0, this.dir * 78 * over);
          p.add('head', 0, 0, -this.dir * 20 * over);
          p.add('leg.L', 34 * Math.sin(t * 14) * over);
          p.add('leg.R', -34 * Math.sin(t * 14) * over);
          this.open = 0.5 * over;
          if (t > 2.9) {
            p.add('body', 0, 0, 5 * Math.sin(t * 9) * (1 - ease(t, 2.9, 4.4)));
          }
          this.actExpr = t > 1.2 && t < 2.8 ? 'dizzy' : t > 2.8 ? 'happy' : null;
        },
      },
      spin: {
        weight: 0.8,
        length: [2.2, 2.4],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // A twirl on the spot, wings out, feet pattering.
          const k = ease(t, 0.2, 1.8);
          this.spin = 2 * Math.PI * k;
          this.open = 0.6;
          this.lift = 0.04 * Math.abs(sin(t, 3));
          this.puppet.add('leg.L', 25 * sin(t, 3));
          this.puppet.add('leg.R', -25 * sin(t, 3));
          this.keyReq = 8;
        },
      },
    };
  }

  // ---------- Little fidgets ----------

  private fidgets(): Record<string, Act> {
    return {
      preen: {
        weight: 1.2,
        length: [3, 4],
        face: 'happy',
        when: this.still,
        start: () => (this.dir = Math.random() < 0.5 ? -1 : 1),
        pose: (t) => {
          // Bill round into the feathers of one wing, nibbling; a waggle to finish.
          const p = this.puppet;
          p.add('head', 28, 95 * this.dir, 10 * this.dir);
          p.add('jaw', 12 * Math.max(0, sin(t, 4)));
          p.add(this.dir > 0 ? 'wing.L' : 'wing.R', 0, 0, 12 * this.dir);
          if (t > this.actLength - 0.8) this.waggle();
        },
      },
      quack: {
        weight: 1.2,
        length: [1.2, 1.2],
        face: 'happy',
        when: () => this.posture === 'stand',
        pose: (t) => this.quack(t),
      },
      flap: {
        weight: 0.8,
        length: [1.6, 1.8],
        face: 'happy',
        when: this.still,
        start: () => (this.hops = 0),
        pose: (t) => this.flapping(t, 0.6),
      },
      bob: {
        weight: 1.2,
        length: [2.6, 3.4],
        face: 'focused',
        when: this.still,
        pose: (t) => {
          // Head pumping in pairs, bill snapping shut: something has caught his eye.
          const k = this.fade(t, 0.3);
          const b = Math.max(0, sin(t, 1.2)) ** 2;
          this.puppet.add('head', 10 * b * sin(t, 6) * k, 0, 8 * k);
          this.puppet.add('jaw', 8 * Math.max(0, sin(t, 6)) * b * k);
          this.puppet.add('body', 3 * b * k);
        },
      },
      lookAround: {
        weight: 1.2,
        length: [4, 5],
        face: 'focused',
        when: this.still,
        pose: (t) => {
          const k = this.fade(t, 0.5);
          const p = this.puppet;
          p.add('head', 0, 55 * Math.sin(t * 1.9) * k, 6 * Math.sin(t * 1.9 + 1.5) * k);
          p.add('body', 0, 12 * Math.sin(t * 1.9 - 0.4) * k);
          for (const [w, side] of WINGS) p.add(w, 0, 0, side * 6 * k);
        },
      },
      tailShake: {
        weight: 1,
        length: [2.2, 2.6],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // A proper wag: tail tuft flying and the whole back end going with it.
          const k = span(t, 0.1, 0.4, 1.6, 2.2);
          this.puppet.add('tail', 0, 34 * k * Math.sin(t * 24), 0);
          this.puppet.add('body', 10 * k, 5 * k * Math.sin(t * 24), 0);
          this.puppet.add('head', 0, -6 * k * Math.sin(t * 24), 0);
          this.puppet.add('leg.L', 5 * k * Math.sin(t * 24));
          this.puppet.add('leg.R', -5 * k * Math.sin(t * 24));
        },
      },
      sneeze: {
        weight: 0.6,
        length: [2, 2.4],
        when: this.still,
        pose: (t) => {
          const p = this.puppet;
          const wind = span(t, 0.2, 1.0, 1.0, 1.1);
          const boom = pulse(t, 1.0, 0.35);
          p.add('head', -22 * wind + 34 * boom);
          p.add('body', -8 * wind + 14 * boom);
          p.add('jaw', 30 * wind + 20 * boom);
          this.open = 0.5 * boom;
          this.lift = 0.08 * boom;
          this.glow = boom;
          this.sparks = boom;
          this.actExpr = wind > 0.5 ? 'wink' : 'cross';
        },
      },
      hiccup: {
        weight: 0.7,
        length: [3, 3.4],
        face: 'surprised',
        when: this.still,
        pose: (t) => {
          const hic = pulse(t, 0.6, 0.18) + pulse(t, 1.5, 0.18) + pulse(t, 2.3, 0.18);
          this.lift = 0.06 * hic;
          this.puppet.add('head', -10 * hic);
          this.puppet.add('jaw', 14 * hic);
          this.open = 0.3 * hic;
          this.glow = hic;
          this.keyReq = 3 * hic;
        },
      },
      stretch: {
        weight: 0.9,
        length: [3.6, 4.2],
        face: 'sleepy',
        when: this.still,
        pose: (t) => {
          // A big wing stretch with a yawn, then a shake to settle the feathers.
          const p = this.puppet;
          const k = span(t, 0.3, 1.2, 2.4, 3.2);
          for (const [w, side] of WINGS) p.add(w, 35 * k, 0, side * 85 * k);
          p.add('body', -12 * k);
          p.add('head', -22 * k);
          p.add('jaw', 34 * span(t, 0.7, 1.2, 1.9, 2.4));
          p.add('tail', -14 * k);
          this.shake = span(t, 3.1, 3.2, 3.5, 3.7) * 0.5;
        },
      },
      shakeOff: {
        weight: 0.8,
        length: [2, 2.4],
        face: 'surprised',
        when: this.still,
        pose: (t) => {
          // Shaking off water: the whole duck twisting back and forth, wings flying out.
          const k = span(t, 0.1, 0.3, 1.5, 1.9);
          this.shake = k;
          this.open = 0.7 * k;
          this.puppet.add('head', 0, 0, 10 * k * Math.sin(t * 24));
          this.glow = k;
        },
      },
    };
  }

  // ---------- The spring ----------

  /** The self-wind: reach round to the key, crank it, fill up, hop and quack. */
  private windUp(s: number) {
    const p = this.puppet;
    const reach = span(s, 0, 0.7, 4.0, 4.5);
    // A small wind-back first, then the head leads the reach and the body follows.
    const back = pulse(s, 0, 0.5);
    const late = span(s, 0.25, 1.0, 3.7, 4.5);
    p.add('head', 6 * reach - 4 * back, 75 * reach - 8 * back, 0);
    p.add('body', -3 * back, 18 * late, 6 * late);
    p.add('wing.R', 0, 0, -12 * late);
    p.add('tail', 0, 0, -10 * late);
    p.add('wing.L', -30 * reach, 0, 40 * reach + 18 * reach * Math.sin(s * 9));
    const crank = ease(s, 0.7, 1.2) * (1 - ease(s, 3.8, 4.2));
    this.keyReq = 13 * crank;
    p.add('body', 0, 0, 3 * crank * Math.sin(s * 9));
    this.wound = this.windBase + (1 - this.windBase) * ease(s, 0.8, 3.8);
    this.sparks = 0.4 * crank;
    this.glow = 0.5 * crank;
    if (s > 4.1) {
      this.wound = 1;
      const b = pulse(s, 4.1, 0.25) + pulse(s, 4.5, 0.25);
      p.add('jaw', 36 * b);
      p.add('head', -12 * b);
      for (const [w, side] of WINGS) p.add(w, 0, 0, side * 22 * b);
      this.glow = b;
      if (!this.did) {
        this.did = 1;
        this.hop.kick(1.5);
        this.waggle();
      }
    }
    this.actExpr = s > 4.1 ? 'happy' : 'focused';
  }

  private springs(): Record<string, Act> {
    return {
      wind: {
        weight: 0.7,
        length: [5.2, 5.6],
        when: this.still,
        start: () => {
          this.did = 0;
          this.windBase = this.wound;
        },
        pose: (t) => this.windUp(t),
      },
      windDown: {
        weight: 0.8,
        length: [15, 17],
        when: this.still,
        start: () => {
          this.did = 0;
          this.jerks = 0;
          this.windBase = 0.02;
          this.amble(2.5);
        },
        pose: (t) => {
          // Running down: slower and slower, the key barely turning, head sinking,
          // one last clunk. Then he waits, dark, to be wound; then winds himself.
          const p = this.puppet;
          const slow = 1 - ease(t, 0.4, 5.6);
          this.actSpeed = 0.05 + 1.05 * slow;
          this.keyReq = 7 * slow;
          this.wound = Math.min(this.wound, 0.03 + 0.5 * slow);
          const droop = ease(t, 2.5, 6.5);
          p.add('head', 32 * droop);
          p.add('body', 8 * droop, 0, 3 * droop * Math.sin(t * 0.7));
          for (const [w, side] of WINGS) p.add(w, 0, 0, side * -6 * droop);
          // After the last clunk the head settles down with a little bounce.
          p.add('head', 3 * pulse(t, 6.8, 0.5) - 3 * pulse(t, 7.3, 0.4));
          if (t > 5.6 && this.goal !== null) this.goal = null;
          for (const at of [5.9, 6.6]) {
            if (t > at && this.jerks < (at < 6 ? 1 : 2)) {
              this.jerks++;
              this.keySpeed += 5;
              this.puppet.kick('body', 12);
              this.hop.kick(0.5);
            }
          }
          this.glow = 0;
          const waited = this.actLength - 5.4;
          if (t < waited) this.actExpr = t > 6 ? 'asleep' : 'sleepy';
          else {
            this.windUp(t - waited);
          }
        },
      },
      sparks: {
        weight: 0.8,
        length: [3, 3.6],
        face: 'surprised',
        when: this.still,
        pose: (t) => {
          // The key spinning wild, lights flaring every colour, the whole duck buzzing.
          const k = span(t, 0.2, 0.6, this.actLength - 0.8, this.actLength);
          this.keyReq = 16 * k;
          this.sparks = k;
          this.glow = k;
          this.shiver = k;
          this.open = 0.25 * k;
          this.puppet.add('head', -6 * k);
        },
      },
    };
  }

  // ---------- With company ----------

  private social(): Record<string, Act> {
    const company = () => this.still() && this.mates().length > 0;
    return {
      follow: {
        weight: 1.3,
        length: [8, 11],
        face: 'happy',
        when: company,
        start: () => (this.lastStep = -1),
        pose: (t) => {
          // Falls in a step behind a crewmate and marches wherever they go.
          this.march = 1;
          this.actSpeed = 1.2;
          const m = this.mates()[0];
          if (m && (t - this.lastStep > 0.6 || this.lastStep < 0)) {
            this.lastStep = t;
            const d =
              Math.abs(m.velocity.x) > 1 ? -Math.sign(m.velocity.x) : Math.sign(this.s - m.s) || 1;
            this.walkTo(m.s + d * this.heightPx * 1.25, m.depth);
          }
          this.puppet.add('head', -6);
        },
      },
      greet: {
        weight: 1.3,
        length: [8, 10],
        when: company,
        start: () => {
          this.did = 0;
          const m = this.mates()[0];
          if (!m) return;
          this.dir = this.toward(m);
          this.walkTo(m.s - this.dir * this.heightPx * 1.1, m.depth);
        },
        pose: (t) => {
          // Waddles over to a crewmate, turns to them, quacks twice and waves a wing.
          const m = this.mates()[0];
          const p = this.puppet;
          this.actSpeed = 1.0;
          const at = !this.walking && t > 1;
          if (at && !this.did) this.did = t;
          const s = this.did ? t - this.did : -1;
          if (s < 0) {
            this.march = 0.4;
            return;
          }
          const k = ease(s, 0, 0.6) * (1 - ease(s, 4.2, 5));
          if (m) p.add('root', 0, this.toward(m) * 40 * k, 0);
          const b = pulse(s, 0.8, 0.25) + pulse(s, 1.3, 0.25);
          p.add('jaw', 36 * b);
          p.add('head', -12 * b + 6 * k);
          p.add(
            'wing.L',
            0,
            0,
            100 * span(s, 2.0, 2.4, 3.4, 3.8) + 12 * Math.sin(s * 14) * span(s, 2.2, 2.4, 3.4, 3.6),
          );
          p.add('body', 10 * span(s, 3.8, 4.3, 4.6, 5));
          this.actExpr = s > 2 ? 'love' : 'happy';
          this.glow = k;
        },
      },
      watch: {
        weight: 1,
        length: [4.5, 6],
        face: 'focused',
        when: company,
        start: () => (this.dir = Math.random() < 0.5 ? -1 : 1),
        pose: (t) => {
          // Turns to a crewmate and watches, head tilting.
          const m = this.mates()[0];
          if (!m) return;
          const k = this.fade(t, 0.6);
          this.puppet.add('root', 0, this.toward(m) * 42 * k, 0);
          this.puppet.add(
            'head',
            4 * k,
            -this.toward(m) * 20 * k,
            this.dir * 24 * k * Math.sin(t * 1.8),
          );
        },
      },
    };
  }

  // ---------- Rest ----------

  private rests(): Record<string, Act> {
    return {
      sit: {
        weight: 1.5,
        length: [5, 10],
        when: () => this.posture !== 'sit' && this.still() && this.posture === 'stand',
        start: () => (this.posture = 'sit'),
      },
      nap: {
        weight: 1,
        length: [8, 15],
        face: 'asleep',
        when: () => !this.walking && this.posture !== 'lie',
        start: () => (this.posture = 'sit'),
        pose: (t) => this.puppet.add('head', 22 + 2 * sin(t, 0.25), 0, 6),
      },
      stand: {
        weight: 2,
        length: [0.6, 1],
        when: () => this.posture !== 'stand',
        start: () => (this.posture = 'stand'),
      },
    };
  }

  // ---------- Reactions ----------

  private reactions(): Record<string, Act> {
    return {
      poked: {
        weight: 0,
        length: [1.2, 1.2],
        face: 'surprised',
        start: () => {
          this.posture = 'stand';
          this.hop.kick(1.6);
        },
        pose: (t) => {
          this.quack(t);
          this.sparks = pulse(t, 0, 0.6);
        },
      },
      rewound: {
        weight: 0,
        length: [3, 3.2],
        face: 'happy',
        start: () => {
          this.posture = 'stand';
          this.windBase = this.wound;
          this.hop.kick(1.5);
        },
        pose: (t) => {
          // Somebody wound the key: it spins up hard, the lights fill, he jumps to life.
          this.keyReq = 14 * span(t, 0, 0.3, 1.4, 2.2);
          this.wound = this.windBase + (1 - this.windBase) * ease(t, 0, 1.4);
          this.sparks = span(t, 0, 0.3, 1.2, 1.8);
          this.glow = this.sparks;
          this.open = 0.5 * span(t, 0.5, 0.9, 1.6, 2.2);
          this.puppet.add('jaw', 36 * (pulse(t, 1.4, 0.25) + pulse(t, 1.8, 0.25)));
          if (t > 1.4) this.waggle();
        },
      },
      panic: {
        weight: 0,
        length: [2, 2.4],
        face: 'surprised',
        start: () => {
          this.posture = 'stand';
          this.hops = 0;
          const way = Math.random() < 0.5 ? -1 : 1;
          this.walkTo(this.s + way * this.heightPx * 2.5);
        },
        pose: (t) => {
          this.actSpeed = 2.2;
          this.march = 1;
          this.flapping(t, 1);
          this.sparks = 0.5;
        },
      },
      dizzy: {
        weight: 0,
        length: [3.4, 3.8],
        face: 'dizzy',
        start: () => (this.posture = 'stand'),
        pose: (t) => {
          const k = 1 - ease(t, 2.4, 3.4);
          const p = this.puppet;
          p.add('head', 8 * k * Math.cos(t * 5), 0, 22 * k * Math.sin(t * 5));
          p.add('body', 0, 0, 12 * k * Math.sin(t * 5 + 1));
          p.add('root', 0, 0, 6 * k * Math.sin(t * 5));
          this.open = 0.5 * k;
          this.flap = 10 * k * Math.sin(t * 12);
          this.sparks = 0.8 * k;
          this.glow = k;
        },
      },
      pleased: {
        weight: 0,
        length: [3, 4],
        face: 'love',
        pose: (t) => {
          // The mouse resting on him: wings fluttering, tail waggling, a little hop.
          const k = this.fade(t, 0.5);
          this.open = 0.5 * k;
          this.flap = 14 * k * Math.sin(t * 22);
          this.lift = 0.06 * k * Math.abs(Math.sin(t * 5));
          this.puppet.add('head', 6 * k * Math.sin(t * 9), 0, 8 * k * sin(t, 1.2));
          this.puppet.add('tail', 0, 26 * k * Math.sin(t * 13), 0);
          this.glow = k;
        },
      },
    };
  }

  /** Two quacks: bill snaps open, head up, wings twitch. */
  private quack(t: number) {
    const b = pulse(t, 0.1, 0.25) + pulse(t, 0.5, 0.25);
    this.puppet.add('jaw', 38 * b);
    this.puppet.add('head', -12 * b);
    for (const [wing, side] of WINGS) this.puppet.add(wing, 0, 0, side * 15 * b);
    this.glow = Math.max(this.glow, b);
  }

  /** Wings out and flapping, hopping on each downstroke. */
  private flapping(t: number, strength: number) {
    for (const [wing, side] of WINGS)
      this.puppet.add(wing, 0, 0, side * (45 + 30 * sin(t, 5)) * strength);
    for (; this.hops < Math.floor(t * 2.5); this.hops++) this.hop.kick(0.8 * strength);
    this.keyReq = 12 * strength;
    this.glow = Math.max(this.glow, 0.5 * strength);
  }

  /** A quick waggle of the tail tuft. */
  private waggle() {
    if (this.t - this.waggleAt > 1) this.waggleAt = this.t;
  }

  poke() {
    if (this.state !== 'here') return;
    const now = performance.now() / 1000;
    this.pokes = [...this.pokes.filter((at) => now - at < 2.5), now];
    this.goal = null;
    this.slid = false;
    const stalled = this.act === 'windDown' && this.actT > 6 && this.actT < this.actLength - 5.4;
    if (this.pokes.length >= 3) {
      this.pokes = [];
      this.setAct('dizzy');
    } else if (stalled) this.setAct('rewound');
    else if (this.pokes.length === 2 && this.act === 'poked') this.setAct('panic');
    else if (this.act !== 'dizzy') this.setAct('poked');
  }

  protected onEnter() {
    this.posture = 'stand';
  }

  protected onLeave() {
    this.posture = 'stand';
  }

  private feel(env: Env): Mood {
    const r = this.role?.mood;
    if (r === 'happy' || r === 'love') return 'happy';
    if (r === 'curious') return 'curious';
    if (r === 'alarmed' || r === 'scared') return 'alarmed';
    if (r === 'sleepy') return 'sleepy';
    if (this.act === 'panic' || this.act === 'poked' || this.act === 'dizzy') return 'alarmed';
    if (this.act === 'nap' || this.act === 'windDown' || this.posture === 'sit') return 'sleepy';
    if (
      this.hovered ||
      [
        'preen',
        'quack',
        'flap',
        'stamp',
        'slide',
        'greet',
        'follow',
        'rewound',
        'pleased',
      ].includes(this.act)
    )
      return 'happy';
    const eye = this.eyePoint(env.frame);
    const near = Math.hypot(env.pointer.x - eye.x, env.pointer.y - eye.y) < this.heightPx * 8;
    if (env.pointer.present && near && env.time - env.pointer.at < 1.5) return 'curious';
    return 'calm';
  }

  // ---------- Posing ----------

  protected idle(t: number) {
    const p = this.puppet;
    this.lieReq = 0;
    this.lift = 0;
    this.open = 0;
    this.flap = 0;
    this.spin = 0;
    this.shake = 0;
    this.shiver = 0;
    this.march = 0;
    this.keyReq = -1;
    this.glow = 0;
    this.sparks = 0;
    this.actExpr = null;
    this.actSpeed = 1.1;
    this.actTurn = 80;
    p.add('body', 1.5 * sin(t, 0.35));
    p.add('head', 0, 3 * sin(t, 0.13));
    p.add('wing.L', 0, 0, 1.5 * sin(t, 0.21));
    p.add('wing.R', 0, 0, 1.5 * sin(t, 0.21, 0.4));
    if (this.posture === 'sit') {
      // Settled down on his belly, feet tucked up under him.
      p.add('leg.L', 70);
      p.add('leg.R', 70);
      p.add('body', 6);
    }
    // Now and then a waggle, just because.
    if (t > this.nextWaggle) {
      this.nextWaggle = t + 5 + Math.random() * 8;
      if (this.posture === 'stand') this.waggle();
    }
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    this.env = env;
    this.spec.speed = this.actSpeed;
    this.spec.turn = this.actTurn;

    // A director's part: its posture and mood.
    if (this.role) {
      this.hadRole = true;
      this.posture = this.role.posture ?? 'stand';
    } else if (this.hadRole) {
      this.hadRole = false;
      this.posture = 'stand';
    }
    const H = this.heightPx;
    this.h = this.lift * H;

    const lie = this.lieS.update(dt, this.posture === 'lie' || this.lieReq ? 1 : 0);

    // Using the spring up: walking a lot runs the gauge down, flapping faster.
    const tired = this.stride > 1 ? 0.004 : 0.0004;
    if (this.act !== 'windDown' && this.act !== 'wind' && this.act !== 'rewound')
      this.wound = Math.max(0.05, this.wound - dt * (tired + (this.act === 'flap' ? 0.01 : 0)));

    // The waddle: legs swinging, body rocking over the planted foot, wings held out a bit.
    const moving = clamp(this.stride / (H * 0.8), 0, 1) * (1 - lie);
    this.bounce = 0;
    if (moving > 0.05) {
      if (!this.role) this.posture = this.act === 'nap' ? 'sit' : 'stand';
      const ph = this.gait * 1.3;
      const step = Math.sin(ph);
      const amp = 30 + 22 * this.march;
      // Feet plant: the leg swings back at the speed of the floor while planted, then
      // swings through quickly (skewed sine), and only the swinging leg lifts.
      const skew = (x: number) => Math.sin(x + 0.5 * Math.sin(x));
      p.add('leg.L', amp * skew(ph) * moving);
      p.add('leg.R', -amp * skew(ph) * moving);
      // Weight shift: the body rolls and slides over the planted foot, head counters late.
      p.add('body', 0, 0, (10 - 3 * this.march) * step * moving);
      p.add('head', 0, 0, -7 * Math.sin(ph - 0.5) * moving);
      p.add('tail', 0, 0, -12 * Math.cos(ph - 0.7) * moving);
      for (const [wing, side] of WINGS)
        p.add(
          wing,
          25 * this.march * moving,
          0,
          (side * (10 - 6 * this.march) + 4 * Math.sin(ph - 0.9)) * moving,
        );
      this.bounce = 0.006 * Math.abs(step) * moving;
      this.sway = 0.006 * Math.sin(ph) * moving;
    } else this.sway = 0;

    // Wings out, for balance or joy.
    for (const [wing, side] of WINGS) p.add(wing, 0, 0, side * this.open * 70);

    // Lying flat on his belly: leaning forward, feet trailing behind.
    if (lie > 0.01) {
      p.add('root', 14 * lie);
      p.add('leg.L', 80 * lie);
      p.add('leg.R', 80 * lie);
      p.add('tail', -10 * lie);
    }

    const drop = this.posture === 'sit' ? -0.075 : 0;
    p.shift(
      'root',
      this.sway,
      this.crouch.update(dt, drop - 0.11 * lie) + Math.max(0, this.hop.update(dt, 0)) + this.bounce,
      0,
    );
    // Standing three-quarters on, toward the middle, so his key and tail show.
    const middle = (env.frame.left + env.frame.right) / 2;
    const turn = this.turn.update(dt, this.walking ? 0 : Math.sign(middle - this.s) * 40);
    p.add('root', 0, turn);
    p.add('head', 0, -turn * 0.7);

    this.mood = this.feel(env);
    if (this.mood === 'happy' && this.hovered) this.waggle();
    if (this.hovered) this.hover += dt;
    else this.hover = 0;
    if (this.hover > 0.9 && this.act === 'idle' && this.still() && !this.role)
      this.setAct('pleased');
    // Tail: a waggle is a quick burst side to side.
    const w = this.t - this.waggleAt;
    if (w < 0.9) p.add('tail', 0, 26 * Math.sin(w * 2 * Math.PI * 7) * (1 - w / 0.9));
    switch (this.mood) {
      case 'curious': {
        // Head bobbing, in little pairs.
        const bob = Math.max(0, sin(env.time, 1.2)) ** 3;
        p.add('head', 10 * bob * sin(env.time, 6), 0, 8);
        break;
      }
      case 'happy':
        for (const [wing, side] of WINGS) p.add(wing, 0, 0, side * 8);
        break;
      case 'sleepy':
        if (this.act !== 'windDown') p.add('head', 12);
        break;
    }
    this.expression =
      this.actExpr ??
      (this.mood === 'sleepy' ? 'sleepy' : this.mood === 'happy' ? 'happy' : 'neutral');
  }

  private hover = 0;

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    const t = env.time;

    // Quick motions, direct.
    if (this.flap) for (const [w, side] of WINGS) p.turn(w, 0, 0, side * this.flap);
    if (this.shiver) {
      p.turn('body', 0, 0, 2.4 * this.shiver * Math.sin(t * 80));
      p.turn('head', 0, 0, 1.6 * this.shiver * Math.sin(t * 70 + 1));
    }
    if (this.shake) {
      p.turn('body', 0, 30 * this.shake * Math.sin(t * 28), 0);
      p.turn('head', 0, -22 * this.shake * Math.sin(t * 28), 0);
      p.turn('tail', 0, 30 * this.shake * Math.sin(t * 30), 0);
      for (const [w, side] of WINGS) p.turn(w, 0, 0, side * 20 * this.shake * Math.sin(t * 28));
    }
    this.pivot.rotation.y = this.spin;

    // The key turns while he walks (it's what makes him go), and winds down after.
    const run = clamp(this.stride / (this.heightPx * 0.8), 0, 1);
    const target = this.keyReq >= 0 ? this.keyReq : 7 * run;
    this.keySpeed += (target - this.keySpeed) * Math.min(1, dt * 1.5);
    this.key += this.keySpeed * dt;
    // It ticks round in steps of a sixth turn: it rests, then snaps on with a little
    // overshoot, the way a ratchet does. Fast turns blur into a smooth spin.
    const STEP = Math.PI / 3;
    const fast = clamp((this.keySpeed - 9) / 4, 0, 1);
    const base = Math.floor(this.key / STEP);
    const frac = this.key / STEP - base;
    const snap = ease(frac, 0.55, 1) * (1 + 0.12 * Math.sin(ease(frac, 0.55, 1) * Math.PI));
    const ticked = (base + snap) * STEP;
    this.keyShown = ticked + (this.key - ticked) * fast;
    const bone = p.bone('key');
    bone.quaternion.multiply(q.setFromAxisAngle(UP, this.keyShown));

    this.lights(t);
  }

  /** The chest lamp shows the mood, three lights under it the wind; the key's bow takes
   * the mood's colour (or every colour, when it sparks). */
  private lights(t: number) {
    const mood = this.role?.face ?? this.acts[this.act]?.face ?? this.expression;
    const tone = (mood === 'neutral' ? BEACON.happy : BEACON[mood]) ?? '#ffb347';
    const rainbow = RAINBOW[Math.floor(t * 9) % RAINBOW.length];
    const sparking = this.sparks > 0.15 && Math.sin(t * 30) > -0.3;
    const colour = sparking ? rainbow : tone;
    const dark = this.act === 'windDown' && this.actT > 5.6 && this.actT < this.actLength - 5.4;
    const asleep = mood === 'asleep' || mood === 'sleepy';
    const lamp = dark
      ? 0.06
      : asleep
        ? 0.15 + 0.1 * Math.sin(t * 0.9)
        : 0.35 + 0.65 * this.glow + (this.hovered ? 0.3 : 0);
    this.outfit.dot(0, clamp(lamp, 0, 1), colour);
    for (let i = 0; i < 3; i++) {
      let level = clamp(this.wound * 3 - i, 0, 1);
      if (this.wound < 0.34 && i === 0 && !dark) level = 0.4 + 0.6 * (Math.sin(t * 5) > 0 ? 1 : 0);
      if (dark) level = 0;
      this.outfit.dot(1 + i, level, colour);
    }
    this.outfit.beacon(dark ? '#8a8a84' : colour);
  }
}
