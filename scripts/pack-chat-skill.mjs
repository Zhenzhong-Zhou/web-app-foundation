#!/usr/bin/env node
/**
 * The chat's planning skill, checked as claude.ai checks an upload, then
 * packed for it (ADR-088).
 *
 *     node scripts/pack-chat-skill.mjs            # checks, then, at main only, writes tmp/plan-feature.zip
 *     node scripts/pack-chat-skill.mjs --check    # checks only, anywhere, as the Docs workflow does
 *
 * The skill is .claude/chat-skills/plan-feature/, its files the ones git
 * tracks or would track there, so what is packed is what main's copy
 * holds once committed: never a .DS_Store, which would make the skill's
 * own comparison with main's report a difference after every upload.
 *
 * The check (checkSkill): SKILL.md's front matter has a name, the
 * folder's, of lower-case letters, digits and hyphens, at most 64
 * characters, and a description of at most 1,024, every line between
 * its --- lines a field on one line, as `key: value`, and a value
 * holding a colon and a space in quotes, since a YAML reader refuses it
 * bare (ADR-085); the name holds neither anthropic nor claude, and
 * neither field an XML tag, as the Claude API's skills guide lists for
 * an upload; and every relative link in the skill's Markdown, read as
 * check-docs.mjs reads links, leads to a file it uploads. evals.md is
 * not uploaded, so a link to it fails too.
 * Each failure is printed as `file: reason`, and it exits 1.
 *
 * The guard (whyNotMain), before the pack and never with --check: after
 * `git fetch origin main`, it packs only when HEAD is origin/main's
 * commit and git status shows nothing changed or added under
 * .claude/chat-skills/, so an upload is always main's copy, the one each
 * session compares it with (ADR-088's amendment). Otherwise it says to
 * merge first and pack from main, or to commit or restore the skill's
 * changes, and exits 1; so too when origin cannot be reached, since
 * then whether this is main's commit is unknown.
 *
 * The pack: tmp/plan-feature.zip, written fresh by the system's zip, run
 * from .claude/chat-skills/ so plan-feature/ is the archive's root, with
 * every file but evals.md. Upload it in claude.ai under Settings →
 * Capabilities → Skills, in place of the old one, then walk evals.md.
 *
 * Node's own modules only, with check-docs.mjs's. Its test, in pack-chat-skill.test.mjs, checks
 * the skill itself: `node --test scripts/`.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { frontMatterEnd } from "./adr-index.mjs";
import { linksIn } from "./check-docs.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS = path.join(ROOT, ".claude/chat-skills");
const NAME = "plan-feature";
const ARCHIVE = path.join(ROOT, `tmp/${NAME}.zip`);

/** The skill's file that is walked by hand, never uploaded. */
const EVALS = "evals.md";

/** The skill's files, from its folder, as git tracks or would track them. */
function filesIn(folder) {
  const listed = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "."],
    { cwd: folder, encoding: "utf8" },
  );
  return listed
    .split("\0")
    .filter((file) => file && existsSync(path.join(folder, file)))
    .sort();
}

/** The files an upload holds: every one but evals.md. */
export const uploaded = (folder) =>
  filesIn(folder).filter((file) => file !== EVALS);

