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
});
