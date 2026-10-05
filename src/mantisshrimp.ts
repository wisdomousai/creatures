import type { Object3D } from 'three';
import { BEACON } from './bolt';
import { type Env } from './character';
import type { Expression, FaceLayout } from './face';
import { sin } from './moves';
import { Fishy } from './fishy';
import { bump, ease, FixedSpring, type Point, ripple, type Spot } from './swimmer';

/**
 * Jab, the robot mantis shrimp: a segmented toy of a shrimp whose colour is all in its lights. A
 * rounded carapace and five overlapping plates, each with a lit stripe round its rear edge
 * (a rainbow, drifting slowly), flat swimmerets under them and a tail fan. Its two eyes are two
 * small round screens on stalks that swivel on their own; under its head, two folded raptorial
 * arms, a big rounded club on each, tipped with a light.
 *
 * Tricks: a lightning punch (the arm snaps out and a burst of light flashes in front of it), eyes
 * that roll independently, a rainbow ripple down its plates, a boxing shuffle (guard up, bobbing
 * and weaving, little jabs), flexing, and the shared sea tricks. Poke it and it throws a
 * reflex punch, then covers up; three pokes and its eyes spin dizzy; rest the mouse on it and it
 * unfolds its arms and sways.
 */
export const MANTISSHRIMP_FACE: FaceLayout = {
  width: 256,
  height: 256,
  // One eye to a screen: both of the face's eyes on the same spot.
  eyes: [
    [0.5, 0.5],
    [0.5, 0.5],
  ],
  rx: 0.24,
  ry: 0.24,
  line: 0.07,
  mouth: null,
};

const SPECTRUM = ['#ff5f5f', '#ffb347', '#ffe066', '#6fdc8c', '#5ec8ff', '#b48cff', '#ff5fa2'];
const SEGS = ['seg.1', 'seg.2', 'seg.3', 'seg.4', 'seg.5'];
const SIDES = [
  ['L', 1],
  ['R', -1],
] as const;
/** The arm's upper bone and forearm, degrees (pitch): folded, wound up, struck, guard, flexed. */
const POSE = {
  fold: [0, 0],
  wind: [14, -40],
  strike: [-25, 168],
  guard: [-30, 104],
  flex: [-44, 70],
} as const;
type Pose = keyof typeof POSE;

export class Mantisshrimp extends Fishy {
  static readonly terms =
    'shrimp prawn crustacean colourful colorful rainbow teal mint green pink eyes stalks punch boxer boxing fist club lightning stripes segmented swim';

  private upper = { L: new FixedSpring(9, 0.5), R: new FixedSpring(9, 0.5) };
  private fore = { L: new FixedSpring(16, 0.42), R: new FixedSpring(16, 0.42) };
  /** Ages of the flashes of light so far (s). */
  private hits: number[] = [];
  private eyeL = { x: new FixedSpring(7, 0.5), y: new FixedSpring(7, 0.5) };
  private eyeR = { x: new FixedSpring(7, 0.5), y: new FixedSpring(7, 0.5) };
  private wavy = new FixedSpring(3, 0.7);
  private clubs = [0, 0];

  constructor(model: Object3D) {
    const feels: Record<string, { f: number; zeta: number; r?: number }> = {
      default: { f: 3, zeta: 0.5 },
      root: { f: 1.4, zeta: 0.6 },
      body: { f: 2, zeta: 0.45, r: 0.5 },
      tail: { f: 3.4, zeta: 0.35 },
    };
    for (const [n] of SIDES) {
      feels[`eye.${n}`] = { f: 5, zeta: 0.4 };
      feels[`arm.${n}.1`] = { f: 8, zeta: 0.5 };
      feels[`arm.${n}.2`] = { f: 12, zeta: 0.45 };
    }
    SEGS.forEach((b) => (feels[b] = { f: 3.2, zeta: 0.4 }));
    super(
      {
        name: 'Jab',
        model: 'mantisshrimp',
        metres: 0.27,
        width: 0.62,
        size: 1.05,
        feels: feels as never,
        face: MANTISSHRIMP_FACE,
        eyes: 0.8,
        gaze: [{ bone: 'body', yaw: 0.5, pitch: 0.35 }],
        reach: { yaw: 50, pitch: 25 },
        lag: 1.2,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 1.4,
        turn: 76,
      },
      model,
      { tail: [...SEGS, 'tail'], tailAxis: 0, tailDeg: [3, 9], dots: 7 },
    );
    this.idleTurn = 40;
    this.inset = 0.72;
    const still = this.still;
    const acts = this.baseActs();
    this.acts = {
      ...acts,
      punch: { weight: 1.8, length: [5.6, 6], face: 'determined', when: still },
      eyes: { weight: 1.3, length: [5.2, 5.8], face: 'surprised', when: still },
      ripple: { weight: 1.2, length: [4.6, 5.2], face: 'happy', when: still },
      shuffle: { weight: 1.4, length: [5.6, 6.2], face: 'determined', when: still },
      flex: { weight: 0.9, length: [4, 4.6], face: 'determined', when: still },
    };
    delete this.acts.wave;
  }

