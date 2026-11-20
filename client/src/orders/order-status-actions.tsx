import { Button, Stack } from '@mui/material';

import type { OrderDetail } from '../api/types.gen';
import type { OrderStatus } from '../lib/api-names';
import { openDialog } from '../lib/open-dialog';
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
  quiet = false,
  withoutClose = false,
  stacked = false,
}: {
  order: OrderDetail;
  /** A request is out: no second move until it answers. */
  working: boolean;
  onMove: (next: OrderStatus) => Promise<void>;
  onCloseOrder: () => void;
  /**
   * Outlined rather than filled, when something else on the page is the
   * main act (Ship, ADR-055): one filled button says what comes next.
   */
  quiet?: boolean;
  /**
   * Close order is offered above, as the page's main act, once everything
   * is in (#605): one button for it, not two.
   */
  withoutClose?: boolean;
  /**
   * One above the other, each full width: in the summary panel, where a
   * row of buttons pushed to the right reads as an afterthought.
   */
  stacked?: boolean;
}) {
  // Cancel only while nothing has come or gone; Close order not where it
  // is offered above.
  const cancellable = !order.lines.some(
    (line) => Number(line.quantityFulfilled) > 0,
  );
  const moves = NEXT_STATUSES[order.status].filter((next) =>
    next === 'cancelled'
      ? cancellable
      : !(withoutClose && next === 'fulfilled'),
  );
  if (moves.length === 0) return null;

  return (
    <Stack
      direction={stacked ? 'column' : 'row'}
      spacing={stacked ? 1 : 2}
      sx={{ justifyContent: 'flex-end' }}
    >
      {/* Cancel first, Confirm last: the rightmost position is where
          "proceed" lives, and the destructive one should not be where a
          thumb lands by default. */}
      {moves
        .filter((next) => next === 'cancelled')
        .map((next) => (
          <Button
            key={next}
            variant="text"
            color="error"
            fullWidth={stacked}
            disabled={working}
            onClick={() => void onMove(next)}
          >
            {transitionLabel(next)}
          </Button>
        ))}

      {/* Close order is filled only once nothing is left to ship or
          receive: while goods are due, the state waits for them, not for
          closing (conventions.md, Responsive layout; #158). */}
      {moves
        .filter((next) => next !== 'cancelled')
        .map((next) => (
          <Button
            key={next}
            variant={
              quiet || (next === 'fulfilled' && !order.fullyFulfilled)
                ? 'outlined'
                : 'contained'
            }
            fullWidth={stacked}
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
