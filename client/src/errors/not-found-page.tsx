import { Button } from '@mui/material';
import { useIntl } from 'react-intl';
import { Link as RouterLink, Route, Routes } from 'react-router-dom';

import { useAuth } from '../auth/use-auth';
import { AppLayout } from '../layout/app-layout';
import { GoHome, SearchEverything } from './status-actions';
import { StatusPage } from './status-page';

/**
 * An address with no page. Signed in, it shows inside the app, rail and
 * lookup around it, so the person is never stranded; signed out, centred
 * on its own with Sign in, since a colleague's link works once signed in.
 * The route sits outside both guards (App.tsx says why), so this decides.
 */
export function NotFoundRoute() {
  const { session } = useAuth();
  if (session) {
    return (
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    );
  }
  return <SignedOutNotFound />;
}

function NotFoundPage() {
  const intl = useIntl();
  return (
    <StatusPage
      kind="notFound"
      title={intl.formatMessage({
        id: 'status.notFound.title',
        defaultMessage: 'Page not found',
      })}
      message={intl.formatMessage({
        id: 'status.notFound.message',
        defaultMessage:
          'There is no page at this address. It may have moved, or the link may be wrong.',
      })}
      actions={
        <>
          <GoHome primary />
          <SearchEverything />
        </>
      }
    />
  );
}

function SignedOutNotFound() {
  const intl = useIntl();
  return (
    <StatusPage
      standalone
      kind="notFound"
      title={intl.formatMessage({
        id: 'status.notFound.title',
        defaultMessage: 'Page not found',
      })}
      message={intl.formatMessage({
        id: 'status.notFound.signedOut',
        defaultMessage:
          'There is no page at this address. If a colleague sent you this link, sign in first and open it again.',
      })}
      actions={
        <Button component={RouterLink} to="/login" variant="contained">
          {intl.formatMessage({
            id: 'status.signIn',
            defaultMessage: 'Sign in',
          })}
        </Button>
      }
    />
  );
}
