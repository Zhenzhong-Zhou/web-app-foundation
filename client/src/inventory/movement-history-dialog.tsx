import {
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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

import { FormError } from '../components/form-error';
import { relativeTime } from '../lib/format';
import type { Movement, StockRow } from '../lib/types';
import { useKeysetList } from '../lib/use-keyset-list';
import { describeMovement } from './describe-movement';

const PAGE_SIZE = 25;

/**
 * Scoped to the lot when the row has one, because the dialog's own title
 * claims it is: "History for WIDGET-1 · lot L2024-A" over every movement of
 * the variant is the answer to a different question, and the wrong one to act
 * on during a recall.
 */
function queryFor(row: StockRow): string {
  const params = new URLSearchParams({
    variantId: row.variantId,
    limit: String(PAGE_SIZE),
  });

  if (row.lotId) params.set('lotId', row.lotId);

  return params.toString();
}

/**
 * The ledger, finally readable.
 *
 * "Why does the system say 47 when the shelf holds 45" is the question the
 * append-only design was built to answer (ADR-023), and until this existed the
 * answer lived in psql. The audit log records that a movement happened and by
 * whom; it carries no payload, so it cannot say what moved or how much.
 *
 * Scoped to one variant, because that is the question people actually ask. A
 * whole-organisation feed is the same endpoint without the filter, and can be
 * a screen of its own when something asks for it.
 */
export function MovementHistoryDialog({
  row,
  onClose,
}: {
  row: StockRow | null;
  onClose: () => void;
}) {
  // Mounted only while a row is open (see InventoryPage), so each open
  // starts fresh and closing needs nothing reset.
  const { entries, error, hasMore, loadingMore, loadMore } =
    useKeysetList<Movement>(row ? `/stock/movements?${queryFor(row)}` : null);

  return (
    <Dialog open={!!row} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>
        History for {row?.sku}
        {row?.lotCode ? ` · lot ${row.lotCode}` : ''}
      </DialogTitle>

      <DialogContent>
        <Stack spacing={2}>
          {error && <FormError message={error} />}

          {/* Scoped to the lot when the row has one, otherwise to the variant.
              Either way it spans locations: stock that moved away is the part
              of the story a per-shelf view loses. */}
          <Typography variant="body2" color="text.secondary">
            {row?.lotCode
              ? `Every movement of lot ${row.lotCode}, newest first.`
              : `Every movement of ${row?.sku}, newest first.`}{' '}
            Nothing here can be edited or removed — a correction is another
            movement that says so.
          </Typography>

          {entries === null && !error ? (
            <Stack spacing={1}>
              <Skeleton height={40} />
              <Skeleton height={40} />
              <Skeleton height={40} />
            </Stack>
          ) : entries?.length ? (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>When</TableCell>
                    <TableCell align="right">Change</TableCell>
                    <TableCell>Where</TableCell>
                    <TableCell>Why</TableCell>
                    <TableCell>By</TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {entries.map((movement) => {
                    const { sign, where } = describeMovement(movement);

                    return (
                      <TableRow key={movement.id}>
                        <TableCell>
                          <span
                            title={new Date(
                              movement.createdAt,
                            ).toLocaleString()}
                          >
                            {relativeTime(movement.createdAt)}
                          </span>
                        </TableCell>

                        {/* Rendered as it arrived. Formatting means parsing, and
                          a numeric through a JS double is the precision loss
                          ADR-025 exists to avoid. */}
                        <TableCell align="right">
                          {sign}
                          {movement.quantity}
                        </TableCell>

                        <TableCell>{where}</TableCell>

                        <TableCell>
                          <Chip label={movement.reason} size="small" />
                          {movement.reasonDetail && ` ${movement.reasonDetail}`}
                          {/* Required on an adjustment, because a person
                            asserting the system is wrong has to say what they
                            found (ADR-023). This is where it gets read. */}
                          {movement.note && (
                            <Typography
                              variant="caption"
                              component="div"
                              color="text.secondary"
                            >
                              {movement.note}
                            </Typography>
                          )}
                        </TableCell>

                        {/* Null when the actor was anonymised (ADR-012). The row
                          survives its author, which is what RESTRICT on
                          actor_id is for. */}
                        <TableCell>
                          {movement.actorEmail ?? 'Deleted user'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Typography color="text.secondary" sx={{ py: 3 }}>
              Nothing recorded yet.
            </Typography>
          )}

          {/* Load more, not page numbers: a keyset cursor has no notion of
              "page 4", and offset paging repeats rows as new movements arrive
              at the head. */}
          {hasMore && (
            <Button
              variant="text"
              onClick={() => void loadMore()}
              disabled={loadingMore}
              sx={{ alignSelf: 'flex-start' }}
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </Button>
          )}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button variant="text" onClick={onClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
