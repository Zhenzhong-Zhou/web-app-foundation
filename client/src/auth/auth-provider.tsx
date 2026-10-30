import { type ReactNode, useCallback, useEffect, useState } from 'react';

import { reportAs } from '../errors/report-fault';
import { useLanguage } from '../i18n/use-language';
import { api, ApiError, isRevisionRefusal } from '../lib/api';
import { isLocale } from '../lib/locales';
import { setOrganizationTimeZone } from '../lib/time-zone';
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
async function resolveSession({
  background = false,
}: { background?: boolean } = {}): Promise<Resolved> {
  try {
    return {
      session: await api<CurrentSession>(
        '/auth/me',
        background ? { headers: { 'X-Background': '1' } } : {},
      ),
      error: null,
    };
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
  //
  // A read refused for this tab's API revision leaves the app as it is,
  // signed in or out (ADR-081): it says nothing about the session, and the
  // refusal has made a newer build urgent. Read as an error, it would put
  // the boot screen over the app, whose Try again met the same refusal.
  // Only a boot screen already up shows it.
  const refresh = useCallback(async () => {
    const resolved = await resolveSession();
    setState((current) =>
      isRevisionRefusal(resolved.error) && !current.error
        ? current
        : { ...resolved, loading: false },
    );
  }, []);

  const signedOut = useCallback(() => {
    setState({ session: null, error: null, loading: false });
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
   * Another device may have left, joined or started an organization since
   * (#144): the session is read again when this window regains focus, or
   * the page becomes visible again, as a phone's tab does coming back from
   * the background, so an open page catches up without a reload. Switching
   * tabs on a computer brings both, and the two share one read: one at a
   * time, and only while signed in. In the background, as the bell's poll
   * is (ADR-063): coming back to a window is not activity. A read that
   * fails leaves the page as it was; the boot screen's Try again is for a
   * page that never loaded. One that finds nothing changed, as most do,
   * keeps the session it had, so nothing reading it renders again.
   */
  const signedIn = state.session !== null;
  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    let reading = false;

    const read = () => {
      if (reading) return;
      reading = true;
      void resolveSession({ background: true }).then((resolved) => {
        reading = false;
        // Signed out meanwhile: the late answer is not this page's.
        if (!live || resolved.error) return;
        setState((current) =>
          JSON.stringify(current.session) === JSON.stringify(resolved.session)
            ? current
            : { ...resolved, loading: false },
        );
      });
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') read();
    };

    window.addEventListener('focus', read);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      live = false;
      window.removeEventListener('focus', read);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [signedIn]);

  /**
   * The account's language follows the person to this device (ADR-054):
   * once the session says what it is and its catalogue has loaded, the
   * screens switch to it and this device remembers it, so signing out
   * leaves the sign-in page in it too. Null leaves this device's choice, or
   * the browser's, as it was. A tag this client does not know is ignored
   * rather than trusted.
   */
  const { setLocale } = useLanguage();
  const accountLocale = state.session?.user.locale;

  useEffect(() => {
    if (isLocale(accountLocale)) void setLocale(accountLocale);
  }, [accountLocale, setLocale]);

  // The organization's zone decides its day (ADR-072): passed on as this
  // renders, before anything below asks what today is, as the language
  // provider passes the formatting locale.
  setOrganizationTimeZone(state.session?.organization?.timeZone ?? null);

  // Whom the error tracker's reports name, by id alone (ADR-084), passed on
  // the same way, so a fault below already carries them: signing out
  // clears both, and a switch of organization replaces it.
  reportAs(
    state.session && {
      userId: state.session.user.id,
      organizationId: state.session.organization?.id ?? null,
    },
  );

  // The organization's look follows it the same way (ADR-060): the theme
  // reads it from here, and signing out returns the defaults.
  const branding = state.session?.organization?.branding ?? null;
  useEffect(() => {
    setBrand(branding);
  }, [branding]);

  return (
    <AuthContext.Provider value={{ ...state, refresh, signedOut }}>
      {children}
    </AuthContext.Provider>
  );
}
