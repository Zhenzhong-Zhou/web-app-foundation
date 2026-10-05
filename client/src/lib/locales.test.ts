import { describe, expect, it } from 'vitest';

import { browserLocale, formattingLocale, matchLocale } from './locales';

describe('matchLocale', () => {
  it('reads any English, any French and Simplified Chinese', () => {
    expect(matchLocale('en-GB')).toBe('en');
    expect(matchLocale('fr')).toBe('fr-CA');
    expect(matchLocale('fr-FR')).toBe('fr-CA');
    expect(matchLocale('zh-CN')).toBe('zh-Hans');
    expect(matchLocale('zh')).toBe('zh-Hans');
  });

  it('declines Traditional Chinese, other languages and nonsense', () => {
    expect(matchLocale('zh-TW')).toBeNull();
    expect(matchLocale('zh-Hant')).toBeNull();
    expect(matchLocale('de-DE')).toBeNull();
    expect(matchLocale('not a tag')).toBeNull();
  });
});

describe('browserLocale', () => {
  it('takes the first language the app speaks, else English', () => {
    expect(browserLocale(['de-DE', 'zh-CN', 'en'])).toBe('zh-Hans');
    expect(browserLocale(['de-DE'])).toBe('en');
    expect(browserLocale([])).toBe('en');
  });
});

describe('formattingLocale', () => {
  it('keeps the browser’s region for the same language', () => {
    expect(formattingLocale('en', ['en-GB', 'fr-CA'])).toBe('en-GB');
    expect(formattingLocale('fr-CA', ['en-GB', 'fr-CA'])).toBe('fr-CA');
  });

  it('falls back to the language itself', () => {
    expect(formattingLocale('zh-Hans', ['en-US'])).toBe('zh-Hans');
    expect(formattingLocale('zh-Hans', ['zh-TW'])).toBe('zh-Hans');
  });
});
