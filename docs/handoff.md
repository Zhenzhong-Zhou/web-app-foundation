# web-app-foundation — handoff, v0.4 in progress (money)

Paste this into the new chat. Re-sync Project knowledge from `main` first, so
the new session reads current code.

## Where things stand

Multi-tenant B2B SaaS (NestJS + React + Drizzle + PostgreSQL 18), deployed on
Render (no real data there yet). Inventory for a natural health products
maker: buy → receive → make under a licence → sell → ship → invoice → return
and credit, with lot traceability both ways, stock held for confirmed sales,
and now every movement valued.

- Last tag: **v0.3.0**. v0.4 is in progress, not yet tagged.
- Migrations: through **0033** (`stock_valuation`). Next is **0034**.
  After any new migration: `npm run migrate:all` (dev, test and e2e).
- ADRs: through **ADR-048**. Next is **ADR-049**.
- Tests at the last run: server e2e 552 in 30 suites (`npm run test:e2e`,
  `--runInBand`); client vitest 83; Playwright 58. `npm run seed:demo` green:
  BF-2609 values at 1900.00 CAD, the run's 34 kg consumption at −1292.00, and
  the 980 bottles of FOC-2609-01 sit at zero marked `needs_cost` until run
  close is valued (step 2).
- **Render is down.** The free Postgres expired (Render suspends a free
  database after 30 days and deletes it 14 days later; it cannot be
  reactivated, only upgraded or replaced). The web service's last deploy
  failed about a day *before* the database was suspended, so read that
  deploy's log first — the cause is something else. Then: new database in
  Oregon, its internal URL into `DATABASE_URL`, redeploy (migrations build
  0000–0033 from empty). A free database will expire again in 30 days; a
  paid instance, or a provider whose free Postgres does not expire (must
  support PG 18 for `uuidv7()`), if the deployed copy matters — it does for
  the end-of-milestone week.

## v0.4 milestone — money

