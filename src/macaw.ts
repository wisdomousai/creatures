import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Act, ANGLE, Character, clamp, type Env, type Frame } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import { Spring } from './spring';

/**
 * Coco, the robot scarlet macaw: a big, bright, chatty show-off. A chunky barrel of a
 * body on short sturdy legs, a big head with a screen face set in a pale face plate, a
 * big hooked beak in two hinged halves, a crest of plates on the crown that rises when
 * he is excited, long layered wings (yellow band, blue flight plates, every tip a light)
 * and a very long two-feather tail with lit blue tips. His feet grip: two toes forward,
 * two back.
 *
 * He shuffles sideways along the floor, struts, bobs his head to a beat with the lights
 * running, flashes his crest, talks (the beak going, little dots of light popping out in
 * front of it), wolf-whistles with the lights sweeping up, spreads his wings to show off
 * his colours, preens his long tail, pirouettes, copies a crewmate's every move and
 * sound, sneezes, yawns, plays peekaboo behind a wing, turns shy, cracks a walnut (the
 * kernel glows), peers out from the back wall and over the front lip. And he flies, with
 * big slow wingbeats: round a circuit of the box, over the floor, out to the back wall
 * to hover and look out, or up to the ceiling, where he lands upside down and hangs by
 * his feet, swings, lets go with one foot, wraps himself in his wings, climbs along the
 * ceiling beak over foot, hangs by his beak, and drops off with a flip.
 *
 * He also clicks his beak in quick runs, blinks slowly and smugly, cocks his head to listen,
 * preens a single slat, throws up his wings in an alarm squawk, shows his tongue, copies a
 * crewmate's beep in lit chirps, and hovers on the spot with his feet dangling.
 *
 * The wing-tip lights run the colour of what he feels; a poke sends him squawking up in
 * the air with everything flashing, three pokes make him dizzy, and the mouse resting
 * on him makes him bob and flash his crest.
 */
export const MACAW_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.3, 0.5],
    [0.7, 0.5],
  ],
  rx: 0.095,
  ry: 0.3,
  line: 0.038,
  mouth: null,
};

