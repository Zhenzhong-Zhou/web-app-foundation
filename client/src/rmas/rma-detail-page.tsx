import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
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
import { useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';

import { HistoryButton } from '../audit/history-button';
import { useCan } from '../auth/permissions';
import { FormError } from '../components/form-error';
import { PageHeader } from '../components/page-header';
import { LoadFailure } from '../errors/load-failure';
import { api } from '../lib/api';
import {
  displayQuantity,
  formatDate,
  NO_VALUE,
  SEPARATOR,
} from '../lib/format';
import { openDialog } from '../lib/open-dialog';
import { useRecordOpened } from '../lib/recent';
import type {
  InvoicePage,
  InvoiceSummary,
  ReturnAuthorizationDetail,
} from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useResource } from '../lib/use-resource';
import { useSubmit } from '../lib/use-submit';
import { LinkReturnDialog } from './link-return-dialog';
import { resolutionLabel, rmaStatus } from './rma-labels';

/** A numeric(18,4) of nothing always reads '0.0000' (ADR-025). */
const NOTHING = '0.0000';

type Confirming = 'close' | 'cancel' | null;

/**
 * One return authorization (ADR-047): per line, what was authorized, what
 * has come back against it, and what has been credited — the three figures
 * anyone deciding the next step needs side by side.
 *
 * What happens next depends on each line's resolution: credit is issued
 * against an invoice, replace raises a sale at zero, none needs nothing
 * more. Goods themselves come back through the order's Take a return,
 * naming this RMA, or are linked here if they arrived first.
 */
