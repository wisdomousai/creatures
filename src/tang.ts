import { type Bone, Color, type Object3D, Vector3 } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { depthScale, project } from './box';
import { type Act, Character, clamp, type Env, envelope, type Frame } from './character';
import type { Expression, FaceLayout } from './face';
import { sin } from './moves';
import { Spring, wobble } from './spring';

/**
 * Oops, the robot blue tang: a small, cheerful, forgetful fish. He swims through the air
 * of the box like a fish in a tank, in the band just inside the frame, a little way back,
 * passing behind the crew. His body is a tall flat oval in three plates on a chain of
 * joints, so a wave runs down it as he swims; his tail is a crescent in two lobes that
 * sweep and flare, his pectoral fins flutter, and his dorsal and anal fins ripple.
 *
 * On each flank twelve round plates wind into a swirl, and they are his lights: a glow
 * chases along it as he swims, all of it flickers when he loses his thread, flashes when
 * he finds it. On top of his head sits a beacon with three little thought-bubble lights
 * that pop up one after another when he is thinking, and a lightbulb or a row of
 * question marks shows on his screen between the eyes.
 *
 * Tricks: swimming off and forgetting where to (he stops mid-stroke, question marks, looks
 * about, and carries on quite cheerfully), remembering with a lightbulb, a happy wiggle,
 * a loop, a pirouette, bubbles, a hiccup, a yawn, swimming backwards by mistake, reading a
 * sign he forgot (a squint), a talk (his mouth opens and closes), a fin wave, dozing while
 * he swims, chasing his own tail, a peek from the back wall, bonking the glass, following
 * a crewmate and forgetting why, preening, turning back the way he came, a determined
 * swim with buzzing fins, a gentle bump on the front lip, hiding flat against the back
 * wall, a startled spin of the swirl lights, a big relieved sigh, a happy shimmy, drifting
 * up to the ceiling light, a zigzag. `ask` is for the site's cookie question (the only
 * reason he comes on): he swims to the front, looks at the visitor, talks for a while,
 * forgets mid-sentence, remembers, asks, and waits until `answered()` (`phaseName` and
 * `onPhase` say where he is, for a speech bubble to come and go with).
 *
 * He watches the mouse but never follows it. Poke him and he darts off away from it; three
 * quick pokes and he spins dizzy. Rest the mouse on him and he wiggles with pleasure.
 */
export const TANG_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.25, 0.42],
    [0.75, 0.42],
  ],
  rx: 0.11,
  ry: 0.185,
  line: 0.04,
  mouth: [0.5, 0.82],
};

type Point = { x: number; y: number };

const DEG = Math.PI / 180;
/** The swimming wave, head to tail: each bone's share of the swing (the head swings against it). */
const WAVE: [string, number][] = [
  ['head', -0.3],
  ['body', 0.25],
  ['spine.1', 0.7],
  ['tail', 1.2],
];
const FINS = [
  ['fin.L', 1],
  ['fin.R', -1],
] as const;
const RIPPLE = ['dorsal', 'dorsal.2', 'anal', 'anal.2'];
/** Lights in the swirl on his flank (Dot0..Dot11), outside to middle. */
const DOTS = 12;
const BUBBLES = 5;
/** His pivot, the middle of his body, above his "feet" (as a share of his height). */
const MIDDLE = 0.45;
/** How far back into the box he swims between tricks (0 front, 1 back wall). */
const HOME_DEPTH = 0.4;
/** How far he turns from the viewer: hanging in the water, and swimming. */
const HANG = 36;
const SWIM = 62;
const bump = (x: number, width: number) => Math.max(0, 1 - Math.abs(x) / width);
const ease = (x: number) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};
const v3 = new Vector3();

interface Bubble {
  /** When it comes out (env time), or -1 when it isn't out. */
  at: number;
  from: Vector3;
  life: number;
  size: number;
  drift: number;
}

export class Tang extends Character {
  /** Held by the pointer, it flies after it. */
  readonly flies = true;
  private pos: Point = { x: 0, y: 0 };
  private vel: Point = { x: 0, y: 0 };
  private target: Point | null = null;
  private cruise = 1;
  private accel = 1;
  /** Called when he gets to where he was swimming. */
  private then: (() => void) | null = null;
  /** 1 facing the viewer's right, -1 the left. */
  private facing = 1;
  private turning = 0;
  /** Swimming tail first (backing up, by mistake). */
  private reverse = false;
  private tilt = new Spring(0.8, 0.8);
  private off = { x: new Spring(2, 0.7), y: new Spring(2, 0.7) };
  private phase = 0;
  private swim = 0;
  private exiting = false;
  private pokes: number[] = [];
  private hoverT = 0;
  private hoverDone = false;
  private frame!: Frame;
  private time = 0;
  private dartWay = 1;
  private cues: [number, () => void][] = [];
  private roam = HOME_DEPTH;
  private mate: Character | null = null;
  private others: readonly Character[] = [];
  private pointer: Point = { x: -1e4, y: -1e4 };
  /** What is on his screen between the eyes, and how many thought bubbles are up. */
  private mark: 'none' | 'question' | 'bulb' = 'none';
  private thinking = 0;
  private thought = Array.from({ length: 3 }, (_, i) => new Spring(5 - i * 0.4, 0.45));
  /** Talking, and how hard he is trying to look at the viewer (turned square on). */
  private talking = false;
  private facingUs = false;
  private flash = 0;
  private curl = 0;
  private spinAt = -1;
  private beaconColour = new Color('#f4f4f1');
  private bubbles: Bubble[] = [];
  private blowAt: number[] = [];
  private mouthRest: Vector3[];
  /** Where he is in an `ask`, for the site. */
  phaseName = 'none';
  onPhase: ((phase: string) => void) | null = null;
  /** Outside `ask`: 'talk' as he talks, 'remember' as the lightbulb comes on, and null when
   * the act is over, for the site's speech bubble (he only ever talks about cookies). */
  onSay: ((what: 'talk' | 'remember' | null) => void) | null = null;

