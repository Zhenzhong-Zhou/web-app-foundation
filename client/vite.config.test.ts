// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MARK, MARK_SHAPE } from './src/theme/tokens.ts';
import viteConfig, {
  brandSettings,
  pseudoLanguageIn,
  sourceMapUpload,
  throwsOnPurposeIn,
  withTokens,
} from './vite.config.ts';

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

/**
 * The whole app asks a browser not to translate it (#245): it speaks
 * English, French and Chinese itself, and a browser's translation rewrites
 * the page React draws, data with the words.
 */
describe('index.html', () => {
  const html = readFileSync(
    path.join(import.meta.dirname, 'index.html'),
    'utf8',
  );

  it('asks a browser not to translate the app', () => {
    expect(html).toMatch(/<html [^>]*\btranslate="no"/);
    expect(html).toContain('<meta name="google" content="notranslate" />');
  });
});

/**
 * en-XA is for development and the browser tests only (ADR-054's November
 * 2026 amendment, R9): every production build stops when a chunk names it,
 * as the picker would to offer it, or holds src/i18n/pseudo.ts, which makes
 * it. `npm run build` runs the check on the real chunks.
 */
describe('pseudoLanguageIn', () => {
  const clean = {
    fileName: 'assets/index.js',
    code: 'const LOCALES = ["en", "fr-CA", "zh-Hans"];',
    modules: { '/app/client/src/lib/locales.ts': { renderedLength: 40 } },
  };

  it('finds nothing in a build without it', () => {
    expect(pseudoLanguageIn([clean])).toEqual([]);
  });

  it('names a chunk that names en-XA, as the picker would to offer it', () => {
    expect(
      pseudoLanguageIn([
        clean,
        { ...clean, fileName: 'assets/intl.js', code: 'x=["en","en-XA"]' },
      ]),
    ).toEqual(['assets/intl.js names en-XA']);
  });

  it('names a chunk that holds the code that makes it, but not one that dropped it', () => {
    const pseudo = '/app/client/src/i18n/pseudo.ts';

    expect(
      pseudoLanguageIn([
        { ...clean, modules: { [pseudo]: { renderedLength: 812 } } },
      ]),
    ).toEqual(['assets/index.js holds src/i18n/pseudo.ts']);
    expect(
      pseudoLanguageIn([
        { ...clean, modules: { [pseudo]: { renderedLength: 0 } } },
      ]),
    ).toEqual([]);
  });
});

/**
 * ADR-084's readable browser traces: hidden source maps uploaded to the
 * tracker under the release the reporter names, then deleted, only where
 * the upload's settings are, as on Render's static site.
 */
describe('sourceMapUpload', () => {
  const build = {
    build: '983c1d8f0e5a4b7c9d2e6f1a3b5c7d9e0f2a4b6c',
    builtAt: '2026-10-30T03:00:00.000Z',
    version: '0.7.0',
  };
  const settings = {
    SENTRY_AUTH_TOKEN: 'sntrys_token',
    SENTRY_ORG: 'panivo',
    SENTRY_PROJECT: 'panivo',
  };

  it('uploads nothing and writes no maps without the token, as in CI and on a laptop', () => {
    expect(sourceMapUpload({}, build)).toBeNull();
    expect(
      sourceMapUpload({ ...settings, SENTRY_AUTH_TOKEN: '' }, build),
    ).toBeNull();
  });

  it("uploads to the project under the reporter's release, then deletes the maps", () => {
    const upload = sourceMapUpload(settings, build);

    expect(upload).toMatchObject({
      authToken: 'sntrys_token',
      org: 'panivo',
      project: 'panivo',
      release: {
        name: '0.7.0+983c1d8f0e5a4b7c9d2e6f1a3b5c7d9e0f2a4b6c',
        inject: false,
        setCommits: false,
      },
      sourcemaps: {
        filesToDeleteAfterUpload: path.join(
          import.meta.dirname,
          'dist/**/*.map',
        ),
      },
      telemetry: false,
    });
  });

  it('logs a failed upload, and the build goes on', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { errorHandler } = sourceMapUpload(settings, build) ?? {};

    expect(() => errorHandler?.(new Error('401 Unauthorized'))).not.toThrow();
    expect(warn).toHaveBeenCalledWith(
      'Source maps not uploaded to Sentry. 401 Unauthorized',
    );
  });
});

/**
 * The browser suite's own build, `vite build --mode e2e` (ADR-008's
 * amendment for #530): a folder of its own, source maps and the build's
 * manifest, none of which a production build has, so the files that ship
 * are as they were.
 */
describe("the browser suite's build", () => {
  // The whole config, as `vite build` reads it, in Node: it reads its
  // files by their URL, which jsdom's would not give.
  const configFor = (mode: string) => viteConfig({ command: 'build', mode });
  // Its plugins' names, a plugin being one or an array of them.
  const pluginNames = (plugins: unknown): string[] =>
    Array.isArray(plugins)
      ? plugins.flatMap(pluginNames)
      : plugins && typeof plugins === 'object' && 'name' in plugins
        ? [String(plugins.name)]
        : [];

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('goes to a folder of its own, with source maps and the manifest', () => {
    expect(configFor('e2e').build).toMatchObject({
      outDir: 'dist-e2e',
      sourcemap: true,
      manifest: true,
    });
  });

  it('leaves a production build in dist/, with neither maps nor a manifest', () => {
    vi.stubEnv('SENTRY_AUTH_TOKEN', '');
    const { build } = configFor('production');

    // No outDir is Vite's own, dist/.
    expect(build?.outDir).toBeUndefined();
    expect(build?.sourcemap).toBe(false);
    expect(build?.manifest).toBeUndefined();
  });

  it('uploads nothing to the error tracker, even where the upload is set up', () => {
    vi.stubEnv('SENTRY_AUTH_TOKEN', 'sntrys_token');

    expect(
      pluginNames(configFor('e2e').plugins).filter((name) =>
        name.includes('sentry'),
      ),
    ).toEqual([]);
  });
});

