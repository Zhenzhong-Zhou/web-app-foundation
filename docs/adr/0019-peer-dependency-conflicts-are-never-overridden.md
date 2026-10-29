---
status: accepted
date: 2026-08-31
areas: [ops]
amended-by: [ADR-067, ADR-082]
---

# ADR-019 — Peer dependency conflicts are never overridden

> **Amended by [ADR-082](0082-the-products-brand.md).**
> An override that takes a patched release of the same major, under a package that pins the vulnerable release exactly, is allowed as js-yaml's was: multer 2.5.0 under `@nestjs/platform-express` 12.2.0. It hides no peer conflict, and goes once the package depends on the fix.

## Context

`npm outdated` is never empty, and npm offers two flags —
`--force` and `--legacy-peer-deps` — that make a blocked install succeed. Both
resolve the conflict by ignoring it: the package is installed against a version
its maintainer has declared untested. `npm audit fix --force` does the same
thing without being asked.

The upgrade to Nest 12 is blocked by `@nestjs/throttler`, whose peer range ends
at `^11.0.0`. The temptation is obvious — everything compiles, and the test
suite passes either way.

## Decision

Peer ranges are respected. A blocked upgrade waits, and what
blocks it is recorded in the commit body rather than in someone's memory.

## Consequence

The failure this prevents is silent. `@nestjs/throttler` backs
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

## Currently blocked, and by what

| Upgrade             | Blocked by                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Unblocks when                                                                                                                                                     |
|---------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `@nestjs/*` 11 → 12 | `@nestjs/throttler@6.5.0` peers at `^11.0.0`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Cleared by ADR-067: throttler 6.7.1 accepts `^12.0.0`, and the server runs Nest 12                                                                                |
| `typescript` 6 → 7  | As of 26 October 2026: `typescript-eslint@8.72.0` peers at `<6.1.0` ([typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940)); `@nestjs/cli@12.0.10` depends on `~6.0.2` ([nest-cli#3479](https://github.com/nestjs/nest-cli/issues/3479)); `@nestjs/swagger@12.0.4` peers at `^5.5.0 \|\| ^6.0.0` ([swagger#4002](https://github.com/nestjs/swagger/pull/4002)), and its plugin is a transformer inside `nest build`; the Go port's support for `emitDecoratorMetadata`, which Nest requires | Realistically TypeScript 7.1 stable, whose API those tools need, plus new releases of all three — then verify the decorator support explicitly, not by assumption |

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

*Amended (October 2026, #270):* an override across breaking versions
is allowed where the vulnerable code never runs and every command
that uses the package is shown working with it. `drizzle-kit`
0.31.x reaches esbuild `~0.18.20` through `@esbuild-kit/esm-loader`
and `@esbuild-kit/core-utils`, both deprecated (Dependabot alert 4:
esbuild's development server, fixed in 0.25.0, which nothing here
starts). The override takes that one copy to 0.28.2, the version
already in the tree. It goes once `drizzle-kit`'s own dependencies
resolve to esbuild 0.28.1 or later without it, tried at each
`drizzle-kit` update.

*Amended (October 2026, #316):* `smoke-auth.sh` is gone, and the
Consequence's one test of the real limiter is now
`server/test/rate-limits.e2e-spec.ts`. It runs the limiter at the
production default and checks what each counter is keyed on: the
person, the client's own address, sign-in's email and address, and
sign-up's 5 a minute (ADR-011, amended).
