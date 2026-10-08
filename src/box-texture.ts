import { assets } from './assets';
import { pixelRatio } from './stage';

/**
 * The rooms as pictures (box.ts): a picture of each room, a library, an office, a lab and a
 * jungle (models/pic/ROOM.webp, made by blender/tex/pictures.py), each the whole room
 * seen from its open front in one-point perspective, as the box is: the back wall straight on,
 * the side walls, the floor and the ceiling running back to it (GEOMETRY says where its back
 * wall and its corners are in each picture). An SVG image can't recede, so each of the
 * picture's surfaces is laid on the same surface of the box, on one canvas the size of the
 * frame, and box.ts lays that over its paint, opaque, under the lamps' light and the doors. It
 * is drawn once for each new frame.
 *
 * The box's room isn't the picture's: wider or narrower, deeper or shallower, the eye higher or
 * lower. So a point is matched by where it is on its surface: how far across it and up it (as
 * shares of the back wall's width and height, along lines running back) and how far back (a
 * share of the room's depth). Up and back map evenly; across, the picture's two ends keep their
 * shape, at the scale up goes at, and its middle (behind the monitor) takes up the difference.
 * Each surface is flat, so that's exact: what runs back in the picture runs back to the box's
 * vanishing point, and the corners meet. (A picture's own corners don't quite run to one point,
 * as drawn: each surface goes by the point its own two corners run to.)
 *
 * The pictures are 4K (3840 by 2560), clean and finely drawn, so they're never stretched up on
 * a retina screen.
 */

/** The rooms there are pictures of: the library (the reading room, and the Writing section's
 * room), and the office, the lab and the jungle other sections are in. */
export type Setting = 'library' | 'office' | 'lab' | 'jungle';

const LAYOUTS: Record<
  Setting,
  {
    /** A touch of dark over it all (the library's, so its lamps have something to light). */
    dim: number;
    /** Under the picture, wherever it doesn't quite reach. */
    base: string;
  }
> = {
  library: { dim: 0.1, base: '#2b1a0f' },
  office: { dim: 0, base: '#e6dfd2' },
  lab: { dim: 0, base: '#e4e4e2' },
  jungle: { dim: 0.04, base: '#1f2b1c' },
};

/** Where the room is in each picture, in px of it at 1536 by 1024 (DRAFT: the size it was drawn
 * at, before it was made 4K): its back wall (left, top, right, bottom), and where its four
 * corners (top left, top right, bottom left, bottom right) run out of the picture's left or
 * right edge, down it. */
const GEOMETRY: Record<
  Setting,
  { back: [number, number, number, number]; corners: [number, number, number, number] }
> = {
  library: { back: [139.5, 55, 1395.5, 839], corners: [-19, -1, 950.5, 949.5] },
  office: { back: [189, 115, 1343.5, 747], corners: [-31, -28.5, 853, 858.5] },
  lab: { back: [109.5, 69, 1397.5, 781], corners: [17, -17.5, 834, 863.5] },
  jungle: { back: [139, 77.5, 1395, 727.5], corners: [1.5, 0, 855.5, 866] },
};
const DRAFT = 1536;

/** The doors in the rooms' pictures (only the library's has one, in the middle of its back
 * wall): the leaf's left edge, its top and its right edge, in px as GEOMETRY's (it stands on the
 * floor). It's hinged on the left. */
const DOORS: Partial<Record<Setting, [number, number, number]>> = {
  library: [640, 252, 890],
};

/** The wall clocks in the rooms' pictures (only the library's has one, right of its door): the
 * ring's middle and its two radii, across and down, in px as GEOMETRY's. */
const CLOCKS: Partial<Record<Setting, [number, number, number, number]>> = {
  library: [1194, 343.4, 74.8, 82.6],
};

/** How much of the picture's width at each end keeps its shape across (a share of it), and at
 * most how much of the box's width each end takes (a narrow screen squeezes them). */
const ENDS = 0.24;
const ENDS_MOST = 0.32;

export interface Room {
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** The back wall's corners (x), its top and the floor's line (y). */
  bl: number;
  br: number;
  cb: number;
  fb: number;
  /** The back wall's scale, the vanishing point, and the eye's distance from the front (px). */
  k: number;
  vx: number;
  vy: number;
  eye: number;
}

const pictures = new Map<Setting, HTMLImageElement>();
const loading = new Map<Setting, Promise<void>>();

/** Load a room's picture (once, when it's first wanted), and call `fn` when it's in. */
export function whenReady(setting: Setting, fn: () => void) {
  if (typeof document === 'undefined') return;
  let ready = loading.get(setting);
  if (!ready) {
    const image = new Image();
    image.src = `${assets}pic/${setting}.webp`;
    ready = image.decode().then(() => {
      pictures.set(setting, image);
    });
    loading.set(setting, ready);
  }
  void ready.then(fn, () => undefined);
}

