---
status: accepted
date: 2026-10-01
areas: [database, ops]
amended-by: [ADR-081, ADR-082, ADR-091]
---

# ADR-051 — Performance: a volume seed, response-time budgets, plan checks

> **Amended by [ADR-081](0081-old-tabs-after-a-deploy.md).**
> Each organization in `seed:volume` has a team holding made roles, `npm run perf:plans` times the access query, and each scale writes a manifest of its own, read by `--scale`.
>
> **Amended by [ADR-082](0082-the-products-brand.md).**
> A budget may carry a known miss: its issue, an end date and a ceiling. Until the date, a result over the budget and under the ceiling is reported and does not fail the run. The typo lookup's is the first (#225).

## Context

Nothing measures how the app behaves with a year of data.
Every test and both seeds work on a handful of rows, where any query is
fast. The places that will slow down are known in kind but not in size:
list pages that sum per row, the ledger reads behind stock and valuation,
choosing lots earliest-expiry first across many lots, and the tenant
filter on every table of a shared database. Optimizing before measuring
trades readability for guesses.

## Decision — a volume seed, separate from the demo

`npm run
seed:volume -- --scale small|large` writes several organizations of
similar size. Small, minutes to run: about 500 products, 5,000 orders,
50,000 stock movements, 2,000 lots and 2,000 invoices per organization.
Large: about ten times that, for a local overnight run. Through the same
services the API calls, as `seed:demo` is, so stock levels, valuations and
the ledger always agree; a bulk-SQL path is added only if the services
prove too slow to seed with. It refuses a production database, as
`seed:demo` does, and is never part of `seed`.

## Decision — budgets per endpoint, measured over HTTP

`npm run perf`
drives a running server with a small load runner written on Node's own
`fetch`: no new dependency, and the numbers it reports (median, 95th and
99th percentile, errors) are the ones the budgets need. Budgets, at 10
connections, against the small scale:

- Reads under 300 ms at the 95th percentile: the order, inventory,
  movement and invoice lists, an order's detail, lot trace.
- Writes under 500 ms at the 95th percentile: shipping (lots chosen
  earliest-expiry first), receiving, issuing an invoice, issuing a credit.
- Concurrency: shipments of one product from several connections at once
  finish without a deadlock, and stock adds up afterwards.

## Decision — a stress run that reports, not fails

The same endpoints
at 100 connections, to find where response time starts climbing. Ten
connections with no pause between requests is already more load than
dozens of people clicking; 100 shows the headroom. Its result is a number
to watch between runs, not a gate.

## Decision — query plans checked

A script runs `EXPLAIN` on the main
list and ledger queries against the volume seed and fails on a sequential
scan of a large table: a missing index shows up here before anyone feels
it.

## Decision — where it runs

Locally, and in CI as a manually triggered
job, never on every PR: it needs minutes of seeding, and timing on shared
runners is too noisy to block a merge. Each run writes a short report, so
runs can be compared.

## Consequences

- Three commits after this one: the volume seed, the load runner with its
  budgets, the plan check. Then a CI job to run them on demand.
- Budgets and volumes are starting points. They follow the customers the
  app is sold to; a manufacturer with a few hundred orders a month sits
  well inside the small scale.

## Deferred

- **A dedicated load tool** (k6, autocannon) for scripted user journeys,
  ramps and soak tests. Trigger: a scenario the small runner cannot
  express.
- **Production monitoring** of response times. Trigger: the first
  customer in production.
- **Optimizations themselves.** Only where a budget or a plan check fails.

## Results (2 October 2026)

Measured locally: a MacBook (ARM64), Postgres
18 in Docker, the server built and run with `NODE_ENV=test`. Five
organizations, seed 51. Per organization, small is 5,000 orders, 2,051 lots
and 40,471 stock movements; large is 49,999, 20,410 and 410,277. Figures
are p95 at 10 connections unless marked.

|                                         | Small before | Small after | Large before | Large after |
|-----------------------------------------|--------------|-------------|--------------|-------------|
| `GET /stock`                            | 67 ms        | 17 ms       | **520 ms**   | 79 ms       |
| `GET /stock` at 100 connections         | 515 ms       | 149 ms      | 4.5 s        | 581 ms      |
| `GET /stock/availability`               | 27 ms        | 26 ms       | 293 ms       | 200 ms      |
| `GET /stock/availability?promised=true` | —            | 25 ms       | —            | 196 ms      |
| Valuation query (plan check)            | 57 ms        | 5 ms        | 497 ms       | 40 ms       |
| Plan check                              | 3 failures   | passed      | 7 failures   | passed      |

