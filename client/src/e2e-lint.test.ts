// @vitest-environment node
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

/**
 * The lint rule that keeps a /src/ path out of the browser tests (ADR-008's
 * amendment for #530), read through eslint.config.js as npm run lint reads
 * it: the suite runs on the built client, where such a path matches
 * nothing, so a test names the source to clientFiles instead.
 */
// client/, from this file's own address, so the config is npm run lint's
// wherever Vitest was started. Without types: the samples are in no
// tsconfig, and the rule reads only the syntax.
const eslint = new ESLint({
  cwd: decodeURIComponent(new URL('..', import.meta.url).pathname),
  overrideConfig: {
    languageOptions: { parserOptions: { projectService: false } },
  },
});

async function refusals(code: string, filePath = 'e2e/sample.spec.ts') {
  const [result] = await eslint.lintText(`${code}\n`, { filePath });
  // A sample that does not parse would be left alone, testing nothing.
  expect(result.messages.filter(({ fatal }) => fatal)).toEqual([]);
  return result.messages
    .filter((message) => message.ruleId === 'no-restricted-syntax')
    .map((message) => message.message);
}

const REFUSED = expect.stringMatching(
  /^A browser test names a client file by its source to clientFiles/,
);

describe('a /src/ path in a browser test', () => {
  it.each([
    // status-pages.spec.ts before #530: a glob, kept in a variable.
    "const chunk = '**/src/inventory/inventory-page.tsx*';",
    "await page.route('**/src/main.tsx*', (route) => route.abort());",
    // index-html.spec.ts before #530: a pattern, given to a helper.
    'const theApp = /\\/src\\/main\\.tsx(\\?|$)/;',
    'await page.route(/src\\/home\\/home-page/, (route) => route.abort());',
    "page.waitForRequest((request) => request.url().includes('/src/home/'));",
    'await page.route(`**/src/${source}`, (route) => route.abort());',
    // Playwright reads a bare path from the base URL.
    "await page.route('src/main.tsx', (route) => route.abort());",
    "page.waitForResponse('src/home/home-page.tsx');",
  ])('is refused: %s', async (code) => {
    expect(await refusals(code)).toEqual([REFUSED]);
  });

  it('is refused in the tests’ support too', async () => {
    expect(
      await refusals(
        "export const ENTRY = '/src/main.tsx';",
        'e2e/support/sample.ts',
      ),
    ).toEqual([REFUSED]);
  });

  it.each([
    // A comment is not code.
    '// The dev server served **/src/main.tsx.',
    '/** On the dev server, /src/main.tsx. */\nexport {};',
    // A source named to clientFiles, which finds its file.
    "await clientFiles.hold('src/home/home-page.tsx');",
    "export const ENTRY = 'src/main.tsx';",
    // A file the test reads from disk.
    "readFileSync(new URL('../../src/routes.ts', import.meta.url), 'utf8');",
    'new URL(`../../../server/src/i18n/${language}.json`, import.meta.url);',
    "await page.route('**/version.json?*', (route) => route.abort());",
  ])('is left alone: %s', async (code) => {
    expect(await refusals(code)).toEqual([]);
  });
});
