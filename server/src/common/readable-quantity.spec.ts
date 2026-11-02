import { readableQuantity } from './readable-quantity';

describe('readableQuantity', () => {
  it('drops the padding zeros after the point, and the point with them', () => {
    expect(readableQuantity('30.0000')).toBe('30');
    expect(readableQuantity('40.5000')).toBe('40.5');
    expect(readableQuantity('0.0001')).toBe('0.0001');
  });

  it('leaves a whole number and its zeros alone', () => {
    expect(readableQuantity('100')).toBe('100');
    expect(readableQuantity('1000.0000')).toBe('1000');
    expect(readableQuantity('0.0000')).toBe('0');
  });

  // A run of zeros before another digit was retried from each of its zeros
  // under /0+$/, so the time grew with the square of the run: about 4 s for
  // 100,000 (CodeQL's js/polynomial-redos on #361). The routes send 19
  // characters at most, but the helper is shared.
  it('trims 100,000 zeros in under 100 ms, at the end or before a digit', () => {
    const zeros = '0'.repeat(100_000);

    const started = performance.now();
    const kept = readableQuantity(`1.${zeros}1`);
    const trimmed = readableQuantity(`1.${zeros}`);
    const took = performance.now() - started;

    expect(kept).toBe(`1.${zeros}1`);
    expect(trimmed).toBe('1');
    expect(took).toBeLessThan(100);
  });
});
