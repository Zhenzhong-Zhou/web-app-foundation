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
 * and release act on another. The client's test pins the same three days
 * against the same "now".
 *
 * "Now" is mid-afternoon UTC, so a check that compared instants rather
 * than days would get today's boundary wrong in one direction or the other.
 */
const NOW = new Date('2026-10-02T15:00:00.000Z');

// Calendar days, as the `date` columns hold them (ADR-052).
const YESTERDAY = '2026-10-01';
const TODAY = '2026-10-02';
const TOMORROW = '2026-10-03';

function licence(over: Partial<LicenceDates> = {}): LicenceDates {
  return { isActive: true, issuedAt: null, expiresAt: null, ...over };
}

describe('licenceStatus', () => {
  it('reads a licence with no dates as current — an NPN does not expire', () => {
    expect(licenceStatus(licence(), NOW)).toBe('current');
  });

  it('reads withdrawn ahead of any date', () => {
    expect(
      licenceStatus(licence({ isActive: false, expiresAt: YESTERDAY }), NOW),
    ).toBe('withdrawn');
    expect(
      licenceStatus(licence({ isActive: false, issuedAt: TOMORROW }), NOW),
    ).toBe('withdrawn');
  });

  it('is not in force until its issue day', () => {
    expect(licenceStatus(licence({ issuedAt: TOMORROW }), NOW)).toBe(
      'not_in_force',
    );
    expect(licenceStatus(licence({ issuedAt: TODAY }), NOW)).toBe('current');
    expect(licenceStatus(licence({ issuedAt: YESTERDAY }), NOW)).toBe(
      'current',
    );
  });

  it('is current on its expiry day and expired the day after', () => {
    expect(licenceStatus(licence({ expiresAt: TOMORROW }), NOW)).toBe(
      'current',
    );
    expect(licenceStatus(licence({ expiresAt: TODAY }), NOW)).toBe('current');
    expect(licenceStatus(licence({ expiresAt: YESTERDAY }), NOW)).toBe(
      'expired',
    );
  });

  /**
   * Just after midnight UTC is still the previous evening west of
   * Greenwich. Comparing days in UTC keeps the answer the same wherever the
   * server runs.
   */
  it('changes day at midnight UTC', () => {
    const justAfter = new Date('2026-10-02T00:00:01.000Z');
    const justBefore = new Date('2026-10-01T23:59:59.000Z');

    expect(licenceStatus(licence({ expiresAt: YESTERDAY }), justAfter)).toBe(
      'expired',
    );
    expect(licenceStatus(licence({ expiresAt: YESTERDAY }), justBefore)).toBe(
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
