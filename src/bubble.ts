import type { Character, Frame } from './character';

/**
 * A speech bubble over one of the crew (or over any point): a card in the page, its tail
 * pointing down at the top of their head. It follows them calmly. A sway, or a hover's bob,
 * inside its slack leaves it where it is; when they've really moved it eases over after
 * them, so it never shivers along with every frame. The words are the page's, and so are
 * the answers if it asks something. Its look is the page's too: the styles it brings are
 * only a default, under any the page has for its class (`say` unless asked).
 *
 *   const bubble = new Bubble(document.body, { at: () => headTop(cat, crew.frame) });
 *   bubble.say('Hello!');
 *   const answer = await bubble.ask('Shall we play?', [['yes', 'Yes'], ['no', 'No']]);
 *   bubble.remove();
 */

export type Point = { x: number; y: number };
export type Bounds = { left: number; top: number; right: number; bottom: number };

export interface BubbleOptions {
  /** Where the tail points (viewport px), asked every frame; null while there's nothing to
   * point at (it stays where it is). headTop() is the top of a creature's head. */
  at: () => Point | null;
  /** It's kept inside these (viewport px): the box's frame, say. The window unless given. */
  bounds?: () => Bounds;
  /** Between the point and the tip of the tail (px). */
  gap?: number;
  /** How far the point can wander before the bubble goes after it (px). */
  slack?: number;
  /** Its class, for the page's own styles: `say` unless given. */
  className?: string;
  /** A name for the answers' group, read out with them. */
  label?: string;
}

/** Clear of the bounds' edges (px). */
const MARGIN = 12;
/** How far the tail reaches below the card (px; the default styles' tail). */
const TAIL = 8;
/** How quickly it eases over (/s): critically damped, it's there in about 0.4 s. */
const STIFF = 12;
/** How long the point's average takes to come round (s). */
const SETTLE = 0.6;
/** How long the highest the head has been is remembered (s): more than a bob. */
const WINDOW = 1.5;
/** Room left over the highest the head has been, when it's placed (px). */
const HEADROOM = 6;

export class Bubble {
  readonly el: HTMLDivElement;
  readonly text: HTMLParagraphElement;
  readonly answers: HTMLDivElement;
  private readonly opts: Required<Omit<BubbleOptions, 'bounds' | 'label'>> &
    Pick<BubbleOptions, 'bounds'>;
  /** The point it was placed for: it stays until the point has wandered out of the slack. */
  private anchor: Point | null = null;
  /** The point, steadied (see step()), and the heights it has lately been at. */
  private steady: Point | null = null;
  private heights: { t: number; y: number }[] = [];
  /** Its top left, and how fast that's moving. */
  private pos: Point | null = null;
  private vel: Point = { x: 0, y: 0 };
  /** What it last wrote, so a frame that changes nothing writes nothing. */
  private written = '';
  private frame = 0;
  private last = 0;
  private fading = 0;
  private open = false;
  private pending: ((answer: string | null) => void) | null = null;

  constructor(host: HTMLElement, opts: BubbleOptions) {
    this.opts = {
      at: opts.at,
      bounds: opts.bounds,
      gap: opts.gap ?? 6,
      slack: opts.slack ?? 24,
      className: opts.className ?? 'say',
    };
    styleOnce(this.opts.className);
    const el = document.createElement('div');
    el.className = this.opts.className;
    el.style.cssText = 'position:fixed;left:0;top:0;';
    el.hidden = true;
    const text = document.createElement('p');
    text.className = `${this.opts.className}-text`;
    text.setAttribute('aria-live', 'polite');
    const answers = document.createElement('div');
    answers.className = `${this.opts.className}-answers`;
    answers.setAttribute('role', 'group');
    if (opts.label) answers.setAttribute('aria-label', opts.label);
    el.append(text, answers);
    host.append(el);
    this.el = el;
    this.text = text;
    this.answers = answers;
  }

  /** Is it up (or coming up)? */
  get shown() {
    return this.open;
  }

  /** Say `line` (no answers to pick). */
  say(line: string) {
    this.settle(null);
    this.answers.replaceChildren();
    this.el.classList.remove('asking');
    this.text.textContent = line;
    this.show();
    return this;
  }

