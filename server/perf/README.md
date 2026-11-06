# Performance runs (ADR-051)

Three commands, run against a database of their own:

- `npm run seed:volume` writes a year of data for several organizations;
- `npm run perf` measures a running server against the budgets;
- `npm run perf:plans` runs `EXPLAIN` on the main list and ledger queries;
- `npm run perf:judge` judges the three rounds of a run on CI by their
  median.

None of them is part of `npm test`. The **Performance** workflow
(`.github/workflows/perf.yml`) runs them in one of three modes and keeps the
reports as an artifact for 30 days:

- **plans**, the seed and the plan check: on every pull request that
  changes `server/src/` or `perf/`. It loads the last small volume seeded on
  `main` when the seed's own code is unchanged, and migrates it forward, so
  it takes minutes, not a quarter of an hour.
- **budgets**, plans plus the budgets and the concurrency check: by hand on
  a branch whose speed is in question (Actions → Performance → Run
  workflow).
- **full**, budgets plus the 100-connection stress pass: weekly on `main`,
  on each release candidate tag (`v*-rc.*`), and by hand. Timed runs always
  seed fresh.

A timed run, budgets or full, is three rounds and a fourth job that judges
them (ADR-051, amended November 2026; #342). Shared runners vary by about
30% from run to run, so one run cannot tell a 10% change from the machine:

- **Each round is a job of its own,** "Performance, full, round 1 of 3" and
  so on, one after another, each seeding fresh on its own runner. Each
  times the budgets and the concurrency check at 10 connections. The first
  round alone adds the stress pass, in a full run, and the plan check.
- **"Performance, full, the median of 3 rounds"** takes, for each endpoint,
  the median of the three rounds' 95th percentiles, and judges it against
  the budget and the known miss's ceiling, below. One slow round no longer
  fails the run; two slow rounds do, and that is a finding.

## Running it locally

Everything below runs from `server/`. Use a fresh database for each scale,
so a large run is not measured against small-scale leftovers and the other
way round.

```bash
# Once per scale: an empty database next to the dev one.
docker exec foundation-postgres createdb -U app foundation_perf
export PERF_DB=postgresql://app:<password>@localhost:5432/foundation_perf

# Schema, the permission vocabulary, then the volume.
DATABASE_URL=$PERF_DB npm run migrate
NODE_ENV=test DATABASE_URL_TEST=$PERF_DB npm run seed
NODE_ENV=test DATABASE_URL_TEST=$PERF_DB npm run seed:volume -- --scale small

# The server, built, in a second terminal. Stop the dev server first, or add
# PORT=3200 here and --url http://localhost:3200 to npm run perf.
npm run build
NODE_ENV=test DATABASE_URL_TEST=$PERF_DB RATE_LIMIT_MAX=1000000 node dist/main

# Back in the first terminal.
npm run perf
NODE_ENV=test DATABASE_URL_TEST=$PERF_DB npm run perf:plans
```

Why each setting is there:

- **`NODE_ENV=test`** makes the server log nothing. In development it writes
  every request through pino-pretty at debug level, which costs more than
  some of the queries being measured. In test mode the server and the
  scripts read `DATABASE_URL_TEST`, which is why that variable carries the
  perf database; values given on the command line win over `.env`.
- **`RATE_LIMIT_MAX`** is raised because ten connections with no pause pass
  the default 100 requests a minute in well under a second. `npm run perf`
  stops at the first 429 rather than report the limiter's numbers.
- **`node dist/main`** rather than `start:dev`: the watcher and on-the-fly
  compilation are not what production runs.

`seed:volume` takes `--scale small|large`, `--organizations n` (default 5)
and `--seed n` (default 51; the same seed writes the same data). Small takes
about 7 minutes; large an hour or more, since every service call is its own
transaction. It writes `perf/volume-<scale>.json`, which `perf` and
`perf:plans` read to sign in and find their way, by their own `--scale`
(small when not given). Seeding one scale leaves the other's in place.

Each organization also gets a team (ADR-081): 15 members at small and 150
at large, the Owner and the newcomer among them, holding one to three roles
of the 4 or 12 its Owner made, and a few invitations pending. The manifest
names one member holding three made roles, for the access query's plan.
At the year's end, a fifth of each organization's items get a reorder
point, about a third of them set above what is free, so low unless enough
is on its way (ADR-085).

For large, give it a database of its own and skip the commit flush while
seeding. It is safe for a throwaway database and several times faster, but
must be undone before measuring, or writes would look faster than
production:

```bash
export PERF_DB_LARGE=${PERF_DB}_large
docker exec foundation-postgres createdb -U app foundation_perf_large
docker exec foundation-postgres psql -U app -d foundation_perf_large \
  -c 'alter database foundation_perf_large set synchronous_commit = off'
DATABASE_URL=$PERF_DB_LARGE npm run migrate
NODE_ENV=test DATABASE_URL_TEST=$PERF_DB_LARGE npm run seed
NODE_ENV=test DATABASE_URL_TEST=$PERF_DB_LARGE caffeinate -is npm run seed:volume -- --scale large
docker exec foundation-postgres psql -U app -d foundation_perf_large \
  -c 'alter database foundation_perf_large reset synchronous_commit'
```

Then measure it as above, with `$PERF_DB_LARGE` for the database and
`--scale large` on both commands:

```bash
npm run perf -- --scale large
NODE_ENV=test DATABASE_URL_TEST=$PERF_DB_LARGE npm run perf:plans -- --scale large
```

`caffeinate` keeps the Mac awake but cannot stop a closed lid from sleeping
it. A sleep pauses the seed, which carries on when the Mac wakes.

`npm run perf` takes `--scale small|large` (default small), `--url`
(default `PERF_URL`, then `http://localhost:3000`) and `--skip-stress` for a
quicker run. `--round <n>` marks the run as one of CI's rounds: its budgets
then fail nothing, since the median judges them, and its report says which
round it was.

## What a run measures

At 10 connections, each sending its next request as soon as the last one
answers:

- **Reads, p95 under 300 ms:**
  - the order list (open, all, a deep page), an order, the Inventory page's
    two calls (`/stock` and `/stock/availability?promised=true`), a deep
    page of `/stock` and a search, the unfiltered availability list (no
    screen reads it; kept to watch it), the movement list (first page, a
    deep page, one product), the invoice list, and a lot trace;
  - search (ADR-056): the lookup for a code in part, a name and a typo; the
    order list searched; Products by one Chinese character and the item
    pickers by pinyin, both asked in Chinese; and Partners by part of a
    name; and Products unsearched, asked in Chinese, which sorts and names
    every product by the name shown;
  - Home (ADR-058), an owner's and a newcomer's, and Recently opened;
  - dates and sorting (ADR-057): the first page of the invoices by total,
    the orders by expected date and the stock by expiry, and the invoices
    and movements of the last thirty days.
- **Writes, p95 under 500 ms:** receiving into a new lot, shipping with
  lots chosen earliest expiry first, issuing an invoice, issuing a credit.
  Perf makes its own orders and invoices for these before timing, so it
  reruns on the same seed.

A budget passes only within its time and with no errors. Budgets fail the
run at small scale; at large they are shown but do not fail, since they
were set for the small scale. A known miss, below, is the one exception.
On CI, the time is the median of the three rounds' 95th percentiles, and an
error in any round fails the budget.

The **concurrency check** ships one product 200 times from 10 connections
across four orders, then checks that no request failed (a deadlock is a
500), that stock went down by exactly what shipped, and that each order
shipped what its shipments say. It fails the run at either scale; on CI,
it fails its own round's job, since it is no timing.

The **stress run** repeats everything at 100 connections. It never fails:
it shows where response time starts to climb. The server's database pool
holds 10 connections, so at 100 the queue for those is part of what it
shows.

## Known misses

A budget missed for a reason already filed may carry a known miss
(ADR-082): its issue, an end date and a ceiling. Through the end date, a
95th percentile over the budget, at or under the ceiling and with no errors,
reads "over budget, known: #225" and does not fail the run. Past the
ceiling, with an error, or from the day after the end date, it fails as any
miss does. The date is the run's, in UTC, on CI its first round's; the
weekly run starts at 11:00 UTC, the same day in Vancouver. The summary lists
each known miss under the budgets, with its issue, its date and its ceiling,
whether this run met it or not. On CI, the median is what meets it or not.

None today.

Home's, #276, the second, ended with Home's redesign, ADR-091: Home reads
each tile's count and no rows, its own reads in one transaction, where it
read eight cards' rows in transactions of their own (ADR-051's amendment
for ADR-091). It counts as fixed at a median of 240 ms or less on
GitHub's runners, and measured 177 ms on the branch's timed run, from
rounds of 133, 191 and 177, on runners as fast as the typo lookup's
second run, where Home measured 314. It had missed from 1 November 2026:
249 ms the night before, then 329, 321 and 308 in three runs on ADR-085's
branch, on runners about 1.35× slower on every other budget too, with
the same plans.

