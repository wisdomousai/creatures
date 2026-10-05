import type { Object3D } from 'three';
import {
  type Act,
  BEACON,
  Character,
  clamp,
  ease,
  type Env,
  type Expression,
  type FaceLayout,
  type Palette,
  RAINBOW,
  sin,
  trot,
} from '@wisdomousai/creatures';

/**
 * Digby, a robot star-nosed mole (mole.py builds him). He comes up through the floor,
 * potters about on four legs, digs, sniffs with the eight lit nubs of his star, and
 * stands up tall for a look round. Poke him and he flinches; three quick pokes and he's
 * dizzy; rest the mouse on him and he goes soppy.
 *
 * Bring him on:
 *   ROSTER.mole = { file: '/models/mole.glb', make: (m) => new Mole(m), weight: 3 };
 *   PALETTES.mole = MOLE_PALETTE;
 */

/** His screen: the same numbers as the layout in mole.py. */
export const MOLE_FACE: FaceLayout = {
  width: 512,
  height: 312,
  eyes: [
    [0.3, 0.45],
    [0.7, 0.45],
  ],
  rx: 0.09,
  ry: 0.16,
  line: 0.04,
  mouth: [0.5, 0.78],
};

/** His colours in the colour look: the same as in mole.py. */
export const MOLE_PALETTE: Palette = {
  base: { shell: '#5d4d45', joint: '#3b312c', bezel: '#2b2421' },
  roles: { Paw: '#f3a6a0', Snout: '#f3a6a0' },
  dots: ['#7a3f45', '#ff9ec4'],
};

const NUBS = 8;

export class Mole extends Character {
  private pokes: number[] = [];
  private hover = 0;

  constructor(model: Object3D) {
    super(
      {
        name: 'Digby',
        model: 'mole',
        metres: 0.19,
        width: 0.2,
        size: 0.7,
        // How each joint follows its target: f is how quick (Hz), zeta how soon it stops
        // wobbling. His nose is twitchy and his tail is floppy.
        feels: {
          default: { f: 4, zeta: 0.5 },
          root: { f: 2.5, zeta: 0.6 },
          body: { f: 3, zeta: 0.5, r: 0.5 },
          head: { f: 3.5, zeta: 0.45 },
          nose: { f: 7, zeta: 0.3 },
          tail: { f: 5, zeta: 0.25 },
        },
        face: MOLE_FACE,
        eyes: 0.62,
        gaze: [
          { bone: 'head', yaw: 0.7, pitch: 0.6 },
          { bone: 'body', yaw: 0.3, pitch: 0.2 },
        ],
        reach: { yaw: 40, pitch: 20 },
        lag: 1.2,
        entrance: 'rise',
        edges: ['bottom'],
        stay: [40, 90],
        speed: 0.9,
      },
      model,
    );
    this.acts = this.moves();
  }

  private moves(): Record<string, Act> {
    const still = () => !this.walking;
    return {
      idle: { weight: 3, length: [3, 6] },
      stroll: {
        weight: 3,
        length: [5, 8],
        when: still,
        start: () => {
          const way = Math.random() < 0.5 ? -1 : 1;
          this.walkTo(this.s + way * this.heightPx * (1.5 + Math.random() * 2));
        },
      },
      dig: { weight: 1.4, length: [3.5, 5], face: 'determined', when: still },
      sniff: { weight: 1.2, length: [3, 4.5], face: 'focused', when: still },
      lookout: { weight: 1, length: [4, 5.5], when: still },
      // Weight 0: never picked by chance, only by what happens to him. (The poke has no
      // face of its own: pose() turns it from surprised to cross.)
      poked: { weight: 0, length: [2.5, 3] },
      love: { weight: 0, length: [4, 5], face: 'love' },
      dizzy: { weight: 0, length: [4, 4.5], face: 'dizzy' },
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
    } else if (this.act !== 'dizzy') {
      this.puppet.kick('body', -60);
      this.hopUp(0.2);
      this.setAct('poked');
    }
  }

