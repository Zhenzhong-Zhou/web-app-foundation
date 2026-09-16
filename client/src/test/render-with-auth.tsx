import { render } from '@testing-library/react';
import type { ReactElement } from 'react';

import { AuthContext, type AuthState } from '../auth/auth-context';

/**
 * Renders inside AuthContext, for any component that calls useAuth.
 *
 * The real AuthProvider boots by fetching the session, which would make every
 * such spec depend on a handler for something it is not testing — and on the
 * loading state resolving before the first assertion. Supplying the context
 * value directly is the same contract with none of that.
 *
 * Permissions are the interesting axis: they decide which controls render, and
 * the server re-checks on every request anyway (ADR-016), so a spec asserting
 * on a hidden button is asserting about the UI rather than about access.
 */
export function renderWithAuth(
  ui: ReactElement,
  { permissions = [] as string[] } = {},
) {
  const state: AuthState = {
    session: {
      user: {
        id: 'user-1',
        email: 'owner@alpha.example.com',
        name: 'Owner',
        emailVerified: true,
      },
      organization: {
        id: 'org-1',
        name: 'Alpha Co',
        roleId: 'role-owner',
      },
      permissions,
    },
    loading: false,
    error: null,
    refresh: () => Promise.resolve(),
  };

  return render(
    <AuthContext.Provider value={state}>{ui}</AuthContext.Provider>,
  );
}
