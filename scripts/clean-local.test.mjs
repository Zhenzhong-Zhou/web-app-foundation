/**
 * Tests for clean-local.sh, on Node's own runner: scripts/ sits outside
 * both packages, so neither one's Vitest would find them.
 *
 *     node --test scripts/
 *
 * Each test runs the script in a temporary checkout: a repository whose
 * main merged three branches, as GitHub merges a pull request, pushed to a
 * bare origin the script fetches from; on a branch of its own, with tmp/
 * and Playwright's output folders filled. Stand-ins for docker and pmset
 * come first on the PATH, docker recording each call. The script runs
 * through /bin/bash, the Mac's 3.2 where the tests run on a Mac, so
 * anything newer than 3.2 fails here.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { git, repository, write } from "./git-fixture.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts/clean-local.sh");

/**
 * Playwright's output folders, as the client's configurations name them:
 * each one's outputDir, or test-results/ where it names none, and the HTML
 * report's playwright-report/ where it names no outputFolder; and
 * test-results/, where an older run left it. The checkout holds each, so
 * a folder a configuration names and the script does not fails the tests.
 */
function playwrightFolders() {
  const client = path.join(ROOT, "client");
  const folders = new Set(["client/test-results"]);
  const configs = readdirSync(client).filter((file) =>
    /^playwright.*\.config\.ts$/.test(file),
  );
  for (const config of configs) {
    const text = readFileSync(path.join(client, config), "utf8");
    const named = [
      ...text.matchAll(/(?:outputDir|outputFolder):\s*'([^']+)'/g),
    ].map(([, folder]) => folder);
    if (!/outputDir:/.test(text)) named.push("test-results");
    if (/'html'/.test(text) && !/outputFolder:/.test(text)) {
      named.push("playwright-report");
    }
    for (const folder of named) folders.add(path.posix.join("client", folder));
  }
  return [...folders];
}

const PLAYWRIGHT = playwrightFolders();

/** The pull requests main merged: each one's number and branch. */
const MERGED = [
  [12, "fix-12-rate-limit"],
  [15, "docs-tidy"],
  [18, "adr-090-first-part"],
];

const CURRENT = "adr-090-second-part";

/** What the checkout holds beside Playwright's folders. */
const FILES = {
  "tmp/fix-12/brief.md": "fix-12-rate-limit's, merged by #12.\n",
  "tmp/docs-tidy/notes.md": "docs-tidy's, merged by #15.\n",
  "tmp/adr-090/brief.md": "The current branch's, though #18 is adr-090's.\n",
  "tmp/someday/notes.md": "No branch's.\n",
  "tmp/plan-feature.zip": "A file in tmp/, not a branch's folder.\n",
  "client/screenshots/out/home.png": "Kept for a comparison.\n",
  ".env": "SESSION_SECRET=secret\n",
  "server/storage/org-1/invoice.pdf": "Kept by FILE_STORAGE=local.\n",
};

/** A temporary folder, removed when the test ends. */
function folder(t, name) {
  const made = mkdtempSync(path.join(tmpdir(), `${name}-`));
  t.after(() => rmSync(made, { recursive: true, force: true }));
  return made;
}

/** The checkout, as the header says, origin/main not yet fetched. */
function checkout(t) {
  const root = repository(t, "clean-local", {
    ".gitignore": "tmp/\n.env\nserver/storage/\n",
    "README.md": "# The app\n",
  });
  git(root, "add", ".");
  git(root, "commit", "--quiet", "-m", "Start");
  git(root, "branch", "-M", "main");
  for (const [number, branch] of MERGED) {
    git(root, "checkout", "--quiet", "-b", branch);
    git(root, "commit", "--quiet", "--allow-empty", "-m", `Work on ${branch}`);
    git(root, "checkout", "--quiet", "main");
    git(
      root,
      "merge",
      "--quiet",
      "--no-ff",
      "-m",
      `Merge pull request #${number} from bob/${branch}`,
      branch,
    );
    git(root, "branch", "--quiet", "-D", branch);
  }

  const origin = folder(t, "clean-local-origin");
  git(origin, "init", "--quiet", "--bare");
  git(root, "remote", "add", "origin", origin);
  git(root, "push", "--quiet", "origin", "main");
  // The push set origin/main: dropped, so only the script's fetch brings it.
  git(root, "update-ref", "-d", "refs/remotes/origin/main");
  git(root, "checkout", "--quiet", "-b", CURRENT);

  for (const [file, text] of Object.entries(FILES)) write(root, file, text);
  for (const output of PLAYWRIGHT) write(root, `${output}/run.txt`, "A run.\n");
  return root;
}

