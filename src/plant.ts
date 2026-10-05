import { type Object3D, Quaternion, Vector3 } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Act, Character, clamp, type Env } from './character';
import type { Expression, FaceLayout } from './face';
import { sin } from './moves';
import { Spring } from './spring';

/**
 * Sprout, the robot houseplant. He shuffles about on two little feet under his pot and
 * spends his time the way plants do: leaning slowly toward the mouse as if it were the
 * sun, basking with his flower wide open, wilting for a drink and perking up again.
 * He is a machine, so it all shows on him: a gauge and three lights on his rim for the
 * water, a lit sensor in the soil, six hinged petals that shut like a fist, leaves on
 * knuckles, a spare sprig that grows on request, and lit motes that are his pollen (and
 * his drops of water).
 *
 * Most of his acts are plant things done a little too seriously: a stretch up tall, leaf
 * waves and claps, a sneeze of pollen, a yawn with the flower, a slow spin toward the
 * light, shaking off a drop, tipping over the front lip to look down, walking to the back
 * wall to find the light, dancing to a beat, hopping, hiding behind his leaves, showing
 * a crewmate his flower, or turning to show off his gauge. He shows how he feels with
 * his leaves and his flower: leaves perked up and the flower wide open when he's happy,
 * one leaf waving hello while the mouse is over him, the flower spinning when he's
 * poked, everything drooping and the flower shut when he dozes or wilts.
 */
export const PLANT_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.34, 0.44],
    [0.66, 0.44],
  ],
  rx: 0.08,
  ry: 0.21,
  line: 0.032,
  mouth: [0.5, 0.72],
};

type Mood = 'calm' | 'curious' | 'happy' | 'love' | 'sad' | 'asleep' | 'dizzy';

interface Feeling {
  face: Expression;
  /** Leaves up (+) or drooping (-), degrees; the flower open, 0..1; the stem bowed, degrees. */
  perk: number;
  bloom: number;
  bow: number;
  /** How far the stem leans after the mouse, 0..1. */
  lean: number;
}

const MOODS: Record<Mood, Feeling> = {
  calm: { face: 'neutral', perk: 0, bloom: 0.55, bow: 0, lean: 0.6 },
  curious: { face: 'neutral', perk: 10, bloom: 0.6, bow: 0, lean: 1 },
  happy: { face: 'happy', perk: 15, bloom: 1, bow: 0, lean: 0.8 },
  love: { face: 'love', perk: 20, bloom: 1, bow: 0, lean: 0.3 },
  sad: { face: 'sad', perk: -40, bloom: 0.15, bow: 30, lean: 0 },
  asleep: { face: 'asleep', perk: -30, bloom: 0.03, bow: 22, lean: 0 },
  dizzy: { face: 'dizzy', perk: 5, bloom: 1, bow: 0, lean: 0 },
};

const STEM = ['stem.1', 'stem.2', 'stem.3'];
/** Leaves: bone, and which side of the stem (1 his left, -1 his right). */
const LEAVES = [
  ['leaf.1', 1],
  ['leaf.2', -1],
  ['leaf.3', 1],
  ['leaf.4', -1],
] as const;
const PETALS = 6;
const MOTES = 4;
const DEG = 180 / Math.PI;
const ALONG = new Vector3(0, 1, 0);
const q = new Quaternion();

