import {
  CanvasTexture,
  Group,
  type Material,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  Plane,
  PlaneGeometry,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { type Expression, Face, type FaceLayout } from './face';
import { depthScale, type Door, type DoorKind, floorDepth, horizon, project } from './box';
import { dress, type FlameStyle, glowColour, type LookName, type Outfit } from './looks';
import { type Feel, Puppet } from './puppet';
import { Spring, wobble } from './spring';

/**
 * A member of the crew: a rigged model that lives on the window frame. It comes on
 * stage (rising from behind the frame line, or walking in), keeps busy with its own
 * little acts, turns its eyes and then its head and body toward the mouse after a
 * beat, and leaves again. Subclasses only say how their joints move.
 *
 * Positions are viewport pixels. A crew member stands on one edge of the frame, feet
 * on the frame line, rotated so its head points into the window: upside down on the
 * top edge, sideways on the left and right.
 */
export type Edge = 'bottom' | 'top' | 'left' | 'right';

/** The frame line's rectangle in viewport px, plus the band inside it and --bot. */
export interface Frame {
  left: number;
  top: number;
  right: number;
  bottom: number;
  band: number;
  bot: number;
  /** How deep the box's floor looks: px from the front lip up to the back wall. */
  depth: number;
  /** How far back anything in the room goes (0..1), if not to the back wall: up to the
   * monitor standing at the back, never behind it. Only a door takes anyone further. */
  back?: number;
  /**
   * Laid flat, as a floor in a three.js world, not drawn on a page in perspective: nothing
   * shrinks going back, the floor is `depth` px deep, and the crew are placed that far back
   * along -z (a Lane's frame: lane.ts). Nothing is clipped at its edges, and the shadow
   * lies on the floor.
   */
  flat?: boolean;
}

export interface Env {
  frame: Frame;
  /** The mouse in viewport px; `at` is when it last moved (seconds). */
  pointer: {
    x: number;
    y: number;
    at: number;
    present: boolean;
    /** How far in front of the frame's front edge it is (px), when it's someone looking on
     * in a world (a Lane's viewer). Unset, the mouse is imagined a little in front of the
     * page. */
    z?: number;
  };
  time: number;
  crew: readonly Character[];
  /** Things on the floor the crew walk round (props.ts): a crate, a cushion. */
  props?: readonly Body[];
  /** Something happening that everyone looks at for a moment (viewport px), from `at`. */
  show?: { x: number; y: number; at: number };
  /** What a flier let go over can come down onto: the monitor's top, the set pieces'. */
  tops?: readonly Top[];
}

/** The top of something a flier can stand on: what it's the top of (the same from frame to
 * frame), across the front of the box (s0..s1, px), how far back (0..1), and how high it is
 * there (px at the front of the box, as `standOn`). */
export interface Top {
  key: object;
  s0: number;
  s1: number;
  depth: number;
  h: number;
  /** Where its middle is along the front (px), if it moves (a swing's seat): whoever
   * stands on it goes along with it. */
  at?: number;
}

/** Anything that takes up room on the floor: a crew member, or a prop in the way. */
export interface Body {
  floorPoint(frame: Frame): { x: number; z: number };
  footprint(frame: Frame): { x: number; z: number };
  /** How fast it is going (px/s), and how long it has been here (s). */
  readonly stride: number;
  readonly t: number;
  /** Is it in this one's way? */
  blocks?(c: Character): boolean;
}

/**
 * What a director (play.ts) has it doing, for a while: it stays, picks no acts of its
 * own, and walks where it's sent. The director changes these as the scene goes on.
 */
export interface Role {
  /** Added to its pose each frame, with the seconds since the role began. */
  pose?: (t: number, dt: number) => void;
  face?: Expression;
  /** A pet's mood (pet.ts). */
  mood?: string;
  posture?: 'stand' | 'sit' | 'lie';
  /** Walks this many times its usual speed. */
  hurry?: number;
  /** Which way it faces standing still (its heading, degrees; + toward +s). */
  facing?: number;
  /** What it looks at, in viewport px, instead of the mouse. */
  look?: () => { x: number; y: number } | null;
  /** Its acts (a poke's, a trick) run their length and end, as on its own; else one begun
   * under direction lasts till it's told otherwise. */
  ending?: boolean;
}

/** How a tool is held up (tools.ts): in both hands, in one hand raised high (a paw, a mitt),
 * in the one grip it carries by (a mouth or a hand), or by the feet, hanging. */
export type Hold = 'hands' | 'hand' | 'grip' | 'feet';

/**
 * Something it holds (tools.ts): dressed with it, and put into its hands (or mouth, or feet)
 * each frame once the joints are posed and it has been placed.
 */
export interface Carried {
  dress(look: LookName, flame?: FlameStyle): void;
  follow(dt: number, env: Env): void;
}

export interface Act {
  weight: number;
  /** Seconds, picked at random between the two. */
  length: [number, number];
  face?: Expression;
  /** Only picked while this holds. */
  when?: () => boolean;
  start?: () => void;
  /** Called every frame of the act with seconds since it started. */
  pose?: (t: number) => void;
}

export interface Spec {
  name: string;
  model: string;
  /** Model height and width in metres (the Blender units). */
  metres: number;
  width: number;
  /** On-screen height, in --bot units (the band's width). */
  size: number;
  feels: Record<string, Feel> & { default: Feel };
  face?: FaceLayout;
  /** Eye height as a fraction of the model height: where it looks from. */
  eyes: number;
  /** Joints that turn toward the mouse, each with its share of the turn. */
  gaze: { bone: string; yaw: number; pitch: number }[];
  /** Largest turn toward the mouse, in degrees. */
  reach: { yaw: number; pitch: number };
  /** How slowly the gaze follows, in Hz (lower is lazier). */
  lag: number;
  entrance: 'rise' | 'walk' | 'fly';
  edges: Edge[];
  /** Seconds on stage, picked at random between the two. */
  stay: [number, number];
  /** Walking speed in --bot per second, for those that walk. */
  speed?: number;
  /** How far it turns toward the way it's walking, in degrees (80 unless set). */
  turn?: number;
  /**
   * Wanders in and out of the box as it walks about the floor (or the ceiling). Everyone
   * on the floor does unless this says not.
   */
  roam?: boolean;
  /** Walks round the others rather than into them (unless this says not: the vacuum). */
  steers?: boolean;
}

/** How far each edge turns a character, radians (its feet toward the edge). */
export const ANGLE: Record<Edge, number> = {
  bottom: 0,
  top: Math.PI,
  left: -Math.PI / 2,
  right: Math.PI / 2,
};
/** Which way the character faces (its heading) to walk toward +s along each edge. */
const FORWARD: Record<Edge, number> = { bottom: 1, top: -1, left: 1, right: -1 };
const DEG = 180 / Math.PI;
/** A held flier's spring is stepped this often (s). */
const FLY_STEP = 1 / 120;
/** How far into the box the floor dwellers stand by default (0 front, 1 back wall). */
const HOME = 0.2;
/** Room each keeps round itself, beyond its own footprint, in --bot. */
const ELBOW = 0.15;
/**
 * The jam protocol (unjam): in the room of one who was here first (or is directed) this long
 * (s), it goes off to wherever there's room on the floor, passing through the crowd for up to
 * SLIP s to get there; jammed this long in all, there's no room for it, and it leaves.
 */
const JAM = 1.2;
const SLIP = 4;
const JAM_OUT = 9;

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const models = new Map<string, Promise<Object3D>>();

/** A fresh copy of a model; each file is fetched once. */
export function loadModel(url: string): Promise<Object3D> {
  let scene = models.get(url);
  if (!scene) models.set(url, (scene = loader.loadAsync(url).then((gltf) => gltf.scene)));
  return scene.then((s) => clone(s));
}

export abstract class Character {
  /**
   * Words to find it by in a search, besides its name and what it is: what else it's
   * called, its colours (in the colour look), how it looks, and how it gets about and what
   * it does. Lower case, a space between each. On the class, so a page can search the crew
   * before any of their models are loaded (ROSTER has them too).
   */
  static readonly terms: string = '';
  readonly spec: Spec;
  /** On the frame: placed, rotated to the edge and scaled to pixels. */
  readonly holder = new Group();
  /** Inside the holder, for leaning about the middle of the body. */
  readonly pivot = new Group();
  readonly model: Object3D;
  readonly puppet: Puppet;
  readonly face?: Face;
  outfit!: Outfit;

  edge: Edge = 'bottom';
  /** Along the edge (viewport x on top and bottom, y on the sides) and off it, in px. */
  s = 0;
  h = 0;
  /** Free flight instead of an edge (Bolt): viewport position of the feet, and lean. */
  free: { x: number; y: number; tilt: number } | null = null;
  /** In free flight, out of the box toward the reader by this much (world px): the owl
   * at the book, which is held in front of the room. */
  forth = 0;
  state: 'entering' | 'here' | 'leaving' | 'gone' = 'gone';
  /** Seconds since it came on stage. */
  t = 0;
  act = 'idle';
  actT = 0;
  expression: Expression = 'neutral';
  hovered = false;
  /** How far back into the box on the bottom edge: 0 at the front lip, 1 at the back. */
  depth = 0;
  protected depthGoal = 0;
  /** Pixels per metre, and the on-screen height. */
  px = 1;
  heightPx = 1;

  protected acts: Record<string, Act> = {};
  protected actLength = 0;
  protected rise = new Spring(1.3, 0.6, 0);
  protected heading = new Spring(1.4, 0.75);
  protected goal: number | null = null;
  protected gait = 0;
  /** Walking speed along the edge (signed, px/s) and into the box (px/s, + is back). */
  protected pace = 0;
  protected vz = 0;
  /** Which way it is going round each crewmate in its way (see steer). */
  private passing = new Map<Body, number>();
  /** Seconds it has been trying to walk and getting nowhere. */
  private stuck = 0;
  /** Seconds it has been in another's room (see unjam), and left passing through the others. */
  private jam = 0;
  private slip = 0;
  /** Till it looks for room again, having found none (s). */
  private retry = 0;
  /** Coming up from below the front lip this time, though it walks (enter). */
  private upFromBelow = false;
  private get walksIn() {
    return this.spec.entrance === 'walk' && !this.upFromBelow;
  }
  /** Times it's been kept out walking in (or out), and gone round to the other end; and
   * how long it's been walking in, or out, this time (s). */
  private turnedBack = 0;
  private onTheWay = 0;
  protected stay = 0;
  /** Can it jump out of its picture on the glass (jumpOut)? Not the fliers and swimmers:
   * they come their own way. */
  readonly jumpsOut: boolean = true;
  /** Can it fly (or swim through the air)? Held, it flies after the pointer; else it walks. */
  readonly flies: boolean = false;
  /** Held by the pointer (pressed on and kept down): where that is (viewport px), and where
   * its feet were from it when it was taken hold of (so it doesn't jump to it). On a frame
   * laid flat in a world, how far back too (as depth is, and off the floor's either side). */
  private taken: {
    x: number;
    y: number;
    dx: number;
    dy: number;
    depth: number;
    dd: number;
  } | null = null;
  /** Its part while it's held (if it had one), to go back to; taken up into the air (not
   * flying of its own), so it comes down when it's let go; and how fast it's flying after
   * the pointer (px/s at the front of the box). */
  private takenRole: Role | null = null;
  private aloft = false;
  private takenV = { x: 0, y: 0 };
  /** Jumping out of the glass: from where, to where, and how far through (s). */
  private fromGlass: {
    from: { s: number; h: number; depth: number };
    to: { s: number; depth: number };
    t: number;
  } | null = null;
  /** How high the jump has it off the floor (px at the front), on top of its own h. */
  private glassLift = 0;
  protected leaveBy: 'rise' | 'walk' | 'fly' | 'door' = 'rise';
  /** The box's doors (the crew hands them over), and the one it is using, if any. */
  doors: readonly Door[] = [];
  door: Door | null = null;
  private doorWay: 'in' | 'out' = 'in';
  private doorStep: 'wait' | 'go' | 'through' = 'wait';
  private doorTime = 0;
  /** Which doors it may come in by (all, unless a subclass says), and whether it leaves by one. */
  doorKinds: readonly DoorKind[] | null = null;
  protected leavesByDoor = true;
  /** Which side it leaves toward when it walks off, if it was told (leaveToward). */
  protected leaveSide: 'left' | 'right' | null = null;
  /** Given a part to play (play.ts), and for how long. */
  role: Role | null = null;
  /** What it holds up (tools.ts). */
  readonly carried = new Set<Carried>();
  /** Holding something up for the scene (Bolt the phone): it can't be taken hold of, and
   * goes only when it's told which door (leave(door)), not when it's sent out. */
  anchored = false;
  private roleT = 0;
  /** The height of what it stands on (a cushion), px at the front of the box. */
  standOn = 0;
  /** What it's standing on top of, let go over it (a Top's key), and the tops there are. */
  private onTop: object | null = null;
  private topAt: number | null = null;
  /** Let go in the air: it hangs there flapping for a while (`len` s), then goes on. */
  protected hovering: { t: number; len: number; tx: number } | null = null;
  private topsHere: readonly Top[] = [];
  private perch = new Spring(2.2, 0.8);
  /** Up on something for a while (a nook in a case), or settled in a place of its own (the
   * library's company): it and those on the floor keep out of each other's reckoning (they
   * go by in front of it, or behind). */
  perched = false;
  /** A hop up onto something, or down off it, under way. */
  private onto: {
    from: { s: number; depth: number; h: number };
    to: { s: number; depth: number; h: number };
    t: number;
    time: number;
    arc: number;
  } | null = null;
  private gazeYaw: Spring;
  private gazePitch: Spring;
  private eyeX = new Spring(3, 0.8);
  private eyeY = new Spring(3, 0.8);
  private wanderSeed = Math.random() * 100;
  /** Clipping: at the frame line, at the side it walks in from, and a doorway's edges. */
  private planes = Array.from({ length: 5 }, () => new Plane(new Vector3(0, 1, 0), 1e6));
  /** Its shadow on the floor, and how much smaller it is for being further back. */
  private shadow: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private far = 1;
  protected floorFrame: Frame | null = null;
  /** Turns off clipping at the frame line (to sit with legs over it, say). */
  protected unclipped = false;
  private look: LookName = 'ink';
  /** Its soft shadow card on the floor: off where the scene's own lights cast it a real
   * shadow (Roam's `castShadows`). */
  shadowCard = true;

  constructor(spec: Spec, model: Object3D) {
    this.spec = spec;
    this.model = model;
    this.pivot.add(model);
    this.holder.add(this.pivot);
    this.holder.visible = false;
    this.puppet = new Puppet(model, spec.feels);
    if (spec.face) this.face = new Face('#f4f4f1', spec.face);
    this.gazeYaw = new Spring(spec.lag, 0.8);
    this.gazePitch = new Spring(spec.lag, 0.8);
    // Lean about the middle of the body rather than the feet.
    this.pivot.position.y = spec.metres * 0.45;
    model.position.y = -spec.metres * 0.45;
    this.shadow = new Mesh(
      new PlaneGeometry(1, 1),
      new MeshBasicMaterial({
        map: shadowTexture(),
        color: 0x000000,
        transparent: true,
        depthWrite: false,
        clippingPlanes: this.planes,
      }),
    );
    this.shadow.renderOrder = -1;
    this.holder.add(this.shadow);
  }

  dress(look: LookName, flame?: FlameStyle) {
    this.outfit?.dispose();
    this.look = look;
    this.outfit = dress(this.model, look, {
      screen: this.face?.texture,
      flame,
      model: this.spec.model,
    });
    for (const m of this.outfit.materials) m.clippingPlanes = this.planes;
    this.face?.setGlow(glowColour.value ?? '#f4f4f1');
    for (const held of this.carried) held.dress(look, flame);
  }

  get lookName() {
    return this.look;
  }

  /** Clip what it holds as it is clipped itself: at the frame line, at a doorway. */
  clip(materials: Iterable<Material>) {
    for (const m of materials) m.clippingPlanes = this.planes;
  }

  /** The ways it has of holding something up, each with a pose of its own in holdPose(). */
  readonly holdsUp: readonly Hold[] = [];
  /**
   * Where the tool's grip goes on its body for each way of holding, a point on a bone: a pair,
   * left then right, for `hand` (the one raised: the left if the sign is to stand on its left,
   * see holdSide), `hands` and `feet`. Each says its bone and, if the skin's guess isn't good,
   * a place on the model as it was made (metres: x across, y up, z toward us), kept on its
   * bone; with no place it is the far end of the bone (a paw's, a hand's), found from its
   * skin. A body with none has the guess of props.ts (a hand's palm or the end of its arm, an
   * owl's talons).
   */
  readonly holdGrips: Partial<Record<Hold, [bone: string, at?: [number, number, number]][]>> = {};
  /** Which side of itself it raises a hand to hold something up (1 its left, -1 its right),
   * the side toward the middle of the page: set when it is asked. */
  holdSide: 1 | -1 = 1;
  /** The one hand it always raises, when the other has something of its own in it (a trowel). */
  readonly holdWith?: 1 | -1;
  /** Where a tool sits from its grip when it holds it up this way, in metres (across, up,
   * toward us): a family whose arms are short holds a board low and in front of its face. */
  readonly holdOffset: Partial<Record<Hold, [number, number, number]>> = {};

  /**
   * Raise its arms, or let its legs hang, to hold something up (`hold`; one of holdsUp), with
   * `k` how far it has got (0 to 1) and `t` seconds since it began. Added to its pose, so it
   * does this where it stands. A family with its own way says so in holdsUp; the rest are
   * posed by their grip (tools.ts), a head lifted for a mouth.
   */
  holdPose(_hold: Hold, _k: number, _t: number) {}

  // ---------- Coming and going ----------

  /** Come on stage at s along an edge (walking in, from either end of it, or that one; or
   * up from below the front lip there, though it walks). */
  enter(frame: Frame, edge: Edge, s: number, from?: 'start' | 'end' | 'below', depth?: number) {
    this.edge = edge;
    this.leaveSide = null;
    this.state = 'entering';
    this.t = 0;
    this.stay = rand(this.spec.stay);
    this.holder.visible = true;
    this.heading.snap(0);
    this.setAct('idle');
    this.scale(frame);
    this.turnedBack = 0;
    this.upFromBelow = from === 'below';
    if (this.walksIn) {
      const fromStart = from ? from === 'start' : Math.random() < 0.5;
      const [lo, hi] = this.span(frame);
      this.s = fromStart ? lo - this.widthPx() : hi + this.widthPx();
      this.h = 0;
      this.rise.snap(1);
      this.goal = s;
    } else {
      this.s = s;
      this.goal = null;
      this.rise.snap(0);
    }
    // In at the front, stepping back to its place just inside the box as it comes (or to
    // `depth`).
    this.depth = 0;
    this.depthGoal = depth ?? this.home;
    this.onEnter();
  }

  /** Come on stage through one of the box's doors: it opens, out it comes, it shuts. */
  enterBy(frame: Frame, door: Door) {
    this.enter(frame, door.edge, door.x);
    const { inside } = door.spots(this.footprint(frame));
    this.door = door;
    door.user = this;
    door.want = 1;
    this.doorWay = 'in';
    this.doorStep = 'wait';
    this.doorTime = 0;
    this.s = inside.s;
    this.depth = this.depthGoal = inside.depth;
    this.goal = null;
    this.h = 0;
    this.rise.snap(door.kind === 'floor' || door.kind === 'ceiling' ? 0 : 1);
  }

  /**
   * Come on stage by jumping out of its picture on the monitor's glass (the Creatures
   * page): its feet at `at` (viewport px) on the glass `depth` back in the box, a beat
   * there, then an arc forward and down to the floor at s, `to` of the way back.
   */
  jumpOut(frame: Frame, at: { x: number; y: number }, depth: number, s: number, to: number) {
    this.enter(frame, 'bottom', s);
    // Where that point on the glass would be at the front of the box.
    const k = depthScale(frame, depth);
    const vx = (frame.left + frame.right) / 2;
    const vy = horizon(frame);
    const front = { x: vx + (at.x - vx) / k, h: frame.bottom - (vy + (at.y - vy) / k) };
    this.fromGlass = { from: { s: front.x, h: front.h, depth }, to: { s, depth: to }, t: 0 };
    this.rise.snap(1);
    this.goal = null;
    this.s = front.x;
    this.glassLift = front.h;
    this.depth = this.depthGoal = depth;
  }

  /** A step of the jump: a beat on the glass, the arc, the landing. */
  private outOfGlass(dt: number) {
    const j = this.fromGlass!;
    j.t += dt;
    const BEAT = 0.25;
    const AIR = 0.75;
    const u = clamp((j.t - BEAT) / AIR, 0, 1);
    // Down from the glass's height to the floor, and up and over on the way: an arc of
    // about its own height, done four fifths of the way.
    const arc = this.heightPx * 0.9 * Math.sin(Math.PI * Math.min(u * 1.25, 1));
    this.s = j.from.s + (j.to.s - j.from.s) * u;
    this.depth = this.depthGoal = j.from.depth + (j.to.depth - j.from.depth) * u;
    this.glassLift = j.from.h * (1 - u) + (u < 0.8 ? arc : 0) * (1 - u * 0.2);
    this.goal = null;
    this.pace = this.vz = 0;
    if (u < 1) return;
    this.fromGlass = null;
    this.glassLift = 0;
    // A little bounce as it lands, and on with its life.
    this.hopUp(0.12);
    this.arrived();
  }

  /** Off it goes, its usual way (now and then by a door); or `'rise'`: to the front where it
   * is and down below the lip (a crowded room's quickest way out of sight); or out by that
   * door. */
  leave(by?: 'rise' | Door) {
    if (this.state === 'leaving' || this.state === 'gone') return;
    if (this.anchored && (!by || by === 'rise')) return;
    this.state = 'leaving';
    this.leaveBy = by === 'rise' ? 'rise' : this.spec.entrance;
    this.depthGoal = 0;
    const door = by === 'rise' ? null : (by ?? (this.leaveSide ? null : this.exitDoor()));
    if (door) {
      this.door = door;
      door.user = this;
      this.doorWay = 'out';
      this.doorStep = 'wait';
      this.doorTime = 0;
      this.leaveBy = 'door';
    }
    this.onLeave();
  }

  /** Is it going out at the start of the edge (the left, on the floor)? Where it was told, else
   * the nearer end. */
  private startSide(lo: number, hi: number) {
    if (this.state === 'leaving' && this.leaveSide && (this.edge === 'bottom' || this.edge === 'top'))
      return this.leaveSide === 'left';
    return this.s - lo < hi - this.s;
  }

  /** Off it goes toward a side of the frame (walking, flying, or sinking if that's how it
   * leaves), or out by that door; the scene it's in has it gone when it's out of sight. */
  leaveToward(to: 'left' | 'right' | Door) {
    this.leaveSide = typeof to === 'string' ? to : null;
    this.leave(typeof to === 'string' ? undefined : to);
  }

  /** Now and then it goes out by the nearest free door on its floor (or ceiling). */
  private exitDoor(): Door | null {
    if (!this.inBox || !this.leavesByDoor || !this.floorFrame || Math.random() > 0.55) return null;
    const frame = this.floorFrame;
    const here = this.floorPoint(frame);
    const deep = floorDepth(frame);
    let best: Door | null = null;
    let bestD = Infinity;
    for (const d of this.doors) {
      if (d.user || d.edge !== this.edge) continue;
      const out = d.spots(this.footprint(frame)).outside;
      const dist = Math.hypot(out.s - here.x, out.depth * deep - here.z);
      if (dist < bestD) [best, bestD] = [d, dist];
    }
    return best;
  }

  /**
   * Coming in: wait for the door to open, then walk out of it (or rise up through the
   * trapdoor) and let it shut. Going out: walk to it, wait for it to open, go through,
   * and it shuts behind. Returns where the rise spring should head, for trapdoors.
   */
  private useDoor(dt: number, frame: Frame): number {
    const door = this.door!;
    const hatch = door.kind === 'floor' || door.kind === 'ceiling';
    const { inside, outside } = door.spots(this.footprint(frame));
    const open = door.open > 0.85;
    const deep = floorDepth(frame);
    const at = (p: { s: number; depth: number }) =>
      Math.abs(this.s - p.s) < 1.5 && Math.abs(this.depth - p.depth) * deep < 1.5;
    this.doorTime += dt;
    const done = () => {
      door.want = 0;
      door.user = null;
      this.door = null;
    };
    if (this.doorWay === 'in') {
      if (hatch) {
        if (open && this.rise.y > 0.97) {
          done();
          this.arrived();
        }
        return open ? 1 : 0;
      }
      if (open && this.doorStep === 'wait') {
        this.doorStep = 'go';
        this.goal = outside.s;
        this.depthGoal = outside.depth;
      }
      // (Nudged aside on the way by someone about: in all the same, once it's out of the
      // doorway into the room.)
      const clear = this.depth <= outside.depth + 2 / deep && this.doorTime > 3;
      if (this.doorStep === 'go' && (at(outside) || clear)) {
        done();
        this.goal = null;
        this.arrived();
      }
      return 1;
    }
    // Going out.
    if (this.doorStep === 'wait') {
      if (this.goal === null && at(outside)) {
        door.want = 1;
        if (open) {
          this.doorStep = 'through';
          this.doorTime = 0;
          if (!hatch) {
            this.goal = inside.s;
            this.depthGoal = inside.depth;
          }
        }
      } else {
        this.goal = outside.s;
        this.depthGoal = outside.depth;
        // Hemmed in on the way: go the usual way instead.
        if (this.doorTime > 12) {
          done();
          this.leaveBy = this.spec.entrance;
          this.depthGoal = 0;
        }
      }
      return 1;
    }
    if (hatch) {
      if (this.rise.y < 0.01) {
        done();
        this.gone();
      }
      return -0.05;
    }
    // Through (or held up in the doorway a while, out of sight all but: gone all the same).
    if (at(inside) || this.doorTime > 6) {
      done();
      this.gone();
    }
    return 1;
  }

  /** Is it in a doorway (so only what is inside the doorway shows)? */
  private get inDoorway() {
    return this.door !== null && (this.doorWay === 'in' || this.doorStep === 'through');
  }

  protected onEnter() {}
  protected onLeave() {}

  /** Start and end of the straight part of the current edge, in px. */
  protected span(frame: Frame): [number, number] {
    const horizontal = this.edge === 'bottom' || this.edge === 'top';
    return horizontal ? [frame.left, frame.right] : [frame.top, frame.bottom];
  }

  protected widthPx() {
    return this.spec.width * this.px;
  }

  private scale(frame: Frame) {
    this.far = depthScale(frame, this.depth);
    this.heightPx = this.spec.size * frame.bot * this.far;
    this.px = this.heightPx / this.spec.metres;
    this.holder.scale.setScalar(this.px);
  }

  // ---------- Acts ----------

  protected setAct(name: string) {
    const act = this.acts[name];
    this.act = name;
    this.actT = 0;
    this.actLength = act ? rand(act.length) : 3 + Math.random() * 4;
    act?.start?.();
  }

  /** Do this act now, if it has it (the lab's buttons). */
  perform(name: string) {
    if (this.acts[name] && this.state === 'here') this.setAct(name);
  }

  /** The acts it knows. */
  get repertoire() {
    return Object.keys(this.acts);
  }

  /** Something happened to it (a poke, a click): subclasses pick an act. */
  poke() {}

  /** Poked again soon after: a trick, any of those it does by itself, but not the one it's
   * at (or a plain poke, if it has none to do just now). */
  trick() {
    const names = Object.keys(this.acts).filter((n) => {
      const a = this.acts[n];
      return n !== 'idle' && n !== this.act && a.weight > 0 && (!a.when || a.when());
    });
    if (!names.length || this.state !== 'here') return this.poke();
    this.setAct(names[Math.floor(Math.random() * names.length)]);
  }

  /** Play a part in a scene (play.ts): it drops what it's doing and takes direction. */
  direct(role: Role) {
    this.role = role;
    this.roleT = 0;
    if (this.act !== 'idle') this.setAct('idle');
    this.onDirect();
  }

  /** The scene is over: back to its own life, and it stays a little longer. */
  release() {
    if (!this.role) return;
    this.role = null;
    this.standOn = 0;
    this.goal = null;
    this.depthGoal = this.depth;
    this.stay = Math.max(this.stay, this.t + 6);
    this.setAct('idle');
  }

  /** Given a part: back on its feet, ready for anything (a pet stands up). */
  protected onDirect() {}

  /** A little jump for joy (a director's cheer), about `height` of its own height. */
  hopUp(height = 0.3) {
    this.perch.kick(height * this.heightPx * 16);
  }

  /**
   * Hop up onto something, or down off it: an arc from where it is to s, `depth` back,
   * landing `h` px up (at the front of the box), which it then stands on (standOn). Going
   * up it gains the height before it goes over the edge; coming down it clears the edge
   * before it drops. A flier takes longer over it (`time`, s), and goes higher (`arc`, of
   * its own height).
   */
  hopOnto(s: number, depth: number, h: number, time = 0.6, arc = 0.35) {
    this.onto = {
      from: { s: this.s, depth: this.depth, h: this.standOn },
      to: { s, depth, h },
      t: 0,
      time,
      arc,
    };
    this.goal = null;
  }

  /** In the middle of a hop onto something (or off it). */
  get hopping() {
    return this.onto !== null;
  }

  private hopStep(dt: number) {
    const j = this.onto!;
    j.t += dt;
    const u = clamp(j.t / j.time, 0, 1);
    const up = j.to.h > j.from.h;
    const rise = up ? Math.sin((u * Math.PI) / 2) : 1 - Math.cos((u * Math.PI) / 2);
    const along = up ? u * u : 1 - (1 - u) * (1 - u);
    this.s = j.from.s + (j.to.s - j.from.s) * along;
    this.depth = this.depthGoal = j.from.depth + (j.to.depth - j.from.depth) * along;
    this.standOn =
      j.from.h + (j.to.h - j.from.h) * rise + this.heightPx * j.arc * Math.sin(Math.PI * u);
    this.perch.snap(this.standOn);
    this.goal = null;
    this.pace = this.vz = 0;
    if (u < 1) return;
    this.onto = null;
    this.standOn = j.to.h;
    this.perch.snap(j.to.h);
    this.hopUp(0.08);
  }

  /** Has it got where it was sent? */
  get there() {
    return this.goal === null && this.depth === this.depthGoal;
  }

  /** How fast it is walking along the floor and into the box (px/s). */
  get velocity() {
    return { x: this.pace, z: this.vz };
  }

  // ---------- Held by the pointer ----------

  /** Is it held by the pointer? */
  get isHeld() {
    return this.taken !== null;
  }

  /**
   * Taken hold of at `p` (viewport px): it goes after the pointer till it's let go, a flier
   * through the air, anything else along the floor (or its wall, or the ceiling), hurrying.
   * Returns whether it could be (not anchored, not on its way in or out, or through a door,
   * or mid-hop).
   */
  takeUp(p: { x: number; y: number; depth?: number }, frame: Frame) {
    if (this.state !== 'here' || this.taken || this.door || this.onto || this.fromGlass)
      return false;
    if (this.anchored) return false;
    const foot = this.foot(frame);
    const depth = p.depth ?? this.depth;
    this.taken = {
      x: p.x,
      y: p.y,
      dx: foot.x - p.x,
      dy: foot.y - p.y,
      depth,
      dd: this.depth - depth,
    };
    this.takenRole = this.role;
    this.direct({ posture: 'stand', mood: 'happy', hurry: 1.8 });
    this.perched = false;
    this.onTop = null;
    this.aloft = this.flies && !this.free && this.edge === 'bottom';
    this.takenV = { x: 0, y: 0 };
    // A flier comes out to the front, in the air (not behind anything on the page).
    this.depthGoal = this.flies && (this.aloft || this.free) ? 0 : this.depth;
    if (this.aloft) {
      // Up from where it stands (on something, perhaps).
      this.free = { ...this.frontFoot(frame), tilt: 0 };
      this.standOn = 0;
      this.perch.snap(0);
    } else if (!this.free && this.standOn > 0) this.hopOnto(this.s, this.depth, 0);
    return true;
  }

  /** The pointer holding it has moved to `p` (on a flat frame, and `depth` back). */
  dragTo(p: { x: number; y: number; depth?: number }) {
    if (!this.taken) return;
    this.taken.x = p.x;
    this.taken.y = p.y;
    if (p.depth !== undefined) this.taken.depth = p.depth;
  }

  /** Let go: its own again where it is (or back to its part); taken up into the air, it
   * comes down first: onto whatever's under it (the monitor's top, say), or to the floor. */
  putDown(frame: Frame) {
    if (!this.taken) return;
    this.taken = null;
    let drop = 0;
    let land: Top | null = null;
    let hang = false;
    // (Taken up off the floor, or caught in the air, a flier.)
    if ((this.aloft || this.flies) && this.free) {
      land = this.topUnder(frame, this.free);
      if (!land && this.flies) hang = true;
      else {
        drop = Math.max(0, frame.bottom - this.free.y);
        this.s = this.free.x;
        this.free = null;
      }
    }
    this.aloft = false;
    const role = this.takenRole;
    this.takenRole = null;
    // Put on top of something it stays there: whatever part it had before is over.
    if (role && !land) this.role = role;
    else this.release();
    this.goal = null;
    this.depthGoal = this.depth;
    if (hang && this.free) {
      // Let go in the air: it flaps and stays a while, then (see hoverStep) goes on (in a
      // world, soon: it was let go up there to fly).
      const side = this.free.x < (frame.left + frame.right) / 2 ? 1 : -1;
      this.hovering = {
        t: 0,
        len: frame.flat ? 0.6 + Math.random() * 0.8 : 2.5 + Math.random() * 3,
        tx: this.free.x + side * this.heightPx * (1 + Math.random() * 3),
      };
      return;
    }
    if (land) {
      // Down onto it, where it is over it (as seen), and it stands there.
      const vx = (frame.left + frame.right) / 2;
      const x = project(frame, this.depth, { x: this.s, y: frame.bottom }).x;
      const s = clamp(vx + (x - vx) / depthScale(frame, land.depth), land.s0, land.s1);
      this.standOn = drop;
      this.perch.snap(drop);
      this.onTop = land.key;
      const fall = Math.abs(drop - land.h);
      this.hopOnto(s, land.depth, land.h, 0.3 + Math.sqrt(fall / (frame.bot * 40)), 0);
    } else if (drop > 0) {
      this.standOn = drop;
      this.perch.snap(drop);
      this.hopOnto(this.s, this.depth, 0, 0.2 + Math.sqrt(drop / (frame.bot * 40)), 0);
    }
    // Put down off its own floor (in a world, it can be): back onto it.
    else if (frame.flat && !this.free) this.walkTo(this.s, this.depth);
  }

  /** The top under its feet as it's let go (at `at`, front of the box px at its depth),
   * the highest there is that's not above them; null if there's none (it's the floor). */
  private topUnder(f: Frame, at: { x: number; y: number }) {
    const foot = project(f, this.depth, at);
    let best: Top | null = null;
    let highest = Infinity;
    for (const t of this.topsHere) {
      const a = project(f, t.depth, { x: t.s0, y: f.bottom - t.h });
      const b = project(f, t.depth, { x: t.s1, y: f.bottom - t.h });
      if (foot.x < a.x || foot.x > b.x || a.y < foot.y - this.heightPx * 0.3) continue;
      if (a.y < highest) [best, highest] = [t, a.y];
    }
    return best;
  }

  /** On top of something (let go over it): there while it's there, and down off it to the
   * floor, in front of it, when it's off somewhere else (or flying, or given a part), or the
   * thing goes. */
  private keepOn(f: Frame) {
    const t = this.topsHere.find((o) => o.key === this.onTop);
    if (this.free) {
      this.onTop = null;
      return;
    }
    const along = t && (this.goal === null || (this.goal >= t.s0 && this.goal <= t.s1));
    if (t && along && Math.abs(this.depthGoal - t.depth) < 0.02 && !this.role) {
      // (It moves with it: the room's resized, the monitor's raised, the swing swings.)
      this.standOn = t.h;
      if (t.at !== undefined) {
        if (this.topAt !== null) this.s = clamp(this.s + t.at - this.topAt, t.s0, t.s1);
        this.topAt = t.at;
      }
      return;
    }
    this.onTop = null;
    this.topAt = null;
    const way = this.goal === null ? 0 : Math.sign(this.goal - this.s);
    const s = t ? clamp(this.goal ?? this.s, t.s0, t.s1) + way * this.footprint(f).x : this.s;
    const depth = Math.max(0, Math.min(this.depthGoal, (t?.depth ?? this.depth) - 0.15));
    const time = 0.35 + Math.sqrt(this.standOn / (f.bot * 40));
    this.hopOnto(s, depth, 0, time, this.flies ? 0.5 : 0.2);
  }

  /** Held, on foot: to where the pointer has its feet, as near as it can get on its floor
   * (or along its wall, or the ceiling). */
  private walkAfter(f: Frame) {
    const h = this.taken!;
    const x = h.x + h.dx;
    const y = h.y + h.dy;
    if (f.flat && this.inBox) {
      // Laid flat in a world: after it across the floor, off its own (whoever holds it
      // keeps it where it may go); put down, it goes back.
      this.goal = x;
      this.depthGoal = h.depth + h.dd;
      return;
    }
    const vx = (f.left + f.right) / 2;
    const vy = horizon(f);
    if (this.edge === 'bottom' && this.inBox) {
      // How far back the floor is under it there (the back wall's foot, if it's up the wall).
      const k = clamp((y - vy) / (f.bottom - vy), depthScale(f, 1), 1);
      const depth = ((1 - k) * Math.max(f.bottom - vy, f.depth * 4)) / f.depth;
      this.walkTo(vx + (x - vx) / k, clamp(depth, 0, 1));
      return;
    }
    const k = depthScale(f, this.depth);
    const side = this.edge === 'left' || this.edge === 'right';
    this.walkTo(side ? vy + (y - vy) / k : vx + (x - vx) / k, this.depth);
  }

  /** Held, a flier: after the pointer through the air (a spring, at 120 Hz whatever the frame
   * rate), within the frame, leaning into it. */
  private flyAfter(dt: number, f: Frame) {
    const h = this.taken!;
    const k = depthScale(f, this.depth);
    const vx = (f.left + f.right) / 2;
    const vy = horizon(f);
    const half = this.widthPx() / 2;
    // (Laid flat in a world, it may be taken past the ends, and back or forth.)
    const tx = f.flat
      ? h.x + h.dx
      : clamp(vx + (h.x + h.dx - vx) / k, f.left + half, f.right - half);
    const ty = clamp(vy + (h.y + h.dy - vy) / k, f.top + this.heightPx, f.bottom);
    if (f.flat) this.depthGoal = h.depth + h.dd;
    let { x, y } = this.free ?? this.frontFoot(f);
    const v = this.takenV;
    const w = 2 * Math.PI * 1.6;
    const n = Math.ceil(dt / FLY_STEP);
    for (let i = 0; i < n; i++) {
      const d = dt / n;
      v.x += (w * w * (tx - x) - 2 * w * v.x) * d;
      v.y += (w * w * (ty - y) - 2 * w * v.y) * d;
      x += v.x * d;
      y += v.y * d;
    }
    this.free = { x, y, tilt: -clamp(v.x / (this.heightPx * 10), -0.45, 0.45) };
    if (this.edge === 'bottom') this.s = x;
  }

  /** Does it go back to its own flying after hanging in the air (the swimmers, who float
   * anyway)? Say so (having picked up from where it is) and return true. */
  protected flightBack(): boolean {
    return false;
  }

  /** Let go in the air: it hangs where it is, flapping (its wings are out whenever it's
   * free) and bobbing, then goes on: back to its own flying, or slowly down to the floor
   * a little to one side, to stand there. */
  private hoverStep(dt: number, f: Frame) {
    const h = this.hovering!;
    const at = this.free!;
    h.t += dt;
    const H = this.heightPx;
    if (h.t < h.len) {
      this.free = {
        x: at.x,
        y: at.y + Math.sin(this.t * 6) * H * 0.04 * dt * 6,
        tilt: at.tilt * (1 - Math.min(1, dt * 4)),
      };
      return;
    }
    if (this.flightBack()) {
      this.hovering = null;
      return;
    }
    const down = f.bottom - at.y;
    const x = at.x + clamp(h.tx - at.x, -H * 0.9 * dt, H * 0.9 * dt);
    const y = at.y + Math.min(down, clamp(down * 1.2, H * 0.3, H * 1.3) * dt);
    this.free = { x, y, tilt: clamp((x - at.x) / Math.max(dt, 1e-3) / (H * 10), -0.3, 0.3) };
    if (f.bottom - y < 1) {
      this.hovering = null;
      this.free = null;
      this.s = x;
      this.standOn = 0;
      this.perch.snap(0);
      this.hopUp(0.08);
      if (f.flat) this.walkTo(this.s, this.depth);
    }
  }

  private pickAct() {
    const names = Object.keys(this.acts).filter((n) => {
      const a = this.acts[n];
      return a.weight > 0 && (!a.when || a.when());
    });
    let r = Math.random() * names.reduce((sum, n) => sum + this.acts[n].weight, 0);
    for (const n of names) {
      r -= this.acts[n].weight;
      if (r <= 0) return this.setAct(n);
    }
    this.setAct('idle');
  }

  /**
   * Walk to s along the current edge, and most times further into the box or out of it
   * as it goes (or to `depth`, if given).
   */
  walkTo(s: number, depth?: number) {
    this.goal = s;
    if (this.state !== 'here') return;
    // Within the frame, the whole of it.
    if (this.floorFrame) {
      const [lo, hi] = this.span(this.floorFrame);
      const half = this.footprint(this.floorFrame).x;
      this.goal = clamp(s, lo + half, Math.max(lo + half, hi - half));
    }
    const f = this.floorFrame;
    if (this.inBox) {
      const back = f ? this.backmost(f) : 1;
      if (depth !== undefined) this.depthGoal = clamp(depth, 0, back);
      else if (this.roams && Math.random() < 0.7)
        this.depthGoal = this.home + Math.max(0, back - this.home) * Math.random() ** 1.3;
    }
    // Already there (asked again each frame, say): it has arrived, it isn't setting off.
    if (f && Math.abs(this.goal - this.s) < 1) {
      if (!this.inBox) this.goal = null;
      else if (Math.abs(this.depthGoal - this.depth) * floorDepth(f) < 0.5) {
        this.goal = null;
        this.depth = this.depthGoal;
      }
    }
  }

  /** How far back it goes: all of it in front of the frame's `back` (the monitor), unless
   * it's on its way through a door. */
  protected backmost(f: Frame) {
    // (On top of the monitor isn't behind it.)
    if (this.door || this.onTop) return 2;
    if (f.back === undefined) return 1;
    return Math.max(0.2, f.back - this.footprint(f).z / floorDepth(f));
  }

  /** How far into the box it stands when it isn't wandering: on the floor, a little in. */
  protected get home() {
    return this.edge === 'bottom' && !this.free ? HOME : 0;
  }

  /** Does it wander in and out of the box? */
  protected get roams() {
    return this.spec.roam ?? this.edge === 'bottom';
  }

  /** On the floor or the ceiling, where it can go back into the box. */
  get inBox() {
    return !this.free && (this.edge === 'bottom' || this.edge === 'top');
  }

  // ---------- Each frame ----------

  update(dt: number, env: Env) {
    if (this.state === 'gone') return;
    this.scale(env.frame);
    this.topsHere = env.tops ?? [];
    this.t += dt;
    this.actT += dt;
    // Never sent back behind the monitor, whatever it's doing (flying, climbing, a trick).
    this.depthGoal = Math.min(this.depthGoal, this.backmost(env.frame));
    // Held by the pointer: after it, flying (if it can; its own flying waits) or on foot.
    if (this.taken && this.state !== 'here') this.putDown(env.frame);
    if (this.taken && this.flies && (this.aloft || this.free)) this.flyAfter(dt, env.frame);
    else if (this.hovering && this.free) this.hoverStep(dt, env.frame);
    else {
      this.hovering = null;
      if (this.taken && !this.onto) this.walkAfter(env.frame);
      else if (this.onTop && !this.onto) this.keepOn(env.frame);
      this.move(dt, env);
    }
    if (this.fromGlass) this.outOfGlass(dt);
    if (this.onto) this.hopStep(dt);
    // Flying, it goes in or out of the box on its own; otherwise it walks there (in move).
    if (this.free) this.depth += clamp(this.depthGoal - this.depth, -dt * 0.6, dt * 0.6);
    if (this.state === 'here' && !this.role && !this.taken) {
      if (this.actT > this.actLength) this.pickAct();
      if (this.t > this.stay && this.act === 'idle') this.leave();
    } else if (this.role?.ending && this.act !== 'idle' && this.actT > this.actLength)
      this.setAct('idle');
    this.perch.update(dt, this.standOn);
    this.puppet.begin();
    this.idle(this.t);
    this.acts[this.act]?.pose?.(this.actT);
    if (this.role) {
      this.roleT += dt;
      this.role.pose?.(this.roleT, dt);
    }
    // Taken up into the air by the pointer: it beats its wings (if it has them).
    if (this.aloft && this.puppet.has('wing.L')) {
      const beat = 30 + 35 * Math.sin(this.t * Math.PI * 2 * 4.5);
      this.puppet.add('wing.L', 0, 0, beat);
      this.puppet.add('wing.R', 0, 0, -beat);
    }
    this.pose(dt, env);
    this.gazeAt(dt, env);
    this.puppet.update(dt);
    this.after(dt, env);
    this.place(env.frame);
    for (const held of this.carried) held.follow(dt, env);
    if (this.face) {
      this.face.expression = this.role?.face ?? this.acts[this.act]?.face ?? this.expression;
      this.face.update(env.time);
    }
  }

  /** The resting life of the character: breathing, swaying, ear twitches. */
  protected abstract idle(t: number): void;
  /** Anything that depends on movement: gait, leaning into turns. */
  protected pose(_dt: number, _env: Env) {}
  /** After the joints are posed: direct effects (flames, glowing dots). */
  protected after(_dt: number, _env: Env) {}

  protected move(dt: number, env: Env) {
    const frame = env.frame;
    const [lo, hi] = this.span(frame);
    // Back to the front of the box before sinking behind the frame line.
    const sinking = this.state === 'leaving' && this.leaveBy === 'rise' && this.depth < 0.02;
    const riseTo = this.door ? this.useDoor(dt, frame) : sinking ? -0.05 : 1;
    this.rise.update(dt, riseTo);
    if (this.state === 'entering' && !this.door && !this.fromGlass) {
      if (this.walksIn) {
        if (this.goal === null) this.arrived();
      } else if (this.rise.y > 0.97 && this.t > 0.6) this.arrived();
    }
    if (this.state === 'leaving') {
      if (this.leaveBy === 'walk') {
        if (this.goal === null || (this.goal > lo && this.goal < hi)) {
          const toStart = this.startSide(lo, hi);
          this.goal = toStart ? lo - this.widthPx() * 1.2 : hi + this.widthPx() * 1.2;
        }
        if (this.s < lo - this.widthPx() || this.s > hi + this.widthPx()) this.gone();
      } else if (this.leaveBy === 'rise' && this.rise.y < 0.01) this.gone();
    }
    // Walking about the floor: along the edge to the goal, and into the box or out of it
    // to depthGoal, in a straight line across the floor, round anyone in the way.
    const speed = (this.spec.speed ?? 1) * frame.bot * (this.role?.hurry ?? 1);
    const deep = floorDepth(frame);
    this.floorFrame = frame;
    if (!this.free && !this.inBox) this.depthGoal = this.depth = 0;
    if (!this.free && this.state === 'here') this.clearGoal(env);
    const before = this.floorPoint(frame);
    const dx = this.goal === null ? 0 : this.goal - this.s;
    const dz = this.free ? 0 : (this.depthGoal - this.depth) * deep;
    const dist = Math.hypot(dx, dz);
    let [vx, vz] = [0, 0];
    if (dist > 0.5) {
      const v = Math.min(speed, dist * 3 + speed * 0.2);
      [vx, vz] = this.steer((dx / dist) * v, (dz / dist) * v, env);
    }
    const ease = Math.min(1, dt * 6);
    this.pace += (vx - this.pace) * ease;
    this.vz += (vz - this.vz) * ease;
    this.s += this.pace * dt;
    if (!this.free) {
      // Past the back wall only on the way through its door; and no further back than the
      // monitor (if it's there already, come in through a door, it only comes forward).
      const back = Math.max(this.backmost(frame), Math.min(this.depth, 1));
      // (Laid flat in a world: anywhere while it's held, and from there back onto the floor.)
      const [near, far] = !frame.flat
        ? [0, this.door ? 2 : back]
        : this.taken
          ? [-Infinity, Infinity]
          : [Math.min(0, this.depth), Math.max(back, this.depth)];
      this.depth = clamp(this.depth + (this.vz * dt) / deep, near, far);
      this.keepApart(env);
      if (Math.abs(this.depthGoal - this.depth) * deep < 0.5) this.depth = this.depthGoal;
      // Trying to walk and getting nowhere (hemmed in): it gives up and stays put.
      const after = this.floorPoint(frame);
      const moved = Math.hypot(after.x - before.x, after.z - before.z);
      const meant = Math.hypot(vx, vz) * dt;
      this.stuck = meant > speed * 0.3 * dt && moved < meant * 0.25 ? this.stuck + dt : 0;
      // (Walking in a long while and still not in, to and fro round one at the way in, is
      // being hemmed in too; walking out far longer than the way out takes, it slips off
      // where it is.)
      const walking =
        this.state === 'entering' || this.leaveBy === 'walk' || this.leaveBy === 'rise';
      this.onTheWay = walking && this.state !== 'here' && !this.door ? this.onTheWay + dt : 0;
      const wayOut = (Math.min(this.s - lo, hi - this.s) + this.widthPx()) / speed + 10;
      if (this.state === 'leaving' && this.onTheWay > wayOut) return this.gone();
      if (this.stuck > 1.2 && this.state === 'here') {
        this.goal = null;
        this.depthGoal = this.depth;
        this.stuck = 0;
      } else if ((this.stuck > 1.2 || this.onTheWay > 15) && this.state === 'entering') {
        this.stuck = this.onTheWay = 0;
        this.giveWay(env);
      } else if (this.stuck > 1.2 && this.state === 'leaving' && this.leaveBy === 'walk') {
        // Going and getting nowhere (behind a set piece by the wall, say): out the other
        // way instead; stuck that way too, it slips off where it is.
        this.stuck = 0;
        if (this.turnedBack++ >= 2) return this.gone();
        const out = this.widthPx() * 1.2;
        this.goal = (this.goal ?? this.s) < (lo + hi) / 2 ? hi + out : lo - out;
      }
      this.unjam(dt, env);
    }
    if (this.goal !== null && Math.abs(this.goal - this.s) < 1) this.goal = null;
    this.gait += (this.stride * dt) / Math.max(this.heightPx * 0.35, 1);
    // Face the way it's walking: across, toward us, or away into the box (its back to
    // us); then back to the viewer.
    let heading = 0;
    if (this.stride > speed * 0.15) {
      const turn = this.spec.turn ?? 80;
      let away = Math.atan2(Math.abs(this.pace), -this.vz) * DEG; // 0 toward us, 180 away
      // A step or two back it takes facing us, as we would.
      if (dist < this.heightPx * 0.6) away = Math.min(away, 180 - away);
      const back = turn >= 60 ? 165 : turn;
      const size = away <= 90 ? (away / 90) * turn : turn + ((away - 90) / 90) * (back - turn);
      const side = Math.sign(this.pace) || Math.sign(this.heading.y) * FORWARD[this.edge] || 1;
      heading = side * FORWARD[this.edge] * size;
    } else if (this.role?.facing !== undefined) heading = this.role.facing;
    this.heading.update(dt, heading);
  }

  /** How fast it is walking, in any direction across the floor (px/s). */
  get stride() {
    return Math.hypot(this.pace, this.vz);
  }

  /** Its place on the floor (or ceiling): along the edge, and back into the box, in px. */
  floorPoint(frame: Frame) {
    return { x: this.s, z: this.depth * floorDepth(frame) };
  }

  /** Half its footprint on the floor, across and front to back, in px. */
  footprint(frame: Frame) {
    const x = (this.spec.width / this.spec.metres) * this.spec.size * frame.bot * 0.5;
    return { x, z: x * 0.6 };
  }

  /**
   * How much room there is between it and another on the same floor, as a share of the
   * room both need (under 1: too close), and which way the other one is from here.
   */
  spaceTo(other: Body, frame: Frame) {
    const a = this.floorPoint(frame);
    const b = other.floorPoint(frame);
    const [ra, rb] = [this.footprint(frame), other.footprint(frame)];
    const elbow = ELBOW * frame.bot;
    const rx = ra.x + rb.x + elbow;
    const rz = ra.z + rb.z + elbow * 0.6;
    const nx = (b.x - a.x) / rx;
    const nz = (b.z - a.z) / rz;
    return { n: Math.hypot(nx, nz), nx, nz, rx, rz };
  }

  /** Is it on the same floor (edge) as this one, so they have to share it? */
  private sharesFloor(other: Character) {
    return (
      other !== this &&
      other.state !== 'gone' &&
      !other.free &&
      !this.free &&
      !other.perched &&
      !this.perched &&
      // (Up on top of something, it's off the floor: nobody makes room for it, or it for them.)
      !other.onTop &&
      !this.onTop &&
      this.slip <= 0 &&
      other.slip <= 0 &&
      other.edge === this.edge
    );
  }

  /** Everyone and everything it shares the floor with: crewmates, and props in the way. */
  private around(env: Env): Body[] {
    const out: Body[] = env.crew.filter((o) => this.sharesFloor(o));
    // (Up on one, it's off the floor and out of the others' way.)
    if (this.edge === 'bottom' && !this.free && !this.perched && !this.onTop && env.props)
      for (const p of env.props) if (p.blocks?.(this) ?? true) out.push(p);
    return out;
  }

  /**
   * Bends a walk (vx, vz) round whoever is ahead: toward the side with more room and
   * the way it was going, keeping to the side it picked until it is past.
   */
  private steer(vx: number, vz: number, env: Env): [number, number] {
    if (this.spec.steers === false || !this.inBox) return [vx, vz];
    const frame = env.frame;
    const deep = floorDepth(frame);
    const here = this.floorPoint(frame);
    const v = Math.hypot(vx, vz);
    const goal = { x: this.goal ?? this.s, z: this.depthGoal * deep };
    const [lo, hi] = this.span(frame);
    let [ax, az] = [0, 0];
    for (const o of this.around(env)) {
      const { n, nx, nz, rx, rz } = this.spaceTo(o, frame);
      if (n > 2.4 || n < 1e-6) {
        this.passing.delete(o);
        continue;
      }
      // Only if it is heading for them, and going past them: not up to them, to stop beside them.
      if ((vx / rx) * nx + (vz / rz) * nz <= 0) continue;
      const b = o.floorPoint(frame);
      const [gx, gz] = [(goal.x - b.x) / rx, (goal.z - b.z) / rz];
      if (-(gx * nx + gz * nz) > 0.3 * Math.hypot(gx, gz) * n) {
        this.passing.delete(o);
        continue;
      }
      let side = this.passing.get(o);
      if (!side) {
        const score = (sg: number) => {
          const [px, pz] = [-nz * sg * rx, nx * sg * rz];
          const z = here.z + pz;
          const x = here.x + px;
          // Not round the side into a wall (a case stands against it, say).
          const walls = z < 0 || z > deep || x < lo || x > hi ? -2 : 0;
          // Keep behind one it is behind, in front of one it is in front of.
          const order = pz * (here.z - o.floorPoint(frame).z) > 0 ? 0.3 : 0;
          return (px * vx + pz * vz) / (Math.hypot(px, pz) * (v || 1)) + walls + order;
        };
        side = score(1) >= score(-1) ? 1 : -1;
        this.passing.set(o, side);
      }
      const w = clamp((2.4 - n) / 1.4, 0, 1);
      ax += -nz * side * rx * w;
      az += nx * side * rz * w;
    }
    const a = Math.hypot(ax, az);
    if (!a) return [vx, vz];
    const [sx, sz] = [vx + (ax / a) * v * 1.5, vz + (az / a) * v * 1.5];
    const len = Math.hypot(sx, sz) || 1;
    return [(sx / len) * v, (sz / len) * v];
  }

  /**
   * Where it's going, moved out of the room of anyone standing there: to the near edge of
   * it, from where the target was.
   */
  private clearGoal(env: Env) {
    const frame = env.frame;
    const deep = floorDepth(frame);
    const [s0, d0] = [this.s, this.depth];
    const target = { s: this.goal ?? this.s, d: this.depthGoal };
    if (this.goal === null && Math.abs(target.d - d0) * deep < 0.5) return;
    [this.s, this.depth] = [target.s, target.d];
    for (const o of this.around(env)) {
      if (o.stride > 1) continue;
      const { n, nx, nz, rx, rz } = this.spaceTo(o, frame);
      if (n >= 1.05) continue;
      const b = o.floorPoint(frame);
      const [ux, uz] = n > 1e-6 ? [nx / n, nz / n] : [s0 < b.x ? 1 : -1, 0];
      this.s = b.x - ux * rx * 1.1;
      this.depth = this.inBox ? clamp((b.z - uz * rz * 1.1) / deep, 0, 1) : 0;
    }
    if (this.goal !== null) this.goal = this.s;
    this.depthGoal = this.depth;
    [this.s, this.depth] = [s0, d0];
  }

  /**
   * Never inside another's room: walking, it stops at the edge of it (or slides round);
   * standing, the later arrival of two too close walks off to somewhere with room.
   */
  private keepApart(env: Env) {
    if (this.state === 'gone' || this.free) return;
    const frame = env.frame;
    const deep = floorDepth(frame);
    for (const o of this.around(env)) {
      const { n, nx, nz, rx, rz } = this.spaceTo(o, frame);
      if (n >= 1) continue;
      if (this.stride > 1 || o.stride > 1) {
        if (this.stride < 1) continue; // the one walking gives way
        const b = o.floorPoint(frame);
        const [ux, uz] = n > 1e-6 ? [nx / n, nz / n] : [Math.random() < 0.5 ? 1 : -1, 0];
        this.s = b.x - ux * rx;
        if (this.inBox) {
          const back = Math.max(this.backmost(frame), Math.min(this.depth, 1));
          this.depth = clamp((b.z - uz * rz) / deep, 0, back);
        }
        if (this.state === 'here') {
          const [lo, hi] = this.span(frame);
          const half = this.footprint(frame).x;
          this.s = clamp(this.s, lo + half, Math.max(lo + half, hi - half));
        }
      } else if (this.t < o.t && this.state === 'here' && this.goal === null) {
        this.makeRoom(env);
      }
    }
  }

  /**
   * Coming in and hemmed in: anyone in the way steps aside; and if it's already in the
   * room (out of the doorway, or inside the frame), it has arrived where it is.
   */
  private giveWay(env: Env) {
    const frame = env.frame;
    for (const o of env.crew)
      if (this.sharesFloor(o) && o.state === 'here' && this.spaceTo(o, frame).n < 1.6)
        o.makeRoom(env);
    const fp = this.footprint(frame);
    const deep = floorDepth(frame);
    const [lo, hi] = this.span(frame);
    const inRoom = this.door
      ? this.door.kind === 'back'
        ? this.depth < 1 - (fp.z * 0.5) / deep
        : this.door.kind === 'left'
          ? this.s > this.door.x + fp.x * 0.5
          : this.door.kind === 'right'
            ? this.s < this.door.x - fp.x * 0.5
            : false
      : this.s > lo + fp.x && this.s < hi - fp.x;
    if (!inRoom) {
      // Kept out by something that won't make room (a set piece by the wall, walking in):
      // in from the other end instead, out of sight still; kept out there too, it gives up.
      if (this.door || this.spec.entrance !== 'walk') return;
      if (this.turnedBack++ >= 2) return this.gone();
      this.s = this.s < (lo + hi) / 2 ? hi + this.widthPx() : lo - this.widthPx();
      return;
    }
    if (this.door) {
      this.door.want = 0;
      this.door.user = null;
      this.door = null;
    }
    this.goal = null;
    this.depthGoal = this.depth;
    this.arrived();
  }

  /**
   * Walk off to the nearest place with room, a little along or in or out; or, `wide`, anywhere
   * along the floor, clear of where the others are going too, and if there's nowhere with
   * room, where there's the most. False if it found nowhere.
   */
  protected makeRoom(env: Env, wide = false) {
    const frame = env.frame;
    const [lo, hi] = this.span(frame);
    const step = this.footprint(frame).x;
    const deep = floorDepth(frame);
    const others: Body[] = this.around(env);
    if (wide)
      for (const o of env.crew)
        if (o !== this && o.goal !== null && o.state !== 'gone' && o.edge === this.edge && !o.free)
          others.push({
            floorPoint: () => ({ x: o.goal!, z: o.depthGoal * deep }),
            footprint: (f) => o.footprint(f),
            stride: 0,
            t: o.t,
          });
    const [s0, d0] = [this.s, this.depth];
    let best: [number, number] | null = null;
    let bestCost = Infinity;
    let roomiest: [number, number] | null = null;
    let most = 0;
    const reach = wide ? Math.ceil((hi - lo) / (step * 0.6)) : 8;
    const depths = !this.inBox ? [0] : wide ? [0, 0.3, -0.3, 0.6, -0.6, 0.15] : [0, 0.3, -0.3, 0.6];
    for (let i = 1; i <= reach; i++) {
      for (const sg of [-1, 1]) {
        for (const dd of depths) {
          const s = s0 + sg * i * step * 0.6;
          const d = clamp(d0 + dd, this.home * 0.5, 1);
          if (s < lo + step || s > hi - step) continue;
          [this.s, this.depth] = [s, d];
          let room = Infinity;
          for (const o of others) room = Math.min(room, this.spaceTo(o, frame).n);
          const cost = Math.abs(s - s0) + Math.abs(d - d0) * deep;
          if (room > 1.1 && cost < bestCost) [best, bestCost] = [[s, d], cost];
          if (room > most) [roomiest, most] = [[s, d], room];
        }
      }
    }
    [this.s, this.depth] = [s0, d0];
    const to = best ?? (wide && most > 0.9 ? roomiest : null);
    if (!to) return false;
    this.goal = to[0];
    this.depthGoal = to[1];
    return true;
  }

  /**
   * The jam protocol, so a crowd can't stay stuck in a heap: one in the room of another who
   * was here first, or who's directed, for a while (JAM) is the one to go. It finds room
   * anywhere along the floor and goes there, passing through the others (in front of them or
   * behind) rather than stopping at them, since in a heap they're all in each other's way; if
   * it's still jammed after that, again. Jammed long enough in all (JAM_OUT), there's no room
   * on the floor for it, and it leaves. The directed (a scene's, the reader's company) are
   * never moved by it: the rest make way for them.
   */
  private unjam(dt: number, env: Env) {
    if (this.state !== 'here' || this.free || this.perched || this.role) {
      this.jam = this.slip = 0;
      return;
    }
    if (this.slip > 0) {
      this.slip -= dt;
      const there = this.goal === null && this.depth === this.depthGoal;
      if (!there && this.slip > 0) return;
      this.slip = 0;
    }
    const frame = env.frame;
    const inWay = env.crew.some(
      (o) =>
        this.sharesFloor(o) &&
        (!!o.role || o.t > this.t) &&
        o.state !== 'leaving' &&
        this.spaceTo(o, frame).n < 0.85,
    );
    this.jam = inWay ? this.jam + dt : Math.max(0, this.jam - dt * 2);
    this.retry -= dt;
    if (this.jam < JAM || this.walking || this.retry > 0) return;
    if (this.jam > JAM_OUT) {
      this.jam = 0;
      this.leave();
    } else if (this.makeRoom(env, true)) this.slip = SLIP;
    else this.retry = 0.5;
  }

  protected arrived() {
    this.state = 'here';
    this.onArrive();
  }

  protected onArrive() {}

  protected gone() {
    if (this.door) {
      this.door.want = 0;
      this.door.user = null;
      this.door = null;
    }
    this.state = 'gone';
    this.holder.visible = false;
    this.goal = null;
    this.pace = this.vz = 0;
    this.passing.clear();
  }

  /** Is it walking right now? */
  get walking() {
    return this.stride > 1;
  }

  // ---------- Looking at the mouse ----------

  private gazeAt(dt: number, env: Env) {
    const { yaw: maxYaw, pitch: maxPitch } = this.spec.reach;
    const angle = this.free ? 0 : ANGLE[this.edge];
    const eye = this.eyePoint(env.frame);
    let yaw: number;
    let pitch: number;
    const idleFor = env.time - env.pointer.at;
    const other = this.nearest(env);
    // Something going on turns heads, each a beat after the one before.
    const show =
      env.show && env.time > env.show.at + (this.wanderSeed % 1) * 0.45 ? env.show : null;
    const watch =
      this.role?.look?.() ?? show ?? (env.pointer.present && idleFor < 6 ? env.pointer : null);
    if (watch) {
      // Where the mouse (or what it's watching) is from here, in its own up and sideways.
      const dx = watch.x - eye.x;
      const dy = eye.y - watch.y; // world y is up
      const lx = dx * Math.cos(angle) + dy * Math.sin(angle);
      const ly = -dx * Math.sin(angle) + dy * Math.cos(angle);
      // The mouse is imagined a little in front of the page; someone in a world is where
      // they are.
      const z = watch === env.pointer ? env.pointer.z : undefined;
      const back = env.frame.flat ? this.depth * floorDepth(env.frame) : 0;
      const depth = z !== undefined ? Math.max(z + back, this.heightPx * 0.5) : this.heightPx * 3;
      yaw = Math.atan2(lx, depth) * DEG;
      pitch = Math.atan2(-ly, depth) * DEG;
    } else if (other && wobble(env.time * 0.15, this.wanderSeed) > 0.3) {
      // Nothing to watch: glance at a crewmate now and then...
      const o = other.eyePoint(env.frame);
      yaw = Math.atan2(o.x - eye.x, this.heightPx * 3) * DEG * (this.edge === 'top' ? -1 : 1);
      pitch = 0;
    } else {
      // ...or look about.
      yaw = wobble(env.time * 0.25, this.wanderSeed) * maxYaw * 0.6;
      pitch = wobble(env.time * 0.2, this.wanderSeed + 3) * maxPitch * 0.4;
    }
    yaw = clamp(yaw - this.heading.y, -maxYaw, maxYaw);
    pitch = clamp(pitch, -maxPitch, maxPitch);
    // Eyes first, then the head and body after a beat.
    const gy = this.gazeYaw.update(dt, yaw);
    const gp = this.gazePitch.update(dt, pitch);
    if (this.face) {
      this.face.look.x = clamp(this.eyeX.update(dt, yaw / maxYaw), -1, 1);
      this.face.look.y = clamp(this.eyeY.update(dt, pitch / maxPitch), -1, 1);
    }
    for (const g of this.spec.gaze) this.puppet.add(g.bone, gp * g.pitch, gy * g.yaw, 0);
    this.puppet.add('root', 0, this.heading.y, 0);
  }

  private nearest(env: Env): Character | null {
    let best: Character | null = null;
    let bestD = Infinity;
    const me = this.eyePoint(env.frame);
    for (const c of env.crew) {
      if (c === this || c.state === 'gone') continue;
      const o = c.eyePoint(env.frame);
      const d = Math.hypot(o.x - me.x, o.y - me.y);
      if (d < bestD) [best, bestD] = [c, d];
    }
    return bestD < this.heightPx * 12 ? best : null;
  }

  /** The eyes, in viewport px. */
  eyePoint(frame: Frame): { x: number; y: number } {
    const foot = this.foot(frame);
    const up = this.spec.eyes * this.heightPx;
    const a = this.free ? 0 : ANGLE[this.edge];
    return { x: foot.x - Math.sin(a) * up, y: foot.y - Math.cos(a) * up };
  }

  /** Where the feet are, in viewport px: on the front of the box, taken back by depth. */
  foot(frame: Frame): { x: number; y: number } {
    const at = this.frontFoot(frame);
    return this.depth ? project(frame, this.depth, at) : at;
  }

  /** Where the feet would be at the front of the box (free flight is planned here). */
  frontFoot(frame: Frame): { x: number; y: number } {
    if (this.free) return { x: this.free.x, y: this.free.y };
    const h = this.h + this.glassLift + this.perch.y + (this.rise.y - 1) * this.heightPx * 1.05;
    switch (this.edge) {
      case 'bottom':
        return { x: this.s, y: frame.bottom - h };
      case 'top':
        return { x: this.s, y: frame.top + h };
      case 'left':
        return { x: frame.left + h, y: this.s };
      case 'right':
        return { x: frame.right - h, y: this.s };
    }
  }

  private place(frame: Frame) {
    const foot = this.foot(frame);
    // Further back is further from the camera too, so nearer ones pass in front.
    // (Laid flat in a world, back is back: as far as it walked.)
    const back = frame.flat ? this.depth * floorDepth(frame) : this.depth * frame.depth * 3;
    this.holder.position.set(foot.x, -foot.y, -back + this.forth);
    this.placeShadow(frame);
    this.holder.rotation.z = this.free ? 0 : ANGLE[this.edge];
    this.pivot.rotation.z = this.free ? this.free.tilt : 0;
    // Clip at the frame line, so it rises from behind it; and at the side it walks in
    // from, so it appears from behind the frame's corner.
    const [edgePlane, sidePlane, ...doorway] = this.planes;
    const edges = this.inDoorway ? this.door!.clip() : [];
    doorway.forEach((plane, i) => {
      const e = edges[i];
      if (e) {
        plane.normal.set(e[0], e[1], 0);
        plane.constant = e[2];
      } else plane.constant = 1e6;
    });
    if (this.free || this.unclipped || frame.flat) {
      edgePlane.constant = sidePlane.constant = 1e6;
      return;
    }
    // A plane keeps what is on its normal's side: n·p + c >= 0, in world px (y up).
    const [nx, ny, c] = {
      bottom: [0, 1, frame.bottom],
      top: [0, -1, -frame.top],
      left: [1, 0, -frame.left],
      right: [-1, 0, frame.right],
    }[this.edge];
    edgePlane.normal.set(nx, ny, 0);
    edgePlane.constant = c;
    if (this.state !== 'here' && this.spec.entrance === 'walk' && !this.door) {
      const [lo, hi] = this.span(frame);
      const nearStart = this.startSide(lo, hi);
      if (this.edge === 'bottom' || this.edge === 'top') {
        sidePlane.normal.set(nearStart ? 1 : -1, 0, 0);
      } else {
        sidePlane.normal.set(0, nearStart ? -1 : 1, 0); // viewport y runs down
      }
      sidePlane.constant = nearStart ? -lo : hi;
    } else sidePlane.constant = 1e6;
  }

  /**
   * A soft shadow on the floor under it, on the bottom edge only: fainter the higher it
   * hops, gone when it flies. Below the front lip it is cut off with the rest of it.
   */
  private placeShadow(frame: Frame) {
    const on = this.shadowCard && !this.free && this.edge === 'bottom' && this.state !== 'gone';
    this.shadow.visible = on;
    if (!on) return;
    const lift = clamp(1 - this.h / (this.heightPx * 0.6), 0, 1);
    const shown = clamp(this.rise.y, 0, 1);
    this.shadow.material.opacity = 0.2 * lift * shown;
    if (frame.flat) {
      // Flat on the floor under its feet, a pool round them.
      this.shadow.rotation.x = -Math.PI / 2;
      this.shadow.scale.set(this.spec.width * (1.2 - 0.3 * (1 - lift)), this.spec.width * 0.9, 1);
      this.shadow.position.set(0, (1 - this.h) / this.px, 0);
      return;
    }
    this.shadow.rotation.x = 0;
    this.shadow.scale.set(
      this.spec.width * (1.1 - 0.3 * (1 - lift)),
      (frame.depth * 0.5) / this.px,
      1,
    );
    // Back at the feet whatever the hop (the holder rises with it), a little behind them.
    this.shadow.position.set(0, -this.h / this.px, -this.spec.width * 0.6);
  }

  /** The character's box on screen, in viewport px, for its hit area. */
  bounds(frame: Frame) {
    const foot = this.foot(frame);
    const eye = this.eyePoint(frame);
    const w = this.widthPx();
    const up = { x: (eye.x - foot.x) / this.spec.eyes, y: (eye.y - foot.y) / this.spec.eyes };
    const len = Math.hypot(up.x, up.y) || 1;
    const side = { x: (-up.y / len) * (w / 2), y: (up.x / len) * (w / 2) };
    const xs = [foot.x + side.x, foot.x - side.x, foot.x + up.x + side.x, foot.x + up.x - side.x];
    const ys = [foot.y + side.y, foot.y - side.y, foot.y + up.y + side.y, foot.y + up.y - side.y];
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }

  dispose() {
    this.shadow.geometry.dispose();
    this.shadow.material.dispose();
    this.outfit?.dispose();
    this.face?.dispose();
    this.holder.removeFromParent();
  }
}

export function rand([lo, hi]: [number, number]) {
  return lo + Math.random() * (hi - lo);
}

export function clamp(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, x));
}

/** A smooth 0→1→0 envelope over an act: eases in for `ease` seconds and out at the end. */
export function envelope(t: number, length: number, ease = 0.25) {
  return clamp(Math.min(t / ease, (length - t) / ease), 0, 1);
}

let shadowMap: CanvasTexture | null = null;
/** A soft round shadow: dark in the middle, fading to nothing at the rim. */
export function shadowTexture() {
  if (shadowMap) return shadowMap;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const c = canvas.getContext('2d')!;
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
  return (shadowMap = new CanvasTexture(canvas));
}
