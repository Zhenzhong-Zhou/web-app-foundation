import {
  Alert,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { type SubmitEvent, useState } from 'react';
import { useIntl } from 'react-intl';

import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import { formatDate, SEPARATOR } from '../lib/format';
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
  const intl = useIntl();
  const [reason, setReason] = useState('');

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onVoided();
    },
    {
      success: intl.formatMessage({
        id: 'orders.void.done',
        defaultMessage: 'Shipment voided',
      }),
    },
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
    <Dialog
      open={open}
      onClose={submitting ? undefined : close}
      fullWidth
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          {intl.formatMessage({
            id: 'orders.void.title',
            defaultMessage: 'Void this shipment',
          })}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            {shipment && (
              <Typography variant="body2">
                {[
                  intl.formatMessage(
                    {
                      id: 'orders.void.recorded',
                      defaultMessage: 'Recorded {date}',
                    },
                    { date: formatDate(shipment.createdAt) },
                  ),
                  shipment.carrier,
                  shipment.trackingNumber,
                ]
                  .filter(Boolean)
                  .join(SEPARATOR)}
              </Typography>
            )}

            <Alert severity="warning">
              {intl.formatMessage({
                id: 'orders.void.warning',
                defaultMessage:
                  'Only for a box that has not left. Everything on it goes back where it came from and the order can ship again. The shipment stays on the order, struck through, with your reason. If the box did leave and came back, take a return instead.',
              })}
            </Alert>

            {orderClosed && (
              <Alert severity="info">
                {intl.formatMessage({
                  id: 'orders.void.reopens',
                  defaultMessage:
                    'This order is closed. Voiding reopens it, since what it was closed on never left.',
                })}
              </Alert>
            )}

            <TextField
              id="void-shipment-reason"
              label={intl.formatMessage({
                id: 'inventory.why',
                defaultMessage: 'Why',
              })}
              required
              fullWidth
              multiline
              minRows={2}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              helperText={intl.formatMessage({
                id: 'orders.void.why.help',
                defaultMessage:
                  'Customer cancelled before pickup, recorded on the wrong order, clicked too early.',
              })}
              slotProps={{ htmlInput: { maxLength: 500 } }}
            />
          </Stack>
        </DialogContent>

        <DialogFooter
          submitting={submitting}
          onCancel={close}
          label={intl.formatMessage({
            id: 'orders.void.action',
            defaultMessage: 'Void shipment',
          })}
          pendingLabel={intl.formatMessage({
            id: 'orders.void.pending',
            defaultMessage: 'Voiding…',
          })}
          destructive
          cancelLabel={intl.formatMessage({
            id: 'orders.void.keep',
            defaultMessage: 'Keep it',
          })}
        />
      </form>
    </Dialog>
  );
}
