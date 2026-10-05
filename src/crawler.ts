import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Act, Character, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import { Spring } from './spring';

/**
 * Tread, the robot crawler: a low, wide little tank on two tracks of chunky cleats, a dome
 * shell, a telescoping periscope with a binocular screen eye on top, a scoop on one arm, a
 * pincer on the other and a tray on its back for the pebbles it keeps. It is shy, diligent
 * and a collector. It trundles slowly about the floor, the cleats really running round the
 * tracks, and the periscope is its whole personality: it stretches up to peek over
 * things, sinks in when it is startled, droops when it is sleepy.
 *
 * It works. It scoops a pebble off the floor and tucks it into its tray (the tray fills up
 * over time), scoops and dumps, stacks its pebbles into a tower and takes a bow, polishes
 * the floor with its scoop, inspects a spot with the periscope right down close, beeps its
 * lights in sequence, counts its pebbles. It spins on the spot, drives in a circle, pops
 * a wheelie, rears up on its back end to look around, dances, trundles after the drone
 * (or whoever is about), peeks at a crewmate, waves shyly, salutes, hides with its back
 * to us and peeks over its shoulder, withdraws into its shell like a turtle, and falls
 * asleep with the stalk drooping. It also sulks with the periscope hanging, rocks happily on
 * its tracks, climbs over a bump nobody else can see, prods a crewmate with the pincer and looks
 * innocent, and bulldozes its pebbles along the floor.
 *
 * The lights: the tread hubs glow while it drives, the three pills on the front of the
 * shell beep in turn, the tray's status light blinks once for every pebble it counts, and
 * the beacon on the eye takes the colour of its mood. Poke it and it drops the periscope and
 * hops; three pokes and it spins dizzy. Rest the mouse on it and it stretches up toward it.
 */
export const CRAWLER_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.29, 0.5],
    [0.71, 0.5],
  ],
  rx: 0.1,
  ry: 0.29,
  line: 0.038,
  mouth: null,
};

const DEG = 180 / Math.PI;
const SIDES = [
  ['L', 1],
  ['R', -1],
] as const;
/** The cleat track (crawler.py's loop): straights of 2 * HALF joined by arcs of radius R. */
const HALF = 0.1;
const R = 0.05;
const ZC = 0.05;
const CLEATS = 16;
const LOOP = 4 * HALF + 2 * Math.PI * R;
/** How far each periscope sleeve slides up when it is stretched, metres. */
const SLIDE = 0.05;
const PILE = 3;

/** Where a cleat is on the track: (y, z) and the track's angle there (crawler.py loop). */
function loop(u: number): [number, number, number] {
  const straight = 2 * HALF;
  const arc = Math.PI * R;
  let s = (((u % 1) + 1) % 1) * LOOP;
  if (s < straight) return [-HALF + s, ZC - R, 0];
  s -= straight;
  if (s < arc) {
    const a = s / R;
    return [HALF + R * Math.sin(a), ZC - R * Math.cos(a), a];
  }
  s -= arc;
  if (s < straight) return [HALF - s, ZC + R, Math.PI];
  s -= straight;
  const a = s / R;
  return [-HALF - R * Math.sin(a), ZC + R * Math.cos(a), Math.PI + a];
}
const REST = Array.from({ length: CLEATS }, (_, i) => loop(i / CLEATS));

