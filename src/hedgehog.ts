import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Act, Character, clamp, type Env, type Frame } from './character';
import type { Expression, FaceLayout } from './face';
import { sin } from './moves';
import { Spring } from './spring';

/**
 * Quill, the robot hedgehog: a little dome of spikes on four wheels. He zips along the
 * bottom of the frame in short dashes (leaning back as he speeds off, dipping as he
 * brakes), stops to sniff, and now and then pops a wheelie and races off somewhere else.
 *
 * Every spike is a collared steel shaft with a light in its tip, in five bands from head
 * to tail, and the bands ride on bones of their own so they can lift one after another.
 * The lights show what he's up to: running lights down his back as he drives, a green
 * flicker on a scent, a slow dim breath asleep, a rainbow chasing along them when he's
 * happy or racing. His nose is a small lit button.
 *
 * He's shy. A poke, or the mouse rushing past close by, and he goes into his shell:
 * head and wheels pulled in, spikes puffed up and flashing; after a moment he peeks out.
 * Rest the mouse on him and he calms down, the spikes settling and glowing warm. Poke
 * him three times and he spins on the spot and comes out dizzy.
 *
 * Around that he has thirty little tricks: wheelies, skids, donuts, revving his wheels,
 * zigzagging across the floor, rolling himself up into a ball and rolling along, sniffing
 * a trail along the back wall, peering over the front lip, burrowing into the floor in a
 * flurry of leaf-coloured lights, spinning, shivering, sneezing, stretching, napping curled
 * up, counting off his spikes, gazing at the stars, crackling with static, bumping a ball
 * along with his nose (the ball lives inside his chassis and rolls out for it), hopping,
 * hiding behind a crewmate and peeking out, and going to sniff at one.
 */
export const HEDGEHOG_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.31, 0.5],
    [0.69, 0.5],
  ],
  rx: 0.085,
  ry: 0.27,
  line: 0.035,
  mouth: null,
};

const WHEELS = ['wheel.FL', 'wheel.FR', 'wheel.BL', 'wheel.BR'];
const EARS = ['ear.L', 'ear.R'];
/** Wheel radius, metres. */
const WHEEL = 0.032;
const DEG = 180 / Math.PI;
/** Bands of spike-tip lights, head to tail (Dot0..Dot4). */
const BANDS = 5;
const LEAF = ['#ffb347', '#d98a2b', '#e8c15a', '#c96a2a'];
const WHITE = '#f4f4f1';
/** 1 at 0, falling to 0 at ±width. */
const bump = (x: number, width: number) => Math.max(0, 1 - Math.abs(x) / width);
const cycle = (x: number) => x - Math.floor(x);
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
/** A wave running down his back: 0..1 for band i at this moment. */
const wave = (time: number, i: number, rate: number, width = 0.16) =>
  bump(cycle(time * rate) * 1.5 - 0.15 - (i / BANDS) * 0.8, width);

type Light = (i: number, time: number, t: number) => [number, string?];

export class Hedgehog extends Character {
  /** 0 out and about, 1 all the way into his shell. */
  private tuck = new Spring(2.6, 0.75, 1, 0);
  /** Spikes puffed up (+) or settled (-). */
  private puff = new Spring(3, 0.35, 1, 0);
  private ballOut = new Spring(3, 0.6, 1, 0);
  private puffNow = 0;
  private tuckNow = 0;
  private wheels = 0;
  private lastPace = 0;
  private pokes: number[] = [];
  private hover = 0;
  private mouse: { x: number; y: number; speed: number } | null = null;
  private shyUntil = 0;
  private frame: Frame | null = null;
  private env: Env | null = null;
  private stage = 0;
  private did = 0;
  private dir = 1;
  private mate: Character | null = null;
  private home0 = 0;
  private rollA = 0;
  private ballSpin = 0;
  private ballAhead = 0;
  private lastAhead = 0;
  private speed = 1.6;

  // Per-frame requests from acts, cleared in idle().
  private wantTuck: number | null = null;
  private wantPuff: number | null = null;
  private sink = 0;
  private turnA = 0;
  private rev = 0;
  private shake = 0;
  private lift: number[] = [0, 0, 0, 0, 0];
  private noseWiggle = 0;
  private ballWant = 0;
  private roll = 0;
  private glow: Light | null = null;
  private noseColour: string | null = null;
  private actExpr: Expression | null = null;

