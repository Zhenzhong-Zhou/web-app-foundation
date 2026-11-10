import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useAddressWrite } from './use-list-filters';

/**
 * The open tab, kept in the address as `?tab=` (ADR-055), so a refresh, a
 * bookmark, the Back button after visiting another page, or a link from
 * elsewhere opens the same tab.
 *
 * - The first tab, or `fallback`, has no parameter: `/orders/…` alone
 *   opens it.
 * - Switching replaces the history entry rather than adding one, so Back
 *   leaves the page instead of stepping back through every tab visited.
 * - A tab that does not exist, or is not in `tabs` because the person may
 *   not see it, opens the first, or `fallback`, and the address is
 *   corrected to match.
 *   No error: a mistyped tab is not worth one, and a forbidden one is
 *   refused by the server anyway.
 *
 * `tabs` is the list this person may see, in order. It must not be empty.
 * `fallback` is the tab with no parameter, where it is not the first, as
 * Items opens on the first type the organization holds (ADR-092).
 */
export function useTab<T extends string>(
  tabs: readonly T[],
  { fallback = tabs[0] }: { fallback?: T } = {},
): [T, (tab: T) => void] {
  const [params] = useSearchParams();
  // Written as every list's address is, keeping the link's state, so a
  // page a link inside the app opened still offers Back after a tab is
  // chosen (#341).
  const write = useAddressWrite();
  const asked = params.get('tab');
  const current = tabs.find((tab) => tab === asked) ?? fallback;

  useEffect(() => {
    if (asked !== null && asked !== current) write({ tab: null });
  }, [asked, current, write]);

  const choose = (tab: T) => write({ tab: tab === fallback ? null : tab });

  return [current, choose];
}
