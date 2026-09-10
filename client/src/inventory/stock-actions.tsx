import MoreVert from '@mui/icons-material/MoreVert';
import { IconButton, Menu, MenuItem } from '@mui/material';
import { useState } from 'react';

import type { StockRow } from '../lib/types';
import type { MoveMode } from './move-stock-dialog';

type Choice = MoveMode | 'history';

/**
 * A menu rather than three buttons per row. Shipping, moving, and correcting
 * are all uncommon relative to reading the table, and three controls on every
 * line makes the numbers — the thing people actually came for — harder to scan.
 */
export function StockActions({
  row,
  onSelect,
  onHistory,
}: {
  row: StockRow;
  onSelect: (mode: MoveMode, row: StockRow) => void;
  onHistory: (row: StockRow) => void;
}) {
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
        <MenuItem
          onClick={() => {
            setPending('adjust');
            setAnchor(null);
          }}
        >
          Correct the count
        </MenuItem>
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
