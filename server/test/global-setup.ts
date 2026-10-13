import { config } from 'dotenv';
import { Client } from 'pg';

// Vitest runs this in its own process, outside Nest, so ConfigModule has
// not loaded the shared root .env yet; the same reason drizzle.config.ts
// loads it itself.
config({ path: '../.env', quiet: true });

/** Fixed and arbitrary: the key every e2e run takes on the test database. */
export const E2E_LOCK_KEY = 4_802_048;

/**
 * One e2e run at a time on the test database (issue #1).
 *
 * Every test starts by truncating every table (resetDatabase). A second run
 * against the same database truncates the first one's users and sessions
 * mid-test, and the first reports it as a burst of 401s across unrelated
 * suites — gone again on the next run, because by then only one is running.
 *
 * A session-level advisory lock, held on a dedicated connection for the whole
 * run. Tied to the connection, so a crashed or interrupted run releases it by
 * dying; nothing is left behind to clean up.
 *
 * Returns the teardown, which Vitest runs once the last suite has finished:
 * closing the connection releases the lock.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const url = process.env.DATABASE_URL_TEST;

  if (!url) {
    throw new Error(
      'DATABASE_URL_TEST is not set. Add it to the root .env (see .env.example).',
    );
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  const { rows } = await client.query<{ locked: boolean }>(
    'select pg_try_advisory_lock($1) as locked',
    [E2E_LOCK_KEY],
  );

  if (!rows[0]?.locked) {
    await client.end();
    throw new Error(
      'Another e2e run is using the test database. Two runs truncate each ' +
        "other's tables mid-test, so this one has stopped before starting. " +
        'Let the other finish (or stop it), then run again.',
    );
  }

  return async () => {
    await client.end();
  };
}
