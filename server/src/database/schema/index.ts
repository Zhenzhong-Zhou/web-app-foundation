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
export * from './credit-note-lines';
export * from './credit-note-taxes';
export * from './credit-notes';
export * from './document-sequences';
export * from './invoice-lines';
export * from './invoice-taxes';
export * from './invoices';
export * from './locations';
export * from './lots';
export * from './memberships';
export * from './notifications';
export * from './order-lines';
export * from './order-returns';
export * from './orders';
export * from './organizations';
export * from './partners';
export * from './permissions';
export * from './product-licences';
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
export * from './tax-code-components';
export * from './tax-codes';
export * from './users';
