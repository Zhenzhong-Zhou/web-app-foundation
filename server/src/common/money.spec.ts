import { minorUnits, readableMoney } from './money';

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

/**
 * Money in an export (ADR-093, 99a): at its currency's places, its padding
 * zeros trimmed down to them and never below, never rounded.
 */
describe('readableMoney', () => {
  it('trims the padding zeros down to the currency’s places', () => {
    expect(readableMoney('12.5000', 'CAD')).toBe('12.50');
    expect(readableMoney('20.000000', 'CAD')).toBe('20.00');
    expect(readableMoney('1250.0000', 'JPY')).toBe('1250');
    expect(readableMoney('1.5000', 'KWD')).toBe('1.500');
    expect(readableMoney('0.0000', 'CAD')).toBe('0.00');
  });

  it('keeps every place past them that holds a digit: never rounded', () => {
    expect(readableMoney('0.0125', 'CAD')).toBe('0.0125');
    expect(readableMoney('0.012345', 'CAD')).toBe('0.012345');
    expect(readableMoney('1250.5000', 'JPY')).toBe('1250.5');
  });

  it('keeps a minus', () => {
    expect(readableMoney('-12.5000', 'CAD')).toBe('-12.50');
    expect(readableMoney('-1250.0000', 'JPY')).toBe('-1250');
  });

  it('pads a figure written with fewer places than its currency’s', () => {
    expect(readableMoney('12.5', 'CAD')).toBe('12.50');
    expect(readableMoney('12', 'CAD')).toBe('12.00');
    expect(readableMoney('12', 'JPY')).toBe('12');
  });

  // As readableQuantity: read back from the end, never with /0+$/, whose
  // time grows with the square of a run of zeros before another digit.
  it('trims 100,000 zeros in under 100 ms, at the end or before a digit', () => {
    const zeros = '0'.repeat(100_000);

    const started = performance.now();
    const kept = readableMoney(`1.${zeros}1`, 'CAD');
    const trimmed = readableMoney(`1.${zeros}`, 'CAD');
    const took = performance.now() - started;

    expect(kept).toBe(`1.${zeros}1`);
    expect(trimmed).toBe('1.00');
    expect(took).toBeLessThan(100);
  });
});
