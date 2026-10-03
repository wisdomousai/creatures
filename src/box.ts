import { doorOf, type Room, type Setting, Painting, whenReady } from './box-texture';
import type { Frame } from './character';

const SVG = 'http://www.w3.org/2000/svg';

/**
 * Where the eye is, as a share of the frame's height from the top: a little above the
 * middle, so we look down into the box a touch and see more floor than ceiling.
 */
const EYE = 0.36;

/** How far the eye is from the front of the box, in frame heights. */
const EYE_DISTANCE = 1.2;

/** How long a room's picture takes to fade in or out (s), and how dark it goes on dark paper. */
const FADE = 0.5;
const NIGHT = 0.55;

type Stops = [number, string, number][];

const CARD = 'var(--card, #fff)';
const LIT = 'var(--ink, #ecece8)';

/**
 * The box's shading in each theme. On light paper it is shaded with a breath of black and
 * lit with the white card colour. On dark paper that would not show: the shadows go much
 * deeper, and the lamps and their pools are lit with the ink colour instead, faintly.
 */
const TONES: Record<'light' | 'dark', Record<Shade, Stops> & { lamp: string }> = {
  light: {
    floor: [
      [0, '#000', 0.075],
      [0.3, '#000', 0.03],
      [1, '#000', 0],
    ],
    ceiling: [
      [0, '#000', 0.012],
      [0.6, '#000', 0.022],
      [1, '#000', 0.05],
    ],
    wall: [
      [0, '#000', 0.04],
      [1, '#000', 0],
    ],
    glow: [
      [0, CARD, 1],
      [0.45, CARD, 0.7],
      [1, CARD, 0],
    ],
    pool: [
      [0, CARD, 0.75],
      [1, CARD, 0],
    ],
    beam: [
      [0, CARD, 0.8],
      [1, CARD, 0],
    ],
    hole: [
      [0, '#000', 0.62],
      [0.75, '#000', 0.45],
      [1, '#000', 0.18],
    ],
    lamp: CARD,
  },
  dark: {
    floor: [
      [0, '#000', 0.34],
      [0.3, '#000', 0.16],
      [1, '#000', 0.03],
    ],
    ceiling: [
      [0, '#000', 0.1],
      [0.6, '#000', 0.14],
      [1, '#000', 0.28],
    ],
    wall: [
      [0, '#000', 0.2],
      [1, '#000', 0],
    ],
    glow: [
      [0, LIT, 0.42],
      [0.45, LIT, 0.14],
      [1, LIT, 0],
    ],
    pool: [
      [0, LIT, 0.085],
      [1, LIT, 0],
    ],
    beam: [
      [0, LIT, 0.09],
      [1, LIT, 0],
    ],
    hole: [
      [0, '#000', 0.82],
      [0.75, '#000', 0.64],
      [1, '#000', 0.3],
    ],
    lamp: 'var(--ink-soft, #b9b9b2)',
  },
};
type Shade = 'floor' | 'ceiling' | 'wall' | 'glow' | 'pool' | 'beam' | 'hole';

/** The library as a pub: plaster, dark wood, and brass lamps with warm bulbs. */
const PUB = {
  plaster: [
    [0, '#3f2a1b', 1],
    [0.55, '#6e4b30', 1],
    [1, '#7d5638', 1],
  ] as Stops,
  wood: [
    [0, '#402818', 1],
    [1, '#2b1a0f', 1],
  ] as Stops,
  floor: [
    [0, '#26170d', 1],
    [1, '#5a3a24', 1],
  ] as Stops,
  ceiling: [
    [0, '#22160d', 1],
    [1, '#33221a', 1],
  ] as Stops,
  bulb: [
    [0, '#fff4da', 1],
    [0.18, '#ffd28a', 0.75],
    [0.5, '#ffb35a', 0.22],
    [1, '#ff9a3a', 0],
  ] as Stops,
  cone: [
    [0, '#ffcf85', 0.13],
    [1, '#ffb863', 0],
  ] as Stops,
  pool: [
    [0, '#ffc672', 0.42],
    [1, '#ffb45c', 0],
  ] as Stops,
  wash: [
    [0, '#ffbb6a', 0.22],
    [1, '#ffab55', 0],
  ] as Stops,
  vignette: [
    [0.55, '#0b0603', 0],
    [1, '#0b0603', 0.6],
  ] as Stops,
  panel: '#6a4428',
  rail: '#8c603b',
  plank: '#1c1109',
  joist: '#150d07',
  shade: '#2f3b2d',
  brass: '#b88d4c',
};

type Surface = {
  fill: SVGPathElement;
  walls: SVGPathElement;
  lines: SVGPathElement;
  posts: SVGPathElement;
  shade: SVGLinearGradientElement;
  wallFade: SVGLinearGradientElement;
  postFade: SVGLinearGradientElement;
};

/**
 * The box the crew live in. The window frame is the open front of a shallow box, seen
 * from a little above its middle (EYE), so the floor along the bottom of the frame is
 * deep and the ceiling along the top is a thin strip. The frame line is the front lip; a
 * line a little further in is where the floor (or ceiling) meets the back wall; lines run
 * from the frame's corners toward the vanishing point, where the side walls meet them;
 * and the back corners' edges run a short way up (or down) and fade out.
 *
 * The two are told apart the way a room's are: the floor is darkest at the back, where
 * things stand; the ceiling is lit, shaded only just under the front lip, and carries a
 * row of flush lamps, each with a soft pool of light on the floor under it.
 *
 * No 3D: lines and gradients in the site's colours, under the crew's canvas. The crew go
 * back into it in the same perspective (Character.depth), smaller, and nearer the
 * vanishing point.
 */
export class Box {
  readonly el: SVGSVGElement;
  private floor: Surface;
  private ceiling: Surface;
  private lamps: SVGGElement;
  private pools: SVGGElement;
  /** Firelight on the back wall and the floor (the library's fire). */
  private fire: SVGGElement;
  private fireWall: SVGEllipseElement;
  private fireFloor: SVGEllipseElement;
  /** The ways in and out: a door in the back wall and one in a side wall, a trapdoor in
   * the floor and a hatch in the ceiling. */
  readonly doors: Door[];
  private doorLayer: SVGGElement;
  private defs: SVGDefsElement;
  private id: string;
  /** Holes opened for a moment (a decoration let down from the ceiling), closed and gone. */
  private portals: Door[] = [];
  private mounted = 0;
  private frame: Frame | null = null;
  private lampGlow: string;
  private poolGlow: string;
  private beams: SVGRadialGradientElement[];
  private cones: SVGRadialGradientElement[];
  /** The pub (0 none .. 1 all of it): its walls, floor and ceiling, and its lamps. */
  private pubLevel = 0;
  private pubBack: SVGGElement;
  private pubLamps: SVGGElement;
  private pubClip: SVGRectElement;
  private pub_: Record<
    'wall' | 'sides' | 'wainscot' | 'panels' | 'rail' | 'floor' | 'planks' | 'ceiling' | 'joists',
    SVGPathElement
  >;
  private pubVignette: SVGRectElement;
  /** The pub's pictures (box-texture.ts), laid over its paint. */
  private pubPainting: Painting;
  private textureWanted = false;
  /** The everyday room a section is in (box-texture.ts; null: the plain white box), the one
   * wanted next, and how far its picture is in (0 .. 1). */
  private setting: Setting | null = null;
  private wanted: Setting | null = null;
  private sceneryLevel = 0;
  private scenery: Painting;
  private sceneryBack: SVGGElement;
  private sceneryClip: SVGRectElement;
  private sceneryShade: SVGRectElement;
  private pubPaint: Record<'plaster' | 'wood' | 'floor' | 'ceiling', SVGLinearGradientElement>;
  /** The gradients that change with the theme. */
  private shades: [Shade, SVGGradientElement][] = [];
  private make: <K extends keyof SVGElementTagNameMap>(
    tag: K,
    attrs?: Record<string, string>,
  ) => SVGElementTagNameMap[K];

