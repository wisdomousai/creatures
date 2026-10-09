// A lane: a strip of floor in a three.js world for the crew to walk, as a frame of their
// own laid flat (Frame.flat). Its front edge is the frame's bottom, `length` px long; the
// floor goes back from it `width` px; up is up. A character on it runs exactly as on a page
// (it only knows px on a frame) and its holder sits in the lane's group, which turns and
// scales that into the world: x along the lane, y up, -z back across it, in metres.
import { Group, Vector3 } from 'three';
import type { Character, Env, Frame } from './character';

/** Where a lane lies on the floor (y = 0), in world metres. */
export interface LaneSpec {
  /** A name for it (links say which lanes meet by it). */
  id: string;
  /** The front edge's start, on the floor: [x, z]. */
  at: [number, number];
  /** Which way its front edge runs from there: [x, z], of length 1. The floor goes back
   * from it toward [z, -x] of that: along +x, back is -z, so the lane faces +z. */
  along: [number, number];
  /** How long and how deep (metres). */
  length: number;
  width: number;
  /** The floor round it, [x0, z0, x1, z1]: where one held may be taken (its room, say).
   * Default: the lane. */
  floor?: [number, number, number, number];
}

export interface LaneOptions {
  /** Lane px to a world metre (the crew's sums are in px). Default 100. */
  px?: number;
  /** The crew's unit (a page's --bot) in lane px: Bolt stands 1.45 of them. Default 55,
   * which makes him 0.8 m tall at 100 px a metre. */
  bot?: number;
  /** How high fliers may go (metres). Default 3.2. */
  ceiling?: number;
}

export class Lane {
  readonly spec: LaneSpec;
  /** In the world: x along the lane, y up, z out of its front, scaled to metres. Add it to
   * the scene; the crew on the lane go in it. */
  readonly group = new Group();
  readonly frame: Frame;
  /** Px a metre, and the lane's length and width in its px. */
  readonly px: number;
  readonly length: number;
  readonly width: number;
  private ceiling: number;
  private eye = new Vector3();

  constructor(spec: LaneSpec, options: LaneOptions = {}) {
    const { px = 100, bot = 55, ceiling = 3.2 } = options;
    this.spec = spec;
    this.px = px;
    this.length = spec.length * px;
    this.width = spec.width * px;
    this.ceiling = ceiling * px;
    this.frame = {
      left: 0,
      right: this.length,
      top: -this.ceiling,
      bottom: 0,
      band: bot,
      bot,
      depth: this.width,
      back: 1,
      flat: true,
    };
    const [ax, az] = spec.along;
    this.group.position.set(spec.at[0], 0, spec.at[1]);
    this.group.rotation.y = Math.atan2(-az, ax);
    this.group.scale.setScalar(1 / px);
    this.group.name = `lane:${spec.id}`;
  }

  /** After a character's update: fliers kept under the ceiling. */
  place(c: Character) {
    if (c.free && c.free.y < -this.ceiling) {
      c.free.y = -this.ceiling;
      c.holder.position.y = this.ceiling;
    }
  }

  /** Someone looking on from `eye` (world), as the crew on this lane see them: a pointer on
   * their frame, and how far in front of it. There when they're before the lane, near. */
  pointer(eye: Vector3, time: number, near = 16): Env['pointer'] {
    const p = this.group.worldToLocal(this.eye.copy(eye));
    return {
      x: p.x,
      y: -p.y,
      z: p.z,
      at: time,
      present: p.z > -this.width && p.length() < near * this.px,
    };
  }

  /** A point on the lane, `s` px along it and `d` (0..1) of the way back, in the world. */
  world(s: number, d: number, out = new Vector3()) {
    return this.group.localToWorld(out.set(s, 0, -d * this.width));
  }
}
