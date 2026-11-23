import { describe, expect, it } from 'vitest';

import {
  commonFormats,
  couldPrintSame,
  formatNumber,
  lettersOf,
  nextPeriodStart,
  periodKey,
  prefixProblem,
  printedLength,
  render,
  roomWithin20,
} from './numbering';

/**
 * The same rules as the server's numbering-format.ts (ADR-073), with its
 * tests case for case, so the section refuses as the server would before
 * Save is pressed.
 */
describe('prefixProblem', () => {
  it.each([
    ['INV-', 6, 'never'],
    ['', 6, 'never'],
    ['INV-{YYYY}-', 4, 'yearly'],
    ['INV/{YYYY}/', 5, 'yearly'],
    ['{YYYY}{MM}{DD}-', 3, 'daily'],
    ['XS{YYYY}{MM}{DD}-', 3, 'daily'],
    ['F{YY}{MM}_', 4, 'monthly'],
    // A date with no reset: the counter carries on, the date is shown.
    ['INV-{YYYY}-', 6, 'never'],
  ] as const)('accepts %s with %i digits, %s', (prefix, digits, reset) => {
    expect(prefixProblem(prefix, digits, reset)).toBeNull();
  });

  it.each([
    ['inv-', 'characters'],
    ['INV.', 'characters'],
    ['INV+', 'characters'],
    ['INV-{yyyy}-', 'characters'],
    ['INV-{Q}-', 'characters'],
    ['INV-{YYYY', 'characters'],
    ['-INV', 'start'],
    ['/INV-', 'start'],
    ['INV1', 'end'],
    ['INV-{YYYY}', 'end'],
    ['INV//', 'doubleSlash'],
    ['A{YYYY}-{YYYY}-', 'repeated'],
    ['A{YYYY}{YY}-', 'repeated'],
    ['ABCDEFGHIJKLMNOPQ', 'tooLong'],
  ] as const)('refuses %s: %s', (prefix, problem) => {
    expect(prefixProblem(prefix, 4, 'never')).toBe(problem);
  });

  it('counts the digits towards 20', () => {
    expect(prefixProblem('ABCDEFGHIJKLMNO-', 4, 'never')).toBeNull();
    expect(prefixProblem('ABCDEFGHIJKLMNO-', 5, 'never')).toBe(
      'tooLongWithDigits',
    );
  });

  describe('for a lot’s code made here (ADR-094)', () => {
    it('accepts the default, L-2026-11-21-1, and reads as a document’s would', () => {
      expect(
        prefixProblem('L-{YYYY}-{MM}-{DD}-', 1, 'daily', 'lot'),
      ).toBeNull();
      expect(prefixProblem('LOT{YY}{MM}-', 4, 'monthly', 'lot')).toBeNull();
      expect(prefixProblem('L1', 4, 'never', 'lot')).toBe('end');
      expect(prefixProblem('L-{YYYY}-', 4, 'daily', 'lot')).toBe(
        'resetNeedsDate',
      );
    });

    it('prints at most 20 characters with its digits', () => {
      // L-2026-11-21- is 13 characters: with 7 digits 20, with 8 21.
      expect(
        prefixProblem('L-{YYYY}-{MM}-{DD}-', 7, 'daily', 'lot'),
      ).toBeNull();
      expect(prefixProblem('L-{YYYY}-{MM}-{DD}-', 8, 'daily', 'lot')).toBe(
        'tooLongWithDigits',
      );
    });

    it.each(['L_', 'L/{YYYY}/', 'l-', 'L.', 'LOT-{yyyy}-'])(
      'refuses %s, holding only capitals, digits, hyphens and the date',
      (prefix) => {
        expect(prefixProblem(prefix, 4, 'never', 'lot')).toBe('lotCharacters');
      },
    );

    it('leaves a document’s prefix its _ and /', () => {
      expect(prefixProblem('L_', 4, 'never')).toBeNull();
      expect(prefixProblem('L/{YYYY}/', 4, 'never')).toBeNull();
    });
  });

  it('wants the period of a reset in the prefix', () => {
    expect(prefixProblem('INV-', 4, 'yearly')).toBe('resetNeedsDate');
    expect(prefixProblem('INV-{YY}-', 4, 'yearly')).toBeNull();
    expect(prefixProblem('INV-{YYYY}-', 4, 'monthly')).toBe('resetNeedsDate');
    expect(prefixProblem('INV-{YYYY}{MM}-', 4, 'daily')).toBe('resetNeedsDate');
  });
});