type BundleHook = (this: unknown, options: unknown, bundle: unknown) => void;

/** Each plugin's generateBundle, a plugin being one or an array of them. */
const bundleHooks = (plugins: unknown): BundleHook[] =>
  Array.isArray(plugins)
    ? plugins.flatMap(bundleHooks)
    : plugins && typeof plugins === 'object' && 'generateBundle' in plugins
      ? [plugins.generateBundle as BundleHook]
      : [];

/**
 * Why the end of a build in `mode` stops on one chunk of `code`, as each
 * plugin's generateBundle runs over it, or null when it goes on.
 */
function whyTheBuildStops(mode: string, code: string): string | null {
  const bundle = {
    'assets/index.js': {
      type: 'chunk',
      fileName: 'assets/index.js',
      code,
      modules: {},
    },
  };
  const context = {
    emitFile: () => '',
    error: (message: string) => {
      throw new Error(message);
    },
  };
  try {
    for (const hook of bundleHooks(
      viteConfig({ command: 'build', mode }).plugins,
    )) {
      hook.call(context, {}, bundle);
    }
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

/**
 * en-XA by a setting of its own, __PSEUDO_LANGUAGE__ (ADR-054's amendment
 * for #530): on in `npm run dev` and in the browser suite's build, which
 * loads it in cut-text.spec.ts and languages.spec.ts, and off in every
 * other build, which still stops when a chunk carries it.
 */
describe('the pseudo-language', () => {
  const configFor = (command: 'build' | 'serve', mode: string) =>
    viteConfig({ command, mode });

  /** Why a build's end stops on a chunk that names en-XA, or null. */
  const stopsOnPseudoLanguage = (mode: string): string | null =>
    whyTheBuildStops(mode, 'x=["en","fr-CA","zh-Hans","en-XA"]');

  beforeEach(() => {
    // No upload's plugin, whose own end would reach the tracker.
    vi.stubEnv('SENTRY_AUTH_TOKEN', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is on in the dev server and the browser suite's build, and off in a production build", () => {
    expect(configFor('serve', 'development').define).toMatchObject({
      __PSEUDO_LANGUAGE__: 'true',
    });
    expect(configFor('build', 'e2e').define).toMatchObject({
      __PSEUDO_LANGUAGE__: 'true',
    });
    expect(configFor('build', 'production').define).toMatchObject({
      __PSEUDO_LANGUAGE__: 'false',
    });
  });

  it('stops a production build whose chunks carry it, naming where', () => {
    expect(stopsOnPseudoLanguage('production')).toMatch(
      /carries the pseudo-language, .*: assets\/index\.js names en-XA\./,
    );
  });

  it("lets the browser suite's build carry it", () => {
    expect(stopsOnPseudoLanguage('e2e')).toBeNull();
  });
});

/**
 * The page that throws as it draws, on purpose, where the browser suite
 * reaches the crash page before sign-in (ADR-008's amendment for #530):
 * __THROWS_ON_PURPOSE__, on where en-XA is, and every other build stops
 * when a chunk carries the page or its address.
 */
describe('the page that throws on purpose', () => {
  const clean = {
    fileName: 'assets/index.js',
    code: 'const routes = ["/login", "/register"];',
    modules: { '/app/client/src/App.tsx': { renderedLength: 40 } },
  };
  const page = '/app/client/src/errors/throws-on-purpose-page.tsx';

  beforeEach(() => {
    vi.stubEnv('SENTRY_AUTH_TOKEN', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('finds nothing in a build without it', () => {
    expect(throwsOnPurposeIn([clean])).toEqual([]);
  });

  it('names a chunk that names its address, or holds its code, but not one that dropped it', () => {
    expect(
      throwsOnPurposeIn([{ ...clean, code: 'path:`/throws-on-purpose`' }]),
    ).toEqual(['assets/index.js names /throws-on-purpose']);
    expect(
      throwsOnPurposeIn([
        { ...clean, modules: { [page]: { renderedLength: 120 } } },
      ]),
    ).toEqual(['assets/index.js holds src/errors/throws-on-purpose-page.tsx']);
    expect(
      throwsOnPurposeIn([
        { ...clean, modules: { [page]: { renderedLength: 0 } } },
      ]),
    ).toEqual([]);
  });

  it("is on in the dev server and the browser suite's build, and off in a production build", () => {
    expect(
      viteConfig({ command: 'serve', mode: 'development' }).define,
    ).toMatchObject({ __THROWS_ON_PURPOSE__: 'true' });
    expect(viteConfig({ command: 'build', mode: 'e2e' }).define).toMatchObject({
      __THROWS_ON_PURPOSE__: 'true',
    });
    expect(
      viteConfig({ command: 'build', mode: 'production' }).define,
    ).toMatchObject({ __THROWS_ON_PURPOSE__: 'false' });
  });

  it("stops a production build whose chunks carry it, naming where, and lets the browser suite's carry it", () => {
    const route = 'x={path:"/throws-on-purpose"}';

    expect(whyTheBuildStops('production', route)).toMatch(
      /carries the page that throws on purpose, .*: assets\/index\.js names \/throws-on-purpose\./,
    );
    expect(whyTheBuildStops('e2e', route)).toBeNull();
  });
});
