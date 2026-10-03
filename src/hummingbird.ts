import type { Object3D } from 'three';
import { BEACON, RAINBOW } from './bolt';
import { type Act, clamp, type Env } from './character';
import type { FaceLayout } from './face';
import { Bird, ease, type Reaction, span } from './birds';
import { sin } from './moves';
import { Spring } from './spring';

/**
 * Zip, the robot hummingbird: the smallest of the crew, a little egg of a body with a
 * needle bill, six lit domes on the throat that shimmer through the colours, and two
 * layered wings (a main blade and a second one hinged on it) that fan into a blur when
 * he hovers. He mostly isn't on the floor: he hovers in place, bobbing, darts sideways
 * and stops dead, loops a figure of eight, spins on the spot, buzzes a crewmate, and sips
 * from a flower that isn't there (the bill probing forward, the lower half working, the
 * throat flaring). On the ground he scurries, preens, shivers his wings warm, fans his
 * tail to flash his throat, and now and then goes torpid, head tucked, lights nearly out.
 *
 * A poke sends him straight up in a zip with the wings screaming; three make him dizzy;
 * the mouse resting on him makes him hover close and shimmer.
 */
export const HUMMINGBIRD_FACE: FaceLayout = {
  width: 512,
  height: 384,
  eyes: [
    [0.3, 0.5],
    [0.7, 0.5],
  ],
  rx: 0.09,
  ry: 0.2,
  line: 0.04,
  mouth: null,
};

const SIDES = [
  ['L', 1],
  ['R', -1],
] as const;
const GEMS = ['#ff4fa0', '#ffb347', '#6fdc8c', '#5ec8ff', '#c78bff', '#ffd23a'];

