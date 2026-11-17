import { describe, expect, it } from 'vitest';

import { fromScaled, isZero, sumDecimals, toScaled } from './decimal';

describe('sumDecimals', () => {
  it('adds exactly where a double would not', () => {
    // 0.1 + 0.2 is 0.30000000000000004 as numbers (ADR-025).
    expect(fromScaled(sumDecimals(['0.1', '0.2'])!)).toBe('0.3000');
  });

  it('matches the server value however the amounts were typed', () => {
    expect(sumDecimals(['100', '200.0000'])).toBe(toScaled('300.0000'));
  });

  it('treats a blank field as zero', () => {
    expect(sumDecimals(['', '5'])).toBe(toScaled('5'));
  });

  it('refuses anything that is not a plain decimal of four places or fewer', () => {
    expect(sumDecimals(['abc'])).toBeNull();
    expect(sumDecimals(['-1'])).toBeNull();
    expect(sumDecimals(['1.23456'])).toBeNull();
  });
});

describe('fromScaled', () => {
  it('pads small values to four places', () => {
    expect(fromScaled(5n)).toBe('0.0005');
    expect(fromScaled(0n)).toBe('0.0000');
  });
});

describe('isZero', () => {
  // However the API writes nothing, never by its text (review 26).
  it('says nothing is zero, however many places it is written with', () => {
    expect(isZero('0.0000')).toBe(true);
    expect(isZero('0')).toBe(true);
    expect(isZero('0.00')).toBe(true);
    expect(isZero('0.0001')).toBe(false);
    expect(isZero('12.0000')).toBe(false);
    // A negative position is not nothing.
    expect(isZero('-20.0000')).toBe(false);
  });
});
