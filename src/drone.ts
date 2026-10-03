import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Act, Character, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import { Spring } from './spring';

/**
 * Whirr, the robot hover drone: a round hull with a domed head and a wide screen visor, four
 * small ducted rotors on stubby arms, a claw hanging on a short arm under its belly, a
 * searchlight under its chin and a beacon on a stub. It is eager, curious and a bit of a
 * show-off. It hovers a little above the floor with a gentle bob, leaning into the way it
 * goes, and lands on its skids to rest.
 *
 * It flies about the box (the front lip, the back wall, over the others' heads) and it
 * shows off: barrel rolls, loops, a figure eight, a lazy hover upside down, a dizzy spin, a
 * dive to the back wall and up again. It shines its searchlight down and sweeps it about,
 * scans a crewmate with the beam, snaps photos with a flash, carries a little package
 * across the floor and delivers it, tosses it up and catches it, waves its claw and
 * inspects it, buzzes round a crewmate's head, and follows Bolt (or whoever is about)
 * like a puppy. Now and then its battery runs low: the rotors sputter, it sags, lands with
 * a thump and charges, its rotor rings filling one by one, before it hops back up.
 *
 * The lights say what it is doing: the four rotor rings pulse while it flies and fill up
 * while it charges, the belt of three chases along while it cruises, the lamp lights for the
 * beam and the flash, and the beacon takes the colour of its mood (red when the battery
 * is low). Poke it and it jumps, flashing; three pokes and it spins dizzy. Rest the mouse
 * on it and it rises up, delighted.
 */
export const DRONE_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.3, 0.43],
    [0.7, 0.43],
  ],
  rx: 0.09,
  ry: 0.25,
  line: 0.035,
  mouth: [0.5, 0.82],
};

/** Rotors by bone name, and which way each one spins. */
const ROTORS = [
  ['rotor.FL', 1],
  ['rotor.FR', -1],
  ['rotor.BL', -1],
  ['rotor.BR', 1],
] as const;
const DEG = 180 / Math.PI;
const RED = '#ff5a4a';
/** The model's own numbers: how far the lamp is above the skids, metres. */
const LAMP = 0.185;
const BEAM = 0.245;