  protected busy() {
    return ['punch', 'poked', 'shuffle'].includes(this.act);
  }

  protected depthFor(act: string) {
    if (['punch', 'shuffle', 'flex', 'ripple', 'eyes'].includes(act)) return 0.1;
    return super.depthFor(act);
  }

  protected startle() {
    super.startle();
  }

  protected station(env: Env, s: Spot): Point {
    const base = super.station(env, s);
    const t = this.actT;
    const left = this.actLength - t;
    const H = s.H;
    let x = 0;
    let y = 0;
    switch (this.act) {
      case 'shuffle': {
        // Bobbing and weaving: forward and back, down and up.
        const k = ease(Math.min(t / 0.8, left / 0.8));
        x = this.toward * H * 0.32 * Math.sin(t * 2.6) * k;
        y = -H * 0.09 * Math.abs(Math.sin(t * 5.2)) * k;
        break;
      }
      case 'punch':
        x =
          this.toward * H * 0.1 * (bump(t - 1.35, 0.3) + bump(t - 2.75, 0.3) + bump(t - 3.85, 0.3));
        break;
      case 'flex':
        y = -H * 0.05 * bump(t - 2, 1.4);
        break;
      case 'poked':
        x = this.toward * H * 0.08 * bump(t - 0.2, 0.3);
        break;
    }
    return { x: base.x + x, y: base.y + y };
  }

  protected turnFor(fade: number) {
    switch (this.act) {
      case 'punch':
      case 'shuffle':
      case 'poked':
        return this.toward * 72 * fade;
      case 'flex':
      case 'eyes':
      case 'ripple':
        return this.toward * 30 * fade;
      default:
        return super.turnFor(fade);
    }
  }

  protected leanFor() {
    const t = this.actT;
    switch (this.act) {
      case 'shuffle':
        return 0.1 * Math.sin(t * 5.2);
      case 'punch':
        return (
          -this.toward * 0.12 * (bump(t - 1.3, 0.25) + bump(t - 2.7, 0.25) + bump(t - 3.8, 0.25))
        );
      default:
        return super.leanFor();
    }
  }

  protected idle(t: number) {
    super.idle(t);
    const p = this.puppet;
    for (const [n, s] of SIDES) {
      p.add(`eye.${n}`, 6 * sin(t, 0.37, s), 8 * sin(t, 0.29, s * 2), 0);
      p.add(`arm.${n}.2`, 3 * sin(t, 0.4, s), 0, 0);
    }
  }

  /** Both arms to a pose, in turn (`lag` s apart in effect through the springs). */
  private arms(l: Pose, r: Pose) {
    const set = (n: 'L' | 'R', q: Pose) => {
      this.upper[n].update(this.dt, POSE[q][0]);
      this.fore[n].update(this.dt, POSE[q][1]);
    };
    set('L', l);
    set('R', r);
  }
  private dt = 0.016;

