---
name: review-step
description: Run a build brief's review step, the one whose Who is "Claude Code, main session", in this session on Opus by brief-step's rules, in its two prompts, the findings and then the fixes, and end with its summary. Runs only when a prompt names it, as /review-step <brief> <N> for the findings, or /review-step <brief> <N> <choices> for the fixes.
argument-hint: <brief> <N> [choices]
disable-model-invocation: true
model: opus
effort: high
---

# A brief's review step

This skill runs a brief's review step, the row whose Who is `Claude
Code, main session`, in this session, on Opus at high effort for the
turn that runs it ([the amendment][models]). Which reviews, in what
order, why they stay in the main session, and the step's two prompts
are [engineering.md, "The review step"][review-step], read first.

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
kept for its summary. Then the prompt the arguments name, in this
session, as engineering.md's "The review step" says, by the rules in
[`.claude/agents/brief-step.md`][step], read from the file: its sections
1 and 2 throughout. `/simplify` is given `report only, change nothing`
as its argument, since its own instructions apply what it finds. The
findings stop there, for Bob's choices in the chat.

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

[review-step]: ../../../docs/engineering.md#the-review-step
[models]: ../../../docs/adr/0089-a-briefs-steps-in-a-row.md#decision--the-loop-on-sonnet-the-reviews-on-opus
[step]: ../../agents/brief-step.md
