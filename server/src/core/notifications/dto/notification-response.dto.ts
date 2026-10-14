/**
 * The person's notifications as the API returns them (ADR-068, ADR-021),
 * described for the OpenAPI document by the CLI plugin: in the reader's
 * language, and never the message ids they were stored as.
 */

export class Notification {
  id!: string;
  type!: string;
  title!: string;
  body!: string | null;
  /** What it is about, so the bell can link to it. */
  resourceType!: string | null;
  resourceId!: string | null;
  readAt!: Date | null;
  createdAt!: Date;
}

/** GET /notifications: one page, newest first. */
export class NotificationPage {
  entries!: Notification[];
  /** Pass as `before` for the next page; null when there is no more. */
  nextCursor!: string | null;
}

/** GET /notifications/unread-count: what the bell's badge shows. */
export class UnreadCount {
  count!: number;
}
