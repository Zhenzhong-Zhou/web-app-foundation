import { describe, expect, it } from 'vitest';

import { atOrBelowZero, barFill, choiceOf } from './reorder-points';

describe('atOrBelowZero', () => {
  it('reads zero and below on the text', () => {
    expect(atOrBelowZero('0.0000')).toBe(true);
    expect(atOrBelowZero('-12.5000')).toBe(true);
    expect(atOrBelowZero('0.0001')).toBe(false);
    expect(atOrBelowZero('800.0000')).toBe(false);
  });
});

describe('barFill', () => {
  it('puts the point at the middle of a scale twice its size', () => {
    expect(barFill('96.0000', '96.0000')).toBe(50);
    expect(barFill('58.0000', '96.0000')).toBe(30);
    expect(barFill('800.0000', '2000.0000')).toBe(20);
  });

  it('fills nothing at zero or less, and all of it past twice the point', () => {
    expect(barFill('0.0000', '100.0000')).toBe(0);
    expect(barFill('-40.0000', '100.0000')).toBe(0);
    expect(barFill('500.0000', '100.0000')).toBe(100);
  });

  it('keeps a fraction exact, never through a double', () => {
    // 0.3 of a point of 0.6 is a quarter of the scale.
    expect(barFill('0.3000', '0.6000')).toBe(25);
  });
});

describe('choiceOf', () => {
  const low = {
    source: 'bought' as const,
    status: 'low' as const,
    drafted: false,
    suggestion: '96.0000',
  };

  it('gives a box to a bought item low or out with something to suggest', () => {
    expect(choiceOf(low)).toBe('open');
    expect(choiceOf({ ...low, status: 'out' })).toBe('open');
  });

  it('shows a drafted one disabled, so nobody orders it twice', () => {
    expect(choiceOf({ ...low, drafted: true, suggestion: '0.0000' })).toBe(
      'drafted',
    );
  });

  it('gives none to a made item, one with enough, or a discontinued one', () => {
    expect(choiceOf({ ...low, source: 'made' })).toBe('none');
    expect(choiceOf({ ...low, status: 'enough' })).toBe('none');
    expect(choiceOf({ ...low, status: 'discontinued' })).toBe('none');
  });
});
