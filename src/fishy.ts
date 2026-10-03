import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Act, clamp, type Env, type Spec } from './character';
import type { Expression } from './face';
import { sin } from './moves';
import { bump, cycle, ease, FixedSpring, type Point, ripple, type Spot, Swimmer } from './swimmer';

/**
 * Sea III's shared base (the anglerfish, dolphin, clownfish and mantis shrimp, for whoever builds
 * a swimmer after them): a Swimmer with the acts every one of them shares (an easy swim, looking
 * round, a nod, a flipper wave, a barrel roll, peeking from the back wall, dozing, a dance, hiccups,
 * a dart, a bow to a crewmate) and the way they show a poke, three pokes and a resting mouse. A
 * subclass gives its bones in a `FishyKit`, adds its own acts to `this.acts` after calling
 * `baseActs`, and overrides the hooks:
 *  - `special(dt, env)`: from `pose`, after the shared acts, for its own acts (`this.actT`,
 *    `this.actLength`, `this.expression`, `this.puppet`);
 *  - `lights(time)`: set the dots (`defaultLights` runs the shared pattern first);
 *  - `extra(dt, env)`: from `after`, for direct (unsprung) bone work.
 * `station`, `turnFor`, `leanFor` and `depthFor` extend the shared ones through `super`.
 * Nothing here needs a bone a model doesn't have: `fins`, `dorsal` and the tail are optional.
 */
export interface FishyKit {
  /** The tail's bones, base first, pumped as it swims; the axis they swing about (1 yaw for a
   * fish's fan, 0 pitch for a dolphin's flukes). */
  tail: string[];
  tailAxis?: 0 | 1 | 2;
  /** Swing at rest and at full swim, degrees, at the base. */
  tailDeg?: [number, number];
  fins?: [string, string];
  dorsal?: string;
  /** How many Dots there are. */
  dots: number;
}

export abstract class Fishy extends Swimmer {
  protected kit: FishyKit;
  protected nod = new FixedSpring(3, 0.5);
  protected bow = new FixedSpring(2, 0.6);
  protected wave = new FixedSpring(5, 0.3);
  protected pump = 0;
  protected roll = 0;
  protected spin = 0;
  protected flash = -1;
  protected tone: string | undefined;

  constructor(spec: Spec, model: Object3D, kit: FishyKit) {
    super(spec, model);
    this.kit = kit;
  }

  protected still = () => !!this.free && !this.route.length && !this.exiting;

  protected baseActs(): Record<string, Act> {
    const still = this.still;
    const acts: Record<string, Act> = {
      idle: { weight: 3, length: [3, 7] },
      swim: {
        weight: 2.6,
        length: [3, 6],
        when: still,
        start: () => this.swimTo(this.somewhere()),
      },
      look: { weight: 1, length: [4, 5], when: still },
      nod: { weight: 0.9, length: [3.4, 4], face: 'happy', when: still },
      roll: { weight: 1.1, length: [3.4, 3.8], face: 'happy', when: still },
      peek: { weight: 0.7, length: [8, 8.6], when: still },
      doze: { weight: 0.7, length: [9, 14], face: 'asleep', when: still },
      dance: { weight: 0.8, length: [5, 5.6], face: 'happy', when: still },
      hiccup: { weight: 0.7, length: [4, 4.4], when: still },
      dart: {
        weight: 0.7,
        length: [3, 3.4],
        face: 'surprised',
        when: still,
        start: () => this.kickTo(this.toward),
      },
      bow: { weight: 0.6, length: [3.6, 4], face: 'love', when: () => still() && !!this.mate() },
      poked: { weight: 0, length: [3.4, 3.8] },
      love: { weight: 0, length: [3, 4], face: 'love' },
      dizzy: { weight: 0, length: [4.6, 4.6] },
    };
    if (this.kit.fins) acts.wave = { weight: 0.8, length: [3.4, 3.8], face: 'happy', when: still };
    return acts;
  }

  protected depthFor(act: string) {
    if (act === 'peek') return 1;
    if (act === 'swim') return Math.random() * 0.45;
    if (['poked', 'wave', 'bow', 'nod', 'dance'].includes(act)) return 0.1;
    return undefined;
  }

  protected startle() {
    this.hold();
    this.kickTo(this.toward);
    this.flash = 0;
    this.tone = BEACON.surprised;
    this.puppet.kick(this.kit.tail[0], 40);
    this.setAct('poked');
  }

