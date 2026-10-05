import { type Material, Color, type Mesh, type Object3D } from 'three';
import { BEACON } from './bolt';
import { type Act, Character, clamp, type Env, type Frame } from './character';
import type { FaceLayout } from './face';
import { ramp } from './kitties';
import { sin } from './moves';
import { Spring } from './spring';

/**
 * Flick, the robot lizard, a gecko: a long low body in two halves on four splayed legs
 * with flat sticky toe pads, a long tail in six ringed segments, a wide head with a big
 * screen face, two turret eyes on top that look about on their own, a tongue that shoots
 * out and a dewlap under the chin.
 *
 * Its life is bursts and freezes: it scuttles a few steps, then stops dead mid-step and
 * holds, head up, before scuttling again. It does push-ups, flicks its tongue at flies
 * that aren't there, puffs its throat out in a glowing dewlap, licks its own eye, basks
 * flat under the lamp of the ceiling, rears up the back wall and clings, chases its own
 * tail, does a double take, and puts on a colour-change show, the lights along its back
 * rippling through every hue (in the colour look its whole body shifts hue with them).
 * It may come in along the side walls of the frame too, and clings there sideways.
 *
 * The six plates down its back and tail are its lights: running lights as it scuttles,
 * a slow ripple at rest, hues in the show; the dewlap lights when it puffs.
 */
export const LIZARD_FACE: FaceLayout = {
  width: 512,
  height: 256,
  eyes: [
    [0.28, 0.46],
    [0.72, 0.46],
  ],
  rx: 0.115,
  ry: 0.34,
  line: 0.036,
  mouth: [0.5, 0.82],
};

const TAIL = ['tail.1', 'tail.2', 'tail.3', 'tail.4', 'tail.5', 'tail.6'];
/** [bone, side (+1 left), front?] for the four legs; diagonal pairs move together. */
const LEGS: [string, string, number, number][] = [
  ['leg.FL', 'shin.FL', 1, 1],
  ['leg.FR', 'shin.FR', -1, 1],
  ['leg.BL', 'shin.BL', 1, -1],
  ['leg.BR', 'shin.BR', -1, -1],
];
const PLATES = 6;
const DEWLAP = 6;
const TIP = 7;
const DIP = 1.2; // the walk speed, in bot per second
const cycle = (x: number) => x - Math.floor(x);
const ring = (x: number) => Math.abs(x - Math.round(x));
type Pair = [number, number];

interface Run {
  phase: number;
  at: number;
  n: number;
  dir: number;
  stops: { s: number; depth: number }[];
}

export class Lizard extends Character {
  static readonly terms =
    'reptile green lime tail scuttle crawl climb cling wall tongue turret eyes dewlap bask colour color change rainbow sticky toes freeze';

  private run: Run = { phase: 0, at: 0, n: 0, dir: 1, stops: [] };
  /** The walk's stride amount held while frozen mid-step, and whether it is. */
  private holdAmt = 0;
  private frozen = false;
  private amt = new Spring(8, 0.9);
  /** Tongue out (0..1), dewlap puffed (0..1), reared up the back wall (degrees), body low on the floor. */
  private tongue = new Spring(14, 0.55);
  private tongueTo = 0;
  private puff = new Spring(5, 0.5, 1.4);
  private lean = new Spring(2.5, 0.55);
  private low = new Spring(3, 0.8);
  private pokes: number[] = [];
  private hover = 0;
  private env: Env | null = null;
  private frame: Frame | null = null;
  private hue = 0;
  private show = 0;
  private baseColours = new Map<Material, Color>();
  private spinning = 0;

  constructor(model: Object3D) {
    const tail = (f: number) => ({ f, zeta: 0.35 });
    super(
      {
        name: 'Flick',
        model: 'lizard',
        metres: 0.2,
        width: 0.8,
        size: 0.9,
        feels: {
          default: { f: 5, zeta: 0.6 },
          root: { f: 3, zeta: 0.6 },
          hip: { f: 3.5, zeta: 0.55 },
          chest: { f: 3.5, zeta: 0.55 },
          head: { f: 4, zeta: 0.5, r: 0.3 },
          tongue: { f: 12, zeta: 0.5 },
          dewlap: { f: 6, zeta: 0.5 },
          'eye.L': { f: 6, zeta: 0.45 },
          'eye.R': { f: 6, zeta: 0.45 },
          'tail.1': tail(3),
          'tail.2': tail(3.4),
          'tail.3': tail(3.8),
          'tail.4': tail(4.2),
          'tail.5': tail(4.6),
          'tail.6': tail(5),
        },
        face: LIZARD_FACE,
        eyes: 0.6,
        gaze: [
          { bone: 'head', yaw: 0.8, pitch: 0.7 },
          { bone: 'chest', yaw: 0.2, pitch: 0 },
          { bone: 'eye.L', yaw: 0.6, pitch: 0.4 },
          { bone: 'eye.R', yaw: 0.6, pitch: 0.4 },
        ],
        reach: { yaw: 60, pitch: 30 },
        lag: 2.2,
        entrance: 'walk',
        edges: ['bottom', 'bottom', 'bottom', 'left', 'right'],
        stay: [45, 100],
        speed: DIP,
        turn: 85,
      },
      model,
    );
    this.acts = this.moves();
  }

