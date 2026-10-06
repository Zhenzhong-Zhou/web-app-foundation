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
import { formatQuantity } from '../lib/format';
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
  const intl = useIntl();
  const [reason, setReason] = useState('');

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onClosed();
    },
    {
      success: intl.formatMessage({
        id: 'orders.lines.closedShortDone',
        defaultMessage: 'Line closed short',
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
    if (!line) return;

    void submit(() =>
      api(`/orders/${orderId}/lines/${line.id}/close`, {
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
            id: 'orders.closeLine.title',
            defaultMessage: 'Stop expecting the rest',
          })}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            {line && (
              <Typography variant="body2">
                {intl.formatMessage(
                  {
                    id: 'orders.closeLine.progress',
                    defaultMessage: '{sku}: {fulfilled} of {ordered} received.',
                  },
                  {
                    sku: line.sku,
                    fulfilled: formatQuantity(line.quantityFulfilled),
                    ordered: formatQuantity(line.quantityOrdered),
                  },
                )}
              </Typography>
            )}

            {/* The number people expect this to change, and the reason it
                does not. */}
            <Alert severity="info">
              {intl.formatMessage({
                id: 'orders.closeLine.notice',
                defaultMessage:
                  'The ordered quantity stays as it is. Nothing further will be expected, but the shortfall remains visible — otherwise a short delivery would look the same as an accurate one.',
              })}
            </Alert>

            <TextField
              id="close-line-reason"
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
                id: 'orders.closeLine.why.help',
                defaultMessage:
                  'Discontinued, backordered indefinitely, ordered by mistake.',
              })}
              slotProps={{ htmlInput: { maxLength: 500 } }}
            />
          </Stack>
        </DialogContent>

        <DialogFooter
          submitting={submitting}
          onCancel={close}
          label={intl.formatMessage({
            id: 'orders.closeLine.action',
            defaultMessage: 'Close line',
          })}
          pendingLabel={intl.formatMessage({
            id: 'orders.closeLine.pending',
            defaultMessage: 'Closing…',
          })}
        />
      </form>
    </Dialog>
  );
}
