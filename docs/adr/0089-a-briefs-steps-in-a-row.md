---
status: accepted
date: 2026-11-02
areas: [docs, ops]
amends: [ADR-083, ADR-088]
---

# ADR-089 — A brief's steps in a row: each in a fresh subagent, stopping only for a person (amends ADR-083 and ADR-088)

## Context

Since [ADR-083](0083-the-emails.md) a feature is built one step of its
brief per prompt, `/build-from-brief tmp/adr-NNN/brief.md N`, and each
step needs the maintainer three times: `/clear`, the next command typed,
and the summary pasted into the chat. Most summaries need no answer: the
chat reads them, gives the next prompt, and keeps notes for the as-built.
From ADR-085's step 12 each summary was appended to a file beside the
brief, and only one with a decision or BLOCKED was pasted. #348 asks for
the rest: the steps run in a row, each in a fresh subagent, stopping only
when a person is needed.

What Claude Code offers, as its documentation and reports have it on 2
November 2026, each to be seen working in the build's trial rather than
assumed:

- **A subagent** is a helper the session starts with a context of its
  own: it loads `CLAUDE.md`, works with the session's tools and
  permissions, and hands back only its last message. A custom one is a
  Markdown file in `.claude/agents/`, its body the instructions it
  starts with.
- **It cannot ask the person anything while it runs:** a question ends
  its turn and goes back to the session that started it.
- **A custom subagent can preload skills,** but a skill marked
  `disable-model-invocation`, as `/build-from-brief` is, reportedly does
  not load that way.
- **A new `.claude/agents/` folder** is reportedly found only when Claude
  Code starts.

