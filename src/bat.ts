import type { Object3D } from 'three';
import { type Act, ANGLE, Character, clamp, type Edge, type Env, envelope } from './character';
import type { FaceLayout } from './face';
import type { Puppet } from './puppet';
import { sin } from './moves';
import { Spring } from './spring';

/**
 * Ping, the robot bat: a small round toy that lives on the ceiling. He hangs from the top
 * edge by his hook feet with his wings folded round him like a cloak, sleeps, wakes,
 * lets go and drops into flight, flits about in quick erratic loops and hooks back onto
 * the ceiling. His ears are big satellite dishes, each with a glowing feed bulb and three
 * rings of lights: his signature is the ping. Rings of light run outward from the middle
 * of each dish, three times, and then he locks on to whatever he heard (the mouse, a
 * crewmate) and turns his ears and face to it.
 *
 * His wings are jointed fans (a shoulder, an arm, three finger struts in two segments,
 * with membrane panels skinned between them): they open wide to fly and fold up tight like
 * an umbrella to hang. He is built the right way up standing on his hooks, so the ceiling
 * hangs him head down; his head sits on a neck bone at its own centre and rolls half a
 * turn to show the face upright while he hangs (asleep he lets it hang upside down).
 *
 * Acts: sleeping in his cloak (and dreaming), a deep umbrella-wrapped cocoon sleep, a shy wrap with three peeks, a cold shiver, cleaning an ear dish with a wing tip, a ping with an echo coming back, pinging far too often until he is dizzy, fluttering over to a crewmate and pinging at them, a low swoop across the page, peeking out of a wing, the ping, swinging
 * like a pendulum, stretching a wing and then the other, a yawn showing his fangs,
 * grooming a wing, scanning with his ears, spinning his head right round, hanging by one
 * foot, spinning on the line, an upside-down wave, a sneeze that blows his wings open,
 * showing off with the wings wide, creeping along the ceiling foot over foot; and in the
 * air: flitting off erratically, chasing an invisible moth, a loop-the-loop, dropping
 * like a stone and opening his wings at the last moment, flying to the back wall and
 * back, and hovering with his wings held up in a heart. Poked, he flaps in a tantrum;
 * three pokes and he spins dizzy on the line.
 *
 * No lights on the wings: the colour is in the dishes. Each dish has its feed bulb (Dot0)
 * and rings at three sizes (Dot1 to Dot3 from the inside out); the ping runs down them.
 */
export const BAT_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.3, 0.5],
    [0.7, 0.5],
  ],
  rx: 0.135,
  ry: 0.3,
  line: 0.04,
  mouth: null,
};

const DEG = 180 / Math.PI;
/** The pivot (his middle) as a share of his height, as in Character. */
const MIDDLE = 0.45;
const SIDES = [
  ['L', 1],
  ['R', -1],
] as const;
/** How far each wing joint turns to fold the wing: the shoulder, and each finger's root. */
const FOLD = { sh: -115, fingers: [166, 201, 239] };
/** How far his ears lean out, in degrees: they are turned back the other way while he is flipped. */
const LEAN = 24;
const HOOK = 0.056;

type Point = { x: number; y: number };
/** Away from an edge, into the page, in viewport px (y down). */
const inward = (a: number): Point => ({ x: -Math.sin(a), y: -Math.cos(a) });
const smooth = (x: number) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

/** One part of a flight. */
type Step =
  /** Falling with the wings shut: for `time` seconds, or until fallen `drop` heights. */
  | { t: 'fall'; time: number; drop?: number }
  /** Flying to a point (and depth), dashing about as he goes. */
  | { t: 'go'; to: Point; depth?: number; dash?: number; tol?: number; slow?: boolean }
  /** Hovering on the spot. */
  | { t: 'hold'; time: number; heart?: boolean; ping?: boolean }
  /** A loop-the-loop in the page, `r` heights across, `dir` the way he is going. */
  | { t: 'loop'; dir: 1 | -1; r: number }
  /** Chasing a moth only he can see. */
  | { t: 'moth'; time: number; centre: Point }
  /** Turning over and hooking onto the ceiling. */
  | { t: 'land' };

export class Bat extends Character {
  /** Held by the pointer, it flies after it. */
  readonly flies = true;
  private pokes: number[] = [];
  private hover = 0;
  private env: Env | null = null;
  /** 0 the head as built (face upside down while he hangs), 1 turned to show it upright. */
  private flip = new Spring(1.6, 0.5, 1, 1);
  /** Extra turns of the head (degrees), for spinning it right round. */
  private headSpin = new Spring(1.2, 0.7);
  private flight: 'no' | 'release' | 'air' = 'no';
  private steps: Step[] = [];
  private stepT = 0;
  private stepData: Record<string, number> = {};
  private mode: 'fall' | 'flap' | 'hover' | 'heart' | 'loop' | 'glide' = 'flap';
  private plan = '';
  private vel: Point = { x: 0, y: 0 };
  private tilt = new Spring(1.3, 0.75);
  private landing: { s: number; depth: number } | null = null;
  private exiting = false;
  private flap = 0;
  private dashAt = 0;
  private hookT = 0;
  /** When the current ping began (seconds into the act), and what he is listening to. */
  private pingAt: Point | null = null;
  private chomp = -9;
  private sneezeAt = -9;
  private spun = 0;
  /** True while he hovers pinging at a crewmate: the rings run out in time. */
  private pingHold = false;

  constructor(model: Object3D) {
    const feels: Record<string, { f: number; zeta: number; r?: number }> = {
      default: { f: 2, zeta: 0.6 },
      // A pendulum from the hooks.
      root: { f: 0.55, zeta: 0.3 },
      body: { f: 1.6, zeta: 0.5 },
      neck: { f: 3, zeta: 0.6 },
      head: { f: 3, zeta: 0.6 },
      jaw: { f: 9, zeta: 0.55 },
      'leg.L': { f: 6, zeta: 0.6 },
      'leg.R': { f: 6, zeta: 0.6 },
    };
    for (const [sfx] of SIDES) {
      feels[`ear.${sfx}`] = { f: 4, zeta: 0.32 };
      feels[`sh.${sfx}`] = { f: 3.2, zeta: 0.55 };
      feels[`arm.${sfx}`] = { f: 4, zeta: 0.5 };
      for (const k of [1, 2, 3]) {
        feels[`f${k}a.${sfx}`] = { f: 4.5, zeta: 0.5 };
        feels[`f${k}b.${sfx}`] = { f: 5, zeta: 0.45 };
      }
    }
    super(
      {
        name: 'Ping',
        model: 'bat',
        metres: 0.56,
        width: 0.5,
        size: 1.0,
        feels: feels as never,
        face: BAT_FACE,
        eyes: 0.7,
        gaze: [
          { bone: 'neck', yaw: 0.7, pitch: 0.6 },
          { bone: 'body', yaw: 0.2, pitch: 0 },
        ],
        reach: { yaw: 50, pitch: 30 },
        lag: 2,
        entrance: 'rise',
        edges: ['top'],
        stay: [45, 110],
        speed: 0.22,
        turn: 35,
        roam: true,
      },
      model,
    );
    this.doorKinds = ['ceiling'] as const;
    this.acts = this.moves();
  }

  // ---------- Acts ----------

  private hung = () => this.flight === 'no' && !this.free && !this.walking && this.state === 'here';

