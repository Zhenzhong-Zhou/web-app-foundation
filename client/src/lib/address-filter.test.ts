import { describe, expect, it } from 'vitest';

import { flagFromAddress, fromAddress } from './address-filter';

describe('fromAddress', () => {
  const allowed = ['open', 'confirmed', 'all'] as const;

  it('takes a value the list knows', () => {
    const params = new URLSearchParams('status=confirmed');
    expect(fromAddress(params, 'status', allowed, 'open')).toBe('confirmed');
  });

  it('ignores a missing or unknown value, opening as the list always does', () => {
    expect(
      fromAddress(new URLSearchParams(''), 'status', allowed, 'open'),
    ).toBe('open');
    expect(
      fromAddress(
        new URLSearchParams('status=nonsense'),
        'status',
        allowed,
        'open',
      ),
    ).toBe('open');
  });
});

describe('flagFromAddress', () => {
  it('is on only for 1', () => {
    expect(flagFromAddress(new URLSearchParams('expiring=1'), 'expiring')).toBe(
      true,
    );
    expect(
      flagFromAddress(new URLSearchParams('expiring=yes'), 'expiring'),
    ).toBe(false);
    expect(flagFromAddress(new URLSearchParams(''), 'expiring')).toBe(false);
  });
});
