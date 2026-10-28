---
status: accepted
date: 2026-10-27
areas: [docs]
---

# ADR-086 — Docs as code: one file per decision, and links that are checked

## Context

The repository holds about 226,000 words of Markdown in 85
files beside 213,000 lines of TypeScript. Most of it sits in two files:

- `docs/decisions.md`: 13,047 lines, 120,100 words, 752 kB. The 83 ADRs
  (a median of 794 words, the largest ADR-081 at 5,572), then Open
  decisions (73 entries, 6,733 words), then Resolved, a table by
  question.
- `docs/handoff.md`: 1,966 lines. Where the work stands, then the longer
  history, then the working agreements, the rules for how the work is
  done, in its last 232 lines.

Three things follow from the size:

- The claude.ai Project reads its knowledge in retrieval mode: a search
  returns passages of a long file, never all of it. So Bob attaches
  `decisions.md` and the handoff by hand, and a long file changes only by
  a patch made from his copy (26 October 2026).
- The working agreements are rules, not status, yet they live at the end
  of the file that says where the work stands, which a new session reads
  first and which grows every day.
- The 23 links inside `decisions.md` are checked by markdownlint's MD051,
  which looks within one file only. Split into many files, nothing would
  check them, and nothing checks a link between files today.

This ADR is part 1 of the docs plan of 26 October 2026: where things
go. Part 2, `docs-start-here`, writes what is new, and settles its own
details in an amendment here when it is planned.

Checked before drafting, as the working agreements ask:

- **Fired.** None. No Deferred line, watch list, Open decision or open
  issue (54 on 27 October 2026) is about the docs' layout; ADR-079's
  deferrals on searching and illustrating the guides, and #149 and #150,
  are Help's, not the repository's.
- **Found while checking, left for part 2** (part 1 moves and rewords
  nothing):
  - 22 ADRs are amended by an ADR whose title says so, yet carry no
    "Amended by" note at their top, and 9 of them never name the ADR
    that amends them (ADR-046 never mentions ADR-071). In one long file
    a reader might come across the amendment; in a file of its own, they
    will not. Part 1 answers this with front matter (below), without
    touching the prose.
  - ADR-067's note says ADR-082 amends it, and ADR-082's text does, but
    its title's list leaves ADR-067 out. ADR-082's front matter lists
    it; the title, being history, stays.
  - The working agreements say `scripts/verify.sh` lints the Markdown in
    `tmp/`; `.markdownlint-cli2.jsonc` ignores `tmp/**`, on purpose, by
    its own comment.

## Decision — two docs-only PRs, the moves first

Part 1, `docs-moves`,
moves text and fixes the pointers the moves break, and changes nothing
else; a script proves it. Part 2, `docs-start-here`, writes. A move is
checked by a proof and new writing by reading; in one PR, neither check
could be trusted.

## Decision — one file per ADR

`docs/adr/NNNN-<slug>.md`, four digits.
The slug is the title before its first `:` or `;`, without a trailing
`(amends …)`, `(#N)` or `(deferred)`, in lower-case ASCII, apostrophes
and backticks dropped and every other run of characters a hyphen, with
no length cap: `0083-the-emails.md`, `0077-invitations.md`, and at the
longest `0028-addresses-and-contacts-are-shared-tables-with-an-exclusive-arc.md`.
A file's name never changes once made, even when its title does, so a
link to it keeps working. Each file is its section of `decisions.md`
with the heading made level one, which markdownlint asks of a file's
first line, and its links to other ADRs made links to their files.

## Decision — front matter on every ADR

MADR 4.0, the most used ADR
template, carries optional YAML front matter; each file takes its
`status` and `date`, and two fields of this repository's own:

```yaml
---
status: accepted
date: 2026-09-25
amended-by: [ADR-071, ADR-073]
---
```

- `status`: `accepted`; `deferred` for an ADR decided and waiting for its
  trigger (ADR-074); `superseded by ADR-NNN` for one replaced whole,
  which none is yet.
