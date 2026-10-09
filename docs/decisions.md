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

**Amended after first deployment.** Two things the local Mailpit setup could not
surface.

Managed hosts commonly block outbound port 587 to prevent spam — Render's free
tier does — so SMTP from a container fails with a connection timeout that reads
like bad credentials and is not. Mail therefore goes over the provider's HTTP
API in production, selected by the presence of `RESEND_API_KEY`; Mailpit keeps
the SMTP path in development, so local stays zero-config. This is not
provider-specific: every mail provider offers an HTTP API precisely because SMTP
is unavailable on so much hosting.

And the synchronous-send cost is larger than "slow SMTP blocks a request
thread". A *blocked* port blocks it until the OS gives up — fifteen seconds
against Render, long enough for the platform's proxy to return 502 before the
handler finished. Connection and greeting timeouts now bound it at five seconds.
That is the signal this ADR anticipated, though it arrived as a network
constraint rather than as volume.

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

| Package              | Role                                                   |
|----------------------|--------------------------------------------------------|
| `drizzle-orm`        | Table definitions **and** queries                      |
| `drizzle-kit`        | CLI that diffs the schema and generates migration SQL  |
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
the ``sql`` `` template, which still parameterises values safely.

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

| Rule                                                                                                                                                                          | Failure it prevents                                       |
|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------|
| ~~Issue a new session row on login, delete any prior one~~ — **superseded by ADR-015**. Login revokes only the session presented in the request; other devices are untouched. | Session fixation — misattributed, see ADR-015             |
| Logout **deletes the row**, then clears the cookie                                                                                                                            | Captured token stays valid forever                        |
| Password change/reset deletes all *other* sessions for that user                                                                                                              | Account recovery leaves the attacker signed in            |
| Two expiries: absolute `expires_at` cap **and** idle timeout on `last_seen_at`                                                                                                | Sliding-only expiry lets a stolen token live indefinitely |
| Never store resolved permissions on the session row                                                                                                                           | A demoted admin keeps access until expiry                 |

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
export default defineConfig({
  server: {
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true } },
  },
});
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

**Decision — retention.** Audit rows are retained for **24 months**, after which `ip` and
`user_agent` are nulled while the event itself is kept. Those fields are personal data in
their own right and must not outlive the window simply because they sit on a row that does.

**Decision — cascade defaults.** Applied to every table added from here on:

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

## ADR-016 — Permissions resolved per request

**Context.** ADR-004 scopes roles through membership, so a request's permissions are a
property of `(user, current_org)` rather than of the user. The question left open was
where that resolution happens: cached somewhere, or queried on each request.

**Decision.** Query on each request. `PermissionGuard` reads `role_id` off the request
context and joins `role_permissions` to `permissions`. Nothing is cached on the session
row, the request context, or in memory.

**Consequence.** A demoted or removed user loses access on their next request rather than
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

**Consequence — the `UNSAFE_GLOBAL_DB` exemption list is closed.** Only `core/auth` and
`core/authorization` may import it, both for structural reasons: auth resolves a user by
email before any organization is known, and authorization reads a catalogue that has no
`organization_id` by design. Feature modules needing a transaction across a global and a
scoped table use `TenantDb.transaction()`, which supplies the organization from tenant
context.

Scoping inside that callback is manual by necessity — a transaction exists precisely
because its statements differ, so no wrapper can make it mechanical — and is covered by
the tenant-isolation suite rather than by types.

**Known gap, carried from ADR-004.** Nothing prevents an Admin assigning the Owner role.
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

---

## ADR-017 — Email verification and password reset

**Context.** Both flows hand a user a link they click later. The questions were
where the tokens live, what the links point at, and what happens when something
fails.

**Decision — one table, two purposes.** `auth_tokens` carries a `purpose`
column rather than there being one table per flow. The columns, the SHA-256
storage, the expiry check, the single-use rule and the sweep are identical;
only the lifetime differs, and a lifetime is a value. Invitations (ADR-006) will
be the third purpose. `purpose` is part of the consume condition, so a
verification token cannot be presented to the reset endpoint.

Lifetimes: 24 hours for verification, because a link sits in an inbox; one hour
for reset, because that token is a live credential for taking over an account.

**Decision — consume in one statement.** `consume()` validates and marks spent
in a single UPDATE. A SELECT then UPDATE lets two concurrent clicks both pass
the check, and a password reset that runs twice is a real problem. Postgres
serialises the row update, so exactly one caller sees a row.

**Decision — links point at the SPA, and the endpoints are POST.** Corporate
mail scanners (Safe Links, Proofpoint, Mimecast) fetch every URL in an incoming
message. A GET that spends a token is consumed before the human clicks, and the
user reports that verification is broken. The link opens a static page; the
token is spent only when the page POSTs it. This is also the GET-must-not-mutate
rule that ADR-014 already relies on.

**Decision — asymmetric failure posture.** A verification send failure is logged
and swallowed: the account exists, the user is signed in, and losing a
registration to a dead SMTP connection would be absurd — resend is the remedy. A
reset send failure propagates: reporting success while the mail never left
leaves someone waiting for a link that is not coming, and retrying produces the
same silence.

**Decision — `forgot-password` answers identically for an unknown address.**
Login goes to real trouble not to be an enumeration oracle. An endpoint
answering "no such address" hands back exactly what login refused. Same 202
either way, and no "we couldn't find that email" anywhere in the UI.

**Decision — reset revokes every session and issues none.** The likely reason
someone is resetting is that an attacker holds their password; a reset that
leaves that session live is not a recovery (ADR-011). No session is issued in
exchange: the user signs in with the password they just chose, which is the
moment a password manager reliably captures it, and a link from an inbox is a
weaker credential than a password.

**Consequence.** Every flow that mails a link needs `CLIENT_URL`, which is
separate from `APP_URL` — they coincide in a same-origin deployment and must not
be assumed to. Tests inject a recording mailer, because the flow is only
testable end to end if the token can be read back out of the message that
carried it.

**Known gap — timing on `forgot-password`.** A known address costs a token issue
and an SMTP round trip; an unknown one returns immediately. The response is
identical, the timing is not. Login closed the equivalent with a decoy hash. Left
open because the SMTP round trip makes the real path's timing noisy enough that
the signal is weak — but it is a decision, not an oversight. The fix is a
comparable artificial delay on the miss path.

---

## ADR-018 — Audit log: an interceptor, and silence by default

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

---

## ADR-019 — Peer dependency conflicts are never overridden

**Context.** `npm outdated` is never empty, and npm offers two flags —
`--force` and `--legacy-peer-deps` — that make a blocked install succeed. Both
resolve the conflict by ignoring it: the package is installed against a version
its maintainer has declared untested. `npm audit fix --force` does the same
thing without being asked.

The upgrade to Nest 12 is blocked by `@nestjs/throttler`, whose peer range ends
at `^11.0.0`. The temptation is obvious — everything compiles, and the test
suite passes either way.

**Decision.** Peer ranges are respected. A blocked upgrade waits, and what
blocks it is recorded in the commit body rather than in someone's memory.

**Consequence.** The failure this prevents is silent. `@nestjs/throttler` backs
login rate limiting (ADR-011), which keys on email + IP and is the only thing
standing between an attacker and unlimited password attempts. A behavioural
change under an unsupported major does not throw — it degrades, and a rate
limiter that has stopped counting **fails open**. Every e2e test would still be
green, because the suite replaces `ThrottlerStorage` with `unlimitedThrottler`
to keep registration from being limited between cases. Only `smoke-auth.sh`
exercises the real limiter, and it asserts one 429 rather than the keying rule.

This is the same shape as ADR-014's warning about permissive CORS: a defence
that disappears without any test noticing, because the tests assert on
behaviour the change leaves intact.

**Currently blocked, and by what.**

| Upgrade             | Blocked by                                                                                                                    | Unblocks when                                                                   |
|---------------------|-------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------|
| `@nestjs/*` 11 → 12 | `@nestjs/throttler@6.5.0` peers at `^11.0.0`                                                                                  | throttler publishes a range including `^12.0.0`                                 |
| `typescript` 6 → 7  | `typescript-eslint@8.69` peers at `typescript <6.1.0`; the Go port's support for `emitDecoratorMetadata`, which Nest requires | both are satisfied — verify the decorator support explicitly, not by assumption |

Being on a supported release line is the goal; being on the newest major is
not. `11.2.3` is current for the 11 line, and a non-empty `npm outdated` is not
a defect.

Corollary: check peer ranges *before* installing — `npm view <pkg>
peerDependencies` — rather than letting npm discover the conflict. Throttler is
what blocks Nest 12 today; the next major may be blocked by something else.

---

## ADR-020 — Client routes fall into three categories, not two

**Context.** The obvious split is authenticated and public. It is wrong here,
and wrong in a way that looks correct: wrapping every route in a session guard
is the safe-looking default, and it silently breaks both flows in ADR-017.

Verification and reset links are opened from an inbox. Verification is normally
clicked *while signed in* — registration signs the user in and then mails them.
Reset is opened *while signed out*, by definition; the user is there because
they lost access. A guard that redirects either one to `/login` breaks it, and
the breakage only appears when a real email arrives, not in any test that posts
a token directly.

**Decision.** Three categories.

| Category  | Rule                                                 | Routes                             |
|-----------|------------------------------------------------------|------------------------------------|
| Protected | No session → `/login`, remembering the attempted URL | everything else                    |
| Auth-only | Session → `/`                                        | `/login`, `/register`              |
| Public    | Renders regardless of session                        | `/verify-email`, `/reset-password` |

Auth-only exists because a signed-in user submitting the login form rotates
their session for nothing — login revokes the presented session and issues a
new one (ADR-015), leaving churn in the active-sessions screen that nobody
caused.

**Consequence.** The guard is only meaningful once the boot check has resolved.
`/v1/auth/me` is the sole request the app blocks on: before it answers there is
no correct thing to draw, because "no session" and "not yet known" are
indistinguishable and one of them redirects. Every other load renders its
layout and fills in.

Redirects use `replace`, or the back button bounces between the guard and the
login page. The attempted path is carried in router state so a deep link
survives sign-in.

Adding a route means choosing a category. The failure mode is a public route
added under the guard, which is invisible until someone clicks a link in an
email — so the token pages carry a comment saying they are public by necessity
rather than by oversight.

---

## ADR-021 — Material UI as the component library

**Context.** Five auth forms exist as unstyled semantic markup, and step 7
adds three more screens. Hand-building components was tried on a previous
project and the component work, not the application logic, was what took the
time.

Three shapes were considered: plain CSS with custom properties, a utility
framework, and a component library. The deciding factor is that this
foundation's surface is a logged-in dashboard — tables, forms, dialogs, menus
— which is exactly the inventory a component library ships and exactly what is
slowest to build by hand.

**Decision.** Material UI, with CSS theme variables and three color modes
(light, dark, system).

Refine is expected at step 9 for admin CRUD, and is **headless** — it supplies
hooks, not components. The two compose rather than compete: MUI renders,
Refine fetches. Choosing MUI now does not foreclose that.

**Consequence.** One component library, so consistency is structural rather
than a convention to maintain. `colorSchemeSelector: 'class'` means mode
changes swap a class on the root element instead of re-rendering the tree.

Cost: MUI is a large dependency and Emotion is runtime CSS-in-JS. Accepted
because the entire surface sits behind a login wall, where a user loads the
bundle once per session and first paint is not a conversion metric. This is
the assumption that would have to be revisited, not the library choice.

**A public marketing surface is a separate deployment, not a route here.**
Landing pages need SEO and fast first paint; this bundle serves neither and
should not try. Such a site shares design tokens — colors, type scale,
spacing — and no components, and lands on its own domain or path. ADR-007
rejected coupling the API to a frontend framework; this is the same boundary
seen from the other side.

If runtime CSS-in-JS ever does become a measured problem, MUI lists
`@mui/material-pigment-css` as an optional peer — a zero-runtime engine that
compiles to static CSS. That is a swap, not a rewrite, which is part of why
this choice is reversible enough to make now.

---

## ADR-022 — Account events are a separate table from the audit log

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

---

## ADR-023 — Stock lives on variants, and quantity is a ledger

**Context.** The first application on this foundation is inventory. It has to
hold sellable products, raw materials, packaging, samples, and office supplies,
across warehouses, some with lot numbers and expiry and some without. The
question underneath all of that is one question: at what granularity does a
quantity exist, and how does it change.

**Decision — products group, variants carry stock.**

    products          id, organization_id, type, name, description
    product_variants  id, organization_id, product_id, sku, name, unit_of_measure,
                      tracks_batches, weight_grams, dimensions, case_quantity
                      unique (organization_id, sku)
    batches           id, organization_id, variant_id, code, expires_at, received_at
                      unique (organization_id, variant_id, code)
    locations         id, organization_id, name, type, parent_id
    stock             variant_id, location_id, batch_id, quantity
    stock_movements   append-only; see below

The product is a grouping for display. The variant is the thing counted,
bought, and shipped — "Vitamin D3" is a product, "Vitamin D3, 60ct" is what
sits on a shelf. Shopify, Medusa, and Saleor all landed here; Amazon's
parent/child ASIN is the same shape.

**Every product has at least one variant, including those with no variation.**
Office supplies and single-size products get one auto-created variant holding
the SKU, and the UI hides it behind a single field. This is the part that feels
like overhead and is not: if stock hung off a product *sometimes* and a variant
*other times*, every query would need a branch, and each branch is a place to
be wrong. One home for quantity, permanently.

**Decision — SKUs are unique per organization, never global, never generated.**

Global uniqueness would leak the customer list: two customers stocking
`WIDGET-01` and one being rejected reveals the other exists. Same reasoning as
`organizations.slug`.

Not generated, because a SKU is printed on a label, read over a phone, and
typed into a supplier's system. The organization already has one for every
item. A second machine-made identifier means every item has two names and staff
use the wrong one — `id` is UUIDv7 and handles machine identity.

A collision within one organization is a 409 naming the existing variant, not a
silent second row. Two variants sharing a SKU makes every count, order line,
and movement ambiguous forever.

SKUs stay editable. Locking one after first use sounds safer and is worse: a
typo found after the first receipt becomes permanent, and the workaround people
reach for is a duplicate product with the old one discontinued, which splits
stock across two records and loses exactly the history the lock was protecting.

What protects the link to physical reality is snapshotting, not locking. Order
lines and stock movements store the SKU as text alongside `variant_id`, so a
rename affects the catalogue and nothing historical — a purchase order printed
last March still shows what was on the label, and the foreign key still
resolves to the current variant. Same pattern as `audit_log` capturing `ip` at
event time rather than joining to a session row (ADR-012).

A rename is audited, but the audit row carries no payload (ADR-018), so the
previous SKU is not recorded. Acceptable while renames are rare and the log
names who did it. Snapshotting fixes it for SKUs specifically, once
movements store the value as text; for role changes and profile edits there is
no equivalent, which is why the general question stays open.

**Decision — `type` distinguishes what a thing is for, and does not fork the
schema.** Sellable goods, raw material, packaging, samples, and office supplies
share SKU, stock, location, and movement. They differ in what they *connect*
to — a price and sales orders, or purchase orders and production consumption,
or neither. That is relationships and a check-constrained column, not separate
tables. Duplicating `stock` for supplies would mean two places a quantity can
go negative.

**Decision — batch tracking is a property of the variant, not a global mode.**

`tracks_batches` on the variant, because a manufactured supplement needs lot
numbers and a box of paperclips does not, and supplier goods vary.

The invariant: **if `tracks_batches` is true, every `stock` row for that
variant has a `batch_id`; if false, every row has null.** A check constraint
cannot see across tables, so this is enforced in the service and asserted in
e2e. Without it a variant ends up with some batched rows and some not, and no
query can answer how much exists.

When a supplier ships without a lot number and the variant tracks batches, the
receiver enters one and it is flagged as assigned rather than printed. Leaving
it null breaks the invariant; inventing one silently is worse — the distinction
is what matters during a recall.

When costing arrives, `unit_cost` belongs on the batch: a variant's cost is
not a fact about the variant, it changes with every purchase, and
overwriting it destroys the ability to value what is actually on the shelf.
Storage and handling are period expenses, not inventory cost, and touch
none of these tables.

**Decision — quantity is a ledger, and `stock` is a cache.**

    stock_movements   id, organization_id, variant_id, batch_id,
                      from_location_id, to_location_id,   -- null marks direction
                      quantity,                            -- always positive
                      reason, reason_detail,
                      reference_type, reference_id,
                      note, actor_id, created_at

Append-only, like `audit_log`. `stock` is updated in the same transaction and
is derived — a convenience for reads, never the source of truth.

A mutable quantity column cannot answer "why does the system say 47 when the
shelf holds 45." A ledger can, and that question is the entire job. This is
also the hardest thing to retrofit: added later, every existing quantity has
unexplained provenance.

**`actor_id` is not null.** The movement *is* the record; `@Audited` (ADR-018)
sits above it and does not replace it. A manual adjustment with no name
attached is precisely the row someone will ask about.

**`note` is required when `reason = 'adjustment'`.** A receipt explains itself;
an adjustment is a person saying the system is wrong, and a blank one is
unauditable.

**Nothing edits `stock.quantity` directly** — not the UI, not a correction, not
a fix. Every change is a movement. A second way to change a quantity is the
moment the ledger stops being authoritative. The e2e assertion is that the sum
of a variant's movements equals its stock row.

**Decision — reason is a closed enum; reference is nullable.**

Reason says *why*: receipt, shipment, transfer, adjustment, production,
consumption, sample, return. Reference says *what caused it* — a purchase
order, a sales order, a stock count. Damage, theft, expiry, breakage, and
miscounts are all `adjustment` with a `reason_detail`; they are the same
operation and only the explanation differs, and finance treats them
differently.

Direction is not a reason. Inbound and outbound are encoded by which of the two
location columns is null.

Reference is nullable so a movement entered by hand today and one raised by an
order later are the same row. Order management adds a reference; it does not
change the table, and existing rows stay valid.

**Consequence.** One extra join on every product read, on an indexed foreign
key — irrelevant at any scale this will see. One extra write per stock change,
in the same transaction.

Three things that follow from this and are *not* decided here, because the
modules that force them do not exist yet: reservations (`available = on_hand −
reserved`, needed before anything can be oversold), costing (batch-level,
moving average, or FIFO), and unit-of-measure conversion (buy cases, stock
eaches). Each is recorded in open decisions.

**Rejected: a flat `products` table with quantity on it.** Faster to start and
the thing every first inventory system regrets. Retrofitting variants means
touching every table that references a product, and retrofitting a ledger means
inventing history.

**Amendment (ADR-025).** `batches` is now `lots`, `stock` is `stock_levels`,
and `tracks_batches` on the variant is `tracks_lots`. The interface already
said "lot number" while the schema said batch, and `batch` is also what a bulk
import endpoint will be called — one word carrying two meanings in the same
codebase. `stock` was renamed at the same time because a row there is a balance
for one variant at one location in one lot, which the plural says and the mass
noun does not. Renamed before the stock service read any of them.

Everything above describing `batches`, `batch_id`, or `stock` refers to these
names; the reasoning is unchanged.

---

## ADR-024 — Locations are one tree, and stock sits only at leaves

**Context.** Stock has to be somewhere: a warehouse, a bin on a shelf, a
quarantine area, a supply cupboard. Layouts differ — one operation has a single
room, another has aisles and bins across two sites — and defective or
in-process units need a home that is still countable.

**Decision — one `locations` table, self-referencing.**

    locations  id, organization_id, name, code, type, parent_id,
               is_available, is_active

Warehouses, zones, aisles, shelves, and bins all need a name, a parent, and a
status, so they are one table with a `type`. Separate tables would force
`stock.location_id` to reference one of several, which is the problem ADR-023
avoided by putting stock only on variants.

`type` is a label, not a rule. It does not enforce depth, and it does not
determine leaf-ness. `parent_id` null means top level, and that single nullable
column is the entire hierarchy.

`ON DELETE RESTRICT` on the parent: removing a warehouse must not silently take
every bin under it, along with whatever those bins held.

**Decision — stock references only a location with no children.**

40 units "in Warehouse A" and 10 "in Bin 1" is a system that cannot say whether
the warehouse holds 40 or 50, and every report will answer differently. One
place a quantity lives; a parent's total is the sum of its descendants.

Leaf is computed, not declared, and that is what makes it workable at any
scale: an operation with one room has one location, which is itself a leaf and
holds stock directly. When bins are added later it gains children and stops
being a leaf — at which point its stock must move down, and a location holding
stock may not gain a child until it does.

Enforced in the service with e2e coverage, not by a trigger. A check constraint
cannot see other rows, and a trigger would be stronger but would hide the rule
in SQL where nobody reviewing a service will look for it. ADR-023's batch
invariant is enforced the same way, and two cross-table rules enforced two
different ways is worse than either.

**Decision — quarantine, returns, and work in progress are locations, not a
status on the stock row.**

A status does not say where the units physically are, and changing one leaves
no trace. Moving stock to Quarantine is a movement: an actor, a time, a reason,
and a place an auditor can go and look. Warehouse totals include them, because
they are on the shelf; availability filters on `is_available`.

Named `is_available` rather than `is_sellable`, because raw materials are
consumed rather than sold.

**Consequence.** Rollups are a recursive CTE over a table of tens or hundreds
of rows — irrelevant at any scale this will see. If it ever is not, the answer
is a materialized path column making "everything under Warehouse A" a prefix
match on an index, which is an optimisation to measure rather than assume.

**Known gap: the leaf check is not atomic.** `LocationsService` reads whether a
parent holds stock, then inserts the child, with nothing holding a lock in
between. Two concurrent requests can each see a stock-free shelf and both add a
bin, or a receipt can land on the shelf between the check and the insert —
leaving stock at a branch, which is precisely what this ADR forbids.

This is the same race ADR-025 closes for movements by locking the
`stock_levels` row, and the fix here is the same shape: take that row, or an
advisory lock keyed on the parent, inside the create transaction. Left open
because adding a child location is rare, done by one person at a time, and the
recovery is a movement rather than data loss. The trigger to fix it is
concurrent location editing by more than one member, or the first time it
happens.

**Deferred, and recorded as open decisions.** Pallets and license plating,
because whether a pallet is a label or a container that moves as a unit depends
on how a given warehouse works and both are real. Capacity, because enforcing
it needs a unit and a rule about whether a pallet counts as one or as its
contents. Addresses, which arrive with customers and suppliers.

**Amendment.** `warehouse` is now `site`. The type enum answers where a location
sits in the tree, and `warehouse` was quietly answering what kind of facility it
is as well — which left an office with a supply cupboard, or a shop with a back
room, with no correct value. `site` covers a building or address of any kind;
what happens there is a separate question and stays unasked until something
forces it.

---

## ADR-025 — Quantity is decimal, and the stock cache is the lock

**Context.** ADR-023 settled that quantity is a ledger and `stock_levels` is a
derived cache, but not what type a quantity is, and not how two concurrent
movements against the same shelf are serialised. Both have to be answered before
the first movement is written, because the ledger is append-only: a column type
changed later is a data migration across rows we have promised not to rewrite.

**Decision — `numeric(18, 4)`, never a float, never an integer.**

Inventory is not only countable things. Raw material is weighed, packaging film
is measured in metres, and a production consumption of 2.75 kg is not a
rounding error. An integer column forces every such variant into a fictional
base unit, and the fiction leaks into every screen.

Four decimal places covers kilograms to grams and litres to millilitres, which
is the resolution a warehouse scale actually reports. `numeric`, not `real` or
`double precision`: binary floating point cannot represent 0.1, and a ledger
whose sum drifts from its cache by 0.0000001 is a ledger nobody trusts.

**All arithmetic happens in Postgres.** node-postgres returns `numeric` as a
string precisely so it does not pass through a JS double, and that string is
what the API returns. The client formats it; it does not add it up. A `Number()`
anywhere on this path reintroduces exactly the problem the column type avoids.

Nothing constrains a discrete good to whole units — 0.5 of a paperclip is
storable. Enforcing that needs a per-variant rule tied to `unit_of_measure`,
which is the same information unit-of-measure conversion will need, so it waits
for that rather than being guessed at now. Recorded in open decisions.

**Decision — the `stock_levels` row is the concurrency lock, and
`CHECK (quantity >= 0)` is the backstop.**

Two shipments of 8 against a balance of 10, arriving together: both read 10,
both pass a service-level check, both write. The ledger records both truthfully
and the shelf is at −6. Append-only does not prevent this; it only documents it
afterwards.

So the movement transaction takes the `stock_levels` row first —
`INSERT … ON CONFLICT (variant_id, location_id, lot_id) DO UPDATE` — which
acquires a row lock even on the first movement for a shelf that has none yet.
The second transaction blocks until the first commits, then reads the true
balance.

The check constraint is not redundant with that. Locking is a claim about the
service being correct; the constraint is enforced whatever the service believes,
and turns a silent negative balance into an aborted transaction. Same reasoning
as the closed-set constraints on `products.type` and `auth_tokens.purpose`.

**Decision — cross-table invariants are enforced in the service and asserted in
e2e, not by trigger.**

Two rules cannot be expressed as a check constraint, because a constraint cannot
see another table: `lot_id` is non-null exactly when the variant has
`tracks_lots` (ADR-023), and a movement's locations must be leaves (ADR-024).
ADR-023 already chose service-level enforcement for the first. The second gets
the same treatment for consistency — one mechanism for this class of rule, so
there is one place to look when one is violated.

A trigger would be airtight and is rejected for the usual reason: business logic
in two languages, invisible to the test suite that reads TypeScript, and
discovered by whoever is debugging at the time.

**Consequence.** Every stock change is one transaction containing a
`stock_levels` upsert and a `stock_movements` insert, in that order. Reads of
current stock hit the cache and never aggregate the ledger. The reconciliation
assertion from ADR-023 — sum of movements equals the stock row — is what proves
the two have not drifted, and it belongs in e2e rather than in a periodic job
while the data is small enough to check on every run.

---

## ADR-026 — Customers and suppliers are one table

**Context.** Orders need a counterparty. The obvious modelling question is
whether a customer and a supplier are two kinds of thing or one thing seen from
two directions, and it has to be answered before `orders.partner_id` exists —
a foreign key is not something to re-point later.

The question is not hypothetical. Large systems disagree: Odoo uses one
`res.partner` for customers, suppliers, employees, and companies; NetSuite and
SAP keep customer and vendor masters apart. Both are defensible, and the reason
for the split is specific enough to say whether it applies here.

**Decision — one `partners` table, and direction lives on the order.**

    partners  id, organization_id, name, code, tax_id, notes, is_active
              unique (organization_id, code) where code is not null

They share almost everything that makes a row: a name, addresses, contact
people, a tax id, notes, an active flag. What differs is what they *connect*
to — purchase orders and lead times, or sales orders and credit limits. That is
relationships and a few nullable columns, not a second table. The same argument
ADR-023 made for `products.type`.

**The forcing case is that one company is often both.** You buy packaging from
a firm and sell them finished goods; a supplier accepting a return is a
customer for that transaction. Two tables make that two rows, two addresses to
keep in step, and no way to see the whole relationship — and merging them
afterwards means reconciling records that already have orders pointing at each.

**No `is_customer` / `is_supplier` flags.** They go stale, because nobody unsets
them, and a stale flag is worse than no flag — it is a filter that quietly
excludes the right answer. What a partner is follows from what has been traded
with them, which is a join over `orders`. If a label is wanted for filtering it
is a label, enforced by nothing.

**Decision — the split, if it comes, is accounting's and not the partner's.**

Receivables and payables are where customers and suppliers genuinely stop
resembling each other: different aging, different reconciliation, different
statutory reporting. That is the reason NetSuite and SAP separate them, and it
is a real reason.

It does not apply yet, because this system moves goods rather than money. When
invoicing arrives the answer is separate accounting tables keyed by
`partner_id`, not a fork of `partners` — a company can owe you and be owed by
you at once, and one identity with two ledgers describes that better than two
identities do.

**Decision — one table now because the migration runs the right way.**

Splitting later is `INSERT INTO suppliers SELECT … FROM partners WHERE …`:
mechanical, reversible, and nothing that references a partner has to change if
the ids are kept. Merging later is not — it means choosing between two names,
two addresses, and two histories for rows that are already referenced.

Under uncertainty, prefer the shape whose migration is the cheap direction.

**Consequence.** A partner list shows customers and suppliers together, and a
name search returns suppliers when someone wanted customers. Filtering by kind
is a join against orders rather than a column, which is slower to write and
slower to run. That friction is the price, and it is paid on a screen rather
than in the schema.

Permissions do not fork either. An operation where different teams manage
customers and suppliers wants different permission scopes — `partners.view`
against a filter — and the role system already expresses that without a second
table.

**Rejected: separate `customers` and `suppliers` tables.** Cleaner to describe
and wrong the first time a company is both. Every field they share would be
duplicated, every "who do we trade with" screen would be a union, and the
correction is the expensive migration rather than the cheap one.

**Deferred, and recorded as open decisions.** Payment terms, lead times, and
credit limits, because each arrives with the module that reads it and a
nullable column added later costs nothing. Addresses, which are their own shape
and are also wanted by locations (ADR-024). Contact people, which are a second
table and not needed until someone has more than one.

---

## ADR-027 — Orders are purchase and sale, and nothing else

**Context.** The inventory domain can now count and move stock, and every
movement is entered by hand. Orders are what make a movement expected: a
receipt that was planned, against a document someone can point at.

The difficulty is that several things in a warehouse look like orders and are
not. Production, stocktakes, transfers between sites, and consignment all
arrive in the same conversation, and folding them into one table produces a row
where most columns are null for most rows. Deciding what an order *is* matters
more here than deciding its columns.

**Decision — `orders` and `order_lines`, covering purchase and sale.**

    orders       id, organization_id, partner_id, direction, status,
                 reference, expected_at, note, created_by
    order_lines  id, organization_id, order_id, variant_id,
                 sku,                       -- snapshotted, as movements do
                 quantity_ordered, quantity_fulfilled

A purchase order and a sales order are the same shape mirrored: a partner,
lines of variants, one direction, fulfilment that moves stock. That symmetry is
what makes one table honest rather than convenient — the columns mean the same
thing in both cases, read from the other side.

**Direction is a column, not a table.** `purchase` and `sale`, closed set,
check constraint. A lookup table earns its place when rows are added at runtime
or carry attributes; these do neither, and a join to read a word costs every
query. Same precedent as `products.type` and `stock_movements.reason`.

**Decision — status is the document's lifecycle, never fulfilment progress.**

    draft → confirmed → received
                    ↘ cancelled

Four values, and the temptation is to add `partially_received` and
`fully_received` beside them. That is the mistake this decision exists to
prevent: how much has arrived is `sum(quantity_fulfilled)` against
`sum(quantity_ordered)` across the lines, computed on read. Storing it too
means two sources of truth for one question, and the stored one goes stale the
first time a line changes.

`received` is a person saying the order is done, which can be true with a short
shipment nobody expects to complete. That is a decision, not an arithmetic
result, which is why it is a status and the percentages are not.

The vocabulary will need widening when sales orders arrive — `received` does
not describe an outbound order. Adding a value to a check constraint is a drop
and a re-add with no row to rewrite, so it waits until the outbound words are
chosen against a real screen.

**Decision — fulfilment is a quantity on the line, and the movement carries the
reference.**

Receiving against a purchase order writes an ordinary `receipt` movement with
`reference_type: 'purchase_order'` and `reference_id` set (ADR-023), and
increments `quantity_fulfilled` on the line in the same transaction. There is no
second ledger and no separate receipt table.

This is what those nullable reference columns were reserved for. A movement
entered by hand and one raised by an order are the same row; the order adds a
reference, and existing rows stay valid — which is exactly the property ADR-023
was protecting by leaving them nullable.

**No `reserved` column yet.** Purchase orders are inbound, so nothing is
promised to anyone and there is nothing to reserve. `available = on_hand −
reserved` is a third quantity and a second thing the cache must keep honest,
and its semantics are settled by whatever first writes to it. Adding the column
when sales orders exist costs one migration against rows that all read zero.

**Decision — approval is not part of an order.**

An approval is a property of documents that commit the organization to
something: a purchase order, a large adjustment, eventually a transfer between
sites. Built into `orders` it cannot be reused, and it gets built again for the
second thing that needs it.

When it arrives it is its own table, polymorphic the way `audit_log` is:
`resource_type`, `resource_id`, requested by, approved by, status. Anything
becomes approvable by referencing it, and `orders` does not change — approval
inserts a state ahead of `confirmed`.

A purchase requisition is the same deferral. It is an internal request with no
supplier and no commitment, which only means something once someone other than
the requester has to approve it.

**Consequence.** One extra write per receipt, in the transaction that already
exists. Order progress is a query over lines rather than a column, which is the
cost of not storing a derived value twice.

Rejected here and deliberately out of scope, each for its own reason:

- **Production orders.** No partner, and lines that go both ways — consuming
  materials and producing goods. One order with two opposite kinds of line is
  not the shape above, and `partner_id` would be null for exactly one direction.
  `stock_movements.reason` already carries `production` and `consumption`, so
  the ledger is ready when the table is written.
