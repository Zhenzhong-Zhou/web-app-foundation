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
 * own. The global setup's permission keys use it, the setups that confirm
 * an owner's address (mail.ts), and asOrganizationFromBefore.
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

/**
 * Makes an organization one from before (ADR-054, amended for #531): its
 * items named in no language yet. A new one always has a language, and no
 * route sets it back, so a test needing such an organization writes it
 * in the e2e database.
 */
export async function asOrganizationFromBefore(
  organizationId: string,
): Promise<void> {
  // The config stops the run when DATABASE_URL_E2E is missing.
  const { rows } = await onDatabase(
    process.env.DATABASE_URL_E2E as string,
    (connection) =>
      connection.query(
        `update organizations set product_name_language = null
         where id = $1 returning id`,
        [organizationId],
      ),
  );
  if (rows.length !== 1) {
    throw new Error(`No organization ${organizationId} to set back`);
  }
}