1. **Invoices for shipments** — done (ADR-046).
2. **Credit notes for returns, with RMA (#22)** — done (ADR-047).
3. **Cost on lots and batches** — in progress (ADR-048).
    - Server step 1, the valuation write path — **done**.
    - Server step 2 — **next** (below).
    - Client screens after that.
4. **Price lists** — after that, its own ADR.

Then the end-of-milestone ritual, **required this time** since v0.3 skipped
it: look around; a real week by hand, including an invoice, an RMA, a partial
credit, a replacement, a foreign-currency purchase and a batch costed end to
end; the timed recall drill on BF-2609. Then tag v0.4.0.

## What v0.4 built

**ADR-046 — invoicing.** An invoice bills exactly one shipment; draft →
issued → voided. Issuing takes a gapless per-organization number
(`document_sequences`, upsert inside the transaction, `INV-`/`CN-`/`RMA-`),
stores every amount, and copies seller, bill-to and ship-to. Amounts are one
SQL calculation (`invoice-amounts.ts`) shared by the draft preview and issue:
nets rounded to the currency's minor units (from `Intl`), tax per component
rounded once per invoice. Tax codes carry one or more components; "Exempt" is
a code with none. A sale must be priced (zero allowed) and single-currency at
confirm; samples are exempt and never invoiced. Void issues a full credit note
and frees the shipment. Void shipment is refused while an invoice stands, and
reopens a closed order. "Mark shipped/received" became "Close order" (#24).

**ADR-047 — RMAs and credit notes.** An RMA is its own document, authorized
when raised, with a resolution per line (credit / replace / none) and
optionally the invoice the customer quoted. A return may name an RMA and is
held to it; a return without one is still recorded and can be linked later,
once. Credit notes credit part of one invoice: quantity and a unit price that
may be lowered, never raised; capped by value per invoice line, by tax
component (using `invoice_line_taxes`, the rates charged at issue), and by
quantity per RMA line. Preview and issue share one calculation; there is no
draft credit note. Void is refused once anything is credited. Replacement is
a draft sale at zero, linked to the RMA. The uncollectable stopgap is a full
credit with no RMA (payments are deferred).

**ADR-048 — cost: value is a ledger, like quantity.** Chosen over computing
cost on read, because reported months must not change when a price is
corrected, and valuing all stock must be one scan. The shape:

- `stock_valuations` is append-only, one row per event that changes value.
  Kinds: `movement`, `run_close`, `correction`, `opening`. Quantity and value
  are signed; value is in the base currency, `numeric(18,6)`. Acquisitions
  carry `unit_price`, `currency` and the applied `exchange_rate` as a
  snapshot. `needs_cost` marks a row valued at zero for want of a price, a
  rate or a run's close.
- `valuation_pools` is the cache and the lock, exactly as `stock_levels`
  is. One row per lot, or per variant without lots (`NULLS NOT DISTINCT`),
  holding quantity and value. Not per location, so transfers write nothing.
- Method: weighted average within a pool. For tracked stock that is actual
  cost per batch. The last unit out takes the pool's remaining value, so
  rounding never strands value in an empty pool.
- `organizations.base_currency` is fixed once any valuation carries a value
  or a rate. `exchange_rates` holds one rate per currency per day, entered,
  never fetched.
- Permissions `costs.view` and `costs.update`, Owner-only (arrive in step 2).

**ADR-048 step 1 — built (commits `e873758`, `b79681a`).**

- `server/src/modules/stock/valuation.ts`: `valueMovement()`, called from
  `StockService.recordWithin` after the movement insert, so value and
  quantity share one write path.
- How each movement is valued:
    - **Receipt against a priced purchase line** — the line's price, copied as
      a snapshot, × the latest rate on or before today. The rate lookup uses
      the database's UTC day; see #20.
    - **Receipt with no price, no rate or no base currency** — zero and
      `needs_cost`, never refused.
    - **Return** — the unit cost it shipped at on that order's non-voided
      shipments.
    - **Voided shipment's reversal** — an inbound adjustment referencing the
      shipment, at the cost it left at.
    - **Other inbound adjustment** — the pool's average, or zero and
      `needs_cost` for an empty pool.
    - **Production output** — zero and `needs_cost`.
    - **Every outbound** — the pool's average.
- Migration 0033 opened every pool holding stock at zero with an `opening`
  row.
- `PATCH /v1/organization` takes `baseCurrency`; it answers 409 once
  anything is valued in it.
- `server/test/valuation.e2e-spec.ts` reconciles after every test: each
  pool equals its valuations in quantity and value, its quantity equals its
  stock levels, and no stock sits outside a pool.

**Organization and tax codes.** `core/organizations/` holds the tenant's
registered address (an owner column on `addresses`), tax number and base
currency; `modules/tax-codes/`. Settings pages under the account menu.

**Client.** `useCan()` with a typed `Permission` union
(`client/src/auth/permissions.ts`); `server/scripts/check-client-permissions.js`
fails CI when the two lists differ, so new server permissions land with the
client list in the same commit. Pages for one record are
`*-detail-page.tsx`. Print pages share `invoices/print-sheet.tsx`.

## ADR-048 step 2 — next (server, then e2e)

Read ADR-048 in `docs/decisions.md` and `valuation.ts` first.

1. **Run close posts the batch's cost.**
    - Material cost is minus the sum of the run's consumption valuations
      (`stock_movements` by reference, joined to `stock_valuations`). Unit
      cost is that ÷ `quantity_produced`.
    - For each output lot, a `run_close` row adds unit cost × what is still
      in the pool.
    - For output that left before close, a `correction` row goes against
      each outbound movement that took it.
    - A run that produced nothing has a material cost and no unit cost.
2. **`PUT /v1/stock/movements/:id/cost`** — receipts and inbound adjustments
   only, 409 otherwise. It posts a `correction` for the difference: the
   share still held revalues the pool; the share already gone is a variance
   on issued stock. Audited as `stock.movement_cost_set` with `{ from, to }`.
   This is also how a rate entered later is applied to a `needs_cost`
   receipt.
3. **Exchange rates** — routes to list and set rates, refusing the base
   currency itself. Audited as `exchange_rate.set`.
4. **Permissions** — `costs.view` and `costs.update`, Owner-only, with the
   client list.
5. **Reads** — a lot's cost, a run's cost, stock valuation, and the
   needs-cost list. Each figure is marked provisional while a `needs_cost`
   row it depends on stands.

Decide these before writing code:

- **What resolves a `needs_cost` row.** Proposed: a later `correction`
  referencing its movement, or a `run_close` referencing its run.
- **Where the variance on stock already gone lives.** It must not be summed
  into the pool, or the reconciliation fails. Either a kind of its own
  (`variance`), which means migration 0034 and a schema-test row, or a rule
  that excludes it.

## Open GitHub issues

- #1 intermittent e2e slowness and timeouts
- #16 licence status for suspended, cancelled, superseded
- #17 licence expiry notification (60 days)
- #18 site licences on the organization or a partner
- #19 generated client types from OpenAPI (would also replace the client's
  copied permission list)
- #20 `date` column for calendar days (invoices and credit notes already use
  `date`; the older columns do not — the rate lookup at receipt reads the
  UTC day for this reason)
