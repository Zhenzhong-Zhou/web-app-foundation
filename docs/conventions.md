# Conventions

Only things ESLint and Prettier **cannot** enforce. Formatting, quote style, semicolons,
and import order are the linter's job — run `npm run lint`, don't argue about them here.

If a rule in this file could be a lint rule instead, it should be. Documentation rots;
tooling doesn't.

---

## File names

kebab-case, with a dot-separated type suffix:

```
users.controller.ts        UsersController
users.service.ts           UsersService
users.module.ts            UsersModule
create-user.dto.ts         CreateUserDto
session.guard.ts           SessionGuard
http-exception.filter.ts   HttpExceptionFilter
current-user.decorator.ts  CurrentUser
users.service.spec.ts      unit test, beside the source
health.e2e-spec.ts         integration test, in test/
```

One exported class per file, named to match the file. A file whose name doesn't
predict its export is a file nobody can find.

---

## Identifiers

| Thing | Style | Example |
|---|---|---|
| Classes, DTOs, interfaces | PascalCase | `UsersService`, `CreateUserDto` |
| Methods, variables | camelCase | `findByEmail` |
| Module-level constants | UPPER_SNAKE | `SESSION_COOKIE_NAME` |
| Database columns | snake_case | `organization_id` |
| Drizzle schema fields | camelCase | `organizationId: uuid('organization_id')` |
| Permission strings | `resource.action` | `users.create`, `reports.view` |

The snake_case/camelCase split is deliberate: SQL stays idiomatic SQL, TypeScript stays
idiomatic TypeScript, and Drizzle's column definition is the one place they meet.

---

## Functions

**Class methods are regular methods, never arrow properties.**

```ts
// correct
@Get()
check() { ... }

// broken — @Get() is a method decorator; an arrow property is an
// instance field, so the route is never registered
@Get()
check = () => { ... };
```

This is not a style preference. Nest's decorators and DI read prototype metadata, and
an arrow class property doesn't live on the prototype.

- **Standalone module functions** — `export function name()`. Hoisted, and named in
  stack traces.
- **Callbacks, `.map()`, inline** — arrow.

---

## Module boundaries

- One folder per module under `core/`, each with its own `*.module.ts`.
- **`common/` must never import from `core/`.** The dependency runs one way. Reversing
  it is how a "shared" folder becomes a second copy of the application.
- **Services must never import `db` directly** (ADR-009). All queries go through
  `TenantDb`, which applies `organization_id`. `UNSAFE_GLOBAL_DB` is restricted to
  `core/auth/` by lint rule — direct use elsewhere is a review-blocking defect.

### What a complete module looks like

```
core/auth/
├── dto/
│   ├── login.dto.ts          request shapes, validated by class-validator
│   └── register.dto.ts
├── auth.controller.ts        HTTP only — parse, delegate, respond
├── auth.module.ts            wiring; `exports` declares what leaves the module
├── auth.service.ts           the actual work
├── session.service.ts        a second service is fine when the concern differs
├── session-cookie.ts         plain constants/functions take no dot suffix
└── password.service.spec.ts  unit test, beside its source
```

DTOs live in `dto/` **inside** the module that uses them, never in a global folder.
A DTO is part of one module's contract; a shared `dto/` directory becomes a place
where unrelated modules quietly start depending on each other's shapes.

**Controllers parse and respond; services decide.** A controller containing an `if`
about business rules is a service method that hasn't been written yet — and it is
untestable without booting HTTP.

Files that export plain functions or constants (`slug.ts`, `permissions.ts`,
`session-cookie.ts`) take no dot suffix. The suffix marks a Nest type, so a file
named `*.service.ts` should be an `@Injectable()` class and nothing else.

---

## Duplication

Two near-identical shapes are fine; three is a signal. Extracting at two usually
costs more than it saves — the abstraction has to guess which parts are shared,
and one of the two then needs an escape hatch.

Pairs currently being watched rather than extracted:

- `AuthenticatedUser` and `CurrentSession.user` share four fields and differ in
  the fifth. Extract the shared fields at the third response shape.
- `register.dto.ts` and `create-user.dto.ts` repeat the same email, name, and
  password rules, and have already drifted once. Extract to validation constants
  — not a shared DTO, which the rule above forbids — at the fourth DTO, or the
  first time a rule changes in one and not the other.

Test helpers follow the same rule with one addition: extract *knowledge* (a
library's interface shape, a stub that must match a real service) and leave
*structure* alone. `unlimitedThrottler` and `RecordingMailService` are in
`test/utils/` because they mirror interfaces that drift; the `beforeAll` /
`afterAll` / `beforeEach` block is repeated in every suite deliberately, because
hiding it makes the `app.close()` rule above unenforceable by reading.

---

## Comments

Comment the **why**, never the what. Code already says what it does; it cannot say
what you rejected, or what breaks if someone changes it back.

```ts
// useless — restates the line below it
// set the updated_at column
updatedAt: timestamp('updated_at')

// useful — records a decision, and the failure it prevents
// RESTRICT, not CASCADE: deleting a role must not silently strip access
// from everyone holding it.
roleId: uuid('role_id').references(() => roles.id, { onDelete: 'restrict' })
```

- **File header** — only when the file's purpose isn't predictable from its name.
  `users.ts` exporting a `users` table needs none; the fact that it deliberately has
  no `organization_id` does.
- **Function docstring** — only for non-obvious contracts, side effects, or "why does
  this exist at all". `findByEmail(email)` needs nothing.
- **Reference the ADR** when a line exists because of a decision: `(ADR-011)` is
  shorter than re-arguing it and points at the full reasoning.
- **No section separator banners.** A file that needs `// ===== HELPERS =====` is a
  file that needs splitting.

A comment that repeats the code is worse than no comment: it doubles the edit cost
and silently goes stale.

---

## Tests

- Unit tests sit beside their source: `users.service.spec.ts`.
- Integration tests live in `test/` and end in `.e2e-spec.ts`.
- Every integration test calls `await app.close()` in `afterAll`, or the `pg` pool stays
  open and Jest hangs without explaining why.
- One integration test per feature as it's built (ADR-008).
- `scripts/smoke-auth.sh` checks a **running dev server** over HTTP. No database
  access, no setup — if it needs `psql`, it is an e2e test wearing a shell script.
- e2e tests own the database: they reset between tests and assert on rows,
  including the negative cases smoke cannot reach.

---

## Loading states

Block only on what cannot be rendered around.

- **Whole-app** — the boot check alone. Until `/v1/auth/me` answers, the app
  does not know whether to draw itself or the login page (ADR-020).
- **Inline** — form submits. The page is already correct; only the button
  changes. Never replace a form with a spinner: the user loses sight of what
  they typed, and a failure leaves them re-orienting.
- **Progressive** — data inside a rendered page. Shell, nav, and headings draw
  immediately; the table area holds its space and fills in. A full-page spinner
  here discards structure already known to be correct, and flashes on every
  navigation.

Indicators are delayed ~250ms (`useDelayedFlag`). A response in 80ms should
never flash one — the flash reads as jank, no indicator reads as instant. The
delay is not optional in the other direction either: a spun-down free instance
takes about a minute to wake, and a blank page for that long reads as broken.
