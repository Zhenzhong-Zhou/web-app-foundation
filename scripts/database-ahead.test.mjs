/**
 * Tests for database-ahead.mjs, on Node's own runner, with the scripts'
 * tests:
 *
 *     node --test scripts/
 *
 * The comparison runs alone, on lists the tests give; the hashes against
 * Drizzle's own migrator, on this folder's real migrations; and the three
 * targets' actions with a stand-in Postgres, holding each database's rows
 * of drizzle.__drizzle_migrations by name and recording what is dropped
 * and made.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { Stop, check, compare, folderMigrations } from "./database-ahead.mjs";

const ROOT = realpathSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), ".."),
);

/** The folder's list: three migrations, as the journal and their files give them. */
const ENTRIES = [
  { tag: "0000_start", when: 1_760_000_000_000, hash: "a".repeat(64) },
  { tag: "0001_orders", when: 1_761_000_000_000, hash: "b".repeat(64) },
  { tag: "0002_items", when: 1_762_000_000_000, hash: "c".repeat(64) },
];

/** A database's rows for the folder's first `count` migrations, as pg returns a bigint. */
const rowsFor = (entries, count = entries.length) =>
  entries
    .slice(0, count)
    .map(({ hash, when }) => ({ hash, created_at: String(when) }));

/** A row from a branch this folder does not have: 9 Nov 2026, 18:04 UTC. */
const BRANCH_ROW = { hash: "d".repeat(64), created_at: "1794247440000" };

test("in step: the database's rows are the folder's list", () => {
  assert.deepEqual(compare(rowsFor(ENTRIES), ENTRIES), {
    ahead: false,
    behind: 0,
  });
});

test("behind: the database has the start of the folder's list, the rest to run", () => {
  assert.deepEqual(compare(rowsFor(ENTRIES, 1), ENTRIES), {
    ahead: false,
    behind: 2,
  });
});

test("empty: a database with no rows is behind by the whole list", () => {
  assert.deepEqual(compare([], ENTRIES), { ahead: false, behind: 3 });
});

test("ahead by a row: one the folder does not have, after its list", () => {
  assert.deepEqual(compare([...rowsFor(ENTRIES), BRANCH_ROW], ENTRIES), {
    ahead: true,
    why: `holds a migration this folder lacks, made 2026-11-09 18:04 UTC (hash ${"d".repeat(12)})`,
  });
});

test("ahead by a row: one the folder does not have, where the folder has another", () => {
  const rows = [...rowsFor(ENTRIES, 2), BRANCH_ROW];
  assert.equal(compare(rows, ENTRIES).ahead, true);
  assert.match(
    compare(rows, ENTRIES).why,
    /^holds a migration this folder lacks/,
  );
});

test("ahead by a changed file: the same time, another hash", () => {
  const rows = rowsFor(ENTRIES);
  rows[1] = { ...rows[1], hash: "e".repeat(64) };
  assert.deepEqual(compare(rows, ENTRIES), {
    ahead: true,
    why: "ran 0001_orders.sql before the file changed",
  });
});

test("ahead: a later migration ran without an earlier one of the folder's", () => {
  const rows = [rowsFor(ENTRIES)[0], rowsFor(ENTRIES)[2]];
  assert.deepEqual(compare(rows, ENTRIES), {
    ahead: true,
    why: "ran 0002_items without 0001_orders before it, which Drizzle would never apply",
  });
});

test("the folder's list is Drizzle's own: each file's time and hash as its migrator reads them", async () => {
  const migrator = path.join(
    ROOT,
    "server/node_modules/drizzle-orm/migrator.js",
  );
  const { readMigrationFiles } = await import(pathToFileURL(migrator).href);
  const drizzle = readMigrationFiles({
    migrationsFolder: path.join(ROOT, "server/src/database/migrations"),
  });
  const ours = folderMigrations(ROOT);
  assert.ok(ours.length > 0);
  assert.deepEqual(
    ours.map(({ when, hash }) => ({ when, hash })),
    drizzle.map(({ folderMillis, hash }) => ({ when: folderMillis, hash })),
  );
});

const ADDRESSES = {
  DATABASE_URL: "postgresql://app:secret@localhost:5432/foundation",
  DATABASE_URL_TEST: "postgresql://app:secret@localhost:5432/foundation_test",
  DATABASE_URL_E2E: "postgresql://app:secret@localhost:5432/foundation_e2e",
};

/**
 * A stand-in Postgres: each database's rows, or null for one with no
 * drizzle.__drizzle_migrations, and what was dropped and made, in order.
 */
function postgres(databases) {
  const server = { databases: new Map(Object.entries(databases)), done: [] };
  server.connect = async (url) => {
    const name = decodeURIComponent(new URL(url).pathname.slice(1));
    server.done.push(`connect ${name}`);
    if (name !== "postgres" && !server.databases.has(name)) {
      throw new Error(`database "${name}" does not exist`);
    }
    return {
      async query(sql) {
        if (sql.includes("to_regclass")) {
          return { rows: [{ present: server.databases.get(name) !== null }] };
        }
        if (sql.startsWith("select hash, created_at")) {
          return { rows: server.databases.get(name) };
        }
        const drop =
          /^drop database if exists "([a-z0-9_]+)" with \(force\)$/.exec(sql);
        if (drop && name === "postgres") {
          server.databases.delete(drop[1]);
          server.done.push(`drop ${drop[1]}`);
          return { rows: [] };
        }
        const make = /^create database "([a-z0-9_]+)"$/.exec(sql);
        if (make && name === "postgres") {
          server.databases.set(make[1], null);
          server.done.push(`make ${make[1]}`);
          return { rows: [] };
        }
        throw new Error(`Not a call the script makes: ${sql}`);
      },
      async end() {},
    };
  };
  return server;
}

