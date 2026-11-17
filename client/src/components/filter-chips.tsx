import { Chip, Stack } from '@mui/material';
import type { SyntheticEvent } from 'react';
import { useIntl } from 'react-intl';

import { useFocusAfterRemove } from '../lib/use-focus-after-remove';

/** One thing a link narrowed or ordered, and how removing it undoes that. */
export interface NarrowedChip {
  id: string;
  label: string;
  onRemove: () => void;
}

/**
 * Under a list's FilterRow: what a link narrowed or ordered that no button
 * shows, each a chip its × removes (ADR-091), such as Home's Late on
 * Orders or Expired on Inventory. Nothing at all while none is on.
 *
 * `chips` in the order they show, `false` for one that is off, so a list
 * writes each beside the condition that shows it. Removing one moves focus
 * to the chip now in its place, or to the page's heading once none is left
 * (useFocusAfterRemove), never to the page's body.
 *
 * A chip is a remove button, named so ("Remove filter: Late"): Enter,
 * Space, Delete and Backspace remove it, as a click on it or its × does
 * (#578; WCAG 2.1.1 and 4.1.2).
 *
 * Built once for every list, where Orders, Inventory and Licences each
 * drew their own (#505's 57).
 */
export function FilterChips({ chips }: { chips: (NarrowedChip | false)[] }) {
  const intl = useIntl();
  const { row, removed } = useFocusAfterRemove();
  const shown = chips.filter((chip): chip is NarrowedChip => chip !== false);

  if (shown.length === 0) return null;

  return (
    <Stack
      ref={row}
      direction="row"
      useFlexGap
      sx={{ flexWrap: 'wrap', gap: 1 }}
    >
      {shown.map((chip) => {
        const remove = (event: SyntheticEvent) => {
          removed(event);
          chip.onRemove();
        };
        return (
          <Chip
            key={chip.id}
            label={chip.label}
            aria-label={intl.formatMessage(
              {
                id: 'filters.chip.remove',
                defaultMessage: 'Remove filter: {filter}',
              },
              { filter: chip.label },
            )}
            onClick={remove}
            onDelete={remove}
          />
        );
      })}
    </Stack>
  );
}
