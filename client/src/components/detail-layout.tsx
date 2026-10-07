import { Box, Chip, Paper, Stack, Tab, Tabs } from '@mui/material';
import type { ReactNode } from 'react';

export interface DetailTab<T extends string> {
  id: T;
  label: string;
  /** How many records the tab holds, beside its label: Shipments 2. */
  count?: number;
  content: ReactNode;
}

/**
 * A record's page body (ADR-055): its sections in tabs, and a summary
 * beside them that stays in view as the page scrolls — the actions the
 * record allows, then its figures. Below `md` the summary moves above the
 * tabs, so the main action is the first thing under a thumb.
 *
 * For a record with three or more sections of different kinds; one with
 * fewer stays a single page. Pair it with useTab, which keeps the open tab
 * in the address. Only the open tab's content is rendered.
 */
export function DetailLayout<T extends string>({
  label,
  summaryLabel,
  tabs,
  current,
  onChange,
  summary,
}: {
  /** Names the tab list: "Order sections". */
  label: string;
  /** Names the summary's landmark: "Summary". */
  summaryLabel: string;
  tabs: DetailTab<T>[];
  current: T;
  onChange: (tab: T) => void;
  summary: ReactNode;
}) {
  const open = tabs.find((tab) => tab.id === current) ?? tabs[0];

  return (
    <Box
      sx={{
        display: 'grid',
        gap: 2.5,
        alignItems: 'start',
        gridTemplateColumns: {
          xs: 'minmax(0, 1fr)',
          md: 'minmax(0, 1fr) 300px',
        },
      }}
    >
      <Paper variant="outlined" sx={{ minWidth: 0 }}>
        {/* One section needs no tab bar: a single tab is a heading that
            looks clickable. */}
        {tabs.length > 1 && (
          <Tabs
            value={open.id}
            onChange={(_, tab: T) => onChange(tab)}
            aria-label={label}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            sx={{ borderBottom: 1, borderColor: 'divider', px: 1 }}
          >
            {tabs.map((tab) => (
              <Tab
                key={tab.id}
                value={tab.id}
                id={`tab-${tab.id}`}
                aria-controls={`tabpanel-${tab.id}`}
                label={
                  tab.count === undefined ? (
                    tab.label
                  ) : (
                    <Stack
                      component="span"
                      direction="row"
                      spacing={0.75}
                      sx={{ alignItems: 'center' }}
                    >
                      <span>{tab.label}</span>
                      <Chip component="span" size="small" label={tab.count} />
                    </Stack>
                  )
                }
              />
            ))}
          </Tabs>
        )}

        <Box
          role={tabs.length > 1 ? 'tabpanel' : undefined}
          id={`tabpanel-${open.id}`}
          aria-labelledby={tabs.length > 1 ? `tab-${open.id}` : undefined}
        >
          {open.content}
        </Box>
      </Paper>

      <Paper
        component="aside"
        variant="outlined"
        aria-label={summaryLabel}
        sx={{
          p: 2,
          order: { xs: -1, md: 0 },
          position: { md: 'sticky' },
          // Below the 56px top bar, with room to breathe.
          top: { md: 72 },
        }}
      >
        {summary}
      </Paper>
    </Box>
  );
}