  /** Goes into the page just before `canvas`, on the same layer (so under it). */
  constructor(canvas: HTMLElement) {
    const id = `robot-box-${Math.random().toString(36).slice(2, 8)}`;
    this.id = id;
    const make = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string> = {},
    ) => {
      const e = document.createElementNS(SVG, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      return e;
    };
    this.make = make;
    const defs = make('defs');
    this.defs = defs;
    const stops = <T extends SVGElement>(g: T, list: Stops | Shade) => {
      if (typeof list === 'string') this.shades.push([list, g as unknown as SVGGradientElement]);
      else fill(g, list);
      defs.appendChild(g);
      return g;
    };
    const gradient = (name: string, list: Stops | Shade) =>
      stops(make('linearGradient', { id: `${id}-${name}`, gradientUnits: 'userSpaceOnUse' }), list);
    const rule = 'var(--rule-strong, #d6d6d1)';
    const line = { fill: 'none', 'stroke-width': '1', 'vector-effect': 'non-scaling-stroke' };
    // Each gradient runs from the back line (0) to the front lip (1), or from the back
    // corner (0) along its edge (1).
    const surface = (name: 'floor' | 'ceiling'): Surface => ({
      shade: gradient(`${name}-shade`, name),
      wallFade: gradient(`${name}-wall`, 'wall'),
      postFade: gradient(`${name}-post`, [
        [0, rule, 1],
        [1, rule, 0],
      ]),
      fill: make('path', { fill: `url(#${id}-${name}-shade)` }),
      walls: make('path', { fill: `url(#${id}-${name}-wall)` }),
      lines: make('path', { ...line, stroke: rule }),
      posts: make('path', { ...line, stroke: `url(#${id}-${name}-post)` }),
    });
    // The floor: darkest where it meets the back wall. The ceiling: barely shaded at the
    // back, a little more just under the front lip.
    this.floor = surface('floor');
    this.ceiling = surface('ceiling');
    // The lamps' glow and the pools of light they throw, fading.
    stops(make('radialGradient', { id: `${id}-glow` }), 'glow');
    stops(make('radialGradient', { id: `${id}-pool` }), 'pool');
    // Each lamp's beam (and each pub lamp's): an ellipse of light fading every way from
    // the lamp, one gradient each, aimed as the lamps are hung.
    const aimed = (name: string, list: Stops | Shade) =>
      [0, 1, 2, 3].map((i) =>
        stops(
          make('radialGradient', { id: `${id}-${name}${i}`, gradientUnits: 'userSpaceOnUse' }),
          list,
        ),
      );
    this.beams = aimed('beam', 'beam');
    this.lampGlow = `url(#${id}-glow)`;
    this.poolGlow = `url(#${id}-pool)`;
    // The pub: paint (from the back line out), its lamps' light, and a darkening at the edges.
    this.pubPaint = {
      plaster: gradient('pub-plaster', PUB.plaster),
      wood: gradient('pub-wood', PUB.wood),
      floor: gradient('pub-floor', PUB.floor),
      ceiling: gradient('pub-ceiling', PUB.ceiling),
    };
    stops(make('radialGradient', { id: `${id}-pub-bulb` }), PUB.bulb);
    this.cones = aimed('pub-cone', PUB.cone);
    stops(make('radialGradient', { id: `${id}-pub-pool` }), PUB.pool);
    stops(make('radialGradient', { id: `${id}-pub-wash` }), PUB.wash);
    stops(make('radialGradient', { id: `${id}-pub-vignette`, r: '0.75' }), PUB.vignette);
    const clipPub = make('clipPath', { id: `${id}-pub-clip` });
    this.pubClip = make('rect');
    clipPub.appendChild(this.pubClip);
    defs.appendChild(clipPub);
    const paint = (fill: string, extra: Record<string, string> = {}) =>
      make('path', { fill, ...extra });
    const strokeOf = (colour: string, width = '1') =>
      paint('none', {
        stroke: colour,
        'stroke-width': width,
        'vector-effect': 'non-scaling-stroke',
      });
    this.pub_ = {
      wall: paint(`url(#${id}-pub-plaster)`),
      sides: paint('#000', { 'fill-opacity': '0.28' }),
      wainscot: paint(`url(#${id}-pub-wood)`),
      panels: strokeOf(PUB.panel),
      rail: strokeOf(PUB.rail, '2'),
      floor: paint(`url(#${id}-pub-floor)`),
      planks: strokeOf(PUB.plank),
      ceiling: paint(`url(#${id}-pub-ceiling)`),
      joists: paint(PUB.joist),
    };
    const pubImage = make('image', { preserveAspectRatio: 'none' });
    this.pubPainting = new Painting(pubImage, () => {
      if (this.pubLevel > 0 && this.frame) this.drawPub(this.frame, this.radius);
    });
    this.pubBack = make('g', { 'clip-path': `url(#${id}-pub-clip)`, opacity: '0' });
    this.pubBack.style.display = 'none';
    const p = this.pub_;
    this.pubBack.append(
      p.wall,
      p.wainscot,
      p.panels,
      p.rail,
      p.sides,
      p.floor,
      p.planks,
      p.ceiling,
      p.joists,
      pubImage,
    );
    // The everyday room's picture, under everything else, darker as the page is.
    const sceneryImage = make('image', { preserveAspectRatio: 'none' });
    this.scenery = new Painting(sceneryImage, () => {
      if (this.frame) this.drawScenery(this.frame, this.radius);
    });
    this.sceneryShade = make('rect', { fill: '#000', opacity: '0' });
    const clipScenery = make('clipPath', { id: `${id}-scenery-clip` });
    this.sceneryClip = make('rect');
    clipScenery.appendChild(this.sceneryClip);
    defs.appendChild(clipScenery);
    this.sceneryBack = make('g', { 'clip-path': `url(#${id}-scenery-clip)`, opacity: '0' });
    this.sceneryBack.style.display = 'none';
    this.sceneryBack.append(sceneryImage, this.sceneryShade);
    this.pubLamps = make('g', { 'clip-path': `url(#${id}-pub-clip)`, opacity: '0' });
    this.pubLamps.style.display = 'none';
    this.pubVignette = make('rect', { fill: `url(#${id}-pub-vignette)` });
    this.lamps = make('g', { stroke: rule, 'stroke-width': '1' });
    this.pools = make('g');
    // Firelight: warm, brightest round the fire, and gone a little way off.
    stops(make('radialGradient', { id: `${id}-fire` }), [
      [0, '#ff9b4f', 0.55],
      [0.4, '#ff8a3c', 0.24],
      [1, '#ff7a2c', 0],
    ]);
    this.fireWall = make('ellipse', { fill: `url(#${id}-fire)` });
    this.fireFloor = make('ellipse', { fill: `url(#${id}-fire)` });
    this.fire = make('g', { opacity: '0' });
    this.fire.append(this.fireWall, this.fireFloor);
    const group = (s: Surface) => {
      const g = make('g');
      g.append(s.fill, s.walls, s.lines, s.posts);
      return g;
    };
    const el = make('svg', { 'aria-hidden': 'true' });
    el.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;';
    el.style.zIndex = getComputedStyle(canvas).zIndex;
    // Where the doors go this time: the back door and the side door on opposite sides, in
    // the margins beside the content; the hatches somewhere along the floor and ceiling.
    const west = Math.random() < 0.5;
    const across = (a: number) => (west ? a : 1 - a);
    this.doors = [
      new Door('back', across(0.09), 1),
      new Door(west ? 'right' : 'left', 0, 0.35 + Math.random() * 0.3),
      new Door('floor', across(0.2 + Math.random() * 0.2), 0.45 + Math.random() * 0.25),
      new Door('ceiling', across(0.55 + Math.random() * 0.3), 0.5),
    ];
    this.doorLayer = make('g');
    // Inside a hole: dark in the middle, softer at the rim; the floor going on behind a
    // doorway fades into it.
    stops(make('radialGradient', { id: `${id}-hole` }), 'hole');
    stops(make('linearGradient', { id: `${id}-corridor`, x1: '0', x2: '0', y1: '1', y2: '0' }), [
      [0, 'var(--paper, #f4f4f1)', 0.45],
      [1, 'var(--paper, #f4f4f1)', 0],
    ]);
    // The hall behind a room's own door: boards, dim, going off into the dark.
    stops(make('linearGradient', { id: `${id}-hall`, x1: '0', x2: '0', y1: '1', y2: '0' }), [
      [0, '#5a3d27', 0.5],
      [1, '#5a3d27', 0],
    ]);
    this.doors.forEach((door) => this.mount(door));
    el.append(
      defs,
      this.sceneryBack,
      this.pubBack,
      group(this.floor),
      this.pools,
      this.fire,
      group(this.ceiling),
      this.lamps,
      this.pubLamps,
      this.doorLayer,
    );
    this.el = el;
    this.theme(false);
    canvas.parentNode?.insertBefore(el, canvas);
  }

