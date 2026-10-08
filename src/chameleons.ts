import { Color, type Object3D } from 'three';
import { BEACON } from './bolt';
import { type Act, Character, clamp, type Env } from './character';
import type { Expression, FaceLayout } from './face';
import { ramp } from './kitties';
import { sin } from './moves';
import { freshTongue, type Pt, Tongue, type TongueWant } from './tongue';

const DEG = Math.PI / 180;
const RED = new Color('#ff3a2a');
const sm = (u: number) => {
  const x = clamp(u, 0, 1);
  return x * x * (3 - 2 * x);
};
const lerp3 = (a: Pt, b: Pt, u: number): Pt => [
  a[0] + (b[0] - a[0]) * u,
  a[1] + (b[1] - a[1]) * u,
  a[2] + (b[2] - a[2]) * u,
];

/**
 * One tongue shot from t0: out in 0.12 s (a fast ease-out), held on its target 0.16 s, back
 * slower (0.5 s) with its sleeves wobbling. All of it is a function of the act's time, so the
 * peak is a plateau: at 20 fps a frame always lands on it. `jaw` opens just ahead of the
 * shot and closes as it comes back.
 */
export function shot(t: number, t0: number, out = 0.12, hold = 0.16, back = 0.5) {
  const s = t - t0;
  let k = 0;
  if (s > 0) {
    if (s < out) k = 1 - (1 - s / out) ** 2;
    else if (s < out + hold) k = 1;
    else if (s < out + hold + back) k = 1 - sm((s - out - hold) / back);
  }
  const sh = s - out;
  const sb = s - out - hold;
  return {
    k,
    hit: sh >= 0 && sh < 1 ? Math.exp(-7 * sh) : 0,
    wob: sb >= 0 ? Math.exp(-2.6 * sb) : 0,
    wobT: Math.max(sb, 0),
    jaw: sm((s + 0.14) / 0.12) * (1 - sm((sb - 0.1) / (back * 0.8))),
    hitAt: t0 + out,
    backAt: t0 + out + hold,
    endAt: t0 + out + hold + back,
  };
}

type Key = [number, Pt];
/** A smooth path through timed points (Hermite, tangents from the neighbours). */
export function path(keys: Key[], t: number): Pt {
  if (t <= keys[0][0]) return keys[0][1];
  const last = keys[keys.length - 1];
  if (t >= last[0]) return last[1];
  let i = 0;
  while (keys[i + 1][0] < t) i++;
  const [t0, p0] = keys[i];
  const [t1, p1] = keys[i + 1];
  const pm = keys[Math.max(i - 1, 0)][1];
  const pn = keys[Math.min(i + 2, keys.length - 1)][1];
  const u = (t - t0) / (t1 - t0);
  const h00 = 2 * u ** 3 - 3 * u ** 2 + 1;
  const h10 = u ** 3 - 2 * u ** 2 + u;
  const h01 = -2 * u ** 3 + 3 * u ** 2;
  const h11 = u ** 3 - u ** 2;
  return [0, 1, 2].map(
    (a) => h00 * p0[a] + h10 * ((p1[a] - pm[a]) / 2) + h01 * p1[a] + h11 * ((pn[a] - p0[a]) / 2),
  ) as Pt;
}

/**
 * What the chameleons share (Hue the veiled, Flare the panther, Trike the Jackson's, Twig the
 * pygmy leaf, Sage the Parson's; blender/chamkit.py): Hue's motion and tricks, so a type is
 * mostly numbers (its ChamKit: size, walking pace, how tightly the tail curls, which lights
 * shift colour and in what range) plus a few tricks of its own, added in its constructor with
 * `this.acts = { ...this.acts, ...own }` (Want has what they need: puff, roll, flutter, pace,
 * glow).
 *
 * She does not stride, she rocks: forward a step, a hesitant lean back, forward again, each
 * foot lifted and set down as if the floor might not be there; up the side walls the same
 * way. The shared acts: tongue shots at a robot fly (catch, miss, share, stick, eye lick, blep, twirl), a slow colour shift, curling and
 * uncurling the tail, a tail like a propeller, freezing stiff with one eye swivelling, a leaf
 * in the wind, camouflage, looking round with the eyes going their own ways, a nap, and
 * clinging and climbing on the side walls.
 *
 * The colour is in the flank panels (`bands`), a crest and the tail tip, and in a few lights
 * of the type's own (`extras`): they shift hue slowly all the time and faster in a colour
 * show; in ink and paper the same shifts show as tone, and they go dark when camouflaged.
 */
export const CHAMELEON_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.3, 0.46],
    [0.7, 0.46],
  ],
  rx: 0.1,
  ry: 0.27,
  line: 0.036,
  mouth: [0.5, 0.82],
};

const TAIL = Array.from({ length: 10 }, (_, i) => `tail.${i + 1}`);
const LEGS: [string, string, 1 | -1, 1 | -1][] = [
  ['leg.FL', 'shin.FL', 1, 1],
  ['leg.FR', 'shin.FR', -1, 1],
  ['leg.BL', 'shin.BL', 1, -1],
  ['leg.BR', 'shin.BR', -1, -1],
];

