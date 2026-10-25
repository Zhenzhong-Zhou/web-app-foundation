import { execFile, execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

import { API_REVISION } from './src/api/revision.gen.ts';
import { Locale } from './src/api/types.gen.ts';
import { DARK, LIGHT } from './src/theme/tokens.ts';

/**
 * Recompiles the catalogues while `npm run dev` runs (ADR-054).
 *
 * The browser reads src/i18n/compiled/, which `predev` writes once at start.
 * A catalogue changed afterwards — a translation edited, a branch switched,
 * patches applied with `git am` — used to reach the screen only after a
 * restart, and until then every new message showed its English. Now a
 * change to src/locales/*.json runs the same `i18n:compile`, and Vite
 * reloads the page from the fresh files. A compile that fails, a catalogue
 * mid-edit that is not yet valid JSON, is reported and leaves the last good
 * files in place.
 */
function recompileCatalogues(): Plugin {
  return {
    name: 'recompile-catalogues',
    apply: 'serve',
    configureServer(server) {
      const root = server.config.root;
      const locales = path.join(root, 'src/locales');
      const formatjs = path.join(root, 'node_modules/.bin/formatjs');
      const { logger } = server.config;

      let running = false;
      let again = false;

      const compile = () => {
        // One at a time: a save that lands mid-compile runs once more after.
        if (running) {
          again = true;
          return;
        }
        running = true;

        execFile(
          formatjs,
          [
            'compile-folder',
            '--format',
            'simple',
            '--ast',
            'src/locales',
            'src/i18n/compiled',
          ],
          { cwd: root },
          (error, _stdout, stderr) => {
            running = false;
            if (error) {
              // The reason, not the CLI's stack: "Failed to parse JSON in
              // file: src/locales/zh-Hans.json".
              const reason =
                stderr.split('\n').find((line) => line.trim()) ?? error.message;
              logger.error(`Catalogues not recompiled. ${reason}`, {
                timestamp: true,
              });
            } else {
              // With the words a language's failure is said in, which
              // `npm run i18n:compile` writes after it (ADR-081).
              try {
                execFileSync(process.execPath, [
                  path.join(root, 'scripts/write-failure-words.mjs'),
                ]);
                logger.info('Catalogues recompiled.', { timestamp: true });
              } catch {
                logger.error(
                  'Catalogues recompiled, but not the words a failed language is said in.',
                  { timestamp: true },
                );
              }
            }
            if (again) {
              again = false;
              compile();
            }
          },
        );
      };

      server.watcher.add(locales);
      server.watcher.on('all', (_event, file) => {
        if (path.dirname(file) === locales && file.endsWith('.json')) {
          compile();
        }
      });
    },
  };
}

/**
 * The product's name in the browser's tab and bookmarks: VITE_APP_NAME from
 * the repository's .env, read here once at start, so renaming the product
 * (or one deployment of it, for a customer) is a setting, not an edit.
 * Escaped in index.html, since it lands in HTML. vitest.config.ts gives the
 * component tests the default.
 *
 * Beside it, ADR-082's settings, read the same way:
 *
 * - VITE_APP_NAME_<TAG>, the name in one language the app speaks, such as
 *   VITE_APP_NAME_ZH_HANS or VITE_APP_NAME_FR_CA, else VITE_APP_NAME,
 *   handed to the app as __APP_NAMES__. It names the tabs and the marks in
 *   that language; index.html's title and the manifest each hold one name,
 *   VITE_APP_NAME, the home screen's.
 * - VITE_COPYRIGHT_HOLDER, the © line's holder, with the build's year, so
 *   nobody edits it in January, handed to the app as __COPYRIGHT__. Unset,
 *   as on a fork, no © line, rather than someone else's name.
 * - VITE_SITE_URL, the site's own address: a shared link's card needs its
 *   picture's address in full. Unset, the card has no picture.
 */
const DEFAULT_APP_NAME = 'web-app-foundation';

export interface BrandSettings {
  /** The name in each language, English's VITE_APP_NAME, the home screen's. */
  names: Record<Locale, string>;
  /** "© 2026 Zhenzhong (Bob) Zhou", or null with no holder. */
  copyright: string | null;
  /** The address of a shared link's picture, or null with no site. */
  picture: string | null;
}

/** The setting naming the product in a language: fr-CA's VITE_APP_NAME_FR_CA. */
const nameSetting = (locale: Locale) =>
  `VITE_APP_NAME_${locale.toUpperCase().replaceAll('-', '_')}`;

export function brandSettings(
  env: Record<string, string | undefined>,
  year: number,
): BrandSettings {
  const name = env.VITE_APP_NAME || DEFAULT_APP_NAME;
  const holder = env.VITE_COPYRIGHT_HOLDER;

  return {
    // English, the language the catalogues are written in, is
    // VITE_APP_NAME's own.
    names: Object.fromEntries(
      Object.values(Locale).map((locale) => [
        locale,
        (locale !== 'en' && env[nameSetting(locale)]) || name,
      ]),
    ) as Record<Locale, string>,
    copyright: holder ? `© ${year} ${holder}` : null,
    picture: pictureAt(env.VITE_SITE_URL),
  };
}

/** The card's picture on the site; a site that is no address stops the build. */
function pictureAt(site: string | undefined): string | null {
  if (!site) return null;
  const picture = URL.parse('/og-image.png', site);
  if (picture?.protocol !== 'https:' && picture?.protocol !== 'http:') {
    throw new Error(
      `VITE_SITE_URL is ${site}, not the site's address, such as https://web-app-foundation-client.onrender.com.`,
    );
  }
  return picture.href;
}

/** The icons the manifest names, made from docs/brand/ (ADR-082). */
const MANIFEST_ICONS = [
  { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
  { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
  {
    src: '/icon-maskable-512.png',
    sizes: '512x512',
    type: 'image/png',
    purpose: 'maskable',
  },
];

function appName(mode: string): Plugin {
  // loadEnv also takes a NODE_ENV it finds in a file as the build's own,
  // and the root .env has the server's NODE_ENV=development: every local
  // build then shipped React's development bundle, 250 kB more than CI's.
  // Only the brand's settings are wanted from it.
  const userNodeEnv = process.env.VITE_USER_NODE_ENV;
  const settings = brandSettings(
    loadEnv(mode, '..', [
      'VITE_APP_NAME',
      'VITE_COPYRIGHT_HOLDER',
      'VITE_SITE_URL',
    ]),
    new Date().getFullYear(),
  );
  if (userNodeEnv === undefined) delete process.env.VITE_USER_NODE_ENV;
  // English's, VITE_APP_NAME, the one name index.html and the manifest hold.
  const name = settings.names.en;
  const escaped = name
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

  /**
   * The home screen's name and icons (ADR-082). It is there for those, so
   * `browser`: added to a home screen, the app still opens with the
   * browser's bar and its back button. Written here, as version.json is,
   * since it holds the name; the dev server answers it too, since the
   * end-to-end suite runs there.
   */
  const manifest = JSON.stringify({
    name,
    short_name: name,
    icons: MANIFEST_ICONS,
    start_url: '/',
    display: 'browser',
  });

  return {
    name: 'app-name',
    config: () => ({
      define: {
        __APP_NAMES__: JSON.stringify(settings.names),
        __COPYRIGHT__: JSON.stringify(settings.copyright),
      },
    }),
    transformIndexHtml: (html) => ({
      html: html.replaceAll('%APP_NAME%', escaped),
      tags: settings.picture
        ? [
            {
              tag: 'meta',
              attrs: { property: 'og:image', content: settings.picture },
              injectTo: 'head',
            },
          ]
        : [],
    }),
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split('?')[0] !== '/manifest.webmanifest') {
          return next();
        }
        response.setHeader('Content-Type', 'application/manifest+json');
        response.end(manifest);
      });
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.webmanifest',
        source: manifest,
      });
    },
  };
}

