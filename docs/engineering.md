# Engineering

## Working agreements (for Claude)

### Pull requests

- **One PR per feature** (October 2026): its ADR, when it has a new one,
  as the first commit, then server, client and docs as commits of their own;
  fixes go on the branch until its checks pass, never in a follow-up PR.
  Small chores (a CI line, a lint rule, a docs tidy) ride along in the next
  feature PR rather than getting one of their own.
- **The reviews, before the PR is opened** (21 October 2026, and from
  ADR-081 four): every feature branch runs, for any PR that changes what
  a person sees, `/usability-walkthrough` as one of its personas
  (`.claude/skills/usability-walkthrough/personas.md`), then `/simplify`,
  then `/code-review`, so the review sees every fix before it, then
  `/production-readiness` on the sections the change touches
  (conventions.md, "Production readiness"). Each
  fix they lead to is its own commit. The PR description names the journey
  walked and the persona who walked it. `/usability-walkthrough` was
  missed on several recent PRs, so this branch's step 7 (ADR-079) walks
  two journeys, to make up for ADR-077 and ADR-078.

### How code is delivered

- **Dependencies, on every branch** (21 October 2026): `npm outdated` in
  `server/` and `client/`, taking the in-range updates as a commit of their
  own at the branch's start, and again before the reviews. From ADR-081,
  only versions at least 7 days old, judged package by package from its
  own publish time and never moving a locked version back; not `npm
  update --before`, which does both wrong (the square logo's step 2, 25
  October 2026). A security fix is excepted, and any other exception is
  Bob's, named in its commit (conventions.md, "Dependencies").
- **Planned in this chat, built in Claude Code** (from ADR-079, 20
  October 2026). The claude.ai chat does the check before an ADR (its
  Deferred lines, the watch lists, Open decisions and the open issues),
  the decisions for Bob to confirm, the ADR as the branch's first commit
  (it tidies the handoff too), the canvas designs, and a build brief: one
  Claude Code prompt per commit. Claude Code writes the code from each prompt, runs
  `scripts/verify.sh`, `/simplify` and `/code-review`, and opens the PR.
  Bob pastes its summaries back into the chat, which writes the as-built
  amendment and the docs, as a patch for a long file (below). Until
  ADR-078 the chat wrote
  the code too, as one mbox per commit, and Claude Code only applied
  them.
- **The build, through `/build-from-brief`** (from ADR-083). The brief
  and the canvas's boards go in `tmp/adr-NNN/`, ignored by git though
  `scripts/verify.sh` lints its Markdown. Each prompt is one line,
  `/build-from-brief tmp/adr-NNN/brief.md N`; the skill holds the ground
  rules every brief repeated, so a brief holds its decisions and its
  steps. `/clear` between steps, never inside one; a step's follow-ups
  (an amend, an issue to file) stay in its context, and its summary is
  pasted into the chat before clearing. A small fix between steps is a
  plain prompt of its own, a commit, then `/clear`. The review step runs
  in two prompts: the reviews write their findings, numbered, to
  `tmp/adr-NNN/review.md` and stop for Bob's choices; then the fixes by
  number, the full verify, the push and the PR.
- **Cloud sessions** (Claude Code on the web, from October 2026): one new
  session per task, from `main`, each cloning the repository fresh, so
  nothing is pulled first; a long session pays for its whole history at
  every step. The prompt names the issue, the branch, the author Zhenzhong
  Zhou with the session as committer (the commit then shows Verified), the
  regression check's number when several run at once, and the files to
  leave alone; asks for `scripts/verify.sh --quick`, a pull request with
  "Fixes #N" and a last line saying DONE or BLOCKED; and ends with the stop
  rule: change only what the issue names, and past about 20 minutes or
  more files than that, stop and report. A proof runs only the changed
  tests; a sweep, a load proof or anything needing the large seed stays on
  the Mac. PRs merge one at a time, each when green; a branch behind
  `main` with no conflict merges as it is, and a conflict in
  `docs/manual-checks.md` is settled on GitHub with "Accept both changes",
  an empty line between Regressions entries, the dated list kept oldest
  first. A session first installs the Node in `.node-version`, since a
  container may start on an older one (one had 22, where twenty client
  tests fail for reasons of their own). Its own "unpushed commits"
  warning after a push can be false, since the clone tracks only `main`:
  `git ls-remote origin <branch>` says whether the commit is there before
  anything is pushed again.
- **A pull request opened with `gh pr create --label full-e2e`** runs
  Chromium only the first time: the label is not in the opened event, so
  every browser runs from the next push or a re-label (#254).
- **Every pull request** that changes what a person sees takes pictures
  before and after and compares them (`npm run screenshots:compare`), and
  its Claude Code Review comment is read before merging. The README's
  "Which tool, when" says when each of the repo's tools runs.
- **The chat's docs commits come as full files, not an mbox** (from
  ADR-082, 24 October 2026): `git am` had failed on Bob's side. Each file
  is made from `main` as Bob has it, with its `git hash-object` before
  and after, so a copy made from another version is caught before it
  overwrites anything; then the commands to copy it in and commit.
  Downloads land in `~/Downloads` itself, not a folder, so each file is
  named in full, never a glob.