  protected station(env: Env, s: Spot): Point {
    const t = this.actT;
    const H = s.H;
    switch (this.act) {
      case 'doze':
        return { x: 0, y: H * 0.2 * ease(t / 3) };
      case 'dance':
        return {
          x: H * 0.25 * Math.sin(t * 2 * Math.PI * 0.8),
          y: -H * 0.08 * Math.abs(Math.sin(t * 2 * Math.PI * 1.6)),
        };
      case 'dizzy':
        return { x: Math.cos(env.time * 4) * H * 0.2, y: Math.sin(env.time * 4) * H * 0.12 };
      case 'roll':
        return { x: 0, y: -H * 0.1 * bump(t - 1.7, 1.7) };
    }
    return { x: 0, y: 0 };
  }

  protected fast(): number {
    return this.act === 'dart' || this.act === 'poked' ? 5 : 1.6;
  }

  protected turnFor(fade: number) {
    switch (this.act) {
      case 'wave':
      case 'bow':
        return this.toward * 30 * fade;
      case 'nod':
      case 'hiccup':
      case 'peek':
        return this.toward * 18 * fade;
      case 'look':
        return 55 * Math.sin(this.actT * 1.4) * fade;
      default: {
        // Standing about, it turns a little aside so its side shows (a head-on fish is a blob),
        // to the side it last swam: drifting to and fro on its spot doesn't flip it over.
        const v = super.turnFor(fade);
        if (!this.idleTurn) return v;
        if (Math.abs(v) >= this.idleTurn) {
          this.idleSide = Math.sign(v);
          return v;
        }
        return (this.idleSide || this.toward) * this.idleTurn;
      }
    }
  }

  /** Degrees it stands turned aside when not moving much (0: head-on, as it swims). */
  protected idleTurn = 0;
  /** The side it stands turned to (+1 right): the way it last swam, 0 before it has. */
  private idleSide = 0;

  protected leanGain() {
    return 0.1;
  }

  protected leanFor() {
    const t = this.actT;
    switch (this.act) {
      case 'dance':
        return 0.2 * Math.sin(t * 2 * Math.PI * 0.8);
      case 'bow':
        return this.toward * 0.2 * this.bow.y;
      case 'doze':
        return 0.15 * ease(t / 3);
      case 'love':
        return 0.15 * Math.sin(t * 2.4);
      default:
        return 0;
    }
  }

  protected idle(t: number) {
    const p = this.puppet;
    p.shift('root', 0, 0.012 * sin(t, 0.35), 0);
    p.add('body', 2 * sin(t, 0.21), 0, 2 * sin(t, 0.17));
  }

  // ---------- Hooks ----------

  /** Its own acts' poses, after the shared ones. */
  protected special(_dt: number, _env: Env): void {}
  /** Direct bone work, after the springs. */
  protected extra(_dt: number, _env: Env): void {}
  /** The dots. */
  protected lights(time: number) {
    this.defaultLights(time);
  }

  protected pose(dt: number, env: Env) {
    super.pose(dt, env);
    const p = this.puppet;
    const t = this.actT;
    const act = this.act;
    const left = this.actLength - t;
    const calm = !['poked', 'dizzy', 'love', 'dart', 'roll'].includes(act) && !this.busy();
    this.mind(dt, env, calm);
    const crossed = (at: number) => t >= at && t - dt < at;

    let face: Expression = this.hovered ? 'happy' : 'neutral';
    let nod = 0;
    let wave = 0;
    this.spinning = false;
    this.spin = 0;
    this.roll = 0;
    switch (act) {
      case 'poked':
        face = t < 0.5 ? 'surprised' : t < 2.4 ? 'cross' : 'sleepy';
        break;
      case 'roll': {
        const u = ease((t - 0.2) / 2.8);
        this.roll = 2 * Math.PI * u * this.toward;
        this.spinning = true;
        break;
      }
      case 'wave':
        wave = t > 0.4 && left > 0.6 ? 1 : 0;
        break;
      case 'nod':
        nod = 14 * Math.sin(t * 2 * Math.PI * 1.2) * ease(Math.min(t, left));
        break;
      case 'peek':
        face = t < 3.2 ? 'neutral' : t < 5.2 ? 'focused' : 'surprised';
        p.add('body', 5 * Math.sin(t * 1.8), 8 * Math.sin(t * 1.3), 0);
        break;
      case 'doze':
        nod = 14 * ease(t / 2);
        break;
      case 'dance':
        wave = 0.7;
        break;
      case 'hiccup':
        for (const at of [0.7, 1.6, 2.5]) {
          if (crossed(at)) {
            p.kick('body', -14);
            this.flash = 0;
            this.tone = BEACON.surprised;
          }
        }
        face = [0.7, 1.6, 2.5].some((x) => t > x && t < x + 0.25) ? 'surprised' : 'neutral';
        break;
      case 'bow':
        this.bow.update(dt, t > 0.5 && left > 1 ? 1 : 0);
        nod = 20 * this.bow.y;
        break;
      case 'love':
        face = 'love';
        break;
      case 'dizzy':
        face = 'dizzy';
        break;
    }
    if (act !== 'bow') this.bow.update(dt, 0);
    this.expression = face;
    const nd = this.nod.update(dt, nod);
    this.wave.update(dt, wave);
    p.add('body', nd * 0.6, 0, 0);
    if (this.free) p.add('body', clamp(this.vel.y / (this.heightPx * 2), -1, 1) * 8);
    if (act === 'dizzy' && t > 1.5)
      p.add('body', 6 * Math.cos(env.time * 5), 0, 6 * Math.sin(env.time * 5));
    this.special(dt, env);
  }

