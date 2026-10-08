/**
 * The wall clock in the library's picture (box-texture.ts CLOCKS), made real: a face drawn
 * over the painted one, in the same bronze and cream, with hands that keep the time of the
 * day and a second hand that ticks. It's an SVG group drawn in a unit circle and laid on the
 * painted ellipse by a transform, so it fits the picture exactly at any size the room is
 * drawn at (the picture's own perspective squeezes the clock a little, and so does this).
 * Unit 1 is the ring's outer edge.
 */

export type Make = <K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string>,
) => SVGElementTagNameMap[K];

const TAU = Math.PI * 2;

export class ClockFace {
  readonly g: SVGGElement;
  private hour: SVGElement;
  private minute: SVGElement;
  private second: SVGElement;
  /** The time last drawn (the second hand's second, and the minutes' minute), so each frame
   * costs nothing between ticks. */
  private lastSecond = -1;
  private placed = '';

  constructor(make: Make, defs: SVGDefsElement, id: string) {
    const ring = make('linearGradient', {
      id: `${id}-ring`,
      x1: '0.15',
      y1: '0',
      x2: '0.85',
      y2: '1',
    });
    for (const [at, colour] of [
      [0, '#d9b873'],
      [0.35, '#8a6a30'],
      [0.62, '#5a3f19'],
      [1, '#b8924a'],
    ] as const)
      ring.appendChild(make('stop', { offset: String(at), 'stop-color': colour }));
    const face = make('radialGradient', { id: `${id}-face`, cx: '0.45', cy: '0.4', r: '0.75' });
    for (const [at, colour] of [
      [0, '#b3a28a'],
      [0.7, '#a89782'],
      [1, '#93826c'],
    ] as const)
      face.appendChild(make('stop', { offset: String(at), 'stop-color': colour }));
    defs.append(ring, face);

    this.g = make('g');
    // A thin shadow under the ring, so the old painted edge never shows round it.
    this.g.appendChild(
      make('ellipse', { rx: '1.02', ry: '1.02', fill: '#2a1a0e', opacity: '0.55' }),
    );
    this.g.appendChild(make('ellipse', { rx: '1', ry: '1', fill: `url(#${id}-ring)` }));
    this.g.appendChild(
      make('ellipse', {
        rx: '0.945',
        ry: '0.945',
        fill: 'none',
        stroke: '#3b2810',
        'stroke-width': '0.02',
      }),
    );
    this.g.appendChild(make('ellipse', { rx: '0.925', ry: '0.925', fill: `url(#${id}-face)` }));
    // The twelve hour marks, as the picture has them: short and dark, from 0.64 to 0.86.
    for (let i = 0; i < 12; i++) {
      const a = (i * TAU) / 12;
      this.g.appendChild(
        make('line', {
          x1: (Math.sin(a) * 0.64).toFixed(4),
          y1: (-Math.cos(a) * 0.64).toFixed(4),
          x2: (Math.sin(a) * 0.86).toFixed(4),
          y2: (-Math.cos(a) * 0.86).toFixed(4),
          stroke: '#2b2118',
          'stroke-width': '0.024',
          'stroke-linecap': 'butt',
        }),
      );
    }
    // The hands point up at rest (rotated about the middle); each is a tapering blade with a
    // short tail.
    const blade = (len: number, tail: number, wide: number, colour: string) =>
      make('path', {
        d: `M${-wide} ${tail} L${-wide * 0.45} ${-len} L${wide * 0.45} ${-len} L${wide} ${tail} Z`,
        fill: colour,
        stroke: colour,
        'stroke-width': '0.004',
        'stroke-linejoin': 'round',
      });
    this.hour = blade(0.54, 0.1, 0.034, '#2b2118');
    this.minute = blade(0.86, 0.12, 0.024, '#2b2118');
    this.second = make('g');
    this.second.append(
      make('line', {
        x1: '0',
        y1: '0.17',
        x2: '0',
        y2: '-0.84',
        stroke: '#6b2f1a',
        'stroke-width': '0.011',
        'stroke-linecap': 'round',
      }),
      make('circle', { cx: '0', cy: '0.13', r: '0.026', fill: '#6b2f1a' }),
    );
    this.g.append(this.hour, this.minute, this.second);
    // The hub: a brass boss with a dark pin.
    this.g.appendChild(
      make('circle', {
        r: '0.058',
        fill: `url(#${id}-ring)`,
        stroke: '#3b2810',
        'stroke-width': '0.008',
      }),
    );
    this.g.appendChild(make('circle', { r: '0.02', fill: '#2b2118' }));
    this.g.style.display = 'none';
  }

  /** Lay it on the picture's clock (viewport px: its middle and its two radii), or hide it. */
  place(at: { x: number; y: number; rx: number; ry: number } | null) {
    if (!at) {
      if (this.placed) this.g.style.display = 'none';
      this.placed = '';
      return;
    }
    const key = `${at.x.toFixed(1)} ${at.y.toFixed(1)} ${at.rx.toFixed(1)} ${at.ry.toFixed(1)}`;
    if (key === this.placed) return;
    this.placed = key;
    this.g.setAttribute(
      'transform',
      `translate(${at.x.toFixed(2)} ${at.y.toFixed(2)}) scale(${at.rx.toFixed(3)} ${at.ry.toFixed(3)})`,
    );
    this.g.style.display = '';
    this.lastSecond = -1;
  }

  /** The hands at `now` (the second hand ticks once a second). */
  tick(now: Date) {
    const s = now.getSeconds();
    if (s === this.lastSecond) return;
    this.lastSecond = s;
    const m = now.getMinutes() + s / 60;
    const h = (now.getHours() % 12) + m / 60;
    this.hour.setAttribute('transform', `rotate(${((h * 360) / 12).toFixed(2)})`);
    this.minute.setAttribute('transform', `rotate(${((m * 360) / 60).toFixed(2)})`);
    this.second.setAttribute('transform', `rotate(${((s * 360) / 60).toFixed(2)})`);
  }
}
