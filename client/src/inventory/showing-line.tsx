import { Typography } from '@mui/material';
import { useIntl } from 'react-intl';

/**
 * "Showing 50 of 128 codes" beside Show 50 more, as Items' list says it
 * (Bob's third message, 5): the rows read so far of every row the list's
 * filters match, which its counts statement gives, so it follows each
 * filter. Lots on the Lot view, codes elsewhere (the glossary's words).
 */
export function ShowingLine({
  shown,
  total,
  of,
}: {
  shown: number;
  total: number;
  of: 'code' | 'lot';
}) {
  const intl = useIntl();
  return (
    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
      {intl.formatMessage(
        {
          id: 'inventory.showing',
          defaultMessage:
            '{of, select, lot {Showing {shown} of {total, plural, one {# lot} other {# lots}}} other {Showing {shown} of {total, plural, one {# code} other {# codes}}}}',
        },
        { of, shown, total },
      )}
    </Typography>
  );
}
