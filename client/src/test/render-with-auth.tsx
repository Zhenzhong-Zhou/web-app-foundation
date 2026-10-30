import { act, render } from '@testing-library/react';
import { type ReactElement, useState } from 'react';

import type { Permission } from '../api/types.gen';
import {
  AuthContext,
  type AuthState,
  type CurrentSession,
} from '../auth/auth-context';

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
  {
    refresh = () => Promise.resolve(),
    ...options
  }: SessionOptions & { refresh?: () => Promise<void> } = {},
) {
  const state: AuthState = {
    session: sessionFor(options),
    loading: false,
    error: null,
    refresh,
    signedOut: () => undefined,
  };

  return render(
    <AuthContext.Provider value={state}>{ui}</AuthContext.Provider>,
  );
}

/**
 * As renderWithAuth, over a session that changes as the server's does
 * between reads: `refresh` reads `refreshed`, as after a keep or a cancel,
 * and `change` sets another, as a deletion asked for from another page.
 * For a component that outlives one read, such as a banner.
 */
export function renderWithChangingAuth(
  ui: ReactElement,
  first: SessionOptions,
  refreshed: SessionOptions,
) {
  let set: (options: SessionOptions) => void = () => undefined;

  function Session() {
    const [options, setOptions] = useState(first);
    set = setOptions;
    return (
      <AuthContext.Provider
        value={{
          session: sessionFor(options),
          loading: false,
          error: null,
          refresh: () => {
            setOptions(refreshed);
            return Promise.resolve();
          },
          signedOut: () => undefined,
        }}
      >
        {ui}
      </AuthContext.Provider>
    );
  }

  render(<Session />);
  return { change: (options: SessionOptions) => act(() => set(options)) };
}

interface SessionOptions {
  permissions?: string[];
  user?: Partial<CurrentSession['user']>;
  organization?: Partial<NonNullable<CurrentSession['organization']>>;
}

/** A session as GET /auth/me answers it, with what a spec sets over it. */
export function sessionFor({
  permissions = [],
  user = {},
  organization = {},
}: SessionOptions): CurrentSession {
  return {
    user: {
      id: 'user-1',
      email: 'owner@alpha.example.com',
      name: 'Owner',
      emailVerified: true,
      locale: null,
      ...user,
    },
    organization: {
      id: 'org-1',
      name: 'Alpha Co',
      branding: {
        logoFileId: null,
        squareLogoFileId: null,
        accentColor: null,
        rail: 'dark',
        logoOnDocuments: true,
        expiryWarningDays: 90,
        expiryCriticalDays: 30,
      },
      deletionScheduledAt: null,
      // Scheduled, as the server would say, whenever a spec sets a day.
      deletionStage: organization.deletionScheduledAt ? 'scheduled' : null,
      // The organization's zone (ADR-072): UTC until it sets one.
      timeZone: 'UTC',
      ...organization,
    },
    // Specs list permissions as plain strings; the session holds them
    // as the server's names (ADR-068).
    permissions: permissions as Permission[],
  };
}
