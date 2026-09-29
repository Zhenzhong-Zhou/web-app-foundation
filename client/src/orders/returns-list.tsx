import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Link,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { type SubmitEvent, useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { useCan } from '../auth/permissions';
import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { api, ApiError } from '../lib/api';
import { formatDate } from '../lib/format';
import { openDialog } from '../lib/open-dialog';
import type {
  OrderReturn,
  ReturnAuthorizationPage,
  ReturnAuthorizationSummary,
} from '../lib/types';
import { useSubmit } from '../lib/use-submit';
import { LotItemsTable } from './lot-items-table';

/**
 * What came back against this order, newest first, lot by lot (ADR-043).
 *
 * Hidden entirely until there is one: most orders never have a return, and
 * an empty section on every sale would be noise. Refetched when `refreshKey`
 * changes after a return is taken.
 *
 * Each return names the RMA it counted against, if any (ADR-047). One that
 * counts against none offers Link to RMA while an RMA on this order is
 * open — the same act as on the RMA's own page, from the side where the
 * unannounced box is seen.
 */
export function ReturnsList({
  orderId,
  refreshKey,
}: {
  orderId: string;
  refreshKey: number;
}) {
  const can = useCan();
  const canSeeRmas = can('return_authorizations.view');
  const canLink = can('return_authorizations.update');

  const [returns, setReturns] = useState<OrderReturn[] | null>(null);
  const [rmas, setRmas] = useState<ReturnAuthorizationSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState<OrderReturn | null>(null);

  /** Bumped after a link, so the list reads the new state. */
  const [linked, setLinked] = useState(0);

  useEffect(() => {
    let ignore = false;

    /**
     * The order's RMAs beside its returns, every status: a closed one still
     * names the returns counted against it. One round trip, so a return
     * never shows "Link to RMA" before its RMA's number arrives.
     */
    void Promise.all([
      api<OrderReturn[]>(`/orders/${orderId}/returns`),
      canSeeRmas
        ? api<ReturnAuthorizationPage>(
            `/return-authorizations?orderId=${orderId}&limit=100`,
          )
        : Promise.resolve(null),
    ])
      .then(([rows, page]) => {
        if (!ignore) {
          setReturns(rows);
          setRmas(page?.entries ?? []);
          setError(null);
        }
      })
      .catch((caught: unknown) => {
        if (!ignore) {
          setError(
            caught instanceof ApiError
              ? caught.message
              : 'Could not load returns.',
          );
        }
      });

    return () => {
      ignore = true;
    };
  }, [orderId, refreshKey, linked, canSeeRmas]);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!returns?.length) return null;

  const openRmas = rmas.filter((rma) => rma.status === 'open');

  return (
    <Stack spacing={1}>
      <Typography variant="h6" component="h2">
        Returns
      </Typography>

      {returns.map((entry) => {
        const rma = rmas.find((row) => row.id === entry.returnAuthorizationId);

        return (
          <Paper key={entry.id} variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" spacing={2} sx={{ alignItems: 'baseline' }}>
              <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
                {formatDate(entry.createdAt)}
                {entry.reason ? ` · ${entry.reason}` : ''}
              </Typography>

              {rma && (
                <Link
                  component={RouterLink}
                  to={`/return-authorizations/${rma.id}`}
                  variant="body2"
                >
                  Against {rma.number}
                </Link>
              )}

              {!entry.returnAuthorizationId &&
                canLink &&
                openRmas.length > 0 && (
                  <Button
                    variant="text"
                    size="small"
                    onClick={openDialog(() => setLinking(entry))}
                  >
                    Link to RMA
                  </Button>
                )}
            </Stack>

            {entry.note && (
              <Typography variant="body2" color="text.secondary">
                {entry.note}
              </Typography>
            )}

            <LotItemsTable items={entry.items} />
          </Paper>
        );
      })}

      <LinkToRmaDialog
        key={linking?.id ?? 'none'}
        entry={linking}
        rmas={openRmas}
        onClose={() => setLinking(null)}
        onLinked={() => setLinked((count) => count + 1)}
      />
    </Stack>
  );
}

/**
 * Counts one return against an open RMA on the order. The server holds it
 * to what that RMA has left to receive, and says so if it does not fit.
 */
function LinkToRmaDialog({
  entry,
  rmas,
  onClose,
  onLinked,
}: {
  entry: OrderReturn | null;
  rmas: ReturnAuthorizationSummary[];
  onClose: () => void;
  onLinked: () => void;
}) {
  const [rmaId, setRmaId] = useState(rmas.length === 1 ? rmas[0].id : '');
  const chosen = rmas.find((rma) => rma.id === rmaId);

  const { submitting, error, reset, submit } = useSubmit(
    () => {
      close();
      onLinked();
    },
    { success: chosen ? `Return counted against ${chosen.number}` : undefined },
  );

  function close() {
    reset();
    onClose();
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (!entry) return;

    void submit(() =>
      api(`/return-authorizations/${rmaId}/returns`, {
        method: 'POST',
        body: JSON.stringify({ returnId: entry.id }),
      }),
    );
  }

  return (
    <Dialog
      open={entry !== null}
      onClose={submitting ? undefined : close}
      fullWidth
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle>Link this return to an RMA</DialogTitle>

        <DialogContent>
          <Stack spacing={2}>
            {error && <FormError message={error} />}

            <DialogContentText>
              {entry
                ? `Received ${formatDate(entry.createdAt)}: ${entry.items
                    .map((item) => `${item.sku} ${item.quantity}`)
                    .join(', ')}. `
                : ''}
              A return is counted against one RMA, once.
            </DialogContentText>

            <TextField
              id="link-to-rma"
              select
              label="RMA"
              required
              fullWidth
              value={rmaId}
              onChange={(event) => setRmaId(event.target.value)}
            >
              {rmas.map((rma) => (
                <MenuItem key={rma.id} value={rma.id}>
                  {rma.number} — {rma.reason}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </DialogContent>

        <DialogFooter
          submitting={submitting}
          onCancel={close}
          label="Link"
          pendingLabel="Linking…"
          disabled={!rmaId}
        />
      </form>
    </Dialog>
  );
}
