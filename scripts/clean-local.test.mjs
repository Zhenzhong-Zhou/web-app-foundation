/**
 * Tests for clean-local.sh, on Node's own runner: scripts/ sits outside
 * both packages, so neither one's Vitest would find them.
 *
 *     node --test scripts/
 *
 * What a run lists and removes, Docker's clean-up, the Mac's sleep, and
 * worktrees and stashes. Docker and sleep are checked on the runs the
 * others make, each with the options it needs, rather than on runs of
 * their own. clean-local-branches.test.mjs tests the branches still open
 * and a run offline, clean-local-refusals.test.mjs the guards; what they
 * share, the checkout among it, is in clean-local-fixture.mjs.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

import {
  checkout,
  clean,
  CURRENT,
  filesIn,
  foldersOf,
  PLAYWRIGHT,
  UNREAD,
} from "./clean-local-fixture.mjs";
import { folder, git, write } from "./git-fixture.mjs";

/** What docker is asked on every run where it answers: never a prune. */
const SHOWN = ["info", "system df"];

const SLEEP_WARNING =
  /SleepDisabled is 1\. To let it sleep again:\n {2}sudo pmset -a disablesleep 0$/m;

test("each output folder the Playwright configurations name is read, as a quoted literal", () => {
  assert.deepEqual(UNREAD, []);
});

test("the dry run removes nothing, names each folder and Docker's clean-up with what --yes does, and warns a Mac that never sleeps", (t) => {
  const root = checkout(t);
  const before = filesIn(root);
  const run = clean(t, root, ["--docker"], { sleepDisabled: 1 });

  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(filesIn(root), before);
  assert.deepEqual(foldersOf(run), {
    "tmp/adr-090": `keep: the current branch's, ${CURRENT}`,
    "tmp/docs-tidy": "remove: merged by #15, docs-tidy",
    "tmp/fix-12": "remove: merged by #12, fix-12-rate-limit",
    "tmp/someday": "keep: no branch merged into main by that name",
    ...Object.fromEntries(PLAYWRIGHT.map((output) => [output, "remove"])),
  });
  assert.match(
    run.stdout,
    /^Dry run: nothing removed\. --yes removes what is marked remove: \d+ KB\.$/m,
  );

  assert.deepEqual(run.docker, SHOWN);
  assert.match(run.stdout, /would run: docker image prune --force$/m);
  assert.match(
    run.stdout,
    /would run: docker builder prune --force --filter until=168h$/m,
  );
  assert.match(run.stdout, SLEEP_WARNING);
});

test("--yes removes the merged branches' tmp/ folders and Playwright's, and nothing else, Docker's clean-up not without --docker", (t) => {
  const root = checkout(t);
  const run = clean(t, root, ["--yes"]);

  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^Removed what is marked remove: \d+ KB\.$/m);
  assert.deepEqual(filesIn(root), [
    ".env",
    ".gitignore",
    "README.md",
    "client/screenshots/out/home.png",
    "server/storage/org-1/invoice.pdf",
    "tmp/adr-090/brief.md",
    "tmp/plan-feature.zip",
    "tmp/someday/notes.md",
  ]);

  assert.deepEqual(run.docker, SHOWN);
  assert.doesNotMatch(run.stdout, /SleepDisabled/);
});

test("worktrees and stashes are listed and kept, and --docker --yes prunes images and build cache, never a container or a volume", (t) => {
  const root = checkout(t);
  const worktree = path.join(folder(t, "clean-local-worktree"), "spike");
  git(root, "worktree", "add", "--quiet", "-b", "spike", worktree);
  write(root, "README.md", "# The app, half changed\n");
  git(root, "stash", "push", "--quiet", "-m", "half a thought");
  const run = clean(t, root, ["--docker", "--yes"]);

  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^ {2}\S+ +[0-9a-f]+ \[spike\]$/m);
  assert.match(run.stdout, /^ {2}stash@\{0\}: On [\w-]+: half a thought$/m);
  assert.equal(git(root, "worktree", "list").trimEnd().split("\n").length, 2);
  assert.match(git(root, "stash", "list"), /half a thought/);

  assert.deepEqual(run.docker, [
    ...SHOWN,
    "image prune --force",
    "builder prune --force --filter until=168h",
  ]);
});