  constructor(model: Object3D) {
    super(
      {
        name: 'Oops',
        model: 'tang',
        metres: 0.44,
        width: 0.5,
        size: 0.95,
        feels: {
          default: { f: 2.5, zeta: 0.6 },
          root: { f: 1.6, zeta: 0.7 },
          body: { f: 1.4, zeta: 0.75 },
          head: { f: 1.9, zeta: 0.65 },
          'spine.1': { f: 2.2, zeta: 0.55 },
          tail: { f: 2.6, zeta: 0.45 },
          'tail.U': { f: 3, zeta: 0.4 },
          'tail.D': { f: 3, zeta: 0.4 },
          'fin.L': { f: 4, zeta: 0.4 },
          'fin.R': { f: 4, zeta: 0.4 },
          dorsal: { f: 2.5, zeta: 0.4 },
          'dorsal.2': { f: 2.8, zeta: 0.35 },
          anal: { f: 2.5, zeta: 0.4 },
          'anal.2': { f: 2.8, zeta: 0.35 },
        },
        face: TANG_FACE,
        eyes: 0.55,
        gaze: [
          { bone: 'head', yaw: 0.35, pitch: 0.4 },
          { bone: 'body', yaw: 0.4, pitch: 0.3 },
        ],
        reach: { yaw: 50, pitch: 25 },
        lag: 1.1,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [50, 120],
        speed: 1.3,
        turn: SWIM,
      },
      model,
    );
    this.heading = new Spring(0.8, 0.8);
    for (let i = 0; i < BUBBLES; i++)
      this.bubbles.push({ at: -1, from: new Vector3(), life: 2, size: 1, drift: 0 });
    this.mouthRest = this.bubbles.map((_, i) => this.puppet.bone(`bubble.${i}`).position.clone());
    this.acts = this.moves();
  }

  // ---------- Acts ----------

  private moves(): Record<string, Act> {
    const still = () => !!this.free && this.target === null && !this.exiting;
    const room = () => this.pos.y - this.frame.top > this.front * 3.4;
    return {
      // ---- Everyday
      idle: { weight: 3, length: [3, 6] },
      swim: {
        weight: 3,
        length: [3, 5],
        when: still,
        start: () => this.swimTo(this.spot(), this.front * (1 + Math.random() * 0.5)),
      },
      cruise: {
        weight: 1.1,
        length: [5, 8],
        when: still,
        start: () => this.swimTo(this.spot(true), this.front * 2),
      },
      wiggle: { weight: 1.5, length: [2.2, 2.8], when: still },
      // Swims off somewhere, stops mid-stroke, has no idea where to, and carries on cheerfully.
      forget: {
        weight: 2.8,
        length: [7, 8],
        when: still,
        start: () => {
          this.goAhead(3.5);
          this.cue(1.3, () => this.halt());
          this.cue(1.5, () => this.think('question', 3));
          this.cue(4.6, () => {
            this.think('none', 0);
            this.swimTo(this.spot(), this.front * 1.3);
          });
        },
      },
      // Stops, frowns, and then: a lightbulb, and off he goes with a flourish.
      remember: {
        weight: 1.2,
        length: [7, 8],
        when: still,
        start: () => {
          this.goAhead(2.5);
          this.cue(1.1, () => this.halt());
          this.cue(1.3, () => this.think('question', 2));
          this.cue(3.3, () => {
            this.think('bulb', 3);
            this.flash = 1;
            this.onSay?.('remember');
          });
          this.cue(4.8, () => {
            this.think('none', 0);
            this.swimTo(this.spot(true), this.front * 3);
          });
        },
      },
      loop: {
        weight: 1,
        length: [4, 4.6],
        when: () => still() && room(),
        start: () => this.goAhead(4, this.front * 1.6),
      },
      spin: {
        weight: 0.8,
        length: [3, 3.4],
        when: still,
        start: () => this.goAhead(1.5, this.front * 0.8),
      },
      bubbles: {
        weight: 1.2,
        length: [3.5, 4.5],
        when: still,
        start: () => this.blow([0.6, 1.4, 2.3]),
      },
      // Follows a crewmate about, and forgets why.
      follow: {
        weight: 0.9,
        length: [10, 11],
        when: () => still() && !!this.crewmate(),
        start: () => {
          this.visit();
          this.cue(5.2, () => {
            this.halt();
            this.think('question', 3);
          });
          this.cue(8, () => {
            this.think('none', 0);
            this.mate = null;
            this.swimTo(this.spot(), this.front * 1.3);
          });
        },
      },
      backwards: {
        weight: 0.8,
        length: [5.5, 6],
        when: still,
        start: () => {
          this.reverse = true;
          this.swimTo(
            { x: this.pos.x - this.facing * this.front * 2.4, y: this.pos.y },
            this.front * 0.55,
          );
          this.cue(3.6, () => {
            this.reverse = false;
            this.think('question', 1);
          });
          this.cue(5, () => this.think('none', 0));
        },
      },
      // The sign he forgot: right up close, squinting, and then he gets it.
      read: {
        weight: 0.7,
        length: [7, 7.6],
        when: still,
        start: () => {
          this.depthGoal = 0;
          this.cue(4.4, () => {
            this.think('bulb', 2);
            this.flash = 0.7;
          });
          this.cue(6, () => this.think('none', 0));
        },
      },
      talk: { weight: 1.2, length: [4.5, 5.5], when: still, start: () => this.onSay?.('talk') },
      wave: { weight: 1, length: [3, 3.4], when: still },
      doze: {
        weight: 0.6,
        length: [9, 13],
        face: 'asleep',
        when: still,
        start: () => this.goAhead(2, this.front * 0.25),
      },
      // Round and round after his own tail.
      chase: { weight: 0.7, length: [4, 4.4], when: still },
      yawn: { weight: 0.5, length: [3.6, 4], when: still, start: () => this.blow([2.3], true) },
      hiccup: {
        weight: 0.5,
        length: [4.2, 4.6],
        when: still,
        start: () => this.blow([0.8, 1.55, 2.3, 3.05]),
      },
      lookabout: { weight: 1, length: [4, 5], when: still },
      preen: { weight: 0.7, length: [3.6, 4.2], when: still },

      // ---- The depth of the box
      peek: {
        weight: 0.5,
        length: [7, 8],
        when: still,
        start: () => {
          this.depthGoal = 0.95;
          this.cue(3.6, () => (this.depthGoal = 0));
          this.cue(6.4, () => (this.depthGoal = this.roam));
        },
      },
      // Off to the front, straight into the glass; and he forgets it is there.
      bonk: {
        weight: 0.5,
        length: [5.4, 5.8],
        when: still,
        start: () => {
          this.depthGoal = 0;
          this.cue(3.3, () => this.think('question', 2));
          this.cue(5, () => this.think('none', 0));
        },
      },

      // Swims off, thinks better of it, and swims back the way he came.
      turnback: {
        weight: 1,
        length: [7, 7.6],
        when: still,
        start: () => {
          this.goAhead(3);
          this.cue(1.5, () => {
            this.halt();
            this.think('question', 2);
          });
          this.cue(3.2, () => {
            this.think('none', 0);
            this.swimTo(
              { x: this.pos.x - this.facing * this.front * 3.2, y: this.pos.y },
              this.front * 1.4,
            );
          });
        },
      },
      // Head down, fins buzzing: he is going, and nothing will stop him.
      determined: {
        weight: 0.8,
        length: [4, 4.6],
        when: still,
        start: () => this.goAhead(6, this.front * 2.6),
      },
      // A gentle little bump on the front lip, and a shy look.
      nudge: {
        weight: 0.6,
        length: [5, 5.4],
        when: still,
        start: () => {
          this.depthGoal = 0;
          this.cue(4.2, () => (this.depthGoal = this.roam));
        },
      },
      // Flat against the back wall, hoping not to be noticed.
      hide: {
        weight: 0.5,
        length: [7, 8],
        when: still,
        start: () => {
          this.depthGoal = 1;
          this.cue(6, () => (this.depthGoal = this.roam));
        },
      },
      // Startled: the lights of his swirl spin round on their own.
      swirlspin: { weight: 0.6, length: [3, 3.4], when: still },
      // A big relieved sigh: one large bubble.
      sigh: { weight: 0.6, length: [4, 4.4], when: still, start: () => this.blow([1.9], true) },
      // A little happy shimmy from side to side.
      shimmy: { weight: 1, length: [2.4, 2.8], when: still },
      // Drifts up towards the ceiling light and back down.
      float: {
        weight: 0.6,
        length: [8, 9],
        when: still,
        start: () => {
          this.swimTo({ x: this.pos.x, y: this.frame.top + this.front * 0.9 }, this.front * 0.5);
          this.cue(4.5, () => this.swimTo(this.spot(), this.front * 0.6));
        },
      },
      // Three quick changes of mind about which way is up.
      zigzag: {
        weight: 0.7,
        length: [4, 4.4],
        when: () => still() && room(),
        start: () => {
          const H = this.front;
          const go = (up: number) =>
            this.swimTo({ x: this.pos.x + this.facing * H * 1.2, y: this.pos.y + up * H }, H * 2.2);
          go(-1);
          this.cue(0.7, () => go(1.5));
          this.cue(1.5, () => go(-1.5));
          this.cue(2.3, () => go(0.8));
        },
      },

      // ---- For the site
      ask: {
        weight: 0,
        length: [60, 60],
        start: () => this.beginAsk(),
      },

      // ---- Reactions
      dart: { weight: 0, length: [1.8, 2.2], face: 'surprised' },
      dizzy: { weight: 0, length: [3.6, 3.6] },
      pleased: { weight: 0, length: [2.4, 2.8] },
    };
  }

