import {
  Link,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import { useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import { formatDay, NO_VALUE } from '../lib/format';
import type { Shipment } from '../lib/types';
import { withUnit } from '../products/units';

/**
 * What a shipment carried, or what a return brought back: one row per SKU and
 * lot. Shared, because the two lists show the same thing in the same way, and
 * a change to one row — a new column, a different link — belongs in both.
 *
 * Lots link by code, not id: these lists know only the code, and the search
 * page resolves an exact one straight to its trace (ADR-044).
 */
export function LotItemsTable({ items }: { items: Shipment['items'] }) {
  const intl = useIntl();

  return (
    <TableContainer>
      <Table size="small">
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
            <TableCell>
              {intl.formatMessage({
                id: 'inventory.lot',
                defaultMessage: 'Lot',
              })}
            </TableCell>
            <TableCell>
              {intl.formatMessage({
                id: 'inventory.lot.expires',
                defaultMessage: 'Expires',
              })}
            </TableCell>
            <TableCell align="right">
              {intl.formatMessage({
                id: 'inventory.quantity',
                defaultMessage: 'Quantity',
              })}
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((item) => (
            <TableRow key={`${item.sku}-${item.lotCode ?? 'none'}`}>
              <TableCell>{item.sku}</TableCell>
              <TableCell>{item.description}</TableCell>
              <TableCell>
                {item.lotCode ? (
                  <Link
                    component={RouterLink}
                    to={`/lots?${new URLSearchParams({ code: item.lotCode }).toString()}`}
                  >
                    {item.lotCode}
                  </Link>
                ) : (
                  NO_VALUE
                )}
              </TableCell>
              <TableCell>
                {item.expiresAt ? formatDay(item.expiresAt) : NO_VALUE}
              </TableCell>
              <TableCell align="right">
                {withUnit(item.quantity, item.unitOfMeasure, intl)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
