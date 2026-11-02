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
 * folder, never over tmp/plan-feature.zip. The guard's tests clone a
 * temporary repository whose main holds a skill, so origin is a folder
 * and never GitHub.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { folder, git, repository, write } from "./git-fixture.mjs";
import { checkSkill, pack, uploaded, whyNotMain } from "./pack-chat-skill.mjs";

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
        "[Spaced](<reference/a b.md>) and [bracketed](reference/x(1).md) too.",
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
    "reference/a b.md": "Spaced.\n",
    "reference/x(1).md": "Bracketed.\n",
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

test("a name holding anthropic or claude, words an upload reserves, fails", (t) => {
  const description = "description: Plans a feature.\n";
  assert.deepEqual(
    failuresOf(t, `name: claude-planner\n${description}`, "claude-planner"),
    [
      "claude-planner/SKILL.md: name claude-planner holds claude, a word claude.ai reserves",
    ],
  );
  assert.deepEqual(
    failuresOf(t, `name: plan-anthropic\n${description}`, "plan-anthropic"),
    [
      "plan-anthropic/SKILL.md: name plan-anthropic holds anthropic, a word claude.ai reserves",
    ],
  );
});

test("a name or a description holding an XML tag fails", (t) => {
  assert.deepEqual(
    failuresOf(t, "name: <b>\ndescription: Plans a feature.\n", "<b>"),
    [
      "<b>/SKILL.md: name <b> holds more than lower-case letters, digits and hyphens",
      "<b>/SKILL.md: name holds an XML tag, <b>",
    ],
  );
  const name = "name: plan-feature\n";
  assert.deepEqual(
    failuresOf(t, `${name}description: Plans a </feature> for Bob.\n`),
    ["plan-feature/SKILL.md: description holds an XML tag, </feature>"],
  );
  assert.deepEqual(
    failuresOf(t, `${name}description: Plans when a < b and b > c.\n`),
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

test("a front matter line that is not a field on one line fails, named by its number", (t) => {
  const folded = [
    "name: plan-feature",
    "description: >-",
    `  Plans a feature, ${"over many lines ".repeat(70)}`,
    "  with <b>a tag</b>.",
    "",
  ].join("\n");
  assert.deepEqual(failuresOf(t, folded), [
    "plan-feature/SKILL.md: line 4 is not a field on one line, key: value, as the front matter's lines must be",
    "plan-feature/SKILL.md: line 5 is not a field on one line, key: value, as the front matter's lines must be",
  ]);
});

test("a value holding a colon and a space fails unless in quotes, named by its key", (t) => {
  const name = "name: plan-feature\n";
  assert.deepEqual(
    failuresOf(
      t,
      `${name}description: The routine, in its Project: for the chat.\nlicense: See LICENSE: all rights.\n`,
    ),
    [
      "plan-feature/SKILL.md: description holds a colon and a space, not in quotes, which a YAML reader refuses: put its value in double quotes",
      "plan-feature/SKILL.md: license holds a colon and a space, not in quotes, which a YAML reader refuses: put its value in double quotes",
    ],
  );
  for (const quoted of [
    `"The routine, in its Project: for the chat."`,
    `'The routine, in its Project: for the chat.'`,
  ]) {
    assert.deepEqual(failuresOf(t, `${name}description: ${quoted}\n`), []);
  }
  assert.deepEqual(
    failuresOf(t, `${name}description: The routine, at 9:30 each day.\n`),
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

/**
 * A repository whose main holds a skill, and a clone of it at main: the
 * first's root, as origin, and the clone's skill folder.
 */
function cloned(t) {
  const origin = path.dirname(skill(t, { "SKILL.md": skillMd(FRONT_MATTER) }));
  git(origin, "symbolic-ref", "HEAD", "refs/heads/main");
  git(origin, "add", ".");
  git(origin, "commit", "--quiet", "-m", "The skill");

  const clone = folder(t, "pack-chat-skill-clone");
  git(clone, "clone", "--quiet", origin, ".");
  return { origin, folder: path.join(clone, "plan-feature") };
}

const NOT_MAIN =
  "This is not origin/main's commit, and the skill is packed only from main: merge its change first, then pack on main, pulled.";

test("the pack goes ahead at origin/main's commit, a change outside the skill's folder aside", (t) => {
  const { folder } = cloned(t);
  assert.equal(whyNotMain(folder), null);

  write(path.dirname(folder), "notes.md", "Not the skill's.\n");
  assert.equal(whyNotMain(folder), null);
});

test("the pack is refused on a branch ahead of main", (t) => {
  const { folder } = cloned(t);
  git(folder, "switch", "--quiet", "-c", "a-feature");
  write(folder, "SKILL.md", skillMd(FRONT_MATTER, "# A change\n"));
  git(folder, "commit", "--quiet", "-am", "A change");
  assert.equal(whyNotMain(folder), NOT_MAIN);
});

test("the pack is refused behind origin's main, as fetched now", (t) => {
  const { origin, folder } = cloned(t);
  write(origin, "plan-feature/SKILL.md", skillMd(FRONT_MATTER, "# Merged\n"));
  git(origin, "commit", "--quiet", "-am", "Merged since");
  assert.equal(whyNotMain(folder), NOT_MAIN);
});

test("the pack is refused with the skill's folder changed, or a file added to it", (t) => {
  const { folder } = cloned(t);
  write(folder, "SKILL.md", skillMd(FRONT_MATTER, "# A change\n"));
  write(folder, "reference/new.md", "Not committed.\n");
  assert.equal(
    whyNotMain(folder),
    "The skill's folder has changes not committed, plan-feature/SKILL.md, plan-feature/reference/new.md: commit or restore them, then pack again, since an upload is main's copy.",
  );
});

test("the pack is refused when origin cannot be reached", (t) => {
  const { folder } = cloned(t);
  git(folder, "remote", "set-url", "origin", path.join(folder, "nowhere"));
  assert.equal(
    whyNotMain(folder),
    "Could not fetch main from origin, so whether this is main's commit is unknown: the skill is packed only from main, so run this again once origin can be reached.",
  );
});

/** Why the archive's tests are skipped, or false when they run. */
const noZip =
  ["zip", "unzip"].some((tool) => spawnSync(tool, ["-v"]).error) &&
  "no zip or unzip on this machine";

/** An archive's path in a temporary folder, removed when the test ends. */
const archiveIn = (t) =>
  path.join(folder(t, "pack-chat-skill"), "plan-feature.zip");

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
