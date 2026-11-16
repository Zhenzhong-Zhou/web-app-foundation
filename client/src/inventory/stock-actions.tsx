import MoreVert from '@mui/icons-material/MoreVert';
import { IconButton, Menu, MenuItem } from '@mui/material';
import { useId, useState } from 'react';
import { useIntl } from 'react-intl';
import { useNavigate } from 'react-router-dom';

import type { StockPile } from '../api/types.gen';
import type { MoveMode } from './move-stock-dialog';

/**
 * One pile: a code at one place, in one lot when it tracks lots (ADR-093),
 * as a lot's row on Stock carries it, what this menu and the dialogs it
 * opens read. Its place's name is null for a reader without places.
 */
export type Pile = StockPile;

type Choice = MoveMode | 'history' | 'lot' | 'trace' | 'reorder';

/**
 * A menu rather than a row of buttons. Shipping, sampling, moving and
 * correcting are all uncommon relative to reading the table, and a control
 * for each on every line makes the numbers — the thing people actually came
 * for — harder to scan.
 *
 * For everyone who may see stock: Movements and Trace lot only read, and a
 * Viewer's first week asks them to look a lot up (ADR-079). What changes
 * stock is offered only to those who may change it.
 */
export function StockActions({
  row,
  canMove,
  canAdjust,
  onSelect,
  onHistory,
  onEditLot,
  canReorder,
  onReorder,
}: {
  row: Pile;
  /** stock.move: moving, shipping out, sampling and a lot's details. */
  canMove: boolean;
  canAdjust: boolean;
  onSelect: (mode: MoveMode, row: Pile) => void;
  onHistory: (row: Pile) => void;
  onEditLot: (row: Pile) => void;
  /** stock.reorder: setting the item's reorder point (ADR-085). */
  canReorder: boolean;
  onReorder: (row: Pile) => void;
}) {
  const intl = useIntl();
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [pending, setPending] = useState<Choice | null>(null);
  const menuId = useId();

  /**
   * The dialog opens once the menu has finished closing, not on click.
   *
   * Both at once means MUI restores focus to this button while the dialog
   * marks #root aria-hidden — a focused element inside a hidden subtree, which
   * assistive technology cannot reach and the browser warns about. Deferring
   * costs one transition and removes the overlap entirely.
   */
  function run() {
    if (!pending) return;

    if (pending === 'history') onHistory(row);
    else if (pending === 'lot') onEditLot(row);
    else if (pending === 'trace') void navigate(`/lots/${row.lotId!}`);
    else if (pending === 'reorder') onReorder(row);
    else onSelect(pending, row);

    setPending(null);
  }

  return (
    <>
      {/* Says it opens a menu, and whether it is open, as Members' does. */}
      <IconButton
        size="small"
        aria-label={
          row.locationName !== null
            ? intl.formatMessage(
                {
                  id: 'inventory.actions.label',
                  defaultMessage: 'Actions for {sku} at {location}',
                },
                { sku: row.sku, location: row.locationName },
              )
            : // A reader without places: the lot names the pile (A6).
              intl.formatMessage(
                {
                  id: 'inventory.actions.labelLot',
                  defaultMessage:
                    '{lot, select, none {Actions for {sku}} other {Actions for {sku}, lot {lot}}}',
                },
                { sku: row.sku, lot: row.lotCode ?? 'none' },
              )
        }
        aria-haspopup="menu"
        aria-expanded={!!anchor}
        aria-controls={anchor ? menuId : undefined}
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        <MoreVert fontSize="small" />
      </IconButton>

      <Menu
        id={menuId}
        anchorEl={anchor}
        open={!!anchor}
        onClose={() => setAnchor(null)}
        slotProps={{ transition: { onExited: run } }}
      >
        {canMove && (
          <MenuItem
            onClick={() => {
              setPending('transfer');
              setAnchor(null);
            }}
          >
            {intl.formatMessage({
              id: 'inventory.actions.move',
              defaultMessage: 'Move',
            })}
          </MenuItem>
        )}
        {canMove && (
          <MenuItem
            onClick={() => {
              setPending('ship');
              setAnchor(null);
            }}
          >
            {intl.formatMessage({
              id: 'inventory.move.ship.title',
              defaultMessage: 'Ship out',
            })}
          </MenuItem>
        )}
        {/* A hand-out: a trade show, a visitor, a bottle opened for a test.
            A posted sample is a sale flagged as one, raised from Orders
            (ADR-042). */}
        {canMove && (
          <MenuItem
            onClick={() => {
              setPending('sample');
              setAnchor(null);
            }}
          >
            {intl.formatMessage({
              id: 'inventory.actions.sendSample',
              defaultMessage: 'Send sample',
            })}
          </MenuItem>
        )}
        {/* stock.adjust, not stock.move. Receiving, shipping, and transferring
            record what happened in the world; an adjustment overrides the
            record itself, and is held by fewer people. The guard refuses it
            server-side either way — this is so the menu does not offer a
            control that always fails. It is still a movement, so it needs
            stock.move as well. */}
        {canMove && canAdjust && (
          <MenuItem
            onClick={() => {
              setPending('adjust');
              setAnchor(null);
            }}
          >
            {intl.formatMessage({
              id: 'inventory.move.adjust.title',
              defaultMessage: 'Correct the count',
            })}
          </MenuItem>
        )}
        {/* Only for a lot-tracked row — there is nothing to edit otherwise,
            and the label would be a dead end on most of the warehouse. */}
        {canMove && row.lotId && (
          <MenuItem
            onClick={() => {
              setPending('lot');
              setAnchor(null);
            }}
          >
            {intl.formatMessage({
              id: 'inventory.actions.editLot',
              defaultMessage: 'Edit lot details',
            })}
          </MenuItem>
        )}
        {/* Where this lot came from and everyone who has it (ADR-044). */}
        {row.lotId && (
          <MenuItem
            onClick={() => {
              setPending('trace');
              setAnchor(null);
            }}
          >
            {intl.formatMessage({
              id: 'inventory.actions.traceLot',
              defaultMessage: 'Trace lot',
            })}
          </MenuItem>
        )}
        <MenuItem
          onClick={() => {
            setPending('history');
            setAnchor(null);
          }}
        >
          {/* Movements, as a code's row says it (ADR-093); the history
              dialog until Movements' branch. */}
          {intl.formatMessage({
            id: 'layout.nav.movements',
            defaultMessage: 'Movements',
          })}
        </MenuItem>
        {/* The item's, not the row's: one point across every location
            (ADR-085). Whether it has one yet, the dialog reads. */}
        {canReorder && (
          <MenuItem
            onClick={() => {
              setPending('reorder');
              setAnchor(null);
            }}
          >
            {intl.formatMessage({
              id: 'inventory.actions.reorderPoint',
              defaultMessage: 'Reorder point…',
            })}
          </MenuItem>
        )}
      </Menu>
    </>
  );
}
