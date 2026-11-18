import { useIntl } from 'react-intl';
import { useNavigate } from 'react-router-dom';

import type { ReorderPointRow } from '../api/types.gen';
import { ActionsMenu } from '../components/actions-menu';
import { itemName } from '../lib/format';
import { whereItStands } from '../lib/item-path';
import { OFFER_BACK } from '../lib/offer-back';

/**
 * A reorder point's row Actions (ADR-085): Edit reorder point, Stock of the
 * item, opening its Where it stands (ADR-093), and Remove reorder point in
 * red. For whoever may set a point (stock.reorder); a Viewer's list has
 * none, as the design gives it.
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

  return (
    <ActionsMenu
      name={intl.formatMessage(
        { id: 'inventory.actions.item', defaultMessage: 'Actions for {item}' },
        { item: itemName(row.productName, row.variantName) },
      )}
      groups={[
        [
          {
            label: intl.formatMessage({
              id: 'inventory.reorder.edit',
              defaultMessage: 'Edit reorder point',
            }),
            onSelect: () => onEdit(row),
          },
          {
            label: intl.formatMessage({
              id: 'inventory.reorder.stockOf',
              defaultMessage: 'Stock of the item',
            }),
            // The item's Where it stands, where its stock is told (ADR-093,
            // R8).
            onSelect: () =>
              void navigate(whereItStands(row.productId), {
                state: OFFER_BACK,
              }),
          },
          {
            label: intl.formatMessage({
              id: 'inventory.reorder.remove',
              defaultMessage: 'Remove reorder point',
            }),
            onSelect: () => onRemove(row),
            danger: true,
          },
        ],
      ]}
    />
  );
}
