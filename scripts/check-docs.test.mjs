/**
 * Tests for check-docs.mjs: the links. On Node's own runner, since scripts/
 * sits outside both packages, so neither one's Vitest would find them.
 *
 *     node --test scripts/
 *
 * What they share is in check-docs-fixture.mjs.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

import { check, failures, fixture, GUIDE } from "./check-docs-fixture.mjs";

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
  assert.match(run.stdout, /: 3 to files and folders, 1 to headings/);
  // Run from a folder inside it, it checks the same repository.
  assert.equal(check(path.join(root, "docs")).stdout, run.stdout);
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

test("a path must be one git tracks, in the case GitHub's names are", (t) => {
  const root = fixture(t, {
    "README.md":
      "# Readme\n\n[Guide](Docs/guide.md), [above](../README.md),\n[notes](tmp/notes.md).\n",
    "docs/guide.md": GUIDE,
    // On this disk, but ignored, so not in a fresh checkout.
    "tmp/notes.md": "# Notes\n",
  });

  assert.deepEqual(failures(check(root)), [
    "README.md:3: Docs/guide.md — no such file or folder: names are case-sensitive on GitHub",
    "README.md:3: ../README.md — outside the repository",
    "README.md:4: tmp/notes.md — not in the repository: git ignores it, so a fresh checkout, as CI's, has none",
  ]);
});