  /** True while one of its own acts mustn't be interrupted by a mouse rushing past. */
  protected busy() {
    return false;
  }

  /** The shared light pattern: a slow shimmer, a run when it swims, rainbow for a trick. */
  protected defaultLights(time: number) {
    const act = this.act;
    const t = this.actT;
    const moving = this.swimming() > 0.25;
    for (let i = 0; i < this.kit.dots; i++) {
      let level = 0.55 + 0.25 * Math.sin(time * 0.9 - i * 0.7);
      let tone: string | undefined;
      if (act === 'poked' && t < 0.8) {
        level = Math.sin(time * 34) > 0 ? 1 : 0.35;
        tone = BEACON.surprised;
      } else if (act === 'dizzy') {
        level = Math.sin(time * 7 + i * 2.3) > 0.2 ? 1 : 0.15;
        tone = RAINBOW[(i + Math.floor(time * 3)) % RAINBOW.length];
      } else if (act === 'love' || act === 'bow') {
        level = 0.65 + 0.35 * Math.sin(time * 2.4 - i * 0.6);
        tone = BEACON.love;
      } else if (act === 'dance' || act === 'roll') {
        level = Math.sin(t * 2 * Math.PI * 1.6 + i) > 0 ? 1 : 0.25;
        tone = RAINBOW[(i + Math.floor(time * 4)) % RAINBOW.length];
      } else if (act === 'hiccup') {
        level = 0.5 + 0.5 * Math.sin(time * 20 + i * 1.7);
        tone = BEACON.surprised;
      } else if (act === 'doze') {
        level = 0.2 + 0.15 * Math.sin(time * 0.8);
      } else if (moving) {
        level = 0.45 + 0.55 * bump(cycle(time * 1.5) * 1.4 - i * 0.16, 0.25);
      } else if (this.hovered) tone = BEACON.happy;
      this.outfit.dot(i, level, tone);
    }
  }

  /** The beacon's colour: its mood, or a flash, or rainbow. */
  protected beaconTone(time: number): string {
    const rainbow = ['dance', 'roll'].includes(this.act);
    return this.flash >= 0 && this.tone
      ? this.tone
      : rainbow
        ? RAINBOW[Math.floor(time * 6) % RAINBOW.length]
        : (BEACON[this.expression] ?? BEACON.neutral!);
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    const time = env.time;
    const act = this.act;
    this.lights(time);
    if (this.flash >= 0) {
      this.flash += dt;
      if (this.flash > 1.4) this.flash = -1;
    }
    this.outfit.beacon(this.beaconTone(time));

    // The tail pumps as it swims, each bone a beat behind.
    const sw = Math.max(this.swimming(), act === 'dance' ? 0.6 : 0);
    this.pump += dt * 2 * Math.PI * (0.6 + 1.6 * sw);
    const [rest, hard] = this.kit.tailDeg ?? [4, 18];
    const axis = this.kit.tailAxis ?? 1;
    ripple(p, this.kit.tail, this.pump, rest + (hard - rest) * sw, 0.8, axis, 0.35);

    if (this.kit.fins) {
      // Fins paddle; a wave lifts one.
      const w = this.wave.y;
      for (const [fin, s] of [
        [this.kit.fins[0], 1],
        [this.kit.fins[1], -1],
      ] as const) {
        const a = Math.sin(this.pump * 0.7 + (s > 0 ? 0 : 1.1));
        p.turn(fin, 0, 0, s * (8 + 18 * this.swimming()) * a);
        if (s > 0 && act === 'wave') p.turn(fin, 0, 0, 60 * w + 30 * w * Math.sin(time * 14));
        if (act === 'dance') p.turn(fin, 0, 0, s * 30 * w);
      }
    }
    if (this.kit.dorsal) ripple(p, [this.kit.dorsal], this.pump, 6, 0, 1);
    this.extra(dt, env);

    // Rolling about the long axis; spinning about the vertical when dizzy.
    if (act === 'dizzy') {
      const u = clamp((this.actT - 0.2) / 2.4, 0, 1);
      this.pivot.rotation.y = 4 * Math.PI * u * u * (3 - 2 * u);
      this.pivot.rotation.z = 0;
    } else {
      this.pivot.rotation.y = this.spin;
      this.pivot.rotation.z = this.roll;
    }
  }
}
