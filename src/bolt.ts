import { Color, type Object3D } from 'three';
import type { Puppet } from './puppet';
import type { Door } from './box';
import { type Act, Character, clamp, type Env, type Frame, type Hold } from './character';
import { BOLT_FACE, type Expression } from './face';
import { glowColour } from './looks';
import { Spring, wobble } from './spring';

/**
 * Bolt, the crew's rocket-booted robot. He rises from behind the bottom of the frame
 * on his flames, flies up and down the sides of the window, lands on the frame line to
 * stand, sit with his legs over the edge, nap or dance, and sinks back behind the line
 * when he goes. Everything is posed live: flight is a little physics (he leans into
 * acceleration, his legs trail, his antenna lags), the rest is springs chasing poses.
 *
 * Arm angles: `raise` lifts an arm sideways from where it hangs (about 26 degrees out
 * already), `forward` swings it toward the viewer, `bend` lifts the forearm further.
 */
const SEAT = 0.14; // metres from his feet to the seat of his torso
const ARM_REST = 26;
// Mood colours for the beacon, the one colour he has.
export const BEACON: Partial<Record<Expression, string>> = {
  neutral: '#f4f4f1',
  happy: '#ffb347',
  love: '#ff5fa2',
  surprised: '#5ec8ff',
  focused: '#6fdc8c',
  sad: '#5ec8ff',
  wink: '#ffb347',
  starry: '#ffd76a',
  sheepish: '#ff5fa2',
  determined: '#6fdc8c',
};
export const RAINBOW = ['#5ec8ff', '#ff5fa2', '#ffb347', '#6fdc8c'];

export class Bolt extends Character {
  static readonly terms =
    'spaceman rocket boots jet flames fly flying hover white orange grey gray boy antenna dance nap sit ledge land android humanoid';

  /** Held by the pointer, it flies after it. */
  readonly flies = true;
  /** It comes in its own way (flying or swimming), not jumping out of its picture. */
  readonly jumpsOut = false;
  /** Flying (free in the band) or perched on the bottom frame line. */
  flying = false;
  seated = false;
  // He comes up through the trapdoor, rockets lit; he doesn't walk out of doors.
  doorKinds = ['floor'] as const;
  protected leavesByDoor = false;
  private vel = { x: 0, y: 0 };
  private acc = { x: 0, y: 0 };
  private route: { x: number; y: number }[] = [];
  private landing = false;
  private exiting = false;
  /** Hovering at a spot for the site (hoverAt()), and going out of the frame the air's way. */
  private errand: { x: number; y: number } | null = null;
  private offstage = false;
  /** Which way he's going out, once he's down (his usual way, below the lip, or a door). */
  private exitBy: 'rise' | Door | undefined;
  private tilt = new Spring(1.6, 0.55);
  private lift = new Spring(3, 0.35);
  private squash = new Spring(3.2, 0.3, 1, 1);
  private flames = new Spring(4, 0.7);
  private spin = 0;
  private beaconColour = new Color('#f4f4f1');
  private pokes: number[] = [];
  /** Which side a friend stands on for a high five: -1 the viewer's left (his right hand), 1 the other. */
  friend: 1 | -1 = -1;
  private stageEnv: Env | null = null;
  /** The chore tool in his right hand this frame (set by acts; none when idle). */
  private tool: 'broom' | 'duster' | 'wrench' | null = null;
  private toolLevel = {
    broom: new Spring(6, 0.9),
    duster: new Spring(6, 0.9),
    wrench: new Spring(6, 0.9),
  };
  private roll = 0; // degrees, a whole-body roll in the air (direct)
  private flip = 0; // degrees, a somersault about his middle (direct)
  private boost = 0; // extra flame, 0..1.5, for hops and twirls on the floor
  private sputter = 1; // flame multiplier, dips when the engines cough
  private scanning = 0;
  private way: 1 | -1 = 1;
  private did = 0;
  private hopY = new Spring(7, 0.8); // smooths every direct lift (hops, dance beats, walking bob)
  private seatY = new Spring(5, 0.65); // sinking onto the lip and standing up again
  private chest = 0; // 0..1, the chest lens's glow beyond its heartbeat (proud, pleased)
  private ears = new Spring(4, 0.6); // the ear lights: up when he listens
  private pending = false;
  /** He holds a sign up over his head in both hands. */
  readonly holdsUp: readonly Hold[] = ['hands', 'grip'];
  readonly holdOffset: Partial<Record<Hold, [number, number, number]>> = { hands: [0, -0.15, 0.14], grip: [-0.05, 0, 0.12] };
  private chestLevel = new Spring(3, 0.8);

  constructor(model: Object3D) {
    super(
      {
        name: 'Bolt',
        model: 'bolt',
        metres: 1.1,
        width: 0.66,
        size: 1.45,
        feels: {
          default: { f: 2.2, zeta: 0.6 },
          root: { f: 2.4, zeta: 0.7 },
          body: { f: 2.2, zeta: 0.55 },
          head: { f: 2, zeta: 0.55, r: 0.4 },
          antenna: { f: 2.6, zeta: 0.15 },
          'upper_arm.L': { f: 2.6, zeta: 0.45 },
          'upper_arm.R': { f: 2.6, zeta: 0.45 },
          'forearm.L': { f: 3.2, zeta: 0.4 },
          'forearm.R': { f: 3.2, zeta: 0.4 },
          'leg.L': { f: 1.7, zeta: 0.3 },
          'leg.R': { f: 1.7, zeta: 0.3 },
        },
        face: BOLT_FACE,
        eyes: 0.66,
        gaze: [
          { bone: 'head', yaw: 0.7, pitch: 0.8 },
          { bone: 'body', yaw: 0.3, pitch: 0.2 },
        ],
        reach: { yaw: 55, pitch: 28 },
        lag: 1.1,
        entrance: 'rise',
        edges: ['bottom'],
        stay: [70, 160],
      },
      model,
    );
    this.acts = this.eased(this.moves());
  }

  /**
   * Every act eases in and out: whatever it adds to the joints is scaled by an envelope
   * over its length, so poses grow from and settle back into the idle life instead of
   * snapping, and direct lifts and flame boosts follow the same envelope.
   */
  private eased(acts: Record<string, Act>) {
    for (const [name, act] of Object.entries(acts)) {
      const pose = act.pose;
      if (!pose) continue;
      const quick = name === 'poked' || name === 'dizzy';
      act.pose = (t) => {
        const len = this.actLength;
        const k =
          smooth(t / (quick ? 0.08 : Math.min(0.4, len * 0.3))) *
          smooth((len - t) / (quick ? 0.3 : Math.min(0.55, len * 0.3)));
        const puppet = this.puppet as unknown as { add: Puppet['add'] };
        const add = puppet.add;
        puppet.add = (bone, p = 0, y = 0, r = 0) =>
          add.call(this.puppet, bone, p * k, y * k, r * k);
        try {
          pose(t);
        } finally {
          delete (puppet as Partial<typeof puppet>).add;
        }
        this.danceLift *= k;
        this.boost *= k;
      };
    }
    return acts;
  }

