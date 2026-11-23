---
paths:
  - "server/src/modules/stock/{lot-changes,lot-tracking,lot-trace,lots}.service.ts"
  - "server/src/modules/stock/{lot-tracking,lot-trace}.controller.ts"
  - "server/src/modules/stock/{start-lot,lot-search,lot-allocation,open-run}.ts"
  - "server/src/modules/stock/dto/{movement-lot,move-to-lot,start-lot-tracking,update-lot,lot-trace-response,lot-tracking-response}.dto.ts"
  - "server/src/modules/numbering/lot-codes.ts"
  - "server/src/database/schema/lots.ts"
  - "server/test/{lot-changes,lot-trace,lot-tracking,lots-at-receipt}.e2e-spec.ts"
  - "client/src/inventory/{lot-input.ts,lot-received.ts,lot-expiry.ts,lot-fields.tsx,lot-marks.tsx,lot-taken.tsx,edit-lot-dialog.tsx,move-to-lot-dialog.tsx}"
  - "client/src/costs/lot-cost-panel.tsx"
  - "client/e2e/lots-at-receipt.spec.ts"
---

# Lots: the code rules, for Claude

It loads when Claude reads, writes or edits a file its `paths` match.

What to keep true when changing lots at receipt, tracking started and a
move between lots (ADR-094). What lots allow, refuse and work out is in
[`docs/rules/stock.md`](../../docs/rules/stock.md) and
[`products.md`](../../docs/rules/products.md), updated with the rule it
states (ADR-087).

- **A made code is taken in the caller's transaction,** `takeLotCode`
  (`lot-codes.ts`), by the organization's today, one counter for the
  organization; a code the item already has is passed over. Its format
  is `numbering-format.ts`'s, capitals, digits and hyphens, at most 20
  with its digits; the client's `numbering.ts` is held level by tests.
- **`MovementLotDto` says what a lot is,** an id, a typed new code or
  one to make; `mustBeNew` comes from the route, never the reason.
- **`lots.expiry` is `date`, `unknown` or `none`,** `expires_at` set
  exactly for `date`; `unknown` is usable, never expired and never first
  to expire. Migration 0084's trigger is temporary (Q5a): the handoff
  names the migration that drops it.
- **The supplier's lot is for a lot made here,** and the mark
  (`stock.lot_made_here`) is one way, audited, never undone.
- **A lot change is one `lot_change` movement and two value rows of
  their own kind** (`lot-changes.service.ts`): the stock card counts it
  in neither In nor Out, `changeOf` by its reason, and both pools are
  locked `inLotOrder` after the variant row.
- **A lot issued to an open run is not moved** (`open-run.ts`, one
  query for the refusal and the pile's `issuedToRun`).
- **A late cost follows stock moved on,** by what the lot held when it
  moved (`revaluation.ts`, D5): never a variance, and the row
  in takes no cost by hand. A cost and a move lock in the same order.
  `plan` works a pool's rest out after its hops, less what it counted
  there already; `write` then writes the rows.
- **Start tracking locks the variant `for update`,** and `recordWithin`
  reads it `for share`, so no receipt races it; the start lot is found
  by its note's key, `tracking_started` (`start-lot.ts`), never by words.
- **Stock back from before tracking is the one exception to "a lot
  exactly when the variant tracks lots":** `fromBefore` writes it with
  no lot, then a lot change into the start lot; `shippedAt` reads the
  shipment's own lots.
- **A lot change is a joint in the trace,** as a run is: every join in
  `lot-trace.service.ts` names the organization, and `movedOnTo` follows
  moves alone.
- **A lot is searched by `lotMatches` and `lotRank`,** over its code and
  its supplier's lot, the start first (ADR-056).
- **A screen's default for a kind or reason the server may add** says
  nothing it cannot know, "Other change", never a stored key (D4,
  `docs/conventions.md`).
