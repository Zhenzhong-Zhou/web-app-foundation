# web-app-foundation — handoff, v0.4 features done, milestone ritual next

Paste this into the new chat. Re-sync Project knowledge from `main` first, so
the new session reads current code.

## Where things stand

Multi-tenant B2B SaaS (NestJS + React + Drizzle + PostgreSQL 18), deployed on
Render. Inventory for a natural health products maker: buy → receive → make
under a licence → sell → ship → invoice → return and credit, with lot
traceability both ways, stock held for confirmed sales, every movement valued,
and price lists proposing the price of a new line.

- Last tag: **v0.3.0**. v0.4's features are built; the milestone ritual is
  left, then tag v0.4.0.
- Migrations: through **0035** (`price_lists`). Next is **0036**.
  After any new migration: `npm run migrate:all` (dev, test and e2e).
- ADRs: through **ADR-049**. Next is **ADR-050**.
- Tests at the last run: server e2e about 590 in 32 suites
  (`npm run test:e2e`); client vitest 97 in 21 files; Playwright 61.
  CI also runs `seed:demo`.
- `npm run seed:demo`: BF-2609 valued at 1900.00 CAD, run FOC-2609-01 costed
  at 1292.00 over 980 bottles (1.318367 each), SO-DEMO-2 priced from the
  Wholesale CAD list (the organization default).
- **Render is down.** The free Postgres expired: Render suspends a free
  database after 30 days, and it cannot be reactivated, only upgraded or
  replaced. The web service's last deploy failed before that, so read its log
  first. Then: a new database in Oregon, its internal URL into
  `DATABASE_URL`, redeploy (migrations build 0000–0035 from empty). A free
  database expires again in 30 days; use a paid instance, or a provider
  whose free Postgres does not expire (PG 18 for `uuidv7()`), for the week by
  hand.

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

## Next: v0.5, maintainability and languages (proposed)

1. **Maintainability** — shared client hooks, then split the largest files.
   No behaviour change; each extraction its own commit. See below.
2. **ADR-050, languages** — before any code. French (Quebec) and Chinese
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

## Maintainability plan (v0.5, step 1)

Keep the feature-first layout (`orders/`, `invoices/`, `price-lists/`,
`costs/` …). Do not regroup into `pages/`, `components/`, `utils/` by type;
that scatters a feature across the tree.

**Find duplicates with a tool, not by memory:**
`npx jscpd client/src server/src server/test --min-lines 8 --reporters console`
lists every copied block of 8+ lines. Fix what it finds in this order,
because each later split reuses the earlier extractions:

1. **Client, shared code:**
    - `messageFor(caught)` is repeated in most pages; it moves to `lib/api`;
    - the fetch-with-`ignore` effect becomes one `useResource` hook;
    - the keyset "Load more" becomes one hook (eight or more pages);
    - `Figure` is duplicated in the cost panels.
2. **Server, shared code:**
    - the ISO currency check (`/^[A-Z]{3}$/`, in DTOs and checks) becomes one
      validator and one SQL fragment;
    - `lockPool` and the "latest rate on or before a day" lookup are repeated
      across valuation and correction code; they move to one place;
    - the base-currency read is repeated in several services; it becomes one
      helper.
3. **Tests:**
    - each e2e spec has its own register / partner / variant / buy helpers;
      they move to `server/test/utils/fixtures.ts`;
    - the pool reconciliation query is in two specs;
    - the client specs each build their own `OrderLine`; one factory in
      `client/src/test/`.
4. **Then split the largest files**, found with
   `find client/src server/src -name '*.ts*' | xargs wc -l | sort -n | tail -20`.
   Likely candidates:
    - `order-detail-page.tsx` (lines table, actions, totals);
    - `orders.service.ts` (lines, pricing, receiving);
    - `production-orders.service.ts`;
    - `invoices.service.ts`.

Rules:
- no behaviour change;
- tests stay green between commits;
- one extraction per commit, with the reason in the message;
- a duplicate that differs on purpose — two similar checks with different
  rules — stays, with a comment saying why. The goal is one definition per
  rule, not the fewest lines.

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
- `issue()` in `invoices.service.ts` sets `taxCodeName` with a correlated
  subquery written through Drizzle; qualify it in plain SQL when that file is
  next touched.
- Check ADR-047's audit list names `return_authorization.replacement_raised`.
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
  `npm run format:check` (both sides), `npx tsc --noEmit` (client), build,
  tests. Editor auto-imports in the wrong quote style fail CI.

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