The typo lookup's, #225, the first, ended with the three changes that
brought its budget back, each an amendment of ADR-051: the lookup sends
each pass as one statement, where it sent one statement a kind; every
trigram index leads with the organization (migration 0077); and an
order's partner is matched through an array of the matching partners'
ids, which the orders' indexes join. It counts as fixed at a median of
240 ms or less on GitHub's runners, and measured 231 ms on the branch's
second timed run. It had gone once before, when
weekly run 114 measured 207 ms on 26 October 2026, too soon: on 29
October, on runners about 1.45× slower than the day before, `main`
measured 340 ms and #260's branch 333, 358 and 363.

To add one, give the scenario in `perf/scenarios.ts` a `knownMiss`:

```ts
{
  ...read('GET /lookup?q=typo', () => '/lookup?q=fokus%20dialy'),
  knownMiss: { issue: '#225', until: '2026-11-30', ceilingMs: 450 },
},
```

with a comment saying since when it has missed. A known miss is never added
without an issue and a date: it says the budget is owed, the date turns the
run red again if it is not paid, and the ceiling keeps a miss that grows
from passing as known. Its type requires both, and `perf/report.spec.ts`
checks their form. Raising the budget instead would forget it. The known miss goes with the
fix that brings the budget back.

## The plan check

`npm run perf:plans` calls the real list and ledger services, and the
access query (ADR-080), in the first seeded organization of its `--scale`
(small by default), records the SQL they send, and runs
`EXPLAIN (ANALYZE, BUFFERS)` on each statement in a transaction it rolls
back. It fails on a sequential scan of a table the planner estimates at
10,000 rows or more (`--min-rows` to change). It warns when the manifest
lists one organization: every row is then that organization's, so a full
scan is the right plan and says nothing about a busier database. A scan
that is the decision rather than an accident goes in the allow-list in
`perf/plans.ts`, with the reason; valuation's is the one there today. An
`exists` that a scan answers at its first match is not a reason: for an
organization with no such row, the scan reads every organization's
(#187). Every plan goes to `perf/reports/<time>-<scale>-plans.json`.

## Reports

Each run writes `perf/reports/<time>-<scale>.json` and prints a markdown
summary. When a report of the other scale exists, the summary adds the p95
at that scale and the growth from small to large. Over 3× is flagged: the
endpoint reads in proportion to the data rather than to a page, which is
fine today and a problem by the time a customer reaches that size.

A CI run starts with an empty reports folder, so its summary has no growth
column. Compare scales locally, or download both artifacts into
`perf/reports/` and rerun `npm run perf` at either scale.

## Reading a timed run on CI

The run's summary page shows each job's summary in turn, the three rounds'
and then the median's:

1. **Read the median job's summary first.** For each endpoint it gives the
   median 95th percentile, each round's figure beside it, the errors of
   all three, the budget and the result; then each known miss judged on the
   median, each round's concurrency check, and each probe's plan time from
   the first round's plan check: its statements' planning and execution,
   explained once with no load beside them.
2. **A median over its budget is the finding.** One round far from the
   other two is its machine, which the median leaves out. When a median
   misses, compare the probe's plan time with the last run's: slower, and
   the query is where to look; as before, and it is the runners or what
   only load shows, which a run by hand on the same commit tells apart.
3. **Each round's own summary** has its full table (p50, p95, p99, requests
   a second), and in the first round the stress pass and the plan check's
   own table. A round's budget marked "over budget" there fails nothing.

What fails a run:

- **A median over its budget**, or past its known miss's ceiling or date,
  or an error in any round: the median job.
- **A round with no report**, most often because its job failed before
  writing one: the median job refuses to judge two rounds, so its message
  names the round to open.
- **A concurrency check that failed:** that round's job.
- **The plan check:** the first round's job, as in the plans mode.

A round that failed on its runner can be run again alone, "Re-run failed
jobs", then the median job after it: the round's artifact is overwritten,
so the run is judged without timing all three again.

Each round keeps its reports and the server's log as an artifact,
`perf-<mode>-<scale>-<run>-round-<n>`, for 30 days. To judge a run again
locally, from `server/`:

```bash
gh run download <run id> --dir ../tmp/perf-<run id>
npm run perf:judge -- ../tmp/perf-<run id>
```