  /** Give a door its drawing: the hole, the floor going on inside it, and its rim. */
  private mount(door: Door) {
    const clip = `${this.id}-door${this.mounted++}`;
    const path = this.make('clipPath', { id: clip });
    door.opening = this.make('path');
    path.appendChild(door.opening);
    this.defs.appendChild(path);
    door.hole = this.make('path', { fill: `url(#${this.id}-hole)` });
    door.corridor = this.make('path', {
      fill: `url(#${this.id}-corridor)`,
      'clip-path': `url(#${clip})`,
    });
    door.rim = this.make('path', {
      fill: 'none',
      'stroke-width': '1',
      'vector-effect': 'non-scaling-stroke',
      stroke: 'var(--rule-strong, #d6d6d1)',
    });
    this.doorLayer.append(door.hole, door.corridor, door.rim);
    if (this.frame) {
      door.frame = this.frame;
      door.draw();
    }
    return door;
  }

  /**
   * Open a hole in the ceiling (or floor) at x (viewport px, as seen at that depth), or a
   * doorway in the back wall, for something `w` px wide (and `h` tall) there to pass
   * through; close() it after, and it goes.
   */
  portal(kind: 'ceiling' | 'floor' | 'back', x: number, depth: number, w: number, h?: number) {
    const f = this.frame!;
    if (kind === 'back') depth = 1;
    const k = depthScale(f, depth);
    const vx = (f.left + f.right) / 2;
    const at = (vx + (x - vx) / k - f.left) / (f.right - f.left);
    const door = new Door(kind, at, depth, {
      w: w / k / f.bot,
      span: 0.16,
      h: h === undefined ? undefined : h / k / f.bot,
    });
    door.want = 1;
    this.portals.push(this.mount(door));
    return door;
  }

  /**
   * The room's own door, if its picture has one (the library's, in the middle of its back
   * wall): it swings open on its hinges, in, for someone to come through, and shut after them
   * (close() it as a portal). Null in a room without one, or before its picture is in.
   */
  doorway(): Door | null {
    const f = this.frame;
    const image = this.pubPainting.image;
    if (!f || this.pubLevel <= 0 || this.pubPainting.shown !== 'library') return null;
    const where = () => (this.frame ? doorOf('library', roomOf(this.frame)) : null);
    const r = where();
    if (!r) return null;
    const k = depthScale(f, 1);
    const vx = (f.left + f.right) / 2;
    const at = (vx + ((r.x0 + r.x1) / 2 - vx) / k - f.left) / (f.right - f.left);
    const door = new Door('back', at, 1, {
      w: (r.x1 - r.x0) / k / f.bot,
      span: 0.16,
      h: (r.bottom - r.top) / k / f.bot,
    });
    // The leaf: the picture's own door, in strips (each clipped to its part of the door, and
    // put where that part is as it turns), and a shade over it, darker as it turns away.
    const make = this.make;
    const g = make('g');
    const strips = Array.from({ length: LEAF_STRIPS }, (_, i) => {
      const id = `${this.id}-leaf${this.mounted}-${i}`;
      const path = make('clipPath', { id });
      const rect = make('rect');
      path.appendChild(rect);
      this.defs.appendChild(path);
      const image = make('image', { preserveAspectRatio: 'none', 'clip-path': `url(#${id})` });
      const strip = make('g');
      strip.appendChild(image);
      g.appendChild(strip);
      return { g: strip, image, rect, path };
    });
    const shade = make('path', { fill: '#000', opacity: '0' });
    g.appendChild(shade);
    door.leaf = {
      where,
      source: image,
      g,
      strips,
      shade,
      remove: () => {
        g.remove();
        for (const s of strips) s.path.remove();
      },
    };
    door.want = 1;
    this.portals.push(this.mount(door));
    // Through it: dark beyond, and the floor going on, dimly; no rim (it has its frame).
    door.hole.setAttribute('fill', '#0f0905');
    door.corridor.setAttribute('fill', `url(#${this.id}-hall)`);
    door.rim.setAttribute('stroke', 'none');
    door.corridor.after(g);
    g.setAttribute('clip-path', door.corridor.getAttribute('clip-path') ?? '');
    door.draw();
    return door;
  }

  /** Shade it for light paper or dark. */
  theme(dark: boolean | number) {
    // Part way (a dimmer turning): the shadows deepen as it goes; the lamps' colour turns
    // over half way, where the card and ink colours of a dimming page are close.
    const t = Math.min(1, Math.max(0, Number(dark)));
    const tones = TONES[t > 0.5 ? 'dark' : 'light'];
    for (const [shade, g] of this.shades)
      fill(
        g,
        tones[shade].map(([at, colour], i): Stops[number] => {
          const [a, b] = [TONES.light[shade][i][2], TONES.dark[shade][i][2]];
          return [at, colour, Math.round((a + (b - a) * t) * 1000) / 1000];
        }),
      );
    this.lamps.setAttribute('fill', tones.lamp);
    this.sceneryShade.setAttribute('opacity', (t * NIGHT).toFixed(3));
  }