- `date`: the day git first recorded the ADR, from the commit that first
  wrote its heading.
- `amends`: the ADRs its title's "(amends …)" names, and any its text
  amends that the title leaves out (ADR-082 amends ADR-067).
- `amended-by`: every ADR whose `amends` names this one. An empty list
  is left out.

An ADR opened on its own (in the editor, on GitHub, which shows front
matter as a table, or in the Project's search) says at its first lines
what amends it; `grep -l "amended-by:.*ADR-077" docs/adr/` lists the
same. Front matter says which ADRs amend this one, not what they
changed: the prose notes that summarise an amendment stay as they are.

## Decision — the index, generated

`docs/adr/README.md`, which GitHub
shows under the folder's list of files:

1. `decisions.md`'s preamble, verbatim: append, never rewrite; a
   reversal is a new entry that marks the old one.
2. **By number:** one row per ADR, with ADR, Title, Status, Date, Amends
   and Amended by, written by `node scripts/adr-index.mjs` from each
   file's front matter and heading, and never by hand. Its links are
   reference links, so the raw table reads `| [ADR-071] | Documents as
   PDF, drawn on the server | accepted | 2026-10-16 | …` as plain text
   does. The Status column is where "mark the old one" now shows.
   Numbers not yet written have no row.
3. **Resolved,** verbatim, as the last section.

The data lives once, in the files, so nothing kept by hand can drift
from it: `--check` fails when the table differs from what the files
say, the way the API contract's check fails when `openapi.json` does.

## Decision — Open decisions, a file beside the ADRs

`docs/adr/open-decisions.md`. The check before every ADR reads it with the
ADRs' Deferred lines, so it sits with them; one file, since most of its
73 entries are a paragraph.

## Decision — amendments stay where they are

Every amendment is already
a paragraph inside the ADR it amends, and every "Amended by" note sits at
that ADR's top, so each moves with its ADR untouched. That differs from
Nygard's rule, where an ADR is never edited and a change is a new ADR
that supersedes it; dated amendments inside the old ADR are the common
variant, and front matter answers its weakness. From here, an ADR that
amends another lists it in `amends`, adds the other's `amended-by`, puts
its amendment in the other's text, and runs `scripts/adr-index.mjs`.
Part 2 writes this into the working agreements.

## Decision — `docs/decisions.md` stays, as a stub

It names where each part
went. Issues and pull requests link it, and GitHub cannot redirect a
moved file, let alone a heading in it.

## Decision — the working agreements move to `docs/engineering.md`

They move verbatim, under a heading of their own, with their headings unchanged, so
a link to `#how-code-is-delivered`, `#process` or `#commits` only changes
its file. The handoff keeps where the work stands.

## Decision — the pointers move with the text

Every link or path that a
move would leave naming the old place changes in the same commit, and
only that line: a path, a link, "this handoff" in a moved line, "are
below". Prose naming "the working agreements" stays. The rule that a
long file changes by a patch names the ADR files in place of
`decisions.md`, until part 2 settles whether short files still need it.

## Decision — the moves are proved

The split is made by a script, and
another turns the new files back into the old one: headings back to level
two, file links back to anchors, the pieces joined in order. The result
must be byte-identical to `decisions.md` as the branch found it, and both
SHA-256 sums go in the commit's message; the front matter, which is
data and not text, is set aside before the joining. The working
agreements' move is
compared the same way, apart from the pointer lines, each listed. Both
scripts are for this branch only, in `tmp/adr-086/`, and are not kept.

## Decision — links checked from now on

`scripts/check-docs.mjs`, with
its test and no dependency: every relative link in every Markdown file
the repository tracks must lead to a file, and a `#fragment` to a heading
there, by GitHub's anchors; every ADR file must have its row in the
index; and every `amends` has its `amended-by` in the other file, both
ways. App routes in the Help guides (`/inventory`) are not files and are
skipped; so are links to other sites. Fragments within a file are
checked too, which markdownlint's MD051 already passes on `main`, so a
difference between the two ways of making GitHub's anchors shows at
once. It runs in
`scripts/verify.sh`'s Markdown step and in the Docs workflow, which now
runs on every push and pull request rather than on Markdown changes only:
renaming a test or a guide can break a link from a Markdown file, and the
workflow takes seconds. On `main` the day this was written: 47 relative
links, none broken.

## Decision — no dependency step on the two docs branches

An exception
of Bob's, as [conventions.md's "Dependencies"](../conventions.md#dependencies) allows, named here and in
both PRs: package updates would put code changes into a docs branch.
`typescript-eslint` 8.72.1 and `@aws-sdk/client-s3` 3.1157.0, old enough
from 2 November, open ADR-084's branch as planned. A security fix is
still taken at once, wherever it lands.

## Decision — its number

ADR-083 gave 084 to the error tracker and 085
to low stock, both still to be written, so this is ADR-086, written
before them. A number is a name, not a date; the index lists the ADRs
that exist.

## Decision — part 2, `docs-start-here`, settled when it is planned

Its
scope as Bob set it on 26 and 27 October 2026, each to be confirmed then:

- `docs/README.md`, "Start here": the system on one page, then which
  document answers which question.
- `docs/rules/README.md`: one line per rule, each linking its ADR, its
  test and its Help guide section, a rule's change updating its file in
  the same commit; `docs/rules/invoices.md` the pilot. The fix-ups then
  write the rules files for their areas, and one docs PR the rest.
- Short `CLAUDE.md` files in `stock`, `invoices`, `core/authorization`,
  `database` and `client/src/theme`, holding code rules only and linking
  to the rules files.
- The handoff cut to where the work stands, the finished history out.
- `CLAUDE.md`, the README and `conventions.md` pointing to the new places;
  `/build-from-brief`'s links at their final homes; `/code-review`
  flagging a rule changed without its rules file.
- Four practices for `docs/engineering.md`, settled in October and
  written nowhere yet: after Claude Code moves files or adds exports,
  restart the editor's TypeScript and ESLint servers (Cmd+Shift+P), which
  go stale and show errors `verify.sh` does not; `caffeinate -dims` in a
  second terminal during long Claude Code steps, since a Mac asleep cut
  one off; never "Commit suggestion" on GitHub, since every fix goes
  through Claude Code under the repository's identity and the local
  branch must not fall behind; Claude Code Review on Sonnet, the reviews
  in each brief's review step first, and CodeQL kept.
- What checking found above: the line on `tmp/`'s Markdown; and, only
  where an amendment overturns a rule as ADR-015 did ADR-011's, a
  one-line note at the amended ADR's top saying what changed.
- Headings in every ADR (`## Context`, `## Decision — …`,
  `## Consequences`) in place of the bold labels that open its
  paragraphs, made by a script with its own proof: GitHub then gives
  each file an outline and each part a link, and a search that splits
  files by heading gets clean boundaries. A template for new ADRs, front
  matter and headings, follows from it.
- Open decisions' entries as headings, so each can be linked and found
  alone.
- An `areas` field in the front matter (`invoices`, `stock`), named as
  the `docs/rules/` files are, and the index by area as well as by
  number.
- Resolved's future: it has rows for 39 of the 83 ADRs. Complete it, or
  let the index, whose titles state each decision, take its place.
- Whether "a long file changes by a patch" is still needed once the ADRs
  are short files.

## Considered and not done

- **`decisions.md` kept whole, with a table of contents.** Nothing about
  its size changes: the Project's search still returns passages.
- **A file per Open decision.** Most are a paragraph; 73 files would
  scatter what the check before an ADR reads at once.
- **Names by number only (`0083.md`).** Stable, but a list of files then
  says nothing. **Three digits, as in "ADR-083".** Four is what adr-tools
  and MADR use and sorts past 999, and a search for "083" finds both.
- **MADR's statuses** (proposed, rejected, deprecated). An ADR here is
  written once it is decided, so Accepted, Deferred and superseded are
  the statuses that occur.
- **lychee or markdown-link-check.** A binary or a dependency to keep, and
  each would also fetch every outside link on every run. A small script
  in `scripts/`, tested as the others are, does what is needed.
- **A docs site** (MkDocs, Docusaurus, log4brains). A build and a host to
  keep, when GitHub already renders Markdown and a folder's README.
- **`llms.txt`.** A convention for websites telling a model where to
  read; in a repository, `CLAUDE.md` and part 2's "Start here" do it.
- **The 83 ADRs rewritten into MADR's sections** (Decision Drivers,
  Considered Options, Decision Outcome). It would reword every file, and
  this repository's Context, Decision and Consequences already carry the
  same reasoning.
