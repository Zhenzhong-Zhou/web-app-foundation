#!/usr/bin/env node
/**
 * The repository's Markdown, checked for what markdownlint cannot see
 * (ADR-086).
 *
 *     node scripts/check-docs.mjs
 *
 * It checks the repository it is run in, from any folder of it.
 *
 * Every link in every Markdown file git tracks or would track (so not
 * tmp/) must lead somewhere: each inline link or image, and each
 * reference definition, outside front matter, fenced code and inline
 * code. Its path, resolved from the file's folder, must name a file git
 * tracks or would track, or a folder holding one, letter case included:
 * what a fresh checkout has, as CI's does, rather than what this disk
 * holds. A #fragment on a .md file, or on the file itself, must be a
 * heading's anchor there, made as GitHub makes it, or an <a id> or
 * <a name>. markdownlint's MD051 checks fragments within one file only,
 * so a dead link between files went unseen.
 *
 * Skipped: links to other sites (a scheme, or //), paths from / (the Help
 * guides link the app's routes, as /inventory), and a fragment on any
 * other kind of file (#L10). Only ATX headings (## Heading) have anchors
 * here; a link to a setext one fails.
 *
 * Checked too, though GitHub renders neither: a link inside an HTML
 * comment (<!-- … -->), and one in a code block indented four spaces,
 * which is read as text. Each fails if it leads nowhere, so at worst a
 * false failure, never a dead link missed.
 *
 * And the ADRs in docs/adr/, by the rules scripts/adr-index.mjs holds:
 * each one's name, front matter, heading and amendments, the README
 * beside them, and their index in it current.
 *
 * And, from ADR-087 (each function says how):
 *
 * - every repository path written as code, as `scripts/verify.sh`, names
 *   a file or folder there (pathsAsCode);
 * - a rules file in docs/rules/ names each test it cites as that test's
 *   file has it, and each manual check by an id docs/manual-checks.md
 *   has (rulesFiles);
 * - each file of Claude Code's rules in .claude/rules/ has a paths list,
 *   and each pattern matches a file (claudeRules).
 *
 * Then the notice, which never fails a run: each rules file this branch
 * left alone, against origin/main, though it changed the file's tests or
 * its area (notices).
 *
 * Prints each failure as `file:line: target — reason` and exits 1, or
 * what it checked and exits 0; and either way, each notice as `notice:
 * file — why`. scripts/verify.sh and the Docs workflow run it. Its tests,
 * in check-docs.test.mjs, run it in a temporary repository: `node --test
 * scripts/`.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { checkAdrs, frontMatterEnd, inRepository } from "./adr-index.mjs";

/** The root of the repository it is run in. */
const ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

/**
 * The text with its front matter and fenced code blanked, every line
 * kept in its place: neither holds headings or links.
 */