  update(frame: Frame, width: number, height: number, radius: number) {
    this.frame = frame;
    this.radius = radius;
    this.el.setAttribute('viewBox', `0 0 ${width} ${height}`);
    for (const door of [...this.doors, ...this.portals]) {
      door.frame = frame;
      door.draw();
    }
    const { left, right, top, bottom } = frame;
    const k = depthScale(frame, 1);
    const vx = (left + right) / 2;
    const vy = horizon(frame);
    const bl = vx + (left - vx) * k;
    const br = vx + (right - vx) * k;
    const floorBack = vy + (bottom - vy) * k;
    const ceilingBack = vy + (top - vy) * k;
    const wall = floorBack - ceilingBack;
    const f = (n: number) => n.toFixed(1);
    const P = (...pts: [number, number][]) =>
      pts.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)} ${f(y)}`).join(' ');
    const span = (g: SVGLinearGradientElement, y0: number, y1: number) => {
      g.setAttribute('x1', '0');
      g.setAttribute('x2', '0');
      g.setAttribute('y1', f(y0));
      g.setAttribute('y2', f(y1));
    };
    // One of the two: `lip` is its front edge (the frame line), `back` where it meets the
    // back wall, `reach` how far the back corners' edges run before they fade out.
    const draw = (s: Surface, lip: number, back: number, reach: number) => {
      const dir = Math.sign(back - lip); // -1: the floor, going up into the box.
      // Where the lines toward the vanishing point leave the frame's rounded corners.
      const [fx, rise] = cornerExit(left, 0, radius, bl - left, Math.abs(back - lip));
      const fy = lip - dir * rise;
      const gx = right - (fx - left);
      const end = back + dir * reach;
      s.fill.setAttribute(
        'd',
        `${P([fx, fy], [bl, back], [br, back], [gx, fy], [right - radius, lip], [left + radius, lip])} Z`,
      );
      s.walls.setAttribute(
        'd',
        `${P([left, fy], [fx, fy], [bl, back], [bl, end], [left, end])} Z ` +
          `${P([right, fy], [gx, fy], [br, back], [br, end], [right, end])} Z`,
      );
      s.lines.setAttribute('d', P([fx, fy], [bl, back], [br, back], [gx, fy]));
      s.posts.setAttribute('d', `${P([bl, back], [bl, end])} ${P([br, back], [br, end])}`);
      span(s.shade, back, lip);
      span(s.wallFade, fy, end);
      span(s.postFade, back, end);
    };
    draw(this.floor, bottom, floorBack, Math.min(frame.depth * 2.2, wall * 0.45));
    draw(this.ceiling, top, ceilingBack, Math.min((ceilingBack - top) * 2.2, wall * 0.25));
    this.hang(frame, br - bl, ceilingBack - top);
    if (this.pubLevel > 0) this.drawPub(frame, radius);
    if (this.setting) this.drawScenery(frame, radius);
  }

  /**
   * The library as a pub (0 not at all .. 1): plaster walls over dark wood panelling, a
   * plank floor, joists across the ceiling, and brass pendant lamps with warm bulbs in
   * place of the flush ones, throwing their light down the air, on the wall behind and in
   * pools on the floor.
   */
  pub(level: number) {
    const was = this.pubLevel;
    this.pubLevel = clamp(level, 0, 1);
    const on = this.pubLevel > 0;
    this.pubBack.style.display = this.pubLamps.style.display = on ? '' : 'none';
    this.pubBack.setAttribute('opacity', this.pubLevel.toFixed(3));
    this.pubLamps.setAttribute('opacity', this.pubLevel.toFixed(3));
    this.lights();
    if (on && !this.textureWanted) {
      this.textureWanted = true;
      whenReady('library', () => {
        this.pubPainting.stale();
        if (this.pubLevel > 0 && this.frame) this.drawPub(this.frame, this.radius);
      });
    }
    if (on && !was && this.frame) this.drawPub(this.frame, this.radius);
  }

  private radius = 0;

  /** The room it is in now (its picture coming in, or in), or null: the white box. */
  get roomShown() {
    return this.setting;
  }

  /**
   * The everyday room a section is in (null: the plain white box). Its picture fades in under
   * the doors and the crew, while the box's own lines and downlights fade out over it; a
   * change of room fades the one there out first.
   */
  room(setting: Setting | null) {
    if (setting === this.wanted) return;
    this.wanted = setting;
    if (setting)
      whenReady(setting, () => {
        if (this.setting !== setting || !this.frame) return;
        this.scenery.stale();
        this.drawScenery(this.frame, this.radius);
      });
  }

  private drawScenery(frame: Frame, radius: number) {
    if (!this.setting) return;
    const { left, right, top, bottom } = frame;
    const f = (n: number) => n.toFixed(1);
    for (const r of [this.sceneryClip, this.sceneryShade]) {
      r.setAttribute('x', f(left));
      r.setAttribute('y', f(top));
      r.setAttribute('width', f(right - left));
      r.setAttribute('height', f(bottom - top));
    }
    this.sceneryClip.setAttribute('rx', f(radius));
    this.scenery.paint(this.setting, roomOf(frame));
  }

  private showScenery() {
    const t = this.sceneryLevel;
    this.sceneryBack.style.display = t > 0 ? '' : 'none';
    this.sceneryBack.setAttribute('opacity', t.toFixed(3));
    const rest = (1 - t).toFixed(3);
    for (const s of [this.floor, this.ceiling]) {
      s.lines.setAttribute('opacity', rest);
      s.posts.setAttribute('opacity', rest);
    }
    this.lights();
  }

  /** The everyday downlights and their pools: they give way to the pub's own lamps, and to a
   * room's picture. */
  private lights() {
    const on = ((1 - this.pubLevel) * (1 - this.sceneryLevel)).toFixed(3);
    this.lamps.setAttribute('opacity', on);
    this.pools.setAttribute('opacity', on);
  }

  private drawPub(frame: Frame, radius: number) {
    const { left, right, top, bottom } = frame;
    const k = depthScale(frame, 1);
    const vx = (left + right) / 2;
    const vy = horizon(frame);
    const bl = vx + (left - vx) * k;
    const br = vx + (right - vx) * k;
    const fb = vy + (bottom - vy) * k;
    const cb = vy + (top - vy) * k;
    const f = (n: number) => n.toFixed(1);
    const P = (...pts: [number, number][]) =>
      `${pts.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)} ${f(y)}`).join(' ')} Z`;
    const L = (a: [number, number], b: [number, number]) =>
      `M${f(a[0])} ${f(a[1])} L${f(b[0])} ${f(b[1])}`;
    const span = (g: SVGLinearGradientElement, y0: number, y1: number) => {
      g.setAttribute('x1', '0');
      g.setAttribute('x2', '0');
      g.setAttribute('y1', f(y0));
      g.setAttribute('y2', f(y1));
    };
    this.pubClip.setAttribute('x', f(left));
    this.pubClip.setAttribute('y', f(top));
    this.pubClip.setAttribute('width', f(right - left));
    this.pubClip.setAttribute('height', f(bottom - top));
    this.pubClip.setAttribute('rx', f(radius));
    const p = this.pub_;
    // A point on a side wall (x: the frame's edge there) `d` of the way back, at a height
    // given at the front.
    const side = (x: number, d: number, y: number): [number, number] => {
      const q = project(frame, d, { x, y });
      return [q.x, q.y];
    };
    // The walls: plaster down to a rail, dark wood below it (the side walls in shade).
    const rail = fb - (fb - cb) * 0.36;
    const railFront = bottom - (fb - rail) / k;
    span(this.pubPaint.plaster, cb, rail);
    span(this.pubPaint.wood, rail, fb);
    span(this.pubPaint.floor, fb, bottom);
    span(this.pubPaint.ceiling, top, cb);
    p.wall.setAttribute('d', `${P([left, top], [right, top], [right, bottom], [left, bottom])}`);
    p.sides.setAttribute(
      'd',
      `${P([left, top], [bl, cb], [bl, fb], [left, bottom])} ${P([right, top], [br, cb], [br, fb], [right, bottom])}`,
    );
    p.wainscot.setAttribute(
      'd',
      `${P([left, railFront], [bl, rail], [br, rail], [right, railFront], [right, bottom], [left, bottom])}`,
    );
    p.rail.setAttribute(
      'd',
      `${L([left, railFront], [bl, rail])} ${L([bl, rail], [br, rail])} ${L([br, rail], [right, railFront])} ` +
        `${L([bl, fb - (fb - rail) * 0.12], [br, fb - (fb - rail) * 0.12])}`,
    );
    // Panels: along the back wall, and two on each side wall.
    const panels: string[] = [];
    const n = Math.max(3, Math.round((br - bl) / 150));
    const pw = (br - bl) / n;
    const inset = pw * 0.12;
    const y0 = rail + (fb - rail) * 0.14;
    const y1 = fb - (fb - rail) * 0.22;
    for (let i = 0; i < n; i++) {
      const x0 = bl + i * pw + inset;
      const x1 = bl + (i + 1) * pw - inset;
      panels.push(P([x0, y0], [x1, y0], [x1, y1], [x0, y1]));
    }
    const yf0 = bottom - (fb - y0) / k;
    const yf1 = bottom - (fb - y1) / k;
    for (const x of [left, right])
      for (const [d0, d1] of [
        [0.08, 0.46],
        [0.54, 0.92],
      ])
        panels.push(P(side(x, d0, yf0), side(x, d1, yf0), side(x, d1, yf1), side(x, d0, yf1)));
    p.panels.setAttribute('d', panels.join(' '));
    // The floor: planks running back to the wall.
    p.floor.setAttribute('d', P([left, bottom], [bl, fb], [br, fb], [right, bottom]));
    const planks: string[] = [];
    const m = Math.max(8, Math.round((br - bl) / 55));
    for (let i = 1; i < m; i++) {
      const xb = bl + ((br - bl) * i) / m;
      planks.push(L([xb, fb], [vx + (xb - vx) / k, bottom]));
    }
    // (The planks' own seams, once the picture of them is on.)
    p.planks.setAttribute('d', this.pubPainting.shown ? '' : planks.join(' '));
    this.pubPainting.paint('library', roomOf(frame), () => p.planks.setAttribute('d', ''));
    // The ceiling: dark boards, joists across it front to back.
    p.ceiling.setAttribute('d', P([left, top], [bl, cb], [br, cb], [right, top]));
    const joists: string[] = [];
    const j = Math.max(5, Math.round((br - bl) / 190));
    for (let i = 0; i <= j; i++) {
      const xb = bl + ((br - bl) * i) / j;
      const hw = ((br - bl) / j) * 0.1;
      const xf = vx + (xb - vx) / k;
      joists.push(P([xb - hw, cb], [xb + hw, cb], [xf + hw / k, top], [xf - hw / k, top]));
    }
    p.joists.setAttribute('d', joists.join(' '));
    // The lamps: hanging half way back, in a row across.
    const lamps: SVGElement[] = [];
    const count = Math.max(2, Math.min(4, Math.round((br - bl) / 420)));
    const s = depthScale(frame, 0.5);
    const u = frame.bot * s;
    const hw = u * 0.62;
    const hh = u * 0.42;
    for (let i = 0; i < count; i++) {
      const x = left + ((right - left) * (i + 0.5)) / count;
      const hook = project(frame, 0.5, { x, y: top });
      const floor = project(frame, 0.5, { x, y: bottom });
      const y = hook.y + (bottom - top) * s * 0.16;
      const lip = y + hh;
      const make = this.make;
      const ellipse = (cx: number, cy: number, rx: number, ry: number, fill: string) =>
        make('ellipse', { cx: f(cx), cy: f(cy), rx: f(rx), ry: f(ry), fill });
      lamps.push(
        ellipse(x, lip + (fb - lip) * 0.3, hw * 4.2, hw * 3.2, `url(#${this.id}-pub-wash)`),
        make('path', {
          d: aimBeam(x, lip, hw * 4.6, floor.y - lip, this.cones[i]),
          fill: `url(#${this.cones[i].id})`,
        }),
        ellipse(floor.x, floor.y, hw * 5.5, frame.depth * 0.42, `url(#${this.id}-pub-pool)`),
        make('path', {
          d: L([hook.x, hook.y], [x, y]),
          stroke: PUB.brass,
          'stroke-width': '1',
          'vector-effect': 'non-scaling-stroke',
        }),
        ellipse(x, lip, hw * 2.8, hw * 2.4, `url(#${this.id}-pub-bulb)`),
        make('path', {
          d:
            `M${f(x - hw)} ${f(lip)} C${f(x - hw * 0.95)} ${f(y + hh * 0.2)} ${f(x - hw * 0.45)} ${f(y)} ${f(x)} ${f(y)} ` +
            `C${f(x + hw * 0.45)} ${f(y)} ${f(x + hw * 0.95)} ${f(y + hh * 0.2)} ${f(x + hw)} ${f(lip)} Z`,
          fill: PUB.shade,
          stroke: PUB.brass,
          'stroke-width': '1',
          'vector-effect': 'non-scaling-stroke',
        }),
        ellipse(x, lip, hw * 0.34, hh * 0.22, '#fff4da'),
      );
    }
    this.pubVignette.setAttribute('x', f(left));
    this.pubVignette.setAttribute('y', f(top));
    this.pubVignette.setAttribute('width', f(right - left));
    this.pubVignette.setAttribute('height', f(bottom - top));
    this.pubLamps.replaceChildren(...lamps, this.pubVignette);
  }

  /**
   * The ceiling's lamps, half way back: small round downlights, each a lit lens in a
   * bezel, a soft halo round it, its light falling in a faint beam, and a pool of it on
   * the floor under it.
   */
  private hang(frame: Frame, span: number, band: number) {
    const n = Math.max(2, Math.min(4, Math.round(span / 480)));
    const rx = clamp(span / (n * 18), 9, 22);
    const ry = Math.max(1.6, rx * (band / (span / n)) * 1.4);
    const lamps: SVGElement[] = [];
    const pools: SVGElement[] = [];
    const ellipse = (at: { x: number; y: number }, rx: number, ry: number, fill?: string) =>
      this.make('ellipse', {
        cx: at.x.toFixed(1),
        cy: at.y.toFixed(1),
        rx: rx.toFixed(1),
        ry: ry.toFixed(1),
        ...(fill ? { fill, stroke: 'none' } : {}),
      });
    for (let i = 0; i < n; i++) {
      const x = frame.left + ((frame.right - frame.left) * (i + 0.5)) / n;
      const lamp = project(frame, 0.5, { x, y: frame.top });
      const pool = project(frame, 0.5, { x, y: frame.bottom });
      const beam = this.make('path', {
        d: aimBeam(lamp.x, lamp.y, rx * 3.4, (pool.y - lamp.y) * 0.7, this.beams[i]),
        fill: `url(#${this.beams[i].id})`,
        stroke: 'none',
      });
      const bezel = ellipse(lamp, rx, ry, 'var(--rule, #e0e0db)');
      bezel.removeAttribute('stroke');
      // The lens set up in its can: the can's far side shows under it, in the bezel's shade.
      const lens = ellipse({ x: lamp.x, y: lamp.y - ry * 0.12 }, rx * 0.78, ry * 0.68);
      lens.setAttribute('stroke', 'none');
      lamps.push(ellipse(lamp, rx * 3.2, ry * 5, this.lampGlow), beam, bezel, lens);
      pools.push(ellipse(pool, rx * 4, frame.depth * 0.34, this.poolGlow));
    }
    this.lamps.replaceChildren(...lamps);
    this.pools.replaceChildren(...pools);
  }

  /**
   * Firelight from a fire at (x, y) in the viewport, `w` px across, standing on the floor
   * `back` of the way into the box: a glow up the wall round it and a pool across the floor
   * in front of it. `level` 0 is none, 1 a good fire (it flickers with it).
   */
  glow(x: number, y: number, w: number, back: number, level: number) {
    const f = this.frame;
    this.fire.setAttribute('opacity', Math.max(0, Math.min(1.4, level)).toFixed(3));
    if (!f || level <= 0) return;
    const floor = project(f, back * 0.5, { x, y: f.bottom });
    const size = (e: SVGEllipseElement, cx: number, cy: number, rx: number, ry: number) => {
      e.setAttribute('cx', cx.toFixed(1));
      e.setAttribute('cy', cy.toFixed(1));
      e.setAttribute('rx', rx.toFixed(1));
      e.setAttribute('ry', ry.toFixed(1));
    };
    size(this.fireWall, x, y, w * 2.6, w * 1.9);
    size(this.fireFloor, floor.x, floor.y, w * 3.4, f.depth * 1.1);
  }

  /** Swing the doors toward open or shut. */
  tick(dt: number) {
    if (!this.frame) return;
    for (const door of [...this.doors, ...this.portals]) {
      const was = door.open;
      // (A real door swings, a little slower than a hole opens.)
      const rate = door.leaf ? 1.3 : 2.2;
      door.open += clamp(door.want - door.open, -dt * rate, dt * rate);
      if (door.open !== was) door.draw();
    }
    // Portals that have closed are gone.
    this.portals = this.portals.filter((door) => {
      if (door.want > 0 || door.open > 0) return true;
      door.leaf?.remove();
      door.hole.remove();
      door.corridor.remove();
      door.rim.remove();
      door.opening.parentNode?.parentNode?.removeChild(door.opening.parentNode);
      return false;
    });
    // The everyday room: the one there fades out before another fades in, and a picture only
    // fades in once it's drawn.
    let level = this.sceneryLevel;
    if (this.setting !== this.wanted) {
      level = Math.max(0, level - dt / FADE);
      if (level === 0) {
        this.setting = this.wanted;
        if (this.setting) this.drawScenery(this.frame, this.radius);
      }
    } else if (this.setting && this.scenery.shown === this.setting)
      level = Math.min(1, level + dt / FADE);
    if (level !== this.sceneryLevel) {
      this.sceneryLevel = level;
      this.showScenery();
    }
  }

  dispose() {
    this.el.remove();
  }
}

