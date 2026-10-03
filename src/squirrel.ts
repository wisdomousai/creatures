import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import {
  type Act,
  ANGLE,
  Character,
  clamp,
  type Edge,
  type Env,
  envelope,
  type Frame,
  rand,
} from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import { Spring } from './spring';

/**
 * Chip, the robot squirrel: a small toy on big thigh discs and long flat feet, with a
 * screen face, buck teeth, tufted ears, a pod in each cheek, and a huge tail made of
 * soft plates on five bones that curls up over his back like a question mark. He is
 * quick and twitchy: he scampers in short dashes on all fours and freezes dead still in
 * between, sits up on his haunches to nibble a hex nut in his paws, and stuffs it into
 * his cheeks until they are round. The nut is built into him (on its own bone, scaled
 * to nothing when he isn't using it): he also buries it in the floor and forgets where,
 * tosses and catches it, and shows off with tail-flicks, a tail whirling like a
 * propeller, an umbrella tail, or a flat-out sunbathe.
 *
 * He is the one who uses the side edges of the frame: he leaps from the floor onto the
 * left or right one, runs up it, hangs head-down against it looking at us, or does a
 * wall-kick and a flip back to the floor.
 *
 * Every plate of the tail has a light on each side, in five bands from root to tip
 * (the cheek pods share the tip band): a ripple runs up it now and then, running
 * lights as he dashes, the beat of his chatter, a strobe for the alarm.
 *
 * There is a heap of dirt on its own bone that he churns up when he digs, and a tool
 * pouch on his belt. More tricks: a frantic dig, sitting bolt upright to scan, three
 * tail-flicks with the lights racing, freezing mid-step on one foot, gobbling the nut,
 * spinning it on a fingertip, a spiral chase round a crewmate, a long leap across the
 * floor, hanging off the front lip, and peeking round his own tail.
 *
 * A poke and he jumps with his tail puffed up; three and he is dizzy. Rest the mouse on
 * him and he goes soft and pleased.
 */
export const SQUIRREL_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.3, 0.5],
    [0.7, 0.5],
  ],
  rx: 0.1,
  ry: 0.3,
  line: 0.036,
  mouth: null,
};

const DEG = 180 / Math.PI;
/** The pivot (his middle) as a share of his height, as in Character. */
const MIDDLE = 0.45;
const BANDS = 5;
const TAIL = ['tail.1', 'tail.2', 'tail.3', 'tail.4', 'tail.5'];

type Point = { x: number; y: number };
/** Away from an edge, into the page, in viewport px (y down). */
const inward = (a: number): Point => ({ x: -Math.sin(a), y: -Math.cos(a) });
const bump = (x: number, width: number) => Math.max(0, 1 - Math.abs(x) / width);
const cycle = (x: number) => x - Math.floor(x);
const smooth = (x: number) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};
/** The up-and-down of a jump, 0 at either end. */
const arch = (u: number) => 4 * u * (1 - u);

/** One stretch of a flight off the edges: where his middle goes, and how he is tipped. */
interface Leg extends Point {
  tilt: number;
  time: number;
  /** How high it arcs, in his heights. */
  arc?: number;
  /** Extra turns on the way (radians): a flip. */
  spin?: number;
  /** Stays put (a hold), or lands on an edge at the end. */
  hold?: boolean;
  land?: { edge: Edge; s: number };
  /** Touches a wall at the end (a kick). */
  touch?: boolean;
  pose: 'crouch' | 'fly' | 'hang';
}

export class Squirrel extends Character {
  /** What the acts want this frame (reset in idle, then sprung in pose). */
  private want = {
    crouch: 0,
    sploot: 0,
    cheek: 0,
    nut: 0,
    dirt: 0,
    curl: 0,
    fluff: 0,
    hop: 0,
    sway: 6,
    hz: 0.45,
    wave: 0.8,
  };
  private crouch = new Spring(5, 0.65);
  private sploot = new Spring(3, 0.7);
  private cheek = new Spring(5, 0.45);
  private nutSize = new Spring(8, 0.6);
  private dirt = new Spring(9, 0.5);
  private curl = new Spring(4, 0.5);
  private fluff = new Spring(5, 0.4);
  private nutShift = { y: 0, spin: 0 };
  private tailPhase = 0;
  private whirl = 0;
  private whirlSpeed = 0;
  private time = 0;
  private env: Env | null = null;
  private nextTwitch = 1;
  private pokes: number[] = [];
  private hover = 0;
  private buried = false;
  private stage = -1;
  private flicked = false;
  private looks: { yaw: number; pitch: number; at: number }[] = [];
  private buddy: Character | null = null;
  private peerDepth = 0.95;
  private beat = 0;
  /** Flying between edges: the legs to go, the one under way. */
  private plan: Leg[] = [];
  private from: Point = { x: 0, y: 0 };
  private tiltFrom = 0;
  private legT = 0;
  private exiting = false;
  private flying: Leg['pose'] | null = null;
  private launched = false;

