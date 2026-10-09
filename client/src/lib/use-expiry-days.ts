import { useBranding } from '../auth/use-branding';
import { EXPIRY_DAYS, type ExpiryDays } from './expiry';

/**
 * The organization's expiry days (ADR-060), from the session: what turns a
 * chip amber or red, and what the Expiring filter means. ADR-055's 90 and
 * 30 outside an organization.
 */
export function useExpiryDays(): ExpiryDays {
  const branding = useBranding();
  return branding
    ? {
        warning: branding.expiryWarningDays,
        critical: branding.expiryCriticalDays,
      }
    : EXPIRY_DAYS;
}
