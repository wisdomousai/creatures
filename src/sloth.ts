import { Color, type Object3D } from 'three';
import { BEACON } from './bolt';
import { type Act, Character, clamp, type Env } from './character';
import type { Expression, FaceLayout } from './face';
import { sin } from './moves';
import { Spring } from './spring';

/**
 * Lag, the robot sloth. He lives on the top edge only, hanging from the frame line by
 * his long arms: he lowers himself in from the ceiling, sways, creeps along the line
 * hand over hand, curls up to nap, and pulls himself up out of sight again.
 *
 * Everything about him is slow, feelings included, because he's always low on power:
 * the gauge on his chest runs down while he's up and about, the last bar blinking when
 * he's nearly flat, and he naps to charge it, bar by bar (or turns his solar panel to
 * the light). When it is nearly flat he browns out and reboots. His eyes follow the
 * mouse long after it has moved; a poke only registers a second later; when the mouse
 * rests on him he lets go with one arm for a slow-motion wave. He has a couple of
 * dozen slow tricks: a yawn behind his hand, swinging by one arm, hanging by his feet,
 * a hug of his own arm, chin-ups, a sneeze in slow motion, dozing off mid-act and
 * jerking awake, reaching down to a crewmate, dropping on his tether to look around.
 * He is built head down (the top edge turns him the right way up), so his face screen
 * is turned round too.
 */
export const SLOTH_FACE: FaceLayout = {
  width: 512,
  height: 160,
  eyes: [
    [0.3, 0.5],
    [0.7, 0.5],
  ],
  rx: 0.065,
  ry: 0.3,
  line: 0.034,
  mouth: null,
};

const LIMBS = [
  ['arm.L', 'leg.L', 1],
  ['arm.R', 'leg.R', -1],
] as const;
type Side = 'L' | 'R';
const colour = new Color();
const DIM = new Color('#55554f');
const BARS = 4;
/** His model's height in metres, and how long his tether is folded (the crown to the line). */
const HANG = 0.7;
const CABLE = 0.092;

/** 0 to 1 with soft ends. */
const smooth = (x: number) => {
  const k = clamp(x, 0, 1);
  return k * k * (3 - 2 * k);
};
/** A bump: up over `up` seconds from `at`, down over `down` after `hold`. */
const bump = (t: number, at: number, up: number, hold: number, down: number) =>
  smooth((t - at) / up) * smooth((at + up + hold + down - t) / down);

