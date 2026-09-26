import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { type SubmitEvent, useState } from 'react';

import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';
import type { Shipment } from '../lib/types';
import { useSubmit } from '../lib/use-submit';

/**
 * Undoes a shipment recorded before the box left (ADR-041).
 *
 * The reason is required: a struck-through shipment with no explanation is
 * the first thing somebody asks about when they open the order later. The
 * warning says what this is not for — a box that did leave and came back is
 * a return, and the server refuses a void once anything has.
 *
 * On a closed order it says what else happens: the order reopens, because
 * it was closed on the understanding that its goods had left (ADR-046).
 */
export function VoidShipmentDialog({
  open,
  orderId,
  shipment,
  orderClosed,
  onClose,
  onVoided,
}: {
  open: boolean;
  orderId: string;
  shipment: Shipment | null;
  orderClosed: boolean;
  onClose: () => void;
  onVoided: () => Promise<void> | void;
}) {
  const [reason, setReason] = useState('');

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onVoided();
    },
    { success: 'Shipment voided' },
  );

  function close() {
    setReason('');
    reset();
    onClose();
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (!shipment) return;

    void submit(() =>
      api(`/orders/${orderId}/shipments/${shipment.id}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    );
  }

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <form onSubmit={handleSubmit}>
        <DialogTitle>Void this shipment</DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            {shipment && (
              <Typography variant="body2">
                Recorded {formatDate(shipment.createdAt)}
                {shipment.carrier ? ` · ${shipment.carrier}` : ''}
                {shipment.trackingNumber ? ` · ${shipment.trackingNumber}` : ''}
              </Typography>
            )}

            <Alert severity="warning">
              Only for a box that has not left. Everything on it goes back where
              it came from and the order can ship again. The shipment stays on
              the order, struck through, with your reason. If the box did leave
              and came back, take a return instead.
            </Alert>

            {orderClosed && (
              <Alert severity="info">
                This order is closed. Voiding reopens it, since what it was
                closed on never left.
              </Alert>
            )}

            <TextField
              id="void-shipment-reason"
              label="Why"
              required
              fullWidth
              multiline
              minRows={2}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              helperText="Customer cancelled before pickup, recorded on the wrong order, clicked too early."
              slotProps={{ htmlInput: { maxLength: 500 } }}
            />
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button variant="text" onClick={close} disabled={submitting}>
            Keep it
          </Button>
          <Button type="submit" color="error" disabled={submitting}>
            {submitting ? 'Voiding…' : 'Void shipment'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
