import { createContext } from 'react';

/** Mirrors CurrentSession from the server's auth.service.ts. */
export interface CurrentSession {
  user: { id: string; email: string; name: string; emailVerified: boolean };
  /** Null when the caller belongs to no organization — see SessionGuard. */
  organization: { id: string; name: string; roleId: string } | null;
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
