---
paths:
  - "server/src/database/**"
  - "server/drizzle.config.ts"
  - "server/.squawk.toml"
  - "server/perf/**"
  - "server/test/{schema,tenant-isolation}.e2e-spec.ts"
  - "server/test/utils/reset-db.ts"
---

# Database: the code rules, for Claude

What to keep true when changing the schema, a migration, a seed or a query.

- **Every query goes through `TenantDb`.** `UNSAFE_GLOBAL_DB` and
  `PG_POOL` are refused by lint outside `server/src/database/` and the
  files `server/eslint.config.mjs` lists, each with its reason (ADR-003,
  ADR-009; [conventions.md, Module boundaries](../../docs/conventions.md#module-boundaries)).
- **The organization goes in every join's ON clause;** an `exists` is
  ordered as an index is and takes one row (ADR-058; the same section).
- **A migration:** `npm run migrate:new -- --name <name>`, hand-written
  parts after `--> statement-breakpoint`, then `npm run migrate:all`;
  the SQL keeps `NULLS NOT DISTINCT`, and the journal's new `when` is
  later than the one before ([engineering.md, Process](../../docs/engineering.md#process)).
  A copied snapshot gets a fresh `id`, and the previous one's as `prevId` ([conventions.md, Migrations](../../docs/conventions.md#migrations-against-the-running-release-adr-081)).
- **Expand, then contract:** add, and take away nothing the running
  release reads, a key a released `ON CONFLICT` names included (ADR-081; [conventions.md, Migrations](../../docs/conventions.md#migrations-against-the-running-release-adr-081)).
- **A new table** takes `primaryKey()` (UUIDv7, ADR-010), ADR-012's
  cascades (`organization_id` cascades, actors restrict) and, with
  `updated_at`, its own trigger, which drizzle-kit never writes; with an `organization_id`, it is in the export or in `NOT_EXPORTED` ([conventions.md, A new table](../../docs/conventions.md#a-new-table-and-the-organizations-export)).
- **Money and quantities are `numeric` and a calendar day `date`,** all
  read as strings, as Drizzle's node-postgres driver returns them, which
  `server/test/calendar-days.e2e-spec.ts` holds (ADR-025; ADR-052,
  amended); a raw query's rows have a type of their own (ADR-068).
- **No joins, no table name:** in a correlated subquery, name the outer
  row in plain SQL; and never `AT TIME ZONE`, but `todayIn` and `dayIn`
  ([engineering.md, Server](../../docs/engineering.md#server); ADR-072).
- **The seeds grow:** `seed-demo.ts` with what a feature's screens need,
  `seed-volume.ts` with a new table's rows, a new hot query in `npm run
  perf:plans` ([conventions.md, Seeds](../../docs/conventions.md#seeds); ADR-051).
