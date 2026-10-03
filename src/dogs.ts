import { type Act, clamp, type Env } from './character';
import { sin } from './moves';
import { type Anatomy, type Feeling, type Mood } from './pet';
import { Kitty, pulse, ramp } from './kitties';

/**
 * What the three newer dogs (Chrome the poodle, Link the dachshund, Pip the puppy) share
 * with Byte: a dog's tail says how it feels by wagging, its ears are soft flaps on springy
 * joints, its jaw pants and yaps, and a wet nose goes down to sniff.
 *
 * They are built on the kittens' trick library (kitties.ts: a route to walk, a crewmate
 * to watch, a spin on the spot, the whole body rolled about its middle) and add the tricks
 * every dog knows: scratching, sniffing, digging, begging, a yawn, a howl, a shake-off,
 * a play bow, snapping at a fly that isn't there. Each dog picks its own list and adds
 * the ones only it does.
 */
const RAD = Math.PI / 180;

/** Every dog's moods: a wagging tail and ears, each dog a little different. */
export function dogMoods(tailUp = 0): Anatomy['moods'] {
  return {
    calm: { face: 'neutral', carriage: -10 + tailUp, wag: [14, 1.3], ears: 0, out: 6, swivel: 0.2 },
    curious: {
      face: 'neutral',
      carriage: 12 + tailUp,
      wag: [7, 2.8],
      ears: 8,
      out: 30,
      swivel: 0.4,
    },
    happy: {
      face: 'happy',
      carriage: -8 + tailUp,
      wag: [36, 3],
      ears: 0,
      out: 5,
      swivel: 0.2,
      pant: 0.6,
    },
    love: {
      face: 'love',
      carriage: -10 + tailUp,
      wag: [42, 4],
      wiggle: 1,
      pant: 1,
      ears: -10,
      out: 8,
      swivel: 0,
    },
    alarmed: { face: 'surprised', carriage: 25 + tailUp, ears: 10, out: 45, swivel: 0 },
    annoyed: { face: 'focused', carriage: 20 + tailUp, wag: [4, 5], ears: 0, out: 30, swivel: 0 },
    sad: { face: 'sad', carriage: -55, wag: [4, 0.6], ears: -25, out: 0, swivel: 0 },
    sleepy: { face: 'sleepy', carriage: -35, wag: [6, 0.5], ears: 0, out: 0, swivel: 0 },
    asleep: { face: 'asleep', carriage: -45, flicks: 0.2, ears: 0, out: 0, swivel: 0.2 },
  };
}

/** The acts that come with a mood, for every dog. */
export const DOG_ACT_MOODS = {
  love: 'love',
  startle: 'alarmed',
  dizzy: 'annoyed',
  scratch: 'happy',
  tailChase: 'happy',
  zoomies: 'happy',
  playBow: 'love',
  yip: 'alarmed',
  sniff: 'curious',
  watch: 'curious',
  tilt: 'curious',
  greet: 'love',
  beg: 'love',
  chaseFly: 'curious',
  dig: 'happy',
  pant: 'happy',
  shakeOff: 'happy',
  yawn: 'sleepy',
  stretch: 'sleepy',
  dozeOff: 'sleepy',
  nap: 'asleep',
} satisfies Record<string, Mood>;

export abstract class Hound extends Kitty {
  /** How wide the jaw is open, 0..1 (a trick sets it each frame). */
  protected mouth = 0;
  /** How much the ears flap with the head's turns and the walk: 1 for hanging ears, less for upright ones. */
  protected floppy = 1;
  private tilt = 1;
  private awayAt = -100;
  private wasHere = false;
  private headWas: [number, number] = [0, 0];

  protected idle(t: number) {
    this.mouth = 0;
    this.toyLift = 0;
    if (!this.toy.on) this.toyAhead = 0;
    super.idle(t);
  }

  protected feel(env: Env): Mood {
    // Sad for a while after the mouse leaves the window.
    const here = env.pointer.present;
    if (this.wasHere && !here) this.awayAt = env.time;
    this.wasHere = here;
    if (!here && env.time - this.awayAt < 8 && !(this.act in this.anatomy.actMoods)) return 'sad';
    const mood = super.feel(env);
    if (mood === 'curious' && this.mood !== 'curious') this.tilt = Math.random() < 0.5 ? -1 : 1;
    return mood;
  }

