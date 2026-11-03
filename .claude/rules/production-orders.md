---
paths:
  - "server/src/modules/production-orders/**"
  - "server/src/database/schema/{production-orders,production-order-lines}.ts"
  - "client/src/production/**"
  - "server/test/{production-orders,licence-at-release}.e2e-spec.ts"
  - "client/e2e/{production,licence-at-release}.spec.ts"
---

# Production orders: the code rules, for Claude

It loads when Claude reads, writes or edits a file its `paths` match.

What production runs allow, refuse and work out is in
[`docs/rules/production-orders.md`](../../docs/rules/production-orders.md),
for people; a commit that changes one of those rules updates it (ADR-087).

- **A run moves only by its transitions,** release, output, close and
  cancel, each one transaction that starts from `run-guards.ts`
  (`loadWithin`, `assertStatus`, `loadForIssue`); the update DTO has no
  status (ADR-032).
- **Release transfers, close tops up then consumes, cancel unwinds
  nothing** (ADR-032); release copies the recipe onto the lines, SKU and
  unit included, never read through again (ADR-029).
- **Scaling is `scaledQuantity`** (`recipe-scaling.ts`), in SQL, the one
  expression release, the issue plan and Plan a run's preview share, so
  what a person is shown is what the run uses (ADR-085, amended; ADR-025).
- **The issue plan and release share `loadForIssue` and `checkLicence`;**
  release locks the licence `FOR SHARE` before the first write, and
  `LicenceOverrideGuard` asks for the override permission whenever the
  body carries one (ADR-050, amended).
- **Lots are allocated in SQL** by `allocateFefo` and `lotCandidates`: a
  top-up with `preferRunId`, consumption with `fromRunId`, so close stays
  within the lots the run was given (ADR-039).
- **What takes unheld stock, release and a top-up,** calls `assertTakeable`
  over `inVariantOrder` before anything moves (ADR-045).
- **An external line moves nothing:** no source, no lots, no
  consumption, held by the lines' check constraints (ADR-030).
- **Each id in a body is checked by `assertOwnIds`** before any write, a
  release's sources included ([engineering.md, Server](../../docs/engineering.md#server); ADR-003).
- **Responses through `run-views.ts`:** `runOf` and `runLineOf`, never
  the row (ADR-068).
- **The variance notice is sent after the transaction,** to `TOLD.variance`
  (ADR-036).
- **Plan run sends the recipe the select shows,** and waits until the
  item's recipes have answered (ADR-008, amended).