export interface ChamKit {
  name: string;
  model: string;
  /** Model height and length in metres, on-screen height in --bot. */
  metres: number;
  width: number;
  size: number;
  face: FaceLayout;
  /** Eye height as a fraction of the model's. */
  eyes: number;
  /** Walking speed in --bot per second. */
  dip: number;
  /** How much of the rocking walk's swing (1 is Hue's). */
  gait?: number;
  /** The tail's rest curl per bone in degrees (about 360 times its turns, over nine). */
  curl: number;
  /** How slowly its joints move (1 is Hue's, more is heavier). */
  mass?: number;
  /** How far it drops when it lies on its side (metres). */
  lay?: number;
  /** Where the lights are: the colour-shifting panels, the crest and tail-tip dots, and
   * lights of its own with a fixed colour (and a white stripe, which never shifts). */
  lights: {
    bands: number[];
    crest: number;
    tip: number;
    extras?: { dot: number; colour: string; base: number }[];
    /** The beat's step from band to band (radians), and the spread of hues between them
     * (at rest, and in a show). */
    phase?: number;
    spread?: [number, number];
  };
  /** The tongue (chamkit.py's table): how far it reaches out of the mouth, its pad's radius
   * (metres), how far the turret's lens sits from the eye's centre, and (Flare) whether the
   * pad's light runs through every hue. */
  tongue: { out: number; pad: number; lens: number; rainbow?: boolean };
  /** Hue range [lo, hi] (0..1) the panels stay inside; the whole wheel if left out. */
  hues?: [number, number];
  sat?: number;
  lum?: number;
}

interface Want extends TongueWant {
  eyes: [[number, number], [number, number]] | null;
  head: [number, number, number];
  body: [number, number, number];
  /** 0 curled, 1 uncurled; and how much the tail whips (0..1). */
  uncurl: number;
  whip: number;
  /** 0..1: colour show (fast), the dark of camouflage, a stiff freeze. */
  show: number;
  dark: number;
  freeze: number;
  /** Rocking in place, 0..1. */
  sway: number;
  lift: number;
  crouch: number;
  face: Expression | null;
  /** The jaw: 0 shut, 1 wide (about 34 degrees). */
  jaw: number;
  /** Turned right side-on, so a tongue goes across the screen (0..1). */
  profile: number;
  /** The turrets' lift (degrees, left and right). */
  eyeUp: [number, number];
  /** A flush of red across the panels (0..1). */
  flush: number;
  /** The body drawn back from where the feet are (metres). */
  slide: number;
  spin: number;
  /** A display: the body flattens sideways and stands tall, the colours flare (0..1). */
  puff: number;
  /** Bands racing along the body (0..1). */
  race: number;
  /** Rolled onto its side (degrees), and the drop that goes with it (0..1). */
  roll: number;
  drop: number;
  /** A dead leaf in a breeze (0..1). */
  flutter: number;
  /** The walk's pace (1 is its own). */
  pace: number;
  /** The type's own lights glowing (0..1). */
  glow: number;
}
const fresh = (): Want => ({
  ...freshTongue(),
  jaw: 0,
  profile: 0,
  eyeUp: [0, 0],
  flush: 0,
  slide: 0,
  eyes: null,
  head: [0, 0, 0],
  body: [0, 0, 0],
  uncurl: 0,
  whip: 0,
  show: 0,
  dark: 0,
  freeze: 0,
  sway: 0,
  lift: 0,
  crouch: 0,
  face: null,
  spin: 0,
  puff: 0,
  race: 0,
  roll: 0,
  drop: 0,
  flutter: 0,
  pace: 1,
  glow: 0,
});

export abstract class Chameleons extends Character {
  protected want = fresh();
  protected cham: ChamKit;
  private pokes: number[] = [];
  private hover = 0;
  private cyc = 0;
  private hue = Math.random();
  private shown = 0;
  private raced = 0;
  private puffed = 0;
  private darkNow = 0;
  private frame: Env['frame'] | null = null;
  protected env: Env | null = null;
  protected faceSide = 1;
  /** The tongue and the fly. */
  protected tg: Tongue;
  private prevK = 0;