function withoutBlocks(text) {
  const lines = text.split("\n");
  let at = 0;
  const end = frontMatterEnd(lines);
  if (end > 0) for (; at <= end; at++) lines[at] = "";

  let fence = null;
  for (; at < lines.length; at++) {
    const marks = /^\s*(`{3,}|~{3,})(.*)$/.exec(lines[at]);
    if (fence) {
      if (
        marks &&
        marks[1][0] === fence[0] &&
        marks[1].length >= fence.length &&
        !marks[2].trim()
      ) {
        fence = null;
      }
      lines[at] = "";
    } else if (marks && !(marks[1][0] === "`" && marks[2].includes("`"))) {
      fence = marks[1];
      lines[at] = "";
    }
  }
  return lines.join("\n");
}

/**
 * Each code span, from a run of backticks to the next run as long, within
 * one paragraph. CommonMark lets one wrap across lines, as prose wrapped
 * by hand often does.
 */
const CODE_SPAN = /(?<!`)(`+)(?!`)((?:(?!\n[ \t]*\n)[\s\S])*?)(?<!`)\1(?!`)/g;

/** The text with its code spans blanked, newlines kept. */
const withoutCode = (text) =>
  text.replace(CODE_SPAN, (span) => span.replace(/[^\n]/g, " "));

/**
 * The line of each offset in a text, asked in increasing order: each call
 * counts on from where the last one stopped.
 */
function lineCounter(text) {
  let line = 1;
  let counted = 0;
  return (offset) => {
    for (; counted < offset; counted++) if (text[counted] === "\n") line++;
    return line;
  };
}

/** An inline link or image; group 1 is its destination. */
const INLINE_LINK =
  /!?\[(?:[^[\]\\]|\\.|\[(?:[^[\]\\]|\\.)*\])*\]\(\s*(<[^<>\n]*>|[^\s()<>]*(?:\([^\s()<>]*\)[^\s()<>]*)*)(?:\s+(?:"[^"]*"|'[^']*'|\([^()]*\)))?\s*\)/dg;

/** A reference definition, not a footnote's; group 1 is its destination. */
const DEFINITION =
  /^[ \t]*\[(?!\^)(?:[^[\]\\]|\\.)+\]:[ \t]*\n?[ \t]*(<[^<>\n]*>|\S+)/dgm;

/** A link's destination as written, unwrapped from its <…>. */
const destinationOf = (match) => match[1].replace(/^<(.*)>$/, "$1");

/** Every link's destination in a file, with the line it is on. */
function linksIn(file) {
  const text = withoutCode(
    withoutBlocks(readFileSync(path.join(ROOT, file), "utf8")),
  );
  const found = [
    ...text.matchAll(INLINE_LINK),
    ...text.matchAll(DEFINITION),
  ].sort((a, b) => a.indices[1][0] - b.indices[1][0]);

  const lineOf = lineCounter(text);
  return found.map((match) => ({
    line: lineOf(match.indices[1][0]),
    target: destinationOf(match),
  }));
}

/** The text with every tag gone, in passes until one removes nothing. */
function withoutTags(text) {
  let before;
  do {
    before = text;
    text = text.replace(/<\/?[A-Za-z][^<>]*>/g, "");
  } while (text !== before);
  return text;
}

/**
 * A heading's text as GitHub shows it, as far as its anchor can tell. The
 * rule: undo only the markup whose characters anchorOf would keep, which
 * is `_` emphasis (`_` counts as a letter there), a link's or image's
 * target, and a tag's name. `*`, `~`, brackets and backticks need no care,
 * since anchorOf drops them. Code is set aside first and put back as
 * written, since GitHub undoes no markup inside it. The shapes are in
 * scripts/fixtures/anchors.md, which markdownlint's MD051 checks too.
 *
 * The tags go in passes until none is left, since one pass can leave a
 * tag behind (<<a>b> leaves <b>), which CodeQL reports as incomplete
 * sanitization. A < or > that is no tag's stays, as in "a < b", and
 * anchorOf drops it.
 */
function headingText(markdown) {
  const code = [];
  const text = markdown
    .replace(CODE_SPAN, (_, ticks, content) => {
      code.push(/^ .*[^ ].* $/.test(content) ? content.slice(1, -1) : content);
      return `\uE000${code.length - 1}\uE001`;
    })
    .replace(/!?\[([^\]]*)\](?:\([^)]*\)|\[[^\]]*\])/g, "$1");
  return withoutTags(text)
    .replace(
      /(?<![\p{L}\p{N}_])(_+)(?=\S)(.+?)(?<=\S)\1(?![\p{L}\p{N}_])/gu,
      "$2",
    )
    .replace(/\uE000(\d+)\uE001/g, (_, index) => code[index]);
}

/**
 * GitHub's anchor for a heading, as markdownlint's MD051 makes it too:
 * lower case, every character dropped but letters, marks, numbers, `_`,
 * `-` and spaces, then each space a hyphen.
 */
const anchorOf = (text) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, "")
    .replace(/ /g, "-");

const anchorCache = new Map();

/**
 * Every anchor in a Markdown file: each heading's, a repeated one's with
 * -1, -2 after it as GitHub numbers them, and each <a id> or <a name>.
 */
function anchorsIn(absolute) {
  if (anchorCache.has(absolute)) return anchorCache.get(absolute);

  const text = withoutBlocks(readFileSync(absolute, "utf8"));
  const anchors = new Set();
  const repeats = new Map();
  for (const line of text.split("\n")) {
    const heading = /^ {0,3}#{1,6}[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/.exec(line);
    if (!heading) continue;
    const anchor = anchorOf(headingText(heading[1]));
    let unique = anchor;
    while (anchors.has(unique)) {
      repeats.set(anchor, (repeats.get(anchor) ?? 0) + 1);
      unique = `${anchor}-${repeats.get(anchor)}`;
    }
    anchors.add(unique);
  }
  for (const match of withoutCode(text).matchAll(
    /<a\s[^>]*?\b(?:id|name)\s*=\s*["']([^"']+)["']/gi,
  )) {
    anchors.add(match[1]);
  }

  anchorCache.set(absolute, anchors);
  return anchors;
}

