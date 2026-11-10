#!/usr/bin/env node
/**
 * A database ahead of its working folder (ADR-089's amendment for #529):
 * before the server's migrations apply anything, a check that the
 * migrations the database records are the start of this folder's own.
 * Run from server/, as its package's scripts run it:
 *
 *     node ../scripts/database-ahead.mjs <dev|test|e2e>
 *
 * The target's address is the one server/drizzle.config.ts picks:
 * DATABASE_URL, DATABASE_URL_TEST or DATABASE_URL_E2E, from the
 * environment before the root .env, as dotenv leaves a variable already
 * set. The database's migrations are the rows of
 * drizzle.__drizzle_migrations in the order they ran, none when it does
 * not exist; the folder's are server/src/database/migrations/meta/
 * _journal.json's entries, each one's time and hash read by Drizzle's own
 * migrator (readMigrationFiles, from drizzle-orm/migrator), so an upgrade
 * that hashes another way is read the same way here.
 *
 * Ahead: the database's rows, in order, are not the start of the folder's
 * list, entry by entry, by created_at and hash. It holds a migration the
 * folder does not have, from a branch not merged here, or one whose file
 * has changed since it ran, or one that ran without an earlier one of the
 * folder's. Drizzle applies a migration only when its time is later than
 * the last one applied, so each of those would be missed, and the run
 * would still report success.
 *
 * The test and e2e databases, ahead, are dropped (with force) and made
 * again, from the postgres database on the same server, owned by the
 * address's user, with one line saying why; the migration that follows
 * applies every one from the start. Every run empties them anyway. It
 * runs under the lock the working folders share (one-at-a-time.mjs), so
 * no run uses the database meanwhile. A test or e2e name that is the dev
 * database's is refused only there, ahead and about to be dropped: CI's
 * browser job names all three foundation_e2e on purpose, and its database
 * starts empty, so it is never ahead.
 *
 * The dev database holds a person's own rows, so it is never made again:
 * ahead, one line says so, and the migration goes on, exit 0. Its check
 * runs in the server's migrate:all, before the three migrations, and not
 * in migrate: Render's build runs migrate from server/, where ../scripts
 * is not there.
 *
 * In step or behind, it says nothing. pg, dotenv and drizzle-orm come
 * from server/node_modules, as one-at-a-time.mjs reaches them. Its tests, in
 * database-ahead.test.mjs, stand in for the database: `node --test
 * scripts/`.
 */
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { databaseOf } from "./folder-databases.mjs";
import { postgresAddress } from "./one-at-a-time.mjs";

/** This working folder: the one this copy of the script is in. */
const ROOT = realpathSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), ".."),
);

/** The three databases, by the line that names each, as drizzle.config.ts reads them. */
export const KEYS = {
  dev: "DATABASE_URL",
  test: "DATABASE_URL_TEST",
  e2e: "DATABASE_URL_E2E",
};

/** A name that may reach SQL, in its double quotes. */
const NAME = /^[a-z0-9_]+$/;

const MIGRATIONS = "server/src/database/migrations";

const USAGE =
  "Usage, from server/: node ../scripts/database-ahead.mjs <dev|test|e2e>";

/** A stop the person reads: its message, exit 1. */
export class Stop extends Error {}

/**
 * The folder's migrations, in the journal's order: each entry's tag, with
 * its time and its file's hash as Drizzle's migrator reads them.
 */
export function folderMigrations(root) {
  const migrationsFolder = path.join(root, MIGRATIONS);
  const { entries } = JSON.parse(
    readFileSync(path.join(migrationsFolder, "meta/_journal.json"), "utf8"),
  );
  const read = packages().migrator.readMigrationFiles({ migrationsFolder });
  return read.map(({ folderMillis, hash }, index) => ({
    tag: entries[index].tag,
    when: folderMillis,
    hash,
  }));
}

