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
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import {
  Link as RouterLink,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';

import { HistoryButton } from '../audit/history-button';
import { useCan } from '../auth/permissions';
import { PageHeader } from '../components/page-header';
import { api } from '../lib/api';
import {
  formatDay,
  formatMoney,
  formatQuantity,
  SEPARATOR,
} from '../lib/format';
import { openDialog } from '../lib/open-dialog';
import type {
  InvoiceDetail,
  InvoiceLine,
  InvoiceTax,
  ReturnAuthorizationDetail,
  TaxCode,
} from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useResource } from '../lib/use-resource';
import { formatRate } from '../settings/tax-rate';
import { CreditInvoiceDialog } from './credit-invoice-dialog';
import { DeleteDraftDialog } from './delete-draft-dialog';
import { DraftDetails } from './invoice-draft-details';
import { InvoiceLineDialog } from './invoice-line-dialog';
import { Parties } from './invoice-parties';
import { invoiceStatus } from './invoice-status';
import { IssueInvoiceDialog } from './issue-invoice-dialog';
import { VoidInvoiceDialog } from './void-invoice-dialog';

/**
 * One invoice (ADR-046).
 *
 * A draft is a working copy: its prices, tax codes, due date and note are
 * editable, and its totals are the server's preview — the same calculation
 * issuing stores, so the figures here are the figures that print. Once
 * issued, everything shown is what was stored that day, and what is left
 * is to credit part of it or void the whole (ADR-047).
 */