  /** Ask the visitor: swims to the front (to `at`, in the viewport, if given), talks,
   * forgets, remembers, asks, and waits for the answer (`answered()`), or for the minute
   * the act lasts. */
  ask(at?: Point) {
    this.askAt = at ?? null;
    this.perform('ask');
  }
  private askAt: Point | null = null;

  /** The visitor answered: a happy flash, and he swims back off. */
  answered() {
    if (this.act !== 'ask') return;
    this.flash = 1;
    this.talking = false;
    this.facingUs = false;
    this.setPhase('done', 0);
    this.roam = HOME_DEPTH;
    this.swimTo(this.spot(true), this.front * 2);
    this.setAct('idle');
  }

  private beginAsk() {
    const f = this.frame;
    const H = this.front;
    this.phaseName = 'swimming';
    this.depthGoal = 0;
    this.roam = 0.1;
    const at = this.askAt ?? { x: (f.left + f.right) / 2, y: f.bottom - H * 2.6 };
    // Brisker the further he has to come, so he's there in a few seconds.
    const far = Math.hypot(at.x - this.pos.x, at.y - this.pos.y);
    const speed = Math.max(H * 2.6, far / 2.5);
    this.swimTo(at, speed, () => {
      this.facingUs = true;
      // Long enough to read each line in a bubble beside him.
      this.setPhase('talk', 0);
      this.cue(this.actT + 5.2, () => {
        this.talking = false;
        this.think('question', 3);
        this.setPhase('forget', 0);
      });
      this.cue(this.actT + 8, () => {
        this.think('bulb', 3);
        this.flash = 1;
        this.setPhase('remember', 0);
      });
      this.cue(this.actT + 9.6, () => {
        this.think('none', 0);
        this.setPhase('talk', 1);
      });
      // Then he waits, looking at you, for the answer.
      this.cue(this.actT + 12.8, () => (this.talking = false));
    });
    // (and gets up to speed quickly)
    this.accel = Math.max(this.accel, speed * 1.5);
  }

  private setPhase(name: string, part: number) {
    this.phaseName = name === 'talk' ? `talk${part + 1}` : name;
    this.talking = name === 'talk';
    this.onPhase?.(this.phaseName);
  }

  protected setAct(name: string) {
    this.onSay?.(null);
    this.cues = [];
    this.reverse = false;
    this.mark = 'none';
    this.thinking = 0;
    this.talking = false;
    this.curl = 0;
    if (name !== 'ask') {
      this.facingUs = false;
      this.phaseName = 'none';
    }
    this.spinAt = -1;
    // Back to his usual depth, unless the act takes him elsewhere.
    if (this.free) this.depthGoal = this.roam;
    super.setAct(name);
  }

  private cue(at: number, fn: () => void) {
    this.cues.push([at, fn]);
  }

  private think(mark: 'none' | 'question' | 'bulb', bubbles: number) {
    this.mark = mark;
    this.thinking = bubbles;
  }

  poke() {
    if (this.state !== 'here' || !this.free || this.exiting) return;
    const now = performance.now() / 1000;
    this.pokes = [...this.pokes.filter((at) => now - at < 2), now];
    if (this.act === 'ask') return this.puppet.kick('body', 0, 0, 60);
    if (this.pokes.length >= 3) {
      this.pokes = [];
      this.target = null;
      this.setAct('dizzy');
      this.blow([0.9, 1.3, 1.7]);
    } else if (this.act !== 'dizzy') this.dart();
  }

  /** His height at the front of the box, the size the band is measured in. */
  private get front() {
    return this.spec.size * this.frame.bot;
  }