  // ---------- Posing helpers ----------

  /** side: 1 his left, -1 his right. */
  private arm(side: 1 | -1, raise: number, forward = 0, bend = 0, wrist = 0) {
    const s = side === 1 ? 'L' : 'R';
    const out = ((ARM_REST + raise) * Math.PI) / 180;
    this.puppet.add(
      `upper_arm.${s}`,
      -forward * Math.cos(out),
      -side * forward * Math.sin(out),
      side * raise,
    );
    if (bend) this.puppet.add(`forearm.${s}`, 0, 0, side * bend);
    if (wrist) this.puppet.add(`hand.${s}`, 0, 0, side * wrist);
  }

  private arms(raise: number, forward = 0, bend = 0) {
    this.arm(1, raise, forward, bend);
    this.arm(-1, raise, forward, bend);
  }

  /** His arms are too short to hold a board over a head as big as his: it's held out in front
   * of his middle, in both hands, below his screen. */
  holdPose(hold: Hold, k: number) {
    if (hold === 'hands') this.arms(0, 40 * k, 0);
    // Anything else is held out in his right hand, up where it shows.
    else if (hold === 'grip') this.arm(-1, 14 * k, 46 * k, 54 * k);
  }

  /** The nearest crewmate on this floor, standing about, if any. */
  private mate(): Character | null {
    const env = this.stageEnv;
    if (!env) return null;
    let best: Character | null = null;
    let bestD = Infinity;
    for (const o of env.crew) {
      if (o === this || o.state !== 'here' || o.free || o.edge !== this.edge) continue;
      const d = Math.abs(o.s - this.s);
      if (d < bestD) [best, bestD] = [o, d];
    }
    return best;
  }

  // ---------- Acts ----------

