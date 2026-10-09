// The crew about a three.js world: a few out at once, on the lanes near whoever is looking.
// Now and then one turns up where they aren't looking (walking in from a lane's end, or up
// from the floor), stays a while and goes; then someone else comes, somewhere else. One who
// walks off a lane's end by a way through to another lane (a link: a doorway, say) comes on
// there, when no one is looking. Poke one and it notices; poke it again and it does a trick.
import { Frustum, Matrix4, type PerspectiveCamera, type Ray, type Scene, Vector3 } from 'three';
import { type Character, loadModel } from './character';
import { ROSTER } from './crew';
import { Lane, type LaneOptions, type LaneSpec } from './lane';
import type { LookName } from './looks';
import { setOutlineViewport } from './stage';
import { MODELS } from './version';

type End = 'start' | 'end';

/** A way through between two lanes' ends. */
export interface RoamLink {
  a: { lane: string; end: End };
  b: { lane: string; end: End };
}

export interface RoamOptions extends LaneOptions {
  lanes: LaneSpec[];
  links?: RoamLink[];
  /** Who may come (ROSTER names). */
  roster: string[];
  /** How many out at once. Default 3. */
  max?: number;
  look?: LookName;
  /** Where the models are served, ending in a slash. Default MODELS (jsDelivr). */
  models?: string;
  /** Seconds between arrivals, picked between the two. Default [6, 16]. */
  every?: [number, number];
  /** How near (metres) a lane must be for anyone to come on it. Default 18. */
  near?: number;
  /** How many may be out on one lane at once. Default 1 (2 while only one is out). */
  perLane?: number;
  /** The scene's lights cast them real shadows: no shadow cards, and their meshes cast and
   * take shadows. Default false. */
  castShadows?: boolean;
}

interface Out {
  c: Character;
  lane: Lane;
}

/** Going through to another lane: waiting till no one is looking there. */
interface Through {
  c: Character;
  lane: Lane;
  end: End;
  since: number;
}

/** How long one waits in a doorway for no one to be looking (s), before giving up. */
const PATIENCE = 12;

export class Roam {
  readonly lanes: Lane[];
  /** Off when it shouldn't call anyone new (those out stay till they go). */
  enabled = true;
  private opts: Required<Omit<RoamOptions, keyof LaneOptions>>;
  private byId = new Map<string, Lane>();
  private links = new Map<string, { lane: Lane; end: End }>();
  private members = new Map<string, Character>();
  private loading = new Set<string>();
  private out: Out[] = [];
  private through: Through[] = [];
  private time = 0;
  private next = 1.5;
  private frustum = new Frustum();
  private m = new Matrix4();
  private v = new Vector3();
  private poked = new Map<Character, number>();

  constructor(scene: Scene, options: RoamOptions) {
    const { px, bot, ceiling, ...rest } = options;
    this.opts = {
      links: [],
      max: 3,
      look: 'ink',
      models: MODELS,
      every: [6, 16],
      near: 18,
      perLane: 1,
      castShadows: false,
      ...rest,
    };
    this.lanes = options.lanes.map((spec) => new Lane(spec, { px, bot, ceiling }));
    for (const lane of this.lanes) {
      this.byId.set(lane.spec.id, lane);
      scene.add(lane.group);
    }
    for (const { a, b } of this.opts.links) {
      const la = this.byId.get(a.lane);
      const lb = this.byId.get(b.lane);
      if (!la || !lb) continue;
      this.links.set(`${a.lane}:${a.end}`, { lane: lb, end: b.end });
      this.links.set(`${b.lane}:${b.end}`, { lane: la, end: a.end });
    }
    if (typeof window !== 'undefined') {
      const size = () => setOutlineViewport(innerWidth, innerHeight);
      size();
      addEventListener('resize', size);
    }
  }

  /** Who's out, and on which lane. */
  get onStage(): readonly Out[] {
    return this.out;
  }

  /** A step: someone new now and then, everyone out moved, the gone let go. `camera` is
   * whoever is looking. */
  update(dt: number, camera: PerspectiveCamera) {
    this.time += dt;
    const eye = camera.position;
    this.m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.m);

    // Someone new, now and then.
    const busy = this.out.length + this.through.length;
    if (this.enabled && busy < this.opts.max && this.loading.size === 0) {
      this.next -= dt;
      if (this.next <= 0) {
        const [a, b] = this.opts.every;
        this.next = a + Math.random() * (b - a);
        void this.call(eye);
      }
    }

    // Through a doorway, when no one's looking at the other side.
    for (const t of [...this.through]) {
      const at = t.end === 'start' ? 0 : t.lane.length;
      if (!this.seen(t.lane, at)) {
        this.through.splice(this.through.indexOf(t), 1);
        const s = t.lane.length * (0.25 + Math.random() * 0.5);
        this.bring(t.c, t.lane, s, t.end);
      } else if (this.time - t.since > PATIENCE) this.through.splice(this.through.indexOf(t), 1);
    }

    // Each lane's crew live on their own frame: everyone on it, and where the eye is.
    for (const lane of this.lanes) {
      const here = this.out.filter((o) => o.lane === lane);
      if (!here.length) continue;
      const env = {
        frame: lane.frame,
        pointer: lane.pointer(eye, this.time),
        time: this.time,
        crew: here.map((o) => o.c),
        props: [],
      };
      for (const o of here) {
        o.c.update(dt, env);
        lane.place(o.c);
      }
    }

