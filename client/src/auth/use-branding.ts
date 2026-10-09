import { useContext } from 'react';

import { AuthContext, type OrganizationBranding } from './auth-context';

/**
 * The signed-in organization's look and expiry days (ADR-060), or null
 * outside one. Unlike useAuth it does not insist on an AuthProvider, so a
 * chip or a printed sheet renders on its own in a test as on a page.
 */
export function useBranding(): OrganizationBranding | null {
  return useContext(AuthContext)?.session?.organization?.branding ?? null;
}
