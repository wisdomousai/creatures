import {
  Box3,
  CanvasTexture,
  Group,
  LinearMipmapLinearFilter,
  type BufferGeometry,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
  type PerspectiveCamera,
  SRGBColorSpace,
  type SkinnedMesh,
  Vector3,
} from 'three';
import { assets } from './assets';
import type { Door } from './box';
import {
  type Carried,
  type Character,
  clamp,
  type Env,
  type Frame,
  type Hold,
  loadModel,
  type Role,
} from './character';
import { CARDS } from './families';
import { dress, type FlameStyle, type LookName, type Outfit } from './looks';
import { type Grip, gripOf, gripOn, handy } from './props';
import { Puppet } from './puppet';
import { pixelRatio } from './stage';
import { ease, FixedSpring } from './swimmer';

/**
 * Tools the crew hold up, in the way each body holds things (blender/signs.py and
 * blender/tools.py make them). A tool is a model built about its grip, at its origin, facing
 * front like the crew. The grip is found on the character's own model (props.ts: a jaw's
 * tip, a hand's palm, the end of a leg) and the tool is put there every frame, once the
 * joints are posed, so it goes where the hand goes. Whoever holds one is asked to stand
 * still, facing us, in a pose that lifts it where it reads: both arms up for a placard, the
 * head up for one in the mouth, the legs hanging under an owl hovering over a bar.
 *
 * Not everyone holds everything. A tool is held by those whose card says so (Card.tools in
 * families.ts) and whose body has a grip for it. Signs are the exception: they come in
 * kinds, one for each way of holding one, and asking for a `sign` gets the kind that suits
 * the body: the placard, the picket, the hanger, a card for the small, and, for those with
 * nothing to hold it with, an easel to stand beside. Asking for a kind by its name
 * ('arrow', 'tag') gets that one, if they can.
 *
 *   const held = crew.holdUp('cat', 'sign', { label: 'Home', onPick: () => show('/') });
 *   held?.lead('left'); // off they go with it, and a promise for when they're out of sight
 *   held?.release(); // or it goes, and the cat gets on with her life
 *
 * A sign's face (the Board in its model) is painted with its label in every look. With an
 * `onPick` it is also a button in the page over the board, that wiggles when the pointer or
 * the keyboard comes to it.
 */

/** How a tool is held: the poses (Hold), and hung round the neck, or stood on the floor beside. */
export type Mount = Hold | 'neck' | 'floor';

export interface Tool {
  /** Its model, a file in the models folder (without .glb). */
  model: string;
  mount: Mount;
  /** The family it is one of (a sign, in many kinds). */
  family?: string;
  /** Held in both hands: where the two grips are across the tool, in its metres (x, left
   * then right). Its origin is between them unless it says. */
  grips?: [number, number];
  /** Moved from where it's held, in metres (x across, y up, z toward us). */
  nudge?: [number, number, number];
  /** Held tipped this far to the side, in degrees (+ toward the viewer's left): a telescope,
   * modelled upright, held pointing off. */
  roll?: number;
  /** Bones that ripple when it's held (a flag's cloth, a balloon's string, named `prefix` then
   * 0, 1, 2...): how far each turns, in degrees, and about which axis. */
  flutter?: { prefix: string; pitch?: number; yaw?: number; roll?: number };
  /** Held in a mouth or a beak, it stands off to one side of the face and tips out, so it
   * never covers it (and is made at least as wide as the head). */
  clear?: boolean;
  /** Modelled pointing this way (viewer's side); asked to point the other way it's mirrored. */
  points?: 'left' | 'right';
}

/**
 * The tools there are, by name. A new one is a line here, its model in the models folder and,
 * for those who should hold it, its name in their cards (families.ts). A tool with a face
 * (a material named Board) gets lettered.
 */
