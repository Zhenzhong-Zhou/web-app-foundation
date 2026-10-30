import { Button, Typography } from '@mui/material';
import {
  Component,
  type ErrorInfo,
  type ReactNode,
  useEffect,
  useState,
} from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useRouteError } from 'react-router-dom';

import { AuthContext, type AuthState } from '../auth/auth-context';
import { NewVersionPage } from '../errors/new-version-page';
import { OfflinePage } from '../errors/offline-page';
import { reportFault } from '../errors/report-fault';
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
  /**
   * Before sign-in (#244): the status page on its own, in the product's
   * frame, with Reload alone, since Go home leads to Sign in, which may be
   * the page that broke; and saying whom to give the reference, since no
   * Help is there.
   */
  standalone?: boolean;
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
 *
 * One inside the layout, around the signed-in pages; one around the
 * screens before sign-in, `standalone` (App.tsx).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, reference: null };

  componentDidUpdate(previous: Props) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null, reference: null });
    }
  }

  static getDerivedStateFromError(error: Error): State {
    return { error, reference: referenceFor(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `Render error (reference ${this.state.reference ?? '?'}):`,
      error,
      info.componentStack,
    );
    // To the error tracker, with the reference the person sees (ADR-084);
    // the offline and new version pages' failures are dropped there.
    reportFault(error, { reference: this.state.reference });
  }

  render() {
    const { error, reference } = this.state;
    const { standalone } = this.props;
    if (!error) return this.props.children;

    if (error instanceof ChunkLoadError && error.failure === 'offline') {
      return <OfflinePage standalone={standalone} />;
    }
    if (error instanceof ChunkLoadError && error.failure === 'newer') {
      return <NewVersionPage standalone={standalone} />;
    }
    return <Failure reference={reference} standalone={standalone} />;
  }
}

function referenceFor(error: unknown): string {
  return error instanceof ApiError && error.requestId
    ? error.requestId
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** No one signed in: the crash page's language select saves to no account. */
const NO_SESSION: AuthState = {
  session: null,
  loading: false,
  error: null,
  refresh: () => Promise.resolve(),
  signedOut: () => undefined,
};

/**
 * The app's route's errorElement (root-route.tsx): a fault in what no
 * boundary of ours holds, the session read, the new-version check, the
 * start-up screens or the signed-in layout's frame, shows the crash page
 * on its own, as one before sign-in does, never React Router's own page,
 * and is reported once with the reference it shows (ADR-084). Drawn in
 * place of AuthProvider, which may be what broke, so with no session.
 */
export function RouteCrash() {
  const error = useRouteError();
  const [reference] = useState(() => referenceFor(error));

  // Twice under StrictMode in development, where the tracker drops the
  // second report of the same error.
  useEffect(() => {
    console.error(`Render error (reference ${reference}):`, error);
    reportFault(error, { reference });
  }, [error, reference]);

  return (
    <AuthContext.Provider value={NO_SESSION}>
      <Failure reference={reference} standalone />
    </AuthContext.Provider>
  );
}

function Failure({
  reference,
  standalone = false,
}: {
  reference: string | null;
  standalone?: boolean;
}) {
  const intl = useIntl();

  return (
    <StatusPage
      kind="crash"
      standalone={standalone}
      title={intl.formatMessage({
        id: 'components.errorBoundary.title',
        defaultMessage: 'Something went wrong',
      })}
      message={
        standalone
          ? intl.formatMessage({
              id: 'status.crash.signedOut',
              defaultMessage:
                'Try again later. If it keeps happening, give the reference below to the person who invited you.',
            })
          : intl.formatMessage({
              id: 'status.crash.message',
              defaultMessage:
                'This page stopped working. Reloading usually fixes it. If it happens again, send the reference below.',
            })
      }
      actions={
        standalone ? (
          <Reload primary />
        ) : (
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
        )
      }
      reference={
        reference && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
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