type Point = [number, number];

/** Where the line through a and b crosses the one through c and d. */
const meet = ([ax, ay]: Point, [bx, by]: Point, [cx, cy]: Point, [dx, dy]: Point): Point => {
  const [ux, uy, wx, wy] = [bx - ax, by - ay, dx - cx, dy - cy];
  const t = ((cx - ax) * wy - (cy - ay) * wx) / (ux * wy - uy * wx || 1e-9);
  return [ax + ux * t, ay + uy * t];
};

/**
 * How a picture's room lies on the box's room, the picture `w` by `h` px. `back` is its back
 * wall in its px,
 * `to` the point each of its surfaces runs back to (where its two corners meet), `out` how far
 * its room comes out (the front's scale, from the back wall, as far as the picture goes all
 * round), and `pieces` the three parts across, each [box from, box to, picture from, picture to]
 * as shares of the back wall's width: the two ends at the scale up goes at, the middle between.
 */
function fit(setting: Setting, [w, h]: [number, number], room: Room) {
  const { back, corners } = GEOMETRY[setting];
  const at = w / DRAFT;
  const [l, t, r, b] = back.map((n) => n * at);
  const [tl, tr, bl, br] = corners.map((n) => n * at);
  const lines: Record<'tl' | 'tr' | 'bl' | 'br', [Point, Point]> = {
    tl: [
      [l, t],
      [0, tl],
    ],
    tr: [
      [r, t],
      [w, tr],
    ],
    bl: [
      [l, b],
      [0, bl],
    ],
    br: [
      [r, b],
      [w, br],
    ],
  };
  const to = {
    floor: meet(...lines.bl, ...lines.br),
    ceiling: meet(...lines.tl, ...lines.tr),
    left: meet(...lines.tl, ...lines.bl),
    right: meet(...lines.tr, ...lines.br),
  };
  // As far out as every surface's front corners are still in the picture.
  const most = (from: number, edge: number, size: number) =>
    edge > from ? (size - from) / (edge - from) : edge < from ? from / (from - edge) : Infinity;
  const out = Math.min(
    ...[to.floor, to.ceiling].flatMap(([x]) => [most(x, l, w), most(x, r, w)]),
    most(to.floor[1], b, h),
    most(to.ceiling[1], t, h),
    ...[to.left, to.right].flatMap(([, y]) => [most(y, t, h), most(y, b, h)]),
    most(to.left[0], l, w),
    most(to.right[0], r, w),
  );
  // A back wall narrower for its height than the picture's (a phone's): the middle of the
  // picture's, across at the scale up goes at (squeezed in, the room looked stretched up), and
  // its ends off the sides. Wider, the ends keep their shape and the middle takes the rest.
  const fits = (room.br - room.bl) / (room.fb - room.cb) / ((r - l) / (b - t));
  if (fits < 1) {
    const pieces: [number, number, number, number][] = [[0, 1, 0.5 - fits / 2, 0.5 + fits / 2]];
    return { back: { l, t, r, b }, to, out, pieces };
  }
  const ends = Math.min(ENDS / fits, ENDS_MOST);
  const pieces: [number, number, number, number][] = [
    [0, ends, 0, ENDS],
    [ends, 1 - ends, ENDS, 1 - ENDS],
    [1 - ends, 1, 1 - ENDS, 1],
  ];
  return { back: { l, t, r, b }, to, out, pieces };
}

/** A room's surfaces on a canvas the size of the frame (its origin is the frame's top left),
 * or null while its picture isn't in yet. */
