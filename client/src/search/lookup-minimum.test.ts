import { describe, expect, it } from 'vitest';

import { lookupLongEnough } from './lookup-minimum';

describe('lookupLongEnough', () => {
  it('takes two characters, in any script, after trimming', () => {
    expect(lookupLongEnough('bf')).toBe(true);
    expect(lookupLongEnough('鱼油')).toBe(true);
    expect(lookupLongEnough('  a ')).toBe(false);
    expect(lookupLongEnough('')).toBe(false);
  });

  it('takes one Chinese character alone, and no other one character', () => {
    expect(lookupLongEnough('鱼')).toBe(true);
    expect(lookupLongEnough(' 胶 ')).toBe(true);
    expect(lookupLongEnough('a')).toBe(false);
    expect(lookupLongEnough('é')).toBe(false);
    // Chinese punctuation and kana are not Han characters.
    expect(lookupLongEnough('，')).toBe(false);
    expect(lookupLongEnough('の')).toBe(false);
  });
});
