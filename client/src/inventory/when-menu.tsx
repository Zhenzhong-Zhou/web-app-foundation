import {
  Box,
  Button,
  MenuItem,
  Popover,
  Stack,
  TextField,
} from '@mui/material';
import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { defineMessages, useIntl } from 'react-intl';

import {
  type DayRange,
  WHEN_PERIODS,
  type WhenPeriod,
  whenRange,
} from '../lib/date-range';
import { formatDaysShort, SEPARATOR } from '../lib/format';
import { organizationToday } from '../lib/time-zone';
import { rem } from '../theme/rem';
import { rangeWords } from './when-words';

const PERIODS = defineMessages<WhenPeriod>({
  today: { id: 'filters.when.today', defaultMessage: 'Today' },
  thisWeek: { id: 'filters.when.thisWeek', defaultMessage: 'This week' },
  thisMonth: { id: 'filters.range.thisMonth', defaultMessage: 'This month' },
  last30Days: {
    id: 'filters.when.last30Days',
    defaultMessage: 'Last 30 days',
  },
  lastMonth: { id: 'filters.range.lastMonth', defaultMessage: 'Last month' },
  thisYear: { id: 'filters.range.thisYear', defaultMessage: 'This year' },
});

/** The menu's two choices beside its periods: the panel, and none. */
const CHOOSE = 'choose';
const ANY = '';

/** A label's first letter capitalised, where the words start lower case. */
const FIRST_LETTER_UP = {
  '&::first-letter': { textTransform: 'uppercase' },
} as const;

/**
 * Movements' When, one menu (ADR-093, review 1): Today, This week, This
 * month, Last 30 days, Last month and This year, each with its days
 * beside its name; Choose dates…, which opens From and To, typed or
 * picked, with Clear and Apply; and Any time at its foot, which clears
 * it. Both days included, in the organization's days (ADR-072). The
 * field shows the days chosen; Escape closes the menu, or the panel, and
 * focus returns to When.
 *
 * `inline` opens the two fields under the field, full width, as a phone's
 * Filters sheet holds them, rather than in a panel beside it.
 */
export function WhenMenu({
  id,
  label,
  value,
  onChange,
  inline = false,
}: {
  id: string;
  label: string;
  value: DayRange;
  onChange: (range: DayRange) => void;
  inline?: boolean;
}) {
  const intl = useIntl();
  const field = useRef<HTMLDivElement>(null);
  const [choosing, setChoosing] = useState(false);
  const [draft, setDraft] = useState<DayRange>({});

  const today = organizationToday();
  const set = !!value.from || !!value.to;
  const period = WHEN_PERIODS.find((each) => {
    const days = whenRange(each, today);
    return days.from === value.from && days.to === value.to;
  });
  const selected = period ?? (set ? CHOOSE : ANY);

  const focusWhen = () =>
    field.current?.querySelector<HTMLElement>('[role="combobox"]')?.focus();
  const open = () => {
    setDraft(value);
    setChoosing(true);
  };
  // Gone before focus moves, so the panel's own trap lets it go.
  const close = () => {
    flushSync(() => setChoosing(false));
    focusWhen();
  };
  const apply = () => {
    onChange({ from: draft.from || undefined, to: draft.to || undefined });
    close();
  };

  const dates = (
    <Stack
      direction={inline ? 'column' : 'row'}
      useFlexGap
      spacing={1}
      sx={inline ? undefined : { p: 2 }}
    >
      {(['from', 'to'] as const).map((end) => (
        <TextField
          key={end}
          type="date"
          size="small"
          fullWidth={inline}
          label={intl.formatMessage(
            end === 'from'
              ? { id: 'filters.range.from', defaultMessage: '{date} from' }
              : { id: 'filters.range.to', defaultMessage: '{date} to' },
            { date: label },
          )}
          value={draft[end] ?? ''}
          onChange={(event) =>
            setDraft({ ...draft, [end]: event.target.value || undefined })
          }
          slotProps={{ inputLabel: { shrink: true } }}
          sx={inline ? undefined : { width: rem(170) }}
        />
      ))}
      <Stack
        direction="row"
        useFlexGap
        spacing={1}
        sx={{ justifyContent: 'flex-end', alignItems: 'center' }}
      >
        <Button variant="text" onClick={() => setDraft({})}>
          {intl.formatMessage({
            id: 'filters.when.clear',
            defaultMessage: 'Clear',
          })}
        </Button>
        <Button variant="contained" onClick={apply}>
          {intl.formatMessage({
            id: 'filters.when.apply',
            defaultMessage: 'Apply',
          })}
        </Button>
      </Stack>
    </Stack>
  );

  return (
    <Stack spacing={1} sx={{ minWidth: rem(220) }}>
      <TextField
        ref={field}
        select
        size="small"
        id={id}
        label={label}
        value={selected}
        onChange={(event) => {
          const next = event.target.value;
          if (next === CHOOSE) return;
          onChange(next === ANY ? {} : whenRange(next as WhenPeriod, today));
        }}
        slotProps={{
          select: {
            displayEmpty: true,
            renderValue: () =>
              set
                ? rangeWords(value, intl)
                : intl.formatMessage({
                    id: 'filters.when.any',
                    defaultMessage: 'Any time',
                  }),
            sx: { '& .MuiSelect-select': FIRST_LETTER_UP },
          },
          inputLabel: { shrink: true },
        }}
      >
        {WHEN_PERIODS.map((each) => {
          const days = whenRange(each, today);
          return (
            <MenuItem key={each} value={each}>
              {intl.formatMessage(PERIODS[each])}
              <Box component="span" sx={{ color: 'text.secondary' }}>
                {SEPARATOR}
                {formatDaysShort(days.from, days.to)}
              </Box>
            </MenuItem>
          );
        })}
        {/* Its own click, as choosing it again changes no value. */}
        <MenuItem value={CHOOSE} divider onClick={open}>
          {intl.formatMessage({
            id: 'filters.when.choose',
            defaultMessage: 'Choose dates…',
          })}
        </MenuItem>
        <MenuItem value={ANY}>
          {intl.formatMessage({
            id: 'filters.when.any',
            defaultMessage: 'Any time',
          })}
        </MenuItem>
      </TextField>
      {inline
        ? choosing && dates
        : choosing && (
            <Popover
              open
              anchorEl={() => field.current as HTMLElement}
              onClose={close}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
              disableRestoreFocus
            >
              {dates}
            </Popover>
          )}
    </Stack>
  );
}
