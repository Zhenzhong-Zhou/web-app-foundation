import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { onDatabase, SERVER } from './database';

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