export const TOOLS: Record<string, Tool> = {
  // The signs: kinds of one family (see FAMILIES for which a body gets).
  placard: { model: 'tool-placard', mount: 'hands', family: 'sign', grips: [-0.231, 0.231] },
  picket: { model: 'tool-picket', mount: 'grip', family: 'sign', clear: true },
  hanger: { model: 'tool-hanger', mount: 'feet', family: 'sign' },
  card: { model: 'tool-card', mount: 'grip', family: 'sign', clear: true },
  paddle: { model: 'tool-paddle', mount: 'grip', family: 'sign', clear: true },
  arrow: { model: 'tool-arrow', mount: 'grip', family: 'sign', points: 'right', clear: true },
  // (Its right grip is as far from the left as signs.py says.)
  banner: { model: 'tool-banner', mount: 'hands', family: 'sign', grips: [0, 0.9] },
  tag: { model: 'tool-tag', mount: 'neck', family: 'sign', nudge: [0, 0, 0.2] },
  easel: { model: 'tool-easel', mount: 'floor', family: 'sign' },
  // The rest, held in whatever grip they carry by.
  magnifier: { model: 'tool-magnifier', mount: 'grip' },
  lantern: { model: 'tool-lantern', mount: 'grip' },
  map: { model: 'tool-map', mount: 'grip' },
  telescope: { model: 'tool-telescope', mount: 'grip', roll: 35 },
  flag: { model: 'tool-flag', mount: 'grip', flutter: { prefix: 'flag', yaw: 14 } },
  umbrella: { model: 'tool-umbrella', mount: 'grip' },
  balloon: { model: 'tool-balloon', mount: 'grip', flutter: { prefix: 'str', pitch: 9, roll: 9 } },
  megaphone: { model: 'tool-megaphone', mount: 'grip' },
};

/** Models no taller than this (metres) are small, and get the small things. */
const SMALL = 0.45;
/** How far a sign held in a mouth tips out, in radians. */
const TIP = 0.3;

/**
 * Families of tools: asking for one by its name gets the kind that suits the body, or null if
 * none does. The first that suits wins.
 */
const FAMILIES: Record<string, (c: Character) => string | null> = {
  sign: (c) => {
    const grip = !!gripOf(c);
    if (suits(c, 'feet')) return 'hanger';
    if (!grip) return suits(c, 'floor') ? 'easel' : null;
    if (c.spec.metres < SMALL) return 'card';
    return suits(c, 'hands') ? 'placard' : 'picket';
  },
};

/** What a flier that hovers can do (the owl's hoverAt()). */
interface Hoverer {
  hoverAt(x: number, y: number, n?: number): boolean;
  comeDown(): void;
  readonly onErrand: boolean;
}
const hovers = (c: Character): c is Character & Hoverer =>
  typeof (c as Partial<Hoverer>).hoverAt === 'function';

/** The two grips a tool in both hands is carried by, or the feet it hangs from. */
function pair(c: Character, mount: 'hands' | 'feet'): [Grip, Grip] | null {
  const [l, r] =
    mount === 'feet'
      ? [gripOn(c, 'leg.L', 'end'), gripOn(c, 'leg.R', 'end')]
      : [gripOn(c, 'hand.L', 'palm'), gripOn(c, 'hand.R', 'palm')];
  return l && r ? [l, r] : null;
}

/** Are their hands as far apart as a tool's grips (a banner's two poles)? They can't take one
 * wider than they can reach, however they stand. */
function spans(c: Character, tool: Tool) {
  const [l, r] = pair(c, 'hands') ?? [];
  const [a, b] = tool.grips ?? [];
  if (!l || !r || a === undefined || b === undefined) return false;
  c.model.updateWorldMatrix(true, true);
  const p = c.model.worldToLocal(l.bone.localToWorld(l.at.clone()));
  const q = c.model.worldToLocal(r.bone.localToWorld(r.at.clone()));
  return p.distanceTo(q) >= (b - a) * REACH;
}

/** How near a tool's grip span their hands must be (the share of it). */
const REACH = 0.8;

/** Has this body a way to hold something in this mount? */
function suits(c: Character, mount: Mount) {
  switch (mount) {
    case 'grip':
      return !!gripOf(c);
    case 'neck':
      return c.puppet.has('head');
    case 'floor':
      return c.edge === 'bottom' && !c.free && c.inBox;
    case 'feet':
      return c.holdsUp.includes('feet') && hovers(c) && !!pair(c, 'feet');
    case 'hands':
      return c.holdsUp.includes('hands') && !!pair(c, 'hands');
  }
}

