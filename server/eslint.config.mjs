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
    ignores: [
      'eslint.config.mjs',
      'dist/**',
      'dist-openapi/**',
      'coverage/**',
      'scripts/**',
    ],
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
      // An invitation read and accepted by its link, before any
      // organization is known; and every organization's ended ones, swept
      // hourly (ADR-077). The rest of core/invitations goes through TenantDb.
      'src/core/invitations/invitation-acceptance.service.ts',
      'src/core/invitations/invitations-sweep.service.ts',
      // An organization invitation read and accepted by its link, before
      // the organization it starts exists (ADR-078).
      'src/core/invitations/organization-invitation-acceptance.service.ts',
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
    // What a member may do is decided in one place (ADR-080): the tables
    // that say it are refused anywhere else, by name in code and in raw
    // SQL, so a second answer cannot grow beside it. Each exception says
    // why; a new one adds its line here, and nothing else lists them.
    // no-restricted-syntax rather than no-restricted-imports, which the
    // rule above already sets for most of these files, and a second
    // setting would replace it.
    files: ['src/**/*.ts'],
    ignores: [
      // The one place: core/authorization reads and writes them, and
      // offers the rest of the app its answers and helpers.
      'src/core/authorization/**',
      // The tables' own definitions.
      'src/database/schema/**',
      // The seed, adding any grant missing from a built-in role on every
      // deploy, which is how a new permission reaches every Owner.
      'src/database/seed.ts',
      // Provisioning, a new organization's built-in roles and their grants.
      'src/core/organizations/provision-organization.ts',
      // The export, writing what each role may do and each member's role.
      'src/core/organizations/organization-export.service.ts',
      'src/core/organizations/organization-tables.ts',
      // The table diagrams, naming each table to give it its area; they
      // read no row (ADR-086).
      'src/cli/table-diagrams.ts',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...[
          'ImportSpecifier[imported.name=/^(membershipRoles|invitationRoles|rolePermissions)$/]',
          'MemberExpression[property.name=/^(membershipRoles|invitationRoles|rolePermissions)$/]',
          'Literal[value=/\\b(membership_roles|invitation_roles|role_permissions)\\b/]',
          'TemplateElement[value.raw=/\\b(membership_roles|invitation_roles|role_permissions)\\b/]',
        ].map((selector) => ({
          selector,
          message:
            'Who holds which roles, and what they grant, is read only in ' +
            'core/authorization (ADR-080): ask PermissionsService, or use ' +
            'member-roles.ts and owner.ts. The files with a reason to ' +
            'touch these tables are exempted in eslint.config.mjs.',
        })),
      ],
    },
  },

  {
    // The client's address is worked out in one place (ADR-011, amended for
    // #316): on Render req.ip is one of Render's own proxies, so a new read
    // of it would record the proxy again. no-restricted-properties rather
    // than no-restricted-syntax, which the rule above sets for most of these
    // files, and a second setting would replace it.
    files: ['src/**/*.ts'],
    ignores: ['src/common/client-address.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        ...['req', 'request'].map((object) => ({
          object,
          property: 'ip',
          message:
            "The client's address is clientAddress(req), from " +
            'common/client-address.ts (ADR-011): req.ip is the proxy in ' +
            'front, never the person. Signed in, context.ip already holds it.',
        })),
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
