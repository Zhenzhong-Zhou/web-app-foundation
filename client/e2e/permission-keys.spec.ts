import { execFileSync } from 'node:child_process';

import { expect, test } from '@playwright/test';

import {
  missingPermissionKeys,
  onDatabase,
  permissionKeys,
  SERVER,
  writeMissingPermissionKeys,
} from './support/permission-keys';

/**
 * The global setup's permission keys (#345), on a database of the test's
 * own, made and dropped here: the e2e database is shared with every
 * worker, and a key taken from it would take every organization's grants
 * with it. Migrated and never seeded, so it lacks every key, as the e2e
 * database lacks a new one after `npm run migrate:e2e`.
 */
test('the setup writes the permission keys a database lacks, and only those', async () => {
  // Drizzle's migrations, then the seed's start.
  test.setTimeout(120_000);

  // The config stops the run when DATABASE_URL_E2E is missing.
  const e2e = process.env.DATABASE_URL_E2E as string;
  const name = `foundation_e2e_keys_${Date.now().toString(36)}_${process.pid}`;
  const url = new URL(e2e);
  url.pathname = `/${name}`;

  await onDatabase(e2e, (connection) =>
    connection.query(`create database "${name}"`),
  );
  try {
    execFileSync('npm', ['run', 'migrate'], {
      cwd: SERVER,
      env: { ...process.env, DATABASE_URL: url.href },
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    expect(await missingPermissionKeys(url.href)).toEqual(permissionKeys());

    expect(await writeMissingPermissionKeys(url.href)).toEqual(
      permissionKeys(),
    );
    expect(await missingPermissionKeys(url.href)).toEqual([]);

    // The keys alone: not the full seed, whose default organization and
    // backfill of grants a registration does not need.
    const { rows } = await onDatabase(url.href, (connection) =>
      connection.query<{ count: number }>(
        'select count(*)::int as count from organizations',
      ),
    );
    expect(rows[0].count).toBe(0);

    // With every key there, nothing at all.
    expect(await writeMissingPermissionKeys(url.href)).toEqual([]);
  } finally {
    await onDatabase(e2e, (connection) =>
      connection.query(`drop database "${name}" with (force)`),
    );
  }
});
