import { localeOf, t, translate } from './translate';

/**
 * The server's language rules (ADR-054): which language a request asks
 * for, and that English comes out word for word whatever happens.
 */
describe('localeOf', () => {
  it('is English with no header, or nothing supported', () => {
    expect(localeOf(undefined)).toBe('en');
    expect(localeOf('')).toBe('en');
    expect(localeOf('de-DE,de;q=0.9')).toBe('en');
    expect(localeOf('*')).toBe('en');
  });

  it('takes the first supported language in order of preference', () => {
    expect(localeOf('fr-CA')).toBe('fr-CA');
    expect(localeOf('de;q=0.9,zh-Hans;q=0.8')).toBe('zh-Hans');
    expect(localeOf('en;q=0.5,fr;q=0.9')).toBe('fr-CA');
  });

  it('matches by language when the region differs', () => {
    expect(localeOf('fr-FR')).toBe('fr-CA');
    expect(localeOf('zh-CN')).toBe('zh-Hans');
    expect(localeOf('zh')).toBe('zh-Hans');
    expect(localeOf('en-GB')).toBe('en');
  });

  it('does not answer Traditional Chinese in Simplified', () => {
    expect(localeOf('zh-TW')).toBe('en');
    expect(localeOf('zh-Hant,fr;q=0.5')).toBe('fr-CA');
  });
});

describe('t and translate', () => {
  const thrown = t(
    {
      id: 'organizations.baseCurrencyFixed',
      defaultMessage:
        'Stock is already valued in {baseCurrency}, so the base currency cannot change',
    },
    { baseCurrency: 'CAD' },
  );

  it('writes the English at once, so logs and English readers see what they always did', () => {
    expect(thrown.message).toBe(
      'Stock is already valued in CAD, so the base currency cannot change',
    );
    expect(translate(thrown, 'en')).toBe(thrown.message);
  });

  it('renders the same id and values in another language', () => {
    expect(translate(thrown, 'fr-CA')).toContain('CAD');
    expect(translate(thrown, 'fr-CA')).not.toBe(thrown.message);
    expect(translate(thrown, 'zh-Hans')).toContain('CAD');
  });

  it('keeps the English when a catalogue lacks the id', () => {
    const unknown = t({
      id: 'test.unknown',
      defaultMessage: 'Only in English',
    });
    expect(translate(unknown, 'fr-CA')).toBe('Only in English');
  });
});