/** 0 before a, 1 after b, eased between. */
const ease = (t: number, a: number, b: number) => {
  const u = clamp((t - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
};
/** Fades in over a..b, holds, fades out over c..d. */
const span = (t: number, a: number, b: number, c: number, d: number) =>
  ease(t, a, b) * (1 - ease(t, c, d));

export class Drone extends Character {
  /** Held by the pointer, it flies after it. */
  readonly flies = true;
  /** It comes in its own way (flying or swimming), not jumping out of its picture. */
  readonly jumpsOut = false;
  private env: Env | null = null;
  /** Height above the floor, in body heights: where it wants to be, and where it is. */
  private up = 0.5;
  private alt = new Spring(2.4, 0.42, 1, 0.5);
  private rotors = new Spring(1.3, 1, 1, 1);
  private rotorGoal = 1;
  private turns = 0;
  private lean = new Spring(2.6, 0.5);
  private grip = new Spring(4, 0.45, 1, 0.4);
  private gripGoal = 0.4;
  private pkgS = new Spring(5, 0.5, 1.2);
  private pkgGoal = 0;
  private pokes: number[] = [];
  private hover = 0;
  private did = 0;
  private dir = 1;
  private mate: Character | null = null;
  // Set each frame by whatever act is running (idle() clears them).
  private roll = 0;
  private yaw = 0;
  private pitch = 0;
  private sx = 0;
  private sy = 0;
  private beam = 0;
  private beamRoll = 0;
  private beamPitch = 0;
  private flash = 0;
  private glow = 0;
  private mood: string | null = null;
  private pkgY = 0;
  private pkgX = 0;
  private charge = -1;
  private chase = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Whirr',
        model: 'drone',
        metres: 0.52,
        width: 0.5,
        size: 0.95,
        feels: {
          default: { f: 3.5, zeta: 0.55 },
          body: { f: 2.6, zeta: 0.45 },
          head: { f: 3, zeta: 0.5, r: 0.5 },
          beacon: { f: 3, zeta: 0.15 },
          arm: { f: 2.2, zeta: 0.25 },
          'claw.L': { f: 5, zeta: 0.5 },
          'claw.R': { f: 5, zeta: 0.5 },
          pkg: { f: 3, zeta: 0.4 },
        },
        face: DRONE_FACE,
        eyes: 0.66,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.9 },
          { bone: 'body', yaw: 0.12, pitch: 0.1 },
        ],
        reach: { yaw: 55, pitch: 28 },
        lag: 1.2,
        entrance: 'rise',
        edges: ['bottom'],
        stay: [60, 130],
        speed: 1.3,
        turn: 24,
      },
      model,
    );
    this.acts = {
      ...this.flights(),
      ...this.shows(),
      ...this.jobs(),
      ...this.ground(),
      ...this.extras(),
      ...this.reactions(),
    };
  }

  // ---------- Who is about ----------

  /** Crewmates on the floor (or Bolt in the air) to buzz, scan or follow, the nearest first. */
  private mates() {
    const f = this.env?.frame;
    return (this.env?.crew ?? [])
      .filter((o) => o !== this && o.state === 'here' && o.edge === this.edge)
      .sort((a, b) => Math.abs(this.at(a) - this.s) - Math.abs(this.at(b) - this.s))
      .filter((o) => !f || Math.abs(this.at(o) - this.s) < this.heightPx * 14);
  }

  /** Where a crewmate is along the edge (Bolt in the air included). */
  private at(o: Character) {
    return o.free ? o.free.x : o.s;
  }

  private still = () => !this.walking && !this.door;

  /** A short flight along the floor, toward the roomier side unless `way` says. */
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

  private flights(): Record<string, Act> {
    return {
      idle: { weight: 4, length: [3, 6] },
      cruise: {
        weight: 2.4,
        length: [3, 4.5],
        when: this.still,
        start: () => {
          this.spec.speed = 1.3;
          this.amble(3 + Math.random() * 3);
        },
        pose: () => {
          this.up = 0.65;
          this.chase = 1;
        },
      },
      zoom: {
        weight: 1,
        length: [2.4, 3.2],
        face: 'happy',
        when: this.still,
        start: () => {
          this.spec.speed = 3.4;
          this.spec.turn = 40;
          this.amble(5 + Math.random() * 3, undefined);
        },
        pose: () => {
          this.up = 0.5;
          this.chase = 1;
          this.rotorGoal = 1.4;
        },
      },
      bob: {
        weight: 1.4,
        length: [3, 4],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // Up and down on the spot, a little faster than it needs to.
          this.up = 0.5 + 0.2 * sin(t, 1.4);
          this.pitch = 5 * sin(t, 1.4, 0.2);
          this.chase = 1;
          this.puppet.add('head', 0, 0, 6 * sin(t, 0.7));
        },
      },
      roam: {
        weight: 1.2,
        length: [5, 7],
        when: this.still,
        start: () => {
          this.spec.speed = 1.5;
          this.walkTo(
            this.s + (Math.random() < 0.5 ? -1 : 1) * this.heightPx * 2,
            0.1 + Math.random() * 0.85,
          );
        },
        pose: (t) => {
          // A slow tour of the box, front to back.
          this.up = 0.75 + 0.1 * sin(t, 0.4);
          this.chase = 1;
        },
      },
      peekBack: {
        weight: 1,
        length: [10, 12],
        when: this.still,
        start: () => {
          this.spec.speed = 1.6;
          this.did = 0;
          this.amble(2.5, 0.95, Math.random() < 0.5 ? -1 : 1);
        },
        pose: (t) => {
          // At the back wall it hangs there and looks about, then goes home.
          const at = this.depth > 0.85 && !this.walking;
          if (at && !this.did) this.did = t;
          const k = at ? span(t - this.did, 0, 0.5, 4.5, 5) : 0;
          this.up = 0.9;
          this.puppet.add('head', -6 * k, 26 * k * sin(t, 0.35), 0);
          this.yaw = 22 * k * sin(t, 0.35);
          this.beam = 0;
          if (this.did && t - this.did > 5 && this.depth > 0.5) this.walkTo(this.s, 0.2);
          this.expression = k > 0.3 ? 'focused' : 'neutral';
        },
      },
      lookOver: {
        weight: 1,
        length: [8, 10],
        when: this.still,
        start: () => {
          this.spec.speed = 1.6;
          this.did = 0;
          this.amble(2, 0);
        },
        pose: (t) => {
          // At the front lip it climbs and tips its nose down to look at the page below.
          const at = this.depth < 0.05 && !this.walking;
          if (at && !this.did) this.did = t;
          const k = at ? span(t - this.did, 0, 0.7, 3.4, 4.2) : 0;
          this.up = 0.65 + 0.45 * k;
          this.pitch = 26 * k;
          this.puppet.add('head', 14 * k, 18 * k * sin(t, 0.45), 0);
          if (this.did && t - this.did > 4.3) this.walkTo(this.s, 0.25);
          this.expression = k > 0.3 ? 'surprised' : 'neutral';
        },
      },
      divebomb: {
        weight: 0.9,
        length: [5.6, 5.6],
        face: 'happy',
        when: this.still,
        start: () => {
          this.spec.speed = 3;
          this.spec.turn = 40;
          this.did = 0;
          this.walkTo(this.s, 0.95);
        },
        pose: (t) => {
          // Off to the back wall, then a swoop back at the front lip and up again.
          if (t > 2 && !this.did) {
            this.did = 1;
            this.walkTo(this.s + this.dir * this.heightPx * 2, 0);
          }
          this.up = t < 2 ? 1.1 : 0.15 + 0.9 * ease(t, 3.4, 4.4);
          this.pitch = t > 2 && t < 3.4 ? 26 : 0;
          this.chase = 1;
          this.rotorGoal = 1.3;
        },
      },
      follow: {
        weight: 1.2,
        length: [8, 11],
        face: 'happy',
        when: () => this.still() && this.mates().length > 0,
        start: () => {
          const all = this.mates();
          this.mate = all.find((o) => o.spec.model === 'bolt') ?? all[0] ?? null;
          this.did = 0;
          this.dir = Math.random() < 0.5 ? -1 : 1;
          this.spec.speed = 1.9;
        },
        pose: (t) => {
          // Follow the leader, a body or two behind and a little above, going where it goes.
          const o = this.mate;
          if (!o || o.state === 'gone') return;
          this.chase = 1;
          const lift =
            o.free && this.env ? (this.env.frame.bottom - o.free.y) / this.heightPx : 0.5;
          this.up = clamp(0.4 + lift * 0.7, 0.4, 1.9);
          if (t - this.did > 0.5) {
            this.did = t;
            const to = this.at(o) + this.dir * (this.widthPx() * 0.9 + o.spec.width * o.px * 0.5);
            this.walkTo(to, o.depth);
          }
        },
      },
    };
  }

  // ---------- Acts: showing off ----------

  private shows(): Record<string, Act> {
    return {
      barrel: {
        weight: 1.3,
        length: [1.9, 1.9],
        face: 'happy',
        when: this.still,
        start: () => (this.dir = Math.random() < 0.5 ? -1 : 1),
        pose: (t) => {
          // Up, right over, and level again.
          this.up = 0.5 + 0.3 * span(t, 0, 0.4, 1.3, 1.9);
          this.roll = this.dir * 360 * ease(t, 0.4, 1.3);
          this.chase = 1;
          this.rotorGoal = 1.3;
        },
      },
      loop: {
        weight: 1.1,
        length: [2.6, 2.6],
        face: 'surprised',
        when: this.still,
        start: () => (this.dir = Math.random() < 0.5 ? -1 : 1),
        pose: (t) => {
          // A loop-the-loop in the air, a full turn round a circle.
          const a = 2 * Math.PI * ease(t, 0.3, 2.2);
          const R = 0.2;
          this.up = 0.85;
          this.sx = this.dir * R * Math.sin(a);
          this.sy = R * (1 - Math.cos(a));
          this.roll = -this.dir * a * DEG;
          this.chase = 1;
          this.rotorGoal = 1.3;
        },
      },
      eight: {
        weight: 0.9,
        length: [4.2, 4.2],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // A figure eight, leaning into each turn.
          const k = span(t, 0, 0.5, 3.6, 4.2);
          const a = 2 * Math.PI * ease(t, 0.3, 3.9);
          this.up = 0.85;
          this.sx = 0.3 * Math.sin(a) * k;
          this.sy = 0.11 * Math.sin(2 * a) * k;
          this.roll = -22 * Math.cos(a) * k;
          this.chase = 1;
        },
      },
      upsideDown: {
        weight: 1,
        length: [5, 6],
        face: 'sleepy',
        when: this.still,
        pose: (t) => {
          // Rolls over and hangs there, rotors and all, bobbing lazily, then rolls back.
          const k = span(t, 0.2, 1.1, this.actLength - 1.2, this.actLength - 0.2);
          this.roll = 180 * k;
          this.up = 0.7 + 0.05 * sin(t, 0.4);
          this.sy = 0.02 * sin(t, 0.4) * k;
          this.expression = k > 0.5 ? 'happy' : 'neutral';
        },
      },
      rev: {
        weight: 0.8,
        length: [2.8, 3.2],
        face: 'focused',
        when: this.still,
        pose: (t) => {
          // Revs its rotors as hard as they go, shaking, lights blazing.
          const k = span(t, 0, 0.4, 2.2, 2.8);
          this.rotorGoal = 1 + 0.9 * k;
          this.up = 0.5 + 0.25 * k;
          this.sx = 0.006 * Math.sin(t * 60) * k;
          this.pitch = -6 * k;
          this.glow = k;
          this.chase = 1;
        },
      },
      wave: {
        weight: 1.2,
        length: [3, 3.6],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // A wave of the claw at us, the whole drone tipping with it.
          const k = span(t, 0.2, 0.7, this.actLength - 0.7, this.actLength - 0.2);
          this.gripGoal = 0.9 * (0.5 + 0.5 * sin(t, 2.2)) + 0.1;
          this.puppet.add('arm', -35 * k, 0, 10 * k * sin(t, 2.2));
          this.roll = 6 * k * sin(t, 1.1);
          this.up = 0.55;
          this.mood = BEACON.happy ?? null;
        },
      },
      hiccup: {
        weight: 0.8,
        length: [4, 4.6],
        face: 'surprised',
        when: this.still,
        pose: (t) => {
          // Hic: a sudden drop and a jump back up, every so often, the beacon flashing.
          const n = Math.floor(t / 1.15);
          const u = t - n * 1.15;
          const hic = n < 3 && u < 0.35 ? Math.sin((Math.PI * u) / 0.35) : 0;
          this.up = 0.5 - 0.22 * hic;
          this.pitch = -10 * hic;
          this.glow = hic;
          this.rotorGoal = 1 - 0.4 * hic;
          if (n < 3 && u < 0.03) this.puppet.kick('beacon', 800, 0, 0);
        },
      },
      hopHop: {
        weight: 0.9,
        length: [3.4, 3.8],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // Bounces off the floor like a ball, landing on its skids each time.
          const k = span(t, 0, 0.2, 3, 3.4);
          const b = Math.abs(Math.sin(Math.PI * 1.25 * t));
          this.up = 0.75 * b * k;
          this.rotorGoal = 0.4 + 0.8 * b;
          this.pitch = 4 * Math.cos(Math.PI * 1.25 * t) * k;
        },
      },
    };
  }

  // ---------- Acts: jobs, with the beam, the flash and the claw ----------

  private jobs(): Record<string, Act> {
    return {
      spotlight: {
        weight: 1.3,
        length: [5, 6],
        face: 'focused',
        when: this.still,
        pose: (t) => {
          // The searchlight comes on and sweeps the floor, side to side.
          const k = span(t, 0.3, 0.8, this.actLength - 0.8, this.actLength - 0.3);
          this.up = 0.85;
          this.beam = k;
          this.beamRoll = 28 * sin(t, 0.32);
          this.beamPitch = 14 * sin(t, 0.21, 0.3);
          this.roll = -this.beamRoll * 0.2 * k;
          this.glow = k;
        },
      },
      scan: {
        weight: 1.3,
        length: [7, 9],
        face: 'focused',
        when: () => this.still() && this.mates().length > 0,
        start: () => {
          this.mate = this.mates()[0] ?? null;
          this.did = 0;
          this.spec.speed = 1.5;
          const o = this.mate;
          if (o) {
            // Off to one side of it, beside its head.
            this.dir = this.at(o) > this.s ? 1 : -1;
            this.walkTo(
              this.at(o) - this.dir * (this.widthPx() * 0.95 + o.spec.width * o.px * 0.5),
              o.depth,
            );
          }
        },
        pose: (t) => {
          // Runs the beam over the crewmate, top to bottom, twice, then a blip of approval.
          const o = this.mate;
          const near = !this.walking && this.actT > 1;
          if (near && !this.did) this.did = t;
          const k = near
            ? span(
                t - this.did,
                0,
                0.5,
                this.actLength - this.did - 1.4,
                this.actLength - this.did - 0.8,
              )
            : 0;
          if (o) this.up = clamp((o.heightPx * 0.5) / this.heightPx + 0.3, 0.5, 1.3);
          this.beam = k;
          this.beamRoll = this.dir * (70 + 6 * sin(t, 0.9));
          this.beamPitch = 30 * sin(t, 0.45);
          this.roll = -this.dir * 6 * k;
          this.glow = k;
          this.chase = 1 - k;
          this.mood = k > 0.5 ? (BEACON.focused ?? null) : null;
          this.expression = near && this.actLength - t < 1 ? 'happy' : 'focused';
        },
      },
      photo: {
        weight: 1.3,
        length: [5.4, 5.4],
        face: 'focused',
        when: this.still,
        pose: (t) => {
          // Tips its nose to frame the shot, holds still, and: click, flash. Three times.
          const k = span(t, 0.2, 0.8, 4.8, 5.3);
          this.up = 0.75;
          this.pitch = 10 * k;
          const shots = [1.6, 3.1, 4.4];
          let f = 0;
          for (const s of shots) if (t > s && t < s + 0.25) f = Math.max(f, 1 - (t - s) / 0.25);
          this.flash = f;
          this.glow = f;
          this.puppet.add('head', -6 * k, 0, 0);
          this.puppet.add('arm', 12 * k, 0, 0);
          this.expression = f > 0.2 ? 'wink' : t > 2.6 && t < 3.1 ? 'happy' : 'focused';
        },
      },
      deliver: {
        weight: 1.3,
        length: [9, 9],
        face: 'happy',
        when: this.still,
        start: () => {
          this.spec.speed = 1.1;
          this.did = 0;
          this.dir = Math.random() < 0.5 ? -1 : 1;
          this.pkgGoal = 1;
        },
        pose: (t) => {
          // Takes up a package in its claw, carries it across swaying under it, lowers the
          // claw to the floor, lets go, and the package is delivered (with a flash).
          const carry = ease(t, 0.6, 1.4);
          this.pkgGoal = t < 6.6 ? carry : 0;
          this.gripGoal = t < 1 ? 0.9 : t < 6 ? 0.05 : 0.9;
          if (t > 1.5 && !this.did) {
            this.did = 1;
            this.amble(3.5, undefined, this.dir);
          }
          const down = span(t, 4.6, 5.6, 6.6, 7.6);
          this.up = 0.75 - 0.35 * down;
          this.puppet.add('arm', 0, 0, 0);
          this.pkgY = -0.02 * down;
          this.chase = 1;
          this.flash = t > 6.6 && t < 6.85 ? 1 - (t - 6.6) / 0.25 : 0;
          this.expression = t > 6.6 ? 'love' : 'happy';
          if (t > 8.2) this.pkgGoal = 0;
        },
      },
      toss: {
        weight: 1,
        length: [5, 5.4],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // Tosses its package up and catches it, three times, tipping to watch it go.
          const k = span(t, 0, 0.4, this.actLength - 0.6, this.actLength - 0.2);
          this.pkgGoal = k;
          const u = (t - 0.6) % 1.4;
          const n = Math.floor((t - 0.6) / 1.4);
          const air = t > 0.6 && n < 3 && u < 1.0 ? Math.sin((Math.PI * u) / 1.0) : 0;
          this.pkgY = 0.2 * air;
          this.gripGoal = air > 0.05 ? 0.9 : 0.1;
          this.puppet.add('head', -14 * air, 0, 0);
          this.up = 0.65 + 0.06 * air;
        },
      },
      inspectClaw: {
        weight: 1,
        length: [4.6, 5],
        face: 'focused',
        when: this.still,
        pose: (t) => {
          // Looks down at its own claw, works it open and shut, seems pleased.
          const k = span(t, 0.2, 0.8, this.actLength - 0.8, this.actLength - 0.2);
          this.gripGoal = 0.5 + 0.5 * sin(t, 0.9);
          this.puppet.add('head', 26 * k, 0, 0);
          this.puppet.add('arm', -18 * k, 0, 0);
          this.pitch = 8 * k;
          this.up = 0.6;
          this.expression = t > this.actLength - 1.2 ? 'happy' : 'focused';
        },
      },
      buzz: {
        weight: 1.4,
        length: [7, 8],
        face: 'wink',
        when: () => this.still() && this.mates().length > 0,
        start: () => {
          this.mate = this.mates()[0] ?? null;
          this.did = 0;
          this.spec.speed = 1.8;
          const o = this.mate;
          if (o) this.walkTo(this.at(o), o.depth);
        },
        pose: (t) => {
          // A cheeky buzz round a crewmate's head: circles it, quick, close, showing off.
          const o = this.mate;
          const k = span(t, 1.2, 2, this.actLength - 1.6, this.actLength - 0.6);
          if (o) this.up = clamp((o.heightPx * 1.05) / this.heightPx, 0.5, 1.9);
          const a = 2 * Math.PI * 1.1 * (t - 1.2);
          this.sx = 0.24 * Math.sin(a) * k;
          this.sy = 0.05 * Math.cos(a) * k;
          this.roll = -16 * Math.cos(a) * k;
          this.chase = 1;
          this.rotorGoal = 1.2;
          this.expression = k > 0.4 ? 'wink' : 'happy';
        },
      },
    };
  }

  // ---------- Acts: on the ground, and tired ----------

  private ground(): Record<string, Act> {
    return {
      rest: {
        weight: 1.3,
        length: [8, 11],
        face: 'sleepy',
        when: this.still,
        pose: (t) => {
          // Lands on its skids, rotors winding down, and sits there ticking; then spools
          // up and lifts off again.
          const down = span(t, 0.2, 1.4, this.actLength - 1.6, this.actLength - 0.3);
          this.up = 0.5 * (1 - down);
          this.rotorGoal = 1 - down;
          this.mood = down > 0.5 ? '#8a8a84' : null;
          this.expression = down > 0.5 ? 'sleepy' : 'happy';
        },
      },
      lowBattery: {
        weight: 0.7,
        length: [11, 11],
        when: this.still,
        start: () => (this.charge = 0),
        pose: (t) => {
          // The rotors sputter, it sags and wobbles, drops onto the floor with a thump,
          // sits there charging (the rotor rings filling one by one), then hops back up.
          const sag = ease(t, 0, 3.2);
          const dead = ease(t, 3.2, 3.6);
          const wake = ease(t, 8.4, 10);
          this.up = (0.5 - 0.5 * sag) * (1 - wake) + 0.5 * wake;
          if (t < 3.6)
            this.up =
              0.5 - 0.35 * sag + 0.05 * Math.sin(t * 7) * (1 - sag) - (dead > 0 ? 0.15 * dead : 0);
          this.rotorGoal =
            t < 3.4
              ? 0.7 + 0.3 * Math.sin(t * 9) * Math.sin(t * 5.3) - 0.5 * sag
              : t < 8.4
                ? 0
                : 0.5 + 0.5 * wake;
          this.roll = t < 3.4 ? 10 * sag * Math.sin(t * 2.6) : 0;
          this.pitch = t < 3.4 ? 8 * sag : 0;
          this.puppet.add('head', 18 * ease(t, 2, 3.4) * (1 - ease(t, 8.4, 9.2)), 0, 0);
          this.mood = t < 8.6 ? RED : (BEACON.happy ?? null);
          this.charge = t > 4 && t < 8.4 ? clamp((t - 4) / 4.4, 0, 1) : t >= 8.4 ? 1 : 0;
          this.expression = t < 3.6 ? 'sad' : t < 8.2 ? 'asleep' : 'happy';
          if (t > 3.2 && t < 3.25) this.puppet.kick('body', -200, 0, 0);
        },
      },
    };
  }

  // ---------- Acts: more little tricks ----------

  private extras(): Record<string, Act> {
    return {
      sputter: {
        weight: 0.9,
        length: [6, 6],
        when: this.still,
        pose: (t) => {
          // One rotor coughs: the hover wobbles and tips, the beacon goes amber, it whacks
          // its own side with the claw arm, and the whirr comes back smooth.
          const bad = span(t, 0.2, 0.6, 2.6, 3.0);
          const cough = Math.sin(t * 11) * Math.sin(t * 4.3);
          this.rotorGoal = 1 - 0.5 * bad * (0.5 + 0.5 * cough);
          this.roll = 12 * bad * Math.sin(t * 3.1) + 5 * bad * cough;
          this.up = 0.5 - 0.15 * bad + 0.04 * bad * cough;
          this.pitch = -6 * bad;
          this.mood = t < 3.4 ? '#f0b040' : null;
          const whack = t > 3.0 && t < 3.6 ? Math.sin((Math.PI * (t - 3)) / 0.6) : 0;
          this.puppet.add('arm', 0, 0, 40 * whack);
          if (t > 3.2 && t < 3.25) this.puppet.kick('body', 0, 0, -160);
          const fixed = ease(t, 3.4, 3.8);
          if (fixed > 0 && t < 4.4) this.rotorGoal = 1 + 0.8 * fixed * (1 - ease(t, 3.8, 4.4));
          this.expression = t < 3 ? 'surprised' : t < 3.6 ? 'cross' : 'happy';
        },
      },
      beat: {
        weight: 0.9,
        length: [5, 6],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // Bobs to a beat only it can hear: a bounce on every beat, the belt lights
          // flashing with it, head nodding, a little roll on the off beat.
          const k = span(t, 0.2, 0.8, this.actLength - 0.8, this.actLength - 0.2);
          const beat = (t * 2.2) % 1;
          const pulse = Math.exp(-beat * 5);
          this.up = 0.55 + 0.16 * pulse * k;
          this.roll = 7 * k * sin(t, 1.1);
          this.pitch = -5 * pulse * k;
          this.puppet.add('head', 10 * pulse * k, 0, 0);
          this.glow = 0.9 * pulse * k;
          this.rotorGoal = 1 + 0.4 * pulse * k;
          this.mood = RAINBOW[Math.floor(t * 2.2) % RAINBOW.length] ?? null;
        },
      },
      startle: {
        weight: 0.6,
        length: [5.2, 5.2],
        face: 'surprised',
        when: this.still,
        pose: (t) => {
          // Something spooks it: straight up to the ceiling with a flash, trembling up there,
          // then a slow sink back down, sheepish.
          const up = ease(t, 0, 0.35) * (1 - ease(t, 2.6, 4.4));
          this.up = 0.5 + 1.3 * up;
          this.rotorGoal = 1.6 * (1 - ease(t, 2.6, 4)) + 1;
          this.sx = 0.006 * Math.sin(t * 50) * up;
          this.flash = t < 0.3 ? 1 - t / 0.3 : 0;
          this.glow = up;
          this.mood = RED;
          this.pitch = -8 * ease(t, 0, 0.3) * (1 - ease(t, 0.6, 1.2));
          this.expression = t < 3.4 ? 'surprised' : 'happy';
          if (t > 3.4) this.mood = null;
        },
      },
      takeoff: {
        weight: 0.9,
        length: [6.4, 6.4],
        face: 'focused',
        when: this.still,
        pose: (t) => {
          // Sets down, spins the rotors up from nothing with the whole hull shivering, and
          // lifts off nose-down with a lurch.
          const down = span(t, 0, 0.9, 5.4, 5.9);
          const spin = ease(t, 0.9, 3.4);
          const lift = ease(t, 3.6, 4.8);
          this.up =
            t < 3.6
              ? 0.5 * (1 - down)
              : 0.5 * ease(t, 3.6, 4.6) * 1.2 * (1 - 0.17 * ease(t, 4.8, 6));
          this.rotorGoal = t < 3.6 ? 2 * spin * spin : 1 + 1 * (1 - ease(t, 3.6, 5.6));
          this.sx = 0.004 * Math.sin(t * 45) * spin * (1 - lift);
          this.pitch = 10 * ease(t, 3.4, 4.2) * (1 - ease(t, 4.2, 5.4));
          this.glow = spin * (1 - lift);
          this.mood = t < 4 ? '#f0b040' : null;
          this.expression = t < 3.6 ? 'focused' : 'happy';
        },
      },
      dust: {
        weight: 1,
        length: [7.5, 8.5],
        face: 'focused',
        when: () => this.still() && this.mates().length > 0,
        start: () => {
          this.mate = this.mates()[0] ?? null;
          this.did = 0;
          this.spec.speed = 1.7;
          const o = this.mate;
          if (o) this.walkTo(this.at(o), o.depth);
        },
        pose: (t) => {
          // Hovers over a crewmate, nose down, rotors roaring: dusting it with rotor wash,
          // sweeping to and fro along it, the crewmate rocking in the gale.
          const o = this.mate;
          const near = !this.walking && t > 1;
          const k = near ? span(t, 1.4, 2.2, this.actLength - 1.6, this.actLength - 0.8) : 0;
          if (o) this.up = clamp((o.heightPx * 1.25) / this.heightPx, 0.6, 2);
          this.rotorGoal = 1 + 0.9 * k;
          this.sx = 0.16 * Math.sin(t * 1.9) * k;
          this.pitch = 16 * k;
          this.roll = 8 * Math.cos(t * 1.9) * k;
          this.glow = 0.6 * k;
          if (o && k > 0.5 && Math.floor(t * 3) !== Math.floor((t - 0.03) * 3))
            o.puppet.kick('body', 0, 0, (Math.random() < 0.5 ? -1 : 1) * 90);
          this.expression = k > 0.4 ? 'focused' : 'happy';
        },
      },
      pointer: {
        weight: 0.9,
        length: [5, 6],
        face: 'happy',
        when: () => this.still() && !!this.env?.pointer.present,
        start: () => {
          this.did = 0;
          this.spec.speed = 2;
        },
        pose: (t) => {
          // Follows the mouse pointer along the floor for a moment, like a puppy on a string.
          this.chase = 1;
          this.up = 0.7;
          const env = this.env;
          if (env && t - this.did > 0.45) {
            this.did = t;
            const [lo, hi] = this.span(env.frame);
            this.walkTo(
              clamp(env.pointer.x, lo, hi),
              env.pointer.y > env.frame.bottom - this.heightPx * 4 ? 0.1 : 0.4,
            );
          }
          this.mood = t > this.actLength - 1 ? null : '#9fefff';
        },
      },
    };
  }

  // ---------- Reactions ----------

  private reactions(): Record<string, Act> {
    return {
      poked: {
        weight: 0,
        length: [1.6, 1.8],
        face: 'surprised',
        pose: (t) => {
          // Straight up in the air, flashing, rotors screaming, then settling.
          const up = t < 0.5 ? Math.sin((Math.PI * t) / 0.5) : 0;
          this.up = 0.5 + 0.7 * up;
          this.rotorGoal = 1.5;
          this.flash = t < 0.3 ? 1 - t / 0.3 : 0;
          this.glow = span(t, 0, 0.1, 0.9, 1.5);
          this.pitch = -12 * up;
          this.chase = 1;
        },
      },
      dizzy: {
        weight: 0,
        length: [4.2, 4.2],
        face: 'dizzy',
        pose: (t) => {
          // Spins round and round on the spot, wobbling and sinking, then rights itself.
          const k = 1 - ease(t, 2.8, 4);
          this.yaw = 360 * 3 * (1 - Math.exp(-t * 1.1)) * k;
          this.roll = 16 * k * Math.sin(t * 5);
          this.pitch = 10 * k * Math.cos(t * 4);
          this.up = 0.5 - 0.15 * k;
          this.rotorGoal = 0.75 + 0.25 * (1 - k);
          this.glow = 0.5 * k;
        },
      },
      pleased: {
        weight: 0,
        length: [3, 4],
        face: 'love',
        pose: (t) => {
          // Rises toward the mouse and does a happy waggle.
          const k = ease(t, 0, 0.5) * (1 - ease(t, this.actLength - 0.6, this.actLength));
          this.up = 0.5 + 0.35 * k;
          this.roll = 12 * k * sin(t, 1.6);
          this.puppet.add('head', 0, 0, 10 * k * sin(t, 1.6, 0.25));
          this.glow = k;
          this.chase = 1;
        },
      },
    };
  }

  poke() {
    if (this.state !== 'here') return;
    const now = performance.now() / 1000;
    this.pokes = [...this.pokes.filter((at) => now - at < 2.5), now];
    this.goal = null;
    this.spec.turn = 24;
    if (this.pokes.length >= 3) {
      this.pokes = [];
      this.setAct('dizzy');
    } else if (this.act !== 'dizzy') {
      this.setAct('poked');
      this.alt.kick(2.5);
    }
  }

  // ---------- Posing ----------

  protected idle(t: number) {
    const p = this.puppet;
    this.up = 0.5;
    this.rotorGoal = 1;
    this.roll = this.yaw = this.pitch = 0;
    this.sx = this.sy = 0;
    this.beam = this.flash = this.glow = 0;
    this.beamRoll = this.beamPitch = 0;
    this.gripGoal = 0.4;
    this.pkgGoal = 0;
    this.pkgY = this.pkgX = 0;
    this.mood = null;
    this.charge = -1;
    this.chase = 0;
    this.expression = this.hovered ? 'happy' : 'neutral';
    if (
      this.act !== 'zoom' &&
      this.act !== 'divebomb' &&
      this.act !== 'follow' &&
      this.act !== 'pointer'
    )
      this.spec.speed = this.act === 'deliver' ? 1.1 : this.act === 'roam' ? 1.5 : 1.3;
    if (this.act !== 'zoom' && this.act !== 'divebomb') this.spec.turn = 24;
    // Hovering: the body sways a little on its own, the beacon and the claw a beat behind.
    p.add('body', 1.6 * sin(t, 0.33), 0, 2.4 * sin(t, 0.21));
    p.add('head', 2 * sin(t, 0.27, 0.3), 3 * sin(t, 0.13), 0);
    p.add('beacon', 5 * sin(t, 0.6), 0, 8 * sin(t, 0.44));
    p.add('arm', 3 * sin(t, 0.4), 0, 5 * sin(t, 0.3, 0.2));
  }

  protected move(dt: number, env: Env) {
    this.env = env;
    super.move(dt, env);
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    this.env = env;
    const H = this.heightPx;
    const act = this.act;

    // Rest the mouse on it and it is delighted.
    this.hover = this.hovered ? this.hover + dt : 0;
    if (this.hover > 0.9 && act === 'idle' && this.still()) this.setAct('pleased');

    // Height: chases where it wants to be, with the bob of a hover and a thump on landing.
    const bob = 0.025 * Math.sin(this.t * 2.2) * clamp(this.rotors.y, 0, 1);
    const alt = this.alt.update(dt, this.up + bob);
    this.h = Math.max(0, alt * H);

    // Leaning into the way it goes: roll into a sideways run, nose down toward us.
    const pace = this.pace / Math.max(H * 2.4, 1);
    const toward = -this.vz / Math.max(H * 2.4, 1);
    const l = this.lean.update(dt, clamp(pace, -1.4, 1.4));
    p.add('body', 14 * clamp(toward, -1, 1), 0, -16 * l);
    p.add('head', 0, 0, 6 * l);
    p.add('arm', 0, 0, 14 * l);
    p.add('beacon', 0, 0, -12 * l);
    p.add('root', 0, 0, 0);
    p.add('body', this.pitch);

    // Claw and package.
    const g = clamp(this.grip.update(dt, this.gripGoal), -0.2, 1.2);
    p.add('claw.L', 0, 0, 26 * g);
    p.add('claw.R', 0, 0, -26 * g);
    void act;
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    const t = env.time;
    const H = this.heightPx;

    // Rotors: spin up and down, each way round, too quick for a spring.
    const speed = clamp(this.rotors.update(dt, this.rotorGoal), 0, 2);
    this.turns += speed * dt * 14;
    for (const [bone, side] of ROTORS) p.swing(bone, side * this.turns * 360);

    // Whole-body turns that go past what a spring can do: rolls, loops, spins.
    if (this.roll || this.yaw) p.turn('body', 0, this.yaw, this.roll);
    p.shift('root', this.sx, this.sy, 0);

    // The searchlight beam: long enough to reach the floor from here.
    const metres = this.spec.metres;
    const reach = (LAMP + (this.h / Math.max(H, 1)) * metres) / BEAM;
    const b = clamp(this.beam, 0, 1);
    const w = Math.max(0.001, b);
    p.stretch('beam', Math.max(0.001, b * reach), [0, -1, 0], w);
    p.add('beam', this.beamPitch, 0, this.beamRoll);
    // The camera flash star.
    const f = Math.max(0.001, this.flash * (1.1 + 0.3 * Math.sin(t * 40)));
    p.stretch('flash', f, [0, 1, 0], f);

    // The package, held in the claw (it pops in and out with a bounce).
    const s = Math.max(0.001, this.pkgS.update(dt, this.pkgGoal));
    p.stretch('pkg', s, [0, 1, 0], s);
    p.shift('pkg', this.pkgX, this.pkgY, 0);

    this.lights(t);
  }

  /** The rotor rings, the belt, the lamp and the beacon. */
  private lights(t: number) {
    const act = this.act;
    const flying = this.h > 2 && this.rotors.y > 0.3;
    const rev = this.rotorGoal > 1.1;
    // Lamp: the beam and the flash.
    this.outfit.dot(0, this.beam > 0.05 || this.flash > 0.05 ? 1 : 0.25 + 0.15 * Math.sin(t * 1.3));
    // Rotor rings: pulsing in flight, filling up while it charges, dark when landed.
    for (let i = 0; i < 4; i++) {
      let level: number;
      if (this.charge >= 0 && this.rotors.y < 0.2)
        level = this.charge * 4 > i ? 0.8 + 0.2 * Math.sin(t * 6) : 0.1;
      else if (act === 'dizzy') level = Math.random() < 0.5 ? 1 : 0.15;
      else if (rev || this.glow > 0.4) level = 0.6 + 0.4 * Math.sin(t * 24 + i * 1.6);
      else if (flying)
        level = 0.35 + 0.4 * Math.max(0, Math.sin(t * 7 - i * 1.5)) + 0.1 * this.rotors.y;
      else level = 0.12 + 0.05 * Math.sin(t * 1.2 + i);
      this.outfit.dot(1 + i, level);
    }
    // The belt: a chase along it when it cruises, a slow breath otherwise.
    for (let i = 0; i < 3; i++) {
      let level: number;
      if (act === 'dizzy') level = Math.random() < 0.5 ? 1 : 0.2;
      else if (this.chase) level = 0.15 + 0.85 * Math.max(0, Math.cos(t * 10 - i * 1.3));
      else if (act === 'rest' || this.rotors.y < 0.2)
        level = 0.1 + 0.06 * Math.sin(t * 0.9 - i * 0.4);
      else if (this.glow > 0) level = 0.4 + 0.6 * this.glow;
      else level = 0.45 + 0.35 * Math.sin(t * 1.6 - i * 0.7);
      this.outfit.dot(5 + i, level);
    }
    // Beacon: the mood, or the act's colour.
    let colour = this.mood ?? BEACON[this.expression] ?? '#f4f4f1';
    if (act === 'poked' || act === 'hiccup') colour = RAINBOW[Math.floor(t * 12) % RAINBOW.length];
    if (act === 'dizzy') colour = RAINBOW[Math.floor(t * 9) % RAINBOW.length];
    if (act === 'lowBattery' && this.mood === RED && Math.sin(t * 5) < 0) colour = '#4a1a16';
    if (this.beam > 0.3 && !this.mood) colour = '#fff2c8';
    if (this.flash > 0.1) colour = '#ffffff';
    this.outfit.beacon(colour);
  }
}
