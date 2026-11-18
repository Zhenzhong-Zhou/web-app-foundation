---
paths:
  - "server/src/modules/stock/**"
  - "server/src/database/schema/{stock-levels,stock-movements,stock-valuations,valuation-pools,lots,reorder-points}.ts"
  - "client/src/inventory/**"
  - "server/test/{stock,lot-trace,valuation,reservations,samples,reorder-points,reorder-position,low-stock-notices,code-figures}.e2e-spec.ts"
  - "server/test/utils/{valuation,reorder-world}.ts"
  - "client/e2e/{inventory,movements}.spec.ts"
---

# Stock: the code rules, for Claude

It loads when Claude reads, writes or edits a file its `paths` match.

What to keep true when changing stock's code. What stock allows,
refuses and works out is [`docs/rules/stock.md`](../../docs/rules/stock.md),
updated with the rule it states (ADR-087).

- **Quantity is a ledger.** Every change is a movement, written through
  `StockService.recordWithin` (or `record`, which opens the transaction)
  in the same transaction as its `stock_levels` row; nothing else writes
  a quantity (ADR-023).
- **The `stock_levels` row is the lock,** taken first by an insert that
  makes it if missing; `CHECK (quantity >= 0)` is the backstop, not the
  check (ADR-025).
- **Quantities are `numeric(18, 4)` and strings end to end,** worked out
  in Postgres, never through `Number()`; the client formats with
  `displayQuantity` or `formatQuantity` and adds nothing up (ADR-025).
- **Rules across tables live in the service,** asserted in e2e, never in
  a trigger: a lot exactly when the variant tracks lots, and a movement's
  locations leaves (ADR-023, ADR-024, ADR-025).
- **Holds are computed, never stored.** What spends unheld stock takes
  `lockProduct`, several in `inVariantOrder`; adjustments and transfers
  are not checked (ADR-045).
- **Usable stock is one rule,** `usable-stock.ts`: the holds, the guard
  and Reorder's position read `usableByLocation`, `usableByItem` or
  `onHandByUse`, never a copy of their sums (ADR-045 and ADR-085, as
  ADR-093 amends them).
- **A code's figures are one read,** `codeFigures` (`code-figures.ts`):
  on hand and its not-usable parts, held, free, short, coming, Left,
  what expires first and the status; every screen reads it, never a
  sum of its own (ADR-093, R1, R20). Its parts are unioned and grouped
  by item, never joined, stock summed per place before the place is
  joined; held is `least(usable, still needed)`, an order's lines
  and the guard read `holdsSql`.
- **Inventory's grouped read is `stock-grouped.service.ts`:** a row per
  code from `codeFigures`, a figure sort `sortedFigure` unioned with
  the codes, never joined; the Lot view from `stockRowsOf`'s rows,
  as Home counts them; a place's name only with `locations.view`
  (ADR-093).
- **The lines behind a code's figures are `code-lines.ts`:** Coming's
  documents, Held's sales and the usable lots without places, each read
  by the rule its figure is, so they add up. Where it stands
  (`where-it-stands.service.ts`, `GET /v1/products/:id/stock`) reads
  them, gated inside: each part only for a reader who may see it
  (ADR-080; ADR-093).
- **A movement's reference is the server's to set:** the movement route
  takes none from the client (ADR-042).
- **A movement keeps its SKU as text;** an adjustment needs a note, and
  every movement its actor (ADR-023).
- **Lot allocation is worked out in SQL,** earliest expiry first by
  default (ADR-039).