  /** A dash away from the poke, a flick of the body. */
  private dart() {
    const H = this.front;
    const p = this.pointer;
    const near = Math.hypot(p.x - this.pos.x, p.y - this.pos.y) < this.heightPx * 1.6;
    const along = near ? p.x - this.pos.x : 0;
    const way = along > 0 ? -1 : along < 0 ? 1 : this.facing;
    this.dartWay = way;
    if (way !== this.facing) {
      this.facing = way as 1 | -1;
      this.heading.kick(way * 500);
    }
    this.turning = 0;
    this.setAct('dart');
    this.swimTo(
      { x: this.pos.x + way * H * (2.6 + Math.random()), y: this.pos.y - H * 0.3 * Math.random() },
      H * 6,
    );
    this.accel = H * 20;
  }

  // ---------- Where he swims ----------

  private crewmate(): Character | null {
    const mates = this.others.filter((o) => o !== this && o.state === 'here' && !o.free);
    return mates.length ? mates[Math.floor(Math.random() * mates.length)] : null;
  }

  private visit() {
    const mate = (this.mate = this.crewmate());
    if (!mate) return;
    const H = this.front;
    const depth = clamp(mate.depth - 0.1, 0, 1);
    this.depthGoal = depth;
    const k = depthScale(this.frame, depth);
    const vx = (this.frame.left + this.frame.right) / 2;
    const b = mate.bounds(this.frame);
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = b.x + b.w / 2 + side * (b.w / 2 + H * 0.9 * k);
    const front = vx + (x - vx) / k;
    this.swimTo({ x: front, y: this.frame.bottom - H * 1.4 }, this.front * 1.5);
  }

  /** A clear place in the band just inside the frame (`far`: well away from here). */
  private spot(far = false): Point {
    const f = this.frame;
    const H = this.front;
    const r = Math.random;
    let p = { x: this.pos.x, y: this.pos.y };
    for (let i = 0; i < 12; i++) {
      const k = r();
      if (k < 0.5)
        p = {
          x: f.left + H + r() * (f.right - f.left - 2 * H),
          y: f.bottom - H * (0.7 + r() * 2.2),
        };
      else if (k < 0.62)
        p = { x: f.left + H + r() * (f.right - f.left - 2 * H), y: f.top + H * (0.9 + r() * 1.6) };
      else if (k < 0.81)
        p = {
          x: f.left + H * (1 + r() * 2.2),
          y: f.top + H * 2 + r() * (f.bottom - f.top - 4 * H),
        };
      else
        p = {
          x: f.right - H * (1 + r() * 2.2),
          y: f.top + H * 2 + r() * (f.bottom - f.top - 4 * H),
        };
      if (Math.hypot(p.x - this.pos.x, p.y - this.pos.y) > H * (far ? 4 : 1.6)) break;
    }
    this.roam = 0.2 + 0.5 * r();
    this.depthGoal = this.roam;
    return p;
  }

  /** On, the way he faces, this many heights, and a little up or down. */
  private goAhead(heights: number, speed = this.front * 1.2) {
    const H = this.front;
    const y = this.pos.y + (Math.random() - 0.5) * H * 0.8;
    this.swimTo({ x: this.pos.x + this.facing * H * heights, y }, speed);
  }

  private swimTo(p: Point, speed = this.front * 1.2, then?: () => void) {
    const [cx, cy] = this.inside(p.x, p.y, this.frame);
    this.target = { x: cx, y: cy };
    this.cruise = speed;
    this.accel = this.front * 1.4;
    this.then = then ?? null;
    // Turn round if he has to go the other way.
    if (
      Math.abs(cx - this.pos.x) > this.front * 0.5 &&
      Math.sign(cx - this.pos.x) !== this.facing &&
      !this.reverse
    )
      this.turning = 1;
  }

  private halt() {
    this.target = null;
    this.then = null;
  }

  /** Bubbles, at these many seconds from now. */
  private blow(times: number[], big = false) {
    this.blowAt.push(...times.map((t) => this.time + t));
    if (big) this.bigNext = true;
  }
  private bigNext = false;

  leave() {
    if (this.state !== 'here' || !this.free) return super.leave();
    if (this.exiting) return;
    // Swim to the nearer side of the bottom, then off behind the frame.
    this.exiting = true;
    const f = this.frame;
    const left = this.pos.x < (f.left + f.right) / 2;
    this.think('none', 0);
    this.swimTo(
      {
        x: left ? f.left : f.right,
        y: f.bottom - MIDDLE * this.front,
      },
      this.front * 1.5,
    );
    this.setAct('idle');
  }

  protected onEnter() {
    this.free = null;
    this.exiting = false;
    this.target = null;
    this.h = 0;
    this.roam = HOME_DEPTH;
    this.off.x.snap(0);
    this.off.y.snap(0);
    for (const b of this.bubbles) b.at = -1;
    this.blowAt = [];
    this.cues = [];
    this.mark = 'none';
    this.thinking = 0;
    this.talking = false;
  }

  /** In from the side: from here on he swims free. */
  protected onArrive() {
    const H = this.front;
    this.facing = this.pace < 0 || (this.pace === 0 && this.heading.y < 0) ? -1 : 1;
    this.pos = { x: this.s, y: this.frame.bottom - MIDDLE * H };
    this.vel = { x: this.pace, y: 0 };
    this.pace = 0;
    this.free = { x: this.s, y: this.frame.bottom, tilt: 0 };
    this.depthGoal = this.roam;
    this.tilt.snap(0);
  }

  /** Back on the frame line, to swim off behind the side of the frame. */
  private offstage() {
    this.free = null;
    this.edge = 'bottom';
    this.s = this.pos.x;
    this.h = 0;
    this.pace = this.vel.x;
    this.exiting = false;
    super.leave();
  }

  /** Wherever he goes, his body stays inside the frame line. */
  private inside(x: number, y: number, frame: Frame): [number, number] {
    const H = this.front;
    const within = (v: number, lo: number, hi: number) =>
      lo < hi ? clamp(v, lo, hi) : (lo + hi) / 2;
    return [
      within(x, frame.left + H * 0.9, frame.right - H * 0.9),
      within(y, frame.top + H * 0.75, frame.bottom - H * 0.45),
    ];
  }

