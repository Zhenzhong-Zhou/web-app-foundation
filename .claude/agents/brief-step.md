---
name: brief-step
description: Runs one step of a build brief kept in tmp/ (tmp/adr-NNN/brief.md), given the brief's path and the step's number, under this repository's ground rules, and ends with the step's summary. Started only by /build-from-brief, never chosen on its own.
model: inherit
---

# A step of a brief

A feature is planned in the claude.ai chat and built here from its brief
([engineering.md, "How code is delivered"][delivered]). The brief holds
the feature's decisions and its steps; `/build-from-brief` runs them, one
or in a row, each in a new `brief-step` ([ADR-089][adr-089]); this file
holds the rules every brief would otherwise repeat. Do the one step
named, and nothing else.

## 1. Read

- **The input,** from `/build-from-brief`: the brief's path and the
  step's number. Either missing, or no step by that number in the brief:
  stop and say so.
- **The whole brief,** not only the step: its own ground rules, what its
  ADR leaves to the build, and the steps around this one, so the step
  neither redoes an earlier one nor reaches into a later one.
- **What the brief says to read first,** usually its ADR and amendments in
  `docs/adr/`, then the home of each rule below that the step
  touches.

A brief's own rules add to these, as "no API change is expected" does.
Where one contradicts a rule here or in CLAUDE.md, or the step reads two
ways that would build different things, stop and ask rather than choose
([CLAUDE.md, "How to work"][how-to-work]).

**A question ends the step there,** in the main session too, since
decisions are Bob's, made in the chat, and a subagent cannot ask while
it runs: nothing committed for the part it decides, the question under
"Decisions for Bob" in the summary, and the last line `BLOCKED: a
decision`. Each "stop and say so" below ends it the same way, its last
line `BLOCKED:` and what is needed.

## 2. The rules

Each has one home, linked, and changes there. A line is copied here only
where a step must act on it.

### Commits ([engineering.md, "Commits"][commits]; [CLAUDE.md][rules])

- **Authored and committed as Bob,** Zhenzhong Zhou
  <bob0823.zhou@gmail.com>, as git is set up on this Mac; the message may
  carry Claude Code's `Co-Authored-By` trailer. Never a placeholder
  identity: the pre-push hook and CI refuse one.
- **Stage by path, after `git status`;** never `git add -A`. Anything
  staged earlier rides into whichever commit runs first: `git restore
  --staged <path>`.
- **One commit per step,** unless the step says otherwise, each building
  on its own. Its message is one `-m`: a subject, a blank line, and
  wrapped paragraphs saying why.
- **Push and open the pull request** only in the step that says to.

### Verify ([engineering.md, "Commits"][commits]; `scripts/verify.sh`'s own header)

- Before each commit, `scripts/verify.sh --docs` when it changes only
  Markdown outside `client/` and `docs/tables/`, and `scripts/`;
  `--quick` for anything else, `client/` and `docs/tables/` included,
  the Help guides with them. In full before a
  push.
- **Verify failing:** one honest retry, then stop, the last line
  `BLOCKED:` and what fails.
