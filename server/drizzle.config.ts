import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit runs outside Nest, so it never sees ConfigModule.
// Load the same root .env the server uses (README, "Repository layout").
config({ path: '../.env' });

// Migrations must be applied to both databases. Selected by an env flag rather
// than by overriding DATABASE_URL on the command line, because dotenv above
// would win and silently migrate the dev database instead.
const url =
  process.env.MIGRATE_TARGET === 'test'
    ? process.env.DATABASE_URL_TEST
    : process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    `Missing ${process.env.MIGRATE_TARGET === 'test' ? 'DATABASE_URL_TEST' : 'DATABASE_URL'} in ../.env`,
  );
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