  protected move(dt: number, env: Env) {
    this.frame = env.frame;
    this.time = env.time;
    this.pointer = { x: env.pointer.x, y: env.pointer.y };
    this.others = env.crew;
    const H = this.front;
    if (!this.free) {
      super.move(dt, env);
      this.swim = this.stride / (this.heightPx * 1.2);
      return;
    }
    const speed = Math.hypot(this.vel.x, this.vel.y);
    let want: Point = { x: 0, y: 0 };
    if (this.target) {
      const dx = this.target.x - this.pos.x;
      const dy = this.target.y - this.pos.y;
      const dist = Math.hypot(dx, dy) || 1;
      // A fish only swims forward (but for backing up): facing the wrong way, he slows and turns first.
      if (!this.reverse && Math.abs(dx) > H * 0.5 && Math.sign(dx) !== this.facing) {
        if (speed < H * 0.45) {
          this.facing = Math.sign(dx) as 1 | -1;
          this.turning = 1;
        }
      } else if (this.turning <= 0.35) {
        const v = Math.min(this.cruise, Math.sqrt(2 * this.accel * 0.8 * dist));
        want = { x: (dx / dist) * v, y: (dy / dist) * v };
      }
      if (dist < H * 0.12 && speed < H * 0.35) {
        this.target = null;
        const then = this.then;
        this.then = null;
        then?.();
      }
    }
    this.turning = Math.max(0, this.turning - dt * 1.1);
    if (!this.target) {
      const k = Math.exp(-dt * 2.2);
      this.vel.x *= k;
      this.vel.y *= k;
    } else {
      const ax = clamp(want.x - this.vel.x, -this.accel * dt, this.accel * dt);
      const ay = clamp(want.y - this.vel.y, -this.accel * dt, this.accel * dt);
      this.vel.x += ax;
      this.vel.y += ay;
    }
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.swim = Math.hypot(this.vel.x, this.vel.y) / (H * 1.2);

    // Nose up or down with the way he is going, and the act's own tilt.
    const k = clamp(Math.hypot(this.vel.x, this.vel.y) / (H * 0.8), 0, 1);
    const pitch =
      clamp(Math.atan2(-this.vel.y, Math.max(0.05, Math.abs(this.vel.x))) / DEG, -32, 32) * k;
    this.free.tilt = this.tilt.update(
      dt,
      this.facing * ((this.reverse ? -0.3 : 1) * pitch + this.nose()) * DEG,
    );
    this.heading.update(dt, this.facing * this.aim(HANG + (SWIM - HANG) * k));
    const lift = this.lift();
    const rx = this.off.x.update(dt, lift.x);
    const ry = this.off.y.update(dt, lift.y);
    const [x, y] = this.inside(this.pos.x + rx, this.pos.y + ry, env.frame);
    this.free.x = x;
    this.free.y = y + MIDDLE * H;
    if (this.exiting && this.target === null) this.offstage();
  }

  // ---------- What he is doing ----------

  /** How far he is turned from us (degrees) for what he's doing; `base` when nothing special. */
  private aim(base: number) {
    const t = this.actT;
    if (this.facingUs) return 6 + 4 * Math.sin(t * 1.3);
    switch (this.act) {
      case 'forget':
      case 'remember':
      case 'turnback':
        return this.mark === 'none'
          ? base
          : 12 + 40 * Math.sin(t * 2.6) * (this.mark === 'question' ? 1 : 0.2);
      case 'follow':
        return this.mark !== 'none'
          ? 12 + 40 * Math.sin(t * 2.4)
          : this.target === null
            ? 44
            : base;
      case 'lookabout':
        return 8 + 44 * Math.sin(t * 1.5) * envelope(t, this.actLength, 0.5);
      case 'talk':
        return 8 + 3 * Math.sin(t * 1.1);
      case 'read':
        return t > 1 ? 8 : base;
      case 'bonk':
        return t > 2.6 ? 12 + 30 * Math.sin(t * 3) : 6;
      case 'wave':
        return 30;
      case 'nudge':
        return t > 2.6 ? 16 + 24 * Math.sin(t * 2.5) : 6;
      case 'hide':
        return 66;
      case 'swirlspin':
        return 14;
      case 'sigh':
        return 24;
      case 'shimmy':
        return 22 + 26 * Math.sin(t * 6) * envelope(t, this.actLength, 0.3);
      case 'preen':
        return 58;
      case 'yawn':
      case 'hiccup':
      case 'bubbles':
        return 24;
      case 'dizzy':
        return 20;
      case 'backwards':
        return this.reverse ? 50 : base;
      case 'doze':
        return 52;
      case 'peek':
        return 4;
      default:
        return base;
    }
  }

  /** Nose up (degrees) for what he's doing. */
  private nose() {
    const t = this.actT;
    switch (this.act) {
      case 'loop': {
        const u = clamp((t - 0.7) / 2.4, 0, 1);
        return 360 * ease(u);
      }
      case 'forget':
      case 'remember':
      case 'turnback':
        return this.mark === 'question' ? 10 * Math.sin(t * 3.1) : 0;
      case 'lookabout':
        return 8 * Math.sin(t * 2.1);
      case 'determined':
        return -6;
      case 'sigh':
        return -8 * envelope(t, this.actLength, 0.8);
      case 'nudge':
        return t > 2.8 ? 10 * bump(t - 3.3, 0.5) : 0;
      case 'read':
        return -14 * clamp(t / 1, 0, 1) * (t < 6 ? 1 : 0);
      case 'doze':
        return -5;
      case 'yawn':
        return 18 * envelope(t, this.actLength, 0.6);
      case 'hiccup':
        return 10 * this.hic(t);
      case 'bonk':
        return t > 2.8 ? 14 * bump(t - 3.4, 0.5) : 0;
      case 'dizzy':
        return 14 * Math.sin(t * 5) * clamp(1.6 - Math.abs(t - 2.2), 0, 1);
      case 'preen':
        return 8 * sin(t, 0.4);
      case 'wiggle':
      case 'pleased':
        return 6 * sin(t, 1.2);
      default:
        return 3 * sin(this.time, 0.13) * (1 - clamp(this.swim, 0, 1));
    }
  }

  private hic(t: number) {
    let k = 0;
    for (let i = 0; i < 4; i++) k = Math.max(k, bump(t - (0.85 + 0.75 * i), 0.2));
    return k;
  }