Orders, an order, the movement lists, invoices, lot trace and the four
writes were flat from small to large (about 1×) before any change: they
read a page through an index. The concurrency check passed every run.

What was changed, each because a budget, a plan or the growth column said
so:

- **Holds carry the organization on the join to orders.** Without it the
  hold calculation read every tenant's confirmed sales (250,223 orders at
  large) to join one tenant's open lines.
- **The stock list is a keyset page** of 50, ordered by location name, SKU,
  lot code and id, with a search on SKU, product name and lot code, and the
  organization on every joined table. The Inventory page loads more.
- **Availability can be asked for promised products only**, which is all
  the Inventory page shows.
- **A valuation marks provisional pools in one join** instead of a subquery
  per pool. Its whole-organization reads are allowed in the plan check,
  with that reason.
- **Open order lines have their own partial index** (`order_lines_open_idx`,
  migration 0036), on the same predicate the hold calculation filters on.
  The plan check passed without it, since reading all of history through
  an index is not a sequential scan; the growth column caught it. Keep the
  two predicates identical, or Postgres stops using the index.

## Re-run after ADR-054 (6 October 2026)

Small scale, five
organizations, seed 51, on `seed:volume` with customers whose documents
print in French and English or in Chinese, and finished goods named in
French or Chinese. Issuing an invoice, which now looks up product and
variant names in the customer's languages: 25 ms p95 at 10 connections
(budget 500 ms), 251 ms at 100, in line with the run above. Every
budget passed with no errors, the concurrency check passed, and the
plan check found no new sequential scan; it has no probe for issuing,
so the timing is the evidence for the name lookup.

## Watch, each with its trigger

- **`GET /stock` sorts by names**, which no single index serves, so each
  page sorts the organization's matching rows: 4.6× from small to large, a
  36 ms query at large. Trigger: p95 over budget at small scale, or the
  plan check flags it. Then order by an indexed key and lead with the
  location filter.
- **Availability** still grows 7.9×: a 66 ms query at large, now bounded by
  stock on hand and open demand rather than history. Trigger: p95 over
  budget at small scale. First step then: in the promised list, sum supply
  only for products with open demand.
- **Movements for one shelf** went from 2 ms to 21 ms. No screen in the
  budgets reads it yet. Trigger: it joins the budgets, or passes 100 ms.
  Then indexes on the source and destination location with the id.
- **Lot search** reads through `lots_code_trgm_idx`, the pg_trgm this
  line waited for, since migration 0042 (ADR-056), and joins only the
  organization's variants (#187). Until migration 0077 the index knew no
  organization, so other organizations' matching lots were read and
  filtered out: 79% of the candidates for `LV-0001` at large. Since then
  it leads with the organization (the amendment for #225 and #276,
  below): at small, lot search finds 341 candidates in its own
  organization, and its plan went from 6.0 to 0.7 ms on the Mac.
