import { Button, Typography } from '@mui/material';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';

import { NewVersionPage } from '../errors/new-version-page';
import { OfflinePage } from '../errors/offline-page';
import { GoHome, Reload } from '../errors/status-actions';
import { StatusPage } from '../errors/status-page';
import { ApiError } from '../lib/api';
import { ChunkLoadError } from '../version/load-chunk';

interface Props {
  children: ReactNode;
  /**
   * Where the person is: when it changes, a failure clears and the new page
   * draws, so the menu, Back and Go home lead away from a broken page
   * rather than back to the same message.
   */
  resetKey?: string;
}

interface State {
  error: Error | null;
  /** What a person quotes when reporting it: the server's request id when
   * the failure came from the server, else one made here and logged. */
  reference: string | null;
}

/**
 * A page that throws while rendering shows "Something went wrong" as a
 * status page (conventions.md, "Status pages"), inside the layout, with a
 * reference to quote, Reload, Go back and Go home. A page whose chunk would
 * not load says why, from what the loader found rather than the browser's
 * words (ADR-081): the connection dropped, the offline page; a new version
 * came out, the new version page, once loading it in full has been tried;
 * this build, the crash page, since that is a real failure.
 *
 * It clears when resetKey changes, as react-error-boundary's resetKeys and
 * React Router's error pages do: without that, the failure outlived the
 * page that caused it, and every way out led back to it until a reload.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, reference: null };

  componentDidUpdate(previous: Props) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null, reference: null });
    }
  }

  static getDerivedStateFromError(error: Error): State {
    const reference =
      error instanceof ApiError && error.requestId
        ? error.requestId
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    return { error, reference };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Console only for now. When an error reporter is added, this is where
    // it goes, with the reference the person sees.
    console.error(
      `Render error (reference ${this.state.reference ?? '?'}):`,
      error,
      info.componentStack,
    );
  }

  render() {
    const { error, reference } = this.state;
    if (!error) return this.props.children;

    if (error instanceof ChunkLoadError && error.failure === 'offline') {
      return <OfflinePage />;
    }
    if (error instanceof ChunkLoadError && error.failure === 'newer') {
      return <NewVersionPage />;
    }
    return <Failure reference={reference} />;
  }
}

function Failure({ reference }: { reference: string | null }) {
  const intl = useIntl();

  return (
    <StatusPage
      kind="crash"
      title={intl.formatMessage({
        id: 'components.errorBoundary.title',
        defaultMessage: 'Something went wrong',
      })}
      message={intl.formatMessage({
        id: 'status.crash.message',
        defaultMessage:
          'This page stopped working. Reloading usually fixes it. If it happens again, send the reference below.',
      })}
      actions={
        <>
          <Reload primary />
          {/* Where they came from, when there is somewhere to go back to. */}
          {window.history.length > 1 && (
            <Button variant="outlined" onClick={() => window.history.back()}>
              <FormattedMessage
                id="components.errorBoundary.goBack"
                defaultMessage="Go back"
              />
            </Button>
          )}
          <GoHome />
        </>
      }
      reference={
        reference && (
          <Typography variant="body2" color="text.secondary">
            <FormattedMessage
              id="components.errorBoundary.reference"
              defaultMessage="Reference: {requestId}"
              values={{
                requestId: (
                  <Typography
                    component="code"
                    variant="body2"
                    sx={{ fontFamily: 'monospace', userSelect: 'all' }}
                  >
                    {reference}
                  </Typography>
                ),
              }}
            />
          </Typography>
        )
      }
    />
  );
}