export type DoorKind = 'back' | 'left' | 'right' | 'floor' | 'ceiling';

/**
 * A way into the box and out of it, and nothing you'd find in a real room: a hole that
 * opens in the floor or the ceiling, or an arched opening in the back wall or a side wall
 * that slides wide from a slit, dark inside. Someone comes out (or goes in) and it closes
 * after them, and there's nothing there. Sizes are in --bot, like the crew's.
 */
export class Door {
  readonly kind: DoorKind;
  /** Across the front of the box (0..1 of the frame's width), and back into it (0..1). */
  readonly at: number;
  readonly depth: number;
  /** How open it is (0..1), and where it is going. */
  open = 0;
  want = 0;
  /** Who is using it; one at a time. */
  user: object | null = null;
  /** A room's own door (Box.doorway): where it is in its picture, and its leaf's drawing. */
  leaf: Leaf | null = null;
  frame!: Frame;
  hole!: SVGPathElement;
  opening!: SVGPathElement;
  corridor!: SVGPathElement;
  rim!: SVGPathElement;

  /** Its width (in --bot) and depth span, if not a door's own. */
  private fit: { w: number; span: number; h?: number } | null;

  constructor(
    kind: DoorKind,
    at: number,
    depth: number,
    fit?: { w: number; span: number; h?: number },
  ) {
    this.kind = kind;
    this.at = at;
    this.depth = depth;
    this.fit = fit ?? null;
  }

