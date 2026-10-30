/**
 * Tests for clean-local.sh's branches, on Node's own runner: a tmp/
 * folder that a branch not merged yet also matches, and a run offline.
 *
 *     node --test scripts/
 *
 * The checkout and the run are clean-local-fixture.mjs's.
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { checkout, clean, CURRENT, foldersOf } from "./clean-local-fixture.mjs";
import { git, write } from "./git-fixture.mjs";

/** Where fix-316-followup, not merged yet, is: set up from a local branch. */
const FOLLOWUP = {
  locally: () => {},
  "on origin alone": (root) => {
    git(root, "push", "--quiet", "origin", "fix-316-followup");
    git(root, "branch", "--quiet", "-D", "fix-316-followup");
  },
};

for (const [where, arrange] of Object.entries(FOLLOWUP)) {
  test(`tmp/fix-316 stays while fix-316-followup is open ${where}, though fix-316-rate-limit has merged`, (t) => {
    const root = checkout(t);
    write(root, "tmp/fix-316/brief.md", "Both fix-316 branches' brief.\n");
    git(root, "checkout", "--quiet", "-b", "fix-316-followup", "main");
    git(root, "commit", "--quiet", "--allow-empty", "-m", "Follow fix-316 up");
    git(root, "checkout", "--quiet", CURRENT);
    arrange(root);
    const run = clean(t, root, ["--yes"]);

    assert.equal(run.status, 0, run.stderr);
    assert.equal(
      foldersOf(run)["tmp/fix-316"],
      "keep: a branch not merged yet, fix-316-followup",
    );
    assert.ok(existsSync(path.join(root, "tmp/fix-316/brief.md")));
  });
}

test("offline, it says so and uses origin/main as last fetched, or has none", (t) => {
  const fetched = checkout(t);
  git(fetched, "fetch", "--quiet", "origin");
  const never = checkout(t);
  for (const root of [fetched, never]) {
    git(root, "remote", "set-url", "origin", path.join(root, ".git/no-origin"));
  }

  const run = clean(t, fetched);
  assert.equal(run.status, 0, run.stderr);
  assert.match(
    run.stdout,
    /^Could not fetch origin, offline perhaps: using origin\/main as last fetched\.$/m,
  );
  assert.equal(
    foldersOf(run)["tmp/fix-12"],
    "remove: merged by #12, fix-12-rate-limit",
  );

  const none = clean(t, never);
  assert.equal(none.status, 0, none.stderr);
  assert.match(
    none.stdout,
    /^No origin\/main: no tmp\/ folder can be matched to a merged branch\.$/m,
  );
  assert.equal(
    foldersOf(none)["tmp/fix-12"],
    "keep: no branch merged into main by that name",
  );
});