/**
 * Which tool this is for c: the name itself, or for a family the kind that suits its body.
 * Null if c can't: not on its card, or no way to hold it. (A kind of a family can be asked
 * for by name, by anyone it suits.)
 */
export function toolFor(c: Character, name: string): string | null {
  const family = FAMILIES[name];
  if (family) return family(c);
  const tool = TOOLS[name];
  if (!tool || !suits(c, tool.mount)) return null;
  if (tool.grips && !spans(c, tool)) return null;
  return tool.family || CARDS[c.spec.model]?.tools?.includes(name) ? name : null;
}

/** Can c hold this up (a tool's name, or a family's)? */
export function canHold(c: Character, name: string) {
  return toolFor(c, name) !== null;
}

export interface HoldOptions {
  /** What a sign says: painted on its face, and read out by its button. */
  label?: string;
  /** The lettering's font family (a clean sans unless given). */
  font?: string;
  /** Called the moment the sign is picked: clicked, or Enter or Space on it. A sign with
   * one is a button in the page, over the board. */
  onPick?: () => void;
  /** Where the button goes in the page (the crew's hit layer unless given). */
  host?: HTMLElement;
  /** Which way an arrow points (as we see it). */
  point?: 'left' | 'right';
  /** Where a flier hovers to hold it, its feet there (viewport px; `n` out toward the
   * reader); a little up from where it is, unless given. */
  hover?: { x: number; y: number; n?: number };
  /** Where on the floor to stand and hold it (`s` along the front of the box, px; `depth`
   * back into it, 0..1): it walks there holding it, and stays. Else it holds it where it
   * is. */
  at?: { s: number; depth?: number };
}

/** What a page needs of its stage to put a button over a tool. */
export interface View {
  stage: { camera: PerspectiveCamera; width: number; height: number };
  /** The layer for buttons, if the options don't give one. */
  host: HTMLElement;
  frame: () => Frame;
}

/** A tool being held up. */
export interface Held {
  /** Which tool it came to be (a `sign` is a placard, a picket, a hanger...). */
  readonly tool: string;
  /** What its face says; set it to say something else. */
  label: string;
  /** Its button, if it has one to pick. */
  readonly button: HTMLButtonElement | null;
  /** Resolves true once the tool is in their hands, false if it never gets there. */
  readonly ready: Promise<boolean>;
  readonly released: boolean;
  /** Off they go with it, toward a side of the frame or out by a door (they walk, fly or
   * sink as they do), and the promise is kept when they're out of sight. */
  lead(toward: 'left' | 'right' | Door): Promise<void>;
  /** Let go: the tool goes, and they get on with their life. */
  release(): void;
}

/** The lettering: dark ink on paper. */
const PAPER = '#f4f4f1';
const INK = '#1c1c1b';
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
/** How much of the face the words may fill, how tall one line can be as a share of the face,
 * and the space between lines. */
const FILL = 0.88;
const BIGGEST = 0.62;
const LEADING = 1.12;
const MAX_SIDE = 2048;
const BUTTON = 'hold';

const holding = new WeakMap<Character, Holding>();

/**
 * Ask c to hold a tool up, in the way its body does it. Null if it can't (see canHold) or
 * isn't on stage. Crew.holdUp is this, on the stage the crew are on.
 */
export function holdUp(c: Character, name: string, options: HoldOptions, view: View): Held | null {
  // Still coming on: the handle is given now, and the tool comes out once they're here.
  if (c.state === 'entering' && (FAMILIES[name] || TOOLS[name])) return new Waiting(c, name, options, view);
  const tool = toolFor(c, name);
  if (!tool || c.state !== 'here' || c.anchored) return null;
  holding.get(c)?.release();
  const held = new Holding(c, tool, options, view);
  return held.begin() ? held : null;
}

/** A hold-up asked of someone still coming in: kept until they're on stage, then handed over to
 * the real one (and a no, if it turns out they can't). */
class Waiting implements Held {
  readonly ready: Promise<boolean>;
  private inner: Held | null = null;
  private gone = false;
  private text: string;
  private timer: ReturnType<typeof setInterval>;
  private settle!: (ok: boolean) => void;

