import { execFile, execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

import { API_REVISION } from './src/api/revision.gen.ts';

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
              logger.info('Catalogues recompiled.', { timestamp: true });
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
 * Escaped, since it lands in HTML.
 */
const DEFAULT_APP_NAME = 'web-app-foundation';

function appName(mode: string): Plugin {
  // loadEnv also takes a NODE_ENV it finds in a file as the build's own,
  // and the root .env has the server's NODE_ENV=development: every local
  // build then shipped React's development bundle, 250 kB more than CI's.
  // Only the name is wanted from it.
  const userNodeEnv = process.env.VITE_USER_NODE_ENV;
  const name =
    loadEnv(mode, '..', 'VITE_APP_NAME').VITE_APP_NAME || DEFAULT_APP_NAME;
  if (userNodeEnv === undefined) delete process.env.VITE_USER_NODE_ENV;
  const escaped = name
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

  return {
    name: 'app-name',
    transformIndexHtml: (html) => html.replaceAll('%APP_NAME%', escaped),
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
