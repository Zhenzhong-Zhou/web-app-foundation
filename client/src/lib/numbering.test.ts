import { describe, expect, it } from 'vitest';

import {
  commonFormats,
  couldPrintSame,
  formatNumber,
  lettersOf,
  nextPeriodStart,
  periodKey,
  prefixProblem,
} from './numbering';

/**
 * The same rules as the server's numbering-format.ts (ADR-073), so the
 * section refuses as the server would before Save is pressed.
 */
describe('numbering', () => {
  it('accepts and refuses prefixes as the server does', () => {
    expect(prefixProblem('INV-{YYYY}-', 4, 'yearly')).toBeNull();
    expect(prefixProblem('', 6, 'never')).toBeNull();
    expect(prefixProblem('inv-', 6, 'never')).toBe('characters');
    expect(prefixProblem('-INV', 6, 'never')).toBe('start');
    expect(prefixProblem('INV-{YYYY}', 6, 'never')).toBe('end');
    expect(prefixProblem('INV//', 6, 'never')).toBe('doubleSlash');
    expect(prefixProblem('INV-', 6, 'yearly')).toBe('resetNeedsDate');
    expect(prefixProblem('ABCDEFGHIJKLMNO-', 5, 'never')).toBe(
      'tooLongWithDigits',
    );
  });

  it('prints the next number as it will be taken', () => {
    expect(formatNumber('INV-{YYYY}-', 4, 453, '2026-10-17')).toBe(
      'INV-2026-0453',
    );
    expect(formatNumber('XS{YYYY}{MM}{DD}-', 3, 1, '2026-10-17')).toBe(
      'XS20261017-001',
    );
  });

  it('knows each period, and when the next one starts', () => {
    expect(periodKey('monthly', '2026-10-17')).toBe('2026-10');
    expect(nextPeriodStart('never', '2026-10-17')).toBeNull();
    expect(nextPeriodStart('yearly', '2026-10-17')).toBe('2027-01-01');
    expect(nextPeriodStart('monthly', '2026-12-17')).toBe('2027-01-01');
    expect(nextPeriodStart('daily', '2026-12-31')).toBe('2027-01-01');
  });

  it('sees two prefixes that could print the same', () => {
    expect(couldPrintSame('S{YY}-', 'S26-')).toBe(true);
    expect(couldPrintSame('', '')).toBe(true);
    expect(couldPrintSame('SO-', 'PO-')).toBe(false);
  });

  it('offers the common formats with the series’ letters, never a /', () => {
    expect(lettersOf('INV-{YYYY}-', 'INV')).toBe('INV');
    expect(lettersOf('{YYYY}-', 'SO')).toBe('SO');
    const formats = commonFormats('XS');
    expect(formats.map((format) => format.prefix)).toEqual([
      'XS-',
      'XS-{YYYY}-',
      'XS{YYYY}{MM}{DD}-',
    ]);
    expect(formats.every((format) => !format.prefix.includes('/'))).toBe(true);
    expect(
      formats.every(
        (format) =>
          prefixProblem(format.prefix, format.digits, format.reset) === null,
      ),
    ).toBe(true);
  });
});