export function RmaDetailPage() {
  const intl = useIntl();
  const { id } = useParams<{ id: string }>();
  const can = useCan();
  const navigate = useNavigate();

  const { data, error, failure, loading, reload } = useResource<{
    returnAuthorization: ReturnAuthorizationDetail;
  }>(`/return-authorizations/${id}`);
  const rma = data?.returnAuthorization ?? null;
  // Remembered as recently opened, once loaded (ADR-058).
  useRecordOpened('return', id, rma !== null);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [linking, setLinking] = useState(false);

  /**
   * The invoices a credit for this RMA can go against: the one it names, or
   * else every issued invoice on its order. Each gets its own link, so the
   * usual case — one invoice — is one click, and nothing is guessed.
   */
  const [creditable, setCreditable] = useState<InvoiceSummary[]>([]);

  const showSkeleton = useDelayedFlag(loading);
  const canUpdate = can('return_authorizations.update');
  // Crediting is the finance act, not customer service's (ADR-047).
  const canCredit = can('invoices.issue');

  const orderId = rma?.orderId;
  const namedInvoiceId = rma?.invoiceId ?? null;

  useEffect(() => {
    if (!orderId || !canCredit) return;

    let ignore = false;

    void api<InvoicePage>(
      `/invoices?orderId=${orderId}&status=issued&limit=100`,
    )
      .then((page) => {
        if (!ignore) {
          setCreditable(
            namedInvoiceId
              ? page.entries.filter((invoice) => invoice.id === namedInvoiceId)
              : page.entries,
          );
        }
      })
      .catch(() => {
        // No links; crediting is still open from the invoice page.
      });

    return () => {
      ignore = true;
    };
  }, [orderId, namedInvoiceId, canCredit]);

  // The replacement opens as soon as it exists; useSubmit's callback takes
  // no result, so its id is kept here.
  const replacementId = useRef<string | null>(null);
  const replacement = useSubmit(
    () => navigate(`/orders/${replacementId.current}`),
    {
      success: intl.formatMessage({
        id: 'rmas.replacement.raised',
        defaultMessage: 'Replacement order raised',
      }),
    },
  );

  if (!rma) {
    if (error) {
      return (
        <LoadFailure
          failure={failure}
          message={error}
          missingTitle={intl.formatMessage({
            id: 'status.missing.rma',
            defaultMessage: "This return doesn't exist",
          })}
          list={{
            to: '/return-authorizations',
            label: intl.formatMessage({
              id: 'layout.nav.returns',
              defaultMessage: 'Returns',
            }),
          }}
          onRetry={() => void reload()}
        />
      );
    }
    return showSkeleton ? <Skeleton height={240} /> : null;
  }

  const open = rma.status === 'open';
  const status = rmaStatus(rma.status);

  // Cancelling says nothing happened under it; the server refuses once
  // anything did, so the button is offered only when that is true here.
  const untouched = rma.lines.every(
    (line) =>
      line.quantityReceived === NOTHING && line.quantityCredited === NOTHING,
  );
  const hasReplace = rma.lines.some((line) => line.resolution === 'replace');
  const hasCredit = rma.lines.some((line) => line.resolution === 'credit');

  function raiseReplacement() {
    void replacement.submit(async () => {
      const { order } = await api<{ order: { id: string } }>(
        `/return-authorizations/${rma!.id}/replacement`,
        { method: 'POST' },
      );
      replacementId.current = order.id;
    });
  }

  return (
    <Stack spacing={3}>
      <PageHeader
        crumbs={[
          {
            label: intl.formatMessage({
              id: 'layout.nav.returns',
              defaultMessage: 'Returns',
            }),
            to: '/return-authorizations',
          },
        ]}
        title={rma.number}
        subtitle={
          <>
            {rma.partnerName}
            {SEPARATOR}
            <Link component={RouterLink} to={`/orders/${rma.orderId}`}>
              {rma.orderReference
                ? intl.formatMessage(
                    {
                      id: 'invoices.orderReference',
                      defaultMessage: 'Order {reference}',
                    },
                    { reference: rma.orderReference },
                  )
                : intl.formatMessage({
                    id: 'inventory.trace.order',
                    defaultMessage: 'Order',
                  })}
            </Link>
            {rma.invoiceId && (
              <>
                {SEPARATOR}
                <Link component={RouterLink} to={`/invoices/${rma.invoiceId}`}>
                  {rma.invoiceNumber}
                </Link>
              </>
            )}
            {SEPARATOR}
            {intl.formatMessage(
              { id: 'rmas.raisedOn', defaultMessage: 'raised {date}' },
              { date: formatDate(rma.createdAt) },
            )}
          </>
        }
        status={status}
        actions={
          <>
            <HistoryButton resourceId={rma.id} />

            {open && canUpdate && untouched && (
              <Button
                variant="text"
                color="error"
                onClick={openDialog(() => setConfirming('cancel'))}
              >
                {intl.formatMessage({
                  id: 'rmas.cancel',
                  defaultMessage: 'Cancel RMA',
                })}
              </Button>
            )}

            {open && canUpdate && (
              <Button
                variant="outlined"
                onClick={openDialog(() => setConfirming('close'))}
              >
                {intl.formatMessage({
                  id: 'rmas.close',
                  defaultMessage: 'Close RMA',
                })}
              </Button>
            )}
          </>
        }
      />

      {error && <Alert severity="error">{error}</Alert>}
      {replacement.error && <FormError message={replacement.error} />}

      <Typography>{rma.reason}</Typography>
      {!rma.expectsGoods && (
        <Alert severity="info">
          {intl.formatMessage({
            id: 'rmas.keepOrDestroy',
            defaultMessage:
              'The customer was told to keep or destroy the goods, so nothing will be received. Credit follows what is authorized.',
          })}
        </Alert>
      )}
      {rma.note && (
        <Typography variant="body2" color="text.secondary">
          {rma.note}
        </Typography>
      )}

      <Paper variant="outlined">
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>
                  {intl.formatMessage({
                    id: 'inventory.item',
                    defaultMessage: 'Item',
                  })}
                </TableCell>
                <TableCell>
                  {intl.formatMessage({
                    id: 'rmas.then',
                    defaultMessage: 'Then',
                  })}
                </TableCell>
                <TableCell align="right">
                  {intl.formatMessage({
                    id: 'rmas.authorizedQty',
                    defaultMessage: 'Authorized',
                  })}
                </TableCell>
                <TableCell align="right">
                  {intl.formatMessage({
                    id: 'orders.status.received',
                    defaultMessage: 'Received',
                  })}
                </TableCell>
                <TableCell align="right">
                  {intl.formatMessage({
                    id: 'rmas.credited',
                    defaultMessage: 'Credited',
                  })}
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rma.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>{line.sku}</TableCell>
                  <TableCell>{resolutionLabel(line.resolution)}</TableCell>
                  <TableCell align="right">
                    {displayQuantity(line.quantity)}
                  </TableCell>
                  <TableCell align="right">
                    {rma.expectsGoods
                      ? displayQuantity(line.quantityReceived)
                      : NO_VALUE}
                  </TableCell>
                  <TableCell align="right">
                    {line.resolution === 'credit'
                      ? displayQuantity(line.quantityCredited)
                      : NO_VALUE}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {open && canUpdate && (rma.expectsGoods || hasReplace) && (
        <Stack direction="row" spacing={2}>
          {rma.expectsGoods && (
            <Button
              variant="outlined"
              onClick={openDialog(() => setLinking(true))}
            >
              {intl.formatMessage({
                id: 'rmas.link.action',
                defaultMessage: 'Link a return',
              })}
            </Button>
          )}

          {hasReplace && (
            <Button
              variant="outlined"
              disabled={replacement.submitting}
              onClick={raiseReplacement}
            >
              {replacement.submitting
                ? intl.formatMessage({
                    id: 'orders.create.raising',
                    defaultMessage: 'Raising…',
                  })
                : intl.formatMessage({
                    id: 'rmas.replacement.raise',
                    defaultMessage: 'Raise replacement',
                  })}
            </Button>
          )}
        </Stack>
      )}

      {/* Its own row and its own permission: whoever issues credits may
          not be whoever manages RMAs. */}
      {open && canCredit && hasCredit && creditable.length > 0 && (
        <Stack direction="row" spacing={2}>
          {creditable.map((invoice) => (
            <Button
              key={invoice.id}
              variant="outlined"
              component={RouterLink}
              to={`/invoices/${invoice.id}?credit=${rma.id}`}
            >
              {intl.formatMessage(
                { id: 'rmas.creditOn', defaultMessage: 'Credit on {number}' },
                { number: invoice.number },
              )}
            </Button>
          ))}
        </Stack>
      )}

      {open && rma.expectsGoods && (
        <Typography variant="body2" color="text.secondary">
          {intl.formatMessage(
            {
              id: 'rmas.goodsComeBack',
              defaultMessage:
                'Goods come back through Take a return on the order, naming {rma}.',
            },
            { rma: rma.number },
          )}
        </Typography>
      )}

      <LinkReturnDialog
        key={linking ? 'linking' : 'closed'}
        open={linking}
        rmaId={rma.id}
        rmaNumber={rma.number}
        orderId={rma.orderId}
        onClose={() => setLinking(false)}
        onLinked={reload}
      />

      <ConfirmDialog
        rmaId={rma.id}
        rmaNumber={rma.number}
        action={confirming}
        onClose={() => setConfirming(null)}
        onDone={reload}
      />
    </Stack>
  );
}

