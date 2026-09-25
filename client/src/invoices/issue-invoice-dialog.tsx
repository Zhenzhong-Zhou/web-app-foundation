import {
  Alert,
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
 * The one step that cannot be taken back by editing (ADR-046): issuing
 * numbers the invoice, stores its amounts and freezes it. The dialog says
 * so, and shows the total the customer will be asked for.
 *
 * The date defaults to the person's own today, sent as a calendar day —
 * the server does not guess one in UTC.
 */
export function IssueInvoiceDialog({
  invoice,
  open,
  onClose,
  onIssued,
}: {
  invoice: InvoiceDetail;
  open: boolean;
  onClose: () => void;
  onIssued: () => Promise<void> | void;
}) {
  const [invoiceDate, setInvoiceDate] = useState(todayLocal());

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onIssued();
    },
    { success: 'Invoice issued' },
  );

  function close() {
    reset();
    onClose();
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    void submit(() =>
      api(`/invoices/${invoice.id}/issue`, {
        method: 'POST',
        body: JSON.stringify({ invoiceDate }),
      }),
    );
  }

  const untaxed = invoice.lines.filter((line) => !line.taxCodeId);

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
      <form onSubmit={handleSubmit}>
        <DialogTitle>Issue this invoice?</DialogTitle>

        <DialogContent>
          <Stack spacing={2}>
            {error && <FormError message={error} />}

            {/* The server refuses too; saying it here saves the round trip. */}
            {untaxed.length > 0 && (
              <Alert severity="warning">
                {untaxed.map((line) => line.sku).join(', ')}{' '}
                {untaxed.length === 1 ? 'has' : 'have'} no tax code yet.
              </Alert>
            )}

            <DialogContentText>
              {invoice.partnerName} will be invoiced{' '}
              <strong>
                {formatMoney(invoice.preview?.total ?? null, invoice.currency)}
              </strong>
              . Once issued it gets its number and cannot be edited; a mistake
              is corrected by voiding it with a credit note.
            </DialogContentText>

            <TextField
              id="invoice-date"
              label="Invoice date"
              type="date"
              required
              fullWidth
              value={invoiceDate}
              onChange={(event) => setInvoiceDate(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button variant="text" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Issuing…' : 'Issue'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
