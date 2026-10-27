---
status: accepted
date: 2026-09-21
amended-by: [ADR-076]
---

# ADR-038 — An audit row names its resource as it was at the time

**Context.** An audit row recorded a type and an id. The organization-wide
log therefore read as a column of "Product updated" with no way to tell which
product, short of opening each one, and a deleted record could not be named at
all.

**Decision — snapshot a label at write time, in `audit_log.resource_label`.**
It is resolved after the handler, so an update records the name it was changed
*to*, and is then never touched. A rename changes the record and not its
history. A deleted record keeps a name.

**Rejected: joining current names at read time.** It is wrong in the case that
matters most. After a rename, every earlier row would carry the new name, so
the log would claim something was created under a name it never had. It also
needs a join per resource type in one polymorphic query.

**Decision — one resolver per resource type, in the audit module, not a call
in each service.** There are forty-odd audited routes and nine types, and each
lookup is a primary-key read through TenantDb. `recordPrevious()` stays the
mechanism for *values*, which only the service can see before the change.
Every audited deletion here removes a child of the keyed resource (a line, an
address, a contact) rather than the resource itself, so reading after the
handler always finds the row. If that changes, the deleting service can supply
the label before it deletes.

**Decision — no label for `user`.** A member's name in a 24-month table would
outlive the anonymisation ADR-012 performs on the user row, and the audit log
would become the one place a removed person is still named. Member events keep
resolving through the actor and user joins, which respect the tombstone.

**Decision — a failed label never costs the row.** The resolver swallows its
own errors and writes null. A missing word in the log is cheap; a missing audit
row is not.

**Consequences.** One extra indexed read per audited write. Rows written before
this migration have a null label and show the action alone; they are not
backfilled, because a backfill would write today's names onto past events —
the exact error this decision exists to avoid. Adding variants now records the
SKU (`fields: ['sku']`), since the row names the product and the payload is
what says which variant.
