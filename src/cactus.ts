import { Color, type Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Act, Character, clamp, type Env } from './character';
import type { Expression, FaceLayout } from './face';
import { sin } from './moves';
import { Spring } from './spring';

/**
 * Burr, the robot cactus: a saguaro column of three fluted capsules in a little pot on
 * wheels, two arms turned up at the elbow, a screen face, a solar panel on the back of
 * his head, and a bud on top. He rolls about the floor of the box and passes the time
 * like a cactus would: dancing a slow sway with both arms, stretching up toward the
 * light (his capsules slide apart, telescope fashion), opening his flower, counting his
 * own spines, sunbathing at the front lip and sulking in the shade at the back wall.
 *
 * His spines are clusters of three pins, lit at the tips, in rows up the column and a
 * group on each arm, and they show how he feels: a slow ripple up the column at rest,
 * warm and glowing when the mouse rests on him (it's his sun: he opens his arms, tips
 * his face up and blooms), rainbow bands in time with his dance, a pink blush when he's
 * shy, a flash of every spine at a sneeze. Three lamps on his pot show how much sun he
 * has had, and the needle of the gauge on his flank how thirsty he is.
 *
 * He looks prickly and knows it. Poke him and his spines flash and bristle, and then he
 * looks guilty, as if he'd pricked you: spines pulled in, hands together, head bowed,
 * a little roll backwards. Poke him three times and he spins round on his wheels and
 * comes out dizzy. He offers hugs nobody wants: he goes over to a crewmate with open
 * arms, the crewmate backs off, and he is a bit sad about it. A tumbleweed of his own
 * rolls through now and then, and he watches it go by.
 */
export const CACTUS_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.32, 0.43],
    [0.68, 0.43],
  ],
  rx: 0.085,
  ry: 0.22,
  line: 0.034,
  mouth: [0.5, 0.74],
};

const WHEELS = ['wheel.FL', 'wheel.FR', 'wheel.BL', 'wheel.BR'];
/** Wheel radius, metres. */
const WHEEL = 0.022;
const DEG = 180 / Math.PI;
/** Spine groups, each with its height up him (0 the pot, 1 the crown): six rows up the
 * column (Dot0..Dot5), then his left arm (Dot6) and right arm (Dot7). */
