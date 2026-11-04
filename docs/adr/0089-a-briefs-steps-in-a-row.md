---
status: accepted
date: 2026-11-02
areas: [docs, ops]
amends: [ADR-083, ADR-088]
amended-by: [ADR-090]
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

## Amendment (November 2026) — a small issue fixed by `/fix-issue <N>`, in a cloud session or on the Mac

Since 24 October, small issues have gone to cloud sessions (Claude Code
on the web), each prompt some twenty lines the chat wrote again every
time from the same rules in engineering.md's "Cloud sessions": the
issue, the branch, the author, the regression check's number, the files
to leave alone, the verify, the pull request and the stop rule. On 2
November, two of the four sessions started that evening found their
issue already fixed on `main`: pull request #361 had fixed seven issues
and closed none, its description without a "Closes" line for its riders,
and the check that would have caught it was one the chat did by hand and
skipped. The maintainer chose each decision below as recommended, 2
November 2026; it is decided here because this ADR holds the skills that
run work the chat plans.

Checked before drafting, for the areas docs and ops, ops having been
checked the same day for ADR-008's amendment:

- **Fired, and taken here:** none.
- **Not fired, and left:**
  - #319 (`later`), a `/file-issue` skill: filing an issue, not fixing
    one.
  - #321 (`later`), the general skills as a plugin: `/fix-issue` reads
    this repository's own rules, so it stays here; it joins the
    candidates for the plugin, under this ADR's Deferred.
  - #292 (`when-touched`): its last parts each wait for their own batch,
    as its comment of 2 November says.
  - This ADR's Deferred, steps in parallel in worktrees: not fired; the
    second working folder this branch was built in was by hand.
  - Open decisions: nothing on skills or sessions.
- **Found while checking:** besides the six issues #361 fixed and left
  open, closed by hand on 2 November (#222, #256, #265, #301, #309,
  #341; #313 earlier), every open issue that a commit on `main` names
  was checked: each is fixed only in part, or only mentioned.

### Decision — `/fix-issue <N>`: one small issue, end to end

- **A skill, `.claude/skills/fix-issue/`, run only when a prompt names
  it,** in a cloud session or in Claude Code on the Mac. A cloud
  session's prompt is that one line, `leave <path> …` after it when a
  branch is not pushed.
- **Its order:** the Node; whether a commit on `main` already fixes the
  issue, stopping with the command that closes it; the issue whole,
  stopping on a choice left open, a `later` or a `decision` label, a
  sweep or the large seed; the files to leave alone; the fix, with a
  test that fails before and a regression check when a person sees the
  change; `scripts/verify.sh --quick`; one commit as the maintainer; the
  push; a pull request that closes the issue.
- **Two rules bend for it, said where they do:** it takes no dependency
  commit, against `docs/conventions.md`'s Dependencies, since a fix this
  small stays one commit and the next branch's dependency step takes
  what is due; and without Docker, as in a cloud session, it pushes after
  `scripts/verify.sh --quick`, leaving ShellCheck and the check against
  `main` to CI. Where Docker answers, as on the Mac, the verify runs in
  full before the push, as CLAUDE.md asks.
- **It changes nothing on GitHub but its branch and pull request:**
  merging, labels, closes and comments stay the maintainer's, as
  `/triage`'s do.

### Decision — the files to leave alone, worked out

- **From every open pull request's files and every pushed branch still
  in work,** with any paths after `leave`; never typed by the chat. A
  branch whose pull request is merged or closed is skipped, since one
  squashed into `main` is never its ancestor; GitHub deletes a merged
  pull request's branch ("Automatically delete head branches", on since
  2 November), and the fetch prunes what it deleted.
- **A branch built on the Mac is pushed at each stop of its run,** so
  its files show. A push to a branch starts no workflow: CI and the docs
  check run on a push to `main` alone, and on pull requests.

### Decision — each manual check's id given once, checked

Two sessions started together can each take the next free `MC-R`
number, since neither sees the other's branch until it is pushed.
`scripts/check-docs.mjs` fails a manual check's id given twice in
`docs/manual-checks.md`, naming the first, so CI stops the second pull
request, which renumbers, whatever the cause; the chat no longer hands
out numbers.

### Decision — a pull request closes every issue it fixes

engineering.md's "Closes #N for each issue it fixes" holds for every
pull request, a rider included, not only the fix-ups'. The issues its
commits name are the list checked before it opens.

### Considered and not done

- **The `@claude` workflow on an issue's comment,** given the right to
  push: it runs on the maintainer's plan, not the cloud credit, and opens
  a path for writing from a comment. `claude.yml` stays read-only.
- **A saved prompt to paste:** the checks would stay by hand.
- **The files to leave alone named by the chat:** it misses a branch
  nobody named.
- **The chat handing each session its regression check's number,**
  `/fix-issue <N> mc <n>`: it holds only when the chat remembers, where a
  check in CI holds whatever the cause.

### Deferred — each with what brings it in

- **Several small issues of one area in one session and one pull
  request.** Trigger: a run of issues in one area, each too small for a
  session of its own.
- **The chat's choosing as a script** (open, small, no choice left, not
  fixed on `main`). Trigger: an issue given to a session that a script
  would have ruled out.

### Consequences

- `.claude/skills/fix-issue/SKILL.md`, and `scripts/check-docs.mjs`
  with its tests for each manual check's id. engineering.md's "Cloud
  sessions" says what the skill does not: choosing, merging and
  conflicts.
  "Issues and labels" says every pull request closes what it fixes.
  `CLAUDE.md`'s skills and the README's "Which tool, when" and its list
  of skills name `/fix-issue`.
- The planning skill says a cloud session's prompt is `/fix-issue <N>`,
  and is uploaded again after the merge (ADR-088's amendment).
- No API change, no migration and nothing a person sees in the app.
- Built on `fix-issue-skill`, from a second working folder while
  `fix-ups-ci` ran in the first: this amendment, then the skill and the
  docs, a commit each.

### As built, after a day of use (#435, 3 November 2026)

- **The catalogues join `docs/manual-checks.md` off the list of files to
  leave alone.** Two sessions (#315's, #179's) stopped because
  `fix-ups-ci` added one line to each catalogue, far from theirs; each
  went on when told, and merged cleanly.
- **A choice reaches a session only through its issue.** #245's session
  found no comment recording the maintainer's choice, so it followed the
  issue as first written, and was told again. The chat records each
  choice on its issue before the session starts.
- Eight issues went through `/fix-issue` in its first day, 2 and 3
  November: #358, #315, #242, #179, #428, #125, #165 and #245, each
  merged.

## Amendment (November 2026) — the walkthrough panel in the review step, and cloud picks from an export (ADR-090)

- **The review step's walkthrough is a panel:** `/usability-walkthrough
  panel <journey>` on each journey of
  `.claude/skills/usability-walkthrough/journeys.md` the change touches,
  its personas at once, each in a `walkthrough` subagent
  (`.claude/agents/walkthrough.md`), with their findings merged. A brief
  names the journeys, or says why none; `brief-step` asks for them as it
  asked for one persona.
- **A cloud pick comes from an export:** the open `fix-now` and
  `when-touched` issues, with their text and comments, written by `gh`
  to `tmp/cloud-picks.json` and attached to the chat, rather than read
  from GitHub's pages. An issue that names more than about five files
  goes to a Mac branch instead: #310's session stopped for thirteen
  dialogs on 4 November 2026.
