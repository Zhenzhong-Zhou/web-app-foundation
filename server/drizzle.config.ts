import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit runs outside Nest, so it never sees ConfigModule. Locally this
// loads the shared root .env (README, "Repository layout"); on a platform the
// file does not exist and dotenv does nothing, because the variables are
// already in the process.
config({ path: '../.env', quiet: true });

// Migrations must be applied to every database. Selected by an env flag rather
// than by overriding DATABASE_URL on the command line, because dotenv above
// would win and silently migrate the dev database instead.
//
// A lookup table rather than a chain of ternaries, and deliberately no ??
// fallback on the lookup: a typo'd target resolving to DATABASE_URL migrates
// the dev database and reports success. That failure is invisible — it cost an
// afternoon once, with migrate:e2e quietly hitting the dev database while the
// e2e one stayed empty.
const TARGETS = {
  test: 'DATABASE_URL_TEST',
  e2e: 'DATABASE_URL_E2E',
} as const;

const target = process.env.MIGRATE_TARGET;

const key = target
  ? TARGETS[target as keyof typeof TARGETS]
  : ('DATABASE_URL' as const);

if (!key) {
  throw new Error(
    `Unknown MIGRATE_TARGET "${target}" — expected one of: ${Object.keys(TARGETS).join(', ')}`,
  );
}

const url = process.env[key];

if (!url) {
  throw new Error(`Missing ${key} — set it in ../.env or in the environment`);
}

export default defineConfig({
  schema: './src/database/schema/*.ts',
  out: './src/database/migrations',
  dialect: 'postgresql',
  dbCredentials: { url },
  // Emit readable SQL that is committed as source code and hand-edited for
  // RLS policies and partial indexes (ADR-009).
  verbose: true,
  strict: true,
});
