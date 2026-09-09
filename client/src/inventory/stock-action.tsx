import MoreVert from '@mui/icons-material/MoreVert';
import { IconButton, Menu, MenuItem } from '@mui/material';
import { useState } from 'react';

import type { StockRow } from './inventory-page';
import type { MoveMode } from './move-stock-dialog';

/**
 * A menu rather than three buttons per row. Shipping, moving, and correcting
 * are all uncommon relative to reading the table, and three controls on every
 * line makes the numbers — the thing people actually came for — harder to scan.
 */
export function StockActions({
  row,
  onSelect,
}: {
  row: StockRow;
  onSelect: (mode: MoveMode, row: StockRow) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  function choose(mode: MoveMode) {
    setAnchor(null);
    onSelect(mode, row);
  }

  return (
    <>
      <IconButton
        size="small"
        // Named, because an icon button with no label is announced as "button"
        // and nothing else.
        aria-label={`Actions for ${row.sku} at ${row.locationName}`}
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        <MoreVert fontSize="small" />
      </IconButton>

      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => choose('transfer')}>Move</MenuItem>
        <MenuItem onClick={() => choose('ship')}>Ship out</MenuItem>
        {/* Last and separate in meaning: the other two record something that
            happened, this one records that the system was wrong. */}
        <MenuItem onClick={() => choose('adjust')}>Correct the count</MenuItem>
      </Menu>
    </>
  );
}