  private moves(): Record<string, Act> {
    const still = () => !this.walking;
    const floor = () => !this.walking && this.edge === 'bottom';
    const wall = () => !this.walking && this.edge !== 'bottom';
    const roomy = () => {
      const f = this.frame;
      if (!f) return 1;
      const [lo, hi] = this.span(f);
      return this.s - lo > hi - this.s ? -1 : 1;
    };
    const set = (n: number) => ({ scuttle: n });
    void set;
    return {
      idle: { weight: 3, length: [2.5, 5] },
      // Bursts and freezes.
      scuttle: {
        weight: 2.6,
        length: [9, 9],
        when: still,
        start: () => {
          const r = this.run;
          r.phase = 0;
          r.n = 0;
          r.at = 0;
          r.dir = roomy();
          this.spec.speed = 3.4;
          this.dash();
        },
      },
      crawl: {
        weight: 1.3,
        length: [5, 8],
        when: still,
        start: () => {
          this.spec.speed = 1.1;
          const way = Math.random() < 0.5 ? -1 : 1;
          this.walkTo(this.s + way * this.heightPx * (1.5 + Math.random() * 2));
        },
      },
      freeze: { weight: 1, length: [3, 5], face: 'focused', when: still },
      pushups: { weight: 1.3, length: [5, 6], face: 'focused', when: floor },
      flyCatch: { weight: 1.4, length: [6, 7], when: still },
      tailCurl: { weight: 1, length: [4, 5], when: still },
      tailWave: { weight: 1, length: [4, 5], face: 'happy', when: still },
      throat: { weight: 1.2, length: [4, 5], face: 'happy', when: still },
      colourShow: { weight: 1, length: [8, 8], face: 'happy', when: still },
      eyeLick: { weight: 0.8, length: [4.5, 4.5], when: still },
      bask: { weight: 1, length: [10, 15], when: floor },
      wallClimb: {
        weight: 0.8,
        length: [14, 14],
        when: floor,
        start: () => {
          this.run.phase = 0;
          this.spec.speed = 2.2;
          this.walkTo(this.s + (Math.random() < 0.5 ? -1 : 1) * this.heightPx * 0.5, 1);
        },
      },
      cling: { weight: 2.5, length: [6, 9], when: wall },
      tailChase: {
        weight: 0.7,
        length: [6, 6],
        when: floor,
        start: () => {
          this.spinning = 0;
        },
      },
      sneeze: { weight: 0.6, length: [3.5, 3.5], when: still },
      yawn: { weight: 0.8, length: [4, 4], face: 'sleepy', when: still },
      lick: {
        weight: 1,
        length: [10, 12],
        when: () => still() && !!this.neighbour(),
        start: () => {
          const o = this.neighbour();
          if (!o) return;
          this.run.phase = 0;
          this.run.dir = Math.sign(o.s - this.s) || 1;
          this.spec.speed = 2;
          this.walkTo(o.s, o.depth);
        },
      },
      doubleTake: { weight: 0.9, length: [4, 4], when: still },
      turrets: { weight: 1.1, length: [5, 6], when: still },
      stalk: {
        weight: 0.8,
        length: [10, 10],
        when: floor,
        start: () => {
          this.run.phase = 0;
          this.spec.speed = 0.5;
          this.walkTo(this.s + roomy() * this.heightPx * 1.6, 0.6);
        },
      },
      shimmy: { weight: 0.7, length: [3.5, 4], face: 'happy', when: still },
      peek: {
        weight: 0.7,
        length: [8, 8],
        when: floor,
        start: () => {
          this.run.phase = 0;
          this.spec.speed = 1.6;
          this.walkTo(this.s + roomy() * this.heightPx * 0.6, 0);
        },
      },
      display: { weight: 0.8, length: [5, 6], face: 'cross', when: still },
      curlNap: { weight: 0.7, length: [11, 16], face: 'asleep', when: floor },
      tailDrop: { weight: 0.6, length: [5.5, 5.5], when: still },
      twinEyes: { weight: 0.8, length: [7, 7], when: still },
      camouflage: { weight: 0.6, length: [8, 8], face: 'focused', when: floor },
      sway: { weight: 0.8, length: [5, 6], face: 'happy', when: still },
      // Reactions
      poked: { weight: 0, length: [3, 3.5], face: 'surprised' },
      love: { weight: 0, length: [4, 5], face: 'love' },
      dizzy: { weight: 0, length: [5, 5] },
    };
  }

  /** A short dash to somewhere new, toward the side with room. */
  private dash() {
    const f = this.frame;
    if (!f) return;
    const [lo, hi] = this.span(f);
    const dir = this.run.dir;
    const room = (dir > 0 ? hi - this.s : this.s - lo) - this.widthPx() * 0.5;
    const far = Math.min(Math.max(room, 0), this.heightPx * (1.2 + Math.random() * 1.6));
    this.walkTo(this.s + dir * far, Math.random() < 0.7 ? Math.random() : undefined);
  }

  private neighbour(): Character | null {
    const env = this.env;
    if (!env) return null;
    let best: Character | null = null;
    let bestD = Infinity;
    for (const o of env.crew) {
      if (o === this || o.state !== 'here' || o.free || o.edge !== this.edge) continue;
      const d = Math.abs(o.s - this.s);
      if (d < bestD) [best, bestD] = [o, d];
    }
    return best;
  }

