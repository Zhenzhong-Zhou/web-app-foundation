import { minorUnits } from './invoice-amounts';

/**
 * Where an invoice rounds to. Read from Intl rather than a table, so this
 * pins the three shapes a currency can have: the usual two places, none,
 * and three.
 */
describe('minorUnits', () => {
  it('is 2 for a currency with cents', () => {
    expect(minorUnits('CAD')).toBe(2);
    expect(minorUnits('USD')).toBe(2);
  });

  it('is 0 for a currency with no minor unit', () => {
    expect(minorUnits('JPY')).toBe(0);
  });

  it('is 3 for a currency with three places', () => {
    expect(minorUnits('KWD')).toBe(3);
  });
});