const SIDES = [
  ['L', 1],
  ['R', -1],
] as const;
/** Where the pivot sits above the feet, as a share of his height (the base class's). */
const MIDDLE = 0.45;
const ease = (t: number, a: number, b: number) => {
  const u = clamp((t - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
};
/** Fades in over a..b, holds, and fades out over c..d. */
const span = (t: number, a: number, b: number, c: number, d: number) =>
  ease(t, a, b) * (1 - ease(t, c, d));
const pulse = (t: number, every: number, on: number) => (t % every < on ? 1 : 0);
/** Sweeps 0..1 up the lights: how lit light i of n is, for a sweep at position u. */
const sweep = (u: number, i: number, n: number) => Math.max(0, 1 - Math.abs(u * (n + 1) - i - 0.5));

type Mode = 'climb' | 'glide' | 'flare' | 'hover' | 'drop';
interface Waypoint {
  x: number;
  y: number;
  d?: number;
  mode: Mode;
  /** Speed, in body heights per second. */
  v: number;
  /** Turned over (upside down) by the time it is reached. */
  flip?: boolean;
  /** Loiter here this many seconds. */
  wait?: number;
}
type Kind = 'circuit' | 'flyover' | 'lookout' | 'ceiling' | 'drop';

export class Macaw extends Character {
  /** Held by the pointer, it flies after it. */
  readonly flies = true;
  private env: Env | null = null;
  private lift = 0;
  private tucked = 0;
  private crest = new Spring(4, 0.45);
  private tail = new Spring(3, 0.5);
  private wings = new Spring(2.2, 0.55, 1.1);
  private tilt = new Spring(1.6, 0.8);
  private hangF = new Spring(1.4, 0.6);
  private nutS = new Spring(5, 0.5, 1.4);
  private talkS = [new Spring(8, 0.4, 1.6), new Spring(8, 0.4, 1.6), new Spring(8, 0.4, 1.6)];
  private flight: 'no' | 'crouch' | 'air' = 'no';
  private kind: Kind = 'flyover';
  private vel = { x: 0, y: 0 };
  private route: Waypoint[] = [];
  private wait = 0;
  private exiting = false;
  private pokes: number[] = [];
  private hover = 0;
  private dir = 1;
  private did = 0;
  private spin = 0;
  private glow = 0;
  /** How long he has been hanging from the ceiling (s). */
  private hung = 0;
  // Per-frame requests from acts.
  private wingOpen = 0;
  private wingFlap = 0;
  private wingFan = 0;
  private wingLift = 0;
  private crestUp = 0;
  private tailFan = 0;
  private talking = 0;
  private wantNut = 0;
  private nutCrack = 0;
  private nutEaten = 0;
  private hangBeak = 0;
  private beat = 0;
  private light: 'rest' | 'dance' | 'whistle' | 'flash' | 'rainbow' | 'copy' | 'beep' = 'rest';
  private lightT = 0;
  private lastHead = 0;
  private copyLevel = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Coco',
        model: 'macaw',
        metres: 0.6,
        width: 0.36,
        size: 1.05,
        feels: {
          default: { f: 4, zeta: 0.6 },
          root: { f: 3, zeta: 0.5 },
          body: { f: 3, zeta: 0.5 },
          head: { f: 4, zeta: 0.5, r: 0.5 },
          jaw: { f: 8, zeta: 0.4 },
          crest: { f: 6, zeta: 0.35 },
          tail: { f: 2.6, zeta: 0.4 },
          'tail.L': { f: 3.5, zeta: 0.4 },
          'tail.R': { f: 3.5, zeta: 0.4 },
          'wing.L': { f: 2.6, zeta: 0.5 },
          'wing.R': { f: 2.6, zeta: 0.5 },
          'leg.L': { f: 6, zeta: 0.6 },
          'leg.R': { f: 6, zeta: 0.6 },
        },
        face: MACAW_FACE,
        eyes: 0.8,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.9 },
          { bone: 'body', yaw: 0.15, pitch: 0 },
        ],
        reach: { yaw: 60, pitch: 30 },
        lag: 1.1,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [60, 130],
        speed: 1.1,
        turn: 40,
        roam: true,
      },
      model,
    );
    this.acts = {
      ...this.walks(),
      ...this.shows(),
      ...this.chatter(),
      ...this.quirks(),
      ...this.extras(),
      ...this.flights(),
      ...this.hangs(),
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

  private get grounded() {
    return this.flight === 'no' && !this.door && !this.free;
  }
  private still = () => !this.walking && this.grounded && this.edge === 'bottom';
  private hangs_ = () => !this.walking && this.grounded && this.edge === 'top';

  protected get roams() {
    return this.edge === 'bottom';
  }

  private room(): [number, number] {
    if (!this.env) return [1, 0];
    const [lo, hi] = this.span(this.env.frame);
    const way = this.s - lo > hi - this.s ? -1 : 1;
    return [way, (way > 0 ? hi - this.s : this.s - lo) - this.widthPx() * 1.2];
  }

  private amble(heights: number, depth?: number, way?: number) {
    const [more, room] = this.room();
    const w = way ?? (Math.random() < 0.7 ? more : -more);
    const far = Math.min(Math.max(room, 0), this.heightPx * heights);
    this.walkTo(this.s + w * Math.max(far, this.heightPx * 0.6), depth);
  }

  // ---------- Walking about ----------

  private walks(): Record<string, Act> {
    return {
      idle: { weight: 4, length: [3, 6] },
      strut: {
        weight: 1.6,
        length: [3.5, 5.5],
        face: 'happy',
        when: this.still,
        start: () => {
          this.spec.speed = 0.9;
          this.spec.turn = 75;
          this.amble(3 + Math.random() * 3);
        },
        pose: (t) => {
          // Chest out, head high, tail carried, a slow proud roll of the hips.
          const p = this.puppet;
          p.add('body', -9);
          p.add('head', 8 * Math.cos(this.gait * 2));
          p.add('tail', 14 + 4 * sin(t, 1));
          this.crestUp = 0.35;
        },
      },
      shuffle: {
        weight: 2,
        length: [3, 4.4],
        face: 'focused',
        when: this.still,
        start: () => {
          // Sideways, still facing us, feet sliding together and apart, eyeing the crowd.
          this.spec.speed = 0.7;
          this.spec.turn = 0;
          this.amble(2, this.depth, Math.random() < 0.5 ? -1 : 1);
        },
        pose: (t) => {
          const p = this.puppet;
          const w = Math.sin(this.gait * 1.6);
          const dir = Math.sign(this.pace) || 1;
          p.add('body', 0, 0, 5 * w * dir);
          p.add('head', 4, 0, -6 * w * dir + 5 * sin(t, 0.6));
          p.add('leg.L', 0, 0, dir * 22 * Math.max(0, w));
          p.add('leg.R', 0, 0, -dir * 22 * Math.max(0, -w));
          p.add('tail', 0, 0, 10 * w);
        },
      },
      peekBack: {
        weight: 1,
        length: [10, 12],
        when: this.still,
        start: () => {
          this.spec.speed = 1.3;
          this.did = 0;
          this.amble(3, 0.95, Math.random() < 0.5 ? -1 : 1);
        },
        pose: (t) => {
          // At the back wall he peers out, one way and the other, then strolls home.
          const at = this.depth > 0.85 && !this.walking;
          if (at && !this.did) this.did = t;
          const look = at ? span(t - this.did, 0, 0.5, 4.5, 5) : 0;
          this.puppet.add('head', -8 * look, 0, 24 * look * sin(t, 0.35));
          this.puppet.add('body', -4 * look);
          if (this.did && t - this.did > 5 && this.depth > 0.5) this.walkTo(this.s, 0.2);
          this.expression = look > 0.3 ? 'focused' : 'neutral';
        },
      },
      lookOver: {
        weight: 1,
        length: [8, 10],
        when: this.still,
        start: () => {
          this.spec.speed = 1.3;
          this.did = 0;
          this.amble(2, 0);
        },
        pose: (t) => {
          // At the front lip he leans right out and looks down at the page below.
          const at = this.depth < 0.05 && !this.walking;
          if (at && !this.did) this.did = t;
          const k = at ? span(t - this.did, 0, 0.7, 3.4, 4.2) : 0;
          this.puppet.add('body', 18 * k);
          this.puppet.add('head', 14 * k, 26 * sin(t, 0.4) * k);
          this.puppet.add('tail', 24 * k);
          this.wingsOut(0.1 * k);
          if (this.did && t - this.did > 4.3) this.walkTo(this.s, 0.25);
          this.expression = k > 0.3 ? 'surprised' : 'neutral';
        },
      },
      flapHop: {
        weight: 0.9,
        length: [2.4, 3],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // Two big flapping hops on the spot, wings beating for balance.
          const beat = t % 1.2;
          const air = beat < 0.8 ? Math.abs(Math.sin((Math.PI * beat) / 0.4)) : 0;
          this.lift = this.heightPx * 0.34 * air;
          this.tucked = air;
          this.wingsOut(0.9 * air, 25 * air * sin(t, 3.5), 1);
          this.puppet.add('body', -8 * air);
          this.puppet.add('tail', 16 * air);
        },
      },
    };
  }

  // ---------- Showing off ----------

  private shows(): Record<string, Act> {
    return {
      headBob: {
        weight: 1.6,
        length: [5, 7],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // The head-bob dance to a beat: knees bending, head down-up-down, the tail
          // wagging, the crest kicking, the lights chasing along the beat.
          const p = this.puppet;
          const k = span(t, 0.3, 0.8, this.actLength - 0.8, this.actLength - 0.3);
          const beat = Math.sin(2 * Math.PI * 2 * t);
          p.add('head', 22 * beat * k, 0, 6 * sin(t, 1) * k);
          p.add('body', -8 * Math.abs(beat) * k + 5 * k);
          p.add('leg.L', -14 * Math.max(0, beat) * k);
          p.add('leg.R', -14 * Math.max(0, -beat) * k);
          p.add('tail', 0, 0, 16 * sin(t, 1) * k);
          this.crestUp = 0.5 * k * (beat > 0 ? 1 : 0.4);
          this.wingsOut(0.15 * k);
          this.light = 'dance';
          this.lightT = t;
          this.glow = k;
        },
      },
      crestFlash: {
        weight: 1.2,
        length: [2.2, 2.8],
        face: 'surprised',
        when: this.still,
        pose: (t) => {
          // Head up, crest flung wide and flashing, twice.
          const k = span(t, 0.2, 0.4, 1.7, 2.1);
          this.crestUp = 1.2 * k;
          this.puppet.add('head', -14 * k);
          this.puppet.add('body', -6 * k);
          this.light = 'flash';
          this.glow = k * (Math.sin(t * 22) > -0.3 ? 1 : 0.2);
        },
      },
      wingDisplay: {
        weight: 1.1,
        length: [4.4, 5.4],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // Both wings out wide and the tail fanned: here are my colours.
          const k = span(t, 0.3, 1.1, this.actLength - 1.4, this.actLength - 0.3);
          this.wingsOut(1.05 * k, 3 * k * sin(t, 1.4), 1);
          this.tailFan = k;
          this.crestUp = 0.8 * k;
          this.puppet.add('body', -12 * k);
          this.puppet.add('head', -10 * k, 25 * sin(t, 0.3) * k, 0);
          this.puppet.add('tail', 18 * k);
          this.light = 'rainbow';
          this.lightT = t;
          this.glow = k;
        },
      },
      pirouette: {
        weight: 1,
        length: [4.2, 4.6],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // A pirouette on one foot's worth of pride, tail fanned, lights whirling.
          this.spin = 2 * Math.PI * ease(t, 0.5, 3.3);
          const k = span(t, 0.3, 0.7, 3.6, 4);
          this.wingsOut(0.35 * k, 0, 1);
          this.tailFan = k;
          this.crestUp = 0.7 * k;
          this.puppet.add('body', -6 * k);
          this.puppet.add('head', 6 * k);
          this.light = 'rainbow';
          this.lightT = t * 1.5;
          this.glow = 1;
        },
      },
      preenTail: {
        weight: 1.1,
        length: [5, 6.4],
        when: this.still,
        start: () => (this.dir = Math.random() < 0.5 ? -1 : 1),
        pose: (t) => {
          // Twists right round to nibble along one long tail feather, one plate at a time.
          const p = this.puppet;
          const k = span(t, 0.3, 1, 4.2, 5);
          const nib = Math.max(0, sin(t, 3.5)) * k;
          p.add('body', 10 * k, this.dir * 22 * k, 0);
          p.add('head', 40 * k + 5 * nib, this.dir * 120 * k + this.dir * 6 * sin(t, 0.7) * k, 0);
          p.add('jaw', 9 * nib);
          p.add('tail', 0, this.dir * -30 * k, this.dir * 10 * k);
          this.tailFan = 0.5 * k;
          this.expression = k > 0.5 ? 'sleepy' : 'neutral';
        },
      },
      bow: {
        weight: 0.9,
        length: [3.4, 4],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          const k = span(t, 0.2, 0.9, 2.1, 2.9);
          this.puppet.add('body', 40 * k);
          this.puppet.add('head', 22 * k);
          this.puppet.add('tail', 28 * k);
          this.wingsOut(0.4 * k, 0, 1);
          this.crestUp = 0.8 * k;
          this.glow = k;
        },
      },
    };
  }

  // ---------- Chatter ----------

  private chatter(): Record<string, Act> {
    return {
      talk: {
        weight: 2,
        length: [4, 6],
        face: 'happy',
        when: () => this.still() || this.hangs_(),
        pose: (t) => {
          // Chatter: the beak going, the head nodding along, the dots of light popping
          // out in front of it in turn.
          const k = span(t, 0.2, 0.5, this.actLength - 0.6, this.actLength - 0.2);
          const flap = Math.max(0, sin(t, 3.6)) * pulse(t, 1.3, 0.9);
          this.puppet.add('jaw', 24 * flap * k);
          this.puppet.add('head', 6 * flap * k - 3 * k, 12 * sin(t, 0.5) * k, 8 * sin(t, 0.9) * k);
          this.talking = k * pulse(t, 1.3, 0.9);
          this.talkT = t;
          this.crestUp = 0.25 * flap * k;
        },
      },
      whistle: {
        weight: 1.1,
        length: [3, 3.6],
        face: 'love',
        when: this.still,
        pose: (t) => {
          // A wolf whistle: head rising with the note, the beak pursed, every light
          // sweeping up the wing and down again, then a satisfied wink.
          const up = ease(t, 0.3, 1.3) * (1 - ease(t, 1.5, 2.2));
          this.puppet.add('head', -20 * up + 8 * ease(t, 1.5, 2.0) * (1 - ease(t, 2.0, 2.4)));
          this.puppet.add('body', -8 * up);
          this.puppet.add('jaw', 6 * up);
          this.talking = span(t, 0.4, 0.5, 1.9, 2.1);
          this.talkT = t * 1.6;
          this.crestUp = 0.9 * up;
          this.light = 'whistle';
          this.lightT = t;
          this.glow = 1;
          this.expression = t > 2.2 ? 'wink' : 'love';
        },
      },
      copycat: {
        weight: 1.2,
        length: [6, 8],
        when: () => this.still() && this.mates().length > 0,
        pose: (t) => {
          // Copies a crewmate's sound and moves: his head and body do what theirs do,
          // his beak opens with every jerk of theirs, his lights flicker like theirs.
          const m = this.mates()[0];
          if (!m) return;
          const p = this.puppet;
          const k = ease(t, 0, 0.5) * (1 - ease(t, this.actLength - 0.5, this.actLength));
          if (m.puppet.has('head')) {
            const [a, b, c] = m.puppet.current('head');
            p.add('head', a * k, b * k, c * k);
            const speed = Math.abs(a - this.lastHead) * 30;
            this.lastHead = a;
            this.copyLevel += (clamp(speed / 40, 0, 1) - this.copyLevel) * 0.3;
          }
          if (m.puppet.has('body')) {
            const [a, b, c] = m.puppet.current('body');
            p.add('body', a * k, b * k, c * k);
          }
          p.add('jaw', 22 * this.copyLevel * k);
          this.lift = (m.h / m.heightPx) * this.heightPx;
          this.tucked = clamp(this.lift / (this.heightPx * 0.2), 0, 1);
          this.expression = m.face?.expression ?? 'neutral';
          this.talking = this.copyLevel * k > 0.3 ? 1 : 0;
          this.talkT = t;
          this.light = 'copy';
          this.glow = k;
        },
      },
      cackle: {
        weight: 0.8,
        length: [2.8, 3.4],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          const on = span(t, 0.2, 0.5, 2.4, 2.8);
          const clack = Math.max(0, sin(t, 9)) * pulse(t, 0.7, 0.45);
          this.puppet.add('jaw', 26 * clack * on);
          this.puppet.add('body', 6 * on * sin(t, 4.5));
          this.puppet.add('head', -10 * on + 5 * on * sin(t, 4.5, 0.25));
          this.puppet.add('tail', 10 * on * sin(t, 4.5));
          this.wingsOut(0.1 * on);
          this.crestUp = 0.4 * on * clack;
        },
      },
    };
  }

  private talkT = 0;

  // ---------- Little quirks ----------

  private quirks(): Record<string, Act> {
    return {
      sneeze: {
        weight: 0.8,
        length: [3, 3.4],
        when: this.still,
        pose: (t) => {
          // A slow build (head back, crest up, eyes squeezed), then a big ah-choo.
          const build = ease(t, 0.2, 1.5) * (1 - ease(t, 1.5, 1.6));
          const boom = span(t, 1.5, 1.58, 1.8, 2.2);
          this.puppet.add('head', -20 * build + 32 * boom);
          this.puppet.add('body', -6 * build + 14 * boom);
          this.puppet.add('jaw', 12 * build + 34 * boom);
          this.puppet.add('tail', 20 * boom);
          this.crestUp = 1.1 * build * (1 - boom);
          this.wingsOut(0.5 * boom, 12 * boom * sin(t, 8), 1);
          this.lift = this.heightPx * 0.08 * boom;
          this.tucked = boom;
          this.expression = boom > 0.2 ? 'surprised' : build > 0.2 ? 'sleepy' : 'neutral';
          if (boom > 0.9) this.glow = 1;
        },
      },
      yawn: {
        weight: 0.9,
        length: [3.8, 4.4],
        when: this.still,
        pose: (t) => {
          const k = span(t, 0.3, 1.2, 2.8, 3.6);
          this.wingsOut(0.6 * k, 0, 1);
          this.puppet.add('body', -10 * k);
          this.puppet.add('head', -30 * k);
          this.puppet.add('jaw', 42 * k * (0.8 + 0.2 * sin(t, 1.2)));
          this.puppet.add('tail', 16 * k);
          this.crestUp = 0.5 * k;
          this.expression = k > 0.3 ? 'sleepy' : 'neutral';
        },
      },
      peekaboo: {
        weight: 1,
        length: [5.4, 6.4],
        when: this.still,
        pose: (t) => {
          // Hides his face behind a wing, out and in, and finally BOO.
          const p = this.puppet;
          const hide = span(t, 0.3, 0.8, 2.0, 2.4) + span(t, 2.9, 3.3, 4.0, 4.3);
          const boo = span(t, 4.4, 4.5, 4.9, 5.3);
          const side = this.dir;
          p.add(`wing.${side > 0 ? 'L' : 'R'}`, -95 * hide, side * 35 * hide, side * -10 * hide);
          p.add('head', 10 * hide - 12 * boo, side * 32 * hide, 0);
          p.add('body', 6 * hide - 8 * boo);
          p.add('jaw', 30 * boo);
          this.crestUp = 1 * boo;
          this.expression = hide > 0.5 ? 'sleepy' : boo > 0.3 ? 'surprised' : 'happy';
          this.talking = boo > 0.5 ? 1 : 0;
          this.talkT = t;
        },
        start: () => (this.dir = Math.random() < 0.5 ? -1 : 1),
      },
      shy: {
        weight: 0.9,
        length: [4, 5],
        when: this.still,
        pose: (t) => {
          // Turns away, head down and tucked, one toe scuffing at the floor, a peek back.
          const p = this.puppet;
          const k = span(t, 0.3, 1, 3, 3.8);
          const peek = span(t, 1.8, 2.1, 2.6, 2.9);
          p.add('root', 0, this.dir * 55 * k, 0);
          p.add('head', 26 * k - 10 * peek, -this.dir * 60 * peek, 12 * k);
          p.add('body', 14 * k);
          p.add('leg.L', 0, 0, 12 * k * sin(t, 2));
          this.wingsOut(-0.0);
          this.expression = 'sleepy';
          this.glow = 0.5 * k;
        },
        start: () => (this.dir = Math.random() < 0.5 ? -1 : 1),
      },
      nutCrack: {
        weight: 1,
        length: [11, 11],
        when: this.still,
        pose: (t) => this.crackNut(t),
      },
      scratch: {
        weight: 0.8,
        length: [2.6, 3.2],
        when: this.still,
        pose: (t) => {
          const p = this.puppet;
          const up = span(t, 0.2, 0.6, 2.2, 2.6);
          p.add('leg.L', -70 * up + 10 * up * sin(t, 7));
          p.add('body', 0, 0, -8 * up);
          p.add('head', 6 * up, 0, 16 * up);
          p.add('root', 0, 0, -5 * up);
          this.crestUp = 0.5 * up * Math.abs(sin(t, 3.5));
          this.expression = up > 0.5 ? 'sleepy' : 'neutral';
        },
      },
      puzzle: {
        weight: 1,
        length: [5, 6.5],
        face: 'focused',
        when: () => this.still() && this.mates().length > 0,
        start: () => (this.dir = Math.random() < 0.5 ? -1 : 1),
        pose: (t) => {
          // Turned to a crewmate, head tilting one way then the other, a step closer.
          const m = this.mates()[0];
          if (!m) return;
          const toward = Math.sign(m.s - this.s) || 1;
          const k = ease(t, 0, 0.6) * (1 - ease(t, this.actLength - 0.6, this.actLength));
          this.puppet.add('root', 0, toward * 40 * k, 0);
          this.puppet.add('head', 6 * k, -toward * 20 * k, 34 * k * Math.sin(t * 2));
          this.puppet.add('body', 6 * k);
          this.crestUp = 0.3 * k;
        },
      },
      nap: {
        weight: 0.6,
        length: [10, 16],
        face: 'asleep',
        when: this.still,
        pose: (t) => {
          // Head turned back and tucked under a wing, feathers puffed, settled low.
          const k = ease(t, 0, 1.4) * (1 - ease(t, this.actLength - 1.4, this.actLength));
          this.puppet.add('body', 12 * k + 1.5 * sin(t, 0.22));
          this.puppet.add('head', 32 * k, 130 * k, 0);
          this.puppet.add('tail', -8 * k);
          this.tucked = 0.5 * k;
          this.glow = 0.1;
        },
      },
    };
  }

  private crackNut(t: number) {
    // A walnut appears in his beak; he turns it over, holds it against the floor,
    // squeezes (a crack, the halves fall open, the kernel glowing), eats it.
    const p = this.puppet;
    const show = ease(t, 0.4, 0.8) * (1 - ease(t, 9.4, 9.8));
    this.wantNut = show;
    const admire = span(t, 0.9, 1.4, 3.2, 3.8);
    const press = span(t, 3.8, 4.3, 5.8, 6.2);
    const squeeze = Math.max(0, sin(t, 3)) * press * ease(t, 4.3, 5);
    this.nutCrack = ease(t, 6, 6.15);
    this.nutEaten = ease(t, 6.6, 7.2);
    const eat = span(t, 7.2, 7.6, 9.2, 9.6);
    p.add('head', 10 * admire + 40 * press + 6 * squeeze - 12 * eat, 40 * admire * sin(t, 0.5), 0);
    p.add('body', 26 * press + 4 * squeeze);
    p.add('tail', 18 * press);
    p.add('jaw', -4 * press + 18 * Math.max(0, sin(t, 4)) * eat);
    p.add('body', -6 * eat);
    this.glow = this.nutCrack * (1 - this.nutEaten);
    this.expression = t < 3.8 ? 'focused' : t < 6.2 ? 'cross' : 'happy';
    this.crestUp = 0.5 * ease(t, 6, 6.3) * (1 - ease(t, 7.2, 8));
  }

  // ---------- More tricks ----------

  private extras(): Record<string, Act> {
    return {
      beakClick: {
        weight: 1.2,
        length: [3, 4],
        face: 'focused',
        when: () => this.still() || this.hangs_(),
        pose: (t) => {
          // Click-click-click: the beak snaps shut in quick runs, the head ticking along.
          const k = span(t, 0.2, 0.4, this.actLength - 0.5, this.actLength - 0.2);
          const run = pulse(t, 0.9, 0.5);
          const snap = Math.max(0, Math.sin(t * 2 * Math.PI * 6)) * run;
          this.puppet.add('jaw', 14 * snap * k);
          this.puppet.add('head', 4 * snap * k, 8 * sin(t, 0.7) * k, 0);
          this.crestUp = 0.3 * snap * k;
          this.light = 'beep';
          this.lightT = t;
          this.glow = k * run;
        },
      },
      slowBlink: {
        weight: 1.4,
        length: [2.4, 3],
        when: this.still,
        pose: (t) => {
          // A long, slow, smug blink, chin lifted.
          const k = span(t, 0.2, 0.6, 1.9, 2.3);
          this.puppet.add('head', -8 * k, 0, 4 * k);
          this.puppet.add('body', -2 * k);
          this.expression = t > 0.9 && t < 1.7 ? 'asleep' : 'happy';
        },
      },
      listen: {
        weight: 1.3,
        length: [4, 5],
        face: 'focused',
        when: this.still,
        start: () => (this.dir = Math.random() < 0.5 ? -1 : 1),
        pose: (t) => {
          // Head cocked right over to one ear, then the other, crest pricked up.
          const k = span(t, 0.2, 0.6, this.actLength - 0.6, this.actLength - 0.2);
          const side = t < this.actLength / 2 ? this.dir : -this.dir;
          this.puppet.add('head', 4 * k, 0, side * 38 * k);
          this.puppet.add('body', 0, 0, side * 4 * k);
          this.crestUp = 0.7 * k;
          this.glow = 0.25 * k;
        },
      },
      preenSlat: {
        weight: 1,
        length: [5, 6],
        when: this.still,
        start: () => (this.dir = Math.random() < 0.5 ? -1 : 1),
        pose: (t) => {
          // Lifts one wing and runs the beak down its slats, one at a time, lights blinking.
          const p = this.puppet;
          const k = span(t, 0.3, 1.0, this.actLength - 1.2, this.actLength - 0.3);
          const side = this.dir > 0 ? 'L' : 'R';
          const nib = Math.max(0, sin(t, 4)) * k;
          p.add(`wing.${side}`, -30 * k, this.dir * 30 * k, this.dir * -12 * k);
          p.add('head', 34 * k + 5 * nib, this.dir * 80 * k, 0);
          p.add('body', 8 * k, this.dir * 14 * k, 0);
          p.add('jaw', 8 * nib);
          this.expression = k > 0.5 ? 'sleepy' : 'neutral';
          this.light = 'beep';
          this.lightT = t * 1.5;
          this.glow = 0.4 * k;
        },
      },
      alarm: {
        weight: 0.8,
        length: [3, 3.6],
        face: 'surprised',
        when: this.still,
        pose: (t) => {
          // Alarm squawk: wings thrown up, crest bolt upright, three big shrieks, every
          // light flashing.
          const k = span(t, 0.1, 0.3, this.actLength - 0.8, this.actLength - 0.2);
          const shriek = Math.max(0, sin(t, 3)) * pulse(t, 1, 0.7) * k;
          this.wingsOut(1 * k, 6 * shriek, 1, 0.4);
          this.tailFan = k;
          this.crestUp = 1.3 * k;
          this.puppet.add('head', -22 * shriek - 6 * k, 0, 0);
          this.puppet.add('jaw', 40 * shriek);
          this.puppet.add('body', -10 * k + 4 * shriek);
          this.talking = shriek > 0.2 ? 1 : 0;
          this.talkT = t * 2;
          this.lift = this.heightPx * 0.06 * shriek;
          this.tucked = shriek;
          this.light = 'flash';
          this.glow = k;
        },
      },
      tongue: {
        weight: 0.8,
        length: [3, 3.6],
        face: 'happy',
        when: () => this.still() || this.hangs_(),
        pose: (t) => {
          // Beak wide open, head tipped back and wobbling: here, see my little tongue.
          const k = span(t, 0.3, 0.8, this.actLength - 0.8, this.actLength - 0.3);
          this.puppet.add('jaw', 46 * k + 4 * k * sin(t, 4));
          this.puppet.add('head', -22 * k, 10 * k * sin(t, 0.8), 6 * k * sin(t, 1.3));
          this.puppet.add('body', -5 * k);
          this.crestUp = 0.4 * k;
          this.expression = k > 0.3 ? 'wink' : 'happy';
        },
      },
      mimicBeep: {
        weight: 1,
        length: [4.4, 5.4],
        when: () => this.still() && this.mates().length > 0,
        pose: (t) => {
          // Copies a crewmate's beep: three short lit chirps, the beak and lights together,
          // then a proud head shake.
          const k = span(t, 0.2, 0.4, this.actLength - 0.6, this.actLength - 0.2);
          const chirp = t > 0.8 && t < 3.2 ? pulse(t - 0.8, 0.8, 0.3) : 0;
          this.puppet.add('jaw', 18 * chirp * k);
          this.puppet.add('head', -7 * chirp * k, 0, 0);
          this.puppet.add(
            'head',
            0,
            22 * sin(t, 1.6) * ease(t, 3.4, 3.8) * (1 - ease(t, 4.6, 5)),
            0,
          );
          this.talking = chirp;
          this.talkT = t * 2;
          this.crestUp = 0.5 * chirp;
          this.light = 'beep';
          this.lightT = t;
          this.glow = chirp + 0.2 * k;
          this.expression = chirp ? 'happy' : 'neutral';
        },
      },
      hoverFlap: {
        weight: 0.8,
        length: [3, 4],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // A flap-flap hover on the spot: up off the floor, feet dangling, wings a blur.
          const k = span(t, 0.3, 0.9, this.actLength - 0.9, this.actLength - 0.2);
          this.lift = this.heightPx * (0.28 + 0.03 * Math.sin(t * 5)) * k;
          this.tucked = 0.6 * k;
          this.wingsOut(0.95 * k, 30 * k * Math.sin(t * 2 * Math.PI * 4), 1);
          this.puppet.add('body', -10 * k);
          this.puppet.add('tail', 18 * k);
          this.puppet.add('leg.L', 20 * k * sin(t, 1.3));
          this.crestUp = 0.5 * k;
        },
      },
    };
  }

  // ---------- Flights ----------

  private flights(): Record<string, Act> {
    const go = (kind: Kind) => () => {
      this.kind = kind;
      this.flight = 'crouch';
      this.goal = null;
      this.depthGoal = this.depth;
      this.dir = Math.random() < 0.5 ? -1 : 1;
      this.did = 0;
    };
    const ready = () => this.still() && this.state === 'here';
    return {
      circuit: {
        weight: 1.2,
        length: [200, 200],
        face: 'happy',
        when: ready,
        start: go('circuit'),
      },
      flyover: { weight: 1, length: [200, 200], face: 'happy', when: ready, start: go('flyover') },
      lookout: {
        weight: 1,
        length: [200, 200],
        face: 'focused',
        when: ready,
        start: go('lookout'),
      },
      goHang: { weight: 1.4, length: [200, 200], face: 'happy', when: ready, start: go('ceiling') },
    };
  }

  private clearSpot(want: number, frame: Frame, edge: 'bottom' | 'top' = 'bottom'): number {
    const [lo, hi] = this.span(frame);
    const half = this.footprint(frame).x;
    let x = clamp(want, lo + half * 2, hi - half * 2);
    for (let i = 0; i < 14; i++) {
      const ok = (this.env?.crew ?? []).every(
        (o) =>
          o === this ||
          o.state === 'gone' ||
          o.free ||
          o.edge !== edge ||
          Math.abs(o.s - x) > (o.footprint(frame).x + half) * 1.6,
      );
      if (ok) break;
      x = clamp(want + (Math.random() - 0.5) * this.heightPx * 9, lo + half * 2, hi - half * 2);
    }
    return x;
  }

  /** Where the pivot goes for feet at a point on the ceiling (turned over) or floor. */
  private ceilingAir(x: number, frame: Frame) {
    return { x, y: frame.top + 2 * MIDDLE * this.heightPx };
  }

  private plan(frame: Frame, at: { x: number; y: number }) {
    const H = this.heightPx;
    const floor = frame.bottom;
    const [lo, hi] = this.span(frame);
    const margin = H * 1.6;
    const room = (this.dir > 0 ? hi - at.x : at.x - lo) - margin;
    if (room < H * 3) this.dir = -this.dir;
    const far = (a: number, b: number) =>
      at.x +
      this.dir *
        Math.min(
          H * (a + Math.random() * (b - a)),
          Math.max(0, (this.dir > 0 ? hi - at.x : at.x - lo) - margin),
        );
    const land = (x: number, d: number): Waypoint => ({
      x: this.clearSpot(x, frame),
      y: floor,
      d,
      mode: 'glide',
      v: 4,
    });
    const up = (dy: number) => at.y - H * dy;
    const route: Waypoint[] = [];
    switch (this.kind) {
      case 'flyover': {
        const x1 = far(6, 11);
        route.push({ x: at.x + this.dir * H * 0.6, y: up(2.4), d: 0.3, mode: 'climb', v: 3.6 });
        route.push({ x: (at.x + x1) / 2, y: up(3.6), d: 0.5, mode: 'glide', v: 4 });
        route.push({ x: x1 - this.dir * H * 1.5, y: up(1.6), d: 0.25, mode: 'glide', v: 4 });
        route.push(land(x1, 0.15 + Math.random() * 0.4));
        break;
      }
      case 'circuit': {
        // Once right round the box: out to the far end, back along the back wall,
        // forward again over the floor, and down where he started.
        const far1 = this.dir > 0 ? hi - margin : lo + margin;
        const near = this.dir > 0 ? lo + margin * 1.5 : hi - margin * 1.5;
        route.push({ x: at.x + this.dir * H * 0.8, y: up(2.6), d: 0.3, mode: 'climb', v: 3.4 });
        route.push({ x: far1, y: up(3.6), d: 0.4, mode: 'glide', v: 4 });
        route.push({ x: far1 - this.dir * H * 1.5, y: up(4.2), d: 0.95, mode: 'glide', v: 3.4 });
        route.push({ x: (far1 + near) / 2, y: up(4.4), d: 0.95, mode: 'glide', v: 4 });
        route.push({ x: near, y: up(3.8), d: 0.6, mode: 'glide', v: 4 });
        route.push({ x: near + this.dir * H * 1.5, y: up(3.2), d: 0.15, mode: 'glide', v: 4 });
        route.push({ x: (near + at.x) / 2, y: up(2.4), d: 0.15, mode: 'glide', v: 4 });
        route.push(land(at.x, 0.2));
        break;
      }
      case 'lookout': {
        // To the back wall, to hover there at a window and look out.
        const x1 = clamp(at.x + this.dir * H * 3, lo + margin, hi - margin);
        route.push({ x: at.x + this.dir * H * 0.5, y: up(2.6), d: 0.5, mode: 'climb', v: 3.4 });
        route.push({ x: x1, y: up(3.4), d: 0.97, mode: 'climb', v: 3, wait: 0 });
        route.push({ x: x1, y: up(3.4), d: 0.97, mode: 'hover', v: 1, wait: 5.5 });
        route.push({ x: x1 - this.dir * H * 1.5, y: up(2.2), d: 0.3, mode: 'glide', v: 3.6 });
        route.push(land(x1 - this.dir * H * 2.6, 0.15));
        break;
      }
      case 'ceiling': {
        // Up to the ceiling, turning over on the way, to land hanging by his feet.
        const x1 = this.clearSpot(
          clamp(at.x + this.dir * H * 3, lo + margin, hi - margin),
          frame,
          'top',
        );
        route.push({ x: at.x + this.dir * H * 0.8, y: up(2.6), d: 0.2, mode: 'climb', v: 3.4 });
        route.push({ x: (at.x + x1) / 2, y: frame.top + H * 2.6, d: 0.1, mode: 'climb', v: 3.6 });
        route.push({ x: x1, y: frame.top + H * 1.8, d: 0, mode: 'glide', v: 3, flip: true });
        route.push({ ...this.ceilingAir(x1, frame), d: 0, mode: 'flare', v: 2, flip: true });
        break;
      }
      case 'drop': {
        const x1 = this.clearSpot(at.x + this.dir * H * 3, frame);
        route.push({ x: at.x, y: at.y + H * 1.6, d: 0.2, mode: 'drop', v: 3.4 });
        route.push({ x: (at.x + x1) / 2, y: floor - H * 2.5, d: 0.3, mode: 'glide', v: 3.6 });
        route.push(land(x1, 0.2));
        break;
      }
    }
    this.route = route;
    this.depthGoal = route[0].d ?? this.depth;
  }

  private takeOff(env: Env) {
    this.h = 0;
    this.lift = 0;
    const H = this.heightPx;
    let at = this.frontFoot(env.frame);
    if (this.edge === 'top') {
      // Let go of the ceiling: the pivot is a little below where the feet were.
      at = this.ceilingAir(at.x, env.frame);
      this.free = { x: at.x, y: at.y, tilt: Math.PI };
      this.tilt.snap(Math.PI);
      this.vel = { x: 0, y: H * 0.5 };
      this.edge = 'bottom';
    } else {
      this.free = { x: at.x, y: at.y, tilt: 0 };
      this.tilt.snap(0);
      this.vel = { x: 0, y: -H * 3 };
    }
    this.flight = 'air';
    this.plan(env.frame, at);
    this.puppet.kick('body', -240);
    this.puppet.kick('head', 160);
  }

  private touchDown() {
    const at = this.free!;
    const ceiling = this.kind === 'ceiling';
    this.free = null;
    this.s = at.x;
    this.h = 0;
    this.goal = null;
    this.vel = { x: 0, y: 0 };
    this.route = [];
    this.flight = 'no';
    this.spin = 0;
    this.hung = 0;
    if (ceiling) {
      this.edge = 'top';
      this.depth = this.depthGoal = 0;
      this.tilt.snap(0);
      this.puppet.kick('body', 120);
      this.puppet.kick('tail', 200);
      this.setAct('idle');
      return;
    }
    this.edge = 'bottom';
    this.depthGoal = this.depth;
    this.tilt.snap(0);
    this.puppet.kick('body', 260);
    this.puppet.kick('head', -180);
    this.puppet.kick('tail', 200);
    this.setAct('idle');
    if (this.exiting) {
      this.exiting = false;
      super.leave();
    }
  }

  leave() {
    if (this.state !== 'here') return super.leave();
    if (this.edge === 'top' && !this.free && this.flight === 'no') {
      // Off the ceiling first.
      this.exiting = true;
      this.acts.drop.start?.();
      this.setAct('drop');
      return;
    }
    if (this.flight === 'no') return super.leave();
    this.exiting = true;
    if (this.free && this.env && this.kind !== 'ceiling') {
      const H = this.heightPx;
      this.route = [
        { x: this.free.x, y: this.env.frame.bottom - H * 1.5, d: 0.2, mode: 'glide', v: 3.4 },
        {
          x: this.clearSpot(this.free.x, this.env.frame),
          y: this.env.frame.bottom,
          d: 0.2,
          mode: 'glide',
          v: 3.4,
        },
      ];
    }
  }

  protected onEnter() {
    this.flight = 'no';
    this.free = null;
    this.exiting = false;
    this.route = [];
    this.wings.snap(0);
    this.spec.turn = 40;
    this.did = 0;
  }

  protected move(dt: number, env: Env) {
    this.env = env;
    if (!this.free) {
      if (this.flight === 'crouch' && this.actT > 0.6) this.takeOff(env);
      else if (this.edge === 'top' && this.flight === 'no') {
        this.hung += dt;
        this.depthGoal = this.depth = 0;
      }
      return super.move(dt, env);
    }
    const pos = this.free;
    const H = this.heightPx;
    const wp = this.route[0];
    const last = this.route.length === 1;
    const maxSpeed = H * (wp?.v ?? 4);
    let ax = 0;
    let ay = 0;
    if (wp) {
      this.depthGoal = wp.d ?? this.depthGoal;
      const dx = wp.x - pos.x;
      const dy = wp.y - pos.y;
      const dist = Math.hypot(dx, dy);
      if (dist < (last ? 1.5 : H * 0.9) || (wp.wait !== undefined && dist < H * 0.4)) {
        if (wp.wait && this.wait < wp.wait) {
          this.wait += dt;
        } else {
          this.wait = 0;
          this.route.shift();
          if (!this.route.length) return this.touchDown();
        }
      } else {
        const speed = last ? Math.min(maxSpeed, dist * 2) : maxSpeed;
        ax = ((dx / dist) * speed - this.vel.x) * 3;
        ay = ((dy / dist) * speed - this.vel.y) * 3;
      }
      if (wp.wait && dist < H * 0.4) {
        // Hovering: nearly still, bobbing.
        ax = -this.vel.x * 3;
        ay = -this.vel.y * 3 + H * 2 * Math.sin(env.time * 4);
      }
    }
    const a = Math.hypot(ax, ay);
    const maxAcc = H * 24;
    if (a > maxAcc) [ax, ay] = [(ax / a) * maxAcc, (ay / a) * maxAcc];
    this.vel.x += ax * dt;
    this.vel.y += ay * dt;
    pos.x += this.vel.x * dt;
    pos.y += this.vel.y * dt;
    if (this.kind !== 'ceiling') pos.y = Math.min(pos.y, env.frame.bottom);
    else pos.y = Math.max(pos.y, env.frame.top + H * 0.2);
    // Upright, leaning into the way he's going; turned over for the ceiling.
    const lean = clamp(-this.vel.x / (H * 6), -1, 1) * 0.3;
    const over = wp?.flip ? Math.PI : 0;
    pos.tilt = this.tilt.update(dt, over + (over ? 0 : lean));
    this.heading.update(dt, clamp(this.vel.x / (H * 6), -1, 1) * 40);
  }

  // ---------- Hanging from the ceiling ----------

  private hangs(): Record<string, Act> {
    const hung = this.hangs_;
    return {
      swing: {
        weight: 2,
        length: [4, 6],
        face: 'happy',
        when: hung,
        pose: (t) => {
          // Swinging like a pendulum from his feet, the tail and wings streaming.
          const k = ease(t, 0, 0.8);
          const s = Math.sin(t * 2.4) * k;
          this.puppet.add('root', 0, 0, 24 * s);
          this.puppet.add('body', 0, 0, 10 * s);
          this.puppet.add('tail', 0, 0, -20 * s);
          this.puppet.add('tail', 30 * k);
          this.wingsOut(0.3 * k, 0, 1);
          this.crestUp = 0.5 * k;
        },
      },
      oneFoot: {
        weight: 1.4,
        length: [4, 5],
        face: 'surprised',
        when: hung,
        pose: (t) => {
          // Lets go with one foot and waves it about; look, no claws!
          const k = span(t, 0.3, 0.8, 3.2, 3.8);
          this.puppet.add('leg.R', 50 * k + 12 * k * sin(t, 2.5), 0, -30 * k);
          this.puppet.add('body', 0, 0, 8 * k * sin(t, 0.8));
          this.puppet.add('head', 0, 0, 10 * k);
          this.puppet.add('tail', 25 * k);
          this.wingsOut(0.5 * k, 0, 1);
          this.talking = span(t, 1.2, 1.3, 3, 3.2);
          this.talkT = t;
        },
      },
      cloak: {
        weight: 1.1,
        length: [5, 6],
        face: 'sleepy',
        when: hung,
        pose: (t) => {
          // Wraps himself up in his wings like a bat, head tucked in, swaying a little.
          const k = ease(t, 0, 1) * (1 - ease(t, this.actLength - 1, this.actLength));
          this.wingsOut(-0.3 * k);
          this.wingLift -= 1.5 * k;
          this.cloakK = k;
          this.puppet.add('head', 22 * k);
          this.puppet.add('root', 0, 0, 4 * k * sin(t, 0.3));
          this.puppet.add('tail', 30 * k);
        },
      },
      ceilClimb: {
        weight: 1.5,
        length: [5, 6.4],
        face: 'focused',
        when: hung,
        start: () => {
          // Beak, foot, foot, beak: hooking the line ahead and pulling himself along.
          const [lo, hi] = this.env ? this.span(this.env.frame) : [0, 1];
          const way = this.s - lo > hi - this.s ? -1 : 1;
          this.dir = Math.random() < 0.3 ? -way : way;
          this.spec.speed = 0.35;
          this.spec.turn = 0;
          this.walkTo(this.s + this.dir * this.heightPx * (1 + Math.random()));
        },
        pose: (t) => {
          const p = this.puppet;
          const w = Math.sin(this.gait * 1.2);
          const k = this.walking ? 1 : 0.3;
          p.add('body', 0, 0, this.dir * 28 * w * k);
          p.add('head', 0, 0, this.dir * (30 + 22 * w) * k);
          p.add('jaw', 14 * Math.max(0, w) * k);
          p.add('leg.L', 0, 0, this.dir * 25 * Math.max(0, -w) * k);
          p.add('leg.R', 0, 0, -this.dir * 25 * Math.max(0, w) * k);
          p.add('tail', 30);
          this.wingsOut(0.15 * k);
        },
      },
      hangBeak: {
        weight: 1.2,
        length: [6, 7],
        face: 'happy',
        when: hung,
        pose: (t) => {
          // Hooks his beak over the ceiling line, lets go with both feet and dangles.
          const k = span(t, 0.2, 1.5, this.actLength - 1.6, this.actLength - 0.3);
          this.hangBeak = k;
          this.puppet.add('tail', 40 * k);
          this.wingsOut(0.2 * k, 0, 1);
          this.puppet.add('leg.L', 30 * k, 0, 10 * k);
          this.puppet.add('leg.R', 30 * k, 0, -10 * k);
          this.puppet.add('root', 0, 0, 6 * k * sin(t, 0.6));
          this.crestUp = 0.4 * k;
        },
      },
      hangTalk: {
        weight: 1,
        length: [4, 5],
        face: 'happy',
        when: hung,
        pose: (t) => {
          const k = span(t, 0.2, 0.5, this.actLength - 0.6, this.actLength - 0.2);
          const flap = Math.max(0, sin(t, 3.6)) * pulse(t, 1.3, 0.9);
          this.puppet.add('jaw', 24 * flap * k);
          this.puppet.add('root', 0, 0, 6 * sin(t, 0.4) * k);
          this.talking = k * pulse(t, 1.3, 0.9);
          this.talkT = t;
          this.puppet.add('tail', 30);
        },
      },
      drop: {
        weight: 0,
        length: [200, 200],
        face: 'surprised',
        start: () => {
          this.kind = 'drop';
          this.flight = 'air';
          this.dir = Math.random() < 0.5 ? -1 : 1;
          this.goal = null;
          this.pendingDrop = true;
        },
      },
    };
  }

  private cloakK = 0;
  private pendingDrop = false;

  // ---------- Reactions ----------

  private reactions(): Record<string, Act> {
    return {
      poked: {
        weight: 0,
        length: [1.8, 2],
        face: 'surprised',
        pose: (t) => {
          // Straight up in the air, wings flung out, a squawk, everything flashing.
          const up = t < 0.6 ? Math.sin((Math.PI * t) / 0.6) : 0;
          this.lift = this.heightPx * 0.4 * up * (this.edge === 'bottom' ? 1 : 0);
          this.tucked = up;
          this.wingsOut(0.9 * span(t, 0, 0.1, 0.9, 1.5), 12 * up * sin(t, 8), 1);
          this.puppet.add('jaw', 42 * span(t, 0.05, 0.15, 0.5, 0.7));
          this.puppet.add('head', -14 * span(t, 0.05, 0.2, 0.5, 0.9));
          this.crestUp = 1.3 * span(t, 0, 0.1, 0.9, 1.6);
          this.talking = span(t, 0.1, 0.2, 0.8, 1);
          this.talkT = t * 2;
          this.light = 'flash';
          this.glow = span(t, 0, 0.1, 0.8, 1.5);
          if (this.edge === 'top')
            this.puppet.add('root', 0, 0, 20 * Math.sin(t * 9) * (1 - t / 1.8));
        },
      },
      dizzy: {
        weight: 0,
        length: [3.4, 3.8],
        face: 'dizzy',
        pose: (t) => {
          const k = 1 - ease(t, 2.4, 3.4);
          this.puppet.add(
            'head',
            10 * k * Math.cos(t * 5),
            10 * k * Math.sin(t * 3),
            24 * k * Math.sin(t * 5),
          );
          this.puppet.add('body', 0, 0, 10 * k * Math.sin(t * 5));
          this.puppet.add('root', 0, 0, 8 * k * Math.sin(t * 5));
          this.wingsOut(0.35 * k, 12 * k * Math.sin(t * 10));
          this.crestUp = 0.6 * k * Math.abs(Math.sin(t * 5));
          this.light = 'flash';
          this.glow = 0.7 * k;
        },
      },
      pleased: {
        weight: 0,
        length: [3, 4],
        face: 'love',
        pose: (t) => {
          // Bobbing to the mouse, crest up and flashing.
          const k = ease(t, 0, 0.6) * (1 - ease(t, this.actLength - 0.6, this.actLength));
          this.puppet.add('head', 12 * k * Math.sin(t * 9), 0, 8 * k * sin(t, 1.2));
          this.puppet.add('body', -4 * k);
          this.puppet.add('tail', 0, 0, 12 * k * sin(t, 2.4));
          this.crestUp = 1.0 * k * (0.6 + 0.4 * Math.sin(t * 12));
          this.light = 'dance';
          this.lightT = t;
          this.glow = k;
        },
      },
    };
  }

  poke() {
    if (this.state !== 'here') return;
    if (this.flight !== 'no' || this.free) return this.puppet.kick('jaw', 900);
    const now = performance.now() / 1000;
    this.pokes = [...this.pokes.filter((at) => now - at < 2.5), now];
    this.goal = null;
    this.spec.turn = 40;
    if (this.pokes.length >= 3) {
      this.pokes = [];
      this.setAct('dizzy');
    } else if (this.act !== 'dizzy') this.setAct('poked');
  }

  // ---------- Posing ----------

  private wingsOut(open: number, flap = 0, fan = -1, lift = 0) {
    this.wingOpen += open;
    this.wingFlap += flap;
    this.wingFan = Math.max(this.wingFan, fan < 0 ? Math.max(0, open) * 0.8 : fan);
    this.wingLift += lift * open;
  }

  protected idle(t: number) {
    const p = this.puppet;
    this.lift = 0;
    this.tucked = 0;
    this.spin = 0;
    this.glow = 0;
    this.light = 'rest';
    this.lightT = 0;
    this.crestUp = 0;
    this.tailFan = 0;
    this.talking = 0;
    this.wantNut = 0;
    this.nutCrack = 0;
    this.nutEaten = 0;
    this.hangBeak = 0;
    this.cloakK = 0;
    this.expression = this.hovered ? 'happy' : 'neutral';
    this.wingOpen = this.wingFlap = this.wingFan = this.wingLift = 0;
    if (this.act !== 'shuffle' && this.act !== 'strut' && this.act !== 'ceilClimb')
      this.spec.turn = 40;
    if (!['strut', 'shuffle', 'peekBack', 'lookOver', 'ceilClimb'].includes(this.act))
      this.spec.speed = 1.1;
    p.add('body', 1.5 * sin(t, 0.3));
    // A head that is never quite still, cocking now and then.
    const n = Math.floor(t / 2.6);
    const r = Math.abs(Math.sin(n * 91.7)) * 2;
    const hold = r > 1.0 && t % 2.6 < 1.2 ? Math.sign(Math.sin(n * 13.1)) : 0;
    p.add('head', 2 * sin(t, 0.35), 3 * sin(t, 0.13), 12 * hold * Math.min(1, (t % 2.6) * 6));
    p.add('tail', 2 * sin(t, 0.45));
    p.add('tail', 0, 0, 3 * sin(t, 0.31));
    p.add('wing.L', 0, 0, 1.5 * sin(t, 0.21));
    p.add('wing.R', 0, 0, 1.5 * sin(t, 0.21, 0.4));
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    const act = this.act;
    this.env = env;

    this.hover = this.hovered ? this.hover + dt : 0;
    if (this.hover > 0.9 && act === 'idle' && this.grounded && this.edge === 'bottom')
      this.setAct('pleased');

    const flying = !!this.free;
    const mode: Mode = this.route[0]?.mode ?? 'glide';
    const H = this.heightPx;
    const pace = this.stride;

    // Hung long enough: down he goes.
    if (this.edge === 'top' && this.grounded && this.hung > 14 && act === 'idle')
      this.setAct('drop');
    if (this.pendingDrop && !this.free) {
      this.pendingDrop = false;
      this.takeOff(env);
    }

    if (this.flight === 'crouch') {
      // Down low, wings coming up, then off.
      const k = ease(this.actT, 0, 0.55);
      p.add('body', 22 * k);
      p.add('head', -12 * k);
      p.add('leg.L', -30 * k);
      p.add('leg.R', -30 * k);
      this.wingsOut(0.5 * k, 0, 1);
      p.add('tail', 12 * k);
      this.crestUp = 0.6 * k;
    } else if (flying) {
      this.flapping(mode);
    } else if (this.tucked > 0.02) {
      p.add('leg.L', 34 * this.tucked);
      p.add('leg.R', 34 * this.tucked);
    } else if (pace > 1 && this.act !== 'shuffle' && this.act !== 'ceilClimb') {
      // The waddle: a step for each foot, the body rolling over each in turn, the head
      // bobbing, the long tail swinging against the roll.
      const amt = clamp(pace / (H * 1.1), 0, 1);
      const step = Math.sin(this.gait);
      p.add('leg.L', 26 * step * amt);
      p.add('leg.R', -26 * step * amt);
      p.add('body', 0, 0, 7 * Math.cos(this.gait) * amt);
      p.add('body', -2 * amt + 2 * Math.cos(this.gait * 2) * amt);
      p.add('head', 6 * Math.cos(this.gait * 2) * amt, 0, -5 * Math.cos(this.gait) * amt);
      p.add('tail', 0, 0, -10 * Math.cos(this.gait) * amt);
    }
    this.h = flying ? 0 : this.lift;

    // Hanging: the tail and wings fall toward the floor (his own up), the crest with them.
    if (this.edge === 'top' && !flying) {
      p.add('tail', 26);
      this.wingsOut(0.06);
    }

    // The crest.
    this.crest.update(dt, this.crestUp);
    // The tail feathers part for show, or close to dive.
    const fan = flying ? (mode === 'flare' || mode === 'glide' ? 0.8 : 0.3) : this.tailFan;
    const spread = this.tail.update(dt, fan);
    for (const [sfx, side] of SIDES) p.add(`tail.${sfx}`, 0, -side * 26 * spread, 0);

    const open = this.wings.update(dt, clamp(this.wingOpen, -0.3, 1.2));
    for (const [sfx, side] of SIDES) {
      const w = `wing.${sfx}`;
      p.add(w, 40 * open + this.wingLift * 40, -side * 78 * open, 0);
      const fanAmt = clamp(this.wingFan, 0, 1);
      for (let k = 1; k <= 5; k++)
        p.add(`${w}.${k}`, -(k - 1) * 5.5 * fanAmt, side * (k - 1) * 8 * fanAmt, 0);
    }
    this.hangF.update(dt, this.hangBeak);
  }

  private flapping(mode: Mode) {
    const p = this.puppet;
    p.add('leg.L', 55);
    p.add('leg.R', 55);
    switch (mode) {
      case 'climb':
        p.add('body', 24);
        p.add('head', -12);
        this.wingsOut(1, 0, 1);
        break;
      case 'glide':
        p.add('body', 14);
        p.add('head', -6);
        this.wingsOut(1, 0, 1);
        break;
      case 'hover':
        p.add('body', 30);
        p.add('head', -16);
        p.add('tail', 24);
        p.add('leg.L', -20);
        p.add('leg.R', -20);
        this.wingsOut(1, 0, 1);
        break;
      case 'flare':
        p.add('body', -26);
        p.add('head', 18);
        p.add('leg.L', -95);
        p.add('leg.R', -95);
        this.wingsOut(1.1, 0, 1, 0.1);
        break;
      case 'drop':
        p.add('body', -10);
        this.wingsOut(0.7, 0, 1);
        break;
    }
    this.crestUp = 0.25;
    if (this.kind === 'ceiling' || this.kind === 'circuit') this.light = 'rainbow';
  }

  // ---------- Direct effects ----------

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    const t = env.time;
    const mode: Mode = this.route[0]?.mode ?? 'glide';

    // Big slow wingbeats, quicker than any spring.
    if (this.free) {
      const [rate, amp] = {
        climb: [2.2, 42],
        glide: [0.9, 24],
        hover: [1.7, 40],
        flare: [2.8, 40],
        drop: [1.2, 28],
      }[mode];
      this.beat = amp * Math.sin(2 * Math.PI * rate * t);
      for (const [sfx] of SIDES) p.turn(`wing.${sfx}`, this.beat + (mode === 'climb' ? 8 : 0));
    } else if (this.wingFlap) {
      for (const [sfx] of SIDES) p.turn(`wing.${sfx}`, this.wingFlap);
    }

    // The crest rises.
    const c = this.crest.y;
    p.turn('crest', 75 * c);
    p.stretch('crest', 1 + 0.25 * c, [0, 0, -1], 1);

    // Hanging by his beak: turned right over, his head at the ceiling line.
    const hf = clamp(this.hangF.y, 0, 1.05);
    if (hf > 0.01) {
      p.turn('root', 0, 0, 180 * hf);
      p.shift('root', 0, 0.37 * hf, 0);
    }

    // The walnut: in his beak, cracked, eaten.
    const s = this.nutS.update(dt, this.wantNut);
    const ns = Math.max(0.001, s) * (1 - this.nutEaten * 0.99999);
    p.stretch('nut', ns, [0, 1, 0], ns);
    const gone = Math.max(0.001, 1 - this.nutCrack * 0.999 * ease(this.nutEaten, 0, 0.1) - 0);
    const half = Math.max(
      0.001,
      this.nutCrack ? 1 - this.nutCrack * ease(this.nutEaten, 0, 0.35) : 1,
    );
    void gone;
    p.stretch('nut.a', half, [0, 1, 0], half);
    p.stretch('nut.b', half, [0, 1, 0], half);
    p.shift('nut.a', 0.03 * this.nutCrack, -0.012 * this.nutCrack, 0);
    p.shift('nut.b', -0.03 * this.nutCrack, -0.012 * this.nutCrack, 0);
    p.turn('nut.a', 0, 0, -30 * this.nutCrack);
    p.turn('nut.b', 0, 0, 30 * this.nutCrack);
    if (this.wantNut && s < 0.05) this.nutS.kick(6);

    // The talk dots pop out of the beak in turn.
    this.talkS.forEach((sp, i) => {
      const phase = (this.talkT * 2.6 - i * 0.28) % 1;
      const on = this.talking > 0.3 && phase < 0.72 ? 1 : 0;
      const v = Math.max(0.001, sp.update(dt, on));
      p.stretch(`talk.${i + 1}`, v, [0, 1, 0], v);
    });

    // A pirouette.
    this.pivot.rotation.y = this.spin;

    this.lights(t);
    void ANGLE;
  }

  /** The lights: five along each wing, the tail tips, the crest tips, and the beacon. */
  private lights(t: number) {
    const act = this.act;
    const mode: Mode = this.route[0]?.mode ?? 'glide';
    const tone = this.expression === 'neutral' ? BEACON.happy : BEACON[this.expression];
    const dots: [number, string | undefined][] = [];
    for (let i = 0; i < 7; i++) {
      // i 0-4 wing slats, 5 tail tips, 6 crest tips; position along the whole bird 0..1
      const u = i < 5 ? i / 4 : i === 5 ? 1 : 0;
      let level: number;
      let colour: string | undefined;
      const flash = this.light === 'flash';
      if (this.light === 'dance') {
        // A pulse to the beat running down the wing.
        level =
          0.15 +
          0.85 *
            Math.max(0, Math.cos(2 * Math.PI * (2 * this.lightT - u * 0.4)) ** 3) *
            (0.3 + 0.7 * this.glow);
        colour = RAINBOW[(i + Math.floor(this.lightT * 2)) % RAINBOW.length];
      } else if (this.light === 'whistle') {
        // A sweep up the wing with the note and back down.
        const s = this.lightT < 1.9 ? ease(this.lightT, 0.3, 1.5) : 1 - ease(this.lightT, 1.9, 2.6);
        level = 0.1 + 0.9 * sweep(s, i < 5 ? 4 - i : i === 5 ? -1 : 5, 5);
        colour = BEACON.love;
      } else if (this.light === 'rainbow') {
        level = 1;
        colour = RAINBOW[(i + Math.floor(t * 8)) % RAINBOW.length];
      } else if (flash) {
        level = this.glow * (Math.sin(t * 30 + i * 2) > -0.2 ? 1 : 0.2);
        colour = RAINBOW[(i + Math.floor(t * 9)) % RAINBOW.length];
      } else if (this.light === 'beep') {
        // Short beeps hopping along the lights, one after the other.
        const on = (this.lightT * 5 - i * 0.6) % 3 < 0.9 ? 1 : 0.1;
        level = (0.15 + 0.85 * on) * (0.4 + 0.6 * this.glow);
        colour = BEACON.happy;
      } else if (this.light === 'copy') {
        level = 0.15 + 0.85 * this.copyLevel * (0.5 + 0.5 * Math.sin(t * 20 + i * 1.7));
        colour = tone;
      } else if (this.free) {
        // Running lights along the wing.
        level = 0.2 + 0.8 * Math.max(0, Math.cos(t * 6 - i * 0.9));
        colour = mode === 'flare' ? BEACON.surprised : BEACON.happy;
      } else if (act === 'dizzy') {
        level = Math.random() < 0.5 ? 1 : 0.2;
        colour = RAINBOW[Math.floor(Math.random() * RAINBOW.length)];
      } else if (act === 'nap') {
        level = 0.1 + 0.08 * Math.sin(t * 0.9 - i * 0.3);
      } else if (this.glow > 0) {
        level = this.glow * (0.6 + 0.4 * Math.sin(t * 6 - i));
        colour = tone;
      } else {
        // At rest: a slow ripple down the wing and out along the tail, every so often.
        level = 0.14 + 0.55 * Math.max(0, Math.cos(2 * Math.PI * (t / 5.5 - i * 0.05)) ** 12);
      }
      dots.push([level, colour]);
    }
    dots.forEach(([level, colour], i) => this.outfit.dot(i, level, colour));
    // The beacon: the talk dots and the kernel.
    const beacon =
      this.light === 'whistle' ? BEACON.love : this.wantNut ? '#ffd23a' : (tone ?? '#ffb347');
    this.outfit.beacon(beacon ?? '#ffb347');
  }
}
