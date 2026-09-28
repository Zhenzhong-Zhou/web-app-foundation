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
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';

import { HistoryButton } from '../audit/history-button';
import { useCan } from '../auth/permissions';
import { FormError } from '../components/form-error';
import { PageHeader } from '../components/page-header';
import { api, ApiError } from '../lib/api';
import { formatDate } from '../lib/format';
import { openDialog } from '../lib/open-dialog';
import type { ReturnAuthorizationDetail } from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useSubmit } from '../lib/use-submit';
import { LinkReturnDialog } from './link-return-dialog';
import { RESOLUTION_LABELS, rmaStatus } from './rma-labels';

function messageFor(caught: unknown): string {
  return caught instanceof ApiError
    ? caught.message
    : 'Could not reach the server.';
}

/** A numeric(18,4) of nothing always reads '0.0000' (ADR-025). */
const NOTHING = '0.0000';

type Confirming = 'close' | 'cancel' | null;

/**
 * One return authorization (ADR-047): per line, what was authorized, what
 * has come back against it, and what has been credited — the three figures
 * anyone deciding the next step needs side by side.
 *
 * What happens next depends on each line's resolution: credit is issued
 * from the invoice, replace raises a sale at zero, none needs nothing more.
 * Goods themselves come back through the order's Take a return, naming this
 * RMA, or are linked here if they arrived first.
 */
export function RmaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const can = useCan();
  const navigate = useNavigate();

  const [rma, setRma] = useState<ReturnAuthorizationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [linking, setLinking] = useState(false);

  const showSkeleton = useDelayedFlag(rma === null && error === null);
  const canUpdate = can('return_authorizations.update');

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setRma(
        (
          await api<{ returnAuthorization: ReturnAuthorizationDetail }>(
            `/return-authorizations/${id}`,
          )
        ).returnAuthorization,
      );
      setError(null);
    } catch (caught) {
      setError(messageFor(caught));
    }
  }, [id]);

  useEffect(() => {
    let ignore = false;

    void api<{ returnAuthorization: ReturnAuthorizationDetail }>(
      `/return-authorizations/${id}`,
    )
      .then((response) => {
        if (!ignore) setRma(response.returnAuthorization);
      })
      .catch((caught: unknown) => {
        if (!ignore) setError(messageFor(caught));
      });

    return () => {
      ignore = true;
    };
  }, [id]);

  // The replacement opens as soon as it exists; useSubmit's callback takes
  // no result, so its id is kept here.
  const replacementId = useRef<string | null>(null);
  const replacement = useSubmit(
    () => navigate(`/orders/${replacementId.current}`),
    { success: 'Replacement order raised' },
  );

  if (!rma) {
    if (error) return <Alert severity="error">{error}</Alert>;
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
        crumbs={[{ label: 'Returns', to: '/return-authorizations' }]}
        title={rma.number}
        subtitle={
          <>
            {rma.partnerName} ·{' '}
            <Link component={RouterLink} to={`/orders/${rma.orderId}`}>
              {rma.orderReference ? `Order ${rma.orderReference}` : 'Order'}
            </Link>
            {rma.invoiceId && (
              <>
                {' · '}
                <Link component={RouterLink} to={`/invoices/${rma.invoiceId}`}>
                  {rma.invoiceNumber}
                </Link>
              </>
            )}
            {` · raised ${formatDate(rma.createdAt)}`}
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
                Cancel RMA
              </Button>
            )}

            {open && canUpdate && (
              <Button
                variant="outlined"
                onClick={openDialog(() => setConfirming('close'))}
              >
                Close RMA
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
          The customer was told to keep or destroy the goods, so nothing will be
          received. Credit follows what is authorized.
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
                <TableCell>Item</TableCell>
                <TableCell>Then</TableCell>
                <TableCell align="right">Authorized</TableCell>
                <TableCell align="right">Received</TableCell>
                <TableCell align="right">Credited</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rma.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>{line.sku}</TableCell>
                  <TableCell>{RESOLUTION_LABELS[line.resolution]}</TableCell>
                  <TableCell align="right">{line.quantity}</TableCell>
                  <TableCell align="right">
                    {rma.expectsGoods ? line.quantityReceived : '—'}
                  </TableCell>
                  <TableCell align="right">
                    {line.resolution === 'credit' ? line.quantityCredited : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {open && canUpdate && (
        <Stack direction="row" spacing={2}>
          {rma.expectsGoods && (
            <Button
              variant="outlined"
              onClick={openDialog(() => setLinking(true))}
            >
              Link a return
            </Button>
          )}

          {hasReplace && (
            <Button
              variant="outlined"
              disabled={replacement.submitting}
              onClick={raiseReplacement}
            >
              {replacement.submitting ? 'Raising…' : 'Raise replacement'}
            </Button>
          )}
        </Stack>
      )}

      {open && rma.expectsGoods && (
        <Typography variant="body2" color="text.secondary">
          Goods come back through Take a return on the order, naming{' '}
          {rma.number}.
        </Typography>
      )}

      <LinkReturnDialog
        key={linking ? 'linking' : 'closed'}
        open={linking}
        rmaId={rma.id}
        rmaNumber={rma.number}
        orderId={rma.orderId}
        onClose={() => setLinking(false)}
        onLinked={load}
      />

      <ConfirmDialog
        rmaId={rma.id}
        rmaNumber={rma.number}
        action={confirming}
        onClose={() => setConfirming(null)}
        onDone={load}
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
  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onDone();
    },
    {
      success:
        action === 'cancel' ? `${rmaNumber} cancelled` : `${rmaNumber} closed`,
    },
  );

  function close() {
    reset();
    onClose();
  }

  return (
    <Dialog open={action !== null} onClose={close} fullWidth maxWidth="xs">
      <DialogTitle>
        {action === 'cancel' ? `Cancel ${rmaNumber}?` : `Close ${rmaNumber}?`}
      </DialogTitle>
      <DialogContent>
        {error && <FormError message={error} />}
        <DialogContentText>
          {action === 'cancel'
            ? 'Says it never happened: nothing came back and nothing was credited. It stays on record, marked cancelled.'
            : 'Says nothing more will happen under it — no more goods back, no more credit. What was received and credited stays as it is.'}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button variant="text" onClick={close}>
          Keep it open
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
          {action === 'cancel' ? 'Cancel it' : 'Close it'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
