---
status: accepted
date: 2026-08-24
areas: [organizations, database]
---

# ADR-003 — Multi-tenancy: shared schema with `organization_id`

## Context

It is not yet known whether this will serve one organization or many
customers. The cost of the two mistakes is wildly asymmetric: designing for multi-tenancy
and never needing it costs one column and one seed row. Retrofitting tenancy onto a live
single-tenant database touches every table, every query, and every role assignment.

## Decision

Design multi-tenant from day one, using a **shared schema** in a single
database. Every tenant-scoped table gets `organization_id NOT NULL`, a foreign key, and an
index — created with the table, never added later. One "Default Organization" row is
seeded. Schema-per-tenant and database-per-tenant were both rejected: they are only
justified by hard compliance/isolation requirements and are far harder to reverse.

## Consequence

The tenant filter must live in **one place** — a request-scoped context
plus a base query layer that always applies it. If `where organization_id = ?` gets
scattered across services by hand, data will eventually leak between tenants. This is the
single highest-risk area of the codebase and needs a test.

Postgres Row-Level Security may be added later as defence in depth. It is cheap to add
*because the column already exists* — the column is the irreversible decision, RLS is not.

Deferred as additive, not blocking: organization signup/onboarding, org switcher UI,
per-org settings overrides, per-org billing.

## Deferred

- **Composite foreign keys,** `(organization_id, id)`, so the database
  itself refuses another organization's id (added 29 October 2026, #317).
  Every write checks each id from a body in its service today, through
  `assertOwnIds`; three services were found without that check and fixed.
  Trigger: a fourth found writing another organization's id.
