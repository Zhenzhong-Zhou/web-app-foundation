import { Alert, Snackbar, Stack } from '@mui/material';
import { type ReactNode, useCallback, useState } from 'react';

import { ReferencesWhole } from './reference';
import { type ShowToast, ToastContext } from './toast-context';

/**
 * "Saved" for the person who just did something.
 *
 * Success only. Errors stay inside the dialog that caused them, next to the
 * field that is wrong, where FormError already puts them: a failure reported
 * in a corner toast is a failure somebody has to go looking for.
 *
 * One at a time, newest wins. A queue replays confirmations for things
 * already finished, which reads as the app lagging behind the person.
 *
 * `foot` shows below it, at the same foot of the screen: something that
 * stays until it is closed, as a language that would not load does
 * (ADR-081). Stacked rather than in the same place, so a confirmation
 * never covers it, nor it a confirmation.
 */
export function ToastProvider({
  children,
  foot,
}: {
  children: ReactNode;
  foot?: ReactNode;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // Stable across renders, so every consumer of the context does not
  // re-render each time a toast opens or closes.
  const show = useCallback<ShowToast>((next) => {
    setMessage(next);
    setOpen(true);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}

      {/* Where MUI puts a snackbar at the bottom left, for both. */}
      <Stack
        spacing={1}
        sx={{
          position: 'fixed',
          zIndex: 'snackbar',
          left: { xs: 8, sm: 24 },
          right: { xs: 8, sm: 'auto' },
          bottom: { xs: 8, sm: 24 },
        }}
      >
        <Snackbar
          open={open}
          autoHideDuration={4000}
          onClose={(_event, reason) => {
            // A click elsewhere is somebody carrying on, not dismissing.
            if (reason !== 'clickaway') setOpen(false);
          }}
          sx={{ position: 'static' }}
        >
          {/* role=status, so a screen reader announces it without taking
              focus from whatever the person is doing next. */}
          <Alert
            severity="success"
            variant="filled"
            role="status"
            onClose={() => setOpen(false)}
            sx={{ width: '100%' }}
          >
            {/* Finished words: their references kept whole (ADR-081). */}
            {message && <ReferencesWhole text={message} />}
          </Alert>
        </Snackbar>
        {foot}
      </Stack>
    </ToastContext.Provider>
  );
}
