---
status: accepted
date: 2026-11-02
areas: [database, docs, ops]
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
  `when-touched` issues with their text, written by `gh` to
  `tmp/cloud-picks.json`, then the few shortlisted from it with their
  comments, to `tmp/cloud-picks-shortlist.json`, each attached to the
  chat rather than read from GitHub's pages. An issue that names more than about five files
  goes to a Mac branch instead: #310's session stopped for nine
  dialogs on 4 November 2026.

## Amendment (November 2026) — each step on the model its work needs

Since this ADR, every step of a brief runs in a `brief-step` subagent
that inherits the session's model. A brief therefore ran on Opus from
its dependency step to its docs, or on Sonnet throughout when the
maintainer switched for routine steps by hand (`/model sonnet`). Two
things on Customise Home's branch (#515) showed what that costs: a check
written on Sonnet raced Done's own read of Home in CI (3cdebcd7), and
Linux WebKit started a keyboard drag a render later than the Mac's
WebKit, so a test's arrow came too soon (5631d0d8). The maintainer chose
each decision below on 6 and 7 November 2026. The same amendment takes
Customise Home's review findings 89, 90 and 91, from its
`/doctor prompt-audit`.

Checked before drafting, for the areas docs and ops and for the issues
it names, #505, #507 and #514 (`scripts/adr-check.mjs`, 7 November
2026):

- **Fired, and taken here:**
  - #467 (`when-touched`), for the files this changes: 11, the review
    step written in one home, engineering.md, the other places linking
    to it; 20, `CLAUDE.md`'s lines for the skills; 21,
    `.claude/rules/ui.md` naming the parts of the design language a
    change to a screen reads, with finding 91; and 22's repeats in
    `.claude/agents/walkthrough.md`.
  - #505's 93: a test that Home's time line is not a live region, in
    `client/e2e/home.spec.ts`, which the drag helper changes. As built,
    it was already done in #515 (4c231598), so nothing was left to take.
- **Not fired, and left:**
  - #467's 13 (a `tools:` line for the walker), 22's report fields, 16
    and 18 each change what a panel does, and only a walk proves them.
    This branch changes nothing a person sees and walks no panel; Items'
    branch, which does, takes them. 12 waits for cloud sessions to come
    back. 14, 17 and 25: their files are not changed.
  - #292's two parts left, each for its own batch, as its comment says.
  - #253, the review workflow, is not changed; #226 needs a query, and
    this has none; #263 is the client's, in its Fix-ups batch; #336 is
    reported by each dependency step; #446 waits upstream, with #410 on
    the same advisories; and #197, #142, #283, #319 and #320 are not
    touched.
  - #284 asks for whole workflows in WebKit and Firefox; this adds one
    spec in Linux WebKit to the full verify, and leaves it open.
  - #321: the router reads this repository's own rules, so it stays
    here, one more candidate under this ADR's Deferred.
  - #507 and #514: none of their files is changed.
  - The Deferred lines of the docs and ops ADRs, ADR-051's watch list
    and Open decisions hold nothing on models or on how a step runs.
- **Found while checking:** `@dnd-kit/dom` 0.5.3 sets `aria-pressed` on
  a tile's handle a frame after the pick-up, and its placeholder copy
  keeps `false`, so a log of 7 November that never saw it change
  probably read it too early, or read the copy. The drag helper's step
  checks it once.

### Decision — a model for every step, named in its brief

- **A brief's steps table gains a Model column:** `opus`, `sonnet` or
  `haiku` for each of Claude Code's steps, set by the chat when it plans,
  from a default table in engineering.md:
  - Opus for new server or client logic, design, the reviews and their
    fixes, a test written with them, and any new or changed browser
    test;
  - Sonnet for dependencies, seeds, Help guides, docs, and a unit or
    server test copied from one beside it;
  - Haiku only for a step that runs commands and reports, never one
    that writes code.
- **The loop names the model** each time it starts a step. Claude Code
  puts a model named for one subagent above the one in its file, from
  2.1.251. `brief-step`'s file says `opus`, never `inherit`, so a step
  that somehow has none never drops to the loop's model. A brief without
  the column, or with another value, is refused.

### Decision — the loop on Sonnet, the reviews on Opus

- **`/build-from-brief` is pinned to Sonnet** (`model: sonnet`). It reads
  the table, starts each step and appends its summary; it judges none.
  The planning that a strong model does is the chat's, in the brief.
- **A skill's pin lasts the turn that runs it,** so the reviews leave
  the loop: a new skill, `/review-step <brief> <N> [choices]`, pinned to
  Opus at high effort, runs a step whose Who is `Claude Code, main
  session`, by `brief-step`'s rules, in the two prompts this ADR set.
  `/build-from-brief` refuses such a step, naming the command.
- **No silent downgrade:** each step's summary names the model it ran
  on, and a model other than the brief's stops the run.
- **The walkthrough's personas run on Sonnet** (`walkthrough.md`), and
  the panel merges their reports in the review step's session, on Opus.

**As built (review finding 27):** a skill's model holds for one turn,
and each step's result comes back in a new turn, so the Sonnet pin
reached only a run's first step. The loop has no model of its own: it
runs on the session's model, kept on Opus by `"model": "opus"` in the
maintainer's `.claude/settings.local.json`, which git never sees.
`/review-step` keeps its pin for its first turn, and the session's Opus
holds the rest. Each step's own model is unaffected, since the loop
still names it when it starts the step.

### Decision — a failed step escalates once to Opus

A Sonnet or Haiku step that ends BLOCKED is run again on Opus by the
loop itself, when either its verify still fails on its own code after
the one honest retry, or it stops at work above its model, such as a
browser test.

- **From a clean tree:** the attempt's uncommitted work is set aside
  with `git stash` and saved as a diff beside the brief, and the Opus
  step is told where it is and why the first attempt stopped.
- **Never** for a failure of the environment (Docker, the database, the
  network), which stops for the maintainer, nor for a step that
  committed before it failed.
- **Once a run:** a second escalation stops the run. Both attempts are
  in the summaries.
