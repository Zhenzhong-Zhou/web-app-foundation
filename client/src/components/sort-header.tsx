import { TableCell, type TableCellProps, TableSortLabel } from '@mui/material';
import type { ReactNode } from 'react';

import type { SortOrder } from '../lib/use-list-sort';

/**
 * A column header that sorts its list (ADR-057). Only columns the server
 * can page in order offer it; the rest stay plain headers, so none pretends.
 * `aria-sort` tells a screen reader which way the list runs.
 *
 * Its table's head stays on the page while the list reads again, so a
 * header pressed keeps its focus (#505's 54): the list draws its
 * placeholder in the body alone (PlaceholderRows).
 *
 * `after` sits beside the label on the same line, as Items' date column
 * keeps its menu of which date to show.
 */
export function SortHeader({
  label,
  active,
  order,
  onSort,
  align,
  after,
}: {
  label: string;
  active: boolean;
  order: SortOrder;
  onSort: () => void;
  align?: TableCellProps['align'];
  after?: ReactNode;
}) {
  return (
    <TableCell
      align={align}
      sortDirection={active ? order : false}
      aria-sort={
        active ? (order === 'asc' ? 'ascending' : 'descending') : undefined
      }
      sx={after ? { whiteSpace: 'nowrap' } : undefined}
    >
      <TableSortLabel
        active={active}
        direction={active ? order : 'asc'}
        onClick={onSort}
      >
        {label}
      </TableSortLabel>
      {after}
    </TableCell>
  );
}
