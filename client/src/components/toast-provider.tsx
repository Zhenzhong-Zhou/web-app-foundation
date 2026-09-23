import { Alert, Snackbar } from '@mui/material';
import { type ReactNode, useCallback, useState } from 'react';

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
 */
export function ToastProvider({ children }: { children: ReactNode }) {
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

      <Snackbar
        open={open}
        autoHideDuration={4000}
        onClose={(_event, reason) => {
          // A click elsewhere is somebody carrying on, not dismissing.
          if (reason !== 'clickaway') setOpen(false);
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
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
          {message}
        </Alert>
      </Snackbar>
    </ToastContext.Provider>
  );
}
