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
import type { OrderLine } from '../lib/types';
import { useSubmit } from '../lib/use-submit';

/**
 * Stops expecting the rest of a line (ADR-034).
 *
 * The reason is required and is the whole point — deleting a line would record
 * nothing, while this records why the rest never came, which is what somebody
 * asks months later when the supplier is up for review.
 */
export function CloseLineDialog({
  open,
  orderId,
  line,
  onClose,
  onClosed,
}: {
  open: boolean;
  orderId: string;
  line: OrderLine | null;
  onClose: () => void;
  onClosed: () => Promise<void> | void;
}) {
  const [reason, setReason] = useState('');

  const { submitting, error, reset, submit } = useSubmit(async () => {
    close();
    await onClosed();
  });

  function close() {
    setReason('');
    reset();
    onClose();
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (!line) return;

    void submit(() =>
      api(`/orders/${orderId}/lines/${line.id}/close`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    );
  }

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <form onSubmit={handleSubmit}>
        <DialogTitle>Stop expecting the rest</DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            {line && (
              <Typography variant="body2">
                {line.sku}: {line.quantityFulfilled} of {line.quantityOrdered}{' '}
                received.
              </Typography>
            )}

            {/* The number people expect this to change, and the reason it
                does not. */}
            <Alert severity="info">
              The ordered quantity stays as it is. Nothing further will be
              expected, but the shortfall remains visible — otherwise a short
              delivery would look the same as an accurate one.
            </Alert>

            <TextField
              id="close-line-reason"
              label="Why"
              required
              fullWidth
              multiline
              minRows={2}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              helperText="Discontinued, backordered indefinitely, ordered by mistake."
              slotProps={{ htmlInput: { maxLength: 500 } }}
            />
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button variant="text" onClick={close} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Closing…' : 'Close line'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
