import {
  Alert,
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
  const intl = useIntl();
  const [invoiceDate, setInvoiceDate] = useState(todayLocal());

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onIssued();
    },
    {
      success: intl.formatMessage({
        id: 'invoices.issued',
        defaultMessage: 'Invoice issued',
      }),
    },
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
    <Dialog
      open={open}
      onClose={submitting ? undefined : close}
      fullWidth
      maxWidth="xs"
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          {intl.formatMessage({
            id: 'invoices.issue.title',
            defaultMessage: 'Issue this invoice?',
          })}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2}>
            {error && <FormError message={error} />}

            {/* The server refuses too; saying it here saves the round trip. */}
            {untaxed.length > 0 && (
              <Alert severity="warning">
                {intl.formatMessage(
                  {
                    id: 'invoices.issue.untaxed',
                    defaultMessage:
                      '{skus} {count, plural, one {has} other {have}} no tax code yet.',
                  },
                  {
                    skus: intl.formatList(
                      untaxed.map((line) => line.sku),
                      { type: 'conjunction', style: 'narrow' },
                    ),
                    count: untaxed.length,
                  },
                )}
              </Alert>
            )}

            <DialogContentText>
              <FormattedMessage
                id="invoices.issue.intro"
                defaultMessage="{partner} will be invoiced <b>{amount}</b>. Once issued it gets its number and cannot be edited; a mistake is corrected by voiding it with a credit note."
                values={{
                  partner: invoice.partnerName,
                  amount: formatMoney(
                    invoice.preview?.total ?? null,
                    invoice.currency,
                  ),
                  b: (chunks: ReactNode[]) => <strong>{chunks}</strong>,
                }}
              />
            </DialogContentText>

            <TextField
              id="invoice-date"
              label={intl.formatMessage({
                id: 'invoices.invoiceDate',
                defaultMessage: 'Invoice date',
              })}
              type="date"
              required
              fullWidth
              value={invoiceDate}
              onChange={(event) => setInvoiceDate(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Stack>
        </DialogContent>

        <DialogFooter
          submitting={submitting}
          onCancel={close}
          label={intl.formatMessage({
            id: 'invoices.issue.action',
            defaultMessage: 'Issue',
          })}
          pendingLabel={intl.formatMessage({
            id: 'invoices.issue.pending',
            defaultMessage: 'Issuing…',
          })}
        />
      </form>
    </Dialog>
  );
}
