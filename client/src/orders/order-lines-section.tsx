import {
  Box,
  Button,
  Chip,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { useIntl } from 'react-intl';

import { formatMoney, formatQuantity } from '../lib/format';
import { openDialog } from '../lib/open-dialog';
import type { LineHold, OrderDetail, OrderLine } from '../lib/types';
import { doneLabel } from './status';

/** The remove button's mark: a symbol, the same in every language. */
const CROSS = '×';

/**
 * An order's items: the table, what each line can do, and the totals.
 *
 * What the viewer may do arrives as flags the page has already worked out,
 * each beside its reason there; the section only lays the controls out.
 * What a control does goes back up as a callback, so the page keeps its
 * dialogs and its one busy flag, and nothing here opens a dialog of its own.
 */
export function OrderLinesSection({
  order,
  holds,
  working,
  canUpdate,
  receivable,
  amendable,
  shippable,
  returnable,
  authorizable,
  onAddLine,
  onAuthorize,
  onTakeReturn,
  onShip,
  onReceive,
  onEditLine,
  onCloseLine,
  onLineAction,
}: {
  order: OrderDetail;
  /** What is held and short per line, while confirmed (ADR-045). */
  holds: Record<string, LineHold>;
  /** A request is out: controls that would start another are disabled. */
  working: boolean;
  canUpdate: boolean;
  receivable: boolean;
  amendable: boolean;
  shippable: boolean;
  returnable: boolean;
  authorizable: boolean;
  onAddLine: () => void;
  onAuthorize: () => void;
  onTakeReturn: () => void;
  onShip: () => void;
  onReceive: (line: OrderLine) => void;
  onEditLine: (line: OrderLine) => void;
  onCloseLine: (line: OrderLine) => void;
  /** A line action with no form behind it: list price, reopen, remove. */
  onLineAction: (path: string, method: string) => Promise<void>;
}) {
  const intl = useIntl();
  const isDraft = order.status === 'draft';

  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 1 }}>
        <Typography variant="h6" component="h2" sx={{ flexGrow: 1 }}>
          {intl.formatMessage({
            id: 'orders.items',
            defaultMessage: 'Items',
          })}
        </Typography>

        {/* Draft only: adding to an order the supplier has already been sent
            is a new agreement, not a correction (ADR-033). */}
        {canUpdate && isDraft && (
          <Button
            variant="text"
            disabled={working}
            onClick={openDialog(onAddLine)}
          >
            {intl.formatMessage({
              id: 'orders.lines.add',
              defaultMessage: 'Add item',
            })}
          </Button>
        )}

        {authorizable && (
          <Button
            variant="text"
            disabled={working}
            onClick={openDialog(onAuthorize)}
          >
            {intl.formatMessage({
              id: 'orders.lines.authorizeReturn',
              defaultMessage: 'Authorize a return',
            })}
          </Button>
        )}

        {returnable && (
          <Button
            variant="text"
            disabled={working}
            onClick={openDialog(onTakeReturn)}
          >
            {intl.formatMessage({
              id: 'orders.lines.takeReturn',
              defaultMessage: 'Take a return',
            })}
          </Button>
        )}

        {shippable && (
          <Button disabled={working} onClick={openDialog(onShip)}>
            {intl.formatMessage({
              id: 'orders.lines.ship',
              defaultMessage: 'Ship',
            })}
          </Button>
        )}
      </Stack>

      <Paper variant="outlined">
        {/* The table scrolls inside its own frame; the page never does.
            Seven columns do not fit a narrow window, and letting them push
            past the Paper is what put "Close short" over the border.
            nowrap on the numbers and the actions, so a squeeze becomes a
            scroll rather than "Close" above "short". */}
        <TableContainer>
          <Table
            size="small"
            sx={{
              '& th, & td': { whiteSpace: 'nowrap' },
            }}
          >
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
                {/* Right-aligned like the money: quantities are compared
                  down a column, and digits only line up on the right. */}
                <TableCell align="right">
                  {intl.formatMessage({
                    id: 'orders.lines.ordered',
                    defaultMessage: 'Ordered',
                  })}
                </TableCell>
                <TableCell align="right">
                  {doneLabel(order.direction)}
                </TableCell>
                {/* Beside shipped, never subtracted from it: that it
                    shipped is the history a recall reads (ADR-043). */}
                {order.direction === 'sale' && (
                  <TableCell align="right">
                    {intl.formatMessage({
                      id: 'inventory.trace.returned',
                      defaultMessage: 'Returned',
                    })}
                  </TableCell>
                )}
                <TableCell align="right">
                  {intl.formatMessage({
                    id: 'orders.lines.outstanding',
                    defaultMessage: 'Outstanding',
                  })}
                </TableCell>
                <TableCell align="right">
                  {intl.formatMessage({
                    id: 'orders.unitPrice',
                    defaultMessage: 'Unit price',
                  })}
                </TableCell>
                <TableCell align="right">
                  {intl.formatMessage({
                    id: 'orders.lines.total',
                    defaultMessage: 'Total',
                  })}
                </TableCell>
                {/* No visible title — the buttons explain themselves —
                    but a screen reader announces the column by name. */}
                <TableCell
                  align="right"
                  aria-label={intl.formatMessage({
                    id: 'orders.lines.actions',
                    defaultMessage: 'Actions',
                  })}
                />
              </TableRow>
            </TableHead>

            <TableBody>
              {order.lines.map((line) => (
                <TableRow key={line.id} hover>
                  <TableCell>{line.sku}</TableCell>
                  <TableCell>{line.description}</TableCell>
                  <TableCell align="right">
                    {formatQuantity(line.quantityOrdered)}
                  </TableCell>
                  <TableCell align="right">
                    {formatQuantity(line.quantityFulfilled)}
                  </TableCell>
                  {order.direction === 'sale' && (
                    <TableCell align="right">
                      {formatQuantity(line.quantityReturned)}
                    </TableCell>
                  )}

                  <TableCell align="right">
                    {line.isClosedShort ? (
                      /* The reason in place of the number: outstanding is
                       zero, and why it is zero is the useful part. */
                      <Tooltip title={line.closedReason ?? ''}>
                        <Chip
                          label={intl.formatMessage({
                            id: 'orders.lines.closedShort',
                            defaultMessage: 'Closed short',
                          })}
                          size="small"
                        />
                      </Tooltip>
                    ) : (
                      <>
                        {formatQuantity(line.quantityOutstanding)}
                        {/* The backorder: needed, and not held because
                            earlier-confirmed orders came first (ADR-045).
                            '0.0000' is nothing, compared as text. */}
                        {order.status === 'confirmed' &&
                          holds[line.id] &&
                          holds[line.id].short !== '0.0000' && (
                            <Tooltip
                              title={intl.formatMessage(
                                {
                                  id: 'orders.lines.heldTooltip',
                                  defaultMessage:
                                    '{held} held for this order; the rest waits for stock',
                                },
                                { held: formatQuantity(holds[line.id].held) },
                              )}
                            >
                              <Chip
                                label={intl.formatMessage(
                                  {
                                    id: 'orders.lines.short',
                                    defaultMessage: '{short} short',
                                  },
                                  {
                                    short: formatQuantity(holds[line.id].short),
                                  },
                                )}
                                size="small"
                                color="warning"
                                variant="outlined"
                                sx={{ ml: 1 }}
                              />
                            </Tooltip>
                          )}
                      </>
                    )}
                  </TableCell>

                  <TableCell align="right">
                    {formatMoney(line.unitPrice, line.currency)}
                    {/* Where a list price came from, so a default is
                        seen as one that can be changed (ADR-049). */}
                    {line.priceSource === 'list' && line.priceListName && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        component="div"
                      >
                        {intl.formatMessage(
                          {
                            id: 'orders.lines.fromList',
                            defaultMessage: 'from {list}',
                          },
                          { list: line.priceListName },
                        )}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {formatMoney(line.lineTotal, line.currency)}
                  </TableCell>

                  <TableCell align="right">
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ justifyContent: 'flex-end' }}
                    >
                      {receivable && !line.isComplete && (
                        <Button
                          variant="text"
                          size="small"
                          onClick={openDialog(() => onReceive(line))}
                        >
                          {intl.formatMessage({
                            id: 'inventory.receive.action',
                            defaultMessage: 'Receive',
                          })}
                        </Button>
                      )}

                      {amendable && !line.isClosedShort && !line.isComplete && (
                        <Button
                          variant="text"
                          size="small"
                          disabled={working}
                          onClick={openDialog(() => onEditLine(line))}
                        >
                          {intl.formatMessage({
                            id: 'common.edit',
                            defaultMessage: 'Edit',
                          })}
                        </Button>
                      )}

                      {/* Prices the line from the order's list again —
                        the explicit act for a list corrected after the
                        line was added, never done in the background
                        (ADR-049). The server says why when it cannot. */}
                      {amendable &&
                        !order.isSample &&
                        !line.isClosedShort &&
                        !line.isComplete && (
                          <Button
                            variant="text"
                            size="small"
                            disabled={working}
                            onClick={() =>
                              void onLineAction(
                                `/orders/${order.id}/lines/${line.id}/list-price`,
                                'POST',
                              )
                            }
                          >
                            {intl.formatMessage({
                              id: 'orders.lines.useListPrice',
                              defaultMessage: 'Use list price',
                            })}
                          </Button>
                        )}

                      {/* Confirmed only, and only while something is still
                        outstanding — a draft has promised nothing, so
                        removing the line is the right act there. */}
                      {canUpdate &&
                        order.status === 'confirmed' &&
                        !line.isComplete && (
                          <Button
                            variant="text"
                            size="small"
                            disabled={working}
                            onClick={openDialog(() => onCloseLine(line))}
                          >
                            {intl.formatMessage({
                              id: 'orders.lines.closeShort',
                              defaultMessage: 'Close short',
                            })}
                          </Button>
                        )}

                      {canUpdate && line.isClosedShort && (
                        <Button
                          variant="text"
                          size="small"
                          disabled={working}
                          onClick={() =>
                            void onLineAction(
                              `/orders/${order.id}/lines/${line.id}/reopen`,
                              'POST',
                            )
                          }
                        >
                          {intl.formatMessage({
                            id: 'orders.lines.reopen',
                            defaultMessage: 'Reopen',
                          })}
                        </Button>
                      )}

                      {/* Draft only, and never the last one — an order with no
                        lines orders nothing (ADR-033). The server refuses
                        both and those 409s render, but a control that always
                        fails is worth not offering. */}
                      {canUpdate && isDraft && order.lines.length > 1 && (
                        <IconButton
                          size="small"
                          aria-label={intl.formatMessage(
                            {
                              id: 'orders.lines.remove',
                              defaultMessage: 'Remove {sku}',
                            },
                            { sku: line.sku },
                          )}
                          disabled={working}
                          onClick={() =>
                            void onLineAction(
                              `/orders/${order.id}/lines/${line.id}`,
                              'DELETE',
                            )
                          }
                        >
                          {CROSS}
                        </IconButton>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Padded to the cells' own inset, so the grand total lines up
            under the Total column rather than touching the frame. */}
        <Stack sx={{ alignItems: 'flex-end', px: 2, py: 1.5 }} spacing={0.5}>
          {order.totals.map((total) => (
            <Typography key={total.currency} variant="body2">
              {formatMoney(total.amount, total.currency)}
            </Typography>
          ))}

          {/* Said rather than shown as a smaller number: a subtotal that
            silently excludes a line is what somebody reconciles against
            (ADR-035). */}
          {!order.totalsComplete && (
            <Typography variant="caption" color="text.secondary">
              {order.totals.length
                ? intl.formatMessage({
                    id: 'orders.lines.partialTotal',
                    defaultMessage:
                      'Some lines have no price — this is not the full total',
                  })
                : intl.formatMessage({
                    id: 'orders.lines.noPrices',
                    defaultMessage: 'No prices recorded on this order',
                  })}
            </Typography>
          )}
        </Stack>
      </Paper>

      {/* Returns sit beside shipped rather than reducing what is
          outstanding (ADR-043), which reads as a mismatch until said. */}
      {order.lines.some((line) => Number(line.quantityReturned) > 0) && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
          {intl.formatMessage({
            id: 'orders.lines.returnsNote',
            defaultMessage:
              "Returns don't reopen an item. To send replacements, raise a new sale.",
          })}
        </Typography>
      )}

      {order.status === 'draft' && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
          {order.direction === 'sale'
            ? intl.formatMessage({
                id: 'orders.lines.draftSale',
                defaultMessage:
                  'Nothing can be shipped against a draft. Confirming is what says this order is real.',
              })
            : intl.formatMessage({
                id: 'orders.lines.draftPurchase',
                defaultMessage:
                  'Nothing can be received against a draft. Confirming is what says this order is real.',
              })}
        </Typography>
      )}
    </Box>
  );
}
