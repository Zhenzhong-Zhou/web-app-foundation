/**
 * Injection tokens live apart from the module to break a circular import:
 * database.module imports TenantDb, and TenantDb needs UNSAFE_GLOBAL_DB.
 * At runtime one file evaluates first and the other sees undefined.
 */
export const PG_POOL = Symbol('PG_POOL');

/**
 * Unscoped database handle. Named to be uncomfortable.
 *
 * ADR-003 makes the organization_id filter the single highest-risk area of the
 * codebase, so services inject `TenantDb` instead — it cannot produce an
 * unscoped query. This handle exists for the narrow set of operations that are
 * legitimately global: finding a user by email at login, before any
 * organization is known, and the ADR-012 retention pass.
 *
 * An ESLint rule forbids importing this outside core/auth. Bypassing tenancy
 * should be a deliberate, greppable, lint-failing act.
 */
export const UNSAFE_GLOBAL_DB = Symbol('UNSAFE_GLOBAL_DB');