  protected express(dt: number, env: Env, f: Feeling) {
    const p = this.puppet;
    // Panting: mouth hanging open, a quick breath; tricks open it wider.
    if (p.has('jaw'))
      p.add(
        'jaw',
        Math.min(1, this.mouth) * 40 +
          (f.pant ?? 0) * (14 + 5 * sin(env.time, 3)) * (1 - this.mouth),
      );
    // The whole rear end wags along with the tail; the head stays on you.
    if (f.wiggle) {
      const w = f.wiggle * 9 * Math.sin(this.wagPhase);
      p.add('root', 0, w);
      p.add('head', 0, -w);
    }
    if (this.mood === 'curious') p.add('head', 0, 0, 11 * this.tilt);
    // Floppy ears: they lag behind the head's turns, and bounce when it trots.
    const [pitch, yaw] = p.current('head');
    const vy = (yaw - this.headWas[1]) / Math.max(dt, 1e-3);
    const vp = (pitch - this.headWas[0]) / Math.max(dt, 1e-3);
    this.headWas = [pitch, yaw];
    const swing = clamp(-vy * 0.08, -30, 30) * this.floppy;
    const bounce = this.walking ? 10 * Math.sin(this.gait * 2) * this.floppy : 0;
    const flap = clamp(vp * 0.06, -25, 25) * this.floppy + bounce;
    p.add('ear.L', flap, 0, swing);
    p.add('ear.R', flap, 0, swing);
  }

  /** Lying like a sphinx: front paws out in front, hind legs tucked, chin low. */
  protected lying(breath: number) {
    const p = this.puppet;
    p.add('leg.FL', -80);
    p.add('leg.FR', -80);
    p.add('leg.BL', -80);
    p.add('leg.BR', -80);
    p.add('head', 12 + 2 * breath);
  }

  /** Cheerful reaction to a poke; three pokes make it dizzy. */
  poke() {
    if (this.state !== 'here') return;
    if (this.poked() >= 3) this.setAct('dizzy');
    else if (this.act === 'nap' || this.act === 'dizzy' || this.posture === 'lie')
      this.setAct('startle');
    else this.setAct('love');
  }

  /** A hop once, `at` seconds into the trick. */
  protected leapOnce(t: number, at: number, power: number) {
    if (t > at && !this.run.done) {
      this.run.done = true;
      this.hop.kick(power * this.build.spring);
    }
  }

  /** Rearing up on the hind legs: the body tips back, the hind legs stay upright. */
  protected rearUp(k: number, front = -40) {
    const p = this.puppet;
    p.add('body', -62 * k);
    p.add('leg.BL', 62 * k);
    p.add('leg.BR', 62 * k);
    p.add('leg.FL', (front + 62) * k);
    p.add('leg.FR', (front + 62) * k);
    p.add('head', 50 * k);
  }

  /** A crewmate to do something with, picked at random. */
  protected pickMate(): boolean {
    const all = this.others();
    if (!all.length) return false;
    this.run.target = all[Math.floor(Math.random() * all.length)];
    return true;
  }

  /** How near it can stand to a crewmate without being in their room (px along the floor). */
  protected gap(o: { footprint: (f: Env['frame']) => { x: number } }) {
    return this.footprint(this.env.frame).x + o.footprint(this.env.frame).x + this.heightPx * 0.5;
  }

