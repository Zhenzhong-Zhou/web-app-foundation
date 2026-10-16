import { describe, expect, it } from 'vitest';

import { CHINESE, fontFor, LATIN, piecesOf } from './fonts';

describe('piecesOf', () => {
  it('draws English and French whole in Noto Sans', () => {
    expect(piecesOf('Facture / Invoice — 12,50 $ « reçu », œuvre')).toEqual([
      { text: 'Facture / Invoice — 12,50 $ « reçu », œuvre', font: LATIN },
    ]);
  });

  it('keeps a Chinese line whole in Noto Sans SC, signs and Latin included', () => {
    expect(piecesOf('合计：')).toEqual([{ text: '合计：', font: CHINESE }]);
    // ≥ is in Noto Sans SC and not in Noto Sans: no box, no cut.
    expect(piecesOf('纯度≥99%')).toEqual([{ text: '纯度≥99%', font: CHINESE }]);
    expect(piecesOf('Vitamin C 维生素C')).toEqual([
      { text: 'Vitamin C ', font: LATIN },
      { text: '维生素C', font: CHINESE },
    ]);
  });

  it('cuts a line at a letter only Noto Sans has', () => {
    // Ł is not in Noto Sans SC: drawn in it, it would print a box.
    expect(piecesOf('维生素 Łódź')).toEqual([
      { text: '维生素 ', font: CHINESE },
      { text: 'Łódź', font: LATIN },
    ]);
  });
});

describe('fontFor', () => {
  it('picks one family for a whole run, the one that has it all', () => {
    expect(fontFor('DRAFT')).toBe(LATIN);
    expect(fontFor('草稿 / DRAFT')).toBe(CHINESE);
  });
});
