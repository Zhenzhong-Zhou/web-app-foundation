import { type RefObject, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

import { MAIN_CONTENT_ID } from '../layout/skip-link';

/**
 * A link to a part of a page, its address's `hash`: once that part is
 * `ready`, it scrolls to where the page's content begins, the page's own
 * room under the bar, and its heading takes focus, as a link to a part of a
 * page gives it. Once per arrival, never again on a later read of the page.
 * The bar's height is read from `--bar-height`, its own measure on the root
 * (useBarHeight), as everything that stays under the bar reads it.
 */
export function useArrival(
  hash: string,
  ready: boolean,
  section: RefObject<HTMLElement | null>,
  heading: RefObject<HTMLElement | null>,
): void {
  const location = useLocation();
  const openedAt = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || location.hash !== hash) return;
    if (openedAt.current === location.key) return;
    openedAt.current = location.key;
    const part = section.current;
    const main = document.getElementById(MAIN_CONTENT_ID);
    if (!part || !main) return;
    const bar =
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          '--bar-height',
        ),
      ) || 0;
    window.scrollTo({
      top:
        window.scrollY +
        part.getBoundingClientRect().top -
        bar -
        parseFloat(getComputedStyle(main).paddingTop),
    });
    heading.current?.focus({ preventScroll: true });
  }, [ready, hash, location.hash, location.key, section, heading]);
}
