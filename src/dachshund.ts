import type { Object3D } from 'three';
import { BEACON } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import type { Anatomy, Feeling } from './pet';
import { DOG_ACT_MOODS, dogMoods, Hound } from './dogs';
import { pulse, ramp } from './kitties';
import { Spring } from './spring';

/**
 * Link, the robot dachshund: a long low sausage of a dog in three rounded segments
 * joined by ribbed bellows, on four tiny legs, with long flat ears and a long thin tail.
 * The body is a chain of three bones, so he bends: he wiggles as he walks, snakes about
 * while he sniffs a trail, gets stuck halfway through turning round (he is too long for
 * it) and has to back and fill, lengthens himself in a stretch, burrows his nose under
 * the floor edge, slides on his belly and rolls along his own length like a log.
 *
 * A light bar runs along the top of each segment, and the lights chase down his back
 * while he walks, wiggles and rolls.
 */
export const DACHSHUND_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.3, 0.5],
    [0.7, 0.5],
  ],
  rx: 0.08,
  ry: 0.27,
  line: 0.035,
  mouth: null,
};

const DACHSHUND: Anatomy = {
  tail: ['tail.1', 'tail.2', 'tail.3'],
  tailAxis: [0, 0.35, -0.93],
  earsHang: true,
  moods: dogMoods(-4),
  actMoods: {
    ...DOG_ACT_MOODS,
    wiggleWalk: 'happy',
    threePointTurn: 'annoyed',
    burrow: 'curious',
    longStretch: 'sleepy',
    sniffTrail: 'curious',
    bellySlide: 'happy',
    sausageRoll: 'happy',
    checkTail: 'curious',
    periscope: 'curious',
    wagAll: 'love',
    busCorner: 'happy',
    inchWorm: 'curious',
    slinky: 'happy',
    armyCrawl: 'curious',
    stepOver: 'curious',
    rippleShake: 'happy',
    halfSit: 'curious',
    wobbleBeg: 'love',
    earFlapRun: 'happy',
    loadingBar: 'curious',
    draughtStopper: 'sleepy',
    peekRound: 'curious',
  },
  lying: 'calm',
  hover: 'happy',
  drop: { stand: 0, sit: -0.05, lie: -0.08 },
  sit: -18,
  turn: 62,
};

export class Dachshund extends Hound {
  protected readonly anatomy = DACHSHUND;
  protected readonly build = { middle: 0.2, spring: 0.6, speed: 1.3 };
  /** Extra sideways bend in the middle and chest joints (degrees), set by a trick. */
  private bend: [number, number] = [0, 0];
  /** How hard he wiggles (extra, 0..2), and the phase of the wave running down him. */
  private wig = 0;
  private wave = 0;
  /** How far he lengthens himself (metres), and the turn of a log roll (degrees). */
  private reach = 0;
  private barrel = new Spring(1.4, 0.7);
  private barrelTo = 0;
  private lights = new Spring(6, 0.8);
  /** The loading bar: how far the lights have filled from hips to chest (0..1), or null. */
  private bar: number | null = null;

