import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link,
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
import { Link as RouterLink } from 'react-router-dom';

import type { Movement, MovementDocument, StockPile } from '../api/types.gen';
import { FormError } from '../components/form-error';
import { LoadMoreButton } from '../components/load-more-button';
import { Reference } from '../components/reference';
import { NameAndEmail } from '../components/who-and-when';
import {
  displayQuantity,
  formatMoment,
  itemName,
  relativeTime,
  SEPARATOR,
} from '../lib/format';
import { OFFER_BACK } from '../lib/offer-back';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useKeysetList } from '../lib/use-keyset-list';
import { describeMovement, movementActor } from './describe-movement';
import {
  MOVEMENT_HEADINGS,
  reasonDetailLabel,
  reasonLabel,
} from './movement-reasons';

const PAGE_SIZE = 25;

/**
 * What the dialog shows the movements of: a code, or one of its lots; a
 * Stock row per code passes the code alone (ADR-093, until Movements'
 * branch).
 */
export type HistoryOf = Pick<
  StockPile,
  'variantId' | 'sku' | 'productName' | 'variantName' | 'lotId' | 'lotCode'
> & {
  /** A place's Movements: the code's at that place alone (ADR-093). */
  at?: { locationId: string; locationName: string } | null;
};

/**
 * Scoped to the lot when the row has one, because the dialog's own title
 * claims it is: "History for WIDGET-1 · lot L2024-A" over every movement of
 * the variant is the answer to a different question, and the wrong one to act
 * on during a recall.
 */
function queryFor(row: HistoryOf): string {
  const params = new URLSearchParams({
    variantId: row.variantId,
    limit: String(PAGE_SIZE),
  });

  if (row.lotId) params.set('lotId', row.lotId);
  if (row.at) params.set('locationId', row.at.locationId);

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
  row: HistoryOf | null;
  onClose: () => void;
}) {
  const intl = useIntl();
  // Mounted only while a row is open (see InventoryPage), so each open
  // starts fresh and closing needs nothing reset.
  const { entries, error, failed, hasMore, loadingMore, loadMore, reload } =
    useKeysetList<Movement>(row ? `/stock/movements?${queryFor(row)}` : null);
  // Only for a read that takes a while (conventions, Loading states).
  const showSkeleton = useDelayedFlag(entries === null && !failed);

  return (
    <Dialog open={!!row} onClose={onClose} fullWidth maxWidth="md">
      {/* The item's name beside its SKU, in the reader's language (#256):
          every row below is the same item, so the title names it once. */}
      <DialogTitle>
        {row?.at
          ? intl.formatMessage(
              {
                id: 'inventory.history.titleItemAt',
                defaultMessage: 'History for {sku} {name} at {place}',
              },
              {
                sku: <Reference>{row.sku}</Reference>,
                name: itemName(row.productName, row.variantName),
                place: row.at.locationName,
              },
            )
          : row?.lotCode
            ? intl.formatMessage(
                {
                  id: 'inventory.history.titleItemWithLot',
                  defaultMessage: 'History for {sku} {name} · lot {lot}',
                },
                {
                  sku: <Reference>{row.sku}</Reference>,
                  name: itemName(row.productName, row.variantName),
                  lot: <Reference>{row.lotCode}</Reference>,
                },
              )
            : intl.formatMessage(
                {
                  id: 'inventory.history.titleItem',
                  defaultMessage: 'History for {sku} {name}',
                },
                {
                  sku: <Reference>{row?.sku}</Reference>,
                  name: row && itemName(row.productName, row.variantName),
                },
              )}
      </DialogTitle>

      <DialogContent>
        <Stack spacing={2}>
          {/* A first read that failed shows only why, never the empty
              line under it (#195). */}
          {error && (
            <FormError message={error}>
              {failed && (
                <Button variant="text" color="inherit" onClick={reload}>
                  {intl.formatMessage({
                    id: 'common.tryAgain',
                    defaultMessage: 'Try again',
                  })}
                </Button>
              )}
            </FormError>
          )}

          {/* Scoped to the lot when the row has one, otherwise to the variant.
              Either way it spans locations: stock that moved away is the part
              of the story a per-shelf view loses. */}
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {row?.lotCode
              ? intl.formatMessage(
                  {
                    id: 'inventory.history.introLot',
                    defaultMessage:
                      'Every movement of lot {lot}, newest first. Nothing here can be edited or removed — a correction is another movement that says so.',
                  },
                  { lot: <Reference>{row.lotCode}</Reference> },
                )
              : intl.formatMessage(
                  {
                    id: 'inventory.history.introVariant',
                    defaultMessage:
                      'Every movement of {sku}, newest first. Nothing here can be edited or removed — a correction is another movement that says so.',
                  },
                  { sku: <Reference>{row?.sku}</Reference> },
                )}
          </Typography>

          {failed ? null : entries === null ? (
            showSkeleton && (
              <Stack spacing={1}>
                <Skeleton height={40} />
                <Skeleton height={40} />
                <Skeleton height={40} />
              </Stack>
            )
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

                        {/* Read without padding zeros, grouped the language's
                          way (displayQuantity, #256), but never parsed: a
                          numeric through a JS double is the loss ADR-025
                          exists to avoid. */}
                        <TableCell align="right">
                          {sign}
                          {displayQuantity(movement.quantity)}
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
                          {movement.document && (
                            <DocumentOf document={movement.document} />
                          )}
                          {/* Required on an adjustment, because a person
                            asserting the system is wrong has to say what they
                            found (ADR-023). This is where it gets read. */}
                          {movement.note && (
                            <Typography
                              variant="caption"
                              component="div"
                              sx={{ color: 'text.secondary' }}
                            >
                              {movement.note}
                            </Typography>
                          )}
                        </TableCell>

                        {/* Who by name, their email beneath (#256); Deleted
                          user once anonymised (ADR-012). The row survives its
                          author, which is what RESTRICT on actor_id is for. */}
                        <TableCell>
                          <NameAndEmail
                            {...movementActor(
                              movement,
                              intl.formatMessage(MOVEMENT_HEADINGS.deletedUser),
                            )}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Typography sx={{ color: 'text.secondary', py: 3 }}>
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

/**
 * The document a movement was for, after its reason: "Receipt ·
 * PO-000009", "Shipment · SO-000011", a link to its order, or to its run
 * by its reference (55a). Only what the reader may see comes.
 */
function DocumentOf({ document }: { document: MovementDocument }) {
  const intl = useIntl();
  const to =
    document.kind === 'order'
      ? `/orders/${document.id}`
      : `/production/${document.id}`;

  return (
    <Box component="span" sx={{ whiteSpace: 'nowrap' }}>
      {SEPARATOR}
      <Link component={RouterLink} to={to} state={OFFER_BACK}>
        {document.number ? (
          <Reference>{document.number}</Reference>
        ) : (
          intl.formatMessage({
            id: 'products.stock.run',
            defaultMessage: 'A run',
          })
        )}
      </Link>
    </Box>
  );
}
