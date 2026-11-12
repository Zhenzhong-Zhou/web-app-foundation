import { describe, expect, it } from 'vitest';

import {
  browserLocale,
  formattingLocale,
  languageWord,
  matchLocale,
  SUPPORTED_LOCALES,
} from './locales';

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

/**
 * As the server's refusals name a language (`languageWord` in
 * server/src/i18n/translate.ts, whose test holds the same words), in the
 * app's language whatever region the browser formats in.
 */
describe('languageWord', () => {
  it('names each language by its language alone, in each', () => {
    expect(
      ['en', 'fr-CA', 'zh-Hans'].map((reader) =>
        SUPPORTED_LOCALES.map((language) => languageWord(language, reader)),
      ),
    ).toEqual([
      ['English', 'French', 'Chinese'],
      ['anglais', 'français', 'chinois'],
      ['英文', '法文', '中文'],
    ]);
  });

  it('reads a browser’s region as the app’s language', () => {
    expect(languageWord('zh-Hans', 'en-US')).toBe('Chinese');
    expect(languageWord('en', 'fr-FR')).toBe('anglais');
    expect(languageWord('fr-CA', 'zh-CN')).toBe('法文');
  });
});
