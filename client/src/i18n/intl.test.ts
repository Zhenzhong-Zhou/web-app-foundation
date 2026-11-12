import { describe, expect, it } from 'vitest';

import { ENGLISH } from './catalogues';
import { makeIntl } from './intl';

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
