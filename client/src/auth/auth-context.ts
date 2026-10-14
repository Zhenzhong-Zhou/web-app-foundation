import { createContext } from 'react';

import type { CurrentSession } from '../api/types.gen';

/**
 * The session and the organization's branding, generated from the
 * server's OpenAPI document (ADR-068), so what GET /auth/me sends is what
 * the app reads.
 */
export type { CurrentSession, OrganizationBranding } from '../api/types.gen';

export interface AuthState {
  session: CurrentSession | null;
  loading: boolean;
  /** Boot failed for a reason other than "not signed in". */
  error: Error | null;
  refresh: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);
