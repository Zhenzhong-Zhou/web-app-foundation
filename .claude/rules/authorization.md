---
paths:
  - "server/src/core/authorization/**"
  - "server/src/database/schema/{roles,permissions,role-permissions,membership-roles,invitation-roles}.ts"
  - "client/src/roles/**"
  - "client/src/auth/permissions.ts"
  - "client/src/account/access-phrases.ts"
  - "server/test/{roles,permission-coverage}.e2e-spec.ts"
  - "client/e2e/roles.spec.ts"
---

# Authorization: the code rules, for Claude

It loads when Claude reads, writes or edits a file its `paths` match.

What to keep true when changing roles and permissions.

- **Every route has `@RequirePermissions`,** is public, or is listed with
  its reason in `server/test/permission-coverage.e2e-spec.ts`:
  `SELF_SERVICE` for one acting only on the caller's own account,
  `GATED_INSIDE` for one gating each part it returns by that part's own
  permission. The guard refuses only what a route declares ([engineering.md, Server](../../docs/engineering.md#server)).
- **A new permission is Owner-only:** in `PERMISSIONS` and
  `PERMISSION_DESCRIPTIONS`, never in the Admin or Viewer lists, and in
  the client's `GRANTS` (`client/src/account/access-phrases.ts`) in the
  same commit; then `npm run api` (the same section;
  [conventions.md, The API contract](../../docs/conventions.md#the-api-contract)).
- **Never seed a permission nothing gates;** one left gating nothing is
  dropped by a migration (ADR-016, amended by ADR-079).
- **Permissions name capabilities, not roles,** `resource.action`
  ([conventions.md, Identifiers](../../docs/conventions.md#identifiers)).
- **Resolved on every request,** never cached on the session, the request
  or in memory (ADR-016).
- **One place decides.** What a member may do, and who may do something,
  is asked of `PermissionsService`; the role tables are refused outside
  `core/authorization` by lint, each exception listed with its reason in
  `server/eslint.config.mjs` (ADR-080).
- **No access by a role's name,** except whether a member is an Owner
  (`owner.ts`); the client asks `useCan` (ADR-080).
- **You give only what you hold:** giving a role, or changing or removing
  a member, checks the actor's roles hold all it grants; the last Owner
  is counted under a lock (ADR-080).
