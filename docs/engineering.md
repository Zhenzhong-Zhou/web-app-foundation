# Engineering: the working agreements

## Pull requests

- **One PR per feature** (October 2026): its ADR, when it has a new one,
  as the first commit, then server, client and docs as commits of their own;
  fixes go on the branch until its checks pass, never in a follow-up PR.
  Small chores (a CI line, a lint rule, a docs tidy) ride along in the next
  feature PR rather than getting one of their own.
- **The reviews, before the PR is opened** (21 October 2026; from
  ADR-081 four, and from ADR-086 five): every feature branch ends with
  [the review step](#the-review-step), which says which reviews, in what
  order, and how their findings are chosen. `/usability-walkthrough` was
  missed on several recent PRs, so ADR-079's branch walked
  two journeys, to make up for ADR-077 and ADR-078.
- **Claude Code Review on Sonnet** (October 2026): the reviews in each
  brief's review step come first, before the PR is opened, and CodeQL is
  kept beside both.
- **Never "Commit suggestion" on GitHub** (October 2026): every fix goes
  through Claude Code under the repository's identity, and the local
  branch must not fall behind the PR's.
- **A security fix is pushed on its own** (27 October 2026), and its
  alert seen closed, before an as-built says "fixed": on #259, CodeQL did
  not count the first fix.

## Issues and labels

- **Every open issue has one group label,** or is closed (below):
  - `fix-now`: a bug a user hits, a data or security problem, a flaky
    test;
  - `when-touched`: polish, or a small gap in one area, ridden along by
    the next PR that touches it;
  - `later`: needs an ADR, or waits for a trigger, and says which in a
    line of its body, `Trigger: …` or `Needs: …` (an ADR, a design, a
    decision), so the next triage sees what wakes it without reading
    the whole issue (28 October 2026).
- **And at least one area label,** `area:<area>`, the area named exactly
  as in `AREAS` in `scripts/adr-index.mjs`, which reads the areas from
  the folders of `server/src/modules/`, `core/` and `shared/`. A new
  module folder needs its `area:` label on GitHub,
  `gh label create area:<name>`, until labels are kept as code.
- **A close gives GitHub's reason and a one-line comment** (28 October
  2026): `completed` when a PR or a commit fixed it, named in the
  comment; `not planned` when it is dropped or overtaken, or is a
  duplicate, whose comment `Duplicate of #N` marks it as one. The closed
  list then tells what was fixed from what was let go.

  ```bash
  gh issue close <N> --reason completed --comment "Fixed by #<PR>."
  gh issue close <N> --reason "not planned" --comment "Duplicate of #<M>"
  ```

