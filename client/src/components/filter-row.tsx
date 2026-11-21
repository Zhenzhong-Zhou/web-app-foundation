import SearchIcon from '@mui/icons-material/Search';
import {
  Box,
  InputAdornment,
  Stack,
  type SxProps,
  TextField,
  type Theme,
  ToggleButton,
} from '@mui/material';
import type { ReactNode } from 'react';
import { useIntl } from 'react-intl';

import { rem } from '../theme/rem';

/** A filter that is on or off, with how many rows it would leave. */
export interface QuickFilter {
  id: string;
  label: string;
  count?: number;
  /**
   * What the count counts, said beside it (108a): codes on Stock by item
   * and Reorder, lots on the Lot view, items on Items, the glossary's
   * words, as the list's own line under it says them. Without it, the
   * number alone.
   */
  of?: 'code' | 'lot' | 'item';
  pressed: boolean;
  onToggle: () => void;
}

/**
 * The one row of filters above a list (ADR-055): a search box, any selects
 * the list needs (as children), then quick filters with their counts —
 * "Expiring soon · 2 lots", "Waiting for a cost · 1 code" — which people new
 * to a list find before they find a search box. It wraps as a row, never as a column of
 * full-width fields stacked down the page.
 */
export function FilterRow({
  search,
  quick = [],
  children,
}: {
  search?: { label: string; value: string; onChange: (value: string) => void };
  quick?: QuickFilter[];
  children?: ReactNode;
}) {
  return (
    <Stack
      direction="row"
      useFlexGap
      sx={{ flexWrap: 'wrap', gap: 1, alignItems: 'center' }}
    >
      {search && (
        <TextField
          size="small"
          type="search"
          label={search.label}
          value={search.value}
          onChange={(event) => search.onChange(event.target.value)}
          sx={{ flex: `1 1 ${rem(260)}` }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
      )}

      {children}

      {quick.map((filter) => (
        <QuickFilterPill key={filter.id} filter={filter} />
      ))}
    </Stack>
  );
}

/**
 * One quick filter, a pill with its count: the row's, and wherever else
 * the same filter is pressed, as Items' sheet on a phone (ADR-092). With
 * what it counts, the count in words after a dot, "Low stock · 8 codes"
 * (108a, #609), so Stock's codes, the Lot view's lots and Items' items
 * never read as one number disagreeing with another.
 */
export function QuickFilterPill({
  filter,
  sx,
}: {
  filter: QuickFilter;
  sx?: SxProps<Theme>;
}) {
  const intl = useIntl();
  // Muted at rest; pressed, the main text, since MUI's pressed tint
  // under the pointer takes muted text under 4.5 : 1 (#561).
  const muted = { color: filter.pressed ? 'text.primary' : 'text.secondary' };
  return (
    <ToggleButton
      value={filter.id}
      size="small"
      selected={filter.pressed}
      onChange={filter.onToggle}
      sx={[
        { borderRadius: 999, px: 1.5, gap: 0.75 },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {filter.count !== undefined && filter.of ? (
        intl.formatMessage(
          {
            id: 'filters.quick.counted',
            defaultMessage:
              '{label} <muted>· {of, select, lot {{count, plural, one {# lot} other {# lots}}} item {{count, plural, one {# item} other {# items}}} other {{count, plural, one {# code} other {# codes}}}}</muted>',
          },
          {
            label: filter.label,
            of: filter.of,
            count: filter.count,
            muted: (chunks: ReactNode[]) => (
              <Box component="span" sx={muted}>
                {chunks}
              </Box>
            ),
          },
        )
      ) : (
        <>
          {filter.label}
          {filter.count !== undefined && (
            <Box component="span" sx={muted}>
              {filter.count}
            </Box>
          )}
        </>
      )}
    </ToggleButton>
  );
}