  constructor(
    private c: Character,
    private name: string,
    private options: HoldOptions,
    private view: View,
  ) {
    this.text = options.label ?? '';
    this.ready = new Promise<boolean>((done) => (this.settle = done));
    this.timer = setInterval(() => this.check(), 50);
  }

  private check() {
    if (this.gone) return;
    const c = this.c;
    if (c.state === 'entering') return;
    clearInterval(this.timer);
    const inner = c.state === 'here' ? holdUp(c, this.name, { ...this.options, label: this.text }, this.view) : null;
    if (!inner) {
      this.gone = true;
      return this.settle(false);
    }
    this.inner = inner;
    void inner.ready.then(this.settle);
  }

  get tool() {
    return this.inner?.tool ?? this.name;
  }
  get label() {
    return this.inner?.label ?? this.text;
  }
  set label(label: string) {
    this.text = label;
    if (this.inner) this.inner.label = label;
  }
  get button() {
    return this.inner?.button ?? null;
  }
  get released() {
    return this.gone || !!this.inner?.released;
  }
  lead(toward: 'left' | 'right' | Door): Promise<void> {
    if (this.inner) return this.inner.lead(toward);
    return this.ready.then((ok) => (ok && this.inner ? this.inner.lead(toward) : undefined));
  }
  release() {
    if (this.inner) return this.inner.release();
    if (this.gone) return;
    this.gone = true;
    clearInterval(this.timer);
    this.settle(false);
  }
}

const v1 = new Vector3();
const v2 = new Vector3();
const v3 = new Vector3();

class Holding implements Held, Carried {
  readonly ready: Promise<boolean>;
  button: HTMLButtonElement | null = null;
  released = false;
  private def: Tool;
  private text: string;
  /** Turned and moved about its grip, with the tool's model in. */
  private root = new Group();
  private model: Object3D | null = null;
  /** A flag's cloth, a balloon's string: rippling bones. */
  private ripple: Puppet | null = null;
  private outfit: Outfit | null = null;
  private look: LookName;
  private flame?: FlameStyle;
  /** The face to letter, and the box it and the button cover, in the model's metres. */
  private board: { mesh: Mesh<BufferGeometry, MeshStandardMaterial>; w: number; h: number; bound: Box3 } | null =
    null;
  private box = new Box3();
  private face: CanvasTexture | null = null;
  private faceH = 0;
  /** Textures let go of, to dispose once the new one has been drawn (never one on screen). */
  private spent: CanvasTexture[] = [];
  private hovered = false;
  private t = 0;
  private px = 0;
  /** Popping in (0 away, 1 in hand); wiggling; lifting; swinging; and how fast it's carried. */
  private appear = new FixedSpring(4.5, 0.55);
  private wiggle = new FixedSpring(5, 0.22);
  private lift = new FixedSpring(5, 0.5);
  private swing = new FixedSpring(0.9, 0.12);
  private slide = 0;
  private last: number | null = null;
  private role: Role;
  private spot: { x: number; y: number; n: number } | null = null;
  private leading = false;
  private led: Promise<void> | null = null;
  private finish: () => void = () => {};
  private fading = false;
  private flipped = false;
  /** Which side of the face a mouth-held sign stands on: the one toward the page's middle. */
  private side = 1;
  private written = '';
  private done: (ok: boolean) => void = () => {};

  constructor(
    private c: Character,
    readonly tool: string,
    private opts: HoldOptions,
    private view: View,
  ) {
    this.def = TOOLS[tool];
    this.text = opts.label ?? '';
    this.look = c.lookName;
    this.ready = new Promise<boolean>((done) => (this.done = done));
    this.role = {
      face: 'happy',
      posture: 'stand',
      facing: 0,
      // Looking straight out of the screen, not at the mouse.
      look: () => c.eyePoint(this.view.frame()),
      pose: (t) => this.pose(t),
    };
  }

  get label() {
    return this.text;
  }
  set label(label: string) {
    if (label === this.text) return;
    this.text = label;
    this.button?.setAttribute('aria-label', label);
    this.letter();
  }

