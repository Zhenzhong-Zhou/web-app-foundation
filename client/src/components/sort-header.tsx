import { TableCell, type TableCellProps, TableSortLabel } from '@mui/material';
import { useEffect, useRef } from 'react';

import type { SortOrder } from '../lib/use-list-sort';

/**
 * A column header that sorts its list (ADR-057). Only columns the server
 * can page in order offer it; the rest stay plain headers, so none pretends.
 * `aria-sort` tells a screen reader which way the list runs.
 *
 * `refocus` is the header last pressed (useListSort's `header`): a sort
 * reads the list again, and its table, this header with it, is drawn anew
 * once the rows land, so the focus the old header took with it comes back
 * here (ADR-091). Only when nothing else has it by then.
 */
export function SortHeader({
  label,
  active,
  order,
  onSort,
  refocus = false,
  align,
}: {
  label: string;
  active: boolean;
  order: SortOrder;
  onSort: () => void;
  refocus?: boolean;
  align?: TableCellProps['align'];
}) {
  const button = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (refocus && document.activeElement === document.body) {
      button.current?.focus();
    }
  }, [refocus]);

  return (
    <TableCell
      align={align}
      sortDirection={active ? order : false}
      aria-sort={
        active ? (order === 'asc' ? 'ascending' : 'descending') : undefined
      }
    >
      <TableSortLabel
        ref={button}
        active={active}
        direction={active ? order : 'asc'}
        onClick={onSort}
      >
        {label}
      </TableSortLabel>
    </TableCell>
  );
}