  /** Always on, under everything else: breathing, and a sniff now and then. */
  protected idle(t: number) {
    const p = this.puppet;
    p.add('body', 1.5 * sin(t, 0.25), 0, 1.5 * sin(t, 0.18));
    p.add('head', 2 * sin(t, 0.3), 4 * sin(t, 0.13), 0);
    const twitch = Math.max(0, sin(t, 0.4)) ** 8;
    p.add('nose', 8 * twitch * sin(t, 6), 0, 0);
    p.add('tail', 0, 6 * sin(t, 0.5), 0);
  }

  /** Where every joint wants to be this frame. The springs do the rest. */
  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    const t = this.actT;
    const left = this.actLength - t;
    // In and out of each act over half a second, so nothing snaps.
    const k = ease(Math.min(t / 0.5, left / 0.5));
    // The act's own face if it has one (the screen shows it), so his lamp agrees.
    let face: Expression = this.acts[this.act]?.face ?? (this.hovered ? 'happy' : 'neutral');

    // A mouse resting on him for a moment: he goes soppy.
    this.hover = this.hovered ? this.hover + dt : 0;
    if (this.hover > 0.9 && ['idle', 'stroll', 'sniff'].includes(this.act)) this.setAct('love');

    switch (this.act) {
      case 'dig': {
        // Nose down, paws going like pistons, tail up.
        p.add('body', 8 * k);
        p.add('head', 18 * k);
        const paw = 35 * k * Math.sin(t * 2 * Math.PI * 4);
        p.add('leg.FL', paw);
        p.add('leg.FR', -paw);
        p.add('tail', -25 * k, 0, 10 * Math.sin(t * 9));
        break;
      }
      case 'sniff':
        p.add('nose', 10 * sin(t, 3.1), 14 * sin(t, 2.3));
        p.add('head', -6 * k, 20 * k * sin(t, 0.35));
        break;
      case 'lookout':
        // Up tall on his back legs, one way, then the other.
        p.add('body', -12 * k);
        p.add('head', 6 * k, 35 * k * Math.sign(Math.sin(t * 1.3)));
        p.add('leg.FL', -30 * k);
        p.add('leg.FR', -30 * k);
        face = t > 1 ? 'focused' : 'neutral';
        break;
      case 'poked':
        p.add('body', -10 * k);
        p.add('head', 15 * k);
        face = t < 0.6 ? 'surprised' : 'cross';
        break;
      case 'love':
        p.add('body', 0, 0, 6 * Math.sin(t * 2.2));
        p.add('head', -8 * k, 0, 8 * Math.sin(t * 2.2 - 0.6));
        p.add('tail', 0, 25 * Math.sin(t * 7));
        break;
      case 'dizzy':
        p.add('body', 0, 0, 8 * Math.sin(env.time * 5));
        p.add('head', 6 * Math.sin(env.time * 5 + 1), 10 * Math.cos(env.time * 5), 0);
        break;
    }
    this.expression = face;

    // Walking: legs in diagonal pairs, harder the faster he goes.
    trot(p, this.gait, clamp(this.stride / ((this.spec.speed ?? 1) * env.frame.bot), 0, 1.5));
  }

  /** After the springs: the lights. */
  protected after(_dt: number, env: Env) {
    const time = env.time;
    for (let i = 0; i < NUBS; i++) {
      let level = 0.45 + 0.25 * Math.sin(time * 1.2 + i * 0.8);
      let tone: string | undefined;
      if (this.act === 'sniff')
        // A light running round the star.
        level = Math.max(0.2, Math.cos(time * 9 - (i / NUBS) * 2 * Math.PI));
      else if (this.act === 'dig') level = Math.sin(time * 25 + i * 2.1) > 0 ? 1 : 0.3;
      else if (this.act === 'love') {
        level = 0.7 + 0.3 * Math.sin(time * 2.4 - i * 0.5);
        tone = BEACON.love;
      } else if (this.act === 'dizzy') {
        level = 1;
        tone = RAINBOW[(i + Math.floor(time * 4)) % RAINBOW.length];
      } else if (this.act === 'poked' && this.actT < 0.6) {
        level = Math.sin(time * 30) > 0 ? 1 : 0.2;
        tone = BEACON.surprised;
      }
      this.outfit.dot(i, level, tone);
    }
    // His lamp shows how he feels.
    this.outfit.beacon(BEACON[this.expression] ?? BEACON.neutral!);
  }
}
