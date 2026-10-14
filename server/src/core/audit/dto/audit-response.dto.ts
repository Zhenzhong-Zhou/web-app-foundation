/**
 * The audit log as the API returns it (ADR-068, ADR-018), described for
 * the OpenAPI document by the CLI plugin.
 */

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
}

/** GET /audit and GET /account/activity: one page, newest first. */
export class AuditPage {
  entries!: AuditRecord[];
  /** Pass as `before` for the next page; null when there is no more. */
  nextCursor!: string | null;
}
