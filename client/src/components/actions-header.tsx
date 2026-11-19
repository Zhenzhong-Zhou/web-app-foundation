import { Box, TableCell, type TableCellProps } from '@mui/material';
import { useIntl } from 'react-intl';

import { HIDDEN } from '../lib/hidden';
import { ACTIONS_COLUMN } from './actions-column';

/**
 * The header of a list's row actions in a `ListTable`, its last column:
 * marked `ACTIONS_COLUMN`, so a table too wide for its box pins the
 * actions at its end beside the name (ADR-090, amended November 2026;
 * E12a). Named "Actions" for a screen reader and not drawn, unless the
 * list gives words to show, as Partners' Edit. Every list's actions header
 * is this one, which `actions-header.test.ts` holds.
 */
export function ActionsHeader({
  children,
  ...cell
}: Omit<TableCellProps, 'sx'>) {
  const intl = useIntl();
  return (
    <TableCell {...ACTIONS_COLUMN} {...cell} sx={{ position: 'relative' }}>
      {children ?? (
        <Box component="span" sx={HIDDEN}>
          {intl.formatMessage({
            id: 'common.actions',
            defaultMessage: 'Actions',
          })}
        </Box>
      )}
    </TableCell>
  );
}
