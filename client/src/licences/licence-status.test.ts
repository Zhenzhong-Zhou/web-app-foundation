import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProductLicence } from '../lib/types';
import { licenceStatus } from './licence-status';

/**
 * The same three days against the same "now" as the server's
 * licence-status.spec.ts (ADR-050). If the two ever disagree, the Licences
 * page and the recipe panel would show one state while release acts on
 * another.
 */
const NOW = new Date('2026-10-02T15:00:00.000Z');

const YESTERDAY = '2026-10-01T00:00:00.000Z';
const TODAY = '2026-10-02T00:00:00.000Z';
const TOMORROW = '2026-10-03T00:00:00.000Z';

function licence(over: Partial<ProductLicence> = {}): ProductLicence {
  return {
    id: 'licence-1',
    number: '80012345',
    authority: 'Health Canada',
    issuedAt: null,
    expiresAt: null,
    notes: null,
    isActive: true,
    ...over,
  };
}

describe('licenceStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads a licence with no dates as current', () => {
    expect(licenceStatus(licence()).label).toBe('Current');
  });

  it('reads withdrawn ahead of any date', () => {
    expect(
      licenceStatus(licence({ isActive: false, expiresAt: YESTERDAY })).label,
    ).toBe('Withdrawn');
  });

  it('is not in force until its issue day', () => {
    expect(licenceStatus(licence({ issuedAt: TOMORROW })).usable).toBe(false);
    expect(licenceStatus(licence({ issuedAt: TODAY })).usable).toBe(true);
    expect(licenceStatus(licence({ issuedAt: YESTERDAY })).usable).toBe(true);
  });

  it('is usable on its expiry day and expired the day after', () => {
    expect(licenceStatus(licence({ expiresAt: TOMORROW })).usable).toBe(true);
    expect(licenceStatus(licence({ expiresAt: TODAY })).label).toBe(
      'Expires today',
    );
    expect(licenceStatus(licence({ expiresAt: YESTERDAY })).label).toBe(
      'Expired',
    );
  });
});