export function paintRoom(setting: Setting, room: Room, scale = 1): HTMLCanvasElement | null {
  const picture = typeof document === 'undefined' ? undefined : pictures.get(setting);
  if (!picture) return null;
  const { dim, base } = LAYOUTS[setting];
  const { left, right, top, bottom, bl, br, cb, fb, k, vx, vy } = room;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil((right - left) * scale));
  canvas.height = Math.max(1, Math.ceil((bottom - top) * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);
  ctx.translate(-left, -top);
  // The picture brought to about the size it's drawn at (once, smoothly), so each strip below
  // is read off it near one to one: strips read off the whole 4K picture, each smoothed on its
  // own, take seconds to draw.
  const [w, h] = [picture.naturalWidth, picture.naturalHeight];
  const [, wallTop, , wallFoot] = GEOMETRY[setting].back;
  const near = Math.min(1, (((fb - cb) * scale) / ((wallFoot - wallTop) * (w / DRAFT))) * 1.25);
  const source = document.createElement('canvas');
  source.width = Math.round(w * near);
  source.height = Math.round(h * near);
  const sctx = source.getContext('2d')!;
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(picture, 0, 0, source.width, source.height);
  const { back: p, to, out, pieces } = fit(setting, [source.width, source.height], room);
  const d = 1 / scale; // one device px
  /** How far out the picture's surface is (its scale, from the back wall) where the box's is
   * `m` out: the same share of each room's depth. */
  const outIn = (m: number) => 1 / (1 - ((1 - 1 / m) / (1 - k || 1e-6)) * (1 - 1 / out));
  /** A strip across the back wall, the floor or the ceiling, `m` out in the box and `pm` in the
   * picture (towards `[fx]`, its surface's point), from picture rows sy0..sy1 to box rows
   * y0..y1, piece by piece. */
  const across = (
    m: number,
    pm: number,
    fx: number,
    sy0: number,
    sy1: number,
    y0: number,
    y1: number,
  ) => {
    for (const [u0, u1, s0, s1] of pieces) {
      const [a, b] = [u0, u1].map((u) => vx + (bl + u * (br - bl) - vx) * m);
      const [sa, sb] = [s0, s1].map((u) => fx + (p.l + u * (p.r - p.l) - fx) * pm);
      ctx.drawImage(
        source,
        sa,
        sy0,
        sb - sa,
        Math.max(0.5, sy1 - sy0),
        a,
        y0,
        b - a + d / 2,
        y1 - y0,
      );
    }
  };

  // The back wall: straight on.
  across(1, 1, 0, p.t, p.b, cb, fb);

  // The floor and the ceiling, row by row: each row as far back in the picture as it is in the
  // box, out to its corners.
  for (const [[fx, fy], edge, from, to0, step] of [
    [to.floor, p.b, fb, bottom, d],
    [to.ceiling, p.t, cb, top, -d],
  ] as const) {
    const m = (y: number) => (y - vy) / (from - vy);
    const sy = (pm: number) => fy + (edge - fy) * pm;
    for (let y = from; step > 0 ? y < to0 : y > to0; y += step) {
      const [a, b] = [m(y), m(y + step)];
      const [y0, y1] = step > 0 ? [y, y + step * 1.2] : [y + step * 1.2, y];
      const [s0, s1] = [sy(outIn(a)), sy(outIn(b))].sort((i, j) => i - j);
      across((a + b) / 2, outIn((a + b) / 2), fx, s0, s1, y0, y1);
    }
  }

  // The side walls, column by column, the same way: each column as far back in the picture as
  // it is in the box, from the ceiling's corner to the floor's.
  for (const [[sx, sy], edge, from, to0, step] of [
    [to.left, p.l, bl, left, -d],
    [to.right, p.r, br, right, d],
  ] as const) {
    const m = (x: number) => (x - vx) / (from - vx);
    const col = (pm: number) => sx + (edge - sx) * pm;
    for (let x = from; step > 0 ? x < to0 : x > to0; x += step) {
      const [a, b] = [m(x), m(x + step)];
      const [s0, s1] = [col(outIn(a)), col(outIn(b))].sort((i, j) => i - j);
      const mm = (a + b) / 2;
      const pm = outIn(mm);
      ctx.drawImage(
        source,
        s0,
        sy + (p.t - sy) * pm,
        Math.max(0.5, s1 - s0),
        (p.b - p.t) * pm,
        step > 0 ? x : x + step * 1.2,
        vy + (cb - vy) * mm,
        d * 1.2,
        (fb - cb) * mm,
      );
    }
  }

  if (dim) {
    ctx.fillStyle = `rgba(12,6,2,${dim})`;
    ctx.fillRect(left, top, right - left, bottom - top);
  }
  return canvas;
}

/** Where a room's own door is on its back wall (viewport px), as its picture is laid there
 * (paintRoom): null if it has none, or its picture isn't in. */
export function doorOf(setting: Setting, room: Room) {
  const door = DOORS[setting];
  const picture = pictures.get(setting);
  if (!door || !picture) return null;
  const { back: p, pieces } = fit(setting, [picture.naturalWidth, picture.naturalHeight], room);
  const { bl, br, cb, fb } = room;
  const at = picture.naturalWidth / DRAFT;
  // Its share across the picture's back wall, and across the box's (piece by piece).
  const x = (px: number) => {
    const u = (px * at - p.l) / (p.r - p.l);
    const [u0, u1, s0, s1] = pieces.find(([, , , s1]) => u <= s1) ?? pieces[pieces.length - 1];
    return bl + (u0 + ((u - s0) / (s1 - s0)) * (u1 - u0)) * (br - bl);
  };
  const top = cb + ((door[1] * at - p.t) / (p.b - p.t)) * (fb - cb);
  return { x0: x(door[0]), x1: x(door[2]), top, bottom: fb };
}

