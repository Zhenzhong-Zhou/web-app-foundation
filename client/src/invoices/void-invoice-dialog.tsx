import {
  Dialog,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  TextField,
} from '@mui/material';
import { type ReactNode, type SubmitEvent, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';

import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import { formatMoney } from '../lib/format';
import type { InvoiceDetail } from '../lib/types';
import { useSubmit } from '../lib/use-submit';
import { todayLocal } from './calendar-day';

/**
 * Voids an issued invoice by issuing a credit note for all of it
 * (ADR-046). The reason is printed on the credit note, so the customer
 * reads it too — the helper text says so.
 */
export function VoidInvoiceDialog({
  invoice,
  open,
  onClose,
  onVoided,
}: {
  invoice: InvoiceDetail;
  open: boolean;
  onClose: () => void;
  onVoided: () => Promise<void> | void;
}) {
  const intl = useIntl();
  const [reason, setReason] = useState('');
  const [creditDate, setCreditDate] = useState(todayLocal());

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onVoided();
    },
    {
      success: intl.formatMessage({
        id: 'invoices.voided',
        defaultMessage: 'Invoice voided',
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

    void submit(() =>
      api(`/invoices/${invoice.id}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason, creditDate }),
      }),
    );
  }

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : close}
      fullWidth
      maxWidth="xs"
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          {intl.formatMessage(
            { id: 'invoices.void.title', defaultMessage: 'Void {number}?' },
            { number: invoice.number },
          )}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2}>
            {error && <FormError message={error} />}

            <DialogContentText>
              <FormattedMessage
                id="invoices.void.intro"
                defaultMessage="A credit note for <b>{amount}</b> reverses it in full. Both stay on record. The shipment can then be invoiced again, or voided itself."
                values={{
                  amount: formatMoney(invoice.total, invoice.currency),
                  b: (chunks: ReactNode[]) => <strong>{chunks}</strong>,
                }}
              />
            </DialogContentText>

            <TextField
              id="void-reason"
              label={intl.formatMessage({
                id: 'invoices.void.reason',
                defaultMessage: 'Reason',
              })}
              required
              fullWidth
              multiline
              minRows={2}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              helperText={intl.formatMessage({
                id: 'invoices.void.reason.help',
                defaultMessage:
                  'Printed on the credit note, so the customer reads it.',
              })}
              slotProps={{ htmlInput: { maxLength: 500 } }}
            />

            <TextField
              id="credit-date"
              label={intl.formatMessage({
                id: 'invoices.creditDate',
                defaultMessage: 'Credit note date',
              })}
              type="date"
              required
              fullWidth
              value={creditDate}
              onChange={(event) => setCreditDate(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Stack>
        </DialogContent>

        <DialogFooter
          submitting={submitting}
          onCancel={close}
          label={intl.formatMessage({
            id: 'invoices.void.action',
            defaultMessage: 'Void invoice',
          })}
          pendingLabel={intl.formatMessage({
            id: 'orders.void.pending',
            defaultMessage: 'Voiding…',
          })}
          destructive
        />
      </form>
    </Dialog>
  );
}
