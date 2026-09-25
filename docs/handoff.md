# web-app-foundation — handoff for the next session

Paste this into the new chat. Sync the Project knowledge from the repo first,
so the new session reads current code rather than old copies.

## Where things stand

Multi-tenant B2B SaaS (NestJS + React + Drizzle + PostgreSQL 18), deployed on
Render. Inventory for a natural health products maker: buy → receive → make
under a licence → sell → ship → returns, with lot traceability both ways and
stock held for confirmed sales.

- Version: **0.2.0 tagged**; **0.3.0 not yet tagged** (see "Before tagging").
- Migrations: through **0030** (`shipment_void`).
- Tests at last run: server **425** e2e green (`npm run test:e2e`, which runs
  `--runInBand`); client vitest **72** green (17 files); Playwright **46**
  green, with the e2e server left alone during the run.
- Demo: `cd server && npm run seed:demo` registers a fresh account and seeds
  the whole cycle (licence, purchase, run, retention, shipment, sample,
  return, a backordered second sale). It prints the sign-in.

## Built in the v0.3 milestone (ADR-040 to ADR-045)

- **ADR-040 Licences** — table, dated, derived status; snapshotted onto each
  production run at release.
- **ADR-041 Shipping** — `received` → `fulfilled` for both directions;
  shipments are documents; all-or-nothing; lots out earliest expiry first;
  packing slips. **Amendment: Void shipment** (#23) — see below.
- **ADR-042 Samples** — posted samples are flagged sales (`orders.is_sample`);
  hand-outs are `sample` movements with a checked recipient;
  `locations.is_available` enforced (retention / quarantine bins hold but
  never send).
- **ADR-043 Returns** — against a sale, only lots that shipped on it;
  `quantity_returned` beside fulfilled; lands in a chosen bin. Deferred note
  added: return authorization (RMA) belongs with credit notes in v0.4.
- **ADR-044 Lot trace** — full genealogy read from the ledger through runs;
  recipients including unknown ones; search by code, matching anywhere,
  prefix matches first.
- **ADR-045 Reservations** — holds computed from open confirmed sale lines,
  earliest `confirmed_at` first; enforced on shipping, production release,
  samples and one-off shipments under a per-product advisory lock.
- Also: permission-coverage invariant test, back arrow on detail pages,
  toasts for own actions, responsive layout (drawer below 1200px, action rows
  wrapping as groups, button labels never breaking — done in another session,
  must be in the release notes), Playwright journeys for production, licences,
  shipping.

## Added during the milestone run (this session)

- **Void shipment (#23, closed).** `POST /v1/orders/:id/shipments/:shipmentId/void`
  with a required reason, under `orders.ship`, audited as
  `order.shipment_voided`. One transaction: an `adjustment` per shipment
  movement back into the bin it left (referencing the shipment, reason as
  note), fulfilled quantities lowered (holds return by themselves), shipment
  marked `voided_at` / `voided_by` / `void_reason` and kept. Refused when the
  order is not confirmed, the shipment is already voided, or anything from it
  has been returned. Lot trace and returns ignore voided shipments. Client:
  Void on each shipment card, struck-through voided shipment with reason,
  VOID box on the packing slip, no signature line.
- **Cancel refused once goods have moved** — 409 when any line has a
  fulfilled quantity; the button is hidden. Close the order instead.
- **Returns note** under an order's items: returns do not reopen an item;
  replacements are a new sale.
- **Item names everywhere** — "Focus (60ct)", or the product name when the
  variant has none. One helper per side: `server/src/modules/stock/item-name.ts`
  and `itemName` in `client/src/lib/format.ts`. Shown on inventory, order
  lines (`description` on each line), shipments, returns, packing slip, lot
  trace, variant picker.
- **Live total in the release dialog** — exact sum of hand-picked lot
  amounts as scaled BigInts (`client/src/lib/decimal.ts`, ADR-025); Release
  disabled until every picked line matches. The server check stays.
- **Shared lookups** — `server/src/modules/orders/order-line-lookup.ts`
  (`requestedLines`, `lineFor`, `OrderLine`) for shipments and returns;
  `server/src/modules/stock/tracked-variants.ts` for shipments, returns and
  production.

## Before tagging v0.3.0

1. **Decide: Void after Mark shipped.** Void is refused on a closed order.
   Recommendation: keep it that way for v0.3 and file an issue; in v0.4 the
   lock becomes "until invoiced" (how SAP / NetSuite do it). Workaround now:
   Take a return with the reason "never left — recorded early".
2. **File** the run-close top-up issue (ignores holds; always FEFO instead of
   the lots picked at release) and the Void-after-Mark-shipped issue, if not
   done.
3. **Finish the milestone ritual** (skipped so far, still required):
    - the real week by hand — a purchase order received in two parts, a sample
      hand-out to a partner, a run closed over plan (check the top-up) and one
      under plan (check what is left at the run's location);
    - the recall drill, timed — "blend lot BF-2609 is contaminated — who has
      product made from it?" From lot search to trace to recipient list; note
      the time and what slowed it down. Fix what it finds.
4. **Full test run on a clean tree** — server e2e, client vitest, Playwright,
   then `npm run seed:demo` against a fresh database.
5. **Release notes** — ADR-040 to ADR-045, the responsive layout, Void
   shipment, and the run's fixes (back arrow, lot search, item names, cancel
   refused after goods move, returns note, live total). Known limitations:
   returns recorded on arrival only (no RMA); Void refused after Mark shipped.
6. **Tag** — bump both packages to 0.3.0 in one commit, then
   `git tag -a v0.3.0 -F release-notes.txt` and `git push --follow-tags`.
7. **Re-sync the Project knowledge** from the tagged code.

## Findings from the run

- Wanted an in-app Back — done (back arrow in PageHeader).
- Lot search by the middle of a code ("2609") found nothing — fixed.
- Inventory Item column was always "—" — fixed, and names added to orders,
  shipments and returns.
- Returned beside Outstanding read as a mismatch — note added.
- Cancel was allowed after goods had moved — now refused.
- Ship clicked before the box left had no honest undo — Void shipment built.
- Release dialog only found a wrong lot total when the server refused — live
  total added.
- Void is refused after Mark shipped — workaround is a return; revisit with
  invoicing.
- Not yet run: the real week and the recall drill.

## Open GitHub issues

- #1 intermittent e2e slowness and timeouts
- #16 licence status for suspended, cancelled, superseded
- #17 licence expiry notification (60 days)
- #18 site licences on the organization or a partner
- #19 generated client types from OpenAPI
- #20 `date` column for calendar days
- #22 return authorization (RMA)
- #24 "Mark shipped" reads wrong as the close button
- #25 show what the customer kept (shipped − returned)
- #26 cancel check and update are not one transaction
- To file: run-close top-up; Void after Mark shipped.

Other deferred items (shipping shelf-life rules, carrier integration,
idempotency keys, reservation overrides, supplier returns, recall export,
trigram index, partner activity log) are recorded in the **Deferred**
paragraphs of ADR-041 to ADR-045 and deliberately not filed as issues. File
one only when it is about to be built.

## After the tag (cleanups, not blocking)

- Order line validation (quantity, price, currency) is written in three DTO
  classes, and `POSITIVE_DECIMAL` twice — share a base class.
- Movement `describe()` (+ / − / A → B) is in both the movement history
  dialog and the movements page — move it to one module.
- "Load more" keyset paging is repeated across audit, history, orders,
  products, partners and locations — file an issue for a shared hook.

## Suggested next milestone (v0.4)

Whatever the ritual finds comes first. Then **money**: invoices for
shipments, credit notes for returns (with RMA, #22), cost on lots and
batches, price lists. With invoicing, revisit Void so it is allowed until a
shipment is invoiced, and revisit what Mark shipped is for (#24).

## Working agreements (for Claude)

- Build server first with e2e tests, then the client screens.
- **Ask for Bob's current copy of any existing file before replacing it in
  full**; otherwise give snippets. Full files only for new files, files Claude
  wrote and Bob has not changed, or files Bob has just sent.
- State the exact path of every file; show the tree when several land. Real
  paths: `server/src/modules/orders/`, `server/src/modules/production-orders/`,
  `server/src/modules/stock/`, `client/src/orders/`,
  `client/src/production/`, `client/src/inventory/`,
  `client/src/components/variant-picker.tsx`.
- Commit scripts: explicit `git add` per concern, never `-A`; check
  `git status` for pre-staged files that would sweep into the wrong commit.
  Each commit must build on its own — don't split one file's interleaved
  changes across commits. Messages explain the why, written as one `-m` with
  a subject line, a blank line, and wrapped paragraphs.
- Server e2e: always `npm run test:e2e` (or `--runInBand`) — parallel suites
  share one database and fail at random.
- Don't edit server files while Playwright runs against `start:dev`; watch
  mode restarts it mid-run.
- Migrations that rename a checked value: drop the constraint, update rows,
  re-add — Drizzle generates only the drop and add.
- Quantities stay strings end to end (ADR-025); compare and sum in SQL; cast
  computed values back to `numeric(18, 4)`. On the client, exact sums use
  `client/src/lib/decimal.ts`, never JS numbers.
- Refusals in order: malformed (400), not found (404), not allowed (409).
  Checks run before any write.
- Ship means the box is handed to the carrier; Mark shipped closes the order.
  They are different acts.
- British spelling in comments and copy is intentional.
- At every milestone end, before tagging: look around, a real week by hand,
  a recall drill.