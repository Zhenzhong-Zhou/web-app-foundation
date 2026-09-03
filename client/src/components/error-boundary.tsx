import { Alert, Button, Stack, Typography } from '@mui/material';
import { Component, type ErrorInfo, type ReactNode } from 'react';

import { ApiError } from '../lib/api';

interface State {
  error: Error | null;
}

/**
 * Catches errors thrown *during render*, which is the gap the pages do not
 * cover. Every fetch already has a .catch(), and a rejected promise never
 * reaches a boundary — what lands here is a component dereferencing a field
 * the server did not send, or a shape that changed under it.
 *
 * A class because React has no hook equivalent. componentDidCatch is the only
 * way to see these.
 *
 * Wraps the layout's Outlet rather than each route: one boundary, and the
 * header and nav stay usable so the person can navigate away instead of
 * reaching for the back button.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Console only for now. When an error reporter is added, this is where it
    // goes — and the requestId below is what ties a report to a server log.
    console.error('Render error:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    // An ApiError reaching a boundary means a page threw one rather than
    // handling it. Its requestId is worth surfacing regardless: it is the
    // only thing connecting what the user saw to a line in the server log.
    const requestId = error instanceof ApiError ? error.requestId : undefined;

    return (
      <Stack spacing={2} sx={{ py: 4 }}>
        <Typography variant="h5" component="h1">
          Something went wrong
        </Typography>

        <Alert severity="error">
          {error.message}
          {requestId && (
            <Typography variant="caption" component="div" sx={{ mt: 1 }}>
              Reference: {requestId}
            </Typography>
          )}
        </Alert>

        {/* Full reload rather than clearing state: whatever the component was
            holding is what broke it, and a soft reset would render the same
            thing again. */}
        <Button
          onClick={() => window.location.reload()}
          sx={{ alignSelf: 'flex-start' }}
        >
          Reload
        </Button>
      </Stack>
    );
  }
}
