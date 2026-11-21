import { describe, expect, it } from 'vitest';

import { ENGLISH } from './catalogues';
import { formatDays, makeIntl } from './intl';

const PEOPLE = ['Owner', 'Olu Ade', 'Ada Byrne'];

describe('makeIntl', () => {
  it('joins an English list as Britain does, in any English region', () => {
    for (const tag of ['en', 'en-US', 'en-CA', 'en-GB']) {
      expect(makeIntl(tag, ENGLISH).formatList(PEOPLE)).toBe(
        'Owner, Olu Ade and Ada Byrne',
      );
    }
  });

  it('keeps the browser’s region for dates', () => {
    const day = new Date(Date.UTC(2026, 9, 10, 12));
    const options = {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    } as const;

    expect(makeIntl('en-US', ENGLISH).formatDate(day, options)).toBe('Oct 10');
    expect(makeIntl('en-GB', ENGLISH).formatDate(day, options)).toBe('10 Oct');
  });

  it('joins other languages their own way', () => {
    expect(makeIntl('fr-CA', ENGLISH).formatList(PEOPLE)).toBe(
      'Owner, Olu Ade et Ada Byrne',
    );
    expect(makeIntl('zh-Hans', ENGLISH).formatList(PEOPLE)).toBe(
      'Owner、Olu Ade 和 Ada Byrne',
    );
  });
});

/**
 * Every list the screens join, in Chinese: a space between a Latin name
 * and 和 or 或, none between two Chinese ones (ADR-090, #501).
 */
describe('a Chinese list', () => {
  const chinese = makeIntl('zh-Hans', ENGLISH);

  it('spaces two Latin names from 和 and 或', () => {
    const names = ['Mei Lin', 'David Park'];

    expect(chinese.formatList(names, { type: 'conjunction' })).toBe(
      'Mei Lin 和 David Park',
    );
    expect(chinese.formatList(names, { type: 'disjunction' })).toBe(
      'Mei Lin 或 David Park',
    );
  });

  it('runs two Chinese names into 和 and 或', () => {
    const names = ['李明', '王芳'];

    expect(chinese.formatList(names, { type: 'conjunction' })).toBe(
      '李明和王芳',
    );
    expect(chinese.formatList(names, { type: 'disjunction' })).toBe(
      '李明或王芳',
    );
  });

  it('spaces only the side a Latin name is on, and never 、', () => {
    expect(
      chinese.formatList(['李明', 'David Park'], { type: 'disjunction' }),
    ).toBe('李明或 David Park');
    expect(chinese.formatList(['Owner', 'Olu Ade', '王芳'])).toBe(
      'Owner、Olu Ade 和王芳',
    );
    expect(
      chinese.formatList(['D3-1000-120', 'D3-1000-121'], {
        type: 'conjunction',
        style: 'narrow',
      }),
    ).toBe('D3-1000-120、D3-1000-121');
  });

  it('gives its parts spaced, for names drawn as elements', () => {
    expect(
      chinese.formatListToParts(['Mei Lin', 'David Park'], {
        type: 'disjunction',
      }),
    ).toEqual([
      { type: 'element', value: 'Mei Lin' },
      { type: 'literal', value: ' 或 ' },
      { type: 'element', value: 'David Park' },
    ]);
  });
});

/**
 * Two days as one range (130b): Chinese the Chinese way, the year once,
 * as its single days read, 2026年11月20日, where ICU writes
 * "2026/11/1 – 2026/11/20"; English and French as Intl writes them.
 */
describe('formatDays', () => {
  const format = (locale: string, year: boolean) =>
    new Intl.DateTimeFormat(locale, {
      ...(year && { year: 'numeric' }),
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  const range = (locale: string, from: string, to: string, year = true) =>
    formatDays(format(locale, year), new Date(from), new Date(to));

  it('writes a Chinese range the Chinese way, the year once', () => {
    expect(range('zh-Hans', '2026-11-01', '2026-11-20')).toBe(
      '2026年11月1日至20日',
    );
    expect(range('zh-Hans', '2026-10-25', '2026-11-20')).toBe(
      '2026年10月25日至11月20日',
    );
    expect(range('zh-Hans', '2025-12-20', '2026-11-20')).toBe(
      '2025年12月20日至2026年11月20日',
    );
    // In a Chinese reader's own region too.
    expect(range('zh-Hans-CA', '2026-11-01', '2026-11-20')).toBe(
      '2026年11月1日至20日',
    );
  });

  it('writes one day as its single date reads', () => {
    expect(range('zh-Hans', '2026-11-20', '2026-11-20')).toBe(
      format('zh-Hans', true).format(new Date('2026-11-20')),
    );
    expect(range('zh-Hans', '2026-11-20', '2026-11-20')).toBe('2026年11月20日');
  });

  // A When period's days, beside its name.
  it('leaves the year out in Chinese where the format has none', () => {
    expect(range('zh-Hans', '2026-11-16', '2026-11-20', false)).toBe(
      '11月16日至20日',
    );
    expect(range('zh-Hans', '2026-10-25', '2026-11-20', false)).toBe(
      '10月25日至11月20日',
    );
    expect(range('zh-Hans', '2025-12-20', '2026-01-18', false)).toBe(
      '12月20日至1月18日',
    );
    expect(range('zh-Hans', '2026-11-20', '2026-11-20', false)).toBe(
      '11月20日',
    );
  });

  it('keeps English and French as Intl’s range writes them', () => {
    for (const locale of ['en', 'en-CA', 'fr-CA']) {
      for (const year of [true, false]) {
        for (const [from, to] of [
          ['2026-11-01', '2026-11-20'],
          ['2026-10-25', '2026-11-20'],
          ['2025-12-20', '2026-11-20'],
        ]) {
          expect(range(locale, from, to, year)).toBe(
            format(locale, year).formatRange(new Date(from), new Date(to)),
          );
        }
      }
    }
    expect(range('en', '2026-11-01', '2026-11-20')).toMatch(
      /^Nov 1\s?–\s?20, 2026$/,
    );
    expect(range('fr-CA', '2026-11-01', '2026-11-20')).toMatch(
      /^1\s?–\s?20 nov\. 2026$/,
    );
  });
});
