import UnfoldMore from '@mui/icons-material/UnfoldMore';
import { TableCell, TableSortLabel } from '@mui/material';
import type { ReactNode } from 'react';

import type { SortOrder } from '../lib/use-list-sort';
import { NAME_COLUMN } from './name-column';
import { NUMBER_COLUMN } from './number-column';
import { useSortPressed } from './sort-pressed';

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
 *
 * `atRest`, a faint up-and-down arrow on a header not sorting, so every
 * header that sorts says so before it is pressed, the sorted one's arrow
 * solid for its way (ADR-093; v2's board): Stock, the Lot view and
 * Reorder first, the others as their screens are next changed. Their
 * default is marked, `active`, when no other is chosen.
 *
 * `number`, a number column's header in a `ListTable`, right-aligned and
 * as wide as its figures need (`NUMBER_COLUMN`).
 *
 * `name`, a list's name column's header in a `ListTable`, pinned while the
 * table is too wide for its box (`NAME_COLUMN`).
 *
 * Pressed in a `ListTable` whose header has stuck under the top bar, the
 * list's first row comes back under it, the header keeping its focus
 * (E11a; `SortPressed`).
 */
export function SortHeader({
  label,
  active,
  order,
  onSort,
  number = false,
  name = false,
  after,
  atRest = false,
}: {
  label: string;
  active: boolean;
  order: SortOrder;
  onSort: () => void;
  number?: boolean;
  name?: boolean;
  after?: ReactNode;
  atRest?: boolean;
}) {
  const pressed = useSortPressed();
  return (
    <TableCell
      {...(number && NUMBER_COLUMN)}
      {...(name && NAME_COLUMN)}
      sortDirection={active ? order : false}
      aria-sort={
        active ? (order === 'asc' ? 'ascending' : 'descending') : undefined
      }
      sx={after ? { whiteSpace: 'nowrap' } : undefined}
    >
      <TableSortLabel
        active={active}
        direction={active ? order : 'asc'}
        onClick={() => {
          // Measured as the page stands, before the list reads again.
          pressed();
          onSort();
        }}
        {...(atRest &&
          !active && {
            IconComponent: UnfoldMore,
            sx: { '& .MuiTableSortLabel-icon': { opacity: 0.4 } },
          })}
      >
        {label}
      </TableSortLabel>
      {after}
    </TableCell>
  );
}
