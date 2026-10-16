import { describe, expect, it } from 'vitest';

import { CHINESE, fontFor, LATIN } from './fonts';

describe('fontFor', () => {
  it('draws English and French in Noto Sans', () => {
    expect(fontFor('Facture / Invoice — 12,50 $ « reçu », œuvre')).toBe(LATIN);
  });

  it('draws a run holding any Chinese in Noto Sans SC', () => {
    expect(fontFor('Vitamin C 维生素C')).toBe(CHINESE);
    expect(fontFor('合计：')).toBe(CHINESE);
  });
});