- This replaces the first wording, a stop that said to run the step
  again on Opus. Routing elsewhere escalates on its own when an
  objective check fails, and verify is one.

### Decision — the plan before a run, and checks before its first step

- **`from N` prints the plan,** each step up to the next stop with its
  model and its minutes from the brief's table, and where the run will
  stop; then it starts. `/build-from-brief <brief> plan` prints the plan
  alone. It never waits for a "go": a reply is a new turn, which the
  Sonnet pin does not reach.
- **It refuses to start, naming why,** when the branch is not the
  brief's; when a tracked file has changes; when Claude Code is older
  than 2.1.251; when `CLAUDE_CODE_SUBAGENT_MODEL` or
  `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` is set, either of which can put
  every step on one model; or when Docker is not running and a step's
  verify needs it.

### Decision — what a stop reports, and what it cost

- **Two summaries:** each step ends with its full summary, appended to
  `summaries.md` beside the brief, and a short one of 10 to 15 lines,
  which the run prints at a stop for the chat.
- **Each summary's heading names its model, its minutes and its tokens**
  where Claude Code reports them. The as-built compares them with the
  brief's time-and-cost table, and the default table changes where they
  disagree.

### Decision — a new test proved before its commit, and burned in by CI

- **Each new or changed test runs before its commit** as the flake hunt
  runs: five times for a client unit test or a browser test
  (`--repeat-each=5`), three times for a server end-to-end test.
- **CI burns in** what a pull request changed: in the browser job, after
  its run, the specs it changed and those importing a file it changed,
  five times each in Chromium, with retries off. It stops at 20 minutes;
  a selection too wide for that burns in only the specs the pull request
  changed itself.
- **A keyboard drag in a test goes through one helper,** which waits for
  the pick-up and for each move before the next key.
- **The full verify runs the accessibility spec in Linux WebKit** from
  Playwright's image, as it runs Firefox.

### Decision — the planning skill checked for its models

`evals.md` gains a prompt: the models of a brief's steps follow the
default table.

### Decision — Customise Home's review findings 89, 90 and 91

- **89:** `/fix-issue` and the README merge a cloud session's pull
  request with `gh pr merge <PR>`, the pull request's number and not the
  issue's.
- **90:** the panel hands each walker an account for each size where
  step 1 made one per size, and a journey that starts on an invitation
  gets an invitation for each size, since one is accepted once.
- **91:** `scripts/check-docs.mjs` holds a code rules file in
  `.claude/rules/` to at most 40 lines after its front matter, the limit
  ADR-087 set and nothing checked. `ui.md`, at 44, is trimmed to it.

### Considered and not done

- **One skill for the loop and the reviews,** the session's model
  switched by hand: one forgotten switch runs the reviews on Sonnet.
- **The reviews under the loop's Sonnet pin:** they are the work Opus is
  for.
- **The loop on Opus,** as a lead agent is in a research system: the
  planning is the chat's, and the loop judges nothing. As built, it runs
  on the session's Opus all the same, since a pin holds one turn.
- **Escalation by hand after a stop,** the first wording: a stop for
  what the loop can decide on an objective check.
- **Opus going on from the failed attempt's changes:** it would inherit
  the approach that failed.
- **A plan that waits for a "go":** the run would go on outside the
  pin.
- **A learned router choosing each model:** there are no measurements
  yet; the table and the measured minutes come first.
- **Fewer than 40 lines,** which would trim `database.md` and
  `production-orders.md` too, for no reason ADR-087 gives.

### Deferred — each with what brings it in

- **A model chosen per step from measurements** rather than the table.
  Trigger: three briefs whose measured minutes or tokens disagree with
  the table.
- **Effort set per step.** Trigger: a kind of step the measurements show
  slow or wasteful at its model's default effort.
- **Server end-to-end tests burned in by CI.** Trigger: a server test
  that passes three times on the Mac and then flakes in CI.
- **The loop's fixed parts in a script:** its checks before a run, its
  times and its appends, which give the same result for the same input
  (review finding 35). Trigger: a run in which the loop gets one of them
  wrong.
- **A browser-test step on Sonnet or Haiku refused at the plan,** rather
  than when it runs, where it spends the run's one escalation (review
  finding 15). Trigger: a Sonnet or Haiku row that reaches a browser
  test.

### Consequences

- `.claude/skills/build-from-brief/SKILL.md` gains the pin, the Model
  column, the plan, the checks before a run, the escalation, the model
  check and the short summary; `.claude/skills/review-step/SKILL.md` is
  new; `.claude/agents/brief-step.md` says `opus`, names its model,
  sorts a BLOCKED by its kind, and writes both summaries; and
  `walkthrough.md` says `sonnet`.
