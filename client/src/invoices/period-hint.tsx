import TodayIcon from '@mui/icons-material/Today';
import { Stack, Typography } from '@mui/material';
import { useIntl } from 'react-intl';

import type { Numbering } from '../api/types.gen';
import type { CalendarDay } from '../lib/api-names';
import { formatDay } from '../lib/format';
import { periodKey } from '../lib/numbering';
import { organizationToday } from '../lib/time-zone';
import { useResource } from '../lib/use-resource';

/**
 * Under an invoice's or credit note's date (ADR-073): a number follows the
 * document's own date, so a date in another year, month or day than
 * today's takes that period's next number. Said only then, and only for a
 * series that starts again: on a normal day nobody sees it.
 *
 * The numbering is read only once the date leaves today, since today's
 * date always takes today's number; a member who may not read the
 * numbering simply sees no hint.
 */
export function PeriodHint({
  series,
  day,
}: {
  series: 'invoice' | 'creditNote';
  day: CalendarDay;
}) {
  if (day === organizationToday() || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return null;
  }
  return <OtherPeriodHint series={series} day={day} />;
}

function OtherPeriodHint({
  series,
  day,
}: {
  series: 'invoice' | 'creditNote';
  day: CalendarDay;
}) {
  const intl = useIntl();
  const { data } = useResource<{ numbering: Numbering }>(
    '/organization/numbering',
  );
  if (!data) return null;

  const { reset } = data.numbering[series];
  const { today } = data.numbering;
  if (reset === 'never' || periodKey(reset, day) === periodKey(reset, today)) {
    return null;
  }

  const name = (of: CalendarDay) =>
    reset === 'yearly'
      ? of.slice(0, 4)
      : intl.formatDate(new Date(`${of.slice(0, 7)}-01T00:00:00Z`), {
          year: 'numeric',
          month: 'long',
          timeZone: 'UTC',
        });

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
      <TodayIcon fontSize="small" color="action" sx={{ mt: 0.25 }} />
      <Typography variant="body2" color="text.secondary">
        {reset === 'daily'
          ? intl.formatMessage(
              {
                id: 'invoices.periodHint.day',
                defaultMessage:
                  'Dated {day}, so it takes that day’s next number, not today’s.',
              },
              { day: formatDay(day) },
            )
          : intl.formatMessage(
              {
                id: 'invoices.periodHint',
                defaultMessage:
                  'Dated in {period}, so it takes {period}’s next number, not {current}’s.',
              },
              { period: name(day), current: name(today) },
            )}
      </Typography>
    </Stack>
  );
}
