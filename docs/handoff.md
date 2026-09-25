# web-app-foundation — handoff for v0.4 (money)

Paste this into the new chat. The Project knowledge was re-synced from the
v0.3.0 tag, so the new session reads current code.

## Where things stand

Multi-tenant B2B SaaS (NestJS + React + Drizzle + PostgreSQL 18), deployed on
Render. Inventory for a natural health products maker: buy → receive → make
under a licence → sell → ship → returns, with lot traceability both ways and
stock held for confirmed sales. It moves goods; it does not yet move money.

- Version: **0.3.0 tagged** ("make, ship, return, trace"); notes in
  `docs/releases/v0.3.0.txt`.
- Migrations: through **0030** (`shipment_void`). Next is **0031**.
- ADRs: through **ADR-045**. Next is **ADR-046**.
- Tests at the tag: server **425** e2e (`npm run test:e2e`, `--runInBand`);
  client vitest **72**; Playwright **46**. `npm run seed:demo` green.

## v0.4 milestone — money

1. **Invoices for shipments.**
2. **Credit notes for returns**, together with return authorization (RMA, #22).
3. **Cost on lots and batches.**
4. **Price lists.**

Invoicing also settles two open questions:

- **Void until invoiced.** Void is refused on a closed order today; the
  workaround is a return with the reason "never left". The intended rule is
  that Void is allowed until the shipment is invoiced (how SAP / NetSuite do
  it). Not filed as an issue — it is decided in the invoicing ADR.
- **What Mark shipped is for (#24).** Ship means the box went to the carrier;
  Mark shipped closes the order. Once invoices exist, decide whether closing
  stays a separate act, what it is called, and what it locks.

## First step: ADR-046 Invoicing, before any code

Write the ADR in `docs/decisions.md` in the house style (Context, Decision
sections each with the rejected alternative and why, Consequences, Deferred).
No schema or code until it is agreed. Read first:

- **ADR-035** — price and currency on the line; subtotals per currency, not a
  total; line total computed, never stored; returned unrounded (minor units
  are the currency's business); price freezes when the line does.
- **ADR-026** — invoicing gets separate accounting tables keyed by
  `partner_id`, not a fork of `partners`.
- **ADR-028** — the organization's own registered address (needed on an
  invoice) is an owner column on `addresses`: widened check, index, partial
  unique for its default.
- **ADR-041** + Void amendment, **ADR-042** (samples are flagged sales),
  **ADR-043** (returns; RMA deferred note), **ADR-025** (decimals as strings,
  sums in SQL), **ADR-038** (audit names resources as they were).
- Open decisions: exchange rates, "Capture unit cost at receipt", "Per-batch
  cost, and which method values it", production order numbering (and 0023's
  reference column).

Questions the ADR has to answer:

- **Grain.** One invoice per shipment, or one invoice covering several
  shipments of an order (or of a partner)? Can a shipment be split across
  invoices?
- **Currency.** Lines carry their own currency (ADR-035), so a shipment can
  be mixed. One invoice per currency, or refuse mixed?
- **Unpriced lines.** Refuse to invoice, or refuse to ship/confirm unpriced
  sale lines earlier?
- **Lifecycle and immutability.** Draft → issued (→ paid?). What is frozen
  at issue, and is every correction after that a credit note?
- **Numbering.** Sequential per organization, gapless or not, assigned at
  issue rather than at draft; how it is generated safely under concurrency.
- **Snapshots.** What is copied onto the invoice (bill-to address, seller
  address, item names, prices) versus referenced.
- **Tax.** Where rates come from, per-line or per-invoice, and rounding —
  per line or on the total — given the unrounded line totals of ADR-035.
- **Money precision.** `numeric(18, 4)` like quantities, or a separate money
  rule; where rounding to minor units finally happens.
- **Samples.** Posted samples (`is_sample`): a zero invoice, or none?
- **Payments.** In v0.4 or deferred (recording payments, balances, aging)?
- **Purchase side.** Supplier bills and three-way matching now, or sales
  only in v0.4?
- **Void and Mark shipped.** The lock rule, and what #24 becomes.
- **Permissions and audit.** New `invoices.*` permissions (the coverage
  invariant test will demand them), audit actions and labels.
- **Output.** Printable invoice, like the packing slip.

Then, per the delivery approach: server with e2e tests, then the client
screens. Each later item (credit notes + RMA, cost on lots, price lists) gets
its own ADR before code. Note from the open decisions: cost at receipt is
"cheap now, impossible to backfill" — every receipt made before it lands is
a lot without a cost.

## Open GitHub issues

- #1 intermittent e2e slowness and timeouts
- #16 licence status for suspended, cancelled, superseded
- #17 licence expiry notification (60 days)
- #18 site licences on the organization or a partner
- #19 generated client types from OpenAPI
- #20 `date` column for calendar days
- **#22 return authorization (RMA)** — v0.4, with credit notes
- **#24 "Mark shipped" reads wrong as the close button** — v0.4, with invoicing
- #25 show what the customer kept (shipped − returned)
- #26 cancel check and update are not one transaction
- #28 run-close top-up ignores holds and the lots picked at release
- If not yet filed: shared "Load more" keyset paging hook (audit, history,
  orders, products, partners, locations).

Other deferred items live in the **Deferred** paragraphs of ADR-041 to
ADR-045 and are deliberately not issues. File one only when it is about to be
built.

## Carried over from v0.3

- The end-of-milestone ritual was skipped for v0.3 (listed as a known
  limitation). It is required at the end of v0.4: look around, a real week by
  hand (now including invoicing and a credit note), and the timed recall drill
  on BF-2609.

## Working agreements (for Claude)

- ADR before code for each new area; server first with e2e tests, then the
  client screens.
- **Ask for Bob's current copy of any existing file before replacing it in
  full**; otherwise give snippets. Full files only for new files, files Claude
  wrote and Bob has not changed, or files Bob has just sent.
- State the exact path of every file; show the tree when several land. Real
  paths: `server/src/modules/orders/`, `server/src/modules/production-orders/`,
  `server/src/modules/stock/`, `client/src/orders/`,
  `client/src/production/`, `client/src/inventory/`,
  `client/src/components/variant-picker.tsx`, `docs/decisions.md`.
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
- Quantities (and, unless the ADR says otherwise, money) stay strings end to
  end (ADR-025); compare and sum in SQL; cast computed values back to
  `numeric(18, 4)`. On the client, exact sums use `client/src/lib/decimal.ts`,
  never JS numbers.
- Refusals in order: malformed (400), not found (404), not allowed (409).
  Checks run before any write.
- Ship means the box is handed to the carrier; Mark shipped closes the order.
  They are different acts.
- British spelling in comments and copy is intentional.
- At every milestone end, before tagging: look around, a real week by hand,
  a recall drill.