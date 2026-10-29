---
name: rules-file
description: Write one area's rules files from its code and tests (ADR-087), docs/rules/<area>.md for people and .claude/rules/<area>.md for Claude, list it in docs/rules/README.md, run the docs check, and end with what writing them found (no test, partly tested, code and ADR disagreeing, rules no ADR states), written for an issue of its own. Use for /rules-file <area>, or when a brief or a fix-up batch asks for an area's rules files.
argument-hint: <area>
---

# Rules file

[ADR-087][adr-087] writes down what the app allows, refuses and works
out, one file per area, with Claude's code rules for the area beside it.
This skill writes one area's pair the way the invoices pilot was written:
from the code and the tests first, then checked against the ADRs and the
Help guide, never drafted from the ADRs alone. Writing them is also a
review of the area, so what it finds is written up for an issue, not
fixed.

## Rules

- **Four files, and nothing else:** `docs/rules/<area>.md`,
  `.claude/rules/<area>.md`, the area's line in `docs/rules/README.md`,
  and the findings in `tmp/rules-file/<area>.md`. No code, test, ADR or
  Help guide is changed, even where one is wrong: that is a finding.
- **No commit and no issue.** The caller commits and files them, as its
  brief's step or Bob says.
- **What the code does today.** Where the code, its tests, an ADR and the
  Help guide differ, the rule says what the code does, and the difference
  is a finding.

## 1. Read

- **The area,** `$ARGUMENTS`: one name from `AREAS` in
  `scripts/adr-index.mjs`, which this prints:
  `node -e 'import("./scripts/adr-index.mjs").then((m) => console.log(m.AREAS.join(" ")))'`.
  None, more than one, or not an area: stop and say so, with the list.
- **How a rules file is made:** ADR-087 with its [amendment][as-built];
  [`docs/rules/README.md`][format], whose format holds over anything
  here; the pilot, `docs/rules/invoices.md` and
  `.claude/rules/invoices.md`, as the example; and #264 with its comment
  (`gh issue view 264 --comments`), as the example of the findings.
- **What the area has already.** Its rules file, if there is one: each
  rule checked against the code and the tests as they are now, changed
  where it drifted, added where missing, its headings kept. Its
  `.claude/rules/` file, if there is one (stock, authorization, database
  and ui had theirs before a rules file): its rules and `paths` checked,
  kept where they hold, and the paragraph naming the rules file added.

## 2. Find the area's files

What becomes its `paths`, and what its rules are read from:

- **The server's folder:** `server/src/modules/<area>/`, or the area's
  folder in `server/src/core/` or `server/src/shared/`; and its tables in
  `server/src/database/schema/`.
- **The client's folders,** which may be named otherwise
  (`return-authorizations` is `client/src/rmas/`, `stock` is
  `client/src/inventory/`): found from `client/src/routes.ts` and the
  endpoints the screens call.
- **Its tests:** the end-to-end specs in `server/test/` that call its
  routes, the unit specs in its folder, and the client's tests and
  browser specs (`client/e2e/`) for its screens.
- **An area across the others** (`ACROSS` in `scripts/adr-index.mjs`)
  has no folder of its own: its paths are what it governs, as
  `.claude/rules/database.md` and `.claude/rules/ui.md` show.

And beside the code:

- **Its ADRs:** the area's line in the ADR index's [By area][by-area],
  each ADR with its amendments, and any other ADR the code's comments
  cite.
- **Its Help guide** in `client/src/help/guides/en/`, and any other guide
  that meets its rules.
- **Its manual checks** in `docs/manual-checks.md`, found by its screens'
  names and its ADRs.
- **What each refusal says,** in `server/src/i18n/en.json`, by the
  message id the code throws.

## 3. The rules file, for people

From the code first, every:

- **refusal:** each `throw` in the services, each DTO validator, and each
  check and unique index on its tables, with its message;
- **thing worked out:** a default, a total, an order, a fallback, which
  name or value a read chooses to show;
- **permission:** each route's `@RequirePermissions`, the roles that hold
  it by default (`SYSTEM_ROLE_PERMISSIONS` and `ROLE_TEMPLATES` in
  `server/src/core/authorization/permissions.ts`), that anyone holds what
  their roles grant (ADR-080), and that another organization's records
  are never found;
