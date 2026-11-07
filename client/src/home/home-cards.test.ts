import { createIntl } from 'react-intl';
import { describe, expect, it } from 'vitest';

import en from '../locales/en.json';
import { type KnownCard, tileWords } from './home-cards';

const intl = createIntl({ locale: 'en', messages: en, defaultLocale: 'en' });

const card = (over: Partial<KnownCard>): KnownCard => ({
  kind: 'toShip',
  count: 0,
  late: 0,
  hidden: false,
  anyPoint: null,
  ...over,
});

// Home's tile and Customise Home's card draw their badge and line from
// these, so a quiet tile is grey in both.
describe("a tile's words", () => {
  it('gives the badge its tone and the card its line, late, busy and quiet', () => {
    expect(tileWords(intl, card({ count: 4, late: 1 }), 30)).toMatchObject({
      tone: 'late',
      summary: '4 · 1 late',
    });
    expect(tileWords(intl, card({ count: 4 }), 30)).toMatchObject({
      tone: 'busy',
      summary: '4',
    });
    expect(tileWords(intl, card({ kind: 'returnsOpen' }), 30)).toMatchObject({
      tone: 'quiet',
      summary: 'No returns open',
    });
  });

  it('is not late for a kind that is never late', () => {
    expect(
      tileWords(intl, card({ kind: 'drafts', count: 2, late: 2 }), 30),
    ).toMatchObject({ tone: 'busy', summary: '2' });
  });
});