/** A value in quotes, single or double, and what they hold. */
const QUOTED = /^(["'])(.*)\1$/;

/**
 * The front matter's fields, each `key: value` on its line, a value's
 * quotes taken off; the keys whose values were not in quotes; and the
 * number of each line that is not a field, as one folded over several
 * lines is not; null when the file has none.
 */
function frontMatter(text) {
  const lines = text.split(/\r?\n/);
  const end = frontMatterEnd(lines);
  if (end < 0) return null;

  const fields = {};
  const unquoted = new Set();
  const malformed = [];
  for (let at = 1; at < end; at++) {
    const field = /^([\w-]+):\s*(.*?)\s*$/.exec(lines[at]);
    if (!field) {
      malformed.push(at + 1);
      continue;
    }
    const [, key, value] = field;
    fields[key] = value.replace(QUOTED, "$2");
    if (!QUOTED.test(value)) unquoted.add(key);
  }
  return { fields, unquoted, malformed };
}

/** The words an upload refuses in a name. */
const RESERVED = /anthropic|claude/i;

/** An XML tag, which an upload refuses in the name or the description. */
const XML_TAG = /<\/?[A-Za-z][^<>]*>/;

/** A link to another site (a scheme, or //), or from /. */
const NOT_RELATIVE = /^(?:[A-Za-z][A-Za-z0-9+.-]*:|\/)/;

/** What claude.ai's upload would refuse in the skill, each failure named. */
export function checkSkill(folder) {
  const name = path.basename(folder);
  const files = uploaded(folder);
  const failures = [];
  const fail = (file, reason) =>
    failures.push(`${path.join(name, file)}: ${reason}`);

  if (!files.includes("SKILL.md")) {
    fail("SKILL.md", "no such file, and a skill is its SKILL.md");
    return failures;
  }

  const front = frontMatter(
    readFileSync(path.join(folder, "SKILL.md"), "utf8"),
  );
  if (!front) {
    fail("SKILL.md", "no front matter, between --- lines at its start");
  } else {
    const { fields, unquoted, malformed } = front;
    for (const line of malformed) {
      fail(
        "SKILL.md",
        `line ${line} is not a field on one line, key: value, as the front matter's lines must be`,
      );
    }
    for (const key of unquoted) {
      if (fields[key].includes(": ")) {
        fail(
          "SKILL.md",
          `${key} holds a colon and a space, not in quotes, which a YAML reader refuses: put its value in double quotes`,
        );
      }
    }
    if (!fields.name) {
      fail("SKILL.md", "no name in its front matter");
    } else {
      if (fields.name !== name) {
        fail("SKILL.md", `name ${fields.name} is not its folder's, ${name}`);
      }
      if (!/^[a-z0-9-]+$/.test(fields.name)) {
        fail(
          "SKILL.md",
          `name ${fields.name} holds more than lower-case letters, digits and hyphens`,
        );
      }
      if (fields.name.length > 64) {
        fail("SKILL.md", `name is ${fields.name.length} characters, over 64`);
      }
      const reserved = RESERVED.exec(fields.name);
      if (reserved) {
        fail(
          "SKILL.md",
          `name ${fields.name} holds ${reserved[0]}, a word claude.ai reserves`,
        );
      }
    }
    const description = [...(fields.description ?? "")].length;
    if (description === 0) {
      fail("SKILL.md", "no description in its front matter");
    } else if (description > 1024) {
      fail("SKILL.md", `description is ${description} characters, over 1,024`);
    }
    for (const field of ["name", "description"]) {
      const tag = XML_TAG.exec(fields[field] ?? "");
      if (tag) fail("SKILL.md", `${field} holds an XML tag, ${tag[0]}`);
    }
  }

  for (const file of files.filter((file) => file.endsWith(".md"))) {
    const text = readFileSync(path.join(folder, file), "utf8");
    for (const { target } of linksIn(text)) {
      if (NOT_RELATIVE.test(target)) continue;
      let linked = target.replace(/[?#].*$/, "");
      if (!linked) continue;
      try {
        linked = decodeURIComponent(linked);
      } catch {
        fail(
          file,
          `${target} is not a valid link: its %-escapes do not decode`,
        );
        continue;
      }

      const relative = path.relative(
        folder,
        path.resolve(folder, path.dirname(file), linked),
      );
      if (relative === ".." || relative.startsWith(`..${path.sep}`)) {
        fail(file, `${target} leads outside the skill's folder`);
      } else if (relative === EVALS) {
        fail(file, `${target} leads to evals.md, which is not uploaded`);
      } else if (!files.includes(relative)) {
        fail(file, `${target} leads to no file in the skill`);
      }
    }
  }
  return failures;
}

/**
 * Why the skill may not be packed from the folder's repository, or null
 * when it may: only at origin/main's commit, fetched now, with nothing
 * under the folder changed or added. Each reason says what to do.
 */
export function whyNotMain(folder) {
  const fetched = spawnSync("git", ["fetch", "--quiet", "origin", "main"], {
    cwd: folder,
    encoding: "utf8",
  });
  if (fetched.status !== 0) {
    return "Could not fetch main from origin, so whether this is main's commit is unknown: the skill is packed only from main, so run this again once origin can be reached.";
  }

  const [head, main] = execFileSync(
    "git",
    ["rev-parse", "HEAD", "origin/main"],
    { cwd: folder, encoding: "utf8" },
  )
    .trim()
    .split("\n");
  if (head !== main) {
    return "This is not origin/main's commit, and the skill is packed only from main: merge its change first, then pack on main, pulled.";
  }

  const changed = execFileSync(
    "git",
    ["status", "--porcelain", "--untracked-files=all", "--", "."],
    { cwd: folder, encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3));
  if (changed.length > 0) {
    return `The skill's folder has changes not committed, ${changed.join(", ")}: commit or restore them, then pack again, since an upload is main's copy.`;
  }
  return null;
}

/**
 * The skill's archive, written fresh, its folder at the root: an entry
 * for the folder and each one holding a file, then each file. zip adds
 * to an archive already there, so the old one goes first.
 */
export function pack(folder, archive) {
  const name = path.basename(folder);
  const files = uploaded(folder);
  const folders = new Set();
  for (const file of files) {
    for (let at = path.dirname(file); at !== "."; at = path.dirname(at)) {
      folders.add(at);
    }
  }
  const entries = [
    `${name}/`,
    ...[...folders].sort().map((part) => `${name}/${part}/`),
    ...files.map((file) => `${name}/${file}`),
  ];

  mkdirSync(path.dirname(archive), { recursive: true });
  rmSync(archive, { force: true });
  return spawnSync("zip", ["-q", "-X", archive, ...entries], {
    cwd: path.dirname(folder),
    encoding: "utf8",
  });
}

if (import.meta.main) {
  const checking = process.argv[2] === "--check";
  if (process.argv.length > 3 || (process.argv[2] && !checking)) {
    console.error("Usage: node scripts/pack-chat-skill.mjs [--check]");
    process.exit(2);
  }

  const folder = path.join(SKILLS, NAME);
  const failures = checkSkill(folder);
  if (failures.length > 0) {
    for (const failure of failures) console.error(failure);
    console.error(
      `${failures.length} ${failures.length === 1 ? "failure" : "failures"}: claude.ai would refuse the upload.`,
    );
    process.exit(1);
  }
  console.log(`The skill ${NAME} passes the upload's checks.`);
  if (checking) process.exit(0);

  const refused = whyNotMain(SKILLS);
  if (refused) {
    console.error(refused);
    process.exit(1);
  }

  const zipped = pack(folder, ARCHIVE);
  if (zipped.error?.code === "ENOENT") {
    console.error(
      "No zip on this machine's PATH, and the archive is made with it. Install zip, then run this again.",
    );
    process.exit(1);
  }
  if (zipped.status !== 0) {
    console.error(zipped.stderr || zipped.error?.message);
    process.exit(1);
  }
  console.log(
    `Wrote ${path.relative(ROOT, ARCHIVE)}: upload it in claude.ai under Settings → Capabilities → Skills, in place of the old one, then walk ${path.relative(ROOT, path.join(folder, EVALS))}.`,
  );
}
