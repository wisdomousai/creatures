import { type Act, clamp, type Env } from './character';
import { sin } from './moves';
import { smooth, Toybot } from './toybot';

/**
 * The shared bits of the job-and-hobby toy robots (Dibble the gardener, Orbit the
 * astronaut, Dab the painter, Caper the juggler, Clink the knight): Bolt's friends, who walk
 * on two legs with hose arms named as Bolt's are (`upper_arm`, `forearm`, `hand`, `body`,
 * `head`). This gives them the tricks they all share (a stroll, a wave, a cheer, a shrug, a
 * look about, a pirouette, a jig, a bow), the walk, a hop and a spin, and the reactions to
 * a poke and to being made dizzy. Each subclass adds its own acts and props.
 *
 * Everything is posed from the act's own clock, so it comes out the same at any frame rate.
 */
export abstract class Jobbot extends Toybot {
  protected jb = { hop: 0, spin: 0, still: false };

  /** Arms for the shared acts; a robot with more than two arms overrides this. */
  protected hands(forward: number, raise = 0, bend = 0) {
    this.arms(forward, raise, bend);
  }

  /** The rest of the arms' pose when it stands about. */
  protected abstract stance(t: number): void;
  /** Its props and lights, every frame, after the pose. */
  protected abstract extras(dt: number, env: Env): void;
  /** Extra posing of the arms while it walks (a = -1..1 swing, amt = 0..1.2). */
  protected walkArms(a: number, amt: number) {
    this.arm(1, 10 * a * amt, 10 * amt, 0);
    this.arm(-1, -10 * a * amt, 10 * amt, 0);
  }
  /** What a pat or a mouse resting on it makes it do. */
  protected delight() {
    this.setAct('cheer');
  }

