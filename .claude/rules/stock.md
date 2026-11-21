---
paths:
  - "server/src/modules/stock/**"
  - "server/src/database/schema/{stock-levels,stock-movements,stock-valuations,valuation-pools,lots,reorder-points}.ts"
  - "client/src/inventory/**"
  - "server/test/{stock,movements,lot-trace,valuation,reservations,samples,reorder-points,reorder-position,low-stock-notices,code-figures}.e2e-spec.ts"
  - "server/test/utils/{valuation,reorder-world}.ts"
  - "client/e2e/{inventory,movements}.spec.ts"
---

# Stock: the code rules, for Claude

It loads when Claude reads, writes or edits a file its `paths` match.

What to keep true when changing stock's code. What stock allows,
refuses and works out is [`docs/rules/stock.md`](../../docs/rules/stock.md),
updated with the rule it states (ADR-087).

- **Quantity is a ledger.** Every change is a movement, written through
  `StockService.recordWithin` in the same transaction as its
  `stock_levels` row; nothing else writes a quantity (ADR-023).
- **The `stock_levels` row is the lock,** taken first by an insert that
  makes it if missing; `CHECK (quantity >= 0)` is the backstop, not the
  check (ADR-025).
- **Quantities are `numeric(18, 4)`,** worked out in Postgres; the
  client formats with `displayQuantity` and adds nothing up (ADR-025).
- **Rules across tables live in the service,** asserted in e2e, never in
  a trigger: a lot exactly when the variant tracks lots, and a movement's
  locations leaves (ADR-023, ADR-024, ADR-025).
- **Holds are computed, never stored.** What spends unheld stock takes
  `lockProduct`, several in `inVariantOrder`; adjustments and transfers
  are not checked (ADR-045).
- **Usable stock is one rule,** `usable-stock.ts`: holds, the guard,
  Reorder and a lot's trace read `usableByLocation`, `usableByItem`,
  `onHandByUse` or `usableInLot`, never a copy (ADR-045, ADR-085,
  ADR-093).
- **A code's figures are one read,** `codeFigures` (`code-figures.ts`):
  on hand and its not-usable parts, held, free, short, coming, Left,
  what expires first and the status; every screen reads it, never a
  sum of its own (ADR-093). Its parts are unioned and grouped
  by item, never joined, stock summed per place before the place is
  joined; held is `least(usable, still needed)`, an order's lines
  and the guard read `holdsSql`.
- **Inventory's grouped read is `stock-grouped.service.ts`:** a row per
  code from `codeFigures`, a figure sort `sortedFigure` unioned with
  the codes, never joined; the Lot view from `stockRowsOf`'s rows,
  as Home counts them.
- **A place's name, code and path only with `locations.view`,** its
  id always (96a): Stock, a lot's trace, Movements; the path by
  `place-paths.ts`.
- **Movements is `movementPage` (`movement-view.ts`):** page, then
  joins; `created_at desc nulls last`, id; `cardOf`, `changeOf` and
  `onHandByItem` give In, Out, `change`, balance and period;
  `orderId` 403 without `orders.view`.
- **The lines behind a code's figures are `code-lines.ts`:** Coming's
  documents, Held's sales and the usable lots without places, each read
  by the rule its figure is, so they add up; Where it stands
  (`where-it-stands.service.ts`) reads them, each part gated by its
  permission (ADR-080).
- **A movement keeps its SKU as text,** its reference the server's to
  set, never the client's; an adjustment needs a note, and every
  movement its actor (ADR-023, ADR-042).
- **Lot allocation is worked out in SQL,** earliest expiry first by
  default (ADR-039).
