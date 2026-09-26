import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';

import type { OrderDirection } from '../lib/types';

/**
 * Asks before closing an order that has not been fully received or shipped.
 *
 * `fulfilled` is a person saying the order is done, and that stays true of a
 * short delivery nobody expects to complete (ADR-027, ADR-041) — so this
 * confirms rather than refuses. What it prevents is the other case: someone
 * reaching for the most prominent button on the screen and closing an order
 * they meant to keep working, with no indication anything was outstanding.
 *
 * Worded by direction, because the one status reads as two different acts:
 * goods that did not arrive, or goods that were not sent.
 *
 * Only shown when something is outstanding. A dialog that always appears is a
 * dialog people learn to dismiss without reading.
 *
 * Opened by "Close order", which was "Mark shipped" and "Mark received"
 * until #24: those read as the act of shipping or receiving, which have
 * their own buttons. Closing says only that nothing more is coming.
 */
export function CloseOrderDialog({
  open,
  direction,
  onClose,
  onConfirm,
}: {
  open: boolean;
  direction: OrderDirection;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs">
      <DialogTitle>Close this order?</DialogTitle>

      <DialogContent>
        <DialogContentText>
          {direction === 'purchase'
            ? 'Some of what was ordered has not been received. Closing the order says nothing more is expected — the stock already received stays exactly as it is, and anything that turns up later can be received from the Inventory screen.'
            : 'Some of what was ordered has not been shipped. Closing the order says nothing more will be sent — what has shipped stays exactly as it is, and anything sent later can be shipped from the Inventory screen.'}
        </DialogContentText>
      </DialogContent>

      <DialogActions>
        <Button variant="text" onClick={onClose}>
          Keep it open
        </Button>
        {/* Terminal by hand (ADR-027). The one way back is voiding a
            shipment that never left, which reopens the order (ADR-046). */}
        <Button onClick={onConfirm}>Close it</Button>
      </DialogActions>
    </Dialog>
  );
}
