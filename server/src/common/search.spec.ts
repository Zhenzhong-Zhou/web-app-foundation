import { lookupLongEnough, searchTerms } from './search';

describe('searchTerms', () => {
  it('trims, reads inner spaces as one, and builds the patterns', () => {
    expect(searchTerms('  saint   laurent ')).toEqual({
      text: 'saint laurent',
      exact: 'saint laurent',
      prefix: 'saint laurent%',
      anywhere: '%saint laurent%',
      pinyinText: 'saintlaurent',
      pinyin: '%saintlaurent%',
      hasWords: true,
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

  it('folds pinyin’s tone marks, keeping ü out as the stored pinyin does', () => {
    expect(searchTerms('zhuānzhù').pinyinText).toBe('zhuanzhu');
    expect(searchTerms('Shēn Hǎi').pinyinText).toBe('shenhai');
    // namePinyin writes 绿色 as "lse": ü is not a letter it keeps.
    expect(searchTerms('lǜsè').pinyinText).toBe('lse');
  });

  it('reads full-width letters, digits, punctuation and spaces as their usual forms', () => {
    expect(searchTerms('ＦＯＣ－２６０９')).toMatchObject({
      text: 'FOC-2609',
      anywhere: '%FOC-2609%',
      pinyinText: 'foc2609',
    });
    expect(searchTerms('ｚｈｕａｎ\u3000ｚｈｕ')).toMatchObject({
      text: 'zhuan zhu',
      pinyinText: 'zhuanzhu',
    });
  });

  it('knows a query of punctuation alone has nothing to match a name with', () => {
    expect(searchTerms('--').hasWords).toBe(false);
    expect(searchTerms('鱼油').hasWords).toBe(true);
    expect(searchTerms('50%').hasWords).toBe(true);
  });
});

describe('lookupLongEnough', () => {
  it('takes two characters, in any script, after trimming', () => {
    expect(lookupLongEnough('bf')).toBe(true);
    expect(lookupLongEnough('鱼油')).toBe(true);
    expect(lookupLongEnough('é1')).toBe(true);
    expect(lookupLongEnough('  a ')).toBe(false);
    expect(lookupLongEnough('')).toBe(false);
  });

  it('takes one Chinese character alone, and no other one character', () => {
    expect(lookupLongEnough('鱼')).toBe(true);
    expect(lookupLongEnough(' 胶 ')).toBe(true);
    // A character beyond the first plane is one character, two code units.
    expect(lookupLongEnough('𠀋')).toBe(true);
    expect(lookupLongEnough('a')).toBe(false);
    expect(lookupLongEnough('7')).toBe(false);
    expect(lookupLongEnough('é')).toBe(false);
    // Chinese punctuation and kana are not Han characters.
    expect(lookupLongEnough('，')).toBe(false);
    expect(lookupLongEnough('の')).toBe(false);
  });
});
