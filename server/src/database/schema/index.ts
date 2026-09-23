/**
 * Every table must be re-exported here.
 *
 * DatabaseModule does `import * as schema from './schema'` and drizzle-kit
 * globs this folder — a table missing from this file silently does not exist:
 * no migration is generated and no query type-checks against it.
 */
export * from './account-events';
export * from './addresses';
export * from './audit-log';
export * from './auth-tokens';
export * from './bom-lines';
export * from './boms';
export * from './contacts';
export * from './locations';
export * from './lots';
export * from './memberships';
export * from './notifications';
export * from './order-lines';
export * from './orders';
export * from './organizations';
export * from './partners';
export * from './permissions';
export * from './product-licences';
export * from './product-variants';
export * from './product-variants';
export * from './production-order-lines';
export * from './production-orders';
export * from './products';
export * from './role-permissions';
export * from './roles';
export * from './sessions';
export * from './shipments';
export * from './stock-levels';
export * from './stock-movements';
export * from './users';
