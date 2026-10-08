import './menu.css';
import { words } from './words';

/** How many of its tricks the menu offers at first, picked at random. */
const FEW = 6;

/**
 * The menu a right-click (or a long press) opens on one of the crew or a set piece, at
 * the pointer: its name, a few of its tricks (a different few each time) with More for
 * the rest, and one more key at the foot (send it off, put it away). A pick, a click
 * anywhere else, Escape or the window changing size shuts it; the arrow keys go from one
 * trick to the next.
 */
let shown: { el: HTMLElement; shut: () => void } | null = null;

export function menu(
  at: { x: number; y: number },
  title: string,
  items: string[],
  run: (item: string) => void,
  last?: { label: string; run: () => void },
  /** Tricks it always offers, not left to the few at random. */
  always: string[] = [],
) {
  shown?.shut();
  const el = document.createElement('div');
  el.className = 'trick-menu';
  el.setAttribute('role', 'menu');
  el.setAttribute('aria-label', `${title}'s tricks`);
  const head = document.createElement('div');
  head.className = 'trick-menu-name';
  head.textContent = title;
  const list = document.createElement('div');
  list.className = 'trick-menu-items';
  const button = (label: string, cls: string, fire: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.setAttribute('role', 'menuitem');
    b.textContent = label;
    b.onclick = () => {
      shut();
      fire();
    };
    return b;
  };
  const keys = (names: string[]) =>
    names.map((item) => button(words(item), 'trick-menu-item', () => run(item)));
  // A few at random, in its own order (not idle, which shows nothing); the rest wait
  // behind More, unless there are hardly any more than the few.
  const few =
    items.length > FEW + 2
      ? new Set(
          items
            .filter((item) => item !== 'idle' && !always.includes(item))
            .map((item) => ({ item, at: Math.random() }))
            .sort((a, b) => a.at - b.at)
            .slice(0, FEW - always.length)
            .map((r) => r.item)
            .concat(always),
        )
      : new Set(items);
  const buttons = keys(items.filter((item) => few.has(item)));
  list.append(...buttons);
  el.append(head, list);
  const rest = items.filter((item) => !few.has(item));
  if (rest.length) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'trick-menu-more';
    more.textContent = 'More';
    more.onclick = () => {
      const added = keys(rest);
      list.append(...added);
      more.remove();
      buttons.splice(buttons.indexOf(more), 1, ...added);
      place();
      added[0]?.focus({ preventScroll: true });
    };
    el.append(more);
    buttons.push(more);
  }
  if (last) {
    const b = button(last.label, 'trick-menu-last', last.run);
    el.append(b);
    buttons.push(b);
  }
  document.body.append(el);
  // At the pointer, kept on the screen (again when More makes it longer).
  const place = () => {
    const r = el.getBoundingClientRect();
    el.style.left = `${Math.max(8, Math.min(at.x, innerWidth - r.width - 8))}px`;
    el.style.top = `${Math.max(8, Math.min(at.y, innerHeight - r.height - 8))}px`;
  };
  place();
  el.animate([{ opacity: 0, transform: 'scale(0.96)' }, { opacity: 1 }], {
    duration: 160,
    easing: 'ease-out',
  });

  const outside = (e: PointerEvent) => {
    if (!el.contains(e.target as Node)) shut();
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      shut();
      return;
    }
    const by = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (by === undefined) return;
    e.preventDefault();
    const k = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(k + by + buttons.length) % buttons.length]?.focus();
  };
  function shut() {
    if (shown?.el !== el) return;
    shown = null;
    el.remove();
    removeEventListener('pointerdown', outside, true);
    removeEventListener('keydown', key, true);
    removeEventListener('resize', shut);
  }
  addEventListener('pointerdown', outside, true);
  addEventListener('keydown', key, true);
  addEventListener('resize', shut);
  shown = { el, shut };
  buttons[0]?.focus({ preventScroll: true });
  return true;
}
