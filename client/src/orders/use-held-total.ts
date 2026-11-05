import { useEffect, useState } from 'react';

/**
 * Where an order's Total is held from on a computer, the actions column's
 * width beside it, and whether columns pass under it now: the table
 * scrolled short of its right end (#221). Asked again as the table
 * scrolls, and as it or the actions change size: a line received, another
 * text size or language.
 *
 * Callback refs, `scroller` for the table's frame and `actions` for the
 * actions column's head, which is as wide as its column.
 */
export function useHeldTotal() {
  const [scroller, setScroller] = useState<HTMLElement | null>(null);
  const [actions, setActions] = useState<HTMLElement | null>(null);
  const [held, setHeld] = useState({ right: 0, under: false });

  useEffect(() => {
    if (!scroller || !actions) return;
    const ask = () => {
      const right = actions.getBoundingClientRect().width;
      // The 1 px is a width rounded, as useMoreBelow's height is.
      const under =
        scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1;
      setHeld((was) =>
        was.right === right && was.under === under ? was : { right, under },
      );
    };
    ask();
    scroller.addEventListener('scroll', ask, { passive: true });
    // Not in jsdom, as Help's panel finds; asked once there.
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(ask);
    observer?.observe(scroller);
    observer?.observe(actions);
    if (scroller.firstElementChild) {
      observer?.observe(scroller.firstElementChild);
    }
    return () => {
      scroller.removeEventListener('scroll', ask);
      observer?.disconnect();
    };
  }, [scroller, actions]);

  return { scroller: setScroller, actions: setActions, ...held };
}
