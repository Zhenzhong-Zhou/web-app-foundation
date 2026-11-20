import { Typography } from '@mui/material';
import { useIntl } from 'react-intl';

/**
 * How many rows a list shows, under it and beside Show 50 more (#638,
 * P1a): "31 codes" once every row is shown, and "Showing 50 of 312 codes"
 * while there are more, so a person can tell the list is whole. The total
 * is every row the list's filters match, which its counts give, so it
 * follows each filter; without it, while there are more, nothing.
 * Codes on Stock and Reorder, lots on the Lot view, items on Items (the
 * glossary's words). No column of row numbers (R1a): a row's place
 * changes with each sort and filter, and its code is what stays.
 */
export function ShowingLine({
  shown,
  total,
  more,
  of,
}: {
  shown: number;
  total: number | null | undefined;
  /** Whether there are more to show. */
  more: boolean;
  of: 'code' | 'lot' | 'item';
}) {
  const intl = useIntl();

  if (more && (total === null || total === undefined)) return null;

  return (
    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
      {more
        ? intl.formatMessage(
            {
              id: 'components.showing',
              defaultMessage:
                '{of, select, lot {Showing {shown} of {total, plural, one {# lot} other {# lots}}} item {Showing {shown} of {total, plural, one {# item} other {# items}}} other {Showing {shown} of {total, plural, one {# code} other {# codes}}}}',
            },
            { of, shown, total },
          )
        : intl.formatMessage(
            {
              id: 'components.shown',
              defaultMessage:
                '{of, select, lot {{count, plural, one {# lot} other {# lots}}} item {{count, plural, one {# item} other {# items}}} other {{count, plural, one {# code} other {# codes}}}}',
            },
            { of, count: shown },
          )}
    </Typography>
  );
}
