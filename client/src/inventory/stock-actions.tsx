import MoreVert from '@mui/icons-material/MoreVert';
import { IconButton, Menu, MenuItem } from '@mui/material';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { StockRow } from '../lib/types';
import type { MoveMode } from './move-stock-dialog';

type Choice = MoveMode | 'history' | 'lot' | 'trace';

/**
 * A menu rather than a row of buttons. Shipping, sampling, moving and
 * correcting are all uncommon relative to reading the table, and a control
 * for each on every line makes the numbers — the thing people actually came
 * for — harder to scan.
 */
export function StockActions({
  row,
  canAdjust,
  onSelect,
  onHistory,
  onEditLot,
}: {
  row: StockRow;
  canAdjust: boolean;
  onSelect: (mode: MoveMode, row: StockRow) => void;
  onHistory: (row: StockRow) => void;
  onEditLot: (row: StockRow) => void;
}) {
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [pending, setPending] = useState<Choice | null>(null);

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
    else onSelect(pending, row);

    setPending(null);
  }

  return (
    <>
      <IconButton
        size="small"
        aria-label={`Actions for ${row.sku} at ${row.locationName}`}
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        <MoreVert fontSize="small" />
      </IconButton>

      <Menu
        anchorEl={anchor}
        open={!!anchor}
        onClose={() => setAnchor(null)}
        slotProps={{ transition: { onExited: run } }}
      >
        <MenuItem
          onClick={() => {
            setPending('transfer');
            setAnchor(null);
          }}
        >
          Move
        </MenuItem>
        <MenuItem
          onClick={() => {
            setPending('ship');
            setAnchor(null);
          }}
        >
          Ship out
        </MenuItem>
        {/* A hand-out: a trade show, a visitor, a bottle opened for a test.
            A posted sample is a sale flagged as one, raised from Orders
            (ADR-042). */}
        <MenuItem
          onClick={() => {
            setPending('sample');
            setAnchor(null);
          }}
        >
          Send sample
        </MenuItem>
        {/* stock.adjust, not stock.move. Receiving, shipping, and transferring
            record what happened in the world; an adjustment overrides the
            record itself, and is held by fewer people. The guard refuses it
            server-side either way — this is so the menu does not offer a
            control that always fails. */}
        {canAdjust && (
          <MenuItem
            onClick={() => {
              setPending('adjust');
              setAnchor(null);
            }}
          >
            Correct the count
          </MenuItem>
        )}
        {/* Only for a lot-tracked row — there is nothing to edit otherwise,
            and the label would be a dead end on most of the warehouse. */}
        {row.lotId && (
          <MenuItem
            onClick={() => {
              setPending('lot');
              setAnchor(null);
            }}
          >
            Edit lot details
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
            Trace lot
          </MenuItem>
        )}
        <MenuItem
          onClick={() => {
            setPending('history');
            setAnchor(null);
          }}
        >
          History
        </MenuItem>
      </Menu>
    </>
  );
}
