import CalendarTodayOutlined from '@mui/icons-material/CalendarTodayOutlined';
import { Typography } from '@mui/material';
import { useIntl } from 'react-intl';

import { rem } from '../theme/rem';
import { greeting } from './greeting';
import { useMinute } from './use-minute';

/**
 * The organization's day and time, which the tiles count from (ADR-072;
 * ADR-091), moving on each minute by itself. It owns the minute, so only
 * this line draws again each minute, not the whole of Home with its tiles
 * (#505's 66). Not a live region, which would read it out every minute.
 */
export function HomeClock({ zone }: { zone: string }) {
  const intl = useIntl();
  const now = useMinute();

  return (
    <Typography
      variant="body2"
      sx={{
        color: 'text.secondary',
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
      }}
    >
      <CalendarTodayOutlined aria-hidden sx={{ fontSize: rem(16) }} />
      {intl.formatMessage(
        { id: 'home.dateTime', defaultMessage: '{day}, {time}' },
        {
          day: intl.formatDate(now, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            timeZone: zone,
          }),
          time: intl.formatTime(now, { timeStyle: 'short', timeZone: zone }),
        },
      )}
    </Typography>
  );
}

/**
 * The greeting's words, by the hour on the same clock, moving on with the
 * minute as the time under them does, so "Good morning" never stays over
 * "12:01 p.m." while Home is left open. Only the words draw again.
 */
export function HomeGreeting({ name, zone }: { name: string; zone: string }) {
  const intl = useIntl();
  useMinute();
  return greeting(intl, name, zone);
}
