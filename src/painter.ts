import type { Object3D } from 'three';
import type { Act, Env } from './character';
import type { FaceLayout } from './face';
import { Jobbot } from './jobbot';
import { sin } from './moves';
import { smooth } from './toybot';

/**
 * Dab, an artist robot: a rounded box head under a red beret, a smock splashed with lit
 * paint, a palette of paint blobs in one hand and a long brush with a glowing tip in the
 * other, round brown shoes, and an easel with a canvas that comes out for her pictures.
 *
 * Tricks: painting a picture on the easel (a sun, a hill and a flower fill in with light,
 * one stroke at a time), stepping back and squinting at it with the brush held up to
 * measure, mixing paint on the palette, a flourish of a bow, getting paint on her face
 * (a lit smear that she then wipes off with the back of her glove); and the shared ones.
 */
export const PAINTER_FACE: FaceLayout = {
  width: 512,
  height: 348,
  eyes: [
    [0.3, 0.46],
    [0.7, 0.46],
  ],
  rx: 0.085,
  ry: 0.21,
  line: 0.034,
  mouth: [0.5, 0.76],
};

const SUN = '#ffd35c';
const HILL = '#7ad98a';
const FLOWER = '#ff8ab8';
const TIP = '#ff8a5c';

export class Painter extends Jobbot {
  static readonly terms =
    'artist art paint paintbrush brush palette easel canvas beret french red blue brown white painting picture smock sun hill flower colourful color';

  private fx = {
    easel: 0, // the easel and canvas, 0..1
    sun: 0,
    hill: 0,
    flower: 0,
    smudge: 0,
    brush: 0, // how brightly the brush tip glows
  };

  constructor(model: Object3D) {
    super(
      {
        name: 'Dab',
        model: 'painter',
        metres: 0.66,
        width: 0.5,
        size: 0.88,
        feels: {
          default: { f: 2.4, zeta: 0.5 },
          root: { f: 2.4, zeta: 0.7 },
          body: { f: 2.2, zeta: 0.5 },
          head: { f: 2, zeta: 0.4, r: 0.4 },
          'upper_arm.L': { f: 2.8, zeta: 0.45 },
          'upper_arm.R': { f: 3, zeta: 0.45 },
          'forearm.L': { f: 3.2, zeta: 0.4 },
          'forearm.R': { f: 3.4, zeta: 0.4 },
          'leg.L': { f: 3, zeta: 0.5 },
          'leg.R': { f: 3, zeta: 0.5 },
        },
        face: PAINTER_FACE,
        eyes: 0.76,
        gaze: [
          { bone: 'head', yaw: 0.7, pitch: 0.6 },
          { bone: 'body', yaw: 0.2, pitch: 0.1 },
        ],
        reach: { yaw: 50, pitch: 26 },
        lag: 1.2,
        entrance: 'walk',
        edges: ['bottom'],
        stay: [60, 130],
        speed: 0.75,
      },
      model,
    );
    this.acts = { ...this.common(), ...this.moves() };
  }

  /** The brush arm, out to the canvas on the right of the picture. */
  private reach(k: number, up: number, side: number, bend = 10) {
    this.arm(-1, (24 + 10 * side) * k, (64 + 14 * up) * k, bend * k);
  }

