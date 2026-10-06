import { Alert, Box, Skeleton, Stack, Typography } from '@mui/material';
import { defineMessages, useIntl } from 'react-intl';
import { useParams } from 'react-router-dom';

import { useDocumentText } from '../components/document-text';
import {
  PrintBanner,
  PrintLines,
  PrintParty,
  PrintSheet,
  PrintTotals,
} from '../components/print-sheet';
import { PRINTED } from '../components/printed-words';
import { formatDay } from '../lib/format';
import type { InvoiceDetail, InvoiceLine } from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useResource } from '../lib/use-resource';

/**
 * An invoice on paper (ADR-046), laid out as the packing slip is.
 *
 * An issued invoice prints from what was stored at issue — its number,
 * amounts and both parties as they were that day — so a reprint in a year
 * reads exactly as the original did.
 *
 * A draft prints too, for someone to check before issuing, but marked
 * DRAFT with no number, so it cannot be mistaken for one that was sent. Its
 * seller and bill-to are not copied until issue, so a draft shows only the
 * customer's name. A voided invoice prints with VOID and the reason, as a
 * voided packing slip does.
 */
const WORDS = defineMessages({
  invoice: { id: 'documents.invoice', defaultMessage: 'Invoice' },
  total: { id: 'documents.total', defaultMessage: 'Total' },
  draft: { id: 'documents.draft', defaultMessage: 'DRAFT — not an invoice' },
  draftDetail: {
    id: 'documents.draft.detail',
    defaultMessage:
      'Not yet issued: it has no number and nothing is owed on it.',
  },
  void: {
    id: 'documents.invoice.void',
    defaultMessage: 'VOID — nothing is owed on this invoice',
  },
});

export function InvoicePrintPage() {
  const intl = useIntl();
  const { id } = useParams<{ id: string }>();
  const { data, error, loading } = useResource<{ invoice: InvoiceDetail }>(
    `/invoices/${id}`,
  );
  const invoice = data?.invoice ?? null;

  const showSkeleton = useDelayedFlag(loading);
  // A draft has no stored languages; the server sends the pair it would
  // take today, so this always has one (ADR-054).
  const doc = useDocumentText(
    invoice?.language
      ? { language: invoice.language, secondLanguage: invoice.secondLanguage }
      : null,
  );

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!invoice || !doc) return showSkeleton ? <Skeleton height={320} /> : null;

  const isDraft = invoice.status === 'draft';

  const netOf = (line: InvoiceLine) =>
    isDraft
      ? (invoice.preview?.lines.find((row) => row.id === line.id)?.netAmount ??
        null)
      : line.netAmount;

  return (
    <PrintSheet
      backTo={`/invoices/${invoice.id}`}
      backLabel={intl.formatMessage({
        id: 'documents.backToInvoice',
        defaultMessage: 'Back to the invoice',
      })}
      languages={doc.languages}
    >
      {isDraft && (
        <PrintBanner
          title={doc.label(WORDS.draft)}
          detail={doc.lines((words) => words.formatMessage(WORDS.draftDetail))}
        />
      )}

      {invoice.status === 'voided' && (
        <PrintBanner
          title={doc.label(WORDS.void)}
          detail={doc.lines((words) =>
            words.formatMessage(
              {
                id: 'documents.invoice.voidDetail',
                defaultMessage:
                  'Voided {date}: {reason}{credits, select, none {} other { — reversed by {credits}}}',
              },
              {
                date: invoice.voidedAt
                  ? formatDay(invoice.voidedAt, doc.locale)
                  : '',
                reason: invoice.voidReason ?? '',
                credits:
                  invoice.creditNotes.length > 0
                    ? invoice.creditNotes.map((note) => note.number).join(', ')
                    : 'none',
              },
            ),
          )}
        />
      )}

      <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h5" component="h1">
            {doc.label(WORDS.invoice)}
          </Typography>
          {invoice.number && (
            <Typography variant="h6" component="p">
              {invoice.number}
            </Typography>
          )}
        </Box>

        <Box sx={{ textAlign: 'right' }}>
          {invoice.invoiceDate && (
            <Typography variant="body2">
              {doc.join((words) =>
                words.formatMessage(
                  { id: 'documents.dateOn', defaultMessage: 'Date {date}' },
                  { date: formatDay(invoice.invoiceDate!, doc.locale) },
                ),
              )}
            </Typography>
          )}
          {invoice.dueDate && (
            <Typography variant="body2">
              {doc.join((words) =>
                words.formatMessage(
                  { id: 'documents.dueOn', defaultMessage: 'Due {date}' },
                  { date: formatDay(invoice.dueDate!, doc.locale) },
                ),
              )}
            </Typography>
          )}
          {invoice.orderReference && (
            <Typography variant="body2">
              {doc.join((words) =>
                words.formatMessage(
                  {
                    id: 'documents.yourOrder',
                    defaultMessage: 'Your order {reference}',
                  },
                  { reference: invoice.orderReference },
                ),
              )}
            </Typography>
          )}
        </Box>
      </Stack>

      <Stack direction="row" spacing={6}>
        <PrintParty
          heading={doc.label(PRINTED.from)}
          name={invoice.sellerName}
          lines={[
            invoice.sellerLine1,
            invoice.sellerLine2,
            invoice.sellerCity,
            invoice.sellerRegion,
            invoice.sellerPostalCode,
            invoice.sellerCountry,
          ]}
          extra={
            invoice.sellerTaxNumber && (
              <Typography variant="body2">
                {doc.join((words) =>
                  words.formatMessage(
                    {
                      id: 'documents.taxRegistration',
                      defaultMessage: 'Tax registration {number}',
                    },
                    { number: invoice.sellerTaxNumber },
                  ),
                )}
              </Typography>
            )
          }
        />

        <PrintParty
          heading={doc.label(PRINTED.billTo)}
          name={invoice.billToName ?? invoice.partnerName}
          lines={[
            invoice.billToLine1,
            invoice.billToLine2,
            invoice.billToCity,
            invoice.billToRegion,
            invoice.billToPostalCode,
            invoice.billToCountry,
          ]}
        />

        {invoice.shipToLine1 && (
          <PrintParty
            heading={doc.label(PRINTED.shippedTo)}
            name={invoice.shipToLabel}
            lines={[
              invoice.shipToLine1,
              invoice.shipToLine2,
              invoice.shipToCity,
              invoice.shipToRegion,
              invoice.shipToPostalCode,
              invoice.shipToCountry,
            ]}
          />
        )}
      </Stack>

      <PrintLines
        doc={doc}
        currency={invoice.currency}
        lines={invoice.lines.map((line) => ({ ...line, amount: netOf(line) }))}
      />

      <PrintTotals
        doc={doc}
        currency={invoice.currency}
        subtotal={
          isDraft ? (invoice.preview?.subtotal ?? null) : invoice.subtotal
        }
        taxes={(isDraft ? invoice.preview?.taxes : invoice.taxes) ?? []}
        total={isDraft ? (invoice.preview?.total ?? null) : invoice.total}
        totalLabel={WORDS.total}
      />

      {invoice.note && <Typography variant="body2">{invoice.note}</Typography>}
    </PrintSheet>
  );
}
