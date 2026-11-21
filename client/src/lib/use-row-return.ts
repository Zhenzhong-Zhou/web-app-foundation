import { type MouseEvent, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { leftFrom, type Returned, returnedTo } from './return-focus';

/** What a row of a list takes, a table's or a card's (`rowReturn(id)`). */
export interface RowReturn {
  onClickCapture: (event: MouseEvent<HTMLElement>) => void;
  ref?: (node: HTMLElement | null) => void;
}

/**
 * Back to a list puts focus on the row the person left it from (#473; the
 * design language's "The way back"), on the link in it they followed, or
 * on its first where that link is gone; once the row is drawn, which
 * after Show more is once its pages are read again (useKeysetList's
 * `keep`).
 *
 * `rowReturn(id)` goes on each row: a click on a link inside it keeps the
 * row and the link against the list's own entry in the history, and the
 * row Back returns to takes focus as it is drawn. `returned` is that row,
 * read once as the list opens, for a list that focuses it its own way.
 */
export function useRowReturn(): {
  returned: Returned | null;
  rowReturn: (id: string) => RowReturn;
} {
  const { key } = useLocation();
  const [returned] = useState(() => returnedTo(key));
  const focused = useRef(false);

  // Caught on the way down, before the link moves the page, as Stock's
  // rows keep theirs.
  const rowReturn = (id: string): RowReturn => ({
    onClickCapture: (event) => {
      const link = (event.target as HTMLElement).closest('a[href]');
      if (link) leftFrom(key, id, link.getAttribute('href') ?? undefined);
    },
    ref:
      returned?.row === id
        ? (node) => {
            if (!node || focused.current) return;
            focused.current = true;
            focusLink(node, returned.link);
          }
        : undefined,
  });

  return { returned, rowReturn };
}

/**
 * The link followed, or the row's first; a copy hidden at this width, as
 * Reorder draws its drafts twice, takes no focus, so the next is tried.
 */
function focusLink(row: HTMLElement, link: string | null): void {
  const links = [...row.querySelectorAll<HTMLElement>('a[href]')];
  const followed = links.filter((each) => each.getAttribute('href') === link);
  for (const each of [...followed, ...links]) {
    each.focus();
    if (document.activeElement === each) return;
  }
}