/**
 * The page's colours from tokens.ts (ADR-055) in index.html: the browser's
 * bar (theme-color) and the page under the loading mark, so neither can
 * drift from the page the app draws (ADR-082).
 */
function pageColours(): Plugin {
  return {
    name: 'page-colours',
    transformIndexHtml: (html) =>
      html
        .replaceAll('%PAGE_LIGHT%', LIGHT.page)
        .replaceAll('%PAGE_DARK%', DARK.page),
  };
}

/**
 * The build's name, compiled into the app and written beside it as
 * version.json (ADR-081), so a tab left open across a deploy can tell that
 * the files on the server are no longer its own.
 *
 * The build is the commit Render builds (RENDER_GIT_COMMIT), else git's,
 * else the time, for a build made outside a checkout. version.json adds the
 * release, as package.json names it, and the API revision the build was
 * made for: a newer build with a higher revision means an API that refuses
 * this tab's saves. The hashed files come and go with each build; this one
 * keeps its name, so a tab can ask for it.
 *
 * The dev server answers /version.json itself, naming the build `dev`,
 * which the check never counts as newer.
 */
function versionFile(command: 'build' | 'serve'): Plugin {
  const builtAt = new Date().toISOString();
  const build =
    command === 'serve'
      ? 'dev'
      : process.env.RENDER_GIT_COMMIT || gitCommit() || builtAt;
  const { version } = JSON.parse(
    readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
  ) as { version: string };
  const file = JSON.stringify({
    build,
    builtAt,
    version,
    apiRevision: API_REVISION,
  });

  return {
    name: 'version-file',
    config: () => ({
      define: { __BUILD__: JSON.stringify({ build, builtAt, version }) },
    }),
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split('?')[0] !== '/version.json') return next();
        response.setHeader('Content-Type', 'application/json');
        response.setHeader('Cache-Control', 'no-store');
        response.end(file);
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: file });
    },
  };
}

