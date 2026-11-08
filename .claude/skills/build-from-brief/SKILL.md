---
name: build-from-brief
description: Run a build brief kept in tmp/ (tmp/adr-NNN/brief.md), one step or from step N in a row, each Claude Code step in a new brief-step subagent on the model its row names, stopping where a person is needed, and end with the short summary Bob pastes into the chat. Runs only when a prompt names it, as /build-from-brief <brief> <N>, /build-from-brief <brief> from <N> or /build-from-brief <brief> plan.
argument-hint: <brief> <N> [choices] | <brief> from <N> | <brief> plan
disable-model-invocation: true
model: sonnet
---

# Build from a brief

A feature is planned in the claude.ai chat and built here from its brief
([engineering.md, "How code is delivered"][delivered]). This skill is the
loop ([ADR-089][adr-089], and its amendment, [each step on the model its
work needs][models]): it reads the brief's steps, runs each of Claude
Code's in a new `brief-step` subagent on the model its row names, and
stops where a person is needed. A step's rules are in
[`.claude/agents/brief-step.md`][step], not here; the loop does no
step's work itself, and judges none.

## 1. The arguments

`$ARGUMENTS`, one of:

- **`<brief> <N>`:** step N alone.
- **`<brief> <N>` followed by more words:** step N alone, with Bob's
  choices: those words, handed to the step as they stand.
- **`<brief> from <N>`:** the plan (section 3), then step N and each step
  after it in the brief's order, until a stop below.
- **`<brief> plan`:** the plan of the whole brief, and nothing run.

Anything else, a brief not there, or no step N in its steps table: stop,
saying so, and run nothing.

## 2. The brief's tables

- **The steps table,** its columns `#`, `Who`, `Model` and `What`: each
  step's number, who runs it, its model, and what it is. Every step
  whose Who is `Claude Code` or `Claude Code, main session` names
  `opus`, `sonnet` or `haiku`. A brief without the table, or such a step
  with no model or another: stop before anything runs, naming the step.
- **The time-and-cost table,** where the brief has one: each step's
  minutes, its `Minutes` cell as it stands. A step with no row there has
  no minutes given.

## 3. The plan

At `from <N>`, printed first; then the run starts with no question,
since a reply would be a new turn, outside this skill's Sonnet pin:

- **Each step from N up to the next stop** that the brief shows before
  the run: its number, its Who, its model, its minutes and its What.
- **Where the run will stop, and why:** at a step that is the chat's or
  Bob's; before a main-session step, naming `/review-step <brief> <N>`;
  before a step that would push, open a pull request, merge or change
  `main`; or at the brief's end. It says too that a run stops sooner
  where a step ends BLOCKED, a `STOP` file is made, or a step passes its
  time.

At `plan`, the same for the whole brief from its first step: each run in
turn up to its stop, then nothing run.

## 4. Before the first step

When the run's first step is Claude Code's, the run is refused, naming
why and running nothing, when any of these holds:

1. **Another branch:** `git branch --show-current` is not the brief's,
   the first name in its `**Branch:**` line.
2. **A tracked file changed:** `git status --porcelain
   --untracked-files=no` prints anything; name the files.
3. **Claude Code older than 2.1.251,** which first puts the model named
   for one subagent above the one in its file: `printf '%s\n' 2.1.251
   "$(claude --version | cut -d' ' -f1)" | sort -V | head -n 1` prints
   other than `2.1.251`.
4. **A variable that can put every step on one model:** `printenv
   CLAUDE_CODE_SUBAGENT_MODEL CLAUDE_CODE_SUBAGENT_MODEL_FORCE` prints
   anything; name it.
5. **Docker not running,** `docker info` failing, when a step in the run
   (step N alone, or those in the plan) verifies with more than
   `--docs`: any step that its text and the brief's rules do not hold to
   `--docs` or to no verify.

## 5. Before each step, in this order

1. **A step whose Who is neither `Claude Code` nor `Claude Code, main
   session`** stops the run, naming who: the chat, or Bob.
2. **A step whose Who is `Claude Code, main session`** is refused, alone
   or in a row, naming the command to type: `/review-step <brief> <N>`,
   with Bob's choices after it when he gave any.
