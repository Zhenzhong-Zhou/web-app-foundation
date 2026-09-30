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

import { formatMoney } from '../lib/format';
import { openDialog } from '../lib/open-dialog';
import type { LineHold, OrderDetail, OrderLine } from '../lib/types';
import { DONE } from './status';

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
  const isDraft = order.status === 'draft';

  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 1 }}>
        <Typography variant="h6" component="h2" sx={{ flexGrow: 1 }}>
          Items
        </Typography>

        {/* Draft only: adding to an order the supplier has already been sent
            is a new agreement, not a correction (ADR-033). */}
        {canUpdate && isDraft && (
          <Button
            variant="text"
            disabled={working}
            onClick={openDialog(onAddLine)}
          >
            Add item
          </Button>
        )}

        {authorizable && (
          <Button
            variant="text"
            disabled={working}
            onClick={openDialog(onAuthorize)}
          >
            Authorize a return
          </Button>
        )}

        {returnable && (
          <Button
            variant="text"
            disabled={working}
            onClick={openDialog(onTakeReturn)}
          >
            Take a return
          </Button>
        )}

        {shippable && (
          <Button disabled={working} onClick={openDialog(onShip)}>
            Ship
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
                <TableCell>SKU</TableCell>
                <TableCell>Item</TableCell>
                {/* Right-aligned like the money: quantities are compared
                  down a column, and digits only line up on the right. */}
                <TableCell align="right">Ordered</TableCell>
                <TableCell align="right">{DONE[order.direction]}</TableCell>
                {/* Beside shipped, never subtracted from it: that it
                    shipped is the history a recall reads (ADR-043). */}
                {order.direction === 'sale' && (
                  <TableCell align="right">Returned</TableCell>
                )}
                <TableCell align="right">Outstanding</TableCell>
                <TableCell align="right">Unit price</TableCell>
                <TableCell align="right">Total</TableCell>
                {/* No visible title — the buttons explain themselves —
                    but a screen reader announces the column by name. */}
                <TableCell align="right" aria-label="Actions" />
              </TableRow>
            </TableHead>

            <TableBody>
              {order.lines.map((line) => (
                <TableRow key={line.id} hover>
                  <TableCell>{line.sku}</TableCell>
                  <TableCell>{line.description}</TableCell>
                  <TableCell align="right">{line.quantityOrdered}</TableCell>
                  <TableCell align="right">{line.quantityFulfilled}</TableCell>
                  {order.direction === 'sale' && (
                    <TableCell align="right">{line.quantityReturned}</TableCell>
                  )}

                  <TableCell align="right">
                    {line.isClosedShort ? (
                      /* The reason in place of the number: outstanding is
                       zero, and why it is zero is the useful part. */
                      <Tooltip title={line.closedReason ?? ''}>
                        <Chip label="Closed short" size="small" />
                      </Tooltip>
                    ) : (
                      <>
                        {line.quantityOutstanding}
                        {/* The backorder: needed, and not held because
                            earlier-confirmed orders came first (ADR-045).
                            '0.0000' is nothing, compared as text. */}
                        {order.status === 'confirmed' &&
                          holds[line.id] &&
                          holds[line.id].short !== '0.0000' && (
                            <Tooltip
                              title={`${holds[line.id].held} held for this order; the rest waits for stock`}
                            >
                              <Chip
                                label={`${holds[line.id].short} short`}
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
                        from {line.priceListName}
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
                          Receive
                        </Button>
                      )}

                      {amendable && !line.isClosedShort && !line.isComplete && (
                        <Button
                          variant="text"
                          size="small"
                          disabled={working}
                          onClick={openDialog(() => onEditLine(line))}
                        >
                          Edit
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
                            Use list price
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
                            Close short
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
                          Reopen
                        </Button>
                      )}

                      {/* Draft only, and never the last one — an order with no
                        lines orders nothing (ADR-033). The server refuses
                        both and those 409s render, but a control that always
                        fails is worth not offering. */}
                      {canUpdate && isDraft && order.lines.length > 1 && (
                        <IconButton
                          size="small"
                          aria-label={`Remove ${line.sku}`}
                          disabled={working}
                          onClick={() =>
                            void onLineAction(
                              `/orders/${order.id}/lines/${line.id}`,
                              'DELETE',
                            )
                          }
                        >
                          ×
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
                ? 'Some lines have no price — this is not the full total'
                : 'No prices recorded on this order'}
            </Typography>
          )}
        </Stack>
      </Paper>

      {/* Returns sit beside shipped rather than reducing what is
          outstanding (ADR-043), which reads as a mismatch until said. */}
      {order.lines.some((line) => Number(line.quantityReturned) > 0) && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
          Returns don't reopen an item. To send replacements, raise a new sale.
        </Typography>
      )}

      {order.status === 'draft' && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
          Nothing can be {DONE[order.direction].toLowerCase()} against a draft.
          Confirming is what says this order is real.
        </Typography>
      )}
    </Box>
  );
}
