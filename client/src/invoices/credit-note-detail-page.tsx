import {
  Alert,
  Button,
  Link,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type { ReactNode } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link as RouterLink, useParams } from 'react-router-dom';

import { PageHeader } from '../components/page-header';
import {
  displayQuantity,
  formatDay,
  formatMoney,
  NO_VALUE,
  SEPARATOR,
} from '../lib/format';
import type { CreditNoteDetail } from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useResource } from '../lib/use-resource';
import { formatRate } from '../settings/tax-rate';
import { oneLine } from './calendar-day';

/**
 * One credit note, read-only (ADR-046). It never changes after it is
 * issued, so there is nothing to do here but read it — and, in the next
 * step, print it. The amounts are positive: a credit note states what it
 * gives back, not a negative invoice.
 */
export function CreditNoteDetailPage() {
  const intl = useIntl();
  const { id } = useParams<{ id: string }>();
  const { data, error, loading } = useResource<{
    creditNote: CreditNoteDetail;
  }>(`/credit-notes/${id}`);
  const note = data?.creditNote ?? null;

  const showSkeleton = useDelayedFlag(loading);

  if (!note) {
    if (error) return <Alert severity="error">{error}</Alert>;
    return showSkeleton ? <Skeleton height={240} /> : null;
  }

  /** The invoice's number as a link, in whichever sentence names it. */
  const link = (chunks: ReactNode[]) => (
    <Link component={RouterLink} to={`/invoices/${note.invoiceId}`}>
      {chunks}
    </Link>
  );
  const invoiceDate = note.invoiceDate ? formatDay(note.invoiceDate) : '';

  return (
    <Stack spacing={3}>
      <PageHeader
        crumbs={[
          {
            label: intl.formatMessage({
              id: 'layout.nav.invoices',
              defaultMessage: 'Invoices',
            }),
            to: '/invoices',
          },
          {
            label:
              note.invoiceNumber ??
              intl.formatMessage({
                id: 'invoices.invoice',
                defaultMessage: 'Invoice',
              }),
            to: `/invoices/${note.invoiceId}`,
          },
        ]}
        title={note.number}
        subtitle={[note.billToName, formatDay(note.creditDate)].join(SEPARATOR)}
        status={{
          label: note.isVoid
            ? intl.formatMessage({
                id: 'invoices.creditNote.voids',
                defaultMessage: 'Voids invoice',
              })
            : intl.formatMessage({
                id: 'invoices.credit',
                defaultMessage: 'Credit',
              }),
          color: 'default',
        }}
        actions={
          <Button
            variant="outlined"
            component={RouterLink}
            to={`/credit-notes/${note.id}/print`}
          >
            {intl.formatMessage({
              id: 'invoices.print',
              defaultMessage: 'Print',
            })}
          </Button>
        }
      />

      {/* Four whole sentences rather than one built from parts, so each
          language orders its own; written out, each with its own id and
          English, where the extractor and the types both read them. */}
      <Alert severity="info">
        {note.isVoid ? (
          note.invoiceDate ? (
            <FormattedMessage
              id="invoices.creditNote.reversesOn"
              defaultMessage="Reverses <link>{number}</link> of {date}. Reason: {reason}"
              values={{
                number: note.invoiceNumber,
                date: invoiceDate,
                reason: note.reason,
                link,
              }}
            />
          ) : (
            <FormattedMessage
              id="invoices.creditNote.reverses"
              defaultMessage="Reverses <link>{number}</link>. Reason: {reason}"
              values={{ number: note.invoiceNumber, reason: note.reason, link }}
            />
          )
        ) : note.invoiceDate ? (
          <FormattedMessage
            id="invoices.creditNote.againstOn"
            defaultMessage="Credits against <link>{number}</link> of {date}. Reason: {reason}"
            values={{
              number: note.invoiceNumber,
              date: invoiceDate,
              reason: note.reason,
              link,
            }}
          />
        ) : (
          <FormattedMessage
            id="invoices.creditNote.against"
            defaultMessage="Credits against <link>{number}</link>. Reason: {reason}"
            values={{ number: note.invoiceNumber, reason: note.reason, link }}
          />
        )}
      </Alert>

      <Paper variant="outlined">
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>
                  {intl.formatMessage({
                    id: 'products.sku',
                    defaultMessage: 'SKU',
                  })}
                </TableCell>
                <TableCell>
                  {intl.formatMessage({
                    id: 'inventory.item',
                    defaultMessage: 'Item',
                  })}
                </TableCell>
                <TableCell align="right">
                  {intl.formatMessage({
                    id: 'inventory.quantity',
                    defaultMessage: 'Quantity',
                  })}
                </TableCell>
                <TableCell align="right">
                  {intl.formatMessage({
                    id: 'orders.unitPrice',
                    defaultMessage: 'Unit price',
                  })}
                </TableCell>
                <TableCell>
                  {intl.formatMessage({
                    id: 'invoices.tax',
                    defaultMessage: 'Tax',
                  })}
                </TableCell>
                <TableCell align="right">
                  {intl.formatMessage({
                    id: 'invoices.amount',
                    defaultMessage: 'Amount',
                  })}
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {note.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>{line.sku}</TableCell>
                  <TableCell>{line.description}</TableCell>
                  <TableCell align="right">
                    {displayQuantity(line.quantity)}
                  </TableCell>
                  <TableCell align="right">
                    {formatMoney(line.unitPrice, note.currency)}
                  </TableCell>
                  <TableCell>{line.taxCodeName ?? NO_VALUE}</TableCell>
                  <TableCell align="right">
                    {formatMoney(line.netAmount, note.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Stack spacing={0.5} sx={{ p: 2, alignItems: 'flex-end' }}>
          <Typography variant="body2">
            {intl.formatMessage(
              {
                id: 'invoices.credit.subtotal',
                defaultMessage: 'Subtotal {amount}',
              },
              { amount: formatMoney(note.subtotal, note.currency) },
            )}
          </Typography>
          {note.taxes.map((tax) => (
            <Typography key={`${tax.name}-${tax.rate}`} variant="body2">
              {[
                tax.name,
                formatRate(tax.rate),
                formatMoney(tax.amount, note.currency),
              ].join(' ')}
            </Typography>
          ))}
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {intl.formatMessage(
              {
                id: 'invoices.credit.total',
                defaultMessage: 'Total credited {amount}',
              },
              { amount: formatMoney(note.total, note.currency) },
            )}
          </Typography>
        </Stack>
      </Paper>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <Paper variant="outlined" sx={{ p: 2, flex: 1 }}>
          <Typography variant="overline">
            {intl.formatMessage({
              id: 'invoices.from',
              defaultMessage: 'From',
            })}
          </Typography>
          <Typography variant="body2">{note.sellerName}</Typography>
          <Typography variant="body2">
            {oneLine([
              note.sellerLine1,
              note.sellerLine2,
              note.sellerCity,
              note.sellerRegion,
              note.sellerPostalCode,
              note.sellerCountry,
            ])}
          </Typography>
        </Paper>
        <Paper variant="outlined" sx={{ p: 2, flex: 1 }}>
          <Typography variant="overline">
            {intl.formatMessage({
              id: 'invoices.to',
              defaultMessage: 'To',
            })}
          </Typography>
          <Typography variant="body2">{note.billToName}</Typography>
          <Typography variant="body2">
            {oneLine([
              note.billToLine1,
              note.billToLine2,
              note.billToCity,
              note.billToRegion,
              note.billToPostalCode,
              note.billToCountry,
            ])}
          </Typography>
        </Paper>
      </Stack>
    </Stack>
  );
}
