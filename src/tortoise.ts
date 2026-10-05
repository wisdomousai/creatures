import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Act, Character, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { sin, trot } from './moves';
import { Spring } from './spring';

/**
 * Ohm, the robot tortoise: a high dome of a shell like a helmet, made of chunky raised
 * scute plates bolted on in rings round a hatch, on four stumpy elephant legs, with a
 * ribbed neck that telescopes in and out and a head with sleepy, wise eyes. He is very
 * slow, very steady and quite unbothered: his walk is speed 0.3, one leg at a time, and
 * he has never been late for anything.
 *
 * The hatch on top is a lens with six lit bolts round it (the inner ring of plates),
 * and they show his mood: a slow breath as he plods, a ring of light chasing round when
 * he is pleased or showing off, a warm glow in the sun, a dim doze. A little birthday
 * candle folds away inside the hatch for the day he is proud of his years.
 *
 * Tricks: plodding, a very slow race (determined face, speed lines), wandering to the
 * back wall and out to the front lip, stretching his neck up to look over it, going
 * completely into his shell (head, legs and tail all in, the shell rocking) and peeking
 * out again, munching a leaf, a long yawn, basking under the ceiling lamp, falling asleep
 * mid-step, a slow nod of approval, being rolled over and paddling his legs before he
 * rights himself, a slow wave, reading in tiny glasses, the "100 years" candle, stomping,
 * a stretch, a light parade, a nap, hiccups, sitting like a loaf, plodding over to a
 * crewmate to say hello.
 *
 * A poke and he is in his shell in a blink, rocking, and peeks out a while later; three
 * quick pokes and the shell spins, and he comes out dizzy. Rest the mouse on him and his
 * neck stretches toward it, eyes shut in contentment, lights glowing warm.
 */
export const TORTOISE_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.3, 0.44],
    [0.7, 0.44],
  ],
  rx: 0.075,
  ry: 0.22,
  line: 0.036,
  mouth: [0.5, 0.84],
};

const LEGS = [
  ['leg.FL', 1],
  ['leg.FR', -1],
  ['leg.BL', 1],
  ['leg.BR', -1],
] as const;
const NECK = ['neck.1', 'neck.2', 'neck.3', 'neck.4'];
/** The inner ring of lights, round the hatch: Dot1..Dot6. */
const HALO = 6;
const DEG = 180 / Math.PI;