  private moves(): Record<string, Act> {
    const flying = () => this.flying && !this.landing && !this.exiting;
    const standing = () => !this.flying && !this.seated && this.state === 'here';
    const sitting = () => !this.flying && this.seated;
    const near = () => this.hovered;
    const calm = () => standing() && this.goal === null && this.stride < 1;
    const sin = (t: number, hz: number, phase = 0) => Math.sin(2 * Math.PI * (hz * t + phase));
    return {
      idle: { weight: 3, length: [3, 7] },
      // In the air
      relocate: {
        weight: 3,
        length: [0.2, 0.3],
        when: flying,
        start: () => this.flyTo(this.hoverSpot(this.lastFrame)),
      },
      land: {
        weight: 2.5,
        length: [0.2, 0.3],
        when: flying,
        start: () => this.flyTo(this.landingSpot(this.lastFrame), true),
      },
      spin: {
        weight: 0.8,
        length: [1.1, 1.1],
        face: 'happy',
        when: flying,
        pose: (t) => {
          this.spin = Math.PI * 2 * wind(t / 1.1);
          this.arms(40);
        },
      },
      airdance: {
        weight: 0.8,
        length: [3, 5],
        face: 'happy',
        when: flying,
        pose: (t) => {
          this.arm(1, 45 + 35 * sin(t, 1.2), 10, 25);
          this.arm(-1, 45 - 35 * sin(t, 1.2), 10, 25);
          this.puppet.add('leg.L', -20 * sin(t, 1.2), 0, 0);
          this.puppet.add('leg.R', 20 * sin(t, 1.2), 0, 0);
          this.puppet.add('body', 0, 12 * sin(t, 0.6), 0);
        },
      },
      // On the frame line
      takeoff: {
        weight: 2,
        length: [0.9, 0.9],
        when: () => standing() && this.t > 8,
        start: () => {
          // Crouch first, arms back, then the engines catch and he goes.
          this.pending = true;
          this.squash.kick(-3.5);
        },
        pose: (t) => {
          if (this.flying) return;
          this.puppet.add('body', 10, 0, 0);
          this.arms(-8, -24, 20);
          this.boost = 0.8 * smooth((t - 0.15) / 0.3);
          if (this.pending && t > 0.42) {
            this.pending = false;
            this.takeOff();
          }
        },
      },
      sit: {
        weight: 2,
        length: [0.2, 0.3],
        // Only on the lip, with somewhere to put his legs.
        when: () => standing() && this.depth < 0.02,
        start: () => (this.seated = true),
      },
      stand: {
        weight: 1,
        length: [0.2, 0.3],
        when: sitting,
        start: () => {
          this.seated = false;
          this.lift.kick(0.5);
        },
      },
      nap: {
        weight: 1.2,
        length: [10, 20],
        face: 'asleep',
        when: sitting,
        pose: (t) => {
          const breath = sin(t, 0.22);
          this.puppet.add('body', 8 + 2 * breath, 0, 0);
          this.puppet.add('head', 18 + 3 * breath, 0, 4);
          this.puppet.add('antenna', 30, 0, 0);
          this.arms(-6, 12);
        },
      },
      dance: {
        weight: 1.2,
        length: [4, 7],
        face: 'happy',
        when: standing,
        pose: (t) => {
          const beat = Math.abs(sin(t, 1));
          // His head is wider than his reach, so "arms up" is out and up, forearms bent.
          this.arm(1, 50 + 40 * sin(t, 0.5), 10, 30 + 30 * sin(t, 0.5));
          this.arm(-1, 50 - 40 * sin(t, 0.5), 10, 30 - 30 * sin(t, 0.5));
          this.puppet.add('body', 0, 14 * sin(t, 0.25), 0);
          this.puppet.add('head', 8 * sin(t, 1), 0, 6 * sin(t, 0.5));
          this.puppet.add('leg.L', -15 + 15 * sin(t, 0.5), 0, 0);
          this.puppet.add('leg.R', -15 - 15 * sin(t, 0.5), 0, 0);
          this.danceLift = 0.035 * beat;
        },
      },
      cheer: {
        weight: 0.8,
        length: [1.6, 2.4],
        face: 'happy',
        when: standing,
        pose: (t) => {
          this.arm(1, 72 + 8 * sin(t, 3), 8, 55);
          this.arm(-1, 72 - 8 * sin(t, 3), 8, 55);
          this.puppet.add('head', -8, 0, 0);
          this.danceLift = 0.025 * Math.abs(sin(t, 1.5));
        },
      },
      wave: {
        weight: 1.5,
        length: [2.2, 3],
        face: 'happy',
        when: () => near() || Math.random() < 0.4,
        pose: (t) => {
          this.arm(-1, 40, 25, 55 + 15 * sin(t, 1.6), 15 * sin(t, 1.6));
          this.puppet.add('head', 0, 0, -6);
        },
      },
      // ---- Chores, with the tools he carries
      sweep: {
        weight: 1.6,
        length: [9, 12],
        when: calm,
        start: () => {
          this.way = Math.random() < 0.5 ? -1 : 1;
          this.did = 0;
          this.walkTo(this.s + this.way * this.heightPx * (0.8 + Math.random()), this.depth);
        },
        pose: (t) => {
          this.tool = 'broom';
          const sw = sin(t, 1.1);
          // The broom stays upright by the wrist while the arm swings; the head follows the bristles.
          this.arm(-1, -6, 24 + 16 * sw, 12);
          this.puppet.add('hand.R', 24 + 16 * sw, 0, 0);
          this.arm(1, 4, 8);
          this.puppet.add('body', 7, 6 * sw, 0);
          this.puppet.add('head', 12, 5 * sw, 0);
          if (t - this.did > 4 && this.goal === null) {
            this.did = t;
            this.way = (this.way * -1) as 1 | -1;
            this.walkTo(this.s + this.way * this.heightPx * (0.5 + Math.random()), this.depth);
          }
        },
      },
      dust: {
        weight: 1.4,
        length: [7, 9],
        face: 'focused',
        when: calm,
        pose: (t) => {
          this.tool = 'duster';
          // Up on his toes, flicking the feathers at the top of the frame.
          this.arm(-1, 54 + 8 * sin(t, 0.4), 34, 34 + 10 * sin(t, 1.6), 55 + 25 * sin(t, 2.4));
          this.arm(1, 6, 10, 6);
          this.puppet.add('head', -14, 8 * sin(t, 0.4), 0);
          this.puppet.add('body', -4, 5 * sin(t, 0.4), 0);
          this.danceLift = 0.02 * Math.abs(sin(t, 0.8));
        },
      },
      tinker: {
        weight: 1.1,
        length: [7, 9],
        face: 'focused',
        when: calm,
        pose: (t) => {
          this.tool = 'wrench';
          // Tightens a screw on his own chest, tongue out of the face's way.
          this.arm(-1, -24, 56, 96, 30 * sin(t, 1.3));
          this.arm(1, 6, 14, 12);
          this.puppet.add('head', 16, 0, 3 * sin(t, 0.5));
          this.puppet.add('body', 4, 0, 0);
          this.scanning = 1;
        },
      },
      // ---- Looking about
      lookAround: {
        weight: 2,
        length: [4, 6],
        when: calm,
        pose: (t) => {
          this.puppet.add('head', 3, 32 * Math.tanh(5 * sin(t, 0.35)), 0);
          this.puppet.add('body', 0, 8 * sin(t, 0.35), 0);
          this.puppet.add('antenna', 0, 0, 14 * sin(t, 0.35));
        },
      },
      salute: {
        weight: 0.8,
        length: [2.6, 3.2],
        face: 'happy',
        when: calm,
        pose: (t) => {
          const k = Math.min(1, t / 0.4) * Math.min(1, (3 - t) / 0.4);
          this.arm(-1, 40 * k, 30 * k, 120 * k);
          this.puppet.add('head', -4 * k, 0, -3 * k);
        },
      },
      shrug: {
        weight: 1,
        length: [2.2, 2.6],
        face: 'surprised',
        when: calm,
        pose: (t) => {
          const k = Math.min(1, t / 0.3) * Math.min(1, (2.4 - t) / 0.3);
          this.arms(46 * k, 10 * k, 50 * k);
          this.puppet.add('head', 0, 0, 9 * k * sin(t, 0.9));
          this.danceLift = 0.012 * k;
        },
      },
      stretch: {
        weight: 0.9,
        length: [4, 5],
        face: 'sleepy',
        when: calm,
        pose: (t) => {
          const k = Math.min(1, t / 1) * Math.min(1, (4.4 - t) / 0.8);
          this.arms(80 * k, 0, 26 * k);
          this.puppet.add('body', -12 * k, 0, 0);
          this.puppet.add('head', -14 * k, 0, 0);
          this.puppet.add('antenna', -20 * k, 0, 0);
          this.danceLift = 0.02 * k;
        },
      },
      flex: {
        weight: 0.7,
        length: [3.6, 4.4],
        face: 'happy',
        when: calm,
        pose: (t) => {
          const k = Math.min(1, t / 0.4) * Math.min(1, (4 - t) / 0.4);
          const p = 0.5 + 0.5 * sin(t, 1.2);
          this.arm(1, (68 - 6 * p) * k, 6, 100 * k);
          this.arm(-1, (68 - 6 * p) * k, 6, 100 * k);
          this.puppet.add('body', 0, 0, 5 * k * sin(t, 0.6));
          this.puppet.add('head', -6 * k, 0, 0);
        },
      },
      tapFoot: {
        weight: 0.9,
        length: [4, 5],
        when: calm,
        pose: (t) => {
          // Arms folded high, one boot tapping, a glance at the clock nobody has.
          this.arm(1, -16, 66, 118);
          this.arm(-1, -16, 66, 118);
          this.puppet.add('leg.R', 16 * Math.max(0, sin(t, 3)), 0, 0);
          this.puppet.add('head', 0, 18 * Math.tanh(4 * sin(t, 0.4)), 0);
        },
      },
      fixAntenna: {
        weight: 0.8,
        length: [4, 5],
        face: 'focused',
        when: calm,
        pose: (t) => {
          // Reaches up to straighten his antenna, and it springs back.
          const k = Math.min(1, t / 0.6) * Math.min(1, (4.4 - t) / 0.5);
          this.arm(-1, 88 * k, -4 * k, 120 * k, 12 * sin(t, 2) * k);
          this.puppet.add('head', -6 * k, 0, 4 * k);
          this.puppet.add('antenna', 0, 0, (-30 + 10 * sin(t, 2)) * k);
        },
      },
      scan: {
        weight: 0.9,
        length: [4, 5],
        face: 'focused',
        when: calm,
        pose: (t) => {
          // A slow sweep of the head while his chest lights chase.
          this.scanning = 1;
          this.puppet.add('head', 0, 36 * sin(t, 0.25), 0);
          this.arm(1, 8, 6);
          this.arm(-1, 8, 6);
        },
      },
      hiccup: {
        weight: 0.7,
        length: [3.6, 3.6],
        face: 'surprised',
        when: calm,
        start: () => (this.did = -1),
        pose: (t) => {
          const n = Math.floor(t * 1.5);
          if (n !== this.did && n < 4) {
            this.did = n;
            this.lift.kick(0.7);
            this.squash.kick(1.4);
            this.puppet.kick('antenna', 200, 0, 0);
            this.puppet.kick('head', 90, 0, 0);
          }
          this.arms(24, 6, 60);
        },
      },
      // ---- On his feet, moving
      strut: {
        weight: 1.6,
        length: [7, 10],
        face: 'happy',
        when: calm,
        start: () => {
          this.way = Math.random() < 0.5 ? -1 : 1;
          this.walkTo(this.s + this.way * this.heightPx * (2 + Math.random() * 2), Math.random());
          this.spec.speed = 1.5;
        },
        pose: (t) => {
          const swing = this.stride > 1 ? 1 : 0.3;
          this.arm(1, 6, 22 * sin(this.gait, 0.732) * swing);
          this.arm(-1, 6, -22 * sin(this.gait, 0.732) * swing);
          this.puppet.add('head', -3, 0, 3 * sin(t, 1.6));
          this.puppet.add('body', 0, 0, 5 * sin(this.gait, 0.732) * swing);
          this.puppet.add('antenna', 0, 0, 12 * sin(t, 1.6));
        },
      },
      hop: {
        weight: 1.2,
        length: [2.4, 3.2],
        face: 'happy',
        when: calm,
        start: () => (this.did = -1),
        pose: (t) => {
          // Each hop: a crouch with the arms swung back, a push off, a float, a landing.
          const cycle = t * 0.9;
          const n = Math.floor(cycle);
          const u = cycle - n;
          const air = u < 0.22 ? 0 : Math.sin(Math.PI * ((u - 0.22) / 0.78)) ** 0.85;
          const crouch = u < 0.22 ? Math.sin(Math.PI * (u / 0.22)) : 0;
          if (n !== this.did && u > 0.2) {
            this.did = n;
            this.squash.kick(1.6);
            this.puppet.kick('antenna', -160, 0, 0);
          }
          if (u < 0.05 && n > 0 && this.did === n - 1) {
            this.did = n - 0.5;
            this.squash.kick(-2.4);
          }
          this.arms(30 + 40 * air - 26 * crouch, 6 - 30 * crouch, 20 + 30 * crouch);
          this.puppet.add('body', 10 * crouch - 4 * air, 0, 0);
          this.puppet.add('head', 5 * crouch - 6 * air, 0, 0);
          this.boost = 0.9 * air;
          this.danceLift = 0.11 * air;
          this.puppet.add('leg.L', 22 * air - 12 * crouch, 0, 0);
          this.puppet.add('leg.R', 22 * air - 12 * crouch, 0, 0);
        },
      },
      pirouette: {
        weight: 0.8,
        length: [1.8, 1.8],
        face: 'happy',
        when: calm,
        pose: (t) => {
          this.spin = Math.PI * 4 * wind(t / 1.4);
          this.puppet.add('antenna', 0, 0, -30 * Math.sin(Math.PI * clamp(t / 1.4, 0, 1)));
          this.boost = 0.6 * Math.sin(Math.PI * clamp(t / 1.6, 0, 1));
          this.danceLift = 0.07 * Math.sin(Math.PI * clamp(t / 1.6, 0, 1));
          this.arms(60, 8, 10);
        },
      },
      rocketTest: {
        weight: 0.8,
        length: [3.4, 3.4],
        face: 'determined',
        when: calm,
        pose: (t) => {
          // Fires his boots for a moment, hovering a hand's width up, then settles.
          const k = Math.sin(Math.PI * clamp((t - 0.6) / 2, 0, 1));
          // First the engines cough and he braces, then the lift.
          const brace = Math.sin(Math.PI * clamp(t / 0.6, 0, 1));
          this.boost = 1.1 * k + 0.25 * brace * (0.6 + 0.4 * Math.sin(t * 60));
          this.puppet.add('body', 6 * brace, 0, 2 * Math.sin(t * 40) * brace);
          this.danceLift = 0.1 * k;
          this.arms(20 + 20 * k, 0, 10);
          this.puppet.add('leg.L', 10 * k, 0, 0);
          this.puppet.add('leg.R', 10 * k, 0, 0);
          this.puppet.add('antenna', 20 * k, 0, 0);
        },
      },
      robotDance: {
        weight: 1,
        length: [5, 7],
        face: 'happy',
        when: calm,
        pose: (t) => {
          // Stiff poses on the beat: up, out, across, down.
          const n = Math.floor(t * 2) % 4;
          const [a, b, c, d] = [
            [80, 0, 90],
            [50, 10, 0],
            [30, 60, 100],
            [10, 0, 20],
          ][n];
          this.arm(1, a, b, c);
          this.arm(-1, [a, 50, 30, 10][n], b, [c, 0, 100, 20][n]);
          this.puppet.add('head', 0, [22, -22, 0, 0][n], [0, 0, 8, -8][n]);
          this.puppet.add('body', 0, [0, 0, 10, -10][n], 0);
          this.danceLift = n % 2 ? 0.02 : 0;
        },
      },
      // ---- The depth of the box
      peerBack: {
        weight: 1.2,
        length: [12, 13],
        when: calm,
        start: () => {
          this.did = 0;
          this.walkTo(this.s + (Math.random() - 0.5) * this.heightPx * 2, 0.95);
        },
        pose: (t) => {
          if (this.there) {
            if (!this.did) this.did = t;
            // Back at the back wall: a hand over his brow, turning as he peers out at us.
            const k = Math.min(1, (t - this.did) / 0.5);
            this.arm(-1, 40 * k, 40 * k, 128 * k);
            this.puppet.add('head', 4 * k, 22 * Math.tanh(4 * sin(t, 0.3)) * k, 0);
            this.puppet.add('body', 3 * k, 8 * sin(t, 0.3) * k, 0);
            if (t - this.did > 4.6) this.walkTo(this.s, 0.2);
          }
        },
      },
      toLip: {
        weight: 1.3,
        length: [3, 4],
        when: () => calm() && this.depth > 0.1,
        start: () => this.walkTo(this.s + (Math.random() - 0.5) * this.heightPx * 1.4, 0),
        pose: () => {
          if (this.there) this.puppet.add('head', 12, 0, 0);
        },
      },
      overLip: {
        weight: 1,
        length: [6, 7],
        when: () => calm() && this.depth < 0.05,
        pose: (t) => {
          // Leans out over the front edge to look down at the page below.
          const k = Math.min(1, t / 0.8) * Math.min(1, (6.4 - t) / 0.7);
          this.puppet.add('body', 20 * k, 0, 0);
          this.puppet.add('head', 22 * k, 10 * sin(t, 0.4) * k, 0);
          this.arm(1, 30 * k, 40 * k, 20 * k);
          this.arm(-1, 30 * k, 40 * k, 20 * k);
          this.puppet.add('antenna', 30 * k, 0, 0);
        },
      },
      // ---- With a crewmate
      greet: {
        weight: 1.3,
        length: [8, 10],
        face: 'happy',
        when: () => calm() && !!this.mate(),
        start: () => {
          const o = this.mate();
          this.did = 0;
          if (o) this.walkTo(o.s, o.depth);
        },
        pose: (t) => {
          const o = this.mate();
          const dir = o ? Math.sign(o.s - this.s) || 1 : 1;
          if (this.stride < 1 && t > 1) {
            if (!this.did) this.did = t;
            this.arm(-1, 44, 22, 55 + 15 * sin(t, 1.7), 15 * sin(t, 1.7));
            this.puppet.add('head', 0, dir * 20, -dir * 4);
          } else this.puppet.add('head', 0, dir * 14, 0);
        },
      },
      watchMate: {
        weight: 1.1,
        length: [5, 7],
        when: () => calm() && !!this.mate(),
        pose: (t) => {
          const o = this.mate();
          const dir = o ? Math.sign(o.s - this.s) || 1 : 1;
          this.puppet.add('head', 0, dir * 26, dir * 8 * sin(t, 0.35));
          this.puppet.add('body', 0, dir * 8, 0);
          this.puppet.add('antenna', 0, 0, dir * 16);
          this.arm(-dir as 1 | -1, 8, 6);
        },
      },
      // ---- Sitting on the lip
      legSwing: {
        weight: 2,
        length: [5, 8],
        face: 'happy',
        when: sitting,
        pose: (t) => {
          this.puppet.add('leg.L', -14 + 24 * sin(t, 0.8), 0, 0);
          this.puppet.add('leg.R', -14 - 24 * sin(t, 0.8), 0, 0);
          this.puppet.add('head', 8, 10 * sin(t, 0.2), 0);
          this.arms(30, 10);
        },
      },
      sitLook: {
        weight: 1.5,
        length: [5, 6],
        when: sitting,
        pose: (t) => {
          // Watches the page below, then a sudden glance up.
          const up = Math.max(0, sin(t, 0.22));
          this.puppet.add('head', 14 - 34 * up, 20 * sin(t, 0.4), 0);
          this.arm(1, 28, 16, 10);
          this.arm(-1, 28, 16, 10);
        },
      },
      // ---- In the air
      loop: {
        weight: 0.7,
        length: [1.6, 1.6],
        face: 'happy',
        when: flying,
        pose: (t) => {
          this.roll = 360 * this.way * smooth(t / 1.3);
          this.arms(60);
        },
        start: () => (this.way = Math.random() < 0.5 ? -1 : 1),
      },
      somersault: {
        weight: 0.6,
        length: [1.6, 1.6],
        face: 'surprised',
        when: flying,
        pose: (t) => {
          this.flip = 360 * smooth(t / 1.2);
          this.arms(30, 0, 60);
        },
      },
      sputter: {
        weight: 0.6,
        length: [3, 3],
        face: 'surprised',
        when: flying,
        start: () => this.lift.kick(-0.8),
        pose: (t) => {
          this.sputter = t < 1.8 ? (Math.sin(t * 38) > 0.2 ? 1 : 0.1) : 1;
          if (t < 1.8) this.puppet.add('body', 0, 0, 6 * sin(t, 5));
          this.puppet.add('antenna', 40 * sin(t, 4), 0, 0);
          this.arms(30 + 20 * sin(t, 6), 0, 50);
        },
      },
      hoverPeek: {
        weight: 0.9,
        length: [4, 5],
        when: flying,
        pose: (t) => {
          this.arm(-1, 40, 40, 128);
          this.puppet.add('head', 0, 30 * Math.tanh(4 * sin(t, 0.35)), 0);
        },
      },
      superhero: {
        weight: 0.7,
        length: [3.2, 4],
        face: 'happy',
        when: flying,
        pose: (t) => {
          const k = Math.min(1, t / 0.5) * Math.min(1, (3.6 - t) / 0.5);
          this.arm(1, 20 * k, 80 * k, 4);
          this.arm(-1, 20 * k, 80 * k, 4);
          this.puppet.add('body', 26 * k, 0, 0);
          this.puppet.add('head', -22 * k, 0, 0);
          this.puppet.add('leg.L', 26 * k, 0, 0);
          this.puppet.add('leg.R', 26 * k, 0, 0);
        },
      },
      flyWave: {
        weight: 1,
        length: [2.4, 3],
        face: 'happy',
        when: flying,
        pose: (t) => {
          this.arm(-1, 46, 12, 60 + 14 * sin(t, 1.8), 14 * sin(t, 1.8));
          this.puppet.add('head', 0, 0, -6);
        },
      },
      // ---- Feelings
      scuff: {
        weight: 0.8,
        length: [3.6, 4.4],
        face: 'sheepish',
        when: calm,
        pose: (t) => {
          // Caught looking pleased with himself: hands behind, head ducked, one boot
          // scuffing at the floor, a glance up and away.
          this.arms(-6, -20, 40);
          this.puppet.add('body', 5, 0, 0);
          this.puppet.add('head', 14 + 4 * sin(t, 0.5), 12 * Math.tanh(3 * sin(t, 0.28)), 5);
          this.puppet.add('leg.R', 20 * Math.max(0, sin(t, 1.6)), 0, 0);
          this.puppet.add('antenna', 12, 0, 8 * sin(t, 0.7));
        },
      },
      proud: {
        weight: 0.7,
        length: [3.4, 4.2],
        face: 'determined',
        when: calm,
        pose: (t) => {
          // Chest out, chin up, fists on his hips, and the chest light swells.
          this.arms(30, -4, 100);
          this.puppet.add('body', -7, 0, 0);
          this.puppet.add('head', -9, 5 * sin(t, 0.2), 0);
          this.puppet.add('antenna', -14, 0, 0);
          this.danceLift = 0.012 * Math.sin(Math.PI * clamp(t / 0.6, 0, 1));
          this.chest = 1;
        },
      },
      awe: {
        weight: 0.6,
        length: [3.4, 4.4],
        face: 'starry',
        when: calm,
        pose: (t) => {
          // Star-struck: hands clasped under his chin, head tipped up at something
          // wonderful, a little bounce of delight on the toes.
          this.arms(14, 36, 118);
          this.puppet.add('head', -16, 6 * sin(t, 0.25), 3 * sin(t, 0.5));
          this.puppet.add('body', -3, 0, 0);
          this.puppet.add('antenna', 0, 0, 10 * sin(t, 1.4));
          this.danceLift = 0.014 * Math.abs(sin(t, 1.3));
          this.chest = 0.7;
        },
      },
      // Nova's high five: never picked at random, she asks for it.
      highfive: {
        weight: 0,
        length: [2.6, 2.6],
        face: 'happy',
        when: standing,
        pose: (t) => {
          const k = Math.min(1, t / 0.5) * Math.min(1, (2.6 - t) / 0.4);
          const hit = t > 1.0 && t < 1.35 ? 1 : 0;
          this.arm(this.friend, (62 + 8 * hit) * k, 14 * k, 26 * k);
          this.puppet.add('head', 0, this.friend * 14 * k, this.friend * 4 * k);
          this.danceLift = 0.02 * Math.abs(sin(t, 1.5)) * k;
        },
      },
      // Reactions (never picked at random)
      poked: {
        weight: 0,
        length: [1.2, 1.2],
        face: 'happy',
        start: () => {
          this.lift.kick(this.flying ? 0.4 : 1.1);
          this.squash.kick(2);
        },
        pose: () => this.arms(35, 10),
      },
      dizzy: {
        weight: 0,
        length: [2.8, 2.8],
        face: 'dizzy',
        pose: (t) => {
          const a = 2 * Math.PI * 1.1 * t;
          this.puppet.add('body', 7 * Math.cos(a), 0, 7 * Math.sin(a));
          this.puppet.add('head', -6 * Math.sin(a), 0, 6 * Math.cos(a));
          this.arms(20 + 10 * Math.sin(a * 1.3));
        },
      },
    };
  }

