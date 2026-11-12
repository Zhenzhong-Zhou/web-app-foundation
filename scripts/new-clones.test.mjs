/**
 * Tests for new-clones.mjs, on Node's own runner, with the scripts' tests:
 *
 *     node --test scripts/
 *
 * The diff's lines and the overlap alone, on text and reports the tests
 * give; then the script itself in a throwaway repository, a branch off
 * main changing one file, with a report written as jscpd writes it.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { git, repository, write } from "./git-fixture.mjs";
import { REPORT, changedLines, describe, newClones } from "./new-clones.mjs";

const SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "new-clones.mjs",
);

const ROOT = "/repo";

/** A clone between two places, each [file, first, last], its files named absolutely. */
const clone = (lines, [a, aStart, aEnd], [b, bStart, bEnd], root = ROOT) => ({
  lines,
  firstFile: { name: path.join(root, a), start: aStart, end: aEnd },
  secondFile: { name: path.join(root, b), start: bStart, end: bEnd },
});

test("the diff's added and changed lines, by file; a deletion and a deleted file add none", () => {
  const diff = [
    "diff --git a/client/src/a.ts b/client/src/a.ts",
    "--- a/client/src/a.ts",
    "+++ b/client/src/a.ts",
    "@@ -10,2 +10,3 @@ function a() {",
    "@@ -40 +41 @@",
    "@@ -60,4 +61,0 @@",
    "diff --git a/server/src/gone.ts b/server/src/gone.ts",
    "--- a/server/src/gone.ts",
    "+++ /dev/null",
    "@@ -1,9 +0,0 @@",
    "diff --git a/server/src/new.ts b/server/src/new.ts",
    "--- /dev/null",
    "+++ b/server/src/new.ts",
    "@@ -0,0 +1,25 @@",
  ].join("\n");

  assert.deepEqual(
    changedLines(diff),
    new Map([
      [
        "client/src/a.ts",
        [
          [10, 12],
          [41, 41],
        ],
      ],
      ["server/src/new.ts", [[1, 25]]],
    ]),
  );
});

test("a clone is the branch's when either place meets a changed line, edges included; the rest are pre-existing", () => {
  const changed = new Map([["client/src/a.ts", [[10, 12]]]]);
  const report = {
    duplicates: [
      clone(9, ["client/src/a.ts", 1, 9], ["client/src/b.ts", 1, 9]),
      clone(8, ["client/src/b.ts", 30, 37], ["client/src/a.ts", 12, 19]),
      clone(20, ["client/src/a.ts", 3, 22], ["client/src/c.ts", 3, 22]),
      clone(11, ["client/src/a.ts", 13, 23], ["client/src/a.ts", 40, 50]),
      clone(30, ["client/src/b.ts", 1, 30], ["client/src/c.ts", 50, 79]),
    ],
  };

  assert.deepEqual(
    newClones(report, changed, ROOT).map((found) => describe(found, ROOT)),
    [
      "20 lines: client/src/a.ts:3-22 and client/src/c.ts:3-22",
      "8 lines: client/src/b.ts:30-37 and client/src/a.ts:12-19",
    ],
  );
});

test("the script: only the clone the branch's commit reaches, then the count on stderr", (t) => {
  const lines = (prefix, count) =>
    Array.from({ length: count }, (_, i) => `${prefix}${i + 1}`).join("\n");
  const root = realpathSync(
    repository(t, "new-clones", {
      "client/src/a.ts": `${lines("a", 30)}\n`,
      "client/src/b.ts": `${lines("b", 30)}\n`,
    }),
  );
  git(root, "add", ".");
  git(root, "commit", "--quiet", "-m", "main");
  git(root, "branch", "-M", "main");
  git(root, "switch", "--quiet", "-c", "feature");
  write(
    root,
    "client/src/a.ts",
    `${lines("a", 20)}\nchanged\n${lines("z", 9)}\n`,
  );
  git(root, "commit", "--quiet", "-am", "feature");
  write(
    root,
    REPORT,
    JSON.stringify({
      duplicates: [
        clone(10, ["client/src/a.ts", 1, 10], ["client/src/b.ts", 1, 10], root),
        clone(
          12,
          ["client/src/a.ts", 15, 26],
          ["client/src/b.ts", 15, 26],
          root,
        ),
      ],
    }),
  );

  const run = spawnSync("node", [SCRIPT, "main"], {
    cwd: root,
    encoding: "utf8",
  });

  assert.equal(run.status, 0, run.stderr);
  assert.equal(
    run.stdout,
    "12 lines: client/src/a.ts:15-26 and client/src/b.ts:15-26\n",
  );
  assert.equal(
    run.stderr,
    "1 of the report's 2 clones in the branch's changed lines.\n",
  );
});

test("the script, with no report: exit 1, saying to run jscpd first", (t) => {
  const root = repository(t, "new-clones-none", { "a.txt": "a\n" });
  git(root, "add", ".");
  git(root, "commit", "--quiet", "-m", "main");

  const run = spawnSync("node", [SCRIPT, "HEAD"], {
    cwd: root,
    encoding: "utf8",
  });

  assert.equal(run.status, 1);
  assert.match(
    run.stderr,
    /^No tmp\/jscpd\/jscpd-report\.json: run jscpd first/,
  );
});
