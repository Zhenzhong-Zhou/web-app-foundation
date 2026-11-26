import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Page, TestInfo } from '@playwright/test';

/**
 * The client's own files by their source (ADR-008's amendment for #530):
 * the `clientFiles` fixture (fixtures.ts).
 *
 * The suite runs on the built client. Each Playwright run builds it into
 * dist-e2e/ (vite.config.ts), where a page's chunk and the app's entry are
 * files named by their content, which change with every build. A test that
 * holds one back, refuses one, or asks what a loaded one holds names it
 * here by its source, as the build's manifest keys it, and this finds its
 * file there. The manifest is read when a test asks, never as this file
 * loads: a listing run has no build. Under E2E_DEV_SERVER, the dev server
 * serves each source at its own path, so a spec reads the same both ways.
 *
 * A hold or a refusal that no request met by the test's end fails the
 * test, naming the file: it would have passed testing nothing, as
 * index-html.spec.ts's loading mark did on the built client while its hold
 * named the dev server's entry.
 */

const CLIENT = fileURLToPath(new URL('../../', import.meta.url));
/** vite.config.ts's E2E_BUILD, the suite's build. */
const BUILT = path.join(CLIENT, 'dist-e2e');
const MANIFEST = path.join(BUILT, '.vite/manifest.json');
const DEV_SERVER = Boolean(process.env.E2E_DEV_SERVER);

/**
 * The app's entry, index.html's script. A build's manifest keys its file
 * by index.html, the entry chunk.
 */
export const ENTRY = 'src/main.tsx';

/** A build's manifest, as much of it as this reads. */
type Manifest = Record<string, { file: string; isEntry?: boolean }>;

/** The path the browser asks for `source`'s file by. */
function pathOf(source: string): string {
  if (DEV_SERVER) return `/${source}`;
  if (!existsSync(MANIFEST)) {
    throw new Error(
      `No build's manifest at ${path.relative(CLIENT, MANIFEST)}: playwright.config.ts builds the client before the tests (npm run build:e2e), unless E2E_DEV_SERVER is set.`,
    );
  }
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest;
  const chunk =
    source === ENTRY
      ? Object.values(manifest).find(({ isEntry }) => isEntry)
      : manifest[source];
  if (!chunk) {
    throw new Error(
      `${source} has no file of its own in the build: its manifest names none, as for a module inside another chunk. Name a page's own module, or ENTRY.`,
    );
  }
  return `/${chunk.file}`;
}

/**
 * The sources the file at `url` holds, each by its path in client/, from
 * the source map beside it on disk: a built file's in dist-e2e/, and on
 * the dev server a package's, pre-bundled in node_modules/.vite/deps/. A
 * file with none is its own source, as each of the dev server's files from
 * src/ is.
 */
function sourcesOf(url: string): string[] {
  const file = path.join(DEV_SERVER ? CLIENT : BUILT, new URL(url).pathname);
  const map = `${file}.map`;
  if (!existsSync(map)) return [path.relative(CLIENT, file)];
  const { sources, sourceRoot = '' } = JSON.parse(
    readFileSync(map, 'utf8'),
  ) as { sources: string[]; sourceRoot?: string };
  return sources.map((source) =>
    path.relative(CLIENT, path.resolve(path.dirname(map), sourceRoot, source)),
  );
}

export interface ClientFiles {
  /** The path the browser asks for `source`'s file by. */
  path(source: string): string;
  /**
   * Holds back each request for `source`'s file until `release` is called,
   * slowed, never answered in its place; `asked` settles once the page has
   * asked for it.
   */
  hold(source: string): Promise<{ asked: Promise<void>; release: () => void }>;
  /**
   * Refuses each request for `source`'s file, as a dropped connection or a
   * missing file does (`route.abort`'s reason), until `lift` is called.
   */
  refuse(
    source: string,
    reason?: string,
  ): Promise<{ lift: () => Promise<void> }>;
  /** The sources the loaded file at `url` holds, by their path in client/. */
  sources(url: string): string[];
}

/** A hold or a refusal, and whether a request has met it. */
interface Routed {
  what: 'held' | 'refused';
  source: string;
  path: string;
  met: boolean;
}

/**
 * Holds back each request `url` matches until `release` is called, slowed,
 * never answered in its place; `asked` settles once the page has asked for
 * it. `clientFiles.hold` for one of the client's own files; this for any
 * other request, as index-html.spec.ts holds the API's session read.
 */
export async function holdRoute(
  page: Page,
  url: Parameters<Page['route']>[0],
): Promise<{ asked: Promise<void>; release: () => void }> {
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let asked = () => {};
  const wasAsked = new Promise<void>((resolve) => {
    asked = resolve;
  });
  await page.route(url, async (route) => {
    asked();
    await released;
    await route.continue();
  });
  return { asked: wasAsked, release };
}

/** The `clientFiles` fixture's body, for `page`'s test. */
export async function withClientFiles(
  page: Page,
  testInfo: TestInfo,
  use: (files: ClientFiles) => Promise<void>,
): Promise<void> {
  const routed: Routed[] = [];

  /** A hold or a refusal of `source`'s file, noted, and what matches it. */
  const note = (what: Routed['what'], source: string) => {
    const entry: Routed = { what, source, path: pathOf(source), met: false };
    routed.push(entry);
    return { entry, matches: (url: URL) => url.pathname === entry.path };
  };

  await use({
    path: pathOf,
    sources: sourcesOf,
    async hold(source) {
      const { entry, matches } = note('held', source);
      const held = await holdRoute(page, matches);
      void held.asked.then(() => {
        entry.met = true;
      });
      return held;
    },
    async refuse(source, reason = 'failed') {
      const { entry, matches } = note('refused', source);
      await page.route(matches, (route) => {
        entry.met = true;
        return route.abort(reason);
      });
      return { lift: () => page.unroute(matches) };
    },
  });

  if (testInfo.status === 'skipped') return;
  const unmet = routed.filter(({ met }) => !met);
  if (unmet.length > 0) {
    throw new Error(
      `Never asked for by the page, so the test checked nothing by it: ${unmet
        .map(({ what, source, path }) => `${source} (${path}), ${what}`)
        .join('; ')}.`,
    );
  }
}
