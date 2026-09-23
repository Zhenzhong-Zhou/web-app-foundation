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

# Open decisions

Questions land here before they are promoted to an ADR. None of these block V1;
they exist so the reasoning is not rediscovered from scratch.

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
- **BOM cost rollup.** What a finished unit costs from its components, which
  needs component cost first — and costing (batch, moving average, FIFO) is
  already open from ADR-023. Outsourced runs complicate it further: their cost
  arrives inside the manufacturer's invoice price rather than from a rollup
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
- **Capture unit cost at receipt, before deciding anything about costing.**
  Half done: `order_lines.unit_price` exists (ADR-035), so what was agreed is
  recorded. What is still missing is carrying it onto the lot at receipt, which
  is what everything downstream reads. A purchase price is known when stock
  arrives and unrecoverable afterwards — same class as licence history: cheap
  now, impossible to backfill, and independent of which costing method
  eventually wins.
- **Per-batch cost, and which method values it.** With actual consumption
  (ADR-032) two batches of one product genuinely cost different amounts, so
  actual and standard costing diverge here specifically; outsourced runs give a
  third answer again, since their cost arrives inside the manufacturer's
  invoice rather than from a rollup. The test for whether it is worth building
  is whether a batch costing 8% more would change a decision: "I would look
  into why" is already answered by the variance report, for free, from two
  columns; "I would reprice" needs real per-batch cost.
 
  The chain is price on the order line (ADR-035) → cost on the lot → cost of a
  run → cost of a unit. The first link exists. The second is `lots.unit_cost`
  and a currency written at receipt from the order line, which is small — and
  blocked on the method, because stock is not one lot. Receive 1000 at 0.25,
  then 1000 at 0.30, and consume 1500:
 
      FIFO             1000 at 0.25 and 500 at 0.30. Matches physical flow.
      Weighted average all 1500 at 0.275. Simple, and cannot say which batch
                       cost what.
      Standard         a set figure with the difference posted to variance.
                       What most manufacturers do, and it needs the variance
                       machinery to mean anything.
 
  Each gives a different number for the same physical facts, and switching
  afterwards means revaluing history, because past consumptions were valued
  under the old rule.
 
  Lot-level costing is the cheap one here and falls out of work already done: a
  consumption movement already names its lot (ADR-023), so the cost is on that
  lot and FIFO is nearly free. The traceability built for recalls pays for the
  costing. What still needs a rule is a lot received across two purchase orders
  at different prices, or topped up after the fact.
 
  Deciding needs real receipts. If prices barely move, weighted average is fine
  and nobody notices; if they swing — herbs and botanicals do — the method
  changes the margin. A few months of data answers it; guessing now means
  revaluing later.
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