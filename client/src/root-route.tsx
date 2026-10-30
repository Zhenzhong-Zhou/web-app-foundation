import type { RouteObject } from 'react-router-dom';

import App from './App.tsx';
import { AuthProvider } from './auth/auth-provider';
import { RouteCrash } from './components/error-boundary';
import { VersionWatch } from './version/version-check';

/**
 * The app's one route, a splat whose element is the app, so App's own
 * <Routes> match within it (main.tsx). Here rather than in main.tsx, so a
 * test can render it.
 *
 * Its errorElement takes what no boundary of ours holds: a fault in the
 * session read, the new-version check, the start-up screens or the
 * signed-in layout's frame shows the crash page, reported (ADR-084).
 */
export const ROOT_ROUTE: RouteObject = {
  path: '*',
  element: (
    <AuthProvider>
      {/* A newer build noticed, signed in or out, and loaded at the next
          page (ADR-081). */}
      <VersionWatch />
      <App />
    </AuthProvider>
  ),
  errorElement: <RouteCrash />,
};
