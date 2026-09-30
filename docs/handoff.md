# web-app-foundation — handoff, v0.4.0-rc.1 tagged, v0.5 step 1 done

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
- Migrations: through **0035** (`price_lists`). Next is **0036**.
  After any new migration: `npm run migrate:all` (dev, test and e2e).
- ADRs: through **ADR-049**. Next is **ADR-050**.
- Tests at the last run: server e2e 591 in 32 suites
  (`npm run test:e2e`); server unit 17 in 3 files (`npm test`); client
  vitest 148 in 33 files; Playwright 61. CI also runs `seed:demo`.
- `npm run seed:demo`: BF-2609 valued at 1900.00 CAD, run FOC-2609-01 costed
  at 1292.00 over 980 bottles (1.318367 each), SO-DEMO-2 priced from the
  Wholesale CAD list (the organization default).
- **Render is up** (new database; migrations 0000–0035 applied). If it is
  a free instance it expires 30 days after creation — note the date here.

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
2. **Maintainability, next round** — the ordered list at the end of that
   section. Optional; nothing from step 1 is half-done.
3. **ADR-050, languages** — before any code. French (Quebec) and Chinese
   for the app, and French on printed documents.

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
    - A receipt copies its line's price × the latest rate on or before the day
      (UTC; #20).
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

The layout stays feature-first. Do not regroup into `pages/`, `components/`,
`utils/` by type; `components/` holds only what two or more features share.

**Shared pieces — use these rather than writing the thing again:**
- Client `lib/`: `messageFor` and `ApiError` (reads `Retry-After`) in
  `api.ts`; `useResource` (one GET with reload); `useKeysetList` (paged
  lists); `formatDay` and `utcMidnight` in `format.ts`.
- Client `components/`: `DialogFooter`, `LabelledValue`, `CurrencyField`,
  `SettingsSection`, `LoadMoreButton`, and `print-sheet.tsx` (`PrintSheet`,
  `PrintBanner`, `PrintParty`, `PrintLines`, `PrintTotals`).
- Client, per feature: `inventory/lot-fields.tsx`, `auth/auth-message.ts`,
  `orders/status.ts`, `orders/order-lines-section.tsx`,
  `orders/order-status-actions.tsx`; test factory `test/factories.ts`.
- Server `common/`: `dto/currency.ts` (`IsCurrencyCode`, with
  `isCurrencyCode` in `database/schema/columns.ts` for checks),
  `dto/keyset-query.dto.ts` and `keyset.ts` (`pageOf`).
- Server lookups every action starts from, each scoped to the organization
  in its where clause: `orders/load-order.ts`, `invoices/lock-draft.ts`,
  `production-orders/run-guards.ts`. Also `stock/rates.ts` (`baseCurrency`,
  `rateOnOrBefore`), `orders/order-line-pricing.ts`,
  `invoices/issued-invoice.ts` (`partiesOf`, `stored`).
- Server services split by job, like shipments and returns already were:
  orders → `OrdersService`, `OrderLinesService`, `OrderReceiptsService`;
  invoices → `InvoicesService` (reads), `InvoiceDraftsService`,
  `InvoiceIssuingService`; production → `ProductionOrdersService`,
  `ProductionExecutionService`, `ProductionCloseService`.
- Server tests `test/utils/`: `fixtures.ts` (`createE2eApp`, `body`,
  `PASSWORD`, `registerOrganization`, `createPartner`, `createLocation`,
  `createVariant`), `sales.ts` (`shippedSale`), `valuation.ts` (buy, move,
  pool reads, `expectBooksToReconcile`), `routes.ts` (the coverage walk).

**Behaviour settled on the way (fix commits, not refactors):**
- A failed reload shows its error; it used to escape as an unhandled
  rejection.
- A rate limit says how long to wait: `api()` reads `Retry-After`.
- A dialog cannot be closed while it saves — not Cancel, Escape or the
  backdrop (`onClose={submitting ? undefined : close}`).
- A calendar day stored as `timestamptz` (expiry, expected delivery,
  licence dates) is written as UTC midnight with `utcMidnight`; `date`
  columns take the bare day. #20 would make this unnecessary.
- Paged lists: a successful read clears the error, a page answering after
  the filter changed is dropped, the cursor is URL-encoded, and Load more
  sits centred under the list.
- `issue()`'s tax-code subquery is aliased plain SQL (the handoff item). The
  installed Drizzle already rendered it qualified; it no longer depends on
  that.

**Test gaps found while refactoring:**
- Server unit tests are thin (3 files). Pure logic with none:
  `invoices/invoice-amounts.ts`, `invoices/document-numbers.ts`,
  `stock/availability.ts`.
- Cross-tenant tests: only two guard `loadOrder` (duplicate, reservations);
  none guard `lockDraft` or the run guards. One per shared lookup would
  cover every action behind it.
- Unchecked: whether an expired licence stops a run being released.
- No performance tests, and no end-to-end journey (buy → receive → make →
  ship → invoice → credit) in Playwright.

**Next round, in this order:**
1. The returns/shipments pairs jscpd still reports
   (`returns.service.ts` ~175 and ~287 against `shipments.service.ts`);
   merge only if they are the same rule.
2. Split `shipments.service.ts` (841), `return-authorizations.service.ts`
   (838) and `stock.service.ts` (776), the way commits 48–54 did.
3. The test gaps above, starting with the cross-tenant ones.
4. #20, `date` columns for calendar days: ADR, migration 0036,
   `npm run migrate:all`.

Rules, still in force:
- no behaviour change in a refactor; a fix is its own commit, first;
- tests stay green between commits;
- one extraction per commit, with the reason in the message;
- a duplicate that differs on purpose stays, with a comment saying why. The
  goal is one definition per rule, not the fewest lines.

## Open GitHub issues

- #16 licence status for suspended, cancelled, superseded
- #17 licence expiry notification (60 days)
- #18 site licences on the organization or a partner
- #19 generated client types from OpenAPI (would also replace the client's
  copied permission list)
- #20 `date` column for calendar days — the rate lookup at receipt reads the
  UTC day for this reason
- #25 show what the customer kept (shipped − returned)
- #26 cancel check and update are not one transaction
- #28 run-close top-up ignores holds and the lots picked at release

## Left over, small

- **Pro forma invoices** — deferred in ADR-046; remind Bob. Bring forward if
  the business needs them for customs, prepayment or sample values.
- Check ADR-047's audit list names `return_authorization.replacement_raised`.
- `npm audit` on both sides has not been run in a while.
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

**Commits**
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