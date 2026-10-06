import { Alert, Box, Skeleton, Stack, Typography } from '@mui/material';
import { defineMessages, useIntl } from 'react-intl';
import { useParams } from 'react-router-dom';

import { useDocumentText } from '../components/document-text';
import {
  PrintLines,
  PrintParty,
  PrintSheet,
  PrintTotals,
} from '../components/print-sheet';
import { PRINTED } from '../components/printed-words';
import { formatDay } from '../lib/format';
import type { CreditNoteDetail } from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useResource } from '../lib/use-resource';

/**
 * A credit note on paper (ADR-046): the invoice's layout, stating what is
 * given back and which invoice it reverses. Amounts print positive — a
 * credit note says what it credits, not a negative invoice — and the
 * reason prints, because the customer reads it too.
 */
const WORDS = defineMessages({
  creditNote: { id: 'documents.creditNote', defaultMessage: 'Credit note' },
  to: { id: 'documents.to', defaultMessage: 'To' },
  totalCredited: {
    id: 'documents.totalCredited',
    defaultMessage: 'Total credited',
  },
});

export function CreditNotePrintPage() {
  const intl = useIntl();
  const { id } = useParams<{ id: string }>();
  const { data, error, loading } = useResource<{
    creditNote: CreditNoteDetail;
  }>(`/credit-notes/${id}`);
  const note = data?.creditNote ?? null;

  const showSkeleton = useDelayedFlag(loading);
  // In its invoice's languages, copied when it was issued (ADR-054).
  const doc = useDocumentText(
    note
      ? { language: note.language, secondLanguage: note.secondLanguage }
      : null,
  );

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!note || !doc) return showSkeleton ? <Skeleton height={320} /> : null;

  return (
    <PrintSheet
      backTo={`/credit-notes/${note.id}`}
      backLabel={intl.formatMessage({
        id: 'documents.backToCreditNote',
        defaultMessage: 'Back to the credit note',
      })}
      languages={doc.languages}
    >
      <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h5" component="h1">
            {doc.label(WORDS.creditNote)}
          </Typography>
          <Typography variant="h6" component="p">
            {note.number}
          </Typography>
        </Box>

        <Box sx={{ textAlign: 'right' }}>
          <Typography variant="body2">
            {doc.join((words) =>
              words.formatMessage(
                { id: 'documents.dateOn', defaultMessage: 'Date {date}' },
                { date: formatDay(note.creditDate, doc.locale) },
              ),
            )}
          </Typography>
          <Typography variant="body2">
            {doc.join((words) =>
              words.formatMessage(
                {
                  id: 'documents.creditNote.against',
                  defaultMessage:
                    '{kind, select, void {Voids} other {Credits}} invoice {number}{date, select, none {} other { of {date}}}',
                },
                {
                  kind: note.isVoid ? 'void' : 'credit',
                  number: note.invoiceNumber,
                  date: note.invoiceDate
                    ? formatDay(note.invoiceDate, doc.locale)
                    : 'none',
                },
              ),
            )}
          </Typography>
        </Box>
      </Stack>

      <Stack direction="row" spacing={6}>
        <PrintParty
          heading={doc.label(PRINTED.from)}
          name={note.sellerName}
          lines={[
            note.sellerLine1,
            note.sellerLine2,
            note.sellerCity,
            note.sellerRegion,
            note.sellerPostalCode,
            note.sellerCountry,
          ]}
          extra={
            note.sellerTaxNumber && (
              <Typography variant="body2">
                {doc.join((words) =>
                  words.formatMessage(
                    {
                      id: 'documents.taxRegistration',
                      defaultMessage: 'Tax registration {number}',
                    },
                    { number: note.sellerTaxNumber },
                  ),
                )}
              </Typography>
            )
          }
        />

        <PrintParty
          heading={doc.label(WORDS.to)}
          name={note.billToName}
          lines={[
            note.billToLine1,
            note.billToLine2,
            note.billToCity,
            note.billToRegion,
            note.billToPostalCode,
            note.billToCountry,
          ]}
        />
      </Stack>

      {/* The reason as written: data, in whatever language it was typed. */}
      <Typography variant="body2">
        {doc.join((words) =>
          words.formatMessage(
            { id: 'documents.reason', defaultMessage: 'Reason: {reason}' },
            { reason: note.reason },
          ),
        )}
      </Typography>

      <PrintLines
        doc={doc}
        currency={note.currency}
        lines={note.lines.map((line) => ({ ...line, amount: line.netAmount }))}
      />

      <PrintTotals
        doc={doc}
        currency={note.currency}
        subtotal={note.subtotal}
        taxes={note.taxes}
        total={note.total}
        totalLabel={WORDS.totalCredited}
      />
    </PrintSheet>
  );
}
