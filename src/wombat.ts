import type { Object3D } from 'three';
import { BEACON } from './bolt';
import type { Act, Env } from './character';
import { clamp } from './character';
import type { FaceLayout } from './face';
import { sin } from './moves';
import { ease, Fluffy, pulse, span } from './fluffy';
import { Spring } from './spring';

/**
 * Clod, the robot wombat: a square chunky block of a toy, a broad flat head set low, small
 * wide-apart eyes, a big dark nose and short strong legs with three claws on each front paw.
 * His signature is the rump: a square dark plate on the back end with two lit lamps.
 *
 * He digs a burrow: a bank of earth comes up in front of him, he shuffles side-on and in
 * (his head and shoulders vanish into it) and kicks out lit pellets of dirt that fly in arcs
 * behind him, then backs out and shakes himself off. He bolts: a sudden, surprisingly fast
 * scamper along the floor. And when he is poked he turns his square rump on you and stays
 * there, lamps flashing, until he has made his point. The rest is the fluffy base's.
 */
export const WOMBAT_FACE: FaceLayout = {
  width: 512,
  height: 208,
  eyes: [
    [0.22, 0.5],
    [0.78, 0.5],
  ],
  rx: 0.05,
  ry: 0.26,
  line: 0.03,
  mouth: null,
};

const PELLETS = 6;
const ANNOYED = '#ff6a4a';

export class Wombat extends Fluffy {
  static readonly terms =
    'marsupial australian australia digger burrow dig dirt grey gray square blocky chunky stout stubby short legs claws rump bolt scamper dark nose';

  private bank = new Spring(4, 0.55, 1.2);
  private bankGoal = 0;
  private digging = new Spring(5, 0.8);
  private digGoal = 0;
  private dirtPhase = 0;
  private flash = 0;
  private scamper = false;
  private blockSide = 1;

  constructor(model: Object3D) {
    super(
      {
        name: 'Clod',
        model: 'wombat',
        metres: 0.3,
        width: 0.5,
        size: 0.62,
        face: WOMBAT_FACE,
        eyes: 0.69,
        tail: ['tail.1'],
        tailAxis: [0, 0.2, -1],
        sit: -20,
        drop: { sit: -0.045, lie: -0.07 },
        speed: 0.9,
        lag: 1.1,
        moods: {
          calm: { wag: [2, 0.2], carriage: -4, ears: 0, out: 3 },
          happy: { wag: [8, 1.2] },
        },
        actMoods: { burrow: 'happy', scamper: 'happy', block: 'annoyed', paw: 'curious' },
      },
      model,
    );
    this.dotCount = 0;
    this.acts = { ...this.acts, ...this.mine() };
    // Wombats are not springy: fewer hops.
    for (const [name, k] of [
      ['hophop', 0.5],
      ['rearUp', 0.5],
    ] as const)
      if (this.acts[name]) this.acts[name].weight *= k;
  }

  /** Which way is the middle of the floor (+1 / -1), where he turns to face. */
  private toMiddle() {
    const f = this.env?.frame;
    if (!f) return 1;
    return Math.sign((f.left + f.right) / 2 - this.s) || 1;
  }

