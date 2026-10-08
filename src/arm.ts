import { type Object3D, Vector3 } from 'three';
import type { Character } from './character';
import { type Grip, skinBox } from './props';

/**
 * One arm raised to hold a tool up beside the head, for any body with arms (tools.ts, the
 * `hand` hold): the shoulder turns the arm up and out, past the side of the head, the elbow
 * bends the rest of it straight up, and the tool's handle goes up out of the palm. Arms are
 * short and heads are big, so the arm stretches like a rubber hose to get the tool clear:
 * the elbow is drawn out along the upper arm (the skin between it and the shoulder lengthens
 * with it), and a body with one bone to an arm gets that bone longer.
 *
 * It is worked out once from the body as it was made: where the shoulder, the elbow and the
 * grip are at rest, and how wide and tall the head is. Everything is drawn from the rest
 * pose, so none of it depends on how the body is posed now.
 */

/** How far out of the vertical the forearm leans, in radians. */
const LEAN = 0.14;
/** The paddle's board: the width it is made, and how far its bottom is over its handle (m). */
const BOARD = 0.38;
const CLEAR = 0.15;

const angle = (v: Vector3) => Math.atan2(v.y, v.x);

export class RaisedArm {
  /** The arm's bones, shoulder first, down to the one the grip is on. */
  private chain: string[] = [];
  /** How the bones turn at full reach (degrees, roll about the front axis), per bone of chain. */
  private roll: number[] = [];
  /** How far the elbow is drawn out (m) along the upper arm, and which way; or how much the one
   * bone is lengthened. */
  private reach = 0;
  private along = new Vector3();
  private grow = 1;
  /** How big the tool is for this body's head (1 as it is made): what its head calls for. */
  readonly size: number;
  private k = 0;
  private end: Vector3;
  private shoulder: Vector3;
  private elbow: Vector3 | null;
  private side: 1 | -1;
  private half: number;
  private top: number;
  private middle: number;

  constructor(
    private c: Character,
    side: 1 | -1,
    grip: Grip,
  ) {
    const p = c.puppet;
    // The arm: from the grip's bone up through its parents that are part of the same arm.
    for (let b: Object3D | null = grip.bone; b; b = b.parent) {
      // (The bones' names have lost their dots: handL.)
      if (!p.has(b.name) || !new RegExp(`(arm|fore|hand).*${side === 1 ? 'L' : 'R'}$`).test(b.name)) break;
      this.chain.unshift(b.name);
    }
    const at = (bone: string) => new Vector3().setFromMatrixPosition(p.restMatrix(bone));
    this.end = new Vector3().copy(grip.at).applyMatrix4(p.restMatrix(grip.bone.name));
    this.shoulder = at(this.chain[0]);
    this.elbow = this.chain.length > 1 ? at(this.chain[1]) : null;
    this.side = side;
    const head = skinBox(c, 'head');
    this.half = head ? (head.max.x - head.min.x) / 2 : c.spec.width * 0.3;
    this.top = head ? head.max.y : c.spec.metres * 0.85;
    this.middle = head ? (head.max.x + head.min.x) / 2 : 0;
    // The tool made smaller for a head that is smaller than its board.
    this.size = Math.min(1, Math.max(0.35, (this.half * 2) / BOARD));
    this.fit(this.size);
  }

  /** The size the tool is fitted for now (1 as it is made): `size`, or bigger where the board
   * has to be big enough to read (tools.ts asks for that with `fit`). */
  scale = 1;

  /**
   * Work out the raise for a tool this size: where the grip goes (past the side of the head, the
   * board's foot above its top, the handle longer as the board is bigger) and how the bones turn
   * and stretch to put it there.
   */
  fit(s: number) {
    this.scale = s;
    const { end, shoulder, elbow, side } = this;
    const to = new Vector3(this.middle + side * (this.half + 0.1 * s), this.top + 0.03 * s - CLEAR * s, 0);
    to.y = Math.max(to.y, shoulder.y + 0.05);
    this.roll = [];
    this.reach = 0;
    this.grow = 1;
    if (elbow) {
      // The forearm straight up (leaning out a little): the elbow is that far below the grip.
      const up = end.clone().sub(elbow);
      const forearm = up.length();
      const target = to.clone().setY(to.y - forearm * Math.cos(LEAN)).setX(to.x - side * forearm * Math.sin(LEAN));
      const upper = elbow.clone().sub(shoulder);
      const want = target.clone().sub(shoulder);
      this.roll[0] = angle(want) - angle(upper);
      // The forearm turns the rest of the way, to stand up.
      this.roll[1] = Math.PI / 2 - side * LEAN - angle(up) - this.roll[0];
      this.reach = Math.max(0, want.length() - upper.length());
      this.along.copy(upper).normalize();
    } else {
      const arm = end.clone().sub(shoulder);
      const want = to.clone().sub(shoulder);
      this.roll[0] = angle(want) - angle(arm);
      this.grow = Math.max(1, want.length() / arm.length());
      this.along.copy(arm).normalize();
    }
    this.roll = this.roll.map((r) => (r * 180) / Math.PI);
    // Turn the short way round.
    this.roll = this.roll.map((r) => ((((r + 180) % 360) + 360) % 360) - 180);
  }

  /** Raise the arm (k 0..1), before the joints move. */
  pose(k: number) {
    this.k = k;
    this.chain.forEach((bone, i) => this.roll[i] && this.c.puppet.add(bone, 0, 0, this.roll[i] * k));
  }

  /** Stretch it, after the joints have moved (the skin is drawn from where the bones are):
   * called every frame while it holds, and once more with nothing raised, to put it right. */
  apply() {
    const p = this.c.puppet;
    const k = this.k;
    if (this.chain.length > 1) {
      const out = this.along.clone().multiplyScalar(this.reach * k);
      p.shift(this.chain[1], out.x, out.y, out.z);
    } else p.stretch(this.chain[0], 1 + (this.grow - 1) * k, [this.along.x, this.along.y, this.along.z], 1);
  }

  /** Put the stretch back to rest. */
  rest() {
    this.k = 0;
    this.apply();
  }
}