  private moves(): Record<string, Act> {
    const p = () => this.puppet;
    const hung = this.hung;
    const flier = (plan: string): Omit<Act, 'weight'> => ({
      length: [120, 120],
      when: hung,
      start: () => {
        this.plan = plan;
        this.flight = 'release';
        this.hookT = 0;
      },
    });
    const wingsOut = (t: number, len: number, k = 1) => envelope(t, len, 0.5) * k;
    return {
      idle: { weight: 4, length: [4, 8] },

      // ---- Resting ----
      sleep: {
        weight: 2.2,
        length: [12, 22],
        face: 'asleep',
        when: hung,
        pose: (t) => {
          // A cosy burrito: wings wrapped, ears drooped, head hanging as built.
          const k = envelope(t, this.actLength, 1.2);
          for (const [sfx, side] of SIDES) {
            p().add(`ear.${sfx}`, -30 * k, 0, side * 22 * k);
          }
          p().add('body', 4 * k + 2 * sin(t, 0.22), 0, 0);
          p().add('head', 20 * k);
        },
      },
      dream: {
        weight: 1.2,
        length: [10, 16],
        when: hung,
        pose: (t) => {
          // Asleep, with a dream going on behind the lids: eyes twitching, ears flicking,
          // a smile now and then.
          const k = envelope(t, this.actLength, 1);
          this.expression = 'asleep';
          const beat = Math.floor(t * 0.7);
          if (beat % 3 === 1 && (t * 0.7) % 1 < 0.55) this.expression = 'happy';
          if (beat % 5 === 3 && (t * 0.7) % 1 < 0.4) this.expression = 'love';
          for (const [sfx, side] of SIDES)
            p().add(
              `ear.${sfx}`,
              -25 * k + 12 * Math.sin(t * 9 + side) * (beat % 2),
              0,
              side * 20 * k,
            );
          p().add('head', 18 * k);
          p().add('jaw', -6 * (0.5 + 0.5 * sin(t, 0.9)) * k);
          p().add('leg.L', 8 * Math.max(0, Math.sin(t * 5)) * (beat % 3 === 0 ? 1 : 0));
        },
      },
      peek: {
        weight: 1.3,
        length: [6, 8],
        when: hung,
        pose: (t) => {
          // Wrapped and asleep, then a wing opens a crack and an eye looks out.
          const n = this.actLength;
          const k = smooth((t - 1.4) / 0.7) * smooth((n - 1 - t) / 0.7);
          this.expression = k > 0.3 ? 'surprised' : 'asleep';
          if (k > 0.8 && sin(t, 0.6) > 0.3) this.expression = 'wink';
          this.wing('L', 1 - 0.5 * k);
          p().add('head', 15 * (1 - k));
          this.flipWant = 1 - 0.8 * (1 - k);
        },
      },
      yawn: {
        weight: 1.1,
        length: [4, 5],
        face: 'sleepy',
        when: hung,
        pose: (t) => {
          const n = this.actLength;
          const k = Math.sin(clamp(t / n, 0, 1) * Math.PI) ** 0.6;
          p().add('jaw', -48 * k);
          p().add('neck', -10 * k);
          for (const [sfx, side] of SIDES) {
            p().add(`ear.${sfx}`, -20 * k, 0, side * 15 * k);
            this.wing(sfx, 1 - 0.25 * k);
          }
        },
      },

      // ---- More resting ----
      cocoon: {
        weight: 1,
        length: [14, 20],
        face: 'asleep',
        when: hung,
        pose: (t) => {
          // The whole umbrella wrapped tight, ears folded flat, head tucked, a slow sleepy
          // sway; his lights go nearly out.
          const k = envelope(t, this.actLength, 1.6);
          this.flipWant = 1 - 0.85 * k;
          for (const [sfx, side] of SIDES) {
            this.wing(sfx, 1 + 0.1 * k);
            p().add(`ear.${sfx}`, -48 * k, 0, side * 38 * k);
            p().add(`leg.${sfx}`, 6 * k);
          }
          p().add('body', 6 * k + 1.5 * sin(t, 0.2), 0, 0);
          p().add('head', 22 * k);
          p().add('root', 0, 0, 4 * sin(t, 0.12) * k);
        },
      },
      shy: {
        weight: 0.9,
        length: [9.5, 10],
        when: hung,
        pose: (t) => {
          // Wrapped up; a wing lifts a little, an eye looks out, and he pulls it shut
          // again, blushing, three times over.
          const win = (a: number, b: number) => smooth((t - a) / 0.4) * smooth((b - t) / 0.3);
          const k = Math.max(win(1.6, 3), win(4.6, 6.2), win(7.2, 8.4));
          this.expression = k > 0.4 ? (t > 7 ? 'wink' : 'surprised') : 'love';
          this.flipWant = 1 - 0.8 * (1 - k);
          this.wing('L', 1 - 0.45 * k);
          this.wing('R', 1);
          p().add('head', 16 * (1 - k));
          for (const [sfx, side] of SIDES)
            p().add(`ear.${sfx}`, -22 * (1 - k), 0, side * 16 * (1 - k));
          p().add('root', 0, 0, 3 * sin(t, 2.4) * (1 - k));
        },
      },
      shiver: {
        weight: 0.7,
        length: [3, 4],
        face: 'sad',
        when: hung,
        pose: (t) => {
          // A quick cold tremble all over, wings pulled in extra tight.
          const k = envelope(t, this.actLength, 0.4);
          for (const [sfx, side] of SIDES) {
            this.wing(sfx, 1 + 0.08 * k);
            p().add(
              `ear.${sfx}`,
              4 * Math.sin(t * 38 + side) * k - 10 * k,
              0,
              side * 3 * Math.sin(t * 33) * k,
            );
          }
          p().add('root', 0, 0, 3.5 * Math.sin(t * 41) * k);
          p().add('body', 1.5 * Math.sin(t * 37) * k);
        },
      },
      earclean: {
        weight: 1,
        length: [7, 9],
        face: 'happy',
        when: hung,
        pose: (t) => {
          // Brings one wing tip up to a dish and rubs it round, then shakes the ear out.
          const n = this.actLength;
          const k = envelope(t, n, 0.8);
          const rub = Math.sin(t * 6);
          this.wing('L', 1 - 0.4 * k);
          p().add('sh.L', -38 * k, -22 * k, 30 * k);
          p().add('f1b.L', 0, 0, 16 * rub * k);
          p().add('f2b.L', 0, 0, -12 * rub * k);
          p().add('ear.L', 20 * k, 0, 12 * k + 6 * rub * k);
          p().add('neck', -6 * k, 32 * k, 0);
          const shake = smooth((t - (n - 1.6)) / 0.2) * smooth((n - 0.3 - t) / 0.2);
          p().add('ear.L', 0, 0, 30 * Math.sin(t * 26) * shake);
          p().add('root', 0, 0, 3 * k);
        },
      },

      // ---- More pings ----
      echo: {
        weight: 1.6,
        length: [7, 7.4],
        when: hung,
        start: () => {
          this.pingAt = this.listenTarget();
        },
        pose: (t) => {
          // Two big pings go out, he waits with his ears cupped, and a faint echo comes
          // back in through the rings; he cocks his head at it.
          const k = smooth(t / 0.6);
          const back = smooth((t - 3) / 0.25) * smooth((3.9 - t) / 0.4);
          const lock = smooth((t - 4) / 0.6) * smooth((this.actLength - t) / 0.5);
          this.expression = t < 2.6 ? 'focused' : t < 4 ? 'surprised' : 'happy';
          for (const [sfx, side] of SIDES) {
            p().add(
              `ear.${sfx}`,
              -14 * k + 8 * back,
              side * (-24 * k + 10 * lock),
              side * (-8 * k + 6 * back),
            );
            p().add(`ear.${sfx}`, 0, 0, 10 * Math.sin(t * 22 + side) * back);
          }
          p().add('neck', 0, 0, 6 * back);
          if (this.pingAt && this.env) {
            const to = this.toward(this.pingAt, this.env);
            p().add('neck', clamp(to.pitch, -30, 30) * lock, clamp(to.yaw, -60, 60) * lock, 0);
          }
          const pulse = Math.max(0, 1 - ((t - 0.6) % 1) * 4);
          if (t > 0.6 && t < 2.4) p().add('body', -3.5 * pulse);
        },
      },
      overping: {
        weight: 0.6,
        length: [7.4, 7.6],
        when: hung,
        pose: (t) => {
          // Pings far too many times in a row, faster and faster, and gets dizzy from it:
          // wobbling on the hooks, ears flopping, until he shakes it off.
          const pings = t < 3.6;
          const u = clamp((t - 3.6) / 3.2, 0, 1);
          const wob = (1 - smooth((t - 6) / 1.2)) * smooth((t - 3.6) / 0.3);
          this.expression = pings ? 'focused' : wob > 0.1 ? 'dizzy' : 'happy';
          for (const [sfx, side] of SIDES) {
            p().add(
              `ear.${sfx}`,
              pings ? -14 : 24 * Math.cos(t * 7 + side) * wob,
              pings ? -22 * side : 0,
              side * 16 * Math.sin(t * 7) * wob,
            );
          }
          this.pivot.rotation.y = 0.45 * Math.sin(u * 14) * wob;
          p().add('neck', 0, 0, 9 * Math.sin(t * 8) * wob);
          p().add('root', 0, 0, 12 * Math.sin(t * 5) * wob);
          if (pings) {
            const pulse = Math.max(0, 1 - ((t - 0.4) % 0.5) * 5);
            if (t > 0.4) p().add('body', -4 * pulse);
          }
        },
      },

      // ---- The ping ----
      ping: {
        weight: 2.6,
        length: [6, 6.5],
        when: hung,
        start: () => {
          this.pingAt = this.listenTarget();
        },
        pose: (t) => {
          // Ears out and forward; three pulses of rings; then locks on and holds.
          const k = smooth(t / 0.6);
          const lock = smooth((t - 3.2) / 0.6) * smooth((this.actLength - t) / 0.5);
          this.expression = t < 3.2 ? 'focused' : lock > 0.5 ? 'surprised' : 'happy';
          for (const [sfx, side] of SIDES) {
            p().add(`ear.${sfx}`, -14 * k, side * (-22 * k + 12 * lock), side * -8 * k);
          }
          if (this.pingAt && this.env) {
            const to = this.toward(this.pingAt, this.env);
            p().add('neck', clamp(to.pitch, -30, 30) * lock, clamp(to.yaw, -60, 60) * lock, 0);
          }
          // A little recoil with each pulse.
          const pulse = Math.max(0, 1 - ((t - 0.6) % 1) * 4);
          if (t > 0.6 && t < 3.4) p().add('body', -3 * pulse);
        },
      },
      scan: {
        weight: 1.6,
        length: [5, 7],
        face: 'focused',
        when: hung,
        pose: (t) => {
          // A radar sweep: the dishes turning one way and then the other, out of step, the
          // head after them.
          const k = envelope(t, this.actLength, 0.6);
          for (const [sfx, side] of SIDES) {
            p().add(
              `ear.${sfx}`,
              6 * sin(t, 0.9, side * 0.25),
              30 * sin(t, 0.55, side * 0.5) * k,
              0,
            );
          }
          p().add('neck', 0, 30 * sin(t, 0.27) * k, 0);
        },
      },
      headspin: {
        weight: 0.9,
        length: [4.5, 5],
        when: hung,
        start: () => {
          this.spun += 360;
        },
        pose: (t) => {
          // The head turned right round on its neck like a real radar, and back to upright.
          const k = envelope(t, this.actLength, 0.4);
          this.expression = 'surprised';
          for (const [sfx, side] of SIDES) p().add(`ear.${sfx}`, 10 * k, 0, side * 10 * k);
        },
      },
      sneeze: {
        weight: 0.7,
        length: [3.4, 3.6],
        when: hung,
        pose: (t) => {
          // Winds up (the face scrunches), ACHOO: wings burst open and ears fly back, then
          // he folds himself up again, embarrassed.
          const wind = smooth(t / 1.2);
          const burst = t > 1.3 && t < 1.5 ? 1 : 0;
          if (t > 1.3 && this.sneezeAt < 0) {
            this.sneezeAt = t;
            for (const [sfx, side] of SIDES) {
              p().kick(`sh.${sfx}`, 0, 0, side * 900);
              p().kick(`ear.${sfx}`, -400, 0, side * 300);
            }
            p().kick('root', -250, 0, 0);
            p().kick('jaw', -900);
          }
          if (t < 1.3) this.sneezeAt = -9;
          this.expression = t < 1.3 ? 'sleepy' : t < 2.4 ? 'cross' : 'happy';
          const open = t > 1.3 && t < 1.9 ? 0.6 : 0;
          for (const [sfx] of SIDES) this.wing(sfx, 1 - open);
          p().add('head', 20 * wind * (1 - burst) - 15 * burst);
          p().add('jaw', -15 * wind * (1 - burst));
          for (const [sfx, side] of SIDES) p().add(`ear.${sfx}`, 10 * wind, 0, side * -10 * wind);
        },
      },

      // ---- Showing off ----
      swing: {
        weight: 1.4,
        length: [5, 7],
        face: 'happy',
        when: hung,
        pose: (t) => {
          // A pendulum on his hooks, wings tucked tight, ears flapping behind.
          const k = envelope(t, this.actLength, 0.9);
          p().add('root', 0, 0, 24 * sin(t, 0.65) * k);
          for (const [sfx, side] of SIDES)
            p().add(`ear.${sfx}`, 0, 0, side * -18 * Math.sin(2 * Math.PI * 0.65 * t - 0.6) * k);
        },
      },
      stretch: {
        weight: 1.3,
        length: [6, 7],
        face: 'sleepy',
        when: hung,
        pose: (t) => {
          // One wing right out, held, folded again; then the other.
          const n = this.actLength;
          const half = n / 2;
          const a = t < half ? smooth(t / 0.8) * smooth((half - 0.2 - t) / 0.8) : 0;
          const b = t >= half ? smooth((t - half) / 0.8) * smooth((n - t) / 0.8) : 0;
          this.wing('L', 1 - a);
          this.wing('R', 1 - b);
          p().add('neck', 0, 15 * (b - a), 0);
          p().add('root', 0, 0, 5 * (a - b));
        },
      },
      showoff: {
        weight: 1,
        length: [5, 6],
        face: 'happy',
        when: hung,
        pose: (t) => {
          // Both wings wide, held, with a quiver; ears up; chest out.
          const k = wingsOut(t, this.actLength);
          for (const [sfx, side] of SIDES) {
            this.wing(sfx, 1 - k, 4 * k * sin(t, 2.5, side * 0.2));
            p().add(`ear.${sfx}`, 8 * k, 0, side * 6 * k);
          }
          p().add('body', -8 * k);
        },
      },
      wave: {
        weight: 0,
        length: [4, 5],
        face: 'happy',
        when: hung,
        pose: (t) => {
          // An upside-down wave with the far wing, the rest of him hanging still.
          const k = wingsOut(t, this.actLength);
          this.wing('L', 1 - 0.9 * k);
          p().add('arm.L', 0, 0, 22 * sin(t, 1.6) * k);
          p().add('root', 0, 0, -6 * k);
          for (const [sfx, side] of SIDES) p().add(`ear.${sfx}`, 6 * k, 0, side * 8 * k);
        },
      },
      groom: {
        weight: 1.2,
        length: [6, 8],
        face: 'happy',
        when: hung,
        pose: (t) => {
          // Brings a wing up to his mouth and nibbles along it.
          const k = envelope(t, this.actLength, 0.7);
          this.wing('L', 1 - 0.4 * k);
          p().add('sh.L', -35 * k, -30 * k, 25 * k);
          p().add('neck', -10 * k, 40 * k, 0);
          p().add('jaw', -12 * k * (0.5 + 0.5 * sin(t, 2.2)));
          p().add('root', 0, 0, 4 * k);
        },
      },
      onefoot: {
        weight: 1,
        length: [6, 8],
        face: 'happy',
        when: hung,
        pose: (t) => {
          // Lets go with one foot and hangs from the other, swinging.
          const k = envelope(t, this.actLength, 0.7);
          this.hookShift = -HOOK * k;
          p().add('leg.R', -55 * k, 0, 8 * k);
          p().add('root', 0, 0, 14 * k + 12 * sin(t, 0.55) * k);
          p().add('body', 0, 0, -6 * k);
        },
      },
      spin: {
        weight: 0.9,
        length: [4, 5],
        face: 'happy',
        when: hung,
        pose: (t) => {
          // A full turn about the line, wings out a little with it.
          const n = this.actLength;
          const u = clamp(t / (n - 0.6), 0, 1);
          this.pivot.rotation.y = 2 * Math.PI * smooth(u);
          const k = Math.sin(u * Math.PI);
          for (const [sfx] of SIDES) this.wing(sfx, 1 - 0.45 * k);
        },
      },

      // ---- On the ceiling ----
      creep: {
        weight: 1.5,
        length: [7, 10],
        when: () => this.flight === 'no' && !this.free && !this.walking && this.state === 'here',
        start: () => {
          const way = Math.random() < 0.5 ? -1 : 1;
          this.walkTo(this.s + way * this.heightPx * (0.8 + Math.random() * 1.4));
        },
      },

      // ---- In the air ----
      flit: { weight: 2.2, ...flier('flit') },
      moth: { weight: 1.4, ...flier('moth') },
      loop: { weight: 1.2, ...flier('loop') },
      dropcatch: { weight: 1.3, ...flier('dropcatch') },
      backwall: { weight: 1.2, ...flier('backwall') },
      heart: { weight: 0.9, ...flier('heart') },
      swoop: { weight: 1.2, ...flier('swoop') },
      visit: {
        weight: 1.1,
        ...flier('visit'),
        when: () =>
          hung() && !!this.env && this.env.crew.some((c) => c !== this && c.state === 'here'),
      },

      // ---- Reactions ----
      poked: { weight: 0, length: [2.2, 2.6] },
      dizzy: { weight: 0, length: [4.5, 4.5], face: 'dizzy' },
    };
  }