  /** Take the part and fetch the tool. False if it can't be done. */
  begin() {
    const c = this.c;
    holding.set(c, this);
    c.carried.add(this);
    c.direct(this.role);
    const mid = this.view.frame();
    const at = this.opts.at;
    this.side = (at?.s ?? c.s) < (mid.left + mid.right) / 2 ? 1 : -1;
    // Off to where it was asked to stand, or standing still where it is.
    if (!c.free && c.inBox) c.walkTo(at?.s ?? c.s, at?.depth ?? c.depth);
    if (this.def.mount === 'feet') {
      const f = this.view.frame();
      const at = c.free ?? c.foot(f);
      this.spot = this.opts.hover
        ? { n: 0, ...this.opts.hover }
        : { x: at.x, y: Math.min(at.y, f.bottom) - c.heightPx * 1.7, n: 0 };
      if (!(c as Character & Hoverer).hoverAt(this.spot.x, this.spot.y, this.spot.n)) {
        this.release();
        return false;
      }
    }
    loadModel(`${assets}${this.def.model}.glb`).then(
      (scene) => this.arrive(scene),
      () => {
        console.warn(`creatures: no tool model ${this.def.model}`);
        this.release();
      },
    );
    return true;
  }

  private arrive(scene: Object3D) {
    if (this.released) return;
    const c = this.c;
    this.model = scene;
    this.root.add(scene);
    this.root.visible = false;
    // Turned about its grip in the character's space; an easel is set on the floor beside
    // them (and so moves with them).
    (this.def.mount === 'floor' ? c.holder : c.pivot).add(this.root);
    this.flipped = !!this.def.points && (this.opts.point ?? this.def.points) !== this.def.points;
    scene.updateMatrixWorld(true);
    scene.traverse((o) => {
      const mesh = o as Mesh<BufferGeometry, MeshStandardMaterial>;
      if (!mesh.isMesh || mesh.material.name !== 'Board') return;
      // A skinned sign's own box is the one posed through its rig (the bare geometry's isn't
      // the size that's drawn).
      const skinned = mesh as unknown as SkinnedMesh;
      let bound: Box3;
      if (skinned.isSkinnedMesh) {
        skinned.computeBoundingBox();
        bound = skinned.boundingBox!;
      } else {
        mesh.geometry.computeBoundingBox();
        bound = mesh.geometry.boundingBox!;
      }
      const size = bound.getSize(v1);
      this.board = { mesh, w: size.x, h: size.y, bound };
    });
    this.box.setFromObject(scene);
    if (this.def.flutter) this.ripple = new Puppet(scene, { default: { f: 3.5, zeta: 0.35 } });
    if (this.board) this.letter(true);
    this.dress(this.look, this.flame);
    if (this.opts.onPick) this.makeButton();
    if (this.def.mount === 'feet') this.swing.kick(1.4);
    this.done(true);
  }

  dress(look: LookName, flame?: FlameStyle) {
    this.look = look;
    this.flame = flame;
    if (!this.model) return;
    this.outfit?.dispose();
    this.outfit = dress(this.model, look, {
      board: this.face ?? undefined,
      flame,
      model: this.def.model,
    });
    this.c.clip(this.outfit.materials);
  }

  // ---------- Lettering ----------

  /** Paint the label on a new texture, big enough for the board as it is on the screen. */
  private letter(first = false) {
    const b = this.board;
    if (!b) return;
    const need = b.h * this.c.px * pixelRatio() * 1.5;
    let h = 128;
    while (h < need && h < 1024) h *= 2;
    let w = Math.round(h * (b.w / b.h));
    if (w > MAX_SIDE) [w, h] = [MAX_SIDE, Math.round(MAX_SIDE * (b.h / b.w))];
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext('2d')!;
    g.fillStyle = PAPER;
    g.fillRect(0, 0, w, h);
    // A mirrored tool shows its face mirrored: draw it the other way round.
    if (this.flipped) {
      g.translate(w, 0);
      g.scale(-1, 1);
    }
    const family = this.opts.font ?? SANS;
    const { lines, size } = fit(g, this.text, family, w * FILL, h * FILL);
    g.font = `700 ${size}px ${family}`;
    g.fillStyle = INK;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    lines.forEach((line, i) =>
      g.fillText(line, w / 2, h / 2 + (i - (lines.length - 1) / 2) * size * LEADING + size * 0.04),
    );
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.anisotropy = 8;
    texture.flipY = false;
    // The old one stays up a frame more, while the new one is drawn.
    if (this.face) this.spent.push(this.face);
    this.face = texture;
    this.faceH = h;
    if (this.outfit) {
      const material = b.mesh.material;
      material.map = texture;
      material.color.set(0xffffff);
      material.needsUpdate = true;
    }
    // A font of the page's own may not be in yet: letter again when it is.
    if (this.opts.font && first)
      void document.fonts?.load(`700 32px ${family}`).then(() => this.letter());
  }