- **AGENTS.md in place of `CLAUDE.md`.** The cross-tool name, read
  nearest-file-first by many agents; Claude Code reads `CLAUDE.md`, the
  only agent here. If another joins, the files are renamed and
  `CLAUDE.md` points to them.

## Deferred — each with what brings it in

- **A docs site.** A reader from outside the repository: a customer's
  developer, or a second engineer.
- **Outside links checked.** One found dead that mattered; then weekly,
  not on every push, so other sites' rate limits never fail a build.
- **Open decisions split by entry.** One grows past a page, or the
  Project's search misses one that matters.

## Consequences

- One ADR opens whole, in the editor, on GitHub and in the Project's
  search. Bob attaches files by hand less often, and an ADR's as-built
  amendment can come as the whole file.
- A new ADR is a new file with its front matter, then `node
  scripts/adr-index.mjs`; amending one also adds to the amended file's
  `amended-by`. The check refuses either half alone.
- Claude, or anyone, finds an ADR by its number (its heading), its topic
  (its file's name) or what touches it (its front matter), and reads the
  index, about 6,000 tokens, to choose which to open.
- The history of an ADR's file, on GitHub, starts at the split. `git log
  -- docs/decisions.md` holds what came before, and `git blame -C -C` on
  an ADR's file gives each line the commit that wrote it.
- The Docs workflow runs on every push and pull request. A link to a file
  that is renamed fails it, where it used to go stale unseen.
- Part 1 changes `scripts/` and a workflow as well as Markdown, so CI runs
  on it too.

## Amendment (October 2026) — as built (#259)

What building settled:

- **Editorial fixes change an old ADR in place.** A moved file's path, a
  link, or a citation of where a rule lives is corrected in the old
  ADR's text, on the branch that moves the thing; what an ADR decided
  changes only by an amendment, with `amends` and `amended-by`. Git
  keeps the earlier wording, and `git blame -C -C` shows it. Under this,
  nine citations that named the handoff for a section now in
  `docs/engineering.md` were corrected after the move: four comments and
  a line of `conventions.md` (9dd39167), and five citations in ADRs 079,
  080, 081 and 083 (c33d6023). The brief's pointer tables had missed
  them, written as "(handoff, Server)" rather than as a path.
- **The proof** held at cdcc1969: the new files, front matter set aside,
  joined back byte-identical to `decisions.md` (SHA-256 c288419ae62b…).
  The old file was 86 pieces, not the brief's 85: the preamble, 83 ADRs,
  Open decisions and Resolved. The pointer files were compared with the
  step's start, since this ADR's own commit had changed the handoff.
- **The front matter, as written:** 34 ADRs amended and 19 amending
  another; ADR-067 added to ADR-082's `amends`. Of the 22 that no note
  named an amender for, 18 had no note at all, and 052, 054, 055 and 069
  had notes naming only some. Dates from git: 13 on 2026-08-24, the
  latest 2026-10-26.
- **`adr-index.mjs` owns the ADR format,** where the brief had put its
  checks in `check-docs.mjs`: one `checkAdrs()` and one
  `frontMatterEnd()`, used by `check-docs.mjs` and by both writing and
  `--check`, which stop on a failing ADR, so the index can never be
  written from what the check refuses. Writing skips only the "index is
  current" check, which it exists to fix. The README is required
  whenever an ADR exists. The allowed fields are one list, `FIELDS`,
  where part 2's `areas` joins them.
- **Also refused:** two files with one number; an `amends` or
  `amended-by` list out of ascending order or naming an ADR twice; a
  field not in `FIELDS`; `superseded by` naming an ADR with no file; a
  file in `docs/adr/` other than `README.md`, `open-decisions.md` and
  `NNNN-<slug>.md`; an impossible date. The fields' order is free, and a
  field written twice is not reported: the later one counts, and for
  `amends` and `amended-by` the both-ways check fails anyway.
- **Links are checked against git's list of files** (tracked, and new
  ones not ignored), not the disk, so a link to an ignored file fails
  here as it would in CI's fresh checkout, and letter case is exact.
  `docs/adr/` is listed the same way, so a Mac's `.DS_Store` does not
  count. Not handled, and said in the script: setext headings; the Help
  guides' `{#id}` ids, which get GitHub's anchor (`make-a-role-make`),
  not the id; links in HTML comments and indented code, which are
  checked though never shown, a false failure and never a miss.
- **A fixture keeps the anchors honest.** After the split one link
  within a file was left, so MD051 no longer cross-checked the anchors
  as this ADR said it would. `scripts/fixtures/anchors.md` holds the
  awkward heading shapes (an em dash, apostrophes, backticks, `_`,
  Chinese, a repeated heading, with MD024 off for that file alone) and a
  link to each, and markdownlint and `check-docs.mjs` both check it on
  every run.
- **CodeQL's one alert** on the pull request (code scanning alert 9:
  incomplete multi-character sanitization, high) was on `headingText`, whose single
  pass removing tags could leave a `<` behind. Its result only ever
  becomes an anchor, never HTML (`anchorOf` is its one use), but it was
  fixed rather than dismissed, as #113 fixed CodeQL's first six. A last
  pass removing every `<` and `>` left changed no anchor, but CodeQL did
  not count it; the tag pass now repeats until the text stops changing,
  the form CodeQL's own suggestion takes, and the extra pass is gone. No
  anchor of the repository's 742 headings changed; the fixture gained
  `## When a < b`. One shape no heading here uses now differs from
  GitHub's: `<<a>b>` gives an empty anchor where markdownlint's MD051
  gives `b`, so the fixture cannot hold it.
- **Left from the review:** test helpers shared with
  `i18n-review.test.mjs` (a chore of its own), the line-number loop, the
  anchor cache, the tests run in parallel, the Docs workflow's path
  filters (decided above), and three minor parser edges. `docs.yml` is
  not Prettier-formatted, as `ci.yml` is not.

## Amendment (October 2026) — part 2's list grows

Found while building
part 1, for `docs-start-here` to settle with the rest:

- Citations of a section written as links,
  `[engineering.md, Server](../engineering.md#server)`, so the check
  catches the next move; code comments still rely on the editorial rule
  and a sweep.
- Whether a link to a Help guide section uses GitHub's anchor or the
  guide's `{#id}`, once the rules files link them.
- `docs/adr/README.md`'s preamble, written for one file ("A running
  log", "Append new entries"), and ADR-012's "this log is not legal
  advice".
- In `docs/engineering.md`: the title doubled above "Working agreements
  (for Claude)"; "Moving code (what step 1 learned)", the step being the
  handoff's maintainability step 1; "this branch's step 7 (ADR-079)",
  already out of date; and "Planned in this chat". In the handoff, "What
  they taught is in the working agreements", which no longer says where.
- Whether a review's fix step needs `scripts/verify.sh --quick` before
  each of its commits: part 1's eight took nine runs and ran well past
  `/build-from-brief`'s half hour.
- Diagrams, as text that something keeps true, never images. Written
  by hand, since they change slowly: in "Start here", the docs' folder
  tree with each entry a link, and the system on one page as a Mermaid
  block. Generated: one diagram per area of its tables and their
  foreign keys (56 tables and 162 foreign keys on 27 October 2026), made
  from the Drizzle schema with `getTableConfig` as a Mermaid
  `erDiagram`, `organization_id` left out since every table has it, and
  checked as the API contract is; with part 2 or as a small PR of its
  own. Not drawn: the ADRs' amendments, which the index holds; which
  module imports which, a job for ESLint's rules as TenantDb's shows;
  and anything inside a function.
- Where the other documents land, so part 2 does not take them on: the
  support playbook comes with the operator's console (the handoff's
  "Later"); the terms and privacy policy stay in ADR-082's Deferred; the
  in-app Help is built (ADR-079); and the rules files after the
  invoices pilot come from the fix-ups and one docs PR, each checked
  against its area's code and tests, not drafted from the ADRs alone.

