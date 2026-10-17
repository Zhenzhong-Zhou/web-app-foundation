import { todayIn } from '../../common/today';
import {
  type LicenceDates,
  type LicencePolicySettings,
  licenceStatus,
  recordedStatus,
  releaseOutcome,
} from './licence-status';

/**
 * The server's reading of a licence must agree with the client's
 * licence-status.ts (ADR-050), or the release dialog would show one state
 * and release act on another. The client's test pins the same three days.
 *
 * Today is a calendar day, the organization's (ADR-072): which day it is
 * in its zone is todayIn's question, tested beside it.
 */

// Calendar days, as the `date` columns hold them (ADR-052).
const YESTERDAY = '2026-10-01';
const TODAY = '2026-10-02';
const TOMORROW = '2026-10-03';

function licence(over: Partial<LicenceDates> = {}): LicenceDates {
  return { isActive: true, issuedAt: null, expiresAt: null, ...over };
}

describe('licenceStatus', () => {
  it('reads a licence with no dates as current — an NPN does not expire', () => {
    expect(licenceStatus(licence(), TODAY)).toBe('current');
  });

  it('reads withdrawn ahead of any date', () => {
    expect(
      licenceStatus(licence({ isActive: false, expiresAt: YESTERDAY }), TODAY),
    ).toBe('withdrawn');
    expect(
      licenceStatus(licence({ isActive: false, issuedAt: TOMORROW }), TODAY),
    ).toBe('withdrawn');
  });

  it('is not in force until its issue day', () => {
    expect(licenceStatus(licence({ issuedAt: TOMORROW }), TODAY)).toBe(
      'not_in_force',
    );
    expect(licenceStatus(licence({ issuedAt: TODAY }), TODAY)).toBe('current');
    expect(licenceStatus(licence({ issuedAt: YESTERDAY }), TODAY)).toBe(
      'current',
    );
  });

  it('is current on its expiry day and expired the day after', () => {
    expect(licenceStatus(licence({ expiresAt: TOMORROW }), TODAY)).toBe(
      'current',
    );
    expect(licenceStatus(licence({ expiresAt: TODAY }), TODAY)).toBe('current');
    expect(licenceStatus(licence({ expiresAt: YESTERDAY }), TODAY)).toBe(
      'expired',
    );
  });

  /**
   * The same moment is two days in two places (ADR-072): 5 pm on 1 October
   * in Vancouver is already 2 October in UTC. Release reads the day where
   * the organization is, so a licence expiring on the 1st is still current
   * there.
   */
  it('reads the organization’s day, not the UTC day', () => {
    const moment = new Date('2026-10-02T00:00:01.000Z');
    const expiring = licence({ expiresAt: YESTERDAY });

    expect(licenceStatus(expiring, todayIn('UTC', moment))).toBe('expired');
    expect(licenceStatus(expiring, todayIn('America/Vancouver', moment))).toBe(
      'current',
    );
  });
});

describe('releaseOutcome', () => {
  const DEFAULTS: LicencePolicySettings = {
    licenceNotInForcePolicy: 'block',
    licenceExpiredPolicy: 'override',
    licenceRequired: false,
  };

  it('applies the default policy', () => {
    expect(releaseOutcome('current', DEFAULTS)).toBe('allow');
    expect(releaseOutcome('not_in_force', DEFAULTS)).toBe('block');
    expect(releaseOutcome('expired', DEFAULTS)).toBe('override');
    expect(releaseOutcome('withdrawn', DEFAULTS)).toBe('block');
    expect(releaseOutcome('none', DEFAULTS)).toBe('allow');
  });

  it.each(['block', 'override', 'allow'] as const)(
    'follows a %s policy for both dated states',
    (policy) => {
      const settings = {
        ...DEFAULTS,
        licenceNotInForcePolicy: policy,
        licenceExpiredPolicy: policy,
      };

      expect(releaseOutcome('not_in_force', settings)).toBe(policy);
      expect(releaseOutcome('expired', settings)).toBe(policy);
    },
  );

  // Not configurable: an override would undo a withdrawal without saying so.
  it('refuses withdrawn whatever the policy', () => {
    expect(
      releaseOutcome('withdrawn', {
        licenceNotInForcePolicy: 'allow',
        licenceExpiredPolicy: 'allow',
        licenceRequired: false,
      }),
    ).toBe('block');
  });

  // Required means refused outright, never "override".
  it('refuses a missing licence only when one is required', () => {
    expect(releaseOutcome('none', { ...DEFAULTS, licenceRequired: true })).toBe(
      'block',
    );
  });
});

describe('recordedStatus', () => {
  it('passes every state a run can record', () => {
    for (const status of [
      'current',
      'expired',
      'not_in_force',
      'none',
    ] as const) {
      expect(recordedStatus(status)).toBe(status);
    }
  });

  it('refuses withdrawn, which is never released under', () => {
    expect(() => recordedStatus('withdrawn')).toThrow();
  });
});