/** 0 before a, 1 after b, smooth between. */
const ease = (x: number, a: number, b: number) => {
  const u = clamp((x - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
};
/** Up from a to b, held, down from c to d. */
const span = (t: number, a: number, b: number, c: number, d: number) =>
  ease(t, a, b) * (1 - ease(t, c, d));

/** What the acts ask for this frame; anything left unset is up to his mood. */
interface Fx {
  bloom?: number;
  lean?: number;
  face?: Expression;
  water?: number;
  /** Viewport x he leans toward instead of the mouse. */
  aim?: number;
  /** Stem stretched (0..1), body lifted (metres), pot squashed (metres), sprig grown (0..1). */
  tall: number;
  lift: number;
  crouch: number;
  sprig: number;
  /** Turn about his own axis, degrees, direct (so it can go all the way round). */
  swing: number;
  /** Petals rippling in turn, degrees. */
  ripple: number;
  /** The water lights chase each other, and the heart cycles colours. */
  chase: boolean;
  rainbow: boolean;
}

interface Mote {
  age: number;
  life: number;
  p: [number, number, number];
  v: [number, number, number];
  g: number;
}

const fresh = (): Fx => ({
  tall: 0,
  lift: 0,
  crouch: 0,
  sprig: 0,
  swing: 0,
  ripple: 0,
  chase: false,
  rainbow: false,
});

export class Plant extends Character {
  static readonly terms =
    'flower blossom pot potted terracotta peach coral pink green leaves petals stem seedling garden shuffle sun bask wilt water thirsty gauge walk';

  mood: Mood = 'calm';
  private fx: Fx = fresh();
  private bloom = new Spring(0.8, 0.6, 0, 0.55);
  private lean = new Spring(0.35, 0.8);
  private hop = new Spring(3, 0.3);
  private water = new Spring(1.5, 0.7, 1, 0.8);
  private sprig = new Spring(1.6, 0.5, 1, 0);
  private spin = 0;
  private spinSpeed = 0;
  private pokes: number[] = [];
  private env: Env | null = null;
  private motes: Mote[] = Array.from({ length: MOTES }, () => ({
    age: 1,
    life: 0,
    p: [0, 0, 0],
    v: [0, 0, 0],
    g: 0,
  }));
  private moteColour = '#ffd76a';
  private beaconNow = '';
  /** Things an act has already done (a sneeze once, not every frame). */
  private did = new Set<string>();
  private side = 1;
  /** When an act got where it was going (seconds into the act), 0 if not yet. */
  private arrivedAt = 0;
  private openNow = 0.55;
  private level = 0.8;
  private sprigNow = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Sprout',
        model: 'plant',
        metres: 0.72,
        width: 0.4,
        size: 1.1,
        feels: {
          default: { f: 2, zeta: 0.6 },
          root: { f: 1.2, zeta: 0.8 },
          pot: { f: 1.5, zeta: 0.6, r: 0.3 },
          'stem.1': { f: 1.2, zeta: 0.5 },
          'stem.2': { f: 1.4, zeta: 0.45 },
          'stem.3': { f: 1.6, zeta: 0.4 },
          'leaf.1': { f: 2.5, zeta: 0.3 },
          'leaf.2': { f: 2.5, zeta: 0.3 },
          'leaf.3': { f: 2.8, zeta: 0.3 },
          'leaf.4': { f: 2.8, zeta: 0.3 },
          gauge: { f: 2.2, zeta: 0.35 },
          ...Object.fromEntries(
            Array.from({ length: PETALS }, (_, k) => [`petal.${k}`, { f: 3, zeta: 0.45 }]),
          ),
        },
        face: PLANT_FACE,
        eyes: 0.21,
        gaze: [{ bone: 'pot', yaw: 0.4, pitch: 0 }],
        reach: { yaw: 50, pitch: 25 },
        lag: 1.2,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [40, 100],
        speed: 0.8,
      },
      model,
    );
    this.acts = {
      ...this.calm(),
      ...this.showy(),
      ...this.plantThings(),
      ...this.about(),
      ...this.social(),
      ...this.reactions(),
    };
  }

  // ---------- Helpers ----------

  private still = () => !this.walking && !this.door && this.edge === 'bottom';

  private mates() {
    return (this.env?.crew ?? [])
      .filter(
        (o) => o !== (this as Character) && o.state === 'here' && o.edge === this.edge && !o.free,
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

  private amble(heights: number, depth?: number) {
    const way = Math.random() < 0.5 ? -1 : 1;
    let to = this.s + way * this.heightPx * heights * (0.6 + Math.random() * 0.8);
    if (this.env) {
      const [lo, hi] = this.span(this.env.frame);
      to = clamp(to, lo + this.widthPx(), hi - this.widthPx());
    }
    this.walkTo(to, depth);
  }

  /** A mote of pollen or water: where it starts (m, from the stem's tip), its speed, gravity, life. */
  private puff(
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
  private burst(colour = '#ffd76a', speed = 0.22) {
    for (let k = 0; k < MOTES; k++) {
      const a = (k / MOTES) * Math.PI * 2 + Math.random() * 0.6;
      this.puff(
        [0, 0.02, 0.03],
        [Math.cos(a) * speed, Math.sin(a) * speed * 0.9 + 0.05, 0.05 + Math.random() * 0.1],
        0.2,
        0.9 + Math.random() * 0.4,
        colour,
      );
    }
  }

  // ---------- Acts ----------

  private calm(): Record<string, Act> {
    const p = this.puppet;
    return {
      idle: { weight: 3, length: [4, 7] },
      stroll: {
        weight: 1.2,
        length: [3, 5],
        when: this.still,
        start: () => this.amble(1.6),
      },
      // A breeze only he can feel, leaves waving in turn, the pot rocking on its feet.
      sway: {
        weight: 1.5,
        length: [4, 6],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          STEM.forEach((bone, i) => p.add(bone, 0, 0, 9 * sin(t, 0.8, -i * 0.1)));
          LEAVES.forEach(([leaf, side], i) => p.add(leaf, 0, 0, side * 20 * sin(t, 1.6, i * 0.25)));
          p.add('pot', 0, 0, 3 * sin(t, 0.8, 0.15));
          this.fx.bloom = 0.8;
        },
      },
      bloom: {
        weight: 1.5,
        length: [5, 8],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // The petals open one after another, then ripple, then close up a little.
          this.fx.bloom = t < this.actLength - 1.2 ? 1.1 : 0.3;
          this.fx.ripple = 10 * span(t, 0.6, 1.4, this.actLength - 2, this.actLength - 1.2);
          LEAVES.forEach(([leaf, side], i) => p.add(leaf, 0, 0, side * 6 * sin(t, 0.7, i * 0.2)));
        },
      },
      stretch: {
        weight: 1,
        length: [2.5, 3.5],
        face: 'sleepy',
        when: this.still,
        pose: (t) => {
          // Up on his toes, the stem drawn out, leaves flung wide.
          const up = this.on(t, 0.9, 0.9);
          this.fx.tall = 0.2 * up;
          this.fx.lift = 0.012 * up;
          this.fx.bloom = 0.9;
          p.add('foot.L', 20 * up);
          p.add('foot.R', 20 * up);
          LEAVES.forEach(([leaf, side]) => p.add(leaf, 0, 0, side * 30 * up));
          p.add('stem.3', -6 * up);
        },
      },
      // Thirsty: droops, the gauge falls to empty and the lights go out; then a drink.
      wilt: {
        weight: 0.6,
        length: [7, 8.5],
        when: this.still,
        pose: (t) => {
          const drink = ease(t, 3.4, 4.4);
          this.fx.water = drink > 0 ? 0.15 + 0.85 * drink : 0.08;
          this.fx.face = t < 3.3 ? 'sad' : t < 4.6 ? 'surprised' : 'happy';
          if (t > 2.4 && t < 3.3) p.add('stem.3', 0, 0, 6 * sin(t, 2.5));
          if (t > 3.4 && this.once('rain')) {
            // Rain from nowhere: drops falling onto him.
            for (let k = 0; k < MOTES; k++)
              this.puff(
                [(k - 1.5) * 0.05, 0.28 + k * 0.02, 0.02],
                [0, -0.1, 0],
                1.6,
                0.8,
                '#5ec8ff',
              );
          }
          if (t > 4.4 && this.once('perk')) this.hop.kick(0.5);
        },
      },
      nap: {
        weight: 1,
        length: [8, 14],
        face: 'asleep',
        when: this.still,
        pose: (t) => {
          // Dozing, the flower shut, the water lights breathing slowly.
          this.fx.water = 0.5 + 0.35 * sin(t, 0.18);
          p.add('stem.2', 2 * sin(t, 0.2));
          p.add('leaf.1', 3 * sin(t, 0.2), 0, 0);
        },
      },
      // A micro-sleep: nodding off, jerked awake, looking round to check nobody saw.
      nod: {
        weight: 0.5,
        length: [4, 5],
        when: this.still,
        pose: (t) => {
          const off = ease(t, 0.2, 1.8) * (1 - ease(t, 2.0, 2.1));
          p.add('stem.2', 14 * off);
          p.add('stem.3', 20 * off);
          this.fx.bloom = 0.45 - 0.35 * off;
          this.fx.face = t < 2.0 ? 'sleepy' : t < 3.2 ? 'surprised' : 'neutral';
          if (t > 2.0 && this.once('jerk')) {
            p.kick('stem.3', -140);
            this.hop.kick(0.5);
          }
          if (t > 2.7) p.add('root', 0, 22 * sin(t - 2.7, 1.4), 0);
        },
      },
    };
  }

  private showy(): Record<string, Act> {
    const p = this.puppet;
    return {
      // Photosynthesis: face to the light, flower wide, leaves flared, all his lights running.
      bask: {
        weight: 1,
        length: [6, 9],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          const k = this.on(t, 1, 1);
          this.fx.bloom = 1.15;
          this.fx.chase = true;
          this.fx.tall = 0.08 * k;
          this.fx.ripple = 4 * k;
          p.add('stem.1', -3 * k);
          p.add('stem.3', -10 * k, 0, 3 * sin(t, 0.3));
          LEAVES.forEach(([leaf, side], i) =>
            p.add(leaf, 0, 0, side * (26 + 8 * sin(t, 0.45, i * 0.2)) * k),
          );
        },
      },
      leafwave: {
        weight: 0.9,
        length: [2.5, 3.5],
        face: 'happy',
        when: this.still,
        start: () => (this.side = this.towardMouse()),
        pose: (t) => {
          const s = this.side;
          const k = this.on(t, 0.3, 0.4);
          p.add(s > 0 ? 'leaf.3' : 'leaf.4', 0, 0, s * (40 + 30 * sin(t, 2.6)) * k);
          p.add(s > 0 ? 'leaf.1' : 'leaf.2', 0, 0, s * 10 * k);
          p.add('stem.3', 0, 0, -s * 8 * k);
          this.fx.bloom = 0.8;
        },
      },
      // Both top leaves up over the stem and together, several times.
      leafclap: {
        weight: 0.7,
        length: [3, 4],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          const k = this.on(t, 0.4, 0.4);
          const beat = 0.5 + 0.5 * Math.cos(2 * Math.PI * 2.4 * t);
          for (const [leaf, side] of LEAVES)
            p.add(leaf, 0, side * -10 * k, side * (40 + 45 * beat) * k);
          if (beat < 0.02 && k > 0.8 && this.once(`clap${Math.floor(t * 2.4)}`)) {
            p.kick('stem.3', 30);
            this.hop.kick(0.25);
          }
          this.fx.bloom = 0.9;
        },
      },
      // Pollen: a long build-up, the flower thrown back, then a sneeze and a puff of sparkles.
      sneeze: {
        weight: 0.7,
        length: [4, 4.6],
        when: this.still,
        pose: (t) => {
          const build = ease(t, 0.3, 1.8) * (1 - ease(t, 1.85, 1.9));
          p.add('stem.3', -28 * build);
          p.add('stem.2', -10 * build);
          this.fx.bloom = 0.5 + 0.6 * build;
          this.fx.face = t < 1.9 ? 'surprised' : t < 2.3 ? 'cross' : 'neutral';
          if (t > 1.85 && this.once('achoo')) {
            p.kick('stem.3', 220);
            p.kick('stem.2', 100);
            p.kick('pot', 40);
            this.hop.kick(0.7);
            this.burst('#ffd76a', 0.26);
          }
          if (t > 2.6) LEAVES.forEach(([leaf, side]) => p.add(leaf, 0, 0, side * 6 * sin(t, 1.2)));
        },
      },
      // The flower opens like a mouth, wide, and shuts again, the stem drawn up with it.
      yawn: {
        weight: 0.8,
        length: [4.5, 5.5],
        when: this.still,
        pose: (t) => {
          const wide = span(t, 0.4, 2.0, 2.6, 3.0);
          this.fx.bloom = 0.45 + 0.7 * wide - 0.4 * ease(t, 3.0, 3.4);
          this.fx.tall = 0.14 * wide;
          this.fx.face = wide > 0.5 ? 'sleepy' : 'neutral';
          p.add('stem.3', -12 * wide);
          LEAVES.forEach(([leaf, side]) => p.add(leaf, 0, 0, side * 32 * wide));
        },
      },
      // A slow turn on the spot, all the way round, leaves flaring like a skirt.
      spin: {
        weight: 0.7,
        length: [5, 6],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          const T = this.actLength - 0.5;
          this.fx.swing = 360 * ease(t, 0.3, T);
          const speed = Math.sin(Math.PI * clamp((t - 0.3) / (T - 0.3), 0, 1));
          LEAVES.forEach(([leaf, side]) => p.add(leaf, 0, 0, side * 40 * speed));
          this.fx.bloom = 1;
          this.fx.ripple = 8 * speed;
        },
      },
      // Shakes himself like a wet dog and a drop flies off a leaf.
      shake: {
        weight: 0.7,
        length: [3, 3.6],
        when: this.still,
        start: () => (this.side = Math.random() < 0.5 ? -1 : 1),
        pose: (t) => {
          const k = span(t, 0.05, 0.2, 1.3, 1.9);
          p.add('pot', 0, 0, 7 * k * sin(t, 6.5));
          p.add('stem.2', 0, 8 * k * sin(t, 6.5, 0.2), 0);
          LEAVES.forEach(([leaf, side], i) =>
            p.add(leaf, 0, 0, side * 30 * k * sin(t, 8, i * 0.2)),
          );
          this.fx.face = t < 1.7 ? 'cross' : 'happy';
          if (t > 0.6 && this.once('drop')) {
            const s = this.side;
            this.puff([0.14 * s, -0.17, 0.02], [0.05 * s, 0.05, 0.05], 2.6, 0.8, '#5ec8ff');
          }
        },
      },
      // A spare sprig pushes out of the stem, a lit bud on its end, and he admires it.
      sprout: {
        weight: 0.6,
        length: [6, 7],
        when: this.still,
        pose: (t) => {
          const grow = span(t, 0.8, 2.2, this.actLength - 1.6, this.actLength - 0.6);
          this.fx.sprig = grow;
          this.fx.face = t < 1.0 ? 'neutral' : grow > 0.6 ? 'surprised' : 'happy';
          if (t > 1.6 && this.once('pop'))
            this.puff([0.04, -0.2, 0.05], [0.06, 0.12, 0.08], 0, 0.9, '#6fdc8c');
          p.add('stem.2', 0, 12 * grow, 3 * grow);
          p.add('stem.3', 8 * grow, 10 * grow, 0);
          p.add('root', 0, 22 * grow, 0);
          this.fx.bloom = 0.6 + 0.3 * grow;
          if (t > 2.4 && t < 4.6) p.add('leaf.3', 0, 0, 16 * sin(t, 1.8));
        },
      },
      // Every leaf beating time, the pot bobbing, the lights stepping, the heart changing colour.
      beat: {
        weight: 0.9,
        length: [5, 8],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          const k = this.on(t, 0.8, 0.8);
          const bar = Math.sin(2 * Math.PI * 1.1 * t);
          const bounce = Math.abs(bar);
          this.fx.crouch = 0.015 * (1 - bounce) * k;
          this.fx.lift = 0.02 * bounce * k;
          this.fx.chase = true;
          this.fx.rainbow = true;
          this.fx.bloom = 0.75 + 0.35 * bounce * k;
          p.add('foot.L', 18 * bar * k);
          p.add('foot.R', -18 * bar * k);
          p.add('pot', 0, 0, 5 * bar * k);
          STEM.forEach((bone, i) => p.add(bone, 0, 0, -8 * bar * k * (i + 1) * 0.6));
          LEAVES.forEach(([leaf, side], i) =>
            p.add(leaf, 0, 0, side * (14 + 18 * Math.sin(2 * Math.PI * (1.1 * t + i * 0.25))) * k),
          );
        },
      },
      hop: {
        weight: 0.9,
        length: [2.6, 3.4],
        face: 'happy',
        when: this.still,
        pose: (t) => {
          // Squat, spring, land: three times, the leaves streaming up as he goes.
          const u = (t % 0.85) / 0.85;
          const live = Math.floor(t / 0.85) < 3 ? 1 : 0;
          const squat = live * (u < 0.22 ? ease(u, 0, 0.18) : 1 - ease(u, 0.2, 0.3));
          const air = live * (u > 0.22 ? Math.sin(Math.PI * ((u - 0.22) / 0.78)) : 0);
          this.fx.crouch = 0.03 * squat;
          this.fx.lift = 0.09 * air;
          p.add('foot.L', 30 * air);
          p.add('foot.R', 30 * air);
          LEAVES.forEach(([leaf, side]) => p.add(leaf, 0, 0, side * (30 * air - 20 * squat)));
          p.add('stem.2', 10 * squat - 6 * air);
          this.fx.bloom = 0.5 + 0.6 * air;
        },
      },
      // The flower goes round like a pinwheel.
      pinwheel: {
        weight: 0.6,
        length: [3, 4],
        face: 'happy',
        when: this.still,
        start: () => (this.spinSpeed = 26),
        pose: (t) => {
          this.fx.bloom = 1.1;
          this.fx.ripple = 12 * this.on(t, 0.3, 0.6);
          this.spinSpeed = Math.max(this.spinSpeed, 18 * this.on(t, 0.1, 0.8));
          LEAVES.forEach(([leaf, side], i) => p.add(leaf, 0, 0, side * 22 * sin(t, 2, i * 0.25)));
        },
      },
      // Stamping on the spot, a leaf swinging each side like arms.
      march: {
        weight: 0.7,
        length: [3, 4],
        face: 'focused',
        when: this.still,
        pose: (t) => {
          const k = this.on(t, 0.4, 0.4);
          const step = sin(t, 1.2);
          p.add('foot.L', 38 * step * k);
          p.add('foot.R', -38 * step * k);
          this.fx.lift = 0.014 * Math.abs(step) * k;
          p.add('pot', 0, 0, 4 * step * k);
          p.add('root', 0, 5 * step * k, 0);
          p.add('leaf.3', 0, 0, 30 * step * k);
          p.add('leaf.4', 0, 0, 30 * step * k);
          p.add('leaf.1', 0, 0, -24 * step * k);
          p.add('leaf.2', 0, 0, -24 * step * k);
          p.add('stem.3', 0, 0, -4 * step * k);
        },
      },
      // On one foot, leaves out for balance, wobbling more and more, then saved with a hop.
      balance: {
        weight: 0.5,
        length: [4.4, 5],
        when: this.still,
        start: () => (this.side = Math.random() < 0.5 ? -1 : 1),
        pose: (t) => {
          const s = this.side;
          const up = ease(t, 0.3, 0.9) * (1 - ease(t, 3.2, 3.5));
          const wob = up * (1 + 2 * ease(t, 0.9, 3.0));
          p.add(s > 0 ? 'foot.L' : 'foot.R', s * 55 * up);
          this.fx.lift = 0.02 * up;
          p.add('pot', 0, 0, 6 * wob * sin(t, 1.3) - s * 3 * up);
          LEAVES.forEach(([leaf, side], i) =>
            p.add(leaf, 0, 0, side * (35 + 12 * wob * sin(t, 1.3, 0.3 + i * 0.05)) * up),
          );
          STEM.forEach((bone, i) => p.add(bone, 0, 0, -5 * wob * sin(t, 1.3, -0.1 * i)));
          this.fx.face = t < 3.3 ? 'focused' : 'happy';
          if (t > 3.3 && this.once('caught')) this.hop.kick(0.5);
        },
      },
    };
  }

  private plantThings(): Record<string, Act> {
    const p = this.puppet;
    return {
      // Reaching for something high up: on tiptoe, wobbling, looking up.
      reach: {
        weight: 0.6,
        length: [3.4, 4.2],
        face: 'surprised',
        when: this.still,
        pose: (t) => {
          const up = this.on(t, 0.8, 0.8);
          this.fx.tall = 0.3 * up;
          this.fx.lift = 0.02 * up;
          p.add('foot.L', 30 * up);
          p.add('foot.R', 30 * up);
          p.add('stem.1', -3 * up, 0, 3 * up * sin(t, 1.6));
          p.add('stem.3', -14 * up);
          this.fx.bloom = 1;
          LEAVES.forEach(([leaf, side]) => p.add(leaf, 0, 0, side * (48 + 6 * sin(t, 2.2)) * up));
          p.add('pot', 0, 0, 3 * up * sin(t, 1.6, 0.2));
        },
      },
      // Hides behind his leaves, the flower folded away, and pops out again.
      peekaboo: {
        weight: 0.6,
        length: [4.4, 5],
        when: this.still,
        pose: (t) => {
          const hide = ease(t, 0.3, 0.9) * (1 - ease(t, 2.7, 2.8));
          for (const [leaf, side] of LEAVES)
            p.add(leaf, 0, side * -14 * hide, side * (66 + (leaf === 'leaf.3' ? 12 : 0)) * hide);
          p.add('stem.3', 22 * hide);
          p.add('stem.2', 8 * hide);
          this.fx.bloom = 0.9 - 0.85 * hide;
          this.fx.face = hide > 0.5 ? 'love' : t < 3.4 ? 'surprised' : 'happy';
          if (t > 2.7 && this.once('boo')) {
            for (const [leaf, side] of LEAVES) p.kick(leaf, 0, 0, side * -240);
            this.hop.kick(0.9);
            p.kick('stem.3', -150);
          }
        },
      },
      // Turns his left side to the front to show off his gauge and its lights.
      showgauge: {
        weight: 0.6,
        length: [4.6, 5.4],
        when: this.still,
        pose: (t) => {
          const k = this.on(t, 0.9, 0.9);
          this.fx.swing = -90 * k;
          const shown = t > 1.0 && t < this.actLength - 0.9;
          this.fx.water = shown ? 0.55 + 0.4 * Math.sin(2 * Math.PI * 0.5 * (t - 1)) : undefined;
          this.fx.face = k > 0.6 ? 'wink' : 'neutral';
          LEAVES.forEach(([leaf, side]) => p.add(leaf, 0, 0, side * 10 * k));
          p.add('stem.3', 0, 0, -6 * k);
        },
      },
    };
  }

  /** The acts that use the depth of the box. */
  private about(): Record<string, Act> {
    const p = this.puppet;
    return {
      // Right to the front lip, and tips forward over it to look at what is below.
      peek: {
        weight: 0.7,
        length: [8, 10],
        when: () => this.still() && this.depth > 0.05,
        start: () => this.walkTo(this.s, 0),
        pose: (t) => {
          const there = this.depth < 0.06 && !this.walking;
          if (there && !this.arrivedAt) this.arrivedAt = t;
          const s = this.arrivedAt ? t - this.arrivedAt : -1;
          const over = s < 0 ? 0 : span(s, 0.2, 1.1, 4.4, 5.4);
          p.add('pot', 9 * over);
          p.add('stem.1', 18 * over);
          p.add('stem.2', 18 * over);
          p.add('stem.3', 22 * over);
          p.add('root', 0, 26 * over * sin(Math.max(s, 0), 0.35), 0);
          this.fx.bloom = 0.35;
          this.fx.face = over > 0.4 ? 'surprised' : 'neutral';
          LEAVES.forEach(([leaf, side]) => p.add(leaf, 0, 0, side * -18 * over));
          if (s > 5 && this.once('back')) this.walkTo(this.s, 0.15 + Math.random() * 0.3);
        },
      },
      // Goes to the back wall to look for the light, then stands tall, flower wide.
      findlight: {
        weight: 0.7,
        length: [11, 13],
        when: () => this.still() && this.depth < 0.6,
        start: () => this.walkTo(this.s + (Math.random() - 0.5) * this.heightPx, 0.95),
        pose: (t) => {
          const there = this.depth > 0.85 && !this.walking;
          if (there && !this.arrivedAt) this.arrivedAt = t;
          const s = this.arrivedAt ? t - this.arrivedAt : -1;
          const up = s < 0 ? 0 : span(s, 0.3, 1.6, 4.4, 5.2);
          this.fx.tall = 0.3 * up;
          this.fx.bloom = 0.4 + 0.75 * up;
          this.fx.lift = 0.015 * up;
          this.fx.chase = up > 0.4;
          p.add('stem.3', -12 * up);
          p.add('foot.L', 20 * up);
          p.add('foot.R', 20 * up);
          LEAVES.forEach(([leaf, side]) => p.add(leaf, 0, 0, side * 34 * up));
          if (s > 5.4 && this.once('back')) this.walkTo(this.s, 0.15 + Math.random() * 0.3);
        },
      },
    };
  }

  private social(): Record<string, Act> {
    const p = this.puppet;
    const company = () => this.still() && this.mates().length > 0;
    return {
      // Leans right over to look at a crewmate, his flower tilting like a head.
      lookmate: {
        weight: 0.9,
        length: [4.5, 6],
        face: 'focused',
        when: company,
        start: () => (this.side = Math.random() < 0.5 ? -1 : 1),
        pose: (t) => {
          const m = this.mates()[0];
          if (!m) return;
          const to = Math.sign(m.s - this.s) || 1;
          const k = this.on(t, 0.7, 0.6);
          this.fx.aim = m.s;
          this.fx.lean = 1.2;
          p.add('root', 0, to * 40 * k, 0);
          p.add('stem.3', 4 * k, 0, this.side * 14 * k * sin(t, 0.6));
          this.fx.bloom = 0.7;
          p.add(to > 0 ? 'leaf.3' : 'leaf.4', 0, 0, to * 12 * k * sin(t, 1.2));
        },
      },
      // Walks over to a crewmate and shows off his flower: wide open, sparkling, a wave.
      offer: {
        weight: 0.6,
        length: [8, 10],
        face: 'love',
        when: company,
        start: () => {
          const m = this.mates()[0];
          if (!m) return;
          this.side = Math.sign(m.s - this.s) || 1;
          this.walkTo(m.s - this.side * this.heightPx * 1.1, m.depth);
        },
        pose: (t) => {
          const m = this.mates()[0];
          if (!this.walking && t > 1 && !this.arrivedAt) this.arrivedAt = t;
          const s = this.arrivedAt ? t - this.arrivedAt : -1;
          if (s < 0) return;
          const k = ease(s, 0, 0.7) * (1 - ease(s, 4.4, 5.2));
          this.fx.bloom = 1.15;
          this.fx.chase = true;
          this.fx.aim = m?.s;
          this.fx.lean = 1.2;
          p.add('root', 0, this.side * 34 * k, 0);
          p.add('stem.1', 6 * k);
          p.add('stem.3', 14 * k);
          p.add(this.side > 0 ? 'leaf.3' : 'leaf.4', 0, 0, this.side * (40 + 26 * sin(s, 2.4)) * k);
          if (s > 1.4 && this.once('gift')) this.burst('#ffb347', 0.14);
        },
      },
    };
  }

  private reactions(): Record<string, Act> {
    const p = this.puppet;
    return {
      love: {
        weight: 0,
        length: [2, 2.6],
        start: () => {
          this.spinSpeed = 14;
          this.hop.kick(0.8);
        },
        pose: (t) => {
          this.fx.chase = true;
          this.fx.ripple = 10 * this.on(t, 0.2, 0.5);
          if (t < 0.05 && this.once('hearts')) this.burst('#ff5fa2', 0.12);
        },
      },
      dizzy: {
        weight: 0,
        length: [2.5, 3],
        start: () => (this.spinSpeed = 30),
        pose: (t) => {
          STEM.forEach((bone) => p.add(bone, 10 * Math.cos(t * 6), 0, 10 * Math.sin(t * 6)));
          this.fx.rainbow = true;
          this.fx.swing = 30 * Math.sin(t * 5);
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
    } else this.setAct('love');
  }

  private feel(env: Env): Mood {
    const byAct: Record<string, Mood> = {
      love: 'love',
      dizzy: 'dizzy',
      nap: 'asleep',
      bloom: 'happy',
      sway: 'happy',
      bask: 'happy',
      beat: 'happy',
      leafclap: 'happy',
      leafwave: 'happy',
      spin: 'happy',
      hop: 'happy',
      pinwheel: 'happy',
      offer: 'love',
    };
    if (this.act === 'wilt') return this.actT < 3.4 ? 'sad' : this.actT < 4.6 ? 'curious' : 'happy';
    if (byAct[this.act]) return byAct[this.act];
    if (this.hovered) return 'happy';
    const eye = this.eyePoint(env.frame);
    const near = Math.hypot(env.pointer.x - eye.x, env.pointer.y - eye.y) < this.heightPx * 8;
    if (env.pointer.present && near && env.time - env.pointer.at < 1.5) return 'curious';
    return 'calm';
  }

  protected idle(t: number) {
    this.fx = fresh();
    // Leaves stirring, each on its own.
    LEAVES.forEach(([leaf, side], i) =>
      this.puppet.add(leaf, 2 * sin(t, 0.4, i * 0.3), 0, side * 4 * sin(t, 0.6, i * 0.2)),
    );
    STEM.forEach((bone, i) => this.puppet.add(bone, 0, 0, 1.5 * sin(t, 0.25, -i * 0.1)));
  }

  protected onEnter() {
    this.bloom.snap(0.55);
    this.sprig.snap(0);
    this.motes.forEach((m) => (m.age = m.life));
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    const fx = this.fx;
    this.env = env;
    this.mood = this.feel(env);
    const f = MOODS[this.mood];
    this.expression = fx.face ?? f.face;

    // Shuffling along: little hops, feet stepping, pot rocking.
    const moving = Math.min(1, this.stride / (this.heightPx * 0.5));
    const step = Math.sin(this.gait * 1.5);
    p.add('foot.L', 25 * step * moving);
    p.add('foot.R', -25 * step * moving);
    p.add('pot', 0, 0, 5 * step * moving);
    const lift = 0.025 * Math.abs(step) * moving + Math.max(0, this.hop.update(dt, 0)) + fx.lift;
    p.shift('root', 0, lift, 0);
    p.shift('pot', 0, -fx.crouch, 0);

    // The stem leans after the mouse (or whatever an act is looking at), slowly, like a
    // plant after the sun.
    let toward = 0;
    const aim = fx.aim ?? (env.pointer.present ? env.pointer.x : undefined);
    const leanBy = fx.lean ?? f.lean;
    if (aim !== undefined && leanBy) {
      const eye = this.eyePoint(env.frame);
      toward = clamp(Math.atan2(aim - eye.x, this.heightPx * 2.5) * DEG, -35, 35) * leanBy;
    }
    const lean = this.lean.update(dt, toward);
    // Bowed when sad or asleep: the top of the stem hangs forward.
    STEM.forEach((bone, i) => p.add(bone, f.bow * (i / 2), 0, -lean * [0.3, 0.35, 0.35][i]));
    LEAVES.forEach(([leaf, side], i) => {
      p.add(leaf, 0, 0, side * f.perk * (i < 2 ? 1 : 1.2));
    });
    // Waving hello with a top leaf while the mouse is over him.
    if (this.hovered) p.add('leaf.3', 0, 0, 25 * sin(env.time, 2));
    this.spinSpeed *= Math.exp(-dt * 0.8);

    // The flower: petals hinge shut as it closes and ripple round when asked.
    const open = this.bloom.update(dt, fx.bloom ?? f.bloom);
    const fold = Math.sign(1 - open) * Math.abs(clamp(1 - open, -0.15, 1)) ** 1.4 * 85;
    for (let k = 0; k < PETALS; k++) {
      const a = (2 * Math.PI * k) / PETALS;
      const angle = fold + fx.ripple * sin(env.time, 1.6, -k / PETALS);
      p.add(`petal.${k}`, angle * Math.sin(a), -angle * Math.cos(a), 0);
    }
    this.openNow = open;

    // The water: level, gauge needle and lights.
    this.level = this.water.update(dt, fx.water ?? 0.8 + 0.1 * sin(env.time, 0.03));
    p.add('gauge', (this.level - 0.5) * 100);
    this.sprigNow = this.sprig.update(dt, fx.sprig);
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    const fx = this.fx;
    // The flower opens out of the bud, and spins when poked.
    const grown = clamp(0.5 + 0.5 * clamp(this.openNow, 0, 1.15), 0.1, 1.15);
    p.stretch('flower', grown, [0, 0, 1], grown);
    this.spin += this.spinSpeed * dt;
    p.bone('flower').quaternion.multiply(q.setFromAxisAngle(ALONG, this.spin));
    // The stem draws itself out, and he can turn all the way round.
    p.stretch('stem.1', 1 + 0.55 * fx.tall, [0, 1, 0]);
    if (fx.swing) p.swing('root', fx.swing);
    // The spare sprig, hidden until it grows.
    const g = Math.max(0.001, this.sprigNow * 1.25);
    p.stretch('sprig', g, [0, 1, 0], g);

    // Motes: pollen and drops flying about, then gone.
    let lit = this.sprigNow > 0.05 ? 1 : 0;
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
      const size = Math.max(0.001, 1.6 * Math.min(1, u * 8) * (1 - ease(u, 0.7, 1)));
      p.stretch(name, size, [0, 1, 0], size);
      p.shift(name, m.p[0], m.p[1], m.p[2]);
      lit = 1;
    });

    // Lights: the gauge's three, the soil sensor, the motes, the heart.
    if (!this.outfit) return;
    for (let i = 0; i < 3; i++) {
      let level = clamp((this.level - i / 3) * 3.5, 0, 1);
      if (fx.chase) level = 0.15 + 0.85 * Math.max(0, sin(env.time, 1.4, -i / 3));
      this.outfit.dot(i + 1, level);
    }
    const dry = this.level < 0.3;
    const pulse = 0.5 + 0.5 * sin(env.time, dry ? 2.2 : 0.35);
    this.outfit.dot(0, fx.chase ? 1 : pulse, dry ? '#ffb347' : undefined);
    this.outfit.dot(4, lit, this.moteColour);
    const shown = this.acts[this.act]?.face ?? fx.face ?? MOODS[this.mood].face;
    const colour = fx.rainbow
      ? RAINBOW[Math.floor(env.time * 6) % RAINBOW.length]
      : (BEACON[shown] ?? '#f4f4f1');
    if (colour !== this.beaconNow) {
      this.beaconNow = colour;
      this.outfit.beacon(colour);
    }
  }
}