  /** On the floor (the bottom edge) or the ceiling (the top). */
  get edge() {
    return this.kind === 'ceiling' ? 'top' : 'bottom';
  }

  /** The middle of it across the front of the box, in px. */
  get x() {
    const f = this.frame;
    if (this.kind === 'left') return f.left;
    if (this.kind === 'right') return f.right;
    return f.left + (f.right - f.left) * this.at;
  }

  /** Its width across (or, in a side wall, its depth span) and its height, in px. */
  get size() {
    const bot = this.frame.bot;
    if (this.fit) return { w: bot * this.fit.w, h: bot * (this.fit.h ?? 1.9), span: this.fit.span };
    return { w: bot * 1.7, h: bot * 1.9, span: 0.34 };
  }

  /** How far open it looks: it springs open past full and settles, and snaps shut. */
  private get shown() {
    const t = clamp(this.open, 0, 1);
    const u = t - 1;
    return this.want > 0 ? 1 + 2.7 * u * u * u + 1.7 * u * u : t * t;
  }

  /** Its middle depth, kept clear of the front lip and the back wall. */
  private get middle() {
    const { span } = this.size;
    return clamp(this.depth, span / 2 + 0.05, 1 - span / 2);
  }

  /**
   * Where someone of this footprint stands just clear of it in the room, and where they
   * are when out of sight in it.
   */
  spots(fp: { x: number; z: number }) {
    const deep = floorDepth(this.frame);
    const gap = this.frame.bot * 0.1;
    switch (this.kind) {
      case 'back':
        return {
          outside: { s: this.x, depth: 1 - (fp.z + gap) / deep },
          inside: { s: this.x, depth: 1 + (fp.z * 2 + gap) / deep },
        };
      case 'left':
      case 'right': {
        const way = this.kind === 'left' ? 1 : -1;
        return {
          outside: { s: this.x + way * (fp.x + gap), depth: this.middle },
          inside: { s: this.x - way * (fp.x + gap), depth: this.middle },
        };
      }
      default:
        return {
          outside: { s: this.x, depth: this.middle },
          inside: { s: this.x, depth: this.middle },
        };
    }
  }