    // The ones who've gone: through to the next lane, if they walked off by a way through.
    for (const o of [...this.out]) {
      if (o.c.state !== 'gone') continue;
      o.lane.group.remove(o.c.holder);
      this.out.splice(this.out.indexOf(o), 1);
      const end: End | null = o.c.s < 0 ? 'start' : o.c.s > o.lane.length ? 'end' : null;
      const to = end && o.c.spec.entrance === 'walk' && this.links.get(`${o.lane.spec.id}:${end}`);
      if (to) this.through.push({ c: o.c, lane: to.lane, end: to.end, since: this.time });
    }
  }

  /** Bring someone onto a lane near the eye, where they won't be seen arriving. */
  private async call(eye: Vector3) {
    const busy = new Set([...this.out, ...this.through].map((o) => o.c));
    const names = this.opts.roster.filter((n) => {
      const c = this.members.get(n);
      return ROSTER[n] && !(c && busy.has(c));
    });
    if (!names.length) return;
    const lanes = this.lanes
      .map((lane) => ({ lane, d: lane.world(lane.length / 2, 0.5, this.v).distanceTo(eye) }))
      .filter((x) => {
        const on = this.out.filter((o) => o.lane === x.lane).length;
        return x.d < this.opts.near && (on < this.opts.perLane || this.out.length <= 1);
      })
      .sort((a, b) => a.d - b.d);
    if (!lanes.length) return;
    const c = await this.load(pickWeighted(names));
    if (!c || this.out.some((o) => o.c === c) || this.through.some((t) => t.c === c)) return;
    // The nearest lane with somewhere out of sight to come in by.
    for (const { lane } of lanes) {
      if (c.spec.entrance === 'walk') {
        const ends: End[] = Math.random() < 0.5 ? ['start', 'end'] : ['end', 'start'];
        const from = ends.find((e) => !this.seen(lane, e === 'start' ? 0 : lane.length));
        if (!from) continue;
        this.bring(c, lane, lane.length * (0.25 + Math.random() * 0.5), from);
      } else {
        // Up from the floor (or down from the air): somewhere on the lane out of sight.
        const s = [0.2, 0.5, 0.8].map((t) => t * lane.length).find((x) => !this.seen(lane, x));
        if (s === undefined) continue;
        this.bring(c, lane, s);
      }
      return;
    }
  }

  private bring(c: Character, lane: Lane, s: number, from?: End) {
    lane.group.add(c.holder);
    c.enter(lane.frame, 'bottom', s, from);
    lane.place(c);
    this.out.push({ c, lane });
  }

  /** Could the eye see that point of the lane (at the front, middle or back of it)? */
  private seen(lane: Lane, s: number) {
    return [0, 0.5, 1].some((d) => {
      const p = lane.world(s, d, this.v);
      p.y = 0.4;
      return this.frustum.containsPoint(p);
    });
  }

  private async load(name: string): Promise<Character | null> {
    const had = this.members.get(name);
    if (had) return had;
    if (this.loading.has(name)) return null;
    this.loading.add(name);
    try {
      const member = ROSTER[name];
      const file = /^([a-z][a-z\d+.-]*:|\/)/i.test(member.file) ? member.file : this.opts.models + member.file;
      const c = member.make(await loadModel(file));
      c.dress(this.opts.look);
      if (this.opts.castShadows) {
        c.shadowCard = false;
        c.model.traverse((o) => {
          const m = o as { isMesh?: boolean; castShadow: boolean; receiveShadow: boolean };
          if (m.isMesh) m.castShadow = m.receiveShadow = true;
        });
      }
      this.members.set(name, c);
      return c;
    } catch (e) {
      console.error(`creatures: ${name} couldn't come`, e);
      return null;
    } finally {
      this.loading.delete(name);
    }
  }

  /** The one of those out a ray (from the camera, say) meets first, if any. */
  pick(ray: Ray): Character | null {
    let best: Character | null = null;
    let bestD = Infinity;
    for (const { c, lane } of this.out) {
      if (c.state === 'gone') continue;
      // Its box, as a sphere: near enough to point at.
      const centre = c.holder.getWorldPosition(this.v);
      const r = (c.heightPx / lane.px) * 0.5;
      centre.y += r;
      if (ray.distanceSqToPoint(centre) < r * r) {
        const along = centre.sub(ray.origin).dot(ray.direction);
        if (along > 0 && along < bestD) {
          bestD = along;
          best = c;
        }
      }
    }
    return best;
  }

  /** Poked: it notices; poked again soon after, a trick. */
  poke(c: Character) {
    const last = this.poked.get(c) ?? -10;
    this.poked.set(c, this.time);
    if (this.time - last < 3) c.trick();
    else c.poke();
  }

  /** The pointer's over one (or none): it knows. */
  hover(c: Character | null) {
    for (const { c: o } of this.out) o.hovered = o === c;
  }

  /** A new look for everyone. */
  dress(look: LookName) {
    this.opts.look = look;
    for (const c of this.members.values()) c.dress(look);
  }
}

function pickWeighted(names: string[]) {
  const total = names.reduce((s, n) => s + ROSTER[n].weight, 0);
  let r = Math.random() * total;
  for (const n of names) if ((r -= ROSTER[n].weight) <= 0) return n;
  return names[names.length - 1];
}
