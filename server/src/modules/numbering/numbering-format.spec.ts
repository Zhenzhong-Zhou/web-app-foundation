import { describe, expect, it } from 'vitest';

import {
  couldPrintSame,
  fileNameOf,
  formatNumber,
  literalStart,
  patternOf,
  periodBounds,
  periodKey,
  periodOfParts,
  prefixProblem,
  printedLength,
  render,
} from './numbering-format';

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
});

describe('periods', () => {
  it('keys a day by its reset', () => {
    expect(periodKey('never', '2026-10-17')).toBe('');
    expect(periodKey('yearly', '2026-10-17')).toBe('2026');
    expect(periodKey('monthly', '2026-10-17')).toBe('2026-10');
    expect(periodKey('daily', '2026-10-17')).toBe('2026-10-17');
  });

  it('bounds a period by real days', () => {
    expect(periodBounds('never', '2026-10-17')).toBeNull();
    expect(periodBounds('yearly', '2026-10-17')).toEqual({
      from: '2026-01-01',
      before: '2027-01-01',
    });
    expect(periodBounds('monthly', '2026-12-05')).toEqual({
      from: '2026-12-01',
      before: '2027-01-01',
    });
    expect(periodBounds('daily', '2028-02-28')).toEqual({
      from: '2028-02-28',
      before: '2028-02-29',
    });
  });
});

describe('patternOf', () => {
  it('reads a number back into its date and counter', () => {
    const pattern = patternOf('INV-{YYYY}-');
    expect(pattern.read('INV-2026-0453')).toEqual({
      parts: { YYYY: '2026' },
      value: 453,
    });
    expect(pattern.read('INV-000453')).toBeNull();
    expect(pattern.read('INV-2026-04A')).toBeNull();
    expect(periodOfParts('yearly', { YY: '26' })).toBe('2026');
  });

  it('matches any width, so 0050 and 000050 are both 50', () => {
    const pattern = patternOf('SO-');
    expect(pattern.read('SO-0050')?.value).toBe(50);
    expect(pattern.read('SO-000050')?.value).toBe(50);
  });

  it('reads an empty prefix as digits only', () => {
    const pattern = patternOf('');
    expect(pattern.read('000123')?.value).toBe(123);
    expect(pattern.read('INV-000123')).toBeNull();
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

describe('small helpers', () => {
  it('takes the text before the first token', () => {
    expect(literalStart('INV-{YYYY}-')).toBe('INV-');
    expect(literalStart('{YYYY}-')).toBe('');
    expect(literalStart('SO-')).toBe('SO-');
  });

  it('writes / as _ in a file name', () => {
    expect(fileNameOf('INV/2026/00452')).toBe('INV_2026_00452');
  });
});
