---
status: accepted
date: 2026-08-24
areas: [database]
---

# ADR-009 — Drizzle for schema, migrations, and queries

> **No longer so: Drizzle's studio.**
> `drizzle-kit studio`, which `npm run db:studio` in `server/` opens, is the equivalent of Prisma Studio that *Consequence* below says Drizzle lacks. Everything else stands.

## Context

Candidates were Prisma, Drizzle, Knex, and hand-written SQL over the raw
`pg` driver.

Knex was rejected: weak TypeScript inference (query results arrive effectively untyped)
and every migration hand-written, which gives up the main reason for choosing TypeScript.

Raw `pg` was rejected as the primary query layer for a reason specific to ADR-003. SQL
strings scattered across services provide no central place to enforce the
`organization_id` filter. Every query becomes an independent opportunity to forget it,
and one omission is a cross-tenant data leak.

Prisma has the stronger schema-first migration experience, but two things counted against
it here. Its schema language cannot express partial indexes, check constraints, or RLS
policies, so complex DDL drops to hand-written SQL inside Prisma migrations anyway — and
ADR-003 explicitly anticipates adding RLS. Its generated client is also harder to wrap in
a tenant-scoped layer that cannot be accidentally bypassed.

## Decision

Drizzle. Specifically:

| Package              | Role                                                   |
|----------------------|--------------------------------------------------------|
| `drizzle-orm`        | Table definitions **and** queries                      |
| `drizzle-kit`        | CLI that diffs the schema and generates migration SQL  |
| `pg` (node-postgres) | Driver — configured once at startup, not used directly |

Each table is defined once; the same definition feeds migrations and query types.

## Consequence

`drizzle-kit generate` emits plain `.sql` files that are readable,
hand-editable, and committed as source code — the correct place to add RLS policies
(ADR-003), partial indexes, and triggers. Queries stay close to SQL, which suits existing
Postgres experience.

Binding rule from ADR-003: **services must not import `db` directly.** They go through a
tenant-scoped query helper that always applies the `organization_id` filter. Direct `db`
access in a service is a review-blocking defect.

Escape hatch for queries the builder cannot express (window functions, recursive CTEs):
the ``sql`` `` template, which still parameterises values safely.

Cost: smaller ecosystem and fewer tutorials than Prisma, and no equivalent of Prisma
Studio. Accepted.
