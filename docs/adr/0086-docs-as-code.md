---
status: accepted
date: 2026-10-27
---

# ADR-086 — Docs as code: one file per decision, and links that are checked

**Context.** The repository holds about 226,000 words of Markdown in 85
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

**Decision — two docs-only PRs, the moves first.** Part 1, `docs-moves`,
moves text and fixes the pointers the moves break, and changes nothing
else; a script proves it. Part 2, `docs-start-here`, writes. A move is
checked by a proof and new writing by reading; in one PR, neither check
could be trusted.

**Decision — one file per ADR.** `docs/adr/NNNN-<slug>.md`, four digits.
The slug is the title before its first `:` or `;`, without a trailing
`(amends …)`, `(#N)` or `(deferred)`, in lower-case ASCII, apostrophes
and backticks dropped and every other run of characters a hyphen, with
no length cap: `0083-the-emails.md`, `0077-invitations.md`, and at the
longest `0028-addresses-and-contacts-are-shared-tables-with-an-exclusive-arc.md`.
A file's name never changes once made, even when its title does, so a
link to it keeps working. Each file is its section of `decisions.md`
with the heading made level one, which markdownlint asks of a file's
first line, and its links to other ADRs made links to their files.

**Decision — front matter on every ADR.** MADR 4.0, the most used ADR
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

**Decision — the index, generated.** `docs/adr/README.md`, which GitHub
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

**Decision — Open decisions, a file beside the ADRs:**
`docs/adr/open-decisions.md`. The check before every ADR reads it with the
ADRs' Deferred lines, so it sits with them; one file, since most of its
73 entries are a paragraph.

**Decision — amendments stay where they are.** Every amendment is already
a paragraph inside the ADR it amends, and every "Amended by" note sits at
that ADR's top, so each moves with its ADR untouched. That differs from
Nygard's rule, where an ADR is never edited and a change is a new ADR
that supersedes it; dated amendments inside the old ADR are the common
variant, and front matter answers its weakness. From here, an ADR that
amends another lists it in `amends`, adds the other's `amended-by`, puts
its amendment in the other's text, and runs `scripts/adr-index.mjs`.
Part 2 writes this into the working agreements.

**Decision — `docs/decisions.md` stays, as a stub** naming where each part
went. Issues and pull requests link it, and GitHub cannot redirect a
moved file, let alone a heading in it.

**Decision — the working agreements move to `docs/engineering.md`,**
verbatim, under a heading of their own, with their headings unchanged, so
a link to `#how-code-is-delivered`, `#process` or `#commits` only changes
its file. The handoff keeps where the work stands.

**Decision — the pointers move with the text.** Every link or path that a
move would leave naming the old place changes in the same commit, and
only that line: a path, a link, "this handoff" in a moved line, "are
below". Prose naming "the working agreements" stays. The rule that a
long file changes by a patch names the ADR files in place of
`decisions.md`, until part 2 settles whether short files still need it.

**Decision — the moves are proved.** The split is made by a script, and
another turns the new files back into the old one: headings back to level
two, file links back to anchors, the pieces joined in order. The result
must be byte-identical to `decisions.md` as the branch found it, and both
SHA-256 sums go in the commit's message; the front matter, which is
data and not text, is set aside before the joining. The working
agreements' move is
compared the same way, apart from the pointer lines, each listed. Both
scripts are for this branch only, in `tmp/adr-086/`, and are not kept.

**Decision — links checked from now on.** `scripts/check-docs.mjs`, with
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

**Decision — no dependency step on the two docs branches.** An exception
of Bob's, as conventions.md's "Dependencies" allows, named here and in
both PRs: package updates would put code changes into a docs branch.
`typescript-eslint` 8.72.1 and `@aws-sdk/client-s3` 3.1157.0, old enough
from 2 November, open ADR-084's branch as planned. A security fix is
still taken at once, wherever it lands.

**Decision — its number.** ADR-083 gave 084 to the error tracker and 085
to low stock, both still to be written, so this is ADR-086, written
before them. A number is a name, not a date; the index lists the ADRs
that exist.

**Decision — part 2, `docs-start-here`, settled when it is planned.** Its
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

**Considered and not done.**

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

**Deferred — each with what brings it in.**

- **A docs site.** A reader from outside the repository: a customer's
  developer, or a second engineer.
- **Outside links checked.** One found dead that mattered; then weekly,
  not on every push, so other sites' rate limits never fail a build.
- **Open decisions split by entry.** One grows past a page, or the
  Project's search misses one that matters.

**Consequences.**

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