- **Stocktakes.** Not an order at all. There is no planned quantity, only
  expected against found, producing adjustments. A count sheet is its own shape
  end to end.
- **Transfer orders.** No partner and two locations. A planned transfer is real
  in a multi-site operation and meaningless in one building; the movement
  already exists, and the order would only be the intent to make it.
- **Consignment.** An ownership question — stock at a customer's site that is
  still yours — which changes what a `stock_levels` row means rather than what
  an order is. Modelling it as a document type would be treating the symptom.

**Deferred, and recorded as open decisions.** Prices on lines, which drag in
currency and tax and belong with invoicing. Partial-line cancellation, which
needs a reason and is a question about what a line means once fulfilment has
started. Expected dates per line rather than per order, which matters for
staggered deliveries and not before.

---

## ADR-028 — Addresses and contacts are shared tables with an exclusive arc

**Context.** Partners need somewhere to put a billing address, a delivery address,
and the people to talk to — the sales rep you order from is not the accounts
payable clerk who chases the invoice, and one customer with three delivery sites
is ordinary rather than an edge case. Our own `site` locations need a postal
address too, for a shipping label or a return slip. Carriers and 3PLs will want
the same two things if they ever become entities of their own.

Three shapes were available.

**Columns on the owner** (`partners.email`, `partners.address_line1`) collapses
immediately. The first question anyone asks is *which* email, and the answer is
"two rows, not one column". It also cannot express a default among several.

**A table per owner** (`partner_addresses`, `location_addresses`) keeps every
foreign key honest at the cost of copying the same eleven columns and the same
indexes for each new owner, and of every query that wants "an address" knowing
which table to look in.

**Polymorphic** (`owner_type` text, `owner_id` uuid) is the usual answer and the
one we are rejecting. It buys the flexibility by giving up the foreign key.
Nothing stops an `owner_id` pointing at a row that does not exist, nothing
cascades when a partner is deleted, and the orphans are invisible because no
constraint can see them. ADR-012 made the organization the owner of its data
through `on delete cascade`; a polymorphic column opts out of that for the two
tables most likely to accumulate rows nobody reads.

**Decision.** One `addresses` table and one `contacts` table, each carrying a
real nullable foreign key per owner kind, with a check constraint asserting that
exactly one is set:

```sql
constraint addresses_one_owner_check
  check (num_nonnulls(partner_id, location_id) = 1)
```

Adding an owner — the organization's own registered address, for invoices — is
a column, a widened check, an index on the new column, and a partial unique
index for its default. Four lines in a migration, no data move, every existing
row keeping its foreign key.

`locations` is deliberately not the address table. A `site` is described as "a
building or address", but the tree stores only a name and a code and cannot
print a label — and more importantly `stock_levels` and `stock_movements` point
at it, so a leaf is anywhere stock can sit. Putting a customer's billing address
in the tree makes it selectable in the move-stock dialog, and eventually someone
transfers four hundred units into Acme's accounts payable department. The two
concepts share the word "address" and nothing else.

**Consequence.** The schema will look wrong to anyone reading it cold: two
nullable foreign keys and a `num_nonnulls` check invite a tidy-up into
`owner_type`/`owner_id`. That tidy-up is this decision being reversed, and this
entry is the reason not to.

Queries pay a small tax. "The addresses for this partner" filters on
`partner_id`, not on a generic owner column, so a helper that fetches addresses
for an arbitrary entity has to know which column to use. In exchange, deleting a
partner takes its addresses and contacts with it, and no scheduled job is
required to find rows whose owner is gone.

`is_default` is enforced by a partial unique index per owner, not by the
application. Without it, a second default is writable, the picker chooses
arbitrarily between them, and the bug is invisible until a shipment goes to the
wrong dock.

Both tables retire rather than delete. Nothing references an address — the
order snapshots where it shipped, below — so removing one would be safe, and
it is still wrong: an address deleted by accident has to be recoverable, and
"everywhere we have ever shipped this partner" is a question somebody
eventually asks. Contacts retire for a stronger reason, since a person may be
named on an order that already shipped. The `DELETE` routes stay, because that
is what the caller means; only the row survives.

Orders snapshot the resolved address onto their own row at creation and keep
`ship_to_address_id` for provenance. `addresses` holds what is true now; an
order records what was true that day. Without the snapshot, a partner moving
warehouses silently rewrites where last year's deliveries went, and the order
stops being a record of what happened — the same reasoning that retires a
partner instead of deleting it (ADR-026).

Nothing validates a postal code, a phone number, or an address line. A format
check that covers every country is a check nobody can write, and rejecting a
valid address is worse than storing an odd one — the same position `tax_id`
already takes (ADR-026). `country` is the exception: ISO-3166 alpha-2, because
shipping and tax both need a machine-readable answer and two letters is a
vocabulary rather than a format.

---

## ADR-029 — A bill of materials is a header plus lines, and nesting is data

**Context.** Production consumes components to produce something else: one
bottle of Vitamin D3 60ct is 60 capsules, one bottle, one cap, one label. Open
decisions carried this as a join table — `(parent_variant_id,
component_variant_id, quantity)` — with two questions named as expensive to
retrofit: whether a BOM is **versioned**, since a recipe changes and a run from
last year consumed the old one, and whether it **nests**, since a sub-assembly
is itself made of components. "Assuming flat and unversioned is the cheap start
and the costly mistake" was the note.

