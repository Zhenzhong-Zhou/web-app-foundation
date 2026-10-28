---
status: accepted
date: 2026-08-24
areas: [authorization, organizations]
amended-by: [ADR-080]
---

# ADR-004 — Roles scoped through membership

> **Amended by [ADR-080](0080-job-roles.md).**
> A membership holds one or more roles, each a row of `membership_roles`, rather than one `role_id`, and an organization can make roles of its own. Everything else stands.

## Context

The obvious design is `user → role → permissions`. It breaks as soon as a
user belongs to two organizations, which is normal in any multi-tenant system.

## Decision

Roles attach to a **membership**, not to a user:

```text
users (global identity)
memberships (user_id, organization_id, role_id)
roles → role_permissions → permissions
```

Permissions are strings (`users.create`, `reports.view`) checked by a guard.

## Consequence

A user can join a second organization with different roles, with no data
migration. Registration must create user + organization + Owner membership **in a single
transaction**. Permission checks must always resolve through the membership for the
*current* organization, never through the user alone.

This has a direct cost: authentication alone is not enough context. Every request needs
both the identity *and* the current organization, so the session carries a current-org
reference and org switching becomes a real concept. Corollary: permissions **cannot** be
cached globally per user, and roles must not be baked into a long-lived token.

Known limitation: string permissions handle global rules well but not resource-scoped ones
("Bob can edit *these* projects"). If that requirement appears, extend rather than replace —
attach a scope to the membership or adopt CASL-style ability rules.

Accepted as deliberate over-engineering if this only ever serves one organization: the
membership table then costs one unused join. The reverse mistake — `users.role` needing to
become multi-org later — rewrites every permission check against live data.

## Amendment (October 2026) — several roles to a member (ADR-080)

A
membership holds one or more roles, each a row of `membership_roles`, and
may do whatever any of them allows; `memberships.role_id` is gone (migration
0073). Owner stands alone. Organizations make roles of their own; Owner,
Admin and Viewer stay fixed.