- **A new issue carries `needs-triage`** until it is decided.
- **The fix-up stage is the "Fix-ups" milestone.**
- **Every pull request says "Closes #N" for each issue it fixes,** a
  rider included: the issues its commits name are the list checked before
  it opens (2 November 2026: #361 fixed seven and closed none).
- **A review files an issue only for what a person meets, or for a rule
  that is wrong** (6 November 2026): every smaller tidy-up from the same
  reviews goes into one issue, "Left from ADR-NNN's reviews",
  `when-touched`, each item naming its file, as #505 does. The triage of
  6 November folded nine issues filed one by one into #505.
- **After a feature pull request merges, `/triage` reads the areas it
  touched** (6 November 2026): an issue the pull request made obsolete is
  closed `not planned`, naming it; one it did in part gets a comment
  saying what is left. The maintainer approves each first.
- Each of these prints nothing when every open issue is labelled: still
  `needs-triage`, no group label, no area label.

  ```bash
  gh issue list --state open --limit 500 --label needs-triage \
    --json number,title --jq '.[] | "#\(.number) \(.title)"'
  gh issue list --state open --limit 500 --json number,title,labels \
    --jq '.[] | select(all(.labels[]; .name != "fix-now" and .name != "when-touched" and .name != "later")) | "#\(.number) \(.title)"'
  gh issue list --state open --limit 500 --json number,title,labels \
    --jq '.[] | select(all(.labels[]; .name | startswith("area:") | not)) | "#\(.number) \(.title)"'
  ```

### Triaging the open issues

When `needs-triage` builds up, and before a fix-up stage (28 October
2026). Nothing is labelled, closed or milestoned until Bob decides. It
runs as `/triage` (29 October 2026, #322), whose
[skill](../.claude/skills/triage/SKILL.md) holds what a run does in these
steps; this section stays the rule.

1. **Export every open issue with its comments,** into `tmp/`, which git
   ignores:

   ```bash
   gh issue list --state open --limit 500 \
     --json number,title,labels,milestone,body,comments,updatedAt \
     > tmp/issues.json
   ```

   A comment counts as much as the body: a later one often says part of
   the issue was fixed by another PR, records Bob's decision, or narrows
   it, as on #158, #179 and #222 in the first triage.
2. **Check that each still holds** before proposing anything: a watch or
   a budget against its last run, a flaky test against its recent runs,
   a small bug against `main`. One already fixed is proposed for
   closing, not labelled.
3. **Write the proposal to `tmp/triage.md`:** for each issue its group,
   or a close with its reason, its areas and a few words why; then the
   counts by group and by area, the issues that look like duplicates,
   and the present labels that disagree.
4. **Apply what Bob decides,** and the three checks above print nothing.

## How code is delivered

- **Dependencies, on every branch** (21 October 2026): `npm outdated` in
  `server/` and `client/`, taking the in-range updates as a commit of their
  own at the branch's start, and again before the reviews. From ADR-081,
  only versions at least 7 days old, judged package by package from its
  own publish time and never moving a locked version back: the newest in
  range that is, not only npm's Wanted version, which a package that
  publishes daily keeps moving (6 November 2026, as Dependabot's cooldown
  does); not `npm
  update --before`, which does both wrong (the square logo's step 2, 25
  October 2026). A security fix is excepted, and any other exception is
  Bob's, named in its commit ([conventions.md, "Dependencies"](conventions.md#dependencies)).
- **Planned in the claude.ai chat, built in Claude Code** (from ADR-079, 20
  October 2026). The claude.ai chat does the check before an ADR (its
  Deferred lines, the watch lists, Open decisions and the open issues),
  the decisions for Bob to confirm, the ADR as the branch's first commit
  (it tidies the handoff too), the canvas designs (on the Claude Design
  canvas, <https://claude.ai/artifact/RqG3iKw4V41is3w1go53EJ>, where a
  changed design is drawn as a new row and every earlier one stays as its
  history, from 4 November 2026), and a
  build brief, whose steps Claude Code runs in a row (below). Claude Code
  writes the code from each step, runs
  `scripts/verify.sh`, `/simplify` and `/code-review`, and opens the PR.
  Bob pastes the stops back into the chat, which writes the as-built
  amendment and the docs, as a patch for each file already in the
  repository (below). Until
  ADR-078 the chat wrote
  the code too, as one mbox per commit, and Claude Code only applied
  them. Since ADR-088 the chat's half is a claude.ai skill,
  `plan-feature`, kept in `.claude/chat-skills/plan-feature/`, packed by
  `scripts/pack-chat-skill.mjs`, which packs only at `origin/main`'s
  commit, and uploaded by hand once each change has merged (ADR-084); its
  first step compares the uploaded copy with `main`'s.
- **The build, through `/build-from-brief`** (from ADR-083; in a row
  from ADR-089; each step on its own model from ADR-089's amendment of
  November 2026). The brief and the canvas's boards go in `tmp/adr-NNN/`,
  ignored by git and by markdownlint, so `scripts/verify.sh` does not
  lint its Markdown. A brief's steps table names who runs each step:
  Claude Code, Claude Code's main session (the reviews), the chat or
  Bob, and the model of each Claude Code step
  ([Which model runs a step](#which-model-runs-a-step)).
  `/build-from-brief tmp/adr-NNN/brief.md from <N>` runs step N and
  each one after it, each in a new `brief-step` subagent on the model its
  row names, whose
  `.claude/agents/brief-step.md` holds the ground rules every brief
  repeated, so a brief holds its decisions and its steps;
  `/build-from-brief tmp/adr-NNN/brief.md <N>` runs one step the same
  way. A run stops at a step that is the chat's or Bob's; before a
  main-session step, which it refuses, naming `/review-step`; at a step
  BLOCKED, by a question the brief does not
  answer or by verify failing after one honest retry; at a summary that
  names another model than its row's; before anything
  that would push, open a pull request, merge or change `main`; after
  the current step when a file named `STOP` is beside the brief, which
  the run removes; and at the stop rule. Each step's summary is appended
  to `summaries.md` beside the brief: Bob pastes only the stops into the
  chat and, at the brief's end, attaches the file for the as-built.
  `/clear` after a stop, once its summary is pasted, never inside a step
  nor while a run goes on; a step's follow-ups (an amend, an issue to
  file) stay in the session until they are done. A small fix between
  steps is a plain prompt of its own, a commit, then `/clear`. While
  building, the chat changes the brief only when an answer changes a
  step not yet run, and keeps the as-built notes in the chat (29 October
  2026): #260's brief was sent again after nearly every step. The review
  step runs in the main session, by `/review-step`, in two prompts
  ([The review step](#the-review-step)).
  Around each step, the loop does what Bob sees here (ADR-089's
  amendment); [its skill](../.claude/skills/build-from-brief/SKILL.md)
  holds the checks themselves. `from <N>` prints the plan first, each
  step up to the next stop with its model and its minutes, and starts
  without a question; `plan` prints the whole brief's and runs nothing.
  It refuses to start, naming why, when the branch, the tree, Claude
  Code's version, a variable that can put every step on one model, or
  Docker is not as the run needs. A Sonnet or Haiku step that fails on
  its own code, or meets work above its model, runs again on Opus, once
  a run, its first attempt saved as `step-N-<model>.diff` beside the
  brief. Each step leaves two summaries: the full one in `summaries.md`,
  under a heading with its model, its minutes and its tokens, and its
  `## For the chat`, printed at a stop for Bob to paste.
- **`caffeinate -dims` in a second terminal** during a long Claude Code
  step, such as the full verify (October 2026): a Mac asleep cut one off.
- **A second working folder,** for a branch built while another runs in
  the first: `git worktree add ../<folder> -b <branch> origin/main`, then
  `npm ci` in its `server/` and `client/` before any verify. Even
  `scripts/verify.sh --docs` needs both: its scripts' check formats with
  the server's prettier, and their tests read the client's FormatJS
  (2 November 2026). Then, from the main folder, `node
  scripts/folder-databases.mjs ../<folder>` (10 November 2026, ADR-089's
  amendment): it gives the folder its own dev, test and e2e databases,
  writes their three addresses into its `.env` and migrates them with its
  own code. A folder that kept the main folder's ran its migrations and
  tests on another branch's tables (#528). A test or browser run refuses
  a folder that still shares a test or e2e database with another, naming
  the command. Removed after the merge with `node
  scripts/folder-databases.mjs --drop ../<folder>`, then `git worktree
  remove ../<folder>`, so no database is left behind. A build and a fix
  verify at once there: the end-to-end and browser runs share one lock
  across the folders (`scripts/one-at-a-time.mjs`, in Postgres's own
  `postgres` database, which every folder reaches), so the second waits
  at those parts and goes on when the first is done.
- **Never switch branches in a folder a Claude Code session is working
  in** (6 November 2026): a `git switch main` there, while a session
  committed, put its commit on the local `main`. A job on `main` waits for
  the session, or runs in a second working folder.
- **Small fixes on the API credit** (November 2026, ADR-089's amendment):
  the credit covers the Agent SDK, not Claude Code, so a runner in the
  repository, `scripts/fix-issue/run.mjs`, runs `/fix-issue <N>` through
  the SDK, in a second working folder (`../waf-fix`), started from the
  main one. The key is set in the terminal only, `read -s
  ANTHROPIC_API_KEY && export ANTHROPIC_API_KEY`, and `npm ci` runs once
  in `scripts/fix-issue/`. The folder has its own databases, made once
  from the main folder with `node scripts/folder-databases.mjs
  ../waf-fix` after `npm ci` in its `server/` and `client/`; a fix or a
  resume whose folder shares a test or e2e database refuses before it
  costs anything, and the message for a missing folder gives the command.
  `--probe` is one cheap call that proves the key, the credit and the
  skill; `--resume last` finishes a fix that ended `UNFINISHED`, or
  `UNKNOWN` when GitHub could not be asked for its pull request, and
  refuses one that opened it or found the issue already fixed (that stop
  prints the `gh issue close` line and exits 0); `--spent` lists the
  credit month's runs (`tmp/fix-runs/runs.tsv`) against the credit, and
  a run warns once the month is past 80 %. It runs on Opus, cannot merge or force-push, and
  prints the merge for Bob to run: `git -C <folder> switch --detach`,
  then `gh pr merge <PR> --squash --delete-branch`. Claude Code itself
  cannot spend the credit: only this runner, with the key, does.
- **Cloud sessions** (Claude Code on the web, from October 2026): one new
  session per task, from `main`, each cloning the repository fresh, so
  nothing is pulled first; a long session pays for its whole history at
  every step. The prompt is one line, `/fix-issue <N>`
  ([its skill](../.claude/skills/fix-issue/SKILL.md), ADR-089's
  amendment of November 2026): it checks `main` for a commit that
  already fixes the issue, reads the issue whole, works out the files to
  leave alone from open pull requests and pushed branches, then fixes,
  proves and verifies, and opens a pull request that closes it. A branch
  built on the Mac is pushed at each stop of its run, so its files show;
  `leave <path>` after the number names one that is not. The chat picks
  from two exports the maintainer attaches (ADR-090): the open `fix-now`
  and `when-touched` issues with their text, `tmp/cloud-picks.json`,
  then the few it shortlists with their comments too,
  `tmp/cloud-picks-shortlist.json`; and only what the skill would not
  stop on: an issue read
  whole (of eight picked from one-line lists on 24 and 25 October, three
  stopped, needing a decision or more files), no choice left open, small
  enough (one that names more than about five files goes to the Mac:
  #310 stopped for nine dialogs on 4 November), and no commit on
  `main` already fixing it (two of four on 2 November). Two rules bend for it,
  each said in the skill: it takes no dependency commit, and without
  Docker it pushes after `scripts/verify.sh --quick`, the rest left to
  CI. A proof runs only the changed tests; a sweep, a load proof or
  anything needing the large seed stays on the Mac. A session signs with a key of its own, so under the
  maintainer's vigilant mode its commits show Unverified: its pull
  requests are squashed and merged, so each lands on `main` as one commit
  GitHub signs (1 November 2026). It is merged from the terminal, `gh pr
  merge <N> --squash --delete-branch`, never from the button, which
  offers the method used last: from 2 November every cloud pull request
  went in as a merge commit, #469 too. A feature branch's pull request
  keeps a merge commit, `gh pr merge <N> --merge`, so its commits stay
  apart (4 November 2026). PRs merge one at a time, each when
  green; a branch behind
  `main` with no conflict merges as it is, and a conflict in
  `docs/manual-checks.md` is settled on GitHub with "Accept both changes",
  an empty line between Regressions entries, the dated list kept oldest
  first. A session first installs the Node in `server/.node-version`,
  since a container may start on an older one (one had 22, where twenty
  client tests fail for reasons of their own). Its own "unpushed commits"
  warning after a push can be false, since the clone tracks only `main`:
  `git ls-remote origin <branch>` says whether the commit is there before
  anything is pushed again.
- **Every browser on a pull request's branch** is a run by hand,
  `gh workflow run ci.yml --ref <branch>` (Actions → CI → Run workflow),
  on the branch's last commit; the pull request's own runs are Chromium
  only. Its last check is "CI — every browser, by hand", never the
  required "CI — all jobs", since it skips "Against main". A label starts
  no run: a label's run once passed "CI — all jobs" over a failure (#334,
  ADR-008's amendment).
- **Every pull request** that changes what a person sees takes pictures
  before and after and compares them (`npm run screenshots:compare`), and
  its Claude Code Review comment is read before merging. The README's
  ["Which tool, when"](../README.md#which-tool-when) says when each of the repo's tools runs.
- **The chat's commits come as files, not an mbox** (from ADR-082, 24
  October 2026): `git am` had failed on Bob's side. A new file comes
  whole; a file already in the repository comes as a patch (below); then
  the commands to copy each in and commit. Every file a reply tells Bob
  to copy is attached to that same reply. Downloads land in
  `~/Downloads` itself, not a folder, so each file is named in full,
  never a glob, and moved out, never copied (ADR-088, 29 October 2026):
  one file with `mv ~/Downloads/<file> <path>`, a patch into
  `tmp/<branch>/` before it is applied. With `cp`, a newer download
  saved as "x (1).patch" leaves the older file under the name the
  command copies. Several files in one reply come as one zip the chat
  packs itself, laid out as the repository is and named for its step
  (`adr-088-step-07.zip`, ending `-v2` when corrected), unpacked from
  the repository's root with `unzip ~/Downloads/<zip> && rm
  ~/Downloads/<zip>`; `unzip` asks before overwriting a file. Text for
  GitHub, an issue's or a comment's, comes as a file too, passed with
  `--body-file` (4 November 2026): a script that held an issue's text
  inside `$( )` filed it cut short, since macOS's bash 3.2 closed the
  `$( )` at a parenthesis in the text and ran the rest as commands.
- **A file already in the repository changes by a patch, never sent
  whole** (29 October 2026; from 26 October, only a file of 600 lines or
  more). The chat makes it from a shallow, read-only clone of the
  repository in its own container, at `main`'s commit or at the
  branch's once Bob has pushed it and named the commit, and its first
  line names that base, which `git apply` passes over (ADR-088): Project
  knowledge's search returns passages, and a patch built from them can
  miss a line. It is applied with `git apply --check`, then `git apply
  --index`, which stages what it changed. A patch that does not match
  Bob's copy is refused whole, and is made again from a fresh clone,
  never mended by hand; `git diff --cached` shows every change before
  the commit. New files, and Bob's own working files in `tmp/`, come whole,
  as downloadable files; only a single small change stays inline as a
  snippet.
- **Every answer that changes files opens with a roadmap,** before the
  Recap: a tree or relative paths, each marked **new**, **full
  replacement**, **patch** or **snippet**.
- **The chat's replies, in five parts** (28 and 29 October 2026):
  Recap; New findings, each with its issue's number once filed;
  Recorded where; Decisions needed, each with its options and a
  recommendation, or "none"; and Next, the exact commands or prompt,
  numbered, in order. Every bullet starts with its status: ✅ done, ⏳
  waiting for Bob, 📝 noted for later. One short sentence per bullet,
  the one thing Bob must act on in bold, arrows for a flow, a small
  table or diagram to compare, a new term in plain words the first time;
  an empty section is left out, but Decisions needed never is. After any
  new migration, the reply reminds Bob to run `npm run migrate:all`.
- **Every run or session the chat asks Bob to start comes with its rough
  time and cost** (6 November 2026): the minutes or hours, the cost on
  API credits, what it takes of his plan's usage, and what the figures
  rest on. A build brief holds the same for each of its steps.
- State the exact path of every file:
  - `server/src/modules/…`;
  - `server/src/core/…` (organizations, audit, authorization);
  - `server/src/database/schema/…` and `…/migrations/…`;
  - `server/test/…`;
  - `client/src/…` (feature folders, `lib/api-names.ts`, `auth/permissions.ts`);
  - `client/e2e/…`;
  - `docs/adr/NNNN-<slug>.md`.

### Which model runs a step

ADR-089's amendment (6 and 7 November 2026). A brief's steps table has a
Model column, which the chat sets when it plans, from this table:

| Model | The step's work |
| --- | --- |
| `opus` | New server or client logic; design; the reviews and their fixes; a test written with them; any new or changed browser test |
| `sonnet` | Dependencies; seeds; Help guides; docs; a unit or server test copied from one beside it |
| `haiku` | Only a step that runs commands and reports, never one that writes code |

- **A step above its model stops,** with `BLOCKED: model` and before it
  commits anything, and the loop runs it again on Opus
  ([the escalation](#how-code-is-delivered)). The one that is always
  above Sonnet and Haiku is a browser test, a `.spec.ts` in `client/e2e/`
  or a file in `client/e2e/support/`: a check written on Sonnet raced the
  page's own read in CI (3cdebcd7), and a keyboard drag's keys came too
  soon for Linux WebKit (5631d0d8, [conventions.md, Tests](conventions.md#tests)).
- **The loop itself runs on the session's model, kept on Opus,** with
  no model of its own: a skill's model holds for its first turn only,
  and each step's result comes back in a new turn, so a pin to Sonnet
  lasted one step (the router's review, finding 27). The review step
  runs on Opus, by `/review-step`; the walkthrough's personas run on
  Sonnet.
- **The table follows what is measured:** each summary's heading gives
  its minutes and tokens, the as-built sets them against the brief's
  time-and-cost table, and this one changes where they disagree.

### The review step

The last Claude Code step of a brief, before its pull request is opened,
and the one row whose Who is `Claude Code, main session`. It runs in the
session, on Opus at high effort, by `/review-step tmp/adr-NNN/brief.md
<N>`; `/build-from-brief` refuses it and names that command. It stays in
the main session, never in a `brief-step`, because it stops for Bob's
choices, `/doctor prompt-audit` is typed in the session, and the reviews'
own skills start helpers of their own. Two prompts, the same command
twice:

1. **The findings.** The reviews, in this order:
   1. the walkthrough panel, `/usability-walkthrough panel <journey>`, on
      each journey the change touches, the journey's personas at once, for
      any PR that changes what a person sees (ADR-090). The brief names
      the journeys, from `.claude/skills/usability-walkthrough/journeys.md`;
      a journey is added there first when its task is new, and a persona to
      `personas.md` beside it;
   2. `/simplify`;
   3. `/code-review`;
   4. `/production-readiness` on the sections the change touches
      ([conventions.md, "Production readiness"](conventions.md#production-readiness));
   5. `/doctor prompt-audit`, Claude Code's own audit of its instruction
      files (`CLAUDE.md`, `.claude/rules/`, the skills) for contradictions
      and references to files that no longer exist. Bob types it in the
      session, since a session cannot run it: the session asks for it and
      waits, since it is a step of the reviews and not a decision, and
      numbers its findings with the rest. It runs on the session's model,
      so the ask says `/model opus` first. It changes nothing itself.

   Every finding is numbered, together, and written to the file the brief
   names, usually `tmp/adr-NNN/review.md`. Nothing is fixed, `/simplify`'s
   included: the prompt stops there for Bob's choices in the chat.
2. **The fixes.** The same command with Bob's choices after the step's
   number, by their numbers. Each fix is its own commit, verified with
   `--docs` or `--quick` by what it touches ([Commits](#commits)); a
   finding left is filed as an issue ([Issues and
   labels](#issues-and-labels)) or said in the PR. Then
   `scripts/verify.sh` in full, the push and the PR, whose description
   names the journeys walked and their personas.

## Process

- ADR before code for each new area. Server first with e2e tests, then the
  client screens. Each step its own commit.
- **At the start of every ADR,** before drafting it: check the ADRs'
  Deferred lines, the watch lists and the open issues for
  anything in the same area, and say which triggers have fired. The
  open issues are gathered with a script (ADR-089), the areas the
  change touches and the issues it names given:
  `node scripts/adr-check.mjs <NNN> --areas <a,b> --issues <n,m>`. It
  writes `tmp/adr-NNN/check.txt`, which the chat reads: each area's
  open issues ([Issues and labels](#issues-and-labels)), then the text
  and comments of each issue named and each `when-touched` one. It
  refuses an area not in `scripts/adr-index.mjs`, writing nothing. That
  is when a deferred item is cheapest to pick up.
- **A new ADR,** after the check above: copy
  [the template](adr/template.md) to `NNNN-<slug>.md` in `docs/adr/`,
  its number in four digits and its slug from its title as
  [ADR-086](adr/0086-docs-as-code.md#decision--one-file-per-adr) makes
  it; fill it in, its `areas` from the list in `scripts/adr-index.mjs`;
  list in its `amends` each ADR it changes; in each of those, add it to
  `amended-by` and write the change as a dated amendment at the end,
  naming this ADR; then run `node scripts/adr-index.mjs`.
- **The seeds grow with every feature** (from ADR-081): `seed:demo`, so
  its screens, manual checks and walkthroughs need no setup; `seed:volume`,
  realistic rows for any new table or hot query, timed against ADR-051's
  budgets. Every build brief has a step for both, or says why a feature
  adds nothing (CLAUDE.md; [conventions.md, "Seeds"](conventions.md#seeds)).
- **A change that touches many screens** starts its build with an
  inventory step: Claude Code lists every cross-area read and link (or,
  for ADR-081, every chunk, request and failure path) before building.
- **At each release,** before tagging it, set both packages' version to
  it: `npm version <x.y.z> --no-git-tag-version` in `server/` and in
  `client/`; and run `/doctor prompt-audit`
  ([The review step](#the-review-step)). Release notes are
  release notes only: they say nothing of manual checks or the
  walkthrough.
- A type change on the client means fixing the test fixtures that build that
  type, in the same commit. Vitest does not type-check; `tsc` and CI do.
- A commit that changes what a person sees, or a rule they work under,
  updates `docs/manual-checks.md` in the same commit ([`docs/conventions.md`,
  Tests](conventions.md#tests)).
- A commit that changes a rule, what the app allows, refuses or works
  out, updates its area's rules file in `docs/rules/` in the same commit,
  where the area has one (ADR-087). `scripts/check-docs.mjs` prints a
  notice when a rules file's cited tests, or its area's files by its
  `.claude/rules/` paths, changed while it did not; `/code-review` judges
  each.

### Adding a migration

Each command in `server/`:

1. write the schema, in `server/src/database/schema/`, a new table as
   [conventions.md, "A new table and the organization's export"](conventions.md#a-new-table-and-the-organizations-export)
   says;
2. run `npm run migrate:new -- --name <name>`;
3. append the hand-written parts (triggers, backfills) after a
   `--> statement-breakpoint`;
4. run `npm run migrate:all`, for the dev, test and e2e databases: each
   folder's own, since a second working folder has its own
   (`scripts/folder-databases.mjs`). A test or e2e database ahead of its
   folder, holding a migration the folder lacks or one whose file has
   changed since it ran, is dropped and made again from the start, and
   the run says so; Drizzle alone would apply nothing and report success
   (10 November 2026, ADR-089's amendment). The dev database holds a
   person's own rows, so it is never made again: `migrate:all` prints a
   line saying it is ahead, and goes on. That line comes from `npm run
   migrate:all` only, never from `npm run migrate`, which Render's build
   runs, where `../scripts/` is not there;
5. on each volume database that exists, which `migrate:all` does not
   reach, `DATABASE_URL=<its URL> npm run migrate`: `foundation_perf_large`,
   at `PERF_DB_LARGE` as
   [`server/perf/README.md`](../server/perf/README.md#running-it-locally)
   sets it, and the small one its ignored manifest, volume-small.json,
   names (7 November 2026: three steps migrated an unused one).

What a migration may take away while the running release reads it is
[conventions.md, "Migrations against the running release (ADR-081)"](conventions.md#migrations-against-the-running-release-adr-081),
which CI checks with squawk, a linter for Postgres migrations
(`scripts/check-migrations.sh`). Check the generated SQL keeps
`NULLS NOT DISTINCT`. Check the new entry's `when` in
`meta/_journal.json` is later than the one before: the migrator skips a
migration whose time is earlier than the last one applied, and still
reports success.

## Commits

- **Authored as Bob:** `Zhenzhong Zhou <bob0823.zhou@gmail.com>`, the
  identity on the repo's history (`git log --format='%an <%ae>' | sort |
  uniq -c` shows it). Every mbox or patch Claude prepares uses it, never a
  placeholder such as `Claude (draft) <draft@example.invalid>`: removing
  those took a history rewrite. A pre-push hook refuses a push that
  carries one: `.git/hooks/pre-push` until ADR-082 moves it to
  `scripts/hooks/`, with a CI check behind it.
- Explicit `git add` per concern, never `-A`.
- Run `git status` before every commit. Files staged earlier — even new or
  empty ones — ride into whichever commit runs first. Unstage with
  `git restore --staged <path>`.
- Each commit must build on its own. When a fix is already broken on `main`,
  it goes first.
- Messages explain the why, as one `-m` with a subject, a blank line and
  wrapped paragraphs.
- **No closing word before an issue's number** (3 November 2026): a
  commit's message never puts close, fix or resolve, in any form, right
  before `#N` unless that commit fixes it, since GitHub closes the issue
  when the commit reaches `main`. A handoff note's "closed #225" closed
  #225 again on 29 October, after its reopen; "#225 was closed" names the
  event and closes nothing. A pull request's "Closes #N" is still how a
  fix closes its issue ([Issues and labels](#issues-and-labels)).
- An alert is named "code scanning alert 9" or "Dependabot alert 4",
  never "#9", in commits, PRs and comments (27 October 2026): GitHub
  links "#9" to issue or PR 9.
- **Public text names no one** (30 October 2026): commit messages,
  issues, comments and PR descriptions say "the maintainer", "a reviewer
  who reads only Chinese" or "a first-time user", never a person's name
  or a family relation, since the repository is public. The git identity
  above is the one exception.
- **Dates and times are Vancouver's** (30 October 2026), America/Vancouver
  at UTC−7 all year since British Columbia's 2026 change, never in UTC: in
  commits, issues, comments and PRs, and in what Claude reports in the
  chat or in a summary.
- To reorder unpushed commits: `git reset --soft <base>`, restage per commit,
  and `git commit -C <old-hash>` to reuse each message.
- Before pushing, run what CI runs: `scripts/verify.sh` from the repo
  root (both sides, CI's order, stops at the first failure; `--quick`
  skips the end-to-end suites). Editor auto-imports in the wrong quote
  style fail CI.
  The full run also checks `e2e/accessibility.spec.ts` in Firefox and in
  Linux WebKit, from one container of Playwright's Linux image in Docker
  ([conventions.md, Supported browsers](conventions.md#supported-browsers)),
  which a pull request's CI, Chromium alone, does not; Linux WebKit's
  timing differs from the Mac's ([conventions.md, Tests](conventions.md#tests)).
  (`npx tsc --noEmit` in `client/` checks nothing: the root tsconfig only
  holds project references.)
- Before each commit, `scripts/verify.sh --quick`; or `--docs`, in
  seconds, for a commit that changes only Markdown outside `client/` and
  `docs/tables/`, and `scripts/`: the Markdown step and the scripts'
  format and tests. `--docs` refuses, naming the files, when the
  uncommitted changes touch anything else: `client/` is refused, the
  Help guides included, which `client/src/help/guides.test.ts` checks,
  and so is `docs/tables/`, which `npm run diagrams -- --check` checks. The full verify still runs
  before each push.

## Moving code

- **A refactor changes no behaviour** (from the maintainability rounds,
  October 2026): a fix found on the way is its own commit, first; tests
  stay green between commits; one extraction per commit, with the reason
  in the message; and a duplicate that differs on purpose stays, with a
  comment saying why. The goal is one definition per rule, not the
  fewest lines.
- Find every caller before moving a method, including
  `server/src/database/seed-demo.ts`, and calls split over two lines
  (`this.taxCodes` then `.findById`). CI runs `npm run seed:demo` on a
  fresh database, but only once the change is pushed, so after a server
  move run it locally too.
- Prove a move lost nothing: every non-import line of the old file should
  appear, as often, across the new ones.
- Check a new comment's claims against the code it describes before
  keeping it.
- After Claude Code moves files or adds exports, restart the editor's
  TypeScript and ESLint servers (Cmd+Shift+P; October 2026): they go
  stale and show errors `scripts/verify.sh` does not.

## Server

- Server e2e: always `npm run test:e2e`. Two runs never overlap, even from
  two working folders: the second waits for the first
  (`scripts/one-at-a-time.mjs`), and one started without that wrapper
  refuses. Don't edit server files while Playwright runs against
  `start:dev`.
- **`npm run api` is the truth about the document.** An enum written from
  a TypeScript union can change order when the code around it changes,
  since TypeScript orders a union by when it first meets each member.
  Commit what it writes; never put an older order back by hand.
- **Time zones by name, through one function on each side** (ADR-072):
  `todayIn` and `dayIn`, never `AT TIME ZONE` in SQL. Node and Chromium
  spell some zones the old way (`Asia/Calcutta`) and Safari the new;
  both sides map the old to the current.
- **Drizzle writes a column without its table name when a query has no
  joins.** Inside a correlated subquery, name the outer row in plain SQL.
  Raw SQL with every table aliased avoids it.
- Quantities and money stay strings end to end (ADR-025); compare and sum in
  SQL; the client never does decimal arithmetic. Values round to six places.
- Refusals in order: malformed (400), not found (404), not allowed (409), all
  before any write. Ids from a body that belong to another tenant are 400.
- Every write route is audited or listed in `NOT_AUDITED` with a reason.
  Every route has `@RequirePermissions`, is public, or is listed with its
  reason in `server/test/permission-coverage.e2e-spec.ts`: `SELF_SERVICE`
  for one acting only on the caller's own account, `GATED_INSIDE` for one
  gating each part it returns by that part's own permission. Never seed a
  permission nothing gates. New permissions default to Owner-only: add them to `PERMISSIONS`
  and its descriptions, never to the Admin or Viewer lists, and to the
  client's list in the same commit.

## Client and copy

- Dialogs take permission flags from their page rather than reading the
  session.
- `useSubmit`'s `success`, its confirmation toast, can be written from
  the action's result (ADR-073), and `onDone` takes that result too, such
  as the id of the record to open, so no dialog keeps it in a `useRef`.
- Hooks never inside hooks or after an early return.
- Playwright:
  - prefer `getByRole(…, { name, exact: true })`, and label tables
      (`aria-label`) so row lookups stay inside them;
  - an accessible name includes everything in the element, such as
      `Old retail (CAD) — retired`.
- British spelling in comments and copy is intentional.
