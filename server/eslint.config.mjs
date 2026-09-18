import eslint from '@eslint/js';
import checkFile from 'eslint-plugin-check-file';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // scripts/ holds plain CommonJS build helpers and a shell script. There is
    // no tsconfig they belong to, and projectService errors on any file it
    // cannot place.
    ignores: ['eslint.config.mjs', 'dist/**', 'coverage/**', 'scripts/**'],
  },

  eslint.configs.recommended,

  // Scoped to .ts: type-aware rules need a tsconfig, and applying them to a
  // .mjs config file is what produces "not found by the project service".
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ['**/*.ts'],
  })),

  eslintPluginPrettierRecommended,

  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  {
    files: ['**/*.ts'],
    plugins: {
      'simple-import-sort': simpleImportSort,
      'check-file': checkFile,
    },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'check-file/filename-naming-convention': [
        'error',
        { '**/*.ts': 'KEBAB_CASE' },
        { ignoreMiddleExtensions: true },
      ],
      'check-file/folder-naming-convention': [
        'error',
        { 'src/**/': 'KEBAB_CASE' },
      ],
    },
  },

  {
    files: ['src/core/**/*.ts', 'src/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/database/database.module',
                '**/database/database.tokens',
              ],
              importNames: ['UNSAFE_GLOBAL_DB', 'PG_POOL'],
              message:
                'Services must use TenantDb — it applies organization_id (ADR-003/ADR-009). ' +
                'Global queries are allowed in core/auth, ' +
                'core/authorization and core/notifications; ' +
                'anywhere else, this is a scoping mistake.',
            },
          ],
        },
      ],
    },
  },

  {
    // UNSAFE_GLOBAL_DB is allowed in exactly three places, none of which has a
    // tenant to scope to. core/auth resolves a user by email before any
    // organization is known. core/authorization joins the permission
    // catalogue, which has no organization_id by design. core/notifications is
    // scoped by recipient instead: an account notification — "somebody signed
    // in to your account" — belongs to a person who may belong to no
    // organization at all (ADR-036).
    files: [
      'src/core/auth/**/*.ts',
      'src/core/authorization/**/*.ts',
      'src/core/notifications/**/*.ts',
    ],
    rules: { 'no-restricted-imports': 'off' },
  },

  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',

      // The underscore prefix is already used for deliberately-unused
      // parameters (@Audited's extractors take a response they ignore).
      // Without varsIgnorePattern the same convention fails for destructured
      // variables, which is inconsistent enough to be surprising.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },
);
