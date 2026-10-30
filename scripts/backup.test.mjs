/**
 * Tests for backup.sh, on Node's own runner: scripts/ sits outside both
 * packages, so neither one's Vitest would find them.
 *
 *     node --test scripts/
 *
 * The script runs with stand-ins first on the PATH, so no database and no
 * key are needed: pg_dump says it is version 18 and writes 20,000 bytes,
 * age passes them through, and psql answers the sizes. It runs through
 * /bin/bash, the Mac's 3.2 where the tests run on a Mac, so anything newer
 * than 3.2 fails here.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { folder, write } from "./git-fixture.mjs";

const SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "backup.sh",
);

/** One local backup into a folder holding `previous`, the run returned. */
function backUp(t, previous) {
  const bin = folder(t, "backup-bin");
  const standIn = (name, body) =>
    writeFileSync(path.join(bin, name), `#!/bin/sh\n${body}\n`, {
      mode: 0o755,
    });
  standIn(
    "pg_dump",
    '[ "$1" = --version ] && echo "pg_dump (PostgreSQL) 18.0" && exit 0\nhead -c 20000 /dev/zero',
  );
  standIn("age", "cat");
  standIn("psql", "echo '20 kB|30 MB'");

  const backups = folder(t, "backups");
  write(backups, previous.file, "x".repeat(previous.bytes));
  return spawnSync("/bin/bash", [SCRIPT], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      BACKUP_DATABASE_URL: "postgresql://backup@localhost:5432/foundation",
      BACKUP_AGE_RECIPIENT: "age1test",
      BACKUP_ENVIRONMENT: "test",
      BACKUP_DESTINATION: "local",
      BACKUP_DIR: backups,
      GITHUB_STEP_SUMMARY: path.join(backups, "summary.md"),
    },
  });
}

test("a size change over 50% is a warning on stderr, and stdout is the backup's path alone, which the workflow reads", (t) => {
  const run = backUp(t, {
    file: "test/2026/10/29/test-20261029T100000Z.dump.age",
    bytes: 1000,
  });

  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^[^\n]+\/test-\d{8}T\d{6}Z\.dump\.age\n$/);
  assert.ok(existsSync(run.stdout.trimEnd()), run.stdout);
  assert.match(
    run.stderr,
    /^::warning::Backup size changed 1900% \(1000 → 20000 bytes\)\. Check before trusting it\.$/m,
  );
});
