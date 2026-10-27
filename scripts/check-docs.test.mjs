/**
 * Tests for check-docs.mjs, on Node's own runner: scripts/ sits outside
 * both packages, so neither one's Vitest would find them.
 *
 *     node --test scripts/
 *
 * Each test copies the script into a temporary repository of a few
 * Markdown files and runs it there, since it checks the repository it sits
 * in. git init is enough: the files are listed as git would track them,
 * committed or not.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function write(root, file, text) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
}

/** A temporary repository: the script, a .gitignore of tmp/, and the files. */
function fixture(t, files) {
  const root = mkdtempSync(path.join(tmpdir(), "check-docs-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  execFileSync("git", ["init", "--quiet"], { cwd: root });
  write(root, ".gitignore", "tmp/\n");
  mkdirSync(path.join(root, "scripts"));
  copyFileSync(
    path.join(ROOT, "scripts/check-docs.mjs"),
    path.join(root, "scripts/check-docs.mjs"),
  );
  for (const [file, text] of Object.entries(files)) write(root, file, text);
  return root;
}

/** The fixture's copy of the script, run as verify.sh runs it. */
const check = (root) =>
  spawnSync(process.execPath, [path.join(root, "scripts/check-docs.mjs")], {
    encoding: "utf8",
  });

/** A run that failed, and the failures it printed, each on its line. */
function failures(run) {
  assert.equal(run.status, 1, run.stdout);
  return run.stderr.trimEnd().split("\n").slice(0, -1);
}

const GUIDE = "# Guide\n\n## Setup\n\nThe steps.\n";

test("a link to a file, to a heading there, and within a file passes", (t) => {
  const root = fixture(t, {
    "README.md": `# Readme

See [the guide](docs/guide.md), [its setup](docs/guide.md#setup),
[the folder](docs/) and [the end](#the-end).

## The end
`,
    "docs/guide.md": GUIDE,
  });

  const run = check(root);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(
    run.stdout,
    "Links in 2 Markdown files: 3 to files and folders, 1 to headings in their own file; none broken.\n",
  );
});

test("a missing file is reported by file and line", (t) => {
  const root = fixture(t, {
    "README.md": "# Readme\n\nSee\n[the guide](docs/gone.md).\n",
  });

  assert.deepEqual(failures(check(root)), [
    "README.md:4: docs/gone.md — no such file or folder",
  ]);
});

test("a missing heading is reported, in another file or the same one", (t) => {
  const root = fixture(t, {
    "README.md":
      "# Readme\n\n[Teardown](docs/guide.md#teardown), [here](#nope).\n",
    "docs/guide.md": GUIDE,
  });

  assert.deepEqual(failures(check(root)), [
    "README.md:3: docs/guide.md#teardown — no such heading or anchor there",
    "README.md:3: #nope — no such heading or anchor there",
  ]);
});

test("a repeated heading's anchor takes -1, and a heading in a fence none", (t) => {
  const root = fixture(t, {
    "README.md": `# Readme

## Notes

\`\`\`sh
## Notes
\`\`\`

## Notes

[First](#notes), [second](#notes-1), [third](#notes-2).
`,
  });

  assert.deepEqual(failures(check(root)), [
    "README.md:11: #notes-2 — no such heading or anchor there",
  ]);
});

test("anchors are GitHub's: an em dash, apostrophes, backticks, Chinese", (t) => {
  const root = fixture(t, {
    "docs/adr.md": `# ADRs

## ADR-082 — The product's brand

## Words you’ll meet

## Verify (\`scripts/verify.sh\`'s own header)

## 品牌
`,
    "README.md": `# Readme

[The brand](docs/adr.md#adr-082--the-products-brand),
[words](docs/adr.md#words-youll-meet),
[verify](docs/adr.md#verify-scriptsverifyshs-own-header),
[品牌](docs/adr.md#品牌), and escaped, [品牌](docs/adr.md#%E5%93%81%E7%89%8C).
`,
  });

  const run = check(root);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /: 5 to files and folders, 0 /);
});

test("app routes, other sites, front matter, fences, inline code and tmp/ are skipped", (t) => {
  const root = fixture(t, {
    "README.md": `---
description: Data, not text, so not [a link](gone.md).
---

# Readme

[Stock](/inventory), [a role](/members#role), [a site](https://example.com/gone.md),
[mail](mailto:a@example.com) and [no scheme](//example.com/gone.md).

1. In a list:

   ~~~md
   [In a fence](gone.md)
   ~~~

Not a link: \`[inline](gone.md)\`, nor this, wrapped: \`[inline
code](gone.md)\`.
`,
    "tmp/brief.md": "# Brief\n\n[Scratch](gone.md)\n",
  });

  const run = check(root);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /: 0 to files and folders, 0 to headings/);
});

test("a reference definition is checked as an inline link is", (t) => {
  const root = fixture(t, {
    "README.md": `# Readme

See [the guide][guide] and [what was there][gone].

[guide]: docs/guide.md#setup
[gone]: docs/gone.md
`,
    "docs/guide.md": GUIDE,
  });

  assert.deepEqual(failures(check(root)), [
    "README.md:6: docs/gone.md — no such file or folder",
  ]);
});

test("a path must be in the repository, in the case GitHub's names are", (t) => {
  const root = fixture(t, {
    "README.md": "# Readme\n\n[Guide](Docs/guide.md), [above](../README.md).\n",
    "docs/guide.md": GUIDE,
  });

  const [cased, above, ...rest] = failures(check(root));
  // macOS finds Docs/ for docs/ and so says why; Linux finds nothing.
  assert.match(
    cased,
    /^README\.md:3: Docs\/guide\.md — no such file or folder/,
  );
  assert.equal(above, "README.md:3: ../README.md — outside the repository");
  assert.deepEqual(rest, []);
});
