---
status: accepted
date: 2026-08-24
areas: [auth]
amended-by: [ADR-015]
---

# ADR-011 — Opaque session cookies, not JWT

> **Amended by [ADR-015](0015-multiple-concurrent-sessions-per-user.md).**
> One binding rule — delete any prior session on login — is superseded. Everything else stands.
>
> **Amended (October 2026, #316).**
> Every rate limit counts per person when signed in, and per client address when not, the address read from `CLIENT_IP_HEADER` where a proxy in front sets one: `trust proxy` alone gave everyone on Render the same address. Sign-in keys on the email and that address.

## Context

The choice was between a stateless JWT and a server-side session referenced
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

## Decision

Opaque session tokens, stored server-side, delivered in an httpOnly cookie.

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

## Consequence — binding rules

Each of these is a security control, not a preference:

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

## Consequence — operational traps

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

## Consequence — deferred, and how

Mobile or third-party clients need a non-cookie
transport. This is additive: keep the auth guard's job as "resolve a request to
`(user, current_org)`" and read the credential at the edge, so a bearer transport is a new
strategy rather than a rewrite. Often the same opaque token can simply be returned in a
JSON body and sent as `Authorization: Bearer` — same table, same revocation, no JWT. If a
signed token is genuinely required, it carries `user_id` and `org_id` only; roles and
permissions are resolved per request (ADR-004).

## Related, landing in step 3

`sameSite: 'lax'` blocks most but not all CSRF —
state-changing endpoints additionally require a custom header or double-submit token.
Login rate limiting keys on **email + IP together**: IP alone both fails against rotating
attackers and locks out everyone behind a corporate NAT. Note that `@nestjs/throttler`
counts in memory, so limits break silently across multiple instances — the first real
trigger for introducing Redis, alongside BullMQ (ADR-005).

## Amendment (October 2026) — one rate limit per person, and the client's own address (#316)

Every limit keys on `req.ip`, and on Render that is a proxy's address,
not the person's. `trust proxy` 1, above, makes `req.ip` the last hop
before the server, which is one of Render's own proxies. H2, a read-only
probe in #260's `/production-readiness` review (29 October 2026), found
three counters for the whole site, and one for the static site's
`/api/*` rewrite, the app's only path. So the limits are global:
sign-up, 5 a minute for everyone; resending the confirmation email, 3
in 5 minutes for everyone; and a stranger's failed sign-ins lock that
email's owner out everywhere, since sign-in keys on the email and the
shared address. Production has run with `RATE_LIMIT_MAX` at 600 as a
stopgap since #317. This amendment keys every limit on the person, or,
signed out, on the client's own address (Bob, 29 October 2026, as
recommended).

Checked before drafting, as the working agreements ask:

