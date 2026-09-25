import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  TextField,
} from '@mui/material';
import { type SubmitEvent, useState } from 'react';

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
  const [reason, setReason] = useState('');
  const [creditDate, setCreditDate] = useState(todayLocal());

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onVoided();
    },
    { success: 'Invoice voided' },
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
    <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
      <form onSubmit={handleSubmit}>
        <DialogTitle>Void {invoice.number}?</DialogTitle>

        <DialogContent>
          <Stack spacing={2}>
            {error && <FormError message={error} />}

            <DialogContentText>
              A credit note for{' '}
              <strong>{formatMoney(invoice.total, invoice.currency)}</strong>{' '}
              reverses it in full. Both stay on record. The shipment can then be
              invoiced again, or voided itself.
            </DialogContentText>

            <TextField
              id="void-reason"
              label="Reason"
              required
              fullWidth
              multiline
              minRows={2}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              helperText="Printed on the credit note, so the customer reads it."
              slotProps={{ htmlInput: { maxLength: 500 } }}
            />

            <TextField
              id="credit-date"
              label="Credit note date"
              type="date"
              required
              fullWidth
              value={creditDate}
              onChange={(event) => setCreditDate(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button variant="text" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" color="error" disabled={submitting}>
            {submitting ? 'Voiding…' : 'Void invoice'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
