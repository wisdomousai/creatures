import { Color, type Object3D } from 'three';
import { BEACON } from './bolt';
import { type Act, Character, clamp, type Env } from './character';
import type { Expression, FaceLayout } from './face';
import { sin } from './moves';
import { Spring } from './spring';

/**
 * Tick, the robot alarm clock. His face is his dial, showing the real time behind his
 * eyes, ringed by a bezel of minute studs, and he lives by it: he rocks with every real
 * second (two little lamps in his side caps blink tick, tock), rings on the hour (and
 * whenever he feels like it), counts the hour out in hops, and gets sleepy late at night.
 *
 * He shows how he feels with what a clock has: the hammer rattling his twin bells when
 * he's excited, a foot tapping when he's impatient, a metronome sway when he's content,
 * his hands whizzing round when he's dizzy, and his hammer knob, in the beacon's colour,
 * flashing while he rings and breathing while he dozes. He has a hatch on top with a
 * little lit cuckoo on a spring, and a winding key and two setting knobs on his back,
 * which he shows by turning his back on us to wind himself and set his own alarm. He
 * drops and dozes when snoozed, rings again, marches to the beat, swings his hammer like
 * a pendulum, chimes his bells one gentle ding at a time, checks the time on a crewmate,
 * leans on the back wall, peers over the front lip and dances on the beat of his seconds.
 */
export const CLOCK_FACE: FaceLayout = {
  width: 512,
  height: 512,
  eyes: [
    [0.37, 0.42],
    [0.63, 0.42],
  ],
  rx: 0.055,
  ry: 0.1,
  line: 0.028,
  mouth: [0.5, 0.66],
  kind: 'dial',
};

const LEGS = [
  ['leg.L', 1],
  ['leg.R', -1],
] as const;
const BELLS = [
  ['bell.L', 1],
  ['bell.R', -1],
] as const;
const colour = new Color();

/** Late at night, when a clock ought to be asleep. */
const night = () => {
  const h = new Date().getHours();
  return h >= 22 || h < 7;
};

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

export class Clock extends Character {
  static readonly terms =
    'time bells ring chime red coral white black dial hands tick tock hour cuckoo hammer winding key snooze wake sleepy march';