/** A link to another site (a scheme, or //), or to an app route (/inventory). */
const NOT_A_PATH = /^(?:[A-Za-z][A-Za-z0-9+.-]*:|\/)/;

/**
 * Where a link from a file leads: the path it names, absolute and from
 * ROOT, the file itself for a bare #fragment, and its fragment, each
 * %-escape decoded and any ?query cut; null when an escape does not
 * decode.
 */
function resolve(file, target) {
  const hash = target.indexOf("#");
  let linked = (hash < 0 ? target : target.slice(0, hash)).replace(/\?.*$/, "");
  let fragment = hash < 0 ? "" : target.slice(hash + 1);
  try {
    linked = decodeURIComponent(linked);
    fragment = decodeURIComponent(fragment);
  } catch {
    return null;
  }
  const absolute = linked
    ? path.resolve(path.dirname(path.join(ROOT, file)), linked)
    : path.join(ROOT, file);
  return { absolute, relative: path.relative(ROOT, absolute), fragment };
}

/** Why a link from a file leads nowhere, or null when it leads somewhere. */
function brokenBecause(file, target, { files, folders }) {
  const link = resolve(file, target);
  if (!link) return "not a valid link: its %-escapes do not decode";
  const { absolute, relative, fragment } = link;
  if (relative === ".." || relative.startsWith(`..${path.sep}`)) {
    return "outside the repository";
  }
  if (!files.has(relative) && !folders.has(relative)) {
    const lower = relative.toLowerCase();
    if ([...files, ...folders].some((known) => known.toLowerCase() === lower)) {
      return "no such file or folder: names are case-sensitive on GitHub";
    }
    return existsSync(absolute)
      ? "not in the repository: git ignores it, so a fresh checkout, as CI's, has none"
      : "no such file or folder";
  }

  if (
    fragment &&
    absolute.endsWith(".md") &&
    files.has(relative) &&
    !anchorsIn(absolute).has(fragment)
  ) {
    return "no such heading or anchor there";
  }
  return null;
}

/** Every relative link leads to a file or folder, and a fragment to a heading. */
function links(repository) {
  const markdown = [...repository.files].filter((file) => file.endsWith(".md"));
  const failures = [];
  let toPaths = 0;
  let withinFile = 0;
  for (const file of markdown) {
    for (const { line, target } of linksIn(file)) {
      if (NOT_A_PATH.test(target)) continue;
      const reason = brokenBecause(file, target, repository);
      if (target.startsWith("#")) withinFile++;
      else toPaths++;
      if (reason) failures.push(`${file}:${line}: ${target} — ${reason}`);
    }
  }
  return {
    failures,
    summary: `Links in ${markdown.length} Markdown files: ${toPaths} to files and folders, ${withinFile} to headings in their own file; none broken.`,
  };
}

/** The Markdown that may name what has since gone: the ADRs and the release notes. */
const HISTORY = /^docs\/(?:adr|releases)\//;

