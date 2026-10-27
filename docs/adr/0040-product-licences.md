---
status: accepted
date: 2026-09-22
amended-by: [ADR-050, ADR-052]
---

# ADR-040 — Product licences: a table, dated, and fixed once a run relies on one

> **Amended by [ADR-050](0050-licence-status-at-release.md).**
> Release now checks a licence's status against an organization policy and records it on the run.
>
> **Amended by [ADR-052](0052-calendar-days-are-date-sent-as-yyyy-mm-dd.md).**
> A licence's dates are `date` columns, sent as `YYYY-MM-DD`, rather than UTC midnight in `timestamptz`; they still compare as UTC days. Everything else stands.

**Context.** `product_licences` and `boms.licence_id` were in the schema from
ADR-029 with nothing able to write them, so a recipe could not carry the
registration it is made under — for a natural health product in Canada, its
NPN, and the first thing a regulator asks about a batch.

**Decision — a table, not a column.** One licence covers several recipes:
Focus 60ct and Focus 120ct are two formulations of pack size under one NPN.
The number is identity rather than history, so it stays editable on the
licence row, and correcting a typo corrects every recipe that points at it.
One number per authority: the same digits could be issued by two regulators,
but not twice by one.

**Decision — no delete.** A recipe made under a licence keeps pointing at it,
and that is what a finished lot traces back through. Withdrawn is
`is_active = false`.

**Decision — on the recipe, not the product.** A licence covers a
formulation. Putting it on the product would attach one number to every
formulation ever sold under that name, and a reformulation — which may need
a new licence — is a new recipe version.

**Decision — changeable on an active recipe until a run uses it.** A
promoted recipe is otherwise frozen (ADR-029). The licence is the exception,
because the NPN routinely arrives weeks after the formulation is settled,
and recording it by drafting a version identical but for a number would put
a fiction in a history whose job is to say when the formulation changed. It
locks the moment a run references the recipe, planned or not: from then on
the number is a claim about what that run is making. Archived recipes never
reopen. `GET /v1/boms/:id` returns `licenceLocked` so the client does not
infer the rule.

**Decision — two nullable dates, status derived.** `issued_at` and
`expires_at`, both nullable. An NPN does not expire — it stays valid while
the product is marketed and compliant — while an FDA registration, an export
certificate or an ISO listing does. The client derives the status rather than
storing it: *In force from* (issued in the future, the renewal-or-transfer
case), *Current*, *Expires in N days* inside sixty, *Expired*, and
*Withdrawn* — only the last of which is a decision anybody makes. Days are
compared in UTC, because a calendar day is written as midnight UTC. Pickers
offer only usable licences; a recipe already pointing at one keeps it.
`issued_at <= expires_at` is a check constraint, since a row in the other
order would make every derived status wrong at once.

**Decision — its own permissions.** `product_licences.view/create/update`
rather than reusing `products.*`: whoever keeps registrations current is not
always whoever edits the catalogue. No delete permission, because there is
no delete.

**Decision — tenant-scoped at the recipe.** The foreign key is global like
every id, so the BOM service checks the licence belongs to the organization
before attaching it. Without that, another tenant's licence id was accepted,
and the recall trail pointed outside the organization (ADR-003).

**Consequences.** A run copies its licence at release — the id, and the
number and authority as text — alongside the lines ADR-029 already copies,
so correcting a licence row changes the registry, not what finished
batches were made under. Runs released before this carry no licence.
Deferred: a status enum (suspended, cancelled, superseded), a notification
sixty days before expiry, site licences — which belong on the organization
or a partner, not a recipe — and amendment history.