  // ---------- The button ----------

  private makeButton() {
    styleOnce();
    const b = document.createElement('button');
    b.type = 'button';
    b.className = BUTTON;
    b.hidden = true;
    b.style.cssText = 'position:fixed;left:0;top:0;transform-origin:0 0;';
    b.setAttribute('aria-label', this.text);
    b.addEventListener('click', () => {
      this.wiggle.kick(7);
      this.opts.onPick?.();
    });
    const over = (on: boolean) => () => {
      if (on && !this.hovered) {
        this.wiggle.kick(6);
        this.lift.kick(1.1);
      }
      this.hovered = on;
    };
    b.addEventListener('pointerenter', over(true));
    b.addEventListener('pointerleave', over(false));
    b.addEventListener('focus', over(true));
    b.addEventListener('blur', over(false));
    (this.opts.host ?? this.view.host).append(b);
    this.button = b;
  }

  /** Over the board, as it is on the screen now. */
  private place() {
    const b = this.button;
    if (!b) return;
    const shown = this.appear.y > 0.7 && !this.leading;
    if (b.hidden === shown) b.hidden = !shown;
    if (!shown) return;
    // The face's corners on the screen: along its width, and up its height.
    const [box, mesh] = this.board
      ? [this.board.bound, this.board.mesh as Object3D]
      : [this.box, this.model!];
    const { camera, width, height } = this.view.stage;
    const at = (x: number, y: number) => {
      mesh.localToWorld(v1.set(x, y, box.max.z));
      v1.project(camera);
      return [((v1.x + 1) / 2) * width, ((1 - v1.y) / 2) * height] as const;
    };
    const [x0, y0] = at(box.min.x, box.min.y);
    const [x1, y1] = at(box.max.x, box.min.y);
    const [x2, y2] = at(box.min.x, box.max.y);
    // (A mirrored tool has its left and right the other way round.)
    const flip = x1 < x0 ? -1 : 1;
    const w = Math.hypot(x1 - x0, y1 - y0);
    const h = Math.hypot(x2 - x0, y2 - y0);
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const angle = Math.atan2((y1 - y0) * flip, (x1 - x0) * flip);
    const pad = 3;
    const key = `${Math.round(cx * 2)} ${Math.round(cy * 2)} ${Math.round(w)} ${Math.round(h)} ${angle.toFixed(3)}`;
    if (key === this.written) return;
    this.written = key;
    b.style.width = `${w + pad * 2}px`;
    b.style.height = `${h + pad * 2}px`;
    b.style.transform = `translate(${cx - w / 2 - pad}px, ${cy - h / 2 - pad}px) rotate(${angle}rad)`;
  }

  // ---------- Each frame ----------

  /** Added to the pose before the joints move: what lifts the tool where it reads. */
  private pose(t: number) {
    const c = this.c;
    const mount = this.def.mount;
    const k = ease(t / 0.6);
    if (mount === 'hands' || mount === 'feet') c.holdPose(mount, k, t);
    else if (mount === 'grip') {
      if (c.holdsUp.includes('grip')) c.holdPose('grip', k, t);
      // The head up, with it in the mouth, where it can be read.
      else if (/jaw|mouth|head/.test(gripOf(c)?.bone.name ?? '') && c.puppet.has('head'))
        c.puppet.add('head', -16 * k);
    }
  }

