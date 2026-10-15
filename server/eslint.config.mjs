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
        ...globals.vitest,
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
    // Refused across src/, so a new folder is covered from its first file,
    // except where there is no tenant to scope to. Each exception says why
    // (ADR-016); a new one adds its line here, and nothing else lists them.
    files: ['src/**/*.ts'],
    ignores: [
      // The handle's own definition, TenantDb built on it, and the seeds,
      // which run outside any request.
      'src/database/**',
      // A ping of the pool.
      'src/health/health.controller.ts',
      // Resolves a user by email before any organization is known.
      'src/core/auth/**',
      // Joins the permission catalogue, which has no organization_id.
      'src/core/authorization/**',
      // Scoped by recipient: an account notification, "somebody signed in to
      // your account", may belong to a person in no organization (ADR-036).
      'src/core/notifications/**',
      // Every organization's expired files, in one hourly pass with no
      // request (ADR-059); the rest of core/files goes through TenantDb.
      'src/core/files/files-purge.service.ts',
      // Every organization's licences, hourly, the same way (ADR-064).
      'src/modules/product-licences/licence-reminders.service.ts',
    ],
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
                'The files with no tenant to scope to are exempted in ' +
                'eslint.config.mjs, each with its reason; anywhere else, ' +
                'this is a scoping mistake.',
            },
          ],
        },
      ],
    },
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
