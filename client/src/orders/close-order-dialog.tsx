import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';

/**
 * Asks before closing an order that has not been fully received.
 *
 * `received` is a person saying the order is done, and that stays true of a
 * short shipment nobody expects to complete (ADR-027) — so this confirms
 * rather than refuses. What it prevents is the other case: someone reaching
 * for the most prominent button on the screen and closing an order they meant
 * to receive against, with no indication anything was outstanding.
 *
 * Only shown when something is outstanding. A dialog that always appears is a
 * dialog people learn to dismiss without reading.
 */
export function CloseOrderDialog({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs">
      <DialogTitle>Close this order?</DialogTitle>

      <DialogContent>
        <DialogContentText>
          Some of what was ordered has not been received. Closing the order says
          nothing more is expected — the stock already received stays exactly as
          it is, and anything that turns up later can be received from the
          Inventory screen.
        </DialogContentText>
      </DialogContent>

      <DialogActions>
        <Button variant="text" onClick={onClose}>
          Keep it open
        </Button>
        {/* Terminal: received and cancelled cannot be reopened (ADR-027). */}
        <Button onClick={onConfirm}>Close it</Button>
      </DialogActions>
    </Dialog>
  );
}
