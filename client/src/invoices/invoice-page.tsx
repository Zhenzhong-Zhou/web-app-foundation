import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Link,
  MenuItem,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { type SubmitEvent, useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';

import { HistoryButton } from '../audit/history-button';
import { useAuth } from '../auth/use-auth';
import { FormError } from '../components/form-error';
import { PageHeader } from '../components/page-header';
import { api, ApiError } from '../lib/api';
import { formatDay, formatMoney } from '../lib/format';
import { openDialog } from '../lib/open-dialog';
import type {
  InvoiceDetail,
  InvoiceLine,
  InvoiceTax,
  TaxCode,
} from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useSubmit } from '../lib/use-submit';
import { formatRate } from '../settings/tax-rate';
import { oneLine } from './calendar-day';
import { InvoiceLineDialog } from './invoice-line-dialog';
import { invoiceStatus } from './invoice-status';
import { IssueInvoiceDialog } from './issue-invoice-dialog';
import { VoidInvoiceDialog } from './void-invoice-dialog';

function messageFor(caught: unknown): string {
  return caught instanceof ApiError
    ? caught.message
    : 'Could not reach the server.';
}

/**
 * One invoice (ADR-046).
 *
 * A draft is a working copy: its prices, tax codes, due date and note are
 * editable, and its totals are the server's preview — the same calculation
 * issuing stores, so the figures here are the figures that print. Once
 * issued, everything shown is what was stored that day, and the only action
 * left is to void it with a credit note.
 */
