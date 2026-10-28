---
status: accepted
date: 2026-08-27
areas: [authorization]
amended-by: [ADR-079, ADR-080]
---

# ADR-016 — Permissions resolved per request

## Context

ADR-004 scopes roles through membership, so a request's permissions are a
property of `(user, current_org)` rather than of the user. The question left open was
where that resolution happens: cached somewhere, or queried on each request.

## Decision

Query on each request. `PermissionGuard` reads `role_id` off the request
context and joins `role_permissions` to `permissions`. Nothing is cached on the session
row, the request context, or in memory.

## Consequence

A demoted or removed user loses access on their next request rather than
at session expiry — the failure ADR-011's binding rules name explicitly. The cost is one
indexed join over two small tables (nine permissions, three roles per organization) that
Postgres keeps in shared buffers.

If that ever shows in a latency profile, the cache belongs on `role_id -> Set<key>` with a
short TTL. Roles are configuration and change rarely; *which* role a user holds is what
changes on demotion, and that lookup stays per request regardless. Caching by user or by
session is the unsafe version. In-memory would break across instances the way the
throttler does, so it lands with Redis (ADR-005) or not at all.

Per-request resolution is also what keeps ADR-004's "extend rather than replace" viable
for resource-scoped rules: those cannot be precomputed into a set, because they need the
resource in hand.

## Consequence — the `UNSAFE_GLOBAL_DB` exemption list is closed

Only `core/auth` and
`core/authorization` may import it, both for structural reasons: auth resolves a user by
email before any organization is known, and authorization reads a catalogue that has no
`organization_id` by design. Feature modules needing a transaction across a global and a
scoped table use `TenantDb.transaction()`, which supplies the organization from tenant
context.

Scoping inside that callback is manual by necessity — a transaction exists precisely
because its statements differ, so no wrapper can make it mechanical — and is covered by
the tenant-isolation suite rather than by types.

## Known gap, carried from ADR-004

Nothing prevents an Admin assigning the Owner role.
Permission strings cannot express "not above your own level"; that rule belongs in the
service performing the assignment.

Closed at step 9 in `UsersService.updateRole()`, as three rules rather than one: an Admin
cannot assign the Owner role, an Admin cannot change an Owner's role at all, and the last
Owner cannot be demoted regardless of who is asking. The second was found by hand after
the first two had e2e coverage — guarding the *grant* while leaving the *removal* open
meant an Admin could strip an Owner whenever a second Owner existed, and the sole-Owner
conflict hid it in every organization that had only one. All three now have coverage.

The general form — a role hierarchy that would let *any* role be compared against another
— is still open, and arrives with role editing rather than with assignment.

## Amendment (October 2026) — the exemption list is not closed; it lives in the lint config

The list above grew three times without this ADR saying so:
`core/notifications`, scoped by recipient, since an account notification may belong to
someone in no organization (ADR-036); the files purge (ADR-059); and the licence
reminders (ADR-064), the last two each going through every organization in one hourly
pass with no request behind it. The lint rule also covered only the folders it named,
so `modules/`, and later `common/`, went unchecked by default.

The rule now refuses `UNSAFE_GLOBAL_DB` and `PG_POOL` across `server/src/`, and its
exceptions are listed once, in `server/eslint.config.mjs`, each with its reason. Two
joined only because the wider rule reached them: `src/database/`, where the handle and
`TenantDb` are defined and the seeds run, and the health check's ping of the pool.

A new exception is acceptable only where there is no tenant to scope to: work that runs
before any organization is known, reads data that has no `organization_id`, or goes
through every organization with no request behind it. Anything with a tenant uses
`TenantDb`, and `TenantDb.transaction()` for a global and a scoped table together. A new
exception adds its line and its reason to that file, and nothing else lists them.

## Amendment (October 2026) — each permission gates what it says (ADR-079)

A member's role is changed with `roles.assign`, and the roles
list is read with `roles.view`. `users.update`, which then gated nothing,
was dropped by migration 0071: a seeded permission that gates nothing
goes, rather than waiting for a feature to need it.

## Amendment (October 2026) — the role hierarchy (ADR-080)

Permissions are
still read on every request, through one service in `core/authorization`,
from a membership's roles added together. The hierarchy this ADR left open
is a comparison of permissions: a role is given, and a member changed or
removed, only by someone whose roles hold everything it grants, and its
three Owner rules keep their words. Every change that can take away an Owner
counts the Owners under one lock.