const ease = (t: number, a: number, b: number) => {
  const u = clamp((t - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
};
const span = (t: number, a: number, b: number, c: number, d: number) =>
  ease(t, a, b) * (1 - ease(t, c, d));
const bump = (x: number, width: number) => Math.max(0, 1 - Math.abs(x) / width);
const cycle = (x: number) => x - Math.floor(x);

export class Tortoise extends Character {
  static readonly terms =
    'shelled reptile dome helmet shell scutes plates tan brown beige khaki slow old senior wise sleepy stumpy legs neck plod walk';

  private env: Env | null = null;
  /** How far into the shell (0 out, 1 all the way in), and how far the neck reaches. */
  private inside = new Spring(1.5, 0.7, 1, 0);
  private reach = new Spring(1.6, 0.75, 1, 0);
  private lift = new Spring(1.6, 0.75, 1, 0);
  private alt = new Spring(3, 0.4, 1, 0);
  private did = 0;
  private dir = 1;
  private pokes: number[] = [];
  private hover = 0;
  private mate: Character | null = null;
  // Set each frame by whatever act is running (idle() clears them).
  private withdraw = 0;
  private ext = 0;
  private up = 0;
  private headP = 0;
  private headY = 0;
  private lean = 0;
  private roll = 0;
  private rock = 0;
  private flipped = 0;
  private paddle = 0;
  private splay = 0;
  private wave = 0;
  private stomp = 0;
  private leaf = 0;
  private bites = 0;
  private candle = 0;
  private lines = 0;
  private sun = 0;
  private show = 0;
  private spin = 0;
  private glasses = false;
  private mood: string | null = null;
  private sway = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Ohm',
        model: 'tortoise',
        metres: 0.21,
        width: 0.36,
        size: 0.95,
        feels: {
          default: { f: 3, zeta: 0.6 },
          body: { f: 2.2, zeta: 0.5 },
          shell: { f: 2.6, zeta: 0.25 },
          head: { f: 2.4, zeta: 0.6, r: 0.4 },
          tail: { f: 3, zeta: 0.3 },
          'leg.FL': { f: 3.5, zeta: 0.5 },
          'leg.FR': { f: 3.5, zeta: 0.5 },
          'leg.BL': { f: 3.5, zeta: 0.5 },
          'leg.BR': { f: 3.5, zeta: 0.5 },
        },
        face: TORTOISE_FACE,
        eyes: 0.5,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.9 },
          { bone: 'neck.1', yaw: 0.15, pitch: 0.1 },
        ],
        reach: { yaw: 55, pitch: 25 },
        lag: 0.9,
        entrance: 'rise',
        edges: ['bottom'],
        stay: [80, 150],
        speed: 0.3,
        turn: 60,
      },
      model,
    );
    this.acts = {
      ...this.getting(),
      ...this.shell(),
      ...this.tricks(),
      ...this.rests(),
      ...this.reactions(),
    };
  }

  private mates() {
    const f = this.env?.frame;
    return (this.env?.crew ?? [])
      .filter((o) => o !== this && o.state === 'here' && o.edge === this.edge && !o.free)
      .sort((a, b) => Math.abs(a.s - this.s) - Math.abs(b.s - this.s))
      .filter((o) => !f || Math.abs(o.s - this.s) < this.heightPx * 12);
  }

  private still = () => !this.walking && !this.door;

  /** A short trip along the floor, toward the roomier side unless `way` says. */
  private amble(heights: number, depth?: number, way?: number) {
    if (!this.env) return;
    const [lo, hi] = this.span(this.env.frame);
    const more = this.s - lo > hi - this.s ? -1 : 1;
    const room = (more > 0 ? hi - this.s : this.s - lo) - this.widthPx() * 1.2;
    const w = way ?? (Math.random() < 0.7 ? more : -more);
    const far = Math.min(Math.max(room, 0), this.heightPx * heights);
    this.walkTo(this.s + w * Math.max(far, this.heightPx * 0.7), depth);
  }

  // ---------- Acts: getting about ----------

  private getting(): Record<string, Act> {
    return {
      idle: { weight: 4, length: [3, 6] },
      plod: {
        weight: 2.6,
        length: [6, 9],
        when: this.still,
        start: () => this.amble(1.5 + Math.random() * 1.5),
      },
      wander: {
        weight: 1.2,
        length: [8, 11],
        when: this.still,
        start: () => this.amble(1.2, 0.2 + Math.random() * 0.75),
      },
      race: {
        weight: 0.9,
        length: [12, 14],
        when: this.still,
        start: () => {
          this.spec.speed = 0.52;
          this.amble(4, undefined, Math.random() < 0.5 ? -1 : 1);
        },
        pose: (t) => {
          // The very slow race: nose down, brow set, legs going like pistons (at speed
          // one half), speed lines streaming out behind. At the end, a proud nod.
          const k = span(t, 0.2, 1, this.actLength - 3.4, this.actLength - 2.4);
          this.lean = 6 * k;
          this.ext = 0.7 * k;
          this.headP = 10 * k;
          this.lines = k * (this.walking ? 1 : 0);
          this.spec.speed = 0.52;
          this.expression = k > 0.3 ? 'cross' : this.walking ? 'focused' : 'happy';
          if (t > this.actLength - 2.4) this.headP = 6 * sin(t, 0.7) - 4;
        },
      },
      peekBack: {
        weight: 0.8,
        length: [14, 16],
        when: this.still,
        start: () => {
          this.did = 0;
          this.amble(1.5, 0.95, Math.random() < 0.5 ? -1 : 1);
        },
        pose: (t) => {
          // Plods to the back wall, stands there peering about with his neck out, and
          // plods home.
          const at = this.depth > 0.85 && !this.walking;
          if (at && !this.did) this.did = t;
          const k = at ? span(t - this.did, 0, 1, 5.5, 6.5) : 0;
          this.ext = 0.9 * k;
          this.headY = 34 * k * sin(t, 0.22);
          this.headP = -4 * k;
          if (this.did && t - this.did > 6.5 && this.depth > 0.5) this.walkTo(this.s, 0.2);
          this.expression = k > 0.3 ? 'focused' : 'neutral';
        },
      },
      lookOver: {
        weight: 0.9,
        length: [11, 13],
        when: this.still,
        start: () => {
          this.did = 0;
          this.amble(1.2, 0);
        },
        pose: (t) => {
          // At the front lip he stretches his neck up as far as it goes, to see over it.
          const at = this.depth < 0.05 && !this.walking;
          if (at && !this.did) this.did = t;
          const k = at ? span(t - this.did, 0, 1.6, 6, 7.4) : 0;
          this.up = k;
          this.ext = 0.4 * k;
          this.headP = -18 * k;
          this.lean = -4 * k;
          if (this.did && t - this.did > 7.4) this.walkTo(this.s, 0.25);
          this.expression = k > 0.4 ? 'surprised' : 'neutral';
        },
      },
      visit: {
        weight: 1,
        length: [11, 14],
        face: 'happy',
        when: () => this.still() && this.mates().length > 0,
        start: () => {
          this.mate = this.mates()[0] ?? null;
          this.did = 0;
          const o = this.mate;
          if (o) {
            const way = o.s > this.s ? -1 : 1;
            this.walkTo(o.s + way * (this.widthPx() * 0.6 + o.spec.width * o.px * 0.5), o.depth);
          }
        },
        pose: (t) => {
          // Plods over to a crewmate, and when he gets there, a slow nod hello.
          const near = !this.walking && t > 1.5;
          if (near && !this.did) this.did = t;
          const k = near ? span(t - this.did, 0, 1, 4.6, 5.6) : 0;
          this.ext = 0.5 * k;
          this.headP = -8 * k + 8 * k * sin(t, 0.45);
        },
      },
    };
  }

  // ---------- Acts: the shell ----------

  private shell(): Record<string, Act> {
    return {
      withdraw: {
        weight: 1.1,
        length: [11, 13],
        when: this.still,
        pose: (t) => {
          // Right into the shell: head, legs and tail all in, the shell rocking as it
          // settles; a long wait; then out, an eye at a time.
          this.withdraw = t < this.actLength - 3.4 ? 1 : t < this.actLength - 1.8 ? 0.55 : 0;
          if (t > 0.3 && t < 2.6) this.rock = 8 * Math.exp(-(t - 0.3) * 1.1) * Math.sin(t * 6);
          this.expression =
            this.withdraw > 0.9 ? 'asleep' : this.withdraw > 0.3 ? 'sleepy' : 'happy';
          this.mood = this.withdraw > 0.9 ? '#8a8a84' : null;
        },
      },
      peek: {
        weight: 1,
        length: [9, 11],
        when: this.still,
        pose: (t) => {
          // Shy: in a little, then the head comes out slowly, looks left, looks right,
          // and goes back a bit before the second, braver try.
          this.withdraw =
            t < 1.4
              ? 0.55 * ease(t, 0, 1.4)
              : t < 3
                ? 0.55 - 0.4 * ease(t, 1.4, 3)
                : t < 5
                  ? 0.15
                  : t < 6
                    ? 0.45
                    : t < 8
                      ? 0.45 - 0.45 * ease(t, 6, 8)
                      : 0;
          this.headY = t > 3 && t < 5 ? 24 * sin(t, 0.6) : 0;
          this.expression = this.withdraw > 0.3 ? 'sad' : 'neutral';
        },
      },
      flip: {
        weight: 0.8,
        length: [13, 13],
        face: 'dizzy',
        when: this.still,
        pose: (t) => {
          // Tips onto his back with a thump, legs paddling in the air, neck stretching
          // for the floor; a big rock back and forth, and over he goes, right way up.
          const over = ease(t, 0.3, 1.5);
          const back = ease(t, 9.4, 10.6);
          this.flipped = over - back;
          this.roll = 180 * this.flipped;
          this.paddle = span(t, 1.6, 2.2, 7.6, 8.6);
          this.rock = 5 * span(t, 8.6, 9.2, 10.4, 11.6) * Math.sin(t * 7);
          this.ext = 1.1 * span(t, 3, 4, 6, 7);
          this.headP = -16 * span(t, 3, 4, 6, 7);
          this.expression =
            t < 1.5 ? 'surprised' : t < 9.4 ? 'dizzy' : t < 11.6 ? 'cross' : 'happy';
          if (t > 1.45 && t < 1.5) this.alt.kick(-1.4);
          if (t > 10.5 && t < 10.55) this.alt.kick(-1.6);
        },
      },
      hiccup: {
        weight: 0.7,
        length: [5.6, 5.6],
        face: 'surprised',
        when: this.still,
        pose: (t) => {
          // Hic. The whole shell jumps, the lights flash, he looks put out. Hic.
          const n = Math.floor(t / 1.7);
          const u = t - n * 1.7;
          const hic = n < 3 && u < 0.3 ? Math.sin((Math.PI * u) / 0.3) : 0;
          this.show = hic;
          if (n < 3 && u < 0.03) this.alt.kick(2);
          this.headP = -8 * hic;
          this.expression = hic > 0.2 ? 'surprised' : 'cross';
        },
      },
      stomp: {
        weight: 0.9,
        length: [4.6, 5],
        face: 'cross',
        when: this.still,
        pose: (t) => {
          // Impatient: stomps a front foot, then the other, then a slow sigh.
          const k = span(t, 0.2, 0.7, this.actLength - 1.4, this.actLength - 0.6);
          this.stomp = k;
          this.headP = 6 * k;
          this.expression = t > this.actLength - 1.2 ? 'sleepy' : 'cross';
        },
      },
    };
  }

  // ---------- Acts: tricks ----------

  private tricks(): Record<string, Act> {
    return {
      nod: {
        weight: 1.2,
        length: [5, 6],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // A slow head bob of approval, three times, the neck a little out.
          const k = span(t, 0.3, 1, this.actLength - 1, this.actLength - 0.3);
          this.ext = 0.3 * k;
          this.headP = 14 * k * (0.5 - 0.5 * Math.cos(2 * Math.PI * 0.55 * t));
          this.mood = BEACON.happy ?? null;
        },
      },
      yawn: {
        weight: 1,
        length: [7, 7],
        when: this.still,
        pose: (t) => {
          // A long slow yawn: neck out, head right back, mouth wide, eyes squeezed shut,
          // a shudder at the top; then a slow blink and a sleepy smack of the lips.
          const k = span(t, 0.4, 2.4, 4.4, 6.2);
          this.ext = 1 * k;
          this.headP = -30 * k;
          this.lean = -3 * k;
          this.headY = 2 * sin(t, 3) * k;
          this.expression = k > 0.55 ? 'surprised' : t > 6 ? 'happy' : 'sleepy';
          if (k > 0.55) this.expression = t > 2.6 && t < 4.2 ? 'asleep' : 'surprised';
        },
      },
      munch: {
        weight: 1.2,
        length: [10, 10],
        when: this.still,
        pose: (t) => {
          // A leaf comes out of nowhere; head down, he eats it in five slow bites, the
          // leaf a little shorter each time, chewing between; then a contented blink.
          const shown = ease(t, 0.2, 0.8) * (t < 8 ? 1 : 1 - ease(t, 8, 8.4));
          const bite = clamp((t - 1.6) / 1.35, 0, 5);
          this.leaf = shown;
          this.bites = Math.floor(bite);
          const chewing = bite < 5 && cycle(bite) > 0.25 ? 1 : 0;
          this.headP =
            20 * ease(t, 0.4, 1.2) * (1 - ease(t, 8.4, 9.4)) + 3.5 * chewing * Math.sin(t * 20);
          this.ext = 0.4 * ease(t, 0.4, 1.2) * (1 - ease(t, 8.4, 9.4));
          this.headY = 5 * chewing * Math.sin(t * 10);
          this.expression = t < 1.6 ? 'happy' : t < 8.4 ? 'neutral' : 'happy';
        },
      },
      sunbathe: {
        weight: 1,
        length: [11, 13],
        when: this.still,
        pose: (t) => {
          // Under the ceiling lamp: neck stretched up to it, legs spread, eyes shut, the
          // hatch glowing warm, halo pulsing gently.
          const k = span(t, 0.8, 3, this.actLength - 3, this.actLength - 0.6);
          this.up = 0.8 * k;
          this.ext = 0.6 * k;
          this.headP = -24 * k;
          this.lean = -3 * k;
          this.splay = k;
          this.sun = k;
          this.expression = k > 0.4 ? 'happy' : 'neutral';
        },
      },
      wave: {
        weight: 1.2,
        length: [5.4, 6],
        face: 'happy',
        when: this.still,
        start: () => (this.dir = Math.random() < 0.5 ? -1 : 1),
        pose: (t) => {
          // A slow wave with a front foot, the shell leaning the other way for balance.
          const k = span(t, 0.5, 1.6, this.actLength - 1.6, this.actLength - 0.4);
          this.wave = this.dir * k;
          this.roll = -this.dir * 5 * k;
          this.ext = 0.25 * k;
          this.headY = this.dir * 12 * k;
        },
      },
      read: {
        weight: 1,
        length: [11, 13],
        when: this.still,
        pose: (t) => {
          // Puts on his tiny glasses and reads, head bowed, a slow sweep of the eyes across
          // the line, and every so often a page-turn nod.
          const k = span(t, 0.6, 1.8, this.actLength - 1.6, this.actLength - 0.4);
          this.glasses = k > 0.3;
          this.headP = 20 * k + 2 * k * sin(t, 0.15);
          this.headY = 8 * k * sin(t, 0.35);
          this.ext = 0.2 * k;
          this.expression = k > 0.4 ? 'focused' : 'neutral';
          if (this.face && k > 0.4) this.face.look.x = Math.sin(t * 1.4) * 0.6;
        },
      },
      candle: {
        weight: 0.8,
        length: [12, 12],
        when: this.still,
        pose: (t) => {
          // "A hundred years": a birthday candle rises out of the hatch and lights, the
          // halo of bolts glows, and he lifts his chin, proud, and gives one slow nod.
          const rise = ease(t, 0.6, 1.8);
          this.candle = rise * (t < 10.4 ? 1 : 1 - ease(t, 10.4, 11.2));
          this.sun = 0.6 * rise * (1 - ease(t, 10.4, 11.4));
          const k = span(t, 1.8, 3, 9.2, 10.6);
          this.ext = 0.6 * k;
          this.headP = -14 * k + (t > 5 && t < 7 ? 10 * Math.sin((Math.PI * (t - 5)) / 2) : 0);
          this.mood = '#ffd970';
          this.expression = k > 0.3 ? 'happy' : 'neutral';
        },
      },
      lights: {
        weight: 0.8,
        length: [6, 6.4],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // A parade of lights: the halo chases round and round the hatch, faster and
          // faster, and he bobs along to it, very slightly.
          const k = span(t, 0.3, 0.9, this.actLength - 1.2, this.actLength - 0.3);
          this.show = k;
          this.headP = 6 * k * Math.abs(sin(t, 1.1));
          this.roll = 2.5 * k * sin(t, 1.1);
        },
      },
      stretch: {
        weight: 0.9,
        length: [7, 7],
        when: this.still,
        pose: (t) => {
          // A stretch: front legs out, back end up, neck as long as it goes; a quiver at
          // the top and a slow sink back.
          const k = span(t, 0.4, 2, 4.4, 6.2);
          this.lean = 9 * k;
          this.ext = 1 * k;
          this.headP = -8 * k;
          this.splay = 0.6 * k;
          this.roll = 1.5 * Math.sin(t * 16) * k * (t > 2 && t < 4.4 ? 1 : 0);
          this.expression = k > 0.4 ? 'sleepy' : 'neutral';
        },
      },
    };
  }

  // ---------- Acts: resting ----------

  private rests(): Record<string, Act> {
    return {
      nap: {
        weight: 1.1,
        length: [12, 16],
        face: 'asleep',
        when: this.still,
        pose: (t) => {
          // A nap: head half in, legs tucked, the shell rising and falling.
          const k = span(t, 0.4, 2, this.actLength - 2.4, this.actLength - 0.4);
          this.withdraw = 0.55 * k;
          this.sway = k;
          this.expression = k > 0.4 ? 'asleep' : 'sleepy';
        },
      },
      loaf: {
        weight: 0.9,
        length: [9, 12],
        when: this.still,
        pose: (t) => {
          // Sits like a loaf: legs tucked right in under him, head out, blinking slowly,
          // perfectly content.
          const k = span(t, 0.4, 2.2, this.actLength - 2.2, this.actLength - 0.4);
          this.sun = 0.15 * k;
          this.loafK = k;
          this.ext = 0.2 * k;
          this.expression = k > 0.4 ? 'sleepy' : 'neutral';
        },
      },
      fallAsleep: {
        weight: 0.8,
        length: [10, 10],
        when: this.still,
        start: () => {
          this.did = 0;
          this.amble(2.5);
        },
        pose: (t) => {
          // Off on a plod, then halfway through a step he nods off where he stands, head
          // sinking, a snore; and with a jerk he wakes and carries on as if nothing happened.
          if (t > 2.4 && !this.did) {
            this.did = 1;
            this.goal = null;
            this.depthGoal = this.depth;
          }
          const sleep = span(t, 2.4, 4, 7.4, 7.8);
          this.headP = 26 * sleep;
          this.ext = -0.3 * sleep;
          this.sway = sleep;
          this.expression =
            t < 2.4 ? 'neutral' : t < 7.4 ? 'asleep' : t < 9 ? 'surprised' : 'neutral';
          if (t > 7.4 && t < 7.45) this.alt.kick(1.6);
          if (t > 7.6 && !this.walking && this.did === 1) {
            this.did = 2;
            this.amble(1.5);
          }
        },
      },
    };
  }

  private loafK = 0;

  // ---------- Reactions ----------

  private reactions(): Record<string, Act> {
    return {
      poked: {
        weight: 0,
        length: [7, 8],
        face: 'surprised',
        pose: (t) => {
          // In like a shot, the shell rocking; a long wait; then out slowly.
          this.withdraw = t < 4.8 ? 1 : t < 6 ? 0.5 : 0;
          if (t < 2.4) this.rock = 10 * Math.exp(-t * 1.3) * Math.sin(t * 7);
          this.show = t < 0.9 ? 1 - t / 0.9 : 0;
          this.expression = t < 1.4 ? 'surprised' : t < 6 ? 'sad' : 'neutral';
        },
      },
      dizzy: {
        weight: 0,
        length: [6, 6],
        face: 'dizzy',
        pose: (t) => {
          // The shell spins round like a top with him in it, then he sticks his head out,
          // reeling.
          const k = ease(t, 0, 0.4) * (1 - ease(t, 2.6, 3.6));
          this.withdraw = t < 3.4 ? 1 : t < 4 ? 0.3 : 0;
          this.spin = 360 * 3 * (1 - Math.exp(-t * 1.2)) * (t < 3.6 ? 1 : 0) + (t >= 3.6 ? 0 : 0);
          this.show = k;
          this.headY = t > 3.6 ? 26 * Math.sin(t * 4) * (1 - ease(t, 3.6, 6)) : 0;
          this.roll = t > 3.6 ? 5 * Math.sin(t * 3) * (1 - ease(t, 3.6, 6)) : 0;
        },
      },
      pleased: {
        weight: 0,
        length: [5, 6],
        face: 'love',
        pose: (t) => {
          // Neck out toward the mouse, eyes soft, the halo glowing warm.
          const k = ease(t, 0, 1.2) * (1 - ease(t, this.actLength - 1.2, this.actLength));
          this.ext = 0.7 * k;
          this.headP = -6 * k;
          this.sun = 0.7 * k;
          this.mood = BEACON.love ?? null;
        },
      },
    };
  }

  poke() {
    if (this.state !== 'here') return;
    const now = performance.now() / 1000;
    this.pokes = [...this.pokes.filter((at) => now - at < 3), now];
    this.goal = null;
    this.depthGoal = this.depth;
    if (this.pokes.length >= 3) {
      this.pokes = [];
      this.setAct('dizzy');
    } else if (this.act !== 'dizzy') {
      this.setAct('poked');
      this.inside.kick(3);
    }
  }

  // ---------- Posing ----------

  protected idle(t: number) {
    const p = this.puppet;
    this.withdraw = this.ext = this.up = this.headP = this.headY = this.lean = this.roll = 0;
    this.rock = this.flipped = this.paddle = this.splay = this.wave = this.stomp = 0;
    this.leaf = this.candle = this.lines = this.sun = this.show = this.spin = 0;
    this.bites = 0;
    this.loafK = 0;
    this.sway = 0;
    this.glasses = false;
    this.mood = null;
    this.expression = this.hovered ? 'happy' : 'neutral';
    if (this.act !== 'race') this.spec.speed = 0.3;
    // Breathing, very slowly; the head never quite still; the tail's tiny sway.
    p.add('body', 0.8 * sin(t, 0.16));
    p.add('head', 1.6 * sin(t, 0.13, 0.3), 3 * sin(t, 0.07), 0);
    p.add('tail', 0, 6 * sin(t, 0.22), 0);
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

    this.hover = this.hovered ? this.hover + dt : 0;
    if (this.hover > 1 && act === 'idle' && this.still()) this.setAct('pleased');

    // Hops (a hiccup, a thump) ride a spring; he never leaves the floor otherwise.
    const alt = this.alt.update(dt, 0);
    this.h = Math.max(0, alt * H * 0.18);

    // Slow springs: how far in the shell, how far the neck reaches, how high it stretches.
    const w = clamp(this.inside.update(dt, this.withdraw), -0.1, 1.15);
    const e = this.reach.update(dt, this.ext);
    const u = clamp(this.lift.update(dt, this.up), 0, 1);
    this.wNow = clamp(w, 0, 1);

    // Walking: one leg at a time, slowly, the shell swaying as he goes.
    const speed = Math.max(this.spec.speed ?? 0.3, 0.1) * env.frame.bot;
    const amt = clamp(this.stride / speed, 0, 1.4) * (1 - this.wNow);
    const g = this.gait * 2.4;
    trot(p, g, amt, 15);
    LEGS.forEach(([leg], i) => {
      const s = Math.sin(g + (i === 0 || i === 3 ? 0 : Math.PI));
      p.shift(leg, 0, 0.011 * Math.max(0, s) * amt, 0);
    });
    p.add('shell', 0, 0, 2.2 * Math.sin(g) * amt);

    // Racing: the lean and quicker gait come from the act; here the legs pump harder.
    if (this.lean) p.add('body', this.lean);

    // Legs: splayed in the sun and in a stretch, paddling in the air when flipped,
    // stomping, waving.
    for (const [leg, sd] of LEGS) {
      if (this.splay) p.add(leg, 0, 0, sd * 16 * this.splay);
      if (this.paddle) {
        const a = Math.sin(this.t * 7 + (leg === 'leg.FL' || leg === 'leg.BR' ? 0 : Math.PI));
        p.add(leg, 34 * a * this.paddle, 0, sd * (16 + 10 * a) * this.paddle);
      }
    }
    if (this.stomp) {
      const c = this.t * 2.2;
      const a = Math.max(0, Math.sin(c * Math.PI));
      const b = Math.max(0, Math.sin(c * Math.PI + Math.PI * 1.0));
      p.add('leg.FL', -28 * a * this.stomp, 0, 8 * a * this.stomp);
      p.add('leg.FR', -28 * b * this.stomp, 0, -8 * b * this.stomp);
      p.add('body', 0, 0, 2.5 * (a - b) * this.stomp);
    }
    if (this.wave) {
      const sd = Math.sign(this.wave);
      const leg = sd > 0 ? 'leg.FL' : 'leg.FR';
      const k = Math.abs(this.wave);
      p.add(leg, -14 * k, 0, sd * (58 * k + 10 * k * sin(this.t, 1.1)));
      p.shift(leg, 0, 0.02 * k, 0);
    }

    // The neck: rings slide apart as it reaches and stack up as it goes in; up, it
    // curves toward the sky.
    for (const bone of NECK) {
      const back = bone === 'neck.1' ? 0.035 * this.wNow : 0;
      p.shift(bone, 0, 0.012 * u, 0.012 * e - 0.012 * this.wNow + 0.005 * u - back);
    }
    p.shift('head', 0, 0.006 * u, -0.05 * this.wNow);
    p.add('head', this.headP + 18 * this.wNow, this.headY);
    for (const bone of NECK) p.add(bone, -4 * u, 0, 0);

    // Loaf: the legs tucked right in.
    const legIn = Math.max(this.wNow, this.loafK);

    // Shell: the rock as it settles, the sway of a doze, the slow breath.
    p.add('shell', 0, 0, this.rock);
    if (this.sway) p.add('shell', 1.6 * this.sway * sin(this.t, 0.22), 0, 0);

    this.legIn = legIn;
    this.spinNow = this.spin;

    // A hop's lift, and the body's roll (a wave's balance, a flip).
    p.add('body', 0, 0, this.roll);

    // The face: glasses, and a sleepy half-close while dozing.
    if (this.face) {
      this.face.overlay = this.glasses ? 'glasses' : '';
      this.face.overlayK = 1;
    }
  }

  private wNow = 0;
  private legIn = 0;
  private spinNow = 0;

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    const t = env.time;
    void dt;

    // Rolled over: the whole body turns on its back (pushed up so the shell rests on the
    // floor), and the shell spins like a top for a dizzy poke.
    const f = clamp(this.flipped, 0, 1);
    this.pivot.rotation.y = this.spinNow / DEG;

    // Everything comes in: head and neck shrink, legs shorten into the shell and the
    // tail folds away; the shell drops onto the floor.
    const k = this.wNow;
    const pull = 1 - 0.4 * k;
    p.stretch('head', pull, [0, 0, 1], pull);
    for (const bone of NECK) p.stretch(bone, 1 - 0.2 * k, [0, 0, 1], 1 - 0.25 * k);
    const inn = this.legIn;
    for (const [leg] of LEGS) p.stretch(leg, 1 - 0.78 * inn, [0, 1, 0], 1 - 0.22 * inn);
    const tail = Math.max(0.001, 1 - 0.95 * k);
    p.stretch('tail', tail, [0, 0, 1], tail);
    // The whole body sinks to the floor as the legs go in; rolled over, it is pushed up so
    // the dome rests on the floor.
    p.shift('root', 0, 0.04 * f - 0.05 * inn, 0);

    // Hiding things: the leaf, the candle and its flame, the speed lines.
    const leaf = this.leaf > 0.01 ? Math.max(0.001, this.leaf * (1 - 0.2 * this.bites)) : 0.001;
    p.stretch('leaf', leaf, [0, 1, 0], Math.max(0.001, this.leaf > 0.01 ? this.leaf : 0.001));
    const candle = Math.max(0.001, this.candle);
    p.stretch('candle', candle, [0, 1, 0], candle);
    // Folded away, each sits inside something solid so no speck of it shows.
    p.shift('candle', 0, this.candle > 0.01 ? 0 : -0.08, 0);
    p.shift('leaf', 0, this.leaf > 0.01 ? 0 : 0.02, this.leaf > 0.01 ? 0 : -0.06);
    const flame = Math.max(
      0.001,
      this.candle > 0.8 ? 0.85 + 0.2 * Math.sin(t * 17) * Math.sin(t * 11) : 0.001,
    );
    p.stretch('flame', flame, [0, 1, 0], flame);
    const lines = Math.max(0.001, this.lines * (0.85 + 0.15 * Math.sin(t * 20)));
    p.stretch('lines', lines, [0, 0, 1], Math.max(0.001, this.lines));
    p.shift('lines', 0, 0.006 * Math.sin(t * 13), this.lines > 0.01 ? 0 : 0.16);

    this.lights(t);
  }

  /** The hatch (Dot0) and the six halo bolts (Dot1..Dot6). */
  private lights(t: number) {
    const act = this.act;
    let hatch: number;
    let tone: string | undefined = this.mood ?? undefined;
    if (act === 'dizzy' || act === 'poked') {
      hatch = act === 'dizzy' ? (Math.random() < 0.5 ? 1 : 0.2) : this.show > 0.05 ? 1 : 0.3;
    } else if (this.sun > 0.05) hatch = 0.55 + 0.45 * this.sun;
    else if (act === 'nap' || act === 'withdraw' || act === 'fallAsleep')
      hatch = 0.15 + 0.1 * Math.sin(t * 0.7);
    else if (this.show > 0.05) hatch = 1;
    else hatch = 0.45 + 0.2 * Math.sin(t * 1.1);
    this.outfit.dot(0, hatch, tone);

    for (let i = 0; i < HALO; i++) {
      let level: number;
      tone = this.mood ?? undefined;
      if (act === 'dizzy') {
        level = Math.random() < 0.5 ? 1 : 0.15;
        tone = RAINBOW[(i + Math.floor(t * 9)) % RAINBOW.length];
      } else if (act === 'poked' || act === 'hiccup') {
        level = this.show > 0.05 ? this.show * (Math.sin(t * 28) > 0 ? 1 : 0.5) : 0.15;
        tone = BEACON.surprised;
      } else if (act === 'lights') {
        // A chase round the ring, faster and faster.
        const speed = 1 + 2.5 * clamp(this.actT / 5, 0, 1);
        level = this.show * bump(cycle(t * speed) - i / HALO, 0.2) + 0.1;
        tone = RAINBOW[Math.floor((t * speed + i / HALO) * 2) % RAINBOW.length];
      } else if (this.sun > 0.05) {
        level = 0.35 + 0.65 * this.sun * (0.5 + 0.5 * Math.sin(t * 1.4 - i * 0.5));
        tone = tone ?? '#ffd970';
      } else if (act === 'nap' || act === 'withdraw' || act === 'fallAsleep' || this.wNow > 0.8) {
        level = 0.1 + 0.08 * Math.sin(t * 0.7 - i * 0.3);
      } else if (act === 'race') {
        level = 0.2 + 0.8 * bump(cycle(t * 1.6) - i / HALO, 0.25);
        tone = BEACON.focused;
      } else if (this.walking) {
        // A slow plod: the ring ticks round, one bolt at a time.
        level = 0.2 + 0.7 * bump(cycle(t * 0.35) - i / HALO, 0.14);
      } else if (this.hovered) {
        level = 0.5 + 0.4 * Math.sin(t * 2 - i * 0.9);
        tone = BEACON.happy;
      } else {
        // Idle: now and then a slow ripple round the ring.
        level = 0.25 + 0.6 * bump(cycle(t / 6) - i / HALO, 0.1);
      }
      this.outfit.dot(1 + i, level, tone);
    }
  }
}
