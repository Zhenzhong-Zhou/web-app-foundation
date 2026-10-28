---
status: accepted
date: 2026-10-13
areas: [ops]
amends: [ADR-019]
amended-by: [ADR-082]
---

# ADR-067 — The server's tests on Vitest, then Nest 12 (amends ADR-019)

> **Amended by [ADR-082](0082-the-products-brand.md).**
> Vitest stays the one runner for the client and the server. The repository's own scripts test with Node's runner (`scripts/*.test.mjs`), and `perf/`'s spec runs with the server's unit tests, which CI's server job now runs.

## Context

`npm outdated` lists three majors on the server, each held
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

## Decision — the server's tests run on Vitest, as the client's do

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

## Decision — then Nest 12 and intl-messageformat 12, together

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

## Decision — TypeScript 7 waits for what holds it

Overriding a peer
range is what ADR-019 rules out, and the Nest CLI cannot build with it
yet. Its triggers are under *Deferred*.

## Consequences

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

## Considered and not done

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

## Deferred — each with what brings it in

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