  /** How the hooks are shifted along the line (hanging from one foot), metres. */
  private hookShift = 0;
  /** Where the neck's flip is wanted (0 as built, 1 upright while hanging). */
  private flipWant = 1;

  /** One wing folded (1) or open (0), and its fingertips curled a little. */
  private wing(sfx: 'L' | 'R', fold: number, curl = 0) {
    const side = sfx === 'L' ? 1 : -1;
    const p = this.puppet;
    this.wingsSet[sfx] = true;
    p.add(`sh.${sfx}`, 0, 0, side * FOLD.sh * fold);
    FOLD.fingers.forEach((a, i) => {
      p.add(`f${i + 1}a.${sfx}`, 0, 0, side * a * fold);
      p.add(`f${i + 1}b.${sfx}`, 0, 0, side * curl);
    });
  }

  /** The mouse if it has moved lately, else a crewmate, else somewhere across the page. */
  private listenTarget(): Point {
    const env = this.env!;
    if (env.pointer.present && env.time - env.pointer.at < 6)
      return { x: env.pointer.x, y: env.pointer.y };
    let best: Character | null = null;
    let bestD = Infinity;
    const me = this.eyePoint(env.frame);
    for (const c of env.crew) {
      if (c === this || c.state === 'gone') continue;
      const o = c.eyePoint(env.frame);
      const d = Math.hypot(o.x - me.x, o.y - me.y);
      if (d < bestD) [best, bestD] = [c, d];
    }
    if (best) return best.eyePoint(env.frame);
    const f = env.frame;
    return { x: f.left + (f.right - f.left) * Math.random(), y: f.bottom - 20 };
  }

