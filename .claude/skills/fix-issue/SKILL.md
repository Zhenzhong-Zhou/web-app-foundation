---
name: fix-issue
description: Fix one small issue end to end, in a cloud session or on the Mac, as engineering.md's "Cloud sessions" says. Checks main first for a commit that already fixes it, reads it whole, stops when it needs a decision or more than a small fix, works out the files open branches change, then fixes it with a test that fails before, verifies, pushes and opens a pull request that closes it. Runs only when a prompt names it, as /fix-issue <N>.
argument-hint: <N> [leave <path> ...]
disable-model-invocation: true
---

# Fix an issue

The chat picks a small issue and the prompt is one line, `/fix-issue
<N>`; this skill holds what the session then does ([ADR-089's
amendment][adr-089]). Its home is [engineering.md, "Cloud
sessions"][delivered]: where the two differ, the home holds. It runs the
same in a cloud session and in Claude Code on the Mac.

## Rules

- **Nothing changed on GitHub but the branch and its pull request.** No
  merge, label, close or comment: those are the maintainer's, each given
  to him as a command in the report.
- **One issue, the smallest change that fixes it.** Past about 20
  minutes, or more files than the issue names with their tests and
  `docs/manual-checks.md`, stop and report what is left.
- **Each stop below ends the run with nothing committed,** its reason in
  the last line.

## 1. The arguments

`$ARGUMENTS`: the issue's number, then, if given, `leave` and the paths
to leave alone besides those worked out in step 5. Anything else: stop,
saying so.

## 2. The Node

The Node in `server/.node-version`, installed and used first: a
container may start on an older one (one had 22, where twenty client
tests fail for reasons of their own). Then `npm ci` in `server/` and
`client/`.

## 3. Already fixed?

1. All of `main`'s history: `git fetch origin main`, with
   `--unshallow` when `git rev-parse --is-shallow-repository` says
   `true`.
2. `git log --oneline -E --grep '#<N>([^0-9]|$)' origin/main`.
3. A commit there that fixes what the issue expects, read against the
   issue and `main`'s code, not one that only names it (a docs commit, a
   handoff): **stop,** `DONE: already fixed by <commit> in #<PR>`, the
   pull request from `gh pr list --state merged --search <commit>`, with
   the command that closes it, for the maintainer:

   ```bash
   gh issue close <N> --reason completed --comment "Fixed in #<PR>: <commit> <what it did>."
   ```

4. Fixed in part: go on with the rest alone, and say which part is done.

## 4. The issue, whole

`gh issue view <N> --comments`, its text and every comment. **Stop** when
it:

- is closed;
- is labelled `later` or `decision`, or its text or a comment leaves a
  choice open (two fixes offered, "decide", "Needs:" a design or an
  ADR): `BLOCKED`, the choice with the options as the issue gives them;
- needs a sweep, a load proof, the large seed or Docker, which stay on
  the Mac's own runs (in a cloud session);
- needs more than a small fix: `BLOCKED`, saying what it would take.

## 5. The files to leave alone

Worked out, never guessed:

- **Every open pull request's files:** `gh pr list --state open --limit
  100 --json number,headRefName,files`.
- **Every pushed branch still in work:** `git fetch --prune origin
  '+refs/heads/*:refs/remotes/origin/*'`, so a branch deleted on GitHub
  is gone here too. For each branch but `main`, skipped when `gh pr list
  --state all --head <branch> --json state` shows its pull request
  merged or closed (a branch squashed into `main` is never its
  ancestor), or `git merge-base --is-ancestor origin/<branch>
  origin/main` says `main` holds it; otherwise `git diff --name-only
  origin/main...origin/<branch>`. A branch built on the Mac is pushed at
  each stop of its run, so it shows here.
- **The paths after `leave`** in the arguments.

`docs/manual-checks.md` is not on the list: entries in it are settled as
the home says when a conflict comes. When the fix needs any other file
on the list, **stop:** `BLOCKED`, naming the file and the branch or pull
request that changes it.

## 6. The fix

- **A branch from `origin/main`:** `fix-<N>-<a few words>`, or
  `test-<N>-<a few words>` when the issue asks for tests alone.
- **The change the issue expects,** by `CLAUDE.md` and the rules files
  that load with what it touches. New words in `en`, `fr-CA` and
  `zh-Hans`, by `docs/glossary.md`.
- **A test that fails before:** the fix's own files set aside, never
  its tests: `git diff -- <fix files> > "${TMPDIR:-/tmp}/fix.patch" &&
  git restore -- <fix files>`; the test run, failing; then `git apply
  "${TMPDIR:-/tmp}/fix.patch"` and the test run again, passing. Never
  `git stash`, which would set the new test aside too, so the run before
  proves nothing, and which every working folder of the repository
  shares. For an issue that asks only for tests, the code each test
  covers set aside the same way for one run. The summary says each run
  and its result.
- **A change a person sees:** in `docs/manual-checks.md`, in the same
  commit, a regression check at the top of Regressions, newest first,
  an empty line between entries, numbered one past the highest `MC-R`
  on `main` and in the files of step 5's branches; and a dated line at
  the end of "Changes to this list", the date
  `TZ=America/Vancouver date +%F`. Nothing a person sees: no check, and
  the pull request says why.
- **`scripts/verify.sh --quick`;** a proof runs only the changed tests.
  Without Docker, as in a cloud session, ShellCheck and the check against
  `main` are skipped: the report says so.

## 7. The commit, the push and the pull request

- **One commit,** authored `Zhenzhong Zhou <bob0823.zhou@gmail.com>`
  (`git commit --author=...`), the session as committer: a subject
  ending `(#<N>)`, a blank line, then why. Then
  `scripts/check-authors.sh origin/main..HEAD`.
- **The push,** then `git ls-remote origin <branch>`: the clone tracks
  only `main`, so its own "unpushed commits" warning can be false.
- **The pull request,** `gh pr create`, with no label:
  - its title, as the commit's subject;
  - its body: what changed and how it was proved, the regression check
    or why there is none, and any file it left alone;
  - `Closes #<N>`, or `Part of #<N>` when the issue keeps parts for
    later, each named.

## 8. The report

Short bullets: what changed, each proof with its command and result,
the pull request's link, and what it left alone; then, for the
maintainer, that it merges with "Squash and merge" once green. The last
line, as every report's ([CLAUDE.md, "How to work"][how-to-work]):
`DONE: <why>` or `BLOCKED: <what is needed>`.

[how-to-work]: ../../../CLAUDE.md#how-to-work
[delivered]: ../../../docs/engineering.md#how-code-is-delivered
[adr-089]: ../../../docs/adr/0089-a-briefs-steps-in-a-row.md