  constructor(model: Object3D, kit: ChamKit) {
    const slow = kit.mass ?? 1;
    const tail = (f: number) => ({ f: f / slow, zeta: 0.35 });
    super(
      {
        name: kit.name,
        model: kit.model,
        metres: kit.metres,
        width: kit.width,
        size: kit.size,
        feels: {
          default: { f: 5 / slow, zeta: 0.6 },
          root: { f: 3 / slow, zeta: 0.6 },
          body: { f: 3.5 / slow, zeta: 0.55 },
          head: { f: 4 / slow, zeta: 0.5, r: 0.3 },
          'eye.L': { f: 6, zeta: 0.45 },
          'eye.R': { f: 6, zeta: 0.45 },
          jaw: { f: 9, zeta: 0.55 },
          ...Object.fromEntries(TAIL.map((b, i) => [b, tail(3 + i * 0.25)])),
        },
        face: kit.face,
        eyes: kit.eyes,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.7 },
          { bone: 'body', yaw: 0.2, pitch: 0 },
          { bone: 'eye.L', yaw: 0.9, pitch: 0.5 },
          { bone: 'eye.R', yaw: 0.9, pitch: 0.5 },
        ],
        reach: { yaw: 60, pitch: 30 },
        lag: 2 / slow,
        entrance: 'walk',
        edges: ['bottom', 'bottom', 'bottom', 'left', 'right'],
        stay: [45, 100],
        speed: kit.dip,
        turn: 85,
      },
      model,
    );
    this.cham = kit;
    this.tg = new Tongue(this.puppet, model, kit.tongue.out, kit.tongue.pad);
    this.acts = this.moves();
  }

  /** The room there is to walk, in px, one way. */
  protected room(dir: number) {
    const f = this.frame;
    if (!f) return this.heightPx * 2;
    const [lo, hi] = this.span(f);
    return Math.max(0, (dir > 0 ? hi - this.s : this.s - lo) - this.widthPx() * 0.5);
  }

  /** Walk this many heights, one way or the other. */
  protected go(lo: number, hi: number) {
    const dir = Math.random() < 0.5 ? -1 : 1;
    const d = this.room(dir) > this.room(-dir) * 0.5 ? dir : -dir;
    const far = Math.min(this.room(d), this.heightPx * (lo + Math.random() * (hi - lo)));
    this.walkTo(this.s + d * far, Math.random() < 0.7 ? Math.random() : undefined);
  }

  /** The nearest crewmate standing on the floor with it, and which way (+1 toward +s, or -1).
   * A flier in free flight (Bolt) is left out: the tongue can't reach into the air. */
  protected nearestMate(): { mate: Character; side: number; dx: number } | null {
    const env = this.env;
    if (!env || !this.frame) return null;
    const me = this.floorPoint(this.frame);
    let best: { mate: Character; side: number; dx: number } | null = null;
    for (const o of env.crew) {
      if (o === this || o.state !== 'here' || o.edge !== 'bottom' || o.free) continue;
      const dx = o.floorPoint(this.frame).x - me.x;
      if (!best || Math.abs(dx) < Math.abs(best.dx))
        best = { mate: o, side: Math.sign(dx) || 1, dx };
    }
    return best;
  }

  /** The way to the nearest crewmate on the floor with it, as +1 (toward +s) or -1, or 0. */
  protected mateSide(): number {
    return this.nearestMate()?.side ?? 0;
  }

  private moves(): Record<string, Act> {
    const p = () => this.puppet;
    const w = () => this.want;
    const rest = () => !this.walking;
    const floor = () => !this.walking && this.edge === 'bottom';
    const wall = () => !this.walking && this.edge !== 'bottom';
    const go = (lo: number, hi: number) => this.go(lo, hi);
    return {
      idle: { weight: 3, length: [2.5, 5] },
      // The hesitant rocking walk: forward, back, forward.
      stroll: { weight: 3, length: [6, 8], when: rest, start: () => go(1.2, 3) },
      ...this.tongueActs(),
      // A slow colour shift: the panels walk through the hues, one after the other.
      colourShift: {
        weight: 2.2,
        length: [7, 7],
        when: rest,
        pose: (t) => {
          w().show = ramp(t, 0, 1.2) * (1 - ramp(t, 5.8, 6.8));
          w().head = [-4 * w().show, 0, 0];
          w().face = 'happy';
          w().sway = 0.4 * w().show;
        },
      },
      // Curls up the tail, uncurls it into a long wave, curls it back.
      tailCurl: {
        weight: 2,
        length: [6.5, 6.5],
        when: rest,
        pose: (t) => {
          const out = ramp(t, 0, 1.4) * (1 - ramp(t, 4.4, 5.8));
          w().uncurl = out;
          w().whip = 0.5 * out * ramp(t, 1.6, 2.2) * (1 - ramp(t, 3.8, 4.4));
          w().head = [0, 14 * Math.sin(t * 1.1) * out, 0];
          w().face = out > 0.5 ? 'happy' : 'neutral';
        },
      },
      // The tail whirls round like a propeller, the whole body leaning into it.
      tailSpin: {
        weight: 1,
        length: [4.4, 4.4],
        when: floor,
        pose: (t) => {
          const k = ramp(t, 0, 0.6) * (1 - ramp(t, 3.6, 4.3));
          w().uncurl = k;
          w().whip = 1.3 * k;
          w().body = [0, 0, 5 * Math.sin(t * 6) * k];
          w().show = 0.5 * k;
          w().face = 'surprised';
        },
      },
      // Freezes stiff, one eye swivelling about, the other fixed.
      freeze: {
        weight: 1.6,
        length: [4.5, 4.5],
        when: rest,
        pose: (t) => {
          w().freeze = 1;
          w().eyes = [
            [0, 55 * Math.sign(sin(t, 0.45)) * Math.min(1, Math.abs(Math.sin(t * 2.2)) * 3)],
            [0, 0],
          ];
          w().face = 'focused';
          w().head = [-4, 0, 0];
        },
      },
      // Sways like a leaf in a wind: rocking side to side and forward and back.
      leaf: {
        weight: 1.8,
        length: [6, 6],
        when: floor,
        pose: (t) => {
          const k = ramp(t, 0, 1) * (1 - ramp(t, 5, 6));
          w().sway = k;
          w().show = 0.3 * k;
          w().face = 'sleepy';
          w().head = [0, 0, 8 * Math.sin(t * 1.8) * k];
        },
      },
      // Goes dark, panels out, and holds perfectly still; flickers back on.
      camouflage: {
        weight: 1.4,
        length: [6, 6],
        when: rest,
        pose: (t) => {
          w().dark = ramp(t, 0, 1.2) * (1 - ramp(t, 4.6, 4.7));
          w().freeze = 1;
          w().face = 'neutral';
          if (t > 4.6) w().show = 0.7 * ramp(t, 4.6, 4.8) * (1 - ramp(t, 5, 6));
        },
      },
      // The eyes go their own ways, like a chameleon's: a long look round.
      lookAround: {
        weight: 2,
        length: [6, 6],
        when: rest,
        pose: (t) => {
          w().eyes = [
            [8 * Math.sin(t * 1.3), 55 * Math.sin(t * 0.9)],
            [8 * Math.sin(t * 1.1 + 1), 55 * Math.sin(t * 0.7 + 2)],
          ];
          w().head = [0, 14 * Math.sin(t * 0.5), 0];
        },
      },
      // Sinks low and naps, eyes closed.
      nap: {
        weight: 1.2,
        length: [8, 14],
        when: floor,
        pose: (t) => {
          const k = ramp(t, 0, 1.5);
          w().crouch = k;
          w().head = [10 * k, 0, 0];
          w().eyes = [
            [-35 * k, 0],
            [-35 * k, 0],
          ];
          w().face = k > 0.7 ? 'asleep' : 'sleepy';
          w().dark = 0.5 * k;
        },
      },
      cling: {
        weight: 3,
        length: [4, 7],
        when: wall,
        pose: (t) => {
          w().head = [-8, 24 * Math.sin(t * 0.8), 0];
          w().eyes = [
            [0, 40 * Math.sin(t * 1.2)],
            [0, 40 * Math.sin(t * 0.9 + 1)],
          ];
          w().sway = 0.3;
        },
      },
      climb: { weight: 3, length: [6, 8], when: wall, start: () => go(1.2, 2.6) },
      dizzy: {
        weight: 0,
        length: [4, 4],
        pose: (t) => {
          const k = 1 - ramp(t, 2.8, 4);
          w().spin = 2 * Math.PI * 2 * ramp(t, 0.2, 2.8);
          w().show = k;
          w().uncurl = 0.6 * k;
          w().whip = k;
          w().eyes = [
            [10 * Math.cos(t * 7) * k, 50 * Math.sin(t * 7) * k],
            [10 * Math.cos(t * 7.5) * k, -50 * Math.sin(t * 7.5) * k],
          ];
          w().face = 'dizzy';
        },
      },
      startle: {
        weight: 0,
        length: [1.8, 1.8],
        pose: (t) => {
          const k = 1 - ramp(t, 0.6, 1.7);
          w().show = k;
          w().whip = 1.2 * k;
          w().uncurl = 0.8 * k;
          w().lift = t < 0.5 ? 0.04 * Math.sin((t / 0.5) * Math.PI) : 0;
          w().body = [-8 * k, 0, 0];
          w().face = 'surprised';
          p().add('head', -10 * k);
        },
      },
    };
  }

  /**
   * Both turrets on a point in the creature's space, each its own way (a chameleon's eyes
   * swivel apart): the left on `l`, the right on `r`.
   */
  protected watch(l: Pt, r: Pt = l) {
    const turret = (side: 1 | -1, at: Pt) => {
      const e = side > 0 ? this.tg.eyes.L : this.tg.eyes.R;
      const vx = at[0] - e.x;
      const vy = at[1] - e.y;
      const vz = at[2] - e.z;
      const phi = Math.atan2(vz, side * vx);
      return [
        clamp((-side * phi) / DEG, -112, 112),
        (side * Math.atan2(vy, Math.hypot(vx, vz))) / DEG,
      ] as const;
    };
    const [yl, ul] = turret(1, l);
    const [yr, ur] = turret(-1, r);
    this.want.eyes = [
      [0, yl],
      [0, yr],
    ];
    this.want.eyeUp = [ul, ur];
  }

  /** Which way a fly points flying from one place to the next (yaw, pitch, roll in degrees). */
  protected flyHeading(a: Pt, b: Pt, bank = 0): Pt {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    if (Math.hypot(dx, dy, dz) < 1e-5) return [0, 0, bank];
    return [Math.atan2(dx, dz) / DEG, (-0.7 * Math.atan2(dy, Math.hypot(dx, dz))) / DEG, bank];
  }

  /** Turning side-on for a shot: in over 0.8 s, and back out over a second from `out`. */
  protected profileAt(t: number, out: number) {
    return sm(t / 0.8) * (1 - sm((t - out) / 1));
  }

  /**
   * A tiny robot fly buzzes in and loops round, the turrets on it; the head turns side-on and
   * the tongue snaps; the fly comes back stuck to the pad, the jaw chews, a spark of a burp.
   * `miss`: the fly dodges, the tongue comes back empty and the fly loops past cheekily while
   * the chameleon goes cross, a red flush across its panels. `offer`: the caught fly is held
   * out on the tongue toward a crewmate before it is eaten. `wave`: a colour wave runs down
   * the tongue and body on a catch. `size` the fly's (a gnat is 0.22), `share` how far ahead
   * of the snout it hovers (of the tongue's length).
   */
  protected catchAct(o: {
    weight: number;
    miss?: boolean;
    offer?: boolean;
    wave?: boolean;
    /** The fly lands on the nose first and sits there, the eyes crossing, before it takes off. */
    nose?: boolean;
    size?: number;
    share?: number;
    start?: () => void;
    when?: () => boolean;
  }): Act {
    const w = () => this.want;
    const tg = this.tg;
    const L = tg.reach;
    const O = tg.origin;
    const T0 = o.offer ? 0.5 : 0.9;
    const TL = 5.4;
    const TF = o.offer ? 3 : o.nose ? 8 : 4.4;
    const fast = o.offer ? 0.7 : 1;
    const hover = tg.ahead(o.share ?? 0.7);
    const far: Pt = [hover[0], hover[1] + 0.3, hover[2] + L * 0.5];
    const dodge: Key[] = [
      [TF + 0.02, hover],
      [TF + 0.4, [hover[0] + 0.05, hover[1] + 0.16, hover[2] + 0.1 * L]],
      [TF + 1.3, [O.x + 0.06, O.y + 0.22, O.z - 0.12]],
      [TF + 2.2, [O.x + 0.1, O.y + 0.02, O.z + tg.snout + 0.04]],
      [TF + 3, [O.x - 0.05, O.y + 0.5, O.z + tg.snout + 0.9 * L]],
    ];
    const nose: Pt = [O.x, O.y + 0.03, O.z + tg.snout + 0.014];
    const onNose = (t: number) =>
      o.nose ? sm((t - (T0 + 2.1)) / 0.15) * (1 - sm((t - TL) / 0.12)) : 0;
    const fly = (t: number): Pt => {
      if (o.nose && t < TL + 1.4) {
        const u = sm((t - T0) / 2.2);
        const v = sm((t - TL) / 1.3);
        const ph = 5.4 * (t - T0);
        const r = (1 - u) * 0.2 * L + 0.004;
        const a = lerp3(far, nose, u);
        const b = lerp3(a, hover, v);
        return [b[0], b[1] + r * Math.sin(ph), b[2] + r * Math.cos(ph)];
      }
      if (o.miss && t > TF + 0.02) return path(dodge, t);
      const u = sm((t - T0) / (3.1 * fast));
      const ph = 5.4 * (t - T0);
      const r = (1 - u) * 0.2 * L + 0.01;
      const base = lerp3(far, hover, u);
      return [
        base[0] + 0.05 * (1 - u) * Math.sin(ph * 0.5),
        base[1] + r * Math.sin(ph),
        base[2] + r * Math.cos(ph),
      ];
    };
    const size = (o.size ?? 1) * 2.2;
    const end = o.offer ? 6.2 : 0;
    const len = o.miss ? 8.2 : o.offer ? 9.4 : o.nose ? 12.6 : 8.8;
    return {
      weight: o.weight,
      length: [len, len],
      when: o.when ?? (() => !this.walking && this.edge === 'bottom'),
      start: o.start,
      pose: (t) => {
        const s = shot(t, TF);
        const where = fly(t);
        w().profile = this.profileAt(t, o.miss ? 7 : o.offer ? 8.2 : o.nose ? 11.6 : 7.7);
        if (t > 0.3) this.watch(t > T0 ? where : tg.ahead(0.5), fly(Math.max(t - 0.16, T0)));
        if (t > T0)
          w().head = [
            clamp((-0.5 * Math.atan2(where[1] - O.y, where[2] - O.z)) / DEG, -22, 22),
            0,
            0,
          ];
        w().body = [-3 * sm((t - T0) / 1), 0, 0];
        w().freeze = 1;
        const caught = !o.miss && t >= s.hitAt - 0.01;
        // The offer: the tongue is held out part of the way, the fly on the pad, then taken in.
        let k = s.k;
        if (o.offer && t > s.backAt) {
          k = t < end ? 1 - 0.4 * sm((t - s.backAt) / 0.5) : 0.6 * (1 - sm((t - end) / 0.6));
          if (t < end) {
            w().wob = 0.3;
            w().wobT = t;
          }
        }
        const gone = o.offer ? end + 0.6 : s.endAt;
        w().tongue = k;
        w().hit = s.hit;
        if (!o.offer || t < s.backAt) {
          w().wob = s.wob;
          w().wobT = s.wobT;
        }
        w().target = { at: where };
        w().lock = !!o.miss && t > TF - 0.25;
        const vis =
          sm((t - T0) / 0.35) *
          (o.miss
            ? 1 - sm((t - (TF + 2.6)) / 0.45)
            : t > gone - 0.14
              ? 1 - sm((t - (gone - 0.14)) / 0.14)
              : 1);
        w().fly =
          vis > 0.01 && t > T0
            ? {
                at: where,
                size: vis * size,
                turn: this.flyHeading(where, fly(t + 0.04), 14 * Math.sin(t * 9)),
                buzz: caught ? 0.35 : 1,
                onPad: caught ? sm((t - (s.hitAt - 0.02)) / 0.05) : 0,
                onHead: o.nose ? { at: nose, k: onNose(t) } : undefined,
              }
            : null;
        // The mouth: open for the shot, then chewing, then a small burp.
        const ce = gone + 0.05;
        const cn = gone + 1.85;
        const chew = caught ? sm((t - ce) / 0.15) * (1 - sm((t - cn) / 0.2)) : 0;
        const bt = t - (cn + 0.5);
        const burp = caught && bt > 0 && bt < 0.4 ? Math.sin((bt / 0.4) * Math.PI) : 0;
        const held = o.offer && t > s.backAt && t < end ? 0.2 : s.jaw;
        w().jaw = held + chew * (0.1 + 0.12 * (0.5 + 0.5 * Math.sin((t - ce) * 14))) + 0.45 * burp;
        w().glow = burp;
        w().puff = 0.3 * burp;
        w().face = !o.miss
          ? burp > 0.2
            ? 'surprised'
            : t > s.hitAt
              ? 'happy'
              : 'focused'
          : 'focused';
        if (o.miss && t > s.endAt) {
          const mad = sm((t - s.endAt) / 0.3) * (1 - sm((t - (TF + 3.6)) / 1));
          w().flush = mad;
          w().face = mad > 0.3 ? 'cross' : 'focused';
          w().head = [
            4 * mad,
            14 * Math.sin((t - s.endAt) * 11) * mad * (1 - sm((t - TF - 1.6) / 0.6)),
            0,
          ];
          w().glow = mad;
        }
        if (o.wave && caught) {
          const k2 = sm((t - s.hitAt) / 0.3) * (1 - sm((t - s.hitAt - 3) / 1.2));
          w().show = k2;
          w().race = k2;
          w().glow = Math.max(w().glow, k2);
        }
      },
    };
  }

  /**
   * Offers the caught fly to the nearest crewmate: she walks up to them until the tongue's tip
   * (the fly held 0.7 of its length out) is at their face, turns side-on to them, and only then
   * does the shot, which is the catch act's offer, timed from her arrival. Their side is kept
   * up to date as they wander, so she always faces them.
   */
  private shareAct(): Act {
    const inner = this.catchAct({ weight: 1.4, offer: true, share: 0.7 });
    const tg = this.tg;
    const len = inner.length[0];
    let arrived = -1;
    // Stand so that the tongue's tip, 0.7 of the way out, is just short of their middle.
    const approach = () => {
      const n = this.nearestMate();
      if (!n) return;
      const wide = n.mate.heightPx * (n.mate.spec.width / n.mate.spec.metres);
      const gap = (tg.snout + 0.7 * tg.reach) * this.px + wide * 0.3;
      if (Math.abs(n.dx) > gap * 1.1) this.walkTo(this.s + n.dx - n.side * gap, n.mate.depth);
    };
    return {
      ...inner,
      when: () => !this.walking && this.edge === 'bottom' && this.mateSide() !== 0,
      start: () => {
        arrived = -1;
        this.actLength = len + 14;
        const n = this.nearestMate();
        if (!n) return;
        this.faceSide = n.side;
        approach();
      },
      pose: (t) => {
        const n = this.nearestMate();
        if (n) this.faceSide = n.side;
        if (arrived < 0) {
          // Still on the way: they may have wandered, so aim again.
          if (t < 14) approach();
          this.actLength = t + len + 2;
          if (this.walking && t < 14) return;
          arrived = t;
          this.actLength = t + len;
        }
        inner.pose?.(t - arrived);
      },
    };
  }

  private tongueActs(): Record<string, Act> {
    const w = () => this.want;
    const tg = this.tg;
    const rest = () => !this.walking;
    const floor = () => !this.walking && this.edge === 'bottom';
    const mate = () => floor() && this.mateSide() !== 0;
    return {
      // A snap at a fly that isn't there, side-on: the tongue shoots across the screen, a gulp.
      tongueSnap: {
        weight: 1.2,
        length: [5.4, 5.4],
        when: floor,
        pose: (t) => {
          w().profile = this.profileAt(t, 4.4);
          const s = shot(t, 3);
          if (t < 2.9) {
            const fx = Math.sin(t * 1.9) + 0.4 * Math.sin(t * 5.3);
            const fy = 0.6 * Math.sin(t * 1.6 + 1);
            const at = tg.ahead(0.6 + 0.1 * fx, 0.03 * fy);
            at[0] += 0.05 * fx;
            this.watch(at, tg.ahead(0.6 - 0.1 * fx, -0.03 * fy));
            w().head = [-3, 0, 0];
            w().freeze = 1;
            w().face = 'focused';
          }
          w().tongue = s.k;
          w().len = 0.95;
          w().hit = s.hit;
          w().wob = s.wob;
          w().wobT = s.wobT;
          w().jaw = s.jaw;
          if (t > 3) {
            w().head = [-6 * (1 - sm((t - 3.6) / 0.6)), 0, 0];
            w().face = t > s.hitAt + 0.3 ? 'happy' : 'focused';
            if (t > s.endAt)
              w().head = [5 * Math.sin(t * 10) * (1 - sm((t - s.endAt) / 0.6)), 0, 0];
          }
        },
      },
      catchFly: this.catchAct({ weight: 2.4 }),
      miss: this.catchAct({ weight: 1.5, miss: true }),
      share: this.shareAct(),
      // Shoots at the ground ahead, the pad sticks and the tongue goes taut as it leans back,
      // then pops free and boings.
      stick: {
        weight: 1.4,
        length: [6.4, 6.4],
        when: floor,
        pose: (t) => {
          const TF = 1.4;
          const s = shot(t, TF, 0.12, 2, 0.34);
          const at: Pt = tg.ahead(0.8);
          at[1] = 0.012;
          w().profile = this.profileAt(t, 5.4);
          w().tongue = s.k;
          w().hit = Math.max(s.hit, s.k >= 1 && t < s.backAt ? 0.45 : 0);
          w().wob = 1.5 * s.wob;
          w().wobT = s.wobT;
          w().target = { at, hold: t > TF && t < s.backAt };
          const lean = sm((t - s.hitAt - 0.15) / 1.5) * (1 - sm((t - s.backAt) / 0.1));
          w().slide = 0.06 * lean;
          w().taut = lean;
          w().body = [-7 * lean, 0, 0];
          w().jaw = 0.6 * s.jaw;
          w().eyes = [
            [0, -30 * sm((t - 0.5) / 0.5)],
            [0, 30 * sm((t - 0.5) / 0.5)],
          ];
          w().face =
            t < TF + 0.1
              ? 'focused'
              : lean > 0.2 && t < s.backAt
                ? 'cross'
                : t > s.backAt
                  ? 'surprised'
                  : 'focused';
          if (t > s.endAt + 0.8) w().face = 'happy';
        },
      },
      // Cleans one turret with the tip of the tongue, then the other.
      eyeLick: {
        weight: 1.4,
        length: [6.8, 6.8],
        when: rest,
        pose: (t) => {
          const side = t < 3.4 ? 1 : -1;
          const l = t < 3.4 ? t - 0.2 : t - 3.5;
          const turn = sm(l / 0.5) * (1 - sm((l - 2.7) / 0.4));
          const k = sm((l - 0.55) / 0.3) * (1 - sm((l - 2.2) / 0.5));
          w().eyes =
            side > 0
              ? [
                  [0, -78 * turn],
                  [0, 0],
                ]
              : [
                  [0, 0],
                  [0, 78 * turn],
                ];
          const e = side > 0 ? tg.eyes.L : tg.eyes.R;
          const cur = this.puppet.current(side > 0 ? 'eye.L' : 'eye.R')[1] * DEG;
          const lens = this.cham.tongue.lens;
          const rub = k * (0.006 * Math.sin(l * 17));
          w().tongue = k;
          w().target = {
            at: [
              e.x + side * lens * Math.cos(cur),
              e.y + 0.4 * rub,
              e.z - side * lens * Math.sin(cur) + rub,
            ],
            head: true,
          };
          w().hit = 0.3 * k;
          w().head = [4 * turn, 0, side * -7 * turn];
          w().jaw = 0.4 * k;
          w().face = k > 0.4 ? 'sheepish' : 'neutral';
        },
      },
      // Just the tip out for a moment.
      blep: {
        weight: 1.6,
        length: [3.2, 3.2],
        when: rest,
        pose: (t) => {
          const k = sm(t / 0.12) * (1 - sm((t - 1.6) / 0.3));
          w().tongue = k;
          w().len = 0.1;
          w().hit = 0.3 * k * (0.5 + 0.5 * Math.sin(t * 11));
          w().jaw = 0.3 * k;
          w().head = [-4 * k, 0, 0];
          w().face = k > 0.5 ? 'sheepish' : 'neutral';
        },
      },
      // The tongue half out, its tip twirling round in loops like a yo-yo.
      twirl: {
        weight: 1.2,
        length: [7, 7],
        when: floor,
        pose: (t) => {
          const out = sm((t - 0.9) / 0.35) * (1 - sm((t - 5) / 0.6));
          w().profile = this.profileAt(t, 5.8);
          w().tongue = out;
          w().len = 0.62;
          w().twirl = sm((t - 1.2) / 0.5) * (1 - sm((t - 4.6) / 0.4));
          w().twirlT = t;
          w().jaw = 0.55 * out;
          w().hit = 0.25 * out;
          w().face = out > 0.5 ? 'happy' : 'neutral';
        },
      },
    };
  }

  poke() {
    if (this.state !== 'here') return;
    const now = performance.now() / 1000;
    this.pokes = [...this.pokes.filter((at) => now - at < 3), now];
    this.goal = null;
    if (this.pokes.length >= 3) {
      this.pokes = [];
      this.setAct('dizzy');
    } else if (this.act !== 'dizzy') this.setAct(Math.random() < 0.3 ? 'blep' : 'startle');
  }

  protected onEnter() {
    this.spec.speed = this.cham.dip;
  }

  protected idle(t: number) {
    const p = this.puppet;
    this.want = fresh();
    p.add('body', 1.2 * sin(t, 0.3));
    p.add('head', 1.5 * sin(t, 0.2), 4 * sin(t, 0.09), 0);
    // The turrets drift on their own.
    p.add('eye.L', 4 * sin(t, 0.23), 14 * sin(t, 0.17), 0);
    p.add('eye.R', 4 * sin(t, 0.21, 0.4), 14 * sin(t, 0.19, 0.3), 0);
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    const w = this.want;
    const act = this.act;
    const dip = this.cham.dip;
    const swing = this.cham.gait ?? 1;
    this.frame = env.frame;
    this.env = env;
    this.hover = this.hovered ? this.hover + dt : 0;
    if (this.hover > 0.9 && act === 'idle') this.setAct('colourShift');
    const bot = env.frame.bot;
    const pace = w.pace;
    const moving = clamp(this.stride / (dip * pace * bot * 0.9), 0, 1.5);

    // The rocking walk: a step forward, a hesitant lean back, a step forward again.
    let rock = 0;
    if (moving > 0.04) {
      this.cyc = (this.cyc + dt * 0.45 * pace) % 1;
      const c = this.cyc;
      rock = Math.sin(c * 2 * Math.PI) + 0.45 * Math.sin(c * 4 * Math.PI + 0.6);
      const fwd = Math.max(0, Math.sin(c * 2 * Math.PI + 0.2));
      this.spec.speed = dip * pace * (0.08 + 1.9 * fwd * fwd);
    } else {
      this.spec.speed = dip * pace;
      this.cyc = 0;
    }
    const g = this.cyc * 2 * Math.PI;
    const amount = clamp(moving * 1.4, 0, 1);
    // Diagonal pairs lift slowly, set down carefully; the body leans with the rock.
    for (const [upper, lower, side, end] of LEGS) {
      const phase = side * end > 0 ? 0 : Math.PI;
      const s = Math.sin(g + phase);
      const raise = Math.max(0, Math.cos(g + phase)) * amount;
      p.add(upper, (-14 * s * amount - 8 * raise) * swing, 0, side * 14 * raise * swing);
      p.add(lower, 16 * raise * swing, 0, side * 6 * raise * swing);
    }
    p.add('body', 5 * rock * amount * swing, 4 * Math.sin(g) * amount, 3 * Math.cos(g) * amount);
    p.add('head', -4 * rock * amount, -3 * Math.sin(g) * amount, 0);

    // Standing still on the floor she stands side-on to us, her profile showing, her head
    // turned back toward the viewer (and the mouse); walking, the base class turns her.
    if (this.edge === 'bottom' && this.stride > 2)
      this.faceSide = Math.sign(this.heading.y) || this.faceSide;
    // For a tongue shot she turns right side-on (profile), her head straight along her body.
    const prof = w.profile;
    const side = this.edge === 'bottom' ? this.faceSide * (68 + 22 * prof) * (1 - amount) : 0;
    p.add('root', 0, side, 0);
    p.add('head', 0, -side * 0.7 * (1 - prof), 0);
    p.add('jaw', 34 * w.jaw);
    p.shift('body', 0, 0, -w.slide);

    // Body.
    const sway = w.sway;
    p.add('body', 0, 0, 5 * sway * Math.sin(env.time * 1.6));
    p.add('body', 4 * sway * Math.sin(env.time * 1.1), 0, 0);
    // A dead leaf in a breeze: rocking and tipping, never quite the same twice.
    const fl = w.flutter;
    if (fl > 0) {
      p.add(
        'body',
        7 * fl * Math.sin(env.time * 1.9) + 4 * fl * Math.sin(env.time * 3.1),
        6 * fl * Math.sin(env.time * 1.3 + 1),
        13 * fl * Math.sin(env.time * 1.7) + 5 * fl * Math.sin(env.time * 2.9 + 2),
      );
      p.add('head', 4 * fl * Math.sin(env.time * 2.3 + 1), 0, 0);
      for (const [upper, lower, sd] of LEGS) {
        p.add(upper, 4 * fl * Math.sin(env.time * 1.7 + sd), 0, sd * 5 * fl);
        p.add(lower, 0, 0, -sd * 4 * fl);
      }
    }
    p.add('body', w.body[0], w.body[1], w.body[2] + w.roll);
    p.shift(
      'root',
      0,
      w.lift -
        0.05 * w.crouch -
        (this.cham.lay ?? 0.08) * w.drop +
        0.004 * fl * Math.sin(env.time * 3.3),
      0,
    );
    for (const [upper, lower, sd] of LEGS) {
      p.add(upper, 0, 0, sd * 30 * w.crouch);
      p.add(lower, 0, 0, -sd * 20 * w.crouch);
    }
    p.add('head', w.head[0], w.head[1], w.head[2]);
    if (w.eyes) {
      p.add('eye.L', w.eyes[0][0], w.eyes[0][1], w.eyeUp[0]);
      p.add('eye.R', w.eyes[1][0], w.eyes[1][1], w.eyeUp[1]);
    }

    // The tail: wound up, or uncurled and waving.
    const curl = this.cham.curl;
    TAIL.forEach((bone, i) => {
      const lag = i * 0.6;
      const wave = 10 * Math.sin(env.time * 2.2 - lag) * (0.3 + w.uncurl);
      const whip = 25 * w.whip * Math.sin(env.time * 9 - lag);
      const un = (i === 0 ? 0 : -curl) * w.uncurl;
      const walk = 5 * amount * Math.sin(g - lag);
      const breathe = 1.5 * sin(env.time, 0.3, -i * 0.1) * (1 - w.uncurl);
      p.add(bone, un + (w.uncurl > 0.05 ? wave : breathe), whip + walk, 0);
    });

    if (w.face) this.expression = w.face;
    else this.expression = this.hovered ? 'happy' : 'neutral';

    this.shown += (w.show - this.shown) * Math.min(1, dt * 3);
    this.raced += (w.race - this.raced) * Math.min(1, dt * 3);
    this.puffed += (w.puff - this.puffed) * Math.min(1, dt * 4);
    this.darkNow += (w.dark - this.darkNow) * Math.min(1, dt * 3);
    // The hue drifts all the time, quicker in the show.
    this.hue = (this.hue + dt * (0.015 + 0.2 * this.shown + 0.25 * this.raced)) % 1;
  }

  private colour = new Color();

  protected after(_dt: number, env: Env) {
    const p = this.puppet;
    const w = this.want;
    const o = this.outfit;
    // The tongue and the fly, direct.
    this.tg.frame(w, env.time);
    const moving = clamp(Math.abs(w.tongue - this.prevK) / Math.max(_dt, 1e-3) / 1.5, 0, 1);
    this.prevK = w.tongue;
    this.pivot.rotation.y = w.spin;
    // The display: flat from side to side, tall, the whole body drawn up.
    const pf = this.puffed;
    p.stretch('body', 1 - 0.28 * pf, [1, 0, 0], 1);
    p.bone('body').scale.y *= 1 + 0.2 * pf;
    if (!o) return;
    const t = env.time;
    const dark = this.darkNow;
    const asleep = this.expression === 'asleep';
    const kit = this.cham;
    const lt = kit.lights;
    const spread0 = lt.spread ?? [0.12, 0.2];
    const phase = lt.phase ?? 1.4;
    const lo = kit.hues?.[0] ?? 0;
    const hi = kit.hues?.[1] ?? 1;
    // The panels: each its own hue (and its own beat, so in ink and paper the tone moves
    // instead), spaced round the wheel; the show spreads them and quickens the beat, and a
    // race sends it running down the bands.
    lt.bands.forEach((dot, i) => {
      const spread = spread0[0] + spread0[1] * Math.max(this.shown, this.raced);
      const x = this.hue + i * spread;
      const h = kit.hues
        ? lo + (hi - lo) * (0.5 + 0.5 * Math.sin(2 * Math.PI * x))
        : ((x % 1) + 1) % 1;
      const beat = 0.5 + 0.5 * Math.sin(t * (0.9 + 2.5 * this.shown + 5 * this.raced) - i * phase);
      const level = clamp(
        (0.35 + 0.55 * beat) * (1 - dark) * (asleep ? 0.3 : 1) + 0.5 * this.puffed,
        0,
        1,
      );
      this.colour.setHSL(h, kit.sat ?? 0.85, kit.lum ?? 0.58);
      // A flush of temper: red across every panel.
      if (w.flush > 0) this.colour.lerp(RED, clamp(w.flush * 1.2, 0, 1));
      o.dot(dot, Math.max(level, 0.9 * w.flush), `#${this.colour.getHexString()}`);
    });
    const crest = clamp(
      (0.4 + 0.5 * Math.sin(t * 1.3) + 0.3 * this.puffed + 0.3 * w.glow) * (1 - dark),
      0,
      1,
    );
    this.colour.setHSL((this.hue + 0.5) % 1, 0.85, 0.6);
    if (kit.hues) this.colour.setHSL(lo + (hi - lo) * 0.7, 0.85, 0.62);
    o.dot(lt.crest, crest, `#${this.colour.getHexString()}`);
    o.dot(lt.tip, clamp((0.35 + 0.3 * Math.sin(t * 2.1)) * (1 - dark), 0, 1));
    lt.extras?.forEach((e, i) => {
      const level = clamp(
        (e.base + 0.3 * Math.sin(t * 1.7 - i * 1.3) + 0.5 * w.glow + 0.3 * this.puffed) *
          (1 - dark),
        0,
        1,
      );
      o.dot(e.dot, level * (asleep ? 0.3 : 1), e.colour);
    });
    // The tongue's lit seams (a run of light as it shoots out and back), its pad's ring (a
    // flare on impact), and the fly's wings.
    const kk = clamp(w.tongue, 0, 1);
    const seams = [0, 0, 0, 0];
    for (let j = 0; j < 7; j++) {
      const run = Math.exp(-((j - 6.5 * kk) ** 2) / 2.2) * moving;
      const level = 0.4 + 0.18 * Math.sin(t * 2.3 - j * 0.9) + 0.55 * Math.max(run, w.hit * 0.8);
      seams[j % 4] = Math.max(seams[j % 4], level);
    }
    const rainbow = kit.tongue.rainbow;
    seams.forEach((level, i) => {
      if (rainbow) this.colour.setHSL((t * 0.3 + i * 0.13) % 1, 0.9, 0.6);
      o.dot(
        9 + i,
        clamp(level, 0, 1) * (1 - dark),
        rainbow ? `#${this.colour.getHexString()}` : undefined,
      );
    });
    if (rainbow) this.colour.setHSL((t * 0.45) % 1, 0.95, 0.6);
    o.dot(
      13,
      clamp(0.45 + 0.15 * Math.sin(t * 3) + 0.6 * w.hit, 0, 1),
      rainbow ? `#${this.colour.getHexString()}` : undefined,
    );
    o.dot(14, 0.9);
    o.beacon(BEACON[this.expression] ?? BEACON.neutral!);
  }
}