  /** How far he'd turn (yaw, pitch in degrees, in his own axes) to face a point. */
  private toward(pt: Point, env: Env) {
    const eye = this.eyePoint(env.frame);
    const a = this.free ? 0 : ANGLE[this.edge];
    const dx = pt.x - eye.x;
    const dy = eye.y - pt.y;
    const lx = dx * Math.cos(a) + dy * Math.sin(a);
    const ly = -dx * Math.sin(a) + dy * Math.cos(a);
    const d = this.heightPx * 3;
    return { yaw: Math.atan2(lx, d) * DEG, pitch: Math.atan2(-ly, d) * DEG };
  }

  update(dt: number, env: Env) {
    this.env = env;
    super.update(dt, env);
    // Fresh on stage, his wings are shut at once rather than snapping shut from open.
    if (this.fresh) {
      this.fresh = false;
      this.puppet.update(0, true);
      this.flip.snap(this.flipWant);
    }
  }

  private fresh = true;

  protected onEnter() {
    this.fresh = true;
    this.flight = 'no';
    this.free = null;
    this.exiting = false;
    this.steps = [];
    this.flipWant = 1;
    this.flip.snap(1);
  }

  poke() {
    if (this.state !== 'here') return;
    const now = performance.now() / 1000;
    this.pokes = [...this.pokes.filter((at) => now - at < 3), now];
    if (this.flight !== 'no') {
      // In the air he just flutters.
      for (const [sfx, side] of SIDES) this.puppet.kick(`sh.${sfx}`, 0, 0, side * 500);
      return;
    }
    if (this.pokes.length >= 3) {
      this.pokes = [];
      this.setAct('dizzy');
    } else if (this.act !== 'dizzy') this.setAct('poked');
  }

  leave() {
    // Asked to go while he is out: land first.
    if (this.flight !== 'no' && this.state === 'here') this.exiting = true;
    else super.leave();
  }

  // ---------- Flying ----------

