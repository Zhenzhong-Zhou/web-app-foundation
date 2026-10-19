import type { ReferenceKind } from '../audit-references';

/**
 * The audit log as the API returns it (ADR-068, ADR-018), described for
 * the OpenAPI document by the CLI plugin.
 */

/**
 * A kind a reference can link to: every kind but a person, whom the log
 * never names (ADR-038), a record of no stated kind, and a shipment, which
 * links to its order (ADR-076).
 */
export type AuditLinkKind = Exclude<
  ReferenceKind,
  'person' | 'record' | 'shipment'
>;

/** Where a reference links: a kind of record and its id (ADR-076). */
export class AuditLink {
  kind!: AuditLinkKind;
  id!: string;
}

/**
 * One value in words (ADR-076): always its text; a day or a moment also as
 * itself, for the reader's own format and zone; a reference with its link.
 */
export class AuditValue {
  text!: string;
  day?: string | null;
  at?: string | null;
  link?: AuditLink | null;
}

/** One recorded field: its name, and its value or its change. */
export class AuditDetail {
  field!: string;
  changed!: boolean;
  from!: AuditValue | null;
  value!: AuditValue | null;
}

/** One thing someone did. */
export class AuditRecord {
  id!: string;
  action!: string;
  resourceType!: string | null;
  resourceId!: string | null;
  /** What the resource was called then (ADR-038); null on older rows. */
  resourceLabel!: string | null;
  /** What a field was set to, for the routes that name fields (ADR-018). */
  payload!: Record<string, unknown> | null;
  actorId!: string | null;
  /** Null when the actor was anonymised (ADR-012). */
  actorEmail!: string | null;
  actorName!: string | null;
  actorPhotoFileId!: string | null;
  ip!: string | null;
  userAgent!: string | null;
  createdAt!: Date;
  /** The action, in the reader's language (ADR-076). */
  actionName!: string;
  /** The kind of record, in the reader's language; null when none. */
  resourceTypeName!: string | null;
  /** What was recorded, in words, with no ids (ADR-076). */
  details!: AuditDetail[];
}

/** An action that has occurred here, named, for the audit log's filter. */
export class AuditActionName {
  action!: string;
  name!: string;
}

/** GET /audit and GET /account/activity: one page, newest first. */
export class AuditPage {
  entries!: AuditRecord[];
  /** Pass as `before` for the next page; null when there is no more. */
  nextCursor!: string | null;
}
