import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit runs outside Nest, so it never sees ConfigModule.
// Load the same root .env the server uses (README, "Repository layout").
config({ path: '../.env' });

export default defineConfig({
  schema: './src/database/schema/*.ts',
  out: './src/database/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Emit readable SQL that is committed as source code and hand-edited for
  // RLS policies and partial indexes (ADR-009).
  verbose: true,
  strict: true,
});
