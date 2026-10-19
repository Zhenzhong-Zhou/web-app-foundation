import type { INestApplicationContext } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { auditPayload, unchanged } from '../core/audit/audit.interceptor';
import { AuditService } from '../core/audit/audit.service';
import { AUDIT_ACTIONS, type AuditAction } from '../core/audit/audit-actions';
import { enterAuditContext } from '../core/audit/audit-context';
import type { Database } from './database.module';

/**
 * What a route's @Audited() would say about one action: the event, the
 * record whose History shows it, and the request fields the route records.
 */
export interface AuditEntry<T> {
  action: AuditAction;
  type: string;
  /** The record, given, or read from what the service returned. */
  id: string | ((result: T) => string);
  /** The request body the screen would have sent, for `fields` to pick. */
  body?: object;
  fields?: readonly string[];
}

export type Audited = <T>(
  actorId: string,
  entry: AuditEntry<T>,
  act: () => Promise<T>,
) => Promise<T>;

/**
 * Runs a service call and writes the audit row its route would have.
 *
 * The seed calls services directly, and the audit log is written by the
 * request interceptor (ADR-018), so without this every History tab, Your
 * activity, a person's recent work and the audit log start empty, and the
 * demo looks unused. The payload is the interceptor's own (auditPayload),
 * and a save that changed nothing writes no row, as AuditInterceptor.write
 * does. No ip or user agent: there was no request.
 */
export function auditor(app: INestApplicationContext): Audited {
  const audit = app.get(AuditService);

  return async <T>(
    actorId: string,
    entry: AuditEntry<T>,
    act: () => Promise<T>,
  ): Promise<T> => {
    enterAuditContext();
    const result = await act();

    const payload = auditPayload(entry.body, entry.fields);
    if (unchanged(payload)) return result;

    await audit.record({
      actorId,
      action: entry.action,
      resourceType: entry.type,
      resourceId: typeof entry.id === 'function' ? entry.id(result) : entry.id,
      payload,
    });
    return result;
  };
}

/** Each kind of record the opening history covers, and its event. */
const OPENINGS: { table: string; type: string; action: AuditAction }[] = [
  {
    table: 'product_licences',
    type: 'product_licence',
    action: AUDIT_ACTIONS.PRODUCT_LICENCE_CREATED,
  },
  {
    table: 'locations',
    type: 'location',
    action: AUDIT_ACTIONS.LOCATION_CREATED,
  },
  {
    table: 'products',
    type: 'product',
    action: AUDIT_ACTIONS.PRODUCT_CREATED,
  },
  {
    table: 'partners',
    type: 'partner',
    action: AUDIT_ACTIONS.PARTNER_CREATED,
  },
  {
    table: 'orders',
    type: 'order',
    action: AUDIT_ACTIONS.ORDER_CREATED,
  },
  {
    table: 'boms',
    type: 'bom',
    action: AUDIT_ACTIONS.BOM_CREATED,
  },
  {
    table: 'production_orders',
    type: 'production_order',
    action: AUDIT_ACTIONS.PRODUCTION_ORDER_CREATED,
  },
  {
    table: 'tax_codes',
    type: 'tax_code',
    action: AUDIT_ACTIONS.TAX_CODE_CREATED,
  },
  {
    table: 'invoices',
    type: 'invoice',
    action: AUDIT_ACTIONS.INVOICE_CREATED,
  },
  {
    table: 'return_authorizations',
    type: 'return_authorization',
    action: AUDIT_ACTIONS.RETURN_AUTHORIZATION_CREATED,
  },
  {
    table: 'credit_notes',
    type: 'credit_note',
    action: AUDIT_ACTIONS.CREDIT_NOTE_ISSUED,
  },
  {
    table: 'price_lists',
    type: 'price_list',
    action: AUDIT_ACTIONS.PRICE_LIST_CREATED,
  },
];

/**
 * A "created" entry, by the demo's Owner, for each record the seed made
 * before the team arrived, oldest first, so no History tab is empty.
 *
 * Only what this run made, by its own start time on the database's clock:
 * seeding an existing organization must not invent history for records a
 * real person made. Creation only, not every step after it, and without
 * the values a route records, which the row no longer holds as they were
 * sent; the team's work (seed-demo-team-work.ts) is recorded in full.
 */
export async function recordOpeningHistory(
  db: Database,
  audited: Audited,
  organizationId: string,
  ownerId: string,
  since: string,
): Promise<number> {
  const union = sql.join(
    OPENINGS.map(
      (opening) => sql`
        select id, ${opening.type}::text as type,
          ${opening.action}::text as action
        from ${sql.identifier(opening.table)}
        where organization_id = ${organizationId}::uuid
          and created_at >= ${since}::timestamptz
      `,
    ),
    sql` union all `,
  );
  const found = await db.execute(sql`${union} order by id`);
  const rows = found.rows as {
    id: string;
    type: string;
    action: AuditAction;
  }[];

  for (const row of rows) {
    await audited(
      ownerId,
      { action: row.action, type: row.type, id: row.id },
      () => Promise.resolve(row),
    );
  }
  return rows.length;
}
