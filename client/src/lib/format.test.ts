import { describe, expect, it } from 'vitest';

import { formatDay, formatQuantity, toApiDecimal } from './format';

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