## Amendment (October 2026) — part 2 as planned

Settled on 27 October
2026, from the list above and the second amendment's. Part 2,
`docs-start-here`, stays one docs-only pull request. Its rules files,
Claude's code rules by area and the checks that keep both true are
[ADR-087](0087-the-rules-written-down.md), a decision of their own,
which replaces the five nested `CLAUDE.md` files above with path-scoped
rules in `.claude/rules/`, one per area, covering both its server and
its client folders. The rest:

- **Start here.** `docs/README.md`, written by hand, about 150 lines.
  First the system on one page as a Mermaid block: the browser, the
  API's core, modules and shared layers, PostgreSQL, Resend, R2, Render
  and GitHub Actions. Then which document answers which question,
  grouped by Diátaxis's four kinds: tutorial (the README's setup),
  how-to (the Help guides and the runbooks), reference (the rules files,
  the API reference, the glossary, `conventions.md`) and explanation
  (the ADRs and `principles.md`), with the handoff beside them as
  status. Then the docs' folder tree, each entry a link. A new document
  finds its kind there, and no file mixes two, as the handoff did while
  it held the working agreements.
- **Headings in every ADR, by a script.** Each bold label opening a
  paragraph at the margin becomes a heading, about 600 in all: `##` for
  Context, each Decision, Considered and not done, Deferred,
  Consequences and each Amendment, and `###` for a label inside an
  amendment. Labels inside lists and quotes stay bold. The words stay;
  only a label's closing period goes, as markdownlint's MD026 asks. The
  script's proof turns the headings back and must give files
  byte-identical to the branch's start. Both are for the branch only, in
  `tmp/`.
