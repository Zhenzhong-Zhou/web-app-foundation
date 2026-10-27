---
status: accepted
date: 2026-08-24
amended-by: [ADR-077, ADR-078]
---

# ADR-006 — Self-serve registration is the only onboarding path in V1

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

**Amendment (October 2026) — registration by invitation ([ADR-078](0078-registration.md)).**
Self-serve registration is now a setting, `REGISTRATION`. Production is by
invitation: a new organization comes from an organization invitation the
operator issues, and its first Owner is whoever accepts it.
