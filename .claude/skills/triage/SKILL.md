---
name: triage
description: Triage the open issues as engineering.md's "Triaging the open issues" says, in two runs. /triage exports them with their comments, checks each still holds against what it names, writes the proposal to tmp/triage.md and stops. /triage <choices>, after Bob's choices, writes tmp/triage-apply.sh, one gh command per choice, for Bob to run, then the three label checks. Labels, closes and milestones nothing itself. Runs only when typed.
argument-hint: "[choices]"
disable-model-invocation: true
---

# Triage

[engineering.md, "Triaging the open issues"][home] is this skill's home:
when to triage, and its four steps. This skill holds what a run does in
them, in two runs: the proposal, then, after Bob's choices, the commands
for him to run. Where the two differ, the home holds.

## Rules

- **Nothing changed on GitHub by the skill.** No label, close, comment,
  milestone or body: only `gh issue list`, `gh issue view`, `gh label
  list`, `gh run list`, `gh run view` and `gh run download`. Every change
  is a command in the script, which Bob runs.
- **Files in `tmp/` only,** which git ignores: no commit, and no file
  outside it changed.
- **Labels and closes as [Issues and labels][labels] gives them:** one
  group label, at least one area label, a `later` issue's `Trigger:` or
  `Needs:` line, and a close with GitHub's reason and a one-line comment.

## 1. The proposal: `/triage`

With no arguments.

1. **The export,** the home's step 1 with its command as written, into
   `tmp/issues.json`; every comment read with the body, as the home says
   why. Then the labels GitHub has, `gh label list --limit 200`, and the
   areas, from `AREAS` in `scripts/adr-index.mjs`:
   `node -e 'import("./scripts/adr-index.mjs").then((m) => console.log(m.AREAS.join(" ")))'`.
2. **Each issue checked against what it names,** after
   `git fetch origin main`, before anything is proposed:
   - **A budget or a watch:** against the last Performance run on `main`
     that timed it, scheduled or by hand, not a pull request's plan
     check: `gh run list --workflow perf.yml --branch main --limit 10
     --json databaseId,event,conclusion,createdAt,displayTitle`. Its
     report is in the artifact, `gh run download <id> --dir
     tmp/perf-<id>`, as `perf/reports/<time>-<scale>.json`, for 30 days;
     its summary in `gh run view <id> --log`.
   - **A flaky test:** against the failed runs of CI and the flake hunt
     on `main` since the issue was filed, `gh run list --workflow ci.yml
     --branch main --status failure --created ">=<date>"`, and the same
     with `flake-hunt.yml`; each run's `gh run view <id> --log-failed`
     searched for the test's name. Failed again: it holds. Not again,
     and a commit on `main` fixed it: proposed for closing, naming the
     commit. Not again, with no fix: it holds, with the date it last
     failed.
   - **A small bug,** and anything else that names code, a setting or a
     document: read on `origin/main` (`git show origin/main:<path>`),
     with `git log origin/main --oneline --grep "#<N>"` for a commit
     naming it. Fixed: proposed for closing as `completed`, naming the
     commit or pull request.
   - **A check that cannot be made,** as a run past its artifact's 30
     days or no run since, is said in its row, never guessed.
3. **The proposal, `tmp/triage.md`,** the home's step 3, built to scan as
   [CLAUDE.md's "Report for a quick read"][report] says:
   - **A table, a row per issue,** by number: its title, the group
     proposed or the close with its reason, its areas, the check made and
     what it found, and a few words why;
   - **a `later` issue's line,** `Trigger: …` or `Needs: …`, proposed
     under the table where its body has none;
   - **then** the counts by group and by area, the issues that look like
     duplicates, each with the one it duplicates, and the present labels
     that disagree with the proposal;
   - **a last line** saying how to answer: `/triage` with the choices, as
     proposed or by issue number, as `/triage as proposed, except #301
     when-touched`.
4. **Stop,** with the summary (§3). Bob chooses, in the chat or here.

## 2. The commands: `/triage <choices>`

Bob's choices are the arguments, `$ARGUMENTS`, read against
`tmp/triage.md`. No proposal there, or a choice naming an issue it does
not have: stop and say so.

1. **`tmp/triage-apply.sh`,** under `#!/usr/bin/env bash` and
   `set -euo pipefail`, one `gh` command per choice in issue order, each
   under a comment naming the issue and the choice:
   - **a group and areas:** `gh issue edit <N> --add-label
     <group>,area:<area>`, with `--remove-label` for `needs-triage` where
     the issue has it and for each label the choice replaces, and
     `--milestone "Fix-ups"` where the choice names the fix-up stage;
   - **a `later` issue's missing line:** in the same command,
     `--body-file tmp/triage-body-<N>.md`, its body as exported with the
     line added, written beside the script;
   - **a close:** the home's command as written, with its reason and its
     one-line comment.

   An area label GitHub lacks comes first, as `gh label create
   area:<area>`, as [Issues and labels][labels] says. Then `bash -n
   tmp/triage-apply.sh`.
2. **Bob runs it,** as `! bash tmp/triage-apply.sh`, so its output lands
   in the session. Wait until he has. A command that failed is said in
   the summary with its line, and never run again by the skill.
3. **The three checks,** [Issues and labels][labels]' commands as
   written, each printing nothing. Any issue one prints is named in the
   summary, with why: opened since the export, or a command that failed.
4. **The summary** (§3).

## 3. The summary

In `/build-from-brief`'s five parts ([its summary][summary]), for Bob to
paste into the chat:

1. **Done:** the first run, the counts by group and the closes proposed;
   the second, what the script changed. No commit in either.
2. **Verify:** each kind of check made and how many; any that could not
   be made, and why. The second run: what the three checks printed.
3. **Found:** what the run found beyond the proposal, such as a label
   GitHub lacks or a document out of date; or "none".
4. **Decisions for Bob:** the first run, the choices, as proposed
   recommended where it is; the second, what a failed command needs, or
   "none".
5. **Next:** the first run, the prompt for the second; the second,
   `/clear` safe.

The last line: `DONE: <why>`, or `BLOCKED: <what is needed>`.

[home]: ../../../docs/engineering.md#triaging-the-open-issues
[labels]: ../../../docs/engineering.md#issues-and-labels
[report]: ../../../CLAUDE.md#how-to-work
[summary]: ../build-from-brief/SKILL.md#4-the-summary-for-the-chat