  constructor(model: Object3D) {
    super(
      {
        name: 'Quill',
        model: 'hedgehog',
        metres: 0.3,
        width: 0.45,
        size: 0.8,
        feels: {
          default: { f: 4, zeta: 0.6 },
          body: { f: 2.2, zeta: 0.45 },
          head: { f: 3, zeta: 0.55, r: 0.3 },
          dome: { f: 3, zeta: 0.4 },
          'ear.L': { f: 7, zeta: 0.35 },
          'ear.R': { f: 7, zeta: 0.35 },
          nose: { f: 8, zeta: 0.4 },
        },
        face: HEDGEHOG_FACE,
        eyes: 0.53,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.9 },
          { bone: 'dome', yaw: 0.15, pitch: 0 },
        ],
        reach: { yaw: 60, pitch: 30 },
        lag: 1.5,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [40, 90],
        speed: 1.6,
      },
      model,
    );
    this.acts = {
      ...this.drives(),
      ...this.floorTricks(),
      ...this.fidgets(),
      ...this.lightTricks(),
      ...this.play(),
      ...this.social(),
      ...this.rests(),
      ...this.reactions(),
    };
  }

  // ---------- Who and where ----------

  private mates() {
    return (this.env?.crew ?? [])
      .filter((o) => o !== this && o.state === 'here' && o.edge === this.edge && !o.free)
      .sort((a, b) => Math.abs(a.s - this.s) - Math.abs(b.s - this.s))
      .filter((o) => Math.abs(o.s - this.s) < this.heightPx * 12);
  }

  private still = () => !this.walking && !this.door && !this.free && this.edge === 'bottom';

  /** Which way has more room along the floor, and how much (px). */
  private room(): [number, number] {
    if (!this.env) return [1, 0];
    const [lo, hi] = this.span(this.env.frame);
    const way = this.s - lo > hi - this.s ? -1 : 1;
    return [way, (way > 0 ? hi - this.s : this.s - lo) - this.widthPx() * 1.2];
  }

  /** Drive `heights` of his own height along the floor, mostly the way with more room. */
  private amble(heights: number, depth?: number, way?: number) {
    const [more, room] = this.room();
    const w = way ?? (Math.random() < 0.7 ? more : -more);
    const far = Math.min(Math.max(room, 0), this.heightPx * heights);
    this.walkTo(this.s + w * Math.max(far, this.heightPx * 0.6), depth);
    return w;
  }

  /** 0..1 over an act: eases in and out at its ends. */
  private fade(t: number, e = 0.5) {
    return ease(t, 0, e) * (1 - ease(t, this.actLength - e, this.actLength));
  }

  private toward(m: Character) {
    return Math.sign(m.s - this.s) || 1;
  }

  /** Off at full speed toward the side with more room, as far as there's room for. */
  private dash(keep = false) {
    if (!this.frame) return 1;
    const [lo, hi] = this.span(this.frame);
    const way = this.s - lo > hi - this.s ? -1 : 1;
    const room = (way > 0 ? hi - this.s : this.s - lo) - this.widthPx() * 1.5;
    const far = Math.min(room, this.heightPx * (3 + Math.random() * 3));
    this.walkTo(this.s + way * Math.max(0, far), keep ? this.depth : undefined);
    return way;
  }

  // ---------- Driving about ----------

  private drives(): Record<string, Act> {
    return {
      idle: { weight: 3, length: [3, 6] },
      scurry: {
        weight: 1.6,
        length: [1.5, 3],
        when: this.still,
        start: () => {
          this.amble(1 + Math.random() * 1.5);
        },
      },
      dash: {
        weight: 0.8,
        length: [4, 5],
        face: 'happy',
        when: this.still,
        start: () => {
          this.dash();
        },
      },
      skid: {
        weight: 0.9,
        length: [5, 6],
        when: this.still,
        start: () => {
          this.did = 0;
          this.stage = 0;
          this.dir = this.dash(true);
        },
        pose: (t) => {
          // A dash, then he brakes hard: nose down, tail swinging round, sparks of light.
          const p = this.puppet;
          this.speed = 3.6;
          if (this.walking && !this.stage) this.stage = 1;
          if (this.stage === 1 && !this.walking) {
            this.stage = 2;
            this.did = t;
            p.kick('body', 60);
            p.kick('root', 0, 250 * this.dir, 0);
          }
          const s = this.stage === 2 ? t - this.did : -1;
          if (s >= 0) {
            const k = span(s, 0, 0.1, 0.5, 1.4);
            p.add('body', 12 * k);
            p.add('root', 0, -25 * this.dir * k, 0);
            this.shake = 1.5 * k;
            this.glow = (i, time) => [Math.sin(time * 40 + i * 2) > 0 ? 1 : 0.2, WHITE];
            this.actExpr = 'surprised';
          } else {
            this.glow = (i, time) => [1, RAINBOW[(i + Math.floor(time * 10)) % RAINBOW.length]];
            this.actExpr = 'happy';
          }
        },
      },
      wheelie: {
        weight: 0.9,
        length: [5, 6],
        face: 'happy',
        when: this.still,
        start: () => {
          this.did = 0;
        },
        pose: (t) => {
          // Up on the back wheels, front wheels spinning, rolling along a little, then down
          // with a bump.
          const p = this.puppet;
          const up = span(t, 0.1, 0.6, this.actLength - 1.3, this.actLength - 0.7);
          p.add('body', -24 * up + 3 * sin(t, 1.4) * up);
          p.add('head', -10 * up);
          p.add('dome', 4 * up);
          for (const e of EARS) p.add(e, -25 * up);
          this.rev = 30 * up;
          this.speed = 1.6;
          if (t > 0.7 && !this.did) {
            this.did = 1;
            const [w, room] = this.room();
            this.walkTo(this.s + w * Math.max(0, Math.min(room, this.heightPx * 2.2)), this.depth);
          }
          if (t > this.actLength - 0.8 && this.did === 1) {
            this.did = 2;
            this.goal = null;
            p.kick('body', 80);
            this.hopUp(0.1);
          }
          this.glow = (i, time) => [wave(time, i, 1.4, 0.3), RAINBOW[i % RAINBOW.length]];
        },
      },
      rev: {
        weight: 0.8,
        length: [4, 5],
        face: 'focused',
        when: this.still,
        pose: (t) => {
          // Revving on the spot, like a tiny engine: wheels whirring up, the whole chassis
          // shuddering, lights climbing the spikes.
          const p = this.puppet;
          const k = span(t, 0.2, 1.8, this.actLength - 0.8, this.actLength - 0.1);
          this.rev = 45 * k;
          this.shake = 1.2 * k;
          p.add('body', -3 * k);
          this.glow = (i, time, tt) => {
            const fill = clamp(tt / 1.8, 0, 1) * BANDS;
            return [
              i < fill ? 0.5 + 0.5 * Math.sin(time * 25) : 0.05,
              i < fill ? LEAF[0] : undefined,
            ];
          };
        },
      },
      donut: {
        weight: 0.8,
        length: [10, 12],
        face: 'happy',
        when: this.still,
        start: () => {
          this.stage = 0;
          this.dir = Math.random() < 0.5 ? -1 : 1;
          this.did = this.s;
        },
        pose: (t) => {
          // Drives a loop round the floor at speed, leaning into the turn, rainbow on.
          const H = this.heightPx;
          const at: [number, number][] = [
            [this.did + this.dir * 2 * H, 0.15],
            [this.did + this.dir * 2 * H, 0.75],
            [this.did, 0.75],
            [this.did, 0.15],
          ];
          this.speed = 3;
          if (this.stage < 4 && !this.walking && t > 0.3 + this.stage * 0.15) {
            const [x, d] = at[this.stage++];
            this.walkTo(x, d);
          }
          this.puppet.add('body', 0, 0, 7 * this.dir);
          this.puppet.add('dome', 0, 0, -3 * this.dir);
          this.glow = (i, time) => [1, RAINBOW[(i + Math.floor(time * 10)) % RAINBOW.length]];
        },
      },
      zigzag: {
        weight: 0.9,
        length: [8, 10],
        when: this.still,
        start: () => {
          this.stage = 0;
          const [w] = this.room();
          this.dir = Math.random() < 0.7 ? w : -w;
          this.did = this.s;
        },
        pose: (t) => {
          // Slaloming in and out of the box across the floor, swinging his tail round.
          const H = this.heightPx;
          const depths = [0.7, 0.05, 0.7, 0.05, 0.4];
          if (this.stage < depths.length && !this.walking && t > 0.2 + this.stage * 0.1) {
            const k = ++this.stage;
            const [, room] = this.room();
            const step = Math.min(1.1 * H, Math.max(room, 0) / 5 + 0.2 * H);
            this.walkTo(this.did + this.dir * k * step, depths[k - 1]);
          }
          this.speed = 2.4;
          this.puppet.add('body', 0, 0, 6 * sin(t, 0.55));
        },
      },
      teeter: {
        weight: 0.8,
        length: [4, 5],
        face: 'surprised',
        when: this.still,
        pose: (t) => {
          // Rocking on the edge of a wheelie and back onto his nose, as if on a seesaw.
          const k = this.fade(t, 0.5);
          const s = Math.sin(2 * Math.PI * 0.7 * t);
          this.puppet.add('body', 14 * s * k - 4 * k);
          this.puppet.add('head', -6 * s * k);
          for (const e of EARS) this.puppet.add(e, 10 * Math.sin(2 * Math.PI * 0.7 * t + 1) * k);
        },
      },
    };
  }

  // ---------- Tricks on the floor ----------

  private floorTricks(): Record<string, Act> {
    return {
      sniff: {
        weight: 1.5,
        length: [3, 5],
        face: 'focused',
        when: this.still,
        pose: (t) => {
          this.puppet.add('head', 12 + 3 * sin(t, 6), 10 * sin(t, 0.4));
          this.noseWiggle = 1;
        },
      },
      trail: {
        weight: 1.2,
        length: [12, 14],
        face: 'focused',
        when: this.still,
        start: () => {
          this.stage = 0;
          this.did = 0;
          this.dir = Math.random() < 0.5 ? -1 : 1;
          this.walkTo(this.s + this.dir * this.heightPx * 0.8, 0.93);
        },
        pose: (t) => {
          // Off to the back wall, then along it a few steps at a time with his nose down,
          // following a scent, and back to the front.
          const p = this.puppet;
          const back = this.depth > 0.85;
          const nose = back ? 1 : 0;
          this.speed = 0.9;
          p.add('head', (26 + 5 * sin(t, 5)) * nose);
          p.add('body', 4 * nose);
          this.noseWiggle = 1;
          if (back && !this.walking && this.stage < 4 && t > 0.5) {
            if (!this.did) this.did = t;
            if (t - this.did > 0.8) {
              this.did = 0;
              const [, room] = this.room();
              const step = this.heightPx * 0.7;
              const way = room < step * 2 ? -this.dir : this.dir;
              this.walkTo(this.s + way * step, 0.93);
              this.stage++;
            }
          }
          if (t > this.actLength - 2.2 && this.stage < 5) {
            this.stage = 5;
            this.walkTo(this.s, 0.2);
          }
          this.glow = (i, time) => [
            Math.sin(time * 14 - i * 1.5) > 0.3 ? 0.9 : 0.1,
            BEACON.focused,
          ];
        },
      },
      lip: {
        weight: 1.1,
        length: [8, 9],
        when: this.still,
        start: () => {
          this.did = 0;
          this.walkTo(this.s + (Math.random() < 0.5 ? -1 : 1) * this.heightPx * 0.8, 0);
        },
        pose: (t) => {
          // Down at the front lip: he sinks behind it until just his spikes and eyes show,
          // and peers over at whoever is looking.
          const p = this.puppet;
          const at = this.depth < 0.05 && !this.walking;
          if (at && !this.did) this.did = t;
          const s = at ? t - this.did : -1;
          const k = s < 0 ? 0 : span(s, 0, 0.8, 6, 6.8);
          this.sink = 0.075 * k;
          p.add('head', -14 * k + 6 * sin(t, 0.5) * k);
          p.add('dome', 4 * k);
          this.noseWiggle = 0.5 * k;
          if (this.did && t - this.did > 6.3 && this.depth < 0.1) this.walkTo(this.s, 0.25);
          this.actExpr = k > 0.3 ? 'focused' : null;
        },
      },
      peekBack: {
        weight: 1,
        length: [10, 12],
        when: this.still,
        start: () => {
          this.did = 0;
          this.amble(1.5, 0.95, Math.random() < 0.5 ? -1 : 1);
        },
        pose: (t) => {
          // To the back wall, up on his tiptoes (wheels), looking out at the room.
          const at = this.depth > 0.85 && !this.walking;
          if (at && !this.did) this.did = t;
          const look = at ? span(t - this.did, 0, 0.5, 5.5, 6) : 0;
          this.puppet.add('body', -6 * look);
          this.puppet.add('head', -4 * look, 24 * look * sin(t, 0.3), 0);
          for (const e of EARS) this.puppet.add(e, -15 * look);
          if (this.did && t - this.did > 6 && this.depth > 0.5) this.walkTo(this.s, 0.2);
          this.actExpr = look > 0.3 ? 'focused' : null;
        },
      },
      burrow: {
        weight: 0.9,
        length: [9, 10],
        when: this.still,
        start: () => {
          this.did = 0;
          this.stage = 0;
          this.walkTo(this.s + (Math.random() < 0.5 ? -1 : 1) * this.heightPx * 0.8, 0);
        },
        pose: (t) => {
          // Digs into the floor at the front lip, a flurry of leaf-coloured light as he
          // scoots down, a rustling mound, then pops up shaking it off.
          const p = this.puppet;
          const at = this.depth < 0.05 && !this.walking;
          if (at && !this.did) this.did = t;
          const s = at ? t - this.did : -1;
          const digging = s > 0 && s < 2.3;
          const dig = s < 0 ? 0 : ease(s, 0.4, 2.2) * (1 - ease(s, 6, 6.5));
          this.sink = 0.15 * dig;
          this.rev = digging ? 30 : 0;
          this.shake = dig > 0.05 && dig < 0.98 ? 1.5 : dig > 0.98 ? 0.6 * Math.abs(sin(t, 2)) : 0;
          p.add('head', 14 * dig);
          p.add('body', digging ? 8 * Math.sin(t * 18) : 0);
          if (s > 6.3 && this.stage === 0) {
            this.stage = 1;
            this.hopUp(0.35);
            this.puff.kick(5);
          }
          if (this.did && t - this.did > 7 && this.depth < 0.1) this.walkTo(this.s, 0.25);
          this.glow = (i, time) => [
            s > 0 && (s < 2.3 || s > 6)
              ? Math.sin(time * 18 + i * 3.1) > -0.2
                ? 1
                : 0.15
              : 0.3 + 0.25 * Math.sin(time * 3 + i),
            LEAF[Math.floor(time * 6 + i) % LEAF.length],
          ];
          this.actExpr = dig > 0.9 ? 'sleepy' : 'happy';
        },
      },
      roll: {
        weight: 0.9,
        length: [6, 7],
        when: this.still,
        start: () => {
          this.did = 0;
        },
        pose: (t) => {
          // Curls into a ball, spikes out, and rolls across the floor end over end.
          this.wantTuck = 1;
          this.wantPuff = 0.5;
          this.speed = 2.4;
          if (t > 0.9 && !this.did) {
            this.did = 1;
            const [w, room] = this.room();
            this.dir = w;
            this.walkTo(this.s + w * Math.max(0, Math.min(room, this.heightPx * 4.5)), this.depth);
          }
          if (t > this.actLength - 1.2) this.goal = null;
          this.roll = this.did && this.walking ? this.dir : 0;
          this.actExpr = 'dizzy';
          this.glow = (i, time) => [
            bump(cycle(time * 2 - this.rollA / (2 * Math.PI) - i / BANDS), 0.25),
            RAINBOW[i % RAINBOW.length],
          ];
        },
      },
      spin: {
        weight: 1,
        length: [3, 4],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // A happy pirouette on the spot, spikes puffing out as he whirls.
          const u = clamp((t - 0.2) / 1.8, 0, 1);
          this.turnA = 4 * Math.PI * u * u * (3 - 2 * u);
          this.wantPuff = 0.8 * Math.sin(u * Math.PI);
          this.rev = 8 * Math.sin(u * Math.PI);
          this.glow = (i, time) => [1, RAINBOW[(i + Math.floor(time * 12)) % RAINBOW.length]];
        },
      },
      hop: {
        weight: 1.2,
        length: [2.5, 3.5],
        face: 'happy',
        when: this.still,
        start: () => {
          this.stage = 0;
        },
        pose: (t) => {
          // A couple of little hops on the spot, ears flapping.
          const n = Math.floor(t / 0.9);
          if (n >= this.stage && this.stage < 3 && t > 0.2) {
            this.stage = n + 1;
            this.hopUp(0.32);
            this.puppet.kick('body', -30);
            this.puff.kick(3);
            this.puppet.kick('ear.L', 0, 0, 500);
            this.puppet.kick('ear.R', 0, 0, -500);
          }
        },
      },
    };
  }

  // ---------- Fidgets ----------

  private fidgets(): Record<string, Act> {
    return {
      shiver: {
        weight: 1.1,
        length: [2.5, 3.5],
        when: this.still,
        pose: (t) => {
          // A brrr: spikes shivering in a ripple from head to tail, tiny bounces.
          const k = this.fade(t, 0.3);
          this.shake = 2.2 * k;
          this.wantPuff = 0.35 * k;
          this.puppet.add('body', 2 * Math.sin(t * 28) * k);
          this.glow = (i, time) => [0.3 + 0.3 * Math.sin(time * 30 - i * 1.2), WHITE];
          this.actExpr = 'sad';
        },
      },
      sneeze: {
        weight: 0.9,
        length: [3.4, 3.8],
        when: this.still,
        start: () => {
          this.stage = 0;
        },
        pose: (t) => {
          // Nose twitching, head tipping back, a big breath in; then ACHOO: the spikes
          // fly out flashing, he rocks back on his wheels, and shakes his head.
          const p = this.puppet;
          const wind = ease(t, 0, 1.4);
          if (t < 1.4) {
            p.add('head', -14 * wind);
            this.wantPuff = -0.6 * wind;
            this.noseWiggle = 1;
            this.noseColour = BEACON.surprised ?? null;
            this.actExpr = 'sleepy';
            for (const e of EARS) p.add(e, -18 * wind);
          } else {
            if (this.stage === 0) {
              this.stage = 1;
              p.kick('body', -120);
              p.kick('head', 250);
              this.puff.kick(6);
              this.hopUp(0.12);
              for (const e of EARS) p.kick(e, 300);
            }
            const s = t - 1.4;
            this.wantPuff = s < 0.5 ? 1 : 0.2;
            p.add('head', 0, 14 * pulse(s, 0.4, 1.5) * Math.sin(s * 20), 0);
            this.actExpr = s < 0.6 ? 'cross' : 'neutral';
            this.glow = (_i, time) => [s < 0.7 ? (Math.sin(time * 40) > 0 ? 1 : 0.3) : 0.2, WHITE];
          }
        },
      },
      twitch: {
        weight: 1.3,
        length: [2.5, 4],
        when: this.still,
        pose: (t) => {
          // Ears flicking one at a time, a wiggle of the nose.
          const a = Math.max(0, sin(t, 1.3)) ** 4;
          const b = Math.max(0, sin(t, 1.3, 0.37)) ** 4;
          this.puppet.add('ear.L', -30 * a, 0, 30 * a);
          this.puppet.add('ear.R', -30 * b, 0, -30 * b);
          this.noseWiggle = 0.6;
        },
      },
      scan: {
        weight: 1.2,
        length: [5, 7],
        face: 'focused',
        when: this.still,
        pose: (t) => {
          // Sweeping the room with his eyes: head panning slowly one way, then the other,
          // ears swivelling, nose light blinking like a radar.
          const k = this.fade(t, 0.5);
          this.puppet.add('head', -3 * k, 42 * sin(t, 0.18) * k, 0);
          this.puppet.add('dome', 0, 8 * sin(t, 0.18) * k, 0);
          this.puppet.add('ear.L', 0, 20 * sin(t, 0.36) * k, 0);
          this.puppet.add('ear.R', 0, -20 * sin(t, 0.36) * k, 0);
          this.noseColour = Math.sin(t * 6) > 0.3 ? (BEACON.focused ?? null) : null;
        },
      },
      stretch: {
        weight: 0.9,
        length: [4.5, 5.5],
        when: this.still,
        start: () => {
          this.stage = 0;
        },
        pose: (t) => {
          // A big stretch: rocking forward onto his nose with the spikes fanned wide, then
          // back and a shake.
          const p = this.puppet;
          const k = span(t, 0.2, 1.2, this.actLength - 1.6, this.actLength - 0.6);
          p.add('body', 14 * k);
          p.add('head', -18 * k);
          this.wantPuff = 0.9 * k;
          for (const e of EARS) p.add(e, -22 * k);
          if (t > this.actLength - 1.1 && this.stage === 0) {
            this.stage = 1;
            this.puff.kick(-4);
            p.kick('dome', 0, 0, 200);
          }
          for (let i = 0; i < BANDS; i++)
            this.lift[i] = 0.01 * k * (0.5 + 0.5 * Math.sin(t * 2 - i));
          this.actExpr = k > 0.4 ? 'happy' : 'sleepy';
        },
      },
      static: {
        weight: 0.8,
        length: [5, 6],
        when: this.still,
        start: () => {
          this.did = 0;
          this.dir = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          // Rubs his wheels back and forth building up static: then the spikes stand
          // straight up, crackling white in bursts, and he looks surprised.
          const p = this.puppet;
          const up = ease(t, 2.4, 3) * (1 - ease(t, this.actLength - 0.5, this.actLength));
          this.speed = 2.5;
          if (t > 0.6 && t < 2.4 && !this.walking && this.did < 4) {
            this.did++;
            this.walkTo(
              this.s + (this.did % 2 ? 1 : -1) * this.dir * this.heightPx * 0.35,
              this.depth,
            );
          }
          this.wantPuff = 1.2 * up;
          this.shake = 1.2 * up;
          p.add('body', 3 * Math.sin(t * 9) * (1 - up));
          this.glow = (i, time) => [
            up > 0.3 ? (Math.sin(time * 50 + i * 4.7) > 0.4 ? 1 : 0.1) : 0.15 + 0.35 * up,
            up > 0.3 ? WHITE : BEACON.surprised,
          ];
          this.actExpr = up > 0.3 ? 'surprised' : 'focused';
        },
      },
    };
  }

  // ---------- Lights ----------

  private lightTricks(): Record<string, Act> {
    return {
      ripple: {
        weight: 1.1,
        length: [4, 5],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // A rainbow rolling down his spikes, each band lifting as the wave goes under it,
          // and a little dance on his wheels.
          const k = this.fade(t, 0.4);
          for (let i = 0; i < BANDS; i++) this.lift[i] = 0.012 * wave(t, i, 0.7, 0.28) * k;
          this.puppet.add('body', 0, 0, 5 * sin(t, 0.9) * k);
          this.puppet.add('head', 0, 0, -6 * sin(t, 0.9) * k);
          this.glow = (i, time) => [
            wave(time, i, 0.7, 0.34),
            RAINBOW[(i + Math.floor(time * 3)) % RAINBOW.length],
          ];
        },
      },
      count: {
        weight: 0.9,
        length: [5, 6],
        face: 'focused',
        when: this.still,
        pose: (t) => {
          // Counting off his spikes, band by band: each lights and pops up in turn, his
          // head nodding along; then all five at once.
          const beat = Math.floor(t / 0.7) % (BANDS + 2);
          for (let i = 0; i < BANDS; i++) {
            const on = beat === i || beat >= BANDS;
            this.lift[i] = on && t < this.actLength - 0.6 ? 0.012 : 0;
          }
          this.puppet.add('head', 5 * Math.max(0, sin(t, 1 / 0.7)));
          this.glow = (i) => [beat === i || beat >= BANDS ? 1 : 0.08, RAINBOW[i % RAINBOW.length]];
        },
      },
      stars: {
        weight: 0.9,
        length: [6, 8],
        when: this.still,
        pose: (t) => {
          // Head tipped right back, gazing up while his spike lights twinkle like stars.
          const k = span(t, 0.3, 1.2, this.actLength - 1.2, this.actLength - 0.3);
          this.puppet.add('head', -22 * k);
          this.puppet.add('body', -3 * k);
          this.wantPuff = -0.4 * k;
          this.glow = (i, time) => {
            const tw = Math.sin(time * (1.7 + i * 0.6) + i * 5) * Math.sin(time * 0.9 + i * 2);
            return [tw > 0.2 ? 0.4 + 0.6 * tw : 0.05, WHITE];
          };
          this.actExpr = k > 0.4 ? 'love' : null;
        },
      },
    };
  }

  // ---------- Play ----------

  private play(): Record<string, Act> {
    return {
      ball: {
        weight: 1,
        length: [9, 11],
        face: 'happy',
        when: this.still,
        start: () => {
          this.stage = 0;
          this.ballSpin = 0;
          this.ballAhead = 0;
          this.lastAhead = 0;
          const [w] = this.room();
          this.dir = Math.random() < 0.7 ? w : -w;
        },
        pose: (t) => {
          // A ball rolls out of his chassis and he bumps it along the floor with his nose,
          // trotting after it, until it rolls back in.
          const p = this.puppet;
          const going = t > 0.9 && t < this.actLength - 1.6;
          this.ballWant = t > 0.2 && t < this.actLength - 0.7 ? 1 : 0;
          this.speed = 1.1;
          if (going && this.stage === 0 && this.env) {
            this.stage = 1;
            const [lo, hi] = this.span(this.env.frame);
            const reach = this.dir > 0 ? hi - this.s : this.s - lo;
            const far = Math.max(0, Math.min(reach - this.widthPx() * 1.2, this.heightPx * 5));
            this.walkTo(this.s + this.dir * far, this.depth);
          }
          if (t > this.actLength - 1.6) this.goal = null;
          // Bump: a thrust of the nose every 1.5 s, the ball shooting ahead then slowing.
          const u = going ? cycle((t - 0.9) / 1.5) : 1;
          const push = going ? pulse(u, 0, 0.22) : 0;
          p.add('head', 18 * push);
          p.add('body', 6 * push);
          this.ballAhead = going ? 0.12 * ease(u, 0, 0.18) * (1 - ease(u, 0.3, 1) * 0.85) : 0;
        },
      },
    };
  }

  // ---------- With crewmates ----------

  private social(): Record<string, Act> {
    const somebody = () => this.still() && this.mates().length > 0;
    return {
      visit: {
        weight: 1.1,
        length: [10, 12],
        when: somebody,
        start: () => {
          this.mate = this.mates()[0] ?? null;
          this.stage = 0;
          this.did = 0;
          this.home0 = this.s;
          const m = this.mate;
          if (m) this.walkTo(m.s - this.toward(m) * this.heightPx * 1.4, m.depth);
        },
        pose: (t) => {
          // Drives up to a crewmate and gives them a good sniff, ears forward, nose going,
          // then a little hop and back home.
          const m = this.mate;
          if (!m || m.state !== 'here') return;
          const d = this.toward(m);
          if (this.stage === 0 && this.there && t > 0.5) {
            this.stage = 1;
            this.did = t;
          }
          if (this.stage === 1) {
            const s = t - this.did;
            const k = span(s, 0, 0.5, 4.2, 4.8);
            this.puppet.add('head', 14 * k + 3 * sin(s, 5) * k, 30 * d * k, 0);
            this.puppet.add('body', 6 * k, 0, 4 * d * k);
            this.noseWiggle = k;
            this.noseColour = k > 0.1 ? (BEACON.focused ?? null) : null;
            this.actExpr = 'focused';
            if (s > 4.6) {
              this.stage = 2;
              this.hopUp(0.3);
              this.walkTo(this.home0, 0.2);
            }
          }
          if (this.stage === 2) this.actExpr = 'happy';
        },
      },
      behind: {
        weight: 1,
        length: [10, 12],
        when: somebody,
        start: () => {
          this.mate = this.mates()[0] ?? null;
          this.stage = 0;
          this.home0 = this.s;
          const m = this.mate;
          if (m)
            this.walkTo(m.s + this.toward(m) * this.heightPx * 0.3, Math.min(0.95, m.depth + 0.4));
        },
        pose: (t) => {
          // Slips round behind a crewmate and hides there, tucked in, peeking out first
          // one side and then the other.
          const at = this.there && t > 1;
          if (at && this.stage === 0) this.stage = 1;
          const gone = t > this.actLength - 1.6;
          const peek = at && !gone ? Math.max(0, sin(t, 0.33)) ** 0.5 : 0;
          const side = at ? Math.sign(sin(t, 0.165)) || 1 : 1;
          this.wantTuck = at && !gone ? 1 - 0.65 * peek : 0;
          this.puppet.add('head', 0, 30 * side * peek, 0);
          this.wantPuff = at && !gone ? 0.3 : 0;
          if (gone && this.stage === 1) {
            this.stage = 2;
            this.walkTo(this.home0, 0.2);
          }
          this.glow = (_i, time) => [0.12 + 0.1 * Math.sin(time * 1.5), undefined];
          this.actExpr = peek > 0.3 ? 'surprised' : 'neutral';
        },
      },
    };
  }

  // ---------- Rests ----------

  private rests(): Record<string, Act> {
    return {
      hide: {
        weight: 0.6,
        length: [6, 8],
        when: this.still,
        pose: (t) => {
          // The shy peek-out: into his shell, then head out a little to look, in again,
          // out a bit further, and finally out for good.
          const L = this.actLength;
          const peek = t < 1.5 ? 0 : Math.max(0, sin(t - 1.5, 0.35)) ** 0.5;
          this.wantTuck = t > L - 1 ? 0 : 1 - 0.6 * peek;
          this.puppet.add('head', 0, 28 * peek * sin(t - 1.5, 0.175), 0);
          this.actExpr = peek > 0.3 ? 'surprised' : t > L - 1 ? 'neutral' : 'asleep';
        },
      },
      nap: {
        weight: 0.6,
        length: [10, 18],
        face: 'asleep',
        when: this.still,
        pose: (t) => {
          // Curled up with his spikes settling, glow breathing slowly in and out.
          this.wantTuck = 0.6;
          this.wantPuff = -0.3;
          this.puppet.add('dome', 2 * sin(t, 0.15));
          this.glow = (i, time) => [0.16 + 0.14 * Math.sin(time * 0.9 - i * 0.3), undefined];
        },
      },
    };
  }

  // ---------- Reactions ----------

  private reactions(): Record<string, Act> {
    return {
      poked: { weight: 0, length: [2.8, 3.6], face: 'surprised' },
      love: { weight: 0, length: [3, 4], face: 'love' },
      dizzy: { weight: 0, length: [4, 4] },
    };
  }

  poke() {
    if (this.state !== 'here') return;
    const now = performance.now() / 1000;
    this.pokes = [...this.pokes.filter((at) => now - at < 3), now];
    if (this.pokes.length >= 3) {
      this.pokes = [];
      this.setAct('dizzy');
    } else if (this.act !== 'dizzy') this.startle();
  }

  /** Into his shell, spikes up. */
  private startle() {
    this.goal = null;
    this.depthGoal = this.depth;
    this.puff.kick(4);
    this.tuck.kick(3);
    this.setAct('poked');
  }

  protected onEnter() {
    this.mouse = null;
    this.wheels = 0;
  }

  protected idle(t: number) {
    const p = this.puppet;
    // The dome breathing, and the head never quite still.
    p.add('dome', 1.2 * sin(t, 0.4));
    p.add('head', 2 * sin(t, 0.35), 0, 3 * sin(t, 0.13));
    // Ears drift now and then.
    const flick = Math.max(0, sin(t, 0.11)) ** 12;
    p.add('ear.L', -12 * flick, 0, 8 * flick);
    p.add('ear.R', -12 * flick, 0, -8 * flick);
    this.wantTuck = this.wantPuff = null;
    this.sink = this.turnA = this.rev = this.shake = this.noseWiggle = 0;
    this.lift.fill(0);
    this.ballWant = this.roll = 0;
    this.glow = this.noseColour = this.actExpr = null;
    this.speed = 1.6;
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    const t = this.actT;
    const act = this.act;
    this.frame = env.frame;
    this.env = env;

    // Shy of a mouse rushing past close by.
    const { x, y } = env.pointer;
    const was = this.mouse ?? { x, y, speed: 0 };
    const speed = Math.hypot(x - was.x, y - was.y) / Math.max(dt, 1e-3);
    this.mouse = { x, y, speed: was.speed + (speed - was.speed) * Math.min(1, dt * 10) };
    const eye = this.eyePoint(env.frame);
    const near = Math.hypot(x - eye.x, y - eye.y) < this.heightPx * 2.5;
    const calm = [
      'idle',
      'sniff',
      'scan',
      'twitch',
      'stars',
      'count',
      'ripple',
      'teeter',
      'stretch',
    ];
    if (
      env.pointer.present &&
      near &&
      this.mouse.speed > this.heightPx * 40 &&
      calm.includes(act) &&
      env.time > this.shyUntil
    ) {
      this.shyUntil = env.time + 8;
      this.startle();
    }

    // Petted: calm and glowing, leaning into it.
    this.hover = this.hovered ? this.hover + dt : 0;
    if (this.hover > 0.8 && calm.includes(act)) this.setAct('love');

    // How far into his shell, and how puffed up.
    let tuck = 0;
    let puff = 0;
    if (act === 'poked') {
      tuck = t < 1.8 ? 1 : 0;
      puff = t < 1.2 ? 1 : 0.3;
    } else if (act === 'love') puff = -1;
    else if (act === 'dizzy') tuck = t < 2.6 ? 0.5 : 0;
    tuck = this.wantTuck ?? tuck;
    puff = this.wantPuff ?? puff;
    const k = clamp(this.tuck.update(dt, tuck), -0.2, 1.1);
    this.tuckNow = clamp(k, 0, 1);
    this.puffNow = this.puff.update(dt, puff);

    if (act === 'dizzy') this.expression = t > 2.6 ? 'dizzy' : 'surprised';
    else this.expression = this.actExpr ?? (this.hovered ? 'happy' : 'neutral');

    // Driving: leaning back as he speeds off, dipping as he brakes; a wheelie on a dash.
    const pace = this.stride;
    const accel = (pace - Math.abs(this.lastPace)) / Math.max(dt, 1e-3) / this.heightPx;
    this.lastPace = this.pace;
    p.add('body', clamp(-accel * 1.5, -10, 10));
    if (act === 'dash' && this.walking)
      p.add('body', -16 * clamp(t / 0.3, 0, 1) * clamp(1.4 - t, 0, 1));
    // Bumping along: a little rattle in the dome at speed.
    p.add('dome', 0, 0, 1.5 * sin(env.time, 9) * Math.min(1, pace / (this.heightPx * 2)));

    // Into the shell: the head pulls in (and shrinks, in after()), the wheels fold up and
    // the chassis settles onto the line.
    p.shift('head', 0, -0.01 * k, -0.06 * k);
    p.add('head', 10 * k);
    for (const w of WHEELS) p.shift(w, 0, 0.026 * k, 0);
    p.shift('root', 0, -0.028 * k - this.sink, 0);
    if (act === 'love') p.add('root', 0, 6 * sin(t, 1.2));
    if (act === 'dizzy' && t > 2.6) p.add('head', 0, 12 * sin(t, 1.5), 10 * sin(t, 1.1));
    // Tucked, the ears lie flat.
    for (const e of EARS) p.add(e, 30 * k);

    // A dash goes faster than a scurry.
    this.spec.speed = act === 'dash' ? 3.4 : this.speed;
  }

  /** The spike tips: five bands of lights from head to tail. */
  private lights(time: number) {
    const act = this.act;
    const t = this.actT;
    let nose = this.noseColour ?? (this.hovered ? BEACON.happy : WHITE);
    for (let i = 0; i < BANDS; i++) {
      let level: number;
      let tone: string | undefined;
      if (act === 'poked') {
        // Startled: every spike flashes, then fades.
        level = clamp(1.6 - t, 0, 1) * (Math.sin(time * 30) > 0 ? 1 : 0.55);
        tone = BEACON.surprised;
        nose = BEACON.surprised;
      } else if (act === 'love') {
        // Petted: a warm glow breathing down his back.
        level = 0.55 + 0.45 * Math.sin(time * 2.5 - i * 0.7);
        tone = BEACON.love;
        nose = BEACON.love;
      } else if (act === 'dash' || (act === 'dizzy' && t < 2.6)) {
        // Off at speed: the rainbow racing along the spikes.
        level = 1;
        tone = RAINBOW[(i + Math.floor(time * 10)) % RAINBOW.length];
      } else if (act === 'dizzy') {
        // Coming out of it: colours twinkling at random.
        level = Math.sin(time * 7 + i * 2.3) > 0.2 ? 1 : 0.1;
        tone = RAINBOW[(i * 3 + Math.floor(time * 3)) % RAINBOW.length];
      } else if (this.glow) {
        [level, tone] = this.glow(i, time, t);
      } else if (act === 'sniff') {
        // On a scent: a quick green flicker, band by band.
        level = Math.sin(time * 16 - i * 1.3) > 0.4 ? 0.9 : 0.1;
        tone = BEACON.focused;
        nose = BEACON.focused;
      } else if (this.walking) {
        // Driving: running lights, head to tail.
        level = bump(cycle(time * 2) - (i / BANDS) * 0.8, 0.16);
      } else if (this.hovered) {
        // The mouse on him: quicker, warmer ripples.
        level = 0.8 * bump(cycle(time / 1.5) - i * 0.08, 0.12);
        tone = BEACON.happy;
      } else {
        // Idle: now and then a slow ripple down his back.
        level = 0.7 * bump(cycle(time / 4) - i * 0.06, 0.07);
      }
      this.outfit.dot(i, level, tone);
    }
    this.outfit.beacon(nose ?? WHITE);
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    this.lights(env.time);

    // Spikes puff up, or settle when he's petted.
    const up = Math.max(0, this.puffNow);
    const flat = Math.max(0, -this.puffNow);
    p.stretch('dome', 1 + 0.12 * up - 0.04 * flat, [0, 1, 0], 1 + 0.08 * up - 0.02 * flat);
    // The head pulls into the shell.
    const pull = 1 - 0.55 * this.tuckNow;
    p.stretch('head', pull, [0, 0, 1], pull);

    // Each band of spikes: lifting one after another, or shivering.
    for (let i = 0; i < BANDS; i++) {
      p.shift(`quill.${i}`, 0, this.lift[i] + 0.004 * up, 0);
      if (this.shake > 0)
        p.turn(
          `quill.${i}`,
          0.6 * this.shake * Math.sin(env.time * 41 + i * 1.7),
          0,
          this.shake * Math.sin(env.time * 47 + i * 1.3),
        );
    }
    if (this.shake > 0) p.turn('dome', 0, 0, this.shake * 0.8 * Math.sin(env.time * 53));
    // Nose and whiskers wiggling.
    if (this.noseWiggle > 0)
      p.turn(
        'nose',
        8 * this.noseWiggle * Math.sin(env.time * 24),
        10 * this.noseWiggle * Math.sin(env.time * 17),
        0,
      );

    // Wheels turn with the ground going by (he faces the way he drives), or spin in place.
    this.wheels += (this.stride * dt) / (WHEEL * this.px) + this.rev * dt;
    for (const w of WHEELS) p.turn(w, (this.wheels * DEG) % 360);

    // The ball: parked inside his chassis, rolls out when he wants to play.
    const out = this.ballOut.update(dt, this.ballWant);
    const ahead = 0.38 + this.ballAhead;
    const arc = 0.06 * Math.sin(Math.PI * clamp(out, 0, 1)) * this.ballWant;
    p.shift('ball', 0, -0.028 * out + arc, ahead * out);
    this.ballSpin +=
      ((this.stride * dt) / this.px + Math.abs(this.ballAhead - this.lastAhead)) / 0.03;
    this.lastAhead = this.ballAhead;
    p.turn('ball', (this.ballSpin * DEG) % 360);

    // Dizzy or spinning: round and round on the spot, easing in and out.
    if (this.act === 'dizzy') {
      const u = clamp((this.actT - 0.2) / 2.4, 0, 1);
      this.pivot.rotation.y = 4 * Math.PI * u * u * (3 - 2 * u);
    } else this.pivot.rotation.y = this.turnA;

    // Rolled up in a ball: end over end while he drives, settling upright when he stops.
    if (this.roll !== 0 && this.walking)
      this.rollA -= (this.roll * this.stride * dt) / (this.px * 0.17);
    else {
      const home = Math.round(this.rollA / (2 * Math.PI)) * (2 * Math.PI);
      this.rollA += (home - this.rollA) * Math.min(1, dt * 7);
      if (Math.abs(this.rollA - home) < 1e-3) this.rollA = 0;
    }
    // About the middle of his body (where the pivot is), not his feet.
    const c = this.spec.metres * 0.45;
    this.model.rotation.z = this.rollA;
    this.model.position.x = c * Math.sin(this.rollA);
    this.model.position.y = -c * Math.cos(this.rollA);
  }
}
