import { Button, Typography } from '@mui/material';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';

import { GoHome } from '../errors/status-actions';
import { StatusPage } from '../errors/status-page';
import { ApiError } from '../lib/api';

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
 * reference to quote, Reload, Go back and Go home. A stale chunk after a
 * deploy is not a failure: it says a new version is available, and Reload
 * is the fix.
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

    const isStaleChunk =
      !(error instanceof ApiError) &&
      /dynamically imported module|Importing a module script failed/i.test(
        error.message,
      );

    return <Failure updated={isStaleChunk} reference={reference} />;
  }
}

function Failure({
  updated,
  reference,
}: {
  updated: boolean;
  reference: string | null;
}) {
  const intl = useIntl();
  const reload = (
    <Button variant="contained" onClick={() => window.location.reload()}>
      <FormattedMessage
        id="components.errorBoundary.reload"
        defaultMessage="Reload"
      />
    </Button>
  );

  if (updated) {
    return (
      <StatusPage
        kind="updated"
        title={intl.formatMessage({
          id: 'components.errorBoundary.newVersion',
          defaultMessage: 'A new version is available',
        })}
        message={intl.formatMessage({
          id: 'components.errorBoundary.updated',
          defaultMessage:
            'The app was updated while this tab was open. Reload to pick up the new version — nothing is lost.',
        })}
        actions={reload}
      />
    );
  }

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
          {reload}
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
