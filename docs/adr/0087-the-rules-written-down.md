---
status: accepted
date: 2026-10-27
---

# ADR-087 — The rules written down: `docs/rules/` for people, `.claude/rules/` for Claude

**Context.** What the app allows, refuses and works out is written in
three kinds of place today, none of them made for looking a rule up:

- The ADRs say why, at the time of deciding, and change by amendment
  rather than being kept current. Invoicing's rules are spread across
  ADR-046 and its tax-number amendment, ADR-047, ADR-071 and ADR-073.
- The tests prove each rule, in a developer's words, one file among
  hundreds.
- The Help guides (ADR-079) tell an organization's staff how to do a
  task, in three languages, and mention a rule only where a task meets
  it.

So "can a credit note give back more than is left of its invoice?" is
answered by reading code. A support person cannot answer it; a new
developer reads three ADRs; Bob, six months on, reads the code.

ADR-086 planned for part 2 a rules reference in `docs/rules/`, invoices
first, and short `CLAUDE.md` files in five folders for the code rules
Claude needs there. Planning part 2 on 27 October 2026 found two things
that plan did not cover:

- **An area's code is not one folder.** Invoicing lives in
  `server/src/modules/invoices/`, `client/src/invoices/` and two
  end-to-end specs; stock in `server/src/modules/stock/` and
  `client/src/inventory/`. A `CLAUDE.md` in a folder loads only when
  Claude works in that folder, so one in the server's invoices folder
  never loads while Claude edits the invoice screens. Claude Code's
  path-scoped rules, files in `.claude/rules/` with a `paths` list, load
  when Claude reads, writes or edits any matching file, on either side.
- **A rule written down drifts unless something notices.** Claude Code's
  own documentation says its instruction files are context, not
  enforcement: what must happen every time belongs in a script or a
  hook.

This is a decision of its own rather than part of ADR-086's amendment.
[ADR-086](0086-docs-as-code.md) decides where the docs live; this one
decides that the rules are written down and how they stay true, and it
changes every pull request that changes a rule.

**Decision — a rules file per area, for people.** `docs/rules/<area>.md`,
named by ADR-086's `areas`, says what the app allows, refuses and works
out in that area today, in plain words, for a support person, a new
developer, or Bob six months on. In Diátaxis's terms it is reference:
not why (the ADRs), not how to (the Help guides), and not how the code
is organized (`conventions.md` and `.claude/rules/`). English only, as
the ADRs are. `docs/rules/README.md` says what a rules file is and is
not, gives the format and the same-commit rule, and lists the files.

**Decision — the format.** Rules grouped under headings by what a person
does (for invoices: drafts, issuing, credit notes, voiding, numbering,
pro forma), one bullet per rule. The rule comes first, in bold, in the
words a person would use; then a sentence or two where it needs them;
then its links, separated by ` · `:

```markdown
- **An issued invoice never changes.** A mistake is voided with a credit
  note and invoiced again. [ADR-046](../adr/0046-invoicing.md) ·
  [test](../../server/test/invoices.e2e-spec.ts) "<the test's name>" ·
  [Help](../../client/src/help/guides/en/invoices.md#void-an-invoice-void) ·
  MC-1234
```

- **The ADR** that decided the rule, or the amendment that changed it.
- **The test** that proves it: a link to its file, then the test's name
  in quotes. A rule with no test says `no test`, which is a finding for
  the area's next fix-up, not a reason to leave the rule out.
- **The Help section** where a person meets it, if one does, linked by
  GitHub's anchor (`#void-an-invoice-void`), not the guide's `{#void}`:
  the link then opens on GitHub and is checked. The `{#id}` stays the
  app's own, the same in every language.
- **The manual check,** by its id, where one walks the rule by hand.

The rules themselves carry no ids: nothing cites a single rule yet.

**Decision — the checks, in `scripts/check-docs.mjs`.** Besides the
links it already checks:

- every quoted test name is found in the test file linked just before
  it, so renaming a test fails the check;
- every manual check's id exists in `docs/manual-checks.md`;
- every `paths` pattern in `.claude/rules/` matches at least one file
  git tracks, since Claude Code skips a pattern that matches nothing
  without a word.

