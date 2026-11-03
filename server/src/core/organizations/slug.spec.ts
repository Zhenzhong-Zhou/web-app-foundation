import { slugify } from './slug';

describe('slugify', () => {
  it('slugs a name of thousands of hyphens between letters with single hyphens', () => {
    const run = '-'.repeat(5000);

    expect(slugify(`${run}a${run}b${run}c${run}`)).toBe('a-b-c');
  });

  it('drops the hyphen a cut at 48 characters ends on', () => {
    expect(slugify(`${'a'.repeat(47)}-${'b'.repeat(10)}`)).toBe('a'.repeat(47));
  });
});
