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

```text
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

**Amendment (October 2026) — several roles to a member (ADR-080).** A
membership holds one or more roles, each a row of `membership_roles`, and
may do whatever any of them allows; `memberships.role_id` is gone (migration
0073). Owner stands alone. Organizations make roles of their own; Owner,
Admin and Viewer stay fixed.

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

**Amendment (October 2026) — invitations (ADR-077).** Registration is no
longer the only way in: a person joins an existing organization by
invitation, and Add member, with a password someone else chose, is gone.
Invitations did touch the schema: a token cannot carry a role.

**Amendment (October 2026) — registration by invitation ([ADR-078](#adr-078--registration-open-or-by-invitation-amends-adr-006-adr-070-and-adr-077)).**
Self-serve registration is now a setting, `REGISTRATION`. Production is by
invitation: a new organization comes from an organization invitation the
operator issues, and its first Owner is whoever accepts it.

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

> **Amended by [ADR-069](#adr-069--deleting-your-account-and-leaving-an-organization-amends-adr-012).**
> An organization's only member is not deleted with it: they cannot delete their account while it exists. The export is the person's own data, not the rows they authored, which belong to the organization. Everything else stands.
>
> **Amended by [ADR-070](#adr-070--deleting-an-organization-amends-adr-012-adr-059-and-adr-069).**
> An organization is deleted with every row it owns, its audit log included: deleted on purpose by the one path that deletes an organization, not anonymized and kept, since the business keeps its records through the export. The audit log's `RESTRICT` stays, so nothing else can delete it.

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

> **Amended by [ADR-081](#adr-081--old-tabs-after-a-deploy-a-newer-build-noticed-an-outdated-client-told-amends-adr-013-adr-051-adr-052-adr-054-adr-055-and-adr-068).**
> Within `/v1`, a change that breaks the app's own client raises the API revision, which the client sends as `X-Api-Revision` and the server checks first; `/v2` stays for a break an outside program would meet. Everything else stands.

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

**Amendment (October 2026) — the exemption list is not closed; it lives in the lint
config.** The list above grew three times without this ADR saying so:
`core/notifications`, scoped by recipient, since an account notification may belong to
someone in no organization (ADR-036); the files purge (ADR-059); and the licence
reminders (ADR-064), the last two each going through every organization in one hourly
pass with no request behind it. The lint rule also covered only the folders it named,
so `modules/`, and later `common/`, went unchecked by default.

The rule now refuses `UNSAFE_GLOBAL_DB` and `PG_POOL` across `server/src/`, and its
exceptions are listed once, in `server/eslint.config.mjs`, each with its reason. Two
joined only because the wider rule reached them: `src/database/`, where the handle and
`TenantDb` are defined and the seeds run, and the health check's ping of the pool.

A new exception is acceptable only where there is no tenant to scope to: work that runs
before any organization is known, reads data that has no `organization_id`, or goes
through every organization with no request behind it. Anything with a tenant uses
`TenantDb`, and `TenantDb.transaction()` for a global and a scoped table together. A new
exception adds its line and its reason to that file, and nothing else lists them.

**Amendment (October 2026) — each permission gates what it says
(ADR-079).** A member's role is changed with `roles.assign`, and the roles
list is read with `roles.view`. `users.update`, which then gated nothing,
was dropped by migration 0071: a seeded permission that gates nothing
goes, rather than waiting for a feature to need it.

**Amendment (October 2026) — the role hierarchy (ADR-080).** Permissions are
still read on every request, through one service in `core/authorization`,
from a membership's roles added together. The hierarchy this ADR left open
is a comparison of permissions: a role is given, and a member changed or
removed, only by someone whose roles hold everything it grants, and its
three Owner rules keep their words. Every change that can take away an Owner
counts the Owners under one lock.

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

> **Amended by [ADR-082](#adr-082--the-products-brand-panivo-before-sign-in-the-organizations-after-amends-adr-019-adr-051-adr-055-adr-060-and-adr-081).**
> An override that takes a patched release of the same major, under a package that pins the vulnerable release exactly, is allowed as js-yaml's was: multer 2.5.0 under `@nestjs/platform-express` 12.2.0. It hides no peer conflict, and goes once the package depends on the fix.

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

| Upgrade             | Blocked by                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Unblocks when                                                                                                                                                     |
|---------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `@nestjs/*` 11 → 12 | `@nestjs/throttler@6.5.0` peers at `^11.0.0`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Cleared by ADR-067: throttler 6.7.1 accepts `^12.0.0`, and the server runs Nest 12                                                                                |
| `typescript` 6 → 7  | As of 21 October 2026: `typescript-eslint@8.72.0` peers at `<6.1.0` ([typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940)); `@nestjs/cli@12.0.10` depends on `~6.0.2` ([nest-cli#3479](https://github.com/nestjs/nest-cli/issues/3479)); `@nestjs/swagger@12.0.2` peers at `^5.5.0 \|\| ^6.0.0` ([swagger#4002](https://github.com/nestjs/swagger/pull/4002)), and its plugin is a transformer inside `nest build`; the Go port's support for `emitDecoratorMetadata`, which Nest requires | Realistically TypeScript 7.1 stable, whose API those tools need, plus new releases of all three — then verify the decorator support explicitly, not by assumption |

Being on a supported release line is the goal; being on the newest major is
not. `11.2.3` is current for the 11 line, and a non-empty `npm outdated` is not
a defect.

Corollary: check peer ranges *before* installing — `npm view <pkg>
peerDependencies` — rather than letting npm discover the conflict. Throttler is
what blocks Nest 12 today; the next major may be blocked by something else.

*Amended by ADR-067 (October 2026):* throttler 6.7.1 and nestjs-pino
5.3.1 accept Nest 12, so the table's first row no longer holds. Nest 12,
with intl-messageformat 12, now waits on the server's tests leaving
Jest, which ADR-067 decides. TypeScript 7 is also held by ts-jest (`<7`,
gone with ADR-067) and by the Nest CLI, which needs TypeScript 7.1's
programmatic API.

*Amended (20 October 2026):* the table's TypeScript row brought up to
date, and the Nest row kept, marked cleared. The client's one override,
`js-yaml` 4.3.2 under `@hey-api/json-schema-ref-parser` (commit
7a24f8d6), is not the kind this rules out: the ref-parser pins js-yaml at
exactly 4.2.0, which has three high advisories, and the override takes a
patched release of the same major, so it hides no peer conflict. It goes
once the ref-parser's own dependency is 4.3.2 or later.

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

```text
products          id, organization_id, type, name, description
product_variants  id, organization_id, product_id, sku, name, unit_of_measure,
                  tracks_batches, weight_grams, dimensions, case_quantity
                  unique (organization_id, sku)
batches           id, organization_id, variant_id, code, expires_at, received_at
                  unique (organization_id, variant_id, code)
locations         id, organization_id, name, type, parent_id
stock             variant_id, location_id, batch_id, quantity
stock_movements   append-only; see below
```

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

```text
stock_movements   id, organization_id, variant_id, batch_id,
                  from_location_id, to_location_id,   -- null marks direction
                  quantity,                            -- always positive
                  reason, reason_detail,
                  reference_type, reference_id,
                  note, actor_id, created_at
```

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

```text
locations  id, organization_id, name, code, type, parent_id,
           is_available, is_active
```

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

```text
partners  id, organization_id, name, code, tax_id, notes, is_active
          unique (organization_id, code) where code is not null
```

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

```text
orders       id, organization_id, partner_id, direction, status,
             reference, expected_at, note, created_by
order_lines  id, organization_id, order_id, variant_id,
             sku,                       -- snapshotted, as movements do
             quantity_ordered, quantity_fulfilled
```

A purchase order and a sales order are the same shape mirrored: a partner,
lines of variants, one direction, fulfilment that moves stock. That symmetry is
what makes one table honest rather than convenient — the columns mean the same
thing in both cases, read from the other side.

**Direction is a column, not a table.** `purchase` and `sale`, closed set,
check constraint. A lookup table earns its place when rows are added at runtime
or carry attributes; these do neither, and a join to read a word costs every
query. Same precedent as `products.type` and `stock_movements.reason`.

**Decision — status is the document's lifecycle, never fulfilment progress.**

```text
draft → confirmed → received
                ↘ cancelled
```

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

```text
boms       id, organization_id, output_variant_id, output_quantity,
           version, status, notes
bom_lines  id, organization_id, bom_id, component_variant_id,
           quantity, supply_type, notes
```

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

```text
add a line       draft only
change quantity  draft or confirmed, refused once anything is received
remove a line    draft only, and never the last one
```

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

```text
(unit_price is null) = (currency is null)
```

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

**Amendment (October 2026) — prices on orders (ADR-080).** A line's price,
an order's totals and its tax reach only whoever holds `orders.view_prices`;
the server sends them to nobody else. An order's invoice money follows
`invoices.view`.

---

## ADR-036 — A notification belongs to a person, not a tenant

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

*Amended (#28):* a top-up continues the lots release issued from the same
source, picked by hand or not, earliest expiry first among them, and only
then opens the next to expire. A run given lot NEVER by hand at release is
topped up from NEVER, not from whatever expires soonest.

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
unheld stock, and so may a run's top-up at close, which takes from the shelf
as release does (#28). Adjustments and transfers are not checked: they record what
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

**Amendment (October 2026) — an invoice that charges tax needs the
seller's tax number.** The tax number stayed optional so that a business
not registered for GST/HST, which has none, could still invoice. But such
a business charges no tax either, and a business that charges tax is
registered and has a number: in Canada, an invoice of $100 or more must
show it for the customer to claim the input tax credit (the Input Tax
Credit Information Regulations). So issuing is refused while the
organization has no tax number and the invoice charges any tax, with the
code `organization_tax_number_missing` and the same link to Profile as a
missing address (ADR-061). An invoice with no tax, every line exempt or
zero-rated, issues without one, as before. Every invoice, not only those
over the threshold: the number is the seller's, not the amount's, and a
rule with a figure in it is one more thing to keep up with the law.
Credit notes copy the invoice's seller, so they are unaffected.

*Deferred — tax profiles by country, with what brings them in.* The model
is mostly country-neutral already: tax codes with any components and
rates, any currency rounded to its minor units, snapshots, gapless numbers,
documents in the customer's languages. What is Canadian is a few rules, and
what other regimes need and this lacks: prices that include tax, the
customer's tax number and reverse-charge wording on business invoices,
rounding per line, a label and format for the tax number. When it comes,
the organization's registered country picks a **tax profile** holding
those, with today's behaviour as the Canada profile and a generic one
beside it. One profile per organization: an organization is one legal
entity registered in one country, and a group with entities in several
runs one organization for each, as its books and invoice numbers already
require. The profile also decides what shows: a form offers only the
profile's fields, and a document prints only what is set (the print pages
already leave out an empty value rather than print a blank). A
per-country check on the tax number's format, as a warning that catches a
typo (Canada's business number has a check digit), is the profile's first
use. Government invoicing systems stay out: where the law issues tax
invoices through one (China's fapiao, Mexico's CFDI, Italy's SDI, India's
IRN), this app's invoice is the company's own record and a commercial
invoice, and the tax invoice is issued there. Trigger: the first customer,
or legal entity, outside Canada.

**Amendment (October 2026) — each organization's numbering (ADR-073).**
The prefix, the width and when a series starts again are each
organization's, `INV-` and six digits only the defaults. Invoices stay
gapless within a series and period, rather than within the organization.

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

**Amendment (October 2026) — their own series (ADR-073).** Credit notes
and RMAs follow their series' settings, as invoices do; a credit note's
period is its credit date, an RMA's the day it is raised in the
organization's zone.

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

```text
stock_valuations  id, organization_id, variant_id, lot_id,
                  kind,                      -- see below
                  movement_id,               -- null for rows no movement caused
                  quantity,                  -- signed; zero for revaluations
                  value,                     -- signed, in the base currency
                  unit_price, currency,      -- as paid, on acquisitions
                  exchange_rate,             -- the rate applied, on acquisitions
                  needs_cost,                -- valued at zero for want of a price
                  reference_type, reference_id, note, actor_id, created_at
```

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

```text
price_lists       id, organization_id, name, direction ('sale' |
                  'purchase'), currency, is_active, timestamps
price_list_items  id, organization_id, price_list_id, variant_id,
                  unit_price, timestamps
                  unique (price_list_id, variant_id)
```

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

> **Amended by [ADR-081](#adr-081--old-tabs-after-a-deploy-a-newer-build-noticed-an-outdated-client-told-amends-adr-013-adr-051-adr-052-adr-054-adr-055-and-adr-068).**
> Each organization in `seed:volume` has a team holding made roles, `npm run perf:plans` times the access query, and each scale writes a manifest of its own, read by `--scale`.
>
> **Amended by [ADR-082](#adr-082--the-products-brand-panivo-before-sign-in-the-organizations-after-amends-adr-019-adr-051-adr-055-adr-060-and-adr-081).**
> A budget may carry a known miss: its issue, an end date and a ceiling. Until the date, a result over the budget and under the ceiling is reported and does not fail the run. The typo lookup's is the first (#225).

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
- **Lot search** reads through `lots_code_trgm_idx`, the pg_trgm this
  line waited for, since migration 0042 (ADR-056), and joins only the
  organization's variants (#187). The index knows no organization, so
  other organizations' matching lots are read and filtered out: 79% of
  the candidates for `LV-0001` at large. Trigger: ADR-056's for an index
  per organization, which the typo lookup's missed budget meets (#225).
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

> **Amended by [ADR-081](#adr-081--old-tabs-after-a-deploy-a-newer-build-noticed-an-outdated-client-told-amends-adr-013-adr-051-adr-052-adr-054-adr-055-and-adr-068).**
> The lenient mode is one of two ways through a breaking change; the other raises the API revision. And every migration, not only one on a large table, leaves working what the release still serving reads: expand, then contract.

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
  *Built by ADR-072 (October 2026):* each organization has a time zone,
  and the one function asks it.
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

> **Amended by [ADR-081](#adr-081--old-tabs-after-a-deploy-a-newer-build-noticed-an-outdated-client-told-amends-adr-013-adr-051-adr-052-adr-054-adr-055-and-adr-068).**
> A language whose catalogue won't load says so, in its own words, and nothing is saved until it loads; at start the app falls back to English rather than a blank page.

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

> **Amended by [ADR-081](#adr-081--old-tabs-after-a-deploy-a-newer-build-noticed-an-outdated-client-told-amends-adr-013-adr-051-adr-052-adr-054-adr-055-and-adr-068).**
> The status page's discs and Home's empty line take the five tones' pairs, not MUI's derived `light` and `dark`, which fell below contrast.
>
> **Amended by [ADR-082](#adr-082--the-products-brand-panivo-before-sign-in-the-organizations-after-amends-adr-019-adr-051-adr-055-adr-060-and-adr-081).**
> The brand layer is unchanged: its default accent and the dark rail are the product's mark's own purple and navy, so a change to either is made to the mark's masters too.

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

**Amendment (October 2026) — the text size (ADR-075).** The five type
sizes stand, and a person may scale them all by 112.5% or 125% with Text
size. A width that holds text is rem, so it grows with them. A button
still never shrinks beside others, but its label breaks onto a second
line when it alone is wider than all its space, rather than running off
a phone's screen; in a table cell it stays on one line. Banners, header
buttons, dialog footers and date ranges wrap, so no page scrolls
sideways at 320px.

**Amendment (October 2026) — a colour given as a path goes in `sx`
(#196).** MUI 9's Typography takes its `color` prop only as a palette name
(`primary`, `error`, `textSecondary`) and ignores a path, which TypeScript
still accepts as a string. So from the first MUI 9 commit (2 September
2026) `color="text.secondary"`, in 214 places, drew the primary text
colour, and the muted line under a heading, a figure's note and a list's
detail read as loudly as what they explain; two warning lines were not
amber. The text hierarchy above is meant, and is put back:

- **MUI's own codemod,** `@mui/codemod@9.5.0` `v9.0.0/system-props`,
  moves every colour given as a path into `sx`, merging into an `sx`
  already there: `sx={{ color: 'text.secondary' }}`, as the client
  already writes colours elsewhere. A named colour stays a prop. A path
  inside an expression, which the codemod leaves, moves by hand.
- **The one `warning.dark` becomes `warning.main`,** the warning intent:
  MUI's derived shades are not tokens, and fell below contrast where
  ADR-081 met them.
- **A lint rule refuses a `color` prop with a dot in it,** however it is
  written, on any component, since the type cannot.
- **Checked by eye and by axe:** the main screens pictured before and
  after, in both modes, at desktop and phone width.

Rejected: a variant per path in the theme's `MuiTypography`, which would
be one file, but keeps working by our hand a spelling MUI 9 dropped, and
would fail as quietly at the next major; and renaming each to its palette
name (`textSecondary`), which leaves one colour with two spellings, the
prop's and `sx`'s.

**As built (#224, 23 October 2026).** The count was exact: 217 written-out
paths on Typography and one inside a conditional, which is the 218, plus
two on Link. MUI 9.5's Link honours a path, so those two were not broken;
they moved only so every path is written one way. The codemod's command
crashes on yargs 18 (`yargs.command is not a function`), so its v9
transform ran through the jscodeshift it ships, with its own flags. What
building added:

- **Muted text on a highlighted row takes the main text colour.** On a
  focused or selected option, and on a menu entry the keyboard is on,
  muted text against MUI's state tints fell to 4.13 to 4.48 : 1. The theme
  points the muted colour at the main text colour on those rows, once, so
  no screen changed. `tokens.test.ts` measures main text on every such
  tint, and muted text on hover and on a chosen card, with all six accent
  presets in both modes.
- **Every Autocomplete's groups sit inside its listbox,** each a group
  named by its heading (`theme/option-group.tsx`): MUI put grouped
  options outside it, and axe refused that.
- **A menu holds only its entries.** A title or an action goes in a
  Popover above a MenuList, since in a menu Tab closes it and the arrows
  skip anything but an entry. The bell is the first: its Popover is a
  dialog named by its title, and the bell has `aria-haspopup="dialog"`
  and `aria-expanded`.
- **Focus.** When a control removes itself, as Mark all read does once
  nothing is unread, focus moves to the next useful place, there the
  first entry. A key pressed while a list loads stops the list taking
  focus when it arrives.
- **A link drawn in the colour of the text around it is always
  underlined,** or it reads as a label (Home's Change the days).
- **The lint rule is proved by a test** that lints a component and a
  spec through the real `eslint.config.js`, so a later block that
  replaces its options fails a test. Lint cannot follow a colour kept in
  a variable, returned by a function or spread in; none exists today.
- **axe opens what it never opened:** the bell with the keyboard on an
  entry, the lookup with it on a result, and the time-zone list on the
  chosen zone, the darkest tint.

The two warning lines and a draft invoice's "None yet" are amber; the
breadcrumb's current page became the main text colour, as its comment
always said; a disabled role card's reason became muted, readable beside
the faded name.

Four stay muted on purpose, though the before-and-after comparison drew
each lighter than before (Bob, 24 October 2026): the seller's tax number
on an invoice, a production run's lot lines, a recipe's "Makes … per
batch" and Members' Last active. A later sweep leaves them so.

*Deferred:* a selected menu entry holding a muted line gets no rule yet,
since no menu has one; the first that does extends the theme's rule to
`.Mui-selected`.

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

**Amendment (October 2026) — the organization's prefixes (ADR-073).** A
query shaped like a known number is one that starts with one of the
organization's own prefixes, the longest that fits, read when the lookup
runs; order numbers join invoices, credit notes and RMAs. `INV-`, `CN-` and
`RMA-` are only the defaults.

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

**Amendment (October 2026) — an instant as a spreadsheet opens it.**
Instants were written as ISO 8601, `2026-10-15T18:54:11.123Z`, which
Excel and Numbers keep as text: the `T`, the `Z` and the fractions stop
them reading a date. ADR-071 writes the organization's full export's
times as `2026-10-15 18:54:11`, in UTC, which both open as a date; every
CSV now does the same, through one helper, `csvMoment`, so the
per-screen exports and the full one agree. Days stay `YYYY-MM-DD`.

**Amendment (October 2026) — ranges of moments at the organization's
midnight (ADR-072).** A date range over moments, such as movements, runs,
RMAs and the audit log, turned its days into times at the reader's
midnight. It now turns them into times at the organization's, so "This
month" is the same stretch of time for every member, and the presets
count in the organization's calendar. The end stays exclusive, the next
day's midnight, correct across a clock change, including a midnight that
never happens, as in Santiago. The audit log, its export and Your
activity had kept their own `to`, compared with `<=` at UTC midnight, so
"To 7 October" left the 7th out; they take `from` and `until` like the
rest now.

---

## ADR-058 — Home: what needs attention, first

> **Amended (#235, 24 October 2026).**
> To ship and To receive count only orders with something still to ship or receive, as this ADR defines them, through the Orders list's `outstanding` filter, so the card, its rows and the page it opens agree. Close order stays its own step (#24).

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

*Amended at large scale (#187, 23 October 2026):* the plan check flagged
the product and partner steps, whose EXISTS the planner answered with a
scan of products (25,000 rows) and partners (15,000). For the probe's
organization it stopped at its first row; for one with no product or
partner yet, the one those steps are for, it read every organization's
rows. Both now select this organization's first row by name, limited to
one, so `products_org_name_idx` and `partners_org_name_idx` are the only
cheap plans, as the receipt and invoice steps' indexes are theirs.

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
- **User guides** — decided in ADR-079, whose registration by invitation
  made the trigger the normal case: kept with the client rather than under
  `docs/user/`, one per page, opened by Help in the top bar and by Learn
  more on each Getting started step and each empty list.

**Amendment (October 2026) — the organization's today (ADR-072).** Home
took `?today=`, the reader's day, so overdue and expired followed their
calendar. It takes no query now: the server counts from the
organization's today, which every member shares, and a page left open
past midnight cannot send yesterday. A reader whose computer is on
another clock is told which zone Home's date follows.

**Amendment (October 2026) — a newcomer's welcome, and Learn more
(ADR-079).** Home leads with a newcomer's own welcome card for their first
two weeks, above Getting started, and `GET /v1/home` returns it as
`welcome`. Getting started stays the organization's: while it shows, the
welcome's first week keeps only the newcomer's own two items. Each of its
steps, and every empty list, gains Learn more, which opens that page's
guide.

---

## ADR-059 — Files: one store for every file, on R2, served through the app

> **Amended by [ADR-070](#adr-070--deleting-an-organization-amends-adr-012-adr-059-and-adr-069).**
> A deleted organization's files are erased when its deletion completes, not released to wait 30 days: the 30 days came before it, and their rows go with the organization.
> Its October 2026 amendment (#117) changes how every upload writes: the bytes go to storage first, under an id taken beforehand, then a short transaction saves the row, and an upload that is refused or fails deletes its bytes. A deletion run's mark then refuses any upload after it.

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

  *Amended (October 2026):* at startup too, on the one timer the licence
  reminders (ADR-064) and account deletions (ADR-069) run on. The server
  sleeps after 15 minutes without a request, so an hourly timer alone
  never fires on a server woken for less than an hour at a time. A run
  at startup takes only what an hourly one would.
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

## ADR-060 — Branding: each organization's logo, colour and expiry days

> **Amended by [ADR-082](#adr-082--the-products-brand-panivo-before-sign-in-the-organizations-after-amends-adr-019-adr-051-adr-055-adr-060-and-adr-081).**
> Before sign-in, the product's mark and name, and a © line. After it, from 1200 px the organization's logo moves to the rail's top, linking Home, and "Powered by Panivo" sits at the rail's foot. An organization's documents carry no product mark.

**Context.** ADR-055 made the brand a few values, the accent colour, the logo
and the sidebar's shade, so that each organization could one day set its own.
ADR-058 left the expiry thresholds (90 and 30 days) to the same decision, and
ADR-059 now stores files, so a logo has somewhere to go. The open decision
already listed what branding needs; this ADR decides it, so that the first
organization other than the developer's own sees its own name and colour,
and its own idea of "expiring soon".

What shapes it:

- **No brand may break a screen.** White text on a pale accent is unreadable;
  an accent the red of a warning makes every button look like an error.
  ADR-055 keeps status tones out of the brand for that reason.
- **One domain for every organization.** The browser's tab icon and the sign-in
  page come before anyone signs in, so they stay the product's own; branding
  starts once the organization is known.
- **People who are not designers.** An owner picks a colour once, from a phone
  as often as a desk. Choosing must be safe by default.

**Decision — Settings → Organization → Branding, for whoever may change the
organization.** A tab of the Organization page (ADR-061), behind
`organizations.update`, with its own Save: the logo, the colour and the
sidebar's shade, which is to say how the app looks. Every member sees the
result; only those who may change the organization see the tab. The two
other settings this ADR adds are rules, not looks, so they sit with their
kind: the expiry days on the Stock tab beside Licences at release, and
"Print the logo" on the Documents tab beside Document languages.

**Decision — the logo, stored as ADR-059 says.**

- Uploaded through `POST /v1/files/logo`: PNG, JPEG, WebP or SVG, at most 2 MB,
  at least 256 px wide; kept as one PNG at most 1024 px, an SVG drawn to PNG
  and never kept.
- `organizations.logo_file_id`. Saving a new logo attaches it and releases the
  old one in the same transaction (`FilesService.attach`, `release`);
  removing the logo releases it. A released logo is purged 30 days later.
- **Previewed before saving** on both of the sidebar's shades, at the size it
  will show, so a logo made for white is seen on dark before anyone else does.
- **Where it shows:** the top of the side rail, at most 32 px tall (ADR-055),
  the organization's name in text when there is none; on the dark rail it
  sits on a white plate, since most logos are made for white. Printed
  documents below.
- **One logo.** A second version for dark backgrounds waits for a logo the
  white plate does not suit (Deferred).
  *Amended (October 2026): an optional square logo beside it, for the
  places only a square fits (below).*

**Decision — the colour: presets, or a custom colour made safe.**

- **Six presets**, each tested in both colour modes: indigo (`#5546B8`, the
  default), blue, teal, green-slate, plum and charcoal. None is near the red,
  amber or green of the status tones.
- **A custom colour**, typed as hex or picked. It is checked the way ADR-055
  checks its own tokens, in both modes:
  - light: white text on the accent, and the accent as link text on white,
    at least 4.5 : 1 (WCAG AA);
  - dark: the accent mixed 45% toward white (ADR-055's rule), with dark text
    on it and as link text on the dark surface, at least 4.5 : 1.
- **Never refused, made to pass.** A colour that fails is darkened (or, for
  dark mode, lightened) along its own hue, keeping its chroma, to the nearest
  shade that passes. The section shows both: the colour chosen and the one
  that will be used, with why. What is saved is the shade that passes, so
  every stored colour is readable without checking again.
- **A warning, not a block,** when its hue is within 25° of the danger,
  warning or success tone at a strong chroma: "This colour is close to the
  red used for errors; buttons may read as warnings." The owner decides.
- The same check runs on the server when saving, so a colour that skipped the
  page is held to the same rule. `organizations.accent_color`, `#RRGGBB`, null
  for the default.

**Decision — the sidebar's shade.** `dark` (the default) or `light`, ADR-055's
two rails, chosen beside the colour and previewed with the logo.
`organizations.rail`.

**Decision — expiry days, the organization's** (on the Stock tab).

- Two numbers, **warning** (default 90) and **critical** (default 30), with
  critical less than warning, both from 1 to 365.
  `organizations.expiry_warning_days`, `expiry_critical_days`.
- Every place that says "expiring" uses them: the inventory's chips and its
  Expiring filter, a lot's chip on every page, and Home's Expiring card and
  its count. The client's `EXPIRY_DAYS` constant becomes the organization's
  values, read with the rest of its settings; the server's
  `EXPIRY_WARNING_DAYS` becomes the organization's warning days.
- Licence notice (60 days) and an overdue grace stay as they are (Deferred):
  nobody has asked, and each is one more number to explain.

**Decision — the logo on printed documents, a choice** (on the Documents
tab). Invoices, credit
notes and packing slips print the logo at the top left, at most 18 mm tall,
when the organization has one and `organizations.logo_on_documents` is on,
which it is by default. Off keeps the paper as it is now, for an organization
whose stationery already carries its logo. Documents already issued are not
reprinted: the logo is whatever the organization has when the PDF is made.

**Decision — the theme follows the organization.** After sign-in the client
builds its theme from the organization's accent and rail, as it builds it
from ADR-055's defaults today. Before sign-in, and for a person in no
organization, the defaults. Switching organization rebuilds it. The values
come with the organization's other settings; nothing new is fetched.

**Consequences.**

- Built in this order, each its own commit:
    1. The section designed on the Claude Design canvas: Branding on desktop
       and on a phone, in English and Chinese, a custom colour adjusted and
       warned, the logo previewed on both rails. Reviewed before building
       (done), then redrawn into ADR-061's tabs. ADR-061 is built first, so
       Branding, Stock and Documents are tabs to fill.
    2. Migration 0050: `logo_file_id` (a foreign key to `files`),
       `accent_color`, `rail`, `expiry_warning_days`,
       `expiry_critical_days`, `logo_on_documents`, each with its check.
    3. The server: the fields on the organization's read and update, the
       colour check, attaching and releasing the logo, Home's Expiring card
       by the organization's days, the audit of each change.
    4. The client: the theme from the organization, the Branding section, the
       logo in the rail, the expiry chips and filter by the organization's
       days.
    5. The logo on invoices, credit notes and packing slips.
    6. Manual checks: a custom colour adjusted and used everywhere, a logo on
       both rails and on paper, the expiry days changing a chip and Home.
- The colour check is one function, in the client for the preview and in the
  server for the save, with the same tests in both: the packages share no
  code (as the catalogues, ADR-054).
- Nothing changes for an organization that sets nothing: the defaults are
  ADR-055's and ADR-058's values.

*Amended while building:*

- **The logo shows where ADR-055 put the organization**: the top bar's left
  corner and the phone menu's header, at most 32 px tall, the name in text
  until there is a logo. On a white plate in dark mode, and in the phone
  menu while the rail is dark.
- **The theme follows the session.** `/v1/auth/me` carries the branding
  and the expiry days, so no page asks for them; the theme sits outside the
  router and AuthProvider inside it, so a small store between them hands
  the colour over, and signing out returns the defaults.
- **Indigo is saved as no colour**, not as `#5546B8`, so a change to the
  default reaches every organization that never chose.
- **One Save for the Branding tab** (logo, colour, rail); the expiry days
  and "Print the logo" are saved on their own tabs, each refreshing the
  session so the chips and the paper follow at once.
- **The logo prints from the print sheet itself**, so invoices, credit
  notes and packing slips all have it without three copies of the rule.
- **Home's link to Stock**, built after: the Expiring card names the
  organization's days ("Nothing expires within 180 days") and, for those
  who may change them, links to the Stock tab: "Change the days".

**Considered and not done.**

- **Refusing a colour that fails contrast.** Correct, and unkind: an owner
  with a brand colour would be told no without being offered anything. The
  nearest passing shade keeps their hue and keeps every screen readable.
- **Free colour, unchecked.** Some products allow it; a pale accent would
  leave every primary button unreadable for that organization's people.
- **A full theme** (fonts, radius, surface colours). More values to break,
  and nobody has asked; ADR-055 keeps the brand to a few on purpose.
- **A per-organization tab icon and sign-in page.** Before sign-in there is
  no organization, and a home-screen icon belongs to the website.
- **The logo in the database.** ADR-059 decided one store for every file.

**Deferred — each with what brings it in.**

- **A second logo for dark backgrounds.** Trigger: a logo the white plate
  does not suit, such as a white wordmark.
- **Licence notice days and an overdue grace per organization.** Trigger:
  the first organization that asks.
- **A white-labelled domain, tab icon and sign-in page.** Trigger: a customer
  who sells the product under their own name.
- **The colour on emails.** The security emails stay the product's
  (ADR-037). Trigger: an organization whose customers receive email from
  the app.

**Amendment (October 2026) — a square logo of the organization's own.**
ADR-082 moved the logo to the rail's top and gave the folded rail one
44 px plate, which shows the logo when it is about square and the
organization's initials otherwise. Most logos are wordmarks, so most
plates show initials; and on a phone under 360 px at Larger text
(ADR-079) a wide logo shrinks to something nobody can read. Many firms
also keep a small square mark, for an app icon or a social profile. This
amendment lets an organization upload one beside its logo (Bob, 25
October 2026, as recommended).

Checked before drafting, as the working agreements ask:

- **Fired, and taken here.** ADR-082's as-built line: a small square logo
  of the organization's own, uploaded separately, the plate's first
  choice ahead of the initials. #246, in the two files this changes: the
  open rail's fold button and the menu drawer's Close take the theme's
  focus ring, 2.24 : 1 on the dark rail, rather than the rail's own.
- **Not fired, and kept in step.** This ADR's second logo for dark
  backgrounds: the square logo sits on the same white plate, so a white
  mark would vanish there too, and when that trigger fires both logos get
  a dark version. This ADR's white-labelled tab icon, and ADR-082's one
  icon on a plate: the square logo is never the tab icon or a home
  screen's. ADR-077's invitation page keeps the main logo. ADR-082's
  deferred "the mark in an organization's emails" waits for the emails'
  design, next, which may take the square logo for that header. Open
  decisions, "One person in two organizations": a switcher between
  organizations would show each one's square logo, read with its branding
  as the plate does. #245: the plate's initials are data and take
  `translate="no"` there, not here. #170 (every new control 44 px), #198
  (Branding already asks before unsaved work is left; a square logo added
  or removed counts), #148 (the refusals in plain words), #142 (nothing
  new loads from another site), #150 (the guide section added here is not
  in the translation review's export).
- **Found while checking.** The Organization guide (ADR-079) has no
  section for the Branding tab, in any language. `seed:demo` sets no logo,
  so no demo has shown one on the plate. The server keeps a logo as PNG by
  testing that its kind renders as a logo, so a second logo kind would be
  written as WebP unless handled. The 1.25 that decides "about square"
  lives only in the client's `rail-top.tsx`. MC-3510's "with a square
  logo" means a square main logo. The plate is `rem(44)`, growing with
  the text size, but draws its image at a fixed 28 px, so at Larger text
  a square main logo sits small in a larger plate. A logo is kept and
  served at its one size, up to 1024 px, however small it is drawn. The
  logo's upload says nothing while it runs but a disabled button, which a
  screen reader does not announce.

**Decision — an optional square logo, beside the logo.** On Branding,
saved with the tab's one Save: **Square logo** (« Logo carré »,
方形标志), marked optional. On a computer the two logos sit side by
side, one brand in two shapes; on a phone the square logo follows the
logo. Each row has a line saying what it is for: the logo's "Wide or
square, at the top of the sidebar."; the square logo's "For small
spaces, such as the folded sidebar.", followed, while it has none, by
what this organization shows there instead: its initials, or, when its
logo is about square, that the logo already shows there and a square
logo is only for a different mark. Both rows are one component; while
either uploads, "Uploading…" is said in words as well as shown, so a
screen reader hears it. The preview shows each sidebar shade both open
and folded, the plate chosen by the same rule as the rail's.

**Decision — where it shows, and only there.**

- **The folded plate** takes the first of: the square logo; a main logo
  about square (at most 1.25 : 1), as ADR-082 built; the organization's
  initials. On the white plate, as ADR-082 drew a square logo there, the
  image at most 28 px at Standard text and in rem, so it grows with the
  plate as the initials do (amending ADR-082's plate, whose image was a
  fixed 28 px).
- **Beside the name.** With no main logo, the square logo stands beside
  the name wherever the name stands in for the logo: the rail's top, and
  below 1200 px the top bar and the menu drawer's header.
- **The tight bar.** On a phone under 360 px at Larger text, where
  ADR-079 shows the logo or the initials alone, the square logo comes
  first, then the main logo, then the initials.
- **Nowhere else.** The tab icon and home screens stay the product's
  (ADR-082); documents print the main logo (above); the invitation page
  keeps it (ADR-077); emails wait for their own design.

**Decision — the file.**

- A kind of its own, `square_logo`, uploaded through
  `POST /v1/files/square-logo` behind `organizations.update` (ADR-059,
  one route per kind), and read by any member, as the logo is.
- PNG, JPEG, WebP or SVG, at most 2 MB, as the logo. A raster at least
  128 px on each side, and any image at most 5 : 4 either way, the
  plate's own 1.25. Refused otherwise, nothing kept: "A square logo must
  be at least 128 pixels on each side." and "A square logo must be about
  square, at most 5 : 4 either way. Use a wide image as the main logo."
- Kept as two PNGs: `full`, at most 512 px on its longer side, for
  Branding and room for a switcher later; and `thumb`, at most 128 px,
  which the plate and the bars ask for, sharp on a 3× screen at a few
  kilobytes rather than the 512 px file on every first visit from a phone
  or from China (ADR-059's reason for sizes). A size it does not keep is
  answered with `full`. An SVG is drawn and only the PNGs kept. Never
  cropped or padded, and a raster never enlarged.
- `organizations.square_logo_file_id`, attached and released in the same
  transaction as the logo, so a replaced one is purged 30 days later
  (ADR-059); recorded in the audit as the logo is, in words (ADR-076);
  carried with the session's branding on `/v1/auth/me`. Every change is
  an addition, so the API revision stays where it is (ADR-081).

**Considered and not done.**

- **Edge to edge on the plate,** as a phone's app icon. Right for an icon
  with its own background; a transparent mark would touch the plate's
  edges and lose its corners, and telling the two apart means reading the
  image's edges.
- **Cropping or padding to a square on the server.** A crop cuts into the
  mark (ADR-063 crops only faces); padding changes what the owner
  uploaded. Refusing beyond 5 : 4 says what to do instead.
- **A square logo made from the main one,** its first letters or its left
  part. A guess at someone's brand.
- **The square logo as the tab icon after sign-in.** One domain, one icon
  (ADR-060, ADR-082).
- **Drag and paste onto the row,** as product images take them. A logo
  is set once or twice in an organization's life; the button is enough.
- **A checkerboard behind the thumbnail** to show transparency. The two
  sidebar previews already show the logo on dark and on white.

**Deferred.**

- **A smaller copy of the main logo for the rail,** which is drawn at
  most 32 px tall from a file up to 1024 px wide. Trigger: the whole-app
  review's Lighthouse run, or a perf run, naming the logo's bytes.

**Consequences.**

- Migration **0075**: `square_logo_file_id`, and `square_logo` in
  `files_kind_check`.
- Server: the kind, its route, its checks and its two sizes; the
  organization's update and read; the audit's words; the catalogues.
- Client: the Branding rows side by side, one component for both logos,
  with the fallback line and "Uploading…"; one rule for the plate, used by
  the rail and the preview; the plate's image in rem; `OrganizationMark`
  with no main logo and on the tight bar; `thumb` wherever the square logo
  is drawn small.
- Riders: #246; the Organization guide's Branding section in three
  languages.
- Seeds: `seed:demo`'s organization gets a square logo and no main logo;
  `seed:volume` adds nothing (one nullable column, read with the session
  as branding already is).
- Manual checks: a section of their own, MC-3601 onward; MC-3510
  reworded.
- Designed on the canvas (the row "The organization's square logo"); the
  brief in `tmp/square-logo/`. The pull request carries `full-e2e`, since
  it adds rows to `accessibility.spec.ts`.

**As built (#251, 26 October 2026).** Built as decided, in the brief's
steps. What building corrected and settled:

- **Three corrections to the amendment above.** Branding never had the
  unsaved-changes question the check above credits it with: ADR-061's
  "switching
  tab with unsaved changes asks first" was not built for the Organization
  page, #198 is that gap, and none was added here. "Every change is an
  addition" was not quite true: the upload response's `kind` is one enum
  for every route, so it gains `square_logo` on the two existing upload
  routes, which oasdiff calls breaking (response-property-enum-value-added).
  Each route returns only its own kind and `square_logo` comes only from
  the new route, so both lines are accepted in
  `server/openapi-breaking-accepted.txt` and the API revision stays.
  Branding's thumbnail asks for `thumb`, as the preview does, not `full`:
  128 px is enough for 40 px on any screen, so nothing downloads twice;
  `full` stays kept for a switcher later.
- **The plate.** One rule, `usePlate` in `client/src/layout/use-plate.ts`,
  and one `Plate` component, used by the rail, the name beside it and
  Branding's preview, so the three cannot disagree. The 1.25 lives there,
  `images.ts`'s copy pointing at it. The plate's image is `rem(28)`, so it
  grows with the plate at Larger text, a square main logo included.
- **Branding.** One row component for both logos, each row a group named
  by its heading, so a screen reader can tell the two Replace and the two
  Remove buttons apart; Remove is a text button for both. The square
  logo's fallback sentence sits on a line of its own, since Chinese joins
  sentences without a space. When an upload ends, the row says "Uploaded.
  Press Save branding to use it." in place of "Uploading…", since nothing
  else says the file counts only after Save; after Remove, focus moves to
  the row's upload button. The whole sidebar preview, heading included,
  is hidden from screen readers, the line saying in words what the plate
  shows; with no logo, its open rail now shows the name, as the rail does.
- **A rider, the colour sample.** The sample under Colour read "Save
  branding" and looked exactly like the real Save, the first one an owner
  reaches on a phone. It now reads "Example" under the caption "Buttons
  will look like this:", a plain box, neither focusable nor read aloud.
- **Files.** One drawing helper draws an SVG at each target size by its
  density, rather than once at 300 dpi and scaled, so a 40 px SVG comes
  out sharp at 512; one `ImageRefused` class carries the three refusals.
  That also mended the main logo: an SVG declared 1,700 px or wider broke
  the pixel limit at 300 dpi and was refused as damaged; it is now kept at
  1,024. Each kind names its format, `png` or `webp`, in place of the test
  on its render that the check warned about, and `FilesService.swapFile`
  attaches and releases both logos.
- **Words.** The catalogues' extraction (formatjs) turned no-break spaces
  into plain ones, on the server and on the client; both now run with
  `--preserve-whitespace`, so "5 : 4" stays on one line in French.
- **Commits.** The migration and the server are one commit (d0201a16):
  `FILE_KINDS` is shared by the code and `files_kind_check`, so adding
  `square_logo` needs `KIND_RULES`' entry and changes the API, while
  leaving it out fails the schema test that the code knows every value the
  check allows; no split of 0075 stayed green. The client (e8da2bd1) and
  the guide (e981184f) went in without their manual checks, which came
  with the seeds (6440912e), as the brief had them: the brief's mistake.
- **Tests and checks.** #246's ring test waits until the rail has switched
  before it measures, after failing 2 runs in about 44 in Linux WebKit; an
  `accessibility.spec.ts` row for Branding on a fresh organization, at
  `?tab=branding` as ADR-061's as-built has it; two screenshots,
  15-branding and 16-rail-folded; MC-3601 to MC-3610, with MC-3510 and
  MC-1702 changed. Claude Code Review, re-run once CI had finished, found
  no issues.
- **Dependencies.** @nestjs/swagger 12.0.4 and pdfmake 0.3.13, taken
  inside the 7-day wait by Bob's choice (4fdb332d). The branch's first
  dependency step found `npm update --before` wrong, and
  `docs/conventions.md` now judges each package by its own publish time.
- **Left for issues.** #249, "File too large" in English with no next step
  on every upload route; #250, Receive stock saying "No products yet"
  while they load; the rail's folding dropping focus, added to #155; #252,
  Claude Code Review ending without a review when it stops to wait for the
  pull request's other checks, which the check from #243 caught on #251.

---

## ADR-061 — The Organization page in tabs, and a name that can change

**Context.** Settings → Organization is one page of small forms, each with
its own Save: tax registration, registered address, base currency, the
default sale price list, document languages and licences at release.
ADR-060 adds branding, the expiry days and a printing choice. Nine forms on
one page is long on a desk and very long on a phone, mixes paperwork with
money, looks and rules, and gives nothing a link can point to: Getting
started can only send an owner to the top of the page. And the name, set at
registration, cannot be changed at all.

**Decision — five tabs, each with its own address.**

| Tab | Holds | Address |
| --- | --- | --- |
| Profile | The name, tax registration, registered address | `/settings/organization` (the first) |
| Money | Base currency, the default sale price list | `/settings/organization/money` |
| Documents | Document languages, the names required on invoices, "Print the logo" (ADR-060) | `/settings/organization/documents` |
| Stock | Expiry days (ADR-060), licences at release | `/settings/organization/stock` |
| Branding | Logo, colour, sidebar (ADR-060) | `/settings/organization/branding` |

- ADR-055's tabs, scrolling sideways on a phone. Each form keeps its own
  Save; switching tab with unsaved changes asks first, as leaving any page
  does (#54).
- Every member may read every tab but Branding, as they read the page now;
  only those with `organizations.update` change anything.
- **Links open the tab they mean.** Getting started's address step opens
  Profile; the refusal to issue an invoice without a registered address
  links to Profile; Home's Expiring card says "within 90 days" and, for
  those who may change it, links that to Stock.

**Decision — the name can change.** On the Profile tab, for whoever has
`organizations.update`, 1 to 120 characters, audited like every change to
the organization.

- Nothing already issued changes: an invoice or credit note copies the
  seller's name and address on the day it is issued (ADR-046), so renaming
  never rewrites paper already sent.
- From the save on, the app, new documents and new emails carry the new
  name. The organization's slug, used in nothing a customer sees, stays.
- Why now: a business that changes its logo usually changes its name with
  it, and the name was only fixed because renaming was undecided.

**Consequences.**

- Built in this order, before ADR-060's code:
    1. The tabs on the Claude Design canvas: Profile with the name, Documents
       and Stock, beside ADR-060's Branding.
    2. The client: the five tabs and their addresses, the sections moved
       into them, the links into them. No server change.
    3. The name: in the organization's update and its audit, and on the
       Profile tab.
- The current single page's address keeps working: it is Profile.

*Amended while building:*

- **The address is `?tab=money`, not `/settings/organization/money`**,
  as on every record page: the same `useTab`, which keeps the open tab in
  the address, falls back to the first for an unknown one, and replaces
  history rather than adding to it. `/settings/organization` is Profile.
- **Every tab stays mounted, and only the open one shows**, so moving
  between tabs keeps whatever was typed. Nothing needs to ask: no work is
  lost by switching, and leaving the page is as it was.
- **The name is 1 to 100 characters**, as at registration, not 120.
- **Four tabs until ADR-060 is built**: Branding arrives with it, and so do
  the expiry days on Stock and, with them, Home's link to Stock.
- **Links built now:** Getting started's first step opens Profile, as the
  page's own address; the base currency notes on Stock value and on
  Exchange rates open Money. The refusal to issue an invoice without an
  address is the server's message, shown as it comes, with no link yet.

*Amended (12 October 2026):*

- **The refusal to issue links to Profile.** The server puts
  `code: "organization_address_missing"` beside its message
  (conventions.md, "Error codes"), and the Issue dialog shows, under the
  message, a link to Profile for whoever holds `organizations.update`;
  anyone else gets the message alone, as Profile is a page they cannot
  change. Only the address is refused: the tax number stays optional, as
  ADR-046 left it, since a business not registered for GST/HST has none
  to print. MC-1703.
- **The customer's billing address the same way.** Refused for a customer
  with no billing address (`customer_billing_address_missing`), the dialog
  links to the customer's page, for whoever holds `partners.update`.
  MC-702.

**Considered and not done.**

- **One long page with an index down the side.** Shorter to build, and
  still one long page on a phone, where the index is the first thing to go.
- **A page per group in the menu.** Five settings entries where there is one
  now, for forms most people change once.

**Deferred — each with what brings it in.**

- **A "ready to invoice" summary** at the top of Profile: address set, tax
  number set. Getting started covers a new organization. Trigger: an
  organization that dismissed Getting started and is then refused an
  invoice for something missing.

---

## ADR-062 — Product images: a gallery per product, thumbnails in lists

**Context.** ADR-059 stores photos in three sizes and has a route for
product images already, but nothing shows one. Products are recognised by
sight in a warehouse as much as by SKU: two bottles of the same brand with
different labels, a blend in a sack. A photo on the product page and a
thumbnail in the lists that pick products answer "is this the one?" before
anyone opens anything.

**Decision — a product has a gallery: up to eight images, in order, the
first its cover.**

- `product_images`: the organization, the product, the file (ADR-059,
  kind `product_image`, attached when added, released when removed) and its
  position. One file belongs to one product.
- Eight is enough to show a product from its sides, its label and its
  certificate photo; more is a catalogue, which this is not.
- The first image is the product's cover: the one lists show. Reordering
  is dragging one to the front, or "Make cover".
- Images belong to the product, not to a variant: variants differ in count
  or size far more often than in look. A variant's own picture waits
  (Deferred).

**Decision — where they show.**

- **The product page**: a gallery at the top, the cover at `display` size
  (1200 px), the others as `thumb`s beneath; clicking any opens a viewer at
  `full` size (3000 px), where the browser's zoom and a pinch on a phone
  show the detail, with arrows between images.
- **Lists that pick or show products**: a 40 px cover beside the name on
  the Products list, in the item lookup, and in Inventory. Lazy-loaded,
  `thumb` size, so a page of fifty costs a few hundred kilobytes.
- **Not on printed documents.** Paper stays as ADR-041 and ADR-046 drew it.
- With no image: a neutral tile with the product type's icon, never a
  placeholder photo.

**Decision — adding, removing, reordering.** On the product page, for
whoever has `products.update`: Add images (several at once, or a phone's
camera), each uploaded through `POST /v1/files/product-image` and then
added with `POST /v1/products/:id/images`; Remove, which releases the file
(purged 30 days later, ADR-059); and a new order with
`PUT /v1/products/:id/images`. Each is audited as a change to the product.
Whoever has `products.view` sees them.

- **A product with no images invites one**: a drop area with Add images,
  not an empty gallery.
- **Several at once, each on its own**: dropped or chosen together, each
  shows its progress, then "Making sizes…" while the server writes them,
  and appears in the gallery when done. One refused (a PDF, too large)
  says why and does not stop the others.
- **Every thumbnail has a menu**: Make cover, Move left, Move right,
  Remove, so the order changes without a mouse as well as by dragging.
- **Remove is undone, not confirmed**: the image goes at once with "Image
  removed · Undo" for a few seconds; the file is only released when the
  undo has passed, and purged 30 days after that (ADR-059).
- **The viewer**: Esc closes, ← and → move between images, a phone swipes,
  a double-click or double-tap zooms.
- **At eight**, Add images is disabled with the reason beside it.
- **Paste adds an image**: ⌘V or Ctrl+V on the product page adds what the
  clipboard holds, a screenshot or a picture copied from an email, through
  the same upload as Add images.
- **The same photo twice is refused**: an upload whose checksum (ADR-059's
  `sha256`) matches an image already on the product is not added, and says
  so ("Already on this product"), rather than filling a slot.
- **Every image is described for screen readers** without anyone typing:
  the product's name and its place, "Focus, image 2 of 4", and "the cover"
  for the first.

**Consequences.**

- Built in this order, one PR: the gallery and the lists on the Claude
  Design canvas, reviewed first; migration 0051 (`product_images`); the
  server (add, remove, reorder, the cover on every product the lists
  read); the client (the gallery, the viewer, the thumbnails); manual
  checks.
- The cover rides on the product rows the lists already read, as a file id
  and the thumb's size, so a list asks for no more than it does now; each
  thumbnail is then one cached request (ADR-059's immutable year).

*Amended while building:*

- **Not in the item lookup yet.** The lookup's results are one shape for
  eight kinds of record; a cover for one of them waits for a change that
  needs that shape anyway. The Products list and Inventory have theirs.
- **Undo is the client's.** Remove hides the image and sends the removal
  when the undo has passed, or at once when the page is left or another
  image is removed; Undo puts it back and nothing is sent.
- **Uploads report progress** through XMLHttpRequest, the one browser API
  that does; the rest of the app keeps `api()`.
- **The viewer zooms as the canvas drew it**: − and + with the level
  between them, the scroll wheel, a pinch and a double-click, 100 to
  400%, and a drag to look around once zoomed. First built with a
  double-click alone and a scrollbar.

**Considered and not done.**

- **Images on variants.** Three sizes of one bottle look alike; the rare
  variant that differs (a flavour, a colour) can wait for its trigger.
- **One image per product.** Simpler, and too little: the label's back is
  what a warehouse checks.
- **Images on invoices and packing slips.** Ink and pages for something the
  customer has already seen.
- **Cropping and rotating in the app.** Photos are already turned upright
  from the camera's own orientation (ADR-059); cropping is a lot of
  interface for what a phone's editor already does better.
- **A caption per image.** The order and the product's name describe them;
  a caption is one more field nobody fills in.
- **A shared image library across products.** A different feature, and it
  makes removing an image a question of who else still uses it.

**Deferred — each with what brings it in.**

- **A variant's own image.** Trigger: variants that differ in look, such as
  flavours or colours.
- **Images on order lines and the shipping screen.** Trigger: picking
  errors that a picture would have prevented.
- **Product images outside the organization** (a catalogue, a customer
  portal), which brings ADR-059's CDN deferral. Trigger: either one.

---

## ADR-063 — People: a photo of one's own, initials otherwise, and a People page

**Context.** A person shows as an icon in the top bar and as a name
everywhere else: in Members, in a record's history, as who uploaded a
photo or released a run. In a team of any size, names alone are slow:
people know each other's faces before their surnames, and a new hire
knows neither. Some will never upload a photo, so the app has to look
right without one too.

What shapes it:

- **A face belongs to its person.** Someone in two organizations has one
  face. ADR-059 files every file under an organization; a photo is not one
  organization's.
- **It is personal data**, of a kind the app holds nowhere else. The
  person decides whether it is there.

**Decision — only the person sets their photo.** On the Account page, in
the Profile card beside their name, email and language: Add a photo,
Replace, Remove. Nobody else can, an owner included: putting
a person's face in the app is theirs to do. Removing it deletes it at
once, bytes and all, rather than releasing it for 30 days as ADR-059 does
for organization files: there is no undo for a face someone took back.

**Decision — stored with the person, through ADR-059.**

- `files` gains `user_id`: a file belongs to an organization or, for a
  photo, to a person, never both. The key is the owner's id and the
  file's, `<user id>/<file id>/<size>`, the same shape. A photo counts
  against no organization's limit.
- A new kind, `avatar`: PNG, JPEG or WebP, up to 5 MB, re-encoded without
  metadata (ADR-059), **cropped square from the centre**, unlike product
  photos, since a face is always shown in a circle: `thumb` 128 px for the
  small circles, `full` 512 px for the People page and the Account page.
- `users.photo_file_id`, null for none. A new photo replaces the old,
  which is deleted.

**Decision — seen by the people one works with.** `GET
/v1/people/:userId/photo?size=` answers for a person who shares the
caller's current organization, and is a 404 for anyone else, as for any
record. The address carries the photo's id, so a new photo is a new
address and every browser picks it up; each is cached for a year
(ADR-059).

**Decision — initials, never a blank.** Without a photo, a person is
their initials (two letters from the name, or the first two of an email)
on a colour taken from the name: always the same colour for the same
person, from eight that read white text at AA in both colour modes, so
two people with the same initials still look different.

**Decision — the same face everywhere a person appears.** One component,
one circle, in: the top bar's account button, the account menu, the
Account page, Members, the People page, and each entry of a record's
history. Notifications, recently opened and the lookup keep their names
alone for now (Deferred).

**Decision — details at work, set by the person, per organization.** Job
title, department, location, work phone and extension, each optional,
each set by the person on the Account page under "Your details at"
and the organization's name. On the membership, not the account: someone in two
organizations has a title and an extension in each. Nobody else edits
them, as nobody else sets the photo.

**Decision — a People page for finding someone, a page per person for
everything else.**

- `/people`, in the menu for every member: a card each, with what is
  looked up most: the face, name, job title, role and work phone with its
  extension. Searchable by name, title, department and email; sorted by
  name.
- `/people/:userId`, opened from a card or from a face anywhere: the large
  photo, name, title, role, and only the details the person has filled in
  (department, location, work phone and extension, email, member since),
  never a row of dashes. With none filled in, one line says so. Then, for
  those with `audit.view`, the last 20 things they did in this
  organization, newest first, each linking to its record, and only to
  records the viewer may open. Nobody else sees that section, and a
  person's own page does not show it either: their own work is on their
  Account page. Twenty is a preview, not a limit: "See all of
  their activity" opens the audit log filtered to them, with its dates, its Load
  more and its CSV export (ADR-057), which already hold everything.
- **Last active** is when the person last did something in this
  organization (below). Everyone sees it coarse: active today, this week,
  this month, over a month ago, never signed in. Those with `audit.view`
  see the time to the minute, and to the second on hover; the history
  keeps the rest.
- **Long values never break the layout.** On cards, a name wraps to two
  lines and a title, phone or email to one, each whole on hover and on the
  person's page.
- Read-only. Adding and removing people, and their roles, stay in Members,
  for those who may.

**Decision — last active is what the person did, not what their tab did.**
Three things that sound alike are kept apart:

| Term | What it means | Where it comes from | Shown |
| --- | --- | --- | --- |
| Last active | When the person last did something here | `memberships.last_active_at`, new | People cards, a person's page |
| Signed in | When a device signed in | `sessions.created_at`; every sign-in in `account_events` (ADR-022) | Your devices; the Account page's sign-in card |
| Session alive | Whether that sign-in still holds | `sessions.last_seen_at`, against the idle and absolute limits | Nowhere: it is security's |

- `last_active_at` is on the membership, so someone in two organizations
  is active in the one they used. Any request the person makes moves it,
  at most once a minute, except a background one.
- **Background requests say so.** The notification bell's count, polled
  every minute, sends `X-Background: 1`, and the server lets such a
  request move neither last active nor the session's idle timer. A tab
  left open at six in the evening shows its owner as active yesterday the
  next morning, not active now; and an untouched tab signs out when the
  idle limit passes, which is what that limit is for. The bell also stops
  polling while its tab is hidden.
- The limits stay seven days idle and thirty days in all: long, as B2B
  tools' are. A short idle limit with a warning, for shared warehouse
  computers, is an organization's setting to decide later (Open
  decisions).
- What the three sources show, the audit log (ADR-018) and account events
  (ADR-022) keep their own rules; this ADR only reads them. A person's
  page and Your activity read `audit_log`; the Account page's sign-in card
  reads `account_events`. Your activity is its own route,
  `/v1/account/activity`, calling the audit log's service with the person
  set by the server to the caller, rather than `/v1/audit` trusting a
  filter the browser sends to decide who may see what.

**Decision — the top bar shows the face alone.** At every width, as most
apps do: no email beside it. The email was there so that on a shared
computer people could see whose account is signed in; a face, or initials
on their own colour, says that at a glance. Hovering shows the name and
email; the account menu opens with both.

**Decision — your own work on your Account page, and what others see,
said plainly.** The Account page gains "Your recent work in"
the organization: the last 20 things you did there, each linking to its
record, titled apart from the sign-in activity it already shows. "See all
your work" opens Your activity, `/account/activity`: the audit log's list,
dates, Load more and CSV export, held to your own actions, so anyone can
read and export all they did without `audit.view`. Exports are CSV, as
every list's (ADR-057); JSON is for programs, and waits for an
integration that asks. And one line under the photo says who sees
what: colleagues see roughly when you were last active; those who may read the history also see the exact time
and your recent work.

**Consequences.**

- Built in this order, one PR: the screens on the Claude Design canvas,
  reviewed first; migration 0052 (`files.user_id`, the `avatar` kind,
  `users.photo_file_id`, the membership's work details and
  `last_active_at`); the server
  (upload, remove, serve, the details, people and a person); the client
  (the circle, the Account page, the top bar, Members, history, the
  People page, a person's page); manual checks.
- Deleting an account deletes its photo with it.

*Amended while building:*

- **"Deleted at once" is the app's storage.** The nightly copy of the
  files bucket (ADR-059) keeps a removed photo until that copy expires,
  31 days on, as it keeps everything; nothing restores it into the app.
- **A photo change is an account event** (`account.profile_updated`,
  ADR-022), not an audit entry: it is the person's own, like their name.
  Changing your details at work is neither, as a self-action on your own
  membership.
- **Members gains the face and last active,** as People shows it: roughly
  for everyone, to the minute for those who may read the history. First
  built with the face alone; seeing the page, its last active was wanted
  where people are managed too.
- **Who and when, both ways.** The audit log, Your activity and a record's
  History show the person's name with their email beneath it, cut short
  when long and whole on hover, and the time to the minute with how long
  ago beside it.
- **Your activity is the audit log's page** in a mode of its own: the
  person set by the server, no action filter (the log's vocabulary is
  for those who may read it), its own export. An owner's "See all of
  their activity" opens the audit log with a person filter it now shows
  as a notice, like a record filter.
- **The bell's background mark** is `X-Background: 1`, and it polls only
  while its tab is visible, asking at once when it is seen again.

*Amended (October 2026): initials by the name's script.* Two letters from
the name read as initials only in a script with capitals. 周振中 showed
周振, the surname and half the given name, which no reader of Chinese
would write, and a name with no space was cut the same way in any script.
Initials now follow what readers of the name's own script expect, as
production apps do:

- **Chinese:** the last two characters, the given name, which is what
  colleagues call each other and what Chinese workplace apps show; a name
  of two characters whole. A compound surname reads right (欧阳娜娜 gives
  娜娜); a two-character surname with a one-character given name does not
  (司马光 gives 马光), which only a separate surname field could fix.
- **Latin, Greek and Cyrillic:** the first and last names' initials, as
  before, now taken by grapheme, so an accent typed as a code point of its
  own stays on its letter, and skipping emoji and brackets. A mixed name
  takes only its words in these scripts (Zhou 振中 gives ZH).
- **Any other script:** its first character, as Google's apps show every
  name. Never wrong where the app does not know the custom. Fluent UI's
  choice, a generic icon for scripts it does not handle, was not taken: a
  team of Arabic names would all look the same.

Names in kanji are read as Chinese, since the characters cannot tell the
two apart; Japanese is not one of the app's languages. Two Chinese
characters are set at 0.32 of the circle rather than 0.4, being about
twice as wide, and are marked `lang="zh"` wherever the circle is read as
text (People, a person's page, Members, History, the account menu), so a
screen reader on an English page reads them in a Chinese voice. Colours
are unchanged: a name keeps its colour.

The top bar's account button is the one exception. Its name is a single
label, "{initials}, signed in as {email}", and an accessible name is one
string: no screen reader is given the language of a part of it. Marking
the whole button Chinese would read "signed in as" in a Chinese voice, so
there the initials follow the page's language, as any label mixing two
languages does. In the Chinese app the page is Chinese and they are read
as Chinese anyway.

**Considered and not done.**

- **An owner adding a photo for someone.** Faster for staff who never
  will, and a face in the app the person did not put there. Initials
  carry them well enough.
- **A gravatar or a photo from a sign-in provider.** A third party asked
  about every member's email, for a picture that is often years old.
- **A photo per organization.** One face, wherever the person works.

**Deferred — each with what brings it in.**

- **Faces in notifications, recently opened and the lookup.** Trigger:
  the first of them that reads slowly with names alone.
- **"Online now", live.** A green dot needs a live connection to every
  open tab, as chat apps keep. Trigger: a reason to know who is there this
  second rather than today.
- **A manager, a mobile number, working hours.** An HR directory's, not
  a team's. Trigger: a team large enough to ask for an organization chart.
- **Korean names by their given name.** Hangul's custom is Chinese's, the
  given name's two syllables; today a Korean name shows its surname's, and
  most of a Korean team would share one. Trigger: Korean as one of the
  app's languages, or a team that asks.

**Amendment (October 2026) — who is new (ADR-079).** People marks a member
who joined in the last two weeks, with the day they joined, and its
summary line says how many did.

---

## ADR-064 — Licence expiry reminders: told at 60, 30 and 7 days, and on the day

**Context.** A licence with an expiry date shows on Home's Licences card
from 60 days out (ADR-058), and release checks it the day it runs
(ADR-050). Nobody is told. A licence that lapses is found by the run it
stops, or by whoever happens to open Home. Issue #17 asks for a notice
at 60 days. ADR-036 deferred exactly this kind of event, an absence
rather than an action, because nothing is looking: it needs a scheduled
check, and a rule for when that check does not run.

**Decision — four notices per expiry date: 60, 30 and 7 days before, and
on the day.**

- 60 days is #17's and Home's: time to start a renewal. 30 and 7 are the
  reminders a renewal that has not started needs. The day itself says it
  is the last day, and what release does from tomorrow (ADR-050).
- Each notice is sent once per licence per expiry date. A licence whose
  date changes, a renewal, starts again from the notices its new date
  calls for.
- The days stay fixed: ADR-060 kept licence notice out of what an
  organization edits.

**Decision — told to those who can act.** Everyone in the organization
who holds `product_licences.update`, who can renew or correct it, or
`production.release`, whose runs it stops. Targeting by permission, as
ADR-036 does; one notification per person, in their language
(ADR-054), linking to the Licences page.

**Decision — a check that catches up.** Hourly while the server is up,
as the file purge runs (ADR-059), over every organization. It sends, for
each active licence with an expiry date, the latest notice its date
calls for and it has not had: a server asleep for a week sends the
7-day notice, not the 30 and the 7 together. On the day, or within a
week after when the server was down, the expiry notice says it has
expired. Older than that, nothing: a licence long expired is Home's and
release's to show, not news.

**Decision — never twice.** The licence row records the expiry date and
the last notice sent for it, and a notice is claimed by updating that
row only if it has not moved, in one statement, before anything is
sent. Two instances, or two hours, cannot both claim one. A claim whose
sending fails is not retried: emission never fails, and a missed notice
is the lesser loss than a repeated one (ADR-036).

**Consequences.**

- Migration 0053: `product_licences.expiry_notice_for` (the date the
  notices count down to) and `expiry_notice_days` (60, 30, 7 or 0, the
  last sent).
- A notification type, `licence.expiring`, and the bell's link to
  Licences.
- Withdrawn licences and those with no expiry date are never told about.
- "Today" is the UTC day, as every licence date is compared (ADR-050,
  ADR-052).

**Considered and not done.**

- **Notifying everyone in the organization.** A viewer cannot renew a
  licence or run production; the bell is for what someone can act on.
- **A notice every day of the last week.** Seven alike teach people to
  clear the bell without reading it.
- **Email.** In-app only, as ADR-036 decided; the trigger below.

**Deferred — each with what brings it in.**

- **Email for licence notices.** Trigger: a licence lapsing while
  nobody who would have acted opened the app.
- **An organization's own notice days.** Trigger: a regime where 60
  days is too short to renew.

---

## ADR-065 — Staying signed in: the person's choice, and the organization's policy

**Context.** A session lasts seven days idle and thirty in all (ADR-011),
which suits a person on their own laptop. On a computer several people
share, a warehouse PC say, whoever walks up next works as whoever signed
in last, and the history says they did it. ADR-063 left this as an open
decision. Two layers answer it, the way most products do: the person
says whether this computer should keep them, and the organization may
say how long anyone stays idle.

**Decision — layer one: "Keep me signed in", the person's, per sign-in.**

- A checkbox on the sign-in page, ticked by default: today's session,
  seven days idle and thirty in all, nothing changes.
- Unticked, for a shared computer: the cookie lasts until the browser
  closes, and the server holds the session to two hours idle and twelve
  hours in all, whatever the browser does, since a browser that restores
  its tabs may keep a session cookie too.
- The choice is the session's, recorded on it, and affects nobody else.
  Google, Microsoft, GitHub and most banks offer the same.
- The browser remembers it: unticked on a shared computer, the box
  starts unticked there next time, so nobody has to remember to untick
  it, and a person's own laptop stays ticked.

**Decision — layer two: an organization's policy, the owner's.**

- Organization → a new **Security** tab, for those who may update the
  organization: "Sign out after inactivity": Off, 15 minutes, 30
  minutes, 1 hour or 4 hours, Off by default.
- "Applies to": only sign-ins without "Keep me signed in" (the default,
  the least annoying), or everyone, for organizations whose rules ask
  for it.
- It only ever shortens: a session's idle limit is the shorter of its
  own and the policy's. Google Workspace, Microsoft 365, Okta and
  Salesforce give their admins the same lever.
- Someone in two organizations is held to the policy of the one their
  session is in. Changing the policy is audited, as every organization
  setting is.

**Decision — enforced by the server, warned by the page.**

- The server refuses a session past its limit on the next request and
  ends it, so a page that dodged its own timer protects nothing it
  should not. Only real activity counts: a background request, the
  bell's poll, moves no timer (ADR-063).
- Activity is a click, a key, a scroll or a tap, not the mouse moving on
  its own: a bumped mouse or a screen saver keeps nobody signed in. While
  someone is active the page tells the server at most once a minute, so
  the two timers agree.
- A minute before the limit, a dialog: "You'll be signed out in 60
  seconds", with Stay signed in, which makes a real request, and Sign
  out. Stay signed in has the focus, so Enter or Space keeps you in. A
  page with unsaved changes adds that they will be lost. The countdown
  also shows in the tab's title, "(0:54) Signing out…", for someone
  looking at another window. Every tab of the app counts as one:
  activity in any of them keeps them all, and signing out in one signs
  out all.
- Signed out by the limit, the sign-in page says why, and brings the
  person back to the page they were on.

**Consequences.**

- Migration: `sessions.keep_signed_in` (true for every existing session,
  which is what they were), and the organization's
  `idle_sign_out_minutes` (null for Off) and `idle_sign_out_scope`.
- `/v1/auth/me` carries the session's limit, so the page knows when to
  warn without guessing.
- Built in this order, one PR: the screens on the Claude Design canvas,
  reviewed first; the migration; the server; the client; manual checks.

**Considered and not done.**

- **An organization-wide idle sign-out alone.** It punishes everyone on
  their own laptop for a problem only shared computers have; the
  person's choice is the baseline, the policy the organization's
  addition.
- **A maximum session length in the policy.** The absolute limits cover
  it today; trigger below.

**Deferred — each with what brings it in.**

- **Lock instead of sign out:** after idle time the screen locks, and
  the password or a short PIN resumes on the same page. **Switch user
  with a PIN:** several people share one terminal and change hands in
  seconds without full sign-ins. Both are the patterns of retail tills,
  warehouse handhelds and hospital terminals, good at a device shared
  all day and not the common pattern for a web app. Trigger: a native
  app, or this app run on shared scanners, handhelds or kiosks.
- **A maximum session length an organization sets.** Trigger: a
  regulated customer whose rules name one.

---

## ADR-066 — Covers in the lookup

**Context.** ADR-062 put a product's cover beside its name in Products and
Inventory, and left the top bar's lookup (ADR-056) as text: its results
are one shape for eight kinds of record, and only items have a picture.
Typing "focus" lists Focus 60 and Focus 120 as two lines of words, when
the bottle would say which at a glance.

**Decision — an item's result shows its product's cover.**

- `LookupResult` gains `coverFileId`: the product's cover for an item,
  null for every other kind. The item query reads it as Products does,
  through `coverOf()` on the gallery's index (ADR-062), one subquery per
  result, at most the lookup's own limit of them.
- The client shows it at 32 px beside the item's title and SKU, the same
  tile as the lists when there is none, so items line up whether or not
  they have a photo. Other kinds keep their rows as they are.
- The image is the 400 px thumb the lists already cached (ADR-059), so
  an item seen in Products costs the lookup nothing more.

**Considered and not done.**

- **Covers for lots and order lines in the lookup.** A lot is found by
  its code and an order by its number; the picture is the item's, and
  the item's own result is one line away.

---

## ADR-067 — The server's tests on Vitest, then Nest 12 (amends ADR-019)

> **Amended by [ADR-082](#adr-082--the-products-brand-panivo-before-sign-in-the-organizations-after-amends-adr-019-adr-051-adr-055-adr-060-and-adr-081).**
> Vitest stays the one runner for the client and the server. The repository's own scripts test with Node's runner (`scripts/*.test.mjs`), and `perf/`'s spec runs with the server's unit tests, which CI's server job now runs.

**Context.** `npm outdated` lists three majors on the server, each held
for a different reason (the `npm audit` branch, October 2026):

- **Nest 12.** ADR-019 held it for `@nestjs/throttler`, whose peer range
  stopped at Nest 11. That has lifted: throttler 6.7.1 and nestjs-pino
  5.3.1 both accept `^12`. What holds it now is how Nest 12 ships: every
  `@nestjs/*` package is an ES module only.
- **intl-messageformat 12.** ES modules only since 11, which is why
  `translate.ts` stayed on 10. The client's react-intl already runs
  12.1.3, so the two sides format ICU messages with two versions of the
  engine `translate.ts` chose so that they would agree.
- **TypeScript 7.** typescript-eslint, on both sides, accepts only
  `<6.1.0`; ts-jest only `<7`; and the Nest CLI needs TypeScript 7.1's
  programmatic API.

The first two meet the same wall. The server is CommonJS, and Node 26
loads an ES module from CommonJS (`require(esm)`), so the running server
would be fine. Its tests would not: they run under Jest through ts-jest,
and Jest's module loader does not load ES modules without an
experimental flag. 22 unit and 47 e2e spec files stand between the
server and both upgrades. The client already uses Vitest 5, and Nest
moved its own repositories and samples from Jest to Vitest for Nest 12.

**Decision — the server's tests run on Vitest, as the client's do.**

- Vitest at the client's major. One config, two projects: unit
  (`src/**/*.spec.ts`), in parallel as now; e2e (`test/**/*.e2e-spec.ts`),
  one file at a time as `--runInBand` does now, since every suite resets
  the one database, with the existing global setup and teardown.
- Globals on, so `describe`, `it`, `expect` and `beforeAll` read as they
  do. The one `jest.spyOn` becomes `vi.spyOn`.
- The scripts keep their names (`npm test`, `npm run test:e2e`,
  `test:watch`, `test:cov`, `test:debug`), so CI, `scripts/verify.sh` and
  habit stay as they are.
- Jest, ts-jest, `@types/jest`, the `jest` block in `package.json` and
  `test/jest-e2e.json` go.
- Nest's dependency injection reads the constructor types TypeScript
  emits as decorator metadata, so the test transform must emit them as
  `tsc` does. Vite 8's own transform (Oxc) first, with legacy decorators
  and decorator metadata on; `unplugin-swc`, the setup Nest's
  documentation gives, if Oxc's output does not boot the app. A spike
  settles it before anything else moves: one e2e suite green on Vitest.
- Nothing else changes in this step: Nest 11, the same tests, the same
  assertions. A test that passes on Jest and fails on Vitest is a
  difference in the runner, fixed there, never an assertion loosened.

**Decision — then Nest 12 and intl-messageformat 12, together.**

- Every `@nestjs/*` package to 12: common, core, platform-express,
  testing, config, cli and schematics. Throttler 6.7.1 and nestjs-pino
  5.3.1 already accept it. intl-messageformat 10 to 12, so both sides run
  one engine again; its breaking changes are the ES modules (11) and
  TypeScript 5.4 or newer (12), both met.
- The server stays CommonJS. Both load through `require(esm)`, so
  converting the server to ES modules is not needed for either, and is
  its own decision (below).
- Installed by name rather than by `nest upgrade`, so every change in
  the commit is one made and read here; `nest upgrade`'s report is still
  read for anything it would have changed.
- Checked beyond the suites: `smoke-auth.sh` against a running server,
  since ADR-019's reason holds and only it exercises the real rate
  limiter, which every e2e suite replaces; `seed`, `seed:demo` and the
  Performance plan check, which CI runs; and `@nestjs/config`'s
  `validate` option, which `validateEnv` uses, with its stricter
  `ConfigService.get()` types.

**Decision — TypeScript 7 waits for what holds it.** Overriding a peer
range is what ADR-019 rules out, and the Nest CLI cannot build with it
yet. Its triggers are under *Deferred*.

**Consequences.**

- Built as two pull requests, each revertable on its own:
    1. `adr-067-vitest`: this ADR; the spike, then the switch (server);
       the Tests section of `conventions.md` and the handoff (docs).
       Every suite green on Nest 11.
    2. `nest-12`: Nest 12 and intl-messageformat 12 (server); the
       handoff and release notes (docs).
- With ts-jest gone, one of TypeScript 7's three blockers goes too, and
  so does the `sprintf-js` audit finding, which sits in Jest's coverage
  chain.
- One test runner for the repository: a spec reads the same on both
  sides, and one set of habits applies.

**Considered and not done.**

- **Jest with its experimental ES module support**
  (`--experimental-vm-modules`). Experimental for years, every run
  behind a Node flag, and ts-jest's TypeScript cap stays.
- **The server as an ES module project** (`"type": "module"`). Every
  relative import gains `.js`, `__dirname` and JSON imports change, and
  drizzle-kit, ts-node and the scripts move with it. Not needed while
  `require(esm)` loads both packages. Trigger: a dependency that uses
  top-level await, which `require(esm)` cannot load.
- **Reaching TypeScript 7 now with `--legacy-peer-deps`.** ADR-019.
- **TypeScript 7.0 beside 6, by renaming packages**, as Microsoft's
  7.0 announcement suggests: `typescript` aliased to
  `npm:@typescript/typescript6`, so the tools keep 6.0's API, and 7.0's
  `tsc` installed under another name. It overrides no peer range, but a
  tool asking for `typescript` gets another package under that name, and
  two compilers check the code. It would need its own amendment to
  ADR-019. *(Added 20 October 2026.)*

**Deferred — each with what brings it in.**

- **TypeScript 7**, on both sides, in a branch of its own under
  ADR-019, once typescript-eslint's peer range includes 7. The server
  also needs the Nest CLI to support it (TypeScript 7.1's API) and an e2e
  boot showing TypeScript 7 still emits decorator metadata, checked
  explicitly rather than assumed. The client has no decorators, but needs
  more than the first: `@hey-api/openapi-ts` and
  `@formatjs/ts-transformer` (under `eslint-plugin-formatjs`) load
  TypeScript's API when they run, and 7.0 ships none, so the client's
  half of `npm run api` and ESLint would break on 7.0, though both
  packages' ranges admit it. *(Corrected 20 October 2026.)*

*Amended while building (October 2026):*

- **Jest was not a hard block on Node 26.** Nest's migration guide says
  Jest 30 loads the ES-module-only v12 packages through `require(esm)`
  from Node 24.9; only older releases fail, with
  `ERR_REQUIRE_ASYNC_MODULE`. The Context above overstated it. The move
  to Vitest stands on its other reasons: one runner on both sides,
  ts-jest's `typescript <7` gone, the `sprintf-js` finding gone, and the
  way Nest's own repositories and its ES module template went.
- **Vite's own transform was enough.** The spike's suites booted the app
  first time with Oxc emitting decorator metadata; `unplugin-swc` was not
  needed.
- **What Nest 12 asked of this code**, checked against the v12 packages:
  the tests' two deep imports resolve through the packages' `./*`
  exports; `ConfigModule`'s `validate` and `ConfigService.get(…, { infer:
  true })` keep their shape; `TranslatingValidationPipe`'s override still
  matches `ValidationPipe`; nothing uses `@Optional()`, which v12 no
  longer inherits; and the shutdown hooks (the two timers, the mail
  transport, the pool) do not depend on the order v12 now calls them in.
- **Nest 12's own `errorCode`.** `HttpExceptionOptions` now takes an
  `errorCode`, which does what `withCode()` does (conventions.md, "Error
  codes"). The exception filter writes the body itself, so the two do
  not collide. Moving to Nest's is a tidy for later, not part of this.

---

## ADR-068 — OpenAPI from the server, the client's types generated (#19)

> **Amended by [ADR-081](#adr-081--old-tabs-after-a-deploy-a-newer-build-noticed-an-outdated-client-told-amends-adr-013-adr-051-adr-052-adr-054-adr-055-and-adr-068).**
> The document's `info.version` carries the API revision, `npm run api` writes it into `client/src/api/`, and CI fails a breaking change that leaves it where it was.

**Context.** The server and the client agree on the shape of every request
and response by hand. `client/src/lib/types.ts` holds 89 types in 1,164
lines that mirror what 34 controllers send, and nothing checks them: a
field renamed on the server still compiles on the client, and only a
Playwright test that happens to touch the screen notices. Four lists are
copied as well (permissions, languages, audit actions, error codes), each
kept honest by a script of its own in CI. The copies are a sound stopgap,
and they do not scale; the 89 types are the larger risk. The packages share
no files by design, and Render builds `server/` and `client/` as separate
roots, where files outside a service's root directory are unavailable at
build time and at runtime.

**Decision — the server describes its API in OpenAPI 3.1, generated from
its code.** `@nestjs/swagger` with its CLI plugin, which reads the existing
DTOs and their class-validator decorators, so request bodies need little
new annotation. OpenAPI is the vendor-neutral standard for REST APIs (the
OpenAPI Initiative, under the Linux Foundation), not a Nest invention, so
the same document serves the client, a partner's integration, and any tool
that reads it. The four lists appear in it as enums on the fields that
carry them: a role's permissions, a person's language, an audit entry's
action, an error body's `code`.

- **Written by a script, not served.** A script builds the document from
  the application's modules and writes `server/openapi.json`, committed,
  so a change to the API shows in review as a change to the contract.
  Production serves no documentation page; an interactive one in
  development only, if wanted.
- **One freshness check replaces four.** CI regenerates the document and
  the client's types and fails if either differs from what is committed,
  as the migration snapshots are checked today. The four `check-client-*`
  scripts go once their lists come from the spec.

**Decision — the client's types are generated from the document.**
`@hey-api/openapi-ts`, with its TypeScript plugin, types only and lists as
plain constants, writes one file into `client/src/api/`, committed, so the
static site's build on Render needs nothing outside `client/`. Pinned to an
exact version: it is pre-1.0, so a minor release may change its output,
and a regenerated file is then a reviewable diff, not a surprise.
`openapi-typescript`, the better-known generator, was the first choice;
its peer range stops at TypeScript 5, below this repository's 6, and
ADR-019 does not override a peer range. Hey API's range is open-ended, but
it writes its output through TypeScript's compiler API, which TypeScript
7's native compiler brings back only in 7.1, so it joins typescript-eslint
and the Nest CLI in what TypeScript 7 waits for (ADR-067). It runs only to
generate a file, never in production, so a break shows as a failed
freshness check; if it lags behind the rest, it can run on a pinned
TypeScript 6 of its own while the project moves on. The client's `api()` stays: its
errors, codes and request ids are this application's own, and a generated
fetch client would replace what works for no gain yet.

**Decision — built in two phases.**

1. **The contract and the lists.** The plugin, the script, the generated
   file, the four lists read from it, and the freshness check in place of
   the four scripts. One pull request.
2. **The responses, module by module.** Each controller's responses
   declared as classes the plugin describes, and that module's types in
   `types.ts` replaced by the generated ones, until the file is gone. A
   module per pull request or riding along with feature work, never a
   rewrite that blocks it.

**Performance.** Nothing changes at runtime. The document is built in a
script and in CI, never per request. Types are erased when the client
compiles, and the lists that ship are the same few constants as today.
Response classes describe the response for the document and the
compiler; they do not validate it on the way out, so the Performance
budgets are untouched.

**Consequences.**

- One contract for every consumer: the client now, an integration or an
  AI model later.
- "The packages share no files" holds: each side commits what it
  generates, and only the generation reads across.
- `conventions.md` gains how to regenerate after an API change, and the
  pull request checklist the same line as "after a new migration".

**Considered and not done.**

- **Keeping the copies and their checks.** Cheap, and they work for four
  short lists; they leave the 89 response types unchecked.
- **A shared workspace package** (`packages/shared`), common in TypeScript
  monorepos. On Render it would move both services to the repository root
  with workspace installs and build filters, and it shares only what is
  written into it: the response types would still be copied by hand.
- **A typed RPC contract** (tRPC, ts-rest). Excellent when only TypeScript
  calls the API, and a rewrite of 34 controllers that ties the contract to
  TypeScript, where a B2B product will want plain REST for integrations.
- **Standard Schema responses** (Nest 12's serializer with Zod). It would
  validate every response at runtime, which costs time on the paths the
  Performance budgets measure, for checks the compiler already makes.

**Deferred — each with what brings it in.**

- **A typed fetch client** generated from the spec. When `api()` itself
  needs replacing.
- **Published API documentation, or SDKs for partners.** The first
  integration a customer asks for.
- **An AI model calling the API, a small local one included.** OpenAPI
  3.1's schemas are JSON Schema, which is how model tool calling and MCP
  describe a tool's inputs, so an operation in the spec can become a tool
  almost directly, and its summary and field descriptions become what the
  model reads to choose it. Three things are decided when it comes, none
  of them here:
    1. **A curated handful of tools, not the whole API.** A small model
       chooses well among about 5 to 15 clearly described tools, and
       poorly among hundreds of endpoints: operations selected from the
       spec, such as finding a lot, stock on hand, or drafting an order.
    2. **Its own credential.** The API authenticates a browser, with a
       session cookie and a CSRF header. An agent needs a scoped API token
       tied to a person, so permissions and the audit log apply to
       whatever it does. An ADR of its own.
    3. **A person confirms every write.** Reading is safe to automate.
       Issuing an invoice or adjusting stock goes through a draft that a
       person approves.

  Reading the UI instead, through the browser's accessibility tree (a
  snapshot of each control's role and label, which the WCAG 2.2 AA
  markup makes readable to a small model), suits testing and
  exploration, not an integration: it is slower, breaks when a screen
  changes, and acts as whoever is signed in to that browser.
  Screenshots for a vision model are less reliable still.

  Trigger: the first AI integration built on this application.

**Amended, October 2026: a response carries exactly what it declares.**
Phase 2 found that most modules returned table rows, spread into the
response or read with `select()`: each organization's id, who created
and voided a document, the pinyin columns the lookup searches by, the
reminder bookkeeping on a licence. Nothing secret, and tenant isolation
held, but none of it was the client's to read, and a contract that
describes it promises it. The compiler could not catch it: TypeScript
rejects an extra property on an object literal, not on a spread row.

So a response is projected to its declared class, and the e2e suite
holds every JSON response to `server/openapi.json` with each object
schema closed (`test/utils/response-contract.ts`). A field the document
does not declare fails the test that made the request, naming the route
and the field; so does a declared field that is missing or of the wrong
type. Test-only: production loads none of it. A route the document does
not describe yet is skipped, so the check covers each module as phase 2
converts it, and every response once it is done.

Rejected: validating responses in production, which costs every request
and turns a contract slip into a 500 a customer sees rather than a test
a developer fixes; and class-transformer's `excludeExtraneousValues`,
which strips what is undeclared instead of reporting it, hiding the
mistake, and needs every field decorated a second time.

**Phase 2 done, October 2026.** Every module's responses are declared,
projected to their classes and checked by the e2e suite, and
`client/src/lib/types.ts` is gone: the client imports the generated
types directly, and keeps in `client/src/lib/api-names.ts` only the
names its screens switch on, each read from a generated type. The
conversion found what the copies had hidden: a credit-note type declared
twice and merged into one neither response matched, an account history
the document called an object, columns typed as text that only ever
held a known list, and rows sent whole across most modules.

*Amended (#194):* `npm run api:spec` builds into `server/dist-openapi/`
(`tsconfig.openapi.json`), not `dist/`. Both builds clean their output
first, so with `npm run start:dev` running, each deleted what the other
had just written: the dev server stopped on Cannot find module until it
was restarted, and the script could lose its own file the same way. The
directory sits beside `dist/`, so every path read from `__dirname` (the
document written to `server/openapi.json`, `package.json`, the fonts)
lands where it does in the app; its incremental state is kept inside it,
and it emits no declarations, which `npm run typecheck` would read.
`api-spec-build.spec.ts` holds the configuration to that.

---

## ADR-069 — Deleting your account, and leaving an organization (amends ADR-012)

> **Amended by [ADR-070](#adr-070--deleting-an-organization-amends-adr-012-adr-059-and-adr-069).**
> Backups: a deleted account stays in the encrypted backups until they age out, 30 daily and 12 monthly (ADR-053), and its photo in the files copy for 31 days (ADR-059); no backup is restored to bring it back. After a restore from a dump taken before the deletion completed, the account is still scheduled there with its day past, and the timer deletes it again at startup. The only member now has a way past `only_member`: deleting the organization, alone or with the account in one action. An organization already scheduled for deletion does not block asking, and at completion the account waits for it.

**Context.** ADR-012 set the policy for account deletion before most of
what a person now leaves behind existed: a 30-day window, the person
anonymized rather than removed, audit rows kept, and the sole Owner of an
organization with other members blocked until ownership moves. Since
then a person has gained work details on each membership (ADR-063), a
photo (ADR-063), an account history with IP addresses (ADR-022),
notifications (ADR-036), records they opened recently (ADR-058), a
language (ADR-054), and memberships in more than one organization. None
of it has a way out, and no route lets a person leave an organization
either: only an Owner can remove a member. The open decision on member
removal versus account deletion is answered here.

The industry's answer is consistent. An account belongs to a person; an
organization's records belong to the organization. GitHub will not delete
a personal account while it is the only owner of an organization, and
Slack's primary owner hands over before leaving. Deleting a person
anonymizes one human; deleting an organization destroys a business's
books, which tax law generally expects kept for years. One must never
happen as a side effect of the other.

**Decision — only the person deletes their account.** An Owner removes a
member, which ends that membership and nothing else, as today. An Owner
cannot delete the account behind it: the person may belong to other
organizations, and their login and personal history are not the
organization's to erase. Accounts an organization owns outright, through
single sign-on, are a different model, deferred below.

**Decision — a person can leave an organization.** From the Account page,
for the organization they are working in. Leaving ends the membership,
with its work details; the account stays, signed in to another
organization they belong to, or to none. Their work in the organization
stays attributed to them by name, and the organization's audit log
records that they left.

**Decision — two blocks, the same for leaving and deleting.** Each is a
refusal with a code, and each says what to do next:

- `last_owner_with_members`: the only Owner of an organization with other
  members makes another member Owner first (ADR-012).
- `only_member`: the only member of an organization cannot leave it, and
  cannot delete their account, while it exists. An organization with no
  members is records nobody can reach. Deleting the organization is a
  decision of its own, deferred below; until it exists, the refusal says
  to add another member and make them Owner.

**Decision — deleting is requested, then completed 30 days later.**

- **Requesting.** On the Account page, confirmed with the password. The
  deletion day is set 30 days ahead; every other device is signed out; an
  email in the person's language names the day and says how to cancel.
  The blocks are checked first.
- **The deletion day** is a calendar day (ADR-052), shown as it is in the
  email and on every page, never converted to a time zone. The server
  knows no one's time zone, so a moment would name a different day in
  Vancouver than in UTC, and an email could promise a day the deletion
  came before. The deletion completes only once that day has ended in
  every time zone, at noon UTC the day after, so whoever reads the day
  has all of it.
- **The 30 days.** The person can still sign in and work, and export their
  data. Every page shows the day with a way to cancel. Cancelling clears
  the schedule and is confirmed by email.
- **Completing.** A timer, at startup and hourly as the licence reminders
  run (ADR-064), completes each deletion whose day has ended everywhere,
  each in its own transaction: one that fails is logged and left for the
  next run, without holding up the rest. It checks
  the blocks again: a membership can change in 30 days. If one now
  applies, the deletion is cancelled rather than left waiting, the
  account history records the cancellation, and the person is emailed
  what changed and how to ask again: nothing has to remember that the
  email went, and nothing is lost by asking twice.

**Decision — what completing removes, and what it keeps.**

| What | On completion |
| --- | --- |
| Name and email | `Deleted User` and `deleted-<id>@invalid`, so the address is free to register again |
| Password, photo, language | Cleared; the photo's file is purged with the rest (ADR-059) |
| Sessions and reset tokens | Deleted |
| Account history, notifications, records opened recently | Deleted |
| Memberships, with their work details | Deleted |
| Audit log | Kept, the person shown as Deleted User (ADR-012); IP addresses age out at 24 months as ADR-012 sets |
| Business records the person created | Kept, attributed to Deleted User (ADR-012) |

The `users` row stays, as ADR-012 decided: every foreign key that names
the person keeps pointing at a row, which now says nothing about them.
Each organization they belonged to records the deletion in its audit log.

**Decision — the person can export their own data first.** A JSON file of
what is theirs: profile, memberships with roles and work details,
devices, account history, notifications, and records opened recently.
Not an organization's business records or its audit log, which belong to
the organization. Available any time, and named on the deletion page.

**Rejected.** Deleting a sole member's organization with them, as ADR-012
first wrote: a personal privacy request should not destroy a business's
books, and the decision deserves its own warnings and export. Locking an
organization with no members: records nobody can reach or close. An
Owner deleting a member's account: the account is not the
organization's. Deleting immediately: a mistake could not be undone, and
the window costs one timer.

**Deferred.**

- **Deleting an organization.** Decided in [ADR-070](#adr-070--deleting-an-organization-amends-adr-012-adr-059-and-adr-069): any Owner,
  after an export or a decision not to take one, 30 days to cancel, and
  the only member's account in the same action.
- **Accounts an organization owns.** Single sign-on, where the employer
  owns the login and may delete it. Trigger: the first customer who
  signs in through their own identity provider.
- **A block in another organization.** A deletion is refused for a block
  in any organization the person belongs to, and its way past is that
  organization's Members page. Today a person belongs to one: adding a
  member refuses an email that already has an account, and invitations
  are deferred (ADR-006). Once a person can belong to two, the refusal
  must name the blocking organization, as data beside its code, and
  offer a switch to it, which nothing offers yet. Trigger: building
  invitations.

**Consequences.** `users.delete` keeps its meaning, removing a member;
deleting an account needs no permission, being the person's own act.
`users.deletion_scheduled_at` holds the deletion day, a `date` (ADR-052).
`account_events` gains the request, the cancellation and leaving;
`audit_log` gains leaving and a completed deletion. Three emails, in the
three languages (ADR-054). After completion nothing can bring an account
back, which is what the 30 days are for.

**Amendment (October 2026) — invitations (ADR-077).** An account that
belongs to no organization can be invited back, signing in to accept. An
account in another organization still cannot, so a person still belongs
to one, and "A block in another organization" stays deferred: its trigger
is now one person in two organizations (ADR-077, *Deferred*).

**Amendment (October 2026) — a session finds its organization again
(ADR-079, #144).** Leaving moved only the session that left; every other
session of the account kept pointing at the organization it had left, and
kept doing so after the account joined or started another. The session
middleware now repairs a session whose organization is none, or is no
longer one of the account's memberships, picking one as sign-in does, and
stores it. A session whose organization is still valid is never moved.

---

## ADR-070 — Deleting an organization (amends ADR-012, ADR-059 and ADR-069)

**Context.** ADR-069 let a person leave an organization and delete their
account, and deferred deleting the organization itself. Until that
exists, the only member of an organization cannot delete their account,
and that is everyone who registers: registering creates an account and
its organization together. The deferral's trigger, the first paying
customer, is near, and a customer who stops using the app needs a way to
close what they opened.

Three earlier decisions assumed an answer. ADR-012 deleted a sole
member's organization with them, and kept its audit rows for 24 months
through an anonymization pass of their own. ADR-059 released a deleted
organization's files to wait 30 days for the purge. ADR-069 refused the
sole member instead, so that a privacy request could not destroy a
business's books as a side effect. *Open decisions* listed what was left
to settle: what is exported first, who may delete, how long it can be
undone, and what the backups owe a customer who asked to be forgotten.

Business software usually answers in the shape ADR-069 already has: an
owner asks, confirms, and is offered an export of everything; a grace
period follows that an owner can cancel; then a point of no return, after
which the deletion runs and cannot be stopped. What varies is who keeps
the records afterwards.

**Decision — the business keeps its records, not us.** Once the 30 days
have passed, the organization is deleted with every row it owns and every
file. The records survive in the business's hands, through the export.

- **The duty to keep them is the business's.** Tax law asks a business
  to keep its books (in Canada, generally six years from the end of the
  tax year they cover); it does not ask the business's software provider
  to. The app is the tool the business keeps them in: we hold its data on
  its behalf, a processor in GDPR's word, while under PIPEDA the business
  stays accountable for what it hands us (principle 4.1.3).
- **A processor gives the data back, then deletes it.** That is the
  standard when a customer leaves (GDPR article 28(3)(g)), and service
  agreements commonly allow 30 to 90 days for it. Ours is the export, then
  the 30 days.
- **Keeping it would be a problem of its own.** A closed company's
  invoices, with its customers' names and addresses, held for years with
  nobody left to answer for them. PIPEDA expects personal information kept
  only as long as its purpose needs (principle 4.5), and the purpose ended
  when the business asked to leave. It would also mean storage, access
  rules for records nobody can sign in to, and a second deletion at the
  end.

**Decision — an export first, or a decision not to take one.** An Owner
can download a full export of the organization at any time, as one ZIP:

- **One CSV per record type:** every table the organization owns, every
  row and every column, ids included so rows can be joined (an invoice
  line to its invoice, a tax to its line), named for the table:
  `invoices.csv`, `invoice_lines.csv`, `invoice_line_taxes.csv`,
  `credit_notes.csv` and so on. Written as ADR-057 writes CSV: UTF-8 with
  a byte-order mark, formula injection neutralized.
- **`members.csv`:** each member's name, email, role and work details, in
  place of the bare membership rows.
- **The audit log,** which belongs to the organization (ADR-069).
- **`files/`:** every file the organization has in use (its logo, product
  images), at the largest size stored, named by its id and original name.
  A file already released is in `files.csv`, its bytes on their way to
  the purge (ADR-059).
- **`README.txt`,** in the Owner's language: what each file holds, and how
  they join.

Left out, because they belong to each member rather than to the
organization: notifications, records opened recently and sessions, which
are in each person's own export (ADR-069), and members' photos (ADR-063).

*Amended (#180):* since ADR-080 a member may hold several roles.
`members.csv` keeps them in its `role` column, their names joined with
commas, for reading; a made role's name may hold a comma itself, so
`membership_roles.csv` holds who has which role as ids: every column as
stored, but the member given by the `user_id` that `members.csv` carries
rather than a `membership_id` no file does. The README's glossary says to
count and join by it.

The export reads everything in one repeatable-read transaction, so its
files agree with each other, and streams to the browser as it reads.
Nothing is held in memory, and ADR-057's limit of 50,000 rows, set for a
filtered list, does not apply. A test fails when a table the organization
owns is neither exported nor listed as left out with a reason, as the
audit coverage test does for routes.

Each export is audited (`organization.exported`), the entry written
before the last byte is sent. Scheduling the deletion needs such an entry
from the last 24 hours, by any Owner, or an explicit decline: "I don't
need a copy" (first worded "I don't want the export"). The decline is recorded in the scheduling's audit
entry. The 24 hours keep the export close to what is deleted. The
organization keeps working during the 30 days, so an Owner can download
again near the end, and the emails say to. The last export is the Owners'
to take: once the organization is gone, nothing can make one.

**Decision — any Owner deletes, confirmed with their password.** Not only
the Owner who registered it: Owners share the organization, and any of
them can cancel too. The action reads "Close this organization". Two new
permissions, Owner-only as every new one is (ADR-004):
`organizations.export` and `organizations.delete`. No role editor exists,
so Owner-only means any Owner. The export has a permission
of its own because it is useful without deleting anything: an
accountant's year end, a move to other software. The password check is
rate limited as ADR-069's is.

**Decision — 30 days, then a point of no return.**

- **Scheduling** sets the deletion day 30 days ahead: a calendar day,
  shown as it is (ADR-052), as ADR-069's is. Asking again while one is
  pending changes nothing.
- **Every member** sees a banner on every page naming the day, with
  Cancel for an Owner. Every member is emailed in their own language
  (ADR-054) when the deletion is scheduled (by whom, the day, and that any
  Owner can cancel), when it is cancelled (by whom), and when it is done.
  The Owners' emails also say to download the export again before the
  day.
- **The 30 days.** The organization works as usual: members sign in,
  record and export. Nothing is frozen, because a business winding down
  still ships its last orders and issues its last invoices, and wants
  them in its last export.
- **Cancelling.** Any Owner, until the deletion day has ended in every
  time zone: at noon UTC the day after, the moment ADR-069's completion
  also waits for. The email says "deleted after 14 November", and until
  that day is over everywhere, the decision can be undone.
- **The point of no return.** After that, a cancel is refused with
  `organization_deletion_under_way`, and the banner says the organization
  is being deleted. The next run of the timer completes it: within the
  hour, or on Render's free plan when the server next wakes, since the
  timer also runs at startup (ADR-059, amended).

A cutoff, rather than cancelling until the run completes, because
completing is not one step. Files are erased from storage, which no
database transaction can roll back, before the rows go. A cancel that
arrived between the two would leave an organization whose files were
gone. With the cutoff, a run that fails halfway is finished by the next:
nothing can have changed the decision in between.

**Decision — completing.** `OrganizationDeletionTimer`, at startup and
hourly as the other three run (`HourlyTimer`), takes each organization
whose day has ended everywhere, one at a time. One that fails is logged
and left for the next run, without holding up the rest.

1. Erase the bytes of every file the organization owns. Erasing what is
   already gone succeeds, so a repeated run repeats this safely.
2. In one transaction:
    - lock the organization, which also holds back any upload until the
      end, since a new file's row must wait for the lock, and erase any
      file uploaded since step 1;
    - move every session working in it to that person's next
      organization, or to none: sessions cascade from the organization
      they work in, and would otherwise sign every member out;
    - delete its audit log;
    - delete the organization, and every table it owns follows by
      cascade (ADR-012).
3. After the commit, email every former member, then complete any account
   deletion that was waiting for it (below).

The audit log is deleted on purpose, by this one path, never by cascade.
Its foreign key stays `RESTRICT`, ADR-012's tripwire, so nothing else can
delete it. No audit entry records the completion, since the log goes with
it; the server logs the organization's id and the time, and nothing more.

**Decision — members keep their accounts.** Each member loses that
membership and nothing else: their account, their other organizations,
their own history. A member with no other organization is signed in to
none, as after leaving one (ADR-069): they can export their own data,
change their details, or delete their account.

**Decision — the only member deletes both in one action.** When the
Owner is the organization's only member, one step does both: "Delete my
account and my organization". One password and one request schedule both
for the same day; every other device is signed out, as ADR-069 does; one
email says both will go. Their banner says both, with Keep both. On the
day the organization goes first and the account straight after, in the
same run, so there is never an organization with no one in it.

Scheduled together, they are cancelled together: cancelling either, the
organization's from the banner or the account's from the Account page,
keeps both. One step in, one step out; a person who wants only the
organization gone cancels, then closes it alone.

ADR-069's blocks change in one place. An organization already scheduled
for deletion does not stop a person asking to delete their account; at
completion, an account whose only block is such an organization waits
for it, rather than being cancelled. If that organization's deletion is
cancelled meanwhile, the block applies again, and ADR-069's completion
cancels the account's deletion and says why. The `only_member` refusal
now names the way past: delete the organization, alone or with the
account.

**Decision — backups keep what was deleted until they age out, and never
bring it back.** A deleted organization stays in the encrypted database
backups until they expire, 30 daily and 12 monthly (ADR-053), and its
files in the backup copy for 31 days (ADR-059). Backups are kept whole:
taking one organization out of a dump would mean decrypting, editing and
re-encrypting every dump, and a backup edited after the fact is no
longer one to trust. No backup is restored to bring a deleted
organization back, whoever asks.

A restore after a disaster needs no step of its own. An organization
whose deletion completed after the dump was taken is still in it,
scheduled, with its day now past, so the timer deletes it again when the
restored server starts; its former members get the last email a second
time. Deleted accounts behave the same (ADR-069, amended). The privacy
policy states the retention, as ADR-053 requires.

**What is deleted, and what stays.**

| What | When the deletion completes |
| --- | --- |
| Every record the organization owns, with its audit log | Deleted |
| Its files | Erased from storage, then their rows deleted |
| Memberships, roles, and notifications about the organization | Deleted |
| Members' accounts and their other organizations | Kept; sessions working in it move to another organization, or to none |
| The only member's account, when deleted with it | Deleted right after, as ADR-069 deletes an account |
| Encrypted backups | Kept until they age out; never restored to bring it back |

**Rejected.**

- **Keeping a closed organization's records for the retention period.**
  The obligation is the business's, and the export meets it. Holding them
  ourselves is storage, access rules and a second deletion, for records
  nobody can sign in to.
- **Anonymizing the audit log and keeping it (ADR-012).** It records the
  organization's own work, which is gone; kept, it would describe records
  that no longer exist to readers who no longer can. It is in the export.
- **Cancelling until the run completes.** A cancel between erasing the
  files and deleting the rows would leave records without their files.
- **Deleting at once.** A mistake could not be undone, and the 30 days
  cost one timer.
- **A read-only period after closing.** Some accounting products keep
  read-only access for a while after a subscription ends. That serves a
  customer relationship that continues, not an explicit request to
  delete. Here the 30 days are that period, with everything still
  working.
- **Hiding the organization rather than deleting it.** The point is that
  it is gone.
- **Building the export from ADR-057's list exports.** Those are filtered
  views with translated headers, capped at 50,000 rows and without ids. A
  full export needs every row of every table, joinable.
- **Only the Owner who scheduled it may cancel.** Owners share the
  decision.
- **Freezing the organization during the 30 days.** A business winding
  down still has orders to ship, and wants them in its last export.

**The ZIP library.** Node writes deflate streams (`zlib`), but not ZIP
archives, and the export is many files in one download. The format looks
simple and is not: a central directory, a CRC-32 for each entry, and
ZIP64 once an archive passes 4 GB, which an organization holding its
1 GB of files (ADR-059) plus its records can approach. Written by hand,
that is code easy to get subtly wrong and tedious to test.

`yazl` (MIT) does only this. One dependency of its own, `buffer-crc32`,
which has none; no install script; it streams with backpressure, so the
archive is never held in memory; ZIP64, and UTF-8 file names, which
Chinese names need. Its author also wrote `yauzl`, the widely used ZIP
reader, and it changes rarely, which suits a format that does not.
`@types/yazl` gives its types, as a dev dependency. Considered:
`archiver`, nine dependencies for ZIP and tar alike, more than a ZIP
needs; `fflate`, with no dependencies, but its streaming interface pushes
chunks out by callback, so backpressure on a Node stream would be ours to
write.

**Deferred.**

- **Starting a new organization from an existing account.** Decided in
  [ADR-078](#adr-078--registration-open-or-by-invitation-amends-adr-006-adr-070-and-adr-077), once invitations
  were built: by an organization invitation to the account's address, and
  from Home where registration is open.
- **An organization closed by us,** for non-payment or a breach of terms.
  Nothing bills yet. Trigger: billing.
- **The export in other formats,** such as JSON or an accounting
  package's import. Trigger: a customer who asks.

**Consequences.**

- Migration 0057: `organizations.deletion_scheduled_at`, a `date`.
- Routes under `/v1/organization`: `GET export`, the ZIP; `POST deletion`,
  with the password, `declineExport` unless an export was taken in the
  last 24 hours, and `deleteAccount` for the only member; `DELETE
  deletion`, to cancel. `/auth/me`'s organization gains
  `deletionScheduledAt`, for the banner.
- Refusal codes `organization_export_required` and
  `organization_deletion_under_way`.
- Audit actions `organization.exported`, `organization.deletion_scheduled`
  (with the export taken or declined) and
  `organization.deletion_cancelled`.
- Three emails and the README, in the three languages (ADR-054).
- `OrganizationDeletionTimer` joins main.ts's list, ahead of account
  deletion. Its service lives in `core/auth`, beside account deletion,
  which it shares the day, the emails and the only member's account with;
  eslint already allows the global connection there, which completing
  needs, since it reads every organization. The export, which reads one,
  goes through `TenantDb` in `core/organizations`.
- `yazl` as a dependency, `@types/yazl` as a dev dependency.
- Where the export and the deletion sit in Settings, and the banner, are
  designed on the canvas before the client is built.
- Build order: the server (the migration, the export, scheduling and
  cancelling, completion, the emails, e2e tests); then the client, after
  the design; then the docs (manual checks, the handoff).

**Amendment (October 2026) — settled with the design.** Five points the
canvas settled before the client was built:

- **The export downloads as a file, and the server says when it was
  last taken.** The browser saves the ZIP straight to disk, rather than
  the page fetching it first, as the account's JSON export does: an
  organization's ZIP can approach 1 GB with its files, too much to hold
  in a tab, and a page cannot tell when a native download has finished.
  So the organization's read carries the last full export, when and by
  whom, from the audit entry each export writes. The Profile section
  shows it ("Last downloaded 3 days ago by Mei Lin"), and the dialog
  reads it again when the window regains focus, to know the 24 hours are
  met.
- **The name typed to confirm.** Besides the password, the dialog asks
  for the organization's name, typed as it is, and the request carries
  it; the server refuses one that does not match. The password says who
  is asking, the name what they are about to delete, which matters most
  to an Owner of more than one organization.
- **Days left beside the day, and why Close is off.** The day reads
  "after 14 November 2026 (in 30 days)", as expiry reads in days left
  (ADR-055). While the export is neither taken nor declined, or the name
  or the password is missing, a line under the buttons says what is
  still needed: a disabled button alone does not.
- **A reminder 7 days before.** Every member is emailed once, in their
  language, when the deletion day is 7 days away, and Owners are told to
  download everything again. The hourly timer sends it, and
  `organizations.deletion_reminded_at` records that it went, so a run
  repeated or two instances send it once; cancelling clears it.
  Migration 0058.
- **The banner can be hidden for today, not longer.** Its × hides it on
  that device until the next day, when it comes back; kept in the
  browser, since hiding it is the reader's own convenience and changes
  nothing for anyone else. From 7 days before the day, the moment the
  reminder goes out, it has no ×, so nobody misses the final week; nor
  once the deletion is under way, when nothing can be done.

**Amendment (October 2026) — settled while building.** Three more, from
the reviews of the build:

- **"Deleted together" is recorded on the account, not guessed.** The
  first build read it from matching days, which a member deleting their
  own account the same day matched too, and then from a column on the
  organization, which outlived an only member who left. It is now
  `users.deletion_with_organization_id` (migrations 0059 to 0061, none
  released): set with the account's day when the only member deletes
  both, and cleared in the same statement as that day by every cancel and
  by completion. The database holds the rest: a check refuses the link on
  an account with no deletion day, a trigger on memberships clears it
  whenever the membership ends, by leaving, by an Owner's removal or any
  later path, and its foreign key clears it when the organization is
  deleted. Cancelling the organization's deletion clears the linked
  account's day in the same transaction, so both stay or neither does.
  The session carries it on the account, the organization's id and name,
  so the account's own banner can say both wherever the person is
  working.
- **One deletion stage, decided by the server.** The session says where a
  pending deletion stands: `scheduled`, `lastWeek` or `underWay`, from one
  function, on the server's UTC day, so the banner's ×, the reminder and
  the cancel's cutoff draw the same lines, and no browser near midnight
  disagrees. Likewise the last export says whether it is fresh, and who
  took it by id, so "by you" never matches two people of one name.
- **The emails do not hold the answer.** Those sent when a deletion is
  scheduled or cancelled start without being awaited, once the change has
  committed, each failure logged; the reminder and the done email, sent
  by the timer, are awaited. The export's coverage test also follows the
  cascading foreign keys out from the organization, so a table it owns
  through a parent, as `role_permissions` is, cannot be left out
  unnoticed.

**Amendment (October 2026) — completing marks its start first (#117).**
Completing as written above left two windows, each about a second wide.
A cancel committing in the second of the cutoff, after a run had erased
the files but before it took the lock, kept an organization whose files
were gone: the cancel and the timer each read the clock for themselves.
And an upload whose row committed before the run's lock, but whose bytes
landed after its erase, left bytes that no purge finds, since the purge
works from rows.

Completing now marks its start before it touches storage, in
`organizations.deletion_started_at` (migration 0062):

1. In one transaction: lock the organization, check that it is due, and
   set the mark. A cancel either commits before this, and the run finds
   nothing due, or waits for it and is refused, as is every later cancel,
   whatever either clock says. The stage the session reports reads the
   mark too, so no screen offers a cancel the server would refuse.
2. Erase the bytes of every file, as before.
3. In one transaction: lock the organization, which now needs the mark
   rather than the day, erase any file since step 2, and delete it, as
   before.

An upload takes its file's id first and writes its bytes under it, and
only then opens a short transaction: the organization's upload lock
(ADR-059), the mark, read under a key-share lock on the organization, the
quota, and the row. It is refused once the mark is set, or once the
organization is gone. Refused, or with a write that failed, it deletes
every one of its keys once every write has settled, since no row would
lead a purge to them, and a delete that ran ahead of a write still in
flight would be undone by it. So the
run misses nothing: a row saved before the mark already has its bytes,
and an upload after it is refused and cleans up. A server that dies
between the write and the row leaves bytes behind, as a failed write
could before.

Writing inside the transaction would have closed the window too, and was
the first build. The review of it found the cost: a database connection,
and the upload lock, held for as long as the bucket took, so a gallery's
worth of photos at once could hold most of the pool. The storage client
now also gives up after 5 seconds connecting and 30 waiting, the second
set to throw rather than only warn, so a stalled bucket fails an upload
rather than holding it.

The mark is never cleared: a run that fails after it leaves it, and the
next run finishes the deletion.

**Amendment (October 2026) — closing stays the Owners' (ADR-080).** With
roles an organization makes, `organizations.delete` is never offered in the
role editor, so closing the organization stays the Owners' alone.

---

## ADR-071 — Documents as PDF, drawn on the server (amends ADR-046, ADR-054, ADR-055 and ADR-070)

**Context.** Three documents print today: the packing slip (ADR-041),
the invoice (ADR-046) and the credit note (ADR-047). Each is a page the
browser prints, in the look ADR-055 settled and the customer's languages
(ADR-054). There is no PDF. A person who needs one chooses Save as PDF in
the print dialog, one document at a time, and what lands on paper varies
with the browser: its margins, its headers and footers, where it breaks a
page. The server cannot make a PDF at all, so ADR-070's export carries an
organization's data but not its documents as issued, which a bookkeeper
expects to keep (#118, from the walkthrough in Chinese).

Three more documents have no printed form. A return authorization
(ADR-047) is something a customer is sent and quotes back. A purchase
order is something a supplier is sent. A pro forma invoice was deferred
by ADR-046: a valued document that creates no debt, sent before goods
ship, for prepayment, an import permit or a customer's own approval.

**Decision — one design per document: the PDF, drawn on the server.**
The server draws every document as a PDF with pdfmake (MIT, built on
pdfkit), from the same data its page reads, the snapshots of an issued
document included. Print opens that PDF in a new tab and the browser's
PDF viewer prints it; Download PDF saves the same file; the export puts
the same files in its ZIP. The print pages and `PrintSheet` retire, so
each document has one design, and paper looks the same from every
browser.

Each PDF is served beside its document's read route, under the same
permission, `inline` for Print and `attachment` for Download PDF, named by
the document's number. A draft invoice's PDF is marked Draft on every page
and in its file name; a voided invoice keeps the mark it prints with now.

**Decision — six documents.** The packing slip, the invoice and the credit
note keep the look approved in ADR-055, carried over to the PDF and
checked against screenshots of the print pages. The other three are
designed on the canvas and approved before they are built:

- **Return authorization:** its number, to quote on the parcel; the
  customer; the lines authorized and their quantities; where to send them.
- **Purchase order:** the order's number; the supplier; the lines and
  quantities, each price where one is set and blank where not, since a
  purchase is sometimes raised before its price is known (ADR-046); the
  expected date; where to deliver.
- **Pro forma invoice:** below.

**Decision — the pro forma invoice (amends ADR-046's deferral).** Made on
demand, from any sale order that is not cancelled, draft or confirmed, as
long as every line has a price; an unpriced line is refused with what to
do, as confirming is. It is titled Pro forma invoice and says Not a tax
invoice; it carries the order's number and the date it was made, for
SO-1234, 15 October 2026, and no number series of its own; it is stored
nowhere, so making it again shows the order as it is then. Its tax is
what the invoice would charge, worked out by the invoice's own code, and
it prints in the customer's document languages. Each one made is an audit
entry, `order.pro_forma_made`, with its total: the trail of what was sent.

ADR-046's deferral gave it its own type and number series. Neither is
needed for a document that is never owed and never in the books, and
business software of this size makes it the same way, from the order:
Odoo offers it on any quotation or sales order. A sample order (ADR-042)
has no prices, so it gets no pro forma until declared values come with
customs details (deferred).

**Decision — the words, the rules and the paper.** The words a document
prints move to the server's catalogues in all three languages, under the
ids they have now, and the server applies ADR-054's rules: each label in
the first language, then the second, the same size and weight; dates and
money once, in the first; data as typed; a product's name by its own
rule. The logo is ADR-060's: the organization's own when the PDF is made,
if it prints logos. A page left the paper size to the printer, and a PDF
has to choose, so each organization gets one, Letter or A4, set where its
branding is and defaulting from its registered address: Letter in Canada
and the United States, A4 elsewhere.

**Decision — fonts in the repository.** Noto Sans, for English and
French, and Noto Sans SC, for Simplified Chinese, in Regular and Bold,
under the SIL Open Font License, are committed to `server/assets/fonts`
with their licence: about 20 MB. They load once, when the server starts,
and each PDF embeds only the characters it uses. Nothing is fetched at
build or at run time, so documents render offline, on any host, and in
mainland China.

**Decision — the export (#118, amends ADR-070).** The ZIP adds a
`documents/` folder: every invoice and credit note as a PDF, named by its
number, exactly as Download PDF gives it. A time in the CSVs is written
`2026-10-15 18:54:11`, in UTC, rather than as Postgres writes it with
fractions and an offset, so a spreadsheet opens it as a date. The README
gains a glossary in the Owner's language: what the main tables' columns
hold, that times are UTC, and how an audit action is named (the thing,
then what happened to it, as `user.created`), the Audit log showing each
in words. The CSV headers stay as stored, so a later import maps them back
to the database. The download link carries `?locale=` with the app's
language, which the README follows, since a plain link cannot otherwise
say which language the Owner reads.

**Decision — performance.** Drawing a PDF is work for the processor, not
the database. The export draws its documents one at a time as it streams,
so an organization with thousands of invoices takes longer but never holds
them all in memory. Each PDF route and the export are budgeted as every
route is under ADR-051, the figures set from their first measurement on
the volume seed, with a probe for one invoice and one for the export.

**Rejected.**

- **A headless browser on the print pages,** which would keep one layout
  in the browser's hands: Chromium is hundreds of megabytes and needs a
  lot of memory per page, against a 512 MB server; it would need a second
  way to sign in to those pages; and it ties the deploy to one platform's
  setup.
- **The print pages kept beside the PDFs:** two designs of every document,
  kept in step forever.
- **Storing each PDF when its document is issued:** the snapshots already
  freeze everything a document prints but the logo, which ADR-060 already
  takes from the day it is printed. Storage and a migration for nothing.
- **@react-pdf/renderer:** React on the server, and more dependencies than
  pdfmake for the same tables.
- **pdfkit alone:** tables, repeated headers and page breaks by hand,
  which pdfmake already does on top of it.

**Deferred.**

- **Emailing a document** to its customer from the app. Trigger: the first
  customer who asks.
- **Declared values and customs details:** a sample's value, HS codes,
  country of origin. Trigger: the first shipment that needs them.
- **An organization's own typeface** on its documents, uploaded and
  checked to cover its languages, since a font that lacks a character
  prints an empty box. Until then every document uses Noto Sans and Noto
  Sans SC. Trigger: the first customer who asks.
- **Traditional Chinese**, which has no locale yet (ADR-054).
- **An electronic invoice format** that some countries require, such as
  China's fapiao. Trigger: the first customer who must issue one.
- **A PDF kept exactly as sent.** Trigger: a customer, or a law, that
  needs the file itself rather than the document drawn again.
- **Tagged PDFs,** with a structure tree and a document language, which
  pdfmake does not write (#162). Trigger: a customer or an authority that
  asks for accessible documents.
- **The budgets for the PDF routes and the export,** and their probes for
  one invoice and one export (*Decision — performance*): nothing is
  measured yet, so no figure is set. Trigger: the first `npm run perf` on
  the volume seed after this ADR's pull request merges (ADR-051), or
  sooner, a PDF or the export reported slow.

**Consequences.**

- pdfmake is a new dependency, with pdfkit and fontkit under it, its
  peers resolving without an override (ADR-019).
- The server grows by its fonts, about 20 MB.
- The client loses `PrintSheet` and three print pages; the printed words
  leave its catalogues for the server's.
- A migration adds each organization's paper size.
- The manual checks for printing are rewritten for the PDFs, and gain the
  three new documents and the export's.

**Amendment (October 2026) — orders get numbers of their own.** This ADR
assumed an order had a number to print. It has only its partner's
reference, which an order placed by phone lacks and two suppliers may
share. A purchase order sent to a supplier needs ours, and a pro forma
names its order by it.

Each order now takes a number when it is created, a draft included, from
the organization's series beside the invoice's (ADR-046): SO-000001 for a
sale, PO-000001 for a purchase. A deleted draft leaves a gap, which an
order may have; an invoice may not, and takes its number at issue as
before. Existing orders are numbered by the migration, oldest first, per
organization and direction, and each series carries on after them.

The number heads the order's page, leads the orders list, the lookup's
results, Home's recent records and the orders CSV, and is searched
beside the reference, which stays as theirs.

Deferred: **numbering settings**, what each organization may change of
its numbers: its prefixes, digits and next number. Trigger: ADR-073,
after the organization's time zone that its periods need (ADR-072).
*Built by ADR-073 (October 2026):* each organization sets each series'
prefix, width, reset and next number.

**Amendment (October 2026) — where goods go, and what every page says.**
The designs approved on the canvas settle what the three new documents
print where the decisions above left it open.

Where to deliver and where to send back is a *site*'s address, not the
registered one, which is often a head office the goods never see. A site
(ADR-024) holds an address of its own, set on it in Locations; the
deferral of per-site addresses in ADR-024's open items ends here, since
these documents force them. A purchase order chooses Deliver to, a site,
set for it when the organization has one; an RMA chooses Send back to,
from the site its goods shipped from unless changed. Each prints the
site's name and address, and the registered address only when the site
has none yet.

Every document, the six of them, carries its kind, its number and the
page, "Page 1 of 2", at the foot of each page, so a second page cannot
pass for a loose sheet. An RMA whose goods are expected ends with a
label to cut out and tape to the box: the RMA's number, large, and where
it goes. A purchase order and an RMA say who raised them, by name, job
title and work phone from the membership; not by email, which may be
personal, on a document that leaves the organization.

Deferred: **payment details** on invoices and pro formas, a free text
saying how to pay, which a pro forma sent for payment in advance needs.
Trigger: the first customer who pays from one.

**Amendment (October 2026) — two things the build settled.** A packing
slip's times, the day it says the goods shipped and names its file by,
are read in UTC. The print page read them in the browser's time zone,
which a server does not have, and an organization keeps no time zone of
its own yet, so a shipment made in the evening in Vancouver prints the
next day's date. It follows the organization's time zone once there is
one (#41).

Automatic paper takes its country from what the document copied at
issue: an invoice's or a credit note's seller country. The other four
copy nothing, and take the registered address's country when they are
printed. An organization that moves keeps its issued invoices on the
paper they were issued on, as everything else they print stays as
issued; a size the organization chose still wins for every document.

**Amendment (October 2026) — order numbers by their series (ADR-073).**
Sale and purchase orders follow their series' settings, their period the
day each is made in the organization's zone. A `/` in a number is written
`_` in a document's file name, and in the export's `documents/`.

**Amendment (October 2026) — prices on orders (ADR-080).** The purchase
order's and the pro forma invoice's PDFs need `orders.view_prices` beside
`orders.view`. The packing slip, which shows no prices, does not.

---

## ADR-072 — Each organization's time zone (amends ADR-052 and ADR-071)

**Context.** Every calendar day the server decides is the UTC day
(`todayUtc`, ADR-052), and the documents that date themselves by a
moment read it in UTC (ADR-071, amended). From 4 pm in Vancouver in
winter, 5 pm in summer, the server is already in tomorrow: a receipt is
costed at tomorrow's rate if one was entered early, a licence that
expires today blocks a release this afternoon, and a packing slip prints
tomorrow's date. ADR-052 deferred an organization's time zone until a
day was decided wrongly near midnight (#41). ADR-073 needs it too: the
year in a document's number is a calendar fact, and an order made on the
evening of 31 December in Vancouver is already 1 January in UTC.

**Decision — the zone is the organization's, stored by name.**

- `organizations.time_zone`, an IANA name such as `America/Vancouver` or
  `Asia/Shanghai`, never an offset: a name carries daylight saving and
  any change a government makes, where an offset is wrong half the year.
  Checked against the zones the server knows, and stored under its
  canonical name.
- One per organization, not per member: whether a licence has expired,
  which rate a receipt takes and which year a number belongs to must be
  one answer for everyone in it.
- A new organization takes the registering person's browser zone, which
  is almost always where the business is. Existing ones get `UTC` from
  migration 0066, the zone they use today, so nothing changes until an
  Owner sets theirs.
- Changed on Settings → Organization → Profile, beside the registered
  address, under `organizations.update`, and audited as
  `organization.updated` with the old and new zone. A change applies
  from then on: nothing already dated or printed moves.

**Decision — moments stay UTC; the zone answers calendar questions.**
Every `timestamptz` is stored as it is now. The zone is read only to say
which day a moment falls on, and what today is: `(moment AT TIME ZONE
zone)::date` in SQL, `Intl.DateTimeFormat` with the zone in TypeScript.
Both read the IANA tz database.

**Decision — today is the organization's.** `todayUtc()` becomes
`todayIn(zone)`, still the one place, called with the organization's
zone by:

- licence status at release (ADR-050), and licence reminders (ADR-064),
  each organization's on its own day;
- the rate a receipt is costed at (ADR-048);
- Inventory's expiring-within filter, which read the database session's
  `current_date`, the last place that did;
- Home's cards (ADR-058), and the export's file name.

The session carries the zone, so the client counts days left, Home's
today and the date-range presets in the organization's day rather than
the browser's: a member travelling sees the warehouse's day.

**Decision — a moment's day is the organization's.** What dates itself
by a moment prints that day in the organization's zone: the packing slip
and its file name, the purchase order, the RMA and the pro forma, and
the arrival day a cost correction looks its rate up on (ADR-048).
Invoices and credit notes are unchanged: their dates are calendar days
already (ADR-046, ADR-052).

**Unchanged, on purpose.**

- Screens show a moment's time in the viewer's own zone, as now: the
  clock a person reads is the one on their wall.
- CSV exports keep times in UTC and say so (ADR-057, amended): a file is
  read by other systems.
- Deletion days still end "in every time zone" (ADR-069, ADR-070): a
  cutoff that must hold for every member, wherever they are.

**Considered and not done.**

- Guessing the zone from the registered address: the province is typed
  by hand, and Canada alone has six zones. The browser at registration
  reports its computer's zone, which is right far more often, and an
  Owner corrects it once.
- Each member's own zone deciding the business's day: at 5 pm in
  Vancouver it is already the next morning in Shanghai, so one member
  would see a licence as valid and another as expired, at the same
  moment.

**Consequences.**

- Migration 0066. The session's and the organization profile's responses
  gain `timeZone` (`npm run api`).
- Tests pin the clock either side of midnight in Vancouver and in
  Shanghai, and across a daylight-saving change.
- Manual checks: a receipt, a release and a packing slip made after 5 pm
  in Vancouver carry today's date.

**Deferred.**

- A setting on the Account page for a member to see times in a zone
  other than their device's, such as someone in China reading the
  Vancouver warehouse's times. Trigger: the first member who asks.
- A time zone per site, for warehouses in different zones. Trigger: the
  first organization with sites in two zones, likely together with
  ADR-073's series per site.

**Amendment (October 2026) — settled while building, and in review.**

- **Days are decided in TypeScript only.** Node and Postgres each carry
  their own copy of the zone rules, so the server asks only Node:
  `todayIn` and `dayIn`, one pair on each side, and a query that needs a
  day is given it, never `AT TIME ZONE`.
- **The zone travels with the request.** It is read with the membership on
  every request, at no extra query; a timer or an export's later stream
  reads the row (`timeZoneOf`). A stored zone the server can no longer
  read counts as UTC, with a warning, so one organization cannot stop the
  hourly reminder run.
- **Current names, and only names.** Node's data still spells about
  twenty zones the old way (`Asia/Calcutta`, `Europe/Kiev`), which Safari
  no longer lists, so the server stores the current name (`Asia/Kolkata`)
  and the client names zones the same way in every browser. Only `UTC` or
  an Area/City name is taken: `Etc/GMT+8`, `EST` and `MST` are fixed
  offsets under other names, refused like `+05:00`. The picker leaves
  them out, and offers this computer's zone only when the server would
  take it. Registration never fails over the zone: one the server does
  not know starts the organization on UTC.
- **What the zone decides, in full.** Besides the list above: every CSV
  export's file name; an invoice's void date, on screen and in its PDF,
  and a shipment's date on the order; the dates the issue, void and
  credit dialogs and the exchange-rate dialog start from; date ranges on
  lists of moments (ADR-057, amended); and Home, which no longer takes
  `?today=` (ADR-058, amended).
- **What it does not.** A deletion countdown counts from each reader's own
  day, as before: a deletion day ends everywhere, so each person counts to
  it by their own calendar. A banner hidden "for today" is the reader's
  day too.
- **Before an Owner sets it.** "Nothing changes until an Owner sets
  theirs" holds for the server, not for the screens. For an organization
  still on UTC, Home, days left and the date presets follow UTC rather
  than the computer, so from 4 pm in the Americas they show tomorrow.
  Profile says so, with one button for this computer's zone: set it right
  after deploying.
- **British Columbia stopped changing its clocks** after 8 March 2026:
  Vancouver is UTC−7 all year, so its day turns at 07:00 UTC, from 5 pm
  the day before. Only time-zone data 2026b (April 2026) and later knows,
  so the server's Node must carry it, or Vancouver's days begin an hour
  late from 1 November 2026. Postgres's copy no longer matters, since it
  is never asked. Tests about a clock change use one that has happened.
- **Accepted.** Another member's open screen keeps the old zone until its
  session is read again. A reminder that a licence "expires today" is not
  sent again if the zone later moves back a day.
- **Deferred: a receipt's day after a change of zone.** A receipt takes
  the rate for the organization's today as it arrives; a cost correction
  reads the arrival day in the zone as it is now. After a change of zone
  the two can look up neighbouring days' rates. Storing each receipt's
  rate day settles it. Trigger: the first organization that changes its
  zone after receiving stock in another currency.

---

## ADR-073 — Each organization's document numbering (amends ADR-046, ADR-047, ADR-056 and ADR-071)

**Context.** Every number the app gives is fixed in code: `INV-`, `CN-`,
`RMA-`, `SO-` and `PO-` in `document-numbers.ts`, six digits, one counter
per organization and series that never restarts (ADR-046, ADR-047,
ADR-071 amended). That suits a new business in Canada and few others. A
business moving from another system must carry on from its last number.
Many keep a year in the number and start again each January; Chinese
businesses often number orders by the day (`XS20261017-001`), and Odoo
writes `INV/2026/00452`. France and Italy take at most 20 characters,
France refuses a period, and France requires invoices in a continuous,
chronological sequence. ADR-071 deferred numbering settings to this ADR,
after ADR-072 gave each organization its day: which year or day a number
belongs to is a calendar question.

**Decision — five series, today's numbers as their defaults.**

| Series | Default | Its date |
| --- | --- | --- |
| Invoice | `INV-` | its invoice date |
| Credit note | `CN-` | its credit date, a void's included |
| Return authorization | `RMA-` | the day it is raised |
| Sale order | `SO-` | the day it is created, a duplicate or an RMA's replacement included |
| Purchase order | `PO-` | the day it is created |

Each has a prefix, a minimum width and a reset. The defaults are six
digits and no reset, so nothing changes until an Owner changes it.

**Decision — the prefix.**

- Capital letters, digits, `-`, `_` and `/`. It starts with a letter or a
  digit, ends with anything but a digit, and has no `//`; or it is empty.
  Ending in a non-digit means a number splits one way only: `INV-000050`
  is `INV-` and 50, which the refusals below rely on.
- Lowercase is refused, not changed: `INV-1` and `inv-1` must never be
  two numbers, and what is saved is exactly what was sent (#133). The
  field writes capitals as they are typed.
- Date tokens `{YYYY}`, `{YY}`, `{MM}` and `{DD}`, each at most once, and
  never `{YYYY}` with `{YY}`. A token prints digits, so a prefix may start
  with one and may not end with one: `INV-{YYYY}-` prints `INV-2026-`,
  `SO{YYYY}{MM}{DD}-` prints `SO20261017-`.
- Printed, the prefix is at most 16 characters, and at most 20 with the
  minimum width: Italy's field and France's portal take 20. Tokens have
  fixed widths, so the printed length is known when it is saved.
- `/` is for numbers carried over from Odoo. A file name writes it as
  `_`: `INV_2026_00452.pdf`, in the export's `documents/` too.
- Not `.`, which France refuses, nor `+`, which a web address reads as a
  space.

**Decision — the width.** At least 1 to 10 digits, padded with zeros. A
longer number simply grows: `999999`, then `1000000`.

**Decision — resets and periods.**

- Per series: never, yearly, monthly or daily. A reset needs its period
  in the prefix: a year for yearly, the year and month for monthly, all
  three for daily. Otherwise `INV-0001` would come back each January and
  collide. A date with no reset is allowed: the counter carries on, and
  the date is shown.
- **The document's own date** picks the period and fills the tokens. An
  invoice's and a credit note's date are calendar days already (ADR-046,
  ADR-052). An order's and an RMA's is the day it was made, in the
  organization's zone, through `dayIn` (ADR-072).
- **Earlier periods stay open.** An invoice dated 31 December and issued
  on 5 January takes 2026's next number, `INV-2026-0453`, not 2027's
  first. A number and its date then always agree, which is what an
  auditor counting a year's invoices checks.
- **Each period's counter keeps the prefix and width it numbers with.** A
  change applies to today's period and every later one. An earlier period
  goes on as it was, so that backdated invoice reads like the rest of
  2026, not with this year's prefix.

**Decision — the next number.**

- Shown for each series as it will be taken today, in full:
  `INV-2026-0453`.
- It sets today's period; a period not yet begun starts at 1.
- Never lower than where the counter stands, except under a printed
  prefix no document carries yet: a restart by hand, such as moving to
  `F-` and starting at 1.
- Sent only when changed. A form left open while invoices are issued then
  neither drags the counter back nor is refused over a number nobody
  touched.

**Decision — refusals, before anything is written.** Malformed settings
are a 400. Two conflicts are a 409, each with its code (conventions.md,
"Error codes"):

- **Two series that could print the same prefix**
  (`numbering_prefix_shared`, naming the other series): the same text once
  each token counts as its digits. `SO-` beside `SO-` clashes, two empty
  prefixes clash, and so do `S{YY}-` and `S26-`. This holds across all
  five series, not only the two that share `orders`: a number names one
  document in an organization, and a customer quoting it never means two.
- **Numbers a document already carries** (`numbering_number_taken`, naming
  the document and the lowest next number that would be accepted): any
  document in the organization whose number the series would print from
  today on, in today's period at or above the next number, or in a later
  one at or above where it stands. Values are compared, not text, so
  `INV-0050` is refused beside `INV-000050`, and a gap left by a deleted
  draft is no hole to fall through.
- The unique indexes on each table stay, as the last guard.

**Decision — date order, a switch per organization, off by default.**

- When it is on, an invoice or credit note dated before the latest issued
  in its series and period is refused (`numbering_date_order`, naming that
  document and its date). This is France's rule.
- It is checked after the number is taken, under the counter's lock, so
  two issues at once cannot both pass. A refusal hands the number back
  with the rest of the transaction.
- Orders and RMAs are numbered as they are made, so they are always in
  order.
- Off by default: Canada has no such rule, and a forgotten invoice dated
  last week must go through.

**Decision — where it is kept.**

- `document_numbering`: a row per organization and series, holding its
  prefix as written (tokens included), its width and its reset. Written
  for every organization by the migration and at registration, so taking
  a number always reads a real row. The switch is
  `organizations.documents_in_date_order`.
- `document_sequences` gains `period` in its primary key (`''` for no
  reset, then `2026`, `2026-10`, `2026-10-17`), and the printed `prefix`
  and `digits` the period numbers with. Existing rows become period `''`,
  with today's prefix and six digits. Counters are made on first use, as
  now. `document_type` gains `$type<DocumentType>()` (#131).
- `takeNumber` stays one locked statement: an insert from the series' row
  that, on conflict, increments the period's counter and returns its
  prefix, width and number. It is given the document's day; SQL only
  writes the day out, never converts it (ADR-072, amended). The cost is
  still one row lock per document, now per series and period.
- A save locks today's counter for each series it changes, so a number
  taken meanwhile lands wholly before the change or wholly after it.

**Decision — the screen.**

- A Numbering section on Settings → Organization → Documents. For each
  series: its prefix, with the tokens a tap away; its width, reset and
  next number; and the number it will take today. Then the date-order
  switch.
- One Save sends all five series, so two series can swap prefixes in one
  save.
- Every member can read it; `organizations.update` changes it (ADR-061).
- `GET` and `PUT /v1/organization/numbering`, audited as
  `organization.numbering_updated` with each series as stored before and
  after.
- Designed on the Claude Design canvas before it is built.

**Decision — what else reads the prefixes.**

- **The lookup (ADR-056, amended):** a query starting with a series'
  printed prefix puts that kind first. The prefixes are read from the
  organization's settings rather than `inv-`, `cn-` and `rma-` in code,
  and order numbers join them.
- **File names** of each document and of the export's PDFs write `/` as
  `_`.

**Unchanged.**

- A number already given never changes: it is stored on its document.
- Drafts take no number.
- Invoices and credit notes stay gapless, now within each series and
  period (ADR-046, ADR-047 amended).
- An order may still have a gap left by a deleted draft (ADR-071,
  amended).

**Considered and not done.**

- **A pattern with the counter anywhere,** as Odoo's `%(year)s` allows:
  text after the digits stops a number splitting one way only, and the
  refusals above stop being exact.
- **Periods by the day a document is issued:** a December invoice issued
  in January would print 2027.
- **Settings on the counter table:** each period's row would repeat them,
  and a series with no number yet would have nowhere to keep them.
- **A Postgres sequence per series:** not transactional, as ADR-046
  found.

**Consequences.**

- Migration 0067: `document_numbering` with every organization's five
  rows; `document_sequences`' period, prefix, digits and primary key;
  `organizations.documents_in_date_order`.
- `takeNumber`'s six callers pass the document's day: issue, void,
  credit, an order's creation and duplication, an RMA, and an RMA's
  replacement order.
- Three error codes in `error-codes.ts`; `npm run api` for the new routes.
- Both tables join the export without a change (ADR-070). Its column
  glossary names the new columns.
- Tests:
  - each refusal, and a restart by hand;
  - a backdated invoice across New Year;
  - an order made at 23:30 on 31 December in Vancouver;
  - two issues racing with date order on;
  - a save racing an issue.
- Manual checks: a new section 27.

**Deferred.**

- **A series per site.** Invoices and credit notes have no site, and a
  sale has none until it ships. A `{SITE}` token and a site on the
  counter fit later. Trigger: the first organization numbering each
  warehouse apart, likely with ADR-072's zone per site.
- **Invoices and credit notes on one counter.** Trigger: the first
  organization whose law or accountant asks for it.
- **A year that starts in another month,** such as India's from April or
  any fiscal year: a yearly reset from a chosen month, printed as
  `2026-27`. Trigger: the first organization whose year does not start in
  January.
- **Run numbers, and batch codes from them:** decided in ADR-074, which
  waits for its own trigger. A run's number becomes a sixth series here.

**Amendment (October 2026) — settled while building, and in review.**

- **The counter keeps the prefix as written, not as printed.** A series
  that never starts again, or starts again each year but shows the month,
  prints several prefixes within one counter's period, so
  `document_sequences.prefix` holds the prefix with its tokens
  (`INV-{YYYY}-`) and each number prints it from its own date. The rule
  stands: an earlier period goes on with what it numbered with.
- **A save takes today's counters first, as decided.** Before reading
  anything, a save takes today's counter for each series it changes,
  opening it at 1 if it is not yet open, so an issue waits for the save or
  the save's checks see the issue. First built locking only the settings,
  which taking a number never waits for: an issue during a save could open
  today's period with the old prefix and keep it for the rest of the
  period. The review found it; a test holds a save open while an issue
  waits, and fails without the lock.
- **Refusals carry details.** `numbering_number_taken` and
  `numbering_prefix_shared` name their series in the API's names
  (`invoice`, `creditNote`), and the first the least next number accepted,
  in `details` beside the code (conventions.md, "Error codes"), for the
  screen's Use. `numbering_date_order` has its way out too: Change it on
  Organization → Documents, for those who may change the numbering.
- **Going below the numbers given is the same refusal.** Below where the
  counter stands, while documents carry the prefix, `numbering_number_taken`
  says the numbers up to the last given; a number a later period would give
  again is refused the same way, with no least number.
- **Date order sits in `takeNumber`,** for invoices and credit notes
  alike, read after the counter's lock rather than inside its statement:
  an issue that waited for a save then follows a rule the same save turned
  on.
- **Where the code lives.** `takeNumber` moved from `modules/invoices` to
  `modules/numbering`, beside the rules in `numbering-format.ts`; the
  client's `lib/numbering.ts` holds the same rules, so the screen says what
  the server would refuse as it is typed. `DEFAULT_NUMBERING` is in the
  schema file. `dispositionOf` writes `/` as `_` for every download, and
  the export takes the same helper from `core/files`.
- **What the screen added, from the canvas.** The last number given under
  each next number, and the next period's first under Prints as; three
  common formats per series, keeping its letters, none with `/`; Change
  the numbering? before a change to a series is saved, the date-order
  switch alone saving straight away; each field in error says why, and
  names it to a screen reader; under an invoice's or credit note's date, a
  line when the date falls in another period than today's, read only once
  the date moves off today; and issuing says the number given: "Invoice
  issued as INV-2026-0453".
- **Accepted.** The number-taken check reads every matching number back
  into Node, and the last numbers given take five queries, three on
  unindexed columns: both run only when the numbering is saved or opened.
- **Tested otherwise than planned.** An order made at 23:30 on 31 December
  in Vancouver needs the server's clock pinned, which the end-to-end suite
  cannot do; an organization in Kiritimati, whose daily prefix prints its
  own day rather than UTC's, shows the same thing, beside ADR-072's tests
  of `dayIn` either side of midnight.

---

## ADR-074 — Run numbers, and batch codes from them (deferred)

**Status.** Decided, not built. It waits for its trigger, at the end;
nothing in the code changes until then.

**Context.** A run has no number. Its `id` is a UUIDv7, and its
`reference` is typed, optional and not unique ("a batch number or the
maker's works order"); a run without one is titled by its planned
quantity. The code of the batch it makes, the lot, is typed too, at
Record output. In the demo both are typed as the same text,
`FOC-2609-01`: in a GMP batch record the batch number and the lot number
are usually one identifier. Two *Open decisions* entries asked for this,
production order numbering and generated lot codes, and said to answer
both at once. Their forcing function, a production module, has existed
since ADR-032, and ADR-073 builds the series a run's number needs.

**Decision — a sixth series.** Production runs join ADR-073's series:
`B-` by default, six digits and no reset, so `B-000124`. A run takes its
number when it is created, its period from the day it was created in the
organization's zone, as an order does (ADR-071, amended). Runs are
cancelled, never deleted, so a cancelled run keeps its number. The
migration numbers existing runs oldest first, per organization, and the
series carries on after them. Every ADR-073 rule applies: the prefix,
tokens, resets, the next number and both refusals, with runs among the
documents one number names.

**Decision — the number names the run.** It heads the run's page and
leads the runs list, the lookup (its prefix ranked as ADR-073's are),
Home's recently opened, the lot trace and the runs CSV. `reference`
stays, optional, for the co-packer's works order, and is searched beside
it.

**Decision — a new batch's code starts as the run's number.**

- At Record output, "Start a new batch" fills the code with the run's
  number. A second new batch from the same run gets `-02`, then `-03`.
- The code stays editable: a co-packer's own lot code, or a business's
  own scheme, is typed over it. A suggestion the item already carries
  (lots are unique per item) moves on to the next suffix.
- The code is a suggestion until saved. Two people recording at once may
  see the same one, and the unique index refuses the second.
- Batch codes are not gapless: a code typed over leaves nothing behind.
- Unchanged: adding output to an existing batch needs no code, and a lot
  received from a supplier stays typed, since its code is printed on the
  box and is not ours to invent.

**Considered and not done.**

- **A counter per item, with the product in the code,** as `FOC-2609-01`
  reads: it needs a product token and a counter keyed by item, not by
  organization. The run's number gives every batch a unique code without
  either.
- **The number at release rather than creation:** a planned run needs a
  name to be talked about, as a draft order does.
- **Reserving a code when the dialog opens:** codes nobody saved would be
  held for nothing.

**Consequences, once built.**

- A migration: `production_orders.number`, unique per organization,
  filled for existing runs; a sixth `document_numbering` row for every
  organization; `production_order` joins `DocumentType`.
- The run's page, the runs list, the lookup, Home, the trace and the CSV
  show the number; Record output fills the batch code; the Numbering
  section gains a row.
- Designed on the canvas before it is built, and a manual checks section.
- The number-taken check's list of numbered tables in
  `numbering.service.ts` is raw SQL: `production_orders` joins it by hand,
  or the check stops seeing run numbers without failing to compile
  (ADR-073's review).

**Deferred.** A `{PRODUCT}` token, a short product code in a generated
batch code. Trigger: the first organization wanting the product in its
batch codes.

**Trigger.** The next production work, or the first organization asking
for run numbers or generated batch codes, whichever comes first.

---

## ADR-075 — Text size: the person's choice, and text that grows (amends ADR-055)

**Context.** ADR-055 set five type sizes in `rem`, body 14.5px and
caption 12.5px, so a browser's font size already scales them. Two things
keep that from the people who need it. Most never find the browser's
setting, and many work on a shared or locked-down computer where they
cannot change it. And the widths beside the text are in px: where text
does grow, it is cut with "…" or squeezed into a column of words, in the
232px rail, the 300px summary, the 200px email cut and the fields in
dialogs. Chinese at 12.5px is harder still, its characters denser than
Latin letters. Browser zoom (⌘ +) scales everything and stays the way to
200% (WCAG 1.4.4), but it scales the spacing too and pushes the layout to
its narrow form, which a person who only wants larger text did not ask
for.

**Decision — a Text size choice, in three steps.** Standard, Large and
Larger: 100%, 112.5% and 125% of the browser's font size, set as
`font-size` on `<html>`.

- A percentage multiplies the browser's own setting rather than replacing
  it, so someone who has raised it there keeps that and gains this on
  top.
- Every type size is in rem, so one value moves every screen. At Larger,
  body is about 18px and caption about 15.6px.
- Standard is today's design: nothing changes for anyone who does not
  choose.
- No step past 125%. The breakpoints are in px and do not move with the
  text, so a larger step would crowd the wide layout rather than help;
  past that is browser zoom's job, which narrows the layout as it goes.

**Decision — where it is chosen.** In the avatar menu beside the colour
mode and the language, and on the signed-out pages beside the language:
a person who cannot read the sign-in page needs it before they can sign
in. Each option is drawn at the size it gives, so the choice is seen
before it is made.

**Decision — this device's, as the colour mode is.** Kept in the
device's storage, applied before the first paint, and followed by the
device's other open tabs. The size a person needs depends on the screen
as much as on them: a phone held close, a monitor across a warehouse
desk. No column and no migration.

**Decision — a width that holds text is in rem.** A width beside or
around text (a label column, a field, a panel, the rail, the email cut,
a flex basis) is written with `rem()` from `theme/rem.ts`, so it grows
with the text and the cut or the wrap falls where it does at Standard.
Spacing, borders, icon-only boxes and image sizes stay in px. A font size
written in px on a page ignores the choice, so the three that were
(Home's summary and its cards' figures, the status pages' message)
become rem.

**Decision — less motion when asked.** Under `prefers-reduced-motion:
reduce` transitions end at once and scrolling jumps: the drawer, menus,
dialogs and the gallery's zoom. What says something is still happening,
a spinner or a skeleton, keeps moving.

**Also fixed.** A variant's chevron on a product had no name, so a screen
reader announced only "button". It is now named "Details of" its SKU,
with `aria-expanded` saying whether it is open. The accessibility spec's
product gets a weight, so the chevron is on the page axe scans.

**Considered and not done.**

- **Raising Standard.** ADR-055's sizes were compared on real screens and
  chosen; a person who needs more chooses it, and nobody's screen moves
  unasked.
- **Saving the size to the account**, to follow the person to another
  device: a column for a choice that depends on the screen. Deferred,
  below.
- **A size per organization:** what someone can read is theirs, not their
  employer's.
- **Scaling the spacing as well:** that is zoom, which the browser already
  does.
- **ADR-055's density setting** stays deferred: it is rows per screen, a
  separate question from the size of the words.

**Consequences.**

- Client only: `theme/text-size.ts` holds the choice, `TextSizeSelect`
  offers it, and `main.tsx` applies it before rendering. `theme/rem.ts`
  is the one px-to-rem helper, which the theme and the widths share.
- Tests: the store and the select in Vitest; `e2e/text-size.spec.ts`
  checks the choice applies, survives a reload and is offered signed out,
  and that at Larger the main screens never scroll sideways, at desktop
  width and at 320px (WCAG 1.4.10).
- conventions.md's The look gains the rem rule; manual checks section 28.
- No server change and no migration.

**Deferred.** The text size on the account, applied at sign-in as the
language is (ADR-054). Trigger: someone asking for their size to follow
them to another device.

**Amendment (October 2026) — settled while building, and in review.**

The text size was built as decided. Walking the main screens at Larger
found pages that scrolled sideways on a phone, nearly all of them at
Standard too; the larger text only made them wider. Each was fixed where
it is shared, so one change covers every screen that uses it.

- **A box of 100% meant to be one pixel.** The time zone form's polite
  live region was written `width: 1, height: 1`, which `sx` reads as 100%,
  so it ran from beside the rail past the window's edge. It is `'1px'`.
  Written out rather than MUI's `visuallyHidden`, which would make
  `@mui/utils` a direct dependency for one box.
- **Banners wrap.** The theme's Alert wraps: its message keeps a floor of
  10rem beside the icon, and its buttons drop to their own line at the
  right when they do not fit beside it. The closing organization's banner
  had dragged every page wider while a deletion was pending.
- **Rows of buttons wrap.** PageHeader's action row wraps, and a page
  passes its buttons as a fragment, so each is a child of that row; 15
  pages passed a row of their own, which never wrapped. The theme's
  DialogActions wraps the same way. A list's date range wraps.
- **A button never shrinks, and breaks its label only as a last resort.**
  `MuiButton` keeps `flexShrink: 0` and drops `nowrap` for a cap at its
  container's width, so "New version" still never stacks beside other
  buttons, and a label wider than all its space, on a phone at Larger,
  takes a second line instead of running off the screen. In a table cell
  it stays on one line; the table scrolls. conventions.md's rule that
  labels never wrap is narrowed to this.
- **Grids cap their floor at the row.** Home's three grids ask for
  `min(rem(…), 100%)`: a 320px floor was wider than a phone's row at any
  size.
- **The audit log on a phone.** Its filters sit in FilterRow, and the
  Action column has a 260px floor, so the table scrolls in its box rather
  than squeezing the entry into single words. Codes in it stay whole, as
  ADR-055 asks.
- **The rail's widths** are in `layout/rail.ts`: as rem() calls, not
  literals, they broke fast refresh's rule in `side-nav.tsx`.
- **The review's simplifications.** `useTextSize()` returns only the size,
  and the picker calls `setTextSize`, as `useBrand` and `setBrand` work;
  the picker has no `renderValue`, since MUI shows the option's label.
  Five more widths that hold text went to rem: a person's label column,
  the numbering digits field, the History drawer, the People search and
  the gallery's zoom readout.
- **Tests.** `text-size.spec` walks 14 screens at Larger, at desktop width
  and at 320px, and names the innermost element past the right edge, so a
  failure says what to fix. On fresh organizations it proves Home with
  its cards and a closing banner on a phone, both of which the shared
  walk met only by chance; it opens a dialog on a phone in French, where
  labels run longest, and reads a button's transition with and without
  reduced motion.
- **Manual checks.** Section 28, MC-2801 to MC-2807, and MC-R15 to MC-R20
  for the fixes, each in the commit that made it.
- **Not done.** A lint rule against px widths: nothing yet enforces the
  rem rule, and the simplify pass found five widths the first pass
  missed. Trigger: the next px width to slip through a review. Splitting
  the walk into a test per screen, faster but unlike `accessibility.spec`.

---

## ADR-076 — The audit log in words: no ids, references named, every field translated (amends ADR-018, ADR-038, ADR-054 and ADR-057)

**Context.** The demo seed filled the audit log for the first time, and in
简体中文 it read like this:

```text
发票草稿已创建 · Kits Wellness Co-op · draft
tax code id: 01a15178-47ce-7033-b359-7c4f69f99300 · shipment id: 01a…
```

Three faults, each on every screen that shows an entry (the audit log, a
record's History, Your activity, a person's recent work) and worse in the
CSV:

- **Ids.** A recorded reference prints as a UUID: `orderId`, `invoiceId`,
  `taxCodeId`, `shipmentId`, `roleId`, `deliverToId`, `sendBackToId`,
  `returnId`, `defaultSalePriceListId`, the replacement order in an RMA's
  context, and the ids in an export's filters. The client already hides a
  UUID inside an object, so a line's id vanishes, but at the top level it
  prints. A UUID means nothing to a person, and ADR-054 already says a raw
  id never reaches a screen.
- **English in every language.** Field names are made from the code's own
  names (`label()` turns `taxCodeId` into "tax code id") and never
  translated, and values print as stored: "status: fulfilled", "resolution
  replace", "true". Three labels store English words: an invoice before
  its number ("· draft"), a lot ("FOCUS-60CT lot …") and a movement's
  reason. The handoff lists "field names inside an audit entry" as a known
  edge; #129 is the general case.
- **The CSV is the raw row.** Action and Record type are keys
  (`order.updated`, `return_authorization`), Record falls back to the id,
  and Details is the payload as JSON.

ADR-018 decided which fields are recorded and ADR-038 named the record a
row is about. Neither said what a person sees for an id or a code inside
the details, so the screens printed what was stored.

Checked before drafting, as the working agreements ask: the Open decisions
entry "Audit log export and payload search" (export shipped with ADR-057;
search waits for someone to ask, not fired); the handoff's known edge
above (closed here for the audit log; validation messages keep
theirs); #129 (closed here for the audit log); #133, fields logged as
sent rather than as stored (references are named from the stored row
after the handler, so they read as stored; other values stay #133's).

**Decision — no UUID anywhere a person reads.** Not on a screen, not in a
CSV, a PDF, an email or a notification. A UUID appears in two places only:
inside a link's URL, which nobody reads, and in the API's JSON, which is
for programs (ADR-063: CSV is for people; JSON is for programs). A CSV
carries no id column: an integration that needs ids reads the API.

**Decision — a reference is named when it is written.** ADR-038's rule
for the record itself, extended to every reference in the payload, as
Odoo's field tracking and Salesforce's field history keep the name a
linked record had at the time:

- After the handler, the interceptor replaces each reference field's id
  with `{ id, label }`, on both sides of a `{ from, to }`, through the same
  one-resolver-per-kind map ADR-038 set up. The history keeps the name the
  record had then; a rename does not reach it, and a deleted record keeps
  a name.
- New resolvers: a shipment (its order's number, and its tracking number
  when it has one), a return (its order's number), a role, an item (its
  SKU) and an order line (its SKU). Deliver to and send back to are sites,
  which already have one. A file reads as what happened to it ("the logo
  replaced"), as product images already do.
- ADR-038's exception stands: no person is named in the log. A filter on a
  person in an export reads as "one person" (or "you", on Your activity),
  never their name.
- A label holds names, numbers and codes, never a word in any language.
  An invoice before its number is labelled with its customer alone; the
  action already says it is a draft. A lot is its SKU and code; a movement
  its SKU, with its reason recorded in the payload; an exchange rate its
  currency, with the day read from the payload.
- A list of lines (an RMA's) is named by item, its SKU and quantity, at
  write time.

**Decision — one vocabulary, declared once, that the code cannot skip.**
`AUDIT_FIELDS` on the server, beside `AUDIT_ACTIONS`, declares every key a
payload may hold and what it is: text as typed (a reference, a reason), a
day, a moment, money, a quantity, a yes or no, a language, a time zone, a
colour, one of a named set (an order's status, a direction, an RMA's
resolution, a licence policy, a sign-out scope, a rail, a paper size), or
a reference to a kind. `@Audited({ fields })`, `recordPrevious` and
`recordContext` take only declared keys, so recording a new field without
saying how it reads fails to compile, as an undeclared action already
does.

**Decision — the server words every entry, for the screens and the CSV
alike.** One formatter, in the reader's language, as the server already
words errors, emails, PDFs and CSV headers (ADR-054, ADR-071):

- `GET /v1/audit`, a record's history, Your activity and a person's recent
  work return each entry's action named, its record type named, and its
  details as a list: a field's name, and its value or its change, each
  value as text, a day, a moment (formatted by the client, in the
  reader's own zone), or a reference (`{ kind, id, text }`).
- The client renders that list. A reference is a link, its text the name
  and its id only in the URL, when there is a page for its kind and the
  reader may open it (ADR-016); otherwise plain text. The client no longer
  derives a word from a key, and `AUDIT_ACTION_NAMES` with its check move
  to the server's catalogues.
- The CSV writes the same words: When, By (name, then email, as the
  screens show who, ADR-063), Action and Record type named, Record its
  label, Details the list joined as one line.

Two formatters, one on each side, would drift: the seed's copy of the
interceptor's payload rules did within a day.

**Decision — rows already written are read, not rewritten.** ADR-038
rejected joining today's names and refused backfills, because a log must
not claim something was done to a name it did not have then. A bare id in
an old row reads as its kind in words ("an order", "a tax code"), linked
when the record still exists and the reader may open it. Field names and
values are words at read time, so old rows read translated like new ones.
Old labels keep their English words ("· draft"); there are few, and only
in development and demo data.

**Considered and not done.**

- **Hiding ids on the client.** What the formatter already does inside
  objects: it drops information instead of naming it, and the CSV, written
  on the server, keeps every id.
- **Naming at read time.** ADR-038's reason: a renamed record would rewrite
  its own past.
- **An id column in the CSV, for matching.** The CSV is for people; the
  API is for programs.
- **A formatter on each side.** Shown above.

**Deferred — each with what brings it in.**

- **Payload search.** As before: when someone asks for it.
- **A page for every kind.** A shipment links to its order and a role to
  Members; a kind with no page is plain text. Trigger: a kind that gains a
  page.

**Consequences.**

- Built in this order, one PR: the vocabulary and the new resolvers; the
  interceptor naming references; the formatter and the response change,
  with `npm run api` and the client's generated types (ADR-068); the CSV;
  the client rendering, retiring `label()` and the client's action names;
  manual checks. No migration: the payload is JSONB, and old rows are read
  as they are.
- The seed's audit helper shares the interceptor's naming, as it already
  shares `auditPayload`.
- A test renders a sample of every declared field in each language and
  fails on a UUID, a camelCase word, or a value left as its code;
  `npm run i18n:check` already fails on a missing translation.
- ADR-018's allow-list becomes the declared vocabulary; ADR-038's labels
  reach the payload; ADR-054's "a raw id never reaches a screen" now means
  UUIDs too; ADR-057's audit export writes words.

*Amended while building:*

- **References are named in `AuditService.record`**, not in the
  interceptor, so every writer that records through it is covered: the
  routes, the demo seed, and the pro forma and the organization's export,
  which write their own entries. Deleting an account, and scheduling or
  cancelling an organization's deletion, write their rows straight to the
  table inside their transactions; those rows hold no reference.
- **A shipment is named by its order's number**, and its tracking number
  when it has one, and links to its order: it has no page of its own, so
  its order's id is stored beside the shipment's when the row is written.
  A row written before this has no order's id and reads as plain text.
- **The raw payload stays in the API**, beside the words, as the event's
  data for programs; removing it was considered while building and not
  done, since programs read it and no person does.
- **A reference reaches the client as `{ text, link: { kind, id } }`**,
  not as the `{ kind, id, text }` the Decision describes. The link is null
  where there is nothing to link to: a person, a record of no stated
  kind, or a shipment written before its order's id was stored. The
  client follows it only where its kind has a page and the reader may
  open it; a kind with no page, such as a tax code or a site, reads as
  plain text.
- **Dates in a payload are recorded as sent and read as the days they
  name:** an export's From, sent as the organization's midnight
  (ADR-072), in the organization's zone; its To, sent as the start of the
  day after (ADR-057), as the day before, and named To; a day stored as
  UTC midnight before ADR-052, as that day. So an export reads as the
  days chosen. A date is never walked into `{}`.
- **Recording an undeclared field fails to compile** through `@Audited`'s
  fields, `recordPrevious`, `recordContext`, the seed's helper or
  `AuditService.record`, which take only declared keys. The compiler does
  not see a row that deletion inserts into the table directly, or the
  keys inside an export's filters, which are its list's query: an e2e
  test reads a scheduled deletion and an export's search in words. A test
  words every declared field in all three languages, as a value and as a
  change.
- **A time zone reads as its generic name and city**, as the client's
  picker says it: "Pacific Time (Vancouver)", the name in the reader's
  language and the city as the zone's id spells it.
- **A person filter reads as "you" to the reader**, as on Your activity,
  and as "one person" to anyone else; never as a name (ADR-038).
- **Old rows read a reference as its kind in words** ("an order", "a tax
  code"), never as today's name.

---

## ADR-077 — Invitations: how a person joins an organization (amends ADR-006 and ADR-069)

**Context.** ADR-006 shipped self-serve registration and left adding
people to an Owner or an Admin, who types the newcomer's name, email, role
and a password on Members and passes the password on by hand. The first
organization with staff meets everything that follows from that. The
person adding them knows the password, so two people can sign in as the
account until it is changed, and nothing makes it change (Open decisions).
The password travels by chat or text. Nobody proves the address: a typo
makes an account whose password reset mails a stranger, and
`email_verified_at` stays empty. An address that already has an account
is refused, so someone who left an organization (ADR-069), or whose
organization was closed (ADR-070), can never be added to one again. And
the newcomer arrives with a password and nothing else: nothing says who
added them, as what, or what is expected of them.

**Decision — Invite replaces Add member.** On Members, Invite asks for an
email, a role, the language to write to them in, and an optional note
from the inviter, up to 500 characters of plain text ("You'll receive
deliveries at the North site"). The app sends a link. The person opens
it, sees who invited them, to which organization, as what, and the note,
then gives their name and chooses their own password. The membership
exists from that moment, never before, and nobody but the person ever
knows the password.

- `POST /v1/users` goes, and with it the only route that sets another
  person's password. `seed:demo` keeps creating its colleagues with known
  passwords, without a route, since a demo's accounts are meant to be
  signed into.
- Inviting needs `users.create`, as adding did, and the role follows the
  rule a role change follows (ADR-016): an Admin cannot invite an Owner.
  As with demoting an Owner, Admins do not act on an Owner's invitation
  at all: they neither resend it, copy its link nor revoke it, and
  Invited hides all three for them on such a row.
- The role starts at Viewer, the least access, and the inviter raises it
  on purpose.
- The person names themselves. The note is a message from the inviter,
  not a job title: ADR-063 keeps work details the person's own.

**Decision — one invitation, by email or by a copied link.** Email is the
default. Copy link puts the link on the clipboard instead, for an inbox
that does not work yet, or a newcomer reached by text or WeChat. Either
way it is one invitation with one live link: copying issues a new link
and spends the emailed one, as a resent verification does (ADR-017), and
the invitation records which way its live link went. The Invite dialog's
own Copy link makes the invitation with `delivery: "link"`: no email at
all, the link handed back, and the event recorded as the link copied.

- Accepting an emailed link verifies the address, since only its inbox
  could have read it. Accepting a copied link does not, and the usual
  verification email follows, as at registration.
- A copied link can be forwarded, so it keeps the same terms as an emailed
  one: one use, the same expiry, the role and the address fixed.
- Either way the link is built on the server from `CLIENT_URL`, as
  verification's and reset's are (ADR-017), never from the request's
  host, which a caller can set to a site of their own. Copy link receives
  it from the server, the only side that knows the token.

**Decision — seven days, then resend.** A link lasts seven days, long
enough for a start date next week. It works to the end of its seventh
day in the organization's time zone, so "until 26 October" on Invited,
on the page and in the email holds all that day. Resend and Copy link issue a fresh
link and restart the seven days; Revoke ends it. Members lists
invitations under a heading of their own, Invited, with the address, the
role, who invited and when, and its link: emailed or copied, with its
last day, or ended and not accepted. People, Home and the lookup never
count an invitation as a member.

- Revoke takes the invitation off Invited at once, and its address can be
  invited again straight away. "Ended and not accepted" is an expired
  link, with Resend.
- Expired and revoked invitations are deleted 30 days later by the hourly
  timer: an address nobody accepted is not the organization's to keep.
  That is the invitation's row only. The audit log keeps who invited
  which address, which is what it is for, under ADR-012's retention. A
  revoked invitation leaves Invited at once, and its row stays until
  then.
- An accepted invitation stays with its membership, so its note can be
  read again, and goes when the membership ends.

**Decision — the token is ADR-017's third purpose.** `auth_tokens` gains
the purpose `invitation`: stored as SHA-256, consumed in one statement,
swept like the others. The link opens a page in the app,
`/invitation?token=…`. The page reads the invitation with a POST that
spends nothing and accepts with a second POST that spends the token, so a
mail scanner's fetch neither accepts nor burns it.

- Everything else (organization, role, note, language, inviter, expiry,
  how the link went) is a row in a new `invitations` table. ADR-006's
  "without touching the schema" did not hold: a token cannot carry a role.
- Reading tells the page what it shows and nothing more: the address it
  is for, which the page shows read-only; the organization's name and
  logo, and its deletion day while it is being deleted, so the page says
  at once that it takes nobody new; the inviter's name and email, which
  the page shows as the email does, while the inviter is still a member
  (below); the role with its description; the note; the link's last
  day; whether the address has an account, which decides between
  creating one and signing in to join; and the language the page starts
  in. A used, expired or revoked link reads as ended, all three alike,
  so an old or guessed link says nothing more. Accepting one is refused
  with `invitation_ended`, so the page tells an ended link from a field
  it refused.
- The logo comes inline, as a PNG `data:` URL about 64 px tall, sharp at
  the page's 32: a signed-out page cannot read the file route. Nothing in
  the repository sets a Content-Security-Policy for the static site, and
  helmet's covers only the API's own responses, so it loads; a policy
  added later must allow `img-src data:`.
- Accepting writes the account, the membership and the invitation's
  acceptance in one transaction, so no account exists without a
  membership (ADR-004), and signs the person in, as registration does,
  following Keep me signed in as sign-in does (ADR-065): they have just
  chosen the password. A new account accepts with its name, its
  password, the page's language and Keep me signed in.

**Decision — who may accept.**

- **An address with no account:** the person creates one by accepting.
- **An address whose account belongs to no organization,** having left
  one or seen it closed: the person signs in on the invitation page and
  accepts, and the membership joins the account they have. This is the
  way back in that ADR-069 and ADR-070 left without one. Signing in goes
  through `POST /v1/auth/login`, so its rate limit, timing protection, new
  sign-in email, account events and Keep me signed in stay in one place;
  accepting then takes that session and the token alone, and is refused
  unless the session's address is the invitation's.
- **An account whose deletion is scheduled** (ADR-069): refused at
  accepting with `account_deletion_scheduled` and the deletion day. The
  page offers Keep my account right there, the banner's action, then
  Join; the link stays live meanwhile.
- **An address whose account belongs to another organization:** refused
  at accepting, with the reason, to the person who owns the address. The
  inviter is not told why, which would say that the address has an
  account somewhere. One person in two organizations is deferred, below.
- **Signed in as another address than the invitation's:** refused; the
  page offers to sign out.
- **An address already a member, or already invited, here:** refused at
  inviting (`already_a_member`, `already_invited`, the latter offering
  Resend). Members already shows both, so this tells the inviter nothing
  new. An expired invitation is still one: `already_invited` then says
  its link has ended, never giving a last day, and Resend starts it
  again.
- **While the organization is being deleted** (ADR-070), nobody is invited
  and no invitation is accepted: a person would join to watch it close.

**Decision — inviting needs a verified address, and has a daily limit.**
An invitation is mail from our domain to an address someone typed, the
reason security emails escape names. An inviter whose own address is
unverified is refused (`email_unverified`), with a link to resend their
verification. An organization issues at most 50 links in any 24 hours,
emailed or copied, resends included (`invitations_daily_limit`). The
refusal says when the next link can be made: the moment the oldest of
the 50 turns 24 hours old, shown in the reader's time zone ("You can
invite again from 14:20"), never "tomorrow". The refusal carries that
moment for the screen to show; its message names the time in the
organization's zone. This settles one half of "What unverified access
should be limited to" (Open decisions).

**Decision — in the language the inviter chooses.** The newcomer has no
account, so no language of their own. The invitation carries one, the
inviter's by default and changeable in the dialog. The email uses it, and
the invitation page starts in it, with the signed-out pages' language
choice beside; the account takes the language the page was in when they
accepted, whether the inviter's choice or one they picked there. They
read the page and accepted in it: following the browser could switch
them to a language they never saw. The email says who invited them, by name and by address so
it can be told from a forgery, to which organization, the role in words,
the note, and the last day of the link in the organization's time zone
(ADR-072). Names and the note are escaped. It names the organization in
words only: mail apps block a `data:` image, so it carries no logo. It
is signed "Sent for Northside Naturals by" the name `MAIL_FROM` gives its
address, or "Sent for Northside Naturals." when it gives none, never an
address.

**Decision — a role described by what it lets a person do.** The dialog,
the invitation page and the email describe each role in a line a
newcomer understands:

- **Owner:** everything, including costs, issuing invoices, settings and
  closing the organization.
- **Admin:** day-to-day work: stock, orders, production and drafting
  invoices. Can add and remove members.
- **Viewer:** looks at orders, stock and invoices, and changes nothing.

They replace `SYSTEM_ROLE_DESCRIPTIONS`, whose Admin line, "Manage
members and roles", undersells it, and are translated by key as the role
names are (ADR-054). When the roles change, these lines change with them.
The page and the email say "Mei Lin (mei.lin@…) invited you as a
Viewer.", then the role's line as the dialog has it: one voice, with no
second version to keep in step.
`roles.description` keeps the English line, so the export's `roles.csv`
says the same: new organizations store it, and the migration rewrites a
system role's description only where it still holds the old default.

**Decision — an invitation is the organization's.** While its inviter is
still a member, the email and the page name them, by name and by address.
Once they have left the organization or deleted their account (ADR-069),
the email and the page name only the organization ("Northside Naturals
invited you as a Viewer.", the note "From Northside Naturals"), never a
departed or deleted member: the name would send the newcomer to someone
who is gone, and a deleted account's is "Deleted User". The read carries
no inviter then, and a resend's email is written the same way. Invited
keeps who sent each invitation, as the organization's own record, and
whoever may act on it resends it.

**Decision — a send that fails is said, not hidden.** As for a reset
(ADR-017), not as for verification: an invitation reported sent that
never left leaves someone waiting for nothing. The invitation is kept,
and the dialog says the email did not go and offers Copy link. Its link,
which nobody received, is spent, and Invited shows "Email not sent" in
the warning tone, with Resend and Copy link: never "ended and not
accepted", which reads as if the person ignored it. Its audit row stays,
since the invitation exists, and its payload says the email did not go:
the audit log reads it in words as "Email not sent", the key declared as
ADR-076 asks.

**Decision — recorded on both sides.** The organization's audit log gains
`invitation.sent`, `invitation.resent`, `invitation.link_copied` and
`invitation.revoked`, each with the address and the role, and
`invitation.accepted` with the new member as its actor; every payload key
is declared in each language (ADR-076). The account's own history
(ADR-022) gains `account.invitation_accepted`.

**Considered and not done.**

- **Keeping Add member with a password, changed at first sign-in** (the
  `must_change_password` of Open decisions). It narrows the window in
  which two people know a password without closing it, and the person who
  set it could sign in first and choose the next one. A copied link serves
  the same newcomer with nobody else knowing anything.
- **An open link anyone may join by,** as chat workspaces offer. A role
  here grants access to stock and money, so each invitation names one
  address.
- **Inviting by phone number:** it needs sign-in by phone, deferred below.
- **A tour on first sign-in:** the newcomer's welcome is its own ADR, next
  but one (Open decisions, "A newcomer's first sign-in").

**Deferred — each with what brings it in.**

- **One person in two organizations:** accepting into a second, switching
  between them, and ADR-069's block naming the organization it comes
  from. Trigger: the first person who needs two, or a practice
  organization for staff (ADR-058's sample data).
- **Signing in without an email,** by a username or a phone number, for
  floor staff who have none, and inviting by phone. Trigger: the first
  customer whose staff have no email.
- **A QR code for the link,** to scan with a phone at the dock. Trigger:
  the first invitation handed over in person.
- **Seat limits,** counted at inviting. Trigger: plans and billing (Open
  decisions).
- **An organization's own link lifetime.** Trigger: a customer who asks.
- **Several addresses at once,** as Google Workspace and Slack allow: one
  dialog, many people. Each may need their own role and note, and one at
  a time is simpler to build and to check. Trigger: a customer adding
  many people together, seasonal staff for one.

**Consequences.**

- One migration: `invitations`, scoped to the organization through
  `TenantDb`, with a partial unique index allowing one pending invitation
  per address per organization; `invitation` added to `auth_tokens`'
  purposes and `account.invitation_accepted` to `account_events`'
  actions, with the schema test's vocabulary check where one applies.
  Someone invited may have no account, so `auth_tokens` gains
  `invitation_id`, deleted with its invitation, and `user_id` becomes
  nullable: an exclusive arc, as ADR-028's, checked with `num_nonnulls`
  as exactly one of the two, the invitation's exactly when that is the
  purpose. Verification and reset narrow `user_id` once, where their
  token is consumed.
- The organization's export writes `invitations.csv`, its own record of
  whom it invited, and the README's glossary names its columns in all
  three languages (ADR-071).
- Server, in `core/invitations`: invite, list, resend, copy link and
  revoke behind `users.create`; reading and accepting are public, rate
  limited as the other public auth routes are. Refusals carry codes
  (`error-codes.ts`). The e2e fixture `addMember` invites and accepts, so
  every spec that adds a member goes through invitations, and
  `POST /v1/users`'s specs become invitation specs. The route itself goes
  in the client step, in the commit that replaces Add member, so every
  commit builds.
- Client: Members' Invite dialog and Invited list, the invitation page
  among the signed-out pages, and the email in three languages, designed
  on the canvas first. The invitation page's password fields can be shown
  as typed. Getting started's seventh step (ADR-058) reads
  "Invite your team"; it is still done by a second member, not by an
  invitation.
- The open decision on forcing a password change is resolved: no route
  sets another person's password.

**Amendment (October 2026) — organization invitations (ADR-078).** The
invitation page also opens an organization invitation, from the same link
shape: reading returns one of the two, and accepting goes by the token's
purpose. Both kinds keep this ADR's states and refusals. An organization
invitation names no inviter and carries no note, and its link ends when
its last day has ended everywhere, there being no organization's zone
yet.

**Amendment (October 2026) — the inviter hears (ADR-079).** When an
invitation is accepted, its inviter, if still a member, is told in the
bell, in their own language, and the notification opens the newcomer's
page on People. The audit log records it as before. The note stays with
the membership, and the newcomer's welcome shows it again.

**Amendment (October 2026) — invitations with several roles (ADR-080).** An
invitation names one or more roles (`invitation_roles`), and Invite starts
with no role chosen once the organization has made one. Inviting to a role,
resending and revoking follow the rule that only what you hold can be given;
"Only an Owner can invite an Owner" keeps its words. The messages choose an
article only for a built-in role, and a made role goes without one.

---

## ADR-078 — Registration: open, or by invitation (amends ADR-006, ADR-070 and ADR-077)

**Context.** ADR-006 made registration self-serve: anyone who finds the
sign-up page creates an account and an organization together, on the
production server. No agreement, billing or support stands behind such an
organization, and its data is still ours to hold and protect (ADR-070).
ADR-077 settled how a person joins an organization that exists; nothing
yet decides who may start one.

Two smaller gaps sit beside it. An account left with no organization,
having left one or seen it closed (ADR-069, ADR-070), cannot start
another: registering makes an account too, and its address already has
one. ADR-070 deferred that until invitations, which are now built. And such an account meets Home as
an error, "You do not belong to any organization", with nothing to do
next.

Production should take new organizations by invitation now, and selling
in public later should be a setting changed, not a rewrite. Render's free
services have no shell, so whatever the operator runs, runs on a laptop
against the production database's external address.

Checked before drafting, as the working agreements ask:

- **Fired.** ADR-070's deferred "Starting a new organization from an
  existing account", whose trigger was invitations, now built: taken
  here. ADR-072's watch list in the handoff, which asks for the client
  tests on the zone sent at registration and on Home's time-zone note
  when that code is next touched: this ADR touches both (Consequences).
- **Not fired, and kept in step.** "Registration reveals whether an
  address is registered", closed wherever registration is (below). "What
  unverified access should be limited to": the first Owner meets
  ADR-077's `email_unverified`. "Changing your own email address", which
  a mistyped address on a printed link would make the likeliest to fire
  next, so the command asks before it writes and the page asks the
  person whether the address is theirs. ADR-077's one person in two
  organizations and seat limits, and ADR-070's "closed by us" with plans
  and billing, all unchanged. A public demo and the operator's console,
  which this ADR's setting and command serve.
- **Open issues.** None is in this area. #142, a Content-Security-Policy
  for the client, is the whole app's: a single-page app loads one
  document, and its policy covers every screen. The invitation page is
  its one exception, `img-src data:` for ADR-077's logo, and the pages
  here add nothing a policy must allow, so #142 keeps its own PR and
  short ADR. #129, English left inside translated messages, is the
  reminder for what the command prints (below).

**Decision — one setting, `REGISTRATION`: open, or by invitation.** It
decides one thing: whether a person may create an organization
themselves. Open, they register as today, and an account with no
organization can start one from Home (below). By invitation, only an
organization invitation creates one. Inviting staff (ADR-077) and
organization invitations work under both.

- Declared in `env.ts` and read per request, as `CALENDAR_DAY_INPUT` is,
  so a spec can change it. Left unset, it is `invitation` when `NODE_ENV`
  is `production` and `open` otherwise: a production deployment that
  forgets it fails closed, and development, CI and both test suites need
  no change. Render sets it all the same, so its dashboard says what
  production does.
- A public demo (Open decisions) is the same code with `open`.

**Decision — closed is refused before anything is read.** By invitation,
a guard refuses `POST /v1/auth/register` with 403 and
`registration_closed` before the body is validated or the address looked
up, so a closed form cannot tell anyone whether an address has an
account. That closes "Registration reveals whether an address is
registered" (Open decisions) wherever registration is closed; the entry
stays for the day it opens.

- A public `GET /v1/auth/registration` says which, for the signed-out
  pages. The client has no setting of its own: a static site rebuilds to
  change one, and two settings drift.
- Sign-in drops "Create an account". `/register` stays, and says that new
  organizations join by invitation: to join a colleague's, ask them to
  invite you; to start one, open the link you were sent; then Sign in. A
  bookmark or an old link reaches an explanation, not a missing page.

**Decision — an organization invitation, and the organization is made
when it is accepted.** An organization invitation offers one address the
chance to start one named organization, as its Owner. It is a row of its
own in `organization_invitations`: the address, the organization's name,
the language, when its link ends, and, once accepted, when and which
organization it started.

- The table is the operator's, not a tenant's. It has no
  `organization_id`; the organization it started is
  `started_organization_id`, set at accepting, and the row is deleted
  with that organization.
- Its link is ADR-017's fourth token purpose, `organization_invitation`.
  `auth_tokens`' exclusive arc widens to three: exactly one of `user_id`,
  `invitation_id` and `organization_invitation_id`, each exactly when the
  purpose is its own.
- Accepting runs registration's transaction: `provisionOrganization`, the
  Owner membership, and the account when the address has none, so an
  organization still never exists without its Owner (ADR-004). The
  organization's time zone is the browser's, sent when accepting, as at
  registration (ADR-072); its slug comes from its name, as at
  registration; the account takes the page's language (ADR-077).

**Decision — issued from the command line.** `npm run org:invite` in
`server/`. Run with nothing after it, it asks each question in turn: the
address, the organization's name, the language from the three, then
`CLIENT_URL` and the database's address when they are not set, so the one
thing to remember is the command itself. `--email`, `--name` and
`--language` (English when left out) give the same answers on one line,
`--help` prints an example, and the Render runbook has a section to copy
from. It prints the link and its last day for the operator to send as
they like, as Copy link hands one back (ADR-077), and under them a short
message in the invitation's language, naming the organization and the
last day, to paste whole into a chat or an email. The command sends no
mail, so the laptop needs only the database's address and `CLIENT_URL`,
never the mail key, and Mailpit plays no part. Whoever holds the
production database's credentials is the operator; nothing else
authorizes the command.

- It reads only its own process's environment, never `.env`, so a
  setting left off fails rather than quietly writing to the development
  database, the trap `drizzle.config.ts` records. `CLIENT_URL` is given
  on the command line, and the database's address may be too. When
  `DATABASE_URL` is unset, the command asks for it without echoing it, so
  the password does not stay in the shell's history (the Render
  runbook: never paste a database URL where it stays). It is the
  External URL with `?sslmode=no-verify`, as the backup secret's is.
- Before writing, it prints the database's host and name, `CLIENT_URL`,
  the address and the organization's name, and asks to go on. A mistyped
  address would make an Owner who can never confirm it (below), and
  changing an address is not built yet (Open decisions).
- It refuses an address whose account belongs to an organization: a
  person belongs to one until ADR-077's one person in two organizations.
  The operator, who can read the database anyway, is told why.
- Run again for an address whose invitation is not yet accepted, it
  replaces it: the old link is spent, a new one starts its seven days,
  and the name and language become the new ones. `--revoke` ends one.
  `--list` shows those waiting; those whose link ended unaccepted, with
  "run again to send a new link" beside each, so a customer who missed
  the seven days is not forgotten; and those accepted. Ended and accepted
  ones are listed for 30 days, as long as the sweep keeps an unaccepted
  one.
- It prints in English, on purpose: only the operator reads it. The
  page, the emails and every refusal a person sees are in all three
  languages (ADR-054), `registration_closed` included.
- It boots no Nest application, so no timer starts and no other setting
  is needed. It opens its own connection and calls plain functions,
  which the console's Invite an organization will call too (Open
  decisions): the command is the console's first form.

**Decision — the same page, and seven days that end everywhere.** The
link is `/invitation?token=…`, as ADR-077's, so a person receives one
kind of link and the server alone tells the two apart.

- Reading returns the organization invitation beside the member one,
  one of the two set: the address, read-only; the organization's name;
  the Owner's role line (ADR-077); the link's last day; whether the
  address has an account; and the language the page starts in. No
  inviter and no note: the operator's own message carries both.
- The page keeps ADR-077's states and their refusals, headed "Set up
  {organization}", with a button to match: a new account; signing in to
  start, for an account with no organization; another address; another
  organization; keep your account first; and ended. The name is fixed on
  the page and changed on Profile afterwards (ADR-061).
- Under the address: not yours? Don't set it up here; ask whoever sent
  the link for one to your own address. A mistyped address is caught by
  the person it was meant for before it becomes an Owner's, since
  changing an address is not built yet (Open decisions).
- With no organization yet there is no zone to end a day in, so a link's
  last day is the seventh after today in UTC, and it works until that day
  has ended everywhere, at noon UTC the day after, as ADR-070's cancel
  cutoff does. "Until 26 October" then holds wherever the person is, and
  the page and the command name the day without a zone.

**Decision — the operator hears when one is accepted.** An optional
setting, `OPERATOR_EMAIL`. When it is set, production emails it as an
organization invitation is accepted: which organization, set up by whom,
by name and address, and when. In English, from `MAIL_FROM`, as the
command speaks English: only the operator reads it. When it is unset,
nothing is sent, and `--list` is how to find out. A send that fails is
logged and changes nothing: the organization exists, and the email is a
courtesy to the operator, not a record. The address is a setting, not one
a member typed, so the rule on mail to a typed address (Open decisions,
"What unverified access should be limited to") does not apply.

**Decision — the first Owner starts unconfirmed.** Nothing was emailed,
so accepting confirms nothing, and the verification email goes out from
production, as after registration. Until they confirm, inviting is
refused (ADR-077, `email_unverified`), so confirming is the first thing
they do. Getting started (ADR-058) is unchanged; a newcomer's first
sign-in, next in the chain, can add a step for it.

**Decision — an account with no organization can start one.** ADR-070's
deferred item.

- By invitation: through an organization invitation to its address. It
  signs in on the page and becomes the new organization's Owner.
- Open, also from Home. An account with no organization sees what it can
  do instead of an error: Start an organization asks for a name, sends
  the browser's zone, and makes the organization and the Owner membership
  in one transaction, moving the session into it.
- By invitation, the same Home says how to join an organization and how
  to start one, and offers no form.
- An account whose deletion is scheduled is refused with
  `account_deletion_scheduled`, as at accepting (ADR-077), and the
  banner's Keep my account is the way on. An account that belongs to an
  organization is offered neither.

**Decision — what is kept, and what is recorded.**

- Organization invitations nobody accepted are deleted 30 days after
  their link ended or they were revoked, by the hourly timer that sweeps
  ADR-077's: an address nobody accepted for is not ours to keep. An
  accepted one stays with the organization it started, so "did they
  accept?" has an answer, and goes with it.
- The account's history (ADR-022) records `account.registered` for an
  account made by accepting, as registering does, and the new
  `account.organization_started` for an existing account that starts
  one, either way. The organization's audit log starts empty, as after
  registration: there was no organization to record into. The operator's
  own actions have no log until the console.

**Considered and not done.**

- **Making the organization at issue, empty, with an ordinary invitation
  to it as Owner.** It reuses more of ADR-077. But the organization is
  nobody's from the moment it is issued until someone accepts, if anyone
  does: those never accepted need a second way to delete an
  organization, outside ADR-070's; its time zone is guessed without the
  person's browser; and the name belongs to the offer, not to an
  organization that does not exist yet.
- **A setting on the client as well.** A static site rebuilds to change
  it, and the two drift.
- **Removing `/register` when closed.** A bookmark or an old link would
  reach a page that does not exist.
- **Emailing an organization invitation from the laptop.** It needs the
  mail key there. Production sends the verification email anyway, and
  the console can send invitations through production's mail.
- **Open sign-up waiting for the operator's approval, and payment before
  the organization exists** (Open decisions). Each needs more built
  first: an approval queue in a console, and billing.

**Deferred — each with what brings it in.**

- **A way to ask for an invitation,** a form or an address on the By
  invitation page and on Home. Trigger: the public demo, or the first
  prospect who reaches the page.
- **An organization invitation by email,** sent by production. Trigger:
  the console.
- **A log of the operator's actions.** Trigger: the console, or a second
  operator.
- **Home showing the invitations waiting for an account's address,**
  member and organization ones alike, to accept without the link. It
  looks across organizations by address, which nothing else does, and is
  safe only for a confirmed address, so it needs its own decision.
  Trigger: the first person who loses a link.
- **The command as a screen,** the console's Invite an organization
  (Open decisions). Nothing of the command is thrown away: it is a thin
  shell around plain functions that issue, replace, revoke and list. The
  console's form asks what the command asks (the address, the name, the
  language) and calls the same function to issue; its list is `--list`,
  its Revoke is `--revoke`. What the console adds is a flag that marks an
  account as platform staff, two-factor sign-in for it, and routes and
  pages of their own, apart from any organization. Trigger: that entry's,
  or typing the command becoming a chore.

**Consequences.**

- Migration 0069: `organization_invitations`, with one waiting invitation
  per address (a partial unique index on the address where neither
  accepted nor revoked); `organization_invitation` added to
  `auth_tokens`' purposes, with `organization_invitation_id`, deleted with
  its invitation, in the arc's check; `account.organization_started`
  added to `account_events`' actions, with the schema test's vocabulary
  check.
- `REGISTRATION` and the optional `OPERATOR_EMAIL` in `env.ts` and
  `.env.example`; Render's web service sets `invitation`, and
  `OPERATOR_EMAIL` when the operator wants the emails. The code
  `registration_closed` in `error-codes.ts`. One email, to the operator,
  in English, with an e2e test that it goes when set and not when unset,
  and that a failed send leaves the acceptance standing.
- Server, in `core/auth`, `core/invitations` and `core/organizations`:
  the guard on registration; `GET /v1/auth/registration`;
  `POST /v1/invitations/read` returning `organizationInvitation` beside
  `invitation`, and `POST /v1/invitations/accept` taking the browser's
  `timeZone` for the organization kind, both additions;
  `POST /v1/organization`, Start an organization, `@AllowNoOrganization`
  and listed in `NOT_AUDITED` as registration is. `organization_invitations`
  goes in `OWNED_THROUGH_PARENT`, not exported: the operator's record of
  the offer, not the organization's. `npm run api` after the routes
  change.
- `server/src/cli/org-invite.ts` and `npm run org:invite`, with unit
  tests for its questions and its arguments, the message it prints in
  each language, and its refusing to run without its settings.
  The e2e specs issue organization invitations through the same
  functions, and run registration under each setting.
- Client: the invitation page's organization kind; sign-in without Create
  an account, and the By invitation page, when closed; Home for an
  account with no organization; each designed on the canvas first. The
  client tests ADR-072's watch list asks for once this code is touched:
  the zone sent at registration and Home's time-zone note; with them, the
  zone sent when accepting an organization invitation and when starting
  an organization. A dropped zone would leave a new organization on UTC,
  its today hours off, unnoticed until a date came out wrong. The rest of
  that watch list is in files this ADR does not touch, and stays there.
- Docs: manual checks section 31; the Render runbook's `REGISTRATION`
  and a section on inviting an organization; the glossary's organization
  invitation; the handoff.
- Build order: the server (the migration, the setting and its guard, the
  organization invitation and its acceptance, Start an organization, the
  command, the sweep, e2e tests); then the client, after the design; then
  the docs.

**Amendment (October 2026) — as built.** What building it, and its
reviews, settled:

- **Erasure.** Erasing an account (ADR-069) rewrites the address on any
  organization invitation it accepted to the same placeholder as
  `users.email`, in the erasure transaction. The row still says the
  organization began from an invitation, and when, but no longer whose
  address it was.
- **The command and acceptance take turns.** Acceptance takes the
  command's lock on the address before it holds the row, and replacing or
  revoking changes only an invitation not yet accepted. A replace that
  finds it accepted meanwhile is refused and says so, so it never prints
  a link that already reads as ended; a revoke that finds nothing waiting
  says so, rather than Revoked, and exits 1. A test holds the lock to
  prove acceptance waits.
- **English when left out.** `--language` is English whenever `--email`
  or `--name` is on the command line; only a bare run asks. `CLIENT_URL`
  and the database's address are asked for whenever the shell does not
  set them, on one line too: the command never refuses to run for want of
  a setting, so its unit tests cover its arguments and answers, not such
  a refusal.
- **The command's input.** One reader serves the whole run, so piped
  answers queue rather than get lost; a piped answer is never echoed, and
  the database's address is hidden at a terminal. A wrong answer is asked
  again, the database's address included. Ctrl-D, Ctrl-C and the end of
  piped input end the run with "Cancelled. Nothing was written." and exit
  130. Addresses are checked as registration checks them, with
  class-validator's `isEmail`.
- **The test setups.** `REGISTRATION` is pinned to open in the e2e
  suite's Vitest config and in the Playwright API server's environment,
  so a value left in `.env` for MC-3101 cannot break either.
- **One way to make an organization.** Registration makes its
  organization through `startOrganization`, as accepting an organization
  invitation and Start an organization do. The organization name's limit
  is one constant on each side, in `account-rules.ts` and
  `lib/validation.ts`, used by the server's three DTOs and the command,
  and by the sign-up and Start forms; Settings' Profile still has its own
  100. Starting one when the account already belongs to an organization
  is refused with the next step: leave it first.
- **The page.** The organization's initials follow a rule of their own,
  not a person's: the first two Han characters of a Chinese name
  (海港草本有限公司, 海港), otherwise the first letters of its first two
  words (Reid Supply Co., RS). Both kinds of invitation share their four
  accept forms, in `invitation-parts.tsx`, each passing its words and how
  it accepts, so a fix to one reaches both. Keeping an account clears a
  refusal carried past Keep my account, on both kinds. When the sign-up
  form or Start turns into the explanation, focus moves to its heading,
  so a screen reader says what changed (ADR-055). `/register` shows the
  signed-out frame at once while the setting loads, and a spinner after
  250 ms. Start refused with a 409 reads the session again, so the
  deletion banner or the new organization's Home appears.
- **Recent activity** names every account event, ADR-069's and ADR-077's
  among them, with a test that leaving, deletion and starting read in
  words, never as codes.
- **Found, not this ADR's:** another device's session keeps pointing at
  an organization the account has left, since a session's organization
  changes only on its own device. Left to an issue of its own, in
  ADR-069's area.

**Amendment (October 2026) — the first Owner's first step (ADR-079).**
Getting started is still unchanged. The newcomer's welcome on Home lists
Confirm your email address first for the first Owner, with Resend, and
says that inviting waits for it, until they confirm.

---

## ADR-079 — A newcomer's first sign-in: a welcome on Home, and help on every page (amends ADR-016, ADR-058, ADR-063, ADR-069, ADR-077 and ADR-078)

**Context.** ADR-077 and ADR-078 settled how a person arrives: by a link,
to an organization that exists or to one they set up. What they meet next
is the Home everyone has. Nothing says what this account may do here, so a
Viewer learns it from buttons that are not there and an Admin from being
refused. The inviter's note was read once, on the invitation page, and is
gone from sight. The first Owner of an organization the operator invited
starts unconfirmed (ADR-078), and inviting waits on confirming, which only
a banner says. And nothing explains a screen: ADR-058 deferred user guides
until "the first customer onboarded without someone beside them", and
ADR-078 has made that the normal case, a printed link and nobody beside
the person who opens it.

This is the third of the three onboarding pieces. What it builds has to
hold when job roles come (Open decisions), and when one person belongs to
two organizations (ADR-077, *Deferred*).

Checked before drafting, as the working agreements ask:

- **Fired.** ADR-058's deferred user guides, by the trigger above: taken
  here, kept with the client rather than under `docs/user/` (below).
  ADR-078's first Owner, unconfirmed, for whom it left a step to this ADR:
  taken here. "Job roles" in Open decisions, whose trigger includes this
  checklist, which with three roles reads as two lists: it fires, and is
  not taken here, since job roles are already next after the chain and a
  checklist built from permissions needs no change when they come.
  ADR-072's watch list, the auth provider's test, which fires because
  #144's fix touches the auth provider (below).
- **Not fired, and kept in step.** ADR-058's sample data, a practice
  organization, which waits on one person in two organizations. ADR-077's
  deferred items, all unchanged; its "a tour on first sign-in", considered
  and not done, points here, and this ADR keeps to no tours. ADR-078's
  Home listing the invitations waiting for an address, which still waits
  for a lost link. "Changing your own email address": the confirm step
  shows a mistyped address sooner but cannot fix one, so its trigger
  stands. "What unverified access should be limited to": unchanged.
- **Corrected.** The Open decisions entry took the permission descriptions
  to be translated already. They are not: `PERMISSION_DESCRIPTIONS` is
  English, seeded into `permissions.description` with
  `onConflictDoNothing`, and no screen shows it. What a person may do
  needs words of its own, in the client's catalogues (below).
- **Open issues.** #144, another device's session keeping an organization
  the account has left, is in this area and rides along (below). #142, a
  Content-Security-Policy for the client, keeps its own PR: guides are
  text bundled with the client, with no images and nothing fetched from
  elsewhere, so nothing here is one more thing a policy must allow. #129,
  English left inside translated messages, stays open: the guide check
  below finds a missing translation, not English inside one.

**Decision — a welcome on Home, the person's own.** A newcomer's first
page is Home, as everyone's is, and it leads with a card of their own: a
greeting by name to the organization, the inviter's note, what they can do
here, and their first week. Not a dialog in front of the page, and not a
page of its own: the work is right there, and they can start on it at
once.

- It belongs to the membership, not to the account and not to the
  organization: someone in two organizations, one day, is a newcomer in
  each. Getting started (ADR-058) stays the organization's.
- It shows from joining until the person dismisses it, every item of their
  first week is done, or two weeks have passed since the membership began,
  whichever comes first. Two weeks, because a part-timer's first week is a
  few days. Members from before this ADR joined more than two weeks ago,
  so none of them sees it.
- Dismissing is the person's alone and per membership, in
  `memberships.welcome_dismissed_at` (migration 0070). It changes only
  what they see, as a recently opened record does (ADR-058), so it is not
  audited.
- Whoever started the organization, by registering, by an organization
  invitation or with Start an organization (ADR-078), has no inviter:
  their card has no note, and Getting started below it is their real list.
- In the reader's language (ADR-054). Nothing in it lives in a hover
  tooltip, which phones and handhelds do not have.
- It names the day it goes ("until 3 November"), so it never vanishes
  unexplained. Its foot says where Help is, beside the bell: that line is
  the whole introduction to Help, in place of a tour.
- Dismissing offers Undo for a moment, and says that what you can do here
  stays on Account.
- While the card lists Confirm your email address, the banner that asks
  the same is not shown on Home, so it is not said twice; it stays on
  every other page.
- On a phone, what you can do here folds into one row, opened by a tap,
  below the first week: what to do before what to read, and the card one
  screen long rather than two. On a computer it is open.

**Decision — what you can do here, from permissions.** One sentence per
area, for the areas the person may touch: stock and locations; products
and licences; orders; production; invoices and returns; costs, prices and
tax; partners; people and the organization. Each sentence is put together
from what they hold: "see what is on hand and where" for `stock.view`
alone, "receive, ship and move stock" with `stock.move`, "correct a count"
with `stock.adjust`. An area they cannot touch is left out, not listed as
refused.

- Built on the client, from the session's permissions, never from a role's
  name, so it grows finer with job roles and needs no change when they
  come. The words are the client's, in its three catalogues (ADR-054): one
  phrase per permission or group of permissions, joined as each language
  joins a list (`Intl.ListFormat`). The map is keyed by the generated
  `Permission` type (ADR-068), so a permission without a phrase does not
  compile.
- It ends with whom to ask for more: up to three members who may change
  roles (`roles.assign`), those who joined first first, by name; never the
  reader, and nobody for a reader who may change roles. The names come
  from the server, which alone knows who holds what.
- Someone who holds every permission reads one line, "You may do
  everything here, including settings and closing the organization",
  rather than eight. Still from the permissions, not the role's name: it
  holds for whoever holds them all.
- Each name to ask opens that person's page on People (ADR-063), where
  their work phone and extension are.
- The same block sits on Account, under the person's role in this
  organization, so it outlasts the card.
- `PERMISSION_DESCRIPTIONS` stays as it is, English, in the database:
  nothing a person reads comes from it.

**Decision — the inviter's note.** The note an inviter wrote (ADR-077)
shows on the card as typed, plain text, under the inviter's name and photo
or initials (ADR-063), the name opening their page on People. It is read
from the invitation that made the membership, which ADR-077 keeps with it
for this. Once the inviter has left or deleted their account, the note is
from the organization, as the email and the invitation page already say
(ADR-077). No note and no inviter for whoever started the organization.

**Decision — the first week, ticked by what the person does.** Up to five
items, each a short line with a button to where it is done, each ticked by
what the person has done here since joining, never by hand: a ticked box
proves nothing, and Getting started ticks the same way (ADR-058).

- **Confirm your email address,** listed for whoever joined unconfirmed:
  the first Owner from an organization invitation (ADR-078), and whoever
  accepted a copied link (ADR-077). Ticked once they confirm. Resend
  beside it, and, for someone who may invite, a line saying inviting waits
  for it (`email_unverified`). First, since it unlocks the rest.
- **Say who you are:** a photo or a job title (ADR-063), ticked when
  either is set.
- Then the first three of these the person may do, in this order: **look
  up a product or a lot** (`products.view` or `stock.view`), ticked by
  opening one, which recently opened already records (ADR-058); **receive
  stock** (`stock.move`); **raise an order** (`orders.create`); **ship an
  order** (`orders.ship`); **plan a production run**
  (`production.create`); **draft an invoice** (`invoices.create`). Those
  five change something, and each is ticked by the person's own entry in
  the audit log since joining, read through its actor index. Someone who
  may do none of the five gets **open an order** (`orders.view`) after the
  lookup, ticked the same way the lookup is.
- While Getting started shows on Home, the list keeps only the person's
  own two items, confirming and saying who they are: the organization's
  steps are then that member's list, and the same task twice would read as
  two things to do.
- A done item says what was done, and opens it: "You opened lot
  NN-2410-07" opens the lot, "Photo added" opens Account.
- Chosen and ticked on the server, from the member's permissions, and sent
  with Home; the client words each item and links it.

**Decision — help on every page.** One button in the top bar, beside the
bell, named Help. It opens the guide for the page the person is on, in
their language, and while it is open it follows them to the next page's
guide. At its foot, the guides for every page the person can open, and
where what they can do here is.

- It slides over the right of the page, nothing dimmed, so the page still
  works while they follow the steps. Where the screen is wide enough for
  the page to keep its full width beside it, it sits beside the page
  instead, in the space the page does not use. On a phone, full screen
  with Close. No page ever gets narrower for Help, so no page needs
  walking again at every width and text size (ADR-075). Esc or Close shuts
  it.
- Help in words, with its icon, where the bar has room, which a newcomer
  finds sooner than a bare icon; the icon alone on a phone, named Help for
  screen readers. At 320 px with Larger text the organization's mark shows
  its logo alone, so the bar's six 44 px targets fit (ADR-075), checked on
  a real phone.
- Learn more opens the same panel at the right guide and the right
  section: on every empty state (`EmptyState`), on each Getting started
  step, and beside a hard setting, at the end of its section's heading or
  of a field's own help text. The first hard settings: numbering, the
  licence policy, idle sign-out, costs and exchange rates, and price
  lists.
- No "?" on every field. Phones have no hover, so each would be a tap and
  a popover; each would be one more text in three languages; and a field's
  help text, about 115 of them, already says what that field needs, always
  visible and translated. A field that needs more than a line gets Learn
  more.
- No tours pinned to the screen: they break with every change of layout,
  and the layout changes. No screenshots or video either: they go stale,
  and would need one per language.
- The signed-out pages keep their own words, and have no Help.

**Decision — guides with the client, and checked.** Guides change and
translate with the code, so they live with it, not under `docs/user/` as
ADR-058 first had it.

- One guide per area of the rail, about twenty, each a Markdown file per
  language: `client/src/help/guides/<language>/<guide>.md`. Every
  signed-in route maps to exactly one guide: Orders covers the list, a new
  order and an order.
- Loaded when the panel opens, one guide in one language at a time, so no
  screen downloads them.
- A fixed subset of Markdown: headings, paragraphs, lists, bold, and links
  to pages of the app. Drawn by a small renderer of our own, with no raw
  HTML, no images and nothing fetched, its links the router's. No new
  dependency: a Markdown library would bring dozens of packages to a
  client with nine dependencies, for a subset this small.
- A section that a Learn more opens has an id beside its heading, the same
  in every language, so the link survives translation.
- A unit test, run by `npm run verify` and so by CI, fails when a
  signed-in route has no guide, a guide lacks a language, a guide's
  languages disagree on its sections, a guide uses Markdown outside the
  subset, or a link names a page or a section that does not exist. The
  signed-in routes become a list that `App.tsx` renders, so the test reads
  the same list the router does.

**Decision — how a guide is written.** Short: what the page is for; the
few things done there, each as steps; the words met on it, as the glossary
has them; and why something might be refused. The same for every reader:
where a control needs a permission, the guide says so ("only someone who
may issue invoices sees Issue") rather than hiding the section from those
without it. Plain words, the reader addressed as "you", and no control
described by its position or colour. English first, written from the
screens themselves; French and Chinese drafts beside it, beta as the app's
are (ADR-054), read by someone fluent when one can be found.

**Decision — the inviter hears, and colleagues see who is new.** A
newcomer's first day goes better when someone greets them, and today only
the audit log knows they arrived.

- When an invitation is accepted, its inviter, if still a member, is told
  in the bell (ADR-036), in their own language: "Wang Fang accepted your
  invitation and joined Northside Naturals as a Viewer". It opens the
  newcomer's page on People. The bell alone, not email: it is not a
  security event (ADR-037).
- People marks whoever joined in the last two weeks, "New · joined 16
  Oct", and its summary line says how many, so colleagues know whom to
  greet. The same two weeks as the welcome, from the membership's start.

**Decision — #144 rides along: a session finds its organization again.** A
session's organization is set only by its own device, so another device of
the same account keeps one the account has left. ADR-078 makes that a
newcomer's problem: someone with no organization, signed in on a phone and
a laptop, accepts an invitation on the phone, and the laptop's Home still
offers Start an organization, which the server then refuses. Its own
commit, ahead of this ADR's server, closing #144.

- When a session's organization is none, or no longer one of the account's
  memberships, the session middleware picks one as sign-in does, today the
  oldest membership, and stores it. That covers every way a membership
  changes at once: leaving, removal, deletion, accepting, starting. A
  session whose organization is still valid is never moved.
- The client reads the session again when its window regains focus, so an
  open page catches up without a reload. That touches the auth provider,
  so ADR-072's watch list brings its test: the auth provider passing the
  zone on.
- Carrying the organization on each request, for one person in two
  organizations, stays with that ADR (ADR-077, *Deferred*).

**Considered and not done.**

- **A welcome dialog or page on first sign-in.** It stands between the
  person and the work, is closed unread, and cannot be found again.
- **A product tour,** pointing at controls one at a time. It breaks
  whenever the layout changes, and teaches where things are rather than
  what they are for.
- **Ticking the first week's items by hand.** It records that someone
  pressed a box.
- **Guides on a help site of their own.** They would drift from the code,
  and be translated apart from it.
- **What you can do here from the role's description** (ADR-077). Three
  sentences for three roles: nothing finer once job roles come, and
  nothing for a role an organization makes.
- **A Markdown library.** Above.
- **A "?" beside every field.** Above, under Help.
- **Help always beside the page.** Every page would get narrower when it
  opens, and each would need walking again at every width and text size.

**Deferred — each with what brings it in.**

- **Searching the guides.** Trigger: enough guides that the list at the
  panel's foot is slow to scan.
- **Help on the signed-out pages.** Trigger: a question about signing in,
  accepting or setting up that the page's own words do not answer.
- **Asking for help from the panel,** by a message to whoever may change
  roles, or to support. Trigger: the operator's console and support access
  (Open decisions).
- **A first week per job,** "your first week receiving goods". Trigger:
  job roles.
- **Screenshots or short videos.** Trigger: a guide that words alone
  cannot make clear, with a way to keep them current in three languages.
- **A keyboard shortcut for Help.** Trigger: someone asking for one, with
  a key that does not collide with typing.

**Consequences.**

- Migration 0070: `memberships.welcome_dismissed_at`.
- Server, in `modules/home` and `core/auth`: `GET /v1/home` gains
  `welcome`, null unless the card shows, with the inviter and their note,
  the first week's items and whether each is done, and the names to ask;
  `POST /v1/home/welcome/dismiss`, the person's own, with no permission
  and in `NOT_AUDITED` with its reason; `GET /v1/account/membership`,
  beside leaving's `DELETE`, the role and the names to ask for Account,
  from the same function as Home's. `npm run api` after the routes change.
  Home's perf probe covers a newcomer's Home (ADR-051). E2e tests: who
  sees the card and until when, each item ticked by its own act, the
  shorter list while Getting started shows, the note after its inviter has
  left, dismissing per membership. The inviter's notification, written when
  the invitation is accepted, with its e2e test in each language; the
  People list's response gains when each member joined.
- #144: the session middleware's repair, with the e2e tests the issue
  lists; the client's read on focus, with its test and the auth provider's
  zone test.
- Client: Help and its panel, over or beside the page; the renderer, the
  route list, the guide map and the check; Learn more on empty states,
  Getting started's steps and the first hard settings; the welcome card on
  Home, with Undo, the banner hidden there while it asks the same, and the
  phone's fold; what you can do here on Account; New on People. Designed
  on the canvas: the card for a Viewer, an Admin and a founder not yet
  confirmed, in English and 中文 on a phone, and its other states; where
  Help sits on each screen; the panel on a computer and on a phone; Learn
  more from an empty list, a step and a hard setting; the top bar at four
  widths; the inviter's bell; People. Unit tests for the phrases, the
  renderer and the card; Playwright for the panel following the page, a
  Learn more and the card; the panel and the card in `accessibility.spec`.
- The guides, about twenty in each of three languages, a commit of their
  own.
- Docs: manual checks section 32, reading the guides in English and 中文
  among them; the glossary's welcome, first week, Help and guide; the
  handoff.
- Build order: this ADR; #144; the server; the client after the design,
  Help, then the guides, then the welcome; the docs last, after the
  reviews. Built by Claude Code, a prompt per commit (handoff, *How code
  is delivered*).

**Amendment (October 2026) — as built.** What building it, its design
review on the canvas, its reviews and its two walkthroughs settled:

- **Help beside the page on a laptop, reversing "no page ever gets
  narrower for Help".** Over the page, Help covered what a person needed
  next on any laptop between about 1280 and 1850 px wide: every list
  page's top-right action, Getting started's buttons, the welcome's
  Dismiss, Orders' filters. A focused control could sit under it, which
  fails WCAG 2.4.11. On a computer the rail now folds while Help is open,
  and comes back as it was when Help closes, and the page takes the width
  left beside Help, as long as that leaves it about 720 px. A Playwright
  test visits every signed-in route at 1280 × 800 with Help open: nothing
  scrolls sideways, the title row's actions show, and focus moved into the
  page is never under Help. Below that width, which is windows under
  about 1140 px, or under about 1265 px at Large text and 1330 px at
  Larger, Help still slides over the page, and a control under it can be
  focused out of sight. Phones, below 600 px, keep Help full screen.
- **Help's other rules.** The panel is 420 px, in rem, so it grows with
  the text. It stays above a page's dialog, readable and scrollable by
  mouse or touch, nothing in it pressable until the dialog closes; the
  keyboard stays in the dialog, and a screen reader already hears only the
  dialog. A guide chosen by Learn more or from the foot stays until the
  page's address changes; a tab's `?tab=` keeps it. Opening Help focuses
  the guide's title, and a Learn more its section's heading; closing
  returns focus to whatever opened it; Esc closes it only when focus is
  inside it. The top bar's Help toggles. The word Help in the welcome
  card's foot, its icon part of the same button, opens Help, and pressed
  again keeps it open, as a Learn more does: people pressed it. Every
  target in the top bar is at least 44 × 44 px at any text size, and below
  360 px with Larger text the organization's mark shows its initials
  alone.
- **The guides.** Twenty-one, in three languages, from 200 to 443 words in
  English, written before the panel that reads them, the reverse of the
  build order above. Every section has an id, the same in each language,
  prefixed `help-` in the page so it never clashes with the page's own.
  Learn more opens two sections beyond the first table, `invoices#credit`
  and `price-lists#prices`, and its targets are typed from the guide map,
  so one naming a section the map lacks does not compile. The signed-in
  routes are one list, `SIGNED_IN_ROUTES`, which the router and the check
  both read. Vitest's on-disk module cache does not see a guide just added
  until `npx vitest --clearCache`; CI starts without one.
- **No "?" on every field,** as decided: Learn more sits beside numbering,
  the licence policy, idle sign-out, exchange rates, stock value and price
  lists.
- **The card.** It shows through `lastDay`, the joining day plus 14 in the
  organization's zone, so on 15 calendar days; `joinedOn` is sent for "You
  joined today". The founder is the membership made in the same
  transaction as its organization, `memberships.created_at` equal to
  `organizations.created_at`, since registration, Start an organization
  and an organization invitation all go through `startOrganization`. Not
  the oldest membership, which would pass to the next member, and their
  note with it, if the founder left; not "no invitation behind it", which
  also describes the demo's team. Joined unconfirmed means the address was
  confirmed after the membership began, or not yet; both ways of accepting
  an emailed link now stamp the confirmation with the transaction's time,
  without which everyone who joined that way read as unconfirmed. The
  items' keys are `confirmEmail`, `sayWhoYouAre`, `lookUp`, `openOrder`,
  `receiveStock`, `raiseOrder`, `shipOrder`, `planRun` and `draftInvoice`.
  Receiving is ticked by `order.line_received` or a receipt among stock
  movements; a lookup by Recently opened, asked for by record kind, which
  keeps 30 records, so opening thirty other things un-ticks it. A done
  item names what was done and opens it, or says Done once the record has
  gone.
- **The card on Home.** While Getting started shows, it follows the
  welcome card directly, before the quick actions, which are then
  outlined, leaving its first open step the page's one primary button.
  Dismiss moves focus to Home's greeting, as Getting started's Dismiss now
  does; Undo comes next in the tab order and stays while focus or the
  pointer is on it (WCAG 2.2.1), as the product gallery's now does. The
  confirm banner is hidden on Home while the card lists that item.
  Progress bars have a grey track, since the pale one read as full at 0.
- **What you can do here.** One map keyed by the generated `Permission`
  type. Permissions acting on one thing share its noun ("raise, change,
  confirm and cancel orders"), only verbs the reader holds are said, and
  phrases are separated by semicolons (；in Chinese). Whom to ask is sent
  as an id and a name; deleted accounts are left out and suspended ones
  are not, as on People. `MemberAccessService`, in `core/authorization`,
  answers Home and `GET /v1/account/membership` alike.
- **The inviter.** ADR-077's rule for naming them is one join condition,
  `core/invitations/inviter.ts`, used by the email, the invitation page,
  the welcome and the notification. The notification is written after the
  acceptance commits, its resource the newcomer, so the bell opens their
  page on People; built-in roles keep their English article, and a role an
  organization makes is named as it is. People already sent `memberSince`;
  New is reckoned from it in the organization's zone.
- **Permissions brought in line with what they gate** (amending ADR-016).
  Changing a member's role needs `roles.assign`, not `users.update`;
  `users.update` then gated nothing, and went (migration 0071). The roles
  list needs `roles.view`, not `users.view`. Add inside on Locations needs
  `locations.create`. Inventory's row menu shows to whoever may see stock,
  holding only what they may do. The Admin's stored line says invite, not
  add (0072), so the export's `roles.csv` says what the screens say.
- **#144.** The repair, `chooseAgain`, runs before the idle check and on
  background requests, leaves the old pointer when the account has no
  membership, and shares `SessionService.firstOrganizationOf` with sign-in
  and leaving; closing an organization keeps its bulk SQL, with a comment
  naming the rule. The client reads the session again on focus and when
  the page becomes visible, one read at a time, sent in the background,
  and keeps the session it has when nothing changed.
- **Found on the way.** The root `.env`'s `NODE_ENV=development` reached
  Vite through `loadEnv('..')`, so every local build shipped development
  React; a local main chunk is now 453 kB, as CI's always was. MUI's
  `:focus-visible` warning in the account menu came from its preferences'
  selects inside menu rows, and each row now stops its select's focus and
  blur. The bell's badge kept a hidden 0 inside its button's name. Filed:
  #147, no way to remove a member on screen; #148, refusals with internal
  or off-glossary wording; #149, copy inconsistencies the guides found;
  #150, the translation review leaving out the guides; #151, the account
  menu's preferences out of the keyboard's reach.
- **Who sees the card once this ships:** everyone who joined in the last
  two weeks, not only those who join from now on. The demo's team joined
  months ago, and one colleague, Fatima Haddad, three days before seeding,
  by the Owner's invitation with a note.
- **Still open.** Five ADR-077 messages would read "a Accountant" once
  organizations can make roles: job roles' to fix. The French and Chinese
  guides, and an Admin's longer sentences, want reading by someone fluent
  (#150).
- **Reviewed and walked.** `/simplify`, then `/code-review`, then
  `/usability-walkthrough` along two journeys: the Chinese bookkeeper as a
  Viewer, from an emailed invitation to Help on Orders; the French founder
  on a phone, from an organization invitation to the welcome with Getting
  started below it.

**Amendment (October 2026) — any role's first week, and whom to ask
(ADR-080).** The first week's Receive shows for whoever may receive against
an order, opening the confirmed purchases for someone who may not move
stock. Whom to ask, on Home and Your access, names up to three members who
could give what is missing, as every refusal now does (ADR-080, as built).
Permission lines are translated on the server.

---

## ADR-080 — Job roles: roles an organization makes, several to a member (amends ADR-004, ADR-016, ADR-035, ADR-070, ADR-071, ADR-077 and ADR-079)

**Context.** Three roles cannot say what a small firm's people do. A
receiver who manages nobody needs Admin, which also invites and removes
members and corrects counts. Someone who should see stock and orders gets
Viewer, which reads nearly everything: recipes, every customer and supplier
with their contacts, and the prices bought and sold at on orders and
invoices; only costs, price lists and the audit log are kept from it.
Whoever may see an order sees its prices too, what is paid to suppliers and
charged to customers, which the dock needs no more than a temp does. And the
permissions left Owner-only "until an organization widens it deliberately",
issuing invoices (ADR-046), costs (ADR-048), price lists (ADR-049) and the
licence override (ADR-050), have had no way to be widened short of making
someone an Owner.

In a small firm one person often does two jobs: the dock and the sales
calls, the books and the purchasing. What is built has to say that without a
role for every pair, and has to leave room for what may follow: a site or an
amount limit on a role, one record shared with a customer, one person in two
organizations.

Checked before drafting, as the working agreements ask:

- **Fired, and taken here.** ADR-016's "a role hierarchy arrives with role
  editing", and the escalation question `roles.controller.ts` left for this
  ADR: settled below, by giving only what you hold. The Owner-only
  permissions of ADR-046, ADR-048, ADR-049 and ADR-050: the editor is the
  deliberate widening they waited for. ADR-070's "No role editor exists, so
  Owner-only means any Owner": closing the organization stays the Owners'
  (below). "Job roles" in Open decisions, by both its triggers, with its
  three consequences: an invitation names its roles by id; a built-in role's
  line comes from the catalogues only, `roles.description` holding a made
  role's line; the export writes the built-in lines translated. The
  handoff's "a Accountant", with a corrected count. ADR-079's deferred "a
  first week per job": the first week already follows permissions, and its
  one gap is closed below. ADR-073's review, CLAUDE.md and conventions.md
  disagreeing on what a write returns: the role routes follow CLAUDE.md, and
  this ADR's docs make the two agree.
- **Not fired, and kept in step.** Row-scoped permissions (Open decisions,
  and ADR-004's known limit): a role still cannot say "only this site", and
  where that would go is named under Deferred. Departments stay a label
  (Open decisions). ADR-077's deferred items, seat limits, two organizations
  per person and sign-in without email, are unchanged: a member's roles
  belong to the membership, as their role did. ADR-079's "asking for help
  from the panel" waits for the operator's console. "When someone is away"
  is unchanged, though a member's role rows (below) are where a cover with
  an end date would go. ADR-077's watch list: this branch's tests add
  members by invitation too, so a tax-codes timeout that comes back is
  looked for in the fixture first.
- **Corrected.** The handoff counts five ADR-077 messages that choose "a"
  for any role but Owner and Admin. There are seven: three on the invitation
  page (`invitation.invitedYou`, `invitation.invitedYouOrganization`,
  `invitation.keep.body`), two in the Invite dialog
  (`members.invite.alreadyMember`, `members.invite.copied.works`) and the
  invitation email's two leads (`mail.invitation.lead`,
  `mail.invitation.leadOrganization`).

Discussed with Bob before drafting: whether Viewer is too broad (for some
people it is, which is what roles are for); whether the built-in roles
should be editable instead; one role to a member or several; inheritance,
departments and attributes; whether this is what the industry does; and,
after the design review, prices on orders. NIST's role model, which most of
the industry builds on, lets a user hold many roles. OWASP asks that every
request pass one access check, made by one routine, and prefers attributes
and relationships to roles where they fit. This ADR is the role model, with
room for both.

**Decision — roles an organization makes, from a template or a copy.** An
Owner makes a role from three things: a name, an optional line saying what
it is for, and the permissions it grants. Making one starts from one of five
templates, Warehouse, Sales, Finance, Production and Stock look-up, the
narrowest, for someone who only needs to find things; or from a copy of any
role the organization has, a built-in one included, which every role's page
offers as Make a copy. A template only ticks boxes. It is defined once, in
`permissions.ts`, beside the permissions it names, and a test holds each to
what its permissions need and to nothing Owners keep. The role made is
stored as named, in whatever language its maker wrote, and is never
translated (ADR-054): a role named 仓库 reads 仓库 to an English reader too, and
the Roles guide says to name roles in the language the team reads.

**Decision — the built-in three stay as they are.** Owner, Admin and Viewer
cannot be renamed, edited or deleted. Their names and lines are the app's
words, translated by key and shown on Invite, in the invitation email and on
Your access, and would go on saying what an edited role no longer does. The
seed adds any missing grant back to a built-in role on every deploy, which
is how a new permission reaches every Owner, and it cannot tell a grant
removed on purpose from one not yet given. And a new permission reaches
Admin or Viewer by one change in code, for every organization at once. To
vary a built-in role, copy it. Two things make the copy as quick as an edit:

- **Move everyone to…** on a role's page moves every member holding it to
  another role in one step, under the rule that only what you hold can be
  given. It is also how a role is emptied before it is deleted.
- **Invite starts with no role chosen** once the organization has made a
  role of its own, so nobody is given Viewer by default (amends ADR-077,
  where Invite starts on Viewer).

**Decision — prices on orders, a permission of their own.** Seeing an order
has meant seeing its prices, so a role that receives and ships would show
the dock what the organization pays its suppliers. `orders.view_prices`, See
prices on orders, now holds them: an order's line prices, its totals and its
tax, in its page, in the orders list and wherever else an order's money
reaches a reader. Without it the server sends none of them, rather than the
screen hiding them, and refuses the purchase order's and the pro forma
invoice's PDFs; the packing slip never had prices (ADR-071). Raising,
changing, confirming and cancelling an order need it, since they set prices.
Owner, Admin and Viewer hold it, so nothing changes for them; each made role
chooses, and the Warehouse, Production and Stock look-up templates leave it
out. A new permission is Owner-only (ADR-004), but this one is split from
what Admin and Viewer already held, so it goes to them. Invoices are prices
by nature and keep `invoices.view`; costs keep `costs.view` (amends ADR-035
and ADR-071).

**Decision — several roles to a member, added together.** A member holds one
or more roles, and may do whatever any of them allows. Wang works the dock
and takes sales calls: he holds Warehouse and Sales, and can do everything
in either. Take Sales away and he has Warehouse's alone; change Sales, and
everyone holding it changes on their next request. Owner stands alone: it
already holds everything, so an Owner holds no other role, and the
last-Owner rule is unchanged. An invitation may name several roles. Each
role a member holds is a row of its own, with its own id, so that a scope or
an end date can later be a column on it (Deferred). On the day this ships,
every member holds the one role they held (amends ADR-004, which put a
single role on the membership).

**Decision — Settings → Roles, beside Members.** `/settings/roles` lists the
organization's roles, the built-in three first, each with its line and how
many members hold it. A role's page says what it can do, in the sentences of
Your access (ADR-079), and who holds it. Every member can read both, as
everyone can read People; making, changing and deleting are the Owners'
(below).

**Decision — the editor.** The permissions sit in ADR-079's eight areas,
stock, products, orders, production, invoices, costs, partners and people,
each a checkbox with its own line.

- **What a permission needs is ticked with it.** Receiving against an order
  needs seeing orders; correcting a count needs moving stock. Ticking one
  ticks what it needs, and unticking a needed one unticks what depends on
  it. The needs are declared once, in `permissions.ts`, and the server
  refuses a role that lacks one with `permission_requires`, naming it.
- **Three are every role's,** shown ticked and locked: seeing who works here
  (`users.view`), the roles (`roles.view`) and the organization's settings
  (`organizations.view`). Every built-in role holds them, People and Members
  are for everyone (ADR-063), and the screens built so far read the
  organization's settings without asking.
- **What the role can do** stands beside the boxes, in the words its holder
  will read on Your access, and follows each tick.
- **Tick all and Clear** on each area, and leaving with changes not saved
  asks first.
- **Who is told.** Three notifications go to whoever holds a permission: a
  licence expiring, to whoever may change licences or release production; an
  order line closed short, to whoever may change orders; a production
  variance, to whoever may complete production. Made roles change who that
  is, so those permissions' lines say it: "Also told when a line closes
  short."

**Decision — a permission's words, on the server, translated.**
`PERMISSION_DESCRIPTIONS` were written for a role editor and never
translated (ADR-079). They become messages in the three languages, one line
each, sent with the editor's catalogue and used by the audit log, the export
and the refusal below, so the four say the same thing. ADR-079's sentences
stay the client's, for Your access and the editor's summary.

**Decision — you can give only what you hold.** To give a role, by changing
a member's roles, by inviting or by Move everyone, your own roles must
together hold every permission it grants. To change or remove a member, they
must also hold every permission the member's roles grant together. Resending
or revoking an invitation follows the same rule for the roles it names. This
is ADR-016's role hierarchy, and it covers ADR-016's and ADR-077's Owner
rules, which keep their words: "Only an Owner can invite an Owner." For a
made role: "Your roles don't include everything Warehouse lead can do, so
you can't give it." `GET /v1/roles` says which roles the reader may give, so
Members and Invite disable the rest with that reason, as Invite's Owner card
does today (amends ADR-016 and ADR-077).

**Decision — what stays the Owners'.** Making, changing and deleting roles,
by three new permissions, `roles.create`, `roles.update` and `roles.delete`,
Owner-only as every new permission is, and closing the organization
(`organizations.delete`, ADR-070) are never offered in the editor. Only
Owners edit roles and an Owner holds everything, so editing a role cannot be
used to climb, and a role changed after an invitation naming it went out
cannot grant more than its inviter held. Everything else can go into a role,
inviting and changing roles included (amends ADR-070).

**Decision — names and lines.** A made role's name is unique in the
organization, ignoring case, and none may read as a built-in role in any of
the app's languages, so a message choosing its words by Owner, Admin or
Viewer never meets a made role of that name. Names run to 50 characters,
lines to 200; a line is optional.

**Decision — deleting a role.** Only a role nobody holds and no live
invitation names. An invitation that has ended or been revoked drops the
role from its list, as the sweep would within 30 days (ADR-077); the audit
log keeps what it granted. The refusal says how many hold the role, and
offers Move everyone.

**Decision — Members, and removing a member (#147).** Each member's roles
show side by side. Change roles is a dialog of checkboxes, and under them
what the member could do with the roles ticked, in Your access's sentences,
following each tick: with roles added together, the clearest way to see what
someone will be able to do. Each row's menu gains Remove from the
organization, `DELETE /v1/users/:id`, which has had no screen. Its dialog
says the account stays theirs, their work keeps their name, and their access
ends on their next click. Both follow the rule that only what you hold can
be given.

**Decision — held when two act at once.** The last Owner is counted under a
lock, so two Owners demoting or removing each other at the same moment
cannot leave none, as counting without one could (`users.service.ts`). A
role saved after someone else changed it is refused with `role_changed`,
naming who, rather than overwriting what they did. A member keeps at least
one role. Move everyone writes one audit entry for each member it moves, so
each person's history says what happened to them.

**Decision — words and records.**

- **The audit log** records a role made, changed (its name, its line, and
  the permissions added and removed, in words) and deleted, each opening the
  role's page, and a member's roles changed. Their keys are declared with
  their names in each language (ADR-076). An old "role changed" entry still
  reads as it did.
- **The seven messages** choose their article by which built-in role they
  name, and a made role goes without one, "invited you to join as Warehouse
  lead", as the welcome card and the inviter's bell already do. Several
  roles read as a list, in each language's way: "Warehouse and Sales",
  "Entrepôt et Ventes", "仓库和销售".
- **A built-in role's line comes from the catalogues only.** Migration 0073
  clears the English stored in their `roles.description`, which ends the
  backfills 0068 and 0072 needed; the column holds made roles' lines.
  `roles.csv` writes the built-in lines in the export's language.
- **The Owner is found by `is_system` and name together,** in one helper,
  never by name alone.

**Decision — the first week, for any role.** The first week's Receive item
shows for whoever may receive against an order, not only for whoever may
move stock; for someone who may not move stock, its button opens the
confirmed purchases. Everything else in the first week already follows
permissions (amends ADR-079).

**Decision — one place decides.** Three rules keep the model open to what
may follow (Deferred) without touching what reads it:

- **One place answers both questions:** what may this member do, and who may
  do this. Today three read the grants: the guard's lookup in
  `permissions.service.ts`, `member-access.service.ts` and the
  notifications' recipients. All three move into one service in
  `core/authorization`, and a lint rule, like `UNSAFE_GLOBAL_DB`'s, refuses
  the role tables anywhere else.
- **No access is decided by a role's name,** except whether a member is an
  Owner, in the helper above.
- **The client asks `useCan`,** never a role's name.

The answer is still worked out on every request (ADR-016): one indexed query
from the membership through its roles to their permissions. Sixty-one
permissions and a few roles each take well under a millisecond, and a change
to a role reaches its holders on their next click.

**Decision — what rides along.**

- **#155, first.** A dialog gives focus back to whatever opened it.
  `openDialog` blurs the button that opens a dialog, so MUI has nothing to
  return focus to, and this ADR's new dialogs would ship with the same
  fault.
- **#148, in part.** "Missing permission: costs.view", from the guard, the
  recent records and the files, says in the reader's words what their roles
  do not include, and who may change them (ADR-079's names to ask). Made
  roles will meet it more often than three roles did.
- **#169, in part.** Members and Roles leave the menu while there is no
  organization.
- **#151.** The account menu's preferences open from the keyboard.
- **The demo** gains two roles made from templates, each held by one of its
  team.

**Considered and not done.**

- **Editable built-in roles.** Their translated lines would say what an
  edited role no longer does, the seed would put back what an Owner removed,
  and a new permission for Admin or Viewer would have to skip the edited
  ones. A copy and Move everyone give the same result.
- **Hiding prices on the screen alone.** The response would still carry
  them, and anyone opening the browser's tools could read them.
- **More built-in roles in every organization** (Warehouse, Sales, Finance).
  Each needs a translated name and line and a backfill into every
  organization, and an organization still could not say "sales, who also
  receive".
- **One role to a member,** with a role made for each combination. Simpler
  to read, and how many small-business tools work; but in a small firm the
  combinations multiply ("Warehouse and sales", "Warehouse and finance"),
  and the forty-odd server files that read one role id would change later
  rather than now. A start from several templates at once was the halfway
  step; several roles make it unnecessary.
- **Inheritance,** a role that includes another. It saves a few ticks, turns
  "what can she do?" into a chain to follow, and lets a change to one role
  reach roles nobody looked at. A copy stands alone.
- **Departments giving access.** A department says where someone sits, a
  role what they do, and the two vary independently (Open decisions).
  Visibility by department is row scoping, under Deferred.
- **Deny permissions.** With roles added together, "everything Sales may,
  except costs" makes the answer depend on which rule wins. Access stays
  allow-only; the answer is a smaller role.
- **A policy engine now** (AWS Cedar, Open Policy Agent). It wins where many
  services share rules, or rules change without a deploy; here one server
  keeps them in code.

**Deferred — each with what brings it in.**

- **Attributes.** A scope on a member's role, "Warehouse, at Burnaby only",
  as a column on its row, applied in one place the way `organization_id` is;
  and conditions on using a permission, "issue invoices up to $5,000",
  "change the orders they raised", checked in the service with the record in
  hand, after the guard, by one helper (CASL, as ADR-004 named). Trigger:
  the first customer whose staff must be held to a site, a team or an
  amount.
- **Sharing one record,** a customer or a supplier seeing their own orders:
  relationships, as Zanzibar-style systems (OpenFGA, SpiceDB) keep them.
  Trigger: a customer or supplier portal.
- **Non-Owners editing roles,** under the same rule extended to editing: a
  role changed only by someone who holds everything it grants, before and
  after. Trigger: an Owner who wants to hand role editing to someone else.
- **A bell when your roles change.** Trigger: someone surprised by a change
  in what they can do.
- **A made role's name in more than one language.** Trigger: a team reading
  two languages that asks for it.
- **Caching what a member may do,** cleared whenever a role or a member's
  roles change. Trigger: the per-request query measured as slow.

**Consequences.**

- Migration **0073**. `membership_roles` (`id`, `organization_id`,
  `membership_id`, `role_id`, `created_at`), its membership and its role
  each held to the row's organization by a composite foreign key, so a role
  from another organization cannot be given; unique on membership and role;
  indexed by organization, by membership and by role. A role cannot be
  deleted while a member holds it, and removing a member removes their rows.
  Backfilled from `memberships.role_id`, which is then dropped.
  `invitation_roles` the same way, from `invitations.role_id`. `roles` gains
  a unique index on its organization and its lowercased name, in place of
  `roles_org_name_key`, and the built-in roles' `description` is cleared.
  One migration does it at today's sizes; on large live tables the procedure
  would be expand and contract (ADR-052).
- Permissions: `roles.create`, `roles.update` and `roles.delete`,
  Owner-only; `orders.view_prices`, held by the three built-in roles; 61 in
  all. Each permission's line in three languages, what it needs, and the
  notification it brings; the five templates, each written out in the build
  brief for Bob to review.
- Server: `GET /v1/roles` gains each role's line, whether it is built in,
  its permissions, how many hold it and whether the reader may give it; `GET
  /v1/roles/catalogue`, each permission's line, what it needs and whether it
  is offered or locked, and the templates named in the reader's language;
  `GET /v1/roles/:id` with its holders; `POST /v1/roles`, `PATCH
  /v1/roles/:id`, `DELETE /v1/roles/:id` and `POST /v1/roles/:id/move`.
  `PATCH /v1/users/:id` and `POST /v1/invitations` take `roleIds`. Order
  responses without prices for whoever lacks `orders.view_prices`, and their
  PDFs refused. The request context carries the membership, not a role. One
  authorization service and its lint rule; the rule that only what you hold
  can be given, wherever a role is given or a member changed; the audit
  actions and their declared keys; members' roles and the built-in lines in
  the export, with the README's glossary of its columns; the seven messages;
  the refusal in words. `npm run api` after the routes change. E2e tests for
  each refusal, roles added together, Move everyone, deleting, a made role's
  holder refused in each language, an order read without its prices, and two
  Owners demoting each other at once. The access query timed on
  `seed:volume` within ADR-051's budget.
- Client: Settings → Roles, a role's page and the editor; Members' roles and
  Remove; Invite with several roles and none chosen; the first week's
  Receive; `openDialog` giving focus back; the account menu from the
  keyboard; the menu with no organization. Designed on the canvas first:
  Roles, a role's page and a built-in one's, the editor on a computer and a
  phone in English and 中文, Move everyone, deleting, Members with several
  roles and the Remove dialog, Invite's cards with a made role and one that
  cannot be given, and an order without its prices. Order pages and lists
  without prices. Unit tests for the editor's needs and the role list;
  Playwright for making a role from a template, giving it, and its holder's
  Home; for each template, its holder opening every page in the menu without
  a raw refusal; the new pages in `accessibility.spec`.
- The guides: Roles, new, and Members, changed, in three languages, a commit
  of their own; the glossary's permission, made role, Move everyone to… and
  Remove from the organization.
- Docs: manual checks section 33; this ADR's as-built amendment and the
  amendments at the end of ADR-004, ADR-016, ADR-070, ADR-077 and ADR-079;
  CLAUDE.md and conventions.md agreeing on what a write returns; the
  handoff.
- `npm run migrate:all` once 0073 lands.
- Build order: this ADR; #155; the schema and permissions; the server; the
  client after the design; the guides; the docs last, after the reviews.
  Built by Claude Code, a prompt per commit (handoff, *How code is
  delivered*).

**Amendment (October 2026) — as built (#176).** What building settled:

- **58 permissions, not 61.** There were 54 before it, not 57, so the four
  new ones make 58; the "Sixty-one" above reads 58.
- **One place.** `PermissionsService` answers what a member may do
  (`memberPermissions`) and who holds a permission (`holdersOf`); the route
  guard, the adjustment and licence-override guards, member access and the
  notifications' recipients all ask it. `isOwnerRole` and `holdsOwner` find
  the Owner by built-in flag and name together, and `giving.ts` holds the
  one rule for giving. A lint rule refuses `membership_roles`,
  `invitation_roles` and `role_permissions` outside `core/authorization`,
  except the schema, the seed, provisioning and the export, each named with
  its reason. The request context carries the membership, and `/auth/me` no
  longer sends roles nobody read.
- **Migrations.** 0073 as above. 0074 adds `roles.updated_by`, so a stale
  save (`role_changed`) names who saved last; the editor sends back the
  `updatedAt` it read.
- **Refusals.** Codes `role_changed`, `role_held`, `permission_requires` and
  `role_name_unavailable`. 400 for a permission never offered, a missing
  need, an Owner not alone, no roles, or another organization's role (a body
  id, as the handoff's rule says, where it had been 404); 404 for no such
  role; 409 for a name taken or reading as built in, a built-in role changed
  or deleted, a stale save, a held role, a role a live invitation names, and
  the last Owner; 403 for giving. The three locked permissions are added
  when a request leaves them out.
- **Needs.** `PERMISSION_NEEDS` lists only direct needs: every create,
  update, delete and act needs its view, and a route's reads across areas
  add the rest (moving stock needs products and locations; raising an order,
  partners and products; drafting an invoice, orders; the others in
  `permissions.ts`). Raising a replacement for a return needs
  `orders.create` at its route rather than as a need, so a role that closes
  returns does not gain raising orders.
- **Prices.** Withheld field by field from an order, the orders list and the
  export's columns, and a test pins the exact fields a reader without
  `orders.view_prices` receives, so a new field fails it until it is
  classified (#177 asks for one optional object). An order's invoice money
  follows `invoices.view`, and its amount not yet invoiced needs prices.
  Reading the audit log needs `orders.view_prices`, since the log keeps
  orders' prices: the one view with a need.
- **Whom to ask.** Every refusal, Home and Your access name up to three
  members who hold `roles.assign`, the missing permission and everything the
  reader's roles grant, Owners first, never the reader. A refusal quotes the
  permission's line, never its key (#148, in part).
- **The Owners' lock.** Demoting, removing, Move everyone, leaving and
  completing an account's deletion take one advisory lock on the
  organization's Owners, after the organization row's lock where both are
  taken.
- **Receiving.** An order line carries whether its item tracks lots and its
  unit, so receiving needs `orders.receive` alone; lot trace and an order's
  partner show as text where the reader may not open them.
- **Audit.** `role.created`, `role.updated` (its line from and to, the
  Owner's configuration rather than a note), `role.deleted` and
  `member.roles_changed`; `user.role_changed` has no writer and still reads.
- **Words and marks.** English lists in British style, without the Oxford
  comma; French gives a role with « attribuer ». A made role's chip has
  square corners and a built-in one's round, so the two differ by more than
  colour (WCAG 1.4.1). Roles lists the built-in three first.
- **Left for issues.** #177 (prices in one object), #178 (one link that
  leads only where the reader may go, and lookups that check their own
  permission), #179 (what Move everyone gains and loses; a role deleted
  while being given), #180 (`membership_roles.csv`), #181 (the audit log
  shows costs to readers without them), #182 (permissions read twice on some
  requests), #183 (a flaky phone sign-in), #184 (straight apostrophes).
  #148, #155 and #169 have parts left, each said in #176.

---

## ADR-081 — Old tabs after a deploy: a newer build noticed, an outdated client told (amends ADR-013, ADR-051, ADR-052, ADR-054, ADR-055 and ADR-068)

> **Amended by [ADR-082](#adr-082--the-products-brand-panivo-before-sign-in-the-organizations-after-amends-adr-019-adr-051-adr-055-adr-060-and-adr-081).**
> Help's foot names the product before its version, and the © line follows under it.

**Context.** A tab stays open for days, and the app deploys underneath it.
Issue #175, found on 21 October 2026, lists what then goes wrong. The pages
behind the layout load as chunks of their own (`client/src/pages.ts`),
and a tab asks for its own build's chunks. When one fails to load, the
error boundary calls it "A new version is available" from its message
alone, a dropped connection included, and nothing listens for
`vite:preloadError`. The API cannot tell one client build from another,
so a changed shape fails a write or is misread on a read: ADR-080 swapped
`roleId` for `roleIds`, and a tab open across that deploy was refused
with "property roleId should not exist" and showed Members' unknown-role
fallback. And switching to a language whose catalogue fails to load does
nothing and says nothing.

Checked before drafting, as the working agreements ask:

- **Fired, and taken here.** #175's five points. ADR-052 accepted, for
  one change, that an old bundle's writes are refused until the page
  reloads; this ADR makes that the general case, with ADR-052's lenient
  mode one of two ways through it. ADR-080's consequence "the access query
  timed on `seed:volume`", which its as-built amendment does not record
  and nothing in `perf/` measures. ADR-051's two follow-ups left over in
  the handoff, `perf/` never type-checked in CI and one manifest for both
  scales, since this ADR's volume step edits `perf/`. #175's "later, an
  Open decision": feature flags and staged rollouts, now an entry. The
  handoff's "before real users": the `/production-readiness` skill, added
  here and run first on its deploys section. From #172's reviews, the
  status tones MUI derives below contrast. The browser-compatibility lint
  rule the handoff left as a chore, since this ADR gives the browser floor
  a section of the skill.
- **Not fired, and kept in step.** ADR-013's `/v1` stays: the revision
  below lives inside it, for the app's own client, and a request without
  one is never refused. `error-codes.ts`'s rule that a code is never
  renamed holds, for the same reason. Playwright against `vite build`
  (the handoff's watch list) is not taken; see Tests. Monitoring (Open
  decisions, "The operator": an error tracker and an uptime check) and "A
  security review before real customers" are reported on by the skill and
  decided in the whole-app review that follows this ADR. #142, the
  client's Content-Security-Policy, keeps its own PR; it is set in the
  same Render panel as the cache headers below. ADR-070's unindexed
  foreign keys and `pg_stat_statements` go to the skill's performance
  section.
- **Found while checking.**
  - Three kinds of chunk, not one: 39 pages, 2 catalogues and 66 Help
    guides, and only Help says when one fails. With a stored language
    other than English, `LanguageProvider` renders nothing until its
    catalogue loads, so a catalogue that fails at start is a blank app.
  - The static site and the API deploy separately from every push, and
    the static site usually finishes first: for those minutes a new
    visitor runs the new client against the old API, the other way round
    from #175.
  - The API's build command runs `npm run migrate` while the previous
    release still serves, so for a minute or two old code runs on the new
    schema. Migration 0073 dropped `memberships.role_id`, which the
    previous release's access check read on every request.
  - PDF and export links are plain links (`apiUrl`), outside `api()`.
  - `/health` says which commit answers (`RENDER_GIT_COMMIT`); the static
    site says nothing.
- **Answered by hand.** Render keeps the previous build's files: on 21
  October 2026, the entry chunk of the build before #176 still came back
  as JavaScript (`docs/runbooks/render.md`). A tab open across a deploy
  keeps loading its own pages; what changes under it is the API.
- **Found by the skill's first run** (`/production-readiness deploys`, on
  22 October 2026, before anything else was built):
  - Migration 0067 broke the running release too, another way: it replaced
    `document_sequences`' primary key, which the release still serving
    named in its `ON CONFLICT`, and made two columns required with no
    default. Until #136 went live, nothing could take a number.
  - On #176's deploy the static site was live 44 seconds after the merge,
    before CI had finished and before the API.
  - Render's edge keeps every file for five minutes (`s-maxage=300`) and
    ignores a request's `no-cache`, though a new query string misses it.
    A missing `.json`, `.svg` or `.woff2`, or a path without an extension,
    comes back as `index.html` with a 200; a missing `.js`, `.css` or
    `.png` as a plain 404.
  - Hashed assets are sent `max-age=0`, so a browser asks again for every
    chunk on every load.
- **Found by the build's inventory** (step 3, 22 October 2026), and settled
  with Bob before any code: sign-out was refused to an outdated tab; for
  the minutes between the API's deploy and the client's, a tab is outdated
  while the version file still names its own build; a phone's top bar at
  320 px has no room for another button; seventy dialogs share no wrapper,
  though the theme's dialog defaults reach them all; a listener that
  prevented `vite:preloadError`'s default would make a failed import
  resolve to nothing; the request log writes a 409 at warn and a 503 at
  error with a stack; the product image upload is a write outside `api()`;
  and switching language saves the choice before its catalogue has loaded.

**Decision — a version file.** The client's build writes `version.json`
beside `index.html`: the build (the commit Render builds,
`RENDER_GIT_COMMIT`, else git's, else the time), when it was built, and
the API revision below. The build compiles its own id in. A tab reads the
file when it comes back to the front, every ten minutes while it is in
front, and after any load that fails or request refused as outdated, with
`cache: 'no-store'` and a query string of its own each time, since Render's
edge ignores the first but not the second. Anything but the version's
JSON, such as the `index.html` the host returns for a file it lacks, reads
as unreadable, never as a build. On the dev server the file names `dev`,
which never differs, so nothing fires.

**Decision — "New version", and a reload at the next page.** One name
for it everywhere, "new version", in each language: in the top bar, the
banners, the status page, Help and the refusals, so nobody wonders whether
two words mean two things. Once the file names a newer build:

- **Signed in, in the top bar.** On a computer, "New version", a button
  with an icon beside Help, opening a short note: "A new version is ready.
  It loads by itself when you open another page", with Reload now. On a
  phone, whose top bar has no room for another button at 320 px, a dot on
  the account button, and the new version first in its menu: "A new
  version is ready · Reload now". The top bar's height never changes, so
  nothing on the page moves under someone's hand, as a banner appearing at
  the top would. Its arrival is announced once to screen readers.
- **Signed out, a banner.** Nobody is mid-task there, and those pages have
  no top bar: "A new version is ready. It loads when you open another
  page", with Reload.
- **Amber when saves would be refused.** When the new version's API
  revision is above the tab's, its saves will be refused (below), so a
  banner at the top of the page takes the button's place, and the same
  line shows at the very top of every dialog open or opened, above its
  title, since a dialog that fills a phone's screen covers the page: "A new
  version is ready, and this tab can no longer save changes. Copy anything
  you've typed, then reload." It is added once, through the theme's dialog
  defaults, not in each of the seventy; a dialog that only shows something
  (the image viewer) leaves it out. Rare and urgent, it may move the page.
- **The next page.** Opening another page means its path changing; a tab
  or a filter kept in the address does not count. Once that page has
  rendered, it loads in full from the new version. The unsaved-changes
  prompt runs first, so nothing typed is lost, and because the reload
  follows the move rather than racing it, the browser's own "Leave site?"
  never follows the app's.

**Decision — a load that fails says why.** Any chunk that fails to load,
a page, a catalogue or a guide, is tried once more after a second. Then the
version file decides:

- **It cannot be read:** the offline status page, whose Try again reloads
  the page. It also tries again by itself when the browser says the
  connection is back, and says so: "This page tries again by itself when
  your connection comes back."
- **It names a newer build:** the page being opened loads in full from the
  new version, once. If it fails again within a minute, "A new version is
  ready" shows, "A new version came out while this tab was open. Reload to
  use it; nothing is lost", with Reload, so it can never loop.
- **It names this build:** the crash page with its reference, as now.

Help, which loads its guides beside the page, says "This guide has a new
version. Reload to read it" rather than reloading under someone reading.
All three kinds load through one loader, so a failed preload reaches it as
its import's rejection, and nothing listens for `vite:preloadError`: a
listener that prevented its default would turn the failure into an import
that quietly resolves to nothing.

**Decision — the API revision.** One number in
`server/src/common/api-revision.ts`, starting at 1, is the API's revision
within `/v1` (amends ADR-013). The API document carries it as its
`info.version`, `1.<revision>`, and `npm run api` writes it into
`client/src/api/` with the types, so the contract check fails a client and
a server that disagree (amends ADR-068). `api()` sends it as
`X-Api-Revision`, as does the product image upload, a write outside
`api()`. The server compares it first, before the session is read or the
body validated (a body that is not JSON at all is refused by the parser
before it, as today):

- **Lower than the server's:** 409 `client_outdated`, "This tab is running
  an older version of the app, so nothing was saved. Copy anything you
  typed, then reload." A page whose read is refused shows the new version
  status page; a dialog keeps what was typed and offers Reload beside the
  refusal. A refused session read leaves the app as it is and makes the
  check urgent: it is never read as signed out, nor as "Could not reach
  the server". If the version file still names the tab's own build, the
  new version is still on its way, since the API deploys first: the tab
  says what the 503 says, a page tries again by itself, and the file is
  read every 30 seconds until the new build is out.
- **Higher than the server's,** the API not yet deployed or rolled back:
  503 `api_updating` with `Retry-After: 60`, "A new version is being
  installed. Try again in a minute; nothing was saved."
- **No header,** from a test, a script, a PDF or export link, or one day an
  integration: served as today.
- **Sign-out** is always served, whatever the revision: ending a session
  must never fail, on a shared computer least of all, and it sends nothing
  to misread.

Each refusal is logged once, at info and without a stack, with its route
and both revisions, so after a deploy the log says how many open tabs it
met; the request log and the exception filter, which would write a 409 at
warn and a 503 at error with its stack, leave these two codes to that
line. `/health` adds
the revision beside the commit.

**Decision — when the revision rises.** An additive change keeps it: a
new route, a new optional field in a request, a new field in a response. A
breaking change raises it by one, in the commit that makes it: a field
removed or renamed, one newly required in a request, a type or a format
changed, a route removed, a value removed from a list a request takes.
Where old tabs matter more than the effort, the old shape is kept working
for a while instead, logged until nothing sends it, as ADR-052's lenient
mode did (amends ADR-052: one of two ways now, not the way). CI holds the
rule: its contract check compares `server/openapi.json` with `main`'s using
oasdiff, a pinned container image rather than a dependency, and fails a
breaking change that left `info.version` where it was. `/code-review`
checks it by reading too.

**Decision — the API first, then the client.** The static site no longer
deploys itself. A workflow on each push to `main` waits until the API's
`/health` names the pushed commit, then calls the static site's deploy
hook, kept as a secret. If the API's deploy fails, the client stays where
it was, matching it. That ends the minutes in which a new client meets an
old API. The 503 above stays for a rollback, which takes both services
back together (`render.md`). Any host has a health URL and a deploy hook,
so nothing here ties the deploy to Render.

**Decision — migrations that work with the release still running.** A
migration runs while the previous release still serves, so it leaves
working the schema that release reads: in one deploy, add, never take
away. Dropping or renaming a column or a table, changing a type, making a
column required without a default, or replacing or dropping a key or a
unique index that a released query's `ON CONFLICT` names waits for a later
migration, once no released code reads the old shape: expand, then
contract, which ADR-052 already asked of large tables. CI runs squawk, a
Postgres migration linter, on each new migration, pinned and run through
`npx` as the Markdown check is, and fails those statements unless an
ignore comment beside one says why the running release does not read what
it changes. Squawk cannot know which key a released query names, so
`/code-review` checks that one by reading, and the rest too. ADR-080's
0073 and ADR-073's 0067 would each have been two migrations, a deploy
apart.

**Decision — a language that fails to load says so.** Switching tries
once more, then stays in the current language and says "Couldn't load
简体中文. Check your connection and try again", with Try again in the
message itself, which stays until it is closed. The catalogue loads first;
only once it has does the choice go to the account and the device, so a
failed load changes nothing saved. At start, a stored
language whose catalogue fails falls back to English, with a banner naming
the language and Try again, rather than a blank page. If the version file
names a newer build, the page reloads instead (amends ADR-054).

**Decision — Render's settings, by hand, in `docs/runbooks/render.md`.**
The old-files answer (above). Cache headers, set where Render's own
differ: `/assets/*` for a year and immutable, rather than asked for again
on every load; `index.html` and `version.json` never cached, the browser's
and Render's edge alike, checked with `curl -sI` and its
`cf-cache-status`. The web service's health check path, `/health/ready`,
so traffic moves to a new release only once it answers with its database
up. The web service deploying after CI's checks pass, where Render offers
it, so a `main` whose CI fails deploys neither the API nor, after it, the
client. The static site's auto-deploy off, with its deploy hook in
GitHub's secrets. A rollback always takes both services back together.

**Decision — `/production-readiness`, a review before real users.** A
Claude Code project skill in `/code-review`'s shape: report only, on the
whole app or one section. Eight sections: deploys and old tabs; backups
and a restore tried; monitoring; security; performance; email; support;
browsers and China. Each finding carries its evidence (a `path:line`, a
workflow run from `gh run list`, a runbook line) and is grouped Before
real users, Before the first paying customer, or Worth considering, with
the ADR or trigger it ties to. What only Bob can see (the Render
dashboard, DNS records, a restore) is a By hand list with exact steps. It
runs first in this ADR's branch, on its deploys section, so what falls
inside #175 is built here; its whole-app run follows this ADR.

**Decision — the browser floor, held by ESLint.** `eslint-plugin-compat`,
set to the build's own target (conventions.md, "Supported browsers"),
fails code that uses an API newer than the floor without a guard, as
`Intl.Segmenter` once was. The skill's browsers and China section checks
the rest: nothing loaded from another site, `index.html`'s engine tags,
reaching the app from mainland China, and the devices only a person can
try (Android WeChat, 360 and QQ on Windows in 极速模式).

**Decision — the volume seed catches up with ADR-080.** Each organization
gets a team: 15 members at small scale and 150 at large, with 4 and 12
made roles from the templates and copies, each member holding one to
three, and a few invitations pending that name roles. `npm run perf:plans`
gains the access query, what one member of three made roles may do
(`memberPermissions`), and who holds a permission (`holdersOf`), both
timed at large; the numbers go in this ADR's as-built amendment. `perf/`
is type-checked in CI's server job, and `seed:volume` writes one manifest
per scale, `volume-<scale>.json`, which `npm run perf` reads by its
`--scale` (amends ADR-051).

**Decision — the seeds grow with every feature.** From this ADR on, each
feature adds what it needs to both: to `seed:demo`, so its screens, manual
checks and walkthroughs start without setup; to `seed:volume`, realistic
rows for any new table or hot query, timed against ADR-051's budgets. A
feature with nothing to add says so. CLAUDE.md and conventions.md say it,
and every build brief has a step for it. This ADR adds nothing to the
demo: what it shows follows a deploy, not data.

**Decision — what rides along.**

- **The status tones' contrast.** MUI derives `light` and `dark` from each
  status colour, and two fall short. The crash page's icon disc reaches
  2.2:1 in both modes, against 3:1 for an icon; a Home card's empty line,
  `success.dark` on the dark surface, reaches 4.33:1, against 4.5:1 for
  text. Both take ADR-055's tones instead, whose background and text pairs
  pass, and the status page's other discs move to them too (amends
  ADR-055).
- **References kept whole.** A document's number (`SO-DEMO-1`,
  `PO-000009`) never breaks at its hyphen; a line breaks between a
  reference and its words instead.
- **Home's failure line in words.** Home showed a dropped connection as
  "Failed to fetch", skipping the words every other page gives it.
- **Home's tiles in even rows.** With eight tiles, Home showed seven and
  one alone. The tiles share their rows evenly: as many rows as the width
  needs, the tiles spread across them, so eight read as two rows of four,
  and a phone shows two to a row.

**Tests.** The server's e2e suite: each refusal, a request without the
header served, sign-out served to an outdated tab, and the refusal made
before the body is validated. Component tests: the version check, the top
bar's button and the phone's dot, the banners, the amber line in a dialog,
a reload at the next page and not before, each way a load fails, the
offline page trying again by itself, a refusal in a dialog and on a page,
a tab outdated before its new version is out, a refused session read, and
a catalogue that fails with nothing saved by it. Playwright replaces
`version.json`, the static host's file and never the API's, to stand for
a deploy, and aborts a page's chunk to stand for a dropped connection: the
top bar's button appears, a move between pages reloads, a dropped
connection says so. Its rule that nothing is mocked is about the API, and
stays; conventions.md says so.

**Considered and not done.**

- **Reloading the moment a newer build appears.** It takes whatever
  someone is typing.
- **A blue banner on every page while signed in,** as first drawn. Appearing
  at the top while someone works, it moved the page under their hand; the
  top bar's button moves nothing.
- **Refusing every client built before the server.** Every deploy would
  refuse every open tab, the additive ones included.
- **Sending old tabs to the old release,** as Vercel's skew protection
  does. Render keeps the files, which covers the pages; the API would need
  old releases kept running.
- **A service worker.** It would cache the old build itself, the problem
  this ADR solves.
- **Telling tabs over a socket.** A small file read at the right moments is
  enough.

**Deferred — each with what brings it in.**

- **Keeping the last build's files ourselves.** Trigger: a host that drops
  them, Render included if a check (`render.md`) ever finds them gone.
- **Reporting failed loads and refusals to an error tracker.** Trigger:
  the monitoring decision (Open decisions, "The operator").
- **Playwright against the built files** (`vite build`, `vite preview`).
  Trigger: a fault the dev server hides.
- **Feature flags and staged rollouts** (Open decisions). Trigger: the
  first paying customers.

**Consequences.**

- No migration.
- Server: `common/api-revision.ts`; a middleware first in the chain,
  refusing with `client_outdated` and `api_updating` (in
  `error-codes.ts`) and logging each; `/health` with the revision; the
  document's `info.version`; `npm run api` writing the revision into
  `client/src/api/`. E2e tests as above.
- CI: oasdiff in the contract check, squawk on new migrations, `perf/`
  type-checked; `/code-review`'s rules for the revision and for keys a
  released `ON CONFLICT` names; `scripts/verify.sh` runs the first two
  where Docker is up.
  A workflow that deploys the static site once the API names the commit.
- Client: the version file and the build id from a Vite plugin; the
  version check; the top bar's button, the banner on the signed-out pages,
  the amber banner and the amber line in dialogs; one way every chunk
  loads and fails (pages, catalogues, guides); the offline page trying
  again by itself; `api()` and the image upload sending the revision, and
  the two refusals on pages and in dialogs; the language's failure paths;
  the tones, references kept whole, Home's failure line and its even rows;
  `eslint-plugin-compat`. Designed on the canvas first: the button and its
  note, the amber banner and the signed-out one, on a computer and a phone
  in English and 中文, and the amber line in a phone's full-screen dialog;
  the offline, new version and crash pages, and Help's guide; a dialog
  told before typing, a refusal after, the new version on its way, and a
  page refused; a language that fails; Home's tiles and references.
- `.claude/skills/production-readiness/SKILL.md`, and its first run.
- `seed:volume`, `perf:plans` and a manifest per scale.
- Docs: `docs/runbooks/render.md` (the settings above); manual checks
  section 34; conventions.md's status pages, error codes, API contract
  (the revision), migrations (expand, then contract) and tests
  (Playwright's rule); this ADR's as-built amendment; the handoff.
- Build order: this ADR; dependencies; the skill, run on deploys; an
  inventory of every chunk, every request outside `api()` and every place
  a failure is shown; the volume seed; the server; CI; the client, after
  the design; the riders; the deploy workflow and the runbook;
  dependencies again; the reviews; the docs last. Built by Claude Code, a
  prompt per commit (handoff, *How code is delivered*).

**Amendment (October 2026) — as built (#199).** What building settled:

- **The version file and the check.** `version.json` holds the build,
  when it was built, the release (`client/package.json`'s version) and the
  API revision. The tab reads it as it starts, not only on coming back to
  the front and every ten minutes, so an old `index.html` from Render's
  edge is caught; each read has a query string of its own and
  `cache: 'no-store'`, and gives up after 5 seconds. Anything but its JSON
  is unreadable and changes nothing; each read that succeeds sets the
  state, so a rollback to the tab's own build clears it. Urgent means the
  newer build's revision is above the tab's, or the API has refused the
  tab.
- **Where "New version" shows.** On a computer, the top bar's button and
  its note. Below 600 px, the width where Help becomes an icon, the
  account button's dot and the menu's first item, keeping the board's
  second line. Signed out, the banner sits under the language and text-size
  row, and turns amber too, since sign-in would be refused. The banners are
  MUI's standard info and warning alerts, like the app's others. The amber
  line reaches every dialog through the dialog paper's component setting
  (`VersionPaper`), not by replacing the paper; the image viewer, and Help
  and the lookup on a phone, opt out. An open dialog hides `#root` from
  screen readers, so the announcement is in every dialog too, and says the
  urgent words once urgent.
- **The next page** loads in full once per newer build, ever, recorded in
  `sessionStorage`: if it comes back on the old build, the button or the
  banner stays and nothing reloads by itself again. Without storage,
  nothing reloads by itself. The chunk loader's reload keeps a one-minute
  guard, and the two share one record.
- **A load that fails.** One loader, `loadChunkOrReload`
  (`client/src/version/load-chunk.ts`), for pages, catalogues and guides,
  throws a `ChunkLoadError` naming its case, and the error boundary reads
  that rather than the browser's words. Render answers a vanished chunk
  with a plain 404. The offline page, and `LoadFailure`'s too, tries again
  on the browser's `online` event. A known limit: in Safari, a connection
  dropped for under a second while a page's import loads shows the crash
  page, since Safari keeps the failed fetch until a reload; Reload fixes it.
- **The revision.** `API_REVISION` is 1, `info.version` 1.1, and
  `client/src/api/revision.gen.ts` is written by
  `client/scripts/write-api-revision.mjs` after openapi-ts. The middleware
  runs after pino-http has given the request its id and before
  `SessionContextMiddleware`; anything but digits above zero is no header.
  It records each refused request, so the request log (`requestLogLevel`)
  and the exception filter's 5xx log stay silent for it, leaving one info
  line, "Refused an outdated client" or "Refused a client newer than the
  API", with the method, the path, both revisions and the request id. The
  log counts refused requests, not open tabs, though the bell and the idle
  guard rest in an outdated tab. `/health` also names `version`, read from
  `server/package.json` once as the server starts, since Render runs it as
  `node dist/main`, where npm's variables are absent.
- **Outdated on screen.** `send()` waits for the version read before the
  caller hears of a refusal, so the first words are right. "On its way" is
  outdated with no newer build known, an unreadable file included: the
  503's words, a page that tries again every minute while in front, and a
  read every 30 seconds until the build is out. `useResource` and
  `useKeysetList` report a refusal, and `messageFor` words it as the page
  renders; Your account's sections, New order's pickers and panels inside
  pages show the server's words under the amber banner. `FormError` adds
  Reload by the tab's state, so a client-side line shown then gets it too.
  A refused first session read shows a full-page status, a later one leaves
  the app as it is, and sign-out's answer doesn't count as being served. The
  product image upload shares `api()`'s headers and its refusal. A refused
  dialog shows Reload twice, the refusal's and the amber line's, as this ADR
  asks for both.
- **Languages.** The catalogue loads first; the device keeps the choice once
  it has, and the account once `setLocale` says so. A language that fails
  says so in its own words, not in English (amending the decision above):
  those few messages ship in the main chunk, listed in
  `client/src/i18n/failure-ids.json` and written by
  `scripts/write-failure-words.mjs` at `i18n:compile`. The toast stays until
  closed, sits at the foot of the toast stack, below any confirmation, says
  so with Reload when a newer build is the cause, and shows that it is
  loading again while Try again works. The account's language applied at
  sign-in counts as a switch, except the one the start banner names.
- **CI.** A job of its own, "Against main", on pull requests, compared with
  the merge commit's first parent; `scripts/check-api-breaking.sh` (oasdiff
  v1.33.0, pinned by digest, no network) and `scripts/check-migrations.sh`
  (squawk-cli 2.68.0) are shared with `scripts/verify.sh`, which compares
  with the merge base and exits 3, saying why, when a check cannot run. A
  removed request property or parameter, and a removed optional response
  field, count as breaking; a change reviewed and accepted is listed with its
  reason in `server/openapi-breaking-accepted.txt` (swagger 12.0.3's
  `maxItems` were the first). `server/.squawk.toml` keeps this ADR's rules
  and turns off eleven that drizzle-kit's ordinary output trips, each with
  its reason, `ban-drop-constraint` among them: a key replaced under a
  released `ON CONFLICT`, as in 0067, is for `/code-review`'s new rule. This
  PR took `main` from `1` to `1.1`, so its own check could not bite.
- **Deploys.** Neither of Render's options gives the order. "After CI checks
  pass" waits for every check, the deploy workflow's own included, and a
  service with a root directory deploys only on changes under it. So both
  Auto-Deploys are off (replacing "the web service deploying after CI's
  checks pass"), and `.github/workflows/deploy.yml`, run when CI passes on a
  push to `main`, calls the API's deploy hook with `?ref=<commit>`, waits up
  to 20 minutes for `/api/health` to name it, then calls the static site's.
  That needs a second secret, `RENDER_API_DEPLOY_HOOK`; every deploy
  redeploys the API; a docs-only push, which CI skips, deploys nothing; and
  CI now runs for Help's guides. A newer run cancels an older one, waiting
  or deploying. On #176's deploy the client had met the old API for about
  50 seconds. The settings, the cache headers and a rollback are in
  `docs/runbooks/render.md`.
- **The volume seed and the access query.** Each organization's members
  count everyone, 15 and 150, so the team is 13 and 148: a second Owner and
  Admins, then members holding one to three made roles in exact shares, so
  one holding three always exists, and no Viewers; made roles at large are
  three times small. At large the access query takes 0.09 ms for a member of
  three made roles, and who holds a permission 0.73 ms; no access table
  reaches 10,000 rows, and with sequential scans off every table is read by
  an index, so no index changed. That pays ADR-080's owed timing. `perf/`
  was already type-checked by `npm run typecheck` (since 7 October);
  `--scale` defaults to small; the plan check warns on a manifest of one
  organization and fails on one with no three-role member.
- **The riders.**
  - **Tones.** The status page's discs take ADR-055's tones (offline
    neutral too), 8.1:1 and above; Home's empty line had never been green,
    since MUI 9's Typography ignores a dotted `color` (#196), and is drawn
    through `sx`.
  - **References.** `Reference` keeps one value whole inside a message;
    `ReferencesWhole` keeps every hyphenated word whole in the server's
    text (notifications, Home's detail, the audit log, activity, toasts,
    refusals). A code over 16 characters may break, and a page heading or
    a reference standing first is left alone. Browsers break at a hyphen
    only before a letter, so this ADR's `PO-000009` never broke.
  - **Tiles.** Equal columns in as few rows as fit, from container queries
    in rem; an odd count can still leave one alone (seven where three fit
    is 3 + 3 + 1; a phone, 2 + 2 + 2 + 1), and at 320 px, or 390 px with
    Larger text, it is one to a row.
  - **The browser floor.** `eslint-plugin-compat` 7.0.2 holds Web APIs and
    built-ins only up to about ES2022; newer built-ins, a method called on
    a variable and CSS are #197.
- **Left for issues.** #186 (the lookup reads every organization's rows),
  #187 (plans at large), #189 (the bell's "Nothing yet.", in an outdated tab
  too), #190 (Resend), #193 (request fields on every log line), #194
  (`npm run api`'s first run), #195 (a list's alert above its empty state),
  #196 (Typography's colours), #197 (the browser floor's gaps), #198
  (unsaved work on most pages).

**Correction (24 October 2026, #196's review).** Render's edge ignores a
request's query string as well as its `no-cache`: a query string never
seen before was answered from the edge at age 0. What brings a new build
is Render emptying its edge at each deploy, and `/` and deep links turned
over at once with the rest, so no page stays old for five minutes after a
deploy. The lines above that say a new query string misses the edge are
wrong in that. The version check keeps its query string and
`cache: 'no-store'`, which still get it past the browser's cache
(`render.md`, "The edge and the query string"). Deploy by hand
(`workflow_dispatch`, `main`'s newest commit whose CI passed) and a
read-only check of the live site after each deploy came with #196 (#224);
the deploy job runs in GitHub's `production` environment, limited to
`main` and holding the hooks.

---

## ADR-082 — The product's brand: Panivo before sign-in, the organization's after (amends ADR-019, ADR-051, ADR-055, ADR-060 and ADR-081)

**Context.** The product was named Panivo, 品桥 in Chinese, in October
2026, and #201 gave the tab its icon and every tab the name
`VITE_APP_NAME` sets. Nothing else says whose app it is. The sign-in and
register pages show a form with no name above it; the rail ends with
nothing under an organization's logo; Help's foot names a version and
no product; an email is signed by `MAIL_FROM`'s name and shows no mark;
and a phone's home screen takes the name of whichever page it was added
from. ADR-060 drew the line between the two: the tab icon and the
sign-in page come before anyone signs in, so they stay the product's
own, and after sign-in the theme, the logo and the documents are the
organization's. This ADR fills in the product's side of that line.

Checked before drafting, as the working agreements ask:

- **Fired, and taken here.** The handoff's "Still to do, in code", the
  brand's next PR, item by item. From #201's `/production-readiness`:
  the ICO holds the light mark only, so its navy stem is about 1:1 on a
  dark Windows taskbar or Safari 16.4 to 18's dark tab bar; and with no
  web manifest, which icon Android's Add to home screen takes is
  uncertain. ADR-060's "the sign-in page stays the product's", which no
  screen had acted on yet.
- **Not fired, and kept in step.** ADR-060's white-labelled domain, tab
  icon and sign-in page: no customer sells the product under their own
  name, and the names below are settings, so a deployment can be renamed
  without code. ADR-060's second logo for dark backgrounds is about an
  organization's logo; the product's mark has its own master for dark.
  ADR-037 keeps the security emails the product's, which this does.
  ADR-077 names an organization in an invitation in words, never by its
  logo, since mail apps block images, and an invitation stays so. #142,
  the client's Content-Security-Policy: a manifest will want
  `manifest-src 'self'`, and nothing below loads from another site. #212
  (Help's Esc before its guide loads): the line below sits in the same
  panel's foot and leaves its keyboard alone.
- **Found while checking.**
  - ADR-055's default accent `#5546B8` and the dark rail `#1C2230` are
    the mark's own bowl and stem (`docs/brand/README.md`), so the
    brand's colours ask nothing of the theme.
  - Help's foot already carries ADR-081's version line.
  - Emails are built one by one, with no layout they share: verification,
    reset and the security emails in `core/auth`, an organization's
    notices beside them.
  - MC-3501, on 24 October 2026, on a Mac in dark mode with a light
    Chrome theme: the favicon switched to its dark version, and its white
    stem nearly vanished on the light tab strip. A favicon follows the
    system's scheme, which need not be the tab strip's.
  - Dependabot. Alert 4, esbuild up to 0.24.2, medium and development
    only, comes from drizzle-kit 0.31.11's deprecated
    `@esbuild-kit/esm-loader`, which pins esbuild `~0.18.20`; #113 left
    it open on purpose, since nothing starts esbuild's dev server, until
    drizzle-kit ships without it (1.0, whose fifth release candidate
    came out on 21 October 2026). Alert 6, multer 2.4.0, high and in production code,
    comes from `@nestjs/platform-express` 12.2.0, which pins multer at
    exactly 2.4.0, the newest release on 24 October. Its crash needs an
    asynchronous `fileFilter`, and no upload route sets a `fileFilter`
    at all, so it cannot be reached here.

**Decision — the product before sign-in, the organization after.**
ADR-060's line, kept and filled in:

- **Signed out, every page:** the mark and the product's name above the
  content, and a footer carrying the © line (below): sign-in, register,
  forgot password, reset password, the email confirmation, and the
  status pages shown signed out (not found, offline, the crash page). The
  invitation page and its refusals are the organization's: its logo and
  name stay their heading, and Panivo is in their footer only, so two
  marks never compete.
- **Signed in:** the organization's logo, or its name, tops the rail as
  ADR-060 has it, and "Powered by Panivo", small, sits at the rail's
  foot, in the mark's version for that rail: the on-dark master on the
  dark rail, the light one on the light rail. Folded, the rail shows the
  mark alone, named for screen readers. The menu drawer, below 1200 px,
  ends the same way.
- **Words:** "Powered by" in each language, around the name.

**Decision — the names and the © line are settings.** Like
`VITE_APP_NAME`, each is read when the site is built:

- **A name per language,** `VITE_APP_NAME_` with the language's tag:
  `VITE_APP_NAME_ZH_HANS=品桥` for 中文, the only one set. It names the
  tab, the mark at sign-in, Powered by and Help's foot in that language;
  a language without one uses `VITE_APP_NAME`. The title before the app
  loads, and the home screen's name, stay `VITE_APP_NAME`: `index.html`
  and a manifest each hold one name.
- **The © holder,** `VITE_COPYRIGHT_HOLDER`: "© 2026 Zhenzhong (Bob)
  Zhou", the year the build's own, so nobody edits it in January. Unset,
  as on a fork, there is no © line rather than someone else's name. In
  production Bob's legal name with the name he goes by in parentheses
  (Bob, 24 October 2026), until a registered business's name replaces
  it.

**Decision — one icon on a plate, wherever someone else paints the
background.** The tab, the taskbar, a home screen and a mail app are
drawn by the browser, the system or the mail app, and the app cannot
know their colour. So all of them take one icon that never switches:
the mark on a small rounded navy plate, the dark app icon (Bob, 24
October 2026, on the canvas). It is the SVG favicon, the ICO, the
iPhone's home-screen icon, the manifest's icons and the emails' mark.
Inside the app, where the app paints the background, the mark switches
with Light and Dark as everything else does: at sign-in, at the rail's
foot, in Help's foot, while the app loads.

**Decision — the home screen, the browser's bar and a shared link.**

- **A web manifest,** `client/public/manifest.webmanifest`: its name and
  short name from `VITE_APP_NAME`, icons at 192 and 512 px on the plate,
  one of them maskable with the mark inside its safe zone, and
  `display: browser`. It is there for the icon and the name.
- **`apple-mobile-web-app-title`,** `VITE_APP_NAME`, so an iPhone's
  home-screen icon reads Panivo, not the page it was added from.
- **The browser's bar in the page's colour.** `theme-color`, once for
  light and once for dark, from `tokens.ts`'s page colours (`#F6F7F9`,
  `#161A21`), and the app sets it to its own mode when someone has chosen one; a
  phone's bar then matches the page instead of staying white above a
  dark app.
- **A card when the app's address is shared.** Open Graph tags in
  `index.html`, so a link pasted into a chat shows a card: the name,
  "Inventory, orders, production and invoices.", and a 1200 × 630
  picture of the mark on navy with both names, made from the masters.
  The picture's address must be absolute, so it comes from a build
  setting, `VITE_SITE_URL`; unset, the card has no picture. The card is
  the same for every link, since the pages are built in the browser, so
  a copied invitation link shows Panivo, never the organization. WeChat
  makes its own previews.

**Decision — the mark while the app loads.** `index.html` draws the mark
centred on the page's colour until the app's first page replaces it, in
the mode the app will open in: the device's stored choice, else the
system's, read by a few lines before anything draws, as ADR-075 applies
the text size. In Dark the page is dark from the first moment, with no
white flash. The mark appears only after about 300 ms, so a quick load
shows the page's colour alone rather than a flicker, and it does not
move.

**Decision — the product's emails carry its mark; an invitation does
not.** Every email the product sends about an account or an
organization (verification, reset, the security emails, an account's or
an organization's deletion notices) opens with the mark on its plate and
the product's name in text beside it, from one header they share. The
bare mark's navy stem would vanish in a mail app's dark mode, and Gmail
ignores the code a switching mark would need. The name
is `MAIL_FROM`'s, which already signs them. The mark is a PNG at twice
the size it is drawn, served by the static site from `CLIENT_URL`, with
an empty `alt` since the name beside it says the same: a mail app that
blocks images loses nothing, and Gmail drops an image carried as a
`data:` URL. An invitation is the organization's (ADR-077) and stays as
it is.

**Decision — an organization's documents carry no product mark.** An
invoice, a credit note, a packing slip and the rest are the
organization's papers to its customers, with its logo (ADR-060). A
vendor's mark on a customer's invoice is a thing buyers object to.

**Decision — the colours stay.** ADR-055's brand layer needs no change:
its default accent and the dark rail are already the mark's purple and
navy. Since the two share them, a change to either is made to both: the
masters in `docs/brand/`, the files made from them, and `tokens.ts`
(amends ADR-055).

**Decision — Help's foot names the product.** ADR-081's version line
starts with the product's name, "Panivo · Version 0.7.0 · build 4e58ebc
· Oct 24, 2026", and the © line follows under it. No line of its own
(amends ADR-081).

**Decision — what rides along.**

- **#225's known miss** (amends ADR-051). A budget may carry a known
  miss: its issue, an end date and a ceiling. The typo lookup's is the
  first: #225, 30 November 2026, 450 ms. Until then, a 95th percentile
  over 300 ms and under the ceiling reads "over budget, known: #225" and
  does not fail the run; past the ceiling, with errors, or after the end
  date it fails as before. The weekly run turns green and catches
  anything new; the real fix, ADR-056's index per organization, stays in
  the safety and scale fix-up, and the run turning red on 1 December is
  the reminder.
- **The pre-push hook, kept in the repository.** The hook that refuses
  a push carrying a placeholder author lived in `.git/hooks`, which git
  never commits, so a fresh clone lacked it; it was missing on Bob's Mac
  until 23 October. It moves to `scripts/hooks/pre-push`, set once per
  clone by `git config core.hooksPath scripts/hooks` (the README's
  setup). A hook can be missing or skipped, so CI also refuses a pull
  request whose commits carry the placeholder; the hook stays the early
  warning.
- **Multer 2.5.0, by override** (amends ADR-019). It pins nothing
  against a peer range: `@nestjs/platform-express` pins the vulnerable
  2.4.0 exactly, and the override takes a patched release of the same
  major, the case ADR-019's amendment of 20 October allowed for js-yaml.
  Taken at once, as a security fix, though 2.5.0 came out on 22 October;
  it goes once platform-express depends on 2.5.0 or later. Alert 4 stays
  open, as #113 left it.
- **The chores after #196:** `eslint-plugin-testing-library` for the
  test files, which would have caught #206's and #210's async mistakes;
  and tests for `scripts/i18n-review.mjs`'s export, `--since` and
  import, proved by hand until now.

**Tests.** Component tests: the signed-out header and footer, with the
holder set and unset; the name in 中文 with its setting and without; the
rail's foot on both rails and folded; Help's foot. The server's e2e
suite: each email the product sends opens with the header, and an
invitation does not. Playwright: the signed-out pages and the rail's
foot as rows of `accessibility.spec.ts`, in both modes; the manifest,
`apple-mobile-web-app-title`, `theme-color` and the Open Graph tags
served; the loading mark in the stored mode before the app starts. `perf/`: the verdict below the
ceiling, above it and after the end date. CI's author check: a commit
carrying the placeholder refused.

**Considered and not done.**

- **The mark on an organization's documents.** Above.
- **The mark in an invitation.** ADR-077's reasons hold.
- **The tab icon switching with the system,** as #201 built it. The
  system's scheme need not be the tab strip's: MC-3501 found the white
  stem nearly invisible on a light Chrome theme with the system dark.
- **The tab icon following the app's own Light or Dark.** The browser
  draws the tab strip; the app's choice changes only the page, so Dark
  in a light browser would put the white stem on a light strip. And the
  app starts on System, so for most people it would be the icon above.
- **A dark loading screen for everyone.** Someone in Light would see a
  dark flash before a light page, the same fault the other way round.
- **A drawn wordmark.** The name is set as text in the app's font: sharp
  at any size, read by a screen reader, and 品桥 needs no second image.
  Its cost is that 品桥 takes each system's Chinese font.
- **A manifest per language.** A manifest holds one name, and browsers
  read no per-language one widely.
- **`display: standalone`.** A home-screen Panivo would open without the
  browser's bar and its back button, an app with no offline mode.
- **An override for esbuild.** drizzle-kit's loader pins 0.18, and 0.25
  is seven breaking releases on in a 0.x package, under a deprecated one
  nobody tests against it: the kind ADR-019 rules out, for an alert that
  cannot be reached.
- **Raising the typo budget.** A known miss with an end date says it is
  owed; a raised budget forgets.

**Deferred — each with what brings it in.**

- **A registered business's name on the © line.** Trigger: the
  business registered. One setting.
- **Terms and a privacy policy,** linked in the signed-out footer above
  the © line. The app keeps personal details (names, emails, photos,
  sign-in addresses), and privacy laws expect a published policy before
  anyone else's are kept. Trigger: the first user outside Bob, which the
  public demo or plans and billing bring.
- **The name by language in emails.** The server signs with `MAIL_FROM`'s
  one name. Trigger: a Chinese reader, Bob's mother's review included,
  who finds Panivo out of place there.
- **A drawn wordmark.** Trigger: wanting one look everywhere, print
  included.
- **The mark in an organization's emails.** Trigger: ADR-060's for the
  colour on emails, an organization whose customers receive email from
  it.

**Consequences.**

- No migration.
- Client: the settings read beside `VITE_APP_NAME` by `vite.config.ts`'s
  app-name plugin and compiled in as the name is; the signed-out pages'
  header and footer on every signed-out page; the rail's foot; Help's
  foot; in `index.html`, the loading mark, `theme-color`,
  `apple-mobile-web-app-title` and the Open Graph tags; the manifest, the
  icons on the plate and the preview's picture in `client/public/`, made
  from `docs/brand/`'s masters; words in three languages.
- Server: one header for the product's emails, its PNG served by the
  static site.
- `perf/`: the known miss. CI: the author check. `scripts/hooks/pre-push`
  and the README's setup line. `server/package.json`'s override.
- Render: the static site's Environment takes `VITE_COPYRIGHT_HOLDER`
  (`Zhenzhong (Bob) Zhou`), `VITE_APP_NAME_ZH_HANS` (`品桥`) and
  `VITE_SITE_URL` (the site's own address), set before the merge's
  deploy, since the site reads them only when it builds (`render.md`).
- Manual checks: MC-3501 and MC-3502 grow (the plate on a light and a
  dark tab strip and a dark taskbar, the manifest, the name in 中文), and
  new checks cover the signed-out header and footer, the rail's foot,
  Help's foot, an email's header in Mailpit in a dark mail app, a link
  pasted into a chat, a phone's bar in each mode, and the loading mark in
  Dark on a slow connection.
- Designed on the canvas before building, as ADR-060's Branding was; the
  brief and the boards go in `tmp/adr-082/`.

**Amendment (October 2026) — as built (#247).** What building settled:

- **The organization moves to the rail's top** (amends ADR-060). From
  1200 px its logo, or its name, tops the rail with the fold button beside
  it, and links Home; the top bar keeps search, Help, the bell and the
  account. Folded, one plate is the expand button. It shows a roughly
  square logo (at most 1.25 : 1), else the organization's initials on its
  accent in a contained button's colours, made by script with legal
  endings left out (WIDE Naturals Inc. gives WN, 清禾药业有限公司 gives
  清禾). Its name reuses the app's pair with Collapse navigation, the
  initials first as WCAG 2.5.3 asks: "WN, Expand navigation (WIDE Naturals
  Inc.)", or "Expand navigation (…)" with a logo. Below 1200 px the top
  bar and the drawer are unchanged. A small square logo of the
  organization's own, uploaded separately, is the next pull request, the
  plate's first choice ahead of the initials.
- **The rail's foot is pinned** under the links in a window taller than
  about 500 px. The links scroll above it and fade into the rail just
  above its line while more lie below; 58 px were won back, so every link
  fits at 1440 × 900.
- **The signed-out frame** holds sign-in, register, forgot and reset
  password, the email confirmation, the signed-out Page not found, and
  the start-up pages: `OfflinePage` for "Could not reach the server", and
  the new-version and installing pages. Each has the language and
  text-size controls. The crash page and offline page this ADR named do
  not exist signed out; a render error there still shows an empty page
  (#244). Every invitation state is footer-only. The name is text at the
  type scale's title size, 25 px, not the board's 32.
- **Tabs** are worked out from the reader's language each time
  (`lib/tab-title.ts`), the sign-out countdown included; a record's tab
  keeps its section, "SO-DEMO-1 · Orders", as #201 had it.
- **Help's foot** names the product and holds the © line, with no mark:
  the plate's decision listed it among the places the mark is drawn, by
  mistake.
- **The loading mark** sits beside `#root`, not in it, above the app until
  its first screen is on view: a page, `OfflinePage` or a version page.
  `#root` is hidden from screen readers meanwhile. A thin bar appears
  550 ms after the page starts if the mark is still up, and stands still
  under reduced motion. Its script, hashed into `/assets/` and cached a
  year, reads the stored mode and sets the page's colour, `color-scheme`
  and default text colour at once, so Safari never draws the browser's
  black text on the dark page. If the app's entry fails to load, it takes
  the mark down and shows one line with Reload in the reader's language
  (`loading.failed`, `loading.reload`). Its colours, shape and waits come
  from `tokens.ts`.
- **Emails** go through `MailBrand.send`, which adds the header. The mark
  appears only once the server has seen `CLIENT_URL` +
  `/brand/mail-mark.png` answer as `image/png`, asked before the hourly
  emails start and every 10 minutes until it does, misses after the first
  logged at debug. If the mark ever changes, its file takes a new name,
  since mail apps keep the images they have fetched.
- **Render answers a missing `.png` or `.js` with a 404 and `text/plain`;**
  only a path with no extension, an `.svg` or a `.webmanifest` gets
  `index.html` and a 200. The decisions after step 7 said otherwise. The
  live check runs once the build is the commit's, takes the manifest on
  any type but `text/html`, and the other files only on their own.
- **Files:** a master of its own for the maskable icon, since Android's
  mask would cut the plate's corners; the preview's names as outlines
  from Source Sans 3 and Noto Sans SC, under the SIL Open Font License,
  made once outside the repository.
- **What rode along, as built:** multer 2.5.0 by override; the hook in
  `scripts/hooks/`, and the author check in a workflow of its own
  (`authors.yml`) on every pull request, docs-only ones included, and in
  `scripts/verify.sh`; #225's known miss; `eslint-plugin-testing-library`
  with `no-node-access` and `no-container` off. Its async rules catch a
  find, a user event or a `waitFor` left without `await`; the mistakes of
  #206 and #210, checking an effect's result too early, stay a rule people
  hold. Tests for `scripts/` on Node's own runner, and `perf/`'s spec run
  with the server's unit tests, which CI's server job now runs too, where
  before only `verify.sh` did (amends ADR-067). `MAIL_FROM` names Panivo
  in the workflows. Claude Code Review fails when it ends without a review
  (#243), and says so when a pull request changes its own workflow, which
  the action refuses to run.
- **Deferred, added:** the link card in the reader's language (it reads in
  English, since `index.html` holds one language), with the trigger of
  the name by language in emails; and a sending domain of Panivo's own.
  Mail goes from `wide-naturals.ca`, the domain Bob has today, with DKIM
  and SPF verified and DMARC at `p=none`. Trigger: the first customers.

---

## Open decisions

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
  application requires it. ADR-080 names the two places: a scope on a
  member's role, a column on its row; and conditions on using a
  permission, checked in the service with the record in hand.
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
  decision, not a patch. Wherever registration is by invitation (ADR-078),
  the route refuses before it reads the address, so the hole is closed
  there; it reopens with the setting.
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
  department feature. ADR-080 keeps it so.
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
- **Forcing a password change after admin-created sign-in** — made
  unnecessary by ADR-077. Invitations replace Add member, so no route sets
  another person's password and no account has one a second person knows.
- **What unverified access should be limited to.** Verification works and sets
  `email_verified_at`, but nothing reads it — ADR-017 chose not to block login,
  on the grounds that losing a registration to a dead SMTP connection is worse
  than letting an unverified user in. The consequence is a flag with no
  consequence, and password reset sends a link to an address nobody confirmed.
  Candidates are actions the unverified user takes themselves: inviting a
  member, which ADR-077 now refuses, and changing their own email address,
  still open (its own entry, below). Capping their *role* is not a
  candidate — an admin creating an Admin cannot control whether that
  person verifies, and either rejecting the action or silently downgrading
  it makes `memberships.role_id` disagree with the behaviour. Expiring the
  token is fine; expiring the account is not. The rule for every feature
  to come: any feature that sends email to an address a member typed (an
  invitation today; an invoice emailed to a customer later) requires the
  sender's own address to be confirmed, as ADR-077 does for invitations.
- **Changing your own email address.** Nobody can today: the address is
  fixed from registration or the invitation. When it comes, the new
  address is confirmed before it takes effect, by a link sent to it; the
  old address is told it changed; the password is asked for first; one
  account per address still holds, so an address another account has is
  refused; and the change is recorded in the account's history
  (ADR-022). Trigger: the first person who needs to change theirs, such
  as someone who joined by a copied link with a mistyped address. It gets
  its own ADR and PR, outside the onboarding chain.
- **Registration: open, or by invitation** — decided in ADR-078: a
  setting, production by invitation, and organizations from the
  operator's `npm run org:invite`.
- **A newcomer's first sign-in** — decided in ADR-079: a welcome card on
  Home, the member's own for two weeks, with what they can do here from
  their permissions, the inviter's note, and a first week ticked by what
  they do; and Help on every page, its guides kept and checked with the
  client. The permission descriptions it counted on were never translated,
  so what a person can do has its own words.
- **The operator: a console and support access.** Platform staff are not
  a role in any organization: a flag, a guard and routes of their own,
  and a second factor. Read-mostly: organizations, plan, member count,
  last active, storage, invitations, and the organization invitations
  `npm run org:invite` makes (ADR-078), which the console lists, revokes
  and sends by email; its Invite an organization asks what the command
  asks and calls the same functions. An organization's data only when one of its Owners
  grants access, for a time, with every action in its audit log as
  support; never a silent sign-in as a customer, which customers ask
  about in contracts and privacy law (PIPEDA, PIPL) cares about.
  Monitoring the app itself is a different need: an error tracker and an
  uptime check beside the logs. The error tracker is a small pull request
  of its own with a short ADR, after the emails' design (Bob, 25 October
  2026); the uptime check is set up by hand
  (`docs/runbooks/services.md`). A "Report a problem" link in Help
  belongs here too, sending the version, build, page, language and
  browser with the person's words. Trigger: more organizations than the
  command line serves, or a support request that needs the customer's
  screen.
- **A public demo.** A deployment of its own with its own database, filled
  by `seed:demo` and reset nightly, `REGISTRATION=open` there (ADR-078),
  mail captured rather than sent, and a banner saying it is a demo;
  production stays by invitation. Not ADR-058's sample data, which is a
  practice organization for one customer's staff. Trigger: the first
  prospect who wants to try before talking to anyone.
- **Plans and billing.** A plan on the organization (trial end, status,
  seats), set by billing: a provider's subscription for cards, or by hand
  for a customer paying an invoice, with the operator able to extend a
  trial. Not on the invitation, which only starts the trial; seat limits
  are counted at inviting (ADR-077). ADR-070's "closed by us" waits on
  it. Trigger: the first paying customer.
- **Low stock** — as ADR-083 (Bob, 22 October 2026), after ADR-082, the
  brand, which went first on 24 October, then the square logo (ADR-060,
  amended), the emails' design and the error tracker (Bob, 25 October
  2026), and before the whole-app `/production-readiness` review.
  Nothing warns when stock runs short; the only mention was a placeholder
  dashboard's "low stock" in the Resolved table, and ADR-058 built Home
  without it. To
  decide: a reorder point per SKU, and perhaps a reorder quantity, set on
  the product page; what it is compared with (on hand, available to
  promise as ADR-045 computes it at available locations, or that plus what
  open purchase orders bring); where it shows (a tile and card on Home
  with Raise a purchase order, a filter on the inventory list, perhaps a
  daily bell); who may set it and who is told (ADR-080's permissions);
  per location later; and the seeds (demo products below their point, the
  Home query timed on `seed:volume`).
- **Feature flags and staged rollouts.** A change that reaches some
  organizations before all: a flag per feature, turned on per
  organization by the operator, and a release that turns it on in stages,
  for a change risky enough to try with one customer first. ADR-081 keeps
  every open tab working across a deploy, but each deploy still reaches
  everyone at once. Trigger: the first paying customers.
- **A public or a private repository.** The repository is public, so
  anyone can read the code; nothing secret is in it, the secrets being in
  GitHub's settings and Render's. Private would hide the code, but on
  GitHub's Free plan a private repository loses three things this one
  leans on: Actions' minutes become a monthly allowance, where CI runs
  every browser on each push to `main`, nightly and on `full-e2e`, beside
  the weekly flake hunt and Performance; rulesets stop being enforced, so
  `main`'s required checks, "Commits — no placeholder identity" among
  them, would stop without a warning; and CodeQL's code scanning (#113)
  needs a paid security product. GitHub Pro keeps rulesets on a private
  repository and adds minutes. To decide: stay public, or go private on a
  paid plan sized from a month of Actions' usage. Trigger: before going
  commercial (Bob, 25 October 2026).
- **Job roles** — decided in ADR-080: roles an organization makes, from a
  template or a copy, several to a member and added together; the built-in
  three fixed; a role given only by someone whose roles hold all it grants,
  and made, changed and deleted by Owners alone.
- **Audit filtering in the UI.** `ListAuditDto` accepts action, actorId, from,
  and to; the client sends none of them. Two years of retention (ADR-012)
  makes "load more" a poor way to reach an old entry, but a filter UI designed
  against four rows is guesswork. Build it when there is enough log to know
  which filters people actually reach for.
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
- **Production order numbering** — decided in ADR-074, deferred until its
  trigger. `id` is a UUIDv7 and nobody says one aloud.
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
- **Generated lot codes for production runs** — decided in ADR-074, deferred
  until its trigger. ADR-023 argues against generating
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
  A cover for a period would be a member's role with an end date
  (ADR-080). Trigger: the first approval that waits on someone on holiday.

---

## Resolved

| Decision                               | Outcome                                               | ADR              |
|----------------------------------------|-------------------------------------------------------|------------------|
| ORM: Prisma vs. Drizzle vs. Knex       | Drizzle                                               | ADR-009          |
| Primary key strategy                   | UUIDv7 on `uuid` column                               | ADR-010          |
| PostgreSQL version                     | 18 (for native `uuidv7()`)                            | ADR-002, ADR-010 |
| Session strategy                       | Opaque token in httpOnly cookie, no JWT               | ADR-011          |
| Account deletion vs. audit retention   | Anonymize user, retain audit rows                     | ADR-012          |
| Data ownership on user departure       | Org owns data, user attributed                        | ADR-012          |
| Deleting an account                    | The person only; 30 days; sole member blocked         | ADR-069          |
| Leaving an organization                | The person themself; last Owner and only member block | ADR-069          |
| Deleting an organization               | Any Owner, after an export or a decline; 30 days      | ADR-070          |
| Joining an organization                | By invitation, emailed or a copied link; 7 days       | ADR-077          |
| Passwords set by someone else          | None; no route sets another person's password         | ADR-077          |
| Creating an organization               | A setting: open, or by the operator's invitation      | ADR-078          |
| Starting one from an existing account  | By an invitation; from Home when open                 | ADR-078          |
| API versioning                         | URL prefix `/v1/`, global, from first endpoint        | ADR-013          |
| A tab older than the API               | Its revision refused; a banner, then a reload         | ADR-081          |
| CSRF defence                           | Custom header, no token                               | ADR-014          |
| Concurrent sessions per user           | Multiple; login revokes only the presented session    | ADR-015          |
| Permission resolution                  | Per request, never cached                             | ADR-016          |
| Audit write path                       | Interceptor, opt in per route, writes only            | ADR-018          |
| Audit pagination                       | Keyset on UUIDv7 cursor                               | ADR-018          |
| Dependency upgrades vs. peer conflicts | Never override; a blocked upgrade waits               | ADR-019          |
| Server test runner                     | Vitest, as the client; Nest 12 after it               | ADR-067          |
| Client types                           | Generated from the server's OpenAPI document          | ADR-068          |
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
| The product's brand                    | Panivo signed out, in emails, at the rail's foot      | ADR-082          |
