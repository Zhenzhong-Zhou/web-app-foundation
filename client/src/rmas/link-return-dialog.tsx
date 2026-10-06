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
import { useIntl } from 'react-intl';

import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import { formatDate, formatQuantity, SEPARATOR } from '../lib/format';
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
  const intl = useIntl();
  const [returns, setReturns] = useState<OrderReturn[] | null>(null);
  const [returnId, setReturnId] = useState('');

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onLinked();
    },
    {
      success: intl.formatMessage(
        {
          id: 'orders.returns.counted',
          defaultMessage: 'Return counted against {rma}',
        },
        { rma: rmaNumber },
      ),
    },
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
    <Dialog
      open={open}
      onClose={submitting ? undefined : close}
      fullWidth
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          {intl.formatMessage(
            {
              id: 'rmas.link.title',
              defaultMessage: 'Link a return to {rma}',
            },
            { rma: rmaNumber },
          )}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2}>
            {error && <FormError message={error} />}

            <DialogContentText>
              {intl.formatMessage({
                id: 'rmas.link.intro',
                defaultMessage:
                  'For goods that arrived before this RMA was raised. A return is counted against one RMA, once.',
              })}
            </DialogContentText>

            {returns?.length === 0 ? (
              <Alert severity="info">
                {intl.formatMessage({
                  id: 'rmas.link.noneLeft',
                  defaultMessage:
                    'Every return on this order already counts against an RMA.',
                })}
              </Alert>
            ) : (
              <TextField
                id="link-return"
                select
                label={intl.formatMessage({
                  id: 'rmas.link.return',
                  defaultMessage: 'Return',
                })}
                required
                fullWidth
                value={returnId}
                onChange={(event) => setReturnId(event.target.value)}
              >
                {returns?.map((entry) => (
                  <MenuItem key={entry.id} value={entry.id}>
                    {formatDate(entry.createdAt)}
                    {SEPARATOR}
                    {intl.formatList(
                      entry.items.map(
                        (item) =>
                          `${item.sku} ${formatQuantity(item.quantity)}`,
                      ),
                      { type: 'conjunction', style: 'narrow' },
                    )}
                  </MenuItem>
                ))}
              </TextField>
            )}
          </Stack>
        </DialogContent>

        <DialogFooter
          submitting={submitting}
          onCancel={close}
          label={intl.formatMessage({
            id: 'orders.returns.link',
            defaultMessage: 'Link',
          })}
          pendingLabel={intl.formatMessage({
            id: 'orders.returns.linking',
            defaultMessage: 'Linking…',
          })}
          disabled={!returnId}
        />
      </form>
    </Dialog>
  );
}
