import { todayUtc } from '../../common/today';
import type {
  LicencePolicy,
  ReleaseLicenceStatus,
} from '../../database/schema';

/**
 * A licence's state, derived rather than stored (ADR-040), by the same rules
 * as the client's licence-status.ts (ADR-050). "Expires in N days" is a
 * display state there; to the server it is current.
 */
export type LicenceStatus =
  'current' | 'not_in_force' | 'expired' | 'withdrawn';

/** A state at release: a licence's own, or none when the recipe has none. */
export type LicenceStatusAtRelease = LicenceStatus | 'none';

/** What release does: let it through, ask for an override, or refuse. */
export type LicenceOutcome = 'allow' | 'override' | 'block';

/** Calendar days, YYYY-MM-DD, as the `date` columns hold them (ADR-052). */
export interface LicenceDates {
  isActive: boolean;
  issuedAt: string | null;
  expiresAt: string | null;
}

export interface LicencePolicySettings {
  licenceNotInForcePolicy: LicencePolicy;
  licenceExpiredPolicy: LicencePolicy;
  licenceRequired: boolean;
}

/**
 * Withdrawn first, because it is a decision somebody made and outranks any
 * date. Then not yet in force, then expired, compared as calendar days
 * against the server's today, the UTC day (todayUtc, ADR-052). A licence
 * expiring today is still current today, as the client says "Expires today".
 *
 * `now` is a parameter so the unit test can pin the dates either side of
 * today; release passes nothing and gets the clock.
 */
export function licenceStatus(
  licence: LicenceDates,
  now: Date = new Date(),
): LicenceStatus {
  if (!licence.isActive) return 'withdrawn';

  const today = todayUtc(now);

  // YYYY-MM-DD strings compare as days.
  if (licence.issuedAt && licence.issuedAt > today) {
    return 'not_in_force';
  }

  if (licence.expiresAt && licence.expiresAt < today) {
    return 'expired';
  }

  return 'current';
}

/**
 * The organization's policy applied to one state (ADR-050). Current always
 * passes and withdrawn never does; the two dated states follow the policy
 * the organization chose; a recipe with no licence passes unless the
 * organization requires one, and then it is refused outright — making an
 * unregistered product is not a lapse someone can sign off.
 */
export function releaseOutcome(
  status: LicenceStatusAtRelease,
  policy: LicencePolicySettings,
): LicenceOutcome {
  switch (status) {
    case 'current':
      return 'allow';
    case 'withdrawn':
      return 'block';
    case 'not_in_force':
      return policy.licenceNotInForcePolicy;
    case 'expired':
      return policy.licenceExpiredPolicy;
    case 'none':
      return policy.licenceRequired ? 'block' : 'allow';
  }
}

/**
 * The state as a run records it. Narrowed rather than cast: withdrawn is
 * always refused before anything is written, so reaching here with it would
 * be a bug worth failing loudly on rather than a row the check constraint
 * refuses with a less helpful message.
 */
export function recordedStatus(
  status: LicenceStatusAtRelease,
): ReleaseLicenceStatus {
  if (status === 'withdrawn') {
    throw new Error('A withdrawn licence is never released under');
  }

  return status;
}