  /** How far he rises out of his place (px): bobbing, and the loop's circle. */
  private lift(): Point {
    const H = this.front;
    const t = this.actT;
    const f = this.facing;
    const bob = { x: 0, y: H * 0.035 * sin(this.time, 0.27) };
    switch (this.act) {
      case 'loop': {
        const u = clamp((t - 0.7) / 2.4, 0, 1);
        const a = 2 * Math.PI * ease(u);
        const R = H * 1.05;
        return { x: f * R * Math.sin(a), y: -R * (1 - Math.cos(a)) };
      }
      case 'doze':
        return { x: 0, y: H * 0.06 + bob.y + H * 0.05 * sin(t, 0.15) };
      case 'yawn':
        return { x: 0, y: -H * 0.05 * envelope(t, this.actLength, 0.8) };
      case 'hiccup':
        return { x: 0, y: -H * 0.12 * this.hic(t) };
      case 'spin':
        return { x: 0, y: -H * 0.2 * bump(t - 1.2, 0.7) };
      case 'chase':
        return { x: 0, y: -H * 0.1 * bump(t - 2.2, 1.6) };
      case 'wiggle':
      case 'pleased':
        return {
          x: 0,
          y: -H * 0.08 * Math.abs(Math.sin(t * 4.2)) * envelope(t, this.actLength, 0.3),
        };
      case 'preen':
        return { x: 0, y: -H * 0.12 * bump(t - 2, 1.2) };
      case 'bonk':
        return { x: 0, y: t > 2.7 && t < 3.6 ? H * 0.12 : 0 };
      case 'nudge':
        return { x: 0, y: t > 2.7 && t < 3.4 ? H * 0.06 : 0 };
      case 'swirlspin':
        return { x: 0, y: -H * 0.15 * bump(t - 0.4, 0.3) };
      case 'sigh':
        return { x: 0, y: -H * 0.06 * envelope(t, this.actLength, 0.8) };
      case 'shimmy':
        return {
          x: 0,
          y: -H * 0.05 * Math.abs(Math.sin(t * 6)) * envelope(t, this.actLength, 0.3),
        };
      case 'read':
        return { x: f * H * 0.1 * bump(t - 2, 1.5), y: -H * 0.05 };
      default:
        return bob;
    }
  }

  /** The face he pulls in each act (over the act's own, where it has one). */
  private mood(t: number): Expression | undefined {
    if (this.act === 'ask') {
      if (this.phaseName === 'forget') return 'surprised';
      if (this.phaseName === 'remember') return 'happy';
      if (this.phaseName === 'done') return 'happy';
      return this.phaseName.startsWith('talk') ? 'neutral' : 'happy';
    }
    if (this.mark === 'question') return 'neutral';
    if (this.mark === 'bulb') return 'happy';
    switch (this.act) {
      case 'dizzy':
        return t < 1.8 ? 'surprised' : 'dizzy';
      case 'dart':
        return t < 1.2 ? 'surprised' : 'neutral';
      case 'read':
        return t < 4.4 ? 'focused' : 'happy';
      case 'backwards':
        return this.reverse ? 'focused' : 'surprised';
      case 'bonk':
        return t < 2.7 ? 'happy' : t < 4 ? 'surprised' : 'sad';
      case 'yawn':
        return t < 2.6 ? 'sleepy' : 'happy';
      case 'hiccup':
        return this.hic(t) > 0.25 ? 'surprised' : 'neutral';
      case 'talk':
        return 'neutral';
      case 'determined':
      case 'zigzag':
        return 'focused';
      case 'nudge':
        return t < 2.7 ? 'happy' : t < 4 ? 'surprised' : 'happy';
      case 'hide':
        return t < 1 ? 'surprised' : 'wink';
      case 'swirlspin':
        return 'surprised';
      case 'sigh':
        return t < 2.4 ? 'sleepy' : 'happy';
      case 'shimmy':
      case 'float':
        return 'happy';
      case 'peek':
        return t < 1.5 ? 'neutral' : t < 3.6 ? 'wink' : 'surprised';
      case 'forget':
      case 'remember':
        return t < 1.5 ? 'happy' : 'happy';
      case 'wiggle':
      case 'pleased':
      case 'wave':
      case 'spin':
      case 'loop':
      case 'preen':
      case 'bubbles':
      case 'chase':
        return 'happy';
      case 'follow':
        return 'happy';
    }
    return undefined;
  }

  protected idle(t: number) {
    const p = this.puppet;
    p.add('head', 2 * wobble(t * 0.3, 2));
    RIPPLE.forEach((b, i) => p.add(b, 0, 0, 5 * sin(t, 0.6, i * 0.15)));
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    const t = this.actT;
    const act = this.act;
    this.frame = env.frame;
    const swim = clamp(this.swim, 0, 1);
    this.cues = this.cues.filter(([at, fn]) => at > t || (fn(), false));

    // The mouse resting right on him: a wiggle of pleasure, once.
    const resting = env.pointer.present && env.time - env.pointer.at > 0.35;
    this.hoverT = this.hovered && resting ? this.hoverT + dt : 0;
    if (!this.hovered) this.hoverDone = false;
    const calm = ['idle', 'swim', 'bubbles', 'lookabout', 'doze', 'talk'];
    if (
      this.hoverT > 0.6 &&
      !this.hoverDone &&
      this.free &&
      !this.exiting &&
      this.target === null &&
      calm.includes(act)
    ) {
      this.hoverDone = true;
      this.setAct('pleased');
    }

    this.spec.gaze[1].yaw = 0.4 - 0.3 * swim;
    this.spec.gaze[0].yaw = 0.35 - 0.2 * swim;
    this.expression = this.mood(t) ?? (this.hovered ? 'happy' : 'neutral');

    // The near-side fin (the one we see) is the one he waves.
    const near = this.facing > 0 ? 'fin.R' : 'fin.L';
    for (const [fin, side] of FINS) {
      let hz = act === 'doze' ? 0.3 : 0.9 + 0.5 * swim;
      let beat = act === 'doze' ? 6 : 12;
      let spread = 8 + 14 * swim;
      let pitch = 0;
      if (this.mark === 'question' || act === 'dizzy') [hz, beat] = [3.2, 18];
      if (act === 'wiggle' || act === 'pleased' || this.hovered) [hz, beat] = [3, 24];
      if (act === 'determined') [hz, beat] = [9, 30];
      if (act === 'swirlspin') [hz, beat] = [6, 30];
      if (act === 'shimmy') [hz, beat] = [4, 24];
      if (act === 'hide') [hz, beat, spread] = [0.5, 2, 1];
      if (act === 'sigh') [hz, beat, spread] = [0.5, 4, 2 + 10 * bump(t - 1.9, 0.8)];
      if (act === 'preen') spread = 45 * envelope(t, this.actLength, 0.5);
      if (act === 'talk' || this.facingUs) {
        // Talks with his fins, a little.
        [hz, beat] = [1.3, 14];
        pitch = 6 * sin(t, 0.9, side * 0.1);
      }
      if (act === 'wave' && fin === near) {
        const up = envelope(t, this.actLength, 0.35);
        spread = 60 * up;
        [hz, beat] = [3, 28 * up];
        pitch = -30 * up;
      }
      const flap = beat * sin(t, hz, side * 0.25);
      p.add(fin, pitch, -side * (spread + flap), side * 4);
    }
    // Dorsal and anal fins ripple; up straight when he preens.
    RIPPLE.forEach((b, i) => {
      const r = act === 'preen' ? 4 : 8 + 10 * swim;
      p.add(
        b,
        act === 'preen' ? -14 * envelope(t, this.actLength, 0.5) : 0,
        0,
        r * sin(this.time, 0.7 + swim, i * 0.18),
      );
    });
    if (act === 'dart' && t < 0.6) for (const b of RIPPLE) p.add(b, 24);

    // A hiccup: a jolt of the whole body.
    if (act === 'hiccup') p.add('body', -8 * this.hic(t));
    // The thought bubbles come up one by one, and drop back.
    this.thought.forEach((s, i) => s.update(dt, this.thinking > i ? 1 : 0));
  }

