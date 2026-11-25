---
paths:
  - "server/src/modules/stock/{lot-changes,lot-tracking,lot-trace,lots}.service.ts"
  - "server/src/modules/stock/{lot-tracking,lot-trace}.controller.ts"
  - "server/src/modules/stock/{start-lot,lot-search,former-codes,lot-allocation,open-run}.ts"
  - "server/src/modules/stock/dto/{movement-lot,move-to-lot,start-lot-tracking,update-lot,lot-trace-response,lot-tracking-response}.dto.ts"
  - "server/src/modules/numbering/lot-codes.ts"
  - "server/src/database/schema/{lots,lot-former-codes}.ts"
  - "server/test/{lot-changes,lot-trace,lot-tracking,lots-at-receipt}.e2e-spec.ts"
  - "client/src/inventory/{lot-input.ts,lot-received.ts,lot-expiry.ts,lot-fields.tsx,lot-marks.tsx,lot-taken.tsx,edit-lot-dialog.tsx,move-to-lot-dialog.tsx,expiry-choice.tsx,no-lot-line.tsx,supplier-lot-part.ts}"
  - "client/src/products/start-tracking-dialog.tsx"
  - "client/src/costs/{lot-cost-panel,stock-value-page}.tsx"
  - "client/e2e/lots-at-receipt.spec.ts"
---

# Lots: the code rules, for Claude

It loads when Claude reads, writes or edits a file its `paths` match.

What to keep true when changing lots at receipt, tracking started and a
move between lots (ADR-094). What lots allow, refuse and work out is in
[`docs/rules/stock.md`](../../docs/rules/stock.md) and
[`products.md`](../../docs/rules/products.md) (ADR-087).

- **A made code is taken in the caller's transaction,** `takeLotCode`
  (`lot-codes.ts`), by the organization's today and its one counter; a
  code the item has, or had, is passed over. Its format is
  `numbering-format.ts`'s, held level with `numbering.ts` by
  tests.
- **A corrected code is kept:** `updateLot` writes the old one to
  `lot_former_codes` in the same save, with why, never in the audit
  payload (ADR-018). `refuseFormerCode` keeps it from any other lot,
  the variant locked first; `lot_code_former` carries that lot for Use.
- **`MovementLotDto` says what a lot is,** an id, a typed new code or
  one to make; `mustBeNew` comes from the route, never the reason.
- **`lots.expiry` is `date`, `unknown` or `none`,** `expires_at` set
  exactly for `date`; `unknown` is usable, never expired and never first
  to expire. Every write names both, and `lots_expiry_date_check` alone
  holds them together: 0085 dropped 0084's trigger (`schema/lots.ts`).
- **The supplier's lot is for a lot made here;** its mark
  (`stock.lot_made_here`) is one way, audited, never undone.
- **A lot change is one `lot_change` movement and two value rows of
  their own kind** (`lot-changes.service.ts`): the stock card counts it
  in neither In nor Out (`changeOf`), and both pools are locked
  `inLotOrder` after the variant row.
- **A lot issued to an open run is not moved** (`open-run.ts`, one query
  for the refusal and `issuedToRun`).
- **A late cost follows each unit once** (`revaluation.ts`): `plan`
  walks the pool's rows in time order, each row out taking its share to
  `issued` or to a lot change's row in, a return its shipment's back;
  `write` writes them. The row in takes no cost by hand; a cost and a
  move lock in the same order.
- **Start tracking locks the variant `for update`,** and `recordWithin`
  reads it `for share`, so no receipt races it; the start lot is found
  by its note's key, `tracking_started` (`start-lot.ts`), never by words,
  one a code by a partial unique index.
- **Stock back from before tracking is the one exception to "a lot
  exactly when the variant tracks lots":** `fromBefore` writes it with
  no lot, then a lot change into the start lot; `shippedAt` reads the
  shipment's lots.
- **A lot change is a joint in the trace,** as a run is: `movedOnTo`
  follows moves alone (`lot-trace.service.ts`).
- **A lot is searched by `lotMatches` and `lotRank`,** its codes and
  former codes alike (ADR-056); an answer reads former codes by
  `former-codes.ts`.
- **A screen's default for a kind the server may add** says nothing it
  cannot know, "Other change", never a stored key (D4).