/** A path with a placeholder or a pattern in it: docs/adr/NNNN-<slug>.md. */
const PLACEHOLDER = /[<*{…]|NNN/;

/**
 * Which of these paths git ignores, each asked as a file and as a folder:
 * `dist/` ignores only a folder, and one a fresh checkout does not have
 * is a folder only by its slash.
 */
function ignoredByGit(paths) {
  if (paths.length === 0) return new Set();
  const run = spawnSync("git", ["check-ignore", "-z", "--stdin"], {
    cwd: ROOT,
    encoding: "utf8",
    input: paths.flatMap((named) => [named, `${named}/`]).join("\0"),
  });
  // 1 when none is ignored.
  if (run.status !== 0 && run.status !== 1) throw new Error(run.stderr);
  return new Set(
    run.stdout
      .split("\0")
      .filter(Boolean)
      .map((named) => named.replace(/\/$/, "")),
  );
}

/**
 * Every repository path written as code (ADR-086): a code span that starts
 * with a folder git tracks at the top, as `scripts/verify.sh` does, names
 * a file or folder in the repository. A command's path is its first word
 * (`scripts/verify.sh --quick`). Passing too: a path git ignores, which a
 * build or a run makes (`client/dist/`), and a module's path as an import
 * writes it, without .ts or .tsx (`client/src/api/types.gen`). Skipped: a
 * path with a placeholder or a pattern in it, and the ADRs and release
 * notes (tmp/ is not in the repository).
 */
function pathsAsCode({ files, folders }) {
  const tops = [...folders].filter((folder) => folder && !folder.includes("/"));
  const missing = [];
  let checked = 0;
  for (const file of files) {
    if (!file.endsWith(".md") || HISTORY.test(file)) continue;
    const text = withoutBlocks(readFileSync(path.join(ROOT, file), "utf8"));
    const lineOf = lineCounter(text);
    for (const match of text.matchAll(CODE_SPAN)) {
      const [written] = match[2].trim().split(/\s/);
      if (
        PLACEHOLDER.test(written) ||
        !tops.some((top) => written.startsWith(`${top}/`))
      ) {
        continue;
      }
      checked++;
      const named = written.replace(/\/$/, "");
      if (
        folders.has(named) ||
        [named, `${named}.ts`, `${named}.tsx`].some((known) => files.has(known))
      ) {
        continue;
      }
      missing.push({ file, line: lineOf(match.index), written, named });
    }
  }

  const ignored = ignoredByGit(missing.map(({ named }) => named));
  return {
    failures: missing
      .filter(({ named }) => !ignored.has(named))
      .map(
        ({ file, line, written }) =>
          `${file}:${line}: ${written} — no such file or folder in the repository; a file still to be written is named in plain words`,
      ),
    summary: `Paths written as code: ${checked}, each a file or folder in the repository, or one git ignores.`,
  };
}

/** A rules file, for people (ADR-087). */
const RULES_FILE = /^docs\/rules\/[^/]+\.md$/;

/** A test's file, by its name: .test.mjs, .spec.ts, .e2e-spec.ts. */
const TEST_FILE = /\.(?:test|spec|e2e-spec)\.[cm]?[jt]sx?$/;

/**
 * A test's declaration: it, test or describe, with any modifiers, then its
 * name in quotes, escapes allowed.
 */
const DECLARED =
  /\b(?:it|test|describe)(?:\.\w+)*\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/gs;

/**
 * The names a test file declares, each quote's escapes undone and its
 * whitespace made single spaces, as a rules file's quote is: a name is a
 * test's only where it is declared whole, not where its words appear in a
 * comment or a longer name.
 */
function declaredIn(text) {
  return new Set(
    [...text.matchAll(DECLARED)].map((match) =>
      match[2].replace(/\\(.)/gs, "$1").replace(/\s+/g, " "),
    ),
  );
}

const MANUAL_CHECKS = "docs/manual-checks.md";

/** A manual check's id where docs/manual-checks.md gives it: - **MC-101** … */
const MANUAL_CHECK = /^[ \t]*- \*\*(MC-\d+)\*\*/gm;

/**
 * What a rules file cites: each link to a test file, by its path in the
 * repository, with the name in quotes after it, its whitespace made single
 * spaces since prose wraps (null when there is none); and each manual
 * check's id. Each with its line.
 */
function citationsIn(file) {
  const text = withoutBlocks(readFileSync(path.join(ROOT, file), "utf8"));
  const prose = withoutCode(text);

  const tests = [];
  const lineOfTest = lineCounter(prose);
  const quoted = /[ \t]*\n?[ \t]*"([^"]*)"/y;
  for (const match of prose.matchAll(INLINE_LINK)) {
    const target = destinationOf(match);
    const link = NOT_A_PATH.test(target) ? null : resolve(file, target);
    if (!link || !TEST_FILE.test(link.relative)) continue;
    quoted.lastIndex = match.index + match[0].length;
    const name = quoted.exec(text)?.[1].replace(/\s+/g, " ");
    tests.push({
      line: lineOfTest(match.index),
      target,
      path: link.relative,
      name: name ?? null,
    });
  }

  const lineOfCheck = lineCounter(prose);
  const checks = [...prose.matchAll(/\bMC-\d+\b/g)].map((match) => ({
    line: lineOfCheck(match.index),
    id: match[0],
  }));
  return { tests, checks };
}

