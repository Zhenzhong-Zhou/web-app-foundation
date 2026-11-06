import { type SyntheticEvent, useEffect, useRef } from 'react';

/**
 * Where focus goes once a removable chip is gone (ADR-091's review; WCAG
 * 2.4.3): to the chip now in its place, or the one before it, and with
 * none left to the page's heading, where the page begins, not to the
 * page's body. `row` goes on the chips' container; `removed(event)` is
 * called first thing in each chip's onDelete.
 */
export function useFocusAfterRemove() {
  const row = useRef<HTMLDivElement>(null);
  const at = useRef<number | null>(null);

  useEffect(() => {
    if (at.current === null) return;
    const index = at.current;
    const chips = row.current?.querySelectorAll<HTMLElement>('.MuiChip-root');
    if (chips?.length) {
      at.current = null;
      chips[Math.min(index, chips.length - 1)].focus();
      return;
    }
    if (row.current) return;
    at.current = null;
    const heading = document.querySelector<HTMLElement>('main h1');
    if (!heading) return;
    if (!heading.hasAttribute('tabindex')) heading.tabIndex = -1;
    heading.focus();
  });

  function removed(event: SyntheticEvent) {
    const chip = (event.target as Element).closest('.MuiChip-root');
    const chips = [...(row.current?.querySelectorAll('.MuiChip-root') ?? [])];
    at.current = chip ? Math.max(0, chips.indexOf(chip)) : 0;
  }

  return { row, removed };
}
