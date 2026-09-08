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
// One lookup table rather than a chain of ternaries: the variable name in the
// error below is now the same value used to read it, so a new target cannot be
// added in one place and forgotten in the other.
const TARGETS = {
  test: 'DATABASE_URL_TEST',
  e2e: 'DATABASE_URL_E2E',
} as const;

const key =
  TARGETS[process.env.MIGRATE_TARGET as keyof typeof TARGETS] ?? 'DATABASE_URL';

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