  protected special(dt: number, env: Env) {
    this.dt = dt;
    const p = this.puppet;
    const t = this.actT;
    const left = this.actLength - t;
    const act = this.act;
    const time = env.time;
    const crossed = (at: number) => t >= at && t - dt < at;
    let face: Expression | null = null;
    let L: Pose = 'fold';
    let R: Pose = 'fold';
    let wavy = 0;
    // Eye targets (yaw, pitch), each its own.
    let el: [number, number] = [0, 0];
    let er: [number, number] = [0, 0];
    this.clubs = [0, 0];
    const hit = () => {
      this.hits.push(0);
      this.flash = 0;
      this.tone = BEACON.happy;
      p.kick('body', -26);
    };
    switch (act) {
      case 'punch': {
        // Three punches: left, right, then both. Wind up, then snap.
        const hits: [number, 'L' | 'R' | 'B'][] = [
          [1.2, 'L'],
          [2.6, 'R'],
          [3.7, 'B'],
        ];
        for (const [at, who] of hits) {
          const u = t - at;
          if (u > -0.7 && u < 0) {
            if (who !== 'R') L = 'wind';
            if (who !== 'L') R = 'wind';
          } else if (u >= 0 && u < 0.5) {
            if (who !== 'R') L = 'strike';
            if (who !== 'L') R = 'strike';
            if (who !== 'R') this.clubs[0] = 1;
            if (who !== 'L') this.clubs[1] = 1;
          }
          if (crossed(at)) hit();
        }
        if (t < 0.7) L = R = 'guard';
        if (t > 4.4) L = R = left > 0.6 ? 'guard' : 'fold';
        face = t > 1.2 && t < 4.2 ? 'determined' : 'focused';
        el = er = [10 * Math.sin(t), 0];
        break;
      }
      case 'eyes': {
        el = [38 * Math.sin(t * 1.9), 34 * Math.sin(t * 2.7 + 1)];
        er = [38 * Math.sin(t * 2.3 + 2), 34 * Math.cos(t * 1.6)];
        face = Math.sin(t * 1.3) > 0.5 ? 'surprised' : 'happy';
        break;
      }
      case 'ripple':
        wavy = ease(Math.min(t / 0.6, left / 0.6));
        el = [20 * Math.sin(t * 3), 12];
        er = [-20 * Math.sin(t * 3), 12];
        break;
      case 'shuffle': {
        L = R = 'guard';
        // A little jab with each hand in turn.
        const ph = (t * 2.6) % (2 * Math.PI);
        if (Math.sin(t * 5.2 * 0.5) > 0.9) L = 'strike';
        else if (Math.sin(t * 5.2 * 0.5 + Math.PI) > 0.9) R = 'strike';
        if (ph < 0.01) p.kick('body', 4);
        if (crossed(2.1) || crossed(3.6) || crossed(4.8)) this.hits.push(0);
        face = 'determined';
        el = [14 * Math.sin(t * 2.6), -8];
        er = [14 * Math.sin(t * 2.6), -8];
        break;
      }
      case 'flex': {
        const k = ease(Math.min(t / 0.5, left / 0.5));
        const pump = Math.sin(t * 5) > 0;
        if (k > 0.5) L = R = pump ? 'flex' : 'guard';
        face = pump ? 'determined' : 'happy';
        break;
      }
      case 'poked': {
        // A reflex jab at the air, then covering up.
        if (t < 0.15) L = R = 'wind';
        else if (t < 0.5) L = R = 'strike';
        else if (t < 2.6) L = R = 'guard';
        if (crossed(0.15)) hit();
        this.clubs = t >= 0.15 && t < 0.5 ? [1, 1] : [0, 0];
        face = t < 0.5 ? 'surprised' : t < 2.4 ? 'cross' : 'sleepy';
        el = er = [0, 0];
        break;
      }
      case 'love':
        L = R = 'flex';
        face = 'love';
        el = [10 * Math.sin(t * 2), 8];
        er = [10 * Math.sin(t * 2 + 0.6), 8];
        break;
      case 'dizzy':
        el = [40 * Math.cos(time * 7), 32 * Math.sin(time * 7)];
        er = [40 * Math.cos(time * 7 + 2.4), 32 * Math.sin(time * 7 + 2.4)];
        break;
      case 'hiccup':
        if (this.hits.length < 1 && [0.7, 1.6, 2.5].some((at) => crossed(at))) this.hits.push(0);
        break;
      case 'dance':
        L = R = Math.sin(t * 2 * Math.PI * 1.6) > 0 ? 'guard' : 'fold';
        wavy = 0.6;
        break;
      case 'bow':
        L = R = 'guard';
        break;
      case 'doze':
        el = er = [0, 25 * ease(t / 2)];
        break;
    }
    if (face) this.expression = face;
    this.arms(L, R);
    this.wavy.update(dt, wavy);
    for (const [n] of SIDES) {
      p.add(`arm.${n}.1`, this.upper[n].y, 0, 0);
      p.add(`arm.${n}.2`, this.fore[n].y, 0, 0);
    }
    const sp = (s: { x: FixedSpring; y: FixedSpring }, v: [number, number]) => [
      s.x.update(dt, v[0]),
      s.y.update(dt, v[1]),
    ];
    const [lx, ly] = sp(this.eyeL, el);
    const [rx, ry] = sp(this.eyeR, er);
    p.add('eye.L', ly, lx, 0);
    p.add('eye.R', ry, rx, 0);
  }

