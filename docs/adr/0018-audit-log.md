---
status: accepted
date: 2026-08-28
amended-by: [ADR-076]
---

# ADR-018 — Audit log: an interceptor, and silence by default

**Context.** ADR-012 requires audit rows to carry `actor_id`, `organization_id`,
`ip`, and `user_agent` captured at event time, and to be retained for 24 months.
It did not say where the write happens or which events qualify.

**Decision — write from an interceptor, opt in per route.** `@Audited()` marks a
handler; everything else records nothing. The alternative — every service
calling `audit.record()` — puts the same four lines in every write path and
relies on nobody forgetting them.

The default is silence rather than recording everything, which means **reads are
not audited**. A dashboard load is twenty GETs, each row is a 24-month retention
commitment, and "who changed this record" is the question people ask where "who
looked at it" is not. Regulated data (HIPAA-style access logging) would change
that for specific resources, not globally.

**Decision — a separate past-tense vocabulary.** `AUDIT_ACTIONS` holds
`user.created`, not `users.create`. A permission is a capability someone holds;
an action is an event that occurred. Login and password reset are worth
recording and are gated by no permission, and one permission can gate several
distinct actions.

**Decision — `concatMap`, not `tap`.** The row is written before the response
goes out, so a client reading the log immediately afterwards does not race the
write. The error path bypasses the operator entirely: a failed action is not an
action.

A failed *write* is logged and swallowed. The action has already committed by
then, so failing the request would report failure for something that happened,
and the caller would retry and do it twice.

**Decision — never record the request body.** `POST /v1/users` carries a
password. `payload` is opt-in and explicit, or it is absent. The reasoning that
made pino redact those fields applies harder to a row kept for two years.

**Decision — keyset pagination.** `GET /v1/audit` pages on a UUIDv7 cursor:
`where id < $cursor order by id desc limit n`, one index scan at any depth
because ADR-010 made ids time-sortable. Offset paging has a correctness bug on
an append-only table — new rows shift every page down, so a reader silently
misses entries. `limit` is capped at 100; one extra row is fetched to derive
`nextCursor` without a `count(*)`.

`actor_email` is joined server-side through `selectJoinedLeft`. The join is
*left* because a tombstoned actor (ADR-012) must not drop its own audit row —
under-reporting is the one failure a log cannot have. It is joined at all
because a tombstone is absent from `GET /v1/users`, so no client could resolve
the id itself.

**Consequence — the row is not in the same transaction as the action.** An
interceptor runs after the handler returns, so a crash between the two loses the
row. Writing inside the transaction would mean every service knowing about
auditing, which is the coupling this decision exists to avoid. Acceptable while
the audit log is a strong default; revisit if tamper-evidence ever has to be a
guarantee.

**Consequence.** `@Audited()` on a `@Public()` route logs a warning and writes
nothing: `audit_log.organization_id` is `NOT NULL` by design, and there is no
tenant to attribute the event to.