- **A template for new ADRs,** `docs/adr/template.md`: the front matter
  and the headings, under a comment mapping them to MADR's names
  (Context → Context and Problem Statement, Decision → Decision Outcome,
  Considered and not done → Considered Options, Consequences →
  Consequences; Deferred, with its triggers, has no counterpart and
  stays). `adr-index.mjs` allows the name.
- **Open decisions' 73 entries become `##` headings,** by the same script
  and its proof. Nothing else in the file changes.
- **`areas` in the front matter.** One or more per ADR, from one list in
  `adr-index.mjs`: a name for each folder in `server/src/modules/` and
  `server/src/core/`, and seven for what crosses them: `api`,
  `database`, `docs`, `help`, `i18n`, `ops` and `ui`. Named after the
  code's folders, an area maps to its files with no table between, and
  ADR-087's rules files take the same names. The index gains a "By area"
  section, generated as "By number" is. Claude Code proposes each ADR's
  areas from its text; Bob reviews the generated section.
- **Resolved is retired.** Its rows covered 40 of the 85 ADRs, each
  pointing to an ADR the index lists by title, and now by area.
  Completing it would mean 45 rows more, kept by hand. Git keeps the
  table.
- **The handoff, cut to status:** under 300 lines, from 1,766. It keeps
  where things stand, the order, the dates, what is still to do by hand
  and in code, and pointers to the Deferred lines and the open issues.
  Every finished item goes, and the history from "Where things stand"
  down; `git show 504daab:docs/handoff.md` holds it. Each item still to
  do in code without an issue gets one, and the handoff keeps the order
  and the links, so the issues are the one list of open work. The pull
  request lists each removed section and where what lasts of it now
  lives (its ADR's as-built, `engineering.md`, an issue); anything with
  no home gets one first.
- **Citations as links.** A citation of a section in Markdown, as
  "(conventions.md, Tests)", becomes a link,
  `[conventions.md, Tests](conventions.md#tests)`, so the check catches
  the next move: about 27 today. Code comments keep the plain form, under
  the as-built's editorial rule and a sweep. `check-docs.mjs` also checks
  a repository path written as code, as `` `scripts/smoke-auth.sh` ``, in
  every Markdown file but the ADRs, the release notes and `tmp/`, where
  history may name what has since gone. `conventions.md` names that
  script, which no longer exists.
- **The lines that made sense only in their old homes,** fixed in place
  under the as-built's editorial rule: the second amendment's list; the
  index's preamble ("A running log", "Append new entries", its Format
  line); ADR-012's "this log"; the README's Documentation list, which
  leaves out `engineering.md` and the glossary, and its "Both"; and the
  line on `tmp/`'s Markdown. Where an amendment overturned a rule, as
  ADR-015 did ADR-011's, a one-line note at the amended ADR's top says
  what changed.
