/**
 * Drizzle table definitions — the single source of truth for both migrations
 * and query types (ADR-009).
 *
 * Empty until step 2, which adds: organizations, users, memberships, roles,
 * permissions, role_permissions, sessions, audit_log.
 *
 * Every tenant-scoped table defined here MUST carry organization_id with a
 * foreign key and an index, created with the table and never added later
 * (ADR-003).
 */

export {};