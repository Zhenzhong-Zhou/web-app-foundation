import { type ReactNode, useCallback, useEffect, useState } from 'react';

import { useLanguage } from '../i18n/use-language';
import { api, ApiError } from '../lib/api';
import { isLocale } from '../lib/locales';
import { setBrand } from '../theme/brand-store';
import { AuthContext, type CurrentSession } from './auth-context';

interface Resolved {
  session: CurrentSession | null;
  /** Boot failed for a reason other than "not signed in". */
  error: Error | null;
}

/**
 * Outside the component deliberately: no setState, so the effect body below
 * has nothing synchronously reachable to flag, and boot and refresh share one
 * classification of what a failure means.
 *
 * A 401 is the normal answer for an anonymous visitor, not an error. Anything
 * else is one, and surfacing it beats a blank page with the reason in the
 * console.
 */
async function resolveSession(): Promise<Resolved> {
  try {
    return { session: await api<CurrentSession>('/auth/me'), error: null };
  } catch (caught) {
    if (caught instanceof ApiError && caught.status === 401) {
      return { session: null, error: null };
    }
    return {
      session: null,
      error: caught instanceof Error ? caught : new Error(String(caught)),
    };
  }
}

/**
 * Resolves who the browser is signed in as, once, before first paint.
 *
 * The session cookie is httpOnly, so after a reload the client cannot read it.
 * This is how it finds out. Blocking on the result is the point: rendering
 * before it resolves shows a signed-in user the login screen for a frame.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Resolved & { loading: boolean }>({
    session: null,
    error: null,
    loading: true,
  });

  // One object rather than three useState calls: loading, session and error
  // always change together, and separate setters can render a combination
  // that never actually occurs.
  const refresh = useCallback(async () => {
    setState({ ...(await resolveSession()), loading: false });
  }, []);

  useEffect(() => {
    let ignore = false;

    void resolveSession().then((resolved) => {
      // StrictMode runs effects twice in development, and the provider can
      // unmount while the request is in flight. Either way the late result
      // is discarded rather than written to a dead component.
      if (!ignore) setState({ ...resolved, loading: false });
    });

    return () => {
      ignore = true;
    };
  }, []);

  /**
   * The account's language follows the person to this device (ADR-054):
   * once the session says what it is, the screens switch to it and this
   * device remembers it, so signing out leaves the sign-in page in it too.
   * Null leaves this device's choice, or the browser's, as it was. A tag
   * this client does not know is ignored rather than trusted.
   */
  const { setLocale } = useLanguage();
  const accountLocale = state.session?.user.locale;

  useEffect(() => {
    if (isLocale(accountLocale)) setLocale(accountLocale);
  }, [accountLocale, setLocale]);

  // The organization's look follows it the same way (ADR-060): the theme
  // reads it from here, and signing out returns the defaults.
  const branding = state.session?.organization?.branding ?? null;
  useEffect(() => {
    setBrand(branding);
  }, [branding]);

  return (
    <AuthContext.Provider value={{ ...state, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}