- **Six practices for `docs/engineering.md`:** the four above, and two
  from 27 October. An alert is named "code scanning alert 9" or
  "Dependabot alert 4", never "#9", in commits, pull requests and
  comments, since GitHub links "#9" to issue or pull request 9. A
  security fix is pushed on its own, and its alert seen closed, before
  an as-built says "fixed": on #259, CodeQL did not count the first fix.
- **"A long file changes by a patch" stays, by size.** A file under 600
  lines comes whole: every ADR, `engineering.md`, and the handoff once
  cut. A longer one changes by a patch: `manual-checks.md` (3,736
  lines) and `conventions.md` (851).
- **`scripts/verify.sh --docs`:** markdownlint, `check-docs.mjs` and the
  scripts' tests, in seconds. A commit that changes only Markdown or
  `scripts/` runs it in place of `--quick`, and it refuses when the
  uncommitted changes touch anything else. The full verify still runs
  before each push. Part 1's eight review fixes took nine `--quick`
  runs.
- **`/doctor prompt-audit`,** Claude Code's own audit of its instruction
  files (`CLAUDE.md`, `.claude/rules/`, the skills) for contradictions
  and references to files that no longer exist, joins part 2's review
  step and each release's checks. It changes nothing itself; its
  findings are numbered with the other reviews'.
