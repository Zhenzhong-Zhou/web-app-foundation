# Architecture Decisions

A running log of structural decisions: what was chosen, why, and what it costs.
Append new entries; don't rewrite old ones. If a decision is reversed, add a new
entry that supersedes it and mark the old one.

Format: **Context** (the situation) → **Decision** (what was chosen) →
**Consequence** (what this now commits us to).

---

## ADR-001 — NestJS as the server framework

**Context.** Candidates were Spring Boot, Express, Next.js API routes, and NestJS.
Express is too minimal for a foundation project — everything (structure, DI, validation,
auth) would be hand-assembled. Next.js couples the API to the frontend framework and has
no story for background work, which is wrong for a platform meant to serve multiple future
applications and possibly non-browser clients. Spring Boot is the most mature option,
but the developer has no Java experience.

**Decision.** NestJS.

**Consequence.** One language across frontend and backend; types can be shared with the
React client. Only one unknown to learn (the framework), not two (language + framework).
NestJS's module/DI/guard model mirrors Spring closely enough that the concepts transfer if
a move to Spring ever happens. Cost: authorization tooling is less mature than Spring
Security, so more of the auth surface is hand-built.

---

## ADR-002 — PostgreSQL as the database

**Context.** The developer already uses Postgres regularly. The foundation needs JSON-ish
storage for settings and audit payloads, and a credible path to enforcing tenant isolation.

**Decision.** PostgreSQL, single database. **Version 18** — amended, see ADR-010.
Originally recorded as 16; raised to 18 for native `uuidv7()` support. The bump was free
because no data or migrations existed yet.

**Consequence.** JSONB is available for audit-log payloads and application settings.
Row-Level Security is available later as a second layer of tenant isolation without a
schema change (see ADR-003). Deployment targets must offer PostgreSQL 18 — verify this
before choosing a managed host.

---

## ADR-003 — Multi-tenancy: shared schema with `organization_id`

**Context.** It is not yet known whether this will serve one organization or many
customers. The cost of the two mistakes is wildly asymmetric: designing for multi-tenancy
and never needing it costs one column and one seed row. Retrofitting tenancy onto a live
single-tenant database touches every table, every query, and every role assignment.

**Decision.** Design multi-tenant from day one, using a **shared schema** in a single
database. Every tenant-scoped table gets `organization_id NOT NULL`, a foreign key, and an
index — created with the table, never added later. One "Default Organization" row is
seeded. Schema-per-tenant and database-per-tenant were both rejected: they are only
justified by hard compliance/isolation requirements and are far harder to reverse.

**Consequence.** The tenant filter must live in **one place** — a request-scoped context
plus a base query layer that always applies it. If `where organization_id = ?` gets
scattered across services by hand, data will eventually leak between tenants. This is the
single highest-risk area of the codebase and needs a test.

Postgres Row-Level Security may be added later as defence in depth. It is cheap to add
*because the column already exists* — the column is the irreversible decision, RLS is not.

Deferred as additive, not blocking: organization signup/onboarding, org switcher UI,
per-org settings overrides, per-org billing.

---

## ADR-004 — Roles scoped through membership

**Context.** The obvious design is `user → role → permissions`. It breaks as soon as a
user belongs to two organizations, which is normal in any multi-tenant system.

**Decision.** Roles attach to a **membership**, not to a user:

```
users (global identity)
memberships (user_id, organization_id, role_id)
roles → role_permissions → permissions
```

Permissions are strings (`users.create`, `reports.view`) checked by a guard.

**Consequence.** A user can join a second organization with different roles, with no data
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

---

## ADR-005 — No background jobs in V1; email sends synchronously

**Context.** A job queue means Redis, retry logic, dead-letter handling, and a second
process to run and deploy. In V1 the only async candidate is a handful of transactional
emails.

**Decision.** Send email synchronously. Use Mailpit in development — no SMTP provider,
no API keys, no signup. Defer BullMQ until sending actually becomes slow.

**Consequence.** Notably less infrastructure to run and learn while building. Slow SMTP
will block request threads; that is acceptable at V1 volume and is the signal to add the
queue. The change is purely additive — no schema or API impact.

---

