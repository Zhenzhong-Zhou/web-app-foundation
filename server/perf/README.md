# Performance runs (ADR-051)

Two commands, run against a database of their own:

- `npm run seed:volume` writes a year of data for several organizations;
- `npm run perf` measures a running server against the budgets.

Neither is part of `npm test` or of CI on a pull request.

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
minutes; large is for an overnight run. It writes `perf/volume.json`, which
`perf` reads to sign in and find its way.

`npm run perf` takes `--url` (default `PERF_URL`, then
`http://localhost:3000`) and `--skip-stress` for a quicker run.

## What a run measures

At 10 connections, each sending its next request as soon as the last one
answers:

- **Reads, p95 under 300 ms:** the order list (open, all, a deep page), an
  order, the Inventory page's two calls (`/stock`, `/stock/availability`),
  the movement list (first page, a deep page, one product), the invoice
  list, and a lot trace.
- **Writes, p95 under 500 ms:** receiving into a new lot, shipping with
  lots chosen earliest expiry first, issuing an invoice, issuing a credit.
  Perf makes its own orders and invoices for these before timing, so it
  reruns on the same seed.

A budget passes only within its time and with no errors. Budgets fail the
run at small scale; at large they are shown but do not fail, since they
were set for the small scale.

The **concurrency check** ships one product 200 times from 10 connections
across four orders, then checks that no request failed (a deadlock is a
500), that stock went down by exactly what shipped, and that each order
shipped what its shipments say. It fails the run at either scale.

The **stress run** repeats everything at 100 connections. It never fails:
it shows where response time starts to climb. The server's database pool
holds 10 connections, so at 100 the queue for those is part of what it
shows.

## Reports

Each run writes `perf/reports/<time>-<scale>.json` and prints a markdown
summary. When a report of the other scale exists, the summary adds the p95
at that scale and the growth from small to large. Over 3× is flagged: the
endpoint reads in proportion to the data rather than to a page, which is
fine today and a problem by the time a customer reaches that size.
