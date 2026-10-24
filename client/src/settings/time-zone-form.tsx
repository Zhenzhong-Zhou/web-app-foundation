import ScheduleIcon from '@mui/icons-material/Schedule';
import TodayIcon from '@mui/icons-material/Today';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { type SubmitEvent, useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';

import { SettingsSection } from '../components/settings-section';
import { api } from '../lib/api';
import { HIDDEN } from '../lib/hidden';
import {
  allTimeZones,
  browserTimeZone,
  isPlaceOrUtc,
  offsetLabel,
  sameZone,
  todayIn,
} from '../lib/time-zone';
import { zoneLabel } from '../lib/time-zone-label';
import { useSubmit } from '../lib/use-submit';
import { rem } from '../theme/rem';

/** How often the "It is … there" line moves on: often enough to read right. */
const TICK_MS = 30_000;

/** "Friday, October 16": the day as the form names it, in a zone. */
const LONG_DAY = { weekday: 'long', day: 'numeric', month: 'long' } as const;

/** A zone in the list: the computer's first, then every zone by offset. */
interface ZoneOption {
  zone: string;
  group: 'computer' | 'all';
  label: string;
  /** "UTC−7 · America/Vancouver", under the label. */
  detail: string;
  /** What a search matches: the label, the standard name, the offset. */
  haystack: string;
}

/**
 * The organization's time zone (ADR-072), as approved on the canvas: a
 * zone found by place, name or offset; what time it is there; what the
 * organization's today becomes before it is saved; and, for one still on
 * UTC, a way to the zone this computer is in.
 */
export function TimeZoneForm({
  value,
  readOnly,
  onSaved,
}: {
  value: string;
  readOnly: boolean;
  onSaved: () => Promise<void>;
}) {
  const intl = useIntl();
  const [zone, setZone] = useState(value);
  const [now, setNow] = useState(() => new Date());
  // Read aloud only when the choice changes, never on the clock's tick.
  const [announced, setAnnounced] = useState('');
  // Offered only when the server takes it: never Etc/GMT-3.
  const browser = browserTimeZone();
  const computer = isPlaceOrUtc(browser) ? browser : null;

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const options = useMemo<ZoneOption[]>(() => {
    const option = (each: string, group: ZoneOption['group']) => {
      const label = zoneLabel(each);
      const detail = `${offsetLabel(each)} · ${each}`;
      return {
        zone: each,
        group,
        label,
        detail,
        haystack: `${label} ${detail}`.toLowerCase(),
      };
    };
    return [
      ...(computer ? [option(computer, 'computer')] : []),
      ...allTimeZones().map((each) => option(each, 'all')),
    ];
  }, [computer]);

  // Through this browser's own names: the server stores Asia/Kolkata, which
  // Chrome lists as Asia/Calcutta.
  const selected =
    options.find((each) => each.group === 'all' && sameZone(each.zone, zone)) ??
    null;

  const { submitting, error, submit } = useSubmit(onSaved, {
    success: intl.formatMessage({
      id: 'settings.org.timeZone.saved',
      defaultMessage: 'Time zone saved',
    }),
  });

  const title = intl.formatMessage({
    id: 'settings.org.timeZone.title',
    defaultMessage: 'Time zone',
  });

  const thereNow = (each: string) =>
    intl.formatMessage(
      {
        id: 'settings.org.timeZone.now',
        defaultMessage: 'It is {time} on {date} there.',
      },
      {
        time: intl.formatTime(now, { timeZone: each }),
        date: intl.formatDate(now, { ...LONG_DAY, timeZone: each }),
      },
    );

  // The organization's today as it would become: worth saying only when
  // saving would move it to another day.
  const movesDay = todayIn(zone, now) !== todayIn(value, now);

  function choose(next: string) {
    setZone(next);
    setAnnounced(thereNow(next));
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    void submit(() =>
      api('/organization', {
        method: 'PATCH',
        body: JSON.stringify({ timeZone: zone }),
      }),
    );
  }

  return (
    <SettingsSection
      title={title}
      onSubmit={handleSubmit}
      error={error}
      submitting={submitting}
      readOnly={readOnly}
      saveDisabled={sameZone(zone, value)}
      saveLabel={intl.formatMessage({
        id: 'settings.org.timeZone.save',
        defaultMessage: 'Save time zone',
      })}
    >
      <Typography sx={{ color: 'text.secondary' }}>
        {intl.formatMessage({
          id: 'settings.org.timeZone.help',
          defaultMessage:
            'Where the business is. It decides the organization’s day: when a licence has expired, the date on packing slips, purchase orders and returns, what Home counts as overdue, and the date each export is named by.',
        })}
      </Typography>

      {value === 'UTC' &&
        computer !== null &&
        !sameZone(computer, 'UTC') &&
        !readOnly && (
          <Alert
            severity="warning"
            action={
              <Button color="inherit" onClick={() => choose(computer)}>
                {intl.formatMessage(
                  {
                    id: 'settings.org.timeZone.useComputer',
                    defaultMessage: 'Use this device’s: {zone}',
                  },
                  { zone: zoneLabel(computer) },
                )}
              </Button>
            }
          >
            {intl.formatMessage({
              id: 'settings.org.timeZone.stillUtc',
              defaultMessage:
                'Still on UTC, the time zone every organization started with. Choose where the business is: in the Americas, UTC is already tomorrow in the evening.',
            })}
          </Alert>
        )}

      <Autocomplete
        options={options}
        value={selected}
        disabled={readOnly}
        groupBy={(option) =>
          option.group === 'computer'
            ? intl.formatMessage({
                id: 'settings.org.timeZone.group.computer',
                defaultMessage: 'This device',
              })
            : intl.formatMessage({
                id: 'settings.org.timeZone.group.all',
                defaultMessage: 'All time zones',
              })
        }
        getOptionLabel={(option) => option.label}
        isOptionEqualToValue={(option, other) =>
          option.zone === other.zone && option.group === other.group
        }
        getOptionKey={(option) => `${option.group}-${option.zone}`}
        filterOptions={(all, { inputValue }) => {
          const query = inputValue.trim().toLowerCase();
          return query
            ? all.filter((option) => option.haystack.includes(query))
            : all;
        }}
        // Cleared, the zone stays as it was: an organization always has one.
        onChange={(_event, next) => {
          if (next) choose(next.zone);
        }}
        renderOption={({ key, ...props }, option) => (
          <Box component="li" key={key} {...props}>
            <Stack>
              <span>{option.label}</span>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {option.detail}
              </Typography>
            </Stack>
          </Box>
        )}
        renderInput={(params) => (
          <TextField
            {...params}
            label={title}
            helperText={intl.formatMessage(
              {
                id: 'settings.org.timeZone.offsetNow',
                defaultMessage: '{offset} now · {zone}',
              },
              { offset: offsetLabel(zone, now), zone },
            )}
          />
        )}
        sx={{ maxWidth: rem(520) }}
      />

      <Stack
        direction="row"
        spacing={1}
        sx={{
          alignItems: 'center',
          maxWidth: rem(520),
          p: 1.5,
          borderRadius: 1,
          bgcolor: 'action.hover',
        }}
      >
        <ScheduleIcon fontSize="small" aria-hidden />
        <Typography>{thereNow(zone)}</Typography>
      </Stack>

      {movesDay && (
        <Stack
          direction="row"
          spacing={1}
          sx={{
            alignItems: 'flex-start',
            maxWidth: rem(520),
            p: 1.5,
            borderRadius: 1,
            border: 1,
            borderColor: 'divider',
          }}
        >
          <TodayIcon fontSize="small" aria-hidden sx={{ mt: 0.25 }} />
          <Typography>
            {intl.formatMessage(
              {
                id: 'settings.org.timeZone.newToday',
                defaultMessage:
                  'The organization’s today becomes {date}. Licences, Home and new documents follow it from the moment you save.',
              },
              { date: intl.formatDate(now, { ...LONG_DAY, timeZone: zone }) },
            )}
          </Typography>
        </Stack>
      )}

      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {readOnly
          ? intl.formatMessage({
              id: 'settings.org.timeZone.ownerOnly',
              defaultMessage: 'An Owner can change it.',
            })
          : intl.formatMessage({
              id: 'settings.org.timeZone.screens',
              defaultMessage:
                'Times on screen still show in each person’s own time zone. Changing this never changes a document already printed.',
            })}
      </Typography>

      {/* Polite, and only on a new choice: the clock above ticks silently. */}
      <Box aria-live="polite" sx={HIDDEN}>
        {announced}
      </Box>
    </SettingsSection>
  );
}
