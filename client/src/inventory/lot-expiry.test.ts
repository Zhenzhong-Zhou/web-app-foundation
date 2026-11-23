import { createIntl } from 'react-intl';
import { describe, expect, it } from 'vitest';

import en from '../locales/en.json';
import zh from '../locales/zh-Hans.json';
import { lotExpiry, lotExpiryPart } from './lot-expiry';

const intlFor = (locale: string, messages: Record<string, string>) =>
  createIntl({ locale, messages, defaultLocale: 'en' });

const DATED = { expiresAt: '2026-10-01', expiry: 'date' } as const;
const UNKNOWN = { expiresAt: null, expiry: 'unknown' } as const;
const NONE = { expiresAt: null, expiry: 'none' } as const;

// ADR-094, D2: one wording for a lot's expiry, an expiry not known yet
// "Expiry to add", never "No expiry".
describe('a lot’s expiry in words', () => {
  it('says beside a code its day, Expiry to add while it is not known, and No expiry for one that does not expire', () => {
    const intl = intlFor('en', en);

    expect(lotExpiry(DATED, intl)).toBe('Expires Oct 1, 2026');
    expect(lotExpiry(UNKNOWN, intl)).toBe('Expiry to add');
    expect(lotExpiry(NONE, intl)).toBe('No expiry');
    // A read that has no kind, given as null: a lot with no day does not
    // expire, as every lot read before ADR-094.
    expect(lotExpiry({ expiresAt: null, expiry: null }, intl)).toBe(
      'No expiry',
    );
  });

  it('says as part of a line its day or expiry to add, and nothing for one that does not expire', () => {
    const intl = intlFor('en', en);

    expect(lotExpiryPart(DATED, intl)).toBe('expires Oct 1, 2026');
    expect(lotExpiryPart(UNKNOWN, intl)).toBe('expiry to add');
    expect(lotExpiryPart(NONE, intl)).toBeNull();
  });

  it('keeps the glossary’s words in Chinese', () => {
    const intl = intlFor('zh-Hans', zh);

    expect(lotExpiry(UNKNOWN, intl)).toBe('待补有效期');
    expect(lotExpiryPart(UNKNOWN, intl)).toBe('待补有效期');
    expect(lotExpiry(NONE, intl)).toBe('无有效期');
  });
});