const HEIGHT = [0, 0.2, 0.4, 0.6, 0.8, 1, 0.72, 0.56];
/** Dots after the spines: three charge lamps on the pot (8..10) and the motes (11). */
const LAMP = 8;
const MOTE_DOT = 11;
/** The bones the spine groups ride on, and how far each scales to hide its spines. */
const SPINES = [
  ['spines.trunk.1', 0.72],
  ['spines.trunk.2', 0.72],
  ['spines.head', 0.72],
  ['spines.L', 0.5],
  ['spines.R', 0.5],
] as const;
/** Petal azimuths round the bud, as built (the first at the back), radians. */
const PETALS = [0, 1, 2, 3, 4].map((k) => Math.PI / 2 + (2 * Math.PI * k) / 5);
const MOTES = 4;
/** Tumbleweed radius, metres. */
const WEED = 0.032;
const ORANGE = '#ff8a3d';
const GOLD = '#ffd76a';
const bump = (x: number, width: number) => Math.max(0, 1 - Math.abs(x) / width);
const cycle = (x: number) => x - Math.floor(x);
/** 0 before a, 1 after b, smooth between. */
const ease = (x: number, a: number, b: number) => {
  const u = clamp((x - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
};
/** Up from a to b, held, down from c to d. */
const span = (t: number, a: number, b: number, c: number, d: number) =>
  ease(t, a, b) * (1 - ease(t, c, d));

type Glow = 'rainbow' | 'flash' | 'warm' | 'dim' | 'chase' | 'sparkle' | 'pulse';

/** What the acts ask for this frame; anything left unset is up to his mood. */
interface Fx {
  face?: Expression;
  bloom?: number;
  /** Spines pulled in (0..1), and bristling out (0..1). */
  tuck: number;
  puff: number;
  /** Capsules slid apart, metres. */
  reach: number;
  /** Body lifted / pot squashed, metres. */
  lift: number;
  crouch: number;
  /** Turn about his own axis, degrees, direct. */
  swing: number;
  /** Extra wheel turn: both sides the same (rolling), or opposite (turning on the spot), degrees. */
  wheelRoll: number;
  wheelTurn: number;
  /** Front wheels off the floor, metres. */
  wheelie: number;
  /** Petals rippling in turn, degrees. */
  ripple: number;
  glow?: Glow;
  tone?: string;
  gauge?: number;
  charge?: number;
  /** The tumbleweed: metres from him along the floor, rolled angle (degrees) and lift. */
  weed: { x: number; roll: number; y: number } | null;
}

const fresh = (): Fx => ({
  tuck: 0,
  puff: 0,
  reach: 0,
  lift: 0,
  crouch: 0,
  swing: 0,
  wheelRoll: 0,
  wheelTurn: 0,
  wheelie: 0,
  ripple: 0,
  weed: null,
});

interface Mote {
  age: number;
  life: number;
  p: [number, number, number];
  v: [number, number, number];
  g: number;
}

export class Cactus extends Character {
  private fx: Fx = fresh();
  /** Spines pulled in (1) or bristling (-1). */
  private tuck = new Spring(2.2, 0.5, 1, 0);
  private bristle = new Spring(5, 0.3, 1, 0);
  private puffs = new Spring(3.4, 0.35, 1, 0);
  /** The flower, 0 a closed bud, 1 wide open. Underdamped, so it pops. */
  private bloom = new Spring(2.4, 0.32, 1, 0);
  /** How far the capsules slide apart, metres. */
  private reach = new Spring(2.6, 0.45, 1, 0);
  private hop = new Spring(3, 0.3);
  private gaugeSpring = new Spring(1.4, 0.7, 1, 0.7);
  private chargeSpring = new Spring(0.8, 0.8, 1, 0.4);
  private tuckNow = 0;
  private bristleNow = 0;
  private puffNow = 0;
  private bloomNow = 0;
  private reachNow = 0;
  private gaugeNow = 0.7;
  private chargeNow = 0.4;
  private beaconColour = new Color('#f4f4f1');
  private wheels = 0;
  private turned = 0;
  private lastPace = 0;
  private pokes: number[] = [];
  private hover = 0;
  /** The arm he's waving or counting on: 1 his left, -1 his right. */
  private side = 1;
  private env: Env | null = null;
  /** Things an act has already done (a sneeze once, not every frame). */
  private did = new Set<string>();
  /** When an act got where it was going (seconds into the act), 0 if not yet. */
  private arrivedAt = 0;
  private motes: Mote[] = Array.from({ length: MOTES }, () => ({
    age: 1,
    life: 0,
    p: [0, 0, 0],
    v: [0, 0, 0],
    g: 0,
  }));
  private moteColour = GOLD;

  constructor(model: Object3D) {
    super(
      {
        name: 'Burr',
        model: 'cactus',
        metres: 0.64,
        width: 0.45,
        size: 1.05,
        feels: {
          default: { f: 2.6, zeta: 0.5 },
          pot: { f: 3, zeta: 0.45 },
          'trunk.1': { f: 1.8, zeta: 0.45 },
          'trunk.2': { f: 2, zeta: 0.4 },
          head: { f: 2.4, zeta: 0.45, r: 0.3 },
          'arm.L': { f: 2.4, zeta: 0.35 },
          'arm.R': { f: 2.4, zeta: 0.35 },
          'fore.L': { f: 2.8, zeta: 0.3 },
          'fore.R': { f: 2.8, zeta: 0.3 },
          gauge: { f: 2.2, zeta: 0.35 },
        },
        face: CACTUS_FACE,
        eyes: 0.77,
        gaze: [
          { bone: 'head', yaw: 0.75, pitch: 0.8 },
          { bone: 'trunk.2', yaw: 0.2, pitch: 0.15 },
        ],
        reach: { yaw: 55, pitch: 25 },
        lag: 1.1,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [40, 90],
        speed: 1.1,
        turn: 70,
      },
      model,
    );
    this.acts = {
      ...this.calm(),
      ...this.showy(),
      ...this.cactusThings(),
      ...this.about(),
      ...this.social(),
      ...this.reactions(),
    };
  }

  // ---------- Helpers ----------

  private still = () => !this.walking && !this.door && this.edge === 'bottom';

  /** Crewmates on the floor near him, nearest first. */
  private mates() {
    return (this.env?.crew ?? [])
      .filter(
        (o) =>
          o !== (this as Character) &&
          o.state === 'here' &&
          o.edge === this.edge &&
          !o.free &&
          !o.door &&
          !o.role,
      )
      .sort((a, b) => Math.abs(a.s - this.s) - Math.abs(b.s - this.s))
      .filter((o) => Math.abs(o.s - this.s) < this.heightPx * 12);
  }

  /** Fades in over `a` seconds and out over the last `b` of the act. */
  private on(t: number, a = 0.4, b = 0.5) {
    return clamp(t / a, 0, 1) * clamp((this.actLength - t) / b, 0, 1);
  }

  /** True the first time it is asked in an act. */
  private once(key: string) {
    if (this.did.has(key)) return false;
    this.did.add(key);
    return true;
  }

  protected setAct(name: string) {
    this.did.clear();
    this.arrivedAt = 0;
    super.setAct(name);
  }

  /** Which side the mouse is on: 1 his left (the viewer's right), -1 his right. */
  private towardMouse() {
    const env = this.env;
    if (!env?.pointer.present) return Math.random() < 0.5 ? 1 : -1;
    return env.pointer.x > this.eyePoint(env.frame).x ? 1 : -1;
  }

  /** A short roll along the floor, and most times further in or out of the box. */
  private amble(heights: number, depth?: number) {
    const way = Math.random() < 0.5 ? -1 : 1;
    let to = this.s + way * this.heightPx * heights * (0.6 + Math.random() * 0.8);
    if (this.env) {
      const [lo, hi] = this.span(this.env.frame);
      to = clamp(to, lo + this.widthPx(), hi - this.widthPx());
    }
    this.walkTo(to, depth);
  }

  /** Both arms up (raise, degrees) with the forearms tipped out (splay). */
  private arms(raise: number, splay: number) {
    const p = this.puppet;
    p.add('arm.L', 0, 0, raise);
    p.add('arm.R', 0, 0, -raise);
    p.add('fore.L', 0, 0, -splay);
    p.add('fore.R', 0, 0, splay);
  }

  /** Arms swung round in front of him, the forearms leaning in till they meet: amount 0..1. */
  private hug(amount: number) {
    const p = this.puppet;
    p.add('arm.L', 0, -50 * amount, -8 * amount);
    p.add('arm.R', 0, 50 * amount, 8 * amount);
    p.add('fore.L', 20 * amount, 0, 42 * amount);
    p.add('fore.R', 20 * amount, 0, -42 * amount);
  }

  /** One arm up and waving: side 1 his left, -1 his right. */
  private waveArm(side: number, k: number, t: number) {
    const p = this.puppet;
    const [arm, fore] = side > 0 ? ['arm.L', 'fore.L'] : ['arm.R', 'fore.R'];
    p.add(arm, 0, 0, side * 30 * k);
    p.add(fore, 0, 0, -side * (15 + 28 * sin(t, 2.2)) * k);
    p.add('head', 0, 0, -side * 6 * k);
  }

  /** A mote of pollen or a drop: where it starts (m, from the bud), its speed, gravity, life. */
  private puffMote(
    p: [number, number, number],
    v: [number, number, number],
    g: number,
    life: number,
    colour?: string,
  ) {
    const free = this.motes.find((m) => m.age >= m.life) ?? this.motes[0];
    Object.assign(free, { age: 0, life, p: [...p], v: [...v], g });
    if (colour) this.moteColour = colour;
  }

  /** Pollen flung out of the flower, every way at once. */
  private burst(colour = GOLD, speed = 0.2) {
    for (let k = 0; k < MOTES; k++) {
      const a = (k / MOTES) * Math.PI * 2 + Math.random() * 0.6;
      this.puffMote(
        [0, 0.02, 0.03],
        [Math.cos(a) * speed, Math.sin(a) * speed * 0.9 + 0.08, 0.05 + Math.random() * 0.1],
        0.25,
        0.9 + Math.random() * 0.4,
        colour,
      );
    }
  }

  // ---------- Acts ----------

  private calm(): Record<string, Act> {
    const p = this.puppet;
    return {
      idle: { weight: 3, length: [3, 6] },
      roll: {
        weight: 1.4,
        length: [2, 4],
        when: this.still,
        start: () => this.amble(1.4),
      },
      // A slow dance: both arms up and swaying together, the column swaying under them.
      sway: {
        weight: 1.2,
        length: [5, 8],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          const beat = sin(t, 0.55);
          p.add('trunk.1', 0, 0, 3 * beat);
          p.add('trunk.2', 0, 0, 4 * sin(t, 0.55, -0.08));
          p.add('head', 3 * Math.abs(sin(t, 0.55, 0.25)), 0, -5 * sin(t, 0.55, -0.16));
          // Arms up, both swinging the same way, the forearms a beat behind.
          this.arms(22, 12);
          const swing = 16 * sin(t, 0.55, -0.1);
          const follow = 20 * sin(t, 0.55, -0.2);
          p.add('arm.L', 0, 0, swing);
          p.add('arm.R', 0, 0, swing);
          p.add('fore.L', 0, 0, follow);
          p.add('fore.R', 0, 0, follow);
          p.shift('root', 0.012 * beat, 0, 0);
          this.fx.bloom = 0.8;
          this.fx.glow = 'rainbow';
        },
      },
      bloom: {
        weight: 1,
        length: [4, 6],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          this.fx.bloom = t < this.actLength - 1 ? 1 : 0;
          this.fx.ripple = 8 * span(t, 0.6, 1.4, this.actLength - 1.6, this.actLength - 1);
          p.add('head', -8 * clamp(t / 0.5, 0, 1), 0, 5 * sin(t, 0.5));
          this.arms(10, 6);
          this.fx.glow = 'sparkle';
        },
      },
      // Up toward the light: capsules sliding apart, arms up, face to the sky.
      stretch: {
        weight: 1,
        length: [3.5, 4.5],
        when: this.still,
        pose: (t) => {
          const up = this.on(t, 1.2, 1);
          p.add('trunk.2', -3 * up);
          p.add('head', -12 * up);
          this.arms(28 * up, 10 * up);
          this.fx.reach = 0.028 * up;
          this.fx.bloom = t > 1.2 && t < this.actLength - 1 ? 1 : 0;
          this.fx.face = up > 0.9 ? 'happy' : 'focused';
          this.fx.glow = 'chase';
          this.fx.tone = BEACON.focused;
        },
      },
      wave: {
        weight: 0.8,
        length: [2.5, 3.5],
        face: 'happy',
        when: this.still,
        start: () => (this.side = this.towardMouse()),
        pose: (t) => this.waveArm(this.side, this.on(t, 0.3, 0.4), t),
      },
      // Shy: arms round himself, rocking from side to side, blushing.
      hug: {
        weight: 0.5,
        length: [3.5, 5],
        face: 'love',
        when: this.still,
        pose: (t) => {
          this.hug(1);
          p.add('trunk.2', 0, 0, 4 * sin(t, 0.7));
          p.add('head', 6, 0, 8 + 4 * sin(t, 0.7, -0.1));
          this.fx.tuck = 0.35;
          this.fx.bloom = 0.2;
        },
      },
      // Counting his spines: head down to one arm, a nod and a blink of it for each.
      count: {
        weight: 0.6,
        length: [4, 5],
        when: this.still,
        start: () => (this.side = Math.random() < 0.5 ? 1 : -1),
        pose: (t) => {
          const s = this.side;
          const on = clamp(t / 0.5, 0, 1) * clamp((this.actLength - 0.8 - t) / 0.5, 0, 1);
          const nod = t > 0.8 && t < this.actLength - 1.2 ? Math.max(0, sin(t - 0.8, 1.4)) : 0;
          p.add('head', (18 + 8 * nod) * on, s * 26 * on, 0);
          p.add(s > 0 ? 'arm.L' : 'arm.R', 0, -s * 55 * on, 0);
          this.fx.face = t > this.actLength - 1.3 ? 'happy' : 'focused';
        },
      },
      nap: {
        weight: 0.6,
        length: [8, 14],
        face: 'asleep',
        when: this.still,
        pose: () => {
          // Drooping: arms down, head bowed, the column slumped, spines half in and dim.
          const env = this.env;
          this.fx.tuck = 0.4;
          this.arms(-38, -55);
          p.add('head', 16 + 2 * sin(env?.time ?? 0, 0.25));
          p.add('trunk.2', 5);
          p.add('trunk.1', 2);
          this.fx.glow = 'dim';
          this.fx.charge = 0.1;
        },
      },
      // Slow and wide: the whole column drawn up, the flower opening like a mouth.
      yawn: {
        weight: 0.6,
        length: [4.5, 5.5],
        when: this.still,
        pose: (t) => {
          const wide = span(t, 0.4, 2.0, 2.6, 3.2);
          this.fx.reach = 0.02 * wide;
          this.fx.bloom = 0.15 + 0.85 * wide;
          this.fx.face = wide > 0.5 ? 'sleepy' : 'neutral';
          p.add('head', -14 * wide);
          this.arms(24 * wide, 20 * wide);
          this.fx.glow = 'dim';
        },
      },
    };
  }

  private showy(): Record<string, Act> {
    const p = this.puppet;
    return {
      // A spiny puff-up: every pin bristling out, arms flung wide, a stern face; then he
      // lets the air out again.
      puffup: {
        weight: 0.7,
        length: [3.4, 4.2],
        when: this.still,
        pose: (t) => {
          const k = span(t, 0.3, 0.8, this.actLength - 1.3, this.actLength - 0.5);
          this.fx.puff = k;
          this.arms(32 * k, 22 * k);
          p.add('head', -6 * k);
          this.fx.reach = 0.012 * k;
          this.fx.face = k > 0.5 ? 'cross' : t > this.actLength - 0.6 ? 'happy' : 'neutral';
          this.fx.glow = k > 0.3 ? 'flash' : undefined;
          this.fx.tone = ORANGE;
          if (t > 0.7 && this.once('pop')) this.bristle.kick(-5);
        },
      },
      // The desert shimmy: shoulders and pot going one way, the top the other.
      shimmy: {
        weight: 0.8,
        length: [3.5, 4.5],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          const k = this.on(t, 0.5, 0.5);
          const beat = sin(t, 2.6);
          p.add('pot', 0, 0, 6 * beat * k);
          p.add('trunk.1', 0, 0, -7 * beat * k);
          p.add('trunk.2', 0, 0, 9 * beat * k);
          p.add('head', 0, 0, -8 * sin(t, 2.6, -0.1) * k);
          p.add('arm.L', 0, 0, (14 + 10 * sin(t, 5.2)) * k);
          p.add('arm.R', 0, 0, (-14 - 10 * sin(t, 5.2, 0.25)) * k);
          p.add('fore.L', 0, 0, 16 * sin(t, 5.2, 0.15) * k);
          p.add('fore.R', 0, 0, 16 * sin(t, 5.2, 0.4) * k);
          p.shift('root', 0.014 * beat * k, 0, 0);
          this.fx.wheelRoll = 30 * beat * k;
          this.fx.bloom = 0.8;
          this.fx.glow = 'rainbow';
        },
      },
      // Flexing: both forearms curled in, pulsing, the spines on them flashing.
      flex: {
        weight: 0.7,
        length: [4, 5],
        when: this.still,
        pose: (t) => {
          const k = this.on(t, 0.5, 0.5);
          const pump = 0.5 + 0.5 * Math.cos(2 * Math.PI * 1.1 * t);
          p.add('arm.L', 0, 0, (16 + 6 * pump) * k);
          p.add('arm.R', 0, 0, -(16 + 6 * pump) * k);
          p.add('fore.L', 0, 0, (30 + 38 * pump) * k);
          p.add('fore.R', 0, 0, -(30 + 38 * pump) * k);
          p.add('head', -6 * k);
          p.add('trunk.2', 0, 0, 2 * sin(t, 1.1) * k);
          this.fx.puff = 0.35 * pump * k;
          this.fx.face = t < 1 ? 'focused' : t < this.actLength - 1 ? 'cross' : 'wink';
          this.fx.glow = 'flash';
          this.fx.tone = GOLD;
        },
      },
      // A slow turn on his wheels, all the way round, arms out like a skirt.
      spin: {
        weight: 0.7,
        length: [5, 6],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          const T = this.actLength - 0.5;
          this.fx.swing = 360 * ease(t, 0.3, T);
          const speed = Math.sin(Math.PI * clamp((t - 0.3) / (T - 0.3), 0, 1));
          this.arms(26 * speed, 14 * speed);
          this.fx.wheelTurn = 200 * speed;
          this.fx.bloom = 1;
          this.fx.ripple = 8 * speed;
          this.fx.glow = 'rainbow';
        },
      },
      // Three little hops in the pot, arms flung up as he goes.
      hop: {
        weight: 0.9,
        length: [2.6, 3.4],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          const u = (t % 0.85) / 0.85;
          const live = Math.floor(t / 0.85) < 3 ? 1 : 0;
          const squat = live * (u < 0.22 ? ease(u, 0, 0.18) : 1 - ease(u, 0.2, 0.3));
          const air = live * (u > 0.22 ? Math.sin(Math.PI * ((u - 0.22) / 0.78)) : 0);
          this.fx.crouch = 0.014 * squat;
          this.fx.lift = 0.08 * air;
          this.arms(30 * air - 10 * squat, 6 * air);
          p.add('trunk.2', 6 * squat - 4 * air);
          p.add('head', -6 * air);
          this.fx.bloom = 0.4 + 0.6 * air;
          if (live && u < 0.03 && t > 0.5 && this.once(`land${Math.floor(t / 0.85)}`)) {
            p.kick('trunk.2', 40);
            this.bristle.kick(-2);
          }
        },
      },
      // Beating time: arms pumping, the column bobbing, the lights stepping in colour.
      groove: {
        weight: 0.7,
        length: [5, 8],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          const k = this.on(t, 0.8, 0.8);
          const bar = Math.sin(2 * Math.PI * 1.1 * t);
          const bounce = Math.abs(bar);
          this.fx.lift = 0.012 * bounce * k;
          p.add('arm.L', 0, 0, (16 + 16 * bar) * k);
          p.add('arm.R', 0, 0, (16 - 16 * bar) * k);
          p.add('fore.L', 0, 0, -10 * bar * k);
          p.add('fore.R', 0, 0, 10 * bar * k);
          p.add('trunk.2', 0, 0, -3 * bar * k);
          p.add('head', 4 * bounce * k, 0, 4 * bar * k);
          this.fx.bloom = 0.6 + 0.4 * bounce * k;
          this.fx.glow = 'rainbow';
        },
      },
      // A twinkle: all his lights running, the flower shimmering, arms held out.
      twinkle: {
        weight: 0.7,
        length: [4, 5.5],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          const k = this.on(t, 0.5, 0.6);
          this.fx.glow = 'sparkle';
          this.fx.bloom = 1.1;
          this.fx.ripple = 10 * k;
          this.arms(18 * k, 20 * k);
          p.add('head', -6 * k, 0, 4 * sin(t, 0.6));
          p.add('trunk.2', 0, 0, 2 * sin(t, 0.6, -0.1));
          if (t > 0.6 && this.once('glitter')) this.burst(GOLD, 0.14);
        },
      },
      // Tips back onto his rear wheels and rolls a little way like that.
      wheelie: {
        weight: 0.5,
        length: [3, 4],
        when: this.still,
        start: () => this.amble(1.3, this.depth),
        pose: (t) => {
          const k = span(t, 0.3, 0.8, this.actLength - 1, this.actLength - 0.4);
          p.add('pot', -14 * k);
          p.add('trunk.1', 12 * k);
          p.add('trunk.2', 4 * k);
          this.arms(34 * k, 6 * k);
          this.fx.wheelie = 0.014 * k;
          this.fx.face = k > 0.5 ? 'surprised' : 'happy';
        },
      },
    };
  }

  /** The things only a cactus does. */
  private cactusThings(): Record<string, Act> {
    const p = this.puppet;
    return {
      // A tumbleweed of his own rolls in one side and out of the other; he watches it by.
      tumbleweed: {
        weight: 0.7,
        length: [7, 8.5],
        when: this.still,
        start: () => (this.side = Math.random() < 0.5 ? 1 : -1),
        pose: (t) => {
          const s = this.side;
          const T = this.actLength;
          const u = clamp((t - 0.6) / (T - 1.4), 0, 1);
          const x = s * (-1.3 + 2.6 * u);
          const going = u > 0 && u < 1;
          this.fx.weed = going
            ? { x, roll: -(x / WEED) * DEG, y: Math.abs(Math.sin(x * 11)) * 0.028 }
            : null;
          const near = bump(x / 0.32, 1);
          const watch = going ? clamp(x / 0.7, -1, 1) : 0;
          p.add('head', 0, 30 * watch, 0);
          p.add('trunk.2', 0, 8 * watch, 0);
          p.add('trunk.1', 0, 3 * watch, 0);
          this.arms(22 * near, 8 * near);
          this.fx.puff = 0.25 * near;
          this.fx.face = near > 0.2 ? 'surprised' : going ? 'focused' : 'happy';
          if (going && Math.abs(x) < 0.3 && this.once('startle')) {
            this.hop.kick(0.35);
            p.kick('trunk.2', 30);
          }
          if (u >= 1) this.waveArm(-s, this.on(t - (T - 1.4), 0.3, 0.6), t);
        },
      },
      // Achoo: a long build-up with the head thrown back, then a sneeze that sets every
      // spine flashing and puffs pollen out of the flower.
      sneeze: {
        weight: 0.6,
        length: [4.4, 5],
        when: this.still,
        pose: (t) => {
          const build = ease(t, 0.3, 1.8) * (1 - ease(t, 1.85, 1.9));
          p.add('head', -22 * build);
          p.add('trunk.2', -8 * build);
          this.fx.bloom = 0.4 + 0.7 * build;
          this.fx.reach = 0.012 * build;
          this.fx.face = t < 1.9 ? 'surprised' : t < 2.4 ? 'cross' : 'neutral';
          this.fx.glow = t > 1.85 && t < 2.9 ? 'flash' : undefined;
          this.fx.tone = '#f4f4f1';
          if (t > 1.85 && this.once('achoo')) {
            p.kick('head', 240);
            p.kick('trunk.2', 90);
            p.kick('pot', 40);
            this.hop.kick(0.6);
            this.bristle.kick(-9);
            this.burst(GOLD, 0.26);
          }
          if (t > 2.8) p.add('head', 0, 0, 5 * sin(t, 1.6));
        },
      },
      // Thirst: the gauge falls, he droops, a drop falls in and he perks up.
      drink: {
        weight: 0.6,
        length: [6.5, 7.5],
        when: this.still,
        pose: (t) => {
          const dry = ease(t, 0.3, 1.6) * (1 - ease(t, 3.2, 3.6));
          this.fx.gauge = t < 3.4 ? 0.7 - 0.55 * dry : 0.15 + 0.85 * ease(t, 3.4, 4.6);
          this.fx.tuck = 0.5 * dry;
          p.add('head', 14 * dry);
          p.add('trunk.2', 5 * dry);
          this.arms(-20 * dry, -20 * dry);
          this.fx.face = t < 3.0 ? 'sad' : t < 4.6 ? 'surprised' : 'happy';
          this.fx.bloom = t < 3.4 ? 0 : 1;
          this.fx.glow = dry > 0.5 ? 'pulse' : t > 3.6 ? 'warm' : undefined;
          this.fx.tone = ORANGE;
          if (t > 2.9 && this.once('rain')) {
            // Rain from nowhere: drops falling onto him.
            for (let k = 0; k < MOTES; k++)
              this.puffMote(
                [(k - 1.5) * 0.03, 0.22 + k * 0.02, 0.05],
                [0, -0.05, 0],
                0.9,
                0.9,
                '#5ec8ff',
              );
          }
          if (t > 3.5 && this.once('perk')) {
            this.hop.kick(0.5);
            p.kick('head', -120);
          }
        },
      },
      // Turns his left side to the front to show off his gauge and its needle.
      checkgauge: {
        weight: 0.6,
        length: [4.6, 5.4],
        when: this.still,
        pose: (t) => {
          const k = this.on(t, 0.9, 0.9);
          this.fx.swing = -90 * k;
          const shown = t > 1.0 && t < this.actLength - 0.9;
          this.fx.gauge = shown ? 0.55 + 0.4 * Math.sin(2 * Math.PI * 0.5 * (t - 1)) : undefined;
          this.fx.face = k > 0.6 ? 'wink' : 'neutral';
          this.fx.glow = shown ? 'chase' : undefined;
          this.fx.tone = GOLD;
          p.add('arm.L', 0, 0, 10 * k);
          p.add('head', 0, 0, -4 * k);
        },
      },
      // Turns his back to show off the solar panel on it, while the lamps on his pot fill.
      charge: {
        weight: 0.6,
        length: [6, 7],
        when: this.still,
        pose: (t) => {
          const k = span(t, 0.3, 1.6, this.actLength - 1.6, this.actLength - 0.3);
          this.fx.swing = 160 * k;
          this.fx.charge = 1;
          this.fx.bloom = 0.9;
          this.arms(24 * k, 14 * k);
          p.add('head', -10 * k);
          this.fx.face = k > 0.6 ? 'happy' : 'neutral';
          this.fx.glow = 'warm';
          this.fx.tone = GOLD;
        },
      },
      // Hides behind his arms, the flower shut, and pops out again.
      hide: {
        weight: 0.5,
        length: [4.4, 5],
        when: this.still,
        pose: (t) => {
          const k = ease(t, 0.3, 0.9) * (1 - ease(t, 2.7, 2.8));
          this.hug(k);
          p.add('head', 18 * k);
          this.fx.tuck = 0.5 * k;
          this.fx.bloom = 0.9 - 0.85 * k;
          this.fx.face = k > 0.5 ? 'love' : t < 3.4 ? 'surprised' : 'happy';
          this.fx.glow = k > 0.5 ? 'dim' : undefined;
          if (t > 2.7 && this.once('boo')) {
            p.kick('arm.L', 0, 200, 60);
            p.kick('arm.R', 0, -200, -60);
            p.kick('head', -140);
            this.hop.kick(0.8);
            this.bristle.kick(-5);
          }
        },
      },
    };
  }

  /** The acts that use the depth of the box. */
  private about(): Record<string, Act> {
    const p = this.puppet;
    return {
      // To the front lip to soak up the sun: head back, arms wide, flower open, lamps full.
      sunbathe: {
        weight: 0.8,
        length: [10, 12],
        when: () => this.still() && this.depth > 0.05,
        start: () => this.walkTo(this.s, 0),
        pose: (t) => {
          const there = this.depth < 0.06 && !this.walking;
          if (there && !this.arrivedAt) this.arrivedAt = t;
          const s = this.arrivedAt ? t - this.arrivedAt : -1;
          const k = s < 0 ? 0 : span(s, 0.4, 1.6, 6, 7);
          this.arms(34 * k, 24 * k);
          p.add('head', -18 * k, 0, 3 * sin(Math.max(s, 0), 0.35));
          p.add('trunk.2', -3 * k);
          this.fx.reach = 0.014 * k;
          this.fx.bloom = 0.2 + 0.9 * k;
          this.fx.charge = k > 0.2 ? 1 : undefined;
          this.fx.face = k > 0.6 ? (s > 3 ? 'sleepy' : 'happy') : 'neutral';
          this.fx.glow = k > 0.3 ? 'warm' : undefined;
          this.fx.tone = GOLD;
          if (s > 7 && this.once('back')) this.walkTo(this.s, 0.15 + Math.random() * 0.3);
        },
      },
      // Rolls to the back wall for shade: spines in, arms low, a sigh of relief.
      shade: {
        weight: 0.6,
        length: [10, 12],
        when: () => this.still() && this.depth < 0.6,
        start: () => this.walkTo(this.s + (Math.random() - 0.5) * this.heightPx, 0.95),
        pose: (t) => {
          const there = this.depth > 0.85 && !this.walking;
          if (there && !this.arrivedAt) this.arrivedAt = t;
          const s = this.arrivedAt ? t - this.arrivedAt : -1;
          const k = s < 0 ? 0 : span(s, 0.4, 1.4, 5, 6);
          this.fx.tuck = 0.45 * k;
          this.arms(-14 * k, -22 * k);
          p.add('head', 8 * k, 0, 4 * sin(Math.max(s, 0), 0.3));
          p.add('trunk.2', 3 * k);
          this.fx.bloom = 0;
          this.fx.face = k > 0.5 ? 'sleepy' : 'neutral';
          this.fx.glow = k > 0.3 ? 'dim' : undefined;
          if (s > 1.6 && this.once('sigh')) this.puffs.kick(-2);
          if (s > 6 && this.once('back')) this.walkTo(this.s, 0.15 + Math.random() * 0.3);
        },
      },
      // Wanders to the front lip and peers over it at what's below, arms tucked behind.
      lookover: {
        weight: 0.5,
        length: [8, 9],
        when: () => this.still() && this.depth > 0.05,
        start: () => this.walkTo(this.s, 0),
        pose: (t) => {
          const there = this.depth < 0.06 && !this.walking;
          if (there && !this.arrivedAt) this.arrivedAt = t;
          const s = this.arrivedAt ? t - this.arrivedAt : -1;
          const over = s < 0 ? 0 : span(s, 0.3, 1.2, 4.2, 5.2);
          p.add('pot', 8 * over);
          p.add('trunk.1', 10 * over);
          p.add('trunk.2', 12 * over);
          p.add('head', 16 * over, 20 * sin(Math.max(s, 0), 0.3) * over, 0);
          this.fx.face = over > 0.4 ? 'surprised' : 'neutral';
          this.fx.bloom = 0.2;
          if (s > 5.2 && this.once('back')) this.walkTo(this.s, 0.15 + Math.random() * 0.3);
        },
      },
    };
  }

  private social(): Record<string, Act> {
    const p = this.puppet;
    const company = () => this.still() && this.mates().length > 0;
    return {
      // Leans over to look at a crewmate, the flower tilting like a head.
      lookmate: {
        weight: 0.9,
        length: [4.5, 6],
        when: company,
        start: () => (this.side = Math.random() < 0.5 ? -1 : 1),
        pose: (t) => {
          const m = this.mates()[0];
          if (!m) return;
          const to = Math.sign(m.s - this.s) || 1;
          const k = this.on(t, 0.7, 0.6);
          p.add('head', 0, to * 26 * k, -to * 8 * k + this.side * 6 * k * sin(t, 0.6));
          p.add('trunk.2', 0, 0, -to * 6 * k);
          p.add('trunk.1', 0, 0, -to * 3 * k);
          p.add(to > 0 ? 'fore.L' : 'fore.R', 0, 0, to * 10 * k * sin(t, 1.2));
          this.fx.face = 'focused';
          this.fx.bloom = 0.5;
        },
      },
      // Rolls over to a crewmate and waves at them, then rolls back a little.
      visit: {
        weight: 0.6,
        length: [8, 9],
        face: 'happy',
        when: company,
        start: () => {
          const m = this.mates()[0];
          if (!m) return;
          this.side = Math.sign(m.s - this.s) || 1;
          this.walkTo(m.s - this.side * this.heightPx * 1.3, m.depth);
        },
        pose: (t) => {
          if (!this.walking && t > 1 && !this.arrivedAt) this.arrivedAt = t;
          const s = this.arrivedAt ? t - this.arrivedAt : -1;
          if (s < 0) return;
          const k = ease(s, 0, 0.5) * (1 - ease(s, 3.2, 3.8));
          this.waveArm(-this.side, k, s);
          this.fx.bloom = 0.7;
        },
      },
      // A hug nobody wants: he rolls up to a crewmate with his arms open, they back
      // away, and he is left holding nothing, a bit sad.
      offerhug: {
        weight: 0.6,
        length: [10, 12],
        when: company,
        start: () => {
          const m = this.mates()[0];
          if (!m) return;
          this.side = Math.sign(m.s - this.s) || 1;
          this.walkTo(m.s - this.side * this.heightPx * 0.95, m.depth);
        },
        pose: (t) => {
          const m = this.mates()[0];
          if (!this.walking && t > 1 && !this.arrivedAt) this.arrivedAt = t;
          const s = this.arrivedAt ? t - this.arrivedAt : -1;
          if (s < 0) {
            this.arms(20, 30);
            this.fx.face = 'love';
            return;
          }
          const open = ease(s, 0, 0.7) * (1 - ease(s, 0.8, 1.6));
          const close = ease(s, 0.8, 1.6) * (1 - ease(s, 3.0, 3.6));
          const sad = ease(s, 2.4, 3.4) * (1 - ease(s, 6, 7));
          this.arms(24 * open, 28 * open);
          this.hug(close);
          p.add('head', 0, this.side * 14 * (open + close), 0);
          p.add('trunk.2', 0, 0, -this.side * 5 * (open + close));
          p.add('head', 18 * sad, 0, 0);
          this.arms(-26 * sad, -30 * sad);
          this.fx.tuck = 0.5 * sad;
          this.fx.bloom = 0.3 * (1 - sad);
          this.fx.face = sad > 0.2 ? 'sad' : s < 1.6 ? 'love' : 'surprised';
          this.fx.glow = sad > 0.2 ? 'dim' : 'pulse';
          this.fx.tone = BEACON.love;
          if (s > 1.4 && m && this.once('away')) {
            // They back off (a few steps, along the floor, away from him).
            m.walkTo(m.s + this.side * this.heightPx * 1.6);
          }
          if (s > 3.4 && this.once('sigh')) p.kick('head', 60);
        },
      },
    };
  }

  private reactions(): Record<string, Act> {
    return {
      poked: { weight: 0, length: [3.4, 4] },
      bask: { weight: 0, length: [3, 5], face: 'happy' },
      dizzy: { weight: 0, length: [4, 4.5] },
    };
  }

  poke() {
    if (this.state !== 'here') return;
    const now = performance.now() / 1000;
    this.pokes = [...this.pokes.filter((at) => now - at < 3), now];
    if (this.pokes.length >= 3) {
      this.pokes = [];
      this.bristle.kick(-6);
      this.setAct('dizzy');
    } else if (this.act !== 'dizzy') {
      this.bristle.kick(-8);
      this.puppet.kick('trunk.2', -60);
      this.puppet.kick('head', -90);
      this.setAct('poked');
    }
  }

  protected onEnter() {
    this.wheels = 0;
    this.bloom.snap(0);
    this.motes.forEach((m) => (m.age = m.life));
  }

  protected idle(t: number) {
    this.fx = fresh();
    const p = this.puppet;
    // Never quite still: a slow sway up the column and the arms bobbing.
    p.add('trunk.1', 0, 0, 1.2 * sin(t, 0.21));
    p.add('trunk.2', 0, 0, 1.5 * sin(t, 0.21, -0.1));
    p.add('head', 1.5 * sin(t, 0.17), 0, 2 * sin(t, 0.13));
    p.add('fore.L', 0, 0, -3 * sin(t, 0.3));
    p.add('fore.R', 0, 0, 3 * sin(t, 0.27, 0.3));
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    const fx = this.fx;
    const t = this.actT;
    const act = this.act;
    this.env = env;

    // The mouse resting on him is his sun: he basks in it for as long as it stays.
    this.hover = this.hovered ? this.hover + dt : 0;
    const calm = act === 'idle' || act === 'count' || act === 'wave' || act === 'hug';
    if (this.hover > 0.8 && calm && !this.walking) this.setAct('bask');
    if (act === 'bask' && this.hovered) this.actLength = Math.max(this.actLength, t + 0.5);

    let bloom = fx.bloom ?? (this.hovered ? 0.35 : 0);
    if (act === 'poked') {
      // Flash and recoil onto his back wheels; then guilt: spines in, hands together,
      // head bowed and turned away.
      const sorry = clamp((t - 0.45) / 0.4, 0, 1) * clamp((this.actLength - t) / 0.8, 0, 1);
      fx.tuck = 0.6 * sorry;
      this.hug(0.75 * sorry);
      p.add('head', 18 * sorry, -8 * sorry, 10 * sorry);
      p.add('trunk.2', 5 * sorry);
      if (t < 0.45) {
        this.arms(25, -10);
        p.add('pot', -7);
      }
      this.expression = t < 0.5 ? 'surprised' : t < this.actLength - 0.9 ? 'sad' : 'neutral';
    } else if (act === 'bask') {
      bloom = 1;
      fx.reach = 0.012;
      this.arms(30, 18);
      p.add('head', -16, 0, 4 * sin(t, 0.4));
      p.add('trunk.2', -3, 0, 2 * sin(t, 0.4, -0.1));
      fx.charge = 1;
      this.expression = 'happy';
    } else if (act === 'dizzy') {
      // Round and round, arms flung out; then wobbling.
      const spinning = t < 2.6;
      this.arms(spinning ? 35 : 10, spinning ? 25 : 0);
      if (!spinning) {
        const w = clamp(this.actLength - t, 0, 1);
        p.add('trunk.1', 4 * Math.cos(t * 5) * w, 0, 4 * Math.sin(t * 5) * w);
        p.add('trunk.2', 5 * Math.cos(t * 5 - 0.5) * w, 0, 5 * Math.sin(t * 5 - 0.5) * w);
        p.add('head', 6 * Math.cos(t * 5 - 1) * w, 0, 6 * Math.sin(t * 5 - 1) * w);
      }
      fx.wheelTurn = spinning ? 400 : 0;
      this.expression = spinning ? 'surprised' : 'dizzy';
      bloom = 0.6;
    } else this.expression = fx.face ?? (this.hovered ? 'happy' : 'neutral');

    this.tuckNow = clamp(this.tuck.update(dt, fx.tuck), -0.2, 1.1);
    this.bristleNow = this.bristle.update(dt, 0);
    this.puffNow = this.puffs.update(dt, fx.puff);
    this.bloomNow = clamp(this.bloom.update(dt, bloom), -0.15, 1.2);
    this.reachNow = Math.max(0, this.reach.update(dt, fx.reach));
    this.gaugeNow = this.gaugeSpring.update(dt, fx.gauge ?? 0.7 + 0.08 * sin(env.time, 0.05));
    this.chargeNow = this.chargeSpring.update(dt, fx.charge ?? 0.42 + 0.12 * sin(env.time, 0.07));
    p.add('gauge', (this.gaugeNow - 0.5) * 100);

    // Rolling: the column lags behind as he sets off and tips on as he stops.
    const pace = this.stride;
    const accel = (pace - Math.abs(this.lastPace)) / Math.max(dt, 1e-3) / this.heightPx;
    this.lastPace = this.pace;
    const lean = clamp(-accel * 1.2, -8, 8);
    p.add('trunk.1', lean * 0.5);
    p.add('trunk.2', lean * 0.7);
    p.add('head', lean);
    // Over the bumps: a rattle in the pot at speed.
    p.add('pot', 0, 0, 1.2 * sin(env.time, 7) * Math.min(1, pace / (this.heightPx * 0.8)));

    // Hops and lifts.
    p.shift('root', 0, fx.lift + Math.max(0, this.hop.update(dt, 0)), 0);
    p.shift('pot', 0, -fx.crouch, 0);

    this.mood(dt);
  }

  /** The flower's heart: the mood's colour. */
  private mood(dt: number) {
    const face: Expression = this.acts[this.act]?.face ?? this.expression;
    let target = BEACON[face] ?? '#f4f4f1';
    if (this.fx.glow === 'flash' && this.fx.tone) target = this.fx.tone;
    if (this.act === 'dizzy' || this.fx.glow === 'rainbow')
      target = RAINBOW[Math.floor(this.actT * 6) % RAINBOW.length];
    this.beaconColour.lerp(new Color(target), Math.min(1, dt * 5));
    this.outfit.beacon(this.beaconColour);
  }

  /** The spine tips: rows up the column and a group on each arm. */
  private lights(time: number) {
    const act = this.act;
    const t = this.actT;
    const fx = this.fx;
    for (let i = 0; i < HEIGHT.length; i++) {
      const h = HEIGHT[i];
      const arm = i === 6 ? 1 : i === 7 ? -1 : 0;
      let level: number;
      let tone: string | undefined;
      if (act === 'poked') {
        if (t < 0.6) {
          // Every spine flashing at once.
          level = Math.sin(time * 34) > 0 ? 1 : 0.35;
          tone = BEACON.surprised;
        } else {
          // Blushing: a slow, soft pink.
          level = 0.25 + 0.2 * Math.sin(time * 2.2 - h * 2);
          tone = BEACON.love;
        }
      } else if (act === 'dizzy') {
        level = t < 2.6 ? 1 : Math.sin(time * 7 + i * 2.3) > 0.1 ? 1 : 0.15;
        tone = RAINBOW[(i + Math.floor(time * (t < 2.6 ? 12 : 3))) % RAINBOW.length];
      } else if (act === 'bask') {
        // Soaking it up: a warm glow welling up from the pot.
        level = 0.6 + 0.4 * Math.sin(time * 2.4 - h * 3.5);
        tone = BEACON.happy;
      } else if (fx.glow) {
        tone = fx.tone;
        switch (fx.glow) {
          case 'rainbow':
            // Bands of colour stepping up him on the beat.
            level = 0.55 + 0.45 * Math.abs(Math.sin(Math.PI * 1.1 * t));
            tone = RAINBOW[(Math.round(h * 5) - Math.floor(t * 1.1) + 400) % RAINBOW.length];
            break;
          case 'flash':
            level = Math.sin(time * 26 + (arm ? 0 : h * 2)) > 0 ? 1 : 0.3;
            break;
          case 'warm':
            level = 0.6 + 0.4 * Math.sin(time * 2.4 - h * 3.5);
            tone ??= BEACON.happy;
            break;
          case 'dim':
            level = 0.1 + 0.08 * Math.sin(time * 0.9 - h);
            break;
          case 'chase':
            // A pulse running up him.
            level = 0.2 + 0.8 * bump(cycle(time * 1.3) - h * 0.8, 0.18);
            break;
          case 'sparkle':
            level = Math.sin(time * 9 + i * 2.1) > 0.3 ? 1 : 0.25;
            tone = i % 2 ? BEACON.love : BEACON.happy;
            break;
          default:
            level = 0.35 + 0.35 * Math.sin(time * 3.2);
        }
      } else if (act === 'hug') {
        level = 0.35 + 0.25 * Math.sin(time * 2);
        tone = BEACON.love;
      } else if (act === 'count' && arm === this.side) {
        // Each nod counts one: the arm he's looking at blinks.
        const counting = t > 0.8 && t < this.actLength - 1.2;
        level = counting && sin(t - 0.8, 1.4) > 0.5 ? 1 : 0.2;
        tone = BEACON.focused;
      } else if (act === 'count' && t > this.actLength - 1.2) {
        // Done: all present and correct.
        level = 0.3 + 0.7 * bump(cycle((t - this.actLength + 1.2) * 1.2) - h * 0.7, 0.2);
        tone = BEACON.happy;
      } else if (act === 'wave' && arm === this.side) {
        level = Math.sin(time * 14) > 0 ? 1 : 0.4;
        tone = BEACON.happy;
      } else if (this.walking) {
        // Rolling: quick running lights up the column.
        level = 0.15 + 0.85 * bump(cycle(time * 1.8) - h * 0.8, 0.16);
      } else if (this.hovered) {
        level = 0.4 + 0.5 * bump(cycle(time / 1.6) - h * 0.7, 0.2);
        tone = BEACON.happy;
      } else {
        // At rest: a low glow, and now and then a slow ripple up the column.
        level = 0.3 + 0.7 * bump(cycle(time / 4.5) - h * 0.5, 0.1);
      }
      this.outfit.dot(i, level, tone);
    }
    // Charge lamps: one more lit for every third of the sun he has had.
    for (let j = 0; j < 3; j++) {
      let level = clamp(this.chargeNow * 3.3 - j, 0, 1);
      if (fx.charge === 1 && this.chargeNow > 0.9)
        level = 0.3 + 0.7 * Math.max(0, sin(time, 1.2, -j / 3));
      this.outfit.dot(LAMP + j, level, this.chargeNow < 0.3 ? ORANGE : undefined);
    }
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    const fx = this.fx;
    this.lights(env.time);

    // Spines: pulled in when he's sorry or shy, bristling out when he's startled or
    // puffed up.
    const out = Math.max(0, -this.bristleNow) * 0.6 + 0.6 * clamp(this.puffNow, 0, 1.2);
    for (const [bone, hide] of SPINES) {
      const s = 1 - (1 - hide) * clamp(this.tuckNow, 0, 1) + out;
      p.stretch(bone, s, [0, 1, 0], s);
    }

    // Telescoping: the capsules slide apart to stretch him taller.
    p.shift('trunk.2', 0, this.reachNow * 0.45, 0);
    p.shift('head', 0, this.reachNow * 0.55, 0);

    // The flower: each petal hinges out from the bud (a turn about the line round it).
    const open = this.bloomNow;
    PETALS.forEach((a, k) => {
      const flutter = open > 0.5 ? 4 * Math.sin(env.time * 5 + k * 1.7) * open : 0;
      const ripple = fx.ripple * sin(env.time, 1.6, -k / PETALS.length);
      const yaw = (a + Math.PI / 2) * DEG;
      p.turn(`petal.${k}`, 0, yaw, 0);
      p.turn(`petal.${k}`, 86 * open + flutter + ripple, 0, 0);
      p.turn(`petal.${k}`, 0, -yaw, 0);
    });

    // Wheels turn with the ground going by (he faces the way he rolls); or against each
    // other when he turns on the spot; the front pair up in a wheelie.
    this.wheels += (this.stride * dt) / (WHEEL * this.px);
    this.turned += fx.wheelTurn * dt;
    WHEELS.forEach((w) => {
      const left = w.endsWith('L') ? 1 : -1;
      p.turn(w, (this.wheels * DEG + fx.wheelRoll + left * this.turned) % 360);
      if (w.startsWith('wheel.F')) p.shift(w, 0, fx.wheelie, 0);
    });

    // The tumbleweed: rolling by, or tucked away to nothing.
    if (fx.weed) {
      p.stretch('tumble', 1.5, [0, 1, 0], 1.5);
      p.turn('tumble', 0, 0, fx.weed.roll);
      p.shift('tumble', fx.weed.x, fx.weed.y + 0.017, 0);
    } else {
      p.stretch('tumble', 0.001, [0, 1, 0], 0.001);
    }

    // Motes: pollen and drops flying about, then gone.
    let lit = 0;
    this.motes.forEach((m, k) => {
      const name = `mote.${k}`;
      if (m.age >= m.life) {
        p.stretch(name, 0.001, [0, 1, 0], 0.001);
        return;
      }
      m.age += dt;
      m.v[1] -= m.g * dt;
      for (let i = 0; i < 3; i++) m.p[i] += m.v[i] * dt;
      const u = m.age / m.life;
      const size = Math.max(0.001, 1.5 * Math.min(1, u * 8) * (1 - ease(u, 0.7, 1)));
      p.stretch(name, size, [0, 1, 0], size);
      p.shift(name, m.p[0], m.p[1], m.p[2]);
      lit = 1;
    });
    this.outfit.dot(MOTE_DOT, lit, this.moteColour);

    // Turning about his own axis: acts that swing him round, and the dizzy spin.
    let swing = fx.swing;
    if (this.act === 'dizzy') {
      const u = clamp((this.actT - 0.2) / 2.4, 0, 1);
      swing = 720 * u * u * (3 - 2 * u);
    }
    if (swing) p.swing('root', swing);
  }
}