  /** The opening's outline now, in viewport px. */
  private shape() {
    const f = this.frame;
    const { w, h, span } = this.size;
    const o = this.shown;
    const P = (d: number, x: number, y: number) => project(f, d, { x, y });
    const r = this.leaf?.where();
    if (r) return { kind: 'door' as const, x0: r.x0, x1: r.x1, y0: r.bottom, y1: r.top };
    if (this.kind === 'back') {
      // An arch standing on the floor, sliding wide from a slit.
      const k = depthScale(f, 1);
      const c = P(1, this.x, f.bottom);
      const rx = (w / 2) * k * Math.max(o, 0);
      const top = h * k * (0.55 + 0.45 * Math.min(o, 1.05));
      return { kind: 'arch' as const, x0: c.x - rx, x1: c.x + rx, y0: c.y, y1: c.y - top };
    }
    if (this.kind === 'left' || this.kind === 'right') {
      const half = (span / 2) * Math.max(o, 0);
      const height = h * (0.55 + 0.45 * Math.min(o, 1.05));
      const [d0, d1] = [this.middle - half, this.middle + half];
      return {
        kind: 'wall' as const,
        d0,
        d1,
        pts: [
          P(d0, this.x, f.bottom),
          P(d0, this.x, f.bottom - height),
          P(d1, this.x, f.bottom - height),
          P(d1, this.x, f.bottom),
        ],
      };
    }
    // A hole in the floor (ceiling), an ellipse lying on it, opening from a point.
    const y = this.kind === 'floor' ? f.bottom : f.top;
    const near = P(this.middle - span / 2, this.x, y);
    const far = P(this.middle + span / 2, this.x, y);
    const k = depthScale(f, this.middle);
    return {
      kind: 'hole' as const,
      cx: near.x,
      cy: (near.y + far.y) / 2,
      rx: (w / 2) * k * Math.max(o, 0),
      ry: (Math.abs(near.y - far.y) / 2) * Math.max(o, 0),
    };
  }

  /**
   * The planes that keep someone going through it inside its opening, as [nx, ny, c]
   * (world px, y up; keeps n·p + c >= 0).
   */
  clip(): [number, number, number][] {
    const sh = this.shape();
    // (Through a room's own door, only where its leaf has swung out of the way: from its far
    // edge, wherever that's got to, to the frame.)
    if (sh.kind === 'arch' || sh.kind === 'door')
      return [
        [1, 0, -(sh.kind === 'door' ? Math.min(this.leafAt(sh, 1).x, sh.x1) : sh.x0)],
        [-1, 0, sh.x1],
        [0, -1, -sh.y1],
      ];
    if (sh.kind === 'wall') {
      const [front, top] = [sh.pts[0], sh.pts[1]];
      const back = sh.pts[2];
      // Below the top of the opening (a sloping line), and on the room's side of its front.
      const [dx, dy] = [back.x - top.x, -(back.y - top.y)];
      const len = Math.hypot(dx, dy) || 1;
      let [nx, ny] = [-dy / len, dx / len];
      if (ny > 0) [nx, ny] = [-nx, -ny];
      const way = this.kind === 'left' ? 1 : -1;
      return [
        [nx, ny, -(nx * top.x + ny * -top.y)],
        [way, 0, -way * front.x],
      ];
    }
    // Out of the hole: above (below) its near rim, and within its width.
    const rimY = this.kind === 'floor' ? sh.cy + sh.ry : sh.cy - sh.ry;
    const edge: [number, number, number] = this.kind === 'floor' ? [0, 1, rimY] : [0, -1, -rimY];
    return [edge, [1, 0, -(sh.cx - sh.rx)], [-1, 0, sh.cx + sh.rx]];
  }

  draw() {
    const f = this.frame;
    if (!f) return;
    const shown = this.open > 0.01;
    const n = (v: number) => v.toFixed(1);
    let d = '';
    let corridor = '';
    if (shown) {
      const sh = this.shape();
      const P = (dd: number, x: number, y: number) => project(f, dd, { x, y });
      if (sh.kind === 'door') {
        d =
          `M${n(sh.x0)} ${n(sh.y0)} L${n(sh.x0)} ${n(sh.y1)} ` +
          `L${n(sh.x1)} ${n(sh.y1)} L${n(sh.x1)} ${n(sh.y0)} Z`;
        const w = (sh.x1 - sh.x0) / depthScale(f, 1);
        const pts = [
          P(1, this.x - w / 2, f.bottom),
          P(1, this.x + w / 2, f.bottom),
          P(1.9, this.x + w / 2, f.bottom),
          P(1.9, this.x - w / 2, f.bottom),
        ];
        corridor = `${pts.map((p, i) => `${i ? 'L' : 'M'}${n(p.x)} ${n(p.y)}`).join(' ')} Z`;
        this.swing(sh);
      } else if (sh.kind === 'arch') {
        const r = Math.min((sh.x1 - sh.x0) / 2, (sh.y0 - sh.y1) * 0.5);
        d =
          `M${n(sh.x0)} ${n(sh.y0)} L${n(sh.x0)} ${n(sh.y1 + r)} ` +
          `A${n(r)} ${n(r)} 0 0 1 ${n(sh.x0 + r)} ${n(sh.y1)} L${n(sh.x1 - r)} ${n(sh.y1)} ` +
          `A${n(r)} ${n(r)} 0 0 1 ${n(sh.x1)} ${n(sh.y1 + r)} L${n(sh.x1)} ${n(sh.y0)} Z`;
        const { w } = this.size;
        const pts = [
          P(1, this.x - w / 2, f.bottom),
          P(1, this.x + w / 2, f.bottom),
          P(1.9, this.x + w / 2, f.bottom),
          P(1.9, this.x - w / 2, f.bottom),
        ];
        corridor = `${pts.map((p, i) => `${i ? 'L' : 'M'}${n(p.x)} ${n(p.y)}`).join(' ')} Z`;
      } else if (sh.kind === 'wall') {
        d = `${sh.pts.map((p, i) => `${i ? 'L' : 'M'}${n(p.x)} ${n(p.y)}`).join(' ')} Z`;
        const way = this.kind === 'left' ? 1 : -1;
        const out = this.x - way * f.bot * 3;
        const pts = [
          P(sh.d0, this.x, f.bottom),
          P(sh.d1, this.x, f.bottom),
          P(sh.d1, out, f.bottom),
          P(sh.d0, out, f.bottom),
        ];
        corridor = `${pts.map((p, i) => `${i ? 'L' : 'M'}${n(p.x)} ${n(p.y)}`).join(' ')} Z`;
      } else {
        d =
          `M${n(sh.cx - sh.rx)} ${n(sh.cy)} ` +
          `A${n(sh.rx)} ${n(sh.ry)} 0 1 0 ${n(sh.cx + sh.rx)} ${n(sh.cy)} ` +
          `A${n(sh.rx)} ${n(sh.ry)} 0 1 0 ${n(sh.cx - sh.rx)} ${n(sh.cy)} Z`;
      }
    }
    this.hole.setAttribute('d', d);
    this.opening.setAttribute('d', d);
    this.rim.setAttribute('d', d);
    this.corridor.setAttribute('d', corridor);
    if (this.leaf) this.leaf.g.style.display = shown ? '' : 'none';
  }

  /** How far a room's own door has swung in (rad). */
  private get turned() {
    const t = clamp(this.open, 0, 1);
    return SWING * t * t * (3 - 2 * t);
  }

  /** A point `u` of the way across a room's own door's leaf, as it's swung now: where it is
   * across the screen, and its scale there (the eye's `eye` px from the back wall, in the
   * back wall's px). */
  private leafAt(sh: { x0: number; x1: number }, u: number) {
    const f = this.frame;
    const vx = (f.left + f.right) / 2;
    const eye = (f.bottom - f.top) * EYE_DISTANCE;
    const W = sh.x1 - sh.x0;
    const k = eye / (eye + u * W * Math.sin(this.turned));
    return { x: vx + (sh.x0 + u * W * Math.cos(this.turned) - vx) * k, k };
  }

