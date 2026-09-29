import {
  Alert,
  Dialog,
  DialogContent,
  DialogContentText,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import { type SubmitEvent, useEffect, useState } from 'react';

import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';
import type { OrderReturn } from '../lib/types';
import { useSubmit } from '../lib/use-submit';

/**
 * Counts a return that arrived without an RMA against this one (ADR-047).
 * Offers only the order's returns that count against none yet; the server
 * holds the link to what this RMA has left to receive.
 */
export function LinkReturnDialog({
  open,
  rmaId,
  rmaNumber,
  orderId,
  onClose,
  onLinked,
}: {
  open: boolean;
  rmaId: string;
  rmaNumber: string;
  orderId: string;
  onClose: () => void;
  onLinked: () => Promise<void> | void;
}) {
  const [returns, setReturns] = useState<OrderReturn[] | null>(null);
  const [returnId, setReturnId] = useState('');

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onLinked();
    },
    { success: `Return counted against ${rmaNumber}` },
  );

  useEffect(() => {
    if (!open) return;
    let ignore = false;

    void api<OrderReturn[]>(`/orders/${orderId}/returns`)
      .then((rows) => {
        if (!ignore) {
          setReturns(rows.filter((row) => row.returnAuthorizationId === null));
        }
      })
      .catch(() => {
        if (!ignore) setReturns([]);
      });

    return () => {
      ignore = true;
    };
  }, [open, orderId]);

  function close() {
    setReturnId('');
    reset();
    onClose();
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    void submit(() =>
      api(`/return-authorizations/${rmaId}/returns`, {
        method: 'POST',
        body: JSON.stringify({ returnId }),
      }),
    );
  }

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <form onSubmit={handleSubmit}>
        <DialogTitle>Link a return to {rmaNumber}</DialogTitle>

        <DialogContent>
          <Stack spacing={2}>
            {error && <FormError message={error} />}

            <DialogContentText>
              For goods that arrived before this RMA was raised. A return is
              counted against one RMA, once.
            </DialogContentText>

            {returns?.length === 0 ? (
              <Alert severity="info">
                Every return on this order already counts against an RMA.
              </Alert>
            ) : (
              <TextField
                id="link-return"
                select
                label="Return"
                required
                fullWidth
                value={returnId}
                onChange={(event) => setReturnId(event.target.value)}
              >
                {returns?.map((entry) => (
                  <MenuItem key={entry.id} value={entry.id}>
                    {formatDate(entry.createdAt)}
                    {' · '}
                    {entry.items
                      .map((item) => `${item.sku} ${item.quantity}`)
                      .join(', ')}
                  </MenuItem>
                ))}
              </TextField>
            )}
          </Stack>
        </DialogContent>

        <DialogFooter
          submitting={submitting}
          onCancel={close}
          label="Link"
          pendingLabel="Linking…"
          disabled={!returnId}
        />
      </form>
    </Dialog>
  );
}
