---
paths:
  - "server/src/modules/stock/**"
  - "server/src/database/schema/{stock-levels,stock-movements,stock-valuations,valuation-pools,lots}.ts"
  - "client/src/inventory/**"
  - "server/test/{stock,lot-trace,valuation,reservations,samples}.e2e-spec.ts"
  - "server/test/utils/valuation.ts"
  - "client/e2e/{inventory,movements}.spec.ts"
---

# Stock: the code rules, for Claude

What to keep true when changing stock's code.

- **Quantity is a ledger.** Every change is a movement, written through
  `StockService.recordWithin` (or `record`, which opens the transaction)
  in the same transaction as its `stock_levels` row; nothing else writes
  a quantity (ADR-023).
- **The `stock_levels` row is the lock,** taken first by an insert that
  makes it if missing; `CHECK (quantity >= 0)` is the backstop, not the
  check (ADR-025).
- **Quantities are `numeric(18, 4)` and strings end to end,** worked out
  in Postgres, never through `Number()`; the client formats with
  `displayQuantity` or `formatQuantity` and adds nothing up (ADR-025;
  [engineering.md, Server](../../docs/engineering.md#server)).
- **Rules across tables live in the service,** asserted in e2e, never in
  a trigger: a lot exactly when the variant tracks lots, and a movement's
  locations leaves (ADR-023, ADR-024, ADR-025).
- **Holds are computed, never stored.** What spends unheld stock takes
  `lockProduct`, several in `inVariantOrder`; adjustments and transfers
  are not checked (ADR-045).
- **A movement's reference is the server's to set:** the movement route
  takes none from the client (ADR-042).
- **A movement keeps its SKU as text;** an adjustment needs a note, and
  every movement its actor (ADR-023).
- **Lot allocation is worked out in SQL,** earliest expiry first by
  default (ADR-039). A lot's expiry shows as `ExpiryChip`
  ([conventions.md, Shared pieces for screens](../../docs/conventions.md#shared-pieces-for-screens-adr-055)).
