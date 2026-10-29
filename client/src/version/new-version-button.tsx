import RefreshIcon from '@mui/icons-material/Refresh';
import { Button, Popover, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { useIntl } from 'react-intl';

import { rem } from '../theme/rem';
import { reloadPage } from './reload-page';

/**
 * "New version" in the top bar on a computer (ADR-081), beside Help, once
 * a newer build is out and before its saves would be refused: the frame
 * shows it, and on a phone a dot on the account button instead. It opens
 * a short note with Reload now; otherwise the new version loads by itself
 * at the next page. A pill, as Help's button is, in the info tone.
 */
export function NewVersionButton() {
  const intl = useIntl();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const label = intl.formatMessage({
    id: 'version.button',
    defaultMessage: 'New version',
  });

  return (
    <>
      <Button
        variant="outlined"
        startIcon={<RefreshIcon />}
        aria-haspopup="dialog"
        aria-expanded={!!anchor}
        onClick={(event) => setAnchor(event.currentTarget)}
        sx={{
          borderRadius: 999,
          bgcolor: 'tone.info.bg',
          color: 'tone.info.fg',
          borderColor: 'tone.info.border',
          '&:hover': { bgcolor: 'tone.info.bg', borderColor: 'tone.info.fg' },
        }}
      >
        {label}
      </Button>
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            role: 'dialog',
            'aria-label': label,
            sx: { mt: 1, p: 2, maxWidth: rem(320) },
          },
        }}
      >
        <Stack spacing={1.5} sx={{ alignItems: 'flex-start' }}>
          <Typography>
            {intl.formatMessage({
              id: 'version.note',
              defaultMessage:
                'A new version is ready. It loads by itself when you open another page. Everything you’ve saved is kept; you don’t need to do anything.',
            })}
          </Typography>
          <Button onClick={reloadPage}>
            {intl.formatMessage({
              id: 'version.reloadNow',
              defaultMessage: 'Reload now',
            })}
          </Button>
        </Stack>
      </Popover>
    </>
  );
}
