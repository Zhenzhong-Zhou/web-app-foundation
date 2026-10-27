---
status: accepted
date: 2026-09-18
---

# ADR-036 — A notification belongs to a person, not a tenant

**Context.** Several things now detect something worth telling somebody about
and tell nobody: a run closed with a variance past threshold (ADR-032), an
order line closed short (ADR-034), a password changed, a session opened from a
device nobody recognises (ADR-022). Each says it in a response, which reaches
whoever happened to click the button, and in a log nobody reads unprompted.

**Decision — one table, one row per recipient.**

```text
notifications  id, user_id, organization_id, type,
               resource_type, resource_id, title, body,
               read_at, created_at
```

A row per recipient rather than per event, because read state is per person. A
shared event row plus a separate `notification_reads` table is the normalised
shape and is machinery for a scale that does not exist here — three recipients
is three rows.

**Decision — `user_id` is the scope, and `organization_id` is nullable.**

This is the one table in the system not scoped by tenant, and it is the same
problem ADR-022 solved for account events: "somebody signed in to your account"
has no organization, and a user between organizations still needs to be told.
So every query filters on `user_id`, which is also the only correct filter —
a notification addressed to somebody else is not theirs to read regardless of
which tenant they are in.

`organization_id` is kept and nullable, because an org-scoped notification
should disappear when its context does, and because "everything that happened
in this workspace" is a question somebody will eventually ask.

**Decision — not derived from the audit log.** The tempting move, and wrong:
audit records every change for forensics and almost none of it is something a
person needs told. Deriving would mean notifying about everything or
maintaining a filter list, which is deliberate emission with extra steps. Each
notification is emitted at a named point, by the code that already detected the
thing.

**Decision — targeting by permission, for organization events.** Anyone holding
`production.complete` learns about a variance; anyone holding `orders.update`
learns about a short close. Coarse, and it uses data that already exists.

The alternatives both need something that does not. By involvement needs
`created_by` to mean "owner", which it does not — it means "typed it in". By
subscription is a feature of its own. Account notifications need none of this:
the recipient is the subject.

**Decision — emission never fails the action it describes.** A notification is
written in the same transaction where one is available, and a failure to write
one is logged and swallowed, the way the audit interceptor already handles its
own. Nobody should lose a closed production run because a notification insert
deadlocked.

**Decision — in-app only.** Email is a delivery channel over the same rows, not
a different feature, and the one case that genuinely needs it is an
unrecognised sign-in, where the in-app notification arrives where the attacker
also is. Recorded as open rather than built, because it needs a `delivered_at`
or a channel column and a decision about what happens when sending fails.

**Rejected: a toast is this.** A toast confirms what *you* just did and needs no
storage; the bell holds what somebody else did. Conflating them means either
persisting confirmations nobody will read later, or losing notifications on
page load. The toast is a separate, smaller thing and needs no schema.

**Deferred: the events that are absences.** An expected delivery date passed
with the order still open; a run that cannot be released for want of material.
Neither is detected anywhere, because nothing is looking — they need a
scheduler and a rule about what happens when it does not run, which is more
than the table.