export class Sloth extends Character {
  private pokes: number[] = [];
  private hover = 0;
  private light = new Color(BEACON.neutral);
  /** His battery, 0 flat to 1 full. */
  private charge = 0.35 + Math.random() * 0.5;
  /** How far down his tether he has dropped (0 on the line). */
  private lower = new Spring(0.6, 0.9);
  private lowerTo = 0;
  /** A crewmate on the floor below, if any, and how far along the edge (px). */
  private below: { c: Character; dx: number } | null = null;
  /** What the act feels this frame (overrides the mood), and one-shot markers. */
  private felt: Expression | null = null;
  private fired = new Set<string>();
  /** The beacon's extra flash (a sneeze), and a faster pulse (dancing). */
  private flash = 0;
  private lively = 0;
  /** Swung upside down by his feet (shifts the model so the feet stay on the line). */
  private inverted = false;
  /** A brownout: the gauge and lights go dark, then come back bar by bar. */
  private dark = 0;
  private boot = 0;
  private turn = 0;
  private soaking = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Lag',
        model: 'sloth',
        metres: 0.72,
        width: 0.5,
        size: 1.1,
        feels: {
          default: { f: 0.9, zeta: 0.5 },
          // A pendulum from the line: slow, and slow to settle.
          root: { f: 0.35, zeta: 0.25 },
          body: { f: 0.6, zeta: 0.4 },
          head: { f: 0.6, zeta: 0.6, r: 0 },
          'arm.L': { f: 0.8, zeta: 0.6 },
          'arm.R': { f: 0.8, zeta: 0.6 },
          'fore.L': { f: 0.9, zeta: 0.5 },
          'fore.R': { f: 0.9, zeta: 0.5 },
          'hand.L': { f: 1.1, zeta: 0.5 },
          'hand.R': { f: 1.1, zeta: 0.5 },
          'leg.L': { f: 0.7, zeta: 0.2 },
          'leg.R': { f: 0.7, zeta: 0.2 },
          'shin.L': { f: 0.8, zeta: 0.3 },
          'shin.R': { f: 0.8, zeta: 0.3 },
          tail: { f: 0.9, zeta: 0.3 },
        },
        face: SLOTH_FACE,
        eyes: 0.27,
        gaze: [
          { bone: 'head', yaw: 0.7, pitch: 0.6 },
          { bone: 'body', yaw: 0.2, pitch: 0 },
        ],
        reach: { yaw: 45, pitch: 25 },
        lag: 2.5,
        entrance: 'rise',
        edges: ['top'],
        stay: [60, 150],
        speed: 0.3,
        turn: 0,
        // Creeps back along the ceiling, too.
        roam: true,
      },
      model,
    );
    // He lowers himself in, and pulls himself out, slowly.
    this.rise = new Spring(0.4, 0.8, 0);
    this.acts = this.moves();
  }

  // ---------- Poses ----------

  /** Lets go of the line with one arm and holds it out to the side, the forearm folded up. */
  private raise(side: Side, out: number, bend: number, k: number) {
    const sd = side === 'L' ? 1 : -1;
    this.puppet.add(`arm.${side}`, 0, 0, sd * out * k);
    this.puppet.add(`fore.${side}`, 0, 0, -sd * bend * k);
  }

  /** An arm brought forward in front of him, the forearm folded up; `across` is inward. */
  private front(side: Side, forward: number, fold: number, across: number, k: number) {
    const sd = side === 'L' ? 1 : -1;
    this.puppet.add(`arm.${side}`, -forward * k, 0, -sd * across * k);
    this.puppet.add(`fore.${side}`, fold * k, 0, 0);
  }

  /** An arm let go and brought across his chest, the hand at his gauge (low: his belly). */
  private chest(side: Side, low: number, fold: number, k: number) {
    const sd = side === 'L' ? 1 : -1;
    this.puppet.add(`arm.${side}`, 0, -sd * 70 * k, sd * (122 + 24 * low) * k);
    this.puppet.add(`fore.${side}`, -fold * k, 0, 0);
  }

  /** An arm let go and hanging down at his side, swaying a little. */
  private dangle(side: Side, k: number, t: number, phase = 0) {
    const sd = side === 'L' ? 1 : -1;
    this.puppet.add(
      `arm.${side}`,
      8 * sin(t, 0.13, phase) * k,
      0,
      sd * (158 + 6 * sin(t, 0.17, phase)) * k,
    );
  }

  private slowWave(t: number, k: number) {
    // Letting go with one arm for a wave, in slow motion; swinging from the other.
    this.raise('L', 100, 78 + 26 * sin(t, 0.36), k);
    this.puppet.add('hand.L', 0, 0, 12 * sin(t, 0.36, 0.25) * k);
    this.puppet.add('root', 0, 0, -8 * k);
  }

  /** Once per act, the first frame `when` holds. */
  private once(key: string, when: boolean) {
    if (!when || this.fired.has(key)) return false;
    this.fired.add(key);
    return true;
  }

  private moves(): Record<string, Act> {
    const still = () => !this.walking;
    const p = () => this.puppet;
    const len = () => this.actLength;
    const way = () => (Math.random() < 0.5 ? -1 : 1);
    const fresh = () => this.fired.clear();
    return {
      idle: { weight: 3, length: [6, 10] },

      // Locomotion.
      creep: {
        weight: 1.2,
        length: [6, 10],
        when: still,
        start: () => {
          this.walkTo(this.s + way() * this.heightPx * (0.8 + Math.random() * 0.7));
        },
      },
      peerBack: {
        // Creeps to the back wall and peers out over the room, a hand shading his eyes.
        weight: 0.7,
        length: [15, 15],
        when: still,
        start: () => {
          fresh();
          this.walkTo(this.s + way() * this.heightPx * (0.5 + Math.random() * 0.6), 0.95);
        },
        pose: (t) => {
          const g = this.there ? smooth((t - 2) / 1.5) * smooth((len() - 4.5 - t) / 1.5) : 0;
          this.front('R', 105, 100, 8, g);
          p().add('head', -10 * g, 34 * sin(t, 0.09) * g, 6 * g);
          this.felt = g > 0.5 ? 'focused' : null;
          if (this.once('home', t > len() - 4.5))
            this.walkTo(this.s + way() * this.heightPx * 0.6, 0);
        },
      },
      leanOut: {
        // Creeps to the front lip and leans out toward us with a slow hello.
        weight: 0.7,
        length: [13, 13],
        when: still,
        start: () => {
          fresh();
          this.walkTo(this.s + way() * this.heightPx * (0.4 + Math.random() * 0.6), 0);
        },
        pose: (t) => {
          const g = this.there ? smooth((t - 2) / 1.5) * smooth((len() - 3 - t) / 1.5) : 0;
          p().add('body', -12 * g);
          p().add('head', 14 * g, 0, 6 * sin(t, 0.15) * g);
          this.slowWave(t, g * bump(t, 4, 1.5, 4, 1.5));
          this.felt = g > 0.5 ? 'happy' : null;
        },
      },

      // Rest.
      nap: {
        weight: 2,
        length: [12, 24],
        face: 'asleep',
        when: still,
        pose: (t) => {
          // Curled up: legs drawn up over his belly, head lolling.
          const k = smooth(t / 3);
          for (const [, leg, side] of LIMBS) {
            p().add(leg, 55 * k, 0, -side * 15 * k);
            p().add(leg.replace('leg', 'shin'), 40 * k);
          }
          p().add('head', 10 * k, 0, (18 + 3 * sin(t, 0.1)) * k);
          p().add('tail', 30 * k);
        },
      },
      dozeOff: {
        // Drifts off mid-act, head sinking, then jerks awake and looks about as if nothing happened.
        weight: 1,
        length: [10, 10],
        when: still,
        start: fresh,
        pose: (t) => {
          const sink = smooth(t / 4.5) * smooth((6.4 - t) / 0.3);
          p().add('head', -26 * sink, 0, 6 * sin(t, 0.15) * sink);
          p().add('root', 0, 0, 4 * sin(t, 0.1) * sink);
          this.felt =
            t < 1.5
              ? null
              : t < 4.2
                ? 'sleepy'
                : t < 6.4
                  ? 'asleep'
                  : t < 7.8
                    ? 'surprised'
                    : t < 9
                      ? 'neutral'
                      : null;
          if (this.once('jerk', t > 6.4)) {
            p().kick('head', 220, 0, 0);
            p().kick('root', 0, 0, way() * 40);
            p().kick('arm.L', 0, 0, 60);
            p().kick('arm.R', 0, 0, -60);
            this.flash = 1;
          }
          if (t > 7.5) p().add('head', 0, 30 * Math.sin((t - 7.5) * 1.6));
        },
      },
      reboot: {
        // Low on power he browns out: eyes off, gauge dark, then it comes back bar by bar.
        weight: 0.4,
        length: [8, 8],
        when: still,
        start: () => {
          fresh();
          this.dark = 0;
          this.boot = 0;
        },
        pose: (t) => {
          const off = smooth((t - 0.2) / 0.6) * smooth((4.4 - t) / 0.2);
          this.dark = off;
          this.boot = clamp((t - 4.4) / 2.4, 0, 1);
          p().add('head', -24 * off);
          p().add('arm.L', 6 * off, 0, 10 * off);
          p().add('arm.R', 6 * off, 0, -10 * off);
          this.felt = off > 0.5 ? 'asleep' : t < 5.6 ? 'sleepy' : t < 7 ? 'surprised' : null;
          if (this.once('up', t > 5.6)) {
            p().kick('head', 180, 0, 0);
            p().kick('root', 0, 0, way() * 25);
            this.flash = 1;
            this.charge = Math.max(this.charge, 0.28);
          }
        },
      },
      solar: {
        // Turns slowly round to show the solar panel on his back to the light, and soaks.
        weight: 0.7,
        length: [13, 13],
        when: () => !this.walking && this.charge < 0.92,
        pose: (t) => {
          const a = bump(t, 0.5, 3.5, len() - 8.5, 3.5);
          this.turn = Math.PI * a;
          this.soaking = a;
          p().add('root', 0, 0, 4 * sin(t, 0.1) * a);
          p().add('head', 0, 0, 12 * a);
        },
      },

      // Stretches and fidgets.
      yawn: {
        weight: 1.6,
        length: [5.5, 5.5],
        when: still,
        pose: (t) => {
          const open = bump(t, 0.6, 1.8, 0.6, 1.2);
          const cover = bump(t, 1.4, 1, 1.4, 1);
          p().add('head', 30 * open);
          p().add('body', -5 * open);
          this.front('R', 100, 96, 6, cover);
          this.felt = open > 0.5 ? 'surprised' : t < 5 ? 'sleepy' : null;
          if (t > 4.4) p().add('head', 0, 0, 6 * Math.sin((t - 4.4) * 5) * smooth((5.4 - t) / 0.6));
        },
      },
      stretch: {
        weight: 0.8,
        length: [5, 7],
        face: 'sleepy',
        when: still,
        pose: (t) => {
          // One long, slow stretch: legs out, then back.
          const k = Math.sin(Math.min(1, t / 5) * Math.PI);
          for (const [, leg, side] of LIMBS) p().add(leg, -10 * k, 0, side * 25 * k);
          p().add('head', -15 * k);
        },
      },
      scratch: {
        weight: 1.2,
        length: [8, 8],
        when: still,
        pose: (t) => {
          // A hand comes down to scratch his belly, a leg twitching along.
          const k = bump(t, 0.4, 1.4, 4.4, 1.4);
          this.chest('R', 1, 50, k);
          p().add('fore.R', -12 * sin(t, 0.8) * k);
          p().add('arm.R', 0, 5 * sin(t, 0.8, 0.25) * k, 0);
          p().add('head', -14 * k, 0, 6 * k);
          p().add('leg.L', 12 * sin(t, 0.8) * k);
          p().add('tail', 0, 20 * sin(t, 0.8) * k);
          this.felt = k > 0.5 ? 'happy' : null;
        },
      },
      checkGauge: {
        weight: 1,
        length: [8, 8],
        when: still,
        pose: (t) => {
          // Looks down at his own battery gauge and taps it, worried or pleased.
          const k = bump(t, 0.5, 1.4, 4.6, 1.4);
          this.chest('L', 0, 60, k);
          p().add('fore.L', -14 * Math.max(0, sin(t - 2.6, 0.9)) * k);
          p().add('head', -30 * k);
          this.felt = k > 0.5 ? (this.charge < 0.5 ? 'sad' : 'happy') : null;
          this.flash = Math.max(this.flash, 0.6 * Math.max(0, sin(t - 2.6, 0.9)) * k);
        },
      },
      inspect: {
        weight: 0.9,
        length: [10, 10],
        when: still,
        pose: (t) => {
          // Brings a hand up to look at his claws, flexing them one after another.
          const k = bump(t, 0.5, 1.6, 5.6, 1.6);
          this.raise('L', 72, 88, k);
          p().add('hand.L', 55 * Math.max(0, sin(t, 0.45)) * k);
          p().add('head', -14 * k, 0, -8 * k);
          this.felt = k > 0.5 ? 'focused' : t > 9 ? 'sleepy' : null;
        },
      },
      swat: {
        weight: 0.8,
        length: [10, 10],
        when: still,
        start: fresh,
        pose: (t) => {
          // Follows a fly nobody else can see, takes a swipe at it, very slowly, and misses.
          const k = bump(t, 0.4, 1, 6.2, 1);
          p().add(
            'head',
            32 * Math.sin(t * 1.15) * k,
            30 * Math.sin(t * 0.95) * k,
            8 * Math.sin(t * 0.7) * k,
          );
          const swipe = bump(t, 5.4, 1.4, 0.2, 1.6);
          this.raise('R', 30 + 90 * swipe, 0, k);
          p().add('arm.R', -50 * swipe, 0, 0);
          p().add('root', 0, 0, -8 * swipe);
          this.felt = t < 0.6 ? null : t < 7 ? 'focused' : t < 9 ? 'sad' : 'sleepy';
        },
      },
      tilt: {
        weight: 1.2,
        length: [4.5, 4.5],
        when: still,
        pose: (t) => {
          // A slow, curious tilt of the head.
          const k = bump(t, 0.4, 1.3, 1.6, 1.3);
          p().add('head', -4 * k, -10 * k, 26 * k);
          this.felt = k > 0.4 ? 'happy' : null;
        },
      },
      tailTwitch: {
        weight: 0.7,
        length: [5, 5],
        when: still,
        pose: (t) => {
          // Looks round over his shoulder at his own tail as it wags by itself.
          const k = bump(t, 0.4, 1.4, 2, 1.2);
          p().add('head', 0, 44 * k);
          p().add('tail', 0, 45 * Math.sin(t * 3.4) * k);
          p().add('body', 0, 8 * k);
          this.felt = k > 0.4 ? 'wink' : null;
        },
      },
      sneeze: {
        weight: 0.8,
        length: [6.5, 6.5],
        when: still,
        start: fresh,
        pose: (t) => {
          // A sneeze in slow motion: the head goes slowly back, and back... then achoo.
          const build = smooth(t / 3) * smooth((3.4 - t) / 0.15);
          p().add('head', 30 * build);
          p().add('body', -8 * build);
          p().add('arm.L', 0, 0, -4 * build);
          if (this.once('achoo', t > 3.3)) {
            p().kick('head', -340, 0, 0);
            p().kick('root', -40, 0, way() * 30);
            p().kick('leg.L', 90);
            p().kick('leg.R', 90);
            this.flash = 1;
          }
          this.felt =
            t < 1
              ? null
              : t < 3.3
                ? 'surprised'
                : t < 4
                  ? 'dizzy'
                  : t < 5.4
                    ? 'surprised'
                    : 'sleepy';
        },
      },
      lateStartle: {
        weight: 0.9,
        length: [6, 6],
        when: still,
        start: fresh,
        pose: (t) => {
          // Something happened. He notices a second late, then jumps, then looks embarrassed.
          if (this.once('jump', t > 1.6)) {
            p().kick('root', 0, 0, way() * 45);
            p().kick('head', -260, 0, 0);
            for (const [arm, leg, side] of LIMBS) {
              p().kick(leg, 160);
              p().kick(arm, 0, 0, side * 40);
            }
            this.flash = 1;
          }
          this.felt = t < 1.6 ? 'neutral' : t < 3.6 ? 'surprised' : t < 4.6 ? 'cross' : 'sleepy';
        },
      },

      // Play.
      swing: {
        weight: 1.2,
        length: [11, 11],
        when: still,
        pose: (t) => {
          // Hangs by one arm and lets go with the rest, swinging like a pendulum.
          const k = bump(t, 0.8, 1.6, 6.2, 1.6);
          this.dangle('R', k, t);
          p().add('root', 0, 0, 16 * sin(t, 0.2) * k);
          for (const [, leg, side] of LIMBS)
            p().add(leg, 22 * sin(t, 0.2, 0.1) * k, 0, side * 6 * k);
          p().add('head', 0, 0, -6 * sin(t, 0.2, 0.05) * k);
          this.felt = k > 0.5 ? 'happy' : null;
        },
      },
      legKick: {
        weight: 1,
        length: [10, 10],
        when: still,
        pose: (t) => {
          // Dangling, he kicks his legs in turn, like a kid on a swing.
          const k = bump(t, 0.6, 1.4, 6.4, 1.4);
          p().add('leg.L', 34 * sin(t, 0.3) * k);
          p().add('leg.R', -34 * sin(t, 0.3) * k);
          p().add('shin.L', 20 * Math.max(0, -sin(t, 0.3)) * k);
          p().add('shin.R', 20 * Math.max(0, sin(t, 0.3)) * k);
          p().add('head', 0, 0, 4 * sin(t, 0.3) * k);
          this.felt = k > 0.5 ? 'happy' : null;
        },
      },
      hello: {
        weight: 1.2,
        length: [7, 7],
        when: still,
        pose: (t) => {
          // A very slow wave, and the time to enjoy it.
          const k = bump(t, 0.3, 1.6, 3.2, 1.6);
          this.slowWave(t, k);
          this.felt = k > 0.4 ? 'happy' : null;
        },
      },
      dance: {
        weight: 0.8,
        length: [11, 11],
        when: still,
        pose: (t) => {
          // A lazy dance: sways, one hand up waving, legs kicking in turn, lights pulsing.
          const k = bump(t, 0.8, 1.8, 6.4, 1.8);
          const beat = sin(t, 0.32);
          p().add('root', 0, 0, 9 * beat * k);
          this.raise('R', 110 + 20 * sin(t, 0.32, 0.25), 60 + 20 * sin(t, 0.64), k);
          p().add('leg.L', 30 * sin(t, 0.32, 0.25) * k);
          p().add('leg.R', -30 * sin(t, 0.32, 0.25) * k);
          p().add('head', 4 * sin(t, 0.64), 0, -12 * beat * k);
          p().add('body', 5 * sin(t, 0.64) * k);
          p().add('tail', 0, 30 * beat * k);
          this.lively = k;
          this.felt = k > 0.4 ? (sin(t, 0.16) > 0 ? 'happy' : 'love') : null;
        },
      },
      chinUp: {
        weight: 0.8,
        length: [11, 11],
        when: still,
        pose: (t) => {
          // Two slow chin-ups, with effort, then a rest and a pant.
          const w = bump(t, 1, 0.6, 6.4, 0.6);
          const u = w * (1 - Math.cos(2 * Math.PI * ((t - 1) / 3.5))) * 0.5;
          for (const [arm, , side] of LIMBS) {
            p().add(arm, 0, 0, side * 46 * u);
            p().add(arm.replace('arm', 'fore'), 0, 0, -side * 92 * u);
          }
          p().shift('body', 0, 0.07 * u, 0);
          p().add('head', -8 * u);
          p().add('leg.L', -10 * u);
          p().add('leg.R', -10 * u);
          this.charge = clamp(this.charge - 0.0006 * w, 0, 1);
          this.felt = w > 0.3 ? 'focused' : t > 7.6 ? 'sleepy' : null;
          if (t > 7.6) p().add('head', 6 * Math.sin((t - 7.6) * 3.2) * smooth((10.4 - t) / 0.8));
        },
      },
      spin: {
        weight: 0.8,
        length: [9, 9],
        when: still,
        pose: (t) => {
          // A slow spin on the spot, legs drifting out a little.
          const a = smooth(t / len());
          this.turn = 2 * Math.PI * a;
          const k = Math.sin(a * Math.PI);
          p().add('leg.L', 0, 0, 16 * k);
          p().add('leg.R', 0, 0, -16 * k);
          this.felt = k > 0.3 ? 'happy' : null;
        },
      },
      flip: {
        weight: 0.7,
        length: [15, 15],
        when: still,
        pose: (t) => {
          // Lets go, swings up and hangs by his feet the other way about, then back.
          const a = bump(t, 1, 3.2, 5.6, 3.6);
          p().add('root', 0, 0, 180 * a);
          this.inverted = a > 0.001;
          for (const [arm, , side] of LIMBS) {
            p().add(arm, 5 * sin(t, 0.16, side * 0.2) * a, 0, side * (22 + 8 * sin(t, 0.2)) * a);
          }
          p().add('head', 0, 0, 8 * sin(t, 0.14) * a);
          this.felt = a > 0.5 ? 'happy' : null;
        },
      },
      hugArm: {
        weight: 0.9,
        length: [9, 9],
        when: still,
        pose: (t) => {
          // Wraps one arm round the other, hanging on tight, and nuzzles it.
          const k = bump(t, 0.5, 1.8, 4.6, 1.8);
          p().add('arm.L', 0, 0, -20 * k);
          p().add('arm.R', 0, 95 * k, -100 * k);
          p().add('fore.R', -30 * k);
          p().add('head', 0, 0, -14 * k + 3 * sin(t, 0.2) * k);
          this.felt = k > 0.4 ? 'love' : null;
        },
      },
      reachDown: {
        weight: 1.8,
        length: [9, 9],
        when: () => !this.walking && this.below !== null,
        pose: (t) => {
          // Reaches down toward a crewmate below with a long arm, fingers wiggling.
          const b = this.below;
          if (!b) return;
          const toward = b.dx > 0 ? -1 : 1;
          const near = clamp(Math.abs(b.dx) / (this.heightPx * 0.9), 0, 1);
          const k = bump(t, 0.6, 1.8, 4.6, 1.8);
          const arm = toward === 1 ? 'arm.L' : 'arm.R';
          p().add(arm, 0, 0, toward * (105 + 45 * (1 - near)) * k);
          p().add(arm.replace('arm', 'hand'), 30 * sin(t, 0.7) * k);
          p().add('root', 0, 0, toward * (10 + 12 * near) * k);
          p().add('head', 8 * k, 0, toward * -10 * k);
          this.lowerTo = 0.18 * k;
          this.felt = k > 0.4 ? 'happy' : null;
        },
      },
      drop: {
        weight: 0.9,
        length: [13, 13],
        when: still,
        pose: (t) => {
          // Lets go and drops a little lower on his tether, turning slowly to look about.
          const free = bump(t, 0.6, 1.4, 8.6, 1.6);
          this.lowerTo = bump(t, 1.4, 2.6, 5.4, 2.6);
          this.dangle('L', free, t);
          this.dangle('R', free, t, 0.4);
          for (const [, leg, side] of LIMBS)
            p().add(leg, 10 * sin(t, 0.11, side * 0.15) * free, 0, side * 4 * free);
          p().add('head', 4 * free);
          this.turn = 0.7 * Math.sin(t * 0.55) * this.lowerTo;
          this.felt = this.lowerTo > 0.5 ? (sin(t, 0.12) > 0.3 ? 'happy' : 'neutral') : null;
        },
      },

      // Reactions, a second late.
      wave: {
        weight: 0,
        length: [4, 5],
        face: 'happy',
        pose: (t) =>
          this.slowWave(t, Math.min(1, t / 1.2) * Math.min(1, (this.actLength - t) / 1.2)),
      },
      poked: { weight: 0, length: [4, 4.5] },
      dizzy: { weight: 0, length: [6, 6] },
    };
  }

  poke() {
    if (this.state !== 'here') return;
    const now = performance.now() / 1000;
    this.pokes = [...this.pokes.filter((at) => now - at < 3), now];
    if (this.pokes.length >= 3) {
      this.pokes = [];
      this.setAct('dizzy');
    } else if (this.act !== 'dizzy') this.setAct('poked');
  }

  protected setAct(name: string) {
    this.turn = 0;
    this.lowerTo = 0;
    this.inverted = false;
    this.dark = 0;
    this.boot = 0;
    this.soaking = 0;
    this.lively = 0;
    this.fired.clear();
    super.setAct(name);
  }

  protected idle(t: number) {
    const p = this.puppet;
    // Swaying from the line; the legs dangle after.
    p.add('root', 0, 0, 5 * sin(t, 0.09));
    p.add('head', 0, 0, 5 * sin(t, 0.06, 0.3));
    for (const [, leg, side] of LIMBS) p.add(leg, 4 * sin(t, 0.13, side * 0.2), 0, 3 * side);
    p.add('tail', 0, 12 * sin(t, 0.11, 0.4));
    // Shifts are direct: back to rest unless an act moves them.
    p.shift('body', 0, 0, 0);
    p.shift('root', 0, 0, 0);
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    // Who is on the floor below?
    this.below = null;
    let best = Infinity;
    for (const c of env.crew) {
      if (c === this || c.state !== 'here' || c.edge !== 'bottom' || c.free) continue;
      const dx = c.s - this.s;
      if (Math.abs(dx) < best && Math.abs(dx) < this.heightPx * 2.5) {
        best = Math.abs(dx);
        this.below = { c, dx };
      }
    }

    // Hand over hand along the line, his body trailing behind.
    const moving = Math.min(1, this.stride / (this.heightPx * 0.15));
    const reach = Math.sin(this.gait * 1.4);
    for (const [arm, , side] of LIMBS) p.add(arm, 0, 0, side * 16 * reach * moving);
    p.add('root', 0, 0, -Math.sign(this.pace) * 8 * moving);

    // A poke registers a second later: surprise, a swing, then a slow smile.
    const t = this.actT;
    if (this.act === 'poked') {
      if (t > 1 && t - dt <= 1) p.kick('root', 0, 0, (Math.random() < 0.5 ? -1 : 1) * 25);
    }
    // Poked too often, he turns slowly round on his arms.
    const k = this.act === 'dizzy' ? Math.min(1, t / this.actLength) : 0;
    const spin = this.act === 'dizzy' ? 2 * Math.PI * (k * k * (3 - 2 * k)) : this.turn;
    this.pivot.rotation.y = spin;

    // The mouse resting on him earns a wave, once he's noticed.
    this.hover = this.hovered ? this.hover + dt : 0;
    if (this.hover > 1.5 && this.act === 'idle') this.setAct('wave');

    if (this.felt) this.expression = this.felt;
    else if (this.act === 'poked')
      this.expression = t < 1 ? 'sleepy' : t < 2.2 ? 'surprised' : 'happy';
    else if (this.act === 'dizzy') this.expression = 'dizzy';
    else if (this.hovered) this.expression = 'happy';
    else this.expression = this.charge > 0.75 ? 'neutral' : 'sleepy';
    this.felt = null;

    // Down the tether, or back up it.
    this.lower.update(dt, this.lowerTo);
    this.h = this.lower.y * this.heightPx * 0.42;

    // The battery runs down while he's awake (faster on the move) and fills while he
    // naps or soaks up light; low, he naps more, and full, he wakes.
    const napping = this.act === 'nap';
    this.charge = clamp(
      this.charge + dt * (napping ? 0.06 : this.soaking * 0.03 || (this.walking ? -0.012 : -0.004)),
      0,
      1,
    );
    this.acts.nap.weight = this.charge < 0.3 ? 8 : 2;
    this.acts.reboot.weight = this.charge < 0.22 ? 5 : 0.4;
    if (napping && this.charge >= 1 && this.actT > 4) this.actLength = this.actT;

    // The ear lights: a slow heartbeat (quicker dancing, bright for a flash, dark in a brownout).
    this.flash = Math.max(0, this.flash - dt * 1.4);
    const beat = Math.max(0, Math.sin(env.time * (1.2 + 2.2 * this.lively))) ** 6;
    const warm =
      this.expression === 'happy' || this.expression === 'love' ? BEACON.happy! : BEACON.neutral!;
    const glow = clamp(0.6 * (1 - beat) * (1 - this.flash), 0, 1);
    colour.set(warm).lerp(DIM, glow);
    if (this.dark > 0.5) colour.copy(DIM).multiplyScalar(0.25);
    this.light.lerp(colour, Math.min(1, dt * 4));
    this.outfit.beacon(this.light);
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    // Swung up by his feet: keep the feet on the line as the body turns over.
    if (this.inverted) {
      const roll = Math.abs(p.current('root')[2]) / 180;
      p.shift('root', 0, HANG * smooth(clamp(roll, 0, 1)), 0);
    }
    // The tether: paid out as far as he drops, folded away to nothing on the line.
    const down = this.h / this.px;
    if (down > 0.004) p.stretch('cable', 1 + down / CABLE, [0, 1, 0], 1);
    else p.stretch('cable', 0.001, [0, 1, 0], 0.001);

    // The gauge: a bar lit for each quarter of charge. Charging, the next bar blinks;
    // nearly flat, the last one does. In a brownout it goes dark, and comes back bar by bar.
    const blink = Math.sin(env.time * 4) > 0 ? 1 : 0.12;
    const filling = Math.floor(this.charge * BARS);
    for (let i = 0; i < BARS; i++) {
      let level = this.charge * BARS - i > 0.5 ? 1 : 0.12;
      if (this.act === 'nap' && i === filling) level = blink;
      else if (this.act === 'solar' && this.soaking > 0.5 && i === filling) level = blink;
      else if (this.charge < 0.25 && i === 0) level = blink;
      if (this.act === 'reboot') {
        if (this.dark > 0.5) level = 0.02;
        else if (this.boot > 0) level = this.boot * (BARS + 1) > i + 0.5 ? level : 0.02;
      }
      if (this.flash > 0.5 && this.act === 'checkGauge') level = 1;
      this.outfit.dot(i, level);
    }
    // His face is drawn turned round, so his eyes look the other way round too.
    if (this.face) {
      this.face.look.x *= -1;
      this.face.look.y *= -1;
    }
  }
}
