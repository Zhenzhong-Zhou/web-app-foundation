import {
  Link,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import { EmptyState } from '../components/empty-state';
import { StatusChip } from '../components/status-chip';
import { invoiceStatus } from '../invoices/invoice-status';
import {
  displayQuantity,
  formatCredit,
  formatDay,
  formatMoney,
  NO_VALUE,
} from '../lib/format';
import type { OrderDetail } from '../lib/types';
import { STATUS_TONES } from '../theme/status';

/**
 * A sale's invoices and credit notes in one table (ADR-055): what was
 * billed and given back, as documents, newest last, with net invoiced
 * under them. The figures are the summary's; this is where they come from,
 * one document at a time.
 *
 * Every amount includes tax, as the documents do, and the column says so.
 */
export function OrderDocuments({ order }: { order: OrderDetail }) {
  const intl = useIntl();
  const documents = order.documents;
  const money = order.money;

  if (!documents || !money) return null;

  if (documents.invoices.length === 0 && documents.creditNotes.length === 0) {
    return (
      <EmptyState>
        {intl.formatMessage({
          id: 'orders.documents.empty',
          defaultMessage:
            'No invoices yet. An invoice is created from a shipment, on the Shipments tab.',
        })}
      </EmptyState>
    );
  }

  return (
    <Stack spacing={1.5}>
      <TableContainer>
        <Table size="small" sx={{ '& th, & td': { whiteSpace: 'nowrap' } }}>
          <TableHead>
            <TableRow>
              <TableCell>
                {intl.formatMessage({
                  id: 'orders.documents.document',
                  defaultMessage: 'Document',
                })}
              </TableCell>
              <TableCell>
                {intl.formatMessage({
                  id: 'orders.documents.date',
                  defaultMessage: 'Date',
                })}
              </TableCell>
              <TableCell align="right">
                {intl.formatMessage({
                  id: 'orders.documents.quantity',
                  defaultMessage: 'Quantity',
                })}
              </TableCell>
              <TableCell>
                {intl.formatMessage({
                  id: 'orders.documents.details',
                  defaultMessage: 'Details',
                })}
              </TableCell>
              <TableCell align="right">
                {intl.formatMessage({
                  id: 'orders.documents.amount',
                  defaultMessage: 'Amount, incl. tax',
                })}
              </TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {documents.invoices.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell>
                  <Stack
                    direction="row"
                    spacing={0.75}
                    sx={{ alignItems: 'center' }}
                  >
                    <span>
                      {intl.formatMessage({
                        id: 'orders.documents.invoice',
                        defaultMessage: 'Invoice',
                      })}
                    </span>
                    <Link component={RouterLink} to={`/invoices/${invoice.id}`}>
                      {invoice.number ?? invoiceStatus('draft').label}
                    </Link>
                    <StatusChip
                      tone={STATUS_TONES.invoice[invoice.status]}
                      label={invoiceStatus(invoice.status).label}
                    />
                  </Stack>
                </TableCell>
                <TableCell>
                  {invoice.date ? formatDay(invoice.date) : NO_VALUE}
                </TableCell>
                <TableCell align="right">
                  {displayQuantity(invoice.quantity)}
                </TableCell>
                <TableCell>
                  {intl.formatMessage(
                    {
                      id: 'orders.documents.shipment',
                      defaultMessage: 'Shipment of {date}',
                    },
                    { date: formatDay(invoice.shippedAt.slice(0, 10)) },
                  )}
                </TableCell>
                <TableCell align="right">
                  {formatMoney(invoice.total, invoice.currency)}
                </TableCell>
              </TableRow>
            ))}

            {documents.creditNotes.map((note) => (
              <TableRow key={note.id}>
                <TableCell>
                  <Stack
                    direction="row"
                    spacing={0.75}
                    sx={{ alignItems: 'center' }}
                  >
                    <span>
                      {intl.formatMessage({
                        id: 'orders.documents.creditNote',
                        defaultMessage: 'Credit note',
                      })}
                    </span>
                    <Link
                      component={RouterLink}
                      to={`/credit-notes/${note.id}`}
                    >
                      {note.number}
                    </Link>
                  </Stack>
                </TableCell>
                <TableCell>{formatDay(note.date)}</TableCell>
                <TableCell align="right">
                  {displayQuantity(note.quantity)}
                </TableCell>
                <TableCell>{note.reason}</TableCell>
                <TableCell align="right">
                  {formatCredit(note.total, note.currency)}
                </TableCell>
              </TableRow>
            ))}

            <TableRow>
              <TableCell colSpan={4} align="right">
                {intl.formatMessage({
                  id: 'orders.summary.net',
                  defaultMessage: 'Net invoiced, incl. tax',
                })}
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>
                {formatMoney(money.netInvoiced, money.currency)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>

      <Typography variant="body2" color="text.secondary">
        {intl.formatMessage(
          {
            id: 'orders.documents.notYet',
            defaultMessage: 'Not yet invoiced, before tax: {amount}',
          },
          { amount: formatMoney(money.notInvoiced, money.currency) },
        )}
      </Typography>

      {/* What the documents do not settle yet: returns with no RMA, the
          same note the summary carries, since this is where an accountant
          reconciles. */}
      {order.unsettledReturns > 0 && (
        <Stack spacing={0.5} sx={{ alignItems: 'flex-start' }}>
          <StatusChip
            tone="warning"
            label={intl.formatMessage(
              {
                id: 'orders.summary.unsettled',
                defaultMessage:
                  '{count, plural, one {# return not yet settled} other {# returns not yet settled}}',
              },
              { count: order.unsettledReturns },
            )}
          />
          <Typography variant="caption" color="text.secondary">
            {intl.formatMessage({
              id: 'orders.summary.unsettled.help',
              defaultMessage:
                'No RMA yet: decide on a credit, a replacement or no action.',
            })}
          </Typography>
        </Stack>
      )}
    </Stack>
  );
}