  protected common(): Record<string, Act> {
    const p = this.puppet;
    const ok = () => this.free_;
    const env = (len: number, t: number, ramp = 0.35) =>
      smooth(t / ramp) * smooth((len - t) / ramp);
    return {
      idle: { weight: 3, length: [3, 6] },
      stroll: {
        weight: 3,
        length: [2.5, 4.5],
        when: ok,
        start: () =>
          this.stroll(Math.random() < 0.5 ? -1 : 1, this.heightPx * (1.5 + Math.random() * 2.2)),
      },
      wave: {
        weight: 1.4,
        length: [3.5, 4],
        face: 'happy',
        when: ok,
        pose: (t) => {
          const k = env(this.actLength, t);
          this.arm(1, 150 * k, 20 * k, 20 * k + 30 * k * Math.sin(t * 9));
          p.add('head', 0, 0, -6 * k);
          p.add('body', 0, 0, -3 * k);
        },
      },
      cheer: {
        weight: 1.2,
        length: [3, 3.5],
        face: 'happy',
        when: ok,
        pose: (t) => {
          const k = env(this.actLength, t, 0.25);
          const b = Math.abs(sin(t, 1.7));
          this.hands(165 * k - 20 * b * k, 18 * k, 10 * k);
          this.jb.hop = 0.045 * b * k;
          p.add('head', -10 * k);
        },
      },
      shrug: {
        weight: 0.9,
        length: [3, 3],
        when: ok,
        pose: (t) => {
          const k = smooth((t - 0.2) / 0.3) * smooth((2.7 - t) / 0.3);
          this.hands(15 * k, 50 * k, 70 * k);
          p.add('head', 0, 0, 10 * k);
          p.add('body', -3 * k);
          this.expression = t > 0.3 ? 'sheepish' : 'neutral';
        },
      },
      lookAround: {
        weight: 1,
        length: [4, 4.5],
        face: 'focused',
        when: ok,
        pose: (t) => {
          const k = env(this.actLength, t, 0.5);
          p.add('head', -4 * k, 40 * k * Math.sin(t * 1.5), 0);
          p.add('body', 0, 12 * k * Math.sin(t * 1.5 - 0.5), 0);
        },
      },
      spin: {
        weight: 0.9,
        length: [3, 3],
        face: 'happy',
        when: ok,
        pose: (t) => {
          const u = smooth((t - 0.2) / 2.2);
          this.jb.spin = Math.PI * 2 * u;
          this.jb.still = true;
          this.hands(20, 70 * Math.sin(Math.PI * u), 0);
          this.jb.hop = this.arc(t, 0.2, 2.2, 0.03);
        },
      },
      jig: {
        weight: 1,
        length: [6, 7],
        face: 'happy',
        when: ok,
        pose: (t) => {
          const k = env(this.actLength, t, 0.5);
          const beat = sin(t, 1.3);
          this.jb.still = true;
          p.add('body', 0, 0, 7 * beat * k);
          p.add('head', 0, 0, -9 * beat * k);
          p.add('leg.L', 20 * Math.max(0, beat) * k);
          p.add('leg.R', 20 * Math.max(0, -beat) * k);
          this.hands(40 * k * Math.abs(beat), 40 * k, 40 * k);
          this.jb.hop = 0.012 * Math.abs(sin(t, 2.6)) * k;
        },
      },
      bow: {
        weight: 1.1,
        length: [3, 3],
        face: 'happy',
        when: ok,
        pose: (t) => {
          const k = smooth((t - 0.2) / 0.6) * smooth((2.8 - t) / 0.6);
          p.add('body', 38 * k);
          p.add('head', 8 * k);
          this.hands(-10 * k, 10 * k, 0);
        },
      },
      poked: {
        weight: 0,
        length: [1.8, 1.8],
        face: 'surprised',
        pose: (t) => {
          const f = Math.max(0, 1 - t * 0.9);
          this.jb.hop = this.arc(t, 0, 0.45, 0.08);
          this.hands(110, 40, 20);
          p.add('body', 0, 0, 8 * Math.sin(t * 14) * f);
          p.add('head', 0, 0, -10 * Math.sin(t * 14 - 0.5) * f);
          if (t > 1.1) this.expression = 'sheepish';
        },
      },
      dizzy: {
        weight: 0,
        length: [3.4, 3.4],
        face: 'dizzy',
        pose: (t) => {
          const a = 2 * Math.PI * 1.1 * t;
          p.add('body', 6 * Math.cos(a), 0, 8 * Math.sin(a));
          p.add('head', -6 * Math.sin(a), 0, 10 * Math.cos(a));
          this.hands(40 + 25 * Math.sin(a * 1.3), 50, 20);
          this.jb.spin = 2 * Math.PI * smooth(t / 2.6);
          this.jb.still = true;
        },
      },
    };
  }

  // ---------- Each frame ----------

  protected idle(t: number) {
    this.jb.hop = 0;
    this.jb.spin = 0;
    this.jb.still = false;
    if (this.face) this.face.doodle = null;
    this.spec.steers = true;
    const p = this.puppet;
    const breath = Math.sin(2 * Math.PI * 0.27 * t);
    p.add('body', 0.8 * breath);
    p.add('head', 0, 0, 1.2 * Math.sin(2 * Math.PI * 0.13 * t));
    this.stance(t);
  }

  protected pose(_dt: number, env: Env) {
    const p = this.puppet;
    this.env = env;
    if (this.pleased) this.delight();
    const amt = clamp(this.stride / (this.heightPx * 0.7), 0, 1.2);
    if (amt > 0.02 && !this.jb.still) {
      const a = Math.sin(this.gait * 1.3);
      p.add('leg.L', -26 * a * amt);
      p.add('leg.R', 26 * a * amt);
      p.add('body', 0, 0, 3 * a * amt);
      p.add('head', 0, 0, -3 * a * amt);
      this.walkArms(a, amt);
      this.jb.hop = Math.max(this.jb.hop, 0.005 * Math.abs(Math.cos(this.gait * 1.3)) * amt);
    }
    this.h = this.jb.hop * this.px;
  }

  protected after(dt: number, env: Env) {
    this.extras(dt, env);
    if (this.act === 'idle' && this.state === 'here')
      this.expression = this.hovered ? 'happy' : 'neutral';
  }

  update(dt: number, env: Env) {
    super.update(dt, env);
    this.pivot.rotation.y = this.jb.spin;
  }
}
