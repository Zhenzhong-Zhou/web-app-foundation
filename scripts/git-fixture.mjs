/**
 * A throwaway git repository, for the tests of scripts/ that run a script
 * in one: check-docs.mjs's (through check-docs-fixture.mjs), adr-index.mjs's,
 * i18n-review.mjs's, pack-chat-skill.mjs's and clean-local.sh's (through
 * clean-local-fixture.mjs). Not a test file, so node --test runs nothing
 * here.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export function write(root, file, text) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
}

/**
 * git in the repository, as a person with no identity of their own: one
 * given, as CI's runner has none, and no signing, which would ask for a key.
 */
export const git = (root, ...args) =>
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "-c",
      "commit.gpgsign=false",
      ...args,
    ],
    { cwd: root, encoding: "utf8" },
  );

/** A temporary folder, removed when the test ends. */
export function folder(t, name) {
  const made = mkdtempSync(path.join(tmpdir(), `${name}-`));
  t.after(() => rmSync(made, { recursive: true, force: true }));
  return made;
}

/** A temporary repository holding the files, removed when the test ends. */
export function repository(t, name, files = {}) {
  const root = folder(t, name);
  git(root, "init", "--quiet");
  for (const [file, text] of Object.entries(files)) write(root, file, text);
  return root;
}
