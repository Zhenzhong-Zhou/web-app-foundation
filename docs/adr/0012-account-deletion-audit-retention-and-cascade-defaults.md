---
status: accepted
date: 2026-08-24
amended-by: [ADR-069, ADR-070]
---

# ADR-012 — Account deletion, audit retention, and cascade defaults

> **Amended by [ADR-069](0069-deleting-your-account-and-leaving-an-organization.md).**
> An organization's only member is not deleted with it: they cannot delete their account while it exists. The export is the person's own data, not the rows they authored, which belong to the organization. Everything else stands.
>
> **Amended by [ADR-070](0070-deleting-an-organization.md).**
> An organization is deleted with every row it owns, its audit log included: deleted on purpose by the one path that deletes an organization, not anonymized and kept, since the business keeps its records through the export. The audit log's `RESTRICT` stays, so nothing else can delete it.

## Context

The right to erasure conflicts with an audit log whose value depends on being
complete and tamper-evident. Statutory retention periods can also override an erasure
request outright. Deleting audit rows defeats their purpose; refusing to delete anything
is not an option either.

A second, larger question sits underneath: when a user leaves, who owns the work they
created?

## Decision — ownership

The organization owns business data; the user only authored it.
Two columns with strictly separate jobs:

- `organization_id` — **ownership**. Governs lifecycle.
- `created_by` / `actor_id` — **attribution**. Never governs lifecycle.

A departing employee's projects remain with the organization, still attributed to their
tombstoned user record. The alternative — a company losing its data because an employee
closed an account — is indefensible.

## Decision — the deletion flow

1. Request sets `deletion_scheduled_at`; a **30-day grace window** follows. Reversible
   until it elapses.
2. If the user is the sole Owner of an org that has **other members**, deletion is
   **blocked** with an explicit error until ownership is transferred. Never cascade
   silently.
3. If the user is the org's **only** member, that org is personal — delete it with them.
4. Data export is offered during the grace window (see below).
5. On elapse, anonymize.

| Table         | Action                                                                                                     | Rationale                                                              |
|---------------|------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------|
| `sessions`    | Hard delete                                                                                                | Live credentials                                                       |
| `users`       | Soft delete: `deleted_at` set, email -> `deleted-<uuid>@invalid`, name -> `Deleted User`, password cleared | Preserves FK targets for attribution                                   |
| `memberships` | Delete                                                                                                     | No longer in the organization                                          |
| `audit_log`   | **Rows retained**; `actor_id` continues to reference the tombstone                                         | The event survives; the row it points to no longer identifies a person |

The email is **released** — anonymizing frees the unique constraint, so the same address
may register again as a new user.

Deletion and deactivation are distinct and must not be conflated in the API or UI:
suspension (Account Status) is reversible and preserves everything; deletion is not.

## Decision — retention

Audit rows are retained for **24 months**, after which `ip` and
`user_agent` are nulled while the event itself is kept. Those fields are personal data in
their own right and must not outlive the window simply because they sit on a row that does.

## Decision — cascade defaults

Applied to every table added from here on:

| Foreign key                                | Rule                                                           | Reason                                                                        |
|--------------------------------------------|----------------------------------------------------------------|-------------------------------------------------------------------------------|
| `organization_id`                          | `ON DELETE CASCADE`                                            | Org owns the data                                                             |
| `user_id` on sessions, memberships, tokens | `ON DELETE CASCADE`                                            | Exists only to serve that user                                                |
| `created_by`, `updated_by`, `actor_id`     | `ON DELETE RESTRICT`                                           | Attribution must outlive the actor                                            |
| any FK on `audit_log`                      | `RESTRICT` — **never cascade**, including from `organizations` | Cascading org deletion would destroy records required for the 24-month window |

Because users are soft-deleted, the `RESTRICT` constraints should never fire in normal
operation. That is the point: they are a **tripwire**. A future hard `DELETE FROM users`
is refused by the database rather than silently shredding the audit trail.

Organization deletion is handled by its own anonymization pass over `audit_log`, never by
cascade.

## Decision — export

JSON export offered during the grace window, scoped to the user's
personal data plus rows they authored. Portability is a separate right from erasure, so it
cannot be satisfied by deletion alone. Organization-wide export is deferred — `created_by`
is what keeps it buildable later.

## Consequence

Users must never be hard-deleted; every code path deletes softly.
`audit_log` writes must capture `actor_id`, `organization_id`, `ip`, and `user_agent` at
event time, since the user row will later stop identifying anyone. A scheduled PII-stripping
pass is required at the 24-month boundary — with no job queue in V1 (ADR-005), this runs as
a cron'd SQL statement until BullMQ arrives.

## Caveat

Retention periods, lawful basis, and what constitutes adequate anonymization
vary by jurisdiction, and this log is not legal advice. The decisions above make the schema
*capable* of compliance, which is the expensive part to retrofit; the specific policy
warrants professional review before handling real EU user data.
