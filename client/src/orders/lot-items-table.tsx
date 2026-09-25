import {
  Link,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

import { formatDay } from '../lib/format';
import type { Shipment } from '../lib/types';

/**
 * What a shipment carried, or what a return brought back: one row per SKU and
 * lot. Shared, because the two lists show the same thing in the same way, and
 * a change to one row — a new column, a different link — belongs in both.
 *
 * Lots link by code, not id: these lists know only the code, and the search
 * page resolves an exact one straight to its trace (ADR-044).
 */
export function LotItemsTable({ items }: { items: Shipment['items'] }) {
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>SKU</TableCell>
            <TableCell>Item</TableCell>
            <TableCell>Lot</TableCell>
            <TableCell>Expires</TableCell>
            <TableCell align="right">Quantity</TableCell>
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
                  '—'
                )}
              </TableCell>
              <TableCell>
                {item.expiresAt ? formatDay(item.expiresAt) : '—'}
              </TableCell>
              <TableCell align="right">
                {item.quantity} {item.unitOfMeasure}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
