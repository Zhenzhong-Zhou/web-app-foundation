/**
 * Tests for backup.sh, on Node's own runner: scripts/ sits outside both
 * packages, so neither one's Vitest would find them.
 *
 *     node --test scripts/
 *
 * The script runs with stand-ins first on the PATH, so no database and no
 * key are needed: pg_dump says it is version 18 and writes 20,000 bytes,
 * age passes them through, and psql writes its arguments to psql.log, then
 * answers the sizes, or fails, as a test says. It runs through /bin/bash,
 * the Mac's 3.2 where the tests run on a Mac, so anything newer than 3.2
 * fails here.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { folder, write } from "./git-fixture.mjs";

const SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "backup.sh",
);

/** The sizes as pg_size_pretty gives them, the dump's then the database's. */
const SIZES = "echo '20 kB|30 MB'";

/** What psql says when the database cannot be reached. */
const UNREACHABLE = 'echo "psql: error: connection refused" >&2\nexit 2';

/**
 * One local backup into a folder holding `previous`, when given, with psql
 * running `psql`. The run, with the summary it wrote and psql's arguments.
 */
function backUp(t, { previous, psql = SIZES } = {}) {
  const bin = folder(t, "backup-bin");
  const log = path.join(bin, "psql.log");
  const standIn = (name, body) =>
    writeFileSync(path.join(bin, name), `#!/bin/sh\n${body}\n`, {
      mode: 0o755,
    });
  standIn(
    "pg_dump",
    '[ "$1" = --version ] && echo "pg_dump (PostgreSQL) 18.0" && exit 0\nhead -c 20000 /dev/zero',
  );
  standIn("age", "cat");
  standIn("psql", `printf '%s\\n' "$@" > '${log}'\n${psql}`);

  const backups = folder(t, "backups");
  if (previous) write(backups, previous.file, "x".repeat(previous.bytes));
  const summary = path.join(backups, "summary.md");
  const run = spawnSync("/bin/bash", [SCRIPT], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      BACKUP_DATABASE_URL: "postgresql://backup@localhost:5432/foundation",
      BACKUP_AGE_RECIPIENT: "age1test",
      BACKUP_ENVIRONMENT: "test",
      BACKUP_DESTINATION: "local",
      BACKUP_DIR: backups,
      GITHUB_STEP_SUMMARY: summary,
    },
  });
  const read = (file) => (existsSync(file) ? readFileSync(file, "utf8") : "");
  return { ...run, summary: read(summary), psql: read(log) };
}

/** The summary's table, its one row given. */
const table = (row) =>
  `### Backup\n\n| Backup | Dump | Database |\n|---|---|---|\n${row}\n`;

/** The backup's file name, from the path the run printed. */
const nameOf = (run) => path.basename(run.stdout.trimEnd());

test("a size change over 50% is a warning on stderr, and stdout is the backup's path alone, which the workflow reads", (t) => {
  const run = backUp(t, {
    previous: {
      file: "test/2026/10/29/test-20261029T100000Z.dump.age",
      bytes: 1000,
    },
  });

  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^[^\n]+\/test-\d{8}T\d{6}Z\.dump\.age\n$/);
  assert.ok(existsSync(run.stdout.trimEnd()), run.stdout);
  assert.match(
    run.stderr,
    /^::warning::Backup size changed 1900% \(1000 → 20000 bytes\)\. Check before trusting it\.$/m,
  );
});

test("the run's summary is one row: the backup's name, the dump's size and the database's, as pg_size_pretty gives them", (t) => {
  const run = backUp(t);

  assert.equal(run.status, 0, run.stderr);
  assert.match(nameOf(run), /^test-\d{8}T\d{6}Z\.dump\.age$/);
  assert.equal(run.summary, table(`| ${nameOf(run)} | 20 kB | 30 MB |`));
  assert.match(
    run.psql,
    /^select pg_size_pretty\(20000::bigint\), pg_size_pretty\(pg_database_size\(current_database\(\)\)\)$/m,
  );
});

test("a database's size psql cannot read is a warning and 'not read' in the summary, and the backup is kept", (t) => {
  const run = backUp(t, { psql: UNREACHABLE });

  assert.equal(run.status, 0, run.stderr);
  assert.ok(existsSync(run.stdout.trimEnd()), run.stdout);
  assert.equal(
    run.summary,
    table(`| ${nameOf(run)} | 20000 bytes | not read |`),
  );
  assert.match(
    run.stderr,
    /^::warning::The database's size could not be read; the backup is stored\.$/m,
  );
});
