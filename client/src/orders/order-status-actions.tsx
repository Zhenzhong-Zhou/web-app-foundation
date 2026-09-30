import { Button, Stack } from '@mui/material';

import { openDialog } from '../lib/open-dialog';
import type { OrderDetail, OrderStatus } from '../lib/types';
import { NEXT_STATUSES, transitionLabel } from './status';

/**
 * Where the order can go next, as buttons: Confirm, Close order, Cancel.
 * Nothing when it can go nowhere.
 *
 * Closing an order that still has something outstanding asks first, through
 * the page's dialog (onCloseOrder); every other move is one request (onMove).
 */
export function OrderStatusActions({
  order,
  working,
  onMove,
  onCloseOrder,
}: {
  order: OrderDetail;
  /** A request is out: no second move until it answers. */
  working: boolean;
  onMove: (next: OrderStatus) => Promise<void>;
  onCloseOrder: () => void;
}) {
  if (NEXT_STATUSES[order.status].length === 0) return null;

  return (
    <Stack direction="row" spacing={2} sx={{ justifyContent: 'flex-end' }}>
      {/* Cancel first, Confirm last: the rightmost position is where
          "proceed" lives, and the destructive one should not be where a
          thumb lands by default. */}
      {NEXT_STATUSES[order.status]
        .filter(
          (next) =>
            next === 'cancelled' &&
            !order.lines.some((line) => Number(line.quantityFulfilled) > 0),
        )
        .map((next) => (
          <Button
            key={next}
            variant="text"
            color="error"
            disabled={working}
            onClick={() => void onMove(next)}
          >
            {transitionLabel(next)}
          </Button>
        ))}

      {NEXT_STATUSES[order.status]
        .filter((next) => next !== 'cancelled')
        .map((next) => (
          <Button
            key={next}
            variant="contained"
            disabled={working}
            onClick={(event) => {
              // Only this branch opens a dialog, so only it needs the
              // blur openDialog does — the direct transition keeps focus
              // on the button, which is right when nothing covers it.
              if (next === 'fulfilled' && !order.fullyFulfilled) {
                openDialog(onCloseOrder)(event);
                return;
              }
              void onMove(next);
            }}
          >
            {transitionLabel(next)}
          </Button>
        ))}
    </Stack>
  );
}
