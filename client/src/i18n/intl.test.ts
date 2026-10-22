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
      'Owner、Olu Ade和Ada Byrne',
    );
  });
});
