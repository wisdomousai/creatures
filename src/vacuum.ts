import { Color, type Object3D, Quaternion, Vector3 } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Act, Character, clamp, type Env } from './character';
import type { Expression, FaceLayout } from './face';
import { sin } from './moves';
import { Spring } from './spring';

/**
 * Zoom, the robot vacuum: a small, busy disc with a bumper that has a groove and a row of
 * five cliff-sensor lights, a lid with a panel line and a vent grille, a status light
 * with three battery lights behind it, a dust bin hatch on a hinge, a little antenna with
 * a lit tip, treaded wheels showing at the rim, two side brushes with bristle tufts, and
 * a charging plate at the back. He keeps a small ball inside himself for pushing about.
 *
 * A disc has no tail or ears, so he shows how he feels the way a vacuum can: his status
 * light in Bolt's beacon colours (green while he works, a slow blue breath while he's
 * docked and charging, blinking when he's bonked), the battery lights (they drain as he
 * works and fill while he charges), the cliff sensors (they sweep while he drives and
 * all flash at an edge), his antenna (it droops when he is sleepy and flicks when he is
 * startled), his brushes (whirring while he cleans, still while he dozes), wiggles, and
 * the eyes on his screen strip.
 *
 * He cleans in lines, zigzags over a spot he has missed, spirals outwards, works along
 * the back wall and the front lip, scares himself at the lip, chases a crumb, gets
 * stuck and frees himself, races and follows crewmates, tips up on one wheel or pops a
 * wheelie, pushes his ball along, sneezes dust, empties his full bin with a puff, spins
 * for joy or dances, runs a victory lap, naps, docks to charge, and limps to the dock
 * when the battery runs low. He does not steer round the others: he bonks into them.
 */
export const VACUUM_FACE: FaceLayout = {
  width: 512,
  height: 160,
  eyes: [
    [0.37, 0.5],
    [0.63, 0.5],
  ],
  rx: 0.05,
  ry: 0.3,
  line: 0.03,
  mouth: null,
};

const BRUSHES = [
  ['brush.L', 1],
  ['brush.R', -1],
] as const;
const WHEELS = [
  ['wheel.L', 1],
  ['wheel.R', -1],
] as const;
const ALONG = new Vector3(0, 1, 0);
const q = new Quaternion();
const colour = new Color();
const TAU = Math.PI * 2;
const OFF = '#55554f';
/** The ball's radius in metres, and the wheels'. */
const BALL = 0.026;
const WHEEL = 0.03;

