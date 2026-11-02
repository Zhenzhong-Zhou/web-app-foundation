import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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
 * own, and needs one only here.
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
 * Every permission key the server has: its OpenAPI document's Permission
 * enum, which is ALL_PERMISSIONS (server/src/openapi/api-vocabulary.ts),
 * kept current by `npm run api` and the contract check of
 * scripts/verify.sh. Read as JSON, so nothing here starts the server.
 */
export function permissionKeys(): string[] {
  const document = JSON.parse(
    readFileSync(`${SERVER}openapi.json`, 'utf8'),
  ) as { components: { schemas: { Permission: { enum: string[] } } } };
  return document.components.schemas.Permission.enum;
}

/** The server's permission keys the database at `url` lacks. */
export async function missingPermissionKeys(url: string): Promise<string[]> {
  const keys = permissionKeys();
  const { rows } = await onDatabase(url, (connection) =>
    connection.query<{ key: string }>(
      'select key from permissions where key = any($1)',
      [keys],
    ),
  );
  const present = new Set(rows.map((row) => row.key));
  return keys.filter((key) => !present.has(key));
}

/**
 * Writes the permission keys the database at `url` lacks, and returns
 * them; when it lacks none, nothing at all, and no seed is started.
 *
 * Only `npm run test:e2e` seeds the e2e database, through pretest:e2e. A
 * direct `npx playwright test` does not, so after a branch adds a
 * permission every registration answered 500 (#345). A registration needs
 * only the keys, so this runs the seed's step that writes them, about 6 s
 * on a Mac; the full seed also backfills the grants of every organization
 * the suite has left behind, and took 46 s on 1 November 2026.
 */
export async function writeMissingPermissionKeys(
  url: string,
): Promise<string[]> {
  const missing = await missingPermissionKeys(url);
  if (missing.length === 0) return missing;

  console.log(
    `Permission keys missing from the e2e database: ${missing.join(', ')}. ` +
      'Writing them with the seed: npm run seed -- --keys-only',
  );
  execFileSync('npm', ['run', 'seed', '--', '--keys-only'], {
    cwd: SERVER,
    // NODE_ENV as the API's webServer has it (playwright.config.ts): under
    // test, the seed would write to DATABASE_URL_TEST instead.
    env: { ...process.env, NODE_ENV: 'development', DATABASE_URL: url },
    // Its errors only: its log on success says no more than the line above.
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  return missing;
}