const ease = (t: number, a: number, b: number) => {
  const u = clamp((t - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
};
/** Fades in over a..b, holds, fades out over c..d. */
const span = (t: number, a: number, b: number, c: number, d: number) =>
  ease(t, a, b) * (1 - ease(t, c, d));

export class Crawler extends Character {
  static readonly terms =
    'tank tracks treads tracked bulldozer tan beige brown dome shell periscope scoop pincer claw pebbles rocks collector trundle shy slow rover digger';

  private env: Env | null = null;
  /** Periscope: -0.7 sunk into the shell, 0 resting on it, 1 fully stretched. */
  private ext = new Spring(3.2, 0.5, 1.4);
  private stone = new Spring(5, 0.5, 1.3);
  private piles = [0, 1, 2].map(() => new Spring(5, 0.5, 1.4));
  private squat = new Spring(4, 0.5, 1, 1);
  private phase = [0, 0];
  private lastHeading = 0;
  private turnRate = 0;
  private pokes: number[] = [];
  private hover = 0;
  private did = 0;
  private dir = 1;
  private mate: Character | null = null;
  /** Pebbles kept in the tray, 0..3. */
  private kept = 1;
  // Set each frame by whatever act is running (idle() clears them).
  private extGoal = 0.45;
  private stalkPitch = 0;
  private stalkYaw = 0;
  private squatGoal = 1;
  private stoneGoal = 0;
  private stoneAt: [number, number, number] = [0, 0, 0];
  private pileAt: [number, number, number][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  private pileGoal = [-1, -1, -1];
  private armL: [number, number, number] = [0, 0, 0];
  private handL: [number, number, number] = [0, 0, 0];
  private armR: [number, number, number] = [0, 0, 0];
  private pinch = 0.2;
  private hop = 0;
  private spin = 0;
  private drive = 0;
  private turnBy = 0;
  private rear = 0;
  private lights: { hub: number; pills: [number, number, number]; tray: number } | null = null;
  private mood: string | null = null;
  private glow = 0;
  private jitter = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Tread',
        model: 'crawler',
        metres: 0.36,
        width: 0.34,
        size: 0.78,
        feels: {
          default: { f: 4, zeta: 0.6 },
          body: { f: 3, zeta: 0.5 },
          stalk: { f: 3, zeta: 0.4 },
          eye: { f: 3.5, zeta: 0.5, r: 0.5 },
          'arm.L': { f: 3.5, zeta: 0.5 },
          'arm.R': { f: 3.5, zeta: 0.5 },
          'hand.L': { f: 4, zeta: 0.4 },
          'hand.R': { f: 4, zeta: 0.4 },
          'pinch.R.1': { f: 6, zeta: 0.5 },
          'pinch.R.2': { f: 6, zeta: 0.5 },
        },
        face: CRAWLER_FACE,
        eyes: 0.85,
        gaze: [
          { bone: 'eye', yaw: 0.85, pitch: 0.9 },
          { bone: 'body', yaw: 0.1, pitch: 0 },
        ],
        reach: { yaw: 60, pitch: 28 },
        lag: 1.3,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [60, 130],
        speed: 0.8,
        turn: 80,
      },
      model,
    );
    this.acts = {
      ...this.getAbout(),
      ...this.work(),
      ...this.shy(),
      ...this.more(),
      ...this.reactions(),
    };
  }

  // ---------- Who is about ----------

  private mates() {
    const f = this.env?.frame;
    return (this.env?.crew ?? [])
      .filter((o) => o !== this && o.state === 'here' && o.edge === this.edge)
      .sort((a, b) => Math.abs(this.at(a) - this.s) - Math.abs(this.at(b) - this.s))
      .filter((o) => !f || Math.abs(this.at(o) - this.s) < this.heightPx * 14);
  }

  private at(o: Character) {
    return o.free ? o.free.x : o.s;
  }

  private still = () => !this.walking && !this.door;

  private amble(heights: number, depth?: number, way?: number) {
    if (!this.env) return;
    const [lo, hi] = this.span(this.env.frame);
    const more = this.s - lo > hi - this.s ? -1 : 1;
    const room = (more > 0 ? hi - this.s : this.s - lo) - this.widthPx() * 1.2;
    const w = way ?? (Math.random() < 0.7 ? more : -more);
    const far = Math.min(Math.max(room, 0), this.heightPx * heights);
    this.walkTo(this.s + w * Math.max(far, this.heightPx * 0.6), depth);
  }

  // ---------- Acts: getting about ----------

  private getAbout(): Record<string, Act> {
    return {
      idle: { weight: 4, length: [3, 6] },
      trundle: {
        weight: 2.6,
        length: [3, 5],
        when: this.still,
        start: () => {
          this.spec.speed = 0.8;
          this.amble(3 + Math.random() * 3);
        },
        pose: (t) => {
          this.extGoal = 0.35;
          this.armL = [4 * sin(t, 1.3), 0, 0];
          this.armR = [4 * sin(t, 1.3, 0.5), 0, 0];
        },
      },
      creep: {
        weight: 1.1,
        length: [4, 6],
        face: 'focused',
        when: this.still,
        start: () => {
          this.spec.speed = 0.35;
          this.amble(2.5);
        },
        pose: (t) => {
          // Slowly, the periscope low, looking one way and the other.
          this.extGoal = 0.12;
          this.stalkYaw = 30 * sin(t, 0.35);
          this.stalkPitch = 12;
        },
      },
      roam: {
        weight: 1.2,
        length: [6, 8],
        when: this.still,
        start: () => {
          this.spec.speed = 0.9;
          this.walkTo(
            this.s + (Math.random() < 0.5 ? -1 : 1) * this.heightPx * 2,
            0.1 + Math.random() * 0.85,
          );
        },
        pose: (t) => {
          this.extGoal = 0.4 + 0.15 * sin(t, 0.3);
          this.stalkYaw = 14 * sin(t, 0.4);
        },
      },
      circle: {
        weight: 0.8,
        length: [6.2, 6.2],
        face: 'happy',
        when: this.still,
        start: () => {
          this.spec.speed = 1.1;
          this.did = 0;
          this.dir = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          // Round and round in a ring across the floor.
          const n = Math.floor(t / 1.5);
          if (n >= this.did && n < 4) {
            this.did = n + 1;
            const H = this.heightPx;
            const step: [number, number][] = [
              [1.3, 0.55],
              [0, 0.9],
              [-1.3, 0.55],
              [0, 0.2],
            ];
            const [dx, d] = step[(n + (this.dir < 0 ? 0 : 0)) % 4];
            this.walkTo(this.baseS + this.dir * dx * H, d);
          }
          this.extGoal = 0.6;
          this.stalkYaw = 20 * sin(t, 0.5);
        },
      },
      spin: {
        weight: 1,
        length: [3, 3],
        face: 'happy',
        when: this.still,
        start: () => (this.dir = Math.random() < 0.5 ? -1 : 1),
        pose: (t) => {
          // A tank turn on the spot: one track forward, one back, all the way round.
          const a = ease(t, 0.3, 2.4);
          this.spin = this.dir * 360 * a;
          this.turnBy = this.dir * 0.9 * (a > 0 && a < 1 ? 1 : 0);
          this.extGoal = 0.2;
          this.armL = [-20 * a, 0, 0];
          this.armR = [-20 * a, 0, 0];
        },
      },
      wheelie: {
        weight: 0.9,
        length: [4.4, 4.4],
        face: 'happy',
        when: this.still,
        start: () => {
          this.spec.speed = 1.2;
          this.amble(2.5);
        },
        pose: (t) => {
          // A run-up, then up on its back treads for a moment, arms out; and back down with a
          // thump.
          const up = span(t, 1.4, 2, 3.2, 3.5);
          this.rear = 30 * up + 3 * up * sin(t, 4);
          this.extGoal = 0.3 + 0.7 * up;
          this.armL = [-40 * up, 0, 0];
          this.armR = [-40 * up, 0, 0];
          this.jitter = 0;
          if (t > 3.5 && t < 3.55) this.squatKick = 0.1;
        },
      },
      rearUp: {
        weight: 0.7,
        length: [5, 5.5],
        face: 'surprised',
        when: this.still,
        pose: (t) => {
          // Up on its back end like a meerkat, periscope stretched, having a look round.
          const up = span(t, 0.3, 1.3, this.actLength - 1.2, this.actLength - 0.2);
          this.rear = 52 * up;
          this.extGoal = 0.2 + 0.8 * up;
          this.stalkYaw = 40 * sin(t, 0.35) * up;
          this.stalkPitch = -8 * up;
          this.armL = [-30 * up, 0, 0];
          this.armR = [-30 * up, 0, 0];
          this.expression = up > 0.5 ? 'surprised' : 'neutral';
        },
      },
      followDrone: {
        weight: 1.3,
        length: [8, 11],
        face: 'happy',
        when: () => this.still() && this.mates().length > 0,
        start: () => {
          const all = this.mates();
          this.mate = all.find((o) => o.spec.model === 'drone') ?? all[0] ?? null;
          this.did = 0;
          this.dir = Math.random() < 0.5 ? -1 : 1;
          this.spec.speed = 1.0;
        },
        pose: (t) => {
          // Trundles after the drone, a little behind, eager to keep up.
          const o = this.mate;
          this.extGoal = 0.7;
          if (!o || o.state === 'gone') return;
          this.stalkYaw = 0;
          if (t - this.did > 0.6) {
            this.did = t;
            this.walkTo(
              this.at(o) + this.dir * (this.widthPx() * 0.9 + o.spec.width * o.px * 0.5),
              o.depth,
            );
          }
        },
      },
      wiggle: {
        weight: 1,
        length: [3, 3.6],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // A happy shuffle: the tracks jitter to and fro, the periscope bobbing.
          const k = span(t, 0.2, 0.6, this.actLength - 0.6, this.actLength - 0.2);
          this.jitter = k;
          this.turnBy = 0.5 * Math.sin(t * 12) * k;
          this.drive = 0.4 * Math.sin(t * 6) * k;
          this.spin = 12 * Math.sin(t * 6) * k;
          this.extGoal = 0.5 + 0.2 * Math.sin(t * 6) * k;
          this.armL = [0, 0, 14 * Math.sin(t * 6) * k];
          this.armR = [0, 0, -14 * Math.sin(t * 6) * k];
        },
      },
    };
  }

  /** Where it was when the act began (for the ring it drives round). */
  private baseS = 0;

  // ---------- Acts: the work ----------

  private work(): Record<string, Act> {
    return {
      collect: {
        weight: 1.6,
        length: [7, 7],
        face: 'focused',
        when: this.still,
        start: () => (this.did = 0),
        pose: (t) => {
          // Spots a pebble, lowers the periscope to look, scoops it up, holds it up to admire
          // it and tucks it into the tray on its back.
          const look = span(t, 0.2, 0.9, 1.6, 2.2);
          this.extGoal = 0.45 - 0.4 * look;
          this.stalkPitch = 24 * look;
          const scoop = span(t, 1.8, 2.4, 3.4, 3.9);
          const hold = span(t, 3.4, 4, 5, 5.5);
          this.armL = [10 * scoop - 30 * hold, 0, 0];
          this.handL = [-25 * hold, 0, 0];
          this.stoneGoal = t > 2.3 && t < 5.5 ? 1 : 0;
          this.stoneAt = [0, 0.02 * (1 - scoop) - 0.02, 0];
          this.armR = [-50 * span(t, 4.8, 5.4, 6.3, 6.8), 0, 0];
          if (t > 5.4 && !this.did) {
            this.did = 1;
            this.kept = Math.min(PILE, this.kept + 1);
            this.piles[this.kept - 1].kick(8);
          }
          this.expression = hold > 0.5 ? 'happy' : 'focused';
          this.stoneGoal = t > 2.3 && t < 5.5 ? 1 : 0;
        },
      },
      scoopDump: {
        weight: 1.1,
        length: [5, 5],
        face: 'focused',
        when: this.still,
        pose: (t) => {
          // Scoops up a load, lifts it high and tips it out, and it rattles down.
          const lift = span(t, 1.2, 2.2, 3, 3.6);
          this.armL = [10 * span(t, 0.2, 0.8, 1.4, 1.8) - 60 * lift, 0, 0];
          const tip = span(t, 2.4, 2.9, 3.2, 3.7);
          this.handL = [50 * tip, 0, 0];
          this.stoneGoal = t > 0.9 && t < 3.3 ? 1 : 0;
          this.stoneAt = [0, -0.06 * ease(t, 3, 3.3), 0];
          this.extGoal = 0.5 + 0.2 * lift;
          this.stalkPitch = 6 * lift;
          this.expression = t > 3.6 ? 'happy' : 'focused';
        },
      },
      stack: {
        weight: 1,
        length: [9.5, 9.5],
        face: 'focused',
        when: this.still,
        pose: (t) => {
          // Sets its pebbles out on the floor in front of it and stacks them into a tower,
          // wobbles, and takes a bow; then takes them back.
          for (let i = 0; i < PILE; i++) {
            const put = 1.4 + i * 1.5;
            const a = ease(t, put, put + 0.5);
            const back = ease(t, 7.6 + i * 0.4, 8.2 + i * 0.4);
            const here = a * (1 - back);
            // From the tray (0, .09, .2) to a tower in front of it: shift is (x, up, forward).
            this.pileAt[i] = [
              0.0 * here,
              -(0.2 - 0.02 - i * 0.03) * here + 0.0,
              (0.09 + 0.3) * here,
            ];
            this.pileGoal[i] = 1;
          }
          const wob = span(t, 5.6, 5.9, 7, 7.4);
          for (let i = 0; i < PILE; i++)
            this.pileAt[i][0] += 0.008 * (i + 1) * Math.sin(t * 14) * wob;
          const reach = span(t, 1, 1.6, 6, 6.6);
          this.armR = [-16 * reach + 8 * Math.sin(t * 3) * reach, 0, 0];
          this.extGoal = 0.15 + 0.3 * ease(t, 5.6, 6.4) * (1 - ease(t, 7, 7.6));
          this.stalkPitch = 20 * (reach - ease(t, 5.6, 6.4));
          const bow = span(t, 7, 7.5, 7.9, 8.4);
          this.hop = 6 * bow;
          this.expression = t > 5.6 && t < 7.6 ? 'happy' : 'focused';
          this.mood = t > 5.6 && t < 7.6 ? (BEACON.happy ?? null) : null;
        },
      },
      polish: {
        weight: 1.2,
        length: [5, 6],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // Rubs the floor with the scoop, side to side, humming, then looks at the shine.
          const k = span(t, 0.3, 0.9, this.actLength - 1.6, this.actLength - 0.9);
          this.armL = [14 * k, 0, 0];
          this.handL = [0, 0, 0];
          this.armL = [14 * k, 26 * k * sin(t, 1.6), 0];
          this.extGoal = 0.1;
          this.stalkPitch = 22 * k;
          this.glow = k * (0.5 + 0.5 * Math.sin(t * 9));
          this.spin = 3 * k * sin(t, 1.6);
        },
      },
      inspect: {
        weight: 1.2,
        length: [5.5, 6.5],
        face: 'focused',
        when: this.still,
        pose: (t) => {
          // Puts the periscope right down to the floor to look at a spot, tilting this way
          // and that, and says nothing.
          const k = span(t, 0.3, 1.2, this.actLength - 1.2, this.actLength - 0.3);
          this.extGoal = 0.7 - 0.6 * k;
          this.stalkPitch = 30 * k;
          this.stalkYaw = 22 * k * sin(t, 0.5);
          this.expression = k > 0.5 ? 'surprised' : 'focused';
        },
      },
      beeps: {
        weight: 1.1,
        length: [4.4, 4.4],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // Beeps in sequence: the three pills flash in turn, the periscope bobbing to each.
          const beat = Math.floor(t / 0.3);
          const on = t > 0.4 && t < 3.8;
          const which = [0, 1, 2, 2, 1, 0, 1, 2, 0, 0, 2, 1][beat % 12];
          const level: [number, number, number] = [0, 0, 0];
          if (on && t % 0.3 < 0.2) level[which] = 1;
          this.lights = { hub: 0, pills: level, tray: on && beat % 4 === 0 ? 1 : 0 };
          this.extGoal = 0.5 + (on && t % 0.3 < 0.2 ? 0.12 : 0);
          this.stalkYaw = on ? (which - 1) * 18 : 0;
          this.glow = on && t % 0.3 < 0.2 ? 1 : 0;
        },
      },
      count: {
        weight: 0.8,
        length: [6, 6],
        face: 'focused',
        when: this.still,
        pose: (t) => {
          // Turns the periscope back over its shoulder at the tray and counts the pebbles
          // there, one blink of the tray light for each.
          const k = span(t, 0.3, 1.2, 4.8, 5.6);
          this.extGoal = 0.6 * k + 0.3;
          this.stalkPitch = -35 * k;
          this.stalkYaw = 0;
          const n = this.kept;
          let tray = 0;
          for (let i = 0; i < n; i++) if (t > 1.6 + i * 0.7 && t < 1.9 + i * 0.7) tray = 1;
          this.lights = { hub: 0, pills: [0, 0, 0], tray };
          this.expression = t > 1.6 + n * 0.7 + 0.4 && t < 5 ? 'happy' : 'focused';
        },
      },
    };
  }

  // ---------- Acts: shy and sleepy ----------

  private shy(): Record<string, Act> {
    return {
      peek: {
        weight: 2,
        length: [6, 8],
        face: 'focused',
        when: this.still,
        pose: (t) => {
          // The periscope slides up to peer over the top of things, looks one way, then the
          // other, then all the way up, and slowly comes down.
          const k = span(t, 0.3, 1.6, this.actLength - 1.8, this.actLength - 0.4);
          this.extGoal = 0.05 + 0.95 * k;
          this.stalkYaw = 34 * sin(t, 0.28) * k;
          this.stalkPitch = -6 * k;
        },
      },
      peekMate: {
        weight: 1.2,
        length: [6, 7],
        face: 'focused',
        when: () => this.still() && this.mates().length > 0,
        start: () => (this.mate = this.mates()[0] ?? null),
        pose: (t) => {
          // Stretches up toward a crewmate for a good look, and ducks when it looks back.
          const o = this.mate;
          const k = span(t, 0.3, 1.5, this.actLength - 1.6, this.actLength - 0.3);
          this.extGoal = 0.2 + 0.8 * k;
          if (o) this.stalkYaw = clamp((this.at(o) - this.s) / (this.heightPx * 4), -1, 1) * 40 * k;
          this.expression = k > 0.6 ? 'surprised' : 'neutral';
        },
      },
      lookOver: {
        weight: 1,
        length: [8, 10],
        when: this.still,
        start: () => {
          this.spec.speed = 0.8;
          this.did = 0;
          this.amble(2, 0);
        },
        pose: (t) => {
          // At the front lip the periscope goes all the way up and leans out over it.
          const at = this.depth < 0.05 && !this.walking;
          if (at && !this.did) this.did = t;
          const k = at ? span(t - this.did, 0, 0.9, 3.4, 4.2) : 0;
          this.extGoal = 0.3 + 0.9 * k;
          this.stalkPitch = 30 * k;
          this.stalkYaw = 20 * k * sin(t, 0.4);
          if (this.did && t - this.did > 4.3) this.walkTo(this.s, 0.25);
          this.expression = k > 0.3 ? 'surprised' : 'neutral';
        },
      },
      patrolBack: {
        weight: 1,
        length: [10, 12],
        when: this.still,
        start: () => {
          this.spec.speed = 0.8;
          this.did = 0;
          this.amble(2.5, 0.95, Math.random() < 0.5 ? -1 : 1);
        },
        pose: (t) => {
          // A patrol to the back wall, a look about there, and home again.
          const at = this.depth > 0.85 && !this.walking;
          if (at && !this.did) this.did = t;
          const k = at ? span(t - this.did, 0, 0.8, 4.5, 5) : 0;
          this.extGoal = 0.35 + 0.65 * k;
          this.stalkYaw = 34 * k * sin(t, 0.3);
          if (this.did && t - this.did > 5 && this.depth > 0.5) this.walkTo(this.s, 0.2);
        },
      },
      turtle: {
        weight: 1.1,
        length: [7, 8],
        when: this.still,
        pose: (t) => {
          // Pulls everything in: the periscope sinks into the shell, the arms fold, the
          // whole thing squats down. A pause. Then the eye comes up a little, and looks.
          const tuck = span(t, 0.1, 0.8, 4.2, 5);
          const peek = span(t, 4.4, 5.2, 6, 6.6);
          this.extGoal = -0.75 * tuck + 0.35 * peek;
          this.squatGoal = 1 - 0.14 * tuck;
          this.armL = [-40 * tuck, -30 * tuck, 0];
          this.armR = [-40 * tuck, 30 * tuck, 0];
          this.handL = [60 * tuck, 0, 0];
          this.expression = tuck > 0.5 ? 'sleepy' : peek > 0.3 ? 'surprised' : 'neutral';
        },
      },
      hideAway: {
        weight: 0.8,
        length: [7, 8],
        when: this.still,
        pose: (t) => {
          // Turns its back on us, periscope in, and peeks over its shoulder now and then.
          const away = span(t, 0.2, 1.2, this.actLength - 1.6, this.actLength - 0.4);
          this.spin = 170 * away;
          this.turnBy = 0.7 * (away > 0.02 && away < 0.98 ? 1 : 0);
          const p = span(t, 3, 3.8, 4.8, 5.4);
          this.extGoal = 0.05 + 0.5 * p;
          this.stalkYaw = -40 * p * away;
          this.expression = p > 0.4 ? 'surprised' : 'neutral';
        },
      },
      sleep: {
        weight: 0.9,
        length: [10, 16],
        face: 'asleep',
        when: this.still,
        pose: (t) => {
          // Dozes off: the stalk sags forward and down until the eye is resting on the shell.
          const k = ease(t, 0, 2.5) * (1 - ease(t, this.actLength - 1.6, this.actLength - 0.6));
          this.extGoal = 0.45 - 0.6 * k;
          this.stalkPitch = 40 * k;
          this.squatGoal = 1 - 0.06 * k + 0.012 * Math.sin(t * 1.4) * k;
          this.armL = [10 * k, 0, 0];
          this.armR = [10 * k, 0, 0];
          this.expression = t > this.actLength - 1.6 ? 'sleepy' : 'asleep';
        },
      },
      stretch: {
        weight: 0.9,
        length: [4, 4.6],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // A stretch: the periscope all the way up and beyond, quivering, and a settle.
          const k = span(t, 0.2, 1.2, 2.6, 3.4);
          this.extGoal = 0.3 + 1.05 * k;
          this.stalkYaw = 3 * Math.sin(t * 12) * k;
          this.armL = [-30 * k, 0, 0];
          this.armR = [-30 * k, 0, 0];
          this.squatGoal = 1 + 0.06 * k;
          this.expression = k > 0.6 ? 'happy' : 'sleepy';
        },
      },
      salute: {
        weight: 0.7,
        length: [3.4, 3.4],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // The pincer up to the eye, crisply, held, and down.
          const k = span(t, 0.3, 0.8, 2.4, 2.9);
          this.armR = [-95 * k, 0, 0];
          this.extGoal = 0.75 * k + 0.2;
          this.pinch = 0.2 * (1 - k);
          this.mood = k > 0.5 ? (BEACON.happy ?? null) : null;
        },
      },
      wave: {
        weight: 0.9,
        length: [3.6, 4],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // A shy little wave with the pincer, the periscope half hidden behind it.
          const k = span(t, 0.3, 0.9, this.actLength - 0.9, this.actLength - 0.3);
          this.armR = [-70 * k, 0, 10 * k * sin(t, 2.4)];
          this.pinch = 0.5 + 0.5 * sin(t, 2.4);
          this.extGoal = 0.3;
          this.stalkYaw = 10 * k;
          this.stalkPitch = 8 * k;
        },
      },
    };
  }

  // ---------- Acts: moods and mischief ----------

  private more(): Record<string, Act> {
    return {
      sulk: {
        weight: 0.8,
        length: [7, 9],
        face: 'sad',
        when: this.still,
        start: () => (this.dir = Math.random() < 0.5 ? -1 : 1),
        pose: (t) => {
          // Turns half away, the periscope drooped over the shell, arms hanging, the lights
          // dim; a heavy sigh now and then (the shell sinks a little and comes back up).
          const k = ease(t, 0.2, 1.6) * (1 - ease(t, this.actLength - 1.6, this.actLength - 0.4));
          this.spin = this.dir * 70 * k;
          this.turnBy = this.dir * 0.5 * (k > 0.02 && k < 0.98 ? 1 : 0);
          this.extGoal = 0.45 - 0.75 * k;
          this.stalkPitch = 38 * k;
          this.stalkYaw = 10 * k * sin(t, 0.25);
          this.armL = [18 * k, 0, 6 * k];
          this.armR = [18 * k, 0, -6 * k];
          this.pinch = 0.25 - 0.2 * k;
          const sigh = span(t, 3.2, 3.8, 4, 4.6) + span(t, 6, 6.6, 6.8, 7.4);
          this.squatGoal = 1 - 0.05 * k - 0.05 * sigh;
          this.lights = { hub: 0, pills: [0.1 * (1 - k), 0.1 * (1 - k), 0.1 * (1 - k)], tray: 0.1 };
          this.mood = BEACON.sad ?? null;
        },
      },
      rock: {
        weight: 0.9,
        length: [4, 4.6],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // A happy rock back and forth on its tracks, the cleats running one way and the
          // other, the periscope bobbing with it and the pills chasing each other.
          const k = span(t, 0.2, 0.7, this.actLength - 0.7, this.actLength - 0.2);
          const w = Math.sin(t * 5);
          this.rear = 9 * (w + 0.4) * k;
          this.drive = 0.35 * Math.cos(t * 5) * k;
          this.extGoal = 0.5 + 0.25 * w * k;
          this.stalkPitch = -8 * w * k;
          this.armL = [-18 * (w + 1) * k, 0, 0];
          this.armR = [-18 * (1 - w) * k, 0, 0];
          const on = Math.floor(t * 5) % 3;
          this.lights = {
            hub: 0,
            pills: [on === 0 ? 1 : 0, on === 1 ? 1 : 0, on === 2 ? 1 : 0],
            tray: 0,
          };
          this.glow = 0.6 * k;
        },
      },
      bump: {
        weight: 0.8,
        length: [5.5, 5.5],
        face: 'focused',
        when: this.still,
        start: () => {
          this.spec.speed = 0.5;
          this.amble(1.2);
        },
        pose: (t) => {
          // Climbs over a small bump nobody else can see: the nose tips up, it grinds over
          // the crest, tips down, and lands with a little thump. Pleased with itself.
          const climb = span(t, 1.2, 2, 2.6, 3.1);
          const down = span(t, 2.6, 3, 3.5, 4);
          this.rear = 22 * climb - 14 * down;
          this.drive = 0.5 * (climb + down);
          this.hop = 3 * span(t, 2.4, 2.8, 3, 3.4);
          this.extGoal = 0.35 - 0.2 * climb + 0.5 * ease(t, 3.8, 4.6);
          this.stalkPitch = 12 * climb;
          this.armL = [-20 * climb + 15 * down, 0, 0];
          this.armR = [-20 * climb + 15 * down, 0, 0];
          if (t > 3.55 && t < 3.6) this.squatKick = 0.12;
          this.expression = t > 3.8 ? 'happy' : 'focused';
        },
      },
      pokeMate: {
        weight: 0.9,
        length: [8, 9],
        face: 'focused',
        when: () => this.still() && this.mates().length > 0,
        start: () => {
          this.mate = this.mates()[0] ?? null;
          this.did = 0;
          this.spec.speed = 0.9;
          const o = this.mate;
          if (o) {
            const way = this.at(o) > this.s ? -1 : 1;
            this.dir = -way;
            this.walkTo(
              this.at(o) + way * (this.widthPx() * 0.5 + o.spec.width * o.px * 0.55),
              o.depth,
            );
          }
        },
        pose: (t) => {
          // Trundles up to a crewmate, holds the pincer out, prods it (twice), and then
          // looks the other way, periscope high, innocent.
          const o = this.mate;
          if (!o || o.state === 'gone') return;
          const near = !this.walking;
          if (near && !this.did) this.did = t;
          const u = this.did ? t - this.did : -1;
          const reach = u < 0 ? 0 : span(u, 0, 0.5, 2.6, 3.2);
          const prod = u < 0 ? 0 : 0.5 + 0.5 * Math.sin(u * 9);
          this.armR = [-55 * reach - 12 * prod * reach, 12 * reach, 0];
          this.pinch = 0.9 - 0.7 * prod * reach;
          this.stalkYaw = clamp((this.at(o) - this.s) / (this.heightPx * 3), -1, 1) * 35 * reach;
          this.extGoal = 0.45 + 0.2 * reach;
          const away = u < 0 ? 0 : span(u, 3.2, 3.8, 5, 5.6);
          this.stalkYaw += -this.dir * 35 * away;
          this.extGoal += 0.4 * away;
          if (u > 1.1 && u < 1.2 && !this.pokedOnce) {
            this.pokedOnce = true;
            o.poke();
          }
          if (u < 0.5) this.pokedOnce = false;
          this.expression = away > 0.4 ? 'wink' : reach > 0.3 ? 'cross' : 'focused';
        },
      },
      bulldoze: {
        weight: 0.9,
        length: [8, 8],
        face: 'focused',
        when: this.still,
        start: () => {
          this.spec.speed = 0.55;
          this.did = 0;
          this.dir = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          // Sets its three pebbles down in a row in front of it and bulldozes them along the
          // floor, arms out wide as blades, then backs off and admires the heap.
          const put = ease(t, 0.6, 1.4) * (1 - ease(t, 6.4, 7.2));
          for (let i = 0; i < PILE; i++) {
            this.pileAt[i] = [(i - 1) * 0.05 * put, -0.178 * put, 0.4 * put];
            this.pileGoal[i] = 1;
          }
          const push = span(t, 1.6, 2, 4.8, 5.2);
          if (!this.did && t > 1.7) {
            this.did = 1;
            this.amble(2, undefined, this.dir);
          }
          this.armL = [-10 * put, 30 * put, 0];
          this.armR = [-10 * put, -30 * put, 0];
          this.extGoal = 0.2 + 0.1 * push;
          this.stalkPitch = 10 * push;
          this.drive = t > 5.2 && t < 6.4 ? -0.4 : 0;
          this.expression = t > 5.4 ? 'happy' : 'focused';
        },
      },
    };
  }

  private pokedOnce = false;

  // ---------- Reactions ----------

  private reactions(): Record<string, Act> {
    return {
      poked: {
        weight: 0,
        length: [2.4, 2.8],
        face: 'surprised',
        pose: (t) => {
          // Jumps, the periscope shoots down into the shell, and stays there a moment.
          const hop = t < 0.35 ? Math.sin((Math.PI * t) / 0.35) : 0;
          this.hop = 14 * hop;
          const hide = span(t, 0.05, 0.25, 1.2, 1.9);
          this.extGoal = -0.75 * hide + 0.3 * ease(t, 1.5, 2.2);
          this.squatGoal = 1 - 0.1 * hide;
          this.armL = [-30 * hide, 0, 0];
          this.armR = [-30 * hide, 0, 0];
          this.glow = 1 - ease(t, 0, 0.8);
        },
      },
      dizzy: {
        weight: 0,
        length: [4, 4],
        face: 'dizzy',
        pose: (t) => {
          const k = 1 - ease(t, 2.6, 3.8);
          this.spin = 360 * 3 * (1 - Math.exp(-t * 1.2)) * k;
          this.turnBy = 0.6 * k;
          this.extGoal = 0.6;
          this.stalkYaw = 20 * k * Math.sin(t * 5);
          this.stalkPitch = 12 * k * Math.cos(t * 4);
          this.glow = 0.5 * k;
        },
      },
      pleased: {
        weight: 0,
        length: [3, 4],
        face: 'love',
        pose: (t) => {
          // Stretches up toward the mouse and waggles its tracks.
          const k = ease(t, 0, 0.6) * (1 - ease(t, this.actLength - 0.6, this.actLength));
          this.extGoal = 0.4 + 0.7 * k;
          this.turnBy = 0.25 * Math.sin(t * 10) * k;
          this.armL = [-14 * k, 0, 8 * k * sin(t, 2)];
          this.armR = [-14 * k, 0, -8 * k * sin(t, 2)];
          this.glow = k;
        },
      },
    };
  }

  private squatKick = 0;

  poke() {
    if (this.state !== 'here') return;
    const now = performance.now() / 1000;
    this.pokes = [...this.pokes.filter((at) => now - at < 3), now];
    this.goal = null;
    if (this.pokes.length >= 3) {
      this.pokes = [];
      this.setAct('dizzy');
    } else if (this.act !== 'dizzy') this.setAct('poked');
  }

  // ---------- Posing ----------

  protected idle(t: number) {
    const p = this.puppet;
    this.extGoal = 0.45;
    this.stalkPitch = this.stalkYaw = 0;
    this.squatGoal = 1;
    this.stoneGoal = 0;
    this.stoneAt = [0, 0, 0];
    this.pileGoal = [-1, -1, -1];
    for (const a of this.pileAt) a.fill(0);
    this.armL = [0, 0, 0];
    this.handL = [0, 0, 0];
    this.armR = [0, 0, 0];
    this.pinch = 0.25;
    this.hop = this.spin = this.drive = this.turnBy = this.rear = 0;
    this.lights = null;
    this.mood = null;
    this.glow = 0;
    this.jitter = 0;
    this.expression = this.hovered ? 'happy' : 'neutral';
    if (this.act === 'idle') this.baseS = this.s;
    if (this.act !== 'creep' && this.act !== 'followDrone' && this.act !== 'circle')
      this.spec.speed = 0.8;
    if (this.act !== 'creep' && this.act !== 'trundle')
      this.spec.speed = this.act === 'wheelie' ? 1.2 : this.spec.speed;
    // Breathing; the eye looks about on its own; the arms twiddle a bit.
    p.add('body', 0.8 * sin(t, 0.3));
    p.add('stalk', 2 * sin(t, 0.2), 4 * sin(t, 0.11));
    p.add('arm.L', 3 * sin(t, 0.24), 0, 0);
    p.add('arm.R', 3 * sin(t, 0.24, 0.3), 0, 0);
  }

  protected move(dt: number, env: Env) {
    this.env = env;
    super.move(dt, env);
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    this.env = env;
    this.hover = this.hovered ? this.hover + dt : 0;
    if (this.hover > 0.9 && this.act === 'idle' && this.still()) this.setAct('pleased');

    // Tank turns: how fast it is turning to face where it goes.
    const rate = (this.heading.y - this.lastHeading) / Math.max(dt, 1e-3);
    this.lastHeading = this.heading.y;
    this.turnRate += (rate - this.turnRate) * Math.min(1, dt * 8);

    // Rearing up: pivot on the back of the tracks (nose up is a negative pitch).
    p.add('body', -this.rear);
    // Extra hop, for a startle or a bow.
    this.h = this.hop * (this.heightPx / 100) * 3;

    // The periscope.
    p.add('stalk', this.stalkPitch, this.stalkYaw * 0.5, 0);
    p.add('eye', this.stalkPitch * 0.4, this.stalkYaw * 0.5, 0);
    // The arms: pitch lifts (negative) or lowers the forearm; yaw swings it out.
    p.add('arm.L', this.armL[0], this.armL[1], this.armL[2]);
    p.add('hand.L', this.handL[0], this.handL[1], this.handL[2]);
    p.add('arm.R', this.armR[0], this.armR[1], this.armR[2]);
    // Pincer: 0 shut, 1 wide.
    p.add('pinch.R.1', 0, -30 * this.pinch, 0);
    p.add('pinch.R.2', 0, 30 * this.pinch, 0);
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    const t = env.time;
    const px = this.px;

    // Turning the whole crawler on the spot (spin): direct, so it can go all the way round.
    if (this.spin) p.turn('root', 0, this.spin, 0);

    // Squat and squash (the shell sinks, a startle, a thump).
    if (this.squatKick) {
      this.squat.kick(-this.squatKick * 30);
      this.squatKick = 0;
    }
    const sq = this.squat.update(dt, this.squatGoal);
    if (Math.abs(sq - 1) > 0.002) p.stretch('body', sq, [0, 1, 0], 1 + (1 - sq) * 0.4);

    // The periscope's sleeves slide up and down.
    const e = this.ext.update(dt, this.extGoal);
    for (const bone of ['stalk.2', 'stalk.3', 'eye']) p.shift(bone, 0, e * SLIDE, 0);

    // The tracks: each runs round as fast as the crawler moves over the floor, and a turn
    // runs one faster than the other.
    const steer = clamp(
      this.turnBy + clamp(this.turnRate / 120, -0.6, 0.6) * (this.stride > 1 ? 0.3 : 1),
      -1,
      1,
    );
    const forward = this.stride / Math.max(px * LOOP, 1);
    const drive = forward * (this.rear ? 1 : 1) + this.drive * 0.6;
    const speeds = [drive + steer * 0.5, drive - steer * 0.5];
    SIDES.forEach(([sfx], k) => {
      this.phase[k] = (this.phase[k] + speeds[k] * dt) % 1;
      for (let i = 0; i < CLEATS; i++) {
        const [y, z, a] = loop(i / CLEATS + this.phase[k]);
        const [y0, z0, a0] = REST[i];
        const bone = `cleat.${sfx}.${i}`;
        // Blender's Y is three's -Z, and Z is Y.
        p.shift(bone, 0, z - z0, -(y - y0));
        p.turn(bone, (a - a0) * DEG, 0, 0);
      }
      // The end hubs turn with the track (radius 0.05 at the ends of the loop).
      const roll = this.phase[k] * (LOOP / R) * DEG;
      for (const end of ['F', 'B']) p.turn(`hub.${sfx}.${end}`, roll, 0, 0);
    });

    // The pebble in the scoop, and the ones on the tray.
    const s = Math.max(0.001, this.stone.update(dt, this.stoneGoal));
    p.stretch('stone', s, [0, 1, 0], s);
    p.shift('stone', this.stoneAt[0], this.stoneAt[1], this.stoneAt[2]);
    for (let i = 0; i < PILE; i++) {
      const goal = this.pileGoal[i] >= 0 ? this.pileGoal[i] : i < this.kept ? 1 : 0;
      const v = Math.max(0.001, this.piles[i].update(dt, goal));
      const name = `pile.${i + 1}`;
      p.stretch(name, v, [0, 1, 0], v);
      p.shift(name, this.pileAt[i][0], this.pileAt[i][1], this.pileAt[i][2]);
    }

    this.light(t);
  }

  /** The hubs, the three pills, the tray light and the beacon. */
  private light(t: number) {
    const act = this.act;
    const moving = this.stride > 1 || this.drive !== 0 || this.turnBy !== 0;
    const asleep = act === 'sleep';
    let hub = moving ? 0.35 + 0.3 * Math.sin(t * 9) : 0.2 + 0.05 * Math.sin(t * 1.3);
    if (asleep) hub = 0.08;
    if (this.glow > 0) hub = Math.max(hub, this.glow);
    this.outfit.dot(0, hub);
    this.outfit.dot(
      1,
      this.glow > 0 ? Math.max(0.3, this.glow) : moving ? 0.35 + 0.3 * Math.cos(t * 9) : hub,
    );
    const L = this.lights;
    for (let i = 0; i < 3; i++) {
      let level: number;
      if (L) level = 0.1 + 0.9 * L.pills[i];
      else if (act === 'dizzy') level = Math.random() < 0.5 ? 1 : 0.15;
      else if (asleep) level = 0.06 + 0.04 * Math.sin(t * 1.2 - i * 0.4);
      else if (moving) level = 0.2 + 0.8 * Math.max(0, Math.cos(t * 7 - i * 1.2));
      else level = 0.4 + 0.25 * Math.sin(t * 1.4 - i * 0.6);
      this.outfit.dot(2 + i, level);
    }
    const tray = L
      ? L.tray
      : act === 'collect' && this.did
        ? 1
        : this.kept >= PILE
          ? 0.9
          : 0.3 + 0.2 * Math.sin(t * 1.1);
    this.outfit.dot(5, asleep ? 0.05 : tray);
    let colour = this.mood ?? BEACON[this.expression] ?? '#f4f4f1';
    if (act === 'dizzy' || act === 'poked') colour = RAINBOW[Math.floor(t * 9) % RAINBOW.length];
    this.outfit.beacon(colour);
  }
}
