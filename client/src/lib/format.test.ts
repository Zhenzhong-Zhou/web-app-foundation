import { describe, expect, it } from 'vitest';

import {
  displayQuantity,
  formatDay,
  formatQuantity,
  toApiDecimal,
} from './format';

describe('formatDay', () => {
  /**
   * A calendar day arrives as YYYY-MM-DD (ADR-052). `new Date()` reads that
   * as UTC midnight, which in a zone west of UTC is the previous evening:
   * how 10 Oct once displayed as 9 Oct in Vancouver. formatDay reads it in
   * UTC, so the result cannot depend on where the test or the browser runs.
   */
  it('shows the day that was sent, in any timezone', () => {
    const shown = formatDay('2026-10-10');

    expect(shown).toContain('10');
    expect(shown).not.toContain('9 ');
    expect(shown).toContain('2026');
  });

  // Audit rows from before ADR-052 hold the instant, UTC midnight.
  it('reads an old UTC-midnight instant as the same day', () => {
    expect(formatDay('2026-10-10T00:00:00.000Z')).toBe(formatDay('2026-10-10'));
  });
});

describe('formatQuantity', () => {
  it('reads the same in English, with every digit kept', () => {
    expect(formatQuantity('35.0000', 'en')).toBe('35.0000');
    expect(formatQuantity('0.1234', 'zh-Hans')).toBe('0.1234');
  });

  it('swaps only the separator in French, never through a number', () => {
    expect(formatQuantity('35.0000', 'fr-CA')).toBe('35,0000');
    expect(formatQuantity('123456789012345.1234', 'fr-CA')).toBe(
      '123456789012345,1234',
    );
  });
});

describe('toApiDecimal', () => {
  it('sends a point whatever the language', () => {
    expect(toApiDecimal('1.5', 'en')).toBe('1.5');
    expect(toApiDecimal(' 1,5 ', 'fr-CA')).toBe('1.5');
    expect(toApiDecimal('1.5', 'fr-CA')).toBe('1.5');
  });

  it('refuses a grouping separator rather than guessing', () => {
    expect(toApiDecimal('1,234', 'en')).toBeNull();
    expect(toApiDecimal('1 234', 'fr-CA')).toBeNull();
    expect(toApiDecimal('1 234,5', 'fr-CA')).toBeNull();
    expect(toApiDecimal('1.234,5', 'fr-CA')).toBeNull();
  });
});

describe('displayQuantity', () => {
  it('drops padding zeros, and the point with them', () => {
    expect(displayQuantity('600.0000', 'en')).toBe('600');
    expect(displayQuantity('15.5000', 'en')).toBe('15.5');
    expect(displayQuantity('0.0000', 'en')).toBe('0');
    expect(displayQuantity('0.0125', 'en')).toBe('0.0125');
  });

  it('groups the whole number the language’s way', () => {
    expect(displayQuantity('1000.0000', 'en')).toBe('1,000');
    expect(displayQuantity('2175.0000', 'en')).toBe('2,175');
    expect(displayQuantity('1234567.2500', 'en')).toBe('1,234,567.25');
    expect(displayQuantity('999.0000', 'en')).toBe('999');
    // Intl's own grouping and decimal for French, whichever space it uses.
    expect(displayQuantity('1234.5000', 'fr-CA')).toBe(
      new Intl.NumberFormat('fr-CA').format(1234.5),
    );
  });

  it('keeps the sign', () => {
    expect(displayQuantity('-6.2500', 'en')).toBe('-6.25');
    expect(displayQuantity('-1500.0000', 'en')).toBe('-1,500');
  });

  /** The digits are never parsed, so none is lost past what JS can hold. */
  it('keeps every digit of a value too long for a JavaScript number', () => {
    expect(displayQuantity('12345678901234.0001', 'en')).toBe(
      '12,345,678,901,234.0001',
    );
  });
});