  /** His feet when his middle is where it is hanging from the top edge at s. */
  private airborne(foot: Point, a: number): Point {
    const c = MIDDLE * this.heightPx;
    const up = inward(a);
    return { x: foot.x + up.x * c, y: foot.y + up.y * c + c };
  }

  /** A clear place on the ceiling to hook back on. */
  private landingSpot(env: Env, near?: number): { s: number; depth: number } {
    const f = env.frame;
    const w = this.widthPx();
    const [s0, d0] = [this.s, this.depth];
    let spot = { s: this.s, depth: 0 };
    for (let i = 0; i < 16; i++) {
      const s =
        near !== undefined && i < 8
          ? near
          : f.left + w * 2 + Math.random() * Math.max(0, f.right - f.left - w * 4);
      const depth =
        near !== undefined
          ? this.depth
          : Math.random() < 0.5
            ? 0
            : Math.random() * this.backmost(f);
      spot = { s, depth };
      [this.s, this.depth] = [s, depth];
      const clear = env.crew.every((o) => {
        if (o === this || o.state === 'gone' || o.free || o.edge !== 'top') return true;
        return this.spaceTo(o, f).n > 1.1;
      });
      if (clear) break;
    }
    [this.s, this.depth] = [s0, d0];
    return spot;
  }

  private launch(env: Env) {
    const f = env.frame;
    const H = this.heightPx;
    const a = ANGLE.top;
    const at = this.airborne(this.frontFoot(f), a);
    this.free = { ...at, tilt: a };
    this.tilt.snap(a);
    this.vel = { x: 0, y: 0 };
    this.flight = 'air';
    this.mode = 'fall';
    this.stepT = 0;
    this.stepData = {};
    const W = f.right - f.left;
    const V = f.bottom - f.top;
    const page = (fx: number, fy: number): Point => ({ x: f.left + W * fx, y: f.top + V * fy });
    const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
    const home = this.s;
    switch (this.plan) {
      case 'flit': {
        // A fast erratic tour, a few darts about the page, then home to somewhere new.
        const n = 3 + Math.floor(Math.random() * 3);
        this.steps = [{ t: 'fall', time: 0.3 }];
        let d = 0.3;
        for (let i = 0; i < n; i++) {
          d = rnd(0.1, 0.9);
          this.steps.push({
            t: 'go',
            to: page(rnd(0.1, 0.9), rnd(0.15, 0.6)),
            depth: d,
            dash: 1,
            tol: H * 0.9,
          });
        }
        this.steps.push({ t: 'land' });
        break;
      }
      case 'moth':
        this.steps = [
          { t: 'fall', time: 0.3 },
          { t: 'go', to: page(rnd(0.3, 0.7), rnd(0.25, 0.45)), depth: rnd(0.1, 0.5), tol: H },
          { t: 'moth', time: rnd(6, 8), centre: page(rnd(0.3, 0.7), rnd(0.3, 0.5)) },
          { t: 'land' },
        ];
        break;
      case 'loop': {
        const dir = Math.random() < 0.5 ? 1 : -1;
        const start = page(dir > 0 ? rnd(0.15, 0.4) : rnd(0.6, 0.85), rnd(0.35, 0.5));
        this.steps = [
          { t: 'fall', time: 0.3 },
          { t: 'go', to: start, depth: 0.1, tol: H * 0.6 },
          { t: 'loop', dir, r: 1.6 },
          { t: 'go', to: { x: start.x + dir * H * 3.5, y: start.y - H * 0.3 }, tol: H * 0.8 },
          { t: 'loop', dir, r: 1.6 },
          { t: 'land' },
        ];
        break;
      }
      case 'dropcatch':
        // Lets go, drops like a stone, opens his wings at the last moment and swoops
        // back up to hook on again in the same place.
        this.steps = [
          { t: 'fall', time: 9, drop: rnd(2.6, 3.6) },
          {
            t: 'go',
            to: { x: at.x + rnd(-1, 1) * H, y: at.y + H * 1.4 },
            dash: 0.2,
            tol: H * 0.7,
            slow: true,
          },
          { t: 'land' },
        ];
        this.landing = this.landingSpot(env, home);
        break;
      case 'backwall':
        this.steps = [
          { t: 'fall', time: 0.3 },
          { t: 'go', to: page(rnd(0.35, 0.65), rnd(0.3, 0.45)), depth: 1, dash: 0.3, tol: H * 0.6 },
          { t: 'hold', time: rnd(2, 3) },
          { t: 'go', to: page(rnd(0.3, 0.7), rnd(0.35, 0.5)), depth: 0.05, dash: 0.3, tol: H },
          { t: 'land' },
        ];
        break;
      case 'swoop': {
        // Dives low across the page in a long curve and up the other side.
        const dir = Math.random() < 0.5 ? 1 : -1;
        this.steps = [
          { t: 'fall', time: 0.3 },
          { t: 'go', to: page(dir > 0 ? 0.12 : 0.88, rnd(0.3, 0.4)), depth: 0.2, tol: H * 0.9 },
          { t: 'go', to: page(0.5, rnd(0.72, 0.8)), depth: 0.1, tol: H * 0.9 },
          { t: 'go', to: page(dir > 0 ? 0.9 : 0.1, rnd(0.2, 0.3)), depth: 0.3, tol: H * 0.9 },
          { t: 'land' },
        ];
        break;
      }
      case 'visit': {
        // Flutters over to a crewmate, hangs in the air by them pinging, and comes home.
        const mates = env.crew.filter((c) => c !== this && c.state === 'here');
        const c = mates[Math.floor(Math.random() * mates.length)];
        const eye = c ? c.eyePoint(f) : page(0.5, 0.5);
        this.steps = [
          { t: 'fall', time: 0.3 },
          {
            t: 'go',
            to: {
              x: eye.x + (Math.random() < 0.5 ? -1 : 1) * H * 1.1,
              y: Math.max(f.top + H, eye.y - H * 1.3),
            },
            depth: c ? clamp(c.depth, 0, 1) : 0.3,
            tol: H * 0.7,
            slow: true,
          },
          { t: 'hold', time: 3.4, ping: true },
          { t: 'land' },
        ];
        break;
      }
      case 'heart':
        this.steps = [
          { t: 'fall', time: 0.3 },
          {
            t: 'go',
            to: page(rnd(0.35, 0.65), rnd(0.3, 0.42)),
            depth: rnd(0, 0.3),
            tol: H * 0.7,
            slow: true,
          },
          { t: 'hold', time: 4, heart: true },
          { t: 'land' },
        ];
        break;
    }
    if (this.plan !== 'dropcatch') this.landing = this.landingSpot(env);
  }

  private touchDown() {
    const spot = this.landing!;
    this.free = null;
    this.edge = 'top' as Edge;
    this.s = spot.s;
    this.depth = spot.depth;
    this.depthGoal = spot.depth;
    this.h = 0;
    this.goal = null;
    this.pace = this.vz = 0;
    this.vel = { x: 0, y: 0 };
    this.steps = [];
    this.landing = null;
    this.flight = 'no';
    this.flipWant = 1;
    this.setAct('idle');
    // A little bounce as the hooks catch.
    this.puppet.kick('root', 0, 0, 200 * (Math.random() < 0.5 ? -1 : 1));
    if (this.exiting) {
      this.exiting = false;
      super.leave();
    }
  }