const ease = (t: number, a: number, b: number) => {
  const u = clamp((t - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
};
/** A bump from 0 up to 1 and back over `length` seconds, starting at `at`. */
const pulse = (t: number, at: number, length: number) =>
  t > at && t < at + length ? Math.sin(((t - at) / length) * Math.PI) : 0;

type Sensors = 'scan' | 'alarm' | 'ripple' | 'off';

export class Vacuum extends Character {
  private env: Env | null = null;
  private brush = 0;
  private brushSpeed = 0;
  private bump = new Spring(4, 0.35);
  private light = new Color(BEACON.neutral);
  private pokes: number[] = [];
  private backedOff = false;
  /** Which way he backs off after a bonk: away from what he hit. */
  private away = 1;
  private zig = 0;
  private stage = 0;
  private dir = 1;
  private origin = 0;
  private charge = 0.9;
  private rollAngle = 0;
  private ahead = new Spring(5, 0.5, 1, 0.02);
  private toyScale = 0;
  private lastStep = -1;
  private last = 0;

  // Per-frame requests from acts, cleared in idle().
  private speedReq = 2.5;
  private turnReq = 45;
  private whirrReq: number | null = null;
  private wheelReq: [number, number] | null = null;
  private reverse = false;
  private yawReq = 0;
  private binReq = 0;
  private puffReq = 0;
  private toyReq = 0;
  private lamp: string | null = null;
  private sensors: Sensors | null = null;
  private charging = false;
  private tipBlink = 0;
  private actExpr: Expression | null = null;

  constructor(model: Object3D) {
    super(
      {
        name: 'Zoom',
        model: 'vacuum',
        metres: 0.1,
        width: 0.35,
        size: 0.3,
        feels: {
          default: { f: 3, zeta: 0.6 },
          body: { f: 3, zeta: 0.5 },
          antenna: { f: 5, zeta: 0.25 },
          bin: { f: 7, zeta: 0.45 },
        },
        face: VACUUM_FACE,
        eyes: 0.66,
        gaze: [{ bone: 'body', yaw: 0.5, pitch: 0 }],
        reach: { yaw: 40, pitch: 15 },
        lag: 0.8,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [30, 70],
        speed: 2.5,
        steers: false,
        turn: 45,
      },
      model,
    );
    this.acts = {
      ...this.cleaning(),
      ...this.antics(),
      ...this.mishaps(),
      ...this.company(),
      ...this.rests(),
      ...this.reactions(),
    };
  }

  // ---------- Who and where ----------

  private still = () => !this.walking && !this.door && this.edge === 'bottom';
  private across = () => this.widthPx();

  private mates() {
    return (this.env?.crew ?? [])
      .filter((o) => o !== this && o.state === 'here' && o.edge === this.edge && !o.free)
      .sort((a, b) => Math.abs(a.s - this.s) - Math.abs(b.s - this.s))
      .filter((o) => Math.abs(o.s - this.s) < this.across() * 14);
  }

  /** The way along the floor with more room, and how much there is. */
  private room(): [number, number] {
    if (!this.env) return [1, 0];
    const [lo, hi] = this.span(this.env.frame);
    const way = this.s - lo > hi - this.s ? -1 : 1;
    return [way, (way > 0 ? hi - this.s : this.s - lo) - this.across() * 0.6];
  }

  /** Walk `widths` of his own width along the floor, mostly the way with more room. */
  private rollBy(widths: number, depth?: number, way?: number) {
    const [more, room] = this.room();
    const w = way ?? (Math.random() < 0.7 ? more : -more);
    const far = Math.min(Math.max(room, 0), this.across() * widths);
    this.walkTo(this.s + w * Math.max(far, this.across() * 0.8), depth);
  }

  /** Finish the act now (its length is only a ceiling for the ones that walk somewhere). */
  private finish(t: number) {
    this.actLength = Math.min(this.actLength, t + 0.05);
  }

  private begin() {
    this.stage = 0;
    this.last = 0;
    this.lastStep = -1;
    this.origin = this.s;
  }

  /** Next stage of a walk: true once at the moment he has got where he was going. */
  private arrivedAt(t: number, min = 0.3) {
    if (t - this.last > min && this.there) {
      this.last = t;
      this.stage++;
      return true;
    }
    return false;
  }

  // ---------- Acts ----------

  private cleaning(): Record<string, Act> {
    return {
      idle: { weight: 2, length: [2, 4] },
      clean: {
        weight: 4,
        length: [3, 6],
        face: 'focused',
        when: this.still,
        start: () => this.rollBy(1 + Math.random() * 2),
      },
      zigzag: {
        weight: 1.5,
        length: [3, 4],
        face: 'focused',
        when: this.still,
        start: () => (this.zig = 0),
        pose: (t) => {
          // Back and forth over the same spot.
          const n = Math.floor(t / 0.7);
          if (n > this.zig) {
            this.zig = n;
            this.walkTo(this.s + (n % 2 ? 1 : -1) * this.across() * 0.6);
          }
          this.puppet.add('body', 0, 0, 3 * sin(t, 1.4));
        },
      },
      spiral: {
        weight: 1,
        length: [7, 9],
        face: 'focused',
        when: this.still,
        start: () => {
          this.begin();
          this.dir = Math.random() < 0.5 ? 1 : -1;
        },
        pose: (t) => {
          // Round and round the spot, wider each time: a pointed walk to each next point.
          this.whirrReq = 26;
          this.speedReq = 1.6;
          const n = Math.floor(t / 0.55);
          if (n > this.stage && t < this.actLength - 0.6) {
            this.stage = n;
            const a = n * 0.95 * this.dir;
            const r = 0.4 + n * 0.12;
            this.walkTo(
              this.origin + Math.cos(a) * r * this.across(),
              0.45 + Math.sin(a) * Math.min(0.3, r * 0.25),
            );
          }
          this.puppet.add('body', 0, 0, 2 * sin(t, 1.2));
        },
      },
      wall: {
        weight: 1.2,
        length: [10, 13],
        face: 'focused',
        when: this.still,
        start: () => {
          // Off to the back wall, then along it, brushes out at the edge.
          this.begin();
          this.dir = Math.random() < 0.5 ? 1 : -1;
          this.walkTo(this.s + this.dir * this.across() * 0.4, 0.93);
        },
        pose: (t) => {
          this.whirrReq = 26;
          this.speedReq = 1.7;
          if (this.arrivedAt(t) && this.stage === 1) {
            const [more, room] = this.room();
            this.dir = room > this.across() * 2 ? more : -more;
            this.walkTo(
              this.s + this.dir * Math.min(this.across() * 3.2, Math.max(room, this.across())),
              0.93,
            );
          } else if (this.stage >= 2 && this.there) this.finish(t);
        },
      },
      lip: {
        weight: 1,
        length: [10, 13],
        face: 'focused',
        when: this.still,
        start: () => {
          // Down to the front lip and along it.
          this.begin();
          this.walkTo(this.s, 0);
        },
        pose: (t) => {
          this.whirrReq = 26;
          this.speedReq = 1.7;
          if (this.arrivedAt(t) && this.stage === 1) {
            const [more, room] = this.room();
            this.walkTo(
              this.s + more * Math.min(this.across() * 3, Math.max(room, this.across())),
              0,
            );
          } else if (this.stage >= 2 && this.there) this.finish(t);
        },
      },
      crumb: {
        weight: 1,
        length: [4, 5],
        when: this.still,
        start: () => {
          this.begin();
          this.dir = Math.random() < 0.5 ? 1 : -1;
        },
        pose: (t) => {
          // Spots a crumb, freezes, then dashes at it and slurps it up.
          this.sensors = t < 0.9 ? 'ripple' : null;
          if (t < 0.9) {
            this.lamp = BEACON.happy!;
            this.puppet.add('body', 6, 0, 0);
            this.puppet.add('antenna', 25);
          }
          if (t > 0.9 && this.stage === 0) {
            this.stage = 1;
            this.walkTo(this.s + this.dir * this.across() * 1.6, 0.1 + Math.random() * 0.5);
          }
          this.speedReq = 4;
          this.whirrReq = t > 0.9 && t < 2.6 ? 40 : null;
          if (this.stage === 1 && this.there) {
            this.stage = 2;
            this.last = t;
          }
          if (this.stage === 2) {
            const k = t - this.last;
            this.puffReq = pulse(k, 0.15, 0.35) * 0.35;
            this.puppet.add('body', 10 * pulse(k, 0, 0.3), 0, 0);
            this.lamp = k > 0.4 ? BEACON.love! : null;
          }
        },
      },
      ball: {
        weight: 1,
        length: [8, 10],
        face: 'happy',
        when: this.still,
        start: () => {
          this.begin();
          this.dir = this.room()[0];
        },
        pose: (t) => {
          // Pops his ball out in front and rolls it along the floor with his bumper.
          this.toyReq = ease(t, 0, 0.5) * (1 - ease(t, this.actLength - 0.8, this.actLength - 0.3));
          this.speedReq = 1.1;
          const n = Math.floor((t - 0.7) / 1.7);
          if (t > 0.7 && n >= this.stage && t < this.actLength - 1.6) {
            this.stage = n + 1;
            this.ahead.kick(6);
            this.rollBy(1.2, 0.2 + Math.random() * 0.5, this.dir * (n % 2 ? -1 : 1));
          }
          this.whirrReq = 12;
        },
      },
    };
  }

  private antics(): Record<string, Act> {
    return {
      spin: { weight: 1, length: [1.5, 1.5], face: 'happy', when: this.still },
      dance: {
        weight: 0.9,
        length: [4, 5],
        face: 'wink',
        when: this.still,
        pose: (t) => {
          // Twists to the left and right, shoulders up and down, lights running.
          const k = ease(t, 0, 0.3) * (1 - ease(t, this.actLength - 0.4, this.actLength));
          this.yawReq = k * 0.9 * Math.sin(t * 6.5);
          this.puppet.add('body', 0, 0, 10 * k * Math.sin(t * 6.5 + 1.5));
          this.puppet.add('body', 4 * k * Math.sin(t * 13), 0, 0);
          this.puppet.add('antenna', 0, 0, 40 * k * Math.sin(t * 6.5 + 2));
          this.sensors = 'ripple';
          this.lamp = RAINBOW[Math.floor(t * 5) % RAINBOW.length];
          this.whirrReq = 34;
          this.wheelReq = [k * 6 * Math.sin(t * 6.5), k * 6 * Math.sin(t * 6.5)];
        },
      },
      lookaround: {
        weight: 1.3,
        length: [3.5, 5],
        when: this.still,
        pose: (t) => {
          // Turns to look one way, then the other, sensors sweeping.
          const k = ease(t, 0, 0.4) * (1 - ease(t, this.actLength - 0.5, this.actLength));
          this.yawReq = k * (0.7 * Math.sin(t * 1.6) + 0.15 * Math.sin(t * 4.1));
          this.sensors = 'scan';
          this.puppet.add('antenna', 8 * Math.sin(t * 3));
          this.wheelReq = [0, 0];
        },
      },
      ping: {
        weight: 0.9,
        length: [2.4, 3],
        face: 'surprised',
        when: this.still,
        pose: (t) => {
          // A sonar ping: antenna up, tip and sensors flash outward, a small nod.
          this.tipBlink = 1;
          this.sensors = Math.floor(t * 3) % 2 ? 'ripple' : 'off';
          this.lamp = Math.floor(t * 3) % 2 ? BEACON.surprised! : null;
          this.puppet.add('antenna', -14 * Math.sin(t * 9) ** 2);
          this.puppet.add('body', 3 * pulse(t, 0.1, 0.4) - 2 * pulse(t, 1.2, 0.4), 0, 0);
        },
      },
      shimmy: {
        weight: 0.9,
        length: [2.4, 3],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // A pleased side to side rock on his wheels.
          const k = ease(t, 0, 0.2) * (1 - ease(t, this.actLength - 0.4, this.actLength));
          this.puppet.add('body', 0, 0, 14 * k * Math.sin(t * 9));
          this.puppet.add('antenna', 0, 0, -25 * k * Math.sin(t * 9 - 0.6));
          this.wheelReq = [8 * k * Math.sin(t * 9), -8 * k * Math.sin(t * 9)];
          this.lamp = BEACON.happy!;
        },
      },
      brushes: {
        weight: 0.9,
        length: [3, 4],
        face: 'wink',
        when: this.still,
        pose: (t) => {
          // Shows off the side brushes: whirring hard, then reversing them, with a flourish.
          const k = ease(t, 0, 0.4) * (1 - ease(t, this.actLength - 0.5, this.actLength));
          this.whirrReq = (t < this.actLength * 0.55 ? 55 : -55) * k;
          this.puppet.add('body', -4 * k, 0, 4 * k * Math.sin(t * 5));
          this.sensors = 'scan';
        },
      },
      onewheel: {
        weight: 0.7,
        length: [3, 3.6],
        face: 'surprised',
        when: this.still,
        pose: (t) => {
          // Tips up on one wheel, teeters, and drops back down with a bounce.
          const up = ease(t, 0.2, 0.7) * (1 - ease(t, 2.1, 2.3));
          this.puppet.add('body', 0, 0, 19 * up + 3 * Math.sin(t * 9) * up);
          this.puppet.add('antenna', 0, 0, -40 * up);
          this.wheelReq = [0, 10 * up];
          this.yawReq = 0.25 * up;
          if (t > 2.3 && this.stage === 0) {
            this.stage = 1;
            this.bump.kick(-0.2);
            this.puppet.kick('body', 0, 0, -60);
          }
          if (t < 0.05) this.stage = 0;
          this.actExpr = t > 2.3 ? 'happy' : 'surprised';
        },
      },
      popup: {
        weight: 0.7,
        length: [3, 3.6],
        face: 'happy',
        when: this.still,
        start: () => (this.stage = 0),
        pose: (t) => {
          // Revs, pops a wheelie so his eyes look up, holds it, and rolls back.
          const rev = ease(t, 0, 0.5) * (1 - ease(t, 0.6, 0.7));
          const up = ease(t, 0.7, 1.0) * (1 - ease(t, 2.0, 2.4));
          this.puppet.add('body', 6 * rev - 24 * up, 0, 0);
          this.wheelReq = [30 * (rev + up), 30 * (rev + up)];
          this.puppet.add('antenna', 30 * up);
          this.whirrReq = 40;
          if (t > 2.4 && this.stage === 0) {
            this.stage = 1;
            this.bump.kick(-0.15);
          }
        },
      },
      lap: {
        weight: 0.6,
        length: [16, 18],
        face: 'happy',
        when: this.still,
        start: () => {
          // A little victory lap round the floor: out along the front, back along the wall.
          this.begin();
          this.dir = this.room()[0];
          this.walkTo(this.s + this.dir * this.across() * 3, 0.05);
        },
        pose: (t) => {
          this.speedReq = 3.2;
          this.whirrReq = 45;
          this.lamp = RAINBOW[Math.floor(t * 6) % RAINBOW.length];
          this.sensors = 'ripple';
          this.puppet.add('body', 0, 0, 4 * sin(t, 2.2));
          if (this.arrivedAt(t)) {
            if (this.stage === 1) this.walkTo(this.s + this.dir * this.across() * 0.3, 0.9);
            else if (this.stage === 2) this.walkTo(this.origin, 0.9);
            else if (this.stage === 3) this.walkTo(this.origin, 0.2);
            else this.finish(t + 1.2);
          }
          if (this.stage >= 4) this.yawReq = TAU * ease(t, this.last, this.last + 1.1);
        },
      },
      sneeze: {
        weight: 0.8,
        length: [2.6, 3],
        when: this.still,
        pose: (t) => {
          // Dust tickles: sensors flicker, his eyes squeeze, then achoo, hatch and all.
          const wind = ease(t, 0, 1.4) * (1 - ease(t, 1.4, 1.5));
          const go = t > 1.4;
          this.puppet.add(
            'body',
            -8 * wind + 12 * pulse(t, 1.4, 0.5),
            0,
            2 * Math.sin(t * 40) * wind,
          );
          this.binReq = go ? pulse(t, 1.4, 0.7) : 0;
          this.puffReq = pulse(t, 1.45, 0.7);
          this.puppet.add('antenna', -30 * wind + 40 * pulse(t, 1.4, 0.4));
          this.sensors = go ? 'off' : 'scan';
          this.actExpr = go ? 'surprised' : 'sleepy';
          if (go && this.stage === 0) {
            this.stage = 1;
            this.bump.kick(-0.35);
            this.puppet.kick('body', -140, 0, 0);
          }
          if (t < 0.05) this.stage = 0;
        },
      },
    };
  }

  private mishaps(): Record<string, Act> {
    return {
      cliff: {
        weight: 0.8,
        length: [9, 11],
        when: this.still,
        start: () => {
          // Creeps up to the front lip, and the cliff sensors shriek.
          this.begin();
          this.walkTo(this.s, 0);
          this.dir = this.room()[0];
        },
        pose: (t) => {
          this.speedReq = 1.0;
          this.actExpr = this.stage === 0 ? 'focused' : this.stage === 1 ? 'surprised' : 'sad';
          if (this.stage === 0) this.sensors = 'scan';
          if (this.arrivedAt(t, 0.6)) this.puppet.kick('body', -90, 0, 0);
          if (this.stage === 1) {
            // An edge! Sensors flash, he teeters on the lip and freezes.
            const k = t - this.last;
            this.sensors = 'alarm';
            this.lamp = Math.sin(t * 22) > 0 ? BEACON.love! : OFF;
            this.puppet.add('body', 10 + 4 * Math.sin(k * 14), 0, 0);
            this.puppet.add('antenna', -30 * pulse(k, 0, 0.5));
            this.whirrReq = 0;
            this.wheelReq = [0, 0];
            if (k > 1.4) {
              this.stage = 2;
              this.last = t;
              this.walkTo(this.s + this.dir * this.across() * 0.8, 0.55);
            }
          }
          if (this.stage === 2) {
            this.speedReq = 1.8;
            this.reverse = t - this.last < 0.5;
            this.sensors = 'alarm';
            this.puppet.add(
              'body',
              0,
              0,
              5 * Math.sin(t * 20) * (1 - ease(t, this.last, this.last + 1.2)),
            );
            if (this.there) {
              this.stage = 3;
              this.last = t;
            }
          }
          if (this.stage === 3) {
            // Phew.
            this.puppet.add('body', 3 * pulse(t - this.last, 0, 0.6), 0, 0);
            if (t - this.last > 1.2) this.finish(t);
          }
        },
      },
      stuck: {
        weight: 0.7,
        length: [5, 6],
        when: this.still,
        start: () => {
          this.begin();
          this.dir = this.room()[0];
        },
        pose: (t) => {
          // Wedged on something only he can feel: wheels whirring, rocking, straining; then
          // a hop, and he backs out with a jolt.
          const free = t > 3.2;
          if (!free) {
            const k = ease(t, 0, 0.3);
            this.actExpr = 'cross';
            this.wheelReq = [22 * k, 22 * k];
            this.whirrReq = 40;
            this.puppet.add('body', 5 * k + 2 * Math.sin(t * 30) * k, 0, 4 * Math.sin(t * 17) * k);
            this.puppet.add('antenna', 0, 0, 45 * Math.sin(t * 14) * k);
            this.lamp = Math.sin(t * 9) > 0 ? BEACON.happy! : OFF;
          } else if (this.stage === 0) {
            this.stage = 1;
            this.hopUp(0.35);
            this.puppet.kick('body', -120, 0, 0);
            this.bump.kick(-0.4);
            this.walkTo(this.s - this.dir * this.across() * 1.2);
          }
          if (free) {
            this.actExpr = 'happy';
            this.speedReq = 2.4;
            this.reverse = t < 3.9;
            this.lamp = BEACON.happy!;
          }
        },
      },
      fullbin: {
        weight: 0.7,
        length: [6, 7],
        when: this.still,
        pose: (t) => {
          // The bin is full: he slows and sags, then stops, opens up, and empties himself
          // with a puff, shaking the last of it out.
          const sag = ease(t, 0, 1.6) * (1 - ease(t, 4, 4.5));
          this.whirrReq = 20 * (1 - ease(t, 0.5, 1.6));
          this.charge = Math.max(0.12, this.charge);
          this.puppet.add('body', 5 * sag, 0, 0);
          this.puppet.add('antenna', 30 * sag);
          this.lamp =
            t < 1.8
              ? Math.sin(t * 6) > 0
                ? BEACON.happy!
                : OFF
              : t < 4
                ? BEACON.focused!
                : BEACON.love!;
          this.actExpr = t < 1.8 ? 'sad' : t < 3 ? 'focused' : 'happy';
          this.binReq = ease(t, 1.8, 2.2) * (1 - ease(t, 4, 4.6));
          this.puffReq = pulse(t, 2.4, 1.4);
          const shake = ease(t, 2.4, 2.5) * (1 - ease(t, 3.6, 4));
          this.puppet.add('body', 0, 0, 12 * shake * Math.sin(t * 24));
          if (t > 2.4 && this.stage === 0) {
            this.stage = 1;
            this.puppet.kick('body', -160, 0, 0);
            this.bump.kick(-0.3);
          }
          if (t < 0.05) this.stage = 0;
        },
      },
      lowbat: {
        weight: 0,
        length: [9, 10],
        face: 'sad',
        when: this.still,
        start: () => {
          // Limps toward the dock, slower and slower.
          this.begin();
          this.walkTo(this.s + this.room()[0] * this.across() * 3, this.depth);
        },
        pose: (t) => {
          this.speedReq = 0.9 - 0.5 * ease(t, 0, 5);
          this.whirrReq = 6 * (1 - ease(t, 0, 5));
          this.puppet.add('body', 6 * ease(t, 0, 4), 0, 3 * sin(t, 2));
          this.puppet.add('antenna', 50 * ease(t, 0, 4));
          this.lamp = Math.sin(t * 3) > 0 ? '#ff6a4a' : OFF;
          this.sensors = 'off';
          if (t > this.actLength - 0.3) this.setAct('dock');
        },
      },
    };
  }

  private company(): Record<string, Act> {
    const near = () => this.still() && this.mates().length > 0;
    return {
      follow: {
        weight: 1,
        length: [8, 11],
        face: 'happy',
        when: near,
        start: () => (this.lastStep = -1),
        pose: (t) => {
          // Trails a crewmate like a pet, staying a step behind.
          this.speedReq = 2.2;
          const m = this.mates()[0];
          if (m && (t - this.lastStep > 0.6 || this.lastStep < 0)) {
            this.lastStep = t;
            const d =
              Math.abs(m.velocity.x) > 1 ? -Math.sign(m.velocity.x) : Math.sign(this.s - m.s) || 1;
            this.walkTo(m.s + d * this.across() * 1.5, m.depth);
          }
          this.whirrReq = 16;
          this.puppet.add('antenna', 0, 0, 15 * Math.sin(t * 5));
          this.puppet.add('body', 0, 0, 3 * Math.sin(t * 6));
        },
      },
      hello: {
        weight: 1,
        length: [7, 8],
        when: near,
        start: () => {
          this.begin();
          const m = this.mates()[0];
          if (!m) return;
          this.dir = Math.sign(m.s - this.s) || 1;
          this.walkTo(m.s - this.dir * this.across() * 1.7, m.depth);
        },
        pose: (t) => {
          // Rolls up to a crewmate, blinks his lights at them, nods, and does a happy spin.
          this.speedReq = 2.2;
          if (this.arrivedAt(t) || this.stage > 0) {
            const k = t - this.last;
            if (this.stage === 1) this.tipBlink = 1;
            this.sensors = k < 2 ? 'ripple' : 'scan';
            this.lamp = k < 2 ? BEACON.happy! : null;
            this.puppet.add('body', 6 * pulse(k, 0.3, 0.4) + 6 * pulse(k, 0.9, 0.4), 0, 0);
            this.puppet.add('antenna', 0, 0, 30 * Math.sin(k * 10));
            if (k > 2.2) this.yawReq = TAU * ease(k, 2.2, 3.4);
            this.actExpr = 'happy';
          } else this.actExpr = 'neutral';
        },
      },
      race: {
        weight: 0.6,
        length: [8, 9],
        when: near,
        start: () => {
          this.begin();
          this.dir = this.room()[0];
        },
        pose: (t) => {
          // Revs on the spot, then races to the far end of the floor at a different depth
          // from the others, and skids to a stop with a spin.
          const m = this.mates()[0];
          if (t < 1.4) {
            const k = ease(t, 0, 1.2);
            this.wheelReq = [26 * k, 26 * k];
            this.whirrReq = 45 * k;
            this.puppet.add('body', 6 * k + 1.5 * Math.sin(t * 40) * k, 0, 0);
            this.sensors = 'ripple';
            this.actExpr = 'focused';
            this.lamp = t > 0.9 ? BEACON.happy! : BEACON.focused!;
          } else if (this.stage === 0) {
            this.stage = 1;
            const far = m && m.depth < 0.5 ? 0.85 : 0.08;
            const [lo, hi] = this.env ? this.span(this.env.frame) : [0, 0];
            this.walkTo(this.dir > 0 ? hi : lo, far);
            this.puppet.kick('body', -100, 0, 0);
          } else if (this.stage === 1) {
            this.speedReq = 5;
            this.whirrReq = 55;
            this.actExpr = 'happy';
            this.lamp = RAINBOW[Math.floor(t * 8) % RAINBOW.length];
            if (this.there) {
              this.stage = 2;
              this.last = t;
            }
          } else {
            const k = t - this.last;
            this.yawReq = TAU * ease(k, 0, 0.9);
            this.actExpr = 'wink';
            this.puppet.add('body', 0, 0, 10 * pulse(k, 0.9, 0.6));
            if (k > 1.6) this.finish(t);
          }
        },
      },
    };
  }

  private rests(): Record<string, Act> {
    return {
      nap: {
        weight: 0.9,
        length: [6, 9],
        when: this.still,
        pose: (t) => {
          // Stops, sags, and dozes on the spot: brushes still, antenna drooping, the status
          // light breathing slowly and the battery lights taking a little charge.
          const k = ease(t, 0, 1.5);
          this.actExpr = t < 1.2 ? 'sleepy' : 'asleep';
          this.puppet.add('body', 3 * k + 0.6 * Math.sin(t * 1.9) * k, 0, 0);
          this.puppet.add('antenna', 55 * k);
          this.whirrReq = 0;
          this.charging = true;
          this.sensors = 'off';
        },
      },
      dock: {
        weight: 0.7,
        length: [12, 16],
        when: this.still,
        start: () => {
          // Goes home to the end of the floor, backs onto his charging plate and dozes.
          this.begin();
          this.dir = this.room()[0];
          this.walkTo(this.s + this.dir * Math.max(this.room()[1], this.across()), 0.25);
        },
        pose: (t) => {
          if (this.stage === 0) {
            this.speedReq = 1.8;
            this.actExpr = 'focused';
            if (this.arrivedAt(t)) this.puppet.kick('body', 60, 0, 0);
          } else {
            const k = ease(t, this.last, this.last + 1.5);
            this.actExpr = t - this.last < 1 ? 'sleepy' : 'asleep';
            this.puppet.add('body', 3 * k + 0.6 * Math.sin(t * 1.9) * k, 0, 0);
            this.puppet.add('antenna', 55 * k);
            this.whirrReq = 0;
            this.charging = true;
            this.sensors = 'off';
          }
        },
      },
    };
  }

  private reactions(): Record<string, Act> {
    return {
      poked: {
        weight: 0,
        length: [1, 1.2],
        face: 'happy',
        pose: (t) => {
          this.puppet.add('body', 0, 0, 20 * sin(t, 6) * (1 - t));
          this.puppet.add('antenna', 0, 0, 60 * sin(t, 8) * (1 - t));
        },
      },
      bonk: {
        weight: 0,
        length: [1.4, 1.6],
        face: 'surprised',
        start: () => {
          // Stopped dead, with a little bounce back off the bumper.
          this.goal = null;
          this.depthGoal = this.depth;
          this.away = -Math.sign(this.pace) || 1;
          this.pace *= -0.3;
          this.vz *= -0.3;
          this.backedOff = false;
          this.bump.kick(-0.25);
          this.puppet.kick('antenna', -200, 0, 120);
        },
        pose: (t) => {
          // Stunned for a moment (wobbling, dizzy for a beat), then back off the way he came.
          this.sensors = 'alarm';
          this.puppet.add('body', 0, 0, 7 * Math.sin(t * 18) * (1 - ease(t, 0.1, 0.9)));
          this.yawReq = 0.25 * Math.sin(t * 14) * (1 - ease(t, 0.1, 0.9));
          if (t > 0.5 && !this.backedOff) {
            this.backedOff = true;
            this.walkTo(this.s + this.away * this.across() * 0.7);
          }
          this.reverse = t > 0.5 && t < 1.1;
        },
      },
      dizzy: {
        weight: 0,
        length: [2, 2.2],
        face: 'dizzy',
        pose: (t) => {
          this.yawReq = 3 * TAU * ease(t, 0, this.actLength);
          this.sensors = 'ripple';
          this.puppet.add('antenna', 0, 0, 40 * Math.sin(t * 12));
        },
      },
    };
  }

  poke() {
    if (this.state !== 'here') return;
    const now = performance.now() / 1000;
    this.pokes = [...this.pokes.filter((at) => now - at < 2.5), now];
    if (this.pokes.length >= 3) {
      this.pokes = [];
      this.setAct('dizzy');
    } else this.setAct('poked');
  }

  // ---------- Each frame ----------

  protected idle(t: number) {
    this.speedReq = 2.5;
    this.turnReq = 45;
    this.whirrReq = null;
    this.wheelReq = null;
    this.reverse = false;
    this.yawReq = 0;
    this.binReq = 0;
    this.puffReq = 0;
    this.toyReq = 0;
    this.lamp = null;
    this.sensors = null;
    this.charging = false;
    this.tipBlink = 0;
    this.actExpr = null;
    // A faint hum, and the antenna swaying with it.
    this.puppet.add('body', 0.4 * sin(t, 7), 0, 0.4 * sin(t, 5.3));
    this.puppet.add('antenna', 3 * sin(t, 0.6), 0, 3 * sin(t, 0.45));
  }

  protected pose(dt: number, env: Env) {
    this.env = env;
    this.spec.speed = this.speedReq;
    this.spec.turn = this.turnReq;
    // Rattling along while he drives; the antenna waves behind him.
    if (this.walking) {
      this.puppet.add('body', 1.2 * sin(env.time, 11), 0, 1.2 * sin(env.time, 9));
      this.puppet.add('antenna', 0, 0, 6 * sin(env.time, 3));
    }
    // Whoever is in his way on the frame line gets bonked.
    if (this.walking && this.state === 'here' && this.act !== 'bonk') {
      for (const other of env.crew) {
        if (other === this || other.edge !== 'bottom' || other.free || other.state !== 'here')
          continue;
        // Right up against them, and driving at them.
        const { n, nx, nz, rx, rz } = this.spaceTo(other, env.frame);
        if (n < 1.04 && (this.pace / rx) * nx + (this.vz / rz) * nz > 0) {
          this.setAct('bonk');
          break;
        }
      }
    }
    this.puppet.shift('bumper', 0, 0, Math.min(0, this.bump.update(dt, 0)) * 0.1);
    // The battery: working drains it a little, charging fills it.
    if (this.charging) this.charge = Math.min(1, this.charge + dt * 0.09);
    else this.charge = Math.max(0, this.charge - dt * (this.walking ? 0.006 : 0.0015));
    this.acts.lowbat.weight = this.charge < 0.3 ? 3 : 0;
    this.expression = this.actExpr ?? (this.hovered ? 'happy' : 'neutral');
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    const t = env.time;
    // Brushes: whirring while he cleans, still while docked.
    const docked = this.act === 'dock' && this.stage > 0;
    const napping = this.act === 'nap' || docked;
    const working = this.walking || ['clean', 'zigzag', 'spiral', 'wall', 'lip'].includes(this.act);
    const whirr = this.whirrReq ?? (napping ? 0 : this.walking ? 30 : working ? 20 : 4);
    this.brushSpeed += (whirr - this.brushSpeed) * Math.min(1, dt * 2.5);
    this.brush += this.brushSpeed * dt;
    for (const [brush, side] of BRUSHES) {
      p.bone(brush).quaternion.multiply(q.setFromAxisAngle(ALONG, side * this.brush));
    }
    // Wheels roll with the ground, or as an act says (one each side, radians per second).
    const roll = (this.stride / Math.max(this.px, 1) / WHEEL) * (this.reverse ? -1 : 1);
    const [wl, wr] = this.wheelReq ?? [roll, roll];
    const wheelL = (this.wheelAngleL += wl * dt);
    const wheelR = (this.wheelAngleR += wr * dt);
    for (const [wheel, side] of WHEELS) {
      p.bone(wheel).quaternion.multiply(
        q.setFromAxisAngle(ALONG, side * (side > 0 ? wheelL : wheelR)),
      );
    }
    // Spinning on the spot for joy, or dizzily; or as an act's yaw request says.
    const spins = this.act === 'spin' ? 1 : 0;
    const k = spins ? Math.min(1, this.actT / this.actLength) : 0;
    this.pivot.rotation.y = spins * TAU * (k * k * (3 - 2 * k)) + this.yawReq;

    // The bin hatch, the dust puff and the toy ball.
    p.turn('bin', -75 * this.binReq);
    const puff = Math.max(0.001, this.puffReq);
    p.shift('puff', 0, 0.075 * this.puffReq, 0);
    p.stretch('puff', puff * 1.4, [0, 1, 0], puff);
    this.toyScale += (this.toyReq - this.toyScale) * Math.min(1, dt * 8);
    const ahead = this.ahead.update(dt, 0.02 + 0.018 * this.toyReq);
    const ts = Math.max(0.001, this.toyScale);
    p.shift('toy', 0, -0.024 * this.toyScale, (0.19 + Math.max(0, ahead)) * this.toyScale);
    p.stretch('toy', ts, [0, 1, 0], ts);
    this.rollAngle += (this.stride / Math.max(this.px, 1) / BALL) * dt * 57.3;
    p.turn('toy', this.rollAngle);

    // The status light.
    const busy = this.walking || working;
    let light =
      BEACON[busy ? 'focused' : this.hovered || this.act === 'spin' ? 'happy' : 'neutral']!;
    if (napping || this.act === 'lowbat') {
      // Charging breath: a slow blue swell.
      if (napping) light = Math.sin(t * 1.4) > 0 ? BEACON.surprised! : OFF;
    } else if (this.act === 'bonk') light = Math.sin(t * 25) > 0 ? BEACON.love! : OFF;
    else if (this.act === 'dizzy') light = RAINBOW[Math.floor(t * 6) % RAINBOW.length];
    else if (this.act === 'poked') light = BEACON.happy!;
    if (this.lamp) light = this.lamp;
    this.light.lerp(colour.set(light), Math.min(1, dt * (napping ? 2 : 12)));
    this.outfit.beacon(this.light);

    // Cliff sensors: five lights on the bumper.
    const mode: Sensors = this.sensors ?? (napping ? 'off' : this.walking ? 'scan' : 'off');
    for (let i = 0; i < 5; i++) {
      let lv = 0.3;
      if (mode === 'scan') lv = 0.2 + 0.8 * Math.max(0, Math.cos(t * 9 - i * 1.2)) ** 2;
      else if (mode === 'ripple')
        lv = 0.15 + 0.85 * Math.max(0, Math.sin(t * 14 - Math.abs(i - 2) * 1.6));
      else if (mode === 'alarm') lv = Math.sin(t * 22) > 0 ? 1 : 0.1;
      else lv = napping ? 0.05 : 0.3;
      this.outfit.dot(i, lv, mode === 'alarm' ? BEACON.love : undefined);
    }
    // Antenna tip: a slow blink, quick while pinging.
    this.outfit.dot(
      5,
      this.tipBlink ? (Math.sin(t * 18) > 0 ? 1 : 0.1) : Math.sin(t * 2.2) > 0.75 ? 1 : 0.25,
    );
    // Battery lights: one for each third of the charge; the next one to fill pulses.
    for (let i = 0; i < 3; i++) {
      const full = clamp(this.charge * 3 - i, 0, 1);
      let lv = 0.06 + 0.94 * full;
      if (this.charging && full < 1 && (i === 0 || this.charge * 3 - i + 1 > 0))
        lv = 0.3 + 0.7 * Math.abs(Math.sin(t * 2));
      const low = this.charge < 0.3 && i === 0;
      this.outfit.dot(
        6 + i,
        low ? (Math.sin(t * 4) > 0 ? 1 : 0.1) : lv,
        low ? '#ff6a4a' : undefined,
      );
    }
  }

  private wheelAngleL = 0;
  private wheelAngleR = 0;
}
