import { type RefObject, useLayoutEffect } from 'react';

/** The property the top bar's height is kept in, on the document's root. */
const BAR_HEIGHT = '--bar-height';

/**
 * The top bar's height, measured and set once on the document's root as
 * `--bar-height` (ADR-090, amended November 2026; #507's 41), so every page
 * reads it: what stays in view under the bar as the page scrolls, Help
 * beside the page, a link's landing, and the root's one scroll margin
 * (the theme's baseline). Measured rather than assumed: the text size and
 * the bar's words below `lg` change it, and its line adds 1 px.
 *
 * Before the first paint, then again as the bar changes size; taken away
 * with the bar, so a page without it reads 0.
 */
export function useBarHeight(bar: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const element = bar.current;
    if (!element) return;
    const root = document.documentElement.style;
    // Not rounded, as offsetHeight would be: at Larger it can be a
    // fraction, and what sits under the bar would cover its line.
    const measure = () =>
      root.setProperty(
        BAR_HEIGHT,
        `${element.getBoundingClientRect().height}px`,
      );
    measure();
    // Not in jsdom, as Help's panel finds; measured once there.
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(measure);
    observer?.observe(element);
    return () => {
      observer?.disconnect();
      root.removeProperty(BAR_HEIGHT);
    };
  }, [bar]);
}

/**
 * Where something that stays in view as the page scrolls sits: `gap` px
 * under the top bar's line, at whatever height the bar has.
 */
export function underBar(gap: number): string {
  return `calc(var(${BAR_HEIGHT}, 0px) + ${gap}px)`;
}
