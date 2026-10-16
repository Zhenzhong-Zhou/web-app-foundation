import { describe, expect, it } from 'vitest';

import { formatMoney, formatUnitPrice, NO_VALUE } from './format';

describe('formatMoney', () => {
  it('formats the stored string, so a long figure is not rounded on the way', () => {
    // Through a Number this would print …876.55.
    expect(formatMoney('98765432109876.5432', 'CAD', 'en-CA')).toBe(
      '$98,765,432,109,876.54',
    );
    expect(formatMoney(null, 'CAD', 'en-CA')).toBe(NO_VALUE);
  });
});

describe('formatUnitPrice', () => {
  it('keeps the places the currency would hide, up to four, never fewer than its own', () => {
    expect(formatUnitPrice('0.0123', 'CAD', 'en-CA')).toBe('$0.0123');
    expect(formatUnitPrice('12.5000', 'CAD', 'en-CA')).toBe('$12.50');
    expect(formatUnitPrice('3', 'CAD', 'en-CA')).toBe('$3.00');
    expect(formatUnitPrice(null, 'CAD', 'en-CA')).toBe(NO_VALUE);
  });
});