  protected extra(dt: number, env: Env) {
    const p = this.puppet;
    // A rainbow ripple down the plates.
    const w = this.wavy.y;
    if (w > 0.01) ripple(p, SEGS, env.time * 6, 12 * w, 0.8, 0, 0);
    // The flashes of light: swell, thin and go.
    this.hits = this.hits.map((a) => a + dt).filter((a) => a < 0.5);
    const a = this.hits.length ? Math.min(...this.hits) : -1;
    const k = a < 0 ? 0 : a < 0.08 ? a / 0.08 : Math.max(0, 1 - (a - 0.08) / 0.42);
    const s =
      a < 0 ? 0.001 : Math.max(0.001, 0.4 + 1.1 * (1 - k) + 0.3 * k) * (k > 0.02 ? 1 : 0.001);
    p.stretch('burst', s, [0, 1, 0], s);
  }

  protected lights(time: number) {
    const act = this.act;
    const t = this.actT;
    const drift = Math.floor(time * 0.7);
    for (let i = 0; i < 6; i++) {
      // The plates are its colour: a rainbow along them, drifting slowly.
      let level = 0.85 + 0.15 * Math.sin(time * 1.1 - i * 0.7);
      let tone: string | undefined = SPECTRUM[(i + drift) % SPECTRUM.length];
      if (act === 'ripple') {
        level = 0.25 + 0.75 * bump(((time * 1.8 - i * 0.18) % 1) - 0.5, 0.3);
        tone = SPECTRUM[(i + Math.floor(time * 4)) % SPECTRUM.length];
      } else if (act === 'poked' && t < 0.8) {
        level = Math.sin(time * 34) > 0 ? 1 : 0.3;
        tone = BEACON.surprised;
      } else if (act === 'dizzy') {
        level = Math.sin(time * 7 + i * 2.3) > 0.2 ? 1 : 0.15;
        tone = SPECTRUM[(i + Math.floor(time * 5)) % SPECTRUM.length];
      } else if (act === 'love') {
        level = 0.65 + 0.35 * Math.sin(time * 2.4 - i * 0.6);
        tone = BEACON.love;
      } else if (act === 'doze') {
        level = 0.2 + 0.15 * Math.sin(time * 0.8);
      } else if (act === 'punch' || act === 'shuffle' || act === 'flex') {
        level = this.hits.length && act !== 'flex' ? 1 : 0.55 + 0.4 * Math.sin(time * 12 - i);
      } else if (act === 'dance' || act === 'roll' || act === 'hiccup') {
        level = Math.sin(t * 2 * Math.PI * 1.6 + i) > 0 ? 1 : 0.25;
        tone = SPECTRUM[(i + Math.floor(time * 5)) % SPECTRUM.length];
      } else if (this.swimming() > 0.25) {
        level = 0.5 + 0.5 * bump(((time * 1.6 - i * 0.16) % 1) - 0.4, 0.3);
      }
      this.outfit.dot(i, level, tone);
    }
    // Dot6: the club tips; they blaze when a fist flies.
    const struck = Math.max(this.clubs[0], this.clubs[1]);
    this.outfit.dot(
      6,
      0.45 + 0.55 * struck,
      struck ? BEACON.happy : this.hovered ? BEACON.happy : undefined,
    );
  }

  protected beaconTone(time: number): string {
    void time;
    return this.flash >= 0 && this.tone ? this.tone : BEACON.happy!;
  }
}