/**
 * The rules files' citations (ADR-087): each link to a test file is
 * followed by the test's name in quotes, as the format writes it, and a
 * test of that name is declared in that file, so renaming a test fails
 * here; each manual check's id exists in docs/manual-checks.md. A link to
 * a file that is not there fails as a link, above.
 */
function rulesFiles({ files }) {
  const given = new Set();
  if (files.has(MANUAL_CHECKS)) {
    const text = readFileSync(path.join(ROOT, MANUAL_CHECKS), "utf8");
    for (const match of text.matchAll(MANUAL_CHECK)) given.add(match[1]);
  }

  const testFiles = new Map();
  const namesIn = (file) => {
    if (!testFiles.has(file)) {
      testFiles.set(
        file,
        declaredIn(readFileSync(path.join(ROOT, file), "utf8")),
      );
    }
    return testFiles.get(file);
  };

  const rules = [...files].filter((file) => RULES_FILE.test(file)).sort();
  const failures = [];
  let named = 0;
  let checked = 0;
  for (const file of rules) {
    const { tests, checks } = citationsIn(file);
    for (const test of tests) {
      if (!files.has(test.path)) continue;
      if (test.name === null) {
        failures.push(
          `${file}:${test.line}: ${test.target} — no test's name after it: write it in quotes, as [test](…) "the test's name"`,
        );
        continue;
      }
      named++;
      if (!namesIn(test.path).has(test.name)) {
        failures.push(
          `${file}:${test.line}: "${test.name}" — no test by that name in ${test.path}: renamed? Quote the test's name as it is now, whole`,
        );
      }
    }
    for (const { line, id } of checks) {
      checked++;
      if (!given.has(id)) {
        failures.push(
          `${file}:${line}: ${id} — no such check in ${MANUAL_CHECKS}`,
        );
      }
    }
  }
  return {
    failures,
    summary: `Rules files in docs/rules/: ${rules.length}, citing ${named} tests by name and ${checked} manual checks, each found.`,
  };
}

/** A file of Claude Code's rules, which it loads from any folder under .claude/rules/. */
const CLAUDE_RULE = /^\.claude\/rules\/.+\.md$/;

/**
 * The `paths` list in a file of Claude Code's rules, each pattern with its
 * line, written one to a line as - "pattern", quoted or not; or why there
 * is none.
 */
