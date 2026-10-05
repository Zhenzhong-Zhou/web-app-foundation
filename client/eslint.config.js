import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';
import eslintConfigPrettier from 'eslint-config-prettier';
import formatjs from 'eslint-plugin-formatjs';
import simpleImportSort from 'eslint-plugin-simple-import-sort';

export default defineConfig([
  globalIgnores(['dist', 'e2e/.output', 'e2e/.auth', 'playwright-report']),
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
    },
  },
  {
    /**
     * No English typed straight into JSX where the language has reached
     * (ADR-054). Switched on one folder at a time as each is converted, and
     * everywhere once the last one is; a file listed here can no longer
     * gain a hard-coded label by accident.
     */
    files: [
      'src/i18n/**/*.tsx',
      'src/auth/**/*.tsx',
      'src/layout/**/*.tsx',
      'src/App.tsx',
      'src/components/**/*.tsx',
      'src/account/**/*.tsx',
      'src/products/**/*.tsx',
    ],
    // Specs render with made-up labels on purpose. The print sheet is a
    // document, in the customer's language rather than the reader's, and
    // moves with the printed documents (ADR-054, step 5).
    ignores: ['**/*.test.tsx', 'src/components/print-sheet.tsx'],
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
