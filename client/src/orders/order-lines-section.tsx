import MoreVert from '@mui/icons-material/MoreVert';
import {
  Box,
  Button,
  Chip,
  IconButton,
  Menu,
  MenuItem,
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
import { useState } from 'react';
import { useIntl } from 'react-intl';

import { StatusChip } from '../components/status-chip';
import { displayQuantity, formatMoney } from '../lib/format';
import { openDialog } from '../lib/open-dialog';
import type { LineHold, OrderDetail, OrderLine } from '../lib/types';
import { doneLabel } from './status';

/**
 * The actions column, held at the table's right edge (ADR-055). With the
 * summary beside it the table is often wider than its panel, longer
 * column names in English and French most of all, and a menu found only
 * by scrolling sideways is a menu nobody finds. The head keeps its own
 * tint; a body cell is given the panel's colour so rows pass beneath it.
 */
const PINNED = { position: 'sticky', right: 0, zIndex: 1 } as const;

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
  returnable,
  authorizable,
  onAddLine,
  onAuthorize,
  onTakeReturn,
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
  returnable: boolean;
  authorizable: boolean;
  onAddLine: () => void;
  onAuthorize: () => void;
  onTakeReturn: () => void;
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
                {/* What a credit note gave back for those returns (ADR-055):
                    beside Returned, the gap is what nobody has settled. */}
                {order.direction === 'sale' && !order.isSample && (
                  <TableCell align="right">
                    {intl.formatMessage({
                      id: 'orders.lines.credited',
                      defaultMessage: 'Credited',
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
                    but a screen reader announces the column by name.
                    Pinned to the right edge, as its cells are, so the ⋮
                    stays in view when the table scrolls sideways. */}
                <TableCell
                  align="right"
                  sx={PINNED}
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
                    {displayQuantity(line.quantityOrdered)}
                  </TableCell>
                  <TableCell align="right">
                    {displayQuantity(line.quantityFulfilled)}
                  </TableCell>
                  {order.direction === 'sale' && (
                    <TableCell align="right">
                      {displayQuantity(line.quantityReturned)}
                    </TableCell>
                  )}
                  {order.direction === 'sale' && !order.isSample && (
                    <TableCell align="right">
                      {/* Amber while some of this line's returns wait for
                          a decision, so the gap is seen where it is. */}
                      {line.quantityUnsettled === '0.0000' ? (
                        displayQuantity(line.quantityCredited)
                      ) : (
                        <StatusChip
                          tone="warning"
                          label={displayQuantity(line.quantityCredited)}
                        />
                      )}
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
                        {displayQuantity(line.quantityOutstanding)}
                        {/* The backorder: needed, and not held because
                            earlier-confirmed orders came first (ADR-045).
                            '0.0000' is nothing, compared as text. Under the
                            figure rather than beside it, so the column is
                            as wide as its number, not number and chip. */}
                        {order.status === 'confirmed' &&
                          holds[line.id] &&
                          holds[line.id].short !== '0.0000' && (
                            <Box sx={{ mt: 0.5 }}>
                              <Tooltip
                                title={intl.formatMessage(
                                  {
                                    id: 'orders.lines.heldTooltip',
                                    defaultMessage:
                                      '{held} held for this order; the rest waits for stock',
                                  },
                                  {
                                    held: displayQuantity(holds[line.id].held),
                                  },
                                )}
                              >
                                <Box component="span">
                                  <StatusChip
                                    tone="warning"
                                    label={intl.formatMessage(
                                      {
                                        id: 'orders.lines.short',
                                        defaultMessage: '{short} short',
                                      },
                                      {
                                        short: displayQuantity(
                                          holds[line.id].short,
                                        ),
                                      },
                                    )}
                                  />
                                </Box>
                              </Tooltip>
                            </Box>
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

                  <TableCell
                    align="right"
                    sx={{ ...PINNED, bgcolor: 'background.paper' }}
                  >
                    <LineActions
                      order={order}
                      line={line}
                      working={working}
                      canUpdate={canUpdate}
                      receivable={receivable}
                      amendable={amendable}
                      onReceive={onReceive}
                      onEditLine={onEditLine}
                      onCloseLine={onCloseLine}
                      onLineAction={onLineAction}
                    />
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

/** One thing a line's menu can do, and how. */
interface LineAction {
  key: string;
  label: string;
  run: () => void;
}

/**
 * A line's actions (ADR-055): the one a person comes to the line for —
 * Receive, on a purchase still expecting goods — as a button, and the
 * corrections (edit, use list price, close short, reopen, remove) in a ⋮
 * menu. Five buttons on every row pushed the totals out of view beside
 * the summary, and made the figures, which people came to read, the
 * hardest thing to find.
 *
 * Each action shows on the same conditions as before; the server's
 * refusals are the real rules (ADR-033, ADR-034, ADR-049).
 */
function LineActions({
  order,
  line,
  working,
  canUpdate,
  receivable,
  amendable,
  onReceive,
  onEditLine,
  onCloseLine,
  onLineAction,
}: {
  order: OrderDetail;
  line: OrderLine;
  working: boolean;
  canUpdate: boolean;
  receivable: boolean;
  amendable: boolean;
  onReceive: (line: OrderLine) => void;
  onEditLine: (line: OrderLine) => void;
  onCloseLine: (line: OrderLine) => void;
  onLineAction: (path: string, method: string) => Promise<void>;
}) {
  const intl = useIntl();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [pending, setPending] = useState<LineAction | null>(null);

  const open = !line.isClosedShort && !line.isComplete;
  const path = `/orders/${order.id}/lines/${line.id}`;
  const actions: LineAction[] = [];

  if (amendable && open) {
    actions.push({
      key: 'edit',
      label: intl.formatMessage({ id: 'common.edit', defaultMessage: 'Edit' }),
      run: () => onEditLine(line),
    });
  }

  // Prices the line from the order's list again: the explicit act for a
  // list corrected after the line was added, never done in the background
  // (ADR-049). The server says why when it cannot.
  if (amendable && open && !order.isSample) {
    actions.push({
      key: 'list-price',
      label: intl.formatMessage({
        id: 'orders.lines.useListPrice',
        defaultMessage: 'Use list price',
      }),
      run: () => void onLineAction(`${path}/list-price`, 'POST'),
    });
  }

  // Confirmed only, and only while something is still outstanding: a draft
  // has promised nothing, so removing the line is the right act there.
  if (canUpdate && order.status === 'confirmed' && !line.isComplete) {
    actions.push({
      key: 'close-short',
      label: intl.formatMessage({
        id: 'orders.lines.closeShort',
        defaultMessage: 'Close short',
      }),
      run: () => onCloseLine(line),
    });
  }

  if (canUpdate && line.isClosedShort) {
    actions.push({
      key: 'reopen',
      label: intl.formatMessage({
        id: 'orders.lines.reopen',
        defaultMessage: 'Reopen',
      }),
      run: () => void onLineAction(`${path}/reopen`, 'POST'),
    });
  }

  // Draft only, and never the last one: an order with no lines orders
  // nothing (ADR-033).
  if (canUpdate && order.status === 'draft' && order.lines.length > 1) {
    actions.push({
      key: 'remove',
      label: intl.formatMessage(
        { id: 'orders.lines.remove', defaultMessage: 'Remove {sku}' },
        { sku: line.sku },
      ),
      run: () => void onLineAction(path, 'DELETE'),
    });
  }

  /**
   * The chosen action runs once the menu has finished closing, as the
   * stock actions do: a dialog opened at once would mark the page hidden
   * while focus was still returning to the ⋮ button.
   */
  function choose(action: LineAction) {
    setPending(action);
    setAnchor(null);
  }

  return (
    <Stack
      direction="row"
      spacing={0.5}
      sx={{ justifyContent: 'flex-end', alignItems: 'center' }}
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

      {actions.length > 0 && (
        <>
          <IconButton
            size="small"
            disabled={working}
            aria-label={intl.formatMessage(
              {
                id: 'orders.lines.actionsFor',
                defaultMessage: 'Actions for {sku}',
              },
              { sku: line.sku },
            )}
            onClick={(event) => setAnchor(event.currentTarget)}
          >
            <MoreVert fontSize="small" />
          </IconButton>

          <Menu
            anchorEl={anchor}
            open={!!anchor}
            onClose={() => setAnchor(null)}
            slotProps={{
              transition: {
                onExited: () => {
                  pending?.run();
                  setPending(null);
                },
              },
            }}
          >
            {actions.map((action) => (
              <MenuItem key={action.key} onClick={() => choose(action)}>
                {action.label}
              </MenuItem>
            ))}
          </Menu>
        </>
      )}
    </Stack>
  );
}
