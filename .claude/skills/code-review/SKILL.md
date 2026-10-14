---
name: code-review
description: Review a pull request or the current branch against this repository's own rules (CLAUDE.md, docs/conventions.md, docs/principles.md and the ADRs) and report findings by severity. Use for /code-review, before opening a pull request, or when asked to review changes. Replaces the bundled /code-review in this repository.
---

# Code review

Review a change the way its author's own standards would: against the
rules written down in this repository, not general taste. Report; do not
change code unless asked.

## 1. Get the change

- A pull request: `gh pr view <number>` for its description, and
  `gh pr diff <number>` for the diff.
- The current branch: `git log --oneline main..HEAD` and
  `git diff main...HEAD`.

Skip `server/openapi.json` and `client/src/api/`, which are generated,
except to check that they changed whenever the API did.

## 2. Read the rules it touches

`CLAUDE.md` first, then the parts of `docs/conventions.md` and
`docs/principles.md` the change bears on, and every ADR it names or
amends in `docs/decisions.md`.

## 3. Check

### Shape of the change

- One feature. A new decision arrives as an ADR or amendment in the
  first commit; chores are commits of their own. Fixes go on the branch,
  never in a follow-up pull request.
- Commits authored `Zhenzhong Zhou <bob0823.zhou@gmail.com>`.
- `docs/handoff.md` updated when the state of the work changed, and
  `docs/conventions.md` when a pattern did.
- A commit that changes what a person sees, or a rule they work under,
  updates `docs/manual-checks.md` in the same commit.
- A client type change fixes the test fixtures that build that type in
  the same commit.

### The API contract (ADR-068)

- Each response is a declared class, and the service projects to it:
  no spread table row, no `select()` of every column, raw query rows
  typed rather than `Record<string, unknown>`.
- A write returns the detail its read returns, or as its list shows it
  where there is no read.
- `server/openapi.json` and `client/src/api/` regenerated in the same
  change; neither edited by hand.
- Nothing personal beyond what the screen shows (ADR-063).

### Data

- Queries through `TenantDb`; nothing across organizations (ADR-003).
- Money and quantities as decimal strings (ADR-025); calendar days as
  `YYYY-MM-DD` (ADR-052).
- A new migration has its snapshot; the description says to run
  `npm run migrate:all`.
- Hand-written parts of a migration (triggers, backfills) come after a
  `--> statement-breakpoint`, and the generated SQL keeps
  `NULLS NOT DISTINCT`.
- A column holding a known list is typed by it (`$type<...>()`), the
  list matching its check constraint.
- Writes `@Audited`, or listed in `NOT_AUDITED` with a reason, with no
  free text in the payload (ADR-018).
- Every route has `@RequirePermissions`. A new permission is Owner-only:
  added to `PERMISSIONS` and its descriptions, never to the Admin or
  Viewer lists, and to the client's list in the same commit. No
  permission is seeded that nothing gates.

### Behaviour

- A refusal carries a snake_case code that is never renamed, and a
  message that says what to do next.
- Every new message id exists in `en`, `fr-CA` and `zh-Hans`; no text
  hard-coded in a component.
- Controls labelled and keyboard-reachable (WCAG 2.2 AA, ADR-055).
- A new rule comes with the test that proves it: e2e for server
  behaviour, a component test for a UI branch.

### Principles (`docs/principles.md`)

- Does any screen leave someone guessing, lose something silently, or
  show a number the server did not compute?

## 4. Report

Group findings, most serious first:

- **Must fix**: breaks a rule, a test, or the contract.
- **Should fix**: works, but against a convention or a principle.
- **Worth considering**: a simpler or clearer way.

Write each as `path:line`, what is wrong, the rule it breaks (the ADR,
the convention or the principle), and the fix. End with one line on
what the change does well. If nothing is wrong, say so plainly rather
than inventing findings.

## 5. Post, when asked

Write the report to a file and post it as a comment review:

```bash
gh pr review <number> --comment --body-file review.md
```

GitHub does not let an author approve their own pull request, so a
review here is always a comment.
