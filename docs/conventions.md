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
- **Services must never import `db` directly** (ADR-009). All queries go through the
  tenant-scoped helper that applies `organization_id`. Direct `db` access in a service
  is a review-blocking defect, not a shortcut.

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