import { Button, Menu, MenuItem, Stack, TextField } from '@mui/material';
import { useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import {
  type DayRange,
  presetRange,
  RANGE_PRESETS,
  type RangePreset,
} from '../lib/date-range';

const PRESETS = defineMessages<RangePreset>({
  thisMonth: { id: 'filters.range.thisMonth', defaultMessage: 'This month' },
  lastMonth: { id: 'filters.range.lastMonth', defaultMessage: 'Last month' },
  thisQuarter: {
    id: 'filters.range.thisQuarter',
    defaultMessage: 'This quarter',
  },
  thisYear: { id: 'filters.range.thisYear', defaultMessage: 'This year' },
});

/**
 * A list's date range (ADR-057), for the filter row: From and To, each
 * optional, and a Period menu that fills both (this month, last month, this
 * quarter, this year) or clears them. `label` says which date the list is
 * narrowed by ("Invoice date", "Expected"), so the fields are named for it.
 */
export function DateRangeFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: DayRange;
  onChange: (range: DayRange) => void;
}) {
  const intl = useIntl();
  const [menu, setMenu] = useState<HTMLElement | null>(null);

  const from = intl.formatMessage(
    { id: 'filters.range.from', defaultMessage: '{date} from' },
    { date: label },
  );
  const to = intl.formatMessage(
    { id: 'filters.range.to', defaultMessage: '{date} to' },
    { date: label },
  );

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <TextField
        type="date"
        size="small"
        label={from}
        value={value.from ?? ''}
        onChange={(event) =>
          onChange({ ...value, from: event.target.value || undefined })
        }
        slotProps={{ inputLabel: { shrink: true } }}
        sx={{ width: 170 }}
      />
      <TextField
        type="date"
        size="small"
        label={to}
        value={value.to ?? ''}
        onChange={(event) =>
          onChange({ ...value, to: event.target.value || undefined })
        }
        slotProps={{ inputLabel: { shrink: true } }}
        sx={{ width: 170 }}
      />
      <Button
        variant="outlined"
        aria-haspopup="menu"
        onClick={(event) => setMenu(event.currentTarget)}
      >
        {intl.formatMessage({
          id: 'filters.range.period',
          defaultMessage: 'Period',
        })}
      </Button>
      <Menu anchorEl={menu} open={menu !== null} onClose={() => setMenu(null)}>
        {RANGE_PRESETS.map((preset) => (
          <MenuItem
            key={preset}
            onClick={() => {
              onChange(presetRange(preset));
              setMenu(null);
            }}
          >
            {intl.formatMessage(PRESETS[preset])}
          </MenuItem>
        ))}
        <MenuItem
          onClick={() => {
            onChange({});
            setMenu(null);
          }}
        >
          {intl.formatMessage({
            id: 'filters.range.any',
            defaultMessage: 'Any date',
          })}
        </MenuItem>
      </Menu>
    </Stack>
  );
}
