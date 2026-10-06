import { execFile } from 'node:child_process';
import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

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

export default defineConfig(({ command }) => ({
  plugins: [react(), recompileCatalogues()],
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