  protected move(dt: number, env: Env) {
    if (!this.free) return super.move(dt, env);
    const pos = this.free;
    const f = env.frame;
    const H = this.heightPx;
    const maxSpeed = Math.max(H * 5, 260);
    const step = this.steps[0];
    this.stepT += dt;
    const next = () => {
      this.steps.shift();
      this.stepT = 0;
      this.stepData = {};
    };
    // Where he heads, his acceleration limit, and how he wants to lean.
    let target: Point | null = null;
    let speed = maxSpeed;
    let dash = 0;
    let lean = clamp(-this.vel.x / maxSpeed, -1, 1) * 0.35;
    let scripted = false;
    this.mode = 'flap';
    this.pingHold = false;

    if (!step) return this.touchDown();
    if (step.t === 'fall') {
      this.mode = 'fall';
      lean = 0;
      const g = H * 16;
      this.vel.y += g * dt;
      this.vel.x *= 1 - dt;
      pos.x += this.vel.x * dt;
      pos.y += this.vel.y * dt;
      scripted = true;
      this.stepData.y0 ??= pos.y;
      const fell = (pos.y - this.stepData.y0) / H;
      if (this.stepT > step.time || (step.drop !== undefined && fell > step.drop)) {
        // Wings open with a snap, the fall turned to a swoop.
        for (const [sfx, side] of SIDES) this.puppet.kick(`sh.${sfx}`, 0, 0, side * 700);
        this.vel.y *= step.drop !== undefined ? 0.2 : 0.4;
        this.flap = 0;
        next();
      }
    } else if (step.t === 'go') {
      target = step.to;
      dash = step.dash ?? 0;
      if (step.slow) speed *= 0.55;
      if (step.depth !== undefined) this.depthGoal = step.depth;
      if (Math.hypot(target.x - pos.x, target.y - pos.y) < (step.tol ?? H)) next();
    } else if (step.t === 'hold') {
      this.mode = step.heart ? 'heart' : 'hover';
      this.pingHold = !!step.ping;
      this.stepData.y0 ??= pos.y;
      this.vel.x *= Math.max(0, 1 - dt * 5);
      this.vel.y +=
        ((this.stepData.y0 + Math.sin(this.stepT * 4) * H * 0.07 - pos.y) * 6 - this.vel.y) *
        Math.min(1, dt * 5);
      pos.x += this.vel.x * dt;
      pos.y += this.vel.y * dt;
      lean = 0;
      scripted = true;
      if (this.stepT > step.time) next();
    } else if (step.t === 'loop') {
      // A circle in the page, turning over as he goes round it.
      this.mode = 'loop';
      const r = step.r * H;
      const T = 1.5;
      if (this.stepData.cx === undefined) {
        this.stepData.cx = pos.x;
        this.stepData.cy = pos.y - r;
        this.stepData.t0 = pos.tilt;
      }
      const u = smooth(this.stepT / T);
      const phi = 2 * Math.PI * u;
      const nx = this.stepData.cx + step.dir * r * Math.sin(phi);
      const ny = this.stepData.cy + r * Math.cos(phi);
      this.vel = { x: (nx - pos.x) / Math.max(dt, 1e-3), y: (ny - pos.y) / Math.max(dt, 1e-3) };
      pos.x = nx;
      pos.y = ny;
      pos.tilt = this.stepData.t0 + step.dir * phi;
      this.tilt.snap(pos.tilt);
      scripted = true;
      lean = -1e9;
      if (this.stepT > T) {
        // Out of it in the direction he was going, level.
        const turns = Math.round((pos.tilt - 0) / (2 * Math.PI));
        pos.tilt -= turns * 2 * Math.PI;
        this.tilt.snap(pos.tilt);
        this.vel = { x: step.dir * maxSpeed * 0.6, y: 0 };
        next();
      }
    } else if (step.t === 'moth') {
      // An invisible moth on a wandering path; he is always a little behind it.
      const c = step.centre;
      const tau = this.stepT;
      const A = (f.right - f.left) * 0.2;
      const B = (f.bottom - f.top) * 0.15;
      const moth = {
        x: c.x + A * Math.sin(1.7 * tau) + A * 0.5 * Math.sin(3.1 * tau + 1),
        y: c.y + B * Math.sin(2.3 * tau + 0.5) + B * 0.4 * Math.sin(4.3 * tau),
      };
      this.stepData.mx = moth.x;
      this.stepData.my = moth.y;
      target = moth;
      dash = 0.7;
      this.depthGoal = 0.25 + 0.2 * Math.sin(tau * 0.8);
      if (Math.hypot(moth.x - pos.x, moth.y - pos.y) < H * 0.7 && env.time - this.chomp > 0.7)
        this.chomp = env.time;
      if (this.stepT > step.time) next();
    } else if (step.t === 'land') {
      // In over the spot, turning over on the way, then up onto the ceiling.
      const spot = this.landing ?? (this.landing = this.landingSpot(env));
      const down = this.airborne({ x: spot.s, y: f.top }, ANGLE.top);
      const approach = { x: down.x, y: down.y + H * 1.6 };
      this.depthGoal = spot.depth;
      if (!this.stepData.stage) {
        target = approach;
        if (Math.hypot(target.x - pos.x, target.y - pos.y) < H * 0.9) this.stepData.stage = 1;
        // Not too far off in depth before the last approach.
        dash = 0.15;
      }
      if (this.stepData.stage) {
        target = down;
        speed = Math.min(maxSpeed, Math.hypot(down.x - pos.x, down.y - pos.y) * 2.6 + 30);
        lean = Math.PI;
        this.mode = 'glide';
        if (
          Math.hypot(down.x - pos.x, down.y - pos.y) < 1.5 &&
          Math.abs(this.depth - spot.depth) < 0.03
        )
          return this.touchDown();
      }
    }

    if (!scripted) {
      let ax = 0;
      let ay = 0;
      if (target) {
        const dx = target.x - pos.x;
        const dy = target.y - pos.y;
        const dist = Math.hypot(dx, dy) || 1;
        ax = ((dx / dist) * speed - this.vel.x) * 5;
        ay = ((dy / dist) * speed - this.vel.y) * 5;
        // A bat does not fly straight: a flutter, and now and then a sharp dart.
        ax += maxSpeed * 3 * (0.15 + dash) * Math.sin(this.t * 7.3);
        ay += maxSpeed * 3 * (0.15 + dash) * Math.cos(this.t * 5.9);
        if (dash > 0 && env.time > this.dashAt) {
          this.dashAt = env.time + 0.18 + Math.random() * 0.4;
          const ang = Math.random() * Math.PI * 2;
          this.vel.x += Math.cos(ang) * maxSpeed * 0.9 * dash;
          this.vel.y += Math.sin(ang) * maxSpeed * 0.9 * dash;
        }
      }
      const maxAcc = maxSpeed * 6;
      const a = Math.hypot(ax, ay);
      if (a > maxAcc) [ax, ay] = [(ax / a) * maxAcc, (ay / a) * maxAcc];
      this.vel.x += ax * dt;
      this.vel.y += ay * dt;
      const v = Math.hypot(this.vel.x, this.vel.y);
      if (v > maxSpeed * 1.4)
        [this.vel.x, this.vel.y] = [
          (this.vel.x / v) * maxSpeed * 1.4,
          (this.vel.y / v) * maxSpeed * 1.4,
        ];
      pos.x += this.vel.x * dt;
      pos.y += this.vel.y * dt;
      // Keep him inside the window while he flits.
      const m = H * 1.2;
      pos.x = clamp(pos.x, f.left + m, f.right - m);
      pos.y = clamp(pos.y, f.top + H * 0.8, f.bottom - H * 0.4);
    }

    if (lean > -1e8) {
      // Upright and leaning into his way, or turned to the ceiling for the way in.
      const want = lean;
      const turns = Math.round((pos.tilt - want) / (2 * Math.PI));
      pos.tilt = this.tilt.update(dt, want + turns * 2 * Math.PI);
    }
    this.heading.update(dt, 0);
    // Wing beats speed up with effort.
    const eff = clamp(Math.hypot(this.vel.x, this.vel.y) / maxSpeed, 0, 1.4);
    this.flap +=
      dt * 2 * Math.PI * (this.mode === 'hover' || this.mode === 'heart' ? 5 : 3.2 + 2.2 * eff);
  }