- **Fired: none.** Auth's Deferred lines (a bearer transport, above;
  ADR-065's lock screen; ADR-077's and ADR-078's), ops' (ADR-005's
  queue, ADR-059's limits by plan) and ADR-051's Watch. Open
  decisions' "A security review before real customers" stays open:
  this is one part of it.
- **Kept in step.** Counters shared across instances wait for Redis, at
  a second server instance (above, ADR-005): the counters stay in
  memory, unchanged. #255, the security emails' time: the new-sign-in
  email's address line changes its value here, not its wording.
- **Found while checking:**
  - The session is known before any guard runs.
    `SessionContextMiddleware` resolves the cookie on every route, so
    the throttler already sees who is signed in. #316's second
    throttler, after `SessionGuard`, is not needed.
  - A counter is per route. `@nestjs/throttler` keys on the controller,
    the handler, the throttler's name and the tracker, so
    `RATE_LIMIT_MAX` is per route, per key, per minute.
  - The library groups an IPv6 address by its /64 before counting; a
    tracker of our own must too, or each address of a /64 gets an
    allowance of its own.
  - Besides the limiter, eight places read `req.ip`. Sessions, account
    events, the new-sign-in email, the "From {ip}" notification, the
    audit log, registration, Start an organization and accepting an
    invitation all record or show the proxy's address.
  - `RATE_LIMIT_AUTH_MAX` is declared, documented and set in CI, the
    browser suites and perf, and read by no code.
  - No test checks what a counter is keyed on. The server's e2e specs
    swap in `unlimitedThrottler`, the browser suite runs the limiter at
    limits no test reaches, and `smoke-auth.sh`, which ADR-019 names as
    the one test of the real limiter, is gone.
  - Every picture is a request of its own to one route,
    `GET /v1/files/:id`: a product's cover, a person's photo, a logo.
    The browser keeps one for a year once it has it, but the first
    scroll through a long Products or Inventory list asks for each new
    one, so a limit of 100 for that route would leave the rest broken.

### Decision — signed in, the person; signed out, the client's address

- **One tracker for the global throttler:** `user:<id>`, the user the
  session middleware resolved; with none, the client's address. Never
  the session cookie itself, which a flood could vary to get a fresh
  allowance each time.
- **Every route's own limit takes it too,** unless the route has a
  tracker of its own: changing a password, asking to delete an account
  or an organization (each needing the password), starting an
  organization, signing up, confirming an email, resending the
  confirmation, resetting a password, and reading or accepting an
  invitation.
- **Sign-in and the forgotten-password email keep the email and the
  address,** the address now the client's own.
- **The guards keep their order:** throttle, then authenticate. The
  session's reads have run in the middleware by then, as they do today.
- A person's allowance is per route, shared by their tabs and devices.

### Decision — the client's address, from a header only where a proxy sets it

- **`CLIENT_IP_HEADER`, a header's name,** declared in `env.ts` and read
  per request, as `REGISTRATION` is, so a spec can change it. Empty or
  unset: `req.ip`, today's behaviour. Set: that header's value when it
  holds one valid IP address, else `req.ip`.
- **On Render, `cf-connecting-ip`:** the header Cloudflare, in front of
  every Render service, sets to the address that reached it. A request
  that brings its own is refused (as built, below). Set by hand after
  the deploy, then checked by the probes below.
- **Never an `X-Forwarded-For` entry,** which a direct caller writes
  itself.
- A header nothing in front sets is one any caller can set. So the
  setting stays empty locally, in CI, and on any host with nothing in
  front; and moving off Render changes a setting, not the code.
- **IPv6 grouped by its /64 for counting,** with the library's own
  `normalizeIp`; recorded in full.
- `trust proxy` stays 1: Express still needs it to set `secure` cookies.

### Decision — one address, everywhere it is recorded

One function, `clientAddress(req)`, feeds the limiter and the eight
places above, so the new-sign-in email, Your devices and the audit log
show the person's address. Rows already written keep the proxy's;
nothing is rewritten.

### Decision — the allowance

- **`RATE_LIMIT_MAX` stays at its default, 100 per route, per key, per
  minute.** A list or a picker asks 300 ms after typing stops and the
  bell once a minute, so only a runaway page reaches it. Render's 600
  goes once the probes pass.
- **Pictures have their own allowance, 1,000 per person per minute,**
  on `GET /v1/files/:id`, as `limit(1000)` in its `@Throttle`, keyed as
  every other route is. A picture never changes, and the browser asks
  for it once.
- **`RATE_LIMIT_AUTH_MAX` goes,** from `env.ts`, `.env.example`, CI, the
  browser suites and perf. Each auth route's limit is in its code,
  multiplied by `THROTTLE_FACTOR` in tests.

### Decision — proved by tests, then by probes after the deploy

- **An e2e spec with the real limiter,** its own app with the real
  storage and the setting on a test header:
  - two users behind one address keep separate allowances;
  - one user from two addresses shares one;
  - two signed-out addresses keep separate allowances;
  - with the setting empty, the header is ignored;
  - two IPv6 addresses in one /64 share a counter, and one in another
    /64 does not;
  - a stranger's failed sign-ins from another address leave the owner's
    own sign-in open;
  - one person can ask for more than 100 pictures in a minute, up to
    the pictures' own allowance;
  - a sign-in records the header's address.
- **Unit tests for `clientAddress`:** unset, an IPv4 address, an IPv6
  address, a value that is not an address, and a list.
- **After the deploy, by hand:** H2's probe again, through the rewrite
  over IPv4 and over IPv6, each answering with its own
  `X-RateLimit-Remaining`; and a request that sends its own
  `CF-Connecting-IP`, which Cloudflare refuses (manual checks, MC-4001
  to MC-4003).

### Considered and not done

- **A second throttler after `SessionGuard`,** as #316 planned: the
  middleware already knows the person, so it would count every request
  twice, the first count still on the proxy's address.
- **`CF-Connecting-IP` named in the code:** right on Render, and a
  chosen address for anyone, anywhere else.
- **`X-Forwarded-For`'s first entry, or a higher `trust proxy` count:**
  a caller writes the first entry, and the number of proxies differs
  between the rewrite and the API's own address, and with every host.
- **One allowance per organization:** one busy colleague would use up
  everyone's.
- **A higher `RATE_LIMIT_MAX` for good:** what #317 shipped with, as a
  stopgap.
- **A lower `RATE_LIMIT_MAX`, such as 50:** enough for people, but no
  real protection gained, and less room for two tabs or a retry.
- **No limit on pictures:** a stolen session could then stream every
  file as fast as the server sends them.

### Deferred — each with what brings it in

- **Counters shared across instances** (Redis, as above). Trigger: a
  second server instance.
- **A 429 on a signed-in screen that says how long to wait,** as the
  sign-in pages do from `Retry-After`; today it shows the general error.
  Trigger: the first 429 a signed-in person meets.
- **A limit per email across every address,** such as 50 failed
  sign-ins an hour, then a pause for that email. It stops a guesser
  with many addresses, who gets 10 tries from each today, but lets
  anyone who knows an email lock its owner out for the hour, the
  failure this ADR's email-and-address key avoids. Passwords are 12
  characters at least, and two-factor sign-in for Owners and refusing
  leaked passwords (Open decisions) answer the same guessing better.
  Trigger: failed sign-ins for one email from many addresses in the
  logs, or the first paying customer.
- **A limit per address across every email,** on sign-in: one address
  gets 10 tries on each email in 15 minutes, on as many emails as it
  knows, since sign-in's own key replaces the per-address one. Before
  #316 the address was everyone's, so this could not be set; now it
  can, at a number an office behind one address never reaches. Trigger:
  failed sign-ins from one address across many emails in the logs, or
  the first paying customer, with the per-email limit above.
- **Allowances by plan.** Trigger: plans and billing (Open decisions).

### Consequences

- No migration, and no API change: only who a counter belongs to.
- Server: `common/client-address.ts`; a tracker in `ThrottlerModule`'s
  options; `loginTracker` on the client's address; the pictures' own
  allowance; the eight reads of `req.ip`; `CLIENT_IP_HEADER` in
  `env.ts` and `.env.example`, and `RATE_LIMIT_AUTH_MAX` gone. Tests as
  above.
- Docs: `render.md` (the setting, the probes, the 600 removed);
  `conventions.md`'s line on limits; manual checks for the probes;
  ADR-019's line on the one test that runs the real limiter; the
  handoff; this amendment's as-built.
- Seeds: nothing to add; no table and no screen changes.
- Riders: `/triage`, a project skill, from #260's skill candidates;
  `RATE_LIMIT_AUTH_MAX`'s removal.
- Build order: dependencies; the limiter with its tests; the recorded
  addresses; the riders; dependencies again; the reviews; the docs last.
  Built by Claude Code, a prompt per commit
  ([engineering.md, *How code is delivered*](../engineering.md#how-code-is-delivered)).

### As built (#325, 29 October 2026)

Built step by step from a brief; where it differs from the decisions
above, this holds.

- **The header, checked before the merge.** Render's request log keeps
  each request's headers, all but cookies and authorization. On 29
  October 2026 a request through the rewrite carried the visitor's own
  address in `cf-connecting-ip`, the same as Cloudflare's
  `/cdn-cgi/trace` showed. So the rewrite, the app's only path, passes
  it on.
- **A caller's own `CF-Connecting-IP` is refused, not replaced.**
  Cloudflare answers 403 with `error code: 1000` on both paths, the
  rewrite and the API's own address, so the address cannot be chosen
  from outside. MC-4002 checks that.
- **Where it lives.** `server/src/common/client-address.ts`, and the
  tracker in `server/src/core/auth/throttle-tracker.ts`, given as
  `getTracker` in `ThrottlerModule`'s options. `CLIENT_IP_HEADER`
  accepts letters, digits and hyphens only, and is lowercased. The audit
  row and Start an organization read the address from the request's
  context, which the session middleware fills from `clientAddress`.
  ESLint's `no-restricted-properties` refuses `req.ip` and `request.ip`
  everywhere but `client-address.ts`, so a new read cannot record a
  proxy's address again.
- **The spec.** `server/test/rate-limits.e2e-spec.ts`, nine cases: those
  above, and sign-up's 5 a minute, which no test had reached. It is the
  only spec with the real limiter. It sets `RATE_LIMIT_MAX` to 100 and
  `THROTTLE_FACTOR` to 1 with `vi.hoisted`, since both are read when
  the app module is imported, and CI's factor of 100 would let a sixth
  sign-up through. Each sign-up uses its own agent: a plain request
  fails the CSRF check, and a reused agent is counted as a signed-in
  person. On the old code, run together, every case fails; run alone,
  seven fail and two pass, one person on two addresses and the header
  ignored while the setting is empty. Those two guard against a wrong
  fix. `security.e2e-spec.ts` never tested the limiter; the comments
  that said so now name this spec.
- **Riders.** `/triage` (#322). `CLAUDE.md`'s dependency rule now says
  "at least 7 days old". The demo's own session has a browser and an
  address, so Your devices no longer calls it an unknown device.
  `RATE_LIMIT_AUTH_MAX` left 7 files; a host that still sets it starts
  as before, since the settings check drops names it does not declare.
- **Dependencies.** None taken: every in-range update was under 7 days
  old on 29 October, and none was a security fix. TypeScript 7.0.2 is
  still held by `typescript-eslint`, `@nestjs/cli` and
  `@nestjs/swagger` (ADR-019).
- **The reviews** found 23. Eleven fixed, each its own commit; two
  filed, #323 (a full IPv6 address on a phone) and #324 (one sign-in
  worded three ways); 18 deferred, above; 7, what to do if a probe
  fails, in `render.md`; the rest left, each with its reason in the pull
  request. A place beside the address, asked for
  during the review, is #326.
- **Slips.** The review sent one `OPTIONS` request and the
  `CF-Connecting-IP` probe to the live site, where
  `/production-readiness` allows only `GET` and `HEAD`; both changed
  nothing. The sign-up case was pushed after `--quick` alone, as the
  chat's prompt said, where `CLAUDE.md` asks for the full verify before
  a push; CI ran the rest.
