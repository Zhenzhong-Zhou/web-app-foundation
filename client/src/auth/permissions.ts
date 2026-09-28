import { useAuth } from './use-auth';

/**
 * The permissions the client checks, mirroring the server's vocabulary
 * (server/src/core/authorization/permissions.ts, ADR-004).
 *
 * A union rather than constants: the strings stay the ones the server,
 * the audit log and the role editor use, and a typo is a compile error.
 * Only whether to show a control depends on this — the server's guard is
 * the actual check (ADR-016) — so a permission missing here hides a
 * button, never opens a door.
 */
export const PERMISSIONS = [
  'users.view',
  'users.create',
  'users.update',
  'users.delete',
  'roles.view',
  'roles.assign',
  'organizations.view',
  'organizations.update',
  'audit.view',
  'products.view',
  'products.create',
  'products.update',
  'product_licences.view',
  'product_licences.create',
  'product_licences.update',
  'tax_codes.view',
  'tax_codes.create',
  'tax_codes.update',
  'locations.view',
  'locations.create',
  'locations.update',
  'stock.view',
  'stock.move',
  'stock.adjust',
  'partners.view',
  'partners.create',
  'partners.update',
  'orders.view',
  'orders.create',
  'orders.update',
  'orders.receive',
  'orders.ship',
  'invoices.view',
  'invoices.create',
  'invoices.update',
  'invoices.delete',
  'invoices.issue',
  'return_authorizations.view',
  'return_authorizations.create',
  'return_authorizations.update',
  'boms.view',
  'boms.create',
  'boms.update',
  'production.view',
  'production.create',
  'production.release',
  'production.complete',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Whether the signed-in member holds a permission. */
export function useCan(): (permission: Permission) => boolean {
  const { session } = useAuth();
  return (permission) => !!session?.permissions.includes(permission);
}
