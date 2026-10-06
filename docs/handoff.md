# web-app-foundation — handoff, v0.5.0-rc.1 tagged, ADR-052 and ADR-053 merged, ADR-054 written

Paste this into the new chat. Re-sync Project knowledge from `main` first, so
the new session reads current code.

## Where things stand

Multi-tenant B2B SaaS (NestJS + React + Drizzle + PostgreSQL 18), deployed on
Render. Inventory for a natural health products maker: buy → receive → make
under a licence → sell → ship → invoice → return and credit, with lot
traceability both ways, stock held for confirmed sales, every movement valued,
and price lists proposing the price of a new line.

- Tagged **v0.4.0-rc.1** (pre-release), deployed on Render. The final
  v0.4.0 waits for the walkthrough, a real week by hand and the BF-2609
  recall drill, run against rc.1 when Bob has time. Fixes they find go on
  `release/v0.4` (branched from rc.1), v0.4.0 is tagged there, and the
  fixes are cherry-picked into `main`.
- Tagged **v0.5.0-rc.1** (pre-release) on `main` after PR #38 (ADR-051
  part 2). The Performance workflow ran on `main` on 2 October 2026 at small
  scale and passed. Its notes are a GitHub pre-release only;
  `docs/releases/v0.5.0.txt` is written at v0.5.0's final.
- Migrations: through **0038** (`calendar_days`, ADR-052), on `main`;
  Render runs it on deploy (confirm in the deploy log, *In flight* below).
  Next is **0039**.
  After any new migration: `npm run migrate:all` (dev, test and e2e).