  /** Ask `line`, with `answers` to pick from ([value, label]): resolves with the one picked,
   * or null if it's hidden first. It stays up after an answer: hide() it when it's done. */
  ask<T extends string>(line: string, answers: readonly (readonly [T, string])[]) {
    this.settle(null);
    this.text.textContent = line;
    this.answers.replaceChildren(
      ...answers.map(([value, label]) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.addEventListener('click', () => this.settle(value));
        return b;
      }),
    );
    this.el.classList.add('asking');
    this.show();
    return new Promise<T | null>((done) => {
      this.pending = done as (answer: string | null) => void;
    });
  }

  /** Fade it out (a question still open is answered null). */
  hide() {
    this.settle(null);
    if (!this.open) return;
    this.open = false;
    this.el.classList.remove('on');
    // Faded out, it's out of the way of the pointer too.
    clearTimeout(this.fading);
    this.fading = window.setTimeout(() => {
      if (this.open) return;
      this.el.hidden = true;
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }, 300);
  }

  /** Fade it out and take it out of the page. */
  remove() {
    this.hide();
    setTimeout(() => {
      if (!this.open) this.el.remove();
    }, 300);
  }

  private settle(answer: string | null) {
    const pending = this.pending;
    this.pending = null;
    pending?.(answer);
  }

  private show() {
    clearTimeout(this.fading);
    if (this.open) return;
    this.open = true;
    this.el.hidden = false;
    // Placed before it's seen, then in.
    this.anchor = null;
    this.steady = null;
    this.heights = [];
    this.pos = null;
    cancelAnimationFrame(this.frame);
    this.step(performance.now());
    requestAnimationFrame(() => this.open && this.el.classList.add('on'));
  }

  private step = (now: number) => {
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.frame = requestAnimationFrame(this.step);
    const p = this.opts.at();
    if (!p && !this.anchor) return;
    if (p) {
      // Where they are, steadied: across, on average; up, the highest the head has been
      // lately, so a bob never pokes up into the tail.
      const hs = this.heights;
      hs.push({ t: now, y: p.y });
      while (now - hs[0].t > WINDOW * 1000) hs.shift();
      const top = Math.min(...hs.map((h) => h.y));
      const s = this.steady;
      if (!s) this.steady = { x: p.x, y: top };
      else {
        s.x += (p.x - s.x) * Math.min(1, dt / SETTLE);
        s.y = top;
      }
      const at = this.steady!;
      // Off by more than the slack, it goes after them; but up into the tail, never.
      const a = this.anchor;
      // Placed with a little headroom, a bob a touch higher than the last doesn't move it.
      if (!a || at.y < a.y || Math.hypot(at.x - a.x, at.y + HEADROOM - a.y) > this.opts.slack)
        this.anchor = { x: at.x, y: at.y - HEADROOM };
    }
    const at = this.anchor!;
    const w = this.el.offsetWidth;
    const h = this.el.offsetHeight;
    const b = this.opts.bounds?.() ?? {
      left: 0,
      top: 0,
      right: window.innerWidth,
      bottom: window.innerHeight,
    };
    const to = {
      x: Math.min(Math.max(at.x - w / 2, b.left + MARGIN), b.right - w - MARGIN),
      y: Math.max(at.y - this.opts.gap - TAIL - h, b.top + MARGIN),
    };
    if (!this.pos) this.pos = { ...to };
    else {
      // Critically damped: it eases over and stops there, no overshoot.
      for (const k of ['x', 'y'] as const) {
        this.vel[k] += (STIFF * STIFF * (to[k] - this.pos[k]) - 2 * STIFF * this.vel[k]) * dt;
        this.pos[k] += this.vel[k] * dt;
        if (Math.abs(to[k] - this.pos[k]) < 0.25 && Math.abs(this.vel[k]) < 1) {
          this.pos[k] = to[k];
          this.vel[k] = 0;
        }
      }
    }
    const x = Math.round(this.pos.x * 2) / 2;
    const y = Math.round(this.pos.y * 2) / 2;
    const tail = Math.round(at.x - x);
    const key = `${x} ${y} ${tail}`;
    if (key === this.written) return;
    this.written = key;
    this.el.style.translate = `${x}px ${y}px`;
    this.el.style.setProperty('--tail', `${tail}px`);
  };
}

/** The top of their head (viewport px), whichever way up they are: where a bubble points. */
export function headTop(c: Character, frame: Frame): Point {
  const foot = c.foot(frame);
  const eye = c.eyePoint(frame);
  const k = 1 / c.spec.eyes;
  return { x: foot.x + (eye.x - foot.x) * k, y: foot.y + (eye.y - foot.y) * k };
}

/** The default look, once for each class, and under anything the page has (:where). It reads
 * the crew's tokens (--card, --ink, --rule-strong…), with fallbacks. */
const styled = new Set<string>();
function styleOnce(cls: string) {
  if (styled.has(cls) || typeof document === 'undefined') return;
  styled.add(cls);
  const c = `.${CSS.escape(cls)}`;
  const sheet = document.createElement('style');
  sheet.textContent = `
:where(${c}) {
  z-index: 10; box-sizing: border-box; width: max-content; max-width: min(19rem, calc(100vw - 32px));
  padding: 0.7rem 0.9rem 0.75rem; border: 1px solid var(--rule-strong, #d6d6d1); border-radius: 14px;
  background: var(--card, #fff); color: var(--ink, #111); font: 0.95rem/1.4 var(--sans, system-ui, sans-serif);
  box-shadow: 0 6px 18px -8px var(--shade, rgb(0 0 0 / 0.1));
  opacity: 0; scale: 0.9; transform-origin: var(--tail, 50%) 100%;
  transition: opacity 0.2s, scale 0.25s cubic-bezier(0.3, 1.5, 0.5, 1);
}
:where(${c}.on) { opacity: 1; scale: 1; }
:where(${c})::after {
  content: ''; position: absolute; top: 100%; left: clamp(14px, var(--tail, 50%), calc(100% - 14px));
  width: 12px; height: 12px; margin: -6px 0 0 -6px; border: solid var(--rule-strong, #d6d6d1);
  border-width: 0 1px 1px 0; background: var(--card, #fff); rotate: 45deg;
}
:where(${c}-text) { margin: 0; }
:where(${c}-answers) { display: none; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.65rem; }
:where(${c}.asking ${c}-answers) { display: flex; }
:where(${c}-answers button) {
  padding: 0.35rem 0.8rem; border: 1px solid var(--ink, #111); border-radius: 999px;
  background: var(--card, #fff); color: var(--ink, #111); font: inherit; font-size: 0.85rem; cursor: pointer;
}
:where(${c}-answers button:hover, ${c}-answers button:focus-visible) {
  background: var(--ink, #111); color: var(--card, #fff);
}`;
  document.head.prepend(sheet);
}