  follow(dt: number, env: Env) {
    const c = this.c;
    if (this.released) return;
    if (c.state === 'gone') {
      if (c.role === this.role) c.role = null;
      return this.release();
    }
    // Given another part (or sent off by someone else): the tool goes.
    if (c.role !== this.role && !c.isHeld) return this.release();
    if (this.def.mount === 'feet' && !this.leading && !(c as Character & Hoverer).onErrand)
      return this.release();
    for (const old of this.spent.splice(0)) old.dispose();
    if (!this.model) return;
    this.t += dt;
    // A hanging tool shows once he's up at his spot.
    this.appear.update(dt, this.fading || !this.arrived() ? 0 : 1);
    this.wiggle.update(dt, 0);
    this.lift.update(dt, this.hovered ? 0.035 : 0);
    if (this.fading && this.appear.y < 0.02) return this.release();
    if (this.board && this.px !== c.px) {
      this.px = c.px;
      const need = this.board.h * c.px * pixelRatio() * 1.5;
      if ((need > this.faceH && this.faceH < 1024) || need * 4 <= this.faceH) this.letter();
    }
    const root = this.root;
    root.visible = this.appear.y > 0.01;
    if (!root.visible) return;
    const mount = this.def.mount;
    const s = this.appear.y * (this.flipped ? -1 : 1);
    c.holder.updateMatrixWorld(true);
    const model = c.model;
    if (mount === 'floor') {
      // Beside it, on the floor, on the side toward the middle of the page.
      const side = c.s < (env.frame.left + env.frame.right) / 2 ? 1 : -1;
      const size = clamp(c.spec.metres / 0.7, 0.45, 1.3);
      root.position.set(side * (c.spec.width / 2 + 0.3 * size), 0, 0.05);
      root.scale.set(s * size, this.appear.y * size, this.appear.y * size);
      root.updateMatrixWorld(true);
      return this.place();
    }
    const at = v1;
    let roll = ((this.def.roll ?? 0) * Math.PI) / 180;
    let size = 1;
    if (mount === 'hands' || mount === 'feet') {
      const [l, r] = pair(c, mount)!;
      const pl = this.in(l, v2);
      const pr = this.in(r, v3);
      at.copy(pl).add(pr).multiplyScalar(0.5);
      if (mount === 'hands') {
        roll = clamp(Math.atan2(pl.y - pr.y, pl.x - pr.x), -0.35, 0.35);
        // The middle between its grips (a banner's origin is its left grip).
        const g = this.def.grips;
        if (g) at.x -= (g[0] + g[1]) / 2;
      }
    } else if (mount === 'neck') {
      c.puppet.bone('head').localToWorld(at.set(0, 0, 0));
      model.worldToLocal(at);
      // The lanyard is cut for a person's neck, 1 m up; a short creature gets a short one.
      size = clamp(at.y * 1.3, 0.3, 1);
    } else {
      this.in(gripOf(c)!, at);
      if (mount === 'grip' && this.def.clear && this.board && !handy(c)) {
        // In the mouth: held at the corner of it, the rod tipped out, the board rising beside
        // and above the head, and big enough to read.
        const wide = Math.min(c.spec.width * 0.75, c.spec.metres * 0.5);
        size = clamp((1.5 * wide) / this.board.w, 1, 2);
        at.x += this.side * 0.42 * wide;
        roll -= this.side * TIP;
      }
    }
    const n = this.def.nudge;
    if (n) at.add(v2.set(n[0], n[1], n[2]));
    const o = mount === 'hands' || mount === 'feet' || mount === 'grip' ? c.holdOffset[mount] : null;
    if (o) at.add(v2.set(o[0], o[1], o[2]));
    // How fast the grip is carried across the screen, to swing a hanging tool.
    if (mount === 'feet' || mount === 'neck') {
      model.localToWorld(v2.copy(at));
      if (this.last !== null && dt > 0)
        this.slide += ((v2.x - this.last) / dt - this.slide) * Math.min(1, dt * 8);
      this.last = v2.x;
      const lean = clamp(-this.slide / (c.heightPx * 5), -0.4, 0.4) + 0.03 * Math.sin(this.t * 1.7);
      roll = this.swing.update(dt, mount === 'feet' ? lean : lean * 0.5) - c.pivot.rotation.z;
    } else roll += 0.012 * Math.sin(this.t * 2.4);
    at.y += this.lift.y;
    root.position.copy(at.applyMatrix4(model.matrix));
    root.rotation.z = roll + this.wiggle.y;
    root.scale.set(s * size, this.appear.y * size, this.appear.y * size);
    this.flutter(dt);
    root.updateMatrixWorld(true);
    this.place();
  }