## ADR-006 — Self-serve registration is the only onboarding path in V1

**Context.** Three onboarding models were on the table: self-serve registration, admin-
created users, and emailed invitations. Invitations are a full flow (token generation,
expiry, resend, accept-as-new vs. accept-as-existing, UI on both ends) — days of work.

**Decision.** V1 ships self-serve registration only. Invitations are deferred.

**Consequence.** Registration exercises auth, email verification, and organization
creation together, which is the most valuable single path to build first. Adding users to
an existing org in V1 is done directly by an admin. Invitations can be added later without
touching the schema.

---

## ADR-007 — React SPA on Vite, not Next.js

**Context.** The core surface is a logged-in dashboard: user management, roles, settings,
audit log. SSR and SEO are irrelevant behind a login wall. The developer already has
React + TypeScript + Vite experience.

**Decision.** React + TypeScript on Vite, as a separate SPA consuming the API.

**Consequence.** Frontend and backend stay decoupled, so a mobile or third-party client
can use the same API later. Admin CRUD screens should use a generator (Refine or React
Admin) rather than being hand-built.

---

## ADR-008 — Testing scaffolding lands in V1

**Context.** Comprehensive coverage is not realistic for a solo build. But the *habit* and
the *harness* are what's expensive to retrofit, not individual tests.

**Decision.** Set up the test database, factories, and one passing integration test as
part of the skeleton (step 1). From the first real feature onward, write one integration
test per feature as it's built.

**Consequence.** Tenant isolation and permission guards — the two places where a bug is a
security incident — always have a regression test.

---

## ADR-009 — Drizzle for schema, migrations, and queries

**Context.** Candidates were Prisma, Drizzle, Knex, and hand-written SQL over the raw
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

**Decision.** Drizzle. Specifically:

| Package | Role |
|---|---|
| `drizzle-orm` | Table definitions **and** queries |
| `drizzle-kit` | CLI that diffs the schema and generates migration SQL |
| `pg` (node-postgres) | Driver — configured once at startup, not used directly |

Each table is defined once; the same definition feeds migrations and query types.

**Consequence.** `drizzle-kit generate` emits plain `.sql` files that are readable,
hand-editable, and committed as source code — the correct place to add RLS policies
(ADR-003), partial indexes, and triggers. Queries stay close to SQL, which suits existing
Postgres experience.

Binding rule from ADR-003: **services must not import `db` directly.** They go through a
tenant-scoped query helper that always applies the `organization_id` filter. Direct `db`
access in a service is a review-blocking defect.

Escape hatch for queries the builder cannot express (window functions, recursive CTEs):
the `` sql`` `` template, which still parameterises values safely.

Cost: smaller ecosystem and fewer tutorials than Prisma, and no equivalent of Prisma
Studio. Accepted.

---

## ADR-010 — UUIDv7 primary keys

**Context.** Four options: auto-increment `bigint`, UUIDv4, ULID, and UUIDv7.

