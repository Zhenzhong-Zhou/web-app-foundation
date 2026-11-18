import Tune from '@mui/icons-material/Tune';
import { Button, Drawer, Stack, Typography } from '@mui/material';
import { type ReactNode, useId, useState } from 'react';
import { useIntl } from 'react-intl';

/**
 * The Filters button for phones (ADR-093; #481), Items' first: on a phone
 * a list's filters and its sort leave the row above it for a sheet that
 * rises from the bottom, the button saying how many filters are on,
 * "Filters · 2".
 *
 * The sheet scrolls inside, so its buttons stay in reach (ADR-090), and is
 * a dialog named by its heading, as Help's sheet is (WCAG 4.1.2). Its
 * fields change the list as they are chosen; Clear clears them, the
 * caller's one write; Show 12 closes it on the list they made, or Done
 * while that count is not known.
 */
export function FiltersButton({
  on,
  shown,
  onClear,
  children,
}: {
  /** How many filters are on, the sort not among them. */
  on: number;
  /** How many rows the list holds now, for Show; null while not known. */
  shown: number | null;
  onClear: () => void;
  /** The sheet's fields: the filters a phone hides, and the sort. */
  children: ReactNode;
}) {
  const intl = useIntl();
  const [open, setOpen] = useState(false);
  const titleId = useId();

  return (
    <>
      <Button
        variant="outlined"
        startIcon={<Tune />}
        onClick={() => setOpen(true)}
      >
        {intl.formatMessage(
          {
            id: 'filters.sheet.open',
            defaultMessage: '{count, plural, =0 {Filters} other {Filters · #}}',
          },
          { count: on },
        )}
      </Button>
      <Drawer
        anchor="bottom"
        open={open}
        onClose={() => setOpen(false)}
        slotProps={{
          paper: {
            'aria-labelledby': titleId,
            sx: { maxHeight: '80vh' },
          },
        }}
      >
        <Stack spacing={2} sx={{ p: 2 }}>
          <Typography variant="h6" component="h2" id={titleId}>
            {intl.formatMessage({
              id: 'filters.sheet.title',
              defaultMessage: 'Filters and sort',
            })}
          </Typography>
          {children}
          <Stack
            direction="row"
            spacing={1}
            sx={{ justifyContent: 'flex-end' }}
          >
            <Button variant="text" onClick={onClear}>
              {intl.formatMessage({
                id: 'filters.sheet.clear',
                defaultMessage: 'Clear',
              })}
            </Button>
            <Button onClick={() => setOpen(false)}>
              {shown === null
                ? intl.formatMessage({
                    id: 'filters.sheet.done',
                    defaultMessage: 'Done',
                  })
                : intl.formatMessage(
                    {
                      id: 'filters.sheet.show',
                      defaultMessage: 'Show {count}',
                    },
                    { count: shown },
                  )}
            </Button>
          </Stack>
        </Stack>
      </Drawer>
    </>
  );
}