/** Where a room's wall clock is on its back wall (viewport px: its middle and its radii), as
 * its picture is laid there (paintRoom): null if it has none, or its picture isn't in. */
export function clockOf(setting: Setting, room: Room) {
  const clock = CLOCKS[setting];
  const picture = pictures.get(setting);
  if (!clock || !picture) return null;
  const { back: p, pieces } = fit(setting, [picture.naturalWidth, picture.naturalHeight], room);
  const { bl, br, cb, fb } = room;
  const at = picture.naturalWidth / DRAFT;
  const x = (px: number) => {
    const u = (px * at - p.l) / (p.r - p.l);
    const [u0, u1, s0, s1] = pieces.find(([, , , s1]) => u <= s1) ?? pieces[pieces.length - 1];
    return bl + (u0 + ((u - s0) / (s1 - s0)) * (u1 - u0)) * (br - bl);
  };
  const [cx, cy, rx, ry] = clock;
  const rise = (fb - cb) / (p.b - p.t);
  // (Off the sides of a narrow back wall, with the picture's ends: no clock to keep.)
  if (x(cx - rx) < bl || x(cx + rx) > br) return null;
  return {
    x: x(cx),
    y: cb + (cy * at - p.t) * rise,
    rx: (x(cx + rx) - x(cx - rx)) / 2,
    ry: ry * at * rise,
  };
}

/** Whether a room's picture is in. */
export const hasPictures = (setting: Setting) => pictures.has(setting);

/**
 * A room's picture in an SVG image, kept drawn for the frame: drawn again only when the frame
 * or the room changes, and while the frame keeps changing (a window being dragged) the last
 * picture just stretches to it, and is drawn again once the size has held for a moment
 * (`again` is called then, to draw it).
 */
/** Pictures already drawn (by `key`, as `paint` makes it), and how many images show each: the
 * library is the section's room and the pub both, in the same frame, and is drawn (and its
 * JPEG made) once, not twice. */
const drawnPictures = new Map<string, { url: string; users: number }>();

export class Painting {
  /** The room the picture in the image is of (null till one is in). */
  shown: Setting | null = null;
  private key = '';
  private url = '';
  private entry: { url: string; users: number } | null = null;
  private entryKey = '';
  private turn = 0;
  private due = '';
  private wait = '';
  private settle = 0;

  constructor(
    readonly image: SVGImageElement,
    private again: () => void,
  ) {}

  /** No longer showing the picture it had: it's let go of when no image shows it. */
  private leave() {
    const e = this.entry;
    if (!e) return;
    this.entry = null;
    if (--e.users > 0) return;
    URL.revokeObjectURL(e.url);
    if (drawnPictures.get(this.entryKey) === e) drawnPictures.delete(this.entryKey);
  }

  /** Draw it the next time it's asked to (its picture has just come in). */
  stale() {
    this.key = '';
  }

  /** Draw `setting` for this room, if it isn't drawn for it already; `drawn` is called once
   * the picture is in the image. */
  paint(setting: Setting, room: Room, drawn?: () => void) {
    const key = `${setting} ${Object.values(room)
      .map((n) => Math.round(n))
      .join()}`;
    if (key === this.key) return;
    const image = this.image;
    image.setAttribute('x', room.left.toFixed(1));
    image.setAttribute('y', room.top.toFixed(1));
    image.setAttribute('width', (room.right - room.left).toFixed(1));
    image.setAttribute('height', (room.bottom - room.top).toFixed(1));
    if (this.url && this.shown === setting && this.due !== key) {
      if (this.wait !== key) {
        this.wait = key;
        clearTimeout(this.settle);
        this.settle = window.setTimeout(() => {
          this.due = key;
          this.again();
        }, 150);
      }
      return;
    }
    // Drawn already for another image (the same room, the same frame): that one.
    const have = drawnPictures.get(key);
    if (have && have.users > 0 && have !== this.entry) {
      this.key = key;
      this.turn++;
      have.users++;
      image.setAttribute('href', have.url);
      this.leave();
      this.entry = have;
      this.entryKey = key;
      this.url = have.url;
      this.shown = setting;
      drawn?.();
      return;
    }
    const canvas = paintRoom(setting, room, pixelRatio());
    if (!canvas) return; // (its picture isn't in yet: it's drawn when it is)
    this.key = key;
    const turn = ++this.turn;
    canvas.toBlob(
      (blob) => {
        if (!blob || turn !== this.turn) return;
        const url = URL.createObjectURL(blob);
        image.setAttribute('href', url);
        this.leave();
        this.entry = { url, users: 1 };
        this.entryKey = key;
        drawnPictures.set(key, this.entry);
        this.url = url;
        this.shown = setting;
        drawn?.();
      },
      'image/jpeg',
      0.92,
    );
  }
}
