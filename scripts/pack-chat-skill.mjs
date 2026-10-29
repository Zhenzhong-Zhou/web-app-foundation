#!/usr/bin/env node
/**
 * The chat's planning skill, checked as claude.ai checks an upload, then
 * packed for it (ADR-088).
 *
 *     node scripts/pack-chat-skill.mjs            # checks, then writes tmp/plan-feature.zip
 *     node scripts/pack-chat-skill.mjs --check    # checks only
 *
 * The skill is .claude/chat-skills/plan-feature/, its files the ones git
 * tracks or would track there, so what is packed is what main's copy
 * holds once committed: never a .DS_Store, which would make the skill's
 * own comparison with main's report a difference after every upload.
 *
 * The check (checkSkill): SKILL.md's front matter has a name, the
 * folder's, of lower-case letters, digits and hyphens, at most 64
 * characters, and a description of at most 1,024, each field on one
 * line; the name holds neither anthropic nor claude, and neither field an
 * XML tag, as the Claude API's skills guide lists for an upload; and
 * every relative link in the skill's Markdown, outside code,
 * leads to a file it uploads. evals.md is not uploaded, so a link to it
 * fails too. Each failure is printed as `file: reason`, and it exits 1.
 *
 * The pack: tmp/plan-feature.zip, written fresh by the system's zip, run
 * from .claude/chat-skills/ so plan-feature/ is the archive's root, with
 * every file but evals.md. Upload it in claude.ai under Settings →
 * Capabilities → Skills, in place of the old one, then walk evals.md.
 *
 * Node's own modules only. Its test, in pack-chat-skill.test.mjs, checks
 * the skill itself: `node --test scripts/`.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

/**
 * The front matter's fields, each `key: value` on its line, a value's
 * quotes taken off; null when the file has none.
 */
function frontMatter(text) {
  const lines = text.split(/\r?\n/);
  const end = lines.indexOf("---", 1);
  if (lines[0] !== "---" || end < 0) return null;

  const fields = {};
  for (const line of lines.slice(1, end)) {
    const field = /^([\w-]+):\s*(.*?)\s*$/.exec(line);
    if (field) fields[field[1]] = field[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return fields;
}

/** The text without its fenced code and code spans, where no link is. */
const prose = (text) =>
  text
    .replace(/^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\1[ \t]*$/gm, "")
    .replace(/(`+)[\s\S]*?\1/g, "");

/** Each inline link's destination, and each reference definition's. */
const LINK = /\]\(\s*<?([^\s<>()]+)|^ {0,3}\[[^\]^][^\]]*\]:\s*<?([^\s<>]+)/gm;

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

  const fields = frontMatter(
    readFileSync(path.join(folder, "SKILL.md"), "utf8"),
  );
  if (!fields) {
    fail("SKILL.md", "no front matter, between --- lines at its start");
  } else {
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
    const text = prose(readFileSync(path.join(folder, file), "utf8"));
    for (const match of text.matchAll(LINK)) {
      const target = match[1] ?? match[2];
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
