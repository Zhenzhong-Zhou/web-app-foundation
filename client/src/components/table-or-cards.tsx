import { Skeleton, Stack } from '@mui/material';
import type { ReactNode } from 'react';

import { useCards } from '../lib/use-cards';
import { useDelayedFlag } from '../lib/use-delayed-flag';

/**
 * A list's rows, as a table from 600 px and as cards below it (ADR-090's
 * width switch; the design language's Lists on a phone), Items' first:
 * only the one shown is drawn.
 *
 * While the rows are read, the table draws its own placeholder rows under
 * its head, which stays so a header pressed keeps its focus
 * (`PlaceholderRows`); the cards, having no head, are two grey cards
 * once the wait passes 250 ms, nothing before.
 */
export function TableOrCards({
  loading,
  table,
  cards,
}: {
  loading: boolean;
  table: ReactNode;
  cards: ReactNode;
}) {
  const phone = useCards();

  if (!phone) return table;
  if (loading) return <PlaceholderCards />;
  return cards;
}

/** Two grey cards, past the wait; hidden from a screen reader. */
function PlaceholderCards() {
  const shown = useDelayedFlag(true);

  if (!shown) return null;

  return (
    <Stack sx={{ p: 2 }} spacing={1} aria-hidden>
      <Skeleton height={64} />
      <Skeleton height={64} />
    </Stack>
  );
}