- **One Chinese character on a large catalogue.** `GET /products?search=专`
  in `zh-Hans`, at large, in its largest organization: 40 ms (4 November
  2026, #449), after 63.5 (29 October, #317) and 77.0 (1 November). Since
  migration 0077 its plan rechecks only the organization's 3,750
  translations, where it rechecked every organization's 18,750. Trigger:
  a large organization's search past 100 ms. Then its plans first.
- **The low list** (ADR-085) works out every point's position on each
  page: 6.3× from small to large, 22 to 138 ms at p95 (1 November 2026,
  #361). Trigger: p95 over budget at small scale. Then the open lines
  read once, with three filtered sums, and drafts read only for the
  items asked (#276's comment of 1 November, carried to #352).
- **Home after ADR-085:** closed by ADR-091's redesign (#477, 6 November
  2026): GitHub's median 177 ms at small, a newcomer's 165 ms, and Home's
  known miss gone.
- **Home with the data** (ADR-091): 5.0× from small to large, 6.1× for a
  newcomer, 41 to 205 ms at p95 on the Mac, past perf's 3× line, since
  each count reads every row it counts. Trigger: `GET /home` over its
  300 ms budget at large in a weekly run. Then the counts kept ready
  rather than counted each time, which needs an ADR.
- **Valuation** reads every pool by definition. Trigger: an organization
  whose valuation no longer fits a screen. Then an export.
- **Migrations on large live tables.** 0036 builds its index inside the
  migration's transaction, which blocks writes to `order_lines` briefly:
  fine at today's sizes. On a production table with millions of rows and
  traffic, use `CREATE INDEX CONCURRENTLY`, outside a transaction.

## Production, beyond these measurements

Not done; each waits for its
trigger.

| What                              | When                                                                                                                                                                                                                          | Cost                                                  |
|-----------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------|
| Response compression              | **Done, by Render.** Its edge (Cloudflare) answers API responses with `content-encoding: br`, checked on 2 October 2026 in the browser's Network tab. Nothing to add to the app; check again if the hosting changes.          | None.                                                 |
| Measure where it runs             | The Performance workflow ran on main on 2 October 2026 at small scale and passed; its plan check matched the local run within a few milliseconds. A staging copy on Render still waits for the first paying customer or v1.0. | CI is free; staging is a second service and database. |
| `pg_stat_statements`              | From the first day real people use Render: it records only from when it is on. Check the Render plan allows it.                                                                                                               | Near zero.                                            |
| Configurable pool, then PgBouncer | Configurable with a second server instance, or when production shows requests waiting for a connection. PgBouncer when instances × pool size nears the database's connection limit.                                           | Small, then a service to run.                         |
| Caching                           | Only when a read is still over budget once bounded and indexed, or the same answer goes to many users.                                                                                                                        | Ongoing: stale data is its own class of bug.          |

## When to run perf

The Performance workflow once after this merges;
before every release (MC-1201 to MC-1204 in `docs/manual-checks.md`); and
after any change to a list, a ledger query or an index. Small and large
each in a database of their own, as `server/perf/README.md` describes.

*Amended (CI speed-up, October 2026):* the workflow runs itself. A small
run took 23 minutes: 12 seeding the volume, 10 for the budgets and the
stress pass, 9 seconds for the plan check, which caught both real problems
so far (the stock list's tenant joins, then Home's ledger scan). So the plan
check now runs on every pull request that changes the server's code, as a
gate: unlike timings on a shared runner it is deterministic. It loads the
last small volume seeded on `main` from the Actions cache, keyed on the
seed's own code, and migrates it forward, as production data is. The
budgets run by hand on a branch; the full run, stress included, weekly on
`main` and on each release candidate tag, so before every release. Timed
runs always seed fresh, so their numbers stay comparable.

## Amendment (November 2026) — budgets judged by the median of three rounds (#342)

On 1 November 2026, two budget runs on GitHub's machines with no change
to the code between them read the low list at 95 and 137 ms at the 95th
percentile, and Home at 249 and 329 ms: shared runners vary by about 30%
from run to run. One run cannot tell a 10% change from the machine, and
a slow machine can turn the weekly run red with nothing wrong. Since
that day, timings on GitHub's runners have been judged by the median of
three runs made by hand. This amendment makes the workflow do it (the
maintainer, 2 November 2026, as recommended). Its check before drafting
is ADR-008's amendment of the same day, the Fix-ups' first batch.

### Decision — three rounds on three runners, judged by their median

- **Every timed run is three jobs,** budgets and full alike, weekly, on
  a release candidate's tag and by hand: each round seeds fresh on its
  own runner, as timed runs do, and runs the budgets and the
  concurrency check at 10 connections. The stress pass, which reports
  and never fails, runs in the first round only.
- **A fourth job judges the median:** for each endpoint the median of
  the three rounds' 95th percentiles, against its budget and its known
  miss's ceiling, so the known-miss rule applies to the median. Its
  summary shows the median, each round's figure, and each probe's plan
  time from the plan check, which load does not change.
- **The plan check runs once,** in the first round; the plans mode on a
  pull request is unchanged.
- **The run fails only when a median misses.** One slow runner no longer
  turns a weekly run red; two do, which is a finding.

### Considered and not done

- **Three rounds in one job:** the variance is between machines, and a
  slow machine slows all three of its rounds alike.
- **One run, with the ceilings 30% higher:** a real slowdown of 20%
  would pass unseen.

### Consequences

- `perf.yml` gains the rounds and the job that judges them; the perf
  report gains the median, with a spec; `server/perf/README.md` says how
  a run is read.
- The Watch's "Home after ADR-085" is read off every timed run, its
  trigger being the median of three over budget.
- Three runners per timed run, free while the repository is public
  (Open decisions, "A public or a private repository").

### As built (#435, 3 November 2026)

- **The rounds run one after another** (`max-parallel: 1`), keeping "one
  timed run at a time, so two runs never measure each other": about 60
  minutes for a full run at small scale, against about 23 side by side.
  Only round 1 runs the stress pass, the plan check and the volume dump on
  `main`.
- **What fails what:** in a round, a missed budget fails nothing, and the
  median job judges; the concurrency check fails its own round's job, since
  it is not a timing; an error in any round fails that budget, since an
  error is never noise.
- **A round can be re-run alone:** its artifact's upload overwrites the
  one its first attempt left. Not yet tried on GitHub.
- **The first timed run, on #435's branch** (budgets, 41695025704), passed.
  Home's median was 237 ms of its 300 (rounds of 204, 237 and 318 ms), the
  typo lookup's 248 (203, 248 and 357) and Home for a newcomer's 191. Round
  3 alone had Home and the lookup over their budgets, within their known
  misses' ceilings: the median doing what it is for. The Watch's "Home
  after ADR-085" did not fire.

## Amendment (November 2026) — the typo lookup in one query per pass, Home's miss given to its redesign (#225, #276)

Both known misses were to end on 30 November 2026 (ADR-082). The first
timed run judged by its median (#435, 3 November 2026) passed both: Home
at 237 ms, from rounds of 204, 237 and 318, and the typo lookup at 248,
from 203, 248 and 357. One round in three missed each budget, and the
runners vary by about 30% from one day to the next, so one passing
median says the misses could end, not that they should: #225 was closed
once on one run, on 28 October, and reopened the next day. This amendment
decides each (the maintainer, 3 November 2026, as recommended).

Checked before drafting, as the working agreements ask, for the areas
home, search, database, docs, help and i18n, beside the translations'
batch planned the same day:

- **Fired, and taken here.** The step the handoff gave the typo lookup
  in October, "one query per pass if it ever fails": it has failed since
  29 October.
- **Not fired, and left.** ADR-056's index per organization, whose
  trigger is a missed budget: the median is under budget, so the index
  waits for one query per pass to fall short (Deferred, below). The
  Watch's "Home after ADR-085", whose trigger is the median over budget:
  237 ms. The low list, whose trigger is its own budget missed at small.
  The `when-touched` issues of these areas, none in the code this
  changes: #226 and #314 (database), #154, #261, #299, #308 and #312
  (search), #292 (docs) and #170 (help). The translations' riders are
  ADR-054's.
- **Found while checking.** Commit 54a0aea's message said "closed #225",
  and GitHub closed the issue again when that commit reached `main` on 29
  October, after its reopen; it was reopened on 3 November, and the
  working agreements' Commits gain a line against a closing word before
  an issue's number. #276's two findings from ADR-085's review are in the
  reorder points' code, not Home's, so they move to #352. #165, fixed by
  #436 without a closing word, is closed.

### Decision — the typo lookup in one query per pass

The lookup sends each kind's exact matches as a statement of its own,
then, when the whole lookup found fewer than five, each kind's close
matches the same way, one after another in one transaction: up to 18
statements for an owner who sees all eight kinds. Each pass becomes one
statement, its kinds joined by `union all`, each kind with its own order
and limit as now. The lookup then sends the threshold setting, the exact
pass, the close pass when the exact one found fewer than five, and the
organization's prefixes when two kinds or more were found: four at most.
What it finds, in which order, and for whom, does not change; the
lookup's tests prove it, with one that counts the statements.

### Decision — fixed means with headroom

The typo lookup counts as fixed at a median of 240 ms or less, 80% of
its 300 ms budget, on one timed run on GitHub's runners, with the Mac's
figures before and after in the commit. A median just under 300 turns red
again on a runner 30% slower. #225's known miss goes in the commit that
fixes it, as `server/perf/README.md` asks.

### Decision — the index per organization, once one query per pass fell short

The timed run on the branch with one query per pass (run 41764305996, 3
November 2026, at 4bb4e0a) passed every budget but not the bar above. Its
medians: the typo lookup 259 ms, from rounds of 259, 265 and 246; the
code lookup 107 and the name lookup 100; Home 241, beside 237 on 3
November, so the runners were as fast as then. On the Mac the typo
lookup went from 60 to 49 ms, its statements from 17 to 3: the round
trips went, but on a busy runner the time is the close matches' own work.
Each trigram index holds every organization's rows, so a close match
reads and rechecks the others' before keeping its own: 1,469 of lot
search's 1,852 matches at large (above).

So ADR-056's index per organization, as its Deferred and this
amendment's gave it (the maintainer, 4 November 2026, as recommended):

- **Every trigram index on a table with `organization_id`** becomes one
  over the organization and the trigram, `(organization_id, … gin_trgm_ops)`,
  in one migration that replaces the old: the release still serving
  names the organization in every read these indexes serve, so the new
  ones serve it too.
- **`btree_gin`,** which lets a GIN index hold the organization's id,
  created first in the same migration, as 0042 created `pg_trgm`. Render
  offers it on PostgreSQL 13 and later.
- **The proof:** the plans first, the close pass reading only the
  organization's rows; then the Mac's three runs; then one more timed run
  on the branch, against the same 240 ms. #225 closes only then.
- **Unchanged:** what each search finds and in which order, and #226's
  plan-check rule, which stays for its own batch: the index changes no
  join and no rule in `server/perf/plans.ts`.

### Decision — the orders' partner arm as an array, past the index

The index per organization (migration 0077, step 9 of the build, 3
November 2026) sped up lot search, from 6.0 to 0.7 ms, and the code
lookup, from 10.8 to 5.7, but left the typo lookup on the Mac at 51 ms
against 49. Its close pass takes 14.7 ms, 11.7 of them in the orders
branch: an order is found by its partner's name through `partner_id in
(select …)` inside an OR, which no index serves. So Postgres reads every
one of the organization's 5,344 orders and measures each one's
similarity. Written as `partner_id = any(array(select …))`, the partners'
ids are found first, once, and the orders' partner index joins the
number's and the reference's trigram indexes in one bitmap OR: in psql
the branch went from 18.0 to 0.6 ms, with the same rows.

So `partnerMatches`, in `server/src/modules/partners/partner-search.ts`,
sends its subquery as an array (the maintainer, 3 November 2026, as
recommended): for the lookup's two passes, and for the order, invoice,
credit note and return lists, which find a document by its partner the
same way. Each table it serves keeps an index on its partner, which the
build checks, and what each search finds does not change. The plans
prove it before the second timed run.

### Decision — Home's known miss given to its redesign

Home's statements take about 26 ms at small; its time over budget comes
from ten connections at once on a shared runner, which no one reading
Home meets. Home is to be redesigned (#335, ADR-091) after the fix-ups
before it, so a change to today's reads would be rewritten soon after.
Home's known miss moves from 30 November 2026 to 31 January 2027, with
its 400 ms ceiling, and ADR-091 must bring `GET /home` within its
budget, with the same headroom, and remove the miss. A known miss with an
owner and a date stays a debt; a raised budget would forget it
(ADR-082).

### Considered and not done

- **Ending both misses now,** on one passing median: one round in three
  missed each budget, and the next slow day would turn the weekly run red
  with nothing changed.
- **Home's reads in one transaction now,** where it opens 14 one after
  another, or prepared statements: the redesign decides what Home reads,
  so ADR-091 weighs both.
- **ADR-056's index per organization first:** a migration and the
  `btree_gin` extension, for a lookup whose statements ran one after
  another. Fewer statements came first; the index came second, when they
  were not enough (above).
- **Counting 259 ms as fixed:** within the budget, but a runner 30%
  slower puts it near 340, and the bar above exists for that day.

### Deferred — each with what brings it in

- **Past the partner arm,** if the typo lookup's median misses 240 ms
  again: decided from that run's plans. Trigger: the typo lookup's median
  over 240 ms in a weekly run on `main`.
- **Home's reads in one transaction, or prepared statements.** Trigger:
  ADR-091, or 31 January 2027, whichever comes first.

### Consequences

- `server/src/modules/search/lookup.service.ts` sends each pass as one
  statement. `server/perf/scenarios.ts` drops #225's known miss and dates
  Home's 31 January 2027, and `server/perf/README.md`'s "Known misses"
  says so.
- A migration creates `btree_gin` and replaces each trigram index on a
  table with `organization_id` by one that leads with it; the schema's
  index definitions say the same.
- `partnerMatches` sends its subquery as an array, so a document found by
  its partner's name is read through indexes, in the lookup and in four
  lists.
- The Watch's lot search and "Home after ADR-085" say where each stands.
- The build, in this order: the dependencies; the Mac's figures before;
  one query per pass, with its test, and #225's known miss gone; Home's
  new date; one timed run by hand on the branch, judged against 240 ms;
  then the index per organization, with the Mac's plans and figures;
  then the partner arm as an array, with its plans; a second timed run
  against the same 240 ms; the dependencies again and the reviews; the
  pull request, which closes #225 and refers to #276.

### As built (#449, 4 November 2026)

- **Three changes, each proved before the next:**
  - **One statement per pass** (a9cc918): the typo lookup's statements
    went from 17 to 3, 18 to 4 with the prefixes, and the code and name
    lookups' from 9 to 2. On the Mac the typo lookup went from 60 to 49
    ms; on GitHub's runners it did not move, a median of 259 ms (run
    41764305996).
  - **The index per organization** (6a8c3587, migration 0077): all 20
    trigram indexes, on 11 tables, under their old names, with
    `btree_gin` 1.3 created first. Lot search went from 6.0 to 0.7 ms and
    the code lookup from 10.8 to 5.7; the typo lookup stayed at 51 ms on
    the Mac.
  - **The partner arm as an array** (507f22af): the close pass went from
    14.7 to 3.8 ms, its orders branch from 11.7 to 0.3, and the typo
    lookup to 34 ms on the Mac. The second timed run (41781367000): the
    typo lookup 231 ms, from rounds of 149, 231 and 372; the code lookup
    105, the name lookup 108, and Home 314, within its known miss.
- **At large,** one run after the fixes against 1 November's: the typo
  lookup 313.5 to 66 ms, the code lookup 87.4 to 35, the name lookup
  102.5 to 42. Home took 290 ms there, not measured before: a baseline
  for ADR-091.
- **A union's nulls are typed:** a kind with nothing in a column sends
  `null::text` or `null::uuid`, since Postgres types an untyped null in a
  union as text and refuses to match it with a uuid.
- **From the reviews:** each branch numbers its rows by its own order,
  and the lookup sorts each kind by that number, so the order no longer
  rests on how Postgres appends a union's branches. The number costs a
  sort of each branch's matches, not only its first five, within the
  noise at small and in the run at large. A `trigramIndex`
  helper in `server/src/database/schema/columns.ts` builds all 20
  indexes, and `.claude/rules/database.md` holds both patterns: a
  trigram index through it, and an `in (select …)` inside an OR written
  `= any(array(…))`. Those rules load for the schema, the migrations and
  `server/perf/`, not for the modules' queries; #448, an order's lot
  balances, is the one place left with that shape.
- **0077's lock:** each index is dropped before it is rebuilt, in the
  migrations' one transaction, so reads on the 11 tables wait for the
  build: 1.6 s on `foundation_perf_large`, and production holds no
  customer's data yet, which the Watch on large live tables accepts. A
  later swap of this kind creates the new indexes under new names first,
  and drops the old ones in the next release (ADR-081).
- **The perf database drifts:** each `npm run perf` adds lots through its
  write scenarios, so the plan check that passed after one query per pass
  failed before 0077, on 19,846 lots. A reused perf database's plans can
  differ from a fresh seed's.
- **Little room at 231 ms:** one round in three missed 300 (372 ms), so a
  slower week shows first in the weekly run's median (the Deferred
  above).
- **Left, each with its issue:** one statement-capture helper for five
  specs (#447); the lot balances' in-subquery (#448); the orders list's
  search walking the orders by id, 23,106 rows read for 26 kept (#226,
  comment of 4 November); and Dependabot's alerts 8, 9 and 10, held back
  by eslint, the Nest CLI and Sentry (#446).

## Amendment (November 2026) — Home's reads, by its redesign (ADR-091)

The Deferred "Home's reads in one transaction, or prepared statements",
above, whose trigger was ADR-091, is taken in part. Home's redesign reads
counts only, no rows, and its own reads in one transaction, held by a test
that counts its statements; that drops eight of its fourteen reads. It is
met as the typo lookup was: the plans and the Mac's figures before and
after, then one timed run with a median of 240 ms or less, and Home's
known miss removed in the commit that meets it. Prepared statements stay
deferred, now until Home's median is over 240 ms in a weekly run on
`main`. The Watch's "Home after ADR-085" is closed by ADR-091's as-built,
with its figures.