describe('printing', () => {
  it('prints the date in place of each token', () => {
    expect(render('INV-{YYYY}-', '2026-10-17')).toBe('INV-2026-');
    expect(render('SO{YY}{MM}{DD}-', '2026-10-17')).toBe('SO261017-');
    expect(printedLength('SO{YYYY}{MM}{DD}-')).toBe(11);
  });

  it('pads to the width and grows past it', () => {
    expect(formatNumber('INV-', 6, 453, '2026-10-17')).toBe('INV-000453');
    expect(formatNumber('INV-', 6, 1_000_000, '2026-10-17')).toBe(
      'INV-1000000',
    );
    expect(formatNumber('', 3, 7, '2026-10-17')).toBe('007');
  });

  it('prints the next number as it will be taken', () => {
    expect(formatNumber('INV-{YYYY}-', 4, 453, '2026-10-17')).toBe(
      'INV-2026-0453',
    );
    expect(formatNumber('XS{YYYY}{MM}{DD}-', 3, 1, '2026-10-17')).toBe(
      'XS20261017-001',
    );
    expect(formatNumber('L-{YYYY}-{MM}-{DD}-', 1, 1, '2026-11-21')).toBe(
      'L-2026-11-21-1',
    );
  });
});

describe('periods', () => {
  it('keys a day by its reset', () => {
    expect(periodKey('never', '2026-10-17')).toBe('');
    expect(periodKey('yearly', '2026-10-17')).toBe('2026');
    expect(periodKey('monthly', '2026-10-17')).toBe('2026-10');
    expect(periodKey('daily', '2026-10-17')).toBe('2026-10-17');
  });

  it('knows when the next period starts, by real days', () => {
    expect(nextPeriodStart('never', '2026-10-17')).toBeNull();
    expect(nextPeriodStart('yearly', '2026-10-17')).toBe('2027-01-01');
    expect(nextPeriodStart('monthly', '2026-12-05')).toBe('2027-01-01');
    expect(nextPeriodStart('daily', '2026-12-31')).toBe('2027-01-01');
    expect(nextPeriodStart('daily', '2028-02-28')).toBe('2028-02-29');
  });
});

describe('couldPrintSame', () => {
  it.each([
    ['SO-', 'SO-', true],
    ['', '', true],
    ['S{YY}-', 'S26-', true],
    ['{YYYY}-', '2026-', true],
    ['SO-', 'PO-', false],
    ['S{YY}-', 'SA2-', false],
    ['INV-', 'INV-{YYYY}-', false],
    ['', 'A-', false],
  ] as const)('%s and %s: %s', (a, b, same) => {
    expect(couldPrintSame(a, b)).toBe(same);
    expect(couldPrintSame(b, a)).toBe(same);
  });
});

describe('the common formats', () => {
  it('offers them with the series’ letters, never a /', () => {
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

  it('offers a lot’s default as its each day, every one a lot’s own (ADR-094)', () => {
    const formats = commonFormats('L', 'lot');
    expect(
      formats.map((format) =>
        formatNumber(format.prefix, format.digits, 1, '2026-11-21'),
      ),
    ).toEqual(['L-000001', 'L-2026-0001', 'L-2026-11-21-1']);
    expect(
      formats.every(
        (format) =>
          prefixProblem(format.prefix, format.digits, format.reset, 'lot') ===
          null,
      ),
    ).toBe(true);
  });
});

describe('roomWithin20 (ADR-094’s D1)', () => {
  it('leaves the default room for 9,999,999 codes, whatever its digits', () => {
    // L-2026-11-21- prints 13 characters: 7 are left.
    expect(roomWithin20('L-{YYYY}-{MM}-{DD}-')).toEqual({
      codes: 9_999_999n,
      short: false,
    });
  });

  it('counts past what a JavaScript number holds, for a short prefix', () => {
    expect(roomWithin20('L-').codes).toBe(999_999_999_999_999_999n);
    expect(roomWithin20('').codes).toBe(10n ** 20n - 1n);
  });

  it('is short at 999, and not at 9,999, the least a prefix may leave', () => {
    // 17 characters printed: refused today, since a prefix prints at most 16.
    expect(roomWithin20('ABCDEFGHIJKLMNOP-')).toEqual({
      codes: 999n,
      short: true,
    });
    expect(roomWithin20('ABCDEFGHIJKLMNO-')).toEqual({
      codes: 9_999n,
      short: false,
    });
  });
});