  /**
   * A room's own door swung `open` in on its hinges (on the left), into the dark beyond: the
   * picture's door in strips, each put where its part of the leaf is now, so the leaf narrows
   * and goes smaller toward its far edge as it turns away; and darker as it does.
   */
  private swing(sh: { x0: number; x1: number; y0: number; y1: number }) {
    const leaf = this.leaf!;
    const vy = horizon(this.frame);
    const W = sh.x1 - sh.x0;
    const at = (u: number) => this.leafAt(sh, u);
    const s = Math.sin(this.turned);
    const n = leaf.strips.length;
    const src = leaf.source;
    leaf.strips.forEach((strip, i) => {
      for (const name of ['href', 'x', 'y', 'width', 'height']) {
        const v = src.getAttribute(name) ?? '';
        if (strip.image.getAttribute(name) !== v) strip.image.setAttribute(name, v);
      }
      const [xa, xb] = [sh.x0 + (W * i) / n, sh.x0 + (W * (i + 1)) / n];
      const [a, b] = [at(i / n), at((i + 1) / n)];
      const sx = (b.x - a.x) / (xb - xa);
      const sy = (a.k + b.k) / 2;
      strip.g.setAttribute(
        'transform',
        `matrix(${sx.toFixed(5)} 0 0 ${sy.toFixed(5)} ${(a.x - sx * xa).toFixed(2)} ${(vy * (1 - sy)).toFixed(2)})`,
      );
      strip.rect.setAttribute('x', (xa - 0.4).toFixed(2));
      strip.rect.setAttribute('y', sh.y1.toFixed(2));
      strip.rect.setAttribute('width', (xb - xa + 0.8).toFixed(2));
      strip.rect.setAttribute('height', (sh.y0 - sh.y1).toFixed(2));
    });
    const [a, b] = [at(0), at(1)];
    const y = (yy: number, k: number) => (vy + (yy - vy) * k).toFixed(1);
    leaf.shade.setAttribute(
      'd',
      `M${a.x.toFixed(1)} ${y(sh.y1, a.k)} L${b.x.toFixed(1)} ${y(sh.y1, b.k)} ` +
        `L${b.x.toFixed(1)} ${y(sh.y0, b.k)} L${a.x.toFixed(1)} ${y(sh.y0, a.k)} Z`,
    );
    leaf.shade.setAttribute('opacity', (0.6 * s).toFixed(3));
  }
}

/** How far a room's own door swings open (rad), and how many strips its leaf is drawn in. */
const SWING = 1.35;
const LEAF_STRIPS = 20;

/** A room's own door's leaf (Box.doorway): where the door is, the picture it's cut from, and
 * its drawing (a strip each, clipped to its part, and a shade). */
interface Leaf {
  where: () => { x0: number; x1: number; top: number; bottom: number } | null;
  source: SVGImageElement;
  g: SVGGElement;
  strips: {
    g: SVGGElement;
    image: SVGImageElement;
    rect: SVGRectElement;
    path: SVGClipPathElement;
  }[];
  shade: SVGPathElement;
  remove: () => void;
}

/**
 * A beam of light from a lamp at (x, y): the lower half of an ellipse `w` across each way
 * and `h` down, its gradient `g` aimed to fade from the lamp to the ellipse's edge.
 */
function aimBeam(x: number, y: number, w: number, h: number, g: SVGRadialGradientElement) {
  const f = (n: number) => n.toFixed(1);
  g.setAttribute('cx', f(x));
  g.setAttribute('cy', f(y));
  g.setAttribute('fx', f(x));
  g.setAttribute('fy', f(y));
  g.setAttribute('r', f(h));
  g.setAttribute(
    'gradientTransform',
    `translate(${f(x)} ${f(y)}) scale(${(w / h).toFixed(4)} 1) translate(${f(-x)} ${f(-y)})`,
  );
  return `M${f(x - w)} ${f(y)} A${f(w)} ${f(h)} 0 0 0 ${f(x + w)} ${f(y)} Z`;
}

/** Give a gradient these stops, in place of the ones it had. */
function fill(g: SVGElement, list: Stops) {
  g.replaceChildren(
    ...list.map(([offset, colour, opacity]) => {
      const stop = document.createElementNS(SVG, 'stop');
      stop.setAttribute('offset', String(offset));
      stop.setAttribute('style', `stop-color:${colour};stop-opacity:${opacity}`);
      return stop;
    }),
  );
}

function clamp(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, x));
}

/** The eye's height on the page, which is where the vanishing point is. */
export function horizon(frame: Frame) {
  return frame.top + (frame.bottom - frame.top) * EYE;
}

/**
 * How much smaller something is `depth` (0 at the front, 1 at the back wall) into the
 * box: the back wall is the frame shrunk toward the vanishing point, so that the floor
 * is `frame.depth` deep on screen.
 */
export function depthScale(frame: Frame, depth: number) {
  return 1 - (depth * frame.depth) / Math.max(frame.bottom - horizon(frame), frame.depth * 4);
}

/**
 * How deep the box's floor is, in px at the front of the box: the distance the crew walk
 * from the front lip to the back wall. It is what makes the back wall `depthScale(1)` the
 * size of the front, seen from a comfortable distance (EYE_DISTANCE heights away), so a
 * step back into the box is as long as a step along it.
 */
export function floorDepth(frame: Frame) {
  const eye = (frame.bottom - frame.top) * EYE_DISTANCE;
  return eye * (1 / depthScale(frame, 1) - 1);
}

/** The room's shape for its pictures (box-texture.ts): the frame, the back wall's corners,
 * its top and the floor's line, its scale, the vanishing point and the eye's distance. */
function roomOf(frame: Frame): Room {
  const { left, right, top, bottom } = frame;
  const k = depthScale(frame, 1);
  const vx = (left + right) / 2;
  const vy = horizon(frame);
  return {
    left,
    right,
    top,
    bottom,
    bl: vx + (left - vx) * k,
    br: vx + (right - vx) * k,
    cb: vy + (top - vy) * k,
    fb: vy + (bottom - vy) * k,
    k,
    vx,
    vy,
    eye: (bottom - top) * EYE_DISTANCE,
  };
}

/** A point on the front of the box, `depth` of the way back (toward the vanishing point). */
export function project(frame: Frame, depth: number, p: { x: number; y: number }) {
  const k = depthScale(frame, depth);
  const vx = (frame.left + frame.right) / 2;
  const vy = horizon(frame);
  return { x: vx + (p.x - vx) * k, y: vy + (p.y - vy) * k };
}

/**
 * Where the line from the frame's bottom-left corner (x0, y0) running (dx, -dy) leaves
 * the corner's rounding (a quarter circle of radius r), so it starts on the frame line.
 */
function cornerExit(x0: number, y0: number, r: number, dx: number, dy: number): [number, number] {
  const len = Math.hypot(dx, dy) || 1;
  const [ux, uy] = [dx / len, -dy / len];
  // |t·u - c| = r, with the corner's centre c = (r, -r) from the corner: the nearer root.
  const b = -2 * (ux * r - uy * r);
  const c = r * r;
  const disc = b * b - 4 * c;
  const t = disc > 0 ? (-b - Math.sqrt(disc)) / 2 : 0;
  return [x0 + ux * t, y0 + uy * t];
}
