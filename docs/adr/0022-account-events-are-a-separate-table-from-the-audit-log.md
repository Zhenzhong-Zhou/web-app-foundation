---
status: accepted
date: 2026-09-02
---

# ADR-022 — Account events are a separate table from the audit log

**Context.** ADR-018 writes audit rows from an interceptor, opt in per route.
It cannot cover the account routes: `audit_log.organization_id` is `NOT NULL`
because ADR-012 made the organization the owner of every row, and every route
under `/v1/account` runs `@AllowNoOrganization`. `@Audited()` there would fail
for exactly the users those routes exist to serve.

The narrow fix is to make the column nullable. The wider question is whether
these are the same kind of record at all.

**Decision.** A separate `account_events` table.

They answer different questions for different readers. `audit_log` answers
"what did people do in our workspace" — read by an admin, exported for
compliance, retained 24 months. `account_events` answers "what happened to *my*
account" — read by one person deciding whether someone else got in.

Ownership decides it. ADR-012's premise is that the organization owns business
data and the user only authored it. A password change is not business data.
Making `organization_id` nullable would not relax a constraint so much as
assert that some rows have no owner, contradicting what the column exists to
express.

```sql
account_events (
  id          uuid primary key default uuidv7(),
  user_id     uuid not null references users(id) on delete cascade,
  action      text not null,
  ip          inet,
  user_agent  text,
  created_at  timestamptz not null default now()
)
```

`ON DELETE CASCADE`, unlike `audit_log.actor_id`'s `RESTRICT`. That is the
ownership decision made concrete: an audit row must outlive its actor because
the organization still needs the record, while an account event has no
audience once its subject is gone. Users are tombstoned rather than deleted
(ADR-012), so this never fires in normal operation — but the anonymization
pass must delete these rows explicitly, since they are personal data with no
organizational claim on them.

**Decision — events recorded.**

| Action                     | Why it earns a row                                                                                                                                       |
|----------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------|
| `session.created`          | An unfamiliar sign-in is what this screen exists to surface                                                                                              |
| `session.ended`            | Bounds a sign-in; an absent logout is itself informative                                                                                                 |
| `session.revoked`          | The user signed out another device — or someone did it for them                                                                                          |
| `account.password_changed` | The change a compromised user needs a timestamp for                                                                                                      |
| `account.password_reset`   | **Distinct from the above.** A reset the user did not request is the strongest signal of an attempted takeover, and folding it into "changed" hides that |
| `account.profile_updated`  | An attacker changing the display name                                                                                                                    |
| `account.email_verified`   | Completes the registration story                                                                                                                         |

No payload column. ADR-018's reasoning applies harder here: these rows exist to
say *that* something happened, and the details are either already visible in
the account or are the credential itself.

**Decision — written by explicit service calls, not an interceptor.**

This departs from ADR-018 deliberately. The actor for `session.created` is not
in the request context — login is `@Public()`, and the handler is what produces
the identity, so an interceptor would have to dig it out of a response body.

The failure ADR-018's interceptor prevents is every feature module remembering
to call `audit.record()`. That does not apply to a closed set of seven events,
all inside `core/auth`, none of which a future module will add to. Where the
interceptor's argument is weak and its mechanism is awkward, the explicit call
is the simpler thing.

A failed write is logged and swallowed, as in ADR-018: the action has already
committed, and failing the request would report failure for something that
happened.

**Decision — 90 days, swept lazily.**

`audit_log`'s 24 months comes from a compliance window for organizational
activity. Nothing imposes one here, and this is personal data whose value
decays in weeks — "did someone get in last month" is a real question, "last
year" is not.

Swept on write, per user, the way `sessions` and `auth_tokens` already are
(ADR-005). No cron, and the table stays bounded by active users rather than by
total history.

**Consequence.** Two tables to consult when reconstructing an incident, and the
join between them is the user id. Accepted: the alternative is one table where
every organizational read filters on a nullable column forever.

A "recent account activity" panel on the sessions screen reads this table
directly. That is the concrete payoff, and it is unavailable under the nullable
column without filtering `audit_log` by actor and null organization.

`ip` and `user_agent` are captured at event time, per ADR-012 — the session row
they describe is frequently gone by the time anyone reads the event.
