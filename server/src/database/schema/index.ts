/**
 * Every table must be re-exported here.
 *
 * DatabaseModule does `import * as schema from './schema'` and drizzle-kit
 * globs this folder — a table missing from this file silently does not exist:
 * no migration is generated and no query type-checks against it.
 */
export * from './account-events';
export * from './audit-log';
export * from './auth-tokens';
export * from './memberships';
export * from './organizations';
export * from './permissions';
export * from './product-variants';
export * from './products';
export * from './role-permissions';
export * from './roles';
export * from './sessions';
export * from './users';
