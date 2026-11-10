import { Chip, Stack } from '@mui/material';

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
 * Built once for every list, where Orders, Inventory and Licences each
 * drew their own (#505's 57).
 */
export function FilterChips({ chips }: { chips: (NarrowedChip | false)[] }) {
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
      {shown.map((chip) => (
        <Chip
          key={chip.id}
          label={chip.label}
          onDelete={(event) => {
            removed(event);
            chip.onRemove();
          }}
        />
      ))}
    </Stack>
  );
}
