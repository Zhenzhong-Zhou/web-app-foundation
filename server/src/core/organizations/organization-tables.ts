import { is } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';

import * as schema from '../../database/schema';

/**
 * Tables with an organization_id that the export leaves out (ADR-070),
 * each with its reason. Every other such table is exported whole, so a
 * table added later is in the export without anyone remembering to add it;
 * the e2e coverage test fails on a name here that no longer exists.
 */
export const NOT_EXPORTED = new Map<string, string>([
  [
    'memberships',
    'Exported as members.csv, joined to each member’s name, email and role',
  ],
  ['notifications', 'Each member’s own, in their personal export (ADR-069)'],
  ['recent_records', 'Each member’s own, in their personal export (ADR-069)'],
]);

/**
 * Tables with no organization_id of their own that go with the
 * organization by cascade, through a parent it owns or through the
 * organization itself, and what the export does with each (ADR-070). The
 * e2e coverage test finds every such table in the database and fails on
 * one missing here, so the next table owned through a parent is not left
 * out by accident, as role_permissions nearly was.
 */
export const OWNED_THROUGH_PARENT = new Map<string, string>([
  [
    'role_permissions',
    'Exported as role_permissions.csv, by role name and permission key',
  ],
  [
    'sessions',
    'Not exported: each person’s own sign-ins, moved to their next organization when it is deleted',
  ],
]);

/**
 * Every table the organization owns, by its name in the database, in the
 * order the export writes them: by name, so the archive reads the same
 * every time.
 */
export function organizationTables(): string[] {
  const names: string[] = [];
  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) continue;
    const config = getTableConfig(value);
    if (config.columns.some((column) => column.name === 'organization_id')) {
      names.push(config.name);
    }
  }
  return names.sort();
}

/** The tables the export writes a CSV of, as they are. */
export function exportedTables(): string[] {
  return organizationTables().filter((name) => !NOT_EXPORTED.has(name));
}
