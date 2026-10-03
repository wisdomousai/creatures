/** How long a finger rests on something before it counts as a long press (ms). */
const LONG = 550;

/**
 * A right-click on `el`, or a long press where there is no right-click (a touch screen),
 * calls `open` with where it was; `open` says whether it opened anything (else the
 * browser's own menu comes up). The click a long press ends in does nothing else.
 * Call it before `el` gets its click listeners.
 */
export function onMenu(el: HTMLElement, open: (at: { x: number; y: number }) => boolean) {
  let opened = -Infinity;
  const fire = (at: { x: number; y: number }) => {
    const now = performance.now();
    // (A long press on some phones is a right-click too: once is enough.)
    if (now - opened < 800) return true;
    if (!open(at)) return false;
    opened = now;
    return true;
  };
  el.addEventListener('contextmenu', (e) => {
    if (fire({ x: e.clientX, y: e.clientY })) e.preventDefault();
  });
  let timer = 0;
  let from: { x: number; y: number } | null = null;
  let swallow = false;
  const cancel = () => {
    clearTimeout(timer);
    from = null;
  };
  el.addEventListener('pointerdown', (e) => {
    swallow = false;
    if (e.pointerType !== 'touch') return;
    from = { x: e.clientX, y: e.clientY };
    const at = from;
    timer = window.setTimeout(() => {
      if (from === at && fire(at)) swallow = true;
      from = null;
    }, LONG);
  });
  el.addEventListener('pointermove', (e) => {
    if (from && Math.hypot(e.clientX - from.x, e.clientY - from.y) > 10) cancel();
  });
  el.addEventListener('pointerup', cancel);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('click', (e) => {
    if (!swallow) return;
    swallow = false;
    e.stopImmediatePropagation();
  });
}

/** Pressed on and held this long (ms), or dragged this far (px; a finger only drags, a long
 * press is the menu), it's taken up and goes after the pointer till it's let go. */
export const HOLD = 220;
export const DRAG = 8;

/**
 * While one of the crew or a piece is pressed, nothing on the page starts a selection: the press only
 * takes it up after a moment or a few px, and the drag would otherwise sweep a selection
 * over the page behind it. Let go anywhere and selecting works again.
 */
export function holdSelection() {
  const stop = (e: Event) => e.preventDefault();
  const done = () => {
    document.removeEventListener('selectstart', stop, true);
    removeEventListener('pointerup', done, true);
    removeEventListener('pointercancel', done, true);
  };
  getSelection()?.removeAllRanges();
  document.addEventListener('selectstart', stop, true);
  addEventListener('pointerup', done, true);
  addEventListener('pointercancel', done, true);
}
