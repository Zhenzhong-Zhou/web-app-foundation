import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useAddressWrite } from './use-list-filters';

/** How long a list or a picker waits after typing stops before it asks. */
export const SEARCH_WAIT_MS = 300;

/**
 * A list's search box (ADR-056): what is typed, and what the list asks for,
 * a moment after typing stops. The search lives in the address as
 * `?search=`, as a tab does (useTab):
 *
 * - What the list asks for is read from the address, so the lookup's "Show
 *   all in Orders" opens the list already narrowed, and a reload or a link
 *   opens it as it was.
 * - Typing writes it there once typing stops, replacing the history entry,
 *   so Back leaves the list rather than stepping back through each search.
 * - A search the address gains while the list is open, from "Show all" on
 *   the list already shown or from Back and Forward, replaces what is
 *   typed. The box's own write arrives as what is typed, so it changes
 *   nothing and starts nothing again.
 * - The write keeps the link's state, so a page a link inside the app
 *   opened still offers Back after a search (#341), as every write to a
 *   list's address does (useAddressWrite).
 */
export function useListSearch(): {
  text: string;
  setText: (text: string) => void;
  search: string;
} {
  const [params] = useSearchParams();
  const write = useAddressWrite();
  const address = params.get('search') ?? '';
  const search = address.trim();
  const [text, setText] = useState(address);
  // The address as last rendered, to tell when it changes.
  const [seen, setSeen] = useState(address);

  if (address !== seen) {
    setSeen(address);
    if (search !== text.trim()) setText(address);
  }

  useEffect(() => {
    const typed = text.trim();
    if (typed === search) return;

    const timer = setTimeout(
      () => write({ search: typed || null }),
      SEARCH_WAIT_MS,
    );
    return () => clearTimeout(timer);
  }, [text, search, write]);

  return { text, setText, search };
}

/** A list's path with its search added, when there is one. */
export function withSearch(path: string, search: string): string {
  if (!search) return path;
  return `${path}${path.includes('?') ? '&' : '?'}search=${encodeURIComponent(search)}`;
}
