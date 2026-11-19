import { createContext, useContext } from 'react';

/**
 * What a header that sorts tells its list's table as it is pressed
 * (ADR-090, amended November 2026; E11a): a `ListTable` whose header has
 * stuck brings the list's first row back under it, since the sort starts
 * the list again from its first page. Outside a `ListTable`, nothing.
 */
export const SortPressed = createContext<() => void>(() => {});

export function useSortPressed(): () => void {
  return useContext(SortPressed);
}