  constructor(model: Object3D) {
    super(
      {
        name: 'Link',
        model: 'dachshund',
        metres: 0.44,
        width: 0.95,
        size: 0.85,
        feels: {
          default: { f: 2, zeta: 0.6 },
          body: { f: 1.8, zeta: 0.7 },
          mid: { f: 2.4, zeta: 0.5 },
          chest: { f: 2.4, zeta: 0.5 },
          head: { f: 1.8, zeta: 0.55, r: 0.3 },
          jaw: { f: 6, zeta: 0.5 },
          'ear.L': { f: 2.6, zeta: 0.2 },
          'ear.R': { f: 2.6, zeta: 0.2 },
          'tail.1': { f: 4, zeta: 0.4 },
          'tail.2': { f: 4.5, zeta: 0.3 },
          'tail.3': { f: 5, zeta: 0.3 },
        },
        face: DACHSHUND_FACE,
        eyes: 0.8,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.9 },
          { bone: 'chest', yaw: 0.2, pitch: 0 },
        ],
        reach: { yaw: 60, pitch: 30 },
        lag: 0.8,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 1.3,
      },
      model,
    );
    const all = { ...this.tricks(), ...this.doggy() };
    const mine: Record<string, number> = {
      scratch: 0.5,
      sniff: 0.8,
      yip: 0.5,
      pant: 0.4,
      yawn: 0.7,
      howl: 0.6,
      dig: 1,
      tilt: 0.9,
      watch: 0.9,
      greet: 0.8,
      chaseFly: 0.4,
      beg: 0.3,
      tailChase: 0.5,
      zoomies: 0.5,
      dozeOff: 0.6,
      backWall: 0.7,
      frontLip: 0.7,
      circle: 0.4,
      sneeze: 0.4,
      shakeOff: 0.5,
      bell: 0.4,
    };
    const common = this.commonActs();
    for (const k of ['idle', 'stroll', 'sit', 'nap', 'stand', 'stretch', 'startle'] as const) {
      this.acts[k] = common[k];
    }
    this.acts.lie = { ...common.lie, weight: 0.8 };
    for (const [name, weight] of Object.entries(mine)) this.acts[name] = { ...all[name], weight };
    this.acts.love = all.love;
    this.acts.dizzy = { ...all.dizzy, weight: 0 };
    Object.assign(this.acts, this.moves(), this.more());
  }

  private moves(): Record<string, Act> {
    const p = () => this.puppet;
    const stand = () => this.standing;
    return {
      // Walks with his whole length wiggling, ears and tail going, lights running down his back.
      wiggleWalk: {
        weight: 2,
        length: [4, 6],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.go([this.somewhere(), this.somewhere()]);
        },
        pose: (t) => {
          this.wig = 1.6;
          this.boost = 0.9;
          this.emote = 'happy';
          this.mouth = 0.3;
          if (this.atStop && t > 1) this.endAct();
        },
      },
      // Too long to turn round: he starts, bends into a U, jams, wriggles and backs out.
      threePointTurn: {
        weight: 1.6,
        length: [7.5, 7.5],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.run.dir = this.roomy();
          this.walkTo(this.s + this.run.dir * this.heightPx * 1.2, this.depth);
          this.run.phase = 0;
        },
        pose: (t) => {
          const r = this.run;
          if (t < 1.6) {
            // Setting off, then a sharp bend to one side.
            const k = ramp(t, 0.8, 1.6);
            this.bend = [-38 * k, -44 * k];
            this.boost = 0.7;
          } else if (t < 3.6) {
            // Stuck: nose against the wall of his own tail; legs scrabble, everything shakes.
            this.goal = null;
            this.bend = [-38, -44];
            const shake = sin(t, 3.5);
            this.bend = [-38 + 4 * shake, -44 - 5 * shake];
            const a = sin(t, 4);
            p().add('leg.FL', 12 * a);
            p().add('leg.BR', 12 * a);
            p().add('leg.FR', -12 * a);
            p().add('leg.BL', -12 * a);
            p().add('head', 4, 8 * r.dir * sin(t, 2));
            this.emote = 'cross';
            this.pupils = 0.7;
            this.wig = 0.5;
            if (t > 3.5 && !r.done) {
              r.done = true;
              this.hop.kick(0.8);
            }
          } else if (t < 5.4) {
            // Straightening out, a step back, and a bend the other way.
            const k = ramp(t, 3.6, 4.6);
            this.bend = [
              -38 * (1 - k) + 34 * k * (t < 4.6 ? 1 : 1 - ramp(t, 4.6, 5.4)),
              -44 * (1 - k) + 40 * k * (t < 4.6 ? 1 : 1 - ramp(t, 4.6, 5.4)),
            ];
            this.emote = 'focused';
            if (r.phase === 0) {
              r.phase = 1;
              this.walkTo(this.s - r.dir * this.heightPx * 0.4, this.depth);
            }
            this.boost = 0.6;
          } else {
            // Off the way he came, very pleased with himself.
            this.bend = [0, 0];
            if (r.phase === 1) {
              r.phase = 2;
              this.walkTo(this.s - r.dir * this.heightPx * 2, this.depth);
            }
            this.emote = 'happy';
            this.boost = 1.3;
            this.wig = 1;
          }
        },
      },
      // Walks to the front lip and pushes his nose under the edge, rump wagging.
      burrow: {
        weight: 1.1,
        length: [9, 9],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.walkTo(this.s + this.roomy() * this.heightPx * 0.8, 0);
          this.run.phase = 0;
        },
        pose: (t) => {
          const r = this.run;
          if (r.phase === 0 && this.atStop && t > 0.5) {
            r.phase = 1;
            r.at = t;
          }
          if (r.phase === 1) {
            const w = t - r.at;
            const k = ramp(w, 0, 0.6) * (1 - ramp(w, 4.6, 5.2));
            p().add('chest', 20 * k);
            p().add('head', 34 * k + 6 * sin(t, 3) * k);
            p().add('leg.FL', -55 * k + 15 * sin(t, 3) * k);
            p().add('leg.FR', -55 * k - 15 * sin(t, 3) * k);
            p().add('root', 0, 5 * sin(t, 5) * k);
            this.wig = 1.2 * k;
            this.extraLift = -0.02 * k;
            this.emote = 'focused';
            if (w > 5.2) {
              r.phase = 2;
              r.at = t;
              this.hop.kick(1);
              p().kick('head', -300);
            }
          }
          if (r.phase === 2) {
            // Something! He looks at the floor edge, then at us.
            this.emote = 'surprised';
            this.pupils = 1;
            p().add('head', 0, 20 * sin(t, 0.8));
            if (t - r.at > 1.6) this.endAct();
          }
        },
      },
      // The long stretch: front down, rump up, and the whole length of him drawn out.
      longStretch: {
        weight: 1.3,
        length: [3.6, 3.6],
        when: stand,
        pose: (t) => {
          const k = ramp(t, 0, 0.9) * (1 - ramp(t, 2.8, 3.5));
          this.bow(k);
          this.reach = 0.11 * k + 0.008 * sin(t, 3) * k;
          this.mouth = 0.5 * k * ramp(t, 0.6, 1.2) * (1 - ramp(t, 2.4, 2.8));
          this.emote = 'sleepy';
        },
      },
      // Nose down, following a scent that turns this way and that, and ends in a surprise.
      sniffTrail: {
        weight: 1.6,
        length: [8, 8],
        when: stand,
        start: () => {
          this.posture = 'stand';
          const dir = this.roomy();
          const s0 = this.s;
          this.go([
            { s: s0 + dir * this.heightPx * 0.8, depth: 0.15 },
            { s: s0 + dir * this.heightPx * 1.4, depth: 0.7 },
            { s: s0 + dir * this.heightPx * 2.2, depth: 0.3 },
            { s: s0 + dir * this.heightPx * 2.7, depth: 0.5 },
          ]);
        },
        pose: (t) => {
          this.boost = 0.6;
          this.wig = 0.8;
          p().add('head', 40 + 4 * sin(t, 5));
          p().add('chest', 6);
          this.emote = 'focused';
          if (this.atStop && t > 1.5) {
            this.emote = 'surprised';
            p().add('head', -40);
            this.endAct();
          }
        },
      },
      // Flat on his belly, legs splayed, sliding along the floor.
      bellySlide: {
        weight: 1,
        length: [3.2, 3.2],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.walkTo(this.s + this.roomy() * this.heightPx * 2.4, this.depth);
        },
        pose: (t) => {
          const k = ramp(t, 0, 0.3) * (1 - ramp(t, 2.7, 3.2));
          this.trotting = false;
          this.boost = 0.4 + 2 * k;
          this.extraLift = -0.1 * k;
          p().add('leg.FL', -80 * k);
          p().add('leg.FR', -80 * k);
          p().add('leg.BL', 78 * k);
          p().add('leg.BR', 78 * k);
          p().add('head', -14 * k);
          this.mouth = 0.4 * k;
          this.emote = 'happy';
          this.wig = 0.5 * k;
        },
      },
      // Rolls along his own length like a log, legs sticking out, and up again.
      sausageRoll: {
        weight: 1,
        length: [4.6, 4.6],
        when: stand,
        pose: (t) => {
          const r = this.run;
          if (t < 0.5) this.barrelTo = -8 * Math.sin(t * 12);
          else if (t < 3.4) {
            this.barrelTo = 360 * ramp(t, 0.6, 3.2);
            this.emote = 'happy';
            this.mouth = 0.3;
            const a = sin(t, 3);
            p().add('leg.FL', -30 * a);
            p().add('leg.BR', -30 * a);
            p().add('leg.FR', 30 * a);
            p().add('leg.BL', 30 * a);
            this.extraLift =
              0.13 * (1 - Math.abs(Math.cos(this.barrel.y * (Math.PI / 180)))) - 0.01;
          } else {
            this.barrelTo = 360;
            this.emote = 'dizzy';
            p().add('head', 0, 0, 10 * sin(t, 1.6));
            if (!r.done) {
              r.done = true;
              this.hop.kick(0.5);
            }
          }
        },
      },
      // Turns to see where his tail has got to: a very long way back.
      checkTail: {
        weight: 1.2,
        length: [5, 5],
        when: () => !this.walking,
        pose: (t) => {
          const k = ramp(t, 0, 0.9) * (1 - ramp(t, 3.7, 4.5));
          this.bend = [26 * k, 34 * k];
          p().add('head', 0, 48 * k);
          this.eyes = { x: 0.9 * k, y: 0.2 };
          this.emote = t > 2.4 && t < 3.6 ? 'surprised' : 'focused';
          this.pupils = 0.9;
          // The tail, discovered, gives a happy wag.
          if (t > 2.4 && t < 3.6) this.twitch(t, 30, 5);
        },
      },
      // Rears up on the hind legs, the whole long body stretched like a periscope.
      periscope: {
        weight: 1.1,
        length: [5.5, 5.5],
        when: stand,
        start: () => (this.posture = 'stand'),
        pose: (t) => {
          const k = ramp(t, 0, 0.9) * (1 - ramp(t, 4.4, 5));
          this.rearUp(k * 0.62, -30);
          p().add('mid', -18 * k);
          p().add('chest', -14 * k);
          p().add('head', 14 * k + 6 * sin(t, 0.6) * k, 34 * sin(t, 0.4) * k);
          this.wig = 0.4 * k;
          this.emote = 'surprised';
          this.pupils = 0.9;
          if (t > 4.8 && !this.run.done) {
            this.run.done = true;
            this.hop.kick(0.8);
          }
        },
      },
      // A wave runs down his whole length and out through his tail.
      wagAll: {
        weight: 1.3,
        length: [3, 4],
        when: () => !this.walking,
        pose: (t) => {
          this.wig = 2.2 * ramp(t, 0, 0.3);
          this.mouth = 0.3;
          this.emote = 'happy';
          p().add('head', 0, 0, 6 * sin(t, 1.3));
        },
      },
    };
  }

  private more(): Record<string, Act> {
    const p = () => this.puppet;
    const stand = () => this.standing;
    const still = () => this.still;
    return {
      // Round a corner like an articulated bus: the front swings in, the back cuts it fine.
      busCorner: {
        weight: 1,
        length: [6.5, 6.5],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.run.dir = this.roomy();
          const s0 = this.s;
          const d = this.depth < 0.5 ? 0.85 : 0.1;
          this.go([
            { s: s0 + this.run.dir * this.heightPx * 0.9, depth: this.depth },
            { s: s0 + this.run.dir * this.heightPx * 1.3, depth: d },
          ]);
        },
        pose: (t) => {
          const k = ramp(t, 0.7, 1.3) * (1 - ramp(t, 2.6, 3.4));
          this.bend = [-24 * k * this.run.dir, -34 * k * this.run.dir];
          this.boost = 0.9;
          this.wig = 0.3;
          this.emote = 'focused';
          if (t > 2 && this.atStop) this.endAct();
        },
      },
      // Front half reaches out, then the back half catches up with a hump: an inchworm.
      inchWorm: {
        weight: 1,
        length: [6, 6],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.walkTo(this.s + this.roomy() * this.heightPx * 1.1, this.depth);
        },
        pose: (t) => {
          const c = (t * 0.55) % 1;
          const out = c < 0.5 ? ramp(c, 0, 0.5) : 1 - ramp(c, 0.55, 0.95);
          this.reach = 0.085 * out;
          const hump = ramp(c, 0.55, 0.75) * (1 - ramp(c, 0.85, 1));
          p().add('mid', -14 * hump);
          p().add('chest', 8 * hump);
          p().add('body', 6 * hump);
          this.boost = 0.4;
          this.emote = 'focused';
          if (t > 4.5 && this.atStop) this.endAct();
        },
      },
      // A caterpillar undulation: the humps run down him as he goes.
      slinky: {
        weight: 0.9,
        length: [4, 5],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.walkTo(this.s + this.roomy() * this.heightPx * 1.6, this.depth);
        },
        pose: (t) => {
          p().add('body', 8 * sin(t, 1.6));
          p().add('mid', -16 * sin(t, 1.6, 0.25));
          p().add('chest', 12 * sin(t, 1.6, 0.5));
          p().add('head', -8 * sin(t, 1.6, 0.6));
          this.wig = 0.6;
          this.boost = 0.8;
          this.emote = 'happy';
          this.mouth = 0.25;
          if (t > 3 && this.atStop) this.endAct();
        },
      },
      // Very low and very flat: elbows out, paws pulling, hauling himself along.
      armyCrawl: {
        weight: 0.9,
        length: [5, 5],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.walkTo(this.s + this.roomy() * this.heightPx * 1.5, this.depth);
        },
        pose: (t) => {
          const k = ramp(t, 0, 0.5) * (1 - ramp(t, 4.3, 5));
          const a = sin(t, 1.8);
          this.trotting = false;
          this.extraLift = -0.085 * k;
          this.boost = 0.35;
          p().add('leg.FL', (-60 + 28 * a) * k, 0, -5 * k);
          p().add('leg.FR', (-60 - 28 * a) * k, 0, 5 * k);
          p().add('leg.BL', (55 - 25 * a) * k, 0, -10 * k);
          p().add('leg.BR', (55 + 25 * a) * k, 0, 10 * k);
          p().add('head', 10 * k);
          this.wig = 0.7 * k;
          this.emote = 'focused';
        },
      },
      // High-stepping over something on the floor that is not there: a small hop at the end.
      stepOver: {
        weight: 0.8,
        length: [6, 6],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.run.dir = this.roomy();
          this.walkTo(this.s + this.run.dir * this.heightPx * 0.7, this.depth);
          this.run.phase = 0;
        },
        pose: (t) => {
          const r = this.run;
          if (r.phase === 0) {
            this.boost = 0.8;
            if (this.atStop && t > 0.8) {
              r.phase = 1;
              r.at = t;
              this.walkTo(this.s + r.dir * this.heightPx * 0.45, this.depth);
            }
            return;
          }
          const w = t - r.at;
          this.boost = 0.35;
          p().add('leg.FL', -55 * pulse(w, 0.1, 0.5));
          p().add('leg.FR', -55 * pulse(w, 0.5, 0.5));
          p().add('leg.BL', -55 * pulse(w, 1, 0.5));
          p().add('leg.BR', -55 * pulse(w, 1.4, 0.5));
          p().add('head', 22 * (1 - ramp(w, 1.6, 2)));
          this.lookAtFloor(this.s + r.dir * this.heightPx * 0.3);
          this.emote = 'focused';
          if (w > 1.6 && !r.done) {
            r.done = true;
            this.hop.kick(0.7);
          }
          if (w > 2.4) {
            this.emote = 'happy';
            this.walkTo(this.s + r.dir * this.heightPx * 0.6, this.depth);
            if (w > 3.2) this.endAct();
          }
        },
      },
      // A wet-dog shake that runs down the three segments one after the other.
      rippleShake: {
        weight: 0.9,
        length: [2.4, 2.4],
        when: stand,
        pose: (t) => {
          const k = ramp(t, 0, 0.15) * (1 - ramp(t, 1.8, 2.4));
          p().add('head', 0, -16 * k * sin(t, 6.5, -0.1));
          p().add('chest', 0, 20 * k * sin(t, 6.5));
          p().add('mid', 0, -20 * k * sin(t, 6.5, 0.2));
          p().add('body', 0, 20 * k * sin(t, 6.5, 0.4));
          p().add('root', 0, 0, 3 * k * sin(t, 6.5, 0.2));
          p().add('ear.L', 0, 0, -50 * k * sin(t, 6.5));
          p().add('ear.R', 0, 0, 50 * k * sin(t, 6.5));
          this.twitch(t, 30 * k, 6.5);
          this.wig = 0.5 * k;
          this.emote = 'dizzy';
        },
      },
      // The back half sits down for a rest while the front half keeps on going.
      halfSit: {
        weight: 0.8,
        length: [5.5, 5.5],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.walkTo(this.s + this.roomy() * this.heightPx * 0.9, this.depth);
        },
        pose: (t) => {
          const k = ramp(t, 0.6, 1.3) * (1 - ramp(t, 4.4, 5.2));
          p().add('body', -24 * k);
          p().add('mid', 16 * k);
          p().add('leg.BL', -50 * k);
          p().add('leg.BR', -50 * k);
          this.extraLift = -0.03 * k;
          this.boost = 0.6;
          this.emote = t > 1.4 && t < 4.4 ? 'neutral' : 'happy';
          if (t > 1.6 && t < 4.2) this.twitch(t, 12, 3);
        },
      },
      // Up on his hind legs to beg, wobbling all along his length, and a small tumble down.
      wobbleBeg: {
        weight: 0.9,
        length: [5.2, 5.2],
        when: still,
        start: () => {
          this.posture = 'stand';
          this.run.dir = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          const k = ramp(t, 0, 0.9) * (1 - ramp(t, 4.2, 4.8));
          this.rearUp(k * 0.42, -70);
          p().add('root', 0, 0, (7 * sin(t, 1.3) + 4 * sin(t, 2.9)) * k);
          p().add('mid', 0, 8 * sin(t, 1.1, 0.2) * k);
          p().add('chest', 0, -9 * sin(t, 1.1, 0.4) * k);
          p().add('head', -6 * k, 0, 14 * this.run.dir * k);
          this.pupils = 1;
          this.emote = 'love';
          if (t > 4.5 && !this.run.done) {
            this.run.done = true;
            this.hop.kick(0.7);
            p().kick('head', 200);
          }
        },
      },
      // A dash with the ears streaming up and back, and every light racing.
      earFlapRun: {
        weight: 0.8,
        length: [4, 4],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.go([this.somewhere(), this.somewhere()]);
        },
        pose: (t) => {
          this.boost = 2;
          this.wig = 1;
          p().add('ear.L', 26 * sin(t, 4.5) - 18, 0, 22);
          p().add('ear.R', 26 * sin(t, 4.5) - 18, 0, -22);
          this.mouth = 0.5;
          this.emote = 'happy';
          if (t > 2 && this.atStop) this.endAct();
        },
      },
      // Sits and loads: the lights fill up from the hips to the chest, then flash: done.
      loadingBar: {
        weight: 0.7,
        length: [6, 6],
        when: still,
        start: () => {
          this.posture = 'sit';
          this.bar = 0;
        },
        pose: (t) => {
          const f = ramp(t, 0.6, 4);
          this.bar = t < 4.2 ? f * f * (3 - 2 * f) : Math.floor(t * 4) % 2 ? 1 : 0.2;
          this.emote = t < 4.2 ? 'focused' : 'happy';
          this.pupils = 0.6;
          p().add('head', 4 * sin(t, 0.7));
          if (t > 4.2 && !this.run.done) {
            this.run.done = true;
            this.hop.kick(0.6);
          }
        },
      },
      // Flat along the floor as a draught excluder, eyes half shut, tail giving the odd flick.
      draughtStopper: {
        weight: 0.8,
        length: [8, 8],
        when: stand,
        start: () => (this.posture = 'stand'),
        pose: (t) => {
          const k = ramp(t, 0, 0.7) * (1 - ramp(t, 7, 7.7));
          this.trotting = false;
          this.extraLift = -0.1 * k;
          p().add('leg.FL', -82 * k, 0, -8 * k);
          p().add('leg.FR', -82 * k, 0, 8 * k);
          p().add('leg.BL', 80 * k, 0, -8 * k);
          p().add('leg.BR', 80 * k, 0, 8 * k);
          p().add('head', 14 * k);
          this.emote = 'sleepy';
          if (t > 2 && t < 6.5) {
            this.twitch(t, 18 * pulse(t % 2.2, 0, 0.7), 5);
            p().add('ear.L', -6 * pulse(t % 3, 0.4, 0.5));
          }
        },
      },
      // At the back wall he pokes his head round the corner while the rest of him is still coming.
      peekRound: {
        weight: 0.8,
        length: [10, 10],
        when: stand,
        start: () => {
          this.posture = 'stand';
          this.run.dir = this.roomy();
          this.walkTo(this.s + this.run.dir * this.heightPx * 0.8, 0.95);
          this.run.phase = 0;
        },
        pose: (t) => {
          const r = this.run;
          if (r.phase === 0) {
            this.boost = 0.8;
            if (this.atStop && t > 0.5) {
              r.phase = 1;
              r.at = t;
            }
            return;
          }
          const w = t - r.at;
          const k = ramp(w, 0, 0.8) * (1 - ramp(w, 4.6, 5.4));
          this.bend = [10 * k * r.dir, 30 * k * r.dir];
          p().add('head', -6 * k, -38 * k * r.dir, -8 * k * r.dir);
          this.eyes = { x: -0.9 * r.dir * k, y: 0 };
          this.pupils = 0.9;
          this.emote = w > 2.2 && w < 3.6 ? 'surprised' : 'focused';
          this.twitch(t, 10 * k, 2.5);
          if (w > 5.4) this.endAct();
        },
      },
    };
  }

  protected idle(t: number) {
    this.bend = [0, 0];
    this.wig = 0;
    this.reach = 0;
    this.barrelTo = 0;
    this.bar = null;
    super.idle(t);
  }

  /** A play bow for a long dog: paws out in front, chest barely down (or it is in the floor). */
  protected bow(k = 1) {
    const p = this.puppet;
    p.add('body', 5 * k);
    p.add('leg.FL', -55 * k);
    p.add('leg.FR', -55 * k);
    p.add('leg.BL', -6 * k);
    p.add('leg.BR', -6 * k);
    p.add('head', -22 * k);
  }

  /** On his haunches: the chest rises, the long back bows to meet it. */
  protected sitting() {
    super.sitting();
    this.puppet.add('mid', 6);
    this.puppet.add('chest', 8);
  }

  protected express(dt: number, env: Env, f: Feeling) {
    super.express(dt, env, f);
    const p = this.puppet;
    // The wiggle: a wave of side bends down the three segments, on the walk and on demand.
    const moving = Math.min(1, this.stride / (this.heightPx * 0.8));
    const amp = 4 * moving + 6 * this.wig + (f.wiggle ?? 0) * 6 + (this.mood === 'happy' ? 1.5 : 0);
    this.wave += dt * 2 * Math.PI * (0.9 + 1.6 * moving + 1.1 * this.wig);
    const a = Math.sin(this.wave) * amp;
    const b = Math.sin(this.wave - 1) * amp * 1.3;
    p.add('body', 0, -a * 0.5);
    p.add('mid', 0, a + this.bend[0]);
    p.add('chest', 0, b + this.bend[1]);
    p.add('head', 0, -(a + b) * 0.4 - (this.bend[0] + this.bend[1]) * 0.4);
    // The tail follows the wave.
    if (amp > 2)
      DACHSHUND.tail.forEach((bone, i) =>
        p.add(bone, 0, 0, amp * 1.2 * Math.sin(this.wave - 1.7 - i * 0.6)),
      );
  }

  protected after(dt: number, env: Env) {
    super.after(dt, env);
    const p = this.puppet;
    // Drawn out: the chest and middle move forward, the bellows stretch.
    if (this.reach) {
      p.shift('mid', 0, 0, this.reach * 0.5);
      p.shift('chest', 0, 0, this.reach);
    }
    // The log roll turns the whole dog about his length; a finished roll is forgotten.
    if (this.barrelTo === 0 && Math.abs(this.barrel.y) > 180) {
      const k = Math.round(this.barrel.y / 360) * 360;
      this.barrel.snap(this.barrel.y - k);
    }
    const a = this.barrel.update(dt, this.barrelTo);
    if (Math.abs(a) > 0.5) p.turn('root', 0, 0, a);
    // Lights run down his back when he's moving or pleased.
    const busy = Math.min(
      1,
      this.stride / (this.heightPx * 0.8) +
        this.wig * 0.5 +
        (this.mood === 'happy' ? 0.5 : 0) +
        (this.mood === 'love' ? 0.8 : 0),
    );
    const on = this.lights.update(dt, busy);
    for (let i = 0; i < 3; i++) {
      const run = Math.max(0, Math.sin(this.wave - i * 1.1 + 0.6)) ** 2;
      let level = 0.12 + on * (0.9 * run) + (this.mood === 'sleepy' ? 0 : 0.05);
      // Loading bar: hips first (Dot2), then the middle, then the chest.
      if (this.bar !== null) level = 0.1 + 0.9 * clamp(this.bar * 3 - (2 - i), 0, 1);
      this.outfit?.dot(i, clamp(level, 0, 1));
    }
    this.outfit?.beacon(BEACON[this.expression] ?? '#f4f4f1');
  }
}
