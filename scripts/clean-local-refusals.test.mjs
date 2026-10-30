/**
 * Tests for clean-local.sh's guards, on Node's own runner: each folder it
 * must never remove is refused, and nothing is removed.
 *
 *     node --test scripts/
 *
 * The checkout and the run are clean-local-fixture.mjs's.
 */
import assert from "node:assert/strict";
import { existsSync, rmSync, symlinkSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { checkout, clean, filesIn } from "./clean-local-fixture.mjs";
import { folder, git, write } from "./git-fixture.mjs";

/** How each refusal is set up, by the reason it gives for tmp/fix-12. */
const REFUSALS = {
  "holds files git tracks": (root) => {
    git(root, "add", "--force", "tmp/fix-12/brief.md");
    git(root, "commit", "--quiet", "-m", "A brief, force-added");
  },
  "is a symlink": (root, outside) => {
    rmSync(path.join(root, "tmp/fix-12"), { recursive: true });
    symlinkSync(path.join(outside, "fix-12"), path.join(root, "tmp/fix-12"));
  },
  "leads outside the repository": (root, outside) => {
    rmSync(path.join(root, "tmp"), { recursive: true });
    symlinkSync(outside, path.join(root, "tmp"));
  },
  "holds a .env file": (root) =>
    write(root, "tmp/fix-12/.env.backup", "SESSION_SECRET=secret\n"),
};

for (const [why, arrange] of Object.entries(REFUSALS)) {
  test(`--yes refuses tmp/fix-12 when it ${why}, and removes nothing`, (t) => {
    const root = checkout(t);
    const outside = folder(t, "clean-local-outside");
    write(outside, "fix-12/brief.md", "Not the repository's.\n");
    arrange(root, outside);
    const before = filesIn(root);
    const run = clean(t, root, ["--yes"]);

    assert.equal(run.status, 1, run.stdout);
    assert.match(run.stderr, new RegExp(`^Refused: tmp/fix-12 ${why}`));
    assert.deepEqual(filesIn(root), before);
    assert.ok(existsSync(path.join(outside, "fix-12/brief.md")));
  });
}
