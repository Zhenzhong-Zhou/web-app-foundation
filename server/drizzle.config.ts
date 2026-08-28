import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit runs outside Nest, so it never sees ConfigModule. Locally this
// loads the shared root .env (README, "Repository layout"); on a platform the
// file does not exist and dotenv does nothing, because the variables are
// already in the process.
config({ path: '../.env', quiet: true });

// Migrations must be applied to both databases. Selected by an env flag rather
// than by overriding DATABASE_URL on the command line, because dotenv above
// would win and silently migrate the dev database instead.
const url =
  process.env.MIGRATE_TARGET === 'test'
    ? process.env.DATABASE_URL_TEST
    : process.env.DATABASE_URL;

if (!url) {
  const name =
    process.env.MIGRATE_TARGET === 'test'
      ? 'DATABASE_URL_TEST'
      : 'DATABASE_URL';
  throw new Error(`Missing ${name} — set it in ../.env or in the environment`);
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
