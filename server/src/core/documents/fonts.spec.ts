import { describe, expect, it } from 'vitest';

import { CHINESE, fontFor, LATIN, piecesOf } from './fonts';

describe('piecesOf', () => {
  it('draws English and French whole in Noto Sans', () => {
    expect(piecesOf('Facture / Invoice — 12,50 $ « reçu », œuvre')).toEqual([
      { text: 'Facture / Invoice — 12,50 $ « reçu », œuvre', font: LATIN },
    ]);
  });

  it('draws Chinese in Noto Sans SC, and cuts a line where the script changes', () => {
    expect(piecesOf('合计：')).toEqual([{ text: '合计：', font: CHINESE }]);
    // Ł is not in Noto Sans SC: drawn whole in it, it would print a box.
    expect(piecesOf('维生素 Łódź')).toEqual([
      { text: '维生素 ', font: CHINESE },
      { text: 'Łódź', font: LATIN },
    ]);
    expect(piecesOf('Vitamin C 维生素C')).toEqual([
      { text: 'Vitamin C ', font: LATIN },
      { text: '维生素', font: CHINESE },
      { text: 'C', font: LATIN },
    ]);
  });
});

describe('fontFor', () => {
  it('picks one family for a whole run, Noto Sans SC if any is Chinese', () => {
    expect(fontFor('DRAFT')).toBe(LATIN);
    expect(fontFor('草稿 / DRAFT')).toBe(CHINESE);
  });
});
