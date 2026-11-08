---
name: review-step
description: Run a build brief's review step, the one whose Who is "Claude Code, main session", in this session on Opus by brief-step's rules, in its two prompts, the findings and then the fixes, and end with its summary. Runs only when a prompt names it, as /review-step <brief> <N> for the findings, or /review-step <brief> <N> <choices> for the fixes.
argument-hint: <brief> <N> [choices]
disable-model-invocation: true
model: opus
effort: high
---

# A brief's review step

The reviews of a branch run in the main session, never in a subagent:
they stop for Bob's choices, `/doctor prompt-audit` is typed in the
session, and the reviews' own skills start helpers of their own
([ADR-089][adr-089]). `/build-from-brief` runs on Sonnet and refuses
such a step; this skill runs it on Opus, at high effort, for the turn
that runs it ([the amendment][models]).

## 1. The arguments

`$ARGUMENTS`, one of:

- **`<brief> <N>`:** step N's first prompt, the findings.
- **`<brief> <N>` followed by more words:** its second prompt, the
  fixes, those words being Bob's choices, as they stand.

Anything else, a brief not there, or no step N in its steps table: stop,
saying so, and run nothing. A step whose Who is not `Claude Code, main
session` is refused, naming `/build-from-brief <brief> <N>`, which runs
it.

## 2. The step

Before it, `TZ=America/Vancouver date '+%Y-%m-%d %H:%M'` and `date +%s`,
kept for its summary. Then the step, in this session, by the rules in
[`.claude/agents/brief-step.md`][step], read from the file: its sections
1 and 2 throughout, and the reviews' two prompts as its section 3 says.

1. **The findings,** without choices: every finding numbered, to the
   file the brief names, and nothing fixed. `/doctor prompt-audit` is
   asked for and waited for, as that section says; it runs on the
   session's model, outside this skill's pin, so the ask says `/model
   opus` first when the session is on another. Stop there: Bob chooses
   in the chat.
2. **The fixes,** with Bob's choices: each its own commit, then
   `scripts/verify.sh` in full, the push and the pull request.

## 3. The summary

As `brief-step`'s section 4 says: its `Model:` line, the five parts and
`## For the chat`.

- **Appended to `summaries.md` beside the brief,** as `/build-from-brief`
  appends a step's, under `## Step N — <its What>, <the findings or the
  fixes> (<YYYY-MM-DD HH:MM>, Vancouver) · opus · <minutes> min ·
  <tokens>`: the time from before it, the minutes from then to now, and
  the tokens where Claude Code shows this session a count, otherwise
  `tokens not shown`.
- **Printed:** its `## For the chat`, for Bob to paste into the chat;
  the full summary is in `summaries.md` only. The last line is the
  summary's own.

[adr-089]: ../../../docs/adr/0089-a-briefs-steps-in-a-row.md#decision--the-reviews-stay-in-the-main-session
[models]: ../../../docs/adr/0089-a-briefs-steps-in-a-row.md#decision--the-loop-on-sonnet-the-reviews-on-opus
[step]: ../../agents/brief-step.md