  private danceLift = 0;
  private lastFrame!: Frame;

  poke() {
    const now = performance.now() / 1000;
    this.pokes = [...this.pokes.filter((p) => now - p < 1.6), now];
    if (this.pokes.length >= 3) {
      this.pokes = [];
      this.setAct('dizzy');
    } else this.setAct(this.seated ? 'poked' : Math.random() < 0.5 ? 'poked' : 'wave');
    if (this.act === 'poked') this.expression = 'happy';
  }

  // ---------- Flight ----------

  private hoverSpot(frame: Frame) {
    const left = Math.random() < 0.5;
    const band = frame.bot;
    const top = frame.top + this.heightPx * 1.3;
    const bottom = frame.bottom - this.heightPx * 0.4;
    return {
      x: left ? frame.left + band * 0.5 : frame.right - band * 0.5,
      y: top + Math.random() * Math.max(0, bottom - top),
    };
  }

  private landingSpot(frame: Frame) {
    const w = this.widthPx();
    const nearLeft = (this.free?.x ?? this.s) < (frame.left + frame.right) / 2;
    const x = nearLeft
      ? frame.left + w + Math.random() * (frame.right - frame.left) * 0.3
      : frame.right - w - Math.random() * (frame.right - frame.left) * 0.3;
    return { x, y: frame.bottom };
  }