- **History entry:** what each `@Audited` write records, and that free
  text stays out (ADR-018);
- **rule worked out outside the area's folders where a person meets it
  in the area,** as the pilot's money summary from `orders/`: its cited
  test is what the docs check's notice watches.

Then each rule written as the [format][format] says, under headings by
what a person does:

- **Answer the question support will be asked.** One that spans rules,
  such as "can a credit note give back more than is left of its
  invoice?", is answered by one rule in so many words, not pieced
  together from three, as the pilot's review found.
- **The ADR by the heading** of its decision or amendment, by GitHub's
  anchor.
- **Every test that proves it,** on the server, in the client and in the
  browser, its name copied from its declaration, curly apostrophes
  included. **`partly tested`** after them where they prove only part of
  it: a refusal of another organization's record proves tenancy, not the
  rule; a test of the status alone does not prove what the refusal says.
  **`no test`** where none reaches it.
- **The Help section** in the English guide, by GitHub's anchor of its
  heading, not the guide's `{#id}`; **the manual check** by its id.

Last, the whole file read against each ADR it cites and the Help guide.
It opens as `docs/rules/invoices.md` does: what it covers, what each rule
links, and where the why, the how-to and the README are.

## 4. Claude's code rules

`.claude/rules/<area>.md`, as ADR-087 and its amendment say, with
`.claude/rules/invoices.md` as the example:

- **`paths` first,** one quoted pattern a line: the area's folders on both
  sides, its schema files and its test files. Each pattern, and each
  alternative inside braces, matches a file git tracks.
- **Then the heading,** `# <Area>: the code rules, for Claude`, the line
  saying when it loads, and a paragraph naming `docs/rules/<area>.md` and
  the same-commit rule.
- **Code rules only, under 40 lines after the front matter:** what to
  keep true when changing the area's code, each naming its home: an ADR,
  a linked section of `docs/conventions.md` or `docs/engineering.md`, or
  an ESLint rule. A rule with no home is a finding, not a line. Nothing
  `CLAUDE.md` or another area's file already says.

## 5. List it, and check

- **The area's line** under the README's [The files][files], in `AREAS`'
  order: what the file covers, written from the code and the tests on
  today's date.
- **`node scripts/check-docs.mjs`,** then
  `npx --yes markdownlint-cli2@0.23.3` with the three files, each failure
  fixed in the file it names, until both pass.

## 6. The findings, for an issue

`tmp/rules-file/<area>.md`, written as #264's body is:

- **A paragraph** saying what was written, from which folders and tests,
  checked against which ADRs; that nothing in it is fixed yet; and that
  the rules file marks the gaps `no test` and `partly tested`.
- **The sections, in this order, numbered across them,** one with
  nothing left out: No test; Partly tested; Where the code and an ADR
  disagree; Rules no ADR states; Also found.
- **Each item:** a bold title, then where it is (the file, the function,
  the message id) and what the tests reach and miss. A disagreement
  quotes the ADR's words and says what the code does.
- **A last line,** `Source:` and the rules file.

The caller files it, as [Issues and labels][issues] says:

```bash
gh issue create --title "<Area>: what the rules file found" \
  --label needs-triage --label "area:<area>" \
  --body-file tmp/rules-file/<area>.md
```

## 7. The report

As [CLAUDE.md's "Report for a quick read"][report] says, unless a brief's
summary carries it:

1. **Written:** each file; for the rules file, its rules, headings, tests
   cited, manual checks and Help links, as ADR-087's amendment counts the
   pilot's.
2. **Checked:** what `check-docs.mjs` and markdownlint said.
3. **Found:** how many under each section, and the findings file.
4. **Decisions for Bob:** each with its options and the one recommended;
   or "none".
5. **Next:** the commit and the issue, which are the caller's.

The last line: `DONE: <why>`, or `BLOCKED: <what is needed>`.

[adr-087]: ../../../docs/adr/0087-the-rules-written-down.md
[as-built]: ../../../docs/adr/0087-the-rules-written-down.md#amendment-october-2026--as-built-291
[format]: ../../../docs/rules/README.md#the-format
[files]: ../../../docs/rules/README.md#the-files
[by-area]: ../../../docs/adr/README.md#by-area
[issues]: ../../../docs/engineering.md#issues-and-labels
[report]: ../../../CLAUDE.md#how-to-work