  // ---------- Posing ----------

  protected idle(t: number) {
    const p = this.puppet;
    // The face he wears unless an act says otherwise.
    this.expression = this.free
      ? this.mode === 'fall'
        ? 'surprised'
        : 'happy'
      : this.hovered
        ? 'happy'
        : 'neutral';
    if (this.free) return;
    // Hanging: a slow sway from the hooks, ears twitching now and then.
    p.add('root', 0, 0, 2.2 * sin(t, 0.11));
    p.add('body', 1.5 * sin(t, 0.17, 0.3));
    p.add('head', 2 * sin(t, 0.13, 0.5), 3 * sin(t, 0.09));
    const twitch = Math.max(0, Math.sin(t * 0.9 + 1)) ** 30;
    for (const [sfx, side] of SIDES)
      p.add(
        `ear.${sfx}`,
        4 * sin(t, 0.19, side * 0.2) - 16 * twitch * (side > 0 ? 1 : 0.4),
        0,
        side * 4 * twitch,
      );
    this.wingsSet = { L: false, R: false };
  }

  /** Which wings an act has posed this frame (the others are folded round him). */
  private wingsSet = { L: false, R: false };

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    const act = this.act;
    const t = this.actT;

    // Let go: the hooks lift, then he falls.
    if (this.flight === 'release') {
      this.hookT += dt;
      const k = smooth(this.hookT / 0.35);
      p.add('leg.L', -35 * k);
      p.add('leg.R', -35 * k);
      p.add('root', 0, 0, 6 * k * Math.sin(this.hookT * 12));
      if (this.hookT > 0.4) this.launch(env);
    }

    const flying = this.flight === 'air';
    // The head is upright for the viewer while he hangs, and as built in the air.
    let flipWant = flying ? (this.mode === 'glide' ? 1 : 0) : this.flipWant;
    if (this.flight === 'release') flipWant = 1;
    const flips = act === 'peek' || act === 'shy' || act === 'cocoon';
    if (flips) flipWant = this.flipWant;
    this.flip.update(dt, flipWant);
    if (!flips) this.flipWant = 1;

    if (flying) {
      // Wings open (or shut, in a fall) and beating, feet tucked up under him.
      const fold = this.mode === 'fall' ? 1 : 0;
      for (const [sfx] of SIDES) {
        this.wing(sfx, fold, 0);
        p.add(`leg.${sfx}`, this.mode === 'fall' ? 0 : -25);
      }
      if (this.mode === 'heart') this.heartWings();
      p.add('body', 8 * clamp(this.vel.y / 400, -1, 1));
      for (const [sfx, side] of SIDES) {
        p.add(
          `ear.${sfx}`,
          -15 * clamp(Math.hypot(this.vel.x, this.vel.y) / 500, 0, 1),
          0,
          side * 6,
        );
        if (this.mode === 'fall') p.add(`ear.${sfx}`, 30, 0, side * 10);
      }
      if (this.mode === 'fall') p.add('jaw', -10);
    } else if (this.walking) {
      // Creeping foot over foot, wings clutched round him, swaying from the hooks.
      const moving = clamp(this.stride / (this.heightPx * 0.2), 0, 1);
      const g = Math.sin(this.gait * 1.6);
      p.add('leg.L', 22 * g * moving, 0, 0);
      p.add('leg.R', -22 * g * moving, 0, 0);
      p.add('root', 0, 0, 7 * g * moving);
      p.add('body', 0, 0, -4 * g * moving);
      p.add('head', 0, 0, 5 * Math.cos(this.gait * 1.6) * moving);
    }

    // The mouse resting on him earns a wave.
    this.hover = this.hovered ? this.hover + dt : 0;
    if (this.hover > 1.4 && act === 'idle' && this.hung()) this.setAct('wave');

    // Reactions.
    if (act === 'poked') {
      // A tantrum: wings snapped open and shut, ears back, cross.
      const k = envelope(t, this.actLength, 0.15);
      const open = 0.5 + 0.5 * Math.sin(t * 24);
      for (const [sfx, side] of SIDES) {
        this.wing(sfx, 1 - 0.75 * open * k);
        p.add(`ear.${sfx}`, -30 * k, 0, side * 14 * k);
      }
      p.add('root', 0, 0, 14 * Math.sin(t * 17) * k);
      p.add('jaw', -14 * k * open);
      this.expression = 'cross';
    } else if (act === 'dizzy') {
      const u = clamp(t / this.actLength, 0, 1);
      this.pivot.rotation.y = 2 * Math.PI * 2 * smooth(u);
      for (const [sfx, side] of SIDES) {
        this.wing(sfx, 1 - 0.5 * Math.sin(u * Math.PI));
        p.add(
          `ear.${sfx}`,
          20 * Math.cos(env.time * 7 + side),
          0,
          side * 16 * Math.sin(env.time * 7),
        );
      }
      p.add('neck', 0, 0, 8 * Math.sin(env.time * 8));
      this.expression = 'dizzy';
    } else if (act !== 'spin' && act !== 'overping') this.pivot.rotation.y = 0;

    // Wings not posed by anything else are folded round him.
    if (!flying) for (const [sfx] of SIDES) if (!this.wingsSet[sfx]) this.wing(sfx, 1);

    // Hung on one foot: the hooks shifted along the line.
    if (act !== 'onefoot') this.hookShift *= 0.9;
    if (Math.abs(this.hookShift) > 1e-4) p.shift('root', this.hookShift, 0, 0);

