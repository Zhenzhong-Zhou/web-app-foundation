# CLAUDE.md

Guidance for Claude working in this repository, in a session or as the
GitHub reviewer. Short on purpose: the detail lives in the documents
below, and this file says where.

## Read first

- `docs/handoff.md`: where the work stands, what is next, and the
  working agreements.
- `docs/decisions.md`: the ADRs, why things are as they are. Read the
  relevant ones before changing anything structural.
- `docs/conventions.md`: naming, code organisation and the API contract.
- `docs/principles.md`: what the product aims for.

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
- **Before pushing.** `scripts/verify.sh`, or `--quick` without the
  end-to-end suites. It runs what CI runs, markdown included.
- **The API contract (ADR-068).** A response is a declared class in the
  module's `dto/*-response.dto.ts`, projected to exactly its fields:
  never a spread table row, never `select()` of every column, and a raw
  query's rows typed. A write returns the detail its read returns. After
  any API change, `npm run api` in `server/`, and commit
  `server/openapi.json` with `client/src/api/`. Never edit those two by
  hand. The e2e suite checks every response against the document.
- **Client types.** Import the generated types from
  `client/src/api/types.gen`. A name screens switch on goes in
  `client/src/lib/api-names.ts`, read from a generated type.
- **Migrations.** `npm run migrate:new -- --name <name>` in `server/`,
  then `npm run migrate:all`, which applies it to the dev, test and e2e
  databases. The steps between, and what to check in the generated SQL,
  are under Process in the handoff's working agreements.
- **Money and quantities** are decimal strings, never JavaScript numbers
  (ADR-025), and totals come from the server (ADR-055). Calendar days
  are `YYYY-MM-DD` strings (ADR-052).
- **Tenancy.** Every query goes through `TenantDb`; nothing reads across
  organizations (ADR-003).
- **Refusals** carry a snake_case code from
  `server/src/common/error-codes.ts`, never renamed or removed once
  released, and a message that says what to do next.
- **Languages.** Every message id exists in `en`, `fr-CA` and `zh-Hans`
  (ADR-054).
- **Audit.** Writes are `@Audited`, or listed in `NOT_AUDITED` with a
  reason; free text stays out of the payload (ADR-018).
- **Lint autofixes** under `client/e2e/` or `src/` are committed as a
  fixup, never restored.

## Skills

- `/code-review`: reviews a branch or pull request against these rules,
  `docs/conventions.md` and `docs/principles.md`.
- `/usability-walkthrough`: walks a task through the running app as a
  persona and reports what gets in the way.