  /** Fly somewhere in the band, round the corners rather than across the page. */
  private flyTo(to: { x: number; y: number }, land = false) {
    const f = this.lastFrame;
    const from = this.free ?? { x: this.s, y: f.bottom };
    const low = f.bottom - this.heightPx * 0.3;
    this.route = [];
    const side = (x: number) => (x < f.left + f.bot * 2 ? -1 : x > f.right - f.bot * 2 ? 1 : 0);
    const a = side(from.x);
    const b = side(to.x);
    // Coming down a side to the bottom, or crossing to the other side: go by the corners.
    if (a !== 0 && a !== b) this.route.push({ x: from.x, y: low });
    if (b !== 0 && a !== b) this.route.push({ x: to.x, y: low });
    if (a === 0 && b === 0 && Math.abs(to.x - from.x) > 1) this.route.push({ x: to.x, y: low });
    this.route.push(to);
    this.landing = land;
    // Up in the air he drifts in and out of the box. He lands somewhere on the floor, or
    // now and then at the front, on the lip, where he can sit with his legs over it.
    const floor = Math.random() < 0.3 ? 0 : 0.2 + Math.random() * 0.6;
    this.depthGoal = land ? floor : Math.random() < 0.4 ? 0 : 0.3 + Math.random() * 0.7;
  }

