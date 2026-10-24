import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';
import eslintConfigPrettier from 'eslint-config-prettier';
import compat from 'eslint-plugin-compat';
import formatjs from 'eslint-plugin-formatjs';
import simpleImportSort from 'eslint-plugin-simple-import-sort';

export default defineConfig([
  // src/api/ is generated from the server's OpenAPI document (ADR-068).
  globalIgnores([
    'dist',
    'e2e/.output',
    'e2e/.auth',
    'playwright-report',
    'src/api',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      eslintConfigPrettier,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'simple-import-sort': simpleImportSort,
      formatjs,
    },
    rules: {
      /**
       * Two conventions existed side by side — MUI first in most components,
       * react first in App — and neither was worth a decision. A rule ends
       * the question.
       */
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',

      /**
       * Every message carries its English beside its id, as a literal the
       * extractor can read, and uses the placeholders it is given (ADR-054).
       */
      'formatjs/enforce-default-message': ['error', 'literal'],
      'formatjs/enforce-placeholders': 'error',

      /**
       * A colour given as a path goes in sx (ADR-055). MUI 9 ignores a path
       * in a color prop, and TypeScript still takes it as a string, so from
       * MUI 9's first commit color="text.secondary" drew the primary text
       * colour, in over 200 places, until #196. Refused however it is
       * written (a literal, or a string inside a conditional, a logical or
       * a template) and on any component, not only Typography.
       */
      'no-restricted-syntax': [
        'error',
        ...[
          "JSXAttribute[name.name='color'] > Literal[value=/\\./]",
          "JSXAttribute[name.name='color'] > JSXExpressionContainer Literal[value=/\\./]",
          "JSXAttribute[name.name='color'] > JSXExpressionContainer TemplateElement[value.raw=/\\./]",
        ].map((selector) => ({
          selector,
          message:
            'A colour path goes in sx: MUI 9 ignores a path in a color prop and draws the primary text colour (#196). The prop takes only a name, such as primary, error or inherit.',
        })),
      ],
    },
  },
  {
    /**
     * No English typed straight into JSX (ADR-054). Switched on one folder
     * at a time as each was converted; every screen is now, so a new file
     * cannot gain a hard-coded label by accident.
     */
    files: ['src/**/*.tsx'],
    // Specs render with made-up labels on purpose.
    ignores: ['**/*.test.tsx'],
    rules: {
      /**
       * The rule's defaults check JSX text, aria-* everywhere, and
       * placeholder and title on HTML elements only — so MUI's `label`
       * and `helperText`, a component's `title`, and this codebase's own
       * `*Label` props would slip through, and they hold most of the copy.
       * Listed explicitly; a prop that carries no words (variant, to, size)
       * is never checked.
       */
      'formatjs/no-literal-string-in-jsx': [
        'error',
        {
          props: {
            include: [
              [
                '*',
                '{label,*Label,helperText,title,heading,subtitle,placeholder,empty,message,detail,noOptionsText}',
              ],
            ],
          },
        },
      ],
    },
  },
  {
    /**
     * The browser floor (conventions.md, "Supported browsers", ADR-081): an
     * API newer than these browsers fails unless it is guarded in an `if`,
     * as Intl.Segmenter once was not. The list is Vite's build target, its
     * default, which vite.config.ts does not set, and the two must agree: a
     * Vite major moves its default, and this list moves with it.
     */
    files: ['src/**/*.{ts,tsx}'],
    // Tests run in Node, not in these browsers.
    ignores: ['**/*.test.{ts,tsx}', 'src/test/**'],
    plugins: { compat },
    settings: {
      browsers: [
        'chrome >= 111',
        'edge >= 111',
        'firefox >= 114',
        'safari >= 16.4',
        'ios_saf >= 16.4',
      ],
      // Vite rewrites newer syntax but adds no polyfills, so a built-in such
      // as Object.groupBy counts as much as a Web API.
      lintAllEsApis: true,
    },
    rules: {
      'compat/compat': 'error',
    },
  },
  {
    // Playwright specs run in Node, not the browser, and the React plugins
    // above misread the test API. Listed last so it overrides the block above.
    files: ['e2e/**/*.ts', 'playwright.config.ts'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      // Playwright reads the destructuring pattern to work out which fixtures a
      // test depends on. `async ({}, use)` is how it says "none" — the empty
      // pattern is load-bearing, not an oversight.
      'no-empty-pattern': 'off',
      // The `use` callback is Playwright's, not React's. The plugin matches on
      // the identifier alone and cannot tell the two apart.
      'react-hooks/rules-of-hooks': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
]);