- #25 show what the customer kept (shipped − returned)
- #26 cancel check and update are not one transaction (the sale confirm checks
  share this race and close with it)
- #28 run-close top-up ignores holds and the lots picked at release
- Shared "Load more" keyset paging hook, if filed: the same `loadMore` is now in
  eight or more pages, invoices and returns included.

## Left over, small

- **Pro forma invoices** — deferred in ADR-046; remind Bob. Bring forward if the
  business needs them for customs, prepayment or sample values.
- **Translation** — noted in Open decisions: the app's screens, and separately
  the printed documents (Quebec is the likely trigger).
- `issue()` in `invoices.service.ts` sets `taxCodeName` with a correlated
  subquery written through Drizzle; it works only because `tax_codes` has no
  `tax_code_id` column. Qualify it in plain SQL when that file is next touched
  (see below).
- The top bar now has nine links; check it still fits just above the `lg`
  breakpoint, or move the drawer to `xl`. Cost pages will add to it.
- Check ADR-047's audit list names `return_authorization.replacement_raised`.
- ADR-048 deferrals worth remembering: propagating corrections through closed
  runs, period close, landed cost, conversion cost, FIFO, export to the books.
  The weighted-average method should be confirmed with the accountant before
  figures feed financial statements.

## Working agreements (for Claude)

**How code is delivered**
- **Every answer that changes files opens with a roadmap:** a tree or
  relative paths, each marked **new**, **full replacement** or **snippet**.
- **New files, and changes touching several places or a large chunk of one
  file, come as full downloadable files** — not pasted into the chat. Only a
  single small change stays inline as a snippet.
- Full replacements are made from Bob's current copy. Project knowledge
  counts once Bob says he has resynced from `main`; otherwise ask first.
- State the exact path of every file. Real paths: `server/src/modules/…`,
  `server/src/core/…` (organizations, audit, authorization),
  `server/src/database/schema/…`, `server/src/database/migrations/…`,
  `server/test/…`, `client/src/…` (`invoices/`, `rmas/`, `orders/`,
  `settings/`, `auth/permissions.ts`), `docs/decisions.md`.

**Process**
- ADR before code for each new area; server first with e2e tests, then the
  client screens; each step its own commit.
- Migrations: write the schema, run `npm run migrate:new -- --name <name>`,
  append hand-written parts (triggers, backfills) after a
  `--> statement-breakpoint`, then `npm run migrate:all`. Check the generated
  SQL keeps `NULLS NOT DISTINCT` where the schema asks for it.

**Commits**
- Explicit `git add` per concern, never `-A`. Check `git status` for staged
  files that would sweep into the wrong commit: a staged-then-deleted file is
  still committed, and a new file staged early (even empty) rides into
  whichever commit runs first.
- Each commit must build on its own. When there are several, check their
  order in `git log --stat` before pushing.
- Messages explain the why, as one `-m` with a subject, a blank line and
  wrapped paragraphs.
- To reorder unpushed commits: `git reset --soft <base>`, restage per
  commit, and `git commit -C <old-hash>` to reuse each message.

**Server**
- Server e2e: always `npm run test:e2e` (`--runInBand`), plus
  `npm run format:check` and `npm run lint` before committing. Don't edit
  server files while Playwright runs against `start:dev`.
- **Drizzle writes a column without its table name when a query has no
  joins.** Inside a correlated subquery, name the outer row in plain SQL
  (`return_authorization_lines.id`), never `${table.column}` — a bare name
  binds to the subquery's own tables. This caused a real bug in RMA progress
  figures. Raw SQL with every table aliased avoids it.
- Quantities and money stay strings end to end (ADR-025); compare and sum in
  SQL; the client never does decimal arithmetic. Values round to six places
  in SQL; the last unit out of a pool takes what is left.
- Refusals in order: malformed (400), not found (404), not allowed (409), all
  before any write. Ids from a body that belong to another tenant are 400.
- Every write route is audited or listed in `NOT_AUDITED` with a reason; every
  route has `@RequirePermissions`; never seed a permission nothing gates. New
  permissions default to Owner-only.

**Client and copy**
- Dialogs take permission flags from their page rather than reading the
  session, so they stay testable alone. `useSubmit`'s callback takes no
  result — keep ids in a `useRef`. Hooks never inside hooks or after an early
  return.
- Playwright: `getByLabel` matches substrings and aria-labels; prefer
  `getByRole(…, { name, exact: true })`. Toasts have their own "Close" button.
- British spelling in comments and copy is intentional.