export function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const { session } = useAuth();
  const navigate = useNavigate();

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editingLine, setEditingLine] = useState<InvoiceLine | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const has = (permission: string) =>
    !!session?.permissions.includes(permission);

  const loading = invoice === null && error === null;
  const showSkeleton = useDelayedFlag(loading);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setInvoice(
        (await api<{ invoice: InvoiceDetail }>(`/invoices/${id}`)).invoice,
      );
      setError(null);
    } catch (caught) {
      setError(messageFor(caught));
    }
  }, [id]);

  useEffect(() => {
    let ignore = false;

    void api<{ invoice: InvoiceDetail }>(`/invoices/${id}`)
      .then((response) => {
        if (!ignore) setInvoice(response.invoice);
      })
      .catch((caught: unknown) => {
        if (!ignore) setError(messageFor(caught));
      });

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

  if (loading) {
    return showSkeleton ? (
      <Stack spacing={2}>
        <Skeleton height={48} />
        <Skeleton height={240} />
      </Stack>
    ) : null;
  }

  if (!invoice) {
    return <Alert severity="error">{error ?? 'No such invoice.'}</Alert>;
  }

  const isDraft = invoice.status === 'draft';
  const status = invoiceStatus(invoice.status);
  const canEdit = isDraft && has('invoices.update');

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
        crumbs={[{ label: 'Invoices', to: '/invoices' }]}
        title={invoice.number ?? 'Draft invoice'}
        subtitle={
          <>
            {invoice.partnerName} ·{' '}
            <Link component={RouterLink} to={`/orders/${invoice.orderId}`}>
              {invoice.orderReference
                ? `Order ${invoice.orderReference}`
                : 'Order'}
            </Link>
            {invoice.invoiceDate && ` · ${formatDay(invoice.invoiceDate)}`}
          </>
        }
        status={status}
        actions={
          <>
            <HistoryButton resourceId={invoice.id} />

            {isDraft && has('invoices.delete') && (
              <Button
                variant="text"
                color="error"
                onClick={openDialog(() => setDeleting(true))}
              >
                Delete draft
              </Button>
            )}

            {isDraft && has('invoices.issue') && (
              <Button onClick={openDialog(() => setIssuing(true))}>
                Issue
              </Button>
            )}

            {invoice.status === 'issued' && has('invoices.issue') && (
              <Button
                variant="outlined"
                color="error"
                onClick={openDialog(() => setVoiding(true))}
              >
                Void
              </Button>
            )}
          </>
        }
      />

      {error && <Alert severity="error">{error}</Alert>}

      {invoice.status === 'voided' && (
        <Alert severity="warning">
          Voided{invoice.voidedAt ? ` ${formatDay(invoice.voidedAt)}` : ''}:{' '}
          {invoice.voidReason}. The credit note below reverses it in full.
        </Alert>
      )}

      {isDraft && canEdit && (
        <DraftDetails
          key={`${invoice.dueDate ?? ''}|${invoice.note ?? ''}`}
          invoice={invoice}
          taxCodes={taxCodes}
          onSaved={load}
        />
      )}

      <Paper variant="outlined">
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>SKU</TableCell>
                <TableCell>Item</TableCell>
                <TableCell align="right">Quantity</TableCell>
                <TableCell align="right">Unit price</TableCell>
                <TableCell>Tax</TableCell>
                <TableCell align="right">Amount</TableCell>
                {canEdit && <TableCell align="right" aria-label="Actions" />}
              </TableRow>
            </TableHead>

            <TableBody>
              {invoice.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>{line.sku}</TableCell>
                  <TableCell>{line.description}</TableCell>
                  <TableCell align="right">{Number(line.quantity)}</TableCell>
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
                        None yet
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
                        Edit
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
            label="Subtotal"
            amount={formatMoney(subtotal ?? null, invoice.currency)}
          />
          {taxes.map((tax) => (
            <TotalRow
              key={`${tax.name}-${tax.rate}`}
              label={`${tax.name} ${formatRate(tax.rate)}`}
              amount={formatMoney(tax.amount, invoice.currency)}
            />
          ))}
          {taxes.length === 0 && (
            <TotalRow
              label="Tax"
              amount={formatMoney(taxTotal ?? null, invoice.currency)}
            />
          )}
          <TotalRow
            label={`Total ${invoice.currency}`}
            amount={formatMoney(total ?? null, invoice.currency)}
            strong
          />
          {isDraft && (
            <Typography variant="caption" color="text.secondary">
              What issuing will store, calculated the same way.
            </Typography>
          )}
        </Stack>
      </Paper>

      {!isDraft && <Parties invoice={invoice} />}

      {invoice.dueDate && (
        <Typography variant="body2">
          Due {formatDay(invoice.dueDate)}
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
            Credit notes
          </Typography>
          <Stack spacing={1}>
            {invoice.creditNotes.map((note) => (
              <Typography key={note.id} variant="body2">
                <Link component={RouterLink} to={`/credit-notes/${note.id}`}>
                  {note.number}
                </Link>{' '}
                · {formatDay(note.creditDate)} ·{' '}
                {formatMoney(note.total, invoice.currency)}
                {note.isVoid ? ' · voids this invoice' : ''} — {note.reason}
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
        onSaved={load}
      />

      <IssueInvoiceDialog
        key={issuing ? 'issuing' : 'closed'}
        invoice={invoice}
        open={issuing}
        onClose={() => setIssuing(false)}
        onIssued={load}
      />

      <VoidInvoiceDialog
        key={voiding ? 'voiding' : 'closed'}
        invoice={invoice}
        open={voiding}
        onClose={() => setVoiding(false)}
        onVoided={load}
      />

      <DeleteDraftDialog
        invoiceId={invoice.id}
        open={deleting}
        onClose={() => setDeleting(false)}
        onDeleted={() => navigate('/invoices')}
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

/** Who issued it and who pays, as they were copied at issue. */
function Parties({ invoice }: { invoice: InvoiceDetail }) {
  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
      <Paper variant="outlined" sx={{ p: 2, flex: 1 }}>
        <Typography variant="overline">From</Typography>
        <Typography variant="body2">{invoice.sellerName}</Typography>
        <Typography variant="body2">
          {oneLine([
            invoice.sellerLine1,
            invoice.sellerLine2,
            invoice.sellerCity,
            invoice.sellerRegion,
            invoice.sellerPostalCode,
            invoice.sellerCountry,
          ])}
        </Typography>
        {invoice.sellerTaxNumber && (
          <Typography variant="body2" color="text.secondary">
            Tax number {invoice.sellerTaxNumber}
          </Typography>
        )}
      </Paper>

      <Paper variant="outlined" sx={{ p: 2, flex: 1 }}>
        <Typography variant="overline">Bill to</Typography>
        <Typography variant="body2">{invoice.billToName}</Typography>
        <Typography variant="body2">
          {oneLine([
            invoice.billToLine1,
            invoice.billToLine2,
            invoice.billToCity,
            invoice.billToRegion,
            invoice.billToPostalCode,
            invoice.billToCountry,
          ])}
        </Typography>
      </Paper>

      {invoice.shipToLine1 && (
        <Paper variant="outlined" sx={{ p: 2, flex: 1 }}>
          <Typography variant="overline">Shipped to</Typography>
          {invoice.shipToLabel && (
            <Typography variant="body2">{invoice.shipToLabel}</Typography>
          )}
          <Typography variant="body2">
            {oneLine([
              invoice.shipToLine1,
              invoice.shipToLine2,
              invoice.shipToCity,
              invoice.shipToRegion,
              invoice.shipToPostalCode,
              invoice.shipToCountry,
            ])}
          </Typography>
        </Paper>
      )}
    </Stack>
  );
}

/**
 * The draft's own fields, and one tax code for every line at once — most
 * invoices carry a single tax treatment, and setting it line by line is
 * the slow way to the same answer.
 */
function DraftDetails({
  invoice,
  taxCodes,
  onSaved,
}: {
  invoice: InvoiceDetail;
  taxCodes: TaxCode[];
  onSaved: () => Promise<void>;
}) {
  const [dueDate, setDueDate] = useState(invoice.dueDate ?? '');
  const [note, setNote] = useState(invoice.note ?? '');
  const [taxCodeId, setTaxCodeId] = useState('');

  const details = useSubmit(onSaved, { success: 'Invoice saved' });
  const tax = useSubmit(
    async () => {
      setTaxCodeId('');
      await onSaved();
    },
    { success: 'Tax code set on every line' },
  );

  function saveDetails(event: SubmitEvent) {
    event.preventDefault();

    // Empty clears: a cleared date field arrives as "".
    void details.submit(() =>
      api(`/invoices/${invoice.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ dueDate: dueDate || null, note }),
      }),
    );
  }

  function applyTaxCode() {
    void tax.submit(() =>
      api(`/invoices/${invoice.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ taxCodeId }),
      }),
    );
  }

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
        <form onSubmit={saveDetails}>
          <Stack spacing={2}>
            {details.error && <FormError message={details.error} />}

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                id="invoice-due-date"
                label="Due date"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ minWidth: 200 }}
              />
              <TextField
                id="invoice-note"
                label="Note on the invoice"
                fullWidth
                value={note}
                onChange={(event) => setNote(event.target.value)}
                helperText="Printed for the customer: a PO number, a thank-you."
                slotProps={{ htmlInput: { maxLength: 1000 } }}
              />
            </Stack>

            <Button
              type="submit"
              variant="outlined"
              disabled={details.submitting}
              sx={{ alignSelf: 'flex-start' }}
            >
              {details.submitting ? 'Saving…' : 'Save details'}
            </Button>
          </Stack>
        </form>

        {tax.error && <FormError message={tax.error} />}

        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{ alignItems: { sm: 'center' } }}
        >
          <TextField
            id="invoice-tax-code"
            select
            label="Tax code for every line"
            value={taxCodeId}
            onChange={(event) => setTaxCodeId(event.target.value)}
            sx={{ minWidth: 260 }}
            helperText={
              taxCodes.length === 0
                ? 'No tax codes yet — add them in Tax codes.'
                : ' '
            }
          >
            {taxCodes.map((code) => (
              <MenuItem key={code.id} value={code.id}>
                {code.name}
              </MenuItem>
            ))}
          </TextField>
          <Button
            variant="outlined"
            onClick={applyTaxCode}
            disabled={!taxCodeId || tax.submitting}
          >
            Apply to every line
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}

/** Deleting a draft is final, but harmless: it has no number to leave a gap. */
function DeleteDraftDialog({
  invoiceId,
  open,
  onClose,
  onDeleted,
}: {
  invoiceId: string;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { submitting, error, reset, submit } = useSubmit(onDeleted, {
    success: 'Draft deleted',
  });

  function close() {
    reset();
    onClose();
  }

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
      <DialogTitle>Delete this draft?</DialogTitle>
      <DialogContent>
        {error && <FormError message={error} />}
        <DialogContentText>
          Nobody outside has seen it, and it has no number yet. The shipment can
          be invoiced again afterwards.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button variant="text" onClick={close}>
          Cancel
        </Button>
        <Button
          color="error"
          disabled={submitting}
          onClick={() =>
            void submit(() =>
              api(`/invoices/${invoiceId}`, { method: 'DELETE' }),
            )
          }
        >
          {submitting ? 'Deleting…' : 'Delete draft'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