  private mine(): Record<string, Act> {
    const p = this.puppet;
    return {
      burrow: {
        // A bank of earth rises beside him; he turns side-on, shuffles in head first, digs
        // with his front claws while lit dirt flies out behind, backs out and shakes off.
        weight: 2.4,
        length: [13, 13],
        when: this.standing,
        start: () => (this.posture = 'stand'),
        pose: (t) => {
          const side = this.toMiddle();
          const turn = span(t, 0.3, 1.5, 11, 12.2);
          this.want.yaw = side * 55 * turn;
          this.bankGoal = span(t, 1.2, 2.2, 10.4, 11.6);
          // In and out: how far along his own heading he has gone.
          const inK = ease(t, 2.4, 3.6) * (1 - ease(t, 9.4, 10.6));
          p.shift('body', 0, -0.012 * inK, 0.13 * inK);
          const moving = (t > 2.4 && t < 3.6) || (t > 9.4 && t < 10.6);
          const stride = Math.sin(t * 2 * Math.PI * 2.2) * 26 * (moving ? 1 : 0);
          p.add('leg.FL', stride);
          p.add('leg.BR', stride);
          p.add('leg.FR', -stride);
          p.add('leg.BL', -stride);
          // Digging: the front claws rake in turn, head pushing down, rump rocking.
          const dig = span(t, 3.3, 3.9, 8.8, 9.4);
          this.digGoal = dig;
          p.add('leg.FL', -48 * dig * Math.max(0, sin(t, 2.6)));
          p.add('leg.FR', -48 * dig * Math.max(0, sin(t, 2.6, 0.5)));
          p.add('head', (16 + 4 * sin(t, 2.6)) * dig);
          p.add('body', (5 + 3 * sin(t, 2.6, 0.25)) * dig);
          p.add('leg.BL', -8 * dig, 0, 0);
          p.add('leg.BR', -8 * dig, 0, 0);
          p.add('ear.L', -10 * dig);
          p.add('ear.R', -10 * dig);
          // Shaking the dirt off.
          const shake = Math.sin(t * 2 * Math.PI * 6) * pulse(t, 10.7, 1.1);
          p.add('root', 0, 0, 6 * shake);
          p.add('head', 0, 0, -12 * shake);
          p.add('ear.L', 0, 0, 24 * shake);
          p.add('ear.R', 0, 0, 24 * shake);
        },
      },
      scamper: {
        // Out of nowhere: a quick low scamper across the floor and a skid to a stop.
        weight: 1.6,
        length: [3.4, 3.4],
        when: this.standing,
        start: () => {
          this.posture = 'stand';
          this.scamper = true;
          const f = this.env?.frame;
          if (f) {
            const [lo, hi] = this.span(f);
            const dir = this.s - lo > hi - this.s ? -1 : 1;
            this.walkTo(this.s + dir * this.heightPx * 4.2);
          }
        },
        pose: (t) => {
          const run = span(t, 0.2, 0.5, 2.3, 2.8);
          p.add('body', (4 + 3 * Math.sin(this.gait * 2)) * run);
          p.add('head', -6 * run);
          p.add('ear.L', -22 * run);
          p.add('ear.R', -22 * run);
          p.add('tail.1', 14 * run);
          // A wind-up before, a skid after.
          const wind = pulse(t, 0, 0.3);
          p.add('body', 8 * wind);
          p.add('leg.FL', 10 * wind);
          p.add('leg.FR', 10 * wind);
          const skid = pulse(t, 2.5, 0.8);
          p.add('body', -9 * skid);
          p.add('leg.FL', -25 * skid);
          p.add('leg.FR', -25 * skid);
          if (t > 2.9) this.scamper = false;
        },
      },
      block: {
        // Turns his square rump on you and stays put, lamps flashing, then a hmph and back.
        weight: 0,
        length: [5, 5],
        start: () => {
          this.posture = 'stand';
          this.blockSide = this.toMiddle();
        },
        pose: (t) => {
          const k = span(t, 0.2, 1.2, 3.9, 4.8);
          this.want.yaw = this.blockSide * 135 * k;
          const hold = span(t, 1.3, 1.6, 3.6, 3.9);
          this.flash = hold * (Math.sin(t * 2 * Math.PI * 2.5) > 0 ? 1 : 0.2);
          p.add('body', -3 * hold);
          p.add('head', 6 * hold, 0, 0);
          p.add('ear.L', -14 * hold);
          p.add('ear.R', -14 * hold);
          // The hmph: a stiff little bounce.
          const hmph = pulse(t, 2.4, 0.4);
          p.add('body', 5 * hmph);
          if (t > 2.4 && t < 2.45) this.hop.kick(0.7);
        },
      },
      paw: {
        // Rakes the floor with one front claw, two or three times, then sniffs the spot.
        weight: 1.2,
        length: [4.2, 4.2],
        when: this.standing,
        pose: (t) => {
          const k = span(t, 0.3, 0.8, 3.0, 3.8);
          const rake = Math.max(0, sin(t, 1.1));
          const left = Math.floor(this.actT / 2.1 + 0.5) % 2 === 0;
          p.add(left ? 'leg.FL' : 'leg.FR', (-55 * rake - 8) * k);
          p.add('head', (14 - 6 * rake) * k);
          p.add('body', 3 * k);
          p.add('ear.L', 6 * k);
          p.add('ear.R', 6 * k);
        },
      },
    };
  }

  poke() {
    if (this.state !== 'here') return;
    const n = this.poked();
    if (n >= 3) this.setAct('dizzy');
    else if (n === 1 && this.posture !== 'lie') this.setAct('block');
    else this.setAct('startle');
  }

  protected pose(dt: number, env: Env) {
    this.spec.speed = this.baseSpeed * (this.scamper ? 3.3 : 1);
    super.pose(dt, env);
    if (this.walking) this.puppet.add('root', 0, 0, 2.5 * Math.sin(this.gait));
  }

  protected sitting() {
    super.sitting();
    this.puppet.add('leg.FL', -8);
    this.puppet.add('leg.FR', -8);
  }

  protected lying(breath: number) {
    super.lying(breath);
    this.puppet.add('head', 8);
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    const bank = Math.max(0.001, this.bank.update(dt, this.bankGoal));
    p.stretch('burrow', bank, [0, 1, 0], bank);
    this.bankGoal = 0;
    // The dirt: lit pellets thrown out behind in arcs, one after another.
    const dig = clamp(this.digging.update(dt, this.digGoal), 0, 1);
    this.digGoal = 0;
    this.dirtPhase += dt * 1.7;
    for (let i = 0; i < PELLETS; i++) {
      const ph = (this.dirtPhase + i / PELLETS) % 1;
      const spread = Math.sin(i * 2.4);
      const s = Math.max(0.001, dig * Math.sin(Math.PI * ph) ** 0.35);
      const bone = `dirt.${i + 1}`;
      p.stretch(bone, s, [0, 1, 0], s);
      p.shift(
        bone,
        spread * 0.05 * ph,
        (0.2 + 0.08 * ((i * 7) % 3)) * Math.sin(Math.PI * ph) - 0.03,
        -0.04 - 0.46 * ph,
      );
    }
    super.after(dt, env);
    this.flash = 0;
  }

  protected lights(time: number) {
    const o = this.outfit;
    const m = this.mood;
    let lamp = 0.4 + 0.15 * Math.sin(time * 0.9);
    let tone: string | undefined;
    if (m === 'asleep') lamp = 0.06 + 0.1 * (0.5 + 0.5 * Math.sin(time * 1.1));
    else if (m === 'sleepy') lamp = 0.22;
    else if (m === 'love') [lamp, tone] = [0.75 + 0.25 * Math.sin(time * 5), BEACON.love];
    else if (m === 'happy') [lamp, tone] = [0.8, BEACON.happy];
    else if (m === 'alarmed') [lamp, tone] = [Math.sin(time * 30) > 0 ? 1 : 0.4, BEACON.surprised];
    else if (m === 'annoyed') [lamp, tone] = [0.5, ANNOYED];
    else if (m === 'curious') lamp = 0.85;
    if (this.flash) [lamp, tone] = [this.flash, ANNOYED];
    o.dot(0, clamp(lamp, 0, 1), tone);
    o.dot(1, 0.85, undefined);
  }
}
