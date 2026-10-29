/**
 * Tests for pack-chat-skill.mjs, on Node's own runner: scripts/ sits
 * outside both packages, so neither one's Vitest would find them.
 *
 *     node --test scripts/
 *
 * The skill itself must pass, so a change claude.ai would refuse fails
 * scripts/verify.sh and CI. Each failure comes from a small skill in a
 * temporary repository, its files listed as git would track them. Where
 * the system has zip and unzip, the archive is made into a temporary
 * folder, never over tmp/plan-feature.zip.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { repository } from "./git-fixture.mjs";
import { checkSkill, pack, uploaded } from "./pack-chat-skill.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKILL = path.join(ROOT, ".claude/chat-skills/plan-feature");

/** SKILL.md: its front matter's lines, then its text. */
const skillMd = (frontMatter, text = "# A skill\n") =>
  `---\n${frontMatter}---\n\n${text}`;

const FRONT_MATTER = "name: plan-feature\ndescription: Plans a feature.\n";

/** A skill's folder in a temporary repository, holding the files. */
function skill(t, files, name = "plan-feature") {
  const root = repository(t, "pack-chat-skill", {
    ".gitignore": ".DS_Store\n",
    ...Object.fromEntries(
      Object.entries(files).map(([file, text]) => [`${name}/${file}`, text]),
    ),
  });
  return path.join(root, name);
}

/** Each failure's file and reason, for a skill of SKILL.md alone. */
const failuresOf = (t, frontMatter, name) =>
  checkSkill(skill(t, { "SKILL.md": skillMd(frontMatter) }, name));

test("the skill itself passes the upload's checks", () => {
  assert.deepEqual(checkSkill(SKILL), []);
});

test("the upload is what git tracks or would track, but evals.md", (t) => {
  const folder = skill(t, {
    "SKILL.md": skillMd(FRONT_MATTER),
    "reference/format.md": "The format.\n",
    "evals.md": "Walked by hand.\n",
    ".DS_Store": "Finder's.\n",
  });
  assert.deepEqual(uploaded(folder), ["SKILL.md", "reference/format.md"]);
});

test("links that lead to an uploaded file pass, and none in code is read", (t) => {
  const folder = skill(t, {
    "SKILL.md": skillMd(
      FRONT_MATTER,
      [
        "See [the format](reference/format.md#top), [a site](https://example.com),",
        "[the root](/SKILL.md) and `[code](missing.md)`.",
        "",
        "```md",
        "[fenced](missing.md)",
        "```",
        "",
        "[defined]: reference/format.md",
        "",
      ].join("\n"),
    ),
    "reference/format.md": "Back to [the skill](../SKILL.md).\n",
  });
  assert.deepEqual(checkSkill(folder), []);
});

test("a skill with no SKILL.md, or none with front matter, fails", (t) => {
  assert.deepEqual(checkSkill(skill(t, { "README.md": "# A skill\n" })), [
    "plan-feature/SKILL.md: no such file, and a skill is its SKILL.md",
  ]);
  assert.deepEqual(checkSkill(skill(t, { "SKILL.md": "# A skill\n" })), [
    "plan-feature/SKILL.md: no front matter, between --- lines at its start",
  ]);
});

test("a name missing, not the folder's, of other characters or over 64 fails", (t) => {
  const description = "description: Plans a feature.\n";
  assert.deepEqual(failuresOf(t, description), [
    "plan-feature/SKILL.md: no name in its front matter",
  ]);
  assert.deepEqual(failuresOf(t, `name: plan-features\n${description}`), [
    "plan-feature/SKILL.md: name plan-features is not its folder's, plan-feature",
  ]);
  assert.deepEqual(
    failuresOf(t, `name: Plan_Feature\n${description}`, "Plan_Feature"),
    [
      "Plan_Feature/SKILL.md: name Plan_Feature holds more than lower-case letters, digits and hyphens",
    ],
  );

  const long = "a".repeat(65);
  assert.deepEqual(failuresOf(t, `name: ${long}\n${description}`, long), [
    `${long}/SKILL.md: name is 65 characters, over 64`,
  ]);
  const longest = "a".repeat(64);
  assert.deepEqual(
    failuresOf(t, `name: ${longest}\n${description}`, longest),
    [],
  );
});

test("a description missing, empty or over 1,024 characters fails", (t) => {
  const name = "name: plan-feature\n";
  for (const frontMatter of [name, `${name}description:\n`]) {
    assert.deepEqual(failuresOf(t, frontMatter), [
      "plan-feature/SKILL.md: no description in its front matter",
    ]);
  }
  assert.deepEqual(failuresOf(t, `${name}description: ${"é".repeat(1025)}\n`), [
    "plan-feature/SKILL.md: description is 1025 characters, over 1,024",
  ]);
  assert.deepEqual(
    failuresOf(t, `${name}description: "${"é".repeat(1024)}"\n`),
    [],
  );
});

test("a link to no file, outside the folder or to evals.md fails, named with its file", (t) => {
  const folder = skill(t, {
    "SKILL.md": skillMd(
      FRONT_MATTER,
      "See [the format](reference/formats.md) and [the tests](evals.md).\n",
    ),
    "reference/format.md":
      "See [the agreements](../../docs/engineering.md) and [bad](%E0).\n",
    "evals.md": "Walked by hand.\n",
  });
  assert.deepEqual(checkSkill(folder), [
    "plan-feature/SKILL.md: reference/formats.md leads to no file in the skill",
    "plan-feature/SKILL.md: evals.md leads to evals.md, which is not uploaded",
    "plan-feature/reference/format.md: ../../docs/engineering.md leads outside the skill's folder",
    "plan-feature/reference/format.md: %E0 is not a valid link: its %-escapes do not decode",
  ]);
});

/** Why the archive's tests are skipped, or false when they run. */
const noZip =
  ["zip", "unzip"].some((tool) => spawnSync(tool, ["-v"]).error) &&
  "no zip or unzip on this machine";

/** An archive's path in a temporary folder, removed when the test ends. */
function archiveIn(t) {
  const folder = mkdtempSync(path.join(tmpdir(), "pack-chat-skill-"));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  return path.join(folder, "plan-feature.zip");
}

/** The entries an archive lists, each on its line. */
const entriesOf = (archive) =>
  spawnSync("unzip", ["-Z1", archive], { encoding: "utf8" })
    .stdout.trimEnd()
    .split("\n");

test(
  "the archive holds plan-feature/ at its root, every file but evals.md",
  { skip: noZip },
  (t) => {
    const archive = archiveIn(t);
    assert.equal(pack(SKILL, archive).status, 0);

    const entries = entriesOf(archive);
    assert.equal(entries[0], "plan-feature/");
    assert.ok(entries.every((entry) => entry.startsWith("plan-feature/")));
    assert.ok(!entries.includes("plan-feature/evals.md"));
    assert.deepEqual(
      entries.filter((entry) => !entry.endsWith("/")),
      uploaded(SKILL).map((file) => `plan-feature/${file}`),
    );
  },
);

test(
  "the archive is written fresh, with no file the skill no longer has",
  { skip: noZip },
  (t) => {
    const archive = archiveIn(t);
    const folder = skill(t, {
      "SKILL.md": skillMd(FRONT_MATTER),
      "reference/old.md": "Since removed.\n",
    });
    assert.equal(pack(folder, archive).status, 0);
    rmSync(path.join(folder, "reference"), { recursive: true });

    assert.equal(pack(folder, archive).status, 0);
    assert.deepEqual(entriesOf(archive), [
      "plan-feature/",
      "plan-feature/SKILL.md",
    ]);
  },
);