- **The per-area table diagrams ride along in ADR-084's branch,** a
  commit of their own, as small chores do: they need a script that
  loads the Drizzle schema and a check in verify, which is code. Start
  here links them then.
- **Not done: an archive of the handoff's history,** as
  `docs/history.md`. It would bring the history back into the Project's
  search, which the cut is for; git holds it.
- **Deferred, with what brings it in: a prose linter** (Vale) holding the
  glossary's words, when a second writer or a translator joins.

## Amendment (October 2026) — part 2 as built (#291)

What building and review settled, beyond the plan above and ADR-087's
own amendment:

- **The headings** are 817 in the ADRs (806 at `##`, 11 at `###`) and 73
  in Open decisions, not the plan's "about 600": older ADRs also open
  paragraphs with labels such as Performance and Status. Bold sentences
  that state rather than label stay bold. Sixteen paragraph starts were
  mended where a label's sentence ran on past it or ended in a colon,
  each the smallest change that makes a sentence, and the proof undid
  exactly those to give files byte-identical to the branch's start
  (SHA-256 ab5e9626…). Paragraphs were not rewrapped. Only a heading
  opening "Amendment" starts an amendment, so ADR-068's "Amended,
  October 2026" stays at `##`, and markdownlint's MD024 is
  `siblings_only` for the repository.