/** The commit checked out, or nothing outside a git checkout. */
function gitCommit(): string | undefined {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return undefined;
  }
}

export default defineConfig(({ command, mode }) => ({
  plugins: [
    react(),
    recompileCatalogues(),
    appName(mode),
    pageColours(),
    versionFile(command),
  ],
  resolve: {
    /**
     * In a production build, the ICU parser is swapped for its stub (ADR-054).
     * Every catalogue reaches the browser already parsed (npm run
     * i18n:compile), so the parser would be weight with nothing to do. Dev
     * and the tests keep it, so a message added in code and not yet
     * extracted still renders from its English while someone works on it.
     */
    alias:
      command === 'build'
        ? [
            {
              find: /^@formatjs\/icu-messageformat-parser$/,
              replacement: '@formatjs/icu-messageformat-parser/no-parser.js',
            },
          ]
        : [],
  },
  // Raised from Vite's 500KB default. MUI is most of the bundle, and ADR-021
  // accepts that: this surface sits behind a login wall, where first paint is
  // not a conversion metric. Revisit when step 9 adds Refine — that is when
  // route-level lazy() starts to pay.
  build: { chunkSizeWarningLimit: 700 },
  server: {
    port: 5173,
    // Fail rather than drift to 5174: CLIENT_URL is baked into every
    // verification and reset link (ADR-017), and a silently moved port turns
    // those into dead links with nothing in the logs.
    strictPort: true,
    proxy: {
      '/api': {
        // Playwright sets this so the e2e stack runs on its own ports and
        // cannot be confused with the dev one.
        target: process.env.VITE_API_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
        // Nest has no global prefix — it serves /v1/... (ADR-013). /api is a
        // browser-side convention only, stripped before forwarding. Without
        // this every request 404s at /api/v1/... and the failure looks like a
        // missing route rather than a proxy misconfiguration.
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
}));
