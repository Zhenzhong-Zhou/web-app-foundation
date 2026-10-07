import SearchIcon from '@mui/icons-material/Search';
import {
  Box,
  InputAdornment,
  Stack,
  TextField,
  ToggleButton,
} from '@mui/material';
import type { ReactNode } from 'react';

/** A filter that is on or off, with how many rows it would leave. */
export interface QuickFilter {
  id: string;
  label: string;
  count?: number;
  pressed: boolean;
  onToggle: () => void;
}

/**
 * The one row of filters above a list (ADR-055): a search box, any selects
 * the list needs (as children), then quick filters with their counts —
 * "Expiring soon 2", "Needs a cost 1" — which people new to a list find
 * before they find a search box. It wraps as a row, never as a column of
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
          sx={{ flex: '1 1 260px' }}
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
        <ToggleButton
          key={filter.id}
          value={filter.id}
          size="small"
          selected={filter.pressed}
          onChange={filter.onToggle}
          sx={{ borderRadius: 999, px: 1.5, gap: 0.75 }}
        >
          {filter.label}
          {filter.count !== undefined && (
            <Box component="span" sx={{ color: 'text.secondary' }}>
              {filter.count}
            </Box>
          )}
        </ToggleButton>
      ))}
    </Stack>
  );
}