/** A migration's time, as a line names it: the journal's when, in UTC. */
const timeOf = (ms) =>
  `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;

/**
 * The database's rows against the folder's list, entry by entry: why it
 * is ahead, when the rows are not the list's start; otherwise null, in
 * step or behind.
 */
export function compare(rows, entries) {
  for (const [index, row] of rows.entries()) {
    const when = Number(row.created_at);
    const entry = entries[index];
    if (entry?.when === when) {
      if (entry.hash === row.hash) continue;
      return `ran ${entry.tag}.sql before the file changed`;
    }
    const at = entries.findIndex((one) => one.when === when);
    if (at > index) {
      return `ran ${entries[at].tag} without ${entry.tag} before it, which Drizzle would never apply`;
    }
    if (at >= 0) {
      return `ran ${entries[at].tag} a second time`;
    }
    return `holds a migration this folder lacks, made ${timeOf(when)} (hash ${String(row.hash).slice(0, 12)})`;
  }
  return null;
}

/** The migrations Drizzle records as run in the database, in that order. */
async function recorded(db) {
  const { rows } = await db.query(
    "select to_regclass('drizzle.__drizzle_migrations') is not null as present",
  );
  if (!rows[0]?.present) return [];
  const ran = await db.query(
    "select hash, created_at from drizzle.__drizzle_migrations order by id",
  );
  return ran.rows;
}

/** Where an address points, for a message: never its password. */
const serverOf = (url) => {
  const { hostname, port } = new URL(url);
  return `${hostname || "localhost"}:${port || 5432}`;
};

/** A connection to the database at the address, refused with what to do. */
async function open(url, name, system) {
  try {
    return await system.connect(url);
  } catch (error) {
    if (error instanceof Stop) throw error;
    throw new Stop(
      `Could not reach ${name} on ${serverOf(url)} (${error.message}). ` +
        "Is Postgres up? docker compose up -d",
    );
  }
}

/**
 * The check for one target, before its migration: nothing when in step or
 * behind; ahead, a test or e2e database made again, a dev one left, each
 * with its line.
 */
export async function check(which, system) {
  const key = KEYS[which];
  const file = system.fileEnv();
  const address = (one) => system.env[one] || file[one];
  const url = address(key);
  if (!url) {
    throw new Stop(
      `${key} is not set. Add it to the root .env (see .env.example).`,
    );
  }
  const name = databaseOf(url);
  if (!name) {
    throw new Stop(
      `${key} is not a postgresql:// address naming a database. Correct it ` +
        "in the root .env (see .env.example).",
    );
  }
  const db = await open(url, name, system);
  let rows;
  try {
    rows = await recorded(db);
  } finally {
    await db.end().catch(() => {});
  }
  const why = compare(rows, system.migrations());
  if (!why) return;

  const what = `The ${which} database, ${name}, ${why}`;
  if (which === "dev") {
    system.say(
      `${what}. It holds your own rows, so it is left as it is; nothing changed.`,
    );
    return;
  }
  if (name === databaseOf(address(KEYS.dev))) {
    throw new Stop(
      `${what}, and ${key} names the dev database, which holds your own ` +
        "rows, so it is not made again; nothing changed. Give it its own " +
        "name in the root .env (see .env.example), then run again.",
    );
  }
  if (!NAME.test(name)) {
    throw new Stop(
      `${what}, and its name is not only a-z, 0-9 and _, so it is not made ` +
        `again here. Drop it and make it again by hand, then run again.`,
    );
  }
  const server = await open(
    postgresAddress(url),
    "the postgres database",
    system,
  );
  try {
    // The connection's user owns what it makes: the address's own.
    await server.query(`drop database if exists "${name}" with (force)`);
    await server.query(`create database "${name}"`);
  } finally {
    await server.end().catch(() => {});
  }
  system.say(
    `${what}, so it was made again, empty, for this folder's migrations.`,
  );
}

/** pg, dotenv and Drizzle's migrator, from this folder's server/node_modules. */
function packages() {
  const require = createRequire(path.join(ROOT, "server/package.json"));
  try {
    return {
      pg: require("pg"),
      dotenv: require("dotenv"),
      migrator: require("drizzle-orm/migrator"),
    };
  } catch {
    throw new Stop(
      "pg, dotenv and drizzle-orm come from server/node_modules: run npm ci in server/ first.",
    );
  }
}

/** What a run uses outside itself; the tests give their own. */
export const SYSTEM = {
  env: process.env,
  fileEnv: () => {
    let text;
    try {
      text = readFileSync(path.join(ROOT, ".env"));
    } catch {
      // No .env, as on a platform or in CI: the variables are in the process.
      return {};
    }
    return packages().dotenv.parse(text);
  },
  migrations: () => folderMigrations(ROOT),
  connect: async (url) => {
    const client = new (packages().pg.Client)({
      connectionString: url,
      application_name: "database-ahead",
    });
    await client.connect();
    return client;
  },
  say: (line) => process.stderr.write(`${line}\n`),
};

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [which, ...rest] = process.argv.slice(2);
  if (!Object.hasOwn(KEYS, which ?? "") || rest.length) {
    process.stderr.write(`${USAGE}\n`);
    process.exit(2);
  }
  try {
    await check(which, SYSTEM);
  } catch (error) {
    if (!(error instanceof Stop)) throw error;
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