  constructor(model: Object3D) {
    super(
      {
        name: 'Chip',
        model: 'squirrel',
        metres: 0.56,
        width: 0.34,
        size: 0.95,
        feels: {
          default: { f: 4.5, zeta: 0.5 },
          body: { f: 3.5, zeta: 0.5 },
          head: { f: 4.5, zeta: 0.5, r: 0.5 },
          'ear.L': { f: 6, zeta: 0.3 },
          'ear.R': { f: 6, zeta: 0.3 },
          'tail.1': { f: 3.2, zeta: 0.4 },
          'tail.2': { f: 3.4, zeta: 0.32 },
          'tail.3': { f: 3.6, zeta: 0.3 },
          'tail.4': { f: 3.8, zeta: 0.28 },
          'tail.5': { f: 4, zeta: 0.25 },
        },
        face: SQUIRREL_FACE,
        eyes: 0.62,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.9 },
          { bone: 'body', yaw: 0.15, pitch: 0 },
        ],
        reach: { yaw: 60, pitch: 30 },
        lag: 1.8,
        entrance: 'walk',
        edges: ['bottom', 'bottom', 'bottom', 'left', 'right'],
        stay: [40, 90],
        speed: 2.4,
        turn: 65,
      },
      model,
    );
    this.acts = this.moves();
  }

  // ---------- The acts ----------

  private moves(): Record<string, Act> {
    const p = this.puppet;
    const H = () => this.heightPx;
    const still = () => !this.walking && !this.free;
    const floor = () => still() && this.edge === 'bottom';
    const side = () => still() && this.edge !== 'bottom';
    const arms = (l: number, r = l, yl = 0, yr = -yl) => {
      p.add('arm.L', l, yl);
      p.add('arm.R', r, yr);
    };
    return {
      idle: { weight: 3, length: [3, 6] },
      scamper: {
        weight: 3,
        length: [3, 5],
        when: () => !this.free,
        start: () => {
          this.stage = -1;
        },
        pose: (t) => {
          // Dash, freeze, dash: a stop is dead still, head up, tail arched.
          const stage = Math.floor(t / 1.1);
          if (stage !== this.stage) {
            this.stage = stage;
            if (stage % 2 === 0) this.dash();
            else this.goal = null;
          }
          if (!this.walking && stage % 2 === 1) {
            this.want.crouch = 0.55;
            this.want.sway = 0;
            this.want.curl = 12;
            p.add('head', -12);
            if (t - stage * 1.1 > 0.55 && !this.flicked) {
              this.flicked = true;
              this.flick();
            }
          } else this.flicked = false;
        },
      },
      freeze: {
        weight: 1.6,
        length: [2.5, 4],
        face: 'focused',
        when: still,
        start: () => (this.flicked = false),
        pose: (t) => {
          // Stock still, ears straight up, and then one big flick of the tail.
          this.want.sway = 0;
          this.want.curl = 14;
          p.add('head', -7);
          p.add('ear.L', -6, 0, 6);
          p.add('ear.R', -6, 0, -6);
          if (t > this.actLength - 0.7 && !this.flicked) {
            this.flicked = true;
            this.flick();
            p.kick('head', -70, 0, 0);
          }
        },
      },
      look: {
        weight: 2.6,
        length: [3, 5],
        when: still,
        start: () => {
          let at = 0.2;
          this.looks = Array.from({ length: 7 }, () => {
            const look = { yaw: rand([-55, 55]), pitch: rand([-14, 12]), at };
            at += rand([0.35, 0.9]);
            return look;
          });
        },
        pose: (t) => {
          // Sharp little turns of the head, each held a beat, the ears swivelling.
          const look = [...this.looks].reverse().find((l) => l.at <= t);
          if (look) {
            p.add('head', look.pitch, look.yaw);
            p.add('body', 0, look.yaw * 0.2);
            p.add('ear.L', 0, 0, look.yaw * 0.25);
            p.add('ear.R', 0, 0, look.yaw * 0.25);
          }
          this.want.sway = 3;
        },
      },
      nibble: {
        weight: 2.2,
        length: [4, 6],
        face: 'focused',
        when: still,
        pose: (t) => {
          // The nut up at his mouth, fast little bites in bursts, a glance up between.
          const k = envelope(t, this.actLength, 0.4);
          const burst = Math.max(0, sin(t, 0.55)) > 0.2 ? 1 : 0;
          this.want.nut = 1;
          arms(-50 * k + 3 * sin(t, 9) * burst, -50 * k - 3 * sin(t, 9) * burst, -12 * k);
          p.add('head', 10 * k + 6 * sin(t, 9) * burst * k);
          this.want.cheek = 0.15 * burst;
          if (!burst) p.add('head', -8, 25 * sin(t, 0.55));
          this.want.sway = 3;
        },
      },
      stuff: {
        weight: 1.5,
        length: [6.5, 8],
        when: still,
        pose: (t) => {
          // Bite by bite the nut goes into his cheeks, until they are round.
          const len = this.actLength;
          const eating = clamp((t - 0.6) / 3.6, 0, 1);
          this.want.nut = t < 4.3 ? 1 - eating : 0;
          const bite = t < 4.3 ? 0.5 + 0.5 * sin(t, 0.95, -0.25) : 0;
          arms(-50 * bite - 6, -50 * bite - 6, -10 * bite);
          this.want.cheek = eating * (t < len - 1.5 ? 1 : 1 - (t - (len - 1.5)) / 1.5) * 0.98;
          if (t >= 4.3 && t < len - 1.5) {
            // Patting the full cheeks, chewing.
            arms(-40 + 6 * sin(t, 3), -40 - 6 * sin(t, 3), 24, -24);
            p.add('head', 3 * sin(t, 4.5), 0, 5 * sin(t, 2.2));
            this.expression = 'happy';
          } else this.expression = 'focused';
          this.want.sway = 3;
        },
      },
      bury: {
        weight: 1.3,
        length: [7, 8],
        when: floor,
        start: () => {
          this.stage = -1;
        },
        pose: (t) => {
          // Down on all fours, dig, drop the nut in, pat it down, and a sneaky look round.
          const dig = t > 0.8 && t < 2.6;
          const pat = t >= 3 && t < 4.6;
          const look = t >= 4.6;
          this.want.crouch = look ? 0 : 1;
          this.want.nut = t < 2.7 ? 1 : 0;
          this.nutShift.y = t < 2.7 ? -0.03 - 0.05 * smooth((t - 2.2) / 0.5) : 0;
          if (t < 0.8) arms(-6);
          if (dig || (t >= 3 && t < 4))
            this.want.dirt = dig ? 0.6 + 0.4 * Math.abs(sin(t, 2.25)) : 0.7;
          if (dig) {
            p.add('arm.R', 22 * sin(t, 4.5));
            p.add('arm.L', -8);
            p.add('head', 10 * sin(t, 4.5, 0.25));
            p.add('body', 3 * sin(t, 4.5));
          }
          if (t >= 2.6 && t < 3) arms(8);
          if (pat) {
            p.add('arm.L', 25 * Math.max(0, sin(t, 2.6)));
            p.add('arm.R', 25 * Math.max(0, -sin(t, 2.6)));
            p.add('head', 6 * sin(t, 2.6));
          }
          if (look) {
            this.expression = 'wink';
            const at = t - 4.6;
            p.add('head', -6, 45 * Math.sign(sin(at, 0.7)) * (at > 0.3 ? 1 : 0));
            p.add('ear.L', -6, 0, 6);
            p.add('ear.R', -6, 0, -6);
          }
          if (t > 3) this.buried = true;
        },
      },
      search: {
        weight: 1.1,
        length: [8.5, 8.5],
        when: floor,
        start: () => {
          this.stage = -1;
        },
        pose: (t) => {
          // Snuffling about, digging here and there, arms spread in a shrug; if he did
          // bury it, at last he finds it and tosses it up.
          const stage = Math.min(3, Math.floor(t / 1.7));
          if (stage !== this.stage) {
            this.stage = stage;
            if (stage < 3)
              this.walkTo(this.s + (Math.random() < 0.5 ? -1 : 1) * H() * rand([0.5, 1.2]));
          }
          const lt = t - stage * 1.7;
          if (stage < 3) {
            this.want.crouch = 1;
            if (lt < 0.5) p.add('head', 8 * sin(t, 5));
            else if (lt < 1.4) {
              this.want.dirt = 0.5 + 0.4 * Math.abs(sin(t, 2.5));
              p.add('arm.L', 22 * sin(t, 5));
              p.add('arm.R', -22 * sin(t, 5));
              p.add('head', 8 * sin(t, 5, 0.25));
            } else {
              this.want.crouch = 0;
              p.add('head', -4, 30 * sin(lt, 1.2));
              arms(6, 6, 24, -24);
              this.expression = 'sad';
            }
          } else if (this.buried) {
            const at = t - 5.1;
            this.want.crouch = at < 1.3 ? 1 : 0;
            if (at < 1.3) {
              this.want.dirt = 0.5 + 0.4 * Math.abs(sin(t, 2.5));
              p.add('arm.L', 26 * sin(t, 5));
              p.add('arm.R', -26 * sin(t, 5));
            } else {
              const u = clamp((at - 1.3) / 0.9, 0, 1);
              this.want.nut = 1;
              this.nutShift.y = 0.3 * arch(u);
              this.nutShift.spin = u * 900;
              this.want.hop = arch(u) * 0.4;
              arms(-40 * envelope(at - 1.3, 2, 0.2), undefined, -10);
              if (at > 3.2) this.buried = false;
              this.expression = 'happy';
            }
          } else {
            this.want.crouch = 0;
            arms(10, 10, 32, -32);
            p.add('head', 0, 0, 10 * sin(t, 1));
            this.expression = 'sad';
          }
        },
      },
      chatter: {
        weight: 1.3,
        length: [3, 4.5],
        face: 'cross',
        when: still,
        pose: (t) => {
          // Scolding: the head bobbing, fists shaking, and the tail flicking in time.
          const k = envelope(t, this.actLength, 0.3);
          this.beat = sin(t, 3.5);
          p.add('head', 9 * k * this.beat, 0, 3 * k * sin(t, 1.7));
          arms(-32 + 8 * this.beat, -32 - 8 * this.beat, -6);
          this.want.sway = 24 * k;
          this.want.hz = 3.5;
          this.want.wave = 0.5;
          this.want.hop = 0.03 * Math.max(0, this.beat);
        },
      },
      tailWave: {
        weight: 1.3,
        length: [3, 4.5],
        face: 'happy',
        when: still,
        pose: (t) => {
          // A slow wave rolling up the tail, showing it off.
          const k = envelope(t, this.actLength, 0.5);
          this.want.sway = 30 * k;
          this.want.hz = 0.85;
          this.want.wave = 1;
          p.add('head', -3, 8 * sin(t, 0.85, 0.2));
          arms(2);
        },
      },
      boing: {
        weight: 1,
        length: [2.6, 3.2],
        face: 'happy',
        when: still,
        pose: (t) => {
          // Three hops on the spot, tail waving, arms up.
          const u = cycle(t / 0.85);
          const hop = t < 0.2 || t > 2.6 ? 0 : arch(u);
          this.want.hop = hop * 0.45;
          this.want.crouch = u < 0.15 ? 0.3 : 0;
          arms(-30 * hop - 10);
          this.want.sway = 18;
          this.want.hz = 1.2;
        },
      },
      whirl: {
        weight: 0.8,
        length: [3.5, 4],
        face: 'happy',
        when: still,
        pose: (t) => {
          // The tail whirling round like a propeller.
          const k = envelope(t, this.actLength, 0.9);
          this.whirlSpeed = 900 * k;
          p.add('head', 0, 0, 4 * sin(t, 1.2));
          this.want.sway = 0;
          if (t > this.actLength - 0.8) this.expression = 'dizzy';
        },
      },
      wash: {
        weight: 1.4,
        length: [4, 5.5],
        face: 'happy',
        when: still,
        pose: (t) => {
          // Both paws over the face, round and round, and over the ears.
          const k = envelope(t, this.actLength, 0.4);
          const stroke = sin(t, 2.6);
          arms(-56 * k + 12 * stroke * k, -56 * k - 12 * stroke * k, -16 * k, 16 * k);
          p.add('head', 6 * k * sin(t, 2.6, 0.25), 0, 7 * k * sin(t, 1.3));
          if (t > 2.5) {
            p.add('ear.L', 0, 0, 25 * Math.max(0, sin(t, 1.3)));
            p.add('ear.R', 0, 0, -25 * Math.max(0, -sin(t, 1.3)));
          }
          this.want.sway = 3;
        },
      },
      umbrella: {
        weight: 0.8,
        length: [5, 6.5],
        when: still,
        pose: (t) => {
          // The tail folded forward over his head, fluffed out wide; he peers out.
          const k = smooth(t / 0.8) * smooth((this.actLength - t) / 0.6);
          this.want.curl = 10 * k;
          this.want.fluff = 0.15 * k;
          this.want.sway = 2;
          p.add('head', -14 * k, 12 * sin(t, 0.3), 0);
          arms(6, 6, 6, -6);
          this.expression = t < 2 ? 'sad' : 'happy';
          if (t > 2.2 && t < 2.7) p.kick('head', 0, 0, 200);
        },
      },
      sunbathe: {
        weight: 0.9,
        length: [8, 11],
        when: floor,
        pose: (t) => {
          // Splooted flat, legs out behind, tail laid out, eyes shut.
          this.want.sploot = smooth(t / 0.9) * smooth((this.actLength - t) / 1);
          this.want.sway = 2;
          this.want.hz = 0.2;
          this.want.curl = -8 * this.want.sploot;
          this.expression = this.want.sploot > 0.9 ? 'asleep' : 'sleepy';
          this.want.cheek = 0.1 * sin(t, 0.25);
        },
      },
      alarm: {
        weight: 0.8,
        length: [3, 4],
        face: 'surprised',
        when: still,
        pose: (t) => {
          // Stomping and the tail up straight like a flag, flicking.
          const k = envelope(t, this.actLength, 0.25);
          const stomp = sin(t, 3.2);
          p.add('leg.L', -30 * Math.max(0, stomp) * k);
          p.add('leg.R', -30 * Math.max(0, -stomp) * k);
          this.want.hop = 0.03 * Math.max(0, Math.abs(stomp) - 0.8) * 5;
          this.want.curl = -6 * k;
          this.want.sway = 16 * k;
          this.want.hz = 5;
          this.want.wave = 0.4;
          arms(-10, -10, 22, -22);
          p.add('head', -6, 0, 4 * sin(t, 3.2));
          if (t > 1.2) this.expression = 'cross';
        },
      },
      peek: {
        weight: 0.9,
        length: [7, 8],
        when: () =>
          floor() &&
          (this.env?.crew ?? []).some(
            (o) => o !== this && o.state === 'here' && o.edge === 'bottom',
          ),
        start: () => {
          this.buddy = null;
          const others = (this.env?.crew ?? []).filter(
            (o) => o !== this && o.state === 'here' && o.edge === 'bottom',
          );
          this.buddy = others[Math.floor(Math.random() * others.length)] ?? null;
          if (!this.buddy) return;
          const room = this.spaceTo(this.buddy, this.env!.frame);
          const way = this.s < this.buddy.s ? -1 : 1;
          this.walkTo(this.buddy.s + way * room.rx * 1.05, this.buddy.depth);
        },
        pose: (t) => {
          // Sidles up to a crewmate and peers round it, then wonders at us.
          const b = this.buddy;
          if (!b || this.walking) return void (this.want.crouch = 1);
          const toward = Math.sign(b.s - this.s) || 1;
          const turned = t < 5 ? toward : 0;
          p.add('body', 0, 0, -10 * toward * (t < 5 ? 1 : 0));
          p.add('head', -6, 40 * turned * (this.edge === 'bottom' ? 1 : -1) * 0, 8 * toward);
          p.add('ear.L', -8, 0, 8);
          p.add('ear.R', -8, 0, -8);
          this.want.curl = 10;
          this.expression = t < 5 ? 'focused' : 'wink';
          this.want.sway = 5;
          if (t > 5.2) this.buddy = null;
        },
      },
      peer: {
        weight: 0.9,
        length: [7, 8],
        when: floor,
        start: () => {
          this.peerDepth = Math.random() < 0.6 ? 0.95 : 0;
          this.walkTo(this.s, this.peerDepth);
        },
        pose: (t) => {
          // To the back wall to peer out into the far, or to the front lip to look over it.
          if (t > this.actLength - 2.2 && this.goal === null && this.depthGoal === this.peerDepth)
            this.walkTo(this.s, 0.2);
          if (this.walking) return;
          this.want.crouch = 0;
          if (this.peerDepth === 0) {
            p.add('body', 20);
            p.add('head', 14 + 3 * sin(t, 0.4));
            arms(30, 30, 14, -14);
            this.expression = 'surprised';
          } else {
            arms(-78, 4, 0, 0);
            p.add('head', -4, 35 * sin(t, 0.3));
            this.expression = 'focused';
          }
        },
      },
      toss: {
        weight: 1.3,
        length: [5, 6.5],
        face: 'happy',
        when: still,
        pose: (t) => {
          // Throws the nut up and catches it, again and again.
          const T = 1.15;
          const u = cycle(t / T);
          this.want.nut = 1;
          const flight = t < 0.6 ? 0 : arch(clamp((u - 0.05) / 0.9, 0, 1));
          this.nutShift.y = 0.32 * flight;
          this.nutShift.spin = 720 * flight;
          const up = Math.sin(Math.PI * clamp((u - 0.05) / 0.9, 0, 1));
          arms(-44 * (1 - up) - 10 * up, undefined, -8);
          p.add('head', -22 * up * (t < 0.6 ? 0 : 1));
          this.want.hop = 0.05 * Math.max(0, 1 - u * 6);
          if (u > 0.4 && u < 0.6 && t > 0.6) this.expression = 'surprised';
        },
      },
      lookout: {
        weight: 1,
        length: [4, 5.5],
        face: 'focused',
        when: still,
        pose: (t) => {
          // Up tall, a paw shading his eyes, scanning far off.
          const k = envelope(t, this.actLength, 0.4);
          p.add('arm.R', -82 * k, 0);
          p.add('head', -8 * k, 40 * k * sin(t, 0.25));
          p.add('body', -4 * k);
          this.want.sway = 3;
        },
      },
      dance: {
        weight: 0.8,
        length: [4, 5.5],
        face: 'happy',
        when: still,
        pose: (t) => {
          // A little shuffle: feet lifting in turn, paws up and down, tail swinging.
          const k = envelope(t, this.actLength, 0.4);
          const beat = sin(t, 1.8);
          p.add('leg.L', -22 * Math.max(0, beat) * k);
          p.add('leg.R', -22 * Math.max(0, -beat) * k);
          p.add('body', 0, 0, 7 * beat * k);
          p.add('head', 3 * Math.abs(beat), 0, -6 * beat * k);
          arms(-36 * (0.5 + 0.5 * beat), -36 * (0.5 - 0.5 * beat), 8);
          this.want.sway = 26 * k;
          this.want.hz = 0.9;
          this.want.hop = 0.03 * Math.abs(beat);
        },
      },
      wave: {
        weight: 0.8,
        length: [2.5, 3.2],
        face: 'happy',
        when: () => still() && !!this.env?.pointer.present,
        pose: (t) => {
          const k = envelope(t, this.actLength, 0.3);
          p.add('arm.R', -95 * k, 0, 0);
          p.add('arm.R', 0, 22 * k * sin(t, 3.5));
          p.add('head', 0, 0, -8 * k);
          this.want.sway = 12;
        },
      },
      stretch: {
        weight: 0.8,
        length: [3.5, 4.5],
        when: floor,
        pose: (t) => {
          // Front down, paws stretched out ahead, and a big yawn.
          const k = smooth(t / 0.7) * smooth((this.actLength - t) / 0.6);
          p.add('body', 46 * k);
          p.add('head', -34 * k);
          arms(-70 * k, -70 * k, 0);
          this.want.curl = -6 * k;
          this.want.cheek = 0.5 * k * (t > 1.2 && t < 2.6 ? 1 : 0);
          this.expression = t > 1.2 && t < 2.6 ? 'sleepy' : 'happy';
        },
      },
      nap: {
        weight: 0.7,
        length: [10, 15],
        face: 'asleep',
        when: still,
        pose: (t) => {
          // Curled up, the tail wrapped round him like a blanket, breathing slowly.
          const k = smooth(t / 1.5) * smooth((this.actLength - t) / 1);
          p.add('body', 26 * k + sin(t, 0.28) * 1.5);
          p.add('head', 34 * k);
          arms(14 * k, 14 * k, 8 * k, -8 * k);
          this.want.curl = 20 * k;
          this.want.fluff = 0.15 * k;
          this.want.sway = 0.8;
          this.want.hz = 0.14;
        },
      },
      sniff: {
        weight: 1.3,
        length: [3, 4.5],
        face: 'focused',
        when: floor,
        start: () => {
          this.stage = -1;
        },
        pose: (t) => {
          // Nose to the floor, snuffling along in tiny steps.
          const stage = Math.floor(t / 1.2);
          if (stage !== this.stage) {
            this.stage = stage;
            this.walkTo(this.s + (Math.random() < 0.5 ? -1 : 1) * H() * 0.35, this.depth);
          }
          this.want.crouch = 1;
          p.add('head', 8 * sin(t, 5.5));
          p.add('ear.L', 0, 0, 5 * sin(t, 5.5));
          this.want.sway = 8;
        },
      },
      shake: {
        weight: 0.8,
        length: [1.6, 2],
        when: still,
        pose: (t) => {
          // A quick shake from head to tail, like a wet dog.
          const k = envelope(t, this.actLength, 0.15);
          p.add('body', 0, 6 * k * sin(t, 9));
          p.add('head', 0, 8 * k * sin(t, 9, 0.2), 4 * k * sin(t, 9.3));
          p.add('ear.L', 0, 0, 20 * k * sin(t, 12));
          p.add('ear.R', 0, 0, 20 * k * sin(t, 12, 0.5));
          this.want.sway = 30 * k;
          this.want.hz = 9;
          this.want.wave = 0.6;
          this.want.fluff = 0.25 * k;
        },
      },
      dig: {
        weight: 1,
        length: [4.5, 6],
        face: 'focused',
        when: floor,
        pose: (t) => {
          // A frantic nut-bury: down on all fours, both paws flinging dirt behind, the
          // nut stuffed in, and a quick pat.
          const k = envelope(t, this.actLength, 0.35);
          const flurry = t < this.actLength - 1.1;
          this.want.crouch = 1;
          this.want.nut = t < 1 ? 1 : 0;
          if (flurry) {
            p.add('arm.L', 30 * k * sin(t, 7));
            p.add('arm.R', -30 * k * sin(t, 7));
            p.add('head', 10 * k * sin(t, 7, 0.25));
            p.add('body', 4 * k * sin(t, 7));
            this.want.dirt = 0.7 + 0.3 * Math.abs(sin(t, 3.5));
            this.want.hop = 0.02 * Math.max(0, sin(t, 7));
          } else {
            p.add('arm.L', 20 * Math.max(0, sin(t, 3)));
            p.add('arm.R', 20 * Math.max(0, -sin(t, 3)));
            this.want.dirt = 0.3;
            this.expression = 'happy';
          }
          this.want.sway = 12;
          this.want.hz = 2.5;
        },
      },
      scan: {
        weight: 1,
        length: [5, 7],
        face: 'focused',
        when: still,
        pose: (t) => {
          // Sits bolt upright on tiptoe, tail stiff, and scans in three sharp sweeps.
          const k = envelope(t, this.actLength, 0.5);
          const sweep = Math.floor(t / 1.5) % 3;
          const to = [-50, 45, 0][sweep] * k;
          p.add('body', -8 * k);
          p.add('head', -10 * k, to);
          p.add('ear.L', -8, 0, to * 0.2);
          p.add('ear.R', -8, 0, to * 0.2);
          arms(6, 6, 20, -20);
          this.want.curl = -14 * k;
          this.want.sway = 1;
        },
      },
      tailAlert: {
        weight: 0.9,
        length: [3.2, 3.6],
        face: 'surprised',
        when: still,
        start: () => (this.stage = -1),
        pose: (t) => {
          // The tail flicks three times, the lights racing up it each time.
          const stage = Math.floor((t - 0.4) / 0.8);
          if (t > 0.4 && stage !== this.stage && stage < 3) {
            this.stage = stage;
            this.flick();
            p.kick('head', -40, 0, 0);
          }
          const k = envelope(t, this.actLength, 0.25);
          this.want.curl = -8 * k;
          this.want.sway = 5;
          this.want.fluff = 0.2 * k;
          p.add('ear.L', -6, 0, 4);
          p.add('ear.R', -6, 0, -4);
          arms(-14, -14, 14, -14);
        },
      },
      midStep: {
        weight: 1,
        length: [3.5, 4.5],
        face: 'surprised',
        when: floor,
        start: () => {
          this.flicked = false;
          this.walkTo(this.s + (Math.random() < 0.5 ? -1 : 1) * H() * 0.7);
        },
        pose: (t) => {
          // Caught mid-step: one foot up, a paw up, dead still, then a slow blink of relief.
          if (this.walking) {
            this.want.crouch = 0.6;
            return;
          }
          this.goal = null;
          const k = envelope(t, this.actLength, 0.25);
          this.want.crouch = 0.5;
          this.want.sway = 0;
          this.want.curl = 12;
          p.add('leg.L', -45 * k);
          p.add('arm.L', -28 * k);
          p.add('head', -10 * k);
          if (t > this.actLength - 1 && !this.flicked) {
            this.flicked = true;
            this.flick();
          }
          this.expression = t > this.actLength - 1 ? 'happy' : 'surprised';
        },
      },
      gobble: {
        weight: 1,
        length: [4, 5],
        face: 'focused',
        when: still,
        pose: (t) => {
          // The nut gnawed at top speed, the whole head shaking with it, cheeks pulsing.
          const k = envelope(t, this.actLength, 0.3);
          this.want.nut = 1;
          arms(-52 * k, -52 * k, -12 * k);
          p.add('head', 12 * k + 5 * k * sin(t, 14));
          p.add('body', 1.5 * k * sin(t, 14, 0.2));
          this.want.cheek = 0.2 + 0.2 * Math.abs(sin(t, 7));
          this.want.sway = 2;
          this.want.hz = 3;
          if (t > this.actLength - 0.8) this.expression = 'happy';
        },
      },
      nutSpin: {
        weight: 0.9,
        length: [5, 6],
        face: 'happy',
        when: still,
        pose: (t) => {
          // The nut spinning on a fingertip like a basketball, his eyes on it.
          const k = envelope(t, this.actLength, 0.4);
          this.want.nut = 1;
          this.nutShift.y = 0.075 * k;
          this.nutShift.spin = t * 900;
          arms(-84 * k, -70 * k, -8);
          p.add('arm.L', 5 * sin(t, 2) * k);
          p.add('head', -22 * k, 0, 5 * sin(t, 0.6));
          this.want.sway = 6;
          this.want.wave = 1.2;
          if (t > this.actLength - 0.6) this.expression = 'surprised';
        },
      },
      spiral: {
        weight: 0.9,
        length: [8, 8],
        face: 'happy',
        when: () =>
          floor() &&
          (this.env?.crew ?? []).some(
            (o) => o !== this && o.state === 'here' && o.edge === 'bottom',
          ),
        start: () => {
          this.stage = -1;
          const others = (this.env?.crew ?? []).filter(
            (o) => o !== this && o.state === 'here' && o.edge === 'bottom',
          );
          this.buddy = others[Math.floor(Math.random() * others.length)] ?? null;
        },
        pose: (t) => {
          // A spiral chase round a crewmate: round and round, front and back of them.
          const b = this.buddy;
          if (!b || b.state !== 'here') return;
          const stage = Math.floor(t / 0.75);
          if (stage !== this.stage && stage < 10) {
            this.stage = stage;
            const room = this.spaceTo(b, this.env!.frame);
            const a = stage * 1.05 + (this.s < b.s ? Math.PI : 0);
            const r = 1.08 + 0.2 * (1 - stage / 10);
            this.walkTo(
              b.s + Math.cos(a) * room.rx * r,
              clamp(b.depth + Math.sin(a) * 0.4, 0.05, 0.95),
            );
          }
          this.want.curl = 6;
          this.want.sway = 12;
        },
      },
      leap: {
        weight: 1,
        length: [20, 20],
        when: floor,
        start: () => {
          const f = this.env?.frame;
          if (!f) return;
          // A long leap along the floor, the tail streaming out behind.
          const [lo, hi] = this.span(f);
          const way = this.s - lo < hi - this.s ? 1 : -1;
          const to = clamp(this.s + way * H() * rand([2.5, 4]), lo + H() * 0.6, hi - H() * 0.6);
          this.fly(
            [
              { ...this.at(this.edge, this.s), tilt: 0, time: 0.3, hold: true, pose: 'crouch' },
              {
                ...this.at('bottom', to),
                tilt: 0.25 * way * -1,
                time: 0.85,
                arc: 0.9,
                land: { edge: 'bottom', s: to },
                pose: 'fly',
              },
            ],
            f,
          );
        },
      },
      lipHang: {
        weight: 0.8,
        length: [7, 8],
        when: floor,
        start: () => {
          this.walkTo(this.s, 0);
        },
        pose: (t) => {
          // Up at the front lip: paws over the edge, feet kicking, hanging off it.
          if (this.walking) return;
          const k = envelope(t, this.actLength, 0.5);
          p.add('body', 42 * k);
          p.add('head', -10 * k);
          arms(-118 * k, -118 * k, 8, -8);
          p.add('leg.L', -26 * k * Math.max(0, sin(t, 1.4)));
          p.add('leg.R', -26 * k * Math.max(0, -sin(t, 1.4)));
          this.want.curl = 10 * k;
          this.want.sway = 10;
          this.expression = t < 4 ? 'focused' : 'surprised';
        },
      },
      tailPeek: {
        weight: 0.9,
        length: [6, 7],
        when: still,
        pose: (t) => {
          // Hides behind his own tail, then pops out one side to look, and back.
          const k = smooth(t / 0.7) * smooth((this.actLength - t) / 0.6);
          const out = Math.max(0, sin(t, 0.4));
          const way = Math.sign(sin(t, 0.2)) || 1;
          this.want.curl = 6 * k;
          this.want.fluff = 0.1 * k;
          this.want.sway = 2;
          // The tail swings across to one side, and he leans out round the other.
          p.add('tail.1', 0, 26 * k * out * way, 0);
          p.add('head', 6 * k * (1 - out), -40 * k * out * way, 0);
          p.add('body', 0, 0, -10 * k * out * way);
          arms(6, 6, 6, -6);
          this.expression = out > 0.3 ? 'surprised' : 'wink';
        },
      },
      // Off the floor and onto the frame's sides.
      climb: {
        weight: 1.6,
        length: [20, 20],
        when: floor,
        start: () => {
          this.launched = false;
          const f = this.env?.frame;
          if (!f) return;
          // Run to the nearer corner, then up the wall.
          const [lo, hi] = this.span(f);
          this.walkTo(
            this.s - lo < hi - this.s ? lo + this.heightPx * 0.4 : hi - this.heightPx * 0.4,
            0,
          );
        },
        pose: () => {
          if (this.launched || this.walking || this.free || !this.env) return;
          this.launched = true;
          const f = this.env.frame;
          const edge: Edge = this.s - f.left < f.right - this.s ? 'left' : 'right';
          this.fly(
            [
              { ...this.at(this.edge, this.s), tilt: 0, time: 0.3, hold: true, pose: 'crouch' },
              {
                ...this.at(edge, f.bottom - this.heightPx * 1.6),
                tilt: ANGLE[edge],
                time: 0.65,
                arc: 0.7,
                land: { edge, s: f.bottom - this.heightPx * 1.6 },
                pose: 'fly',
              },
            ],
            f,
          );
        },
      },
      parkour: {
        weight: 1.1,
        length: [20, 20],
        when: floor,
        start: () => {
          this.launched = false;
          const f = this.env?.frame;
          if (!f) return;
          const [lo, hi] = this.span(f);
          this.walkTo(
            this.s - lo < hi - this.s ? lo + this.heightPx * 0.4 : hi - this.heightPx * 0.4,
            0,
          );
        },
        pose: () => {
          // At the wall: kick off it, a flip in the air, and down again a way along.
          if (this.launched || this.walking || this.free || !this.env) return;
          this.launched = true;
          const f = this.env.frame;
          const H = this.heightPx;
          const edge: Edge = this.s - f.left < f.right - this.s ? 'left' : 'right';
          const up = f.bottom - H * 1.5;
          const away = edge === 'left' ? f.left + H * 3 : f.right - H * 3;
          this.fly(
            [
              { ...this.at(this.edge, this.s), tilt: 0, time: 0.25, hold: true, pose: 'crouch' },
              {
                ...this.at(edge, up),
                tilt: ANGLE[edge],
                time: 0.4,
                arc: 0.4,
                touch: true,
                pose: 'fly',
              },
              { ...this.at(edge, up), tilt: ANGLE[edge], time: 0.22, hold: true, pose: 'crouch' },
              {
                ...this.at('bottom', away),
                tilt: 0,
                time: 0.85,
                arc: 1.1,
                spin: edge === 'left' ? 2 * Math.PI : -2 * Math.PI,
                land: { edge: 'bottom', s: away },
                pose: 'fly',
              },
            ],
            f,
          );
        },
      },
      hang: {
        weight: 2,
        length: [20, 20],
        when: side,
        start: () => {
          const f = this.env?.frame;
          if (!f) return;
          const a = ANGLE[this.edge];
          const u = inward(a);
          const H = this.heightPx;
          const pos = this.at(this.edge, this.s);
          const hang = { x: pos.x + u.x * H * 0.3, y: pos.y + u.y * H * 0.3 };
          const tilt = Math.sign(a) * Math.PI;
          this.fly(
            [
              { ...hang, tilt, time: 0.5, arc: 0.3, pose: 'fly' },
              { ...hang, tilt, time: rand([3, 4.5]), hold: true, pose: 'hang' },
              {
                ...pos,
                tilt: a,
                time: 0.5,
                arc: 0.2,
                land: { edge: this.edge, s: this.s },
                pose: 'fly',
              },
            ],
            f,
          );
        },
      },
      home: {
        weight: 1.4,
        length: [20, 20],
        when: side,
        start: () => {
          const f = this.env?.frame;
          if (!f) return;
          const H = this.heightPx;
          const s = this.edge === 'left' ? f.left + H * 1.5 : f.right - H * 1.5;
          this.fly(
            [
              {
                ...this.at(this.edge, this.s),
                tilt: ANGLE[this.edge],
                time: 0.3,
                hold: true,
                pose: 'crouch',
              },
              {
                ...this.at('bottom', s),
                tilt: 0,
                time: 0.7,
                arc: 0.8,
                land: { edge: 'bottom', s },
                pose: 'fly',
              },
            ],
            f,
          );
        },
      },
      // Reactions
      poked: { weight: 0, length: [1.6, 1.9], face: 'surprised' },
      love: { weight: 0, length: [3, 4], face: 'love' },
      dizzy: { weight: 0, length: [4, 4] },
    };
  }

  /** A quick dash to somewhere near, along the edge. */
  private dash() {
    const f = this.env?.frame;
    if (!f) return;
    const [lo, hi] = this.span(f);
    let way = Math.random() < 0.5 ? -1 : 1;
    if (this.edge !== 'bottom') {
      // Up the wall more often than down.
      way = Math.random() < 0.7 ? -1 : 1;
    }
    const far = this.heightPx * rand([1.2, 3]);
    this.walkTo(
      clamp(this.s + way * far, lo + this.heightPx, hi - this.heightPx),
      this.edge === 'bottom' ? undefined : 0,
    );
  }

  /** The tail snaps: a hard flick to one side and back. */
  private flick() {
    const p = this.puppet;
    p.kick('tail.1', 0, 500, 0);
    p.kick('tail.2', 0, 0, -900);
    p.kick('tail.3', 0, 0, -1100);
    p.kick('tail.4', 0, 0, -1300);
    p.kick('tail.5', 0, 700, 0);
  }

  // ---------- Reactions ----------

  poke() {
    if (this.state !== 'here') return;
    const now = performance.now() / 1000;
    this.pokes = [...this.pokes.filter((at) => now - at < 3), now];
    if (this.free) {
      this.puppet.kick('head', -200, 0, 0);
      return;
    }
    if (this.pokes.length >= 3) {
      this.pokes = [];
      this.setAct('dizzy');
    } else if (this.act !== 'dizzy') {
      this.goal = null;
      this.puppet.kick('tail.2', 0, 0, 700);
      this.puppet.kick('tail.4', 0, 0, -700);
      this.fluff.kick(6);
      this.setAct('poked');
    }
  }

  leave() {
    // Asked to go in mid-air: land first.
    if (this.free && this.state === 'here') this.exiting = true;
    else super.leave();
  }

  protected onEnter() {
    this.free = null;
    this.plan = [];
    this.exiting = false;
    this.flying = null;
    this.whirl = this.whirlSpeed = 0;
    this.crouch.snap(0);
    this.sploot.snap(0);
    this.cheek.snap(0);
    this.nutSize.snap(0);
    this.dirt.snap(0);
    this.curl.snap(0);
    this.fluff.snap(0);
  }

  // ---------- Flying between edges ----------

  /** Where his feet are on an edge, standing right on the line (front of the box). */
  private on(f: Frame, edge: Edge, s: number): Point {
    return {
      bottom: { x: s, y: f.bottom },
      top: { x: s, y: f.top },
      left: { x: f.left, y: s },
      right: { x: f.right, y: s },
    }[edge];
  }

  /** His free position (feet) when his middle is where it is standing on an edge at s. */
  private at(edge: Edge, s: number): Point {
    const f = this.env!.frame;
    const c = MIDDLE * this.heightPx;
    const up = inward(ANGLE[edge]);
    const foot = this.on(f, edge, s);
    return { x: foot.x + up.x * c, y: foot.y + up.y * c + c };
  }

  private fly(legs: Leg[], f: Frame) {
    this.plan = legs;
    this.legT = 0;
    const a = ANGLE[this.edge];
    const start = this.frontFoot(f);
    const c = MIDDLE * this.heightPx;
    const up = inward(a);
    this.from = { x: start.x + up.x * c, y: start.y + up.y * c + c };
    this.free = { ...this.from, tilt: a };
    this.tiltFrom = a;
    this.depthGoal = this.depth = 0;
    this.goal = null;
  }

  private touchDown(land: { edge: Edge; s: number }) {
    this.free = null;
    this.flying = null;
    this.plan = [];
    this.edge = land.edge;
    this.s = land.s;
    this.h = 0;
    this.depth = 0;
    this.depthGoal = this.home;
    this.pace = this.vz = 0;
    this.puppet.kick('body', 60);
    this.puppet.kick('head', 90);
    this.puppet.kick('tail.3', 0, 0, 500);
    this.setAct('idle');
    if (this.exiting) {
      this.exiting = false;
      super.leave();
    }
  }

  protected move(dt: number, env: Env) {
    if (!this.free) return super.move(dt, env);
    const pos = this.free;
    const leg = this.plan[0];
    if (!leg) {
      // Nothing left to do up here: come down where he is.
      return this.touchDown({ edge: this.edge, s: this.s });
    }
    this.legT += dt;
    const u = clamp(this.legT / leg.time, 0, 1);
    const e = leg.hold ? u : smooth(u);
    this.flying = leg.pose;
    pos.x = this.from.x + (leg.x - this.from.x) * e;
    pos.y = this.from.y + (leg.y - this.from.y) * e - (leg.arc ?? 0) * this.heightPx * arch(u);
    const swing = leg.pose === 'hang' ? 0.1 * Math.sin(this.legT * 3) * Math.min(1, this.legT) : 0;
    pos.tilt = this.tiltFrom + (leg.tilt + (leg.spin ?? 0) - this.tiltFrom) * e + swing;
    this.heading.update(dt, 0);
    if (u >= 1) {
      this.from = { x: leg.x, y: leg.y };
      this.tiltFrom = leg.tilt;
      this.legT = 0;
      this.plan.shift();
      if (leg.touch) {
        this.puppet.kick('leg.L', -300);
        this.puppet.kick('leg.R', -300);
        this.puppet.kick('tail.3', 0, 0, 400);
      }
      if (leg.land) this.touchDown(leg.land);
    }
  }

  // ---------- Each frame ----------

  protected idle(t: number) {
    const p = this.puppet;
    this.want = {
      crouch: 0,
      sploot: 0,
      cheek: 0,
      nut: 0,
      dirt: 0,
      curl: 0,
      fluff: 0,
      hop: 0,
      sway: 6,
      hz: 0.45,
      wave: 0.8,
    };
    this.nutShift.y = 0;
    this.nutShift.spin = 0;
    this.whirlSpeed = 0;
    // Breathing, and the head never quite still.
    p.add('body', 0.8 * sin(t, 0.5));
    p.add('head', 1.5 * sin(t, 0.7), 2 * sin(t, 0.23), 1.5 * sin(t, 0.31));
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    const t = this.actT;
    const act = this.act;
    this.env = env;
    this.time = env.time;
    const H = this.heightPx;

    // Ears twitching now and then.
    if (env.time > this.nextTwitch) {
      this.nextTwitch = env.time + 0.8 + Math.random() * 3;
      p.kick(Math.random() < 0.5 ? 'ear.L' : 'ear.R', 0, 0, (Math.random() < 0.5 ? -1 : 1) * 500);
    }

    // The mouse resting on him: pleased.
    this.hover = this.hovered ? this.hover + dt : 0;
    if (this.hover > 0.8 && !this.free && !this.walking && (act === 'idle' || act === 'look'))
      this.setAct('love');
    if (act === 'love') {
      const k = envelope(t, this.actLength, 0.4);
      p.add('head', 4, 0, 10 * k * sin(t, 0.8));
      p.add('arm.L', -48 * k, 0, 0);
      p.add('arm.R', -48 * k, 0, 0);
      this.want.sway = 14 * k;
      this.want.hz = 0.7;
      this.want.cheek = 0.3 * k;
    } else if (this.hovered && act === 'idle') this.expression = 'happy';
    else if (act === 'idle' || act === 'scamper') this.expression = 'neutral';

    if (act === 'poked') {
      const u = clamp(t / 0.6, 0, 1);
      this.want.hop = 0.3 * arch(u);
      this.want.fluff = 0.5 * (t < 1.2 ? 1 : 0);
      this.want.curl = -10;
      p.add('head', -14);
      p.add('arm.L', -14, 0, 0);
      p.add('arm.R', -14, 0, 0);
    }
    if (act === 'dizzy') {
      this.expression = t > 2.4 ? 'dizzy' : 'surprised';
      this.want.sway = 20;
      this.want.hz = 1.4;
      p.add('head', 6 * sin(t, 1.5), 12 * sin(t, 1.1), 10 * sin(t, 0.9));
      p.add('body', 0, 0, 6 * sin(t, 1.3));
      if (t < 2.4) this.whirlSpeed = 420 * envelope(t, 2.4, 0.4);
    }

    // On all fours when he runs, bounding.
    const mv = clamp(this.stride / (H * 2), 0, 1);
    const flying = this.free ? this.flying : null;
    let crouch = Math.max(this.want.crouch, mv * 0.95);
    if (flying === 'crouch') crouch = 1;
    if (flying === 'fly') crouch = 0.35;
    if (flying === 'hang') crouch = 0;
    const k = clamp(this.crouch.update(dt, crouch), -0.2, 1.2);
    const sp = clamp(this.sploot.update(dt, this.want.sploot), -0.1, 1.1);
    const c = clamp(1 - sp, 0, 1);

    // Sitting up (0) to all fours (1): the body tips over its hips, the head keeps up.
    p.add('body', 52 * k + 84 * sp);
    p.add('head', -38 * k - 76 * sp);
    p.add('arm.L', -22 * k * c - 30 * sp, 0, 0);
    p.add('arm.R', -22 * k * c - 30 * sp, 0, 0);
    p.add('leg.L', 0, 0, 0);
    p.add('leg.R', 0, 0, 0);
    p.add('tail.1', -62 * sp);
    p.add('leg.L', 100 * sp);
    p.add('leg.R', 100 * sp);
    p.shift('root', 0, -0.075 * sp - 0.008 * k, 0);
    if (flying === 'fly') {
      p.add('arm.L', -110, 30);
      p.add('arm.R', -110, -30);
      p.add('leg.L', 30);
      p.add('leg.R', 30);
      this.want.curl = -12;
      this.want.sway = 0;
    }
    if (flying === 'hang') {
      p.add('arm.L', -120);
      p.add('arm.R', -30, 0, 0);
      this.want.curl = -20;
      this.want.sway = 3;
      this.expression = 'happy';
    }
    // Bounding: the legs and the arms swing together, the whole of him hops.
    const g = this.gait * 1.15;
    if (mv > 0.02) {
      p.add('leg.L', -30 * mv * Math.sin(g));
      p.add('leg.R', -30 * mv * Math.sin(g));
      p.add('arm.L', 26 * mv * Math.sin(g + 1.7));
      p.add('arm.R', 26 * mv * Math.sin(g + 1.7));
      p.add('body', 6 * mv * Math.cos(g * 2));
      this.want.hop = Math.max(this.want.hop, 0.12 * mv * Math.max(0, Math.sin(g + 0.6)));
      this.want.curl += 6 * mv;
      this.want.sway = Math.max(this.want.sway, 8);
      this.want.hz = 1.6;
    }
    if (!this.free) this.h = this.want.hop * H;

    this.cheek.update(dt, this.want.cheek);
    this.nutSize.update(dt, this.want.nut);
    this.dirt.update(dt, this.want.dirt);
    this.curl.update(dt, this.want.curl);
    this.fluff.update(dt, this.want.fluff);

    // The tail: curled, with a wave running up it.
    this.tailPhase += dt * 2 * Math.PI * this.want.hz;
    const curl = this.curl.y;
    const s = this.want.sway;
    TAIL.forEach((bone, i) => {
      const a = s * Math.sin(this.tailPhase - i * this.want.wave) * (0.6 + 0.2 * i);
      if (i === 0) p.add(bone, curl * 0.4, a * 0.4, 0);
      else if (i === 4) p.add(bone, curl * 0.8, a * 0.8, 0);
      else p.add(bone, curl, 0, a);
    });

    // Dizzy: round and round on the spot.
    if (act === 'dizzy' && t < 2.6) {
      const u = clamp((t - 0.2) / 2.2, 0, 1);
      this.pivot.rotation.y = 4 * Math.PI * u * u * (3 - 2 * u);
    } else this.pivot.rotation.y = 0;
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    // The tail whirling.
    this.whirl += this.whirlSpeed * dt;
    if (this.whirlSpeed === 0) this.whirl = 0;
    else p.swing('tail.1', this.whirl);
    // The cheeks swell.
    const c = 0.8 + 1.15 * clamp(this.cheek.y, -0.2, 1.1);
    for (const bone of ['cheek.L', 'cheek.R']) p.stretch(bone, c, [0, 1, 0], c);
    // The nut: there when he's using it, gone (scaled to nothing) when not.
    const n = clamp(this.nutSize.y, 0, 1.1);
    p.stretch('nut', n, [0, 1, 0], n);
    p.shift('nut', 0, this.nutShift.y, 0);
    p.turn('nut', 0, 0, this.nutShift.spin);
    // The heap of dirt by his paws: churned up while he digs, gone otherwise.
    const d = clamp(this.dirt.y, 0, 1.2);
    p.stretch('dirt', d, [0, 1, 0], d);
    // The tail fluffs out wider.
    const f = 1 + clamp(this.fluff.y, -0.2, 1);
    TAIL.forEach((bone) => p.stretch(bone, 1, [0, 1, 0], f));
    this.lights(env.time);
  }

  /** Five bands of lights up the tail (the cheeks share the tip). */
  private lights(time: number) {
    const act = this.act;
    const t = this.actT;
    for (let i = 0; i < BANDS; i++) {
      let level: number;
      let tone: string | undefined;
      if (act === 'alarm') {
        level = Math.sin(time * 22) > 0 ? 1 : 0.1;
        tone = BEACON.surprised;
      } else if (act === 'tailAlert') {
        level = bump(cycle(time * 2.2) - (i / BANDS) * 0.5, 0.2);
        tone = BEACON.surprised;
      } else if (act === 'dig' || act === 'gobble') {
        level = 0.3 + 0.7 * bump(cycle(time * 4) - (i / BANDS) * 0.6, 0.25);
      } else if (act === 'nutSpin') {
        level = 0.4 + 0.6 * Math.max(0, Math.sin(time * 10 - i * 1.3));
        tone = BEACON.happy;
      } else if (act === 'chatter') {
        level = this.beat > 0 ? 1 : 0.15;
        tone = BEACON.happy;
      } else if (act === 'whirl' || act === 'dizzy') {
        level = 1;
        tone = RAINBOW[(i + Math.floor(time * 10)) % RAINBOW.length];
      } else if (act === 'love' || act === 'dance' || act === 'boing') {
        level = 0.55 + 0.45 * Math.sin(time * 4 - i * 0.8);
        tone = act === 'love' ? BEACON.love : BEACON.happy;
      } else if (act === 'tailWave' || act === 'shake') {
        level = 0.5 + 0.5 * Math.sin(this.tailPhase - i * this.want.wave);
      } else if (act === 'nap' || act === 'sunbathe') {
        level = 0.12 + 0.1 * Math.sin(time * 0.8);
      } else if (act === 'stuff' && i === BANDS - 1) {
        level = t > 0.6 && t < 4.3 ? 0.5 + 0.5 * Math.sin(time * 8) : 0.2;
        tone = BEACON.focused;
      } else if (this.walking || this.free) {
        // Running lights, root to tip.
        level = bump(cycle(time * 2.5) - (i / BANDS) * 0.8, 0.18);
      } else if (act === 'freeze') {
        level = 0.1;
      } else {
        // A slow ripple up the tail now and then.
        level = 0.75 * bump(cycle(time / 4.5) - i * 0.07, 0.08);
      }
      this.outfit.dot(i, level, tone);
    }
  }
}
