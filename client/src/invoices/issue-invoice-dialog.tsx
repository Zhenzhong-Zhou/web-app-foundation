import {
  Alert,
  Dialog,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Link,
  Stack,
  TextField,
} from '@mui/material';
import { type ReactNode, type SubmitEvent, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import type { InvoiceDetail, InvoiceEnvelope } from '../api/types.gen';
import { useCan } from '../auth/permissions';
import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { api, hasCode } from '../lib/api';
import { formatMoney } from '../lib/format';
import { organizationToday } from '../lib/time-zone';
import { useSubmit } from '../lib/use-submit';
import { DateOrderLink } from './date-order-link';
import { PeriodHint } from './period-hint';

/**
 * The one step that cannot be taken back by editing (ADR-046): issuing
 * numbers the invoice, stores its amounts and freezes it. The dialog says
 * so, and shows the total the customer will be asked for.
 *
 * The date defaults to the organization's today (ADR-072), sent as a
 * calendar day: the server stores the day chosen, as it arrives.
 *
 * Refused for want of an address or the tax number, it links to where that
 * is set (ADR-061): the organization's address and tax number to
 * Organization → Profile, the customer's billing address to the customer's
 * page, each for whoever may set it.
 * Anyone else gets the server's message alone: a page they cannot change
 * would be a dead end.
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
  const can = useCan();
  const [invoiceDate, setInvoiceDate] = useState(organizationToday());

  const { submitting, error, errorCode, reset, submit } =
    useSubmit<InvoiceEnvelope>(
      async () => {
        close();
        await onIssued();
      },
      {
        // The number the server gave (ADR-073).
        success: ({ invoice: issued }) =>
          intl.formatMessage(
            {
              id: 'invoices.issuedAs',
              defaultMessage: 'Invoice issued as {number}',
            },
            { number: issued.number ?? '' },
          ),
      },
    );

  function close() {
    reset();
    onClose();
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    void submit(() =>
      api<InvoiceEnvelope>(`/invoices/${invoice.id}/issue`, {
        method: 'POST',
        body: JSON.stringify({ invoiceDate }),
      }),
    );
  }

  /** Where the refusal is put right, keyed on its code, never its words. */
  function remedy(): { to: string; label: string } | null {
    if (
      hasCode(errorCode, 'organization_address_missing') &&
      can('organizations.update')
    ) {
      return {
        to: '/settings/organization',
        label: intl.formatMessage({
          id: 'invoices.issue.setAddress',
          defaultMessage: 'Set it on Organization → Profile',
        }),
      };
    }
    if (
      hasCode(errorCode, 'organization_tax_number_missing') &&
      can('organizations.update')
    ) {
      return {
        to: '/settings/organization',
        label: intl.formatMessage({
          id: 'invoices.issue.setTaxNumber',
          defaultMessage: 'Set it on Organization → Profile',
        }),
      };
    }
    if (
      hasCode(errorCode, 'customer_billing_address_missing') &&
      can('partners.update')
    ) {
      return {
        to: `/partners/${invoice.partnerId}`,
        label: intl.formatMessage(
          {
            id: 'invoices.issue.addBillingAddress',
            defaultMessage: 'Open {partner} to add one',
          },
          { partner: invoice.partnerName },
        ),
      };
    }
    return null;
  }

  const untaxed = invoice.lines.filter((line) => !line.taxCodeId);
  const fix = remedy();

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
            {error && (
              <FormError message={error}>
                {fix && (
                  <Link
                    component={RouterLink}
                    to={fix.to}
                    color="inherit"
                    underline="always"
                  >
                    {fix.label}
                  </Link>
                )}
                <DateOrderLink errorCode={errorCode} />
              </FormError>
            )}

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
            <PeriodHint series="invoice" day={invoiceDate} />
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
