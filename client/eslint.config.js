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
import testingLibrary from 'eslint-plugin-testing-library';

/**
 * The browser floor (conventions.md, "Supported browsers", ADR-081): Vite's
 * build target, its default, which vite.config.ts does not set, and the two
 * must agree: a Vite major moves its default, and this list moves with it.
 * Vite rewrites newer syntax but adds no polyfills, so a built-in such as
 * Object.groupBy counts as much as a Web API.
 */
const FLOOR = {
  browsers: [
    'chrome >= 111',
    'edge >= 111',
    'firefox >= 114',
    'safari >= 16.4',
    'ios_saf >= 16.4',
  ],
  lintAllEsApis: true,
};

/** Refused in every file, as no-restricted-syntax selectors. */
const RESTRICTED = [
  /**
   * A colour given as a path goes in sx (ADR-055). MUI 9 ignores a path
   * in a color prop, and TypeScript still takes it as a string, so from
   * MUI 9's first commit color="text.secondary" drew the primary text
   * colour, in over 200 places, until #196. Refused however it is
   * written (a literal, or a string inside a conditional, a logical or
   * a template) and on any component, not only Typography.
   */
  ...[
    "JSXAttribute[name.name='color'] > Literal[value=/\\./]",
    "JSXAttribute[name.name='color'] > JSXExpressionContainer Literal[value=/\\./]",
    "JSXAttribute[name.name='color'] > JSXExpressionContainer TemplateElement[value.raw=/\\./]",
  ].map((selector) => ({
    selector,
    message:
      'A colour path goes in sx: MUI 9 ignores a path in a color prop and draws the primary text colour (#196). The prop takes only a name, such as primary, error or inherit.',
  })),
  /**
   * A dialog's key goes on the component the page renders, never on
   * MUI's Dialog inside it: the fields are that component's state,
   * which a key on the Dialog leaves as it was (conventions.md, Keys
   * that rebuild a component; #265).
   */
  {
    selector:
      "JSXOpeningElement[name.name='Dialog'] > JSXAttribute[name.name='key']",
    message:
      "A dialog's key goes on the component the page renders, never on MUI's Dialog inside it, which leaves the fields as they were (#265).",
  },
];

/**
 * A list a person reads has one join, intl.formatList, which makeIntl
 * (src/i18n/intl.ts) makes for the screens: it lists in the reader's
 * language and, in Chinese, spaces a Latin name from 和 and 或 (ADR-090,
 * #501). Refused, outside that file: JavaScript's own list join, an intl
 * made anywhere else, a list's names given as elements, which hide their
 * text from the join, and a list joined by hand.
 */
const LISTS = [
  {
    selector:
      "MemberExpression[object.name='Intl'][property.name='ListFormat']",
    message:
      'A list a person reads is joined by intl.formatList, whose join (makeIntl, src/i18n/intl.ts) spaces a Latin name from 和 and 或 in Chinese (ADR-090, #501); Intl.ListFormat skips it.',
  },
  {
    selector:
      "ImportDeclaration[source.value='react-intl'] > ImportSpecifier[imported.name=/^(createIntl|IntlProvider)$/]",
    message:
      "The screens' intl is makeIntl's (src/i18n/intl.ts), whose lists keep ADR-090's space beside a Latin name in Chinese (#501); one made here would join its lists without it.",
  },
  {
    selector:
      'CallExpression[callee.property.name=/^formatList(ToParts)?$/] :matches(JSXElement, JSXFragment)',
    message:
      "A list's names go to the join as text, which an element hides from its spacing in Chinese (ADR-090, #501): pass the text to listNameParts (src/i18n/list-names.ts) and draw each name there.",
  },
  {
    selector:
      "CallExpression[callee.property.name='join'][arguments.0.value=/^\\s*(,|、|，|and|or|et|ou|和|或)\\s*$/]",
    message:
      "A list a person reads is joined by intl.formatList, in the reader's language and, in Chinese, with a space between a Latin name and 和 or 或 (ADR-090, #501), never by hand.",
  },
];

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

      'no-restricted-syntax': ['error', ...RESTRICTED],
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
     * LISTS, in the app's own code. A file left out joins no list a person
     * reads, each with why; a line that does, in a file that may, says why
     * in its own eslint-disable comment.
     */
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      '**/*.test.{ts,tsx}',
      'src/test/**',
      // The one join.
      'src/i18n/intl.ts',
      // CSS lists: a font stack, a background's layers.
      'src/theme/tokens.ts',
      'src/theme/cut-edge.ts',
      // An address's parts on one line, not names in a list (ADR-071).
      'src/invoices/one-line.ts',
      'src/locations/address-line.ts',
    ],
    rules: {
      'no-restricted-syntax': ['error', ...RESTRICTED, ...LISTS],
    },
  },
  {
    /**
     * The browser floor, FLOOR: an API newer than these browsers fails
     * unless it is guarded in an `if`, as Intl.Segmenter once was not.
     */
    files: ['src/**/*.{ts,tsx}'],
    // Tests run in Node, not in these browsers.
    ignores: ['**/*.test.{ts,tsx}', 'src/test/**'],
    plugins: { compat },
    settings: FLOOR,
    rules: {
      'compat/compat': 'error',
    },
  },
  {
    /**
     * src/loading.js, the classic script index.html runs before the app
     * (ADR-082): plain JavaScript, which the TypeScript blocks above miss,
     * held to the same floor, since nothing runs before it to fail softly.
     */
    files: ['src/loading.js'],
    extends: [js.configs.recommended, eslintConfigPrettier],
    languageOptions: { sourceType: 'script', globals: globals.browser },
    plugins: { compat },
    settings: FLOOR,
    rules: {
      'compat/compat': 'error',
    },
  },
  {
    // Component tests use Testing Library as it means to be used: an async
    // query, event or wait awaited, a sync one not, and queries from screen.
    files: ['src/**/*.test.{ts,tsx}', 'src/test/**'],
    extends: [testingLibrary.configs['flat/react']],
    settings: {
      // A helper returning render's result from another file; one in the
      // spec's own file is found without being named. Without a list the
      // plugin takes every render… helper for one, and most here return a
      // mock to check or a router to move.
      'testing-library/custom-renders': ['renderWithAuth'],
    },
    rules: {
      /**
       * A test reaches some elements through the DOM on purpose: MUI's own
       * markup (a chip, a badge's dot, the progress bar's track), and parts
       * kept out of the accessibility tree by design (an icon's disc, a
       * hidden file input, a live region with no role), which no role or name
       * can find.
       */
      'testing-library/no-node-access': 'off',
      'testing-library/no-container': 'off',
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