The check before an ADR ([engineering.md, Process](../engineering.md#process))
is a block of shell in the planning skill, which the chat fills in with
the areas and the issues and the maintainer pastes and runs. A mistyped
area prints no issues rather than failing, and on 2 November the
maintainer asked what the block was and whether it should be a script.

Checked before drafting, as the working agreements ask, with the open
issues in `area:docs` and `area:ops` on 2 November 2026:

- **Fired, and taken here.** #348. ADR-019's amendment: the multer
  override under `@nestjs/platform-express` goes once that package
  depends on the fixed release, which its 12.3.2 does, 7 days old from 3
  November.
- **Not fired, and left.** #292, `when-touched` in docs: #327 fixed most
  of it, and what is left is the two points ADR-088 left on purpose,
  manual-check ids as links, which need anchors and a docs-check change
  beside #283, and which part "partly tested" leaves out, which needs the
  invoice tests read in the invoices fix-up batch. #340, `when-touched`
  in ops: it needs a decision of its own and changes the API check, which
  this branch does not touch; it goes with the fix-ups' CI batch. #253
  and #226, `when-touched`: the review workflow and the plan check,
  neither touched here. The `fix-now` issues #342, #334, #263 and #248,
  in the Fix-ups milestone's batches. #319, #320, #321, #336, #284,
  #283, #197 and #142, each waiting for its trigger. The Deferred items
  of the docs and ops ADRs, ADR-051's watch list and the open decisions:
  none fires.
- **Found while checking.** #348 was labelled `area:ops` alone; it takes
  `area:docs` too. #335 and #338 name ADR-089 and ADR-090, which this ADR
  renumbers (below). Dependabot's open pull requests and this branch's
  dependency step would both change the lock files, so the step waits
  for them (Consequences). On 2 November, once its 7-day cooldown merged
  (#366), Dependabot closed #362 to #365 and opened #367 to #370, each
  holding only releases already 7 days old. Claude Code Review fails on
  each, since a run Dependabot starts gets none of the repository's
  secrets; this branch's dependency step makes the review skip them.

## Decision — `/build-from-brief <brief> from <N>`: the steps in a row

`/build-from-brief <brief> <N>` still runs one step. `from <N>` runs step
N and each one after it, in the brief's order, until a stop below. Each
step is run as one is today: its commits, verified as now; `npm run
migrate:all` after a new migration; and its summary in the same five
parts, appended to `summaries.md` beside the brief under the step's
number and the time in Vancouver. The session keeps only the summaries,
so the chat reads only the stops and, at the end, the summaries file for
the as-built.

## Decision — each step in a fresh subagent, from `.claude/agents/brief-step.md`

What a step does moves from the skill into a custom subagent,
`brief-step`: the rules the skill's sections 1 to 4 hold today (what to
read, commits, verify, the API, migrations, dependencies, tests and
manual checks, the steps any brief may have, and the summary). The skill
keeps the loop: its arguments, the stops, the stop file and the
summaries file.

- **Every Claude Code step runs in a new `brief-step`,** one alone or in
  a row, so a step behaves the same either way and starts as clean as
  after `/clear`.
- **Its own file is its instructions,** so nothing depends on preloading
  a skill marked user-only, and the skill stays user-only: it runs only
  when a prompt names it, as ADR-083 decided.
- **One home per rule stays:** the subagent links `conventions.md` and
  the working agreements as the skill did, and the rules move rather
  than being copied.
- **It ends with its summary,** whose last line is `DONE: <why>` or
  `BLOCKED: <what is needed>`, which the loop reads. A question the
  brief does not answer ends the step there, nothing committed for the
  part it decides, and the step reports BLOCKED with the question under
  its decisions.

## Decision — where a run stops

A run stops, saying why in one line and then printing the last step's
summary for the chat, only:

- **at a step the brief gives to someone else:** the chat's, or the
  maintainer's (a restart, a pull, a check by hand);
- **before a review step** (next decision);
- **when a step reports BLOCKED:** a question the brief does not answer,
  or verify still failing after one honest retry;
- **before anything that would push,** open a pull request, merge or
  change `main`;
- **after the current step, when a file named `STOP` is beside the
  brief,** made by hand; the run removes it as it stops, so the next run
  goes on;
- **at the stop rule:** a step past its time, 30 minutes unless the brief
  names another, stops as it does today, saying what is done and what is
  left.

A dependency step takes what is old enough that day and goes on, as
today: nothing waits for a package to come of age.

## Decision — the reviews stay in the main session

The review steps, the findings and then the fixes, run in the session
itself, never in a subagent, and a run in a row stops before the first.
They stop for the maintainer's choices anyway, `/doctor prompt-audit` is
typed in the session, and the reviews' own skills start helpers of their
own.

## Decision — the check before an ADR, as a script

`scripts/adr-check.mjs <NNN> --areas <a,b> [--issues <n,m>]` writes
`tmp/adr-NNN/check.txt`: each area's open issues, then the whole text and
comments of each issue named and of each `when-touched` one in those
areas, once each, read through `gh`'s JSON as the block does (ADR-084's
check).

- **It refuses, writing nothing,** an area not in `AREAS`, naming them;
  a number not of three digits; and `gh` not signed in.
- **Its tests** run it against a stand-in `gh`, under `node --test
  scripts/` with the other scripts' tests.
- **The planning skill's section 1 names it** in place of the block, and
  engineering.md's Process beside the rule it serves.

## Decision — the numbers after it

The design language (#338) becomes ADR-090 and Home for a newcomer
(#335) ADR-091, as ADR-083 moved low stock: an ADR's number is the order
it is written in, and these two wait for the fix-ups.

## Considered and not done

- **An amendment of ADR-083 alone,** as #348 first asked. ADR-083's areas
  are invitations and mail, so the index's `docs` line would not find
  it, and the change reaches the planning skill, which is ADR-088's.
- **Preloading `/build-from-brief` into the subagent** with `skills:`. A
  skill marked user-only reportedly does not preload, and unmarking it
  would let Claude Code start a build on its own initiative.
- **One session for the whole run, compacting between steps.** A compact
  keeps a summary of what came before, so a step no longer starts clean,
  and a long run's context still grows.
- **A shell loop of headless sessions,** `claude -p` per step. Each
  starts clean, but a step that needs a permission or an answer has
  nowhere to ask, and the permissions would have to be granted ahead,
  wider than the session's.
- **The reviews in a subagent.** Above.
- **The check kept as a block** the chat fills in: ten lines to paste
  each time, and a mistyped area prints nothing instead of failing.

## Deferred — each with what brings it in

- **Steps in parallel,** each in a worktree of its own. Trigger: a brief
  whose steps do not depend on one another, long enough for the wait to
  matter.
- **A run that goes on past the reviews,** its choices given ahead.
  Trigger: review rounds whose choices are routinely all of them.
- **The subagent made general,** with the skill, in the plugin
  repository: #321's trigger.

## Consequences

- `.claude/skills/build-from-brief/SKILL.md` becomes the loop, and
  `.claude/agents/brief-step.md` holds a step's rules. CLAUDE.md's
  skills, the README's "Which tool, when" and engineering.md's build
  paragraph say how a run goes, that the chat sees only the stops, and
  that `/clear` is safe after a stop, once its summary is pasted.
- A brief's steps table names who runs each step: Claude Code, the main
  session (the reviews), the chat or the maintainer. The planning
  skill's brief shape and its section 5, "While building", change with
  it, and its section 1 names the check script. The skill is uploaded
  again after the merge (ADR-088's amendment).
- `scripts/adr-check.mjs` and its tests; engineering.md's Process names
  it.
- No API change, no migration and nothing a person sees in the app: no
  seeds, no manual checks and no walkthrough.
- Build order, a commit each unless said, its brief in
  `tmp/adr-089/brief.md`:
  1. this ADR, with the handoff tidied;
  2. the loop and the subagent;
  3. by hand: Claude Code restarted, then a trial brief, committing
     nothing;
  4. the check script, the branch's first run in a row;
  5. the planning skill, by the chat;
  6. by hand: the branch updated from `main` once #367 to #370 have
     merged;
  7. dependencies, from 3 November, 05:03, with the multer override's
     removal, and Claude Code Review skipping Dependabot's pull requests,
     a commit of its own;
  8. the reviews' findings, in the main session;
  9. the fixes chosen, the full verify, the push and the pull request;
  10. the as-built, by the chat.

## Amendment (November 2026) — as built (#403)

Built in #403 by its brief, the trial in step 3 committing nothing.
Where building differed from the decisions above, or found other than
the Context assumed:

- **Claude Code, as seen on 2 November (2.1.316).** A subagent starts in
  the background, fork mode being on by default, and its result comes
  back as a notification; the loop reads the next step only once that
  result is back, and the trial's run went from step to step with
  nothing typed. A step hands its summary back through a hand-back tool
  call, not as plain text at the end. `brief-step` was found by the
  session that made it, without the restart the documentation asks for,
  and the `/agents` list is gone, so a session is asked which subagents
  it can start. A user-only skill cannot be preloaded, as the Context
  has it.
- **The trial:** three runs, each proving one stop: a question handed
  back at step 3, its step 2 knowing nothing of step 1's work; the
  `STOP` file, after step 4; and the maintainer's step 6.
- **The stop file** is checked after each step and removed at every
  stop, not only when it is the reason (the reviews' finding 3), so one
  made during a step that ends BLOCKED, or during the last, never stops
  the next run early.
- **A step named alone takes the maintainer's choices** after its
  number, `<brief> <N> [choices]`, which the loop refused at first
  (finding 24); the fixes step runs that way.
- **The dependency step** made no commit: nothing in range was 7 days
  old on 2 November. The multer override stays until the next branch's
  dependency step, once the Nest packages at 12.3.2 are old enough, so
  ADR-019's amendment, fired above, is taken there. `brief-step`'s rule
  now says that a package not yet old enough never stops a step, its
  date listed, and that `npm ci` comes first after a pull or a rebase
  that changed a lock file.
- **Claude Code Review skips Dependabot's pull requests** by who opened
  them (`user.login`), so a run the maintainer starts on one is skipped
  too, as reviewing no version bump intends. Such a run fails for two
  reasons, not the one the Context gives: the action refuses a run a
  bot starts, and Dependabot's runs get no secrets.
- **The check script** keeps the areas in the order given, takes digits
  alone for `--issues`, and says so when GitHub cannot be reached; a
  real run matched the block it replaced line for line.
- **The reviews' step** took about 75 minutes, waiting for its helpers
  and for the maintainer, past the 30-minute stop rule; the brief's
  shape now gives the reviews none.
- **Areas:** `ops` added, for the review workflow and ADR-019's
  override (the reviews' finding 20).
- **Deferred, added, each with what brings it in:**
  - *The loop writing each summary once,* the step appending its own: a
    run long enough for the loop's context to matter.
  - *The loop's bookkeeping as a script* (the steps table, the stop
    file, the summaries' headings), the model only starting each step:
    a run that misreads the table or changes a summary as it copies it.
