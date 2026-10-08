import { pinyin } from 'pinyin-pro';

/** Any CJK ideograph: the names worth a pinyin form. */
const CHINESE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u;

/**
 * A name's pinyin for search (ADR-056): the full syllables and the
 * initials, lower case, without tones or spaces, separated by one space.
 * "深海鱼油" gives "shenhaiyuyou shyy"; "深海鱼油 Omega-3" gives
 * "shenhaiyuyouomega3 shyy", so a query typed in Latin letters matches the
 * Chinese part and the rest alike.
 *
 * Null when the name has no Chinese: there is nothing to write, and the
 * name itself is already searched. Postgres cannot do this conversion,
 * which is why the server does it whenever a name is saved. A character
 * with two readings (多音字) takes the library's reading for the word; a
 * wrong one is a search that misses, not an error.
 */
export function namePinyin(name: string | null | undefined): string | null {
  if (!name || !CHINESE.test(name)) return null;

  const full = pinyin(name, {
    toneType: 'none',
    type: 'array',
    nonZh: 'consecutive',
  })
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  const initials = pinyin(name, {
    pattern: 'first',
    toneType: 'none',
    type: 'array',
    nonZh: 'removed',
  })
    .join('')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

  return `${full} ${initials}`;
}

/**
 * For an update that may or may not change the name: the pinyin column to
 * write alongside it when it does, and nothing when the name is not in the
 * update, so a change to something else leaves the pinyin as it was.
 */
export function pinyinOf(name: string | null | undefined): {
  namePinyin?: string | null;
} {
  return name === undefined ? {} : { namePinyin: namePinyin(name) };
}
