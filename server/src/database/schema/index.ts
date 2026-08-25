/**
 * Every table must be re-exported here.
 *
 * DatabaseModule does `import * as schema from './schema'` and drizzle-kit
 * globs this folder — a table missing from this file silently does not exist:
 * no migration is generated and no query type-checks against it.
 */
export * from './memberships';
export * from './organizations';
export * from './roles';
export * from './users';