  poke() {
    if (this.state !== 'here') return;
    const now = performance.now() / 1000;
    this.pokes = [...this.pokes.filter((at) => now - at < 3), now];
    if (this.pokes.length >= 3) {
      this.pokes = [];
      this.setAct('dizzy');
    } else if (this.act !== 'dizzy') {
      this.goal = null;
      this.frozen = true;
      this.setAct('poked');
      this.puff.kick(20);
      this.puppet.kick('tail.1', 0, 300, 0);
      this.puppet.kick('head', -200);
    }
  }

  protected onEnter() {
    this.frozen = false;
    this.spec.speed = DIP;
    this.tongue.snap(0);
    this.tongueTo = 0;
    this.lean.snap(0);
    this.low.snap(0);
    this.show = 0;
  }

  protected idle(t: number) {
    const p = this.puppet;
    // Breathing, a tail that never quite stops, turrets that drift on their own.
    p.add('chest', 1.5 * sin(t, 0.35));
    TAIL.forEach((bone, i) =>
      p.add(bone, 0.6 * sin(t, 0.3, -i * 0.08), 3 * sin(t, 0.22, -i * 0.1), 0),
    );
    p.add('head', 1.5 * sin(t, 0.2), 4 * sin(t, 0.09), 0);
    p.add('eye.L', 4 * sin(t, 0.23), 12 * sin(t, 0.17), 0);
    p.add('eye.R', 4 * sin(t, 0.21, 0.4), 12 * sin(t, 0.19, 0.3), 0);
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    const t = this.actT;
    const act = this.act;
    const a = this.actLength;
    const r = this.run;
    this.env = env;
    this.frame = env.frame;
    const bot = env.frame.bot;

    this.hover = this.hovered ? this.hover + dt : 0;
    if (this.hover > 0.9 && (act === 'idle' || act === 'crawl')) this.setAct('love');

    // Targets for this frame.
    let head: [number, number, number] = [0, 0, 0];
    let chest: [number, number, number] = [0, 0, 0];
    let tail: 'rest' | 'curl' | 'wave' | 'stiff' | 'up' | 'spiral' = 'rest';
    let tailAmt = 0;
    let dew = 0;
    let tongue = 0;
    let lift = 0; // the front end up on its arms (push-ups, alert)
    let low = 0;
    let lean = 0;
    let frozen = false;
    let expression = this.hovered ? 'happy' : 'neutral';
    let turret: [Pair, Pair] = [
      [0, 0],
      [0, 0],
    ];
    let wag = 1;
    let show = 0;
    let shake = 0;
    let scuttleNow = false;
    let hold = false;

    switch (act) {
      case 'scuttle': {
        // A dash, then a dead stop mid-step, then another. Three of them.
        const cycleT = 2.9;
        const u = t - r.n * cycleT;
        if (r.phase === 0 && this.goal === null && !this.walking && u > 0.2) {
          r.phase = 1; // stopped: the freeze
          r.at = t;
        }
        if (r.phase === 0 && u > 1.8) {
          r.phase = 1;
          r.at = t;
          this.goal = null;
        }
        if (r.phase === 1) {
          frozen = true;
          hold = true;
          lift = 0.7;
          head = [-10, 0, 0];
          tail = 'stiff';
          expression = 'focused';
          // A glance one way, and the other, holding still otherwise.
          const w = t - r.at;
          head[1] = w > 0.5 ? 26 * Math.sign(Math.sin(w * 2.4)) : 0;
          if (w > 0.9 + 0.3 * (r.n % 2) && r.n < 2) {
            r.n++;
            r.phase = 0;
            r.dir = -r.dir * (Math.random() < 0.4 ? 1 : -1) || 1;
            this.spec.speed = 3.4;
            this.dash();
          } else if (w > 1.2 && r.n >= 2) this.actLength = Math.min(a, t + 0.2);
        } else scuttleNow = true;
        break;
      }
      case 'crawl': {
        head = [4, 0, 0];
        break;
      }
      case 'freeze': {
        frozen = true;
        hold = true;
        lift = 0.6 * ramp(t, 0, 0.15);
        head = [-8, 0, 0];
        tail = 'stiff';
        expression = 'focused';
        // One eye swivels, the rest of it stone still.
        turret = [
          [0, 40 * Math.sign(sin(t, 0.4))],
          [0, 0],
        ];
        break;
      }
      case 'pushups': {
        // Three or four push-ups, the head bobbing at the top.
        const n = 4;
        const k = ramp(t, 0, 0.6) * (1 - ramp(t, a - 0.6, a));
        const u = clamp((t - 0.8) / (a - 1.6), 0, 1);
        const bob = u > 0 && u < 1 ? 0.5 - 0.5 * Math.cos(u * n * Math.PI * 2) : 0;
        lift = k * (0.35 + 0.65 * bob);
        head = [-10 * k * bob, 0, 0];
        expression = bob > 0.7 ? 'happy' : 'focused';
        tail = 'stiff';
        break;
      }
      case 'flyCatch': {
        // Eyes on a fly buzzing about; tongue out, snap, gulp, pleased.
        this.tongueTo = 0;
        if (t < 3.2) {
          const fx = 1.6 * Math.sin(t * 1.9) + Math.sin(t * 5.1) * 0.4;
          head = [-4 + 5 * Math.sin(t * 2.3), 26 * fx * 0.5, 0];
          turret = [
            [0, 38 * fx],
            [0, 38 * fx * 0.9],
          ];
          expression = 'focused';
          lift = 0.3;
          tail = 'stiff';
        } else if (t < 4.3) {
          // The strike.
          const u = (t - 3.2) / 1.1;
          tongue = u < 0.18 ? 1 : u < 0.4 ? 1 - ramp(u, 0.18, 0.4) : 0;
          head = [-6 - 8 * (u < 0.3 ? 1 : 0), 10, 0];
          lift = 0.4;
          expression = 'focused';
          if (u > 0.3) expression = 'happy';
        } else {
          head = [8 * Math.sin(t * 9) * (t < 5.2 ? 1 : 0), 0, 0];
          expression = 'happy';
        }
        break;
      }
      case 'tailCurl': {
        const k = ramp(t, 0, 1.2) * (1 - ramp(t, a - 1.2, a));
        tail = 'curl';
        tailAmt = k;
        head = [0, 0, 0];
        chest = [0, 0, 0];
        expression = 'happy';
        break;
      }
      case 'tailWave': {
        const k = ramp(t, 0, 0.8) * (1 - ramp(t, a - 0.8, a));
        tail = 'wave';
        tailAmt = k;
        head = [-6 * k, 0, 0];
        break;
      }
      case 'throat': {
        // The dewlap swells and glows, in pulses; head raised.
        const k = ramp(t, 0, 0.5) * (1 - ramp(t, a - 0.7, a));
        const pulse = 0.65 + 0.35 * Math.sin(t * 5);
        dew = k * pulse;
        head = [-14 * k, 0, 0];
        lift = 0.5 * k;
        expression = 'happy';
        break;
      }
      case 'colourShow': {
        // Every plate a different hue, rippling along its back; the body's hue follows.
        const k = ramp(t, 0, 1) * (1 - ramp(t, a - 1, a));
        show = k;
        lift = 0.25 * k;
        head = [-8 * k, 0, 0];
        tail = 'wave';
        tailAmt = 0.4 * k;
        shake = 0.3 * k;
        break;
      }
      case 'eyeLick': {
        // Tongue up over the top of the head to lick its own eye, which winks shut.
        const k = ramp(t, 0, 0.8) * (1 - ramp(t, a - 0.6, a));
        const side = r.dir;
        const lick = k * (t > 1 && t < a - 1 ? 0.55 + 0.45 * Math.sin((t - 1) * 9) : 0);
        tongue = lick;
        head = [-4, 8 * k, -side * 14 * k];
        this.tongueLift = 62 * k;
        turret[side > 0 ? 0 : 1] = [30 * k, 0];
        expression = t > 1 ? 'wink' : 'neutral';
        break;
      }
      case 'bask': {
        // Flat out under the lamp: belly on the floor, legs splayed, eyes half shut, warm glow.
        const k = ramp(t, 0, 1.5) * (1 - ramp(t, a - 1.2, a));
        low = k;
        head = [10 * k, 0, 0];
        tail = 'rest';
        expression = k > 0.7 ? 'sleepy' : 'neutral';
        chest = [0, 0, 0];
        this.basking = k;
        break;
      }
      case 'wallClimb': {
        // To the back wall, up it a little way with the legs scrabbling, cling, and slide down.
        const near = this.depth > 0.85;
        if (r.phase === 0 && ((near && !this.walking) || t > 7)) {
          r.phase = 1;
          r.at = t;
          this.goal = null;
        }
        if (r.phase === 1 && t - r.at > 5) {
          r.phase = 2;
          r.at = t;
          this.lean.kick(160);
        }
        if (r.phase === 2 && t - r.at > 1.6) r.phase = 3;
        if (r.phase === 1) {
          lean = 56 * ramp(t - r.at, 0, 1.4);
          tail = 'up';
          expression = t - r.at > 1.6 ? 'focused' : 'neutral';
          this.scrabble = 1;
          // Look about up there.
          head = [-10, 20 * Math.sin((t - r.at) * 1.1), 0];
        } else if (r.phase === 2) {
          tail = 'up';
          expression = 'surprised';
          this.scrabble = 2;
        } else this.scrabble = 0;
        break;
      }
      case 'cling': {
        // On a side wall: stuck fast on its toe pads, tail drooping, glancing about.
        head = [0, 20 * Math.sin(t * 0.7), 0];
        turret = [
          [0, 30 * Math.sin(t * 0.9)],
          [0, -30 * Math.sin(t * 0.8)],
        ];
        tail = 'wave';
        tailAmt = 0.25;
        break;
      }
      case 'tailChase': {
        // Round and round after its own tail, which is always just out of reach.
        const k = ramp(t, 0.3, 1) * (1 - ramp(t, a - 1, a));
        this.spinning = 4 * Math.PI * ramp(t, 0.4, a - 0.8) ** 1.0;
        tail = 'spiral';
        tailAmt = k;
        head = [0, 30 * k, 0];
        chest = [0, 12 * k, 0];
        expression = 'focused';
        wag = 0;
        this.patter = k;
        break;
      }
      case 'sneeze': {
        if (t < 1.2) {
          const k = ramp(t, 0.1, 1.1);
          head = [-20 * k, 0, 0];
          lift = 0.3 * k;
          turret = [
            [-10 * k, 0],
            [-10 * k, 0],
          ];
          expression = 'sleepy';
        } else {
          if (t - dt <= 1.2) {
            p.kick('head', 280);
            p.kick('chest', 100);
            p.kick('tail.1', -160);
            this.tongueTo = 1;
            this.puff.kick(15);
          }
          tongue = t < 1.5 ? 1 : 0;
          head = [6, 0, 0];
          expression = 'surprised';
          turret = [
            [0, 0],
            [0, 0],
          ];
        }
        break;
      }
      case 'yawn': {
        const k = Math.sin(clamp(t / a, 0, 1) * Math.PI);
        head = [-24 * k, 0, 0];
        lift = 0.35 * k;
        tongue = 0.35 * k * (t > 1 && t < 3 ? 1 : 0);
        turret = [
          [-30 * k, 0],
          [-30 * k, 0],
        ];
        expression = 'sleepy';
        break;
      }
      case 'lick': {
        const o = this.neighbour();
        if (r.phase === 0 && !this.walking && t > 1 && o) {
          r.phase = 1;
          r.at = t;
        }
        if (r.phase === 1 && o) {
          const w = t - r.at;
          const s = Math.sign(o.s - this.s) || 1;
          const k = ramp(w, 0, 0.6) * (1 - ramp(t, a - 1, a));
          head = [-4, 32 * s * k, 0];
          chest = [0, 14 * s * k, 0];
          lift = 0.25 * k;
          tongue = k * (0.55 + 0.45 * Math.sin(w * 7)) * (w > 1 ? 1 : 0);
          expression = 'happy';
        } else expression = 'happy';
        break;
      }
      case 'doubleTake': {
        // A glance one way, a glance back, then a double take with wide eyes.
        const seq = t < 0.8 ? 0 : t < 1.6 ? 1 : t < 2.1 ? 0 : t < 3 ? 1.6 : 0;
        head = [-4 * seq, 38 * seq * (t < 2.1 ? 1 : -1), 0];
        chest = [0, 10 * seq, 0];
        expression = t > 2.1 && t < 3 ? 'surprised' : 'neutral';
        frozen = true;
        hold = true;
        lift = t > 2.1 && t < 3 ? 0.6 : 0.2;
        break;
      }
      case 'turrets': {
        // Chameleon eyes: each turret looks its own way, cross-eyed at the end.
        const k = ramp(t, 0, 0.6) * (1 - ramp(t, a - 0.6, a));
        turret = [
          [15 * Math.sin(t * 1.7) * k, 55 * Math.sin(t * 1.3) * k],
          [15 * Math.sin(t * 1.9 + 1) * k, 55 * Math.sin(t * 1.1 + 2) * k],
        ];
        if (t > a - 2 && t < a - 0.6)
          turret = [
            [0, -40],
            [0, 40],
          ];
        expression = t > a - 2 && t < a - 0.6 ? 'dizzy' : 'neutral';
        head = [0, 6 * Math.sin(t * 0.8) * k, 0];
        break;
      }
      case 'stalk': {
        // Creeping up on something, one slow step at a time, tail stiff, tongue quivering.
        head = [8, 0, 0];
        tail = 'stiff';
        expression = 'focused';
        low = 0.5;
        if (!this.walking && r.phase === 0 && t > 3) {
          r.phase = 1;
          r.at = t;
        }
        if (r.phase === 1) {
          const w = t - r.at;
          tongue = w > 0.3 && w < 0.7 ? 1 : 0;
          low = 0.5 * (1 - ramp(w, 0.7, 1));
          head = [-6, 0, 0];
          expression = w > 1 ? 'happy' : 'focused';
        }
        break;
      }
      case 'shimmy': {
        const k = ramp(t, 0, 0.3) * (1 - ramp(t, a - 0.5, a));
        shake = k;
        tail = 'wave';
        tailAmt = 0.6 * k;
        show = 0.5 * k;
        break;
      }
      case 'peek': {
        // To the front lip and a look over it.
        if (r.phase === 0 && !this.walking && t > 1) {
          r.phase = 1;
          r.at = t;
        }
        if (r.phase === 1) {
          const w = t - r.at;
          const k = ramp(w, 0, 1) * (1 - ramp(t, a - 1, a));
          lift = 0.5 * k;
          head = [26 * k, 14 * Math.sin(t * 0.7) * k, 0];
          turret = [
            [30 * k, 0],
            [30 * k, 0],
          ];
          expression = 'focused';
        }
        break;
      }
      case 'display': {
        // Territorial: push-ups with the dewlap flared, bobbing at the world.
        const k = ramp(t, 0, 0.5) * (1 - ramp(t, a - 0.5, a));
        const bob = 0.5 - 0.5 * Math.cos(t * 9);
        lift = k * (0.5 + 0.5 * bob);
        dew = k * (0.8 + 0.2 * Math.sin(t * 9));
        head = [-12 * k, 0, 0];
        tail = 'stiff';
        expression = 'cross';
        break;
      }
      case 'curlNap': {
        // Flat on the floor, tail curled right round to the head, eyes shut.
        const k = ramp(t, 0, 2);
        low = k;
        tail = 'curl';
        tailAmt = k;
        head = [10 * k, 12 * k, 0];
        chest = [0, 6 * k, 0];
        expression = 'asleep';
        break;
      }
      case 'tailDrop': {
        // A fake-out: it spins its head round in alarm as its tail starts to wiggle on its own,
        // then it turns back, pleased with itself, and the tail settles.
        const k = ramp(t, 0, 0.4) * (1 - ramp(t, a - 1.2, a));
        const tailK = ramp(t, 0.5, 0.9) * (1 - ramp(t, a - 1.6, a - 0.8));
        tail = 'wave';
        tailAmt = 1.9 * tailK;
        head = [-6 * k, t < 3.6 ? 58 * k : 0, 0];
        chest = [0, t < 3.6 ? 14 * k : 0, 0];
        lift = 0.35 * k;
        expression = t < 3.6 ? 'surprised' : 'happy';
        frozen = t < 3.6;
        hold = frozen;
        break;
      }
      case 'twinEyes': {
        // The turrets go their own ways, in two directions at once, then swing in to look at each other.
        const k = ramp(t, 0, 0.5) * (1 - ramp(t, a - 0.5, a));
        const apart = ramp(t, 0.8, 1.6) * (1 - ramp(t, 3.2, 3.8));
        const drift = ramp(t, 3.2, 3.8) * (1 - ramp(t, 4.6, 5.1));
        const near = ramp(t, 4.9, 5.5);
        const wander = (f: number, ph: number) => 35 * Math.sin(t * f + ph);
        turret = [
          [10 * k * apart, k * (55 * apart + wander(2.1, 0) * drift - 46 * near)],
          [-10 * k * apart, k * (-55 * apart + wander(1.6, 2) * drift + 46 * near)],
        ];
        head = [0, 0, 0];
        expression = near > 0.5 ? 'cross' : 'neutral';
        break;
      }
      case 'camouflage': {
        // Goes dark and flat and holds still as the floor, eyes creeping about, then blinks back on.
        const k = ramp(t, 0, 1.2) * (1 - ramp(t, a - 1.6, a - 0.8));
        low = 0.5 * k;
        tail = 'stiff';
        head = [4 * k, 0, 0];
        frozen = true;
        hold = true;
        turret = [
          [0, 30 * k * Math.sin(t * 0.7)],
          [0, 30 * k * Math.sin(t * 0.6 + 1)],
        ];
        expression = t > a - 1.6 && t < a - 0.6 ? 'surprised' : 'focused';
        break;
      }
      case 'sway': {
        // Rocking side to side like a leaf on a twig: chest and hip swing against each other.
        const k = ramp(t, 0, 0.8) * (1 - ramp(t, a - 0.8, a));
        const w = Math.sin(t * 2.6);
        p.add('root', 2 * k * Math.sin(t * 5.2), 0, 6 * k * w);
        chest = [0, 12 * k * w, 0];
        p.add('hip', 0, -12 * k * w, 0);
        head = [0, -10 * k * w, -5 * k * w];
        tail = 'wave';
        tailAmt = 0.5 * k;
        turret = [
          [0, 16 * k * w],
          [0, 16 * k * w],
        ];
        break;
      }
      case 'poked': {
        // Freezes, eyes wide, dewlap flared, a flash along the back; then off in a flurry.
        frozen = true;
        hold = true;
        lift = 0.7 * (t < 2 ? 1 : 0.2);
        dew = t < 1.6 ? 1 : 0;
        head = [-12, 0, 0];
        tail = 'stiff';
        expression = 'surprised';
        turret = [
          [0, 0],
          [0, 0],
        ];
        break;
      }
      case 'love': {
        const k = ramp(t, 0, 0.8) * (1 - ramp(t, a - 0.8, a));
        tail = 'wave';
        tailAmt = 0.5 * k;
        head = [0, 0, 8 * sin(t, 0.6) * k];
        low = 0.4 * k;
        dew = 0.25 * k;
        expression = 'love';
        break;
      }
      case 'dizzy': {
        const k = ramp(t, 0, 0.4) * (1 - ramp(t, a - 1, a));
        this.spinning = 4 * Math.PI * ramp(t, 0.2, 3.4);
        head = [0, 14 * Math.sin(t * 6) * k, 10 * Math.cos(t * 5.3) * k];
        tail = 'wave';
        tailAmt = 0.8 * k;
        tongue = 0.35 * k;
        turret = [
          [10 * Math.cos(t * 7) * k, 50 * Math.sin(t * 7) * k],
          [10 * Math.cos(t * 7.5) * k, -50 * Math.sin(t * 7.5) * k],
        ];
        expression = t > 3.4 ? 'dizzy' : 'surprised';
        frozen = true;
        break;
      }
      default:
        break;
    }
    if (act !== 'wallClimb') this.scrabble = 0;
    if (act !== 'tailChase' && act !== 'dizzy') this.spinning = 0;
    if (act !== 'bask') this.basking = 0;
    if (act !== 'eyeLick') this.tongueLift = 0;
    // Normal speed again once a burst is over.
    if (!['scuttle', 'crawl', 'lick', 'stalk', 'peek', 'wallClimb'].includes(act))
      this.spec.speed = DIP;
    this.frozen = frozen;

    // ----- The walk -----
    const moving = clamp(this.stride / (DIP * bot), 0, 1.4);
    const amount = this.amt.update(dt, hold ? this.holdAmt : moving);
    if (!hold) this.holdAmt = Math.max(moving, 0.6 * this.holdAmt);
    if (hold && this.holdAmt < 0.4) this.holdAmt = 0.4;
    const g = this.gait * 1.6;
    const fast = clamp(this.stride / (3 * bot), 0, 1);
    // The diagonal pairs swing together; the body and tail snake against the legs.
    for (const [upper, lower, side, end] of LEGS) {
      const phase = side * end > 0 ? 0 : Math.PI; // FL and BR together
      const s = Math.sin(g + phase);
      const swing = (16 + 10 * fast) * amount * s;
      const raise = Math.max(0, Math.cos(g + phase)) * amount;
      p.add(upper, 0, -side * swing, side * (6 + 12 * fast) * raise);
      p.add(lower, 0, 0, side * (10 + 12 * fast) * raise);
    }
    p.add('chest', 0, 7 * amount * Math.sin(g) * (1 + fast), 0);
    p.add('hip', 0, -6 * amount * Math.sin(g) * (1 + fast), 0);
    p.add('head', 0, -5 * amount * Math.sin(g), 0);

    // Scrabbling on the wall, or pattering on the spot round a tail chase.
    if (this.scrabble || this.patter) {
      const n = this.scrabble ? (this.scrabble === 2 ? 9 : 5) : 7;
      const w = this.actT * n;
      for (const [upper, lower, side, end] of LEGS) {
        const ph = side * end > 0 ? 0 : Math.PI;
        p.add(upper, 0, -side * 20 * Math.sin(w + ph), side * 12 * Math.max(0, Math.cos(w + ph)));
        p.add(lower, 0, 0, side * 14 * Math.max(0, Math.cos(w + ph)));
      }
    }
    if (act !== 'tailChase') this.patter = 0;

    // ----- Shape -----
    // Front end up on its arms (push-ups, alert), or flat on the belly.
    const lifted = lift;
    const upK = this.low.update(dt, low);
    p.shift('chest', 0, 0.045 * lifted, 0);
    p.add('chest', -14 * lifted);
    p.shift('root', 0, -0.04 * upK, 0);
    for (const [upper, lower, side, end] of LEGS) {
      // Arms straighten as the chest rises; splayed flatter when low.
      if (end > 0) p.add(upper, 0, 0, -side * 22 * lifted);
      p.add(upper, 0, 0, -side * 18 * upK);
      p.add(lower, 0, 0, side * 14 * upK);
    }
    p.add('head', head[0] + 8 * lifted, head[1], head[2]);
    p.add('chest', chest[0], chest[1], chest[2]);
    p.add('eye.L', turret[0][0], turret[0][1], 0);
    p.add('eye.R', turret[1][0], turret[1][1], 0);
    if (shake) {
      p.add('chest', 0, 14 * shake * Math.sin(this.actT * 26), 0);
      p.add('hip', 0, -14 * shake * Math.sin(this.actT * 26), 0);
    }

    // The tail.
    const walking = clamp(amount, 0, 1);
    TAIL.forEach((bone, i) => {
      const lag = i * 0.75;
      let pitch = 0;
      let yaw = 0;
      switch (tail) {
        case 'curl':
          // Curls round in a spiral, sideways and up.
          yaw = 32 * tailAmt;
          pitch = 10 * tailAmt;
          break;
        case 'wave':
          yaw = 26 * tailAmt * Math.sin(this.actT * 4.5 - lag);
          pitch = 6 * tailAmt * Math.sin(this.actT * 4.5 - lag - 1);
          break;
        case 'stiff':
          pitch = 3;
          yaw = 1.5 * Math.sin(this.actT * 12);
          break;
        case 'up':
          pitch = 15;
          yaw = 6 * Math.sin(this.actT * 3 - lag);
          break;
        case 'spiral':
          yaw = 26 * tailAmt;
          pitch = 4 * tailAmt;
          break;
        default:
          yaw = 0;
      }
      // Walking snakes the tail against the body.
      yaw += (10 + 8 * fast) * walking * wag * Math.sin(g - lag - 1.2);
      p.add(bone, pitch, yaw, 0);
    });

    // Rearing up the back wall: the front tips up about the tail end, which stays down.
    const lean2 = this.lean.update(dt, lean);
    const rad = (lean2 * Math.PI) / 180;
    p.add('root', -lean2 * 0.9);
    p.shift('root', 0, 0.16 * Math.sin(rad), 0.04 * (1 - Math.cos(rad)));

    // Tongue, dewlap and the colour show, applied after the springs in after().
    this.tongueOut = this.tongue.update(dt, tongue);
    this.dewNow = clamp(this.puff.update(dt, dew), 0, 1.3);
    this.show += (show - this.show) * Math.min(1, dt * 3);
    this.expression = expression as never;
  }