- **The areas** are 35: each folder of `server/src/modules/`,
  `server/src/core/` and `server/src/shared/` (`mail`, which the plan's
  list missed), then `ACROSS`, the seven kept by hand. Since the review
  they are read from the tree, so a new module folder is an area at once
  and needs only its `area:` label on GitHub. Each ADR has one to three.
  Two amendments missing from the front matter were recorded, ADR-025's
  of ADR-023 and ADR-072's of ADR-057 and ADR-058, and `adr-index.mjs`
  now refuses an amendment heading that names an ADR its file's
  `amended-by` lacks.
- **The template** must lose every comment: a leftover fails the check,
  which names what is still to fill in. The MADR map sits after the
  front matter, which has to open the file.
- **The index's preamble** keeps this ADR's rule on amendments: an
  amendment goes in the amended ADR's text, and some older ADRs carry
  only a note at their top. It says why ADR-084 and ADR-085 have no file
  yet.
- **Overturned rules:** 20 of the 61 amendments by another ADR
  overturned a rule, and the review found ADR-072's two more. Each
  amended ADR now says so at its top: 13 new notes, 1 line added under
  an existing note, 8 already said. ADR-047 and ADR-009 gained notes for
  what later work made untrue, and ADR-012's note for ADR-069 was turned
  the right way round.
- **Citations as links:** 54 in 20 files, each keeping its words inside
  the link. Code comments keep the plain form.
- **Paths written as code** are checked in every Markdown file but the
  numbered ADRs. A command's path is its first word, a path git ignores
  passes, and a module path may leave out its `.ts`. Known limits: a
  path at the repository's root is not checked, and any path under an
  ignored folder passes, typo or not.
- **`--docs`** runs markdownlint, `check-docs.mjs`, Prettier on
  `scripts/` and the scripts' tests, in about 3.5 seconds once
  markdownlint left out `server/storage/` and the tests were split in
  three. It refuses anything but Markdown and `scripts/`, and anything
  in `client/`, the Help guides included: they are app content, which
  `guides.test.ts` checks. CI runs the same Prettier check, a step in
  `ci.yml` beyond the plan's `docs.yml`, and `scripts/fixtures/` is in
  `.prettierignore`.
- **`engineering.md`** is titled "Engineering: the working agreements"
  and gains the six practices, "Issues and labels" (whose labels were
  made on GitHub by hand during the branch), the patch rule by size, and
  how a new ADR amends another, in this ADR's words. Bob types `/doctor
  prompt-audit` in the review session: a session cannot run it.
- **Lessons with no home** went to `conventions.md` first, each checked
  against the code: a copied snapshot's `id` and `prevId`, the
  `updated_at` trigger, a Dialog's `key`, `clearCookies` before
  `addCookies`, `THROTTLE_FACTOR` through `limit()`, the server's shared
  pieces, `@Audited` and the seed, Firefox through Docker, and 22
  reviewed clone families.
- **Start here** is 145 lines. Its diagram draws top to bottom, every
  arrow between two boxes, with a Guards box as the API's way in and a
  line saying what an arrow means. VS Code's preview drew an empty frame
  where mermaid.live drew the diagram.
- **The handoff** went from 1,766 lines to 160, about 200 after the
  review's fixes. Its to-dos became issues #268 to #288, each labelled,
  and two of its headings stay as anchors. Its history is in `git show
  504daab:docs/handoff.md`.
- **The reviews** found 47: 39 fixed, 4 tidy-ups of the new scripts
  filed as #289, 3 recorded above as known limits or in ADR-087's
  amendment, and 1 that is not this repository's.