3. **In a row, a step that would push, open a pull request, merge or
   change `main`,** as its text in the brief says, stops the run, naming
   which.
4. **Where it starts:** `git rev-parse HEAD`, `TZ=America/Vancouver date
   '+%Y-%m-%d %H:%M'` and `date +%s`, kept for after it.

## 6. Running a step

A new `brief-step` subagent, its `model` set to the model its row
names, given the brief's path and the step's number, with Bob's choices
when he gave any, and nothing else but what the escalation adds
(section 8). Wait for its last message, its summary, doing nothing
meanwhile. **One step at a time:** a subagent starts in the background
here, so the next step is read only once this one's result has come
back, and two never run at once. No `brief-step` to start: stop, saying
Claude Code needs a restart to find `.claude/agents/`.

## 7. After each step

1. **Its minutes and tokens:** `date +%s` again, the difference from
   before it rounded to whole minutes; the tokens as the Agent tool's
   result counts them, otherwise `tokens not shown`.
2. **Its full summary appended to `summaries.md` beside the brief,** as
   it came back, the file made if missing, under `## Step N — <its What>
   (<YYYY-MM-DD HH:MM>, Vancouver) · <model> · <minutes> min · <tokens>`:
   the time from before it, the model it was started on, and, for a
   rerun on Opus, `· escalated from <model>` at the end.
3. **The model check:** its first line, `Model: …`, names the family of
   the model it was started on, `opus`, `sonnet` or `haiku`, in any case.
   Another family, or no such line, stops the run as BLOCKED, naming
   both.
4. **Its last line:**
   - `DONE` goes on to the next step, in a row, unless a `STOP` file is
     beside the brief, which stops it;
   - `BLOCKED` goes to the escalation (section 8) when it qualifies, and
     otherwise stops the run;
   - anything else stops it, as BLOCKED does.

## 8. The escalation, once a run

A step BLOCKED is run again on Opus when all of these hold:

- it was started on `sonnet` or `haiku`;
- its last line starts `BLOCKED: verify (code)` or `BLOCKED: model`;
- `git rev-parse HEAD` is the one before it: it committed nothing;
- no step has been escalated in this run.

Then:

1. **Its work set aside,** when `git status --porcelain` prints anything:
   `git stash push --include-untracked -m "<brief's folder> step N
   <model>"`, then `git stash show -p --include-untracked stash@{0}` into
   `step-N-<model>.diff` beside the brief. Nothing to set aside: no
   stash and no diff.
2. **The step again,** as section 5's step 4 and section 6 say, its
   `model` set to `opus`, given also the diff's path, or that nothing
   was set aside, and the first attempt's last line.
3. **Its summary** as section 7 says, both attempts' summaries in
   `summaries.md`.

Any other BLOCKED stops the run: a second escalation in one run, which
is not made; `verify (environment)`, which waits for Bob; one after a
commit, naming it; or one on Opus.

## 9. At a stop, or the brief's end

First, a `STOP` file beside the brief is removed, whatever stopped the
run, so it cannot stop the next run early. Then:

1. One line saying why the run stopped, or that the brief has ended,
   naming the `STOP` file when one was removed, and the stash when the
   escalation made one.
2. The last step's heading, as appended, and its `## For the chat`, for
   the chat; its whole summary only when it has no such section; or that
   no step ran. The full summary is in `summaries.md` only.
3. `/clear`: safe once that short summary is pasted into the chat.
4. The last line, as every report's ([CLAUDE.md, "How to
   work"][how-to-work]): `BLOCKED: <what is needed>` when a step was
   BLOCKED or could not start, otherwise `DONE: <why the run stopped>`.

[how-to-work]: ../../../CLAUDE.md#how-to-work
[delivered]: ../../../docs/engineering.md#how-code-is-delivered
[adr-089]: ../../../docs/adr/0089-a-briefs-steps-in-a-row.md
[models]: ../../../docs/adr/0089-a-briefs-steps-in-a-row.md#amendment-november-2026--each-step-on-the-model-its-work-needs
[step]: ../../agents/brief-step.md