/** Close or cancel, each said plainly before it happens. */
function ConfirmDialog({
  rmaId,
  rmaNumber,
  action,
  onClose,
  onDone,
}: {
  rmaId: string;
  rmaNumber: string;
  action: Confirming;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const intl = useIntl();
  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onDone();
    },
    {
      success:
        action === 'cancel'
          ? intl.formatMessage(
              { id: 'rmas.cancelled', defaultMessage: '{rma} cancelled' },
              { rma: rmaNumber },
            )
          : intl.formatMessage(
              { id: 'rmas.closed', defaultMessage: '{rma} closed' },
              { rma: rmaNumber },
            ),
    },
  );

  function close() {
    reset();
    onClose();
  }

  return (
    <Dialog
      open={action !== null}
      onClose={submitting ? undefined : close}
      fullWidth
      maxWidth="xs"
    >
      <DialogTitle>
        {action === 'cancel'
          ? intl.formatMessage(
              { id: 'rmas.cancel.title', defaultMessage: 'Cancel {rma}?' },
              { rma: rmaNumber },
            )
          : intl.formatMessage(
              { id: 'rmas.close.title', defaultMessage: 'Close {rma}?' },
              { rma: rmaNumber },
            )}
      </DialogTitle>
      <DialogContent>
        {error && <FormError message={error} />}
        <DialogContentText>
          {action === 'cancel'
            ? intl.formatMessage({
                id: 'rmas.cancel.notice',
                defaultMessage:
                  'Says it never happened: nothing came back and nothing was credited. It stays on record, marked cancelled.',
              })
            : intl.formatMessage({
                id: 'rmas.close.notice',
                defaultMessage:
                  'Says nothing more will happen under it — no more goods back, no more credit. What was received and credited stays as it is.',
              })}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button variant="text" onClick={close}>
          {intl.formatMessage({
            id: 'orders.close.keepOpen',
            defaultMessage: 'Keep it open',
          })}
        </Button>
        <Button
          color={action === 'cancel' ? 'error' : 'primary'}
          disabled={submitting}
          onClick={() =>
            void submit(() =>
              api(`/return-authorizations/${rmaId}/${action}`, {
                method: 'POST',
              }),
            )
          }
        >
          {action === 'cancel'
            ? intl.formatMessage({
                id: 'rmas.cancel.confirm',
                defaultMessage: 'Cancel it',
              })
            : intl.formatMessage({
                id: 'orders.close.confirm',
                defaultMessage: 'Close it',
              })}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