  private scrabble = 0;
  private patter = 0;
  private basking = 0;
  private tongueLift = 0;
  private tongueOut = 0;
  private dewNow = 0;

  /** The plates down the back. */
  private lights(time: number) {
    const act = this.act;
    const t = this.actT;
    const show = this.show;
    for (let i = 0; i < PLATES; i++) {
      let level: number;
      let colour: string | undefined;
      if (act === 'poked') {
        level = clamp(1.6 - t, 0, 1) * (Math.sin(time * 28) > 0 ? 1 : 0.5);
        colour = BEACON.surprised;
      } else if (show > 0.05 || act === 'dizzy') {
        // A rainbow rippling along its back, every plate its own hue.
        level = 0.55 + 0.45 * Math.sin(time * 7 - i * 1.1);
        colour = `hsl(${Math.floor((time * 160 + i * 55) % 360)} 95% 62%)`;
      } else if (act === 'display' || act === 'throat') {
        level = 0.6 + 0.4 * Math.sin(time * 9 - i * 0.6);
        colour = BEACON.happy;
      } else if (act === 'love') {
        level = 0.55 + 0.45 * Math.sin(time * 2.4 - i * 0.7);
        colour = BEACON.love;
      } else if (act === 'bask') {
        // Soaking up the sun: a warm, even glow, brightening.
        level = 0.25 + 0.5 * ramp(t, 0, 4);
        colour = BEACON.happy;
      } else if (act === 'camouflage') {
        // Fades out along the back, dark while it hides, and flickers back on.
        const a = this.actLength;
        level =
          (1 - ramp(t, 0, 0.9)) * 0.5 +
          ramp(t, a - 1.4, a - 0.6) * (0.5 + 0.5 * Math.sin(time * 30 - i));
        level *= ramp(t, 0, 0.9) < 1 || t > a - 1.4 ? 1 : 0;
      } else if (act === 'tailDrop') {
        // The dropped-tail scare: the tail plates flash as it wriggles.
        level = i >= 4 && t > 0.5 && t < 3.6 ? 0.6 + 0.4 * Math.sin(time * 26 + i) : 0.3;
        colour = i >= 4 ? BEACON.surprised : undefined;
      } else if (act === 'sway') {
        level = 0.3 + 0.5 * Math.max(0, Math.sin(t * 2.6 - i * 0.5));
        colour = BEACON.happy;
      } else if (act === 'curlNap' || act === 'yawn') {
        level = 0.15 + 0.1 * Math.sin(time * 0.9 + i * 0.3);
      } else if (this.stride > 1 || this.frozen) {
        // Running lights, head to tail; held still when it freezes.
        level = this.frozen ? 0.45 : Math.max(0, 1 - ring(time * 2.4 - i / PLATES) / 0.2);
        colour = this.frozen ? BEACON.focused : undefined;
      } else {
        // Idle: a slow ripple from head to tail now and then.
        level = 0.25 + 0.6 * Math.max(0, 1 - ring(time / 4 - i / PLATES) / 0.1);
      }
      this.outfit.dot(i, level, colour);
    }
    const dewColour = act === 'display' || act === 'poked' ? BEACON.surprised : BEACON.happy;
    this.outfit.dot(DEWLAP, this.dewNow, act === 'love' ? BEACON.love : dewColour);
    const hidden = act === 'camouflage' && t > 0.9 && t < this.actLength - 1.4;
    this.outfit.dot(
      TIP,
      hidden ? 0 : this.stride > 1 ? 0.9 : 0.25 + 0.25 * Math.sin(time * 1.4),
      undefined,
    );
    this.outfit.beacon(BEACON[this.expression] ?? BEACON.neutral!);
  }

