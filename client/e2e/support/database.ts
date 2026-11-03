import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

/** The server's folder: its seed, its OpenAPI document and its install. */
export const SERVER = fileURLToPath(
  new URL('../../../server/', import.meta.url),
);

interface Connection {
  connect(): Promise<unknown>;
  query<Row>(text: string, values?: unknown[]): Promise<{ rows: Row[] }>;
  end(): Promise<void>;
}

/**
 * The server's own Postgres driver, from its install, which the suite's
 * webServer starts the API from anyway: the client has no driver of its
 * own. The global setup's permission keys use it, and the setups that
 * confirm an owner's address (mail.ts).
 */
const { Client } = createRequire(`${SERVER}package.json`)('pg') as {
  Client: new (config: { connectionString: string }) => Connection;
};

/** Runs `work` on a connection of its own to `url`, closed after. */
export async function onDatabase<T>(
  url: string,
  work: (connection: Connection) => Promise<T>,
): Promise<T> {
  const connection = new Client({ connectionString: url });
  await connection.connect();
  try {
    return await work(connection);
  } finally {
    await connection.end();
  }
}
