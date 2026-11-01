import MoreVert from '@mui/icons-material/MoreVert';
import { IconButton, Menu, MenuItem } from '@mui/material';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import { useNavigate } from 'react-router-dom';

import type { ReorderPointRow } from '../api/types.gen';
import { withQuery } from '../lib/api';

type Choice = 'edit' | 'stock' | 'remove';

/**
 * A reorder point's row menu (ADR-085): Edit reorder point, Stock of the
 * item, and Remove reorder point in red. For whoever may set a point
 * (stock.reorder); a Viewer's list has none, as the design gives it.
 *
 * The dialog opens once the menu has finished closing, as StockActions
 * explains: both at once leaves focus inside a subtree marked hidden.
 */
export function ReorderPointActions({
  row,
  onEdit,
  onRemove,
}: {
  row: ReorderPointRow;
  onEdit: (row: ReorderPointRow) => void;
  onRemove: (row: ReorderPointRow) => void;
}) {
  const intl = useIntl();
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [pending, setPending] = useState<Choice | null>(null);

  function run() {
    if (pending === 'edit') onEdit(row);
    else if (pending === 'remove') onRemove(row);
    // Stock, searched for the item: Inventory's Stock tab reads it.
    else if (pending === 'stock')
      void navigate(withQuery('/inventory', { search: row.sku }));
    setPending(null);
  }

  function choose(choice: Choice) {
    setPending(choice);
    setAnchor(null);
  }

  return (
    <>
      <IconButton
        size="small"
        aria-label={intl.formatMessage(
          {
            id: 'inventory.reorder.actions',
            defaultMessage: 'Actions for {sku}’s reorder point',
          },
          { sku: row.sku },
        )}
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
        <MenuItem onClick={() => choose('edit')}>
          {intl.formatMessage({
            id: 'inventory.reorder.edit',
            defaultMessage: 'Edit reorder point',
          })}
        </MenuItem>
        <MenuItem onClick={() => choose('stock')}>
          {intl.formatMessage({
            id: 'inventory.reorder.stockOf',
            defaultMessage: 'Stock of the item',
          })}
        </MenuItem>
        <MenuItem onClick={() => choose('remove')} sx={{ color: 'error.main' }}>
          {intl.formatMessage({
            id: 'inventory.reorder.remove',
            defaultMessage: 'Remove reorder point',
          })}
        </MenuItem>
      </Menu>
    </>
  );
}