export function InvoiceDetailPage() {
  const intl = useIntl();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data, error, loading, reload } = useResource<{
    invoice: InvoiceDetail;
  }>(`/invoices/${id}`);
  const invoice = data?.invoice ?? null;
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([]);
  const [editingLine, setEditingLine] = useState<InvoiceLine | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [crediting, setCrediting] = useState(false);
  const [creditRma, setCreditRma] = useState<ReturnAuthorizationDetail | null>(
    null,
  );

  const can = useCan();

  const showSkeleton = useDelayedFlag(loading);

  useEffect(() => {
    let ignore = false;

    // The codes a draft line can be given. Retired ones are left out of the
    // pickers; a line already carrying one still shows its name.
    void api<{ taxCodes: TaxCode[] }>('/tax-codes')
      .then((response) => {
        if (!ignore) {
          setTaxCodes(response.taxCodes.filter((code) => code.isActive));
        }
      })
      .catch(() => {
        // The pickers stay empty; the page itself still works.
      });

    return () => {
      ignore = true;
    };
  }, [id]);

  const creditFrom = searchParams.get('credit');

  /**
   * Opened from an RMA as /invoices/:id?credit=<rmaId> (ADR-047): the RMA is
   * read, and the Credit dialog opens prefilled with what it settles. If it
   * cannot be read, the dialog opens empty rather than not at all.
   */
  useEffect(() => {
    if (!creditFrom) return;

    let ignore = false;

    void api<{ returnAuthorization: ReturnAuthorizationDetail }>(
      `/return-authorizations/${creditFrom}`,
    )
      .then((response) => {
        if (!ignore) {
          setCreditRma(response.returnAuthorization);
          setCrediting(true);
        }
      })
      .catch(() => {
        if (!ignore) setCrediting(true);
      });

    return () => {
      ignore = true;
    };
  }, [creditFrom]);

  if (loading) {
    return showSkeleton ? (
      <Stack spacing={2}>
        <Skeleton height={48} />
        <Skeleton height={240} />
      </Stack>
    ) : null;
  }

  if (!invoice) {
    return (
      <Alert severity="error">
        {error ??
          intl.formatMessage({
            id: 'invoices.notFound',
            defaultMessage: 'No such invoice.',
          })}
      </Alert>
    );
  }

  const isDraft = invoice.status === 'draft';
  const status = invoiceStatus(invoice.status);
  const canEdit = isDraft && can('invoices.update');

  // A draft reads its figures from the preview; anything issued, from what
  // was stored.
  const netOf = (line: InvoiceLine) =>
    isDraft
      ? (invoice.preview?.lines.find((row) => row.id === line.id)?.netAmount ??
        null)
      : line.netAmount;

  const taxes: InvoiceTax[] =
    (isDraft ? invoice.preview?.taxes : invoice.taxes) ?? [];
  const subtotal = isDraft ? invoice.preview?.subtotal : invoice.subtotal;
  const taxTotal = isDraft ? invoice.preview?.taxTotal : invoice.taxTotal;
  const total = isDraft ? invoice.preview?.total : invoice.total;

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
        ]}
        title={
          invoice.number ??
          intl.formatMessage({
            id: 'orders.shipments.draftInvoice',
            defaultMessage: 'Draft invoice',
          })
        }
        subtitle={
          <>
            {invoice.partnerName}
            {SEPARATOR}
            <Link component={RouterLink} to={`/orders/${invoice.orderId}`}>
              {invoice.orderReference
                ? intl.formatMessage(
                    {
                      id: 'invoices.orderReference',
                      defaultMessage: 'Order {reference}',
                    },
                    { reference: invoice.orderReference },
                  )
                : intl.formatMessage({
                    id: 'inventory.trace.order',
                    defaultMessage: 'Order',
                  })}
            </Link>
            {invoice.invoiceDate && (
              <>
                {SEPARATOR}
                {formatDay(invoice.invoiceDate)}
              </>
            )}
          </>
        }
        status={status}
        actions={
          <>
            <HistoryButton resourceId={invoice.id} />

            <Button
              variant="outlined"
              component={RouterLink}
              to={`/invoices/${invoice.id}/print`}
            >
              {intl.formatMessage({
                id: 'invoices.print',
                defaultMessage: 'Print',
              })}
            </Button>

            {isDraft && can('invoices.delete') && (
              <Button
                variant="text"
                color="error"
                onClick={openDialog(() => setDeleting(true))}
              >
                {intl.formatMessage({
                  id: 'invoices.draft.delete',
                  defaultMessage: 'Delete draft',
                })}
              </Button>
            )}

            {isDraft && can('invoices.issue') && (
              <Button onClick={openDialog(() => setIssuing(true))}>
                {intl.formatMessage({
                  id: 'invoices.issue.action',
                  defaultMessage: 'Issue',
                })}
              </Button>
            )}

            {invoice.status === 'issued' && can('invoices.issue') && (
              <Button
                variant="outlined"
                onClick={openDialog(() => setCrediting(true))}
              >
                {intl.formatMessage({
                  id: 'invoices.credit',
                  defaultMessage: 'Credit',
                })}
              </Button>
            )}

            {/* Not once anything is credited: a void reverses the whole
                invoice, and would credit that part twice (ADR-047). */}
            {invoice.status === 'issued' &&
              invoice.creditNotes.length === 0 &&
              can('invoices.issue') && (
                <Button
                  variant="outlined"
                  color="error"
                  onClick={openDialog(() => setVoiding(true))}
                >
                  {intl.formatMessage({
                    id: 'orders.shipments.void',
                    defaultMessage: 'Void',
                  })}
                </Button>
              )}
          </>
        }
      />

      {error && <Alert severity="error">{error}</Alert>}

      {invoice.status === 'voided' && (
        <Alert severity="warning">
          {invoice.voidedAt
            ? intl.formatMessage(
                {
                  id: 'invoices.voidedOn',
                  defaultMessage:
                    'Voided {date}: {reason}. The credit note below reverses it in full.',
                },
                {
                  date: formatDay(invoice.voidedAt),
                  reason: invoice.voidReason,
                },
              )
            : intl.formatMessage(
                {
                  id: 'invoices.voidedNoDate',
                  defaultMessage:
                    'Voided: {reason}. The credit note below reverses it in full.',
                },
                { reason: invoice.voidReason },
              )}
        </Alert>
      )}

      {isDraft && canEdit && (
        <DraftDetails
          key={`${invoice.dueDate ?? ''}|${invoice.note ?? ''}`}
          invoice={invoice}
          taxCodes={taxCodes}
          onSaved={reload}
        />
      )}

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
                {canEdit && (
                  <TableCell
                    align="right"
                    aria-label={intl.formatMessage({
                      id: 'orders.lines.actions',
                      defaultMessage: 'Actions',
                    })}
                  />
                )}
              </TableRow>
            </TableHead>

            <TableBody>
              {invoice.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>{line.sku}</TableCell>
                  <TableCell>{line.description}</TableCell>
                  {/* Trailing zeros dropped, as before; the decimal
                    separator the reader's (formatQuantity). */}
                  <TableCell align="right">
                    {formatQuantity(String(Number(line.quantity)))}
                  </TableCell>
                  <TableCell align="right">
                    {formatMoney(line.unitPrice, invoice.currency)}
                  </TableCell>
                  <TableCell>
                    {line.taxCodeName ?? (
                      <Typography
                        component="span"
                        variant="body2"
                        color="warning.main"
                      >
                        {intl.formatMessage({
                          id: 'invoices.tax.noneYet',
                          defaultMessage: 'None yet',
                        })}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {formatMoney(netOf(line), invoice.currency)}
                  </TableCell>
                  {canEdit && (
                    <TableCell align="right">
                      <Button
                        variant="text"
                        size="small"
                        onClick={openDialog(() => setEditingLine(line))}
                      >
                        {intl.formatMessage({
                          id: 'common.edit',
                          defaultMessage: 'Edit',
                        })}
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Stack spacing={0.5} sx={{ p: 2, alignItems: 'flex-end' }}>
          <TotalRow
            label={intl.formatMessage({
              id: 'invoices.subtotal',
              defaultMessage: 'Subtotal',
            })}
            amount={formatMoney(subtotal ?? null, invoice.currency)}
          />
          {taxes.map((tax) => (
            <TotalRow
              key={`${tax.name}-${tax.rate}`}
              label={[tax.name, formatRate(tax.rate)].join(' ')}
              amount={formatMoney(tax.amount, invoice.currency)}
            />
          ))}
          {taxes.length === 0 && (
            <TotalRow
              label={intl.formatMessage({
                id: 'invoices.tax',
                defaultMessage: 'Tax',
              })}
              amount={formatMoney(taxTotal ?? null, invoice.currency)}
            />
          )}
          <TotalRow
            label={intl.formatMessage(
              { id: 'invoices.totalIn', defaultMessage: 'Total {currency}' },
              { currency: invoice.currency },
            )}
            amount={formatMoney(total ?? null, invoice.currency)}
            strong
          />
          {isDraft && (
            <Typography variant="caption" color="text.secondary">
              {intl.formatMessage({
                id: 'invoices.previewNote',
                defaultMessage:
                  'What issuing will store, calculated the same way.',
              })}
            </Typography>
          )}
        </Stack>
      </Paper>

      {!isDraft && <Parties invoice={invoice} />}

      {invoice.dueDate && (
        <Typography variant="body2">
          {intl.formatMessage(
            { id: 'invoices.dueOn', defaultMessage: 'Due {date}' },
            { date: formatDay(invoice.dueDate) },
          )}
        </Typography>
      )}
      {!canEdit && invoice.note && (
        <Typography variant="body2" color="text.secondary">
          {invoice.note}
        </Typography>
      )}

      {invoice.creditNotes.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle1" component="h2" gutterBottom>
            {intl.formatMessage({
              id: 'invoices.creditNotes',
              defaultMessage: 'Credit notes',
            })}
          </Typography>
          <Stack spacing={1}>
            {invoice.creditNotes.map((note) => (
              <Typography key={note.id} variant="body2">
                <Link component={RouterLink} to={`/credit-notes/${note.id}`}>
                  {note.number}
                </Link>
                {SEPARATOR}
                {note.isVoid
                  ? intl.formatMessage(
                      {
                        id: 'invoices.creditNoteVoids',
                        defaultMessage:
                          '{date} · {amount} · voids this invoice — {reason}',
                      },
                      {
                        date: formatDay(note.creditDate),
                        amount: formatMoney(note.total, invoice.currency),
                        reason: note.reason,
                      },
                    )
                  : intl.formatMessage(
                      {
                        id: 'invoices.creditNoteLine',
                        defaultMessage: '{date} · {amount} — {reason}',
                      },
                      {
                        date: formatDay(note.creditDate),
                        amount: formatMoney(note.total, invoice.currency),
                        reason: note.reason,
                      },
                    )}
              </Typography>
            ))}
          </Stack>
        </Paper>
      )}

      {/* Keyed, so each line opens with its own values. */}
      <InvoiceLineDialog
        key={editingLine?.id}
        invoiceId={invoice.id}
        line={editingLine}
        taxCodes={taxCodes}
        onClose={() => setEditingLine(null)}
        onSaved={reload}
      />

      <IssueInvoiceDialog
        key={issuing ? 'issuing' : 'closed'}
        invoice={invoice}
        open={issuing}
        onClose={() => setIssuing(false)}
        onIssued={reload}
      />

      <VoidInvoiceDialog
        key={voiding ? 'voiding' : 'closed'}
        invoice={invoice}
        open={voiding}
        onClose={() => setVoiding(false)}
        onVoided={reload}
      />

      <DeleteDraftDialog
        invoiceId={invoice.id}
        open={deleting}
        onClose={() => setDeleting(false)}
        onDeleted={() => navigate('/invoices')}
      />

      <CreditInvoiceDialog
        key={crediting ? `credit-${creditRma?.id ?? 'none'}` : 'credit-closed'}
        invoice={invoice}
        rma={creditRma}
        open={crediting && invoice.status === 'issued'}
        onClose={() => {
          setCrediting(false);
          setCreditRma(null);
          // Drop ?credit= so a reload does not reopen it.
          if (creditFrom) setSearchParams({});
        }}
        onIssued={reload}
      />
    </Stack>
  );
}

function TotalRow({
  label,
  amount,
  strong = false,
}: {
  label: string;
  amount: string;
  strong?: boolean;
}) {
  return (
    <Stack direction="row" spacing={3} sx={{ minWidth: 260 }}>
      <Typography
        variant="body2"
        sx={{ flexGrow: 1, fontWeight: strong ? 600 : undefined }}
      >
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: strong ? 600 : undefined }}>
        {amount}
      </Typography>
    </Stack>
  );
}
