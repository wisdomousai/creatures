import { type Bone, type Object3D, PropertyBinding, Quaternion, Vector3 } from 'three';
import { Spring } from './spring';

/**
 * A rigged character, posed live. Nothing is pre-animated: each frame the character's
 * code sets a target turn for every joint it cares about, and a spring per joint and
 * axis chases it. Changing a target is all it takes to animate; the springs supply the
 * easing, the overshoot and the follow-through.
 *
 * Turns are in the character's own axes (three.js, as exported from Blender): +X is
 * the character's left, +Y up, +Z its front. Degrees, applied roll, then pitch, then
 * yaw, relative to the bone's rest pose, and riding on the parent's turn:
 *   pitch (about X): + tips an upright bone forward and swings a hanging one back;
 *   yaw   (about Y): + turns it toward its left;
 *   roll  (about Z): + tips an upright bone toward its right (the viewer's left) and
 *                    swings a hanging one out to its left.
 */
export type Turn = [pitch: number, yaw: number, roll: number];
export interface Feel {
  f: number;
  zeta: number;
  r?: number;
}

interface Joint {
  bone: Bone;
  rest: Quaternion;
  restWorld: Quaternion;
  restWorldInv: Quaternion;
  restPosition: Vector3;
  restScale: Vector3;
  springs: [Spring, Spring, Spring];
  target: Turn;
}

const DEG = Math.PI / 180;
const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);
const Z = new Vector3(0, 0, 1);
const qa = new Quaternion();
const qb = new Quaternion();
const qc = new Quaternion();
const v = new Vector3();

export class Puppet {
  readonly root: Object3D;
  private joints = new Map<string, Joint>();

  /** feels: spring settings per bone (Blender names); `default` covers the rest. */
  constructor(root: Object3D, feels: Record<string, Feel> & { default: Feel }) {
    this.root = root;
    root.updateMatrixWorld(true);
    const rootInv = root.getWorldQuaternion(new Quaternion()).invert();
    root.traverse((obj) => {
      const bone = obj as Bone;
      if (!bone.isBone) return;
      const restWorld = rootInv.clone().multiply(bone.getWorldQuaternion(new Quaternion()));
      this.joints.set(bone.name, {
        bone,
        rest: bone.quaternion.clone(),
        restWorld,
        restWorldInv: restWorld.clone().invert(),
        restPosition: bone.position.clone(),
        restScale: bone.scale.clone(),
        springs: [0, 1, 2].map(() => new Spring(1, 1)) as Joint['springs'],
        target: [0, 0, 0],
      });
    });
    for (const [name, joint] of this.joints) {
      const feel =
        Object.entries(feels).find(([key]) => sanitize(key) === name)?.[1] ?? feels.default;
      joint.springs = [0, 1, 2].map(
        () => new Spring(feel.f, feel.zeta, feel.r ?? 1),
      ) as Joint['springs'];
    }
  }

  has(name: string) {
    return this.joints.has(sanitize(name));
  }

  bone(name: string): Bone {
    return this.joint(name).bone;
  }

  private joint(name: string): Joint {
    const joint = this.joints.get(sanitize(name));
    if (!joint) throw new Error(`no bone ${name}`);
    return joint;
  }

  /** Start a frame: every joint's target goes back to rest. */
  begin() {
    for (const joint of this.joints.values()) joint.target.fill(0);
  }

  /** Add to a joint's target this frame (several layers can add to one joint). */
  add(name: string, pitch = 0, yaw = 0, roll = 0) {
    const t = this.joint(name).target;
    t[0] += pitch;
    t[1] += yaw;
    t[2] += roll;
  }

  /** Knock a joint (degrees per second on pitch, yaw, roll), for bumps and landings. */
  kick(name: string, pitch = 0, yaw = 0, roll = 0) {
    const s = this.joint(name).springs;
    s[0].kick(pitch);
    s[1].kick(yaw);
    s[2].kick(roll);
  }

  /** Where a joint actually is right now (after its spring), in degrees. */
  current(name: string): Turn {
    const s = this.joint(name).springs;
    return [s[0].y, s[1].y, s[2].y];
  }

  /** Move the springs, then pose the bones. snap skips the motion (first frame). */
  update(dt: number, snap = false) {
    for (const joint of this.joints.values()) {
      const [p, y, r] = joint.springs.map((s, i) =>
        snap ? (s.snap(joint.target[i]), joint.target[i]) : s.update(dt, joint.target[i]),
      );
      // q = yaw · pitch · roll, in character axes; then into the bone's own frame.
      qa.setFromAxisAngle(Y, y * DEG)
        .multiply(qb.setFromAxisAngle(X, p * DEG))
        .multiply(qc.setFromAxisAngle(Z, r * DEG));
      joint.bone.quaternion
        .copy(joint.rest)
        .multiply(qb.copy(joint.restWorldInv).multiply(qa).multiply(joint.restWorld));
    }
  }

  /**
   * Turn a joint further this frame, in character axes (degrees), after update: direct,
   * not sprung, for motion too quick for a spring to follow (a wingbeat).
   */
  turn(name: string, pitch = 0, yaw = 0, roll = 0) {
    const joint = this.joint(name);
    qa.setFromAxisAngle(Y, yaw * DEG)
      .multiply(qb.setFromAxisAngle(X, pitch * DEG))
      .multiply(qc.setFromAxisAngle(Z, roll * DEG));
    joint.bone.quaternion.multiply(
      qb.copy(joint.restWorldInv).multiply(qa).multiply(joint.restWorld),
    );
  }

  /**
   * Scale a bone along one direction in character space (e.g. [0,-1,0] for a flame that
   * points down) and by `across` in the other two. Direct, not sprung.
   */
  stretch(name: string, along: number, direction: [number, number, number], across = 1) {
    const joint = this.joint(name);
    v.set(...direction).applyQuaternion(joint.restWorldInv);
    const axis = dominant(v);
    joint.bone.scale.copy(joint.restScale).multiplyScalar(across);
    joint.bone.scale[axis] = joint.restScale[axis] * along;
  }

  /**
   * Swing a joint about the character's up axis (degrees), outside its other turns, after
   * update: direct, and it may go round and round (an ear spinning like a propeller).
   */
  swing(name: string, yaw: number) {
    const joint = this.joint(name);
    qa.setFromAxisAngle(Y, yaw * DEG);
    qb.copy(joint.restWorldInv).multiply(qa).multiply(joint.restWorld);
    // rest · A · rest⁻¹ · (current)
    joint.bone.quaternion.premultiply(qc.copy(joint.rest).multiply(qb).multiply(qa.copy(joint.rest).invert()));
  }

  /** Offset a bone from its rest position, in character space (metres). Direct. */
  shift(name: string, x: number, y: number, z: number) {
    const joint = this.joint(name);
    const parent = joint.bone.parent;
    v.set(x, y, z);
    if (parent && (parent as Bone).isBone) v.applyQuaternion(this.joint(parent.name).restWorldInv);
    else if (parent && parent !== this.root)
      v.applyQuaternion(
        parent
          .getWorldQuaternion(qa)
          .premultiply(this.root.getWorldQuaternion(qb).invert())
          .invert(),
      );
    joint.bone.position.copy(joint.restPosition).add(v);
  }
}

export function sanitize(name: string) {
  return PropertyBinding.sanitizeNodeName(name);
}

function dominant(v: Vector3): 'x' | 'y' | 'z' {
  const ax = Math.abs(v.x);
  const ay = Math.abs(v.y);
  const az = Math.abs(v.z);
  return ax > ay && ax > az ? 'x' : ay > az ? 'y' : 'z';
}