  private hop = new Spring(3, 0.3);
  private crouch = new Spring(2, 0.7);
  private lid = new Spring(5, 0.6);
  private pop = new Spring(6, 0.3);
  private second = 0;
  private tock = 1;
  private strikes = 0;
  private rungHour = -1;
  private pokes: number[] = [];
  private light = new Color(BEACON.neutral);
  private env: Env | null = null;
  private lamps = [0, 0];
  private keyAngle = 0;
  private spinAngle = 0;
  private poked = false;
  private dir = 1;
  private did = 0;
  private stage = 0;
  private lastStep = -1;
  private wasHovered = false;
  private lead = 0;
  private rang = false;
  // Per-frame requests from acts, cleared in idle().
  private lidReq = 0;
  private popReq = 0;
  private nod = 0;
  private keyReq: number | null = null;
  private turnReq = 0;
  private handsRate = 0;
  private sink = 0;
  private stand = 0;
  private quiet = false;
  private marchAmt = 0;
  private dozing = false;
  private actSpeed = 0.7;
  private actExpr: Expression | null = null;
  private lampMode: 'tick' | 'flash' | 'off' | 'swing' = 'tick';
  private lampSwing = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Tick',
        model: 'clock',
        metres: 0.5,
        width: 0.45,
        size: 0.75,
        feels: {
          default: { f: 2.5, zeta: 0.5 },
          root: { f: 3, zeta: 0.6 },
          body: { f: 2.5, zeta: 0.4 },
          hammer: { f: 8, zeta: 0.3 },
          // Bells are springy: a strike leaves them shaking.
          'bell.L': { f: 9, zeta: 0.12 },
          'bell.R': { f: 9, zeta: 0.12 },
          'leg.L': { f: 5, zeta: 0.5 },
          'leg.R': { f: 5, zeta: 0.5 },
          'knob.L': { f: 6, zeta: 0.6 },
          'knob.R': { f: 6, zeta: 0.6 },
          bird: { f: 7, zeta: 0.35 },
          lid: { f: 7, zeta: 0.4 },
        },
        face: CLOCK_FACE,
        eyes: 0.54,
        gaze: [{ bone: 'body', yaw: 0.6, pitch: 0.4 }],
        reach: { yaw: 40, pitch: 20 },
        lag: 1,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [40, 90],
        speed: 0.7,
        turn: 25,
      },
      model,
    );
    this.acts = {
      ...this.basics(),
      ...this.walks(),
      ...this.gadgets(),
      ...this.rhythm(),
      ...this.rests(),
      ...this.social(),
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

  private toward(m: Character) {
    return Math.sign(m.s - this.s) || 1;
  }

  /** Walk `heights` of his own height along the floor, mostly the way with more room. */
  private amble(heights: number, depth?: number, way?: number) {
    const w = way ?? (Math.random() < 0.5 ? -1 : 1);
    this.walkTo(this.s + w * this.heightPx * heights, depth);
  }

  /** Seconds since he got where he was going (or -1 while he is still on his way). */
  private settled(t: number, at = true) {
    if (at && !this.walking && t > 0.3 && !this.did) this.did = t;
    return this.did ? t - this.did : -1;
  }

  private spread(amount: number) {
    for (const [bell, side] of BELLS) this.puppet.add(bell, 0, 0, -side * amount);
  }

  private tingle(strength = 1) {
    for (const [bell, side] of BELLS)
      this.puppet.kick(bell, 60 * (Math.random() - 0.5), 0, side * 120 * strength);
  }

  // ---------- Acts ----------

  private basics(): Record<string, Act> {
    return {
      idle: { weight: 3, length: [4, 7] },
      ring: {
        weight: 0.6,
        length: [2.5, 3.5],
        when: () => this.still() && !night(),
        start: () => {
          this.strikes = 0;
          // Rattling across the shelf the way alarm clocks do.
          const way = Math.random() < 0.5 ? -1 : 1;
          this.walkTo(this.s + way * this.heightPx * 0.25);
        },
        pose: (t) => this.ring(t, 1),
      },
      sway: {
        weight: 1.2,
        length: [4, 6],
        face: 'happy',
        when: this.still,
        pose: () => {
          // A metronome, at the ends of each swing on the second.
          const beat = Math.cos(Math.PI * (Date.now() / 1000));
          this.puppet.add('body', 0, 0, 9 * beat);
          for (const [leg, side] of LEGS)
            this.puppet.add(leg, 0, 0, side * 4 * Math.max(0, side * beat));
        },
      },
      tap: {
        weight: 0.8,
        length: [3, 4],
        face: 'cross',
        when: this.still,
        pose: (t) => {
          // Tapping a foot: well, come on then.
          const up = Math.max(0, sin(t, 2.5)) ** 2;
          this.puppet.add('leg.R', -12 * up, 0, -18 * up);
          this.puppet.add('body', 0, 0, 3 + 2 * up);
        },
      },
      pendulum: {
        weight: 0.9,
        length: [5, 7],
        face: 'focused',
        when: this.still,
        pose: (t) => {
          // His hammer swings like a grandfather clock's pendulum, slow and wide; the
          // lamps follow it from side to side and the bells nod at each end.
          const sw = Math.sin(2 * Math.PI * 0.5 * t);
          const k = ease(t, 0, 0.8);
          this.puppet.add('hammer', 0, 0, 22 * sw * k);
          this.puppet.add('body', 0, 0, -3 * sw * k);
          this.lampMode = 'swing';
          this.lampSwing = sw;
          if (Math.cos(2 * Math.PI * 0.5 * t) * Math.cos(2 * Math.PI * 0.5 * (t - 0.05)) < 0)
            this.tingle(0.25);
        },
      },
      spinHands: {
        weight: 0.9,
        length: [4, 5],
        when: this.still,
        pose: (t) => {
          // Showing off: his hands whizz round (and he trembles at the speed of it), then
          // wind down and find the right time again.
          const k = span(t, 0.3, 1.0, 2.6, 3.4);
          this.handsRate = 1100 * k;
          this.puppet.add('body', 0, 0, 3 * k * Math.sin(t * 30));
          this.puppet.add('hammer', 0, 0, 14 * k * Math.sin(t * 25));
          if (k > 0.5) this.tingle(0.15);
          this.actExpr = k > 0.3 ? 'surprised' : t > 3.4 ? 'happy' : 'neutral';
        },
      },
    };
  }

  private walks(): Record<string, Act> {
    return {
      stroll: {
        weight: 1,
        length: [3, 5],
        when: this.still,
        start: () => this.amble(1 + Math.random()),
      },
      march: {
        weight: 1,
        length: [4, 6],
        face: 'focused',
        when: this.still,
        start: () => this.amble(3 + Math.random() * 2),
        pose: () => {
          // Tick, tock, tick, tock: stiff legs, a tilt with every step and a tick of the
          // hammer on each beat.
          this.marchAmt = 1;
          this.actSpeed = 0.6;
          const step = Math.sin(this.gait * 1.6);
          if (this.stride > 2 && Math.sign(step) !== this.dir) {
            this.dir = Math.sign(step);
            this.puppet.kick('hammer', 0, 0, this.dir * 90);
            this.tingle(0.4);
          }
        },
      },
      lap: {
        weight: 0.7,
        length: [12, 14],
        face: 'happy',
        when: this.still,
        start: () => {
          this.stage = 0;
          this.dir = Math.random() < 0.5 ? -1 : 1;
          this.did = this.s;
        },
        pose: (t) => {
          // A lap round the box, like the hand round the dial: along the front, back into
          // the box, along the back and out again.
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
          this.marchAmt = 0.5;
          this.actSpeed = 0.9;
        },
      },
      sneak: {
        weight: 0.7,
        length: [5, 7],
        face: 'focused',
        when: this.still,
        start: () => this.amble(2.5 + Math.random()),
        pose: () => {
          // On tiptoe, bells held still, so as not to wake the house.
          this.quiet = true;
          this.actSpeed = 0.35;
          this.marchAmt = 0.6;
          this.puppet.add('body', 10);
          this.spread(-8);
          this.lampMode = 'off';
        },
      },
      peekFront: {
        weight: 0.8,
        length: [9, 11],
        when: this.still,
        start: () => {
          this.did = 0;
          this.stage = 0;
          this.amble(1.5, 0);
        },
        pose: (t) => {
          // Down at the front lip, leaning right over it, looking at what's below.
          const s = this.settled(t, this.depth < 0.06);
          const k = s < 0 ? 0 : span(s, 0, 0.7, 6, 6.8);
          this.puppet.add('body', 20 * k, 0, 4 * k * Math.sin(s * 1.6));
          for (const [leg] of LEGS) this.puppet.add(leg, 7 * k);
          this.puppet.add('hammer', 12 * k);
          this.spread(-8 * k);
          if (s > 6.8 && !this.stage) {
            this.stage = 1;
            this.walkTo(this.s, 0.25);
          }
          this.actExpr = k > 0.3 ? 'focused' : null;
        },
      },
      leanBack: {
        weight: 0.8,
        length: [10, 12],
        when: this.still,
        start: () => {
          this.did = 0;
          this.stage = 0;
          this.amble(1.5, 0.96);
        },
        pose: (t) => {
          // Back at the back wall, leaning on it with his feet out in front, bored.
          const s = this.settled(t, this.depth > 0.85);
          const k = s < 0 ? 0 : span(s, 0, 0.8, 6.5, 7.5);
          this.puppet.add('body', -14 * k);
          for (const [leg] of LEGS) this.puppet.add(leg, -13 * k);
          this.puppet.add('hammer', 0, 0, 10 * k);
          this.spread(-6 * k);
          this.puppet.add('leg.R', -10 * k * Math.max(0, sin(s, 0.7)) ** 2);
          if (s > 7.5 && !this.stage) {
            this.stage = 1;
            this.walkTo(this.s, 0.25);
          }
          this.actExpr = k > 0.3 ? 'sleepy' : null;
        },
      },
    };
  }

  private gadgets(): Record<string, Act> {
    return {
      cuckoo: {
        weight: 1,
        length: [6, 6.5],
        when: this.still,
        pose: (t) => {
          // The hatch on top opens and his lit cuckoo springs out three times.
          const open = span(t, 0.3, 0.9, 4.7, 5.3);
          this.lidReq = open;
          // The hammer leans out of the cuckoo's way.
          this.puppet.add('hammer', 0, 0, 30 * open);
          let up = 0;
          for (const at of [1.1, 2.2, 3.3]) {
            const p = pulse(t, at, 0.8);
            up = Math.max(up, p > 0 ? 1 : 0);
            if (this.stage < [1.1, 2.2, 3.3].indexOf(at) + 1 && t > at) {
              this.stage++;
              this.puppet.kick('hammer', 0, 0, 120);
              this.tingle(0.5);
              this.hop.kick(0.5);
            }
          }
          this.popReq = up;
          this.nod = Math.max(pulse(t, 1.35, 0.3), pulse(t, 2.45, 0.3), pulse(t, 3.55, 0.3));
          this.actExpr = up ? 'surprised' : 'happy';
        },
        start: () => (this.stage = 0),
      },
      wind: {
        weight: 0.9,
        length: [6.5, 7],
        when: this.still,
        start: () => (this.dir = Math.random() < 0.5 ? -1 : 1),
        pose: (t) => {
          // Turns his back on us and winds himself up by the key, jerking with each turn.
          const away = span(t, 0.2, 1.4, 5.0, 6.2);
          this.turnReq = this.dir * 170 * away;
          const wind = span(t, 1.6, 2.0, 4.2, 4.5);
          this.keyReq = 420 * wind - 700 * pulse(t, 4.5, 0.4);
          this.puppet.add('body', 0, 0, 4 * wind * Math.sin(t * 7));
          this.puppet.add('hammer', 0, 0, 6 * wind * Math.sin(t * 7 + 1));
          this.actExpr = t > 5.6 ? 'happy' : null;
        },
      },
      fiddle: {
        weight: 0.8,
        length: [7, 7.5],
        when: this.still,
        start: () => (this.dir = Math.random() < 0.5 ? -1 : 1),
        pose: (t) => {
          // Turns round again, to set his own alarm on the two knobs on his back.
          const away = span(t, 0.2, 1.4, 5.8, 7);
          this.turnReq = this.dir * 165 * away;
          const k = ease(t, 1.5, 1.8) * (1 - ease(t, 5.4, 5.7));
          this.puppet.add(
            'knob.L',
            0,
            0,
            260 * k * pulse(t, 1.8, 1.4) + 120 * k * ease(t, 3.4, 3.8),
          );
          this.puppet.add('knob.R', 0, 0, -300 * k * ease(t, 2.4, 2.9) + 100 * pulse(t, 4.2, 0.8));
          // Set: a single small ding.
          if (t > 5.5 && !this.stage) {
            this.stage = 1;
            this.puppet.kick('hammer', 0, 0, 200);
            this.tingle(0.8);
          }
          this.actExpr = t > 6.4 ? 'wink' : null;
        },
      },
      chime: {
        weight: 0.9,
        length: [5.5, 6],
        when: this.still,
        pose: (t) => {
          // One gentle ding at a time: the hammer taps a bell, and he listens.
          const hits = [0.9, 2.5, 4.1];
          hits.forEach((at, i) => {
            const side = i % 2 === 0 ? 1 : -1;
            this.puppet.add('hammer', 0, 0, side * 27 * pulse(t, at - 0.3, 0.5));
            if (t > at && this.stage <= i) {
              this.stage = i + 1;
              this.puppet.kick(side > 0 ? 'bell.R' : 'bell.L', 0, 0, side * 160);
              this.puppet.kick('body', 0, 0, -side * 20);
            }
          });
          this.puppet.add('body', 2 * sin(t, 0.4), 0, 3 * sin(t, 0.3));
          this.actExpr = t > 0.9 ? 'happy' : 'neutral';
        },
        start: () => (this.stage = 0),
      },
    };
  }

  private rhythm(): Record<string, Act> {
    return {
      beatDance: {
        weight: 1,
        length: [7, 9],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // A little dance on the beat of his own seconds: a hop, a lean, the feet
          // taking turns, the bells clinking on every tick.
          const k = ease(t, 0, 0.5) * (1 - ease(t, this.actLength - 0.5, this.actLength));
          const phase = (Date.now() / 1000) % 1;
          this.stand = 0.02 * Math.abs(Math.sin(Math.PI * phase)) * k;
          const lean = this.tock * 11 * k * Math.sin(Math.PI * phase);
          this.puppet.add('body', 0, 0, lean);
          for (const [leg, side] of LEGS)
            this.puppet.add(
              leg,
              20 * k * Math.max(0, Math.sin(Math.PI * phase)) * (this.tock === side ? 1 : 0),
            );
          this.puppet.add('hammer', 0, 0, -this.tock * 18 * k);
        },
      },
      twirl: {
        weight: 0.8,
        length: [2.6, 3],
        face: 'happy',
        when: this.still,
        start: () => {
          this.dir = Math.random() < 0.5 ? -1 : 1;
          this.hop.kick(1.1);
          this.tingle(0.8);
        },
        pose: (t) => {
          // A pirouette on his toes, once or twice round, and a little bow.
          this.spinAngle = this.dir * 720 * ease(t, 0.3, 2.0);
          this.spread(15 * pulse(t, 0.3, 1.7));
          this.puppet.add('body', 10 * pulse(t, 2.0, 0.6));
        },
      },
      jingle: {
        weight: 1,
        length: [3, 4],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // A happy shimmy that jingles both bells.
          const k = ease(t, 0, 0.3) * (1 - ease(t, this.actLength - 0.4, this.actLength));
          const w = sin(t, 3.5);
          this.puppet.add('body', 0, 0, 8 * w * k);
          for (const [leg, side] of LEGS) this.puppet.add(leg, 0, 0, side * 6 * w * k);
          if (Math.sin(2 * Math.PI * 3.5 * t) * Math.sin(2 * Math.PI * 3.5 * (t - 0.03)) < 0)
            this.tingle(0.6 * k);
        },
      },
      countdown: {
        weight: 0.8,
        length: [4.2, 4.6],
        when: this.still,
        start: () => (this.rang = false),
        pose: (t) => {
          // Three dips like three ticks of a countdown, then up in the air with an alarm.
          this.sink = -0.035 * Math.max(pulse(t, 0.3, 0.5), pulse(t, 1.1, 0.5), pulse(t, 1.9, 0.5));
          this.puppet.add(
            'body',
            8 * Math.max(pulse(t, 0.3, 0.5), pulse(t, 1.1, 0.5), pulse(t, 1.9, 0.5)),
          );
          if (t > 2.8 && !this.rang) {
            this.rang = true;
            this.strikes = 0;
            this.hop.kick(2.0);
          }
          if (this.rang) this.ring(t - 2.8, 0.9);
          this.actExpr = t < 2.8 ? 'focused' : 'surprised';
          this.lampMode = t < 2.8 ? 'off' : 'flash';
        },
      },
      hourHop: {
        weight: 0.7,
        length: [4, 8],
        face: 'happy',
        when: this.still,
        start: () => {
          // He counts the hour out in hops.
          this.stage = new Date().getHours() % 12 || 12;
          this.lastStep = 0;
          this.actLength = 0.9 + this.stage * 0.55 + 0.8;
        },
        pose: (t) => {
          const k = Math.floor((t - 0.8) / 0.55);
          if (t > 0.8 && k >= this.lastStep && k < this.stage) {
            this.lastStep = k + 1;
            this.hop.kick(1.2);
            this.tingle(0.7);
            this.puppet.kick('hammer', 0, 0, this.tock * 80);
          }
        },
      },
      hiccup: {
        weight: 0.6,
        length: [3.6, 4.4],
        face: 'surprised',
        when: this.still,
        start: () => (this.stage = 0),
        pose: (t) => {
          // His tick skips: a jolt, a jingle and a pause, over and over.
          const at = [0.6, 1.2, 2.3, 2.6, 3.4];
          if (this.stage < at.length && t > at[this.stage]) {
            this.stage++;
            this.hop.kick(0.7);
            this.puppet.kick('body', -40, 0, 30 * (this.stage % 2 ? 1 : -1));
            this.puppet.kick('hammer', 0, 0, 160);
            this.tingle(0.6);
          }
          this.lampMode = 'off';
        },
      },
    };
  }

  private rests(): Record<string, Act> {
    return {
      nap: {
        weight: 0.8,
        length: [8, 14],
        face: 'asleep',
        when: this.still,
        pose: () => {
          this.puppet.add('hammer', 0, 0, 10);
          this.spread(-6);
        },
      },
      snooze: {
        weight: 0.5,
        length: [11, 12],
        when: () => this.still() && !night(),
        start: () => {
          // Rings, drops and dozes, and rings again. Poked while ringing, he starts at the drop.
          this.lead = this.poked ? 0 : 1.6;
          this.poked = false;
          this.rang = false;
          this.strikes = 0;
          this.actLength = this.lead + 4.6 + 2.2;
        },
        pose: (t) => {
          const drop = this.lead;
          const again = drop + 4.6;
          if (t < drop) {
            this.ring(t, 0.8);
            this.actExpr = 'surprised';
          } else if (t < again) {
            const k = ease(t, drop, drop + 0.5);
            this.sink = -0.03 * k;
            this.puppet.add('body', 14 * k);
            this.puppet.add('hammer', 0, 0, 12 * k);
            this.spread(-8 * k);
            this.dozing = t > drop + 0.8;
            this.actExpr = t < drop + 1 ? 'sleepy' : 'asleep';
          } else {
            if (!this.rang) {
              this.rang = true;
              this.strikes = 0;
              this.hop.kick(0.8);
            }
            this.ring(t - again, 1);
            this.actExpr = t - again < 1.6 ? 'surprised' : 'sleepy';
          }
        },
      },
      yawn: {
        weight: 1,
        length: [4.5, 5],
        when: this.still,
        pose: (t) => {
          // A great yawn: back arched, bells spread wide, hammer drooping; then a shake.
          const k = span(t, 0.2, 1.4, 2.6, 3.4);
          this.puppet.add('body', -13 * k);
          this.spread(24 * k);
          this.puppet.add('hammer', 0, 0, 14 * k);
          this.stand = 0.008 * k;
          this.actExpr = k > 0.5 ? 'surprised' : t > 3.4 ? 'neutral' : 'sleepy';
          this.puppet.add('body', 0, 0, 7 * pulse(t, 3.5, 0.3) * Math.sin(t * 40));
        },
      },
      stretch: {
        weight: 1,
        length: [4, 4.5],
        when: this.still,
        pose: (t) => {
          // Up on his toes with his back arched and both bells stretched out, then a
          // wobbly release.
          const k = span(t, 0.2, 1.2, 2.4, 2.8);
          this.stand = 0.014 * k;
          this.puppet.add('body', -8 * k);
          this.spread(32 * k);
          this.puppet.add('hammer', -14 * k);
          for (const [leg] of LEGS) this.puppet.add(leg, -6 * k);
          if (t > 2.4 && this.stage === 0) {
            this.stage = 1;
            this.tingle(0.8);
          }
          this.actExpr = k > 0.5 ? 'wink' : t > 2.8 ? 'happy' : 'sleepy';
        },
        start: () => (this.stage = 0),
      },
    };
  }

  private social(): Record<string, Act> {
    const company = () => this.still() && this.mates().length > 0;
    return {
      watch: {
        weight: 1,
        length: [4.5, 6],
        face: 'focused',
        when: company,
        start: () => (this.dir = Math.random() < 0.5 ? -1 : 1),
        pose: (t) => {
          // Turns to a crewmate and watches, tilting, a tick to every second.
          const m = this.mates()[0];
          if (!m) return;
          const k = ease(t, 0, 0.6) * (1 - ease(t, this.actLength - 0.6, this.actLength));
          this.puppet.add('root', 0, this.toward(m) * 42 * k, 0);
          this.puppet.add('body', 3 * k, 0, this.dir * 10 * k * Math.sin(t * 1.8));
        },
      },
      checkTime: {
        weight: 1.1,
        length: [10, 12],
        when: company,
        start: () => {
          // Trots over to a crewmate to check his own time against theirs.
          this.did = 0;
          this.stage = Math.random() < 0.6 ? 1 : 0;
          const m = this.mates()[0];
          if (!m) return;
          this.dir = this.toward(m);
          this.walkTo(m.s - this.dir * this.heightPx * 1.0, m.depth);
        },
        pose: (t) => {
          const m = this.mates()[0];
          this.actSpeed = 0.9;
          const s = this.settled(t);
          if (s < 0 || !m) return;
          const k = span(s, 0, 0.6, 5.8, 6.4);
          const p = this.puppet;
          p.add('root', 0, this.toward(m) * 40 * k, 0);
          p.add('body', 7 * k, 0, this.toward(m) * 4 * k);
          // His hands race to compare with theirs.
          this.handsRate = 260 * pulse(s, 1.0, 1.4);
          if (this.stage) {
            const nodding = pulse(s, 3.2, 0.45) + pulse(s, 3.8, 0.45);
            p.add('body', 12 * nodding);
            this.actExpr = s > 3 ? 'happy' : 'focused';
          } else {
            p.add('body', 0, 0, 12 * Math.sin(s * 9) * span(s, 3.2, 3.4, 4.6, 5));
            p.add('leg.R', -12 * Math.max(0, sin(s, 2.5)) ** 2 * ease(s, 4.4, 4.6));
            this.actExpr = s > 3 ? 'cross' : 'focused';
          }
        },
      },
    };
  }

  private reactions(): Record<string, Act> {
    return {
      poked: {
        weight: 0,
        length: [1.2, 1.2],
        face: 'surprised',
        start: () => {
          this.strikes = 0;
          this.hop.kick(0.9);
        },
        pose: (t) => t < 0.7 && this.ring(t, 0.6),
      },
      dizzy: {
        weight: 0,
        length: [2.5, 3],
        face: 'dizzy',
        pose: (t) => {
          this.puppet.add('body', 8 * Math.cos(t * 7), 0, 8 * Math.sin(t * 7));
          this.puppet.add('hammer', 0, 0, 25 * Math.sin(t * 7));
          this.handsRate = 600 * Math.min(1, t);
        },
      },
    };
  }

  /** The alarm: the hammer flying between the bells, each strike setting one shaking. */
  private ring(t: number, strength: number) {
    const p = this.puppet;
    p.add('hammer', 0, 0, 28 * strength * Math.sin(t * 2 * Math.PI * 10));
    for (; this.strikes < Math.floor(t * 20); this.strikes++) {
      const left = this.strikes % 2 === 0;
      p.kick(
        left ? 'bell.L' : 'bell.R',
        120 * (Math.random() - 0.5),
        0,
        (left ? 1 : -1) * 260 * strength,
      );
    }
    p.add('body', 2 * strength * sin(t, 13), 0, 4 * strength * sin(t, 11));
    p.shift('root', 0, 0.005 * strength * Math.abs(sin(t, 9)), 0);
    this.lampMode = 'flash';
  }

  poke() {
    if (this.state !== 'here') return;
    // The snooze button.
    if (this.act === 'ring') {
      this.poked = true;
      return this.setAct('snooze');
    }
    const now = performance.now() / 1000;
    this.pokes = [...this.pokes.filter((at) => now - at < 2.5), now];
    if (this.pokes.length >= 3) {
      this.pokes = [];
      this.setAct('dizzy');
    } else this.setAct('poked');
  }

  protected idle(t: number) {
    this.puppet.add('body', 1 * sin(t, 0.3));
    this.lidReq = 0;
    this.popReq = 0;
    this.nod = 0;
    this.keyReq = null;
    this.turnReq = 0;
    this.handsRate = 0;
    this.sink = 0;
    this.stand = 0;
    this.quiet = false;
    this.marchAmt = 0;
    this.dozing = false;
    this.actSpeed = 0.7;
    this.actExpr = null;
    this.lampMode = 'tick';
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    this.env = env;
    this.spec.speed = this.actSpeed;
    const sleeping = this.act === 'nap' || this.dozing;

    // Hopping along on his little legs (higher, stiffer steps when marching).
    const moving = Math.min(1, this.stride / (this.heightPx * 0.5));
    const step = Math.sin(this.gait * 1.6);
    const swing = 25 * (1 + 0.6 * this.marchAmt);
    p.add('leg.L', swing * step * moving);
    p.add('leg.R', -swing * step * moving);
    p.add('body', 0, 0, (6 + 8 * this.marchAmt) * step * moving);
    const lift = 0.03 * Math.abs(step) * moving + Math.max(0, this.hop.update(dt, 0));
    const low = sleeping ? -0.02 : this.sink;
    p.shift('root', 0, lift + this.stand + this.crouch.update(dt, low), 0);
    if (this.act === 'nap' || this.act === 'snooze') p.add('body', this.act === 'nap' ? 7 : 0);

    // Turning his back on us to show the key, and the gadgets on top.
    p.add('root', 0, this.turnReq, 0);
    const lid = this.lid.update(dt, this.lidReq);
    p.add('lid', -105 * lid);
    const pop = this.pop.update(dt, this.popReq * clamp((lid - 0.6) * 3, 0, 1));
    p.shift('bird', 0, 0.12 * pop, 0);
    p.add('bird', 14 * this.nod);
    p.stretch('coil', 1 + (0.12 * pop) / 0.042, [0, 1, 0], 1);
    // The key on his back turns a little as he walks, and hard when he winds himself.
    this.keyAngle += (this.keyReq ?? 50 * moving) * dt;

    // Tick, tock: a little rock on every real second.
    const second = Math.floor(Date.now() / 1000);
    if (second !== this.second) {
      this.second = second;
      this.tock = -this.tock;
      if (!sleeping && !this.quiet) {
        p.kick('body', 0, 0, this.tock * 20);
        p.kick('hammer', 0, 0, this.tock * 50);
        if (this.act === 'beatDance') this.tingle(0.7);
      }
    }

    // Pleased when the mouse comes over him.
    if (this.hovered && !this.wasHovered) {
      this.hop.kick(0.5);
      this.tingle(0.6);
    }
    this.wasHovered = this.hovered;

    // On the hour, the alarm.
    const now = new Date();
    if (
      now.getMinutes() === 0 &&
      now.getHours() !== this.rungHour &&
      this.state === 'here' &&
      !night()
    ) {
      this.rungHour = now.getHours();
      this.setAct('ring');
    }
    // He dozes and yawns more at night.
    this.acts.nap.weight = night() ? 6 : 0.8;
    this.acts.yawn.weight = night() ? 3 : 0.7;

    if (this.act === 'ring') this.expression = this.actT < 0.6 ? 'surprised' : 'happy';
    else if (this.actExpr) this.expression = this.actExpr;
    else if (this.hovered) this.expression = 'happy';
    else this.expression = night() ? 'sleepy' : 'neutral';

    // The hammer knob: flashing while he rings, breathing while he dozes.
    const t = env.time;
    let light = BEACON.neutral!;
    if (this.act === 'ring' || this.act === 'poked' || this.lampMode === 'flash')
      light = Math.sin(t * 30) > 0 ? BEACON.happy! : BEACON.neutral!;
    else if (sleeping) light = Math.sin(t * 1.4) > 0 ? '#55554f' : '#8a8a84';
    else if (this.act === 'tap' || this.act === 'chime' || this.act === 'checkTime')
      light = BEACON.love!;
    this.light.lerp(colour.set(light), Math.min(1, dt * 10));
    this.outfit.beacon(this.light);

    // The tick lamps in his side caps: tick, tock; both flashing when he rings; dark
    // when he's being quiet; swinging with the pendulum.
    let a = this.tock > 0 ? 1 : 0.1;
    let b = this.tock > 0 ? 0.1 : 1;
    if (this.lampMode === 'flash') a = b = Math.sin(t * 30) > 0 ? 1 : 0.1;
    else if (this.lampMode === 'off' || sleeping)
      a = b = sleeping ? 0.12 + 0.1 * Math.sin(t * 1.4) : 0;
    else if (this.lampMode === 'swing')
      [a, b] = [Math.max(0, this.lampSwing), Math.max(0, -this.lampSwing)];
    const k = Math.min(1, dt * 14);
    this.lamps[0] += (a - this.lamps[0]) * k;
    this.lamps[1] += (b - this.lamps[1]) * k;
    this.outfit.dot(1, this.lamps[0]);
    this.outfit.dot(2, this.lamps[1]);
    // The cuckoo, lit while it sings.
    this.outfit.dot(0, pop > 0.3 ? 0.7 + 0.3 * Math.sin(t * 22) : 0);
  }

  protected after(dt: number) {
    const p = this.puppet;
    p.turn('key', 0, 0, this.keyAngle);
    if (this.act !== 'twirl') this.spinAngle = 0;
    if (this.spinAngle) p.swing('root', this.spinAngle);
    // Hands: they whizz round on request, then run on to the right time again.
    const face = this.face!;
    if (this.handsRate) face.dialShift += this.handsRate * dt;
    else if (face.dialShift) {
      const back = Math.round(face.dialShift / 720) * 720;
      face.dialShift += (back - face.dialShift) * Math.min(1, dt * 3);
      if (Math.abs(back - face.dialShift) < 0.5) face.dialShift = 0;
    }
  }
}