  private moves(): Record<string, Act> {
    const p = this.puppet;
    const ok = () => this.free_;
    return {
      // Paints a picture: a sun, a hill, a flower; each fills in with light as she strokes.
      paint: {
        weight: 2.4,
        length: [15, 15],
        face: 'focused',
        when: ok,
        pose: (t) => {
          this.fx.easel = smooth((t - 0.2) / 0.7) * smooth((14.8 - t) / 0.6);
          const at = smooth((t - 1) / 0.6) * smooth((10.4 - t) / 0.6);
          const stroke = Math.sin(t * 7);
          this.fx.sun = smooth((t - 2) / 2);
          this.fx.hill = smooth((t - 4.6) / 2.4);
          this.fx.flower = smooth((t - 7.6) / 2);
          this.fx.brush = at * (t < 9.8 ? 1 : 0);
          // Which patch she is on: the sun (high), the hill (low), the flower (middle).
          const high = t < 4 ? 1 : t < 7 ? -1 : 0.2;
          this.reach(at, high * 0.6 + 0.3 * stroke, 0.5 * stroke * (t > 4.4 && t < 7 ? 3 : 1));
          p.add('body', 0, -16 * at, 0);
          p.add('head', 4 * at, -14 * at, 0);
          this.arm(1, 40 * at, 25, 70 * at);
          // Done: steps back, brush up, a satisfied bounce.
          if (t > 10.4) {
            const s = smooth((t - 10.4) / 0.5) * smooth((14.4 - t) / 0.5);
            this.arm(-1, 120 * s, 15 * s, 30 * s);
            this.expression = t > 11.2 ? 'love' : 'focused';
            this.jb.hop = t > 12.2 && t < 13.4 ? 0.025 * Math.abs(sin(t, 1.6)) : 0;
            p.add('head', 0, 0, -8 * s);
          }
        },
      },
      // Stands back and squints at the picture, the brush held up to measure.
      squint: {
        weight: 1.5,
        length: [8, 8],
        when: ok,
        pose: (t) => {
          this.fx.easel = smooth((t - 0.2) / 0.6) * smooth((7.8 - t) / 0.6);
          this.fx.sun = this.fx.hill = this.fx.flower = this.fx.easel;
          const k = smooth((t - 0.8) / 0.6) * smooth((6.6 - t) / 0.6);
          this.arm(-1, 78 * k, 8 * k, 85 * k);
          this.arm(1, 40 * k, 20, 80 * k);
          p.add('body', -6 * k);
          p.add('head', -4 * k, 0, 12 * Math.sin(t * 1.2) * k);
          this.expression = t < 2 ? 'focused' : t < 4.4 ? 'sleepy' : t < 6.6 ? 'wink' : 'happy';
          // A nod of approval.
          if (t > 5 && t < 6.6) p.add('head', 10 * Math.max(0, Math.sin((t - 5) * 5)));
        },
      },
      // Swirls the brush in the palette to mix a new colour.
      mix: {
        weight: 1.3,
        length: [5, 5],
        face: 'focused',
        when: ok,
        pose: (t) => {
          const k = smooth((t - 0.2) / 0.5) * smooth((4.8 - t) / 0.5);
          this.fx.brush = k;
          this.arm(1, 62 * k, -4 * k, 78 * k);
          this.arm(
            -1,
            70 * k + 8 * k * Math.sin(t * 9),
            -28 * k,
            90 * k + 10 * k * Math.cos(t * 9),
          );
          p.add('head', 18 * k);
          if (t > 4) this.expression = 'happy';
        },
      },
      // A flourish of a bow: brush sweeping out, palette behind her back.
      flourish: {
        weight: 1.3,
        length: [4, 4],
        face: 'happy',
        when: ok,
        pose: (t) => {
          const sweep = smooth((t - 0.2) / 0.7);
          const k = sweep * smooth((3.8 - t) / 0.7);
          this.fx.brush = k;
          this.arm(-1, 40 * k, 100 * k - 40 * smooth((t - 1.4) / 0.8) * k, 20 * k);
          this.arm(1, -30 * k, 25 * k, 70 * k);
          p.add('body', 36 * smooth((t - 1.2) / 0.6) * smooth((3.4 - t) / 0.6));
          p.add('head', 10 * smooth((t - 1.2) / 0.6) * smooth((3.4 - t) / 0.6));
        },
      },
      // The brush finds her nose instead of the canvas. She wipes it off.
      smudge: {
        weight: 1.5,
        length: [8, 8],
        when: ok,
        pose: (t) => {
          this.fx.smudge = smooth((t - 1.2) / 0.2) * smooth((7.2 - t) / 0.7);
          this.fx.brush = t < 1.4 ? 1 : 0.3;
          const itch = smooth((t - 0.3) / 0.7) * smooth((1.8 - t) / 0.6);
          this.arm(-1, 115 * itch, 12 * itch, 105 * itch);
          p.add('head', 6 * itch);
          this.expression =
            t < 1.2 ? 'neutral' : t < 3 ? 'surprised' : t < 4 ? 'sheepish' : 'happy';
          const wipe = smooth((t - 3.6) / 0.5) * smooth((6.6 - t) / 0.5);
          if (wipe > 0) {
            this.arm(1, 118 * wipe, 12 * wipe, 108 * wipe + 14 * wipe * Math.sin(t * 12));
            p.add('head', 0, 0, 6 * Math.sin(t * 12) * wipe);
          }
        },
      },
    };
  }

  protected stance(t: number) {
    Object.assign(this.fx, { easel: 0, sun: 0, hill: 0, flower: 0, smudge: 0, brush: 0 });
    const w = Math.sin(2 * Math.PI * 0.2 * t);
    // The palette is carried up in front; the brush hangs ready.
    this.arm(1, 22 + 3 * w, 14, 62);
    this.arm(-1, 6 - 2 * w, 12, 10);
  }

  protected walkArms(a: number, amt: number) {
    this.arm(1, 22, 14, 62);
    this.arm(-1, -14 * a * amt, 12 * amt, 10);
  }

  protected extras(_dt: number, env: Env) {
    const p = this.puppet;
    const f = this.fx;
    const tiny = (k: number) => Math.max(0.001, k);
    p.stretch('easel', tiny(f.easel), [0, 1, 0], tiny(f.easel));
    p.stretch('art.1', tiny(f.sun), [0, 1, 0], tiny(f.sun));
    p.stretch('art.2', tiny(f.hill), [0, 1, 0], tiny(f.hill));
    p.stretch('art.3', tiny(f.flower), [0, 1, 0], tiny(f.flower));
    p.stretch('smudge', tiny(f.smudge), [0, 1, 0], tiny(f.smudge));
    const asleep = this.face?.expression === 'asleep';
    this.outfit.dot(0, asleep ? 0.2 : 0.35 + 0.65 * f.sun, SUN);
    this.outfit.dot(1, asleep ? 0.2 : 0.35 + 0.65 * f.hill, HILL);
    this.outfit.dot(2, asleep ? 0.2 : 0.4 + 0.6 * Math.max(f.flower, f.smudge), FLOWER);
    this.outfit.dot(
      3,
      asleep ? 0.2 : 0.45 + 0.55 * f.brush * (0.8 + 0.2 * Math.sin(env.time * 9)),
      TIP,
    );
    this.outfit.beacon(asleep ? '#8a8a84' : '#ff6a6a');
  }
}
