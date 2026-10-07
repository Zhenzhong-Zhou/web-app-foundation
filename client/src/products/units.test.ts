import { createIntl } from 'react-intl';
import { afterEach, describe, expect, it } from 'vitest';

import { setFormatLocale } from '../lib/format';
import en from '../locales/en.json';
import fr from '../locales/fr-CA.json';
import zh from '../locales/zh-Hans.json';
import { displayWithUnit, withUnit } from './units';

const intlFor = (locale: string, messages: Record<string, string>) =>
  createIntl({ locale, messages, defaultLocale: 'en' });

describe('a quantity with its unit', () => {
  // The figure follows the app's language (format.ts), the word the intl
  // given; each test sets the first to match, and this puts it back.
  afterEach(() => setFormatLocale('en'));

  it('takes the unit’s plural in English where it has one', () => {
    const intl = intlFor('en', en);
    expect(displayWithUnit('1.0000', 'box', intl)).toBe('1 box');
    expect(displayWithUnit('600.0000', 'box', intl)).toBe('600 boxes');
    // "each" and abbreviations have one form.
    expect(displayWithUnit('600.0000', 'each', intl)).toBe('600 each');
    expect(displayWithUnit('2.5000', 'kg', intl)).toBe('2.5 kg');
  });

  it('follows French plural rules, singular below two', () => {
    setFormatLocale('fr-CA');
    const intl = intlFor('fr-CA', fr);
    expect(displayWithUnit('1.0000', 'each', intl)).toBe('1 unité');
    expect(displayWithUnit('600.0000', 'each', intl)).toBe('600 unités');
    expect(displayWithUnit('1.5000', 'litre', intl)).toMatch(/1,5\s?litre$/);
  });

  it('keeps one form in Chinese', () => {
    const intl = intlFor('zh-Hans', zh);
    expect(displayWithUnit('1.0000', 'each', intl)).toBe('1 个');
    expect(displayWithUnit('600.0000', 'each', intl)).toBe('600 个');
  });

  it('counts in fields too, with every decimal place kept', () => {
    const intl = intlFor('en', en);
    expect(withUnit('2.0000', 'case', intl)).toBe('2.0000 cases');
  });
});
