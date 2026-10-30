/**
 * What clean-local.sh's tests share, in clean-local.test.mjs (what a run
 * lists and removes, Docker, sleep, worktrees and stashes),
 * clean-local-branches.test.mjs (branches still open, and offline) and
 * clean-local-refusals.test.mjs (the guards): split so node --test, which
 * runs a file's tests in turn but the files at once, runs them side by
 * side. Not a test file, so node --test runs nothing here.
 *
 * Each test runs the script in a temporary checkout: a repository whose
 * main merged four branches, as GitHub merges a pull request, pushed to a
 * bare origin the script fetches from; on a branch of its own, with tmp/
 * and Playwright's output folders filled. The checkout and its origin are
 * built once a file and copied for each test, in a fraction of the time
 * the 29 git commands that build them take. Stand-ins for docker and pmset
 * come first on the PATH, docker recording each call. The script runs
 * through /bin/bash, the Mac's 3.2 where the tests run on a Mac, so
 * anything newer than 3.2 fails here.
 */
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { folder, git, write } from "./git-fixture.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts/clean-local.sh");

/**
 * Playwright's output folders, as the client's configurations name them:
 * each one's outputDir, or test-results/ where it names none, and the HTML
 * report's playwright-report/ where it names no outputFolder; and
 * test-results/, where an older run left it. The checkout holds each, so
 * a folder a configuration names and the script does not fails the tests.
 * And each outputDir or outputFolder given other than as a quoted
 * literal, as `config: key`, whose folder cannot be read here: a test
 * fails on it, so the check never passes without its folder.
 */
function playwrightFolders() {
  const client = path.join(ROOT, "client");
  const folders = new Set(["client/test-results"]);
  const unread = [];
  const configs = readdirSync(client).filter((file) =>
    /^playwright.*\.config\.ts$/.test(file),
  );
  for (const config of configs) {
    const text = readFileSync(path.join(client, config), "utf8");
    const named = [];
    for (const [, key, , folder] of text.matchAll(
      /(outputDir|outputFolder):\s*(?:(['"])([^'"\n]+)\2)?/g,
    )) {
      if (folder) named.push(folder);
      else unread.push(`${config}: ${key}`);
    }
    if (!/outputDir:/.test(text)) named.push("test-results");
    if (/['"]html['"]/.test(text) && !/outputFolder:/.test(text)) {
      named.push("playwright-report");
    }
    for (const folder of named) folders.add(path.posix.join("client", folder));
  }
  return { folders: [...folders], unread };
}

export const { folders: PLAYWRIGHT, unread: UNREAD } = playwrightFolders();

/** The pull requests main merged: each one's number and branch. */
const MERGED = [
  [12, "fix-12-rate-limit"],
  [15, "docs-tidy"],
  [18, "adr-090-first-part"],
  [316, "fix-316-rate-limit"],
];

export const CURRENT = "adr-090-second-part";

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

/**
 * The folder holding the checkout and its origin, as the header says,
 * origin/main not yet fetched: built on the first call, and removed when
 * the file's tests end.
 */
let built = null;
function template() {
  if (built) return built;
  built = mkdtempSync(path.join(tmpdir(), "clean-local-template-"));
  process.on("exit", () => rmSync(built, { recursive: true, force: true }));

  const root = path.join(built, "checkout");
  mkdirSync(root);
  git(root, "init", "--quiet");
  write(root, ".gitignore", "tmp/\n.env\nserver/storage/\n");
  write(root, "README.md", "# The app\n");
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

  const origin = path.join(built, "origin");
  git(built, "init", "--quiet", "--bare", origin);
  git(root, "remote", "add", "origin", origin);
  git(root, "push", "--quiet", "origin", "main");
  // The push set origin/main: dropped, so only the script's fetch brings it.
  git(root, "update-ref", "-d", "refs/remotes/origin/main");
  git(root, "checkout", "--quiet", "-b", CURRENT);

  for (const [file, text] of Object.entries(FILES)) write(root, file, text);
  for (const output of PLAYWRIGHT) write(root, `${output}/run.txt`, "A run.\n");
  return built;
}

/** A copy of the checkout, pointed at its own copy of the origin. */
export function checkout(t) {
  const made = folder(t, "clean-local");
  cpSync(template(), made, { recursive: true });
  const root = path.join(made, "checkout");
  git(root, "remote", "set-url", "origin", path.join(made, "origin"));
  return root;
}

/**
 * The script, run in the checkout, its stand-ins in a folder of their own:
 * docker writes each call's arguments to docker.log, and pmset reports
 * sleepDisabled. The run, with docker's calls.
 */
export function clean(t, root, args = [], { sleepDisabled = 0 } = {}) {
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
export const filesIn = (root) =>
  git(root, "ls-files", "--cached", "--others").trimEnd().split("\n").sort();

/** Each folder the run listed: what it does with it, and why. */
export const foldersOf = (run) =>
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