Auto-increment leaks business volume (a new customer sees they are user #47) and makes
records enumerable in URLs, so any endpoint with a weak permission check becomes
brute-forceable. UUIDv4 fixes that but is fully random, so inserts scatter across B-tree
index pages, causing page splits, index bloat, and degraded cache locality.

ULID and UUIDv7 solve both: each embeds a 48-bit millisecond timestamp in the most
significant bits, so values are time-sortable and inserts land at the right edge of the
index like a sequential key, while remaining unguessable.

The tiebreaker is standardisation. ULID is a community specification whose only real
advantage is a shorter Base32 text form. UUIDv7 is defined by RFC 9562, and PostgreSQL 18
ships a native `uuidv7()` function in core — no extension, no PL/pgSQL workaround.

UUIDv8 was considered and rejected: it is RFC 9562's free-form vendor-defined slot, an
escape hatch for custom layouts rather than a general-purpose key format.

**Decision.** UUIDv7 for every primary key, generated by the database:

```sql
id uuid PRIMARY KEY DEFAULT uuidv7()
```

```ts
id: uuid('id').primaryKey().default(sql`uuidv7()`)
```

Stored in the native `uuid` type (16 bytes binary). **Never `text`** — that would cost
36 bytes per value plus proportional index bloat.

**Consequence.** IDs are safe to expose in URLs and API responses without leaking row
counts or enabling enumeration. Time-ordered inserts keep the primary-key index compact;
published benchmarks report roughly 25% smaller indexes and materially faster ordered
scans versus UUIDv4. Foreign keys are `uuid` throughout.

Requires PostgreSQL 18 — this is what drove the version bump in ADR-002.

Trade-off accepted: a UUIDv7 leaks the row's approximate creation time to anyone holding
the ID. Harmless for users, organizations, and audit rows. If a future table holds rows
whose creation timing is itself confidential, use `gen_random_uuid()` (v4) for that table
specifically and record it as a new ADR.

---

## ADR-011 — Opaque session cookies, not JWT

> **Amended by [ADR-015](#adr-015--multiple-concurrent-sessions-per-user-amends-adr-011).**
> One binding rule — delete any prior session on login — is superseded. Everything else stands.

**Context.** The choice was between a stateless JWT and a server-side session referenced
by a cookie.

JWT's single advantage is avoiding a database read per request. ADR-004 removes that
advantage entirely: permissions are scoped per organization, so every request must resolve
`(user, current_org) -> role -> permissions` against the database regardless. The read
happens either way.

What remains of JWT is its cost. Tokens cannot be revoked before expiry, so an admin
demoting or disabling a user has no immediate effect. The standard remedy is a
server-side blocklist — which is a session table with extra steps and worse ergonomics.

Two further requirements point the same way. Org switching (ADR-003) needs mutable
per-session state, which a signed token cannot hold. And a "your active sessions" screen
requires one enumerable, individually revocable record per login.

**Decision.** Opaque session tokens, stored server-side, delivered in an httpOnly cookie.

Generate 32 cryptographically random bytes per login. Send the base64url value to the
client; store only its SHA-256 hash. Hashing, not encryption — the value is only ever
verified, never read back. A database leak then yields no usable credentials, for the same
reason password hashes do not.

```sql
sessions (
  id              uuid primary key default uuidv7(),
  token_hash      text not null unique,
  user_id         uuid not null references users(id) on delete cascade,
  current_org_id  uuid references organizations(id) on delete cascade,
  issued_at       timestamptz not null default now(),
  expires_at      timestamptz not null,   -- absolute cap
  last_seen_at    timestamptz not null default now(),
  ip              inet,
  user_agent      text
)
```

Cookie flags: `httpOnly: true`, `secure: true` (relaxed only on localhost http),
`sameSite: 'lax'`, `path: '/'`.

**Consequence — binding rules.** Each of these is a security control, not a preference:

| Rule | Failure it prevents |
|---|---|
| ~~Issue a new session row on login, delete any prior one~~ — **superseded by ADR-015**. Login revokes only the session presented in the request; other devices are untouched. | Session fixation — misattributed, see ADR-015 |
| Logout **deletes the row**, then clears the cookie | Captured token stays valid forever |
| Password change/reset deletes all *other* sessions for that user | Account recovery leaves the attacker signed in |
| Two expiries: absolute `expires_at` cap **and** idle timeout on `last_seen_at` | Sliding-only expiry lets a stolen token live indefinitely |
| Never store resolved permissions on the session row | A demoted admin keeps access until expiry |

Revocation is deletion — there is no separate mechanism. "Sign out this device", password
change, and admin-disables-user are all the same `DELETE FROM sessions` with a different
`WHERE`. If logout/login history is needed, it belongs in `audit_log`, not in retained
session rows.

Expired rows are swept lazily (delete that user's expired rows during login) rather than
by a scheduled job, per ADR-005.

**Consequence — operational traps.**

Express must be told it sits behind a proxy, or it reports the proxy's address as `req.ip`
*and* silently refuses to set `secure` cookies over a TLS-terminated connection — a
production-only failure that works fine on localhost:

```ts
app.getHttpAdapter().getInstance().set('trust proxy', 1);
```

Development must be same-origin. Vite proxies `/api` to Nest rather than the SPA calling
`http://localhost:3000` directly:

```ts
server: { proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true } } }
```

This mirrors the production topology (reverse proxy serving the SPA, forwarding `/api`).
Calling the API cross-origin in development means debugging CORS and `sameSite: 'none'`
problems that will never exist in production.

**Consequence — deferred, and how.** Mobile or third-party clients need a non-cookie
transport. This is additive: keep the auth guard's job as "resolve a request to
`(user, current_org)`" and read the credential at the edge, so a bearer transport is a new
strategy rather than a rewrite. Often the same opaque token can simply be returned in a
JSON body and sent as `Authorization: Bearer` — same table, same revocation, no JWT. If a
signed token is genuinely required, it carries `user_id` and `org_id` only; roles and
permissions are resolved per request (ADR-004).

**Related, landing in step 3.** `sameSite: 'lax'` blocks most but not all CSRF —
state-changing endpoints additionally require a custom header or double-submit token.
Login rate limiting keys on **email + IP together**: IP alone both fails against rotating
attackers and locks out everyone behind a corporate NAT. Note that `@nestjs/throttler`
counts in memory, so limits break silently across multiple instances — the first real
trigger for introducing Redis, alongside BullMQ (ADR-005).

---

## ADR-012 — Account deletion, audit retention, and cascade defaults

**Context.** The right to erasure conflicts with an audit log whose value depends on being
complete and tamper-evident. Statutory retention periods can also override an erasure
request outright. Deleting audit rows defeats their purpose; refusing to delete anything
is not an option either.

A second, larger question sits underneath: when a user leaves, who owns the work they
created?

**Decision — ownership.** The organization owns business data; the user only authored it.
Two columns with strictly separate jobs:

- `organization_id` — **ownership**. Governs lifecycle.
- `created_by` / `actor_id` — **attribution**. Never governs lifecycle.

A departing employee's projects remain with the organization, still attributed to their
tombstoned user record. The alternative — a company losing its data because an employee
closed an account — is indefensible.

**Decision — the deletion flow.**

1. Request sets `deletion_scheduled_at`; a **30-day grace window** follows. Reversible
   until it elapses.
2. If the user is the sole Owner of an org that has **other members**, deletion is
   **blocked** with an explicit error until ownership is transferred. Never cascade
   silently.
3. If the user is the org's **only** member, that org is personal — delete it with them.
4. Data export is offered during the grace window (see below).
5. On elapse, anonymize.

| Table | Action | Rationale |
|---|---|---|
| `sessions` | Hard delete | Live credentials |
| `users` | Soft delete: `deleted_at` set, email -> `deleted-<uuid>@invalid`, name -> `Deleted User`, password cleared | Preserves FK targets for attribution |
| `memberships` | Delete | No longer in the organization |
| `audit_log` | **Rows retained**; `actor_id` continues to reference the tombstone | The event survives; the row it points to no longer identifies a person |

The email is **released** — anonymizing frees the unique constraint, so the same address
may register again as a new user.

Deletion and deactivation are distinct and must not be conflated in the API or UI:
suspension (Account Status) is reversible and preserves everything; deletion is not.

**Decision — retention.** Audit rows are retained for **24 months**, after which `ip` and
`user_agent` are nulled while the event itself is kept. Those fields are personal data in
their own right and must not outlive the window simply because they sit on a row that does.

**Decision — cascade defaults.** Applied to every table added from here on:

| Foreign key | Rule | Reason |
|---|---|---|
| `organization_id` | `ON DELETE CASCADE` | Org owns the data |
| `user_id` on sessions, memberships, tokens | `ON DELETE CASCADE` | Exists only to serve that user |
| `created_by`, `updated_by`, `actor_id` | `ON DELETE RESTRICT` | Attribution must outlive the actor |
| any FK on `audit_log` | `RESTRICT` — **never cascade**, including from `organizations` | Cascading org deletion would destroy records required for the 24-month window |

Because users are soft-deleted, the `RESTRICT` constraints should never fire in normal
operation. That is the point: they are a **tripwire**. A future hard `DELETE FROM users`
is refused by the database rather than silently shredding the audit trail.

Organization deletion is handled by its own anonymization pass over `audit_log`, never by
cascade.

**Decision — export.** JSON export offered during the grace window, scoped to the user's
personal data plus rows they authored. Portability is a separate right from erasure, so it
cannot be satisfied by deletion alone. Organization-wide export is deferred — `created_by`
is what keeps it buildable later.

**Consequence.** Users must never be hard-deleted; every code path deletes softly.
`audit_log` writes must capture `actor_id`, `organization_id`, `ip`, and `user_agent` at
event time, since the user row will later stop identifying anyone. A scheduled PII-stripping
pass is required at the 24-month boundary — with no job queue in V1 (ADR-005), this runs as
a cron'd SQL statement until BullMQ arrives.

**Caveat.** Retention periods, lawful basis, and what constitutes adequate anonymization
vary by jurisdiction, and this log is not legal advice. The decisions above make the schema
*capable* of compliance, which is the expensive part to retrofit; the specific policy
warrants professional review before handling real EU user data.

---

## ADR-013 — API versioning by URL prefix

**Context.** Four options: a URL path prefix (`/v1/users`), a custom header
(`X-API-Version: 1`), Accept-header content negotiation
(`application/vnd.app.v1+json`), or a query parameter (`?version=1`).

Header-based versioning is the more theoretically correct design — a URL identifies a
resource, and the version is a property of its representation. In practice it is invisible
everywhere it matters: server logs, browser address bars, `curl` commands, bug reports,
and screenshots. It cannot be exercised by hand without a tool that sets headers, and
caching proxies need `Vary` configured correctly or they will serve one version's response
for another's request. Query parameters are worse still — trivially lost in redirects and
copy-pasted links.

The deciding factor is that this is a foundation intended to be handed to future
applications and, potentially, other developers. Legibility beats purity.

**Decision.** URI versioning, applied globally from the first endpoint:

```ts
app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
```

Every API route is therefore `/v1/...`. Behind the Vite proxy (ADR-011) the browser-facing
path is `/api/v1/users`.

**Consequence.** Version is visible in every log line and reproducible with a bare `curl`.
NestJS supports this natively, so no custom middleware is needed.

Operational endpoints are **excluded** from versioning: `/health`, and later `/metrics`,
are infrastructure rather than API surface. Load balancers and orchestrators should not
have to track an API version to run a liveness probe.

One global version, not per-module. Independently versioned modules produce combinations
no one has tested and questions no one can answer ("does `/v2/users` work with
`/v1/organizations`?").

A version bump is reserved for **breaking** changes — removing or renaming a field,
changing a type, altering semantics. Additive changes (new endpoints, new optional fields)
ship within the current version.

Realistically this foundation may never reach `v2`. That is the point: the prefix costs
nothing now, whereas adding it later forces a choice between breaking every existing client
and maintaining unversioned legacy routes indefinitely.

---

## ADR-014 — CSRF: a custom header, not a token

**Context.** `sameSite: 'lax'` (ADR-011) already blocks the common case: a cross-site
`<form method="post">`, an `<img>`, a `fetch` from another origin — none of these send the
session cookie. What it does not cover is narrower but real. A compromised subdomain is
*same*-site, so `blog.example.com` can forge requests to `app.example.com`. Browsers
predating 2020, and some Safari versions, ignore the attribute entirely. And the deferred
bearer transport in ADR-011 would mean relaxing to `sameSite: 'none'`, removing the
protection outright.

Three mechanisms were considered. A **synchroniser token** — server-generated, stored per
session, embedded in every form — is the textbook answer and the heaviest: a token to
generate, store, rotate, and hand to a SPA that renders no server-side forms. A
**double-submit cookie** avoids server storage by comparing a cookie against a request
body field, but a subdomain attacker who can set cookies can set both sides of the
comparison, which is precisely the gap this is meant to close. A **custom header** relies
on a browser rule rather than on secrecy: a cross-site form cannot set headers at all, and
a cross-origin `fetch` that tries triggers a CORS preflight this server never answers.

**Decision.** Require `X-Requested-With` on every request whose method is not GET, HEAD,
or OPTIONS. The header's **presence** is the proof; its value is never read.

An empty value is rejected along with a missing one — a client sending the header with
nothing after it has demonstrated nothing.

`@SkipCsrf()` exempts routes reached by something that is not our browser client:
webhooks, and later a bearer-token transport. Never a cookie-authenticated route.

The guard is registered after `SessionGuard`, so an unauthenticated request answers 401
rather than 403. A CSRF failure on a request that had no session would be a misleading
diagnosis.

**Consequence.** Nothing to generate, store, rotate, or expire — no token table, no
per-session state, no failure mode where a valid user is rejected because their token
went stale. The SPA sets one axios default and never thinks about it again. Tests need the
header on every non-GET, which is why `authedAgent()` sets it once rather than each suite
repeating it.

**The assumption this rests on, and how it breaks.** The protection is a *consequence of
CORS*, not of the header itself. Enabling permissive CORS —
`cors({ origin: true, credentials: true })` — allows the preflight, at which point any
origin may send the header and this defence is gone silently, with every test still
passing. If cross-origin access is ever genuinely required, the allowed origins must be an
explicit list, and this ADR must be revisited rather than worked around. ADR-011's
insistence that development go through the Vite proxy rather than calling
`http://localhost:3000` directly exists partly to keep this assumption true.

Safe methods are exempt on the understanding that they do not mutate. A GET endpoint with
side effects breaks that assumption and is a defect for several reasons, of which this is
only one.

---

## ADR-015 — Multiple concurrent sessions per user (amends ADR-011)

**Context.** ADR-011 states two rules that cannot both hold. Its binding-rules table
requires issuing a new session row on login and **deleting any prior one**, citing session
fixation. Its own context section requires a "your active sessions" screen with
per-device revocation — which is only meaningful if a user can hold more than one session
at a time.

Implementing login forced the contradiction into the open.

The fixation citation is also misattributed. Session fixation is an attack in which the
attacker plants a known token value that survives authentication. It is prevented by
**never adopting a client-supplied token**: `SessionService.create()` generates 32 fresh
CSPRNG bytes on every login and has no code path that accepts an incoming value. Deleting
other sessions does not contribute to that defence. It is a separate and stricter policy —
single-session — that was recorded as though it were the fixation fix.

**Decision.** Multiple concurrent sessions per user are normal and supported.

Login revokes exactly one row: the session presented in the request, if any. That row's
cookie is about to be overwritten by the response, so without the delete it would remain
live in the table with nothing able to reach it — reachable only by whoever captured the
token. Sessions belonging to other devices are untouched.

ADR-011's rule "issue a new session row on login, delete any prior one" is **superseded**
by this entry.

**Consequence.** Signing in on a phone does not sign out a laptop, which is what users
expect and what the active-sessions screen requires. `sessions.user_id` is deliberately
non-unique.

Every "sign out everywhere" operation must now be explicit, because it is no longer a side
effect of logging in. `revokeAllForUser(userId, exceptSessionId)` is that operation, and
password change, password reset, and admin-disables-user must all call it — ADR-011's rule
that password change deletes all *other* sessions is unaffected by this amendment and
becomes more important under it.

The remaining cost is unbounded session growth: a user who logs in from many devices and
never signs out accumulates rows until they expire. Lazy sweeping on login (ADR-005)
bounds it in practice. If it ever needs a hard cap, the fix is to evict the oldest session
past a limit — additive, and it needs no schema change.

Single-session remains available as a per-deployment policy if a future application
requires it. It would be a change to login, not to the schema.

---

# Open decisions

None currently open. New questions land here before they are promoted to an ADR.

---

# Resolved

| Decision | Outcome | ADR |
|---|---|---|
| ORM: Prisma vs. Drizzle vs. Knex | Drizzle | ADR-009 |
| Primary key strategy | UUIDv7 on `uuid` column | ADR-010 |
| PostgreSQL version | 18 (for native `uuidv7()`) | ADR-002, ADR-010 |
| Session strategy | Opaque token in httpOnly cookie, no JWT | ADR-011 |
| Account deletion vs. audit retention | Anonymize user, retain audit rows | ADR-012 |
| Data ownership on user departure | Org owns data, user attributed | ADR-012 |
| API versioning | URL prefix `/v1/`, global, from first endpoint | ADR-013 |
| CSRF defence | Custom header, no token | ADR-014 |
| Concurrent sessions per user | Multiple; login revokes only the presented session | ADR-015 |