  private takeOff() {
    const f = this.lastFrame;
    this.flying = true;
    this.seated = false;
    this.free = { x: this.s, y: f.bottom, tilt: 0 };
    this.vel = { x: 0, y: -this.heightPx * 3 };
    this.squash.kick(-1.5);
    this.flames.kick(8);
    this.flyTo(this.hoverSpot(f));
  }

  private touchDown() {
    this.flying = false;
    this.landing = false;
    this.s = this.free!.x;
    this.h = 0;
    this.free = null;
    // Down where he is, not skating on to where he meant to be.
    this.depthGoal = this.depth;
    this.squash.kick(-3);
    this.vel = { x: 0, y: 0 };
    if (this.exiting) super.leave(this.exitBy);
    else this.setAct('idle');
  }

  leave(by?: 'rise' | Door) {
    if (this.exiting || this.state !== 'here') return super.leave(by);
    this.exiting = true;
    this.exitBy = by;
    if (this.flying) this.flyTo(this.landingSpot(this.lastFrame), true);
    else super.leave(by);
  }

  /**
   * Up to a spot in front of the box (viewport px, his feet there) and hovering there on his
   * flames for as long as it takes (tools.ts: a sign held up in the air). comeDown() brings
   * him back to the floor. False if he can't just now.
   */
  hoverAt(x: number, y: number) {
    if (this.state !== 'here' || this.exiting) return false;
    if (!this.flying) this.takeOff();
    this.errand = { x, y };
    this.landing = false;
    this.route = [{ x, y }];
    this.depthGoal = 0;
    return true;
  }

  /** Is he hovering at hoverAt()'s spot (or on his way)? */
  get onErrand() {
    return !!this.errand && this.state === 'here';
  }