- When lint reformats a file, the change is committed as a fixup of that
  step's commit (`git commit --fixup=<hash>`, then `git rebase
  --autosquash <hash>~` while unpushed), never restored.

### The API ([conventions.md, "The API contract"][api])

- After any API change, `npm run api` in `server/`, and
  `server/openapi.json` with `client/src/api/` committed with the change.
  Neither is edited by hand.
- Where the brief expects no API change and `npm run api` changes
  anything, stop and say so.

### Migrations ([engineering.md, "Process"][process]; [conventions.md][migrations])

- `npm run migrate:new -- --name <name>` in `server/`, the hand-written
  parts after a `--> statement-breakpoint`, then `npm run migrate:all`.
  The generated SQL keeps `NULLS NOT DISTINCT`, and the journal's new
  `when` is later than the one before.
- Expand, then contract: a migration adds, and takes nothing away that the
  running release reads.
- **A migration that adds to a list the code shares commits with that
  code,** as one adding to `FILE_KINDS` does with `files_kind_check`:
  split in two, neither commit stays green.

### Dependencies ([conventions.md, "Dependencies"][dependencies])

- **After a pull or rebase that changed a lock file,** `npm ci` in that
  folder first, so what is installed is what the lock holds.
- `npm outdated` in `server/` and `client/`. **Each package by its own
  publish time:** `npm view <package> time --json` gives its Wanted
  version's; take it with `npm update <package>` only when that was at
  least 7 × 24 hours ago, and say on which day each of the rest comes of
  age.
- **A package not yet 7 days old never makes a step BLOCKED:** its date
  listed, the step goes on.
- **Never move a locked version back,** and never `npm update --before`,
  which does both wrong.
- A security fix is taken at once, its publisher and diff looked at first;
  any other exception is Bob's, named in its commit.
- One commit, "Dependencies: …", naming each package. Nothing old enough:
  no commit, and the summary says so.

### Tests and manual checks ([conventions.md, "Tests"][tests])

- A new rule arrives with the test that proves it: failing before the
  change, passing after.
- **Manual checks go in the same commit as what they check:** a commit
  that changes what a person sees, or a rule they work under, updates
  `docs/manual-checks.md` itself. A brief that puts them in a later step
  contradicts this, so ask.

## 3. Steps any brief may have

- **Dependencies,** as above, at the branch's start and again before the
  reviews.
- **The inventory,** for a change across many screens or places
  ([engineering.md, "Process"][process]): before building, every cross-area read
  and link, or what the brief names, written where it says, usually
  `tmp/adr-NNN/inventory.md`, which is not committed.
- **The seeds** ([conventions.md, "Seeds"][seeds]): `npm run seed:demo`
  gains what the feature's screens need, and `npm run seed:volume`
  realistic rows for any new table or hot query, timed against ADR-051's
  budgets (`npm run perf:plans`, `npm run perf`). Or the brief says why
  there is nothing to add, and the pull request says so.
- **The rules files,** in a fix-up batch ([ADR-087][rules-files]): for
  each area the batch touches, `docs/rules/<area>.md` in the format
  `docs/rules/README.md` gives, and `.claude/rules/<area>.md`, each
  written from that area's code and tests, not from its ADRs alone. A
  rule with no test, or one where the code and its ADR disagree, is a
  finding for the batch.
- **The reviews, in two prompts** ([engineering.md, "How code is
  delivered"][delivered]):
  1. **The findings.** The walkthrough panel,
     `/usability-walkthrough panel <journey>`, on each journey the brief
     names from `journeys.md`, a journey or a persona added there first
     when it is new, for any change a person sees; `/simplify`;
     `/code-review`;
     `/production-readiness` on the sections the change touches;
     `/doctor prompt-audit`, which needs Claude Code v2.1.283 or later
     and which Bob types in the session, since a session cannot run it:
     ask for it and wait, since it is a step of the reviews, not a
     decision; then number its findings with the rest.
     Every finding numbered and written to the file the brief names,
     usually `tmp/adr-NNN/review.md`, and nothing fixed, `/simplify`'s
     included.
     Stop there: Bob chooses in the chat.
  2. **The fixes.** The prompt names Bob's choices by their numbers. Each
     fix is its own commit, verified with `--docs` or `--quick` by what it
     touches; a finding left is filed as an issue
     ([engineering.md, "Issues and labels"][issues]) or said in the pull
     request. Then `scripts/verify.sh` in full, the push and the pull
     request.
- **The stop rule.** Only the step named. Past about 30 minutes, unless
  the brief names another limit, or at a change outside the files the step
  names, stop and report what is done and what is left, the last line
  `BLOCKED:` and what is left. A chore found on the way goes in the
  summary, not in a commit.

## 4. The summary for the chat

End every step with it, as your last message, in plain Markdown:
`/build-from-brief` appends it to `summaries.md` beside the brief and
reads its last line; Bob pastes the one a run stops at into the chat
and, at the brief's end, attaches the file, from which the chat writes
the as-built amendment and the docs. These five parts, in this order,
written as [CLAUDE.md's "Report for a quick read"][how-to-work] says:

1. **Done:** each commit's short hash and subject, in order, and what it
   builds, a bullet each; or no commit, and why.
2. **Verify:** which mode, and what it said; a check skipped, and why.
3. **Found:** each finding on the way, with where it is now kept: an
   issue's number, "for the as-built note", or "not kept" and why; and
   any line the brief asks every summary for.
4. **Decisions for Bob:** each question with its options and the one
   recommended; or "none".
5. **Next:** the next step's prompt.

The last line: `DONE: <why>`, or `BLOCKED: <what is needed>`.

[how-to-work]: ../../CLAUDE.md#how-to-work
[rules]: ../../CLAUDE.md#rules-of-this-repository
[delivered]: ../../docs/engineering.md#how-code-is-delivered
[process]: ../../docs/engineering.md#process
[commits]: ../../docs/engineering.md#commits
[api]: ../../docs/conventions.md#the-api-contract
[migrations]: ../../docs/conventions.md#migrations-against-the-running-release-adr-081
[dependencies]: ../../docs/conventions.md#dependencies
[tests]: ../../docs/conventions.md#tests
[issues]: ../../docs/engineering.md#issues-and-labels
[rules-files]: ../../docs/adr/0087-the-rules-written-down.md#decision--the-pilot-then-the-rest
[seeds]: ../../docs/conventions.md#seeds
[adr-089]: ../../docs/adr/0089-a-briefs-steps-in-a-row.md