/**
 * The script, run in the checkout, its stand-ins in a folder of their own:
 * docker writes each call's arguments to docker.log, and pmset reports
 * sleepDisabled. The run, with docker's calls.
 */
function clean(t, root, args = [], { sleepDisabled = 0 } = {}) {
  const bin = folder(t, "clean-local-bin");
  const log = path.join(bin, "docker.log");
  writeFileSync(
    path.join(bin, "docker"),
    `#!/bin/sh\necho "$*" >> '${log}'\n`,
    { mode: 0o755 },
  );
  writeFileSync(
    path.join(bin, "pmset"),
    `#!/bin/sh\nprintf ' SleepDisabled\\t\\t${sleepDisabled}\\n'\n`,
    { mode: 0o755 },
  );
  const run = spawnSync("/bin/bash", [SCRIPT, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` },
  });
  const docker = existsSync(log)
    ? readFileSync(log, "utf8").trimEnd().split("\n")
    : [];
  return { ...run, docker };
}

/** Every file in the checkout, tracked or not, ignored or not. */
const filesIn = (root) =>
  git(root, "ls-files", "--cached", "--others").trimEnd().split("\n").sort();

/** Each folder the run listed: what it does with it, and why. */
const foldersOf = (run) =>
  Object.fromEntries(
    [
      ...run.stdout.matchAll(
        /^ {2}(remove|keep) +[\d.]+ [KMG]B {2}(\S+) *(.*)$/gm,
      ),
    ].map(([, action, listed, why]) => [
      listed,
      why ? `${action}: ${why}` : action,
    ]),
  );

test("the dry run removes nothing, and names each folder with what --yes does", (t) => {
  const root = checkout(t);
  const before = filesIn(root);
  const run = clean(t, root);

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
});

test("--yes removes the merged branches' tmp/ folders and Playwright's, and nothing else", (t) => {
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
});

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

test("docker shows its space, and prunes only with --docker and --yes, never a container or a volume", (t) => {
  const root = checkout(t);
  const shown = ["info", "system df"];
  assert.deepEqual(clean(t, root).docker, shown);
  assert.deepEqual(clean(t, root, ["--yes"]).docker, shown);

  const dry = clean(t, root, ["--docker"]);
  assert.deepEqual(dry.docker, shown);
  assert.match(dry.stdout, /would run: docker image prune --force$/m);
  assert.match(
    dry.stdout,
    /would run: docker builder prune --force --filter until=168h$/m,
  );

  assert.deepEqual(clean(t, root, ["--docker", "--yes"]).docker, [
    ...shown,
    "image prune --force",
    "builder prune --force --filter until=168h",
  ]);
});

test("a Mac that never sleeps is warned, with the command that lets it", (t) => {
  const root = checkout(t);
  assert.match(
    clean(t, root, [], { sleepDisabled: 1 }).stdout,
    /SleepDisabled is 1\. To let it sleep again:\n {2}sudo pmset -a disablesleep 0$/m,
  );
  assert.doesNotMatch(clean(t, root).stdout, /SleepDisabled/);
});

test("worktrees and stashes are listed, and neither is removed", (t) => {
  const root = checkout(t);
  const worktree = path.join(folder(t, "clean-local-worktree"), "spike");
  git(root, "worktree", "add", "--quiet", "-b", "spike", worktree);
  write(root, "README.md", "# The app, half changed\n");
  git(root, "stash", "push", "--quiet", "-m", "half a thought");
  const run = clean(t, root, ["--yes"]);

  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^ {2}\S+ +[0-9a-f]+ \[spike\]$/m);
  assert.match(run.stdout, /^ {2}stash@\{0\}: On [\w-]+: half a thought$/m);
  assert.equal(git(root, "worktree", "list").trimEnd().split("\n").length, 2);
  assert.match(git(root, "stash", "list"), /half a thought/);
});
