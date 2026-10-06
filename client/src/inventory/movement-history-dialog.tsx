import {
  Box,
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
import { useIntl } from 'react-intl';

import { FormError } from '../components/form-error';
import { LoadMoreButton } from '../components/load-more-button';
import { formatMoment, formatQuantity, relativeTime } from '../lib/format';
import type { Movement, StockRow } from '../lib/types';
import { useKeysetList } from '../lib/use-keyset-list';
import { describeMovement } from './describe-movement';
import {
  MOVEMENT_HEADINGS,
  reasonDetailLabel,
  reasonLabel,
} from './movement-reasons';

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
  const intl = useIntl();
  // Mounted only while a row is open (see InventoryPage), so each open
  // starts fresh and closing needs nothing reset.
  const { entries, error, hasMore, loadingMore, loadMore } =
    useKeysetList<Movement>(row ? `/stock/movements?${queryFor(row)}` : null);

  return (
    <Dialog open={!!row} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>
        {row?.lotCode
          ? intl.formatMessage(
              {
                id: 'inventory.history.titleWithLot',
                defaultMessage: 'History for {sku} · lot {lot}',
              },
              { sku: row.sku, lot: row.lotCode },
            )
          : intl.formatMessage(
              {
                id: 'inventory.history.title',
                defaultMessage: 'History for {sku}',
              },
              { sku: row?.sku },
            )}
      </DialogTitle>

      <DialogContent>
        <Stack spacing={2}>
          {error && <FormError message={error} />}

          {/* Scoped to the lot when the row has one, otherwise to the variant.
              Either way it spans locations: stock that moved away is the part
              of the story a per-shelf view loses. */}
          <Typography variant="body2" color="text.secondary">
            {row?.lotCode
              ? intl.formatMessage(
                  {
                    id: 'inventory.history.introLot',
                    defaultMessage:
                      'Every movement of lot {lot}, newest first. Nothing here can be edited or removed — a correction is another movement that says so.',
                  },
                  { lot: row.lotCode },
                )
              : intl.formatMessage(
                  {
                    id: 'inventory.history.introVariant',
                    defaultMessage:
                      'Every movement of {sku}, newest first. Nothing here can be edited or removed — a correction is another movement that says so.',
                  },
                  { sku: row?.sku },
                )}
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
                    <TableCell>
                      {intl.formatMessage(MOVEMENT_HEADINGS.when)}
                    </TableCell>
                    <TableCell align="right">
                      {intl.formatMessage(MOVEMENT_HEADINGS.change)}
                    </TableCell>
                    <TableCell>
                      {intl.formatMessage(MOVEMENT_HEADINGS.where)}
                    </TableCell>
                    <TableCell>
                      {intl.formatMessage(MOVEMENT_HEADINGS.why)}
                    </TableCell>
                    <TableCell>
                      {intl.formatMessage(MOVEMENT_HEADINGS.by)}
                    </TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {entries.map((movement) => {
                    const { sign, where } = describeMovement(movement);

                    return (
                      <TableRow key={movement.id}>
                        <TableCell>
                          <span title={formatMoment(movement.createdAt)}>
                            {relativeTime(movement.createdAt)}
                          </span>
                        </TableCell>

                        {/* Rendered as it arrived. Formatting means parsing, and
                          a numeric through a JS double is the precision loss
                          ADR-025 exists to avoid. */}
                        <TableCell align="right">
                          {sign}
                          {formatQuantity(movement.quantity)}
                        </TableCell>

                        <TableCell>{where}</TableCell>

                        <TableCell>
                          <Chip
                            label={reasonLabel(movement.reason, intl)}
                            size="small"
                          />
                          {/* A margin, not a space: a space would be text, and text
                              here would be English (ADR-054). */}
                          {movement.reasonDetail && (
                            <Box component="span" sx={{ ml: 0.5 }}>
                              {reasonDetailLabel(movement.reasonDetail, intl)}
                            </Box>
                          )}
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
                          {movement.actorEmail ??
                            intl.formatMessage(MOVEMENT_HEADINGS.deletedUser)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Typography color="text.secondary" sx={{ py: 3 }}>
              {intl.formatMessage({
                id: 'account.activity.empty',
                defaultMessage: 'Nothing recorded yet.',
              })}
            </Typography>
          )}

          <LoadMoreButton
            hasMore={hasMore}
            loading={loadingMore}
            onLoadMore={loadMore}
          />
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button variant="text" onClick={onClose}>
          {intl.formatMessage({ id: 'common.close', defaultMessage: 'Close' })}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