export class Hummingbird extends Bird {
  /** Held by the pointer, it flies after it. */
  readonly flies = true;
  private liftS = new Spring(4, 0.55, 1.4);
  private buzzS = new Spring(6, 0.8);
  private leanS = new Spring(5, 0.45);
  private tailS = new Spring(5, 0.5);
  private torpidS = new Spring(2, 0.9);
  private sipS = new Spring(9, 0.45, 1.5);
  // Per-frame requests from acts, cleared in idle().
  private up = 0;
  private buzz = 0;
  private lean = 0;
  private tailFan = 0;
  private torpid = 0;
  private sip = 0;
  private spin = 0;
  private shimmer = 0;
  private actSpeed = 1.2;
  private dir = 1;
  private did = 0;
  private stage = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Zip',
        model: 'hummingbird',
        metres: 0.3,
        width: 0.2,
        size: 0.45,
        feels: {
          default: { f: 4, zeta: 0.6 },
          root: { f: 4, zeta: 0.5 },
          body: { f: 5, zeta: 0.45 },
          head: { f: 6, zeta: 0.5, r: 0.5 },
          jaw: { f: 10, zeta: 0.45 },
          tail: { f: 6, zeta: 0.35 },
          'wing.L': { f: 5, zeta: 0.5 },
          'wing.R': { f: 5, zeta: 0.5 },
          'wing.L.2': { f: 5, zeta: 0.5 },
          'wing.R.2': { f: 5, zeta: 0.5 },
          'leg.L': { f: 7, zeta: 0.6 },
          'leg.R': { f: 7, zeta: 0.6 },
        },
        face: HUMMINGBIRD_FACE,
        eyes: 0.82,
        gaze: [
          { bone: 'head', yaw: 0.9, pitch: 0.9 },
          { bone: 'body', yaw: 0.1, pitch: 0 },
        ],
        reach: { yaw: 60, pitch: 30 },
        lag: 1.6,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [45, 100],
        speed: 1.2,
        turn: 60,
        roam: true,
      },
      model,
    );
    this.acts = {
      ...this.hovers(),
      ...this.ground(),
      ...this.reactions(),
    };
  }

  private flying = () => this.liftS.y > 0.3;

  // ---------- In the air ----------

  private hovers(): Record<string, Act> {
    const air = () => this.still() && this.state === 'here';
    return {
      idle: { weight: 3, length: [2.5, 5] },
      hover: {
        weight: 2.4,
        length: [4, 7],
        face: 'focused',
        when: air,
        pose: (t) => {
          // Hanging in the air: wings a blur, the body bobbing, drifting a little.
          const k = this.fade(t, 0.6);
          this.up = 1.0 * k;
          this.buzz = k;
          this.puppet.add('body', -18 * k + 3 * sin(t, 0.9) * k);
          this.puppet.add('head', 12 * k, 14 * sin(t, 0.4) * k);
          this.puppet.add('tail', 20 * k);
          this.shimmer = 0.5 * k;
        },
      },
      dart: {
        weight: 2.2,
        length: [5, 7],
        face: 'determined',
        when: air,
        start: () => {
          this.stage = 0;
          this.dir = Math.random() < 0.5 ? -1 : 1;
          this.did = 0;
        },
        pose: (t) => {
          // Up, then a dart to one side, a dead stop, a dart to the other: each one a
          // lean into it and a skid.
          const k = this.fade(t, 0.5);
          this.up = (0.9 + 0.15 * sin(t, 1.3)) * k;
          this.buzz = k;
          this.actSpeed = 5.5;
          this.puppet.add('tail', 22 * k);
          if (t > 0.8 + this.stage * 1.6 && this.stage < 3 && !this.walking) {
            const d = this.dir * (this.stage % 2 ? -1 : 1);
            this.amble(1.6 + Math.random(), undefined, d);
            this.stage++;
            this.did = d;
          }
          const speed = clamp(this.pace / (this.heightPx * 3), -1, 1);
          this.lean = 26 * speed * k;
          this.puppet.add('body', -14 * k - 6 * Math.abs(speed));
          this.shimmer = 0.3 + 0.7 * Math.abs(speed);
        },
      },
      sip: {
        weight: 2.4,
        length: [7, 9],
        face: 'happy',
        when: air,
        pose: (t) => {
          // At a flower that isn't there: in, bill probing, the lower half working,
          // out again, in again, the throat flaring with every sip.
          const k = this.fade(t, 0.7);
          const probe = span(t, 1.1, 1.6, 2.7, 3.2) + span(t, 3.8, 4.3, 5.6, 6.2);
          this.up = 1.0 * k;
          this.buzz = k;
          this.sip = probe;
          this.puppet.add('body', -12 * k + 10 * probe);
          this.puppet.add('head', 14 * k + 12 * probe, 0, 0);
          this.puppet.add('jaw', 20 * Math.max(0, sin(t, 4.5)) * probe);
          this.puppet.add('tail', 24 * k - 8 * probe);
          this.shimmer = 0.4 + 0.6 * probe;
        },
      },
      figureEight: {
        weight: 1.2,
        length: [7, 9],
        face: 'happy',
        when: air,
        start: () => (this.stage = 0),
        pose: (t) => {
          // A loop-the-loop in the air: out one way, round, back the other, rising and
          // dipping, the body rolling into each turn.
          const k = this.fade(t, 0.6);
          this.up = (0.95 + 0.35 * sin(t, 0.5)) * k;
          this.buzz = k;
          this.actSpeed = 2.6;
          if (t > this.stage * 1.4 && this.stage < 5 && !this.walking) {
            this.amble(1.4, 0.15 + Math.random() * 0.5, this.stage % 2 ? -1 : 1);
            this.stage++;
          }
          this.lean = 24 * Math.cos(t * 2.2) * k;
          this.puppet.add('body', -15 * k);
          this.puppet.add('tail', 18 * k);
          this.shimmer = 0.6 * k;
        },
      },
      spinHover: {
        weight: 1.1,
        length: [3.2, 3.8],
        face: 'happy',
        when: air,
        pose: (t) => {
          // Turning round on the spot as he hangs there, throat flashing every colour.
          const k = this.fade(t, 0.5);
          this.up = 1.0 * k;
          this.buzz = k;
          this.spin = 2 * Math.PI * ease(t, 0.6, 2.8);
          this.puppet.add('body', -16 * k);
          this.puppet.add('tail', 20 * k);
          this.shimmer = 1;
        },
      },
      buzzMate: {
        weight: 1.4,
        length: [7, 9],
        face: 'surprised',
        when: () => air() && this.mates().length > 0,
        start: () => (this.did = 0),
        pose: (t) => {
          // Zips over to a crewmate, hangs in front of its face for a look, and
          // buzzes off again.
          const m = this.mates()[0];
          const k = this.fade(t, 0.5);
          this.up = 1.0 * k;
          this.buzz = k;
          this.actSpeed = 4;
          if (m && t < 4.5 && !this.walking && this.did < 1) {
            const side = this.s < m.s ? -1 : 1;
            this.walkTo(
              m.s + side * (this.heightPx * 0.9 + m.footprint(this.env!.frame).x),
              m.depth,
            );
            this.did = 1;
          }
          if (t > 5.5 && this.did === 1 && !this.walking) {
            this.did = 2;
            this.amble(3);
          }
          this.puppet.add('body', -16 * k);
          this.puppet.add('head', 10 * k, 18 * sin(t, 1.2) * k);
          this.puppet.add('tail', 18 * k);
          this.shimmer = 0.5 * k;
        },
      },
    };
  }

  // ---------- On the floor ----------

  private ground(): Record<string, Act> {
    return {
      scurry: {
        weight: 1.4,
        length: [2.5, 4],
        when: this.still,
        start: () => {
          this.actSpeed = 1.6;
          this.amble(1.5 + Math.random() * 1.5);
        },
        pose: () => (this.actSpeed = 1.6),
      },
      preen: {
        weight: 1.2,
        length: [5, 7],
        when: this.still,
        start: () => (this.dir = Math.random() < 0.5 ? -1 : 1),
        pose: (t) => {
          // Twists round and nibbles along a wing, then the tail.
          const k = span(t, 0.3, 0.9, this.actLength - 0.9, this.actLength - 0.3);
          const nib = Math.max(0, sin(t, 4)) * k;
          this.puppet.add('body', 6 * k, this.dir * 14 * k, 0);
          this.puppet.add('head', 18 * k + 4 * nib, this.dir * 100 * k, this.dir * 6 * k);
          this.puppet.add('jaw', 10 * nib);
          this.puppet.add('tail', 0, -this.dir * 20 * k, 0);
          this.expression = k > 0.5 ? 'sleepy' : 'neutral';
        },
      },
      shiver: {
        weight: 1.1,
        length: [2.6, 3.4],
        face: 'focused',
        when: this.still,
        pose: (t) => {
          // Warming up the wings on the spot: they buzz out, his whole body trembles.
          const k = span(t, 0.2, 0.5, this.actLength - 0.6, this.actLength - 0.2);
          this.buzz = k;
          this.up = 0.04 * k;
          this.puppet.add('body', -6 * k);
          this.shimmer = k;
        },
      },
      flash: {
        weight: 1.1,
        length: [3.4, 4.2],
        face: 'surprised',
        when: this.still,
        pose: (t) => {
          // Tail fanned wide, chin up, the throat running through every colour.
          const k = span(t, 0.3, 0.7, this.actLength - 0.8, this.actLength - 0.3);
          this.tailFan = k;
          this.puppet.add('head', -22 * k, 22 * sin(t, 0.45) * k);
          this.puppet.add('body', -8 * k);
          this.shimmer = k;
        },
      },
      torpor: {
        weight: 0.9,
        length: [9, 13],
        when: this.still,
        pose: (t) => {
          // Torpid: puffed up, head tucked down into the shoulders, the lights nearly out.
          const k = span(t, 1, 2.2, this.actLength - 2, this.actLength - 0.6);
          this.torpid = k;
          this.puppet.add('head', 30 * k);
          this.puppet.add('body', 10 * k);
          this.expression = k > 0.4 ? 'asleep' : 'sleepy';
        },
      },
    };
  }

  protected react(kind: Reaction, t: number) {
    const p = this.puppet;
    if (kind === 'poked') {
      // Straight up in a zip, wings screaming, throat flashing, then back to hover.
      const k = span(t, 0, 0.15, 1.2, 1.8);
      this.up = 2.2 * k;
      this.buzz = 1;
      this.shimmer = 1;
      p.add('body', -24 * k);
      p.add('tail', 30 * k);
      p.add('jaw', 20 * span(t, 0.05, 0.15, 0.4, 0.6));
    } else if (kind === 'dizzy') {
      const k = 1 - ease(t, 2.4, 3.4);
      this.up = 0.8 * k;
      this.buzz = 0.7 * k;
      p.add('head', 8 * k * Math.cos(t * 5), 12 * k * Math.sin(t * 3), 24 * k * Math.sin(t * 5));
      p.add('body', 0, 0, 10 * k * Math.sin(t * 5));
      this.shimmer = k;
    } else {
      // Hanging close, wings blurring, throat shimmering.
      const k = this.fade(t, 0.6);
      this.up = 0.8 * k;
      this.buzz = k;
      p.add('head', 8 * k, 0, 8 * k * sin(t, 1.2));
      p.add('body', -14 * k);
      this.shimmer = k;
    }
  }

  // ---------- Posing ----------

  protected idle(t: number) {
    const p = this.puppet;
    this.up = 0;
    this.buzz = 0;
    this.lean = 0;
    this.tailFan = 0;
    this.torpid = 0;
    this.sip = 0;
    this.spin = 0;
    this.shimmer = 0;
    this.actSpeed = 1.2;
    this.expression = this.hovered ? 'happy' : 'neutral';
    // A twitchy little head, looking about in jerks.
    const n = Math.floor(t / 0.9);
    const jerk = Math.sin(n * 71.3) * 20 * Math.min(1, (t % 0.9) * 10);
    p.add('head', 2 * sin(t, 0.4), jerk * 0.5, 0);
    p.add('body', 1.5 * sin(t, 0.5));
    p.add('tail', 2 * sin(t, 0.6));
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    this.env = env;
    this.spec.speed = this.actSpeed;
    this.enjoy(dt, this.still());
    const H = this.heightPx;
    const lift = this.liftS.update(dt, this.up);
    this.h = Math.max(0, lift) * H;
    const buzz = this.buzzS.update(dt, this.buzz || (this.flying() ? 1 : 0));
    const lean = this.leanS.update(dt, this.lean);
    const tor = this.torpidS.update(dt, this.torpid);
    const air = clamp(lift, 0, 1);
    // Feet: tucked up behind in the air; a quick scurry on the ground.
    p.add('leg.L', 75 * air);
    p.add('leg.R', 75 * air);
    const moving = clamp(this.stride / (H * 0.9), 0, 1) * (1 - air);
    if (moving > 0.05) {
      const ph = this.gait * 2.2;
      p.add('leg.L', 34 * Math.sin(ph) * moving);
      p.add('leg.R', -34 * Math.sin(ph) * moving);
      p.add('body', -4 * moving, 0, 4 * Math.cos(ph) * moving);
      p.add('head', 5 * Math.cos(ph * 2) * moving);
    }
    // Leaning into a dart: the whole body rolls toward the way he goes.
    p.add('root', 0, 0, -lean);
    // In the air the body is tipped further back, tail down, and the head stays level.
    p.add('body', -10 * air * buzz);
    p.add('head', 8 * air * buzz);
    // The bill probing a flower: forward and a little down.
    const sip = this.sipS.update(dt, this.sip);
    p.add('root', 14 * sip);
    p.add('head', 10 * sip);
    // Wings out and the tail fanned, or wings held in tight when torpid.
    const out = clamp(buzz, 0, 1);
    for (const [sfx, side] of SIDES) {
      p.add(`wing.${sfx}`, 0, -side * 82 * out, side * 8 * out);
      p.add(`wing.${sfx}.2`, 0, side * 14 * out, 0);
      p.add(`wing.${sfx}`, 8 * tor, 0, side * 6 * tor);
    }
    this.tailS.update(dt, this.tailFan || out * 0.5);
  }

  protected after(dt: number, env: Env) {
    const p = this.puppet;
    const t = env.time;
    const buzz = clamp(this.buzzS.y, 0, 1);
    // The wingbeat, direct: far too quick for a spring. The second blade beats a little
    // out of step, so the two smear into a fan.
    if (buzz > 0.02) {
      const rate = 2 * Math.PI * 11 * t;
      for (const [sfx, side] of SIDES) {
        p.turn(`wing.${sfx}`, 10 * buzz * Math.cos(rate), -side * 34 * buzz * Math.sin(rate), 0);
        p.turn(
          `wing.${sfx}.2`,
          -12 * buzz * Math.cos(rate + 0.9),
          -side * 30 * buzz * Math.sin(rate + 1.3),
          0,
        );
      }
      p.turn('body', 0, 0, 1.2 * buzz * Math.sin(t * 90));
    }
    if (this.buzz > 0.5 && !this.flying()) p.turn('root', 0, 0, 2 * Math.sin(t * 80));
    // The tail fans out.
    const fan = this.tailS.y;
    p.turn('tail', -10 * fan, 0, 0);
    p.stretch('tail', 1 + 0.35 * fan, [0, 0, 1], 1 + 0.5 * fan);
    // Puffed up when torpid.
    const puff = 1 + 0.12 * this.torpidS.y;
    p.stretch('body', puff, [0, 1, 0], puff);
    this.pivot.rotation.y = this.spin;
    this.lights(t);
  }

  /** The throat: six domes that shimmer through the colours, brighter the more he shows off. */
  private lights(t: number) {
    const tone = this.expression === 'neutral' ? BEACON.happy : BEACON[this.expression];
    const dim = this.torpidS.y;
    for (let i = 0; i < 6; i++) {
      const base = 0.45 + 0.4 * Math.sin(t * 1.6 + i * 1.7);
      const wave = Math.max(0, Math.sin(t * 9 - i * 1.1));
      let level =
        (0.35 + 0.65 * clamp(base * (1 - this.shimmer) + wave * this.shimmer, 0, 1)) *
        (1 - 0.92 * dim);
      if (this.act === 'dizzy') level = Math.random() < 0.5 ? 1 : 0.2;
      const hue = GEMS[(i + Math.floor(t * (0.6 + 5 * this.shimmer))) % GEMS.length];
      this.outfit.dot(i, clamp(level, 0, 1), hue);
    }
    this.outfit.beacon(
      this.act === 'dizzy' ? RAINBOW[Math.floor(t * 9) % RAINBOW.length] : (tone ?? '#ffb347'),
    );
  }
}
