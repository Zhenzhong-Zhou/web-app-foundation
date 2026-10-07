import CloseIcon from '@mui/icons-material/Close';
import {
  Button,
  Divider,
  Drawer,
  IconButton,
  Stack,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { useIntl } from 'react-intl';

import { useCan } from '../auth/permissions';
import { openDialog } from '../lib/open-dialog';
import { HistoryEntries } from './history-entries';

/**
 * "What happened to this one", without leaving it.
 *
 * A drawer rather than a link to the audit page: the page you are on already
 * says which product or order this is, and navigating away to a log that
 * cannot say it trades the context for nothing. A drawer rather than a
 * dialog, because the record stays visible beside its history — "SKU changed
 * to RENAMED-1" is read against the SKU on screen.
 *
 * The audit page stays, and the drawer links to it. It answers a different
 * question — what happened across the organization — and owns the filters,
 * the dates and the long tail. This shows the recent changes to one record
 * and stops.
 *
 * Fetched on every open rather than once: the likeliest reason to open it is
 * having just changed something, and a cached history would not include it.
 *
 * Hidden without audit.view rather than disabled. The API would refuse the
 * request, and a disabled control asks a question only an admin can answer.
 */
export function HistoryButton({ resourceId }: { resourceId: string }) {
  const intl = useIntl();
  const can = useCan();
  const [open, setOpen] = useState(false);

  if (!can('audit.view')) return null;

  return (
    <>
      {/* A Drawer is a Modal: it hides #root the same way a Dialog does. */}
      <Button variant="text" onClick={openDialog(() => setOpen(true))}>
        {intl.formatMessage({
          id: 'inventory.actions.history',
          defaultMessage: 'History',
        })}
      </Button>

      <Drawer
        anchor="right"
        open={open}
        onClose={() => setOpen(false)}
        slotProps={{ paper: { sx: { width: { xs: '100%', sm: 420 } } } }}
      >
        {/* Mounted only while open, so each open starts from nothing and
            fetches fresh — no stale list flashing before the new one. */}
        {open && (
          <HistoryPanel
            resourceId={resourceId}
            onClose={() => setOpen(false)}
          />
        )}
      </Drawer>
    </>
  );
}

function HistoryPanel({
  resourceId,
  onClose,
}: {
  resourceId: string;
  onClose: () => void;
}) {
  const intl = useIntl();

  return (
    <Stack sx={{ height: '100%' }}>
      <Stack
        direction="row"
        sx={{ alignItems: 'center', px: 2, py: 1.5, gap: 1 }}
      >
        <Typography variant="h6" component="h2" sx={{ flexGrow: 1 }}>
          {intl.formatMessage({
            id: 'inventory.actions.history',
            defaultMessage: 'History',
          })}
        </Typography>
        <IconButton
          aria-label={intl.formatMessage({
            id: 'audit.history.close',
            defaultMessage: 'Close history',
          })}
          onClick={onClose}
        >
          <CloseIcon />
        </IconButton>
      </Stack>

      <Divider />

      <HistoryEntries resourceId={resourceId} />
    </Stack>
  );
}