- ADRs: through **ADR-053**, all built and merged: ADR-050 (licence status
  at release), ADR-051 (performance), ADR-052 (calendar days as `date`,
  #20) and ADR-053 (backups, phase 1). ADR-050, ADR-052 and ADR-053 carry
  amendments for what was settled while building; ADR-046 carries one (one
  currency per sale from the first priced line). **ADR-054** (languages)
  is written on `adr-054-languages`, not built yet. Next is **ADR-055**.
- Tests at the last local run (ADR-050 branch, 2 October 2026): server e2e
  627 in 33 suites (`npm run test:e2e`); server unit 36 in 6 files
  (`npm test`); client vitest 160 in 35 files; Playwright 63. CI also runs
  `seed:demo`.
- `npm run seed:demo`: BF-2609 valued at 1900.00 CAD, run FOC-2609-01 costed
  at 1292.00 over 980 bottles (1.318367 each), SO-DEMO-2 priced from the
  Wholesale CAD list (the organization default). It also leaves an RMA
  received and credited on SO-DEMO-1, a voided shipment, and PO-DEMO-2
  bought in USD at a rate of 1.37.
- **Render is up.** The database `foundation-db` is on the **Free plan**:
  no backups of its own, and it expires 30 days after creation — note the
  date here. Used only to test with until real data; then a paid plan
  (ADR-053, phase 2). Migrations 0000–0037 confirmed; 0038 with the #20
  deploy.

## v0.4 milestone — money

1. **Invoices for shipments** — done (ADR-046).
2. **Credit notes for returns, with RMA (#22)** — done (ADR-047).
3. **Cost on lots and batches** — done (ADR-048, server and client).
4. **Price lists** — done (ADR-049, server and client). Margin deferred by
   amendment: both an estimated margin (price against current pool cost) and
   an actual one (invoice revenue against the shipped lots' valuation rows)
   are derivable without a migration; the first real week decides which to
   build.

Then the end-of-milestone ritual, **required this time** since v0.3 skipped
it:
- look around;
- a real week by hand, including:
    - an invoice, an RMA, a partial credit and a replacement;
    - a foreign-currency purchase, and a rate entered for it;
    - a costed batch;
    - a list-priced sale;
- the timed recall drill on BF-2609.

Then tag v0.4.0.

## Now: v0.5, maintainability and languages

1. **Maintainability, step 1 — done** (the commits after `v0.4.0-rc.1` on
   `main`, one extraction or fix each). What moved where, the behaviour
   settled on the way, and the test gaps found are in the section below.
2. **Maintainability, rounds 2 and 3 — done** (PR #36, merged; tagged
   `v0.5.0-alpha.1`): the section after step 1's. What is left is listed
   at its end; none of it is half-done.
3. **ADR-050, licence status at release** — built, merged (PR #39) and
   deployed: migration 0037; release checks the recipe's licence
   against the organization's policy (Settings → Organization → Licences at
   release); an expired or not-yet-in-force licence can be overridden with a
   reason by whoever holds `production.override_licence` (Owner-only); the
   run records the state, the overrider and the reason, shown on the run
   page and in the lot trace. Manual checks MC-506 and MC-508 to MC-511.
4. **ADR-051, performance testing** — built and merged (PR #38), tagged
   `v0.5.0-rc.1`: `seed:volume`, `npm run perf`, `npm run perf:plans`, the
   Performance workflow, and the fixes the first runs asked for. Results,
   what to watch and the production items, each with a trigger, are in
   ADR-051's **Results**.
5. **ADR-052, calendar days as `date` (#20)** — built and merged (PR #40):
   migration 0038; lot expiry, an
   order's expected date and a licence's dates are `date`, sent and
   returned as `YYYY-MM-DD`. `CALENDAR_DAY_INPUT` (strict by default, or
   lenient) decides whether an instant at UTC midnight is still accepted.
   `todayUtc()` (`server/src/common/today.ts`) is the server's one "today":
   licence status at release and the receipt rate lookup ask it.
   `utcMidnight` is gone from the client; MC-R04 is its manual check.
6. **ADR-053, backups** — phases 0 and 1 done. Phase 0 by hand: Render is
   on the Free plan (no backups, expires after 30 days), one manual
   encrypted dump restored locally with both organizations back. Phase 1
   merged: `scripts/backup.sh`, `restore.sh`,
   `backup-latest.sh`; `.github/workflows/backup.yml` (10:00 UTC, plus a
   26-hour freshness check) and `restore-drill.yml` (the 1st); the runbook
   `docs/runbooks/restore.md`; MC-1301 to MC-1304. Testing with
   `BACKUP_DESTINATION` unset (Actions artifacts); `s3` and a paid database
   plan before real customers' data.
7. **ADR-054, languages** — written, not built. `en`, `fr-CA` and
   `zh-Hans`. Two settings: the person's language (`users.locale`, null
   meaning the browser's) and the document languages, one or two (French
   with English, Chinese with English), the partner's pair else the
   organization's, stored on the shipment, invoice and credit note.
   Product and variant names may be kept in other languages
   (`product_translations`, `variant_translations`); the organization
   chooses which are required (Chinese, say), checked at issue. No French
   names unless the advisor asks for them.
   FormatJS on both sides with explicit ids and English as the default;
   the server translates in `AllExceptionsFilter` by `Accept-Language`, so
   a request without it is English as today. Built in the ADR's seven
   steps, server first: migration **0039**.

   Where it stands: the server (step 1, migrations 0039 and 0040), the
   client foundations (step 2), and step 3 complete: every screen speaks
   English, French and Chinese, each folder translated as its strings
   moved (glossary first, `docs/glossary.md`), with the organization's
   and each partner's document languages and the required product names
   on screens of their own. Step 4, the fluent review (MC-1405), is
   outstanding. Next is step 5, printed documents: the print sheet, the
   packing slip, the invoice and the credit note are the only pages still
   in English, and the lint rule's ignore list names them. The audit log
   spells out most action and field names from the server's keys, in
   English until step 6.

   Added to the plan while building, not in the ADR's list:
   - **`seed:demo`**, after step 5: a Quebec customer printing French and
     English, a Chinese customer printing Chinese and English, Chinese
     and French names on a few demo products, one bilingual invoice
     issued, so MC-1407 to MC-1409 walk on a fresh database.
   - **`seed:volume`**, in step 7: some product translations, then the
     ADR-051 budgets re-run, since issuing now reads them.
   - **`docs/conventions.md`**, in step 7: "Adding text" — an id named by
     feature folder, the English beside it, `npm run i18n:extract`, then
     French and Chinese with ’ rather than '.

## What v0.4 built

**ADR-046 — invoicing.**
- An invoice bills exactly one shipment; draft → issued → voided.
- Issuing takes a gapless per-organization number (`document_sequences`,
  `INV-`/`CN-`/`RMA-`), stores every amount, and copies seller, bill-to and
  ship-to.
- Amounts are one SQL calculation (`invoice-amounts.ts`) shared by preview
  and issue. Nets are rounded to the currency's minor units; tax per
  component is rounded once per invoice.
- A sale must be priced and single-currency at confirm. Samples are never
  invoiced.
- Void issues a full credit note.

**ADR-047 — RMAs and credit notes.**
- An RMA has a resolution per line (credit / replace / none).
- A credit note credits part of one invoice. It is capped by value, by tax
  component, and by RMA quantity.
- Replacement is a draft sale at zero.

**ADR-048 — cost: value is a ledger, like quantity.**
- `stock_valuations` is append-only. Kinds: `movement`, `run_close`,
  `correction`, `issued`, `opening`. `issued` is value belonging to units
  already gone, kept out of the pool's balance.
- `valuation_pools` is the cache and lock, per lot or per untracked variant.
- The method is weighted average within a pool, so lot-tracked stock carries
  its actual cost per batch.
- How value arrives:
    - A receipt copies its line's price × the latest rate on or before the
      server's today, the UTC day (`todayUtc`, ADR-052).
    - Run close posts the batch's material cost to its output.
    - A correction (`PUT /v1/costs/valuations/:id`) splits the difference
      between stock held and stock gone.
    - `needs_cost` is cleared by a later row, never edited.
- `organizations.base_currency`, fixed once anything carries a value.
- `exchange_rates`: one per currency per day.
- `costs.view` and `costs.update`, Owner-only.
- Screens:
    - Stock value and its needs-cost list;
    - exchange rates;
    - cost panels on runs and lot traces.

**ADR-049 — price lists: a default the line keeps.**
- A list has one currency and one direction (sale / purchase).
- A partner names a sale list and a purchase list; the organization names a
  default sale list.
- A line added without a price copies its list's price, and records
  `price_source` and `price_list_id`. Nothing reads the list again.
- A sample never takes a list price. A currency clash leaves the line
  unpriced, with a notice. A duplicate keeps its source's prices.
- "Use list price" (`POST …/lines/:lineId/list-price`) is the explicit
  refresh.
- `price_lists.view`, `.create` and `.update`, Owner-only.
- Open decisions: quantity breaks and dated prices. Both would arrive as new
  columns with defaults.

**Test harness (#1, closed).**
- `createTestApp` listens once on 127.0.0.1. Supertest's per-request
  ephemeral port could be answered by another process on macOS.
- Each e2e run takes an advisory lock on the test database, so a second run
  refuses to start instead of truncating the first one's tables.
- `server/scripts/e2e-flake-hunt.sh N [suite]` reruns and summarises
  failures.

**Dependencies.** Minor and patch updates were taken directly with
`npm update`. The client is on msw 3: `onUnhandledFrame: 'error'` in
`src/test/setup.ts`.

## Maintainability, step 1 — done

Found with jscpd, fixed in the plan's order: shared client code, shared
server code, test helpers, then the largest files. Code-only clones went
from 186 to 92 (tsx) and 312 to 261 (typescript); what is left is mostly
kept on purpose (schema column declarations, create/update DTO pairs,
repeats inside one spec) or form plumbing. `.jscpd.json` holds the paths and
ignores the migration snapshots, so a plain `npx jscpd` gives the report.

**Reviewed and kept — jscpd still reports these; each was read and left on
purpose.** Do not re-review them unless the code around them changes:
- Create and update DTO pairs (address, contact, partner, variant, licence,
  location): required against optional; each DTO states its own shape.
- Controller import headers and schema column blocks: declarations, not
  rules.
- `lib/types.ts` against `costs.e2e-spec.ts`, and `audit/audit-format.ts`
  against `audit.e2e-spec.ts`: separate packages; #19 replaces the types.
- Login, register and reset: their form-state and submit blocks skip
  `useSubmit` because they navigate away on success. Forgot-password keeps
  its own message: it must not repeat the server's words.
- The login and forgot-password email field, the two order-line price
  fields, and the "Into" location select in the receive dialogs: two
  copies each, with different help text.
- List pages' loading and empty frames: they vary in skeleton rows and
  wording; a component would need a prop for each difference.
- Dialog plumbing (imports, `useSubmit`, `close`, `handleSubmit`, the
  `update(field)` helper): sharing it would mean a form framework.
- `products/variant-row.tsx` keeps its own `Detail` (label beside value, a
  spec sheet); `LabelledValue` is caption above value.
- The cost panels' top (the `useResource` guard and a six-line heading) and
  the run cost panel's two tables (different columns).
- The packing slip's lot table: `LotItemsTable` links each lot, and on
  paper a link only prints as an underline.
- Stock value's needs-cost list stays off `useKeysetList`: it is read with
  the valuation under one banner. The multi-read pages (order detail,
  members, inventory, exchange rates) stay off `useResource` for the same
  reason.
- Two order lookups stay outside `loadOrder`: one joins the partner for its
  columns, one runs outside a transaction through `TenantDb`.
- Repeats inside a single spec: each test should read on its own.
- `stock.e2e-spec.ts` keeps its own `createLocation` (its own defaults; the
  name also clashes with the fixture).
- `lockOpen` against `lockForReceipt`, and `lockDraft` against void's lock:
  the same lock query, different rules. A path id answers 404, a body id
  400; the allowed statuses differ; the receipt adds order and goods
  checks.
- Ship's and receive's counter updates on the order line: two limits and
  two constraints (ordered against shipped). Each says so in a comment.
- Closing and reopening a line: the same "confirmed only" skeleton, each
  with its own message.
- The order list against order detail, and the two invoice-line reads in
  issuing and in `InvoicesService`: different columns.
- `users.e2e-spec.ts` keeps its own `addMember` (it returns more than an
  agent).
- `boms/boms.service.ts` stays one service: a separate lines service would
  first need `insertLines`, `assertNoCycle`, `assertDraft` and `loadWithin`
  shared across two files. Revisit if it gains a second job, such as
  costing a recipe.
- The recipe panel's version header stays in the panel (about eight props
  and handlers to pull it out).

The layout stays feature-first. Do not regroup into `pages/`, `components/`,
`utils/` by type; `components/` holds only what two or more features share.

## Maintainability, rounds 2 and 3 — done

On PR `v0.5-round-2`, one extraction or fix per commit. Most of it was
written from the repo without running anything. Bob ran every suite
locally after round 3, all green, and `lint --fix` applied Prettier where
code had been formatted by hand.

- **Round 2.** The returns/shipments pairs: the lock order became
  `inVariantOrder` (production's release uses it too) and what a document
  moved became `lot-items.ts`; the counter updates stayed apart, with a
  comment. Shipments, RMAs and stock split into the services listed under
  shared pieces. Test gaps: every shared lookup has a cross-tenant test;
  `minorUnits` and `inVariantOrder` have unit tests (the rest of those
  files runs in SQL, covered by e2e). Whether an expired licence stops a
  release became ADR-050.
- **Round 3, from jscpd.** Fixes first, then extractions: the Owner rules
  in `users.service.ts`, a draft BOM's line, a location that can take
  children, a partner's default address and primary contact, TenantDb's
  ordering and limit; then the decimal and calendar-day decorators; then
  `roleIdNamed`, `addMember` and `addViewer` into the fixtures.

**Size review (the four largest files left, judged by jobs, not lines):**
- `orders/orders.service.ts` (700): split. `OrdersService` keeps the reads;
  `OrderLifecycleService` has create, duplicate and update.
- `invoices/credit-notes.service.ts` (599): one job, kept; its 360-line
  calculation moved to `credit-amounts.ts` (`computeCredit`, beside
  `invoice-amounts.ts`) and reads as three steps.
- `client/src/boms/recipe-panel.tsx` (601, now 480): `useRecipe()` reads a
  variant's recipe in one place and `RecipeLinesTable` is the lines table.
  The rest is the selected version's header; a component for it would take
  about eight props and handlers, more wiring than it saves, so it stays.
- `boms/boms.service.ts` (587): one job in about twenty short methods,
  kept (see reviewed and kept).

**Behaviour settled in rounds 2 and 3 (fix commits):**
- A request against the wrong kind of order is a 400 everywhere: an RMA or
  an invoice draft from a purchase used to be 409. An order's direction
  never changes, so the request can never succeed.
- A line sent twice is refused by the DTO (`@ArrayUnique`) on ship, return,
  RMA and credit, so it is a 400 before the document's state is read.
- A sale is in one currency from its first priced line, on a draft too,
  however the price arrives (ADR-046 amendment). A conflicting list price
  on an added line is still left off rather than refused (ADR-049).
  Purchases keep a currency per line (ADR-035).
- The recipe panel's reload after an action drops an answer that arrives
  after a variant switch, as the switch itself already did.
- Message wording only: non-negative prices say "zero or more"; every
  calendar day says "must be a calendar day, YYYY-MM-DD" and, for a day
  that does not exist, "must be a real date".

**Left from these rounds, none started:**
- Two fixes without a test: the recipe panel's reload answering late
  (its tests would need a response held back) and invoice drafting's
  refusal of a purchase shipment (no route can make one).
- Test setups jscpd still reports across specs: costs against valuation,
  returns against shipments, and the bootstrap blocks every spec repeats.
- Not read yet: the organization address DTO against the partner address
  DTOs (possibly one address rule); on the client, the lot-picking blocks
  shared by the ship, return and release dialogs, a third copy of the price
  fields in the invoice-line dialog, and the lines table on credit-note and
  invoice detail.

**Shared pieces — use these rather than writing the thing again:**
- Client `lib/`: `messageFor` and `ApiError` (reads `Retry-After`) in
  `api.ts`; `useResource` (one GET with reload); `useKeysetList` (paged
  lists); `formatDay` in `format.ts`; the `CalendarDay` type in `types.ts`.
- Client `components/`: `DialogFooter`, `LabelledValue`, `CurrencyField`,
  `SettingsSection`, `LoadMoreButton`, and `print-sheet.tsx` (`PrintSheet`,
  `PrintBanner`, `PrintParty`, `PrintLines`, `PrintTotals`).
- Client, per feature: `boms/use-recipe.ts`, `boms/recipe-lines-table.tsx`,
  `inventory/lot-fields.tsx`, `auth/auth-message.ts`,
  `orders/status.ts`, `orders/order-lines-section.tsx`,
  `orders/order-status-actions.tsx`; test factory `test/factories.ts`.
- Server `common/`: `dto/currency.ts` (`IsCurrencyCode`, with
  `isCurrencyCode` in `database/schema/columns.ts` for checks),
  `dto/decimal.ts` (`IsPositiveDecimal`, `IsNonNegativeDecimal`),
  `dto/calendar-day.ts` (`IsCalendarDay`, which reads `CALENDAR_DAY_INPUT`),
  `today.ts` (`todayUtc`), `dto/keyset-query.dto.ts` and `keyset.ts`
  (`pageOf`). A DTO never restates a rule's message; `$property`
  names the field.
- Server lookups every action starts from, each scoped to the organization
  in its where clause: `orders/load-order.ts`, `invoices/lock-draft.ts`,
  `production-orders/run-guards.ts`, `return-authorizations/lock-open.ts`.
  Also `stock/rates.ts` (`baseCurrency`, `rateOnOrBefore`),
  `stock/availability.ts` (`inVariantOrder`, the one order product locks
  are taken in), `orders/order-line-pricing.ts` (`pricedCurrencies`,
  `assertOneSaleCurrency`), `orders/lot-items.ts` (what a shipment or
  return moved), `return-authorizations/lines-with-progress.ts`,
  `invoices/issued-invoice.ts` (`partiesOf`, `stored`),
  `invoices/credit-amounts.ts` (`computeCredit`).
- Server services split by job, like shipments and returns already were:
  orders → `OrdersService` (reads), `OrderLifecycleService`,
  `OrderLinesService`, `OrderReceiptsService`;
  invoices → `InvoicesService` (reads), `InvoiceDraftsService`,
  `InvoiceIssuingService`; production → `ProductionOrdersService`,
  `ProductionExecutionService`, `ProductionCloseService`; shipments →
  `ShipmentsService` (reads), `ShippingService`, `ShipmentVoidsService`;
  RMAs → `ReturnAuthorizationsService`, `ReturnAuthorizationReceiptsService`
  (the only one exported), `ReturnAuthorizationReplacementsService`; stock →
  `StockService` (the one write path, kept whole), `StockReadsService`,
  `LotsService`.
- Server tests `test/utils/`: `fixtures.ts` (`createE2eApp`, `body`,
  `PASSWORD`, `registerOrganization`, `createPartner`, `createLocation`,
  `createVariant`, `roleIdNamed`, `addMember`, `addViewer`), `sales.ts`
  (`shippedSale`), `valuation.ts` (buy, move, pool reads,
  `expectBooksToReconcile`), `routes.ts` (the coverage walk).

**Behaviour settled on the way (fix commits, not refactors):**
- A failed reload shows its error; it used to escape as an unhandled
  rejection.
- A rate limit says how long to wait: `api()` reads `Retry-After`.
- A dialog cannot be closed while it saves — not Cancel, Escape or the
  backdrop (`onClose={submitting ? undefined : close}`).
- A calendar day is a `date` column, sent and returned as `YYYY-MM-DD`,
  and a form sends the date input's value as typed (ADR-052, #20).
- Paged lists: a successful read clears the error, a page answering after
  the filter changed is dropped, the cursor is URL-encoded, and Load more
  sits centred under the list.
- `issue()`'s tax-code subquery is aliased plain SQL (the handoff item). The
  installed Drizzle already rendered it qualified; it no longer depends on
  that.

**Test gaps found while refactoring** (step 1; rounds 2 and 3 closed the
first three):
- ~~Server unit tests for the pure logic~~ — done where it is pure.
- ~~Cross-tenant tests per shared lookup~~ — done.
- ~~Whether an expired licence stops a release~~ — it does not; ADR-050.
- ~~No performance tests~~ — ADR-051.
- Still open: no end-to-end journey (buy → receive → make → ship → invoice
  → credit) in Playwright.

**In flight — finish before new work:**
1. **Turn the backups on.** Render's database Access Control allows all
   IPs (Actions runners change address every run). Add the secrets
   `BACKUP_DATABASE_URL`, `BACKUP_AGE_RECIPIENT`, `BACKUP_AGE_IDENTITY`
   (`gh secret set`, runbook section 1). Run **Backup**, then **Restore
   drill**, by hand: both green, the drill's summary showing the
   organizations and the time.
2. Walk MC-1301 to MC-1304. Backups phase 1 is then done.
3. **Close out #20** (closed on merging PR #40): the Render deploy log
   shows migration 0038 applied; walk MC-R04 on the Render site.
4. Open the issue "Organization time zone for today" (ADR-052, Deferred).

**Next, in this order:**
1. **ADR-054, languages** — written; build it in the ADR's order,
   starting with step 1 (server, migration 0039). Before the release that
   offers French or Chinese: a fluent review of each catalogue, and the
   advisor's answer on which pair a Quebec customer needs and whether its
   invoices must describe items in French.
2. **The Playwright journey**, written with Bob at a computer: one browser
   test that buys from a supplier, receives into a lot, makes a batch,
   ships to a customer, invoices and credits a return — the parts working
   together, which no single test proves.

**Before real customers** (not needed while the database is the Free
test instance):
- Backups phase 2: a paid database plan with point-in-time recovery, and
  the S3 bucket in Canada with object lock (`BACKUP_DESTINATION=s3`, the
  runbook's section 1). Settings, not code.
- The security review in *Open decisions*: two-factor sign-in, dependency
  scanning on every PR, secret rotation, encryption at rest.
- The Free database's expiry date. When it comes, recreating it and
  restoring the newest backup is a real test of the runbook.

Rules, still in force:
- no behaviour change in a refactor; a fix is its own commit, first;
- tests stay green between commits;
- one extraction per commit, with the reason in the message;
- a duplicate that differs on purpose stays, with a comment saying why. The
  goal is one definition per rule, not the fewest lines.

## Open GitHub issues

- #16 licence status for suspended, cancelled, superseded
- #17 licence expiry notification (60 days)
- #18 site licences on the organization or a partner. ADR-050's amendment
  sketches where it is heading: one register of credentials with a type
  and what it applies to — site licences gating making at a site,
  wholesale licences gating shipment, business licences only reminded.
- #19 generated client types from OpenAPI (would also replace the client's
  copied permission list)
- #20 `date` column for calendar days — done (ADR-052), closed by PR #40
- #25 show what the customer kept (shipped − returned)
- #26 cancel check and update are not one transaction
- #28 run-close top-up ignores holds and the lots picked at release

## Left over, small

- **Pro forma invoices** — deferred in ADR-046; remind Bob. Bring forward if
  the business needs them for customs, prepayment or sample values.
- Check ADR-047's audit list names `return_authorization.replacement_raised`.
- `npm audit` on both sides has not been run in a while.
- ADR-051 tooling, small follow-ups:
    - **perf/ is never compiled in CI.** ESLint does not report type errors
      and the build excludes the folder, so a type error there shows only
      when someone runs it (it happened twice on the first run). Fix: a
      `perf/tsconfig.json` and `npx tsc --noEmit -p perf/tsconfig.json` in
      ci.yml's server job.
    - **One manifest per scale.** seed:volume writes `perf/volume.json`, so
      seeding the other scale overwrites it and it has to be copied aside by
      hand (once it was lost and rebuilt from the database). Fix: write
      `volume-<scale>.json`, and `npm run perf -- --scale small` reads it.
- `docs/manual-checks.md` coverage pass: map every ADR and every client page
  to at least one check. The list covers the main flows, round 2 and
  licences at release (MC-506, MC-508 to MC-511), not yet tax codes and
  the rest of organization settings, closing a line short,
  cancelling or re-raising a run, the price-list screens, printed documents
  other than the invoice, session timeout, dark mode or narrow screens.
- Production performance (ADR-051, **Results**): turn on
  `pg_stat_statements` from the first day of real use. Compression is
  already done by Render's edge (Brotli). The rest wait for their
  triggers.
- CSV/Excel export and import: raised, not decided. Export is low-risk
  (read-only, reuses the lists' permissions and tenant scoping); import and
  bulk insert need an ADR first (validation, partial failure, audit,
  duplicates, tenant checks). Decide from what users actually need.
- ADR-048 deferrals worth remembering:
    - propagating corrections through closed runs;
    - period close;
    - landed cost and conversion cost;
    - FIFO;
    - export to the books;
    - confirming the weighted-average method with the accountant.
- The `ubuntu-latest` runner moves to Ubuntu 26 from 19 October 2026. Pin
  `ubuntu-24.04` in `ci.yml` if you'd rather choose when.

## Working agreements (for Claude)

**How code is delivered**
- **Every answer that changes files opens with a roadmap:** a tree or
  relative paths, each marked **new**, **full replacement** or **snippet**.
- **New files, and changes touching several places or a large chunk of one
  file, come as full downloadable files.** Only a single small change stays
  inline as a snippet.
- Full replacements are made from Bob's current copy. Project knowledge
  counts once Bob says he has resynced from `main`. Otherwise ask, or build
  from the Project copy plus known changes and tell Bob to check `git diff`.
- State the exact path of every file:
    - `server/src/modules/…`;
    - `server/src/core/…` (organizations, audit, authorization);
    - `server/src/database/schema/…` and `…/migrations/…`;
    - `server/test/…`;
    - `client/src/…` (feature folders, `lib/types.ts`, `auth/permissions.ts`);
    - `client/e2e/…`;
    - `docs/decisions.md`.

**Process**
- ADR before code for each new area. Server first with e2e tests, then the
  client screens. Each step its own commit.
- Migrations:
    1. write the schema;
    2. run `npm run migrate:new -- --name <name>`;
    3. append the hand-written parts (triggers, backfills) after a
       `--> statement-breakpoint`;
    4. run `npm run migrate:all`.

  Check the generated SQL keeps `NULLS NOT DISTINCT`.
- A type change on the client means fixing the test fixtures that build that
  type, in the same commit. Vitest does not type-check; `tsc` and CI do.
- A commit that changes what a person sees, or a rule they work under,
  updates `docs/manual-checks.md` in the same commit (`docs/conventions.md`,
  Tests).

**Commits**
- **Authored as Bob:** `Zhenzhong Zhou <bob0823.zhou@gmail.com>`, the
  identity on the repo's history (`git log --format='%an <%ae>' | sort |
  uniq -c` shows it). Every mbox or patch Claude prepares uses it, never a
  placeholder such as `Claude (draft) <draft@example.invalid>`: removing
  those took a history rewrite. A local `.git/hooks/pre-push` refuses a push
  that carries one.
- Explicit `git add` per concern, never `-A`.
- Run `git status` before every commit. Files staged earlier — even new or
  empty ones — ride into whichever commit runs first. Unstage with
  `git restore --staged <path>`.
- Each commit must build on its own. When a fix is already broken on `main`,
  it goes first.
- Messages explain the why, as one `-m` with a subject, a blank line and
  wrapped paragraphs.
- To reorder unpushed commits: `git reset --soft <base>`, restage per commit,
  and `git commit -C <old-hash>` to reuse each message.
- Before pushing, run what CI runs: `npm run lint:ci` and
  `npm run format:check` (both sides), `npx tsc -b` (client), build,
  tests. Editor auto-imports in the wrong quote style fail CI.
  (`npx tsc --noEmit` in `client/` checks nothing: the root tsconfig only
  holds project references.)

**Moving code** (what step 1 learned)
- Find every caller before moving a method, including
  `server/src/database/seed-demo.ts`, and calls split over two lines
  (`this.taxCodes` then `.findById`). After a server move, run
  `npm run seed:demo`: no test runs it.
- Prove a move lost nothing: every non-import line of the old file should
  appear, as often, across the new ones.
- Check a new comment's claims against the code it describes before
  keeping it.

**Server**
- Server e2e: always `npm run test:e2e`. Never run two at once — the second
  now refuses. Don't edit server files while Playwright runs against
  `start:dev`.
- **Drizzle writes a column without its table name when a query has no
  joins.** Inside a correlated subquery, name the outer row in plain SQL.
  Raw SQL with every table aliased avoids it.
- Quantities and money stay strings end to end (ADR-025); compare and sum in
  SQL; the client never does decimal arithmetic. Values round to six places.
- Refusals in order: malformed (400), not found (404), not allowed (409), all
  before any write. Ids from a body that belong to another tenant are 400.
- Every write route is audited or listed in `NOT_AUDITED` with a reason.
  Every route has `@RequirePermissions`. Never seed a permission nothing
  gates. New permissions default to Owner-only: add them to `PERMISSIONS`
  and its descriptions, never to the Admin or Viewer lists, and to the
  client's list in the same commit.

**Client and copy**
- Dialogs take permission flags from their page rather than reading the
  session.
- `useSubmit`'s callback takes no result — keep ids and notices in a
  `useRef`.
- Hooks never inside hooks or after an early return.
- Playwright:
    - prefer `getByRole(…, { name, exact: true })`, and label tables
      (`aria-label`) so row lookups stay inside them;
    - an accessible name includes everything in the element, such as
      `Old retail (CAD) — retired`.
- British spelling in comments and copy is intentional.