  /** In the colour look the body's colours shift through the hues while the show runs. */
  private tint(time: number) {
    if (this.lookName !== 'colour') {
      this.baseColours.clear();
      return;
    }
    const on = this.show > 0.02 || this.hue > 0.02;
    this.hue += ((this.show > 0.02 ? 1 : 0) - this.hue) * 0.08;
    const seen = new Set<Material>();
    this.model.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      const name: string = mesh.userData.role ?? '';
      if (!/^(Shell|Joint_Skin)$/.test(name) && !name.startsWith('Shell')) return;
      const m = mesh.material as Material & { color?: Color };
      if (!m.color || seen.has(m)) return;
      seen.add(m);
      if (!this.baseColours.has(m)) this.baseColours.set(m, m.color.clone());
      const base = this.baseColours.get(m)!;
      if (!on) return void m.color.copy(base);
      const hsl = { h: 0, s: 0, l: 0 };
      base.getHSL(hsl);
      m.color.setHSL((hsl.h + time * 0.25 * this.hue) % 1, Math.max(hsl.s, 0.5), hsl.l);
    });
  }

  protected after(_dt: number, env: Env) {
    const p = this.puppet;
    this.lights(env.time);
    this.tint(env.time);

    // The tongue shoots out, the dewlap swells.
    const k = clamp(this.tongueOut, 0, 1.15);
    p.add('tongue', 0, 0, 0);
    p.turn('tongue', -this.tongueLift * k);
    p.stretch('tongue', Math.max(0.001, k), [0, 0, 1], k > 0.02 ? 1 : 0.001);
    const d = Math.max(0.001, this.dewNow);
    p.stretch('dewlap', d, [0, 1, 0], d);

    // A tail chase or a dizzy spin turns the whole lizard on the spot.
    this.pivot.rotation.y = this.spinning;
  }
}