- **A long file changes by a patch, not a full replacement** (26 October
  2026): the ADR files in `docs/adr/`, the handoff, `manual-checks.md` and
  `conventions.md` are changed only where they need it. Bob attaches his
  copy from `main`, since Project knowledge's search returns a long file
  in passages; the chat sends a patch, applied with `git apply --check`
  and then `git apply --index`, which stages what it changed. A patch
  that does not match Bob's copy is refused whole, and `git diff
  --cached` shows every change before the commit. New and short files
  still come whole.
- **Every answer that changes files opens with a roadmap:** a tree or
  relative paths, each marked **new**, **full replacement**, **patch** or
  **snippet**.
- **New files, and changes touching several places or a large chunk of one
  file, come as full downloadable files.** Only a single small change stays
  inline as a snippet.
- Full replacements are made from Bob's current copy. Project knowledge
  counts once Bob says he has resynced from `main`. Otherwise ask, or build
  from the Project copy plus known changes and tell Bob to check `git diff`.
- State the exact path of every file:
  - `server/src/modules/…`;
  - `server/src/core/…` (organizations, audit, authorization);
  - `server/src/database/schema/…` and `…/migrations/…`;
  - `server/test/…`;
  - `client/src/…` (feature folders, `lib/api-names.ts`, `auth/permissions.ts`);
  - `client/e2e/…`;
  - `docs/adr/NNNN-<slug>.md`.

### Process

- ADR before code for each new area. Server first with e2e tests, then the
  client screens. Each step its own commit.
- **At the start of every ADR,** before drafting it: check the ADRs'
  Deferred lines, the handoff's watch lists and the open issues for
  anything in the same area, and say which triggers have fired. That is
  when a deferred item is cheapest to pick up.
- **The seeds grow with every feature** (from ADR-081): `seed:demo`, so
  its screens, manual checks and walkthroughs need no setup; `seed:volume`,
  realistic rows for any new table or hot query, timed against ADR-051's
  budgets. Every build brief has a step for both, or says why a feature
  adds nothing (CLAUDE.md; conventions.md, "Seeds").
- **A change that touches many screens** starts its build with an
  inventory step: Claude Code lists every cross-area read and link (or,
  for ADR-081, every chunk, request and failure path) before building.
- Migrations:
    1. write the schema;
    2. run `npm run migrate:new -- --name <name>`;
    3. append the hand-written parts (triggers, backfills) after a
       `--> statement-breakpoint`;
    4. run `npm run migrate:all`.

  Check the generated SQL keeps `NULLS NOT DISTINCT`. Check the new
  entry's `when` in `meta/_journal.json` is later than the one before:
  the migrator skips a migration whose time is earlier than the last one
  applied, and still reports success. 0065's was ahead of the clock, so
  0066 was generated earlier and skipped, with no column and no error,
  until its time was moved after 0065's.
- **At each release,** before tagging it, set both packages' version to
  it: `npm version <x.y.z> --no-git-tag-version` in `server/` and in
  `client/`.
- A type change on the client means fixing the test fixtures that build that
  type, in the same commit. Vitest does not type-check; `tsc` and CI do.
- A commit that changes what a person sees, or a rule they work under,
  updates `docs/manual-checks.md` in the same commit (`docs/conventions.md`,
  Tests).

### Commits

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
- To reorder unpushed commits: `git reset --soft <base>`, restage per commit,
  and `git commit -C <old-hash>` to reuse each message.
- Before pushing, run what CI runs: `scripts/verify.sh` from the repo
  root (both sides, CI's order, stops at the first failure; `--quick`
  skips the end-to-end suites). Editor auto-imports in the wrong quote
  style fail CI.
  (`npx tsc --noEmit` in `client/` checks nothing: the root tsconfig only
  holds project references.)

### Moving code (what step 1 learned)

- Find every caller before moving a method, including
  `server/src/database/seed-demo.ts`, and calls split over two lines
  (`this.taxCodes` then `.findById`). CI runs `npm run seed:demo` on a
  fresh database, but only once the change is pushed, so after a server
  move run it locally too.
- Prove a move lost nothing: every non-import line of the old file should
  appear, as often, across the new ones.
- Check a new comment's claims against the code it describes before
  keeping it.

### Server

- Server e2e: always `npm run test:e2e`. Never run two at once — the second
  now refuses. Don't edit server files while Playwright runs against
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
  Every route has `@RequirePermissions`. Never seed a permission nothing
  gates. New permissions default to Owner-only: add them to `PERMISSIONS`
  and its descriptions, never to the Admin or Viewer lists, and to the
  client's list in the same commit.

### Client and copy

- Dialogs take permission flags from their page rather than reading the
  session.
- `useSubmit`'s callback takes no result — keep ids and notices in a
  `useRef`.
- Hooks never inside hooks or after an early return.
- Playwright:
  - prefer `getByRole(…, { name, exact: true })`, and label tables
      (`aria-label`) so row lookups stay inside them;
  - an accessible name includes everything in the element, such as
      `Old retail (CAD) — retired`.
- British spelling in comments and copy is intentional.
