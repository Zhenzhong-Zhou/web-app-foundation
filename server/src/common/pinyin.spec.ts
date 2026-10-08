import { namePinyin } from './pinyin';

describe('namePinyin', () => {
  it('writes the full pinyin and the initials, without tones or spaces', () => {
    expect(namePinyin('深海鱼油')).toBe('shenhaiyuyou shyy');
    expect(namePinyin('明德药房')).toBe('mingdeyaofang mdyf');
  });

  it('keeps the Latin part of a mixed name in the full form', () => {
    expect(namePinyin('深海鱼油 Omega-3 软胶囊')).toBe(
      'shenhaiyuyouomega3ruanjiaonang shyyrjn',
    );
  });

  it('reads a character by the word it is in', () => {
    // 重 is chong in 重庆, zhong in 重量; 行 is hang in 银行.
    expect(namePinyin('重庆')).toBe('chongqing cq');
    expect(namePinyin('银行')).toBe('yinhang yh');
  });

  it('writes nothing for a name with no Chinese', () => {
    expect(namePinyin('Focus 60ct')).toBeNull();
    expect(namePinyin('Pharmacie Saint-Laurent')).toBeNull();
    expect(namePinyin('')).toBeNull();
    expect(namePinyin(null)).toBeNull();
  });
});
