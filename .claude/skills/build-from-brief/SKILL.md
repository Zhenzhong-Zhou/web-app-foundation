---
name: build-from-brief
description: Run a build brief kept in tmp/ (tmp/adr-NNN/brief.md), one step or from step N in a row, each Claude Code step in a new brief-step subagent, stopping where a person is needed, and end with the summary Bob pastes into the chat. Runs only when a prompt names it, as /build-from-brief <brief> <N> or /build-from-brief <brief> from <N>.
argument-hint: <brief> <N> | <brief> from <N>
disable-model-invocation: true
---

# Build from a brief

A feature is planned in the claude.ai chat and built here from its brief
([engineering.md, "How code is delivered"][delivered]). This skill is the
loop ([ADR-089][adr-089]): it reads the brief's steps, runs each of
Claude Code's in a new `brief-step` subagent, and stops where a person
is needed. A step's rules are in [`.claude/agents/brief-step.md`][step],
not here; the loop does no step's work itself.

## 1. The arguments

`$ARGUMENTS`, one of:

- **`<brief> <N>`:** step N alone.
- **`<brief> from <N>`:** step N, then each step after it in the brief's
  order, until a stop below.

Anything else, a brief not there, or no step N in its steps table: stop,
saying so, and run nothing.

## 2. The steps table

The brief's table of steps, its columns `#`, `Who` and `What`: each
step's number, who runs it, and what it is. A brief without one: stop,
saying so.

## 3. Before each step, in this order

1. **A `STOP` file beside the brief,** from the run's second step on,
   stops the run: remove it as it stops, and say so.
2. **A step whose Who is neither `Claude Code` nor `Claude Code, main
   session`** stops the run, naming who: the chat, or Bob.
3. **In a row, a step that would push, open a pull request, merge or
   change `main`,** as its text in the brief says, stops the run, naming
   which.

## 4. Running a step

- **`Claude Code, main session`:** named alone, as `<brief> <N>`, it runs
  in this session, by the rules in `.claude/agents/brief-step.md`, read
  from the file. In a row, the run stops before it, naming it.
- **`Claude Code`:** a new `brief-step` subagent, given the brief's path
  and the step's number and nothing else. Wait for its last message, its
  summary, doing nothing meanwhile. **One step at a time:** a subagent
  starts in the background here, so the next step is read only once
  this one's result has come back, and two never run at once. No
  `brief-step` to start: stop,
  saying Claude Code needs a restart to find `.claude/agents/`.

## 5. After each step

- **Its summary appended to `summaries.md` beside the brief,** made if
  missing, under `## Step N — <its What> (<YYYY-MM-DD HH:MM>, Vancouver)`,
  the time from `TZ=America/Vancouver date '+%Y-%m-%d %H:%M'`.
- **Its last line:** `BLOCKED` stops the run; `DONE` goes on to the next
  step, in a row; anything else stops it, as BLOCKED does.

## 6. At a stop, or the brief's end

1. One line saying why the run stopped, or that the brief has ended.
2. The last step's summary, for the chat, as appended; or that no step
   ran.
3. `/clear`: safe once that summary is pasted into the chat.
4. The last line, as every report's ([CLAUDE.md, "How to
   work"][how-to-work]): `BLOCKED: <what is needed>` when a step was
   BLOCKED or could not start, otherwise `DONE: <why the run stopped>`.

[how-to-work]: ../../../CLAUDE.md#how-to-work
[delivered]: ../../../docs/engineering.md#how-code-is-delivered
[adr-089]: ../../../docs/adr/0089-a-briefs-steps-in-a-row.md
[step]: ../../agents/brief-step.md
