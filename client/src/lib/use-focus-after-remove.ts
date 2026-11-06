import { type SyntheticEvent, useEffect, useRef } from 'react';

/**
 * Where focus goes once a removable chip is gone (ADR-091's review; WCAG
 * 2.4.3): to the chip now in its place, or the one before it, and with
 * none left to the page's heading, where the page begins, not to the
 * page's body. `row` goes on the chips' container; `removed(event)` is
 * called first thing in each chip's onDelete.
 *
 * It waits for the chip itself to go, not for the next render: the
 * address that removes it is a router update, which React draws in a
 * transition, after any other update, so a render between still has it,
 * such as the list's rows landing for the chip removed before.
 */
export function useFocusAfterRemove() {
  const row = useRef<HTMLDivElement>(null);
  const pending = useRef<{ chip: Element; index: number } | null>(null);

  useEffect(() => {
    if (!pending.current || pending.current.chip.isConnected) return;
    const { index } = pending.current;
    pending.current = null;
    const chips = row.current?.querySelectorAll<HTMLElement>('.MuiChip-root');
    if (chips?.length) {
      chips[Math.min(index, chips.length - 1)].focus();
      return;
    }
    const heading = document.querySelector<HTMLElement>('main h1');
    if (!heading) return;
    if (!heading.hasAttribute('tabindex')) heading.tabIndex = -1;
    heading.focus();
  });

  function removed(event: SyntheticEvent) {
    const chip = (event.target as Element).closest('.MuiChip-root');
    if (!chip) return;
    const chips = [...(row.current?.querySelectorAll('.MuiChip-root') ?? [])];
    pending.current = { chip, index: Math.max(0, chips.indexOf(chip)) };
  }

  return { row, removed };
}