  /** The tricks every dog knows, by name (plus the kittens' generic ones from `tricks()`). */
  protected doggy(): Record<string, Act> {
    const p = () => this.puppet;
    const stand = () => this.standing;
    const still = () => this.still;
    return {
      love: { weight: 0, length: [2.5, 3.5], start: () => this.hop.kick(0.8) },
      // A hind leg up behind the ear, going like the clappers.
      scratch: {
        weight: 0,
        length: [2, 3],
        when: () => this.posture !== 'lie' && still(),
        start: () => (this.posture = 'sit'),
        pose: (t) => {
          p().add('leg.BL', -60 + 14 * sin(t, 6), 0, 35);
          p().add('head', 0, 15, -15);
        },
      },
      // Nose down along the floor, twitching, wandering a little way.
      sniff: {
        weight: 0,
        length: [3, 5],
        when: stand,
        start: () => {
          this.walkTo(this.s + this.roomy() * this.heightPx * (1 + Math.random()));
        },
        pose: (t) => {
          p().add('head', 34 + 3 * sin(t, 5));
          this.boost = 0.6;
        },
      },
      // Two silent yaps: jaw snaps open, head jerks up, a little hop.
      yip: {
        weight: 0,
        length: [1.3, 1.3],
        when: () => this.posture !== 'lie' && still(),
        start: () => (this.run.n = 0),
        pose: (t) => {
          const b = pulse(t, 0.1, 0.22) + pulse(t, 0.5, 0.22);
          this.mouth = b;
          p().add('head', -12 * b);
          const n = t > 0.5 ? 2 : t > 0.1 ? 1 : 0;
          for (; this.run.n < n; this.run.n++) this.hop.kick(0.6);
        },
      },
      // A play bow, bouncing on the front paws.
      playBow: {
        weight: 0,
        length: [2.5, 3.5],
        when: stand,
        start: () => (this.run.n = 0),
        pose: (t) => {
          this.bow();
          this.mouth = 0.3 + 0.2 * sin(t, 3);
          const n = Math.floor(t * 1.6 + 0.5);
          for (; this.run.n < n; this.run.n++) this.hop.kick(0.6);
        },
      },
      // Panting after a run: sitting, tongue out, a quick breath.
      pant: {
        weight: 0,
        length: [3, 5],
        when: still,
        start: () => (this.posture = 'sit'),
        pose: (t) => {
          this.mouth = 0.35 + 0.12 * sin(t, 3.5);
          p().add('body', 1.5 * sin(t, 3.5));
        },
      },
      // Sits up and begs: front paws up, head tilted.
      beg: {
        weight: 0,
        length: [3, 4],
        when: still,
        start: () => {
          this.posture = 'sit';
          this.run.dir = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          const k = ramp(t, 0, 0.5);
          p().add('leg.FL', -85 * k + 6 * sin(t, 3));
          p().add('leg.FR', -85 * k - 6 * sin(t, 3));
          p().add('head', -8 * k, 0, 12 * this.run.dir * k);
          this.pupils = 1;
          this.emote = 'love';
        },
      },
      // A big yawn: head back, jaw wide, a stretch of the chest.
      yawn: {
        weight: 0,
        length: [2.6, 2.6],
        when: still,
        pose: (t) => {
          const k = pulse(t, 0.2, 2.2);
          this.mouth = k;
          p().add('head', -24 * k);
          p().add('body', -5 * k);
          this.emote = k > 0.1 ? 'sleepy' : null;
        },
      },
      // Head back, a long howl at nothing in particular.
      howl: {
        weight: 0,
        length: [4, 4],
        when: still,
        start: () => (this.posture = 'sit'),
        pose: (t) => {
          const k = ramp(t, 0, 0.6) * (1 - ramp(t, 3.2, 3.9));
          p().add('head', -48 * k + 2 * sin(t, 4) * k);
          this.mouth = 0.55 * k * (0.8 + 0.2 * sin(t, 6));
          this.emote = 'happy';
          this.eyes = { x: 0, y: -1 };
        },
      },
      // Digs at the floor with the front paws, nose down, sending the dirt behind.
      dig: {
        weight: 0,
        length: [3, 4],
        when: stand,
        pose: (t) => {
          const k = ramp(t, 0, 0.4);
          p().add('body', 14 * k);
          p().add('head', 22 * k);
          const a = sin(t, 3.2);
          p().add('leg.FL', (-30 + 50 * a) * k);
          p().add('leg.FR', (-30 - 50 * a) * k);
          this.extraLift = -0.015 * k;
          this.emote = 'focused';
        },
      },
      // Shakes the whole body like a wet dog, ears flying.
      shakeOff: {
        weight: 0,
        length: [1.8, 1.8],
        when: stand,
        pose: (t) => {
          const k = ramp(t, 0, 0.15) * (1 - ramp(t, 1.3, 1.8));
          const w = sin(t, 7);
          p().add('root', 0, 18 * k * w);
          p().add('head', 0, -10 * k * w, 6 * k * sin(t, 7, 0.25));
          p().add('ear.L', 0, 0, -40 * k * w);
          p().add('ear.R', 0, 0, 40 * k * w);
          p().add('body', 0, 0, 5 * k * sin(t, 7, 0.25));
          this.emote = 'dizzy';
        },
      },
      // Goes over to a crewmate, stops at the edge of their room and sits, wagging.
      greet: {
        weight: 0,
        length: [6, 8],
        when: () => stand() && this.others().length > 0,
        start: () => {
          this.posture = 'stand';
          if (!this.pickMate()) return;
          this.run.phase = 0;
          this.run.dir = Math.random() < 0.5 ? -1 : 1;
        },
        pose: (t) => {
          const o = this.run.target;
          if (!o || o.state !== 'here') return this.endAct();
          this.lookAtMate(o);
          if (this.run.phase === 0) {
            this.walkTo(o.s - Math.sign(o.s - this.s) * this.gap(o), o.depth);
            this.boost = 1.3;
            if (t > 1 && this.stride < 4) {
              this.run.phase = 1;
              this.run.at = t;
              this.posture = 'sit';
            }
          } else {
            p().add('head', 0, 0, 10 * this.run.dir * ramp(t - this.run.at, 0, 0.4));
            this.pupils = 0.9;
            this.mouth = 0.25;
          }
        },
      },
      // Snaps at a fly only it can see: eyes and head follow it round, then a snap.
      chaseFly: {
        weight: 0,
        length: [4.5, 4.5],
        when: still,
        start: () => (this.run.n = 0),
        pose: (t) => {
          const x = 0.8 * sin(t, 0.5);
          const y = -0.5 + 0.4 * sin(t, 0.8, 0.25);
          this.eyes = { x, y };
          p().add('head', -10 + 14 * y, 30 * x);
          const snap = pulse(t, 1.6, 0.18) + pulse(t, 3.3, 0.18);
          this.mouth = snap;
          p().add('head', -8 * snap);
          this.pupils = 1;
          this.emote = t > 3.6 ? 'surprised' : 'focused';
          if (t > 3.5 && !this.run.done) {
            this.run.done = true;
            p().kick('head', 200);
          }
        },
      },
      // A single delighted spin on the spot.
      twirl: {
        weight: 0,
        length: [1.4, 1.4],
        when: stand,
        start: () => {
          this.spin = 1;
          this.hop.kick(0.8);
        },
        pose: () => {
          this.emote = 'happy';
          p().add('head', 6, -20);
        },
      },
      // Flat on the back, paws in the air, wriggling, and over the top again.
      rollOver: {
        weight: 0,
        length: [4.4, 4.4],
        when: stand,
        pose: (t) => {
          if (t < 0.5) {
            this.rollTarget = 6 * Math.sin(t * 12) * (t / 0.5);
          } else if (t < 2.9) {
            this.rollTarget = 180;
            this.emote = 'happy';
            this.mouth = 0.3;
            const a = sin(t, 3);
            p().add('leg.FL', -70 + 30 * a);
            p().add('leg.FR', -70 - 30 * a);
            p().add('leg.BL', -50 - 30 * a);
            p().add('leg.BR', -50 + 30 * a);
            this.trotting = false;
          } else {
            this.rollTarget = 360;
            this.emote = 'surprised';
          }
        },
      },
    };
  }

  /** The poses of a bone toy carried in the mouth (the puppy's). */
  protected keepInMouth(mouthReach: number, lift: number) {
    const yaw = this.puppet.current('root')[1];
    this.toy.s = this.s + Math.sin(yaw * RAD) * mouthReach * this.px;
    this.toy.v = 0;
    this.toyLift = lift;
    this.toyAhead = Math.cos(yaw * RAD) * mouthReach - 0.1;
  }
}
