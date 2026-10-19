import type { TenantDb } from '../../database/tenant-db.service';
import { resolveLabel, resolveShipment } from './audit-labels';

/**
 * What a reference in a payload points at, by the key it is recorded
 * under (ADR-076). The kind is the resolver's in audit-labels.ts.
 *
 * `person` has no resolver, deliberately (ADR-038): a filter on a person
 * keeps its id and no name, so the log never names someone the user row
 * has since anonymised. `record` is a filter on any record, whose kind the
 * filter does not say.
 */
export const REFERENCE_KINDS = {
  orderId: 'order',
  // The replacement order an RMA raised, in its context.
  order: 'order',
  invoiceId: 'invoice',
  taxCodeId: 'tax_code',
  shipmentId: 'shipment',
  returnId: 'order_return',
  roleId: 'role',
  deliverToId: 'location',
  sendBackToId: 'location',
  defaultSalePriceListId: 'price_list',
  // In an RMA's lines, and in a list's export filters.
  lineId: 'order_line',
  partnerId: 'partner',
  locationId: 'location',
  variantId: 'variant',
  productId: 'product',
  lotId: 'lot',
  actorId: 'person',
  resourceId: 'record',
} as const;

export type ReferenceKind =
  (typeof REFERENCE_KINDS)[keyof typeof REFERENCE_KINDS];

/** A reference as the log keeps it: the id for a link, the name it had. */
export interface NamedReference {
  id: string;
  label: string | null;
  /** A shipment's order, which it links to, having no page (ADR-076). */
  orderId?: string | null;
}

export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A `{ from, to }` change, as ADR-018 records one, and nothing else. */
export function isChange(
  value: unknown,
): value is { from: unknown; to: unknown } {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === 2 &&
    'from' in value &&
    'to' in value
  );
}

/**
 * An object of fields, which may hold references: not an array, and not a
 * value that serializes as itself, such as a moment's Date, which has no
 * keys of its own and would otherwise be recorded as `{}`.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

async function name(
  db: TenantDb,
  kind: ReferenceKind,
  value: unknown,
): Promise<unknown> {
  if (typeof value !== 'string' || !UUID.test(value)) return value;
  if (kind === 'shipment') {
    const shipment = await resolveShipment(db, value);
    return {
      id: value,
      label: shipment?.label ?? null,
      orderId: shipment?.orderId ?? null,
    } satisfies NamedReference;
  }
  const label = await resolveLabel(db, kind, value);
  return { id: value, label: label ?? null } satisfies NamedReference;
}

async function named(
  db: TenantDb,
  key: string | null,
  value: unknown,
): Promise<unknown> {
  const kind =
    key !== null && key in REFERENCE_KINDS
      ? REFERENCE_KINDS[key as keyof typeof REFERENCE_KINDS]
      : null;

  if (isChange(value)) {
    return {
      from: await named(db, key, value.from),
      to: await named(db, key, value.to),
    };
  }
  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => named(db, key, item)));
  }
  if (isPlainObject(value)) {
    return nameReferences(db, value);
  }
  return kind ? name(db, kind, value) : value;
}

/**
 * Each reference in a payload with the name its record has now, as the
 * row is written (ADR-076): ADR-038's snapshot, reaching the details.
 * Both sides of a `{ from, to }` are named, and so are references inside a
 * list's lines and an export's filters. A shipment keeps its order's id
 * beside its own, to link to its order. A reference that names nothing
 * keeps its id with a null label, read as its kind in words; a failed
 * lookup never costs the row, as resolveLabel never throws.
 */
export async function nameReferences(
  db: TenantDb,
  payload: Record<string, unknown> | undefined,
): Promise<Record<string, unknown> | undefined> {
  if (!payload) return payload;
  const entries = await Promise.all(
    Object.entries(payload).map(
      async ([key, value]) => [key, await named(db, key, value)] as const,
    ),
  );
  return Object.fromEntries(entries);
}
