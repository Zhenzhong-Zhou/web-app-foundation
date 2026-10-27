# CLAUDE.md

Guidance for Claude working in this repository, in a session or as the
GitHub reviewer. Short on purpose: the detail lives in the documents
below, and this file says where.

## Read first

- `docs/handoff.md`: where the work stands and what is next.
- `docs/engineering.md`: the working agreements.
- `docs/adr/`: the ADRs, one file each (index: `docs/adr/README.md`), why things are as they are. Read the
  relevant ones before changing anything structural.
- `docs/conventions.md`: naming, code organisation and the API contract.
- `docs/principles.md`: what the product aims for.
- `docs/manual-checks.md`: what a person checks by hand, and the rules
  for keeping it current.

## How to work

Four habits, adapted from the guidelines distilled from Andrej
Karpathy's observations on LLM coding pitfalls
(forrestchang/andrej-karpathy-skills), in this repository's terms:

- **Think before coding.** State the assumptions and the reading you
  chose. When two readings would build different things, ask. When a
  simpler way exists, say so. A decision worth keeping becomes an ADR or
  an amendment, as the first commit.
- **Simplicity first.** Build what was asked, with no speculative
  options. What is worth deferring goes under its ADR's *Deferred*, with
  the trigger that would bring it back, rather than half-built.
- **Surgical changes.** Touch what the task needs and match the
  surrounding style; do not reformat or improve neighbouring code. Clean
  up only what the change itself left unused. A chore found on the way
  rides along as its own commit.
- **Goal-driven.** Make done checkable: a test that fails before the
  change and passes after, and `scripts/verify.sh` green. A new rule
  arrives with the test that proves it.

## Rules of this repository

- **Commits and pull requests.** Commits are authored
  `Zhenzhong Zhou <bob0823.zhou@gmail.com>`; a commit made with Claude
  Code may carry its `Co-Authored-By` trailer. One pull request per
  feature: the ADR or amendment first, then server, client and docs
  commits. PR descriptions are plain Markdown.
- **Dependencies.** On every branch, `npm outdated` in `server/` and
  `client/`; the in-range updates are a commit of their own, at the
  branch's start and again before the reviews.
- **Before pushing.** `scripts/verify.sh`, or `--quick` without the
  end-to-end suites. It runs what CI runs, markdown included.
- **The API contract (ADR-068).** A response is a declared class in the
  module's `dto/*-response.dto.ts`, projected to exactly its fields:
  never a spread table row, never `select()` of every column, and a raw
  query's rows typed. A write returns the detail its read returns, or 204
  when the screen reads again anyway (a delete, a state change, a settings
  section). After
  any API change, `npm run api` in `server/`, and commit
  `server/openapi.json` with `client/src/api/`. Never edit those two by
  hand. The e2e suite checks every response against the document.
- **Client types.** Import the generated types from
  `client/src/api/types.gen`. A name screens switch on goes in
  `client/src/lib/api-names.ts`, read from a generated type.
- **Migrations.** `npm run migrate:new -- --name <name>` in `server/`,
  then `npm run migrate:all`, which applies it to the dev, test and e2e
  databases. The steps between, and what to check in the generated SQL,
  are under Process in `docs/engineering.md`.
- **Seeds grow with every feature** (ADR-081). `npm run seed:demo` gains
  what the feature's screens need, so its manual checks and walkthroughs
  start without setup. `npm run seed:volume` gains realistic rows for any
  new table or hot query, timed against ADR-051's budgets (`npm run
  perf:plans`, `npm run perf`). A feature with nothing to add says so in
  its PR.
- **Money and quantities** are decimal strings, never JavaScript numbers
  (ADR-025), and totals come from the server (ADR-055). Calendar days
  are `YYYY-MM-DD` strings (ADR-052).
- **Tenancy.** Every query goes through `TenantDb`; nothing reads across
  organizations (ADR-003).
- **Refusals** carry a message that says what to do next. One whose
  screen offers a way out, such as a link to the missing setting, also
  carries a snake_case code from `server/src/common/error-codes.ts`, never
  renamed or removed once released; most refusals carry none.
- **Languages.** Every message id exists in `en`, `fr-CA` and `zh-Hans`
  (ADR-054).
- **Audit.** Writes are `@Audited`, or listed in `NOT_AUDITED` with a
  reason; free text stays out of the payload (ADR-018).
- **Mail to a typed address.** A feature that sends email to an address
  a member typed (an invitation today; an invoice emailed to a customer
  later) requires the sender's own address to be confirmed first, as
  ADR-077 does for invitations (`email_unverified`).
- **Manual checks.** A commit that changes what a person sees, or a rule
  they work under, updates `docs/manual-checks.md` in the same commit
  (`docs/conventions.md`, Tests).
- **Lint autofixes** under `client/e2e/` or `src/` are committed as a
  fixup, never restored.

## Skills

- `/code-review`: reviews a branch or pull request against these rules,
  `docs/conventions.md` and `docs/principles.md`.
- `/usability-walkthrough`: walks a task through the running app as a
  persona and reports what gets in the way.
- `/production-readiness`: reviews whether the deployed app is ready for
  real users, report only.
- `/build-from-brief`: runs one step of a build brief in `tmp/`, as
  `/build-from-brief tmp/adr-NNN/brief.md <step>`, under the rules every
  brief shares; only when a prompt names it.

Every feature branch runs, for any PR that changes what a person sees,
`/usability-walkthrough` as one of its personas
(`.claude/skills/usability-walkthrough/personas.md`), then `/simplify`,
then `/code-review`, so it sees every fix, then `/production-readiness`
on the sections the change touches; all of them before the PR is
opened. Each fix they lead to is its own commit.