function pathsIn(file) {
  const lines = readFileSync(path.join(ROOT, file), "utf8").split("\n");
  const everySession = "or Claude Code loads it in every session";
  const end = frontMatterEnd(lines);
  if (end < 0) {
    return {
      failure: `${file}:1: front matter — none: open with a paths list between --- lines, ${everySession}`,
    };
  }
  const at = lines.findIndex((line, i) => i < end && /^paths:/.test(line));
  if (at < 0) {
    return {
      failure: `${file}:1: paths — missing from the front matter: list the area's files, ${everySession}`,
    };
  }

  const patterns = [];
  if (/^paths:\s*$/.test(lines[at])) {
    for (let i = at + 1; i < end; i++) {
      // A comment or a blank line is skipped, and a field at the margin
      // ends the list; any other line would hide the patterns after it.
      if (/^\s*(?:#.*)?$/.test(lines[i])) continue;
      if (/^[\w-]+:/.test(lines[i])) break;
      const item = /^\s+-\s+(?:"([^"]*)"|'([^']*)'|(\S.*?))\s*$/.exec(lines[i]);
      if (!item) {
        return {
          failure: `${file}:${i + 1}: ${lines[i].trim()} — not a pattern: under paths:, one - "pattern" to a line, or a # comment`,
        };
      }
      patterns.push({ line: i + 1, pattern: item[1] ?? item[2] ?? item[3] });
    }
  }
  if (patterns.length === 0) {
    return {
      failure: `${file}:${at + 1}: ${lines[at]} — not a list: under paths:, one - "pattern" to a line`,
    };
  }
  return { patterns };
}

/**
 * A glob's brace alternatives, each as a pattern of its own, nested ones
 * too: server/test/{invoices,credit-notes}.e2e-spec.ts gives two.
 */
function expandBraces(pattern) {
  const open = pattern.indexOf("{");
  if (open < 0) return [pattern];
  const parts = [];
  let depth = 0;
  let from = open + 1;
  for (let at = open; at < pattern.length; at++) {
    if (pattern[at] === "{") {
      depth++;
    } else if (pattern[at] === "," && depth === 1) {
      parts.push(pattern.slice(from, at));
      from = at + 1;
    } else if (pattern[at] === "}" && --depth === 0) {
      parts.push(pattern.slice(from, at));
      const before = pattern.slice(0, open);
      const after = pattern.slice(at + 1);
      return parts.flatMap((part) => expandBraces(before + part + after));
    }
  }
  return [pattern];
}

/**
 * Claude Code's rules by area (ADR-087): each file under .claude/rules/
 * opens with front matter holding a `paths` list, since one without
 * loads in every session, which is CLAUDE.md's job; and each pattern, its
 * braces expanded, matches a file in the repository, since Claude Code
 * skips one that matches nothing without a word.
 */
function claudeRules({ files }) {
  const known = [...files];
  const rules = known.filter((file) => CLAUDE_RULE.test(file)).sort();
  const failures = [];
  let checked = 0;
  for (const file of rules) {
    const { failure, patterns } = pathsIn(file);
    if (failure) {
      failures.push(failure);
      continue;
    }
    for (const { line, pattern } of patterns) {
      for (const each of expandBraces(pattern)) {
        checked++;
        if (!known.some((named) => path.matchesGlob(named, each))) {
          const written = each === pattern ? each : `${each}, in ${pattern},`;
          failures.push(
            `${file}:${line}: ${written} — matches no file in the repository, and Claude Code skips it without a word`,
          );
        }
      }
    }
  }
  return {
    failures,
    summary: `Claude Code's rules in .claude/rules/: ${rules.length}, each with its paths; ${checked} patterns, braces expanded, each matching a file.`,
  };
}

/** Up to three names, then how many more. */
function someOf(names) {
  const more = names.length - 3;
  return more > 0
    ? `${names.slice(0, 3).join(", ")} and ${more} more`
    : names.join(", ");
}

/**
 * The notice (ADR-087), never a failure: each rules file in docs/rules/
 * this branch left unchanged against origin/main, though it changed a
 * test the file cites, or a file of its area by the paths of the
 * .claude/rules/ file of the same name. Most such changes change no rule,
 * so /code-review judges each one. Uncommitted changes count, and new
 * files git does not ignore.
 */
function notices({ files }) {
  const base = spawnSync("git", ["merge-base", "origin/main", "HEAD"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (base.status !== 0) {
    return [
      "The rules files' notice was not run: no origin/main to compare with. git fetch origin main, then run again.",
    ];
  }

  const git = (...args) =>
    execFileSync("git", args, { cwd: ROOT, encoding: "utf8" })
      .split("\0")
      .filter(Boolean);
  const changed = [
    ...new Set([
      ...git("diff", "--name-only", "--no-renames", "-z", base.stdout.trim()),
      ...git("ls-files", "-z", "--others", "--exclude-standard"),
    ]),
  ].sort();

  const found = [];
  for (const file of [...files].filter((f) => RULES_FILE.test(f)).sort()) {
    if (changed.includes(file)) continue;
    const cited = new Set(citationsIn(file).tests.map((test) => test.path));
    const area = `.claude/rules/${path.basename(file)}`;
    const patterns = files.has(area) ? (pathsIn(area).patterns ?? []) : [];
    const touched = changed.filter(
      (named) =>
        cited.has(named) ||
        patterns.some(({ pattern }) => path.matchesGlob(named, pattern)),
    );
    if (touched.length > 0) {
      found.push(
        `notice: ${file} — unchanged, though ${someOf(touched)} changed on this branch: if a rule changed, update it in the same commit (ADR-087)`,
      );
    }
  }
  return found.length > 0
    ? found
    : ["Rules files against origin/main: nothing to notice."];
}

if (import.meta.main) {
  const repository = inRepository();
  const results = [
    links(repository),
    pathsAsCode(repository),
    rulesFiles(repository),
    claudeRules(repository),
    checkAdrs(),
  ];
  const failures = results.flatMap((result) => result.failures);
  const notice = notices(repository);

  if (failures.length > 0) {
    for (const failure of failures) console.error(failure);
    console.error(
      `${failures.length} ${failures.length === 1 ? "failure" : "failures"}.`,
    );
    for (const line of notice) console.log(line);
    process.exit(1);
  }
  for (const result of results) console.log(result.summary);
  for (const line of notice) console.log(line);
}
