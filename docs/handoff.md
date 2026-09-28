# web-app-foundation — handoff, v0.4 in progress (money)

Paste this into the new chat. Re-sync Project knowledge from `main` first, so
the new session reads current code.

## Where things stand

Multi-tenant B2B SaaS (NestJS + React + Drizzle + PostgreSQL 18), deployed on
Render (no real data there yet). Inventory for a natural health products
maker: buy → receive → make under a licence → sell → ship → invoice → return
and credit, with lot traceability both ways and stock held for confirmed
sales.

- Last tag: **v0.3.0**. v0.4 is in progress, not yet tagged.
- Migrations: through **0032** (`return_authorizations`). Next is **0033**.
- ADRs: through **ADR-047**. Next is **ADR-048**.
- Tests at the last run: server e2e about 540 (`npm run test:e2e`,
  `--runInBand`); client vitest 83; Playwright 58. `npm run seed:demo` green
  and invoices SO-DEMO-1's first shipment as INV-000001.

## v0.4 milestone — money

1. **Invoices for shipments** — done (ADR-046).
2. **Credit notes for returns, with RMA (#22)** — done (ADR-047).
3. **Cost on lots and batches** — next. ADR-048 before any code.
4. **Price lists** — after that, its own ADR.

Then the end-of-milestone ritual, **required this time** since v0.3 skipped
it: look around; a real week by hand, including an invoice, an RMA, a partial
credit and a replacement; the timed recall drill on BF-2609. Then tag v0.4.0.

## What v0.4 built (read these before ADR-048)

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

**Organization and tax codes.** `core/organizations/` holds the tenant's
registered address (an owner column on `addresses`) and tax number;
`modules/tax-codes/`. Settings pages under the account menu.

**Client.** `useCan()` with a typed `Permission` union
(`client/src/auth/permissions.ts`); `server/scripts/check-client-permissions.js`
fails CI when the two lists differ. Pages for one record are
`*-detail-page.tsx`. Print pages share `invoices/print-sheet.tsx`.

## ADR-048 — cost on lots: what to read first

- Open decisions in `docs/decisions.md`: **"Capture unit cost at receipt"**
  (cheap now, impossible to backfill) and **"Per-batch cost, and which method
  values it"**; also **exchange rates** (ADR-035), since purchase prices may be
  in another currency.
- ADR-035 (price and currency on order lines), ADR-025 (decimals as strings,
  sums in SQL), the production ADRs (runs consume component lots and produce a
  batch lot), ADR-045 (holds).
- Questions it has to answer: where cost is captured (receipt from the order
  line; adjustments; production output); the unit (per lot, per base unit of
  measure); currency and conversion at receipt; how a batch's cost is built
  from the component lots it consumed; whether the valuation method (actual per
  lot, FIFO, weighted average) is decided now or deferred; what corrects a
  wrong cost; and what it means for returns and write-offs.

## Open GitHub issues

- #1 intermittent e2e slowness and timeouts
- #16 licence status for suspended, cancelled, superseded
- #17 licence expiry notification (60 days)
- #18 site licences on the organization or a partner
- #19 generated client types from OpenAPI (would also replace the client's
  copied permission list)
- #20 `date` column for calendar days (invoices and credit notes already use
  `date`; the older columns do not)
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
  breakpoint, or move the drawer to `xl`.
- Check ADR-047's audit list names `return_authorization.replacement_raised`.

## Working agreements (for Claude)

- ADR before code for each new area; server first with e2e tests, then the
  client screens; each step its own commit.
- **Ask for Bob's current copy of any existing file before replacing it in
  full**; otherwise give snippets. Full files for new files, files Claude wrote
  that Bob has not changed, or files Bob has just sent.
- State the exact path of every file. Real paths: `server/src/modules/…`,
  `server/src/core/…` (organizations, audit, authorization), `client/src/…`
  (`invoices/`, `rmas/`, `orders/`, `settings/`, `auth/permissions.ts`),
  `docs/decisions.md`.
- Commit scripts: explicit `git add` per concern, never `-A`; check `git status`
  for staged files that would sweep into the wrong commit (a staged-then-deleted
  file is still committed). Each commit must build on its own. Messages explain
  the why, as one `-m` with a subject, a blank line and wrapped paragraphs.
- Server e2e: always `npm run test:e2e` (`--runInBand`). Don't edit server files
  while Playwright runs against `start:dev`.
- **Drizzle writes a column without its table name when a query has no joins.**
  Inside a correlated subquery, name the outer row in plain SQL
  (`return_authorization_lines.id`), never `${table.column}` — a bare name binds
  to the subquery's own tables. This caused a real bug in RMA progress figures.
- Quantities and money stay strings end to end (ADR-025); compare and sum in
  SQL; the client never does decimal arithmetic.
- Refusals in order: malformed (400), not found (404), not allowed (409), all
  before any write. Ids from a body that belong to another tenant are 400.
- Every write route is audited or listed in `NOT_AUDITED` with a reason; every
  route has `@RequirePermissions`; never seed a permission nothing gates. New
  permissions default to Owner-only.
- Client: dialogs take permission flags from their page rather than reading the
  session, so they stay testable alone. `useSubmit`'s callback takes no result —
  keep ids in a `useRef`. Hooks never inside hooks or after an early return.
- Playwright: `getByLabel` matches substrings and aria-labels; prefer
  `getByRole(…, { name, exact: true })`. Toasts have their own "Close" button.
- British spelling in comments and copy is intentional.