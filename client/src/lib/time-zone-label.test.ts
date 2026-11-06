import { afterEach, describe, expect, it, vi } from 'vitest';

import { ENGLISH, loadMessages } from '../i18n/catalogues';
import { makeIntl, setIntl } from '../i18n/intl';
import { type Locale, SUPPORTED_LOCALES } from './locales';
import { allTimeZones, cityOf } from './time-zone';
import { zoneLabel } from './time-zone-label';

/** The dash before the city: spaced in English and French, doubled in Chinese. */
const DASH: Record<Locale, string> = {
  en: ' — ',
  'fr-CA': ' — ',
  'zh-Hans': '——',
};

/**
 * A zone as people read it (ADR-072), as the server's zoneLabel says it.
 * The name is the browser's, and ICU renames zones (#343), so these check
 * the label's shape, never the name's words.
 */
describe('zoneLabel', () => {
  afterEach(() => {
    vi.useRealTimers();
    setIntl(makeIntl('en', ENGLISH));
  });

  it('names the zone, then its city after a dash', () => {
    expect(zoneLabel('America/Vancouver')).toMatch(/^\S.* — Vancouver$/);
    expect(zoneLabel('Asia/Calcutta')).toMatch(/^\S.* — Kolkata$/);
  });

  // UTC's generic name is an offset, GMT+00:00, which says nothing to a
  // reader (ADR-091's review): its long name, in words.
  it('names UTC in words, not as an offset', () => {
    expect(zoneLabel('UTC')).toBe('Coordinated Universal Time — UTC');
  });

  // On a winter day, when the browser's own names for some zones carry
  // brackets: Vancouver's, "Pacific Time (Canada)", since British Columbia
  // stayed on UTC−7 (#343). A city in brackets after it would double them.
  it('puts every city after the dash, never in brackets, in every zone and language', async () => {
    vi.useFakeTimers({
      now: new Date('2026-12-01T20:00:00.000Z'),
      toFake: ['Date'],
    });

    for (const locale of SUPPORTED_LOCALES) {
      setIntl(makeIntl(locale, await loadMessages(locale)));
      for (const zone of allTimeZones()) {
        const after = `${DASH[locale]}${cityOf(zone)}`;
        const label = zoneLabel(zone);

        expect(label.endsWith(after), label).toBe(true);
        expect(label.length).toBeGreaterThan(after.length);
        expect(label).not.toMatch(/[)）]\s*[(（]/);
      }
    }
  });
});