    // The head's extra turns (a whole turn is the same as none, so it starts over) and
    // the chomp of the moth-catch.
    this.headSpin.update(dt, this.spun);
    if (act !== 'headspin' && this.spun && Math.abs(this.headSpin.y - this.spun) < 2) {
      this.spun = 0;
      this.headSpin.snap(0);
    }
    if (env.time - this.chomp < 0.22)
      p.add('jaw', -35 * Math.sin(((env.time - this.chomp) / 0.22) * Math.PI));
  }

  /** Wings held up with the tips curved in, so the two make a heart above him. */
  private heartWings() {
    const p = this.puppet;
    for (const [sfx, side] of SIDES) {
      p.add(`sh.${sfx}`, 0, 0, side * 48);
      p.add(`arm.${sfx}`, 0, 0, side * 40);
      p.add(`f1a.${sfx}`, 0, 0, side * 30);
      p.add(`f1b.${sfx}`, 0, 0, side * 40);
      p.add(`f2a.${sfx}`, 0, 0, side * 10);
      p.add(`f3a.${sfx}`, 0, 0, side * -5);
    }
  }

  protected after(dt: number, env: Env) {
    const p: Puppet = this.puppet;
    const t = env.time;
    // The head's turn: half a turn for the flip, and any extra spins.
    const flipAngle = 180 * this.flip.y + this.headSpin.y;
    p.turn('neck', 0, 0, flipAngle);
    // His face is turned round with the head, so his eyes look the other way round too.
    const c = Math.cos((flipAngle * Math.PI) / 180);
    if (this.face) {
      this.face.look.x *= c;
      this.face.look.y *= c;
    }
    // While flipped his ears are turned back the other way, so they lean out again.
    const f = clamp(this.flip.y, 0, 1);
    for (const [sfx, side] of SIDES) p.turn(`ear.${sfx}`, 0, 0, side * 2 * LEAN * f);

    // Wing beats: too quick for a spring, so set straight on the bones.
    if (this.free && this.mode !== 'fall' && this.mode !== 'glide') {
      const heart = this.mode === 'heart';
      const amp = this.mode === 'hover' ? 16 : heart ? 5 : 30;
      const loop = this.mode === 'loop' ? 1.2 : 1;
      for (const [sfx, side] of SIDES) {
        const s = Math.sin(this.flap);
        p.turn(`sh.${sfx}`, 0, 0, side * amp * loop * s);
        for (const k of [1, 2, 3])
          p.turn(
            `f${k}b.${sfx}`,
            0,
            0,
            side * (heart ? 0 : 14) * Math.sin(this.flap - 0.9 - k * 0.2),
          );
      }
    } else if (this.mode === 'glide' && this.free) {
      for (const [sfx, side] of SIDES)
        p.turn(`sh.${sfx}`, 0, 0, side * 40 * Math.max(0, Math.sin(this.flap * 0.7)));
    }

    this.lights(dt, env, t);
  }

  /** The dishes' lights: the feed bulb (Dot0) and three rings out from it (Dot1-Dot3). */
  private lights(_dt: number, env: Env, t: number) {
    const act = this.act;
    const levels = [0.25, 0.1, 0.1, 0.1];
    const pulse = (u: number, ring: number) =>
      Math.max(0, 1 - Math.abs(u - ring * 0.17 - 0.08) / 0.2);
    if (this.free && this.pingHold) {
      // Pinging at a crewmate: a ring wave out with each beat.
      const u = (this.stepT - 0.2) % 1;
      levels[0] = 0.6 + 0.4 * Math.max(0, 1 - u * 2);
      for (let i = 1; i < 4; i++) levels[i] = Math.max(0.1, pulse(u, i) * 1.1);
    } else if (act === 'echo') {
      const at = this.actT;
      levels[0] = 0.4;
      for (const start of [0.6, 1.6]) {
        const u = at - start;
        if (u < 0 || u > 1) continue;
        levels[0] = Math.max(levels[0], 1 - u * 1.5);
        for (let i = 1; i < 4; i++) levels[i] = Math.max(levels[i], pulse(u, i));
      }
      // The echo runs back in: outer ring first, faint.
      const e = at - 3;
      if (e > 0 && e < 0.9) {
        for (let i = 1; i < 4; i++) levels[i] = Math.max(levels[i], 0.55 * pulse(e * 1.1, 4 - i));
        levels[0] = Math.max(levels[0], 0.3 + 0.7 * smooth((e - 0.5) / 0.3));
      }
      if (at > 4 && at < this.actLength - 0.5) levels[0] = 1;
    } else if (act === 'overping') {
      const at = this.actT;
      if (at < 3.6) {
        const u = ((at - 0.4) % 0.5) / 0.5;
        levels[0] = 0.5 + 0.5 * (u < 0.4 ? 1 : 0);
        for (let i = 1; i < 4; i++) levels[i] = at > 0.4 ? Math.max(0.1, pulse(u * 1.2, i)) : 0.1;
      } else for (let i = 0; i < 4; i++) levels[i] = Math.random() < 0.4 ? 0.9 : 0.1;
    } else if (act === 'cocoon' || act === 'shy' || act === 'shiver') {
      levels[0] = act === 'cocoon' ? 0.1 + 0.1 * (0.5 + 0.5 * sin(t, 0.2)) : 0.25;
      levels[1] = levels[2] = levels[3] = 0.04;
    } else if (act === 'earclean') {
      levels[0] = 0.5;
      const u = (t * 3) % 1;
      for (let i = 1; i < 4; i++) levels[i] = 0.1 + 0.5 * pulse(u, i);
    } else if (act === 'ping') {
      const at = this.actT;
      levels[0] = 0.4;
      for (const start of [0.6, 1.6, 2.6]) {
        const u = at - start;
        if (u < 0 || u > 1) continue;
        levels[0] = Math.max(levels[0], 1 - u * 1.5);
        for (let i = 1; i < 4; i++) levels[i] = Math.max(levels[i], pulse(u, i));
      }
      if (at > 3.2 && at < this.actLength - 0.5) levels[0] = 1;
    } else if (this.free) {
      // Echolocating in flight: a ring running out with each wingbeat.
      const u = (this.flap / (2 * Math.PI)) % 1;
      levels[0] = 0.5 + 0.5 * Math.sin(this.flap);
      for (let i = 1; i < 4; i++) levels[i] = 0.1 + 0.6 * pulse(u * 1.1, i);
      if (this.mode === 'fall') levels.fill(0.9);
      // A flash of the feed bulbs when the spark is caught.
      if (env.time - this.chomp < 0.35) levels.fill(1);
      if (this.mode === 'heart')
        for (let i = 0; i < 4; i++) levels[i] = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 6 - i * 0.6));
    } else if (act === 'sleep' || act === 'dream') {
      levels[0] = 0.12 + 0.2 * (0.5 + 0.5 * sin(t, 0.22));
      levels[1] = levels[2] = levels[3] = 0.05;
    } else if (act === 'dizzy' || act === 'poked') {
      for (let i = 0; i < 4; i++) levels[i] = Math.random() < 0.5 ? 1 : 0.1;
    } else if (this.hovered || act === 'wave' || act === 'showoff' || act === 'headspin') {
      const u = (t * 1.4) % 1;
      levels[0] = 0.7;
      for (let i = 1; i < 4; i++) levels[i] = 0.15 + 0.7 * pulse(u, i);
    } else if (act === 'scan') {
      const u = (t * 0.9) % 1;
      levels[0] = 0.6;
      for (let i = 1; i < 4; i++) levels[i] = 0.1 + 0.5 * pulse(u, i);
    } else {
      // Idle: the feed bulb breathes; a single faint ring now and then.
      levels[0] = 0.3 + 0.25 * (0.5 + 0.5 * sin(t, 0.35));
      const u = (t * 0.2) % 1;
      if (u < 0.5) for (let i = 1; i < 4; i++) levels[i] = 0.1 + 0.25 * pulse(u * 2, i);
    }
    void env;
    levels.forEach((level, i) => this.outfit.dot(i, clamp(level, 0, 1)));
  }
}
