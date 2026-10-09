import { createContext } from 'react';

import type { Locale } from '../lib/locales';

/** Mirrors CurrentSession from the server's auth.service.ts. */
/** An organization's look and expiry days (ADR-060), with the session. */
export interface OrganizationBranding {
  logoFileId: string | null;
  /** The saved shade, already readable; null for the default. */
  accentColor: string | null;
  rail: 'dark' | 'light';
  logoOnDocuments: boolean;
  expiryWarningDays: number;
  expiryCriticalDays: number;
}

export interface CurrentSession {
  user: {
    id: string;
    email: string;
    name: string;
    emailVerified: boolean;
    /** The account's language (ADR-054); null follows the browser. */
    locale: Locale | null;
  };
  /** Null when the caller belongs to no organization — see SessionGuard. */
  organization: {
    id: string;
    name: string;
    roleId: string;
    /** How the app looks, and what counts as expiring (ADR-060). */
    branding: OrganizationBranding;
  } | null;
  /**
   * For rendering only: hide a control the user cannot use. This is NOT an
   * authorization check. It is resolved at boot and stale the moment someone
   * is demoted; the server re-resolves per request and answers 403 (ADR-016).
   */
  permissions: string[];
}

export interface AuthState {
  session: CurrentSession | null;
  loading: boolean;
  /** Boot failed for a reason other than "not signed in". */
  error: Error | null;
  refresh: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);
