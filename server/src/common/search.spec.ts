import { searchTerms } from './search';

describe('searchTerms', () => {
  it('trims, reads inner spaces as one, and builds the patterns', () => {
    expect(searchTerms('  saint   laurent ')).toEqual({
      text: 'saint laurent',
      exact: 'saint laurent',
      prefix: 'saint laurent%',
      anywhere: '%saint laurent%',
      pinyin: '%saintlaurent%',
    });
  });

  it('escapes LIKE wildcards, so % and _ match themselves', () => {
    const terms = searchTerms('50%_off');
    expect(terms.anywhere).toBe('%50\\%\\_off%');
    expect(terms.prefix).toBe('50\\%\\_off%');
  });

  it('offers a pinyin pattern only for Latin letters and digits', () => {
    expect(searchTerms('Yu You').pinyin).toBe('%yuyou%');
    expect(searchTerms('鱼油').pinyin).toBeNull();
    expect(searchTerms('a').pinyin).toBeNull();
  });
});
