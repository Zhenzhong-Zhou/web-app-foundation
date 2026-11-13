import { createIntl } from 'react-intl';
import { describe, expect, it } from 'vitest';

import en from '../locales/en.json';
import fr from '../locales/fr-CA.json';
import zh from '../locales/zh-Hans.json';
import { homeCard } from '../test/factories';
import { CARDS, tileWords } from './home-cards';

const intlFor = (locale: string, messages: Record<string, string>) =>
  createIntl({ locale, messages, defaultLocale: 'en' });
const intl = intlFor('en', en);

// Home's tile and Customise Home's card draw their badge and line from
// these, so a quiet tile is grey in both.
describe("a tile's words", () => {
  it('gives the badge its tone and the card its line, late, busy and quiet', () => {
    expect(tileWords(intl, homeCard({ count: 4, late: 1 }), 30)).toMatchObject({
      tone: 'late',
      summary: '4 · 1 late',
    });
    expect(tileWords(intl, homeCard({ count: 4 }), 30)).toMatchObject({
      tone: 'busy',
      summary: '4',
    });
    expect(
      tileWords(intl, homeCard({ kind: 'returnsOpen' }), 30),
    ).toMatchObject({
      tone: 'quiet',
      summary: 'No returns open',
    });
  });

  it('is not late for a kind that is never late', () => {
    expect(
      tileWords(intl, homeCard({ kind: 'drafts', count: 2, late: 2 }), 30),
    ).toMatchObject({ tone: 'busy', summary: '2' });
  });
});

// Under the red panel while Home is customised: a hidden tile's late items,
// by number, one in the singular, in each language.
describe("a hidden tile's late line", () => {
  const said = (
    locale: string,
    messages: Record<string, string>,
    kind: 'toShip' | 'lowStock',
    count: number,
  ) => {
    const words = intlFor(locale, messages);
    return words.formatMessage(CARDS[kind].late!.hidden, {
      name: tileWords(words, homeCard({ kind, count, late: count }), 30).title,
      count,
    });
  };

  it('says one late item in the singular, with its number', () => {
    expect(said('en', en, 'toShip', 1)).toBe(
      'To ship is hidden; its 1 late order still shows here',
    );
    expect(said('en', en, 'lowStock', 1)).toBe(
      'Low stock is hidden; its 1 item out of stock still shows here',
    );
    expect(said('fr-CA', fr, 'toShip', 1)).toBe(
      'La tuile À expédier est masquée; 1 commande en retard reste ici',
    );
    expect(said('zh-Hans', zh, 'toShip', 1)).toBe(
      '“待发货”已隐藏，但其 1 个逾期订单仍会显示在这里',
    );
  });

  it('says more than one in the plural', () => {
    expect(said('en', en, 'toShip', 2)).toBe(
      'To ship is hidden; its 2 late orders still show here',
    );
    expect(said('fr-CA', fr, 'toShip', 2)).toBe(
      'La tuile À expédier est masquée; ses 2 commandes en retard restent ici',
    );
    expect(said('zh-Hans', zh, 'toShip', 2)).toBe(
      '“待发货”已隐藏，但其 2 个逾期订单仍会显示在这里',
    );
  });
});