  /** Done hovering: down to the floor where he is. */
  comeDown() {
    if (!this.errand) return;
    this.errand = null;
    if (this.flying && !this.landing && this.free)
      this.flyTo({ x: this.free.x, y: this.lastFrame.bottom }, true);
  }

  /** Off the side of the frame, in the air if he's up (else on foot, as ever). */
  leaveToward(to: 'left' | 'right' | Door) {
    if (typeof to !== 'string' || !this.flying || !this.free || this.state !== 'here') return super.leaveToward(to);
    const f = this.lastFrame;
    const H = this.heightPx;
    this.errand = null;
    this.exiting = true;
    this.offstage = true;
    this.landing = false;
    this.state = 'leaving';
    this.route = [{ x: to === 'left' ? f.left - H * 2 : f.right + H * 2, y: this.free.y - H * 0.8 }];
  }

  protected onEnter() {
    this.errand = null;
    this.offstage = false;
    this.flying = false;
    this.seated = false;
    this.exiting = false;
    this.landing = false;
    this.free = null;
    this.flames.snap(1.2);
  }

  /** Given a part up in the air: he comes down where he is, to be on his feet for it. */
  protected onDirect() {
    if (this.flying && !this.landing && this.free && !this.errand)
      this.flyTo({ x: this.free.x, y: this.lastFrame.bottom }, true);
  }

  protected onArrive() {
    // (Unless he's come in on a job: then he's on his feet.)
    if (!this.role) this.takeOff();
  }

  protected move(dt: number, env: Env) {
    this.lastFrame = env.frame;
    this.stageEnv = env;
    if (!this.flying) {
      super.move(dt, env);
      this.unclipped = this.seated;
      return;
    }
    this.unclipped = false;
    const pos = this.free!;
    if (this.offstage && (pos.x < env.frame.left - this.heightPx * 1.2 || pos.x > env.frame.right + this.heightPx * 1.2)) {
      this.offstage = this.exiting = this.flying = false;
      this.free = null;
      this.route = [];
      return this.gone();
    }
    const target = this.route[0];
    const maxSpeed = this.heightPx * 7;
    const maxAcc = this.heightPx * 16;
    let ax = 0;
    let ay = 0;
    if (target) {
      const dx = target.x - pos.x;
      const dy = target.y - pos.y;
      const dist = Math.hypot(dx, dy);
      const last = this.route.length === 1;
      if (dist < (last ? 1.5 : this.heightPx * 0.6)) {
        this.route.shift();
        if (!this.route.length && this.landing) return this.touchDown();
      } else {
        // Arrive: full speed until near, then ease in (only at the end of the route).
        const speed = last ? Math.min(maxSpeed, dist * 2.4) : maxSpeed;
        ax = ((dx / dist) * speed - this.vel.x) * 5;
        ay = ((dy / dist) * speed - this.vel.y) * 5;
      }
    } else {
      ax = -this.vel.x * 4;
      ay = -this.vel.y * 4;
    }
    const a = Math.hypot(ax, ay);
    if (a > maxAcc) [ax, ay] = [(ax / a) * maxAcc, (ay / a) * maxAcc];
    this.acc = { x: ax, y: ay };
    this.vel.x += ax * dt;
    this.vel.y += ay * dt;
    pos.x += this.vel.x * dt;
    pos.y += this.vel.y * dt;
    // Lean into the way he's going, and turn a little toward it.
    pos.tilt =
      ((this.tilt.update(dt, clamp(-this.vel.x / maxSpeed, -1, 1) * 22) + this.roll) * Math.PI) /
      180;
    this.heading.update(dt, clamp(this.vel.x / maxSpeed, -1, 1) * 35);
  }

  // ---------- Posing ----------

  protected idle(t: number) {
    const breath = Math.sin(2 * Math.PI * 0.25 * t);
    this.danceLift = 0;
    this.spin = 0;
    this.roll = 0;
    this.flip = 0;
    this.boost = 0;
    this.sputter = 1;
    this.scanning = 0;
    this.tool = null;
    if (this.act !== 'strut') this.spec.speed = 1;
    if (this.flying || this.state === 'entering' || (this.state === 'leaving' && !this.seated)) {
      const bob = Math.sin(2 * Math.PI * 0.45 * t);
      this.arms(12 + 4 * bob);
      this.puppet.add('leg.L', 6 + 5 * Math.sin(2 * Math.PI * 0.45 * t - 1.1), 0, 0);
      this.puppet.add('leg.R', 4 + 5 * Math.sin(2 * Math.PI * 0.45 * t - 1.1), 0, 0);
    } else if (this.seated) {
      this.arms(24, 10);
      this.puppet.add('leg.L', -10 + 14 * Math.sin(2 * Math.PI * 0.5 * t), 0, 0);
      this.puppet.add('leg.R', -10 - 14 * Math.sin(2 * Math.PI * 0.5 * t), 0, 0);
      this.puppet.add('head', -3, 0, 0);
    } else {
      // Standing: breathing lifts the shoulders a beat before the head follows, weight
      // shifts slowly from boot to boot, and the head drifts as if thinking.
      const lag = Math.sin(2 * Math.PI * 0.25 * t - 0.6);
      const shift = Math.sin(2 * Math.PI * 0.11 * t);
      this.arms(4 + 1.5 * breath, 0, 0);
      this.puppet.add('upper_arm.L', 0, 0, 1.2 * lag);
      this.puppet.add('upper_arm.R', 0, 0, 1.2 * lag);
      this.puppet.add('body', 1.5 * breath, 0, 1.4 * shift);
      this.puppet.add(
        'head',
        -0.8 * lag + 1.2 * wobble(t * 0.4, 3),
        2.5 * wobble(t * 0.25, 4),
        -1.2 * shift,
      );
      this.puppet.add('leg.L', 1.5 * Math.max(0, shift), 0, 0);
      this.puppet.add('leg.R', 1.5 * Math.max(0, -shift), 0, 0);
    }
    this.puppet.add(
      'antenna',
      4 * wobble(t * 0.7, 1),
      0,
      5 * wobble(t * 0.6, 2) - 2.5 * Math.sin(2 * Math.PI * 0.11 * t),
    );
  }

