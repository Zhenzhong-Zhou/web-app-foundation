/**
 * Tests for prune-branches.sh, on Node's own runner:
 *
 *     node --test scripts/
 *
 * Each test runs the script in a temporary clone of a bare origin, with a
 * second working folder (git worktree) on a branch already merged into
 * main. The script runs through /bin/bash, the Mac's 3.2 where the tests
 * run on a Mac.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { folder, git, write } from "./git-fixture.mjs";

const SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "prune-branches.sh",
);

/**
 * A clone whose origin's main holds a, with two branches merged into it
 * (done-here, done-there) and one not (open-work); done-there is checked
 * out in a second folder, and the clone is on a branch of its own.
 */
function checkout(t) {
  const base = folder(t, "prune");
  const origin = path.join(base, "origin.git");
  const seed = path.join(base, "seed");
  const main = path.join(base, "main");
  const other = path.join(base, "other");
  git(base, "init", "--quiet", "--bare", "--initial-branch=main", origin);
  git(base, "clone", "--quiet", origin, seed);
  git(seed, "switch", "--quiet", "-c", "main");
  write(seed, "a.txt", "a\n");
  git(seed, "add", "a.txt");
  git(seed, "commit", "--quiet", "-m", "a");
  git(seed, "push", "--quiet", "origin", "main");
  git(base, "clone", "--quiet", origin, main);
  // Merged branches sit on a commit main already has.
  git(main, "branch", "done-here");
  git(main, "branch", "done-there");
  git(main, "switch", "--quiet", "-c", "open-work");
  write(main, "b.txt", "b\n");
  git(main, "add", "b.txt");
  git(main, "commit", "--quiet", "-m", "b");
  git(main, "switch", "--quiet", "-c", "current");
  git(main, "worktree", "add", "--quiet", other, "done-there");
  return { main, other };
}

const run = (cwd, ...args) =>
  spawnSync("/bin/bash", [SCRIPT, "--local-only", ...args], {
    cwd,
    encoding: "utf8",
  });

test("the dry run lists a branch another folder has checked out as kept", (t) => {
  const { main, other } = checkout(t);
  const result = run(main);
  assert.equal(result.status, 0, result.stderr);
  const line = result.stdout.split("\n").find((l) => l.includes("done-there"));
  assert.match(line, /^\s+keep\s+done-there\s+in /);
  assert.ok(line.endsWith(path.basename(other)), line);
  assert.match(result.stdout, /delete\s+done-here\s+merged/);
});

test("--yes deletes the others, leaves that branch, and exits 0", (t) => {
  const { main } = checkout(t);
  const result = run(main, "--yes");
  assert.equal(result.status, 0, result.stderr);
  const branches = git(main, "branch", "--format=%(refname:short)")
    .split("\n")
    .filter(Boolean);
  assert.ok(branches.includes("done-there"), branches.join());
  assert.ok(!branches.includes("done-here"), branches.join());
  assert.ok(branches.includes("open-work"), branches.join());
});
