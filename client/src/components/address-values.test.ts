import { describe, expect, it } from 'vitest';

import { addressBody, addressValues } from './address-values';

describe('addressBody', () => {
  // Left out, a cleared line was never logged, and a save that only
  // cleared one wrote no entry at all (ADR-018).
  it('sends a blank line as null, so the request says what it clears', () => {
    const values = {
      ...addressValues(null),
      line1: '100 Main St',
      line2: '',
      city: 'Vancouver',
      country: 'CA',
    };

    expect(addressBody(values)).toEqual({
      line1: '100 Main St',
      line2: null,
      city: 'Vancouver',
      region: null,
      postalCode: null,
      country: 'CA',
    });
    expect(JSON.parse(JSON.stringify(addressBody(values)))).toHaveProperty(
      'line2',
      null,
    );
  });
});
