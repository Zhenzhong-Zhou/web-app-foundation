import type { Client } from 'pg';

/**
 * Releases the run's lock on the test database (see global-setup.ts) by
 * closing the connection that holds it.
 */
export default async function globalTeardown(): Promise<void> {
  const client = (globalThis as { __E2E_LOCK__?: Client }).__E2E_LOCK__;
  if (client) await client.end();
}