  private flutter(dt: number) {
    const f = this.def.flutter;
    if (!f || !this.ripple) return;
    const p = this.ripple;
    p.begin();
    for (let i = 0; p.has(`${f.prefix}${i}`); i++) {
      const w = Math.sin(this.t * 4.2 - i * 0.9) * (0.5 + 0.25 * i);
      p.add(`${f.prefix}${i}`, (f.pitch ?? 0) * w, (f.yaw ?? 0) * w, (f.roll ?? 0) * Math.cos(this.t * 3.1 - i));
    }
    p.update(dt);
  }

  /** A grip's place in the character's model space. */
  private in(g: Grip, out: Vector3) {
    g.bone.localToWorld(out.copy(g.at));
    return this.c.model.worldToLocal(out);
  }

  /** Is it where it should be to show (a flier hovering over its spot)? */
  private arrived() {
    if (this.def.mount !== 'feet') return true;
    const free = this.c.free;
    const spot = this.spot;
    return !!free && !!spot && Math.hypot(free.x - spot.x, free.y - spot.y) < this.c.heightPx * 0.6;
  }

  // ---------- Going off, and letting go ----------

  lead(toward: 'left' | 'right' | Door) {
    if (this.led) return this.led;
    const c = this.c;
    if (this.released) return Promise.resolve();
    // No more picking; it goes (it isn't asked to face us now), and an easel is left behind.
    this.leading = true;
    this.button?.remove();
    this.button = null;
    this.role.facing = undefined;
    this.role.hurry = 1.4;
    if (this.def.mount === 'floor') this.fading = true;
    c.leaveToward(toward);
    return (this.led = new Promise<void>((done) => {
      this.finish = done;
      const timer = setInterval(() => {
        if (c.state === 'gone' || this.released) {
          clearInterval(timer);
          this.release();
        }
      }, 100);
    }));
  }

  release() {
    if (this.released) return;
    this.released = true;
    const c = this.c;
    c.carried.delete(this);
    if (holding.get(c) === this) holding.delete(c);
    if (c.role === this.role) {
      if (c.state === 'here') c.release();
      else c.role = null;
    }
    if (this.def.mount === 'feet' && c.state === 'here') (c as Character & Hoverer).comeDown();
    this.button?.remove();
    this.button = null;
    this.root.removeFromParent();
    this.outfit?.dispose();
    this.face?.dispose();
    for (const old of this.spent) old.dispose();
    this.model?.traverse((o) => (o as SkinnedMesh).isSkinnedMesh && (o as SkinnedMesh).skeleton.dispose());
    this.done(false);
    this.finish();
  }
}

/** The words broken into lines, and the biggest letters that fit them in w by h. */
function fit(g: CanvasRenderingContext2D, text: string, family: string, w: number, h: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const wrap = (size: number) => {
    g.font = `700 ${size}px ${family}`;
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && g.measureText(next).width > w) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  };
  const fits = (size: number) => {
    const lines = wrap(size);
    return lines.length * size * LEADING <= h && lines.every((l) => g.measureText(l).width <= w);
  };
  let lo = 4;
  let hi = Math.max(lo, Math.floor(h * BIGGEST));
  if (fits(hi)) lo = hi;
  else
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (fits(mid)) lo = mid;
      else hi = mid;
    }
  return { lines: wrap(lo), size: lo };
}

let styled = false;
/** The button's look, under any the page has for `hold` (:where): clear, with a ring when the
 * keyboard is on it. */
function styleOnce() {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  const sheet = document.createElement('style');
  sheet.textContent = `
:where(.${BUTTON}) {
  margin: 0; padding: 0; border: 0; border-radius: 10px; background: transparent; color: inherit;
  cursor: pointer; -webkit-tap-highlight-color: transparent;
}
:where(.${BUTTON}:focus-visible) { outline: 2px solid var(--ink, #111); outline-offset: 3px; }`;
  document.head.prepend(sheet);
}