Both questions turn out to be answerable without knowing this organization's
answer, which matters because this foundation is meant to be re-pointed at
another industry (ADR-001's premise) and the recipes there are not yet imagined.

**Decision — components point at `product_variants`, the same table outputs do.**

Nesting then costs nothing and needs no schema support. A blend that feeds three
finished SKUs is a variant with its own BOM; a component that is simply bought
is a variant without one. Whether this organization nests is a fact about its
rows, and an explosion is a `WITH RECURSIVE` query written the day someone asks,
against a table that already holds the tree.

The version that costs a migration is a separate `raw_materials` or `components`
table, on the reasoning that raw materials "are not products". A sub-assembly is
both, so it belongs in both, and the day something bought becomes something
made, its history is in the wrong one. This is ADR-023's granularity test
passing again: the BOM needs no change to products or variants.

**Decision — the output is a variant, not a product.**

Stock, lots, and movements all sit at the variant (ADR-023). A BOM naming a
product could not tell a production order what to increment. 60ct and 120ct are
different recipes in any case.

**Decision — a header table, and versioning by snapshot at consumption.**

    boms       id, organization_id, output_variant_id, output_quantity,
               version, status, notes
    bom_lines  id, organization_id, bom_id, component_variant_id,
               quantity, supply_type, notes

The header is what a bare join table has nowhere to put: a version, a status, a
yield. Splitting it out after the table holds data is the retrofit the open
decision warned about.

Versioning is then mostly not the header's job. A production order copies its
lines from the BOM at release and reads its own copy forever after — the same
move 0012 made for the order ship-to snapshot, for the same reason. A run from
last year keeps showing what it actually consumed no matter what happened to the
recipe since. Given that, `version` is an integer for people to read and
`status` is what stops a draft being released against; neither is load-bearing
for history. Effective-date ranges were considered and rejected as two columns
answering a question nobody asks ("which recipe was current on 3 March"), and
they remain two nullable columns whenever someone does.

`output_quantity` is yield, not per-unit. A recipe stated per single unit forces
a division at data entry, someone rounds 2.4 / 1000 to four places, and the
rounding reappears as stock drift. Batch quantities are also what people say out
loud, which is what they will type.

At most one `active` BOM per output variant, enforced by a partial unique index
rather than in the service — the reasoning `addresses.is_default` got in
ADR-028. A second active row is writable, the picker chooses between them
arbitrarily, and the bug is invisible until a batch is made wrong.

**Decision — a `product_licences` registry, referenced from the BOM header.**

A regulated formulation is made under a registration, and which one a given lot
was made under is history — the one kind of fact that cannot be backfilled. In
Canada the alignment is exact: under the NHP Regulations a change to the
quantity of a medicinal ingredient per dosage unit requires a new product
licence application and, if approved, a new NPN, which is the same event that
produces a new BOM version. Runs point at a `bom_id`, so the trace from lot to
licence already exists.

A table, not a column, because one licence covers several recipes. A licence
attaches to a formulation, dosage form, and recommended use — pack size is none
of those, so 60ct and 120ct of the same product are two BOMs under one number.
A column would copy that number into both and leave the next amendment to
update each, which is the kind of maintenance that is skipped once and wrong
thereafter. A licence is an entity with its own lifecycle; the first version of
this decision made it a string, and the flaw appeared on the first product with
two pack sizes.

The test for what belongs in the registry is whether the registration changes
when the formulation changes — a cosmetic notification number, a DIN, an FCC ID
whose filing is invalidated by a design change, a furniture flammability
certification all pass. A site licence, a food safety permit, and an export
permit all fail: they are properties of a facility or a shipment and belong on
the location, the partner, or the order.

`authority` is free text and `number` is never parsed, because the point is that
schemes differ between markets. The table is identity only — amendment history,
renewals, submission tracking, label versions, and certificates of analysis are
the compliance domain, still open below, and this is what they would hang off
rather than a first instalment of them.

Barcodes are a different axis and are not this. A GTIN identifies a sellable
unit, so it belongs on the variant, two pack sizes have two of them, and two
products sharing one is a GS1 violation rather than a shape worth modelling.

**An empty registry is the expected case in most industries, not a fault.**
Grocery licenses the facility rather than the product, clothing licenses almost
nothing, furniture mostly self-certifies. Those tenants leave this table with no
rows and every `licence_id` null, which is what `lots` already does for an
organization that tracks nothing by lot. The portability test was never that
every industry uses every table — it is that no table blocks an industry and
nothing needs renaming. An `npn_registrations` table with monograph IDs and
declared ingredients would have failed that; free-text `authority` is what
avoids it.

The limit worth knowing: this assumes a certification attaches to a
*formulation*. Some attach to a *batch* — kosher and halal supervision are per
run, and organic certification often is too. That is a lot-level or run-level
record and a different table when it arrives, not a widening of this one. It is
the case most likely to surface first in food.

**Decision — no unit column on `bom_lines`.**

A line's quantity is in the component variant's own `unit_of_measure`. A second
unit on the line invites grams against stock kept in kilograms, and nothing
converts yet — unit-of-measure conversion is still open (ADR-023). The
production order snapshots the unit because a run is a document; a recipe is a
live definition and reads the variant.

**Decision — a cycle guard in the service, not a constraint.**

A BOM whose components reach its own output through any path is an infinite loop
in the exploder. A check constraint cannot see across tables, so this is a
recursive query at write time, in the same class as the `tracks_lots` invariant
ADR-023 put in the service for the same reason.

**Consequence.** Two tables, both of which a future industry can use unchanged.
The naming carries that: `boms` not `formulas` or `recipes`, `supply_type`
values `stocked` and `external` not `we_buy` and `copacker_buys`,
`output_variant_id` not `finished_product_id`. Industry lives in rows, the way
`locations.type` holds five generic words rather than warehouse vocabulary
(ADR-024). A clothing tenant free-issuing fabric to a cut-and-sew factory writes
the same rows as a supplement brand.

What a different industry will want is line *attributes* — a size and colour
matrix for apparel, overage and allergen flags for food, revision and ECO
numbers for engineering. Every one of those is a column added to `bom_lines`, or
its own table keyed on it. None of them changes the two tables above, which is
the test this decision was built to pass.

**Rejected: the bare join table.** Faster, and it is the version that has to be
split the first time a recipe changes.

**Rejected: assuming flat.** Not because nesting was needed, but because
avoiding it required actively choosing a separate component table. Pointing at
`product_variants` is both the simpler choice and the one that leaves the door
open.

---

## ADR-030 — Who supplies a component is a property of the run

**Context.** Manufacturing arrives in three arrangements, and only one of them
is a production order.

We buy the ingredients and hold them. We send some of our own material to a
contract manufacturer who supplies the rest. Or the manufacturer buys
everything and hands over finished goods.

The third is not a run. Nothing of ours was consumed, no stock moved, there is
nothing to explode. It is a purchase order against that partner for the output
variant — identical to buying a finished bottle from a wholesaler — and forcing
it into a production order invents consumption that never happened. The BOM for
that product still exists as the recipe, for the label claim and for the day it
comes in-house. It simply does not fire.

The second is the case that decides the schema. It is free-issue: our stock is
consumed at somebody else's site alongside inputs we never owned.

**Decision — `supply_type` on the line, defaulted by the BOM, actual on the run.**

`stocked` means ours: we buy it, hold it, and the run writes a `consumption`
movement. `external` means whoever manufactures provides it: it never enters our
stock and the run writes no movement, but the line is still there, so the record
of the batch is complete and the arrangement is visible.

This cannot live on the variant. The same herb extract is bought by us this
quarter and by the co-packer next quarter because their price changed — who
supplies a component is a fact about a run, not about a thing. The BOM line
holds the usual case; the production order line holds what happened.

A check constraint carries the consequence: an external line's
`quantity_consumed` must stay zero. A non-zero value would mean a `consumption`
movement for material we never received, which is exactly how a ledger stops
balancing.

**Decision — `partner_id` on the production order, null meaning in-house.**

One nullable column separates outsourced from in-house, the way
`stock_movements` encodes direction by which location column is null. A `kind`
column alongside it would state the same fact twice and let the two disagree.

**Decision — the manufacturer's facility is a `site` in the locations tree,
with `locations.partner_id` marking it as theirs.**

Issuing material is then an ordinary transfer, leaf to leaf, and consumption
happens when the run completes. This is what makes "how much of our material is
sitting at the co-packer" a query rather than a spreadsheet, which is money that
otherwise goes untracked.

ADR-028 warned against putting partner locations in the tree. That warning is
about *addresses* — a billing address becoming selectable in the move-stock
dialog, and four hundred units transferred into Acme's accounts payable
department. A co-packer's facility is genuinely somewhere our stock sits, which
is the definition of a location under ADR-024. The two cases share a word and
nothing else, and a check keeps `partner_id` to `site` rows so nobody hangs one
off a bin.

Nor is this the consignment question ADR-027 deferred. Ownership never changes:
free-issued material is ours the whole time it is there. Consignment is stock
that is physically elsewhere *and* owned by someone else, and it still waits.

**Decision — a manufacturer's lot code is text on the line, not a `lots` row.**

A supplement recall traces through every input, including the ones we did not
buy, so the code has to be recorded. A `lots` row for material we never held has
no stock balance anywhere, and creating one to hold a code puts phantom quantity
in the ledger. `external_lot_code` is free text that cannot be mistaken for
stock, constrained to external lines.

**Decision — a run's output lots are read from the ledger, not stored on it.**

A column for the lot produced assumes one lot per run, and a run splits: it
spans two days, QA holds part of it, some is packed to a different expiry. The
`production` movements already carry `lot_id` individually, and ADR-023 made the
ledger the record. A pointer alongside it can hold one value where the ledger
holds several, which makes it a cache that can only disagree. The lots for a run
are the movements referencing it.

**Consequence.** Two tables, one column on `bom_lines`, one on `locations`.
`stock_movements.reason` already carried `production` and `consumption`
(ADR-023), and `reference_type` was built nullable for precisely this — a run
attaches a reference, it does not change the ledger.

Our books only ever hold half of an outsourced batch. That is correct, and it
means finished-good cost for those runs arrives inside the price on the
manufacturer's invoice rather than being rolled up from components. Cost rollup
is open, and this is one of the reasons it is not simple.

---

## ADR-031 — A duplicate re-resolves snapshots; it never copies history forward

**Context.** An order is raised wrong — wrong partner, wrong quantities, wrong
items — and has already been confirmed. Editing it rewrites what was agreed with
the supplier, and partial-line cancellation is still open, so there is no clean
way to amend part of it. The operation people actually want is: make a fresh one
like this, fix it, and cancel the old.

**Decision.** `POST /v1/orders/:id/duplicate` returns a new `draft`, and what it
does with each field follows one rule — **a duplicate re-resolves snapshots from
their live source and never copies frozen ones forward.** A snapshot exists to
freeze what happened; a new order has not happened yet.

- Copied: `partner_id`, `notes`, and each line's `variant_id` and
  `quantity_ordered`.
- Re-resolved: `sku`, read from the variant again rather than copied from the
  old line. `ship_to_*`, re-snapshotted from `ship_to_address_id` if that
  address is still active, falling back to the partner's current default if it
  is not — and saying so in the dialog. Copying a dead address into a live order
  is exactly what the snapshot was never meant to enable.
- Reset: `status` to `draft`, every `quantity_fulfilled` to zero, `created_by`
  to the current actor, `expected_at` to null, and `reference` to null. The last
  matters most: a supplier's PO number belongs to the order it was issued
  against, and two orders claiming it is a reconciliation problem.
- Added: `duplicated_from_id`, a nullable self-reference, RESTRICT.
  **Decision — duplicate first, cancel last.** Duplicate, fix the draft, confirm
  it, then cancel the original. Cancel-first leaves nothing behind if the create
  fails, and this is the order people do it in anyway, so it is the dialog's flow
  rather than a note in a manual.

**Decision — one helper, three callers.** The same operation makes a new BOM
version (`active` BOM copied to a draft at `version + 1`) and re-raises a
cancelled production run. Written three times it drifts three ways.

**Consequence.** `duplicated_from_id` is the one part that cannot be backfilled.
`@Audited` records the create (ADR-018), but the payload is JSONB and searching
it is still an open decision, so "what replaced order X" is unanswerable from
the audit log — and "why was this cancelled, where did it go" are the two
questions asked about every cancelled order.

**Rejected: duplicating a partially received order.** Re-ordering what already
arrived. Copying only the shortfall is a backorder, which means something
different, and one button with two behaviours depending on data is how a control
becomes untrustworthy. Open below.

---

## ADR-032 — Production runs: partial output, actual consumption, lot identity

Extends ADR-030, which settled the arrangements a run can have. This settles
how one behaves once it starts.

**Context.** A batch does not finish in a day. It yields 400 on Monday and 600
on Wednesday, it consumes more of an ingredient than the recipe planned, and
somebody has to say which lot the Wednesday output belongs to. Each of those
looked like a detail and each turned out to change an endpoint.

**Decision — output is a repeatable event; closing is explicit.**

`POST /:id/output` records a quantity and can happen many times, accumulating
`quantity_produced` while the run stays `released`. `POST /:id/close` is
separate and terminal.

A run does not finish by reaching a number. A batch yielding 980 against a
planned 1000 is finished, not 20 short, and a status machine that waits for the
planned quantity would leave every real run open forever. Someone says when it
is done.

**Decision — consumption is written once, at close, with actual quantities.**

The alternative is backflushing: consume proportionally on each output event,
using planned quantities. That writes a number nobody observed. If a line
planned 2400 g and the batch used 2415, backflush consumes 2400, leaves 15 g of
stock that is not on the shelf, and somebody finds it at the next count and
writes an adjustment. The variance becomes a phantom balance instead of a
recorded fact.

So close takes actual quantities per line. `quantity_planned` stays as planned
and `quantity_consumed` records what happened; the difference between two
columns on one row is the variance, computed rather than stored. Nothing needs
reconciling, because nothing ever claimed the plan was consumed.

**Decision — close tops up from source when WIP is short.**

Release issues planned quantities to the run's location. Consuming 2415 from a
location holding 2400 would hit
`stock_levels_quantity_non_negative_check`, so close first transfers the
shortfall from the source and then consumes — two movements in one
transaction, both describing something that actually happened, and the operator
types one number.

The opposite case is manual on purpose. Issue 2400, consume 2380, and 20 g sits
at the run's location afterwards; the system cannot know whether it went back
on the shelf, was binned, or is still in the mixer, so a person moves it with a
transfer or an `adjustment` carrying a reason.

**Decision — variance warns, it never blocks.**

Past a threshold, close flags the line, puts the figure in the audit payload,
and lets it through.

A cap that refuses to record a real event does not prevent the event. It makes
the operator type the planned number instead, and the ledger then holds a
fiction that looks clean — a visible anomaly traded for an invisible one. No
threshold survives contact either: a trial batch, a first run on new equipment,
and a recovered rework all blow through 30% legitimately, and the first person
to hit a hard cap on a real batch will find a way around it that is worse than
the variance.

The block that does belong is already there:
`stock_levels_quantity_non_negative_check` refuses consuming more than exists.
That is a physical impossibility rather than a statistical one, which is the
only kind of limit that cannot be wrong about a legitimate case.

No notifications table for this. The audit entry is the record and the close
response carries the figure, which is when someone can act on it. One thing
needing to notify somebody is a feature; two is a pattern, and that is the
trigger to build one.

**Decision — output joins the run's open lot by default.**

`POST /:id/output` takes an optional lot reference: omitted creates a lot,
given joins one. The default in the UI is the run's most recent lot, with a new
lot as an explicit action.

The reason is an asymmetry in how recalls fail. One physical batch split across
two lots means a recall of the second leaves the first — the same material — on
shelves. Two batches merged into one lot means a recall pulls both: over-broad,
wasteful, and nothing affected stays out there. Merging errs safe, splitting
errs unsafe, so the default is the one that over-recalls. An earlier draft of
this decision had it backwards.

It also matches the common case: a batch that takes three days is usually one
batch, and small operations label it as one.

The dropdown lists the lots this run produced, read from its `production`
movements, not every lot of that variant — a lot belongs to the run that made
it, and offering last month's would let someone file Wednesday's output under
it. `GET /:id` returns those lots for that reason.

**Decision — the picking source is on the line, not the run.**

`production_order_lines.source_location_id`, set at release, read back by close
when a top-up is needed.

A run's components do not come from one place: the blend is in the cold room,
the bottles are in the packaging aisle, the labels somewhere else again. One
column on the run would hold one value where reality holds several — the same
reason `output_lot_id` was dropped in ADR-030, and a mistake this decision
made once before being corrected. Per line there is genuinely one source, so
the column cannot lie.

Release therefore takes a source per line rather than one for the whole run,
which is what a picker does anyway; the UI defaults every line to one location
and lets the operator change the odd one. An external line has no source, and
a check keeps the column null for those.

**Decision — input-to-output lot linkage stays at run level.**

The ledger records which input lots a run consumed and which output lots it
produced. It does not record which fed which, because consumption happens once
at close while output may have happened several times.

That is sufficient wherever the run is the recall unit, which is the normal
case. The alternatives are consuming per output event — which asks the operator
for Monday's input quantities before Wednesday has happened — or a link table
between output and input lots. Both wait. The trigger is a regulator requiring
one finished lot to be traced to its specific inputs rather than to its batch.

**Consequence.** No schema change beyond what ADR-030 already specified.
Dropping `output_lot_id` is what makes several output lots per run expressible
at all; each `production` movement carries its own `lot_id`, so one lot and
several are the same table.

---

## ADR-033 — A line is editable until something depends on it

**Context.** `UpdateOrderDto` has said since it was written that "lines are
edited through their own routes". Those routes were never built, so a draft
with a wrong quantity has one remedy: cancel it and raise another. Duplicating
does not help — it copies the wrong quantity.

ADR-027 deferred **partial-line cancellation**, which is a different question:
what a line means once fulfilment has started, and what reason it needs. That
deferral was read as covering line editing generally. It does not.

**Decision — the same rule that froze the order reference.** What other records
depend on becomes immutable; what nothing depends on stays editable.

    add a line       draft only
    change quantity  draft or confirmed, refused once anything is received
    remove a line    draft only, and never the last one

A draft line is not a record of anything that happened. No movement references
it, no snapshot copies it, and the order has not been sent. Correcting one is
the same act as correcting a draft BOM's lines (ADR-029), and forcing a
cancelled document for a typo is the outcome worth avoiding.

A confirmed order is different but not frozen. The supplier saying they can
only do 800 is an ordinary amendment to a live agreement, and the audit entry
records who changed it. Removing a line is where this stops: deleting an item
from an order somebody has already been sent is not a correction, it is a
partial cancellation, and that is ADR-027's open question — it needs a reason,
and possibly a status of its own.

**Decision — anything received freezes the line.** `quantity_fulfilled > 0`
refuses both edit and removal, whatever the order's status. Below what has
arrived is nonsense; above it is a renegotiation that should be visible as one.
The `order_lines_fulfilled_within_ordered_check` constraint would catch the
first case anyway, but as a constraint violation rather than an explanation.

**Decision — the last line cannot be removed.** An order with no lines is a
document that orders nothing, which is why `create` writes the header and its
lines in one transaction (ADR-027). Removing the last line would produce by
deletion the state that cannot be produced by creation. Cancel the order
instead.

**Consequence.** No schema change. `variant_id` is not editable for the reason
`UpdateBomLineDto` gives: changing which item a line points at is not an edit
but a different line, and it would have to re-snapshot the SKU and re-check the
unique constraint. Remove and add, both audited, so the trail says what
happened rather than showing one line that quietly became another.

**Rejected: editing a received line with a reason.** That is partial-line
cancellation with a different name, and taking it here would settle ADR-027's
open question by accident rather than by deciding it.

---

## ADR-034 — A short line is closed, not shrunk

**Context.** Order 100, receive 40, supplier says the rest is discontinued. The
line is not complete, the order is not received, and nothing lets anyone say
"this is as done as it gets". ADR-027 deferred this as partial-line
cancellation, needing a reason and a decision about what a line means once
fulfilment has started.

The workaround was marking the whole order received, which is honest at small
scale — a person deciding an order is done is ADR-027's own mechanism — but it
records nothing about which line fell short or why.

**Decision — a flag on the line, and the quantities stay true.**
`is_closed_short` with a required `closed_reason`. `quantity_ordered` remains
100 and `quantity_fulfilled` remains 40.

Reducing the ordered quantity to 40 is the shortcut, and it destroys the
variance: nobody can afterwards tell a short shipment from an accurate one, or
report on which suppliers under-deliver. Production keeps `quantity_planned`
beside `quantity_consumed` for exactly this reason (ADR-032), and an order line
is the same shape.

This is what SAP calls the delivery completed indicator and what Oracle and
NetSuite call closing a line, which is some evidence the shape survives
contact.

**Decision — completeness is derived, and the order's status is not.**
`is_complete` becomes `fulfilled >= ordered or is_closed_short`, and
`fully_received` follows. `quantity_outstanding` goes to zero on a closed line,
because outstanding means still expected and nothing is.

The order's own status still moves by a person marking it received (ADR-027).
Deriving it from the lines would make a document close itself, which is the
thing that ADR rejected — but with every line resolved, that decision is now an
easy one rather than a judgement about a half-finished order.

**Decision — closing is allowed with nothing received, which settles the rest
of the deferral.** A line where nothing arrived and never will is the same
operation with `quantity_fulfilled = 0`. Cancelling a whole line and cancelling
its remainder differ only in the number, and giving them separate mechanisms
would mean two ways to record one fact.

That is also why ADR-033 refuses to *remove* a line from a confirmed order:
this is what removal was standing in for, and it keeps the row and the reason
instead of deleting both.

**Decision — reversible while the order is open.** A supplier finding stock
after all is ordinary. Closing writes no movement and changes no quantity, so
reopening costs nothing and the absence of it would mean a database edit the
first time somebody mis-clicks.

**Consequence.** Receiving against a closed line is refused — reopen first, so
the reversal is deliberate and audited rather than implied by a delivery.

---

## ADR-035 — A price and its currency belong to the line

**Context.** ADR-027 scoped orders to purchase and sale without money, which
was right for a stock ledger and is now the largest gap in the domain. A
purchase order without a price cannot do the one control that matters in
procurement: three-way matching. You agreed 1000 at 1.20, you received 1000,
the invoice says 1.35 for 980 — and nothing catches it.

It also blocks everything downstream. No price at receipt means no cost on the
lot, which means no per-batch cost, which is the chain the costing entries have
been waiting on.

And unlike a selling price, it is unrecoverable. The price was agreed when the
order was raised; reconstructing it later means reading old paperwork. Same
class as licence history (ADR-029).

**Decision — `unit_price` and `currency` both on the line.**

An order header currency was the alternative, and it is the tidier one: a
purchase order is usually one agreement with one supplier in one currency, and
a header currency gives every order a single total.

It is rejected because it cannot represent an order that is genuinely mixed,
and the previous system's data says mixed happens — both
`packaging_material_suppliers` and `packaging_material_batches` carry a
currency per row, so a supplier relationship here spans currencies rather than
sitting in one. A header currency would force such an order to be split into
two documents that are really one, or to record a currency that is wrong for
half its lines.

This is the same grain the previous system used, and it is right for the same
reason: the price of an item is agreed per item.

**Decision — the consequence is accepted rather than worked around: an order
has subtotals, not a total.**

With one currency per line there is no meaningful sum across an order unless
every line agrees. Adding CAD 500 to USD 300 needs a rate, and applying one at
display time means the number changes every day the page is opened.

So `findById` returns an array of `{ currency, amount }`, one per currency
present, and the screen renders each. An order in one currency shows one row,
which is the common case and reads as a total; a mixed one shows two, which is
the truth.

Converting them into a single reporting figure is the exchange rate question,
still open, and deliberately not answered by a display-time division.

**Decision — the subtotals are absent when any line is unpriced.** A sum over
the priced half of an order looks complete and is not, and somebody will
reconcile against it. A `totalsComplete` flag says which, so the screen can
explain rather than showing a number that quietly excludes a line.

**Decision — both nullable, and no default currency.**

Existing lines have neither and neither can be invented. A default currency
would be worse than null: it would assert that an old line was priced in a
currency nobody chose, which is the kind of quiet wrong answer a report
repeats.

A check keeps them together — a price with no currency is a number with no
unit, and a currency with no price says nothing:

    (unit_price is null) = (currency is null)

**Decision — the line total is computed, never stored.** `unit_price ×
quantity_ordered` is derivable, and a stored copy is a third number free to
disagree with the two it came from — the same reasoning that keeps
`quantity_outstanding` in Postgres rather than subtracted in JavaScript
(ADR-025).

Returned unrounded. Rounding to two places is currency-specific — JPY has no
minor unit, so ¥1500 is 1500 and not 1500.00 — and doing it in the query would
bake one currency's convention into every order. `Intl.NumberFormat` knows each
currency's minor units and has the currency to hand; the query does not.

**Decision — a price freezes when the line does.** The existing guard already
refuses to amend a line once anything has been received against it (ADR-033),
and price rides on the same route, so this comes free. It is also right for its
own reason: by then the price has been matched against a supplier invoice, and
changing it afterwards breaks that link silently — exactly the argument that
froze the order reference.

**If mixed orders turn out never to happen**, moving currency to the header is
a migration that can be reasoned about: every line on an order already agrees,
so the header value is unambiguous. The reverse — splitting a header currency
onto lines — is equally safe. Neither direction loses information, which is why
this was worth choosing on how the work actually goes rather than on which
schema is tidier.

**Deferred.** Price *lists* — what you would pay by supplier or charge by tier —
are policy that feeds an order rather than part of one. Exchange rates are a
third thing again: a rate is meaningless without the pair it converts, so
storing a bare number the way the previous system did breaks the moment a base
currency changes.

---

## ADR-036 — A notification belongs to a person, not a tenant

**Context.** Several things now detect something worth telling somebody about
and tell nobody: a run closed with a variance past threshold (ADR-032), an
order line closed short (ADR-034), a password changed, a session opened from a
device nobody recognises (ADR-022). Each says it in a response, which reaches
whoever happened to click the button, and in a log nobody reads unprompted.

**Decision — one table, one row per recipient.**

    notifications  id, user_id, organization_id, type,
                   resource_type, resource_id, title, body,
                   read_at, created_at

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

---

## ADR-037 — Security events are emailed too; notifications expire

**Context.** ADR-036 kept notifications in-app only and named the one case
that could not wait: an unfamiliar sign-in. The in-app notice lands where the
attacker is, and "Mark all read" makes it disappear in one click. Separately,
nothing removed a notification once written, so the table grew with every
emit for as long as the product ran.

**Decision — the three account notifications are also emailed.** These are
`session.created` from an unfamiliar browser, `account.password_changed`, and
`account.password_reset`. The same rule decides both channels, in
`AccountEventService.notify()`, so the inbox cannot drift from the bell or
become noisier than it. The email states what happened, when, the browser,
and the IP. It links to `/forgot-password` and `/account/sessions`, both plain
pages the reader could type themselves. It carries no token and no one-click
"secure your account" action, because that is the shape phishing copies.
User-typed values are HTML-escaped.

**Decision — sent without awaiting, no delivery column.** This runs inside
login, and a slow provider would otherwise hold up the sign-in button. The send
starts before `record()` returns and a failure is logged. A crash mid-send
loses the email, which is the same trade ADR-036 made for the notification row.
No `delivered_at` column and no retry: a security email that arrives an hour
late through a retry queue is worth less than the complexity, until there is a
job runner anyway.

**Decision — lazy retention on emit, per recipient.** Read notifications go at
90 days, matching account_events (ADR-022). Unread ones go at 365 days:
deleting unseen rows is the only way this loses information, so they get
longer, but a year-old unread row only pins the badge at 99+. The sweep runs in
`emit()` for that emit's recipients, using the existing `(user_id, id)` index.
It runs on emit because emit is the only thing that grows the table. It does
not run on `list()`, a GET that fires every time the bell opens, where a
deleting read would take write locks on every click.

**Rejected: a delete / clear button.** It lets whoever holds the session erase
exactly the rows an attacker wants gone. Mark-read hides without destroying.

**Revisit when:** there is a job runner (move email to an outbox with retries,
and retention to a nightly batched delete), or the table is large enough that
monthly partitions dropped whole beat row deletes.

---

## ADR-038 — An audit row names its resource as it was at the time

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

---

## ADR-039 — Component lots: earliest expiry first, with a hand-picked override

**Context.** ADR-032 settled which lot a run's *output* goes into and said
nothing about the lots its *components* come from. Release moved each stocked
component with no lot, and the stock service rightly refuses to move
lot-tracked stock without one. So any recipe containing a lot-tracked
component we stock ourselves could not be released at all, and close had the
same hole when consuming. More than an error: "which ingredient lots went into
finished lot 24-118?" is the recall question for a supplement, and it can only
be answered if release and close record the lots they move.

**Decision — the default is earliest expiry first (FEFO).** For each
lot-tracked stocked line, release takes stock from the source location's lots
in order of expiry, with lots that never expire last, then by when the lot was
first seen, then by id so equal dates always sort the same way. When one lot
is not enough it splits across several. Each lot is its own transfer, so the
ledger names every lot that went to the run. If the source cannot cover the
line, release fails with the component and the gap.

FEFO rather than FIFO because what goes wrong with ingredients is expiry, not
age: a lot received last week that expires first should leave first. It is
also what a warehouse does by hand, so the system's pick matches the shelf.

**Decision — a person can replace the pick for a line.** The release dialog
previews the FEFO allocation (`GET /:id/issue-plan`) and lets someone choose
lots for a line instead: a damaged box, a lot on hold pending a test result, an
instruction to use up an open container. The chosen amounts must add up to
exactly what the line needs, checked in SQL. Lines nobody touched are
allocated by the server at release time against stock as it is then, not as
the preview saw it; the preview is advice, not a reservation.

**Decision — close consumes the lots the run was given.** Consumption is
allocated FEFO among the lots that reached the run's location for this run,
top-ups included, not from whatever else shares the location. A top-up for
consumption over plan follows the same FEFO rule from the source. This keeps
the recall trail exact: every consumed unit traces back through a transfer to
the lot it came from. Close takes no hand-picked lots yet; the run's own lots
are the set, and within them the order rarely matters.

**Decision — all allocation arithmetic is in SQL.** A running total over
numeric(18,4) is exactly what ADR-025 kept out of JavaScript. Stock rows are
locked in lot-id order before allocating: a window function cannot be combined
with FOR UPDATE, and two releases drawing on one shelf must not both plan to
take the same units. Sorted locking follows the same deadlock rule as
transfers.

**Consequences.** The run page lists the lots per component: issued while the
run is open, consumed once it closes. Untracked components are unchanged, one
transfer and one consumption each. Revisit when a real case needs hand-picked
lots at close, or reservations that hold a preview's allocation until release.

---

## ADR-040 — Product licences: a table, dated, and fixed once a run relies on one

> **Amended by [ADR-050](#adr-050--licence-status-at-release-amends-adr-040).**
> Release now checks a licence's status against an organization policy and records it on the run.
>
> **Amended by [ADR-052](#adr-052--calendar-days-are-date-sent-as-yyyy-mm-dd-amends-adr-040).**
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

---

## ADR-041 — Shipping: a shipment is a document, and stock leaves by lot

**Context.** A sale could be raised and confirmed, but nothing fulfilled it:
receiving refused a sale, and there was no outbound counterpart. The order
status that ended a purchase, `received`, was the wrong word for a sale, and
every rule that read it would have had to learn a second one.

**Decision — one lifecycle, labelled by direction.** `received` became
`fulfilled`: every line received or shipped, or closed short, which remains a
person's decision rather than a calculation. The client reads it as
"Received" on a purchase and "Shipped" on a sale. One stored value means one
rule for what can still change; a separate `shipped` status would have meant
`status in ('received', 'shipped')` everywhere, and a forgotten one breaking
the other direction silently. Migrated with the constraint dropped, rows
updated, and the constraint re-added.

**Decision — a shipment is its own record.** Receiving stays per line, because
a supplier's delivery is checked in line by line. Outbound goods travel
together — several lines in one box, one date, one tracking number — so a
`shipments` row is the header (order, source, carrier, tracking, note, who),
and what it carried is the `shipment` movements that reference it, one per
lot per line. The ledger stays the single record of stock leaving (ADR-023);
the shipment is only what those movements hang from. Immutable apart from a
void (below), so no `updated_at`.

**Decision — all or nothing, in one transaction.** If any line cannot be
covered, nothing moves and nothing is recorded as sent. Half a box recorded
as shipped is the record a customer disputes. Lines are processed in variant
order, so two shipments touching the same products take row locks in one
global order and cannot deadlock — the rule transfers already follow.

**Decision — partial by default.** A shipment carries any subset of the
outstanding lines in any quantities; what is not sent stays outstanding on
the line (a backorder) for a later shipment, or is closed short. Over-shipping
is refused by the existing `order_lines_fulfilled_within_ordered_check`.

**Decision — lots leave by the ADR-039 rule.** Earliest expiry first; a lot
with no expiry sorts after every dated one and then by arrival, so
non-perishable stock leaves oldest first (FIFO) without a setting. A person
can replace the pick for a line; the amounts must add up, checked in SQL.
The allocation moved to the stock module, since production and shipping now
share it. A preview (`POST …/shipments/preview`, which writes nothing and is
listed as such in audit coverage) shows the pick first; ship recomputes
against the shelf as it is then. Every shipment movement names its lot, so
"which customers received lot X" is read straight from the ledger — the
forward half of the recall that ADR-039 answered backwards.

**Decision — `orders.ship` is its own permission**, for the reason
`orders.receive` is: the person packing boxes is not usually the person
raising orders.

**Consequences.** Two indexes on `stock_movements` — by lot, and by
reference type and id — keep recall and per-document reads fast as the
ledger grows; the second also serves the production run page. Deferred, each
additive: a printable packing slip, carrier integration, a
minimum-remaining-shelf-life rule per customer, idempotency keys on the ship
endpoint, reservations, a samples screen for the existing `sample` reason,
and a returns flow for the existing `return` reason.

**Amendment (v0.3) — voiding a shipment recorded too early.** A shipment
can be voided while its order is still confirmed and nothing from it
has come back. Nothing is deleted: each shipment movement gets an adjustment
back into the bin it left, referencing the same shipment and carrying the reason;
the lines' fulfilled quantities drop, which returns the order's holds;
and the shipment is marked voided and kept. Lot trace and returns ignore
voided shipments, because nothing left. A shipment that has had anything
returned did leave, and is corrected with a return instead.

---

## ADR-042 — Samples, and stock that is not for sending

**Context.** "Sample" covers four different situations, and treating them as
one either invents a flow nobody needs or hides stock from a recall. The
`sample` movement reason existed with nothing using it, and
`locations.is_available` was recorded but never enforced.

**Decision — a posted sample is a sale.** Sent to a customer or prospect
with an address, it ships, prints a packing slip and is traced exactly like a
sale, so it is one: an order with `is_sample`, usually priced at zero. The
flag exists only so reports can tell samples from revenue. A check keeps it
off purchases.

**Decision — a hand-out is a `sample` movement.** A trade show, a visitor, a
bottle opened for a test: stock leaves with no paperwork. Sent from the
inventory row like Ship out, with an optional recipient. The recipient is a
partner, checked against the organization and stored as a `partner`
reference, because a lot handed out free is exactly what a recall must still
find.

**Decision — references are the server's to set.** The public movement
endpoint no longer accepts `referenceType` or `referenceId`. Shipments, runs
and orders read "every movement referencing me" as fact, and a client naming
a reference could attach a movement to any document, another tenant's
included. The client states intent — a recipient — and the server records
it. The columns stay, so a new kind of reference still needs no migration.

**Decision — unavailable locations hold stock that is not for sending.**
`is_available` is now enforced: a location marked unavailable can hold stock
and move it, but cannot be the source of a shipment, a sample, or a
production issue. Consumption is not refused, because a run's own location is
often marked unavailable precisely as work in progress. Retained samples —
which GMP requires for supplements — are then just stock in such a bin,
recorded by an ordinary move, and never counted as gone.

**Decision — anything not in inventory stays out of it.** A prototype or a
brochure that was never received has no stock to move. Recording it as
movement would put a fiction in the ledger; it belongs in a partner's notes,
or in the catalogue once it is stocked for real.

**Consequences.** Nothing here is specific to supplements: showroom samples,
press samples and archive rails in clothing map onto the same four cases
unchanged, and only location names differ. Deferred: filtering samples out
of sales reports (the flag is there to do it), and a returns flow for the
existing `return` reason.

---

## ADR-043 — Customer returns

**Context.** Shipping had no counterpart. The `return` movement reason
existed with nothing writing it, so goods a customer sent back could only be
recorded as an adjustment — which says the count was wrong, when it was not.

**Decision — a return is a document against a sales order.** The mirror of a
shipment: a header (destination, reason, note, who) with `return` movements as
the record, one per lot per line, each referencing it. Allowed on confirmed
and fulfilled sales, since a return most often arrives after the order is
done. Purchases are refused; goods sent back to a supplier are an adjustment.

**Decision — only what went can come back.** A lot can be returned only if it
shipped on this order, and never more of it than went, counting earlier
returns. Both are read from the order's own shipment and return movements,
so no counter can drift from the ledger. A lot that never reached this
customer cannot enter the recall trail against their order.

**Decision — shipped is never reduced.** `order_lines.quantity_returned`
rises beside `quantity_fulfilled`, checked never to exceed it. Lowering
"shipped" would erase that it shipped, which is the history a recall reads.

**Decision — receive, then decide.** A return lands wherever the receiver
chooses, usually a location marked unavailable (ADR-042), so nothing ships it
again before it is checked. Restocking is then an ordinary move and writing
off an ordinary correction; neither is part of the return.

**Decision — tracked lines by lot, summed in SQL.** A tracked line sends the
lots that came back, an untracked line a quantity, and the server refuses
the wrong shape. The line's total is computed in the database, not by the
client (ADR-025).

**Decision — `orders.receive`.** Taking goods back is receiving, done at the
same dock by the same person; it writes inbound movements as a receipt does.

**Consequences.** Deferred: refunds and credit notes, which belong to
invoicing; returns to suppliers as a document; and restock or write-off as a
step of the return rather than separate actions.

**Deferred: return authorization (RMA).** A return is recorded when the goods
arrive. There is no step before that where the customer asks, the return is
approved, and the goods are expected. That approval is where replacement,
credit, or nothing is decided, so it belongs with credit notes (v0.4), not
before them.

---

## ADR-044 — Lot trace

**Context.** Every movement records its lot, but answering "this lot is bad —
who has it?" meant crossing four or five screens by hand, and still missed
customers who received a batch *made from* the bad lot, since the
ingredient's own movements never name them.

**Decision — full genealogy, read from the ledger.** One read follows a lot
both ways through runs, as far as the chain goes: up to every ingredient lot,
down to every batch, and from those to everyone who received any of them by
shipment or sample, with what came back. Runs are the joints — what a run
consumed is upstream of what it produced — so nothing new is recorded, and
there is no genealogy table to fall out of step with the movements.

**Decision — search by any part of a code, across products.** A recall
arrives as a code read off a label, or the part of it people remember — a
batch number, a date — with no product attached, and the same code can exist
for two products; every match is shown with its SKU, codes starting with the
text first.

**Decision — search by the start of a code, across products.** A recall
arrives as a code read off a label, with no product attached, and the same
code can exist for two products; every match is shown with its SKU.

**Performance.** A recursive query steps from the lots already found, using
the `(organization_id, lot_id)` and `(organization_id, reference_type,
reference_id)` indexes, so its cost grows with the trace rather than the
ledger. A depth limit of ten and a path guard stop a bad record looping.

**Consequences.** Deferred: exporting the recipient list for a recall
letter, and quantities per downstream batch proportioned from the ingredient.

---

## ADR-045 — Reservations: available to promise, computed rather than stored

**Context.** Two confirmed sales could both count on the same fifty units, and
the second learned otherwise only when its shipment was refused. Nothing
stopped a production run, a hand-out or a one-off shipment from taking stock
a customer had already been promised.

**Decision — per product, across available locations.** What can be promised
is stock at locations marked available (ADR-042), minus what open orders
hold. Not per location, because a sale has no location until it ships; not
per lot, because lots are still chosen at ship time, earliest expiry first
(ADR-039), and holding exact lots would stop that rotation.

**Decision — computed, never stored.** An open confirmed sale line already
states what is owed: ordered minus shipped, unless closed short. Holds are
derived from those lines and from stock levels on every read, so there is no
reservation table to keep in step with them, and nothing to drift.
"Reserved on confirm, released on ship, close-short or cancel" is not code
anywhere — it is what those transitions already do to the line.

**Decision — first confirmed, first held.** When demand exceeds stock, holds
are allocated in order of confirmation: each line holds what is left after
every earlier-confirmed line, up to what it still needs. `orders.confirmed_at`
records the order; existing confirmed orders take their creation time.
Without a priority, every order short of stock would block every other.

**Decision — confirm anyway when short.** Confirming never refuses for lack of
stock. The line holds what exists, and the shortfall is shown as a backorder.
A real order is real whether or not the shelf is full today.

**Decision — enforced where stock leaves or is committed.** Shipping against
an order may use its own hold and whatever is unheld, but not another order's.
A production release, a hand-out sample or a one-off shipment may use only
unheld stock. Adjustments and transfers are not checked: they record what
physically happened, and refusing them would put the ledger out of step with
the shelf. The check and the movement run under a per-product advisory lock,
taken in product order, so two transactions cannot both spend the same
unheld units.

**Performance.** One product's holds are one query over its open sale lines
(`order_lines` by organization and variant, already indexed) with a window
sum for the priority, and one over its stock levels. Nothing scans the ledger.

**Consequences.** Deferred: manual priority overrides, holds on specific lots
for customers who require them, reserving components for planned production
runs, and holds that expire.

---

## ADR-046 — Invoicing: an invoice bills one shipment, and is reversed, never edited

**Context.** The system moves goods but not money. A shipment leaves with a
packing slip and nothing says what the customer owes for it. Two rules were
waiting on this: Void shipment is refused once an order is marked shipped
(ADR-041, amendment), because nothing else marked the point after which a
shipment is settled; and "Mark shipped" (#24) closes an order under a name
that describes a different act. Prices are already on sale lines (ADR-035),
nullable and per line, which is the input an invoice needs and the source of
two of the decisions below.

**Decision — sales only.** This ADR covers invoices to customers. Supplier
bills and three-way matching (ADR-035's reason for prices on purchase lines)
are the same shape seen from the other side, and wait until someone matches
a supplier invoice in the app rather than on paper.

**Decision — one invoice per shipment.** An invoice is created from a
shipment and bills exactly what that shipment carried: its lines, in the
quantities that left. Billing on delivery is the default in SAP and NetSuite,
and it is the grain the rest of the system already has — a shipment is a
document with one date, one box and one packing slip (ADR-041), so "what did
this invoice bill" and "which shipment is not yet billed" are both one join.

Invoicing per order was the alternative, and it is rejected because orders
ship in parts: an order-level invoice either waits for the last box or bills
for goods that have not left. Consolidating several shipments onto one
invoice — monthly billing for a busy customer — is deferred. It moves the
shipment reference from a column to a join table, which is a migration that
can be reasoned about, since every existing invoice has exactly one.

A partial unique index on `invoices (shipment_id) where status <> 'voided'`
enforces it: at most one standing invoice per shipment, while a voided one
stays beside its replacement.

**Decision — draft, issued, voided.** A draft is a working copy: created from
the shipment, prefilled from the order lines, editable and deletable, with no
number. Quantities come from the shipment and cannot be changed — the invoice
bills what left, and a different quantity is a different shipment. Price and
tax code default from the order line and can be edited on the draft.

Issuing assigns the number and the invoice date, computes and stores every
amount, snapshots every name and address, and freezes the invoice. After
that nothing on it changes. A mistake is corrected by reversing it (below)
and issuing a new one, never by editing — an invoice that has been sent is a
record the customer holds a copy of, and an edit would make the two copies
disagree without saying so.

Paid is not a status. It needs payments recorded against the invoice, which
are deferred (below); "issued" means "sent and owed", nothing more.

**Decision — one currency per invoice, and one currency per sale.** An
invoice is paid in one currency, taxed on one total, and owed as one amount,
so it has a header currency. Every system that issues invoices works this way.

ADR-035 put currency on the line because suppliers price in more than one
currency, and that stays true for purchases. For sales it is enforced at
confirm: every priced line on a sale must share one currency, refused with
409 otherwise. A sale in two currencies would need two invoices per shipment
and has no evidence behind it. The invoice then takes the order's currency,
and a mixed invoice cannot exist.

**Decision — a sale is priced before it is confirmed.** Confirming a sale is
the customer's commitment, and it is the point at which a price is agreed.
Every line on a sale must have a price at confirm, refused with 409
otherwise. Zero is a price — a replacement, free goods — and null is not:
null means nobody decided, and an invoice cannot bill an undecided amount.
Creating an invoice checks again, as defence in depth.

Purchases stay optional. A purchase order is sometimes raised before the
price is known, and the supplier's bill supplies it.

Sample orders (ADR-042) are exempt from both checks and are never invoiced.
They ship and trace like sales; they are not billed. If a customer needs a
valued document for a sample — customs, usually — that is a pro forma
(deferred).

Before the confirm check ships, a query lists confirmed sales with unpriced
lines. If there are none in production, nothing more is needed; if there
are, they are priced by hand before the migration, rather than building a
way around the rule.

**Decision — amounts are stored at issue, deliberately unlike an order.**
ADR-035 computes an order's line totals and never stores them, because an
order can still change and a stored copy would drift. An issued invoice
cannot change, which removes that reason, and the opposite reason applies: an
invoice's amounts are a legal record and must read the same in ten years
whatever happens to rounding code, tax rates or the order it came from.

So issuing writes, per line, the net amount (quantity × unit price, rounded
to the currency's minor units), and per invoice the subtotal, each tax
amount, the tax total and the total. Every later read — the invoice page, a
customer statement, what is owed across all customers — sums stored numbers
and recomputes nothing.

Amounts are `numeric(18, 4)` and strings end to end, as quantities are
(ADR-025). Rounding happens once, in SQL at issue, half away from zero
(Postgres `round`), to the currency's minor units — which the server reads
from `Intl.NumberFormat`, the same source the client uses, so JPY rounds to
whole yen without a table of currencies to maintain.

**Decision — tax by code, rounded once per invoice.** A tax code is
organization data: a name and one or more components, each a name and a
rate, so a code can be one tax or two applied to the same amount (a federal
and a provincial sales tax, say) and "exempt" is a code with none. Each
invoice line carries a tax code, defaulting from one chosen for the invoice,
because a single invoice can mix taxable and exempt items.

Tax is computed per component on the sum of the net amounts of the lines
that carry it, and rounded once — not per line. Rounding per line drifts by
a cent per line on long invoices, and tax authorities that specify a rule
generally ask for the invoice level. The component name and rate are copied
onto the invoice at issue, so a later rate change never rewrites an old
invoice.

Choosing the code automatically — from the ship-to region and the product —
is deferred. Until then a person picks it, which is what a small business
does anyway.

**Decision — numbers are gapless per organization, assigned at issue.** An
invoice number is what the customer quotes and what an auditor counts, so
it has no gaps and no duplicates within an organization, and drafts have
none (a deleted draft would otherwise leave a hole).

A counter row per organization and document type (`document_sequences`),
incremented with `update … returning` inside the issuing transaction. If the
issue fails, the transaction rolls back and so does the number. A Postgres
sequence was the alternative and is rejected: sequences are not
transactional, so a failed issue burns a number, and they are global rather
than per tenant. Credit notes take their own series from the same table.

The cost is that two invoices issued at the same moment by one organization
queue on one row lock for the length of an issue — a few milliseconds, at
the volume a B2B tenant issues invoices.

**Decision — snapshots, as orders and movements already do.** Issuing copies
the seller (organization name, registered address, tax registration number),
the bill-to (the customer's name and default billing address, from
`addresses.is_billing`), the ship-to as the order holds it, and per line the
SKU, item name, quantity, unit price and tax. The organization's own address
is the owner column ADR-028 anticipated. Foreign keys stay for provenance and
are never read to display an issued invoice — the reasoning of the order's
ship-to columns, for the same reason.

The invoice date and due date are calendar days, so they are `date` columns
from the start (#20 is the cost of not doing that). The due date is entered
on the draft; payment terms that compute it are deferred with payments.

**Decision — a mistake after issue is reversed by a credit note.** A credit
note is its own document: its own number series, lines, stored amounts and
snapshots, and a reference to the invoice it credits. Voiding an issued
invoice, with a required reason, issues a credit note for the whole of it in
the same transaction and marks the invoice voided. Nothing is deleted; both
documents stay and print.

This is how SAP cancels an invoice, and it is what countries with strict
invoicing rules require, since they do not allow an invoice to be cancelled
outright. A system that voided by flag alone would work where the rules are
loose and need rebuilding where they are not; one that voids by credit note
works in both.

Voiding frees the shipment: the unique index ignores voided invoices, so the
shipment can be invoiced again (a wrong price: void, then re-invoice) or
itself voided (below). A credit note that is not a void — for a return, a
price correction, a debt that will not be collected — leaves the invoice
issued and the shipment billed, because the goods did leave and were billed.
Those credit notes are decided with returns and RMA in ADR-047; this ADR
fixes only the document's shape and the full reversal.

A draft is simply deleted, since nobody outside has seen it.

**Decision — Void shipment is refused while an invoice stands, not while the
order is closed.** This amends ADR-041's amendment. A shipment can be voided
while no draft or issued invoice references it and nothing from it has been
returned. A draft is deleted first; an issued invoice is voided first. The
order being fulfilled no longer blocks it: voiding a shipment on a fulfilled
order reopens the order to confirmed, because the order was closed on the
understanding that its goods had left, and they had not. The reopen is part
of the void's transaction and its audit row.

The v0.3 workaround — a return with the reason "never left" — is no longer
needed and no longer recommended, since it records goods coming back that
never went.

**Decision — "Mark shipped" becomes "Close order" (#24).** Ship is the box
going to the carrier; closing says no more shipments are coming, with every
line shipped or closed short. The stored status stays `fulfilled` (ADR-041).
Closing locks nothing to do with money: a closed order's shipments can still
be invoiced, since billing after the last box leaves is ordinary.

**Decision — permissions follow the people.** `invoices.view`,
`invoices.create`, `invoices.update` and `invoices.delete` for drafts, and
`invoices.issue` (issue and void). Issuing is the finance act — the one a
customer and an auditor see — and is often held by fewer people than
drafting, the reasoning that gave `orders.ship` and `orders.receive` their
own permissions. Audited as `invoice.created`, `invoice.updated`,
`invoice.line_updated`, `invoice.deleted`, `invoice.issued`,
`invoice.voided` and `credit_note.issued`; the permission-coverage and
audit-coverage tests include every new route.

**Decision — printable, like the packing slip.** An issued invoice and a
credit note each print from their stored snapshot. A voided invoice prints
with VOID and the reason, and the credit note names the invoice it reverses.
A draft prints marked DRAFT with no number, so it cannot be mistaken for a
sent invoice.

**Performance.** Reads never recompute: an invoice, a customer's invoices,
and everything owed are sums over stored amounts. Indexes: unique
`(organization_id, number)` per document; `(organization_id, partner_id,
invoice_date desc)` for a customer's history; `(organization_id, status)` for
what is draft or issued; and the partial unique index on `shipment_id`,
which also answers "is this shipment billed" for the Void check and the
"not yet invoiced" list. Numbering costs one row lock per issue per
organization.

**Consequences.** New tables: `invoices`, `invoice_lines`, `invoice_taxes`,
`credit_notes`, `credit_note_lines`, `credit_note_taxes`, `tax_codes`,
`tax_code_components`, `document_sequences`; an owner column on `addresses`
for the organization; a tax registration number on `organizations`. Confirm
gains two refusals for sales (unpriced line, mixed currency). Void shipment's
rule changes and gains a reopen. The close button is renamed.

**Deferred.**

- **Pro forma invoices** — a valued document that creates no debt: for
  customs, prepayment, a customer's approval, a sample's declared value. Its
  own document type and number series, never counted as owed. Additive, and
  left out only to keep v0.4 to the invoice that carries legal weight;
  bring it forward if it is needed in use.
- **Payments** — amounts received, which invoice they settle, partial
  payments, balances, overdue, payment terms computing the due date, and
  write-off of an uncollectable balance. Until then an uncollectable invoice
  is credited in full with that reason (ADR-047), leaving it issued.
- **Supplier bills** and three-way matching against purchase lines and
  receipts.
- **Consolidated invoices** across several shipments.
- **Charge lines** — freight, handling — which are not goods and have no
  shipment movement; a line kind, additive.
- **Automatic tax determination** from region and product.
- **Exchange rates** and a home currency: invoices are recorded in their own
  currency, and converting for reporting or tax in the home currency waits
  on the exchange-rate question left open by ADR-035.
- **Sending** an invoice by email or e-invoicing network; creating a draft
  automatically on ship.

**Amendment — one currency from the first priced line, not only at
confirm.** Enforcing it only at confirm let a draft sale be built that
confirm must refuse, and the ways a line gets its price disagreed: a list
price in another currency was left off (ADR-049) and "Use list price"
refused one, while a typed price was accepted. Every write now holds a
sale to the currencies its priced lines already use, on a draft as much as
once confirmed; a conflicting list price on an added line is still left
off rather than refused. Purchases keep a currency per line (ADR-035). The
check accepts any currency the sale already uses, so a draft priced in two
before this change can still be brought back to one; confirm keeps its own
check for those. This is how sales documents work elsewhere: one document
currency, chosen per order.

---

## ADR-047 — Return authorizations, and credit notes for what comes back

**Context.** A return is recorded when the goods arrive (ADR-043): a header
and `return` movements, with nothing before it and nothing after it. There is
no step where a customer asks, someone decides, and the goods are expected;
and nothing turns goods coming back into money going back. ADR-043 deferred
the first, because the approval is where credit, replacement or nothing is
decided, and that needed credit notes to exist. ADR-046 built them, but so
far only a void creates one, and it always reverses a whole invoice.

The return policy itself is not decided, and will differ by business: some
credit in full on arrival, some only after inspection, some withhold a
restocking fee. So this ADR decides the records and the limits, and leaves
the policy to the person — what is credited, and at what value, is chosen
when crediting, within caps that make a double credit impossible.

**Decision — an RMA is its own document.** A return authorization (RMA,
`return_authorizations`) is raised against a sale when a customer asks to
send something back. It has a number from its own series (`RMA-000001`, a
third type in `document_sequences`), a reason, optionally the invoice the
customer is returning against, and lines naming the order lines, how many
of each may come back, and what happens to them.

The invoice is optional because a customer does not always quote one, and
recorded when they do, because they usually do — "I'm returning part of
INV-000042" — and it is then the obvious invoice to credit.

A flag on the existing return was the alternative, and it is rejected
because the two records describe different moments. The authorization is a
promise made before anything moves — often days before, sometimes for goods
that never come — and the return is what arrived at the dock. One RMA is
often received in more than one box.

**Decision — authorized when raised; no request step.** There is no customer
portal, so a request always reaches the business as a call or an email, and
the person entering it is the person deciding. An RMA is created authorized.
A request that is refused is not recorded as an RMA; the reason belongs in
the conversation with the customer, not in a document that authorizes
nothing. A requested-then-approved lifecycle is deferred with any portal
that would give it a second actor.

**Decision — a resolution per line.** Each RMA line is one of:

- **credit** — money back for what the customer returns;
- **replace** — the same goods sent again, at no charge;
- **none** — goods back for inspection or disposal, nothing owed either way.

Per line because one box often holds both: a damaged unit credited and a
wrong item replaced. One resolution per RMA was the alternative, and it
would make that box two RMAs for no reason the customer would recognise.
ERP return orders decide per item for the same reason.

**Decision — goods expected, or not.** An RMA says whether goods are coming
back. Usually they are. Sometimes the customer is told to destroy a damaged
unit and is credited anyway, and waiting for a box that will never arrive
would block the credit forever.

**Decision — a return may name an RMA, and is held to it.**
`order_returns.return_authorization_id`, nullable. A return against an RMA
can bring back at most what the RMA authorized for each line, less what
earlier returns against it brought, and only for its lines — refused with
409 otherwise, before any movement. The ADR-043 rules still apply on top:
only what shipped on the order, never more of a lot than went.

A return with no RMA is still recorded. Goods on the dock are a fact, and a
ledger that refuses to record them is a ledger that is wrong. Such a return
earns no credit on its own; if one is owed, an RMA is raised afterwards and
the return is linked to it. That link is the one change a return ever sees,
from empty to set, once — the return stays otherwise immutable, as ADR-043
made it.

**Decision — lifecycle: open, closed, cancelled.** An RMA is open until
someone closes it — goods received and resolved, or the customer never sent
the rest. It can be cancelled while nothing has been received against it
and no credit issued; after that it is closed, not cancelled, for the
reason a shipped order cannot be cancelled (ADR-023). Closing is a person's
decision, as closing an order is (ADR-027); arithmetic does not do it.

**Decision — a credit note credits one invoice.** Every credit note is
against one invoice, as ADR-046's schema already says, and a customer
reconciling reads each against the invoice it names. A return that crosses
two invoices is two credit notes.

For an RMA the invoice defaults to the one the RMA names; failing that, to
the invoice of the shipment that carried a returned lot, when there is
exactly one; failing that, the person picks from the invoices that billed
the RMA's order lines. Choosing automatically for untracked goods split
across invoices was the alternative, and it is rejected: there is no right
answer there, only a convention, and a wrong convention silently credits
the wrong document.

**Decision — what is credited is decided when crediting.** Inspection is
where most return policies are applied, so the quantity and value are the
person's, not the software's, within limits:

- **Quantity** defaults to what came back and has not been credited — or,
  when no goods are expected, to what was authorized. It can be lowered:
  two of five came back used, and are credited as three. It cannot exceed
  what the RMA authorized for a credit line, less what earlier credits
  against that RMA line took.
- **Unit price** defaults to the invoice line's and can be lowered, never
  raised. One rule covers the common cases: a restocking fee is five units
  at 85% of the price; goodwill is one unit at a reduced price; a price
  correction is every unit billed at the difference.

The price never rises above the invoice's because a credit that pays back
more than was charged is not a credit, and would be the easiest way to get
money out of the business with a plausible document.

**Decision — capped by value, per invoice line.** The net amounts of all
credit notes against an invoice line can never exceed that line's net.
Checked in SQL before any write, summed over `credit_note_lines` for that
invoice line — the index ADR-046 put there — and refused with 409 beyond it.

By value rather than by quantity, because credits at a lowered price break
a quantity cap: a price correction on all six units, then a return of two,
would count eight of six while crediting less than was billed. The value
cap is what makes any mix of corrections, fees and returns safe, and it is
what stops a unit being credited twice even across two RMAs.

**Decision — the invoice's rates, never today's.** A credit line's net is
quantity × its unit price, rounded to minor units. Tax is summed per
component and rounded once per credit note, the invoice rule, using the
rates the invoice was issued with — never the tax code's current rates,
which may have changed by law since.

That needs something the schema does not yet hold: which components applied
to each invoice line at issue. `invoice_taxes` sums them per invoice, and
`invoice_lines.tax_code_name` keeps only the code's name. So issuing also
writes `invoice_line_taxes` — per line, each component's name and rate —
from the same calculation. Invoices already issued are backfilled from
their lines' tax codes in the migration; there are none in production.

Per component, a credit note's tax is capped at what the invoice charged
less what earlier credit notes took. Partial credits each round on their
own, and without the cap three of them could total a cent more than the
invoice ever charged.

**Decision — credits without goods need no RMA.** A price correction,
goodwill, and a debt that will not be collected move no goods, so there is
nothing to authorize: the credit route takes an invoice, lines, quantities,
unit prices and a reason, with no RMA. The same caps apply. This replaces
"void and invoice again" as the way to fix a wrong price, though that still
works.

The uncollectable stopgap from ADR-046 is the case where every line is
credited at its full remaining value with the reason "Uncollectable". The
invoice stays issued and its shipment stays billed, because the goods did
leave; only the money is written off. It stands until payments exist.

**Decision — previewed, then issued; still no draft.** ADR-046 created
credit notes issued, and that stays. A partial credit has figures worth
checking, so the server offers a preview — the same calculation, returned
and not stored — and the dialog shows it before anyone confirms. What the
preview showed is what issuing stores, the rule the invoice's draft preview
follows. A draft credit note would add a status, relaxed checks and a
delete path for a document checked in one dialog.

**Decision — replacement is a sale at zero.** For the lines resolved as
replace, Raise replacement creates a draft sale, each line priced at zero in
the order's currency, linked to the RMA (`orders.return_authorization_id`).
It then confirms, ships and traces as any sale does, and invoices at zero if
anyone invoices it — ADR-046 already treats zero as a price and null as
undecided, so the replacement passes confirm without a special case.
Sending the replacement before the faulty goods arrive is the person's
choice, not a rule.

A new document type for replacements was the alternative. It would ship,
trace and hold stock exactly as a sale does, and every one of those paths
would need to learn it.

**Decision — samples and uninvoiced goods.** A sample (ADR-042) can have an
RMA whose lines are replace or none, never credit: nothing was billed. Goods
from a shipment not yet invoiced are credited after that shipment is
invoiced, not before; the invoice bills what left (ADR-046), and the credit
takes back what returned. Netting returns into the invoice instead was
rejected because it makes an invoice's quantity differ from its shipment's,
which is the property invoicing rests on.

**Decision — permissions follow the people.** An RMA is customer service:
`return_authorizations.view`, `.create` and `.update` (cancel, close, link a
return, raise a replacement). Receiving against one stays `orders.receive`,
the dock's permission (ADR-043). Issuing a credit note, with or without an
RMA, stays `invoices.issue`, the finance permission voiding already uses —
whoever may send an invoice is who may take money back on it. Audited as
`return_authorization.created`, `.cancelled`, `.closed`,
`return_authorization.return_linked`, `return_authorization.replacement_raised`
and `credit_note.issued`, the last being the action ADR-046 held back until
a route recorded it.

**Consequences.** New tables `return_authorizations` and
`return_authorization_lines` (each line with its resolution), and
`invoice_line_taxes`; nullable `return_authorization_id` on `order_returns`
and on `orders`; `credit_note_lines.return_authorization_line_id`, nullable,
so a credit for goods says which RMA line it settles; `return_authorization`
added to `document_sequences`' types. Issuing writes per-line tax
components. The returns route learns an optional RMA and its limits. The
credit note routes gain a preview and a create beside the void.

**Deferred.**

- **A free-standing amount** — "$50 off this invoice" — not tied to any
  line. Every credit in v0.4 credits a line; a discount on the whole is
  spread across its lines by hand.
- **Refunds** — paying a credit back rather than setting it against the
  next invoice. They need payments.
- **A request step and a customer portal**, and choosing the invoice
  automatically for untracked goods.
- **Inspection as a recorded step** — accepted, rejected, restocked or
  scrapped per unit. Until then the result is what the person credits, and
  restocking or scrapping is an ordinary move or correction (ADR-043).
- **Returns to suppliers** as a document (ADR-043, still deferred).
- **Pro forma invoices** (ADR-046, still deferred).

---

## ADR-048 — Cost: value is a ledger, like quantity

**Context.** The chain the costing entries have waited on is price on the
order line (ADR-035) → cost on the lot → cost of a run → cost of a unit. The
first link exists. Nothing carries it further, so the system cannot say what
batch FOC-2609-01 cost to make or what the stock on hand is worth, and a
purchase price agreed on a line is lost to costing the moment the stock
lands — unrecoverable later, the same class as licence history.

ADR-023 put `unit_cost` on the batch. The code has since shown three reasons
it cannot sit there:

- A lot is reused by its code, so a second delivery of L2024-A joins the
  first, possibly at another price.
- A variant that does not track lots has no lot at all: bottles, caps,
  labels.
- A batch's cost is not known when its output is written. Output is recorded
  as it happens, and consumption only at close (ADR-032).

**Decision — value is an append-only ledger beside the quantity ledger.**
`stock_valuations`, one row per event that changes what stock is worth:

    stock_valuations  id, organization_id, variant_id, lot_id,
                      kind,                      -- see below
                      movement_id,               -- null for rows no movement caused
                      quantity,                  -- signed; zero for revaluations
                      value,                     -- signed, in the base currency
                      unit_price, currency,      -- as paid, on acquisitions
                      exchange_rate,             -- the rate applied, on acquisitions
                      needs_cost,                -- valued at zero for want of a price
                      reference_type, reference_id, note, actor_id, created_at

Nothing updates a row and nothing deletes one; a correction is a new row.
The reasons are ADR-023's, applied to money. A figure that can be recomputed
cannot answer "why did the value of this lot change". And a month that has
been reported must not change afterwards: a price corrected in March is a
March event, not a rewrite of January's cost of goods. SAP, Dynamics,
NetSuite and Odoo (`stock.valuation.layer`) all keep this ledger for the
same reasons.

`kind` is closed:

- `movement` — the value a stock movement carried;
- `run_close` — a batch's cost arriving at close;
- `correction` — a cost set or changed after the fact;
- `opening` — the balance this ADR starts from.

**Decision — the pool is the lot, or the variant when there is no lot; its
cache is the lock.** `valuation_pools (organization_id, variant_id, lot_id)`
holds `quantity` and `value`, unique with `nulls not distinct`, so an
untracked variant has exactly one pool. A pool's unit cost is value ÷
quantity.

It works exactly as `stock_levels` does (ADR-025):

- A movement upserts its pool row first, which takes the lock, then writes
  its valuation row in the same transaction.
- `quantity >= 0` is checked on the pool.
- The e2e reconciliation extends to money: a pool's quantity and value equal
  the sums of its valuation rows, and its quantity equals the sum of its
  `stock_levels` rows.

The pool is not per location. Value does not change when stock moves between
shelves, so transfers write no valuation row. What one location holds is
worth its `stock_levels` quantity × its pool's unit cost, computed.

**Decision — the method: weighted average within a pool.** Each inbound adds
its quantity and value to the pool. Each outbound takes quantity × the pool's
current unit cost, computed in SQL under the pool's lock. When an outbound
takes the pool's last unit, it takes the pool's remaining value exactly, so
rounding never leaves value behind in an empty pool.

- **Tracked stock.** The pool is the lot. Almost every lot has one
  acquisition, so its cost is what that delivery cost: actual cost per
  batch, for free. Where a lot arrived twice at different prices, its units
  are indistinguishable, and the average is the honest figure. Picking stays
  earliest expiry first (ADR-039), and cost follows the lot actually picked.
- **Untracked stock.** The pool is the variant, and this is a perpetual
  weighted average.

FIFO was the alternative for untracked stock. It needs each inbound row to
carry a remaining quantity that outbounds decrement, which is a mutable
column on a ledger that is otherwise append-only. Standard costing is
rejected for now: it needs variance accounts to mean anything, and lot
tracking already yields actual cost where cost matters most.

Weighted average is one of the cost formulas the accounting standards permit,
but the method the books use is the accountant's decision: confirm it before
these figures feed financial statements. A method is changed going forward
from a date, never by rewriting history.

**Decision — what each movement is worth.**

- **Receipt against a purchase line.** The line's `unit_price` and
  `currency`, copied as a snapshot, × the day's rate. The line records what
  was agreed and the valuation what it cost; correcting one must never
  rewrite the other. The difference between them is the purchase price
  variance three-way matching will read (ADR-035).
- **Receipt with no price**, whether a hand receipt or an unpriced line.
  Value zero and `needs_cost`, and never blocked: refusing a real delivery
  for want of a financial fact is ADR-032's argument again. Setting the cost
  later posts a correction.
- **Inbound adjustment.** The pool's current unit cost, since found stock
  was bought at the price its pool already carries. For a new pool, zero and
  `needs_cost`. An opening balance is given its cost the same way afterwards.
- **Return.** The unit cost it shipped at, read from the valuation rows of
  that order's shipments for the same pool. The customer returns what they
  were sold, at what it cost when it went.
- **Production output.** Quantity at zero value, marked as awaiting its run.
  The run's cost exists only at close.
- **Every outbound** — shipment, consumption, sample, outbound adjustment,
  return to a supplier — takes the pool's unit cost. A write-off's value is
  therefore recorded at the moment it happens.

**Decision — a batch is valued at close, from what its run consumed.**

1. Close writes the consumption movements. Each takes its lot's unit cost as
   above, so a run's material cost is the sum of its consumption values —
   already stored, no recursion.
2. The unit cost is that sum ÷ `quantity_produced`.
3. For each output lot, close posts a `run_close` row adding unit cost ×
   what is still in the pool.
4. For output that already left before close, it posts a correction against
   each movement that took it, so every unit the run made ends up carrying
   the run's cost.
5. A run that produced nothing records its material cost as a loss on the
   run, with no unit cost.

This is material cost: our stocked components. External lines, labour,
overhead and a co-packer's fee are conversion cost and are deferred. The
screen names the figure accordingly.

Reading a batch's cost afterwards is one sum over the run's rows. Reading a
lot's cost is one pool row. Neither walks a tree.

**Decision — a base currency, and a rate table.**
`organizations.base_currency`, ISO 4217, nullable, set on the organization
settings page. It cannot change once any valuation carries a value or a
rate, since that would re-denominate every stored value. The zero-valued
opening rows do not count; otherwise an organization holding stock could
never set one. Nothing defaults it, for ADR-035's reason.

`exchange_rates (organization_id, currency, rate_date, rate)`, unique on the
first three: how many units of the base one unit of `currency` is worth that
day. It is entered by finance, once per currency per day, at whatever rate
the business uses — often a central bank's published daily rate — not
fetched, since there is no external call in the request path (ADR-005).

A receipt takes the latest rate on or before its day. The applied rate is
copied onto the valuation row, so a rate corrected later changes nothing
already valued. With no rate on file, the receipt is valued at zero with
`needs_cost`, and adding the rate and re-applying it posts the correction.
Gains and losses between that rate and the rate the bill is paid at belong
to payments (ADR-046, deferred).

**Decision — a correction revalues what remains, and records what has gone.**
`PUT /v1/stock/movements/:id/cost` sets `unitPrice`, `currency` and
optionally `exchangeRate` on a receipt or an inbound adjustment. It is
refused with 409 for any other movement, saying where that movement's value
comes from.

It posts one `correction` row: the difference between the new value and the
old. The share for units still in the pool revalues the pool. The share for
units already gone is recorded against the receipt as a cost variance on
issued stock, with quantity zero, outside the pool.

This is what most ERPs do by default. A correction does not flow forward into
batches that already consumed the stock: their cost stays as it was at
close, and the variance says by how much it was wrong. Propagating
corrections through production is Dynamics' "adjust cost" job — open, with
its trigger.

The route is audited as `stock.movement_cost_set`. Rates are set through
their own route, audited as `exchange_rate.set`.

**Decision — incomplete is said, never hidden.** A figure that depends on a
`needs_cost` row still standing, or on an output lot whose run is still open,
is reported as provisional, with the rows that make it so. Each row is a
to-do with a link, the way ADR-035 withheld subtotals rather than sum part
of an order.

**Decision — permissions: `costs.view` and `costs.update`, Owner-only by
default.**

- `costs.view` reads valuations, pool costs, batch costs and rates.
- `costs.update` sets costs and rates.

Receiving needs neither. The row it writes is copied from a price the
receiver can already see on the order, and a movement's valuation is part of
the movement. What the permission protects is what stock and batches cost —
a margin, once price lists exist.

**Performance.** Every stock change gains one pool upsert and, except
transfers, one insert, in the transaction it already has. Reads are single
rows and indexed sums:

- a lot's cost is one pool row;
- a run's cost is its rows via `(organization_id, reference_type,
  reference_id)`;
- stock valuation is one scan of `valuation_pools`, which holds one row per
  lot or untracked variant, not per movement.

Indexes on `stock_valuations`:

- `(organization_id, variant_id, lot_id, created_at desc)` for a pool's
  history;
- `(organization_id, reference_type, reference_id)`;
- a partial index on `needs_cost` for the to-do list;
- unique `(movement_id) where kind = 'movement'`.

The pool lock serialises movements of one lot, or one untracked variant,
across locations. That is a wider lock than `stock_levels` takes, and it is
already the grain ADR-045's per-product advisory lock serialises for
outbound.

**Consequences.**

- Migration 0033: `organizations.base_currency`, `exchange_rates`,
  `valuation_pools`, and `stock_valuations` with checks — a closed `kind`,
  currency format, a positive rate, and `needs_cost` only with zero value.
  It also writes an `opening` row at zero with `needs_cost` for every pool
  that holds stock today. The only deployed database is being recreated, and
  development databases are reseeded, so nothing real is revalued.
- `StockService.recordWithin` writes the pool and the valuation for every
  movement, so the ledger stays the one write path (ADR-023).
- Production close posts `run_close` rows.
- New routes: the cost route, rates, and reads for a lot, a run and stock
  valuation.
- Two permissions and two audit actions.
- Client: a base currency field and a rates page in settings; cost sections
  on the run, lot trace and inventory pages for `costs.view`; the needs-cost
  list.
- That valuations match movements is a cross-table rule, enforced in the
  service and asserted in e2e (ADR-025).

**Deferred.**

- **Propagating corrections** through closed runs.
- **Landed cost** — freight, duty and brokerage allocated onto receipts as
  their own rows, not folded into `unit_price`.
- **Conversion cost** on runs, including ADR-030's manufacturing fee.
- **FIFO** as an alternative method per variant.
- **Period close** — refusing postings dated into a closed month.
- **Export to the books.**
- **Fetching rates**, and realised exchange gains and losses, with payments.

**Amendment (step 2).** Four refinements found while building run close and
corrections; the method is unchanged.

- **A fifth kind, `issued`:** value belonging to units already gone from a
  pool — a cost corrected after part of a receipt was used, or a batch's
  cost arriving after part of it shipped. Recorded against the pool's
  history and never in its balance, so a pool still equals the sum of its
  other rows. Migration 0034.
- **A correction names the valuation it corrects**, not a movement:
  `PUT /v1/costs/valuations/:id`, `reference_type = 'stock_valuation'`,
  audited as `stock_valuation.cost_set`. An opening balance has no movement
  and needs a cost too. All cost routes live under `/v1/costs`.
- **What clears `needs_cost`:** a correction referencing the row, or for
  production output a `run_close` for its run. Nothing edits the flag.
- **Run close posts per output lot**, not per outbound movement: a
  `run_close` row for the share still in the pool and one `issued` row for
  the share already gone — the same split a correction uses.

---

## ADR-049 — Price lists: a default that becomes the line's price

**Context.** Every sale line is priced by hand today (ADR-035), and a sale
cannot be confirmed until each one is (ADR-046). That is correct about where
a price belongs — on the line, agreed per order — and slow and error-prone
about where it comes from: whoever raises the order types 24.99 from memory,
or from a spreadsheet, for every line. Two customers on different terms are
two numbers to remember per SKU. ADR-035 deferred the answer: price lists are
"policy that feeds an order rather than part of one".

Purchases have the same gap from the other side. The supplier's current price
is typed on each purchase line, and since ADR-048 that typed number is what
stock is valued at.

ADR-048 also makes this the point where margin becomes possible: a sale price
and a batch's cost now both exist, which raises what, if anything, should
show the two together.

**Decision — a price list proposes; the line decides.** A list supplies the
*default* price when a line is added. The line stores its own `unit_price`
and `currency` exactly as now (ADR-035), editable until it freezes, and
nothing reads the list again after that. So:

- Changing a list never changes an order, draft or confirmed. The line is
  the agreement; the list is where its first number came from.
- A line priced by hand is as valid as one priced from a list. Nothing
  requires a list, and the confirm checks are unchanged.
- Invoices, credit notes and costs read the line, never the list.

The alternative — orders that re-price from the list until confirmed — makes
a draft's total change under someone who has not touched it, and makes
"why is this line 22.50" depend on when you asked. A snapshot at the moment
the line is added answers that from the line alone, the way ADR-048's
valuation snapshots a purchase price rather than reading through to it.

**Decision — the shape.**

    price_lists       id, organization_id, name, direction ('sale' |
                      'purchase'), currency, is_active, timestamps
    price_list_items  id, organization_id, price_list_id, variant_id,
                      unit_price, timestamps
                      unique (price_list_id, variant_id)

- **One currency per list.** A sale must be single-currency at confirm
  (ADR-046), so a list that mixed them would propose orders that cannot be
  confirmed. A customer billed in USD gets a USD list.
- **A direction per list.** What a customer is charged and what a supplier
  charges are different policies with different owners; one list serving
  both would be edited for one reason and silently change the other.
- **Net of tax.** A list price is the line's `unit_price`, before tax, as
  every line is (ADR-046). Tax comes from the tax code at invoicing.
- **Per variant, one price.** Quantity breaks are deferred (below).
- `unit_price` is `numeric(18,4)`, non-negative, as on lines. Zero is a
  price.
- Retired with `is_active: false`, never deleted, for the reason tax codes
  are not: a line's audit history may name the list its price came from.

**Decision — which list applies.** A partner may name one sale list and one
purchase list (`partners.sale_price_list_id`, `partners.purchase_price_list_id`,
both nullable, each checked to point at a list of the right direction). The
organization may name a default sale list for customers with none
(`organizations.default_sale_price_list_id`). No default purchase list:
supplier prices are specific to the supplier, and a general one would be a
guess dressed as a price.

When a line is added to an order and the request carries no price:

1. The partner's list for the order's direction, if it has one and it is
   active; for a sale, else the organization's default sale list.
2. If that list has the variant, its price and currency are copied onto the
   line.
3. Otherwise the line is added unpriced, as today.

A price in the request always wins, and a request that sends one is never
second-guessed. Samples and zero-priced replacements (ADR-047) never take a
list price: they are priced at zero on purpose.

**Decision — currency conflicts leave the line unpriced, not refused.** On a
sale whose priced lines are already in CAD, a USD list price is not copied:
the line is added unpriced and the response says why. Refusing the line
would block the person for a pricing policy they may not control; copying it
would build an order that cannot be confirmed. Unpriced is the state the
order already knows how to handle — the confirm check names the line.

**Decision — the price is resolved on the server.** The add-line routes
(and order creation, for each line) resolve the default themselves, rather
than the client fetching the list and filling the field. One rule in one
place, and an API caller gets the same price the screen would. The response
says where each price came from (`priceSource: 'list' | 'manual' | null`),
so the screen can show "from Wholesale CAD" and the person can see it is a
default they may change.

Where the line already exists and someone wants the list's price again — a
list corrected after the order was drafted — that is an explicit action on
the line ("Use list price"), not a background refresh.

**Decision — margin is shown only where cost is visible.** A sale line's
margin is its unit price against its item's current unit cost. It is shown
on a sale order to people holding `costs.view` (ADR-048), and nowhere else;
the order's own response stays free of cost, fetched separately as the cost
panels are. It is labelled as against current cost: the batch that ships
may cost something else, and the invoice is where the real figure could one
day be snapshotted. Stock with no lot uses its pool's average; a pool still
waiting for a cost shows margin as provisional.

**Decision — permissions: `price_lists.view`, `price_lists.create`,
`price_lists.update`.** Owner-only by default, as every new permission is.
Reading a list is not needed to use one: the price arrives on the line
through the order routes, which keep their own permissions. So a person who
raises orders gets list prices without being able to browse or change the
lists. Widening view or update to Admin is a deliberate edit when someone
asks.

**Performance.** Adding a line gains two indexed reads: the partner's list
id, and one row from `price_list_items` by `(price_list_id, variant_id)`,
which the unique index serves. A list's page reads its items by
`price_list_id`; a list of a few thousand items needs no paging beyond the
existing keyset pattern if it grows past that.

**Consequences.**

- Migration 0035: `price_lists`, `price_list_items`, three nullable columns
  on `partners` and `organizations`, checks for direction, currency format
  and a non-negative price.
- That a partner's list has the right direction is a cross-table rule,
  enforced in the service and asserted in e2e (ADR-025).
- The order line gains `price_source`, stored, so the history of how a line
  was priced survives the list changing.
- Client:
  - a Price lists page with items;
  - the list pickers on the partner and organization pages;
  - order line dialogs showing where a price came from;
  - a margin column on sale orders for `costs.view`.
- Three permissions and their audit actions.

**Deferred.**

- **Quantity breaks** — a lower price from a quantity up. The line
  snapshots its price when added, so a break would need re-resolving when
  the quantity changes, which is the re-pricing this ADR rejects.
  Trigger: a customer on case pricing.
- **Dated prices** — a new price from 1 January, entered in December. For
  now a change applies from when it is saved, and the audit log keeps what
  it was. Trigger: a price change that has to be prepared before it takes
  effect.
- **Discounts** as a percentage off a list, per customer. A second list is
  the workaround.
- **Margin snapshotted on the invoice**, and margin reporting over a period.
  Needs ADR-048's open decision on period close first.
- **Importing a list from a spreadsheet**, and a supplier's price file.

**Amendment — margin deferred, and derivable either way.** Showing margin to
`costs.view` holders is not built in v0.4. Production systems show two
figures, and both are already derivable here without storing anything new:

- **Estimated margin** on a sale line — its price against the item's current
  pool cost. A decision aid while pricing; it moves as costs move.
- **Actual margin** per shipment or invoice — invoice net revenue against the
  value of the outbound valuation rows for the lots that shipped (ADR-048),
  less credits and plus returns. Exact, and fixed once written, because the
  ledger is append-only; no snapshot is needed.

Both are computed on read, so landed cost, conversion cost or another costing
method (all deferred in ADR-048) reach margin with no change here. Revenue in
another currency converts at the invoice date's rate; with none on file the
margin shows as unconverted rather than guessed. Which to build first is
what the first real week will show.

---

## ADR-050 — Licence status at release (amends ADR-040)

**Context.** ADR-040 made a licence's status derived — in force from a later
day, current, expiring, expired, withdrawn — and the client uses it to keep
unusable licences out of pickers. Nothing on the server reads it. Release
copies whatever licence the recipe carries, so a run can be released under a
licence that expired last month or was withdrawn last week, and nothing on
the run says so. The status is shown only on the Licences page: the recipe,
the release dialog, the run and the lot trace show the number alone.

What should happen is not the same for everyone. An NPN does not expire; an
export certificate or a registration does, and whether work may continue
while a renewal is pending depends on the regime. A business making nothing
regulated has no licence at all. Any one fixed rule is wrong for somebody.

ADR-032 says a real event is recorded, never blocked. Release is not one: it
is the decision to commit material, taken before anything happens, which is
where a check belongs.

**Decision — the server derives the status, by the client's rules.** One
function on the server, agreeing with `licence-status.ts`: withdrawn when
`is_active` is false; not yet in force when `issued_at` is after today;
expired when `expires_at` is before today; otherwise current. Days compare in
UTC, as ADR-040 requires. "Expires in N days" stays a display state; to the
server it is current.

**Decision — a policy per organization, with three outcomes.** For each
state the organization chooses *block* (409), *override* (409 unless an
authorised person confirms with a reason) or *allow*:

- **Withdrawn** — always block, not configurable. Withdrawal is a decision
  somebody made, and an override would undo it without saying so.
- **Not yet in force** — block by default.
- **Expired** — override by default.
- **No licence on the recipe** — allowed, unless the organization turns on
  *licence required*. Off by default, so a business making nothing
  regulated never sees any of this.

Two policy columns and one boolean on `organizations`, changed under
`organizations.update`.

**Decision — checked at release, with the licence row locked.** Release
reads the licence `FOR SHARE` inside its own transaction, after the run
guards and before anything moves. A withdrawal saved at the same moment
either waits for the release or is seen by it, never half of each. The issue
plan returns the licence and its status, so the release dialog can show it
before Release is pressed.

**Decision — an override is a permission, a reason and a record.**
`production.override_licence`, Owner-only by default like every new
permission. The release body may carry `licenceOverride: { reason }`, and a
guard requires the permission only when it is present, as AdjustmentGuard
does for adjustments. Sent when no override is needed — the licence was
renewed between opening the dialog and pressing Release — it is ignored and
nothing is recorded. The run stores:

- `licence_status_at_release` — current, expired, not in force, or none;
- `licence_overridden_by` and `licence_override_reason`.

The reason stays on the run, not in the audit payload (ADR-018). The
release's audit row records that an override happened.

**Decision — the status is shown where it is acted on.**

- **Recipe panel**: a status chip beside the licence, so a lapse is seen
  before a run is planned.
- **Release dialog**: the licence and its status, with either the refusal or
  a reason field for whoever holds the override permission.
- **Run detail and lot trace**: the number as now, plus its status at
  release and any override — *Made under NPN 80012345 (Health Canada),
  expired at release, released by Bob: renewal filed 3 Sept*. The number
  links to the licence.
- **Licences page**: unchanged — the register.

**Consequences.**

- A migration: three columns on `organizations`, three on
  `production_orders`. Runs released before it have no recorded status, and
  read as *not recorded* rather than as current.
- One permission, with its description, in the server's and the client's
  lists in the same commit.
- Server first, with e2e tests for each state under each setting and for an
  override with and without the permission; then the client.
- The server function and `licence-status.ts` must agree. A test on each
  side pins the same dates either side of today.

**Deferred.**

- **A policy per licence type or authority** — an NPN that never expires
  beside an export certificate that does. Trigger: an organization holding
  both kinds.
- **Grace days after expiry.** Trigger: a regime that allows work during a
  renewal, confirmed by whoever owns compliance.
- **The same check at shipment**, for licences that govern sale or export
  rather than manufacture.
- The status enum of #16 and the sixty-day notification of #17.

**Amendment — settled while building.** Four points the decision left
open:

- **A recipe with no licence, when one is required, is refused outright.**
  No override: the two policies cover a licence in a state, and a missing
  licence is not a lapse someone can sign off. An organization that wants
  leniency leaves *licence required* off.
- **The guard asks for the permission whenever `licenceOverride` is sent**,
  before the service knows whether one is needed. Someone without it is
  refused (403) even for a current licence. The client sends an override
  only when the issue plan asks for one and the person holds the
  permission, so "ignored when not needed" applies to those who do.
- **The issue plan's `licenceCheck`** is `{ licence, status, outcome }`: the
  licence or null, its state today (withdrawn included, though never
  stored), and what release would do — `allow`, `override` or `block`. One
  function computes it for the plan and, locked, for release.
- **The audit row** of an overridden release carries
  `{ licenceStatus, licenceOverridden: true }`; a release with no override
  carries nothing new.

Other kinds of licence stay out of this table: site licences (#18) gate
making at a site, wholesale and distribution licences gate shipment (the
check deferred above), and business licences gate nothing and only need a
reminder. One register with a type and what it applies to is the likely
shape when the first of them is built; the status function and the
block / override / allow policy here carry over unchanged.

---

## ADR-051 — Performance: a volume seed, response-time budgets, plan checks

**Context.** Nothing measures how the app behaves with a year of data.
Every test and both seeds work on a handful of rows, where any query is
fast. The places that will slow down are known in kind but not in size:
list pages that sum per row, the ledger reads behind stock and valuation,
choosing lots earliest-expiry first across many lots, and the tenant
filter on every table of a shared database. Optimizing before measuring
trades readability for guesses.

**Decision — a volume seed, separate from the demo.** `npm run
seed:volume -- --scale small|large` writes several organizations of
similar size. Small, minutes to run: about 500 products, 5,000 orders,
50,000 stock movements, 2,000 lots and 2,000 invoices per organization.
Large: about ten times that, for a local overnight run. Through the same
services the API calls, as `seed:demo` is, so stock levels, valuations and
the ledger always agree; a bulk-SQL path is added only if the services
prove too slow to seed with. It refuses a production database, as
`seed:demo` does, and is never part of `seed`.

**Decision — budgets per endpoint, measured over HTTP.** `npm run perf`
drives a running server with a small load runner written on Node's own
`fetch`: no new dependency, and the numbers it reports (median, 95th and
99th percentile, errors) are the ones the budgets need. Budgets, at 10
connections, against the small scale:

- Reads under 300 ms at the 95th percentile: the order, inventory,
  movement and invoice lists, an order's detail, lot trace.
- Writes under 500 ms at the 95th percentile: shipping (lots chosen
  earliest-expiry first), receiving, issuing an invoice, issuing a credit.
- Concurrency: shipments of one product from several connections at once
  finish without a deadlock, and stock adds up afterwards.

**Decision — a stress run that reports, not fails.** The same endpoints
at 100 connections, to find where response time starts climbing. Ten
connections with no pause between requests is already more load than
dozens of people clicking; 100 shows the headroom. Its result is a number
to watch between runs, not a gate.

**Decision — query plans checked.** A script runs `EXPLAIN` on the main
list and ledger queries against the volume seed and fails on a sequential
scan of a large table: a missing index shows up here before anyone feels
it.

**Decision — where it runs.** Locally, and in CI as a manually triggered
job, never on every PR: it needs minutes of seeding, and timing on shared
runners is too noisy to block a merge. Each run writes a short report, so
runs can be compared.

**Consequences.**

- Three commits after this one: the volume seed, the load runner with its
  budgets, the plan check. Then a CI job to run them on demand.
- Budgets and volumes are starting points. They follow the customers the
  app is sold to; a manufacturer with a few hundred orders a month sits
  well inside the small scale.

**Deferred.**

- **A dedicated load tool** (k6, autocannon) for scripted user journeys,
  ramps and soak tests. Trigger: a scenario the small runner cannot
  express.
- **Production monitoring** of response times. Trigger: the first
  customer in production.
- **Optimizations themselves.** Only where a budget or a plan check fails.

**Results (2 October 2026).** Measured locally: a MacBook (ARM64), Postgres
18 in Docker, the server built and run with `NODE_ENV=test`. Five
organizations, seed 51. Per organization, small is 5,000 orders, 2,051 lots
and 40,471 stock movements; large is 49,999, 20,410 and 410,277. Figures
are p95 at 10 connections unless marked.

|                                         | Small before | Small after | Large before | Large after |
|-----------------------------------------|--------------|-------------|--------------|-------------|
| `GET /stock`                            | 67 ms        | 17 ms       | **520 ms**   | 79 ms       |
| `GET /stock` at 100 connections         | 515 ms       | 149 ms      | 4.5 s        | 581 ms      |
| `GET /stock/availability`               | 27 ms        | 26 ms       | 293 ms       | 200 ms      |
| `GET /stock/availability?promised=true` | —            | 25 ms       | —            | 196 ms      |
| Valuation query (plan check)            | 57 ms        | 5 ms        | 497 ms       | 40 ms       |
| Plan check                              | 3 failures   | passed      | 7 failures   | passed      |

Orders, an order, the movement lists, invoices, lot trace and the four
writes were flat from small to large (about 1×) before any change: they
read a page through an index. The concurrency check passed every run.

What was changed, each because a budget, a plan or the growth column said
so:

- **Holds carry the organization on the join to orders.** Without it the
  hold calculation read every tenant's confirmed sales (250,223 orders at
  large) to join one tenant's open lines.
- **The stock list is a keyset page** of 50, ordered by location name, SKU,
  lot code and id, with a search on SKU, product name and lot code, and the
  organization on every joined table. The Inventory page loads more.
- **Availability can be asked for promised products only**, which is all
  the Inventory page shows.
- **A valuation marks provisional pools in one join** instead of a subquery
  per pool. Its whole-organization reads are allowed in the plan check,
  with that reason.
- **Open order lines have their own partial index** (`order_lines_open_idx`,
  migration 0036), on the same predicate the hold calculation filters on.
  The plan check passed without it, since reading all of history through
  an index is not a sequential scan; the growth column caught it. Keep the
  two predicates identical, or Postgres stops using the index.

**Re-run after ADR-054 (6 October 2026).** Small scale, five
organizations, seed 51, on `seed:volume` with customers whose documents
print in French and English or in Chinese, and finished goods named in
French or Chinese. Issuing an invoice, which now looks up product and
variant names in the customer's languages: 25 ms p95 at 10 connections
(budget 500 ms), 251 ms at 100, in line with the run above. Every
budget passed with no errors, the concurrency check passed, and the
plan check found no new sequential scan; it has no probe for issuing,
so the timing is the evidence for the name lookup.

**Watch, each with its trigger.**

- **`GET /stock` sorts by names**, which no single index serves, so each
  page sorts the organization's matching rows: 4.6× from small to large, a
  36 ms query at large. Trigger: p95 over budget at small scale, or the
  plan check flags it. Then order by an indexed key and lead with the
  location filter.
- **Availability** still grows 7.9×: a 66 ms query at large, now bounded by
  stock on hand and open demand rather than history. Trigger: p95 over
  budget at small scale. First step then: in the promised list, sum supply
  only for products with open demand.
- **Movements for one shelf** went from 2 ms to 21 ms. No screen in the
  budgets reads it yet. Trigger: it joins the budgets, or passes 100 ms.
  Then indexes on the source and destination location with the id.
- **Lot search** reads the organization's lots, as recorded at ADR-044.
  Trigger: lots in the millions. Then pg_trgm.
- **Valuation** reads every pool by definition. Trigger: an organization
  whose valuation no longer fits a screen. Then an export.
- **Migrations on large live tables.** 0036 builds its index inside the
  migration's transaction, which blocks writes to `order_lines` briefly:
  fine at today's sizes. On a production table with millions of rows and
  traffic, use `CREATE INDEX CONCURRENTLY`, outside a transaction.

**Production, beyond these measurements.** Not done; each waits for its
trigger.

| What                              | When                                                                                                                                                                                                                          | Cost                                                  |
|-----------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------|
| Response compression              | **Done, by Render.** Its edge (Cloudflare) answers API responses with `content-encoding: br`, checked on 2 October 2026 in the browser's Network tab. Nothing to add to the app; check again if the hosting changes.          | None.                                                 |
| Measure where it runs             | The Performance workflow ran on main on 2 October 2026 at small scale and passed; its plan check matched the local run within a few milliseconds. A staging copy on Render still waits for the first paying customer or v1.0. | CI is free; staging is a second service and database. |
| `pg_stat_statements`              | From the first day real people use Render: it records only from when it is on. Check the Render plan allows it.                                                                                                               | Near zero.                                            |
| Configurable pool, then PgBouncer | Configurable with a second server instance, or when production shows requests waiting for a connection. PgBouncer when instances × pool size nears the database's connection limit.                                           | Small, then a service to run.                         |
| Caching                           | Only when a read is still over budget once bounded and indexed, or the same answer goes to many users.                                                                                                                        | Ongoing: stale data is its own class of bug.          |

**When to run perf.** The Performance workflow once after this merges;
before every release (MC-1201 to MC-1204 in `docs/manual-checks.md`); and
after any change to a list, a ledger query or an index. Small and large
each in a database of their own, as `server/perf/README.md` describes.

*Amended (CI speed-up, October 2026):* the workflow runs itself. A small
run took 23 minutes: 12 seeding the volume, 10 for the budgets and the
stress pass, 9 seconds for the plan check, which caught both real problems
so far (the stock list's tenant joins, then Home's ledger scan). So the plan
check now runs on every pull request that changes the server's code, as a
gate: unlike timings on a shared runner it is deterministic. It loads the
last small volume seeded on `main` from the Actions cache, keyed on the
seed's own code, and migrates it forward, as production data is. The
budgets run by hand on a branch; the full run, stress included, weekly on
`main` and on each release candidate tag, so before every release. Timed
runs always seed fresh, so their numbers stay comparable.

---

## ADR-052 — Calendar days are `date`, sent as YYYY-MM-DD (amends ADR-040)

**Context.** Four columns hold a day somebody picked, not a moment:

- a lot's expiry, `lots.expires_at`;
- an order's expected delivery, `orders.expected_at`;
- a licence's dates, `product_licences.issued_at` and `expires_at`.

All four are `timestamptz`. A day is not an instant, so each needs a
convention to survive the trip. The client writes UTC midnight
(`utcMidnight`) and reads it back in UTC (`formatDay`). The server compares
licence dates as UTC days (ADR-040, ADR-050). Each piece is correct, and
each arrived after a bug: a lot expiring 10 Oct showed as 9 Oct in
Vancouver, and five forms sent the bare day, which Postgres stores at
midnight in the session's time zone. Every new form, query and reader has to
remember the convention, and forgetting it fails only away from Greenwich —
never in a test that runs in UTC.

Invoices, credit notes and exchange rates have used `date` since ADR-046 and
ADR-048 and need none of this. One more place depends on a time zone without
saying so: a receipt costed as it arrives looks up its rate on or before
`current_date`, the database session's day, because a movement has no day of
its own (#20).

**Decision — `date` for every calendar day.** The four columns become
`date`. Drizzle declares them `date(..., { mode: 'string' })`, as invoices
do, so a day is a `'YYYY-MM-DD'` string from the column to the screen and
never passes through a JS `Date`.

Moments stay `timestamptz`: `lots.received_at`, every `*_at` stamp on a
document, `created_at` and `updated_at`. The test is how a person would
write it. If it is written without a time — on a box, on a licence, in a
supplier's promise — it is a `date`.

**Decision — converted at UTC, in one migration.** 0038 changes each
column's type `USING (column AT TIME ZONE 'UTC')::date`. The zone is
explicit because a plain cast uses the session's time zone, which is the
dependency this ADR removes.

- Values written since `utcMidnight` are UTC midnight, and convert to the
  day that was picked.
- Anything else converts to its UTC day. That is the day `formatDay` has
  been showing, so no screen changes.
- Both licence columns change in one statement. Postgres rebuilds the
  ordering check and the partial expiry index in the same step.
- One-way. The only thing lost is a time of day nobody meant to record.

The change rewrites each table under an exclusive lock, which takes
milliseconds at today's sizes. On a large live table the production
procedure is expand and contract instead: add the `date` column, backfill it
in batches, write both, switch the reads, then drop the old one. ADR-051
makes the same point about building indexes.

**Decision — one format on the wire, `YYYY-MM-DD`.** ISO 8601's calendar
date: what ERP and accounting APIs use for a day, and what
`<input type="date">` gives. Responses return the day as stored. Requests
are checked by `IsCalendarDay()`, which invoices already use: the shape
first, then a real date, so 2026-02-30 is a 400 rather than a 500.

The format is the same for every organization and every industry. What a
day *means* is what differs between them (see Deferred), and keeping the
format fixed is what lets those meanings change without touching the API or
the columns again.

**Decision — how strict is a deployment setting.** `CALENDAR_DAY_INPUT` in
`.env`:

- **`strict`**, the default: only `YYYY-MM-DD`.
- **`lenient`**: also an instant at exactly UTC midnight (`…T00:00:00Z`,
  with or without milliseconds), the shape the client sent before this ADR.
  It is stored as its day, and a warning names the route and the field, so
  whoever runs the deployment can see when nothing sends it any more and
  switch to strict.

Any other instant is refused in either mode. Turning 07:00Z into a day means
choosing a time zone, which is the guess this ADR removes.

Lenient is for a transition — a browser tab still holding the old client
after a deploy — and for a deployment fed by an integration that sends
instants. Render runs strict: nothing outside the app calls it yet. The
pattern is the usual one for changing an API contract: accept the old shape
for a while, log every use, refuse it once the log is quiet.

**Decision — a `date` is read as a string everywhere.** node-postgres turns a
`date` into a JS `Date` at the server process's local midnight. In
Vancouver that serialises as 07:00Z, so a raw query on a developer's machine
would disagree with Drizzle, and with Render, which runs in UTC. One type
parser for `date` (OID 1082), registered in `database.module.ts` where the
pool is created, returns the text untouched for every query, Drizzle or raw.
Raw reads type the value as `string | null`. One registration rather than a
cast in each query, so a raw read written next year cannot forget it.

**Decision — "today" on the server is one function.** It returns the UTC day
as `YYYY-MM-DD`. Licence status at release (ADR-050) and the rate looked up
when a receipt is costed both ask it, instead of `new Date()` in one place
and `current_date` in the other. Two such strings compare as days, so
neither needs a `Date`. The rate lookup stops depending on how the database
session is configured. When an organization gets its own time zone, this
one function changes.

**Decision — the audit log reads both shapes.** Rows written before 0038
hold instants for these fields; rows after hold days. Neither is rewritten:
ADR-038 does not backfill history. The audit log reads a bare `YYYY-MM-DD`
as a day whatever its key, and keeps reading the old instants of the known
calendar-day fields in UTC.

**Consequences.**

- `utcMidnight` and its tests go. Nine forms send the date input's value as
  typed and prefill from the value as it arrives, without `.slice(0, 10)`.
  `formatDay` keeps formatting in UTC, which reads a bare day exactly.
- The client and the server must agree on the format, so they deploy from
  the same merge. An old bundle reads the new values correctly; under
  strict, its writes are refused until the page reloads.
- Server first, with e2e tests:
  - every route that writes one of these days returns it exactly as sent;
  - an instant is refused under strict;
  - under lenient, an instant at UTC midnight is stored as its day, and any
      other instant is still refused;
  - a schema test asserts every calendar-day column, the older `date` ones
      included, is `date`, so a future `timestamptz` day fails the suite.
- The server's licence-status unit test and the client's keep pinning the
  same days either side of today, now as strings.
- Manual checks: the day picked is the day shown on every screen, the audit
  log included, wherever the browser is.

**Deferred — what a day means.** None of these changes the column or the
format. Each is a rule or a setting on top, and each waits for its trigger.

- **An organization's time zone for "today".** Licence status, the rate at
  receipt, and any day the server fills in itself use the UTC day, so a
  receipt at 5pm in Vancouver reads tomorrow's rate if one was entered
  early. The likely shape is a time zone on `organizations` read by the one
  function above. A receipt day the person enters, as an invoice date is
  entered, is the alternative. Trigger: users in two time zones, or the
  first day decided wrongly near midnight.
- **Expiry inclusive or exclusive.** The printed day is the last usable day
  ("use by"), for lots and licences alike. Some regimes read it as the
  first day the product may not be used. Trigger: a customer or a regulator
  who reads it the other way.
- **Month-precision expiry.** Labels often print `EXP 06/2027`, and GS1
  barcodes encode the end of a month as day `00`. Stored as the last day of
  the month; a precision flag only if it must print as the label did.
  Trigger: receiving by barcode, or printing an expiry on our own documents.
- **Minimum remaining shelf life at shipment** — a retailer refusing stock
  with less than six months left. A rule on earliest-expiry-first picking
  (ADR-041), per customer or per organization. Trigger: the first customer
  who asks.

**Amendment — settled while building.** Three points:

- **No type parser.** Drizzle 0.45's node-postgres driver already returns
  `date` and `timestamptz` as text for every query that goes through it,
  `tx.execute` included, so registering one would duplicate it. The raw
  reads that typed a lot's expiry as `Date` were in fact returning text
  such as `2026-10-10 00:00:00+00`; they now return `2026-10-10` and are
  typed `string | null`. What holds the guarantee is a test, not a
  registration: `calendar-days.e2e-spec.ts` reads one expiry through
  Drizzle, lot search and the lot trace, and expects the same text from all
  three. A driver change that broke it would fail there.
- **One switch for every calendar day.** `CALENDAR_DAY_INPUT` applies
  wherever `IsCalendarDay()` does, so invoice, due, credit and rate dates
  follow it too. Their client already sends `YYYY-MM-DD`, so nothing
  changes for them.
- **The warning names the field.** A decorator cannot see the route; the
  line is logged inside the request, so the request's log context carries
  it.

---

## ADR-053 — Backups: an encrypted nightly dump we own, at another provider, restored monthly

**Context.** Nothing in the repo says how the database is backed up or how
it is brought back. Production runs on Render, and a free Render database
may have no backups at all and expires 30 days after creation. Every
organization's data lives in one Postgres database, so one backup holds
all of them. Bob may move hosts later, so the plan cannot rest on one
host's features. No customer has asked for a country or a retention period
yet; the database is megabytes.

Three layers exist in production practice: the host's point-in-time
recovery (rewind to any minute), a logical dump the team owns (`pg_dump`,
stored elsewhere), and physical backups with WAL archiving (pgBackRest,
WAL-G) for self-hosted or very large databases. The rule over all of them
is 3-2-1-1-0: three copies, two kinds of storage, one off-site, one
immutable, zero errors when a restore is tested.

**Decision — targets first.** What the plan has to meet, stated as numbers
so a choice can be checked against them:

| Phase | When                    | RPO (data that may be lost) | RTO (time to be running again) |
|-------|-------------------------|-----------------------------|--------------------------------|
| 1     | This ADR's scripts      | 24 hours                    | 4 hours                        |
| 2     | Before paying customers | 15 minutes                  | 4 hours                        |

Phase 1 is met by the nightly dump alone. Phase 2 needs the host's
point-in-time recovery, which is a plan choice at the host, not code.

**Decision — our own nightly dump is the backup that counts.** `pg_dump`
in custom format (`-Fc`, zstd), once a night at 10:00 UTC (3am in
Vancouver, 6am in Toronto), the quietest hour. It reads a consistent
snapshot and does not block the app. It works against any Postgres, so it
survives a change of host, the host failing, and the account being locked;
and restoring it somewhere new is exactly how a move between hosts is done.

- Run by a scheduled GitHub Actions workflow, not by the host: if the host
  disappears, the job and its history do not. The same script runs in a
  container anywhere, for the day it moves.
- Logged in as a dedicated read-only role, `backup`, not the app's own
  login, so the backup job cannot change data.
- The `pg_dump` client's major version matches the server's (18). An older
  client refuses a newer server.

**Decision — encrypted before it leaves, with `age`.** Each dump is
encrypted on the runner with an `age` public key before upload. The public
key can only lock, so a stolen backup job cannot read any backup. The
private key never touches the job: one copy in Bob's password manager, one
offline (printed, kept safe). Losing both makes every backup unreadable,
which is why there are two.

Encryption is one step of the script with one input, the recipient key.
A KMS or hardware key, if a contract ever demands one, replaces that step
and nothing else.

The bucket's own encryption is on as well, as a second lock; it is not
relied on alone, because the provider holds that key.

**Decision — stored at a different provider, in Canada, immutable.**

- An S3-compatible bucket at a provider other than the database host.
  Every major object store speaks the S3 API (AWS S3, Backblaze B2,
  Cloudflare R2), so switching provider is changing the endpoint.
- In a Canadian region. Choosing a region costs nothing at creation and
  moving years of backups later does; Canadian customers in regulated
  industries ask where their data is kept, backups included.
- Versioning and object lock on, set when the bucket is created, because
  some providers only allow it then. Each backup is locked for 30 days:
  nobody can delete or overwrite it in that time, Bob included, which is
  what survives ransomware or a stolen password.
- The job's credentials can write but not delete. Expiry is the bucket's
  lifecycle rule, not the job's.
- Retention: 30 daily and 12 monthly (the first backup of each month is
  kept for a year). A setting, so a contract's seven years is one number.
- Each upload is named by environment and time,
  `production/2026/10/03/20261003T100000Z.dump.age`, with a SHA-256
  checksum beside it, so a restore can prove what it downloaded is what was
  written.

**Decision — every location is a setting.** Nothing about the host, the
bucket or the region is in code:

| Variable                                                  | Holds                                               |
|-----------------------------------------------------------|-----------------------------------------------------|
| `BACKUP_DATABASE_URL`                                     | The `backup` role's connection string, TLS required |
| `BACKUP_S3_ENDPOINT`, `BACKUP_S3_REGION`, `BACKUP_BUCKET` | Where backups go                                    |
| `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`  | Write-only credentials                              |
| `BACKUP_AGE_RECIPIENT`                                    | The public key backups are encrypted to             |
| `BACKUP_ENVIRONMENT`                                      | `production`, the first segment of every name       |

Held as GitHub Actions secrets. Moving region or provider: a new bucket,
new values, and the next night's backup lands there; the old bucket's
backups expire on their own or are copied if a contract says so.

**Decision — restores are rehearsed, timed and written down.** A backup
nobody has restored is a hope.

- A runbook, `docs/runbooks/restore.md`: the exact commands, in order, for
  a person under pressure.
- A monthly restore drill, a second scheduled workflow: download the
  latest backup, check its checksum, decrypt it, `pg_restore` into a
  throwaway Postgres 18 on the runner, then check that the tables exist,
  row counts are plausible, the newest audit row is less than a day old,
  and the migrations table matches the code. It records how long it took —
  the real RTO — and fails loudly if any step does. The drill needs the
  private key, so it runs from a separate secret only that workflow reads.
- Three kinds of restore, each in the runbook:
  - **The host is gone:** a new database anywhere, restore the latest
      dump, point `DATABASE_URL` at it, start the app.
  - **A bad deploy or a bad delete:** the host's point-in-time recovery to
      the minute before (phase 2).
  - **One organization's mistake:** restore into a scratch database and
      copy back that organization's rows only. Never the whole database:
      that would erase every other organization's work since the backup.
      Every table carries `organization_id`, which is what makes one
      tenant's rows selectable.

**Decision — a missing backup is noticed within a day.** A failed workflow
emails Bob. A daily check fails if the newest backup is more than 26 hours
old, which also covers GitHub pausing scheduled workflows after 60 days
without activity in the repository. A backup whose size moves more than
50% from the previous one is flagged: a bug or lost data shows up there
first.

**Decision — the host's own backups are a plan choice, recorded per
host.** Today's host is Render. Phase 0 is checking what its plan backs up
now; phase 2 requires a plan with point-in-time recovery. A different host
needs the same: point-in-time recovery for RPO in minutes, and nothing in
this ADR changes when it does.

**Consequences.**

- Built in this order, each its own commit:
    1. Phase 0, by hand this week: check Render's plan, create the bucket
       (Canada, versioning, object lock), create the `age` key pair and
       store the private key twice, take one manual encrypted dump.
    2. The `backup` role. Not a migration: a role belongs to the Postgres
       server rather than the database, and is created once per host, so
       the runbook gives the SQL.
    3. `scripts/backup.sh` and `scripts/restore.sh`, plain shell over
       `pg_dump`, `age` and an S3 client, so they run anywhere.
    4. `.github/workflows/backup.yml` (nightly, plus the 26-hour check) and
       `.github/workflows/restore-drill.yml` (monthly).
    5. `docs/runbooks/restore.md`, and a manual check that walks it.
- Backups hold personal data. Someone deleted from the app stays in
  backups until they expire, at most a year under the monthly rule. That is
  normal under PIPEDA when disclosed: the privacy policy states the
  retention.
- Cost at today's size: cents a month for storage. Egress matters only
  when restoring large databases; Cloudflare R2 charges none.
- The dump takes seconds today. Logical dumps stay practical to roughly
  50–100 GB; past that, Deferred below.

**Deferred — each with what brings it in.**

- **Regional deployments.** One database means one backup region. A
  customer who needs its data in another country gets a separate
  deployment there — the same code with its own database, backups and
  settings — and each organization belongs to one region. Moving an
  existing organization is an export and import of its rows, its own ADR.
  Trigger: the first customer whose contract names another country.
- **A KMS or hardware key** in place of `age`. Trigger: a contract or an
  audit (SOC 2) that requires key use to be logged.
- **A standby database** (high availability). Backups bring data back in
  hours; a standby keeps the app running in seconds. Trigger: downtime
  costing more than the standby.
- **Physical backups** (pgBackRest or WAL-G), or dumping from a read
  replica. Trigger: the database past about 50 GB, or a self-hosted
  Postgres.
- **Longer retention.** Trigger: a regulation or contract (often seven
  years in finance and health).
- **Two people to restore or to use the key.** Trigger: a team larger than
  one, or an audit.

**Amendment — settled while building.**

- **A test destination before the bucket.** `BACKUP_DESTINATION` takes
  `artifact` as well as `s3`: the encrypted dump is kept as a GitHub Actions
  artifact for 30 days. It proves every step except object lock while the
  database is a Free test instance, at no cost and with no account. The
  repository is public, so anyone signed in to GitHub can download one;
  encrypted, it shows only its size and time. Real customers' data needs
  `s3`, which is the variable and its secrets, not a code change.
- **Freshness from the backup's name, not the audit log.** Production's
  audit log was empty at the first manual restore, so "the newest audit row
  is under a day old" would fail a quiet database. Every backup's name
  carries the moment it was taken (`production-20261003T100000Z`); the
  26-hour check and the drill read that. The drill checks instead that
  organizations came back and that the migrations table is not ahead
  of the code.
- **The Postgres 18 client, not a container.** The scripts call
  `pg_dump` and `pg_restore` directly and refuse an older major version.
  Actions installs the 18 client from the Postgres project's apt
  repository; a Mac uses Homebrew's `libpq`. The first manual backup used a
  container, which works, but a container reaching `localhost` differs
  between Linux and macOS.
- **The drill reads with its own login.** In `s3`, the backup job can write
  and list but not read; the drill can read and list but not write. A
  stolen backup login cannot download backups, and a stolen drill login
  cannot plant one.
- **Size against the previous backup** is compared in `local` and `s3`. As
  an artifact each run starts empty, so the comparison is skipped there.

**Amendment — the bucket is Cloudflare R2.** Bob chose R2 for backups, and
for the app's files when they come (in their own bucket, with their own
keys). R2 speaks the S3 API, so the scripts are unchanged: the endpoint is
`https://<account id>.r2.cloudflarestorage.com` and the region `auto`. It
has no egress fees, which matters most on the day a large restore is
needed. Where it differs from the decision above, and what stands in:

- **Not in a Canadian region.** R2 offers location hints, not Canada; the
  bucket is created with the hint *Eastern North America*. The backups are
  encrypted before upload (`age`), so the provider holds ciphertext.
  Trigger to move: a customer or regulation that requires Canadian
  residency for backups. Moving is the paragraph above: a bucket in AWS
  `ca-central-1`, new values, and the old bucket's backups expire.
- **No object versioning; a bucket lock instead.** A lock rule on the
  backups' prefix keeps every object for 30 days: it cannot be deleted or
  overwritten in that time, which is what versioning and object lock were
  for. Uploads never reuse a name, so there is nothing to version.
- **No write-only key.** R2's narrowest key that can write can also read
  and list. The backup job's key is *Object Read & Write* on the backups
  bucket alone; what it can read is ciphertext, and what it could delete
  the lock keeps. The drill's key is *Object Read only*, so a stolen drill
  login still cannot plant a backup.
- **Retention is two lifecycle rules:** `production/daily/` deleted after
  31 days, `production/monthly/` after 366, each after the lock lets go.
- **An alarm outside GitHub.** GitHub stops running a repository's
  scheduled workflows after 60 days without activity in it, and the
  26-hour check and the monthly drill are scheduled workflows, so they stop
  with the backup and nothing fails. After each backup the job calls
  `BACKUP_HEALTHCHECK_URL`, a check at a monitor outside GitHub
  (healthchecks.io's free plan) that emails when a day passes without a
  call. Unset, the step is skipped.

---

## ADR-054 — Languages: the person's language for the app, the customer's for documents

**Context.** Everything the app says is in English, from three places that
change in different ways.

- **The client's copy.** About 130 components hard-code their labels. Dates
  and money go through Intl with no locale (`format.ts`, `audit-format.ts`,
  `licence-status.ts`, two `toLocaleString` calls), so the browser picks the
  format and nobody picks the language.
- **The server's words.** About 270 refusals are sentences built around
  names (`refusal()` in `licence-check.ts`), shown as sent by `messageFor`.
  class-validator writes its own English, and so do the custom DTO rules.
  Emails (verification, reset, ADR-037's security mails) and notifications
  are written in English when they are sent.
- **Printed documents.** The packing slip, invoice and credit note are
  rendered by the client from stored data (ADR-041, ADR-046). Their
  language belongs to the customer who receives them, not to whoever
  presses Print.

Two needs bring this in now: staff who read Chinese rather than English,
and selling into Quebec, where the app and the documents a customer
receives are expected in French. Quebec's Charter of the French Language
(as amended in 2022) is generally read as requiring commercial documents
such as invoices in French, with other languages allowed beside it. The
open decision this replaces said to confirm the requirement with an
advisor. That still holds for the two details that depend on it, bilingual
documents and product names. Both are built here as options an
organization turns on, so the answer only decides how they are set. A
brand name or trademark generally stays as it is; what the advisor
settles is whether a Quebec customer's invoice must describe each item in
French. Until then no French product name is entered, and adding them
later is data, not a change to the schema.

Not everything on a screen is the app's to translate. A partner's name, a
note, a reason and an address are data someone typed, and they read the
same in every language. A product's name and description are data too,
but an organization selling to Chinese-reading customers keeps them in
Chinese as well as English, on screen and on the customer's documents.

**Decision — three languages, English the fallback.** `en`, `fr-CA` and
`zh-Hans` (Simplified Chinese), as BCP 47 tags. English is the source the
other catalogues are translated from and what anything missing falls back
to; its spelling stays British, as now. One `SUPPORTED_LOCALES` constant on
each side (`server/src/common/locales.ts`, `client/src/lib/locales.ts`),
and the DTOs accept only those.

The columns below are `text` without a CHECK, unlike the licence policies.
A value only arrives through those DTOs or is copied from one that did, so
adding a language is a catalogue and a constant rather than a migration,
and a value no longer offered falls back to English instead of failing.

**Decision — two settings, independent of each other.** *The person's
language* is what the app speaks to them: screens, refusals, their emails
and notifications. *The document language* is what a customer's paper is
printed in. A clerk who reads Chinese prints an English invoice for an
Ontario customer; one who reads only English prints a French one for a
Quebec customer. Tying the two would make one of them wrong.

**Decision — the person's language is on the user; null means the
browser's.**

- `users.locale` (`text`, nullable). Null follows the browser:
  `navigator.languages` matched against the supported list, else English.
  Chosen from the account menu, beside the colour mode (ADR-021), and on
  the Account page, through `PATCH /v1/account/profile`, which already
  changes the name and records `account.profile_updated`. Returned by
  `/v1/auth/me`.
- Kept on the server, not in localStorage as the colour mode is, for two
  reasons: it follows the person to another device, and emails and
  notifications are written where there is no browser to ask.
- Signed out (sign in, register, forgot and reset password), the pages
  offer the same picker and keep the choice in localStorage. Registration
  sends it, so the verification email arrives in the language the person
  registered in. Choosing while signed in writes both, so signing out does
  not switch the language back.
- No permission: acting on yourself is not a capability someone grants
  (the account routes' rule).

**Decision — the client: FormatJS (react-intl), ICU messages, explicit
ids.**

- ICU MessageFormat, because plural rules differ in each language: French
  treats 0 and 1 as singular, Chinese has no plural, English has two
  forms. The message states it, rather than an `if` in the component.
  Underneath is Intl, which `format.ts` already uses.
- Each message has an explicit id named by its feature folder
  (`orders.receive.title`) and its English as `defaultMessage` beside it,
  so the component still reads in English and an English copy edit does
  not orphan its translations.
- `formatjs extract` writes `client/src/locales/en.json` from the source.
  `npm run i18n:check`, run in CI, fails when `en.json` is stale, when
  `fr-CA.json` or `zh-Hans.json` lacks a key or keeps one that is gone, or
  when a translation's placeholders differ from the English (`{name}`
  dropped or renamed).
- Catalogues are compiled at build (`formatjs compile --ast`), so the
  browser never parses ICU and the parser stays out of the bundle. English
  ships with the app; French and Chinese are separate chunks fetched when
  chosen, so an English reader downloads nothing extra.
- A message missing from a catalogue shows its English and warns in
  development. A raw id never reaches a screen.
- `eslint-plugin-formatjs` refuses a literal string in JSX. It is switched
  on one feature folder at a time as each is converted, and everywhere at
  the end.
- Vitest renders in English through one provider in `src/test/`, so
  `getByRole(…, { name })` lookups do not change.

**Decision — the rest of the page follows the language.**

- `<html lang>` is the current language: screen readers pronounce by it,
  and browsers choose Chinese glyph forms by it.
- MUI's own words (pagination, "No options", "Close") come from its locale
  packs (`frFR`, `zhCN`), set on the theme with the language.
- `system-ui` already falls back to the system's Chinese fonts, so no web
  font is added.
- `format.ts` and the other Intl call sites take the current language
  instead of `undefined`. A print page passes the document's.
- Calendar-day inputs stay native `<input type="date">`: the browser shows
  them in its own format, and the value is `YYYY-MM-DD` in every language
  (ADR-052).

**Decision — quantities stay strings, in every language.** ADR-025 holds: a
quantity never becomes a JavaScript number. On screen, `formatQuantity`
swaps the decimal point for the language's separator on the string itself
(`35,0000` in French); digits and trailing zeros stay as they arrived, so
English reads exactly as today. A quantity or price field accepts the
language's decimal separator, refuses a grouping separator with a message
rather than guessing what it meant, and sends a point: the API's format
does not change. Money keeps `formatMoney` (ADR-035), now in the chosen
language.

**Decision — the server translates at the edge, in the exception filter.**

- Services throw a message id and its values instead of a finished
  sentence: `new ConflictException(t('production.licenceExpired', { licence,
  day }))`. `AllExceptionsFilter`, which already gives every error one
  shape, renders it in the request's language. Services stay singletons
  with no request-scoped state, and a rule's wording stays beside the rule.
- The request's language is its `Accept-Language` header, matched against
  the supported list, else English. `api()` sends the current language on
  every request; fetch may set the header, and it is CORS-safelisted. A
  screen and its refusals then always agree, signed in or out.
- No header (curl, an integration, the server e2e suite) means English,
  word for word as today. The e2e suite's message assertions are the proof
  that moving a message changed nothing.
- Days in messages stay `YYYY-MM-DD`, as `refusal()` already notes: they
  read the same in every language and are what was entered. Names are data
  and go in as they are.
- Validation: the `ValidationPipe`'s `exceptionFactory` turns each failed
  constraint into a message id (`validation.isNotEmpty`,
  `validation.maxLength`), with the field's API name left as it is. The
  screens check before sending, so a person seldom sees these, and an
  integrator reads the field names the API uses. The custom rules
  (`IsCalendarDay`, `IsCurrencyCode`, the decimal rules) get ids the same
  way, and a DTO still never restates a rule's message.
- FormatJS on the server too (`@formatjs/intl`), so plural rules and
  placeholders work the same on both sides. The server's catalogues are its
  own, `server/src/i18n/<locale>.json`: the two packages share no files
  (separate `package.json`, no workspaces) and their words barely overlap.
  The same `i18n:check` runs on them.

**Decision — written without a request, in the recipient's language.**
Emails and notifications are written where there is no browser to ask, so
they use the recipient's `users.locale`; when that is null, the language
of the request that caused them (a sign-in, a reset request), else
English. A notification has one recipient per row (ADR-036), so it is
written once, in that person's language, and stored as now: rendering
stays the writer's job. Changing language later does not rewrite old
notifications, as it does not rewrite emails already sent.

**Decision — a document prints in one language or two: the partner's
choice, else the organization's, stored on the document.**

- Any supported language can be a document's, Chinese included, and a
  document may carry a second one: French with English beside it for a
  Quebec customer, Chinese with English, or English alone.
- `organizations.document_language` (`text`, not null, default `en`) and
  `organizations.document_second_language` (`text`, nullable), on the
  Organization settings page; `partners.document_language` and
  `partners.document_second_language` (both nullable), on the partner form.
- A partner sets a whole pair or nothing: with its first language null it
  takes the organization's pair, never half of each. Two CHECKs say so,
  on both tables: no second language without a first, and never the same
  language twice. They name no language, so adding one still needs no
  migration.
- All four sit under the permissions that already gate those forms
  (`organizations.update`, `partners.update`) and are audited with those
  updates.
- The pair is resolved when the paper becomes a document and stored on it,
  like the seller and bill-to (ADR-046) and every other snapshot (ADR-029,
  ADR-038), so a reprint in a year reads as the original did:
  - `shipments.language` and `second_language` at ship, for the packing
      slip;
  - `invoices.language` and `second_language` at issue. A draft prints in
      the languages it would be issued in today, and is still marked DRAFT;
  - `credit_notes.language` and `second_language` copied from its
      invoice, never resolved again, so an invoice and its credit note read
      as one set (ADR-046's print rule) even if the partner's setting
      changed in between.
- Migration 0039 adds the columns and sets existing shipments, issued
  invoices and credit notes to `en` with no second language, which is how
  they were printed.
- A print page renders its sheet inside a provider fixed to the document's
  first language, with the second language's catalogue beside it. Each
  label prints in the first language, then the second: "Facture /
  Invoice" in a heading, two lines in a table's column header. Both are
  the same size and weight, the first never less prominent than the
  second, which is how the Charter's rule is generally read. Dates and
  money are formatted once, in the first language. Data is printed once,
  as typed, except a product's name, which follows its own rule below.
- The Back link and the Print button never reach the paper and stay in the
  person's language.

**Decision — the app's own names are translated; people's data is not.**

- Translated on display, by key: statuses, movement kinds, audit actions
  (`audit-format.ts`), permission descriptions, and the three system roles
  (Owner, Admin, Viewer; `roles.is_system`).
- Never translated: partner, location, price-list and tax-code names,
  custom roles, notes, reasons and addresses. Product and variant names
  are the one exception, below, and only where an organization enters
  them. A tax code
  prints the name its organization gave it, so one selling into Quebec
  names its codes as they should read there, in both languages if it
  wishes.

**Decision — a product's name and description may be kept in other
languages; which are required is the organization's setting.**

- `products.name` and `description`, and `product_variants.name`, stay as
  they are: the base text, in whatever language the organization works
  in, and the fallback for every language.
- Other languages go in `product_translations` (`product_id`, `locale`,
  `name`, `description`) and `variant_translations` (`variant_id`,
  `locale`, `name`), one row per item and language, unique on the pair,
  each with `organization_id` (ADR-003). A table rather than a column per
  language (`name_zh`), so a language is rows and never a migration, and
  an organization with no translations has no rows.
- `organizations.required_name_languages` (`text[]`, default empty): the
  languages every product must also be named in, `{zh-Hans}` for a
  business serving Chinese-reading customers. Empty requires nothing,
  which is where French stays unless the advisor says otherwise. The
  product form asks for the required languages and offers the others.
- Issuing an invoice whose first or second language is required, with a
  line whose product lacks a name in it, is a 409 naming the product, as
  a missing billing address already is. Shipping never waits for a name:
  it is a real event (ADR-032), so the packing slip falls back to the
  base name.
- Resolved per language: that language's name, else the base. On screens,
  the person's language; search matches the base and every translation,
  and the SKU stays the identifier everyone shares. On paper, each
  document language in turn, printed once when both come out the same.
- At issue each invoice line's `description` is written in the invoice's
  first language and the new `second_description` in its second (null
  for one language), so a reprint reads as issued. A draft keeps the base
  name, and its print shows what issuing will write. Credit-note lines
  copy both from their invoice line, as they already copy `description`.
- A product's description is translated for its pages; documents print
  names, as they do now.
- Server refusals and audit rows keep the base name (ADR-038): they name
  what the organization calls the product.

**Decision — machine-drafted, reviewed by someone fluent, glossary first.**

- A glossary per language (`docs/glossary.md`) fixes the domain's terms
  before anything else is translated: lot, batch, run, packing slip,
  credit note, SKU, licence. The commonest fault in a translated app is one
  concept translated three ways.
- Claude drafts `fr-CA.json` and `zh-Hans.json` from the English and the
  glossary. Someone fluent in each reviews it, and that review is a manual
  check in the release walkthrough: a release does not offer a language
  whose review has not passed.

**Consequences.**

- Built in this order, each step one or more commits that build on their
  own:
    1. Server: migration 0039 (the language columns and their checks,
       `required_name_languages`, `second_description` on invoice and
       credit-note lines, the two translation tables, and the backfill),
       `SUPPORTED_LOCALES`, the DTO fields, `locale` on `/v1/auth/me`, the
       language stored at ship, issue and credit, translations on the
       product routes and the check at issue; e2e tests.
    2. Client foundations: the provider, the English catalogue, extract,
       compile and `i18n:check` in CI, the language picker, MUI's locale
       packs, `<html lang>`, the current language in `format.ts`,
       `formatQuantity` and the decimal input rule.
    3. Strings moved one feature folder per commit, with no change to the
       English; the existing Vitest and Playwright suites are the proof.
       The lint rule is switched on for each folder as it is done.
    4. The glossary, then the French and Chinese catalogues.
    5. Printed documents in their one or two languages, the bilingual
       layout checked on the invoice's lines table, the widest; the
       setting on the partner form and the Organization page.
    6. Server: the filter and `t()`, then refusals one module per commit,
       validation messages, emails and notifications.
    7. A Playwright spec that switches to French and prints a French
       invoice and a French and English one, a manual-checks section for
       languages, and the handoff.
- Every new string on either side goes through an id. That is slower to
  write; the lint rule and `i18n:check` are what stop it being skipped.
- Bundle: react-intl and the English catalogue for everyone, no ICU parser,
  and each other language a chunk fetched once. Server: one catalogue
  lookup per refusal.
- An English wording change leaves the translations present but stale, and
  `i18n:check` cannot see that. Such a commit lists the keys for
  re-translation in the handoff until a translation service tracks it
  (Deferred).

**Deferred — each with what brings it in.**

- **Product descriptions on documents.** Documents print names today; a
  description line, in the document's languages, waits for a customer who
  needs it.
- **Traditional Chinese** (`zh-Hant`): a catalogue and an entry in the
  constant. Trigger: someone who reads Traditional.
- **An organization's default language for its people** who have not
  chosen one. Trigger: an organization whose staff mostly do not read
  English.
- **Right-to-left languages.** MUI supports right-to-left; every layout
  would need checking. Trigger: an Arabic or Hebrew reader.
- **A translation service** (Crowdin, Lokalise, Tolgee) that tracks stale
  translations. Trigger: a translator who does not work in the
  repository, or a fourth language.
- **Grouped digits in quantities** (`1 234,5`). Trigger: someone misreading
  a large quantity.

**Rejected.**

- **The browser's own translation** (Chrome's Translate). It translates
  data too (product names, SKUs, lot codes), it rewrites text React owns,
  a known cause of crashes when React next updates that node, and it
  cannot print a French invoice on purpose.
- **Machine translation at run time**, an API call per screen. A cost and
  a delay on every page, the organization's data sent to a third party,
  and one term translated differently on two screens.
- **The English sentence as the key.** Every English copy edit would orphan
  its translations.
- **Translations in the database.** The words would ship apart from the
  code that uses them, and screens and words could disagree between
  deployments. A catalogue is reviewed in the same pull request as its
  screen.
- **Error codes for the client to translate.** Each refusal would be
  written twice, the rule on the server and its words on the client, and
  the two would drift.
- **i18next.** A reasonable choice; ICU is a plugin there and native in
  FormatJS, whose Intl base matches `format.ts`.
- **The person's language in localStorage only.** Emails and notifications
  have no browser to ask.
- **A column per language on products** (`name_fr`, `name_zh`). Every
  language would be a migration and an empty column in every other
  organization; translation rows cost nothing where unused.
- **Bilingual as one more language value** (`fr-CA+en`). Every pair would
  be a new value and a new catalogue; two columns hold any pair of the
  catalogues that already exist.

**Amendment — a notification is written when it is read.** Reverses
"written once, in that person's language, and stored as now" above, for
notifications only; emails are unchanged.

A notification is read again, often days later; an email is read once.
Stored as a finished sentence, the bell stays in whatever language the
account had when the event happened: a person who switches to Chinese
keeps a bell of English, and so does anyone who chose their language after
`seed:demo` or an import wrote theirs. Every place that emits one already
passes a message id and its values (`t()`); only the stored text threw
them away.

- `notifications` keeps the message each sentence was written from,
  `title_message` and `body_message` (jsonb: the id, the values and the
  English), beside `title` and `body`. Migration 0041.
- `GET /v1/notifications` writes each sentence in the language the request
  asks for (Accept-Language, which the client sets to the screen's
  language), falling back to English where a catalogue lacks the id, as an
  error does.
- `title` and `body` stay, still written in the recipient's language at
  emit: a row written before this has no message and is shown as it was
  stored, and a body that is not a message (the variance list, "SKU: 13%")
  stays text.
- Quantities in a notification read without padding zeros, as on screen
  (ADR-055): "30 of 40 received", not "30.0000 of 40.0000". Trimmed as
  text, never parsed (ADR-025).

Considered and not done: rewriting old rows into messages. Their sentences
cannot be parsed back into ids and values reliably, and they age out under
retention (ADR-036) within weeks.

---

## ADR-055 — The look: tokens, a side rail, tabs and a summary beside the work (amends ADR-021)

**Context.** The client looks like Material UI's defaults because it is
them. `theme.ts` sets the font, the button defaults and two table rules;
colour, type, shape, density and dark mode are MUI's. An audit of the code
and of screenshots from `seed:demo`, in English, French and Chinese, light
and dark, at desktop and phone width, found:

- **Colour carries no meaning.** "Confirmed" is a filled blue on eight of
  nine order rows, blue is also every link and button, and four modules
  choose status colours their own way (`STATUS_COLOUR`, `STATUS_COLOR`, two
  helpers). A lot 20 days from expiry looks like one two years away. Filled
  warning chips and orange text are about 3:1, below WCAG AA.
- **Numbers are hard to read.** Quantities carry four decimals ("600.0000
  each") and no grouping, money is grouped, and the invoice already shows
  "400" where the order shows "400.0000".
- **Money is ambiguous.** The order's "Total" is ordered quantity times
  price before tax; nothing says so, and nothing on the order shows what was
  invoiced, credited or is still to invoice. An accountant asked which
  figure it was.
- **Phone layouts break.** Section actions overflow the edge, codes wrap
  mid-code ("FOC-/2609-/01"), and the production list's table is not in a
  scroll container.
- **The top bar is full.** French fits at 1280px with about 30px to spare;
  an organization's logo, the lot trace and a future lookup do not fit
  beside nine links.
- **Detail pages have no summary.** The order opens on the partner's name;
  its figures and actions are spread down the page.

Three directions were mocked up on real screens and demo data: a quiet
bordered ledger, a roomy side-navigation layout for warehouse tablets, and a
dark rail with tabs and a summary panel beside the work. A Chinese-reading
accountant with no UI background compared the last two in Chinese on two
tasks each. She preferred the third, above all its summary panel; asked for
expiry as days left with a colour; and found the money labels unclear, which
is where most of the money decisions below come from.

Two needs shape every decision here. No organization has a brand yet, and
each will want its own logo and colour, so the brand must be a few values
over a structure that never changes. And the app is read in three languages,
one of them Chinese, by people who are not designers.

**Decision — tokens in two layers.** A token is a named design value (a
colour, a size, a radius) that components use by name instead of writing the
value, so changing the token changes every screen. `client/src/theme/` holds
them:

- *Brand*: the accent colour, the logo, the radius scale and the sidebar's
  shade. These are the only values a rebrand or, later, an organization
  changes. Default accent `#5546B8`.
- *Semantic*: surfaces, text, borders, focus, and five status tones (below),
  in light and dark. Never brand-coloured, so no brand can make a warning
  unreadable or change what "expiring" looks like.

Dark mode derives the accent: the brand colour mixed 45% toward white, used
for fills with dark text and for links. The default accent passes AA in both
modes; checking an organization's own colour is the branding decision's job
(Open decisions).

Shape and space: an 8px spacing unit; radius 6px for controls, 8px for
panels, round for chips. Surfaces are flat, bordered and on a tinted page
background; shadows only for what floats (menus, dialogs, drawers).

**Decision — type.** Source Sans 3, hosted by the app
(`@fontsource/source-sans-3`, Latin and Latin Extended for French), weights
400, 600 and 700. Chinese uses the system's own font, chosen by `:lang(zh)`:
PingFang SC, Microsoft YaHei, Noto Sans CJK SC, then `sans-serif`. Noto Sans
SC is several megabytes per weight, too much to load for every reader;
system fonts cost nothing and are what the Chinese screenshots already use.
Numbers in tables and figures are tabular, so digits line up.

Five sizes and no others: page title 25px, section 17px, body 14.5px, small
13px, caption 12.5px. Line height 1.45 for Latin, 1.65 under `:lang(zh)`.

**Decision — one colour per meaning.** Every status maps to one of five
tones, in one table in `client/src/theme/status.ts`; modules name a status,
never a colour.

| Tone | Means | For example |
| --- | --- | --- |
| neutral | nothing to do, or finished with | draft, closed, cancelled, retired, typed by hand |
| info | in progress, normal | confirmed, released, issued |
| positive | completed as hoped | fulfilled, received in full |
| warning | needs someone soon | expires within 90 days, short, needs a cost, returns not settled |
| critical | wrong, or needs someone now | expires within 30 days, expired, voided |

Chips are tinted with dark text in light mode and the reverse in dark; every
pair passes AA. Colour is never the only signal: the chip's words carry the
meaning.

**Decision — expiry as days left.** A lot within 90 days of expiry shows a
chip with the days left ("Expires in 20 days" / "20 天后过期"), warning within
90 days and critical within 30 or past, and the date beside it in grey. Days
are counted from the person's own calendar day to the lot's `YYYY-MM-DD`
(ADR-052), on the client. The thresholds, 30 and 90, are one constant; per
organization they wait with the branding decision.

**Decision — quantities and money.**

- Quantities show no padding zeros and are grouped in the reader's language:
  "600", "1,000", "15.5 kg", "1 234,5" in French. The value stays a string
  end to end (ADR-025): trimming and grouping are string operations in
  `displayQuantity`, for reading. Fields keep `formatQuantity`, since a
  field shows what `toApiDecimal` accepts back, which refuses grouped
  digits. This brings in ADR-054's deferred grouped digits.
- Every money figure says what it is and whether tax is in it. On an order,
  amounts are before tax, because tax is decided when the invoice is issued:
  the items table's column is "Value, before tax" and its total row "Order
  total, before tax". Invoices and credit notes include tax, because they
  are the documents.
- An amount's currency is named once per group ("Money (CAD)"); an amount in
  any other currency carries its code.
- A sale's money summary comes from the server, calculated from its invoices
  and credit notes, never added up in the browser: order value before tax;
  invoiced and credited including tax, from issued documents only (a voided
  invoice counts in both, through its full credit note, so it nets to
  nothing); net invoiced; and not yet invoiced before tax, the value of what
  is ordered, not closed short and on no issued invoice. Per line, the
  quantity credited. And the returns not yet settled: received with no RMA,
  so nobody has decided on a credit, a replacement or nothing. A purchase
  shows its order value only, since supplier invoices are not recorded.
- No "return value". Returned goods are not money back; only a credit note
  is, and it may be at a lower price. The summary shows what was credited
  and flags what is not settled.

**Decision — navigation: a rail beside the page.** From 1200px (`lg`) a
sidebar, dark by default, with the light shade a brand token. Grouped: the
daily work (Inventory, Movements, Orders, Invoices, Returns, Production);
the records (Products, Partners, Locations, Trace a lot, Stock value, Audit
log); and Settings (Organization, Members, Tax codes, Exchange rates, Price
lists). It collapses to icons with names in tooltips, remembered per device.
Below 1200px it is a drawer behind a menu button, the same links in the same
groups. This replaces the top-bar rule in `conventions.md`; the rule it kept
stays: narrowing the window moves the links, never hides one.

The top bar is slim, sticky and never hides on scroll: the organization's
logo at the left (32px tall at most; its name in text until it has one),
then the bell and the account menu, which keeps the person's own things
(profile, devices, language, colour mode, sign out). In dark mode the logo
sits on a white plate, since most logos are made for white. A slot for a
lookup is left beside the logo and stays empty until that has its own
decision.

**Decision — detail pages: tabs, and a summary beside them.**

- A detail page with three or more sections of different kinds (order,
  invoice, production run, product, partner) puts them in tabs. One with
  fewer stays one page.
- The open tab is in the address, `?tab=shipments`; the first tab has no
  parameter. Switching replaces the history entry rather than adding one, so
  Back leaves the page instead of stepping back through tabs, and a refresh,
  a bookmark or a link from another page opens the same tab. A tab that does
  not exist, or that the person may not see, opens the first and corrects
  the address, with no error. One hook, `useTab`, does this for every page.
- The order's tabs are Items, Shipments, Returns, Invoices and credits, and
  History. History replaces `HistoryButton`'s drawer on tabbed pages, paged
  as it is now; untabbed pages keep the drawer.
- A summary panel sits beside the tabs and stays in view as the page
  scrolls: the actions the record allows, then its figures in groups (on an
  order, quantities and money). Quantities that need explaining say so in a
  grey line beneath ("not counting 1 voided shipment (100)", "doesn't add to
  still to ship"). Below 900px (`md`) the panel moves above the tabs.

**Decision — lists.** One filter row above each list: search, then quick
filters with counts ("Expiring soon 2", "Needs a cost 1"). One empty state:
what is missing, why it matters, what to do next, in the same frame on every
list. Codes (SKUs, lot codes, document numbers) never wrap, like numbers.
Every table scrolls inside its own container.

**Decision — density by pointer.** With a mouse, 36px controls and 40px
table rows. With touch (`pointer: coarse`), 44px targets and taller rows,
chosen by the device, not a setting.

**Decision — paper is separate.** `PrintSheet` renders inside its own fixed
light theme, black on white, outside the screen tokens. The packing slip,
invoice and credit note are unchanged by this decision; the screenshots of
them, in print mode, are the proof.

**Decision — accessibility, amending ADR-021.** WCAG 2.2 AA is the floor:
contrast for every token pair in both modes, a visible focus ring on
everything that takes focus, everything reachable by keyboard, tabs with
MUI's tab pattern (arrow keys, each tab tied to its panel).
`@axe-core/playwright` scans the main pages in light and dark, in a
Playwright spec (a new development dependency).

**Consequences.**

- Built in this order, each step one or more commits, each building on its
  own:
    1. Tokens and the theme (`client/src/theme/`), the font, the status
       table, the paper theme, and the UI section of `conventions.md`.
    2. The shell: rail, drawer and top bar.
    3. Shared pieces: `useTab`, the detail layout with its summary panel,
       the status and expiry chips, the filter row, the empty state,
       `formatQuantity`.
    4. Server: the sale's money summary, credited quantity per line and
       unsettled returns on the order's details; e2e tests. No migration is
       expected.
    5. Screens, one feature folder per commit, orders first; each updates
       `docs/manual-checks.md` and its specs.
    6. The axe spec, and manual checks for dark mode and narrow screens.
- Names do not change: every button, link and heading keeps its words, so
  `getByRole` lookups hold. What changes: specs that read sections now
  behind a tab click the tab first, and specs asserting "400.0000" read
  "400". Each is updated in the commit that changes its page.
- `npm run screenshots` is the before-and-after record: the whole set is
  retaken before step 1 and after each step.
- One more dependency in the bundle (the font) and one in development (axe).

**Deferred — each with what brings it in.**

- **Per-organization branding**, with the expiry thresholds: Open decisions.
- **The lookup in the top bar**, and search and sorting on lists: Open
  decisions.
- **Charts and the lot-trace diagram.** MUI X Charts would be a new
  dependency. Trigger: the stock-value trend or a recall that a table cannot
  show.
- **A density setting per person.** Trigger: someone on a desktop asking for
  more rows.

**Rejected.**

- **The quiet ledger** (direction A). The smallest change, but it keeps the
  top bar that has run out of room, and the people it was shown to read it
  as unchanged.
- **The roomy side navigation** (direction B) as it was. Its legibility is
  kept as touch density; its single long page lost to tabs and a summary
  that keeps the figures in view.
- **Tabs held only in memory.** A refresh, a bookmark or Back would lose the
  place, which is what makes tabs frustrating.
- **A history entry per tab.** Back would step through every tab visited
  before leaving the page.
- **Hiding the top bar on scroll.** It holds the bell and the account, and a
  bar that comes and goes moves the page.
- **Hosting a Chinese web font.** Megabytes per weight for every reader; the
  system fonts are good and free.
- **A monospace face for codes.** Tabular figures and a face that tells 0
  from O do the job without a third style.
- **A return value.** It reads as money given back, which is untrue until a
  credit note says so.
- **Brand colour on status.** One organization's red would make every action
  look like a warning.

**Amendment (built).** Steps 1 to 6 are built on `ui-design-pass`. What
was settled while building, against the decisions above; the method is
unchanged.

- **The summary counts items, and sums quantities only in one unit.** The
  server sends ordered, shipped, returned and still to ship summed when
  every line counts in one unit, and null otherwise: 600 bottles and 15 kg
  add up to nothing. A mixed order says how many items are complete. The
  same read carries the tabs' counts and a sale's invoices and credit
  notes, for an **Invoices and credits** tab beside a **History** tab.
- **Ship leads the summary**, full width; the status moves (Close order,
  Cancel order) come last and turn outlined beside it. A line's
  corrections are in a ⋮ menu, its actions column pinned to the table's
  right edge, so the menu is never found only by scrolling sideways.
- **Credits read with a minus** (`formatCredit`, U+2212) on the summary,
  the documents tab and an invoice's credit notes, which became a table.
- **Quick filters count on the server**, with the list's own filters:
  inventory's Expiring soon and Needs a cost (`GET /v1/stock/counts`), the
  latter through the one definition of a cost still waiting
  (`openNeedsCost`). Lists loaded whole (products, partners) narrow in the
  browser. Status filters are quick filters, never tabs or a select.
- **Not every page takes tabs or a filter row.** An RMA is one table and
  its notes; Locations is a tree, where a search would need a different
  design. Both keep their layout and take the tones and empty state.
- **Units take their plural** in every language, from the quantity
  (`displayWithUnit`, `withUnit`); the number is read only to choose the
  word's form, the figure shown is still the string (ADR-025).
- **Password fields show and hide** (`PasswordField`): hidden at the
  start, per field, and hidden again on submit and on leaving the page.
- **Accessibility is enforced, not hoped for.** `accessibility.spec` runs
  axe for WCAG 2.2 AA on twenty screens in both modes; its first runs
  found and fixed contrast on quick filters and disabled helper text, a
  link told by colour alone, and two controls without names. A link
  inside a sentence is always underlined; a control with no visible label
  carries one naming what it acts on.

---

## ADR-056 — Search: one lookup in the top bar, and a search on every list

**Context.** Nothing in the app finds a record by what a person has in hand.
A customer rings about invoice INV-000214, a supplier emails about lot
FOC-2609-01, the recall drill starts from a lot code: each means knowing
which list it is on, opening it and paging. Only the inventory searches
(SKU, product name, lot code, `ILIKE` on the server), the lot trace finds a
lot by part of its code, and since the UI pass Products and Partners narrow
what they have already loaded, in the browser. Orders, invoices, returns and
runs have no search at all. ADR-055 left a slot beside the logo for "a
lookup", and its *Open decisions* asked for one box that takes a lot code,
an order or invoice number or a SKU, and for search on the lists.

What people type is mostly short and partial: "2609", "INV-214", "focus",
"northside", "鱼油", "saint laurent" for "Pharmacie Saint-Laurent". Three
languages are read and typed, product names have translations (ADR-054),
and identifiers mix letters, digits and dashes.

**Decision — two kinds of search, one way of matching.**

- **The lookup**, a box in the top bar on every page, finds **records of any
  kind** and goes to one. It is not a search of the text on the page; the
  browser's own Find does that.
- **List search**, a box in each list's filter row (ADR-055), narrows **that
  list**, with its other filters, and pages as the list does.

Both match the same way, so a record the lookup finds, its list finds too.

**Decision — what is searched, by what.**

| Kind | Matched on | Opens |
| --- | --- | --- |
| Order | its reference; the partner's name | the order |
| Invoice, credit note | its number | the document |
| Return authorization | its number | the RMA |
| Production run | its reference | the run |
| Lot | its code | the lot's trace |
| Item | SKU; product and variant name, in every language it has | the product |
| Partner | name, code, tax ID | the partner |

Locations, members and settings are not in the lookup: few, and found from
their own pages.

**Decision — matching.**

- **Anywhere in the text, case ignored:** "2609" finds BF-2609 and
  FOC-2609-01, "inv-214" finds INV-000214. Surrounding spaces are trimmed and
  inner runs of spaces read as one. At least **2 characters**: one matches
  nearly everything.
- **Accents and punctuation ignored on names, not on codes:** "saint
  laurent" finds "Pharmacie Saint-Laurent", "eleuthero" finds "Éleuthéro".
  Through `search_text()` (migration 0043): Postgres's `unaccent` in an
  immutable wrapper so it can be indexed, lower case, and every run of
  punctuation and spaces read as one space. Codes are compared as typed,
  apart from case.
- **Every language at once.** An item is found by its name in any language
  it has, whatever language the reader uses, and shown in the reader's
  language (ADR-054). A Chinese reader typing an English name still finds it.
- **Chinese by characters.** Substring matching needs no word splitting, so
  "鱼油" finds "深海鱼油".
- **Chinese by pinyin as well.** A Chinese name is also found by its pinyin,
  typed without tones or spaces: "yuyou", "shenhaiyuyou", and its initials
  "shyy", all find "深海鱼油". The server writes each name's pinyin when the
  name is saved (below); a query of Latin letters matches it as it matches
  any name, anywhere in the text. Names with no Chinese have no pinyin.
- **Typos forgiven, after exact matches.** When the whole lookup finds
  fewer than five records, it adds close matches in each kind by trigram
  similarity (`word_similarity` above 0.3, on the accent-free form):
  "fokus" finds "Focus 60ct", "nortside" finds "Northside Pharmacy",
  "FOC-2690" finds "FOC-2609-01". They come after a kind's exact matches,
  marked "close match" in the reader's language, best first.
  *Amended while building:* first written as "when a kind finds fewer than
  five", which ran the close pass in nearly every kind of nearly every
  lookup; the perf budget caught a lot code's lookup at 329 ms against 300,
  and its close matches were all noise. A typo is a search that finds next
  to nothing. List search shows exact matches only, not close ones as first
  written: the lookup is where a typo is forgiven, and a list empty for a
  typo says so, with the lookup one key away.

**Decision — order of results.** Within each kind: an exact match first, then
a match at the start, then anywhere; ties by most recent. The lookup shows at
most **5 of each kind**, kinds in a fixed order (orders, documents, lots,
items, partners, runs, returns), except that a query shaped like a known
number (`INV-`, `CN-`, `RMA-`, or exactly a lot code) puts that kind first.
Each kind's group ends with "Show all in Orders" (or its list), which opens
the list with the same search.

**Decision — pinyin, written when a name is saved.** Postgres cannot turn
Chinese into pinyin, so the server does, with `pinyin-pro` (MIT, widely used,
no network): a new dependency. Each table with a searched name
(`products`, `product_variants`, the two translation tables, `partners`)
gains `name_pinyin`, text holding the full pinyin and the initials, lower
case, no tones or spaces: `shenhaiyuyou shyy`. Written on every insert and
update of the name, through one helper the services call, and null when the
name has no Chinese characters. Characters with two readings (多音字) take the
library's choice for the word; a wrong reading is a miss, not an error.
Existing rows are filled by a one-off script run with the migration, since
the conversion lives in Node, not in SQL.

**Decision — indexes: trigrams in Postgres, no search engine.** The
extension `pg_trgm` and a GIN index with `gin_trgm_ops` on each searched
column (`orders.reference`, `invoices.number`, `credit_notes.number`,
`return_authorizations.number`, `production_orders.reference`, `lots.code`,
`product_variants.sku` and `name`, `products.name`, the two translation
tables' `name`, `partners.name`, `code` and `tax_id`, and each
`name_pinyin`), the name columns through the `unaccent` wrapper. The same
indexes serve the close matches: `word_similarity` with its `<%` operator
uses a trigram index. A trigram index serves `ILIKE '%…%'`, which
a B-tree cannot; it costs some write time and space, small at this volume.

Two limits, recorded: a query of fewer than 3 characters cannot use a
trigram index, so "鱼油" reads the organization's rows of that column, fast
at today's sizes and inside the budget below; and the index covers the
column across organizations, with the organization filter applied after.
Both are revisited by the triggers below, not now.

**Decision — one lookup endpoint; each list's own.** `GET /v1/lookup?q=`
answers every kind in one response, grouped, each group its own query in one
transaction. List search is a `search` parameter on each list's endpoint
(orders, invoices, credit notes, returns, runs, stock already), combined
with the list's filters and keyset paging (ADR-051). Products and Partners
keep narrowing in the browser while they load whole; past a few hundred rows
they move to the server, the same parameter.

**Decision — permissions and tenancy decide what is found.** A kind the member
may not view (`orders.view`, `invoices.view`, `return_authorizations.view`,
`production.view`, `stock.view`, `products.view`, `partners.view`) is not
queried and not shown; the lookup never says a record exists that its list
would not show. Every query goes through TenantDb (ADR-003, ADR-016), so
another organization's records cannot match. Queries are not written to the
audit log: a search changes nothing.

**Decision — in the browser.**

- **The box** sits in the top bar's empty slot from 1200px; below, a search
  button there opens it full width. `/` or ⌘K / Ctrl+K focuses it from
  anywhere except a field being typed in.
- **A combobox** (ARIA 1.2, as MUI's Autocomplete builds it): results under
  the box, grouped with their kind's name, each row the number or name, a
  short second line (partner, status chip, expiry chip) and the kind's icon.
  Arrow keys move, Enter opens, Escape closes. Typing waits 200 ms before
  asking; an answer that arrives after a newer query is dropped.
- **Nothing found** says so, with the list links still offered.
- In every language, the kinds' names and the empty sentence from the
  catalogues; the records' own text as stored.

**Decision — a budget before it ships.** ADR-051's volume seed gains the
lookup and a list search, and `perf/` a budget for them, set from the first
measurement at the small scale. A plan check confirms the trigram indexes are
used for queries of 3 characters or more.

**Consequences.**

- Built in this order, each its own commit:
    1. Migration: `pg_trgm`, `unaccent`, the immutable wrapper, the
       `name_pinyin` columns, the indexes. Render's Postgres allows both
       extensions.
    2. Pinyin: `pinyin-pro`, the helper, every service that saves a name
       calling it, and the one-off script that fills existing rows, with
       unit tests (full pinyin, initials, mixed Chinese and Latin, no
       Chinese).
    3. The matching in one place on the server (normalising, the `%…%`
       pattern with `%` and `_` escaped, the accent-free form, the close
       matches), used by every search; the inventory and the lot trace move
       onto it.
    4. `search` on the lists that lack it (orders, invoices, credit notes,
       returns, runs), with e2e cases: partial, case, accents, another
       language, pinyin, a typo, another organization's record not found.
    5. `GET /v1/lookup`, grouped and ranked, close matches after exact ones,
       permissions per kind, with e2e cases for each rule above.
    6. The box in the top bar and the list boxes in the filter rows, with
       unit tests, an e2e flow (type "2609", Enter, the lot's trace), and the
       lookup added to `accessibility.spec`.
    7. The perf budget and the plan check; manual checks for Chinese input
       by characters and by pinyin, a typo, a phone, and the keyboard.
- The *Open decisions* entry "Search and the lookup in the top bar" is
  settled by this ADR.

**Considered and not done.**

- **Postgres full-text search** (`tsvector`). Built for words in prose, with
  stemming per language; it splits "FOC-2609-01" into pieces, does not match
  inside a word ("2609" in "BF2609"), and has no Chinese parser. Most of what
  is typed here is codes and names.
- **A search engine** (Meilisearch, Typesense, Elasticsearch). Better typo
  tolerance and language-aware tokenizing, at the price of another service to
  run, keep in sync with every write, secure and split by organization. Not
  at this size.
- **Searching in the browser everywhere.** Only works for what is loaded;
  Products and Partners do it until they are too large to load whole.
- **One endpoint per kind, called together from the browser.** Seven
  requests per keystroke, seven permission checks in the client, and the
  grouping and ranking in JavaScript.
- **Pinyin converted in the database.** No maintained Postgres extension
  does it on Render; a generated column would need one.
- **Recent and pinned records in the lookup.** Useful, and a separate
  question of what to remember per person; not in this ADR.

**Deferred — each with what brings it in.**

- **An index per organization** (`btree_gin`, the organization id with the
  trigram) or partial indexes. Trigger: one organization's rows dominating a
  table, or the budget missed.
- **A search engine.** Trigger: typo tolerance or ranking that trigrams
  cannot give (a misspelling with no letters in common), or volume past
  what the budget allows.
- **Pinyin with tone marks, or fuzzy pinyin** (zh typed as z, l as n, as
  some regional accents do). Trigger: a Chinese-reading user missing a
  record they typed the way they say it.

---

## ADR-057 — Lists by date range, sorted where it helps, exported as CSV

**Context.** Every list is newest first, fixed, because keyset paging
(ADR-051) pages by one order. Only the audit log filters by date. An
accountant's questions are about periods: September's invoices, this
quarter's credit notes, the movements on the day of a count, orders
expected next week. Today the answer is paging back until the dates run
out, then copying figures by hand into a spreadsheet, the tool those
questions end in. Search (ADR-056) finds a record; this narrows a list to a
period, puts it in the order the question needs, and hands it over.

The handoff recorded the shape: date ranges are cheap, one more filter on
the same paging; sorting is not, since each sortable column needs its own
cursor and index; CSV export belongs with them, since a filtered month is
what gets exported.

**Decision — a date range on the lists that have a date people ask by.**

| List | Filtered by | Kind |
| --- | --- | --- |
| Invoices | invoice date | calendar day |
| Credit notes | credit date | calendar day |
| Orders | expected date | calendar day |
| Stock movements | when recorded | instant |
| Production runs | when planned | instant |
| Return authorizations | when raised | instant |

- **Calendar days** (`date` columns, ADR-052) take `from` and `to`, both
  included, as `YYYY-MM-DD`: `from=2026-09-01&to=2026-09-30` is September.
- **Instants** (`timestamptz`) take `from` and `until`, as ISO instants,
  `until` excluded (not `before`, which every list already takes as its
  keyset cursor). The client turns the reader's days into instants in the
  reader's time zone, so "7 October" means the 7th where the person is, as
  the screens already show times.
- Either end may be left open. A range combines with the list's other
  filters and its search, and pages as before.
- A draft invoice has no invoice date yet, so a date range leaves drafts
  out; the status filter still finds them.

**Decision — credit notes get a list.** They have pages but no list, so a
quarter's credit notes cannot be shown or exported. `GET /v1/credit-notes`
and a Credit notes page beside Invoices: number, invoice, partner, date,
amount, voided, with the date range and search (ADR-056) like the rest.

**Decision — sorting where it is asked for, not on every column.**

| List | Sortable by | Why |
| --- | --- | --- |
| Invoices | invoice date, total | a period in order; the largest first |
| Credit notes | credit date, total | as invoices |
| Orders | expected date | what is due next |
| Inventory | expiry | soonest first, the order stock should leave in |

- The default stays newest first everywhere; a sort is chosen in the
  address (`sort=invoiceDate&order=asc`), so a sorted list can be
  bookmarked, and from the column header (MUI's `TableSortLabel`).
- **Keyset paging survives.** The cursor carries the sorted value and the
  id, `(value, id)`, and the next page reads after that pair, so paging a
  sorted list never skips or repeats a row. Rows without a value (an order
  with no expected date) come last in either order.
- **Each sort has an index** on `(organization_id, value, id)`, added by
  migration, and a plan probe in `perf/` (ADR-051).
  *Amended:* a btree read backwards gives `DESC NULLS FIRST`, and the lists
  put blanks last both ways, so a descending sort could not read the
  ascending index and sorted the whole organization instead; the plan check
  caught it on invoices by total. Each sort now has a second index built
  `value DESC NULLS LAST, id DESC` (migration 0046), one per direction.
- Any other column is refused, not ignored: a sort that cannot be paged
  correctly is worse than none.

**Decision — CSV export of what the list shows.**

- An **Export** button on each list above writes a `.csv` file of every
  row matching the list's current filters, search, range and sort: not
  just the page on screen. `GET /v1/<list>/export` with the list's own
  query parameters, so the export and the list can never disagree.
- **CSV, UTF-8 with a byte-order mark,** so Excel opens Chinese and French
  correctly instead of as mojibake; comma-separated, quoted per RFC 4180.
- **Headers in the reader's language,** from the catalogues; values as data,
  not as the screen formats them: quantities and money as plain decimals
  with a point and no grouping (`1234.5`), a currency column beside money,
  dates `YYYY-MM-DD`, instants ISO 8601. A spreadsheet then reads every
  figure as a number in any locale.
- **Formula injection is neutralized:** a cell beginning with `=`, `+`,
  `-`, `@`, a tab or a carriage return is prefixed with `'`, so a partner
  named `=HYPERLINK(...)` is text, not a formula (OWASP).
- **At most 50,000 rows.** Past that the export is refused with a message to
  narrow the range: a request holds a connection until it finishes, and
  there are no background jobs (ADR-005).
- **Who may export:** whoever may view the list; the permission is the
  list's. Every export is written to the audit log (`list.exported`, which
  list, its filters, how many rows), since it is data leaving the system in
  bulk.
- What each export holds:
  - invoices: number, status, invoice date, due date, partner, order,
      currency, subtotal, tax, total, credited, net;
  - credit notes: number, invoice, partner, credit date, currency, amount,
      voided;
  - orders: reference, direction, status, partner, expected date, lines,
      quantity ordered, quantity received or shipped, created; no money,
      since a line carries its own currency and one total could be wrong;
  - stock movements: when, reason, SKU, lot, quantity, from and to
      location, by whom, note;
  - inventory: SKU, item, variant, lot, expiry, location, quantity, unit;
      costs are the stock value export's, beside the valuation;
  - products: SKU, product, variant, type, unit, tracks lots, discontinued,
      and the names in each language the product has;
  - partners: name, code, tax ID, document language, retired, and the
      billing address;
  - a price list: its items, SKU, item, unit, price, currency; one export
      per list;
  - stock value (the costs page): SKU, lot, quantity, unit cost, value,
      currency, provisional, as at the moment of export;
  - the audit log: when, by whom, action, record type, record, and the
      fields the entry recorded as JSON (their shape differs per action),
      under `audit.view` like the page, filtered by its own date range and
      action.

  Products, partners, price lists, stock value and the audit log were
  added before step 5 was built: once one CSV writer exists, each is a
  choice of columns, not new work, and each answers a request an
  accountant or an auditor makes (a catalogue to check, a contact list,
  prices to send a customer, month-end valuation, who changed what). The
  audit log and partners hold personal data, which is one more reason
  every export is itself audited. Members, roles, tax codes, locations and
  settings are not exported: small, read on screen, and asked for by
  nobody yet.

**Decision — in the browser.**

- The filter row gains a **date range**: From and To date fields and a few
  presets (This month, Last month, This quarter, This year), in the
  reader's language and week; on a phone it folds under a Dates button.
- **Column headers** that can sort show it; the others do not pretend to.
- **Export** sits in the page header's actions; it downloads with the
  current filters, and says how many rows it holds before the file starts
  only when it is refused.

**Consequences.**

- Built in this order, each its own commit:
    1. Migration: the sort indexes; the audit action `list.exported`.
    2. Date ranges on the six lists, with e2e cases for both kinds and
       open ends.
    3. The credit notes list, server and page.
    4. Sorting with the `(value, id)` cursor on the four lists, with e2e
       cases paging a sorted list across pages.
    5. CSV writing in one place (BOM, quoting, injection, plain values) with
       unit tests, and the export endpoints, with e2e cases and the audit
       entry.
    6. The client: the date range, sortable headers, the Export button,
       with unit tests and an e2e flow (September's invoices exported).
    7. Perf probes for each sort and a range; manual checks for Excel and
       Numbers opening a Chinese export.
- The *Open decisions* entry on sorting is settled by this ADR; CSV import
  stays open there.

**Considered and not done.**

- **Excel files (.xlsx).** Typed cells and formatting, at the price of a
  library and a format to keep right; every spreadsheet opens CSV.
  Deferred below.
- **Exporting only the loaded rows, in the browser.** Simple, and wrong:
  an export of "September" that holds the first 50 rows is worse than none.
- **A background export emailed when ready.** Needs the background jobs
  ADR-005 put off; the row limit covers today's sizes.
- **Every column sortable.** A cursor and an index per column on every
  list, for sorts nobody asked for.
- **Dates by the organization's time zone.** Organizations have none; the
  reader's is what the screens already use.

**Deferred — each with what brings it in.**

- **Excel files.** Trigger: an accountant whose spreadsheet mangles CSV
  (leading zeros, long numbers), or who asks.
- **Exports past 50,000 rows**, in the background. Trigger: an organization
  that reaches it, with background jobs decided.
- **Export to the books** (QuickBooks, Sage), already deferred in ADR-048.
  Trigger: an accountant asking to stop re-keying.
- **More sortable columns.** Trigger: asked for, one at a time, each with
  its index.

---

## ADR-058 — Home: what needs attention, first

**Context.** Signing in lands on Products (`/` redirects there), the page a
person needs least often. What needs doing today is spread over six lists,
each found by knowing where to look and which filter to press: orders to
ship and to receive, lots near expiry, receipts waiting for a cost, draft
invoices, returns not settled, runs under way, licences running out. The
organization's name in the top bar already links to `/`, and ADR-055 kept
the corner as "the way home", with nowhere for it to lead yet.

The counts behind most of this exist (ADR-055's quick filters,
`GET /v1/stock/counts`); what does not is one place that shows them
together, with the most urgent few of each.

**Decision — `/` is Home, a page of cards, each something to do.**

| Card | Shows | Order | Opens | Permission |
| --- | --- | --- | --- | --- |
| To ship | confirmed sales with lines still to ship | overdue first, then by expected date | Orders, sales, open | `orders.view` |
| To receive | confirmed purchases with lines still to come | overdue first, then by expected date | Orders, purchases, open | `orders.view` |
| Expiring soon | lots with stock expiring within 90 days, or expired | soonest first, expired red | Inventory, Expiring soon | `stock.view` |
| Costs waiting | receipts with no cost yet | oldest first | Inventory, Needs a cost | `costs.view` |
| Invoices to issue | draft invoices | newest first, as the list | Invoices, drafts | `invoices.view` |
| Returns open | returns still open | newest first, as the list | Returns, open | `return_authorizations.view` |
| Production | runs in progress (released) | newest first, as the list | Production, in progress | `production.view` |
| Licences | licences expiring within 60 days, or expired | soonest first | Licences | `product_licences.view` |

**Decision — a welcome, a sentence and a row of counts, above the cards.**
Home is read first and in three languages, by people who are not
designers; before any card, three things say where the day stands:

- **A greeting:** good morning, afternoon or evening by the reader's clock,
  and their name; beside it the date in their language and the
  organization's name. Words, not decoration, and the page's one heading.
- **One sentence:** how much needs attention and how much of it is late,
  "9 things need attention, 2 of them overdue", or "Nothing needs
  attention today" when every card is empty. Counted from the cards the
  reader can see, so it never mentions what their role hides.
- **A row of big numbers:** one per card the reader can see, its icon,
  name and count, tinted only when something in it is late or close to
  spoiling (red overdue or expired, amber within the warning days), and
  each a link to its card further down. This is the page's visualization:
  the counts at a glance, no charts.
- **Quick actions,** under the row of counts: the few things people start
  from Home, Raise an order, Receive stock, Trace a lot, Plan a run, each
  shown only when the member's role may do it, as buttons that open where
  the work is done. Not a map of every page: the rail lists those on every
  screen and the lookup finds any record, and a second copy here would push
  the to-dos down.

- **Each card: a count, the five most urgent rows, and a link** to the list
  already filtered to the same rows ("See all 12"). A row opens its record.
- **A card with nothing to do says so** ("Nothing to ship"), in a quiet tone,
  rather than disappearing: an empty Home should read as all done, not as
  broken. A card the member may not view is not shown, and its query never
  runs (as the lookup, ADR-056).
- **Overdue** means an expected date before today in the reader's calendar;
  the thresholds are the screens' own (ADR-055: expiry 90 and 30 days), until
  branding makes them the organization's (Open decisions).
- **No money and no charts.** A figure like "invoiced this month" needs one
  currency or one per currency and a decision about what it counts; charts
  are an open decision of their own. Both stay out until asked for.

*Amended while building:* each card reads its rows through its list's own
service with the card's filters, so its five rows are exactly that list's
first five, in the list's order; a card ordered differently from its list
would have needed its own query and could drift from it. Shipments not yet
invoiced, credits not yet issued and planned runs are left out for now:
none has a list filter for "See all" to open, and a card must open its own
rows. Each comes back with its filter. Lateness follows the reader's day
(`?today=`); the expiring count's 90 days are the server's, as the
inventory's own filter counts them.

**Decision — the lists open where Home points.** A card's link must land
on exactly its rows, so the lists read their quick filters and range from
the address, as they already read `?search=` (ADR-056):
`/orders?direction=sale&status=open`, `/inventory?expiring=1`,
`/inventory?needsCost=1`, `/invoices?status=draft`,
`/return-authorizations?status=open`. Orders gain a direction filter, which
To ship and To receive need. Changing a filter on the page does not rewrite
the address; arriving with one sets it.

**Decision — one endpoint, the cards together.** `GET /v1/home` answers every
card the member may see in one request, each its own query in one transaction,
scoped to the organization: `{ cards: [{ kind, count, late, rows }] }` with up
to five rows each, `late` counting the overdue or expired ones the summary
sentence and the counts' tint need. The counts come from the same conditions
as the lists' filters, through the same functions, so "See all 12" opens
twelve.

**Decision — a new organization gets a start, not a page of zeros.** Until
it is set up, Home leads with *Getting started*: seven steps in the order
they depend on each other, each with a button to where it is done and a
progress bar over them.

1. **Your organization:** its address, tax number and base currency, which
   the first invoice needs.
2. **Add a location:** where stock is kept.
3. **Add a product.**
4. **Add a partner:** a customer or a supplier.
5. **Receive stock:** the first receipt.
6. **Raise and ship an order, and issue its invoice:** the whole flow
   once.
7. **Add your team:** members and their roles, in Settings → Members.

- **Ticked by what exists, never by hand:** each step is done when the
  organization holds what it asks for (details filled in, a location, a
  product, a partner, a receipt, an issued invoice, a second member), so
  it cannot be ticked without being done and never needs ticking.
- **Only the team step can be skipped.** A one-person business has no team;
  without Skip that step would stay open and Getting started never end.
  Steps 1 to 6 cannot be skipped: each is something the app needs before it
  is of use.
- **The whole card can be dismissed,** steps left or not, for someone who
  set things up another way and does not want it every day; a small "Show
  Getting started" brings it back. It goes away by itself once every step is
  done or skipped.
- **Skip and Dismiss belong to the organization,** not one person: setting
  up is the organization's, and one dismiss hides it for everyone. Both are
  stored on the organization (migration), and only a member who may change
  its settings (`organizations.update`) sees the two controls.

**Decision — recently opened, for picking up where one left off.**
*Amended: brought forward from Deferred at Bob's request.* The last few
records a person opened, kept on the server so they follow the person
across devices, which a browser's own storage would not.

- **What is remembered:** opening an order, invoice, lot, product,
  partner, production run, return or price list, once its page has loaded.
  The page sends `POST /v1/recent` with the kind and id; a list, a search
  or Home itself is not an opening. One row per person, organization and
  record, its time moved on when it is opened again; past 30 a person's
  oldest are dropped.
- **What is shown:** `GET /v1/recent` names each record as it is now
  (renamed, it shows the new name; deleted, it drops out) and returns only
  kinds the member may still view, as the lookup does (ADR-056). Never
  another person's: each sees their own.
- **Where:** on Home, a *Recently opened* card under the quick actions,
  the last six as tiles (kind, name, a second line, when), with Clear. Not
  a to-do: it is not counted in the sentence or the row of counts, and it
  is left out while empty, the one card that hides, since an empty history
  is not work done. And in the top bar's search, opened before anything is
  typed, the last five, so `/` then Enter reopens the last record.
- **Not audited:** opening a record is reading it, and the audit log
  records changes, not reads; the history is the person's own convenience,
  cleared by them, removed with their membership.
- Built on its own branch after Home: a migration (`recent_records`), the
  two endpoints and Clear (`DELETE /v1/recent`), with e2e; the record pages
  reporting an opening; the card and the search's empty state, to the
  canvas; a perf read and probe. Designed on the canvas with Home's.

**Decision — in the browser.**

- Home is the first item in the rail's Main group, and `/` stops redirecting
  to Products. The page title is the organization's name.
- Cards in a responsive grid: two or three across on a desktop, one on a
  phone, in the order of the table above, which is the order of a working
  day (out the door, in the door, what spoils, what is unpriced, what to
  bill).
- Each row is the record's number or name, a short second line (partner,
  SKU), and the chip that says why it is here (overdue, expires in 12 days).
- Read when the page opens, with a refresh button, as every list is; not
  live.

**Decision — a budget before it ships.** ADR-051's perf run gains
`GET /v1/home`, and the plan check a probe for each card's query; Home is
the page everyone opens first, so it is held to the read budget like any
list.

*Amended after the first run:* the budget caught Home. At small scale,
`GET /v1/home` took 841 ms at the 95th percentile against 300, and held
about 16 requests a second at 10 connections and at 100 alike: bound by
the work each request does, not by waiting. The plan check counted 20
statements in the `home` probe, the slowest 49.8 ms, and failed it on a
sequential scan of `stock_movements` (206,425 rows). Two changes:

- **Getting started finds a receipt through the ledger's index.** As an
  EXISTS, the receipt step left the planner free to scan the ledger,
  every tenant's, for the first receipt. It now asks for this
  organization's newest receipt, ordered as the (organization,
  created_at) index is, so that index is the only cheap plan.
- **Every card's count in one statement.** Each card had read its count in
  its own transaction, and the two stock cards each called the stock
  list's `counts()`, which counts both quick filters, plus a third query for
  the expired: seven reads of the organization's stock for two cards. Now
  one statement answers every count the member may see, a `union all` with
  a branch per card, each with the same conditions as its list: the stock
  branches through `stockRowsOf`, the list's joins and filters that
  `counts()` also counts through. The expired are counted among the
  expiring card's rows, so `late` can never exceed `count`. The rows are
  still each list's own first five, read through its service. Home went
  from 20 statements in 17 transactions to 10 in 10.

Not done: reading the cards in parallel. A request bound by work gets no
faster when the same work is spread over more of the pool's connections,
and under load it would take connections other pages need.

*Amended after the second run:* `GET /v1/home` fell from 841 ms to 453 ms
at the 95th percentile and from 20 statements to 9, still over 300. The
plans showed where the rest went: the costs card's rows took 39 ms of the
probe's 42, and its count does the same work. A stock row "needs a cost"
when a waiting valuation exists for its pool, and the planner checked that
for each of 1,542 stock rows through the pool index, reading every
valuation of the variant to find the few waiting ones. The partial index
for the needs-cost list was on the organization alone. It now holds the
pool, (organization, variant, lot) where needs_cost, so each check reads
only waiting rows (migration 0048); the needs-cost list still leads with
the organization. Two smaller fixes: the plan check now explains the
totals statement, which it skipped because it opens with a parenthesis,
and Getting started's invoice step reads through an index, as the receipt
step does, after a run flagged a scan of invoices that the previous run's
plan had not chosen.

**Consequences.**

- Built in this order, each its own commit:
    1. The shared conditions: each card's filter defined once on the
       server, used by its list and by Home (orders to ship and receive,
       expiring, needs a cost, drafts and uninvoiced shipments, open
       returns, active runs, expiring licences).
    2. `GET /v1/home`, cards by permission, with e2e cases: each card's
       count matching its list, the five rows' order, a card hidden without
       its permission, another organization's records never counted.
    3. The lists reading their filters from the address, with unit tests.
    4. The page: the greeting, the sentence, the row of counts, the
       quick actions, Getting started's seven steps with Skip and Dismiss
       (and their migration), the cards, the rail item, `/` as Home,
       with unit tests, an e2e flow (a card's "See all" opening its list
       with the same count), and Home in `accessibility.spec`.
    5. The perf scenario and probes; a manual check in Chinese and on a
       phone.
- ADR-055's "the way home" in the top bar now leads somewhere. The
  Licences card uses issue #17's 60 days; the issue's notification stays its
  own work.

**Considered and not done.**

- **A dashboard of figures and charts.** What people asked for was what to
  do next, not how the month went; figures need currency rules and charts an
  ADR of their own (Open decisions).
- **Landing on the last page visited.** Useful to a person mid-task, and
  hides what is overdue from one who is not; the browser's Back and the
  lookup cover the first.
- **A home per role** (the warehouse sees shipping, the accountant
  invoices). Permissions already do most of this: a member sees only the
  cards for what they may view. Roles are the organization's to define
  (ADR-016), so fixed role pages would not fit them.
- **Cards that hide when empty.** An empty page reads as broken; a quiet
  "Nothing to ship" reads as done.

**Deferred — each with what brings it in.**

- **Choosing and ordering cards per person.** Trigger: someone asking to
  hide one they never need.
- **Figures** (invoiced this month, stock value, per currency). Trigger:
  asked for, with the currency rule decided.
- **Live updates.** Trigger: two people working the same queue at once and
  colliding.
- **Thresholds per organization** (expiry days, overdue grace), with
  branding. Trigger: that ADR.
- **Try it with sample data:** a filled-in organization to click around
  before entering real data, from the demo seed. Trigger: a prospective
  customer asking to explore first; it needs its own decision on where the
  sample lives and how it is cleared.
- **User guides,** linked from each Getting started step and each empty
  list: short Markdown under `docs/user/`, already raised in the handoff.
  Trigger: the first customer onboarded without someone beside them.

---

## ADR-059 — Files: one store for every file, on R2, served through the app

**Context.** Nothing stores a file yet, and several things are waiting to.
Branding needs the organization's logo (*Open decisions*, ADR-055's brand
tokens). The catalogue wants product images. Lots want their certificates
of analysis, licences their documents (ADR-040), purchases their supplier
documents, returns their photos. Each has pointed at "the bucket question"
until one decision answers it for all of them.

What shapes the answer:

- **Tenancy.** Every row carries `organization_id`, and every read goes
  through the tenant's scope (ADR-003). A file is data like any row, and no
  organization may ever read another's.
- **Mainland China.** Some users are there. Browsers reaching a storage
  provider's own hostname may be slow or blocked; the app's own domain
  already works.
- **Backups.** ADR-053 keeps the database's nightly dumps in Cloudflare R2,
  bucket `waf-backups`, with a bucket lock and lifecycle rules. R2 has no
  object versioning and no S3 object lock; its own bucket locks do the
  same job by prefix.
- **Scale.** A few organizations, files counted in hundreds. R2's free
  allowance is 10 GB-month of storage, 1 million writes and 10 million reads
  a month, and it charges nothing for egress.
- **Uploads are hostile until checked.** A file named `logo.png` can be
  anything. An SVG can carry script. A photo carries its GPS position.

**Decision — one store for every file: Cloudflare R2, its own bucket.**

- Bucket `waf-files`, in the location nearest the app's host (amended
  below). One bucket for every kind of file and every organization; the
  database, not the bucket, knows whose a file is.
- Its own API token, scoped to `waf-files` with read and write, held only
  by the app. Backups never share a bucket or keys with it, in either
  direction: the app cannot touch a backup, and the backup job's key for
  files is read-only.
- Reached through the S3 API, so the provider is a setting: another S3
  store is a new endpoint and keys, as for backups.

| Variable | Holds |
| --- | --- |
| `FILE_STORAGE` | `s3` in production, `local` in development and tests |
| `FILES_S3_ENDPOINT`, `FILES_S3_REGION`, `FILES_BUCKET` | Where files go (`auto` is R2's region) |
| `FILES_S3_ACCESS_KEY_ID`, `FILES_S3_SECRET_ACCESS_KEY` | The app's key for `waf-files` |
| `FILES_LOCAL_DIR` | Where `local` keeps files, `server/storage/` by default, ignored by git |

`local` writes to disk behind the same interface, so development, unit
tests, e2e and CI need no bucket and no network. The S3 driver is the one
production uses; a manual check covers it against R2 (*Consequences*).

**Decision — a `files` table is the record; the bucket holds bytes.**

- One row per file: `id` (UUIDv7), `organization_id`, `kind` (`logo`,
  `product_image`, `document`, `return_photo`; each user of files adds its
  own), `content_type`, `size`, `sha256`, `original_name`, `width` and
  `height` for images, `created_by`, `created_at`, `released_at`. Read
  and written through the tenant's scope like every tenant table.
- The object's key is `<organization id>/<file id>`: no name, no
  extension, nothing a person typed. The name a person gave is in the row,
  cleaned, and used only as the download's file name.
- **A file never changes.** A new logo is a new file, the old one released.
  So an object is written once and never overwritten, which is what lets a
  file be cached forever and backed up by copying what is new.
- The record that uses a file holds its id: `organizations.logo_file_id`,
  later a product's images, a lot's certificates. Each feature's own ADR
  adds its column or link table, with its permission and its rules (a
  certificate on a shipped lot cannot be removed, for instance).

**Decision — uploads go through the app, and are checked before they are
kept.**

`POST /v1/files` with the file and its kind, as `multipart/form-data`. The
server checks, in order, and stores only what passes:

1. **Permission for the kind**, the permission of what it is for:
   `organizations.update` for a logo, the catalogue's for a product image,
   and so on. A file nobody may attach is refused before it is read.
2. **Size while it arrives.** The limit is enforced on the stream, so an
   oversize upload is cut off at the limit, not read to the end and then
   refused.
3. **Type from its bytes**, never from its name or the browser's word: PNG,
   JPEG, WebP, PDF and, for logos only, SVG, each recognised by its
   signature. Anything else is refused with what is accepted.
4. **Images are decoded and written again** (`sharp`): colour as sRGB,
   every piece of metadata dropped (EXIF, GPS, camera), turned upright from
   the camera's orientation, stored as WebP or, for logos, PNG, in the
   sizes below. A file that does not decode as the image it claims to be is
   refused. Re-encoding is also what defeats a file that is an image and
   something else at once.
5. **An SVG logo is drawn to a PNG on the server** and only the PNG kept.
   The SVG itself is never stored or served, so nothing it contains can run.
6. **A PDF is kept as it is**, after its signature, and only ever served as
   a download (below).

| Kind | Accepted | Largest upload | Kept as |
| --- | --- | --- | --- |
| `logo` | PNG, JPEG, WebP, SVG | 2 MB | PNG, at most 1024 px wide, at least 256 px wide accepted |
| `product_image` | PNG, JPEG, WebP | 20 MB | WebP in three sizes (below) |
| `return_photo` | PNG, JPEG, WebP | 20 MB | WebP in three sizes (below) |
| `document` | PDF, PNG, JPEG | 20 MB | PDF as uploaded, images as WebP in three sizes |

**Three sizes of every photo, made once at upload.** A list or a gallery
strip shows many small images, a product page one clear one, and zooming
in wants every detail the camera caught. One size cannot serve all three:
a full photo in a list of fifty is megabytes for fifty squares, and a
thumbnail zoomed in is a blur.

| Size | Long side | Quality | About | Shown |
| --- | --- | --- | --- | --- |
| `thumb` | 400 px | WebP 75 | 20–40 KB | Lists, cards, a gallery's strip (200 px on screen, sharp on a 2× display) |
| `display` | 1200 px | WebP 80 | 100–250 KB | The image on a record's own page, the main picture of a gallery |
| `full` | 3000 px | WebP 85 | 0.5–1.5 MB | Opened to zoom in, and downloaded |

- Each size keeps the photo's own proportions; nothing is cropped on the
  server. A square in a list is the page's `object-fit`, so no edge of a
  product is lost for good.
- Never enlarged: a photo smaller than a size is kept at its own size for
  that one.
- One `files` row; one object per size, `<organization id>/<file id>/thumb`,
  `/display`, `/full`. The row keeps each size's width and height, so a
  page reserves the space before the image arrives and nothing jumps.
- The client asks for the size it shows: a list `?size=thumb` with
  `loading="lazy"`; a record's page `srcset` over all three with `sizes`, so
  the browser picks by screen width and pixel density; the zoom view
  `?size=full`. Zooming in the viewer is the browser scaling the full
  image.
- Sizes are made once, when the photo arrives, never per request: a page
  of thumbnails costs reads, not resizing.

A new file is unattached until the record that uses it is saved with its
id. Unattached files older than a day are released, so an abandoned form
leaves nothing behind.

**Decision — every file is served through the app's own domain.**

`GET /v1/files/:id`, and `?size=thumb`, `display` or `full` for a photo
(full without one), after sign-in, the tenant's scope (another
organization's file is a 404, as for any record) and the permission of what
uses it: whoever may see the product may see its image. The server streams
the bytes from the bucket.

- **Never a provider URL, never a signed redirect.** A browser in China
  only ever reaches the app's domain, a link cannot outlive or escape the
  permission check, and moving provider changes no URL anywhere.
- Headers: the stored `Content-Type`, `X-Content-Type-Options: nosniff`, and
  `Content-Disposition: attachment` with the cleaned name for everything
  except the images the server itself wrote, which are `inline`. A PDF is a
  download, never a page of the app's own origin.
- `Cache-Control: private, max-age=31536000, immutable` and the `sha256` as
  the ETag: a file never changes, so a browser keeps it until it is gone.
- Printed documents (invoices, packing slips) read the logo from storage on
  the server; nothing printed fetches a URL.

R2 charges nothing for egress; the app's host carries the bytes twice
(bucket to server, server to browser), which at these sizes is nothing. A
CDN or Cloudflare Images in front comes with the trigger below.

**Decision — released, then purged after 30 days.** Releasing a file (its
record deleted, a logo replaced, an unattached upload expired) sets
`released_at`. A daily job deletes the bytes and the row 30 days later.
The window means a mistake can be undone and a database restored from last
week still finds its files. Deleting an organization releases all of its
files.

**Decision — files are backed up by copying, to the backup bucket.** Files
never change, so a backup is a copy of every object the backup does not
yet hold.

- The nightly backup job (ADR-053) copies `waf-files` into `waf-backups`
  under `files/`, adding what is new and deleting nothing, with a read-only
  key for `waf-files`.
- A bucket lock on `files/` for 30 days, as on `production/`: nothing there
  can be deleted or overwritten in that time, by anyone.
- A lifecycle rule ends each copy after 31 days, and the next night's copy
  writes again whatever is still live. So every live file always has a
  copy, and a purged one survives in the backup for a month, matching the
  database's daily dumps.
- The restore runbook gains a step: after the database, copy `files/` back
  into a bucket, and check that every `files` row's object exists. The
  monthly drill checks the same against the backup.
- Files and their backups are both at Cloudflare. ADR-053 put backups at
  another provider than the database host; that holds. A second provider
  for the files' copy waits for the trigger below.

**Decision — a limit per organization.** 1 GB each, summed from `files`
over every size kept, so the free 10 GB serves ten organizations before
anyone pays; a photo in its three sizes is about 1 MB, so a thousand
photos each. Over it, an
upload is refused with how much is used and what can be released. A
setting, so a plan can raise it.

**Consequences.**

- Built in this order, each its own commit:
    1. By hand: bucket `waf-files` (Eastern North America), its token, the
       `FILES_*` variables on Render; the read-only files key for the
       backup job in GitHub; the `files/` lock and lifecycle rule on
       `waf-backups`.
    2. Migration 0049, `files`, scoped by organization like every tenant
       table.
    3. The storage module: the `local` and `s3` drivers behind one
       interface (`@aws-sdk/client-s3`), the checks and `sharp` with the
       three sizes, `POST /v1/files` and `GET /v1/files/:id`, the daily
       release-and-purge job.
       Tests on `local`; one manual check uploads, reads and purges against
       R2 itself.
    4. The backup job's copy, the runbook's step, the drill's check.
    5. The first user: branding's logo, in its own ADR.
- Two dependencies: `@aws-sdk/client-s3`, and `sharp`, which ships native
  binaries for the platforms used (Linux x64 on Render and CI, macOS ARM64
  for development).
- Files hold personal data: a return photo can show a person, a document a
  signature. They follow the same retention as the database: purged 30
  days after release, gone from backups a month later. The privacy policy
  says so, as it does for backups.
- No virus scanning. Images are rewritten and PDFs only downloaded, and
  every file comes from a signed-in member of the same organization.
  Trigger below.

*Amended while building:*

- **One upload route per kind**, `POST /v1/files/logo` and
  `/v1/files/product-image`, not one route with the kind as a field. The
  size limit is enforced while the upload arrives, and the permission
  checked before it does; both depend on the kind, which a route knows
  before a byte is read and a form field does not. Each feature that keeps
  files adds its route, its kind and a migration for `files_kind_check`;
  `logo` and `product_image` are the first two.
- **The purge runs hourly inside the server**, not as a scheduled job
  elsewhere: a server that sleeps when idle purges whenever it wakes, and
  two instances purging at once only delete the same things twice. Not in
  tests, which call it with the time they need.
- **Over the organization's limit is a 409**, saying the limit in MB; an
  upload over its kind's size is a 413, cut off on the stream.
- **The bucket's location follows the app's host, not the backups'.**
  Every file passes through the server, so `waf-files` sits in the region
  nearest it; `waf-backups` is placed for its own reasons (ADR-053).
- **Deleting an organization deletes its `files` rows** (the foreign key
  cascades). Nothing deletes an organization today; when something does,
  it releases the organization's files first, as the decision above says,
  so the purge removes their bytes.

**Considered and not done.**

- **The logo in the database** (`bytea`, at most 500 KB). It needs no
  bucket, and works for one small logo; but product images and documents
  would need the bucket anyway, and two ways to store a file means two
  sets of checks, two backups and two ways to serve.
- **Uploads straight to the bucket with a signed URL.** It saves the app
  carrying the bytes, but the browser would then reach the provider's
  hostname (China), the bucket would need CORS, and the file would be
  stored before the server had checked it.
- **A public bucket or a custom domain on R2** for serving. No permission
  check, and a URL that lasts as long as the bucket.
- **MinIO in development** instead of a local driver. Another container,
  and its community edition has been cut back; `local` behind the same
  interface tests everything but the network.
- **Keeping the original beside the re-encoded image.** It would keep the
  metadata the re-encode exists to remove. `full` at 3000 px is what zoom
  needs; a camera's 4000 px and up adds bytes nobody looks at.
- **Resizing on request**, any width the page asks for. Every view would
  cost the server a resize, and every width a cache entry. Three fixed
  sizes, made once, cover a list, a page and zoom.
- **Cropping thumbnails square on the server.** A product's edge cut off
  stays cut off; a square is the page's choice, made with `object-fit`.

**Deferred — each with what brings it in.**

- **A CDN or Cloudflare Images**, for serving nearer the reader. Trigger:
  product images on a page anyone outside the organization sees, or image
  requests showing in the perf run.
- **AVIF beside WebP**, a third smaller again. Trigger: images a large part
  of what pages download.
- **Virus scanning** (ClamAV or a provider's). Trigger: files shared with
  people outside the organization, such as a customer portal, or a
  customer's security questionnaire.
- **A second provider for the files' backup.** Trigger: the first paying
  customer, or a contract that names one.
- **Per-organization limits by plan.** Trigger: plans.

---

# Open decisions

Questions land here before they are promoted to an ADR. None of these block V1;
they exist so the reasoning is not rediscovered from scratch.

- **Industry vocabulary and optional modules.** The screens were written
  for the first customers, who make supplements: "recipe" and "batch" are
  their words, and the Licences screen exists for Health Canada's NPN. A
  machine shop says "bill of materials", a cosmetics maker "formula", and
  a business making nothing regulated never needs a licence. Two separate
  answers when one is needed. Modules an industry does not use (licences,
  perhaps production) switched off per organization, removing their
  screens and fields rather than leaving them unused. And vocabulary
  chosen per organization from a short list of variants (Recipe, Formula,
  Bill of materials), laid over the standard catalogue in each language:
  ADR-054 already takes every screen word from a catalogue, so the
  mechanism is small and the work is deciding which terms vary and
  writing each variant in every language. Licences are already optional
  in effect — nothing requires one unless the organization says so — so
  nothing is blocked today. Trigger: the first customer outside
  supplements, whose words are then the evidence rather than a guess.
- **Row-scoped permissions.** ADR-004 handles global rules but not "this member
  sees only rows related to them" (a manufacturer viewing only their own
  inventory). Extend rather than replace: likely a scope on the membership,
  applied in one place the way `organization_id` is. Not needed until an
  application requires it.
- **External parties: members or separate organizations?** Suppliers and
  carriers as low-privilege members of the operating organization is simpler;
  separate organizations with explicit sharing fails safer. Depends on the
  application.
- **Customers: `users` or their own table?** Order placement needs identity but
  not necessarily an account. Downstream of V1.
- **Registration reveals whether an address is registered.** A duplicate email
  returns 409, which is the enumeration hole login and `forgot-password` both
  avoid. Closing it means registration always answering "check your email", and
  sending the existing account a "someone tried to register with your address"
  message instead — a third template and a different response shape. A UX
  decision, not a patch.
- **Breached-password rejection.** Length is the only rule today (12 minimum, no
  composition rules, per NIST). `Password123!` passes. The high-value addition is
  Have I Been Pwned's range API — k-anonymity, no key, the plaintext never
  leaves the server — rejecting server-side, failing open when the API is
  unreachable. Client-side strength meters are advisory only; anything the
  browser enforces is bypassed by `curl`.
- **SMTP authentication.** Mailpit needs none, every real provider does. Two env
  vars, deliberately not guessed at before a provider is chosen.
- **Audit log export and payload search.** Filtering covers who, what, and when,
  which is what people ask. Free-text search over the JSONB payload needs
  different indexes and answers a question nobody has yet. CSV export is a real
  compliance need eventually, and is a streaming endpoint rather than a bigger
  page — deferred until someone asks.
- **Departments.** Deferred, and not a permissions mechanism: a role says what
  someone can do, a department says where they sit, and the two vary
  independently — a Warehouse Manager and a Sales Manager hold the same role in
  different departments, while one department contains several roles. Building
  permissions on departments rebuilds roles under a different name. As a label
  (shown in a member list, filtered on, reported on) it is a column or a small
  table whenever an application asks. If it ever *imposes* visibility rather
  than filtering it, that is the row-scoped permissions entry above, not a
  department feature.
- **Separate packages, not npm workspaces.** Server and client keep their own
  `package.json` and `node_modules`. The workspace would give one TypeScript
  version and a `shared/` package for the four validation constants currently
  mirrored in `server/src/core/auth/dto/` and `client/src/lib/validation.ts`.
  Rejected for now: it changes how Render builds, which is a production change
  to solve a local annoyance. Revisit when `shared/` would hold response types
  rather than four numbers — that is a real drift surface, four constants is
  not. Until then the copies carry comments pointing at each other.
- **Admin CRUD: Refine, provisionally.** Headless (so no theme to fight), and
  it bundles TanStack Query, which is the server-state layer step 9 needs
  anyway. Not yet adopted, and not an ADR until two things are checked against
  its data-provider interface: keyset pagination on a UUIDv7 cursor with no
  `count(*)` (ADR-018), and 403s that carry meaning. If the provider assumes
  offset pagination and a total, the adapter fights the framework.
- **Forcing a password change after admin-created sign-in.** ADR-006 defers
  invitations, so an admin sets another person's initial password and has to
  communicate it out of band. Until it is changed, two people can authenticate
  as that account. The fix is a `must_change_password` column, a flag on the
  login response, and a client route that blocks everything else — plus a
  decision about what such a user may do meanwhile. Largely moot once
  invitations exist, since an invited user sets their own password and the
  account never has one a second party knows. Sequence the two together.
- **What unverified access should be limited to.** Verification works and sets
  `email_verified_at`, but nothing reads it — ADR-017 chose not to block login,
  on the grounds that losing a registration to a dead SMTP connection is worse
  than letting an unverified user in. The consequence is a flag with no
  consequence, and password reset sends a link to an address nobody confirmed.
  Candidates are actions the unverified user takes themselves: inviting a
  member, changing their own email address. Capping their *role* is not a
  candidate — an admin creating an Admin cannot control whether that person
  verifies, and either rejecting the action or silently downgrading it makes
  `memberships.role_id` disagree with the behaviour. Expiring the token is
  fine; expiring the account is not.
- **Audit filtering in the UI.** `ListAuditDto` accepts action, actorId, from,
  and to; the client sends none of them. Two years of retention (ADR-012)
  makes "load more" a poor way to reach an old entry, but a filter UI designed
  against four rows is guesswork. Build it when there is enough log to know
  which filters people actually reach for.
- **Member removal versus account deletion.** `users.delete` is seeded and
  granted, but no route implements it. Two operations hide behind one word:
  removing a membership (the common case — access revoked, account intact) and
  deleting the account (ADR-012's tombstone and anonymisation, plus its
  sole-Owner block). They need separate endpoints, or someone destroys an
  account meaning to revoke access. Until then the permission promises
  something the API cannot do.
- **Catalogue attributes deferred with their modules.** `products` and
  `product_variants` carry only intrinsic facts today. Category and brand are
  product-level foreign keys and arrive with the catalogue module. Tax class
  and supplier are *variant*-level — tax bands can differ by size, and a
  supplier quotes a specific pack — and arrive with selling and purchasing
  respectively, supplier as a many-to-many with lead time and pack size.
  Barcodes are their own table: one variant carries a UPC, an EAN, and a
  supplier code. Images are their own table referencing both product and
  variant, the latter nullable so a variant without its own image falls back to
  the product's; they wait on file storage, which is deferred.
- **Field-level change history.** Audit rows record that something happened,
  not what it changed from (ADR-018 kept payloads out deliberately). A SKU
  rename is the first case where the previous value has obvious operational
  worth — "which SKU was this last March" — but the same applies to role
  changes and profile edits. If it is needed, it is a payload column on
  `audit_log` with a rule about what may go in it, not a JSON history column on
  each table that needs it.
- **Product list pagination.** `GET /v1/products` returns everything, unsorted
  beyond name. Fine at ten products, wrong at two thousand. Keyset pagination
  is the pattern (ADR-018), but products sort by name rather than by a unique
  time-ordered id, so the cursor has to be `(name, id)` compared as a row —
  `name >= last and id > lastId` silently skips rows sharing a name. Build it
  with the filters, once the client shows which filters matter.
- **Routing and operations.** A BOM says what goes in, not what is done to it —
  mix for twenty minutes, then encapsulate, then a QA hold. Real for a
  manufacturer, meaningless for a brand that outsources, and the reason
  `bom_lines` has no sequence column: ordering ingredients is not the same as
  ordering steps, and a `line_no` used for the second would be the wrong
  mechanism arriving quietly. Its own table when someone needs labour or machine
  time.
- **Scrap and yield loss.** A recipe consumes 2.4 kg and loses 3% to the
  equipment. Either a percentage on the line or a lower `output_quantity` — the
  second is free today and a lie in a costing report, since it hides loss inside
  the recipe. A column on `bom_lines` whenever costing or a variance report
  needs to tell the two apart.
- **Substitute components.** The same label from either of two suppliers. A
  self-reference on `bom_lines` (`substitute_for_id`) or a small child table;
  the real question is whether a substitution at release is a line edit or a
  recorded event, which is a traceability question, not a schema one.
- **By-products and co-products.** One run yielding two outputs — a trim, a
  grade B, a recovered solvent. `production_orders` has one
  `output_variant_id` and would need output lines to carry more, which is a
  shape change rather than a column. Deferred until a real second output exists;
  guessing produces a table where every run has exactly one output row.
- **Phantom assemblies.** A blend that exists as a recipe but is never stocked:
  the exploder should see through it to its components rather than expecting a
  balance. One boolean on `boms`, and the reason to wait is that a blend that is
  genuinely never held is indistinguishable from one nobody has counted yet.
- **BOM cost rollup.** What a finished unit should cost from its recipe,
  priced at current component costs. ADR-048 records what each batch
  actually cost; a rollup from the recipe is a standard cost, which ADR-048
  rejects for now, and it is useful mainly for quoting a product before it
  is first made. Outsourced runs complicate it further: their cost arrives
  inside the manufacturer's invoice price rather than from a rollup
  (ADR-030), so the two paths give different numbers for the same SKU.
- **The manufacturing fee on an outsourced run.** A co-packer charges for the
  work, and that charge is neither a component nor part of the output's stock
  value today. A purchase order line against them for a service variant is the
  cheap version; doing it properly means landed cost, which is costing again.
- **Production order numbering.** `id` is a UUIDv7 and nobody says one aloud.
  Runs need a human reference the way lots do, and the same scheme question
  applies — see the lot code entry above, and answer both at once or they
  diverge.
- **"How many can I make", and from where.** The arithmetic is free —
  `bom_lines` joined to `stock_levels`, on-hand over per-unit quantity, take the
  smallest, external lines excluded. Two things are not decided. **Scope:** one
  site or everywhere, since material at a co-packer counts toward a run there
  and not toward one in our own building. **Explosion:** whether the count stops
  at what is on hand, or walks down — "no blend, but enough of the blend's
  inputs, so really 400". Both are legitimate and they give different numbers,
  so the screen has to say which it means.
- **Partner sites collide with our own on `locations_org_root_code_key`.** A
  partner site is a root, so it shares the `(organization_id, code)` scope with
  our warehouses: our `MAIN` and a co-packer's `MAIN` cannot coexist. Safe to
  leave, because loosening a unique index later is free — no data can have
  violated it. The fix when it bites is splitting that index into two partials,
  `(organization_id, code)` where `partner_id is null` and
  `(organization_id, partner_id, code)` where it is not, giving each partner its
  own namespace. Prefixing codes (`ACME-MAIN`) costs nothing meanwhile.
- **Scrap and overage are the same arithmetic for different reasons.** The scrap
  entry above covers cutting waste, evaporation, and offcuts. Nutraceutical
  overage — extra active dosed in so the product still meets label claim at end
  of shelf life — is arithmetically identical and regulatorily distinct. One
  column cannot report on them separately. Decide whether that reporting is ever
  needed *before* naming the column, since `scrap_percent` leans one way and
  `quantity_factor` covers both.
- **Duplicating a partially received order.** Rejected in ADR-031 because
  duplicating the whole thing re-orders what already arrived. Copying only the
  shortfall is a backorder: a different operation, probably its own action, and
  it needs a rule for what happens to the original line. Downstream of the
  partial-line cancellation entry.
- **If apparel is ever a target, two deferrals move to the front.** Matrix BOMs
  (five sizes in four colours is twenty recipes differing by one number, since
  consumption varies by size) and multi-output runs (one cutting run yields
  several sizes from a single marker). Both are listed above as ordinary
  deferrals; for cut-and-sew they are prerequisites, not refinements. Furniture
  and machining hit neither.
- **Purchase pack versus stock unit.** A supplier sells a 25 kg drum, stock is
  kept in grams, and receiving means multiplying. This is where unit conversion
  will actually arrive — before recipes ever need it. The shape is worth
  recording now even though the work is deferred: two suppliers of the same
  extract sell different pack sizes, so the factor belongs to the pairing of
  partner and variant, which is a table, not a column on `product_variants`.
  That is the wrong guess most people make, this entry included until it was
  checked.
- **Compliance is its own domain, and this is the line.** `product_licences`
  records which registration a formulation is made under, because that is
  history and cannot be backfilled (ADR-029). Everything else — registrations per market,
  amendment and submission history, renewal dates, label versions, certificates
  of analysis, a co-packer's site licence, a licence held by someone else under
  private label — is a table set, and designing it
  without a real regulatory workflow in front of you produces something that
  gets rewritten. The trigger to build it is a second licence for one product,
  or a second market. Note also what the label is *not*: medicinal quantity per
  dose is declared, while a BOM line is what goes into a batch, and the two are
  related by lot potency. Nothing should derive one from the other.
- **Propagating a cost correction through production.** ADR-048 revalues what
  remains and records a variance for what has gone; a batch that consumed
  mis-priced stock keeps the cost it closed with. Propagating means
  re-running each affected close and correcting its output lots, recursively,
  which is Dynamics' "adjust cost" job and needs a rule for batches already
  shipped. Trigger: a correction large enough that a batch's recorded cost
  misleads a pricing decision.
- **Period close.** Nothing yet refuses a valuation dated into a month
  already reported. A `closed_through` date on the organization, checked on
  every posting, with corrections landing in the open period. Trigger: the
  first month reported from these figures.
- **Variance reporting is a query, not a table.** The audit log answers "what
  happened to this run"; it cannot answer "every run that ran over plan last
  quarter". Both quantities sit on `production_order_lines`, so that report is
  arithmetic over existing columns and needs no stored number. Worth building
  when someone asks for it; worth not storing either way, because a maintained
  total drifts and a computed one cannot.
- **Notifications: two callers now, and still no domain.** A run closed with a
  variance past threshold (ADR-032) and an order line closed short (ADR-034)
  both detect something worth telling somebody about, and both currently only
  say it in the response and the audit entry — which reaches whoever happened
  to click the button.

  The shape is one table, one row per recipient, with read state: `user_id`,
  `type`, `resource_type`, `resource_id`, `read_at`. Targeting by permission to
  start — anyone holding `production.complete` gets the variance — because
  targeting by involvement needs `created_by` to mean "owner", which it does
  not, and targeting by subscription is its own feature.

  Two other candidates are absences rather than events: an expected date passed
  with the order still open, and a run that cannot be released for want of
  material. Both need something looking on a schedule, which is a cron and a
  rule about what happens when it does not run — considerably more than the
  table, and worth separating from the two that are already detected.

  A toast is not this. A toast confirms what you just did and needs no storage;
  the bell holds what somebody else did. Conflating them is the usual mistake,
  and the toast is buildable today with no schema at all.
- **Micro-dose units are a data-entry convention nothing enforces.**
  `numeric(18,4)` is exact only if the unit is right: 50 mg held in kilograms is
  0.00005 and truncates, held in grams it is 50 and does not. Lines inherit the
  component variant's `unit_of_measure`, so the decision is made once per
  variant at creation and is invisible afterwards. No constraint can catch it —
  the defence is seed data and review.
- **Unit display preference.** Storage is grams and millimetres, always
  (ADR-023). Showing pounds and inches is formatting, not conversion, and
  arrives as a function next to `relativeTime` plus a setting — but where the
  setting lives is the real question: per user reads naturally until a
  Canadian org quotes a US carrier and the two disagree about whose preference
  the printed document should use. Distinct from unit-of-measure conversion
  (cases to eaches), which is arithmetic on quantities rather than display.
- **Pallets and license plating.** "Pallet 3 in Bin 5" is two different things
  depending on the operation. A pallet that sits in a bin and never moves as a
  unit is a label; one that gets driven to another warehouse with everything on
  it is a container, and a license plate — an identifier attached to a set of
  stock rows — is what makes that one operation rather than forty. Both are
  real, and which you need depends on how a given warehouse works. Additive
  when it arrives: a `containers` table and a nullable `container_id` on
  `stock`, which does not invalidate existing rows. Deliberately absent from
  `LOCATION_TYPES` — a pallet moves, and a movable thing in a fixed tree is how
  the tree stops meaning anything.
- **Location capacity.** A nullable `capacity` column on `locations` costs
  nothing; enforcing it is the hard part. Capacity in units of what — eaches,
  cases, pallet positions, cubic millimetres? Does a pallet holding 500 units
  count as 1 or 500? And quarantined stock occupies space physically, so it
  counts, which means the check cannot simply filter on `is_available`. Not
  worth a column until there is an answer to what to do with it.
- **Barcodes.** One variant carries several — a UPC on the bottle, an EAN for
  Europe, a supplier's own code, an inner-case GTIN — so a column forces one
  and the workaround is a comma-separated string. Its own table,
  `(variant_id, code, type)`, unique on `(organization_id, code)` because
  scanning must resolve to exactly one variant. Build it when something scans,
  which is receiving or picking, so it arrives with stock movements.
- **Category and brand.** Tables, not text columns: "Supplements" typed twelve
  ways is twelve categories and nothing filters. Categories nest — Supplements
  → Vitamins → Vitamin D — which is the same self-referencing shape as
  `locations`. Both nullable foreign keys on `products`. Build it when a list
  is long enough that scrolling is annoying, which is also when the categories
  will be known rather than guessed. "Series" is deliberately not on this list:
  it means a product line, a collection, or a numbering scheme depending on who
  says it, and a field that vague gets used for all three.
- **Bulk create and CSV import.** Single-row creation is enough while catalogues
  are typed in by hand. The hard part is not the insert but partial failure:
  twenty rows and one duplicate SKU — reject all, or land nineteen and report
  the one? Both are defensible, they need different response shapes, and
  choosing without a real import to test against is a guess that gets baked
  into an endpoint. The forcing function is a supplier catalogue arriving as a
  file, which brings its own UX anyway — column mapping, a preview step, an
  error report someone can act on — so the semantics will be obvious by the
  time there is something to build them against. Seeding in tests loops over
  the single-row endpoint and is not the same problem.
- **Whole-unit enforcement.** `numeric(18, 4)` lets 0.5 of a paperclip be
  stored (ADR-025). Refusing that needs a per-variant rule keyed on
  `unit_of_measure` — "each" is discrete, "kg" is not — which is the same
  mapping unit-of-measure conversion will need in order to buy cases and stock
  eaches. Building half of it now means guessing at the half that matters, so
  both wait for the module that forces them.
- **A dashboard at `/`.** The placeholder Home screen was removed and `/` now
  redirects to `/products`, because a page whose only content was "you are
  signed in" was not earning a route. What belongs there — low stock, recent
  movements, pending receipts — is all downstream of the stock layer, so the
  redirect stands until there is something worth showing.
- **Search and the lookup in the top bar** — settled by ADR-056; sorting on
  the lists by ADR-057. One box that takes a lot code, an
  order or invoice number or a SKU, and search and sorting on the lists:
  Products and Partners have neither, so finding one of a few hundred means
  Load more. Needs search parameters on each list endpoint that fit keyset
  paging, a choice between `ILIKE`, trigram indexes and full-text search, and
  ADR-051 budgets for them. Search is on the README's deliberately deferred
  list, so this reopens it. ADR-055 leaves the slot beside the logo empty
  until then. Trigger: Products or Partners past a few hundred rows, or the
  recall drill missing its two minutes.
- **Branding per organization.** Each organization sets its own logo and
  accent over ADR-055's brand tokens, and its own expiry thresholds (30 and 90
  days by default). The logo: PNG or WebP, at most 500 KB and at least 256px
  wide, previewed on light and dark before saving; SVG only if cleaned on the
  server, since an SVG can carry script; a version for dark backgrounds, or
  the white plate ADR-055 uses meanwhile. The colour: a few tested presets,
  and a custom colour checked for contrast with white text and saved as the
  nearest shade that passes rather than refused, with a warning when it is
  close to the red, amber or green of the status tones. The sidebar's shade.
  Whether the logo prints on the organization's invoices and credit notes,
  which changes paper (ADR-041, ADR-046). The logo is stored as ADR-059
  says: a PNG, re-encoded on the server, an SVG drawn to PNG and never kept.
  Trigger: the second organization with real users, or the first that asks.
- **Generated lot codes for production runs.** ADR-023 argues against generating
  SKUs because the organization already has one for every item. A lot code is
  different: it does not pre-exist, it comes into being at the moment of a run,
  and most manufacturing systems issue it from a scheme — date plus line plus
  shift, or a sequence. Typed by hand for every run is how two runs end up
  sharing a number. Receiving from a supplier stays typed, because that code is
  printed on the box and is not ours to invent. The forcing function is a
  production module; until one exists there is no run to hang a sequence off.
- **Performance budgets.** No bundle-size gate and no timing assertions. ADR-021
  already accepted MUI's weight on the grounds that this sits behind a login
  wall where first paint is not a conversion metric, and a threshold nobody
  chose against a bundle nobody has complained about is a gate that gets
  disabled the first time CI is slow. Chrome DevTools and the React profiler
  are the tools when something feels slow; the likely first trigger is the
  stock table at a few thousand rows, where the answer is pagination rather
  than a smaller bundle.
- **What a site is for.** `type` says where a location sits in the tree, not
  what happens there — an office, a shop, and a 3PL are all `site`. Recording
  purpose will matter for rules like "do not ship to customers from the office"
  and for per-site addresses, and both arrive with the modules that force them.
  It stays a nullable label when it comes, never a branch: the moment a query
  filters on it or a second table appears for one kind of site, a cheap column
  becomes an expensive shape.
- **Counting a shelf.** The movement endpoint takes a delta — "remove 3" — but
  a cycle count is a total: "I counted 45." Converting one to the other in the
  client means reading the balance and subtracting, and if anything moves in
  between the correction lands on a number nobody counted. The fix is an
  optional `expectedQuantity` on an adjustment, compared inside the transaction
  after the row lock and answered with a 409 on mismatch — an ETag by another
  name. Deferred because the response shape is a guess until a counting screen
  exists to receive it. The trigger is the first stocktake.
- **Reopening a closed order.** Received and cancelled are terminal
  (ADR-027), so a mistake means retyping. Real systems answer this with
  "copy to new order" rather than un-cancelling — the history stays honest
  and nobody retypes. Build it when cancelling by accident actually stings;
  until then the workaround is raising a new order by hand.
- **A run with no BOM can be planned but not released.** `production_orders.bom_id`
  is nullable because a rework, a trial batch, and a sample are real runs with no
  recipe behind them — and those are the runs that later become recipes. But
  release copies lines from a BOM, so a run without one has nothing to issue and
  nothing to consume, and it currently dead-ends: plan it, cancel it, nothing
  else. The fix is letting release take explicit lines in its payload, which is
  a shape nobody has asked for. Worth doing the first time somebody needs to
  record a rework against stock rather than adjusting it by hand.
- **Reservation, and whether the window it protects actually exists.** ADR-023
  left `available = on_hand − reserved` open. Production makes it look urgent
  and then partly answers it: release *transfers* components to the run's
  location (ADR-032), so from that moment they are physically out of the pick
  face and no shipment can take them. Reservation therefore only protects the
  window between planning and releasing, which for same-day work barely exists.
  Watch the screen in use before building anything.

  If it is needed, the shape is settled. Rows in their own table — item,
  location, demand document, quantity — never a `reserved` column on
  `stock_levels`, which is the maintained running total ADR-023 rejected for
  quantity itself; rows also answer "who reserved this", which is what someone
  asks when a pick fails. Reserve at release, not at plan: a draft is a wish.
  Warn rather than block, for the variance reason — the physical pick already
  happened.

  Reserving at plan time is the variant worth taking if planning is days ahead,
  and only with an `expires_at` set at plan time. Reservations otherwise
  accumulate: six runs planned, two released, four holding material forever
  because nobody cancels a plan they abandoned. Expiry belongs in the
  availability query (`expires_at > now()`), not a scheduled sweep — a cron
  that flips rows to expired is a second source of truth that can lag, and if
  it fails silently the material stays fenced off with no sign why. A sweep is
  housekeeping, never the mechanism.

  Two things to answer first. What sets the window: the honest anchor is the
  run's planned date, which `production_orders` does not have, so it needs a
  `planned_for` column. And what a lapsed reservation means for a run still in
  draft — the plan does not cancel itself, so the UI has to stop showing it as
  ready.

  The warning half needs no notifications domain: expiry shown on the run in
  the production list, and a release-time message when it has already lapsed,
  which is the moment it matters.
- **Shortfall warning at release.** Cheaper than reservation and catches the
  actual failure: "this run needs 1200 g, 800 is at the shelf." A read query
  against existing data, no schema. Probably the first thing to build if
  shortfalls turn out to be the real problem rather than contention.
- **A price cannot be removed from a line, only changed.** A blank field on
  edit means unchanged, not cleared: omitting the field is the only thing the
  route can express, and inventing "empty means clear" would make the two
  indistinguishable. Zero is not a substitute — it means free, which is a real
  and different claim, and it would keep the line counted in the order's
  totals and in totalsComplete. JSON can carry an explicit null if this ever
  needs fixing, so it is a small change rather than a shape one. The trigger
  is somebody entering a price on the wrong line and wanting it gone rather
  than corrected.
- **The audit log records that something changed, never what.** The
  interceptor captures no request body, deliberately — POST /v1/users carries a
  password, and pino's reason for redacting it applies twice as hard to a row
  kept for 24 months (ADR-012). `payload` is opt-in per route, so
  "order.updated" was the whole entry: the actor, the resource, the time.

  That answers "who changed this order" and not "what did they change it
  from". The second question arrives with a dispute — a reference edited after
  receipt, a quantity amended on a confirmed order — which is exactly when the
  answer is wanted and gone.

  Recording before and after is not free. It roughly doubles the log, and half
  of what would be captured is field values that have no business sitting in a
  two-year table: a note, a contact's phone number, eventually a price somebody
  considers confidential. A per-route allow-list of fields is the shape that
  works — `@Audited({ fields: ['reference', 'expectedAt'] })` — since it keeps
  the decision at the route, where somebody can see what they are committing to
  retaining.
  **Now partly answered.** The service records what a field was, through
  async-local storage the interceptor reads, so the four annotated routes carry
  `{ from, to }` where a previous value was recorded and a bare value where it
  was not. Deliberately not normalised: a route reporting no previous value
  should not be indistinguishable from one whose previous value was null. It is
  per-route and forgettable — a second thing the coverage test does not check —
  but it covers the fields where the old value is otherwise unrecoverable.

  **Worth correcting an earlier claim here.** ADR-024 and ADR-025 rejected
  *business rules* in SQL — a cycle check, a quantity calculation — because
  logic in the database is invisible to a TypeScript test suite. An audit
  trigger decides nothing; it copies OLD and NEW into a row, and that objection
  does not reach it. Triggers are open on their merits rather than excluded.

  **The ceiling, if it is ever needed.** Trigger-based row history on the four
  or five tables that matter, sitting beside `audit_log` rather than replacing
  it — one says who did something, the other says what the row was. The reasons
  to wait are ordinary: a trigger per table, regenerated on every schema
  change, and no question yet that the current shape cannot answer. The forcing
  function would be one it cannot: "what did this row look like on 3 March", a
  regulator, or a dispute with money attached. Note that movements already are
  that history for quantities, and the SKU, ship-to and recipe snapshots are
  point-in-time history for the documents that needed it, decided case by case.

  **And searching is still not built, deliberately.** GIN on a column that is
  null in most rows costs write time to serve a query nobody runs weekly, and
  the keys here are fixed by the allow-list rather than unpredictable — so when
  a question does arrive, a partial expression index on that one key
  (`((payload->>'sku')) where payload ? 'sku'`) is smaller and cheaper than
  GIN. Volume is answered by monthly range partitioning, not a cleverer index.
- **Quantity breaks on price lists.** ADR-049 snapshots a list price onto a
  line when it is added, so a break — a lower price from 12 up — would need
  re-resolving when the quantity changes, which is the re-pricing ADR-049
  rejects. Options: resolve at confirm instead of at add, or an explicit
  "Use list price" after changing a quantity. Trigger: a customer on case
  pricing.
- **Dated prices.** A price change prepared in December to take effect in
  January. ADR-049 applies a change when it is saved and leaves the old
  price to the audit log. A `valid_from` on list items, with the latest
  on or before the order's date winning, is the likely shape. Trigger: the
  first price change that must be entered ahead of time.
- **Which margin to show first.** Estimated margin on sale order lines (price
  against current pool cost, while pricing) or actual margin per invoice
  (revenue against the shipped lots' valuation rows, after the fact). Both
  are derivable from existing data (ADR-049 amendment); neither needs a
  migration. Trigger: the first pricing decision or margin question someone
  actually asks, which says which of the two.
- **A security review before real customers.** What is built covers the
  application: hashed tokens, rate limits, tenant isolation tested per
  lookup, an audit log, TLS from the host. What is not decided: two-factor
  sign-in (at least for Owners), dependency scanning on every PR rather
  than an occasional `npm audit`, how secrets are rotated, and what the
  host encrypts at rest. Trigger: the same as backups.
- **Reports.** Which questions the business asks every week or month — stock
  value by location, what expires in 90 days, purchases by supplier, sales
  by customer, run variances — and where they are answered: SQL behind a
  report page, an export to a spreadsheet, or both. The data for most exists
  already. Trigger: the first question somebody asks twice. *A dashboard
  at `/`*, above, would show the answers that need watching daily.
- **When someone is away.** Approvals and notifications go to one person
  today. Out of office means either a delegate who acts for them for a
  period, or work routed to a role instead of a person. Staff leave as a
  record (holiday balances) is an HR system's job, not this one's.
  Trigger: the first approval that waits on someone on holiday.

---

# Resolved

| Decision                               | Outcome                                               | ADR              |
|----------------------------------------|-------------------------------------------------------|------------------|
| ORM: Prisma vs. Drizzle vs. Knex       | Drizzle                                               | ADR-009          |
| Primary key strategy                   | UUIDv7 on `uuid` column                               | ADR-010          |
| PostgreSQL version                     | 18 (for native `uuidv7()`)                            | ADR-002, ADR-010 |
| Session strategy                       | Opaque token in httpOnly cookie, no JWT               | ADR-011          |
| Account deletion vs. audit retention   | Anonymize user, retain audit rows                     | ADR-012          |
| Data ownership on user departure       | Org owns data, user attributed                        | ADR-012          |
| API versioning                         | URL prefix `/v1/`, global, from first endpoint        | ADR-013          |
| CSRF defence                           | Custom header, no token                               | ADR-014          |
| Concurrent sessions per user           | Multiple; login revokes only the presented session    | ADR-015          |
| Permission resolution                  | Per request, never cached                             | ADR-016          |
| Audit write path                       | Interceptor, opt in per route, writes only            | ADR-018          |
| Audit pagination                       | Keyset on UUIDv7 cursor                               | ADR-018          |
| Dependency upgrades vs. peer conflicts | Never override; a blocked upgrade waits               | ADR-019          |
| Client route protection                | Three categories: protected, auth-only, public        | ADR-020          |
| Component library                      | Material UI, CSS variables, three color modes         | ADR-021          |
| Auditing account actions               | Separate account_events table, 90-day retention       | ADR-022          |
| Inventory stock granularity            | Variants carry stock; quantity is a ledger            | ADR-023          |
| Address and contact ownership          | Shared tables, exclusive arc FK                       | ADR-028          |
| Bill of materials shape                | Header plus lines; nesting is data, not schema        | ADR-029          |
| BOM versioning                         | Version on the header, history by snapshot at run     | ADR-029          |
| Regulatory registrations               | product_licences registry, referenced by the BOM      | ADR-029          |
| Who supplies a component               | `supply_type` on the line; actual on the run          | ADR-030          |
| Outsourced manufacturing               | `partner_id` on the run; external lines move nothing  | ADR-030          |
| A run's output lots                    | Read from the ledger, not stored on the run           | ADR-030          |
| Amending a wrong, confirmed order      | Duplicate to a draft, then cancel the original        | ADR-031          |
| What a duplicate copies                | Re-resolves snapshots; never copies frozen ones       | ADR-031          |
| Finishing a run that spans days        | Output repeats; closing is explicit and terminal      | ADR-032          |
| Planned vs actual consumption          | Consume at close with actuals; variance computed      | ADR-032          |
| Consumption over plan                  | Warn and record; never block a real event             | ADR-032          |
| Which lot a day's output joins         | The run's open lot by default; over-recall is safe    | ADR-032          |
| Where a run picks components from      | source_location_id per line, set at release           | ADR-032          |
| Editing an order line                  | Editable until something depends on it                | ADR-033          |
| Cancelling part of an order            | Line closed short with a reason, quantities kept      | ADR-034          |
| Price on a purchase order              | unit_price and currency per line; subtotals not total | ADR-035          |
| Where cost is recorded                 | Append-only valuation ledger beside the movements     | ADR-048          |
| Valuation method                       | Weighted average per pool; the pool is the lot        | ADR-048          |
| Cost of a batch                        | Its consumption values, posted to output at close     | ADR-048          |
| Base currency and exchange rates       | On the organization; a dated rate table               | ADR-048          |
| Licence status at release              | An organization policy; overrides kept on the run     | ADR-050          |
| Performance testing                    | A volume seed, budgets per endpoint, plan checks      | ADR-051          |
| Storing a calendar day                 | `date`, sent as `YYYY-MM-DD`; strictness configurable | ADR-052          |
| Backups and restores                   | Encrypted nightly dump at another provider, drilled   | ADR-053          |
| Language of the app                    | Per person; FormatJS ids, English the fallback        | ADR-054          |
| Language of printed documents          | One or two languages; partner's, else organization's  | ADR-054          |
| Look and layout                        | Two-layer tokens; side rail; tabs kept in the address | ADR-055          |
| Status colours and expiry              | Five tones in one table; days left within 90 days     | ADR-055          |
| Money on an order                      | Labelled before or with tax; totals from the server   | ADR-055          |
| Product names in other languages       | Translation rows; required languages per organization | ADR-054          |