- engineering.md holds the default table, and the review step in its
  one home (#467's 11). `CLAUDE.md`, the README's "Which tool, when",
  `docs/README.md` and `docs/design-language.md` name `/review-step`, or
  link to it. conventions.md's Tests says how a new test is proved and
  burned in, and names the drag helper.
- The planning skill's brief gains the Model column and `/review-step`,
  and its `evals.md` a seventh prompt. It is uploaded again after the
  merge (ADR-088's amendment).
- `scripts/check-docs.mjs` and its tests, `.claude/rules/ui.md` and
  `/rules-file`; `scripts/verify.sh`; and `.github/workflows/ci.yml`.
- Until the loop's step lands and Claude Code restarts, a step inherits
  the session's model, so this branch's first steps run one at a time,
  each with its model set by hand.
- No API change, no migration and nothing a person sees in the app.
- Built on `build-router`, in this order: this amendment; dependencies;
  findings 89 and 90; the loop, `/review-step` and the step's agent; a
  restart and a run that proves the routing; the working agreements; the
  planning skill; finding 91; the drag helper; Linux WebKit in the full
  verify; CI's burn-in; dependencies again; the reviews; the as-built.

### As built

Built on 7 and 8 November 2026 on `build-router`, 40 commits with this
as-built, pull request #518.

- **Each step on its row's model,** from step 7: Sonnet for 7, 8 and 13,
  Opus for 9 to 12. Steps 2 and 3 ran on Opus, since the loop then in
  place gave a step the session's model, and the maintainer chose not to
  switch by hand. Step 6's proof ran Haiku, then Sonnet escalated to
  Opus, then Opus, and refused a second escalation; it refused a changed
  tracked file before any step.
- **Measured against the brief's guesses,** minutes and the tokens the
  Agent tool counted:

  | Step | Model | Minutes (guess) | Tokens |
  | --- | --- | --- | --- |
  | 5 | opus | 8 (45) | not shown |
  | 7 | sonnet | 5 (30) | 148,561 |
  | 8 | sonnet | 1 (15) | 52,510 |
  | 9 | opus | 10 (20) | 134,862 |
  | 10 | opus | 19 (40) | 139,792 |
  | 11 | opus | 20 (50) | 117,259 |
  | 12 | opus | 16 (25) | 146,520 |
  | 13 | sonnet | 7 (10) | 60,073 |
  | 14, findings | opus | 33 (50) | its helpers 598,145 |
  | 14, fixes | opus | 38 (90) | not shown |

  The steps took about half the guessed time, and the next brief's
  guesses start from these. The default table is unchanged: one brief is
  not the three its Deferred line asks for.
- **Every subagent starts in the background** in Claude Code 2.1.319, so
  a step's hand-back is its summary:
  - step 8, on Sonnet, handed back the word `placeholder` in the turn of
    its commit, cb2edd04, and its summary was lost; reported to
    Anthropic. A step now sends its summary alone and in full, and the
    loop asks the same agent once more when the `Model:` line or the last
    line is missing (e58030e8);
  - step 13 handed back with two of its background commands still
    running, one waiting on input; none may outlive its step now
    (775859a3).
- **The loop on the session's model,** not Sonnet, as the note under its
  decision says (238f052c).
- **The burn-in:** `--shard`, so each test runs five times in all, not
  once per shard; the browser job's limit from 45 minutes to 60; a cap
  of 150 tests, not 40, counted before the repeats; a warning on the
  pull request when it narrows (938c11f3), and #516 for past 150. Its
  first real run was #518's own: 131 tests on the `--only-changed` path,
  all passing, each Playwright shard taking 11 to 14 minutes.
- **Linux WebKit in the full verify** adds about 2 minutes to a run of
  14 or 15. One container, `verify-linux-browsers`, serves Firefox and
  WebKit.
- **The drag helper** waits on the library's own signs, and each key
  takes about half a second, the library's pause before it speaks a
  move. `aria-pressed` turns `true` on the live handle a frame after the
  pick-up, and the placeholder's copy stays `false`, so #507 needed no
  comment. Proved in 1,165 runs on the Mac and 10 in Linux WebKit.
- **Finding 90:** `join` gets an invitation for each persona and size,
  not only the outsider's, since every persona starts on one; the
  walker's input names its invitations, and its scope line is back
  (a60f154c). "Your own account only" still speaks of signing in with
  the email given.
- **Finding 91:** `ui.md` first met the cap by joining lines, so review
  finding 25 wrapped it again and cut it to 40 lines and 320 words; #517
  asks for a cap in characters. `database.md` and `production-orders.md`
  sit at exactly 40, and `ui.md` names the design language's parts in
  quotes, which the docs check does not follow.
- **The reviews:** 35 findings. Fixed: 1 to 8, 10, 11, 18, 24 to 29 and
  33; filed: #516 and #517; comments on #284 and #467; dropped: 12 to 17,
  19 to 23 and 32. Of the rest:
  - 31: `## For the chat` keeps its 10 to 15 lines, which every stop met;
  - 34: only `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` can override a model
    named for one step, and refusing both variables costs nothing;
  - 35 and 15: under Deferred.
- **Dependencies:** the formatjs packages (4da037ea) and globals 17.14.0
  (489beeb7). TypeScript 7 (#336) still waits on typescript-eslint, the
  Nest CLI and `@hey-api/openapi-ts`.
- **Riders:** #467's 11, 20, 21 and 22's repeats; its 30 left for Items'
  branch, which walks a panel.
- **The Opus setting lives on the Mac:** a new machine adds
  `"model": "opus"` to `.claude/settings.local.json` and lists that file
  in `.git/info/exclude`.

## Amendment (November 2026) — small fixes on the API credit, by a runner in the repository

Since 8 November the maintainer's API key carries a promotional credit of
US$100 a month, the current one ending on 9 December 2026 (UTC). It pays
for the API and the Agent SDK, not for Claude Code: a Claude Code session
on the key fails with "credit balance too low". A runner kept in the
ignored `tmp/sdk-fix/` ran `/fix-issue <N>` through the Agent SDK in a
second working folder, `../waf-fix`, so the credit paid for it. Its first
fix, #514, merged as #519 the same day, for about US$1.70. A first run
had ended while its verify ran in the background, since a session ends
when the agent's turn ends; the runner then turned background tasks off,
as #252 did for Claude Code Review, and checks the folder after each run.

The runner was kept out of the repository while the credit was thought to
end on 9 December. It comes every month, so the runner moves in, and a
fix on the credit can run while a feature is built in the first folder.
Two working folders share the app's ports and test databases, and a
second full verify started while one runs clashes in three places:

- the server's end-to-end suite refuses at its start, on the advisory
  lock its global setup takes (issue #1);
- the browser suite reuses the servers the first folder's run started on
  3100 and 5273, since `reuseExistingServer` is on outside CI, so it
  tests the other folder's code, on the database that run is using;
- the Linux browsers' container is removed by name, `docker rm --force
  verify-linux-browsers`, under the first run's tests.

The maintainer chose each decision below on 8 November 2026, asking for
the practice teams use in each, which the decisions follow.

Checked before drafting, for the areas docs and ops
(`scripts/adr-check.mjs`, 8 November 2026):

- **Fired, and taken here:** #467's 12 (`when-touched`): the picks'
  exports in `scripts/cloud-picks.sh`, under ShellCheck, rather than two
  long lines in the planning skill's section 8, which this changes. The
  router's check left it for cloud sessions' return; picks are back, each
  month, on the credit.
- **Not fired, and left:**
  - #467's 13, 14, 16, 17, 18, 22's report fields, 25 and 8 November's
    screenshot line: each changes what a panel does, and only a walk
    proves it; Items' branch walks one.
  - #253 (`when-touched`): the review workflow is not changed.
  - #226 (`when-touched`): it needs a rule for the plan check; the lock
    wraps the timed runs and changes no plan.
  - #292 (`when-touched`): its two parts left each wait for their own
    batch, as its comment says.
  - #516 and #284: CI's burn-in and browsers are unchanged, and the lock
    is off in CI.
  - #446: the runner's lock file is one more that Dependabot reads; the
    step that writes it says whether the three advisories reach it.
  - #321: the runner reads this repository's own skill, so it stays
    here, one more candidate under this ADR's Deferred.
  - #142, #197, #263, #283, #319, #320, #336 and #517: their files are
    not changed.
  - This ADR's Deferred, steps in parallel in worktrees: not fired,
    since one brief's steps still run one at a time; the lock is what
    such steps would need first.
  - The Deferred lines of the docs and ops ADRs, ADR-051's watch list
    and Open decisions hold nothing on a second folder or on the credit.
- **Found while checking:**
  - `scripts/prune-branches.sh --yes` stops at a merged branch still
    checked out in the second folder: git refuses to delete it, and the
    script exits there.
  - #519 went in as a merge commit, where the README's row for a small
    fix says squash; its one commit is the maintainer's, so nothing is
    undone, and the runner prints the command after each run.
  - The SDK's own Claude Code comes as a package per platform, about
    310 MB on a Mac and 330 MB on Linux.

### Decision — the runner in `scripts/fix-issue/`, a package of its own

- **`scripts/fix-issue/run.mjs`,** with its own `package.json` and
  lock, as `server/` and `client/` have theirs, never workspaces; `npm
  ci` in it once on each Mac. It runs from the main working folder, as
  `node scripts/fix-issue/run.mjs <N>`, with `leave <path>` after the
  number as `/fix-issue` takes it, and `--probe`, `--resume last`,
  `--spent`, `--folder`, `--model` and `--budget`.
- **Its test never loads the SDK:** the parts it checks (the arguments,
  the guards, the report after a run, the cost list) are a module of
  their own, and the SDK is imported only when a run starts. The scripts'
  tests and CI install nothing new.
- **The SDK pinned exactly.** Dependabot keeps it current, monthly with
  its 7-day wait, since the SDK publishes every one to four days; a
  branch's dependency step stays with `server/` and `client/`, since
  nothing the app ships depends on it. After a raise, `--probe` proves it.
- **Its guards, kept:** it stops before any work unless the session is
  paid by `ANTHROPIC_API_KEY` and `/fix-issue` is found; it cannot merge
  or force-push; it stops at US$15 a fix; it runs headless, with no
  background tasks, commands up to 90 minutes in the foreground, and the
  push and pull request before its last message; after each run it
  prints the folder's branch, last commit, uncommitted files and pull
  request, `UNFINISHED` when one is missing, and the merge command,
  `gh pr merge <PR> --squash --delete-branch`.
- **Its guards, added:** it refuses to start from a second folder, and
  refuses the main working folder as the folder to fix in, where a build
  runs; a new fix, not a resume, refuses a folder with uncommitted
  changes, naming them. The folder is `../waf-fix` beside the main one
  unless `--folder` names another; when it is missing, the runner prints
  the commands that make it.

### Decision — one lock for the runs both folders share

- **What takes it:** the server's end-to-end suite; the client's browser
  suite, `npm run test:e2e:ui` and the screenshots; the Linux browsers in
  the full verify; and the timed runs, `npm run perf`. Each takes it for
  its own run, so another folder's format, lint, build and unit tests go
  on meanwhile.
- **The lock is Postgres's,** a session-level advisory lock held on a
  connection of its own by `scripts/one-at-a-time.mjs`, which runs the
  command under it, as the server's suite already holds one (issue #1).
  A run that ends or dies frees it, so nothing stale is left, where a
  file left behind would block the next run.
- **A second run waits,** printing each minute which folder holds it,
  for what and since when, read from the holder's connection name; after
  60 minutes it stops, naming the holder. A command run under the lock
  that calls another passes straight through.
- **A browser run reuses only its own folder's servers:** one already on
  3100 or 5273 from the other folder stops the run, naming it.
- **Off in CI,** where each job runs alone. The server's own refusal
  stays, behind it, for a run started without it.

### Decision — Opus for every fix

The runner's model is Opus, `--model` kept for an exception the
maintainer names. A fix comes with the test that fails before it, which
engineering.md's table puts on Opus; #514 cost about US$1.70 on it.

### Decision — every run's cost in a list, and the month against the credit

- **`tmp/fix-runs/runs.tsv`,** in the main working folder, which git
  ignores: one line per run, with its Vancouver time, the issue, the
  model, minutes, turns, the cost the SDK reports, and the pull request
  or `UNFINISHED`. The logs go beside it.
- **`--spent`** prints the credit month's runs and their total against
  US$100, from the day the credit renews; the amount and the day are
  constants at the runner's top.
- **A warning before a run** once the month is past US$80, 80 % of it,
  the point budget alerts commonly use. The SDK's figure is an estimate;
  the Console's balance is the real one.
- The chat's time and cost for a fix rest on this list.

### Decision — the picks offered as the runner's lines

- **The planning skill's section 8** offers `node
  scripts/fix-issue/run.mjs <N>` while the month's credit has room, with
  each pick's time and cost on the credit, and `/fix-issue <N>` for a
  cloud session or Claude Code on the plan.
- **The exports in `scripts/cloud-picks.sh`** (#467's 12): without
  numbers it writes `tmp/cloud-picks.json`; with them, the shortlist,
  `tmp/cloud-picks-shortlist.json`. Section 8 names the script.
- **A runner's pull request is squashed,** as a cloud session's: one fix,
  one commit on `main`.

### Decision — the prune keeps a branch another folder has checked out

`scripts/prune-branches.sh` keeps a branch checked out in another
working folder, naming the folder, as it keeps the current branch.

### Considered and not done

- **The SDK in `server/`'s devDependencies:** about 330 MB of its Claude
  Code in every `npm ci` of the server, CI's included.
- **A top folder of its own, `tools/`:** `scripts/verify.sh` and the
  docs check would each need lines for it, which `scripts/` has.
- **Each folder on its own ports, databases and container,** both
  running at once: Playwright's ports read from `.env`, two more
  databases made and migrated in each folder, and the container named
  per folder. The volume databases show how a database beside the usual
  ones is forgotten (7 November), and two browser suites at once on one
  Mac make the timing tests flaky (5631d0d8).
- **A lock file in the folder git shares:** a run killed leaves it.
- **The lock over the whole full verify:** format, lint, build and unit
  tests share nothing.
- **Sonnet first, then Opus after a failure,** as the loop does: a fix
  is small, and a failed first attempt costs more than it saves.
- **Claude Code itself on the key:** the credit does not pay for it.

### Deferred — each with what brings it in

- **Each folder on its own ports and databases,** so both run at once.
  Trigger: a wait on the lock past 30 minutes, twice in one week.
- **Several picks run one after another** from one command. Trigger:
  three picks waiting at once, twice in a month.

### Consequences

- `scripts/fix-issue/`, a package with its runner, module and test;
  `scripts/one-at-a-time.mjs` and its test, around the end-to-end,
  screenshot and timed runs in both packages' scripts and the Linux
  browsers in `scripts/verify.sh`; `scripts/prune-branches.sh` with a
  test; `scripts/cloud-picks.sh` with a test; `.prettierignore`, for the
  runner's lock; and `.github/dependabot.yml`.
- engineering.md's "How code is delivered" and "Server" and the
  README's "Which tool, when" say how a fix runs on the credit and that
  a second run waits.
- The planning skill's section 8, `reference/delivery.md` and
  `evals.md`'s prompt 6. It is uploaded again after the merge (ADR-088's
  amendment).
- After the merge, `tmp/sdk-fix/` goes: its logs into `tmp/fix-runs/`,
  by hand.
- No API change, no migration and nothing a person sees in the app.
- Built on `fix-runner`, in this order: this amendment; dependencies;
  the runner; the lock; the prune; the picks' script; the working
  agreements; the planning skill; the runner's probe and the lock across
  both folders, by hand; dependencies again; the reviews; the as-built.

### As built

Built on 8 November 2026 on `fix-runner`, 29 commits with this
as-built, pull request #523.

- **Measured against the brief's guesses,** minutes and the tokens the
  Agent tool counted:

  | Step | Model | Minutes (guess) | Tokens |
  | --- | --- | --- | --- |
  | 2 | sonnet | 1 (8), no commit | 49,002 |
  | 3 | opus | 19 and 7 (20) | 172,715 and 87,296 |
  | 4 | opus | 20 (25) | 169,501 |
  | 5 | sonnet | 1 (8) | 52,886 |
  | 6 | sonnet | 1 (6) | 52,638 |
  | 7 | sonnet | 1 (6) | 53,870 |
  | 8 | sonnet | 1 (5) | 44,273 |
  | 10 | sonnet | 1 (6), no commit | 40,549 |
  | 11, findings | opus | 11 (30) | not shown |
  | 11, fixes | opus | 58 and 60 (50) | not shown |

  Sonnet's script and docs steps took about a minute each. The fixes
  took twice their guess: they carried the dependencies under the
  maintainer's exception, the fix for `@nestjs/config` 12.1, and two
  rounds of the full verify.
- **The runner, `scripts/fix-issue/`:**
  - the SDK pinned at 0.3.316, 9 days old, under the maintainer's
    exception to the 14-day rule for a new package, since it had already
    run #514 and the probe (ded94579); its lock built with `npm install
    --min-release-age=7`, all 109 versions at least 7 days old, with no
    minimatch or glob (#446);
  - after a fix with a pull request, `git -C <folder> switch --detach`,
    then `gh pr merge <PR> --squash --delete-branch` (007dbc81); the
    detach let `gh` delete #520's local branch too;
  - `--resume last` refuses a fix whose pull request is open (da4916a5),
    resumes in the folder the fix ran in (6f3ac658), and accepts
    `UNKNOWN`, written when GitHub could not be asked (f242baa5);
  - a PreToolUse hook checks each whole Bash command for a merge or a
    force-push, in place of rules that matched a command's start
    (ed237fc8); its tests refuse merges in 6 spellings and force-pushes
    in 10, and the next paid fix proves its wiring, since a probe uses
    no tools;
  - the key's value is removed from the logs and the printed lines
    (d6ebd794); Dependabot offers the SDK's patches only, a 0.x minor
    taken by hand with `--probe` (0d4b15a9).
- **Its probe from the new path:** paid by `ANTHROPIC_API_KEY`,
  `/fix-issue` among the session's 58 slash commands, about US$0.11, its
  line in `tmp/fix-runs/runs.tsv`, and `--spent` counting it. The model's
  own reply says `/fix-issue` is not available to it, as expected: only a
  person starts that skill.
- **The lock, `scripts/one-at-a-time.mjs`:**
  - key 4802089 on the test database; the holder named `<label> in
    <folder> since <HH:MM>`; the labels `server-e2e`, `perf`,
    `browser-suite`, `browser-ui`, `screenshots`, `linux-browsers` and
    `flake-hunt`;
  - the flake hunt one hold for its whole loop, and the full verify's
    Linux browsers one hold, through an internal `--linux-browsers` mode
    that refuses to run outside the lock (8a6a61d6);
  - each `test:e2e` takes the lock before its migrate and seed, as the
    maintainer chose over the step's advice (2b84103d); the client's
    `pretest:e2e` is now `e2e:prepare`;
  - the screenshots check their own ports, 3200 and 5373; the browser
    commands run by hand in conventions.md go through the lock
    (53158951);
  - proved twice: a second run in the same folder waited 40 seconds;
    across the folders, `waf-fix` waited for `proof in
    web-app-foundation, since 21:30` and ran when it was freed;
  - it needs both folders' `.env` to name the same test database, which
    they do, and the screenshots and the timed runs now need that
    database up, which Docker gives every step.
- **The prune** keeps a branch another folder has checked out
  (c41ea77e). **The picks' exports,** `scripts/cloud-picks.sh`
  (f8d6941e): `gh issue list --search` returned the same 127 issues as
  the `jq` filter, which stays, since only it can be tested without
  standing in for GitHub's search.
- **Dependencies:** steps 2 and 10 took nothing, since the run began on
  8 November, before anything in range was 7 days old. The maintainer
  then waived the 7-day rule once, for every update in range, each
  publisher checked and `npm audit signatures` passing in both folders:
  - the Sentry packages at 11.11.0 first, as a security fix (5b988d0c),
    then the rest (40691cde); rimraf 6.1.4 removed the last glob 13.0.6,
    which closes alert 9 in `server/`;
  - `@nestjs/config` 12.1 writes `.env` into `process.env` only after
    the `validate` function has run, so `main.ts` checked the settings
    before they were there, and `start:dev` failed. `main.ts` and both
    seeds now await `ConfigModule.envVariablesLoaded` (7821b34e). The
    server's own tests never start `main.ts`; only the browser suite's
    server does, so `--quick` cannot catch this, and the full verify can.
    The range stays `^12.0.1`: on 12.0.1 the await has nothing to wait
    for;
  - pdfmake 0.3.14 renamed `virtualfs` to `sharedVirtualfs`, its CVE
    fix, and the PDF renderer writes the new name (40691cde);
  - Playwright 1.65.0's Firefox 159 crashed on 7 accessibility pages in
    its Linux image, twice, while Mozilla's own Firefox 159.0.1, already
    stable, ran a newcomer's Home 6 times of 6 without a crash. So
    `@playwright/test` is back at 1.64.1, pinned exactly, under the
    maintainer's exception to never moving a locked version back, safe
    since 1.65.0 was never pushed, and Dependabot skips 1.65.0
    (f68ea60b); #521 holds the next raise, every browser run by hand
    before its merge;
  - `raw-body` 4.0.0, a major: ESM only and Node 22 or later;
    `report-body.ts` unchanged, its tests passing three times
    (cc2b0bfb). It is now published from GitHub Actions with provenance;
  - `jsdom` 31.0.0 failed the same 17 of 1103 client unit tests in all 5
    runs, since its new CSS engine resolves the theme's `var()` colours;
    it stays pinned at 30.1.3, with #522;
  - TypeScript 7 (#336) still waits on typescript-eslint, the Nest CLI
    and `@hey-api/openapi-ts`.
- **The reviews:** 18 findings. Fixed: 1 to 11, 13, 14 and 17, with 4
  as b. Left: 12, the screenshots and timed runs needing the test
  database; 15, CI auditing only `server/` and `client/`, while
  Dependabot reads the runner's lock; 16, sound; and 18, since
  `brief-step` keeps its 10 to 15 lines, as the router's review 31
  decided.
- **The first fixes on the credit:** #514 (#519), about US$1.70, and
  #483 (#520), 23 minutes and US$1.23, during this branch's reviews, on
  `main`'s scripts. Both went in as merge commits, before the runner
  printed its squash line.
- **Riders:** #467's 12.
- **Still open:** whether a resumed run's cost repeats the run before it,
  checked against the Console at the first resume; and the `jsdom` 30.1.0
  entry in Dependabot's `/server` block, which never applied, since
  `jsdom` is the client's; the exact pin covers it.

## Amendment (November 2026) — each working folder's own databases (#529)

On 9 November 2026 the runner fixed #502 in `../waf-fix`, on `main`,
while Items' branch (ADR-092) was built in the main folder. Both
folders' `.env` named the same dev, test and e2e databases. Items' branch
had applied its migration 0080 to them, so `waf-fix`'s `migrate:test`
applied nothing, and `main`'s server tests ran on Items' tables: two
failed, where CI, on a fresh database, passed the same commit (#528).
The lock above keeps two runs apart in time; it does not keep two
folders' schemas apart. Until this is built, a pick's local server
failures that CI passes are noted in its pull request, not blockers.

The same happens in one folder: back on `main` before a branch with a
migration merges, `main`'s tests run on the branch's tables. And Drizzle
applies a migration only when its time is later than the last one
applied, so a migration whose file changed after it ran is never applied
again, and the run still reports success.

The maintainer chose each decision below on 10 November 2026, asking
for the practice production teams use, and for the better version of
each where one exists.

Checked before drafting, for the areas database and ops
(`scripts/adr-check.mjs`, 10 November 2026):

- **Fired, and taken here:**
  - #529 (`fix-now`), with its comment of 9 November: the runner says
    `UNFINISHED` after a stop that found the issue already fixed, and
    exits 1, so `--resume last` would pay to finish nothing.
  - The runner's Deferred "each folder on its own ports and databases":
    its databases half, fired by wrong results rather than by a wait.
  - `.env.example` gives `DATABASE_URL_E2E` the password `password`,
    where the others give `change_me_locally`, so a fresh copy cannot
    reach the e2e database.
- **Not fired, and left:**
  - The same Deferred item's ports half: no wait on the lock past 30
    minutes.
  - #226 and #314 (`when-touched`): a rule for the plan check, and a
    test of the writes that take an id from their body; this changes no
    query and no write.
  - #253 (`when-touched`): the review workflow is not changed.
  - #551 (`when-touched`): its items are in Items' files.
  - #547: the list search's plans, its own pull request next.
  - #142, #197, #233, #263, #277, #284, #320, #336, #446, #516, #521 and
    #530: their files are not changed.
  - The Deferred lines of the database and ops ADRs, ADR-051's watch
    list and Open decisions hold nothing else on a second folder.
- **Found while checking:**
  - The runner's amendment left each folder's databases out because a
    database beside the usual ones is forgotten, as the volume databases
    were on 7 November. Here one command makes them and drops them, and
    a run refuses a folder that shares them.
  - #532 went in squashed, as one commit, where a feature branch keeps a
    merge commit. No document cites one of its commits, and its message
    keeps each commit's, so nothing is undone.

### Decision — each working folder's own databases

- **`node scripts/folder-databases.mjs <folder>`,** run from the main
  working folder, gives a second one its own dev, test and e2e
  databases, named from the main folder's with the folder's name:
  `foundation_waf_fix`, `foundation_waf_fix_test` and
  `foundation_waf_fix_e2e` for `../waf-fix`.
- It writes the three addresses into that folder's `.env`, copied from
  the main folder's when it has none, and changes no other line; makes
  each database that is missing; migrates them with that folder's own
  code; and seeds a new dev database as `npm run seed` does. Run again,
  it changes nothing that is already right.
- **`--drop <folder>`** removes them, before `git worktree remove`, so
  none is left behind.
- It refuses the main folder, whose databases keep their names, and a
  folder that is not a working folder of this repository.
- One Postgres, Docker's, still holds them all, and Docker Compose stays
  the main folder's.

### Decision — the lock in Postgres's own database

- `scripts/one-at-a-time.mjs` takes its advisory lock in the `postgres`
  database, on the server `DATABASE_URL_TEST` names, which every
  Postgres has. Advisory locks meet only inside one database, so every
  folder's runs still wait for each other, whatever their test databases
  are called, with no new setting.
- The browser suite's servers on 3100 and 5273, the Linux browsers'
  container and the timed runs stay shared and under it. The server
  suite's own lock (issue #1) stays on each test database, behind it.

### Decision — a test database ahead of its folder is made again

- Before `migrate:test` and `migrate:e2e` apply anything, a check
  compares the migrations the database records with the folder's own,
  by the hash Drizzle records for each. When the database holds one the
  folder does not have, or one whose file has changed since, it is
  dropped, made again and migrated from the start, and the run says so.
  Every run empties both anyway, and Rails and Django make their test
  databases again the same way.
- It runs under the lock, so no run is using the database meanwhile;
  inside `test:e2e` and the browser suite's `e2e:prepare` the lock is
  already held.
- The dev database holds the person's own rows, so it is never made
  again: `npm run migrate` prints a line saying it is ahead, and goes
  on.

### Decision — a folder that shares another's databases is refused

- **At the lock, the door every test run passes:** before taking it, a
  run reads the other working folders' `.env` (`git worktree list`) and
  refuses when one names the same test or e2e database as this folder,
  naming that folder and the command that gives it its own. A branch
  built by hand in a second folder is covered, not only the runner.
- **The runner calls the same check before a fix starts,** so a folder
  that shares costs no credit, and its message for a missing folder
  adds the command after `npm ci`.

### Decision — a stop that finds the issue already fixed is finished

When `/fix-issue` ends `DONE: already fixed by <commit> in #<PR>` and
the folder is detached with a clean tree, the runner prints the skill's
`gh issue close` line, records the run as already fixed, and exits 0;
`--resume last` refuses it, as it refuses a fix with a pull request.

### Considered and not done

- **The databases made by hand,** three `createdb` and three lines of
  `.env`: what is made by hand is forgotten.
- **A second file beside `.env` for each folder:** Docker Compose, the
  server, Drizzle's config and Playwright, through dotenv-cli, each read
  the one `.env`, and each would need the second.
- **A setting for the lock's database,** or the main folder's test
  database named in every other folder: one more line each `.env` could
  get wrong.
- **A database ahead refused, rather than made again:** a person would
  then make again by hand a database every run empties.
- **Drizzle's own rule, the newest time alone:** it misses a migration
  whose file changed after it ran.
- **The check in the runner alone:** a second folder used by hand would
  not have it.

### Deferred — each with what brings it in

- **Each folder on its own ports and Linux browsers' container,** so
  two browser runs go at once. Trigger: a wait on the lock past 30
  minutes, twice in one week, as before.
- **`scripts/clean-local.sh` listing databases whose folder is gone.**
  Trigger: one found left behind.

### Consequences

- `scripts/folder-databases.mjs`, the check before the migrations and
  `scripts/one-at-a-time.mjs`, each with its test; the server's
  `migrate`, `migrate:test` and `migrate:e2e`; the runner's check before
  a fix, its message for a missing folder and its already-fixed stop,
  with its test.
- engineering.md's "A second working folder", "Small fixes on the API
  credit" and "Adding a migration", the README's "Which tool, when" and
  "Repository layout", and `.env.example`, its e2e address corrected.
- While this is built in the main folder, nothing in `../waf-fix` runs
  tests but the proof by hand: from the lock's step until the merge, the
  two folders' locks are in different databases.
- After the merge, `../waf-fix` goes back to `main`, with `npm ci` in its
  `server/` and `client/`, and the runner's next pick proves it.
- No API change, no migration and nothing a person sees in the app.
- Built on `fix-529-folder-databases`, in this order: this amendment;
  dependencies; the lock in Postgres's own database; each folder's
  databases; `../waf-fix` given its own, by hand; the refusal and the
  runner's two changes; a database ahead made again; the working
  agreements; the proof across both folders, by hand; dependencies
  again; the reviews; the as-built.

### As built

Built on 10 November 2026 on `fix-529-folder-databases`, 14 commits with
this as-built, pull request #554.

- **Measured against the brief's guesses,** minutes and the tokens the
  Agent tool counted:

  | Step | Model | Minutes (guess) | Tokens |
  | --- | --- | --- | --- |
  | 2 | sonnet | 1 (2), no commit | 48,876 |
  | 3 | opus | 5 (20) | 81,975 |
  | 4 | opus | 10 (30) | 158,911 |
  | 6 | opus | 9 (30) | 166,848 |
  | 7 | opus | 12 and 5 (30) | 139,301 and 79,715 |
  | 8 | sonnet | 4 (3) | 87,211 |
  | 10 | sonnet | 3 (2), no commit | 77,579 |
  | 11, findings | opus | 7 (15) | not shown |
  | 11, fixes | opus | 25 (45) | not shown |

  Opus's script steps took about a third of their guess, and the whole
  run about an hour and a half of Claude Code against three hours.
- **The dev check is in `migrate:all`, not `migrate`,** the maintainer's
  choice in step 7, where the decision above says `npm run migrate`
  prints the line. Render builds the API from `server/`, and files
  outside a service's root directory are not there at build time, so a
  check in `../scripts/` would have failed every deploy. `migrate` stays
  `drizzle-kit migrate` (4f3ebed7), and a test holds the four scripts as
  they are. CI runs the three migrations one by one, so it never runs the
  dev check; `folder-databases.mjs` does, through `migrate:all`.
- **The lock** (0baa670d, ea985cdf):
  - `postgresAddress(url)` keeps the user, password, host, port and
    query, and names the `postgres` database; an address that is not
    `postgresql://` is refused in one line, the empty-host socket form
    `postgresql://u:p@/db?host=/tmp` among them;
  - the refusal of a folder that shares compares host and port, reads
    this folder's address from the environment first, then its `.env`,
    skips a folder with no `.env`, Claude Code's own worktrees among
    them, and reads `localhost` and `127.0.0.1` as two servers;
  - from step 3 to the merge, the two folders' locks were in different
    databases; nothing ran in `../waf-fix` but the proof.
- **`folder-databases.mjs`** (c5b9c782), beyond the brief: it refuses a
  `.env` that is a link to the main one's, and main test or e2e names
  that do not start with the dev name; it runs npm without the shell's
  `DATABASE_URL*` and `MIGRATE_TARGET`, since dotenv never overrides a
  variable already set; it counts the migrations each database gained;
  `--drop` refuses each name that is the main folder's, drops the
  others and exits 1; a failed `migrate:all` after a new dev database
  prints `npm run migrate:all && npm run seed`. Folders named `waf-fix`
  and `waf_fix` would get the same names, which the refusal of a folder
  that shares catches.
- **`database-ahead.mjs`** (0bffb7b3): besides a migration the folder
  lacks and a file changed since it ran, a migration that ran without an
  earlier one, and one that ran twice, each get their line. The line
  goes to stderr, so `scripts/e2e-flake-hunt.sh`, which hides the
  migration's output, still shows it.
- **The runner** (dbbbb92f): the check runs before a fix or a resume,
  not a probe; an already-fixed stop's `gh issue close` line takes its
  comment from the commit's subject, quoted for the shell (single quotes
  for the 17 of `main`'s 2,413 subjects holding a quote, `$`, a
  backtick, `\` or `!`); a result that says already fixed in a folder
  with changes or a branch says why it is still `UNFINISHED`. #492's real
  result, replayed, ends `already fixed`.
- **The main folder's 0068:** its three databases had run an unsaved
  draft of `0068_invitations.sql`, the only one committed being
  097a1c54. `pg_dump --schema-only` of the dev database and of
  `../waf-fix`'s, made from the final file, differed only in the dump's
  random `\restrict` keys, so the dev row's hash was put right by hand;
  the test and e2e databases were made again by their first run.
- **The proof across both folders,** by hand on the Mac:
  - both server suites at once: `../waf-fix`'s waited for `server-e2e in
    web-app-foundation, since 14:52`, ran at 14:57:25, a second after
    the first ended, and both passed 1,303 tests;
  - a made-up migration of the year 2286 in `foundation_waf_fix_test`:
    made again, and the suite passed;
  - `../waf-fix`'s `.env` naming `foundation_test`: refused with the
    command, which then set that one line back, its `migrate:test`
    waiting for the run above to free the lock.
- **Dependencies:** steps 2 and 10 took nothing. Twenty updates in range
  come of age on 16 and 17 November: the Nest packages, vite and its
  React plugin, `typescript-eslint`, the AWS SDK, Sentry, nodemailer and
  `user-event`.
- **The reviews:** 14 findings, with `/doctor prompt-audit` typed by the
  maintainer. Fixed:
  - 11, CI's browser job, which gives its three databases the one name
    `foundation_e2e` on purpose: a test or e2e name that is the dev one
    is refused only when the database is ahead and about to be dropped
    (73dc3317). Nothing local could catch it, since every `.env` here
    names three databases; a change to a script CI runs is read against
    `ci.yml`'s own settings before the push;
  - 3, each migration's time and hash from Drizzle's own
    `readMigrationFiles` (0253d70a); 6, `compare` returns why, or `null`
    (8c6c2988);
  - 1, 2 and 8, one `scripts/databases.mjs` for what the four scripts
    shared: one `Stop`, the addresses, `.env` reading, the connection,
    the migrations' record and one working-folder check (3ff4b4c2);
  - 13, the review step gives `/simplify` "report only, change nothing",
    since its own instructions apply what it finds (3e2c0473).

  Left: 4, the dev check inside `migrate`, which reverses step 7's
  choice; 5, about 110 ms a run; 7 and 9, code that runs once; 10, the
  three tests' own worktree setups, which read better whole; 14, two
  code-rules files repeating `CLAUDE.md`, until `/rules-file` rewrites
  them. 12 is the line above on `migrate:all`.
- **Linux WebKit:** the full verify's accessibility spec failed 1 of 116
  in both of the branch's runs, each time a different screen not
  visible within 5 seconds (an order with a voided shipment, dark;
  Movements, light), and passed 116 of 116 in one run on `main`. The
  branch changes no file in `client/`. Followed with Firefox's crash in
  #521, the container's memory measured first.
- **CI on #554:** the three Playwright shards passed, the path finding 11
  repaired. Claude Code Review found no issues in a run of 40 seconds,
  #253's pattern.
