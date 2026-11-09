import { Skeleton, TableCell, TableRow } from '@mui/material';

import { useDelayedFlag } from '../lib/use-delayed-flag';

/**
 * A list's rows while they are read, in its table's body: grey bars once
 * the wait passes 250 ms (useDelayedFlag), nothing before, so a quick
 * answer never flashes them.
 *
 * In the body alone, under the table's head kept on the page, so a header
 * pressed to sort keeps its focus while the list reads again (#505's 54;
 * ADR-092's loading state). Drawn in a list's whole panel instead, the
 * head went with the rows, and its focus with it.
 *
 * Hidden from a screen reader, which has nothing to read in them; the
 * head's own sort says what changed. `columns` is the head's number of
 * cells, which each bar spans.
 */
export function PlaceholderRows({ columns }: { columns: number }) {
  const shown = useDelayedFlag(true);

  if (!shown) return null;

  return (
    <>
      {[0, 1].map((row) => (
        <TableRow key={row} aria-hidden>
          <TableCell colSpan={columns}>
            <Skeleton height={48} />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}
