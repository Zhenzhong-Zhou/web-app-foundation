import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { MARK, MARK_SHAPE } from './src/theme/tokens.ts';
import { brandSettings, withTokens } from './vite.config.ts';

/**
 * ADR-082's settings as a build reads them, each with what it falls back
 * to, so a fork that sets none of them builds as it did.
 */
describe('brandSettings', () => {
  it('names the product in every language by VITE_APP_NAME when nothing else is set', () => {
    expect(brandSettings({ VITE_APP_NAME: 'Panivo' }, 2026).names).toEqual({
      en: 'Panivo',
      'fr-CA': 'Panivo',
      'zh-Hans': 'Panivo',
    });
  });

  it("takes a language's own name where it is set", () => {
    const { names } = brandSettings(
      { VITE_APP_NAME: 'Panivo', VITE_APP_NAME_ZH_HANS: '品桥' },
      2026,
    );

    expect(names).toEqual({
      en: 'Panivo',
      'fr-CA': 'Panivo',
      'zh-Hans': '品桥',
    });
  });

  it('reads French by its tag too, and leaves English to VITE_APP_NAME', () => {
    const { names } = brandSettings(
      {
        VITE_APP_NAME: 'Panivo',
        VITE_APP_NAME_FR_CA: 'Panivo Québec',
        VITE_APP_NAME_EN: 'Not read',
      },
      2026,
    );

    expect(names.en).toBe('Panivo');
    expect(names['fr-CA']).toBe('Panivo Québec');
  });

  it('falls back to the default name, as an empty setting in .env.example leaves it', () => {
    const { names } = brandSettings(
      { VITE_APP_NAME: '', VITE_APP_NAME_ZH_HANS: '' },
      2026,
    );

    expect(names.en).toBe('web-app-foundation');
    expect(names['zh-Hans']).toBe('web-app-foundation');
  });

  it("writes the © line with the build's year, and none without a holder", () => {
    expect(
      brandSettings({ VITE_COPYRIGHT_HOLDER: 'Zhenzhong (Bob) Zhou' }, 2027)
        .copyright,
    ).toBe('© 2027 Zhenzhong (Bob) Zhou');
    expect(brandSettings({}, 2027).copyright).toBeNull();
    expect(
      brandSettings({ VITE_COPYRIGHT_HOLDER: '' }, 2027).copyright,
    ).toBeNull();
  });

  it("puts a shared link's picture on the site's address, and none without one", () => {
    expect(
      brandSettings(
        { VITE_SITE_URL: 'https://web-app-foundation-client.onrender.com' },
        2026,
      ).picture,
    ).toBe('https://web-app-foundation-client.onrender.com/og-image.png');
    // A trailing slash makes no double one.
    expect(
      brandSettings({ VITE_SITE_URL: 'https://example.com/' }, 2026).picture,
    ).toBe('https://example.com/og-image.png');
    expect(brandSettings({}, 2026).picture).toBeNull();
  });

  it('stops the build on a site that is no address, rather than a card that points nowhere', () => {
    expect(() =>
      brandSettings(
        { VITE_SITE_URL: 'web-app-foundation-client.onrender.com' },
        2026,
      ),
    ).toThrow(/VITE_SITE_URL is web-app-foundation-client\.onrender\.com/);
    expect(() =>
      brandSettings({ VITE_SITE_URL: 'ftp://example.com' }, 2026),
    ).toThrow(/not the site's address/);
  });
});

/**
 * index.html's loading mark drawn from tokens.ts, as ProductMark is, so a
 * change to the accent or the mark reaches it too (ADR-082).
 */
describe('withTokens', () => {
  const html = readFileSync(
    path.join(import.meta.dirname, 'index.html'),
    'utf8',
  );

  it('leaves index.html no colour of its own', () => {
    expect(html).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(html).not.toMatch(/rgba?\(/);
  });

  it("fills in the mark's colours and shape, and the waits", () => {
    const filled = withTokens(html);

    expect(filled).toContain(
      `fill="${MARK.light.bowl}" d="${MARK_SHAPE.bowl}"`,
    );
    expect(filled).toContain(
      `fill="${MARK.light.stem}" d="${MARK_SHAPE.stem}"`,
    );
    expect(filled).toContain(`fill: ${MARK.onDark.bowl};`);
    expect(filled).toContain(`fill: ${MARK.onDark.stem};`);
    expect(filled).toContain('loading-mark-appears 0s 300ms forwards');
    expect(filled).toContain('loading-mark-appears 0s 550ms forwards');
    // Only the name's placeholder, the app-name plugin's, is left.
    expect(new Set(filled.match(/%[A-Z_]+%/g))).toEqual(
      new Set(['%APP_NAME%']),
    );
  });
});