  protected pose(dt: number) {
    const maxSpeed = this.heightPx * 7;
    const maxAcc = this.heightPx * 16;
    if (this.flying) {
      // Legs trail, the antenna lags, arms press down when he climbs.
      this.puppet.add(
        'leg.L',
        -clamp(this.vel.y / maxSpeed, -1, 1) * 15,
        0,
        -clamp(this.vel.x / maxSpeed, -1, 1) * 18,
      );
      this.puppet.add(
        'leg.R',
        -clamp(this.vel.y / maxSpeed, -1, 1) * 15,
        0,
        -clamp(this.vel.x / maxSpeed, -1, 1) * 18,
      );
      this.puppet.add(
        'antenna',
        clamp(this.acc.y / maxAcc, -1, 1) * 15,
        0,
        clamp(this.acc.x / maxAcc, -1, 1) * 25,
      );
      this.arms(clamp(this.acc.y / maxAcc, -1, 1) * 12);
    }
    if (!this.flying && !this.seated && this.stride > 1) {
      // Walking: boots alternate, arms swing a little, a small bob.
      const amount = clamp(this.stride / this.lastFrame.bot, 0, 1.3);
      const step = Math.sin(this.gait * 4.6);
      // Shorter, quicker steps with the boot swing kept to what the feet can cover; the body
      // rolls onto the planted foot, the head and antenna a beat behind, arms counter-swing.
      this.puppet.add('leg.L', 32 * amount * step, 0, 0);
      this.puppet.add('leg.R', -32 * amount * step, 0, 0);
      this.puppet.add('body', 2 * amount, 0, 3.5 * amount * step);
      this.puppet.add('head', 0, 0, -2 * amount * step);
      this.puppet.add('antenna', -6 * amount * Math.cos(this.gait * 4.6), 0, -5 * amount * step);
      if (!this.tool) {
        this.puppet.add('upper_arm.L', -12 * amount * step, 0, 0);
        this.puppet.add('upper_arm.R', 12 * amount * step, 0, 0);
      }
      this.danceLift = Math.max(
        this.danceLift,
        0.011 * amount * (1 - Math.cos(this.gait * 9.2)) * 0.5,
      );
    }
    // Rest the seat on the line when sitting.
    const lift = this.lift.update(dt, 0);
    const seat = this.seatY.update(dt, this.seated ? -SEAT : 0);
    const bob = this.flying ? 0.02 * Math.sin(2 * Math.PI * 0.45 * this.t) : 0;
    this.puppet.shift(
      'root',
      0,
      Math.max(lift, this.flying ? -1 : 0) +
        seat +
        bob +
        Math.max(0, this.hopY.update(dt, this.danceLift)),
      0,
    );
  }

  protected after(dt: number, env: Env) {
    // Flames: on in the air, flaring when he climbs, out when he stands.
    const maxAcc = this.heightPx * 16;
    const burning =
      this.flying || this.state === 'entering' || (this.state === 'leaving' && !this.seated);
    const climb = clamp(-this.acc.y / maxAcc, -0.5, 1);
    const level =
      Math.max(0, this.flames.update(dt, burning ? 0.85 + climb * 0.5 : this.boost)) * this.sputter;
    const flicker = 1 + 0.12 * Math.sin(env.time * 41) + 0.08 * Math.sin(env.time * 67);
    for (const [side, phase] of [
      ['L', 0],
      ['R', 1.7],
    ] as const) {
      const along = Math.max(level * (flicker + 0.05 * Math.sin(env.time * 53 + phase)), 0.001);
      this.puppet.stretch(`thrust.${side}`, along, [0, -1, 0], Math.min(1, 0.6 + level * 0.4));
    }
    // Squash and stretch through the root, and a whole-body spin for tricks.
    const sq = clamp(this.squash.update(dt, 1), 0.7, 1.3);
    this.puppet.stretch('root', sq, [0, 1, 0], 1 / Math.sqrt(sq));
    this.pivot.rotation.y = this.spin;
    if (this.flip) this.puppet.turn('body', this.flip, 0, 0);
    for (const n of ['broom', 'duster', 'wrench'] as const) {
      const l = Math.max(this.toolLevel[n].update(dt, this.tool === n ? 1 : 0), 0.001);
      this.puppet.stretch(n, l, [0, 0, 1], l);
    }
    // The beacon shows his mood.
    const mood = this.face?.expression ?? 'neutral';
    let target: string;
    if (mood === 'dizzy') target = RAINBOW[Math.floor(env.time * 6) % RAINBOW.length];
    else if (mood === 'asleep') target = Math.sin(env.time * 1.4) > 0 ? '#55554f' : '#8a8a84';
    else if (mood === 'neutral') target = glowColour.value ?? BEACON.neutral!;
    else target = BEACON[mood] ?? glowColour.value ?? '#f4f4f1';
    this.beaconColour.lerp(new Color(target), Math.min(1, dt * 5));
    this.outfit.beacon(this.beaconColour);
    // Status lights: the hatch light blinks, the buckle wears his mood, the chest row idles
    // steady, chases while he scans or tinkers, and runs on in the air.
    const asleep = mood === 'asleep';
    this.outfit.dot(0, asleep ? 0 : Math.sin(env.time * 2.2) > 0.6 ? 1 : 0.15, this.beaconColour);
    this.outfit.dot(1, asleep ? 0.1 : 0.9, this.beaconColour);
    for (let i = 0; i < 3; i++) {
      let lv = asleep ? 0.05 : 0.45;
      if (this.scanning) lv = Math.max(0.1, Math.cos(env.time * 7 - i * 1.3));
      else if (this.flying) lv = 0.5 + 0.5 * Math.sin(env.time * 9 - i * 1.5);
      this.outfit.dot(2 + i, lv, this.beaconColour);
    }
    // The chest lens beats like a slow heart and swells when he is proud or pleased; the
    // ear lights glow softly, brighter while he listens (the mouse is near, or he looks about).
    const chest = this.chestLevel.update(dt, this.chest || (this.hovered ? 0.8 : 0));
    const beat = Math.max(0, Math.sin(env.time * 2.4)) ** 6;
    this.outfit.dot(
      6,
      asleep ? 0.08 : clamp(0.35 + 0.25 * beat + 0.6 * chest, 0, 1),
      this.beaconColour,
    );
    const listening = this.hovered || this.act === 'lookAround' || this.act === 'watchMate' ? 1 : 0;
    const ear = this.ears.update(dt, asleep ? 0 : 0.3 + 0.7 * listening);
    this.outfit.dot(
      5,
      clamp(ear + 0.12 * Math.sin(env.time * 3.1) * listening, 0, 1),
      this.beaconColour,
    );
    this.chest = 0;
    if (this.act === 'idle' && this.state === 'here') this.expression = 'neutral';
  }
}

/** Ease 0..1 with a small wind-up the other way first, for spins. */
function wind(x: number) {
  const k = clamp(x, 0, 1);
  return smooth(k) - 0.045 * Math.sin(Math.PI * clamp(k / 0.22, 0, 1));
}

function smooth(x: number) {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}