  /** The wave, the tail, the bubbles and the lights: set straight on the bones each frame. */
  protected after(dt: number, env: Env) {
    const p = this.puppet;
    const act = this.act;
    const t = this.actT;
    const swim = clamp(this.swim, 0, 3);
    let hz = 0.5 + 0.9 * swim;
    let amp = 4 + 9 * Math.min(swim, 1.4);
    if (act === 'doze') [hz, amp] = [0.25, 2.5];
    if (act === 'wiggle' || act === 'pleased')
      [hz, amp] = [3.4, 12 * envelope(t, this.actLength, 0.3) + 3];
    if (act === 'backwards' && this.reverse) [hz, amp] = [1.6, 4];
    if (act === 'chase') [hz, amp] = [2.6, 10];
    if (act === 'talk' || this.facingUs) [hz, amp] = [0.6, 3];
    if (act === 'forget' && this.mark === 'question') [hz, amp] = [1.4, 3];
    if (act === 'yawn' || act === 'read') [hz, amp] = [0.4, 3];
    if (act === 'preen') [hz, amp] = [0.8, 4];
    if (act === 'spin') [hz, amp] = [2.4, 9];
    if (act === 'determined') [hz, amp] = [3, 10];
    if (act === 'shimmy') [hz, amp] = [4.5, 14 * envelope(t, this.actLength, 0.3) + 2];
    if (act === 'hide') [hz, amp] = [0.3, 1.5];
    if (act === 'sigh') [hz, amp] = [0.3, 2];
    if (act === 'swirlspin') [hz, amp] = [1, 3];
    if (act === 'turnback' && this.mark === 'question') [hz, amp] = [1.4, 3];
    this.phase += dt * 2 * Math.PI * hz;
    // A dart starts curled into a C, then snaps straight; the chase keeps him curled.
    let c = act === 'dart' ? clamp(t / 0.12, 0, 1) * clamp(1 - (t - 0.14) / 0.1, 0, 1) : 0;
    if (act === 'chase') c = 0.9 * envelope(t, this.actLength, 0.4);
    this.curl += (c - this.curl) * Math.min(1, dt * 12);
    const flick = act === 'dart' && t < 0.9 ? 1.6 : 1;
    const way = act === 'dart' ? this.dartWay * this.facing : 1;
    WAVE.forEach(([bone, share], i) => {
      const wave = Math.sin(this.phase - i * 0.9) * amp * share * flick;
      p.turn(bone, 0, wave + this.curl * 32 * share * way, 0);
    });
    // The tail's lobes sweep a beat behind and flare with the effort.
    const lag = Math.sin(this.phase - 3.3) * amp * 0.5 * flick;
    const flare = 8 + 3 * amp * 0.5 + (act === 'preen' ? 20 * envelope(t, this.actLength, 0.5) : 0);
    p.turn('tail.U', flare * 0.5, 0, -lag);
    p.turn('tail.D', flare * 0.5, 0, lag);

    // Turning right round: a pirouette, twice for dizzy, chasing his tail.
    let spin = 0;
    if (act === 'dizzy') {
      const u = clamp((t - 0.1) / 1.7, 0, 1);
      spin = 4 * Math.PI * ease(u);
    } else if (act === 'spin') {
      spin = 2 * Math.PI * ease((t - 0.3) / 1.6);
    } else if (act === 'chase') {
      spin = 4 * Math.PI * ease((t - 0.4) / 3.2);
    }
    this.pivot.rotation.y = spin * this.facing;
    // Bumping the glass: bigger with each thud.
    let grow = 1;
    if (act === 'bonk') for (const s of [1.4, 2.1, 2.7]) grow += 0.12 * bump(t - s, 0.12);
    if (act === 'nudge') grow += 0.06 * bump(t - 2.8, 0.15);
    if (act === 'read') grow += 0.04 * envelope(t, 5, 1);
    this.pivot.scale.setScalar(grow);

    // Preening: every fin puffs up tall.
    const puff = act === 'preen' ? 1 + 0.4 * bump(t - 2, 1.4) : 1;
    for (const b of [...RIPPLE, 'tail.U', 'tail.D']) p.stretch(b, puff, [0, 1, 0], 1);
    // The thought bubbles pop up (tucked away in the head at zero).
    this.thought.forEach((s, i) => {
      // Tucked away inside the head when down (their outline would show as a dot).
      const k = Math.max(0.001, s.y);
      p.stretch(`thought.${i}`, k, [0, 1, 0], k);
      p.shift(`thought.${i}`, 0, -0.14 * (1 - clamp(k, 0, 1)), 0);
    });
    this.lights(env.time);
    this.mouth(env.time);
    this.bubbleSizes(env.time);

    // The beacon says what he's thinking.
    const mood = this.face?.expression ?? 'neutral';
    const tone =
      this.mark === 'question'
        ? BEACON.surprised!
        : this.mark === 'bulb'
          ? BEACON.happy!
          : act === 'dizzy'
            ? RAINBOW[Math.floor(env.time * 6) % RAINBOW.length]
            : (BEACON[mood] ?? '#f4f4f1');
    let colour = tone;
    // It blinks when he forgets.
    if (this.mark === 'question' && Math.floor(env.time * 3.5) % 2) colour = '#f4f4f1';
    this.beaconColour.lerp(new Color(colour), Math.min(1, dt * 8));
    this.outfit.beacon(this.beaconColour);
    this.flash = Math.max(0, this.flash - dt * 1.4);
  }