And a notice, never a failure: from the branch's changes against
`origin/main`, each rules file whose cited tests, or whose area's files
by its `.claude/rules/` paths, changed while the rules file did not.
`scripts/verify.sh` and the Docs workflow print it. Most changes to an
area's code change no rule, so a failure would teach everyone to ignore
it; `/code-review` judges each notice instead.

**Decision — the same-commit rule.** A commit that changes a rule
updates its rules file, as a commit that changes what a person sees
updates `docs/manual-checks.md`. It goes in `CLAUDE.md`'s rules and in
`docs/engineering.md`. `/code-review` reports a rule changed without its
file, and any notice above left unanswered.

**Decision — Claude's code rules, by area, in `.claude/rules/`,** in
place of ADR-086's five nested `CLAUDE.md` files. One file per area,
`.claude/rules/<area>.md`, its `paths` naming the area's folders on both
sides and its tests:

```markdown
---
paths:
  - "server/src/modules/invoices/**"
  - "client/src/invoices/**"
  - "server/test/{invoices,credit-notes}.e2e-spec.ts"
---
```

- **Code rules only,** under 40 lines: what to keep true when changing
  this area's code, each with the home it comes from (an ADR,
  `conventions.md`, `engineering.md`, an ESLint rule). Nothing is
  invented here; a rule with no home gets one first. The area's business
  rules stay in `docs/rules/`, linked.
- **Five in part 2,** the areas ADR-086 named: `invoices`, `stock`,
  `authorization`, `database`, and `ui` for the theme's rules, whose
  `paths` take in every component that styles itself.
- **Every file has `paths`.** A file without them would load in every
  session, which is `CLAUDE.md`'s job. Nothing else goes in the folder,
  since Claude Code loads every Markdown file there as a rule: no README.
  Each file's first line says it is for Claude and names the area's
  rules file in `docs/rules/`, once there is one.
- **The `paths` lists are the map** from an area to its files, used by
  the notice above and by `/code-review`.

**Decision — the pilot, then the rest.** Part 2 writes
`docs/rules/invoices.md` from the code and the tests, then checks it
against the ADRs it cites and the invoices guide; it is not drafted from
the ADRs alone. Each fix-up batch then writes the rules file and the
`.claude/rules/` file of each area it touches, checked against that
area's code and tests, and one docs pull request writes the remaining
areas' before the whole-app review (the handoff's order).

**Considered and not done.**

- **Rules as executable specifications** (Cucumber's Gherkin, "living
  documentation"). A rule cannot drift from its test when it is the
  test, but every area's tests would be rewritten in a new format, with
  a new runner to keep. A cited test name, checked, gives most of the
  benefit at none of that cost.
- **The rules inside each ADR.** An ADR records a decision at its time
  and changes by amendment, so today's rules would be spread across an
  ADR and its amendments, as invoicing's are now.
- **The rules in the Help guides.** Help is how-to for an
  organization's staff, in three languages, and states a rule only where
  a task meets it; a support person needs all of an area's rules in one
  place.
- **An id for each rule,** as the manual checks have. Nothing cites a
  single rule yet, and a bullet has no anchor of its own.
- **Help sections linked by their `{#id}`.** Stable across languages,
  but GitHub does not jump to it, and the check would have to know the
  guides' own syntax.
- **A failing check for the same-commit rule.** Most code changes change
  no rule.
- **Nested `CLAUDE.md` files in five folders,** ADR-086's plan. Each
  loads for its own folder only, so the client's half of an area never
  sees it.

**Deferred — each with what brings it in.**

- **Ids for the rules.** Code, a test or a Help guide needs to cite one
  rule.
- **Executable specifications.** A rule found to have drifted from what
  its test proves, unnoticed by the checks and the review; or a second
  developer.
- **Rules files in French and Chinese.** A support person who reads one
  of them and not English.

**Consequences.**

- A support question about an area with a rules file is answered from
  one page, each answer linked to the test that proves it.
- Every pull request that changes a rule carries its rules file; the
  notice and `/code-review` catch one that does not.
- Claude gets an area's code rules when it touches any of the area's
  files, server or client, and only then.
- A renamed test, a retitled Help section, a removed manual check or a
  moved folder fails the docs check, where it used to go stale unseen.
- Each fix-up batch is a little longer: it writes the rules files for
  its areas. Since they are written from the code, the first rules file
  for an area is also a review of it: a rule with no test, or one where
  the code and its ADR disagree, is a finding for that batch.