/** The system a check uses: the stand-in Postgres, the folder's list and the addresses. */
function system(server, { env = ADDRESSES, file = {} } = {}) {
  const said = [];
  return {
    said,
    env,
    fileEnv: () => file,
    migrations: () => ENTRIES,
    connect: server.connect,
    say: (line) => said.push(line),
  };
}

for (const [which, name] of [
  ["test", "foundation_test"],
  ["e2e", "foundation_e2e"],
]) {
  test(`${which}, ahead: dropped and made again from the postgres database, with its line`, async () => {
    const server = postgres({ [name]: [...rowsFor(ENTRIES), BRANCH_ROW] });
    const run = system(server);
    await check(which, run);
    assert.deepEqual(server.done, [
      `connect ${name}`,
      "connect postgres",
      `drop ${name}`,
      `make ${name}`,
    ]);
    assert.equal(server.databases.get(name), null);
    assert.deepEqual(run.said, [
      `The ${which} database, ${name}, holds a migration this folder lacks, ` +
        `made 2026-11-09 18:04 UTC (hash ${"d".repeat(12)}), so it was made ` +
        "again, empty, for this folder's migrations.",
    ]);
  });

  test(`${which}, in step or behind: nothing said, nothing changed`, async () => {
    for (const rows of [rowsFor(ENTRIES), rowsFor(ENTRIES, 1), null]) {
      const server = postgres({ [name]: rows });
      const run = system(server);
      await check(which, run);
      assert.deepEqual(server.done, [`connect ${name}`]);
      assert.deepEqual(run.said, []);
    }
  });

  test(`${which}: a name that is the dev database's is refused, whatever its state`, async () => {
    const server = postgres({ foundation: [] });
    const run = system(server, {
      env: {
        ...ADDRESSES,
        [`DATABASE_URL_${which.toUpperCase()}`]: ADDRESSES.DATABASE_URL,
      },
    });
    await assert.rejects(
      check(which, run),
      (error) =>
        error instanceof Stop &&
        error.message ===
          `DATABASE_URL_${which.toUpperCase()} names the dev database, foundation, ` +
            "which a test run empties. Give it its own name in the root .env " +
            "(see .env.example).",
    );
    assert.deepEqual(server.done, []);
  });
}

test("test, ahead by a changed file: the line names the file", async () => {
  const rows = rowsFor(ENTRIES);
  rows[2] = { ...rows[2], hash: "e".repeat(64) };
  const server = postgres({ foundation_test: rows });
  const run = system(server);
  await check("test", run);
  assert.deepEqual(run.said, [
    "The test database, foundation_test, ran 0002_items.sql before the file " +
      "changed, so it was made again, empty, for this folder's migrations.",
  ]);
});

test("dev, ahead: one line naming the migration, and nothing changed", async () => {
  const rows = [...rowsFor(ENTRIES), BRANCH_ROW];
  const server = postgres({ foundation: rows });
  const run = system(server);
  await check("dev", run);
  assert.deepEqual(server.done, ["connect foundation"]);
  assert.equal(server.databases.get("foundation"), rows);
  assert.deepEqual(run.said, [
    `The dev database, foundation, holds a migration this folder lacks, made ` +
      `2026-11-09 18:04 UTC (hash ${"d".repeat(12)}). It holds your own rows, ` +
      "so it is left as it is; nothing changed.",
  ]);
});

test("the address is the environment's before the root .env's, as dotenv leaves it", async () => {
  const server = postgres({ foundation_shell_test: rowsFor(ENTRIES) });
  const run = system(server, {
    env: {
      DATABASE_URL_TEST:
        "postgresql://app:secret@localhost:5432/foundation_shell_test",
    },
    file: ADDRESSES,
  });
  await check("test", run);
  assert.deepEqual(server.done, ["connect foundation_shell_test"]);
});

test("the address from the root .env when the environment has none", async () => {
  const server = postgres({ foundation_e2e: rowsFor(ENTRIES) });
  await check("e2e", system(server, { env: {}, file: ADDRESSES }));
  assert.deepEqual(server.done, ["connect foundation_e2e"]);
});

test("refused, saying what to do: no address, not a Postgres one, or no database reached", async () => {
  const server = postgres({});
  const refused = (promise, message) =>
    assert.rejects(
      promise,
      (error) => error instanceof Stop && message.test(error.message),
    );
  await refused(
    check("test", system(server, { env: {} })),
    /^DATABASE_URL_TEST is not set\. Add it to the root \.env \(see \.env\.example\)\.$/,
  );
  await refused(
    check("e2e", system(server, { env: { DATABASE_URL_E2E: "mysql://x/y" } })),
    /^DATABASE_URL_E2E is not a postgresql:\/\/ address naming a database/,
  );
  await refused(
    check("test", system(server)),
    /^Could not reach foundation_test on localhost:5432 \(database "foundation_test" does not exist\)\. Is Postgres up\? docker compose up -d$/,
  );
});

test("the script refuses a target that is not dev, test or e2e, exit 2", () => {
  const result = spawnSync(
    process.execPath,
    [path.join(ROOT, "scripts/database-ahead.mjs"), "prod"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 2);
  assert.match(
    result.stderr,
    /^Usage, from server\/: node \.\.\/scripts\/database-ahead\.mjs <dev\|test\|e2e>$/m,
  );
});