  /** The screen's mark and his talking mouth. */
  private mouth(time: number) {
    const face = this.face;
    if (!face) return;
    face.mark = this.mark;
    let talk = 0;
    if (this.talking || this.act === 'talk') {
      const t = time * 8;
      const gate = 0.5 + 0.5 * Math.sin(time * 1.9);
      talk =
        gate > 0.25 ? Math.abs(Math.sin(t)) * (0.5 + 0.5 * Math.abs(Math.sin(t * 0.37 + 1))) : 0;
    } else if (this.act === 'yawn' || this.act === 'sigh')
      talk = envelope(this.actT, this.actLength, 0.6) * (this.actT < 2.6 ? 1 : 0);
    else if (this.act === 'bubbles') talk = bump(((this.actT - 0.6) % 0.9) - 0.15, 0.25);
    face.talk = clamp(talk, 0, 1);
  }

  /** The swirl: a glow that chases in along it, and flickers, flashes or breathes with his mood. */
  private lights(time: number) {
    const act = this.act;
    const t = this.actT;
    const swim = clamp(this.swim, 0, 3);
    for (let i = 0; i < DOTS; i++) {
      let level = 0.3 + 0.7 * Math.max(0, Math.cos(time * (2 + 5 * swim) - i * 0.55));
      let colour: string | undefined;
      if (act === 'doze') level = 0.2 + 0.3 * (0.5 + 0.5 * Math.sin(time * 1.1 - i * 0.2));
      else if (this.mark === 'question') level = Math.random() < 0.5 ? 1 : 0.1;
      else if (this.mark === 'bulb' || this.flash > 0)
        level = 0.4 + 0.6 * Math.max(this.flash, this.mark === 'bulb' ? 1 : 0);
      else if (act === 'dizzy') {
        level = 1;
        colour = RAINBOW[(i + Math.floor(time * 8)) % RAINBOW.length];
      } else if (act === 'dart' && t < 0.9) level = 1 - t / 0.9;
      else if (act === 'swirlspin') {
        level = 0.15 + 0.85 * Math.max(0, Math.cos(time * 14 - i * 0.9));
        colour = RAINBOW[(i + Math.floor(time * 10)) % RAINBOW.length];
      } else if (act === 'determined')
        level = 0.3 + 0.7 * Math.max(0, Math.cos(time * 16 - i * 0.55));
      else if (act === 'shimmy') level = 0.5 + 0.5 * Math.sin(time * 12 - i * 0.5);
      else if (act === 'hide') level = 0.1 + 0.1 * Math.sin(time * 1.5 - i * 0.2);
      else if (act === 'sigh') level = 0.25 + 0.4 * (0.5 + 0.5 * Math.sin(time * 1.4 - i * 0.3));
      else if (act === 'preen') level = 0.4 + 0.6 * Math.max(0, Math.sin(time * 6 - i * 0.9));
      else if (act === 'wiggle' || act === 'pleased' || this.hovered)
        level = 0.5 + 0.5 * Math.sin(time * 9 - i * 0.5);
      else if (this.talking || act === 'talk')
        level = 0.35 + 0.65 * (this.face?.talk ?? 0) * (0.6 + 0.4 * Math.sin(i));
      this.outfit.dot(i, level, colour);
    }
  }

  // ---------- Bubbles ----------

  private bubbleSizes(time: number) {
    const due = this.blowAt.filter((b) => b <= time);
    this.blowAt = this.blowAt.filter((b) => b > time);
    for (const _ of due) {
      const big = this.bigNext;
      this.bigNext = false;
      const b = this.bubbles.find((x) => x.at < 0) ?? this.bubbles[0];
      Object.assign(b, {
        at: time,
        life: big ? 3 : 1.6 + Math.random() * 0.8,
        size: big ? 1.9 : 0.7 + Math.random() * 0.5,
        drift: Math.random() * 10,
      });
      b.from.set(NaN, 0, 0);
    }
    this.bubbles.forEach((b, i) => {
      const age = time - b.at;
      let s = 0.001;
      if (b.at >= 0) {
        if (age < b.life)
          s = b.size * (0.35 + 0.65 * clamp(age / 0.3, 0, 1) + 0.15 * (age / b.life));
        else if (age < b.life + 0.08) s = b.size * 1.6;
        else b.at = -1;
      }
      this.puppet.stretch(`bubble.${i}`, s, [0, 1, 0], s);
    });
  }

  update(dt: number, env: Env) {
    super.update(dt, env);
    if (this.state === 'gone') return;
    this.placeBubbles(env);
  }

  /** Bubbles leave from where they came out, whatever he does, up the page. */
  private placeBubbles(env: Env) {
    this.bubbles.forEach((b, i) => {
      if (b.at < 0) this.puppet.bone(`bubble.${i}`).position.copy(this.mouthRest[i]);
    });
    const live = this.bubbles.filter((b) => b.at >= 0);
    if (!live.length) return;
    this.holder.updateMatrixWorld(true);
    const H = this.heightPx;
    const top = -project(env.frame, this.depth, { x: 0, y: env.frame.top + this.front * 0.04 }).y;
    live.forEach((b) => {
      const i = this.bubbles.indexOf(b);
      const bone = this.puppet.bone(`bubble.${i}`) as Bone;
      if (Number.isNaN(b.from.x)) {
        this.puppet.bone('mouth').getWorldPosition(b.from);
        b.life = clamp((top - b.from.y) / (0.5 * H), 0.25, b.life);
      }
      const age = env.time - b.at;
      v3.set(b.from.x + Math.sin(age * 5 + b.drift) * H * 0.05, b.from.y + 0.5 * age * H, b.from.z);
      bone.parent!.worldToLocal(v3);
      bone.position.copy(v3);
    });
  }

  /** His box on the page, for the mouse. */
  bounds(frame: Frame) {
    const foot = this.foot(frame);
    const H = this.heightPx;
    const c = { x: foot.x, y: foot.y - MIDDLE * H };
    const long = (this.widthPx() / 2) * Math.max(0.5, Math.abs(Math.sin(this.heading.y * DEG)));
    const high = H * 0.5;
    return { x: c.x - long, y: c.y - high, w: 2 * long, h: 2 * high };
  }
}
